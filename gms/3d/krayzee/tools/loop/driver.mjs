// LOOPTEST driver: raw CDP (node 22 global WebSocket), real touch on live element rects, a read-only observer.
// window.__game is only READ here (state, sim clock, logs); nothing in this file drives the game through it.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function connect(port) {
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  let page = list.find((t) => t.type === 'page' && !t.url.startsWith('chrome'));
  if (!page) page = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let seq = 0;
  const pending = new Map();
  const D = { errors: [], warns: [] };
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { const { r, j } = pending.get(d.id); pending.delete(d.id); d.error ? j(new Error(d.error.message)) : r(d.result); return; }
    if (d.method === 'Runtime.exceptionThrown') D.errors.push(String(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text).split('\n').slice(0, 3).join(' | '));
    else if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') D.errors.push(d.params.args.map((a) => a.value ?? a.description).join(' ').split('\n').slice(0, 3).join(' | '));
    else if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'warning') D.warns.push(d.params.args.map((a) => a.value ?? a.description).join(' ').slice(0, 200));
  };
  const send = (method, params = {}) => new Promise((r, j) => {
    const id = ++seq; pending.set(id, { r, j }); ws.send(JSON.stringify({ id, method, params }));
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); j(new Error(`CDP timeout ${method}`)); } }, 30000);
  });
  D.send = send;
  D.close = () => ws.close();
  D.ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  D.evSafe = async (expr, dflt = null) => { try { return await D.ev(expr); } catch (e) { return dflt; } };
  D.shot = async (dir, name) => {
    mkdirSync(dir, { recursive: true });
    const r = await send('Page.captureScreenshot', { format: 'png' });
    const p = join(dir, name + '.png');
    writeFileSync(p, Buffer.from(r.data, 'base64'));
    return p;
  };
  D.viewport = async (w, h) => {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: true, screenOrientation: { type: w > h ? 'landscapePrimary' : 'portraitPrimary', angle: w > h ? 90 : 0 } });
    await send('Emulation.setTouchEmulationEnabled', { enabled: false });
    await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await send('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S908B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36 HeadlessChrome' });
  };
  // the live rect of the first VISIBLE match (hidden attr, [hidden] ancestor, display/visibility/opacity, zero size all count as not there)
  const VIS = `(s) => { for (const e of document.querySelectorAll(s)) { if (e.hidden || e.closest('[hidden]')) continue; let n = e, ok = true;
    while (n && n.nodeType === 1) { const cs = getComputedStyle(n); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.05) { ok = false; break; } n = n.parentElement; }
    if (!ok) continue; const b = e.getBoundingClientRect(); if (b.width < 2 || b.height < 2) continue;
    return { x: b.x, y: b.y, w: b.width, h: b.height, cx: b.x + b.width / 2, cy: b.y + b.height / 2, txt: (e.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 80), state: e.dataset?.state || null }; } return null; }`;
  D.rect = (sel) => D.evSafe(`(${VIS})(${JSON.stringify(sel)})`);
  // is the topmost element at the point inside sel? (a tap on a covered button lands on whatever covers it)
  D.onTop = (sel, x, y) => D.evSafe(`(() => { const e = document.elementFromPoint(${x}, ${y}); return !!e && !!e.closest(${JSON.stringify(sel)}); })()`, false);
  // what a thumb at (x,y) would actually hit: the nearest classed ancestor of the topmost element
  D.hitName = (x, y) => D.evSafe(`(() => { let e = document.elementFromPoint(${x}, ${y}); while (e && !e.id && !(typeof e.className === 'string' && e.className.trim())) e = e.parentElement; return e ? (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\\s+/).join('.') : '') : null; })()`, null);
  let tid = 20;
  D.touchStart = (x, y, id) => send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id, radiusX: 4, radiusY: 4, force: 1 }] });
  D.touchMove = (x, y, id) => send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y, id, radiusX: 4, radiusY: 4, force: 1 }] });
  D.touchEnd = () => send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  D.tapAt = async (x, y) => { const id = ++tid; await D.touchStart(x, y, id); await sleep(70); await D.touchEnd(); };
  // tap the live centre of a visible element; returns the rect (null when not visible / covered)
  D.tap = async (sel, { requireTop = true } = {}) => {
    const r = await D.rect(sel);
    if (!r) return null;
    if (requireTop && !(await D.onTop(sel, r.cx, r.cy))) return { ...r, covered: true };
    await D.tapAt(r.cx, r.cy);
    return r;
  };
  // drag a real thumb from (x,y) by (dx,dy) and hold it there for holdMs (wall clock) before lifting, or until stop() says so
  // (HUDPOLISH E2: holds measured in SIM time stop through stop(): under load each touch dispatch waits for a slow frame, so a
  // wall-clock hold of 0.75 s became 12 s of sim hand-flying at 4x)
  D.hold = async (x, y, dx, dy, holdMs, during, stop) => {
    // a sim-timed hold drags in with 2 moves: under load every dispatch waits for a frame, and 8 of them were seconds of sim
    const id = ++tid, steps = stop ? 2 : 8;
    await D.touchStart(x, y, id);
    for (let i = 1; i <= steps; i++) { await sleep(25); await D.touchMove(x + dx * i / steps, y + dy * i / steps, id); }
    const t0 = Date.now();
    let k = 0;
    while (Date.now() - t0 < holdMs) {
      await sleep(120);
      await D.touchMove(x + dx + (k++ % 2), y + dy, id);
      if (during) await during();
      if (stop && await stop()) break;
    }
    await D.touchEnd();
  };
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  return D;
}

