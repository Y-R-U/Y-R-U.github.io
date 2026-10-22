// Pure airfield geometry for ATC (and anything else that wants it). XZ = [x, z] world metres.
// makeGeometry(def) works for any airport def (docs/AIRPORTS.md §3). Holds, entries, crossings and exits come from the
// taxi graph js/flight/routes.js builds, so ATC and the autopilots agree on where the lines are. The module-level
// exports are makeGeometry(active airport), rebuilt when js/world/layout.js switches airport.
import * as L from '../world/layout.js';
import { currentRoutes, makeRoutes, segInter } from '../flight/routes.js';

const { headingToVec, threshold, runwayHeadingFor } = L;

const norm360 = (h) => ((h % 360) + 360) % 360;
export const angDiff = (a, b) => { const d = norm360(a - b); return d > 180 ? d - 360 : d; };
const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k];
export const dist2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const LEG_INDEX = { upwind: 0, crosswind: 1, downwind: 2, base: 3, final: 4 };

function segDist(p, a, b) {
  const vx = b[0] - a[0], vz = b[1] - a[1];
  const L2 = vx * vx + vz * vz || 1;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vz) / L2));
  return Math.hypot(p[0] - a[0] - vx * t, p[1] - a[1] - vz * t);
}
function lineX(p1, d1, p2, d2) {
  const den = d1[0] * d2[1] - d1[1] * d2[0];
  if (Math.abs(den) < 1e-6) return null;
  const t = ((p2[0] - p1[0]) * d2[1] - (p2[1] - p1[1]) * d2[0]) / den;
  return add(p1, d1, t);
}
// Inside a { center, size, heading } footprint (heading 0 = size[0] along +X).
export function inFootprint(r, p) {
  if (!r) return false;
  if (!r.heading) return Math.abs(p[0] - r.center[0]) <= r.size[0] / 2 && Math.abs(p[1] - r.center[2]) <= r.size[1] / 2;
  const [ax, az] = headingToVec(90 + r.heading), [bx, bz] = headingToVec(180 + r.heading);
  const qx = p[0] - r.center[0], qz = p[1] - r.center[2];
  return Math.abs(qx * ax + qz * az) <= r.size[0] / 2 && Math.abs(qx * bx + qz * bz) <= r.size[1] / 2;
}

