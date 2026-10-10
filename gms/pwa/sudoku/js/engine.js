// Sudoku Engine — puzzle generation, validation, unique-solution guarantee.
//
// Difficulty here is what a *solver* has to do, not how many clues are missing.
// Clue count alone is a bad proxy: a 22-clue board is solvable with nothing but
// singles about a third of the time, which made the old Medium no harder than
// Basic — just longer. So every puzzle is graded by the hardest technique it
// forces, and generation removes or restores clues until the grade lands in the
// band the chosen level asks for.
class SudokuEngine {

  constructor() {
    // Cell candidate sets are 9-bit masks: bit 0 = digit 1 … bit 8 = digit 9.
    this.ALL = 0x1ff;
    this.units = SudokuEngine.buildUnits();
    // peers[i]: the 20 cells sharing a row, column or box with cell i (0-80).
    this.peers = Array.from({ length: 81 }, (_, i) => {
      const out = [];
      for (let j = 0; j < 81; j++) if (j !== i && this.seesIdx(i, j)) out.push(j);
      return out;
    });
    this.rand = Math.random;
    // When an array, the step functions stop after their first productive
    // pattern and describe it here — that is how hints explain themselves.
    this.trace = null;
  }

  seesIdx(a, b) {
    const ra = (a / 9) | 0, ca = a % 9, rb = (b / 9) | 0, cb = b % 9;
    return ra === rb || ca === cb || (((ra / 3) | 0) === ((rb / 3) | 0) && ((ca / 3) | 0) === ((cb / 3) | 0));
  }

  static houseName(ui) {
    return ui < 9 ? `row ${ui + 1}` : ui < 18 ? `column ${ui - 8}` : `box ${ui - 17}`;
  }

  record(name, house, cells, digit, extra) {
    this.trace.push(Object.assign({ name, house, cells, digit }, extra));
    return true;
  }

  // The 27 houses: 9 rows, 9 columns, 9 boxes. Rows and columns come first —
  // `lockedCandidates` relies on that ordering for its "claiming" pass.
  static buildUnits() {
    const units = [];
    for (let r = 0; r < 9; r++) units.push(Array.from({ length: 9 }, (_, c) => [r, c]));
    for (let c = 0; c < 9; c++) units.push(Array.from({ length: 9 }, (_, r) => [r, c]));
    for (let b = 0; b < 9; b++) {
      units.push(Array.from({ length: 9 }, (_, i) =>
        [((b / 3) | 0) * 3 + ((i / 3) | 0), (b % 3) * 3 + (i % 3)]));
    }
    return units;
  }

  // ── Bit helpers ─────────────────────────────────────────────────────────────
  bit(n) { return 1 << (n - 1); }
  popcount(x) { let c = 0; while (x) { x &= x - 1; c++; } return c; }
  // Digit held by a single-bit mask. clz32 beats Math.log2 for exactness.
  bitDigit(x) { return 32 - Math.clz32(x); }

