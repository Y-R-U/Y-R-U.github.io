/* P5a — CONFIRM + NUMBERS.
   1. per-tier fire cadence, against a Monte-Carlo run of the engine's own loop
   2. the survival readout vs the REAL damagePlayer pipeline, all 8 levels
   3. the TTD curve and the spTarget change; TIERS byte-identical
   4. the boss announce latch — fires without the player ever looking
   5. profile schema versioning + a v0 save that must migrate, not be discarded
   canaries: a thrown error, and the announce suppressed.                    */
import {connect,URL,sleep} from './lib.mjs';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const ROOT='/Users/aaronair/cc/yru/site/gms/3d/breachpoint2/';
const src=f=>readFileSync(ROOT+f,'utf8');
const md5=s=>createHash('md5').update(s).digest('hex');

const {ws,send,ev,errors}=await connect();
await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
await send('Network.setCacheDisabled',{cacheDisabled:true});
let pass=0, fail=0; const fails=[];
const ok=(n,c,i)=>{ if(c){pass++;console.log('PASS  '+n+(i?'   '+i:''));}
  else {fail++;fails.push(n);console.log('FAIL  '+n+'   '+(i||''));} };
const nav=async()=>{ await send('Page.navigate',{url:URL}); await sleep(3000);
  await ev(`__game.S.quality='low';__game.S.bloom=0;__game.applySettings()`); };
await nav();

/* ---- 0. error canary ---------------------------------------------------- */
try{ await ev(`(()=>{throw new Error('CANARY')})()`); }catch(e){}
await ev(`setTimeout(()=>{throw new Error('CANARY')},0)`); await sleep(400);
ok('CANARY(errors): the collector sees a thrown error', errors.some(e=>/CANARY/.test(e)),
   (errors.find(e=>/CANARY/.test(e))||'').slice(0,46));
const dropCanary=()=>{ for(let i=errors.length-1;i>=0;i--) if(/CANARY/.test(errors[i])) errors.splice(i,1); };
dropCanary();

/* ---- 1. per-tier fire cadence ------------------------------------------- */
console.log('\n=== 1. PER-TIER FIRE CADENCE, DERIVED FROM §ENEMIES ===');
const cad = await ev(`(()=>{
  const B=window.BP2, A=window.__game.Armoury;
  const rand=(a,b)=>a+Math.random()*(b-a), randi=(a,b)=>Math.floor(rand(a,b+1));
  const lerp=(a,b,t)=>a+(b-a)*t;
  // a line-for-line copy of the firing block in §ENEMIES, run for 20000 s
  function loop(t, far){
    let fireCD=0,burst=0,burstT=0,shots=0,time=0,dt=1/60;
    for(let i=0;i<1200000;i++){
      fireCD-=dt;
      if(burst>0){ burstT-=dt; if(burstT<=0){ shots++; burst--; burstT=0.115; } }
      else if(fireCD<=0){ burst=randi(3,5)+(t.accuracy>0.7?1:0); burstT=0;
        fireCD=(rand(0.75,1.6)+(far?0.5:0))*lerp(1,t.reaction,0.5); }
      time+=dt;
    }
    return shots/time;
  }
  return ['militia','regular','veteran','shock','praetor'].map(k=>{
    const t=B.TIERS[k];
    return {tier:k, burst:A.burstOf(t), sim:+loop(t,true).toFixed(3), close:+loop(t,false).toFixed(3),
      model:+A.cadenceOf(t).toFixed(3), flat:+(4/1.6).toFixed(3),
      land:+(A.cadenceOf(t)*t.accuracy*A.MODEL.HIT_RATE).toFixed(3)};
  });})()`);
for(const c of cad) console.log('   '+c.tier.padEnd(9)+'burst '+c.burst+'  sim>22m '+c.sim+
  '  model '+c.model+'  (close '+c.close+', old flat '+c.flat+')  landing/s '+c.land);
