/**
 * P9 deliverable 1 — the level validator. **A malformed level fails LOUDLY, in
 * the console and in the debug overlay, never silently.**
 *
 * Every rule here is DELEGATED to whoever already owns it. That is not tidiness:
 * D131 caught `js/ui/hud.js` keeping its own copy of a window, so the
 * break-switch went red in the harness and green in the shipped game, and a
 * validator with its own copy of a rule is that defect with a longer fuse — it
 * would certify levels against a rule the game no longer has.
 *
 *   band geometry      js/data/tables.js  checkBands()        (ARCHITECTURE §3.3)
 *   the ceiling        js/core/bands.js   CEILING_WU          (D28)
 *   the wind table     js/sim/world.js    windProfileErrors()
 *   signature spacing  js/sim/world.js    signatureAltitudes()
 *   the enemy roster   js/sim/entities.js ENEMY_BY_ID
 *   the airframes      js/data/tables.js  AIRFRAMES
 *   terrain limits     js/sim/terrain.js  terrainProfileErrors()
 *   the radio cap      js/ui/layout.js    CARD_MAX_CHARS
 *
 * Pure: no DOM, no wall-clock, no renderer, and nothing from `js/ui/` (§8.1).
 * The radio cap used to be read out of `js/ui/layout.js` — safe, since that
 * module is pure, but the wrong DIRECTION. It now lives in `js/core/content.js`
 * and `layout.js` reads it from there too, so the validator refuses exactly the
 * line the renderer refuses to draw (P9 REQUEST-8, accepted).
 */

import { BANDS, CEILING_WU, GROUND_WU } from '../core/bands.js';
import { checkBands, AIRFRAMES } from './tables.js';
import { CARD_MAX_CHARS } from '../core/content.js';
import { SIGNATURE_OFFSET_WU, SIGNATURE_SPAN_WU, signatureAltitudes, windProfileErrors } from '../sim/world.js';
import { LEVEL_V } from './level.js';
import { ENEMY_BY_ID } from '../sim/entities.js';
import { terrainProfileErrors } from '../sim/terrain.js';

/**
 * The run summary's stat names (ARCHITECTURE §8.1), and the ONLY names a star
 * condition may use.
 *
 * P9 deliverable 2: **star conditions are structured, never expression strings.**
 * An expression string needs `eval` to evaluate, `eval` needs a browser-ish
 * global, and a star that cannot be evaluated headlessly cannot be checked by
 * P11's balance gate over 100 levels — which is the phase that decides whether
 * the curve works. So a condition is `{ stat, op, value }` and nothing else.
 *
 * `tools/worldgate.mjs` diffs this list against a REAL `sim.mjs` summary on
 * every run, so a stat renamed in the sim fails loudly here rather than turning
 * every star that used it into a silent never-awarded.
 */
export const RUN_STATS = Object.freeze([
  'time', 'damageTaken', 'deaths', 'kills', 'cratesCaught', 'cratesMissed',
  'shotsFired', 'hits', 'accuracy', 'ammoLeft', 'fuelLeft', 'peakG', 'stalls',
  'blackouts', 'difficulty', 'completed',
  ...BANDS.map((b) => `timeInBand.${b.id}`),
]);

/** Non-numeric summary fields a condition may not compare with `<`/`>`. */
const BOOL_STATS = new Set(['completed']);
export const STAR_OPS = Object.freeze(['>=', '<=', '>', '<', '==', '!=']);

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * Evaluate one structured star condition against a run summary. Exported
 * because P10's debrief and P11's balance gate must use the SAME evaluator, for
 * the reason W5 gives about wind.
 */
export function evalCondition(cond, summary) {
  const path = String(cond.stat).split('.');
  let v = summary;
  for (const k of path) v = v == null ? undefined : v[k];
  switch (cond.op) {
    case '>=': return v >= cond.value;
    case '<=': return v <= cond.value;
    case '>': return v > cond.value;
    case '<': return v < cond.value;
    case '==': return v === cond.value;
    case '!=': return v !== cond.value;
    default: return false;
  }
}

/* ------------------------------------------------------------------ rules -- */

