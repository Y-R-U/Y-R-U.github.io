// Code-driven pose blending for procedural characters (shared: Garfield, can be used by Jon).
// A Pose holds per-bone additive euler rotation, position offset and scale delta, plus named
// scalar "ext" channels (lids, mouth, claws ...). Clips are functions writing into a zeroed Pose.
//
// clip = { dur, loop:bool, then?:'clipName', fn(P, t, ctx) }  (t in seconds, wraps when looping)
import * as THREE from '../../../vendor/three/three.module.js';

export class Pose {
  constructor(boneNames, extNames) {
    this.names = boneNames;
    this.bi = Object.fromEntries(boneNames.map((n, i) => [n, i]));
    const n = boneNames.length * 3;
    this.rot = new Float32Array(n); this.off = new Float32Array(n); this.scl = new Float32Array(n);
    this.extNames = extNames;
    this.x = Object.fromEntries(extNames.map((k) => [k, 0]));
  }
  zero() { this.rot.fill(0); this.off.fill(0); this.scl.fill(0); for (const k of this.extNames) this.x[k] = 0; return this; }
  r(b, x = 0, y = 0, z = 0) { const i = this.bi[b] * 3; this.rot[i] += x; this.rot[i + 1] += y; this.rot[i + 2] += z; return this; }
  o(b, x = 0, y = 0, z = 0) { const i = this.bi[b] * 3; this.off[i] += x; this.off[i + 1] += y; this.off[i + 2] += z; return this; }
  s(b, x = 0, y = 0, z = 0) { const i = this.bi[b] * 3; this.scl[i] += x; this.scl[i + 1] += y; this.scl[i + 2] += z; return this; }
  addScaled(P, w) {
    for (let i = 0; i < this.rot.length; i++) { this.rot[i] += P.rot[i] * w; this.off[i] += P.off[i] * w; this.scl[i] += P.scl[i] * w; }
    for (const k of this.extNames) this.x[k] += P.x[k] * w;
    return this;
  }
}

const _e = new THREE.Euler(), _q = new THREE.Quaternion();
// apply pose to bones whose rest transforms are stored in rest[] = {pos:Vector3, quat:Quaternion}
export function applyPose(P, bones, rest) {
  for (let b = 0; b < bones.length; b++) {
    const bone = bones[b], R = rest[b], i = b * 3;
    bone.position.set(R.pos.x + P.off[i], R.pos.y + P.off[i + 1], R.pos.z + P.off[i + 2]);
    _e.set(P.rot[i], P.rot[i + 1], P.rot[i + 2], 'YXZ');
    bone.quaternion.copy(R.quat).multiply(_q.setFromEuler(_e));
    bone.scale.set(1 + P.scl[i], 1 + P.scl[i + 1], 1 + P.scl[i + 2]);
  }
}

export const smooth = (t) => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
export const sstep = (a, b, t) => smooth((t - a) / (b - a));
export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// piecewise keys [[t,v],...] with smooth interpolation
export function keys(k, t) {
  if (t <= k[0][0]) return k[0][1];
  for (let i = 1; i < k.length; i++) if (t <= k[i][0]) return lerp(k[i - 1][1], k[i][1], smooth((t - k[i - 1][0]) / (k[i][0] - k[i - 1][0])));
  return k[k.length - 1][1];
}

// damped spring (critically-ish) on a scalar
export class Spring {
  constructor(k = 120, d = 10) { this.k = k; this.d = d; this.x = 0; this.v = 0; }
  step(dt, target = 0, force = 0) {
    const n = Math.max(1, Math.ceil(dt / 0.008)), h = dt / n;
    for (let i = 0; i < n; i++) { this.v += (this.k * (target - this.x) - this.d * this.v + force) * h; this.x += this.v * h; }
    return this.x;
  }
}

export class ClipPlayer {
  constructor(clips, makePose, defaultClip = 'idle') {
    this.clips = clips; this.makePose = makePose; this.def = defaultClip;
    this.layers = []; this.tmp = makePose(); this.out = makePose();
    this.current = null;
  }
  play(name, { loop, speed = 1, fade = 0.15, once = false } = {}) {
    const clip = this.clips[name];
    if (!clip) { console.warn('[pose] no clip', name); return Promise.resolve(); }
    const isLoop = once ? false : loop === true ? true : !!clip.loop;
    const top = this.layers[this.layers.length - 1];
    if (top && top.name === name && top.loop && isLoop && top.target === 1) { top.speed = speed; return top.promise; }
    if (top && top.name === name && clip.same && top.target === 1) { top.speed = speed; top.loop = isLoop; return top.promise; }
    for (const L of this.layers) { L.target = 0; L.fadeRate = 1 / Math.max(0.001, fade); }
    let resolve; const promise = new Promise((r) => { resolve = r; });
    const L = { name, clip, t: 0, w: this.layers.length ? 0 : 1, target: 1, fadeRate: 1 / Math.max(0.001, fade), speed, loop: isLoop, resolve, promise, done: false, phase0: 0 };
    this.layers.push(L);
    this.current = L;
    return promise;
  }
  get name() { return this.current ? this.current.name : null; }
  update(dt, ctx) {
    let ended = null;
    for (const L of this.layers) {
      L.w += Math.sign(L.target - L.w) * Math.min(Math.abs(L.target - L.w), L.fadeRate * dt);
      L.t += dt * L.speed;
      const dur = L.clip.dur || 1;
      if (!L.loop && !L.done && L.t >= dur) {
        L.done = true; L.t = dur; L.resolve();
        if (L === this.current) ended = L;
      }
    }
    for (const L of this.layers) if (L.done && L !== this.current && L.target === 0) { /* fading */ }
    this.layers = this.layers.filter((L) => L.target > 0 || L.w > 0.001);
    if (this.layers.length === 0) this.play(this.def, { fade: 0 });
    if (ended) {
      const next = ended.clip.then || this.def;
      if (next !== ended.name) this.play(next, { fade: ended.clip.outFade || 0.25 });
    }
    const out = this.out.zero();
    let tot = 0;
    for (const L of this.layers) tot += L.w;
    for (const L of this.layers) {
      if (L.w <= 0) continue;
      const P = this.tmp.zero();
      const dur = L.clip.dur || 1;
      const t = L.loop ? L.t % dur : Math.min(L.t, dur);
      L.clip.fn(P, t, ctx, L);
      out.addScaled(P, L.w / (tot || 1));
    }
    return out;
  }
}
