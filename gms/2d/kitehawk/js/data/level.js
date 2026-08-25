/**
 * P9 deliverable 3 — the level format. ARCHITECTURE §7.1.
 *
 * **Bands and beats, never a coordinate dump; a beat fires when the camera
 * passes `x`.** That is the whole reason 100 of these are tractable, and it is
 * what the 6 KB cap (W7) exists to enforce.
 *
 * This module is the LOADER and it was written to satisfy `js/data/validate.js`,
 * not the other way round. It normalises an authored §7.1 document into the one
 * shape the validator and the sim both read, and it fills every default from the
 * module that owns the constant rather than from a literal here.
 *
 * Pure: no DOM, no wall-clock, no renderer (§8.1, corecheck).
 *
 * ---------------------------------------------------------------------------
 * FOUR PLACES WHERE §7.1's EXAMPLE AND THE SHIPPED CONSTANTS DISAGREE.
 * Each is settled by arithmetic, not by preference. D146 ruled on the first
 * three — **§7.1's worked example is illustrative, not normative, and is wrong
 * on its own terms** — and the fourth was found by pointing the generator at it
 * (P9_NOTES REQUEST-14).
 *
 * 1. `bands`. §7.1 shows an object keyed by band id whose y-ranges are
 *    mud 0..-333, belt ..-1667, floor ..-3000, ... — but `checkBands` requires
 *    the thinnest band to be >= 700 wu (§3.3 constraint 1) and that mud is 333.
 *    **§7.1's example band table fails the project's own validator**, and D26
 *    and D126 freeze the real edges as physics-facing. So an object under
 *    `bands` is read as per-band DECORATION (flak, haze, coverage, drift) and
 *    merged onto the shipped geometry; an ARRAY under `bands` is read as
 *    geometry and passed straight to `checkBands`, which will judge it. Neither
 *    form is silently dropped.
 *
 * 2. `weather.wind` and `weather.gust` are in **wu/s, not m/s**, and the
 *    arithmetic is what says so: §7.1 authors `wind: { x: -40 }` and `gust: 26`,
 *    while `WIND_MAX_MS` is 25 — so read as SI the document's own example is
 *    rejected by its own validator. Read as wu/s they are -6.0 and 3.9 m/s,
 *    which is the same order as `k-drop`'s authored -4.5..-5.5. The evaluator is
 *    SI (`windAt` takes metres and returns m/s), so the loader converts with
 *    `M_PER_WU` — D26's rule running in the wu -> SI direction.
 *
 * 3. Beat position. §7.1 says `x`; `tools/worldgate.mjs`'s W1 fixture writes
 *    `at`. `x` wins because §7.1 is the format's authority and because "fires
 *    when the camera passes x" names it. `at` is accepted as an alias so the
 *    existing fixture keeps working, and normalises to `x`.
 *
 * 4. `player.airframe: "kitehawk-i"` is not an id `js/data/tables.js` builds,
 *    and `playerType()` falls back to the REFERENCE aeroplane silently — so the
 *    example flew the right machine under a name nothing could resolve.
 *    `validate.js` refuses it by name now, and the default here is
 *    `AIRFRAMES[0].id`.
 */

import { M_PER_WU } from '../core/math.js';
import { BANDS, BAND_IDS, CEILING_WU, GROUND_WU, CONCORD_LINE_WU } from '../core/bands.js';
import { CEILING_M, TIME_OF_DAY, WIND_CALM, signatureAltitudes } from '../sim/world.js';
import { ENEMY_BY_ID } from '../sim/entities.js';
import { TERRAIN_PROFILES } from '../sim/terrain.js';
import { AIRFRAMES } from './tables.js';

export const LEVEL_V = 1;

