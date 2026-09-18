import {connect,URL,sleep} from './lib.mjs';
const {send,ev}=await connect();
await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
await send('Runtime.enable'); await send('Page.enable');
const ranks = async o => ev(`(()=>{const P=BP2.Profile;const d={vitality:0,plating:0,marksman:0,steady:0,logistics:0,mobility:0};
  Object.assign(d,${JSON.stringify(o)});for(const k in d)P.setRank(k,d[k]);return 1;})()`);
const pull = ()=>ev(`(async()=>{const g=__game;g.S.aimAssist=1;g.S.mobileADS='off';
  const all=g.Enemies.list().filter(x=>x.active&&x.alive);const e=all[0];
  for(let i=1;i<all.length;i++) all[i].alive=false;
  const EX=1.5,EZ=10.5,EY=g.groundAt(1.5,10.5,6,0.3);
  g.teleport(1.5,24.5); g.look(0.42,0);
  const t0=performance.now(); let maxSeen=0;
  while(performance.now()-t0<900){ e.pos.set(EX,EY,EZ);
    await new Promise(r=>requestAnimationFrame(r)); }
  let d=g.player.yaw-0.42;
  return {r:+Math.abs(d).toFixed(4), EY:+EY.toFixed(2), assist:+g.RANKS.assist.toFixed(2),
     start:[+all[0].spawnX,+0] };})()`);
for(let i=0;i<6;i++){
  await send('Page.navigate',{url:URL}); await sleep(2800);
  await ev(`localStorage.removeItem('bp2_profile')`);
  await ev(`__game.start()`); await sleep(300);
  await ranks({}); await ev(`__game.loadLevel(1);__game.god(true)`); await sleep(600);
  const a0 = await pull();
  await ranks({steady:5}); await ev(`__game.loadLevel(1);__game.god(true)`); await sleep(600);
  const a5 = await pull();
  console.log(`run ${i}: EY=${a0.EY} rank0 pull=${a0.r} (assist ${a0.assist}) | rank5 pull=${a5.r} (assist ${a5.assist}) -> ${a0.r<0.12&&a5.r>0.30?'PASS':'FAIL'}`);
}
process.exit(0);
