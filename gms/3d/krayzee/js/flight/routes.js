import * as L from '../world/layout.js';
import { AIRCRAFT } from '../../data/aircraft.js';

const { headingToVec, threshold, runwayHeadingFor } = L;

// Runway-frame coordinates: s along the landing direction from the threshold, l lateral (+ = right of the landing direction).
export function toRunway(e, x, z) {
  const dx = x - e.thr[0], dz = z - e.thr[1];
  return { s: dx * e.u[0] + dz * e.u[1], l: dx * -e.u[1] + dz * e.u[0] };
}
export function fromRunway(e, s, l) {
  return [e.thr[0] + e.u[0] * s - e.u[1] * l, e.thr[1] + e.u[1] * s + e.u[0] * l];
}

export function segInter(a, b, c, d) {
  const rx = b[0] - a[0], rz = b[1] - a[1], sx = d[0] - c[0], sz = d[1] - c[1];
  const den = rx * sz - rz * sx;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c[0] - a[0]) * sz - (c[1] - a[1]) * sx) / den, u = ((c[0] - a[0]) * rz - (c[1] - a[1]) * rx) / den;
  if (t < -1e-6 || t > 1 + 1e-6 || u < -1e-6 || u > 1 + 1e-6) return null;
  return [t, [a[0] + rx * t, a[1] + rz * t]];
}

export const GLIDE_DEG = 4;
export const AIM_DIST = 130;
export const FAF_DIST = 1900;

