/**
 * Fixed-capacity object pool — the backbone of the "allocate nothing in the hot
 * loop" rule (build plan §7). Items carry `alive` + `idx`; dead slots are recycled
 * via a free stack. The pool grows only if a spawn exceeds capacity (a warning sign).
 */
export interface Poolable {
  alive: boolean;
  idx: number;
}

export class Pool<T extends Poolable> {
  readonly items: T[] = [];
  private free: number[] = [];

  constructor(
    private readonly factory: () => T,
    cap: number,
  ) {
    for (let i = 0; i < cap; i++) {
      const it = factory();
      it.alive = false;
      it.idx = i;
      this.items.push(it);
      this.free.push(cap - 1 - i); // spawn in ascending index order
    }
  }

  spawn(): T {
    let i = this.free.pop();
    if (i === undefined) {
      i = this.items.length;
      const it = this.factory();
      it.idx = i;
      this.items.push(it);
    }
    const it = this.items[i];
    it.alive = true;
    return it;
  }

  release(it: T): void {
    if (!it.alive) return;
    it.alive = false;
    this.free.push(it.idx);
  }

  get aliveCount(): number {
    let n = 0;
    for (const it of this.items) if (it.alive) n++;
    return n;
  }

  releaseAll(): void {
    this.free.length = 0;
    for (let i = 0; i < this.items.length; i++) {
      this.items[i].alive = false;
      this.free.push(this.items.length - 1 - i);
    }
  }
}
