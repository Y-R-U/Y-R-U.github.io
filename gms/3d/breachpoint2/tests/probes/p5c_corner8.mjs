import {connect, sleep, URL} from '../lib.mjs';
const {send, ev} = await connect();
await send('Page.enable'); await send('Runtime.enable');
await send('Network.setCacheDisabled',{cacheDisabled:true});
const FN = `window.__reach=function(px,pz,cx,cz,rad){
  const g=__game,N=g.NAV.N,B=g.NAV.blocked,w2g=g.NAV.w2g,g2w=g.NAV.g2w;
  const nf=(gx,gy)=>{ if(!B[gy*N+gx]) return gy*N+gx;
    for(let r=1;r<10;r++) for(let oy=-r;oy<=r;oy++) for(let ox=-r;ox<=r;ox++){
      if(Math.abs(ox)!==r&&Math.abs(oy)!==r) continue; const x=gx+ox,y=gy+oy;
      if(x<0||y<0||x>=N||y>=N) continue; if(!B[y*N+x]) return y*N+x; } return -1; };
  const s0=nf(w2g(px),w2g(pz)); const seen=new Uint8Array(N*N); const st=[s0]; seen[s0]=1;
  while(st.length){ const c=st.pop(), ccx=c%N, ccy=(c/N)|0;
    for(let oy=-1;oy<=1;oy++)for(let ox=-1;ox<=1;ox++){ if(!ox&&!oy)continue;
      const nx=ccx+ox,ny=ccy+oy; if(nx<0||ny<0||nx>=N||ny>=N)continue; const ni=ny*N+nx;
      if(B[ni]||seen[ni])continue; if(ox&&oy&&(B[ccy*N+nx]||B[ny*N+ccx]))continue;
      seen[ni]=1; st.push(ni);} }
  let free=0, got=0;
  for(let gy=0;gy<N;gy++) for(let gx=0;gx<N;gx++){
    const wx=g2w(gx), wz=g2w(gy);
    if(Math.abs(wx-cx)>rad||Math.abs(wz-cz)>rad) continue;
    if(B[gy*N+gx]) continue; free++; if(seen[gy*N+gx]) got++; }
  return {free, got, ok: free>0 && got===free};};1`;
for(let r=0;r<6;r++){
  await send('Page.navigate',{url:URL+'?c8='+r+'_'+Date.now()});
  await sleep(2700);
  await ev(FN);
  const out = await ev(`(()=>{const g=__game; g.loadLevel(3); const ins=g.insertPoint();
    const old={x0:21.98,x1:24.42,y0:0,y1:2.59,z0:16.97,z1:23.03,climb:true};
    const props=g.solids.filter(s=>s.lay===undefined && s.climb && (s.x1-s.x0)<1.7 && s.y0<1.6 && s.y1<2.9);
    const bar={x0:23.61,x1:24.39,y0:0,y1:0.92,z0:24.11,z1:24.89,climb:true};
    const go=(o,p,b)=>{ props.forEach(s=>s.off=!p);
      for(const [on,obj] of [[o,old],[b,bar]]){ const i=g.solids.indexOf(obj);
        if(on&&i<0) g.solids.push(obj); if(!on&&i>=0) g.solids.splice(i,1); }
      g.NAV.bake(); const R=window.__reach(ins.x,ins.z,24,24,2.0); return R.got+'/'+R.free; };
    const res={new_bare_bar:go(0,0,1), old_bare_bar:go(1,0,1), new_props:go(0,1,0), old_props:go(1,1,0)};
    go(0,1,0); return res;})()`);
  console.log(r, JSON.stringify(out));
}
process.exit(0);
