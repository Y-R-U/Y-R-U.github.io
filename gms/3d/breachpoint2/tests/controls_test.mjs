/* BREACHPOINT II — the touch control scheme, after the doubletap misread.
   Aaron's property, stated directly: with one finger held on the look side, a
   second finger fires AND the view still turns. Everything here exists to
   prove that, to prove the instruction overlay describes the real zones, and
   to prove each of those checks is capable of failing.                       */
import {connect,URL,sleep} from './lib.mjs';
const {ws,send,ev,errors}=await connect();

let pass=0, fail=0; const failed=[];
const ok=(n,c,x='')=>{ if(c) pass++; else {fail++; failed.push(n);} console.log((c?'PASS  ':'FAIL  ')+n+(x?'   '+x:'')); };

await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
await send('Network.setCacheDisabled',{cacheDisabled:true});
await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
const winId=(await send('Browser.getWindowForTarget')).result;
const viewport=async(w,h)=>{ await send('Emulation.setDeviceMetricsOverride',
  {width:w,height:h,deviceScaleFactor:2,mobile:true}); await sleep(450); };

let W=390,H=844;
const nav=async()=>{ await send('Page.navigate',{url:URL}); await sleep(3600); };
const wipe=async()=>{ await ev(`localStorage.removeItem('bp2_profile');localStorage.removeItem('bp2_settings')`); };
let tid=500;                                   // fresh touch id per press, always
const tend=()=>send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});

await viewport(390,844);
await send('Page.navigate',{url:'about:blank'}); await sleep(400);
errors.length=0;
await nav(); await wipe(); await nav();

/* --- CANARY 1: the error collector is alive --- */
await ev('setTimeout(()=>{throw new Error("CANARY-CTRL")},10)'); await sleep(400);
ok('CANARY(errors): the collector catches a deliberate throw',
   errors.some(e=>/CANARY-CTRL/.test(e)), errors.some(e=>/CANARY-CTRL/.test(e))?'caught':'COLLECTOR IS BLIND');
for(let i=errors.length-1;i>=0;i--) if(/CANARY-CTRL/.test(errors[i])) errors.splice(i,1);

console.log('\n=== 1. DEFAULT ON A FRESH PROFILE (Aaron tests in incognito) ===');
const fresh = await ev(`({mode:__game.S.touchMode, look:__game.S.lookStyle, mig:__game.S.ctrlMig,
  storedSettings:localStorage.getItem('bp2_settings'), storedProfile:localStorage.getItem('bp2_profile'),
  intro:BP2.Tutorial.introVisible(), sp:BP2.Profile.get().sp, lvl:BP2.Profile.get().level})`);
ok('a genuinely fresh profile has NO stored settings and NO stored profile',
   fresh.storedSettings===null && fresh.storedProfile===null, JSON.stringify({s:fresh.storedSettings,p:fresh.storedProfile}));
ok("fresh default touchMode is 'twofinger'", fresh.mode==='twofinger', fresh.mode);
ok("fresh default lookStyle is still 'hold'", fresh.look==='hold', fresh.look);
ok('the incognito first-timer lands on the instruction screen at level 0 / 0 SP',
   fresh.intro && fresh.sp===0 && fresh.lvl===0, JSON.stringify({i:fresh.intro,sp:fresh.sp,l:fresh.lvl}));

console.log('\n=== 2. MIGRATION OFF THE OLD DEFAULT ===');
// an existing player carrying the shipped 'doubletap' default, plus a setting
// they really did choose — the migration must move one and keep the other
await ev(`localStorage.setItem('bp2_settings', JSON.stringify({touchMode:'doubletap', tsens:1.45, leftHanded:1}))`);
await nav();
const mig = await ev(`(()=>{const st=JSON.parse(localStorage.getItem('bp2_settings'));
  return {live:__game.S.touchMode, stored:st.touchMode, mig:st.ctrlMig, tsens:__game.S.tsens, lh:__game.S.leftHanded};})()`);
ok("a stored 'doubletap' from the old default migrates to 'twofinger'",
   mig.live==='twofinger' && mig.stored==='twofinger', JSON.stringify(mig));
ok('the migration is written back and stamped, so it runs exactly once', mig.mig===1, 'ctrlMig='+mig.mig);
ok('every other stored setting survives the migration', mig.tsens===1.45 && mig.lh===1, JSON.stringify({t:mig.tsens,lh:mig.lh}));

