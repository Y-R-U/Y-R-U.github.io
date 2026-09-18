import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const url=process.env.EMBERWAKE_URL||'https://yru.br8t.com/gms/3d/emberwake/';
const expected=Number(process.env.EXPECTED_SCHEMA||4);
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-angle=metal','--enable-webgl','--ignore-gpu-blocklist']});
try{
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`)});
 await page.goto(url);await page.waitForFunction(()=>window.emberwake?.metrics.frames>5);assert.equal(await page.evaluate(()=>emberwake.state.version),expected);
 await page.evaluate(()=>{const s=structuredClone(emberwake.state);Object.assign(s,{region:'island',labStep:3,stage:1,x:1,z:15,muted:true});localStorage.setItem('emberwake-v1',JSON.stringify(s));});await page.reload();await page.click('#resume');
 await page.evaluate(()=>{const o=emberwake.world.objects.find(o=>o.id==='shop');emberwake.go(o.x,o.z,o);});await page.waitForFunction(()=>document.querySelector('#shop').open);await page.tap('[data-item=wood][data-side=buy]');assert.equal(await page.evaluate(()=>emberwake.state.bag.wood),1);await page.tap('#closeShop');
 await page.evaluate(()=>{const o=emberwake.world.objects.find(o=>o.id==='fish');emberwake.go(o.x,o.z,o);});await page.waitForFunction(()=>emberwake.state.bag.raw===1,null,{timeout:20000});await page.waitForTimeout(3400);assert.equal(await page.evaluate(()=>emberwake.state.bag.raw),1);
 if(expected>=4){await page.evaluate(()=>{const o=emberwake.world.objects.find(o=>o.id==='fire');emberwake.go(o.x,o.z,o);});await page.waitForFunction(()=>document.querySelector('#workshop').open);await page.tap('[data-recipe=meal]');await page.waitForFunction(()=>emberwake.state.xp.Cooking===35);assert.equal(await page.evaluate(()=>emberwake.state.bag.fish),4);}
 const metrics=await page.evaluate(()=>emberwake.metrics);assert(metrics.drawCalls>10&&metrics.triangles>1000);assert.deepEqual(errors,[]);console.log(JSON.stringify({result:'PASS',url,schema:expected,checks:['public assets','shop purchase','manual fishing',...(expected>=4?['cooking recipe']:[]),'world rendered','no browser or asset errors'],metrics},null,2));
}finally{await browser.close();}
