import {connect,URL,sleep} from './lib.mjs';
const {ws,ev,send}=await connect();
await send('Runtime.enable'); await send('Page.enable');
await send('Network.setCacheDisabled',{cacheDisabled:true});
await send('Page.navigate',{url:URL}); await sleep(3000);
console.log(await ev(`(()=>{const A=__game.Armoury;
 const f=(n,p,v)=>{const s=A.survivalAt(n,p,v);return [n,p,v,+s.seconds.toFixed(3),A.fmtSec(s.seconds)]};
 return JSON.stringify([f(1,5,0),f(7,5,0),f(8,5,0),f(1,0,0),f(4,2,3),f(6,4,1),f(8,5,5)]);})()`));
ws.close();process.exit(0);
