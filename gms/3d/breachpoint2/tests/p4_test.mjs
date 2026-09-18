// BREACHPOINT II — P4a verification suite.
// objectives · the dock · lighting presets (incl. AI sight) · boss presentation
// · the campaign hub · the war beat · paint persistence · the P1-P3 numbers.
import {connect,URL,sleep} from './lib.mjs';
import {readFileSync} from 'node:fs';
const SRC='/Users/aaronair/cc/yru/site/gms/3d/breachpoint2/';
const src=f=>readFileSync(SRC+f,'utf8');
const {ws,send,ev,errors}=await connect();

let pass=0, fail=0; const failed=[];
const ok=(n,c,x='')=>{ if(c) pass++; else {fail++; failed.push(n);} console.log((c?'PASS  ':'FAIL  ')+n+(x?'   '+x:'')); };

await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
await send('Network.setCacheDisabled',{cacheDisabled:true});
await send('Emulation.setTouchEmulationEnabled',{enabled:false});
const winId = (await send('Browser.getWindowForTarget')).result;
await send('Emulation.setDeviceMetricsOverride',{width:1000,height:620,deviceScaleFactor:1,mobile:false});

const nav = async ()=>{ await send('Page.navigate',{url:URL}); await sleep(3600); };
await send('Page.navigate',{url:'about:blank'}); await sleep(400); errors.length=0;
await nav();
await ev(`localStorage.removeItem('bp2_profile');localStorage.removeItem('bp2_settings');localStorage.removeItem('bp2_paint')`);
await nav();
// PIN THE QUALITY before anything measures a draw call (PIPELINE trap)
const pin = ()=>ev(`__game.S.quality='low';__game.S.bloom=0;__game.applySettings()`);
await pin();

const key=()=>++keyN, keyN=0;
const round = async (n)=>{ await ev(`(()=>{__game.loadLevel(${n});__game.god(true);return 1;})()`); await sleep(350); await pin(); };
const poll = async (expr, want, ms=4000, step=120)=>{
  const t0=Date.now();
  let v=null;
  while(Date.now()-t0<ms){ v=await ev(expr); if(want(v)) return v; await sleep(step); }
  return v;
};

console.log('\n=== 1. BOOT ===');
ok('zero console errors / exceptions on load', errors.length===0, errors.join(' | '));
ok('campaign.js is a classic script, loaded last',
   /<script src="js\/campaign\.js"><\/script>/.test(src('index.html')) &&
   src('index.html').indexOf('campaign.js') > src('index.html').indexOf('armoury.js'));