// Every runway/taxi/circuit query for one airport def. The module-level exports below are this, bound to the active
// airport (js/world/layout.js) and rebuilt when it changes.
export function makeRoutes(def) {
const RUNWAYS = def.runways, TAXIWAYS = def.taxiways, STANDS = def.stands, APRON = def.aprons?.[0] ?? null;
const PATTERN_ALT = def.patternAlt ?? 300, HOLD_OFFSET = def.holdOffset ?? 50, CIRCUIT = def.circuits || {};
const CIRC = { upwindExt: 750, downwindOff: 1150, finalLen: 1800, ...def.circuit };
const CENTER = def.center || [0, 0];
const depRw = RUNWAYS.find((r) => r.departures !== false && !r.closed) || RUNWAYS[0];
const DEFAULT_END = depRw.ends[0];

const circuitSide = (endId) => ((CIRCUIT && CIRCUIT[endId]) === 'R' ? 'right' : 'left');

// ---------- runway ends ----------
const END_CACHE = new Map();
function runwayEnd(endId) {
  if (endId && typeof endId === 'object') return endId;   // a virtual end object (LAND / FIELD) is already an end
  if (END_CACHE.has(endId)) return END_CACHE.get(endId);
  const rw = RUNWAYS.find((r) => r.ends.includes(endId));
  if (!rw) throw new Error(`no runway end ${endId}`);
  const other = rw.ends[0] === endId ? rw.ends[1] : rw.ends[0];
  const hdg = runwayHeadingFor(rw, endId);
  const [ux, uz] = headingToVec(hdg);
  const e = { id: endId, rw, other, hdg, u: [ux, uz], thr: threshold(rw, endId), far: threshold(rw, other), len: rw.length, width: rw.width, elev: rw.center[1] || 0 };
  END_CACHE.set(endId, e);
  return e;
}
const allRunwayEnds = () => RUNWAYS.flatMap((r) => r.ends.map(runwayEnd));

function onRunway(x, z, margin = 4) {
  for (const rw of RUNWAYS) {
    const e = runwayEnd(rw.ends[0]);
    const p = toRunway(e, x, z);
    if (p.s > -margin && p.s < e.len + margin && Math.abs(p.l) < e.width / 2 + margin) return rw;
  }
  return null;
}

// ---------- taxi graph ----------
let GRAPH = null;
const KEY = (x, z) => `${Math.round(x)},${Math.round(z)}`;

// Where a ray from p along dir first enters the rect { center, size, heading } (m), or null.
function rayIntoRect(p, dir, r) {
  const [ax, az] = headingToVec(90 + (r.heading || 0)), [bx, bz] = headingToVec(180 + (r.heading || 0));
  const qx = p[0] - r.center[0], qz = p[1] - r.center[2];
  let t0 = -Infinity, t1 = Infinity;
  for (const [ux, uz, half] of [[ax, az, r.size[0] / 2], [bx, bz, r.size[1] / 2]]) {
    const o = qx * ux + qz * uz, v = dir[0] * ux + dir[1] * uz;
    if (Math.abs(v) < 1e-9) { if (Math.abs(o) > half) return null; continue; }
    let lo = (-half - o) / v, hi = (half - o) / v;
    if (lo > hi) [lo, hi] = [hi, lo];
    t0 = Math.max(t0, lo); t1 = Math.min(t1, hi);
  }
  return t0 <= t1 && t1 >= 0 ? Math.max(0, t0) : null;
}

function buildGraph() {
  const segs = [];
  for (const tw of TAXIWAYS) for (let i = 1; i < tw.points.length; i++) segs.push({ a: tw.points[i - 1], b: tw.points[i], runway: false, name: tw.id });
  for (const rw of RUNWAYS) segs.push({ a: threshold(rw, rw.ends[0]), b: threshold(rw, rw.ends[1]), runway: true, name: rw.id });
  const taxiSegs = segs.slice();
  const standInfo = {}, hitSeg = {};
  for (const st of STANDS) {
    const [fx, fz] = headingToVec(st.heading);
    const p = [st.position[0], st.position[2]];
    let best = null;
    for (const s of taxiSegs) {
      if (s.runway) continue;
      const hit = segInter(p, [p[0] + fx * 2000, p[1] + fz * 2000], s.a, s.b);
      if (hit && (!best || hit[0] < best[0])) best = [...hit, s];
    }
    if (!best) continue;
    const exit = best[1];
    segs.push({ a: p, b: exit, runway: false, name: st.id, stand: st.id, dir: true }); // stand stubs are taxi-out only
    standInfo[st.id] = { pos: p, heading: st.heading, exit };
    (hitSeg[taxiSegs.indexOf(best[2])] ||= []).push(st);
  }
  // Inbound apron lane per taxiway the stands face: a one-way lane parallel to it, inside the apron, fed by the first
  // connector just past the last stand. Taxi-in never meets taxi-out head-on on the taxiway.
  for (const [si, group] of Object.entries(hitSeg)) {
    const seg = taxiSegs[si], len = Math.hypot(seg.b[0] - seg.a[0], seg.b[1] - seg.a[1]);
    const d = [(seg.b[0] - seg.a[0]) / len, (seg.b[1] - seg.a[1]) / len];
    const [fx, fz] = headingToVec(group[0].heading);
    const along = (q) => (q[0] - seg.a[0]) * d[0] + (q[1] - seg.a[1]) * d[1];
    const at = (s, back) => [seg.a[0] + d[0] * s - fx * back, seg.a[1] + d[1] * s - fz * back];
    const ex0 = standInfo[group[0].id].exit;
    const edge = APRON ? rayIntoRect(ex0, [-fx, -fz], APRON) : null;
    const back = def.inbound?.laneOffset ?? (edge != null ? edge + 35 : 42.5);
    const ss = group.map((st) => along(standInfo[st.id].exit));
    const smax = Math.max(...ss), smin = Math.min(...ss);
    let feed = null;
    for (const o of taxiSegs) {
      if (o.runway || o === seg) continue;
      for (const [P, Q] of [[o.a, o.b], [o.b, o.a]]) {
        const sp = along(P), off = Math.hypot(P[0] - seg.a[0] - d[0] * sp, P[1] - seg.a[1] - d[1] * sp);
        if (off > 1 || sp < smax - 6 || sp > len + 1 || (Q[0] - P[0]) * fx + (Q[1] - P[1]) * fz <= 0) continue;
        if (feed == null || sp < feed) feed = sp;
      }
    }
    if (feed == null) feed = smax + 64;
    for (const st of group) {
      const t = standInfo[st.id], p = t.pos;
      const [sfx, sfz] = headingToVec(st.heading), [rx, rz] = headingToVec(st.heading + 90);
      t.laneBot = at(along(t.exit) - 24, back);
      t.laneTop = [p[0] + rx * 24 - sfx * 32, p[1] + rz * 24 - sfz * 32];
      t.loop = [[p[0] + rx * 13 - sfx * 42, p[1] + rz * 13 - sfz * 42], [p[0] - sfx * 30, p[1] - sfz * 30], [p[0] - sfx * 8, p[1] - sfz * 8], p];
      segs.push({ a: t.laneBot, b: t.laneTop, runway: false, name: st.id + 'in', lane: true });
    }
    segs.push({ a: at(feed, 0), b: at(feed, back), runway: false, name: 'in' + si, dir: true });
    segs.push({ a: at(feed, back), b: at(smin - 24 - 20, back), runway: false, name: 'lane' + si, dir: true });
  }
  // split every segment at every intersection and endpoint touch
  const nodes = new Map();
  const node = (pt) => {
    const k = KEY(pt[0], pt[1]);
    let n = nodes.get(k) || nearNode(nodes, pt[0], pt[1]);
    if (!n) { n = { k, x: pt[0], z: pt[1], edges: [] }; nodes.set(k, n); }
    return n;
  };
  for (const s of segs) {
    const ts = [0, 1];
    for (const o of segs) {
      if (o === s) continue;
      const h = segInter(s.a, s.b, o.a, o.b);
      if (h) ts.push(Math.min(1, Math.max(0, h[0])));
    }
    ts.sort((p, q) => p - q);
    let prev = null;
    for (const t of ts) {
      const n = node([s.a[0] + (s.b[0] - s.a[0]) * t, s.a[1] + (s.b[1] - s.a[1]) * t]);
      if (prev && prev !== n) {
        const len = Math.hypot(n.x - prev.x, n.z - prev.z);
        if (len > 0.5) {
          const cost = len * (s.runway ? 4 : 1);
          prev.edges.push({ to: n, cost, runway: s.runway, lane: !!s.lane, name: s.name });
          if (!s.dir) n.edges.push({ to: prev, cost, runway: s.runway, lane: !!s.lane, name: s.name });
        }
      }
      prev = n;
    }
  }
  // hold-short points HOLD_OFFSET m back along each taxiway that meets a threshold
  const holds = {};
  for (const e of allRunwayEnds()) {
    const tn = nodes.get(KEY(e.thr[0], e.thr[1])) || nearNode(nodes, e.thr[0], e.thr[1]);
    let h = null;
    if (tn) {
      const ed = tn.edges.find((x) => !x.runway && !x.lane);
      if (ed) {
        const len = Math.hypot(ed.to.x - tn.x, ed.to.z - tn.z), d = Math.min(HOLD_OFFSET, len * 0.5);
        h = [tn.x + (ed.to.x - tn.x) / len * d, tn.z + (ed.to.z - tn.z) / len * d];
        const hn = node(h), name = ed.name;
        tn.edges = tn.edges.filter((x) => x !== ed);
        ed.to.edges = ed.to.edges.filter((x) => x.to !== tn);
        const c1 = d, c2 = len - d;
        tn.edges.push({ to: hn, cost: c1, runway: false, name }); hn.edges.push({ to: tn, cost: c1, runway: false, name });
        hn.edges.push({ to: ed.to, cost: c2, runway: false, name }); ed.to.edges.push({ to: hn, cost: c2, runway: false, name });
      }
    }
    if (!h) {
      let best = null, bd = 1e9;
      for (const n of nodes.values()) {
        if (onRunway(n.x, n.z, 10) || n.edges.every((x) => x.runway)) continue;
        const d = Math.hypot(n.x - e.thr[0], n.z - e.thr[1]);
        if (d < bd) { bd = d; best = n; }
      }
      h = best ? [best.x, best.z] : e.thr;
    }
    holds[e.id] = h;
  }
  return { nodes, holds, stands: standInfo, node: (x, z) => nodes.get(KEY(x, z)) || nearNode(nodes, x, z) };
}

function taxiGraph() { return GRAPH || (GRAPH = buildGraph()); }

function nearestEdgePoint(x, z, heading) {
  const g = taxiGraph();
  let best = null;
  const [hx, hz] = heading != null ? headingToVec(heading) : [0, 0];
  for (const n of g.nodes.values()) for (const e of n.edges) {
    if (e.lane) continue;
    const ax = n.x, az = n.z, bx = e.to.x, bz = e.to.z;
    const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
    const px = ax + dx * t, pz = az + dz * t;
    let d = Math.hypot(x - px, z - pz);
    if (e.runway && !onRunway(x, z, 2)) d += 40;
    if (!best || d < best.d) best = { d, a: n, b: e.to, p: [px, pz], runway: e.runway, dir: [dx, dz] };
  }
  return best;
}

function dijkstra(starts, goalKey) {
  const dist = new Map(), prev = new Map(), open = [];
  for (const s of starts) { dist.set(s.n.k, s.c); open.push(s.n); }
  const done = new Set();
  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (dist.get(open[i].k) < dist.get(open[bi].k)) bi = i;
    const n = open.splice(bi, 1)[0];
    if (done.has(n.k)) continue;
    done.add(n.k);
    if (n.k === goalKey) break;
    for (const e of n.edges) {
      if (e.lane && e.to.k !== goalKey && n.k !== goalKey) {
        // lanes only lead to their own stand loop, never used as through routes
        if (!e.to.edges.some((x) => !x.lane)) continue;
      }
      const nd = dist.get(n.k) + e.cost;
      if (nd < (dist.get(e.to.k) ?? Infinity)) { dist.set(e.to.k, nd); prev.set(e.to.k, n); open.push(e.to); }
    }
  }
  if (!dist.has(goalKey)) return null;
  const path = [];
  let k = goalKey, n = taxiGraph().nodes.get(goalKey);
  while (n) { path.unshift([n.x, n.z]); n = prev.get(n.k); }
  return path;
}

