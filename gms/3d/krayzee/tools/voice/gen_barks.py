"""Render radio barks with the saved Krayzee voices.

Reads data/barks/script.json — {"lines": [...]} or a bare list of
  {id, voice, intent, text, delivery, maxSeconds, callsign?, rwy?, tier?}
`voice` is a roster id, a list of ids, or "*" / "pilots" / "towers" to fan one line out to every such voice.
Writes audio/voices/<voice>/<id>.mp3 and audio/voices/barks.json:
  {"<voice>": {"<id>": {file, duration, text, intent, ...}}}      file is relative to audio/voices/

Sentence lines: up to 4 seeds; a take is accepted as soon as Whisper agrees (WER <= 0.25) and it fits maxSeconds.
Otherwise the best take wins, sped up (pitch-preserving, <= 1.25x) to fit, and is flagged if it still misses.
Splice lines (intent splice_title / splice_digit): the clone returns nothing or a mangled word for one-word text, so
the words are read as short lists ("Zero, one, two, three, four, five, and so on.") and cut out at Whisper's word
timestamps snapped to the pause; every cut is re-transcribed on its own and the chunk retried on another seed if one fails. The list read also gives the level, non-final intonation a splice needs.

Resumable: a line is skipped when its mp3 exists and barks.json holds the same text + voiceId.
  gen_barks.py [--voice toff,bubba] [--only id1,id2] [--intent splice_digit] [--limit N] [--dry-run] [--redo] [--kbps 48]
Python: ~/.cache/krayzee-asr/bin/python"""
import argparse, difflib, json, os, shutil, sys, time
import numpy as np
from vocommon import *

R = json.load(open(os.path.join(H, 'roster.json')))
OUT_JSON = os.path.join(VOICES, 'barks.json')
# The model reads spelling, not intent. Whisper hears the sound, so the ASR reference uses the spoken form too.
SAY = {'Krayzee': 'Crazy', 'KRAYZEE': 'CRAZY', 'krayzee': 'crazy'}
WER_OK = 0.25
SEEDS = [1, 2, 3, 4]
SPLICE = ('splice_title', 'splice_digit')


def spoken(text):
    for a, b in SAY.items():
        text = text.replace(a, b)
    return text[:1].upper() + text[1:]


def expand(voice):
    if isinstance(voice, list):
        return voice
    if voice in ('*', 'all'):
        return list(R)
    if voice in ('pilots', 'pilot'):
        return [k for k in R if R[k]['kind'] == 'pilot']
    if voice in ('towers', 'tower'):
        return [k for k in R if R[k]['kind'] == 'tower']
    return [voice]


def load_script(path):
    s = json.load(open(path))
    lines = s['lines'] if isinstance(s, dict) else s
    return [(v, l) for l in lines for v in expand(l['voice'])]


def entry(v, l, M, out, **kw):
    du = dur(out)
    e = dict(file=f"{v}/{l['id']}.mp3", duration=round(du, 2), text=l['text'], intent=l.get('intent'),
             maxSeconds=float(l.get('maxSeconds') or 4.0), bytes=os.path.getsize(out), voiceId=M[v]['voiceId'], **kw)
    for k in ('callsign', 'rwy', 'tier'):
        if k in l:
            e[k] = l[k]
    flags = e.pop('flags', [])
    if du > e['maxSeconds'] + 0.02:
        flags.append('long')
    if flags:
        e['flags'] = flags
    return e


