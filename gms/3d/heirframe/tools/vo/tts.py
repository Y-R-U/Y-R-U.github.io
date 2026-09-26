"""Qwen Voice Studio client (localhost:7876). One job at a time; waits while other GPU work runs."""
import json, subprocess, time, urllib.request, urllib.error

B = 'http://localhost:7876'


def req(path, data=None, timeout=60):
    r = urllib.request.Request(B + path, data=json.dumps(data).encode() if data is not None else None,
                               headers={'Content-Type': 'application/json'})
    return json.load(urllib.request.urlopen(r, timeout=timeout))


def other_ai_busy():
    busy = []
    for port in (7867, 7866):
        try:
            s = json.load(urllib.request.urlopen(f'http://localhost:{port}/api/status', timeout=5))
            if s.get('running_job_id') or s.get('worker_warm') or s.get('queue_depth'):
                busy.append(port)
        except Exception:
            pass
    if subprocess.run(['pgrep', '-x', 'mlxcel-server'], capture_output=True).stdout.strip():
        busy.append('mlxcel')
    try:
        if req('/api/status').get('active_job'):
            busy.append('tts-other')
    except Exception:
        busy.append('tts-down')
    return busy


def wait_free():
    while True:
        b = other_ai_busy()
        if not b:
            return
        if b != ['tts-other']:
            print('waiting, busy:', b, flush=True)
        # the studio holds active_job for a moment after each take while it frees the model
        time.sleep(2 if b == ['tts-other'] else 20)


def gen(settings, text, out_wav):
    assert len(text) <= 1200
    while True:
        wait_free()
        try:
            j = req('/api/generate', dict(settings, text=text))
            break
        except urllib.error.HTTPError as e:
            if e.code != 409:
                raise RuntimeError(f'{e.code} {e.read().decode()[:300]}')
            time.sleep(5)
    jid = j.get('id') or j.get('job_id')
    t0 = time.time()
    while True:
        s = req(f'/api/jobs/{jid}')
        if s['status'] == 'complete':
            break
        if s['status'] in ('failed', 'cancelled', 'error'):
            raise RuntimeError(f"{jid} {s['status']} {s.get('error')}")
        if time.time() - t0 > 300:
            req(f'/api/jobs/{jid}/cancel', {})
            raise RuntimeError(f'{jid} timed out')
        time.sleep(1)
    urllib.request.urlretrieve(B + s['audio_url'], out_wav)
    return jid, s