// Points from (x,z) to a destination: { hold: endId } | { threshold: endId } | { stand: id } | { xz: [x,z] }.
function taxiPath(x, z, heading, dest) {
  const g = taxiGraph();
  let goal, tail = [];
  if (dest.hold) goal = g.holds[dest.hold];
  else if (dest.threshold) goal = runwayEnd(dest.threshold).thr;
  else if (dest.stand) {
    const s = g.stands[dest.stand];
    goal = s.laneBot; tail = [s.laneTop, ...s.loop];
  } else goal = dest.xz;
  const gn = g.node(goal[0], goal[1]);
  if (!gn) return [[x, z], goal, ...tail];
  const gk = gn.k;
  const ep = nearestEdgePoint(x, z, heading);
  const [hx, hz] = heading != null ? headingToVec(heading) : [0, 0];
  const backPen = (n) => {
    const fwd = (n.x - ep.p[0]) * hx + (n.z - ep.p[1]) * hz;
    return fwd < -1 ? (ep.runway ? (fwd > -60 ? 150 : 2000) : 25) : 0; // on a runway only a short U-turn back to an exit
  };
  const dA = Math.hypot(ep.a.x - ep.p[0], ep.a.z - ep.p[1]), dB = Math.hypot(ep.b.x - ep.p[0], ep.b.z - ep.p[1]);
  const m = ep.runway ? 4 : 1;
  const path = dijkstra([{ n: ep.a, c: dA * m + backPen(ep.a) }, { n: ep.b, c: dB * m + backPen(ep.b) }], gk);
  if (!path) return [[x, z], goal, ...tail];
  const pts = [[x, z]];
  if (ep.d > 3) pts.push(ep.p);
  for (const p of path) if (Math.hypot(p[0] - pts[pts.length - 1][0], p[1] - pts[pts.length - 1][1]) > 1) pts.push(p);
  return pts.concat(tail);
}

