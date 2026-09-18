/* P5c — the stuck player + balance polish.
   Claims under test:
     the debrief escalates at EXACTLY 2 / 3 / 4 consecutive losses and a clear zeroes it
     a real v1 save migrates to v2 keeping SP, ranks, unlocks and clears
     RECRUIT is off by default, scales damage 0.6x through the live pipeline, marks clears
     L5 maxAttackers 3 -> 4, TIERS byte-identical, the TTD curve never gets gentler
     every spTarget is under the SP a clean first playthrough actually pays
     p4b_test S10's L3 corner: the cause, fixed, and the fix falsified          */
import {connect, sleep, URL} from './lib.mjs';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';
const HERE = dirname(fileURLToPath(import.meta.url));
import {createHash} from 'node:crypto';
const {send, ev, errors} = await connect();
await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
await send('Network.setCacheDisabled',{cacheDisabled:true});
await send('Page.navigate',{url:URL});
await sleep(2800);

let pass=0, fail=0; const fails=[];
const ok=(name,cond,detail='')=>{ if(cond){pass++;console.log('  ok  '+name+(detail?`   [${detail}]`:''));}
  else {fail++;fails.push(name);console.log('  FAIL '+name+(detail?`   [${detail}]`:''));} };
const reload = async tag => { await send('Page.navigate',{url:URL+'?p5c='+tag}); await sleep(2700); };
const dropCanary = ()=>{ for(let i=errors.length-1;i>=0;i--) if(/CANARY/.test(errors[i])) errors.splice(i,1); };

/* ---- 0. canaries ------------------------------------------------------- */
console.log('\n=== 0. CANARIES ===');
await ev(`setTimeout(()=>{throw new Error('CANARY-P5C')},10)`); await sleep(280);
ok('CANARY: the error collector can see a thrown error', errors.some(e=>/CANARY-P5C/.test(e)),
   errors.some(e=>/CANARY-P5C/.test(e))?'caught':'COLLECTOR IS BLIND');
dropCanary();

/* ---- 1. profile v1 -> v2 ----------------------------------------------- */
console.log('\n=== 1. PROFILE SCHEMA v1 -> v2 ===');
ok('the schema is at v2', await ev(`__game.Profile.SCHEMA`)===2, 'SCHEMA='+await ev(`__game.Profile.SCHEMA`));
// a REAL v1 save: exactly the shape profile.js wrote before this phase.
const V1 = {v:1, sp:4260, spent:3100, trackSpent:2700, level:5,
  cleared:{1:true,2:true,3:true,4:true},
  ranks:{vitality:3, plating:4, marksman:2, steady:1, logistics:5, mobility:0},
  unlocked:['rifle','pistol','shotgun'], trainingDone:true,
  stats:{kills:412, headshots:77, shots:3100, hits:1490, deaths:19, bestTime:{1:88.5, 2:132.25, 3:170}}};
const mig = await ev(`(()=>{const P=__game.Profile;
  localStorage.setItem(P.KEY, JSON.stringify(${JSON.stringify(V1)}));
  const p=P.load();
  const raw=JSON.parse(localStorage.getItem(P.KEY));
  return {p:JSON.parse(JSON.stringify(p)), rawV:raw.v, from:P.migrate(${JSON.stringify(V1)})};})()`);
ok('a v1 save migrates to v2 and keeps its SP, spend and track spend',
   mig.p.v===2 && mig.p.sp===4260 && mig.p.spent===3100 && mig.p.trackSpent===2700,
   `v=${mig.p.v} sp=${mig.p.sp} spent=${mig.p.spent} trackSpent=${mig.p.trackSpent}`);
ok('a v1 save keeps every rank', JSON.stringify(mig.p.ranks)===JSON.stringify(V1.ranks),
   JSON.stringify(mig.p.ranks));
ok('a v1 save keeps its weapon unlocks and cleared levels',
   mig.p.unlocked.join(',')==='rifle,pistol,shotgun' && Object.keys(mig.p.cleared).join(',')==='1,2,3,4',
   mig.p.unlocked.join(',')+' | '+Object.keys(mig.p.cleared).join(','));
ok('a v1 save keeps its career stats and best times',
   mig.p.stats.kills===412 && mig.p.stats.headshots===77 && mig.p.stats.deaths===19 &&
   mig.p.stats.bestTime['2']===132.25, JSON.stringify(mig.p.stats.bestTime));
