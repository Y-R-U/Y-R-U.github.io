import sys,wave,numpy as np
for f in sys.argv[1:]:
    w=wave.open(f);sr=w.getframerate();x=np.frombuffer(w.readframes(w.getnframes()),dtype=np.int16).astype(float)
    if w.getnchannels()>1:x=x[::w.getnchannels()]
    fr=int(sr*0.04);f0=[]
    for i in range(0,len(x)-fr,fr//2):
        s=x[i:i+fr];s=s-s.mean()
        if np.sqrt((s**2).mean())<500:continue
        c=np.correlate(s,s,'full')[fr-1:];lo,hi=int(sr/500),int(sr/70)
        k=lo+np.argmax(c[lo:hi])
        if c[k]>0.4*c[0]:f0.append(sr/k)
    print(f, 'median F0 %.0f Hz'%np.median(f0), 'n',len(f0))