/* ------------------------------------------------------ the enemy codebook */
/**
 * THE ENEMY CODEBOOK — the level table's spelling of the roster, and there is
 * exactly ONE copy of it, here, in the level format's own module (D72, D146).
 *
 * D146: **the shipped roster is the authority.** DESIGN §8.3's codebook was
 * authored by a planning agent before the roster settled and has never been
 * executed by anything; `js/sim/entities.js` builds eight aircraft and every
 * gate from P5 and P6 rests on them. Where a planning document and shipped,
 * tested code disagree about what exists, the code wins.
 *
 * The letters are DERIVED, not typed: each is its type's own initial, and the
 * module refuses to load if two collide. That is the point — a ninth aeroplane
 * whose initial is taken must be given a code deliberately rather than silently
 * aliasing an existing one, which is the never-firing beat again (validate.js
 * checks `beats[].spawn` against the roster, but a beat that resolved to the
 * WRONG type would validate clean and play wrong).
 *
 *   k kestrel   w wasp   s shrike   d drover
 *   o ox        m marlin n nightjar a anvil
 *
 * Six of the eight agree with DESIGN §5.1's own codes. §5.1 spells nightjar `N`
 * and has no anvil at all; lower case throughout is the rule, because §5.1's
 * upper case marked the things that are NOT aeroplanes.
 */
export const ENEMY_CODE = Object.freeze(Object.fromEntries(
  Object.keys(ENEMY_BY_ID).map((id) => [id[0], id])));

if (Object.keys(ENEMY_CODE).length !== Object.keys(ENEMY_BY_ID).length)
  throw new Error('level.js: two enemy types share an initial — the codebook must be given an ' +
                  'explicit letter rather than silently aliasing one type onto another');

/**
 * The DESIGN codes that map onto NO entity type, and what each one is instead.
 * They are listed rather than dropped because DESIGN's level table uses all of
 * them and P11 has to write 96 more levels against it: a code that quietly
 * resolves to nothing is how a level ends up with an objective that cannot be
 * completed.
 *
 * `Z` is the only one with a home today: a zeppelin is boss-class (§4.6.2), so
 * it is authored as a `boss` beat — which is exactly what §7.1's own example
 * does with `zeppelin-l30` — and a boss beat is handed to the mode shell rather
 * than spawned. The other five need entity types that do not exist.
 */
export const CODES_WITHOUT_TYPE = Object.freeze({
  Z: 'boss beat — zeppelin, §4.6.2, handed to the mode shell (P10)',
  B: 'no entity type: observation balloon (§5.1)',
  F: 'no entity type: flak battery, ground (§5.1, §3.5)',
  g: 'no entity type: MG nest, ground (§5.1, §3.5)',
  T: 'no entity type: armoured train / gunboat (§5.1)',
  L: 'no entity type: searchlight (§5.1)',
  X: 'no entity type: fuel dump / hangar / factory (§5.1)',
});

/** `k` -> `kestrel`, or null. Never guesses. */
export const typeForCode = (code) => ENEMY_CODE[code] || null;

/** `kestrel` -> `k`. The inverse, so a generator never spells a code by hand. */
export const codeForType = (id) => {
  const hit = Object.entries(ENEMY_CODE).find(([, v]) => v === id);
  return hit ? hit[0] : null;
};

/**
 * W7's cap. A level file over this has stopped being bands and beats and has
 * started being a coordinate dump, which is the one thing §7.1 forbids by name.
 * Measured on `serializeLevel`, which emits the AUTHORED form — see below.
 */
export const LEVEL_MAX_BYTES = 6 * 1024;

/** Per-band decoration a level may set. Geometry is NOT in this list (D26/D126). */
export const BAND_MOD_KEYS = Object.freeze(['flak', 'haze', 'coverage', 'drift']);

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isArr = Array.isArray;

/* ------------------------------------------------------------------ wind --- */

/**
 * Authored wind -> the SI altitude table `windAt` reads.
 *
 *   an array           already a table, `[[altM, ms], ...]` — passed through so
 *                      a shear level (§4.6.1) can author the curve it needs
 *   a number or {x}    a CONSTANT wind in wu/s -> two points, sea level and the
 *                      playable ceiling, both `x * M_PER_WU` m/s
 *
 * Two points rather than one: `windAt` interpolates between knots and returns
 * the first knot's value below it, so a one-point table is a constant — legal,
 * but `windProfileErrors` rejects it, and rightly, because the shear a crate
 * level is built on would then quietly stop existing (W5f).
 */
export function windTableFrom(w) {
  if (isArr(w)) return w;
  const wuS = isNum(w) ? w : (w && isNum(w.x) ? w.x : null);
  if (wuS === null) return WIND_CALM;
  const ms = +(wuS * M_PER_WU).toFixed(6);
  return [[0, ms], [CEILING_M, ms]];
}

/* ----------------------------------------------------------------- bands --- */

