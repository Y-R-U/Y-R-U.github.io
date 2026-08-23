#!/usr/bin/env node
/**
 * The zoom controller, driven headlessly, against the REAL js/core/camera.js.
 *
 * camera.js is DOM-free on purpose so this file can import it rather than
 * re-implement the solve. A trace harness that re-derives the same arithmetic in
 * JS tests the harness, not the controller — that is P1's R2/R3 lesson applied
 * to the camera.
 *
 * Every criterion here also runs against a deliberately BROKEN controller, so
 * "the criterion is green" means something. The controls are shipped in
 * camera.js behind `opts` and are reachable in the browser as ?slew=symmetric,
 * ?margin=strict, ?track=sticky, ?enforce=0.
 *
 *   node tools/camtrace.mjs               # everything
 *   node tools/camtrace.mjs --json out.json
 *   node tools/camtrace.mjs --secs 120 --seed kh
 */

import { writeFileSync } from 'node:fs';
import { createCamera } from '../js/core/camera.js';
import { VIEW_PROFILE, ZOOM_BIAS } from '../js/core/viewprofile.js';
import { createRNG } from '../js/core/rng.js';

const DT = 1 / 60;
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const SECS = Number(arg('--secs', 120));
const SEED = arg('--seed', 'kitehawk-p2');

/** A view exactly as core/viewport.js computes it at 390x844 portrait. */
function makeView(mode = 'portrait', w = 390, h = 844) {
  const profile = VIEW_PROFILE[mode];
  const scale = h / profile.worldH;
  return {
    mode, w, h, dpr: 2, profile,
    worldH: profile.worldH, worldW: w / scale, scale,
    safe: { top: 0, right: 0, bottom: 0, left: 0 },
  };
}

/* ---------------------------------------------------------------- scenario */

/**
 * A scripted 120 s engagement. Deterministic: one seeded stream, no wall clock.
 * It is written to be HOSTILE to the controller — hostiles cross the lock range
 * repeatedly, sit exactly on the frame edge, and a furball of 14 arrives at 70 s
 * — because a trace the controller finds easy proves nothing.
 */
