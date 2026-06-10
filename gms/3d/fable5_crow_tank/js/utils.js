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

// 3D segment (a -> b) vs sphere (c, r) — shell-vs-crow collision.
export function segHitsSphere(a, b, c, r) {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const fx = a.x - c.x, fy = a.y - c.y, fz = a.z - c.z;
  const len2 = dx * dx + dy * dy + dz * dz;
  let t = 0;
  if (len2 > 1e-8) t = clamp(-(fx * dx + fy * dy + fz * dz) / len2, 0, 1);
  const px = fx + dx * t, py = fy + dy * t, pz = fz + dz * t;
  return px * px + py * py + pz * pz <= r * r;
}
