// A6 (STAIRS) in the REAL game: the Jumbo parked on a C-Tower 1 stand gets its boarding moment (stairs roll up, door,
// carpet, the King + footman + corgi go in, stairs roll away), and a DEMAND TAKEOFF tapped mid-moment sends the stairs
// away before the plane taxis. The Herc, flown north at the Palace Lawn under AUTO OFF, opens its ramp from the LAND
// slot's second pill, drops the hamper when the hint says ON TARGET, and the chute brings it down for Royal Picnic PP.
// Screenshots → docs/shots/stairs/.
//   ~/.claude/bin/cdp start --port 9721 --idle 3600 --max 14400 -- --use-angle=metal
//   node tools/test-stairs.mjs [--port=9721] [--only=jumbo,herc] [--falsify=noboard|nobonus|noramp]
//   noboard: boarding.update is a no-op; nobonus: the cargo_drop score event is dropped; noramp: the pill press is
//   ignored. Each must go red.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect } from './story/cdp.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(HERE, '..', 'docs', 'shots', 'stairs');
const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').split('=')[1] || d;
const ONLY = arg('only', 'jumbo,herc').split(',');
const FALSIFY = arg('falsify', '');
const BASE = arg('url', 'http://127.0.0.1:8888/gms/3d/krayzee/');
const PROFILE = { name: 'Rex', gender: 'm', company: 'Rex Air', primary: '#2f3b8a', secondary: '#f6f1e6', accent: '#c8102e', voice: 'toff', registration: 'K-REXX' };

const C = await connect(+arg('port', 9721));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); };
const G = 'window.__game';

async function boot(plane, w, h) {
  await C.viewport(w, h, true);
  await C.send('Page.navigate', { url: 'about:blank' });
  await C.sleep(200);
  await C.load(BASE + '?intro=0');
  await C.ev(`localStorage.setItem('krayzee.profile', ${JSON.stringify(JSON.stringify(PROFILE))}); localStorage.setItem('krayzee.coach', '{"goal":1,"stick":1,"release":1,"radio":1,"bank":1}'); localStorage.setItem('krayzee.coachTakeoff', '1'); true`);
  const ok = await C.load(BASE + `?allplanes&noaccount=1&intro=0&plane=${plane}`);
  C.errors.length = 0;
  await C.ev(`${G}.start('free')`);
  const t0 = Date.now();
  while (Date.now() - t0 < 25000 && !(await C.ev(`!!${G}.S.player`))) await C.sleep(300);
  await C.sleep(1500);
  await C.ev(`${G}.setView?.('chase')`);
  if (FALSIFY === 'noboard') await C.ev(`(${G}.boarding.update = () => {}, true)`);
  if (FALSIFY === 'nobonus') await C.ev(`(() => { const g = ${G}.wiring.game, he = g.handleEvent; g.handleEvent = (ev) => (ev?.type === 'cargo_drop' ? undefined : he(ev)); return true; })()`);
  if (FALSIFY === 'noramp') await C.ev(`(${G}.cargo.press = () => false, true)`);
  return ok && (await C.ev(`${G}.S.player?.rig.type`)) === plane;
}

// a fixed camera (HUD hidden) for the docs shots: at world point eye, looking at look
async function camShot(name, eye, look, fov = 50) {
  await C.ev(`(() => { const R = ${G}.renderer.renderer, cam = ${G}.camera;
    R.__r ||= R.render.bind(R);
    R.render = (s, c) => { cam.position.set(${eye.join(',')}); cam.lookAt(${look.join(',')}); cam.fov = ${fov}; cam.updateProjectionMatrix(); R.__r(s, cam); };
    for (const e of document.body.children) if (e.tagName !== 'CANVAS' && !e.querySelector('canvas')) e.style.visibility = 'hidden'; document.getElementById('krz-overlay').style.visibility = 'hidden'; return true; })()`);
  await C.sleep(250);
  await C.shot(SHOTS, name);
  await C.ev(`(() => { const R = ${G}.renderer.renderer; if (R.__r) R.render = R.__r; for (const e of document.body.children) e.style.visibility = ''; document.getElementById('krz-overlay').style.visibility = ''; return true; })()`);
}

const BSTATE = `${G}.boarding.state`;
const PSTATE = `(() => { const p = ${G}.state().player; return p && { x: p.x, z: p.z, gs: ${G}.S.player.ac.gs ?? 0, onGround: p.onGround, agl: p.agl, heading: p.heading, crashed: p.crashed }; })()`;
// world points of the Jumbo's door / stairs foot, and a spot off the left side to film them from
const DOORCAM = `(() => { const s = ${G}.S.player.rig._ext.stairs, A = s.userData.anchor, V = s.position.constructor;
  const w = (p) => s.parent.localToWorld(new V(...p)).toArray().map((v) => +v.toFixed(2));
  return { door: w(A.door), foot: w(A.foot), eye: w([A.foot[0] - 16, 3.2, A.door[2] - 13]) }; })()`;

