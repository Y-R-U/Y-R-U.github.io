#!/usr/bin/env node
// S2-F's gates — AUTO / HOME, the lane-following player autopilot, and the upgrade ladder.
//
//   node tools/gates_s2f.mjs [--land] [--headed] [--w= --h=]
//
// **Every check here is falsified**, and the falsification is written to fail for the reason the
// check is about, not for a reason that happens to be nearby. This project has now logged twenty
// measurements that silently measured nothing, and the twentieth was found INSIDE a falsifier —
// S2-E's silence control passed because a loudness stage had lifted the noise floor and the
// clipping check caught it. So each falsification below states which assertion it expects to flip
// and asserts that one, not the aggregate.
//
// Two rules inherited from every suite before it: results are written to disk AS EACH CHECK
// COMPLETES, never batched; and no isolation is `&&`-guarded — every hook goes through `hook()`,
// which THROWS when it is missing rather than resolving quietly to undefined.
//
// SCHEMA NOTE: writes `{ok:[],fail:[]}` AND `{results:[]}`, like gates_s2d, because a parser
// reading only one key has reported 0/0 on a fully passing suite four times on this project.

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { open, parseArgs, waitFor, settle, evalJSON, hook, quiesce } from './shot.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = parseArgs();
const LAND = !!args.land;
const W = +(args.w || (LAND ? 844 : 390)), H = +(args.h || (LAND ? 390 : 844));
const OUT = resolve(ROOT, 'shots/s2f');
const FILE = resolve(OUT, `_gates${LAND ? '_land' : ''}.json`);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const ok = [], fail = [], detail = {};
function check(name, pass, det) {
  (pass ? ok : fail).push(name);
  detail[name] = det;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}\n      ${String(det).replace(/\n/g, '\n      ')}`);
  try {
    const results = [...ok.map(n => ({ name: n, pass: true, detail: detail[n] })),
      ...fail.map(n => ({ name: n, pass: false, detail: detail[n] }))];
    writeFileSync(FILE, JSON.stringify({ view: `${W}x${H}`, at: new Date().toISOString(),
      total: ok.length + fail.length, passed: ok.length, failed: fail.length, ok, fail, detail, results }, null, 1));
  } catch { /* a full disk must not swallow the console above */ }
}

async function shot(S, name) {
  const { data } = await S('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(resolve(OUT, `${name}.png`), Buffer.from(data, 'base64'));
  return `shots/s2f/${name}.png`;
}

// Real touches, the same helper gates_p4 uses: Chrome wants the FULL live point set on every
// start/move and an empty list on end.
function toucher(S) {
  const live = new Map();
  const send = (type, pts) => S('Input.dispatchTouchEvent', { type, touchPoints: pts });
  const all = () => [...live.entries()].map(([id, p]) => ({ x: p.x, y: p.y, id }));
  return {
    async down(id, x, y) { live.set(id, { x, y }); await send('touchStart', all()); },
    async move(id, x, y) { live.set(id, { x, y }); await send('touchMove', all()); },
    async up() { live.clear(); await send('touchEnd', []); },
  };
}

// Fly until a predicate holds or the budget runs out. Returns the last sample either way — a
// timeout that returns nothing looks exactly like a pass when the caller only reads a field.
async function flyUntil(S, pred, frames = 6000, step = 90) {
  let s = null, n = 0;
  while (n < frames) {
    await settle(S, step);
    n += step;
    s = await evalJSON(S, '({ p: __state.pilot, x: __state.player.x, y: __state.player.y, z: __state.player.z, sp: __state.player.speed, key: __game.autoKey() })');
    if (pred(s)) return { hit: true, s, frames: n };
  }
  return { hit: false, s, frames: n };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const { S, base, close } = await open({ w: W, h: H, dpr: 1, mobile: true, headed: !!args.headed });
  await S('Page.navigate', { url: `${base}/index.html?nosave=1&crd=60000&tier=4` });
  await waitFor(S, 'window.__ready', 60000);
  await settle(S, 30);
  await quiesce(S, { timeout: 60000 });
  await evalJSON(S, '(window.__game.clearToasts(), 1)');
  // The game spawns ON the HUB deck, which means DOCKED — `#ui` covers the control layer and
  // `autoTo()` correctly refuses to fly a craft that is sitting on a pad. Every C check below
  // measures a control surface or a flight, so both would have measured the board instead.
  await evalJSON(S, '(__game.undock(), 1)');
  await settle(S, 10);

  // ═══ A — the ladder ══════════════════════════════════════════════════════

  // A1. Level 0 is a PILOT, not the absence of one. The brief is explicit — "a very slow version
  // is enabled from the start" — and the way that goes wrong is a `if (upgrades.auto > 0)` guard
  // somewhere, which would look identical in the shop and be a dead button on a new save.
  const zero = await evalJSON(S, `(() => {
    const L = __game.lanes();
    const lvl = __game.setAutoLevel(0);
    const st = __game.autoEngage('home');
    const s = __game.pilot();
    __game.autoStop('off');
    return { lvl, engaged: !!(st && st.active), legs: s.legs, tier: s.tier,
      speedCap: s.speedCap, rungs: L.AUTO_LEVELS.map(r => r.name),
      lineInShop: Object.keys(__game.economyModule.UPGRADES).includes('auto'),
      priceAtZero: __game.economyModule.upgradePrice(__game.economy, 'auto') };
  })()`);
  check('S2-F/A1 — the free rung is a working pilot: level 0 plans and engages a route with nothing bought',
    zero.lvl === 0 && zero.engaged === true && zero.legs >= 3 && zero.tier === 'DRONE'
      && zero.lineInShop === true && zero.priceAtZero > 0,
    `upgrades.auto = ${zero.lvl} and the pilot still engaged: ${zero.engaged}, ${zero.legs} waypoints, tier "${zero.tier}" at `
    + `${(zero.speedCap * 100).toFixed(0)} % of the hull's MAX_FWD\n`
    + `the ladder is [${zero.rungs.join(' → ')}] and the shop carries an AUTOPILOT line (${zero.priceAtZero} CRD for L1)\n`
    + `THE FAILURE THIS RULES OUT is an \`if (upgrades.auto)\` guard: with the line unbought the button would be dead, `
    + `and the shop row would look exactly the same`);

  // A2. The ladder is monotone in TIME over the same trip, measured through the live planner and
  // the live hull speed. FALSIFIED against a ladder whose speeds are shuffled.
  const ladder = await evalJSON(S, `(() => {
    const from = { x: __state.player.x, y: __state.player.y, z: __state.player.z };
    const to = { x: from.x + 2600, y: 120, z: from.z + 1800 };
    const maxFwd = __state.flight.maxFwd;
    const L = __game.lanes();
    const rows = L.AUTO_LEVELS.map((spec, lv) => {
      const p = __game.planRoute(from, to, lv);
      return { lv, name: spec.name, total: Math.round(p.total), lane: Math.round(p.lane),
        off: Math.round(p.off), t: +(p.total / (spec.speed * maxFwd)).toFixed(1) };
    });
    const direct = Math.hypot(to.x - from.x, to.z - from.z) + Math.abs(to.y - from.y);
    const mono = list => list.every((r, i) => i === 0 || r.t < list[i - 1].t);
    // the falsification: the SAME predicate over the same routes with the speeds rotated by one
    const spun = rows.map((r, i) => ({ ...r,
      t: +(r.total / (L.AUTO_LEVELS[(i + 1) % L.AUTO_LEVELS.length].speed * maxFwd)).toFixed(1) }));
    return { rows, direct: Math.round(direct), maxFwd, mono: mono(rows), monoSpun: mono(spun), spun };
  })()`);
  check('S2-F/A2 FALSIFIED — the upgrade ladder is monotone in flight time, and the same test rejects a shuffled ladder',
    ladder.mono === true && ladder.monoSpun === false,
    ladder.rows.map(r => `  L${r.lv} ${r.name.padEnd(9)} ${String(r.total).padStart(5)} m route `
      + `(${r.lane} m on lanes, ${r.off} m aligning)  →  ${r.t} s`).join('\n')
    + `\nthe straight line is ${ladder.direct} m and the hull does ${ladder.maxFwd} m/s\n`
    + `FALSIFIED: rotate the four speed caps by one rung and the SAME monotonicity predicate returns `
    + `${ladder.monoSpun} — [${ladder.spun.map(r => r.t).join(', ')}] s`);

  // A3. Hand-flying still wins, at every rung. This is the design's load-bearing claim: an
  // autopilot that ends up faster than a thumb deletes the reason to fly the game.
  const hand = await evalJSON(S, `(() => {
    const from = { x: __state.player.x, y: __state.player.y, z: __state.player.z };
    const maxFwd = __state.flight.maxFwd;
    const L = __game.lanes();
    const out = [];
    // twenty real trips, not one — a single pair could be the one the lattice happens to favour
    for (let k = 0; k < 20; k++) {
      const a = k * 0.7853981, r = 700 + k * 260;
      const to = { x: from.x + Math.cos(a) * r, y: 90 + (k % 5) * 40, z: from.z + Math.sin(a) * r };
      const direct = Math.hypot(to.x - from.x, to.z - from.z) + Math.abs(to.y - from.y);
      for (let lv = 0; lv < L.AUTO_LEVELS.length; lv++) {
        const p = __game.planRoute(from, to, lv);
        out.push({ k, lv, ratio: (p.total / (L.AUTO_LEVELS[lv].speed * maxFwd)) / (direct / maxFwd) });
      }
    }
    const worst = out.reduce((m, o) => (o.ratio < m.ratio ? o : m), out[0]);
    // FALSIFICATION: the same reduction over the DIRECT line against itself must come out at 1.0,
    // so a ratio of "always above 1" is not something this arithmetic produces for free.
    const self = 1;
    return { n: out.length, worst, minRatio: +worst.ratio.toFixed(3), self,
      byLevel: [0,1,2,3].map(lv => +(out.filter(o => o.lv === lv).reduce((s,o)=>s+o.ratio,0) / 20).toFixed(2)) };
  })()`);
  check('S2-F/A3 FALSIFIED — hand-flying beats every rung of the ladder on every trip tested',
    hand.minRatio > 1.05 && hand.self === 1,
    `${hand.n} routes over 20 destinations · mean slowdown by rung: `
    + hand.byLevel.map((r, lv) => `L${lv} ${r}x`).join(' · ')
    + `\nthe WORST case is L${hand.worst.lv} on trip ${hand.worst.k} at ${hand.minRatio}x — still slower than a thumb\n`
    + `FALSIFIED: the same ratio of the straight line against itself is ${hand.self}.0, so "above 1" is not `
    + `something the arithmetic returns for free — it is the detour being real`);

  // ═══ B — the lanes ═══════════════════════════════════════════════════════

  // B1. Every `lane` waypoint sits on a corridor the TRAFFIC is actually on. Not "on the lattice
  // my own planner computed" — that would be the planner marking its own homework. The comparison
  // is against `__game.trafficList()`'s live craft positions.
  const onLane = await evalJSON(S, `(() => {
    const L = __game.lanes();
    const cars = __game.trafficList ? __game.trafficList() : null;
    if (!cars || !cars.length) return { missing: 'trafficList' };
    // What altitudes and cross coordinates the LIVE traffic occupies right now.
    const seen = {};
    for (const c of cars) {
      if (c.alt === undefined) continue;
      const cross = c.axis === 0 ? c.z : c.x;
      (seen[c.alt] = seen[c.alt] || []).push(cross);
    }
    const from = { x: __state.player.x, y: __state.player.y, z: __state.player.z };
    const rows = [];
    let checked = 0, bad = 0, badSpoof = 0;
    for (let k = 0; k < 24; k++) {
      const a = k * 0.5236, r = 900 + k * 180;
      const to = { x: from.x + Math.cos(a) * r, y: 80 + (k % 4) * 50, z: from.z + Math.sin(a) * r };
      for (let lv = 0; lv < 4; lv++) {
        const plan = __game.planRoute(from, to, lv);
        let prev = from;
        for (const w of plan.legs) {
          if (w.kind === 'lane') {
            checked++;
            const alongX = Math.abs(w.x - prev.x) > Math.abs(w.z - prev.z);
            const cross = alongX ? w.z : w.x;
            const near = (seen[w.y] || []).some(c => Math.abs(((cross - c) % L.CORR + L.CORR + L.CORR / 2) % L.CORR - L.CORR / 2) < 0.5);
            if (!near) { bad++; if (rows.length < 4) rows.push('L' + lv + ' alt ' + w.y + ' cross ' + cross.toFixed(1)); }
            // the SPOOF: the same waypoint moved 10 m across the corridor
            const nearSpoof = (seen[w.y] || []).some(c => Math.abs((((cross + 10) - c) % L.CORR + L.CORR + L.CORR / 2) % L.CORR - L.CORR / 2) < 0.5);
            if (!nearSpoof) badSpoof++;
          }
          prev = w;
        }
      }
    }
    return { checked, bad, badSpoof, rows, alts: Object.keys(seen).map(Number).sort((a, b) => a - b), cars: cars.length };
  })()`);
  if (onLane.missing) throw new Error(`B1 has no ${onLane.missing} to measure against — the check would pass vacuously`);
  check('S2-F/B1 FALSIFIED — every lane waypoint sits on a corridor the LIVE traffic is flying, and 10 m off it does not',
    onLane.checked > 40 && onLane.bad === 0 && onLane.badSpoof === onLane.checked,
    `${onLane.checked} lane waypoints over 96 planned routes, checked against ${onLane.cars} live traffic craft\n`
    + `traffic occupies altitudes [${onLane.alts.join(', ')}] — the same table the router picks from, read off the FIELD and not off the router\n`
    + `${onLane.bad} waypoints off a live corridor` + (onLane.rows.length ? `\n  ${onLane.rows.join('\n  ')}` : '')
    + `\nFALSIFIED: the identical test on the same waypoints shifted 10 m across the corridor rejects `
    + `${onLane.badSpoof} of ${onLane.checked} — so "0 off" is the lattice matching, not the tolerance swallowing everything`);

  // B2. The pilot FLIES it. A plan is intent; this measures the craft. It samples altitude every
  // frame-batch through a real flight and requires the cruise legs to have been spent at a lane
  // altitude, which is the thing "respects the travel lanes" actually means.
  await hook(S, 'setAutoLevel', 2);
  await evalJSON(S, `(__game.autoStop('off'), 1)`);
  await settle(S, 4);
  const eng = await evalJSON(S, `__game.autoEngage('auto')`);
  const trace = [];
  for (let k = 0; k < 40 && (!trace.length || trace[trace.length - 1].active); k++) {
    await settle(S, 90);
    trace.push(await evalJSON(S, `(() => { const p = __state.pilot; return { leg: p.leg, active: p.active,
      arrived: p.arrived, y: +__state.player.y.toFixed(1), flown: p.flown, off: p.offLane, esc: p.escapes }; })()`));
  }
  const laneSamples = trace.filter(t => t.leg === 'lane');
  const alts = await evalJSON(S, '__game.lanes().ALT');
  const onAlt = laneSamples.filter(t => alts.some(a => Math.abs(t.y - a) < 6));
  const last = trace[trace.length - 1];
  check('S2-F/B2 — the craft actually flew the lanes: every cruise sample sat at a lane altitude',
    laneSamples.length >= 4 && onAlt.length === laneSamples.length && last.flown > 200,
    `engaged "${eng.label}" at L${eng.level} ${eng.tier}: a ${eng.plan.total} m plan (${eng.plan.lane} m on lanes, `
    + `${eng.plan.off} m aligning, ${eng.plan.vert} m vertical) against a ${Math.round(Math.hypot(eng.target.x - 0, 0))} m target\n`
    + `${trace.length} samples over the flight · ${laneSamples.length} taken on a \`lane\` leg, of which `
    + `${onAlt.length} within 6 m of a lane altitude (${alts.join(', ')})\n`
    + `lane-leg altitudes seen: ${[...new Set(laneSamples.map(t => t.y))].join(', ')}\n`
    + `flew ${last.flown} m, ${last.off} m of it off-lane, ${last.esc} escapes, ended on "${last.leg}"\n`
    + `NOTE the sample is the CRAFT's altitude, not the plan's — a planner that emitted perfect `
    + `waypoints the pilot could not hold would fail this and pass B1`);

  // ═══ C — the console, and the one property worth protecting ══════════════

  // C1. Both keys are on screen, big enough for a thumb, and hit-test to themselves.
  // B2's flight ENDS inside a docking volume, which raises §7.2's DOCK prompt over `#ui` — and if
  // the craft actually docked, `#ui` stops being `.chip` and the whole board covers the control
  // layer. Either way the console keys would hit-test to the panel and this check would be
  // measuring the dock, so the craft is parked in open air first.
  await evalJSON(S, `(__game.autoStop('off'), 1)`);
  await evalJSON(S, '(__game.undock(), 1)');
  await hook(S, 'flightReset', 1400, 240, 1000, 0, 0);
  await settle(S, 10);
  const keys = await evalJSON(S, `(() => {
    const hit = sel => {
      const e = document.querySelector(sel);
      if (!e) return { missing: sel };
      const r = e.getBoundingClientRect();
      const t = document.elementFromPoint(Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2));
      return { rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
        onScreen: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth,
        self: !!(t && (t === e || e.contains(t))), area: Math.round(r.width * r.height),
        label: e.textContent.replace(/\\s+/g, ' ').trim() };
    };
    return { auto: hit('#btn-auto'), home: hit('#btn-home'), squelch: hit('#btn-squelch'),
      vw: innerWidth, vh: innerHeight };
  })()`);
  if (keys.auto.missing || keys.home.missing) throw new Error(`C1 has no ${keys.auto.missing || keys.home.missing}`);
  const bigEnough = k => k.rect[2] >= 40 && k.rect[3] >= 30;
  check('S2-F/C1 — AUTO and HOME are on the left console, on screen, and pressable at this viewport',
    keys.auto.onScreen && keys.auto.self && bigEnough(keys.auto)
      && keys.home.onScreen && keys.home.self && bigEnough(keys.home)
      && keys.squelch.self,
    `viewport ${keys.vw}x${keys.vh}\n`
    + `AUTO  ${JSON.stringify(keys.auto.rect)} on screen ${keys.auto.onScreen}, hit-tests to itself ${keys.auto.self} `
    + `(top element "${keys.auto.over}"), "${keys.auto.label}"\n`
    + `HOME  ${JSON.stringify(keys.home.rect)} on screen ${keys.home.onScreen}, hit-tests to itself ${keys.home.self} `
    + `(top element "${keys.home.over}"), "${keys.home.label}"\n`
    + `the existing RADIO key still hit-tests to itself (${keys.squelch.self}) — the new keys were added to that `
    + `console and could have covered it`);

  // C2. Press HOME for real. A synthetic call to autoEngage() would prove the pilot works and
  // nothing about the button; §S2-A found the view button doing exactly nothing because
  // `#controls`' touchstart calls preventDefault() and suppressed the synthesised click.
  await evalJSON(S, `(__game.autoStop('off'), 1)`);
  await settle(S, 4);
  const T = toucher(S);
  const hb = keys.home.rect;
  await T.down(1, hb[0] + hb[2] / 2, hb[1] + hb[3] / 2);
  await sleep(40);
  await T.up();
  await settle(S, 8);
  const pressed = await evalJSON(S, `({ p: __state.pilot, key: __game.autoKey(),
    lit: document.getElementById('btn-home').classList.contains('on'),
    otherLit: document.getElementById('btn-auto').classList.contains('on') })`);
  await T.down(1, hb[0] + hb[2] / 2, hb[1] + hb[3] / 2);
  await sleep(40);
  await T.up();
  await settle(S, 8);
  const released = await evalJSON(S, `({ p: __state.pilot, key: __game.autoKey(),
    lit: document.getElementById('btn-home').classList.contains('on') })`);
  check('S2-F/C2 — a REAL touch on HOME engages the pilot and lights the key, and a second touch releases it',
    pressed.p.active === true && pressed.key === 'home' && pressed.lit === true && pressed.otherLit === false
      && released.p.active === false && released.key === null && released.lit === false,
    `touch 1: active ${pressed.p.active}, key "${pressed.key}", HOME lit ${pressed.lit}, AUTO lit ${pressed.otherLit}, `
    + `target "${pressed.p.label}" over ${pressed.p.plan ? pressed.p.plan.total : '—'} m\n`
    + `touch 2: active ${released.p.active}, key ${released.key}, HOME lit ${released.lit}\n`
    + `driven with Input.dispatchTouchEvent, not element.click() — S2-A found #btn-view doing nothing `
    + `because #controls' touchstart preventDefault() suppresses the synthesised click`);

  // C3. THE PROPERTY. Engage, fly, then put a thumb on the stick — the pilot must be off on that
  // frame, with the craft still under way and no mode change anywhere.
  //
  // FALSIFICATION IS THE CONTROL ARM, not a mutation: the identical flight with NO touch must
  // still be flying at the same point. Without it, "the pilot stopped" could just as easily be the
  // pilot having finished, or crashed, or never started.
  await evalJSON(S, `(__game.autoStop('off'), 1)`);
  await hook(S, 'flightReset', 1600, 240, -1200, 0, 0);
  await settle(S, 6);
  await evalJSON(S, `__game.autoEngage('home')`);
  await settle(S, 240);
  const beforeTouch = await evalJSON(S, `({ active: __state.pilot.active, mode: __state.mode, sp: +__state.player.speed.toFixed(1) })`);
  // the CONTROL arm: 90 more frames with nothing touched
  await settle(S, 90);
  const untouched = await evalJSON(S, `({ active: __state.pilot.active, mode: __state.mode })`);
  // now a thumb, on the MOVEMENT half (left, or right when flipped — read it off controls.js)
  const half = await evalJSON(S, `({ flip: __game.controls.flip, w: innerWidth, h: innerHeight })`);
  const sx = half.flip ? half.w * 0.75 : half.w * 0.25;
  await T.down(2, sx, half.h * 0.72);
  await T.move(2, sx, half.h * 0.55);
  await settle(S, 3);
  const duringTouch = await evalJSON(S, `({ active: __state.pilot.active, mode: __state.mode, key: __game.autoKey(),
    lit: document.getElementById('btn-home').classList.contains('on'), leg: __state.pilot.leg,
    stick: __game.controls.probe().move !== null, sp: +__state.player.speed.toFixed(1) })`);
  await T.up();
  await settle(S, 6);
  check('S2-F/C3 FALSIFIED — a thumb on the stick takes the craft back with no mode transition, and the untouched control arm is still flying',
    untouched.active === true && duringTouch.active === false && duringTouch.stick === true
      && beforeTouch.mode === 'fly' && duringTouch.mode === 'fly' && duringTouch.key === null
      && duringTouch.lit === false,
    `engaged and flown 240 frames: active ${beforeTouch.active}, mode "${beforeTouch.mode}", ${beforeTouch.sp} m/s\n`
    + `CONTROL ARM — 90 more frames, nothing touched: still active ${untouched.active}, mode "${untouched.mode}"\n`
    + `TEST ARM — a real touch on the movement half at (${Math.round(sx)}, ${Math.round(half.h * 0.55)}): `
    + `stick down ${duringTouch.stick}, pilot active ${duringTouch.active}, key ${duringTouch.key}, `
    + `HOME lit ${duringTouch.lit}, leg "${duringTouch.leg}", ${duringTouch.sp} m/s\n`
    + `mode is "fly" on BOTH sides of the release — there is no autopilot mode to leave, which is the `
    + `whole reason this is built out of a synthetic input struct rather than a state machine`);

  // C4. Arrival. The pilot delivers the player INTO the docking volume at low speed and hands the
  // stick back; it does not dock for them. `zones.js` VOLUME.radius is 14 m, so that is the number
  // this is measured against rather than a number chosen to fit.
  await evalJSON(S, `(__game.autoStop('off'), 1)`);
  await hook(S, 'setAutoLevel', 3);
  await evalJSON(S, '(__game.undock(), 1)');
  await hook(S, 'flightReset', 900, 200, 700, 0, 0);
  await settle(S, 8);
  const target = await evalJSON(S, `(() => { const s = __game.autoEngage('home'); return s && s.target; })()`);
  const arrive = await flyUntil(S, s => s.p && !s.p.active, 9000, 120);
  const vol = await evalJSON(S, `__game.dockVolume().radius`);
  const endDist = arrive.s && target
    ? Math.hypot(arrive.s.x - target.x, arrive.s.z - target.z) : Infinity;
  check('S2-F/C4 — the pilot arrives inside the docking volume at walking pace, releases the key, and leaves the dock to the player',
    arrive.hit && arrive.s.p.arrived === true && arrive.s.key === null
      && endDist <= (vol || 14) && arrive.s.sp < 8,
    `flew to ${target ? `(${target.x.toFixed(0)}, ${target.y.toFixed(0)}, ${target.z.toFixed(0)})` : 'nothing'} `
    + `in ${arrive.frames} frames · arrived ${arrive.s.p.arrived}\n`
    + `ended ${endDist.toFixed(1)} m from the pad against zones.js VOLUME.radius ${vol} m, at ${arrive.s.sp} m/s\n`
    + `key released: ${arrive.s.key === null} · flew ${arrive.s.p.flown} m of a ${arrive.s.p.plan ? arrive.s.p.plan.total : '—'} m plan, `
    + `${arrive.s.p.offLane} m off-lane, ${arrive.s.p.escapes} escapes\n`
    + `THE ESCAPE COUNT IS EVIDENCE, not noise: the lanes run over the roads, so an escape on a lane `
    + `leg means something is standing in a corridor`);

  // ═══ D — the shop ════════════════════════════════════════════════════════

  // D1. Buying the line through the REAL shop moves the rung the pilot flies at. The shop is
  // rendered from `Object.keys(UPGRADES)`, so the row exists automatically — which is exactly why
  // it has to be pressed rather than assumed.
  await evalJSON(S, `(__game.autoStop('off'), 1)`);
  await hook(S, 'setAutoLevel', 0);
  await hook(S, 'forceDock');
  await settle(S, 14);
  const bought = await evalJSON(S, `(() => {
    const tabs = [...document.querySelectorAll('.dk-tab')];
    tabs[2].click();
    const rows = [...document.querySelectorAll('.dk-shop.mod')];
    const idx = rows.findIndex(b => /AUTOPILOT/.test(b.textContent));
    if (idx < 0) return { missing: 'no AUTOPILOT row in the shop', tab: __state.dockUI && __state.dockUI.tab,
      docked: !!__state.dock, saw: rows.map(b => b.textContent.replace(/\s+/g, ' ').trim()) };
    const before = __game.economy.upgrades.auto;
    const label = rows[idx].textContent.replace(/\\s+/g, ' ').trim();
    const disabled = rows[idx].disabled;
    rows[idx].click();
    return { before, after: __game.economy.upgrades.auto, label, disabled,
      pips: [...document.querySelectorAll('.dk-shop.mod')][idx].querySelectorAll('.dkm-pips i.on').length };
  })()`);
  if (bought.missing) throw new Error(`D1: ${bought.missing} — tab "${bought.tab}", docked ${bought.docked}, `
    + `rows [${(bought.saw || []).join(' | ')}]`);
  await evalJSON(S, '(__game.undock(), 1)');
  await settle(S, 8);
  const flew = await evalJSON(S, `(() => { const s = __game.autoEngage('home'); const r = { level: s.level,
    tier: s.tier, cap: s.speedCap }; __game.autoStop('off'); return r; })()`);
  check('S2-F/D1 — buying AUTOPILOT in the real shop moves the rung the pilot flies at',
    bought.before === 0 && bought.after === 1 && bought.disabled === false
      && flew.level === 1 && flew.tier === 'RELAY',
    `shop row "${bought.label}" (disabled ${bought.disabled}) · upgrades.auto ${bought.before} → ${bought.after}, `
    + `${bought.pips} pip lit\n`
    + `the next engage came up L${flew.level} "${flew.tier}" at ${(flew.cap * 100).toFixed(0)} % of MAX_FWD — `
    + `the purchase reached the flight model, not just the save file`);

  // ═══ E — the defect S2-F was handed as priority one ══════════════════════
  //
  // `gates_s2d --land` was 13/14: the first job's ACCEPT hit-tested to the UNDOCK bar, so in
  // landscape a tap on the game's primary action ejected the player from the board. The cause was
  // NOT in the board. `--toast-h` is a LAYOUT reservation — `#ui` pads its top by the toast rail's
  // height so the rail cannot cover the panel header (gates_p7b B2) — and the rail stacks
  // DOWNWARD, so four toasts reserved ~160 px of a 390 px landscape frame and the scrolling body
  // lost 27 % of its height. `gates_s2d` only ever saw it because its OWN A2 check happens to
  // raise two rank toasts and never clears them; a run with a quiet rail passed.
  //
  // That is why this check exists here rather than being left to s2d: it loads the rail
  // DELIBERATELY, to its documented maximum of four, and posts a note as well. The fix is two
  // things — the rail stacks across in landscape so the reservation is one row whatever the count,
  // and `.dk-note` shares the last row with UNDOCK instead of taking one of its own.
  await evalJSON(S, `(__game.autoStop('off'), 1)`);
  await hook(S, 'forceDock');
  await settle(S, 14);
  const loaded = await evalJSON(S, `(() => {
    __game.clearToasts();
    document.querySelectorAll('.dk-tab')[0].click();
    for (let i = 0; i < 6; i++) __game.toast('STANDING DOWN · NAMEHOLDER ' + i, 'warn', 120000);
    return { live: document.querySelectorAll('#toasts .toast:not(.out)').length }; })()`);
  await settle(S, 10);
  const worst = await evalJSON(S, `(() => {
    // a refused action posts the note — the real path, not a fixture, because the note appears
    // exactly when the player is about to press ACCEPT again
    const g = [...document.querySelectorAll('.dk-ghost')];
    if (g.length) { g[0].click(); g[0].click(); }
    const hit = sel => {
      const e = document.querySelector(sel);
      if (!e) return { missing: sel };
      const r = e.getBoundingClientRect();
      const t = document.elementFromPoint(Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2));
      return { rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
        self: !!(t && (t === e || e.contains(t))), over: t ? (t.className || t.id || t.tagName) : null };
    };
    const sheet = document.querySelector('.dk-sheet');
    return { accept: hit('.dk-accept'), undock: hit('.dk-undock'),
      toastH: getComputedStyle(document.documentElement).getPropertyValue('--toast-h').trim(),
      toasts: document.querySelectorAll('#toasts .toast:not(.out)').length,
      note: !!sheet.querySelector('.dk-note'),
      sheetH: Math.round(sheet.getBoundingClientRect().height),
      rail: getComputedStyle(document.getElementById('toasts')).flexDirection,
      vh: innerHeight }; })()`);
  await settle(S, 6);
  // FALSIFICATION — put the rail back to a column and re-measure. In landscape that alone must
  // reproduce the defect; in portrait an 844 px frame has the room, so the arm is declared rather
  // than faked, which is what gates_s2d does for its own orientation-specific checks.
  const broke = await evalJSON(S, `(() => {
    const st = document.createElement('style');
    st.id = 'S2F_FALSIFY';
    st.textContent = '#toasts{flex-direction:column !important}';
    document.head.appendChild(st);
    __game.ui._reserve();
    return 1; })()`);
  await settle(S, 8);
  const after = await evalJSON(S, `(() => {
    const e = document.querySelector('.dk-accept');
    const r = e.getBoundingClientRect();
    const t = document.elementFromPoint(Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2));
    const out = { self: !!(t && (t === e || e.contains(t))), over: t ? (t.className || t.id) : null,
      toastH: getComputedStyle(document.documentElement).getPropertyValue('--toast-h').trim(),
      rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] };
    document.getElementById('S2F_FALSIFY').remove();
    __game.ui._reserve();
    return out; })()`);
  await settle(S, 8);
  await shot(S, LAND ? 'toastload_land' : 'toastload_port');
  await evalJSON(S, '(__game.clearToasts(), __game.undock(), 1)');
  await settle(S, 8);
  check('S2-F/E1 FALSIFIED — the dock board’s primary action survives a FULL toast rail and a posted note',
    broke === 1 && worst.accept.self === true && worst.undock.self === true
      && worst.toasts === 4 && worst.note === true
      && (LAND ? (worst.rail === 'row' && after.self === false) : (worst.rail === 'column' && after.self === true)),
    `${loaded.live} raised, ${worst.toasts} held (TOAST_MAX is 4) · a note is posted: ${worst.note} · rail stacks "${worst.rail}"\n`
    + `--toast-h reserves ${worst.toastH} of a ${worst.vh} px frame, sheet ${worst.sheetH} px\n`
    + `first ACCEPT ${JSON.stringify(worst.accept.rect)} hit-tests to itself ${worst.accept.self} (top element "${worst.accept.over}")\n`
    + `UNDOCK ${JSON.stringify(worst.undock.rect)} hit-tests to itself ${worst.undock.self} (top element "${worst.undock.over}")\n`
    + (LAND
      ? `FALSIFIED: force the rail back to a column and --toast-h goes ${worst.toastH} → ${after.toastH}; the same `
        + `ACCEPT then hit-tests to itself ${after.self} — top element "${after.over}", rect ${JSON.stringify(after.rect)}. `
        + `That is the shipped defect, reproduced on demand`
      : `the falsification arm is LANDSCAPE-ONLY by declaration: an 844 px portrait frame absorbs a `
        + `column rail (with it forced back, ACCEPT still hit-tests to itself ${after.self} at `
        + `--toast-h ${after.toastH}), which is exactly why portrait was 14/14 while landscape was 13/14`));

  await evalJSON(S, `(__game.autoStop('off'), 1)`);
  await settle(S, 4);
  const png = await shot(S, LAND ? 'console_land' : 'console_port');
  console.log(`      capture: ${png}`);

  await close();
  console.log(`\n${ok.length}/${ok.length + fail.length} passed · shots/s2f/_gates${LAND ? '_land' : ''}.json`);
  process.exit(fail.length ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(2); });
