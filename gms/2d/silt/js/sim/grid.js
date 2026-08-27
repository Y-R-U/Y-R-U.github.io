import { EMPTY, KIND, STATIC, BLOB, NONE } from './materials.js';

export const COLS = 112;
export const ROWS = 224;
export const CHUNK = 16;

// flags bits
export const F_CLEARING = 1;   // in a dissolving chain: frozen, not displaceable
export const F_BURNING  = 2;
export const F_BLOB     = 4;   // owned by a jelly blob; the CA step skips it

/**
 * Struct-of-arrays cell storage plus dirty-chunk scheduling.
 *
 * A settled pile must cost nothing — without chunking, a full board re-scans
 * 25k cells every tick forever. `active` is what this tick processes; `next`
 * accumulates wakes for the tick after. Anything that mutates a cell must go
 * through set/swap so the wake happens, otherwise sand freezes mid-air.
 */
export class Grid {
  constructor(cols = COLS, rows = ROWS) {
    this.cols = cols; this.rows = rows;
    const n = cols * rows;
    this.n = n;
    this.mat = new Uint8Array(n);
    this.tint = new Uint8Array(n);
    this.flags = new Uint8Array(n);
    this.heat = new Uint8Array(n);
    this.life = new Uint8Array(n);
    this.blob = new Uint16Array(n);
    this.clearT = new Uint8Array(n);   // dissolve countdown, F_CLEARING cells only
    this.moved = new Uint8Array(n);

    this.cw = Math.ceil(cols / CHUNK);
    this.ch = Math.ceil(rows / CHUNK);
    this.active = new Uint8Array(this.cw * this.ch);
    this.next = new Uint8Array(this.cw * this.ch);

    this.count = 0;      // non-empty cells; the mass-conservation ledger
    this.tick = 0;
  }

  idx(x, y) { return y * this.cols + x; }
  inb(x, y) { return x >= 0 && y >= 0 && x < this.cols && y < this.rows; }

  /** Wake the chunk holding (x,y), plus neighbours when the cell is on a seam. */
  touch(x, y) {
    const cx = (x / CHUNK) | 0, cy = (y / CHUNK) | 0;
    const cw = this.cw, ch = this.ch, next = this.next;
    next[cy * cw + cx] = 1;
    const lx = x % CHUNK, ly = y % CHUNK;
    const l = lx === 0 && cx > 0, r = lx === CHUNK - 1 && cx < cw - 1;
    const u = ly === 0 && cy > 0, d = ly === CHUNK - 1 && cy < ch - 1;
    if (l) next[cy * cw + cx - 1] = 1;
    if (r) next[cy * cw + cx + 1] = 1;
    if (u) next[(cy - 1) * cw + cx] = 1;
    if (d) next[(cy + 1) * cw + cx] = 1;
    if (l && u) next[(cy - 1) * cw + cx - 1] = 1;
    if (r && u) next[(cy - 1) * cw + cx + 1] = 1;
    if (l && d) next[(cy + 1) * cw + cx - 1] = 1;
    if (r && d) next[(cy + 1) * cw + cx + 1] = 1;
  }

  touchIdx(i) { this.touch(i % this.cols, (i / this.cols) | 0); }

  /** The only sanctioned way to create or destroy material. Keeps `count` true. */
  set(i, m, tint = 0) {
    const was = this.mat[i];
    if (was === EMPTY && m !== EMPTY) this.count++;
    else if (was !== EMPTY && m === EMPTY) this.count--;
    this.mat[i] = m;
    this.tint[i] = tint;
    this.flags[i] = 0;
    this.life[i] = 0;
    this.blob[i] = 0;
    this.clearT[i] = 0;
    this.touchIdx(i);
  }

  clear(i) { this.set(i, EMPTY, 0); }

  /** Movement. Never changes `count` — that is the point. */
  swap(a, b) {
    const m = this.mat[a]; this.mat[a] = this.mat[b]; this.mat[b] = m;
    const t = this.tint[a]; this.tint[a] = this.tint[b]; this.tint[b] = t;
    const f = this.flags[a]; this.flags[a] = this.flags[b]; this.flags[b] = f;
    const h = this.heat[a]; this.heat[a] = this.heat[b]; this.heat[b] = h;
    const l = this.life[a]; this.life[a] = this.life[b]; this.life[b] = l;
    const bl = this.blob[a]; this.blob[a] = this.blob[b]; this.blob[b] = bl;
    const ct = this.clearT[a]; this.clearT[a] = this.clearT[b]; this.clearT[b] = ct;
    this.moved[a] = 1; this.moved[b] = 1;
    this.touchIdx(a); this.touchIdx(b);
  }

  beginTick() {
    this.active.set(this.next);
    this.next.fill(0);
    this.moved.fill(0);
    this.tick++;
  }

  chunkActive(cx, cy) { return this.active[cy * this.cw + cx] === 1; }

  wakeAll() { this.next.fill(1); this.active.fill(1); }

  /** Recount from scratch — the oracle's cross-check against `count`. */
  recount() {
    let c = 0;
    const m = this.mat;
    for (let i = 0; i < m.length; i++) if (m[i] !== EMPTY) c++;
    return c;
  }

  fill(x0, y0, w, h, m, tint = 0) {
    for (let y = y0; y < y0 + h; y++)
      for (let x = x0; x < x0 + w; x++)
        if (this.inb(x, y)) this.set(this.idx(x, y), m, tint);
  }

  reset() {
    this.mat.fill(0); this.tint.fill(0); this.flags.fill(0);
    this.heat.fill(0); this.life.fill(0); this.blob.fill(0); this.moved.fill(0);
    this.clearT.fill(0);
    this.count = 0; this.tick = 0;
    this.active.fill(0); this.next.fill(0);
  }
}

export const isSolidKind = (m) => KIND[m] === STATIC || KIND[m] === BLOB;
export const isEmptyKind = (m) => KIND[m] === NONE;
