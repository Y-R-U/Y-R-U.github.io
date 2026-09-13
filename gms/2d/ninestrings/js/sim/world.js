// The world. Owns all sim state and the frozen step order (CONTRACTS 7.1).
// Runs under plain node: no window, no document, no Math.random.
// LANE B-core owns this file.
//
// Every other sim lane is reached through a HOOK, resolved once at world
// creation and null if that lane has not landed yet (see resolveLane). The
// module graph must keep loading while five agents are writing into it in
// parallel, so a missing export degrades this file to "that system does not
// exist yet" rather than to a boot failure.

import { makePool } from '../core/pool.js';
import { makeRng } from '../core/rng.js';
import { recomputeStats } from './stats.js';
import { newStatus, clearStatus, stepStatuses } from './status.js';
import { spawnEnemy, stepEnemies } from './enemy.js';
import { makeDirector } from './spawn.js';
import { applyDamage, damagePlayer } from './damage.js';

import { WEAPONS } from '../data/weapons.js';
import { PASSIVES } from '../data/passives.js';
import { ENEMIES } from '../data/enemies.js';
import { RELICS } from '../data/relics.js';

import * as Conductors from './conductor.js';
import * as Strings from './strings.js';
import * as Weapons from './weapon.js';
import * as Projectiles from './projectile.js';
import * as Pickups from './pickup.js';
import * as Boss from './boss.js';

export const DT = 1 / 60;
export const PLAYER_RADIUS = 7;
export const MAX_WEAPONS = 6;
export const MAX_PASSIVES = 6;
export const MAX_WEAPON_LEVEL = 8;
export const MAX_PASSIVE_LEVEL = 5;
export const CHORUS_DURATION = 14;

const CAP = { enemies: 700, projectiles: 600, pickups: 900, conductors: 16,
              hazards: 200, allies: 24, strings: 700 };

// ---------------------------------------------------------------------------
// FALLBACK data. Used ONLY when js/data/** is still empty (Lane C is writing it
// in parallel), so the sim is runnable and balance-testable today. DELETE both
// of these once enemies.js and stages.js have real content - `usingFallback` on
// the world says whether they are live.
// ---------------------------------------------------------------------------
export const FALLBACK_ENEMIES = {
  fb_shambler: { id: 'fb_shambler', name: 'Shambler', hp: 12, speed: 26, dmg: 6,
    armour: 0, radius: 7, xp: 1, mass: 1, ai: 'chase', strungChance: 0.5,
    onDeath: null, codex: 'fallback' },
  fb_crawler: { id: 'fb_crawler', name: 'Crawler', hp: 6, speed: 52, dmg: 4,
    armour: 0, radius: 5, xp: 1, mass: 0.6, ai: 'swarm', strungChance: 0.25,
    onDeath: null, codex: 'fallback' },
};

export const FALLBACK_STAGE = {
  id: 'fb_lane', act: 1, name: 'Fallback Lane', subtitle: 'placeholder',
  duration: 480, maxAlive: 400,
  palette: { ground: [0.04, 0.04, 0.06], fog: [0, 0, 0], accent: [1, 0.3, 0.2], choir: [[1, 0.3, 0.2]] },
  timeline: [
    { at: 0,   until: 120, every: 2.0, enemy: 'fb_shambler', n: 3,  pattern: 'ring' },
    { at: 30,  until: 300, every: 3.5, enemy: 'fb_crawler',  n: 6,  pattern: 'pack', scale: { hp: 1.6 } },
    { at: 120, until: 480, every: 2.0, enemy: ['fb_shambler', 'fb_crawler'], n: 8, pattern: 'edge', scale: { hp: 2.5, speed: 1.3 } },
    { at: 240, until: 480, every: 6.0, enemy: 'fb_shambler',  n: 24, pattern: 'wall', scale: { hp: 3 } },
  ],
  conductor: { first: 45, every: 75, choir: 8, affixes: ['speed', 'armour', 'burning'] },
  chorus: [150, 300, 420],
  rewards: { souls: 40, unlocks: [] },
};

// How many more bodies the horde is allowed. Enemies freed this step are still
// in the pool until step 11, so they are subtracted: a splitter that dies at the
// cap is REPLACING a slot, not adding one.
export function capRoom(world) {
  const cap = (world.stage && world.stage.maxAlive) || 400;
  // One slot is held back for a stage boss from the start of the run, so the
  // boss can force its way in later without the TOTAL body count ever going one
  // over the number the frame budget was measured against.
  const reserve = (world.stage && world.stage.boss && !world.bossId) ? 1 : 0;
  return cap - reserve - (world.enemies.count - world._dead.length);
}

export function enemyDef(world, id) {
  if (!id) return null;
  return (world._enemyDefs && world._enemyDefs[id]) || ENEMIES[id] || FALLBACK_ENEMIES[id] || null;
}

