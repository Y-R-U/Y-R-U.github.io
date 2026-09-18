import {connect, sleep} from './lib.mjs';
const url=process.argv[2], tag=process.argv[3], reps=+(process.argv[4]||3);
for(let r=0;r<reps;r++){
  const {send, ev} = await connect();
  await send('Runtime.enable'); await send('Page.enable');
  await send('Page.navigate',{url:url+'/index.html'}); await sleep(2700);
  const insMain = await ev(`(()=>{const out=[];
    for(let n=0;n<10;n++){ __game.loadLevel(n);
      const ins=__game.insertPoint(); let ok=true, bad=[];
      for(const [cx,cz] of [[-27,-27],[-27,24],[24,-27],[24,24]]){
        const q=__game.navPath(ins.x,ins.z,cx,cz); if(!q.ok){ ok=false; bad.push(cx+','+cz);} }
      out.push({n, lay:__game.layout(), ok, bad:bad.join(' ')}); }
    return out;})()`);
  const bad=insMain.filter(c=>!c.ok);
  console.log(`${tag} run${r+1}: ${bad.length? 'FAIL '+bad.map(c=>`L${c.n}(lay${c.lay}) corners[${c.bad}]`).join(' ') : 'all 10 ok'}`);
}
process.exit(0);
