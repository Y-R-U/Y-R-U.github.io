// Amounts are tracked in 64ths of an item so a 0.25 sub-block placement (1/64 of a block) is exact.
export const Q = 64;
export const HOTBAR = 9;
export const BACKPACK = 27;
export const SIZE = HOTBAR + BACKPACK;

const toQ = (n) => Math.round(n * Q);

export class Inventory {
  constructor(items, bus = null, size = SIZE) {
    this.items = items;
    this.bus = bus;
    this.size = size;
    this.slots = new Array(size).fill(null);
    this.sel = 0;
    this.creative = false;
  }

  emit(ev, data) { this.bus?.emit?.(ev, data); }
  changed(idx) { this.emit('inv:change', { slots: idx == null ? null : [].concat(idx) }); }

  def(id) { return this.items.get(id); }
  stackQ(id) { return (this.def(id)?.stack ?? 64) * Q; }
  qOf(s) { return s ? s.n * Q + (s.f || 0) : 0; }
  setQ(s, q) { s.n = Math.floor(q / Q); s.f = q - s.n * Q; }

  makeSlot(id, q) {
    const d = this.def(id);
    const s = { id, n: 0, f: 0 };
    if (d?.tool) s.dur = d.tool.durability;
    this.setQ(s, q);
    return s;
  }

  view(i) {
    const s = this.slots[i];
    if (!s) return null;
    const item = this.def(s.id);
    return { slot: i, id: s.id, n: s.n + (s.f || 0) / Q, count: s.n, frac: (s.f || 0) / Q,
      dur: s.dur, maxDur: item?.tool?.durability, item, block: item?.block || 0,
      infinite: this.creative };
  }
  held() { return this.view(this.sel); }

  select(i) {
    i = ((i % HOTBAR) + HOTBAR) % HOTBAR;
    if (i === this.sel) return;
    this.sel = i;
    this.emit('inv:select', { slot: i });
  }

  count(id) {
    let q = 0;
    for (const s of this.slots) if (s && s.id === id) q += this.qOf(s);
    return q / Q;
  }

  canAfford(n = 1, id = this.slots[this.sel]?.id) {
    if (this.creative) return id != null;
    if (id == null) return false;
    return this.count(id) * Q >= toQ(n) - 1e-9;
  }

  // Takes from the held slot first, then from other stacks of the same item.
  consume(n = 1) {
    const s = this.slots[this.sel];
    if (!s) return false;
    if (this.creative) return true;
    return this.removeId(s.id, n, this.sel);
  }

  removeId(id, n, first = -1) {
    let need = toQ(n);
    if (need <= 0) return true;
    if (this.count(id) * Q < need) return false;
    const order = first >= 0 ? [first, ...this.slots.keys()] : [...this.slots.keys()];
    const touched = new Set();
    for (const i of order) {
      const s = this.slots[i];
      if (!s || s.id !== id || touched.has(i)) continue;
      touched.add(i);
      const q = this.qOf(s);
      const take = Math.min(q, need);
      need -= take;
      if (q - take <= 0) this.slots[i] = null; else this.setQ(s, q - take);
      if (!need) break;
    }
    this.changed([...touched]);
    return true;
  }

  // Returns the overflow (in items) that didn't fit.
  add(id, n = 1) {
    if (!this.def(id)) return n;
    let q = toQ(n);
    if (q <= 0) return 0;
    const cap = this.stackQ(id);
    const touched = [];
    if (cap > Q || !this.def(id).tool) {
      for (let i = 0; i < this.size && q > 0; i++) {
        const s = this.slots[i];
        if (!s || s.id !== id || s.dur != null) continue;
        const room = cap - this.qOf(s);
        if (room <= 0) continue;
        const put = Math.min(room, q);
        this.setQ(s, this.qOf(s) + put);
        q -= put; touched.push(i);
      }
    }
    for (let i = 0; i < this.size && q > 0; i++) {
      if (this.slots[i]) continue;
      const put = Math.min(cap, q);
      this.slots[i] = this.makeSlot(id, put);
      q -= put; touched.push(i);
    }
    if (touched.length) this.changed(touched);
    return q / Q;
  }

