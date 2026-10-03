import {CDP} from './cdp.mjs';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const c=await CDP.launch({gpu:true});const result=[];
const url=process.env.TRANSPORT_URL||'http://127.0.0.1:8888/gms/3d/idle-transport2/';
try{
 await c.viewport(390,844,1,true);await c.goto(url);assert(await c.waitFor('window.transport2?.scenes',20000));
 const saved=await c.eval('transport2.game.exportSave()');
 await c.eval(`(()=>{const s=JSON.parse(${JSON.stringify(saved)});s.cash=10000;s.routes.grain.unlocked=true;s.routes.timber.unlocked=true;s.routes.stone.unlocked=true;transport2.game.importSave(JSON.stringify(s));})()`);
 for(const [w,h] of [[320,740],[390,844],[430,844]]){
  await c.viewport(w,h,1,true);await c.eval('document.getElementById("operations-scroll").scrollTo(0,0)');await c.frames(8);
  const read=`(()=>{const main=document.querySelector('#operations-scroll').getBoundingClientRect();return {hero:document.querySelector('#hero-view').getBoundingClientRect().toJSON(),masthead:document.querySelector('.masthead').getBoundingClientRect().toJSON(),main:main.toJSON(),rows:[...document.querySelectorAll('.route-card')].map(e=>e.getBoundingClientRect().toJSON()),renderer:transport2.scenes.debug.rendererCount,overflow:document.documentElement.scrollWidth>innerWidth}})()`;
  const full=await c.eval(read);assert(!full.overflow);assert.equal(full.renderer,1);assert(full.rows[1].bottom<=h,'two full rows at '+w);
  await c.eval('document.getElementById("operations-scroll").scrollTop=120');await c.frames(10);
  const compact=await c.eval(read);assert(compact.hero.height<full.hero.height);assert.equal(compact.hero.top,full.hero.top);assert.equal(compact.masthead.top,0);assert(compact.rows.every(r=>r.top>=compact.main.top-1&&r.bottom<=h+1),'three full rows after collapse '+w+': '+JSON.stringify(compact));
  const {data}=await c.send('Page.captureScreenshot',{format:'png'});writeFileSync(fileURLToPath(new URL('../docs/verification/compact-'+w+'.png',import.meta.url)),Buffer.from(data,'base64'));
  await c.eval('document.getElementById("operations-scroll").scrollTop=0');await c.frames(8);const restored=await c.eval(read);assert.equal(restored.hero.height,full.hero.height);
  result.push({width:w,height:h,fullHero:full.hero.height,compactHero:compact.hero.height,twoRowsAtTop:true,threeRowsCollapsed:true,rendererCount:1});
 }
 await c.eval(`transport2.game.importSave(${JSON.stringify(saved)})`);
 assert.equal(c.errors.length,0,c.errors.join('\n'));writeFileSync(fileURLToPath(new URL('../docs/verification/layout-report.json',import.meta.url)),JSON.stringify({url,result,errors:c.errors},null,2));console.log(JSON.stringify(result));
}finally{c.close();}
