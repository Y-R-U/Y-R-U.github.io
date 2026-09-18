/* Is the p3 STEADY assist check sensitive to P4b's L1 insertion point?
   Run the exact check N times with the new insert, then N times with the
   pre-P4b insert restored at runtime. Nothing else differs.              */
import {connect,URL,sleep} from './lib.mjs';
const {send,ev}=await connect();
await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
await send('Runtime.enable'); await send('Page.enable');
await send('Page.navigate',{url:URL}); await sleep(3000);
await ev(`localStorage.clear()`);
await send('Page.navigate',{url:URL}); await sleep(3000);
await ev(`__game.start()`); await sleep(400);
const ranks = async o => ev(`(()=>{const P=BP2.Profile;const d={vitality:0,plating:0,marksman:0,steady:0,logistics:0,mobility:0};
  Object.assign(d,${JSON.stringify(o)});for(const k in d)P.setRank(k,d[k]);return 1;})()`);
const assistPull = ()=>ev(`(async()=>{const g=__game;g.S.aimAssist=1;g.S.mobileADS='off';
  const all=g.Enemies.list().filter(x=>x.active&&x.alive);
  const e=all[0];
  for(let i=1;i<all.length;i++) all[i].alive=false;
  const EX=1.5,EZ=10.5,EY=g.groundAt(1.5,10.5,6,0.3);
  g.teleport(1.5,24.5);
  const y0=0.42; g.look(y0,0);
  const t0=performance.now();
  let minAng=9;
  while(performance.now()-t0<900){ e.pos.set(EX,EY,EZ); await new Promise(r=>requestAnimationFrame(r)); }
  let d=g.player.yaw-y0;while(d>Math.PI)d-=6.283185;while(d<-Math.PI)d+=6.283185;
  return {pull:+Math.abs(d).toFixed(4), assist:+g.RANKS.assist.toFixed(2),
    e0:[+e.pos.x.toFixed(1),+e.pos.z.toFixed(1)], EY:+EY.toFixed(2)};})()`);
async function trial(){
  await ranks({}); await ev(`__game.loadLevel(1)`); await sleep(600);
  const a0=await assistPull();
  await ranks({steady:5}); await ev(`__game.loadLevel(1)`); await sleep(600);
  const a5=await assistPull();
  return {r0:a0.pull, r5:a5.pull, assist0:a0.assist, assist5:a5.assist, pass:(a0.pull<0.12 && a5.pull>0.30)};
}
console.log('--- with P4b insertion point (-12,16):');
await ev(`BP2.LEVELS[1].insert={x:-12,z:16,yaw:-1.135}`);
for(let i=0;i<5;i++) console.log('  ', JSON.stringify(await trial()));
console.log('--- with the pre-P4b insertion point (1.5,24.5):');
await ev(`BP2.LEVELS[1].insert={x:1.5,z:24.5,yaw:0}`);
for(let i=0;i<5;i++) console.log('  ', JSON.stringify(await trial()));
process.exit(0);
