import {
  EMPTY, SAND, WATER, JELLY, OIL, LAVA, ICE, ASH, CRYSTAL, FIRE, STEAM,
  MAT_COUNT, TINTABLE, FLAMMABLE, LIFE,
} from './materials.js';

/**
 * Neighbour chemistry, as data.
 *
 * `applyReaction(g, i, ni, rng, stats)` is a drop-in replacement for the inline
 * `react()` in step.js and keeps its semantics exactly: it is called with the
 * cell being processed at `i` and one of its four neighbours at `ni`, it returns
 * true when the pair transformed, and it bumps `stats.reactions`.
 *
 * Two things make the table worth having over the if-chain it replaces:
 *   - lookup is a dense MAT_COUNT^2 array, so a pair with no chemistry costs one
 *     array read instead of walking every rule;
 *   - the pair list is enumerable, which is what lets tools/jellysim.mjs
 *     exercise EVERY reaction exhaustively rather than the ones someone
 *     remembered to write a test for.
 *
 * Direction matters. step.js never processes a cell that carries F_BLOB, so a
 * jelly cell is never the `a` side — every jelly rule is written with JELLY as
 * `b`. Same reason FIRE and LAVA drive their own pairs.
 *
 * Tint policy is uniform and needs no column: the product keeps the tint of the
 * cell it replaces when the product is tintable, and loses it when it is not.
 * That reproduces all seven original pairs exactly (crystal/steam/fire drop the
 * colour, water melted out of ice keeps it) and gives melted jelly the right
 * behaviour for free — it stays your colour, so it can still finish a chain.
 *
 * CRYSTAL has no rule that consumes it. That is the design: quenching lava
 * solves the immediate problem and leaves a wall you chose to build.
 */

export const T_KEEP = 'keep';   // tintable product inherits the replaced cell's tint
export const T_NONE = 'none';   // product is always untinted

/**
 * Authored rules. `bAny` matches a material PROPERTY and is expanded into
 * concrete pairs at load, so the runtime table and the gate both see real pairs.
 *
 *   a, b       materials at i and ni
 *   p          probability, default 1
 *   self       material i becomes, or null
 *   other      material ni becomes, or null
 *   selfTint / otherTint   T_KEEP (default) or T_NONE
 */
export const RULES = [
  // ---- the original seven, semantics unchanged ---------------------------
  {
    name: 'quench', a: LAVA, b: WATER, self: CRYSTAL, other: STEAM,
    note: 'lava meeting water freezes into permanent, unclearable crystal',
  },
  {
    name: 'thaw-lava', a: LAVA, b: ICE, other: WATER,
    note: 'ice melts near lava and keeps its colour',
  },
  {
    name: 'ignite', a: LAVA, b: OIL, other: FIRE,
    note: 'oil touching lava lights instantly',
  },
  {
    name: 'glass', a: LAVA, b: SAND, p: 0.06, other: CRYSTAL,
    note: 'slow: lava vitrifies sand, so a sand wall buys time but not safety',
  },
  {
    name: 'spread', a: FIRE, bAny: 'flammable', p: 0.28, other: FIRE,
    note: 'fire creeps along anything flammable',
  },
  {
    name: 'thaw-fire', a: FIRE, b: ICE, other: WATER,
    note: 'ice melts in fire and keeps its colour',
  },
  {
    name: 'douse', a: FIRE, b: WATER, self: STEAM,
    note: 'the fire dies, not the water',
  },

  // ---- jelly ------------------------------------------------------------
  {
    name: 'melt-fire', a: FIRE, b: JELLY, p: 0.10, other: WATER,
    note: 'jelly is slow to burn; it melts to water of the same colour, so a '
      + 'blob is a heat sink you can still chain afterwards',
  },
  {
    name: 'melt-lava', a: LAVA, b: JELLY, p: 0.40, other: WATER,
    note: 'jelly melts fast on lava — and the water it leaves quenches the lava '
      + 'into crystal, which makes a blob a two-stage lava plug',
  },
  {
    name: 'freeze', a: ICE, b: JELLY, p: 0.03, other: ICE,
    note: 'slow: ice sets a blob solid. Frozen jelly keeps its tint and is still '
      + 'clearable, but it is rigid — you have traded wobble for a wall',
  },

  // ---- alchemy ----------------------------------------------------------
  {
    name: 'condense', a: STEAM, b: ICE, p: 0.09, self: WATER,
    note: 'steam that reaches ice comes back down as water — the water cycle '
      + 'closes, so steam is a resource rather than a leak',
  },
  {
    name: 'consume', a: LAVA, b: ASH, p: 0.05, other: LAVA,
    note: 'lava eats its own ash and grows. Burning your way out of trouble '
      + 'feeds the thing you were burning',
  },
];

/** Property matchers used by `bAny`. */
const MATCHERS = {
  flammable: (m) => m !== EMPTY && FLAMMABLE[m] === 1,
  tintable: (m) => m !== EMPTY && TINTABLE[m] === 1,
};

