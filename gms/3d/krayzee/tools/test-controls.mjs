// CONTROLS lane: D37 AUTO button (real touch, 390×844 + 844×390) and desktop mouse aim (real mouse + keys, 1280×800).
// window.__game is only READ (state, sim clock), except under --falsify, which breaks the build on purpose.
//   ~/.claude/bin/cdp start --port 9721 -- --use-angle=metal
//   node tools/test-controls.mjs [--port=9721] [--url=...] [--only=portrait,landscape,desktop] [--shots]
//   node tools/test-controls.mjs --falsify=countdown|autooff|layout|aim|toggle   (each must turn its checks red)
// Screenshots: docs/shots/controls/.
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect, sleep } from './loop/driver.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(HERE, '..', 'docs', 'shots', 'controls');
mkdirSync(SHOTS, { recursive: true });
const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').split('=')[1] || d;
const PORT = +arg('port', 9721);
const BASE = arg('url', 'http://127.0.0.1:8888/gms/3d/krayzee/');
const ONLY = arg('only', 'portrait,landscape,desktop').split(',');
const FALSIFY = arg('falsify', '');
const TS = 4;
const PROFILE = { name: 'Ctl', gender: 'm', company: 'Ctl Air', primary: '#1d4fa0', secondary: '#f4efe6', accent: '#d4a017', voice: 'toff', registration: 'K-CTRL' };
const SEEN = { 'krayzee.coach': { goal: 1, stick: 1, release: 1, radio: 1, bank: 1 }, 'krayzee.coachTakeoff': 1, 'krayzee.hints': { ctx: 'seen', map: 'seen', auto: 'seen', mouse: 'seen' } };

let D;
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); return !!ok; };
const r1 = (v) => Math.round(v * 10) / 10;
const simT = () => D.evSafe('window.__game?.traffic?.time ?? 0', 0);
const A = () => D.evSafe('window.__game.autoState()');
const P = () => D.evSafe('(() => { const p = window.__game.state().player; const S = window.__game.S.player; return p && { apMode: p.apMode, modes: p.modes, bank: p.bank, hdg: p.heading, agl: p.agl, kt: p.speedKt, gnd: p.onGround, crashed: p.crashed, thr: p.ctl.throttle, brakeM: S.manual.brake, trk: S.ac.track ?? p.heading }; })()');
async function untilSim(fn, secs, ms = 120) {
  const t0 = await simT(), r0 = Date.now();
  for (;;) {
    const v = await fn(); if (v) return { v, dt: (await simT()) - t0 };
    const t = await simT();
    if (t - t0 > secs || Date.now() - r0 > (secs / TS) * 3000 + 15000) return { v: null, dt: t - t0 };
    await sleep(ms);
  }
}
const waitSim = async (secs, during) => { const t0 = await simT(), r0 = Date.now(); while ((await simT()) - t0 < secs && Date.now() - r0 < (secs / TS) * 3000 + 15000) { if (during) await during(); await sleep(100); } };
const hit = (a, b) => a && b && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const shot = (n) => D.shot(SHOTS, n).then((p) => console.log('  shot', p));

