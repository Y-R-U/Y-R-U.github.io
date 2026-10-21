"""Krayzee voice roster pipeline (Qwen Voice Studio, design mode -> saved clone voice).

  design   [id..]       audition designs per voice, score them, save the best as "Krayzee · <id>"
  sample   [id..]       render the <=4 s picker sample with the saved voice -> audio/voices/<id>/sample.mp3
  promote  <id> <tag>   make a kept alternate (e.g. s23, fr23) the voice, then re-run `sample <id>`
  report                print the manifest as a table

Python: ~/.cache/krayzee-asr/bin/python (faster-whisper + numpy). See docs/VOICES.md."""
import json, os, shutil, sys, time
from vocommon import *

R = json.load(open(os.path.join(H, 'roster.json')))
SEEDS = [11, 23, 37]
ALT_SEEDS = [11, 23]
SAMPLE_DATA = os.path.join(ROOT, 'data/voices.json')


def sample_line(k):
    """DESIGN lane's data/voices.json wins when it has a sample for this id."""
    d = jload(SAMPLE_DATA, None)
    if isinstance(d, dict) and ('pilots' in d or 'towers' in d):
        d = {**(d.get('pilots') or {}), **(d.get('towers') or {})}
    elif isinstance(d, dict) and 'voices' in d:
        d = d['voices']
    e = d.get(k) if isinstance(d, dict) else next((x for x in d or [] if isinstance(x, dict) and x.get('id') == k), None)
    if isinstance(e, dict) and e.get('sample'):
        return e['sample'], 'data/voices.json'
    return R[k]['sample'], 'roster.json'


def score_take(k, text, wav):
    c = R[k]
    hyp = asr(wav); w = wer(text, hyp)
    f0, spread = f0_stats(load_pcm(wav))
    d = dur(wav); lu, pk = loudness(wav)
    lo, hi = c['f0']
    pen = 0 if lo <= f0 <= hi else min(abs(f0 - lo), abs(f0 - hi)) / 8
    if f0 > 0:  # mild pull to the middle of the range so near-edge takes lose ties
        pen += 0.04 * abs(12 * np.log2(f0 / (lo * hi) ** 0.5))
    s = w * 4 + pen - min(spread, 4) * 0.1 + (0 if 3 <= d <= 30 else 9) + (3 if lu < -40 else 0)
    r = dict(wer=round(w, 3), asr=hyp, f0=round(f0), spread=round(spread, 2), dur=round(d, 2), lufs=round(lu, 1), peak=round(pk, 1))
    if c.get('accent_lang'):
        lp = lang_probs(wav)
        r['lang'] = lp
        acc = lp.get(c['accent_lang'], 0)
        s -= 3 * min(acc, 0.5)
        r['accent_p'] = acc
    r['score'] = round(s, 3)
    return r


LOG = os.path.join(H, 'design_log.json')


def in_range(k, f0):
    lo, hi = R[k]['f0']
    return lo <= f0 <= hi


