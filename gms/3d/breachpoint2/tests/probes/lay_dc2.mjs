import {connect,URL,sleep} from './lib.mjs';
const {send,ev,errors}=await connect();
await send('Runtime.enable'); await send('Page.enable');
await send('Page.navigate',{url:URL}); await sleep(3000);
await ev(`__game.start()`); await sleep(300);
const peak = async (n,pose)=>{
  await ev(`__game.S.quality='low';__game.S.bloom=0;__game.applySettings()`); await sleep(300);
  await ev(`__game.loadLevel(${n})`);
  if(pose) await ev(pose);
  let c=0,t=0;
  for(let i=0;i<16;i++){ await sleep(100); const s=await ev('({calls:__game.drawCalls(),tris:__game.tris()})');
    if(pose && i%3===0) await ev(pose);
    if(s.calls>c){c=s.calls;t=s.tris;} }
  return {calls:c,tris:t};
};
console.log('L1 at the OLD P1/P4a camera pose (1.5,24.5 facing -Z):',
  JSON.stringify(await peak(1,`__game.teleport(1.5,24.5);__game.look(0,0)`)));
console.log('L8 at the OLD camera pose:',
  JSON.stringify(await peak(8,`__game.teleport(1.5,24.5);__game.look(0,0)`)));
console.log('L1 at its new insertion point:', JSON.stringify(await peak(1,null)));
console.log('errors:',errors.length?errors:'none');
process.exit(0);
