"""Music pipeline (ACE-Step :8001).
  music.py gen [cue..]        generate variants (raw -> docs/audio/scratch/music/<cue>_v<n>.mp3)
  music.py pick [cue..]       score variants, cut seamless loops / stingers -> audio/music/<cue>.mp3
  music.py pick cue=2         force variant 2 for a cue
  music.py piano              3 ACE solo-piano takes -> scratch/piano_ace/
Python: same venv as vo.py."""
import json, os, sys, time, subprocess
import numpy as np, soundfile as sf
from common import *

M = json.load(open(os.path.join(H, 'music.json')))
RAW = os.path.join(SCR, 'music')
OUT = os.path.join(ROOT, 'audio/music')
LOGF = os.path.join(H, 'music_log.json')
SR = 44100
META = {'main': (112, 'A minor'), 'saloon': (132, 'C major'), 'build': (140, 'G major'), 'night': (70, 'D major'),
        'robbery': (160, 'E minor'), 'fakedeath': (90, 'C minor'), 'ghost': (84, 'D minor'), 'duel': (70, 'A minor'),
        'st_sign': (120, 'C major'), 'st_hat': (120, 'F major'), 'st_box': (120, 'C major'), 'st_coach': (120, 'D major')}
SEEDS = [101, 202, 303]


def ace(prompt, seconds, out, seed, bpm=None, key='', ts='4'):
    wait_gpu('ace')
    body = dict(prompt=prompt, lyrics='[Instrumental]', thinking=False, audio_duration=seconds, inference_steps=8,
                batch_size=1, audio_format='mp3', task_type='text2music', vocal_language='en', use_random_seed=False,
                seed=seed, key_scale=key, time_signature=ts)
    if bpm: body['bpm'] = bpm
    r = http(ACE + '/release_task', body, timeout=900)
    tid = r['data']['task_id']
    t0 = time.time()
    while True:
        time.sleep(3)
        q = http(ACE + '/query_result', dict(task_id_list=[tid]), timeout=60)['data'][0]
        if q['status'] == 1: break
        if q['status'] == 2: raise RuntimeError(f'ace failed {tid}: {q}')
        if time.time() - t0 > 1500: raise RuntimeError('ace timeout')
    res = json.loads(q['result'])[0]
    urllib.request.urlretrieve(ACE + res['file'], out)
    return tid, round(time.time() - t0)


def gen(cues):
    os.makedirs(RAW, exist_ok=True)
    for k in cues:
        c = M[k]; bpm, key = META[k]
        extra = 14 if c['loop'] else 4
        for i, seed in enumerate(SEEDS[:3 if c['loop'] else 2], 1):
            out = f'{RAW}/{k}_v{i}.mp3'
            if os.path.exists(out): continue
            tid, s = ace(c['prompt'], max(10, c['dur'] + extra), out, seed, bpm, key)
            print(k, f'v{i}', 'ok', f'{s}s', flush=True)


def stft_mag(x, n=2048, hop=441):
    w = np.hanning(n)
    fr = np.lib.stride_tricks.sliding_window_view(np.pad(x, (0, n)), n)[::hop] * w
    return np.abs(np.fft.rfft(fr, axis=1)).astype(np.float32)


def bands(mag, nb=48):
    edges = np.unique(np.geomspace(2, mag.shape[1] - 1, nb + 1).astype(int))
    return np.stack([mag[:, a:b].mean(1) for a, b in zip(edges[:-1], edges[1:])], 1)