def design(ids, force=False):
    M = jload(MANIFEST, {}); L = jload(LOG, {})
    for k in ids:
        c = R[k]
        if M.get(k, {}).get('voiceId'):
            print(k, 'already saved', flush=True); continue
        os.makedirs(f'{SCR}/design', exist_ok=True); os.makedirs(f'{VOICES}/{k}', exist_ok=True)
        plan = [(f's{s}', 'English', s, c['audition']) for s in SEEDS]
        if c.get('alt_language'):
            plan += [(f"{c['accent_lang']}{s}", c['alt_language'], s, c['audition']) for s in ALT_SEEDS]
        if c.get('audition_alt'):  # accent written into the spelling, so the clone reference carries it
            plan += [(f'ph{s}', 'English', s, c['audition_alt']) for s in SEEDS]
        cands = []
        for tag, lang, seed, text in plan:
            st = dict(mode='design', speaker='Ryan', language=lang, instruct=c['design'], temperature=0.9,
                      top_p=1.0, top_k=50, repetition_penalty=1.05, speed=1, seed=seed)
            wav = f'{SCR}/design/{k}_{tag}.wav'
            try:
                jid, wall = tts(st, text, wav)
            except RuntimeError as e:
                print(k, tag, 'FAILED', e, flush=True); continue
            r = dict(tag=tag, seed=seed, language=lang, job=jid, wall=round(wall, 1), text=text, **score_take(k, text, wav))
            if c.get('prefer_alt') and tag.startswith('ph'):
                r['score'] = round(r['score'] - 1, 3)
            cands.append(r)
            print(k, tag, f"wer={r['wer']:.2f} f0={r['f0']} [{c['f0'][0]}-{c['f0'][1]}] spread={r['spread']} dur={r['dur']} "
                  f"lufs={r['lufs']} acc={r.get('accent_p', '-')} score={r['score']} wall={r['wall']}s | {r['asr']}", flush=True)
        if not cands:
            print(k, 'NO CANDIDATES', flush=True); continue
        cands.sort(key=lambda x: x['score'])
        best = cands[0]
        L.setdefault(k, []).append(dict(at=time.strftime('%Y-%m-%d %H:%M'), design=c['design'], candidates=cands))
        jsave(LOG, L)
        if not force and (best['wer'] > 0.2 or not in_range(k, best['f0'])):
            print(k, 'NOT SAVED: best', best['tag'], 'wer', best['wer'], 'f0', best['f0'], '- revise the design or pass --force', flush=True)
            continue
        st = dict(mode='design', speaker='Ryan', language=best['language'], instruct=c['design'], temperature=0.9,
                  top_p=1.0, top_k=50, repetition_penalty=1.05, speed=1, seed=best['seed'])
        v = http(TTS + '/api/voices', dict(name=f'Krayzee · {k}', notes=f"Kingdom of Krayzee: {c['label']}. Design {best['tag']}.",
                                          settings=st, job_id=best['job'], preserve_voice=True))
        for i, cd in enumerate(cands[:2]):
            post(f"{SCR}/design/{k}_{cd['tag']}.wav", f"{VOICES}/{k}/design_{cd['tag']}.mp3", kbps=48)
            cd['kept'] = f"design_{cd['tag']}.mp3"
        M[k] = dict(voiceId=v['id'], name=v['name'], label=c['label'], kind=c['kind'], design=c['design'], seed=best['seed'],
                    language=best['language'], pick=best['tag'], audition=best['text'], referenceId=v['settings']['reference_id'],
                    clone=v['settings'], candidates=cands)
        jsave(MANIFEST, M)
        print(k, 'SAVED', v['id'], 'pick', best['tag'], flush=True)


def sample(ids, cap=4.0):
    M = jload(MANIFEST, {})
    for k in ids:
        m = M[k]
        text, src = sample_line(k)
        os.makedirs(f'{SCR}/sample', exist_ok=True)
        takes = []
        for seed in [1, 2, 3]:
            wav = f'{SCR}/sample/{k}_{seed}.wav'
            jid, wall = tts(dict(m['clone'], seed=seed), text, wav)
            tmp = f'{SCR}/sample/{k}_{seed}.mp3'
            d = post(wav, tmp)
            hyp = asr(tmp); w = wer(text, hyp)
            f0, _ = f0_stats(load_pcm(tmp))
            lo, hi = R[k]['f0']
            pen = 0 if lo <= f0 <= hi else min(abs(f0 - lo), abs(f0 - hi)) / 8
            sc = 4 * w + max(0, d - cap) * 1.5 + pen
            takes.append(dict(seed=seed, job=jid, wall=round(wall, 1), dur=round(d, 2), wer=round(w, 3), asr=hyp, f0=round(f0), score=round(sc, 3), file=tmp))
            print(k, 'sample', seed, f'{d:.2f}s wer={w:.2f} f0={f0:.0f} wall={wall:.1f}s | {hyp}', flush=True)
            if w == 0 and d <= cap:
                break
        best = min(takes, key=lambda t: t['score'])
        out = f'{VOICES}/{k}/sample.mp3'
        tempo = 1.0
        if best['dur'] > cap:
            tempo = min(1.25, best['dur'] / (cap - 0.05))
            post(f"{SCR}/sample/{k}_{best['seed']}.wav", out, tempo=tempo)
        else:
            shutil.copy(best['file'], out)
        lu, pk = loudness(out)
        m['sample'] = dict(text=text, source=src, seed=best['seed'], dur=round(dur(out), 2), tempo=round(tempo, 3), wer=best['wer'],
                           asr=best['asr'], lufs=round(lu, 1), peak=round(pk, 1), bytes=os.path.getsize(out),
                           takes=[{x: t[x] for x in ('seed', 'dur', 'wer', 'asr', 'f0', 'wall')} for t in takes])
        jsave(MANIFEST, M)
        print(k, 'SAMPLE', m['sample']['dur'], 's', f'x{tempo:.2f}' if tempo != 1 else '', flush=True)


