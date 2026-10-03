"""Honky-tonk upright: additive synth -> sample set + phrases.json + pre-rendered riffs.
Run: /Users/aaronair/cc/airon/qwen-tts/.venv/bin/python tools/audio/piano_synth.py
Writes audio/piano/samples/*.mp3, audio/piano/phrases.json, audio/piano/riffs/syn_*.mp3"""
import json, os, subprocess, numpy as np, soundfile as sf
H = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(H, '../../audio/piano')
SCR = os.path.join(H, '../../docs/audio/scratch/piano')
SR = 44100
rng = np.random.default_rng(7)
os.makedirs(OUT + '/samples', exist_ok=True); os.makedirs(OUT + '/riffs', exist_ok=True); os.makedirs(SCR, exist_ok=True)

def mtof(m): return 440 * 2 ** ((m - 69) / 12)

_cache = {}
def note(m, vel=0.8, hold=0.5, tail=None, detune=11.0):
    key = (m, round(vel, 1), round(hold, 2), tail, detune)
    if key in _cache: return _cache[key]
    f0 = mtof(m)
    T60 = float(np.clip(7.5 * 2 ** (-(m - 40) / 14), 0.5, 9))
    damp = m < 89
    length = hold + (0.18 if damp else T60 * 0.6) if tail is None else tail
    n_s = int(length * SR); t = np.arange(n_s) / SR
    y = np.zeros(n_s)
    B = 4e-5 * 2 ** ((m - 48) / 18)
    p = 1.7 - 0.7 * vel
    nmax = int(min(48, 11000 / f0))
    for n in range(1, nmax + 1):
        fn = n * f0 * np.sqrt(1 + B * n * n)
        if fn > SR * 0.45: break
        a = (1 / n ** p) * (0.25 + abs(np.sin(np.pi * n / 7.7)))
        Tn = T60 / (1 + 0.22 * (n - 1) ** 1.1)
        env = 0.55 * np.exp(-6.9 * t / (Tn * 0.18)) + 0.45 * np.exp(-6.9 * t / Tn)
        for c in (-detune, 0.0, detune * 0.83):
            ph = rng.uniform(0, 2 * np.pi)
            y += a * env * np.sin(2 * np.pi * fn * 2 ** (c / 1200) * t + ph) / 3
    nz = rng.standard_normal(n_s) * np.exp(-t / 0.004) * 0.06 * vel
    nz = np.convolve(nz, np.ones(4) / 4, 'same') - np.convolve(nz, np.ones(24) / 24, 'same')
    y += nz
    att = np.minimum(1, t / 0.0025); y *= att
    if damp and tail is None:
        rel = np.where(t < hold, 1, np.exp(-(t - hold) / 0.05)); y *= rel
    fade = min(n_s, int(0.03 * SR)); y[-fade:] *= np.linspace(1, 0, fade)
    y *= vel ** 1.3 * 0.35
    _cache[key] = y
    return y

def room(x, wet=0.16):
    n = int(0.55 * SR); t = np.arange(n) / SR
    ir = rng.standard_normal(n) * np.exp(-t / 0.13)
    ir = np.convolve(ir, np.ones(6) / 6, 'same'); ir[:int(0.012 * SR)] = 0
    ir /= np.sqrt((ir ** 2).sum())
    w = np.convolve(x, ir)[:len(x)]
    return x + wet * w

def enc(wav, mp3, br='64k', ch=1, norm=True):
    af = 'loudnorm=I=-16:TP=-1.5:LRA=11' if norm else 'anull'
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-af', af, '-ar', '44100', '-ac', str(ch), '-b:a', br, mp3], check=True)

# ---- notation helpers: tokens "N:d" with N like C4, Eb5, R(rest), chord "C4+E4+G4"; d in 16ths
NAMES = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}
def pm(s):
    acc = s.count('#') - s.count('b') if len(s) > 2 else (1 if s[1:2] == '#' else -1 if s[1:2] == 'b' else 0)
    return 12 * (int(s[-1]) + 1) + NAMES[s[0]] + acc
def seq(txt, start=0, vel=0.8, st=False):
    out, t = [], start
    for tok in txt.split():
        n, d = tok.split(':'); d = float(d)
        if n != 'R':
            for x in n.split('+'):
                out.append([t / 4, d / 4 * (0.92 if not st else 0.5), pm(x), vel])
        t += d
    return out, t
def stride(chords, bars, start=0, vel=0.62):
    """chords: list per bar of (bassNote, chordNotes) ; oom-pah on eighths in 2/4 (bar = 8 sixteenths)."""
    out = []
    for i in range(bars):
        b, c = chords[i % len(chords)]
        b2 = b[1] if isinstance(b, tuple) else b
        b1 = b[0] if isinstance(b, tuple) else b
        t0 = start + i * 8
        for j, bn in ((0, b1), (4, b2)):
            out.append([(t0 + j) / 4, 0.42, pm(bn), vel])
            for x in c.split('+'): out.append([(t0 + j + 2) / 4, 0.3, pm(x), vel * 0.8])
    return out

