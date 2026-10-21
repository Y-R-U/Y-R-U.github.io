"""Shared helpers for the Krayzee voice tools (Qwen Voice Studio :7876, faster-whisper ASR, ffmpeg)."""
import json, os, re, subprocess, time, urllib.error, urllib.request
import numpy as np

H = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(H, '../..'))
VOICES = os.path.join(ROOT, 'audio/voices')
MANIFEST = os.path.join(VOICES, 'manifest.json')
# WAV takes are large and disposable, so they live outside the repo.
SCR = os.path.expanduser(os.environ.get('KRAYZEE_VOICE_SCRATCH', '~/.cache/krayzee-voice'))
TTS = os.environ.get('KRAYZEE_TTS', 'http://192.168.0.236:7876')


def http(url, data=None, timeout=60):
    r = urllib.request.Request(url, data=json.dumps(data).encode() if data is not None else None,
                               headers={'Content-Type': 'application/json'})
    return json.load(urllib.request.urlopen(r, timeout=timeout))


def _get(url):
    try:
        return http(url, timeout=8)
    except Exception:
        return None


def busy():
    """Reasons the shared GPU is not free for a TTS take."""
    b = []
    f = _get('http://localhost:7867/api/status')
    if f and (f.get('running_job_id') or f.get('queue_depth') or f.get('worker_warm')):
        b.append('flux')
    l = _get('http://localhost:7866/api/status')
    if l and (l.get('running_job_id') or l.get('worker_warm')):
        b.append('ltx')
    if subprocess.run(['pgrep', '-x', 'mlxcel-server'], capture_output=True).stdout.strip():
        b.append('mlxcel')
    t = _get(TTS + '/api/status')
    if t is None:
        b.append('tts-down')
    elif t.get('active_job'):
        b.append('tts-busy')
    return b


def wait_gpu(poll=20):
    last = None
    while True:
        b = busy()
        if not b:
            return
        if b != last:
            print(time.strftime('%H:%M:%S'), 'GPU busy, waiting:', ', '.join(b), flush=True)
        last = b
        time.sleep(poll)


def tts(settings, text, wav):
    """One take, strictly serial. Returns (job_id, wall_seconds)."""
    assert len(text) <= 1200
    for _ in range(40):
        wait_gpu()
        try:
            j = http(TTS + '/api/generate', dict(settings, text=text))
            break
        except urllib.error.HTTPError as e:
            if e.code != 409:
                raise RuntimeError(f'generate {e.code}: {e.read()[:300]}')
            time.sleep(15)
    else:
        raise RuntimeError('TTS never became free')
    t0 = time.time()
    jid = j['id']
    while True:
        s = http(f'{TTS}/api/jobs/{jid}')
        if s['status'] == 'complete':
            break
        if s['status'] in ('failed', 'cancelled', 'error', 'interrupted'):
            raise RuntimeError(f"{jid} {s['status']} {s.get('error')}")
        time.sleep(0.5)
    urllib.request.urlretrieve(TTS + s['audio_url'], wav)
    return jid, time.time() - t0


def sh(*a):
    return subprocess.run(a, check=True, capture_output=True, text=True)


def load_pcm(path, sr=16000):
    raw = subprocess.run(['ffmpeg', '-loglevel', 'error', '-i', path, '-ac', '1', '-ar', str(sr), '-f', 'f32le', '-'],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).copy()


