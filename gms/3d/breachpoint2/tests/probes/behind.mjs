import {connect,URL,sleep} from './lib.mjs';
const {ws,ev,send}=await connect();
await send('Runtime.enable'); await send('Page.enable');
await send('Network.setCacheDisabled',{cacheDisabled:true});
await send('Page.navigate',{url:URL}); await sleep(3000);
await ev(`__game.start()`); await sleep(400);
console.log(await ev(`(()=>{const G=__game;
  G.teleport(1.5,24.5); G.look(0,0);           // facing -Z
  const out=[];
  for(const z of [14,34,-6]){                   // in front (-Z), behind (+Z)
    const p=new THREE.Vector3(1.5,1.25,z).project(G.camera);
    const cam=new THREE.Vector3(); G.camera.getWorldPosition(cam);
    const fwd=new THREE.Vector3(0,0,-1).transformDirection(G.camera.matrixWorld);
    const toT=new THREE.Vector3(1.5,1.25,z).sub(cam);
    out.push({z, ndc:[+p.x.toFixed(3),+p.y.toFixed(3),+p.z.toFixed(3)],
      passesTest:(p.z<=1 && Math.abs(p.x)<=1.08 && Math.abs(p.y)<=1.08),
      dotFwd:+toT.normalize().dot(fwd).toFixed(3)});
  }
  return JSON.stringify(out);})()`));
ws.close();process.exit(0);
