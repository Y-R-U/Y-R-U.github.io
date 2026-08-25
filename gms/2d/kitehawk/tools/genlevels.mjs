#!/usr/bin/env node
/**
 * P9 deliverable 6 — `genlevels.mjs`. **The table is the source and the JSON is
 * generated from it**, so a designer edits one place.
 *
 *   node tools/genlevels.mjs             the derivation, per level, to stdout
 *   node tools/genlevels.mjs --write     write data/levels/*.json + data/acts/*.json
 *   node tools/genlevels.mjs --check     regenerate and diff against disk (W6)
 *   node tools/genlevels.mjs --json a1-12   one level's document
 *
 * ---------------------------------------------------------------------------
 * THE TABLE
 *
 * `TABLE` below is DESIGN §8.4/§8.5 transcribed cell for cell — `#`, `Obj`,
 * `Enemies`, `New / twist`, `Sky, wind`, `Cr`, `t(s)`. Nothing in a row is
 * rewritten into another vocabulary on the way in; the parsing happens here, so
 * a designer who edits DESIGN's table can paste the row.
 *
 * TWO COLUMNS §8's TABLE DOES NOT HAVE, and the brief asks for them by name:
 *
 *   `name`   §7.1's format carries a level name and DESIGN's table has no name
 *            column. Four names had to come from somewhere and they came from
 *            me; they are the only prose in this file and P12 owns them.
 *   `star`   the third star, where the row's own columns do not determine one.
 *            Two of the three stars are derived from the table (below); a level
 *            with neither enemies nor crates — a1-04, the breather — has no
 *            third column to derive from, so the row states it. It is a
 *            designer number in a designer table, which is the right place for
 *            it, but it is not derived and is not claimed to be.
 *
 * ---------------------------------------------------------------------------
 * THE CODEBOOK IS `js/data/level.js`'s, NOT THIS FILE'S (D72, D146)
 *
 * `k` -> kestrel and so on lives in the level format's own module and there is
 * exactly one copy of it. D146 settled the vocabulary: the shipped roster is the
 * authority, DESIGN §8.3's letters `g`/`B`/`F`/`Z` map onto no entity type, and
 * this generator REFUSES a row that uses one rather than quietly dropping it —
 * except `Z`, which is boss-class (§4.6.2) and becomes a `boss` beat exactly as
 * §7.1's own example does.
 *
 * ---------------------------------------------------------------------------
 * EVERY GEOMETRIC NUMBER IS DERIVED. The derivations, in one place:
 *
 *   length          t(s) x CRUISE_WU_S            DESIGN's own duration column at
 *                                                 D126's cruise. 42 m/s = 280 wu/s.
 *   player start    the act's HOME BAND centre    §7.1's own -1200 wu default is
 *                                                 exactly Belt's centre, which is
 *                                                 act 1's home band.
 *   first beat      start.x + FRAME_REACH_WU      the first contact arrives after
 *                                                 one clear frame (888 wu, D121).
 *   last beat       length - SPAWN_LEAD_WU        a beat any later spawns its
 *                                                 group past the end of the level.
 *   group spacing   the span, divided evenly      no free parameter left.
 *   spawn band      home band, or one band ABOVE
 *                   if the type has TURRETS       a turret is what a transport or
 *                                                 a bomber has; they cruise above
 *                                                 the fight, fighters are in it.
 *                                                 Derived from the shipped roster's
 *                                                 own shape, not from a list here.
 *   enemy k         linear across the act, from   DESIGN §8.2's `curve` column
 *                   §8.2's own k range            (act 1: 0.15 at L1 -> 0.45 at
 *                                                 L20). A row's own `@k` wins.
 *   crate altitude  the crate SOURCE's band       an Ox in the level drops from its
 *                   centre, or the playable       own altitude (§5.1); a level with
 *                   ceiling if there is no Ox     no Ox is fed from the Concord
 *                                                 Line, and `js/sim/crates.js` puts
 *                                                 that canopy at 1,500 m — "the
 *                                                 canopy is ALREADY OPEN when the
 *                                                 crate enters reachable sky".
 *   crate deadline  the last crate must reach     Δalt / terminal, converted to wu
 *                   the player before the level   of level at cruise. Reported per
 *                   ends                          level; it is a real constraint
 *                                                 and it binds on a1-12.
 *   reward.scrip    cr x CRATE_EV x ACT_MULT      §6.4's formula on `js/sim/
 *                   + the act's completion bonus  crates.js`'s own numbers. Only
 *                                                 the bonus column is transcribed.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS NOT DERIVED, said plainly rather than buried:
 *
 *   the four level NAMES                     mine; P12's to replace
 *   a1-04's third star (`stalls <= 1`)       the row's own twist, made numeric
 *   the act completion bonus B(act)          DESIGN §6.4's table, transcribed
 *   act 2's deck `coverage: 1`               DESIGN §8.2 says the deck is
 *                                            *permanent*; 1 is what permanent
 *                                            means. §7.1's illustrative 0.55 is
 *                                            a patchy act-1 deck and is not used.
 *   `palette` and `ace` on an act            left at their defaults. ART owns the
 *                                            palettes and STORY owns the aces;
 *                                            inventing either here would put a
 *                                            second copy in the wrong file.
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CEILING_WU, CRUISE_WU_S, BANDS, bandIdAt } from '../js/core/bands.js';
import { M_PER_WU } from '../js/core/math.js';
import { CRATE_EV, ACT_MULT, terminalAt } from '../js/sim/crates.js';
import { ENEMY_BY_ID } from '../js/sim/entities.js';
import { FRAME_REACH_WU, SPAWN_LEAD_WU } from '../js/sim/spawner.js';
import { MAX_SLOPE } from '../js/sim/terrain.js';
import { createLevel, serializeLevel, sizeReport, typeForCode, CODES_WITHOUT_TYPE,
         LEVEL_MAX_BYTES } from '../js/data/level.js';
import { createAct, parseLevelId, levelId } from '../js/data/act.js';
import { validateLevel, formatErrors } from '../js/data/validate.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const has = (k) => argv.includes(k);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };

/* ======================================================== DESIGN §8.4/§8.5 */

