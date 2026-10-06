// Pose/clip engine for Jon. A pose is a Float32Array of euler degrees per channel bone + hips offset (m).
export const CH = ['hips', 'spine', 'chest', 'neck', 'head'];
for (const s of ['L', 'R']) CH.push('clav' + s, 'uarm' + s, 'farm' + s, 'hand' + s, 'fing' + s, 'fing2' + s, 'thumb' + s, 'thigh' + s, 'shin' + s, 'foot' + s, 'toe' + s);
export const CI = {}; CH.forEach((n, i) => { CI[n] = i * 3; });
export const POS = CH.length * 3;           // hips offset x,y,z
export const N = POS + 3;
export const UPPER = new Set(['spine', 'chest', 'neck', 'head', 'clavL', 'uarmL', 'farmL', 'handL', 'fingL', 'fing2L', 'thumbL',
  'clavR', 'uarmR', 'farmR', 'handR', 'fingR', 'fing2R', 'thumbR']);

export const newPose = () => new Float32Array(N);

// mirror helpers: S({uarmL:[x,y,z]}) also writes uarmR with y,z negated.
export function S(o) {
  const r = { ...o };
  for (const [k, v] of Object.entries(o)) {
    if (k.endsWith('L') && CI[k] !== undefined) {
      const m = k.slice(0, -1) + 'R';
      if (!(m in o)) r[m] = [v[0], -v[1], -v[2]];
    }
  }
  return r;
}
export const mirrorKey = (o) => {
  const r = {};
  for (const [k, v] of Object.entries(o)) {
    if (k === 'pos') { r.pos = [-v[0], v[1], v[2]]; continue; }
    let m = k;
    if (k.endsWith('L') && CI[k.slice(0, -1) + 'R'] !== undefined) m = k.slice(0, -1) + 'R';
    else if (k.endsWith('R') && CI[k.slice(0, -1) + 'L'] !== undefined) m = k.slice(0, -1) + 'L';
    r[m] = CI[m] !== undefined ? [v[0], -v[1], -v[2]] : v;
  }
  return r;
};

export function writeKey(pose, key) {
  for (const [k, v] of Object.entries(key)) {
    if (k === 'pos') { pose[POS] = v[0]; pose[POS + 1] = v[1]; pose[POS + 2] = v[2]; continue; }
    const i = CI[k]; if (i === undefined) continue;
    pose[i] = v[0]; pose[i + 1] = v[1]; pose[i + 2] = v[2];
  }
  return pose;
}

// Rest standing pose (arms relaxed, slight bends)
export const REST = writeKey(newPose(), S({
  uarmL: [2, 0, 7], farmL: [-10, 0, 0], handL: [0, 0, 0], fingL: [0, 0, -14], fing2L: [0, 0, -12], thumbL: [0, 0, -5],
  thighL: [0, 0, 1], shinL: [2, 0, 0], footL: [-2, 0, -1], spine: [2, 0, 0], neck: [-2, 0, 0], head: [2, 0, 0],
}));

// Catmull-Rom on non-uniform times (clamped tangents at ends)
function cr(p0, p1, p2, p3, t0, t1, t2, t3, t) {
  const dt = t2 - t1 || 1e-6;
  const m1 = t2 - t0 > 0 ? (p2 - p0) / (t2 - t0) * dt : 0;
  const m2 = t3 - t1 > 0 ? (p3 - p1) / (t3 - t1) * dt : 0;
  const u = (t - t1) / dt, u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * p1 + (u3 - 2 * u2 + u) * m1 + (-2 * u3 + 3 * u2) * p2 + (u3 - u2) * m2;
}

// keys: [[t, keyObj, opts?], ...]; values are sticky (inherit previous key). opts.ease: 'step'|'lin'
export function compileClip(def) {
  const base = def.base ? def.base.slice() : REST.slice();
  let cur = base;
  const keys = def.keys.map(([t, k, o]) => {
    cur = writeKey(cur.slice(), k);
    return { t, v: cur, ease: o?.ease };
  });
  if (def.loop && keys.length && keys[keys.length - 1].t < def.dur) {
    const lf = def.loopFrom ?? 0;
    const first = keys.find(k => k.t >= lf) ?? keys[0];
    keys.push({ t: def.dur, v: first.v.slice() });
  }
  return { ...def, ck: keys };
}

export function sampleClip(clip, t, out) {
  const ks = clip.ck, n = ks.length;
  if (t <= ks[0].t) { out.set(ks[0].v); return out; }
  if (t >= ks[n - 1].t) { out.set(ks[n - 1].v); return out; }
  let i = 0; while (i < n - 2 && t > ks[i + 1].t) i++;
  const k1 = ks[i], k2 = ks[i + 1];
  if (k2.ease === 'step') { out.set(k1.v); return out; }
  const loop = clip.loop;
  const k0 = ks[i - 1] ?? (loop && n > 2 ? { t: k1.t - (ks[n - 1].t - ks[n - 2].t), v: ks[n - 2].v } : k1);
  const k3 = ks[i + 2] ?? (loop && n > 2 ? { t: k2.t + (ks[1].t - ks[0].t), v: ks[1].v } : k2);
  if (k2.ease === 'lin') {
    const u = (t - k1.t) / (k2.t - k1.t);
    for (let c = 0; c < N; c++) out[c] = k1.v[c] + (k2.v[c] - k1.v[c]) * u;
    return out;
  }
  for (let c = 0; c < N; c++) out[c] = cr(k0.v[c], k1.v[c], k2.v[c], k3.v[c], k0.t, k1.t, k2.t, k3.t, t);
  return out;
}

