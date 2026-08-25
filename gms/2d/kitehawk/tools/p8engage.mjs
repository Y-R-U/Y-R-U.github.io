#!/usr/bin/env node
/**
 * ENGAGEMENT — the fixture P8 is missing, and the measurement of how much of a
 * sample actually is one.
 *
 * D115: over 185,979 shipped duel ticks the opponent is inside the frame 12.8%
 * of the time. P0's p90 framing box taken over that trace is a p90 of empty sky.
 * The answer is not to retune the AI until the sample fills up — that would be
 * moving the world to make a number come out. It is to say what an engagement
 * is, cut the trace into engagements, report how frequent they are, and take
 * every percentile inside them.
 *
 * THE DEFINITION, stated once and tied to shipped constants rather than taste:
 *
 *   An ENGAGEMENT is a maximal run of ticks within ONE duel round in which
 *     (a) the player is alive and at least one hostile is alive, and
 *     (b) the nearest hostile is within `zoomLockRange` (1400 wu = 210 m),
 *   where excursions past (b) shorter than `--bridge` (1.0 s) do not split the
 *   run, and the run survives only if it lasts at least `--min` (2.0 s).
 *
 * `zoomLockRange` is chosen because it is not a new number: it is the radius
 * `framingContributions()` admits hostiles from, the radius the zoom lock arms
 * at, and the radius §4.4.2 P2 starts its warning clock at. An engagement is
 * therefore exactly "the camera is being asked to frame a fight" — which is the
 * only interval any camera criterion has an opinion about.
 *
 *   node tools/p8engage.mjs [--runs 32] [--sep 1400] [--min 2] [--bridge 1]
 *   node tools/p8engage.mjs --arena 150      # positive control: shrink the arena
 *   node tools/p8engage.mjs --json out.json
 */
import { writeFileSync } from 'node:fs';
import { createCamera } from '../js/core/camera.js';
import { VIEW_PROFILE } from '../js/core/viewprofile.js';
import { M_PER_WU } from '../js/core/math.js';
import { framingContributions } from '../js/sim/entities.js';
import { HULL_M } from '../js/sim/damage.js';
import { ACE_IDS } from '../js/sim/ai.js';
import { createDuel } from '../js/modes/duel.js';
import { createBus } from '../js/core/events.js';

const DT = 1 / 60;
const HULL_WU = HULL_M / M_PER_WU;
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const has = (k) => argv.includes(k);

const RUNS = Number(arg('--runs', 32));
const SEP = Number(arg('--sep', 1400));        // wu — the engagement bound
const MIN_S = Number(arg('--min', 2));
const BRIDGE_S = Number(arg('--bridge', 1));
const ARENA = Number(arg('--arena', 0));       // m — positive control
const MODE = arg('--mode', 'portrait');
const JSON_OUT = arg('--json', '');
const ACES = (arg('--aces', '') || ACE_IDS.join(',')).split(',').filter(Boolean);

export function makeView(mode = 'portrait', w = 0, h = 0) {
  if (!w) { w = mode === 'portrait' ? 390 : 844; h = mode === 'portrait' ? 844 : 390; }
  const profile = VIEW_PROFILE[mode];
  const scale = h / profile.worldH;
  return { mode, w, h, dpr: 2, profile, worldH: profile.worldH, worldW: w / scale, scale,
           safe: { top: 0, right: 0, bottom: 0, left: 0 } };
}

export const pct = (a, p) => {
  if (!a.length) return NaN;
  const s = Float64Array.from(a).sort();
  return s[Math.min(s.length - 1, Math.max(0, Math.round((p / 100) * (s.length - 1))))];
};

/**
 * Drive one duel and return the per-tick trace. The camera is the shipped one,
 * driven from the shipped `framingContributions` — no re-implementation, which
 * is camtrace.mjs's rule and the reason its numbers belong to the controller.
 */
