import { Grid, F_CLEARING, F_BLOB } from './grid.js';
import { EMPTY, JELLY, KIND, DENSITY, LIQUID, GAS } from './materials.js';

/**
 * Jelly is a SOFT BODY, not a cellular automaton.
 *
 * Every other material in SILT is a per-cell rule. Jelly deliberately is not:
 * a CA cannot wobble, cannot remember it was hit, and cannot squash as one
 * object. So a blob owns a set of cells, a centroid, a velocity and a single
 * scalar deformation spring `q`, and every tick it is RASTERISED back into the
 * plain grid. The grid stays the one source of truth, which is what lets
 * clears.js keep flood-filling tint components without knowing blobs exist.
 *
 * The shape model
 * ---------------
 * A blob of n cells is an area-preserving ellipse: semi-axes a = R/q and
 * b = R*q with R = sqrt(n/PI), so PI*a*b === n for every value of q.
 *   q = 1    round
 *   q < 1    squashed — flat and WIDE (this is how load spreads a blob)
 *   q > 1    stretched — tall and thin (free fall)
 * `q` is driven by a damped spring toward a rest value that depends on the
 * weight sitting on top of the blob, and an impact kicks the spring's velocity.
 * That single scalar is the entire wobble.
 *
 * Why an ellipse and not a remembered point cloud: scaling a fixed point cloud
 * and rounding it back to the lattice tears holes in the body (offsets -2..2 at
 * scale 2 land on -4,-2,0,2,4). Selecting the n NEAREST ADMISSIBLE cells to an
 * ellipse instead is gap-free by construction, yields exactly n cells always,
 * and makes the blob mould itself around terrain for free: cells that would
 * land inside rock are simply not admissible, so the body flows around it and
 * its centroid is pushed out. Collision response is therefore not a separate
 * system — it falls out of the rasteriser.
 *
 * The ledger
 * ----------
 * |target| === |current| === n, so |entering| === |exiting| exactly. Any fluid
 * standing in an entering cell is salvaged and re-placed into an exiting cell,
 * a permutation with no source and no sink. `g.count` is therefore untouched by
 * blob motion, which the ledger gate checks after every single tick.
 */

const TAU_R = Math.sqrt(1 / Math.PI);

export const GRAVITY = 0.055;     // cells / tick^2  (~198 cells/s^2)
export const VMAX = 2.0;          // cells / tick — must stay below a blob radius
export const SPRING_K = 0.055;    // ~0.45 s wobble period
export const SPRING_C = 0.20;     // damping ratio ~0.43: three visible bounces
export const Q_MIN = 0.34;        // hard pancake
export const Q_MAX = 1.90;        // hard stretch
export const REST_Q = 0.88;       // a resting lump is already slightly flat
export const LOAD_SQUASH = 0.62;  // how hard weight above flattens the blob
export const LOAD_LOOK = 26;      // rows of overburden that count toward load
export const LOAD_UNIT = 90;      // density normaliser (sand 60, crystal 200)
export const IMPACT_MIN = 0.35;   // below this a landing does not register
export const IMPACT_GAIN = 0.30;
export const BOUNCE = 0.12;
export const GROW = 1.55;         // candidate window, in ellipse radii
const BANDS = 128;                // radial buckets for the counting sort
const MAX_ID = 65535;             // g.blob is a Uint16Array

let _tmpVel = 0;                  // silences unused warnings in strict bundlers
void _tmpVel; void Grid;

export class Blobs {
  constructor(g) {
    this.g = g;
    this.blobs = [];
    this.byId = new Map();
    this._nextId = 1;
    this.ticks = 0;

    /** Set false to disable merging — the falsification arm in jellysim uses this. */
    this.merging = true;
    this.gravity = GRAVITY;

    const n = g.n;
    this._cand = new Int32Array(n);     // candidate cells inside the window
    this._band = new Uint8Array(n);     // radial bucket per candidate
    this._order = new Int32Array(n);    // candidates, counting-sorted by bucket
    this._cnt = new Int32Array(BANDS + 1);
    this._mark = new Int32Array(n);     // stamped membership scratch
    this._markStamp = 0;
    this._q = new Int32Array(n);        // BFS queue for split detection
    this._colTop = new Int32Array(g.cols);
    this._colSeen = new Int32Array(g.cols);
    this._colStamp = 0;
    this._enter = new Int32Array(n);
    this._exit = new Int32Array(n);
    this._payI = new Int32Array(n);
    this._payM = new Uint8Array(n);
    this._payT = new Uint8Array(n);
    this._payH = new Uint8Array(n);
    this._payL = new Uint8Array(n);
    this._payF = new Uint8Array(n);
  }

