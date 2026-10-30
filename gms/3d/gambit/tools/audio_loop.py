#!/usr/bin/env python3
"""GAMBIT audio agent: turn a generated music track into a seamless crossfade loop.

  python3 tools/audio_loop.py analyze <in.flac> [...]           calm-ness stats per track
  python3 tools/audio_loop.py make <in.flac> <name> --bpm 72 --bars 18 [--xbars 1] [--from 4]

`make` searches for the start time s (beat-grid aligned to the requested tempo) whose head
window [s, s+X] best matches the tail window [s+L, s+L+X] (cosine similarity of log-spectra),
then writes assets/audio/music/<name>.ogg (Opus 64k) and <name>.m4a (AAC 80k) holding L+X
seconds, loudness-normalised to -18 LUFS / -2 dBTP. js/audio/music.js plays a new copy every
L seconds with an equal-power X-second crossfade, so the loop is seamless. Needs numpy + ffmpeg.
"""
import sys, subprocess, json, argparse, os
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'audio', 'music')
SR = 22050


def decode(path, sr=SR):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ac', '1', '-ar', str(sr), '-f', 'f32le', '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32)


def stft_mag(x, n=2048, hop=512):
    w = np.hanning(n).astype(np.float32)
    frames = 1 + (len(x) - n) // hop
    idx = np.arange(n)[None, :] + hop * np.arange(frames)[:, None]
    return np.abs(np.fft.rfft(x[idx] * w, axis=1)), hop


def analyze(path):
    x = decode(path)
    S, hop = stft_mag(x)
    fps = SR / hop
    rms = np.sqrt((S ** 2).mean(1))
    db = 20 * np.log10(rms + 1e-9)
    flux = np.maximum(0, np.diff(np.log1p(S), axis=0)).sum(1)
    thr = flux.mean() + 2 * flux.std()
    onsets = ((flux[1:-1] > thr) & (flux[1:-1] > flux[:-2]) & (flux[1:-1] > flux[2:])).sum()
    freqs = np.fft.rfftfreq(2048, 1 / SR)
    cen = (S * freqs).sum(1) / (S.sum(1) + 1e-9)
    secs = len(x) / SR
    body = db[int(5 * fps):int((secs - 5) * fps)]
    return {'file': path, 'secs': round(secs, 1), 'onsets_per_s': round(onsets / secs, 2),
            'loud_std_db': round(float(body.std()), 2), 'centroid_hz': int(np.median(cen)),
            'quiet_frac': round(float((body < body.max() - 30).mean()), 3)}


def make(path, name, bpm, bars, xbars=1.0, start_min=4.0, beats_per_bar=4):
    x = decode(path)
    secs = len(x) / SR
    bar = 60.0 / bpm * beats_per_bar
    L, X = bar * bars, bar * xbars
    S, hop = stft_mag(x)
    F = np.log1p(S)
    fps = SR / hop
    beat = 60.0 / bpm
    best = None
    s = start_min
    # stay clear of the generated ending (ACE tends to wind down / fade in the last seconds)
    while s + L + X <= secs - 4.0:
        a0, a1 = int(s * fps), int((s + X) * fps)
        b0 = int((s + L) * fps)
        A, B = F[a0:a1], F[b0:b0 + (a1 - a0)]
        if len(B) == len(A) and len(A):
            sim = float((A * B).sum() / (np.linalg.norm(A) * np.linalg.norm(B) + 1e-9))
            # also prefer similar level at the seam
            lv = abs(np.log((S[a0:a1] ** 2).mean() + 1e-12) - np.log((S[b0:b0 + a1 - a0] ** 2).mean() + 1e-12))
            score = sim - 0.05 * lv
            if not best or score > best[0]:
                best = (score, s, sim, lv)
        s += beat / 4
    if not best:
        raise SystemExit(f'track too short for {bars} bars at {bpm} bpm ({secs:.1f}s)')
    _, s, sim, lv = best
    os.makedirs(OUT, exist_ok=True)
    total = L + X
    af = f'atrim=start={s:.4f}:duration={total:.4f},asetpts=PTS-STARTPTS,loudnorm=I=-18:TP=-2:LRA=7'
    # two-pass loudnorm would be more exact; one pass is within ~1 LU for steady ambient music
    ogg, m4a = os.path.join(OUT, name + '.ogg'), os.path.join(OUT, name + '.m4a')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', path, '-af', af, '-ar', '48000', '-ac', '2', '-c:a', 'libopus', '-b:a', '64k', '-vbr', 'on', ogg], check=True)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', path, '-af', af, '-ar', '44100', '-ac', '2', '-c:a', 'aac_at', '-b:a', '80k', '-movflags', '+faststart', m4a], check=True)
    info = {'name': name, 'source': path, 'bpm': bpm, 'bars': bars, 'start': round(s, 3), 'loop': round(L, 4), 'xfade': round(X, 4),
            'seam_similarity': round(sim, 3), 'seam_level_diff': round(float(lv), 3),
            'ogg_kb': os.path.getsize(ogg) // 1024, 'm4a_kb': os.path.getsize(m4a) // 1024}
    print(json.dumps(info))
    return info


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('cmd'); ap.add_argument('inp', nargs='+')
    ap.add_argument('--bpm', type=float); ap.add_argument('--bars', type=float); ap.add_argument('--xbars', type=float, default=1.0)
    ap.add_argument('--from', dest='start', type=float, default=4.0)
    a = ap.parse_args()
    if a.cmd == 'analyze':
        for p in a.inp: print(json.dumps(analyze(p)))
    elif a.cmd == 'make':
        make(a.inp[0], a.inp[1], a.bpm, a.bars, a.xbars, a.start)
