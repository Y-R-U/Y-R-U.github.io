// BREACHPOINT II — P2 verification suite (touch/mobile emulation).
import {connect,URL,sleep} from './lib.mjs';
const {ws,send,ev,errors}=await connect();

let pass=0, fail=0; const failed=[];
const ok=(n,c,x='')=>{ if(c) pass++; else {fail++; failed.push(n);} console.log((c?'PASS  ':'FAIL  ')+n+(x?'   '+x:'')); };

await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
await send('Network.setCacheDisabled',{cacheDisabled:true});
// touch emulation MUST be enabled before navigating
await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
// the metrics override resizes the real headless window and does NOT come back
// on its own — snapshot the bounds and put them back at the end, or every later
// suite measures a different frustum (it cost us a phantom draw-call regression)
const winId = (await send('Browser.getWindowForTarget')).result;
const viewport = async (w,h)=>{ await send('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:2,mobile:true}); await sleep(450); };
await viewport(390,844);

const nav = async ()=>{ await send('Page.navigate',{url:URL}); await sleep(3800); };
const fresh = async ()=>{ await ev(`localStorage.removeItem('bp2_profile');localStorage.removeItem('bp2_settings')`); await nav(); };

await send('Page.navigate',{url:'about:blank'}); await sleep(400);
errors.length=0;
await nav();
await ev(`localStorage.removeItem('bp2_profile');localStorage.removeItem('bp2_settings')`);
await nav();

let W=390,H=844;
const tstart=(x,y,id=1)=>send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id}]});
const tmove=(x,y,id=1)=>send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y,id}]});
const tend =()=>send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});   // EMPTY array
const RX=()=>W*0.76, RY=()=>H*0.62, LX=()=>W*0.24, LY=()=>H*0.72;

console.log('\n=== 1. BOOT ===');
ok('boots with __game + BP2.Tutorial', await ev('!!(window.__game && window.BP2 && BP2.Tutorial)'));
ok('zero console errors / exceptions on load', errors.length===0, errors.join(' | '));

/* --- CANARY 1: prove the error collector can fail --- */
await ev('setTimeout(()=>{throw new Error("CANARY")},10)'); await sleep(400);
const sawCanary = errors.some(e=>/CANARY/.test(e));
ok('CANARY(errors): collector catches a deliberate throw', sawCanary, sawCanary? 'caught: '+errors.find(e=>/CANARY/.test(e)).slice(0,42) : 'COLLECTOR IS BLIND');
for(let i=errors.length-1;i>=0;i--) if(/CANARY/.test(errors[i])) errors.splice(i,1);

console.log('\n=== 2. INSTRUCTION SCREEN ===');
let s = await ev(`({intro:BP2.Tutorial.introVisible(), state:__game.GAME.state, start:!document.getElementById('startScreen').classList.contains('hidden'), cards:document.querySelectorAll('.ccard').length, mode:__game.S.touchMode})`);
ok('fresh profile boots into the instruction screen, paused', s.intro && s.state==='menu' && !s.start, JSON.stringify(s));
ok('control cards rendered (6)', s.cards===6, 'cards='+s.cards);
ok("default touch mode is 'doubletap'", s.mode==='doubletap', s.mode);
// a tap in the middle of the screen (not on the buttons) must start it
await tstart(W/2, H*0.42); await sleep(40); await tend(); await sleep(900);
s = await ev(`({intro:BP2.Tutorial.introVisible(), state:__game.GAME.state, lvl:__game.levelInfo().id, bar:BP2.Tutorial.barVisible(), step:BP2.Tutorial.state().step})`);
ok('one tap dismisses it and deploys into L0', !s.intro && s.state==='play' && s.lvl===0, JSON.stringify(s));
ok('tutorial bar visible, first step is MOVE', s.bar && s.step==='move', s.step);

console.log('\n=== 3. DOUBLE-TAP FIRE SCHEME ===');
await ev(`__game.S.aimAssist=0; __game.S.mobileADS='off'; __game.applySettings()`);
const shots=()=>ev('__game.GAME.stats.shots');
const ammo =()=>ev('__game.ammo().mag');
// running a magazine dry starts a 2s auto-reload; fire() is a no-op until it ends
const readyGun=async(n=8)=>{ for(let i=0;i<30;i++){ if(await ev(`__game.Weapons.state()`)==='idle') break; await sleep(200); }
  await ev(`__game.Weapons.runtime()[0].mag=${n}; __game.Weapons.runtime()[0].reserve=210`); };