ok('the new v2 fields arrive empty, not undefined',
   mig.p.fails && mig.p.recruit && Object.keys(mig.p.fails).length===0 && Object.keys(mig.p.recruit).length===0,
   JSON.stringify({fails:mig.p.fails, recruit:mig.p.recruit}));
ok('migrate() reports the save it was handed as v1', mig.from===1, 'from='+mig.from);
ok('the migrated save is REWRITTEN to disk at v2 (an old save is never dropped)',
   mig.rawV===2, 'stored v='+mig.rawV);
const v0 = await ev(`(()=>{const P=__game.Profile;
  localStorage.setItem(P.KEY, JSON.stringify({sp:1800, ranks:{plating:2}, cleared:{1:true}}));
  const p=P.load(); return {v:p.v, sp:p.sp, plating:p.ranks.plating, cleared:!!p.cleared['1'],
    fails:Object.keys(p.fails).length};})()`);
ok('a v0 save (no `v` at all) still lands on v2 with its points and ranks',
   v0.v===2 && v0.sp===1800 && v0.plating===2 && v0.cleared && v0.fails===0, JSON.stringify(v0));
const corrupt = await ev(`(()=>{const P=__game.Profile;
  localStorage.setItem(P.KEY,'{not json'); const p=P.load(); return {v:p.v, sp:p.sp};})()`);
ok('a corrupt save yields a blank v2 profile, not a crash', corrupt.v===2 && corrupt.sp===0,
   JSON.stringify(corrupt));

/* ---- 2. the fail counter ----------------------------------------------- */
console.log('\n=== 2. THE CONSECUTIVE-FAIL COUNTER ===');
const freshCareer = `(()=>{const P=__game.Profile; P.reset(); const p=P.get();
  p.trainingDone=true; P.award(4000); P.save(); return p.sp;})()`;
await ev(freshCareer);
const loseOn = async n => ev(`(()=>{const g=__game; g.loadLevel(${n}); g.GAME.lose('TEST LOSS');
  return {fails:g.Profile.fails(${n}), html:document.getElementById('debrief').innerHTML};})()`);
const l1=await loseOn(4), l2=await loseOn(4), l3=await loseOn(4), l4=await loseOn(4);
console.log(`   fails after four losses on L4: ${l1.fails} ${l2.fails} ${l3.fails} ${l4.fails}`);
ok('a loss increments the level\'s counter, one per loss',
   l1.fails===1 && l2.fails===2 && l3.fails===3 && l4.fails===4,
   [l1,l2,l3,l4].map(x=>x.fails).join(','));
const other = await ev(`__game.Profile.fails(6)`);
ok('the counter is PER LEVEL — four losses on L4 leave L6 at zero', other===0, 'L6='+other);
const cleared = await ev(`(()=>{const g=__game; g.loadLevel(4);
  g.GAME.end(true,'TEST WIN'); return {fails:g.Profile.fails(4), cleared:g.Profile.cleared(4),
    html:document.getElementById('debrief').innerHTML};})()`);
ok('a clear zeroes the counter', cleared.fails===0 && cleared.cleared, JSON.stringify({f:cleared.fails,c:cleared.cleared}));
ok('a WIN never shows a debrief', cleared.html==='', cleared.html.slice(0,60));

/* ---- 3. the escalation ------------------------------------------------- */
console.log('\n=== 3. THE DEBRIEF ESCALATES AT 2 / 3 / 4 ===');
// a career that is stuck on L6 with exactly one mission behind it to replay
const stuckCareer = `(()=>{const P=__game.Profile; P.reset(); const p=P.get();
  p.trainingDone=true; P.award(4000); P.clearLevel(4, 161.5); P.save(); return p.sp;})()`;
await ev(stuckCareer);
const steps=[];
for(let i=1;i<=5;i++){ const r=await loseOn(6); steps.push({n:i, fails:r.fails, html:r.html}); }
const tierOf = h => !h ? 0 : (/t3/.test(h)?3 : /t2/.test(h)?2 : /t1/.test(h)?1 : -1);
const seen = steps.map(s=>tierOf(s.html));
console.log('   debrief tier after 1..5 losses: '+seen.join(' '));
ok('one loss says NOTHING — losing once is playing', steps[0].html==='', steps[0].html.slice(0,50));
ok('the SECOND loss is the first that speaks, and it is the readout tier',
   seen[1]===1 && /you survive/.test(steps[1].html) && /BEST BUY/.test(steps[1].html),
   'tier '+seen[1]);