const TABLE = [
  { n: 1, obj: 'PAT', enemies: '2k @k0.15', sky: 'd w2', cr: '0', t: 50,
    twist: 'teach: pitch, and that a dive buys speed',
    name: 'First Light' },

  { n: 4, obj: 'RCE', enemies: '—', sky: 'd w2', cr: '0', t: 45,
    twist: 'breather: 8 gates; the course makes you stall once, safely, on purpose',
    name: 'Wire and Wind',
    // The row's own twist, made numeric. See the header: not derived.
    star: { id: 'steady', desc: 'One stall, no more', stat: 'stalls', op: '<=', value: 1 } },

  { n: 12, obj: 'CRT', enemies: '4k, 2o', sky: 'd w5', cr: '6*', t: 90,
    twist: 'teach: the enemy takes crates, and gets reinforced for it (§4.5)',
    name: 'What They Take' },

  { n: 25, obj: 'ZEP', enemies: '1Z (damaged, 500 m), 2k', sky: 'o w5', cr: '3', t: 110,
    twist: 'teach: the zeppelin — cells, engines, blisters, bay',
    name: 'The Long Grey Shape' },
];

/**
 * The acts, from DESIGN §8.2's own columns plus §8.13's theatre. Only the two
 * acts with worked levels are declared, and `actDef` THROWS for an act that is
 * not — P11 must declare act 3's slice deliberately rather than inherit act 2's
 * by accident, which is how a level ends up in a band its theatre never
 * mentions.
 *
 * `slice` is D31's 2-3 band slice, named by §8.2: act 1 is *"low (Mud/Belt/Floor
 * only)"*, act 2 is *"a permanent cloud deck (Deck band)"* with §8.5's balloons
 * and flak *above* the deck. `home` is the middle of the slice and is where the
 * player starts.
 */
