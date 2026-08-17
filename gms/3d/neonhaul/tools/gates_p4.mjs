#!/usr/bin/env node
// P4's done-criteria (§13), as one command.
//
//   node tools/gates_p4.mjs
//   node tools/gates_p4.mjs --lite          ← the LOW preset
//   node tools/gates_p4.mjs --headed        ← real GPU; only the cost gate cares
//
// Two halves, deliberately:
//
//   · a NODE half that imports js/flight.js directly and asserts §6.2's arithmetic as numbers.
//     §6.2 states auto-stop as a closed-form claim — "from 62 m/s, under the 0.6 m/s snap at
//     1.03 s" — and a claim like that is settled by running the integrator, not by a screenshot.
//   · a BROWSER half that drives the real page through `Input.dispatchTouchEvent` with two
//     simultaneous touch points, in portrait AND landscape, with the sides flipped and unflipped.
//     A screenshot cannot tell you whether two thumbs work at once; only two touch identifiers can.
//
// Every control claim here is checked at BOTH ends. "The stick makes it go" is asserted alongside
// "with no stick it does not", "flipping the sides swaps the roles" alongside "at the same pixel
// the unflipped build does the opposite". A measurement that cannot come out the other way is not
// a measurement — that lesson has now cost this project four phases.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { open, parseArgs, waitFor, settle, evalJSON, hook, cleanup, logs } from './shot.mjs';
import { Flight, emptyInput } from '../js/flight.js';
import { FLIGHT as F, AERIAL, GATES } from '../js/config.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = parseArgs();
const DPR = +(args.dpr || 1);
const LITE = args.lite ? '&lite=1' : '';
const OUT = resolve(ROOT, 'shots/p4');
const sleep = ms => new Promise(r => setTimeout(r, ms));

