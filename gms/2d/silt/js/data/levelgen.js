import {
  EMPTY, WALL, SAND, WATER, JELLY, OIL, LAVA, ICE, ASH, CRYSTAL, LIFE, TINTABLE,
} from '../sim/materials.js';

// ALCHEMY level generator.
//
// Levels are DATA — a fixed palette, an explicit list of rectangles, an
// objective and three star thresholds. Nothing here runs at play time except
// applyScene(); the rectangles are baked by tools/genlevels.mjs so the shipped
// levels.js cannot drift from the generator that measured its star times.
//
// Two rules the generator must never break, both learned the hard way:
//
//  1. Scenery made of a TINTABLE material must never reach from wall to wall in
//     one tint, or clears.detect fires on frame one and the level completes
//     itself. gate A2 in modesim checks exactly this.
//  2. A material with a lifetime (fire, steam) cannot be placed with fill():
//     Grid.set zeroes life, and the step loop destroys a zero-life cell on the
//     next tick. applyScene re-arms life explicitly.

export const ARCHETYPES = ['quench', 'crucible', 'span', 'excavate', 'slag'];

export const OBJECTIVE_LABEL = {
  chains: (o) => `Clear ${o.target} chains`,
  dissolve: (o) => `Dissolve ${o.target} grains`,
  crystal: (o) => `Forge ${o.target} crystal`,
  purge: (o) => `Reduce sand to ${o.target}`,
};

const NAMES_A = ['Cold', 'Slow', 'Bright', 'Deep', 'First', 'Iron', 'Salt', 'Glass', 'Amber', 'Quiet',
                 'Long', 'Low', 'Red', 'Hollow', 'Bitter', 'Still', 'Sharp', 'Pale', 'Old', 'Fine'];
const NAMES_B = ['Quench', 'Crucible', 'Span', 'Cut', 'Slag', 'Furnace', 'Basin', 'Vein', 'Pour', 'Kiln',
                 'Melt', 'Drift', 'Seam', 'Ash', 'Bloom', 'Anvil', 'Cinder', 'Brine', 'Shelf', 'Ladder'];

