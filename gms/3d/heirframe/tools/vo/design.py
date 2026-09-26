"""Design a voice per cast entry and save it in Qwen Voice Studio as a clone voice.

  python3 design.py              # every cast entry not yet in voices.json
  python3 design.py broker pa    # (re)design just these
Candidates are scored on duration-vs-text, loudness and a crude pitch range (cast f0); the best is saved.
"""
import json, math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tts, qc

HERE = os.path.dirname(os.path.abspath(__file__))
CAST_FILES = [os.path.join(HERE, 'cast.json'), os.path.join(HERE, 'cast_story.json')]
VOICES = os.path.join(HERE, 'voices.json')
SEEDS = [11, 42, 7, 99, 2024]


def load_cast():
    cast = {}
    for p in CAST_FILES:
        if os.path.exists(p):
            cast.update(json.load(open(p)))
    return cast


def design(cid, c):
    best = None
    for seed in SEEDS:
        st = dict(mode='design', speaker='Ryan', language='English', instruct=c['instruct'],
                  temperature=0.9, top_p=1.0, top_k=50, repetition_penalty=1.05, speed=1, seed=seed)
        wav = os.path.join(HERE, 'scratch', f'design_{cid}_{seed}.wav')
        jid, s = tts.gen(st, c['ref'], wav)
        m = qc.measure(wav)
        probs, ratio = qc.verdict(c['ref'], m)
        hz = qc.f0(wav)
        lo, hi = c.get('f0', [0, 9999])
        miss = 0 if lo <= hz <= hi else abs(math.log2(max(hz, 1) / (lo if hz < lo else hi)))
        if miss: probs.append(f'f0 {hz}Hz not in {lo}-{hi}')
        score = abs(1 - ratio) + 3 * len(probs) + 6 * miss
        ok = 3 <= s['duration'] <= 30
        print(f'  {cid} seed {seed}: {s["duration"]:.1f}s x{ratio} {m["mean_db"]}dB f0 {hz} {probs}', flush=True)
        if ok and (best is None or score < best[0]):
            best = (score, seed, jid, st, hz)
        if ok and not probs and abs(1 - ratio) < 0.35:
            break
    if not best:
        raise RuntimeError(f'no usable design take for {cid}')
    _, seed, jid, st, hz = best
    v = tts.req('/api/voices', dict(name=c['name'], notes='Designed for HEIRFRAME (yru gms/3d/heirframe). ' + c['instruct'],
                                    settings=st, job_id=jid, preserve_voice=True))
    v['design_seed'] = seed
    v['f0'] = hz
    return v


def main():
    cast = load_cast()
    voices = json.load(open(VOICES)) if os.path.exists(VOICES) else {}
    only = sys.argv[1:]
    existing = {v['name']: v for v in tts.req('/api/voices')}
    for cid, c in cast.items():
        if 'clone_of' in c or (only and cid not in only):
            continue
        if not only and cid in voices:
            continue
        if not only and c['name'] in existing:
            voices[cid] = existing[c['name']]
            print('reusing saved', c['name'])
        else:
            print('designing', cid, flush=True)
            voices[cid] = design(cid, c)
        json.dump(voices, open(VOICES, 'w'), indent=1, ensure_ascii=False)
    print('voices:', ', '.join(voices))


if __name__ == '__main__':
    main()
