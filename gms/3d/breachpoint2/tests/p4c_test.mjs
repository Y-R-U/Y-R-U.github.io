// BREACHPOINT II — P4c verification suite.
// BALANCE.md variant C in data.js · the recomputed armour gate · the L1 headline
// feature · the shared survival model · the plating trap made legible · canaries.
import {connect,URL,sleep} from './lib.mjs';
import {readFileSync} from 'node:fs';
const SRC='/Users/aaronair/cc/yru/site/gms/3d/breachpoint2/';
const src=f=>readFileSync(SRC+f,'utf8');
const {ws,send,ev,errors}=await connect();
let pass=0, fail=0; const failed=[];
const ok=(n,c,x='')=>{ if(c) pass++; else {fail++; failed.push(n);} console.log((c?'PASS  ':'FAIL  ')+n+(x?'   '+x:'')); };

await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
await send('Network.setCacheDisabled',{cacheDisabled:true});   // PIPELINE trap: stale ES/JS
const winId=(await send('Browser.getWindowForTarget')).result;
await send('Emulation.setDeviceMetricsOverride',{width:1000,height:640,deviceScaleFactor:1,mobile:false});
const nav=async()=>{ await send('Page.navigate',{url:URL}); await sleep(3400); };
await send('Page.navigate',{url:'about:blank'}); await sleep(400); errors.length=0;
await nav();
await ev(`localStorage.removeItem('bp2_profile');localStorage.removeItem('bp2_settings');localStorage.removeItem('bp2_paint')`);
await nav();
await ev(`__game.S.quality='low';__game.S.bloom=0;__game.applySettings()`);

console.log('\n=== 1. VARIANT C IS IN data.js ===');
ok('zero console errors / exceptions on load', errors.length===0, errors.join(' | '));
const tiers = await ev(`(()=>{const t=BP2.TIERS,o={};
  for(const k of ['paint','militia','regular','veteran','shock','praetor']) o[k]=[t[k].dmg,t[k].apPen,t[k].accuracy];
  return o;})()`);
ok('apPen pulled back: 0.00 / 0.00 / 0.10 / 0.18 / 0.26 / 0.34',
   [tiers.paint[1],tiers.militia[1],tiers.regular[1],tiers.veteran[1],tiers.shock[1],tiers.praetor[1]]
     .join('/')==='0/0/0.1/0.18/0.26/0.34', JSON.stringify(tiers));
ok('late damage pulled back: regular 12 / veteran 15 / shock 18 / praetor 22',
   tiers.regular[0]===12 && tiers.veteran[0]===15 && tiers.shock[0]===18 && tiers.praetor[0]===22, JSON.stringify(tiers));
ok('paint and militia are untouched (dmg 5 / 9, apPen 0, acc 0.30 / 0.42)',
   tiers.paint.join()==='5,0,0.3' && tiers.militia.join()==='9,0,0.42', JSON.stringify([tiers.paint,tiers.militia]));
const atk = await ev(`BP2.LEVELS.map(l=>l.maxAttackers).join(',')`);
// REBASED BY P5c: variant C set this to 1,2,2,3,3,3,4,4,4 and P5c raised L5 to
// 4 on the coordinator's call — L4 is night and L5 is day+haze, so the same raw
// threat with better visibility made L5 play EASIER than L4. Variant C's own
// changes (L7 5->4, L8 6->4) are still asserted; only L5 moved.
ok('maxAttackers 1,2,2,3,3,4,4,4,4 for L0-L8 (variant C, plus P5c\'s L5 3->4)',
   atk.split(',').slice(0,9).join(',')==='1,2,2,3,3,4,4,4,4', atk);

console.log('\n=== 2. THE ARMOUR GATE, RECOMPUTED FROM gateCalc ===');
const gate = await ev(`(()=>{const g=(t,r,b)=>__game.gateCalc(t,r,b);
  return {mil5:g('militia',5,false), sho5:g('shock',5,false), pra5:g('praetor',5,false),
          mil0:g('militia',0,false), bpra5:g('praetor',5,true)};})()`);
ok('PLATING 5 vs militia = 0.900 HP/hit EXACTLY (the gate the user asked for, unchanged)',
   gate.mil5.hp.toFixed(3)==='0.900' && gate.mil5.effAbsorb===0.9, JSON.stringify(gate.mil5));
