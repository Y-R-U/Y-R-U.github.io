import {connect,URL,sleep} from './lib.mjs';
const {ws,send,ev,errors}=await connect();
await send('Runtime.enable');await send('Log.enable');await send('Page.enable');
await send('Network.setCacheDisabled',{cacheDisabled:true});
await send('Page.navigate',{url:'about:blank'});await sleep(300);errors.length=0;
await send('Page.navigate',{url:URL});await sleep(3800);
console.log('errors:', errors);
console.log(await ev(`({state:__game.GAME.state, light:__game.lightState(), obj:__game.objState(),
  campaign:!!BP2.Campaign, dc:__game.drawCalls(), quay:[__game.QUAY_X0,__game.QUAY_X1]})`));
ws.close();