function holdPoint(endId) { return taxiGraph().holds[endId]; }

// Where a taxiway meets the runway of `endId` (incl. its threshold), with the runway left ahead: [{ x, z, s, left }].
function runwayEntries(endId) {
  const e = runwayEnd(endId), out = [];
  for (const n of taxiGraph().nodes.values()) {
    if (!n.edges.some((x) => x.runway) || !n.edges.some((x) => !x.runway && !x.lane)) continue;
    const p = toRunway(e, n.x, n.z);
    if (Math.abs(p.l) > 2 || p.s < -2 || p.s > e.len) continue;
    out.push({ x: n.x, z: n.z, s: Math.max(0, p.s), left: e.len - Math.max(0, p.s) });
  }
  return out.sort((a, b) => a.s - b.s);
}
function standInfo(id) { return taxiGraph().stands[id]; }

// ---------- route builders ----------
// A route is { name, legs: [...], loop: index|null }. Legs are plain JSON templates (the autopilot never mutates them):
//   taxi { dest }  hold { end, seconds, untilClear }  takeoff { end }  fly { to:[x,alt,z], speed(kt), flaps }
//   approach { end }  park { seconds }  despawn {}

// Slower types fly a lower, tighter circuit (roster patternAltM / circuitScale) inside the C172's: pass { type }.
function circuitOpts(type) {
  const a = type && type !== 'c172' ? AIRCRAFT[type] : null;
  const k = a?.circuitScale ?? 1;   // alt ~ scale²: tiger ~217 m, bathtub ~147 m, vertically clear of each other's downwinds
  return a?.flight ? { alt: Math.min(a.patternAltM ?? PATTERN_ALT, Math.round(PATTERN_ALT * k * k)), width: Math.round(CIRC.downwindOff * k) } : {};
}
const withType = (o = {}) => (o.type ? { ...circuitOpts(o.type), ...o } : o);
const circOf = (o = {}) => { const c = {}; for (const k of ['type', 'alt', 'width', 'side']) if (o[k] != null) c[k] = o[k]; return Object.keys(c).length ? c : undefined; };

