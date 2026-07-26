// The circuit, and the coordinate system the entire game is played in.
//
// A car's authoritative position is (s, t, h): distance along the centreline,
// offset across it, height above the surface. That one decision buys almost
// everything the brief asks for — loops need no special case (the road's own
// frame is upside down at the top and the car just follows it), the barriers
// are a clamp on |t|, "steer yourself straight again" is a decay on the heading
// error, and the AI's racing line is a function that returns a t.
//
// Frames are built by parallel transport along the spline, so the road never
// spins about its own axis except where a track deliberately banks it.

import * as THREE from 'three';
import { clamp, wrap, wrapDiff, lerp, angDiff } from './utils.js';
import { ROAD_HALF, GRAVITY, LOOP } from './config.js';

const SPACING = 2.0;              // metres between frames — uniform, so lookups are O(1)

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _m = new THREE.Matrix4();

export class Track {
  constructor(def) {
    this.def = def;
    this.id = def.id;
    this.name = def.name;
    this.env = def.env || 'noon';

    this.buildFrames(def);
    this.buildFeatures(def);
  }

  // -------------------------------------------------------------------------
  // Geometry
  // -------------------------------------------------------------------------
  buildFrames(def) {
    const pts = def.points.map((p) => new THREE.Vector3(p.x, p.y, p.z));
    const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal', 0.5);

    // Arc-length resample: walk the curve finely, then step off uniform metres.
    const fine = Math.max(600, def.points.length * 26);
    const raw = curve.getPoints(fine);          // fine+1 points, last == first
    const cum = [0];
    for (let i = 1; i < raw.length; i++) cum.push(cum[i - 1] + raw[i].distanceTo(raw[i - 1]));
    const total = cum[cum.length - 1];

    const count = Math.max(32, Math.round(total / SPACING));
    const step = total / count;                  // ~SPACING, adjusted to close exactly
    this.spacing = step;
    this.length = total;
    this.count = count;

    const pos = [];
    let j = 0;
    for (let i = 0; i < count; i++) {
      const target = i * step;
      while (j < cum.length - 2 && cum[j + 1] < target) j++;
      const seg = cum[j + 1] - cum[j] || 1e-6;
      const f = clamp((target - cum[j]) / seg, 0, 1);
      pos.push(raw[j].clone().lerp(raw[j + 1], f));
    }

    // Tangents from central differences of the resampled ring.
    const tan = pos.map((p, i) => {
      const a = pos[(i - 1 + count) % count];
      const b = pos[(i + 1) % count];
      return b.clone().sub(a).normalize();
    });

    // Parallel transport an up vector around the ring. Starting up is whatever
    // is closest to world +Y and perpendicular to the first tangent.
    const up = new Array(count);
    let u = new THREE.Vector3(0, 1, 0);
    if (Math.abs(tan[0].y) > 0.95) u.set(0, 0, 1);
    u.sub(tan[0].clone().multiplyScalar(u.dot(tan[0]))).normalize();
    up[0] = u.clone();
    for (let i = 1; i < count; i++) {
      const prevT = tan[i - 1], nextT = tan[i];
      const v = up[i - 1].clone();
      // Project onto the plane perpendicular to the new tangent (rotation
      // minimising: no twist beyond what the curve itself forces).
      v.sub(nextT.clone().multiplyScalar(v.dot(nextT)));
      if (v.lengthSq() < 1e-8) v.copy(prevT).cross(nextT).normalize();
      up[i] = v.normalize();
    }

    // Closed-curve holonomy: the transported frame rarely lands back on itself.
    // Spread the residual twist evenly rather than leaving a step at the seam.
    const closeErr = signedTwist(up[count - 1], up[0], tan[0]);
    for (let i = 0; i < count; i++) {
      const k = (i / count) * closeErr;
      up[i].applyAxisAngle(tan[i], -k);
    }

    // Per-control-point authored values, resampled onto frames.
    const bank = resampleAttr(def.points, count, 'bank', 0);
    const width = resampleAttr(def.points, count, 'width', def.width || ROAD_HALF);
    const railL = resampleAttrDiscrete(def.points, count, 'railL', def.rail || 'rail');
    const railR = resampleAttrDiscrete(def.points, count, 'railR', def.rail || 'rail');
    const kind = resampleAttrDiscrete(def.points, count, 'kind', 'road');

    // Apply banking as a roll about the tangent.
    for (let i = 0; i < count; i++) {
      if (bank[i]) up[i].applyAxisAngle(tan[i], bank[i]);
    }

    const right = tan.map((t, i) => t.clone().cross(up[i]).normalize());

    // Curvature (about up) and pitch rate (about right), both per metre.
    const curv = new Float32Array(count);
    const pitch = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const a = tan[i], b = tan[(i + 1) % count];
      _v1.copy(a).cross(b);
      const ang = Math.asin(clamp(_v1.length(), -1, 1));
      if (ang > 1e-7) {
        _v1.normalize().multiplyScalar(ang);
        curv[i] = -_v1.dot(up[i]) / step;
        pitch[i] = _v1.dot(right[i]) / step;
      }
    }
    // Light smoothing — resampling noise reads as steering twitch otherwise.
    smoothRing(curv, 3);
    smoothRing(pitch, 3);

