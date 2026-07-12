// LONGSHOT — external ballistics. Pure math on {x,y,z} objects (no THREE),
// so node can unit-test drop/drift/solver directly (tools/test_ballistics.mjs).
//
// Model: quadratic drag against air-relative velocity (so crosswind pushes the
// round downwind), constant gravity. Integrated at 240 Hz with per-step
// segment hit tests against people (head sphere + torso capsule), building
// AABBs, glass panes and the ground.

export const DEFAULTS = { g: 9.81, dragK: 0.0005, step: 1 / 240, maxFlight: 6 };

const v3 = (x = 0, y = 0, z = 0) => ({ x, y, z });
const add = (a, b) => v3(a.x + b.x, a.y + b.y, a.z + b.z);
const sub = (a, b) => v3(a.x - b.x, a.y - b.y, a.z - b.z);
const scale = (a, s) => v3(a.x * s, a.y * s, a.z * s);
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const len = (a) => Math.sqrt(dot(a, a));
const norm = (a) => scale(a, 1 / (len(a) || 1));

// closest point parameter on segment ab for point p
function segT(p, a, b) {
  const ab = sub(b, a);
  const t = dot(sub(p, a), ab) / (dot(ab, ab) || 1);
  return t < 0 ? 0 : t > 1 ? 1 : t;
}
// segment p0p1 vs sphere {c,r} → earliest hit t in [0,1] or -1
function segSphere(p0, p1, c, r) {
  const d = sub(p1, p0), m = sub(p0, c);
  const a = dot(d, d), b = 2 * dot(m, d), cc = dot(m, m) - r * r;
  if (cc <= 0) return 0;
  const disc = b * b - 4 * a * cc;
  if (disc < 0 || a === 0) return -1;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return (t >= 0 && t <= 1) ? t : -1;
}
// segment vs vertical capsule (axis a→b, radius r): sampled — the capsule is
// short relative to the step length, so 8 point-tests are plenty.
function segCapsule(p0, p1, a, b, r) {
  let best = -1;
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    const p = add(p0, scale(sub(p1, p0), t));
    const s = segT(p, a, b);
    const q = add(a, scale(sub(b, a), s));
    if (len(sub(p, q)) <= r) { best = t; break; }
  }
  return best;
}
// slab test: segment vs AABB {minX,maxX,minZ,maxZ,h} (y: 0..h) → t or -1
function segAABB(p0, p1, box) {
  const d = sub(p1, p0);
  let tmin = 0, tmax = 1;
  const axes = [
    [p0.x, d.x, box.minX, box.maxX],
    [p0.y, d.y, 0, box.h],
    [p0.z, d.z, box.minZ, box.maxZ],
  ];
  for (const [o, dd, lo, hi] of axes) {
    if (Math.abs(dd) < 1e-9) { if (o < lo || o > hi) return -1; continue; }
    let t1 = (lo - o) / dd, t2 = (hi - o) / dd;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return -1;
  }
  return tmin > 0 ? tmin : -1;
}
// segment vs bounded pane {centre, nrm, w, h} → {t, point} or null
function segPane(p0, p1, g) {
  const d = sub(p1, p0);
  const denom = dot(d, g.nrm);
  if (Math.abs(denom) < 1e-9) return null;
  const t = dot(sub(g.centre, p0), g.nrm) / denom;
  if (t < 0 || t > 1) return null;
  const p = add(p0, scale(d, t));
  const rel = sub(p, g.centre);
  const up = v3(0, 1, 0);
  const right = norm(v3(g.nrm.z, 0, -g.nrm.x));
  if (Math.abs(dot(rel, right)) > g.w / 2 || Math.abs(dot(rel, up)) > g.h / 2) return null;
  return { t, point: p };
}