export function lerpPose(a, b, w, out = a, mask = null) {
  if (w <= 0) { if (out !== a) out.set(a); return out; }
  for (let c = 0; c < N; c++) {
    if (mask && c < POS && !mask.has(CH[(c / 3) | 0])) { out[c] = a[c]; continue; }
    if (mask && c >= POS) { out[c] = a[c]; continue; }
    out[c] = a[c] + (b[c] - a[c]) * w;
  }
  return out;
}

const TAU = Math.PI * 2;
const sin = (x) => Math.sin(x * TAU), cos = (x) => Math.cos(x * TAU);
const pos = (x) => Math.max(0, x);

// ---- procedural locomotion ----
export function idlePose(t, out) {
  out.set(REST);
  const b = Math.sin(t * 1.6), s = Math.sin(t * 0.37);
  out[CI.chest] += 1.4 * b; out[CI.neck] -= 0.8 * b;
  out[CI.uarmL + 2] += 1.2 * b; out[CI.uarmR + 2] -= 1.2 * b;
  out[CI.hips + 2] += 1.5 * s; out[CI.spine + 2] -= 1.0 * s; out[CI.head + 2] -= 0.8 * s;
  out[POS] = 0.01 * s; out[POS + 1] = -0.003 + 0.002 * b;
  out[CI.thighL + 2] += 1.5 * s; out[CI.thighR + 2] += 1.5 * s;
  out[CI.footL + 2] -= 1.5 * s; out[CI.footR + 2] -= 1.5 * s;
  out[CI.head + 1] += 4 * Math.sin(t * 0.23);
  return out;
}

// phase in [0,1); amp 0..1 scales the stride for slow speeds
export function walkPose(ph, amp, out) {
  out.set(REST);
  const A = amp;
  const s = sin(ph), c = cos(ph);
  const legs = (side, p) => {
    const ss = sin(p), cc = cos(p);
    const thigh = -30 * ss * A + 6;
    const swing = pos(cc);                                     // forward swing when cos>0
    const knee = 6 + (46 * Math.pow(pos(cos(p + 0.04)), 1.3) + 8 * pos(-ss) * pos(-cc) * 2) * A;
    const foot = -thigh * 0.55 - knee * 0.45 + (ss < 0 && cc < 0 ? -25 * pos(-ss) * pos(-cc) * 2 * A : 0) + 12 * pos(ss) * A * pos(-cc);
    out[CI['thigh' + side]] = thigh; out[CI['shin' + side]] = knee; out[CI['foot' + side]] = foot;
    out[CI['toe' + side]] = ss < 0 && cc < 0 ? 15 * A : 0;
  };
  legs('L', ph); legs('R', ph + 0.5);
  out[POS + 1] = (-0.035 * Math.abs(s) + 0.012) * A;
  out[CI.hips + 1] = 7 * s * A; out[CI.hips + 2] = 3 * c * A;
  out[CI.spine + 1] = -4 * s * A; out[CI.chest + 1] = -6 * s * A; out[CI.chest] = 4 * A;
  out[CI.head + 1] = 3 * s * A; out[CI.neck] = 2 * A; out[CI.head] = 1 + 3 * Math.abs(s) * A;
  out[CI.uarmL] = 26 * s * A; out[CI.uarmR] = -26 * s * A;
  out[CI.farmL] = -14 - 18 * pos(-s) * A; out[CI.farmR] = -14 - 18 * pos(s) * A;
  out[CI.uarmL + 2] = 8; out[CI.uarmR + 2] = -8;
  return out;
}

// comedic flailing chase run
export function runPose(ph, amp, out) {
  out.set(REST);
  const A = amp, s = sin(ph), c = cos(ph);
  const legs = (side, p) => {
    const ss = sin(p), cc = cos(p);
    const thigh = -48 * ss * A - 18 * A;
    const knee = 25 + 85 * Math.pow(pos(cc + 0.25) / 1.25, 1.2) * A;
    out[CI['thigh' + side]] = thigh; out[CI['shin' + side]] = knee;
    out[CI['foot' + side]] = -thigh * 0.3 - knee * 0.25 + 18 * pos(-cc) * A;
    out[CI['toe' + side]] = 10 * pos(-cc) * A;
  };
  legs('L', ph); legs('R', ph + 0.5);
  out[POS + 1] = (0.05 * Math.abs(c) - 0.05) * A;
  out[POS + 2] = 0.03 * A;
  out[CI.hips] = 14 * A; out[CI.hips + 1] = 10 * s * A;
  out[CI.spine] = 6 * A; out[CI.chest] = 6 * A; out[CI.chest + 1] = -10 * s * A;
  out[CI.neck] = -14 * A; out[CI.head] = -6 * A + 4 * Math.abs(c) * A;
  // flailing arms: big windmill-ish swings, hands splayed
  out[CI.uarmL] = (-55 + 75 * s) * A; out[CI.uarmR] = (-55 - 75 * s) * A;
  out[CI.uarmL + 2] = 25 + 20 * pos(s) * A; out[CI.uarmR + 2] = -25 - 20 * pos(-s) * A;
  out[CI.uarmL + 1] = 15 * c * A; out[CI.uarmR + 1] = 15 * c * A;
  out[CI.farmL] = -30 - 40 * pos(-s) * A; out[CI.farmR] = -30 - 40 * pos(s) * A;
  out[CI.fingL + 2] = 10; out[CI.fingR + 2] = -10; out[CI.fing2L + 2] = 0; out[CI.fing2R + 2] = 0;
  out[CI.handL] = -20 * s; out[CI.handR] = 20 * s;
  return out;
}
