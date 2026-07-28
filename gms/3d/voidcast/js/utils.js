// utils.js — maths, rng, formatting. No three.js dependency.

export const TAU = Math.PI * 2;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
export const smoothstep = (t) => t * t * (3 - 2 * t);
export const sat = (v) => clamp(v, 0, 1);

// frame-rate independent exponential approach
export const damp = (cur, target, rate, dt) => lerp(cur, target, 1 - Math.exp(-rate * dt));

export const angleLerp = (a, b, t) => {
  let d = ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI;
  return a + d * t;
};

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Wraps a raw 0..1 generator with the helpers we actually use. */
export function makeRng(seed) {
  const r = typeof seed === 'string' ? mulberry32(hashStr(seed)) : mulberry32(seed);
  r.range = (a, b) => a + (b - a) * r();
  r.int = (a, b) => Math.floor(a + (b - a + 1) * r()) ;
  r.pick = (arr) => arr[Math.floor(r() * arr.length) % arr.length];
  r.chance = (p) => r() < p;
  r.sign = () => (r() < 0.5 ? -1 : 1);
  r.shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  /** weighted pick: items are [thing, weight] pairs */
  r.weighted = (pairs) => {
    let total = 0;
    for (const p of pairs) total += p[1];
    let x = r() * total;
    for (const p of pairs) {
      x -= p[1];
      if (x <= 0) return p[0];
    }
    return pairs[pairs.length - 1][0];
  };
  return r;
}

const UNITS = [
  [1e15, 'Q'], [1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K'],
];

/** 1234 -> "1.23K", 4500000 -> "4.5M". Used everywhere for viewers/subs. */
export function fmt(n, dp) {
  n = Math.floor(n);
  if (!isFinite(n)) return '∞';
  const neg = n < 0;
  n = Math.abs(n);
  for (const [div, suf] of UNITS) {
    if (n >= div) {
      const v = n / div;
      const d = dp != null ? dp : v < 10 ? 2 : v < 100 ? 1 : 0;
      return (neg ? '-' : '') + trimZeros(v.toFixed(d)) + suf;
    }
  }
  return (neg ? '-' : '') + n.toString();
}

function trimZeros(s) {
  return s.indexOf('.') >= 0 ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
}

/** Full comma-grouped integer, for the global rank readout. */
export function fmtFull(n) {
  return Math.floor(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function fmtTime(sec) {
  sec = Math.max(0, Math.ceil(sec));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m + ':' + (s < 10 ? '0' : '') + s;
}

/** ordinal-ish suffix for rank strings */
export function ordinal(n) {
  const v = n % 100;
  if (v >= 11 && v <= 13) return n + 'th';
  switch (n % 10) {
    case 1: return n + 'st';
    case 2: return n + 'nd';
    case 3: return n + 'rd';
    default: return n + 'th';
  }
}

/** Deterministic alien-ish handle, used for rivals and ladder neighbours. */
const SYL_A = ['vor', 'zek', 'qua', 'nul', 'gru', 'thal', 'oss', 'ryn', 'kai', 'dre', 'ix', 'phos', 'ung', 'mek', 'sol', 'vex', 'ban', 'yth', 'orr', 'zad'];
const SYL_B = ['ka', 'ru', 'mos', 'ith', 'ux', 'ara', 'een', 'ol', 'iss', 'ur', 'eth', 'omo', 'ax', 'ill', 'oon', 'ep'];
const TAGS = ['_LIVE', '77', '_TV', 'x', '_prime', '9', '', '', '_HD', '_v2', '_XL', ''];

export function alienName(seed) {
  const r = makeRng(seed >>> 0);
  let n = r.pick(SYL_A) + r.pick(SYL_B);
  if (r.chance(0.35)) n += r.pick(SYL_B);
  n = n[0].toUpperCase() + n.slice(1);
  return n + r.pick(TAGS);
}

/** Squared distance in the XZ plane. */
export const d2 = (ax, az, bx, bz) => {
  const dx = ax - bx, dz = az - bz;
  return dx * dx + dz * dz;
};

export function nowSec() { return performance.now() / 1000; }

/** Simple pooled array helper — keeps GC quiet in the particle systems. */
export class Pool {
  constructor(factory, size) {
    this.free = [];
    this.factory = factory;
    for (let i = 0; i < size; i++) this.free.push(factory());
  }
  get() { return this.free.length ? this.free.pop() : this.factory(); }
  put(o) { this.free.push(o); }
}

/** Fixed 2D spatial hash over the XZ plane — props, rivals and hazards all use it. */
export class Grid {
  constructor(cell) {
    this.cell = cell;
    this.map = new Map();
  }
  key(cx, cz) { return cx * 73856093 ^ cz * 19349663; }
  insert(obj) {
    const cx = Math.floor(obj.x / this.cell), cz = Math.floor(obj.z / this.cell);
    obj._cx = cx; obj._cz = cz;
    const k = this.key(cx, cz);
    let a = this.map.get(k);
    if (!a) { a = []; this.map.set(k, a); }
    a.push(obj);
  }
  remove(obj) {
    const a = this.map.get(this.key(obj._cx, obj._cz));
    if (!a) return;
    const i = a.indexOf(obj);
    if (i >= 0) a.splice(i, 1);
  }
  /** calls fn for every object within `rad` of (x,z) — may include a few extras */
  query(x, z, rad, fn) {
    const c = this.cell;
    const x0 = Math.floor((x - rad) / c), x1 = Math.floor((x + rad) / c);
    const z0 = Math.floor((z - rad) / c), z1 = Math.floor((z + rad) / c);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const a = this.map.get(this.key(cx, cz));
        if (!a) continue;
        for (let i = 0; i < a.length; i++) fn(a[i]);
      }
    }
  }
  clear() { this.map.clear(); }
}