  // ------------------------------------------------------------------ public

  /**
   * Create a blob from grid cells. `cells` is [{x,y}] (or flat indices).
   * The cells are written into the grid as JELLY of `tint`, flagged F_BLOB.
   * @returns blobId, or 0 when nothing was placed.
   */
  spawn(cells, tint = 0) {
    const g = this.g;
    const stamp = ++this._markStamp;
    const mark = this._mark;
    const list = [];
    for (let k = 0; k < cells.length; k++) {
      const c = cells[k];
      let i;
      if (typeof c === 'number') { i = c; if (i < 0 || i >= g.n) continue; }
      else {
        if (!g.inb(c.x, c.y)) continue;
        i = g.idx(c.x, c.y);
      }
      if (mark[i] === stamp) continue;      // a duplicate would inflate n
      mark[i] = stamp;
      list.push(i);
    }
    if (list.length === 0) return 0;

    const id = this._newId();
    if (id === 0) return 0;

    const b = this._make(id, tint, list);
    // A spawned shape keeps its own aspect and then springs toward round: an
    // I-piece of jelly lands as a wide splat and jiggles up, which is the whole
    // reason the piece is worth dropping as jelly.
    b.q = clamp(Math.sqrt(b.hHalf / Math.max(0.5, b.wHalf)), Q_MIN, Q_MAX);
    b.vq = 0;

    for (let k = 0; k < list.length; k++) {
      const i = list[k];
      g.set(i, JELLY, tint);
      g.flags[i] = F_BLOB;
      g.blob[i] = id;
    }
    this.blobs.push(b);
    this.byId.set(id, b);
    return id;
  }

  /** Remove every blob and the jelly it owns. Safe to call on an empty grid. */
  clearAll() {
    const g = this.g;
    for (const b of this.blobs) {
      for (let k = 0; k < b.n; k++) {
        const i = b.cells[k];
        if (g.mat[i] === JELLY && g.blob[i] === b.id) g.set(i, EMPTY, 0);
      }
      b.alive = false;
    }
    this.blobs.length = 0;
    this.byId.clear();
    this._nextId = 1;
  }

  /** One soft-body tick. Called from World.tick BEFORE the cellular step. */
  step(rng, stats) {
    this.ticks++;
    const live = [];

    // 1. reconcile — the world may have eaten cells out from under us (a chain
    //    dissolved them, fire melted them). The blob is not authoritative; the
    //    grid is, so we re-derive the cell list from the grid every tick.
    for (const b of this.blobs) {
      const lost = this._reconcile(b);
      if (b.n === 0) { b.alive = false; this.byId.delete(b.id); continue; }
      if (lost) this._split(b, live);
      live.push(b);
    }
    this.blobs = live;
    for (const b of live) this.byId.set(b.id, b);

    // 2. lowest first, so a stack of blobs settles from the bottom in one tick
    //    instead of one blob per tick. Ties by id keep it deterministic.
    live.sort((p, r) => (r.py - p.py) || (p.id - r.id));

    for (const b of live) this._physics(b, rng);

    if (this.merging) this._mergePass();

    if (stats) stats.blobs = this.blobs.length;
    return this.blobs.length;
  }

  list() { return this.blobs; }
  get(id) { return this.byId.get(id) || null; }
  blobAt(i) { const id = this.g.blob[i]; return id ? (this.byId.get(id) || null) : null; }
  get cellCount() { let c = 0; for (const b of this.blobs) c += b.n; return c; }

  // ------------------------------------------------------------- construction

  _newId() {
    for (let tries = 0; tries < MAX_ID; tries++) {
      const id = this._nextId;
      this._nextId = this._nextId >= MAX_ID ? 1 : this._nextId + 1;
      if (!this.byId.has(id)) return id;
    }
    return 0;
  }