// ── the shot ─────────────────────────────────────────────────────────────────
// opts: { v0, wind:{x,z}, dragK, g, step, maxFlight, ap, heavy,
//         people:[{person,head:{c,r},torso:{a,b,r}}], buildings:[], glass:[],
//         groundY, rng }
export function simulate(origin, dir, opts = {}) {
  const g = opts.g ?? DEFAULTS.g;
  const k = opts.dragK ?? DEFAULTS.dragK;
  const dt = opts.step ?? DEFAULTS.step;
  const maxT = opts.maxFlight ?? DEFAULTS.maxFlight;
  const wind = v3(opts.wind?.x || 0, 0, opts.wind?.z || 0);
  const rand = opts.rng || Math.random;
  let pos = v3(origin.x, origin.y, origin.z);
  let vel = scale(norm(v3(dir.x, dir.y, dir.z)), opts.v0 || 700);
  let d = norm(vel);

  const path = [{ x: pos.x, y: pos.y, z: pos.z, t: 0, v: len(vel) }];
  const events = [];
  const people = opts.people || [];
  const buildings = opts.buildings || [];
  const glass = opts.glass || [];
  const holes = opts.holes || [];
  const groundY = opts.groundY ?? 0;
  const inHole = (p) => holes.some(h =>
    p.x >= h.minX && p.x <= h.maxX && p.y >= h.minY && p.y <= h.maxY && p.z >= h.minZ && p.z <= h.maxZ);

  let t = 0, dist = 0, sampleAcc = 0;
  while (t < maxT) {
    // integrate
    const vr = sub(vel, wind);
    const sp = len(vr);
    const acc = add(scale(vr, -k * sp), v3(0, -g, 0));
    vel = add(vel, scale(acc, dt));
    const p1 = add(pos, scale(vel, dt));
    t += dt;

    // Hit tests on this segment. People MOVE while the round is in the air —
    // that is the entire point of a lead — so each collider is displaced by its
    // own velocity × time-of-flight-so-far, not frozen at the muzzle.
    let hit = null;
    for (const c of people) {
      const v = c.vel;
      const ox = v ? v.x * t : 0, oy = v ? (v.y || 0) * t : 0, oz = v ? v.z * t : 0;
      const hc = v ? v3(c.head.c.x + ox, c.head.c.y + oy, c.head.c.z + oz) : c.head.c;
      const th = segSphere(pos, p1, hc, c.head.r);
      if (th >= 0 && (!hit || th < hit.t)) hit = { t: th, type: 'head', person: c.person };
      const ta = v ? v3(c.torso.a.x + ox, c.torso.a.y + oy, c.torso.a.z + oz) : c.torso.a;
      const tb = v ? v3(c.torso.b.x + ox, c.torso.b.y + oy, c.torso.b.z + oz) : c.torso.b;
      const tt = segCapsule(pos, p1, ta, tb, c.torso.r);
      if (tt >= 0 && (!hit || tt < hit.t)) hit = { t: tt, type: 'torso', person: c.person };
    }
    for (const gl of glass) {
      if (gl.broken) continue;
      const hg = segPane(pos, p1, gl);
      if (hg && (!hit || hg.t < hit.t)) hit = { t: hg.t, type: 'glass', glass: gl, point: hg.point };
    }
    for (const b of buildings) {
      const tb = segAABB(pos, p1, b);
      if (tb >= 0 && (!hit || tb < hit.t)) hit = { t: tb, type: 'building', building: b };
    }
    if (p1.y <= groundY) {
      const tg = (pos.y - groundY) / Math.max(1e-9, pos.y - p1.y);
      if (!hit || tg < hit.t) hit = { t: tg, type: 'ground' };
    }

    if (hit) {
      const hp = add(pos, scale(sub(p1, pos), hit.t));
      if (hit.type === 'building' && inHole(add(hp, scale(norm(vel), 0.1)))) {
        // facade AABB hit inside a carved room — sail on through the opening
        pos = add(hp, scale(norm(vel), 0.12));
        path.push({ x: pos.x, y: pos.y, z: pos.z, t, v: len(vel) });
        continue;
      }
      if (hit.type === 'glass') {
        // glass always shatters; FMJ deflects a touch, AP/heavy fly true
        events.push({ type: 'glass', point: hp, glass: hit.glass });
        hit.glass.broken = true;
        if (!(opts.ap || opts.heavy)) {
          const dev = 0.006 + rand() * 0.006;    // 6–12 mrad wobble
          const a1 = (rand() - 0.5) * 2 * dev, a2 = (rand() - 0.5) * 2 * dev;
          d = norm(vel);
          const right = norm(v3(d.z, 0, -d.x));
          vel = scale(norm(add(add(d, scale(right, a1)), v3(0, a2, 0))), len(vel) * 0.92);
        }
        pos = add(hp, scale(norm(vel), 0.01));
        path.push({ x: hp.x, y: hp.y, z: hp.z, t, v: len(vel) });
        continue;                                 // keep flying
      }
      dist += len(sub(hp, pos));
      path.push({ x: hp.x, y: hp.y, z: hp.z, t, v: len(vel) });
      return {
        path, events, dist, tof: t,
        hit: { ...hit, point: hp, dir: norm(vel) },
      };
    }

    dist += len(sub(p1, pos));
    pos = p1;
    sampleAcc += dt;
    if (sampleAcc >= 1 / 60) { sampleAcc = 0; path.push({ x: pos.x, y: pos.y, z: pos.z, t, v: len(vel) }); }
  }
  path.push({ x: pos.x, y: pos.y, z: pos.z, t, v: len(vel) });
  return { path, events, dist, tof: t, hit: { type: 'none', point: pos, dir: norm(vel) } };
}