// the model is the continuous limit; the sim steps at 1/60 s, so every wait
// rounds up to the next frame and the sim reads ~1% LOW. Consistent, one-sided,
// and far inside the margin the readout needs.
ok('the model\'s cadence matches a Monte-Carlo run of the engine\'s own fire loop, every tier',
   cad.every(c=>{const d=(c.model-c.sim)/c.sim; return d>0 && d<0.02;}),
   cad.map(c=>c.tier+' '+c.model+'/'+c.sim+' '+(((c.model-c.sim)/c.sim*100).toFixed(2))+'%').join(' · '));
ok('and it is NOT the old flat 2.5 rounds/s — the tiers separate',
   cad.every(c=>Math.abs(c.model-2.5)>0.05) && cad[4].model>cad[0].model*1.6,
   'militia '+cad[0].model+' -> praetor '+cad[4].model);
ok('the burst is 5 above accuracy 0.7 and 4 below it, as randi(3,5)+1 says',
   cad.filter(c=>c.burst===5).length===2 && cad[3].burst===5 && cad[4].burst===5 && cad[0].burst===4,
   cad.map(c=>c.tier+':'+c.burst).join(' '));

/* ---- 2. the readout vs the REAL damagePlayer pipeline -------------------- */
console.log('\n=== 2. THE READOUT vs THE REAL damagePlayer PIPELINE ===');
const table = await ev(`(()=>{
  const B=window.BP2, G=window.__game, A=G.Armoury, CUM=[0,150,500,1200,2500,4700], out=[];
  for(let n=1;n<=8;n++){
    const lvl=B.levelById(n), sp=lvl.spTarget;
    let best=null;
    for(let p=0;p<6;p++)for(let v=0;v<6;v++)for(let m=0;m<6;m++){
      if(CUM[p]+CUM[v]+CUM[m]>sp) continue;
      const sc=A.survival(lvl,p,v).seconds*1000+m;     // marksman breaks ties only
      if(!best||sc>best.sc) best={p,v,m,sc};
    }
    const s=A.survival(lvl,best.p,best.v);
    out.push({n,name:lvl.name,sp,p:best.p,v:best.v,build:'P'+best.p+'V'+best.v+'M'+best.m,
      tier:s.tier,att:s.attackers,rounds:+s.rounds.toFixed(3),hpHit:+s.hpPerHit.toFixed(2),
      pool:s.pool,maxHp:s.maxHp,armourSec:+s.armourSec.toFixed(2),ttd:+s.seconds.toFixed(2),
      band:A.BANDS[A.band(s.seconds)].label});
  }
  return out;})()`);
const real=[];
for(const r of table){
  real.push(await ev(`(async()=>{
    const B=window.BP2,G=window.__game,A=G.Armoury,P=B.Profile;
    const nap=ms=>new Promise(z=>setTimeout(z,ms));
    const n=${r.n},p=${r.p},v=${r.v};
    P.setRank('plating',p); P.setRank('vitality',v); G.applyRanks();
    G.god(true); G.loadLevel(n); await nap(200); G.applyRanks();
    const lvl=B.levelById(n), t=B.TIERS[A.mainTier(lvl)], s=A.survival(lvl,p,v);
    const gap=1000/s.rounds;
    G.GAME.paintball=false; G.GAME.state='play'; G.GAME.graceT=1e6;
    G.player.alive=true; G.player.hp=G.upg('vitality',v).maxHp;
    G.player.armor=G.upg('plating',p).pool; G.player.regenT=0;
    G.god(false);
    const t0=performance.now(); let hits=0, regen=0, last=G.player.armor, emptied=-1;
    while(G.player.alive && performance.now()-t0<240000){
      await nap(gap);
      if(G.player.armor>last) regen+=G.player.armor-last;
      G.hurt(t.dmg, t.apPen); hits++;
      last=G.player.armor;
      if(emptied<0 && last<=0) emptied=+(hits/s.rounds).toFixed(2);
      G.GAME.graceT=1e6;
    }
    G.god(true); G.GAME.state='menu';
    return {n, hits, real:+(hits/s.rounds).toFixed(2), wall:+((performance.now()-t0)/1000).toFixed(2),
            regen:+regen.toFixed(1), emptied, model:+s.seconds.toFixed(2),
            modelArmour:+s.armourSec.toFixed(2)};})()`));
}
console.log('lvl name              spT    build     tier     att land/s hp/hit pool poolOut MODEL  REAL   diff');
let worst=0;
for(const r of table){
  const q=real.find(x=>x.n===r.n), d=(q.real-r.ttd)/q.real*100;
  if(Math.abs(d)>Math.abs(worst)) worst=d;
  console.log(('L'+r.n).padEnd(4)+r.name.padEnd(18)+String(r.sp).padEnd(7)+r.build.padEnd(10)+
    r.tier.padEnd(9)+String(r.att).padEnd(4)+String(r.rounds).padEnd(7)+String(r.hpHit).padEnd(7)+
    String(r.pool).padEnd(5)+String(q.emptied).padEnd(8)+(r.ttd+'s').padEnd(7)+(q.real+'s').padEnd(7)+
    (d>=0?'+':'')+d.toFixed(1)+'%  '+r.band);
}
ok('the readout matches the real damagePlayer pipeline within 6% on ALL EIGHT levels',
   table.every(r=>{const q=real.find(x=>x.n===r.n); return Math.abs(q.real-r.ttd)/q.real<0.06;}),
   'worst margin '+worst.toFixed(1)+'%');
