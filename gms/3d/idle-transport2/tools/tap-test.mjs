import {CDP} from './cdp.mjs';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const c=await CDP.launch({gpu:true});const url=process.env.TRANSPORT_URL||'http://127.0.0.1:8888/gms/3d/idle-transport2/';
const out=process.env.TRANSPORT_OUTPUT_DIR||fileURLToPath(new URL('../docs/verification/',import.meta.url));mkdirSync(out,{recursive:true});
const checks=[];
async function value(e){return c.eval(e)}
async function touch(x,y){await c.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});await c.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await c.frames(2)}
try{
 await c.viewport(390,844,1,true);await c.goto(url);assert(await c.waitFor('window.transport2?.game',20000));
 assert.equal(await value('!!document.querySelector("#work-button")'),false);checks.push('no anchored earn button');
 const rect=await value('document.querySelector(".hero-panel").getBoundingClientRect().toJSON()');
 for(const [nx,ny] of [[.2,.1],[.8,.1],[.1,.4],[.5,.45],[.9,.5]]){const cash=await value('transport2.game.state.cash');await touch(rect.x+rect.width*nx,rect.y+rect.height*ny);assert.equal(await value('transport2.game.state.cash'),cash+5)}checks.push('five distinct scene and HUD touch positions earn exactly once');
 assert(await value('document.querySelectorAll(".tap-money").length>0'));assert(await value('transport2.scenes.debug.snapshot().tapUntil>0'));checks.push('floating money and pooled world particles');
 let cash=await value('transport2.game.state.cash');const x=rect.x+rect.width*.45,y=rect.y+rect.height*.45;
 await c.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});await c.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y+45}]});await c.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert.equal(await value('transport2.game.state.cash'),cash);checks.push('swipes do not earn');
 await c.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y},{x:x+50,y}]});await c.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert.equal(await value('transport2.game.state.cash'),cash);checks.push('multi-touch does not earn');
 const control=await value('document.querySelector("#hero-pin").getBoundingClientRect().toJSON()');await touch(control.x+control.width/2,control.y+control.height/2);assert.equal(await value('transport2.game.state.cash'),cash);checks.push('camera controls do not also pay');
 await value('document.querySelector(".hero-panel").focus()');await c.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});await c.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});assert.equal(await value('transport2.game.state.cash'),cash+5);checks.push('keyboard scene earning');
 await value(`(()=>{const s=JSON.parse(transport2.game.exportSave());s.routes.grain.unlocked=true;s.cash=1000;transport2.game.importSave(JSON.stringify(s));transport2.game.action('selectRegion','meadow');})()`);
 cash=await value('transport2.game.state.cash');await touch(x,y);assert(await value('transport2.game.state.cash')>cash);checks.push('scene tapping remains useful after first company');
 await value('document.querySelector("[data-tab=fleet]").click()');assert(await value('!!document.querySelector("[data-action=policy]")'));await value(`Array.from(document.querySelectorAll('[data-action=policy]')).find(e=>e.dataset.id==='grain:heavy').click()`);assert.equal(await value('transport2.game.state.routes.grain.queuedPolicy'),'heavy');await value('transport2.game.tick(10)');assert.equal(await value('transport2.game.state.routes.grain.policy'),'heavy');checks.push('fleet policy queues and starts after delivery');
 await value(`(()=>{const s=JSON.parse(transport2.game.exportSave());s.routes.grain.level=15;s.routes.grain.fleet=6;s.routes.grain.deliveries=150;transport2.game.importSave(JSON.stringify(s));})()`);await c.frames(4);assert(await value('transport2.scenes.debug.snapshot("grain").visualTier')>=2);assert.equal(await value('transport2.game.stats("grain").masteryLevel'),3);checks.push('mastery bonuses and visible depot progression');
 await value(`document.querySelector('#operations-scroll').scrollTo(0,0);document.querySelector('#toast-stack').style.opacity='0'`);await touch(x,y);
 const {data}=await c.send('Page.captureScreenshot',{format:'png'});writeFileSync(out+'/tap-feedback.png',Buffer.from(data,'base64'));
 assert.equal(c.errors.length,0,c.errors.join('\n'));writeFileSync(out+'/tap-report.json',JSON.stringify({url,checks,errors:c.errors},null,2));console.log(JSON.stringify(checks));
}finally{c.close();}