C, F, G7, Am, D7 = 'E3+G3+C4', 'F3+A3+C4', 'F3+G3+B3', 'E3+A3+C4', 'F#3+A3+C4'
P = []
def add(id, title, src, kind, bpm, notes, wrong=False):
    P.append(dict(id=id, title=title, src=src, kind=kind, bpm=bpm, wrong=wrong, notes=sorted(notes)))

# The Entertainer (Joplin 1902, public domain) — the famous A-strain opening, transposed to C
rh, _ = seq('D5:1 D#5:1 E5:1 C6:2 E5:1 C6:2 E5:1 C6:9 C6:1 D6:1 D#6:1 E6:1 C6:1 D6:1 E6:2 B5:1 D6:2 C6:6', 0, 0.85)
add('entertainer_a', 'The Entertainer (A, bars 1-4)', 'Scott Joplin, 1902 (PD)', 'vamp', 92,
    rh + stride([(('C3', 'G2'), C), (('C3', 'G2'), C), (('C3', 'G2'), C), (('G2', 'G2'), G7), (('C3', 'G2'), C)], 5, 2 / 1))
rh, _ = seq('D5:1 D#5:1 E5:1 C6:2 E5:1 C6:2 E5:1 C6:9 A5:1 G5:1 F#5:1 A5:1 C6:1 E6:2 D6:1 C6:1 A5:1 D6:6', 0, 0.85)
add('entertainer_b', 'The Entertainer (A, bars 5-8)', 'Scott Joplin, 1902 (PD)', 'vamp', 92,
    rh + stride([(('C3', 'G2'), C), (('C3', 'G2'), C), (('A2', 'E2'), Am), (('D3', 'A2'), D7), (('G2', 'D3'), G7)], 5, 2))
# Galop infernal "can-can" (Offenbach 1858, PD)
rh, _ = seq('C5:4 D5:2 F5:2 E5:2 D5:2 G5:4 G5:4 G5:2 A5:2 E5:2 F5:2 D5:4 D5:4 D5:2 F5:2 E5:2 D5:2 C5:2 C6:2 B5:2 A5:2 G5:2 F5:2 E5:2 D5:2 C5:4', 0, 0.85)
add('cancan', 'Galop infernal (can-can)', 'Jacques Offenbach, 1858 (PD)', 'flourish', 152,
    rh + stride([(('C3', 'G2'), C), (('G2', 'D3'), G7), (('G2', 'D3'), G7), (('C3', 'G2'), C), (('G2', 'G2'), G7), (('C3', 'C3'), C)], 6))
# Oh! Susanna (Foster 1848, PD)
rh, _ = seq('C5:1 D5:1 E5:2 G5:2 G5:3 A5:1 G5:2 E5:2 C5:3 D5:1 E5:2 E5:2 D5:2 C5:2 D5:6', 0, 0.82)
add('susanna', 'Oh! Susanna', 'Stephen Foster, 1848 (PD)', 'vamp', 104,
    [[a + 0.5, b, c, d] for a, b, c, d in rh] + stride([(('C3', 'G2'), C), (('C3', 'G2'), C), (('C3', 'G2'), C), (('G2', 'D3'), G7)], 4, 0))
# Camptown Races (Foster 1850, PD)
rh, _ = seq('G5:2 G5:2 E5:2 G5:2 A5:2 G5:2 E5:4 E5:2 D5:6 E5:2 D5:6', 0, 0.82)
add('camptown', 'Camptown Races', 'Stephen Foster, 1850 (PD)', 'vamp', 112,
    rh + stride([(('C3', 'G2'), C), (('C3', 'G2'), C), (('G2', 'D3'), G7), (('G2', 'D3'), G7)], 4))
# Clementine (trad., 1884, PD) — ragged into 2/4
rh, _ = seq('C5:2 C5:2 C5:3 G4:1 E5:2 E5:2 E5:3 C5:1 C5:2 E5:2 G5:3 G5:1 F5:2 E5:2 D5:6', 0, 0.8)
add('clementine', 'Clementine (ragged)', 'Percy Montrose, 1884 (PD)', 'vamp', 96,
    rh + stride([(('C3', 'G2'), C), (('C3', 'G2'), C), (('C3', 'G2'), C), (('G2', 'D3'), G7)], 4))
