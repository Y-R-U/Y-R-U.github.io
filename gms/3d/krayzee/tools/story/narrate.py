"""Story narrator (D16): design the narrator voice once, then render every intro line with the saved clone.

  design            3 design seeds on NARRATOR.audition, scored (WER + pitch), best saved as "Krayzee · narrator"
  render [ids..]    render INTRO lines -> audio/story/<id>.mp3, metadata -> audio/story/narration.json (resumable)
  render --redo id  force a line

Script source: data/story/intro.js (read through node). Python: ~/.cache/krayzee-asr/bin/python.
GPU is shared: one take at a time; we only submit when the studio reports no active job."""
import json, os, subprocess, sys, time, urllib.error
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '../voice'))
from vocommon import ROOT, SCR, TTS, http, post, asr, wer, f0_stats, load_pcm, dur, loudness, jload, jsave
import urllib.request

OUT = os.path.join(ROOT, 'audio/story')
META = os.path.join(OUT, 'narration.json')
SEEDS = [11, 23, 37]


def script():
    js = "import('./data/story/intro.js').then(m=>console.log(JSON.stringify({N:m.NARRATOR,I:m.INTRO})))"
    return json.loads(subprocess.run(['node', '--input-type=module', '-e', js], cwd=ROOT, capture_output=True, text=True, check=True).stdout)


def take(settings, text, wav):
    """Submit only when the studio is idle (another lane's batch shares it); retry on 409."""
    while True:
        try:
            s = http(TTS + '/api/status', timeout=10)
        except Exception:
            time.sleep(10); continue
        if s.get('active_job'):
            time.sleep(0.4); continue
        try:
            j = http(TTS + '/api/generate', dict(settings, text=text))
            break
        except urllib.error.HTTPError as e:
            if e.code != 409:
                raise RuntimeError(f'generate {e.code}: {e.read()[:300]}')
            time.sleep(0.4)
    t0 = time.time()
    while True:
        st = http(f"{TTS}/api/jobs/{j['id']}")
        if st['status'] == 'complete':
            break
        if st['status'] in ('failed', 'cancelled', 'error', 'interrupted'):
            raise RuntimeError(f"{j['id']} {st['status']} {st.get('error')}")
        time.sleep(0.5)
    urllib.request.urlretrieve(TTS + st['audio_url'], wav)
    return j['id'], time.time() - t0


def design():
    S = script(); N = S['N']; M = jload(META, {})
    if M.get('voice', {}).get('voiceId'):
        print('narrator already saved', M['voice']['voiceId']); return
    os.makedirs(f'{SCR}/story', exist_ok=True); os.makedirs(OUT, exist_ok=True)
    lo, hi = N['f0']; cands = []
    for seed in SEEDS:
        st = dict(mode='design', speaker='Ryan', language='English', instruct=N['design'], temperature=0.9,
                  top_p=1.0, top_k=50, repetition_penalty=1.05, speed=1, seed=seed)
        wav = f'{SCR}/story/narrator_s{seed}.wav'
        jid, wall = take(st, N['audition'], wav)
        hyp = asr(wav); w = wer(N['audition'], hyp); f0, spread = f0_stats(load_pcm(wav)); d = dur(wav)
        pen = 0 if lo <= f0 <= hi else min(abs(f0 - lo), abs(f0 - hi)) / 8
        sc = w * 4 + pen - min(spread, 4) * 0.1 + (0 if 3 <= d <= 30 else 9)
        cands.append(dict(seed=seed, job=jid, wer=round(w, 3), f0=round(f0), spread=round(spread, 2), dur=round(d, 2), score=round(sc, 3), asr=hyp, settings=st))
        print('design', seed, f'wer={w:.2f} f0={f0:.0f} dur={d:.1f} score={sc:.2f} wall={wall:.0f}s | {hyp}', flush=True)
    best = min(cands, key=lambda c: c['score'])
    if best['wer'] > 0.2 or not lo <= best['f0'] <= hi:
        print('NOT SAVED', best); M['designRuns'] = M.get('designRuns', []) + [cands]; jsave(META, M); return
    v = http(TTS + '/api/voices', dict(name='Krayzee · narrator', notes='Kingdom of Krayzee story narrator (STORY lane).',
                                      settings=best['settings'], job_id=best['job'], preserve_voice=True))
    post(f"{SCR}/story/narrator_s{best['seed']}.wav", f'{OUT}/narrator_design.mp3', kbps=48)
    M['voice'] = dict(voiceId=v['id'], name=v['name'], seed=best['seed'], clone=v['settings'], audition=N['audition'], candidates=cands)
    jsave(META, M)
    print('SAVED', v['id'])


def render(ids, redo=False):
    S = script(); M = jload(META, {})
    clone = M['voice']['clone']
    lines = M.setdefault('lines', {})
    for ln in S['I']:
        k = ln['id']
        if ids and k not in ids: continue
        if k in lines and not redo and os.path.exists(f'{OUT}/{k}.mp3'):
            continue
        spoken = ln.get('tts') or ln.get('say') or ln['text']
        takes = []
        for seed in [1, 2, 3, 4]:
            wav = f'{SCR}/story/{k}_{seed}.wav'
            jid, wall = take(dict(clone, seed=seed), spoken, wav)
            tmp = f'{SCR}/story/{k}_{seed}.mp3'
            d = post(wav, tmp, kbps=64)
            hyp = asr(tmp); w = wer(spoken, hyp); f0, _ = f0_stats(load_pcm(tmp))
            takes.append(dict(seed=seed, dur=round(d, 2), wer=round(w, 3), f0=round(f0), asr=hyp, file=tmp))
            print(k, seed, f'{d:.2f}s wer={w:.2f} f0={f0:.0f} wall={wall:.0f}s | {hyp}', flush=True)
            if w <= 0.06:
                break
        best = min(takes, key=lambda t: (t['wer'], t['dur']))
        out = f'{OUT}/{k}.mp3'
        os.replace(best['file'], out)
        lu, pk = loudness(out)
        lines[k] = dict(file=f'{k}.mp3', text=spoken, dur=round(dur(out), 2), wer=best['wer'], asr=best['asr'], seed=best['seed'],
                        lufs=round(lu, 1), bytes=os.path.getsize(out), flags=(['wer'] if best['wer'] > 0.12 else []))
        jsave(META, M)


if __name__ == '__main__':
    cmd, args = sys.argv[1], sys.argv[2:]
    if cmd == 'design': design()
    elif cmd == 'render':
        redo = '--redo' in args
        render([a for a in args if a != '--redo'], redo)
