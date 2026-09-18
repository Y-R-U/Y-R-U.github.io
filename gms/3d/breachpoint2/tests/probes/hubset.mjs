import {connect,URL,sleep} from './lib.mjs';
const {ws,send,ev,errors}=await connect();
await send('Runtime.enable');await send('Log.enable');await send('Page.enable');
await send('Network.setCacheDisabled',{cacheDisabled:true});
await send('Page.navigate',{url:'about:blank'});await sleep(300);errors.length=0;
await send('Page.navigate',{url:URL});await sleep(3600);
await ev(`(()=>{const P=BP2.Profile.get();P.trainingDone=true;P.cleared={0:1,1:1};P.level=2;BP2.Profile.save();
  BP2.Campaign.openHub('start');return 1})()`);await sleep(300);
await ev(`document.getElementById('btnHubSet').click()`);await sleep(300);
console.log('in settings', await ev(`({set:!document.getElementById('setScreen').classList.contains('hidden'),hub:BP2.Campaign.hubVisible()})`));
await ev(`document.getElementById('btnSetClose').click()`);await sleep(300);
console.log('back     ', await ev(`({set:!document.getElementById('setScreen').classList.contains('hidden'),hub:BP2.Campaign.hubVisible(),start:!document.getElementById('startScreen').classList.contains('hidden')})`));
// and the normal path from the start screen is unaffected
await ev(`BP2.Campaign.closeHub();document.getElementById('btnSettings').click()`);await sleep(300);
await ev(`document.getElementById('btnSetClose').click()`);await sleep(300);
console.log('start path', await ev(`({set:!document.getElementById('setScreen').classList.contains('hidden'),hub:BP2.Campaign.hubVisible(),start:!document.getElementById('startScreen').classList.contains('hidden')})`));
console.log('errors',errors);ws.close();process.exit(0);
