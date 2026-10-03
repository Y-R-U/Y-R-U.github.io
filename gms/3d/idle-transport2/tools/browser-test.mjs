#!/usr/bin/env node
import {CDP} from './cdp.mjs';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../',import.meta.url));
const out=process.env.TRANSPORT_OUTPUT_DIR||resolve(root,'docs/verification');mkdirSync(out,{recursive:true});
const base=process.env.TRANSPORT_URL||'http://127.0.0.1:8888/gms/3d/idle-transport2/';
const c=await CDP.launch({gpu:true});
const report={url:base,date:new Date().toISOString(),checks:[],viewports:[],errors:[]};
c.on('Network.responseReceived',p=>{if(p.response.status>=400)report.errors.push(`${p.response.status}: ${p.response.url}`);});
c.on('Network.loadingFailed',p=>{if(!p.canceled)report.errors.push(`Network: ${p.errorText}`);});
async function check(name,expr){const result=await c.eval(expr);assert.ok(result,name+': '+JSON.stringify(result));report.checks.push(name);}
async function capture(name){await c.eval(`document.querySelector('#toast-stack').style.opacity='0'`);const {data}=await c.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});writeFileSync(resolve(out,name+'.png'),Buffer.from(data,'base64'));await c.eval(`document.querySelector('#toast-stack').style.opacity=''`);}
async function click(selector,touch=false){const r=await c.eval(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);if(touch){await c.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:r.x,y:r.y}]});await c.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}else{await c.send('Input.dispatchMouseEvent',{type:'mousePressed',x:r.x,y:r.y,button:'left',clickCount:1});await c.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:r.x,y:r.y,button:'left',clickCount:1});}await c.frames(2);}
try{
 await c.viewport(1440,1050,1,false);await c.goto(base+'?dpr=1');
 assert.ok(await c.waitFor('window.transport2?.game && document.querySelector("canvas")',30000),'game starts');
 let original=await c.eval('transport2.game.exportSave()');
 await c.frames(20);
 await check('company starts closed with no idle income',`!Object.values(transport2.game.state.routes).some(r=>r.unlocked) && transport2.game.state.cash===0`);
 await check('closed company earns nothing idle',`(()=>{transport2.game.tick(20);return transport2.game.state.cash===0 && transport2.game.state.deliveries===0})()`);
 for(let i=0;i<12;i++)await click('#hero-view');
 await check('cargo loading earns first purchase',`transport2.game.state.cash>=60 && !transport2.game.state.routes.grain.unlocked`);
 await click('[data-action=unlockRoute][data-id=grain]');
 await check('first company must be bought',`transport2.game.state.routes.grain.unlocked && !document.querySelector('#work-button')`);
 original=await c.eval('transport2.game.exportSave()');
 await check('simulation pays deliveries',`(()=>{const g=transport2.game;const d=g.state.deliveries;g.tick(60);return g.state.deliveries>d && Number.isFinite(g.state.cash)})()`);
 await check('save round trip',`(()=>{const g=transport2.game;g.save();const text=g.exportSave();const cash=g.state.cash;const r=g.importSave(text);return r.ok && Math.abs(g.state.cash-cash)<1})()`);
 await check('invalid save rejected',`transport2.game.importSave('{bad').ok===false`);
 await c.eval('transport2.game.tick(30)');
 await check('hero has size',`(()=>{const r=document.querySelector('#hero-view').getBoundingClientRect();return r.width>200&&r.height>150})()`);
 await click('[data-action="upgrade"][data-id="grain"]');
 await check('upgrade works through visible control','transport2.game.state.routes.grain.level===2');
 await click('#hero-pin');await check('camera pin works','transport2.scenes.debug.pinned===true');
 await click('#tour-button');await check('auto tour resumes','transport2.scenes.debug.pinned===false');
 await c.eval(`(()=>{for(let i=0;i<12&&!transport2.game.state.event;i++)transport2.game.tick(15)})()`);
 await check('random opportunity appears with a countdown',`!!transport2.game.state.event && !document.querySelector('#event-banner').hidden`);
 const eventCash=await c.eval('transport2.game.state.cash'),eventReward=await c.eval('transport2.game.state.event.reward');
 await click('#event-claim');
 await check('event claim pays the displayed reward',`transport2.game.state.event===null && transport2.game.state.cash>=${eventCash+eventReward}`);
 await click('[data-tab="research"]');await check('research tab works',`!!document.querySelector('[data-action="research"]')`);
 await click('[data-tab="contracts"]');await check('contracts tab works',`!!document.querySelector('[data-action="claimContract"]')`);
 await click('[data-tab="world"]');
 await c.eval('document.getElementById("operations-scroll").scrollTo(0,0)');
 await c.eval(`transport2.game.importSave(${JSON.stringify(original)})`);await c.frames(3);
 await capture('desktop');
 for(const w of [320,390,430]){
  await c.viewport(w,844,1,true);await c.frames(5);
  const layout=await c.eval(`({width:innerWidth,scroll:document.documentElement.scrollWidth,canvases:document.querySelectorAll('canvas').length,hero:document.querySelector('#hero-view').getBoundingClientRect().toJSON()})`);
  assert.ok(layout.scroll<=w+1,'horizontal overflow '+w+': '+layout.scroll);report.viewports.push(layout);
  await capture('mobile-'+w);
 }
 await click('#settings-button',true);await check('settings open with touch',`document.querySelector('#settings-dialog').open`);
 await check('dialog fits portrait',`(()=>{const r=document.querySelector('#settings-dialog').getBoundingClientRect();return r.x>=0&&r.right<=innerWidth})()`);
 await click('#settings-dialog .close-dialog',true);await check('settings close with touch',`!document.querySelector('#settings-dialog').open`);
 await c.eval(`(()=>{const s=JSON.parse(${JSON.stringify(original)});s.cash=1e14;s.totalEarned=1e14;s.deliveries=10000;s.unlockedRegions=['meadow','industrial','coastal','alpine','aerospace'];for(const r of Object.values(s.routes)){r.unlocked=true;r.manager=true;r.fleet=3;r.level=3;r.progress=.3;}return transport2.game.importSave(JSON.stringify(s))})()`);
 await c.viewport(1440,1050,1,false);await c.frames(3);
 for(const [region,id] of [['meadow','stone'],['industrial','steel'],['coastal','containers'],['alpine','summit'],['aerospace','orbital']]){
  await c.eval(`transport2.game.action('selectRegion',${JSON.stringify(region)});transport2.scenes.focus(${JSON.stringify(id)},true);document.getElementById("operations-scroll").scrollTo(0,0)`);await c.frames(18);
  await check('scene shares economy progress: '+id,`Math.abs(transport2.scenes.debug.snapshot(${JSON.stringify(id)}).progress-transport2.game.stats(${JSON.stringify(id)}).progress)<.1`);
  await capture('region-'+region);
 }
 const snapshot=await c.eval('transport2.scenes.debug.snapshot()');report.scene=snapshot;
 await click('#network-filter');await check('full network has fifteen live route views',`document.querySelectorAll('.route-card').length===15`);
 await c.eval(`transport2.scenes.focus('grain',true);document.getElementById("operations-scroll").scrollTo(0,0)`);await c.frames(3);
 const before=await c.eval('transport2.scenes.debug.snapshot("grain")');
 await c.eval('transport2.game.tick(1)');await c.frames(3);
 const after=await c.eval('transport2.scenes.debug.snapshot("grain")');
 assert.notEqual(before.vehicles[0].x+','+before.vehicles[0].z,after.vehicles[0].x+','+after.vehicles[0].z,'truck follows delivery progress');report.checks.push('truck moves with shared delivery progress');
 await c.eval('new Promise(r=>setTimeout(r,12300))');
 await check('pin holds across a complete tour interval',`transport2.scenes.debug.focus==='grain' && transport2.scenes.debug.pinned`);
 await c.eval('transport2.scenes.focus(null,false)');
 await c.eval('new Promise(r=>setTimeout(r,12300))');
 await check('automatic highlights advance after twelve seconds',`transport2.scenes.debug.focus!=='grain' && !transport2.scenes.debug.pinned`);
 await c.eval(`document.querySelector('#quality-select').value='low';document.querySelector('#quality-select').dispatchEvent(new Event('change'))`);
 await check('battery quality reduces pixel ratio',`transport2.game.state.settings.quality==='low' && transport2.scenes.debug.dpr<=1`);
 await c.eval(`document.querySelector('#quality-select').value='high';document.querySelector('#quality-select').dispatchEvent(new Event('change'))`);
 await click('#network-filter');
 await c.eval(`transport2.game.importSave(${JSON.stringify(original)});transport2.scenes.focus('grain',false);document.getElementById("operations-scroll").scrollTo(0,0)`);
 report.errors.push(...c.errors);assert.equal(report.errors.length,0,report.errors.join('\n'));
 writeFileSync(resolve(out,'report.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify(report,null,2));
}finally{c.close();}