ok('the second loss names ONE best purchase, with its price',
   (steps[1].html.match(/BEST BUY/g)||[]).length===1 && /SP/.test(steps[1].html), 'one BEST BUY row');
ok('the THIRD loss adds the honest line and nothing before it did',
   seen[2]===2 && /balanced around/.test(steps[2].html) && !/balanced around/.test(steps[1].html),
   'tier '+seen[2]);
ok('the FOURTH loss adds the replay route and nothing before it did',
   seen[3]===3 && /THE LONG WAY ROUND/.test(steps[3].html) && !/THE LONG WAY ROUND/.test(steps[2].html),
   'tier '+seen[3]);
ok('the fifth loss does not escalate again — 4+ is the last tier',
   seen[4]===3 && /5 LOSSES IN A ROW/.test(steps[4].html), 'tier '+seen[4]);
ok('the debrief prints the size of the wall as a NUMBER when you are short',
   /The wall is <b>[\d,]+ SP<\/b> high/.test(steps[2].html) || /the points are there/.test(steps[2].html),
   (steps[2].html.match(/The wall is <b>[^<]+/)||['(already funded)'])[0]);
ok('the debrief never offers RECRUIT after a loss',
   steps.every(s=>!/RECRUIT/i.test(s.html)), 'clean');
ok('the debrief never offers a purchase, a skip or an easier enemy',
   steps.every(s=>!/skip/i.test(s.html) && !/£|\$|buy now/i.test(s.html)), 'clean');
// the four-loss tier really does name a cleared mission and a run count
const routeTxt = (steps[3].html.match(/THE LONG WAY ROUND<\/span>([^<]*<b>[^<]*<\/b>[^<]*)/)||[])[1]||'';
console.log('   route line: '+(steps[3].html.match(/replay <b>[^<]+<\/b>[^.]*/)||['(none)'])[0].slice(0,120));
ok('the replay route names a mission the player has actually cleared',
   /replay <b>M4 NIGHTFALL<\/b>/.test(steps[3].html), 'M4 is the only clear in this career');
ok('the replay route gives an SP-per-minute rate and a run count',
   /SP a minute/.test(steps[3].html) && /run(s)? pays for/.test(steps[3].html), 'both present');

/* ---- 3b. GAMEPLAY CANARY: break the counter, the escalation check must fail */
console.log('\n=== 3b. GAMEPLAY CANARY ===');
await ev(`(()=>{const P=__game.Profile; window.__realNote=P.noteFail;
  P.noteFail=function(n){ return P.fails(n); };   // increments nothing
  return 1;})()`);
await ev(stuckCareer);
const broken=[];
for(let i=1;i<=4;i++){ const r=await loseOn(6); broken.push(tierOf(r.html)); }
await ev(`(()=>{__game.Profile.noteFail=window.__realNote; return 1;})()`);
console.log('   with the counter stuck at 0 the tiers read: '+broken.join(' '));
ok('CANARY: with the fail counter not incremented the escalation assertion FAILS',
   !(broken[1]===1 && broken[2]===2 && broken[3]===3), broken.join(','));
await ev(stuckCareer);
const restored=[]; for(let i=1;i<=4;i++){ restored.push(tierOf((await loseOn(6)).html)); }
ok('CANARY: restored, the same assertion passes again',
   restored[1]===1 && restored[2]===2 && restored[3]===3, restored.join(','));

/* ---- 4. RECRUIT --------------------------------------------------------- */
console.log('\n=== 4. RECRUIT MODE ===');
await ev(`localStorage.removeItem('bp2_settings')`);
await reload('recruit');
ok('RECRUIT is OFF by default, on a browser with no saved settings',
   await ev(`__game.S.recruit`)===0, 'S.recruit='+await ev(`__game.S.recruit`));
