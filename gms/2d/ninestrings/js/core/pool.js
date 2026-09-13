// Fixed-capacity object pool. Nothing in the frame loop allocates, so the GC
// never decides to collect 400 zombies mid-boss.
//
// The active set is kept dense: freeing swaps the last active object into the
// hole, so `each` is a straight walk with no holes and no `if (alive)` test.

export function makePool(factory, reset, cap = 4096) {
  const items = new Array(cap);
  let count = 0;           // items[0..count) are active
  let made = 0;

  // Pre-warm a quarter so the first heavy wave does not allocate.
  const warm = Math.min(cap, Math.max(8, cap >> 2));
  for (let i = 0; i < warm; i++) { items[i] = factory(); items[i].alive = false; items[i]._i = i; made++; }

  return {
    alloc() {
      if (count >= cap) return null;
      let o = items[count];
      if (o === undefined) { o = items[count] = factory(); made++; }
      o._i = count;
      o.alive = true;
      reset(o);
      count++;
      return o;
    },

    free(o) {
      if (!o.alive) return;
      o.alive = false;
      const i = o._i;
      const last = --count;
      if (i !== last) {
        const moved = items[last];
        items[last] = o;
        items[i] = moved;
        moved._i = i;
        o._i = last;
      }
    },

    // Iterates active only. Safe to free the CURRENT item during iteration -
    // the swap-back is handled by stepping the index back.
    each(fn) {
      for (let i = 0; i < count; i++) {
        const o = items[i];
        fn(o);
        if (items[i] !== o) i--;
      }
    },

    at(i) { return items[i]; },
    get count() { return count; },
    get capacity() { return cap; },
    get allocated() { return made; },
    clear() { for (let i = 0; i < count; i++) items[i].alive = false; count = 0; },
  };
}
