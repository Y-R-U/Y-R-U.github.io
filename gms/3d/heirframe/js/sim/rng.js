// Seeded, splittable RNG. sfc32 core, string/number seeds hashed with cyrb128.

export function hashString(str) {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4; h2 ^= h1; h3 ^= h1; h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

export function hash32(...parts) {
  return hashString(parts.map(String).join('\u0001'))[0];
}

export function createRng(seed = 1) {
  let [a, b, c, d] = Array.isArray(seed) && seed.length === 4
    ? seed.map(x => x >>> 0)
    : hashString(String(seed));

  function next() {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    const t = (a + b | 0) + d | 0;
    d = d + 1 | 0;
    a = b ^ b >>> 9;
    b = c + (c << 3) | 0;
    c = (c << 21 | c >>> 11);
    c = c + t | 0;
    return (t >>> 0) / 4294967296;
  }
  for (let i = 0; i < 12; i++) next();

  const rng = {
    next,
    float: next,
    range: (lo, hi) => lo + (hi - lo) * next(),
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    chance: p => next() < p,
    pick: arr => arr[Math.floor(next() * arr.length)],
    sign: () => (next() < 0.5 ? -1 : 1),
    // entries: array of [value, weight] or objects with .weight
    weighted(entries, weightKey = 'weight') {
      let total = 0;
      for (const e of entries) total += Array.isArray(e) ? e[1] : (e[weightKey] ?? 1);
      if (total <= 0) return Array.isArray(entries[0]) ? entries[0][0] : entries[0];
      let r = next() * total;
      for (const e of entries) {
        const w = Array.isArray(e) ? e[1] : (e[weightKey] ?? 1);
        if ((r -= w) < 0) return Array.isArray(e) ? e[0] : e;
      }
      const last = entries[entries.length - 1];
      return Array.isArray(last) ? last[0] : last;
    },
    shuffle(arr) {
      const out = arr.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
    sample(arr, n) { return rng.shuffle(arr).slice(0, Math.min(n, arr.length)); },
    gauss(mean = 0, sd = 1) {
      const u = Math.max(1e-12, next()), v = next();
      return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
    // independent child stream; does not advance the parent
    split(label) { return createRng(hashString(`${a},${b},${c},${d}|${label}`)); },
    // child stream that also advances the parent (for sequential spawning)
    fork() { return createRng([rng.int(0, 2 ** 32 - 1), rng.int(0, 2 ** 32 - 1), rng.int(0, 2 ** 32 - 1), rng.int(0, 2 ** 32 - 1)]); },
    get state() { return [a >>> 0, b >>> 0, c >>> 0, d >>> 0]; },
    set state(s) { [a, b, c, d] = s.map(x => x >>> 0); },
  };
  return rng;
}

// Stream derived purely from labels, e.g. rngFor(saveSeed, 'contract', 42)
export function rngFor(...parts) {
  return createRng(hashString(parts.map(String).join('\u0001')));
}