const dmg = await ev(`(()=>{const g=__game;
  const run=(on)=>{ g.S.recruit=on?1:0; g.Profile.setRank('plating',2); g.Profile.setRank('vitality',2);
    g.loadLevel(4); g.god(false); g.S.god=0;
    const p=g.player; p.hp=p.maxHp; p.armor=p.armorMax;
    const hp0=p.hp, ar0=p.armor;
    g.hurt(50, 0.10);
    return {lost:(hp0-p.hp)+(ar0-p.armor), hp:hp0-p.hp, ar:ar0-p.armor}; };
  const off=run(false), on=run(true); g.S.recruit=0;
  return {off, on, ratio:on.lost/off.lost};})()`);
console.log(`   50 damage through the real pipeline: standard ${dmg.off.lost}  RECRUIT ${dmg.on.lost}`);
ok('RECRUIT scales incoming damage to exactly 0.6x in the LIVE damagePlayer pipeline',
   Math.abs(dmg.ratio-0.6)<1e-9, `ratio ${dmg.ratio.toFixed(6)} (${dmg.off.lost} -> ${dmg.on.lost})`);
ok('RECRUIT scales the armour bite and the HP bite by the same 0.6 — it is one multiplier',
   Math.abs(dmg.on.ar/dmg.off.ar-0.6)<1e-9 && Math.abs(dmg.on.hp/dmg.off.hp-0.6)<1e-9,
   `armour ${(dmg.on.ar/dmg.off.ar).toFixed(4)} hp ${(dmg.on.hp/dmg.off.hp).toFixed(4)}`);
const setUI = await ev(`(()=>{const g=__game; g.applySettings();
  document.getElementById('btnSettings').click();
  const rows=[].slice.call(document.querySelectorAll('#setBody .setrow .n'));
  const heads=[].slice.call(document.querySelectorAll('#setBody .sethead')).map(h=>h.textContent);
  const i=rows.findIndex(r=>/RECRUIT/.test(r.textContent));
  document.getElementById('btnSetClose').click();
  return {heads, found:i, first:heads[0], label:i>=0?rows[i].textContent.slice(0,40):null};})()`);
ok('RECRUIT is in SETTINGS from the start, in its own DIFFICULTY section at the top',
   setUI.found>=0 && setUI.first==='DIFFICULTY', JSON.stringify({first:setUI.first, row:setUI.label}));
const mark = await ev(`(()=>{const g=__game; g.Profile.reset(); g.S.recruit=1;
  g.loadLevel(2); g.GAME.end(true,'TEST WIN');
  const onR=g.Profile.onRecruit(2);
  g.S.recruit=0; g.loadLevel(3); g.GAME.end(true,'TEST WIN');
  const plain=g.Profile.onRecruit(3);
  g.Campaign.select(2); g.Campaign.openHub('start');
  const card=document.querySelector('.lvcard[data-lvl="2"]').innerHTML;
  const card3=document.querySelector('.lvcard[data-lvl="3"]').innerHTML;
  g.Campaign.closeHub();
  return {onR, plain, tagged:/RECRUIT/.test(card), other:/RECRUIT/.test(card3)};})()`);
ok('a clear made on RECRUIT is recorded in the profile', mark.onR===true && mark.plain===false,
   JSON.stringify({recruitClear:mark.onR, standardClear:mark.plain}));
ok('the hub marks the RECRUIT clear and only that one', mark.tagged && !mark.other,
   JSON.stringify({m2:mark.tagged, m3:mark.other}));
const off2 = await ev(`(()=>{const g=__game; g.S.recruit=0; g.Profile.setRank('plating',2);
  g.loadLevel(4); const p=g.player; p.hp=p.maxHp; p.armor=p.armorMax; const h0=p.hp,a0=p.armor;
  g.hurt(50,0.10); return (h0-p.hp)+(a0-p.armor);})()`);
ok('turning RECRUIT off restores full damage in the same session',
   Math.abs(off2-dmg.off.lost)<1e-9, `${off2} vs ${dmg.off.lost}`);

