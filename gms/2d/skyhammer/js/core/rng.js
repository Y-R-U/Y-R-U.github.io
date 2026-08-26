// Seeded RNG. Every random number in the game comes from here (CONTRACTS §1.6).

export function makeRng(seed) {
  let s = (seed >>> 0) || 0x9e3779b9;
  const f = () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;  s >>>= 0;
    return s / 4294967296;
  };
  return {
    f,
    i: (n) => Math.floor(f() * n),
    range: (a, b) => a + f() * (b - a),
    pick: (arr) => arr[Math.floor(f() * arr.length)],
    seed,
    fork: (salt) => makeRng((s ^ (salt * 2654435761)) >>> 0),
  };
}
