import sys, numpy as np
from common import load_pcm
def yin(x, sr=16000, fmin=60, fmax=450, th=0.12):
    fl=int(0.04*sr); hop=int(0.01*sr); out=[]
    tmin, tmax = int(sr/fmax), int(sr/fmin)
    rms_all=np.sqrt(np.mean(x**2))
    for s in range(0,len(x)-fl-tmax,hop):
        f=x[s:s+fl+tmax]
        if np.sqrt(np.mean(f[:fl]**2))<0.3*rms_all: continue
        d=np.array([np.sum((f[:fl]-f[t:t+fl])**2) for t in range(tmax)])
        c=d[1:]*np.arange(1,tmax)/np.maximum(np.cumsum(d[1:]),1e-12); c=np.r_[1,c]
        idx=np.nonzero(c[tmin:]<th)[0]
        if len(idx)==0: continue
        t=idx[0]+tmin
        while t+1<tmax and c[t+1]<c[t]: t+=1
        out.append(sr/t)
    return np.array(out)
if __name__=='__main__':
    for p in sys.argv[1:]:
        f=yin(load_pcm(p)); print(p.split('/')[-1], 'n',len(f),'median',round(float(np.median(f))) if len(f) else 0, 'p25/p75', np.percentile(f,[25,75]).round() if len(f) else '')
