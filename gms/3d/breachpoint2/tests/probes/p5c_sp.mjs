import {connect, sleep, URL} from '../lib.mjs';
const {send, ev} = await connect();
await send('Page.enable'); await send('Runtime.enable');
await send('Network.setCacheDisabled',{cacheDisabled:true});
await send('Page.navigate',{url:URL+'?sp='+Date.now()});
await sleep(3200);

// a clean save, training done (training pays a flat 300 — the game's own number)
await ev(`(()=>{const P=__game.Profile; P.reset();
  const p=P.get(); p.trainingDone=true; P.award(300); P.save(); return p.sp;})()`);
// shorten the two timed objectives; SP does not depend on them
await ev(`(()=>{window.__hold=[__game.LEVELS[1].hold,__game.LEVELS[3].hold];
  __game.LEVELS[1].hold=4; __game.LEVELS[3].hold=4; return 1;})()`);

const rows=[];
for(let n=1;n<=8;n++){
  const before = await ev(`__game.Profile.get().sp`);
  await ev(`__game.loadLevel(${n})`);
  // wipe every wave, then sit in the zone if the objective wants one
  let ended=false;
  for(let t=0;t<200 && !ended;t++){
    const st = await ev(`(()=>{const g=__game;
      if(g.GAME.state!=='play') return {ended:true};
      const live=g.Enemies.active().filter(e=>e.alive);
      live.forEach(e=>g.Enemies.damage(e, 99999, false));
      const L=g.GAME.level;
      if(L.zone){ g.teleport(L.zone.x, L.zone.z); }
      return {ended:g.GAME.ended, alive:g.Enemies.active().filter(e=>e.alive).length,
              obj:g.objState(), killed:g.GAME.stats.kills};})()`);
    ended = st.ended;
    await sleep(260);
  }
  const after = await ev(`(()=>{const g=__game; return {sp:g.Profile.get().sp, won:!g.GAME.ended?null:true,
    br:g.GAME.sp, stats:g.GAME.stats, roster:g.GAME.rosterSize, cleared:g.Profile.cleared(${n})};})()`);
  rows.push({n, before, after:after.sp, gain:after.sp-before, cleared:after.cleared,
             kills:after.stats.kills, roster:after.roster, br:after.br});
  console.log(`L${n} +${after.sp-before}  total ${after.sp}  cleared=${after.cleared} kills ${after.stats.kills}/${after.roster} ` + JSON.stringify(after.br));
}
await ev(`(()=>{__game.LEVELS[1].hold=window.__hold[0]; __game.LEVELS[3].hold=window.__hold[1];})()`);
console.log('\nrunning total when you ARRIVE at each level (career SP = sp + spent, nothing spent here):');
let t=300; const arrive={1:300};
for(const r of rows){ console.log(`  arrive L${r.n}: ${r.before}`); }
console.log('after L8:', rows[rows.length-1].after);
console.log(JSON.stringify(rows.map(r=>[r.n,r.before,r.gain])));
process.exit(0);