export function traceDuel({ ace, seed, arena = 0, view, camOpts = { bias: 'normal' }, noClear = false,
                            forceZoom = 0, admit = 0 }) {
  const cam = createCamera(view, camOpts);
  const bus = createBus();
  const hits = [];                                   // player:damage, for P6
  bus.on('player:damage', (e) => hits.push({ tick: tickN, by: e.by }));
  let tickN = 0;
  const d = createDuel({ bus }, { ace, seed }).begin();
  if (arena) { d.world.arena.halfW = arena; d.world.arena.lineX = arena; }
  const box = [];
  const T = { sep: [], boxW: [], boxH: [], mem: [], zoom: [], target: [], onScreen: [],
              round: [], alive: [], hostiles: [], shots: [], farMember: [],
              // P8b: the camera's own lead accounting, per tick rather than as a
              // run total, so it can be restricted to engaged ticks. Deltas of the
              // getters camera.js already exposes — nothing is re-derived here.
              clip: [], clipX: [], clipY: [], cap: [], speed: [],
              // P8c, additive: the lead is `v * leadSeconds` PER AXIS and the
              // clamp is per axis too, so a single |v| cannot say which axis
              // was clipped or how large a lead time each could carry.
              vx: [], vy: [] };
  let guard = 0, shotsPrev = 0;
  let clipPrev = 0, capPrev = 0, clipXPrev = 0, clipYPrev = 0;
  const lastSeen = new Map();      // hostile id -> tick it was last inside the frame
  const track = new Map();         // hostile id -> { tLock, tSeen } since it last became trackable
  const warn = [];                 // P2: one row per approach that reached gun range
  while (!d.done && guard++ < 60 * 90 * 3 + 20) {
    tickN = T.sep.length;
    const round = d.roundIndex;
    if (!d.step()) break;
    const player = d.entities.player;
    if (!player) continue;
    const pf = player.flight;
    const alive = !!player.alive && !player.dead;

    // DRIVER-LEVEL BREAK SWITCH. Every real driver of this camera — hud.html,
    // hudcheck, p8probe, p8duelbox, this file — calls clearTracked() every tick
    // and re-asserts, which BYPASSES the member-expiry path entirely. camera.js's
    // `?track=sticky` control only disables that expiry, so it is INERT against
    // the shipping code path. `noClear` is the driver that would make it live.
    if (!noClear) cam.clearTracked();
    if (alive) {
      // MANAGER ARM: the radius the framing box admits from. It defaults to
      // `zoomLockRange`, which is the same constant camera.js uses for the
      // opposite job — capping how far the frame may TIGHTEN with a hostile
      // near. Admission and lock are not the same question and this separates
      // them so the difference can be measured.
      framingContributions(d.world, player, box, admit || view.profile.admitWu);
      for (const m of box) cam.track(m.id, m.x, m.y, m.w, m.h, m.weight);
    } else box.length = 0;
    cam.setPlayerControl(false);
    cam.update({ x: pf.sx / M_PER_WU, y: pf.sy / M_PER_WU, vx: pf.svx / M_PER_WU,
                 vy: pf.svy / M_PER_WU, angle: pf.theta, hull: HULL_WU }, DT);
    T.clip.push(cam.clipTicks - clipPrev); clipPrev = cam.clipTicks;
    T.cap.push(cam.capTicks - capPrev); capPrev = cam.capTicks;
    T.clipX.push(cam.clipSumX - clipXPrev); clipXPrev = cam.clipSumX;
    T.clipY.push(cam.clipSumY - clipYPrev); clipYPrev = cam.clipSumY;
    T.speed.push(Math.hypot(pf.svx, pf.svy) / M_PER_WU);
    T.vx.push(pf.svx / M_PER_WU); T.vy.push(pf.svy / M_PER_WU);

    // how far out the WIDEST admitted member sits. If boxW tracks this rather
    // than the fight's own geometry, P0 is measuring the admission rule.
    let far = 0;
    for (const m of box) {
      if (!m.weight) continue;
      const dd = Math.hypot(m.x - pf.sx / M_PER_WU, m.y - pf.sy / M_PER_WU);
      if (dd > far) far = dd;
    }
    T.farMember.push(far);

    let best = Infinity, bestE = null, nHost = 0;
    for (const e of d.world.live) {
      if (e === player || !e.alive || e.dead || e.side === player.side) continue;
      nHost++;
      const dd = Math.hypot((e.flight.sx - pf.sx) / M_PER_WU, (e.flight.sy - pf.sy) / M_PER_WU);
      if (dd < best) { best = dd; bestE = e; }
    }
    let onScreen = 0;
    // Resolve pending hits BEFORE this tick's lastSeen update. Resolving them at
    // the end of the run instead read `sinceSeen` as NEGATIVE — the attacker had
    // been seen after the hit. My own instrument; caught by a negative duration.
    for (const h of hits) {
      if (h.sinceSeenS !== undefined) continue;
      const ls = lastSeen.has(h.by) ? lastSeen.get(h.by) : -1e9;
      h.sinceSeenS = (h.tick - ls) * DT;
    }
    // P2 / P6 bookkeeping over EVERY hostile, not only the nearest.
    {
      const z = forceZoom || cam.zoom;
      const halfW = view.worldW / z * 0.5, halfH = view.worldH / z * 0.5;
      for (const e of d.world.live) {
        if (e === player || !e.alive || e.dead || e.side === player.side) continue;
        const ex = e.flight.sx / M_PER_WU, ey = e.flight.sy / M_PER_WU;
        const seen = Math.abs(ex - cam.x) <= halfW && Math.abs(ey - cam.y) <= halfH;
        if (seen) lastSeen.set(e.id, tickN);
        if (e === bestE && seen) onScreen = 1;
        const dWu = Math.hypot(ex - pf.sx / M_PER_WU, ey - pf.sy / M_PER_WU);
        let tr = track.get(e.id);
        if (dWu > view.profile.zoomLockRange) { track.delete(e.id); continue; }
        if (!tr) { tr = { tLock: tickN, tSeen: -1, fired: false }; track.set(e.id, tr); }
        if (tr.tSeen < 0 && seen) tr.tSeen = tickN;
        // 440 wu is the gun range (§4.3.5). One row per approach.
        if (!tr.fired && dWu <= 440) {
          tr.fired = true;
          warn.push({ total: (tickN - tr.tLock) * DT,
                      inFrame: tr.tSeen >= 0 ? (tickN - tr.tSeen) * DT : 0,
                      everSeen: tr.tSeen >= 0 });
        } else if (tr.fired && dWu > 700) {
          // a fresh approach, not the same one. 700 wu is P5/P6's own contested
          // radius, used here only as a hysteresis so one pass is one row.
          tr.fired = false; tr.tLock = tickN; tr.tSeen = seen ? tickN : -1;
        }
      }
    }
    T.sep.push(best); T.boxW.push(cam.box.w); T.boxH.push(cam.box.h);
    T.mem.push(cam.memberCount); T.zoom.push(cam.zoom); T.target.push(cam.zoomTarget);
    T.onScreen.push(onScreen); T.round.push(round); T.alive.push(alive ? 1 : 0);
    T.hostiles.push(nHost);
    // shotsFired belongs to the ENTITY, and a new round seats a new player, so
    // the raw delta goes negative at every round boundary. The first version of
    // this line made engaged shots read 282% of total shots — my own instrument,
    // caught by a percentage over 100.
    T.shots.push(Math.max(0, player.shotsFired - shotsPrev)); shotsPrev = player.shotsFired;
  }
  T.summary = d.summary;
  T.ace = ace; T.seed = seed;
  T.warn = warn;
  T.hits = hits.filter((h) => h.sinceSeenS !== undefined);
  return T;
}