ok('PLATING 5 vs shock = 6.480 HP/hit (supersedes 13.750)',
   gate.sho5.hp.toFixed(3)==='6.480' && Math.abs(gate.sho5.effAbsorb-0.64)<1e-9, JSON.stringify(gate.sho5));
ok('PLATING 5 vs praetor = 9.680 HP/hit (supersedes 22.400)',
   gate.pra5.hp.toFixed(3)==='9.680' && Math.abs(gate.pra5.effAbsorb-0.56)<1e-9, JSON.stringify(gate.pra5));
ok('the spread is still an emphatic gate: praetor costs >10x a militia round',
   gate.pra5.hp/gate.mil5.hp > 10, (gate.pra5.hp/gate.mil5.hp).toFixed(2)+'x');
ok('armour now SCALES: PLATING 5 absorbs more of a praetor round than PLATING 0 does of a militia round',
   gate.pra5.effAbsorb > gate.mil0.effAbsorb, gate.pra5.effAbsorb+' vs '+gate.mil0.effAbsorb);
ok('praetor BOSS at PLATING 5: pen 0.44, absorb 0.46',
   Math.abs(gate.bpra5.apPen-0.44)<1e-9 && Math.abs(gate.bpra5.effAbsorb-0.46)<1e-9, JSON.stringify(gate.bpra5));

console.log('\n=== 3. THE L1 HEADLINE FEATURE SURVIVES ===');
const l1 = await ev(`(()=>{const P=BP2.Profile,G=__game;
  P.setRank('plating',5); P.setRank('vitality',5); G.applyRanks();
  G.loadLevel(1); P.setRank('plating',5); P.setRank('vitality',5); G.applyRanks();
  G.god(false); G.GAME.state='play'; G.GAME.graceT=0; G.GAME.paintball=false;
  G.player.alive=true; G.player.hp=G.upg('vitality',5).maxHp; G.player.armor=G.upg('plating',5).pool;
  const t=BP2.TIERS.militia; let r=null;
  for(let i=0;i<40;i++){ r=G.hurt(t.dmg, t.apPen); G.player.regenT=0; }
  return {hpHit:+G.gateCalc('militia',5,false).hp.toFixed(3), hp:+r.hp.toFixed(1), armor:+r.armor.toFixed(1),
          alive:r.alive, maxHp:G.upg('vitality',5).maxHp};})()`);
ok('40 point-blank militia rounds at PLATING 5 / VITALITY 5 cost 36 of 260 HP — still standing',
   l1.alive===true && Math.abs(l1.hp-224)<0.01 && Math.abs(l1.armor-26)<0.01 && l1.hpHit===0.9,
   JSON.stringify(l1));
// real damagePlayer pipeline, sustained L1 fire, armour pool included
const l1ttd = await ev(`(()=>{const G=__game,P=BP2.Profile,t=BP2.TIERS.militia;
  const run=(p,v)=>{ P.setRank('plating',p); P.setRank('vitality',v); G.applyRanks();
    G.god(false); G.GAME.state='play'; G.GAME.graceT=0; G.GAME.paintball=false;
    G.player.alive=true; G.player.hp=G.upg('vitality',v).maxHp; G.player.armor=G.upg('plating',p).pool;
    const dt=0.02, rounds=2*4*(t.accuracy*0.6)/1.6; let s=0,gd=0;
    while(G.player.alive && gd++<200000){ G.hurt(t.dmg*rounds*dt, t.apPen); G.player.regenT=0; s+=dt; }
    return +s.toFixed(1); };
  const a=run(0,0), b=run(5,5); G.god(true); return {rank0:a, rank5:b};})()`);
ok('sustained L1 fire through the REAL damage pipeline: rank 0 dies in ~13 s, max build lasts 4x longer',
   l1ttd.rank0>12 && l1ttd.rank0<15 && l1ttd.rank5>45 && l1ttd.rank5/l1ttd.rank0>3.9, JSON.stringify(l1ttd));

console.log('\n=== 4. THE SHARED SURVIVAL MODEL (IMPROVEMENTS 1b) ===');
ok('the model lives in ONE function, exported for the hub to reuse',
   /§SURVIVAL/.test(src('js/armoury.js')) && /A\.survival\(lvl\)/.test(src('js/campaign.js')) &&
   !/threatAt\(lvl, *plating\)/.test(src('js/campaign.js')), '');