function bandMods(raw) {
  const out = {};
  if (!raw || isArr(raw)) return out;
  for (const id of BAND_IDS) {
    const src = raw[id];
    if (!src || typeof src !== 'object') continue;
    const mod = {};
    for (const k of BAND_MOD_KEYS) if (src[k] !== undefined) mod[k] = src[k];
    if (Object.keys(mod).length) out[id] = mod;
  }
  return out;
}

/* ----------------------------------------------------------------- beats --- */

/**
 * Sorted by `x`, ascending, and the ORDER IS LOAD-BEARING. `js/sim/spawner.js`
 * walks one forward cursor as the camera advances (W8: no allocation after
 * warm-up), so a beat behind the cursor never fires at all. The loader sorts;
 * `validate.js` still REFUSES an unsorted authored list, because sorting on load
 * would turn a real authoring mistake into a beat that fires at a different
 * moment than the author read on the page.
 */
function normaliseBeats(list) {
  if (!isArr(list)) return [];
  const beats = list.map((b, i) => {
    const x = b && (b.x !== undefined ? b.x : b.at);
    return { ...b, x: isNum(x) ? x : x, i };
  });
  beats.sort((a, b) => (a.x - b.x) || (a.i - b.i));
  return beats.map(({ i, at, ...rest }) => rest);
}

/**
 * The out-of-order fault, CARRIED ON THE LOADED LEVEL.
 *
 * The sort above used to be the whole story and `validate.js` refused an
 * unsorted list — but only if you validated the AUTHORED document. Every real
 * consumer validates what the loader returned (`tools/pages/level.html` did, and
 * P10's scene machine will), and by then the array is sorted, so W1e's fault was
 * repaired before anything could see it. That is the silent-repair shape this
 * file's own header condemns, one level up.
 *
 * So the loader still sorts — the spawner's forward cursor needs it — and it
 * also records that it had to, and the validator fails on the record.
 */
function beatOrderFault(list) {
  if (!isArr(list)) return null;
  for (let i = 1; i < list.length; i++) {
    const x = list[i] && (list[i].x !== undefined ? list[i].x : list[i].at);
    const p = list[i - 1] && (list[i - 1].x !== undefined ? list[i - 1].x : list[i - 1].at);
    if (isNum(x) && isNum(p) && x < p) return { i, x, prevX: p };
  }
  return null;
}

export const beatsSorted = (list) =>
  !isArr(list) || list.every((b, i, a) => i === 0 || (a[i - 1].x ?? a[i - 1].at) <= (b.x ?? b.at));

/* ------------------------------------------------------------ the loader --- */

/**
 * Every default comes from the module that owns the constant. `column` is
 * `js/core/bands.js`'s, including the Concord Line — §7.1 writes `-26667` and
 * `CONCORD_LINE_WU` is -26,666.67, so the literal is a rounded copy and this is
 * the fifth constant in P9 to be handed back to its owner (REQUEST-5, -8).
 */
export const DEFAULT_TERRAIN_PROFILE = 'trenchline';

export const LEVEL_DEFAULTS = Object.freeze({
  act: 1, index: 1, name: '', length: 42000,
  terrain: Object.freeze({ profile: DEFAULT_TERRAIN_PROFILE, ...TERRAIN_PROFILES[DEFAULT_TERRAIN_PROFILE] }),
  /**
   * `AIRFRAMES[0]` is the act-1 aeroplane and the reference the whole flight
   * model is fitted to. §7.1's example writes `"kitehawk-i"`, which is not an id
   * `js/data/tables.js` builds — and `playerType()` falls back to the reference
   * for an unknown id **silently**, so the example flew the right aeroplane
   * under the wrong name and nothing could tell. `validate.js` now refuses an
   * unknown airframe by name (W1g).
   */
  player: Object.freeze({ start: Object.freeze({ x: 600, y: -1200 }), airframe: AIRFRAMES[0].id, fuel: 1, ammo: 500 }),
  visibility: 1, timeOfDay: 'day', gustWuS: 0,
  music: 'patrol', ambience: 'front-line',
});

/**
 * A named terrain profile brings its OWN parameters. Merging the authored block
 * onto a fixed default meant `terrain: { profile: 'pass_narrow' }` — DESIGN
 * §8.10's own example spelling — loaded as `pass_narrow` carrying the trench
 * line's amplitude and wavelength: the right name over the wrong geometry, and
 * `terrainProfileErrors` could not see it because IT resolves the base
 * correctly and only the loaded object was wrong.
 */
