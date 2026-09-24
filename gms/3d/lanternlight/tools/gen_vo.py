import json,sys,os,subprocess;sys.path.insert(0,'.');import tts
V=json.load(open('voices.json')); S=json.load(open('script.json'))
FIRE=[v for v in tts.req('/api/voices') if v['name'].startswith('Fireside')][0]
voices={'narrator':[('fireside',FIRE)],'eldest':[('ivy',V['ivy']),('rowan',V['rowan'])],'pip':[('pip',V['pip'])],'bean':[('bean',V['bean'])]}
out='../audio/vo'; mf_path='../audio/vo/manifest.json'
mf=json.load(open(mf_path)) if os.path.exists(mf_path) else {}
only=set(sys.argv[1:])
for role,lines in S.items():
    for vname,v in voices[role]:
        for key,text in lines.items():
            fn=f'{key}_{vname}.mp3' if role=='eldest' else f'{key}.mp3'
            if only and key not in only: continue
            if fn in mf and mf[fn]['text']==text and not only: continue
            wav=f'scratch/{fn}.wav'
            jid,s=tts.gen(v['settings'],text,wav)
            subprocess.run(['ffmpeg','-y','-loglevel','error','-i',wav,'-af','silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse,loudnorm=I=-16:TP=-1.5','-ac','1','-ar','24000','-b:a','48k',f'{out}/{fn}'],check=True)
            mf[fn]=dict(text=text,role=role,voice=v['name'],voice_id=v['id'],settings=v['settings'],job_id=jid,duration=s['duration'])
            json.dump(mf,open(mf_path,'w'),indent=1); print(fn,round(s['duration'],1),flush=True)
print('DONE')