  // Row/column/box occupancy masks for a grid.
  masks(grid) {
    const rows = new Array(9).fill(0), cols = new Array(9).fill(0), boxes = new Array(9).fill(0);
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const v = grid[r][c];
        if (!v) continue;
        const b = this.bit(v);
        rows[r] |= b; cols[c] |= b; boxes[((r / 3) | 0) * 3 + ((c / 3) | 0)] |= b;
      }
    }
    return { rows, cols, boxes };
  }

  // ── Generation ──────────────────────────────────────────────────────────────
  generateSolution() {
    const grid = Array(9).fill(null).map(() => Array(9).fill(0));
    this.fillGrid(grid);
    return grid;
  }

  // Backtracking filler — shuffles candidates for randomised boards
  fillGrid(grid, row = 0, col = 0) {
    if (row === 9) return true;
    if (col === 9) return this.fillGrid(grid, row + 1, 0);
    const nums = this.shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    for (const num of nums) {
      if (this.isValid(grid, row, col, num)) {
        grid[row][col] = num;
        if (this.fillGrid(grid, row, col + 1)) return true;
        grid[row][col] = 0;
      }
    }
    return false;
  }

  // Check if placing num at (row,col) is valid against current grid
  isValid(grid, row, col, num) {
    for (let i = 0; i < 9; i++) {
      if (grid[row][i] === num || grid[i][col] === num) return false;
    }
    const br = Math.floor(row / 3) * 3, bc = Math.floor(col / 3) * 3;
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        if (grid[br + i][bc + j] === num) return false;
      }
    }
    return true;
  }

  // Count solutions, stopping as soon as `limit` have been found.
  //
  // Always branches on the cell with the fewest candidates, so a contradiction
  // is hit near the top of the tree instead of after eight wasted levels. That
  // is worth ~100× on sparse boards: the naive left-to-right version took up to
  // 360ms per Hard puzzle, which was a visible freeze on a phone.
  countSolutions(grid, limit = 2) {
    const { rows, cols, boxes } = this.masks(grid);
    const g = grid.map(r => [...r]);
    let count = 0;
    const rec = () => {
      let best = -1, bestMask = 0, bestCount = 10;
      for (let r = 0; r < 9 && bestCount > 1; r++) {
        for (let c = 0; c < 9; c++) {
          if (g[r][c]) continue;
          const cand = this.ALL & ~(rows[r] | cols[c] | boxes[((r / 3) | 0) * 3 + ((c / 3) | 0)]);
          const n = this.popcount(cand);
          if (n === 0) return false;               // dead end — no digit fits here
          if (n < bestCount) { bestCount = n; best = r * 9 + c; bestMask = cand; if (n === 1) break; }
        }
      }
      if (best < 0) { count++; return count >= limit; }  // board full = one solution
      const r = (best / 9) | 0, c = best % 9, bx = ((r / 3) | 0) * 3 + ((c / 3) | 0);
      let m = bestMask;
      while (m) {
        const b = m & -m; m ^= b;
        g[r][c] = this.bitDigit(b);
        rows[r] |= b; cols[c] |= b; boxes[bx] |= b;
        const stop = rec();
        g[r][c] = 0; rows[r] &= ~b; cols[c] &= ~b; boxes[bx] &= ~b;
        if (stop) return true;                     // budget spent, unwind
      }
      return false;
    };
    rec();
    return count;
  }

  hasUniqueSolution(grid) {
    return this.countSolutions(grid, 2) === 1;
  }

  // Complete a puzzle, returning a new grid — or null if it can't be finished.
  // Saved games store only the clues, so the solution is recovered with this on
  // load rather than being written to localStorage where it can be read.
  solve(grid) {
    const { rows, cols, boxes } = this.masks(grid);
    const g = grid.map(r => [...r]);
    const rec = () => {
      let best = -1, bestMask = 0, bestCount = 10;
      for (let r = 0; r < 9 && bestCount > 1; r++) {
        for (let c = 0; c < 9; c++) {
          if (g[r][c]) continue;
          const cand = this.ALL & ~(rows[r] | cols[c] | boxes[((r / 3) | 0) * 3 + ((c / 3) | 0)]);
          const n = this.popcount(cand);
          if (n === 0) return false;
          if (n < bestCount) { bestCount = n; best = r * 9 + c; bestMask = cand; if (n === 1) break; }
        }
      }
      if (best < 0) return true;
      const r = (best / 9) | 0, c = best % 9, bx = ((r / 3) | 0) * 3 + ((c / 3) | 0);
      let m = bestMask;
      while (m) {
        const b = m & -m; m ^= b;
        g[r][c] = this.bitDigit(b);
        rows[r] |= b; cols[c] |= b; boxes[bx] |= b;
        if (rec()) return true;
        g[r][c] = 0; rows[r] &= ~b; cols[c] &= ~b; boxes[bx] &= ~b;
      }
      return false;
    };
    return rec() ? g : null;
  }

  // ── Difficulty grading ──────────────────────────────────────────────────────
  // Solves the puzzle the way a person would and reports the hardest technique
  // it had to reach for:
  //   0  naked / hidden singles only
  //   1  + locked candidates (pointing & claiming), naked / hidden pairs
  //   2  + naked / hidden triples, X-wing
  //   3  + XY-wing, swordfish, simple colouring
  //   4  none of the above finish it — needs chains or trial and error
  // The puzzle is still guaranteed to have exactly one solution at every tier.
  gradeTier(puzzle) {
    const g = puzzle.map(r => [...r]);
    const cand = Array.from({ length: 9 }, () => new Array(9).fill(0));
    let tier = 0;

    // Rebuild every candidate set from the grid. Called after each placement;
    // the pruning techniques below edit `cand` in place instead.
    const recompute = () => {
      const { rows, cols, boxes } = this.masks(g);
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          if (g[r][c]) { cand[r][c] = 0; continue; }
          cand[r][c] = this.ALL & ~(rows[r] | cols[c] | boxes[((r / 3) | 0) * 3 + ((c / 3) | 0)]);
          if (!cand[r][c]) return false;           // contradiction
        }
      }
      return true;
    };

    if (!recompute()) return 4;
    for (let guard = 0; guard < 600; guard++) {
      if (this.stepSingles(g, cand)) { if (!recompute()) return 4; continue; }
      if (this.stepLocked(g, cand) || this.stepSubsets(g, cand, 2)) { tier = Math.max(tier, 1); continue; }
      if (this.stepSubsets(g, cand, 3) || this.stepXWing(g, cand)) { tier = Math.max(tier, 2); continue; }
      if (this.stepXYWing(g, cand) || this.stepSwordfish(g, cand) || this.stepColouring(g, cand)) { tier = 3; continue; }
      break;
    }
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) if (!g[r][c]) return 4;
    return tier;
  }

  // The next logical step a person could take on `puzzle`: the eliminations it
  // needed (in order) and then the single they unlocked, or `stuck` when the
  // grader's techniques run dry.
  explainNext(puzzle) {
    const g = puzzle.map(r => [...r]);
    const { rows, cols, boxes } = this.masks(g);
    const cand = g.map((row, r) => row.map((v, c) =>
      v ? 0 : this.ALL & ~(rows[r] | cols[c] | boxes[((r / 3) | 0) * 3 + ((c / 3) | 0)])));
    this.trace = [];
    try {
      for (let guard = 0; guard < 400; guard++) {
        if (this.stepSingles(g, cand)) return { steps: this.trace };
        if (this.stepLocked(g, cand) || this.stepSubsets(g, cand, 2) || this.stepSubsets(g, cand, 3) ||
            this.stepXWing(g, cand) || this.stepXYWing(g, cand) || this.stepSwordfish(g, cand) ||
            this.stepColouring(g, cand)) continue;
        break;
      }
      return { steps: this.trace, stuck: true };
    } finally { this.trace = null; }
  }

  // Naked single (one candidate left in a cell) or hidden single (one place
  // left in a house for a digit). Places one digit and returns true.
  stepSingles(g, cand) {
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (!g[r][c] && this.popcount(cand[r][c]) === 1) {
          g[r][c] = this.bitDigit(cand[r][c]);
          if (this.trace) this.record('Naked single', null, [[r, c]], g[r][c], { target: [r, c] });
          return true;
        }
      }
    }
    for (let ui = 0; ui < 27; ui++) {
      const u = this.units[ui];
      for (let n = 1; n <= 9; n++) {
        const b = this.bit(n);
        let spot = null, count = 0, placed = false;
        for (const [r, c] of u) {
          if (g[r][c] === n) { placed = true; break; }
          if (!g[r][c] && (cand[r][c] & b)) { count++; spot = [r, c]; }
        }
        if (!placed && count === 1) {
          g[spot[0]][spot[1]] = n;
          if (this.trace) this.record('Hidden single', SudokuEngine.houseName(ui), u.filter(([r, c]) => !g[r][c] || (r === spot[0] && c === spot[1])), n, { target: spot });
          return true;
        }
      }
    }
    return false;
  }

  // Locked candidates. Pointing: a digit confined to one line inside a box is
  // eliminated from the rest of that line. Claiming: a digit confined to one
  // box inside a line is eliminated from the rest of that box.
  stepLocked(g, cand) {
    let changed = false;
    for (let b = 0; b < 9; b++) {
      const br = ((b / 3) | 0) * 3, bc = (b % 3) * 3;
      for (let n = 1; n <= 9; n++) {
        const bit = this.bit(n), cells = [];
        for (let i = 0; i < 3; i++) {
          for (let j = 0; j < 3; j++) {
            const r = br + i, c = bc + j;
            if (!g[r][c] && (cand[r][c] & bit)) cells.push([r, c]);
          }
        }
        if (!cells.length) continue;
        let hit = false;
        if (cells.every(([r]) => r === cells[0][0])) {
          const r = cells[0][0];
          for (let c = 0; c < 9; c++) {
            if ((c < bc || c >= bc + 3) && !g[r][c] && (cand[r][c] & bit)) { cand[r][c] &= ~bit; hit = true; }
          }
        }
        if (cells.every(([, c]) => c === cells[0][1])) {
          const c = cells[0][1];
          for (let r = 0; r < 9; r++) {
            if ((r < br || r >= br + 3) && !g[r][c] && (cand[r][c] & bit)) { cand[r][c] &= ~bit; hit = true; }
          }
        }
        if (hit) {
          changed = true;
          if (this.trace) return this.record('Locked candidates', `box ${b + 1}`, cells, n);
        }
      }
    }
    for (let ui = 0; ui < 18; ui++) {              // rows and columns only
      const u = this.units[ui];
      for (let n = 1; n <= 9; n++) {
        const bit = this.bit(n);
        const cells = u.filter(([r, c]) => !g[r][c] && (cand[r][c] & bit));
        if (!cells.length) continue;
        const box = cells.map(([r, c]) => ((r / 3) | 0) * 3 + ((c / 3) | 0));
        if (!box.every(v => v === box[0])) continue;
        const br = ((box[0] / 3) | 0) * 3, bc = (box[0] % 3) * 3;
        let hit = false;
        for (let i = 0; i < 3; i++) {
          for (let j = 0; j < 3; j++) {
            const r = br + i, c = bc + j;
            if (cells.some(([a, b2]) => a === r && b2 === c)) continue;
            if (!g[r][c] && (cand[r][c] & bit)) { cand[r][c] &= ~bit; hit = true; }
          }
        }
        if (hit) {
          changed = true;
          if (this.trace) return this.record('Locked candidates', SudokuEngine.houseName(ui), cells, n);
        }
      }
    }
    return changed;
  }

  // Naked and hidden subsets of size k (k = 2 pairs, k = 3 triples), by walking
  // every k-sized combination of the open cells in each house.
  stepSubsets(g, cand, k) {
    let changed = false, stop = false;
    const label = k === 2 ? 'pair' : 'triple';
    for (let ui = 0; ui < 27 && !stop; ui++) {
      const u = this.units[ui];
      const open = u.filter(([r, c]) => !g[r][c]);
      const n = open.length;
      if (n <= k) continue;
      const combo = [];
      const walk = (start) => {
        if (stop) return;
        if (combo.length === k) {
          const cells = () => combo.map(i => open[i]);
          let union = 0;
          for (const i of combo) union |= cand[open[i][0]][open[i][1]];
          // Naked: k cells between them hold exactly k digits — no other cell
          // in the house can use those digits.
          if (this.popcount(union) === k) {
            let hit = false;
            for (let i = 0; i < n; i++) {
              if (combo.includes(i)) continue;
              const [r, c] = open[i];
              if (cand[r][c] & union) { cand[r][c] &= ~union; hit = true; }
            }
            if (hit) {
              changed = true;
              if (this.trace) { stop = this.record(`Naked ${label}`, SudokuEngine.houseName(ui), cells(), 0); return; }
            }
          }
          // Hidden: k digits live only in these k cells — those cells can hold
          // nothing else.
          let digits = 0;
          for (let d = 1; d <= 9; d++) {
            const b = this.bit(d);
            let inside = false, outside = false;
            for (let i = 0; i < n; i++) {
              if (!(cand[open[i][0]][open[i][1]] & b)) continue;
              if (combo.includes(i)) inside = true; else { outside = true; break; }
            }
            if (inside && !outside) digits |= b;
          }
          if (this.popcount(digits) === k) {
            let hit = false;
            for (const i of combo) {
              const [r, c] = open[i];
              if (cand[r][c] & ~digits) { cand[r][c] &= digits; hit = true; }
            }
            if (hit) {
              changed = true;
              if (this.trace) { stop = this.record(`Hidden ${label}`, SudokuEngine.houseName(ui), cells(), 0); return; }
            }
          }
          return;
        }
        for (let i = start; i < n; i++) { combo.push(i); walk(i + 1); combo.pop(); }
      };
      walk(0);
    }
    return changed;
  }

  // X-wing: a digit with exactly two spots in each of two rows, in the same two
  // columns, can be removed from those columns elsewhere (and vice versa).
  stepXWing(g, cand) {
    let changed = false;
    for (let n = 1; n <= 9; n++) {
      const bit = this.bit(n);
      const rowPos = [], colPos = [];
      for (let r = 0; r < 9; r++) {
        const cs = [];
        for (let c = 0; c < 9; c++) if (!g[r][c] && (cand[r][c] & bit)) cs.push(c);
        rowPos.push(cs);
      }
      for (let c = 0; c < 9; c++) {
        const rs = [];
        for (let r = 0; r < 9; r++) if (!g[r][c] && (cand[r][c] & bit)) rs.push(r);
        colPos.push(rs);
      }
      for (let a = 0; a < 9; a++) {
        for (let b = a + 1; b < 9; b++) {
          if (rowPos[a].length === 2 && rowPos[b].length === 2 &&
              rowPos[a][0] === rowPos[b][0] && rowPos[a][1] === rowPos[b][1]) {
            let hit = false;
            for (const c of rowPos[a]) {
              for (let r = 0; r < 9; r++) {
                if (r !== a && r !== b && !g[r][c] && (cand[r][c] & bit)) { cand[r][c] &= ~bit; hit = true; }
              }
            }
            if (hit) {
              changed = true;
              if (this.trace) return this.record('X-wing', `rows ${a + 1} and ${b + 1}`, rowPos[a].flatMap(c => [[a, c], [b, c]]), n);
            }
          }
          if (colPos[a].length === 2 && colPos[b].length === 2 &&
              colPos[a][0] === colPos[b][0] && colPos[a][1] === colPos[b][1]) {
            let hit = false;
            for (const r of colPos[a]) {
              for (let c = 0; c < 9; c++) {
                if (c !== a && c !== b && !g[r][c] && (cand[r][c] & bit)) { cand[r][c] &= ~bit; hit = true; }
              }
            }
            if (hit) {
              changed = true;
              if (this.trace) return this.record('X-wing', `columns ${a + 1} and ${b + 1}`, colPos[a].flatMap(r => [[r, a], [r, b]]), n);
            }
          }
        }
      }
    }
    return changed;
  }

  // XY-wing: a two-candidate pivot {x,y} sees pincers {x,z} and {y,z}. Whichever
  // digit the pivot takes, one pincer becomes z — so z goes from every cell
  // that sees both pincers.
  stepXYWing(g, cand) {
    let changed = false;
    const at = i => cand[(i / 9) | 0][i % 9];
    const bi = [];
    for (let i = 0; i < 81; i++) if (!g[(i / 9) | 0][i % 9] && this.popcount(at(i)) === 2) bi.push(i);
    for (const p of bi) {
      const pm = at(p);
      const wings = bi.filter(i => i !== p && this.seesIdx(p, i));
      for (let a = 0; a < wings.length; a++) {
        const am = at(wings[a]);
        if (am === pm || this.popcount(am & pm) !== 1) continue;
        const z = am & ~pm, want = (pm & ~am) | z;
        for (let b = a + 1; b < wings.length; b++) {
          if (at(wings[b]) !== want) continue;
          let hit = false;
          for (const i of this.peers[wings[a]]) {
            if (i === wings[b] || !this.seesIdx(i, wings[b])) continue;
            const r = (i / 9) | 0, c = i % 9;
            if (!g[r][c] && (cand[r][c] & z)) { cand[r][c] &= ~z; hit = true; }
          }
          if (hit) {
            changed = true;
            if (this.trace) return this.record('XY-wing', null,
              [p, wings[a], wings[b]].map(i => [(i / 9) | 0, i % 9]), this.bitDigit(z));
          }
        }
      }
    }
    return changed;
  }

  // Swordfish: X-wing with three lines. A digit whose spots in three rows all
  // fall in the same three columns can be removed from those columns elsewhere.
  stepSwordfish(g, cand) {
    let changed = false;
    for (let n = 1; n <= 9; n++) {
      const bit = this.bit(n);
      for (const byRow of [true, false]) {
        const pos = [];
        for (let a = 0; a < 9; a++) {
          let m = 0;
          for (let b = 0; b < 9; b++) {
            const r = byRow ? a : b, c = byRow ? b : a;
            if (!g[r][c] && (cand[r][c] & bit)) m |= 1 << b;
          }
          pos.push(m);
        }
        const lines = [];
        for (let a = 0; a < 9; a++) { const k = this.popcount(pos[a]); if (k >= 2 && k <= 3) lines.push(a); }
        for (let i = 0; i < lines.length; i++) for (let j = i + 1; j < lines.length; j++) for (let k = j + 1; k < lines.length; k++) {
          const L = [lines[i], lines[j], lines[k]];
          const span = pos[L[0]] | pos[L[1]] | pos[L[2]];
          if (this.popcount(span) !== 3) continue;
          let hit = false;
          for (let a = 0; a < 9; a++) {
            if (L.includes(a)) continue;
            for (let b = 0; b < 9; b++) {
              if (!(span & (1 << b))) continue;
              const r = byRow ? a : b, c = byRow ? b : a;
              if (!g[r][c] && (cand[r][c] & bit)) { cand[r][c] &= ~bit; hit = true; }
            }
          }
          if (hit) {
            changed = true;
            if (this.trace) {
              const cells = [];
              for (const a of L) for (let b = 0; b < 9; b++) if (pos[a] & (1 << b)) cells.push(byRow ? [a, b] : [b, a]);
              return this.record('Swordfish', `${byRow ? 'rows' : 'columns'} ${L.map(x => x + 1).join(', ')}`, cells, n);
            }
          }
        }
      }
    }
    return changed;
  }

  // Simple colouring. For one digit, link the two spots of every house that has
  // exactly two, and colour each chain alternately: one colour is all true, the
  // other all false. Two same-coloured cells that see each other condemn their
  // colour (colour wrap); a cell seeing both colours can't hold the digit
  // (colour trap).
  stepColouring(g, cand) {
    let changed = false;
    for (let n = 1; n <= 9; n++) {
      const bit = this.bit(n);
      const adj = new Map();
      for (const u of this.units) {
        const spots = [];
        for (const [r, c] of u) if (!g[r][c] && (cand[r][c] & bit)) spots.push(r * 9 + c);
        if (spots.length !== 2) continue;
        for (const [x, y] of [[spots[0], spots[1]], [spots[1], spots[0]]]) {
          if (!adj.has(x)) adj.set(x, new Set());
          adj.get(x).add(y);
        }
      }
      const colour = new Map();
      for (const start of adj.keys()) {
        if (colour.has(start)) continue;
        const comp = [start];
        colour.set(start, 0);
        for (let q = 0; q < comp.length; q++) {
          for (const nb of adj.get(comp[q])) {
            if (!colour.has(nb)) { colour.set(nb, 1 - colour.get(comp[q])); comp.push(nb); }
          }
        }
        if (comp.length < 3) continue;
        const cellsOf = k => comp.filter(i => colour.get(i) === k);
        const asCells = comp.map(i => [(i / 9) | 0, i % 9]);
        for (const k of [0, 1]) {
          const same = cellsOf(k);
          let wrap = false;
          for (let a = 0; a < same.length && !wrap; a++) for (let b = a + 1; b < same.length; b++) {
            if (this.seesIdx(same[a], same[b])) { wrap = true; break; }
          }
          if (!wrap) continue;
          for (const i of same) cand[(i / 9) | 0][i % 9] &= ~bit;
          changed = true;
          if (this.trace) return this.record('Simple colouring', null, asCells, n);
          break;
        }
        const zero = cellsOf(0), one = cellsOf(1);
        let hit = false;
        for (let i = 0; i < 81; i++) {
          const r = (i / 9) | 0, c = i % 9;
          if (g[r][c] || !(cand[r][c] & bit) || colour.has(i)) continue;
          if (zero.some(j => this.seesIdx(i, j)) && one.some(j => this.seesIdx(i, j))) { cand[r][c] &= ~bit; hit = true; }
        }
        if (hit) {
          changed = true;
          if (this.trace) return this.record('Simple colouring', null, asCells, n);
        }
      }
    }
    return changed;
  }

  // ── Puzzle generation ───────────────────────────────────────────────────────
  // `clues` is the starting target and `minClues` the floor the hunt may not
  // dig past; `minTier`/`maxTier` are the difficulty band.
  //
  // The first three levels stay singles-only and differ only in how much is
  // filled in for you — that is what makes them gentle. Medium is the first that
  // forces a real technique. Hard needs more than pairs but always yields to the
  // grader's own toolkit (up to XY-wing, swordfish, colouring); Crazy has fewer
  // clues and no ceiling. (Tier 2 is deliberately not a band of its own:
  // puzzles needing triples or an X-wing but nothing beyond are rare enough
  // that hunting for one costs more than it's worth.)
  static get LEVELS() {
    return {
      basic:  { clues: 50, minClues: 50, minTier: 0, maxTier: 0 },
      simple: { clues: 45, minClues: 45, minTier: 0, maxTier: 0 },
      easy:   { clues: 40, minClues: 40, minTier: 0, maxTier: 0 },
      medium: { clues: 32, minClues: 24, minTier: 1, maxTier: 1 },
      hard:   { clues: 30, minClues: 24, minTier: 2, maxTier: 3 },
      crazy:  { clues: 24, minClues: 20, minTier: 3, maxTier: 4 },
    };
  }

  // A `seed` (any string) makes the puzzle reproducible — the daily puzzle —
  // so the wall-clock deadline is dropped: it would make the result depend on
  // the device's speed.
  generatePuzzle(level, seed) {
    const spec = SudokuEngine.LEVELS[level] || SudokuEngine.LEVELS.easy;
    if (seed != null) {
      this.rand = SudokuEngine.seededRandom(String(seed));
      try { return this.generatePuzzle(level); } finally { this.rand = Math.random; }
    }
    const deadline = this.rand === Math.random ? Date.now() + 2000 : Infinity;
    let best = null, bestDistance = Infinity;

    for (let attempt = 0; attempt < 24; attempt++) {
      const candidate = this.carve(spec, deadline);
      const distance = SudokuEngine.bandDistance(spec, candidate.tier);
      if (distance < bestDistance) { bestDistance = distance; best = candidate; }
      if (distance === 0 || Date.now() > deadline) break;
    }

    const grid = best.grid;
    return { grid, solution: best.solution, given: grid.map(row => row.map(v => v !== 0)), tier: best.tier };
  }

  // Overshooting the ceiling is far worse than undershooting the floor: a Hard
  // that is too easy is a disappointment, one that needs guessing breaks the
  // promise that Hard yields to logic.
  static bandDistance(spec, t) {
    return t < spec.minTier ? spec.minTier - t : t > spec.maxTier ? (t - spec.maxTier) * 10 : 0;
  }

  // One generation attempt: carve a solution down to the clue target, then push
  // the grade into the requested band.
  carve(spec, deadline) {
    const solution = this.generateSolution();
    const grid = solution.map(r => [...r]);

    const positions = [];
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) positions.push([r, c]);
    this.shuffle(positions);

    // Phase 1 — remove down to the clue target, keeping the solution unique.
    // `kept` collects the cells uniqueness refused to give up plus everything
    // left over once the target was hit; both are fair game for phase 2.
    const removed = [], kept = [];
    let target = 81 - spec.clues;
    for (const [r, c] of positions) {
      if (removed.length >= target) { kept.push([r, c]); continue; }
      const backup = grid[r][c];
      grid[r][c] = 0;
      if (this.hasUniqueSolution(grid)) removed.push([r, c]);
      else { grid[r][c] = backup; kept.push([r, c]); }
    }

    // Phase 2 — hunt the requested band one cell at a time. Removing a clue can
    // only make the puzzle harder and restoring one can only make it easier, so
    // each step moves in the right direction; what it can't do is guarantee it
    // lands on the wanted tier rather than stepping straight over it. Hence the
    // step budget and the running best — whichever board came closest wins.
    let tier = this.gradeTier(grid);
    let best = { grid: grid.map(r => [...r]), tier };
    const distance = t => SudokuEngine.bandDistance(spec, t);

    for (let step = 0; step < 40 && distance(tier) > 0 && Date.now() < deadline; step++) {
      if (tier < spec.minTier) {
        if (!kept.length || 81 - removed.length <= spec.minClues) break;
        const [r, c] = kept.pop();
        const backup = grid[r][c];
        grid[r][c] = 0;
        // Uniqueness refused this cell before and the board has only lost clues
        // since, so it can refuse again — put it straight back if so.
        if (!this.hasUniqueSolution(grid)) { grid[r][c] = backup; continue; }
        removed.push([r, c]);
      } else {
        if (!removed.length) break;
        const [r, c] = removed.pop();
        grid[r][c] = solution[r][c];
        kept.unshift([r, c]);
      }
      tier = this.gradeTier(grid);
      if (distance(tier) < distance(best.tier)) best = { grid: grid.map(r => [...r]), tier };
    }

    return { grid: best.grid, solution, tier: best.tier };
  }

  // Validate a completed grid
  isValidCompleteSolution(grid) {
    for (let i = 0; i < 9; i++) {
      const row = new Set(), col = new Set();
      for (let j = 0; j < 9; j++) {
        if (grid[i][j] < 1 || grid[i][j] > 9 || row.has(grid[i][j])) return false;
        row.add(grid[i][j]);
        if (grid[j][i] < 1 || grid[j][i] > 9 || col.has(grid[j][i])) return false;
        col.add(grid[j][i]);
      }
    }
    for (let br = 0; br < 3; br++) {
      for (let bc = 0; bc < 3; bc++) {
        const box = new Set();
        for (let i = 0; i < 3; i++) {
          for (let j = 0; j < 3; j++) {
            const v = grid[br * 3 + i][bc * 3 + j];
            if (box.has(v)) return false;
            box.add(v);
          }
        }
      }
    }
    return true;
  }

  // mulberry32 over an FNV-1a hash of the seed string.
  static seededRandom(seed) {
    let h = 2166136261;
    for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
    let a = h >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Fisher-Yates shuffle
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.rand() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}
