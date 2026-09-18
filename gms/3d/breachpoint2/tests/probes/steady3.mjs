/* Hypothesis: the rank-0 arm sometimes acquires because the target is pinned
   only AFTER the look, so wherever the enemy happened to spawn leaks into the
   first frames. Pin it FIRST, then look. 6 trials each way + a canary. */
import {connect,URL,sleep} from './lib.mjs';
const {send,ev}=await connect();
await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
await send('Runtime.enable'); await send('Page.enable');
const ranks = async o => ev(`(()=>{const P=BP2.Profile;const d={vitality:0,plating:0,marksman:0,steady:0,logistics:0,mobility:0};
  Object.assign(d,${JSON.stringify(o)});for(const k in d)P.setRank(k,d[k]);return 1;})()`);
const pull = (prePin)=>ev(`(async()=>{const g=__game;g.S.aimAssist=1;g.S.mobileADS='off';
  const all=g.Enemies.list().filter(x=>x.active&&x.alive);const e=all[0];
  for(let i=1;i<all.length;i++) all[i].alive=false;
  const EX=1.5,EZ=10.5,EY=g.groundAt(1.5,10.5,6,0.3);
  g.teleport(1.5,24.5);
  if(${prePin}){ // settle the geometry BEFORE aiming, so nothing pre-pin leaks in
    const s0=performance.now();
    while(performance.now()-s0<300){ e.pos.set(EX,EY,EZ); e.rig.root.position.copy(e.pos);
      await new Promise(r=>requestAnimationFrame(r)); } }
  g.look(0.42,0);
  const t0=performance.now();
  while(performance.now()-t0<900){ e.pos.set(EX,EY,EZ);
    await new Promise(r=>requestAnimationFrame(r)); }
  return {r:+Math.abs(g.player.yaw-0.42).toFixed(4), EY:+EY.toFixed(2), assist:+g.RANKS.assist.toFixed(2)};})()`);
async function trial(prePin){
  await send('Page.navigate',{url:URL}); await sleep(2800);
  await ev(`localStorage.removeItem('bp2_profile')`);
  await ev(`__game.start()`); await sleep(300);
  await ranks({}); await ev(`__game.loadLevel(1);__game.god(true)`); await sleep(600);
  const a0=await pull(prePin);
  await ranks({steady:5}); await ev(`__game.loadLevel(1);__game.god(true)`); await sleep(600);
  const a5=await pull(prePin);
  return {r0:a0.r, r5:a5.r, pass:(a0.r<0.12 && a5.r>0.30)};
}
let p=0;
for(let i=0;i<6;i++){ const t=await trial(true); if(t.pass)p++;
  console.log(`prePin run ${i}: rank0 ${t.r0}  rank5 ${t.r5}  -> ${t.pass?'PASS':'FAIL'}`); }
console.log(`prePin: ${p}/6 pass`);
// CANARY: with the pre-pin in place the check must still FAIL when the cone is
// wide at rank 0 — otherwise it has stopped measuring the cone at all.
await send('Page.navigate',{url:URL}); await sleep(2800);
await ev(`localStorage.removeItem('bp2_profile')`); await ev(`__game.start()`); await sleep(300);
await ranks({}); await ev(`__game.loadLevel(1);__game.god(true)`); await sleep(600);
await ev(`__game.RANKS.assist=2.5`);            // pretend rank 0 has the rank-5 cone
const canary = await pull(true);
console.log(`CANARY (rank 0 given the rank-5 cone): pull ${canary.r} -> check ${canary.r<0.12?'PASSES (BLIND!)':'FAILS as it should'}`);
process.exit(0);
