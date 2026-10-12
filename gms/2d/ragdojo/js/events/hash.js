// Seeded randomness the server must be able to reproduce byte for byte (see docs/EVENTS.md).
// FNV-1a 32 over the UTF-8 bytes, finished with murmur3's fmix32. No Math.random anywhere.

const enc = new TextEncoder();

export function hash32(str) {
  let h = 0x811c9dc5;
  for (const b of enc.encode(String(str))) h = Math.imul(h ^ b, 0x01000193);
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The die for one turn. `turn` is 0-based. Same account + event + turn = same face, forever. */
export const die = (uid, eventId, turn) => 1 + (hash32(`die|${uid}|${eventId}|${turn}`) % 6);