function runTrace(camOpts, secs, seedTag, policy = 'contract', scenario = 'furball') {
  const view = makeView();
  const P = view.profile;
  const cam = createCamera(view, camOpts);
  const rng = createRNG('trace:' + seedTag);
  const n = Math.round(secs / DT);

  const player = { x: 0, y: -3000, vx: 320, vy: 0, hull: 64 };
  const foes = [];
  for (let i = 0; i < 16; i++) {
    foes.push({
      id: 'f' + i,
      phase: rng.range(0, Math.PI * 2),
      // orbital radii deliberately straddle zoomLockRange (1400) and the
      // frame edge, so the hysteresis is actually asked a question
      r0: rng.range(250, 2400),
      rAmp: rng.range(180, 1100),
      w: rng.range(0.05, 0.42),
      ang: rng.range(0, Math.PI * 2),
      spin: rng.range(-0.55, 0.55),
      live: false,
      hull: rng.range(60, 70),
    });
  }

  const zoom = new Float64Array(n);
  const target_ = new Float64Array(n);
  const boxW = new Float64Array(n);
  const boxH = new Float64Array(n);
  const members = new Int16Array(n);
  let churn = 0, prevMembers = -1;

  for (let i = 0; i < n; i++) {
    const t = i * DT;

    // the player flies a long shallow S with two dives and a zoom climb
    player.vx = 320 + Math.sin(t * 0.21) * 90;
    player.vy = Math.sin(t * 0.33) * 260 + (t > 40 && t < 46 ? 480 : 0) + (t > 88 && t < 94 ? -420 : 0);
    player.x += player.vx * DT;
    player.y += player.vy * DT;
    if (player.y > -400) player.y = -400;
    if (player.y < -9600) player.y = -9600;

    /* ISOLATION RUNS. Before asking whether the controller pumps in a fight, ask
       whether it pumps at all. 'static' holds one member at a fixed offset for
       the whole trace: any reversal after the first settle is the controller's
       own doing. 'jitter' keeps membership constant but wobbles the box size by
       +/-6%, which is what the deadband exists to swallow. If those two are
       clean, every reversal in the fight traces is attributable to the framing
       box changing, not to the solver. */
    /* Z1 says "a 120 s scripted framing-box trace". Taken literally that means
       scripting the BOX, not a fight — and that is the only version whose
       numbers belong to the controller, because the fight scenarios below turn
       out to be dominated by how often the AI adds and removes members (see
       docs/P2_NOTES.md). This programme sweeps the whole solvable range: steps
       held long enough to earn a zoom-in, steps too short to, fast ramps in both
       directions, and a slow sine that sits on the deadband. */
    if (scenario === 'scripted') {
      const prog = [
        [0, 150], [6, 520], [12, 150], [14, 420], [16, 150],      // steps: long, long, SHORT
        [22, 900], [28, 150], [30, 260], [36, 700], [40, 150],
        [48, 'ramp-out'], [58, 'ramp-in'], [68, 150],
        [74, 'sine'], [104, 150], [110, 620], [116, 150],
      ];
      let target = 150;
      for (let k = 0; k < prog.length; k++) {
        if (t >= prog[k][0] && (k === prog.length - 1 || t < prog[k + 1][0])) {
          const v = prog[k][1];
          if (v === 'ramp-out') target = 150 + (t - prog[k][0]) / 10 * 850;
          else if (v === 'ramp-in') target = 1000 - (t - prog[k][0]) / 10 * 850;
          else if (v === 'sine') target = 420 + Math.sin((t - prog[k][0]) * 0.9) * 330;
          else target = v;
          break;
        }
      }
      cam.track('scripted', player.x + target, player.y, 64, 34, 1);
      player.vx = 0; player.vy = 0;
      cam.update(player, DT);
      zoom[i] = cam.zoom; target_[i] = cam.zoomTarget;
      boxW[i] = cam.box.w; boxH[i] = cam.box.h; members[i] = cam.memberCount;
      if (prevMembers >= 0 && cam.memberCount !== prevMembers) churn++;
      prevMembers = cam.memberCount;
      continue;
    }

    if (scenario === 'static' || scenario === 'jitter') {
      // sized so the SOLVED zoom sits mid-range rather than pinned on the clamp:
      // a wobble that never moves the clamped target proves nothing, which is
      // how a test quietly becomes vacuous.
      const wob = scenario === 'jitter' ? 1 + Math.sin(t * 2.7) * 0.30 : 1;
      cam.track('held', player.x + 150 * wob, player.y - 60 * wob, 64, 34, 1);
      player.vx = 0; player.vy = 0;    // hold the lead point still too
      cam.update(player, DT);
      zoom[i] = cam.zoom; target_[i] = cam.zoomTarget;
      boxW[i] = cam.box.w; boxH[i] = cam.box.h; members[i] = cam.memberCount;
      if (prevMembers >= 0 && cam.memberCount !== prevMembers) churn++;
      prevMembers = cam.memberCount;
      continue;
    }

    // how many foes are in play
    const want = scenario === 'duel' ? 1
      : scenario === 'patrol' ? (t < 20 ? 1 : t < 80 ? 3 : 2)
        : (t < 15 ? 1 : t < 40 ? 3 : t < 70 ? 2 : t < 95 ? 14 : 2);
    for (let k = 0; k < foes.length; k++) foes[k].live = k < want;

    for (const f of foes) {
      if (!f.live) continue;
      f.ang += f.spin * DT;
      const r = f.r0 + Math.sin(t * f.w + f.phase) * f.rAmp;
      const fx = player.x + Math.cos(f.ang) * r;
      const fy = player.y + Math.sin(f.ang) * r * 0.6;
      const d = Math.hypot(fx - player.x, fy - player.y);
      const closing = (f._d === undefined ? 0 : (f._d - d) / DT);
      f._d = d;
      // §4.3.1's own inclusion rule: within zoomLockRange AND (line of fire, or
      // closing faster than 120 wu/s). 'all' ignores it — that is the mistake
      // §10 rule 18 is written about, and it is measured here rather than feared.
      const inBox = policy === 'all'
        ? true
        : d <= P.zoomLockRange && (d < 700 || closing > 120);
      if (inBox) cam.track(f.id, fx, fy, f.hull, f.hull * 0.53, 1);
    }

    cam.update(player, DT);
    zoom[i] = cam.zoom;
    target_[i] = cam.zoomTarget;
    boxW[i] = cam.box.w;
    boxH[i] = cam.box.h;
    members[i] = cam.memberCount;
    if (prevMembers >= 0 && cam.memberCount !== prevMembers) churn++;
    prevMembers = cam.memberCount;
  }

  return { zoom, target: target_, boxW, boxH, members, n, secs, view, churn };
}