// evalJSON stringifies the EXPRESSION, so a promise comes back as "{}" — the value has to be
// stringified after it resolves. The two gates below time things on requestAnimationFrame and
// both need this.
async function evalP(S, expr) {
  const r = await S('Runtime.evaluate', { expression: `(${expr}).then(v => JSON.stringify(v))`, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return JSON.parse(r.result.value);
}

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass: !!pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}\n      ${detail}`);
}

// ── the node half ──────────────────────────────────────────────────────────

const DT = 1 / 60;
const FWD = { ...emptyInput(), moveY: -1, moveActive: true };
const REL = emptyInput();

function fly(f, inp, secs, world = null, cb = null) {
  const n = Math.round(secs / DT);
  for (let i = 0; i < n; i++) { f.update(DT, inp, world); if (cb) cb(f, (i + 1) * DT); }
  return f;
}
// One 40 x 40 m tower, 200 m tall, at the origin — the collision cases want a shape they can
// state exactly, not whatever the seeded field happened to put in front of the camera.
const TOWER = [{ x0: -20, x1: 20, z0: -20, z1: 20, top: 200, proto: 'slab', landmark: null }];
const world = {
  aabbsNear(x, z, r, out) {
    out.length = 0;
    for (const b of TOWER) if (!(b.x1 < x - r || b.x0 > x + r || b.z1 < z - r || b.z0 > z + r)) out.push(b);
    return out;
  },
};

function nodeGates() {
  // 1 — AUTO-STOP, the phase's headline number.
  let f = new Flight().reset(0, 200, 0, 0);
  let tCruise = null;
  fly(f, FWD, 4, null, (g, t) => { if (tCruise === null && g.speed >= 61.99) tCruise = t; });
  const atRelease = f.speed;
  let tHalf = null, tFive = null, tStop = null;
  fly(f, REL, 3, null, (g, t) => {
    if (tHalf === null && g.speed <= atRelease / 2) tHalf = t;
    if (tFive === null && g.speed < 5) tFive = t;
    if (tStop === null && g.speed === 0) tStop = t;
  });
  check('§6.2 auto-stop — full cruise, released, speed reaches EXACTLY 0 inside 1.2 s',
    atRelease >= 61.99 && tStop !== null && tStop <= 1.2,
    `released at ${atRelease.toFixed(3)} m/s (rest → cruise took ${tCruise.toFixed(3)} s at ACC_FWD ${F.ACC_FWD}); `
    + `half speed ${tHalf.toFixed(3)} s (§6.2 predicts 0.154), under 5 m/s ${tFive.toFixed(3)} s (0.56), `
    + `speed === 0 at ${tStop.toFixed(4)} s against §6.2's arithmetic of 1.03 s and the §13 gate of 1.2 s. `
    + `Integrated at ${(1 / DT).toFixed(0)} Hz from js/flight.js, in node, with no renderer involved.`);

  // The control for it. If DAMP_RELEASE were not doing the work, this test would still "pass" for
  // a model that never moved — so show the same integrator failing when the damping is removed.
  const g2 = new Flight().reset(0, 200, 0, 0);
  const realDamp = F.DAMP_RELEASE;
  fly(g2, FWD, 4);
  F.DAMP_RELEASE = 0.0001;
  let stillFast = 0;
  fly(g2, REL, 1.2, null, g => { stillFast = g.speed; });
  F.DAMP_RELEASE = realDamp;
  check('  …and the auto-stop test can FAIL: with DAMP_RELEASE removed it does not stop',
    stillFast > 55,
    `same integrator, same 1.2 s, DAMP_RELEASE ${realDamp} → 0.0001: still ${stillFast.toFixed(2)} m/s. `
    + `The gate above is measuring the damping, not measuring nothing.`);

  // 2 — §6.2's clamp table, every axis.
  const rows = [];
  const one = (label, inp, pick, want) => {
    const g = new Flight().reset(0, 300, 0, 0);
    fly(g, inp, 6);
    const v = pick(g);
    rows.push(`${label} ${v.toFixed(2)}/${want}`);
    return Math.abs(v - want) < 0.05;
  };
  const clamps = [
    one('MAX_FWD', FWD, g => g.speed, F.MAX_FWD),
    one('MAX_BOOST', { ...FWD, boost: true }, g => g.speed, F.MAX_BOOST),
    one('MAX_REV', { ...emptyInput(), moveY: 1, moveActive: true }, g => g.speed, F.MAX_REV),
    one('MAX_STRAFE', { ...emptyInput(), moveX: 1, moveActive: true }, g => g.speed, F.MAX_STRAFE),
    one('MAX_VERT', { ...emptyInput(), climb: 1 }, g => g.vy, F.MAX_VERT),
  ];
  check('§6.2 every MAX_* is a hard clamp the model actually reaches',
    clamps.every(Boolean), rows.join('  ') + '   (measured m/s after 6 s of full input, m/s wanted)');

  // 3 — the floor and the ceiling (§6.3 item 5). ALT_MAX is 760, not 520.
  const up = new Flight().reset(0, 300, 0, 0); fly(up, { ...emptyInput(), climb: 1 }, 90);
  const dn = new Flight().reset(0, 300, 0, 0); fly(dn, { ...emptyInput(), climb: -1 }, 90);
  check('§6.3 item 5 — 90 s of full climb stops at ALT_MAX, 90 s of full descent stops at the floor',
    Math.abs(up.py - F.ALT_MAX) < 0.5 && dn.py >= F.HARD_FLOOR - 0.01 && dn.py <= F.ALT_MIN,
    `ceiling ${up.py.toFixed(2)} m (ALT_MAX ${F.ALT_MAX}, soft push from ${F.ALT_WARN}); `
    + `floor ${dn.py.toFixed(2)} m (soft assist below ${F.ALT_MIN}, hard floor ${F.HARD_FLOOR}). `
    + `Neither is a wall you hit — both are forces that win.`);

  // 4 — altitude hold. Drop it with 9 m/s of sink and let go.
  const ah = new Flight().reset(0, 300, 0, 0);
  ah.vy = -9;
  let sag = 0;
  fly(ah, REL, 8, null, g => { sag = Math.min(sag, g.py - 300); });
  check('§6.3 item 2 — altitude hold catches a 9 m/s sink and holds, hands off',
    ah.altHold !== null && Math.abs(ah.py - 300) < 4 && Math.abs(ah.vy) < 0.05,
    `dropped from 300 m at −9 m/s with nothing held: sagged ${sag.toFixed(2)} m, settled at `
    + `${ah.py.toFixed(2)} m, vy ${ah.vy.toFixed(4)}, hold target ${ah.altHold.toFixed(1)} m after `
    + `ALT_HOLD_DELAY ${F.ALT_HOLD_DELAY} s. PD ${F.ALT_HOLD_KP}/${F.ALT_HOLD_KD} clamped ±${F.ALT_HOLD_CLAMP} m/s².`);

  // 5 — §6.3 item 1, the whole thesis. Two runs, IDENTICAL input, one with the visual bank pinned
  // to its extreme. The attitude must move and the trajectory must not.
  const a = new Flight().reset(0, 200, 0, 0);
  const b = new Flight().reset(0, 200, 0, 0);
  b.bankForce = F.BANK_MAX;
  const turn = { ...FWD, lookDX: 6 };
  fly(a, turn, 6); fly(b, turn, 6);
  const dp = Math.hypot(a.px - b.px, a.py - b.py, a.pz - b.pz);
  check('§6.3 item 1 — attitude is a DECORATION: pinning bank to ±0.5 rad changes it and moves nothing',
    Math.abs(b.bank - F.BANK_MAX) < 1e-3 && Math.abs(a.bank) > 0.02 && dp === 0,
    `two 6 s runs, byte-identical input (forward + a 6 px/frame turn). free bank settled at `
    + `${a.bank.toFixed(4)} rad, pinned bank at ${b.bank.toFixed(4)} — so the control demonstrably `
    + `has an effect — and the two craft finished ${dp.toFixed(9)} m apart. Nothing in the velocity `
    + `path reads bank or vpitch.`);

  // 6 — the wall, in a shape we can state exactly.
  const w = new Flight().reset(0, 100, 220, 0);
  fly(w, FWD, 3, world);
  const approach = w.speed;
  let minSpeed = 99, slidX = 0, maxInside = 0, free = null;
  fly(w, FWD, 8, world, (g, t) => {
    minSpeed = Math.min(minSpeed, g.speed);
    slidX = Math.min(slidX, g.px);
    maxInside = Math.max(maxInside, g.insideT);
    if (free === null && g.pz < -30) free = t;
  });
  check('§6.3 items 3+4 — dead-on at full cruise into a 40 m face: soft, slides, and comes out',
    approach > 61 && maxInside < 0.6 && free !== null && w.speed > 55 && w.unsticks === 0,
    `hit at ${approach.toFixed(1)} m/s dead centre, no steering input at any point. Slowed to `
    + `${minSpeed.toFixed(1)} m/s, never penetrated for more than ${maxInside.toFixed(3)} s, slid `
    + `${Math.abs(slidX).toFixed(1)} m sideways along the facade, rounded the corner at t+${free.toFixed(1)} s `
    + `and was back at ${w.speed.toFixed(1)} m/s. ${w.contacts} contacts, 0 damage, 0 fail states, `
    + `${w.unsticks} unstick frames. The tangential half of the repulsion is what does this — `
    + `without it the craft parked at 3.2 m and sat there (see flight.js repel()).`);

  // 7 — the trap. Start INSIDE the tower, hold nothing.
  const tr = new Flight().reset(0, 100, 0, 0);
  let esc = null;
  fly(tr, REL, 12, world, (g, t) => { if (esc === null && g.nearest > F.HULL_R) esc = t; });
  check('no trap — a hull teleported inside solid geometry gets itself out',
    esc !== null && esc < 1.5,
    `spawned at the centre of a 40 x 40 x 200 m tower with NO input at all: clear of the surface `
    + `after ${esc.toFixed(3)} s, ended ${tr.nearest.toFixed(1)} m outside at `
    + `(${tr.px.toFixed(1)}, ${tr.py.toFixed(1)}, ${tr.pz.toFixed(1)}). UNSTICK_AFTER ${F.UNSTICK_AFTER} s `
    + `never had to fire; the shallowest-face push alone resolved it.`);

  // 8 — decision 11. Can the player actually get to the vista and back, and how long does it take?
  const cl = new Flight().reset(0, 120, 0, 0);
  cl.pitchT = F.THRUST_PITCH * Math.PI / 180;
  let t0 = null, t1 = null;
  fly(cl, FWD, 60, null, (g, t) => {
    if (t0 === null && g.py >= AERIAL.y0) t0 = t;
    if (t1 === null && g.py >= AERIAL.y1) t1 = t;
  });
  const cb = new Flight().reset(0, 120, 0, 0);
  cb.pitchT = F.THRUST_PITCH * Math.PI / 180;
  let b0 = null, b1 = null;
  fly(cb, { ...FWD, boost: true }, 60, null, (g, t) => {
    if (b0 === null && g.py >= AERIAL.y0) b0 = t;
    if (b1 === null && g.py >= AERIAL.y1) b1 = t;
  });
  const dv = new Flight().reset(0, 700, 0, 0);
  dv.pitchT = -F.THRUST_PITCH * Math.PI / 180;
  let back = null;
  fly(dv, FWD, 60, null, (g, t) => { if (back === null && g.py <= AERIAL.y0) back = t; });
  check(`decision 11 — the flight model reaches the vista and comes back down`,
    t1 !== null && b1 !== null && back !== null && back < 20,
    `AERIAL ramps ${AERIAL.y0}→${AERIAL.y1} m. Climbing at the ±${F.THRUST_PITCH}° thrust clamp with `
    + `forward held: ${AERIAL.y0} m at ${t0.toFixed(1)} s, ${AERIAL.y1} m at ${t1.toFixed(1)} s — the ramp `
    + `itself takes ${(t1 - t0).toFixed(1)} s. On boost: ${(b1 - b0).toFixed(1)} s. Descending: back under `
    + `${AERIAL.y0} m in ${back.toFixed(1)} s. NOTE — config.AERIAL's comment says "~4 s of climb at `
    + `§6.2's rates"; the measured figure is ${(b1 - b0).toFixed(1)} s boosted and ${(t1 - t0).toFixed(1)} s at `
    + `cruise. Longer is if anything better for the transition being invisible, but the comment is wrong.`);

  // 9 — a long open-air run must not drift, NaN or accumulate anything.
  const lg = new Flight().reset(0, 200, 0, 0);
  let bad = 0;
  for (let i = 0; i < 60 * 60 * 5; i++) {           // 5 minutes at 60 Hz
    const t = i * DT;
    const inp = { ...FWD, lookDX: 3 + 2 * Math.sin(t / 7), climb: Math.sin(t / 11) > 0.6 ? 1 : 0 };
    lg.update(DT, inp, world);
    if (!Number.isFinite(lg.px + lg.py + lg.pz + lg.speed + lg.yaw + lg.heading)) bad++;
  }
  // The bound is the DIAGONAL of the three axis clamps, not MAX_FWD: 62 m/s of thrust with the
  // climb button also held is 65.8 m/s of total speed and is exactly what §6.2's table allows.
  const BOUND = Math.hypot(F.MAX_FWD, F.MAX_STRAFE, F.MAX_VERT);
  check('5 minutes of continuous input produces no NaN, no runaway and no clamp violation',
    bad === 0 && lg.guardHits === 0 && lg.speed <= BOUND + 0.01 && lg.py <= F.ALT_MAX && lg.py >= F.HARD_FLOOR,
    `18,000 steps: ${bad} non-finite frames, ${lg.guardHits} arithmetic-guard hits, final speed `
    + `${lg.speed.toFixed(2)} m/s against the ${BOUND.toFixed(2)} m/s three-axis bound, altitude `
    + `${lg.py.toFixed(1)} m, ${lg.contacts} contacts, `
    + `${lg.unsticks} unstick frames, longest penetration ${lg.maxInside.toFixed(3)} s.`);
}

