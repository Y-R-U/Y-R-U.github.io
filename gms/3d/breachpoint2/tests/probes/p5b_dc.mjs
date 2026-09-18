import {connect, sleep, URL} from './lib.mjs';
const {send, ev, errors} = await connect();
await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
await send('Page.navigate',{url:URL});
await sleep(2600);
await ev(`localStorage.removeItem('bp2_settings')`);
const PIN = `__game.S.quality='low';__game.S.bloom=0;__game.applySettings()`;
const POSE = `__game.teleport(1.5,24.5);__game.look(0,0)`;
const HIDE = `__game.Enemies.list().forEach(e=>{e.rig.root.visible=false;e.tag.sprite.visible=false;})`;

async function peak(n){
  await ev(PIN); await sleep(300);
  await ev(`__game.loadLevel(${n})`); await ev(POSE);
  let c=0, seen=[];
  for(let i=0;i<16;i++){ await sleep(100); if(i%3===0) await ev(POSE);
    const v=await ev('__game.drawCalls()'); seen.push(v); if(v>c)c=v; }
  seen.sort((a,b)=>a-b);
  return {peak:c, median:seen[seen.length>>1], all:seen.join(',')};
}
async function staticMed(n){
  await ev(PIN); await sleep(200);
  await ev(`__game.loadLevel(${n})`); await ev(POSE); await sleep(700);
  const v=[];
  for(let i=0;i<11;i++){ await sleep(110); await ev(HIDE); await ev(POSE); v.push(await ev('__game.drawCalls()')); }
  v.sort((a,b)=>a-b); return {median:v[v.length>>1], all:v.join(',')};
}
for(const lvl of [1,8]){
  const p=await peak(lvl), s=await staticMed(lvl);
  console.log(`L${lvl} live peak=${p.peak} median=${p.median}  [${p.all}]`);
  console.log(`L${lvl} static(rigs hidden) median=${s.median} [${s.all}]`);
}
// per-rig mesh count
const meshes = await ev(`(()=>{const e=__game.Enemies.list()[0];let n=0,mats=new Set();e.rig.root.traverse(o=>{if(o.isMesh){n++;mats.add(o.material.uuid);}});return {meshes:n,mats:mats.size};})()`);
console.log('rig mesh count', JSON.stringify(meshes));
const alive = await ev(`__game.Enemies.aliveCount()`);
console.log('alive on L8', alive);
console.log('errors', errors.length, errors.slice(0,3));
process.exit(0);