/* ------------------------------------------------------------- measurements */

const EPS = 1e-9;

/**
 * Monotonic runs of the zoom trace. A "reversal" is the boundary between two
 * runs; `amp` is how far the run actually travelled.
 *
 * Two counts come out of this, and the difference is the point. The RAW count is
 * every sign change, which is what "direction reversals per minute" literally
 * asks for — but it counts a 0.0015-unit twitch, well under the profile's own
 * 0.02 deadband, exactly the same as a full 0.44 sweep. The SIGNIFICANT count
 * only counts a reversal where both adjoining runs moved at least one deadband,
 * i.e. where a player could see it happen. No new constant is invented; the
 * threshold is zoomDeadband, which is already in VIEW_PROFILE.
 */
function runs(zoom) {
  const out = [];
  let dir = 0, start = 0;
  for (let i = 1; i < zoom.length; i++) {
    const d = zoom[i] - zoom[i - 1];
    if (Math.abs(d) < EPS) continue;
    const s = d > 0 ? 1 : -1;
    if (dir === 0) { dir = s; start = i - 1; continue; }
    if (s !== dir) { out.push({ i0: start, i1: i - 1, dir, amp: Math.abs(zoom[i - 1] - zoom[start]) }); dir = s; start = i - 1; }
  }
  if (dir !== 0) out.push({ i0: start, i1: zoom.length - 1, dir, amp: Math.abs(zoom[zoom.length - 1] - zoom[start]) });
  return out;
}

function reversals(zoom, minAmp = 0) {
  const rs = runs(zoom);
  const idx = [], dirs = [];
  for (let k = 1; k < rs.length; k++) {
    if (Math.min(rs[k - 1].amp, rs[k].amp) < minAmp) continue;
    idx.push(rs[k].i0);
    // direction of the run STARTING here: +1 tightens (in), -1 widens (out)
    dirs.push(rs[k].dir);
  }
  idx.dirs = dirs;
  return idx;
}

function minGap(idx) {
  let m = Infinity;
  for (let i = 1; i < idx.length; i++) m = Math.min(m, (idx[i] - idx[i - 1]) * DT);
  return m;
}

/** A 3 s sliding window with >= 3 reversals and > 0.05 peak-to-peak. */
function oscillations(zoom, idx) {
  const win = Math.round(3 / DT);
  let worst = 0, count = 0;
  for (let s = 0; s + win < zoom.length; s += 6) {
    const e = s + win;
    let lo = Infinity, hi = -Infinity, rev = 0;
    for (let i = s; i < e; i++) { if (zoom[i] < lo) lo = zoom[i]; if (zoom[i] > hi) hi = zoom[i]; }
    for (const r of idx) if (r >= s && r < e) rev++;
    if (rev >= 3) { const amp = hi - lo; if (amp > worst) worst = amp; if (amp > 0.05) count++; }
  }
  return { count, worst };
}

const pct = (a, p) => { const s = Array.from(a).sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
const mean = (a) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i]; return s / a.length; };

