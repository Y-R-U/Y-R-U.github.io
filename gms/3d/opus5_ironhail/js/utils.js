// Math + misc helpers. No imports — the leaf of the module graph.

export const rand = (a, b) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp01((x - a) / (b - a || 1e-6));
  return t * t * (3 - 2 * t);
};
// frame-rate independent smoothing factor for lerp(a, b, damp(rate, dt))
export const damp = (rate, dt) => 1 - Math.exp(-rate * dt);

export const $ = (id) => document.getElementById(id);

export function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

export function angLerp(a, b, t) {
  const d = angDiff(a, b);
  return a + d * t;
}

// shortest signed angle from a to b, in (-PI, PI]
export function angDiff(a, b) {
  return ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
}

// Rotate an angle toward a target at most `maxStep` radians.
export function angStep(a, b, maxStep) {
  const d = angDiff(a, b);
  if (Math.abs(d) <= maxStep) return b;
  return a + Math.sign(d) * maxStep;
}

export const pickRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];

export function shuffled(arr, rng = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function fmtTime(s) {
  s = Math.max(0, s);
  const m = Math.floor(s / 60);
  return m + ':' + String(Math.floor(s % 60)).padStart(2, '0');
}

// 12500 -> "12.5K", 1250000 -> "1.25M"
export function fmtBig(n) {
  n = Math.round(n);
  if (n < 1000) return String(n);
  if (n < 1e6) {
    const k = n / 1000;
    return (k < 10 ? k.toFixed(1) : Math.round(k)) + 'K';
  }
  return (n / 1e6).toFixed(2) + 'M';
}

export function fmtRank(n) {
  return '#' + Math.round(n).toLocaleString('en-US');
}

// Deterministic RNG so a battlefield seed always rebuilds the same terrain.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// 2D segment (a -> b) vs circle intersection, on the ground plane.
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
  return '#' + (hex >>> 0).toString(16).padStart(6, '0');
}

// Hull/turret forward is -Z, so yaw 0 looks down -Z.
export const yawToDirX = (yaw) => -Math.sin(yaw);
export const yawToDirZ = (yaw) => -Math.cos(yaw);
export const dirToYaw = (dx, dz) => Math.atan2(-dx, -dz);

export function sanitizeName(raw) {
  const s = (raw || '').toUpperCase().replace(/[^A-Z0-9 _-]/g, '').trim().slice(0, 12);
  return s.length >= 2 ? s : null;
}