/* ---- 5. L5 maxAttackers + TIERS + the curve ----------------------------- */
console.log('\n=== 5. L5 maxAttackers 3 -> 4, TIERS UNTOUCHED, THE CURVE ===');
const att = await ev(`__game.LEVELS.map(l=>l.maxAttackers)`);
console.log('   maxAttackers per level: '+att.join(','));
ok('L5 SUPPLY LINE now lets 4 fire at once', att[5]===4, 'L5='+att[5]);
ok('no other level\'s maxAttackers moved', att.join(',')==='1,2,2,3,3,4,4,4,4,4', att.join(','));
const live5 = await ev(`(()=>{__game.loadLevel(5); return __game.levelInfo().maxAttackers;})()`);
ok('the LIVE Enemies cap on L5 is 4, not just the table', live5===4, 'live='+live5);
const src = readFileSync(join(HERE,'..','js','data.js'),'utf8');
const tb = src.slice(src.indexOf('/* ---------------------------- §TIERS'),
                     src.indexOf('/* ---------------------------- §LAYOUTS'));
const tiersMd5 = createHash('md5').update(tb).digest('hex');
ok('the §TIERS block is byte-identical — md5 2204e395ca5b1588c99a6a62926c1012',
   tiersMd5==='2204e395ca5b1588c99a6a62926c1012', tiersMd5);
const tiers = await ev(`(()=>{const T=__game.TIERS; const k=['paint','militia','regular','veteran','shock','praetor'];
  return {pen:k.map(x=>T[x].apPen), dmg:k.map(x=>T[x].dmg), hp:k.map(x=>T[x].hp)};})()`);
ok('TIERS still reads variant C: apPen 0/0/.10/.18/.26/.34 and dmg 5/9/12/15/18/22',
   tiers.pen.join(',')==='0,0,0.1,0.18,0.26,0.34' && tiers.dmg.join(',')==='5,9,12,15,18,22',
   tiers.pen.join(',')+' | '+tiers.dmg.join(','));
const curve = await ev(`(()=>{const g=__game, A=g.Armoury, C=g.UPGRADES.plating.costs;
  const cum=[0]; for(let i=0;i<C.length;i++) cum.push(cum[i]+C[i]);
  const rows=[];
  for(let n=1;n<=8;n++){ const lvl=g.LEVELS[n]; let best=null;
    for(let p=0;p<=5;p++) for(let v=0;v<=5;v++){ if(cum[p]+cum[v]>lvl.spTarget) continue;
      const s=A.survival(lvl,p,v).seconds; if(!best||s>best.s) best={p,v,s,c:cum[p]+cum[v]}; }
    rows.push({n, name:lvl.name, t:lvl.spTarget, build:'P'+best.p+'V'+best.v, cost:best.c, sec:+best.s.toFixed(2)}); }
  return rows;})()`);
console.log('   TTD at each spTarget, greedy-optimised on the real gateCalc:');
for(const r of curve) console.log(`     L${r.n} ${r.name.padEnd(15)} ${String(r.t).padStart(5)} SP -> ${r.build} (${r.cost}) = ${r.sec}s`);
ok('the TTD curve never gets gentler as the campaign goes on',
   curve.every((r,i)=>i===0 || r.sec<=curve[i-1].sec+1e-9), curve.map(r=>r.sec).join(' · '));
ok('L5 is now strictly harder than L4 — the visibility inversion is gone',
   curve[4].sec < curve[3].sec, `L4 ${curve[3].sec}s vs L5 ${curve[4].sec}s`);
ok('L6 and L7 stay FLAT (same tier, same cap — the model cannot tell them apart)',
   Math.abs(curve[5].sec-curve[6].sec)<1e-9, `L6 ${curve[5].sec}s L7 ${curve[6].sec}s`);
ok('the curve still falls by more than 4x end to end',
   curve[0].sec/curve[7].sec >= 4, `${curve[0].sec} -> ${curve[7].sec} = ${(curve[0].sec/curve[7].sec).toFixed(2)}x`);

/* ---- 6. spTarget against MEASURED earnable SP --------------------------- */
console.log('\n=== 6. spTarget vs the SP a clean first playthrough ACTUALLY PAYS ===');
// the model, straight off the award paths in §GAME
const model = await ev(`(()=>{const g=__game; const out=[]; let total=300;   // the drill pays a flat 300
  for(let n=1;n<=8;n++){ const lvl=g.LEVELS[n];
    const roster=lvl.roster.reduce((a,r)=>a+(r.count||1),0);
    const bosses=lvl.roster.filter(r=>r.boss).length;
    const gain=10*n*roster + 120*bosses + 250*n + 100;   // kills + bounty + first clear + flawless
    out.push({n, arrive:total, gain, roster}); total+=gain; }
  return {out, total};})()`);
