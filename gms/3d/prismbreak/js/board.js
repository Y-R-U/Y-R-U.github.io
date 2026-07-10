// Prism Break — pure match-3 engine. No DOM, no three.js: unit-testable in node.
// Grid is [row][col], row 0 at the TOP (gravity pulls toward higher rows).
//
// Gem: { id, color: 0..5 | -1 (prism), finish: 'glass'|'metal', special: null|'lineH'|'lineV'|'burst'|'nova'|'prism' }
//
// trySwap()/activate() return an event list the renderer replays:
//   {t:'clear', cascade, cells, crushes, activations, spawned, points, praise}
//   {t:'fall', moves:[{fr,fc,tr,tc,id}], spawns:[{r,c,gem}]}

import { SCORE, PRAISE } from './config.js';

let nextId = 1;
const key = (r, c) => r * 100 + c;

export class Board {
  constructor(opts = {}) {
    this.cols = opts.cols ?? 8;
    this.rows = opts.rows ?? 8;
    this.numColors = opts.colors ?? 6;
    this.metalChance = opts.metalChance ?? 0.08;
    this.rng = opts.rng ?? Math.random;
    this.mods = opts.mods ?? {}; // {metalScoreMult, crushScoreMult}
    this.grid = [];
    this.fill();
  }

  at(r, c) {
    if (r < 0 || c < 0 || r >= this.rows || c >= this.cols) return null;
    return this.grid[r][c];
  }

  forEach(cb) {
    for (let r = 0; r < this.rows; r++)
      for (let c = 0; c < this.cols; c++)
        if (this.grid[r][c]) cb(this.grid[r][c], r, c);
  }

  makeGem(color, finish) {
    return { id: nextId++, color, finish: finish ?? (this.rng() < this.metalChance ? 'metal' : 'glass'), special: null };
  }

  spawnRandom() { return this.makeGem(Math.floor(this.rng() * this.numColors)); }

  fill() {
    for (let attempt = 0; attempt < 30; attempt++) {
      this.grid = [];
      for (let r = 0; r < this.rows; r++) {
        const row = [];
        for (let c = 0; c < this.cols; c++) {
          let color;
          do {
            color = Math.floor(this.rng() * this.numColors);
          } while (
            (c >= 2 && row[c - 1].color === color && row[c - 2].color === color) ||
            (r >= 2 && this.grid[r - 1][c].color === color && this.grid[r - 2][c].color === color)
          );
          row.push(this.makeGem(color));
        }
        this.grid.push(row);
      }
      if (this.findMoves().length > 0) return;
    }
  }

  // ── match detection ──────────────────────────────────────────────────
  findRuns() {
    const runs = [];
    for (let r = 0; r < this.rows; r++) {
      let c = 0;
      while (c < this.cols) {
        const g = this.grid[r][c];
        if (!g || g.color < 0) { c++; continue; }
        let len = 1;
        while (c + len < this.cols && this.grid[r][c + len] && this.grid[r][c + len].color === g.color) len++;
        if (len >= 3) runs.push({ dir: 'h', color: g.color, cells: Array.from({ length: len }, (_, i) => ({ r, c: c + i })) });
        c += len;
      }
    }
    for (let c = 0; c < this.cols; c++) {
      let r = 0;
      while (r < this.rows) {
        const g = this.grid[r][c];
        if (!g || g.color < 0) { r++; continue; }
        let len = 1;
        while (r + len < this.rows && this.grid[r + len][c] && this.grid[r + len][c].color === g.color) len++;
        if (len >= 3) runs.push({ dir: 'v', color: g.color, cells: Array.from({ length: len }, (_, i) => ({ r: r + i, c })) });
        r += len;
      }
    }
    return runs;
  }

