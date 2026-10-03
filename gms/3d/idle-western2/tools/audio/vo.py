"""Voice pipeline (Qwen Voice Studio :7876).
  vo.py design [char..]   audition 3 designs per char, score (ASR + pitch fit), save the best as a clone voice
  vo.py render [char..]   render every line/wordless with the saved clone, 2-4 takes, keep the best
Python: a venv with faster-whisper numpy soundfile scipy (see docs/AUDIO.md)."""
import json, os, sys, time, shutil, subprocess
from common import *

S = json.load(open(os.path.join(H, 'script.json')))
VJ = os.path.join(H, 'voices.json')
LOG = os.path.join(H, 'vo_log.json')
OUT = os.path.join(ROOT, 'audio/vo')
F0 = {'mabel': (130, 215), 'pickles': (95, 190), 'pomfrey': (80, 145), 'wendell': (115, 230), 'mortimer': (75, 140),
      'lulu': (150, 260), 'pete': (115, 230), 'nubbin': (210, 380), 'hortense': (140, 240), 'thrupp': (95, 200),
      'bart': (85, 190), 'fingers': (80, 150), 'mulligan': (80, 150), 'stranger': (65, 125)}
SEEDS = [11, 23, 37]


def jload(p, d):
    return json.load(open(p)) if os.path.exists(p) else d


def tts(settings, text, wav):
    assert len(text) <= 1200
    for attempt in range(6):
        wait_gpu('tts')
        try:
            j = http(TTS + '/api/generate', dict(settings, text=text))
            break
        except urllib.error.HTTPError as e:
            if e.code != 409: raise
            time.sleep(15)
    jid = j['id']
    while True:
        s = http(f'{TTS}/api/jobs/{jid}')
        if s['status'] == 'complete': break
        if s['status'] in ('failed', 'cancelled', 'error', 'interrupted'):
            raise RuntimeError(f"{jid} {s['status']} {s.get('error')}")
        time.sleep(1)
    urllib.request.urlretrieve(TTS + s['audio_url'], wav)
    return jid


def design(chars):
    V = jload(VJ, {})
    os.makedirs(SCR + '/design', exist_ok=True)
    for k in chars:
        c = S['chars'][k]
        if k in V and V[k].get('voice'):
            print(k, 'already saved', flush=True); continue
        lo, hi = F0[k]
        cands = []
        for seed in SEEDS:
            st = dict(mode='design', speaker='Ryan', language='English', instruct=c['voice'], temperature=0.9,
                      top_p=1.0, top_k=50, repetition_penalty=1.05, speed=1, seed=seed)
            wav = f'{SCR}/design/{k}_{seed}.wav'
            jid = tts(st, c['audition'], wav)
            hyp = asr(wav); w = wer(c['audition'], hyp)
            f0, spread = f0_stats(load_pcm(wav))
            d = dur(wav)
            pen = 0 if lo <= f0 <= hi else min(abs(f0 - lo), abs(f0 - hi)) / 25
            score = w * 4 + pen - min(spread, 4) * 0.1 + (0 if 3 <= d <= 30 else 9)
            cands.append(dict(seed=seed, job=jid, wav=wav, wer=round(w, 3), asr=hyp, f0=round(f0), spread=round(spread, 2), dur=round(d, 2), score=round(score, 3), settings=st))
            print(k, seed, f'wer={w:.2f} f0={f0:.0f} [{lo}-{hi}] spread={spread:.1f} dur={d:.1f} score={score:.2f} | {hyp}', flush=True)
        best = min(cands, key=lambda x: x['score'])
        v = http(TTS + '/api/voices', dict(name=f"Idle Western 2 · {c['name']}"[:80], notes=f"IW2 {k}: {c['role']}. Seed {best['seed']}.",
                                          settings=best['settings'], job_id=best['job'], preserve_voice=True))
        V[k] = dict(voice=v, picked=best['seed'], auditions=cands)
        json.dump(V, open(VJ, 'w'), indent=1, ensure_ascii=False)
        shutil.copy(best['wav'], f'{SCR}/design/{k}_BEST.wav')
        print(k, 'SAVED', v['id'], 'seed', best['seed'], flush=True)


def post(wav, mp3):
    tmp = mp3 + '.trim.wav'
    sh('ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-af',
       'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.03,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.06,areverse',
       '-ac', '1', '-ar', '24000', tmp)
    li = loudness(tmp)
    gain = -16 - li if li > -60 else 0
    sh('ffmpeg', '-y', '-loglevel', 'error', '-i', tmp, '-af', f'volume={gain:.2f}dB,alimiter=limit=0.89:attack=1:release=30:level=false,afade=t=out:st=0:d=0.001',
       '-ac', '1', '-ar', '24000', '-b:a', '48k', mp3)
    os.remove(tmp)
    return dur(mp3)


def render(chars):
    V = jload(VJ, {}); L = jload(LOG, {})
    for k in chars:
        c = S['chars'][k]
        st = V[k]['voice']['settings']
        os.makedirs(f'{OUT}/{k}', exist_ok=True); os.makedirs(f'{SCR}/takes/{k}', exist_ok=True)
        items = [(l, False) for l in c['lines']] + [(w, True) for w in c['wordless']]
        for it, wordless in items:
            iid, text = it['id'], it['text']
            mp3 = f'{OUT}/{k}/{iid}.mp3'
            if os.path.exists(mp3) and L.get(iid, {}).get('text') == text and L[iid].get('voice') == V[k]['voice']['id']:
                continue
            takes = []
            nw = len(norm_words(text))
            for n, seed in enumerate([1, 2, 3, 4]):
                if n >= 2 and takes and min(t['score'] for t in takes) < (0.6 if wordless else 0.35): break
                if wordless and n >= 3: break
                wav = f'{SCR}/takes/{k}/{iid}_s{seed}.wav'
                jid = tts(dict(st, seed=seed), text, wav)
                tm = f'{SCR}/takes/{k}/{iid}_s{seed}.mp3'
                d = post(wav, tm)
                hyp = asr(tm); w = wer(text, hyp)
                if wordless:
                    exp = 0.35 + 0.3 * nw
                    score = 0.5 * min(w, 1) + max(0, d - 2 * exp) + (2 if d < 0.15 else 0)
                else:
                    score = 4 * w + max(0, d - 3.8) * 1.5 + max(0, d - 5) * 3
                takes.append(dict(seed=seed, job=jid, dur=round(d, 2), asr=hyp, wer=round(w, 3), score=round(score, 3), file=tm))
            best = min(takes, key=lambda t: t['score'])
            shutil.copy(best['file'], mp3)
            L[iid] = dict(char=k, text=text, voice=V[k]['voice']['id'], wordless=wordless, pick=best['seed'], dur=best['dur'],
                          wer=best['wer'], asr=best['asr'], takes=[{x: t[x] for x in ('seed', 'dur', 'wer', 'asr', 'score')} for t in takes])
            json.dump(L, open(LOG, 'w'), indent=1, ensure_ascii=False)
            print(iid, f"pick s{best['seed']} {best['dur']}s wer={best['wer']:.2f} | {best['asr']}", flush=True)
        print(k, 'DONE', flush=True)


if __name__ == '__main__':
    cmd, chars = sys.argv[1], sys.argv[2:] or list(S['chars'])
    {'design': design, 'render': render}[cmd](chars)