function stability(tag, opts, policy = 'contract', scenario = 'furball') {
  const tr = runTrace(opts, SECS, SEED, policy, scenario);
  const DB = tr.view.profile.zoomDeadband;
  const idx = reversals(tr.zoom);
  const sig = reversals(tr.zoom, DB);
  const perMin = idx.length / (SECS / 60);
  const gap = minGap(idx);
  const sigGap = minGap(sig);
  const osc = oscillations(tr.zoom, idx);
  return {
    tag,
    reversalsPerMin: +perMin.toFixed(2),
    reversals: idx.length,
    minGapS: Number.isFinite(gap) ? +gap.toFixed(3) : null,
    gapViolations: idx.reduce((c, v, i) => c + (i > 0 && (v - idx[i - 1]) * DT < 1.2 ? 1 : 0), 0),
    sigReversalsPerMin: +(sig.length / (SECS / 60)).toFixed(2),
    sigMinGapS: Number.isFinite(sigGap) ? +sigGap.toFixed(3) : null,
    sigGapViolations: sig.reduce((c, v, i) => c + (i > 0 && (v - sig[i - 1]) * DT < 1.2 ? 1 : 0), 0),
    smallestReversalAmp: +Math.min(...runs(tr.zoom).map((r) => r.amp)).toFixed(5),
    // WHICH direction pair violates the 1.2 s rule. If every violation is
    // in->out then Z2 and Z4 are asking for opposite things, and no controller
    // that obeys Z4 can satisfy Z2 — that is a criteria conflict, not a defect.
    gapViolationDirs: (() => {
      const c = { 'in->out': 0, 'out->in': 0 };
      for (let i = 1; i < idx.length; i++) {
        if ((idx[i] - idx[i - 1]) * DT >= 1.2) continue;
        c[idx.dirs[i] > 0 ? 'out->in' : 'in->out']++;
      }
      return c;
    })(),
    revPerChurn: tr.churn ? +(idx.length / tr.churn).toFixed(2) : null,
    oscWindows: osc.count,
    oscWorstAmp: +osc.worst.toFixed(4),
    zoomMin: +Math.min(...tr.zoom).toFixed(4),
    zoomMax: +Math.max(...tr.zoom).toFixed(4),
    zoomMean: +mean(tr.zoom).toFixed(4),
    boxWp90: +pct(tr.boxW, 0.9).toFixed(1),
    boxHp90: +pct(tr.boxH, 0.9).toFixed(1),
    membersMax: Math.max(...tr.members),
    boxChurn: tr.churn,
    revDetail: idx.slice(0, 40).map((i, k) => ({
      t: +(i * DT).toFixed(2),
      dir: idx.dirs[k] > 0 ? 'in' : 'out',
      zoom: +tr.zoom[i].toFixed(4),
      gap: null,
    })).map((r, i, a) => (i ? { ...r, gap: +(r.t - a[i - 1].t).toFixed(2) } : r)),
    tr,
  };
}

/* ------------------------------------------------------------------- Z4-Z6 */

/** Z4: given a target below the current zoom, motion starts within 1 tick. */
function z4(opts) {
  const view = makeView();
  const cam = createCamera(view, opts);
  const rng = createRNG('z4');
  let worst = 0, n = 0, blocked = 0, deadbanded = 0;
  for (let trial = 0; trial < 400; trial++) {
    cam.reset(0, -3000, rng.range(0.80, 1.22));
    const player = { x: 0, y: -3000, vx: 0, vy: 0, hull: 64 };
    // settle at the reset zoom with only the player in the box
    const z0 = cam.zoom;
    // a box wide enough to demand a LOWER zoom than we are at
    const wide = rng.range(600, 1600);
    cam.track('t', 0, -3000, wide, 80, 1);
    cam.update(player, DT);
    const moved = cam.zoom < z0 - 1e-12;
    const need = cam.zoomTarget < z0 - view.profile.zoomDeadband;
    if (!need) { deadbanded++; continue; }
    n++;
    if (!moved) blocked++;
    worst = Math.max(worst, z0 - cam.zoom);
  }
  return { trials: n, blocked, deadbanded, maxFirstTickStep: +worst.toFixed(5) };
}

