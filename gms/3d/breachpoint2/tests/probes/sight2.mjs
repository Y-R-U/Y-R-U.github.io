import {connect,URL,sleep} from './lib.mjs';
const {send,ev}=await connect();
await send('Runtime.enable'); await send('Page.enable');
await send('Page.navigate',{url:URL}); await sleep(3000);
await ev(`__game.start()`); await sleep(400);
console.log(await ev(`(()=>{const out=[];
  for(let i=0;i<__game.LAYOUTS.length;i++){ __game.setLayout(i);
    let clear=0,n=0;
    for(let x=-6; x<=20; x+=2) for(let z=-16; z<=14; z+=3){ n++;
      if(__game.losClear(-15.2,6.0,-2, x,1.5,z)) clear++; }
    out.push(__game.LAYOUTS[i].name+': '+clear+'/'+n+' ('+(100*clear/n).toFixed(0)+'%)'); }
  return out.join('  |  ');})()`));
// and the same from a ground-level firing position in the yard, for contrast
console.log(await ev(`(()=>{const out=[];
  for(let i=0;i<__game.LAYOUTS.length;i++){ __game.setLayout(i);
    let clear=0,n=0;
    for(let x=-6; x<=20; x+=2) for(let z=-16; z<=14; z+=3){ n++;
      if(__game.losClear(-12,1.62,-2, x,1.5,z)) clear++; }
    out.push(__game.LAYOUTS[i].name+': '+clear+'/'+n+' ('+(100*clear/n).toFixed(0)+'%)'); }
  return out.join('  |  ');})()`));
process.exit(0);
