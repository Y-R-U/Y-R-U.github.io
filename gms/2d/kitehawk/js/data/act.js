/**
 * P9 deliverable 3, second half — the act format. ARCHITECTURE §7.2.
 *
 * An act is the unit the story, the palettes and the unlock ladder are all
 * written against, and B, C and D each designed independently against the same
 * 5 x 20 structure. So the ONE thing this file must not do is let the three
 * drift: the act's level list, the level ids inside it and the act index a level
 * declares are three statements of the same fact, and `validateAct` refuses any
 * two of them that disagree.
 *
 * Pure: no DOM, no wall-clock, no renderer (§8.1, corecheck).
 */

import { LEVEL_V } from './level.js';

export const ACT_V = 1;

/**
 * DERIVED, not typed: DESIGN's story is 100 levels over 5 acts, so an act is
 * 100 / 5 = 20 levels, and §7.2's own example lists exactly 20. Both numbers are
 * asserted against each other at load, because "20" appearing twice is how the
 * act ranges and the level table drift apart.
 */
export const LEVELS_TOTAL = 100;
export const ACTS = 5;
export const LEVELS_PER_ACT = LEVELS_TOTAL / ACTS;
if (!Number.isInteger(LEVELS_PER_ACT)) throw new Error(`${LEVELS_TOTAL} levels do not divide into ${ACTS} acts`);

const pad2 = (n) => String(n).padStart(2, '0');

/** `a{act}-{nn}`, one-based on both. The id IS the coordinate; nothing else is. */
export const levelId = (act, index) => `a${act}-${pad2(index)}`;
export const actId = (act) => `act${act}`;

/** `'a2-13'` -> `{ act: 2, index: 13 }`, or null. Strict: `a2-3` is not an id. */
export function parseLevelId(id) {
  const m = /^a(\d)-(\d{2})$/.exec(String(id || ''));
  if (!m) return null;
  const act = Number(m[1]), index = Number(m[2]);
  if (act < 1 || act > ACTS || index < 1 || index > LEVELS_PER_ACT) return null;
  return { act, index };
}

/** 1-based position in the 100, so P11's difficulty curve has one x-axis. */
export function levelOrdinal(id) {
  const p = parseLevelId(id);
  return p ? (p.act - 1) * LEVELS_PER_ACT + p.index : null;
}

export const ACT_DEFAULTS = Object.freeze({
  name: '', palette: 'dawn-ochre', ace: '',
  unlocks: Object.freeze({ airframes: Object.freeze([]), upgrades: Object.freeze([]) }),
  gate: Object.freeze({ starsRequired: 0 }),
});

/**
 * The level list is DERIVED when the author says nothing — `a1-01 .. a1-20` is
 * the only list an act can legally have, so authoring it by hand is 20 chances
 * to typo a coordinate that is already implied by the act number.
 */
export function createAct(raw = {}) {
  const r = raw || {};
  const n = r.act ?? (parseLevelId((r.levels || [])[0]) || {}).act
            ?? Number(/^act(\d)$/.exec(String(r.id || ''))?.[1]) ?? 1;
  const act = {
    v: r.v ?? ACT_V,
    id: r.id ?? actId(n),
    act: n,
    name: r.name ?? ACT_DEFAULTS.name,
    levels: Array.isArray(r.levels) && r.levels.length
      ? r.levels.slice()
      : Array.from({ length: LEVELS_PER_ACT }, (_, i) => levelId(n, i + 1)),
    unlocks: {
      airframes: (r.unlocks || {}).airframes ? [...r.unlocks.airframes] : [],
      upgrades: (r.unlocks || {}).upgrades ? [...r.unlocks.upgrades] : [],
    },
    gate: { starsRequired: (r.gate || {}).starsRequired ?? ACT_DEFAULTS.gate.starsRequired },
    intro: r.intro ?? `story.${actId(n)}.open`,
    outro: r.outro ?? `story.${actId(n)}.close`,
    palette: r.palette ?? ACT_DEFAULTS.palette,
    ace: r.ace ?? ACT_DEFAULTS.ace,
  };
  return Object.freeze(act);
}

/**
 * `{ ok, errors }` with `errors` as `{ path, why }` — the same shape
 * `js/data/validate.js` returns, so one reporter renders both and P10's debug
 * overlay does not grow a second code path.
 */
export function validateAct(act, levelsById = null) {
  const errors = [];
  const err = (path, why) => errors.push({ path, why });
  if (!act || typeof act !== 'object') { err('act', 'is not an object'); return { ok: false, errors }; }
  if (act.v !== ACT_V) err('v', `is ${JSON.stringify(act.v)}, expected ${ACT_V}`);
  if (!Number.isInteger(act.act) || act.act < 1 || act.act > ACTS)
    err('act', `${JSON.stringify(act.act)} is not one of the ${ACTS} acts`);
  if (act.id !== actId(act.act)) err('id', `${JSON.stringify(act.id)} does not match act ${act.act} (${actId(act.act)})`);

  if (!Array.isArray(act.levels)) err('levels', `must be an array, got ${typeof act.levels}`);
  else {
    if (act.levels.length !== LEVELS_PER_ACT)
      err('levels', `has ${act.levels.length} entries; an act is ${LEVELS_TOTAL}/${ACTS} = ${LEVELS_PER_ACT} levels`);
    const seen = new Set();
    act.levels.forEach((id, i) => {
      const p = parseLevelId(id);
      if (!p) return err(`levels[${i}]`, `${JSON.stringify(id)} is not a level id — a{act}-{nn}, both one-based`);
      if (p.act !== act.act) err(`levels[${i}]`, `${id} belongs to act ${p.act}, not ${act.act}`);
      if (p.index !== i + 1) err(`levels[${i}]`, `${id} is out of order — position ${i + 1} must be index ${pad2(i + 1)}`);
      if (seen.has(id)) err(`levels[${i}]`, `${id} appears twice`);
      seen.add(id);
    });
  }

  const stars = act.gate && act.gate.starsRequired;
  if (!Number.isInteger(stars) || stars < 0) err('gate.starsRequired', `must be a non-negative integer, got ${JSON.stringify(stars)}`);
  else if (stars > LEVELS_PER_ACT * 3 * (act.act - 1))
    err('gate.starsRequired', `${stars} stars cannot be earned before act ${act.act} — only ` +
      `${LEVELS_PER_ACT * 3 * (act.act - 1)} exist in the acts that precede it`);

  /**
   * The cross-check that is the reason this function takes a second argument:
   * the level's own `act` field and the act's list are two statements of the
   * same fact, and the whole 5 x 20 structure is the seam three planning
   * documents were written across independently.
   */
  if (levelsById) {
    for (const id of act.levels || []) {
      const lvl = levelsById[id];
      if (!lvl) { err('levels', `${id} is listed but no level file was loaded for it`); continue; }
      if (lvl.v !== LEVEL_V) err(`levels.${id}.v`, `is ${JSON.stringify(lvl.v)}, expected ${LEVEL_V}`);
      if (lvl.act !== act.act) err(`levels.${id}.act`, `says act ${lvl.act}, but ${act.id} lists it`);
      const p = parseLevelId(id);
      if (p && lvl.index !== p.index) err(`levels.${id}.index`, `says ${lvl.index}, but its id says ${p.index}`);
    }
  }
  return { ok: errors.length === 0, errors };
}

/** One line per fault, matching `js/data/validate.js`'s `formatErrors`. */
export const formatActErrors = (id, errors) => errors.map((e) => `[act ${id}] ${e.path}: ${e.why}`);
