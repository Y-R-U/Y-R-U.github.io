"""Cheap sanity checks for TTS takes (nobody can listen): duration vs text, loudness, long gaps."""
import re, subprocess

WPS = 2.6  # typical spoken words per second for these voices


def expected(text):
    words = len(re.findall(r"[\w']+", text))
    pauses = text.count('...') * 0.5 + len(re.findall(r'[.!?,;:—]', text)) * 0.12
    return max(0.6, words / WPS + pauses + 0.3)


def measure(path):
    out = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', path, '-af',
                          'volumedetect,silencedetect=n=-45dB:d=0.35', '-f', 'null', '-'],
                         capture_output=True, text=True).stderr
    dur = re.search(r'Duration: (\d+):(\d+):([\d.]+)', out)
    d = int(dur[1]) * 3600 + int(dur[2]) * 60 + float(dur[3]) if dur else 0
    mean = float(re.search(r'mean_volume: ([-\d.]+)', out)[1]) if 'mean_volume' in out else -99
    peak = float(re.search(r'max_volume: ([-\d.]+)', out)[1]) if 'max_volume' in out else -99
    gaps = [float(g) for g in re.findall(r'silence_duration: ([\d.]+)', out)]
    return dict(duration=round(d, 2), mean_db=mean, peak_db=peak, longest_gap=max(gaps, default=0))


def verdict(text, m):
    exp = expected(text)
    ratio = m['duration'] / exp
    problems = []
    if ratio > 2.5: problems.append(f'long x{ratio:.1f}')
    if ratio < 0.28: problems.append(f'short x{ratio:.2f}')
    if m['mean_db'] < -35: problems.append(f"quiet {m['mean_db']}dB")
    if m['longest_gap'] > 1.6: problems.append(f"gap {m['longest_gap']:.1f}s")
    return problems, round(ratio, 2)


def f0(path):
    """Median pitch in Hz (crude autocorrelation, pure python)."""
    import struct
    raw = subprocess.run(['ffmpeg', '-loglevel', 'error', '-i', path, '-ac', '1', '-ar', '8000', '-f', 's16le', '-'],
                         capture_output=True).stdout
    x = struct.unpack(f'<{len(raw) // 2}h', raw)
    sr, fr, res = 8000, 320, []
    for i in range(0, len(x) - fr, fr):
        s = x[i:i + fr]; m = sum(s) / fr; s = [v - m for v in s]
        e = sum(v * v for v in s)
        if e / fr < 500 ** 2: continue
        best = (0, 0)
        for k in range(sr // 400, sr // 65):
            c = sum(s[j] * s[j + k] for j in range(0, fr - k, 2))
            if c > best[0]: best = (c, k)
        if best[0] > 0.15 * e: res.append(sr / best[1])
    res.sort()
    return round(res[len(res) // 2]) if res else 0