async function fresh(w, h, { desktop = false, settings = {} } = {}) {
  if (desktop) {
    await D.send('Emulation.setTouchEmulationEnabled', { enabled: false });
    await D.send('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 HeadlessChrome' });
    await D.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
    await D.send('Emulation.setFocusEmulationEnabled', { enabled: true }); await D.send('Page.bringToFront');
  } else await D.viewport(w, h);
  await D.front();   // a stray chrome:// tab in front leaves this page hidden: no rAF, the sim never runs
  await D.send('Page.navigate', { url: BASE + 'docs/' }); await sleep(400);
  await D.ev(`(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('krayzee.')) localStorage.removeItem(k);
    localStorage.setItem('krayzee.profile', ${JSON.stringify(JSON.stringify(PROFILE))});
    const x = ${JSON.stringify(SEEN)}; for (const k in x) localStorage.setItem(k, JSON.stringify(x[k]));
    localStorage.setItem('krayzee.settings', JSON.stringify({ v: 3, difficulty: 'easy', ...${JSON.stringify(settings)} })); return 1; })()`);
  D.errors.length = 0;
  await D.send('Page.navigate', { url: `${BASE}?noaccount=1&intro=0&start=free&plane=c172&timescale=${TS}` });
  const up = await untilSim(() => D.evSafe('!!window.__game?.S?.player && window.__game.S.player.ac.agl > 90 && !window.__game.S.player.ac.onGround'), 120, 300);
  if (!check('boot: airborne in Free Flight (> 90 m AGL)', up.v)) throw new Error('no flight');
  await sleep(600);
}
async function falsifyAfterSpawn() {
  if (FALSIFY === 'countdown') await D.ev('(() => { __game.S.player.wait = 1.5; return 1; })()');
  if (FALSIFY === 'autooff') await D.ev('(() => { __game.traffic.setAutoOff = () => {}; return 1; })()');
  if (FALSIFY === 'layout') await D.ev(`(() => { const s = document.createElement('style'); s.textContent = '.krz-autobtn { left: 14px !important; right: auto !important; bottom: calc(var(--sb, 0px) + var(--krz-ctl-bottom, 200px) + 12px) !important; }'; document.head.append(s); return 1; })()`);
  if (FALSIFY === 'aim') await D.ev('(() => { const m = __game.mouseAimObj, u = m.update; m.update = (...a) => { const r = u(...a); return r && { ...r, aileron: -r.aileron, rudder: -r.rudder }; }; return 1; })()');
}
// a real thumb on the stick for `secs` of SIM time, then lifted
async function stick(secs, dx = 30, dy = 6, during) {
  const b = await D.rect('.krz-stick-base');
  const t0 = await simT();
  await D.hold(b.cx, b.cy, dx, dy, (secs / TS) * 1000 * 25, during, async () => (await simT()) - t0 >= secs);
}
async function tapAuto() {
  const r = await D.rect('.krz-autobtn');
  if (!r) return false;
  if (!(await D.onTop('.krz-autobtn', r.cx, r.cy))) return 'covered';
  await D.tapAt(r.cx, r.cy);
  return true;
}

