import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {connect,BASE,sleep} from './cdp.mjs';
const suite=process.argv[2]||'shell',evidence=new URL('../docs/evidence/',import.meta.url).pathname;
const report={date:new Date().toISOString(),suite,tests:[]};
export async function touch(p,x,y){await p.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x,y}]});await p.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await sleep(100);}
export async function click(p,selector){const r=await p.eval(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);await touch(p,r.x,r.y);}
async function scenario(name,fn){const p=await connect();try{await fn(p);report.tests.push({name,passed:true});console.log('PASS',name);}catch(e){report.failedSnapshot=await p.eval('window.tinpot');await p.shot(evidence+suite+'-failure.png');throw e;}finally{await p.close();}}
try{
await scenario('portrait boot',async p=>{await p.goto(BASE+'?test=1',{width:390,height:844,deviceScaleFactor:2,mobile:true});await p.wait('window.__TINPOT_BOOTED__');await sleep(500);assert.equal(await p.eval('document.documentElement.scrollWidth'),390);await p.shot(evidence+(suite==='shell'?'m0-shell.png':suite+'-portrait.png'));assert.deepEqual(p.errors,[]);report.snapshot=await p.eval('tinpot');});
if(suite==='m2')await scenario('real touch walks around trees',async p=>{await p.goto(BASE+'?test=1',{width:390,height:844,deviceScaleFactor:2,mobile:true});await p.wait('window.__TINPOT_BOOTED__');await p.eval("tinpotTest.fixture('m2')");await sleep(100);const target=await p.eval('tinpotTest.project(0,-20)');await touch(p,target.x,target.y);await p.eval('tinpotTest.advance(450)');await p.shot(evidence+'m2-walking.png');const s=await p.eval('tinpotTest.advance(1350)');assert.ok(Math.hypot(s.units[0].x-.5,s.units[0].z+19.5)<.2);await p.shot(evidence+'m2-arrived.png');assert.deepEqual(p.errors,[]);report.walk=s;});
if(suite==='m3')await scenario('automatic firefight and persistent jam',async p=>{await p.goto(BASE+'?test=1',{width:390,height:844,deviceScaleFactor:2,mobile:true});await p.wait('window.__TINPOT_BOOTED__');await p.eval("tinpotTest.fixture('m3')");await sleep(100);const target=await p.eval('tinpotTest.project(0,0)');await touch(p,target.x,target.y);await p.eval('tinpotTest.advance(170)');await p.shot(evidence+'m3-duel.png');const s=await p.eval('tinpotTest.advance(1800)');assert.equal(s.units[1].hp,0);assert.ok(s.units[0].hp>0);await p.shot(evidence+'m3-jam.png');assert.ok((await p.eval('tinpot')).vfx.stains>0);assert.deepEqual(p.errors,[]);report.duel=s;});
if(suite==='m4')await scenario('four cards, hold toggle, minimum one, formation, pause and thumb targets',async p=>{await p.goto(BASE+'?test=1',{width:390,height:844,deviceScaleFactor:2,mobile:true});await p.wait('window.__TINPOT_BOOTED__');await p.eval("tinpotTest.fixture('m4')");await sleep(100);for(let i=1;i<4;i++)await click(p,`.unit-toggle[data-id="${i}"]`);await click(p,'.unit-toggle[data-id="0"]');assert.equal((await p.eval('tinpot')).units.filter(u=>u.team==='blue'&&u.active).length,1);const held=(await p.eval('tinpot')).units[1];const target=await p.eval('tinpotTest.project(0,7)');await touch(p,target.x,target.y);await p.eval('tinpotTest.advance(150)');await p.shot(evidence+'m4-hold.png');const now=await p.eval('tinpot');assert.equal(now.units[1].x,held.x);assert.equal(now.units[1].z,held.z);for(let i=1;i<4;i++)await click(p,`.unit-toggle[data-id="${i}"]`);await touch(p,target.x,target.y);await p.eval('tinpotTest.advance(400)');await p.shot(evidence+'m4-squad.png');await click(p,'.pause');const t=await p.eval('tinpot.time');await sleep(300);assert.equal(await p.eval('tinpot.time'),t);await click(p,'.pause');const rects=await p.eval(`[...document.querySelectorAll('#hud button')].map(b=>{const r=b.getBoundingClientRect();return {w:r.width,h:r.height,x:r.x,y:r.y,right:r.right,bottom:r.bottom}})`);for(const r of rects){assert.ok(r.w>=44&&r.h>=44,JSON.stringify(r));assert.ok(r.x>=0&&r.y>=0&&r.right<=390&&r.bottom<=844);}assert.deepEqual(p.errors,[]);report.controls=rects;});
if(suite==='m5')await scenario('grenade touch, fire spread, mixed weapons and new terrain',async p=>{await p.goto(BASE+'?test=1',{width:390,height:844,deviceScaleFactor:2,mobile:true});await p.wait('window.__TINPOT_BOOTED__');await p.eval("tinpotTest.fixture('m5')");await sleep(100);await click(p,'.pip[data-id="0"][data-weapon="grenade"]');assert.equal((await p.eval('tinpot')).units[0].weapon,'grenade');assert.equal((await p.eval('tinpot')).units[1].weapon,'rifle');const target=await p.eval('tinpotTest.project(-7,12)');await touch(p,target.x,target.y);await p.eval('tinpotTest.advance(30)');await p.shot(evidence+'m5-lob.png');await p.eval('tinpotTest.advance(180)');await p.shot(evidence+'m5-fire.png');const first=await p.eval('tinpot.burned');assert.ok(first>0);await p.eval('tinpotTest.advance(500)');await p.shot(evidence+'m5-scar.png');assert.ok(await p.eval('tinpot.burned')>first);await click(p,'.rail-button[data-weapon="grenade"]');assert.ok((await p.eval('tinpot')).units.filter(u=>u.team==='blue').every(u=>u.weapon==='grenade'));await click(p,'.rail-button[data-weapon="rifle"]');assert.ok((await p.eval('tinpot')).units.filter(u=>u.team==='blue').every(u=>u.weapon==='rifle'));assert.deepEqual(p.errors,[]);report.burn=await p.eval('tinpot');});
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
if(suite==='shell')await scenario('broken import watchdog',async p=>{await p.send('Fetch.enable',{patterns:[{urlPattern:'*tinpot/js/main.mjs',requestStage:'Request'}]});p.on('Fetch.requestPaused',async e=>{await p.send('Fetch.fulfillRequest',{requestId:e.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'text/javascript'}],body:Buffer.from("import './deliberately-missing.mjs';").toString('base64')});});await p.goto(BASE,{width:390,height:844,deviceScaleFactor:1,mobile:true});await p.wait('window.__TINPOT_FAILED__',24000);assert.equal(await p.eval('window.__ready'),false);assert.equal(await p.eval("document.getElementById('boot-retry').hidden"),false);await p.shot(evidence+'m0-broken-import.png');report.failureMessage=await p.eval('window.__TINPOT_FAILED__');});
report.passed=true;
}catch(e){report.passed=false;report.error=e.stack;throw e;}finally{await writeFile(evidence+'browser-'+suite+'.json',JSON.stringify(report,null,2));}
