import sys;sys.path.insert(0,'.');import tts
sp=sys.argv[1]
st=dict(mode='preset',speaker=sp,language='English',instruct="Youthful teenage girl, brave but a little breathless, warm and heartfelt.",temperature=0.9,top_p=1.0,top_k=50,repetition_penalty=1.05,speed=1,seed=42)
jid,s=tts.gen(st,"Pip? Bean? It's me. I'm coming to get you, alright? Just keep your light on.",f'scratch/ivyP_{sp}.wav');print(sp,jid,s['duration'])
