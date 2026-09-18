import {connect,URL,sleep} from './lib.mjs';
const {send,ev}=await connect();
await send('Runtime.enable'); await send('Page.enable');
await send('Page.navigate',{url:URL}); await sleep(3000);
await ev(`__game.start()`); await sleep(400);
for(const [ox,oy] of [[-15.6,5.0],[-15.2,6.0],[-14.8,6.0],[-15.2,5.7]]){
  const r = await ev(`(()=>{const out=[];
    for(let i=0;i<__game.LAYOUTS.length;i++){ __game.setLayout(i);
      let clear=0,n=0;
      for(let z=-16; z<=14; z+=2){ n++;
        if(__game.losClear(${ox},${oy},-2, 10,1.5,z)) clear++; }
      out.push(__game.LAYOUTS[i].name+' '+clear+'/'+n); }
    return out.join(' · ');})()`);
  console.log(`eye (${ox}, ${oy}): ${r}`);
}
process.exit(0);