/** Z5: allowOutsideClamp is refused while the player has combat control. */
function z5(opts) {
  const view = makeView();
  const cam = createCamera(view, opts);
  const player = { x: 0, y: -3000, vx: 0, vy: 0, hull: 64 };
  const P = view.profile;

  cam.setPlayerControl(true);
  const f1 = cam.requestFraming('reveal', { zoom: P.zoomEstablish, priority: 'cinematic', allowOutsideClamp: true, ease: 0.05 });
  for (let i = 0; i < 240; i++) cam.update(player, DT);
  const underControl = cam.zoom;
  cam.releaseFraming('reveal');

  cam.setPlayerControl(false);
  cam.requestFraming('reveal2', { zoom: P.zoomEstablish, priority: 'cinematic', allowOutsideClamp: true, ease: 0.05 });
  for (let i = 0; i < 240; i++) cam.update(player, DT);
  const noControl = cam.zoom;
  cam.releaseFraming('reveal2');

  // a 'beat' framing may never leave the clamp, control or not
  cam.setPlayerControl(false);
  cam.requestFraming('beat', { zoom: P.zoomEstablish, priority: 'beat', allowOutsideClamp: true, ease: 0.05 });
  for (let i = 0; i < 240; i++) cam.update(player, DT);
  const beat = cam.zoom;

  return {
    refusedFlag: f1.refused === true,
    zoomUnderPlayerControl: +underControl.toFixed(4),
    zoomWithNoControl: +noControl.toFixed(4),
    zoomBeatPriority: +beat.toFixed(4),
    clampFloor: P.zoomWide,
    establish: P.zoomEstablish,
    escapedUnderControl: underControl < P.zoomWide - 1e-6,
    reachedEstablishWithNoControl: noControl <= P.zoomEstablish + 1e-3,
    beatEscaped: beat < P.zoomWide - 1e-6,
  };
}

/** Z6: a member added once and never re-asserted drops out within 2 ticks. */
function z6(opts) {
  const view = makeView();
  const cam = createCamera(view, opts);
  const player = { x: 0, y: -3000, vx: 0, vy: 0, hull: 64 };
  cam.reset(0, -3000, view.profile.zoomIntimate);
  // a whole zeppelin: exactly the stale member that would pin the floor forever
  cam.track('zeppelin', 900, -3000, 1400, 260, 1);
  const seen = [];
  for (let i = 0; i < 8; i++) { cam.update(player, DT); seen.push({ tick: i + 1, members: cam.memberCount, boxW: +cam.box.w.toFixed(1), zoom: +cam.zoom.toFixed(4) }); }
  const droppedAt = seen.findIndex((s) => s.members === 0) + 1;
  // ...and after it drops, the zoom must be free to climb back
  for (let i = 0; i < 60 * 6; i++) cam.update(player, DT);
  return { droppedAtTick: droppedAt || null, first8: seen, zoomAfter6s: +cam.zoom.toFixed(4) };
}

/* ------------------------------- the 4.3.1 solve, checked against §4.1's own numbers */

function solveCheck() {
  const view = makeView();
  const P = view.profile;
  const rows = [];
  for (const boxW of [200, 273, 320, 460, 503, 585, 700]) {
    const needW = boxW / P.zoomFill;
    const z = view.worldW / needW;
    rows.push({ boxW, needW: +needW.toFixed(1), zoomNeeded: +z.toFixed(4), clamped: +Math.min(P.zoomIntimate, Math.max(P.zoomWide, z)).toFixed(4) });
  }
  const lockRows = [];
  for (const boxH of [500, 1000, 1053, 1176, 1282]) {
    const needH = boxH / P.zoomFill;
    lockRows.push({ boxH, needH: +needH.toFixed(1), zoomNeeded: +(view.worldH / needH).toFixed(4) });
  }
  // The bias probe needs a box where the solver is NOT already saturated. Alone
  // and slow the solve asks for 1.96 and every bias clamps to zoomIntimate; with
  // one hostile close it asks for 0.66 and every bias clamps to zoomWide. Either
  // way all three biases read identically and the measurement says nothing —
  // twice, on the first two things I tried. A member 160 wu ahead gives a
  // ~378 wu box and a solved zoom near 1.04, mid-range, where bias is visible.
  // Weight 0 so it does not also arm the zoom lock and clamp the answer again.
  const bias = {};
  for (const k of Object.keys(ZOOM_BIAS)) {
    for (const mode of ['latch', 'strict']) {
      const cam = createCamera(view, { bias: k, margin: mode });
      cam.reset(0, -3000, P.zoomWide);
      const player = { x: 0, y: -3000, vx: 0, vy: 0, hull: 64 };
      for (let i = 0; i < 60 * 20; i++) { cam.track('box', 160, -3000, 64, 34, 0); cam.update(player, DT); }
      const key = k + ':' + mode;
      bias[key] = { offset: ZOOM_BIAS[k], settled: +cam.zoom.toFixed(4), target: +cam.zoomTarget.toFixed(4) };
    }
    // and the case that matters for the §4.3.2 reading: can it reach zoomIntimate?
    for (const mode of ['latch', 'strict']) {
      const cam = createCamera(view, { bias: k, margin: mode });
      cam.reset(0, -3000, P.zoomWide);
      const player = { x: 0, y: -3000, vx: 0, vy: 0, hull: 64 };
      for (let i = 0; i < 60 * 30; i++) cam.update(player, DT);
      bias['alone:' + k + ':' + mode] = { offset: ZOOM_BIAS[k], settled: +cam.zoom.toFixed(4), target: +cam.zoomTarget.toFixed(4) };
    }
  }
  return { worldW: +view.worldW.toFixed(2), worldH: view.worldH, zoomFill: P.zoomFill, width: rows, height: lockRows, bias };
}

