// Pure airfield geometry for ATC (and anything else that wants it). XZ = [x, z] world metres.
import * as L from '../world/layout.js';
const { RUNWAYS, TAXIWAYS, TAXIWAY_WIDTH, APRON, TOWER, STANDS, PATTERN_ALT, headingToVec, threshold, runwayHeadingFor } = L;
const HOLD_FROM_CL = L.HOLD_OFFSET ?? 50;

export const G = {
  UPWIND_EXT: 750,        // upwind leg runs this far past the far end before crosswind
  DOWNWIND_OFF: 1150,     // downwind lateral offset from the centreline
  FINAL_LEN: 1800,        // base-to-final turn distance from the threshold
  BASE_ALT: 150,          // altitude at the final turn
  SECONDARY_ALT_STEP: 150, // secondary-runway circuit flies this much higher
  APRON_LANE_Z: APRON.center[2] + APRON.size[1] / 2 - 35,
  EXIT_MIN: 450,          // first usable exit at least this far from the landing threshold
};

const norm360 = (h) => ((h % 360) + 360) % 360;
export const angDiff = (a, b) => { const d = norm360(a - b); return d > 180 ? d - 360 : d; };
const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k];
const dist2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export const runwayById = (id) => RUNWAYS.find((r) => r.id === id);
export const runwayForEnd = (end) => RUNWAYS.find((r) => r.ends.includes(end));
export const ALL_ENDS = RUNWAYS.flatMap((r) => r.ends);

export function endInfo(end) {
  const rw = runwayForEnd(end);
  const heading = runwayHeadingFor(rw, end);
  const T = threshold(rw, end);
  const u = headingToVec(heading);
  const r = headingToVec(heading + 90);
  return { end, rw, heading, T, u, r, length: rw.length, opposite: rw.ends[0] === end ? rw.ends[1] : rw.ends[0] };
}

// Runway-local coords from an end: a = along from threshold, c = right of centreline.
export function toEnd(info, p) {
  const dx = p[0] - info.T[0], dz = p[1] - info.T[1];
  return { a: dx * info.u[0] + dz * info.u[1], c: dx * info.r[0] + dz * info.r[1] };
}

export function onRunway(rw, p, margin = 0) {
  const info = endInfo(rw.ends[0]);
  const { a, c } = toEnd(info, p);
  return Math.abs(c) <= rw.width / 2 + margin && a >= -margin - 5 && a <= rw.length + margin + 5;
}
export function runwayAt(p, margin = 0) { return RUNWAYS.find((rw) => onRunway(rw, p, margin)) || null; }

function segDist(p, a, b) {
  const vx = b[0] - a[0], vz = b[1] - a[1];
  const L2 = vx * vx + vz * vz || 1;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vz) / L2));
  return Math.hypot(p[0] - a[0] - vx * t, p[1] - a[1] - vz * t);
}

export function surfaceAt(p) {
  if (runwayAt(p)) return 'runway';
  for (const tw of TAXIWAYS) for (let i = 1; i < tw.points.length; i++) if (segDist(p, tw.points[i - 1], tw.points[i]) <= TAXIWAY_WIDTH / 2) return 'taxiway';
  if (Math.abs(p[0] - APRON.center[0]) <= APRON.size[0] / 2 && Math.abs(p[1] - APRON.center[2]) <= APRON.size[1] / 2) return 'apron';
  return 'grass';
}

function lineX(p1, d1, p2, d2) {
  const den = d1[0] * d2[1] - d1[1] * d2[0];
  if (Math.abs(den) < 1e-6) return null;
  const t = ((p2[0] - p1[0]) * d2[1] - (p2[1] - p1[1]) * d2[0]) / den;
  return add(p1, d1, t);
}

// Runway-runway centreline intersections.
export const INTERSECTIONS = [];
for (let i = 0; i < RUNWAYS.length; i++) for (let j = i + 1; j < RUNWAYS.length; j++) {
  const A = endInfo(RUNWAYS[i].ends[0]), B = endInfo(RUNWAYS[j].ends[0]);
  const X = lineX(A.T, A.u, B.T, B.u);
  if (!X) continue;
  const a = toEnd(A, X).a, b = toEnd(B, X).a;
  if (a > 0 && a < A.length && b > 0 && b < B.length) INTERSECTIONS.push({ runways: [RUNWAYS[i].id, RUNWAYS[j].id], at: X });
}
export const crossingRunways = (rwId) => INTERSECTIONS.filter((x) => x.runways.includes(rwId)).map((x) => ({ other: x.runways.find((r) => r !== rwId), at: x.at }));