  // merge runs sharing cells into clusters; decide the special each cluster spawns
  clusterRuns(runs, swapPos) {
    const cellOwner = new Map();
    const clusters = [];
    for (const run of runs) {
      let target = null;
      for (const cell of run.cells) {
        const owner = cellOwner.get(key(cell.r, cell.c));
        if (owner !== undefined) { target = owner; break; }
      }
      if (target === null) { target = clusters.length; clusters.push({ runs: [], cells: new Map(), color: run.color }); }
      const cl = clusters[target];
      cl.runs.push(run);
      for (const cell of run.cells) {
        cl.cells.set(key(cell.r, cell.c), cell);
        cellOwner.set(key(cell.r, cell.c), target);
      }
    }
    for (const cl of clusters.filter(Boolean)) {
      const maxRun = Math.max(...cl.runs.map(r => r.cells.length));
      const hasH = cl.runs.some(r => r.dir === 'h'), hasV = cl.runs.some(r => r.dir === 'v');
      const n = cl.cells.size;
      let special = null;
      if (maxRun >= 5) special = 'prism';
      else if (hasH && hasV && n >= 6) special = 'nova';
      else if (hasH && hasV) special = 'burst';
      else if (maxRun === 4) special = cl.runs[0].dir === 'h' ? 'lineH' : 'lineV';
      cl.special = special;
      if (special) {
        // spawn at the swapped cell if it's in the cluster, else the middle
        let pos = null;
        if (swapPos && cl.cells.has(key(swapPos.r, swapPos.c))) pos = swapPos;
        else {
          const arr = [...cl.cells.values()];
          pos = arr[Math.floor(arr.length / 2)];
        }
        cl.spawnAt = pos;
      }
    }
    return clusters;
  }