  _make(id, tint, list) {
    const b = {
      id, tint, alive: true,
      n: list.length,
      cap: Math.max(16, list.length),
      cells: null,
      px: 0, py: 0, vx: 0, vy: 0,
      q: 1, vq: 0, R: 0, a: 0, b: 0,
      wHalf: 1, hHalf: 1,
      grounded: false, impact: 0, load: 0,
      frozen: false, age: 0,
    };
    b.cells = new Int32Array(b.cap);
    b.cells.set(list);
    this._measure(b);
    return b;
  }

  /** Centroid, equal-area radius and the raw half-extents of the cell set. */
  _measure(b) {
    const cols = this.g.cols;
    let sx = 0, sy = 0, minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
    for (let k = 0; k < b.n; k++) {
      const i = b.cells[k];
      const x = i % cols, y = (i / cols) | 0;
      sx += x; sy += y;
      if (x < minx) minx = x; if (x > maxx) maxx = x;
      if (y < miny) miny = y; if (y > maxy) maxy = y;
    }
    b.px = sx / b.n; b.py = sy / b.n;
    b.wHalf = (maxx - minx + 1) / 2;
    b.hHalf = (maxy - miny + 1) / 2;
    b.R = Math.sqrt(b.n) * TAU_R;
    this._axes(b);
  }

  _axes(b) {
    b.a = Math.max(0.7, b.R / b.q);
    b.b = Math.max(0.7, b.R * b.q);
  }

  _grow(b, need) {
    if (need <= b.cap) return;
    const cap = Math.max(need, b.cap * 2);
    const next = new Int32Array(cap);
    next.set(b.cells.subarray(0, b.n));
    b.cells = next; b.cap = cap;
  }

  // ---------------------------------------------------------------- reconcile

  /** Drop cells the grid no longer agrees we own. @returns true if any were lost. */
  _reconcile(b) {
    const g = this.g, mat = g.mat, flags = g.flags, blob = g.blob;
    const cells = b.cells;
    let w = 0, frozen = false;
    for (let k = 0; k < b.n; k++) {
      const i = cells[k];
      if (mat[i] !== JELLY) continue;
      if ((flags[i] & F_BLOB) === 0) continue;
      if (blob[i] !== b.id) continue;
      if (flags[i] & F_CLEARING) frozen = true;
      cells[w++] = i;
    }
    const lost = w !== b.n;
    b.n = w;
    b.frozen = frozen;
    if (w > 0) { b.R = Math.sqrt(w) * TAU_R; this._axes(b); }
    return lost;
  }

  /**
   * A blob that lost cells may have been cut in two (a chain dissolved a waist,
   * fire ate a bridge). Leaving it as one body would let a detached lump
   * teleport toward the parent's centroid, so split it into real blobs.
   * Only runs on the tick cells were lost — it is not a per-tick cost.
   */
  _split(b, out) {
    const g = this.g, cols = g.cols;
    const mark = this._mark, stamp = ++this._markStamp;
    for (let k = 0; k < b.n; k++) mark[b.cells[k]] = stamp;

    const seen = new Set();
    const groups = [];
    const q = this._q;
    for (let k = 0; k < b.n; k++) {
      const s = b.cells[k];
      if (seen.has(s)) continue;
      let head = 0, tail = 0;
      q[tail++] = s; seen.add(s);
      const grp = [];
      while (head < tail) {
        const i = q[head++];
        grp.push(i);
        const x = i % cols;
        if (x > 0 && mark[i - 1] === stamp && !seen.has(i - 1)) { seen.add(i - 1); q[tail++] = i - 1; }
        if (x < cols - 1 && mark[i + 1] === stamp && !seen.has(i + 1)) { seen.add(i + 1); q[tail++] = i + 1; }
        if (i >= cols && mark[i - cols] === stamp && !seen.has(i - cols)) { seen.add(i - cols); q[tail++] = i - cols; }
        if (i + cols < g.n && mark[i + cols] === stamp && !seen.has(i + cols)) { seen.add(i + cols); q[tail++] = i + cols; }
      }
      groups.push(grp);
    }
    if (groups.length <= 1) return;

    groups.sort((p, r) => r.length - p.length || p[0] - r[0]);
    const keep = groups[0];
    this._grow(b, keep.length);
    b.n = keep.length;
    b.cells.set(keep);
    this._measure(b);

    for (let k = 1; k < groups.length; k++) {
      const id = this._newId();
      if (id === 0) {   // out of ids: hand the orphans back to the parent
        const grp = groups[k];
        this._grow(b, b.n + grp.length);
        for (const i of grp) b.cells[b.n++] = i;
        this._measure(b);
        continue;
      }
      const nb = this._make(id, b.tint, groups[k]);
      nb.q = b.q; nb.vq = b.vq; nb.vx = b.vx; nb.vy = b.vy;
      this._axes(nb);
      for (const i of groups[k]) this.g.blob[i] = id;
      this.byId.set(id, nb);
      out.push(nb);
    }
  }