function checkPlacements(level, err) {
  /**
   * D28: the playable ceiling is a hard edge, not a suggestion — the Concord
   * Line at -26,667 wu is *seen and never reached*, so anything the player can
   * be sent to must live inside [CEILING_WU, GROUND_WU]. +y is DOWN, so "above
   * the ceiling" means MORE NEGATIVE than CEILING_WU.
   */
  const groups = [['beats', level.beats], ['spawns', level.spawns], ['objectives', level.objectives]];
  for (const [name, list] of groups) {
    if (list === undefined) continue;
    if (!Array.isArray(list)) { err(name, `must be an array, got ${typeof list}`); continue; }
    list.forEach((it, i) => {
      if (!it || typeof it !== 'object') return err(`${name}[${i}]`, 'must be an object');
      if (it.y === undefined) return;
      if (!isNum(it.y)) return err(`${name}[${i}].y`, `must be a finite number, got ${JSON.stringify(it.y)}`);
      if (it.y < CEILING_WU)
        err(`${name}[${i}].y`, `${it.y} wu is ABOVE the ${CEILING_WU} wu playable ceiling (D28) — nothing there is reachable`);
      if (it.y > GROUND_WU)
        err(`${name}[${i}].y`, `${it.y} wu is below the ground (${GROUND_WU} wu)`);
    });
  }
}

/**
 * The beat ordering, and it is load-bearing rather than tidy.
 *
 * §7.1: *"a beat fires when the camera passes `x`"*. `js/sim/spawner.js` walks
 * ONE forward cursor as the camera advances — that is what W8's "no allocation
 * after warm-up" buys — so a beat sitting behind the cursor never fires at all.
 * A silently-never-fired beat is the level-format equivalent of the
 * silently-never-awarded star `RUN_STATS` exists to prevent.
 *
 * `js/data/level.js` sorts on load, and it still fails here, deliberately: an
 * out-of-order beat is an authoring mistake, and a loader that quietly repairs
 * it makes the level fire at a different moment from the one the author read on
 * the page. `at` is accepted as an alias for `x` (level.js normalises it).
 */
const beatX = (b) => (b && b.x !== undefined ? b.x : b && b.at);

function checkBeats(level, err) {
  /**
   * `js/data/level.js` sorts on load AND records that it had to. The record is
   * what makes this reachable: by the time a page or a mode has a level object,
   * the array is already in order, so checking the array alone certified every
   * out-of-order level that had been through the loader.
   */
  const f = level.beatOrderFault;
  if (f)
    err(`beats[${f.i}].x`, `${f.x} was authored behind beats[${f.i - 1}] at ${f.prevX}. Beats must ` +
      `ascend: the spawner walks one forward cursor, so a beat behind it NEVER FIRES (W8). The ` +
      `loader sorted them to keep the spawner correct, and a quiet repair would make the level fire ` +
      `at a different moment from the one the author read on the page`);
  const beats = level.beats;
  if (beats === undefined) return;
  if (!Array.isArray(beats)) return;                 // checkPlacements already said so
  let prev = -Infinity;
  beats.forEach((b, i) => {
    const x = beatX(b);
    if (x === undefined) return err(`beats[${i}].x`, 'has no x — a beat fires when the camera passes x (§7.1)');
    if (!isNum(x)) return err(`beats[${i}].x`, `must be a finite number, got ${JSON.stringify(x)}`);
    if (x < prev)
      err(`beats[${i}].x`, `${x} is behind beats[${i - 1}] at ${prev}. Beats must ascend: the spawner ` +
        `walks one forward cursor, so a beat behind it NEVER FIRES (W8)`);
    prev = Math.max(prev, x);
    if (isNum(level.length) && (x < 0 || x > level.length))
      err(`beats[${i}].x`, `${x} is outside the level, which is 0..${level.length} wu`);
    /**
     * A typo'd enemy id is the never-firing beat again wearing a different coat:
     * the beat fires, the spawner finds no type, and the wave silently does not
     * happen. Checked against the roster `js/sim/entities.js` actually builds,
     * never a list typed a second time here.
     */
    if (b.spawn !== undefined && !ENEMY_BY_ID[b.spawn])
      err(`beats[${i}].spawn`, `${JSON.stringify(b.spawn)} is not in the enemy roster. Legal: ` +
        `${Object.keys(ENEMY_BY_ID).join(', ')}`);
    if (b.band !== undefined && !BANDS.some((bd) => bd.id === b.band))
      err(`beats[${i}].band`, `${JSON.stringify(b.band)} is not a band. Legal: ${BANDS.map((bd) => bd.id).join(', ')}`);
  });
}