function circuitLegs(endId, opts = {}) {
  const { alt = PATTERN_ALT, side = circuitSide(endId), width = CIRC.downwindOff, speed = 85 } = withType(opts);
  const e = runwayEnd(endId), sg = side === 'left' ? -1 : 1, L = e.len, up = CIRC.upwindExt, fin = CIRC.finalLen;
  const p = (s, l, a) => { const [x, z] = fromRunway(e, s, l * sg); return [x, a, z]; };
  const gp = (s) => (alt < PATTERN_ALT ? Math.max(e.elev + (AIM_DIST - s) * Math.tan(GLIDE_DEG * Math.PI / 180), 0) : 0); // low circuits: base not below the glide path
  return [
    { kind: 'fly', to: p(L + up - 300, 0, alt * 0.6), speed: 74, flaps: 0, label: 'UPWIND' },
    { kind: 'fly', to: p(L + up, width * 0.75, alt), speed, flaps: 0, label: 'CROSSWIND' },
    { kind: 'fly', to: p(L * 0.5, width, alt), speed, flaps: 0, label: 'DOWNWIND' },
    { kind: 'fly', to: p(300 - fin, width, Math.max(alt * 0.78, gp(300 - fin))), speed: 75, flaps: 1 / 3, label: 'DOWNWIND', end: endId, ext: true },
    { kind: 'fly', to: p(-fin, width * 0.35, Math.max(alt * 0.55, gp(-fin))), speed: 72, flaps: 1 / 3, label: 'BASE', end: endId, ext: true },
  ];
}

