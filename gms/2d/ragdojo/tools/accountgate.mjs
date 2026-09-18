// Browser integration against explicit local service fixtures. No real users or payments.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CDP, ROOT } from './cdp.mjs';
import { DEFAULT } from '../js/save.js';
const saves = new Map([['alice', { revision: 'cloud-alice', owner: 'alice', save: { ...DEFAULT(), level: 10, wins: 10, everWon: true, darkUnlocked: true } }]]);
let owned = true, cloudFail = false;
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
  if(url.pathname==='/api/ragdojo/entitlement'){json(200,{product:'ragdojo_dark',owned:req.headers.authorization==='Bearer alice'&&owned,testMode:true});return}
  if(url.pathname==='/api/ragdojo/offer'){json(200,{product:'ragdojo_dark',testMode:true,currency:'aud',amount:500});return}
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
 await c.eval("document.getElementById('btnUpgrade').click();document.getElementById('btnRestore').click()");
 assert.ok(await c.waitFor("document.getElementById('purchaseStatus').textContent.includes('restored')"),await c.eval("document.getElementById('purchaseStatus').textContent"));
 await c.eval("document.getElementById('btnPremiumClose').click();document.getElementById('btnDark').click()");
 assert.ok(await c.eval("document.getElementById('app').classList.contains('dark')"),'verified owner enters DARK');
 await c.eval("document.getElementById('btnFight').click()");await c.frames(100);
 assert.ok(await c.eval("!document.getElementById('pauseBtn').classList.contains('hidden')"),'paid DARK fight starts');
 await c.eval("document.getElementById('btnPause').click();document.getElementById('btnQuit').click()");
 await new Promise(r=>setTimeout(r,3500));
 second=await CDP.launch({gpu:true});await start(second);await second.eval("document.getElementById('fixtureLogin').click()");
 assert.ok(await second.waitFor("document.getElementById('cloudStatus').textContent==='Cloud save ready.'"),'second device restores save');
 await second.eval("document.getElementById('btnUpgrade').click();document.getElementById('btnRestore').click()");
 assert.ok(await second.waitFor("document.getElementById('purchaseStatus').textContent.includes('restored')"),'second device restores purchase separately');
 owned=false;
 await c.eval("document.getElementById('btnUpgrade').click();document.getElementById('btnRestore').click()");
 assert.ok(await c.waitFor("!document.getElementById('app').classList.contains('dark')"),'refund parks DARK safely');
 assert.ok(await c.eval("JSON.parse(localStorage.getItem('ragdojo.save.v2')).darkUnlocked"),'refund keeps earned progression');
 await c.eval("import('/lib/auth/auth.js').then(m => m.setUser('bob'))");
 assert.ok(await c.waitFor("!document.getElementById('cloudChoice').classList.contains('hidden')"),'switching to another account requires save choice');
 assert.equal(saves.has('bob'),false,'previous account save not automatically copied');
 const before=navigations;await new Promise(r=>setTimeout(r,12000));assert.equal(navigations,before,'no signed-in reload loop');
 assert.equal(c.errors.length,0,c.errors.join('\n'));assert.equal(second.errors.length,0,second.errors.join('\n'));
 console.log('PASS home account fixtures: two isolated browser profiles restore saves + purchase; DARK fight; refund; account-switch choice; 12-second reload guard; no runtime errors');
} finally {c.close();second?.close();srv.close();}