function terrainFrom(raw) {
  const t = raw || {};
  const name = t.profile ?? DEFAULT_TERRAIN_PROFILE;
  const base = TERRAIN_PROFILES[name] || TERRAIN_PROFILES[DEFAULT_TERRAIN_PROFILE];
  return { profile: name, ...base, ...t };
}

export function createLevel(raw = {}) {
  const r = raw || {};
  const weather = r.weather || {};
  const windSrc = r.wind !== undefined ? r.wind : weather.wind;
  const gustWuS = weather.gust !== undefined ? weather.gust : LEVEL_DEFAULTS.gustWuS;

  const level = {
    v: r.v ?? LEVEL_V,
    id: r.id,
    act: r.act ?? LEVEL_DEFAULTS.act,
    index: r.index ?? LEVEL_DEFAULTS.index,
    name: r.name ?? LEVEL_DEFAULTS.name,
    seed: r.seed ?? r.id,
    length: r.length ?? LEVEL_DEFAULTS.length,

    column: {
      ground: r.column?.ground ?? GROUND_WU,
      ceiling: r.column?.ceiling ?? CEILING_WU,
      concordLine: r.column?.concordLine ?? CONCORD_LINE_WU,
    },

    // Geometry only if the author really supplied an array; see the header.
    ...(isArr(r.bands) ? { bands: r.bands } : {}),
    bandMods: bandMods(r.bands),

    terrain: terrainFrom(r.terrain),
    player: {
      ...LEVEL_DEFAULTS.player, ...(r.player || {}),
      start: { ...LEVEL_DEFAULTS.player.start, ...((r.player || {}).start || {}) },
    },

    // The SI table the one evaluator reads (W5), plus what was authored.
    wind: windTableFrom(windSrc),
    weather: {
      windWuS: isArr(windSrc) ? null : (isNum(windSrc) ? windSrc : (windSrc && windSrc.x) ?? 0),
      gustWuS,
      gustMs: +(gustWuS * M_PER_WU).toFixed(6),
      visibility: weather.visibility ?? LEVEL_DEFAULTS.visibility,
      timeOfDay: weather.timeOfDay ?? LEVEL_DEFAULTS.timeOfDay,
    },

    beats: normaliseBeats(r.beats),
    beatOrderFault: beatOrderFault(r.beats),
    spawns: isArr(r.spawns) ? r.spawns.slice() : [],
    objectives: isArr(r.objectives) ? r.objectives.slice() : [],
    stars: isArr(r.stars) ? r.stars.slice() : [],
    script: r.script ?? r.lines ?? [],

    /**
     * D126's structural rule, satisfied BY CONSTRUCTION when the author says
     * nothing. `signatureAltitudes()` is the required set — one instance near
     * EACH boundary of every band with two neighbours, because one in the middle
     * puts Belt's and Floor's 1,150 wu apart against a 425 wu landscape bound.
     * An author who overrides gets checked against the same set by
     * `validate.js`, which is where the rule is enforced rather than noted.
     */
    signatures: isArr(r.signatures)
      ? r.signatures.slice()
      : signatureAltitudes().map((a) => ({ band: a.band, y: a.y, kind: 'landmark' })),

    /**
     * ART §4: **landmarks are never tiled.** A chateau, a wrecked bridge, a
     * burning factory is ONE instance at an authored X, and that — not the
     * connective strips — is the real anti-repetition mechanism. So the level
     * carries `{ x, kind }` and nothing else: the Y comes from
     * `terrain.yAt(x)`, because a landmark stands ON the silhouette and a
     * second copy of the ground height in the level file would drift from it
     * the first time a terrain profile changed.
     *
     * Deliberately NOT the same list as `signatures`. A signature is an
     * altitude cue near a band boundary (D126); a landmark is a place on the
     * ground. They were nearly merged and the merge is wrong: one is indexed by
     * band and the other by x.
     */
    landmarks: isArr(r.landmarks) ? r.landmarks.slice() : [],

    reward: r.reward ?? { crates: 0, scrip: 0 },
    music: r.music ?? LEVEL_DEFAULTS.music,
    ambience: r.ambience ?? LEVEL_DEFAULTS.ambience,
  };
  return deepFreeze(level);
}