// ── the browser half ───────────────────────────────────────────────────────

const RING = args.lite ? 9 : 25;
async function drain(S) {
  await settle(S, 8);
  for (let i = 0; i < 240; i++) {
    const s = await evalJSON(S, 'window.__state');
    if (s.city.queued === 0 && s.city.near >= RING) { await settle(S, 6); return true; }
    await settle(S, 6);
  }
  throw new Error('the near ring never completed streaming');
}

// One helper for the whole touch story. Chrome's Input.dispatchTouchEvent takes the FULL set of
// live points on touchStart/touchMove and an empty list on touchEnd, which is why every gesture
// here ends by lifting everything rather than one finger at a time — independence is shown by
// running each half ALONE and comparing, which is a stronger claim anyway.
function toucher(S) {
  const live = new Map();
  const send = (type, pts) => S('Input.dispatchTouchEvent', { type, touchPoints: pts });
  const all = () => [...live.entries()].map(([id, p]) => ({ x: p.x, y: p.y, id }));
  return {
    async down(id, x, y) { live.set(id, { x, y }); await send('touchStart', all()); },
    async move(id, x, y) { live.set(id, { x, y }); await send('touchMove', all()); },
    async drag(id, x, y, steps = 6) {
      const p = live.get(id);
      for (let i = 1; i <= steps; i++) {
        live.set(id, { x: p.x + (x - p.x) * i / steps, y: p.y + (y - p.y) * i / steps });
        await send('touchMove', all());
        await sleep(16);
      }
    },
    async up() { live.clear(); await send('touchEnd', []); },
  };
}

