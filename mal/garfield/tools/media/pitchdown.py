"""Time-preserving pitch shift for dog vocals via the WORLD vocoder (pyworld; scratchpad venv — see docs/notes/fixaudio.md).
pitchdown.py in.wav out.wav <f0_factor> [formant_factor]   e.g. 0.75 0.88 → lower voice AND a bigger-sounding throat.
Unvoiced frames (breath, bark noise) keep their aperiodic noise; only the envelope warp touches them."""
import sys
import numpy as np, soundfile as sf, pyworld as pw, subprocess

def load(p, sr=44100):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", p, "-ac", "1", "-ar", str(sr), "-f", "f64le", "-"], capture_output=True).stdout
    return np.frombuffer(raw, np.float64).copy(), sr

def shift(x, sr, k, fk=1.0):
    f0, t = pw.harvest(x, sr, f0_floor=100, f0_ceil=1600, frame_period=5)
    sp = pw.cheaptrick(x, f0, t, sr)
    ap = pw.d4c(x, f0, t, sr)
    if fk != 1.0:
        n = sp.shape[1]; src = np.minimum(np.arange(n) / fk, n - 1)
        sp = np.array([np.interp(src, np.arange(n), row) for row in sp])
        ap = np.array([np.interp(src, np.arange(n), row) for row in ap])
    y = pw.synthesize(f0 * k, sp, ap, sr, 5)
    return y[:len(x)]

if __name__ == "__main__":
    i, o, k = sys.argv[1], sys.argv[2], float(sys.argv[3])
    fk = float(sys.argv[4]) if len(sys.argv) > 4 else 1.0
    x, sr = load(i)
    y = shift(x, sr, k, fk)
    y *= np.abs(x).max() / (np.abs(y).max() + 1e-9)
    sf.write(o, y, sr)
