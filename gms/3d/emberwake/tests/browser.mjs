import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-angle=metal','--enable-webgl','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});const errors=[],http=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});page.on('response',r=>{if(r.status()>=400)http.push(r.url())});
const wait=fn=>page.waitForFunction(fn,null,{timeout:45000});
const stage=async n=>{await page.waitForFunction(n=>emberwake.state.stage===n,n,{timeout:45000});console.log('stage',n);};
const close=async()=>{await page.waitForFunction(()=>!emberwake.travelling);if(await page.evaluate(()=>!!emberwake.speech.id))await page.locator('#speechNext').click();};
const track=()=>page.click('#track');
try{
await page.goto(process.env.EMBERWAKE_URL||'http://127.0.0.1:8891/gms/3d/emberwake/');await wait(()=>window.emberwake?.metrics.frames>5);
await page.click('#start');await page.fill('#heroName','Rowan');await page.check('[name=gender][value=female]');await page.click('#characterForm .primary');await close();
await track();await wait(()=>document.querySelector('#dialogueTitle').textContent==='Ten seconds. Then sixty.');await close();await close();assert.equal(await page.evaluate(()=>emberwake.state.labStep),1);await close();
await track();await wait(()=>emberwake.state.labStep===2);await close();assert.match(await page.locator('#voiceStatus').textContent(),/BELLA/);await close();
await track();await wait(()=>emberwake.state.region==='island'&&!emberwake.travelling);assert.equal(await page.evaluate(()=>emberwake.world.player.userData.gender),'female');await close();console.log('lab escape complete');
// Actual projected pointer picking on the keeper, followed by routed movement.
const edda=await page.evaluate(()=>{const o=emberwake.world.objects.find(o=>o.id==='edda');return emberwake.project(emberwake.world.player.position.clone().set(o.x,o.y+1,o.z))});await page.mouse.click(edda.x,edda.y);await stage(1);await close();await close();
await track();await wait(()=>emberwake.state.bag.wood>=1);await page.waitForTimeout(750);await track();await wait(()=>emberwake.state.bag.wood>=2);await page.waitForTimeout(750);await track();await wait(()=>emberwake.state.bag.ore>=1);await page.waitForTimeout(750);await track();await stage(2);await close();
await track();await stage(3);assert(await page.evaluate(()=>emberwake.state.crafted));await close();
await page.getByRole('button',{name:'Equip sword',exact:true}).click();await track();await wait(()=>emberwake.state.training[0]>=3);await page.getByRole('button',{name:'Equip dagger',exact:true}).click();await wait(()=>emberwake.state.training[1]>=3);await page.waitForTimeout(500);await track();await stage(4);await close();
await track();await stage(5);await close();await page.screenshot({path:'/private/tmp/emberwake-training.png'});
for(let i=1;i<=3;i++){await track();await page.waitForFunction(n=>emberwake.state.kills.length>=n,i,{timeout:45000});console.log('shade',i)}await stage(6);await close();
await page.waitForTimeout(10000);await track();
for(let i=0;i<50;i++){if(await page.evaluate(()=>emberwake.state.bossDead))break;await page.waitForTimeout(500);const hp=await page.evaluate(()=>emberwake.state.hp);if(hp<60)await page.keyboard.press('r');}
await stage(7);await close();await track();await stage(8);await page.screenshot({path:'/private/tmp/emberwake-ending.png'});await close();await track();await wait(()=>emberwake.state.region==='mainland'&&!emberwake.travelling);await close();await page.screenshot({path:'/private/tmp/emberwake-mainland-new.png'});
await track();await wait(()=>emberwake.state.mainStage===1);await close();
for(let i=1;i<=3;i++){for(let j=0;j<3;j++){await page.waitForTimeout(750);await track();await page.waitForTimeout(j===0?10000:7000);}await page.waitForFunction(n=>emberwake.state.relays.length===n,i);console.log('ward',i);}
assert.equal(await page.evaluate(()=>emberwake.state.mainStage),2);await track();await wait(()=>emberwake.state.mainStage===3);await close();
for(let i=1;i<=2;i++){await track();await page.waitForFunction(n=>emberwake.state.mainKills.length>=n,i,{timeout:45000});console.log('sentinel',i);}
await track();await wait(()=>emberwake.state.mainStage===4);await close();await track();
for(let i=0;i<80;i++){if(await page.evaluate(()=>emberwake.state.mainKills.includes(12)))break;await page.waitForTimeout(500);if(await page.evaluate(()=>emberwake.state.hp<60))await page.keyboard.press('r');}
await wait(()=>emberwake.state.mainKills.includes(12));await track();await wait(()=>emberwake.state.mainStage===5);await close();await close();await track();await wait(()=>emberwake.state.mainStage===6);await close();await close();await close();
await page.click('#journalBtn');assert.match(await page.locator('#journalContent').textContent(),/ASTER LAB/);assert.match(await page.locator('#journalTitle').textContent(),/Rowan/);await page.getByRole('button',{name:'Back to the journey',exact:true}).click();console.log('mainland missions complete');

// Functional belt states and skill XP details, save/resume, settings, and viewport layout.
for(let n=1;n<=3;n++){await page.click('#beltToggle');assert.equal(await page.locator('#belt').getAttribute('data-size'),String(n%3))}
await page.getByRole('button',{name:/Magic level/}).click();assert.equal(await page.locator('#skills').getAttribute('data-size'),'2');assert.match(await page.locator('#skillDetail').textContent(),/XP to level/);await page.click('#skillsToggle');
await page.reload();await page.click('#resume');assert.equal(await page.evaluate(()=>emberwake.state.mainStage),6);assert.equal(await page.evaluate(()=>emberwake.state.region),'mainland');assert.equal(await page.evaluate(()=>emberwake.state.name),'Rowan');
const bounds=[];for(const size of[{width:320,height:568},{width:390,height:844},{width:768,height:1024},{width:1440,height:900}]){await page.setViewportSize(size);await page.waitForTimeout(200);bounds.push(await page.evaluate(()=>({w:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,clipped:['belt','skills','quest','interact','dodge'].filter(id=>{let r=document.getElementById(id).getBoundingClientRect();return r.left<0||r.top<0||r.right>innerWidth+1||r.bottom>innerHeight+1})})));if(size.width===390)await page.screenshot({path:'/private/tmp/emberwake-mobile.png'})}
assert(bounds.every(b=>!b.overflow&&!b.clipped.length),JSON.stringify(bounds));await page.evaluate(()=>{const g=emberwake,o=g.world.objects.find(o=>o.id==='return');g.go(o.x,o.z,o)});await wait(()=>emberwake.state.region==='island'&&!emberwake.travelling);await track();await wait(()=>emberwake.state.region==='mainland'&&!emberwake.travelling);assert.equal(await page.evaluate(()=>emberwake.state.mainStage),6);
assert.deepEqual(errors,[]);assert.deepEqual(http,[]);
console.log(JSON.stringify({result:'PASS',checks:['character creation and female model','playable lab escape','three mainland ward repairs','archivist rescue','observatory boss and ledger','story journal','bidirectional crossings','projected NPC click','resource routing','gathering','forge','sword and dagger training','magic unlock and practice','three shades','boss combat','beacon ending','three belt states','skill experience','save/resume','four viewports','no JS or HTTP errors'],bounds,metrics:await page.evaluate(()=>emberwake.metrics)},null,2));
}catch(e){console.log(await page.evaluate(()=>({state:emberwake.state,metrics:emberwake.metrics,objective:emberwake.objective()?.id})));await page.screenshot({path:'/private/tmp/emberwake-flow-failure.png'});throw e;}finally{await browser.close()}
