import {connect, sleep, URL} from './lib.mjs';
const {send, ev, errors} = await connect();
await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
await send('Page.navigate',{url:URL}); await sleep(2700);
for(const q of ['high','medium','low']){
  await ev(`__game.S.quality='${q}';__game.applySettings()`); await sleep(400);
  await ev(`__game.loadLevel(8);__game.teleport(1.5,24.5);__game.look(0,0)`); await sleep(1400);
  const li=await ev(`__game.Enemies.lodInfo()`);
  console.log(q, 'calls', await ev('__game.drawCalls()'), 'near/mid/far', li.near, li.mid, li.far,
    'shadows', await ev('__game.renderer.shadowMap.enabled'));
}
console.log('errors', errors.filter(e=>!/CANARY/.test(e)).length, errors.slice(0,3));
process.exit(0);