/**
 * Cut a trace into engagements. Returns [{i0, i1, ticks, secs, round}].
 * Bridging first, then the minimum-duration filter — the other order splits one
 * turning fight into four and then discards all four.
 */
export function segment(T, { sep = SEP, minS = MIN_S, bridgeS = BRIDGE_S } = {}) {
  const n = T.sep.length;
  const bridge = Math.round(bridgeS / DT), minT = Math.round(minS / DT);
  const hot = new Uint8Array(n);
  for (let i = 0; i < n; i++) hot[i] = (T.alive[i] && T.hostiles[i] > 0 && T.sep[i] <= sep) ? 1 : 0;
  // bridge short cold gaps, but never across a round boundary or a death
  for (let i = 0; i < n; i++) {
    if (hot[i]) continue;
    let j = i; while (j < n && !hot[j]) j++;
    if (j < n && i > 0 && (j - i) <= bridge && T.round[i - 1] === T.round[j]) {
      let ok = true;
      for (let k = i; k < j && ok; k++) if (!T.alive[k]) ok = false;
      if (ok) for (let k = i; k < j; k++) hot[k] = 1;
    }
    i = j - 1;
  }
  const segs = [];
  for (let i = 0; i < n; i++) {
    if (!hot[i]) continue;
    let j = i; while (j < n && hot[j] && T.round[j] === T.round[i]) j++;
    if (j - i >= minT) segs.push({ i0: i, i1: j - 1, ticks: j - i, secs: (j - i) * DT, round: T.round[i] });
    i = j - 1;
  }
  return segs;
}

