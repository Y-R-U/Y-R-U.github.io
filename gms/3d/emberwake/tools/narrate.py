"""Generate story audio with Reader's cached Kokoro; no running services are changed."""
import os
os.environ['HF_HUB_OFFLINE'] = '1'
os.environ['TOKENIZERS_PARALLELISM'] = 'false'
import json, subprocess, tempfile, hashlib
from pathlib import Path
import numpy as np
import soundfile as sf
from kokoro import KPipeline
root = Path(__file__).resolve().parents[1]
pipes = {}
manifest = []
old = {v['file']: v for v in json.loads((root/'audio'/'manifest.json').read_text()) if 'file' in v}
for line in json.loads((root/'story.json').read_text()):
    voices = [('female','af_bella'),('male','am_echo')] if line.get('voice') == 'player' else [('', 'bm_lewis')]
    for suffix, voice in voices:
        name = line['id'] + ('-'+suffix if suffix else '') + '.mp3'
        digest = hashlib.sha256((line['text']+voice+'0.98').encode()).hexdigest()
        if old.get(name,{}).get('hash') == digest and (root/'audio'/name).exists():
            manifest.append(old[name]); continue
        lang = voice[0]
        if lang not in pipes: pipes[lang] = KPipeline(lang_code=lang, repo_id='hexgrad/Kokoro-82M')
        samples = np.concatenate([r.audio for r in pipes[lang](line['text'], voice=voice, speed=.98)])
        assert len(samples)>2400 and np.sqrt(np.mean(samples**2))>.001, name
        with tempfile.NamedTemporaryFile(suffix='.wav') as tmp:
            sf.write(tmp.name,samples,24000)
            subprocess.run(['ffmpeg','-v','error','-y','-i',tmp.name,'-af','afade=t=in:d=0.03,apad=pad_dur=0.18','-codec:a','libmp3lame','-q:a','3',str(root/'audio'/name)],check=True)
        manifest.append(dict(id=line['id'],file=name,voice=voice,speed=.98,seconds=round(len(samples)/24000,2),hash=digest))
        print(name,manifest[-1]['seconds'],flush=True)
(root/'audio'/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
