import {connect, sleep, URL} from './lib.mjs';
const {send, ev} = await connect();
await send('Runtime.enable'); await send('Page.enable');
await send('Page.navigate',{url:URL}); await sleep(2700);
await ev(`__game.S.quality='low';__game.applySettings();__game.loadLevel(1)`); await sleep(1200);
console.log(await ev(`(()=>{const e=__game.Enemies.list()[0];const out=[];
  e.rig.root.traverse(o=>{if(o.isMesh) out.push({name:o.name||'-', vis:o.visible, mat:o.material.uuid.slice(0,6),
    col:o.material.color.getHex().toString(16), vcol:!!o.material.vertexColors, type:o.material.type});});
  return out;})()`));
console.log('--- non-white world colour attrs ---');
console.log(await ev(`(()=>{const out=[];
  __game.scene.traverse(o=>{ if(!o.isMesh||o.name.indexOf('enemyLOD')===0) return;
    const c=o.geometry.attributes.color; if(!c||o.material.vertexColors) return;
    let nw=0; for(let i=0;i<c.array.length;i++) if(c.array[i]!==1) nw++;
    if(nw) out.push({name:o.name||'-', type:o.material.type, mcol:o.material.color.getHex().toString(16), nonwhite:nw, len:c.array.length});});
  return out.slice(0,25);})()`));
process.exit(0);
