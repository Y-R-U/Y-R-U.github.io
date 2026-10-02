// Requires Playwright + Chrome. Optional YRU_TEST_URL and PLAYWRIGHT_MODULE.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict');
const path=require('node:path'),os=require('node:os');
const base=process.env.YRU_TEST_URL||'http://127.0.0.1:8888/';
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 const errors=[],bad=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('response',r=>{if(r.status()>=400 && r.url().startsWith(base))bad.push(`${r.status()} ${r.url()}`)});
 await page.goto(base+'#projects');await page.locator('.card-wrapper').first().waitFor();
 const originalMonth=await page.locator('.month-chip.active').getAttribute('data-month');
 const publicCount=await page.evaluate(()=>pool().length);
 await page.locator('[data-view="timeline"]').click();
 assert.equal(await page.locator('.evolution-card').count(),publicCount);
 assert.equal(await page.locator('#projects-controls').isVisible(),false);
 assert.equal(await page.locator('.navbar').isVisible(),false);
 assert.equal(await page.locator('#card-grid').isVisible(),false);
 assert.equal(await page.locator('[data-project="gallery"]').count(),0);
 assert.equal(await page.locator('#project-explorer button:visible').count(),3);
 assert.match(await page.locator('.atlas-spine').getAttribute('d'),/^M180 120 H/);
 assert.match(await page.locator('.atlas-date strong').first().textContent(),/June 2024/);
 assert.match(await page.locator('[data-project="grumpybugs"] .evolution-parent').textContent(),/Graphics rebuild from Grudge Bugs/);
 const viewport=page.locator('.atlas-viewport');
 const zoom=await viewport.getAttribute('data-zoom');
 await page.keyboard.press('+');assert.ok(Number(await viewport.getAttribute('data-zoom'))>Number(zoom));
 const startLeft=await viewport.evaluate(e=>e.scrollLeft);
 await page.keyboard.press('ArrowRight');assert.ok(await viewport.evaluate(e=>e.scrollLeft)>startLeft);
 const r=await viewport.boundingBox();
 await page.mouse.move(r.x+700,r.y+80);await page.mouse.down();await page.mouse.move(r.x+400,r.y+80,{steps:8});await page.mouse.up();
 assert.ok(await viewport.evaluate(e=>e.scrollLeft)>startLeft+100);
 await page.locator('[data-graph-view="type"]').click();assert.equal(await page.locator('.evolution-card').count(),publicCount);
 assert.equal(await page.locator('[data-graph-view="type"]').getAttribute('aria-pressed'),'true');
 assert.ok((await page.locator('.atlas-branch-heading').allTextContents()).some(t=>t.includes('3D games')));
 for(const [width,height] of [[320,740],[390,844],[430,932],[844,390],[932,430],[1440,1000]]){
   await page.setViewportSize({width,height});
   for(const view of ['timeline','type']){
    await page.locator(`[data-graph-view="${view}"]`).click();
    const bounds=await viewport.boundingBox();assert.equal(bounds.width,width);assert.equal(bounds.height,height);
    const size=await page.evaluate(()=>({doc:document.documentElement.scrollWidth,win:innerWidth}));
    assert.ok(size.doc<=size.win,`${view} document overflow at ${width}x${height}`);
    const buttons=await page.locator('#project-explorer button').evaluateAll(es=>es.map(e=>e.getBoundingClientRect().toJSON()));
    assert.ok(buttons.every(b=>b.height>=44 && b.x>=0 && b.right<=width && b.bottom<=height));
   }
   if(width===390 || width===844) await page.screenshot({path:path.join(os.tmpdir(),`yru-graph-${width}x${height}.png`)});
 }
 await page.keyboard.press('Escape');await page.locator('.card-wrapper').first().waitFor();
 assert.equal(await page.locator('#project-explorer').isVisible(),false);
 assert.equal(await page.locator('.navbar').isVisible(),true);
 assert.equal(await page.locator('.month-chip.active').getAttribute('data-month'),originalMonth);
 await page.locator('[data-view="type"]').click();await page.locator('.atlas-close').click();
 assert.equal(await page.locator('#project-explorer').isVisible(),false);
 // Reveal keeps working in the grid; its pool is inherited by both graph modes.
 const current=await page.evaluate(()=>CURRENT_MONTH);
 for(let i=0;i<5;i++)await page.locator(`[data-month="${current}"]`).click();
 await page.locator('[data-view="timeline"]').click();assert.equal(await page.locator('[data-project="gallery"]').count(),1);
 await page.locator('.atlas-close').click();await page.locator(`[data-month="${current}"]`).click();
 await page.locator('[data-view="timeline"]').click();assert.equal(await page.locator('[data-project="gallery"]').count(),0);
 const imgs=page.locator('.evolution-card img');
 for(let i=0;i<await imgs.count();i++)await imgs.nth(i).scrollIntoViewIfNeeded();
 await page.waitForTimeout(1000);
 assert.deepEqual(await imgs.evaluateAll(es=>es.filter(e=>!e.complete||!e.naturalWidth).map(e=>e.src)),[]);
 assert.deepEqual(errors,[]);assert.deepEqual(bad,[]);
 const touchContext=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
 const touchPage=await touchContext.newPage();await touchPage.goto(base+'#projects');await touchPage.locator('[data-view="timeline"]').click();
 const touchViewport=touchPage.locator('.atlas-viewport'),cdp=await touchContext.newCDPSession(touchPage);
 const touch=(type,touchPoints)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints});
 const beforePinch=await touchViewport.getAttribute('data-zoom');
 await touch('touchStart',[{x:130,y:400},{x:230,y:400}]);await touch('touchMove',[{x:90,y:400},{x:270,y:400}]);await touch('touchEnd',[]);
 assert.ok(Number(await touchViewport.getAttribute('data-zoom'))>Number(beforePinch));
 const beforePan=await touchViewport.evaluate(e=>e.scrollLeft);
 await touch('touchStart',[{x:280,y:400}]);
 for(let i=1;i<=6;i++)await touch('touchMove',[{x:280-i*25,y:400}]);
 await touch('touchEnd',[]);await touchPage.waitForTimeout(250);assert.ok(await touchViewport.evaluate(e=>e.scrollLeft)>beforePan);
 await touchPage.locator('.atlas-close').tap();assert.equal(await touchPage.locator('#project-explorer').isVisible(),false);
 await touchContext.close();await browser.close();
 console.log(JSON.stringify({base,publicCount,portrait:true,landscape:true,touch:true,errors,bad,passed:true}));
})().catch(e=>{console.error(e);process.exit(1)});
