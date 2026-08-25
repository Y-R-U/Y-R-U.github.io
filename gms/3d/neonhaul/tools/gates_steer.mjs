#!/usr/bin/env node
// §S2-R — the lateral clearance steer, and the obsidian deck that made it possible.
//
//   node tools/gates_steer.mjs [--headed] [--lite]
//
// S1  no flying craft is DRAWN entirely inside a mass — and with avoidance off, many are
// S2  no road transport is drawn buried in an UNDRESSED mass — and with avoidance off, many are
// S3  the steer fires, and every offset it applies is inside its own budget
// S4  the steer does not move the traffic hash — and the hash can still move
// S5  the offset is CONTINUOUS: no frame-to-frame jump that would read as a teleport
// S6  the CLIMB branch works, proved by forcing it — on the shipped city it never fires
// S7  the road steer is suppressed at a dressed bore, so nothing steers into a jamb
// S8  the deck carries no carriageway: ROAD_BODY's lattice markings are gone from the shader
//
// ── why every check here has an arm beside it ──────────────────────────────
//
// This project's standing lesson is measurements that silently measure nothing, and S2-R added
// three more instances to the list before it had a gate at all:
//
//   * `stats.avoided` counted a 14 m push that left every one of six craft inside a 160-450 m
//     tower. The counter was right; the correction was a no-op.
//   * a 40-moment sweep read `roadList(0, t)`'s `hidden` field, which is written by the last FRAME
//     and knows nothing about `t`. It reported 83 vehicles driving unsuppressed through walls.
//     None of them were. `roadList` now returns null for its frame-state fields when given a `t`.
//   * the first sweep counted a vehicle inside a DRESSED bore as a defect, because solidAt sees a
//     mass with no hole in it. That turned the tunnel layer working correctly into a regression.
//
// So: S1 and S2 measure at the DRAWN position (`trafficDrawn`, `roadList().sx/sz`), never at the
// analytic one — measuring `posOf` measures the input to the fix and would score it broken. And a
// zero is only allowed to mean anything after the same code path has been shown producing a
// non-zero.

import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { open, parseArgs, waitFor, settle, evalJSON, quiesce } from './shot.mjs';
import { CityModel } from '../js/city.js';
import { ALT, CORR, LANE_SEP, lanePhase, trafficSeed } from '../js/lanes.js';

const SEED = 1313165134;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = parseArgs();
const LITE = !!args.lite;
const OUT = resolve(ROOT, 'shots/steer');
mkdirSync(OUT, { recursive: true });
const FILE = resolve(OUT, '_gates.json');

// Real seeded lane crossings, from the same city model and the same lattice the game builds —
// `trafficSeed` matters here: lanes.js says plainly that passing the WORLD seed produces a
// plausible lattice that is nowhere near the lanes traffic.js fills.
function seededCrossings(n) {
  const city = new CityModel({
    landmarks: JSON.parse(readFileSync(resolve(ROOT, 'data/landmarks.json'), 'utf8')),
    names: JSON.parse(readFileSync(resolve(ROOT, 'data/names.json'), 'utf8')),
    seed: SEED,
  });
  const ts = trafficSeed(SEED), HALF = 1.6, found = [];
  for (let cz = -4; cz <= 4; cz++) for (let cx = -4; cx <= 4; cx++) {
    for (const b of city.generateChunk(cx, cz).buildings) {
      if (b.landmark) continue;
      const x0 = b.x - b.w / 2, x1 = b.x + b.w / 2, z0 = b.z - b.d / 2, z1 = b.z + b.d / 2;
      for (let a = 0; a < ALT.length; a++) {
        if (ALT[a] > b.h) continue;
        const axis = a & 1;
        const c0 = axis === 0 ? z0 : x0, c1 = axis === 0 ? z1 : x1;
        const p = lanePhase(a, ts);
        for (let k = Math.ceil((c0 - HALF - p) / CORR); k <= Math.floor((c1 + HALF - p) / CORR); k++) {
          for (const dir of [-1, 1]) {
            const line = p + k * CORR + dir * LANE_SEP;
            if (line + HALF < c0 || line - HALF > c1) continue;
            found.push({ x: axis === 0 ? b.x : line, z: axis === 0 ? line : b.z, alt: ALT[a] });
          }
        }
      }
    }
  }
  const out = [];
  for (let i = 0; i < found.length && out.length < n; i += Math.max(1, Math.floor(found.length / n)))
    out.push(found[i]);
  return out;
}

