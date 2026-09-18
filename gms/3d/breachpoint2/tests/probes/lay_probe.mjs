import {connect,URL,sleep} from './lib.mjs';
const {send,ev,errors}=await connect();
await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
await send('Page.navigate',{url:URL}); await sleep(3500);
console.log('boot errors:', errors.length? errors : 'none');
console.log(await ev(`(()=>{const g=__game; return {
  solids:g.solids.length, rects:g.mapRects.length,
  lay:g.layoutInfo(), levels:g.LEVELS.map(l=>l.layout)};})()`));
await ev(`__game.applySettings&&0`);
for(let n=0;n<=9;n++){
  const r=await ev(`(()=>{__game.loadLevel(${n});const li=__game.layoutInfo();const ins=__game.insertPoint();
    const p=__game.player.pos;
    return {n:${n}, lay:li.id, name:li.name, cover:li.cover, bakes:li.bakes, onSolids:li.solids, off:li.offSolids,
      vis:li.visibleMeshes, meshes:li.meshes, colliders:li.colliders,
      px:+p.x.toFixed(2), py:+p.y.toFixed(2), pz:+p.z.toFixed(2), stuck:__game.insideSolid()};})()`);
  console.log(JSON.stringify(r));
}
console.log('errors after:', errors.length? errors : 'none');
process.exit(0);
