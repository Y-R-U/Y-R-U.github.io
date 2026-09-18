import {connect,URL,sleep} from './lib.mjs';
const {ws,send,ev}=await connect();
await send('Runtime.enable'); await send('Page.enable');
await send('Network.setCacheDisabled',{cacheDisabled:true});
await send('Emulation.setDeviceMetricsOverride',{width:1000,height:620,deviceScaleFactor:1,mobile:false});
await send('Page.navigate',{url:URL}); await sleep(3600);
const poll=async(expr,want,ms=5000,step=200)=>{const t0=Date.now();let v=null;
  while(Date.now()-t0<ms){v=await ev(expr);if(want(v))return v;await sleep(step);} return v;};
for(let i=0;i<5;i++){
  await ev(`(()=>{__game.loadLevel(4);__game.god(true);return 1})()`); await sleep(400);
  await ev(`(()=>{const b=__game.Enemies.list().filter(e=>e.boss)[0];
    __game.teleport(1.5,24.5);__game.look(Math.PI,0);
    b.pos.set(1.5,0,14);b.rig.root.position.copy(b.pos);b.state='combat';b.sawPlayer=true;return 1;})()`);
  const s=await poll(`(()=>{const b=__game.Enemies.list().filter(e=>e.boss)[0];
    b.pos.set(1.5,0,14);b.rig.root.position.copy(b.pos);b.vel.set(0,0,0);
    return BP2.Campaign.bossState();})()`, s=>s.bar&&s.banner, 5000, 200);
  console.log('run '+i+': '+JSON.stringify(s));
}
ws.close(); process.exit(0);
