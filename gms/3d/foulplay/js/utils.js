// Maths and DOM helpers. No imports — the leaf of the module graph.

export const TAU = Math.PI * 2;

export const rand = (a, b) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => clamp01((v - a) / (b - a || 1e-6));
export const smoothstep = (a, b, x) => {
  const t = clamp01((x - a) / (b - a || 1e-6));
  return t * t * (3 - 2 * t);
};
export const sign = (v) => (v < 0 ? -1 : v > 0 ? 1 : 0);

// Frame-rate independent smoothing factor: lerp(a, b, damp(rate, dt)).
export const damp = (rate, dt) => 1 - Math.exp(-rate * dt);

export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export function shuffled(arr, rng = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Shortest signed angle from a to b, in (-PI, PI].
export function angDiff(a, b) {
  return ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI;
}

export function angLerp(a, b, t) {
  return a + angDiff(a, b) * t;
}

export function angStep(a, b, maxStep) {
  const d = angDiff(a, b);
  return Math.abs(d) <= maxStep ? b : a + Math.sign(d) * maxStep;
}

export function wrap(v, len) {
  const r = v % len;
  return r < 0 ? r + len : r;
}

// Shortest signed distance from a to b on a loop of the given length.
export function wrapDiff(a, b, len) {
  let d = (b - a) % len;
  if (d > len * 0.5) d -= len;
  if (d < -len * 0.5) d += len;
  return d;
}

export function fmtTime(s) {
  if (!isFinite(s) || s < 0) return '--:--';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const cs = Math.floor((s * 100) % 100);
  return `${m}:${String(sec).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

export function fmtGap(s) {
  if (!isFinite(s)) return '--';
  const a = Math.abs(s);
  return (s < 0 ? '-' : '+') + (a < 10 ? a.toFixed(2) : a.toFixed(1));
}

export function fmtMoney(n) {
  n = Math.round(n);
  const neg = n < 0;
  n = Math.abs(n);
  let s;
  if (n >= 1e6) s = (n / 1e6).toFixed(n < 1e7 ? 2 : 1) + 'M';
  else s = n.toLocaleString('en-US');
  return (neg ? '-$' : '$') + s;
}

export function fmtRank(n) {
  return '#' + Math.round(n).toLocaleString('en-US');
}

export function ordinal(n) {
  const t = n % 100;
  if (t >= 11 && t <= 13) return n + 'th';
  return n + (['th', 'st', 'nd', 'rd'][n % 10] || 'th');
}

// Deterministic RNG so a track seed always rebuilds the same circuit.
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
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// ---------------------------------------------------------------------------
// DOM
// ---------------------------------------------------------------------------
export const $ = (id) => document.getElementById(id);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

export function hexToCss(hex) {
  return '#' + (hex >>> 0).toString(16).padStart(6, '0');
}

export function mixHex(a, b, t) {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return ((ar + (br - ar) * t) << 16 | (ag + (bg - ag) * t) << 8 | (ab + (bb - ab) * t)) & 0xffffff;
}

export function shadeHex(hex, amt) {
  return mixHex(hex, amt > 0 ? 0xffffff : 0x000000, Math.abs(amt));
}

export function sanitizeName(raw) {
  const s = (raw || '').toUpperCase().replace(/[^A-Z0-9 '_-]/g, '').trim().slice(0, 14);
  return s.length >= 2 ? s : null;
}

// Escape for innerHTML — menus build a lot of markup from saved data.
export function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
