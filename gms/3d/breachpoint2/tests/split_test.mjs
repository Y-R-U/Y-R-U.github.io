// P1.5 split verification suite — must reproduce the P1 numbers exactly.
// usage: node split_test.mjs [fileUrl]
const PORT = 9223;
const URL = process.argv[2] || 'file:///Users/aaronair/cc/yru/site/gms/3d/breachpoint2/index.html';
const sleep = ms => new Promise(r=>setTimeout(r,ms));

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = list.find(t=>t.type==='page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r=>ws.onopen=r);
let id=0; const pend=new Map(); const errors=[]; const logs=[];
ws.onmessage = ev => {
  const m = JSON.parse(ev.data);
  if(m.id && pend.has(m.id)){ pend.get(m.id)(m); pend.delete(m.id); return; }
  if(m.method==='Runtime.exceptionThrown') errors.push('EXC: '+(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text));
  if(m.method==='Runtime.consoleAPICalled'){
    const txt = m.params.args.map(a=>a.value!==undefined?a.value:(a.description||a.type)).join(' ');
    logs.push(m.params.type+': '+txt);
    if(m.params.type==='error') errors.push('CONSOLE: '+txt);
  }
  if(m.method==='Log.entryAdded' && m.params.entry.level==='error'){
    const e=m.params.entry;
    if(e.source!=='intervention' && e.source!=='violation' && !/navigator\.vibrate/.test(e.text)) errors.push('LOG: '+e.source+' '+e.text);
  }
};
const send = (method, params={}) => new Promise(res=>{ const i=++id; pend.set(i,res); ws.send(JSON.stringify({id:i,method,params})); });
const evaluate = async expr => {
  const r = await send('Runtime.evaluate',{expression:expr, returnByValue:true, awaitPromise:true});
  if(r.result?.exceptionDetails) throw new Error(expr.slice(0,80)+' -> '+JSON.stringify(r.result.exceptionDetails.exception?.description||r.result.exceptionDetails.text));
  return r.result.result.value;
};

await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
await send('Network.setCacheDisabled',{cacheDisabled:true}).catch(()=>{});
await send('Page.navigate',{url:'about:blank'});
await sleep(400);
errors.length=0; logs.length=0;      // drop anything Chrome replayed from the previous page
await send('Page.navigate',{url:URL});
await sleep(4500);

let pass=0, fail=0; const failed=[];
const ok=(name,cond,extra='')=>{ if(cond) pass++; else { fail++; failed.push(name); } console.log((cond?'PASS  ':'FAIL  ')+name+(extra?'   '+extra:'')); };

console.log('--- URL:', URL, '\n');

/* 1-3 boot */
ok('boots, __game present', await evaluate('!!window.__game'));
ok('three.js loaded, no FAILED-TO-LOAD guard', await evaluate(`!!window.THREE && !/FAILED TO LOAD/.test(document.getElementById('loadWrap').innerHTML)`));
ok('zero console errors / exceptions on load', errors.length===0, errors.join(' | '));

/* 4 canary — prove the collector can fail */
await evaluate('setTimeout(()=>{ throw new Error("CANARY") },10)');
await sleep(400);
const sawCanary = errors.some(e=>/CANARY/.test(e));
ok('CANARY: error collector catches a real exception', sawCanary, sawCanary? errors.filter(e=>/CANARY/.test(e))[0].slice(0,60) : '(collector is blind!)');
for(let i=errors.length-1;i>=0;i--) if(/CANARY/.test(errors[i])) errors.splice(i,1);

/* --- perf pass FIRST: draw calls are frustum-sensitive, so they are sampled
   in a fixed order on a freshly booted page, 1.2 s after each level load. */
// The count decays as enemies wander out of the view frustum, so the stable
// figure is the peak over the first ~1.6 s with the roster still at its spawns.
const peakDraw = async n => {
  // PIN THE QUALITY. Shadows on/off IS the 112 vs 208 difference, and the
  // auto-quality net flips them mid-measurement at a nondeterministic moment,
  // so an unpinned run reports either figure at random on ANY build.
  await evaluate(`__game.S.quality='low';__game.S.bloom=0;__game.applySettings()`);
  await sleep(300);
  await evaluate(`__game.loadLevel(${n})`);
  // PIN THE CAMERA TOO. P4b gave every level its own insertion point, so the
  // spawn pose — and therefore what is in the frustum — is no longer the same
  // on every level. This figure is about the WORLD, so measure it from the
  // one reference pose the 112/114 numbers were always taken at.
  const POSE = `__game.teleport(1.5,24.5);__game.look(0,0)`;
  await evaluate(POSE);
  let calls=0, tris=0;
  for(let i=0;i<16;i++){ await sleep(100);
    if(i%3===0) await evaluate(POSE);
    const s = await evaluate('({calls:__game.drawCalls(), tris:__game.tris()})');
    if(s.calls>calls){ calls=s.calls; tris=s.tris; } }
  return {calls, tris};
};
const dc1 = await peakDraw(1);
const dc8 = await peakDraw(8);
// P4a added the permanent dock: +1 for the water plane, +1 for the zone marker
// on a zone level. Everything else merged into the existing buckets for free.
// P5b: rigs are vertex-coloured (one mesh per animation group) and distance-LOD'd
// (every far enemy in one instanced draw call), so the per-rig cost is no longer
// a constant and the live figure moves with where the AI is standing. The number
// that is still EXACT is the static world with the rigs hidden — asserted below
// and in p4b_test §8. Pre-P5b these read L1 114 / L8 302.
ok('draw calls on L1 are inside the post-P5b band (was 114)', dc1.calls>=36 && dc1.calls<=70,
   `calls=${dc1.calls} tris=${dc1.tris}`);
// NOTE (P5b): this is a PEAK over ~1.6 s. Pre-P5b a rig cost the same wherever it
// stood, so the peak only sampled the frustum; now it also samples how close the
// squad has crowded, and a peak lands well above the median. The 120-150 target is
// on the MEDIAN with the pose pinned (p5b_test 1) — allow the peak more room.
ok('draw calls on L8 peak are inside the post-P5b band (median target 120-150; was ~305)',
   dc8.calls>=110 && dc8.calls<=180, `calls=${dc8.calls} tris=${dc8.tris}`);

/* 5-9 data tables via BP2 */
ok('window.BP2 namespace published', await evaluate('!!(window.BP2 && BP2.LEVELS && BP2.TIERS && BP2.UPGRADES && BP2.Profile)'));
const tbl = await evaluate(`(()=>{const B=window.BP2||__game;return{
  levels:B.LEVELS.length, campaign:B.LEVELS.filter(l=>!l.endless).length,
  praetorPen:B.TIERS.praetor.apPen, tiers:Object.keys(B.TIERS).length,
  tracks:Object.keys(B.UPGRADES).length,
  same:(window.BP2? (BP2.LEVELS===__game.LEVELS && BP2.TIERS===__game.TIERS && BP2.Profile===__game.Profile):null)};})()`);
ok('BP2.LEVELS.length === 10 (9 campaign + endless)', tbl.levels===10 && tbl.campaign===9, `total=${tbl.levels} campaign=${tbl.campaign}`);
ok('BP2.TIERS.praetor.apPen === 0.34 (P4c variant C)', tbl.praetorPen===0.34, String(tbl.praetorPen));
ok('6 tiers, 6 upgrade tracks', tbl.tiers===6 && tbl.tracks===6, tbl.tiers+' / '+tbl.tracks);
ok('engine aliases are the same objects as BP2.*', tbl.same===true || tbl.same===null, String(tbl.same));

/* 10-14 armour gate */
const gate = await evaluate(`(()=>{const g=__game;return{
  mil5:g.gateCalc('militia',5), shock5:g.gateCalc('shock',5), pra5:g.gateCalc('praetor',5),
  mil0:g.gateCalc('militia',0), bossPra5:g.gateCalc('praetor',5,true)};})()`);
ok('PLATING 5 vs militia = 0.900 HP/hit', gate.mil5.hp.toFixed(3)==='0.900', gate.mil5.hp.toFixed(3)+' HP, effAbsorb '+gate.mil5.effAbsorb.toFixed(2));
ok('PLATING 5 vs shock = 6.480 HP/hit', gate.shock5.hp.toFixed(3)==='6.480', gate.shock5.hp.toFixed(3)+' HP, effAbsorb '+gate.shock5.effAbsorb.toFixed(2));
ok('PLATING 5 vs praetor = 9.680 HP/hit', gate.pra5.hp.toFixed(3)==='9.680', gate.pra5.hp.toFixed(3)+' HP, effAbsorb '+gate.pra5.effAbsorb.toFixed(2));
ok('PLATING 0 vs militia = 9 dmg @ 0.50 absorb', Math.abs(gate.mil0.dmg-9)<1e-9 && Math.abs(gate.mil0.effAbsorb-0.5)<1e-9, JSON.stringify(gate.mil0));
ok('boss praetor vs PLATING 5 = 0.44 pen, 0.46 absorb', Math.abs(gate.bossPra5.apPen-0.44)<1e-9 && Math.abs(gate.bossPra5.effAbsorb-0.46)<1e-9, JSON.stringify(gate.bossPra5));

/* 15-17 profile */
const prof = await evaluate(`(()=>{const P=__game.Profile;P.reset();P.award(1234);P.setRank('plating',3);P.unlock('pistol');
  const raw=localStorage.getItem('bp2_profile');P.load();
  return {sp:P.get().sp, rank:P.rank('plating'), raw:!!raw, rifle:P.isUnlocked('rifle'), pistol:P.isUnlocked('pistol'), sniper:P.isUnlocked('sniper')};})()`);
ok('Profile round-trips localStorage', prof.sp===1234 && prof.rank===3 && prof.raw && prof.rifle && prof.pistol && !prof.sniper, JSON.stringify(prof));
const c1 = await evaluate(`(()=>{localStorage.setItem('bp2_profile','{not json');const p=__game.Profile.load();
  return {sp:p.sp, rank:__game.Profile.rank('plating'), rifle:__game.Profile.isUnlocked('rifle'), level:p.level};})()`);
ok('Profile survives corrupt JSON ({not json)', c1.sp===0 && c1.rank===0 && c1.rifle && c1.level===0, JSON.stringify(c1));
const c2 = await evaluate(`(()=>{localStorage.setItem('bp2_profile','{"sp":"xx","ranks":99,"unlocked":5,"level":{"a":1},"stats":"no"}');
  const p=__game.Profile.load();
  const r={sp:p.sp, rank:__game.Profile.rank('vitality'), rifle:__game.Profile.isUnlocked('rifle'), level:p.level, kills:p.stats.kills};
  __game.Profile.reset(); return r;})()`);
ok('Profile survives type-confused JSON', c2.sp===0 && c2.rank===0 && c2.rifle && c2.level===0 && c2.kills===0, JSON.stringify(c2));

/* 18-20 level 1 */
const l1 = await evaluate(`(()=>{__game.Profile.reset();const i=__game.loadLevel(1);const es=__game.enemyInfo();
  return {info:i, alive:es.filter(e=>e.alive).length, total:es.length, tiers:[...new Set(es.map(e=>e.tier))],
    bosses:es.filter(e=>e.boss).length, pool:__game.poolInfo().length, inactive:__game.poolInfo().filter(e=>!e.active).length};})()`);
ok('loadLevel(1) = exactly 5 militia, 0 bosses', l1.alive===5 && l1.total===5 && l1.tiers.join()==='militia' && l1.bosses===0, JSON.stringify({a:l1.alive,t:l1.total,tiers:l1.tiers,b:l1.bosses}));
ok('pool 20 rigs, 15 deactivated on L1', l1.pool===20 && l1.inactive===15, `pool=${l1.pool} inactive=${l1.inactive}`);
const dormant = await evaluate(`(()=>{const off=__game.Enemies.list().filter(e=>!e.active);
  const o=new (window.THREE.Vector3)(0,1,0), d=new (window.THREE.Vector3)(0,0,-1);
  return {n:off.length, visible:off.filter(e=>e.rig.root.visible).length, tags:off.filter(e=>e.tag.sprite.visible).length,
    raycast:off.filter(e=>e.rayTest(o,d,300)!==null).length, counted:__game.Enemies.aliveCount()};})()`);
ok('15 inactive rigs hidden, untagged, unraycastable, uncounted',
   dormant.n===15 && dormant.visible===0 && dormant.tags===0 && dormant.raycast===0 && dormant.counted===5, JSON.stringify(dormant));

/* 21-25 level 8 */
const l8 = await evaluate(`(()=>{const i=__game.loadLevel(8);const es=__game.enemyInfo();const b=es.filter(e=>e.boss);
  return {total:es.length, grunts:es.filter(e=>!e.boss).length, bosses:b.length,
    bossHp:b[0]&&b[0].maxHp, bossName:b[0]&&b[0].name, bossScale:b[0]&&b[0].scale, bossPen:b[0]&&b[0].apPen,
    order:es.map(e=>e.boss?1:0).join(''), maxAtt:__game.levelInfo().maxAttackers, rosterSize:i.rosterSize};})()`);
ok('loadLevel(8) = 18 grunts + 1 boss (19)', l8.grunts===18 && l8.bosses===1 && l8.total===19 && l8.rosterSize===19, JSON.stringify({g:l8.grunts,b:l8.bosses,t:l8.total}));
ok('boss maxHp === 484', l8.bossHp===484, String(l8.bossHp));
ok('boss scale 1.18 / apPen 0.44 / name THE MARSHAL', Math.abs(l8.bossScale-1.18)<1e-6 && Math.abs(l8.bossPen-0.44)<1e-6 && l8.bossName==='THE MARSHAL', JSON.stringify({s:l8.bossScale,p:l8.bossPen,n:l8.bossName}));
ok('L8 maxAttackers === 4 (P4c variant C)', l8.maxAtt===4, String(l8.maxAtt));
ok('bosses spawn last in the roster', /^0+1+$/.test(l8.order), l8.order);

/* 26 L7 */
const l7 = await evaluate(`(()=>{__game.loadLevel(7);const es=__game.enemyInfo();
  return {total:es.length, bosses:es.filter(e=>e.boss).length, names:es.filter(e=>e.boss).map(e=>e.name)};})()`);
ok('L7 = 14 + 2 bosses (UMBRA, NOCTIS)', l7.total===16 && l7.bosses===2 && l7.names.join()==='UMBRA,NOCTIS', JSON.stringify(l7));

/* 27 boss visuals */
const bossViz = await evaluate(`(()=>{__game.loadLevel(2);
  const b=__game.Enemies.list().find(e=>e.boss), g=__game.Enemies.list().find(e=>e.active&&!e.boss);
  let bm=null, gm=null; b.rig.root.traverse(o=>{if(o.isMesh&&!bm)bm=o.material}); g.rig.root.traverse(o=>{if(o.isMesh&&!gm)gm=o.material});
  return {scale:b.rig.root.scale.x, light:!!(b.bossLight&&b.bossLight.visible), matDiffers:bm!==gm,
    emissive:bm.emissive?bm.emissive.getHexString():null, name:b.name};})()`);
ok('boss visuals: 1.18 scale, red light, own emissive material',
   Math.abs(bossViz.scale-1.18)<1e-6 && bossViz.light && bossViz.matDiffers && bossViz.emissive!=='000000', JSON.stringify(bossViz));

/* 28 spawn sanity on the full roster */
await evaluate('__game.loadLevel(8)'); await sleep(250);
const sp = await evaluate(`(()=>{const es=__game.enemyInfo();let bad=0,minD=1e9;
  for(let i=0;i<es.length;i++){ if(__game.NAV.isBlockedWorld(es[i].x,es[i].z)) bad++;
    for(let j=i+1;j<es.length;j++){const d=Math.hypot(es[i].x-es[j].x,es[i].z-es[j].z); if(d<minD) minD=d;} }
  return {bad, minD:+minD.toFixed(2), nearest:+Math.min(...es.map(e=>Math.hypot(e.x-1.5,e.z-24.5))).toFixed(2)};})()`);
ok('19 spawn points unblocked and spread', sp.bad===0 && sp.minD>2.5 && sp.nearest>10, JSON.stringify(sp));

/* 29-31 HUD / branding */
const hud = await evaluate(`({kills:document.getElementById('kills').textContent, ap:document.getElementById('apFill').style.width,
  title:document.title, h1:document.querySelector('#startScreen h1').textContent})`);
ok('kill counter reads the level roster (0 / 19)', hud.kills==='0 / 19 ELIMINATED', hud.kills);
ok('branding is BREACHPOINT II', hud.title==='BREACHPOINT II' && /II/.test(hud.h1), hud.title+' | '+hud.h1);

/* 32 L0 */
await evaluate('__game.Profile.reset();__game.loadLevel(0)'); await sleep(400);
const l0 = await evaluate(`({alive:__game.Enemies.aliveCount(), timed:__game.GAME.timed,
  tier:__game.enemyInfo()[0].tier, maxAtt:__game.levelInfo().maxAttackers})`);
ok('L0 = 2 paint targets, untimed, maxAttackers 1', l0.alive===2 && l0.timed===false && l0.tier==='paint' && l0.maxAtt===1, JSON.stringify(l0));

/* 33 grantSP + persistence */
const spv = await evaluate(`(()=>{__game.Profile.reset();const a=__game.grantSP(500);
  return {a, stored:JSON.parse(localStorage.getItem('bp2_profile')).sp};})()`);
ok('grantSP awards and persists to localStorage', spv.a===500 && spv.stored===500, JSON.stringify(spv));

/* 34 win flow on L0 — CHANGED BY P2: the training round is owned by the
   tutorial, so downing both targets no longer ends it on its own. It ends on
   "2 down AND every drill step done" (or SKIP TRAINING), and hands off to the
   WAR DECLARED screen instead of the normal debrief. */
await evaluate('__game.Profile.reset();__game.loadLevel(0)'); await sleep(700);
await evaluate('__game.Enemies.list().filter(e=>e.active).forEach(e=>__game.Enemies.damage(e,999,false,null))');
await sleep(900);
const held = await evaluate(`({state:__game.GAME.state, step:BP2.Tutorial.state().step, downs:BP2.Tutorial.state().counters.downs})`);
ok('L0 stays live with targets down until the drills are done', held.state==='play' && !!held.step, JSON.stringify(held));
await evaluate(`document.getElementById('btnSkipTut').click()`); await sleep(1200);
// P4a: the war beat plays OVER the still-live round, so the round is only over
// once the radio is done (or skipped in one tap).
const mid = await evaluate(`({state:__game.GAME.state, war:BP2.Tutorial.warRunning(),
  queued:BP2.Campaign.Radio.remaining()})`);
ok('the war beat starts without ending the round', mid.state==='play' && mid.war && mid.queued>=4,
   JSON.stringify(mid));
await evaluate(`BP2.Campaign.Radio.skip()`); await sleep(900);
const win = await evaluate(`({state:__game.GAME.state, kills:__game.GAME.stats.kills, roster:__game.GAME.rosterSize,
  hub:BP2.Campaign.hubVisible(), award:BP2.Tutorial.award(),
  sp:__game.Profile.get().sp, cleared:!!__game.Profile.get().cleared[0], nextLevel:__game.Profile.get().level})`);
ok('L0 training completes, awards 300 SP and opens the dock', win.state==='end' && win.kills===2 && win.hub && win.award===300 && win.cleared && win.nextLevel===1,
   `state=${win.state} kills=${win.kills}/${win.roster} hub=${win.hub} award=${win.award} sp=${win.sp} nextLevel=${win.nextLevel}`);

/* 35 settings key */
const keys = await evaluate(`(()=>{localStorage.removeItem('bp_settings');localStorage.removeItem('bp2_settings');
  __game.S.fov=81;__game.applySettings();try{localStorage.setItem('bp2_settings',JSON.stringify(__game.S));}catch(e){}
  return {bp2:JSON.parse(localStorage.getItem('bp2_settings')||'{}').fov, bp1:localStorage.getItem('bp_settings')};})()`);
ok('settings go to bp2_settings, bp_settings untouched', keys.bp2===81 && keys.bp1===null, JSON.stringify(keys));

/* 36 hooks intact */
const hooks = await evaluate(`(()=>{const g=__game;const missing=['teleport','look','fire','setWeapon','ads','ammo','enemyInfo','insideSolid',
  'groundAt','probe','drawCalls','tris','losClear','god','start','loadLevel','grantSP','levelInfo','gateCalc','effAbsorb','upg','applySettings','onResize']
  .filter(k=>typeof g[k]!=='function'); return {missing, probe:!!g.probe(), ammo:g.ammo()};})()`);
ok('__game test surface intact', hooks.missing.length===0 && hooks.probe, JSON.stringify(hooks));

/* 37 final sweep */
await sleep(700);
ok('still zero errors after every level load + win flow', errors.length===0, errors.slice(0,4).join(' | '));

console.log(`\n${pass} passed, ${fail} failed` + (fail? '  -> '+failed.join(', ') : ''));
console.log('draw calls   L1:', dc1.calls, ' L8:', dc8.calls, '| tris L1:', dc1.tris, 'L8:', dc8.tris);
console.log('console messages:', logs.length ? logs.slice(0,8).join(' | ') : '(none)');
ws.close();
process.exit(fail?1:0);
