// Shared maths and small helpers. No Three.js imports here — this file is the
// one thing every system can depend on without pulling in the renderer.

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const inv = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
export const smoothstep = (t) => t * t * (3 - 2 * t);
export const TAU = Math.PI * 2;

// Frame-rate independent approach. `rate` is roughly "fraction closed per
// second"; 0.9 gets you 90% of the way there in one second at any fps.
export const approach = (cur, target, rate, dt) =>
  cur + (target - cur) * (1 - Math.pow(1 - rate, dt));

export const rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[(Math.random() * arr.length) | 0];
export const shuffle = (arr) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

// Deterministic PRNG. Every generated level takes a seed so a bad level can be
// reported by number and reproduced exactly.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function seededRng(seed) {
  const r = mulberry32(seed);
  r.range = (a, b) => a + r() * (b - a);
  r.int = (a, b) => Math.floor(a + r() * (b - a + 1));
  r.pick = (arr) => arr[Math.floor(r() * arr.length)];
  r.chance = (p) => r() < p;
  return r;
}

// 1200 reads as 1.2K, 1_450_000 as 1.45M. Used on every sign and counter, so
// it has to stay short: signage in this game is read at a glance while moving.
export function fmt(n) {
  n = Math.round(n);
  if (Math.abs(n) < 1000) return String(n);
  if (Math.abs(n) < 1e6) return trim(n / 1e3) + 'K';
  if (Math.abs(n) < 1e9) return trim(n / 1e6) + 'M';
  return trim(n / 1e9) + 'B';
}
const trim = (v) => (Math.abs(v) < 10 ? v.toFixed(1).replace(/\.0$/, '') : String(Math.round(v)));

export function fmtMoney(n) { return '$' + fmt(n); }

export function fmtTime(s) {
  s = Math.max(0, Math.floor(s));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${sec}s`;
  return `${sec}s`;
}

// Golden-angle spiral. This is the formation packer: it fills a disc evenly at
// any count with no gaps and no rings, which is what makes 8 men and 800 men
// both look deliberate.
export const GOLDEN = Math.PI * (3 - Math.sqrt(5));
export function spiralXY(i, spacing) {
  const r = spacing * Math.sqrt(i + 0.5);
  const a = i * GOLDEN;
  return [Math.cos(a) * r, Math.sin(a) * r];
}

// Out-param form. At 900 men the array-returning version allocates 54k throwaway
// pairs a second, which is the difference between a smooth run and a GC hitch
// every few seconds on a phone.
export function spiralInto(i, spacing, out, o = 0) {
  const r = spacing * Math.sqrt(i + 0.5);
  const a = i * GOLDEN;
  out[o] = Math.cos(a) * r;
  out[o + 1] = Math.sin(a) * r;
  return out;
}

export function el(tag, cls, html) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
}
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function now() { return performance.now() / 1000; }