/* --- CANARY 2 (gameplay): the "did it fire?" check must fail with no taps --- */
const s0 = await shots(); await sleep(600); const s0b = await shots();
ok('CANARY(fire): no taps => shot counter does NOT move', s0b===s0, `shots ${s0} -> ${s0b}`);

// single tap: look only, must not fire
const a1=await shots();
await tstart(RX(),RY()); await sleep(60); await tend(); await sleep(500);
const a2=await shots();
ok('a single tap on the right half does NOT fire', a2===a1, `shots ${a1} -> ${a2}`);

// a drag looks without firing
const y1=await ev('+__game.player.yaw.toFixed(4)');
await tstart(RX(),RY());
for(let i=1;i<=6;i++){ await tmove(RX()-i*14, RY()); await sleep(40); }
await sleep(250); await tend(); await sleep(250);
const y2=await ev('+__game.player.yaw.toFixed(4)'); const a3=await shots();
ok('a drag on the right half looks and does NOT fire', Math.abs(y2-y1)>0.05 && a3===a2, `yaw ${y1} -> ${y2}, shots ${a2} -> ${a3}`);

// a real double tap fires exactly once when released quickly
await readyGun();
const b1=await ammo();
await tstart(RX(),RY()); await sleep(45); await tend();
await sleep(90);
await tstart(RX(),RY()); await sleep(45); await tend(); await sleep(350);
const b2=await ammo();
ok('a real double-tap fires a shot', b2<b1, `mag ${b1} -> ${b2}`);

// holding the second tap keeps firing
await readyGun();
const c1=await ammo();
await tstart(RX(),RY()); await sleep(45); await tend();
await sleep(90);
await tstart(RX(),RY()); await sleep(600); await tend(); await sleep(200);
const c2=await ammo();
ok('holding the second tap keeps firing (ammo drops by >1)', (c1-c2)>1, `mag ${c1} -> ${c2}  (${c1-c2} rounds)`);

// a slow tap-pair outside the window must not fire
await readyGun();
const d1=await ammo();
await tstart(RX(),RY()); await sleep(45); await tend();
await sleep(600);                                  // > DT_GAP 280ms
await tstart(RX(),RY()); await sleep(45); await tend(); await sleep(350);
const d2=await ammo();
ok('two taps 600ms apart do NOT fire (real 280ms window)', d2===d1, `mag ${d1} -> ${d2}`);

// the firing tap must still steer: fire and look at the same time
await readyGun();
const e1=await ev('({mag:__game.ammo().mag, yaw:+__game.player.yaw.toFixed(4)})');
await tstart(RX(),RY()); await sleep(45); await tend();
await sleep(90);
await tstart(RX(),RY());
for(let i=1;i<=6;i++){ await tmove(RX()-i*16, RY()); await sleep(55); }
await sleep(150); await tend(); await sleep(200);
const e2=await ev('({mag:__game.ammo().mag, yaw:+__game.player.yaw.toFixed(4)})');
ok('the held firing tap still looks while it fires', e2.mag<e1.mag && Math.abs(e2.yaw-e1.yaw)>0.05,
   `mag ${e1.mag} -> ${e2.mag}, yaw ${e1.yaw} -> ${e2.yaw}`);

// the other two modes still work
await ev(`__game.S.touchMode='twofinger'`);
await readyGun();
const f1=await ammo();
await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:RX(),y:RY(),id:1}]});
await sleep(60);
await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:RX(),y:RY(),id:1},{x:RX()-60,y:RY()+80,id:2}]});
await sleep(400); await tend(); await sleep(250);
const f2=await ammo();
ok("'twofinger' mode still fires on a second finger", f2<f1, `mag ${f1} -> ${f2}`);
await ev(`__game.S.touchMode='tapfire'`);
await readyGun();
const g1=await ammo();
await tstart(RX(),RY()); await sleep(60); await tend(); await sleep(350);
const g2=await ammo();
ok("'tapfire' mode still fires on a single tap", g2<g1, `mag ${g1} -> ${g2}`);
await ev(`__game.S.touchMode='doubletap'`);