// ---------------------------------------------------------------- touch: the AUTO button
async function touchCase(orient) {
  const [w, h] = orient === 'portrait' ? [390, 844] : [844, 390];
  console.log(`\n== touch ${orient} ${w}×${h}`);
  await fresh(w, h);
  await falsifyAfterSpawn();
  const tag = orient === 'portrait' ? 'pt' : 'ls';
  // 1. where it sits
  const a0 = await A(), btn = await D.rect('.krz-autobtn');
  check(`${tag} AUTO button shown in flight reading AUTO (state on)`, btn && a0?.btn === 'on' && /^AUTO\b/.test(btn.txt), btn ? `${btn.txt} @ ${Math.round(btn.x)},${Math.round(btn.y)} ${Math.round(btn.w)}×${Math.round(btn.h)}` : 'not visible');
  const others = {};
  for (const s of ['.krz-land', '.krz-stick-zone', '.krz-thr-col', '.krz-pad', '.krz-r-btn', '.krz-map-chip', '.krz-top-l', '.krz-top-r', '.krz-warp', '.krz-r-tower', '#krz-hud .krz-hud-strip']) others[s] = await D.rect(s);
  const clash = Object.entries(others).filter(([, r]) => hit(btn, r)).map(([s]) => s);
  check(`${tag} AUTO clashes with none of LAND / stick / throttle / pad / radio / map / top buttons`, btn && !clash.length && others['.krz-land'], clash.join(', ') || (others['.krz-land'] ? 'clear (LAND shown too)' : 'LAND not shown'));
  check(`${tag} AUTO is the topmost element at its centre (a thumb hits it)`, btn && (await D.onTop('.krz-autobtn', btn.cx, btn.cy)));
  check(`${tag} AUTO is on the stick side, within thumb reach of the stick zone`, btn && others['.krz-stick-zone'] && btn.cx < w / 2 && btn.y > h * 0.3);
  await shot(`${tag}-auto-on`);

  // 2. a hand on the stick → "AUTO 10" (hold); let go → counts down; no AP for ~10 s
  let holdSeen = null;
  await stick(2, 30, 6, async () => { const a = await A(); if (a?.btn === 'hold') holdSeen ??= a.label; });
  const tRel = await simT();
  const c0 = await untilSim(async () => { const a = await A(); return a?.btn === 'count' && a; }, 1.5);
  await shot(`${tag}-auto-countdown`);
  check(`${tag} stick held → AUTO reads "AUTO 10" (hold)`, holdSeen === 'AUTO 10', holdSeen);
  check(`${tag} let go → the button counts down from AUTO 10`, c0.v && /^AUTO (10|9)$/.test(c0.v.label), c0.v?.label);
  let apEarly = null, labels = [];
  await waitSim(6, async () => { const p = await P(), a = await A(); if (p?.apMode === 'AUTOPILOT') apEarly ??= r1((await simT()) - tRel); if (a?.label && labels[labels.length - 1] !== a.label) labels.push(a.label); });
  const nums = labels.map((l) => +(/AUTO (\d+)/.exec(l)?.[1] ?? NaN));
  check(`${tag} countdown: no AUTOPILOT for the first 6 s sim after letting go`, apEarly == null, apEarly != null ? `AP back after ${apEarly} s` : labels.join(' → '));
  check(`${tag} countdown: the number only goes down (10 → ≤ 5)`, nums.length >= 3 && nums.every((n, i) => i === 0 || n < nums[i - 1]) && nums[nums.length - 1] <= 5, labels.join(' → '));
  // 3. touching the stick again restarts it
  await stick(0.4, 20, 4);
  const again = await untilSim(async () => { const a = await A(); return a?.btn === 'count' && a; }, 1.5);
  check(`${tag} a touch mid-countdown restarts it (back to AUTO 10/9)`, again.v && again.v.countdown > 8.8, again.v && `${again.v.label} (${r1(again.v.countdown)} s)`);
  const tRel2 = await simT();
  // 4. left alone the AP takes back at 0
  const back = await untilSim(async () => (await P())?.apMode === 'AUTOPILOT', 16);
  const tBack = r1((await simT()) - tRel2);
  check(`${tag} left alone, the AP is back (AUTOPILOT) 10–13.5 s sim after letting go`, back.v && tBack >= 9.8 && tBack <= 13.5, `${tBack} s`);
  check(`${tag} AUTO reads AUTO again once the AP has it`, (await A())?.btn === 'on');

  // 5. tap while AUTO → AUTO OFF, the plane stays the player's with no countdown
  const t1 = await tapAuto();
  const off = await untilSim(async () => { const a = await A(); return a?.off && a.btn === 'off' && a; }, 2);
  check(`${tag} tap AUTO while the AP flies → AUTO OFF`, t1 === true && off.v && off.v.label === 'AUTO OFF', `tap ${t1} ${JSON.stringify(off.v)}`);
  await shot(`${tag}-auto-off`);
  let leaked = null;
  await waitSim(20, async () => { const a = await A(), p = await P(); if (!a?.off || a.countdown != null || p?.apMode !== 'MANUAL') leaked ??= `${a?.btn} ${p?.apMode}`; });
  check(`${tag} AUTO OFF holds for 20 s sim: MANUAL, no countdown, button still AUTO OFF`, !leaked, leaked || 'held');
  // 6. tap again → AUTO on
  const t2 = await tapAuto();
  const on = await untilSim(async () => (await P())?.apMode === 'AUTOPILOT' && (await A())?.btn === 'on', 3);
  check(`${tag} tap AUTO OFF → the AP flies again within 3 s sim`, t2 === true && on.v, `${r1(on.dt)} s`);
  // 7. tap during the countdown → AUTO now
  await stick(1, -24, 4);
  const cd = await untilSim(async () => (await A())?.btn === 'count', 1.5);
  const t3 = cd.v && await tapAuto();
  const now = await untilSim(async () => (await P())?.apMode === 'AUTOPILOT', 3);
  check(`${tag} tap during the countdown → AUTOPILOT within 3 s sim (no 10 s wait)`, cd.v && t3 === true && now.v, `${r1(now.dt)} s`);
  // 8. AUTO OFF, then LAND: LAND is an autopilot order, so AUTO comes back on
  await tapAuto();
  await untilSim(async () => (await A())?.off, 2);
  const lo = await untilSim(async () => { const r = await D.rect('.krz-land'); return r && r.state === 'idle' && /LAND/.test(r.txt) && r; }, 40, 250);
  if (!lo.v) check(`${tag} LAND offered under AUTO OFF`, false, 'LAND not idle within 40 s sim');
  else {
    await D.tapAt(lo.v.cx, lo.v.cy);
    const ok = await untilSim(async () => { const r = await D.rect('.krz-land'), a = await A(), p = await P(); return r?.state === 'active' && !a.off && p.apMode === 'AUTOPILOT' && { a, r }; }, 4);
    check(`${tag} LAND tapped under AUTO OFF → LAND active, AUTO back on, AUTOPILOT`, ok.v, ok.v ? `${ok.v.r.txt} / ${ok.v.a.btn}` : JSON.stringify(await A()));
    await shot(`${tag}-land-after-off`);
  }
  check(`${tag} no page errors`, !D.errors.length, D.errors.slice(0, 3).join(' | '));
}

