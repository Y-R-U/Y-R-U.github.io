// Seeded RNG — deterministic per seed string so every run is reproducible.
// xmur3 hashes a string to a 32-bit seed; mulberry32 is the PRNG.
(function (global) {
  function xmur3(str) {
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

  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function rngFrom(seedStr) {
    const seed = xmur3(String(seedStr))();
    const next = mulberry32(seed);
    return {
      next,                                   // float [0,1)
      int: (n) => Math.floor(next() * n),     // int [0,n)
      range: (a, b) => a + Math.floor(next() * (b - a + 1)),
      chance: (p) => next() < p,
      pick: (arr) => arr[Math.floor(next() * arr.length)],
      shuffle: (arr) => {
        const a = arr.slice();
        for (let i = a.length - 1; i > 0; i--) {
          const j = Math.floor(next() * (i + 1));
          [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
      },
    };
  }

  function randomSeed() {
    const words = ["ash", "veil", "hollow", "rust", "moth", "salt", "dim", "echo",
      "grave", "fen", "mire", "null", "void", "gloam", "wane", "hush"];
    const r = Math.floor(Math.random() * 1e9);
    return words[r % words.length] + "-" + (r % 9973);
  }

  global.HollowRNG = { rngFrom, randomSeed };
})(window);
