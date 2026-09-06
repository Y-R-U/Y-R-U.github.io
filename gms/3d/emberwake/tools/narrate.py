"""Run using Reader's Kokoro Python. Generates portable Lewis narration."""
import os
os.environ['HF_HUB_OFFLINE'] = '1'
os.environ['TOKENIZERS_PARALLELISM'] = 'false'
import json, subprocess, tempfile
from pathlib import Path
import numpy as np
import soundfile as sf
from kokoro import KPipeline
root = Path(__file__).resolve().parents[1]
pipe = KPipeline(lang_code='b', repo_id='hexgrad/Kokoro-82M')
manifest = []
for line in json.loads((root / 'story.json').read_text()):
    chunks = [r.audio for r in pipe(line['text'], voice='bm_lewis', speed=0.94)]
    samples = np.concatenate(chunks)
    assert len(samples) > 2400 and np.sqrt(np.mean(samples ** 2)) > .001, line['id']
    with tempfile.NamedTemporaryFile(suffix='.wav') as tmp:
        sf.write(tmp.name, samples, 24000)
        out = root / 'audio' / (line['id'] + '.mp3')
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', tmp.name, '-af', 'afade=t=in:d=0.03,apad=pad_dur=0.18', '-codec:a', 'libmp3lame', '-q:a', '3', str(out)], check=True)
    manifest.append({'id':line['id'], 'voice':'bm_lewis', 'speed':.94, 'seconds':round(len(samples)/24000,2)})
    print(line['id'], manifest[-1]['seconds'], flush=True)
(root/'audio'/'manifest.json').write_text(json.dumps(manifest, indent=2)+'\n')