// ── straight-line raycast (rangefinder / hitscan checks) ─────────────────────
export function raycast(origin, dir, opts = {}, _depth = 0) {
  const max = opts.max || 3000;
  const d = norm(dir);
  const p1 = add(origin, scale(d, max));
  let hit = null;
  for (const c of opts.people || []) {
    const th = segSphere(origin, p1, c.head.c, c.head.r);
    if (th >= 0 && (!hit || th < hit.t)) hit = { t: th, type: 'head', person: c.person };
    const tt = segCapsule(origin, p1, c.torso.a, c.torso.b, c.torso.r);
    if (tt >= 0 && (!hit || tt < hit.t)) hit = { t: tt, type: 'torso', person: c.person };
  }
  for (const g of opts.glass || []) {
    if (g.broken) continue;
    const hg = segPane(origin, p1, g);
    if (hg && (!hit || hg.t < hit.t)) hit = { t: hg.t, type: 'glass', glass: g };
  }
  for (const b of opts.buildings || []) {
    const tb = segAABB(origin, p1, b);
    if (tb >= 0 && (!hit || tb < hit.t)) hit = { t: tb, type: 'building', building: b };
  }
  const gy = opts.groundY ?? 0;
  if (origin.y > gy && d.y < 0) {
    const tg = (origin.y - gy) / -d.y / max;
    if (tg <= 1 && (!hit || tg < hit.t)) hit = { t: tg, type: 'ground' };
  }
  if (!hit) return { type: 'none', dist: max, point: p1 };
  const point = add(origin, scale(d, hit.t * max));
  // building face inside a carved room: continue past the opening
  if (hit.type === 'building' && _depth < 3 && (opts.holes || []).some(h => {
    const p = add(point, scale(d, 0.1));
    return p.x >= h.minX && p.x <= h.maxX && p.y >= h.minY && p.y <= h.maxY && p.z >= h.minZ && p.z <= h.maxZ;
  })) {
    const from = add(point, scale(d, 0.12));
    const rest = raycast(from, d, { ...opts, max: max - hit.t * max - 0.12 }, _depth + 1);
    return { ...rest, dist: hit.t * max + 0.12 + rest.dist };
  }
  return { ...hit, dist: hit.t * max, point };
}