// One compact read of everything the suite observes. Never writes game state.
export const SNAP = `(() => { const g = window.__game; if (!g) return null; const S = g.S, P = S.player, T = g.traffic;
  // passive PP ledger (subscribes to the game's own events; the game object is rebuilt per play / difficulty)
  const L = (window.__loopLedger ||= []), G = g.wiring?.game;
  if (G && G !== window.__loopGame && G.on) { window.__loopGame = G;
    G.on('pp', (e) => L.push({ t: +(T?.time || 0).toFixed(1), k: 'pp', id: e.id, amt: e.amount }));
    G.on('loss', (e) => L.push({ t: +(T?.time || 0).toFixed(1), k: 'loss', id: e.reason, amt: -e.amount }));
    G.on('banked', (e) => L.push({ t: +(T?.time || 0).toFixed(1), k: 'banked', amt: e.amount }));
    G.on('scandal', (e) => L.push({ t: +(T?.time || 0).toFixed(1), k: 'scandal', amt: -(e.forfeit || 0) })); }
  const st = g.state(), gs = st.game?.game || null, gh = g.ghud;
  const land = document.querySelector('.krz-land');
  const p = st.player;
  return { simT: T ? +T.time.toFixed(2) : 0, simK: S.simK || 1, mode: st.mode, paused: st.paused, view: st.view, fps: st.fps, quality: st.quality, playMode: S.playMode,
    diff: g.wiring?.difficulty || null, type: S.type || null,
    p: p && { x: p.x, z: p.z, alt: p.alt, agl: p.agl, kt: p.speedKt, hdg: p.heading, bank: p.bank, pitch: p.pitch, fpm: p.vsFpm, gnd: p.onGround, crashed: p.crashed, cr: p.crashReason,
      surf: p.surface, phase: p.phase, leg: p.leg, sub: p.sub, i: p.legIndex, apMode: p.apMode, modes: p.modes, thr: +(p.ctl.throttle ?? 0).toFixed(2),
      thrMode: P?.axis?.throttle?.mode, done: !!P?.ap?.done, act: P?.ac?.time ?? null, vtol: P?.ac?.vtol ?? 0, landing: P?.ap?.landing ? (P.ap.landing.label || 'yes') + '/' + (P.ap.landing.pattern || '') : null, fuel: P?.ac?.fuelFraction },
    pending: gs?.pending ?? null, banked: gs?.banked ?? null, lifetime: gs?.lifetimePP ?? null, outrage: gs?.outrage ?? null, finishReady: gs?.finishReady ?? null,
    finish: gh?.finish ? { state: gh.finish.state, reason: gh.finish.reason } : null,
    ground: gh?.ground?.state ? { takeoff: !!gh.ground.state.takeoff, skip: !!gh.ground.state.skip } : null,
    land: land ? { hidden: land.hidden, state: land.dataset.state, now: land.dataset.now === '1', txt: land.innerText.replace(/\\s+/g, ' ').trim() } : null,
    ai: (st.ai || []).map((a) => [a.id, Math.round(a.x), Math.round(a.z), Math.round(a.alt), a.onGround ? 1 : 0, a.crashed ? 1 : 0, a.phase]),
    rwy: window.__loopRoutes && g.wiring?.activeEnd ? (() => { try { const e = window.__loopRoutes.runwayEnd(g.wiring.activeEnd()); return { id: e.id, thr: e.thr, hdg: e.hdg }; } catch (er) { return null; } })() : null,
    logN: g.log().length, ledgerN: L.length };
})()`;

// read-only geometry helper: the same module instance main.js uses (same URL), only for runway distance/bearing
export const LOAD_ROUTES = `import('./js/flight/routes.js').then((m) => { window.__loopRoutes = m; return 1; })`;
// distance (m) and bearing offset (deg) from the player to the active threshold, plus heading vs runway heading
export function rwyGeom(s) {
  if (!s?.p || !s.rwy?.thr) return null;
  const dx = s.rwy.thr[0] - s.p.x, dz = s.rwy.thr[1] - s.p.z;
  const brg = (Math.atan2(dx, -dz) * 180 / Math.PI + 360) % 360;
  const off = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
  return { dist: Math.hypot(dx, dz), off: off(brg, s.p.hdg), align: off(s.rwy.hdg, s.p.hdg), id: s.rwy.id };
}