/* --------------------------------------------------------------- run it all */

const out = {
  at: new Date().toISOString(),
  secs: SECS, seed: SEED, dt: DT,
  solve: solveCheck(),
  stability: {},
  z4: {}, z5: {}, z6: {},
};

const SHIPPED = {};
const CONTROLS = {
  'control:symmetric-slew': { slew: 'symmetric' },
  'control:strict-margin': { margin: 'strict' },
  'control:sticky-members': { track: 'sticky' },
  'control:no-enforcement': { enforce: false },
};

for (const sc of ['static', 'jitter', 'scripted', 'duel', 'patrol', 'furball']) out.stability['shipped/' + sc] = strip(stability('shipped/' + sc, SHIPPED, 'contract', sc));
for (const [tag, o] of Object.entries(CONTROLS)) out.stability[tag + '/furball'] = strip(stability(tag, o, 'contract', 'furball'));
out.stability['control:symmetric-slew/jitter'] = strip(stability('sym/jitter', { slew: 'symmetric' }, 'contract', 'jitter'));
for (const [tag, o] of Object.entries(CONTROLS)) out.stability[tag + '/scripted'] = strip(stability(tag, o, 'contract', 'scripted'));
out.stability['shipped/duel'].note = '1v1 — what DESIGN actually schedules most of the time';
// what happens if a caller ignores §4.3.1's inclusion rule and tracks everything
out.stability['control:track-everything/furball'] = strip(stability('control:track-everything', SHIPPED, 'all', 'furball'));

out.z4.shipped = z4(SHIPPED);
out.z4['control:symmetric-slew'] = z4({ slew: 'symmetric' });
out.z5.shipped = z5(SHIPPED);
out.z5['control:no-enforcement'] = z5({ enforce: false });
out.z6.shipped = z6(SHIPPED);
out.z6['control:sticky-members'] = z6({ track: 'sticky' });

function strip(s) { const { tr, ...rest } = s; return rest; }

/* ------------------------------------------------------------------- report */

const f = (v, w = 9) => String(v).padStart(w);
console.log(`\nKITEHAWK — zoom controller trace   ${SECS} s @ 60 Hz, seed "${SEED}"`);
console.log(`portrait 390x844: worldW ${out.solve.worldW} wu, worldH ${out.solve.worldH} wu, zoomFill ${out.solve.zoomFill}\n`);

console.log('§4.3.1 solve, width-bound (the numbers §4.4.1 is built on):');
for (const r of out.solve.width) console.log(`  boxW ${f(r.boxW, 4)} wu -> need ${f(r.needW, 7)} -> zoom ${f(r.zoomNeeded, 7)}  clamped ${f(r.clamped, 7)}`);
console.log('§4.3.1 solve, height-bound:');
for (const r of out.solve.height) console.log(`  boxH ${f(r.boxH, 4)} wu -> need ${f(r.needH, 7)} -> zoom ${f(r.zoomNeeded, 7)}`);
console.log('zoom bias — settled zoom, ~378 wu box (mid-range) and alone (saturated):');
for (const [k, v] of Object.entries(out.solve.bias)) console.log(`  ${k.padEnd(22)} offset ${f(v.offset, 6)}  target ${f(v.target, 7)}  settles ${f(v.settled, 7)}`);