const ACT_DEF = {
  1: { name: 'The Mud', slice: ['mud', 'belt', 'floor'], home: 'belt',
       terrain: 'trenchline', k: [0.15, 0.45], bonus: 25, airframe: 'kite_b1',
       upgrades: ['engine.1', 'guns.1', 'fuel.1'], landmark: 'bridge' },
  2: { name: 'The Deck', slice: ['floor', 'deck', 'lane'], home: 'deck',
       terrain: 'plain', k: [0.40, 0.60], bonus: 45, airframe: 'kite_b2',
       upgrades: ['engine.2', 'guns.2', 'armour.1'], deckCoverage: 1, landmark: 'chateau' },
};
const actDef = (a) => {
  const d = ACT_DEF[a];
  if (!d) throw new Error(`genlevels: act ${a} has no declared band slice, terrain or k range. ` +
    `DESIGN §8.2 has the columns; declare them here rather than letting a level inherit ` +
    `another act's theatre by default.`);
  return d;
};

const LEVELS_PER_ACT = 20;
const BAND = Object.fromEntries(BANDS.map((b) => [b.id, b]));
const bandCentre = (id) => (BAND[id].y0 + BAND[id].y1) / 2;

/**
 * D150: an act's ceiling is **the top of its own declared band slice**, derived
 * rather than typed.
 *
 * DESIGN §8.2 gave act 1 a 600 m ceiling *and* the theatre "Mud/Belt/Floor
 * only", and R-02's Floor ends at 450 m — so a quarter of act 1's legal column
 * was in Deck and the two statements had never agreed. D150 ruled that the
 * ceiling yields, because the band edges are physics-facing (D26, D126) and a
 * ceiling is a design statement. Taking it from the slice rather than writing
 * 450 anywhere means the two can never disagree again, and act 2's follows for
 * free: ['floor','deck','lane'] -> Lane's top, -7,500 wu (1,125 m).
 *
 * `column.ceiling` has been in the level format since P9 and defaulted to D28's
 * playable ceiling; nothing read it, which is why W4 was red on a1-01 with no
 * constant to move. `js/modes/story.js`'s corridor is what reads it now.
 */
const actCeilingWu = (a) => { const sl = actDef(a).slice; return BAND[sl[sl.length - 1]].y1; };

/* ======================================================== the cell parsers */

/** `"2k @k0.15"`, `"4k, 2o"`, `"1Z (damaged, 500 m), 2k"`, `"—"`. */
function parseEnemies(cell) {
  const s = String(cell).trim();
  if (!s || s === '—' || s === '-') return { groups: [], kOverride: null, altM: null };
  const kM = /@k([0-9.]+)/.exec(s);
  const kOverride = kM ? Number(kM[1]) : null;
  /**
   * The parenthetical is part of the cell and carries the set-piece's altitude:
   * §8.5 L25 is *"1Z (damaged, 500 m)"*. It is read rather than discarded,
   * because 500 m is the only statement anywhere of where that airship sits.
   */
  const altM = (/\((?:[^)]*?,\s*)?(\d+)\s*m\)/.exec(s) || [])[1];
  const body = s.replace(/@k[0-9.]+/g, '').replace(/\([^)]*\)/g, '');
  const groups = [];
  for (const part of body.split(',')) {
    const m = /^\s*(\d+)\s*([A-Za-z])\s*$/.exec(part);
    if (!m) { if (part.trim()) throw new Error(`genlevels: cannot read enemy group ${JSON.stringify(part)} in ${JSON.stringify(cell)}`); continue; }
    groups.push({ n: Number(m[1]), code: m[2] });
  }
  return { groups, kOverride, altM: altM === undefined ? null : Number(altM) };
}

/** `"d w2"`, `"o w5"`, `"d w3/8"`, `"o w6/-4"` — §8.3's Sky and Wind columns. */
function parseSky(cell) {
  const m = /^\s*([a-z])\s+w(-?[\d.]+)(?:\/(-?[\d.]+))?\s*$/.exec(String(cell));
  if (!m) throw new Error(`genlevels: cannot read sky/wind cell ${JSON.stringify(cell)}`);
  return { sky: m[1], lo: Number(m[2]), hi: m[3] === undefined ? null : Number(m[3]) };
}

/** `"6*"` -> 6 crates whose 3-star target is >= 70% of them (§8.3). */
function parseCr(cell) {
  const s = String(cell).trim();
  return { n: parseInt(s, 10) || 0, starred: s.endsWith('*') };
}