  // expand a clear set through chained special activations
  expandSpecials(clearMap, activations) {
    const queue = [];
    for (const [, cell] of clearMap) {
      const g = this.at(cell.r, cell.c);
      if (g && g.special) queue.push(cell);
    }
    const seen = new Set(queue.map(c => key(c.r, c.c)));
    const add = (r, c) => {
      const g = this.at(r, c);
      if (!g) return;
      const k = key(r, c);
      if (!clearMap.has(k)) clearMap.set(k, { r, c });
      if (g.special && !seen.has(k)) { seen.add(k); queue.push({ r, c }); }
    };
    while (queue.length) {
      const { r, c } = queue.shift();
      const g = this.at(r, c);
      if (!g) continue;
      switch (g.special) {
        case 'lineH':
          activations.push({ kind: 'lineH', r, c });
          for (let i = 0; i < this.cols; i++) add(r, i);
          break;
        case 'lineV':
          activations.push({ kind: 'lineV', r, c });
          for (let i = 0; i < this.rows; i++) add(i, c);
          break;
        case 'burst':
          activations.push({ kind: 'burst', r, c });
          for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) add(r + dr, c + dc);
          break;
        case 'nova':
          activations.push({ kind: 'nova', r, c });
          for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) add(r + dr, c + dc);
          break;
        case 'prism': {
          // prism destroyed by a blast: zaps the most common color on the board
          const counts = new Array(this.numColors).fill(0);
          this.forEach(g2 => { if (g2.color >= 0) counts[g2.color]++; });
          const target = counts.indexOf(Math.max(...counts));
          activations.push({ kind: 'prism', r, c, color: target });
          this.forEach((g2, rr, cc) => { if (g2.color === target) add(rr, cc); });
          break;
        }
      }
    }
  }

  scoreClear(clearMap, crushSet, cascade) {
    let pts = 0;
    const mMult = this.mods.metalScoreMult ?? 1;
    const cMult = this.mods.crushScoreMult ?? 1;
    for (const [k, cell] of clearMap) {
      const g = this.at(cell.r, cell.c);
      if (!g) continue;
      pts += g.special ? SCORE.special : (g.finish === 'metal' ? SCORE.metal * mMult : SCORE.gem);
      if (crushSet.has(k)) pts += SCORE.crush * cMult;
    }
    return Math.round(pts * SCORE.cascadeMult(cascade));
  }

  // ── gravity ──────────────────────────────────────────────────────────
  applyGravity() {
    const moves = [], spawns = [], fell = new Set();
    for (let c = 0; c < this.cols; c++) {
      let write = this.rows - 1;
      for (let r = this.rows - 1; r >= 0; r--) {
        const g = this.grid[r][c];
        if (!g) continue;
        if (write !== r) {
          this.grid[write][c] = g;
          this.grid[r][c] = null;
          moves.push({ fr: r, fc: c, tr: write, tc: c, id: g.id });
          fell.add(key(write, c));
        }
        write--;
      }
      let dist = 1;
      for (let r = write; r >= 0; r--) {
        const g = this.spawnRandom();
        this.grid[r][c] = g;
        spawns.push({ r, c, gem: g, drop: write - r + dist });
        fell.add(key(r, c));
      }
    }
    return { moves, spawns, fell };
  }

  // metal that just dropped onto glass sitting on metal → the glass shatters
  findCrushes(fell) {
    const crushes = [];
    for (let c = 0; c < this.cols; c++) {
      for (let r = 0; r < this.rows - 2; r++) {
        if (!fell.has(key(r, c))) continue;
        const top = this.at(r, c), mid = this.at(r + 1, c), bot = this.at(r + 2, c);
        if (top && mid && bot &&
            top.finish === 'metal' && bot.finish === 'metal' &&
            mid.finish === 'glass') {
          crushes.push({ r: r + 1, c });
        }
      }
    }
    return crushes;
  }

  // ── the cascade loop ─────────────────────────────────────────────────
  // initialClear: optional Map(key→{r,c}) seeded by a combo/booster.
  resolveLoop(events, initialClear, initialActivations, swapPos) {
    let cascade = 1;
    let total = 0;
    let pendingCrush = [];
    let seeded = initialClear ?? null;
    let seededActs = initialActivations ?? [];

    for (let guard = 0; guard < 60; guard++) {
      let clearMap, activations = [], spawned = [];

      if (seeded) {
        clearMap = seeded;
        activations = seededActs;
        seeded = null; seededActs = [];
      } else {
        const runs = this.findRuns();
        if (runs.length === 0 && pendingCrush.length === 0) break;
        clearMap = new Map();
        const clusters = this.clusterRuns(runs, cascade === 1 ? swapPos : null);
        for (const cl of clusters) {
          for (const [k, cell] of cl.cells) clearMap.set(k, cell);
          if (cl.special) {
            const pos = cl.spawnAt;
            const gem = this.makeGem(cl.special === 'prism' ? -1 : cl.color, 'glass');
            gem.special = cl.special;
            spawned.push({ r: pos.r, c: pos.c, gem, old: this.at(pos.r, pos.c) });
          }
        }
      }

      const crushSet = new Set();
      for (const cr of pendingCrush) {
        const k = key(cr.r, cr.c);
        if (this.at(cr.r, cr.c)) { clearMap.set(k, cr); crushSet.add(k); }
      }
      pendingCrush = [];

      this.expandSpecials(clearMap, activations);

      // spawned specials survive the clear
      for (const sp of spawned) clearMap.delete(key(sp.r, sp.c));

      if (clearMap.size === 0 && spawned.length === 0) break;

      const points = this.scoreClear(clearMap, crushSet, cascade);
      total += points;

      const cells = [];
      for (const [, cell] of clearMap) {
        const g = this.at(cell.r, cell.c);
        if (g) cells.push({ r: cell.r, c: cell.c, gem: g });
        this.grid[cell.r][cell.c] = null;
      }
      for (const sp of spawned) this.grid[sp.r][sp.c] = sp.gem;

      events.push({
        t: 'clear', cascade, cells,
        crushes: [...crushSet].map(k => ({ r: Math.floor(k / 100), c: k % 100 })),
        activations, spawned, points,
        praise: cascade >= 2 ? PRAISE[Math.min(cascade, PRAISE.length - 1)] : null,
      });

      const { moves, spawns, fell } = this.applyGravity();
      events.push({ t: 'fall', moves, spawns });
      pendingCrush = this.findCrushes(fell);
      cascade++;
    }
    return { points: total, cascades: cascade - 1 };
  }

  // ── player actions ───────────────────────────────────────────────────
  trySwap(a, b, force = false) {
    const ga = this.at(a.r, a.c), gb = this.at(b.r, b.c);
    if (!ga || !gb) return { valid: false, events: [] };
    const events = [];

    // special+special / prism combos fire without needing a color match
    const combo = this.comboClear(a, b, ga, gb);
    if (combo) {
      // swap them so FX line up with where the player dragged
      this.grid[a.r][a.c] = gb; this.grid[b.r][b.c] = ga;
      events.push({ t: 'swap', a, b });
      const result = this.resolveLoop(events, combo.clear, combo.activations, b);
      return { valid: true, events, ...result, combo: combo.kind };
    }

    this.grid[a.r][a.c] = gb; this.grid[b.r][b.c] = ga;
    if (this.findRuns().length === 0) {
      if (force) { // free-swap booster: the swap sticks even without a match
        return { valid: true, events: [{ t: 'swap', a, b }], points: 0, cascades: 0 };
      }
      this.grid[a.r][a.c] = ga; this.grid[b.r][b.c] = gb;
      return { valid: false, events: [{ t: 'swap', a, b }, { t: 'swapBack', a, b }] };
    }
    events.push({ t: 'swap', a, b });
    const result = this.resolveLoop(events, null, null, b);
    return { valid: true, events, ...result };
  }

  // build the seed clear-set for special-swap combos. Called BEFORE the swap.
  comboClear(a, b, ga, gb) {
    const sa = ga.special, sb = gb.special;
    if (!sa && !sb) return null;
    const clear = new Map();
    const activations = [];
    const add = (r, c) => { if (this.at(r, c)) clear.set(key(r, c), { r, c }); };
    const both = (kind) => { add(a.r, a.c); add(b.r, b.c); return { kind, clear, activations }; };

    if (sa === 'prism' && sb === 'prism') {
      this.forEach((g, r, c) => add(r, c));
      activations.push({ kind: 'comboPP', r: b.r, c: b.c });
      return both('comboPP');
    }
    if (sa === 'prism' || sb === 'prism') {
      const other = sa === 'prism' ? gb : ga;
      const oPos = sa === 'prism' ? b : a;
      const pPos = sa === 'prism' ? a : b;
      if (other.special === 'lineH' || other.special === 'lineV') {
        // all gems of that color become line blasters and fire
        this.forEach((g, r, c) => {
          if (g.color === other.color && !g.special) g.special = this.rng() < 0.5 ? 'lineH' : 'lineV';
          if (g.color === other.color) add(r, c);
        });
        activations.push({ kind: 'comboPL', r: pPos.r, c: pPos.c, color: other.color });
        return both('comboPL');
      }
      if (other.special === 'burst' || other.special === 'nova') {
        this.forEach((g, r, c) => {
          if (g.color === other.color && !g.special) g.special = 'burst';
          if (g.color === other.color) add(r, c);
        });
        activations.push({ kind: 'comboPB', r: pPos.r, c: pPos.c, color: other.color });
        return both('comboPB');
      }
      // prism + plain gem: wipe that color
      this.forEach((g, r, c) => { if (g.color === other.color) add(r, c); });
      activations.push({ kind: 'comboPC', r: pPos.r, c: pPos.c, color: other.color });
      return both('comboPC');
    }
    if (!sa || !sb) return null; // one plain, one special → normal swap rules

    const isLine = s => s === 'lineH' || s === 'lineV';
    const rad = s => s === 'nova' ? 2 : 1;
    // both gems' specials are consumed by the combo, not re-triggered
    ga.special = null; gb.special = null;
    if (isLine(sa) && isLine(sb)) {
      for (let i = 0; i < this.cols; i++) add(b.r, i);
      for (let i = 0; i < this.rows; i++) add(i, b.c);
      activations.push({ kind: 'comboLL', r: b.r, c: b.c });
      return both('comboLL');
    }
    if (isLine(sa) || isLine(sb)) {
      const w = rad(isLine(sa) ? sb : sa);
      for (let d = -w; d <= w; d++) {
        for (let i = 0; i < this.cols; i++) add(b.r + d, i);
        for (let i = 0; i < this.rows; i++) add(i, b.c + d);
      }
      activations.push({ kind: 'comboLB', r: b.r, c: b.c, rad: w });
      return both('comboLB');
    }
    // burst/nova pair
    const w = rad(sa) + rad(sb) + 1;
    for (let dr = -w; dr <= w; dr++) for (let dc = -w; dc <= w; dc++) add(b.r + dr, b.c + dc);
    activations.push({ kind: 'comboBB', r: b.r, c: b.c, rad: w });
    return both('comboBB');
  }

  // booster / forge activation
  activate(r, c, radius = 0) {
    const events = [];
    const clear = new Map();
    for (let dr = -radius; dr <= radius; dr++)
      for (let dc = -radius; dc <= radius; dc++)
        if (this.at(r + dr, c + dc)) clear.set(key(r + dr, c + dc), { r: r + dr, c: c + dc });
    if (clear.size === 0) return { events, points: 0, cascades: 0 };
    const acts = radius > 0 ? [{ kind: 'burst', r, c }] : [];
    const result = this.resolveLoop(events, clear, acts, null);
    return { events, ...result };
  }

  addPrism() {
    const spots = [];
    this.forEach((g, r, c) => { if (!g.special && g.color >= 0) spots.push({ r, c }); });
    if (!spots.length) return null;
    const pos = spots[Math.floor(this.rng() * spots.length)];
    const gem = this.makeGem(-1, 'glass');
    gem.special = 'prism';
    this.grid[pos.r][pos.c] = gem;
    return { ...pos, gem };
  }

  // ── hints / auto-play ────────────────────────────────────────────────
  findMoves() {
    const moves = [];
    const dirs = [{ dr: 0, dc: 1 }, { dr: 1, dc: 0 }];
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        for (const { dr, dc } of dirs) {
          const r2 = r + dr, c2 = c + dc;
          const ga = this.at(r, c), gb = this.at(r2, c2);
          if (!ga || !gb) continue;
          if (ga.special === 'prism' || gb.special === 'prism' || (ga.special && gb.special)) {
            moves.push({ a: { r, c }, b: { r: r2, c: c2 }, gain: 20 + (ga.special === 'prism' && gb.special === 'prism' ? 64 : 0) });
            continue;
          }
          this.grid[r][c] = gb; this.grid[r2][c2] = ga;
          const runs = this.findRuns();
          this.grid[r][c] = ga; this.grid[r2][c2] = gb;
          if (runs.length) {
            const gain = runs.reduce((s, run) => s + run.cells.length, 0);
            moves.push({ a: { r, c }, b: { r: r2, c: c2 }, gain });
          }
        }
      }
    }
    return moves;
  }

  shuffleBoard() {
    const gems = [];
    this.forEach(g => gems.push(g));
    for (let attempt = 0; attempt < 60; attempt++) {
      for (let i = gems.length - 1; i > 0; i--) {
        const j = Math.floor(this.rng() * (i + 1));
        [gems[i], gems[j]] = [gems[j], gems[i]];
      }
      let i = 0;
      for (let r = 0; r < this.rows; r++)
        for (let c = 0; c < this.cols; c++)
          this.grid[r][c] = gems[i++];
      if (this.findRuns().length === 0 && this.findMoves().length > 0) return true;
    }
    this.fill();
    return true;
  }
}