function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const k of Object.keys(o)) deepFreeze(o[k]);
  }
  return o;
}

/* ------------------------------------------------- conditions for the sim -- */

/**
 * The level's `createConditions` argument. It exists so no caller assembles that
 * object itself: the wind table, the gusts and the visibility are the level's,
 * and W5's whole point is that there is one place they come from.
 */
export const conditionsDef = (level) => ({
  wind: level.wind,
  visibility: level.weather.visibility,
  timeOfDay: level.weather.timeOfDay,
  gustPhase: level.weather.gustPhase ?? 0,
  gustSeed: level.weather.gustSeed ?? 1337,
});

/* ------------------------------------------------------- (de)serialisation - */

const KEY_ORDER = Object.freeze([
  'v', 'id', 'act', 'index', 'name', 'seed', 'length', 'column', 'bands',
  'terrain', 'weather', 'player', 'beats', 'spawns', 'objectives', 'stars',
  'script', 'signatures', 'landmarks', 'reward', 'music', 'ambience',
]);

/**
 * The canonical AUTHORED form — the bytes that go on disk and the bytes W7's
 * 6 KB cap is measured against.
 *
 * It emits only what differs from the default, which is what makes the round
 * trip meaningful: `createLevel(JSON.parse(serializeLevel(L)))` is deep-equal to
 * `L` (W6), while the file stays the small, readable, hand-editable thing §7.1
 * promises. A serializer that wrote the fully-defaulted object would round-trip
 * just as well and would tell you nothing about whether the format is still
 * bands and beats.
 */
export function serializeLevel(level) {
  const d = createLevel({ id: level.id });
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const out = {};
  const put = (k, v, def) => { if (def === undefined || !same(v, def)) out[k] = v; };

  put('v', level.v, LEVEL_V);
  out.id = level.id;
  put('act', level.act, d.act);
  put('index', level.index, d.index);
  put('name', level.name, d.name);
  put('seed', level.seed, level.id);
  put('length', level.length, d.length);
  put('column', level.column, d.column);
  if (level.bands) out.bands = level.bands;
  else if (Object.keys(level.bandMods).length) out.bands = level.bandMods;
  put('terrain', level.terrain, d.terrain);

  const w = {};
  if (level.weather.windWuS === null) w.wind = level.wind;
  else if (level.weather.windWuS !== 0) w.wind = { x: level.weather.windWuS, y: 0 };
  if (level.weather.gustWuS !== d.weather.gustWuS) w.gust = level.weather.gustWuS;
  if (level.weather.visibility !== d.weather.visibility) w.visibility = level.weather.visibility;
  if (level.weather.timeOfDay !== d.weather.timeOfDay) w.timeOfDay = level.weather.timeOfDay;
  if (Object.keys(w).length) out.weather = w;

  put('player', level.player, d.player);
  if (level.beats.length) out.beats = level.beats;
  if (level.spawns.length) out.spawns = level.spawns;
  if (level.objectives.length) out.objectives = level.objectives;
  if (level.stars.length) out.stars = level.stars;
  if ((isArr(level.script) ? level.script.length : Object.keys(level.script).length)) out.script = level.script;
  put('signatures', level.signatures, d.signatures);
  if (level.landmarks.length) out.landmarks = level.landmarks;
  put('reward', level.reward, d.reward);
  put('music', level.music, d.music);
  put('ambience', level.ambience, d.ambience);

  const ordered = {};
  for (const k of KEY_ORDER) if (k in out) ordered[k] = out[k];
  return JSON.stringify(ordered, null, 2) + '\n';
}

/** Bytes on disk, which is what W7 caps. */
export const levelBytes = (level) => Buffer.byteLength
  ? Buffer.byteLength(serializeLevel(level), 'utf8')
  : new TextEncoder().encode(serializeLevel(level)).length;

/** `{ ok, bytes, cap }` — reported by the generator for all 100 (W7). */
export function sizeReport(level) {
  const bytes = levelBytes(level);
  return { id: level.id, bytes, cap: LEVEL_MAX_BYTES, ok: bytes <= LEVEL_MAX_BYTES };
}

export { BANDS, BAND_IDS, TIME_OF_DAY };
