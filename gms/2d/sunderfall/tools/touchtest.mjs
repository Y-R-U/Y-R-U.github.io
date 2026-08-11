#!/usr/bin/env node
/* Does the cast button fire where the player thinks it should, and does it keep
 * firing after a touch goes missing?
 *
 * Drives real touches over raw CDP and counts the casts the SPELL SYSTEM
 * actually performs — not the UI flash, which was the whole problem: the circle
 * lit up and nothing came out of it. The cast has a cooldown, so it is cleared
 * before every tap; otherwise the results alternate and mean nothing.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = process.argv[2] || 'http://localhost:8888/gms/2d/sunderfall/game/';
const PORT = 9500 + (process.pid % 400);
const prof = mkdtempSync(join(tmpdir(), 'sf-touch-'));

const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${prof}`,
  '--hide-scrollbars', '--mute-audio', '--no-first-run', '--disable-gpu-vsync',
  '--enable-unsafe-swiftshader', '--use-gl=angle',
  '--autoplay-policy=no-user-gesture-required', 'about:blank',
], { stdio: 'ignore' });

const cleanup = () => {
  try { chrome.kill(); } catch { /* already gone */ }
  try { rmSync(prof, { recursive: true, force: true, maxRetries: 3 }); } catch { /* chrome still holds it */ }
};
process.on('exit', cleanup);

async function target() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const p = list.find(t => t.type === 'page');
      if (p && p.webSocketDebuggerUrl) return p.webSocketDebuggerUrl;
    } catch { /* not up yet */ }
    await sleep(250);
  }
  throw new Error('no devtools target');
}

const ws = new WebSocket(await target());
await new Promise(r => ws.addEventListener('open', r, { once: true }));
let id = 0;
const waiting = new Map();
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); }
});
const send = (method, params = {}) => new Promise((res, rej) => {
  const n = ++id;
  waiting.set(n, (m) => (m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result)));
  ws.send(JSON.stringify({ id: n, method, params }));
});
const evalJS = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval threw');
  return r.result.value;
};

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await send('Page.navigate', { url: URL + '?scene=play&nosave&noenemies&dpr=1' });
for (let i = 0; i < 80; i++) {
  if (await evalJS('!!(window.__sunderfall && window.__sunderfall.world && window.__sunderfall.world.player)').catch(() => false)) break;
  await sleep(250);
}
await sleep(600);

await evalJS(`(() => {
  const ctx = window.__sunderfall;
  window.__casts = 0;
  ctx.bus.on('spell:cast', () => { window.__casts++; });
  ctx.input.touchActive = true;              // show the on-screen controls
  window.dispatchEvent(new Event('resize'));
  window.__pid = -1;                         // whatever id the real touch came in on
  ctx.R.canvas.addEventListener('pointerdown', (e) => { window.__pid = e.pointerId; }, true);
  window.__ready = () => {                   // clear the cooldown and refill focus
    const S = ctx.spells && ctx.spells.system;
    if (!S) return false;
    S.focus = S.focusMax;
    for (const c of S.circles) c.cd = 0;
    return true;
  };
  return true;
})()`);
await sleep(400);

const zone = await evalJS(`(() => {
  const z = window.__sunderfall.input.getZones().find(z => z.id === 'ui.slot0');
  const r = z.rectFn({});
  return { x: r.x, y: r.y, w: r.w, h: r.h };
})()`);
console.log('CAST ZONE', JSON.stringify(zone), '— readyHook', await evalJS('window.__ready()'));

const R0 = 44, PAD = 12;
const ox = zone.x + R0 + PAD, oy = zone.y + R0 + PAD;   // the circle's centre

async function tap(x, y, label) {
  await evalJS('window.__ready()');
  const before = await evalJS('window.__casts');
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await sleep(160);
  const jump = await evalJS(`window.__sunderfall.input.held('jump')`);   // read it while down
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(200);
  const cast = (await evalJS('window.__casts')) - before;
  console.log(`  ${label.padEnd(30)} cast=${cast}  jump=${jump}`);
  return { cast, jump };
}

let fails = 0;
const want = async (label, x, y, expectCast, expectJump) => {
  const r = await tap(x, y, label);
  const ok = (r.cast > 0) === expectCast && r.jump === expectJump;
  if (!ok) { fails++; console.log(`    ^ wanted cast=${expectCast} jump=${expectJump}`); }
};

console.log('taps:');
await want('centre of the button', ox, oy, true, false);
await want('bottom half of the button', ox, oy + 38, true, false);
await want('just under the button', ox, oy + 62, true, false);
await want('well under it', ox, oy + 95, true, false);
await want('right of it', ox + 60, oy + 4, true, false);
await want('above it — jump', ox - 4, oy - 120, false, true);
await want('well above it — jump', ox + 10, oy - 260, false, true);

/* A touch whose `pointerup` never arrives. The browser signals this by taking
 * the capture away; before the fix `cast` stayed held and nothing cast again. */
console.log('lost touch:');
await evalJS('window.__ready()');
await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: ox, y: oy }] });
await sleep(150);
const heldDuring = await evalJS(`window.__sunderfall.input.held('cast')`);
await evalJS(`(() => {
  const cv = window.__sunderfall.R.canvas;
  cv.dispatchEvent(new PointerEvent('lostpointercapture', { pointerId: window.__pid, bubbles: true }));
  return window.__pid;
})()`);
await sleep(150);
const heldAfter = await evalJS(`window.__sunderfall.input.held('cast')`);
console.log(`  held during the touch = ${heldDuring}, after the capture was lost = ${heldAfter}`);
if (heldDuring && heldAfter) { fails++; console.log('    ^ still latched — the button is dead'); }
await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await sleep(200);
await want('and it casts again', ox, oy, true, false);

console.log(fails ? `FAIL — ${fails} case(s)` : 'PASS — every case behaved');
ws.close();
cleanup();
process.exit(fails ? 1 : 0);
