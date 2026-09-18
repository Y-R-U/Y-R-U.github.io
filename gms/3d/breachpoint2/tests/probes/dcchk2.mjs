import {connect,URL,sleep} from './lib.mjs';
const {ws,send,ev}=await connect();
await send('Runtime.enable');await send('Page.enable');
await send('Emulation.clearDeviceMetricsOverride');
await send('Emulation.setTouchEmulationEnabled',{enabled:false});
await send('Network.setCacheDisabled',{cacheDisabled:true});
await send('Page.navigate',{url:URL});await sleep(3800);
console.log(await ev(`({W:innerWidth,H:innerHeight,q:__game.S.quality,shadows:__game.renderer.shadowMap.enabled})`));
for(const n of [1,8]){
  await ev(`__game.Profile.reset();__game.loadLevel(${n})`);
  let peak=0,tri=0; for(let i=0;i<16;i++){await sleep(100);const c=await ev('({c:__game.drawCalls(),t:__game.tris()})');if(c.c>peak){peak=c.c;tri=c.t;}}
  console.log('L'+n+' peak draw calls', peak, 'tris', tri);
}
ws.close();