  // Place a raw slot object (from a cache or another inventory); returns what didn't fit (or null).
  addSlot(slot) {
    if (!slot) return null;
    if (slot.dur != null) {
      const i = this.slots.indexOf(null);
      if (i < 0) return slot;
      this.slots[i] = { ...slot };
      this.changed(i);
      return null;
    }
    const left = this.add(slot.id, this.qOf(slot) / Q);
    return left > 0 ? this.makeSlot(slot.id, toQ(left)) : null;
  }

  swap(a, b) {
    if (a === b) return;
    [this.slots[a], this.slots[b]] = [this.slots[b], this.slots[a]];
    this.changed([a, b]);
  }

  // Merge into a matching stack where possible, otherwise swap.
  move(from, to) {
    const a = this.slots[from], b = this.slots[to];
    if (!a || from === to) return;
    if (b && b.id === a.id && a.dur == null && b.dur == null) {
      const room = this.stackQ(a.id) - this.qOf(b);
      const put = Math.min(room, this.qOf(a));
      if (put > 0) {
        this.setQ(b, this.qOf(b) + put);
        const left = this.qOf(a) - put;
        if (left <= 0) this.slots[from] = null; else this.setQ(a, left);
        this.changed([from, to]);
        return;
      }
    }
    this.swap(from, to);
  }

  // Half of the stack (rounded up whole items stay) goes to `to`, or the first empty slot.
  split(from, to = -1) {
    const a = this.slots[from];
    if (!a || a.dur != null || a.n < 2) return false;
    if (to < 0) to = this.slots.indexOf(null);
    if (to < 0 || this.slots[to]) return false;
    const half = Math.floor(a.n / 2);
    a.n -= half;
    this.slots[to] = this.makeSlot(a.id, half * Q);
    this.changed([from, to]);
    return true;
  }

  setSlot(i, id, n = 1) {
    this.slots[i] = id == null ? null : this.makeSlot(id, toQ(n));
    this.changed(i);
  }

  // Returns true if the tool broke.
  wear(i = this.sel, amount = 1, neverBreak = false) {
    const s = this.slots[i];
    if (!s || s.dur == null || this.creative || neverBreak) return false;
    s.dur -= amount;
    if (s.dur <= 0) {
      this.slots[i] = null;
      this.emit('inv:break', { slot: i, id: s.id });
      this.changed(i);
      return true;
    }
    this.changed(i);
    return false;
  }

  takeBackpack() {
    const out = [];
    for (let i = HOTBAR; i < this.size; i++) if (this.slots[i]) { out.push(this.slots[i]); this.slots[i] = null; }
    if (out.length) this.changed(null);
    return out;
  }
  takeAll() {
    const out = this.slots.filter(Boolean);
    this.slots.fill(null);
    if (out.length) this.changed(null);
    return out;
  }
  clear() { this.slots.fill(null); this.changed(null); }

  // Build mode hotbar: every slot shows a block from the palette with an infinite count.
  fillCreativeHotbar(ids) {
    for (let i = 0; i < HOTBAR; i++) this.slots[i] = ids[i] != null ? this.makeSlot(ids[i], 64 * Q) : null;
    this.changed(null);
  }

  serialize() {
    return { sel: this.sel, slots: this.slots.map((s) => (s ? { ...s } : null)) };
  }
  load(data) {
    this.slots = new Array(this.size).fill(null);
    (data?.slots || []).slice(0, this.size).forEach((s, i) => {
      if (s && this.def(s.id)) this.slots[i] = { id: s.id, n: s.n | 0, f: s.f | 0, ...(s.dur != null ? { dur: s.dur } : {}) };
    });
    this.sel = (data?.sel | 0) % HOTBAR;
    this.changed(null);
  }
}