console.log('\nZ1-Z3 stability (PASS: <= 6 reversals/min, no pair inside 1.2 s, no osc > 0.05 for > 3 s)');
console.log('  ' + 'run'.padEnd(32) + 'rev/min   minGap  gapViol  oscWin  oscAmp   zoom range');
console.log('  ' + ''.padEnd(32) + '  (raw sign changes; the >=0.02-amplitude count is below)');
for (const [k, v] of Object.entries(out.stability)) {
  console.log(`  ${k.padEnd(32)}${f(v.reversalsPerMin, 7)}${f(v.minGapS, 9)}${f(v.gapViolations, 9)}${f(v.oscWindows, 8)}${f(v.oscWorstAmp, 8)}   ${v.zoomMin}-${v.zoomMax}`);
}
for (const [k, v] of Object.entries(out.stability)) console.log(`  ${k.padEnd(32)} p90 box ${f(v.boxWp90, 8)} x ${f(v.boxHp90, 8)} wu, max members ${v.membersMax}, box-membership changes ${v.boxChurn}`);
console.log('\n  same traces, counting only reversals a player could SEE (both runs >= 0.02 zoom):');
console.log('  ' + 'run'.padEnd(32) + 'rev/min   minGap  gapViol   smallest raw reversal');
for (const [k, v] of Object.entries(out.stability)) {
  console.log(`  ${k.padEnd(32)}${f(v.sigReversalsPerMin, 7)}${f(v.sigMinGapS, 9)}${f(v.sigGapViolations, 9)}${f(v.smallestReversalAmp, 24)}`);
}
console.log('\n  which direction pair breaks the 1.2 s rule, and reversals per box-membership change:');
for (const [k, v] of Object.entries(out.stability)) {
  console.log(`  ${k.padEnd(32)} in->out ${f(v.gapViolationDirs['in->out'], 3)}   out->in ${f(v.gapViolationDirs['out->in'], 3)}   rev/churn ${f(v.revPerChurn, 6)}`);
}
console.log('');
for (const k of ['shipped/scripted', 'shipped/duel', 'shipped/patrol', 'shipped/furball']) {
  console.log(`  ${k} reversals (t, direction, gap):`);
  console.log('    ' + (out.stability[k].revDetail.map((r) => `${r.t}s ${r.dir}${r.gap === null ? '' : ' +' + r.gap}`).join('  |  ') || '(none)'));
}

console.log('\nZ4 zoom-out is never blocked (400 randomised trials)');
for (const [k, v] of Object.entries(out.z4)) console.log(`  ${k.padEnd(26)} ${v.trials} trials, ${v.blocked} blocked, ${v.deadbanded} inside the deadband (not counted), max first-tick step ${v.maxFirstTickStep}`);

console.log('\nZ5 allowOutsideClamp under player control');
for (const [k, v] of Object.entries(out.z5)) {
  console.log(`  ${k}`);
  console.log(`    refused flag ${v.refusedFlag}; with control zoom ${v.zoomUnderPlayerControl} (floor ${v.clampFloor}) escaped=${v.escapedUnderControl}`);
  console.log(`    without control zoom ${v.zoomWithNoControl} (establish ${v.establish}) reached=${v.reachedEstablishWithNoControl}; 'beat' zoom ${v.zoomBeatPriority} escaped=${v.beatEscaped}`);
}

console.log('\nZ6 a stale framing member cannot pin the floor');
for (const [k, v] of Object.entries(out.z6)) {
  console.log(`  ${k.padEnd(26)} dropped at tick ${v.droppedAtTick ?? 'NEVER'}; zoom after 6 s ${v.zoomAfter6s}`);
  console.log('    ' + v.first8.map((s) => `t${s.tick}:${s.members}m/${s.boxW}wu`).join(' '));
}

const jsonAt = arg('--json', null);
if (jsonAt) { writeFileSync(jsonAt, JSON.stringify(out, null, 1)); console.log(`\nwrote ${jsonAt}`); }
console.log('');