function circuitRoute(endId = DEFAULT_END, opts = {}) {
  return {
    name: `circuits ${endId}`,
    legs: [
      { kind: 'takeoff', end: endId, label: 'TAKEOFF' },
      ...circuitLegs(endId, opts),
      { kind: 'approach', end: endId, label: 'FINAL' },
      { kind: 'taxi', dest: { hold: endId }, label: 'TAXI' },
      { kind: 'hold', end: endId, seconds: opts.holdSeconds ?? 4, untilClear: true, label: 'HOLD SHORT' },
    ],
    loop: 0,
    circ: circOf(opts),
  };
}

function departureRoute(endId = DEFAULT_END, { outHeading = null, dist = 9000, alt = 650 } = {}) {
  const e = runwayEnd(endId);
  const hdg = outHeading ?? (e.hdg + (Math.random() < 0.5 ? -50 : 40));
  const [dx, dz] = headingToVec(hdg);
  const [x1, z1] = fromRunway(e, e.len + 600, 0);
  return {
    name: `departure ${endId}`,
    legs: [
      { kind: 'taxi', dest: { hold: endId }, label: 'TAXI' },
      { kind: 'hold', end: endId, seconds: 3, untilClear: true, label: 'HOLD SHORT' },
      { kind: 'takeoff', end: endId, label: 'TAKEOFF' },
      { kind: 'fly', to: [x1, 220, z1], speed: 76, flaps: 0, label: 'CLIMB OUT' },
      { kind: 'fly', to: [x1 + dx * dist * 0.4, alt * 0.8, z1 + dz * dist * 0.4], speed: 95, flaps: 0, label: 'DEPARTING' },
      { kind: 'fly', to: [x1 + dx * dist, alt, z1 + dz * dist], speed: 105, flaps: 0, label: 'DEPARTING' },
      { kind: 'despawn', label: 'GONE' },
    ],
    loop: null,
  };
}

// Arrival from wherever the plane is: join downwind at 45°, land, taxi to a stand, park.
// From the far side (`from` = [x, z]) it first crosses the extended centreline well beyond the upwind end, high, so it
// never cuts through the final approach or the field.
function arrivalRoute(endId = DEFAULT_END, { stand = 'auto', parkSeconds = 25, then = null, from = null, ...o0 } = {}) {
  const o = withType(o0);
  const c = circuitLegs(endId, o);
  const e = runwayEnd(endId), sg = (o.side || circuitSide(endId)) === 'left' ? -1 : 1, w = o.width || CIRC.downwindOff;
  const alt = o.alt || PATTERN_ALT;
  const [jx, jz] = fromRunway(e, e.len + 300, (w + 900) * sg);
  const far = from && toRunway(e, from[0], from[1]).l * sg < 200;
  const [cx, cz] = fromRunway(e, e.len + 1500, 0);
  return {
    name: `arrival ${endId}`,
    legs: [
      ...(far ? [{ kind: 'fly', to: [cx, alt + 150, cz], speed: 95, flaps: 0, label: 'INBOUND' }] : []),
      { kind: 'fly', to: [jx, alt + 60, jz], speed: 95, flaps: 0, label: 'INBOUND' },
      ...c.slice(2),
      { kind: 'approach', end: endId, label: 'FINAL' },
      { kind: 'taxi', dest: { stand }, label: 'TAXI IN' },
      { kind: 'park', seconds: parkSeconds, label: 'PARKED' },
      ...(then ? then.legs : []),
    ],
    loop: null,
    circ: circOf(o0),
  };
}