// CANARY(migration): it must not move settings that are not the old default
await ev(`localStorage.setItem('bp2_settings', JSON.stringify({touchMode:'tapfire'}))`);
await nav();
const keepTap = await ev(`__game.S.touchMode`);
ok("CANARY(migration): a stored 'tapfire' is NOT moved", keepTap==='tapfire', keepTap);

// once stamped, a deliberate DOUBLE-TAP sticks for good
await ev(`localStorage.setItem('bp2_settings', JSON.stringify({touchMode:'doubletap', ctrlMig:1}))`);
await nav();
const keepDT = await ev(`__game.S.touchMode`);
ok('a DOUBLE-TAP chosen after the migration is never stomped again', keepDT==='doubletap', keepDT);
await wipe(); await nav();

console.log('\n=== 3. THE HEADLINE: LOOK AND SHOOT AT THE SAME TIME ===');
await ev(`__game.start()`); await sleep(1200);
await ev(`__game.S.touchMode='twofinger'; __game.S.aimAssist=0; __game.S.mobileADS='off'; __game.S.leftHanded=0; __game.applySettings()`);
const RX=()=>W*0.76, RY=()=>H*0.60;
const readyGun=async(n=24)=>{ for(let i=0;i<30;i++){ if(await ev(`__game.Weapons.state()`)==='idle') break; await sleep(200); }
  await ev(`__game.Weapons.runtime()[0].mag=${n}; __game.Weapons.runtime()[0].reserve=210`); };
const readState=()=>ev('({mag:__game.ammo().mag, yaw:+__game.player.yaw.toFixed(4), shots:__game.GAME.stats.shots})');

// ONE finger held on the look side, dragged off centre, then a SECOND finger
// put down beside it and held. Poll during the hold — an idle headless window
// throttles rAF and the look rate integrates per frame.
async function gesture({second, holdMs}){
  const a=++tid, b=++tid;
  const ax=RX(), ay=RY();
  await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:ax,y:ay,id:a}]});
  await sleep(80);
  // drag the look finger off centre — a rate stick, so it keeps turning while held
  const look=[{x:ax-70,y:ay,id:a}];
  await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:look.slice()});
  await sleep(60);
  if(second){
    await send('Input.dispatchTouchEvent',{type:'touchStart',
      touchPoints:[{x:ax-70,y:ay,id:a},{x:ax-30,y:ay+150,id:b}]});
  }
  const steps=Math.max(4, Math.round(holdMs/120));
  for(let i=0;i<steps;i++){ await sleep(120); await ev('1'); }   // keep rAF alive
  await tend(); await sleep(260);
}

await readyGun();
const h0 = await readState();
await gesture({second:true, holdMs:840});
const h1 = await readState();
const dYaw = Math.abs(h1.yaw-h0.yaw), dMag = h0.mag-h1.mag;
ok('a second finger on the look side FIRES while the look finger is still down',
   dMag>0, `mag ${h0.mag} -> ${h1.mag} (${dMag} rounds)`);
ok('the view STILL TURNS during that same gesture (both, one gesture)',
   dYaw>0.05 && dMag>0, `yaw ${h0.yaw} -> ${h1.yaw} (Δ${dYaw.toFixed(3)} rad), mag ${h0.mag} -> ${h1.mag}`);
ok('holding the second finger empties MORE THAN ONE round', dMag>1, `${dMag} rounds in 840 ms`);

/* --- CANARY 2 (gameplay): the same gesture with ONE finger must NOT fire --- */
await readyGun();
const c0 = await readState();
await gesture({second:false, holdMs:840});
const c1 = await readState();
const cYaw=Math.abs(c1.yaw-c0.yaw), cMag=c0.mag-c1.mag;
ok('CANARY(fire): the identical gesture with only ONE finger turns but does NOT fire',
   cMag===0 && cYaw>0.05, `yaw Δ${cYaw.toFixed(3)} rad, mag ${c0.mag} -> ${c1.mag}`);

// the same thing with the sides swapped
await ev(`__game.S.leftHanded=1; __game.applySettings()`); await sleep(300);
const LX=()=>W*0.24;
await readyGun();
const l0 = await readState();
{
  const a=++tid, b=++tid, ax=LX(), ay=RY();
  await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:ax,y:ay,id:a}]});
  await sleep(80);
  await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:ax+70,y:ay,id:a}]});
  await sleep(60);
  await send('Input.dispatchTouchEvent',{type:'touchStart',
    touchPoints:[{x:ax+70,y:ay,id:a},{x:ax+30,y:ay+150,id:b}]});
  for(let i=0;i<7;i++){ await sleep(120); await ev('1'); }
  await tend(); await sleep(260);
}
const l1 = await readState();
ok('left-handed: the look side moves to the left and the scheme is unchanged',
   (l0.mag-l1.mag)>1 && Math.abs(l1.yaw-l0.yaw)>0.05,
   `yaw Δ${Math.abs(l1.yaw-l0.yaw).toFixed(3)} rad, mag ${l0.mag} -> ${l1.mag}`);
