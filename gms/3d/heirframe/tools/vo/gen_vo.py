"""Generate HEIRFRAME voice clips from story.json (docs/VO_LINES.md) and script.json (extra robot barks).

  python3 gen_vo.py                 # new or changed lines only
  python3 gen_vo.py sec_halt n_01   # regenerate these keys (even if unchanged)
  python3 gen_vo.py --voice pa      # regenerate everything for one voice
  python3 gen_vo.py --max-p P1      # include P1 lines from VO_LINES (default P0 only)
  python3 gen_vo.py --qc            # re-measure every clip on disk, no generation
Run import_lines.py first when docs/VO_LINES.md changes.
Writes audio/vo/<key>.mp3 and audio/vo/manifest.json (key -> text, voice, file, duration, ...).
"""
import hashlib, json, os, subprocess, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tts, qc

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, '..', '..', 'audio', 'vo'))
MF = os.path.join(OUT, 'manifest.json')
RETRY_SEEDS = [42, 1234, 777]


def load(p, d=None):
    p = os.path.join(HERE, p)
    return json.load(open(p)) if os.path.exists(p) else d


def cast():
    c = load('cast.json', {})
    c.update(load('cast_story.json', {}))
    return c


def lines(max_p='P0'):
    """key -> (voice, text). story.json (VO_LINES, filtered by priority) first, then script.json extras."""
    out = {}
    story = (load('story.json', {}) or {}).get('lines', {})
    for key, e in sorted(story.items(), key=lambda kv: kv[1]['p']):
        if e['p'] <= max_p:
            out[key] = (e['voice'], e['text'])
    for voice, group in (load('script.json', {}) or {}).items():
        if voice.startswith('_'):
            continue
        for key, text in group.items():
            out[key] = (voice, text)
    return out


def encode(wav, mp3, fx):
    trim = ('silenceremove=start_periods=1:start_threshold=-50dB,areverse,'
            'silenceremove=start_periods=1:start_threshold=-50dB,areverse,apad=pad_dur=0.12')
    chain = [f for f in [trim, fx, 'loudnorm=I=-16:TP=-1.5'] if f]
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-af', ','.join(chain),
                    '-ac', '1', '-ar', '24000', '-b:a', '48k', mp3], check=True)


def resolve(voice, C, V):
    """Saved voice + settings + fx for a cast id; aliases (clone_of) reuse another voice."""
    c = C.get(voice, {})
    base = c.get('clone_of', voice)
    if base not in V:
        return None
    v = V[base]
    st = dict(v['settings'])
    if 'speed' in c:
        st['speed'] = c['speed']
    return v, st, c.get('fx', '')


def sig(text, v, st, fx):
    return hashlib.sha1(f"{text}|{v['id']}|{st.get('speed', 1)}|{fx}".encode()).hexdigest()[:12]


def main():
    args = sys.argv[1:]
    max_p = args[args.index('--max-p') + 1] if '--max-p' in args else 'P0'
    C, V, L = cast(), load('voices.json', {}), lines(max_p)
    mf = json.load(open(MF)) if os.path.exists(MF) else {}
    if '--qc' in args:
        bad = 0
        for k, e in sorted(mf.items()):
            m = qc.measure(os.path.join(OUT, e['file']))
            probs, ratio = qc.verdict(e['text'], m)
            e['duration'] = m['duration']; e['qc'] = probs
            if probs:
                bad += 1; print('FLAG', k, m['duration'], ratio, probs)
        json.dump(mf, open(MF, 'w'), indent=1, ensure_ascii=False)
        print(f'{len(mf)} clips, {bad} flagged'); return
    only_voice = args[args.index('--voice') + 1] if '--voice' in args else None
    only = {a for a in args if not a.startswith('--') and a not in (only_voice, max_p)}
    os.makedirs(OUT, exist_ok=True)
    made = skipped = 0
    for key, (voice, text) in L.items():
        if only and key not in only: continue
        if only_voice and voice != only_voice: continue
        r = resolve(voice, C, V)
        if not r:
            print('no saved voice for', voice, '- run design.py'); continue
        v, st, fx = r
        fn = f'{key}.mp3'
        h = sig(text, v, st, fx)
        if not only and not only_voice and key in mf and mf[key].get('sig') == h and os.path.exists(os.path.join(OUT, fn)):
            skipped += 1; continue
        best = None
        for seed in RETRY_SEEDS:
            wav = os.path.join(HERE, 'scratch', f'{key}.wav')
            tmp = os.path.join(HERE, 'scratch', f'{key}_{seed}.mp3')
            jid, s = tts.gen(dict(st, seed=seed), text, wav)
            encode(wav, tmp, fx)
            probs, ratio = qc.verdict(text, qc.measure(tmp))
            score = (len(probs), abs(1 - ratio))
            if best is None or score < best[0]:
                best = (score, seed, jid, tmp, ratio, probs)
            if not probs: break
            print(f'  retry {key} (seed {seed}): {probs}', flush=True)
        _, seed, jid, tmp, ratio, probs = best
        os.replace(tmp, os.path.join(OUT, fn))
        m = qc.measure(os.path.join(OUT, fn))
        mf[key] = dict(text=text, voice=voice, voice_name=v['name'], file=fn, duration=m['duration'],
                       seed=seed, job_id=jid, sig=h, qc=qc.verdict(text, m)[0])
        json.dump(mf, open(MF, 'w'), indent=1, ensure_ascii=False)
        made += 1
        print(f'{key:24s} {m["duration"]:5.2f}s x{ratio} {probs or ""}', flush=True)
    print(f'DONE made {made}, skipped {skipped}, total {len(mf)}')


if __name__ == '__main__':
    main()
