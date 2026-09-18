import {connect,URL,sleep} from './lib.mjs';
const {ws,send,ev,errors}=await connect();
await send('Runtime.enable');await send('Log.enable');await send('Page.enable');
await send('Network.setCacheDisabled',{cacheDisabled:true});
await send('Emulation.setDeviceMetricsOverride',{width:1000,height:620,deviceScaleFactor:1,mobile:false});
await send('Page.navigate',{url:URL});await sleep(3800);
await ev(`__game.S.quality='low';__game.S.bloom=0;__game.applySettings();__game.loadLevel(8);__game.god(true)`);
await sleep(1200);
// FREEZE the AI so the frustum stops moving, then isolate the dock's own cost
await ev(`__game.Enemies.list().forEach(e=>{e.active&&(e.update=function(){})});__game.teleport(1.5,24.5);__game.look(0,0)`);
const m=async()=>{let c=0;for(let i=0;i<8;i++){await sleep(90);const s=await ev('__game.drawCalls()');if(s>c)c=s;}return c;};
console.log('frozen, dock on :', await m());
await ev(`__game.scene.children.filter(o=>o.name==='water')[0].visible=false`);
console.log('frozen, water off:', await m());
const eOnly=await ev(`(()=>{let n=0;__game.Enemies.list().forEach(e=>{if(e.active){e.rig.root.visible=false;n++}});return n;})()`);
console.log('frozen, '+eOnly+' enemies hidden:', await m());
console.log(errors); ws.close(); process.exit(0);