const arrive = model.out.map(r=>r.arrive);
console.log('   career SP on arrival: '+arrive.map((a,i)=>`L${i+1} ${a}`).join(' · ')+`  (after L8 ${model.total})`);
ok('the award model reproduces the measured driven playthrough exactly',
   arrive.join(',')==='300,700,1560,2830,4450,6570,9190,12400', arrive.join(','));
// ...and it is verified against a REAL clear, driven through onKill and end()
const driven = await ev(`(()=>{const g=__game; g.Profile.reset(); const before=g.Profile.get().sp;
  g.loadLevel(2);
  g.Enemies.active().filter(e=>e.alive).forEach(e=>g.Enemies.damage(e,99999,false));
  return {before, ended:g.GAME.ended, sp:g.Profile.get().sp, br:g.GAME.sp,
          kills:g.GAME.stats.kills, roster:g.GAME.rosterSize};})()`);
console.log('   driven real clear of L2: '+JSON.stringify(driven));
ok('a REAL driven clear of L2 pays exactly what the model predicts (860)',
   driven.sp-driven.before===860 && driven.kills===7, `+${driven.sp-driven.before} on ${driven.kills} kills`);
const tgt = await ev(`__game.LEVELS.map(l=>l.spTarget)`);
console.log('   spTarget: '+tgt.join(','));
const frac = model.out.map(r=>tgt[r.n]/r.arrive);
console.log('   spTarget as a fraction of what you have EARNED by then: '+
  frac.map((f,i)=>`L${i+1} ${(100*f).toFixed(0)}%`).join(' · '));
ok('every spTarget is EARNABLE — none asks for more than 70% of what the campaign has paid by then',
   frac.every(f=>f<=0.70+1e-9), frac.map(f=>(100*f).toFixed(0)+'%').join(','));
ok('L8 no longer asks for 11000 — the old value was 89% of a perfect run',
   tgt[8]===8000 && tgt[8]/12400 < 0.70, `${tgt[8]} / 12400 = ${(100*tgt[8]/12400).toFixed(0)}%`);
ok('spTarget rises monotonically across the campaign', tgt.slice(1,9).every((v,i,a)=>i===0||v>=a[i-1]),
   tgt.slice(1,9).join(','));
ok('ENDLESS carries the same target as L8', tgt[9]===tgt[8], `${tgt[9]} vs ${tgt[8]}`);
const under = await ev(`(()=>{const g=__game; g.Profile.reset(); const p=g.Profile.get();
  p.sp=12400; p.spent=0; g.Profile.save();
  g.Campaign.select(8); g.Campaign.openHub('start');
  const card=document.querySelector('.lvcard[data-lvl="8"]').textContent;
  g.Campaign.closeHub(); return card;})()`);
ok('at the SP a clean playthrough pays, the L8 hub card no longer says "under-equipped"',
   !/under-equipped/.test(under), (under.match(/POWER[^·]*/)||[''])[0].trim().slice(0,70));

/* ---- 7. the p4b_test S10 corner ---------------------------------------- */
console.log('\n=== 7. p4b_test S10 — L3 / OPEN GROUND / corner (24,24) ===');
/* What S10 was catching, exactly: OPEN GROUND's [23.2,20] block left a 1.75 m
   mouth into the SE quay corner. The nav grid inflates every solid by AGENT_R
   0.44 and refuses to cut corners, so only ~0.87 m of that was walkable —
   narrower than the 1.66 m band one barrel blocks. `barrelStack(24.0,24.5,4)`
   scatters into that exact mouth, so most prop rolls stranded the 3 nav cells
   in the corner. The PLAYER could still walk in (his collision radius is under
   the nav inflation), so it was a pocket nothing could follow him into.
   On top of that S10's instrument is noisy: navPath() runs nearestFree() on
   its target, so a barrel landing on the target CELL silently retargets the
   search to a reachable neighbour and the check passes. That is why a 5-in-6
   defect read as a 1-in-3 flake. Below it is measured by flood fill instead.
   The fix moves the block to z=18: a 3.75 m mouth, ~2.87 m of it walkable. */