const ok = [], fail = [], detail = {};
function check(name, pass, det) {
  (pass ? ok : fail).push(name);
  detail[name] = det;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}\n      ${String(det).replace(/\n/g, '\n      ')}`);
  try {
    writeFileSync(FILE, JSON.stringify({ at: new Date().toISOString(), lite: LITE,
      total: ok.length + fail.length, passed: ok.length, failed: fail.length, ok, fail, detail }, null, 1));
  } catch { /* a full disk must not swallow the console above */ }
}

// ── the sweeps, run inside the page ────────────────────────────────────────
//
// AIR: every promoted craft, at the pose that went to the GPU. "Inside" means the WHOLE hull is
// in a mass — a craft touching a facade is cut by that facade's own depth write and is correct.
const AIR = `(() => {
  const g = window.__game;
  const o = { drawn: 0, dead: 0, inside: 0, touching: 0, steered: 0, climbed: 0,
    trapped: 0, trappedLm: 0, trappedSeeded: 0, maxOff: 0, ex: [] };
  g.freezeTime(true);
  for (let k = 0; k < 30; k++) {
    g.stepVehicles(30 + k * 4.3, 0);
    for (const v of g.trafficDrawn()) {
      if (!g.cityChunkLive(v.x, v.z)) { o.dead++; continue; }
      o.drawn++;
      if (v.steered) { o.steered++; o.maxOff = Math.max(o.maxOff, Math.abs(v.off)); }
      if (v.climbed) o.climbed++;
      const half = v.w * 0.5, hl = 4.5;
      const at = (a) => g.solidAt(v.axis === 0 ? v.x + a : v.x, v.y, v.axis === 0 ? v.z : v.z + a, half);
      if (v.trapped) {
        o.trapped++;
        const h = at(0);
        if (h && h.landmark) o.trappedLm++; else o.trappedSeeded++;
        continue;
      }
      if (!at(0)) continue;
      if (at(-hl) && at(hl)) {
        o.inside++;
        if (o.ex.length < 6) o.ex.push({ alt: v.alt, off: v.off, x: v.x, z: v.z });
      } else o.touching++;
    }
  }
  g.freezeTime(false);
  return o;
})()`;

// ROAD: the same, but a mass a DRESSED bore covers is the feature working and not a defect, so the
// shipped span list is consulted rather than solidAt alone.
const ROAD = `(() => {
  const g = window.__game;
  const R_LANE = 3.3;
  const o = { obs: 0, clear: 0, inBore: 0, buried: 0, buriedLm: 0, buriedSeeded: 0,
    maxBury: 0, steered: 0, maxOff: 0, lm: {}, ex: [] };
  const spans = (g.tunnelList() || []).map(s => ({ axis: s.axis, line: s.line, a0: s.a0, a1: s.a1 }));
  const covered = (axis, cross, along) => spans.some(s => s.axis === axis
    && Math.abs(s.line - cross) <= R_LANE * 0.5 && along >= s.a0 - 2 && along <= s.a1 + 2);
  const HW = { bus_road: 1.30, tram_road: 1.30, haul_road: 1.50 };
  g.freezeTime(true);
  for (let k = 0; k < 40; k++) {
    g.stepVehicles(40 + k * 3.7, 4.0);
    for (const v of g.roadList(0)) {
      const vx = v.sx, vz = v.sz;
      if (vx === null || !g.cityChunkLive(vx, vz)) continue;
      o.obs++;
      if (v.off) { o.steered++; o.maxOff = Math.max(o.maxOff, Math.abs(v.off)); }
      if (v.hidden || v.streak <= 0.02) continue;
      const hl = v.L / 2, half = HW[v.type] || 1.5, cross = v.axis === 0 ? vz : vx;
      let bury = 0, worst = null, bore = false;
      for (let a = -hl; a <= hl + 1e-6; a += 0.5) for (const c of [-half, 0, half]) {
        const px = v.axis === 0 ? vx + a : vx + c, pz = v.axis === 0 ? vz + c : vz + a;
        const h = g.solidAt(px, v.y, pz, 0);
        if (!h) continue;
        if (covered(v.axis, cross, v.axis === 0 ? px : pz)) { bore = true; continue; }
        if (Math.abs(a) >= bury) { bury = Math.abs(a); worst = h; }
      }
      if (!bury) { if (bore) o.inBore++; else o.clear++; continue; }
      o.buried++;
      if (worst && worst.landmark) { o.buriedLm++; o.lm[worst.landmark] = (o.lm[worst.landmark] || 0) + 1; }
      else o.buriedSeeded++;
      o.maxBury = Math.max(o.maxBury, +bury.toFixed(1));
      if (o.ex.length < 6) o.ex.push({ type: v.type, L: v.L, bury: +bury.toFixed(1), off: v.off,
        lm: worst ? (worst.landmark || 'seeded') : null });
    }
  }
  g.freezeTime(false);
  return o;
})()`;

async function main() {
  const ctx = await open({ w: 900, h: 600, dpr: 1, headed: !!args.headed });
  const { S, base, close } = ctx;
  try {
    await S('Page.navigate', {
      url: `${base}/index.html?nohud&nosave&debug=1&var=stormnight${LITE ? '&lite=1' : ''}` });
    await waitFor(S, 'window.__ready === true', 60000);
    await quiesce(S, { timeout: 90000 });
    await settle(S, 60);

    // ── S1 ────────────────────────────────────────────────────────────────
    const air = await evalJSON(S, AIR);
    await evalJSON(S, '({ v: window.__game.setTrafficAvoid(false) })');
    const airOff = await evalJSON(S, AIR);
    await evalJSON(S, '({ v: window.__game.setTrafficAvoid(true) })');
    check('S1 no flying craft is DRAWN entirely inside a mass',
      air.inside === 0 && airOff.inside > 10,
      `${air.drawn} promoted poses over 30 moments: ${air.inside} entirely inside a mass, `
      + `${air.touching} touching a facade (cut by its own depth write, which is correct).\n`
      + `steered ${air.steered} (max ${air.maxOff.toFixed(2)} m) · climbed ${air.climbed} · `
      + `withheld ${air.trapped} (${air.trappedLm} landmark, ${air.trappedSeeded} seeded)\n`
      + `FALSIFICATION — setTrafficAvoid(false) on the same path: ${airOff.inside} inside. `
      + `The sweep can see the defect, so its zero above is a measurement.`);

    check('S1b every craft the lateral steer failed on is a LANDMARK, not a seeded mass',
      air.trappedSeeded === 0 || air.trappedSeeded <= air.drawn * 0.005,
      `withheld ${air.trapped}: ${air.trappedLm} inside a landmark (80-120 m across, up to 470 m — `
      + `no offset within a street clears one, and no climb keeps §3.10 #2's altitudes), `
      + `${air.trappedSeeded} inside a seeded mass. A seeded mass is at most 38 m across, so any `
      + `number here that is not tiny is the lateral budget being too small.`);

    // ── S2 ────────────────────────────────────────────────────────────────
    const road = await evalJSON(S, ROAD);
    await evalJSON(S, '({ v: window.__game.setTrafficAvoid(false) })');
    const roadOff = await evalJSON(S, ROAD);
    await evalJSON(S, '({ v: window.__game.setTrafficAvoid(true) })');
    check('S2 no road transport is drawn buried in a SEEDED mass',
      road.buriedSeeded === 0 && roadOff.buried > road.buried,
      `${road.obs} vehicle-moments: ${road.buried} buried — ${road.buriedSeeded} in a seeded mass, `
      + `${road.buriedLm} in a landmark ${JSON.stringify(road.lm)}. `
      + `${road.inBore} more are inside a DRESSED bore, which is the feature working.\n`
      + `      steered ${road.steered}, max offset ${road.maxOff.toFixed(2)} m\n`
      + `      FALSIFICATION — avoidance off: ${roadOff.buried} buried `
      + `(${roadOff.buriedSeeded} seeded), max ${roadOff.maxBury} m.\n`
      + `      THE BOUND IS ON THE SEEDED HALF ONLY, and that is a statement about what is fixed `
      + `rather than a bar set where the code happens to clear it. A seeded mass is at most 38 m `
      + `across, so the lateral steer can always get round one and any non-zero here is a bug. A `
      + `LANDMARK crossing cannot be steered round and is not meant to be — it is meant to be `
      + `DRESSED, and js/tunnels.js declines to dress exactly three shapes: a drum past its facet `
      + `limit (kiln), a bridged pair (hollow) and a nested part (spindle). Those are the residue, `
      + `they are named, and S2b holds the line on how big it is allowed to get.`);

    check('S2b the landmark residue is bounded and is only the three undressable shapes',
      road.buriedLm <= road.obs * 0.02
        && Object.keys(road.lm).every(k => ['kiln', 'hollow', 'spindle'].includes(k)),
      `${road.buriedLm} of ${road.obs} vehicle-moments (`
      + `${(100 * road.buriedLm / Math.max(1, road.obs)).toFixed(2)} %) are inside an undressed `
      + `landmark: ${JSON.stringify(road.lm)}.\n`
      + `      A FOURTH name appearing here means tunnels.js has started dropping a crossing it `
      + `used to dress, which is a regression this suite would otherwise report as "still 1.2 %".`);

    // ── S3 ────────────────────────────────────────────────────────────────
    // The spawn camera has landmarks beside it and no seeded lane crossing within reach, so the
    // air steer never fires there — measuring it from one camera says "it never runs" and means
    // "not here". `sites` are REAL seeded crossings, derived node-side from the same city model
    // and the same lane lattice the game builds, so this walks to where the thing under test
    // actually happens instead of hoping it comes past.
    const sites = seededCrossings(6);
    const agg = { drawn: 0, inside: 0, steered: 0, climbed: 0, maxOff: 0, trappedSeeded: 0, visited: 0 };
    for (const st of sites) {
      await evalJSON(S, `({ v: window.__game.teleport(${st.x}, ${st.alt}, ${st.z}) === undefined })`);
      await quiesce(S, { timeout: 60000 });
      await settle(S, 30);
      const a = await evalJSON(S, AIR);
      agg.visited++; agg.drawn += a.drawn; agg.inside += a.inside; agg.steered += a.steered;
      agg.climbed += a.climbed; agg.trappedSeeded += a.trappedSeeded;
      agg.maxOff = Math.max(agg.maxOff, a.maxOff);
    }
    check('S3 the steer actually fires at a real crossing, and stays inside its own budget',
      agg.steered > 0 && road.steered > 0 && agg.inside === 0
        && agg.maxOff <= 9.0 + 1e-6 && road.maxOff <= 11.0 + 1e-6,
      `${agg.visited} seeded lane crossings visited, ${agg.drawn} promoted poses: `
      + `${agg.steered} steered (largest ${agg.maxOff.toFixed(2)} m against a 9.00 m budget), `
      + `${agg.climbed} climbed, ${agg.inside} inside a mass, ${agg.trappedSeeded} withheld.\n`
      + `      road: ${road.steered} steered, largest ${road.maxOff.toFixed(2)} m against 11.00 m.\n`
      + `      A steer that never fired would satisfy S1 and S2 by doing nothing at all, so this is `
      + `the check that stops those two passing over an empty city.`);

    // ── S4 ────────────────────────────────────────────────────────────────
    const h0 = await evalJSON(S, '(() => window.__game.trafficHash(120))()');
    await evalJSON(S, '({ v: window.__game.setTrafficAvoid(false) })');
    const h1 = await evalJSON(S, '(() => window.__game.trafficHash(120))()');
    await evalJSON(S, '({ v: window.__game.setTrafficAvoid(true) })');
    const h2 = await evalJSON(S, '(() => window.__game.trafficHash(121))()');
    check('S4 the steer is outside the traffic hash — and the hash can still move',
      h0.hash === h1.hash && h0.hash !== h2.hash,
      `hash at t=120 with the steer on ${h0.hash}, with it off ${h1.hash} — identical, because the `
      + `steer is a render-time displacement and hash() re-derives from posOf/roadPosOf.\n`
      + `      at t=121 it is ${h2.hash}, so the hash is not simply constant. That pair is why the `
      + `first half is evidence: an equality between two numbers that never change is not one.`);

    // ── S5 ────────────────────────────────────────────────────────────────
    // S3 walked the camera to six crossings, so the near ring is still streaming when it returns.
    // A chunk going live ADDS collision boxes, and an offset that steps when new geometry appears
    // is the steer answering a question it could not answer a frame earlier — real, correct, and
    // nothing to do with the easing this check is about. (It is also invisible in play: chunks
    // arrive at the 512 m ring, where two metres is a fraction of a pixel.) So the stream is
    // quiesced first, and the check then measures the thing it names.
    await quiesce(S, { timeout: 90000 });
    await settle(S, 60);
    // Continuity is the property that makes this a lane change rather than a teleport, and it is
    // the one a still frame cannot show. Walked at 1/30 s of vehicle time.
    const cont = await evalJSON(S, `(() => {
      const g = window.__game;
      const prev = new Map();
      const o = { steps: 0, moved: 0, worst: 0, worstAt: null, samples: 0, wraps: 0 };
      g.freezeTime(true);
      for (let k = 0; k < 900; k++) {
        const t = 60 + k / 30;
        g.stepVehicles(t, 1 / 30);
        for (const v of g.roadList(0)) {
          if (v.sx === null) continue;
          o.samples++;
          const p = prev.get(v.i);
          if (p !== undefined) {
            // How far the vehicle moved along its lane since the last step. At 12 m/s a 1/30 s
            // step is 0.4 m; anything hundreds of metres is the periodic field WRAPPING — the
            // along period is W_TILE = 1024 m and the tile snaps in whole periods, so a vehicle
            // reaching the tile edge reappears at the other end of it in completely different
            // surroundings. Its offset SHOULD change discontinuously there, and traffic.js's
            // header says the wrap is deliberately put past fogFar for exactly this reason. A
            // continuity check that counted it would be measuring the tiling, not the easing.
            const step = Math.hypot(v.x - p.x, v.z - p.z);
            const d = Math.abs(v.off - p.off);
            if (step > 50) { o.wraps++; }
            else {
              if (d > 1e-9) o.moved++;
              if (d > o.worst) { o.worst = +d.toFixed(4);
                o.worstAt = { i: v.i, t: +t.toFixed(2), from: p.off, to: v.off, step: +step.toFixed(2) }; }
            }
          }
          prev.set(v.i, { off: v.off, x: v.x, z: v.z });
        }
        o.steps++;
      }
      g.freezeTime(false);
      return o;
    })()`);
    // At 12 m/s a 1/30 s step advances 0.4 m. Over that the offset cannot legitimately change by
    // more than the steepest part of the kernel allows — a whole metre in a thirtieth of a second
    // would be a visible sideways jerk.
    check('S5 the offset is continuous — no frame-to-frame jump that reads as a teleport',
      cont.worst < 1.0 && cont.moved > 50,
      `${cont.samples} samples over ${cont.steps} steps of 1/30 s: the largest single-step change `
      + `in a vehicle's lateral offset is ${cont.worst} m, and ${cont.moved} steps moved it at all `
      + `(${cont.wraps} tile wraps excluded — see the sweep for why they are not continuity).\n`
      + `      A vehicle covers 0.4 m in that time, so anything approaching a metre is the offset `
      + `snapping rather than easing. The second half of the bound matters as much as the first: a `
      + `worst of 0 would mean nothing ever steered and the check measured an idle city.`
      + (cont.worstAt ? `\n      worst: vehicle ${cont.worstAt.i} at t=${cont.worstAt.t}, `
        + `${cont.worstAt.from} → ${cont.worstAt.to}` : ''));

    // ── S6 ────────────────────────────────────────────────────────────────
    // The climb branch never fires on the shipped city. An unexercised branch is not a working
    // one, so the budget is forced to zero and it has to take over.
    // The baseline has to be read HERE. An earlier draft reused `air`, captured before S3 walked
    // the camera six crossings away, and then compared it against arms measured at the new one —
    // a stale fixture dressed up as a control, which is the same shape of mistake as reading two
    // clocks in `roadList`. Both arms and the baseline now come from one camera.
    const base0 = await evalJSON(S, AIR);
    const climbBefore = base0.climbed;
    await evalJSON(S, '({ v: window.__game.setSteerBudget(0, 0, 400) })');
    const forced = await evalJSON(S, AIR);
    await evalJSON(S, '({ v: window.__game.setSteerBudget(9, 11, 26) })');
    const restored = await evalJSON(S, AIR);
    check('S6 the CLIMB branch is real — forcing the lateral budget to zero hands it the work',
      forced.steered === 0 && forced.climbed > climbBefore && forced.inside === 0
        && restored.climbed === climbBefore && restored.steered === base0.steered,
      `shipped at this camera: ${base0.steered} steers, ${climbBefore} climbs.\n`
      + `      lateral budget forced to 0, climb ceiling to 400 m: ${forced.steered} steers, `
      + `${forced.climbed} climbs, ${forced.inside} still inside a mass.\n`
      + `      budget restored: ${restored.steered} steers, ${restored.climbed} climbs — identical `
      + `to shipped, so the arm did not leave a fixture behind for the checks after it.\n`
      + `      An earlier draft of this check asserted the shipped city NEVER climbs. That was true `
      + `of one camera and false of the next one tried, which is the same believable-looking `
      + `generalisation from a single row this project keeps paying for. What is actually being `
      + `proved is narrower and does not depend on where the camera is: with no sideways budget the `
      + `work moves to the climb, and the craft still end up out of the walls.`);

    // ── S7 ────────────────────────────────────────────────────────────────
    const bore = await evalJSON(S, `(() => {
      const g = window.__game;
      const R_LANE = 3.3;
      const spans = (g.tunnelList() || []).map(s => ({ axis: s.axis, line: s.line, a0: s.a0, a1: s.a1 }));
      const o = { bores: spans.length, near: 0, steeredNear: 0, worst: 0, far: 0, steeredFar: 0 };
      g.freezeTime(true);
      for (let k = 0; k < 40; k++) {
        g.stepVehicles(40 + k * 3.7, 4.0);
        for (const v of g.roadList(0)) {
          if (v.sx === null) continue;
          const cross = v.axis === 0 ? v.sz : v.sx, along = v.axis === 0 ? v.sx : v.sz;
          const s = spans.find(q => q.axis === v.axis && Math.abs(q.line - cross) <= R_LANE * 0.5
            && along >= q.a0 - 40 && along <= q.a1 + 40);
          if (s) { o.near++; if (v.off) { o.steeredNear++; o.worst = Math.max(o.worst, Math.abs(v.off)); } }
          else { o.far++; if (v.off) o.steeredFar++; }
        }
      }
      g.freezeTime(false);
      return o;
    })()`);
    check('S7 the road steer is suppressed at a dressed bore — nothing steers into a jamb',
      bore.steeredNear === 0 && bore.near > 0 && bore.steeredFar > 0,
      `${bore.bores} live bores. ${bore.near} vehicle-moments inside spanAt's 40 m approach window: `
      + `${bore.steeredNear} of them steered.\n`
      + `      A bore's mouth is a 4.80 m opening on the exact line the vehicle drives, so any `
      + `offset there puts the hull into the jamb — this is the one place the steer must not act.\n`
      + `      ${bore.steeredFar} of the ${bore.far} moments AWAY from a bore did steer, which is `
      + `what stops the zero above being "the steer never runs".`);

    // ── S8 ────────────────────────────────────────────────────────────────
    // Node-side: the markings are gone from the shader source, not merely turned down.
    const mats = readFileSync(resolve(ROOT, 'js/materials.js'), 'utf8');
    // COMMENTS STRIPPED FIRST. The check is about what the shader computes, and ROAD_BODY's header
    // necessarily names the very terms that were removed in order to explain why. Scanning the
    // prose made this go red on a sentence reading "P11's wash came from onRoad" — a gate failing
    // on its own documentation, which would have been quietly "fixed" by rewording the comment.
    const raw = mats.slice(mats.indexOf('const ROAD_BODY'), mats.indexOf('export function patchRoad'));
    const body = raw.replace(/\/\/[^\n]*/g, '');
    const gone = ['dashX', 'dashZ', 'edgeX', 'edgeZ', 'hatch', 'kerb', 'onRoad'];
    const left = gone.filter(k => body.includes(k));
    const has = ['deckHash', 'plate', 'seam', 'panel'].filter(k => body.includes(k));
    check('S8 the deck carries no carriageway — the lattice markings are gone from the shader',
      left.length === 0 && has.length === 4,
      `ROAD_BODY no longer mentions ${gone.join(', ')} — ${left.length ? 'STILL PRESENT: ' + left.join(', ') : 'none present'}.\n`
      + `      What replaced them: ${has.join(', ')}.\n`
      + `      This is a source check on purpose. A pixel test would pass on markings merely dimmed `
      + `to zero, and the point of §S2-R is that the 51.2 m lattice they were drawn on is not this `
      + `city's geometry: 502 of 4,132 seeded footprints (12.15 %) stand on the old carriageway, `
      + `the worst by 8.36 m. See tools/probe_enc.mjs and gates_p11 P1.`);

    // ── S10 ───────────────────────────────────────────────────────────────
    // Aaron asked for the transports to TURN rather than slide, and a sign error here is invisible
    // in every measurement above — the vehicle still clears the mass, it just faces the wrong way
    // doing it. The first draft had exactly that: the factor was inverted and every weaving hull
    // pointed away from the gap it was steering into.
    //
    // So this is deliberately GEOMETRIC and does not re-derive the formula it is testing. It walks
    // the nose forward along the drawn yaw and asks whether it lands nearer the path the vehicle
    // is actually taking than an unturned nose would. Restating the trigonometry would agree with
    // any sign the code happened to use.
    const yaw = await evalJSON(S, `(() => {
      const g = window.__game;
      // The UNSTEERED lane heading, from axis and direction alone — traffic.js's roadYawOf, kept
      // here as the baseline to beat rather than as the thing under test.
      const laneYaw = (axis, dir) => (axis === 0 ? (dir > 0 ? -Math.PI / 2 : Math.PI / 2)
                                                : (dir > 0 ? Math.PI : 0));
      // This file's rotation convention, and the model nose being local -Z.
      const nose = (x, z, a, d) => [x - Math.sin(a) * d, z - Math.cos(a) * d];
      const o = { checked: 0, better: 0, worse: 0, ties: 0, maxTurn: 0 };
      g.freezeTime(true);
      for (let k = 0; k < 200; k++) {
        const t = 60 + k * 0.4;
        g.stepVehicles(t, 0.4);
        const before = new Map(g.roadList(0).map(v => [v.i, v]));
        g.stepVehicles(t + 0.9, 0.9);
        for (const v of g.roadList(0)) {
          const p = before.get(v.i);
          if (!p || !p.off || p.sx === null || v.sx === null) continue;
          const step = Math.hypot(v.sx - p.sx, v.sz - p.sz);
          if (step < 1 || step > 50) continue;        // a wrapped vehicle is not a heading question
          o.checked++;
          o.maxTurn = Math.max(o.maxTurn, Math.abs(p.yaw - laneYaw(p.axis, p.dir)));
          const [tx, tz] = nose(p.sx, p.sz, p.yaw, step);                    // as drawn
          const [ux, uz] = nose(p.sx, p.sz, laneYaw(p.axis, p.dir), step);   // straight down the lane
          const turned = Math.hypot(tx - v.sx, tz - v.sz);
          const plain = Math.hypot(ux - v.sx, uz - v.sz);
          if (turned < plain - 1e-4) o.better++;
          else if (turned > plain + 1e-4) o.worse++;
          else o.ties++;
        }
      }
      g.freezeTime(false);
      return o;
    })()`);
    check('S10 a steered transport TURNS into its weave, not away from it',
      yaw.checked > 0 && yaw.better > yaw.worse,
      `${yaw.checked} steered vehicle-moments walked forward one 0.9 s step. Against the plain lane `
      + `heading, the DRAWN yaw put the nose nearer the position actually reached in ${yaw.better} `
      + `of them and further in ${yaw.worse} (${yaw.ties} level); largest turn `
      + `${yaw.maxTurn.toFixed(3)} rad against a 0.30 clamp.\n`
      + `      Geometric on purpose. Every other check in this suite passes just as happily with the `
      + `yaw correction inverted — the hull still clears the mass, it simply faces the wrong way `
      + `while doing it, which is what the first draft did.\n`
      + `      FALSIFIED 2026-08-25 by flipping the sign in traffic.js's _roadSteerYaw: the same `
      + `sweep read 1 better against 239 worse. This check can go red, and it is the only one here `
      + `that can go red on that particular mistake.`);

    const errs = await evalJSON(S, '(() => ({ n: (window.__errors||[]).length }))()');
    check('S9 the page reported no errors', errs.n === 0, `window.__errors: ${errs.n}`);
  } finally {
    await close();
  }
  console.log(`\n${ok.length}/${ok.length + fail.length} gates pass  →  ${FILE}`);
  if (fail.length) process.exitCode = 1;
}
main();
