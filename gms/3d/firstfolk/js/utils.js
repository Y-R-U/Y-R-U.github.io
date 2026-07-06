import * as THREE from 'three';

export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;

// Shortest-path angle lerp (radians).
export function lerpAngle(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

// Frame-rate independent smoothing factor.
export const damp = (lambda, dt) => 1 - Math.exp(-lambda * dt);

// Deterministic hash noise (island + decor stay stable per seed).
export function hash2(x, y, seed = 1) {
  let h = (x * 374761393 + y * 668265263 + seed * 1442695040888963407) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// 2D value noise + fbm over the hash (for island generation).
export function vnoise(x, y, seed = 7) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}
export function fbm(x, y, oct = 4, seed = 7) {
  let s = 0, amp = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { s += amp * vnoise(x * f, y * f, seed + i * 31); amp *= 0.5; f *= 2; }
  return s;
}

export function canvasTexture(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function M(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0, ...opts });
}

export function mesh(geo, mat, x = 0, y = 0, z = 0, shadows = true) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  if (shadows) { m.castShadow = true; m.receiveShadow = true; }
  return m;
}

export const qs = new URLSearchParams(location.search);
export const fmt = (n) => n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : String(Math.floor(n));
export const dist2 = (ax, az, bx, bz) => { const dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; };