// Taxiway A crossings of runways it isn't a connector for (e.g. A over 04/22).
const TWA = TAXIWAYS.find((t) => t.id === 'A');
const twaZ = TWA.points[0][1];
export const TAXI_CROSSINGS = [];
for (const rw of RUNWAYS) {
  const info = endInfo(rw.ends[0]);
  const X = lineX(TWA.points[0], [1, 0], info.T, info.u);
  if (!X || X[0] < TWA.points[0][0] || X[0] > TWA.points[1][0]) continue;
  const a = toEnd(info, X).a;
  if (a < 0 || a > rw.length) continue;
  const sin = Math.abs(info.u[1]) || 1; // taxiway A runs along x; perpendicular share is |u.z|
  const off = HOLD_FROM_CL / sin;
  TAXI_CROSSINGS.push({ runway: rw.id, at: X, west: [X[0] - off, twaZ], east: [X[0] + off, twaZ] });
}

// Connector stubs onto the main runway (A1..A4): hold point and runway entry.
const MAIN = RUNWAYS[0];
export const CONNECTORS = TAXIWAYS.filter((t) => t.id !== 'A').map((t) => {
  const onRw = t.points.find((p) => onRunway(MAIN, p)) || t.points[1];
  const x = onRw[0];
  return { id: t.id, runway: MAIN.id, x, entry: [x, MAIN.center[2]], hold: [x, MAIN.center[2] - HOLD_FROM_CL], twy: [x, twaZ] };
});

// Ends with a taxi route to their threshold (departure-capable) and how to get there.
export function departurePoint(end) {
  const info = endInfo(end);
  if (info.rw.id !== MAIN.id) return null;
  let best = null;
  for (const c of CONNECTORS) { const d = dist2(c.entry, info.T); if (!best || d < best.d) best = { c, d }; }
  return { connector: best.c.id, hold: best.c.hold, lineUp: info.T, heading: info.heading, end };
}

// Where a lander on `end` turns off, and the route off the runway.
export function exitFor(end, fromA = G.EXIT_MIN) {
  const info = endInfo(end);
  if (info.rw.id === MAIN.id) {
    const opts = CONNECTORS.map((c) => ({ c, a: toEnd(info, c.entry).a })).filter((o) => o.a >= fromA).sort((p, q) => p.a - q.a);
    const o = opts[0] || CONNECTORS.map((c) => ({ c, a: toEnd(info, c.entry).a })).sort((p, q) => q.a - p.a)[0];
    return { via: o.c.id, along: o.a, at: o.c.entry, route: [o.c.entry, o.c.hold], clearAt: o.c.hold };
  }
  const x = TAXI_CROSSINGS.find((k) => k.runway === info.rw.id);
  if (!x) return null;
  return { via: 'A', along: toEnd(info, x.at).a, at: x.at, route: [x.at, x.east], clearAt: x.east, eastbound: true };
}

const apronX = [APRON.center[0] - APRON.size[0] / 2 + 20, APRON.center[0] + APRON.size[0] / 2 - 20];
const clampX = (x) => Math.max(apronX[0], Math.min(apronX[1], x));

function crossingsAlongA(x0, x1) {
  const out = [];
  for (const k of TAXI_CROSSINGS) {
    if (x1 > x0 && k.at[0] > x0 && k.at[0] < x1) out.push({ runway: k.runway, at: k.west, beyond: k.east, x: k.at[0] });
    if (x1 < x0 && k.at[0] < x0 && k.at[0] > x1) out.push({ runway: k.runway, at: k.east, beyond: k.west, x: k.at[0] });
  }
  return out.sort((a, b) => (x1 > x0 ? a.x - b.x : b.x - a.x));
}

// Taxi route from anywhere north of the main runway to the departure hold of `end`.
export function taxiToRunway(from, end) {
  const dp = departurePoint(end);
  if (!dp) return null;
  const route = [from.slice()];
  const onStub = Math.abs(from[0] - dp.hold[0]) < 10 && from[1] > twaZ - 5 && from[1] < dp.hold[1];
  if (onStub) return { route: [from.slice(), dp.hold], holdShort: [{ runway: MAIN.id, at: dp.hold, departure: true }], dest: 'runway', runwayEnd: end, hold: dp.hold, lineUp: dp.lineUp, heading: dp.heading };
  if (Math.abs(from[1] - twaZ) > 5) route.push([from[0], twaZ]);
  const tx = dp.hold[0];
  const holds = crossingsAlongA(from[0], tx).map((k) => ({ runway: k.runway, at: k.at, beyond: k.beyond }));
  route.push([tx, twaZ], dp.hold);
  holds.push({ runway: MAIN.id, at: dp.hold, departure: true });
  return { route: dedupe(route), holdShort: holds, dest: 'runway', runwayEnd: end, hold: dp.hold, lineUp: dp.lineUp, heading: dp.heading };
}

