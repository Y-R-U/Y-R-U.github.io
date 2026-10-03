import {CDP} from './cdp.mjs';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const c=await CDP.launch({gpu:true});
const url=process.env.TRANSPORT_URL||'http://127.0.0.1:8888/gms/3d/idle-transport2/';
const out=process.env.TRANSPORT_OUTPUT_DIR||fileURLToPath(new URL('../docs/verification/',import.meta.url));mkdirSync(out,{recursive:true});
const checks=[];
const pixels=`(()=>{return [...document.querySelectorAll('.transport-scene-canvas')].filter(c=>{const r=c.getBoundingClientRect();return r.top<innerHeight&&r.bottom>0}).map(c=>{const p=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let lit=0,sum=0;for(let i=0;i<p.length;i+=80){const rgb=p[i]+p[i+1]+p[i+2];if(rgb>45)lit++;sum+=rgb;}return {width:c.width,height:c.height,lit,sum}})})()`;
async function painted(){const rows=await c.eval(pixels);assert(rows.length>=3);assert(rows.every(r=>r.lit>100),'views retain colored rendered pixels: '+JSON.stringify(rows));return rows;}
try{
 await c.viewport(390,844,1,true);await c.goto(url);assert(await c.waitFor('window.transport2?.scenes?.debug.frames>3',20000));
 await painted();checks.push('hero and visible business views contain rendered pixels');
 for(let i=0;i<3;i++){
  await c.eval('transport2.scenes.debug.suspend()');const before=await painted(),frame=await c.eval('transport2.scenes.debug.frames');
  assert(await c.eval('transport2.scenes.debug.loseContext()'),'context loss extension available');
  assert(await c.waitFor('transport2.scenes.debug.contextLost',5000));
  assert.deepEqual(await painted(),before,'last good snapshots survive lost GPU');
  await c.eval('transport2.scenes.debug.restoreContext()');assert(await c.waitFor(`!transport2.scenes.debug.contextLost&&transport2.scenes.debug.frames>${frame+2}`,15000));await painted();
 }
 checks.push('three forced GPU context losses restore without black frames');
 const before=await c.eval('transport2.scenes.debug.frames');
 await c.send('Page.setWebLifecycleState',{state:'frozen'});await new Promise(r=>setTimeout(r,350));await c.send('Page.setWebLifecycleState',{state:'active'});await c.send('Page.bringToFront');await c.send('Emulation.setFocusEmulationEnabled',{enabled:true});
 assert(await c.waitFor(`transport2.scenes.debug.frames>${before+2}`,10000),JSON.stringify(await c.eval('({frames:transport2.scenes.debug.frames,suspended:transport2.scenes.debug.suspended,contextLost:transport2.scenes.debug.contextLost,hidden:document.hidden})')));await painted();checks.push('real browser freeze and resume recover rendering');
 await c.eval('window.dispatchEvent(new PageTransitionEvent("pagehide",{persisted:true}))');assert(await c.eval('transport2.scenes.debug.suspended'));
 await c.eval('window.dispatchEvent(new PageTransitionEvent("pageshow",{persisted:true}))');await c.frames(5);await painted();
 await c.eval('window.dispatchEvent(new PageTransitionEvent("pageshow",{persisted:true}))');await c.frames(3);await painted();
 assert.equal(await c.eval('transport2.scenes.debug.rendererCount'),1);checks.push('back-forward-cache lifecycle retains one working renderer');
 await c.eval(`(()=>{const g=transport2.game,s=JSON.parse(g.exportSave());s.routes.grain.unlocked=true;s.routes.grain.manager=true;g.importSave(JSON.stringify(s));g.action('seasonStart');window.__resumeNow=Date.now;window.__resumeStamp=Date.now();Date.now=()=>window.__resumeStamp;g.save();window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));window.__resumeStamp+=30000;window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));window.__resumeStamp+=30000;window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));})()`);
 assert.equal(await c.eval('transport2.game.offlineReport.seconds'),60);
 const away=await c.eval('({cash:transport2.game.offlineReport.cash,remaining:transport2.game.state.season.run.remaining})');assert(away.cash>0);assert(away.remaining<=420&&away.remaining>419);
 await c.eval(`window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));Date.now=window.__resumeNow;delete window.__resumeNow;delete window.__resumeStamp;`);
 assert.equal(await c.eval('transport2.game.offlineReport.cash'),away.cash);checks.push('repeated lifecycle events award one complete away interval and expire seasonal time');
 await c.viewport(320,740,1,true);await c.frames(8);await painted();checks.push('recovered renderer handles portrait resize');
 assert.equal(c.errors.length,0,c.errors.join('\n'));
 const {data}=await c.send('Page.captureScreenshot',{format:'png'});writeFileSync(out+'/resume.png',Buffer.from(data,'base64'));
 writeFileSync(out+'/resume-report.json',JSON.stringify({url,checks,errors:c.errors,recoveries:await c.eval('transport2.scenes.debug.recoveries')},null,2));console.log(JSON.stringify(checks));
}finally{c.close();}
