# Generates intro VO with the saved Synthwild narrator: python3 vo_gen.py [key...]  (skips unchanged lines)
import json, sys, os, subprocess; sys.path.insert(0, '.'); import vo_tts as tts
S = json.load(open('vo_script.json'))
V = [v for v in tts.req('/api/voices') if v['name'] == 'Synthwild · Narrator'][0]
out = '../audio/vo'; mfp = f'{out}/manifest.json'; os.makedirs('scratch', exist_ok=True)
mf = json.load(open(mfp)) if os.path.exists(mfp) else {}
only = set(sys.argv[1:])
for key, text in S.items():
    fn = f'{key}.mp3'
    if only and key not in only: continue
    if fn in mf and mf[fn]['text'] == text and not only: continue
    wav = f'scratch/{key}.wav'
    jid, s = tts.gen(V['settings'], text, wav)
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-af',
                    'silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse,loudnorm=I=-16:TP=-1.5',
                    '-ac', '1', '-ar', '24000', '-b:a', '48k', f'{out}/{fn}'], check=True)
    d = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f'{out}/{fn}'],
                             capture_output=True, text=True).stdout)
    mf[fn] = dict(text=text, voice=V['name'], voice_id=V['id'], job_id=jid, duration=round(d, 2),
                  words=len(text.split()), wps=round(len(text.split()) / d, 2))
    json.dump(mf, open(mfp, 'w'), indent=1); print(fn, round(d, 1), mf[fn]['wps'], flush=True)
print('DONE')
