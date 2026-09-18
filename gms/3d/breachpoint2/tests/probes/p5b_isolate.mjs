/* isolate each of the three fixes at the reference pose, same run, quality pinned */
import {connect, sleep, URL} from './lib.mjs';
const {send, ev} = await connect();
await send('Runtime.enable'); await send('Page.enable');
await send('Page.navigate',{url:URL}); await sleep(2800);
const PIN=`__game.S.quality='low';__game.S.bloom=0;__game.applySettings()`;
const POSE=`__game.teleport(1.5,24.5);__game.look(0,0)`;
// forcing boss=true is the game's own never-LOD lever: it pins tier 0 without
// touching materials (applyTier is not re-run) or the hit path
// snapshot ONCE per level. Re-snapshotting inside the sample loop overwrites the
// saved flags with the forced ones and the restore silently becomes a no-op —
// which is exactly how the first run of this probe reported both columns equal.
const SNAP  =`__game.Enemies.list().forEach(e=>{e.__b=e.boss})`;
const ALL_T0=`__game.Enemies.list().forEach(e=>{e.boss=true})`;
const REST  =`__game.Enemies.list().forEach(e=>{if(e.__b!==undefined)e.boss=e.__b})`;
const med = async (pre)=>{ const v=[];
  for(let i=0;i<11;i++){ await sleep(120); await ev(pre); await ev(POSE); v.push(await ev('__game.drawCalls()')); }
  v.sort((a,b)=>a-b); return v[v.length>>1]; };
for(const n of [1,8]){
  await ev(PIN); await sleep(250);
  await ev(`__game.loadLevel(${n})`); await ev(POSE); await sleep(1300);
  await ev(SNAP);
  const bossCount = await ev(`__game.Enemies.list().filter(e=>e.active&&e.__b).length`);
  const full = await med(REST);
  const t0   = await med(ALL_T0);
  await ev(REST); await sleep(500); await ev(POSE); await sleep(400);
  const d = await ev(`(()=>{const G=__game;return G.Enemies.list().filter(e=>e.active&&e.alive)
    .map(e=>+G.player.pos.distanceTo(e.pos).toFixed(1));})()`);
  const tagBand = d.filter(x=>x>34 && x<38).length;
  const far = d.filter(x=>x>34).length, mid=d.filter(x=>x>25&&x<=34).length, near=d.filter(x=>x<=25).length;
  console.log(`L${n}: bosses=${bossCount} full=${full}  allTier0(fix1 only)=${t0}  | alive=${d.length} near${near}/mid${mid}/far${far}`
    + `  tags in the 34-38m band (all fix 3 can save here) = ${tagBand}`);
  console.log(`   distances: ${d.join(', ')}`);
}
process.exit(0);