/* ------------------------------------------------------------------ main -- */

if (import.meta.url === `file://${process.argv[1]}`) {
  const view = makeView(MODE);
  const traces = [];
  for (let i = 0; i < RUNS; i++)
    traces.push(traceDuel({ ace: ACES[i % ACES.length], seed: 1000 + i, arena: ARENA, view }));

  const ALL = { boxW: [], boxH: [], sep: [], zoom: [], mem: [] };
  const ENG = { boxW: [], boxH: [], sep: [], zoom: [], mem: [] };
  const SOLO = [], BOXED = [], FAR = [];   // boxW with 0 members / >=1 member, and the far member
  let ticks = 0, aliveTicks = 0, engTicks = 0, onScreenAll = 0, onScreenEng = 0;
  let boxedAll = 0, boxedEng = 0, shotsAll = 0, shotsEng = 0, engagements = 0;
  const durs = [], perAce = new Map(), engBoxP90 = [];

  for (const T of traces) {
    const segs = segment(T);
    const inSeg = new Uint8Array(T.sep.length);
    for (const s of segs) for (let i = s.i0; i <= s.i1; i++) inSeg[i] = 1;
    for (let i = 0; i < T.sep.length; i++) {
      ticks++; if (T.alive[i]) aliveTicks++;
      ALL.boxW.push(T.boxW[i]); ALL.boxH.push(T.boxH[i]); ALL.zoom.push(T.zoom[i]); ALL.mem.push(T.mem[i]);
      if (Number.isFinite(T.sep[i])) ALL.sep.push(T.sep[i]);
      onScreenAll += T.onScreen[i]; boxedAll += T.mem[i] > 0 ? 1 : 0; shotsAll += T.shots[i];
      if (!inSeg[i]) continue;
      engTicks++;
      ENG.boxW.push(T.boxW[i]); ENG.boxH.push(T.boxH[i]); ENG.zoom.push(T.zoom[i]); ENG.mem.push(T.mem[i]);
      ENG.sep.push(T.sep[i]);
      (T.mem[i] > 0 ? BOXED : SOLO).push(T.boxW[i]);
      if (T.mem[i] > 0) FAR.push(T.farMember[i]);
      onScreenEng += T.onScreen[i]; boxedEng += T.mem[i] > 0 ? 1 : 0; shotsEng += T.shots[i];
    }
    engagements += segs.length;
    for (const s of segs) {
      durs.push(s.secs);
      const w = []; for (let i = s.i0; i <= s.i1; i++) w.push(T.boxW[i]);
      engBoxP90.push(pct(w, 90));
    }
    const a = perAce.get(T.ace) || { runs: 0, segs: 0, engTicks: 0, ticks: 0, shots: 0 };
    a.runs++; a.segs += segs.length; a.ticks += T.sep.length; a.shots += T.summary.shots;
    for (const s of segs) a.engTicks += s.ticks;
    perAce.set(T.ace, a);
  }

  const f = (v, w = 9) => String(Number.isFinite(v) ? (Number.isInteger(v) ? v : v.toFixed(2)) : v).padStart(w);
  const p = (a, b) => `${((a / b) * 100).toFixed(1)}%`;
  const W = view.worldW;   // P8c: was the literal 462.09, portrait's, in a --mode tool

  console.log(`\nP8 ENGAGEMENT${ARENA ? `  [CONTROL arena ${ARENA} m]` : ''} — ${RUNS} duels over ${ACES.length} aces, ${MODE} ${view.w}x${view.h}`);
  console.log(`definition: alive & hostile alive & nearest <= ${SEP} wu, bridged ${BRIDGE_S}s, held >= ${MIN_S}s\n`);
  console.log(`  ticks total            ${ticks}   (${(ticks * DT).toFixed(0)} s)`);
  console.log(`  ticks player alive     ${aliveTicks}  ${p(aliveTicks, ticks)}`);
  console.log(`  ENGAGEMENTS            ${engagements}   (P0 wants >= 200)`);
  console.log(`  ticks ENGAGED          ${engTicks}  ${p(engTicks, ticks)} of all, ${p(engTicks, aliveTicks)} of alive`);
  console.log(`  engagement duration s  p10 ${f(pct(durs, 10), 6)}  p50 ${f(pct(durs, 50), 6)}  p90 ${f(pct(durs, 90), 6)}  max ${f(pct(durs, 100), 6)}`);
  console.log(`  engaged secs / duel    ${(engTicks * DT / RUNS).toFixed(1)} s`);

  console.log(`\n  quantity              p50      p75      p90      p95      max`);
  for (const [n, a, e] of [['box W (wu)', ALL.boxW, ENG.boxW], ['box H (wu)', ALL.boxH, ENG.boxH],
                           ['nearest (wu)', ALL.sep, ENG.sep], ['members', ALL.mem, ENG.mem]]) {
    console.log(`  ${(n + ' ALL').padEnd(18)}${f(pct(a, 50))}${f(pct(a, 75))}${f(pct(a, 90))}${f(pct(a, 95))}${f(pct(a, 100))}`);
    console.log(`  ${(n + ' ENGAGED').padEnd(18)}${f(pct(e, 50))}${f(pct(e, 75))}${f(pct(e, 90))}${f(pct(e, 95))}${f(pct(e, 100))}`);
  }
  console.log(`  ${'zoom ALL'.padEnd(18)}${f(pct(ALL.zoom, 5))}${f(pct(ALL.zoom, 10))}${f(pct(ALL.zoom, 25))}${f(pct(ALL.zoom, 50))}${f(pct(ALL.zoom, 0))}   (p05/p10/p25/p50/min)`);
  console.log(`  ${'zoom ENGAGED'.padEnd(18)}${f(pct(ENG.zoom, 5))}${f(pct(ENG.zoom, 10))}${f(pct(ENG.zoom, 25))}${f(pct(ENG.zoom, 50))}${f(pct(ENG.zoom, 0))}`);

  console.log(`\n  is there a fight?          ALL        ENGAGED`);
  console.log(`    nearest inside the frame  ${p(onScreenAll, ticks).padStart(7)}    ${p(onScreenEng, engTicks || 1).padStart(7)}`);
  console.log(`    box holds a hostile       ${p(boxedAll, ticks).padStart(7)}    ${p(boxedEng, engTicks || 1).padStart(7)}`);
  console.log(`    player shots fired        ${String(shotsAll).padStart(7)}    ${String(shotsEng).padStart(7)}  (${p(shotsEng, shotsAll || 1)} of them)`);

  const bwAll = pct(ALL.boxW, 90), bwEng = pct(ENG.boxW, 90), bwSeg = pct(engBoxP90, 90);
  const verdict = (bw) => bw > 585 ? 'PIVOT SIGNAL' : bw > 503 ? 'clamp must widen to 0.68' : 'inside the auto clamp';
  console.log(`\n  §4.4.1 p90 framing-box width`);
  for (const [n, bw] of [['over ALL ticks', bwAll], ['over ENGAGED ticks', bwEng],
                         ['p90 of per-engagement p90', bwSeg]])
    console.log(`    ${n.padEnd(28)}${bw.toFixed(1)} wu -> contain z <= ${(0.85 * W / bw).toFixed(4)}   ${verdict(bw)}`);

  console.log(`\n  DECOMPOSITION over ENGAGED ticks — is boxW the fight, or the admission radius?`);
  console.log(`    ticks with 0 box members  ${SOLO.length}  ${p(SOLO.length, engTicks || 1)}   boxW p50 ${f(pct(SOLO, 50), 7)}  p90 ${f(pct(SOLO, 90), 7)}`);
  console.log(`    ticks with >=1 member     ${BOXED.length}  ${p(BOXED.length, engTicks || 1)}   boxW p50 ${f(pct(BOXED, 50), 7)}  p90 ${f(pct(BOXED, 90), 7)}`);
  console.log(`    farthest admitted member                    dist p50 ${f(pct(FAR, 50), 7)}  p90 ${f(pct(FAR, 90), 7)}`);
  console.log(`    boxW - farMember (padding+lead)             p50 ${f(pct(BOXED, 50) - pct(FAR, 50), 7)}  p90 ${f(pct(BOXED, 90) - pct(FAR, 90), 7)}`);
  // §4.4.1 says boxW > 585 wu is the pivot signal. buildBox spans player..member,
  // so a member admitted past ~505 wu IS a pivot-signal tick by construction.
  const over585 = BOXED.filter((w) => w > 585).length, over503 = BOXED.filter((w) => w > 503).length;
  console.log(`    of the ticks with a member: boxW > 503 wu ${p(over503, BOXED.length || 1)}   > 585 wu ${p(over585, BOXED.length || 1)}`);
  console.log(`    ... as a fraction of ALL engaged ticks:    ${p(over503, engTicks || 1)}         ${p(over585, engTicks || 1)}`);

  console.log(`\n  per ace                runs  engagements  engaged%  shots`);
  for (const [k, a] of [...perAce].sort((x, y) => y[1].engTicks / y[1].ticks - x[1].engTicks / x[1].ticks))
    console.log(`    ${k.padEnd(6)}${String(a.runs).padStart(14)}${String(a.segs).padStart(11)}${p(a.engTicks, a.ticks).padStart(10)}${String(a.shots).padStart(8)}`);

  if (JSON_OUT) {
    writeFileSync(JSON_OUT, JSON.stringify({
      when: new Date().toISOString(), runs: RUNS, mode: MODE, arena: ARENA,
      def: { sepWu: SEP, minS: MIN_S, bridgeS: BRIDGE_S },
      ticks, aliveTicks, engTicks, engagements,
      engagedFraction: engTicks / ticks,
      boxWp90: { all: bwAll, engaged: bwEng, perEngagement: bwSeg },
      onScreen: { all: onScreenAll / ticks, engaged: onScreenEng / (engTicks || 1) },
      durations: { p10: pct(durs, 10), p50: pct(durs, 50), p90: pct(durs, 90), max: pct(durs, 100) },
    }, null, 2));
    console.log(`\n  wrote ${JSON_OUT}`);
  }
}