const REACH = `window.__reach=function(px,pz,cx,cz,rad){
  const g=__game,N=g.NAV.N,B=g.NAV.blocked,w2g=g.NAV.w2g,g2w=g.NAV.g2w;
  const nf=(gx,gy)=>{ if(!B[gy*N+gx]) return gy*N+gx;
    for(let r=1;r<10;r++) for(let oy=-r;oy<=r;oy++) for(let ox=-r;ox<=r;ox++){
      if(Math.abs(ox)!==r&&Math.abs(oy)!==r) continue; const x=gx+ox,y=gy+oy;
      if(x<0||y<0||x>=N||y>=N) continue; if(!B[y*N+x]) return y*N+x; } return -1; };
  const s0=nf(w2g(px),w2g(pz)); const seen=new Uint8Array(N*N); const st=[s0]; seen[s0]=1;
  while(st.length){ const c=st.pop(), ccx=c%N, ccy=(c/N)|0;
    for(let oy=-1;oy<=1;oy++)for(let ox=-1;ox<=1;ox++){ if(!ox&&!oy)continue;
      const nx=ccx+ox,ny=ccy+oy; if(nx<0||ny<0||nx>=N||ny>=N)continue; const ni=ny*N+nx;
      if(B[ni]||seen[ni])continue; if(ox&&oy&&(B[ccy*N+nx]||B[ny*N+ccx]))continue;
      seen[ni]=1; st.push(ni);} }
  let free=0, got=0;
  for(let gy=0;gy<N;gy++) for(let gx=0;gx<N;gx++){
    const wx=g2w(gx), wz=g2w(gy);
    if(Math.abs(wx-cx)>rad||Math.abs(wz-cz)>rad) continue;
    if(B[gy*N+gx]) continue; free++; if(seen[gy*N+gx]) got++; }
  return {free, got, ok: free>0 && got===free};};1`;
const ROLLS=5;
let cornerBad=[], newStrand=0, oldStrand=0, sample=[];
for(let r=0;r<ROLLS;r++){
  await reload('corner'+r);
  await ev(REACH);
  const row = await ev(`(()=>{const g=__game; const bad=[];
    for(let n=0;n<10;n++){ g.loadLevel(n); const ins=g.insertPoint();
      for(const [cx,cz] of [[-27,-27],[-27,24],[24,-27],[24,24]]){
        if(!g.navPath(ins.x,ins.z,cx,cz).ok) bad.push('L'+n+'@'+cx+','+cz); } }
    g.loadLevel(3); const ins=g.insertPoint();
    // the pre-P5c block, put back exactly where it was: [23.2, 20], rot 1
    const old={x0:21.98,x1:24.42,y0:0,y1:2.59,z0:16.97,z1:23.03,climb:true};
    g.NAV.bake();
    const now=window.__reach(ins.x,ins.z,24,24,2.0);
    g.solids.push(old); g.NAV.bake();
    const then=window.__reach(ins.x,ins.z,24,24,2.0);
    g.solids.splice(g.solids.indexOf(old),1); g.NAV.bake();
    const back=window.__reach(ins.x,ins.z,24,24,2.0);
    return {bad, now, then, back};})()`);
  if(row.bad.length) cornerBad.push('run'+r+':'+row.bad.join('/'));
  if(!row.now.ok || !row.back.ok) newStrand++;
  if(!row.then.ok) oldStrand++;
  sample.push(`${row.now.got}/${row.now.free} vs old ${row.then.got}/${row.then.free}`);
}
console.log('   SE quay corner cells reachable from L3\'s insertion point, per prop roll:');
console.log('     '+sample.join('  ·  '));
ok('all four corners are reachable from every insertion point, on 5 fresh prop scatters',
   cornerBad.length===0, cornerBad.length? cornerBad.join(' | ') : ROLLS+' rolls clean');
ok('EVERY free nav cell in the SE quay corner is in the main component, on every roll',
   newStrand===0, `${ROLLS-newStrand}/${ROLLS} rolls fully reachable`);
// the falsification bar is "capable of failing", not a rate: a prop roll that
// happens to leave the old mouth open is exactly the luck that made S10 look
// like a flake in the first place.
ok('FALSIFIED: put the old [23.2,20] block back and the same check strands the corner',
   oldStrand>=2, `${oldStrand}/${ROLLS} rolls stranded with the old block`);