/**
 * The player's airframe, and it is the silent-fallback shape again.
 * `entities.js`'s `playerType(id)` does `AIRFRAME_BY_ID[id] || REFERENCE`, so a
 * level naming an aeroplane the game does not build flies the REFERENCE
 * aeroplane under the wrong name and nothing anywhere says so — the level's
 * stars, its difficulty and P11's whole curve would then be measured against an
 * airframe the level did not ask for. §7.1's own example names `kitehawk-i`,
 * which is not one of the five `js/data/tables.js` builds.
 */
function checkPlayer(level, err) {
  const p = level.player;
  if (p === undefined) return;
  if (!p || typeof p !== 'object') return err('player', `must be an object, got ${typeof p}`);
  if (p.airframe !== undefined && !AIRFRAMES.some((a) => a.id === p.airframe))
    err('player.airframe', `${JSON.stringify(p.airframe)} is not an airframe the game builds. ` +
      `Legal: ${AIRFRAMES.map((a) => a.id).join(', ')} — and playerType() falls back to the ` +
      `reference aeroplane SILENTLY, so an unknown id flies the wrong machine under the right name`);
}

function checkScript(level, err) {
  const lines = level.script || level.lines || [];
  const arr = Array.isArray(lines) ? lines : Object.entries(lines).map(([id, l]) => ({ id, ...l }));
  arr.forEach((l, i) => {
    const id = l.id ?? i;
    if (!l || typeof l.text !== 'string') return err(`script[${id}]`, 'has no text');
    if (l.kind === 'radio' && l.text.length > CARD_MAX_CHARS)
      err(`script[${id}]`, `radio line is ${l.text.length} chars, cap is ${CARD_MAX_CHARS} — it would wrap and eat two lines of sky`);
  });
}

/**
 * ART §4's landmarks. `x` only — the Y is the terrain's, resolved at draw time.
 * A landmark outside the level is a painted asset nobody will ever see, which
 * is the never-firing beat wearing a third coat.
 */
function checkLandmarks(level, err) {
  const list = level.landmarks;
  if (list === undefined) return;
  if (!Array.isArray(list)) return err('landmarks', `must be an array, got ${typeof list}`);
  list.forEach((l, i) => {
    if (!l || typeof l !== 'object') return err(`landmarks[${i}]`, 'must be { x, kind }');
    if (!isNum(l.x)) return err(`landmarks[${i}].x`, `must be a finite number, got ${JSON.stringify(l.x)}`);
    if (isNum(level.length) && (l.x < 0 || l.x > level.length))
      err(`landmarks[${i}].x`, `${l.x} is outside the level (0..${level.length} wu) — a landmark ` +
        `nobody flies past is a painted asset that never appears`);
    if (typeof l.kind !== 'string' || !l.kind)
      err(`landmarks[${i}].kind`, 'must be a non-empty string — the rig js/gfx/rigs/ will draw');
  });
}

function checkStars(level, err) {
  const stars = level.stars;
  if (stars === undefined) return;
  if (!Array.isArray(stars)) return err('stars', `must be an array of conditions, got ${typeof stars}`);
  stars.forEach((c, i) => {
    if (typeof c === 'string')
      return err(`stars[${i}]`, `is an expression string ${JSON.stringify(c)}. Star conditions are STRUCTURED — ` +
        `{ stat, op, value } — so they evaluate headlessly and without eval (P9 deliverable 2)`);
    if (!c || typeof c !== 'object') return err(`stars[${i}]`, 'must be { stat, op, value }');
    if (!RUN_STATS.includes(c.stat))
      err(`stars[${i}].stat`, `${JSON.stringify(c.stat)} is not a run-summary stat. Legal: ${RUN_STATS.join(', ')}`);
    if (!STAR_OPS.includes(c.op))
      err(`stars[${i}].op`, `${JSON.stringify(c.op)} is not one of ${STAR_OPS.join(' ')}`);
    if (BOOL_STATS.has(c.stat) && (c.op === '<' || c.op === '>' || c.op === '<=' || c.op === '>='))
      err(`stars[${i}]`, `${c.stat} is a boolean; ${c.op} on it is always meaningless`);
    else if (!BOOL_STATS.has(c.stat) && !isNum(c.value))
      err(`stars[${i}].value`, `must be a finite number, got ${JSON.stringify(c.value)}`);
  });
}

