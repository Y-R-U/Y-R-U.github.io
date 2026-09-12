/* Small shared things. No imports, no side effects. */

export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
export const damp = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));

/** Mulberry32 — small, fast, seedable. The Daily run needs the seed. */
export function rngFrom(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const R = { fn: rngFrom((Math.random() * 1e9) | 0) };
export const rnd = () => R.fn();
export const rr = (a, b) => a + R.fn() * (b - a);
export const ri = (a, b) => Math.floor(a + R.fn() * (b - a + 1));
export const pick = arr => arr[Math.floor(R.fn() * arr.length)];
export const shuffled = arr => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(R.fn() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};
export const seedRng = s => { R.fn = rngFrom(s); };

export function hash2(x, y) {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}
export function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  return lerp(lerp(hash2(xi, yi), hash2(xi + 1, yi), u),
              lerp(hash2(xi, yi + 1), hash2(xi + 1, yi + 1), u), v);
}
export function fbm(x, y, oct = 4) {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { s += vnoise(x * f, y * f) * a; f *= 2; a *= 0.5; }
  return s;
}

export const $ = id => document.getElementById(id);
export const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};

export function money$(n) {
  const v = Math.round(Math.abs(n));
  let s;
  if (v >= 1e7) s = (v / 1e6).toFixed(1) + 'M';
  else if (v >= 1e4) s = (v / 1e3).toFixed(v >= 1e5 ? 0 : 1) + 'k';
  else s = v.toLocaleString('en-US');
  return (n < 0 ? '-$' : '$') + s;
}
export const num = n => Math.round(n).toLocaleString('en-US');
export const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
export const plural = (n, s, p) => n === 1 ? `${n} ${s}` : `${n} ${p || s + 's'}`;

/** Time since a saved timestamp, worded the way an idle game should word it. */
export function ago(ms) {
  const s = Math.max(0, ms / 1000);
  if (s < 90) return 'a moment';
  if (s < 5400) return Math.round(s / 60) + ' minutes';
  if (s < 172800) return Math.round(s / 3600) + ' hours';
  return Math.round(s / 86400) + ' days';
}