ok('the armour pool is really what the model says it is — it empties when predicted',
   real.filter(q=>q.emptied>0).every(q=>Math.abs(q.emptied-q.modelArmour)/q.modelArmour<0.10),
   real.map(q=>'L'+q.n+' '+q.emptied+'/'+q.modelArmour).join(' · '));
ok('regen never fires under sustained fire, which is what the model assumes',
   real.every(q=>q.regen===0), real.map(q=>q.regen).join(','));
// the old flat model, for the record: the L1 headline was 229 s
const old = await ev(`(()=>{const A=__game.Armoury,B=window.BP2,G=__game;
  const lvl=B.levelById(1),t=B.TIERS.militia;
  const r=lvl.maxAttackers*4*(t.accuracy*0.6)/1.6;
  return {old:+(B.UPGRADES.vitality.ranks[5].maxHp/(r*G.gateCalc('militia',5,false).hp)).toFixed(1),
          now:+A.survivalAt(1,5,5).seconds.toFixed(1), txt:A.fmtSec(A.survivalAt(1,5,5).seconds)};})()`);
ok('the L1 headline is honest now: 229 s becomes ~52 s, against 53.8 s measured through the pipeline',
   old.old>228 && old.now>50 && old.now<55, JSON.stringify(old));

/* ---- 3. the curve, the spTargets, and TIERS ------------------------------ */
console.log('\n=== 3. THE CURVE, spTarget, AND TIERS ===');
const curve=table.map(r=>r.ttd);
ok('the TTD curve never gets GENTLER from L1 to L8', curve.every((v,i)=>i===0||curve[i-1]>=v), curve.join(' '));
ok('and it falls by more than 4x end to end', curve[0]/curve[7]>4,
   curve[0]+'s -> '+curve[7]+'s = '+(curve[0]/curve[7]).toFixed(1)+'x');
console.log('   NOTE L6/L7 are FLAT, not falling: same tier, same maxAttackers. P5c broke the L4/L5');
console.log('        pair by giving L5 a 4th attacker — see PIPELINE "P5c CLOSED".');
const sp = await ev(`BP2.LEVELS.map(l=>l.spTarget)`);
// REBASED BY P5c: the game changed under this, the claim did not. P5c measured
// what a clean playthrough pays and re-set every target to ~65% of it, so the
// two literals here moved (L5 2000 -> 2900, L7 5200 -> 4900). Non-decreasing,
// which is what the check is actually about, is unchanged.
ok('spTarget is non-decreasing and L5/L7 no longer jump past the level before them',
   sp.slice(0,9).every((v,i)=>i===0||sp[i-1]<=v) && sp[5]===2900 && sp[7]===4900, JSON.stringify(sp));
// TIERS byte-identical to the P4c variant-C table
const tierBlock = src('js/data.js').split('/* ---------------------------- §LAYOUTS')[0]
  .split('/* ---------------------------- §TIERS')[1];
