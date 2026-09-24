import sys,json;sys.path.insert(0,'.');import tts
C={
 'ivy':"A fifteen-year-old English girl. Clear, youthful, mid-pitched voice, not childlike, with a soft northern English lilt. Brave but a little breathless, warm and heartfelt, speaking to her little brother and sister.",
 'rowan':"A fourteen-year-old English boy whose voice has only just started to deepen. Youthful, earnest and slightly husky, brave but a little breathless, warm and heartfelt, speaking to his little brother and sister.",
 'pip':"A seven-year-old English boy. High, small, cheeky child's voice, excitable and quick.",
 'bean':"A five-year-old English girl. Very small, high, sweet child's voice, sleepy and trusting, speaking slowly.",
}
T={
 'ivy':"Pip? Bean? It's me. I'm coming to get you, alright? Just keep your light on.",
 'rowan':"Pip? Bean? It's me. I'm coming to get you, alright? Just keep your light on.",
 'pip':"I knew you'd come! I told Bean you would. I told her like a hundred times!",
 'bean':"Is it morning yet? I kept my light on. I was very brave.",
}
who=sys.argv[1]; seed=int(sys.argv[2])
st=dict(mode='design',speaker='Ryan',language='English',instruct=C[who],temperature=0.9,top_p=1.0,top_k=50,repetition_penalty=1.05,speed=1,seed=seed)
jid,s=tts.gen(st,T[who],f'scratch/{who}_{seed}.wav')
print(who,seed,jid,s['duration'])
