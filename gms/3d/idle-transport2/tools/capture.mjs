#!/usr/bin/env node
import {CDP} from './cdp.mjs';
import {mkdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const out=fileURLToPath(new URL('../docs/verification/',import.meta.url));mkdirSync(out,{recursive:true});
const c=await CDP.launch({gpu:true});
const url=process.env.TRANSPORT_URL||'http://127.0.0.1:8888/gms/3d/idle-transport2/';
async function capture(name){await c.eval("document.querySelector('#toast-stack').style.opacity='0'");await c.frames(20);const {data}=await c.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});writeFileSync(out+name+'.png',Buffer.from(data,'base64'));}
try{
 await c.viewport(1440,1050,1,false);await c.goto(url+'?dpr=1');if(!await c.waitFor('window.transport2?.scenes',20000))throw new Error('Game failed to load');
 await capture('desktop');const original=await c.eval('transport2.game.exportSave()');
 for(const w of [320,390,430]){await c.viewport(w,844,1,true);await c.eval('document.getElementById("operations-scroll").scrollTo(0,0)');await capture('mobile-'+w);}
 await c.viewport(390,844,1,true);await c.eval("document.querySelector('.route-card').scrollIntoView({block:'start'})");await capture('mobile-routes');
 await c.eval(`(()=>{const s=JSON.parse(${JSON.stringify(original)});s.cash=350000000;s.totalEarned=50000000000;s.deliveries=10000;s.unlockedRegions=['meadow','industrial','coastal','alpine','aerospace'];for(const r of Object.values(s.routes)){r.unlocked=true;r.manager=true;r.fleet=3;r.level=3;r.progress=.28;}transport2.game.importSave(JSON.stringify(s));})()`);
 await c.viewport(1440,1050,1,false);
 for(const [region,id] of [['meadow','stone'],['industrial','steel'],['coastal','containers'],['alpine','summit'],['aerospace','orbital']]){await c.eval(`transport2.game.action('selectRegion',${JSON.stringify(region)});transport2.scenes.focus(${JSON.stringify(id)},true);document.getElementById("operations-scroll").scrollTo(0,0)`);await capture('region-'+region);}
 await c.eval("document.querySelector('#network-filter').click()");await c.viewport(390,844,1,true);await c.eval("document.querySelector('[data-camera=grain]').click()");await c.eval('new Promise(r=>setTimeout(r,1200))');
 const heroTop=await c.eval("document.querySelector('#hero-view').getBoundingClientRect().top");if(heroTop< -5||heroTop>50)throw new Error('Route pin failed to reveal hero: '+heroTop);
 await c.eval(`transport2.game.importSave(${JSON.stringify(original)})`);
 if(c.errors.length)throw new Error(c.errors.join('\n'));console.log(JSON.stringify({captured:10,consoleErrors:c.errors,routePinRevealsHero:true}));
}finally{c.close();}
