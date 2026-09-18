import {connect,URL,sleep} from './lib.mjs';
const {ws,send,ev,errors}=await connect();
await send('Runtime.enable');await send('Log.enable');await send('Page.enable');
await send('Network.setCacheDisabled',{cacheDisabled:true});
await send('Emulation.setDeviceMetricsOverride',{width:1000,height:620,deviceScaleFactor:1,mobile:false});
await send('Page.navigate',{url:URL});await sleep(3800);
for(let run=0;run<3;run++){
  await ev(`__game.S.quality='low';__game.S.bloom=0;__game.applySettings();__game.loadLevel(8);__game.god(true)`);
  await sleep(600);
  let best=0;
  for(let i=0;i<14;i++){await sleep(110);const c=await ev('__game.drawCalls()');if(c>best)best=c;}
  const info=await ev(`(()=>{const L=__game.Enemies.list().filter(e=>e.active);
    return {n:L.length, tags:L.filter(e=>e.tag.sprite.visible).length,
      dist:L.map(e=>+e.pos.distanceTo(__game.player.pos).toFixed(0)).sort((a,b)=>a-b),
      spawn:L.map(e=>[+e.pos.x.toFixed(1),+e.pos.z.toFixed(1)])};})()`);
  console.log('run',run,'peak',best,'tags',info.tags,'of',info.n,'dists',info.dist.join(','));
}
console.log(errors);
ws.close();process.exit(0);