ok('still classic scripts, no type="module"', !/type="module"/.test(src('index.html')));
// four (level, build) pairs, recomputed from first principles inside the page
const PAIRS=[[1,5,5],[4,2,3],[6,4,1],[8,5,5]];
const model = await ev(`(()=>{const G=__game,A=G.Armoury,B=window.BP2, out=[];
  for(const [n,p,v] of ${JSON.stringify(PAIRS)}){
    const lvl=B.levelById(n), tier=A.mainTier(lvl), t=B.TIERS[tier];
    // P5a independent recomputation, written out from the ENGINE's constants:
    // burst randi(3,5) (+1 above accuracy 0.7) spaced 0.115 s, cooldown
    // mean(0.75,1.6)+0.5 past 22 m, scaled by lerp(1,reaction,0.5); the cooldown
    // runs during the burst so the period is max(cd, burst), not cd+burst.
    const nb=4+(t.accuracy>0.7?1:0);
    const cd=(1.175+0.5)*(1+(t.reaction-1)*0.5);
    const rate=nb/Math.max(cd,(nb-1)*0.115);
    const rounds=lvl.maxAttackers*rate*(t.accuracy*0.6);
    const g=G.gateCalc(tier,p,false), pl=G.upg('plating',p);
    const maxHp=B.UPGRADES.vitality.ranks[v].maxHp;
    // and the armour POOL, two phases: absorbed until it is empty, full after
    const armSec=pl.pool/(rounds*g.dmg*g.effAbsorb);
    const lost=g.hp*rounds*armSec;
    const expect = lost>=maxHp ? maxHp/(rounds*g.hp)
                               : armSec + (maxHp-lost)/(rounds*g.dmg);
    const got=A.survival(lvl,p,v).seconds;
    out.push({n,p,v,expect:+expect.toFixed(4), got:+got.toFixed(4), txt:A.fmtSec(got),
      band:A.BANDS[A.band(got)].label});
  }
  return out;})()`);
for(const m of model)
  ok(`survival(L${m.n}, P${m.p}V${m.v}) = ${m.txt} matches the model to 1e-9`,
     Math.abs(m.expect-m.got)<1e-9, `model ${m.expect}s got ${m.got}s -> ${m.band}`);
// and the rendered readout says the same thing
async function readout(n, p, v){
  await ev(`(()=>{const P=BP2.Profile; P.setRank('plating',${p}); P.setRank('vitality',${v});
    BP2.Campaign.select(${n}); P.get().level=${n}; P.save(); __game.applyRanks();
    BP2.Armoury.open('start'); return 1})()`);
  await sleep(180);
  return ev(`({txt:document.getElementById('armThreat').textContent.replace(/\\s+/g,' '),
    plate:(document.querySelector('[data-track="plating"] .gate')||{}).textContent||'',
    vit:(document.querySelector('[data-track="vitality"] .gate')||{}).textContent||'',
    st:BP2.Armoury.state()})`);
}
for(const m of model){
  const r = await readout(m.n, m.p, m.v);
  ok(`the rendered readout for L${m.n} P${m.p}V${m.v} leads with "you survive ~${m.txt}" and bands it ${m.band}`,
     r.txt.includes('you survive ~'+m.txt) && r.txt.includes(m.band) &&
     Math.abs(r.st.survive-m.got)<0.001, r.txt.slice(0,130));
}
const sec = await readout(8,5,5);
ok('HP-per-hit is kept as the SECONDARY line, not the headline',
   /you survive ~[^·]*·?.*their rounds cost you 9\.7 HP per hit/.test(sec.txt) &&
   sec.txt.indexOf('you survive') < sec.txt.indexOf('their rounds cost you'), sec.txt.slice(0,160));

console.log('\n=== 5. THE PLATING TRAP IS SURFACED, NOT BAITED ===');
const trap = await readout(6,4,1);
const trapN = await ev(`(()=>{const A=__game.Armoury,L=BP2.levelById(6);
  return {p45:+A.survival(L,5,1).seconds.toFixed(2), v13:+A.survival(L,4,3).seconds.toFixed(2),
          now:+A.survival(L,4,1).seconds.toFixed(2)};})()`);
ok('the numbers behind it: L6 from P4V1, PLATING 5 buys 2.52 s but VITALITY 3 buys 2.96 s',
   trapN.now<trapN.p45 && trapN.p45<trapN.v13, JSON.stringify(trapN));