// the whole §TIERS block, hashed. The two spTarget digits P5a changed are in
// §LEVELS, well outside it: lines 12-25 hashed 6fd80db05e950955e1f8eee5c6e08dda
// both before and after that edit.
ok('TIERS is byte-identical to before this phase (variant C, md5 pinned)',
   md5(tierBlock)==='c0f0aa0c76059ece81d5f1ceeb94efaa', md5(tierBlock));
const tvals = await ev(`['paint','militia','regular','veteran','shock','praetor']
  .map(k=>BP2.TIERS[k].apPen+'/'+BP2.TIERS[k].dmg).join(' ')`);
ok('and its content is still the variant C table PIPELINE records',
   tvals==='0/5 0/9 0.1/12 0.18/15 0.26/18 0.34/22', tvals);
const gates = await ev(`[__game.gateCalc('militia',5,false).hp, __game.gateCalc('shock',5,false).hp,
  __game.gateCalc('praetor',5,false).hp, __game.gateCalc('praetor',5,true).hp]`);
ok('the armour gate is untouched: militia 0.900 · shock 6.480 · praetor 9.680',
   Math.abs(gates[0]-0.9)<1e-9 && Math.abs(gates[1]-6.48)<1e-9 && Math.abs(gates[2]-9.68)<1e-9,
   JSON.stringify(gates));
ok('endless maxAttackers is 4, matching the campaign cap',
   (await ev(`BP2.LEVELS[9].maxAttackers`))===4);

/* ---- 4. the boss announce latch ----------------------------------------- */
console.log('\n=== 4. THE BOSS ANNOUNCE LATCH ===');
// L7 fields TWO bosses and both get announced, so the banner may name either
const SEEN=`(()=>{const bs=__game.Enemies.list().filter(e=>e.boss&&e.alive);
  const on=bs.some(b=>{const v=new THREE.Vector3(b.pos.x,b.pos.y+1.25,b.pos.z).project(__game.camera);
    return v.z<=1&&Math.abs(v.x)<=1.08&&Math.abs(v.y)<=1.08;});
  return {onScreen:on, bosses:bs.map(b=>b.name)};})()`;
async function latch(n,label){
  // load with the round NOT running, so no frame can announce by sight before
  // the camera is parked: updateBoss only ticks while GAME.state === 'play'
  await ev(`(()=>{__game.god(true);__game.loadLevel(${n});__game.GAME.state='menu';return 1})()`);
  await sleep(500);
  const t0start = await ev(`(()=>{const G=__game;
    G.teleport(1.5,24.5);G.look(0,0);                      // facing -Z
    for(const b of G.Enemies.list().filter(e=>e.boss)){
      b.pos.set(1.5,0,34);b.rig.root.position.copy(b.pos);b.vel.set(0,0,0);   // +Z, behind
      b.state='combat';b.sawPlayer=true; }
    G.GAME.graceT=1e6; G.GAME.state='play';
    return BP2.Campaign.bossState().banner;})()`);
  let everSeen=false, st=null; const t0=Date.now();
  while(Date.now()-t0<9000){
    await sleep(250);
    st = await ev(`(()=>{const G=__game;
      for(const b of G.Enemies.list().filter(e=>e.boss)){
        b.pos.set(1.5,0,34);b.rig.root.position.copy(b.pos);b.vel.set(0,0,0); }
      G.teleport(1.5,24.5);G.look(0,0);G.GAME.graceT=1e6;
      return Object.assign({},BP2.Campaign.bossState(),${SEEN});})()`);
    if(st.onScreen) everSeen=true;
    if(st.banner) break;
  }
  const after=(Date.now()-t0)/1000;
  ok(label+': the boss is announced BY NAME without the player ever looking at it',
     !!st && st.banner===true && st.bosses.indexOf(st.bannerName)>=0 && !everSeen &&
     t0start===false && after>=2.0,
     JSON.stringify({banner:st&&st.banner, name:st&&st.bannerName, bosses:st&&st.bosses,
       everOnScreen:everSeen, bannerAtStart:t0start, after:after.toFixed(1)+'s'}));
  return st;
}
await latch(4,'L4 NIGHTFALL (night)');
await latch(7,'L7 BLACKOUT (nightfog)');
// first sight must still be immediate. GAME.start() clears `announced`, so this
// is a fresh announce and not the banner left over from the latch runs above.
await ev(`(()=>{__game.god(true);__game.GAME.start(BP2.levelById(4));return 1})()`); await sleep(700);
await ev(`(()=>{const G=__game;G.GAME.state='play';G.GAME.graceT=1e6;
  for(const b of G.Enemies.list().filter(e=>e.boss)){
    b.pos.set(1.5,0,14);b.rig.root.position.copy(b.pos);b.vel.set(0,0,0);b.sawPlayer=false; }
  G.teleport(1.5,24.5);G.look(0,0);     // facing -Z, straight at it
  return 1})()`);