// ---------------------------------------------------------------------------
// Spatial hash. The hottest structure in the game: rebuilt once per step by a
// counting sort into flat typed arrays, so a query is a contiguous walk instead
// of chasing a Map of Arrays around the heap.
//
// Cells are hashed rather than gridded because the arena is unbounded. A hash
// collision can only ever produce a FALSE POSITIVE, which the distance test
// already rejects, so collisions cost a little work and never correctness.
// ---------------------------------------------------------------------------
const INV_CELL = 1 / 32;   // 32-unit cells
const HBITS = 12, HCELLS = 1 << HBITS, HMASK = HCELLS - 1;
const MAX_CELL_SPAN = 24;     // beyond this a query is cheaper as a linear scan

function cellKey(cx, cy) {
  return (Math.imul(cx, 92837111) ^ Math.imul(cy, 689287499)) & HMASK;
}

function makeHash(cap) {
  return {
    counts: new Int32Array(HCELLS + 1),
    cursor: new Int32Array(HCELLS),
    items: new Array(cap),
    n: 0, stamp: 0,
  };
}

function rebuildHash(w) {
  const H = w._hash, counts = H.counts, cursor = H.cursor;
  counts.fill(0);

  const tally = (e) => {
    const k = cellKey(Math.floor(e.x * INV_CELL), Math.floor(e.y * INV_CELL));
    e._h = k;
    counts[k + 1]++;
  };
  w.enemies.each(tally);
  w.conductors.each(tally);

  for (let i = 0; i < HCELLS; i++) { counts[i + 1] += counts[i]; cursor[i] = counts[i]; }

  const items = H.items;
  const place = (e) => { items[cursor[e._h]++] = e; };
  w.enemies.each(place);
  w.conductors.each(place);
  H.n = counts[HCELLS];
}

// ---------------------------------------------------------------------------

export function createWorld(opts = {}) {
  const rng = opts.rng || makeRng(opts.seed || 1);
  const stageIn = opts.stage;
  const usingFallbackStage = !stageIn || !stageIn.timeline;
  const stage = usingFallbackStage ? FALLBACK_STAGE : stageIn;
  const usingFallbackEnemies = Object.keys(ENEMIES).length === 0;

  const world = {
    tick: 0, time: 0, rng, nextId: 1,
    seed: opts.seed || 1,
    stage,
    character: opts.character || null,
    curse: opts.curse || 0,
    tutorial: !!opts.tutorial,
    sanctum: opts.sanctum || {},
    relics: opts.relics || [],
    sigils: [],
    usingFallback: usingFallbackStage || usingFallbackEnemies,

    px: 0, py: 0,               // input vector, written by the host each tick

    player: makePlayer(),
    enemies:     makePool(newEnemy,     resetEnemy,     CAP.enemies),
    projectiles: makePool(newProjectile,resetProjectile,CAP.projectiles),
    pickups:     makePool(newPickup,    resetPickup,    CAP.pickups),
    conductors:  makePool(newConductor, resetConductor, CAP.conductors),
    hazards:     makePool(newHazard,    resetHazard,    CAP.hazards),
    allies:      makePool(newAlly,      resetAlly,      CAP.allies),
    strings:     makePool(newString,    resetString,    CAP.strings),

    events: [],
    over: null,
    pendingLevels: 0,
    kills: 0, cuts: 0, conductorsKilled: 0, damageDealt: 0,
    upgradedSpawns: 0, freed: 0, bonusSouls: 0, eliteAlive: 0,

    // difficulty ramp, refreshed once per tick and read by spawnEnemy
    hpRamp: 1, dmgRamp: 1,

    chorus: { active: false, n: 0, until: 0 },
    boss: null, bossId: 0, bossDown: false,

    allowPassives: opts.allowPassives !== undefined ? opts.allowPassives : !opts.tutorial,
    banished: [],
    offerSeed: (rng.next() * 0x7fffffff) | 0,
    offerSalt: 0,
    laneErrors: [],

    // scratch - reused, never reallocated
    _hash: makeHash(CAP.enemies + CAP.conductors + 8),
    _qout: [], _scratchA: [],
    _qstack: [[], [], [], []], _qdepth: 0,
    _dead: [], _deadConductors: [],
    // Tunables the strings/sigils layer reaches for. Sigils and relics move
    // these; nothing else should.
    freedChance: 0.12,
    alliesEternal: false,
    _allyHit: null,
    _enemyDefs: usingFallbackEnemies ? FALLBACK_ENEMIES : null,
    coins: 0,
    conductorsSeen: 0,

    step() { stepWorld(world); },
    spatialQuery(x, y, r, out) { return query(world, x, y, r, out); },
    chooseUpgrade(id) { return chooseUpgrade(world, id); },
    offerUpgrades(n) { return offerUpgrades(world, n); },
    rerollOffers() { world.offerSalt++; },
    banish(id) { if (world.banished.indexOf(id) < 0) world.banished.push(id); },
    applyRelic(id) { return applyRelic(world, id); },
    addWeapon(id) { return addWeapon(world, id); },
    addPassive(id) { return addPassive(world, id); },
    addXp(n) { return addXp(world, n); },
    hurt(target, n, o) { return applyDamage(world, target, n, o); },
    heal(n) { const p = world.player; p.hp = Math.min(p.maxHp, p.hp + n); },
    refreshStats() { refreshStats(world); },
    onPlayerDown() { onPlayerDown(world); },
    finish(result) { finish(world, result); },
  };

  // character signature weapon, if the data is there
  refreshStats(world);
  world.player.hp = world.player.maxHp;
  if (world.character && world.character.weapon) addWeapon(world, world.character.weapon);
  if (Array.isArray(opts.relics)) for (let i = 0; i < opts.relics.length; i++) {
    const r = opts.relics[i];
    if (typeof r === 'string' && RELICS[r]) world.relics[i] = RELICS[r];
  }
  refreshStats(world);
  seedBuild(world);
  world.player.hp = world.player.maxHp;

  world._director = makeDirector(world);
  // Hooks the damage router reaches for without importing the module that owns
  // the behaviour (which would close an import cycle).
  world._snapChoir = typeof Strings.snapChoir === 'function' ? Strings.snapChoir : null;
  world._allyHit = (w, target, dmg) =>
    applyDamage(w, target, dmg, { source: 'ally', quiet: false });

  world._lanes = {
    conductors:  resolveLane(world, Conductors, 'stepConductors',  'makeConductors'),
    strings:     resolveLane(world, Strings,    'stepStrings',     'makeStrings'),
    weapons:     resolveLane(world, Weapons,    'stepWeapons',     'makeWeapons'),
    projectiles: resolveLane(world, Projectiles,'stepProjectiles', 'makeProjectiles'),
    collisions:  resolveLane(world, Projectiles,'stepCollisions',  null),
    hazards:     resolveLane(world, Projectiles,'stepHazards',     null),
    pickups:     resolveLane(world, Pickups,    'stepPickups',     'makePickups'),
    allies:      resolveLane(world, Strings,    'stepAllies',      null),
    boss:        resolveLane(world, Boss,       'stepBoss',        'makeBoss'),
  };

  return world;
}