export function makeGeometry(def, routes = makeRoutes(def)) {
  const RUNWAYS = def.runways, TAXIWAYS = def.taxiways, TAXIWAY_WIDTH = def.taxiwayWidth ?? 15;
  const APRONS = def.aprons || [], TOWER = def.tower, TERMINAL = def.terminal, STANDS = def.stands;
  const PATTERN_ALT = def.patternAlt ?? 300, HOLD_FROM_CL = def.holdOffset ?? 50, CIRCUIT = def.circuits || {};
  const CENTER = def.center || [0, 0], WIND = def.wind || { from: 270, kt: 8 };
  const C = { upwindExt: 750, downwindOff: 1150, finalLen: 1800, baseAlt: 150, secondaryAltStep: 150, ...def.circuit };
  const G = {
    UPWIND_EXT: C.upwindExt,        // upwind leg runs this far past the far end before crosswind
    DOWNWIND_OFF: C.downwindOff,    // downwind lateral offset from the centreline
    FINAL_LEN: C.finalLen,          // base-to-final turn distance from the threshold
    BASE_ALT: C.baseAlt,            // altitude at the final turn
    SECONDARY_ALT_STEP: C.secondaryAltStep, // arrivals-only runways' circuits fly this much higher
    EXIT_MIN: def.exitMin ?? 450,   // first usable exit at least this far from the landing threshold
  };

  const runwayById = (id) => RUNWAYS.find((r) => r.id === id);
  const runwayForEnd = (end) => RUNWAYS.find((r) => r.ends.includes(end));
  const ALL_ENDS = RUNWAYS.flatMap((r) => r.ends);
  // departures: false = arrivals only; oneWay: { land, depart } restricts the ends per operation.
  const departs = (rw, end) => rw.departures !== false && (!rw.oneWay || rw.oneWay.depart === end);

  function endInfo(end) {
    const rw = runwayForEnd(end);
    const heading = runwayHeadingFor(rw, end);
    const T = threshold(rw, end);
    const u = headingToVec(heading);
    const r = headingToVec(heading + 90);
    return { end, rw, heading, T, u, r, length: rw.length, opposite: rw.ends[0] === end ? rw.ends[1] : rw.ends[0] };
  }

  // Runway-local coords from an end: a = along from threshold, c = right of centreline.
  function toEnd(info, p) {
    const dx = p[0] - info.T[0], dz = p[1] - info.T[1];
    return { a: dx * info.u[0] + dz * info.u[1], c: dx * info.r[0] + dz * info.r[1] };
  }

  function onRunway(rw, p, margin = 0) {
    const info = endInfo(rw.ends[0]);
    const { a, c } = toEnd(info, p);
    return Math.abs(c) <= rw.width / 2 + margin && a >= -margin - 5 && a <= rw.length + margin + 5;
  }
  const runwayAt = (p, margin = 0) => RUNWAYS.find((rw) => onRunway(rw, p, margin)) || null;

  function surfaceAt(p) {
    if (runwayAt(p)) return 'runway';
    for (const tw of TAXIWAYS) for (let i = 1; i < tw.points.length; i++) if (segDist(p, tw.points[i - 1], tw.points[i]) <= TAXIWAY_WIDTH / 2) return 'taxiway';
    if (APRONS.some((a) => inFootprint(a, p))) return 'apron';
    return 'grass';
  }
  const overTerminal = (p) => inFootprint(TERMINAL, p);

  // Runway-runway centreline intersections.
  const INTERSECTIONS = [];
  for (let i = 0; i < RUNWAYS.length; i++) for (let j = i + 1; j < RUNWAYS.length; j++) {
    const A = endInfo(RUNWAYS[i].ends[0]), B = endInfo(RUNWAYS[j].ends[0]);
    const X = lineX(A.T, A.u, B.T, B.u);
    if (!X) continue;
    const a = toEnd(A, X).a, b = toEnd(B, X).a;
    if (a > 0 && a < A.length && b > 0 && b < B.length) INTERSECTIONS.push({ runways: [RUNWAYS[i].id, RUNWAYS[j].id], at: X });
  }
  const crossingRunways = (rwId) => INTERSECTIONS.filter((x) => x.runways.includes(rwId)).map((x) => ({ other: x.runways.find((r) => r !== rwId), at: x.at }));

  // Hold line on a taxi direction `dir` (unit) that crosses runway `rw` at X: HOLD_FROM_CL from the centreline.
  const holdOff = (rw, dir) => {
    const u = endInfo(rw.ends[0]).u;
    return HOLD_FROM_CL / Math.max(Math.abs(dir[0] * u[1] - dir[1] * u[0]), 0.3);
  };

  // Every place a taxiway meets a runway centreline (taxi graph nodes): one hold per side of the runway.
  // An entry has one side (a stub ending on the runway), a crossing has both.
  const JUNCTIONS = [];
  for (const n of routes.taxiGraph().nodes.values()) {
    const taxi = n.edges.filter((e) => !e.runway && !e.lane);
    if (!taxi.length) continue;
    for (const rw of RUNWAYS) {
      const info = endInfo(rw.ends[0]);
      const loc = toEnd(info, [n.x, n.z]);
      if (Math.abs(loc.c) > 1 || loc.a < -1 || loc.a > rw.length + 1) continue;
      const sides = {};
      for (const e of taxi) {
        const len = Math.hypot(e.to.x - n.x, e.to.z - n.z) || 1, dir = [(e.to.x - n.x) / len, (e.to.z - n.z) / len];
        const sin = Math.abs(dir[0] * info.u[1] - dir[1] * info.u[0]);
        if (sin < 0.2) continue;
        const k = dir[0] * info.r[0] + dir[1] * info.r[1] > 0 ? 'R' : 'L';
        if (sides[k] && sides[k].sin >= sin) continue;
        sides[k] = { sin, name: e.name, hold: add([n.x, n.z], dir, Math.min(holdOff(rw, dir), len)) };
      }
      const list = Object.values(sides);
      if (!list.length) continue;
      const name = list.find((s) => s.name)?.name ?? null;
      JUNCTIONS.push({ runway: rw.id, at: [n.x, n.z], a: loc.a, name, holds: list.map((s) => s.hold), crossing: list.length === 2 });
    }
  }
  const CONNECTORS = JUNCTIONS.filter((j) => !j.crossing).map((j) => ({ id: j.name, runway: j.runway, entry: j.at, hold: j.holds[0] }));
  const TAXI_CROSSINGS = JUNCTIONS.filter((j) => j.crossing).map((j) => ({ runway: j.runway, at: j.at, via: j.name, sides: j.holds }));

  // Ends with a taxi route to their threshold (departure-capable) and how to get there.
  function departurePoint(end) {
    const info = endInfo(end);
    if (!departs(info.rw, end)) return null;
    const hold = routes.holdPoint(end);
    if (!hold) return null;
    let best = null;
    for (const j of JUNCTIONS) if (j.runway === info.rw.id) for (const h of j.holds) { const d = dist2(h, hold); if (!best || d < best.d) best = { j, d }; }
    return { connector: best?.j.name ?? null, hold, lineUp: info.T, heading: info.heading, end };
  }

  // Where a lander on `end` turns off, and the route off the runway. A crossing taxiway is left on the side nearer
  // `toward` (normally the active departure hold). thenRunway: an arrivals-only runway's lander taxis to the active hold.
  function exitFor(end, fromA = G.EXIT_MIN, toward = null) {
    const info = endInfo(end);
    const js = JUNCTIONS.filter((j) => j.runway === info.rw.id).map((j) => ({ j, a: toEnd(info, j.at).a }));
    if (!js.length) return null;
    const o = js.filter((x) => x.a >= fromA).sort((p, q) => p.a - q.a)[0] || js.sort((p, q) => q.a - p.a)[0];
    let clearAt = o.j.holds[0];
    if (o.j.holds.length > 1 && toward) clearAt = o.j.holds.reduce((b, h) => (dist2(h, toward) < dist2(b, toward) ? h : b));
    return { via: o.j.name, along: o.a, at: o.j.at, route: [o.j.at, clearAt], clearAt, thenRunway: !departs(info.rw, info.rw.ends[0]) && !departs(info.rw, info.rw.ends[1]) };
  }

  // Runways a taxi polyline crosses (not the one it starts on), each with the hold before and the point beyond.
  function crossingsAlong(pts) {
    const out = [];
    const here = runwayAt(pts[0], 10);
    for (let k = 1; k < pts.length; k++) {
      const a = pts[k - 1], b = pts[k], len = dist2(a, b);
      if (len < 0.01) continue;
      const dir = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
      for (const rw of RUNWAYS) {
        if (rw === here) continue;
        const h = segInter(a, b, threshold(rw, rw.ends[0]), threshold(rw, rw.ends[1]));
        if (!h || (k === pts.length - 1 && h[0] > 0.97)) continue;
        if (out.some((c) => c.runway === rw.id && dist2(c.x, h[1]) < 15)) continue;
        const off = holdOff(rw, dir);
        out.push({ runway: rw.id, at: add(h[1], dir, -off), beyond: add(h[1], dir, off), x: h[1] });
      }
    }
    return out.map(({ runway, at, beyond }) => ({ runway, at, beyond }));
  }

  // Taxi route (the same graph path the autopilot takes) to the departure hold of `end`.
  function taxiToRunway(from, end, heading = null) {
    const dp = departurePoint(end);
    if (!dp) return null;
    const route = dedupe(routes.taxiPath(from[0], from[1], heading, { hold: end }));
    const holds = crossingsAlong(route);
    holds.push({ runway: endInfo(end).rw.id, at: dp.hold, departure: true });
    return { route, holdShort: holds, dest: 'runway', runwayEnd: end, hold: dp.hold, lineUp: dp.lineUp, heading: dp.heading };
  }

  // Taxi route to a stand (via the inbound apron lane, so it never meets departures head-on).
  function taxiToStand(from, stand, heading = null) {
    const st = STANDS.find((s) => s.id === stand) || STANDS[0];
    const route = dedupe(routes.taxiPath(from[0], from[1], heading, { stand: st.id }));
    return { route, holdShort: crossingsAlong(route), dest: 'stand', stand: st.id, heading: st.heading };
  }

  // Pattern side: the airport's circuit table, else the side away from the tower.
  function patternSide(end) {
    if (CIRCUIT[end]) return CIRCUIT[end] === 'L' ? -1 : 1;
    const info = endInfo(end);
    const t = toEnd(info, [TOWER.position[0], TOWER.position[2]]);
    return t.c > 0 ? -1 : 1; // -1 = left-hand, +1 = right-hand
  }

  // Circuit polyline for `end`: [T, upwindEnd, crosswindEnd, baseTurn, finalTurn, T]. extend pushes the base turn out.
  function circuitFor(end, { extend = 0, alt } = {}) {
    const info = endInfo(end);
    const side = patternSide(end);
    const pAlt = alt ?? (departs(info.rw, end) || departs(info.rw, info.opposite) ? PATTERN_ALT : PATTERN_ALT + G.SECONDARY_ALT_STEP);
    const off = info.r.map((v) => v * side * G.DOWNWIND_OFF);
    const C1 = add(info.T, info.u, info.length + G.UPWIND_EXT);
    const C2 = add(C1, off);
    const C4 = add(info.T, info.u, -(G.FINAL_LEN + extend));
    const C3 = add(C4, off);
    const pts = [
      { p: info.T, alt: 0, leg: 'upwind' },
      { p: C1, alt: pAlt, leg: 'crosswind' },
      { p: C2, alt: pAlt, leg: 'downwind' },
      { p: C3, alt: pAlt, leg: 'base' },
      { p: C4, alt: G.BASE_ALT, leg: 'final' },
      { p: info.T, alt: 0, leg: 'end' },
    ];
    let s = 0;
    for (let i = 0; i < pts.length; i++) { if (i) s += dist2(pts[i].p, pts[i - 1].p); pts[i].s = s; }
    return { end, side: side < 0 ? 'left' : 'right', alt: pAlt, points: pts, length: s, info, extend };
  }

  // Where an aircraft is relative to a circuit: remaining distance to the threshold, leg, cross-track error.
  function circuitProgress(circ, p, heading, hint, agl) {
    const { info, points } = circ;
    const loc = toEnd(info, p);
    // On the (extended) final: aligned, before the threshold.
    if (loc.a <= 50 && loc.a > -9000 && Math.abs(loc.c) < Math.max(120, -loc.a * 0.18) && (heading == null || Math.abs(angDiff(heading, info.heading)) < 50) && (agl == null || agl < 80 + Math.max(0, -loc.a) * 0.15)) {
      return { remaining: Math.max(0, -loc.a), leg: 'final', s: circ.length + Math.min(0, loc.a), xte: Math.abs(loc.c), onFinal: true };
    }
    let best = null;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1].p, b = points[i].p;
      const vx = b[0] - a[0], vz = b[1] - a[1], Ln = Math.hypot(vx, vz);
      const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vz) / (Ln * Ln)));
      const d = Math.hypot(p[0] - a[0] - vx * t, p[1] - a[1] - vz * t);
      let cost = d;
      if (heading != null) {
        const segH = Math.atan2(vx, -vz) * 180 / Math.PI;
        if (Math.abs(angDiff(heading, segH)) > 100) cost += 600;
      }
      if (hint && points[i - 1].leg === hint) cost -= 150;
      if (!best || cost < best.cost) best = { cost, d, s: points[i - 1].s + t * Ln, leg: points[i - 1].leg };
    }
    return { remaining: circ.length - best.s, leg: best.leg, s: best.s, xte: best.d, onFinal: false };
  }

  function windComponents(end, wind) {
    if (!wind || !wind.kt) return { head: 0, cross: 0 };
    const h = endInfo(end).heading;
    const d = angDiff(wind.from, h) * Math.PI / 180;
    return { head: wind.kt * Math.cos(d), cross: Math.abs(wind.kt * Math.sin(d)) };
  }

  return {
    def, routes, G, CENTER, WIND, RUNWAYS, TOWER, TERMINAL, STANDS, PATTERN_ALT, ALL_ENDS, INTERSECTIONS, JUNCTIONS, CONNECTORS, TAXI_CROSSINGS,
    runwayById, runwayForEnd, departs, endInfo, toEnd, onRunway, runwayAt, surfaceAt, overTerminal, crossingRunways,
    departurePoint, exitFor, crossingsAlong, taxiToRunway, taxiToStand, patternSide, circuitFor, circuitProgress, windComponents,
    angDiff, dist2, headingToVec, LEG_INDEX,
  };
}

