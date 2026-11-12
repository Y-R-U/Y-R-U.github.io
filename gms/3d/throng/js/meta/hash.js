// FNV-1a with a murmur3 finaliser. The finaliser matters: plain FNV ends on a multiply, so keys that
// differ only in the last character land close together and neighbouring ranks pick near-identical names.
export function hash32(key) {
  const s = String(key);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}
export const unit = (key) => hash32(key) / 4294967296;
export const pickBy = (key, arr) => arr[hash32(key) % arr.length];

export function rngFrom(key) {
  let a = hash32(key) || 1;
  return () => { a ^= a << 13; a >>>= 0; a ^= a >>> 17; a ^= a << 5; a >>>= 0; return a / 4294967296; };
}
