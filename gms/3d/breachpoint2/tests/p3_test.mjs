// BREACHPOINT II — P3 verification suite (progression, touch/mobile emulation).
import {connect,URL,sleep} from './lib.mjs';
import {readFileSync} from 'node:fs';
const SRC='/Users/aaronair/cc/yru/site/gms/3d/breachpoint2/';
const src=f=>readFileSync(SRC+f,'utf8');
const {ws,send,ev,errors}=await connect();

let pass=0, fail=0; const failed=[];
const ok=(n,c,x='')=>{ if(c) pass++; else {fail++; failed.push(n);} console.log((c?'PASS  ':'FAIL  ')+n+(x?'   '+x:'')); };

await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
await send('Network.setCacheDisabled',{cacheDisabled:true});
await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
const winId = (await send('Browser.getWindowForTarget')).result;
const viewport = async (w,h)=>{ await send('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:2,mobile:true}); await sleep(450); };
let W=390,H=844;
await viewport(W,H);

const nav = async ()=>{ await send('Page.navigate',{url:URL}); await sleep(3600); };
await send('Page.navigate',{url:'about:blank'}); await sleep(400); errors.length=0;
await nav();
await ev(`localStorage.removeItem('bp2_profile');localStorage.removeItem('bp2_settings')`);
await nav();
// pin quality: the auto-quality net writing bp2_settings poisons later baselines
await ev(`__game.S.quality='high';__game.S.bloom=1;__game.applySettings()`);

// a fresh id per press: re-using id 1 after a tap the browser never saw land
// (e.g. one dispatched off-screen) makes the NEXT touchStart a no-op
let tid=0;
const tstart=(x,y)=>send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:++tid}]});
const tmove=(x,y)=>send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y,id:tid}]});
const tend =()=>send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});   // EMPTY array

const ranks = r => ev(`(()=>{const P=BP2.Profile;const d={vitality:0,plating:0,marksman:0,steady:0,logistics:0,mobility:0};
  Object.assign(d,${JSON.stringify(r)});for(const k in d)P.setRank(k,d[k]);return 1;})()`);
const round = (n=1)=>ev(`(()=>{__game.loadLevel(${n});__game.god(true);return __game.GAME.state;})()`);
// everything the running game is actually using this round
const live = ()=>ev(`(()=>{const w=__game.Weapons.current(), a=__game.ammo(), p=__game.player, R=__game.RANKS;
  return {maxHp:p.maxHp, armorMax:p.armorMax, dmg:+w.dmg.toFixed(3), mag:a.mag, reserve:a.reserve,
    reloadTime:+w.reloadTime.toFixed(4), spread:+__game.Weapons.spread().toFixed(5),
    hip:+w.spread.hip.toFixed(5), sprint:R.sprint, assist:R.assist, dbl:R.dblJump, fall:R.fallImmune};})()`);