  // ------------------------------------------------------------------ physics

  _physics(b, rng) {
    b.age++;
    b.impact = 0;
    if (b.frozen) { b.vy = 0; b.vx = 0; return; }   // mid-dissolve: hold still

    b.vy += this.gravity;
    const cap = Math.min(VMAX, Math.max(1.0, b.R));
    if (b.vy > cap) b.vy = cap;
    if (b.vy < -cap) b.vy = -cap;
    b.vx *= 0.86;
    if (Math.abs(b.vx) < 0.01) b.vx = 0;

    b.load = this._load(b);

    // Spring. Airborne it stretches with speed; grounded it is squashed by its
    // own weight plus whatever is standing on it.
    const qRest = b.grounded
      ? clamp(REST_Q - b.load * LOAD_SQUASH, Q_MIN, 1.0)
      : clamp(1 + Math.min(0.30, Math.abs(b.vy) * 0.15), 1.0, Q_MAX);
    b.vq += -SPRING_K * (b.q - qRest) - SPRING_C * b.vq;
    b.q = clamp(b.q + b.vq, Q_MIN, Q_MAX);
    if (b.q <= Q_MIN || b.q >= Q_MAX) b.vq *= 0.5;
    this._axes(b);

    const prevPy = b.py;

    // Try the full move; back off to half, then to deform-in-place. A rejection
    // only happens when the body genuinely cannot fit, e.g. wedged in a pocket.
    let placed = 0;
    let usedX = b.px, usedY = b.py;
    for (let attempt = 0; attempt < 3; attempt++) {
      const f = attempt === 0 ? 1 : attempt === 1 ? 0.5 : 0;
      usedX = b.px + b.vx * f;
      usedY = b.py + b.vy * f;
      placed = this._target(b, usedX, usedY);
      if (placed >= b.n) break;
      placed = 0;
    }
    if (placed < b.n) {
      // Cannot even deform in place — revert the spring and leave the cells be.
      b.q = clamp(b.q - b.vq, Q_MIN, Q_MAX);
      b.vq = 0;
      this._axes(b);
      b.vy = 0;
      b.grounded = true;
      return;
    }

    this._commit(b);

    const cols = this.g.cols;
    let sx = 0, sy = 0;
    for (let k = 0; k < b.n; k++) { const i = b.cells[k]; sx += i % cols; sy += (i / cols) | 0; }
    const acx = sx / b.n, acy = sy / b.n;

    // The rasteriser IS the collision solver: contact is simply "it asked to
    // fall and did not". Comparing travel-wanted with travel-achieved is stable
    // where an absolute penetration test is not — a resting blob still asks to
    // move by one tick of gravity every tick, and must stay grounded.
    const wanted = usedY - prevPy;
    const fell = acy - prevPy;
    b.px += (acx - b.px) * 0.5;
    b.py = acy;

    if (wanted > 0.01 && fell < wanted * 0.5) {
      const v = b.vy;
      if (v > IMPACT_MIN) { b.impact = v; b.vq -= Math.min(0.55, v * IMPACT_GAIN); }
      b.vy = v > 0.9 ? -v * BOUNCE : 0;
      b.grounded = true;
    } else if (fell < wanted - 0.5) {
      b.vy = 0;                    // squeezed upward by something below
      b.grounded = true;
    } else {
      b.grounded = false;
    }

    // Squeezed jelly has to pick a side to bulge toward. Without a coin flip a
    // perfectly symmetric load leaves it balanced forever and JELLY LAB never
    // reaches a wall. This is the module's only random draw.
    if (b.grounded && b.load > 0.2 && rng && rng.chance(0.05)) {
      b.vx += rng.chance(0.5) ? -0.08 : 0.08;
    }
  }