console.log('\n=== 4. PAINTBALL ===');
const pb = await ev(`({paint:__game.paintball(), fx:__game.FX.isPaint(), allowed:__game.weaponAllowed()})`);
ok('L0 runs in paintball mode', pb.paint && pb.fx, JSON.stringify(pb));
ok('rifle only: the other three weapons are not allowed', JSON.stringify(pb.allowed)==='[true,false,false,false]', JSON.stringify(pb.allowed));
const wb = await ev(`({n:document.getElementById('wbtns').children.length, slots:[...document.getElementById('wbtns').children].map(b=>b.dataset.slot)})`);
ok('weapon buttons show only the rifle', wb.n===1 && wb.slots[0]==='0', JSON.stringify(wb));
const sw = await ev(`(()=>{__game.setWeapon(2);const a=__game.Weapons.index();__game.setWeapon(3);const b=__game.Weapons.index();return {a,b,id:__game.Weapons.current().id};})()`);
ok('keys/buttons 2-4 cannot select a locked weapon', sw.a===0 && sw.b===0 && sw.id==='rifle', JSON.stringify(sw));

// the player cannot die
const surv = await ev(`(()=>{const hp0=__game.player.hp;let r=null;for(let i=0;i<8;i++) r=__game.hurt(500);
  return {hp0, hp:r.hp, alive:r.alive, state:__game.GAME.state, paintHits:__game.GAME.stats.paintHits};})()`);
ok('paint hits never kill: 8 x 500 damage, still alive at full HP',
   surv.hp===surv.hp0 && surv.alive && surv.state==='play' && surv.paintHits>=8, JSON.stringify(surv));

console.log('\n=== 5. TUTORIAL STEPS ===');
// the double-tap experiments above already banked shots/looks, so restart the
// drill on a clean round: beginRun() resets every counter
await ev('__game.loadLevel(0)'); await sleep(900);
await ev(`__game.S.aimAssist=0; __game.S.mobileADS='off'`);
// CANARY(steps): sit still for 1.5s — the step machine must not advance
await sleep(1500);
let st = await ev('BP2.Tutorial.state()');
ok('CANARY(steps): 1.5s of no input does NOT advance the step machine', st.step==='move' && st.stepI===0,
   `step=${st.step} moved=${st.counters.moved.toFixed(2)} turned=${st.counters.turned.toFixed(2)}`);
await tstart(LX(),LY());
for(let i=1;i<=5;i++){ await tmove(LX(), LY()-i*16); await sleep(50); }
await sleep(900); await tend(); await sleep(250);
st = await ev('BP2.Tutorial.state()');
ok('MOVE advances only after the player actually walks', st.stepI>=1 && st.counters.moved>3, `step=${st.step} moved=${st.counters.moved.toFixed(2)}`);

// LOOK
await tstart(RX(),RY());
for(let i=1;i<=8;i++){ await tmove(RX()-i*18, RY()); await sleep(45); }
await sleep(400); await tend(); await sleep(250);
st = await ev('BP2.Tutorial.state()');
ok('LOOK advances only after the view really turns', st.stepI>=2 && st.counters.turned>1.2, `step=${st.step} turned=${st.counters.turned.toFixed(2)}`);

// FIRE — by real double-tap
await tstart(RX(),RY()); await sleep(45); await tend(); await sleep(90);
await tstart(RX(),RY()); await sleep(120); await tend(); await sleep(350);
st = await ev('BP2.Tutorial.state()');
ok('FIRE advances on a real double-tap shot', st.stepI>=3 && st.counters.shots>=1, `step=${st.step} shots=${st.counters.shots}`);

// HIT — reposition to a spot with line of sight, aim, shoot. The targets
// patrol, so every shot repeats the whole setup rather than trusting the last one.
const setup = `(()=>{const es=__game.enemyInfo().filter(x=>x.alive); const e=es[0]; if(!e) return null;
  for(const r of [6,8,10,12]) for(let a=0;a<16;a++){
    const th=a/16*Math.PI*2, x=e.x+Math.cos(th)*r, z=e.z+Math.sin(th)*r;
    __game.teleport(x,z); if(__game.insideSolid()) continue;
    const p=__game.player.pos;
    if(!__game.losClear(p.x,p.y+1.6,p.z,e.x,e.y+1.2,e.z)) continue;
    const dx=e.x-p.x, dz=e.z-p.z, d=Math.hypot(dx,dz);
    __game.look(Math.atan2(-dx,-dz), Math.atan2((e.y+1.15)-(p.y+1.62), d));
    return {name:e.name, d:+d.toFixed(1)};
  } return null;})()`;