// A lane is either `stepX(world)` or `makeX(world) -> { step() }`. Binding is
// wrapped because a half-written module must not take the whole page down; the
// per-frame call deliberately is NOT, because a system that throws every tick is
// a bug to see, not a degradation to hide.
function resolveLane(world, mod, stepName, makeName) {
  try {
    if (mod && typeof mod[stepName] === 'function') return () => mod[stepName](world);
    if (makeName && mod && typeof mod[makeName] === 'function') {
      const inst = mod[makeName](world);
      if (inst && typeof inst.step === 'function') return () => inst.step();
    }
  } catch (e) {
    world.laneErrors.push(stepName + ': ' + (e && e.message ? e.message : e));
  }
  return null;
}

// ---------------------------------------------------------------------------
// THE STEP. Order is frozen - CONTRACTS 7.1. Do not reorder; balance depends
// on it and the whole point of a fixed step is that a run replays identically.
// ---------------------------------------------------------------------------
function stepWorld(w) {
  if (w.over) return;

  // 1 ------------------------------------------------------------------ tick
  w.tick++;
  w.time = w.tick / 60;
  w.events.length > 4096 && (w.events.length = 0);   // host forgot to drain
  const curse = w.player.stats.curse;
  w.hpRamp  = (1 + (w.time / 60) * 0.22) * curse;
  w.dmgRamp = (1 + (w.time / 60) * 0.07) * curse;

  // 2 ------------------------------------------- player movement + statuses
  stepPlayer(w);
  stepStatuses(w);

  // 3 -------------------------------------------------------- spawn director
  w._director.step();

  // 4 --------------------------------------------------------- conductors
  if (w._lanes.conductors) w._lanes.conductors();

  // 5 ------------------------------------------------------------- strings
  if (w._lanes.strings) w._lanes.strings();

  // The hash is rebuilt here: after everything that SPAWNS, before everything
  // that QUERIES. Enemies move in step 6, so collisions in step 9 see positions
  // one step stale - that is deliberate and uniform, not an oversight.
  rebuildHash(w);

  // 6 ----------------------------------------------------- enemy AI + movement
  stepEnemies(w);
  if (w._lanes.boss) w._lanes.boss();
  if (w._lanes.allies) w._lanes.allies();

  // 7 ----------------------------------------------------------- weapons fire
  if (w._lanes.weapons) w._lanes.weapons();

  // 8 ------------------------------------------- projectiles + hazards move
  if (w._lanes.projectiles) w._lanes.projectiles();
  stepHostileProjectiles(w);
  if (w._lanes.hazards) w._lanes.hazards(); else stepHazards(w);

  // 9 --------------------------------------------- collision + damage
  if (w._lanes.collisions) w._lanes.collisions();

  // 10 ------------------------------------------------ pickups + magnetism
  if (w._lanes.pickups) w._lanes.pickups(); else stepPickups(w);

  // 11 --------------------------------------------- deaths, drops, level-ups
  reap(w);
  resolveLevels(w);

  // 12 ------------------------------------------------------ stage timeline
  stepTimeline(w);
}