    this.pos = pos;
    this.tan = tan;
    this.up = up;
    this.right = right;
    this.bank = bank;
    this.width = width;
    this.curv = curv;
    this.pitch = pitch;
    this.railL = railL;
    this.railR = railR;
    this.kind = kind;

    // Bounding info for cameras and the minimap.
    const box = new THREE.Box3().setFromPoints(pos);
    this.bounds = box;
    this.center = box.getCenter(new THREE.Vector3());
    this.radius = box.getSize(new THREE.Vector3()).length() * 0.5;

    // Where is the road upside down? Used by the loop rule and the HUD.
    this.inverted = new Uint8Array(count);
    for (let i = 0; i < count; i++) this.inverted[i] = up[i].y < 0.12 ? 1 : 0;
  }

  // -------------------------------------------------------------------------
  // Features: boost pads, jumps, crates, broadcast cameras
  // -------------------------------------------------------------------------
  buildFeatures(def) {
    this.pads = (def.pads || []).map((p) => ({ ...p }));
    this.jumps = (def.jumps || []).map((p) => ({ ...p }));
    this.crates = (def.crates || []).map((p, i) => ({ ...p, id: i, taken: 0 }));
    this.cams = (def.cams || []).map((c) => ({ ...c }));
    this.startS = def.startS || 0;

    // s-bucketed index so per-frame lookups stay cheap on a 3km circuit.
    this.bucketSize = 40;
    this.buckets = new Map();
    const add = (s, item) => {
      const b = Math.floor(wrap(s, this.length) / this.bucketSize);
      if (!this.buckets.has(b)) this.buckets.set(b, []);
      this.buckets.get(b).push(item);
    };
    for (const p of this.pads) add(p.s, { type: 'pad', ref: p });
    for (const c of this.crates) add(c.s, { type: 'crate', ref: c });
    for (const j of this.jumps) add(j.s, { type: 'jump', ref: j });
  }

  nearFeatures(s, out = []) {
    out.length = 0;
    const b = Math.floor(wrap(s, this.length) / this.bucketSize);
    const n = Math.ceil(this.length / this.bucketSize);
    for (let k = -1; k <= 1; k++) {
      const arr = this.buckets.get(((b + k) % n + n) % n);
      if (arr) out.push(...arr);
    }
    return out;
  }

  // -------------------------------------------------------------------------
  // Queries. `s` may be any real number; it wraps.
  // -------------------------------------------------------------------------
  idx(s) {
    return wrap(s / this.spacing, this.count);
  }

  frameAt(s, out = {}) {
    const fi = this.idx(s);
    const i0 = Math.floor(fi);
    const f = fi - i0;
    const i1 = (i0 + 1) % this.count;

    out.p = (out.p || new THREE.Vector3()).copy(this.pos[i0]).lerp(this.pos[i1], f);
    out.tan = (out.tan || new THREE.Vector3()).copy(this.tan[i0]).lerp(this.tan[i1], f).normalize();
    out.up = (out.up || new THREE.Vector3()).copy(this.up[i0]).lerp(this.up[i1], f).normalize();
    out.right = (out.right || new THREE.Vector3()).copy(out.tan).cross(out.up).normalize();
    out.width = lerp(this.width[i0], this.width[i1], f);
    out.curv = lerp(this.curv[i0], this.curv[i1], f);
    out.pitch = lerp(this.pitch[i0], this.pitch[i1], f);
    out.bank = lerp(this.bank[i0], this.bank[i1], f);
    out.inverted = out.up.y < 0.12;
    out.railL = this.railL[i0];
    out.railR = this.railR[i0];
    out.kind = this.kind[i0];
    out.i = i0;
    return out;
  }

  curvatureAt(s) {
    const fi = this.idx(s);
    const i0 = Math.floor(fi);
    return lerp(this.curv[i0], this.curv[(i0 + 1) % this.count], fi - i0);
  }

  widthAt(s) {
    const fi = this.idx(s);
    const i0 = Math.floor(fi);
    return lerp(this.width[i0], this.width[(i0 + 1) % this.count], fi - i0);
  }

  upAt(s, out = new THREE.Vector3()) {
    const fi = this.idx(s);
    const i0 = Math.floor(fi);
    return out.copy(this.up[i0]).lerp(this.up[(i0 + 1) % this.count], fi - i0).normalize();
  }

  // World position of a track-space point.
  worldAt(s, t, h = 0, out = new THREE.Vector3()) {
    const fi = this.idx(s);
    const i0 = Math.floor(fi);
    const f = fi - i0;
    const i1 = (i0 + 1) % this.count;
    out.copy(this.pos[i0]).lerp(this.pos[i1], f);
    _v1.copy(this.right[i0]).lerp(this.right[i1], f).normalize().multiplyScalar(t);
    _v2.copy(this.up[i0]).lerp(this.up[i1], f).normalize().multiplyScalar(h);
    return out.add(_v1).add(_v2);
  }

  // Orientation of a body sitting on the road at s, yawed by psi about the
  // surface normal, with optional extra roll/pitch of its own.
  quatAt(s, psi = 0, out = new THREE.Quaternion(), roll = 0, pitchExtra = 0) {
    const fi = this.idx(s);
    const i0 = Math.floor(fi);
    const f = fi - i0;
    const i1 = (i0 + 1) % this.count;

    _v1.copy(this.tan[i0]).lerp(this.tan[i1], f).normalize();      // forward
    _v2.copy(this.up[i0]).lerp(this.up[i1], f).normalize();        // up
    _v3.copy(_v1).cross(_v2).normalize();                           // right

    if (psi) {
      _v1.applyAxisAngle(_v2, -psi);
      _v3.copy(_v1).cross(_v2).normalize();
    }
    if (roll) {
      _v2.applyAxisAngle(_v1, roll);
      _v3.copy(_v1).cross(_v2).normalize();
    }
    if (pitchExtra) {
      _v1.applyAxisAngle(_v3, pitchExtra);
      _v2.copy(_v3).cross(_v1).normalize();
    }

    // Model space: forward is -Z, up is +Y, right is +X.
    _m.makeBasis(_v3, _v2, _v1.clone().negate());
    return out.setFromRotationMatrix(_m);
  }

  // Project a world point back onto the track. `hintS` keeps the search local,
  // which matters on circuits that fold back on themselves.
  nearestS(p, hintS = null, span = 160) {
    let bestI = 0, bestD = Infinity;
    if (hintS == null) {
      for (let i = 0; i < this.count; i++) {
        const d = this.pos[i].distanceToSquared(p);
        if (d < bestD) { bestD = d; bestI = i; }
      }
    } else {
      const c = Math.round(this.idx(hintS));
      const r = Math.ceil(span / this.spacing);
      for (let k = -r; k <= r; k++) {
        const i = ((c + k) % this.count + this.count) % this.count;
        const d = this.pos[i].distanceToSquared(p);
        if (d < bestD) { bestD = d; bestI = i; }
      }
    }
    // Refine against the two neighbouring segments.
    const i0 = bestI;
    const prev = (i0 - 1 + this.count) % this.count;
    const next = (i0 + 1) % this.count;
    const a = projectOnSeg(this.pos[prev], this.pos[i0], p);
    const b = projectOnSeg(this.pos[i0], this.pos[next], p);
    let s;
    if (a.d <= b.d) s = (prev + a.t) * this.spacing;
    else s = (i0 + b.t) * this.spacing;
    s = wrap(s, this.length);

    // Lateral offset, signed along the frame's right vector.
    const fi = this.idx(s);
    const j = Math.floor(fi);
    _v1.copy(p).sub(this.pos[j]);
    const t = _v1.dot(this.right[j]);
    const h = _v1.dot(this.up[j]);
    return { s, t, h };
  }

  // Signed along-track distance from a to b (shortest way round).
  delta(a, b) {
    return wrapDiff(a, b, this.length);
  }

  // Total progress used for race positions: laps * length + s.
  progressOf(car) {
    return car.lap * this.length + car.s;
  }

  // Is there a loop coming up, and how fast do you need to be going to get
  // round the outside of it? Read by the AI (which will not lift for one) and
  // by the HUD (which shouts at you if you are too slow).
  loopAhead(s, dist = 160) {
    // A non-finite distance here used to spin forever. Callers pass a value
    // derived from car speed, and speed is not allowed to be trusted.
    const d = Number.isFinite(dist) ? clamp(dist, 10, this.length) : 160;
    const n = Math.ceil(d / this.spacing);
    const start = Math.floor(this.idx(s));
    for (let k = 0; k < n; k++) {
      const i = (start + k) % this.count;
      if (this.kind[i] !== 'loop') continue;
      const kDist = k * this.spacing;
      let maxP = 0;
      for (let j = 0; j < 120; j++) {
        const m = (i + j) % this.count;
        if (this.kind[m] !== 'loop') break;
        maxP = Math.max(maxP, Math.abs(this.pitch[m]));
      }
      const radius = maxP > 1e-4 ? 1 / maxP : 24;
      // Energy to climb 2R against the (arcade-reduced) gravity, plus enough
      // left at the top to keep the wheels loaded.
      const minSpeed = Math.sqrt(4 * GRAVITY * LOOP.gravity * radius + LOOP.downforce * radius);
      return { dist: kDist, radius, minSpeed, index: i };
    }
    return null;
  }

  // A conservative "how fast can a car take the next N metres" estimate. Used
  // by the AI, by the corner-braking assist and by the HUD's corner warning.
  speedLimitAhead(s, distance, grip, look = 6) {
    let limit = Infinity;
    const d = Number.isFinite(distance) ? clamp(distance, 10, this.length) : 80;
    const stepN = Math.max(1, Math.min(400, Math.round(d / (this.spacing * look))));
    for (let k = 0; k <= stepN; k++) {
      const ss = s + (k / stepN) * distance;
      const c = Math.abs(this.curvatureAt(ss));
      if (c < 1e-5) continue;
      const v = Math.sqrt(grip / c);
      if (v < limit) limit = v;
    }
    return limit;
  }
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
function projectOnSeg(a, b, p) {
  _v1.copy(b).sub(a);
  const len2 = _v1.lengthSq() || 1e-6;
  _v2.copy(p).sub(a);
  const t = clamp(_v2.dot(_v1) / len2, 0, 1);
  _v3.copy(a).addScaledVector(_v1, t);
  return { t, d: _v3.distanceToSquared(p) };
}