function dedupe(r) { return r.filter((p, i) => i === 0 || dist2(p, r[i - 1]) > 1); }

// ---------- the active airport (live bindings; createATC({ geo }) takes an explicit makeGeometry instead) ----------
let GEO = null;
export let G, CENTER, WIND, RUNWAYS, TOWER, TERMINAL, STANDS, PATTERN_ALT, ALL_ENDS, INTERSECTIONS, JUNCTIONS, CONNECTORS, TAXI_CROSSINGS;
function refresh() {
  GEO = makeGeometry(L.AIRPORT, currentRoutes());
  ({ G, CENTER, WIND, RUNWAYS, TOWER, TERMINAL, STANDS, PATTERN_ALT, ALL_ENDS, INTERSECTIONS, JUNCTIONS, CONNECTORS, TAXI_CROSSINGS } = GEO);
}
refresh();
L.onLayoutChange(refresh);
export const currentGeometry = () => GEO;
export const runwayById = (id) => GEO.runwayById(id);
export const runwayForEnd = (end) => GEO.runwayForEnd(end);
export const departs = (rw, end) => GEO.departs(rw, end);
export const endInfo = (end) => GEO.endInfo(end);
export const toEnd = (info, p) => GEO.toEnd(info, p);
export const onRunway = (rw, p, margin) => GEO.onRunway(rw, p, margin);
export const runwayAt = (p, margin) => GEO.runwayAt(p, margin);
export const surfaceAt = (p) => GEO.surfaceAt(p);
export const overTerminal = (p) => GEO.overTerminal(p);
export const crossingRunways = (rwId) => GEO.crossingRunways(rwId);
export const departurePoint = (end) => GEO.departurePoint(end);
export const exitFor = (end, fromA, toward) => GEO.exitFor(end, fromA, toward);
export const crossingsAlong = (pts) => GEO.crossingsAlong(pts);
export const taxiToRunway = (from, end, heading) => GEO.taxiToRunway(from, end, heading);
export const taxiToStand = (from, stand, heading) => GEO.taxiToStand(from, stand, heading);
export const patternSide = (end) => GEO.patternSide(end);
export const circuitFor = (end, o) => GEO.circuitFor(end, o);
export const circuitProgress = (circ, p, heading, hint, agl) => GEO.circuitProgress(circ, p, heading, hint, agl);
export const windComponents = (end, wind) => GEO.windComponents(end, wind);
export { headingToVec };