def dur(path):
    return float(sh('ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path).stdout.strip())


def loudness(path):
    """(integrated LUFS, true peak dBFS)"""
    out = subprocess.run(['ffmpeg', '-nostats', '-i', path, '-af', 'ebur128=peak=true', '-f', 'null', '-'],
                         capture_output=True, text=True).stderr
    i = re.findall(r'I:\s+(-?[\d.]+|-inf) LUFS', out)
    p = re.findall(r'Peak:\s+(-?[\d.]+|-inf) dBFS', out)
    lu = float(i[-1]) if i and i[-1] != '-inf' else -70.0
    pk = float(p[-1]) if p and p[-1] != '-inf' else -70.0
    return lu, pk


ALIASES = {'krayzee': 'crazy', 'crazee': 'crazy', 'yall': 'you all', 'ya': 'you', 'ye': 'you', 'yer': 'your',
           'gday': 'good day', 'comin': 'coming', 'landin': 'landing', 'stoppin': 'stopping', 'usin': 'using',
           'darn': 'darn', 'oughtnt': 'ought not', 'ma': 'my', 'heid': 'head', 'allo': 'hello', 'ici': 'here',
           'eins': 'one', 'zwei': 'two', 'okay': 'ok', 'tallyho': 'tally ho', 'gonna': 'going to', 'zis': 'this', 'ze': 'the', 'eet': 'it', 'haff': 'have',
           'runvay': 'runway', 'ow': 'how', 'vill': 'will', 'vat': 'what', 'compt': 'comte', 'conte': 'comte', 'nine': 'niner', 'scuse': 'excuse', 'outta': 'out of', 'avin': 'having',
           'squeezin': 'squeezing', 'im': 'i am', 'thats': 'that is', 'its': 'it is', 'ill': 'i will', 'youll': 'you will',
           'dont': 'do not', 'wont': 'will not', 'cant': 'can not', 'ive': 'i have', 'theres': 'there is'}


DIG = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'niner']


def norm_words(s):
    s = s.lower().replace("'", '').replace('-', ' ')
    s = re.sub(r'\d+', lambda m: ' '.join(DIG[int(c)] for c in m.group()), s)
    s = re.sub(r'[^a-z0-9 ]+', ' ', s)
    out = []
    for w in s.split():
        out += ALIASES.get(w, w).split()
    return out


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


def f0_stats(x, sr=16000, fmin=60, fmax=450, th=0.12):
    """YIN: median voiced F0 (Hz) and spread (semitones). Plain autocorrelation octave-jumped too often."""
    fl, hop = int(0.04 * sr), int(0.01 * sr)
    tmin, tmax = int(sr / fmax), int(sr / fmin)
    rms = np.sqrt(np.mean(x ** 2) + 1e-12)
    fs = []
    for s in range(0, len(x) - fl - tmax, hop):
        f = x[s:s + fl + tmax]
        if np.sqrt(np.mean(f[:fl] ** 2)) < 0.3 * rms:
            continue
        d = np.array([np.sum((f[:fl] - f[t:t + fl]) ** 2) for t in range(tmax)])
        c = np.r_[1, d[1:] * np.arange(1, tmax) / np.maximum(np.cumsum(d[1:]), 1e-12)]
        idx = np.nonzero(c[tmin:] < th)[0]
        if not len(idx):
            continue
        t = idx[0] + tmin
        while t + 1 < tmax and c[t + 1] < c[t]:
            t += 1
        fs.append(sr / t)
    if len(fs) < 5:
        return 0.0, 0.0
    fs = np.array(fs)
    return float(np.median(fs)), float(np.std(np.log2(fs)) * 12)


_asr = {}
def _model(name):
    if name not in _asr:
        os.environ.setdefault('HF_HUB_OFFLINE', '1')
        from faster_whisper import WhisperModel
        _asr[name] = WhisperModel(name, device='cpu', compute_type='int8')
    return _asr[name]


def asr(path):
    segs, _ = _model('small.en').transcribe(load_pcm(path), beam_size=2, language='en')
    return ' '.join(s.text.strip() for s in segs)


def asr_words(path):
    """[(normalised word, start, end)] with Whisper word timestamps."""
    segs, _ = _model('small.en').transcribe(load_pcm(path), beam_size=2, language='en', word_timestamps=True)
    out = []
    for s in segs:
        for w in s.words:
            for n in norm_words(w.word):
                out.append((n, w.start, w.end))
    return out


def lang_probs(path):
    """Multilingual whisper's language-ID guess. Heavy French/German accent on English speech shows up as
    non-trivial fr/de probability; it says nothing about English regional accents."""
    _, info = _model('small').transcribe(load_pcm(path), beam_size=1, without_timestamps=True)
    return {k: round(v, 3) for k, v in (info.all_language_probs or [])[:5]}


TRIM = ('silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.03,areverse,'
        'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.08,areverse')


def post(wav, mp3, kbps=64, tempo=1.0, lufs=-16.0):
    """Trim silence, optional pitch-preserving tempo, normalise to ~lufs with a -1.5 dBTP limiter, mono 24 kHz.
    Plain loudnorm left peaky takes 4-7 LU quiet (it backs off to honour the true-peak ceiling), hence gain + limiter."""
    af = TRIM + (f',atempo={tempo:.3f}' if abs(tempo - 1) > 1e-3 else '')
    tmp = mp3 + '.trim.wav'
    sh('ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-af', af, '-ac', '1', '-ar', '24000', tmp)
    gain = 0.0
    for _ in range(3):
        tmp2 = mp3 + '.lim.wav'
        sh('ffmpeg', '-y', '-loglevel', 'error', '-i', tmp, '-af',
           f'volume={gain:.2f}dB,alimiter=limit=0.84:attack=2:release=40:level=false', '-ac', '1', '-ar', '24000', tmp2)
        lu, _ = loudness(tmp2)
        if lu < -60 or abs(lu - lufs) <= 0.6:
            break
        gain += lufs - lu
    enc = ['-c:a', 'pcm_s16le'] if mp3.endswith('.wav') else ['-b:a', f'{kbps}k']
    sh('ffmpeg', '-y', '-loglevel', 'error', '-i', tmp2, '-ac', '1', '-ar', '24000', *enc, mp3)
    os.remove(tmp); os.remove(tmp2)
    return dur(mp3)


def jload(p, d):
    return json.load(open(p)) if os.path.exists(p) else d


def jsave(p, obj):
    tmp = p + '.tmp'
    with open(tmp, 'w') as f:
        json.dump(obj, f, indent=1, ensure_ascii=False)
    os.replace(tmp, p)
