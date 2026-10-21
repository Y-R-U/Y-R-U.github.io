// Headless flight soak test (FLIGHT lane).
//   ~/.claude/bin/cdp start --port 9431 -- --use-angle=metal
//   node tools/test-flight.mjs [--only=boot,circuit,override,layout] [--url=...] [--speed=N]
// Checks: boots with no console errors; AP takes off, flies the circuit and lands on 09; stick override changes the
// path, release recovers and still lands; controls don't overlap in portrait / landscape / desktop.
// Screenshots → docs/shots/flight/.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(HERE, '..', 'docs', 'shots', 'flight');
mkdirSync(SHOTS, { recursive: true });
const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').split('=')[1] || d;
const PORT = +arg('port', 9431);
const BASE = arg('url', 'http://localhost:8888/gms/3d/krayzee/');
const ONLY = arg('only', 'boot,layout,pitch,circuit,override').split(',');
const TS = +arg('timescale', 1);
const TSQ = TS !== 1 ? `&timescale=${TS}` : '';

let ws, seq = 0;
const pending = new Map(), listeners = [];
async function connect() {
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  let page = list.find((t) => t.type === 'page');
  if (!page) page = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { const { r, j } = pending.get(d.id); pending.delete(d.id); d.error ? j(new Error(d.error.message)) : r(d.result); }
    else if (d.method) for (const l of listeners) l(d);
  };
}
const send = (method, params = {}) => new Promise((r, j) => { const id = ++seq; pending.set(id, { r, j }); ws.send(JSON.stringify({ id, method, params })); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function evaluate(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}
async function shot(name) {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  const p = join(SHOTS, name + '.png');
  writeFileSync(p, Buffer.from(r.data, 'base64'));
  return p;
}
async function viewport(w, h, mobile) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: mobile ? 2 : 1, mobile, screenOrientation: { type: w > h ? 'landscapePrimary' : 'portraitPrimary', angle: w > h ? 90 : 0 } });
  await send('Emulation.setTouchEmulationEnabled', mobile ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });
}
async function load(query, w = 1280, h = 800, mobile = false) {
  await viewport(w, h, mobile);
  errors.length = 0;
  await send('Page.navigate', { url: BASE + query });
  const t0 = Date.now();
  while (Date.now() - t0 < 30000) {
    await sleep(300);
    try { if (await evaluate('!!window.__krayzeeReady')) return true; } catch (e) { /* navigating */ }
  }
  return false;
}
// Wait until predicate(state) is true, polling; returns the last state.
async function waitFor(pred, secs, onTick) {
  const t0 = Date.now();
  let st;
  while ((Date.now() - t0) / 1000 < secs) {
    st = await evaluate('window.__game.state()');
    if (onTick) await onTick(st);
    if (pred(st)) return { ok: true, st };
    await sleep(500);
  }
  return { ok: false, st };
}

const errors = [];
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); };

function overlaps(r) {
  const keys = Object.keys(r), bad = [];
  for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
    const a = r[keys[i]], b = r[keys[j]];
    if (!a.w || !b.w) continue;
    if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) bad.push(`${keys[i]}×${keys[j]}`);
  }
  return bad;
}
const offscreen = (r, w, h) => Object.entries(r).filter(([, a]) => a.w && (a.x < 0 || a.y < 0 || a.x + a.w > w + 0.5 || a.y + a.h > h + 0.5)).map(([k]) => k);