if (ONLY.includes('jumbo')) {
  check('jumbo: boots (portrait 390×844)', await boot('jumbo', 390, 844));
  // the stand farthest from any AI plane (a parked AI would shove us off a shared one)
  const stand = await C.ev(`import('${BASE}js/world/layout.js').then((L) => { const ai = ${G}.state().ai;
    const free = (s) => Math.min(1e9, ...ai.map((a) => Math.hypot(a.x - s.position[0], a.z - s.position[2])));
    const s = [...L.STANDS].sort((a, b) => free(b) - free(a))[0]; return { x: s.position[0], z: s.position[2], heading: s.heading, n: L.STANDS.length, free: Math.round(free(s)) }; })`);
  // parked on the stand as a taxi-in leaves it (the autopilot's PARKED leg holds the brakes)
  const PARK = (x, z, hd) => C.ev(`(() => { const g = ${G}, P = g.S.player; g.teleport({ x: ${x}, z: ${z}, alt: 0, heading: ${hd}, speedKt: 0, throttle: 0 });
    P.ap.setRoute({ name: 'parked', legs: [{ kind: 'park', seconds: 9999, label: 'PARKED' }], loop: null }); return true; })()`);
  await PARK(stand.x, stand.z, stand.heading);
  const seen = new Set(), t0 = Date.now();
  let firstVis = null, lastVis = null, crowd = 0, door = 0, shot = 0, maxGs = 0;
  while (Date.now() - t0 < 14000) {
    const b = await C.ev(BSTATE), p = await C.ev(PSTATE);
    seen.add(b.phase);
    if (b.visible) { firstVis ??= Date.now() - t0; lastVis = Date.now() - t0; maxGs = Math.max(maxGs, p.gs); }
    door = Math.max(door, b.door);
    if (b.phase === 'parade') {
      crowd = Math.max(crowd, await C.ev(`${G}.S.player.rig._ext.stairs.children.filter((m) => m.name.startsWith('boarding-') && m.visible).length`));
      if (shot < 3 && b.parade > shot * 0.3 + 0.1) {
        const d = await C.ev(DOORCAM);
        await camShot(`jumbo_boarding_${shot}`, d.eye, [(d.door[0] + d.foot[0]) / 2, 3, (d.door[2] + d.foot[2]) / 2], 48);
        if (shot === 1) await C.shot(SHOTS, 'jumbo_boarding_hud_portrait');
        shot++;
      }
    }
    if (b.phase === 'done') break;
    await C.sleep(100);
  }
  const diag = firstVis == null ? await C.ev(`(() => { const g = ${G}, ac = g.S.player.ac, st = g.boarding.st; return { stopT: st.stopT, armed: st.armed, gs: ac.gs, onGround: ac.onGround, crashed: ac.crashed, x: ac.pos.x, z: ac.pos.z, leg: g.S.player.ap.leg?.kind }; })()`) : '';
  check('jumbo: stopped on a stand, the stairs roll up', firstVis != null && firstVis < 4000, `first visible after ${firstVis} ms on stand ${stand.x},${stand.z} ${JSON.stringify(diag)}`);
  check('jumbo:   … door opens, the crowd goes up and in', seen.has('parade') && door > 0.99 && crowd >= 2, `phases ${[...seen].join(' ')}, door ${door.toFixed(2)}, ${crowd} figures seen`);
  check('jumbo:   … and the stairs roll away again: a short moment', seen.has('done') && lastVis - firstVis < 9000 && !(await C.ev(`${BSTATE}.visible`)), `visible ${firstVis}–${lastVis} ms, max gs ${maxGs.toFixed(2)} m/s`);
  check('jumbo:   … the plane never moved while they were out', maxGs <= 0.3, `${maxGs.toFixed(2)} m/s`);

  // again, and tap DEMAND TAKEOFF in the middle of it: they go before the plane taxis
  await PARK(stand.x + 300, stand.z + 300, 0);
  await C.sleep(400);
  await PARK(stand.x, stand.z, stand.heading);
  let b = null; const t1 = Date.now();
  while (Date.now() - t1 < 8000 && (b = await C.ev(BSTATE)).phase !== 'parade') await C.sleep(100);
  const p0 = await C.ev(PSTATE);
  await C.sleep(600);
  const tapped = await C.tapSel('.krz-gbtn-to');
  let goneAt = null, gsGone = null, movedGone = null, moved = 0, gsMax = 0;
  const t2 = Date.now();
  while (Date.now() - t2 < 9000) {
    b = await C.ev(BSTATE); const p = await C.ev(PSTATE);
    moved = Math.hypot(p.x - p0.x, p.z - p0.z); gsMax = Math.max(gsMax, p.gs);
    if (!b.visible && goneAt == null) { goneAt = Date.now() - t2; gsGone = p.gs; movedGone = moved; }
    if (goneAt != null && moved > 5) break;
    await C.sleep(80);
  }
  check('jumbo: DEMAND TAKEOFF tapped mid-moment (the moment never blocks the buttons)', !!tapped && b && (gsMax > 1 || moved > 2), `tap ${tapped ? 'hit' : 'missed'}, then moved ${moved.toFixed(1)} m, gs up to ${gsMax.toFixed(1)} m/s`);
  check('jumbo:   … the stairs are away before it taxis', goneAt != null && movedGone < 1.5 && gsGone < 1.5, `gone after ${goneAt} ms, at ${gsGone?.toFixed(2)} m/s having moved ${movedGone?.toFixed(2)} m`);
  await C.shot(SHOTS, 'jumbo_taxi_after');
  check('jumbo: no console errors', C.errors.length === 0, C.errors.slice(0, 3).join(' / '));
}