// Active-runway change: the same kind of route for `end`, and the leg index to carry on from (null = leave it alone).
function rerouteRunway(route, i, { onGround, x = 0, z = 0 }, end) {
  const name = route?.name || '', legs = route?.legs || [];
  if (name.startsWith('circuits')) {
    const c = circuitRoute(end, route.circ || {});
    return { route: { ...c, laps: route.laps }, i: onGround ? c.legs.findIndex((l) => l.kind === 'taxi') : 1 };
  }
  const pk = legs.findIndex((l) => l.kind === 'park' && l.label !== 'BOARDING');
  const dep = departureRoute(end);
  if (name.startsWith('arrival')) {
    const ai = legs.findIndex((l) => l.kind === 'approach');
    if (!onGround && i <= ai) return { route: arrivalRoute(end, { ...(route.circ || {}), stand: 'auto', parkSeconds: legs[pk]?.seconds ?? 25, then: dep, from: [x, z] }), i: 0 };
    if (pk < 0 || !onGround) return null;
    return { route: { ...route, legs: [...legs.slice(0, pk + 1), ...dep.legs] }, i: Math.min(i, pk + 1) };
  }
  if (name.startsWith('departure')) {
    const ti = legs.findIndex((l) => l.kind === 'takeoff');
    if (!onGround || i > ti) return null;
    const lead = legs[0]?.kind === 'park' ? [legs[0]] : [];
    return { route: { ...dep, legs: [...lead, ...dep.legs] }, i: i === 0 && lead.length ? 0 : lead.length };
  }
  return null;
}

// Turnaround: park → taxi out → depart. Used by attract traffic after arriving.
function turnaroundRoute(endId = DEFAULT_END, opts = {}) {
  return departureRoute(endId, opts);
}

// Where and how an AI plane of `kind` starts: { place, route, stand }. Kinds: parked|depart (at a stand, then departs),
// downwind, final (dist), arrive (5 km out, random bearing), circuits (at the hold, touch-and-goes forever).
// `rnd` lets node harnesses stay deterministic; `claimStand(prefer)` returns a free stand id or null.
// speedScale: the aircraft type's speed vs the C172 (aircraft.js typeSpeedScale) for the airborne start speeds.
// type: the aircraft type (its circuit + start speeds); speedScale overrides the speed ratio vs the C172.
function aiSpawn(kind, endId, { rnd = Math.random, claimStand = () => null, stand, wait, dist, laps, type = null, speedScale } = {}) {
  const fl = type && AIRCRAFT[type]?.flight, ct = type ? { type } : {};
  const e = runwayEnd(endId), KTS = 0.514444 * (speedScale ?? (fl ? fl.vcruise / (95 * 0.514444) : 1));
  if (kind === 'parked' || kind === 'depart') {
    const sid = stand || claimStand();
    if (!sid) return null;
    const s = standInfo(sid);
    const r = departureRoute(endId, { outHeading: e.hdg + (rnd() < 0.5 ? -50 : 40) });
    return { stand: sid, place: { x: s.pos[0], z: s.pos[1], heading: s.heading }, route: { ...r, legs: [{ kind: 'park', seconds: wait ?? 4 + rnd() * 20, label: 'BOARDING' }, ...r.legs] } };
  }
  const then = departureRoute(endId, { outHeading: e.hdg + (rnd() < 0.5 ? -50 : 40) });
  if (kind === 'downwind') {
    const legs = circuitLegs(endId, ct), d = legs[2].to, c = legs[1].to;
    const r = arrivalRoute(endId, { ...ct, stand: 'auto', parkSeconds: 15 + rnd() * 20, then });
    return { place: { x: (c[0] + d[0]) / 2, z: (c[2] + d[2]) / 2, alt: 300, heading: (e.hdg + 180) % 360, speed: 85 * KTS, throttle: 0.6 }, route: { ...r, legs: r.legs.slice(1) } };
  }
  if (kind === 'final') {
    const D = dist || 2600, [x, z] = fromRunway(e, -D, 0);
    const r = arrivalRoute(endId, { ...ct, stand: 'auto', parkSeconds: 20 + rnd() * 20, then });
    return { place: { x, z, alt: D * 0.07 + 10, heading: e.hdg, speed: 68 * KTS, throttle: 0.4, flaps: 1 }, route: { ...r, legs: r.legs.filter((l) => l.kind !== 'fly') } };
  }
  if (kind === 'holding') {
    // a rival already at the hold, about to go (spawned to give the player someone to push in front of)
    const h = holdPoint(endId), r = departureRoute(endId, { outHeading: e.hdg + (rnd() < 0.5 ? -50 : 40) });
    const hd = Math.atan2(e.thr[0] - h[0], -(e.thr[1] - h[1])) * 180 / Math.PI;
    return { place: { x: h[0], z: h[1], heading: (hd + 360) % 360 }, route: { ...r, legs: r.legs.filter((l) => l.kind !== 'taxi') } };
  }
  if (kind === 'circuits') {
    const h = holdPoint(endId);
    const c = circuitRoute(endId, ct);
    const legs = [{ kind: 'hold', end: endId, seconds: 2, untilClear: true, label: 'HOLD SHORT' }, ...c.legs];
    return { place: { x: h[0], z: h[1], heading: (e.hdg + 90) % 360 }, route: { ...c, legs, loop: 1, laps } };
  }
  const a = rnd() * Math.PI * 2, R = 5000, x = CENTER[0] + Math.cos(a) * R, z = CENTER[1] + Math.sin(a) * R;
  return { place: { x, z, alt: 420, heading: (Math.atan2(CENTER[0] - x, z - CENTER[1]) * 180 / Math.PI + 360) % 360, speed: 95 * KTS, throttle: 0.6 }, route: arrivalRoute(endId, { ...ct, stand: 'auto', parkSeconds: 20 + rnd() * 30, then, from: [x, z] }) };
}