// ---------------------------------------------------------------------------
function stepPlayer(w) {
  const p = w.player;
  if (!p.alive) return;
  const s = p.stats;

  let mx = w.px || 0, my = w.py || 0;
  const l = Math.sqrt(mx * mx + my * my);
  if (l > 1) { mx /= l; my /= l; }
  let sp = p.speed * s.speed;
  if (p.chillT > 0) { p.chillT -= DT; sp *= p.chillMul; if (p.chillT <= 0) p.chillMul = 1; }
  p.vx = mx * sp; p.vy = my * sp;
  p.x += p.vx * DT;
  p.y += p.vy * DT;
  if (l > 0.05) {
    p.facing = mx >= 0 ? 1 : -1;
    // A full aim VECTOR, not just a left/right flag. The arc weapons sweep a
    // cone around this; with only a sign, the starting weapon could not hit
    // anything above or below the player, which on a portrait phone is most of
    // the screen.
    p.aimX = mx; p.aimY = my;
  }

  if (p.iframes > 0) p.iframes -= DT;
  if (p.dashCd > 0) p.dashCd -= DT;

  if (s.regen > 0 && p.hp > 0 && p.hp < p.maxHp) {
    p.regenAcc += s.regen * DT;
    if (p.regenAcc >= 1) {
      const h = Math.floor(p.regenAcc);
      p.regenAcc -= h;
      p.hp = Math.min(p.maxHp, p.hp + h);
    }
  }
}

// Enemy shots and acid pools belong to world.js, not to B-weapons: they are the
// only projectiles that hunt the player, so they are collided here and skipped
// there (anything with `.hostile` is ours).
function stepHostileProjectiles(w) {
  const p = w.player;
  w.projectiles.each((q) => {
    if (!q.hostile) return;
    q.life -= DT;
    if (q.life <= 0) { w.projectiles.free(q); return; }
    q.x += q.vx * DT;
    q.y += q.vy * DT;
    const dx = p.x - q.x, dy = p.y - q.y;
    const r = q.radius + PLAYER_RADIUS;
    if (dx * dx + dy * dy <= r * r) {
      damagePlayer(w, q.damage, q.x, q.y);
      w.projectiles.free(q);
    }
  });
}

function stepHazards(w) {
  const p = w.player;
  w.hazards.each((h) => {
    h.life -= DT;
    if (h.life <= 0) { w.hazards.free(h); return; }
    h.acc += DT;
    const rate = h.tickRate || 0.25;
    if (h.acc < rate) return;
    h.acc -= rate;
    if (h.hostile) {
      const dx = p.x - h.x, dy = p.y - h.y;
      if (dx * dx + dy * dy <= h.r * h.r) damagePlayer(w, h.damage, h.x, h.y);
    } else {
      const out = w.spatialQuery(h.x, h.y, h.r, w._scratchA);
      for (let i = 0; i < out.length; i++) {
        applyDamage(w, out[i], h.damage, { source: 'hazard', weaponId: h.ownerWeapon || null, quiet: true });
      }
    }
  });
}

// Fallback magnetism. B-weapons owns pickup.js; until it lands the XP economy
// still has to work or the levelling curve cannot be tested at all.
function stepPickups(w) {
  const p = w.player;
  const pull = p.magnet;
  const pull2 = pull * pull;
  const grab2 = (PLAYER_RADIUS + 6) * (PLAYER_RADIUS + 6);
  w.pickups.each((k) => {
    const dx = p.x - k.x, dy = p.y - k.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < pull2 || k.pull > 0) {
      k.pull = 1;
      const d = Math.sqrt(d2) || 1;
      const sp = 90 + (1 - Math.min(1, d / Math.max(1, pull))) * 340;
      k.x += (dx / d) * sp * DT;
      k.y += (dy / d) * sp * DT;
    }
    if (d2 <= grab2) collect(w, k);
  });
}

function collect(w, k) {
  const p = w.player;
  w.events.push({ t: 'pickup', x: k.x, y: k.y, kind: k.kind, value: k.value });
  if (k.kind === 'shard') addXp(w, k.value);
  else if (k.kind === 'heart') p.hp = Math.min(p.maxHp, p.hp + k.value);
  else if (k.kind === 'coin') w.bonusSouls += k.value * p.stats.greed;
  else if (k.kind === 'magnet') w.pickups.each((o) => { if (o !== k) o.pull = 1; });
  else if (k.kind === 'bomb') {
    const out = w.spatialQuery(p.x, p.y, 260, w._scratchA);
    for (let i = 0; i < out.length; i++) applyDamage(w, out[i], 9999, { source: 'bomb', noCrit: true });
    w.events.push({ t: 'shake', amount: 22 });
  } else if (k.kind === 'chest') {
    w.events.push({ t: 'chest', x: k.x, y: k.y });
    w.pendingChests = (w.pendingChests || 0) + 1;
  }
  w.pickups.free(k);
}