const tSight=Date.now();
let fast=null;
for(let i=0;i<8 && !(fast&&fast.banner); i++){ await sleep(150);
  fast = await ev(`(()=>{const G=__game;
    for(const b of G.Enemies.list().filter(e=>e.boss)){ b.pos.set(1.5,0,14);b.rig.root.position.copy(b.pos); }
    G.teleport(1.5,24.5);G.look(0,0);G.GAME.graceT=1e6;return BP2.Campaign.bossState();})()`); }
ok('first SIGHT still announces at once, well inside the 3 s latch',
   fast.banner===true && fast.bannerName==='WARDEN' && (Date.now()-tSight)/1000 < 1.5,
   JSON.stringify(Object.assign({after:((Date.now()-tSight)/1000).toFixed(2)+'s'}, fast)));
ok('the latch is in the GAME, not in the test — campaign.js has it',
   /ANN_DELAY/.test(src('js/campaign.js')) && /annT/.test(src('js/campaign.js')), '');

// gameplay canary: hold the banner shut and prove the same check fails
await nav();
await ev(`__game.start()`); await sleep(300);
await ev(`(()=>{const el=document.getElementById('bossBanner');
  new MutationObserver(()=>{ if(!el.classList.contains('hidden')) el.classList.add('hidden'); })
    .observe(el,{attributes:true,attributeFilter:['class']}); return 1})()`);
await ev(`(()=>{__game.god(true);__game.loadLevel(4);return 1})()`); await sleep(500);
await ev(`(()=>{const G=__game;G.GAME.state='play';G.GAME.graceT=1e6;G.teleport(1.5,24.5);G.look(0,0);
  const b=G.Enemies.list().filter(e=>e.boss)[0];
  b.pos.set(1.5,0,34);b.rig.root.position.copy(b.pos);b.state='combat';b.sawPlayer=true;return 1})()`);
let can=null;
for(let i=0;i<32 && !(can&&can.banner); i++){ await sleep(250);
  can = await ev(`(()=>{const G=__game;const b=G.Enemies.list().filter(e=>e.boss)[0];
    b.pos.set(1.5,0,34);b.rig.root.position.copy(b.pos);G.teleport(1.5,24.5);G.look(0,0);
    G.GAME.graceT=1e6;return BP2.Campaign.bossState();})()`); }
ok('CANARY(gameplay): with the banner held shut the SAME check fails', can && can.banner===false,
   JSON.stringify(can));

/* ---- 5. profile schema v1 ----------------------------------------------- */
console.log('\n=== 5. PROFILE SCHEMA VERSIONING ===');
// a v0 save: no `v` field at all, the shape every save had before P5a
const V0 = {sp:4200, spent:3100, trackSpent:2900, level:6, cleared:{1:true,2:true,3:true,4:true,5:true},
  ranks:{vitality:3, plating:4, marksman:2, steady:1, logistics:0, mobility:2},
  unlocked:['rifle','pistol','shotgun'], trainingDone:true,
  stats:{kills:311, headshots:44, shots:2100, hits:940, deaths:9, bestTime:{1:73.2}}};