await ev(`__game.S.leftHanded=0; __game.applySettings()`); await sleep(250);

console.log('\n=== 4. THE OVERLAY DRAWS THE REAL ZONES ===');
// 41 sample points per configuration, compared against Input.zoneAt() itself
const zoneProbe = `(()=>{const z=BP2.Tutorial.zoneRects(), bad=[];
  const vw=innerWidth, vh=innerHeight;
  for(let i=0;i<=40;i++){
    const x=Math.min(vw-1, Math.round(i*(vw-1)/40));
    const real=__game.Input.zoneAt(x);
    const drawn=(x>=z.move.left && x<z.move.right)? 'move'
              : (x>=z.look.left && x<z.look.right)? 'look' : 'none';
    if(drawn!==real) bad.push({x, real, drawn});
  }
  return {bad:bad.slice(0,5), n:bad.length, z, half:+__game.Input.zoneSplit().toFixed(1),
    vw, vh, lh:__game.S.leftHanded,
    full: Math.abs(Math.min(z.move.left,z.look.left))<1.5 &&
          Math.abs(Math.max(z.move.right,z.look.right)-vw)<1.5 &&
          Math.abs(z.move.bottom-vh)<1.5 && Math.abs(z.look.bottom-vh)<1.5 &&
          Math.abs(z.move.top)<1.5 && Math.abs(z.look.top)<1.5};})()`;

for(const [ow,oh,oname] of [[390,844,'portrait'],[844,390,'landscape']]){
  W=ow; H=oh; await viewport(ow,oh); await ev(`__game.onResize()`); await sleep(350);
  for(const lh of [0,1]){
    await ev(`__game.S.leftHanded=${lh}; __game.applySettings()`);
    await ev(`BP2.Tutorial.showIntro('view','pause')`); await sleep(400);
    const p = await ev(zoneProbe);
    ok(`${oname} ${ow}x${oh} leftHanded=${lh}: every drawn zone matches Input.zoneAt() at 41 sample points`,
       p.n===0, p.n? JSON.stringify(p.bad) : `split ${p.half}, move ${p.z.move.left}-${p.z.move.right}, look ${p.z.look.left}-${p.z.look.right}`);
    ok(`${oname} leftHanded=${lh}: the two rects tile the whole screen with no gap`,
       p.full, JSON.stringify(p.z));
    // the MOVE label must be over the half that actually moves
    const sides = await ev(`(()=>{const z=BP2.Tutorial.zoneRects();
      const mid=x=>x; const mv=(z.move.left+z.move.right)/2, lk=(z.look.left+z.look.right)/2;
      return {moveSays:__game.Input.zoneAt(mv), lookSays:__game.Input.zoneAt(lk),
        moveTitle:document.querySelector('.izone.move .zt').textContent,
        lookTitle:document.querySelector('.izone.look .zt').textContent};})()`);
    ok(`${oname} leftHanded=${lh}: the labels name the side they are drawn on`,
       sides.moveSays==='move' && sides.lookSays==='look' &&
       /(LEFT|RIGHT)/.test(sides.moveTitle) && sides.moveTitle.split('·')[1]!==sides.lookTitle.split('·')[1],
       JSON.stringify(sides));
    await ev(`BP2.Tutorial.hideIntro()`);
  }
}
await ev(`__game.S.leftHanded=0; __game.applySettings()`);
await viewport(390,844); W=390; H=844; await ev(`__game.onResize()`); await sleep(350);

/* CANARY(zones): a deliberately wrong rect must be caught by that probe */
await ev(`BP2.Tutorial.showIntro('view','pause')`); await sleep(350);
await ev(`(()=>{const e=document.querySelector('#introZones .izone.move'); e.style.width=(innerWidth*0.8)+'px'; return 1})()`);
const broken = await ev(zoneProbe);
ok('CANARY(zones): a deliberately mis-drawn rect IS caught', broken.n>0, `${broken.n} mismatches`);
await ev(`BP2.Tutorial.layoutZones()`); await sleep(120);
const fixed = await ev(zoneProbe);
ok('...and re-laying it out puts it back', fixed.n===0, JSON.stringify(fixed.bad));

