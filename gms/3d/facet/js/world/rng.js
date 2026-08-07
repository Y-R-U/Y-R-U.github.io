// Seeded randomness. Every generated thing takes an rng so a scene is reproducible — the critic
// has to be scoring the same village twice.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeRng(seed) {
  const r = mulberry32(typeof seed === 'string' ? hash(seed) : seed);
  r.range = (a, b) => a + r() * (b - a);
  r.int = (a, b) => Math.floor(a + r() * (b - a + 1));
  r.pick = arr => arr[Math.floor(r() * arr.length)];
  r.chance = p => r() < p;
  // Sign-preserving bias toward the middle — for scatter jitter that should cluster, not spread.
  r.bell = (a, b) => a + ((r() + r() + r()) / 3) * (b - a);
  r.sub = tag => makeRng(hash(String(tag)) ^ Math.floor(r() * 0xffffffff));
  return r;
}

function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// Cheap value noise on a lattice. Terrain and scatter density both read from this.
export function noise2(seed = 1) {
  const p = new Uint8Array(512);
  const r = mulberry32(seed);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 256; i++) p[256 + i] = p[i];

  const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
  const grad = (h, x, y) => ((h & 1) ? -x : x) + ((h & 2) ? -y : y);

  const n = (x, y) => {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
    x -= Math.floor(x); y -= Math.floor(y);
    const u = fade(x), v = fade(y);
    const A = p[X] + Y, B = p[X + 1] + Y;
    const lerp = (a, b, t) => a + (b - a) * t;
    return lerp(
      lerp(grad(p[A], x, y), grad(p[B], x - 1, y), u),
      lerp(grad(p[A + 1], x, y - 1), grad(p[B + 1], x - 1, y - 1), u), v) * 0.7;
  };

  n.fbm = (x, y, oct = 4, lac = 2, gain = 0.5) => {
    let s = 0, a = 1, f = 1, norm = 0;
    for (let i = 0; i < oct; i++) { s += n(x * f, y * f) * a; norm += a; a *= gain; f *= lac; }
    return s / norm;
  };
  return n;
}