ok('the PLATING row shows the survival delta, not HP per hit',
   /PLATING 4 → 5/.test(trap.plate) && /of open ground/.test(trap.plate) &&
   trap.plate.includes('2.5 s') && !/HP per hit/.test(trap.plate), trap.plate.replace(/\s+/g,' '));
ok('the PLATING row names VITALITY 1 → 3 for the same 2200 SP and says it BUYS MORE',
   /the same 2200 SP in VITALITY 1 → 3/.test(trap.plate) && /: 3 s/.test(trap.plate) &&
   /buys more/.test(trap.plate), trap.plate.replace(/\s+/g,' '));
ok('the VITALITY row carries its own survival delta too',
   /VITALITY 1 → 2/.test(trap.vit) && /of open ground/.test(trap.vit), trap.vit.replace(/\s+/g,' '));

console.log('\n=== 6. THE HUB CARDS USE THE SAME MODEL ===');
await ev(`(()=>{const P=BP2.Profile; P.setRank('plating',4); P.setRank('vitality',1);
  for(let i=1;i<=8;i++) P.get().cleared[i]=true; P.save(); BP2.Armoury.close();
  BP2.Campaign.open? BP2.Campaign.open() : 0; return 1})()`);
await ev(`document.getElementById('hubScreen').classList.remove('hidden');BP2.Campaign.select(6)`);
await sleep(250);
const hub = await ev(`(()=>{const c=document.querySelector('.lvcard[data-lvl="6"] .thr');
  return {txt:c? c.textContent.replace(/\\s+/g,' ') : '(no card)',
    want:__game.Armoury.fmtSec(__game.Armoury.survival(BP2.levelById(6)).seconds)};})()`);
ok('the M6 hub card leads with the same survival time the armoury shows',
   hub.txt.includes('you survive ~'+hub.want) && /HP per hit/.test(hub.txt) && /firing at once/.test(hub.txt),
   hub.txt+'   want '+hub.want);

console.log('\n=== 7. CANARIES ===');
// (a) error canary — prove the harness can see a thrown error at all
const before=errors.length;
await ev(`setTimeout(()=>{throw new Error('P4C-CANARY-ERR')},0)`); await sleep(400);
ok('CANARY(error): a deliberate throw reaches the harness error list',
   errors.length>before && errors.some(e=>/P4C-CANARY-ERR/.test(e)), errors.slice(before).join(' | '));
for(let i=errors.length-1;i>=0;i--) if(/P4C-CANARY-ERR/.test(errors[i])) errors.splice(i,1);
// (b) gameplay canary — feed the survival assertion a build it must NOT match
const canary = await ev(`(()=>{const A=__game.Armoury,B=window.BP2,L=B.levelById(6);
  const truth=A.survival(L,4,1).seconds;
  const wrong=A.survival(L,5,1).seconds;           // a DIFFERENT build
  const same =A.survival(L,4,1).seconds;
  return {truth:+truth.toFixed(4), wrong:+wrong.toFixed(4), same:+same.toFixed(4)};})()`);
ok('CANARY(gameplay): the survival check FAILS when fed the wrong build (P5V1 != P4V1)',
   Math.abs(canary.truth-canary.same)<1e-9 && Math.abs(canary.truth-canary.wrong)/canary.truth>0.1,
   JSON.stringify(canary));
// (c) and the rendered-readout check fails against a mismatched string
const wrongTxt = await readout(6,5,1);
ok('CANARY(gameplay): the rendered readout for P5V1 does NOT read as P4V1',
   !wrongTxt.txt.includes('you survive ~'+(await ev(`__game.Armoury.fmtSec(__game.Armoury.survival(BP2.levelById(6),4,1).seconds)`))),
   wrongTxt.txt.slice(0,110));

await sleep(400);
for(let i=errors.length-1;i>=0;i--) if(/CANARY/.test(errors[i])) errors.splice(i,1);
ok('zero console errors through the whole run (canaries spliced out)', errors.length===0, errors.slice(0,4).join(' | '));

await send('Emulation.clearDeviceMetricsOverride');
await send('Browser.setWindowBounds',{windowId:winId.windowId,bounds:{width:1200,height:800}});
console.log(`\n${pass} passed, ${fail} failed`+(fail?'\nFAILED: '+failed.join('\n        '):''));
ws.close(); process.exit(fail?1:0);