/**
 * The band signatures, and this is the structural rule P9 derived rather than
 * inherited (D126, P9_NOTES §1).
 *
 * A band with two neighbours needs a signature instance near EACH of its
 * boundaries, not one in the middle: one central instance per band puts Belt's
 * and Floor's 1,150 wu apart against a 425 wu landscape bound, so the two bands
 * are never on screen together and the boundary stops reading as a transition
 * (§4.4.2 P4b). The tolerance is `SIGNATURE_OFFSET_WU` either side of the ideal
 * altitude, which keeps the worst pair at `SIGNATURE_SPAN_WU x 2` — still
 * inside portrait's 865 wu bound, and it is landscape that binds.
 */
function checkSignatures(level, err) {
  const sig = level.signatures;
  if (sig === undefined) return;                       // optional until P11 fills them
  if (!Array.isArray(sig)) return err('signatures', `must be an array, got ${typeof sig}`);
  for (const s of sig) {
    if (!s || !isNum(s.y)) { err('signatures', `every entry needs a finite y, got ${JSON.stringify(s)}`); continue; }
    if (!BANDS.some((b) => b.id === s.band)) err('signatures', `unknown band ${JSON.stringify(s.band)}`);
  }
  const want = signatureAltitudes();
  for (const w of want) {
    const near = sig.filter((s) => s.band === w.band && Math.abs(s.y - w.y) <= SIGNATURE_OFFSET_WU);
    if (!near.length)
      err('signatures', `${w.band} has no signature within ${SIGNATURE_OFFSET_WU} wu of ${w.y} wu ` +
        `(its ${w.edge} wu boundary). A band with two neighbours needs one near EACH boundary — ` +
        `one in the middle puts adjacent signatures up to 1,150 wu apart against a ${SIGNATURE_SPAN_WU + 25} wu landscape bound (D126)`);
  }
}

/* --------------------------------------------------------------- the API --- */

/**
 * Returns `{ ok, errors }`. `errors` are `{ path, why }`; nothing throws,
 * because a level editor has to be able to show you every fault at once rather
 * than the first one.
 */
export function validateLevel(level) {
  const errors = [];
  const err = (path, why) => errors.push({ path, why });

  if (!level || typeof level !== 'object') {
    err('level', 'is not an object');
    return { ok: false, errors };
  }
  if (!level.id) err('id', 'is required');
  if (level.v !== undefined && level.v !== LEVEL_V)
    err('v', `is ${JSON.stringify(level.v)}, expected ${LEVEL_V} — a format bump needs a migration, not a silent load`);

  for (const f of checkBands(level.bands || BANDS)) err('bands', f);
  for (const f of windProfileErrors(level.wind || [[0, 0], [1500, 0]])) err('wind', f);
  checkPlacements(level, err);
  checkBeats(level, err);
  for (const f of terrainProfileErrors(level.terrain || {})) err('terrain', f);
  checkPlayer(level, err);
  checkScript(level, err);
  checkStars(level, err);
  checkSignatures(level, err);
  checkLandmarks(level, err);

  return { ok: errors.length === 0, errors };
}

/** One line per fault, the format the console and the debug overlay both use. */
export const formatErrors = (id, errors) =>
  errors.map((e) => `[level ${id}] ${e.path}: ${e.why}`);

/**
 * The loud half. `report` is called for every fault (P10 wires it to the debug
 * overlay); the console gets them regardless, because "fails the load in the
 * console" is the contract and a validator you have to ask is not one.
 */
export function loadLevel(level, report) {
  const { ok, errors } = validateLevel(level);
  const lines = formatErrors(level && level.id ? level.id : '?', errors);
  for (const line of lines) {
    // eslint-disable-next-line no-console
    console.error(line);
    if (report) report(line);
  }
  return { ok, errors, lines, level: ok ? level : null };
}