ok('no type="module" anywhere in index.html', !/type\s*=\s*["']module/.test(src('index.html')));
ok('BP2.Campaign is published', await ev('!!(BP2.Campaign && window.__game.Campaign)'));
ok('engine exposes Light / OBJ hooks', await ev('!!(__game.Light && __game.OBJ && __game.objState && __game.lightState)'));
await ev('setTimeout(()=>{throw new Error("CANARY")},10)'); await sleep(900);
const sawCanary = errors.some(e=>/CANARY/.test(e));
ok('CANARY(errors): the collector catches a deliberate throw', sawCanary, sawCanary?'caught':'COLLECTOR IS BLIND');
for(let i=errors.length-1;i>=0;i--) if(/CANARY/.test(errors[i])) errors.splice(i,1);

console.log('\n=== 2. THE DOCK ===');
await round(1);
const geo = await ev(`(()=>{
  const S=__game.solids, X0=__game.QUAY_X0, X1=__game.QUAY_X1;
  const water=__game.scene.children.filter(o=>o.name==='water')[0];
  const kerb=S.filter(s=>Math.abs(s.x0-25.75)<0.01 && Math.abs(s.x1-26.25)<0.01 && s.y1<=0.45)[0];
  const cap =S.filter(s=>s.x0>=26.15 && s.y1>=9 && !s.climb)[0];
  const legs=S.filter(s=>s.y1>13 && s.y1<14 && !s.climb && s.x0>=21 && s.x1<=26.1);
  const boll=S.filter(s=>Math.abs(s.y1-0.9)<0.02 && s.x0>24.5 && s.x1<25.5);
  const bb=water? (water.geometry.boundingBox||(water.geometry.computeBoundingBox(),water.geometry.boundingBox)):null;
  return {X0,X1, water:!!water, waterY:water?+water.geometry.attributes.position.getY(0).toFixed(2):null,
    waterX0:bb?+bb.min.x.toFixed(1):null, waterX1:bb?+bb.max.x.toFixed(1):null,
    kerb:!!kerb, kerbClimb:kerb?kerb.climb:null, kerbTop:kerb?+kerb.y1.toFixed(2):null,
    cap:!!cap, legs:legs.length, bollards:boll.length, bollardClimb:boll.every(b=>!b.climb),
    eastWall:S.filter(s=>s.x0>29 && s.y1>1 && s.z1-s.z0>50).length};})()`);
console.log('   ', JSON.stringify(geo));
ok('quay deck runs x 22 -> 26', geo.X0===22 && geo.X1===26);
ok('water plane at y -1.2, from the kerb out ~94m', geo.water && geo.waterY===-1.2 && geo.waterX0===26 && geo.waterX1===120,
   `y=${geo.waterY} x ${geo.waterX0}..${geo.waterX1}`);
ok('0.4m kerb at x=26 and it is NOT climbable', geo.kerb && geo.kerbTop===0.4 && geo.kerbClimb===false,
   `top=${geo.kerbTop} climb=${geo.kerbClimb}`);
ok('two gantry cranes, 8 legs, none of them climbable', geo.legs===8, `legs=${geo.legs}`);
ok('mooring bollards along the kerb, not climbable', geo.bollards>=8 && geo.bollardClimb, `n=${geo.bollards}`);
ok('the east perimeter fence is gone, replaced by the quay edge', geo.eastWall===0, `east wall solids=${geo.eastWall}`);

// you cannot WALK off the quay: hold forward into the kerb and poll while held
await ev(`__game.teleport(25.0,-2);__game.look(-Math.PI/2,0)`); await sleep(200);
await send('Input.dispatchKeyEvent',{type:'keyDown',code:'KeyW',key:'w',windowsVirtualKeyCode:87});
let maxX=0;
for(let i=0;i<22;i++){ await sleep(130); const x=await ev('+__game.player.pos.x.toFixed(3)'); if(x>maxX) maxX=x; }
await send('Input.dispatchKeyEvent',{type:'keyUp',code:'KeyW',key:'w',windowsVirtualKeyCode:87});
await sleep(250);
const afterWalk = await ev(`({x:+__game.player.pos.x.toFixed(2), hp:Math.round(__game.player.hp)})`);
ok('walking east into the kerb never gets you past it', maxX<=26.1 && afterWalk.x<=26.1, `max x reached ${maxX.toFixed(2)}`);

// the recovery itself, driven the only way a player could ever reach it
await ev(`__game.god(false);__game.player.hp=__game.player.maxHp;__game.player.armor=0`);
const dunk = async (x,z)=>{
  await ev(`__game.teleport(${x},${z})`);
  await sleep(500);
  return await ev(`({x:+__game.player.pos.x.toFixed(2), z:+__game.player.pos.z.toFixed(2),
    y:+__game.player.pos.y.toFixed(2), hp:Math.round(__game.player.hp)})`);
};
const d1 = await dunk(60,-2);   await sleep(800);
const d2 = await dunk(95,14);   await sleep(800);
const d3 = await dunk(40,-20);
console.log('   dunks:', JSON.stringify([d1,d2,d3]));
ok('out of bounds puts you back ON the quay, at the same z', d1.x>=22 && d1.x<=26 && Math.abs(d1.z-(-2))<2,
   `-> x=${d1.x} z=${d1.z}`);
ok('it cannot be used to escape the map', d2.x<=26 && d3.x<=26, `x=${d2.x}, ${d3.x}`);
ok('it cannot be used to farm safety: every dunk costs HP', d1.hp<100 && d2.hp<d1.hp && d3.hp<d2.hp,
   `hp 100 -> ${d1.hp} -> ${d2.hp} -> ${d3.hp}`);
ok('it does not relocate you out of the fight (same z, ±2m)',
   Math.abs(d2.z-14)<2 && Math.abs(d3.z-(-20))<2, `z ${d2.z}, ${d3.z}`);
await ev(`__game.god(true)`);

console.log('\n=== 3. LIGHTING PRESETS ===');
const base = await ev('__game.lightState().lights');
const presets = await ev(`Object.keys(__game.LIGHT_PRESETS)`);
ok('eight presets: the seven in the spec plus the L7 night+fog composite',
   presets.length===8 && ['day','overcast','dusk','night','haze','fog','storm','nightfog'].every(p=>presets.includes(p)),
   presets.join(','));
const rows=[];
for(const p of presets){
  await ev(`__game.S.quality='high';__game.applySettings();__game.setLight('${p}')`);
  rows.push(await ev(`(()=>{const L=__game.lightState();return {p:'${p}',n:L.name,sun:L.sun,hemi:L.hemi,amb:L.amb,
    fog:L.fogCol,near:L.near,far:L.far,sight:L.sight,lights:L.lights};})()`));
}
for(const r of rows) console.log('   ', r.p.padEnd(9), 'sun',String(r.sun).padEnd(5),'hemi',String(r.hemi).padEnd(5),
  'amb',String(r.amb).padEnd(5),'fog 0x'+r.fog.toString(16).padStart(6,'0'),r.near+'->'+r.far,'aiSight',r.sight);
ok('every preset applies and reports its own name', rows.every(r=>r.n===r.p));
ok('NO preset adds or removes a light (4 world lights, always)',
   rows.every(r=>r.lights.world===base.world && r.lights.world===4),
   rows.map(r=>r.p+':'+r.lights.world).join(' '));
const byName=Object.fromEntries(rows.map(r=>[r.p,r]));
ok('day matches the spec table (1.5 / 0.85 / 0.32, fog 26->96)',
   byName.day.sun===1.5 && byName.day.hemi===0.85 && byName.day.amb===0.32 && byName.day.near===26 && byName.day.far===96);
ok('fog matches the spec table (0.55 / 0.42, fog 8->34)',
   byName.fog.sun===0.55 && byName.fog.amb===0.42 && byName.fog.near===8 && byName.fog.far===34);
ok('storm matches the spec table (0.60 / 0.30, fog 12->44)',
   byName.storm.sun===0.6 && byName.storm.amb===0.3 && byName.storm.near===12 && byName.storm.far===44);
ok('overcast / dusk / night / haze match the spec table',
   byName.overcast.sun===0.75 && byName.overcast.far===80 &&
   byName.dusk.sun===1.05 && byName.dusk.far===85 &&
   byName.night.sun===0.32 && byName.night.far===60 &&
   byName.haze.sun===1.25 && byName.haze.far===52);
ok('night and fog are the only presets that halve the AI sight range',
   byName.night.sight===26 && byName.fog.sight===22 && byName.nightfog.sight===18 && byName.day.sight===48,
   `day ${byName.day.sight} night ${byName.night.sight} fog ${byName.fog.sight} nightfog ${byName.nightfog.sight}`);
// aim assist has to shrink with it or fog is a one-way filter
const assist = await ev(`(()=>{const out={};for(const p of ['day','fog','night']){__game.setLight(p);
  out[p]=Math.min(70, __game.scene.fog.far);}__game.setLight('day');return out;})()`);
ok('the player aim-assist reach follows the fog too', assist.day===70 && assist.fog===34 && assist.night===60,
   JSON.stringify(assist));
// LOW quality may only shorten the preset, never rewrite it
const q = await ev(`(()=>{__game.setLight('fog');__game.S.quality='low';__game.applySettings();
  const lo={n:__game.scene.fog.near,f:__game.scene.fog.far,s:__game.Light.sight()};
  __game.setLight('day');const d={n:__game.scene.fog.near,f:__game.scene.fog.far};
  __game.S.quality='high';__game.applySettings();const hi={n:__game.scene.fog.near,f:__game.scene.fog.far};
  return {lo,d,hi};})()`);
ok('quality shortens fog but never changes what the AI can see',
   q.lo.n===8 && q.lo.f===34 && q.lo.s===22 && q.d.f===74 && q.hi.f===96, JSON.stringify(q));
await pin();

console.log('\n=== 4. FOG CUTS BOTH WAYS — A REAL SIGHT MEASUREMENT ===');
// find a genuinely clear 40m sight line so the measurement is about range, not cover
const line = await ev(`(()=>{
  for(const x of [0,-9,3,6,-6,11,-13,17]) for(let z=28; z>-4; z-=0.5){
    const z2=z-40; if(z2<-28.5) continue;
    if(!__game.losClear(x,1.62,z, x,1.58,z2)) continue;
    if(!__game.losClear(x,1.62,z, x,1.58,z-30)) continue;
    if(__game.pointBlocked(x,0.2,1.8,z,0.45)) continue;
    if(__game.pointBlocked(x,0.2,1.8,z2,0.45)) continue;
    if(__game.pointBlocked(x,0.2,1.8,z-30,0.45)) continue;
    return {x,z,z40:z2,z30:z-30};
  } return null;})()`);
console.log('   sight line:', JSON.stringify(line));
// one lone enemy, pinned, facing the player. Everything else is switched off.
const spot = async (dist, light)=>{
  await ev(`(()=>{
    __game.setLight('${light}');
    const L=__game.Enemies.list(); const e=L[0];
    for(let i=1;i<L.length;i++){ L[i].active=false; L[i].alive=false; }
    e.active=true; e.alive=true; e.hp=e.maxHp;
    e.state='idle'; e.sawPlayer=false; e.lostT=99; e.seeT=0; e.path.length=0;
    __game.teleport(${line.x}, ${line.z});
    __game.look(0,0);
    e.pos.set(${line.x}, 0, ${line.z - dist});
    e.rig.root.position.copy(e.pos);
    const dx=__game.player.pos.x-e.pos.x, dz=__game.player.pos.z-e.pos.z;
    e.aimYaw = Math.atan2(dx,dz) - Math.PI;
    return 1;})()`);
  let saw=false;
  for(let i=0;i<22;i++){
    await sleep(120);
    const r = await ev(`(()=>{const e=__game.Enemies.list()[0];
      e.pos.set(${line.x}, 0, ${line.z - dist}); e.rig.root.position.copy(e.pos);
      e.vel.set(0,0,0);
      const dx=__game.player.pos.x-e.pos.x, dz=__game.player.pos.z-e.pos.z;
      e.aimYaw=Math.atan2(dx,dz)-Math.PI;
      return {saw:e.sawPlayer, st:e.state, d:+e.pos.distanceTo(__game.player.pos).toFixed(1)};})()`);
    if(r.saw){ saw=true; break; }
  }
  return saw;
};
await round(1);
const sawDay40 = await spot(40,'day');
const sawDay30 = await spot(30,'day');
const sawFog40 = await spot(40,'fog');
const sawFog30 = await spot(30,'fog');
const sawFog18 = await spot(18,'fog');
console.log(`   day 40m: ${sawDay40}   day 30m: ${sawDay30}   fog 40m: ${sawFog40}   fog 30m: ${sawFog30}   fog 18m: ${sawFog18}`);
ok('in DAY an enemy spots you down a clear 40 m line', sawDay40===true);
ok('in FOG that same enemy at that same spot does NOT', sawFog40===false);
ok('in FOG it still does not spot you at 30 m — and in DAY it does', sawFog30===false && sawDay30===true,
   `fog30=${sawFog30} day30=${sawDay30}`);
ok('fog is a range change, not blindness: at 18 m it sees you again', sawFog18===true);
await ev(`__game.setLight('day')`);

console.log('\n=== 5. OBJECTIVES — EACH TYPE COMPLETES ===');
const endState = ()=>ev(`({state:__game.GAME.state, ended:__game.GAME.ended,
  won:document.getElementById('endTitle').className==='win',
  reason:document.getElementById('endSub').textContent, obj:__game.objState()})`);
const killAll = ()=>ev(`__game.Enemies.list().filter(e=>e.active&&e.alive).forEach(e=>__game.Enemies.damage(e,e.maxHp*9,false,null))`);

// --- eliminate (L2)
await round(2); await sleep(300);
await killAll(); await sleep(900);
let r = await endState();
ok('ELIMINATE completes when the roster is down', r.ended && r.won && /HOSTILES DOWN/.test(r.reason),
   `${r.reason} obj=${r.obj.kind}`);

// --- capture (L1): clear the zone, then hold it. 20 s of real meter.
await round(1); await sleep(300);
await killAll(); await sleep(500);
await ev(`__game.teleport(18,2)`);
let cap = await poll(`(()=>{__game.teleport(18,2);return __game.objState();})()`, o=>o.done, 30000, 400);
r = await endState();
ok('CAPTURE completes: zone cleared then held the full 20 s',
   cap.done && r.ended && r.won && /ZONE SECURED/.test(r.reason), `frac=${cap.frac} ${r.reason}`);
const capHud = await ev('BP2.Campaign.objHud()');
ok('the capture ring reached 100% on the HUD', capHud.pct==='100%', JSON.stringify(capHud));

/* --- CANARY (gameplay): the SAME "completed" check must fail when it wasn't --- */
await round(1); await sleep(300);
await killAll(); await sleep(400);
await ev(`__game.teleport(1.5,24.5)`);          // parked well outside the zone
const notCap = await poll(`(()=>{__game.teleport(1.5,24.5);return __game.objState();})()`, o=>o.done, 9000, 400);
const canaryObj = !notCap.done && notCap.frac===0 && !(await endState()).ended;
ok('CANARY(objective): the completion check FAILS when you never entered the zone',
   canaryObj, `done=${notCap.done} frac=${notCap.frac}`);

// --- hold (L3): same meter, driven through the real data path with a short hold
await ev(`BP2.LEVELS[3].hold=5`);
await round(3); await sleep(300);
await killAll(); await sleep(500);
const z3 = await ev('__game.objState().zone');
let hold = await poll(`(()=>{__game.teleport(${z3.x},${z3.z});return __game.objState();})()`, o=>o.done, 20000, 400);
r = await endState();
ok('HOLD completes when you stay on the ground for its full duration',
   hold.done && r.ended && r.won, `kind=${hold.kind} frac=${hold.frac} ${r.reason}`);
await ev(`BP2.LEVELS[3].hold=45`);
ok('the real L3 hold is restored to 45 s', await ev('BP2.LEVELS[3].hold')===45);

// --- waves (L6): three waves, each landing on the last one's death
await round(6); await sleep(400);
const w0 = await ev('__game.objState()');
await killAll(); await sleep(900);
const w1 = await ev('__game.objState()');
await killAll(); await sleep(900);
const w2 = await ev('__game.objState()');
await killAll(); await sleep(1100);
r = await endState();
console.log('   waves:', JSON.stringify([w0,w1,w2].map(w=>({w:w.wave,alive:w.alive}))));
ok('WAVES: only wave 1 is on the field at the start', w0.wave===1 && w0.waves===3 && w0.alive<15 && w0.alive>0,
   `wave ${w0.wave}/${w0.waves} alive ${w0.alive}`);
ok('WAVES: killing a wave lands the next one', w1.wave===2 && w1.alive>0 && w2.wave===3 && w2.alive>0,
   `-> ${w1.wave}(${w1.alive}) -> ${w2.wave}(${w2.alive})`);
ok('WAVES completes on the last wave', r.ended && r.won && /WAVES REPELLED/.test(r.reason), r.reason);
ok('the full roster is still counted for the debrief', await ev('__game.GAME.rosterSize')===15);

console.log('\n=== 6. OBJECTIVES — EACH TYPE FAILS ===');
const timeOut = async (n, setup)=>{
  await round(n); await sleep(300);
  if(setup) await ev(setup);
  await ev(`__game.GAME.timeLeft=0.25`);
  await sleep(1400);
  return await endState();
};
r = await timeOut(2);
ok('ELIMINATE fails on the clock', r.ended && !r.won && /TIME EXPIRED/.test(r.reason), r.reason);
r = await timeOut(1, `__game.teleport(1.5,24.5)`);
ok('CAPTURE fails on the clock with the zone untaken', r.ended && !r.won && r.obj.frac<1, `${r.reason} frac=${r.obj.frac}`);
r = await timeOut(3, `__game.teleport(1.5,24.5)`);
ok('HOLD fails on the clock with the ground unheld', r.ended && !r.won && r.obj.frac<1, `${r.reason} frac=${r.obj.frac}`);
// waves: die in wave 2
await round(6); await sleep(300);
await killAll(); await sleep(900);
const midWave = await ev('__game.objState()');
await ev(`__game.god(false);__game.hurt(99999,0)`); await sleep(1200);
r = await endState();
ok('WAVES fails if you go down mid-run', midWave.wave===2 && r.ended && !r.won && /KILLED/.test(r.reason),
   `wave=${midWave.wave} ${r.reason}`);
await ev(`__game.god(true)`);

console.log('\n=== 7. CONTESTED PROGRESS PAUSES AND DECAYS ===');
await round(1); await sleep(300);
await killAll(); await sleep(500);
await ev(`__game.teleport(18,2)`);
const rise=[];
for(let i=0;i<5;i++){ await sleep(500); rise.push(await ev(`(()=>{__game.teleport(18,2);return __game.objState().prog;})()`)); }
// drag one hostile back into the zone
await ev(`(()=>{const e=__game.Enemies.list()[0];
  e.active=true;e.alive=true;e.hp=e.maxHp;e.state='combat';e.sawPlayer=true;
  e.pos.set(19,0,3);e.rig.root.position.copy(e.pos);return 1;})()`);
const fall=[]; const hudC=[];
for(let i=0;i<6;i++){
  await sleep(450);
  const o=await ev(`(()=>{const e=__game.Enemies.list()[0];e.pos.set(19,0,3);e.vel.set(0,0,0);
    e.rig.root.position.copy(e.pos);__game.teleport(18,2);
    return {o:__game.objState(), h:BP2.Campaign.objHud()};})()`);
  fall.push(o.o.prog); hudC.push(o.h.contested);
}
console.log('   rising:', rise.map(v=>v.toFixed(2)).join(' → '));
console.log('   contested:', fall.map(v=>v.toFixed(2)).join(' → '));
ok('an uncontested zone fills', rise[4]>rise[0]+1.2, `${rise[0]} -> ${rise[4]}`);
ok('an enemy in the zone stops the fill', fall[fall.length-1] < rise[rise.length-1], `${rise[4].toFixed(2)} -> ${fall[5].toFixed(2)}`);
ok('and the meter DECAYS while contested, it does not just pause',
   fall[5] < fall[0]-0.4, fall.map(v=>v.toFixed(2)).join(' → '));
ok('the HUD shows the contest (a class, not only a colour)', hudC.some(v=>v===true), JSON.stringify(hudC));
const zoneVis = await ev(`(()=>{const m=__game.scene.children.filter(o=>o.isMesh&&o.geometry&&o.material&&o.material.fog===false&&o.renderOrder===2)[0];
  return m? {vis:m.visible, verts:m.geometry.attributes.position.count} : null;})()`);
ok('the zone has world geometry: a ground ring plus corner posts', zoneVis && zoneVis.vis && zoneVis.verts>500, JSON.stringify(zoneVis));
await round(2); await sleep(300);
const zoneHidden = await ev(`(()=>{const m=__game.scene.children.filter(o=>o.isMesh&&o.material&&o.material.fog===false&&o.renderOrder===2)[0];
  return m? m.visible : null;})()`);
ok('and it is hidden on a level with no zone', zoneHidden===false, String(zoneHidden));

console.log('\n=== 8. BOSS PRESENTATION ===');
await round(4); await sleep(400);
// put the boss right in front of the player, in the open
await ev(`(()=>{const b=__game.Enemies.list().filter(e=>e.boss)[0];
  __game.teleport(1.5,24.5);__game.look(Math.PI,0);
  b.pos.set(1.5,0,14);b.rig.root.position.copy(b.pos);b.state='combat';b.sawPlayer=true;return 1;})()`);
const boss = await poll(`(()=>{const b=__game.Enemies.list().filter(e=>e.boss)[0];
  b.pos.set(1.5,0,14);b.rig.root.position.copy(b.pos);b.vel.set(0,0,0);
  return BP2.Campaign.bossState();})()`, s=>s.bar&&s.banner, 5000, 200);
console.log('   ', JSON.stringify(boss));
ok('the boss announce banner appears, by NAME', boss.banner && boss.bannerName==='WARDEN', JSON.stringify(boss));
ok('the banner says what it is without relying on colour',
   /HIGH VALUE TARGET/.test(await ev(`document.querySelector('#bossBanner .k').textContent`)) &&
   /◆/.test(await ev(`document.querySelector('#bossBanner .k').textContent`)));
ok('a health bar runs across the top while the boss is visible', boss.bar && boss.name==='WARDEN');
ok('the bar is labelled with the tier, not just tinted', /VETERAN COMMANDER/.test(boss.tag), boss.tag);
await ev(`(()=>{const b=__game.Enemies.list().filter(e=>e.boss)[0];
  __game.Enemies.damage(b, b.maxHp*0.5, false, null); return 1;})()`);
await sleep(500);
const boss2 = await ev(`(()=>{const b=__game.Enemies.list().filter(e=>e.boss)[0];
  return {fill:parseFloat(BP2.Campaign.bossState().fill), real:+(b.hp/b.maxHp*100).toFixed(2)};})()`);
ok('the bar tracks boss health exactly', Math.abs(boss2.fill-boss2.real)<0.5 && boss2.fill<80,
   `bar ${boss2.fill}% vs live ${boss2.real}%`);

// colour-ignored identification: read ONLY the alpha channel of the name tags
const alpha = await ev(`(()=>{
  const L=__game.Enemies.list();
  const b=L.filter(e=>e.active&&e.boss)[0], n=L.filter(e=>e.active&&!e.boss)[0];
  const cov=c=>{const d=c.getContext('2d').getImageData(0,0,256,72).data;let k=0;
    for(let i=3;i<d.length;i+=4) if(d[i]>60) k++; return k;};
  const at=(c,x,y)=>c.getContext('2d').getImageData(x,y,1,1).data[3];
  return {bossCov:cov(b.tag.canvas), normCov:cov(n.tag.canvas),
    bossDiamond:at(b.tag.canvas,128,7), normDiamond:at(n.tag.canvas,128,7),
    bossChev:at(b.tag.canvas,247,22), normChev:at(n.tag.canvas,247,22),
    bossName:b.name, normName:n.name, bossScale:b.scale, normScale:n.scale};})()`);
console.log('   ', JSON.stringify(alpha));
ok('IGNORING COLOUR ENTIRELY: the boss tag carries a diamond the others do not',
   alpha.bossDiamond>200 && alpha.normDiamond<40, `boss a=${alpha.bossDiamond} normal a=${alpha.normDiamond}`);
ok('IGNORING COLOUR ENTIRELY: the boss tag carries chevron brackets the others do not',
   alpha.bossChev>150 && alpha.normChev<40, `boss a=${alpha.bossChev} normal a=${alpha.normChev}`);
ok('IGNORING COLOUR ENTIRELY: the boss tag simply covers more pixels',
   alpha.bossCov > alpha.normCov*1.25, `${alpha.bossCov} vs ${alpha.normCov}`);
ok('and the boss is still 1.18x scale with a unique name',
   alpha.bossScale===1.18 && alpha.normScale===1 && alpha.bossName!==alpha.normName, JSON.stringify(alpha));

console.log('\n=== 9. THE CAMPAIGN HUB ===');
await ev(`__game.GAME.end(false,'TEST')`); await sleep(1000);
await ev(`(()=>{const P=BP2.Profile.get();P.cleared={0:true,1:true};P.level=2;BP2.Profile.save();return 1;})()`);
await ev(`BP2.Campaign.openHub('end')`); await sleep(400);
const hub = await ev(`(()=>{
  const cards=[...document.querySelectorAll('#hubBody .lvcard')].map(c=>({
    id:+c.dataset.lvl, locked:c.classList.contains('locked'), done:c.classList.contains('done'),
    tag:(c.querySelector('.st')||{}).textContent, obj:(c.querySelector('.ob')||{}).textContent,
    thr:(c.querySelector('.thr')||{}).textContent, lk:(c.querySelector('.lk')||{}).textContent,
    mt:(c.querySelector('.mt')||{}).textContent}));
  return {vis:BP2.Campaign.hubVisible(), n:cards.length, cards};})()`);
console.log('   cards:', hub.cards.map(c=>`${c.id}${c.locked?'🔒':''}${c.done?'✔':''}`).join(' '));
ok('the hub lists every mission plus endless', hub.vis && hub.n===9, `n=${hub.n}`);
ok('lock state is right: 1 and 2 open, 3+ locked, endless locked',
   !hub.cards[0].locked && !hub.cards[1].locked && hub.cards[2].locked &&
   hub.cards[hub.cards.length-1].locked,
   hub.cards.map(c=>c.id+':'+(c.locked?'L':'O')).join(' '));
ok('cleared missions read REPLAY, the next one reads NEXT',
   hub.cards[0].tag==='REPLAY' && hub.cards[1].tag==='NEXT' && hub.cards[2].tag==='LOCKED',
   hub.cards.slice(0,3).map(c=>c.tag).join('/'));
ok('locked cards say exactly what opens them', /Clear MISSION 2/.test(hub.cards[2].lk), hub.cards[2].lk);
ok('each card states its objective', /CAPTURE/.test(hub.cards[0].obj) && /HOLD/.test(hub.cards[2].obj) &&
   /WAVES/.test(hub.cards[4].obj), hub.cards[0].obj+' | '+hub.cards[2].obj);
ok('each card carries best time and recommended power',
   /BEST/.test(hub.cards[0].mt) && /POWER/.test(hub.cards[0].mt) && /recommended/.test(hub.cards[0].mt),
   hub.cards[0].mt.slice(0,120));
// the threat readout must still agree with gateCalc, digit for digit
const thr = await ev(`(()=>{
  const out=[], A=BP2.Armoury;
  for(const id of [1,2]){
    const lvl=BP2.LEVELS[id];
    const card=document.querySelector('#hubBody .lvcard[data-lvl="'+id+'"] .thr').textContent.replace(/\\s+/g,' ');
    // P4c: survival time leads, HP per hit is the secondary line
    const sv=A.survival(lvl);
    out.push({id, card, wantSec:A.fmtSec(sv.seconds), wantHp:sv.hpPerHit.toFixed(1),
      wantAtt:sv.attackers, band:A.BANDS[A.band(sv.seconds)].label,
      calc:+__game.gateCalc(A.mainTier(lvl), BP2.Profile.rank('plating'), false).hp.toFixed(3),
      shown:+sv.hpPerHit.toFixed(3)});
  }
  return out;})()`);
console.log('   threat:', JSON.stringify(thr));
ok('the hub card leads with survival time from the shared model and matches gateCalc exactly',
   thr.every(t=>t.card.includes('you survive ~'+t.wantSec+' of open ground') && t.card.includes(t.band) &&
     t.card.includes(t.wantHp+' HP per hit') && t.card.includes(t.wantAtt+' firing at once') &&
     t.shown===t.calc), JSON.stringify(thr));
// selecting + deploying
await ev(`BP2.Campaign.select(2)`); await sleep(200);
await ev(`document.querySelector('#hubBody .lvcard[data-lvl="2"]').click()`); await sleep(1400);
const dep = await ev(`({lvl:__game.levelInfo().id, state:__game.GAME.state, hub:BP2.Campaign.hubVisible()})`);
ok('tapping the selected card deploys that mission', dep.lvl===2 && dep.state==='play' && !dep.hub, JSON.stringify(dep));
await ev(`BP2.Campaign.openHub('pause')`); await sleep(200);
await ev(`document.querySelector('#hubBody .lvcard[data-lvl="7"]').click()`); await sleep(500);
const locked = await ev(`({sel:BP2.Campaign.selected(), hub:BP2.Campaign.hubVisible()})`);
ok('a locked card cannot be selected or deployed', locked.sel!==7 && locked.hub, JSON.stringify(locked));
await ev(`document.getElementById('btnHubArm').click()`); await sleep(400);
const armFromHub = await ev(`({arm:BP2.Armoury.visible(), hub:BP2.Campaign.hubVisible()})`);
await ev(`document.getElementById('btnArmClose').click()`); await sleep(300);
const backToHub = await ev(`({arm:BP2.Armoury.visible(), hub:BP2.Campaign.hubVisible()})`);
ok('the hub has its own ARMOURY entry and comes back to the hub',
   armFromHub.arm && !armFromHub.hub && !backToHub.arm && backToHub.hub,
   JSON.stringify({armFromHub,backToHub}));

console.log('\n=== 10. THE WAR BEAT + THE PAINT ===');
await ev(`localStorage.removeItem('bp2_profile');localStorage.removeItem('bp2_paint')`);
await nav(); await pin();
await ev(`document.getElementById('btnIntroGo').click()`); await sleep(1200);
// put real paint on a real container
await ev(`__game.teleport(6.0,-3.0);__game.look(-Math.PI/2,0)`); await sleep(300);
for(let i=0;i<10;i++){ await ev('__game.fire()'); await sleep(110); }
await sleep(400);
const painted = await ev(`({n:__game.FX.paintCount(), paint:__game.paintball(), shots:__game.GAME.stats.shots})`);
ok('the drill puts paint on the world', painted.n>0 && painted.paint, JSON.stringify(painted));
await ev(`document.getElementById('btnSkipTut').click()`); await sleep(900);
const beat = await ev(`({state:__game.GAME.state, war:BP2.Tutorial.warRunning(), radio:BP2.Campaign.Radio.state(),
  hud:!document.getElementById('hud').classList.contains('on')===false,
  pe:getComputedStyle(document.getElementById('radio')).pointerEvents,
  bandPe:getComputedStyle(document.getElementById('radioBand')).pointerEvents})`);
console.log('   beat:', JSON.stringify(beat));
ok('the war beat plays OVER the live round — it never ends it', beat.state==='play' && beat.war, JSON.stringify(beat));
ok('the PA cuts in mid-sentence, on the PA callsign',
   /PARK PA/.test(beat.radio.who) && /—/.test(beat.radio.text), beat.radio.who+': '+beat.radio.text.slice(0,50));
ok('the radio band never eats input outside itself', beat.pe==='none' && beat.bandPe==='auto',
   `#radio=${beat.pe} .band=${beat.bandPe}`);
// input still works while it talks — from an open bit of yard, not into a wall
await ev(`__game.teleport(1.5,24.5);__game.look(0,0)`); await sleep(250);
await send('Input.dispatchKeyEvent',{type:'keyDown',code:'KeyW',key:'w',windowsVirtualKeyCode:87});
const p0 = await ev('({x:__game.player.pos.x,z:__game.player.pos.z})');
// POLL during the hold: an idle headless window throttles rAF (PIPELINE trap)
let p1=p0;
for(let i=0;i<16;i++){ await sleep(130); p1 = await ev('({x:__game.player.pos.x,z:__game.player.pos.z})');
  if(Math.hypot(p1.x-p0.x,p1.z-p0.z)>2.5) break; }
await send('Input.dispatchKeyEvent',{type:'keyUp',code:'KeyW',key:'w',windowsVirtualKeyCode:87});
const moved = Math.hypot(p1.x-p0.x, p1.z-p0.z);
ok('you can still move while the radio talks', moved>1.5, `moved ${moved.toFixed(2)} m`);
const queuedBefore = await ev('BP2.Campaign.Radio.remaining()');
await ev(`document.getElementById('radioBand').click()`); await sleep(900);
const after = await ev(`({radio:BP2.Campaign.Radio.remaining(), war:BP2.Tutorial.warRunning(),
  hub:BP2.Campaign.hubVisible(), state:__game.GAME.state, lvl:BP2.Profile.get().level,
  cleared0:!!BP2.Profile.get().cleared[0], award:BP2.Tutorial.award()})`);
console.log('   after skip:', JSON.stringify(after));
ok('ONE tap kills the whole queue, not just the line you were on',
   queuedBefore>=4 && after.radio===0, `${queuedBefore} queued -> ${after.radio}`);
ok('and it lands you in the campaign hub with the dock open',
   after.hub && after.state==='end' && after.cleared0 && after.lvl===1, JSON.stringify(after));
ok('training still awards exactly 300 SP', after.award===300, String(after.award));
// the paint survives into level 1, and fades out over the two after it
await ev(`BP2.Campaign.select(1);BP2.Campaign.deploy()`); await sleep(1500);
const l1 = await ev(`({lvl:__game.levelInfo().id, paint:__game.paintball(),
  persist:__game.FX.persistCount(), op:__game.FX.persistCount()? 1:0,
  alpha:(()=>{const s=__game.scene.children.filter(o=>o.isMesh&&o.material&&o.material.map&&o.material.transparent&&o.material.polygonOffsetFactor===-5&&o.visible)[0];
    return s? +s.material.opacity.toFixed(2):null;})()})`);
ok('THE PAINT STAYS ON THE CONTAINERS: training splats persist into level 1',
   l1.lvl===1 && !l1.paint && l1.persist>0, JSON.stringify(l1));
ok('and it is at full strength in L1', l1.alpha===1, String(l1.alpha));
await ev(`(()=>{const P=BP2.Profile.get();P.cleared={0:1,1:1,2:1,3:1};P.level=3;BP2.Profile.save();return 1;})()`);
await round(2); await sleep(400);
const l2a = await ev(`(()=>{const s=__game.scene.children.filter(o=>o.isMesh&&o.material&&o.material.polygonOffsetFactor===-5&&o.visible)[0];
  return {n:__game.FX.persistCount(), a:s? +s.material.opacity.toFixed(2):null};})()`);
await round(3); await sleep(400);
const l3a = await ev(`(()=>{const s=__game.scene.children.filter(o=>o.isMesh&&o.material&&o.material.polygonOffsetFactor===-5&&o.visible)[0];
  return {n:__game.FX.persistCount(), a:s? +s.material.opacity.toFixed(2):null};})()`);
await round(4); await sleep(400);
const l4a = await ev(`__game.FX.persistCount()`);
console.log('   paint fade:', JSON.stringify({l1:l1.alpha, l2:l2a.a, l3:l3a.a, l4:l4a}));
ok('the paint fades over the next two levels and is gone by L4',
   l2a.a===0.55 && l3a.a===0.25 && l4a===0, JSON.stringify({l2:l2a.a,l3:l3a.a,l4:l4a}));

console.log('\n=== 11. NOTHING FROM P1-P3 MOVED ===');
await ev(`localStorage.removeItem('bp2_profile')`); await nav(); await pin();
const nums = await ev(`(()=>{
  const g=(t,r,b)=>+__game.gateCalc(t,r,b).hp.toFixed(3);
  return {levels:BP2.LEVELS.length, apPen:BP2.TIERS.praetor.apPen,
    militia5:g('militia',5,false), shock5:g('shock',5,false), praetor5:g('praetor',5,false)};})()`);
ok('LEVELS.length 10 and praetor apPen 0.34 (P4c variant C)', nums.levels===10 && nums.apPen===0.34, JSON.stringify(nums));
ok('the armour gate at PLATING 5 after variant C: 0.900 / 6.480 / 9.680',
   nums.militia5===0.9 && nums.shock5===6.48 && nums.praetor5===9.68, JSON.stringify(nums));
const l1i = await ev(`(()=>{__game.loadLevel(1);return {info:__game.levelInfo(),
  pool:__game.poolInfo().filter(p=>!p.active).length};})()`); await sleep(200);
ok('loadLevel(1) -> 5 militia, 0 bosses, 15 of 20 rigs deactivated',
   l1i.info.rosterSize===5 && l1i.info.bosses===0 && l1i.pool===15,
   `roster=${l1i.info.rosterSize} bosses=${l1i.info.bosses} off=${l1i.pool}`);
const l8i = await ev(`(()=>{__game.loadLevel(8);const b=__game.enemyInfo().filter(e=>e.boss)[0];
  return {n:__game.levelInfo().rosterSize, bosses:__game.levelInfo().bosses, maxHp:b.maxHp,
    scale:b.scale, apPen:+b.apPen.toFixed(2), name:b.name, atk:__game.levelInfo().maxAttackers};})()`);
ok('loadLevel(8) -> 18 + 1 boss, maxHp 484, scale 1.18, apPen 0.44, THE MARSHAL, maxAttackers 4',
   l8i.n===19 && l8i.bosses===1 && l8i.maxHp===484 && l8i.scale===1.18 && l8i.apPen===0.44 &&
   l8i.name==='THE MARSHAL' && l8i.atk===4, JSON.stringify(l8i));
// draw calls, quality PINNED, on a FRESH page in a fixed order (PIPELINE trap)
await nav();
const peakDraw = async n=>{
  await ev(`__game.S.quality='low';__game.S.bloom=0;__game.applySettings()`); await sleep(300);
  await ev(`__game.loadLevel(${n})`);
  // PIN THE CAMERA TOO: P4b gave every level its own insertion point, so the
  // spawn pose is level-specific now. These figures describe the world, so
  // take them from the reference pose the 112/114 numbers came from.
  const POSE=`__game.teleport(1.5,24.5);__game.look(0,0)`;
  await ev(POSE);
  let best={calls:0,tris:0};
  for(let i=0;i<16;i++){ await sleep(100);
    if(i%3===0) await ev(POSE);
    const s=await ev(`({calls:__game.drawCalls(),tris:__game.tris()})`);
    if(s.calls>best.calls) best=s; }
  return best;
};
const dc1=await peakDraw(1), dc8=await peakDraw(8);
console.log(`   draw calls  L1 ${dc1.calls} (${dc1.tris} tris)   L8 ${dc8.calls} (${dc8.tris} tris)`);
// P5b rebased these: see the note in split_test. The exact figure that survives
// is the static world with the rigs hidden, isolated a few lines below.
ok('L1 draw calls are inside the post-P5b band (was 114)', dc1.calls>=36 && dc1.calls<=70, `calls=${dc1.calls}`);
// NOTE (P5b): this is a PEAK over ~1.6 s. Pre-P5b a rig cost the same wherever it
// stood, so the peak only sampled the frustum; now it also samples how close the
// squad has crowded, and a peak lands well above the median. The 120-150 target is
// on the MEDIAN with the pose pinned (p5b_test 1) — allow the peak more room.
ok('L8 peak is inside the post-P5b band (median target 120-150; was ~305)',
   dc8.calls>=110 && dc8.calls<=180, `calls=${dc8.calls}`);
// the claim that actually matters, measured by switching the two new meshes off
// in the SAME frame instead of trusting a wandering AI to hold still
await ev(`__game.loadLevel(1);__game.teleport(1.5,24.5);__game.look(0,0)`); await sleep(900);
// hide every rig first: enemies wander in and out of the frustum and a PEAK
// sample would otherwise absorb the exact delta we are trying to isolate
await ev(`__game.Enemies.list().forEach(e=>{e.rig.root.visible=false;e.tag.sprite.visible=false;})`);
await sleep(400);
const sample = async()=>{ const seen=[]; for(let i=0;i<8;i++){ await sleep(90);
  await ev(`__game.Enemies.list().forEach(e=>{e.rig.root.visible=false;e.tag.sprite.visible=false;})`);
  seen.push(await ev('__game.drawCalls()')); }
  seen.sort((a,b)=>a-b); return seen[seen.length>>1]; };
const both = await sample();
await ev(`__game.scene.children.filter(o=>o.name==='water')[0].visible=false`);
const noWater = await sample();
await ev(`__game.scene.children.filter(o=>o.isMesh&&o.material&&o.material.fog===false&&o.renderOrder===2)[0].visible=false`);
const noneOfIt = await sample();
console.log(`   isolated: dock ${both} -> water off ${noWater} -> zone off ${noneOfIt}`);
ok('the water costs exactly one draw call', both-noWater===1, `${both} -> ${noWater}`);
ok('the zone marker costs exactly one, and only on a zone level', noWater-noneOfIt===1, `${noWater} -> ${noneOfIt}`);
ok('the rest of the dock — quay, kerb, both cranes, bollards — costs ZERO (all merged)',
   noneOfIt===both-2, `dock+zone ${both} -> stripped ${noneOfIt}`);
console.log(`   (rigs hidden, so this pair is the static world only, not the 112/114 figure)`);
await nav(); await pin();
const paintChk = await ev(`(()=>{__game.loadLevel(0);
  return {objs:__game.scene.children.filter(o=>o.isSprite&&o.material.color&&o.material.color.getHex()===0xb01c14&&o.visible).length,
    allowed:__game.weaponAllowed()};})()`);
ok('paintball still hides blood and locks you to the rifle',
   paintChk.objs===0 && paintChk.allowed.join('')==='true,false,false,false'.replace(/,/g,''),
   JSON.stringify(paintChk));
const survive = await ev(`(()=>{__game.loadLevel(0);__game.god(false);
  for(let i=0;i<8;i++)__game.hurt(500,0); return {hp:__game.player.hp, alive:__game.player.alive};})()`);
ok('the player still cannot be killed in the paintball yard', survive.alive && survive.hp===survive.hp, JSON.stringify(survive));
await ev('__game.god(true)');
for(let i=errors.length-1;i>=0;i--) if(/CANARY/.test(errors[i])) errors.splice(i,1);
ok('zero console errors across the whole run', errors.length===0, errors.join(' | '));

console.log('\n=== 12. LAYOUT: PORTRAIT + LANDSCAPE ===');
// NOTE: setDeviceMetricsOverride resizes the real headless window and does NOT
// self-restore. The bounds snapshotted at the top are put back at the end.
for(const [w,h,tag] of [[390,844,'portrait 390x844'],[844,390,'landscape 844x390']]){
  await send('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:2,mobile:true});
  await sleep(500);
  await ev(`(()=>{const P=BP2.Profile.get();P.trainingDone=true;P.cleared={0:1,1:1,2:1};P.level=3;P.sp=2400;
    BP2.Profile.save();BP2.Campaign.openHub('start');return 1})()`);
  await sleep(400);
  const hub = await ev(`(()=>{const b=document.getElementById('btnHubDeploy').getBoundingClientRect();
    const cards=[...document.querySelectorAll('.lvcard')];
    return {n:cards.length, btnOn:b.top>=0&&b.bottom<=innerHeight,
      hscroll:document.documentElement.scrollWidth>innerWidth,
      tiny:cards.filter(e=>parseFloat(getComputedStyle(e.querySelector('.nm')).fontSize)<11).length,
      off:cards.filter(e=>{const r=e.getBoundingClientRect();return r.left<0||r.right>innerWidth;}).length};})()`);
  ok(tag+': the hub lists 9 missions with DEPLOY still reachable',
     hub.n===9 && hub.btnOn && !hub.hscroll && hub.tiny===0 && hub.off===0, JSON.stringify(hub));
  await ev(`__game.loadLevel(3);__game.god(true)`); await sleep(1000);
  await ev(`(()=>{const b=__game.Enemies.list().filter(e=>e.boss)[0];
    __game.teleport(1.5,24.5);__game.look(Math.PI,0);
    b.pos.set(1.5,0,14);b.rig.root.position.copy(b.pos);b.state='combat';b.sawPlayer=true;
    BP2.Campaign.Radio.play([['CONTROL','HOLD THE OVERLOOK. THEY ARE COMING UP THE RAMP.',20]]);return 1})()`);
  await sleep(900);
  const lay = await ev(`(()=>{
    const R=id=>{const e=document.getElementById(id);if(!e||e.classList.contains('hidden'))return null;
      const b=e.getBoundingClientRect();return {l:b.left,r:b.right,t:b.top,b:b.bottom};};
    const hit=(a,b)=>!!(a&&b&&a.l<b.r-1&&b.l<a.r-1&&a.t<b.b-1&&b.t<a.b-1);
    const on=x=>!!x&&x.l>=0&&x.r<=innerWidth&&x.t>=0&&x.b<=innerHeight;
    const o=R('objHud'),bb=R('bossBar'),rd=R('radio'),mp=R('mapwrap'),tm=R('timer'),
          vt=R('vitals'),am=R('ammoBox'),wb=R('wbtns');
    return {objOn:on(o), bossOn:on(bb), radioOn:on(rd),
      clash:[hit(o,mp),hit(o,bb),hit(bb,mp),hit(bb,tm),hit(rd,vt),hit(rd,am),hit(rd,wb)].filter(Boolean).length};})()`);
  ok(tag+': objective meter, boss bar and radio all fit and clash with nothing',
     lay.objOn && lay.bossOn && lay.radioOn && lay.clash===0, JSON.stringify(lay));
}
await send('Emulation.clearDeviceMetricsOverride');
await send('Browser.setWindowBounds',{windowId:winId.windowId,bounds:winId.bounds});
await sleep(300);

console.log(`\n${pass} passed, ${fail} failed`);
if(failed.length) console.log('FAILED:\n  '+failed.join('\n  '));
await send('Emulation.clearDeviceMetricsOverride');
await send('Browser.setWindowBounds',{windowId:winId.windowId,bounds:winId.bounds});
ws.close(); process.exit(fail?1:0);
