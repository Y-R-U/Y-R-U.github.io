import {
  EMPTY, KIND, DENSITY, SPREAD, SLIP, LIFE,
  POWDER, LIQUID, GAS, STATIC, BLOB, NONE,
} from './materials.js';
import { CHUNK, F_CLEARING, F_BLOB } from './grid.js';
import { applyReaction as react } from './reactions.js';

export const F_DIR = 8;   // liquid remembers which way it was flowing

// Gravity is a cardinal unit vector, not a hardcoded "+1 row". HOURGLASS flips
// it and a tilt mode can turn it sideways, both for free.
export const GRAV_DOWN  = { gx: 0, gy: 1 };
export const GRAV_UP    = { gx: 0, gy: -1 };
export const GRAV_LEFT  = { gx: -1, gy: 0 };
export const GRAV_RIGHT = { gx: 1, gy: 0 };

/**
 * Can `srcMat` move into (nx,ny)?
 *
 * Only fluids yield. A powder never pushes through another powder, and nothing
 * pushes through STATIC or a jelly blob. Cells mid-dissolve are frozen so a
 * clearing chain stays legible while it flashes.
 *
 * `along` is +1 when moving with gravity, -1 against it, 0 across.
 */
function canMove(g, nx, ny, srcMat, along) {
  if (nx < 0 || ny < 0 || nx >= g.cols || ny >= g.rows) return -1;
  const di = ny * g.cols + nx;
  if (g.flags[di] & (F_CLEARING | F_BLOB)) return -1;
  const dm = g.mat[di];
  if (dm === EMPTY) return di;
  const k = KIND[dm];
  if (k === STATIC || k === POWDER || k === BLOB || k === NONE) return -1;
  const ok = along < 0
    ? DENSITY[srcMat] < DENSITY[dm]
    : DENSITY[srcMat] > DENSITY[dm];
  return ok ? di : -1;
}

function stepPowder(g, i, x, y, m, rng, G) {
  const { gx, gy, px, py } = G;
  let t = canMove(g, x + gx, y + gy, m, 1);
  if (t >= 0) { g.swap(i, t); return true; }
  if (rng.next() >= SLIP[m]) return false;
  const s = rng.chance(0.5) ? 1 : -1;
  for (let k = 0; k < 2; k++) {
    const d = k === 0 ? s : -s;
    t = canMove(g, x + gx + px * d, y + gy + py * d, m, 1);
    if (t >= 0) { g.swap(i, t); return true; }
  }
  return false;
}

function stepLiquid(g, i, x, y, m, rng, G) {
  const { gx, gy, px, py } = G;
  let t = canMove(g, x + gx, y + gy, m, 1);
  if (t >= 0) { g.swap(i, t); return true; }
  const s = rng.chance(0.5) ? 1 : -1;
  for (let k = 0; k < 2; k++) {
    const d = k === 0 ? s : -s;
    t = canMove(g, x + gx + px * d, y + gy + py * d, m, 1);
    if (t >= 0) { g.swap(i, t); return true; }
  }
  // Level out across gravity. Persisting the flow direction is what makes a
  // spill read as a spreading sheet instead of a jittering pile.
  let dir = (g.flags[i] & F_DIR) ? 1 : -1;
  const reach = SPREAD[m];
  for (let pass = 0; pass < 2; pass++) {
    let last = -1;
    for (let n = 1; n <= reach; n++) {
      const nx = x + px * dir * n, ny = y + py * dir * n;
      const c = canMove(g, nx, ny, m, 0);
      if (c < 0) break;
      last = c;
      if (canMove(g, nx + gx, ny + gy, m, 1) >= 0) break;   // found a ledge
    }
    if (last >= 0) {
      g.swap(i, last);
      if (dir > 0) g.flags[last] |= F_DIR; else g.flags[last] &= ~F_DIR;
      return true;
    }
    dir = -dir;
  }
  return false;
}

function stepGas(g, i, x, y, m, rng, G) {
  const { gx, gy, px, py } = G;
  let t = canMove(g, x - gx, y - gy, m, -1);
  if (t >= 0) { g.swap(i, t); return true; }
  const s = rng.chance(0.5) ? 1 : -1;
  for (let k = 0; k < 2; k++) {
    const d = k === 0 ? s : -s;
    t = canMove(g, x - gx + px * d, y - gy + py * d, m, -1);
    if (t >= 0) { g.swap(i, t); return true; }
  }
  const d = rng.chance(0.5) ? 1 : -1;
  t = canMove(g, x + px * d, y + py * d, m, 0);
  if (t >= 0) { g.swap(i, t); return true; }
  return false;
}

/**
 * One simulation tick.
 *
 * Cells are visited farthest-along-gravity first, so a falling cell always lands
 * in already-processed territory and cannot move twice. The across-gravity scan
 * direction alternates each tick because a fixed one visibly biases every pile
 * to lean the same way.
 */
export function step(g, rng, stats, grav = GRAV_DOWN) {
  g.beginTick();
  const cols = g.cols, rows = g.rows, cw = g.cw;
  const gx = grav.gx, gy = grav.gy;
  const G = { gx, gy, px: -gy, py: gx };
  const flip = (g.tick & 1) === 1;
  const mat = g.mat, moved = g.moved, active = g.active, flags = g.flags;

  const vert = gy !== 0;
  const aN = vert ? rows : cols;
  const bN = vert ? cols : rows;
  const desc = (vert ? gy : gx) > 0;
  const aStart = desc ? aN - 1 : 0;
  const aStep = desc ? -1 : 1;

  for (let ai = 0; ai < aN; ai++) {
    const a = aStart + ai * aStep;
    for (let bi = 0; bi < bN; bi++) {
      const b = flip ? bN - 1 - bi : bi;
      const x = vert ? b : a;
      const y = vert ? a : b;
      if (active[((y / CHUNK) | 0) * cw + ((x / CHUNK) | 0)] === 0) continue;
      const i = y * cols + x;
      const m = mat[i];
      if (m === EMPTY || moved[i]) continue;
      if (flags[i] & (F_CLEARING | F_BLOB)) continue;

      // lifetime first: an expired gas must not also get a move
      if (LIFE[m]) {
        if (g.life[i] <= 1) { g.clear(i); stats.destroyed++; continue; }
        g.life[i]--;
        g.touchIdx(i);
      }

      // Chemistry runs BEFORE movement: afterwards the cell has moved and index
      // i no longer refers to it, so reacting there would transform a bystander.
      if (stats.reactionsEnabled) {
        let hit = false;
        if (x > 0) hit = react(g, i, i - 1, rng, stats);
        if (!hit && x < cols - 1) hit = react(g, i, i + 1, rng, stats);
        if (!hit && y > 0) hit = react(g, i, i - cols, rng, stats);
        if (!hit && y < rows - 1) hit = react(g, i, i + cols, rng, stats);
        if (hit) continue;   // identity changed; let it move next tick
      }

      const k = KIND[m];
      if (k === POWDER) stepPowder(g, i, x, y, m, rng, G);
      else if (k === LIQUID) stepLiquid(g, i, x, y, m, rng, G);
      else if (k === GAS) stepGas(g, i, x, y, m, rng, G);
    }
  }
}