console.log('\n=== 5. WHAT THE OVERLAY SAYS ===');
const copy = await ev(`(()=>{const t=document.getElementById('introZones').textContent+' '+document.getElementById('introKey').textContent;
  return {text:t.replace(/\\s+/g,' ').trim(), key:document.getElementById('introKey').textContent,
    dots:document.querySelectorAll('#introZones .idot').length,
    pulse:document.querySelectorAll('#introZones .idot.two').length,
    anim:getComputedStyle(document.querySelector('#introZones .idot.two')).animationName,
    cards:document.querySelectorAll('.ccard').length};})()`);
ok('the simultaneity sentence is on the screen, in the headline slot',
   /SAME TIME/i.test(copy.key) && /SECOND FINGER/i.test(copy.key), copy.key);
ok('the overlay explains one finger, two fingers and sprint',
   /ONE FINGER/i.test(copy.text) && /SECOND FINGER/i.test(copy.text) && /SPRINT/i.test(copy.text), copy.text.slice(0,150));
ok('it never tells a twofinger player to double-tap', !/double.?tap/i.test(copy.text), copy.text.slice(0,150));
ok('the second finger is shown, not just described: 3 dots, one of them pulsing',
   copy.dots===3 && copy.pulse===1 && copy.anim==='idotpulse', JSON.stringify(copy));
ok('no card list on touch', copy.cards===0, 'ccards='+copy.cards);
await ev(`BP2.Tutorial.hideIntro()`);

console.log('\n=== 6. THE DRILL TEACHES THE SAME THING ===');
const hintsTF = await ev(`(()=>{__game.S.touchMode='twofinger';return BP2.Tutorial.hints()})()`);
ok('no drill step teaches double-tap firing', !hintsTF.some(h=>/double.?tap/i.test(h)), JSON.stringify(hintsTF));
ok('the FIRE step teaches the second finger', /second finger/i.test(hintsTF[2]), hintsTF[2]);
ok('the MOVE and LOOK steps name the real sides', /left/i.test(hintsTF[0]) && /right/i.test(hintsTF[1]), `${hintsTF[0]} | ${hintsTF[1]}`);
const hintsLH = await ev(`(()=>{__game.S.leftHanded=1;const h=BP2.Tutorial.hints();__game.S.leftHanded=0;return h})()`);
ok('left-handed flips the sides the drill names', /right/i.test(hintsLH[0]) && /left/i.test(hintsLH[1]), `${hintsLH[0]} | ${hintsLH[1]}`);
/* CANARY(hints): the double-tap regex must be able to fire */
const hintsDT = await ev(`(()=>{__game.S.touchMode='doubletap';const h=BP2.Tutorial.hints();__game.S.touchMode='twofinger';return h})()`);
ok('CANARY(hints): choosing DOUBLE-TAP DOES put double-tap back in the hint',
   hintsDT.some(h=>/double.?tap/i.test(h)), hintsDT[2]);

console.log('\n=== 7. BLOCKED localStorage STILL BOOTS ===');
const guard = await send('Page.addScriptToEvaluateOnNewDocument',{source:
  `Object.defineProperty(window,'localStorage',{configurable:true,
     get(){ throw new DOMException('site data blocked','SecurityError'); }});`});
errors.length=0;
await nav();
const blocked = await ev(`(()=>{let threw=false; try{ window.localStorage; }catch(e){ threw=true; }
  return {threw, game:!!window.__game, state:__game&&__game.GAME.state,
    mode:__game&&__game.S.touchMode, sp:BP2.Profile.get().sp, intro:BP2.Tutorial.introVisible(),
    canvas:!!document.querySelector('#app canvas')};})()`);
ok('localStorage really is blocked in this run', blocked.threw, String(blocked.threw));
ok('the game still boots, in memory, on the default scheme',
   blocked.game && blocked.canvas && blocked.intro && blocked.mode==='twofinger' && blocked.sp===0, JSON.stringify(blocked));
ok('no console errors escape the storage guards', errors.length===0, errors.slice(0,3).join(' | '));
await send('Page.removeScriptToEvaluateOnNewDocument',{identifier:guard.result.identifier});
await nav(); await wipe();

await sleep(400);
ok('zero console errors through the whole run', errors.length===0, errors.slice(0,4).join(' | '));

await send('Emulation.clearDeviceMetricsOverride');
await send('Emulation.setTouchEmulationEnabled',{enabled:false});
if(winId && winId.windowId) await send('Browser.setWindowBounds',{windowId:winId.windowId, bounds:winId.bounds});
console.log(`\n${pass} passed, ${fail} failed`+(fail?'  -> '+failed.join(', '):''));
ws.close();