// ---------------------------------------------------------------- desktop: mouse aim
const mouse = (type, x, y, extra = {}) => D.send('Input.dispatchMouseEvent', { type, x, y, button: 'none', ...extra });
async function click(x, y) { await mouse('mouseMoved', x, y); await mouse('mousePressed', x, y, { button: 'left', buttons: 1, clickCount: 1 }); await sleep(40); await mouse('mouseReleased', x, y, { button: 'left', buttons: 0, clickCount: 1 }); }
const KEYS = { KeyW: ['w', 87], KeyS: ['s', 83], KeyA: ['a', 65], KeyD: ['d', 68], KeyE: ['e', 69], KeyQ: ['q', 81], KeyZ: ['z', 90], KeyP: ['p', 80], Space: [' ', 32], Escape: ['Escape', 27] };
const key = (type, code) => D.send('Input.dispatchKeyEvent', { type, code, key: KEYS[code][0], windowsVirtualKeyCode: KEYS[code][1], nativeVirtualKeyCode: KEYS[code][1] });
async function holdKey(code, simSecs, during) { await key('keyDown', code); const t0 = await simT(), r0 = Date.now(); let out; while ((await simT()) - t0 < simSecs && Date.now() - r0 < 8000) { out = (await during?.()) ?? out; await sleep(80); } await key('keyUp', code); return out; }
let mx = 640, my = 300;
async function moveMouse(dx, dy, steps = 12) { for (let i = 0; i < steps; i++) { mx += dx / steps; my += dy / steps; await mouse('mouseMoved', Math.round(mx), Math.round(my)); await sleep(16); } }