  /** Weight of the overburden above the blob, normalised to roughly 0..1. */
  _load(b) {
    const g = this.g, cols = g.cols, mat = g.mat, flags = g.flags, blob = g.blob;
    const top = this._colTop, seen = this._colSeen, stamp = ++this._colStamp;
    let minx = 1e9, maxx = -1e9;
    for (let k = 0; k < b.n; k++) {
      const i = b.cells[k];
      const x = i % cols, y = (i / cols) | 0;
      if (seen[x] !== stamp) { seen[x] = stamp; top[x] = y; }
      else if (y < top[x]) top[x] = y;
      if (x < minx) minx = x; if (x > maxx) maxx = x;
    }
    let sum = 0, ncol = 0;
    for (let x = minx; x <= maxx; x++) {
      if (seen[x] !== stamp) continue;
      ncol++;
      let y = top[x] - 1;
      for (let s = 0; s < LOAD_LOOK && y >= 0; s++, y--) {
        const i = y * cols + x;
        const m = mat[i];
        if (m === EMPTY) break;
        if ((flags[i] & F_BLOB) && blob[i] === b.id) break;
        sum += DENSITY[m];
      }
    }
    return ncol ? Math.min(1, sum / (ncol * LOAD_LOOK * LOAD_UNIT)) : 0;
  }

  // -------------------------------------------------------------- rasterising

  /**
   * Choose the n admissible cells nearest (in ellipse metric) to the target
   * centroid. Result lands in this._order[0..n). @returns how many were found.
   *
   * Ordering is a counting sort over BANDS radial buckets rather than a
   * comparison sort — it is O(window) and, being stable over a fixed scan
   * order, exactly reproducible.
   */
  _target(b, cx, cy) {
    const g = this.g, cols = g.cols, rows = g.rows;
    const a = b.a, bb = b.b;
    const W = Math.min(cols, Math.ceil(a * GROW) + 1);
    const H = Math.min(rows, Math.ceil(bb * GROW) + 1);
    const x0 = Math.round(cx), y0 = Math.round(cy);
    const R2MAX = GROW * GROW;
    const scale = BANDS / R2MAX;
    const cand = this._cand, band = this._band, cnt = this._cnt, order = this._order;
    cnt.fill(0);
    let m = 0;
    const ia = 1 / a, ib = 1 / bb;

    for (let dy = -H; dy <= H; dy++) {
      const y = y0 + dy;
      if (y < 0 || y >= rows) continue;
      const ey = (y - cy) * ib;
      const ey2 = ey * ey;
      if (ey2 > R2MAX) continue;
      const row = y * cols;
      for (let dx = -W; dx <= W; dx++) {
        const x = x0 + dx;
        if (x < 0 || x >= cols) continue;
        const ex = (x - cx) * ia;
        const r2 = ex * ex + ey2;
        if (r2 > R2MAX) continue;
        const i = row + x;
        if (!this._admits(i, b.id)) continue;
        let bnd = (r2 * scale) | 0;
        if (bnd >= BANDS) bnd = BANDS - 1;
        cand[m] = i; band[m] = bnd; cnt[bnd]++; m++;
      }
    }
    if (m < b.n) return m;

    let acc = 0;
    for (let k = 0; k < BANDS; k++) { const c = cnt[k]; cnt[k] = acc; acc += c; }
    for (let k = 0; k < m; k++) order[cnt[band[k]]++] = cand[k];
    return m;
  }

  /** Can this blob occupy cell i? Own cells yes; light fluids yield; rock does not. */
  _admits(i, id) {
    const g = this.g;
    const f = g.flags[i];
    if (f & F_BLOB) return g.blob[i] === id && (f & F_CLEARING) === 0;
    if (f & F_CLEARING) return false;
    const m = g.mat[i];
    if (m === EMPTY) return true;
    const k = KIND[m];
    if (k !== LIQUID && k !== GAS) return false;
    return DENSITY[m] < DENSITY[JELLY];
  }