// Frees are deferred to here so an explosion that kills a neighbour mid-`each`
// cannot swap the pool out from under the iterator.
function reap(w) {
  const dead = w._dead;
  for (let i = 0; i < dead.length; i++) {
    const e = dead[i];
    if (e.statuses) clearStatus(e.statuses);
    if (e.elite) w.eliteAlive--;
    if (e.id === w.bossId) w.bossDown = true;
    w.enemies.free(e);
  }
  dead.length = 0;

  const dc = w._deadConductors;
  for (let i = 0; i < dc.length; i++) w.conductors.free(dc[i]);
  dc.length = 0;
}

// ---------------------------------------------------------------------------
// Arriving experienced.
//
// A story campaign is not a fresh roguelike run every stage. The Act IV bestiary
// is written for a developed build - a namewraith has 900hp and 4 armour, which
// a level-1 Emberlash (11 damage) would need 128 swings to kill - so a player
// dropped into Stage 11 at level 1 died in NINE SECONDS having killed nothing.
//
// The honest fix is not to weaken Act IV, it is to make the player actually be
// what Act IV is written against. You have been doing this for months by then.
// These upgrades are granted SILENTLY: nine level-up prompts before the stage
// starts would be a worse experience than the problem.
const ACT_SEED = { 1: 0, 2: 7, 3: 15, 4: 24 };

function seedBuild(w) {
  const act = (w.stage && w.stage.act) | 0;
  let n = ACT_SEED[act] || 0;
  if (w.tutorial) n = 0;
  if (n <= 0) return;

  for (let i = 0; i < n; i++) {
    const offers = offerUpgrades(w, 3);
    if (!offers || !offers.length) break;
    // Drawn from the world rng so a seeded run is still reproducible.
    const pick = offers[(w.rng.next() * offers.length) | 0] || offers[0];
    chooseUpgrade(w, pick.id);
  }
  // chooseUpgrade decrements pendingLevels, which was never incremented here.
  w.pendingLevels = 0;
  w.player.pendingLevels = 0;
  w.player.level = 1 + n;
  w.player.xp = 0;
  w.player.xpNext = xpForLevel(w.player.level);
  // Health has to grow with the act too. Enemy damage runs 6 in Act I to 45 in
  // Act IV, so a flat 100hp pool means the last act kills you in three touches
  // no matter how good your build is. This is the survivability half of
  // "arriving experienced"; the upgrades above are the damage half.
  w.actVitality = 1 + 0.55 * (act - 1);
  w.seeded = n;
  refreshStats(w);
}

// ---------------------------------------------------------------------------
// XP and levelling
// ---------------------------------------------------------------------------
export function xpForLevel(l) {
  if (l < 10) return 5 + (l - 1) * 6;
  if (l < 25) return 59 + (l - 9) * 13;
  if (l < 45) return 267 + (l - 24) * 24;
  return 747 + (l - 44) * 40;
}

function addXp(w, n) {
  const p = w.player;
  p.xp += Math.max(0, n * p.stats.growth);
}

function resolveLevels(w) {
  const p = w.player;
  let guard = 0;
  while (p.xp >= p.xpNext && guard++ < 64) {
    p.xp -= p.xpNext;
    p.level++;
    p.xpNext = xpForLevel(p.level);
    p.pendingLevels = ++w.pendingLevels;
    w.offerSeed = (w.offerSeed * 1103515245 + 12345) & 0x7fffffff;
    w.offerSalt = 0;
    w.events.push({ t: 'levelup', level: p.level });
  }
}

// ---------------------------------------------------------------------------
// Upgrades. offerUpgrades() is pure: it draws from a rng SEEDED by offerSeed
// rather than from world.rng, so the level-up screen can call it on every
// repaint without moving the run's random stream one step.
// ---------------------------------------------------------------------------
const HEAL_OFFER = { id: 'ns_mend', kind: 'heal', name: 'Mend', tag: 'MND',
                     desc: 'Restore 30 health.', level: 0, colour: [0.4, 1, 0.5] };
const SOULS_OFFER = { id: 'ns_alms', kind: 'gold', name: 'Alms', tag: 'ALM',
                      desc: '+40 Souls at the end of this run.', level: 0, colour: [1, 0.85, 0.4] };