# Home on the Range (Higley/Kelley 1872, PD)
rh, _ = seq('G4:2 G4:2 C5:2 D5:2 E5:4 C5:2 B4:2 A4:2 F5:2 F5:2 F5:4 R:2 F5:2 G5:2 A5:2 G5:2 F5:2 E5:2 C5:6', 0, 0.78)
add('range', 'Home on the Range (ragged)', 'Higley & Kelley, 1872 (PD)', 'vamp', 120,
    rh + stride([(('C3', 'G2'), C), (('C3', 'G2'), C), (('F2', 'C3'), F), (('F2', 'C3'), F), (('C3', 'G2'), C), (('G2', 'D3'), G7)], 5))
# Endings
rh, _ = seq('C5:4 G4:2 G4:2 A4:4 G4:4 R:4 B4:4 C5:4', 0, 0.9)
add('shave', 'Shave and a Haircut', 'trad. (PD)', 'ending', 120,
    rh + [[0, 0.4, pm('C3'), 0.7], [6 / 4, 0.4, pm('G2'), 0.6], [20 / 4, 0.4, pm('G2'), 0.7], [24 / 4, 1.2, pm('C3'), 0.8], [24 / 4, 1.2, pm('C2'), 0.7]] +
    [[24 / 4, 1.2, x, 0.75] for x in (pm('E4'), pm('G4'))])
rh, _ = seq('G5:1 F5:1 E5:1 D5:1 C5:1 B4:1 A4:1 G4:1 E5+G5+C6:2 R:2 G4+B4+F5:2 R:2 E4+G4+C5:8', 0, 0.85)
add('end_tumble', 'Tumble-down cadence', 'original', 'ending', 120,
    rh + [[2, 0.4, pm('C3'), 0.8], [3, 0.4, pm('G2'), 0.8], [4, 1.8, pm('C2'), 0.8], [4, 1.8, pm('C3'), 0.7]])
rh, _ = seq('E5+C6:2 R:2 E5+C6:2 R:2 D5+B5:2 R:1 D5+B5:1 R:2 C5+E5+G5+C6:8', 0, 0.9)
add('end_stomp', 'Stomp ending', 'original', 'ending', 112,
    rh + [[0, 0.4, pm('C3'), 0.8], [1, 0.4, pm('C3'), 0.8], [2, 0.4, pm('G2'), 0.8], [3, 0.3, pm('G2'), 0.8], [4, 1.8, pm('C2'), 0.85], [4, 1.8, pm('C3'), 0.75]])
