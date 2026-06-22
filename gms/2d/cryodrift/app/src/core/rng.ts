/**
 * Seeded RNG (mulberry32). Keeping randomness seeded + funnelled through the sim
 * keeps it deterministic-ish — part of the multiplayer-fork seam (build plan §15).
 */
export class Rng {
  private s: number;
  constructor(seed = (Math.random() * 2 ** 32) >>> 0) {
    this.s = seed >>> 0;
  }
  /** 0..1 */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
  int(a: number, b: number): number {
    return Math.floor(this.range(a, b + 1));
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
  /** unit vector in a random direction */
  dir(): { x: number; y: number } {
    const a = this.next() * Math.PI * 2;
    return { x: Math.cos(a), y: Math.sin(a) };
  }
  bool(p = 0.5): boolean {
    return this.next() < p;
  }
}