  /**
   * Move the body onto this._order[0..n). |entering| === |exiting| by
   * construction, so any fluid standing in the way is salvaged and re-placed
   * into a cell the body vacated: a permutation, never a source or a sink.
   */
  _commit(b) {
    const g = this.g, order = this._order, n = b.n;
    const mark = this._mark, stamp = ++this._markStamp;
    for (let k = 0; k < n; k++) mark[order[k]] = stamp;

    const exit = this._exit, enter = this._enter;
    let ne = 0;
    for (let k = 0; k < n; k++) {
      const i = b.cells[k];
      if (mark[i] !== stamp) exit[ne++] = i;
    }
    let nn = 0;
    const flags = g.flags, blob = g.blob;
    for (let k = 0; k < n; k++) {
      const i = order[k];
      if ((flags[i] & F_BLOB) && blob[i] === b.id) continue;
      enter[nn++] = i;
    }
    // |T| = |C| = n, so |T\C| = |C\T|. If this ever trips, the rasteriser
    // handed back duplicates and the ledger would drift.
    if (nn !== ne) throw new Error(`blob ${b.id}: enter ${nn} != exit ${ne}`);

    // 1. salvage whatever is standing in the entering cells
    let np = 0;
    const payI = this._payI, payM = this._payM, payT = this._payT;
    const payH = this._payH, payL = this._payL, payF = this._payF;
    for (let k = 0; k < nn; k++) {
      const i = enter[k];
      if (g.mat[i] === EMPTY) continue;
      payI[np] = i; payM[np] = g.mat[i]; payT[np] = g.tint[i];
      payH[np] = g.heat[i]; payL[np] = g.life[i]; payF[np] = g.flags[i];
      np++;
    }
    void payI;

    // 2. vacate, 3. occupy, 4. re-place the salvage. Exiting and entering sets
    //    are disjoint, so no step can undo another.
    for (let k = 0; k < ne; k++) g.set(exit[k], EMPTY, 0);
    for (let k = 0; k < nn; k++) {
      const i = enter[k];
      g.set(i, JELLY, b.tint);
      g.flags[i] = F_BLOB;
      g.blob[i] = b.id;
    }
    for (let k = 0; k < np; k++) {
      const dst = exit[k];
      g.set(dst, payM[k], payT[k]);
      g.heat[dst] = payH[k];
      g.life[dst] = payL[k];
      g.flags[dst] = payF[k] & ~(F_BLOB | F_CLEARING);
    }

    this._grow(b, n);
    b.cells.set(order.subarray(0, n));
  }

  // ------------------------------------------------------------------- merges

  /**
   * Same-tint bodies that touch become one body. Union-find over one 4-adjacency
   * sweep, so a chain of three merges in a single tick.
   */
  _mergePass() {
    const g = this.g, cols = g.cols, flags = g.flags, blob = g.blob;
    const parent = new Map();
    const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
    for (const b of this.blobs) parent.set(b.id, b.id);

    let any = false;
    for (const b of this.blobs) {
      for (let k = 0; k < b.n; k++) {
        const i = b.cells[k];
        const x = i % cols;
        for (let d = 0; d < 4; d++) {
          const ni = d === 0 ? (x > 0 ? i - 1 : -1)
            : d === 1 ? (x < cols - 1 ? i + 1 : -1)
              : d === 2 ? (i >= cols ? i - cols : -1)
                : (i + cols < g.n ? i + cols : -1);
          if (ni < 0) continue;
          if ((flags[ni] & F_BLOB) === 0) continue;
          const oid = blob[ni];
          if (oid === b.id || !parent.has(oid)) continue;
          const other = this.byId.get(oid);
          if (!other || other.tint !== b.tint) continue;
          const ra = find(b.id), rb = find(oid);
          if (ra === rb) continue;
          // keep the lower id: deterministic, and ids stay stable for the renderer
          if (ra < rb) parent.set(rb, ra); else parent.set(ra, rb);
          any = true;
        }
      }
    }
    if (!any) return;

    const groups = new Map();
    for (const b of this.blobs) {
      const r = find(b.id);
      let arr = groups.get(r);
      if (!arr) { arr = []; groups.set(r, arr); }
      arr.push(b);
    }
    const out = [];
    for (const b of this.blobs) {
      const r = find(b.id);
      const arr = groups.get(r);
      if (!arr || arr.length === 1) { if (b.id === r) out.push(b); continue; }
      if (b.id !== r) continue;
      out.push(this._fuse(arr, r));
      groups.set(r, null);
    }
    this.blobs = out;
    this.byId.clear();
    for (const b of out) this.byId.set(b.id, b);
  }