if (ONLY.includes('herc')) {
  check('herc: boots (landscape 844×390)', await boot('herc', 844, 390));
  const T = await C.ev(`import('${BASE}js/flight/cargo.js').then((m) => m.targetFor(${G}.world.airport))`);
  check('herc: the Palace Lawn target in this world', T?.id === 'palace_lawn', JSON.stringify(T));
  // run in upwind at ~150 m, hands off (AUTO OFF holds the attitude): start ≈ 1.1 km short of where a hamper let go
  // at 100 m would reach the lawn, so the ramp is open in time and the descent is still well above the 40 m floor
  const RUN = await C.ev(`import('${BASE}js/flight/cargo.js').then((m) => { const w = ${G}.world.wind, h = w.from * Math.PI / 180, f = [Math.sin(h), -Math.cos(h)], v = 130 * 0.5144;
    const p = m.predictLanding([0, 100, 0], [f[0] * v, 0, f[1] * v], () => 0, m.windVel(w), 0.1), down = p.x * f[0] + p.z * f[1];
    return { heading: w.from, x: ${T.x} - f[0] * (down + 1100), z: ${T.z} - f[1] * (down + 1100), down }; })`);
  await C.ev(`(() => { const g = ${G}; g.teleport({ x: ${RUN.x}, z: ${RUN.z}, alt: 150, heading: ${RUN.heading}, speedKt: 130, throttle: 0.55, flaps: 0.3 }); g.traffic.setAutoOff(g.S.player, true); return true; })()`);
  await C.sleep(800);
  const LB = `${G}.landButton()`;
  let lb = await C.ev(LB);
  check('herc: airborne and slow: OPEN RAMP on the LAND slot\'s second pill', lb.ctx?.alt === 'ramp' && /OPEN RAMP/.test(lb.alt || ''), `${JSON.stringify(lb.ctx)} alt "${lb.alt}"`);
  // the pill covers no control (it is LAND's own second pill, as the F-35's), in landscape and portrait
  const COVER = `(() => { const pill = document.querySelector('.krz-land-now'), r = pill.getBoundingClientRect(), out = [];
    for (const s of ['.krz-stick-zone', '.krz-thr-col', '.krz-pad', '.krz-r-btn', '.krz-autobtn', '.krz-gbtn', '.krz-top-l', '.krz-top-r', '.krz-map-chip'])
      for (const e of document.querySelectorAll(s)) { if (e.hidden || e.closest('[hidden]') || getComputedStyle(e).visibility === 'hidden') continue; const q = e.getBoundingClientRect();
        if (q.width && r.left < q.right && q.left < r.right && r.top < q.bottom && q.top < r.bottom) out.push(s); }
    return { clash: out, inside: r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, w: Math.round(r.width) }; })()`;
  const cvL = await C.ev(COVER);
  check('herc:   … the pill covers no control (landscape)', !cvL.clash.length && cvL.inside, JSON.stringify(cvL));
  await C.shot(SHOTS, 'herc_pill_landscape');
  await C.viewport(390, 844, true); await C.sleep(900);
  const cvP = await C.ev(COVER);
  check('herc:   … nor in portrait', !cvP.clash.length && cvP.inside, JSON.stringify(cvP));
  await C.shot(SHOTS, 'herc_pill_portrait');
  await C.viewport(844, 390, true); await C.sleep(500);
  const tap1 = await C.tapSel('.krz-land-now');
  await C.sleep(600);
  const ph = await C.ev(`${G}.cargo.state.phase`);
  check('herc:   … tap: the ramp opens', !!tap1 && ph === 'opening', `phase ${ph}`);
  const t0 = Date.now();
  while (Date.now() - t0 < 9000 && (await C.ev(`${G}.cargo.state.phase`)) !== 'open') await C.sleep(200);
  await C.sleep(400);   // the slot repaints 4× a second
  lb = await C.ev(LB);
  const ramp = await C.ev(`${G}.S.player.rig._ext.ramp.rotation.x`);
  check('herc:   … open: DROP HAMPER with a hint', lb.ctx?.alt === 'drop' && ramp > 0.45, `alt "${lb.alt}", ramp ${ramp.toFixed(2)} rad`);
  { const p = await C.ev(`${G}.S.player.rig.root.position.toArray()`), h = (await C.ev(PSTATE)).heading * Math.PI / 180;
    await camShot('herc_ramp_open', [p[0] - Math.sin(h) * 40 + Math.cos(h) * 14, p[1] - 4, p[2] + Math.cos(h) * 40 + Math.sin(h) * 14], [p[0], p[1] - 1, p[2]], 45); }
  // fly on until the predictor says ON TARGET (or the lawn is behind us)
  let hint = '', best = 1e9, t1 = Date.now();
  while (Date.now() - t1 < 40000) {
    const s = await C.ev(`${G}.cargo.state`), p = await C.ev(PSTATE);
    hint = s.hint;
    if (s.pred) best = Math.min(best, Math.hypot(s.pred.x - T.x, s.pred.z - T.z));
    if (/ON TARGET/.test(hint) || p.crashed || s.phase !== 'open') break;
    await C.sleep(150);
  }
  check('herc:   … the hint calls ON TARGET over the approach', /ON TARGET/.test(hint), `hint "${hint}", closest predicted ${best.toFixed(0)} m, ramp ${(await C.ev(`${G}.cargo.state`)).shut || 'open'}`);
  const tap2 = await C.tapSel('.krz-land-now');
  await C.sleep(300);
  const ph2 = await C.ev(`${G}.cargo.state.phase`);
  check('herc:   … DROP HAMPER: it rolls out of the hold', !!tap2 && (ph2 === 'sliding' || ph2 === 'closing'), `phase ${ph2}`);
  const pp = [];
  await C.ev(`(() => { window.__pp = []; ${G}.wiring.game.on('pp', (e) => window.__pp.push({ id: e.id, amount: e.amount, dist: e.dist })); return true; })()`);
  let st = null, chute = 0, shots = 0, t2 = Date.now();
  while (Date.now() - t2 < 45000) {
    st = await C.ev(`${G}.cargo.state`);
    const c = st.crates.at(-1);
    if (c) {
      chute = Math.max(chute, c.chute);
      if (shots < 2 && c.chute > 0.9 && (shots === 0 || c.y < 40)) {
        await camShot(`herc_hamper_chute_${shots}`, [c.x + 22, c.y + (shots ? 6 : -4), c.z + 26], [c.x, c.y + 3, c.z], 50);
        shots++;
      }
      if (c.landed) break;
    }
    await C.sleep(200);
  }
  const L = st?.landings.at(-1);
  check('herc:   … the chute opens and it lands', chute >= 1 && !!L, `chute ${chute}, landing ${JSON.stringify(L)}`);
  await C.sleep(400);
  const pays = (await C.ev('window.__pp')).filter((e) => e.id === 'cargo_drop');
  check('herc:   … on the Palace Lawn: Royal Picnic PP (D39)', L && L.dist <= 60 && pays.length === 1 && pays[0].amount > 0, `${L?.dist} m from the centre, ${pays.map((e) => '+' + e.amount).join(', ') || 'no PP'}`);
  if (L) { const gy = await C.ev(`${G}.world.groundHeightAt(${L.x}, ${L.z})`); await camShot('herc_hamper_on_lawn', [L.x + 12, gy + 9, L.z + 15], [L.x, gy + 0.5, L.z], 50); }
  const t3 = Date.now();
  while (Date.now() - t3 < 8000 && (await C.ev(`${G}.cargo.state.phase`)) !== 'empty') await C.sleep(250);
  lb = await C.ev(LB);
  const ramp2 = await C.ev(`${G}.S.player.rig._ext.ramp.rotation.x`);
  check('herc:   … ramp shut, hold empty, plain LAND again', ramp2 < 0.02 && !lb.ctx && lb.label === 'LAND', `ramp ${ramp2.toFixed(2)}, ctx ${JSON.stringify(lb.ctx)}, label ${lb.label}`);
  check('herc: no console errors', C.errors.length === 0, C.errors.slice(0, 3).join(' / '));
}

const bad = results.filter((r) => !r.ok);
console.log(`\n${results.length - bad.length}/${results.length} passed${FALSIFY ? ` (falsify=${FALSIFY}: must be red)` : ''}`);
process.exit(bad.length ? 1 : 0);
