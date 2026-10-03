"""Slice ACE-Step solo-piano takes (scratch/piano_ace/take*.mp3) at bar boundaries into riffs -> audio/piano/riffs/ace_*.mp3.
Each riff = N bars from a downbeat plus the next downbeat's first ~0.35 s, so it lands 'on the one' before fading."""
import json, os, sys
import numpy as np, soundfile as sf
from common import *
from music import analyse, SR

D = f'{SCR}/piano_ace'
OUT = os.path.join(ROOT, 'audio/piano/riffs')
KEEP = int(sys.argv[1]) if len(sys.argv) > 1 else 12


def grid(flux, bpm):
    lo, hi = bpm * 0.85, bpm * 1.15
    f = flux - flux.mean(); ac = np.correlate(f, f, 'full')[len(f) - 1:]
    lags = np.arange(int(6000 / hi), int(6000 / lo) + 1)
    beat = lags[np.argmax(ac[lags])]
    # refine fractional beat
    best = (0, beat, 0)
    for b in np.arange(beat - 1, beat + 1.01, 0.1):
        for ph in range(int(b)):
            idx = (ph + np.arange(int((len(flux) - ph) / b)) * b).astype(int)
            s = flux[idx].sum()
            if s > best[0]: best = (s, b, ph)
    _, b, ph = best
    beats = ph + np.arange(int((len(flux) - ph) / b)) * b
    bar_ph = max(range(4), key=lambda q: flux[beats[q::4].astype(int)].sum())
    return b, beats, beats[bar_ph::4]


def main():
    os.makedirs(OUT, exist_ok=True)
    cands = []
    for tf in sorted(os.listdir(D)):
        if not tf.endswith('.mp3'): continue
        p = f'{D}/{tf}'
        x, sr = sf.read(p, always_2d=True); x = x.mean(1)
        _, B, flux, db = analyse(p)
        beat, beats, bars = grid(flux, 120 if 'take3' not in tf else 132)
        tempo = 6000 / beat
        cen = (B * np.arange(B.shape[1])).sum(1) / (B.sum(1) + 1e-9)
        nb = len(bars)
        for i in range(1, nb - 2):
            for n, kind in ((2, None), (5, 'long')):
                if i + n >= nb: continue
                a, e = int(bars[i]), int(bars[i + n])
                seg_db = db[a:e]
                if (seg_db < -40).mean() > 0.08: continue
                on = flux[a:e]
                dens = (on > np.percentile(flux, 75)).mean()
                k = kind or ('flourish' if np.polyfit(np.arange(e - a), cen[a:e], 1)[0] * (e - a) > 3 or dens > 0.35 else 'vamp')
                if i + n >= nb - 2 and not kind: k = 'ending'
                q = flux[a] / (np.percentile(flux, 95) + 1e-9) + 0.5 * flux[e] / (np.percentile(flux, 95) + 1e-9) - abs(np.mean(seg_db) - np.median(db)) / 10
                cands.append(dict(take=tf, i=i, n=n, a=a, e=e, kind=k, q=float(q), tempo=round(tempo, 1)))
        print(tf, f'tempo {tempo:.1f}', 'bars', nb, flush=True)
    # choose non-overlapping best per kind
    chosen, used = [], {}
    want = {'vamp': KEEP // 2, 'flourish': KEEP // 4, 'ending': 2, 'long': 2}
    for c in sorted(cands, key=lambda c: -c['q']):
        if sum(1 for x in chosen if x['kind'] == c['kind']) >= want.get(c['kind'], 0): continue
        r = set(range(c['i'], c['i'] + c['n'])); u = used.setdefault(c['take'], set())
        if r & u: continue
        u |= r; chosen.append(c)
    log = {'riffs': {}}
    for j, c in enumerate(sorted(chosen, key=lambda c: (c['kind'], -c['q'])), 1):
        x, sr = sf.read(f"{D}/{c['take']}", always_2d=True); x = x.mean(1)
        a = int(c['a'] * sr / 100) - int(0.012 * sr); e = int(c['e'] * sr / 100) + int(0.35 * sr)
        seg = x[max(0, a):e].copy()
        fi, fo = int(0.012 * sr), int(0.3 * sr)
        seg[:fi] *= np.linspace(0, 1, fi); seg[-fo:] *= np.linspace(1, 0, fo) ** 2
        rid = f"ace_{c['kind']}_{j:02d}"
        w = f'{D}/{rid}.wav'; sf.write(w, seg, sr)
        lu = loudness(w)
        sh('ffmpeg', '-y', '-loglevel', 'error', '-i', w, '-af', f'volume={-16 - lu:.2f}dB,alimiter=limit=0.9:level=false',
           '-ac', '1', '-ar', '44100', '-b:a', '64k', f'{OUT}/{rid}.mp3')
        log['riffs'][rid] = dict(c, dur=round(len(seg) / sr, 2))
        print(rid, c['take'], 'bars', c['i'], '+', c['n'], round(len(seg) / sr, 2), 's q', round(c['q'], 2), flush=True)
    json.dump(log, open(os.path.join(H, 'piano_log.json'), 'w'), indent=1)


main()
