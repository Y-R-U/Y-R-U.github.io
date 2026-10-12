// Browser integration against explicit local service fixtures. No real users or payments.
// DARK is free; either entitlement (supporter or br8t Pass) opens CYBER/DEITIES; a missing purchase API is calm.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CDP, ROOT } from './cdp.mjs';
import { DEFAULT } from '../js/save.js';
const saves = new Map([['alice', { revision: 'cloud-alice', owner: 'alice', save: { ...DEFAULT(), level: 10, wins: 10, everWon: true, completed: true, darkUnlocked: true, thugWon: true, stash: { dark: { level: 5, wins: 5 } } } }]]);
let owned = true, passOwned = false, cloudFail = false, apiDown = true, live = false;
const hits = { offer: 0, entitlement: 0, portal: 0 };
const authModule = `const listeners=new Set();let uid=localStorage.getItem('fixture_uid');export const auth={get user(){return uid?{uid,anon:false}:null},get signedIn(){return !!uid},ready:async()=>auth.user,getIdToken:async()=>uid,onChange(fn){listeners.add(fn);fn(auth.user);return()=>listeners.delete(fn)}};export function setUser(value){uid=value;if(uid)localStorage.setItem('fixture_uid',uid);else localStorage.removeItem('fixture_uid');for(const fn of listeners)fn(auth.user)}`;
const cloudModule = `export const cloud={game(){return {async loadForUser(uid){const r=await fetch('/fixture/save?uid='+uid);if(!r.ok)throw Error('offline');return r.json()},async saveForUser(uid,data,revision){const r=await fetch('/fixture/save?uid='+uid,{method:'POST',body:JSON.stringify({data,revision})});if(!r.ok)throw Error('conflict')}}}}`;
const uiModule = `import {setUser} from './auth.js';export function mountAccount(){const b=document.createElement('button');b.id='fixtureLogin';b.textContent='Fixture sign in';b.onclick=()=>setUser('alice');document.body.append(b)};export function matchCompleted(){}`;
const prefix = '/gms/2d/ragdojo/';
const srv = createServer(async (req,res) => {
  const url = new URL(req.url,'http://localhost');
  const json = (status,data) => {res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(data));};
  if (url.pathname === '/fixture/save') {
    if(cloudFail){json(503,{});return}
    const uid=url.searchParams.get('uid');
    if(req.method==='POST') {let body='';for await(const c of req)body+=c;const {data,revision}=JSON.parse(body);if((saves.get(uid)?.revision||null)!==revision){json(409,{});return}saves.set(uid,data);json(200,{});return}
    json(200,saves.get(uid)||null);return;
  }
  if(url.pathname==='/api/br8t/entitlement'){hits.entitlement++;if(apiDown){json(503,{error:'upgrade is not configured yet'});return}const alice=req.headers.authorization==='Bearer alice';json(200,{testMode:!live,product:'ragdojo_supporter',owned:alice&&(owned||passOwned),entitlements:{ragdojo_supporter:alice&&owned,br8t_pass:alice&&passOwned},pass:alice&&passOwned?{active:true,status:'active',interval:'month',periodEnd:1800000000,cancelAtPeriodEnd:false,manage:true}:null});return}
  if(url.pathname==='/api/br8t/offer'){hits.offer++;if(apiDown){json(503,{error:'upgrade is not configured yet'});return}json(200,{testMode:!live,product:'ragdojo_supporter',currency:'aud',amount:199,items:[{key:'ragdojo_supporter',currency:'aud',amount:199},{key:'br8t_pass_monthly',currency:'aud',amount:149,interval:'month'},{key:'br8t_pass_yearly',currency:'aud',amount:499,interval:'year'}]});return}
  const modules={'/lib/auth/auth.js':authModule,'/lib/auth/cloud.js':cloudModule,'/lib/auth/ui.js':uiModule};
  if(modules[url.pathname]){res.writeHead(200,{'content-type':'text/javascript'});res.end(modules[url.pathname]);return}
  try {const p=url.pathname.startsWith(prefix)?url.pathname.slice(prefix.length):'missing';const data=await readFile(join(ROOT,'dist/home',p||'index.html'));const ext=p.split('.').pop();res.writeHead(200,{'content-type':({js:'text/javascript',html:'text/html',css:'text/css',mp3:'audio/mpeg',ttf:'font/ttf'})[ext]||(p?'application/octet-stream':'text/html')});res.end(data)}catch{res.writeHead(404);res.end()}
});
await new Promise(r=>srv.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${srv.address().port}${prefix}`;
const c=await CDP.launch({gpu:true});let second;
const start=async browser=>{await browser.viewport(900,460,1,true);await browser.goto(base);assert.ok(await browser.waitFor("!document.getElementById('startBtn').classList.contains('hidden')"));await browser.eval("document.getElementById('startBtn').click()");assert.ok(await browser.waitFor("document.getElementById('fixtureLogin')"));};
try {
 let navigations=0;c.on('Page.frameNavigated',p=>{if(!p.frame.parentId)navigations++});
 await start(c);await c.eval("document.getElementById('fixtureLogin').click()");
 assert.ok(await c.waitFor("document.getElementById('hubSub').textContent.includes('fight 11')"),'cloud career adopted');
 const world = async id => { await c.eval("document.getElementById('btnDark').click()"); assert.ok(await c.waitFor("document.getElementById('worlds').classList.contains('show')")); await c.eval(`document.querySelector('#worldRows [data-world="${id}"]').click()`); };
 const appIs = cls => c.eval(`document.getElementById('app').classList.contains('${cls}')`);
 // Purchase API not live: DARK is free, CYBER is calmly "coming soon", and nobody hammers the API.
 await world('dark');
 assert.ok(await appIs('dark'),'signed-in player enters free DARK with no purchase API');
 await world('cyborg');
 assert.ok(await c.waitFor("document.getElementById('purchaseStatus').textContent.toLowerCase().includes('coming soon')"),'unconfigured upgrade says coming soon');
 assert.ok(!(await appIs('cyborg')),'no entitlement, no CYBER');
 assert.ok(await c.eval("document.getElementById('btnCheckout').disabled && document.getElementById('btnRestore').classList.contains('hidden')"),'no dead checkout or restore');
 await c.eval("dispatchEvent(new Event('focus'));dispatchEvent(new Event('focus'))");
 await new Promise(r=>setTimeout(r,1500));
 assert.equal(hits.entitlement,0,'an unavailable purchase API is probed, never polled for ownership');
 const downPolls = hits.entitlement, downProbes = hits.offer;
 assert.ok(hits.offer<=3,`offer probes stay few (${hits.offer})`);
 await c.eval("document.getElementById('btnPremiumClose').click()");
 // The API comes up: restore by signing in, and the paid world opens.
 apiDown=false;
 await c.eval("document.getElementById('btnUpgrade').click()");
 assert.ok(await c.waitFor("!document.getElementById('btnRestore').classList.contains('hidden')"),'restore appears once the API answers');
 await c.eval("document.getElementById('btnRestore').click()");
 assert.ok(await c.waitFor("document.getElementById('purchaseStatus').textContent.includes('restored')"),await c.eval("document.getElementById('purchaseStatus').textContent"));
 await c.eval("document.getElementById('btnPremiumClose').click()");
 await world('cyborg');
 assert.ok(await c.waitFor("document.getElementById('app').classList.contains('cyborg')"),'verified supporter enters CYBER');
 await c.eval("document.getElementById('btnFight').click()");await c.frames(100);
 assert.ok(await c.eval("!document.getElementById('pauseBtn').classList.contains('hidden')"),'paid CYBER fight starts');
 // Re-checks never pull a fight out from under a paying player (R3: refresh() used to reset first).
 const inFight = async () => (await appIs('cyborg')) && await c.eval("!document.getElementById('pauseBtn').classList.contains('hidden')");
 const focus = async () => { const h0 = hits.entitlement; await c.eval("dispatchEvent(new Event('focus'))"); await new Promise(r=>setTimeout(r,1500)); return hits.entitlement - h0; };
 assert.ok(await focus() >= 1,'a window focus re-checks the entitlement');
 assert.ok(await inFight(),'a focus re-check leaves the paid fight running');
 apiDown=true;
 await focus();
 assert.ok(await inFight(),'a failed re-check (API 503) keeps the paid fight');
 apiDown=false; owned=false;
 await focus();
 assert.ok(await inFight(),'a refund seen mid-fight waits for the hub');
 await c.eval("document.getElementById('btnPause').click();document.getElementById('btnQuit').click()");
 assert.ok(await c.waitFor("!document.getElementById('app').classList.contains('cyborg')"),'and parks CYBER at the hub');
 owned=true;
 await c.eval("document.getElementById('btnUpgrade').click();document.getElementById('btnRestore').click()");
 assert.ok(await c.waitFor("document.getElementById('purchaseStatus').textContent.includes('restored')"),'restored again');
 await c.eval("document.getElementById('btnPremiumClose').click()");
 await world('cyborg');
 assert.ok(await c.waitFor("document.getElementById('app').classList.contains('cyborg')"),'back in CYBER');
 await c.eval("document.getElementById('btnFight').click()");await c.frames(100);
 assert.ok(await inFight(),'paid CYBER fight starts again');
 await c.eval("document.getElementById('btnPause').click();document.getElementById('btnQuit').click()");
 await new Promise(r=>setTimeout(r,3500));
 second=await CDP.launch({gpu:true});await start(second);await second.eval("document.getElementById('fixtureLogin').click()");
 assert.ok(await second.waitFor("document.getElementById('cloudStatus').textContent==='Cloud save ready.'"),'second device restores save');
 await second.eval("document.getElementById('btnUpgrade').click();document.getElementById('btnRestore').click()");
 assert.ok(await second.waitFor("document.getElementById('purchaseStatus').textContent.includes('restored')"),'second device restores purchase separately');
 // From here the payment API answers in LIVE mode: entitlements must count exactly the same.
 owned=false; live=true;
 await c.eval("document.getElementById('btnUpgrade').click();document.getElementById('btnRestore').click()");
 assert.ok(await c.waitFor("!document.getElementById('app').classList.contains('cyborg')"),'refund parks CYBER safely');
 assert.ok(await appIs('dark'),'into free DARK');
 assert.ok(await c.eval("JSON.parse(localStorage.getItem('ragdojo.save.v2')).thugWon"),'refund keeps earned progression');
 assert.ok(await c.eval("document.getElementById('btnManage').classList.contains('hidden')"),'no Manage subscription without a Pass');
 assert.ok(await c.eval("document.getElementById('btnPass').textContent.includes('A$1.49/MONTH') && document.getElementById('btnPassYear').textContent.includes('A$4.99/YEAR') && document.getElementById('btnCheckout').textContent.includes('A$1.99')"),await c.eval("[...document.querySelectorAll('#premium button')].map(b=>b.textContent).join(' | ')"));
 assert.ok(await c.eval("document.querySelector('#premium a[href=\"terms.html\"]') && document.querySelector('#premium a[href=\"privacy.html\"]')"),'terms and privacy linked');
 passOwned=true;
 await c.eval("document.getElementById('btnRestore').click()");
 assert.ok(await c.waitFor("document.getElementById('purchaseStatus').textContent.includes('br8t Pass is active')"),await c.eval("document.getElementById('purchaseStatus').textContent"));
 assert.ok(await c.eval("!document.getElementById('btnManage').classList.contains('hidden') && document.getElementById('btnPass').disabled && document.getElementById('btnPassYear').classList.contains('hidden') && !document.getElementById('btnCheckout').disabled"),'Pass holder: Manage shown, no second Pass, supporting still possible');
 await c.eval("document.getElementById('btnPremiumClose').click()");
 await world('cyborg');
 assert.ok(await c.waitFor("document.getElementById('app').classList.contains('cyborg')"),'a br8t Pass (live mode) opens CYBER');
 assert.ok(await c.eval("![...document.querySelectorAll('#premium button')].some(b=>b.textContent.includes('TEST'))"),'live mode: no (TEST) labels');
 passOwned=false;
 await c.eval("document.getElementById('btnUpgrade').click();document.getElementById('btnRestore').click()");
 assert.ok(await c.waitFor("!document.getElementById('app').classList.contains('cyborg')"),'a lapsed Pass parks CYBER');
 await c.eval("document.getElementById('btnPremiumClose').click()");
 await c.eval("import('/lib/auth/auth.js').then(m => m.setUser('bob'))");
 assert.ok(await c.waitFor("!document.getElementById('cloudChoice').classList.contains('hidden')"),'switching to another account requires save choice');
 assert.equal(saves.has('bob'),false,'previous account save not automatically copied');
 const before=navigations;await new Promise(r=>setTimeout(r,12000));assert.equal(navigations,before,'no signed-in reload loop');
 assert.equal(c.errors.length,0,c.errors.join('\n'));assert.equal(second.errors.length,0,second.errors.join('\n'));
 console.log(`PASS home account fixtures: free DARK; focus/failed/refund re-checks never end a paid fight (refund parks at the hub); purchase API down = calm 'coming soon', ${downPolls} entitlement polls / ${downProbes} offer probes while down; restore opens CYBER; two profiles restore saves + purchase; refund parks CYBER; Pass opens CYBER + Manage, lapse parks it; account-switch choice; 12-second reload guard; no runtime errors`);
} finally {c.close();second?.close();srv.close();}
