import json, os, re, subprocess, time, urllib.request
import numpy as np

H = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(H, '../..'))
SCR = os.path.join(ROOT, 'docs/audio/scratch')
TTS = 'http://localhost:7876'
ACE = 'http://localhost:8001'


def http(url, data=None, timeout=60):
    r = urllib.request.Request(url, data=json.dumps(data).encode() if data is not None else None,
                               headers={'Content-Type': 'application/json'})
    return json.load(urllib.request.urlopen(r, timeout=timeout))


def _get(url):
    try:
        return http(url, timeout=8)
    except Exception:
        return None


def busy(kind):
    """kind = 'tts' or 'ace'. Returns a list of reasons the GPU is not ours."""
    b = []
    f = _get('http://localhost:7867/api/status')
    if f and (f.get('running_job_id') or f.get('queue_depth') or f.get('worker_warm')):
        b.append(f"flux run={f.get('running_job_id')} q={f.get('queue_depth')} warm={f.get('worker_warm')}")
    l = _get('http://localhost:7866/api/status')
    if l and (l.get('running_job_id') or l.get('worker_warm')):
        b.append('ltx')
    if subprocess.run(['pgrep', '-x', 'mlxcel-server'], capture_output=True).stdout.strip():
        b.append('mlxcel')
    t = _get(TTS + '/api/status')
    if t is None and kind == 'tts':
        b.append('tts-down')
    elif t and t.get('active_job'):
        b.append('tts-busy')
    a = _get(ACE + '/admin/status')
    if a and kind == 'tts' and (a.get('loaded') or a.get('active_requests')):
        b.append('ace-loaded')
    if a and kind == 'ace' and a.get('active_requests'):
        b.append('ace-busy')
    return b


def wait_gpu(kind, poll=60):
    last = None
    while True:
        b = busy(kind)
        if not b:
            return
        m = '; '.join(x.split(' run=')[0] for x in b)
        if m != last:
            print(time.strftime('%H:%M:%S'), 'GPU busy, waiting:', '; '.join(b), flush=True)
        last = m
        time.sleep(poll)


def sh(*a):
    return subprocess.run(a, check=True, capture_output=True, text=True)


def load_pcm(path, sr=16000):
    raw = subprocess.run(['ffmpeg', '-loglevel', 'error', '-i', path, '-ac', '1', '-ar', str(sr), '-f', 'f32le', '-'],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).copy()


def dur(path):
    return float(sh('ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path).stdout.strip())


def loudness(path):
    out = subprocess.run(['ffmpeg', '-nostats', '-i', path, '-af', 'ebur128=peak=true', '-f', 'null', '-'],
                         capture_output=True, text=True).stderr
    i = re.findall(r'I:\s+(-?[\d.]+|-inf) LUFS', out)
    return float(i[-1]) if i and i[-1] != '-inf' else -70.0


def norm_words(s):
    s = s.lower().replace('ze ', 'the ').replace("'", '')
    s = re.sub(r'[^a-z0-9 ]+', ' ', s)
    return s.split()


def wer(ref, hyp):
    r, h = norm_words(ref), norm_words(hyp)
    if not r:
        return 0.0
    d = list(range(len(h) + 1))
    for i in range(1, len(r) + 1):
        p, d[0] = d[0], i
        for j in range(1, len(h) + 1):
            p, d[j] = d[j], min(d[j] + 1, d[j - 1] + 1, p + (r[i - 1] != h[j - 1]))
    return d[len(h)] / len(r)


def f0_stats(x, sr=16000):
    """Median and spread of voiced F0 via frame autocorrelation."""
    fl, hop = int(0.04 * sr), int(0.01 * sr)
    lo, hi = int(sr / 450), int(sr / 60)
    e_thr = 0.1 * np.sqrt(np.mean(x ** 2) + 1e-12) * 3
    fs = []
    for s in range(0, len(x) - fl, hop):
        fr = x[s:s + fl] - x[s:s + fl].mean()
        if np.sqrt(np.mean(fr ** 2)) < e_thr:
            continue
        ac = np.correlate(fr, fr, 'full')[fl - 1:]
        if ac[0] <= 0:
            continue
        seg = ac[lo:hi]
        k = int(np.argmax(seg)) + lo
        if ac[k] / ac[0] > 0.45:
            fs.append(sr / k)
    if len(fs) < 5:
        return 0.0, 0.0
    fs = np.array(fs)
    return float(np.median(fs)), float(np.std(np.log2(fs)) * 12)


_asr = None
def asr(path):
    global _asr
    if _asr is None:
        os.environ.setdefault('HF_HUB_OFFLINE', '1')
        from faster_whisper import WhisperModel
        _asr = WhisperModel('small.en', device='cpu', compute_type='int8')
    segs, _ = _asr.transcribe(load_pcm(path), beam_size=2, language='en')
    return ' '.join(s.text.strip() for s in segs)