function offerUpgrades(w, n) {
  const want = Math.max(1, n | 0);
  const p = w.player;
  const cands = [];

  for (const id in WEAPONS) {
    if (w.banished.indexOf(id) >= 0) continue;
    const def = WEAPONS[id];
    if (def.charOnly && (!w.character || w.character.id !== def.charOnly)) continue;
    if (def.evolved) continue;
    const inst = findWeapon(p, id);
    if (inst) {
      if (inst.level >= MAX_WEAPON_LEVEL) continue;
      cands.push(mkOffer(id, 'weapon', def, inst.level + 1, false));
    } else if (p.weapons.length < MAX_WEAPONS) {
      cands.push(mkOffer(id, 'weapon', def, 1, true));
    }
  }

  if (w.allowPassives) {
    for (const id in PASSIVES) {
      if (w.banished.indexOf(id) >= 0) continue;
      const def = PASSIVES[id];
      const lv = p.passives[id] | 0;
      if (lv >= MAX_PASSIVE_LEVEL) continue;
      if (!lv && Object.keys(p.passives).length >= MAX_PASSIVES) continue;
      cands.push(mkOffer(id, 'passive', def, lv + 1, !lv));
    }
  }

  const r = makeRng(((w.offerSeed ^ Math.imul(w.offerSalt + 1, 2654435761)) >>> 0) || 1);
  // Luck nudges NEW picks up: a build that never sees a new weapon feels stuck,
  // and that is what the luck stat is for.
  const luck = p.stats.luck;
  for (let i = 0; i < cands.length; i++) cands[i]._w = r.next() * (cands[i].isNew ? luck : 1);
  cands.sort((a, b) => b._w - a._w);

  const out = [];
  for (let i = 0; i < cands.length && out.length < want; i++) {
    delete cands[i]._w;
    out.push(cands[i]);
  }
  // Everything maxed (or the data is not written yet): the level still has to
  // give the player something, or the level-up screen is a dead end.
  while (out.length < want) out.push(out.length % 2 === 0 || p.hp >= p.maxHp ? clone(SOULS_OFFER) : clone(HEAL_OFFER));
  return out;
}

function clone(o) { return { id: o.id, kind: o.kind, name: o.name, tag: o.tag, desc: o.desc, level: o.level, colour: o.colour, isNew: false }; }

function mkOffer(id, kind, def, level, isNew) {
  const step = kind === 'weapon'
    ? (level > 1 && def.levels ? def.levels[level - 2] : null)
    : (def.levels ? def.levels[level - 1] : null);
  return {
    id, kind, level, isNew,
    name: def.name || id,
    tag: def.tag || '',
    colour: def.colour || null,
    desc: (step && step.text) || def.desc || '',
  };
}

function chooseUpgrade(w, id) {
  if (!id) return false;
  let ok = false;
  if (WEAPONS[id]) ok = !!addWeapon(w, id);
  else if (PASSIVES[id]) ok = !!addPassive(w, id);
  else if (id === HEAL_OFFER.id) { w.heal(30); ok = true; }
  else if (id === SOULS_OFFER.id) { w.bonusSouls += 40; ok = true; }

  if (w.pendingLevels > 0) w.pendingLevels--;
  w.player.pendingLevels = w.pendingLevels;
  w.offerSeed = (w.offerSeed * 1103515245 + 12345) & 0x7fffffff;
  w.offerSalt = 0;
  return ok;
}

// ---------------------------------------------------------------------------
// Weapons. B-weapons owns FIRING; this file owns the array and the levelling.
// The WeaponInst shape is documented in docs/lanes/B-core.md.
// ---------------------------------------------------------------------------
function findWeapon(p, id) {
  for (let i = 0; i < p.weapons.length; i++) if (p.weapons[i].id === id) return p.weapons[i];
  return null;
}

function weaponStats(def, level) {
  const s = {};
  const base = def.base || {};
  for (const k in base) s[k] = base[k];
  const lv = def.levels || [];
  for (let i = 0; i < level - 1 && i < lv.length; i++) {
    const d = lv[i];
    for (const k in d) {
      if (k === 'text') continue;
      s[k] = (s[k] === undefined ? 0 : s[k]) + d[k];
    }
  }
  return s;
}

function addWeapon(w, id) {
  const def = WEAPONS[id];
  if (!def) return null;
  const p = w.player;
  let inst = findWeapon(p, id);
  if (inst) {
    if (inst.level >= MAX_WEAPON_LEVEL) return inst;
    inst.level++;
    inst.stats = weaponStats(def, inst.level);
    if (typeof Weapons.onWeaponLevel === 'function') Weapons.onWeaponLevel(w, inst);
  } else {
    if (p.weapons.length >= MAX_WEAPONS) return null;
    inst = {
      id, def, level: 1,
      cd: 0, t: 0, phase: 0,
      seed: (w.rng.next() * 0x7fffffff) | 0,
      stats: weaponStats(def, 1),
      data: {},
    };
    p.weapons.push(inst);
    if (typeof Weapons.initWeapon === 'function') Weapons.initWeapon(w, inst);
  }
  refreshStats(w);
  return inst;
}

function addPassive(w, id) {
  const def = PASSIVES[id];
  if (!def) return false;
  const p = w.player;
  const lv = p.passives[id] | 0;
  if (lv >= MAX_PASSIVE_LEVEL) return false;
  if (!lv && Object.keys(p.passives).length >= MAX_PASSIVES) return false;
  p.passives[id] = lv + 1;
  refreshStats(w);
  return true;
}

function applyRelic(w, id) {
  const r = typeof id === 'string' ? RELICS[id] : id;
  if (!r) return false;
  if (w.relics.indexOf(r) < 0) w.relics.push(r);
  refreshStats(w);
  return true;
}

