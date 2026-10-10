import { TANK } from './config.js';

export const rand = (a, b) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
// frame-rate independent smoothing factor
export const damp = (rate, dt) => 1 - Math.exp(-rate * dt);

export const $ = (id) => document.getElementById(id);

export function angLerp(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return a + d * t;
}

export function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function shuffled(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function fmtTime(s) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return m + ':' + String(sec).padStart(2, '0');
}

// 2D segment (a -> b) vs circle (cx, cz, r) intersection — used for line of
// sight and bolt-vs-obstacle checks on the ground plane.
export function segHitsCircle(ax, az, bx, bz, cx, cz, r) {
  const dx = bx - ax, dz = bz - az;
  const fx = ax - cx, fz = az - cz;
  const a = dx * dx + dz * dz;
  if (a < 1e-8) return fx * fx + fz * fz <= r * r;
  let t = -(fx * dx + fz * dz) / a;
  t = clamp(t, 0, 1);
  const px = ax + dx * t - cx;
  const pz = az + dz * t - cz;
  return px * px + pz * pz <= r * r;
}

export function hexToCss(hex) {
  return '#' + hex.toString(16).padStart(6, '0');
}

// Lead a moving target: where to aim so a bolt fired from `from` meets it.
export function leadAim(out, from, target, k = 0.85) {
  const lead = Math.hypot(target.pos.x - from.x, target.pos.z - from.z) / TANK.boltSpeed * k;
  return out.set(target.pos.x + target.vel.x * lead, 1.0, target.pos.z + target.vel.z * lead);
}

// Seeded stream for match layout (spawns, pickups) so the daily field is the
// same for everyone. Unseeded it is plain Math.random.
let srng = Math.random;
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function seedLayout(seed) { srng = seed == null ? Math.random : mulberry32(seed); }
export const srand = (a, b) => a + srng() * (b - a);
export function sshuffled(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(srng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export function todayKey(d = new Date()) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-'
    + String(d.getDate()).padStart(2, '0');
}
export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