/**
 * §8.3's Sky letter -> `timeOfDay`. `TIME_OF_DAY` is dawn/day/dusk/night, so the
 * three letters that describe WEATHER rather than an hour (`o` overcast, `s`
 * storm, `h` high sun) all resolve to the hour §8.13 gives their act, which for
 * acts 1 and 2 is daylight. The weather itself is carried by the band
 * decoration, not by the clock.
 */
const TIME_OF_DAY_FOR = { d: 'day', k: 'dusk', n: 'night', o: 'day', s: 'day', h: 'day' };

/* ======================================================= the derived level */

/**
 * DESIGN §8.2's `curve` column, linearly across the act. Act 1 is *"k = 0.15"*
 * at L1 rising to *"0.45 by L20"*, act 2 *"k 0.40-0.60"*.
 */
function kFor(act, index) {
  const [lo, hi] = actDef(act).k;
  return +(lo + (hi - lo) * (index - 1) / (LEVELS_PER_ACT - 1)).toFixed(3);
}

/** A turret is what a transport or a bomber has; they cruise ABOVE the fight. */
function bandForType(act, typeId) {
  const d = actDef(act);
  const i = d.slice.indexOf(d.home);
  const above = !!ENEMY_BY_ID[typeId].turrets;
  return d.slice[Math.min(d.slice.length - 1, i + (above ? 1 : 0))];
}

