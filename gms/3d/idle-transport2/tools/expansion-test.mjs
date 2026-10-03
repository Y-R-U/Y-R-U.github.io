import {CDP} from './cdp.mjs';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const c=await CDP.launch({gpu:true});
const url=process.env.TRANSPORT_URL||'http://127.0.0.1:8888/gms/3d/idle-transport2/';
const out=process.env.TRANSPORT_OUTPUT_DIR||fileURLToPath(new URL('../docs/verification/',import.meta.url));mkdirSync(out,{recursive:true});
const checks=[];
async function touch(selector){
 await c.eval(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)throw new Error('Missing or disabled control: '+${JSON.stringify(selector)});e.scrollIntoView({block:'center',inline:'nearest'})})()`);await c.frames(3);
 const p=await c.eval(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();const x=r.x+r.width/2,y=r.y+r.height/2;const hit=document.elementFromPoint(x,y);if(!hit?.closest(${JSON.stringify(selector)}))throw new Error('Control is covered: '+${JSON.stringify(selector)}+' by '+hit?.outerHTML);return {x,y}})()`);
 await c.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p]});await c.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await c.frames(3);
}
async function capture(name){const {data}=await c.send('Page.captureScreenshot',{format:'png'});writeFileSync(out+'/'+name+'.png',Buffer.from(data,'base64'));}
try{
 await c.viewport(390,844,1,true);await c.goto(url);assert(await c.waitFor('window.transport2?.game',20000));
 await c.eval(`(()=>{const s=JSON.parse(transport2.game.exportSave());s.cash=1e14;for(const id of ['grain','timber','stone'])s.routes[id].unlocked=true;transport2.game.importSave(JSON.stringify(s));})()`);
 for(const width of [320,390,430]){
  await c.viewport(width,844,1,true);await c.frames(5);
  assert(await c.eval(`(()=>{const rows=[...document.querySelectorAll('.route-card')];return rows.every(row=>{const card=row.getBoundingClientRect(),scene=row.querySelector('.route-view').getBoundingClientRect();return card.left>=0&&card.right<=innerWidth&&scene.width/card.width>.98&&[...row.querySelectorAll('button')].every(b=>{const r=b.getBoundingClientRect();return r.width>=44&&r.height>=44&&r.left>=card.left&&r.right<=card.right&&r.top>=card.top&&r.bottom<=card.bottom})})&&document.documentElement.scrollWidth<=innerWidth})()`),'full-size controls must be entirely inside every portrait card at '+width);
 }
 checks.push('full-width scenes and 44px controls fit three portrait widths');
 await c.viewport(390,844,1,true);await touch('[data-route=grain] [data-quantity="10"]');
 const before=await c.eval('transport2.game.state.routes.grain.level');await touch('[data-route=grain] [data-action=upgrade]');assert.equal(await c.eval('transport2.game.state.routes.grain.level'),before+10);checks.push('touch quantity selector buys ten production levels');
 await touch('[data-route=grain] [data-action=fleet]');assert.equal(await c.eval('transport2.game.state.routes.grain.fleet'),11);checks.push('bulk fleet purchase adds ten vehicles');
 await touch('[data-route=grain] [data-quantity=max]');await touch('[data-route=grain] [data-action=storage]');assert.equal(await c.eval('transport2.game.state.routes.grain.storageLevel'),50);assert(await c.eval('document.querySelector("[data-route=grain] [data-action=storage]").disabled'));checks.push('maximum storage purchase respects the upgrade cap');
 await touch('[data-route=grain] [data-info=grain]');assert(await c.eval('document.querySelector("#route-dialog").open'));assert(await c.eval('document.querySelector("#route-dialog-content").textContent.includes("Cargo capacity")'));await capture('business-info');await touch('#route-dialog .close-dialog');checks.push('business details and policies live in the info popup');
 await touch('[data-route=grain] [data-action=manager]');assert.equal(await c.eval('transport2.game.state.routes.grain.managerLevel'),1);await touch('[data-route=grain] [data-action=manager]');assert(await c.eval('document.querySelector("#manager-dialog").open'));await touch('[data-action=managerUpgrade][data-id=grain]');await touch('[data-action=managerUpgrade][data-id=grain]');assert.equal(await c.eval('transport2.game.stats("grain").managerSlots'),2);await capture('manager-office');await touch('#manager-dialog .close-dialog');checks.push('manager icon opens development office and unlocks slots');
 await touch('[data-tab=season]');await touch('[data-action=seasonStart]');
 assert.equal(await c.eval('document.querySelectorAll(".season-business").length'),3);const mainCash=await c.eval('transport2.game.state.cash');
 for(let i=0;i<30;i++)await touch('[data-action=seasonTap]');await touch('[data-action=seasonUnlock][data-id=candy]');await touch('[data-action=seasonClaim][data-id=harvest]');assert(await c.eval('transport2.game.state.inventory.includes("pumpkin-crate")'));checks.push('season practice has three businesses and earns a permanent reward');
 assert(await c.eval(`transport2.game.state.cash>=${mainCash}`));await capture('season-practice');
 await touch('[data-route=grain] [data-info=grain]');await touch('[data-action=equip][data-id="pumpkin-crate|business:grain"]');assert(await c.eval('transport2.game.state.equipment.businesses.grain.includes("pumpkin-crate")'));await touch('[data-action=detach][data-id=pumpkin-crate]');assert.equal(await c.eval('transport2.game.state.equipment.businesses.grain.length'),0);checks.push('earned tools attach and detach through the info popup');await touch('#route-dialog .close-dialog');
 await c.eval(`(()=>{const run=transport2.game.state.season.run;const coins=run.coins;for(let i=0;i<8;i++)transport2.game.tick(60);return coins})()`);assert.equal(await c.eval('transport2.game.state.season.run.remaining'),0);assert(await c.eval('document.querySelector("[data-action=seasonTap]").disabled'));checks.push('expired seasonal shift disables work and purchases');
 await c.eval(`document.querySelector('#operations-scroll').scrollTo(0,0);transport2.scenes.focus('grain',true);document.querySelector('#toast-stack').style.opacity='0'`);await c.frames(8);await capture('wide-businesses');
 assert.equal(c.errors.length,0,c.errors.join('\n'));writeFileSync(out+'/expansion-report.json',JSON.stringify({url,checks,errors:c.errors},null,2));console.log(JSON.stringify(checks));
}finally{c.close();}
