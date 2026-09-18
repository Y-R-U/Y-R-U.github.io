import {connect,URL,sleep} from './lib.mjs';
import {writeFileSync} from 'fs';
const {ws,send,ev}=await connect();
await send('Runtime.enable');await send('Page.enable');
await send('Network.setCacheDisabled',{cacheDisabled:true});
await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
const win=(await send('Browser.getWindowForTarget')).result;
for(const [name,w,h] of [['intro_portrait',390,844],['intro_landscape',844,390]]){
  await send('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:2,mobile:true});
  await send('Page.navigate',{url:'about:blank'}); await sleep(250);
  await send('Page.navigate',{url:URL}); await sleep(3600);
  await ev(`localStorage.removeItem('bp2_profile');localStorage.removeItem('bp2_settings')`);
  await send('Page.navigate',{url:URL}); await sleep(3600);
  const r=await send('Page.captureScreenshot',{format:'png'});
  writeFileSync(name+'.png', Buffer.from(r.result.data,'base64'));
  console.log(name, await ev(`({intro:BP2.Tutorial.introVisible(), state:__game.GAME.state})`));
}
// and the tutorial bar mid-drill, portrait
await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});
await send('Page.navigate',{url:URL}); await sleep(3600);
await ev(`document.getElementById('btnIntroGo').click()`); await sleep(1500);
const r=await send('Page.captureScreenshot',{format:'png'});
writeFileSync('drill_portrait.png', Buffer.from(r.result.data,'base64'));
await send('Emulation.clearDeviceMetricsOverride');
await send('Emulation.setTouchEmulationEnabled',{enabled:false});
await send('Browser.setWindowBounds',{windowId:win.windowId,bounds:win.bounds});
ws.close();
