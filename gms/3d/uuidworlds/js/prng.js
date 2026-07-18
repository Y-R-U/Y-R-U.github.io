// prng.js — base62 UUIDs + deterministic seeded streams.
// Three-free: runs in node for determinism tests.

export const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
export const UUID_LEN = 32;

const IDX = {};
for (let i = 0; i < 62; i++) IDX[ALPHABET[i]] = i;

export function charVal(c) { return IDX[c] ?? 0; }

export function isUuid(s) {
  if (typeof s !== 'string' || s.length !== UUID_LEN) return false;
  for (const c of s) if (!(c in IDX)) return false;
  return true;
}

// xmur3 string hash → stream of 32-bit seeds
export function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

// sfc32 PRNG — fast, solid distribution
export function sfc32(a, b, c, d) {
  return function () {
    a |= 0; b |= 0; c |= 0; d |= 0;
    const t = (a + b | 0) + d | 0;
    d = d + 1 | 0;
    a = b ^ (b >>> 9);
    b = c + (c << 3) | 0;
    c = (c << 21) | (c >>> 11);
    c = c + t | 0;
    return (t >>> 0) / 4294967296;
  };
}

// A labelled random stream: same uuid + label ⇒ same sequence, forever.
export class Rand {
  constructor(uuid, label) {
    const g = xmur3(uuid + '·' + label);
    this.f = sfc32(g(), g(), g(), g());
    for (let i = 0; i < 8; i++) this.f(); // warm up
  }
  float() { return this.f(); }
  range(a, b) { return a + (b - a) * this.f(); }
  int(a, b) { return a + Math.floor(this.f() * (b - a + 1)); } // inclusive
  pick(arr) { return arr[Math.floor(this.f() * arr.length)]; }
  chance(p) { return this.f() < p; }
  sign() { return this.f() < 0.5 ? -1 : 1; }
  shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.f() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
}

export function stream(uuid, label) { return new Rand(uuid, label); }

// The travel chain: next world's UUID is a pure function of this one.
export function nextUuid(uuid) {
  const r = new Rand(uuid, 'next-world');
  let s = '';
  for (let i = 0; i < UUID_LEN; i++) s += ALPHABET[Math.floor(r.float() * 62)];
  return s;
}

export function randomUuid() {
  let s = '';
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const buf = new Uint32Array(UUID_LEN);
    crypto.getRandomValues(buf);
    for (let i = 0; i < UUID_LEN; i++) s += ALPHABET[buf[i] % 62];
  } else {
    for (let i = 0; i < UUID_LEN; i++) s += ALPHABET[Math.floor(Math.random() * 62)];
  }
  return s;
}