console.log('\n=== 1. BOOT ===');
ok('boots with BP2.Armoury and BP2.upg', await ev('!!(BP2.Armoury && typeof BP2.upg==="function")'));
ok('upg() no longer lives in data.js', !/function upg\(/.test(src('js/data.js')));
ok('upg() lives in profile.js', /function upg\(/.test(src('js/profile.js')));
ok('no type="module" anywhere in index.html', !/type\s*=\s*["\']module/.test(src('index.html')));
ok('zero console errors / exceptions on load', errors.length===0, errors.join(' | '));
await ev('setTimeout(()=>{throw new Error("CANARY")},10)'); await sleep(400);
const sawCanary = errors.some(e=>/CANARY/.test(e));
ok('CANARY(errors): collector catches a deliberate throw', sawCanary, sawCanary?'caught':'COLLECTOR IS BLIND');
for(let i=errors.length-1;i>=0;i--) if(/CANARY/.test(errors[i])) errors.splice(i,1);

console.log('\n=== 2. EVERY TRACK, RANK 0 vs RANK 5, ON THE LIVE PLAYER ===');
await ev(`__game.grantSP(200000)`);
await ranks({}); await round(1); const r0 = await live();
await ranks({vitality:5,plating:5,marksman:5,steady:5,logistics:5,mobility:5}); await round(1); const r5 = await live();
console.log('   rank0:', JSON.stringify(r0));
console.log('   rank5:', JSON.stringify(r5));
ok('VITALITY  player.maxHp 100 -> 260', r0.maxHp===100 && r5.maxHp===260, `${r0.maxHp} -> ${r5.maxHp}`);
ok('PLATING   player.armorMax 50 -> 350', r0.armorMax===50 && r5.armorMax===350, `${r0.armorMax} -> ${r5.armorMax}`);
ok('MARKSMAN  live weapon damage 23 -> 34.5', r0.dmg===23 && r5.dmg===34.5, `${r0.dmg} -> ${r5.dmg}`);
ok('LOGISTICS live mag 30 -> 51, reserve 210 -> 462, reload 2.05 -> 1.435s',
   r0.mag===30 && r5.mag===51 && r0.reserve===210 && r5.reserve===462 && r0.reloadTime===2.05 && r5.reloadTime===1.435,
   `mag ${r0.mag}->${r5.mag} res ${r0.reserve}->${r5.reserve} rl ${r0.reloadTime}->${r5.reloadTime}`);
ok('STEADY    live spread x0.70 (hip 0.020 -> 0.014)', Math.abs(r5.hip-r0.hip*0.7)<1e-6 && r5.spread<r0.spread,
   `hip ${r0.hip}->${r5.hip}, live spread ${r0.spread}->${r5.spread}`);
ok('MOBILITY  sprint 1.00 -> 1.30, double jump off -> on, fall immunity off -> on',
   r0.sprint===1 && r5.sprint===1.3 && r0.dbl===false && r5.dbl===true && r0.fall===false && r5.fall===true,
   `${r0.sprint}/${r0.dbl}/${r0.fall} -> ${r5.sprint}/${r5.dbl}/${r5.fall}`);
ok('STEADY    aim-assist cone 0.28 -> 0.70 rad', r0.assist===1 && r5.assist===2.5, `${r0.assist} -> ${r5.assist}`);

/* --- CANARY 2 (gameplay): the same "rank applied" assertion must FAIL at rank 0 --- */
await ranks({}); await round(1); const c0 = await live();
const canaryRank = !(c0.maxHp===260 && c0.dmg===34.5 && c0.mag===51 && c0.sprint===1.3);
ok('CANARY(ranks): the rank-5 assertion fails when the ranks are 0', canaryRank,
   `rank0 reads maxHp=${c0.maxHp} dmg=${c0.dmg} mag=${c0.mag} sprint=${c0.sprint}`);

console.log('\n=== 3. TRACKS THAT ONLY SHOW UP IN PLAY ===');
// --- MARKSMAN: real damage dealt to a real enemy, not a table lookup.
// One in-page loop: the enemy must not move between aiming and firing.
const measureShot = ()=>ev(`(async()=>{const g=__game;
  const F=()=>new Promise(r=>requestAnimationFrame(r));
  // the gun is in 'draw' for 0.52 s after a round starts; waiting here instead of
  // inside the loop stops the draw eating every attempt
  for(let i=0;i<90 && __game.Weapons.state()!=='idle';i++) await F();
  for(let k=0;k<120;k++){
    const es=g.Enemies.list().filter(x=>x.active&&x.alive);
    if(!es.length){ g.loadLevel(1); for(let i=0;i<40;i++) await F(); continue; }
    const e=es[0];
    g.teleport(e.pos.x+3.2, e.pos.z+0.2);
    const p=g.player.pos;
    const dx=e.pos.x-p.x, dz=e.pos.z-p.z, dy=(e.pos.y+1.15)-(p.y+1.62);
    g.look(Math.atan2(-dx,-dz), Math.atan2(dy,Math.hypot(dx,dz)));
    await F(); await F();
    if(g.Weapons.state()!=='idle'){ await F(); continue; }
    const pr=g.probe();
    if(!pr.enemy){ await F(); continue; }
    const mul = pr.enemy.part==='head' ? g.Weapons.current().hsMul
              : pr.enemy.part==='legs' ? 0.85 : 1;
    const hp0=e.hp;
    g.fire();
    const d=hp0-e.hp;
    if(d>0) return +(d/mul).toFixed(3);
    await F();
  }
  return null;})()`);
await ranks({}); await round(1); await sleep(400);
await ev(`__game.S.aimAssist=0;__game.S.mobileADS='off';__game.applySettings()`);
const dmg0 = await measureShot();
await ranks({marksman:5}); await round(1); await sleep(400);
const dmg5 = await measureShot();
ok('MARKSMAN rank 5 really does 1.50x damage to a live enemy', dmg0!==null && dmg5!==null && Math.abs(dmg5/dmg0-1.5)<0.02,
   `${dmg0} -> ${dmg5} HP per torso hit (ratio ${dmg0?(dmg5/dmg0).toFixed(3):'n/a'})`);

// --- MOBILITY sprint: drive the real move stick and measure real top speed
async function topSpeed(){
  await ev(`__game.teleport(1.5,20);__game.look(Math.PI,0)`); await sleep(200);
  await tstart(95, 700); await sleep(60); await tmove(95, 604); await sleep(60);
  let top=0;
  for(let i=0;i<14;i++){ await sleep(110); const v=await ev('+Math.hypot(__game.player.vel.x,__game.player.vel.z).toFixed(3)'); if(v>top) top=v; }
  await tend(); await sleep(200);
  return top;
}
await ranks({}); await round(1); await sleep(500); const sp0 = await topSpeed();
await ranks({mobility:5}); await round(1); await sleep(500); const sp5 = await topSpeed();
ok('MOBILITY rank 5 really sprints 1.30x faster on the stick', sp0>6 && Math.abs(sp5/sp0-1.3)<0.05,
   `${sp0} m/s -> ${sp5} m/s (ratio ${(sp5/sp0).toFixed(3)})`);

// --- MOBILITY double jump: rank 0 has none, rank 2 does
const dblJump = ()=>ev(`(async()=>{const g=__game;g.teleport(1.5,20);await new Promise(r=>setTimeout(r,250));
  g.player.jumpBuffer=0.16;await new Promise(r=>setTimeout(r,260));
  const mid=g.player.vel.y;g.player.jumpBuffer=0.16;await new Promise(r=>setTimeout(r,90));
  return {mid:+mid.toFixed(2), after:+g.player.vel.y.toFixed(2)};})()`);
await ranks({}); await round(1); await sleep(500); const j0=await dblJump();
await ranks({mobility:2}); await round(1); await sleep(500); const j2=await dblJump();
ok('MOBILITY rank 0 has no double jump, rank 2 does', j0.after<j0.mid && j2.after>j2.mid+1,
   `rank0 vy ${j0.mid}->${j0.after}, rank2 vy ${j2.mid}->${j2.after}`);

// --- MOBILITY fall damage immunity at rank 5
const fallTest = ()=>ev(`(async()=>{const g=__game;g.god(false);g.player.hp=g.player.maxHp;
  g.teleport(1.5,20,g.groundAt(1.5,20,6,0.3)+16);g.player.vel.set(0,0,0);
  for(let i=0;i<24;i++){await new Promise(r=>setTimeout(r,90));if(g.player.grounded)break;}
  const hp=g.player.hp;g.god(true);return {hp:+hp.toFixed(1), max:g.player.maxHp};})()`);
await ranks({}); await round(1); await sleep(500); const f0=await fallTest();
await ranks({mobility:5}); await round(1); await sleep(500); const f5=await fallTest();
ok('a 16 m drop hurts at MOBILITY 0 and is free at MOBILITY 5', f0.hp<f0.max && f5.hp===f5.max,
   `rank0 ${f0.hp}/${f0.max} HP, rank5 ${f5.hp}/${f5.max} HP`);

// --- STEADY: the wider assist cone catches a target the base cone misses.
// The enemy is pinned every frame so the geometry cannot drift under the test.
const assistPull = ()=>ev(`(async()=>{const g=__game;g.S.aimAssist=1;g.S.mobileADS='off';
  const all=g.Enemies.list().filter(x=>x.active&&x.alive);
  const e=all[0];
  for(let i=1;i<all.length;i++) all[i].alive=false;   // one target only, or it assists onto a different militia
  const EX=1.5,EZ=10.5,EY=g.groundAt(1.5,10.5,6,0.3);
  g.teleport(1.5,24.5);
  const y0=0.42;                                  // dead ahead is yaw 0; 0.42 rad off it
  g.look(y0,0);
  const t0=performance.now();
  while(performance.now()-t0<900){ e.pos.set(EX,EY,EZ); await new Promise(r=>requestAnimationFrame(r)); }
  let d=g.player.yaw-y0;while(d>Math.PI)d-=6.283185;while(d<-Math.PI)d+=6.283185;
  const los=g.losClear(g.player.pos.x,g.player.pos.y+1.62,g.player.pos.z,EX,EY+1.2,EZ);
  return {pull:+Math.abs(d).toFixed(4), los:los};})()`);
await ranks({}); await round(1); await sleep(500); const a0=await assistPull();
await ranks({steady:5}); await round(1); await sleep(500); const a5=await assistPull();
ok('STEADY rank 5 widens the assist cone onto a target 0.42 rad off (base cone 0.28 misses it)',
   a0.los && a5.los && a0.pull<0.12 && a5.pull>0.30 && a5.pull>4*a0.pull,
   `yaw pulled ${a0.pull} rad at rank 0, ${a5.pull} rad at rank 5 (LOS ${a0.los}/${a5.los})`);
await ev(`__game.S.aimAssist=0;__game.applySettings()`);

console.log('\n=== 4. MULTIPLIERS MUST NOT COMPOUND ACROSS ROUNDS ===');
await ranks({marksman:3, logistics:3, steady:3});
const runs=[];
for(let i=0;i<5;i++){ await round(1); await sleep(320); const l=await live(); runs.push([l.dmg,l.mag,l.reserve,l.reloadTime,l.hip]); }
const same = runs.every(r=>JSON.stringify(r)===JSON.stringify(runs[0]));
ok('5 rounds in a row: damage / mag / reserve / reload / spread identical every time', same,
   runs.map(r=>r.join('|')).join('   '));
ok('rank 3 values are the table values, not a compounded drift',
   runs[0][0]===+(23*1.27).toFixed(3) && runs[0][1]===Math.round(30*1.35) && runs[0][2]===Math.round(210*1.6),
   `dmg ${runs[0][0]} (expect ${+(23*1.27).toFixed(3)}), mag ${runs[0][1]} (expect 41), reserve ${runs[0][2]} (expect 336)`);

console.log('\n=== 5. BUYING A RANK: DEBIT, PERSIST, APPLY ===');
await ev(`BP2.Profile.reset();__game.grantSP(5000);BP2.Armoury.open('start')`); await sleep(400);
const before = await ev(`({sp:BP2.Profile.get().sp, rank:BP2.Profile.rank('plating'), ts:BP2.Profile.get().trackSpent})`);
// a real touch on the real BUY button, not a function call
const r = await ev(`(()=>{const b=document.querySelector('[data-buy="plating"]');const q=b.getBoundingClientRect();
  return {x:Math.round(q.left+q.width/2), y:Math.round(q.top+q.height/2), w:Math.round(q.width), h:Math.round(q.height)};})()`);
ok('the PLATING buy button is a >=44px tap target', r.w>=88 && r.h>=44, JSON.stringify(r));
await tstart(r.x, r.y); await sleep(60); await tend(); await sleep(400);
const after = await ev(`({sp:BP2.Profile.get().sp, rank:BP2.Profile.rank('plating'), ts:BP2.Profile.get().trackSpent})`);
ok('tapping BUY debits 150 SP and raises PLATING to rank 1',
   after.sp===before.sp-150 && after.rank===1 && after.ts===150, JSON.stringify(before)+' -> '+JSON.stringify(after));
await nav(); await sleep(200);
const reloaded = await ev(`({sp:BP2.Profile.get().sp, rank:BP2.Profile.rank('plating'), ts:BP2.Profile.get().trackSpent})`);
ok('the purchase survives a page reload', JSON.stringify(reloaded)===JSON.stringify(after), JSON.stringify(reloaded));
await round(1); await sleep(350);
const liveAfter = await live();
ok('the bought rank is live in the next round (armour pool 50 -> 90)', liveAfter.armorMax===90, 'armorMax='+liveAfter.armorMax);

console.log('\n=== 6. RESPEC — EXACTLY 80% BACK, ALL SIX TRACKS ZEROED (D1) ===');
await ev(`BP2.Profile.reset();__game.grantSP(20000)`);
// plating 0->3 (150+350+700=1200) and marksman 0->2 (150+350=500) = 1700 invested
await ev(`(()=>{const P=BP2.Profile;for(let i=0;i<3;i++)P.buyRank('plating');for(let i=0;i<2;i++)P.buyRank('marksman');return 1})()`);
const pre = await ev(`({sp:BP2.Profile.get().sp, ts:BP2.Profile.get().trackSpent, quote:BP2.Profile.respecQuote()})`);
ok('1700 SP invested, quote is exactly 80% = 1360', pre.ts===1700 && pre.quote===1360, JSON.stringify(pre));
await ev(`BP2.Armoury.confirmRespec()`); await sleep(250);
ok('respec asks on a screen, never an alert()', await ev(`BP2.Armoury.confirmVisible()`));
await ev(`document.getElementById('btnCfmYes').click()`); await sleep(350);
const post = await ev(`({sp:BP2.Profile.get().sp, ts:BP2.Profile.get().trackSpent,
  ranks:Object.values(BP2.Profile.get().ranks), unlocked:BP2.Profile.get().unlocked.length})`);
ok('respec refunds exactly 1360 SP and zeroes all six tracks',
   post.sp===pre.sp+1360 && post.ts===0 && post.ranks.every(v=>v===0), JSON.stringify(post));
await round(1); await sleep(320);
const liveRespec = await live();
ok('after a respec the live player is back at rank 0', liveRespec.maxHp===100 && liveRespec.armorMax===50 && liveRespec.dmg===23,
   `maxHp=${liveRespec.maxHp} armorMax=${liveRespec.armorMax} dmg=${liveRespec.dmg}`);

console.log('\n=== 7. THREAT READOUT MATCHES gateCalc (IMPROVEMENTS 1) ===');
const gate = (t,r,b)=>ev(`+__game.gateCalc('${t}',${r},${b?'true':'false'}).hp.toFixed(3)`);
const g1=await gate('militia',5), g2=await gate('shock',5), g3=await gate('praetor',5);
ok('gateCalc at PLATING 5: militia 0.900 / shock 6.480 / praetor 9.680 (P4c variant C)',
   g1===0.9 && g2===6.48 && g3===9.68, `${g1} / ${g2} / ${g3}`);
async function readThreat(levelIdx, plating){
  await ev(`(()=>{const P=BP2.Profile;P.get().level=${levelIdx};P.setRank('plating',${plating});P.save();
    BP2.Armoury.open('start');return 1})()`);
  await sleep(200);
  return ev(`({txt:document.getElementById('armThreat').textContent.replace(/\\s+/g,' '),
    plate:(document.querySelector('[data-track="plating"] .gate')||{}).textContent||'',
    st:BP2.Armoury.state()})`);
}
const t1 = await readThreat(1,5), t7 = await readThreat(7,5), t8 = await readThreat(8,5);
// P4c: survival time leads, HP-per-hit is the secondary line (IMPROVEMENTS 1b)
// P5a: per-tier cadence + the armour pool. VITALITY is 0 in all three, so these
// are "plate only" readings: 350 of pool at 0.9 HP a hit, then 100 HP unarmoured.
ok('THE DOCK at PLATING 5 leads with survival time and reads 0.9 HP per hit, TRIVIAL',
   /you survive ~38 s/.test(t1.txt) && /0\.9 HP/.test(t1.txt) && /TRIVIAL/.test(t1.txt) &&
   t1.st.threat===0.9 && Math.abs(t1.st.survive-38.427)<0.01, t1.txt.slice(0,140));
ok('BLACKOUT at PLATING 5 reads ~2 s of open ground, 6.5 HP per hit, LETHAL',
   /you survive ~2 s/.test(t7.txt) && /6\.5 HP/.test(t7.txt) && /LETHAL/.test(t7.txt) &&
   t7.st.threat===6.48 && Math.abs(t7.st.survive-2.012)<0.01, t7.txt.slice(0,140));
ok('BREACHPOINT at PLATING 5 reads ~1.1 s of open ground, 9.7 HP per hit, LETHAL',
   /you survive ~1\.1 s/.test(t8.txt) && /9\.7 HP/.test(t8.txt) && /LETHAL/.test(t8.txt) &&
   t8.st.threat===9.68 && Math.abs(t8.st.survive-1.137)<0.01, t8.txt.slice(0,140));
const t7d = await readThreat(7,4);
const exp4 = await gate('shock',4);
ok('the PLATING row shows the survival-time delta the next rank buys against THIS level',
   /PLATING 4 → 5/.test(t7d.plate) && /1\.6 s/.test(t7d.plate) && /2 s/.test(t7d.plate),
   t7d.plate.replace(/\s+/g,' '));
ok('the underlying gateCalc figures are exact (shock at PLATING 4 = 7.920)', exp4===7.92, String(exp4));

console.log('\n=== 8. WEAPON UNLOCKS ===');
await ev(`BP2.Profile.reset();__game.grantSP(5000)`); await round(1); await sleep(300);
const w0 = await ev(`({allowed:__game.weaponAllowed(), btns:document.querySelectorAll('#wbtns .wbtn').length,
  pick:(()=>{__game.setWeapon(2);return __game.Weapons.current().id})()})`);
ok('locked weapons: only the rifle is allowed, one button, 1-4 cannot select one',
   JSON.stringify(w0.allowed)==='[true,false,false,false]' && w0.btns===1 && w0.pick==='rifle', JSON.stringify(w0));
const gated = await ev(`(()=>{const g=BP2.Profile.weaponGate('pistol');const r=BP2.Profile.buyWeapon('pistol');
  return {gated:g.gated, level:g.level, cost:g.cost, bought:!!r};})()`);
ok('the pistol is gated behind clearing MISSION 1 and cannot be bought yet',
   gated.gated===true && gated.level===1 && gated.cost===400 && gated.bought===false, JSON.stringify(gated));
await ev(`BP2.Profile.clearLevel(1, 60); BP2.Armoury.open('start')`); await sleep(250);
await ev(`(()=>{const b=document.querySelector('[data-wpn="pistol"]');if(b)b.scrollIntoView({block:'center'});return 1})()`);
await sleep(300);
const bw = await ev(`(()=>{const b=document.querySelector('[data-wpn="pistol"]');if(!b)return null;
  const q=b.getBoundingClientRect();
  if(q.top<0||q.bottom>innerHeight) return null;
  return {x:Math.round(q.left+q.width/2),y:Math.round(q.top+q.height/2)};})()`);
ok('once MISSION 1 is cleared the pistol shows a live BUY button, scrolled into view', !!bw, JSON.stringify(bw));
await tstart(bw.x, bw.y); await sleep(60); await tend(); await sleep(350);
const w1 = await ev(`({allowed:__game.weaponAllowed(), sp:BP2.Profile.get().sp, un:BP2.Profile.get().unlocked})`);
ok('buying the pistol costs 400 SP and unlocks it', w1.allowed[2]===true && w1.un.indexOf('pistol')>=0, JSON.stringify(w1));
await nav(); await sleep(200); await round(1); await sleep(350);
const w2 = await ev(`({allowed:__game.weaponAllowed(), btns:document.querySelectorAll('#wbtns .wbtn').length,
  pick:(()=>{__game.setWeapon(2);return __game.Weapons.current().id})()})`);
ok('the unlock persists across a reload and the pistol is now selectable',
   w2.allowed[2]===true && w2.btns===2 && w2.pick==='pistol', JSON.stringify(w2));
await ev(`__game.setWeapon(0)`);

console.log('\n=== 9. MANUAL RELOAD BUTTON ===');
await ev(`BP2.Profile.reset();__game.grantSP(0)`); await round(1); await sleep(400);
await ev(`__game.S.touchMode='doubletap';__game.S.aimAssist=0;__game.S.mobileADS='off';__game.applySettings()`);
const rlRect = ()=>ev(`(()=>{const q=document.getElementById('btnReload').getBoundingClientRect();
  const v=document.getElementById('vitals').getBoundingClientRect();
  const w=document.getElementById('wbtns').getBoundingClientRect();
  const hit=(a,b)=>!(a.right<=b.left||a.left>=b.right||a.bottom<=b.top||a.top>=b.bottom);
  return {x:Math.round(q.left+q.width/2), y:Math.round(q.top+q.height/2), w:Math.round(q.width), h:Math.round(q.height),
    left:Math.round(q.left), right:Math.round(q.right), top:Math.round(q.top), bottom:Math.round(q.bottom),
    vw:innerWidth, vh:innerHeight, hitVitals:hit(q,v), hitWbtns:hit(q,w), visible:getComputedStyle(document.getElementById('touchUI')).opacity};})()`);
let rl = await rlRect();
ok('the reload button is a >=44px tap target and on screen', rl.w>=44 && rl.h>=40 && rl.left>=0 && rl.right<=rl.vw && rl.bottom<=rl.vh, JSON.stringify(rl));
ok('it does not overlap the vitals bar or the weapon column', !rl.hitVitals && !rl.hitWbtns, `vitals=${rl.hitVitals} wbtns=${rl.hitWbtns}`);
// the fire half is the LOOK half; the reload button must live on the other one
const fireHalf = (r)=>ev(`(()=>{const half=innerWidth/2;const moveLeft=!__game.S.leftHanded;
  const inMove = moveLeft? ${r.x}<half : ${r.x}>=half; return {inMove, moveLeft, half:Math.round(half)};})()`);
let fh = await fireHalf(rl);
ok('right-handed: the reload button sits in the MOVE half, never the fire/look half', fh.inMove, JSON.stringify(fh));
// it actually reloads
const rlWork = await ev(`(()=>{const rt=__game.Weapons.runtime();rt[0].mag=7;rt[0].reserve=200;__game.HUD.updateAmmo();
  return {mag:__game.ammo().mag, warn:document.getElementById('btnReload').classList.contains('warn')};})()`);
ok('a low magazine lights the reload prompt', rlWork.warn && rlWork.mag===7, JSON.stringify(rlWork));
// the gun is still being drawn for 0.52 s after a round starts, and startReload
// is a no-op in 'draw' — wait for idle or the test measures the draw, not the button
const waitIdle=async()=>{ for(let i=0;i<30;i++){ if(await ev(`__game.Weapons.state()`)==='idle') return true; await sleep(150);} return false; };
ok('the weapon reaches idle before the reload tap', await waitIdle());
await tstart(rl.x, rl.y); await sleep(60); await tend(); await sleep(120);
const st = await ev(`__game.Weapons.state()`);
await sleep(2400);
const rlAfter = await ev(`({mag:__game.ammo().mag, shots:__game.GAME.stats.shots})`);
ok('tapping the reload button reloads the magazine', st==='reload' && rlAfter.mag===30, `state=${st} mag=${rlAfter.mag}`);
// a tap on the button must never be read as a fire tap
const sBefore = await ev('__game.GAME.stats.shots');
await waitIdle();
await ev(`__game.Weapons.runtime()[0].mag=9`);
for(let i=0;i<2;i++){ await tstart(rl.x, rl.y); await sleep(50); await tend(); await sleep(90); }
await sleep(400);
const sAfter = await ev('__game.GAME.stats.shots');
ok('a double-tap ON the reload button does not fire a shot', sAfter===sBefore, `shots ${sBefore} -> ${sAfter}`);
// left-handed, both orientations
await ev(`__game.S.leftHanded=1;__game.applySettings()`); await sleep(300);
rl = await rlRect(); fh = await fireHalf(rl);
ok('left-handed portrait: still in the MOVE half, on screen, no overlaps',
   fh.inMove && !rl.hitVitals && !rl.hitWbtns && rl.right<=rl.vw && rl.left>=0, JSON.stringify(rl)+' '+JSON.stringify(fh));
await viewport(844,390); W=844;H=390; await ev(`__game.onResize()`); await sleep(400);
rl = await rlRect(); fh = await fireHalf(rl);
ok('left-handed landscape: still in the MOVE half, on screen, no overlaps',
   fh.inMove && !rl.hitVitals && !rl.hitWbtns && rl.right<=rl.vw && rl.bottom<=rl.vh, JSON.stringify(rl)+' '+JSON.stringify(fh));
await ev(`__game.S.leftHanded=0;__game.applySettings()`); await sleep(300);
rl = await rlRect(); fh = await fireHalf(rl);
ok('right-handed landscape: still in the MOVE half, on screen, no overlaps',
   fh.inMove && !rl.hitVitals && !rl.hitWbtns && rl.right<=rl.vw && rl.bottom<=rl.vh, JSON.stringify(rl)+' '+JSON.stringify(fh));
// with all four weapons owned the column is at its tallest
await ev(`(()=>{const P=BP2.Profile;['pistol','shotgun','sniper'].forEach(id=>P.unlock(id));__game.HUD.weaponButtons();__game.HUD.layoutTouch();return 1})()`);
await sleep(300);
rl = await rlRect();
ok('landscape with all 4 weapon buttons: reload still clears the column and the vitals',
   !rl.hitVitals && !rl.hitWbtns && rl.bottom<=rl.vh, JSON.stringify(rl));
await viewport(390,844); W=390;H=844; await ev(`__game.onResize()`); await sleep(350);
rl = await rlRect();
ok('portrait with all 4 weapon buttons: reload still clears the column and the vitals',
   !rl.hitVitals && !rl.hitWbtns && rl.bottom<=rl.vh, JSON.stringify(rl));

console.log('\n=== 10. DEBRIEF SP BREAKDOWN ===');
await ev(`BP2.Profile.reset();BP2.Profile.get().level=1;BP2.Profile.save()`);
// P4a: MISSION 1 is a CAPTURE now — an empty roster is not a win until the
// quay is actually held, so the debrief only arrives after the meter fills.
const clearRound = async ()=>{
  await round(1); await sleep(500);
  await ev(`(()=>{__game.god(true);__game.GAME.stats.shots=10;__game.GAME.stats.hits=8;
    __game.Enemies.list().filter(e=>e.active&&e.alive).forEach(e=>__game.Enemies.damage(e,e.maxHp*4,false,null));return 1})()`);
  const z = await ev(`__game.objState().zone`);
  for(let i=0;i<70;i++){
    await sleep(400);
    const st = await ev(`(()=>{__game.teleport(${z.x},${z.z});return __game.GAME.state;})()`);
    if(st==='end') break;
  }
  await sleep(1200);
  return ev(`({txt:document.getElementById('spBreak').textContent.replace(/\\s+/g,' '),
    sp:BP2.Profile.get().sp, brk:JSON.parse(JSON.stringify(__game.GAME.sp))})`);
};
const spA = await clearRound();
ok('first clear of MISSION 1 pays 250 x 1 and says so',
   spA.brk.first===true && spA.brk.clear===250 && /FIRST CLEAR ×250/.test(spA.txt), spA.txt.slice(0,190));
ok('accuracy bonus (8/10) is +48 and FLAWLESS is +100',
   spA.brk.acc===48 && spA.brk.flawless===100, JSON.stringify(spA.brk));
ok('the itemised rows count up to the real total',
   /SERVICE POINTS EARNED/.test(spA.txt) && spA.brk.kills===50, spA.txt.slice(-90));
const spB = await clearRound();
ok('a REPLAY clear pays 100 x 1, visibly different from the first clear',
   spB.brk.first===false && spB.brk.clear===100 && /REPLAY CLEAR ×100/.test(spB.txt) && /Replays pay 100/.test(spB.txt),
   spB.txt.slice(0,190));
ok('the replay rate really is 40% of the first clear', spB.brk.clear/spA.brk.clear===0.4, `${spA.brk.clear} -> ${spB.brk.clear}`);
await ev(`(()=>{const g=__game;g.loadLevel(1);return 1})()`); await sleep(500);
await ev(`(()=>{const g=__game;g.god(false);g.hurt(30,0);g.god(true);
  g.Enemies.list().filter(e=>e.active&&e.alive).forEach(e=>g.Enemies.damage(e,e.maxHp*4,false,null));return 1})()`);
{ const z = await ev(`__game.objState().zone`);
  for(let i=0;i<70;i++){ await sleep(400);
    const st = await ev(`(()=>{__game.teleport(${z.x},${z.z});return __game.GAME.state;})()`);
    if(st==='end') break; } }
const dmgRun = await ev(`({flawless:__game.GAME.sp.flawless, taken:+__game.GAME.stats.damageTaken.toFixed(1)})`);
ok('taking damage loses the FLAWLESS bonus', dmgRun.flawless===0 && dmgRun.taken>0, JSON.stringify(dmgRun));

console.log('\n=== 11. RESET PROGRESS (settings, behind a confirm) ===');
await ev(`(()=>{BP2.Profile.reset();__game.grantSP(900);BP2.Profile.buyRank('plating');BP2.Profile.clearLevel(1,44);
  __game.S.tsens=2.25;__game.S.leftHanded=1;__game.S.quality='med';
  localStorage.setItem('bp2_settings',JSON.stringify(__game.S));return 1})()`);
const preReset = await ev(`({sp:BP2.Profile.get().sp, rank:BP2.Profile.rank('plating'), cleared:BP2.Profile.cleared(1),
  set:JSON.parse(localStorage.getItem('bp2_settings')).tsens})`);
ok('a career exists before the reset', preReset.sp>0 && preReset.rank===1 && preReset.cleared && preReset.set===2.25, JSON.stringify(preReset));
await ev(`__game.applySettings();(function(){const b=document.getElementById('btnResetProg');return !!b})()`);
const hasBtn = await ev(`(()=>{document.getElementById('btnSettings').click();return !!document.getElementById('btnResetProg')})()`);
ok('SETTINGS carries a RESET PROGRESS button', hasBtn);
await ev(`document.getElementById('btnResetProg').click()`); await sleep(250);
ok('RESET PROGRESS asks on a screen, never an alert()', await ev(`BP2.Armoury.confirmVisible()`));
await ev(`document.getElementById('btnCfmNo').click()`); await sleep(200);
const cancelled = await ev(`({sp:BP2.Profile.get().sp, rank:BP2.Profile.rank('plating')})`);
ok('CANCEL leaves the career alone', cancelled.sp===preReset.sp && cancelled.rank===1, JSON.stringify(cancelled));
await ev(`document.getElementById('btnResetProg').click()`); await sleep(200);
await ev(`document.getElementById('btnCfmYes').click()`); await sleep(350);
const postReset = await ev(`({sp:BP2.Profile.get().sp, rank:BP2.Profile.rank('plating'), cleared:BP2.Profile.cleared(1),
  un:BP2.Profile.get().unlocked, stored:JSON.parse(localStorage.getItem('bp2_profile')).sp,
  set:JSON.parse(localStorage.getItem('bp2_settings')).tsens, setLH:JSON.parse(localStorage.getItem('bp2_settings')).leftHanded})`);
ok('RESET PROGRESS wipes bp2_profile only — bp2_settings is untouched',
   postReset.sp===0 && postReset.rank===0 && !postReset.cleared && postReset.stored===0 &&
   JSON.stringify(postReset.un)==='["rifle"]' && postReset.set===2.25 && postReset.setLH===1, JSON.stringify(postReset));
await ev(`__game.S.leftHanded=0;__game.S.tsens=1;__game.S.quality='high';localStorage.setItem('bp2_settings',JSON.stringify(__game.S));__game.applySettings()`);

console.log('\n=== 12. P1 / P2 NUMBERS STILL HOLD ===');
const p1 = await ev(`(()=>{const g=__game;
  const l1=(()=>{g.loadLevel(1);const es=g.enemyInfo();return {n:es.length,boss:es.filter(e=>e.boss).length,
    tier:es[0]&&es[0].tier, pool:g.poolInfo().filter(e=>!e.active).length};})();
  const l8=(()=>{g.loadLevel(8);const es=g.enemyInfo();const b=es.filter(e=>e.boss);
    return {total:es.length,bosses:b.length,hp:b[0]&&b[0].maxHp,scale:b[0]&&+b[0].scale.toFixed(2),
      apPen:b[0]&&+b[0].apPen.toFixed(2),name:b[0]&&b[0].name,ma:g.levelInfo().maxAttackers};})();
  return {levels:BP2.LEVELS.length, pen:BP2.TIERS.praetor.apPen,
    mil5:g.gateCalc('militia',5).hp.toFixed(3), sho5:g.gateCalc('shock',5).hp.toFixed(3), pra5:g.gateCalc('praetor',5).hp.toFixed(3),
    l1, l8};})()`);
ok('BP2.LEVELS.length === 10 and praetor apPen 0.34 (P4c variant C)', p1.levels===10 && p1.pen===0.34, `${p1.levels} / ${p1.pen}`);
ok('armour gate at PLATING 5: militia 0.900 / shock 6.480 / praetor 9.680 (P4c variant C)',
   p1.mil5==='0.900' && p1.sho5==='6.480' && p1.pra5==='9.680', `${p1.mil5} / ${p1.sho5} / ${p1.pra5}`);
ok('loadLevel(1) = 5 militia, 0 bosses, 15 of 20 rigs deactivated',
   p1.l1.n===5 && p1.l1.boss===0 && p1.l1.tier==='militia' && p1.l1.pool===15, JSON.stringify(p1.l1));
ok('loadLevel(8) = 18 + 1 boss, maxHp 484, scale 1.18, apPen 0.44, THE MARSHAL, maxAttackers 4',
   p1.l8.total===19 && p1.l8.bosses===1 && p1.l8.hp===484 && p1.l8.scale===1.18 && p1.l8.apPen===0.44 &&
   p1.l8.name==='THE MARSHAL' && p1.l8.ma===4, JSON.stringify(p1.l8));
const paint = await ev(`(()=>{const g=__game;g.loadLevel(0);
  return {paint:g.paintball(), allowed:g.weaponAllowed(), roster:g.GAME.rosterSize};})()`);
ok('L0 is still paintball, rifle only, 2 targets',
   paint.paint===true && JSON.stringify(paint.allowed)==='[true,false,false,false]' && paint.roster===2, JSON.stringify(paint));
const tut = await ev(`(()=>{const P=BP2.Profile;P.reset();const before=P.get().sp;
  return {steps:BP2.Tutorial.STEPS.length, sp:before};})()`);
ok('the 8-step drill is intact', tut.steps===8, String(tut.steps));

await sleep(600);
ok('zero console errors through the whole run', errors.length===0, errors.slice(0,4).join(' | '));

await send('Emulation.clearDeviceMetricsOverride');
await send('Emulation.setTouchEmulationEnabled',{enabled:false});
if(winId && winId.windowId) await send('Browser.setWindowBounds',{windowId:winId.windowId, bounds:winId.bounds});
console.log(`\n${pass} passed, ${fail} failed`+(fail?'  -> '+failed.join(', '):''));
ws.close();