const shoot = async ()=>{
  const spot = await ev(setup);
  if(!spot) return null;
  await sleep(90);                        // the camera matrix updates next frame
  const on = await ev('__game.probe().enemy');
  if(on) await ev('__game.fire()');
  await sleep(110);
  return on;
};
// the targets patrol, so re-run setup until the crosshair really is on one
let spot0=null, onTarget=null;
// a patrolling target drifts ~0.3m in 160ms, which is a whole torso width at
// 6m — aim late and re-try rather than trusting one snapshot
for(let i=0;i<10 && !onTarget;i++){ spot0 = await ev(setup); await sleep(90); onTarget = await ev('__game.probe().enemy'); }
ok('found a firing position with line of sight to a target', !!spot0, JSON.stringify(spot0));
ok('crosshair is on a target after aiming', !!onTarget, JSON.stringify(onTarget));
await ev('__game.Weapons.runtime()[0].mag=8');
for(let i=0;i<5 && (await ev('BP2.Tutorial.state()')).stepI<4; i++) await shoot();
st = await ev('BP2.Tutorial.state()');
ok('HIT advances only after a round lands on a target', st.stepI>=4 && st.counters.hits>=1, `step=${st.step} hits=${st.counters.hits}`);

// paint FX check now that rounds have landed
const fx = await ev(`(()=>{const P=__game.PAINT;const paint=[P.player,...P.targets];let blood=0,painted=0,vis=0;
  __game.scene.traverse(o=>{ if(!o.visible||!o.material||!o.material.color) return; vis++;
    const h=o.material.color.getHex();
    if(h===0xb01c14) blood++;
    if(paint.indexOf(h)>=0) painted++; });
  return {blood, painted, vis};})()`);
ok('no blood material in use anywhere in the scene', fx.blood===0, JSON.stringify(fx));
ok('paint-coloured splats/puffs/bibs are in the scene', fx.painted>0, JSON.stringify(fx));

// RELOAD — empty the magazine for real
await ev('__game.Weapons.runtime()[0].mag=3');
for(let i=0;i<5;i++){ await ev('__game.fire()'); await sleep(140); }
await sleep(2600);
st = await ev('BP2.Tutorial.state()');
ok('RELOAD advances only after a reload actually completes', st.stepI>=5 && st.counters.reloads>=1, `step=${st.step} reloads=${st.counters.reloads}`);

// ADS — the sights stay down during a reload, so wait for the gun to settle
await readyGun(30);
await ev('__game.ads(true)'); await sleep(800);
st = await ev('BP2.Tutorial.state()');
ok('ADS advances only once the sights are really up', st.stepI>=6 && st.counters.ads>=1,
   `step=${st.step} ads=${st.counters.ads} `+JSON.stringify(await ev(`({amt:+__game.Weapons.adsAmount().toFixed(2), want:__game.Weapons.adsWanted(), wstate:__game.Weapons.state(), sprint:__game.player.sprinting, assist:__game.S.aimAssist, mads:__game.S.mobileADS, gstate:__game.GAME.state, running:BP2.Tutorial.state().running})`)));
await ev('__game.ads(false)');

// DOWN a target for real: 60 HP, 23 per body shot
await ev('__game.Weapons.runtime()[0].mag=30');
for(let i=0;i<20 && (await ev('BP2.Tutorial.state()')).stepI<7; i++) await shoot();
st = await ev('BP2.Tutorial.state()');
ok('DOWN A TARGET advances only when a target actually goes down', st.stepI>=7 && st.counters.downs>=1, `step=${st.step} downs=${st.counters.downs}`);

console.log('\n=== 6. SKIP + COMPLETION ===');
const spBefore = await ev('__game.Profile.get().sp');
await ev(`document.getElementById('btnSkipTut').click()`); await sleep(1200);
const done = await ev(`({tut:BP2.Tutorial.state(), war:BP2.Tutorial.warVisible(), bar:BP2.Tutorial.barVisible(),
  sp:__game.Profile.get().sp, trainingDone:__game.Profile.get().trainingDone, award:BP2.Tutorial.award(),
  state:__game.GAME.state, alive:__game.Enemies.aliveCount()})`);
