import {connect,URL,sleep} from './lib.mjs';
const {ws,send,ev}=await connect();
await send('Runtime.enable'); await send('Page.enable');
await send('Network.setCacheDisabled',{cacheDisabled:true});
await send('Emulation.setDeviceMetricsOverride',{width:1000,height:620,deviceScaleFactor:1,mobile:false});
await send('Page.navigate',{url:URL}); await sleep(3600);
await ev(`localStorage.removeItem('bp2_settings')`);
await send('Page.navigate',{url:URL}); await sleep(3600);
const peak = async n=>{
  await ev(`__game.S.quality='low';__game.S.bloom=0;__game.applySettings()`); await sleep(300);
  await ev(`__game.loadLevel(${n})`);
  let best=0;
  for(let i=0;i<16;i++){ await sleep(100); const c=await ev(`__game.drawCalls()`); if(c>best) best=c; }
  return best;
};
const runs=[];
for(let i=0;i<7;i++) runs.push(await peak(8));
runs.sort((a,b)=>a-b);
console.log('L8 peaks:', runs.join(','), ' median', runs[3]);
// static world only, rigs hidden, MEDIAN not peak (PIPELINE trap)
await ev(`__game.S.quality='low';__game.applySettings();__game.loadLevel(8)`); await sleep(400);
await ev(`__game.Enemies.list().forEach(e=>{if(e.group)e.group.visible=false;if(e.root)e.root.visible=false;})`);
const st=[]; for(let i=0;i<11;i++){ await sleep(120); st.push(await ev(`__game.drawCalls()`)); }
st.sort((a,b)=>a-b);
console.log('L8 static world (rigs hidden) median:', st[5], ' all', st.join(','));
console.log('L1 peak:', await peak(1));
ws.close(); process.exit(0);