function buildLevel(row) {
  const act = row.n <= LEVELS_PER_ACT ? 1 : Math.ceil(row.n / LEVELS_PER_ACT);
  const index = row.n - (act - 1) * LEVELS_PER_ACT;
  const id = levelId(act, index);
  const d = actDef(act);

  const { groups, kOverride, altM } = parseEnemies(row.enemies);
  const { sky, lo, hi } = parseSky(row.sky);
  const cr = parseCr(row.cr);
  const k = kOverride ?? kFor(act, index);

  const length = Math.round(row.t * CRUISE_WU_S);
  const startX = 600;                                  // §7.1's own, and the level.js default
  const startY = bandCentre(d.home);

  /* --- the span every beat has to fit inside ------------------------------ */
  const x0 = startX + FRAME_REACH_WU;
  const xN = length - SPAWN_LEAD_WU;
  if (xN <= x0) throw new Error(`genlevels: ${id} is ${length} wu — too short to hold one beat ` +
    `(first contact at ${x0}, last legal beat at ${xN})`);
  /**
   * Two spreads, and the difference is deliberate. A GROUP is placed at
   * `i/n` — the first at the start of the span and the last one interval short
   * of the end — because a wave that arrives at the final metre of the level is
   * a wave the player flies away from. A COURSE (a race's gates) is placed at
   * `i/(n-1)`, because a course has to reach both ends.
   */
  const spread = (i, n) => (n <= 1 ? Math.round(x0) : Math.round(x0 + (xN - x0) * i / n));
  const course = (i, n) => (n <= 1 ? Math.round(x0) : Math.round(x0 + (xN - x0) * i / (n - 1)));

  /* --- enemies ------------------------------------------------------------ */
  const beats = [];
  const bosses = [];
  const spawnGroups = [];
  for (const g of groups) {
    const typeId = typeForCode(g.code);
    if (typeId) { spawnGroups.push({ ...g, typeId }); continue; }
    if (g.code === 'Z') { bosses.push(g); continue; }
    const why = CODES_WITHOUT_TYPE[g.code];
    throw new Error(`genlevels: ${id} uses DESIGN code ${JSON.stringify(g.code)} — ` +
      `${why || 'not in the codebook'}. D146: the shipped roster is the authority, and a code with ` +
      `no entity type cannot become a beat. It needs a type, or the row needs re-authoring.`);
  }
  /**
   * SOURCE FIRST. A transport is what feeds a crate level, so it has to be on
   * the map before the crates it drops — a level whose Ox arrives at 23,872 wu
   * while its canopies open at 1,488 is a level whose crates come from nowhere.
   * `turrets` is what makes a type a transport or a bomber, which is the same
   * shipped property `bandForType` reads.
   */
  spawnGroups.sort((a, b) => (ENEMY_BY_ID[b.typeId].turrets ? 1 : 0) - (ENEMY_BY_ID[a.typeId].turrets ? 1 : 0));
  spawnGroups.forEach((g, i) => {
    g.x = spread(i, spawnGroups.length + bosses.length);
    beats.push({ x: g.x, spawn: g.typeId, n: g.n, band: bandForType(act, g.typeId), from: 'ahead', k });
  });

  /* --- crates ------------------------------------------------------------- */
  /**
   * The crate SOURCE decides the altitude. A level with an Ox in it is fed by
   * that Ox (§5.1: *"drops crates on a schedule"*), so the canopy opens at the
   * Ox's own band; a level without one is fed from the Concord Line, and
   * `js/sim/crates.js` opens that canopy as the crate enters reachable sky at
   * 1,500 m — which is `CEILING_WU` exactly, not §7.1's rounded -9,600.
   */
  const bossY = altM === null ? bandCentre(d.home) : -Math.round(altM / M_PER_WU);
  bosses.forEach((g, i) => { g.x = spread(spawnGroups.length + i, spawnGroups.length + bosses.length); });
  const oxGroup = spawnGroups.find((g) => ENEMY_BY_ID[g.typeId].turrets);
  const crateY = oxGroup ? bandCentre(bandForType(act, oxGroup.typeId))
    : bosses.length ? bossY : CEILING_WU;
  const crateFrom = oxGroup ? 'the transport that drops them'
    : bosses.length ? 'the airship\'s bomb bay (§5.1)' : 'the Concord Line, at 1,500 m (D28)';

  /**
   * How much level a crate needs after it opens: the fall from `crateY` to the
   * player's own altitude, at the crate's terminal descent, expressed as the
   * distance the camera covers in that time at cruise.
   */
  const fallM = Math.max(0, (startY - crateY) * M_PER_WU);
  const fallS = fallM / terminalAt(-crateY * M_PER_WU);
  const catchWu = Math.round(fallS * CRUISE_WU_S);
  const xCrateLast = xN - catchWu;
  /**
   * The canopies cannot open before their source is on the map. This bit twice:
   * a1-12's Ox first arrived at 23,872 wu while its crates opened from 1,488 —
   * crates from nowhere — and then a2-05's zeppelin did the same thing, because
   * the fix only knew about transports. The source is whatever `crateFrom`
   * names, and there is one expression for it.
   */
  const sourceX = oxGroup ? oxGroup.x : bosses.length ? bosses[0].x : x0;
  const xCrate0 = Math.max(x0, sourceX);

  if (cr.n && xCrateLast <= xCrate0)
    throw new Error(`genlevels: ${id} cannot hold a catchable crate — the canopy needs ` +
      `${catchWu} wu of level to fall ${fallM.toFixed(0)} m and only ${xN - xCrate0} wu exist`);
  const crateSpread = (i) => (cr.n <= 1 ? Math.round(xCrate0)
    : Math.round(xCrate0 + (xCrateLast - xCrate0) * i / (cr.n - 1)));
  for (let i = 0; i < cr.n; i++) beats.push({ x: crateSpread(i), crate: { y: crateY, owner: 'neutral' } });

  /* --- the cloud deck, and the boss -------------------------------------- */
  /**
   * An overcast level flies THROUGH the deck rather than under it, so the
   * cloudbank spans the middle third of the level — the first and last thirds
   * are the approach and the run home, which is what makes the middle read as
   * an event rather than as the weather.
   */
  /**
   * A RACE IS ITS COURSE, and the course is beats — §7.1's *"a beat fires when
   * the camera passes x"* is exactly what a gate is. The altitudes are the act's
   * own slice, and the shape is chosen so that **exactly one leg demands more
   * climb than the aeroplane has**:
   *
   *   MAX_SLOPE = BEST_CLIMB_WU_S / CRUISE_WU_S = 0.3214
   *   a leg of dx wu can gain at most 0.3214 x dx wu of altitude at cruise
   *   a leg asking for more is flown by trading speed for height — which is the
   *   row's own twist, *"the course makes you stall once, safely, on purpose"*,
   *   as a number rather than as a note.
   *
   * The assertion below is the reason this is a derivation and not a drawing: a
   * course with two such legs, or none, refuses to generate.
   */
  const gateN = Number((/(\d+)\s+gates/.exec(row.twist) || [])[1] || 0);
  if (gateN) {
    const hi = d.slice.indexOf(d.home);
    const SHAPE = [0, -1, -1, 1, 1, 0, 0, -1];        // home / low / high, over the act's slice
    const at = (i) => bandCentre(d.slice[Math.max(0, Math.min(d.slice.length - 1,
      hi + SHAPE[Math.floor(i * SHAPE.length / gateN)]))]);
    const gy = Array.from({ length: gateN }, (_, i) => at(i));
    const dx = gateN > 1 ? (xN - x0) / (gateN - 1) : xN - x0;
    const steep = gy.reduce((n, y, i) => n + (i > 0 && (gy[i - 1] - y) > MAX_SLOPE * dx ? 1 : 0), 0);
    if (steep !== 1) throw new Error(`genlevels: ${id}'s course has ${steep} legs steeper than the ` +
      `aeroplane can climb (${(MAX_SLOPE * dx).toFixed(0)} wu over a ${dx.toFixed(0)} wu leg). ` +
      `The row asks for exactly one.`);
    gy.forEach((y, i) => beats.push({ x: course(i, gateN), event: 'gate', y }));
  }

  if (sky === 'o') beats.push({ x: Math.round(length / 3), event: 'cloudbank', len: Math.round(length / 3) });
  bosses.forEach((g, i) => {
    beats.push({ x: g.x, boss: 'zeppelin-l30', band: bandIdAt(bossY), y: bossY, n: g.n });
  });
  beats.sort((a, b) => a.x - b.x);

  /* --- the landmark, and WHERE is derived from what a landmark is for ----- */
  /**
   * ART §4: landmarks are never tiled and are the real anti-repetition
   * mechanism. So a landmark's job is to make an otherwise blank stretch of the
   * level memorable — which means it goes in the level's **widest gap between
   * beats**, at its midpoint. That is derived from the purpose rather than
   * chosen: put it on top of a beat and the fight is what you remember.
   *
   * The kind is the act's theatre noun (§8.13). One instance per level; P16
   * authors the rig, this only places it, and the Y is the terrain's.
   */
  const edges = [0, ...beats.map((b) => b.x), length];
  let gap = 0, gapAt = Math.round(length / 2);
  for (let i = 1; i < edges.length; i++)
    if (edges[i] - edges[i - 1] > gap) { gap = edges[i] - edges[i - 1]; gapAt = Math.round((edges[i] + edges[i - 1]) / 2); }
  const landmarks = d.landmark ? [{ x: gapAt, kind: d.landmark }] : [];

  /* --- objectives, from the Obj column ------------------------------------ */
  const totalEnemies = spawnGroups.reduce((s, g) => s + g.n, 0);
  const crateTarget = cr.starred ? Math.ceil(cr.n * 0.7) : cr.n;
  const objectives = [{ type: 'reach', x: length }];
  if (row.obj === 'PAT') objectives.push({ type: 'destroy', what: 'aircraft', n: totalEnemies });
  if (row.obj === 'CRT') objectives.push({ type: 'collect', what: 'crate', n: crateTarget });
  if (row.obj === 'ZEP') objectives.push({ type: 'destroy', what: 'boss', ref: 'zeppelin-l30' });
  if (row.obj === 'RCE') objectives.push({ type: 'gates', n: gateN });
  objectives.push({ type: 'survive', maxDeaths: 0 });

  /* --- stars -------------------------------------------------------------- */
  /**
   * Two of the three come out of the row's own columns. §8.3 defines `*` as
   * *"the level's 3-star crate target is >= 70% of them"*, so the crate star is
   * the table's, and `t(s)` is the table's duration.
   */
  const stars = [{ id: 'clean', desc: 'Not a scratch', stat: 'damageTaken', op: '==', value: 0 }];
  if (cr.n) stars.push({ id: 'greedy', desc: cr.starred ? `${crateTarget} of ${cr.n} crates` : 'Every crate recovered',
                         stat: 'cratesMissed', op: '<=', value: cr.n - crateTarget });
  else if (totalEnemies) stars.push({ id: 'thorough', desc: 'Nothing left flying', stat: 'kills', op: '>=', value: totalEnemies });
  else if (row.star) stars.push(row.star);
  else throw new Error(`genlevels: ${id} has no enemies and no crates, so its third star cannot be ` +
    `derived from the table. Give the row a \`star\` column.`);
  stars.push({ id: 'quick', desc: `Under ${row.t} s`, stat: 'time', op: '<=', value: row.t });

  /* --- weather ------------------------------------------------------------ */
  /**
   * DESIGN §8.10's own wind shape: `[[altM, m/s], ...]`. Emitted as the SI table
   * rather than as §7.1's `{ x }` scalar, because §8.3 states the table's wind
   * in m/s and §7.1's scalar is in wu/s — one form is unambiguous and the other
   * is REQUEST-10.
   */
  const ceilingM = -CEILING_WU * M_PER_WU;
  const wind = hi === null ? [[0, lo], [ceilingM, lo]] : [[0, lo], [ceilingM, hi]];

  const bandsMod = {};
  if (sky === 'o' && d.deckCoverage !== undefined) bandsMod.deck = { coverage: d.deckCoverage };

  return {
    v: 1, id, act, index, name: row.name, seed: id, length,
    column: { ceiling: actCeilingWu(act) },
    ...(Object.keys(bandsMod).length ? { bands: bandsMod } : {}),
    terrain: { profile: d.terrain },
    weather: { wind, timeOfDay: TIME_OF_DAY_FOR[sky] },
    player: { start: { x: startX, y: startY }, airframe: d.airframe },
    beats,
    landmarks,
    objectives,
    stars,
    reward: { crates: cr.n, scrip: Math.round(cr.n * CRATE_EV * ACT_MULT[act]) + d.bonus },
    /** Reported, never written: the arithmetic each level was derived from. */
    __derived: { x0, xN, catchWu, xCrate0, xCrateLast, crateY, crateFrom, fallS: +fallS.toFixed(1), k, gap, gapAt,
                 totalEnemies, crateTarget, sky, twist: row.twist },
  };
}