ok('SKIP jumps to the end of the step list', done.tut.skipped && done.tut.stepI===done.tut.total, JSON.stringify({sk:done.tut.skipped,i:done.tut.stepI,n:done.tut.total}));
// P4a: the turn is a radio beat over the LIVE round, not a screen
ok('training completes: the war beat runs over the live round, bar gone, 0 targets left',
   done.war && !done.bar && done.alive===0 && done.state==='play',
   JSON.stringify({war:done.war,bar:done.bar,alive:done.alive,state:done.state}));
await ev(`BP2.Campaign.Radio.skip()`); await sleep(900);
ok('training awards exactly 300 SP', done.award===300 && (done.sp-spBefore)>=300, `award=${done.award} sp ${spBefore} -> ${done.sp}`);
ok('trainingDone is set', done.trainingDone===true, String(done.trainingDone));
const stored = await ev(`JSON.parse(localStorage.getItem('bp2_profile')).trainingDone`);
ok('trainingDone written to localStorage', stored===true, String(stored));

console.log('\n=== 7. RETURNING PLAYER ===');
await nav();
const ret = await ev(`({intro:BP2.Tutorial.introVisible(), start:!document.getElementById('startScreen').classList.contains('hidden'),
  trainingDone:__game.Profile.get().trainingDone, sp:__game.Profile.get().sp, lvl:__game.GAME.level.id})`);
ok('trainingDone persists across a reload', ret.trainingDone===true && ret.sp>=300, JSON.stringify({d:ret.trainingDone,sp:ret.sp}));
ok('instruction screen is NOT shown to a returning player', !ret.intro && ret.start, JSON.stringify({intro:ret.intro,start:ret.start}));
// still reachable from the pause screen
await ev(`__game.start()`); await sleep(900);
await ev(`__game.GAME.pause()`); await sleep(300);
const fromPause = await ev(`(()=>{const p=!document.getElementById('pauseScreen').classList.contains('hidden');
  document.getElementById('btnControls').click();
  return {paused:p, intro:BP2.Tutorial.introVisible(), state:__game.GAME.state,
          pauseHidden:document.getElementById('pauseScreen').classList.contains('hidden')};})()`);
ok('CONTROLS on the pause screen opens the instruction screen', fromPause.intro && fromPause.state==='pause', JSON.stringify(fromPause));
const back = await ev(`(()=>{document.getElementById('btnIntroGo').click();
  return {intro:BP2.Tutorial.introVisible(), pause:!document.getElementById('pauseScreen').classList.contains('hidden'), state:__game.GAME.state};})()`);
ok('closing it returns to the pause screen, still paused', !back.intro && back.pause && back.state==='pause', JSON.stringify(back));
const setRow = await ev(`(()=>{const o=[...document.querySelectorAll('#setBody .seg')].map(s=>[...s.children].map(b=>b.textContent));
  return o.filter(r=>r.indexOf('DOUBLE-TAP')>=0)[0]||null;})()`);
ok('settings still offer all three touch modes', setRow && setRow.join()==='DOUBLE-TAP,2-FINGER,TAP-FIRE', JSON.stringify(setRow));

console.log('\n=== 8. PAINTBALL IS LEVEL-DRIVEN (falsify) ===');
const live = await ev(`(()=>{__game.loadLevel(1);__game.S.god=0;const hp0=__game.player.hp;const r=__game.hurt(500);
  return {paint:__game.paintball(), fx:__game.FX.isPaint(), hp0, hp:r.hp, alive:r.alive};})()`);
ok('CANARY(paintball): on a live level the same damage DOES kill', !live.paint && !live.fx && live.hp===0 && !live.alive, JSON.stringify(live));
const l1w = await ev(`(()=>{__game.Profile.unlock('pistol');__game.loadLevel(1);
  return {allowed:__game.weaponAllowed(), btns:document.getElementById('wbtns').children.length};})()`);
ok('weapon buttons follow the unlock ladder on live levels', JSON.stringify(l1w.allowed)==='[true,false,true,false]' && l1w.btns===2, JSON.stringify(l1w));