function rngFor(seed) {
  let s = (seed >>> 0) || 1;
  const r = {
    next() {
      s |= 0; s = (s + 0x6D2B79F5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    int(n) { return (r.next() * n) | 0; },
    range(a, b) { return a + r.next() * (b - a); },
    irange(a, b) { return a + r.int(b - a + 1); },
    chance(p) { return r.next() < p; },
    pick(a) { return a[(r.next() * a.length) | 0]; },
  };
  return r;
}

const BLK = 8;
const snap = (v, m) => Math.max(m, Math.round(v / m) * m);

/** Paint one level's starting board. Deterministic: no rng at play time. */
export function applyScene(world, level) {
  const g = world.g;
  for (const r of level.scene) {
    const x = Math.max(0, r.x | 0), y = Math.max(0, r.y | 0);
    const w = Math.min(g.cols - x, r.w | 0), h = Math.min(g.rows - y, r.h | 0);
    if (w <= 0 || h <= 0) continue;
    g.fill(x, y, w, h, r.mat, r.tint || 0);
    if (LIFE[r.mat]) {
      for (let yy = y; yy < y + h; yy++)
        for (let xx = x; xx < x + w; xx++) g.life[yy * g.cols + xx] = LIFE[r.mat];
    }
  }
  g.wakeAll();
}

export function countMat(g, mat) {
  let n = 0;
  const m = g.mat;
  for (let i = 0; i < m.length; i++) if (m[i] === mat) n++;
  return n;
}

/**
 * Objective tracker. `baseline` is captured after applyScene so a purge target
 * means "from where the level actually started", not from an empty board.
 */
export function makeTracker(world, level) {
  const o = level.objective;
  const t = {
    type: o.type,
    target: o.target,
    value: 0,
    done: false,
    baseline: o.type === 'purge' ? countMat(world.g, o.mat || SAND) : 0,
    _every: 12,
    update(w) {
      switch (o.type) {
        case 'chains': t.value = w.chains; t.done = t.value >= o.target; break;
        case 'dissolve': t.value = w.cellsCleared; t.done = t.value >= o.target; break;
        case 'crystal':
          if (w.ticks % t._every === 0 || t.value === 0) t.value = countMat(w.g, CRYSTAL);
          t.done = t.value >= o.target;
          break;
        case 'purge': {
          if (w.ticks % t._every === 0 || t.value === 0) t.value = countMat(w.g, o.mat || SAND);
          t.done = t.value <= o.target;
          break;
        }
      }
      return t.done;
    },
    /** 0..1, for the HUD ring. */
    frac() {
      if (o.type === 'purge') {
        const span = Math.max(1, t.baseline - o.target);
        return Math.max(0, Math.min(1, (t.baseline - t.value) / span));
      }
      return Math.max(0, Math.min(1, t.value / Math.max(1, o.target)));
    },
  };
  return t;
}

// --------------------------------------------------------------- generation

function frame(level, rng) {
  const s = [];
  s.push({ x: 0, y: level.rows - 4, w: level.cols, h: 4, mat: WALL });
  return s;
}

/** A pool sitting on the floor, inset from both walls so it never spans. */
function pool(level, rng, mat, hMin, hMax) {
  const h = rng.irange(hMin, hMax);
  const inset = rng.irange(2, 8);
  return { x: inset, y: level.rows - 4 - h, w: level.cols - inset * 2, h, mat };
}

function pillars(level, rng, mat, n, hMin, hMax) {
  const out = [];
  for (let k = 0; k < n; k++) {
    const w = rng.irange(2, 5);
    const h = rng.irange(hMin, hMax);
    const x = rng.irange(3, Math.max(4, level.cols - w - 3));
    out.push({ x, y: level.rows - 4 - h, w, h, mat });
  }
  return out;
}

/**
 * Tinted mounds. Deliberately narrow — a tinted rectangle touching both walls
 * would be a wall-to-wall chain on frame one.
 */
function mounds(level, rng, mat, n, tints) {
  const out = [];
  const maxW = Math.max(6, Math.floor(level.cols * 0.42));
  for (let k = 0; k < n; k++) {
    const w = rng.irange(6, maxW);
    const h = rng.irange(5, 16);
    const x = rng.irange(1, Math.max(2, level.cols - w - 1));
    const y = level.rows - 4 - h - rng.irange(0, 20);
    out.push({ x, y, w, h, mat, tint: 1 + rng.int(tints) });
  }
  return out;
}

function archetypeFor(i, d, rng) {
  // Early levels teach chains, the middle teaches the reactions, the back half
  // mixes. Ordering is by index so the ladder is stable across regeneration.
  if (i < 6) return 'span';
  if (i < 12) return 'excavate';
  if (i < 18) return 'quench';
  if (i < 24) return 'crucible';
  if (i < 30) return 'slag';
  return ARCHETYPES[i % ARCHETYPES.length];
}

export function genLevel(i, count, seed) {
  const rng = rngFor((seed ^ Math.imul(i + 1, 0x9e3779b1)) >>> 0);
  const d = count > 1 ? i / (count - 1) : 0;
  const tints = 3;
  const level = {
    id: i + 1,
    seed: (seed ^ Math.imul(i + 1, 0x85ebca6b)) >>> 0,
    name: `${NAMES_A[i % NAMES_A.length]} ${NAMES_B[(i * 7 + 3) % NAMES_B.length]}`,
    act: 1 + Math.min(4, Math.floor(d * 5)),
    cols: snap(56 + d * 24 + rng.range(-4, 4), BLK),
    rows: Math.round(136 + d * 48),
    tints,
    tintMode: 'mono',
    diagonal: true,
    reactions: true,
    fallRate: Math.round(18 + d * 20 + rng.range(-2, 2)),
    fallAccel: +(0.4 + d * 0.6).toFixed(2),
    fallMax: Math.round(58 + d * 42),
    limitS: 75,
    seq: [SAND],
    scene: [],
    objective: { type: 'chains', target: 2 },
    stars: [75, 50, 32],
    arch: 'span',
  };

  const arch = archetypeFor(i, d, rng);
  level.arch = arch;
  const s = frame(level, rng);

  switch (arch) {
    case 'span':
      level.seq = [SAND];
      s.push(...pillars(level, rng, CRYSTAL, 1 + Math.round(d * 4), 6, 10 + Math.round(d * 20)));
      level.objective = { type: 'chains', target: 2 + Math.round(d * 4) };
      break;

    case 'excavate':
      level.seq = [SAND, SAND, ICE];
      s.push(...mounds(level, rng, SAND, 2 + Math.round(d * 3), tints));
      s.push(...pillars(level, rng, WALL, Math.round(d * 3), 5, 14));
      level.objective = { type: 'dissolve', target: Math.round(1600 + d * 5200) };
      break;

    case 'quench':
      // Lava on the floor, water in your hand. Crystal is permanent, so every
      // point of progress also builds a wall you have to live with.
      level.seq = [WATER, WATER, SAND];
      s.push(pool(level, rng, LAVA, 4 + Math.round(d * 5), 8 + Math.round(d * 8)));
      s.push(...pillars(level, rng, WALL, Math.round(d * 2), 6, 16));
      level.objective = { type: 'crystal', target: Math.round(160 + d * 900) };
      break;

    case 'crucible':
      // The inverse: water on the floor, lava in your hand. Far more violent —
      // a lava piece is 256 cells of it.
      level.seq = [SAND, LAVA, SAND, WATER];
      s.push(pool(level, rng, WATER, 6 + Math.round(d * 6), 12 + Math.round(d * 10)));
      s.push(...pillars(level, rng, CRYSTAL, Math.round(d * 3), 5, 12));
      level.objective = { type: 'crystal', target: Math.round(220 + d * 1100) };
      break;

    case 'slag': {
      level.seq = [SAND, SAND, WATER];
      const n = 3 + Math.round(d * 3);
      const ms = mounds(level, rng, SAND, n, tints);
      s.push(...ms);
      const start = ms.reduce((a, m) => a + m.w * m.h, 0);
      level.objective = { type: 'purge', mat: SAND, target: Math.round(start * (0.55 - d * 0.2)) };
      break;
    }
  }

  level.scene = s;
  return level;
}

export function genLevels(count = 120, seed = 0x5117) {
  const out = [];
  for (let i = 0; i < count; i++) out.push(genLevel(i, count, seed));
  return out;
}

/** Cheap structural check — no simulation. Catches rule 1 above. */
export function sceneSpans(level) {
  const cols = level.cols, rows = level.rows;
  for (const r of level.scene) {
    if (!TINTABLE[r.mat]) continue;
    if (r.x <= 0 && r.x + r.w >= cols) return true;
  }
  return false;
}

export const MATS_BY_NAME = { EMPTY, WALL, SAND, WATER, JELLY, OIL, LAVA, ICE, ASH, CRYSTAL };
