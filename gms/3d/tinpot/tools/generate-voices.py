"""Resumable local Qwen API -> mono 40 kbps MP3. Writes only within Tinpot."""
import hashlib,json,os,subprocess,time
from pathlib import Path
import httpx
ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'tools/voice-source'
OUT=ROOT/'audio/voices'
BASE=os.environ.get('QWEN_URL','http://127.0.0.1:7876')
c=httpx.Client(base_url=BASE,timeout=90)
script=json.loads((SOURCE/'script.json').read_text())
refs_path=SOURCE/'references.json'
refs=json.loads(refs_path.read_text()) if refs_path.exists() else {}
manifest_path=OUT/'manifest.json'
old=json.loads(manifest_path.read_text()) if manifest_path.exists() else {'clips':[]}
finished={x['id']:x for x in old['clips']}
def atomic(p,data):
 tmp=p.with_suffix('.tmp');tmp.write_text(json.dumps(data,indent=2)+'\n');tmp.replace(p)
def generate(body):
 for attempt in range(900):
  r=c.post('/api/generate',json=body)
  if r.status_code==409:time.sleep(2);continue
  r.raise_for_status();job=r.json();break
 else:raise RuntimeError('Qwen remained busy for 30 minutes')
 while True:
  r=c.get('/api/jobs/'+job['id']);r.raise_for_status();job=r.json()
  if job['status']=='complete':return job
  if job['status'] in ('failed','cancelled'):raise RuntimeError(job)
  time.sleep(.7)
def base_settings():return {'language':'English','temperature':.8,'top_p':1,'top_k':50,'repetition_penalty':1.05,'seed':42,'speed':1}
for name,voice in script['cast'].items():
 if name in refs:continue
 print('DESIGN',name,flush=True)
 j=generate({**base_settings(),'mode':'design','instruct':voice['description'],'text':voice['reference']})
 r=c.get(j['audio_url']);r.raise_for_status();wav=r.content
 (SOURCE/(name+'.wav')).write_bytes(wav)
 upload=c.post('/api/references',files={'file':(name+'.wav',wav,'audio/wav')});upload.raise_for_status()
 refs[name]={'reference_id':upload.json()['id'],'ref_text':voice['reference'],'design_job':j['id'],'description':voice['description']}
 atomic(refs_path,refs)
for n,line in enumerate(script['clips']):
 target=OUT/(line['id']+'.mp3')
 signature=hashlib.sha256(json.dumps({**line,'ref':refs[line['voice']]['design_job'],'settings':base_settings()},sort_keys=True).encode()).hexdigest()
 if target.exists() and finished.get(line['id'],{}).get('signature')==signature:continue
 print(f"CLIP {n+1}/{len(script['clips'])} {line['id']}: {line['text']}",flush=True)
 ref=refs[line['voice']]
 j=generate({**base_settings(),'mode':'clone','reference_id':ref['reference_id'],'ref_text':ref['ref_text'],'text':line['text']})
 r=c.get(j['audio_url']);r.raise_for_status()
 wav=SOURCE/(line['id']+'.wav');wav.write_bytes(r.content)
 if j.get('warning') or not .35<j['duration']<15:raise RuntimeError('Review unusually long/short clip '+line['id'])
 subprocess.run(['/opt/homebrew/bin/ffmpeg','-nostdin','-v','error','-y','-i',str(wav),'-af','highpass=f=110,lowpass=f=7600,loudnorm=I=-18:TP=-2:LRA=7','-ac','1','-ar','24000','-c:a','libmp3lame','-b:a','40k','-map_metadata','-1',str(target)],check=True)
 finished[line['id']]={**line,'file':target.name,'duration':j['duration'],'bytes':target.stat().st_size,'signature':signature,'job':j['id']}
 atomic(manifest_path,{'version':1,'engine':'Qwen3-TTS 1.7B Base/VoiceDesign MLX 8-bit, local','format':'MP3 mono 24 kHz 40 kbps','cast':script['cast'],'clips':list(finished.values())})
print('DONE',len(finished),'clips,',sum(x['bytes'] for x in finished.values()),'bytes',flush=True)