console.log('\n=== 9. LAYOUT: PORTRAIT + LANDSCAPE ===');
const layoutCheck = async (label,w,h)=>{
  W=w;H=h; await viewport(w,h);
  await ev(`BP2.Tutorial.showIntro('view','start')`); await sleep(350);
  const r = await ev(`(()=>{const c=[...document.querySelectorAll('.ccard')];
    const vw=innerWidth, vh=innerHeight;
    let off=0, tiny=0, minFont=99;
    for(const el of c){const b=el.getBoundingClientRect();
      if(b.left< -1 || b.right>vw+1) off++;
      if(b.width<90||b.height<24) tiny++;
      const f=parseFloat(getComputedStyle(el.querySelector('span')).fontSize); if(f<minFont)minFont=f;}
    const btn=document.getElementById('btnIntroGo').getBoundingClientRect();
    const card=document.querySelector('#introScreen .card');
    return {n:c.length, off, tiny, minFont, vw, vh,
      btnOn: btn.top>=0 && btn.bottom<=vh+1 && btn.width>=90 && btn.height>=36,
      hscroll: document.documentElement.scrollWidth>vw || document.body.scrollWidth>vw,
      cardScrollable: card.scrollHeight<=card.clientHeight+1};})()`);
  ok(label+': all 6 cards on screen, readable', r.n===6 && r.off===0 && r.tiny===0 && r.minFont>=10, JSON.stringify(r));
  ok(label+': primary action reachable, no horizontal page scroll', r.btnOn && !r.hscroll, `btnOn=${r.btnOn} hscroll=${r.hscroll}`);
  await ev(`BP2.Tutorial.hideIntro()`);
};
await layoutCheck('portrait 390x844',390,844);
await layoutCheck('landscape 844x390',844,390);
// the tutorial bar must also fit in both
for(const [w,h] of [[390,844],[844,390]]){
  W=w;H=h; await viewport(w,h);
  const r = await ev(`(()=>{const b=document.getElementById('tutHud');b.classList.remove('hidden');
    const q=b.getBoundingClientRect(); const f=parseFloat(getComputedStyle(document.getElementById('tutStep')).fontSize);
    const hit=(o)=>{const a=document.getElementById(o).getBoundingClientRect();
      return !(q.right<=a.left||q.left>=a.right||q.bottom<=a.top||q.top>=a.bottom);};
    const r={left:+q.left.toFixed(0),right:+q.right.toFixed(0),top:+q.top.toFixed(0),bottom:+q.bottom.toFixed(0),
      f, vw:innerWidth, vh:innerHeight, hitsMap:hit('mapwrap'), hitsTimer:hit('timer'), hitsCross:hit('cross')};
    b.classList.add('hidden'); return r;})()`);
  ok(`tutorial bar fits, clears the HUD and is readable at ${w}x${h}`,
     r.left>=0 && r.right<=r.vw+1 && r.bottom<=r.vh && r.f>=14 && !r.hitsMap && !r.hitsTimer,
     JSON.stringify(r));
}
await viewport(390,844); W=390;H=844;

console.log('\n=== 10. P1 REGRESSION ===');
const p1 = await ev(`(()=>{const g=__game;const l8=(()=>{g.loadLevel(8);const es=g.enemyInfo();const b=es.filter(e=>e.boss);
  return {total:es.length,bosses:b.length,hp:b[0]&&b[0].maxHp};})();
  return {levels:BP2.LEVELS.length, mil5:g.gateCalc('militia',5).hp.toFixed(3), pra5:g.gateCalc('praetor',5).hp.toFixed(3), l8};})()`);
ok('BP2.LEVELS.length === 10', p1.levels===10, String(p1.levels));
ok('armour gate PLATING 5: militia 0.900 / praetor 9.680 (P4c variant C)', p1.mil5==='0.900' && p1.pra5==='9.680', p1.mil5+' / '+p1.pra5);
ok('loadLevel(8) = 18 + 1 boss, boss maxHp 484', p1.l8.total===19 && p1.l8.bosses===1 && p1.l8.hp===484, JSON.stringify(p1.l8));

await sleep(600);
ok('zero console errors through the whole run', errors.length===0, errors.slice(0,4).join(' | '));

await send('Emulation.clearDeviceMetricsOverride');
await send('Emulation.setTouchEmulationEnabled',{enabled:false});
if(winId && winId.windowId) await send('Browser.setWindowBounds',{windowId:winId.windowId, bounds:winId.bounds});
console.log(`\n${pass} passed, ${fail} failed`+(fail?'  -> '+failed.join(', '):''));
ws.close();