const strand = await ev(`(()=>{const g=__game; const N=g.NAV.N,B=g.NAV.blocked; const out=[];
  for(let li=0;li<g.LAYOUTS.length;li++){ g.setLayout(li);
    const seen=new Uint8Array(N*N); let free=0,best=0;
    for(let k=0;k<N*N;k++) if(!B[k]) free++;
    for(let k0=0;k0<N*N;k0++){ if(B[k0]||seen[k0]) continue; let n=0; const st=[k0]; seen[k0]=1;
      while(st.length){ const c=st.pop(); n++; const cx=c%N, cy=(c/N)|0;
        for(let oy=-1;oy<=1;oy++) for(let ox=-1;ox<=1;ox++){ if(!ox&&!oy) continue;
          const nx=cx+ox, ny=cy+oy; if(nx<0||ny<0||nx>=N||ny>=N) continue; const ni=ny*N+nx;
          if(B[ni]||seen[ni]) continue; if(ox&&oy&&(B[cy*N+nx]||B[ny*N+cx])) continue;
          seen[ni]=1; st.push(ni); } }
      if(n>best) best=n; }
    out.push({name:g.LAYOUTS[li].name, free, main:best, pct:+(100*best/free).toFixed(2)}); }
  return out;})()`);
console.log('   nav connectivity: '+strand.map(s=>`${s.name} ${s.pct}%`).join(' · '));
ok('every layout still keeps at least 98% of the yard in one component',
   strand.every(s=>s.main/s.free>=0.98), strand.map(s=>s.pct+'%').join(','));

/* ---- 8. nothing else moved --------------------------------------------- */
console.log('\n=== 8. THE NEIGHBOURS ===');
const gate = await ev(`(()=>{const g=__game; return {
  militia5:+g.gateCalc('militia',5,false).hp.toFixed(3),
  shock5:+g.gateCalc('shock',5,false).hp.toFixed(3),
  praetor5:+g.gateCalc('praetor',5,false).hp.toFixed(3),
  l8:(()=>{g.loadLevel(8); const i=g.levelInfo(); const b=g.enemyInfo().filter(e=>e.boss)[0];
    return {roster:i.rosterSize, bosses:i.bosses, att:i.maxAttackers, maxHp:b?b.maxHp:0,
            apPen:b?+b.apPen.toFixed(2):0, scale:b?+b.scale.toFixed(2):0, name:b?b.name:''};})()};})()`);
console.log('   '+JSON.stringify(gate));
ok('the armour gate is where P4c left it: 0.900 / 6.480 / 9.680 HP a hit at PLATING 5',
   gate.militia5===0.9 && gate.shock5===6.48 && gate.praetor5===9.68,
   `${gate.militia5} / ${gate.shock5} / ${gate.praetor5}`);
ok('L8 is unchanged: 18+1, THE MARSHAL at 484 HP, apPen 0.44, scale 1.18, cap 4',
   gate.l8.roster===19 && gate.l8.bosses===1 && gate.l8.maxHp===484 && gate.l8.apPen===0.44 &&
   gate.l8.scale===1.18 && gate.l8.att===4 && gate.l8.name==='THE MARSHAL', JSON.stringify(gate.l8));
const modelSame = await ev(`(()=>{const A=__game.Armoury; return {
  hit:A.MODEL.HIT_RATE, burst:A.MODEL.BURST_BASE, cdm:A.MODEL.CD_MEAN, cdf:A.MODEL.CD_FAR,
  l1:+A.survivalAt(1,0,0).seconds.toFixed(2), l8:+A.survivalAt(8,5,5).seconds.toFixed(2),
  l1max:+A.survivalAt(1,5,5).seconds.toFixed(0)};})()`);
ok('the survival model itself is untouched — HIT_RATE 0.6, burst 4, and L1 P0V0 still 12.81 s',
   modelSame.hit===0.6 && modelSame.burst===4 && modelSame.l1===12.81, JSON.stringify(modelSame));
ok('the L1 headline is intact: a maxed build lives ~52 s on the dock',
   Math.abs(modelSame.l1max-52)<=1, 'L1 P5V5 = '+modelSame.l1max+' s');
await ev(`(()=>{__game.Profile.reset(); localStorage.removeItem('bp2_settings'); return 1;})()`);
dropCanary();
ok('zero errors across the whole sweep', errors.length===0, errors.slice(0,3).join(' | '));

console.log(`\n${pass} passed, ${fail} failed` + (fail?'  -> '+fails.join(', '):''));
process.exit(0);
