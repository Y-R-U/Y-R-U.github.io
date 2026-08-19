// Deterministic rng, hashing, easing and two small containers. No three.js, no DOM.

export function xorshift32(seed) {
  let s = (seed | 0) || 0x9e3779b9;
  return function rng() {
    s ^= s << 13; s |= 0;
    s ^= s >>> 17;
    s ^= s << 5;  s |= 0;
    return ((s >>> 0) / 4294967296);
  };
}

// Stable 32-bit hash of an integer pair plus a salt. The city is derived from this and nothing
// else, so it must never depend on iteration order or floating point.
export function hash2i(x, z, salt = 0) {
  let h = (x | 0) * 0x27d4eb2d ^ (z | 0) * 0x165667b1 ^ (salt | 0) * 0x9e3779b9;
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h |= 0;
  h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h |= 0;
  h ^= h >>> 15;
  return h >>> 0;
}

export const hashf = (x, z, salt = 0) => hash2i(x, z, salt) / 4294967296;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
export const smoothstep = t => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
export const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
export const easeInOutCubic = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// Frame-rate independent exponential approach. `rate` is the fraction closed per second.
export function damp(current, target, rate, dt) {
  return lerp(target, current, Math.exp(-rate * dt));
}

export const wrapAngle = a => {
  a = (a + Math.PI) % (Math.PI * 2);
  return (a < 0 ? a + Math.PI * 2 : a) - Math.PI;
};

export const deg = r => r * 180 / Math.PI;
export const rad = d => d * Math.PI / 180;

// Uniform-cell spatial hash. Cells are sparse; keys are packed into one string per cell.
export class Grid {
  constructor(cell = 64) { this.cell = cell; this.map = new Map(); }
  key(x, z) { return ((x / this.cell) | 0) + ':' + ((z / this.cell) | 0); }
  insert(x, z, item) {
    const k = this.key(x, z);
    let a = this.map.get(k);
    if (!a) this.map.set(k, a = []);
    a.push(item);
    return item;
  }
  near(x, z, radius = this.cell, out = []) {
    out.length = 0;
    const c = this.cell;
    const r = Math.max(1, Math.ceil(radius / c));
    const cx = (x / c) | 0, cz = (z / c) | 0;
    for (let ix = cx - r; ix <= cx + r; ix++)
      for (let iz = cz - r; iz <= cz + r; iz++) {
        const a = this.map.get(ix + ':' + iz);
        if (a) for (let i = 0; i < a.length; i++) out.push(a[i]);
      }
    return out;
  }
  clear() { this.map.clear(); }
}

// Free-list pool. `make` builds, `reset` is called on acquire.
export class Pool {
  constructor(make, reset) { this.make = make; this.reset = reset; this.free = []; this.live = 0; }
  acquire(...a) {
    const o = this.free.pop() || this.make();
    this.live++;
    if (this.reset) this.reset(o, ...a);
    return o;
  }
  release(o) { this.live--; this.free.push(o); }
}

// Rolling window with mean / worst, used by the fps guard and by __state.
export class Roll {
  constructor(n = 60) { this.n = n; this.a = []; this.i = 0; }
  push(v) { this.a[this.i++ % this.n] = v; return v; }
  get mean() { return this.a.length ? this.a.reduce((s, v) => s + v, 0) / this.a.length : 0; }
  get worst() { return this.a.length ? Math.max(...this.a) : 0; }
  clear() { this.a.length = 0; this.i = 0; }
}

// The zone tint, made usable as a UI accent.
//
// This exists because of something the first S2-D capture showed rather than something anybody
// predicted: HUB's zone colour is `0xdfeaff` (js/config.js ZONE_TYPES) — near white. Every accent
// on the FIRST board of the game therefore came out white, the filled primary button rendered as a
// large pale slab, and the screen looked exactly like the web form this phase exists to delete. A
// desaturated tint is not an accent; it is the absence of one. So a tint that is too pale or too
// washed out falls back to the HUD cyan, and every saturated zone colour is used as it is.
export function accentOf(hex) {
  // Takes either a number (config.js's ZONE_TYPES) or a '#rrggbb' string (clients.json's
  // `tint_hex`). Both reach here, and the first version only handled the number — which is how the
  // client panel kept painting itself white after the board had been fixed.
  const n = typeof hex === 'number' ? hex
    : parseInt(String(hex).replace('#', '').slice(0, 6), 16);
  if (!Number.isFinite(n)) return '#35e6ff';
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  const sat = mx === mn ? 0 : (mx - mn) / (l > 0.5 ? 2 - mx - mn : mx + mn);
  if (sat < 0.45 || l > 0.82) return '#35e6ff';
  return '#' + n.toString(16).padStart(6, '0');
}

