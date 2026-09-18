import {connect,URL,sleep} from './lib.mjs';
const {ws,send,ev}=await connect();
await send('Runtime.enable');await send('Page.enable');
await send('Network.setCacheDisabled',{cacheDisabled:true});
await send('Page.navigate',{url:URL});await sleep(3800);
console.log(await ev(`({W:innerWidth,H:innerHeight,dpr:devicePixelRatio,q:__game.S.quality,shadows:__game.renderer.shadowMap.enabled,touchMode:__game.S.touchMode})`));
await ev('__game.Profile.reset();__game.loadLevel(1)');
let peak=0; for(let i=0;i<16;i++){await sleep(100);const c=await ev('__game.drawCalls()');if(c>peak)peak=c;}
console.log('L1 peak draw calls', peak);
console.log(await ev(`(()=>{let n=0,byType={};__game.scene.traverse(o=>{if(o.visible&&(o.isMesh||o.isSprite||o.isInstancedMesh)){n++;const k=o.type+'|'+(o.geometry&&o.geometry.type);byType[k]=(byType[k]||0)+1;}});return {n,byType};})()`));
ws.close();