def render(v, l, M, B, kbps):
    st = M[v]['clone']
    text = spoken(l['text'])
    cap = float(l.get('maxSeconds') or 4.0)
    d = f'{SCR}/barks/{v}'
    os.makedirs(d, exist_ok=True); os.makedirs(f'{VOICES}/{v}', exist_ok=True)
    takes = []
    for seed in SEEDS:
        wav = f"{d}/{l['id']}_s{seed}.wav"
        try:
            jid, wall = tts(dict(st, seed=seed), text, wav)
        except RuntimeError as e:
            print(v, l['id'], 'take failed', seed, e, flush=True); continue
        tmp = f"{d}/{l['id']}_s{seed}.mp3"
        du = post(wav, tmp, kbps=kbps)
        hyp = asr(tmp); w = wer(text, hyp)
        sc = 4 * w + max(0, du - cap) * 1.5
        takes.append(dict(seed=seed, wall=round(wall, 1), dur=round(du, 2), wer=round(w, 3), asr=hyp, score=round(sc, 3), file=tmp, wav=wav))
        print(f"  {v}/{l['id']} s{seed} {du:.2f}s/{cap}s wer={w:.2f} wall={wall:.1f}s | {hyp}", flush=True)
        if w <= WER_OK and du <= cap:
            break
    if not takes:
        return None
    best = min(takes, key=lambda t: t['score'])
    out = f"{VOICES}/{v}/{l['id']}.mp3"
    tempo = 1.0
    if best['dur'] > cap:
        tempo = min(1.25, best['dur'] / (cap - 0.05))
        post(best['wav'], out, kbps=kbps, tempo=tempo)
    else:
        shutil.copy(best['file'], out)
    e = entry(v, l, M, out, seed=best['seed'], tempo=round(tempo, 3), wer=best['wer'], asr=best['asr'], takes=len(takes),
              flags=['wer'] if best['wer'] > WER_OK else [])
    B.setdefault(v, {})[l['id']] = e
    return e


CHUNK = 6  # a 23-word list read ran words together with no gaps; short lists keep a pause after every comma


def _snap(x, t, lo, hi):
    """Move cut time t to the quietest 20 ms frame within [lo, hi] (seconds) of the 16 kHz signal x."""
    sr, fr = 16000, 320
    i0, i1 = max(0, int(lo * sr)), min(len(x) - fr, int(hi * sr))
    if i1 <= i0:
        return t
    best = min(range(i0, i1, 80), key=lambda i: float(np.mean(x[i:i + fr] ** 2)))
    return (best + fr / 2) / sr


def _try_chunk(v, items, st, seed, tag, kbps):
    d = f'{SCR}/barks/{v}'
    carrier = ', '.join(items) + ', and so on.'
    wav = f'{d}/{tag}_s{seed}.wav'
    tts(dict(st, seed=seed), carrier, wav)
    nwav = f'{d}/{tag}_s{seed}.norm.wav'
    post(wav, nwav)  # normalise the whole read once; a 0.4 s cut is too short for loudnorm to measure
    words = asr_words(nwav)
    want = [norm_words(t) for t in items]
    flat = [w for ws in want for w in ws]
    sm = difflib.SequenceMatcher(a=flat, b=[w[0] for w in words], autojunk=False)
    pos = {}
    for a, b, n in sm.get_matching_blocks():
        for i in range(n):
            pos[a + i] = words[b + i]
    spans, i = [], 0
    for ws in want:
        got = [pos[j] for j in range(i, i + len(ws)) if j in pos]
        i += len(ws)
        spans.append((got[0][1], got[-1][2]) if got else None)
    x = load_pcm(nwav); total = len(x) / 16000
    cuts = []
    for j, sp in enumerate(spans):
        if not sp:
            cuts.append(None); continue
        # Whisper word edges overlap their neighbours: cut at the quietest point of the gap, never past its middle.
        prev = next((spans[q][1] for q in range(j - 1, -1, -1) if spans[q]), None)
        nxt = next((spans[q][0] for q in range(j + 1, len(spans)) if spans[q]), None)
        a = (prev + sp[0]) / 2 if prev is not None else max(0, sp[0] - 0.08)
        b = (sp[1] + nxt) / 2 if nxt is not None else min(total, sp[1] + 0.12)
        a = _snap(x, a, a - 0.12, min(sp[0] + 0.05, a + 0.12))
        b = _snap(x, b, max(sp[1] - 0.05, b - 0.12), b + 0.12)
        out = f'{d}/{tag}_s{seed}_{j}.mp3'
        sh('ffmpeg', '-y', '-loglevel', 'error', '-i', nwav, '-ss', f'{a:.3f}', '-to', f'{b:.3f}', '-af',
           'silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,'
           'areverse,afade=t=in:d=0.006,areverse,afade=t=in:d=0.02,areverse', '-ac', '1', '-ar', '24000', '-b:a', f'{kbps}k', out)
        hyp = asr(out); w = wer(items[j], hyp)  # a lone word re-heard on its own catches a cut that bled or clipped
        cuts.append(dict(file=out, cut=[round(a, 3), round(b, 3)], wer=round(w, 3), asr=hyp))
    bad = sum(1 for c in cuts if not c or c['wer'] > 0.5)
    print(f'  {v} {tag} s{seed}: {len(items) - bad}/{len(items)} clean | {" ".join(w[0] for w in words)}', flush=True)
    return bad, cuts, carrier