  _fuse(arr, id) {
    arr.sort((p, r) => p.id - r.id);
    const host = arr.find((b) => b.id === id) || arr[0];
    let total = 0;
    for (const b of arr) total += b.n;
    this._grow(host, total);
    const cells = host.cells;
    let w = host.n;
    let mvx = host.vx * host.n, mvy = host.vy * host.n;
    let mq = host.q * host.n, mvq = host.vq * host.n;
    let grounded = host.grounded;
    for (const b of arr) {
      if (b === host) continue;
      for (let k = 0; k < b.n; k++) { cells[w++] = b.cells[k]; this.g.blob[b.cells[k]] = id; }
      mvx += b.vx * b.n; mvy += b.vy * b.n;
      mq += b.q * b.n; mvq += b.vq * b.n;
      grounded = grounded || b.grounded;
      b.alive = false;
      this.byId.delete(b.id);
    }
    host.n = w;
    host.vx = mvx / w; host.vy = mvy / w;
    const q = clamp(mq / w, Q_MIN, Q_MAX);
    host.vq = mvq / w;
    host.grounded = grounded;
    this._measure(host);
    host.q = q;
    this._axes(host);
    return host;
  }
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

/**
 * Structural audit — used by tools/jellysim.mjs, and cheap enough for a debug
 * overlay. @returns an error string, or null when the world is consistent.
 *
 * Two modes, because the two directions are true at different moments:
 *
 *  - STRICT (default) also asserts blob -> grid, i.e. every cell a blob lists is
 *    still its jelly. That holds only immediately after `blobs.step()`. Later in
 *    the same tick a chain can dissolve a jelly cell or fire can melt one, and
 *    the blob will not know until it reconciles at the top of the next tick.
 *  - `gridOnly` asserts grid -> blob, which is true at every instant: no cell may
 *    carry F_BLOB without a live blob that lists it, and no two blobs may claim
 *    the same cell. That is the invariant the rasteriser could actually break.
 */
export function auditBlobs(blobs, label = 'blobs', gridOnly = false) {
  const g = blobs.g;
  const owner = new Map();
  for (const b of blobs.list()) {
    if (!b.alive) return `${label}: dead blob ${b.id} still in the live list`;
    if (b.n <= 0) return `${label}: blob ${b.id} has no cells`;
    if (blobs.byId.get(b.id) !== b) return `${label}: blob ${b.id} missing from the id map`;
    const seen = new Set();
    for (let k = 0; k < b.n; k++) {
      const i = b.cells[k];
      if (i < 0 || i >= g.n) return `${label}: blob ${b.id} cell ${i} out of range`;
      if (seen.has(i)) return `${label}: blob ${b.id} lists cell ${i} twice`;
      seen.add(i);
      const held = g.mat[i] === JELLY && (g.flags[i] & F_BLOB) !== 0 && g.blob[i] === b.id;
      if (held) {
        if (owner.has(i)) return `${label}: cell ${i} claimed by blobs ${owner.get(i)} and ${b.id}`;
        owner.set(i, b.id);
        if (g.tint[i] !== b.tint) return `${label}: blob ${b.id} cell ${i} tint ${g.tint[i]} != ${b.tint}`;
        continue;
      }
      if (gridOnly) continue;      // the world took it back; reconcile will drop it
      if (g.mat[i] !== JELLY) return `${label}: blob ${b.id} cell ${i} is material ${g.mat[i]}, not jelly`;
      if ((g.flags[i] & F_BLOB) === 0) return `${label}: blob ${b.id} cell ${i} lacks F_BLOB`;
      return `${label}: blob ${b.id} cell ${i} says blob ${g.blob[i]}`;
    }
  }
  for (let i = 0; i < g.n; i++) {
    if ((g.flags[i] & F_BLOB) === 0) continue;
    if (!owner.has(i)) return `${label}: orphaned F_BLOB cell ${i} (blob id ${g.blob[i]})`;
  }
  return null;
}
