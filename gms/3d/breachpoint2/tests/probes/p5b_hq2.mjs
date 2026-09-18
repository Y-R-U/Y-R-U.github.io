import {connect, sleep} from './lib.mjs';
const {send, ev, errors} = await connect();
await send('Runtime.enable'); await send('Page.enable');
await send('Page.navigate',{url:process.argv[2]+'/index.html'}); await sleep(2700);
for(const q of ['high','low']){
  await ev(`__game.S.quality='${q}';__game.S.bloom=0;__game.applySettings()`); await sleep(400);
  await ev(`__game.loadLevel(8)`); await ev(`__game.teleport(1.5,24.5);__game.look(0,0)`); await sleep(1500);
  const v=[];
  for(let i=0;i<9;i++){ await sleep(110); await ev(`__game.teleport(1.5,24.5);__game.look(0,0)`); v.push(await ev('__game.drawCalls()')); }
  v.sort((a,b)=>a-b);
  console.log(process.argv[3], q, 'median', v[v.length>>1], 'range', v[0]+'-'+v[v.length-1], 'alive', await ev('__game.Enemies.aliveCount()'));
}
process.exit(0);