// Taxi route from a runway exit (or anywhere) to a stand. Inbound uses the apron lane, not taxiway A, so
// it never meets departures head-on.
export function taxiToStand(from, stand) {
  const st = STANDS.find((s) => s.id === stand) || STANDS[0];
  const sx = st.position[0], sz = st.position[2];
  const lane = G.APRON_LANE_Z;
  const route = [from.slice()];
  let holds = [];
  if (from[1] > twaZ - 5 && Math.abs(from[0] - clampX(from[0])) > 60) {
    // far east/west on taxiway A: run along it (crossing runways), then up to the apron lane
    const tx = clampX(from[0]);
    route.push([from[0], twaZ]);
    holds = crossingsAlongA(from[0], tx).map((k) => ({ runway: k.runway, at: k.at, beyond: k.beyond }));
    route.push([tx, twaZ], [tx, lane]);
  } else route.push([from[0], twaZ], [from[0], lane]); // straight across taxiway A, never along it
  route.push([sx, lane], [sx, sz]);
  return { route: dedupe(route), holdShort: holds, dest: 'stand', stand: st.id, heading: st.heading };
}

function dedupe(r) { return r.filter((p, i) => i === 0 || dist2(p, r[i - 1]) > 1); }

// Pattern side: circuits always fly on the side away from the tower/terminal.
export function patternSide(end) {
  if (L.CIRCUIT?.[end]) return L.CIRCUIT[end] === 'L' ? -1 : 1;
  const info = endInfo(end);
  const t = toEnd(info, [TOWER.position[0], TOWER.position[2]]);
  return t.c > 0 ? -1 : 1; // -1 = left-hand, +1 = right-hand
}

// Circuit polyline for `end`: [T, upwindEnd, crosswindEnd, baseTurn, finalTurn, T]. extend pushes the base turn out.
export function circuitFor(end, { extend = 0, alt } = {}) {
  const info = endInfo(end);
  const side = patternSide(end);
  const pAlt = alt ?? (info.rw.id === MAIN.id ? PATTERN_ALT : PATTERN_ALT + G.SECONDARY_ALT_STEP);
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

export const LEG_INDEX = { upwind: 0, crosswind: 1, downwind: 2, base: 3, final: 4 };

// Where an aircraft is relative to a circuit: remaining distance to the threshold, leg, cross-track error.
export function circuitProgress(circ, p, heading, hint, agl) {
  const { info, points } = circ;
  const loc = toEnd(info, p);
  // On the (extended) final: aligned, before the threshold.
  if (loc.a <= 50 && loc.a > -9000 && Math.abs(loc.c) < Math.max(120, -loc.a * 0.18) && (heading == null || Math.abs(angDiff(heading, info.heading)) < 50) && (agl == null || agl < 80 + Math.max(0, -loc.a) * 0.15)) {
    return { remaining: Math.max(0, -loc.a), leg: 'final', s: circ.length + Math.min(0, loc.a), xte: Math.abs(loc.c), onFinal: true };
  }
  let best = null;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1].p, b = points[i].p;
    const vx = b[0] - a[0], vz = b[1] - a[1], L = Math.hypot(vx, vz);
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vz) / (L * L)));
    const d = Math.hypot(p[0] - a[0] - vx * t, p[1] - a[1] - vz * t);
    let cost = d;
    if (heading != null) {
      const segH = Math.atan2(vx, -vz) * 180 / Math.PI;
      if (Math.abs(angDiff(heading, segH)) > 100) cost += 600;
    }
    if (hint && points[i - 1].leg === hint) cost -= 150;
    if (!best || cost < best.cost) best = { cost, d, s: points[i - 1].s + t * L, leg: points[i - 1].leg };
  }
  return { remaining: circ.length - best.s, leg: best.leg, s: best.s, xte: best.d, onFinal: false };
}

export function windComponents(end, wind) {
  if (!wind || !wind.kt) return { head: 0, cross: 0 };
  const h = endInfo(end).heading;
  const d = angDiff(wind.from, h) * Math.PI / 180;
  return { head: wind.kt * Math.cos(d), cross: Math.abs(wind.kt * Math.sin(d)) };
}

export { RUNWAYS, TOWER, STANDS, PATTERN_ALT, headingToVec, dist2 };