await ev(`localStorage.setItem('bp2_profile', ${JSON.stringify(JSON.stringify(V0))})`);
await nav();
const mig = await ev(`(()=>{const P=BP2.Profile.get();
  return {v:P.v, sp:P.sp, spent:P.spent, trackSpent:P.trackSpent, level:P.level,
    ranks:P.ranks, unlocked:P.unlocked, trainingDone:P.trainingDone, cleared:P.cleared,
    stats:P.stats, stored:JSON.parse(localStorage.getItem('bp2_profile'))};})()`);
ok('a v0 save (no `v`) loads and keeps its SP, its ranks and its unlocks',
   mig.sp===4200 && mig.trackSpent===2900 && mig.level===6 &&
   JSON.stringify(mig.ranks)===JSON.stringify(V0.ranks) &&
   mig.unlocked.join()==='rifle,pistol,shotgun' && mig.trainingDone===true &&
   mig.stats.kills===311 && mig.stats.bestTime['1']===73.2,
   JSON.stringify({sp:mig.sp, ranks:mig.ranks, unlocked:mig.unlocked}));
// REBASED BY P5c: the schema is v2 now (it added `fails` and `recruit`). The
// claim — an old save is REWRITTEN at the current version, never dropped — is
// the same one, and it is now doing two hops instead of one.
ok('and it is rewritten to localStorage AT THE CURRENT VERSION, without being asked to save',
   mig.v===2 && mig.stored.v===2 && mig.stored.sp===4200, JSON.stringify({v:mig.v, stored:mig.stored.v}));
// a v0 save missing whole fields
const V0b = {sp:900, ranks:{plating:2}, cleared:{1:true}};
await ev(`localStorage.setItem('bp2_profile', ${JSON.stringify(JSON.stringify(V0b))})`);
await nav();
const mig2 = await ev(`(()=>{const P=BP2.Profile.get();
  return {v:P.v, sp:P.sp, plating:P.ranks.plating, vitality:P.ranks.vitality,
    unlocked:P.unlocked, trainingDone:P.trainingDone, stats:P.stats, cleared:P.cleared,
    spent:P.spent, trackSpent:P.trackSpent, level:P.level,
    stored:JSON.parse(localStorage.getItem('bp2_profile'))};})()`);
ok('a v0 save MISSING whole fields is migrated from the defaults, not discarded',
   mig2.v===2 && mig2.sp===900 && mig2.plating===2 && mig2.vitality===0 &&
   mig2.unlocked.join()==='rifle' && mig2.trainingDone===false &&
   mig2.stats.kills===0 && mig2.cleared['1']===true && mig2.stored.v===2,
   JSON.stringify({sp:mig2.sp, plating:mig2.plating, unlocked:mig2.unlocked, stats:mig2.stats.kills}));
// upg() with no rank reads the LIVE profile, so this is the migrated save
// driving the game's own numbers, not the test reading its own input back
const applied = await ev(`(()=>{__game.start(); return {pool:__game.upg('plating').pool,
  armorMax:__game.player.armorMax, rank:__game.Armoury.state().ranks.plating};})()`);
ok('the live game agrees with the migrated save: PLATING 2 is really applied',
   applied.pool===140 && applied.rank===2 && applied.armorMax===140, JSON.stringify(applied));
// CANARY: a corrupt save still falls back to a blank v1 profile
await ev(`localStorage.setItem('bp2_profile','{not json')`);
await nav();
const corrupt = await ev(`(()=>{const P=BP2.Profile.get();return {v:P.v,sp:P.sp,ranks:P.ranks.plating};})()`);
ok('CANARY(profile): a corrupt save still yields a blank profile at the current version, not a crash',
   corrupt.v===2 && corrupt.sp===0 && corrupt.ranks===0, JSON.stringify(corrupt));
await ev(`localStorage.removeItem('bp2_profile')`);

/* ---- 6. no errors ------------------------------------------------------- */
dropCanary();
ok('zero errors across the whole run', errors.length===0, JSON.stringify(errors.slice(0,3)));
console.log('\n'+pass+' passed, '+fail+' failed'+(fail?'  -> '+fails.join(', '):''));
ws.close(); process.exit(fail?1:0);