/* ============================================================ the artefacts */

export function levels() {
  return TABLE.map((row) => {
    const authored = buildLevel(row);
    const { __derived, ...doc } = authored;
    const level = createLevel(doc);
    return { row, doc, derived: __derived, level, text: serializeLevel(level) };
  });
}

export function acts() {
  const used = [...new Set(TABLE.map((r) => (r.n <= LEVELS_PER_ACT ? 1 : Math.ceil(r.n / LEVELS_PER_ACT))))];
  return used.sort().map((a) => {
    const d = actDef(a);
    const act = createAct({ id: `act${a}`, act: a, name: d.name,
      unlocks: { airframes: [d.airframe], upgrades: d.upgrades },
      gate: { starsRequired: 0 } });
    return { act, text: JSON.stringify(act, null, 2) + '\n' };
  });
}

const levelPath = (id) => join(ROOT, 'data/levels', `${id}.json`);
const actPath = (id) => join(ROOT, 'data/acts', `${id}.json`);

/* ================================================================= the CLI */

function report() {
  const out = levels();
  console.log(`\nGENLEVELS — DESIGN §8.4/§8.5, ${TABLE.length} rows, cruise ${CRUISE_WU_S} wu/s, ` +
    `frame reach ${FRAME_REACH_WU} wu, spawn lead ${SPAWN_LEAD_WU} wu\n`);
  let bad = 0;
  for (const { level, derived, text } of out) {
    const res = validateLevel(level);
    const sz = sizeReport(level);
    if (!res.ok || !sz.ok) bad++;
    console.log(`  ${level.id}  ${level.name}`);
    console.log(`        ${derived.twist}`);
    console.log(`        length ${level.length} wu (${(level.length * M_PER_WU / 1000).toFixed(2)} km, ` +
      `${(level.length / CRUISE_WU_S).toFixed(0)} s at cruise); start ${level.player.start.x},${level.player.start.y} wu; ` +
      `k ${derived.k}`);
    console.log(`        beats ${level.beats.length} over [${derived.x0}, ${derived.xN}] wu: ` +
      `${level.beats.map((b) => b.spawn ? `${b.n}x${b.spawn}@${b.band}` : b.crate ? 'crate' : b.boss || b.event).join(' ')}`);
    if (derived.crateY !== undefined && level.reward.crates)
      console.log(`        crates open at ${derived.crateY} wu and need ${derived.catchWu} wu ` +
        `(${derived.fallS} s of fall) — last crate beat at ${derived.xCrateLast}`);
    console.log(`        wind ${JSON.stringify(level.wind)} m/s; ${level.weather.timeOfDay}; ` +
      `reward ${level.reward.crates} crates + ${level.reward.scrip} scrip`);
    if (level.landmarks.length) console.log(`        landmark ${level.landmarks[0].kind} at ` +
      `${level.landmarks[0].x} wu — the midpoint of the level's widest beat gap (${derived.gap} wu)`);
    console.log(`        ${sz.bytes} B of ${LEVEL_MAX_BYTES} (${(100 * sz.bytes / LEVEL_MAX_BYTES).toFixed(0)}%); ` +
      `validate: ${res.ok ? 'clean' : formatErrors(level.id, res.errors).join(' | ')}`);
    console.log('');
  }
  for (const { act } of acts()) console.log(`  ${act.id}  ${act.name} — ${act.levels.length} levels, ` +
    `unlocks ${act.unlocks.airframes.join(',')}`);
  console.log(bad ? `\nFAIL — ${bad} level(s) do not validate or do not fit\n`
                  : `\n${out.length}/${out.length} levels validate clean and fit the cap\n`);
  return bad;
}

