"""Validate every shipped MP3 decodes, has speech energy, and matches its manifest."""
import json
from pathlib import Path
import numpy as np
import soundfile as sf
root=Path(__file__).resolve().parents[1]
m=json.loads((root/'audio/voices/manifest.json').read_text())
source=json.loads((root/'tools/voice-source/script.json').read_text())
assert {c['id'] for c in m['clips']}=={c['id'] for c in source['clips']}
assert len(m['clips'])==115
stats=[]
for c in m['clips']:
 p=root/'audio/voices'/c['file'];audio,rate=sf.read(p)
 assert rate==24000 and audio.ndim==1,(p,rate,audio.shape)
 assert np.isfinite(audio).all() and np.std(audio)>.005,p
 duration=len(audio)/rate
 assert .35<duration<15 and abs(duration-c['duration'])<.15,(p,duration,c['duration'])
 assert p.stat().st_size==c['bytes']
 stats.append({'id':c['id'],'seconds':round(duration,2),'bytes':p.stat().st_size,'rms':round(float(np.std(audio)),4)})
r={'clips':len(stats),'cast':list(m['cast']),'bytes':sum(c['bytes']for c in stats),'seconds':round(sum(c['seconds']for c in stats),2),'format':m['format'],'all_decoded_and_non_silent':True,'clips_checked':stats}
(root/'docs/evidence/voices-assets.json').write_text(json.dumps(r,indent=2)+'\n')
print(json.dumps({k:v for k,v in r.items() if k!='clips_checked'}))
