import {connect,URL,sleep} from './lib.mjs';
const {send,ev,errors}=await connect();
await send('Runtime.enable'); await send('Page.enable');
await send('Page.navigate',{url:URL}); await sleep(3000);
await ev(`(()=>{const S=__game.S;S.quality='low';__game.applySettings();})()`);
await ev(`__game.start()`); await sleep(400);
async function med(n=9){
  const v=[];
  for(let i=0;i<n;i++){ await sleep(120); v.push(await ev('__game.drawCalls()')); }
  v.sort((a,b)=>a-b); return {med:v[(n/2)|0], all:v.join(',')};
}
const hideRigs=`(()=>{for(const e of __game.Enemies.list()) if(e.rig&&e.rig.root) e.rig.root.visible=false;return 1;})()`;
for(const lv of [1,2,3,4,5,6,7,8]){
  await ev(`__game.loadLevel(${lv})`); await sleep(500);
  await ev(hideRigs); await sleep(200);
  const m=await med();
  console.log(`L${lv} layout=${await ev('__game.layout()')} medianDraw(rigs hidden)=${m.med}  [${m.all}]`);
}
// isolate: what do the layout meshes cost?
await ev(`__game.loadLevel(1)`); await sleep(500); await ev(hideRigs); await sleep(200);
const withL=(await med()).med;
await ev(`(()=>{for(const m of __game.scene.children) if(m.name&&m.name.startsWith('layout')) m.visible=false;return 1;})()`);
await sleep(200);
const noL=(await med()).med;
console.log(`L1 with layout ${withL} -> layout meshes hidden ${noL}  (delta ${withL-noL})`);
// all five layouts visible at once
await ev(`(()=>{for(const m of __game.scene.children) if(m.name&&m.name.startsWith('layout')) m.visible=true;return 1;})()`);
await sleep(200);
console.log('all five layouts visible:', (await med()).med);
console.log('errors:', errors.length?errors:'none');
process.exit(0);
