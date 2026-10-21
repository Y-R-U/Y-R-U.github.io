// Drives tools/radio.html over raw CDP: real touch/mouse input, overlap checks, screenshots.
import fs from 'node:fs';
const PORT = 9461;
const OUT = '/Users/aaronair/cc/yru/site/gms/3d/krayzee/docs/shots/radio';
const URL = 'http://localhost:8888/gms/3d/krayzee/tools/radio.html?seed=7';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const tabs = await (await fetch(`http://localhost:${PORT}/json/list`)).json();
const page = tabs.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map(); const logs = [];
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); }
  if (d.method === 'Runtime.consoleAPICalled') logs.push(d.params.type + ': ' + d.params.args.map((a) => a.value ?? a.description).join(' '));
  if (d.method === 'Runtime.exceptionThrown') logs.push('EXC: ' + JSON.stringify(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text));
};
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, (d) => r(d.result ?? d)); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.value;

await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });

const results = [];
async function shot(name) {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.data, 'base64'));
}
async function rect(sel) { return ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)}); if(!e||e.hidden||!e.offsetParent&&getComputedStyle(e).position!=='fixed') return null; const r=e.getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height}})()`); }
const overlap = (a, b) => a && b && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
async function tap(x, y, touch) {
  if (touch) {
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await sleep(60);
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  }
  await sleep(250);
}
async function tapSel(sel, touch) { const r = await rect(sel); if (!r) throw new Error('no ' + sel); await tap(r.x + r.w / 2, r.y + r.h / 2, touch); return r; }
async function waitFor(expr, ms = 8000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(expr)) return true; await sleep(100); } return false; }
async function checkLayout(tag) {
  const z = { stick: await rect('.zl'), throttle: await rect('.zr'), topBtns: await rect('.tr') };
  const ui = { panel: await rect('.krz-r-panel'), button: await rect('.krz-r-btn'), subs: await rect('.krz-r-subs'), tower: await rect('.krz-r-tower') };
  const bad = [];
  for (const [un, ur] of Object.entries(ui)) for (const [zn, zr] of Object.entries(z)) if (overlap(ur, zr)) bad.push(`${un}x${zn}`);
  if (overlap(ui.panel, ui.tower)) bad.push('panel x tower');
  for (const [zn, zr] of Object.entries(z)) if (zr && zn !== 'topBtns') {
    const hit = await ev(`!!document.elementFromPoint(${zr.x + zr.w / 2}, ${zr.y + zr.h / 2})?.closest('.krz-radio > *')`);
    if (hit) bad.push(`${zn} centre covered`);
  }
  if (overlap(ui.subs, ui.tower)) bad.push('subs x tower');
  const vw = await ev('innerWidth'), vh = await ev('innerHeight');
  for (const [un, ur] of Object.entries(ui)) if (ur && (ur.x < 0 || ur.y < 0 || ur.x + ur.w > vw + 0.5 || ur.y + ur.h > vh + 0.5)) bad.push(`${un} offscreen`);
  results.push(`${tag}: overlaps=${bad.length ? bad.join(',') : 'none'}`);
  return bad;
}

const VIEWS = [
  { name: 'portrait', w: 390, h: 844, mobile: true },
  { name: 'landscape', w: 844, h: 390, mobile: true },
  { name: 'desktop', w: 1280, h: 800, mobile: false },
];
for (const v of VIEWS) {
  await send('Emulation.setDeviceMetricsOverride', { width: v.w, height: v.h, deviceScaleFactor: v.mobile ? 2 : 1, mobile: v.mobile, screenOrientation: v.w > v.h ? { type: 'landscapePrimary', angle: 90 } : { type: 'portraitPrimary', angle: 0 } });
  await send('Emulation.setTouchEmulationEnabled', { enabled: v.mobile, maxTouchPoints: v.mobile ? 5 : 0 });
  await send('Page.navigate', { url: 'about:blank' });
  await sleep(300);
  await send('Page.navigate', { url: URL });
  await sleep(500);
  await waitFor('!!window.__radio', 8000);
  await waitFor('window.__bench.log.some(l=>l.startsWith("loaded"))', 5000);
  const T = v.mobile;
  const P = v.name;

  // 1. initiate menu from the radio button
  await tapSel('.krz-r-btn', T);
  const menuOpen = await waitFor('__radio.state.window?.kind==="menu"', 2000);
  await sleep(250);
  await checkLayout(`${P} menu`);
  await shot(`${P}-1-menu`);
  await tapSel('.krz-r-chip:nth-child(1)', T);
  const b1 = await waitFor('__bench.log.some(l=>l.startsWith("barked") && l.includes("menu"))', 2000);
  results.push(`${P}: menu open=${menuOpen} chip tap barked=${b1}`);
  await sleep(900);
  await shot(`${P}-2-player-bark`);

  // 2. scold -> response window after the scold finishes
  await ev(`__bench.fire('You cut in (scold)')`);
  const resp = await waitFor('__radio.state.window?.kind==="response"', 12000);
  await sleep(300);
  await checkLayout(`${P} response`);
  await shot(`${P}-3-scold-response`);
  await tapSel('.krz-r-chip:nth-child(2)', T);
  const b2 = await waitFor('__bench.log.some(l=>l.startsWith("barked") && l.includes("response"))', 2000);
  results.push(`${P}: response open=${resp} chip tap barked=${b2} state=${JSON.stringify(await ev('__radio.state'))}`);

  // 3. meltdown + insult window that times out
  await ev(`__radio.handleEvent({type:'outrage', value: 88})`);
  await sleep(9000); // inbound window gap is 8 s
  await ev(`__bench.fire('Rival insults you')`);
  const r3 = await waitFor('__radio.state.window?.kind==="response"', 10000);
  await sleep(1200);
  await shot(`${P}-4-meltdown-insult`);
  const timedOut = await waitFor('__bench.log.some(l=>l.includes("closed: timeout"))', 7000);
  results.push(`${P}: insult window=${r3} auto-dismissed=${timedOut}`);

  // 4. log drawer: tap the live subtitle pill
  await ev(`__bench.fire('Clear you to land')`);
  await waitFor('document.querySelector(".krz-r-pill.in")', 4000);
  await tapSel('.krz-r-pill.in', T).catch((e) => results.push(String(e)));
  await sleep(300);
  const drawer = await ev(`!document.querySelector('.krz-r-drawer').hidden`);
  await shot(`${P}-5-log`);
  results.push(`${P}: log drawer opened by tap=${drawer}`);
}
console.log(results.join('\n'));
console.log('console:', logs.filter((l) => !l.startsWith('log')).slice(0, 20).join('\n'));
ws.close();
