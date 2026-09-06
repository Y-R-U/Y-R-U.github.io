import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-angle=metal','--enable-webgl','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});const errors=[],http=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});page.on('response',r=>{if(r.status()>=400)http.push(r.url())});
const wait=fn=>page.waitForFunction(fn,null,{timeout:45000});
const stage=async n=>{await page.waitForFunction(n=>emberwake.state.stage===n,n,{timeout:45000});console.log('stage',n);};
const close=async()=>{await page.locator('#continue').click();};
const track=()=>page.click('#track');
try{
await page.goto(process.env.EMBERWAKE_URL||'http://127.0.0.1:8891/gms/3d/emberwake/');await wait(()=>window.emberwake?.metrics.frames>5);
await page.click('#start');await wait(()=>!document.querySelector('#dialogue').hidden);assert.match(await page.locator('#dialogueTitle').textContent(),/shore/);await close();
// Actual projected pointer picking on the keeper, followed by routed movement.
const edda=await page.evaluate(()=>{const o=emberwake.world.objects.find(o=>o.id==='edda');return emberwake.project(emberwake.world.player.position.clone().set(o.x,o.y+1,o.z))});await page.mouse.click(edda.x,edda.y);await stage(1);await close();
await track();await wait(()=>emberwake.state.bag.wood>=1);await page.waitForTimeout(750);await track();await wait(()=>emberwake.state.bag.wood>=2);await page.waitForTimeout(750);await track();await wait(()=>emberwake.state.bag.ore>=1);await page.waitForTimeout(750);await track();await stage(2);await close();
await track();await stage(3);assert(await page.evaluate(()=>emberwake.state.crafted));await close();
await page.getByRole('button',{name:'Equip sword',exact:true}).click();await track();await wait(()=>emberwake.state.training[0]>=3);await page.getByRole('button',{name:'Equip dagger',exact:true}).click();await wait(()=>emberwake.state.training[1]>=3);await page.waitForTimeout(500);await track();await stage(4);await close();
await track();await stage(5);await close();await page.screenshot({path:'/private/tmp/emberwake-training.png'});
for(let i=1;i<=3;i++){await track();await page.waitForFunction(n=>emberwake.state.kills.length>=n,i,{timeout:45000});console.log('shade',i)}await stage(6);await close();
await page.waitForTimeout(10000);await track();
for(let i=0;i<50;i++){if(await page.evaluate(()=>emberwake.state.bossDead))break;await page.waitForTimeout(500);const hp=await page.evaluate(()=>emberwake.state.hp);if(hp<60)await page.keyboard.press('r');}
await stage(7);await close();await track();await stage(8);await page.screenshot({path:'/private/tmp/emberwake-ending.png'});await close();assert(await page.evaluate(()=>emberwake.world.beam.visible));await page.screenshot({path:'/private/tmp/emberwake-beacon.png'});
// Functional belt states and skill XP details, save/resume, settings, and viewport layout.
for(let n=1;n<=3;n++){await page.click('#beltToggle');assert.equal(await page.locator('#belt').getAttribute('data-size'),String(n%3))}
await page.getByRole('button',{name:/Magic level/}).click();assert.equal(await page.locator('#skills').getAttribute('data-size'),'2');assert.match(await page.locator('#skillDetail').textContent(),/XP to level/);await page.click('#skillsToggle');
await page.reload();await page.click('#resume');assert.equal(await page.evaluate(()=>emberwake.state.stage),8);assert(await page.evaluate(()=>emberwake.world.beam.visible));
const bounds=[];for(const size of[{width:320,height:568},{width:390,height:844},{width:768,height:1024},{width:1440,height:900}]){await page.setViewportSize(size);await page.waitForTimeout(200);bounds.push(await page.evaluate(()=>({w:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,clipped:['belt','skills','quest','interact','dodge'].filter(id=>{let r=document.getElementById(id).getBoundingClientRect();return r.left<0||r.top<0||r.right>innerWidth+1||r.bottom>innerHeight+1})})));if(size.width===390)await page.screenshot({path:'/private/tmp/emberwake-mobile.png'})}
assert(bounds.every(b=>!b.overflow&&!b.clipped.length),JSON.stringify(bounds));assert.deepEqual(errors,[]);assert.deepEqual(http,[]);
console.log(JSON.stringify({result:'PASS',checks:['projected NPC click','resource routing','gathering','forge','sword and dagger training','magic unlock and practice','three shades','boss combat','beacon ending','three belt states','skill experience','save/resume','four viewports','no JS or HTTP errors'],bounds,metrics:await page.evaluate(()=>emberwake.metrics)},null,2));
}finally{await browser.close()}
