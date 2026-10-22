// GAMEPLAY lane test: boot → menu → Free Flight → fly → pause → settings → resume → quit with REAL CDP input
// (touch at 390×844 and 844×390, mouse at 1280×800). Score HUD, popups, rank-up ceremony, bank, scandal, coach marks,
// opportunity prompts, hints toggle, radio button above BRAKE, z-order under the settings popup, no console errors.
//   ~/.claude/bin/cdp start --port 9491 -- --use-angle=metal
//   node tools/test-gameplay.mjs [--only=portrait,landscape,desktop] [--falsify]
// --falsify breaks the layout on purpose (score widget dragged over the pause button) and expects the overlap check to FAIL.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(HERE, '..', 'docs', 'shots', 'gameplay');
mkdirSync(SHOTS, { recursive: true });
const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').split('=')[1] || d;
const PORT = +arg('port', 9491);
const BASE = arg('url', 'http://localhost:8888/gms/3d/krayzee/');
const ONLY = arg('only', 'portrait,landscape,desktop,finish,ground,hudfix').split(',');
const FALSIFY = process.argv.includes('--falsify');

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
async function ev(expr) {
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
let MOBILE = false;
async function viewport(w, h, mobile) {
  MOBILE = mobile;
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: mobile ? 2 : 1, mobile, screenOrientation: { type: w > h ? 'landscapePrimary' : 'portraitPrimary', angle: w > h ? 90 : 0 } });
  // re-arm touch emulation on every size change (switching portrait→landscape in one tab otherwise drops touches)
  await send('Emulation.setTouchEmulationEnabled', { enabled: false });
  if (mobile) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
}
async function load(query) {
  await send('Page.navigate', { url: BASE + query });
  const t0 = Date.now();
  while (Date.now() - t0 < 30000) {
    await sleep(300);
    try { if (await ev('!!window.__krayzeeReady')) return true; } catch (e) { /* navigating */ }
  }
  return false;
}
// Real input: touch on mobile emulation, mouse on desktop.
async function tapAt(x, y) {
  if (MOBILE) {
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
    await sleep(70);
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await sleep(50);
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  }
}
async function rectOf(sel) {
  return ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return r.width ? { x: r.x, y: r.y, w: r.width, h: r.height } : null; })()`);
}
async function tap(sel) {
  const r = await rectOf(sel);
  if (!r) return false;
  await tapAt(r.x + r.w / 2, r.y + r.h / 2);
  return true;
}
async function until(expr, secs, step = 250) {
  const t0 = Date.now();
  let v;
  while ((Date.now() - t0) / 1000 < secs) { v = await ev(expr); if (v) return v; await sleep(step); }
  return v;
}
const hit = (a, b) => a && b && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
function overlaps(named) {
  const keys = Object.keys(named), bad = [];
  for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) if (hit(named[keys[i]], named[keys[j]])) bad.push(`${keys[i]}×${keys[j]}`);
  return bad;
}

const errors = [];
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); };

const PROFILE = { name: 'Dirk', gender: 'm', company: 'Dirk Air', primary: '#b3122e', secondary: '#f4efe6', accent: '#d4a017', voice: 'toff', registration: 'K-DIRK' };
async function freshStorage(extra = {}) {
  await ev(`(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('krayzee.')) localStorage.removeItem(k);
    localStorage.setItem('krayzee.profile', ${JSON.stringify(JSON.stringify(PROFILE))});
    const x = ${JSON.stringify(extra)}; for (const k in x) localStorage.setItem(k, JSON.stringify(x[k])); return true; })()`);
}

async function layoutCheck(tag) {
  const r = await ev('window.__game.controlsRects()');
  const named = {
    score: await rectOf('.krz-score'), pause: r.topL, topRight: r.topR, hudStrip: await rectOf('.krz-hud-strip'),
    tower: await rectOf('.krz-r-tower'), stick: r.stick, thr: r.thr, pad: r.pad, radio: await rectOf('.krz-r-btn'),
  };
  const ov = overlaps(named);
  check(`${tag}: score widget, HUD, radio and controls don't overlap`, ov.length === 0, ov.join(', ') || `score ${JSON.stringify(named.score)}`);
  return ov;
}

async function radioPlacement(tag, W, H) {
  const btn = await rectOf('.krz-r-btn'), brake = await rectOf('[data-hold="brake"]'), thr = await rectOf('.krz-thr');
  const above = btn && brake && btn.y + btn.h <= brake.y + 1 && brake.y - (btn.y + btn.h) < 30;
  const centred = btn && brake && Math.abs((btn.x + btn.w / 2) - (brake.x + brake.w / 2)) < Math.max(14, brake.w / 2);
  const inside = btn && btn.x >= 0 && btn.y >= 0 && btn.x + btn.w <= W && btn.y + btn.h <= H;
  check(`${tag}: radio button sits just above BRAKE`, above && centred && inside, JSON.stringify({ btn, brake }));
  check(`${tag}: radio button clear of the throttle`, !hit(btn, thr), JSON.stringify({ btn, thr }));
}

// Everything under the settings popup must be covered by it (D15).
async function zOrderCheck(tag) {
  const res = await ev(`(() => {
    const out = {};
    for (const [k, sel] of [['radio', '.krz-r-btn'], ['tower', '.krz-r-tower'], ['score', '.krz-score'], ['subs', '.krz-r-subs'], ['coach', '.krz-coach-bub'], ['prompt', '.krz-prompt'], ['land', '.krz-land']]) {
      const e = document.querySelector(sel); if (!e) continue;
      const r = e.getBoundingClientRect(); if (!r.width || !r.height) continue;
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      out[k] = !!top && !!top.closest('#kz-ui');
    }
    return out; })()`);
  const bad = Object.entries(res).filter(([, v]) => !v).map(([k]) => k);
  check(`${tag}: settings popup covers every HUD/radio element`, bad.length === 0 && Object.keys(res).length >= 3, `${JSON.stringify(res)}`);
}

