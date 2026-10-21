import { RUNWAYS, TAXIWAYS, STANDS, PATTERN_ALT, HOLD_OFFSET, CIRCUIT, headingToVec, threshold, runwayHeadingFor } from '../world/layout.js';

export const circuitSide = (endId) => ((CIRCUIT && CIRCUIT[endId]) === 'R' ? 'right' : 'left');

// ---------- runway ends ----------
const END_CACHE = new Map();
export function runwayEnd(endId) {
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
export const allRunwayEnds = () => RUNWAYS.flatMap((r) => r.ends.map(runwayEnd));

// Runway-frame coordinates: s along the landing direction from the threshold, l lateral (+ = right of the landing direction).
export function toRunway(e, x, z) {
  const dx = x - e.thr[0], dz = z - e.thr[1];
  return { s: dx * e.u[0] + dz * e.u[1], l: dx * -e.u[1] + dz * e.u[0] };
}
export function fromRunway(e, s, l) {
  return [e.thr[0] + e.u[0] * s - e.u[1] * l, e.thr[1] + e.u[1] * s + e.u[0] * l];
}
export function onRunway(x, z, margin = 4) {
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

function segInter(a, b, c, d) {
  const rx = b[0] - a[0], rz = b[1] - a[1], sx = d[0] - c[0], sz = d[1] - c[1];
  const den = rx * sz - rz * sx;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c[0] - a[0]) * sz - (c[1] - a[1]) * sx) / den, u = ((c[0] - a[0]) * rz - (c[1] - a[1]) * rx) / den;
  if (t < -1e-6 || t > 1 + 1e-6 || u < -1e-6 || u > 1 + 1e-6) return null;
  return [t, [a[0] + rx * t, a[1] + rz * t]];
}

