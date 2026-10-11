// Serve real release assets through CDP interception at a literal LAN IP origin.
// DARK is free for everyone; the 192.* family skip stands in for the supporter upgrade (CYBER/DEITIES).
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
const DARK = {...DEFAULT(), everWon:true, darkUnlocked:true, completed:true, level:44, wins:45};
const THUG = {...DARK, thugWon:true, theme:'cyborg', level:7, stash:{light:{level:44,wins:45,completed:true}, dark:{level:44,wins:45,completed:true}}};
const isApp = cls => c.eval(`document.getElementById('app').classList.contains('${cls}')`);
const shown = id => c.eval(`document.getElementById('${id}').classList.contains('show')`);
const hidden = id => c.eval(`document.getElementById('${id}').classList.contains('hidden')`);
async function open(origin, save, family) {
  await c.goto(origin + '/index.html');
  assert(await c.waitFor("!document.getElementById('startBtn').classList.contains('hidden')"));
  if (save) await c.eval(`localStorage.setItem('ragdojo.save.v2',${JSON.stringify(JSON.stringify(save))})`);
  if (family !== undefined) await c.eval(family ? `localStorage.setItem(${JSON.stringify(FAMILY_KEY)},'yes')` : `localStorage.removeItem(${JSON.stringify(FAMILY_KEY)})`);
  if (save || family !== undefined) {
    await c.goto(origin + '/index.html');
    assert(await c.waitFor("!document.getElementById('startBtn').classList.contains('hidden')"));
  }
  await c.eval("document.getElementById('startBtn').click()");
}
const toWorld = async id => {
  await c.eval("document.getElementById('btnDark').click()");
  await c.eval(`document.querySelector('#worldRows [data-world="${id}"]').click()`);
};
try {
  await c.send('Fetch.enable', {patterns:[{urlPattern:'*'}]});
  await c.viewport(390,844,1,true);
  const lan = 'http://192.168.1.40';

  await open(lan, DARK, false);
  await c.eval("document.getElementById('btnDark').click()");
  assert(await isApp('dark'), 'DARK needs no family skip and no purchase');

  await open(lan, THUG, false);
  assert.equal(await isApp('cyborg'), false, 'unpaid CYBER is parked at boot');
  assert(await isApp('dark'), 'parked into free DARK');
  await toWorld('cyborg');
  assert(await shown('premium'), 'earned CYBER asks for the upgrade');
  assert.equal(await hidden('btnFamilySkip'), false);
  for (const width of [320,390]) {
    await c.viewport(width,844,1,true); await c.frames(3);
    assert(await c.eval("(()=>{const e=document.getElementById('btnFamilySkip'),r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight&&Math.min(r.width,r.height)>=44&&hit?.closest('#btnFamilySkip')===e})()"),'family button fits and receives touch at '+width);
  }
  await c.shot('/tmp/ragdojo-family-popup.png');
  await c.eval("document.getElementById('btnFamilySkip').click()");
  assert(await isApp('cyborg'), 'family skip walks straight into the world it was asked from');
  await c.eval("document.getElementById('btnFight').click()"); await c.frames(15);
  assert(await c.eval("!document.getElementById('pauseBtn').classList.contains('hidden')"),'family CYBER fight starts');

  await open(lan);
  assert(await isApp('cyborg'), 'remembered family access keeps CYBER open after a reload');

  await open(lan, DARK, false);
  await c.eval("document.getElementById('btnUpgrade').click();document.getElementById('btnFamilySkip').click()");
  assert.equal(await isApp('cyborg'), false, 'family exception preserves earned prerequisites');
  assert(await c.eval("document.getElementById('purchaseStatus').textContent.includes('THUG')"));

  await open('http://example.test', THUG, true);
  assert(await isApp('dark'), 'public host: DARK free');
  await toWorld('cyborg');
  assert(await shown('premium'));
  assert(await hidden('btnFamilySkip'), 'a saved family flag is ignored on a public host');
  await c.eval("document.getElementById('btnFamilySkip').click()");
  assert.equal(await isApp('cyborg'), false);

  srv.close(); srv = await serve(join(ROOT, 'dist/itch'));
  await open(lan, THUG, true);
  assert(await isApp('dark'), 'itch: DARK free');
  await toWorld('cyborg');
  assert(await shown('premium'),'itch denies saved LAN exception');
  assert(await hidden('btnFamilySkip'));
  assert.deepEqual(faults,[]); assert.deepEqual(c.errors,[]);
  console.log('PASS free DARK on LAN/public/itch, family skip opens earned CYBER and fits at 320/390, remembered access, prerequisites kept, public-host denial and itch exclusion');
} finally { c.close(); srv.close(); }