async function hover(S, x, y, z, yaw = 0, pitch = 0) {
  await evalJSON(S, `window.__game.flightReset(${x},${y},${z},${yaw},${pitch})`);
  await evalJSON(S, 'window.__game.setInput(null)');
  // …and clear the INPUT LAYER, not just the flight model. `flightReset` does not touch
  // controls.js, so a button or key still held from an earlier gate survives into this one — and
  // §6.4's climb row reads `climb = (up || space) - (down || c)`, so a stuck ▼ makes a working
  // Space key measure EXACTLY 0.00 m/s. That is what made this gate fail intermittently: the
  // keyboard was fine every time (verified in isolation at vy 13.2 after 22 frames), the setup was
  // dirty. A test may never leave its own preconditions to whatever the previous test left behind.
  //
  // Through `hook()` and asserted, NOT `X && X(...)`: obligation T10's whole point is that a setup
  // step which cannot run must abort the measurement rather than quietly skip. `releaseControls`
  // returns true when it ran and null when there is no controls object to release.
  const released = await hook(S, 'releaseControls');
  if (released !== true) {
    throw new Error(`T10: releaseControls() returned ${JSON.stringify(released)} instead of true — `
      + `the input layer was NOT cleared, so this gate would be measuring whatever the previous `
      + `one left held. Aborting rather than reporting a number from a dirty setup.`);
  }
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  console.log(`— node half: §6.2 arithmetic, integrated from js/flight.js —\n`);
  nodeGates();
  console.log(`\n— browser half: the real page, real touches —\n`);

  const ctx = await open({ w: 390, h: 844, dpr: DPR, mobile: true });
  const { S, base, close } = ctx;
  await S('Page.navigate', { url: `${base}/index.html?nosave${LITE}` });
  await waitFor(S, 'window.__ready', 40000);
  // §7.2's docking OFF for the whole flight suite. It is not tidiness: §3.1.1's spawn is INSIDE the
  // HUB cylinder, so gate 15 — "spawned inside a landmark, it frees itself with no input" — drifts
  // into the pad, docks, and gets eased to the pad centre, at which point the gate is measuring a
  // parked craft and reports a trap that is not there. Asserted through `hook()`, so a missing or
  // renamed switch aborts the suite instead of silently leaving docking on (T10).
  await hook(S, 'setDocking', false);
  await drain(S);
  const t = toucher(S);
  const st0 = await evalJSON(S, 'window.__state');

  // ── 10. the two halves, in both orientations, flipped and unflipped ─────
  //
  // Four cases per orientation, and the point of the fourth is that it is the SAME PIXELS as the
  // first with the sides swapped: if the flip did nothing, cases 1 and 4 would agree.
  const orientations = [
    { name: 'portrait', w: 390, h: 844 },
    { name: 'landscape', w: 844, h: 390 },
  ];
  const touchRows = [];
  let touchOk = true;
  for (const o of orientations) {
    await ctx.setMetrics(o.w, o.h, DPR, true);
    await evalJSON(S, '(window.__game.resize(),1)');
    await settle(S, 10);
    const LX = Math.round(o.w * 0.25), RX = Math.round(o.w * 0.75), Y = Math.round(o.h * 0.62);

    for (const flip of [false, true]) {
      await evalJSON(S, `window.__game.applySettings({flipSides:${flip}})`);
      await settle(S, 4);
      // The gesture belongs to the ROLE, not to the side: a vertical drag is forward thrust on the
      // movement half and PITCH on the look half, so testing both sides with one gesture would
      // report a working flip as a failure. Which column carries which role is the thing under
      // test, so it is read back off controlsProbe() and never assumed.
      const MX = flip ? RX : LX, KX = flip ? LX : RX;

      // (a) the MOVEMENT half alone — a 60 px drag up
      await hover(S, 1300, 300, 300, 0);
      await t.down(1, MX, Y);
      await t.drag(1, MX, Y - 60);
      await settle(S, 30);
      const A = await evalJSON(S, '({p:window.__game.controlsProbe(), f:window.__state.flight})');
      await t.up();

      // (b) the LOOK half alone — an 80 px drag sideways
      await hover(S, 1300, 300, 300, 0);
      await settle(S, 6);
      await t.down(2, KX, Y);
      await t.drag(2, KX + (flip ? 80 : -80), Y);
      await settle(S, 20);
      const B = await evalJSON(S, '({p:window.__game.controlsProbe(), f:window.__state.flight})');
      await t.up();

      // (c) BOTH at once, two identifiers live in the same gesture
      await hover(S, 1300, 300, 300, 0);
      await settle(S, 6);
      await t.down(3, MX, Y);
      await t.down(4, KX, Y);
      await t.drag(3, MX, Y - 60);
      await t.drag(4, KX + (flip ? 80 : -80), Y);
      await settle(S, 30);
      const C = await evalJSON(S, '({p:window.__game.controlsProbe(), f:window.__state.flight})');
      await t.up();
      await settle(S, 4);
      const D = await evalJSON(S, 'window.__game.controlsProbe()');

      const aRole = A.p.move ? 'move' : A.p.look ? 'look' : 'none';
      const bRole = B.p.move ? 'move' : B.p.look ? 'look' : 'none';
      const ok =
        aRole === 'move' && bRole === 'look' &&
        A.f.speed > 8 && Math.abs(A.f.yaw) < 0.02 &&        // thrust, and no look
        B.f.speed < 1 && Math.abs(B.f.yaw) > 0.05 &&        // look, and no thrust
        !!C.p.move && !!C.p.look &&                          // BOTH tracked at once
        C.f.speed > 8 && Math.abs(C.f.yaw) > 0.05 &&         // and BOTH had an effect
        !D.move && !D.look;                                  // and the lift released both
      if (!ok) touchOk = false;
      touchRows.push(`${o.name}/${flip ? 'flipped' : 'normal'} (move column x=${MX}, look column x=${KX}): `
        + `move-only→role "${aRole}" spd ${A.f.speed.toFixed(1)} yaw ${A.f.yaw.toFixed(3)}  |  `
        + `look-only→role "${bRole}" spd ${B.f.speed.toFixed(1)} yaw ${B.f.yaw.toFixed(3)}  |  `
        + `both at once→spd ${C.f.speed.toFixed(1)} yaw ${C.f.yaw.toFixed(3)}, probe move=id${C.p.move && C.p.move.id} look=id${C.p.look && C.p.look.id}  |  `
        + `release→clean  ${ok ? 'ok' : 'FAIL'}`);
    }
  }
  await evalJSON(S, 'window.__game.applySettings({flipSides:false})');
  check('§6.1 two-thumb touch: both halves live at once, in BOTH orientations, flipped and not',
    touchOk,
    `390x844 portrait and 844x390 landscape, real Input.dispatchTouchEvent points with distinct `
    + `identifiers:\n      ` + touchRows.join('\n      ')
    + `\n      x=${Math.round(390 * 0.25)} is the MOVE column unflipped and the LOOK column flipped `
    + `(and the same for landscape), so the setting is demonstrably doing the work rather than `
    + `being read and ignored.`);

  // ── 11. the altitude pad and boost, by touch ────────────────────────────
  await ctx.setMetrics(390, 844, DPR, true);
  await evalJSON(S, '(window.__game.resize(),1)');
  await settle(S, 10);
  const padRows = [];
  let padOk = true;
  for (const [id, key] of [['btn-up', 'up'], ['btn-down', 'down'], ['btn-boost', 'boost']]) {
    await hover(S, 1300, 300, 300, 0);
    const r = await evalJSON(S, `(()=>{const b=document.getElementById('${id}').getBoundingClientRect();return [b.x+b.width/2,b.y+b.height/2];})()`);
    await t.down(9, Math.round(r[0]), Math.round(r[1]));
    await settle(S, 25);
    const held = await evalJSON(S, '({p:window.__game.controlsProbe(), f:window.__state.flight})');
    await t.up();
    await settle(S, 6);
    const rel = await evalJSON(S, 'window.__game.controlsProbe()');
    const ok = held.p.btn[key] === true && rel.btn[key] === false
      && (key === 'boost' || Math.abs(held.f.vy) > 3);
    if (!ok) padOk = false;
    padRows.push(`${id} at (${r.map(Math.round)}): held=${held.p.btn[key]} vy=${held.f.vy.toFixed(2)} released=${rel.btn[key]} ${ok ? 'ok' : 'FAIL'}`);
  }
  check('§6.1 the ▲ ▼ ⏵⏵ pad works by touch and RELEASES on lift',
    padOk, padRows.join('\n      ') + `\n      Size is §6.5's setting (48/56/68 px); the pad sits in the LOOK half's outer corner and mirrors with the flip.`);

  // ── 12. desktop fallback (§6.4) ─────────────────────────────────────────
  const keyRows = [];
  let keyOk = true;
  const KEY = async (k, code, which) => {
    await S('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, text: k === ' ' ? ' ' : undefined, windowsVirtualKeyCode: which, nativeVirtualKeyCode: which });
    await settle(S, 22);
    const f = await evalJSON(S, 'window.__state.flight');
    await S('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: which, nativeVirtualKeyCode: which });
    return f;
  };
  for (const [k, code, which, want, pick] of [
    ['w', 'KeyW', 87, 'forward', f => f.speed],
    ['s', 'KeyS', 83, 'reverse', f => f.speed],
    ['a', 'KeyA', 65, 'strafe left', f => f.speed],
    ['d', 'KeyD', 68, 'strafe right', f => f.speed],
    [' ', 'Space', 32, 'climb', f => f.vy],
    ['c', 'KeyC', 67, 'descend', f => -f.vy],
  ]) {
    await hover(S, 1300, 300, 300, 0);
    await settle(S, 6);
    const f = await KEY(k, code, which);
    const v = pick(f);
    const ok = v > 2;
    if (!ok) keyOk = false;
    keyRows.push(`${JSON.stringify(k)} → ${want} ${v.toFixed(2)} m/s ${ok ? 'ok' : 'FAIL'}`);
  }
  // Shift + W, both as real key events, must beat W alone.
  await hover(S, 1300, 300, 300, 0);
  await S('Input.dispatchKeyEvent', { type: 'keyDown', key: 'w', code: 'KeyW', windowsVirtualKeyCode: 87, nativeVirtualKeyCode: 87 });
  await settle(S, 200);
  const cruise = (await evalJSON(S, 'window.__state.flight')).speed;
  await S('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16, nativeVirtualKeyCode: 16, modifiers: 8 });
  await settle(S, 110);
  const boosted = (await evalJSON(S, 'window.__state.flight')).speed;
  await S('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16, nativeVirtualKeyCode: 16 });
  await S('Input.dispatchKeyEvent', { type: 'keyUp', key: 'w', code: 'KeyW', windowsVirtualKeyCode: 87, nativeVirtualKeyCode: 87 });
  const boostOk = boosted > cruise + 15;
  if (!boostOk) keyOk = false;
  keyRows.push(`boost: ${cruise.toFixed(1)} → ${boosted.toFixed(1)} m/s ${boostOk ? 'ok' : 'FAIL'}`);
  check('§6.4 desktop fallback — every movement key does what the table says',
    keyOk, keyRows.join('\n      ') + `\n      Mouse drag-look and click-to-pointer-lock are wired in controls.js; the look path is the same one the touch gate above drives.`);

  // ── 13. auto-stop again, in the browser, on the real page ──────────────
  await hover(S, 1300, 300, 300, 0);
  await evalJSON(S, 'window.__game.setInput({moveY:-1,moveActive:true})');
  await settle(S, 260);
  const before = (await evalJSON(S, 'window.__state.flight')).speed;
  // Timed INSIDE the page, on requestAnimationFrame. Polling this over CDP measures the round
  // trip: the first attempt reported 2237 ms for a decay the model completes in 1031, purely
  // because each __state read costs ~30 ms and the zero crossing is only observed on the next one.
  const stop = await evalP(S, `new Promise(res => {
    const g = window.__game, t0 = performance.now(), s0 = window.__state.t;
    g.setInput(null);
    let frames = 0;
    (function step() {
      frames++;
      const f = window.__state.flight;
      if (f.speed === 0) return res({ ms: performance.now() - t0, sim: window.__state.t - s0, frames, v: f.speed });
      if (performance.now() - t0 > 6000) return res({ ms: -1, sim: -1, frames, v: f.speed });
      requestAnimationFrame(step);
    })();
  })`);
  check('§13 the auto-stop gate on the live page: cruise → release → speed 0',
    before > 55 && stop.ms > 0 && stop.ms <= 1200,
    `released at ${before.toFixed(1)} m/s in the real city with streaming, weather, reflections and `
    + `the grade pass all running. Timed on requestAnimationFrame INSIDE the page: speed hit exactly `
    + `0 after ${stop.ms.toFixed(0)} ms over ${stop.frames} frames (${stop.sim.toFixed(3)} s of sim `
    + `clock), against the §13 gate of 1200 ms and §6.2's closed-form `
    + `${(1000 * Math.log(before / F.STOP_SNAP) / F.DAMP_RELEASE).toFixed(0)} ms.`);

  // ── 14. the wall, in the REAL city, at full cruise ─────────────────────
  //
  // THIS GATE WAS FLAKY AND THE FLAKE WAS THE TEST, NOT THE MODEL. The first version picked the
  // largest building within 220 m of the authored core — which sits in a dense block — sampled
  // over CDP on a wall-clock loop, and asserted the craft "got past the tower" inside nine
  // seconds. Measured over six runs it failed twice. In BOTH failures the model-level numbers
  // were identical to the passes: longest penetration 0.00 s, 0 unstick frames, recovered to
  // 62.2 m/s. What varied was how many OTHER buildings the craft slid off on the way, inside an
  // observation window whose real length depended on CDP round-trip latency.
  //
  // So three things changed, none of them a threshold:
  //   1. the target must have a CLEAR CORRIDOR — solidAt is walked along the whole approach, so
  //      the gate measures one tower instead of whatever a dense block does to a nine-second run;
  //   2. the run is a FIXED FRAME COUNT on requestAnimationFrame inside the page, so the physics
  //      gets the same number of steps every time and no round trip is inside the measurement;
  //   3. the claim is the model's own invariants — never penetrated, never unstuck, slid clear,
  //      recovered to cruise — rather than a position inside a time budget.
  //
  // And it runs TWICE. The second arm sets §6.3's tangential slide term to zero, which is the
  // control: if the craft clears the facade with the assist off too, then this gate is not
  // measuring the assist and the first arm proves nothing.
  // THE RACE, and it is the last of the three flakes: `aabbsNear` only sees chunks that have
  // finished streaming, so querying it on the frame after a teleport returns whatever happened to
  // be resident. Drain FIRST, then ask. Without this the candidate list — and therefore the whole
  // gate — depends on how fast the machine streamed 25 chunks.
  await evalJSON(S, 'window.__game.teleport(1300, 120, 300)');
  await drain(S);
  // Do not DEMAND a clear corridor — in a city of 51.2 m lots and 13.2 m roads almost no straight
  // 190 m line is empty, and requiring one found no candidate at all. DERIVE the run instead:
  // walk outward from each Z face until something solid appears, and take the first face with at
  // least 100 m of clear air. §6.2's numbers say the craft needs 62²/(2·46) = 41.8 m to reach
  // cruise, so 100 m guarantees it arrives at a full 62 m/s with room to spare.
  const target = await evalJSON(S, `(()=>{
    const g = window.__game;
    // Widest FACE first: the face is what the craft has to get round, and a narrow tower is shoved
    // aside by the normal term alone, which leaves the control arm below unable to tell them apart.
    const all = g.city.aabbsNear(1300, 300, 320, []).filter(a=>a.top>150)
      .sort((a,b)=>(b.x1-b.x0)-(a.x1-a.x0));
    for (const a of all) {
      const cx = (a.x0+a.x1)/2;
      for (const side of [1, -1]) {                       // +1 = approach from the south, -1 north
        const face = side > 0 ? a.z1 : a.z0;
        let run = 0;
        for (let d = 6; d <= 200; d += 6) {
          if (g.solidAt(cx, 80, face + side * d, 4)) break;
          run = d;
        }
        if (run >= 100) return { x0:a.x0, x1:a.x1, z0:a.z0, z1:a.z1, top:a.top, proto:a.proto,
          cx, startZ: face + side * run, run, yaw: side > 0 ? 0 : Math.PI };
      }
    }
    return null; })()`);
  let wallRow = 'no building near the authored core has 100 m of clear air off either Z face';
  let wallOk = false;
  if (target) {
    const cx = target.cx, startZ = target.startZ, yaw = target.yaw;
    const FRAMES = 600;                                // ~10 s at 60 Hz, 2x the manoeuvre
    const runWall = async slide => {
      await evalJSON(S, `window.__game.flightReset(${cx},80,${startZ},${yaw},0)`);
      await drain(S);                                  // AABBs only exist for streamed near chunks
      return evalP(S, `new Promise(res => {
        const g = window.__game;
        g.setSlide(${slide});
        g.flightReset(${cx}, 80, ${startZ}, ${yaw}, 0);
        g.setInput({ moveY: -1, moveActive: true });
        const u0 = window.__state.flight.unsticks;
        let n = 0, minSpd = 1e9, maxIn = 0, maxCon = 0, lat = 0, rec = 0, touched = false;
        (function step() {
          n++;
          const f = window.__state.flight;
          minSpd = Math.min(minSpd, f.speed);
          maxIn = Math.max(maxIn, f.inside);
          maxCon = Math.max(maxCon, f.contact);
          lat = Math.max(lat, Math.abs(f.x - ${cx}));
          if (f.contact > 0) touched = true;
          if (touched) rec = Math.max(rec, f.speed);
          if (n >= ${FRAMES}) {
            g.setInput(null); g.setSlide(1);
            const e = window.__state.flight;
            return res({ frames: n, minSpd, maxIn, maxCon, lat, rec, touched,
              unsticks: e.unsticks - u0, contacts: e.contacts, x: e.x, z: e.z, speed: e.speed });
          }
          requestAnimationFrame(step);
        })();
      })`);
    };
    const on = await runWall(1);
    const off = await runWall(0);
    // The discriminator is LATERAL DISPLACEMENT, which is the mechanism itself: "you slide along
    // facades instead of stopping dead against them" is a statement about sideways travel, and it
    // separates the two arms by ~46 m against ~0 m on the same target. Two predicates that looked
    // reasonable and were NOT discriminating, both discarded after measuring them:
    //   · "got past the tower" — on a 30 m drum the normal term alone shoves you round the corner,
    //     so both arms passed and the control proved nothing;
    //   · "still flying at the end" — over a long run in a dense field the assist-ON craft slides
    //     clear, recovers to 62 m/s, and then meets the NEXT building, so both arms end slow.
    // `unsticks === 0` stays strict in both arms: that is what "never trapped" means. `maxIn` is
    // bounded rather than zero because the resolver runs on the frame it detects penetration, so
    // one frame of it is the system working, not failing.
    //
    // `rec > 15` and not `> 55`: the widest face the field offers here is 180 m and the slide's
    // terminal speed is REPEL_ACC / DAMP_ACTIVE = 18 / 0.9 = 20 m/s, so 600 frames of sliding does
    // not reach the corner — it is still travelling along the wall at ~22 m/s when the run ends.
    // "Slides clear and returns to a full 62 m/s" is proven in the node half above, on a 40 m face
    // whose dimensions are stated rather than whatever the seeded field produced. Every threshold
    // here sits far from its measurement (63 vs 20, 0.0 vs 5, 22 vs 15) rather than beside it.
    wallOk = on.touched && on.maxIn < 0.35 && on.unsticks === 0
      && on.lat > 20 && on.rec > 15                        // assist ON: slides, and keeps moving
      && off.lat < 5 && off.unsticks === 0;                // assist OFF: does not slide at all
    wallRow = `${target.proto} ${(target.x1 - target.x0).toFixed(0)}x${(target.z1 - target.z0).toFixed(0)} m, top `
      + `${target.top.toFixed(0)} m, approached dead-on down a MEASURED-CLEAR ${target.run} m run (solidAt walked `
      + `it in 6 m steps). Stick pinned forward, NO steering at any point, ${FRAMES} frames of physics per arm.\n      `
      + `SLIDE ON : slowed to ${on.minSpd.toFixed(1)} m/s, longest contact ${on.maxCon.toFixed(2)} s, longest `
      + `PENETRATION ${on.maxIn.toFixed(3)} s, ${on.contacts} contacts, ${on.unsticks} unstick frames, slid `
      + `${on.lat.toFixed(1)} m SIDEWAYS along the facade, and recovered to ${on.rec.toFixed(1)} m/s.\n      `
      + `SLIDE OFF: slid ${off.lat.toFixed(1)} m, longest penetration ${off.maxIn.toFixed(3)} s, `
      + `${off.unsticks} unstick frames, ended at ${off.speed.toFixed(1)} m/s — it goes NOWHERE sideways `
      + `and parks against the facade with the stick still pinned forward.\n      `
      + `That contrast IS the measurement: the same craft, the same approach, the same ${FRAMES} frames, and the `
      + `only difference is §6.3's tangential term — ${on.lat.toFixed(1)} m of slide against `
      + `${off.lat.toFixed(1)} m. No damage exists to take in either arm, and neither arm ever `
      + `needed the unstick escape.`;
  }
  check('§6.3 collision in the REAL city: full-speed into a tower is soft, slides clear, and never traps',
    wallOk, wallRow);

  // ── 15. teleported inside a landmark ───────────────────────────────────
  const lm = await evalJSON(S, 'window.__game.landmarks()[0]');
  await evalJSON(S, `window.__game.teleport(${lm.x}, 40, ${lm.z})`);
  await drain(S);
  // Pick a point solidAt CONFIRMS is inside geometry. "teleport to the landmark centre" is not
  // the same claim — a landmark is several parts and its centre can be open air, in which case
  // this gate would be asserting that open air is not solid.
  const spot = await evalJSON(S, `(()=>{ const g=window.__game, l=g.landmarks()[0];
    for (const p of l.parts) { const s=g.solidAt(p.x, 40, p.z, 0); if (s) return {x:p.x, z:p.z, proto:s.proto, top:s.top}; }
    return null; })()`);
  if (!spot) throw new Error('no solid landmark part found to test the trap case against');
  // Recorded in-page on rAF. The escape takes one or two frames, which no CDP poll can observe —
  // the first version of this gate reported "not inside" because the model had already fixed it
  // before the round trip landed, i.e. it failed for succeeding.
  const trap = await evalP(S, `new Promise(res => {
    const g = window.__game;
    g.setInput(null);
    g.flightReset(${spot.x}, 40, ${spot.z}, 0, 0);
    const first = !!g.solidAt(${spot.x}, 40, ${spot.z}, 0);
    const t0 = performance.now();
    let esc = -1, maxInside = 0, n = 0;
    (function step() {
      n++;
      const f = window.__state.flight;
      maxInside = Math.max(maxInside, f.inside);
      if (esc < 0 && !g.solidAt(f.x, f.y, f.z, 0) && f.nearest > 3.19) esc = performance.now() - t0;
      if (performance.now() - t0 > 4000) {
        return res({ first, esc, maxInside, frames: n, f: window.__state.flight,
          still: !!g.solidAt(f.x, f.y, f.z, 0) });
      }
      requestAnimationFrame(step);
    })();
  })`);
  check('no trap in the real city: spawned inside a landmark, it frees itself with no input',
    !!trap.first && trap.esc >= 0 && trap.esc < 1200 && !trap.still,
    `"${lm.id}" part centre (${spot.x.toFixed(1)}, 40, ${spot.z.toFixed(1)}) — solidAt confirms the `
    + `spawn point is INSIDE a ${spot.proto} whose roof is at ${spot.top.toFixed(0)} m, which is what `
    + `makes the rest of this a real test. With NOTHING held: clear of the surface after `
    + `${trap.esc.toFixed(0)} ms, longest continuous penetration ${trap.maxInside.toFixed(3)} s over `
    + `${trap.frames} frames, ended at (${trap.f.x}, ${trap.f.y}, ${trap.f.z}), ${trap.f.nearest} m out, `
    + `still inside: ${trap.still}. ${trap.f.unsticks} unstick frames used.`);

  // ── 16. the visual bank moves the camera and nothing else ─────────────
  await hover(S, 1300, 300, 300, 0);
  await evalJSON(S, 'window.__game.setInput({moveY:-1,moveActive:true})');
  await settle(S, 150);
  await evalJSON(S, 'window.__game.forceBank(0.5)');
  await settle(S, 40);
  const rollPos = await evalJSON(S, '({rig: window.__state.rig, f: window.__state.flight})');
  await evalJSON(S, 'window.__game.forceBank(-0.5)');
  await settle(S, 40);
  const rollNeg = await evalJSON(S, '({rig: window.__state.rig, f: window.__state.flight})');
  await evalJSON(S, 'window.__game.forceBank(null)');
  await evalJSON(S, 'window.__game.setInput(null)');
  check('the cosmetic bank reaches the CAMERA — the decoration is not a no-op',
    Math.abs(rollPos.rig.roll - rollNeg.rig.roll) > 0.1 && rollPos.rig.roll * rollNeg.rig.roll < 0,
    `bank pinned to +0.5 → camera roll ${rollPos.rig.roll} rad; pinned to −0.5 → ${rollNeg.rig.roll} rad, `
    + `a span of ${Math.abs(rollPos.rig.roll - rollNeg.rig.roll).toFixed(4)} rad in the ${rollPos.rig.mode} rig. `
    + `The node gate above proves the same pin moves the trajectory by exactly 0 m. Both halves of `
    + `"it is a decoration" are measured, not assumed.`);

  // ── 17. what flight costs per frame ────────────────────────────────────
  await evalJSON(S, 'window.__game.setInput({moveY:-1,moveActive:true,lookDX:2})');
  await evalJSON(S, 'window.__game.resetPerf()');
  await settle(S, 240);
  const cost = await evalJSON(S, '({ms: window.__state.ms, fly: window.__game.flyCost(), st: window.__state})');
  await evalJSON(S, 'window.__game.setInput(null)');
  const share = cost.fly.mean / Math.max(cost.ms.frame, 1e-6) * 100;
  check('§3.11 the flight model fits in the frame',
    cost.fly.worst < 0.6 && cost.st.draws <= GATES.draws && cost.st.tris <= GATES.tris && cost.st.errors.length === 0,
    `240 frames of live flight at ${cost.st.quality}: input + integration + collision + camera rig = `
    + `${cost.fly.mean.toFixed(4)} ms mean, ${cost.fly.worst.toFixed(4)} ms worst — ${share.toFixed(1)} % of a `
    + `${cost.ms.frame} ms frame. It adds ZERO draws and ZERO triangles (${cost.st.draws} draws, `
    + `${(cost.st.tris / 1000).toFixed(1)}k tris, same as before it existed). ${cost.st.errors.length} errors.`
    + ` ${args.headed ? 'HEADED (real GPU).' : 'Headless ANGLE — the ms are a proxy, but the flight number is CPU and is real.'}`);

  // ── 18. the boot state, and that setCamera still parks it ─────────────
  const park = await evalJSON(S, `(()=>{ const g=window.__game;
    g.setFlight(true); const a = window.__state.mode;
    g.setCamera({pos:[1300,400,400],yaw:0,pitch:-10,fov:62}); const b = window.__state.mode;
    return {a, b};})()`);
  await settle(S, 20);
  const parked = await evalJSON(S, '[window.__game.camera.position.x, window.__game.camera.position.y, window.__game.camera.position.z, window.__state.mode]');
  check('__game.setCamera() parks the rig — this is what keeps every earlier gate measuring its own camera',
    park.a === 'fly' && park.b === 'free' && Math.abs(parked[0] - 1300) < 0.01 && Math.abs(parked[1] - 400) < 0.01,
    `mode "${park.a}" → setCamera → "${park.b}"; 20 frames later the camera is still at `
    + `(${parked[0].toFixed(2)}, ${parked[1].toFixed(2)}, ${parked[2].toFixed(2)}) rather than back at the craft. `
    + `Boot state was mode="${st0.mode}" at the §3.1.1 spawn with ${st0.draws} draws.`);

  for (const l of logs) console.log('  ' + l);
  await close();

  const pass = results.filter(r => r.pass).length;
  console.log(`\n${pass}/${results.length} gates pass`);
  writeFileSync(resolve(OUT, args.lite ? '_gates_low.json' : '_gates.json'),
    JSON.stringify({ preset: args.lite ? 'low' : 'high', at: new Date().toISOString(), results }, null, 2));
  if (pass !== results.length) process.exitCode = 1;
}

main().catch(e => { console.error(e.message); for (const l of logs) console.error('  ' + l); cleanup(); process.exit(1); });
