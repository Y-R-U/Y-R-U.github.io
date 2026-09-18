import {connect,URL,sleep} from './lib.mjs';
const {ws,send,ev}=await connect();
await send('Runtime.enable');await send('Page.enable');
const a=(await send('Browser.getWindowForTarget')).result;
console.log('before', JSON.stringify(a));
await send('Page.navigate',{url:URL});await sleep(2500);
console.log('inner', await ev('({w:innerWidth,h:innerHeight})'));
ws.close();