function write() {
  mkdirSync(join(ROOT, 'data/levels'), { recursive: true });
  mkdirSync(join(ROOT, 'data/acts'), { recursive: true });
  for (const { level, text } of levels()) { writeFileSync(levelPath(level.id), text); console.log(`  wrote data/levels/${level.id}.json  ${text.length} B`); }
  for (const { act, text } of acts()) { writeFileSync(actPath(act.id), text); console.log(`  wrote data/acts/${act.id}.json  ${text.length} B`); }
}

/**
 * W6. **The table is the source**, so the check is that regenerating from it
 * reproduces the bytes on disk exactly. A level that has been hand-edited goes
 * red here, and that is the intended reading for the four worked levels: they
 * are generator-owned. P11's other 96 may be edited after generation — the
 * brief requires the output to be hand-editable — but then they leave this set.
 */
function check() {
  let bad = 0;
  const rows = [];
  for (const { level, text } of levels()) {
    const p = levelPath(level.id);
    const on = existsSync(p) ? readFileSync(p, 'utf8') : null;
    const ok = on === text;
    if (!ok) bad++;
    rows.push({ id: level.id, ok, bytes: text.length, onDisk: on === null ? 'MISSING' : `${on.length} B` });
  }
  for (const { act, text } of acts()) {
    const p = actPath(act.id);
    const on = existsSync(p) ? readFileSync(p, 'utf8') : null;
    const ok = on === text;
    if (!ok) bad++;
    rows.push({ id: act.id, ok, bytes: text.length, onDisk: on === null ? 'MISSING' : `${on.length} B` });
  }
  return { ok: bad === 0, rows };
}

export { check, TABLE, buildLevel };

if (process.argv[1] && process.argv[1].endsWith('genlevels.mjs')) {
  if (has('--json')) {
    const id = arg('--json', '');
    const hit = levels().find((l) => l.level.id === id);
    if (!hit) { console.error(`no such level: ${id}`); process.exit(1); }
    process.stdout.write(hit.text);
  } else if (has('--write')) {
    write();
  } else if (has('--check')) {
    const r = check();
    for (const row of r.rows) console.log(`  ${(row.ok ? 'SAME' : 'DIFF').padEnd(6)}${row.id.padEnd(10)}generated ${row.bytes} B, on disk ${row.onDisk}`);
    console.log(r.ok ? '\nW6 — every artefact regenerates byte-identically from the table\n'
                     : '\nW6 FAIL — the table and the files on disk disagree\n');
    process.exit(r.ok ? 0 : 1);
  } else {
    process.exit(report() ? 1 : 0);
  }
}
