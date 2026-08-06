// The RNG is an integer, not a closure (DECISIONS D6). A closure PRNG cannot survive
// deserialize(serialize(g)), and that round-trip is a declared invariant.

export function mix32(a) {
  let t = (a + 0x9e3779b9) | 0;
  t = Math.imul(t ^ (t >>> 16), 0x21f0aaad);
  t = Math.imul(t ^ (t >>> 15), 0x735a2d97);
  return (t ^ (t >>> 15)) >>> 0;
}

export function hash(...parts) {
  let s = 0x811c9dc5 | 0;
  for (const p of parts) s = mix32(s ^ (p | 0)) | 0;
  return s | 0;
}

// A throwaway stream derived from public data only. The AI uses this so aiMove stays a pure
// function of the view — it must never touch game.rng, which encodes hidden placement history.
export function makeRng(seed) {
  let s = seed | 0;
  const next = () => { s = (s + 0x6d2b79f5) | 0; return mix32(s); };
  const float = () => next() / 4294967296;
  return {
    next, float,
    int: n => Math.floor(float() * n),
    pick: arr => arr[Math.floor(float() * arr.length)],
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(float() * (i + 1));
        const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
      }
      return arr;
    },
  };
}