// Derived player fields that are NOT DerivedStats but fall out of them.
function refreshStats(w) {
  const p = w.player;
  const prevMax = p.maxHp;
  const s = recomputeStats(w);
  p.maxHp = Math.max(1, Math.round(100 * s.maxHpMul * (w.actVitality || 1)));
  if (p.maxHp > prevMax) p.hp += p.maxHp - prevMax;
  p.hp = Math.min(p.hp, p.maxHp);
  p.magnet = 40 * s.magnet;
  p.revives = s.revives | 0;
  for (let i = 0; i < p.weapons.length; i++) p.weapons[i].stats = weaponStats(p.weapons[i].def, p.weapons[i].level);
  return s;
}

// ---------------------------------------------------------------------------
// Stage timeline: Chorus windows, the boss, and the end of the run.
// ---------------------------------------------------------------------------
function stepTimeline(w) {
  const st = w.stage;
  if (!st) return;
  const t = w.time;

  const ch = st.chorus || [];
  if (!w.chorus.active) {
    if (w._chorusIdx === undefined) w._chorusIdx = 0;
    while (w._chorusIdx < ch.length && t >= ch[w._chorusIdx]) {
      w._chorusIdx++;
      w.chorus.active = true;
      w.chorus.n = w._chorusIdx;
      w.chorus.until = t + (st.chorusDuration || CHORUS_DURATION);
      w.events.push({ t: 'chorus', phase: 'start', n: w.chorus.n });
      w.events.push({ t: 'shake', amount: 14 });
      if (typeof Conductors.onChorus === 'function') Conductors.onChorus(w, 'start', w.chorus.n);
      break;
    }
  } else if (t >= w.chorus.until) {
    w.chorus.active = false;
    w.events.push({ t: 'chorus', phase: 'end', n: w.chorus.n });
    if (typeof Conductors.onChorus === 'function') Conductors.onChorus(w, 'end', w.chorus.n);
  }

  const dur = st.duration || 480;
  const bossAt = st.bossAt === undefined ? dur : st.bossAt;
  if (st.boss && !w.bossId && t >= bossAt) spawnStageBoss(w);

  if (w.bossId && w.bossDown) { finish(w, 'victory'); return; }
  // Once the Choirmaster is on the field the clock stops mattering: the run
  // ends when it does. Lane C sets bossAt === duration on every boss stage, so
  // ending on the timer would mean the boss fight never happens.
  if (w.bossId > 0) return;
  if (t >= dur) finish(w, 'victory');
}

function spawnStageBoss(w) {
  let b = null;
  if (typeof Boss.spawnBoss === 'function') {
    b = Boss.spawnBoss(w, w.stage.boss, w.player.x, w.player.y - 300);
  } else {
    b = spawnEnemy(w, w.stage.boss, w.player.x, w.player.y - 300, { hp: 1, force: true });
  }
  if (!b) { w.bossId = -1; return; }     // no def yet: do not retry every tick
  b.boss = true;
  w.boss = b;
  w.bossId = b.id;
  w.events.push({ t: 'boss', phase: 1, id: b.id });
  w.events.push({ t: 'shake', amount: 20 });
}

function onPlayerDown(w) {
  const p = w.player;
  if (p.revives > 0) {
    p.revives--;
    p.hp = Math.round(p.maxHp * 0.5);
    p.iframes = 2.5;
    w.events.push({ t: 'say', key: 'revive' });
    w.events.push({ t: 'shake', amount: 20 });
    // A revive is meaningless if the crowd that killed you is still on top of you.
    const out = w.spatialQuery(p.x, p.y, 200, w._scratchA);
    for (let i = 0; i < out.length; i++) {
      const e = out[i];
      const dx = e.x - p.x, dy = e.y - p.y, l = Math.hypot(dx, dy) || 1;
      e.knockX += (dx / l) * 420; e.knockY += (dy / l) * 420;
    }
    return;
  }
  p.hp = 0;
  p.alive = false;
  finish(w, 'dead');
}

function finish(w, result) {
  if (w.over) return;
  w.over = result;
  w.events.push({ t: 'over', result, time: w.time, kills: w.kills, cuts: w.cuts });
}

