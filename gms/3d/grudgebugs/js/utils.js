// GRUDGE BUGS — helpers. No THREE here; physics.js depends on this in node.

export const $ = (id) => document.getElementById(id);

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export const easeOut = (t) => 1 - Math.pow(1 - t, 3);
export const easeInOut = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
export const smooth = (t) => t * t * (3 - 2 * t);

// tiny vec3 helpers on plain {x,y,z} (shared with node-side physics tests)
export const v3 = (x = 0, y = 0, z = 0) => ({ x, y, z });
export const vadd = (a, b) => v3(a.x + b.x, a.y + b.y, a.z + b.z);
export const vsub = (a, b) => v3(a.x - b.x, a.y - b.y, a.z - b.z);
export const vscale = (a, s) => v3(a.x * s, a.y * s, a.z * s);
export const vlen = (a) => Math.hypot(a.x, a.y, a.z);
export const vdist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
export const vnorm = (a) => { const l = vlen(a) || 1; return v3(a.x / l, a.y / l, a.z / l); };
export const vlerp = (a, b, t) => v3(lerp(a.x, b.x, t), lerp(a.y, b.y, t), lerp(a.z, b.z, t));
export const vdot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;

export function fmtTime(s) { return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`; }