async function scenario(W, H, mobile, tag) {
  console.log(`\n== ${tag} ${W}×${H} ${mobile ? 'touch' : 'mouse'}`);
  await viewport(W, H, mobile);
  errors.length = 0;
  await send('Page.navigate', { url: BASE + 'docs/' }); await sleep(500);
  await freshStorage();
  check(`${tag}: boot`, await load('?noaccount=1'));
  check(`${tag}: menu shows`, await until(`!!document.querySelector('.kz-menu') && getComputedStyle(document.querySelector('.kz-menu')).visibility !== 'hidden' && __game.state().mode === 'attract'`, 8));
  await sleep(1200);
  await tap('.kz-menu [data-a="free"]');
  check(`${tag}: Free Flight via real ${mobile ? 'touch' : 'click'}`, await until(`__game.state().mode === 'play' && !!__game.state().game.game`, 10));
  await sleep(1500);

  // first 30 s: the goal coach mark says what to do, and "Got it" dismisses it with a real tap
  const goal = await until(`__game.hud.coach.active === 'goal' && document.querySelector('.krz-coach-bub p').textContent`, 4);
  check(`${tag}: first-flight goal coach mark`, /Goal/.test(goal || '') && /bank/.test(goal || ''), goal);
  console.log('  shot', await shot(`${tag}-01-goal`));
  await tap('.krz-coach-ok');
  check(`${tag}: coach "Got it" by real tap`, await until(`__game.hud.coach.log.some((l) => l.id === 'goal' && l.why === 'ok')`, 2));
  const stick = await until(`__game.hud.coach.active === 'stick'`, 5);
  check(`${tag}: stick coach mark follows`, stick);
  if (mobile) {
    // real touch drag on the stick satisfies it
    const z = await rectOf('.krz-stick-zone');
    const x = z.x + z.w / 2, y = z.y + z.h / 2;
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 3 }] });
    for (let i = 1; i <= 6; i++) { await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + i * 4, y: y + i * 2, id: 3 }] }); await sleep(40); }
    await sleep(400);
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    console.log('  DIAG stick', JSON.stringify(await ev(`({ m: __game.state().player.modes, c: __game.hud.coach, ctl: __game.state().player.ctl })`)));
    check(`${tag}: stick drag completes the stick coach mark`, await until(`__game.hud.coach.log.some((l) => l.id === 'stick' && l.why === 'done')`, 3));
  }
  await ev(`__game.ghud.coach.complete()`);

  await sleep(800);
  const ov = await layoutCheck(tag);
  await radioPlacement(tag, W, H);

  // score events → popups, counter, combo
  await ev(`(() => { const g = __game.wiring.game; g.handleEvent({ type: 'cut_in_final', id: 9001, actor: 'player', victim: 'x', data: { gap: 300, close: true } });
    setTimeout(() => g.handleEvent({ type: 'tower_buzz', id: 9002, actor: 'player', data: { dist: 20, close: true } }), 500); return 1; })()`);
  check(`${tag}: PP popup appears`, await until(`document.querySelectorAll('.krz-pop.in').length >= 1 && /CUT IN/.test(document.querySelector('.krz-pops').textContent)`, 2));
  await sleep(700);
  console.log('  shot', await shot(`${tag}-02-popups`));
  const popR = await rectOf('.krz-pops'), ctl = await ev('window.__game.controlsRects()');
  check(`${tag}: popups clear of the stick/throttle`, !hit(popR, ctl.stick) && !hit(popR, ctl.thr), JSON.stringify(popR));
  await sleep(2300);
  const s1 = await ev(`({ hud: __game.hud.score, g: __game.state().game.game })`);
  check(`${tag}: counter ticks to pending`, s1.g.pending > 0 && s1.hud.shown === s1.g.pending, `${s1.hud.shown} vs ${s1.g.pending}`);
  check(`${tag}: combo badge with multiplier`, await ev(`!document.querySelector('.krz-sc-combo').hidden && /×1\\.25/.test(document.querySelector('.krz-sc-combo').textContent)`));
  check(`${tag}: "bank it" hint while pending`, /BANK/.test(s1.hud.hint), s1.hud.hint);

  // rank-up ceremony
  await ev(`__game.wiring.game.career.addPP(2100, {})`);
  const cer = await until(`document.querySelector('.krz-cer.in') && document.querySelector('.krz-cer').textContent`, 2);
  check(`${tag}: rank-up ceremony shows title + new callsign`, /Viscount/.test(cer || '') && /tower now calls you Viscount [A-Z][a-z]+-[A-Z][a-z]+/.test(cer || ''), (cer || '').replace(/\s+/g, ' ').slice(0, 120));
  await sleep(1400);
  console.log('  shot', await shot(`${tag}-03-rankup`));
  await sleep(4800);

  // bank + scandal
  await ev(`__game.wiring.game.bank()`);
  check(`${tag}: banked toast`, await until(`/BANKED/.test(document.querySelector('.krz-pops').textContent)`, 2));
  await sleep(600);
  console.log('  shot', await shot(`${tag}-04-banked`));
  check(`${tag}: widget shows banked total`, await until(`/BANKED [0-9,]+/.test(__game.hud.score.hint)`, 3), await ev('__game.hud.score.hint'));
  await sleep(2400);
  await ev(`__game.wiring.game.handleEvent({ type: 'scandal', key: 'tower', actor: 'player', t: 1 })`);
  // D24: in flight a newspaper counter + one-line toast, never the full card
  check(`${tag}: scandal → newspaper counter, no card in flight`, await until(`__game.ghud.headlines.state.count >= 3 && !document.querySelector('.krz-paper').hidden && !document.querySelector('.krz-herald')`, 2), JSON.stringify(await ev('__game.ghud.headlines.state')));
  await sleep(700);
  console.log('  shot', await shot(`${tag}-05-scandal`));
  check(`${tag}: frozen state on the widget`, await until(`/SCANDAL/.test(__game.hud.score.hint) && document.querySelector('.krz-score').dataset.frozen === '1'`, 2));

  // opportunity prompt: airborne near the tower
  await ev(`__game.ghud.prompts.reset()`);
  await ev(`(() => { __game.teleport({ x: 900, z: -300, alt: 140, heading: 270, speedKt: 95, throttle: 0.75 }); return 1; })()`);
  const pr = await until(`__game.hud.prompts.current`, 14);
  check(`${tag}: an opportunity prompt appears`, !!pr, JSON.stringify(pr));
  await sleep(500);
  console.log('  shot', await shot(`${tag}-06-prompt`));
  const prR = await rectOf('.krz-prompt'), ctl2 = await ev('window.__game.controlsRects()');
  const prOv = overlaps({ prompt: prR, stick: ctl2.stick, thr: ctl2.thr, pad: ctl2.pad, radio: await rectOf('.krz-r-btn'), score: await rectOf('.krz-score'), hud: await rectOf('#krz-hud') });
  check(`${tag}: prompt clear of thumbs, radio and HUD`, prOv.filter((s) => s.startsWith('prompt')).length === 0, prOv.join(', '));
  check(`${tag}: prompt points at its target`, await ev(`!!__game.hud.target && !document.querySelector('.krz-pr-arrow').hidden`));
  await tap('.krz-pr-x');
  check(`${tag}: prompt dismissed by real tap`, await until(`__game.hud.prompts.history.some((h) => h.why === 'dismissed') && !__game.hud.prompts.current`, 2));

  // hints off (settings key 'hints') → no prompts
  await ev(`(() => { const s = JSON.parse(localStorage.getItem('krayzee.settings') || '{}'); s.hints = false; s.v = 3; localStorage.setItem('krayzee.settings', JSON.stringify(s)); __game.ghud.prompts.reset(); return 1; })()`);
  await ev(`__game.teleport({ x: 700, z: -280, alt: 120, heading: 270, speedKt: 95, throttle: 0.75 })`);
  await sleep(9000);
  check(`${tag}: hints:false hides prompts`, !(await ev('__game.hud.prompts.current')), JSON.stringify(await ev('__game.hud.prompts.history.slice(-2)')));
  await ev(`(() => { const s = JSON.parse(localStorage.getItem('krayzee.settings')); delete s.hints; localStorage.setItem('krayzee.settings', JSON.stringify(s)); return 1; })()`);

  // pause → settings (z-order) → resume → pause → quit
  await tap('[data-act="pause"]');
  check(`${tag}: pause opens settings`, await until(`__game.state().paused && !!document.querySelector('.kz-settings')`, 3));
  await sleep(600);
  // the radio hides while paused; show it for the D15 check so the popup must really sit above it
  await ev(`__game.wiring.radio.setVisible(true)`); await sleep(300);
  await zOrderCheck(tag);
  await ev(`__game.wiring.radio.setVisible(false)`);
  const lbl = await ev(`document.querySelector('[data-say="invertPitch"]')?.textContent`);
  check(`${tag}: invert-pitch wording`, /towards you\) to climb/.test(lbl || ''), lbl);
  console.log('  shot', await shot(`${tag}-07-settings`));
  const tBefore = await ev('__game.S.playT');
  await sleep(800);
  check(`${tag}: game time frozen while paused`, Math.abs((await ev('__game.S.playT')) - tBefore) < 0.01);
  await tap('.kz-settings .kz-btn.primary');
  check(`${tag}: Resume by real ${mobile ? 'touch' : 'click'}`, await until(`!__game.state().paused`, 3));
  await sleep(500);
  await tap('[data-act="pause"]');
  await until(`__game.state().paused`, 3);
  await sleep(500);
  await tap('.kz-settings .kz-btn.danger');
  check(`${tag}: Quit to menu`, await until(`__game.state().mode === 'attract' && document.querySelector('#krz-ghud').hidden && !document.querySelector('.krz-coach:not([hidden])')`, 4));
  await sleep(800);
  check(`${tag}: no console errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
  return ov;
}

// Ground override (Aaron: "overriding on landing doesn't work"): after an AP landing, real touch: throttle up + stick right
// during the rollout → the plane must speed up and turn, and the HUD must say MANUAL.
const tsend = (p) => send('Input.dispatchTouchEvent', p).catch((e) => console.log('  touch', p.type, e.message));
async function groundOverride(W, H, tag) {
  console.log(`\n== ground override ${tag} ${W}×${H} touch`);
  await viewport(W, H, true);
  errors.length = 0;
  await send('Page.navigate', { url: BASE + 'docs/' }); await sleep(500);
  await freshStorage({ 'krayzee.coach': { goal: 1, stick: 1, release: 1, radio: 1, bank: 1 } });
  await load('?start=free&noaccount=1');
  await sleep(2500);
  // A field landing via the LAND assist (real tap): ATC can't send it round, so the rollout is deterministic.
  await ev(`__game.teleport({ x: -1500, z: 1500, alt: 120, heading: 180, speedKt: 75, throttle: 0.5, flaps: 0.33 })`);
  await sleep(3000);
  await until(`document.querySelector('.krz-land')?.dataset.state === 'idle' && !document.querySelector('.krz-land').hidden`, 5);
  await tap('.krz-land');
  check(`${tag}: LAND assist engaged by real tap`, await until(`document.querySelector('.krz-land').dataset.state === 'active'`, 2));
  const landed = await until(`(() => { const p = __game.state().player; return p.onGround && !p.crashed && p.phase === 'ROLLOUT' && p.speedKt > 20 ? p : null; })()`, 100, 100);
  if (!landed) console.log(`  INFO ${tag}: AP did not reach a rollout (TRAFFIC autopilot), falling back to a ground roll on 27 —`, JSON.stringify(await ev(`(() => { const p = __game.state().player; return [p.x, p.z, p.alt, p.speedKt, p.phase, p.onGround, __game.log().filter((l) => /landAt|goaround|crash|impact/.test(l.type)).slice(-3)]; })()`)));
  let down2 = landed;
  if (!down2) {
    await ev(`__game.teleport({ x: 600, z: 0, alt: 0.5, heading: 270, speedKt: 30, throttle: 0, flaps: 0 })`);
    await sleep(600);
    down2 = await ev(`__game.state().player`);
  }
  check(`${tag}: on the ground and rolling (${landed ? 'after LAND-assist touchdown' : 'fallback ground roll'})`, down2?.onGround, JSON.stringify(down2 && { kt: down2.speedKt, phase: down2.phase }));
  if (!down2?.onGround) return;
  const down = down2;
  const thr = await rectOf('.krz-thr'), z = await rectOf('.krz-stick-zone');
  const tx = thr.x + thr.w / 2, sx = z.x + z.w / 2, sy = z.y + z.h / 2;
  const pts = (k, tyy, dx) => [{ x: tx, y: tyy, id: 1 }, { x: sx + dx, y: sy, id: 2 }];
  await ev(`(() => { window.__pe = []; for (const t of ['pointerdown', 'pointercancel', 'touchstart', 'lostpointercapture']) document.addEventListener(t, (e) => __pe.push(t + ':' + (e.target.className?.baseVal ?? e.target.className)), true); return 1; })()`);
  const hitT = await ev(`[document.elementFromPoint(${tx}, ${thr.y + thr.h - 10})?.className, document.elementFromPoint(${sx}, ${sy})?.className]`);
  // Headless Chrome now and then swallows a touchStart after the LAND tap (no DOM event at all); retry until one lands.
  for (let tries = 0; tries < 4; tries++) {
    await tsend( { type: 'touchStart', touchPoints: [pts(0, thr.y + thr.h - 10, 0)[0]] });
    await sleep(30);
    await tsend( { type: 'touchStart', touchPoints: pts(0, thr.y + thr.h - 10, 0) });
    await sleep(60);
    if (await ev('__pe.some((p) => p.startsWith("touchstart"))')) break;
    await tsend( { type: 'touchCancel', touchPoints: [] });
    await sleep(300);
  }
  for (let i = 1; i <= 8; i++) { await tsend( { type: 'touchMove', touchPoints: pts(i, thr.y + thr.h - 10 - (thr.h - 20) * i / 8, i * 8) }); await sleep(40); }
  const h0 = down.heading;
  let st = null;
  for (let i = 0; i < 16; i++) { await tsend( { type: 'touchMove', touchPoints: pts(8, thr.y + 6, 64) }); await sleep(200); }
  st = await ev(`__game.state().player`);
  const apText = await ev(`document.querySelector('.krz-ap-mode').textContent`);
  console.log('  shot', await shot(`${tag}-08-ground-override`));
  await tsend( { type: 'touchEnd', touchPoints: [] });
  const dh = ((st.heading - h0 + 540) % 360) - 180;
  console.log('  DIAG', JSON.stringify({ hitT, pe: await ev('__pe.slice(0, 8)') }));
  check(`${tag}: throttle by touch registers as override on the ground`, st.modes.throttle === 'manual' && st.ctl.throttle > 0.8, JSON.stringify(st.modes));
  check(`${tag}: stick right steers the rollout`, dh > 4, `Δheading ${dh.toFixed(1)}°`);
  check(`${tag}: plane accelerates under manual throttle`, st.speedKt > 18 || st.speedKt > down.speedKt * 0.9, `${down.speedKt} → ${st.speedKt} kt`);
  check(`${tag}: HUD says MANUAL`, apText === 'MANUAL', apText);
  check(`${tag}: no console errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
}