// ── holdover table: drop + drift-per-(m/s wind) sampled every 25 m ──────────
// One straight level shot; offsets measured against the launch line. Cheap
// lookups drive the smart-scope dot and the HUD holdover hint.
export function buildTable(opts) {
  const res = simulate({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 },
    { ...opts, wind: { x: 0, z: 0 }, groundY: -1e9, maxFlight: 8, people: [], buildings: [], glass: [] });
  const resW = simulate({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 },
    { ...opts, wind: { x: 1, z: 0 }, groundY: -1e9, maxFlight: 8, people: [], buildings: [], glass: [] });
  const ranges = [], drop = [], driftPerWind = [], tof = [];
  const at = (path, z) => {
    for (let j = 1; j < path.length; j++) {
      if (path[j].z >= z) {
        const a = path[j - 1], b = path[j];
        const f = (z - a.z) / Math.max(1e-9, b.z - a.z);
        return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, t: a.t + (b.t - a.t) * f };
      }
    }
    return null;
  };
  for (let z = 25; z <= 1500; z += 25) {
    const p = at(res.path, z), pw = at(resW.path, z);
    if (!p || !pw) break;
    ranges.push(z); drop.push(-p.y); driftPerWind.push(pw.x); tof.push(p.t);
  }
  const look = (arr, r) => {
    if (!ranges.length) return 0;
    const i = Math.min(ranges.length - 1, Math.max(0, r / 25 - 1));
    const lo = Math.floor(i), hi = Math.min(ranges.length - 1, lo + 1), f = i - lo;
    return arr[lo] + (arr[hi] - arr[lo]) * f;
  };
  return {
    ranges, drop, driftPerWind, tof,
    dropAt: (r) => look(drop, r),
    driftAt: (r, wind) => look(driftPerWind, r) * wind,
    tofAt: (r) => look(tof, r),
  };
}

// ── firing solution ──────────────────────────────────────────────────────────
// Iteratively find the aim direction that lands on `target` given drop+drift.
// Returns { dir, tof, drop, drift } — drop/drift in metres at the target,
// relative to the straight line of sight (what the HUD holdover shows).
export function solve(origin, target, opts = {}) {
  const los = sub(target, origin);
  const range = len(los);
  let aim = { x: target.x, y: target.y, z: target.z };
  let out = null;
  for (let i = 0; i < 4; i++) {
    const dir = norm(sub(aim, origin));
    const res = simulate(origin, dir, { ...opts, people: [], buildings: [], glass: [], groundY: -1e9, maxFlight: 8 });
    // interpolate the path crossing of the target range along LOS
    const losN = norm(los);
    let best = res.path[res.path.length - 1], bestT = best.t;
    for (let j = 1; j < res.path.length; j++) {
      const a = res.path[j - 1], b = res.path[j];
      const aa = dot(sub(a, origin), losN), bb = dot(sub(b, origin), losN);
      if (bb >= range) {
        const f = (range - aa) / Math.max(1e-9, bb - aa);
        best = add(a, scale(sub(b, a), f));
        bestT = a.t + (b.t - a.t) * f;
        break;
      }
    }
    const missY = target.y - best.y;
    const right = norm(v3(losN.z, 0, -losN.x));
    const missX = dot(sub(target, best), right);
    aim = add(aim, v3(right.x * missX, missY, right.z * missX));
    out = { tof: bestT, missY, missX };
    if (Math.abs(missY) < 0.02 && Math.abs(missX) < 0.02) break;
  }
  const dir = norm(sub(aim, origin));
  // drop/drift = how far the corrected aim point sits from the target
  const losN = norm(los);
  const right = norm(v3(losN.z, 0, -losN.x));
  const off = sub(aim, target);
  return { dir, tof: out.tof, drop: off.y, drift: dot(off, right), range };
}
