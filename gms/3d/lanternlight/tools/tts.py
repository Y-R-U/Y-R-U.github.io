import json,sys,time,urllib.request,subprocess,os
B='http://localhost:7876'
def req(path,data=None):
    r=urllib.request.Request(B+path,data=json.dumps(data).encode() if data is not None else None,headers={'Content-Type':'application/json'})
    return json.load(urllib.request.urlopen(r,timeout=60))
def other_ai_busy():
    busy=[]
    for port in (7867,7866):
        try:
            s=json.load(urllib.request.urlopen(f'http://localhost:{port}/api/status',timeout=5))
            if s.get('running_job_id') or s.get('worker_warm'): busy.append(port)
        except Exception: pass
    if subprocess.run(['pgrep','-x','mlxcel-server'],capture_output=True).stdout.strip(): busy.append('mlxcel')
    try:
        if req('/api/status').get('active_job'): busy.append('tts-other')
    except Exception: busy.append('tts-down')
    return busy
def wait_free():
    while True:
        b=other_ai_busy()
        if not b: return
        print('waiting, busy:',b,flush=True); time.sleep(20)
def gen(settings,text,out_wav):
    assert len(text)<=1200
    wait_free()
    j=req('/api/generate',dict(settings,text=text))
    jid=j.get('id') or j.get('job_id')
    while True:
        s=req(f'/api/jobs/{jid}')
        if s['status']=='complete': break
        if s['status'] in ('failed','cancelled','error'): raise RuntimeError(f"{jid} {s['status']} {s.get('error')}")
        time.sleep(1)
    urllib.request.urlretrieve(B+s['audio_url'],out_wav)
    return jid,s