def promote(k, tag):
    """Save candidate <tag> as the voice: from the manifest, or from the latest design_log run if never saved."""
    M = jload(MANIFEST, {})
    if k not in M:
        c = R[k]; run = jload(LOG, {})[k][-1]
        M[k] = dict(label=c['label'], kind=c['kind'], design=run['design'], candidates=run['candidates'])
        for i, cd in enumerate(sorted(run['candidates'], key=lambda x: x['score'])[:2]):
            post(f"{SCR}/design/{k}_{cd['tag']}.wav", f"{VOICES}/{k}/design_{cd['tag']}.mp3", kbps=48)
            cd['kept'] = f"design_{cd['tag']}.mp3"
    m = M[k]
    cd = next(c for c in m['candidates'] if c['tag'] == tag)
    if not cd.get('kept'):
        post(f"{SCR}/design/{k}_{tag}.wav", f"{VOICES}/{k}/design_{tag}.mp3", kbps=48)
        cd['kept'] = f'design_{tag}.mp3'
    st = dict(mode='design', speaker='Ryan', language=cd['language'], instruct=m['design'], temperature=0.9,
              top_p=1.0, top_k=50, repetition_penalty=1.05, speed=1, seed=cd['seed'])
    v = http(TTS + '/api/voices', dict(name=f'Krayzee · {k}', notes=f'Kingdom of Krayzee: {m["label"]}. Promoted {tag}.',
                                      settings=st, job_id=cd['job'], preserve_voice=True))
    m.update(voiceId=v['id'], name=v['name'], seed=cd['seed'], language=cd['language'], pick=tag, audition=cd.get('text', R[k]['audition']), referenceId=v['settings']['reference_id'], clone=v['settings'])
    jsave(MANIFEST, M)
    print(k, 'now', tag, v['id'], '- run: sample', k)


def repost():
    """Re-encode kept design takes and samples from the scratch WAVs (no GPU)."""
    M = jload(MANIFEST, {})
    for k in R:
        m = M.get(k)
        if not m: continue
        for cd in m['candidates']:
            if cd.get('kept'):
                post(f"{SCR}/design/{k}_{cd['tag']}.wav", f"{VOICES}/{k}/{cd['kept']}", kbps=48)
        s = m.get('sample')
        if s:
            out = f'{VOICES}/{k}/sample.mp3'
            post(f"{SCR}/sample/{k}_{s['seed']}.wav", out, tempo=s['tempo'])
            lu, pk = loudness(out)
            s.update(dur=round(dur(out), 2), lufs=round(lu, 1), peak=round(pk, 1), bytes=os.path.getsize(out))
            print(k, s['dur'], lu, pk)
    jsave(MANIFEST, M)


def report():
    M = jload(MANIFEST, {})
    for k in R:
        m = M.get(k)
        if not m: print(f'{k:14} -'); continue
        b = next(c for c in m['candidates'] if c['tag'] == m['pick'])
        s = m.get('sample', {})
        print(f"{k:14} {m['pick']:5} wer={b['wer']:.2f} f0={b['f0']:4} acc={b.get('accent_p', '-')!s:6} "
              f"sample={s.get('dur', '-')}s wer={s.get('wer', '-')} {s.get('bytes', 0)//1024}KB")


if __name__ == '__main__':
    cmd, args = sys.argv[1], sys.argv[2:]
    if cmd == 'promote': promote(*args)
    elif cmd == 'report': report()
    elif cmd == 'repost': repost()
    elif cmd == 'design':
        force = '--force' in args; args = [a for a in args if a != '--force']
        design(args or list(R), force)
    else: sample(args or list(R))