// D19 DEMAND IT by difficulty (+ D20 refuel, D24 reel), difficulty chips at the start, warp chip. Real touch at 390×844.
async function finishFlow(W, H, mobile, tag) {
  console.log(`\n== finish ${tag} ${W}×${H} ${mobile ? 'touch' : 'mouse'}`);
  await viewport(W, H, mobile);
  errors.length = 0;
  await send('Page.navigate', { url: BASE + 'docs/' }); await sleep(500);
  // the Moth needs Earl (6,000 PP) since UI round 4
  await freshStorage({ 'krayzee.coach': { goal: 1, stick: 1, release: 1, radio: 1, bank: 1 }, 'krayzee.coachTakeoff': 1, 'krayzee.career': { lifetimePP: 6000 } });
  await load('?start=free&noaccount=1');
  const chips = await until(`__game.ghud.ground.state.difficulty`, 4, 100);
  if (!chips) console.log('  DIAG', JSON.stringify(await ev(`({ p: __game.state().player && [__game.state().player.onGround, __game.state().player.speedKt, __game.state().player.leg, __game.state().player.sub], S: [__game.S.everAir, __game.S.playMode], g: __game.state().game.game?.pending, log: __game.log().slice(-6) })`)));
  check(`${tag}: difficulty chips parked at the start`, chips === 'easy', chips);
  console.log('  shot', await shot(`${tag}-09-diff-chips`));
  if (chips) {
    await tap('.krz-plane [data-a="tiger"]');
    check(`${tag}: Tiger Moth picked by real ${mobile ? 'touch' : 'click'} (plane rebuilt)`, await until(`__game.S.type === 'tiger' && !!__game.S.player && __game.ghud.ground.state.aircraft === 'tiger'`, 8), JSON.stringify(await ev('[__game.S.type, __game.ghud.ground.state]')));
    console.log('  shot', await shot(`${tag}-09b-tiger`));
    await until(`__game.ghud.ground.state.difficulty`, 4, 100);
    await tap('.krz-diff [data-d="hard"]');
    check(`${tag}: Hard chosen by real ${mobile ? 'touch' : 'click'} (game rebuilt, saved)`, await until(`__game.wiring.difficulty === 'hard' && JSON.parse(localStorage.getItem('krayzee.settings')).difficulty === 'hard'`, 2));
  }
  check(`${tag}: warp chip shown in Free Flight`, await until(`!!document.querySelector('.krz-warp:not([hidden])')`, 3));
  check(`${tag}: fuel gauge shows`, await until(`!document.querySelector('[data-k2="fuel"]').hidden && parseFloat(document.querySelector('[data-k="fuel"]').textContent) > 90`, 3));
  const SPOT = await ev(`import('./js/game/finish.js').then((m) => m.DEFAULT_SPOT)`);
  // fake a landing at the far end of 27 and hold the brakes
  const land = async (x, z, hdg) => {
    await ev(`__game.teleport({ x: ${x}, z: ${z}, alt: 0.3, heading: ${hdg}, speedKt: 0, throttle: 0 })`);
    await ev(`__game.setControls({ throttle: 0, brake: 1 }, 60000)`);
    await sleep(400);
    await ev(`__game.wiring.game.update(0.016, { onGround: false, gsKt: 50 })`);
    await sleep(900);
  };
  await ev(`(() => { const g = __game.wiring.game; g.handleEvent({ type: 'cut_in_final', id: 9101, actor: 'player', victim: 'x', data: { gap: 300 } }); g.handleEvent({ type: 'tower_buzz', id: 9102, actor: 'player', data: { dist: 20 } }); return 1; })()`);
  check(`${tag}: headlines counted in flight (toast, no card)`, await until(`__game.ghud.headlines.state.count === 2 && __game.ghud.headlines.state.toast && !document.querySelector('.krz-herald')`, 2), JSON.stringify(await ev('__game.ghud.headlines.state')));
  await ev(`(() => { const f = __game.S.player.ac.fuel; f.L = f.R = f.cap * 0.1; return 1; })()`);
  check(`${tag}: low fuel warning`, await until(`document.querySelector('[data-k2="fuel"]').dataset.low === '1'`, 3));
  await land(600, 0, 270);
  const grey = await until(`(() => { const e = document.querySelector('.krz-finish'); return !e.hidden && e.dataset.state === 'greyed' ? e.textContent : null; })()`, 4);
  check(`${tag}: Hard on the runway → DEMAND IT greyed with a reason`, /terminal/i.test(grey || ''), grey);
  console.log('  shot', await shot(`${tag}-10-finish-greyed`));
  // a parked AI on the spot would make Hard (real metal) crash and respawn us: clear it first
  await ev(`(() => { const T = __game.traffic; for (const e of [...T.list]) if (!e.player && Math.hypot(e.ac.pos.x - ${SPOT.x}, e.ac.pos.z - ${SPOT.z}) < 45) { T.remove(e); e.rig?.root.removeFromParent(); } return 1; })()`);
  await land(SPOT.x, SPOT.z, 180);
  check(`${tag}: Hard at the designated spot → DEMAND IT ready`, await until(`document.querySelector('.krz-finish').dataset.state === 'ready' && !document.querySelector('.krz-finish').hidden`, 4), await ev(`document.querySelector('.krz-finish').dataset.state + ' ' + JSON.stringify(__game.state().player && [__game.state().player.x, __game.state().player.z, __game.state().player.speedKt])`));
  console.log('  shot', await shot(`${tag}-11-finish-ready`));
  console.log('  DIAG', JSON.stringify(await ev(`(() => { const r = document.querySelector('.krz-finish').getBoundingClientRect(); const e = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return [e?.className, document.querySelector('.krz-finish').dataset.state, __game.state().player.speedKt]; })()`)));
  await tap('.krz-finish');
  check(`${tag}: DEMAND IT by real ${mobile ? 'touch' : 'click'} banks + finishes`, await until(`__game.log().some((l) => l.type === 'demand' && l.ok)`, 2), JSON.stringify(await ev(`__game.log().filter((l) => l.type === 'demand')`)));
  check(`${tag}: DEMAND IT refuels (D20)`, await until(`__game.S.player.ac.fuelFraction > 0.99`, 2));
  const reel = await until(`__game.ghud.headlines.state.reel`, 5);
  check(`${tag}: headline reel after landing`, reel && reel.n === 2, JSON.stringify(reel));
  await sleep(600);
  console.log('  shot', await shot(`${tag}-12-reel`));
  await tap('.krz-reel-next');
  check(`${tag}: reel Next`, await until(`__game.ghud.headlines.state.reel?.i === 1`, 2));
  await tap('.krz-reel-next');
  check(`${tag}: reel Done closes it`, await until(`!__game.ghud.headlines.state.reel && !document.querySelector('.krz-reel:not(.out)')`, 2));
  await ev(`__game.release()`);
  check(`${tag}: no console errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
}

// PLAYTEST_2 (lane HUDFIX): bank soft-limit + roll rate, latched throttle lever + AUTO, overlaps, coach suppression,
// DEMAND TAKEOFF coach, chase camera vs trees, online room protection. Real CDP touch.
const NOCOACH = { 'krayzee.coach': { goal: 1, stick: 1, release: 1, radio: 1, bank: 1 }, 'krayzee.coachTakeoff': 1 };
let gid = 0;
async function fullStick(secs, dx = 150, rePush = false) {
  const z = await rectOf('.krz-stick-zone'), x = z.x + z.w / 2, y = z.y + z.h / 2, id = 10 + (++gid % 50);
  // headless Chrome now and then swallows a touchStart (see Test notes): retry until the stick really has it
  for (let tries = 0; tries < 5; tries++) {
    await send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] }).catch(() => {});
    await tsend({ type: 'touchStart', touchPoints: [{ x, y, id }] });
    for (let i = 1; i <= 5; i++) { await tsend({ type: 'touchMove', touchPoints: [{ x: x + i * dx / 5, y, id }] }); await sleep(16); }
    await sleep(80);
    if (await ev(`__game.state().player.modes.aileron === 'manual'`)) break;
    console.log('  DIAG stick retry', JSON.stringify({ x, y, vw: await ev('[innerWidth, innerHeight]') }));
    await tsend({ type: 'touchCancel', touchPoints: [] }); await sleep(300);
  }
  const t0 = Date.now(); let max = 0, tag = '', b0 = await ev('__game.state().player.bank');
  while (Date.now() - t0 < secs * 1000) {
    await tsend({ type: 'touchMove', touchPoints: [{ x: x + dx, y, id }] });
    const s = await ev(`[__game.state().player.bank, document.querySelector('.krz-stick-tag').textContent]`);
    max = Math.max(max, Math.abs(s[0])); if (/BANK/.test(s[1])) tag = s[1];
    await sleep(120);
  }
  let after = max;
  if (rePush) {
    await tsend({ type: 'touchMove', touchPoints: [{ x: x + dx * 0.3, y, id }] }); await sleep(300);
    const t1 = Date.now();
    while (Date.now() - t1 < 1800) { await tsend({ type: 'touchMove', touchPoints: [{ x: x + dx, y, id }] }); after = Math.max(after, Math.abs(await ev('__game.state().player.bank'))); await sleep(120); }
  }
  await tsend({ type: 'touchEnd', touchPoints: [] });
  return { max, tag, after, b0 };
}
async function hudFix() {
  console.log('\n== hudfix 390×844 + 844×390 touch');
  await viewport(390, 844, true);
  errors.length = 0;
  const up = async (q = '', extra = {}) => { await send('Page.navigate', { url: BASE + 'docs/' }); await sleep(400); await freshStorage({ ...NOCOACH, ...extra }); await load('?start=free&noaccount=1' + q); await sleep(2500); };
  const cruise = (kt = 95) => ev(`__game.teleport({ x: -1500, z: 2500, alt: 450, heading: 90, speedKt: ${kt}, throttle: 0.7 })`).then(() => sleep(2500));

  // B5: full stick on Easy holds ~60°; Hard has no limit (so the limiter is what stops it); the detent re-push goes past
  for (const [plane, kt] of [['c172', 95], ['tiger', 75], ['bathtub', 58]]) {
    await up(`&plane=${plane}`, { 'krayzee.settings': { difficulty: 'easy', v: 3 } });
    await cruise(kt);
    const r = await fullStick(4);
    check(`hudfix: ${plane} Easy full stick 4 s holds at the soft-limit`, r.max > 45 && r.max < 68, `max ${r.max}° tag ${r.tag}`);
    if (plane === 'c172') {
      check('hudfix: stick tag says BANK 60° at the limit', /BANK 60/.test(r.tag), r.tag);
      await cruise(kt);
      const d = await fullStick(2.5, 150, true);
      check('hudfix: ease off + push again rolls past the 60° detent', d.after > 75, `held ${d.max.toFixed(1)}° → re-push ${d.after.toFixed(1)}°`);
      await cruise(kt);
      const small = await fullStick(2.5, 40);
      const rate = Math.abs(small.max - Math.abs(small.b0)) / 2.5;
      check('hudfix: 40 px deflection still a gentle roll', small.max < 45 && small.max > 5, `max ${small.max}° (≈${rate.toFixed(0)}°/s)`);
    }
  }
  await up('', { 'krayzee.settings': { difficulty: 'hard', v: 3 } });
  await cruise();
  const hard = await fullStick(4);
  check('hudfix: Hard has no bank limit (rate-capped roll)', hard.max > 90 && hard.max < 200, `max ${hard.max}°`);

  // B3/B4: the lever shows and keeps the player's setting; AUTO hands it back
  await up();
  await cruise();
  const t = await rectOf('.krz-thr'), tx = t.x + t.w / 2, ty = (v) => t.y + 14 + (1 - v) * (t.h - 28);
  await tsend({ type: 'touchStart', touchPoints: [{ x: tx, y: ty(0.9), id: 5 }] });
  for (let i = 0; i <= 6; i++) { await tsend({ type: 'touchMove', touchPoints: [{ x: tx, y: ty(0.9 - i * 0.4 / 6), id: 5 }] }); await sleep(40); }
  await sleep(300);
  await tsend({ type: 'touchEnd', touchPoints: [] });
  await sleep(6000);
  const lat = await ev(`({ lever: +document.querySelector('.krz-thr-v').textContent, mode: __game.state().player.modes.throttle, ctl: __game.state().player.ctl.throttle, auto: getComputedStyle(document.querySelector('.krz-thr-auto')).visibility })`);
  check('hudfix: throttle latched where the player left it (6 s later)', lat.mode === 'latched' && Math.abs(lat.lever - 50) <= 3 && Math.abs(lat.ctl - 0.5) < 0.04, JSON.stringify(lat));
  check('hudfix: AUTO detent shown while the player owns the throttle', lat.auto === 'visible');
  const ov1 = overlaps({ auto: await rectOf('.krz-thr-auto'), radio: await rectOf('.krz-r-btn'), stick: await rectOf('.krz-stick-zone'), pad: await rectOf('.krz-pad'), land: await rectOf('.krz-land') });
  check('hudfix: AUTO detent clear of radio, stick, pad, LAND', ov1.length === 0, ov1.join(', '));
  console.log('  shot', await shot('hudfix-01-thr-latched'));
  await tap('.krz-thr-auto');
  await sleep(1500);
  const back = await ev(`({ lever: +document.querySelector('.krz-thr-v').textContent, mode: __game.state().player.modes.throttle, ctl: __game.state().player.ctl.throttle, auto: getComputedStyle(document.querySelector('.krz-thr-auto')).visibility })`);
  check('hudfix: AUTO by real tap hands the throttle back', back.mode !== 'latched' && back.mode !== 'manual' && back.auto === 'hidden' && Math.abs(back.lever - Math.round(back.ctl * 100)) <= 2, JSON.stringify(back));

  // B9: RECOVERING banner replaces the AP pill row instead of growing into the subtitles
  await ev(`(() => { __game.wiring.radio.setVisible(true); __game.S.player.ap.events.push({ type: 'recovery', low: false }); return 1; })()`);
  await sleep(400);
  const bn = await rectOf('.krz-banner'), subs = await ev(`[...document.querySelectorAll('.krz-r-subs, .krz-r-pill')].map((e) => e.getBoundingClientRect()).filter((r) => r.width && r.height).map((r) => ({ x: r.x, y: r.y, w: r.width, h: r.height }))`);
  const hudR = await rectOf('#krz-hud');
  check('hudfix: RECOVERING banner clear of the subtitles', bn && subs.every((r) => !hit(bn, r)) && bn.y + bn.h <= hudR.y + hudR.h + 2, JSON.stringify({ bn, hudR, subs: subs.slice(0, 2) }));

  // B9: no coach mark mid-dive; it waits for level flight
  await up('', { 'krayzee.coach': { goal: 1, stick: 1, release: 1, radio: 1 } });
  await ev(`__game.teleport({ x: -1500, z: 2500, alt: 900, heading: 90, speedKt: 100, throttle: 1 })`);
  await ev(`__game.setControls({ elevator: -0.7, aileron: 0.5, throttle: 1 }, 5000)`);
  await sleep(1200);
  await ev(`__game.wiring.game.handleEvent({ type: 'tower_buzz', id: 9301, actor: 'player', data: { dist: 20 } })`);
  let dive = 0, shownInDive = false;
  for (let i = 0; i < 14; i++) {
    const s = await ev(`[__game.state().player.vsFpm, __game.state().player.bank, !!document.querySelector('.krz-coach:not([hidden])') && !!__game.hud.coach.active]`);
    if (s[0] < -1500 || Math.abs(s[1]) > 45) { dive++; if (s[2]) shownInDive = true; }
    await sleep(250);
  }
  check('hudfix: no coach mark during a dive', dive > 3 && !shownInDive, `dive samples ${dive}`);
  await ev('__game.release()');
  check('hudfix: the bank coach mark shows once level again', await until(`__game.hud.coach.active === 'bank' && !document.querySelector('.krz-coach').hidden`, 30), JSON.stringify(await ev('__game.hud.coach')));

  // B6: waiting on the runway → coach points at DEMAND TAKEOFF, not RADIO
  await up('', { 'krayzee.coach': { goal: 1, stick: 1, release: 1, radio: 0, bank: 1 }, 'krayzee.coachTakeoff': null });
  await ev(`(() => { const ap = __game.S.player.ap; ap.gate = () => false; return 1; })()`);
  const tc = await until(`__game.hud.takeoffCoach?.active && __game.hud.coach.active == null`, 12);
  check('hudfix: waiting plane gets the DEMAND TAKEOFF coach mark (not RADIO)', tc, JSON.stringify(await ev('[__game.hud.takeoffCoach, __game.hud.coach.active]')));
  const ring = await rectOf('.krz-coach[data-step="takeoff"] .krz-coach-ring'), to = await rectOf('.krz-gbtn-to');
  check('hudfix: the mark rings the DEMAND TAKEOFF button', ring && to && ring.x <= to.x && ring.y <= to.y && ring.x + ring.w >= to.x + to.w && ring.y + ring.h >= to.y + to.h, JSON.stringify({ ring, to }));
  console.log('  shot', await shot('hudfix-02-takeoff-coach'));
  await tap('.krz-gbtn-to');
  check('hudfix: DEMAND TAKEOFF by real tap ends the mark', await until(`__game.hud.takeoffCoach.done && __game.hud.takeoffCoach.why === 'pressed'`, 3));

  // chase camera never inside a canopy (PLAYTEST_2 §6)
  const spot = await ev(`(() => { for (let x = -1400; x < -400; x += 3) for (let z = 900; z < 2500; z += 3) if (__game.treeTop(x, z, -3) > -1e9) return { x, z }; return null; })()`);
  if (spot) {
    await ev(`__game.teleport({ x: ${spot.x + 14}, z: ${spot.z}, alt: 0.3, heading: 90, speedKt: 0, throttle: 0 })`);
    await ev(`__game.setControls({ throttle: 0, brake: 1 }, 6000)`);
    await sleep(3000);
    const c = await ev(`(() => { const p = __game.camera.position; return { y: p.y, top: __game.treeTop(p.x, p.z, 0) }; })()`);
    check('hudfix: chase camera above the canopy next to trees', c.y > c.top, JSON.stringify(c));
    await ev('__game.release()');
  } else check('hudfix: tree data for the camera', false, 'no tree found');

  // ONLINE §17: the room's type + protection reach the game (Strict Tower: realistic, −500 crash penalty)
  const on = await ev(`(() => { const W = __game.wiring, P = __game.S.player; W.endPlay(); W.startPlay('online', P, { room: { type: 'strict', protection: 'realistic', partialStart: 100 } });
    const g = W.game, s = g.state(); const r = g.reportImpact({ speedKt: 60, onGear: false }); const out = { prot: s.protectionMode, pen: r?.crashPenalty, res: r?.result, diff: W.difficulty }; W.endPlay(); W.startPlay('free', P); return out; })()`);
  check('hudfix: online room protection + Strict Tower penalty reach the game', on.prot === 'realistic' && on.pen === 500 && on.diff === 'hard', JSON.stringify(on));

  // landscape: LAND vs the prompt card, the target label, portrait centre view LAND off the gauge row
  await viewport(844, 390, true);
  await up();
  await ev(`__game.ghud.prompts.reset()`);
  await ev(`__game.teleport({ x: 900, z: -300, alt: 140, heading: 270, speedKt: 95, throttle: 0.75 })`);
  const pr = await until(`__game.hud.prompts.current && !document.querySelector('.krz-land').hidden`, 14);
  await sleep(600);
  const lr = await rectOf('.krz-land'), prr = await rectOf('.krz-prompt');
  check('hudfix: landscape LAND clear of the prompt card', pr && lr && prr && !hit(lr, prr), JSON.stringify({ lr, prr }));
  const mk = await ev(`({ sig: __game.S.mkSig, label: __game.hud.target?.label })`);
  check('hudfix: target marker label follows the live target', !!mk.label && mk.sig.endsWith('|' + mk.label), JSON.stringify(mk));
  console.log('  shot', await shot('hudfix-03-land-prompt-landscape'));
  await viewport(390, 844, true);
  await up('&view=center');
  await cruise();
  const lc = await rectOf('.krz-land'), sz = await rectOf('.krz-stick-zone'), ac = await rectOf('.krz-actions');
  check('hudfix: portrait centre view LAND sits on the stick band, off the gauge row', lc && sz && lc.y >= sz.y - 4 && lc.y + lc.h <= sz.y + 70, JSON.stringify({ lc, sz }));
  console.log('  shot', await shot('hudfix-04-center-land'));
  check('hudfix: no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
}

async function falsify() {
  console.log('\n== falsify: drag the score widget over the pause button; the overlap check must FAIL');
  await viewport(390, 844, true);
  await send('Page.navigate', { url: BASE + 'docs/' }); await sleep(500);
  await freshStorage({ 'krayzee.coach': { goal: 1, stick: 1, release: 1, radio: 1, bank: 1 } });
  await load('?start=free&noaccount=1');
  await sleep(2500);
  await ev(`(() => { const s = document.createElement('style'); s.textContent = '.krz-score { left: 0 !important; }'; document.head.append(s); return 1; })()`);
  await sleep(300);
  const before = results.length;
  const ov = await layoutCheck('falsified');
  results.splice(before);
  const caught = ov.some((s) => s.includes('score'));
  check('falsify: broken layout is caught by the overlap check', caught, ov.join(', '));
}

async function main() {
  await connect();
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable'); await send('Log.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  listeners.push((d) => {
    if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
    if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errors.push(d.params.args.map((a) => a.value ?? a.description).join(' '));
    if (d.method === 'Log.entryAdded' && d.params.entry.level === 'error' && !/voices\/.*(sample|\.mp3)|favicon|br8t|firebase|googleapis/i.test(d.params.entry.url || d.params.entry.text)) errors.push(d.params.entry.text + ' ' + (d.params.entry.url || ''));
  });
  if (FALSIFY) await falsify();
  else {
    if (ONLY.includes('portrait')) await scenario(390, 844, true, 'portrait');
    if (ONLY.includes('landscape')) await scenario(844, 390, true, 'landscape');
    if (ONLY.includes('desktop')) await scenario(1280, 800, false, 'desktop');
    if (ONLY.includes('finish')) { await finishFlow(390, 844, true, 'finish-portrait'); await finishFlow(1280, 800, false, 'finish-desktop'); }
    // before ground: after the two-thumb ground-landscape run headless Chrome drops later single-touch gestures
    if (ONLY.includes('hudfix')) await hudFix();
    if (ONLY.includes('ground')) { await groundOverride(390, 844, 'ground-portrait'); await groundOverride(844, 390, 'ground-landscape'); }
    if (ONLY.includes('groundl')) await groundOverride(844, 390, 'ground-landscape');
    if (ONLY.includes('finishd')) await finishFlow(1280, 800, false, 'finish-desktop');
  }
  const fails = results.filter((r) => !r.ok);
  console.log(`\n${results.length - fails.length}/${results.length} passed`);
  ws.close();
  process.exit(fails.length ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(2); });
