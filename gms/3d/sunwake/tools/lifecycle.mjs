import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {connect} from './cdp.mjs';
const p=await connect(),report={};let second;
const evidence=new URL('../docs/evidence/',import.meta.url).pathname;
async function click(id){const r=await p.eval(`(()=>{const r=document.getElementById('${id}').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);await p.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...r});await p.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...r});}
async function key(code,type='keyDown'){await p.send('Input.dispatchKeyEvent',{type,code,key:code==='Tab'?'Tab':code.slice(3).toLowerCase()});}
try{
 await p.goto();await p.wait('window.__SUNWAKE_BOOTED__');await p.eval('sunwakeTest.restartVoyage();sunwakeTest.resumeTime()');
 await key('KeyW');await p.eval('sunwakeTest.advance(60)');assert.equal((await p.eval('sunwake.input')).throttle,1);
 // A real viewport orientation change must release held input.
 await p.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:3,mobile:true});await p.eval('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');assert.equal((await p.eval('sunwake.input')).throttle,0);await key('KeyW','keyUp');report.orientationClears=true;
 await key('KeyM');await key('KeyM','keyUp');assert.equal(await p.eval('sunwake.mode'),'chart');const time=await p.eval('sunwake.simulationTime');await p.eval('sunwakeTest.advance(120)');assert.equal(await p.eval('sunwake.simulationTime'),time);report.chartPauses=true;
 // All six card pin buttons use actual DOM click semantics; one keyboard activation.
 await p.eval("document.querySelectorAll('.atlas-card button')[4].focus()");await p.send('Input.dispatchKeyEvent',{type:'keyDown',code:'Enter',key:'Enter',windowsVirtualKeyCode:13});await p.send('Input.dispatchKeyEvent',{type:'keyUp',code:'Enter',key:'Enter',windowsVirtualKeyCode:13});assert.equal(await p.eval('sunwake.exploration.pin'),'1:-2');report.keyboardPin=true;
 await p.eval("[...document.getElementById('chart').querySelectorAll('button')].at(-1).focus()");await key('Tab');await key('Tab','keyUp');assert.equal(await p.eval('document.activeElement.id'),'chart-close');report.focusTrap=true;
 await key('Escape');await key('Escape','keyUp');assert.equal(await p.eval('sunwake.mode'),'water');
 await click('pause');await click('settings-open');await click('reduced');assert.equal(await p.eval('sunwake.reduced'),true);
 await click('sound');assert.equal(await p.eval('sunwake.settings.sound'),true);await click('sound');
 await click('restart');assert.equal(await p.eval("document.getElementById('restart-confirm').hidden"),false);const distance=await p.eval('sunwake.exploration.distanceM');await click('restart-no');assert.equal(await p.eval('sunwake.exploration.distanceM'),distance);await click('restart');await click('restart-yes');assert.equal(await p.eval('sunwake.exploration.distanceM'),0);assert.equal(await p.eval('sunwake.mode'),'water');report.restartConfirmation=true;report.settings=true;
 // Browser visibility, not a synthetic DOM event.
 await p.eval('sunwakeTest.resumeTime()');await p.send('Page.bringToFront');second=await connect();await second.goto('about:blank');await second.send('Page.bringToFront');
 report.background=await p.eval('({hidden:document.hidden,mode:sunwake.mode,input:sunwake.input})');
 if(report.background.hidden)assert.equal(report.background.mode,'paused');
 await second.close();second=null;await p.send('Page.bringToFront');
 report.visibilityEmulated=report.background.hidden;
 assert.deepEqual(p.errors,[]);report.errors=p.errors;report.passed=true;console.log('PASS lifecycle',JSON.stringify(report));
}catch(e){report.failure=e.stack;throw e;}finally{if(second)await second.close();await p.close();await writeFile(evidence+'m7-lifecycle.json',JSON.stringify(report,null,2));}