function signedTwist(from, to, axis) {
  const a = from.clone().sub(axis.clone().multiplyScalar(from.dot(axis))).normalize();
  const b = to.clone().sub(axis.clone().multiplyScalar(to.dot(axis))).normalize();
  const cosA = clamp(a.dot(b), -1, 1);
  const ang = Math.acos(cosA);
  const cross = a.clone().cross(b);
  return cross.dot(axis) < 0 ? -ang : ang;
}

// Control-point attributes are authored sparsely; carry the last value forward
// and smooth the transitions so banking eases in rather than snapping.
function resampleAttr(points, count, key, dflt) {
  const n = points.length;
  const src = points.map((p) => (p[key] != null ? p[key] : dflt));
  const out = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const f = (i / count) * n;
    const i0 = Math.floor(f) % n;
    const i1 = (i0 + 1) % n;
    out[i] = lerp(src[i0], src[i1], f - Math.floor(f));
  }
  smoothRing(out, Math.max(4, Math.round(count / n)));
  return out;
}

function resampleAttrDiscrete(points, count, key, dflt) {
  const n = points.length;
  const src = points.map((p) => (p[key] != null ? p[key] : dflt));
  const out = new Array(count);
  for (let i = 0; i < count; i++) out[i] = src[Math.floor((i / count) * n) % n];
  return out;
}

function smoothRing(arr, passes) {
  const n = arr.length;
  const tmp = new Float32Array(n);
  for (let p = 0; p < passes; p++) {
    for (let i = 0; i < n; i++) {
      tmp[i] = (arr[(i - 1 + n) % n] + arr[i] * 2 + arr[(i + 1) % n]) * 0.25;
    }
    arr.set(tmp);
  }
  return arr;
}

export { SPACING };