// Resume from Settings: measured after the popup has settled and checked by its label (a rect read mid-animation once
// landed the click on "Quit to menu" next to it)
async function resume() {
  await sleep(500);
  const r = await D.rect('.kz-settings .kz-btn.primary');
  if (!r || !/resume/i.test(r.txt)) return false;
  await click(r.cx, r.cy); await sleep(500);
  return true;
}
async function desktopCase() {
  console.log('\n== desktop 1280×800, mouse aim ON');
  await fresh(1280, 800, { desktop: true, settings: { mouseAim: true } });
  await falsifyAfterSpawn();
  const ma0 = await D.evSafe('__game.mouseAim()');
  check('desktop: mouse aim enabled from Settings (fine pointer)', ma0?.enabled, JSON.stringify(ma0));
  check('desktop: aim reticle + "click the view" tip shown', !!(await D.rect('.krz-maim-aim')) || !!(await D.evSafe('!document.querySelector(".krz-maim").hidden')), '');
  // a free spot on the canvas (not under any HUD element)
  const spot = await D.evSafe(`(() => { for (const [x, y] of [[640, 330], [520, 300], [760, 300], [640, 420]]) { const e = document.elementFromPoint(x, y); if (e && e.id === 'krz-canvas') return [x, y]; } return null; })()`);
  if (!check('desktop: a clear spot of sky/ground to click', spot)) return;
  [mx, my] = spot;
  await click(mx, my);
  const lock = await untilSim(async () => (await D.evSafe('__game.mouseAim()'))?.locked, 2);
  check('desktop: a click on the view locks the pointer', lock.v);
  const p0 = await P(), h0 = p0.hdg, a0 = await A();
  check('desktop: a resting mouse is not manual (AUTOPILOT)', p0.apMode === 'AUTOPILOT' && a0.btn === 'on', p0.apMode);
  // aim 60° right (500 px × 0.12°/px)
  await moveMouse(500, 0, 14);
  const want = (h0 + 60) % 360, err = (x) => Math.abs(((x - want + 540) % 360) - 180);
  let maxBank = -1e9, bank2 = null, onAim = null, manualSeen = false, countAt = null, apAt = null, shotDone = false;
  const tA = await simT();
  await waitSim(26, async () => {
    const p = await P(), a = await A(); if (!p) return; const t = r1((await simT()) - tA);
    if (onAim == null) maxBank = Math.max(maxBank, p.bank);
    if (p.apMode === 'MANUAL') manualSeen = true;
    if (t < 3) bank2 = Math.max(bank2 ?? -1e9, p.bank);
    if (onAim == null && t > 1 && err(p.trk) < 6) onAim = t;
    if (!shotDone && t > 1.2) { shotDone = true; await shot('desktop-aim-turn'); }
    if (manualSeen && countAt == null && a?.btn === 'count') countAt = t;
    if (countAt != null && apAt == null && p.apMode === 'AUTOPILOT') apAt = t;
  });
  check('desktop: moving the mouse past the dead zone is manual flying (MANUAL)', manualSeen);
  check('desktop: aim 60° right → the plane banks right (> 15° within 3 s sim), never past 76°', bank2 > 15 && maxBank < 76, `max bank in 3 s ${r1(bank2)}°, overall ${r1(maxBank)}°`);
  check('desktop: and turns onto the aim (≤ 6°) within 22 s sim', onAim != null && onAim < 22, `on aim at ${onAim} s (heading ${r1(h0)} → want ${r1(want)})`);
  // the mouse rests: the instructor lets go on the aim → the AUTO countdown → the AP ~10 s later
  check('desktop: a resting mouse on the aim hands over → the AUTO countdown starts', countAt != null && countAt >= (onAim ?? 0), `countdown at ${countAt} s`);
  check('desktop: … and the AP takes back 9.5–13 s after that', apAt != null && apAt - countAt >= 9.5 && apAt - countAt <= 13, `AP at ${apAt} s`);
  await untilSim(async () => (await P())?.apMode === 'AUTOPILOT', 15);
  // Esc frees the mouse; LAND is then clickable with it
  // (before the key checks: headless Chrome drops the pointer lock on any CDP keyDown and refuses a quick re-lock; the
  // game never calls exitPointerLock there — traced with a wrapped document.exitPointerLock)
  check('desktop: pointer-locked before Esc', (await D.evSafe('__game.mouseAim()'))?.locked);
  await key('keyDown', 'Escape'); await key('keyUp', 'Escape');
  let unl = await untilSim(async () => !(await D.evSafe('__game.mouseAim()'))?.locked, 1.5);
  if (!unl.v) { console.log('  WARN headless Esc did not release the lock (the browser owns that key); releasing via exitPointerLock'); await D.ev('document.exitPointerLock(), 1'); unl = await untilSim(async () => !(await D.evSafe('__game.mouseAim()'))?.locked, 1.5); }
  // Esc also opens Settings (pause) in this game when the lock is already off: close it again if so
  await sleep(600);
  const opened = await D.rect('.kz-settings .kz-btn.primary');
  // (Chrome consumes the Esc that ends a lock, so this cannot see mouseaim.js's own Esc guard — falsified: it stays green
  // with the guard disabled. It does catch a lock already lost before Esc, where Esc is the game's pause = Settings.)
  check('desktop: Esc out of the lock does not open Settings (no modal)', !opened, opened ? 'Settings opened' : '');
  if (opened) await resume();
  check('desktop: the pointer is free again', unl.v);
  const lo = await untilSim(async () => { const r = await D.rect('.krz-land'); return r && r.state === 'idle' && /LAND/.test(r.txt) && r; }, 30, 250);
  if (lo.v) {
    await click(lo.v.cx, lo.v.cy);
    const act = await untilSim(async () => (await D.rect('.krz-land'))?.state === 'active', 3);
    check('desktop: LAND clickable with the free mouse', act.v);
  } else check('desktop: LAND offered', false, 'LAND not idle in 30 s sim');
  await shot('desktop-land-clicked');
  // keys: W throttle, D rudder, E roll, Space brake, Z AUTO
  const thr0 = (await P()).thr;
  const sk = await holdKey('KeyS', 2, async () => { const p = await P(); return p && { m: p.modes.throttle, thr: p.thr, ele: p.modes.elevator }; });
  check('desktop: S = throttle down (lever manual, falling), not pitch', sk && sk.m === 'manual' && sk.thr < thr0 - 0.15 && sk.ele !== 'manual', JSON.stringify({ thr0, ...sk }));
  const w = await holdKey('KeyW', 1.5, async () => { const p = await P(); return p && { m: p.modes.throttle, thr: p.thr, ele: p.modes.elevator }; });
  check('desktop: W = throttle up (lever manual, rising), not pitch', w && w.m === 'manual' && w.thr > (sk?.thr ?? 1) + 0.1 && w.ele !== 'manual', JSON.stringify({ from: sk?.thr, ...w }));
  const d = await holdKey('KeyD', 0.8, async () => (await P())?.modes.rudder);
  check('desktop: D = rudder', d === 'manual', d);
  const e = await holdKey('KeyE', 0.8, async () => { const p = await P(); return p && `${p.modes.aileron}/${r1(p.bank)}`; });
  check('desktop: E = roll override (aileron manual)', /^manual/.test(e || ''), e);
  const sp = await holdKey('Space', 0.5, async () => (await P())?.brakeM);
  check('desktop: Space = brakes', sp === 1, String(sp));
  await untilSim(async () => (await P())?.apMode === 'AUTOPILOT', 15);
  await key('keyDown', 'KeyZ'); await key('keyUp', 'KeyZ');
  const z1 = await untilSim(async () => (await A())?.off, 2);
  await key('keyDown', 'KeyZ'); await key('keyUp', 'KeyZ');
  const z2 = await untilSim(async () => (await A())?.off === false, 2);
  check('desktop: Z toggles AUTO OFF and back', z1.v && z2.v);

  // toggle OFF in Settings: the old keys again (W pitches), no reticle, a click no longer locks
  await key('keyDown', 'KeyP'); await key('keyUp', 'KeyP');
  await untilSim(async () => D.rect('.kz-mouse .kz-switch'), 3);
  const row = await D.rect('.kz-mouse .kz-switch');
  check('desktop: Settings shows the Mouse aim switch, on', row && (await D.evSafe('document.querySelector(".kz-mouse .kz-switch").getAttribute("aria-checked")')) === 'true');
  await shot('desktop-settings');
  if (row) await click(row.cx, row.cy);
  await sleep(300);
  await resume();
  if (FALSIFY === 'toggle') await D.ev('(() => { Object.defineProperty(__game.mouseAimObj, "enabled", { get: () => true }); return 1; })()');
  const ma1 = await D.evSafe('__game.mouseAim()');
  check('desktop: toggled off → mouse aim disabled, reticle hidden', ma1 && !ma1.enabled && (await D.evSafe('document.querySelector(".krz-maim").hidden')), JSON.stringify(ma1));
  const thrA = (await P()).thr;
  const w2 = await holdKey('KeyW', 1.2, async () => { const p = await P(); return p && { ele: p.modes.elevator, thrM: p.modes.throttle, thr: p.thr }; });
  check('desktop: toggled off → W pitches again (elevator manual), not throttle', w2 && w2.ele === 'manual' && w2.thrM !== 'manual', JSON.stringify({ thrA, ...w2 }));
  const sp2 = await D.evSafe(`(() => { for (const [x, y] of [[640, 330], [520, 300], [760, 300]]) { const e = document.elementFromPoint(x, y); if (e && e.id === 'krz-canvas') return [x, y]; } return null; })()`);
  if (sp2) await click(sp2[0], sp2[1]);
  await sleep(400);
  check('desktop: toggled off → a click does not lock the pointer', !(await D.evSafe('__game.mouseAim()'))?.locked);
  check('desktop: no page errors', !D.errors.length, D.errors.slice(0, 3).join(' | '));
}

D = await connect(PORT);
try {
  for (const o of ['portrait', 'landscape']) if (ONLY.includes(o)) { try { await touchCase(o); } catch (e) { check(`${o}: harness`, false, e.message); } }
  if (ONLY.includes('desktop')) { try { await desktopCase(); } catch (e) { check('desktop: harness', false, e.message); } }
} finally { D.close(); }
const bad = results.filter((r) => !r.ok);
console.log(`\n${results.length - bad.length}/${results.length} passed${FALSIFY ? ` (falsify=${FALSIFY})` : ''}`);
process.exit(bad.length ? 1 : 0);
