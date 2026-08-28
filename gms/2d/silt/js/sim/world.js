import { Grid, COLS, ROWS } from './grid.js';
import { step, GRAV_DOWN, GRAV_UP } from './step.js';
import { Clears } from './clears.js';
import { makePiece, spawnPiece, collides, tryRotate, tryMove, dropDistance, shatter, overflowed, forEachCell } from './pieces.js';
import { SAND, JELLY } from './materials.js';
import { Blobs } from './blobs.js';
import { makeRng } from '../core/rng.js';

export const SIM_HZ = 60;
const DETECT_EVERY = 3;   // chain detection is the only superlinear cost; 20Hz is plenty

export const DEFAULT_CFG = {
  seed: 1,
  cols: COLS,
  rows: ROWS,
  tints: 4,
  mat: SAND,
  fallRate: 22,          // grains per second
  fallAccel: 0.55,       // grains/sec added per cleared chain
  fallTime: 0.08,        // grains/sec added per SECOND of play
  fallMax: 70,
  reactions: false,
  shapes: null,
  tintMode: 'mono',
  diagonal: true,
};

export class World {
  constructor(cfg = {}) {
    this.cfg = { ...DEFAULT_CFG, ...cfg };
    this.g = new Grid(this.cfg.cols, this.cfg.rows);
    this.rng = makeRng(this.cfg.seed);
    this.clears = new Clears(this.g, { diagonal: this.cfg.diagonal });
    this.blobs = new Blobs(this.g);
    this.stats = { created: 0, destroyed: 0, reactions: 0, reactionsEnabled: this.cfg.reactions };

    this.piece = null;
    this.nextPiece = makePiece(this.rng, this.cfg);
    this.fallAccum = 0;
    this.fallRate = this.cfg.fallRate;
    this.chainBoost = 0;      // the speed a player has earned by clearing
    this.softDrop = false;

    this.score = 0;
    this.chains = 0;
    this.cellsCleared = 0;
    this.combo = 0;
    this.over = false;
    this.t = 0;
    this.ticks = 0;
    this.lastChainSize = 0;
    this.grav = GRAV_DOWN;
  }

  /** HOURGLASS and tilt modes drive this; a cardinal unit vector only. */
  setGravity(gx, gy) {
    this.grav = { gx: Math.sign(gx), gy: Math.sign(gy) };
    this.g.wakeAll();
  }

  spawn() {
    const p = this.nextPiece;
    this.nextPiece = makePiece(this.rng, this.cfg);
    spawnPiece(this.g, p);
    this.piece = p;
    this.softDrop = false;
    this.fallAccum = 0;
    // Losing means the stack reached the ceiling: the fresh piece has nowhere
    // to enter even at its spawn row.
    if (collides(this.g, p, p.x, p.y + 1)) { this.over = true; this.piece = null; }
    return p;
  }

  land() {
    const p = this.piece;
    this.piece = null;
    if (overflowed(this.g, p)) { this.over = true; return; }
    shatter(this.g, p, this.stats);
    // A jelly piece is a soft body, not loose grains. A blob is single-tint but
    // a duo/mixed piece is not, so group by tint and spawn one body per group —
    // touching same-tint bodies merge themselves.
    if (p.mat === JELLY) {
      const byTint = new Map();
      forEachCell(p, (x, y, tint) => {
        if (y < 0 || y >= this.g.rows || x < 0 || x >= this.g.cols) return;
        if (!byTint.has(tint)) byTint.set(tint, []);
        byTint.get(tint).push({ x, y });
      });
      for (const [tint, cells] of byTint) if (cells.length) this.blobs.spawn(cells, tint);
    }
  }

  moveBy(dx) {
    if (!this.piece) return false;
    const s = Math.sign(dx);
    let moved = false;
    for (let k = 0; k < Math.abs(dx); k++) {
      if (!tryMove(this.g, this.piece, s, 0)) break;
      moved = true;
    }
    return moved;
  }

  rotate() {
    if (!this.piece) return false;
    const r = tryRotate(this.g, this.piece);
    if (!r) return false;
    this.piece = r;
    return true;
  }

  hardDrop() {
    if (!this.piece) return 0;
    const d = dropDistance(this.g, this.piece);
    this.piece.y += d;
    this.land();
    return d;
  }

  tick() {
    if (this.over) return;
    const g = this.g;
    this.ticks++;
    this.t += 1 / SIM_HZ;

    /**
     * SPEED IS A FUNCTION OF TIME AS WELL AS OF CHAINS.
     *
     * The ramp used to be chain-driven only, which had it backwards: clearing
     * well was punished with speed and stalling was rewarded with a game that
     * stayed slow forever. Measured, a player who dumps every piece against one
     * wall and never blocks the spawn column survives 9 to 11 minutes and 600
     * placements — the run does end, but no phone game should ask that of you
     * before it does. The bot's own games average two minutes, which is why no
     * gate ever saw this: the bot is not trying to survive.
     *
     * `fallTime` is the term that makes a run finite regardless of how it is
     * played. `chainBoost` is kept separate so the two contributions stay
     * legible, and so the mode-facing meaning of fallAccel does not change.
     */
    this.fallRate = Math.min(this.cfg.fallMax,
      this.cfg.fallRate + this.chainBoost + this.cfg.fallTime * this.t);

    // Blobs move before the cellular step: the grid is authoritative, and a
    // blob that has already rasterised itself is terrain as far as sand is
    // concerned.
    this.blobs.step(this.rng, this.stats);
    step(g, this.rng, this.stats, this.grav);
    this.clears.advance(this.stats);

    if (this.ticks % DETECT_EVERY === 0) {
      const n = this.clears.detect();
      if (n > 0) {
        this.combo++;
        this.chains++;
        this.cellsCleared += n;
        this.lastChainSize = n;
        // Superlinear in chain size so one huge chain beats several small ones.
        this.score += Math.round(n * (1 + n / 220) * (1 + this.combo * 0.35));
        this.chainBoost += this.cfg.fallAccel;
      }
    }

    if (!this.piece) { this.spawn(); return; }

    const rate = this.softDrop ? Math.max(this.fallRate * 6, 120) : this.fallRate;
    this.fallAccum += rate / SIM_HZ;
    while (this.fallAccum >= 1) {
      this.fallAccum -= 1;
      if (!tryMove(g, this.piece, 0, 1)) { this.land(); break; }
    }
  }

  /** Flat, JSON-safe. This is what __state and the node gates both read. */
  snapshot() {
    return {
      t: +this.t.toFixed(3),
      ticks: this.ticks,
      over: this.over,
      score: this.score,
      chains: this.chains,
      combo: this.combo,
      cellsCleared: this.cellsCleared,
      lastChainSize: this.lastChainSize,
      fallRate: +this.fallRate.toFixed(2),
      cells: this.g.count,
      dissolving: this.clears.dissolving.length,
      blobs: this.blobs.list().length,
      piece: this.piece ? { key: this.piece.key, x: this.piece.x, y: this.piece.y, rot: this.piece.rot } : null,
      next: this.nextPiece ? this.nextPiece.key : null,
      created: this.stats.created,
      destroyed: this.stats.destroyed,
      reactions: this.stats.reactions,
      grav: this.grav,
      rng: this.rng.state(),
    };
  }
}