# Flourishes
up = ' '.join(f'{n}:1' for n in 'C4 E4 G4 C5 E5 G5 C6 E6 G6'.split())
rh, _ = seq(up + ' C7:5', 0, 0.8)
add('run_up', 'Arpeggio run up', 'original', 'flourish', 120, rh + [[0, 1.5, pm('C2'), 0.7], [0, 1.5, pm('C3'), 0.6], [2.5, 1.2, pm('C3'), 0.6]] + [[2.5, 1.2, x, 0.6] for x in (pm('E3'), pm('G3'))])
ch = ' '.join(f'{n}:1' for n in 'G5 F#5 F5 E5 D#5 D5 C#5 C5 B4 Bb4 A4 Ab4 G4'.split())
rh, _ = seq(ch + ' C5+E5+G5:5', 0, 0.78)
add('run_chromatic', 'Chromatic slide down', 'original', 'flourish', 132, rh + stride([(('C3', 'G2'), C), (('G2', 'G2'), G7)], 2) + [[4.5, 1, pm('C3'), 0.75]])
rh, _ = seq('C6+E6:1 R:1 C6+E6:1 R:1 C6+E6:1 R:1 Bb5+D6:1 R:1 Bb5+D6:1 R:1 A5+C6:1 R:1 G5+B5:2 R:2 G5+C6:4', 0, 0.82)
add('trill_tease', 'Upper-register tease', 'original', 'flourish', 120, rh + stride([(('C3', 'G2'), C), (('F2', 'C3'), F), (('C3', 'G2'), C)], 3))
rh, _ = seq('E5:1 G5:1 E5:1 G5:1 Eb5:1 G5:1 E5:1 C5:1 D5:1 E5:1 C5:1 A4:1 G4:2 C5:2 E5:1 G5:1 E5:1 G5:1 Eb5:1 G5:1 E5:1 C5:1 G5:2 E5:2 C5:4', 0, 0.82)
add('blue_vamp', 'Bluesy stride vamp', 'original', 'vamp', 110, rh + stride([(('C3', 'G2'), C), (('F2', 'C3'), F), (('C3', 'G2'), C), (('G2', 'D3'), G7)], 4))
rh, _ = seq('C5:2 E5:1 G5:3 A5:2 G5:2 E5:1 C5:3 D5:2 E5:2 F5:1 A5:3 G5:4 R:2 E5:2', 0, 0.8)
add('saloon_tune', 'Saloon strut', 'original', 'vamp', 116, rh + stride([(('C3', 'G2'), C), (('A2', 'E2'), Am), (('F2', 'C3'), F), (('G2', 'D3'), G7)], 4))
rh, _ = seq('G4:2 A4:1 B4:1 C5:2 E5:2 G5:2 E5:2 C5:2 A4:2 G4:2 A4:1 C5:1 D5:2 F5:2 A5:2 G5:2 E5:4', 0, 0.8)
add('cakewalk', 'Cakewalk strut', 'original', 'vamp', 112, rh + stride([(('C3', 'G2'), C), (('C3', 'G2'), C), (('G2', 'D3'), G7), (('C3', 'G2'), C)], 4))
# Frenzy (long)
rh1, t = seq(up + ' C7:3 ' + ch + ' C5+E5+G5:3', 0, 0.85)
rh2, t = seq('C6+E6:1 R:1 C6+E6:1 R:1 C6+E6:1 R:1 Bb5+D6:1 R:1 Bb5+D6:1 R:1 A5+C6:1 R:1 G5+B5:2 R:2', t, 0.85)
rh3, t = seq('D5:1 D#5:1 E5:1 C6:2 E5:1 C6:2 E5:1 C6:5 G5:1 F5:1 E5:1 D5:1 C5:1 B4:1 A4:1 G4:1 E5+G5+C6:2 R:2 G4+B4+F5:2 R:2 E4+G4+C5:6', t, 0.85)
add('frenzy', 'Frenzy medley', 'original + Joplin quote', 'long', 150, rh1 + rh2 + rh3 + stride([(('C3', 'G2'), C), (('F2', 'C3'), F), (('C3', 'G2'), C), (('G2', 'D3'), G7)], int(t // 8) + 1))
# Wrong notes
rh, _ = seq('C5:2 E5:1 G5:3 A5:2 G5:2 E5:1 C5:3 Db5+Gb5+B5:2 R:2 C#5+D5+Eb5+F#5:6', 0, 0.9)
add('wrong_clang', 'Wrong note: clang', 'original', 'wrong', 116, rh + stride([(('C3', 'G2'), C), (('A2', 'E2'), Am)], 2) + [[4, 1.5, pm('F#2'), 0.9], [4, 1.5, pm('C#3'), 0.8]], wrong=True)
rh, _ = seq(up + ' Db7+C7+B6:6', 0, 0.85)
add('wrong_run', 'Wrong note: overshoot', 'original', 'wrong', 120, rh + [[0, 1.5, pm('C2'), 0.7], [0, 1.5, pm('C3'), 0.6], [2.25, 1.6, pm('F#2'), 0.8], [2.25, 1.6, pm('G2'), 0.8]], wrong=True)

def render(ph, tempo=1.0):
    spb = 60 / (ph['bpm'] * tempo)
    end = max(n[0] + n[1] for n in ph['notes']) * spb + 1.0
    y = np.zeros(int(end * SR) + SR)
    for b, d, m, v in ph['notes']:
        v = float(np.clip(v + rng.normal(0, 0.04), 0.2, 1))
        s = int((b * spb + rng.normal(0, 0.004) + 0.01) * SR)
        w = note(m, round(v, 1), max(0.08, d * spb))
        y[max(0, s):max(0, s) + len(w)] += w[:len(y) - max(0, s)]
    y = room(y)
    nz = np.nonzero(np.abs(y) > 1e-4)[0]
    y = y[:nz[-1] + 1]
    return y / (np.abs(y).max() + 1e-9) * 0.9

if __name__ == '__main__':
    SAMP = [36, 43, 48, 55, 60, 67, 72, 79, 86]
    for m in SAMP:
        y = room(note(m, 0.8, 1.6, tail=2.2))
        y = y / np.abs(y).max() * 0.9
        w = f'{SCR}/s{m}.wav'; sf.write(w, y, SR)
        enc(w, f'{OUT}/samples/n{m}.mp3', '64k', norm=False)
    meta = []
    for ph in P:
        y = render(ph); w = f'{SCR}/{ph["id"]}.wav'; sf.write(w, y, SR)
        f = f'{OUT}/riffs/syn_{ph["id"]}.mp3'; enc(w, f)
        meta.append((ph['id'], round(len(y) / SR, 2)))
    json.dump(dict(sampleRate=SR, samples=[dict(midi=m, file=f'audio/piano/samples/n{m}.mp3') for m in SAMP],
                   note='notes: [beat, durBeats, midi, vel]; beat = quarter note at bpm. Pitch-shift nearest sample (playbackRate = 2^((midi-s)/12)); damp on key-up with a ~50 ms release.',
                   phrases=P), open(f'{OUT}/phrases.json', 'w'), separators=(',', ':'))
    for m in meta: print(*m)