return {
  def, circuitSide, runwayEnd, allRunwayEnds, onRunway, taxiGraph, taxiPath, holdPoint, runwayEntries, standInfo,
  circuitOpts, circuitLegs, circuitRoute, departureRoute, arrivalRoute, rerouteRunway, turnaroundRoute, aiSpawn,
};
}

function nearNode(nodes, x, z) {
  for (const n of nodes.values()) if (Math.abs(n.x - x) < 0.6 && Math.abs(n.z - z) < 0.6) return n;
  return null;
}

// ---------- the active airport ----------
let CUR = null;
export const currentRoutes = () => CUR || (CUR = makeRoutes(L.AIRPORT));
L.onLayoutChange(() => { CUR = null; });

export const circuitSide = (endId) => currentRoutes().circuitSide(endId);
export const runwayEnd = (endId) => currentRoutes().runwayEnd(endId);
export const allRunwayEnds = () => currentRoutes().allRunwayEnds();
export const onRunway = (x, z, margin) => currentRoutes().onRunway(x, z, margin);
export const taxiGraph = () => currentRoutes().taxiGraph();
export const taxiPath = (x, z, heading, dest) => currentRoutes().taxiPath(x, z, heading, dest);
export const holdPoint = (endId) => currentRoutes().holdPoint(endId);
export const runwayEntries = (endId) => currentRoutes().runwayEntries(endId);
export const standInfo = (id) => currentRoutes().standInfo(id);
export const circuitOpts = (type) => currentRoutes().circuitOpts(type);
export const circuitLegs = (endId, opts) => currentRoutes().circuitLegs(endId, opts);
export const circuitRoute = (endId, opts) => currentRoutes().circuitRoute(endId, opts);
export const departureRoute = (endId, opts) => currentRoutes().departureRoute(endId, opts);
export const arrivalRoute = (endId, opts) => currentRoutes().arrivalRoute(endId, opts);
export const rerouteRunway = (route, i, st, end) => currentRoutes().rerouteRunway(route, i, st, end);
export const turnaroundRoute = (endId, opts) => currentRoutes().turnaroundRoute(endId, opts);
export const aiSpawn = (kind, endId, opts) => currentRoutes().aiSpawn(kind, endId, opts);

