import {connect,URL,sleep} from './lib.mjs';
const {send,ev,errors}=await connect();
await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
await send('Runtime.enable'); await send('Page.enable');
await send('Page.navigate',{url:URL}); await sleep(3000);
await ev(`localStorage.removeItem('bp2_profile')`);
await send('Page.navigate',{url:URL}); await sleep(3000);
await ev(`__game.start()`); await sleep(300);
const probe = async (steadyRank)=>{
  await ev(`(()=>{const P=BP2.Profile.get();P.upgrades={steady:${steadyRank}};BP2.Profile.save();return 1;})()`);
  await ev(`__game.loadLevel(1)`); await sleep(500);
  return ev(`(async()=>{const g=__game;g.S.aimAssist=1;g.S.mobileADS='off';
    const all=g.Enemies.list().filter(x=>x.active&&x.alive);
    const e=all[0];
    for(let i=1;i<all.length;i++) all[i].alive=false;
    const EX=1.5,EZ=10.5,EY=g.groundAt(1.5,10.5,6,0.3);
    g.teleport(1.5,24.5);
    g.look(0.42,0);
    const t0=performance.now();
    while(performance.now()-t0<900){ e.pos.set(EX,EY,EZ); await new Promise(r=>requestAnimationFrame(r)); }
    let d=g.player.yaw-0.42;
    const cam=g.camera; cam.updateWorldMatrix(true,false);
    const o=new (window.THREE.Vector3)().setFromMatrixPosition(cam.matrixWorld);
    const f=new (window.THREE.Vector3)(0,0,-1).transformDirection(cam.matrixWorld);
    const to=new (window.THREE.Vector3)(EX,EY+1.2,EZ).sub(o); const dist=to.length(); to.divideScalar(dist);
    return {pull:+Math.abs(d).toFixed(4), assistRank:g.RANKS.assist, EY:+EY.toFixed(2),
      liveAlive:g.Enemies.list().filter(x=>x.active&&x.alive).length,
      curAng:+Math.acos(Math.max(-1,Math.min(1,to.dot(f)))).toFixed(4),
      playerY:+g.player.pos.y.toFixed(2), px:+g.player.pos.x.toFixed(2), pz:+g.player.pos.z.toFixed(2),
      isTouch:'ontouchstart' in window || navigator.maxTouchPoints>0};})()`);
};
console.log('steady 0 ->', await probe(0));
console.log('steady 5 ->', await probe(5));
process.exit(0);
