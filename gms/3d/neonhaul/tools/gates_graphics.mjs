#!/usr/bin/env node
// G1 actual receiver controls. Every A/B is clock-frozen, with matched camera,
// exact host-wall sample; positive must visibly move, null/restored must not.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { open, parseArgs, waitFor, quiesce, settle, evalJSON, hook } from './shot.mjs';
const args = parseArgs(), lite = !!args.lite;
const out = resolve('shots/graphics-upgrade/g1-controls'); mkdirSync(out, { recursive:true });
const results=[];
function check(name, pass, detail) {
  results.push({name,pass,detail}); console.log(`${pass?'PASS':'FAIL'} ${name}: ${JSON.stringify(detail)}`);
  writeFileSync(resolve(out,`gates${lite?'-low':''}.json`),JSON.stringify({lite,results},null,2));
}
const ctx=await open({w:900,h:700,dpr:1,headed:!!args.pacing});
const {S,base}=ctx;
async function probe(point) {
  const ans=await S('Runtime.evaluate',{expression:`window.__game.probe({points:[${JSON.stringify(point)}],r:3})`,awaitPromise:true,returnByValue:true});
  const p=ans.result?.value; if(!p || p.error || !p.points[0].onScreen) throw Error('invalid receiver probe '+JSON.stringify(ans));
  return p.points[0].rgb;
}
const delta=(a,b)=>Math.max(...a.map((x,i)=>Math.abs(x-b[i])));
async function sample(point,normal,label) {
  await hook(S,'setCamera',{pos:[point[0]+normal[0]*18,point[1],point[2]+normal[1]*18],yaw:Math.atan2(normal[0],normal[1])*180/Math.PI,pitch:0,fov:55});
  await quiesce(S); await settle(S,12);
  await hook(S,'setFacade',null,1); await settle(S,8); const on=await probe(point);
  const nul=await probe(point);
  await hook(S,'setFacade',null,0); await settle(S,8); const off=await probe(point);
  await hook(S,'setFacade',null,1); await settle(S,8); const restore=await probe(point);
  return {on,off,nullDelta:delta(on,nul),delta:delta(on,off),restoreDelta:delta(on,restore)};
}
try {
  await S('Page.navigate',{url:`${base}/index.html?debug=1&freecam=1&nohud&nosave&noaudio&var=stormnight&time=1&dpr=1${lite?'&lite=1':''}`});
  await waitFor(S,'window.__ready',40000); await quiesce(S); await hook(S,'freezeTime',true);
  if(args.pacing) {
    const pacing=[];
    for(const viewport of [{w:390,h:844,dpr:2,mobile:true},{w:1920,h:1080,dpr:1,mobile:false}]) {
      await ctx.setMetrics(viewport.w,viewport.h,viewport.dpr,viewport.mobile);
      await S('Page.navigate',{url:`${base}/index.html?shot=canyon_dive&debug=1&nohud&nosave&noaudio&dpr=${viewport.dpr}${lite?'&lite=1':''}`});
      await waitFor(S,'window.__ready',40000);await quiesce(S);await hook(S,'freezeTime',true);await settle(S,60);
      for(const spill of [0,1,1,0]) {
        await hook(S,'setFacade',null,spill);await settle(S,45);
        const r=await S('Runtime.evaluate',{expression:`new Promise(resolve=>{let previous=null;const times=[];function step(now){if(previous!==null)times.push(now-previous);previous=now;if(times.length<180)requestAnimationFrame(step);else resolve(times)}requestAnimationFrame(step)})`,awaitPromise:true,returnByValue:true});
        const frames=r.result?.value;if(!Array.isArray(frames)||frames.length!==180)throw Error('invalid pacing sample');
        const sorted=[...frames].sort((a,b)=>a-b),at=p=>sorted[Math.floor((sorted.length-1)*p)];
        const state=await evalJSON(S,'window.__state');
        const maxAttributes=await evalJSON(S,'window.__game.renderer.capabilities.maxAttributes');
        if(state.errors.length)throw Error('pacing shader errors');
        pacing.push({viewport,spill,maxAttributes,frames:frames.length,mean:frames.reduce((a,b)=>a+b,0)/frames.length,median:at(.5),p95:at(.95),p99:at(.99),over20:frames.filter(x=>x>20).length,over30:frames.filter(x=>x>30).length,draws:state.draws,tris:state.tris});
      }
    }
    writeFileSync(resolve(out,`pacing${lite?'-low':''}.json`),JSON.stringify({note:'Headed ANGLE Metal rAF pacing on this Mac; not isolated GPU timer or physical-phone evidence',pacing},null,2));
    console.log(JSON.stringify(pacing,null,2));
  } else {
  const sources=await hook(S,'facadeSources');
  if(sources.length<20) throw Error('degenerate actual source population');
  // Deterministically search actual signs on broad flat slab walls. A patch below
  // a sign avoids the source itself, and points outside source range test locality.
  const candidates=sources.filter(s=>s.kind==='sign' && s.host.proto==='slab' && s.h<25 && s.y>40 && s.y<230)
    .sort((a,b)=>b.intensity-a.intensity || a.x-b.x);
  let chosen,receiver,positive;
  for(const s of candidates.slice(0,18)) {
    const pt=[s.x,s.y-s.h*0.5-1.4,s.z];
    const boundY=s.box.y0*s.host.h; if(pt[1]<boundY+3)continue;
    const r=await sample(pt,[s.nx,s.nz]);
    if(r.delta>0.02 && r.nullDelta<0.001 && r.restoreDelta<0.001) { chosen=s;receiver=pt;positive=r;break; }
  }
  if(!chosen) throw Error('No positive unobstructed real sign receiver found; do not accept zero effect');
  check('real emitted sign lights exact host-wall patch',positive.delta>0.02,{source:chosen,receiver,...positive});
  check('frozen null and restored controls',positive.nullDelta<0.001 && positive.restoreDelta<0.001,positive);
  // Source-off hides supporting light even with the independent effect switch ON.
  await hook(S,'setSignVisible',false,false); await settle(S,8); const sourceOff=await probe(receiver);
  await hook(S,'setFacade',null,0); await settle(S,8);const bothOff=await probe(receiver);
  check('source isolation removes supporting illumination',delta(sourceOff,bothOff)<0.001,{sourceOff,bothOff,delta:delta(sourceOff,bothOff)});
  await hook(S,'setSignVisible',true,false);await hook(S,'setFacade',null,1);await settle(S,8);
  const {data}=await S('Page.captureScreenshot',{format:'png'});writeFileSync(resolve(out,`receiver${lite?'-low':''}.png`),Buffer.from(data,'base64'));
  // Reverse only this source's outward normal in its GPU record. This is a
  // falsification arm at the actual receiver, not a distant easy null fixture.
  const k=chosen.row*64+chosen.index*16+4;
  await evalJSON(S,`(() => {const f=window.__game.city.facadeSources;f.data[${k}]*=-1;f.data[${k+1}]*=-1;f.texture.needsUpdate=true;return true})()`);
  await settle(S,8); const wrongFacing=await probe(receiver);
  await hook(S,'setFacade',null,0);await settle(S,8);const wrongOff=await probe(receiver);
  check('actual receiver rejects reversed source normal',delta(wrongFacing,wrongOff)<0.001,{wrongFacing,wrongOff,delta:delta(wrongFacing,wrongOff)});
  await evalJSON(S,`(() => {const f=window.__game.city.facadeSources;f.data[${k}]*=-1;f.data[${k+1}]*=-1;f.texture.needsUpdate=true;return true})()`);
  const far=[chosen.x,chosen.y-chosen.h*0.5-chosen.range-4,chosen.z];
  const locality=await sample(far,[chosen.nx,chosen.nz]);
  check('same face beyond source range stays unchanged',locality.delta<0.001 && locality.nullDelta<0.001,{point:far,...locality});
  await hook(S,'setSignVisible',false,false);
  const strips=(await hook(S,'facadeSources')).filter(s=>s.kind==='strip' && s.host.proto==='slab').sort((a,b)=>b.intensity-a.intensity);
  let stripPositive;
  for(const s of strips.slice(0,20)) {
    const tx=s.nx ? s.z : s.x, centre=s.nx ? s.host.z : s.host.x;
    const pt=[s.x,s.y,s.z];
    if(s.h>20) { if(s.nx)pt[2]+=Math.sign(centre-tx)*2;else pt[0]+=Math.sign(centre-tx)*2; }
    else pt[1]-=s.h*0.5+1.8;
    if(pt[1]<s.box.y0*s.host.h+2 || pt[1]>s.box.y1*s.host.h-2)continue;
    const r=await sample(pt,[s.nx,s.nz]);
    if(r.delta>0.02 && r.nullDelta<0.001 && r.restoreDelta<0.001) {stripPositive={source:s,receiver:pt,...r};break;}
  }
  check('actual strip lights adjacent own wall',!!stripPositive,stripPositive || 'no positive strip receiver');
  await hook(S,'setSignVisible',true,false);
  // Dense swap-removal: after a large streaming move, every receiver attribute
  // still resolves to the descriptor at its actual matrix position; LOD1 is zero.
  await hook(S,'setCamera',{pos:[1800,160,900],yaw:0,pitch:0,fov:55}); await quiesce(S);await settle(S,8);
  const lifecycle=await evalJSON(S,`(() => {
    const c=window.__game.city, byRow=new Map([...c.facadeSources.rows].map(([b,r])=>[r.id,b]));
    let live=0,bad=0;
    for(const f of c.lod0)for(let i=0;i<f.n;i++) {
      live++;const row=f.attr.iReceiver.array[i],b=byRow.get(row),m=f.mesh.instanceMatrix.array;
      if(!b || Math.abs(b.x-m[i*16+12])>0.001 || Math.abs(b.z-m[i*16+14])>0.001)bad++;
    }
    const lod1=c.lod1.attr.iReceiver.array.slice(0,c.lod1.n);
    return {live,bad,rows:byRow.size,lod1Nonzero:lod1.filter(x=>x!==0).length};
  })()`);
  check('streaming/swap removal keeps receiver host ownership',lifecycle.live>100 && lifecycle.bad===0 && lifecycle.rows===lifecycle.live && lifecycle.lod1Nonzero===0,lifecycle);
  const memory=await evalJSON(S,`(() => {const c=window.__game.city,f=c.facadeSources;return {rows:f.rows.size,overflow:f.overflow,bytes:f.data.byteLength,attributes:4+4+c.lod0[0].attrSpec.length,maxAttributes:window.__game.renderer.capabilities.maxAttributes,errors:window.__state.errors,draws:window.__state.draws}})()`);
  check('bounded source storage, attribute slots and zero shader errors',memory.rows>0 && memory.overflow===0 && memory.attributes<=16 && memory.attributes<=memory.maxAttributes && memory.errors.length===0,memory);
  }
  if(ctx.logs.length)throw Error('Chrome logs '+JSON.stringify(ctx.logs));
} finally {await ctx.close();}
if(results.some(r=>!r.pass))process.exitCode=1;