function buildGraph() {
  const segs = [];
  for (const tw of TAXIWAYS) for (let i = 1; i < tw.points.length; i++) segs.push({ a: tw.points[i - 1], b: tw.points[i], runway: false, name: tw.id });
  for (const rw of RUNWAYS) segs.push({ a: threshold(rw, rw.ends[0]), b: threshold(rw, rw.ends[1]), runway: true, name: rw.id });
  const taxiSegs = segs.slice();
  const standInfo = {};
  for (const st of STANDS) {
    const [fx, fz] = headingToVec(st.heading), [rx, rz] = headingToVec(st.heading + 90);
    const p = [st.position[0], st.position[2]];
    let best = null;
    for (const s of taxiSegs) {
      if (s.runway) continue;
      const hit = segInter(p, [p[0] + fx * 2000, p[1] + fz * 2000], s.a, s.b);
      if (hit && (!best || hit[0] < best[0])) best = hit;
    }
    if (!best) continue;
    const exit = best[1];
    segs.push({ a: p, b: exit, runway: false, name: st.id, stand: st.id });
    const off = 24;
    const laneBot = [exit[0] + rx * off, exit[1] + rz * off];
    const laneTop = [p[0] + rx * off - fx * 32, p[1] + rz * off - fz * 32];
    segs.push({ a: laneBot, b: laneTop, runway: false, name: st.id + 'in', lane: true });
    standInfo[st.id] = {
      pos: p, heading: st.heading, exit, laneBot, laneTop,
      loop: [[p[0] + rx * 13 - fx * 42, p[1] + rz * 13 - fz * 42], [p[0] - fx * 30, p[1] - fz * 30], [p[0] - fx * 8, p[1] - fz * 8], p],
    };
  }
  // split every segment at every intersection and endpoint touch
  const nodes = new Map();
  const node = (pt) => {
    const k = KEY(pt[0], pt[1]);
    let n = nodes.get(k);
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
          prev.edges.push({ to: n, cost, runway: s.runway, lane: !!s.lane });
          n.edges.push({ to: prev, cost, runway: s.runway, lane: !!s.lane });
        }
      }
      prev = n;
    }
  }
  // hold-short points HOLD_OFFSET m back along each taxiway that meets a threshold
  const holds = {};
  for (const e of allRunwayEnds()) {
    const tn = nodes.get(KEY(e.thr[0], e.thr[1]));
    let h = null;
    if (tn) {
      const ed = tn.edges.find((x) => !x.runway && !x.lane);
      if (ed) {
        const len = Math.hypot(ed.to.x - tn.x, ed.to.z - tn.z), d = Math.min(HOLD_OFFSET ?? 50, len * 0.5);
        h = [tn.x + (ed.to.x - tn.x) / len * d, tn.z + (ed.to.z - tn.z) / len * d];
        const hn = node(h);
        tn.edges = tn.edges.filter((x) => x !== ed);
        ed.to.edges = ed.to.edges.filter((x) => x.to !== tn);
        const c1 = d, c2 = len - d;
        tn.edges.push({ to: hn, cost: c1, runway: false }); hn.edges.push({ to: tn, cost: c1, runway: false });
        hn.edges.push({ to: ed.to, cost: c2, runway: false }); ed.to.edges.push({ to: hn, cost: c2, runway: false });
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
  return { nodes, holds, stands: standInfo };
}

export function taxiGraph() { return GRAPH || (GRAPH = buildGraph()); }

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
export function taxiPath(x, z, heading, dest) {
  const g = taxiGraph();
  let goal, tail = [];
  if (dest.hold) goal = g.holds[dest.hold];
  else if (dest.threshold) goal = runwayEnd(dest.threshold).thr;
  else if (dest.stand) {
    const s = g.stands[dest.stand];
    goal = s.laneBot; tail = [s.laneTop, ...s.loop];
  } else goal = dest.xz;
  const gk = KEY(goal[0], goal[1]);
  if (!g.nodes.has(gk)) return [[x, z], goal, ...tail];
  const ep = nearestEdgePoint(x, z, heading);
  const [hx, hz] = headingToVec(heading ?? 0);
  const backPen = (n) => {
    const fwd = (n.x - ep.p[0]) * hx + (n.z - ep.p[1]) * hz;
    return fwd < -1 ? (ep.runway ? 2000 : 25) : 0;
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

export function holdPoint(endId) { return taxiGraph().holds[endId]; }
export function standInfo(id) { return taxiGraph().stands[id]; }

// ---------- route builders ----------
// A route is { name, legs: [...], loop: index|null }. Legs are plain JSON templates (the autopilot never mutates them):
//   taxi { dest }  hold { end, seconds, untilClear }  takeoff { end }  fly { to:[x,alt,z], speed(kt), flaps }
//   approach { end }  park { seconds }  despawn {}
export const GLIDE_DEG = 4;
export const AIM_DIST = 130;
export const FAF_DIST = 1850;

export function circuitLegs(endId, { alt = PATTERN_ALT, side = circuitSide(endId), width = 1150, speed = 85 } = {}) {
  const e = runwayEnd(endId), sg = side === 'left' ? -1 : 1, L = e.len;
  const p = (s, l, a) => { const [x, z] = fromRunway(e, s, l * sg); return [x, a, z]; };
  return [
    { kind: 'fly', to: p(L + 450, 0, alt * 0.6), speed: 74, flaps: 0, label: 'UPWIND' },
    { kind: 'fly', to: p(L + 750, width * 0.75, alt), speed, flaps: 0, label: 'CROSSWIND' },
    { kind: 'fly', to: p(L * 0.5, width, alt), speed, flaps: 0, label: 'DOWNWIND' },
    { kind: 'fly', to: p(-1450, width, alt * 0.78), speed: 75, flaps: 1 / 3, label: 'DOWNWIND' },
    { kind: 'fly', to: p(-1750, width * 0.35, alt * 0.58), speed: 72, flaps: 1 / 3, label: 'BASE' },
  ];
}

export function circuitRoute(endId = '09', opts = {}) {
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
  };
}

export function departureRoute(endId = '09', { outHeading = null, dist = 9000, alt = 650 } = {}) {
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
export function arrivalRoute(endId = '09', { stand = 'auto', parkSeconds = 25, then = null, ...o } = {}) {
  const c = circuitLegs(endId, o);
  const e = runwayEnd(endId), sg = (o.side || circuitSide(endId)) === 'left' ? -1 : 1, w = o.width || 1150;
  const [jx, jz] = fromRunway(e, e.len + 300, (w + 900) * sg);
  return {
    name: `arrival ${endId}`,
    legs: [
      { kind: 'fly', to: [jx, (o.alt || PATTERN_ALT) + 60, jz], speed: 95, flaps: 0, label: 'INBOUND' },
      ...c.slice(2),
      { kind: 'approach', end: endId, label: 'FINAL' },
      { kind: 'taxi', dest: { stand }, label: 'TAXI IN' },
      { kind: 'park', seconds: parkSeconds, label: 'PARKED' },
      ...(then ? then.legs : []),
    ],
    loop: null,
  };
}

// Turnaround: park → taxi out → depart. Used by attract traffic after arriving.
export function turnaroundRoute(endId = '09', opts = {}) {
  return departureRoute(endId, opts);
}