async function main() {
  await connect();
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable'); await send('Log.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  listeners.push((d) => {
    if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
    if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errors.push(d.params.args.map((a) => a.value ?? a.description).join(' '));
    if (d.method === 'Log.entryAdded' && d.params.entry.level === 'error' && !/voices\/.*sample|favicon|br8t|firebase|googleapis/i.test(d.params.entry.url || d.params.entry.text)) errors.push(d.params.entry.text + ' ' + (d.params.entry.url || ''));
  });

  // seed a pilot so the first-run creator doesn't cover the attract scene
  await send('Page.navigate', { url: BASE + 'docs/' });
  await sleep(800);
  await evaluate(`localStorage.setItem('krayzee.profile', JSON.stringify({ name: 'Dirk', gender: 'm', company: 'Dirk Air', primary: '#b3122e', secondary: '#f4efe6', accent: '#d4a017', voice: 'toff', registration: 'K-DIRK', rank: 0 }))`);

  if (ONLY.includes('boot')) {
    console.log('\n== boot / attract');
    const ok = await load('?noaccount=1');
    check('boot: ready within 30 s', ok);
    await sleep(6000);
    const st = await evaluate('window.__game.state()');
    check('attract: 2+ AI planes alive', st.ai.length >= 2, `${st.ai.length} planes: ${st.ai.map((a) => a.phase).join(', ')}`);
    console.log('  shot', await shot('attract-desktop'));
    check('boot: no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  }

  if (ONLY.includes('layout')) {
    console.log('\n== layout');
    for (const [w, h, mob, tag] of [[390, 844, true, 'portrait'], [844, 390, true, 'landscape'], [1280, 800, false, 'desktop']]) {
      await load('?start=free&noaccount=1', w, h, mob);
      await sleep(2500);
      const r = await evaluate('window.__game.controlsRects()');
      const ov = overlaps(r), off = offscreen(r, w, h);
      check(`layout ${tag}: controls don't overlap`, ov.length === 0, ov.join(', '));
      check(`layout ${tag}: controls inside viewport`, off.length === 0, off.join(', '));
      const hud = await evaluate(`(() => { const a = document.querySelector('#krz-hud').getBoundingClientRect(); return { x: a.x, y: a.y, w: a.width, h: a.height }; })()`);
      const hudOv = overlaps({ hud, ...r }).filter((s) => s.startsWith('hud'));
      check(`layout ${tag}: HUD clear of controls`, hudOv.length === 0, hudOv.join(', '));
      await evaluate(`window.__game.setView('cockpit')`);
      await sleep(1200);
      console.log('  shot', await shot(`play-${tag}-cockpit`));
      await evaluate(`window.__game.setView('chase')`);
      await sleep(1200);
      console.log('  shot', await shot(`play-${tag}-chase`));
      check(`layout ${tag}: no console errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
    }
  }

  if (ONLY.includes('pitch')) {
    console.log('\n== pitch sign (D9/D10): real touch drag DOWN on the stick → nose UP; stick on the left');
    await load('?start=free&noaccount=1&view=chase', 390, 844, true);
    await sleep(1500);
    await evaluate(`window.__game.teleport({ x: 0, z: 2500, alt: 400, heading: 90, speedKt: 90, throttle: 0.6 })`);
    await sleep(2500);
    const r = (await evaluate('window.__game.controlsRects()')).stick;
    check('stick: on the LEFT by default (D10)', r.x + r.w / 2 < 390 / 2, `stick centre x ${(r.x + r.w / 2).toFixed(0)}`);
    const cx = r.x + r.w / 2, cy = r.y + r.h * 0.55;
    const p0 = (await evaluate('window.__game.state()')).player;
    const tp = (x, y) => [{ x, y, id: 1, radiusX: 8, radiusY: 8, force: 1 }];
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: tp(cx, cy) });
    for (let i = 1; i <= 8; i++) { await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: tp(cx, cy + i * 8) }); await sleep(30); }
    await sleep(300);
    const mid = (await evaluate('window.__game.state()')).player;
    await sleep(1200);
    const p1 = (await evaluate('window.__game.state()')).player;
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    check('pitch: drag down → elevator positive (nose-up command)', mid.ctl.elevator > 0.3 && mid.modes.elevator === 'manual', `elevator ${mid.ctl.elevator.toFixed(2)} mode ${mid.modes.elevator}`);
    check('pitch: drag down → the nose rises', p1.pitch > p0.pitch + 3, `pitch ${p0.pitch}° → ${p1.pitch}°`);
    await sleep(500);
    const p2 = (await evaluate('window.__game.state()')).player;
    check('pitch: finger up → stick released (RESUMING)', p2.modes.elevator !== 'manual', p2.modes.elevator);
    // keyboard: ArrowDown = nose up too
    await sleep(4500);
    const k0 = (await evaluate('window.__game.state()')).player;
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 });
    await sleep(1200);
    const k1 = (await evaluate('window.__game.state()')).player;
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 });
    check('pitch: ArrowDown → nose up', k1.ctl.elevator > 0.3 && k1.pitch > k0.pitch + 2, `elevator ${k1.ctl.elevator.toFixed(2)}, pitch ${k0.pitch}° → ${k1.pitch}°`);
    check('pitch: no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  }

  if (ONLY.includes('circuit')) {
    console.log('\n== circuit (AP: takeoff → circuit → land on the active runway)');
    await load('?auto=1&noaccount=1&view=chase' + TSQ, 844, 390, true);
    const seen = new Set();
    let maxAlt = 0, shotTaken = {};
    const res = await waitFor((s) => s.player && (s.player.crashed || (s.player.lastTouchdown && s.player.leg === 'taxi')), 420, async (s) => {
      if (!s.player) return;
      seen.add(s.player.phase); maxAlt = Math.max(maxAlt, s.player.alt);
      for (const ph of ['TAKEOFF ROLL', 'DOWNWIND', 'FINAL', 'FLARE']) if (s.player.phase === ph && !shotTaken[ph]) { shotTaken[ph] = true; await shot('circuit-' + ph.toLowerCase().replace(' ', '-')); }
    });
    const p = res.st?.player;
    check('circuit: took off and climbed to pattern height', maxAlt > 220, `max alt ${maxAlt.toFixed(0)} m`);
    check('circuit: flew downwind, base and final', ['DOWNWIND', 'BASE', 'FINAL'].every((x) => seen.has(x)), [...seen].join(' > '));
    check('circuit: no crash', p && !p.crashed, p?.crashReason);
    const td = p?.lastTouchdown, end = res.st?.activeEnd || '09', hdg = +end * 10;
    const herr = p ? Math.abs(((p.heading - hdg + 540) % 360) - 180) : 999;
    check(`circuit: landed on runway ${end} (ATC active end)`, !!td && td.surface === 'runway' && herr < 100 && td.fpm < 800, td && `${Math.round(td.fpm)} fpm ${td.grade}, heading ${p.heading}`);
    const g = res.st?.game?.game;
    const pps = (await evaluate('window.__game.log()')).filter((l) => l.type === 'pp');
    const crimes = pps.filter((l) => l.id !== 'impeccable');
    check('circuit: autopilot alone commits no infractions (DESIGN §1)', g && g.stats.infractions === 0 && crimes.length === 0, `infractions ${g?.stats.infractions}; PP events: ${pps.map((l) => `${l.id}+${l.amount}`).join(', ') || 'none'}`);
    check('circuit: no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  }

  if (ONLY.includes('override')) {
    console.log('\n== override (stick input on downwind, release, AP recovers and lands)');
    await load('?start=free&noaccount=1&view=chase' + TSQ, 1280, 800, false);
    await evaluate(`window.__modes = new Set(); setInterval(() => { const p = window.__game.state().player; if (p) window.__modes.add(p.apMode); }, 100)`);
    let injected = false, before = null, after = null, sawManual = false, sawResume = false;
    const res = await waitFor((s) => s.player && (s.player.crashed || (injected && s.player.lastTouchdown && s.player.leg === 'taxi')), 480, async (s) => {
      const p = s.player; if (!p) return;
      if (p.apMode === 'MANUAL') sawManual = true;
      if (p.apMode === 'RESUMING') sawResume = true;
      if (!injected && p.phase === 'DOWNWIND') {
        injected = true; before = { ...p };
        await evaluate(`window.__game.setControls({ aileron: -0.45, elevator: 0.1 }, ${2500 / TS})`);
        await sleep(2600 / TS);
        await evaluate(`window.__game.setControls({ aileron: 0, elevator: 0.3 }, ${9000 / TS})`);
        await sleep(9200 / TS);
        after = (await evaluate('window.__game.state()')).player;
        await shot('override-after-release');
      }
    });
    const p = res.st?.player;
    const dh = before && after ? Math.abs(((after.heading - before.heading + 540) % 360) - 180) : 0;
    check('override: stick input changed the path', dh > 50, `heading ${before?.heading} → ${after?.heading}`);
    const modes = await evaluate('[...window.__modes]');
    const hudTxt = await evaluate(`document.querySelector('.krz-ap-mode').textContent`);
    check('override: AP state went MANUAL → RESUMING → AUTOPILOT', ['MANUAL', 'RESUMING', 'AUTOPILOT'].every((m) => modes.includes(m)) && hudTxt === 'AUTOPILOT', modes.join(','));
    check('override: no crash', p && !p.crashed, p?.crashReason);
    check('override: AP still landed on the runway', !!p?.lastTouchdown && p.lastTouchdown.surface === 'runway', p?.lastTouchdown && `${Math.round(p.lastTouchdown.fpm)} fpm`);
    const log = await evaluate('window.__game.log()');
    check('override: AP replanned after release', log.some((l) => l.type === 'ap.replan'));
    check('override: no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  }

  const fails = results.filter((r) => !r.ok);
  console.log(`\n${results.length - fails.length}/${results.length} passed`);
  ws.close();
  process.exit(fails.length ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(2); });
