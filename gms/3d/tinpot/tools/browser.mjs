import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {connect,BASE,sleep} from './cdp.mjs';
const suite=process.argv[2]||'shell',evidence=new URL('../docs/evidence/',import.meta.url).pathname;
const report={date:new Date().toISOString(),suite,tests:[]};
// 0.04.3 — the first grenade in anybody's hand pauses the war for a one-time briefing. Any
// scenario that equips one has to clear it before it can tap the ground again, exactly as a
// player does. `dismissPrimer` is for scenarios where it is incidental; the dedicated gate
// below asserts it hard.
export async function dismissPrimer(p){if(!await p.eval(`document.querySelector('.primer').classList.contains('showing')`))return false;await click(p,'.primer-go');await sleep(150);return true;}
export async function touch(p,x,y){await p.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x,y}]});await p.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await sleep(100);}
export async function click(p,selector){const r=await p.eval(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);await touch(p,r.x,r.y);}
async function scenario(name,fn){const p=await connect();try{await fn(p);report.tests.push({name,passed:true});console.log('PASS',name);}catch(e){report.failedSnapshot=await p.eval('window.tinpot');await p.shot(evidence+suite+'-failure.png');throw e;}finally{await p.close();}}
try{
await scenario('portrait boot',async p=>{await p.goto(BASE+'?test=1',{width:390,height:844,deviceScaleFactor:2,mobile:true});await p.wait('window.__TINPOT_BOOTED__');await sleep(500);assert.equal(await p.eval('document.documentElement.scrollWidth'),390);await p.shot(evidence+(suite==='shell'?'m0-shell.png':suite+'-portrait.png'));assert.deepEqual(p.errors,[]);report.snapshot=await p.eval('tinpot');});
if(suite==='m2')await scenario('real touch walks around trees',async p=>{await p.goto(BASE+'?test=1',{width:390,height:844,deviceScaleFactor:2,mobile:true});await p.wait('window.__TINPOT_BOOTED__');await p.eval("tinpotTest.fixture('m2')");await sleep(100);const target=await p.eval('tinpotTest.project(0,-20)');await touch(p,target.x,target.y);await p.eval('tinpotTest.advance(450)');await p.shot(evidence+'m2-walking.png');const s=await p.eval('tinpotTest.advance(1350)');assert.ok(Math.hypot(s.units[0].x-.5,s.units[0].z+19.5)<.2);await p.shot(evidence+'m2-arrived.png');assert.deepEqual(p.errors,[]);report.walk=s;});
if(suite==='m3')await scenario('automatic firefight and persistent jam',async p=>{await p.goto(BASE+'?test=1',{width:390,height:844,deviceScaleFactor:2,mobile:true});await p.wait('window.__TINPOT_BOOTED__');await p.eval("tinpotTest.fixture('m3')");await sleep(100);const target=await p.eval('tinpotTest.project(0,0)');await touch(p,target.x,target.y);await p.eval('tinpotTest.advance(170)');await p.shot(evidence+'m3-duel.png');const s=await p.eval('tinpotTest.advance(1800)');assert.equal(s.units[1].hp,0);assert.ok(s.units[0].hp>0);await p.shot(evidence+'m3-jam.png');assert.ok((await p.eval('tinpot')).vfx.stains>0);assert.deepEqual(p.errors,[]);report.duel=s;});
if(suite==='m4')await scenario('four cards, hold toggle, minimum one, formation, pause and thumb targets',async p=>{await p.goto(BASE+'?test=1',{width:390,height:844,deviceScaleFactor:2,mobile:true});await p.wait('window.__TINPOT_BOOTED__');await p.eval("tinpotTest.fixture('m4')");await sleep(100);for(let i=1;i<4;i++)await click(p,`.unit-toggle[data-id="${i}"]`);await click(p,'.unit-toggle[data-id="0"]');assert.equal((await p.eval('tinpot')).units.filter(u=>u.team==='blue'&&u.active).length,1);const held=(await p.eval('tinpot')).units[1];const target=await p.eval('tinpotTest.project(0,7)');await touch(p,target.x,target.y);await p.eval('tinpotTest.advance(150)');await p.shot(evidence+'m4-hold.png');const now=await p.eval('tinpot');assert.equal(now.units[1].x,held.x);assert.equal(now.units[1].z,held.z);for(let i=1;i<4;i++)await click(p,`.unit-toggle[data-id="${i}"]`);await touch(p,target.x,target.y);await p.eval('tinpotTest.advance(400)');await p.shot(evidence+'m4-squad.png');await click(p,'.pause');const t=await p.eval('tinpot.time');await sleep(300);assert.equal(await p.eval('tinpot.time'),t);await click(p,'.pause');const rects=await p.eval(`[...document.querySelectorAll('#hud button')].map(b=>{const r=b.getBoundingClientRect();return {w:r.width,h:r.height,x:r.x,y:r.y,right:r.right,bottom:r.bottom}})`);for(const r of rects){assert.ok(r.w>=44&&r.h>=44,JSON.stringify(r));assert.ok(r.x>=0&&r.y>=0&&r.right<=390&&r.bottom<=844);}assert.deepEqual(p.errors,[]);report.controls=rects;});
if(suite==='m5')await scenario('grenade touch, fire spread, mixed weapons and new terrain',async p=>{await p.goto(BASE+'?test=1',{width:390,height:844,deviceScaleFactor:2,mobile:true});await p.wait('window.__TINPOT_BOOTED__');await p.eval("tinpotTest.fixture('m5')");await sleep(100);await click(p,'.pip[data-id="0"][data-weapon="grenade"]');await sleep(150);await dismissPrimer(p);assert.equal((await p.eval('tinpot')).units[0].weapon,'grenade');assert.equal((await p.eval('tinpot')).units[1].weapon,'rifle');const target=await p.eval('tinpotTest.project(-7,12)');await touch(p,target.x,target.y);await p.eval('tinpotTest.advance(30)');
 // V3.4: a grenade tap ARMS. Nothing is in the air for the first ARM_SECONDS, and that is the
 // point — the harness waits for the real clock rather than the assertion being relaxed.
 let st=await p.eval('tinpotTest.advance(0)');
 assert.ok(st.armed,'the grenade tap must arm, not throw: '+JSON.stringify(st.armed));
 // Grenadiers auto-lob at anything inside 16 m and a grenade is no longer taken off a man who
 // did that (D36), so the honest negative control is that nothing has been thrown AT THE POINT
 // HE TAPPED — not that the sky is empty. Same reading as the teach suite.
 assert.ok(!st.grenadeTargets.some(g=>Math.hypot(g.tx+7,g.tz-12)<2.5),'negative control: nothing has been thrown at the marker during the arming window: '+JSON.stringify(st.grenadeTargets));
 await p.shot(evidence+'m5-armed.png');
 for(let i=0;i<16&&st.armed;i++)st=await p.eval('tinpotTest.advance(30)');
 assert.equal(st.armed,null,'the armed order must resolve itself into a throw');
 // `window.tinpot` is written on the next rAF, and `advance()` does not wait for one — so read
 // the weapon off the snapshot `advance` returned, not off the previous frame.
 assert.equal(st.units.find(u=>u.id===0).weapon,'rifle','0.04.4: throwing it puts the rifle back in his hands: '+JSON.stringify(st.units.filter(u=>u.team==='blue').map(u=>u.weapon)));
 await p.shot(evidence+'m5-lob.png');await p.eval('tinpotTest.advance(180)');await p.shot(evidence+'m5-fire.png');const first=await p.eval('tinpot.burned');assert.ok(first>0);await p.eval('tinpotTest.advance(500)');await p.shot(evidence+'m5-scar.png');assert.ok(await p.eval('tinpot.burned')>first);await click(p,'.rail-button[data-weapon="grenade"]');assert.ok((await p.eval('tinpot')).units.filter(u=>u.team==='blue').every(u=>u.weapon==='grenade'));await click(p,'.rail-button[data-weapon="rifle"]');assert.ok((await p.eval('tinpot')).units.filter(u=>u.team==='blue').every(u=>u.weapon==='rifle'));assert.deepEqual(p.errors,[]);report.burn=await p.eval('tinpot');});
if(suite==='v1')await scenario('fire hurts, men catch light, and the frame shows it',async p=>{await p.goto(BASE+'?test=1',{width:390,height:844,deviceScaleFactor:2,mobile:true});await p.wait('window.__TINPOT_BOOTED__');await p.eval("tinpotTest.fixture('m5')");await sleep(120);
 const hp=s=>s.units.filter(u=>u.team==='blue').reduce((a,u)=>a+u.hp,0);
 const before=await p.eval('tinpotTest.advance(0)');
 assert.equal(await p.eval('tinpotTest.heat(0,6)'),0,'negative control: the meadow is not on fire yet');
 await p.eval('tinpotTest.torch(0,6,2.8,11)');await p.eval('tinpotTest.advance(20)');
 assert.ok(await p.eval('tinpotTest.heat(0,6)')>.5,'the patch is burning');
 assert.ok((await p.eval('tinpotTest.advance(0)')).fires>0,'and the renderer has something to draw');
 let lit=0,seen=null;
 for(let i=0;i<9;i++){await p.eval('tinpotTest.move(0,2)');const s=await p.eval('tinpotTest.advance(28)');lit=Math.max(lit,s.alight);if(s.alight>0&&!seen){seen=s;await p.shot(evidence+'v1-men-on-fire.png');}}
 assert.ok(lit>0,'marching the squad through a fire must set at least one of them alight');
 const after=await p.eval('tinpotTest.advance(0)');
 assert.ok(hp(after)<hp(before)-20,'and it must cost real health: '+hp(before)+' -> '+hp(after));
 await p.shot(evidence+'v1-burning-meadow.png');
 // Once it is out the same ground is free. Charred is safe; that is the whole mechanic.
 for(let i=0;i<18;i++)await p.eval('tinpotTest.advance(60)');
 assert.equal((await p.eval('tinpotTest.advance(0)')).fires,0,'the ground fire burns itself out');
 assert.equal(await p.eval('tinpotTest.heat(0,6)'),0,'charred ground is cold');
 const cold=await p.eval('tinpotTest.advance(0)');await p.eval('tinpotTest.move(0,6)');await p.eval('tinpotTest.advance(240)');
 const walked=await p.eval('tinpotTest.advance(0)');
 assert.equal(hp(walked),hp(cold),'walking over the cold scar costs nothing');
 await p.shot(evidence+'v1-cold-scar.png');
 assert.deepEqual(p.errors,[]);report.fire={lit,hpBefore:hp(before),hpAfter:hp(after)};});
if(suite==='v3')await scenario('flamer: a cone, a fire, and a danger to its owner',async p=>{await p.goto(BASE+'?test=1',{width:390,height:844,deviceScaleFactor:2,mobile:true});await p.wait('window.__TINPOT_BOOTED__');await p.eval("tinpotTest.fixture('m5')");await sleep(120);
 assert.equal((await p.eval('tinpotTest.advance(0)')).equipped.length,3,'three weapons, three rail buttons, three pips');
 const rail=await p.eval(`[...document.querySelectorAll('.rail-button')].map(b=>b.dataset.weapon)`);
 assert.deepEqual(rail,['flamer','grenade','rifle'],'the rail climbs the left edge: '+JSON.stringify(rail));
 await click(p,'.rail-button[data-weapon="flamer"]');
 assert.ok((await p.eval('tinpotTest.advance(0)')).units.filter(u=>u.team==='blue').every(u=>u.weapon==='flamer'),'one rail tap arms the whole squad');
 let s=await p.eval('tinpotTest.advance(0)');
 const enemy=s.units.filter(u=>u.team==='red'&&u.hp>0).sort((a,b)=>b.z-a.z)[0];
 assert.ok(enemy,'negative control: there is somebody to burn');
 for(let i=0;i<14&&s.units.some(u=>u.team==='red'&&u.hp>0);i++){await p.eval(`tinpotTest.move(${enemy.x.toFixed(2)},${(enemy.z+3).toFixed(2)})`);s=await p.eval('tinpotTest.advance(40)');if(s.fires>0&&!report.shotFlame){report.shotFlame=true;await p.shot(evidence+'v3-flame-cone.png');}}
 assert.ok(report.shotFlame,'the flamer must leave burning ground');
 assert.ok(s.units.filter(u=>u.team==='red'&&u.hp<=0).length>0,'and it must kill somebody');
 await p.shot(evidence+'v3-aftermath.png');
 assert.deepEqual(p.errors,[]);report.flamer={burned:s.burned,fires:s.fires,losses:s.units.filter(u=>u.team==='blue'&&u.hp<=0).length};});
if(suite==='v4')await scenario('three kinds of enemy, telling them apart from up here',async p=>{await p.goto(BASE+'?test=1',{width:390,height:844,deviceScaleFactor:2,mobile:true});await p.wait('window.__TINPOT_BOOTED__');await p.eval("tinpotTest.fixture('m4')");await sleep(120);
 const s=await p.eval('tinpotTest.lineup(2)');
 const kinds=s.units.filter(u=>u.team==='red').map(u=>[u.kind,u.hp,u.speed,u.armour,u.weapon]);
 assert.deepEqual(kinds.map(k=>k[0]),['grunt','heavy','rusher']);
 assert.ok(kinds[1][1]>kinds[0][1]*2&&kinds[1][2]<kinds[0][2]&&kinds[1][3]>.3,'the heavy is fat, slow and armoured: '+JSON.stringify(kinds[1]));
 assert.ok(kinds[2][1]<kinds[0][1]&&kinds[2][2]>kinds[0][2]*2&&kinds[2][4]==='bayonet','the rusher is thin, fast and has to reach you: '+JSON.stringify(kinds[2]));
 await p.eval('tinpotTest.advance(6)');await sleep(120);
 await p.shot(evidence+'v4-lineup.png');
 // They also have to be different sizes on screen, not just in the numbers.
 const sizes=await p.eval('tinpotTest.actorSizes()');const heights=[400,401,402].map(id=>sizes[id]);
 assert.ok(heights[1].w>heights[0].w*1.15,'the heavy must read bigger: '+JSON.stringify(heights));
 assert.ok(heights[2].w<heights[0].w*.92,'and the rusher smaller: '+JSON.stringify(heights));
 assert.deepEqual(p.errors,[]);report.kinds={kinds,heights};});
if(suite==='v6')await scenario('juice: a flinch, a buzz and a telegram for a named man',async p=>{await p.goto(BASE+'?test=1',{width:390,height:844,deviceScaleFactor:2,mobile:true});await p.wait('window.__TINPOT_BOOTED__');await p.eval("tinpotTest.fixture('campaign')");await sleep(150);
 const start=await p.eval('tinpotTest.advance(0)');
 assert.equal(start.eulogy,null,'negative control: no telegram before anybody dies');
 assert.equal(await p.eval(`getComputedStyle(document.querySelector('.eulogy')).opacity`),'0','and it is invisible');
 // Hit feedback: a hit event must reach the renderer and put particles in the air.
 const point=await p.eval('tinpotTest.project(0,-7)');await touch(p,point.x,point.y);
 let hits=0;for(let i=0;i<60&&!hits;i++){await p.eval('tinpotTest.advance(60)');hits=await p.eval(`tinpot.units.filter(u=>u.hurt!==undefined).length`);}  // 12 was flaky: 1 fail in 3, the squad has to close the distance first. Still bounded, still a real assertion.
 assert.ok(hits>0,'somebody must actually get hit');
 assert.ok((await p.eval('tinpot.vfx.particles'))>0,'and it must put claret in the air');
 await p.shot(evidence+'v6-hit.png');
 // Now lose a named man on purpose and watch the telegram arrive.
 await p.eval("tinpotTest.fixture('m4')");await sleep(120);
 const before=await p.eval('tinpotTest.advance(0)');const name=before.units.find(u=>u.team==='blue').name;
 await p.eval('tinpotTest.smite(1)');await p.eval('tinpotTest.advance(1)');await sleep(140);
 const s=await p.eval('window.tinpot');
 assert.ok(s.eulogy,'a named man gets a telegram: '+JSON.stringify(s.eulogy));
 assert.equal(s.eulogy.name,name);
 assert.equal(await p.eval(`document.querySelector('.eulogy').classList.contains('showing')`),true);
 const box=await p.eval(`(()=>{const r=document.querySelector('.eulogy').getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,bottom:r.bottom,pe:getComputedStyle(document.querySelector('.eulogy')).pointerEvents}})()`);
 assert.equal(box.pe,'none','the telegram must never eat a tap');
 assert.ok(box.bottom<844*.42,'and must stay in the top edge strip, not over the battlefield: '+JSON.stringify(box));
 await p.shot(evidence+'v6-telegram.png');
 assert.ok(s.haptics,'haptics are wired');report.juice={hits,haptics:s.haptics,eulogy:s.eulogy,box};
 assert.deepEqual(p.errors,[]);});
if(suite==='m6')await scenario('campaign victory, promotions, sandbags and reload',async p=>{await p.goto(BASE+'?test=1',{width:390,height:844,deviceScaleFactor:2,mobile:true});await p.wait('window.__TINPOT_BOOTED__');await p.eval("tinpotTest.fixture('campaign')");await sleep(150);const point=await p.eval('tinpotTest.project(0,-7)');await touch(p,point.x,point.y);for(let i=0;i<25;i++){const s=await p.eval('tinpotTest.advance(120)');if(s.mode==='debrief')break;}assert.equal((await p.eval('tinpotTest.advance(0)')).mode,'debrief');assert.equal((await p.eval('tinpot')).mission.status,'victory');await p.shot(evidence+'m6-victory.png');await click(p,'[data-action="next"]');await click(p,'[data-action="briefing"]');await click(p,'[data-action="deploy"]');assert.equal((await p.eval('tinpot')).units.filter(u=>u.team==='blue').length,2);assert.equal(await p.eval('tinpot.fortified'),true);await p.shot(evidence+'m6-dig-in.png');await p.eval('tinpotTest.advance(90);tinpotTest.save()');const before=await p.eval('tinpotTest.advance(0)');await p.goto(BASE+'?test=1',{width:390,height:844,deviceScaleFactor:2,mobile:true});await p.wait('window.__TINPOT_BOOTED__');await click(p,'[data-action="start"]');const after=await p.eval('tinpotTest.advance(0)');assert.equal(after.mission.id,1);assert.equal(after.campaign.roster[0].xp,1);assert.ok(after.time>=before.time&&after.time<before.time+2);await p.shot(evidence+'m6-resumed.png');assert.deepEqual(p.errors,[]);report.campaign=after;});
if(suite==='m7')await scenario('earned upgrades, assignment and briefing',async p=>{await p.goto(BASE+'?test=1',{width:390,height:844,deviceScaleFactor:2,mobile:true});await p.wait('window.__TINPOT_BOOTED__');await p.eval("tinpotTest.fixture('campaign')");await sleep(100);const point=await p.eval('tinpotTest.project(0,-7)');await touch(p,point.x,point.y);await p.eval('tinpotTest.advance(2800)');await p.shot(evidence+'m7-earned.png');await click(p,'[data-action="next"]');await p.shot(evidence+'m7-barracks.png');await click(p,'[data-action="buy"][data-id="armour"]');assert.equal((await p.eval('tinpotTest.advance(0)')).campaign.credits,10);await click(p,'[data-action="assign-open"][data-slot="0"]');await click(p,'[data-action="assign"][data-id="1"]');await p.shot(evidence+'m7-assigned.png');await click(p,'[data-action="briefing"]');await p.shot(evidence+'m7-briefing.png');await click(p,'[data-action="deploy"]');const s=await p.eval('tinpotTest.advance(0)');assert.equal(s.units[0].name,'Pvt. Spud');assert.equal(s.units[0].maxHp,125);assert.deepEqual(p.errors,[]);report.equipment=s;});
if(suite==='m8')await scenario('live title, supplied music, settings and deploy',async p=>{await p.goto(BASE+'?test=1',{width:390,height:844,deviceScaleFactor:2,mobile:true});await p.wait('window.__TINPOT_BOOTED__');await p.eval("tinpotTest.fixture('title')");await sleep(300);const a=await p.eval('tinpotTest.advance(120)');await p.shot(evidence+'m8-title.png');const b=await p.eval('tinpotTest.advance(240)');assert.ok(b.units.some((u,i)=>u.hp!==a.units[i]?.hp||u.x!==a.units[i]?.x),'title sim must actually fight');await p.shot(evidence+'m8-title-battle.png');await click(p,'[data-action="settings"]');await sleep(1200);await p.shot(evidence+'m8-settings.png');const audio=await p.eval('tinpot.audio');assert.equal(audio.unlocked,true);assert.ok(audio.voices.some(v=>v.time>0&&!v.paused&&v.ready>=2));await p.eval(`(()=>{const r=document.querySelector('[data-volume="music"]');r.value=.2;r.dispatchEvent(new Event('input',{bubbles:true}));})()`);assert.equal((await p.eval('tinpotTest.advance(0)')).audio.settings.music,.2);await click(p,'[data-action="settings-close"]');await click(p,'[data-action="start"]');await p.shot(evidence+'m8-orders.png');await click(p,'[data-action="deploy"]');const point=await p.eval('tinpotTest.project(0,-7)');await touch(p,point.x,point.y);await sleep(3000);await p.shot(evidence+'m8-playing.png');assert.equal((await p.eval('tinpotTest.advance(0)')).mode,'battle');assert.deepEqual(p.errors,[]);report.audio=await p.eval('tinpot.audio');});
if(suite==='art')await scenario('camera is 16 deg off vertical and the frame can show it',async p=>{await p.goto(BASE+'?test=1',{width:390,height:844,deviceScaleFactor:2,mobile:true});await p.wait('window.__TINPOT_BOOTED__');await p.eval("tinpotTest.fixture('art');tinpotTest.advance(180);tinpotTest.freeze()");await sleep(250);const tilt=await p.eval('tinpotTest.tilt()');report.tilt=tilt;
console.log(`  camera ${tilt.pitchDegrees} deg off vertical, fov ${tilt.fov}, height ${tilt.cameraHeight} m`);
console.log(`  tan(pitch)=${tilt.worldOffsetPerMetre} (16 deg => 0.287); ${tilt.count} trees in frame`);
console.log(`  canopy-vs-trunk-base screen separation: min ${tilt.minPx} px, median ${tilt.medianPx} px, ${(tilt.fractionUpScreen*100).toFixed(0)}% up-screen`);
assert.ok(Math.abs(tilt.pitchDegrees-16)<1,'camera pitch must be ~16 deg off vertical; got '+tilt.pitchDegrees);
assert.ok(Math.abs(tilt.worldOffsetPerMetre-.287)<.02,'tan(pitch) must be ~0.287; got '+tilt.worldOffsetPerMetre);
assert.ok(tilt.count>=10,'need at least 10 trees in frame to measure; got '+tilt.count);
assert.ok(tilt.medianPx>15,'the median canopy must sit well clear of its own trunk base on screen; got '+tilt.medianPx+' px');
// Not 100%: the camera sits at z=+22.5, so the handful of trees BEYOND it project the other way.
// That flip is the perspective, not a bug — everything in the playable frame goes one way.
assert.ok(tilt.fractionUpScreen>=.9,'canopies must be displaced up-screen almost everywhere; got '+tilt.fractionUpScreen);
const spread=tilt.samples.map(s=>s.pxPerMetre),ratio=Math.max(...spread)/Math.min(...spread);
console.log(`  foreshortening gradient near-to-far: ${ratio.toFixed(2)}x (1.0 would be orthographic)`);
assert.ok(ratio>2,'a near tree and a far tree must foreshorten differently; ratio '+ratio.toFixed(2));
await p.shot(evidence+'m1b-portrait.png');assert.deepEqual(p.errors,[]);report.snapshot=await p.eval('tinpot');});

// ---------------------------------------------------------------- V3 the teaching moments
// Aaron's one structural complaint after playing it: the opening minute teaches nothing. Each
// scenario below checks the lesson APPEARS, is legible, never covers the battlefield, never eats
// a tap, and — the part that matters most — RETIRES once he has demonstrated the skill.
if(suite==='teach'){
 const box=async(p,sel)=>p.eval(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;const r=e.getBoundingClientRect(),c=getComputedStyle(e);return {x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom,pe:c.pointerEvents,opacity:+c.opacity,text:e.textContent}})()`);

 await scenario('mission one: the tap is taught, shown as a ripple, and then never mentioned again',async p=>{
  await p.goto(BASE+'?test=1',{width:390,height:844,deviceScaleFactor:2,mobile:true});await p.wait('window.__TINPOT_BOOTED__');
  await p.eval("tinpotTest.fixture('campaign')");await sleep(200);
  const card=await box(p,'.coach');
  assert.ok(card&&card.opacity>.9,'the first thing on screen must be the instruction: '+JSON.stringify(card));
  assert.match(card.text,/Tap to move to location/,'in Aaron\'s own words: '+card.text);
  assert.equal(card.pe,'none','a teaching card must never eat a tap');
  assert.ok(card.x>=0&&card.right<=390&&card.y>=0,'on screen: '+JSON.stringify(card));
  assert.ok(card.bottom<844*.42,'and in the top edge strip, never over the battlefield: '+card.bottom);
  await p.shot(evidence+'v3-coach-move.png');
  assert.equal((await p.eval('tinpotTest.taught()')).move,undefined,'negative control: nothing learned yet');
  const point=await p.eval('tinpotTest.project(0,-2)');await touch(p,point.x,point.y);
  assert.ok((await p.eval('tinpot.vfx.ripples'))>0,'the tap must leave a visible ripple');
  await p.shot(evidence+'v3-ripple.png');
  assert.equal((await p.eval('tinpotTest.taught()')).move,true,'tapping the ground teaches it');
  await p.eval('tinpotTest.advance(60)');await sleep(250);
  assert.equal(await p.eval(`document.querySelector('.coach').classList.contains('showing')`),false,'and the card retires itself');
  assert.ok((await p.eval('tinpot')).units.filter(u=>u.team==='blue')[0].path>0||(await p.eval('tinpot')).target,'the tap also actually moved him');
  report.move=card;assert.deepEqual(p.errors,[]);});

 await scenario('mission one: twenty seconds of doing nothing costs a beginner nothing',async p=>{
  await p.goto(BASE+'?test=1',{width:390,height:844,deviceScaleFactor:2,mobile:true});await p.wait('window.__TINPOT_BOOTED__');
  let s=await p.eval("tinpotTest.fixture('campaign')");await sleep(150);
  const full=s.units.filter(u=>u.team==='blue').map(u=>u.maxHp);
  assert.ok(s.units.filter(u=>u.team==='red').every(u=>u.holds),'the enemy line is parked');
  for(let i=0;i<20;i++)s=await p.eval('tinpotTest.advance(60)');
  assert.ok(s.time>=20,'twenty seconds really elapsed: '+s.time.toFixed(1));
  assert.deepEqual(s.units.filter(u=>u.team==='blue').map(u=>u.hp),full,'an idle player must survive mission one untouched');
  assert.equal(s.mode,'battle','and the mission has not resolved itself either');
  await p.shot(evidence+'v3-idle-20s.png');
  report.idle={time:s.time,hp:s.units.filter(u=>u.team==='blue').map(u=>u.hp)};assert.deepEqual(p.errors,[]);});

 await scenario('the grenade arms: a marker, a countdown, a reach ring, and only the marker cancels it',async p=>{
  await p.goto(BASE+'?test=1',{width:390,height:844,deviceScaleFactor:2,mobile:true});await p.wait('window.__TINPOT_BOOTED__');
  await p.eval("tinpotTest.mission(2,0)");await sleep(200);
  let s=await p.eval('tinpotTest.advance(0)');
  assert.ok(s.equipped.includes('grenade'),'mission three issues grenades: '+JSON.stringify(s.equipped));
  // By mission three he has long since learned to walk, so retire that card the way he would.
  const first=await p.eval('tinpotTest.project(0,4)');await touch(p,first.x,first.y);await sleep(150);
  assert.match((await box(p,'.coach')).text,/Hand out the grenades/,'and says so before he has any');
  await p.shot(evidence+'v3-coach-grenade-kit.png');
  await click(p,'.rail-button[data-weapon="grenade"]');
  s=await p.eval('tinpotTest.advance(6)');
  assert.ok(s.markers.reach,'selecting the grenade must briefly show its reach');
  await p.shot(evidence+'v3-reach-ring.png');
  // 0.04.3: the arm/cancel/move lesson is no longer a card he can play through. The first
  // grenade in anybody's hand stops the war and explains it, once, ever.
  await sleep(200);
  assert.equal(await p.eval('tinpot.primer'),true,'the first grenade must pause the war to explain itself');
  assert.equal(await p.eval('tinpotTest.advance(0).paused'),true,'and it really is paused');
  const brief=await box(p,'.primer-card');
  assert.match(brief.text,/One tap arms it/,'the briefing leads with arming: '+brief.text);
  assert.match(brief.text,/called off/,'covers cancelling');
  assert.match(brief.text,/falls short/,'and covers walking away from it');
  assert.equal(await p.eval(`document.querySelector('.coach').classList.contains('showing')`),false,'and it replaces the old floating card rather than adding to it');
  await p.shot(evidence+'v4-grenade-primer.png');
  await click(p,'.primer-go');await sleep(220);
  assert.equal(await p.eval('tinpot.primer'),false,'one tap dismisses it');
  assert.equal(await p.eval('tinpotTest.advance(0).paused'),false,'and the war resumes');
  const lead=s.units.find(u=>u.team==='blue'&&u.hp>0);
  const spot={x:+(lead.x+1).toFixed(2),z:+(lead.z-9).toFixed(2)};
  let pt=await p.eval(`tinpotTest.project(${spot.x},${spot.z})`);await touch(p,pt.x,pt.y);
  s=await p.eval('tinpotTest.advance(6)');
  assert.ok(s.armed,'the tap arms rather than throws');
  // Grenadiers still auto-lob at whatever wanders into range, so the honest assertion is that
  // nothing is in the air aimed at the point he TAPPED, not that the sky is empty.
  const near=g=>Math.hypot(g.tx-spot.x,g.tz-spot.z)<2.5;
  assert.ok(!s.grenadeTargets.some(near),'negative control: nothing has been thrown at the marker yet: '+JSON.stringify(s.grenadeTargets));
  assert.ok(s.markers.armed,'and there is a marker on the ground to look at');
  // 0.04.1: the armed readout TAKES OVER the mission banner. It does not add a card over the
  // grass, which is exactly what Aaron complained about.
  const armedCard=await box(p,'.armed-panel');
  assert.match(armedCard.text,/GRENADE ARMED/,'the countdown is legible: '+armedCard.text);
  const hdr=await box(p,'.mission-header');
  assert.ok(armedCard.y>=hdr.y-1&&armedCard.bottom<=hdr.bottom+1,'and it lives INSIDE the mission banner: '+JSON.stringify([armedCard,hdr]));
  assert.ok(hdr.bottom<844*.18,'which keeps the whole armed state in the top edge strip: '+hdr.bottom);
  assert.equal(await p.eval(`document.querySelector('.mission-header').classList.contains('armed')`),true,'and the banner reads as urgent');
  assert.equal(await p.eval(`document.querySelector('.coach').classList.contains('showing')`),false,'nothing floats over the battlefield while a grenade is armed');
  assert.equal(await p.eval(`getComputedStyle(document.querySelector('.banner-text')).display`),'none','the objective gives up its space rather than new space being taken');
  await p.shot(evidence+'v3-armed.png');
  // Tapping elsewhere marches the squad and does NOT call it off. This is the asymmetry.
  const away=await p.eval(`tinpotTest.project(${(lead.x).toFixed(2)},${(lead.z+5).toFixed(2)})`);await touch(p,away.x,away.y);
  s=await p.eval('tinpotTest.advance(6)');
  assert.ok(s.armed,'tapping elsewhere must NOT cancel an armed grenade');
  assert.ok(s.units.some(u=>u.team==='blue'&&u.path>0),'it marches the squad instead');
  // Tapping the marker itself is the deliberate cancel.
  pt=await p.eval(`tinpotTest.project(${s.armed.x},${s.armed.z})`);await touch(p,pt.x,pt.y);
  s=await p.eval('tinpotTest.advance(6)');
  assert.equal(s.armed,null,'a tap on the marker calls it off');
  assert.equal(s.markers.armed,false,'and the marker goes with it');
  s=await p.eval('tinpotTest.advance(300)');
  assert.ok(!s.grenadeTargets.some(near),'nothing is in the air aimed at the cancelled marker');
  assert.ok(!s.explosions.some(e=>Math.hypot(e.x-spot.x,e.z-spot.z)<2.5),'and nothing ever went off there: '+JSON.stringify(s.explosions));
  await p.shot(evidence+'v3-cancelled.png');
  assert.equal((await p.eval('tinpotTest.taught()')).grenade,true,'arming one teaches it');
  report.grenade={armedCard};assert.deepEqual(p.errors,[]);});

 await scenario('walk away from your own grenade and it falls short, visibly, before it lands',async p=>{
  await p.goto(BASE+'?test=1',{width:390,height:844,deviceScaleFactor:2,mobile:true});await p.wait('window.__TINPOT_BOOTED__');
  await p.eval("tinpotTest.mission(2,0)");await sleep(200);
  await click(p,'.rail-button[data-weapon="grenade"]');await sleep(180);
  assert.equal(await dismissPrimer(p),true,'the briefing is in the way the first time, as designed');
  let s=await p.eval('tinpotTest.advance(4)');
  const lead=s.units.find(u=>u.team==='blue'&&u.hp>0);
  const spot={x:+lead.x.toFixed(2),z:+(lead.z-15.5).toFixed(2)};        // right on the edge of his reach
  const pt=await p.eval(`tinpotTest.project(${spot.x},${spot.z})`);await touch(p,pt.x,pt.y);
  s=await p.eval('tinpotTest.advance(4)');await sleep(150);
  assert.ok(s.armed,'armed at the limit of his reach');
  assert.ok(!(await box(p,'.armed-panel')).text.match(/fall short/i),'negative control: while he is still in range the banner does not say so');
  assert.equal(await p.eval(`document.querySelector('.mission-header').classList.contains('short')`),false,'negative control: the banner is not cold yet');
  await p.eval(`tinpotTest.move(${lead.x.toFixed(2)},${(lead.z+7).toFixed(2)})`);   // and now he walks away from it
  s=await p.eval('tinpotTest.advance(80)');await sleep(180);   // the HUD is written on the next rAF
  assert.ok(s.armed,'marching did not cancel it');
  const warned=await box(p,'.armed-panel');
  assert.match(warned.text,/fall short/i,'and the banner warns him BEFORE it goes: '+warned.text);
  assert.equal(await p.eval(`document.querySelector('.mission-header').classList.contains('short')`),true,'the banner goes cold with the marker');
  const warnBox=await box(p,'.mission-header');
  assert.ok(warnBox.bottom<844*.18,'0.04.1: the warning is in the banner, not over the battlefield: '+warnBox.bottom);
  await p.shot(evidence+'v3-falls-short-warning.png');
  for(let i=0;i<20&&s.armed;i++)s=await p.eval('tinpotTest.advance(20)');
  assert.equal(s.armed,null,'it still went');
  const landed=s.grenadeTargets.map(g=>({g,d:Math.hypot(g.tx-spot.x,g.tz-spot.z)})).sort((a,b)=>a.d-b.d)[0];
  assert.ok(landed,'something is in the air: '+JSON.stringify(s.grenadeTargets));
  assert.ok(landed.d>3,'it fell short of the marker rather than teleporting to it: '+landed.d.toFixed(2)+' m short');
  // All four active grenadiers throw, each from where HE is standing, so measure against the
  // nearest of them. 1.4 m of slack because they are still walking when the snapshot is taken.
  const crew=s.units.filter(u=>u.team==='blue'&&u.hp>0);
  const reach=Math.min(...crew.map(u=>Math.hypot(landed.g.tx-u.x,landed.g.tz-u.z)));
  assert.ok(reach<=17.4,'and it went no further than a man can throw: '+reach.toFixed(2)+' m');
  await p.shot(evidence+'v3-falls-short.png');
  report.short={fellShortBy:+landed.d.toFixed(2)};assert.deepEqual(p.errors,[]);});

 await scenario('mission two: the split is taught with an arrow, and retires once he has done it',async p=>{
  await p.goto(BASE+'?test=1',{width:390,height:844,deviceScaleFactor:2,mobile:true});await p.wait('window.__TINPOT_BOOTED__');
  await p.eval("tinpotTest.mission(1,0)");await sleep(200);
  const point=await p.eval('tinpotTest.project(0,2)');await touch(p,point.x,point.y);await sleep(200);  // retire the move card first
  let card=await box(p,'.coach');
  assert.match(card.text,/Leave one man holding/,'mission two teaches the card toggle: '+card.text);
  assert.ok(card.bottom<844*.42,'top strip: '+card.bottom);
  const arrow=await box(p,'.card-arrow');
  assert.ok(arrow&&arrow.w>0,'and an arrow points at a helmet card');
  assert.equal(arrow.pe,'none','the arrow never eats the tap it is asking for');
  const cards=await p.eval(`(()=>{const r=document.querySelector('.unit-cards').getBoundingClientRect();return {top:r.top,bottom:r.bottom}})()`);
  assert.ok(arrow.bottom<=cards.top+2&&arrow.top===undefined||arrow.y>cards.top-60,'it sits just above the cards: '+JSON.stringify([arrow,cards]));
  await p.shot(evidence+'v3-coach-split.png');
  const id=await p.eval(`document.querySelector('.unit-card.coached .unit-toggle').dataset.id`);
  await click(p,`.unit-toggle[data-id="${id}"]`);await sleep(200);
  assert.equal((await p.eval('tinpotTest.advance(0)')).split,1,'one man is now holding');
  card=await box(p,'.coach');
  assert.match(card.text,/bring him back/,'and the lesson moves on to rejoining: '+card.text);
  await p.shot(evidence+'v3-coach-rejoin.png');
  await click(p,`.unit-toggle[data-id="${id}"]`);await p.eval('tinpotTest.advance(4)');await sleep(250);
  assert.equal((await p.eval('tinpotTest.taught()')).split,true,'splitting and rejoining teaches it');
  assert.equal(await p.eval(`document.querySelector('.coach').classList.contains('showing')`),false,'and the card retires');
  assert.equal(await p.eval(`!!document.querySelector('.card-arrow')`),false,'so does the arrow');
  assert.deepEqual(p.errors,[]);});

 await scenario('the barracks points at the first upgrade he can afford, until he buys one',async p=>{
  await p.goto(BASE+'?test=1',{width:390,height:844,deviceScaleFactor:2,mobile:true});await p.wait('window.__TINPOT_BOOTED__');
  await p.eval("tinpotTest.fixture('campaign')");await sleep(120);
  const point=await p.eval('tinpotTest.project(0,-7)');await touch(p,point.x,point.y);
  let s;for(let i=0;i<40;i++){s=await p.eval('tinpotTest.advance(120)');if(s.mode==='debrief')break;}
  assert.equal(s.mode,'debrief',JSON.stringify(s.mission));
  assert.equal(s.mission.status,'victory');
  assert.equal(await p.eval(`document.querySelector('[data-action="next"]').textContent`),'Next mission →','V3.5: the joke that did not land is gone');
  await click(p,'[data-action="next"]');await sleep(150);
  const arrow=await box(p,'.shop-item.coached .coach-arrow');
  assert.ok(arrow&&arrow.w>0,'an arrow points at the first affordable upgrade');
  assert.equal(arrow.pe,'none');
  const words=await box(p,'.shop-coach');
  assert.match(words.text,/Tap to upgrade units\?/,'with the words Aaron asked for: '+words.text);
  const shop=await box(p,'.shop-item.coached');
  assert.ok(shop.x>=0&&shop.right<=390&&shop.bottom<=844,'and nothing is pushed off an edge: '+JSON.stringify(shop));
  await p.shot(evidence+'v3-upgrade-arrow.png');
  await click(p,'.shop-item.coached');await sleep(150);
  assert.equal(await p.eval(`!!document.querySelector('.coach-arrow')`),false,'buying anything retires it');
  assert.equal((await p.eval('tinpotTest.taught()')).upgrade,true);
  await p.shot(evidence+'v3-upgrade-bought.png');
  assert.deepEqual(p.errors,[]);});

 await scenario('the coaching fits three phone widths without covering anything that matters',async p=>{
  await p.goto(BASE+'?test=1',{width:390,height:844,deviceScaleFactor:2,mobile:true});await p.wait('window.__TINPOT_BOOTED__');
  report.widths=[];
  for(const [width,height] of [[320,740],[390,844],[430,932]]){
   await p.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:2,mobile:true});
   await p.eval("tinpotTest.mission(1,0)");await sleep(220);
   const move=await box(p,'.coach');
   assert.ok(move&&move.opacity>.9,'a card at '+width+': '+JSON.stringify(move));
   assert.ok(move.x>=0&&move.right<=width+.1&&move.y>=0,'on screen at '+width+': '+JSON.stringify(move));
   assert.ok(move.bottom<height*.42,'top edge strip at '+width+': '+move.bottom+' of '+height);
   // It must clear the rail and the cards, and it must not block the pause button either.
   const furniture=await p.eval(`(()=>{const g=s=>{const e=document.querySelector(s);if(!e)return null;const r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right}};return {cards:g('.unit-cards'),rail:g('.weapon-rail'),header:g('.mission-header')}})()`);
   assert.ok(move.y>furniture.header.bottom-1,'below the mission header at '+width);
   assert.ok(move.bottom<furniture.rail.top&&move.bottom<furniture.cards.top,'clear of the controls at '+width);
   assert.equal(await p.eval('document.documentElement.scrollWidth'),width,'nothing pushed off the edge at '+width);
   // Now the arrow, which hangs above a card and must not leave the screen either.
   const point=await p.eval('tinpotTest.project(0,2)');await touch(p,point.x,point.y);await sleep(220);
   const arrow=await box(p,'.card-arrow');
   assert.ok(arrow&&arrow.x>=0&&arrow.right<=width+.1&&arrow.bottom<=height,'the card arrow stays on screen at '+width+': '+JSON.stringify(arrow));
   assert.ok(arrow.bottom<=furniture.cards.top+4,'and sits above the cards at '+width+': '+arrow.bottom+' vs '+furniture.cards.top);
   const buttons=await p.eval(`[...document.querySelectorAll('#hud button')].map(b=>{const r=b.getBoundingClientRect();return {label:b.ariaLabel,w:r.width,h:r.height,x:r.x,y:r.y,right:r.right,bottom:r.bottom}})`);
   for(const b of buttons){assert.ok(b.w>=44&&b.h>=44,width+': '+JSON.stringify(b));assert.ok(b.x>=0&&b.y>=0&&b.right<=width+.1&&b.bottom<=height+.1,width+': '+JSON.stringify(b));}
   await p.shot(evidence+'v3-coach-'+width+'.png');
   report.widths.push({width,coach:move,arrow});
  }
  await p.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});
  assert.deepEqual(p.errors,[]);});


 // ---------------------------------------------------------------- 0.04 screen real estate
 // Aaron's second playtest: the teaching furniture works and it is in the way, and he cannot
 // tell whether his next tap marches the squad or throws another grenade.

 await scenario('the mission banner folds down to the pause button, and the pause button never moves',async p=>{
  await p.goto(BASE+'?test=1',{width:390,height:844,deviceScaleFactor:2,mobile:true});await p.wait('window.__TINPOT_BOOTED__');
  const btn=async()=>p.eval(`(()=>{const r=document.querySelector('.pause').getBoundingClientRect();return {x:+r.x.toFixed(1),y:+r.y.toFixed(1),w:+r.width.toFixed(1),h:+r.height.toFixed(1),right:+r.right.toFixed(1),bottom:+r.bottom.toFixed(1)}})()`);
  const cls=async()=>p.eval(`document.querySelector('.mission-header').className`);
  await p.eval("tinpotTest.mission(0,0)");await sleep(220);
  assert.equal((await p.eval('tinpotTest.advance(0)')).banner.collapsed,false,'negative control: it is open when the mission starts');
  assert.ok((await p.eval(`+getComputedStyle(document.querySelector('.banner-text')).opacity`))>.9,'and the objective is readable');
  const open=await btn();
  // The bug this project has already paid for: the HUD markup was rebuilt mid-gesture, the
  // button the touchstart landed on was replaced, and Chrome had nothing left to fire `click`
  // on. So mark the actual DOM node and require that THIS node — not an identical replacement —
  // is still there after every state the banner can be in.
  await p.eval(`document.querySelector('.pause').dataset.mark='keep'`);
  const survived=async()=>p.eval(`document.querySelector('.pause').dataset.mark==='keep'`);
  assert.equal(await survived(),true,'negative control: the mark is on the button to begin with');
  await p.shot(evidence+'v4-banner-open.png');
  await p.eval('tinpotTest.advance(60*4)');await sleep(200);
  assert.equal((await p.eval('tinpotTest.advance(0)')).banner.collapsed,false,'four seconds in it is still up');
  await p.eval('tinpotTest.advance(60*5)');await sleep(320);
  assert.equal((await p.eval('tinpotTest.advance(0)')).banner.collapsed,true,'and within ten seconds it has folded away');
  assert.match(await cls(),/collapsed/);
  assert.ok((await p.eval(`+getComputedStyle(document.querySelector('.banner-text')).opacity`))<.1,'the objective text is gone');
  assert.equal(await p.eval(`getComputedStyle(document.querySelector('.mission-header')).boxShadow`),'none','and so is the card it sat on');
  const shut=await btn();
  assert.deepEqual(shut,open,'THE PAUSE BUTTON MUST NOT MOVE: '+JSON.stringify([open,shut]));
  assert.equal(await survived(),true,'collapsing must not replace the pause button in the DOM');
  await p.shot(evidence+'v4-banner-collapsed.png');
  // Tapping it expands the banner and pauses, as before.
  await click(p,'.pause');await sleep(260);
  let s=await p.eval('tinpotTest.advance(0)');
  assert.equal(s.paused,true,'tapping pause still pauses');
  assert.equal(s.banner.collapsed,false,'and brings the banner back');
  assert.doesNotMatch(await cls(),/collapsed/);
  assert.deepEqual(await btn(),open,'still has not moved');
  assert.equal(await survived(),true,'and pausing must not replace it either');
  assert.equal(await p.eval(`document.querySelector('.pause').textContent`),'\u25b6','the glyph is written in place');
  await p.shot(evidence+'v4-banner-paused.png');
  await click(p,'.pause');await sleep(200);
  s=await p.eval('tinpotTest.advance(0)');
  assert.equal(s.paused,false,'and unpauses');
  assert.equal(s.banner.collapsed,false,'the banner stays up for a beat after unpausing');
  await p.eval('tinpotTest.advance(60*7)');await sleep(320);
  assert.equal((await p.eval('tinpotTest.advance(0)')).banner.collapsed,true,'then folds away again on its own');
  assert.deepEqual(await btn(),open,'and it still has not moved');
  assert.equal(await survived(),true,'nor unpausing, nor re-collapsing: the node is never rebuilt');
  report.banner={open,shut,nodeSurvived:true};assert.deepEqual(p.errors,[]);});

 await scenario('the pause button is a 44 px target inside the top edge at every width, collapsed or not',async p=>{
  await p.goto(BASE+'?test=1',{width:390,height:844,deviceScaleFactor:2,mobile:true});await p.wait('window.__TINPOT_BOOTED__');
  report.pause=[];
  for(const [width,height] of [[320,740],[390,844],[430,932]]){
   await p.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:2,mobile:true});
   await p.eval("tinpotTest.mission(2,0)");await sleep(240);
   for(const state of ['open','collapsed','armed']){
    if(state==='collapsed'){await p.eval('tinpotTest.advance(60*9)');await sleep(320);
     assert.equal((await p.eval('tinpotTest.advance(0)')).banner.collapsed,true,'collapsed at '+width);}
    if(state==='armed'){await click(p,'.rail-button[data-weapon="grenade"]');await sleep(200);await dismissPrimer(p);
     const l=(await p.eval('tinpotTest.advance(2)')).units.find(u=>u.team==='blue'&&u.hp>0);
     const pt=await p.eval(`tinpotTest.project(${l.x.toFixed(2)},${(l.z-9).toFixed(2)})`);await touch(p,pt.x,pt.y);
     await p.eval('tinpotTest.advance(2)');await sleep(220);
     assert.ok((await p.eval('tinpotTest.advance(0)')).armed,'armed at '+width);
     assert.equal(await p.eval(`document.querySelector('.mission-header').classList.contains('armed')`),true,'and the banner took it over at '+width);}
    const b=await p.eval(`(()=>{const r=document.querySelector('.pause').getBoundingClientRect();const c=getComputedStyle(document.querySelector('.pause'));return {w:r.width,h:r.height,x:r.x,y:r.y,right:r.right,bottom:r.bottom,vis:c.visibility,op:+c.opacity}})()`);
    assert.ok(b.w>=44&&b.h>=44,state+' at '+width+': too small '+JSON.stringify(b));
    assert.ok(b.x>=0&&b.y>=0&&b.right<=width+.1&&b.bottom<=height+.1,state+' at '+width+': off the edge '+JSON.stringify(b));
    assert.ok(b.vis==='visible'&&b.op>.9,state+' at '+width+': not visible '+JSON.stringify(b));
    assert.ok(b.bottom<height*.15,state+' at '+width+': not in the top edge strip '+JSON.stringify(b));
    report.pause.push({width,state,b});
   }
   assert.equal(await p.eval('document.documentElement.scrollWidth'),width,'nothing pushed off the edge at '+width);
   await p.shot(evidence+'v4-collapsed-'+width+'.png');
  }
  await p.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});
  assert.deepEqual(p.errors,[]);});

 await scenario('the armed banner reads at every width, and the grenade goes back to a rifle after it is thrown',async p=>{
  await p.goto(BASE+'?test=1',{width:390,height:844,deviceScaleFactor:2,mobile:true});await p.wait('window.__TINPOT_BOOTED__');
  report.armedBanner=[];
  for(const [width,height] of [[320,740],[390,844],[430,932]]){
   await p.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:2,mobile:true});
   await p.eval("tinpotTest.mission(2,0)");await sleep(240);
   // Park the opposition well outside grenade reach. Grenadiers auto-lob at anything within
   // 16 m, and a man who has just lobbed one unprompted is mid-cadence and does not throw on
   // the order — which would make "everyone who threw" a different set every run. This is the
   // clean case on purpose: four men, all ready, one order.
   await p.eval('tinpotTest.lineup(-20)');await sleep(150);
   await click(p,'.rail-button[data-weapon="grenade"]');await sleep(200);await dismissPrimer(p);
   let s=await p.eval('tinpotTest.advance(4)');
   assert.ok(s.units.filter(u=>u.team==='blue'&&u.hp>0).every(u=>u.weapon==='grenade'),'everybody has one at '+width);
   assert.ok(s.units.filter(u=>u.team==='blue'&&u.hp>0).every(u=>u.cooldown<=0),'negative control: nobody has thrown anything yet at '+width);
   const lead=s.units.find(u=>u.team==='blue'&&u.hp>0);
   const pt=await p.eval(`tinpotTest.project(${lead.x.toFixed(2)},${(lead.z-9).toFixed(2)})`);await touch(p,pt.x,pt.y);
   s=await p.eval('tinpotTest.advance(4)');await sleep(220);
   assert.ok(s.armed,'armed at '+width);
   const panel=await p.eval(`(()=>{const e=document.querySelector('.armed-panel'),h=document.querySelector('.mission-header');const r=e.getBoundingClientRect(),hr=h.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,hx:hr.x,hy:hr.y,hright:hr.right,hbottom:hr.bottom,text:e.textContent,clock:document.querySelector('.armed-clock').textContent,font:+getComputedStyle(document.querySelector('.armed-line')).fontSize.replace('px','')}})()`);
   assert.ok(panel.x>=0&&panel.right<=width+.1&&panel.y>=0,'the armed banner stays on screen at '+width+': '+JSON.stringify(panel));
   assert.ok(panel.bottom<=panel.hbottom+1,'inside the banner at '+width);
   assert.ok(panel.hbottom<height*.16,'and the whole banner stays in the top strip at '+width+': '+panel.hbottom);
   assert.ok(panel.font>=11,'legible on a bright phone at '+width+': '+panel.font+'px');
   assert.match(panel.text,/GRENADE ARMED/);
   assert.equal(await p.eval('document.documentElement.scrollWidth'),width,'nothing pushed off the edge at '+width);
   await p.shot(evidence+'v4-armed-'+width+'.png');
   // 0.04.4 — and once it has actually gone, the rail and the pips must say RIFLE.
   for(let i=0;i<30&&s.armed;i++)s=await p.eval('tinpotTest.advance(20)');
   assert.equal(s.armed,null,'it went at '+width);
   await sleep(220);
   assert.ok(s.units.filter(u=>u.team==='blue'&&u.hp>0).every(u=>u.weapon==='rifle'),'0.04.4: throwing it puts the rifle back in every thrower\'s hands at '+width+': '+JSON.stringify(s.units.filter(u=>u.team==='blue').map(u=>u.weapon)));
   const ui=await p.eval(`({rail:[...document.querySelectorAll('.rail-button')].filter(b=>b.classList.contains('selected')).map(b=>b.dataset.weapon),pips:[...document.querySelectorAll('.pip.selected')].map(b=>b.dataset.weapon),hint:document.querySelector('.order-hint').textContent})`);
   assert.deepEqual(ui.rail,['rifle'],'the rail must follow it at '+width+': '+JSON.stringify(ui));
   assert.ok(ui.pips.length&&ui.pips.every(w=>w==='rifle'),'and so must every pip at '+width+': '+JSON.stringify(ui));
   assert.match(ui.hint,/TAP GROUND TO MARCH/,'and the hint stops offering to arm one: '+ui.hint);
   assert.equal(await p.eval(`document.querySelector('.mission-header').classList.contains('armed')`),false,'the banner hands the objective back');
   if(width===390)await p.shot(evidence+'v4-reverted-to-rifle.png');
   report.armedBanner.push({width,panel,ui});
  }
  await p.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});
  assert.deepEqual(p.errors,[]);});

 await scenario('cancelling leaves the grenade in his hand, and the briefing never comes back',async p=>{
  await p.goto(BASE+'?test=1',{width:390,height:844,deviceScaleFactor:2,mobile:true});await p.wait('window.__TINPOT_BOOTED__');
  await p.eval("tinpotTest.mission(2,0)");await sleep(240);
  assert.equal(await p.eval('tinpot.primer'),false,'negative control: no briefing before he has a grenade');
  await click(p,'.rail-button[data-weapon="grenade"]');await sleep(220);
  assert.equal(await p.eval('tinpot.primer'),true,'the briefing arrives once');
  await click(p,'.primer-go');await sleep(220);
  assert.equal((await p.eval('tinpotTest.taught()')).grenade,true,'and is written into the ledger');
  // Everything below must never produce it a second time.
  let s=await p.eval('tinpotTest.advance(4)');
  const lead=s.units.find(u=>u.team==='blue'&&u.hp>0);
  let pt=await p.eval(`tinpotTest.project(${lead.x.toFixed(2)},${(lead.z-9).toFixed(2)})`);await touch(p,pt.x,pt.y);
  s=await p.eval('tinpotTest.advance(4)');
  assert.ok(s.armed,'armed');
  pt=await p.eval(`tinpotTest.project(${s.armed.x},${s.armed.z})`);await touch(p,pt.x,pt.y);
  s=await p.eval('tinpotTest.advance(4)');await sleep(200);
  assert.equal(s.armed,null,'called off');
  assert.ok(s.units.filter(u=>u.team==='blue'&&u.hp>0).every(u=>u.weapon==='grenade'),'0.04.4: cancelling does NOT take it off him — he never spent it: '+JSON.stringify(s.units.filter(u=>u.team==='blue').map(u=>u.weapon)));
  assert.deepEqual(await p.eval(`[...document.querySelectorAll('.rail-button')].filter(b=>b.classList.contains('selected')).map(b=>b.dataset.weapon)`),['grenade'],'and the rail still says grenade');
  assert.equal(await p.eval('tinpot.primer'),false,'the briefing did not come back after a cancel');
  await p.shot(evidence+'v4-cancel-keeps-grenade.png');
  // Re-select, re-throw, reload the page: still never again.
  await click(p,'.rail-button[data-weapon="rifle"]');await sleep(120);
  await click(p,'.rail-button[data-weapon="grenade"]');await sleep(220);
  assert.equal(await p.eval('tinpot.primer'),false,'nor after taking the grenade away and handing it back');
  await p.eval('tinpotTest.save()');
  await p.goto(BASE+'?test=1',{width:390,height:844,deviceScaleFactor:2,mobile:true});await p.wait('window.__TINPOT_BOOTED__');
  await click(p,'[data-action="start"]');await sleep(300);
  assert.equal(await p.eval('tinpot.primer'),false,'nor after a reload');
  assert.equal((await p.eval('tinpotTest.taught()')).grenade,true,'the ledger survived the reload');
  assert.deepEqual(p.errors,[]);});

 await scenario('the build number is on the title screen and on window.tinpot',async p=>{
  await p.goto(BASE+'?test=1',{width:390,height:844,deviceScaleFactor:2,mobile:true});await p.wait('window.__TINPOT_BOOTED__');
  await p.eval("tinpotTest.fixture('title')");await sleep(250);
  const v=await p.eval('tinpot.version');
  assert.match(v,/^\d+\.\d+$/,'a version string is exposed for the harness: '+v);
  const footer=await p.eval(`document.querySelector('.title-footer').textContent`);
  assert.ok(footer.includes(v),'and it is on the title screen: '+footer);
  await p.shot(evidence+'v3-version.png');
  report.version=v;assert.deepEqual(p.errors,[]);});
}
if(suite==='shell')await scenario('broken import watchdog',async p=>{await p.send('Fetch.enable',{patterns:[{urlPattern:'*tinpot/js/main.mjs',requestStage:'Request'}]});p.on('Fetch.requestPaused',async e=>{await p.send('Fetch.fulfillRequest',{requestId:e.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'text/javascript'}],body:Buffer.from("import './deliberately-missing.mjs';").toString('base64')});});await p.goto(BASE,{width:390,height:844,deviceScaleFactor:1,mobile:true});await p.wait('window.__TINPOT_FAILED__',24000);assert.equal(await p.eval('window.__ready'),false);assert.equal(await p.eval("document.getElementById('boot-retry').hidden"),false);await p.shot(evidence+'m0-broken-import.png');report.failureMessage=await p.eval('window.__TINPOT_FAILED__');});
report.passed=true;
}catch(e){report.passed=false;report.error=e.stack;throw e;}finally{await writeFile(evidence+'browser-'+suite+'.json',JSON.stringify(report,null,2));}
