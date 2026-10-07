// Serve real release assets through CDP interception at a literal LAN IP origin.
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { CDP, ROOT, serve } from './cdp.mjs';
import { DEFAULT } from '../js/save.js';
import { FAMILY_KEY } from '../js/family-access.js';
const c = await CDP.launch({ gpu: true });
let srv = await serve(join(ROOT, 'dist/home'));
const faults = [];
c.on('Fetch.requestPaused', async ({requestId, request}) => {
  try {
    const url = new URL(request.url), response = await fetch(srv.base + url.pathname + url.search);
    await c.send('Fetch.fulfillRequest', {requestId, responseCode: response.status, responseHeaders: [{name:'Content-Type', value:response.headers.get('content-type') || 'application/octet-stream'}], body:Buffer.from(await response.arrayBuffer()).toString('base64')});
  } catch (error) { faults.push(String(error)); await c.send('Fetch.failRequest', {requestId,errorReason:'Failed'}); }
});
async function open(origin) {
  await c.goto(origin + '/index.html');
  assert(await c.waitFor("!document.getElementById('startBtn').classList.contains('hidden')"));
  await c.eval("document.getElementById('startBtn').click()");
}
try {
  await c.send('Fetch.enable', {patterns:[{urlPattern:'*'}]});
  await c.viewport(390,844,1,true);
  const lan = 'http://192.168.1.40';
  await open(lan);
  await c.eval("document.getElementById('btnUpgrade').click()");
  assert(await c.eval("!document.getElementById('btnFamilySkip').classList.contains('hidden')"));
  for (const width of [320,390]) {
    await c.viewport(width,844,1,true); await c.frames(3);
    assert(await c.eval("(()=>{const e=document.getElementById('btnFamilySkip'),r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight&&Math.min(r.width,r.height)>=44&&hit?.closest('#btnFamilySkip')===e})()"),'family button fits and receives touch at '+width);
  }
  await c.shot('/tmp/ragdojo-family-popup.png');
  await c.eval("document.getElementById('btnFamilySkip').click()");
  assert.equal(await c.eval("document.getElementById('app').classList.contains('dark')"),false,'family exception preserves earned prerequisites');
  assert(await c.eval("document.getElementById('purchaseStatus').textContent.includes('win a BULLY')"));
  await c.eval(`localStorage.setItem('ragdojo.save.v2',${JSON.stringify(JSON.stringify({...DEFAULT(), everWon:true, darkUnlocked:true, completed:true, level:44, wins:45}))})`);
  await open(lan);
  await c.eval("document.getElementById('btnDark').click()");
  assert(await c.eval("document.getElementById('app').classList.contains('dark')"),'remembered family access enters earned DARK');
  await c.eval("document.getElementById('btnFight').click()"); await c.frames(15);
  assert(await c.eval("!document.getElementById('pauseBtn').classList.contains('hidden')"),'family DARK fight starts');
  await open('http://example.test');
  await c.eval(`localStorage.setItem(${JSON.stringify(FAMILY_KEY)},'yes');document.getElementById('btnDark').click()`);
  assert(await c.eval("document.getElementById('premium').classList.contains('show')"));
  assert(await c.eval("document.getElementById('btnFamilySkip').classList.contains('hidden')"));
  await c.eval("document.getElementById('btnFamilySkip').click()");
  assert.equal(await c.eval("document.getElementById('app').classList.contains('dark')"),false);
  srv.close(); srv = await serve(join(ROOT, 'dist/itch'));
  await open(lan); await c.eval("document.getElementById('btnDark').click()");
  assert(await c.eval("document.getElementById('premium').classList.contains('show')"),'itch denies saved LAN exception');
  assert(await c.eval("document.getElementById('btnFamilySkip').classList.contains('hidden')"));
  assert.deepEqual(faults,[]); assert.deepEqual(c.errors,[]);
  console.log('PASS family LAN popup, progression prerequisite, remembered access, DARK fight, public-host denial and itch exclusion');
} finally { c.close(); srv.close(); }