def render_splices(v, group, M, B, kbps):
    """Short list reads per (voice, intent); each item cut out at its Whisper word timestamps, snapped to the pause."""
    st = M[v]['clone']
    os.makedirs(f'{SCR}/barks/{v}', exist_ok=True); os.makedirs(f'{VOICES}/{v}', exist_ok=True)
    n = 0
    for c0 in range(0, len(group), CHUNK):
        chunk = group[c0:c0 + CHUNK]
        items = [spoken(l['text']).rstrip('.,') for l in chunk]
        tag = f"{chunk[0]['intent']}_{c0 // CHUNK}"
        best = None
        for seed in SEEDS:
            try:
                bad, cuts, carrier = _try_chunk(v, items, st, seed, tag, kbps)
            except RuntimeError as e:
                print(v, tag, 'take failed', e, flush=True); continue
            if best is None or bad < best[0]:
                best = (bad, seed, cuts, carrier)
            if bad == 0:
                break
        if best is None:
            continue
        _, seed, cuts, carrier = best
        for l, c in zip(chunk, cuts):
            if not c:
                print(v, l['id'], 'NOT FOUND in list read', flush=True); continue
            out = f"{VOICES}/{v}/{l['id']}.mp3"
            shutil.copy(c['file'], out)
            B.setdefault(v, {})[l['id']] = entry(v, l, M, out, seed=seed, cut=c['cut'], carrier=carrier, wer=c['wer'],
                                                 asr=c['asr'], flags=['wer'] if c['wer'] > 0.5 else [])
            n += 1
    return n


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--script', default=os.path.join(ROOT, 'data/barks/script.json'))
    ap.add_argument('--voice'); ap.add_argument('--only'); ap.add_argument('--intent'); ap.add_argument('--limit', type=int)
    ap.add_argument('--kbps', type=int, default=48)
    ap.add_argument('--dry-run', action='store_true'); ap.add_argument('--redo', action='store_true')
    a = ap.parse_args()
    if not os.path.exists(a.script):
        sys.exit(f'no script at {a.script}')
    M = jload(MANIFEST, {}); B = jload(OUT_JSON, {})
    jobs = load_script(a.script)
    for flag, key in ((a.voice, 0), (a.only, 'id'), (a.intent, 'intent')):
        if flag:
            keep = set(flag.split(','))
            jobs = [j for j in jobs if (j[0] if key == 0 else j[1].get(key)) in keep]
    todo = []
    for v, l in jobs:
        if not M.get(v, {}).get('voiceId'):
            print('no saved voice for', v, '- skipping', l['id']); continue
        e = B.get(v, {}).get(l['id'])
        if not a.redo and e and e['text'] == l['text'] and e.get('voiceId') == M[v]['voiceId'] and os.path.exists(f"{VOICES}/{v}/{l['id']}.mp3"):
            continue
        todo.append((v, l))
    if a.limit:
        todo = todo[:a.limit]
    groups = {}
    for v, l in todo:
        if l.get('intent') in SPLICE:
            groups.setdefault((v, l['intent']), []).append(l)
    singles = [(v, l) for v, l in todo if l.get('intent') not in SPLICE]
    print(f'{len(jobs)} lines selected, {len(singles)} sentences + {sum(map(len, groups.values()))} splice words to render', flush=True)
    if a.dry_run:
        for v, l in todo: print(' ', v, l['id'], '|', l['text'])
        return
    t0 = time.time()
    for (v, intent), g in groups.items():
        n = render_splices(v, g, M, B, a.kbps)
        jsave(OUT_JSON, B)
        print(f'{v} {intent}: {n}/{len(g)} cut', flush=True)
    for i, (v, l) in enumerate(singles):
        e = render(v, l, M, B, a.kbps)
        jsave(OUT_JSON, B)
        print(f"[{i + 1}/{len(singles)}] {v}/{l['id']}", 'FAILED' if not e else f"{e['duration']}s x{e['tempo']} {e.get('flags', '')}", flush=True)
    bad = [(v, k) for v in B for k, e in B[v].items() if e.get('flags')]
    print(f'done in {time.time() - t0:.0f}s; flagged: {len(bad)}', bad[:20])


if __name__ == '__main__':
    main()
