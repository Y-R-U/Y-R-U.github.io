import {connect,URL,sleep} from './lib.mjs';
const {ws,send,ev,errors}=await connect();
await send('Runtime.enable');await send('Log.enable');await send('Page.enable');
await send('Network.setCacheDisabled',{cacheDisabled:true});
await send('Emulation.setDeviceMetricsOverride',{width:1000,height:620,deviceScaleFactor:1,mobile:false});
await send('Page.navigate',{url:URL});await sleep(3800);
const peak=async n=>{await ev(`__game.S.quality='low';__game.S.bloom=0;__game.applySettings()`);await sleep(300);
  await ev(`__game.loadLevel(${n})`);let c=0;
  for(let i=0;i<16;i++){await sleep(100);const s=await ev('__game.drawCalls()');if(s>c)c=s;}return c;};
for(let i=0;i<4;i++) console.log('L1 peak', await peak(1));
// isolate the dock's own cost: same frame, water and zone marker switched off
await ev(`__game.loadLevel(1)`); await sleep(900);
const iso = await ev(`(()=>{
  const w=__game.scene.children.filter(o=>o.name==='water')[0];
  const z=__game.scene.children.filter(o=>o.isMesh&&o.material&&o.material.fog===false&&o.renderOrder===2)[0];
  return {water:!!w, zone:!!z, zv:z.visible};})()`);
console.log(iso);
const off=async(expr)=>{await ev(expr); await sleep(400); let c=0;
  for(let i=0;i<8;i++){await sleep(90); const s=await ev('__game.drawCalls()'); if(s>c)c=s;} return c;};
await ev(`__game.teleport(1.5,24.5);__game.look(0,0)`);
console.log('both on ', await off(`(()=>{const w=__game.scene.children.filter(o=>o.name==='water')[0];
  const z=__game.scene.children.filter(o=>o.isMesh&&o.material&&o.material.fog===false&&o.renderOrder===2)[0];
  w.visible=true; z.visible=true; return 1;})()`));
console.log('water off', await off(`__game.scene.children.filter(o=>o.name==='water')[0].visible=false`));
console.log('zone off ', await off(`__game.scene.children.filter(o=>o.isMesh&&o.material&&o.material.fog===false&&o.renderOrder===2)[0].visible=false`));
console.log(errors);
ws.close();process.exit(0);