function normalise(r, idx) {
  const out = {
    index: idx,
    name: r.name,
    a: r.a,
    b: r.b,
    p: r.p === undefined ? 1 : r.p,
    self: r.self === undefined ? null : r.self,
    other: r.other === undefined ? null : r.other,
    selfTint: r.selfTint || T_KEEP,
    otherTint: r.otherTint || T_KEEP,
    destroys: !!r.destroys,
    note: r.note || '',
  };
  if (out.self === null && out.other === null) throw new Error(`reaction ${r.name}: transforms nothing`);
  if (!out.destroys && (out.self === EMPTY || out.other === EMPTY)) {
    throw new Error(`reaction ${r.name}: produces EMPTY without destroys:true — the ledger would drift`);
  }
  return out;
}

/** Concrete (a,b) pairs after property matchers are expanded. */
export const PAIRS = [];

/** Dense lookup: TABLE[a * MAT_COUNT + b] is an ordered rule list, or undefined. */
const TABLE = new Array(MAT_COUNT * MAT_COUNT);

for (let k = 0; k < RULES.length; k++) {
  const src = RULES[k];
  const bs = [];
  if (src.bAny) {
    const m = MATCHERS[src.bAny];
    if (!m) throw new Error(`reaction ${src.name}: unknown matcher ${src.bAny}`);
    for (let mat = 1; mat < MAT_COUNT; mat++) if (m(mat)) bs.push(mat);
  } else {
    bs.push(src.b);
  }
  for (const b of bs) {
    const rule = normalise({ ...src, b }, k);
    const key = rule.a * MAT_COUNT + rule.b;
    if (!TABLE[key]) TABLE[key] = [];
    TABLE[key].push(rule);
    PAIRS.push(rule);
  }
}

export { TABLE as REACTION_TABLE };

/** Rules registered for this ordered pair, or an empty array. */
export function rulesFor(a, b) { return TABLE[a * MAT_COUNT + b] || []; }

export function hasReaction(a, b) { return TABLE[a * MAT_COUNT + b] !== undefined; }

function put(g, cell, mat, tintMode, stats) {
  const t = tintMode === T_NONE ? 0 : (TINTABLE[mat] ? g.tint[cell] : 0);
  const was = g.mat[cell];
  g.set(cell, mat, t);
  if (LIFE[mat]) g.life[cell] = LIFE[mat];
  if (stats && was !== EMPTY && mat === EMPTY) stats.destroyed++;
  if (stats && was === EMPTY && mat !== EMPTY) stats.created++;
}

/**
 * Run the chemistry for the ordered pair (i, ni).
 * @returns true when the pair transformed — the caller must then stop treating
 * `i` as its old material, exactly as the inline version required.
 */
export function applyReaction(g, i, ni, rng, stats) {
  const list = TABLE[g.mat[i] * MAT_COUNT + g.mat[ni]];
  if (list === undefined) return false;
  for (let k = 0; k < list.length; k++) {
    const r = list[k];
    if (r.p < 1 && !rng.chance(r.p)) continue;
    // Both products are written from the pre-reaction state, so a rule that
    // changes both cells cannot read a value it just overwrote.
    if (r.self !== null && r.other !== null) {
      const selfTint = r.selfTint === T_NONE ? 0 : (TINTABLE[r.self] ? g.tint[i] : 0);
      const otherTint = r.otherTint === T_NONE ? 0 : (TINTABLE[r.other] ? g.tint[ni] : 0);
      const wasA = g.mat[i], wasB = g.mat[ni];
      g.set(i, r.self, selfTint);
      if (LIFE[r.self]) g.life[i] = LIFE[r.self];
      g.set(ni, r.other, otherTint);
      if (LIFE[r.other]) g.life[ni] = LIFE[r.other];
      if (stats) {
        if (wasA !== EMPTY && r.self === EMPTY) stats.destroyed++;
        if (wasB !== EMPTY && r.other === EMPTY) stats.destroyed++;
      }
    } else if (r.self !== null) {
      put(g, i, r.self, r.selfTint, stats);
    } else {
      put(g, ni, r.other, r.otherTint, stats);
    }
    if (stats) { stats.reactions++; stats.lastRule = r.name; stats.lastRuleIndex = r.index; }
    return true;
  }
  return false;
}

/** Human-readable dump — used by the gate's coverage report. */
export function describe() {
  const M = ['empty', 'wall', 'sand', 'water', 'jelly', 'oil', 'lava', 'ice', 'ash', 'crystal', 'fire', 'steam'];
  return PAIRS.map((r) => {
    const bits = [];
    if (r.self !== null) bits.push(`${M[r.a]}->${M[r.self]}`);
    if (r.other !== null) bits.push(`${M[r.b]}->${M[r.other]}`);
    const p = r.p < 1 ? ` p=${r.p}` : '';
    return `${r.name.padEnd(11)} ${M[r.a]}+${M[r.b]}${p}  ${bits.join(', ')}`;
  });
}