def analyse(path):
    x, sr = sf.read(path, always_2d=True); x = x.mean(1).astype(np.float32)
    if sr != SR:
        x = np.interp(np.arange(int(len(x) * SR / sr)) * sr / SR, np.arange(len(x)), x).astype(np.float32)
    mag = stft_mag(x); B = np.log1p(bands(mag) * 10)
    flux = np.maximum(0, np.diff(B, axis=0)).sum(1); flux = np.r_[0, flux]
    rms = np.sqrt((x[: len(x) // 441 * 441].reshape(-1, 441) ** 2).mean(1) + 1e-12)
    return x, B, flux, 20 * np.log10(rms)


def tempo(flux, lo, hi):
    f = flux - flux.mean(); ac = np.correlate(f, f, 'full')[len(f) - 1:]
    lags = np.arange(int(6000 / hi), int(6000 / lo) + 1)
    k = lags[np.argmax(ac[lags])]
    return 6000 / k


def vocal_check(path):
    try:
        global _asr
        import common
        if common._asr is None: asr(path)
        segs, _ = common._asr.transcribe(load_pcm(path), beam_size=1, language='en')
        words = 0
        for s in segs:
            if s.no_speech_prob < 0.4 and s.avg_logprob > -0.8: words += len(s.text.split())
        return words
    except Exception as e:
        print('vocal check failed', e); return 0


def find_loop(B, flux, L, bpm, xf):
    """frames at 100 Hz. Pick start S (first 4 s) and end E ~ S+L (whole beats) maximising spectral match after S vs after E."""
    beat = 6000 / bpm
    win = 150
    n = len(B)
    best = (-9, 0, 0)
    for S in range(20, min(400, n - L - win - xf)):
        if flux[S] < np.percentile(flux[:600], 60): continue
        a = B[S:S + win].ravel(); a = (a - a.mean()) / (a.std() + 1e-9)
        for nb in range(int(round(L / beat)) - 4, int(round(L / beat)) + 5):
            E0 = S + int(round(nb * beat))
            for E in range(E0 - 3, E0 + 4):
                if E + max(win, xf) >= n: continue
                b = B[E:E + win].ravel(); b = (b - b.mean()) / (b.std() + 1e-9)
                sim = float((a * b).mean())
                if sim > best[0]: best = (sim, S, E)
    return best


def pick(cues, force):
    os.makedirs(OUT, exist_ok=True)
    LOG = json.load(open(LOGF)) if os.path.exists(LOGF) else {}
    for k in cues:
        c = M[k]; bpm, _ = META[k]
        vs = sorted(f for f in os.listdir(RAW) if f.startswith(k + '_v') and f.endswith('.mp3'))
        cands = []
        for f in vs:
            p = f'{RAW}/{f}'
            x, B, flux, db = analyse(p)
            act = db > -42
            sil = 1 - act[100:].mean() if len(act) > 200 else 1 - act.mean()
            words = vocal_check(p)
            est = tempo(flux, bpm * 0.6, bpm * 1.6)
            lu = loudness(p)
            info = dict(file=f, sil=round(float(sil), 3), words=words, bpm_est=round(est, 1), lufs=lu)
            score = sil * 6 + min(words, 10) * 0.4 + (abs(lu + 16) / 10)
            if c['loop']:
                L = int(c['dur'] * 100)
                sim, S, E = find_loop(B, flux, L, est if abs(est / bpm - 1) < 0.15 else bpm, 150)
                info.update(seam=round(sim, 3), S=S, E=E)
                score += (1 - sim) * 3
            info['score'] = round(score, 3); cands.append(info)
            print(k, info, flush=True)
        ch = force.get(k)
        best = [i for i in cands if i['file'] == f'{k}_v{ch}.mp3'][0] if ch else min(cands, key=lambda i: i['score'])
        p = f'{RAW}/{best["file"]}'
        x, sr = sf.read(p, always_2d=True)
        if sr != SR: raise SystemExit('unexpected sr ' + str(sr))
        if c['loop']:
            S, E = best['S'] * 441, best['E'] * 441; X = int(1.5 * SR)
            seg = x[S:E].copy()
            t = np.linspace(0, np.pi / 2, X)[:, None]
            seg[:X] = x[S:S + X] * np.sin(t) + x[E:E + X] * np.cos(t)
        else:
            x2, B, flux, db = analyse(p)
            st = max(0, int(np.argmax(db > -38)) - 2) * 441
            ln = int(c.get('trim', c['dur']) * SR)
            seg = x[st:st + ln].copy()
            fo = int((0.6 if 'trim' in c else 1.5) * SR)
            seg[-fo:] *= np.linspace(1, 0, fo)[:, None] ** 2
            seg[:int(0.005 * SR)] *= np.linspace(0, 1, int(0.005 * SR))[:, None]
        w = f'{RAW}/{k}_final.wav'; sf.write(w, seg, SR)
        br = '96k' if c['loop'] or c['dur'] > 10 else '96k'
        lu = loudness(w); g = -16 - lu if c['loop'] else -14 - lu
        sh('ffmpeg', '-y', '-loglevel', 'error', '-i', w, '-af', f'volume={g:.2f}dB,alimiter=limit=0.92:level=false',
           '-ar', '44100', '-ac', '2', '-b:a', br, f'{OUT}/{k}.mp3')
        LOG[k] = dict(pick=best, cands=cands, dur=round(dur(f'{OUT}/{k}.mp3'), 2), loop=c['loop'])
        json.dump(LOG, open(LOGF, 'w'), indent=1)
        print(k, 'PICK', best['file'], LOG[k]['dur'], 's', flush=True)


PIANO = "solo honky-tonk upright piano, ragtime, slightly out of tune saloon piano, stride left hand, bright playful syncopated melody, no other instruments, no drums, old west saloon"


def piano():
    d = f'{SCR}/piano_ace'; os.makedirs(d, exist_ok=True)
    for i, (seed, bpm) in enumerate([(11, 120), (22, 120), (33, 132)], 1):
        out = f'{d}/take{i}.mp3'
        if os.path.exists(out): continue
        tid, s = ace(PIANO, 100, out, seed, bpm, 'C major')
        print('piano take', i, s, 's', flush=True)


if __name__ == '__main__':
    cmd = sys.argv[1]
    args = [a for a in sys.argv[2:] if '=' not in a]
    force = {a.split('=')[0]: a.split('=')[1] for a in sys.argv[2:] if '=' in a}
    cues = args or (list(force) if force else list(M))
    if cmd == 'gen': gen(cues)
    elif cmd == 'pick': pick(cues, force)
    elif cmd == 'piano': piano()
