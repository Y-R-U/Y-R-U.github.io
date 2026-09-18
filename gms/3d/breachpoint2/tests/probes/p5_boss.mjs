/* P5a — the boss announce is LATCHED: it must fire for a player who never
   looks at the boss. The camera is pointed AWAY the whole time and checked
   every poll; if it ever framed the boss the run is void.
   Canary at the end: suppress the latch and prove the assertion fails.     */
import {connect,URL,sleep} from './lib.mjs';
const {ws,send,ev,errors}=await connect();
await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
await send('Network.setCacheDisabled',{cacheDisabled:true});
await send('Page.navigate',{url:'about:blank'}); await sleep(300);
await send('Page.navigate',{url:URL}); await sleep(3200);
let pass=0, fail=0;
const ok=(n,c,i)=>{ if(c){pass++;console.log('PASS  '+n+(i?'   '+i:''));} else {fail++;console.log('FAIL  '+n+'   '+(i||''));} };
await ev(`__game.S.quality='low';__game.S.bloom=0;__game.applySettings();__game.start()`);
await sleep(400);

// helper: is the boss inside the frustum right now (the OLD trigger)?
const SEEN = `(()=>{const b=__game.Enemies.list().filter(e=>e.boss&&e.alive)[0];
  if(!b) return null;
  const v=new THREE.Vector3(b.pos.x,b.pos.y+1.25,b.pos.z).project(__game.camera);
  return {onScreen:(v.z<=1 && Math.abs(v.x)<=1.08 && Math.abs(v.y)<=1.08),
          d:+Math.hypot(b.pos.x-__game.player.pos.x,b.pos.z-__game.player.pos.z).toFixed(1),
          name:b.name, saw:b.sawPlayer};})()`;

async function run(levelN, label){
  // load the level, park the boss behind the player, and keep looking the other way
  await ev(`(()=>{__game.god(true);__game.loadLevel(${levelN});return 1})()`); await sleep(500);
  await ev(`(()=>{const G=__game;
    G.GAME.state='play'; G.GAME.graceT=1e6;
    G.teleport(1.5,24.5); G.look(0,0);          // facing -Z; the boss goes to +Z, behind
    const b=G.Enemies.list().filter(e=>e.boss)[0];
    b.pos.set(1.5,0,34); b.rig.root.position.copy(b.pos); b.vel.set(0,0,0);
    b.state='combat'; b.sawPlayer=true;
    return b.name;})()`);
  let everSeen=false, st=null, t0=Date.now(), frames=0;
  while(Date.now()-t0 < 9000){
    await sleep(250);
    const s = await ev(`(()=>{const G=__game;
      const b=G.Enemies.list().filter(e=>e.boss)[0];
      b.pos.set(1.5,0,34); b.rig.root.position.copy(b.pos); b.vel.set(0,0,0);
      G.teleport(1.5,24.5); G.look(0,0); G.GAME.graceT=1e6;
      return Object.assign({}, BP2.Campaign.bossState(), ${SEEN});})()`);
    frames++;
    if(s.onScreen) everSeen=true;
    st=s;
    if(s.banner) break;
  }
  const elapsed=(Date.now()-t0)/1000;
  ok(`${label}: the boss announce fires WITHOUT the player ever looking at it`,
     st && st.banner===true && st.bannerName===st.name && !everSeen,
     JSON.stringify({banner:st&&st.banner, bannerName:st&&st.bannerName, boss:st&&st.name,
                     everOnScreen:everSeen, afterSec:+elapsed.toFixed(1), polls:frames}));
  return {everSeen, st, elapsed};
}

console.log('=== the latch, on the two levels where it matters most ===');
await run(4, 'L4 NIGHTFALL (night)');
await run(7, 'L7 BLACKOUT (nightfog)');

// and first SIGHT must still be instant — the latch must not have replaced it
await ev(`(()=>{__game.god(true);__game.loadLevel(4);return 1})()`); await sleep(500);
const sight = await ev(`(()=>{const G=__game;
  G.GAME.state='play'; G.GAME.graceT=1e6;
  const b=G.Enemies.list().filter(e=>e.boss)[0];
  G.teleport(1.5,24.5); G.look(Math.PI,0);
  b.pos.set(1.5,0,34); b.rig.root.position.copy(b.pos); b.vel.set(0,0,0); b.sawPlayer=false;
  return 1;})()`);
await sleep(500);
const seenFast = await ev(`BP2.Campaign.bossState()`);
ok('first SIGHT still announces immediately (well inside the 3 s latch)',
   seenFast.banner===true, JSON.stringify(seenFast));

/* ---- canaries ----------------------------------------------------------- */
try{ await ev(`(()=>{throw new Error('CANARY')})()`); }catch(e){}
await ev(`setTimeout(()=>{throw new Error('CANARY')},0)`); await sleep(300);
ok('CANARY(errors): the collector sees a thrown error', errors.some(e=>/CANARY/.test(e)),
   (errors.find(e=>/CANARY/.test(e))||'').slice(0,40));
for(let i=errors.length-1;i>=0;i--) if(/CANARY/.test(errors[i])) errors.splice(i,1);

// gameplay canary: suppress the announce entirely and re-run the same check.
// If it still "passes", the assertion above was never testing anything.
await send('Page.navigate',{url:URL}); await sleep(3200);
await ev(`__game.S.quality='low';__game.applySettings();__game.start()`); await sleep(300);
await ev(`(()=>{const el=document.getElementById('bossBanner');
  // freeze the banner shut: whatever campaign.js does, it stays hidden
  const obs=new MutationObserver(()=>{ if(!el.classList.contains('hidden')) el.classList.add('hidden'); });
  obs.observe(el,{attributes:true,attributeFilter:['class']});
  window.__suppressed=true; return 1;})()`);
await ev(`(()=>{__game.god(true);__game.loadLevel(4);return 1})()`); await sleep(500);
await ev(`(()=>{const G=__game; G.GAME.state='play'; G.GAME.graceT=1e6;
  const b=G.Enemies.list().filter(e=>e.boss)[0];
  G.teleport(1.5,24.5); G.look(0,0);
  b.pos.set(1.5,0,34); b.rig.root.position.copy(b.pos); b.state='combat'; b.sawPlayer=true; return 1;})()`);
let can=null;
for(let i=0;i<36 && !(can&&can.banner); i++){ await sleep(250);
  can = await ev(`(()=>{const G=__game;const b=G.Enemies.list().filter(e=>e.boss)[0];
    b.pos.set(1.5,0,34); b.rig.root.position.copy(b.pos); G.teleport(1.5,24.5); G.look(0,0);
    G.GAME.graceT=1e6; return BP2.Campaign.bossState();})()`); }
ok('CANARY(gameplay): with the banner suppressed the same check FAILS',
   can && can.banner===false, JSON.stringify(can));

console.log('\n'+pass+' passed, '+fail+' failed');
console.log('ERRORS: '+JSON.stringify(errors.filter(e=>!/CANARY/.test(e))));
ws.close(); process.exit(fail?1:0);