// ---------------------------------------------------------------------------
function query(w, x, y, r, out) {
  out = out || w._qout;
  out.length = 0;
  const H = w._hash;
  const counts = H.counts, items = H.items;
  const r2 = r * r;

  const x0 = Math.floor((x - r) * INV_CELL), x1 = Math.floor((x + r) * INV_CELL);
  const y0 = Math.floor((y - r) * INV_CELL), y1 = Math.floor((y + r) * INV_CELL);

  // A radius large enough to sweep hundreds of hash cells is cheaper walked
  // flat than gathered cell by cell.
  if ((x1 - x0 + 1) * (y1 - y0 + 1) > MAX_CELL_SPAN * MAX_CELL_SPAN) {
    for (let i = 0; i < H.n; i++) {
      const e = items[i];
      if (!e.alive) continue;
      const dx = e.x - x, dy = e.y - y;
      if (dx * dx + dy * dy <= r2) out.push(e);
    }
    return out;
  }

  const stamp = ++H.stamp;
  for (let cy = y0; cy <= y1; cy++) {
    for (let cx = x0; cx <= x1; cx++) {
      const k = cellKey(cx, cy);
      const a = counts[k], b = counts[k + 1];
      for (let i = a; i < b; i++) {
        const e = items[i];
        // Hash collisions mean a bucket can hold bodies from elsewhere, and the
        // same bucket can be visited twice; the stamp and the distance test
        // between them make both harmless.
        if (e._qs === stamp || !e.alive) continue;
        const dx = e.x - x, dy = e.y - y;
        if (dx * dx + dy * dy > r2) continue;
        e._qs = stamp;
        out.push(e);
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
function makePlayer() {
  return { id: 0, kind: 'player', x: 0, y: 0, vx: 0, vy: 0, hp: 100, maxHp: 100,
           level: 1, xp: 0, xpNext: xpForLevel(1), speed: 62, magnet: 40,
           // 62 is chosen against the enemy table, not picked: it makes a
           // crawler (62) exactly your speed, fenlice (78) and emberlings (70)
           // genuinely faster than you, and the shambler tier (16-34) something
           // you can walk away from but not ignore. At the original 90 the
           // player outran the entire game - a full stage cleared with one kill.
           
           weapons: [], passives: {}, stats: null, regenAcc: 0,
           iframes: 0, dashCd: 0, revives: 0, facing: 1, aimX: 1, aimY: 0, pendingLevels: 0,
           chillT: 0, chillMul: 1, alive: true };
}

const newEnemy = () => ({ id:0,kind:'enemy',x:0,y:0,vx:0,vy:0,hp:1,maxHp:1,def:null,speed:0,dmg:0,
  armour:0,radius:6,mass:1,stringId:0,choir:0,affixes:0,limpUntil:0,knockX:0,knockY:0,
  statuses:newStatus(),elite:false,boss:false,alive:false,anim:0,dying:false,
  st:0,t0:0,t1:0,ax:0,ay:0,sx:0,sy:0,splitGen:0,boosts:0,warpT:0,wantsString:false,str:null,cutBonus:0,_h:0,_qs:-1 });
const resetEnemy = (e) => { e.vx=e.vy=0; e.stringId=0; e.choir=0; e.affixes=0;
  e.limpUntil=0; e.knockX=e.knockY=0; e.elite=false; e.boss=false; e.anim=0; e.dying=false;
  e.st=0; e.t0=0; e.t1=0; e.ax=0; e.ay=0; e.sx=0; e.sy=0; e.splitGen=0; e.mass=1; e.boosts=0; e.warpT=0;
  e.wantsString=false; e.str=null; e.cutBonus=0; e._qs=-1; clearStatus(e.statuses); };

const newProjectile = () => ({ id:0,kind:0,x:0,y:0,vx:0,vy:0,damage:0,pierce:0,life:0,
  ownerWeapon:null,radius:4,cuts:false,hostile:false,hitSet:null,rot:0,scale:1,data:null,alive:false });
const resetProjectile = (p) => { p.pierce=0; p.life=0; p.cuts=false; p.hostile=false; p.rot=0; p.scale=1;
  p.ownerWeapon=null; p.data=null;
  if (p.hitSet) p.hitSet.clear(); else p.hitSet = new Set(); };

const newPickup = () => ({ id:0,x:0,y:0,vx:0,vy:0,kind:'shard',value:1,pull:0,alive:false });
const resetPickup = (p) => { p.vx=p.vy=0; p.pull=0; p.kind='shard'; p.value=1; };

const newConductor = () => ({ id:0,kind:'conductor',x:0,y:0,vx:0,vy:0,hp:1,maxHp:1,def:null,
  choirColour:0,affix:null,affixBits:0,choirSize:0,hover:0,dying:false,alive:false,_h:0,_qs:-1 });
const resetConductor = (c) => { c.vx=c.vy=0; c.hover=0; c.choirSize=0; c.dying=false;
  c.affix=null; c.affixBits=0; c._qs=-1; };

const newHazard = () => ({ id:0,x:0,y:0,r:0,damage:0,tickRate:0,acc:0,life:0,kind:0,
  hostile:false,ownerWeapon:null,alive:false });
const resetHazard = (h) => { h.acc=0; h.hostile=false; h.ownerWeapon=null; };

const newAlly = () => ({ id:0,x:0,y:0,vx:0,vy:0,hp:1,damage:0,life:0,cd:0,def:null,alive:false });
const resetAlly = (a) => { a.vx=a.vy=0; a.cd=0; };

const newString = () => ({ id:0,conductorId:0,enemyId:0,slack:0,taut:0,cut:false,
  colour:0,phase:0,alive:false });
const resetString = (s) => { s.slack=0; s.taut=0; s.cut=false; s.phase=0; };
