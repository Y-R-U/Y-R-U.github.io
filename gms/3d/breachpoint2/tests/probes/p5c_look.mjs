import {connect, sleep, URL} from '../lib.mjs';
const {send, ev} = await connect();
await send('Page.enable'); await send('Runtime.enable');
await send('Network.setCacheDisabled',{cacheDisabled:true});
await send('Page.navigate',{url:URL+'?look='+Date.now()});
await sleep(2800);
await ev(`(()=>{const P=__game.Profile; P.reset(); const p=P.get(); p.trainingDone=true;
  P.award(2600); P.clearLevel(4,161.5); P.clearLevel(2,120); P.setRank('plating',2); P.setRank('vitality',1); return 1;})()`);
for(let i=1;i<=4;i++){
  const h = await ev(`(()=>{__game.loadLevel(6); __game.GAME.lose('KILLED IN ACTION');
    return document.getElementById('debrief').textContent;})()`);
  console.log(`--- loss ${i} ---`);
  console.log(h? h.replace(/·/g,' | ') : '(nothing)');
}
process.exit(0);
