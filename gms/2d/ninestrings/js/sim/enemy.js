// Enemies: spawning, the eight AI kinds, flocking, knockback, contact damage and
// death behaviours. This file runs 400 bodies a frame, so everything here is
// written for the inner loop: no allocation, no closures per entity, no hypot
// where a squared compare will do.
// LANE B-core owns this file.

import { applyDamage, damagePlayer, explode, isLimp } from './damage.js';
import { slowFactor, isStunned } from './status.js';
import { enemyDef, capRoom, PLAYER_RADIUS } from './world.js';
import * as Pickups from './pickup.js';
import * as Strings from './strings.js';

const DT = 1 / 60;

// ---- affixes ---------------------------------------------------------------
// A Conductor stamps its Choir with one of these. They are a bitmask because a
// Chorus stacks several Choirs onto the same body and a horde that visibly
// changes shape over a stage is the whole point of DESIGN 2.3.
export const AFFIX_SPEED    = 1 << 0;   // moves 35% faster
export const AFFIX_ARMOUR   = 1 << 1;   // +4 flat armour
export const AFFIX_BURNING  = 1 << 2;   // contact burns
export const AFFIX_REGEN    = 1 << 3;   // heals 1.8% max hp a second
export const AFFIX_SHIELDED = 1 << 4;   // takes 35% less damage
export const AFFIX_THORNED  = 1 << 5;   // reflects 15% of weapon damage
export const AFFIX_CHILL    = 1 << 6;   // contact chills the player
export const AFFIX_WARPED   = 1 << 7;   // blinks toward the player
export const AFFIX_ALL = (1 << 8) - 1;

// Lane C's stages name ten affixes for these eight bits. `frenzy` and `venom`
// are aliased rather than given bits of their own - see docs/lanes/B-core.md,
// which asks the manager to either trim the list or spend two more bits.
export const AFFIX_NAMES = {
  speed: AFFIX_SPEED, swift: AFFIX_SPEED, frenzy: AFFIX_SPEED,
  armour: AFFIX_ARMOUR, armoured: AFFIX_ARMOUR, armored: AFFIX_ARMOUR,
  burning: AFFIX_BURNING, venom: AFFIX_BURNING,
  regen: AFFIX_REGEN,
  shielded: AFFIX_SHIELDED,
  thorned: AFFIX_THORNED,
  chill: AFFIX_CHILL,
  warped: AFFIX_WARPED,
};
export const AFFIX_LIST = ['swift', 'armoured', 'burning', 'regen', 'shielded', 'thorned', 'chill', 'warped'];

export function affixBit(name) { return AFFIX_NAMES[name] | 0; }

// A severed puppet loses its Choir's gift the instant the thread goes.
export function affixesActive(world, e) {
  if (!e.affixes) return 0;
  if (e.limpUntil > world.time) return 0;
  return e.affixes;
}

const AFFIX_SPEED_MULT = 1.35;
const AFFIX_BURN_CONTACT = 1.6;
const AFFIX_REGEN_RATE = 0.018;      // fraction of maxHp per second
const AFFIX_CHILL_MULT = 0.6;
const AFFIX_CHILL_TIME = 1.5;
const AFFIX_WARP_EVERY = 3.0;
const AFFIX_WARP_DIST = 44;

// ---- tuning ----------------------------------------------------------------
const SEP_RADIUS = 13;
const SEP_FORCE = 46;
const SEP_SAMPLES = 8;
const KNOCK_DECAY = 0.86;
const CONTACT_IFRAMES = 0.5;
const MAX_SPLIT_GEN = 2;

const NEI = [];

// ---- spawning --------------------------------------------------------------
// `scale` is a number (hp multiplier) or { hp, speed, dmg, elite } - the spawn
// director converts bodies it is not allowed to add into scale it is.
export function spawnEnemy(world, defId, x, y, scale) {
  const def = enemyDef(world, defId);
  if (!def) return null;
  // stage.maxAlive is a HARD rule and it is enforced here rather than in the
  // director, so a splitter, a summoner or a future lane cannot walk around it.
  // Only a boss forces its way in.
  if (!(scale && scale.force) && capRoom(world) <= 0) return null;
  const e = world.enemies.alloc();
  if (!e) return null;

  const hpMul   = typeof scale === 'number' ? scale : (scale && scale.hp)    || 1;
  const spdMul  = (scale && scale.speed) || 1;
  const dmgMul  = (scale && scale.dmg)   || 1;
  const elite   = !!(scale && scale.elite) || !!def.elite;
  const sizeMul = (scale && scale.size)  || 1;

  e.id = world.nextId++;
  e.kind = 'enemy';
  e.def = def;
  e.x = x; e.y = y;
  // Bosses are tuned as absolute numbers in js/data/enemies.js; the stage's
  // difficulty ramp is for the horde, and doubling a Choirmaster on top of it
  // would throw away Lane C's tuning.
  const isBoss = !!def.boss || !!(scale && scale.force);
  e.maxHp = Math.max(1, Math.round((def.hp || 10) * hpMul * (isBoss ? 1 : world.hpRamp) * (elite ? 6 : 1)));
  e.hp = e.maxHp;
  e.speed = (def.speed || 30) * spdMul;
  e.dmg = (def.dmg || 5) * dmgMul * (isBoss ? 1 : world.dmgRamp);
  e.armour = def.armour || 0;
  e.radius = (def.radius || 6) * sizeMul * (elite ? 1.5 : 1);
  e.mass = (def.mass || 1) * (elite ? 4 : 1);
  e.elite = elite;
  e.boss = isBoss;
  e.splitGen = (scale && scale.splitGen) || 0;
  e.dying = false;
  e.anim = world.rng.next() * 6;
  // Pre-rolled so B-strings can decide who takes a thread without re-rolling
  // and desyncing the stream.
  e.wantsString = world.rng.chance(def.strungChance || 0);
  e.st = 0; e.t0 = 0; e.t1 = world.rng.range(0, 1.5); e.ax = 0; e.ay = 0;
  e.sx = 0; e.sy = 0;
  e.boosts = 0;
  if (elite) world.eliteAlive++;
  return e;
}

// ---- AI --------------------------------------------------------------------
function seek(e, tx, ty, sp) {
  const dx = tx - e.x, dy = ty - e.y;
  const l = Math.sqrt(dx * dx + dy * dy) || 1;
  e.vx = (dx / l) * sp;
  e.vy = (dy / l) * sp;
}

function aiChase(w, e, sp, px, py) { seek(e, px, py, sp); }

// Wind up in place, then commit to a straight line. The telegraph is the fight:
// a charger you cannot read is just a fast chaser.
function aiCharge(w, e, sp, px, py, d) {
  const P = e.def.aiParams || EMPTY;
  const wind = P.windup || 0.7, dash = P.dash || 0.45, range = P.range || 120;
  if (e.st === 0) {
    seek(e, px, py, sp * 0.55);
    if (d < range) { e.st = 1; e.t0 = wind; }
  } else if (e.st === 1) {
    e.vx = e.vy = 0;
    e.t0 -= DT;
    if (e.t0 <= 0) {
      const dx = px - e.x, dy = py - e.y, l = Math.hypot(dx, dy) || 1;
      e.ax = dx / l; e.ay = dy / l;
      e.st = 2; e.t0 = dash;
    }
  } else {
    e.vx = e.ax * sp * (P.burst || 4);
    e.vy = e.ay * sp * (P.burst || 4);
    e.t0 -= DT;
    if (e.t0 <= 0) { e.st = 0; e.t1 = P.rest || 1.2; }
  }
}

// Spiral in to a held radius, then run the ring. Reads as circling, not orbiting
// a fixed point, because the radius target itself breathes.
function aiOrbit(w, e, sp, px, py, d) {
  const P = e.def.aiParams || EMPTY;
  const r = (P.radius || 70) + Math.sin(e.anim * 0.6) * 12;
  const dx = px - e.x, dy = py - e.y, l = d || 1;
  const rx = dx / l, ry = dy / l;
  const radial = (d - r) * 0.05;
  const dir = (e.id & 1) ? 1 : -1;
  e.vx = (rx * radial + -ry * dir) * sp;
  e.vy = (ry * radial + rx * dir) * sp;
}

function aiRanged(w, e, sp, px, py, d) {
  const P = e.def.aiParams || EMPTY;
  const keep = P.keep || 130;
  if (d > keep * 1.15) seek(e, px, py, sp);
  else if (d < keep * 0.75) { seek(e, px, py, sp); e.vx = -e.vx; e.vy = -e.vy; }
  else { e.vx *= 0.8; e.vy *= 0.8; }

  e.t1 -= DT;
  if (e.t1 <= 0 && d < keep * 1.6) {
    e.t1 = P.cooldown || 2.2;
    fireEnemyShot(w, e, px, py, P);
  }
}

// Sprint in, detonate. onDeath:'explode' does the damage, so a burst enemy the
// player kills at range still costs them nothing - that is the trade.
function aiBurst(w, e, sp, px, py, d) {
  const P = e.def.aiParams || EMPTY;
  seek(e, px, py, sp * 1.15);
  if (d < (P.fuseRange || 26)) {
    if (e.st === 0) { e.st = 1; e.t0 = P.fuse || 0.5; }
    e.vx *= 0.2; e.vy *= 0.2;
  }
  if (e.st === 1) {
    e.t0 -= DT;
    if (e.t0 <= 0) killEnemy(w, e, { source: 'selfDestruct' });
  }
}

// Swarmers weight cohesion toward the player and wander, so a pack arrives as a
// shoal rather than as a line of identical dots.
function aiSwarm(w, e, sp, px, py, d) {
  const wob = Math.sin(e.anim * 3.1 + e.id) * 0.5;
  const dx = px - e.x, dy = py - e.y, l = d || 1;
  const nx = dx / l, ny = dy / l;
  e.vx = (nx - ny * wob) * sp;
  e.vy = (ny + nx * wob) * sp;
}

function aiSplit(w, e, sp, px, py) { seek(e, px, py, sp); }

// Lobs a lingering pool at where the player is heading. Leading the player is
// what makes a spitter a positioning problem instead of a dps check.
function aiSpit(w, e, sp, px, py, d) {
  const P = e.def.aiParams || EMPTY;
  const keep = P.keep || 100;
  if (d > keep * 1.2) seek(e, px, py, sp);
  else { e.vx *= 0.85; e.vy *= 0.85; }
  e.t1 -= DT;
  if (e.t1 <= 0 && d < keep * 1.8) {
    e.t1 = P.cooldown || 3.2;
    const p = w.player;
    const lead = P.lead === undefined ? 0.45 : P.lead;
    spawnHostileHazard(w, px + p.vx * lead, py + p.vy * lead, P);
  }
}

const EMPTY = {};

function fireEnemyShot(w, e, px, py, P) {
  const p = w.projectiles.alloc();
  if (!p) return;
  const dx = px - e.x, dy = py - e.y, l = Math.hypot(dx, dy) || 1;
  const sp = P.shotSpeed || 110;
  p.id = w.nextId++;
  p.x = e.x; p.y = e.y;
  p.vx = (dx / l) * sp; p.vy = (dy / l) * sp;
  p.damage = e.dmg * (P.shotDamage || 1);
  p.life = P.shotLife || 3;
  p.radius = P.shotRadius || 4;
  p.kind = 'enemyShot';
  p.hostile = true;                     // world.js owns hostile projectiles
  p.cuts = false;
  p.pierce = 0;
  p.rot = Math.atan2(p.vy, p.vx);
}

function spawnHostileHazard(w, x, y, P) {
  const h = w.hazards.alloc();
  if (!h) return;
  h.id = w.nextId++;
  h.x = x; h.y = y;
  h.r = P.poolRadius || 26;
  h.damage = P.poolDamage || 6;
  h.tickRate = P.poolTick || 0.5;
  h.acc = 0;
  h.life = P.poolLife || 4;
  h.kind = 'acid';
  h.hostile = true;
}

const AI = {
  chase: aiChase, charge: aiCharge, orbit: aiOrbit, ranged: aiRanged,
  burst: aiBurst, swarm: aiSwarm, split: aiSplit, spit: aiSpit,
};

// ---- the frame -------------------------------------------------------------
export function stepEnemies(world) {
  const p = world.player;
  const px = p.x, py = p.y;
  const now = world.time;
  const staggerParity = world.tick & 1;

  world.enemies.each((e) => {
    if (e.dying) return;
    e.anim += DT;

    const limp = e.limpUntil > now;
    if (!limp && e.affixes && e.stringId === 0 && e.limpUntil !== 0) {
      e.affixes = 0;          // the thread is gone for good; so is the gift
      e.limpUntil = 0;
    }
    const af = limp ? 0 : e.affixes;

    if (af & AFFIX_REGEN && e.hp < e.maxHp) {
      e.hp = Math.min(e.maxHp, e.hp + e.maxHp * AFFIX_REGEN_RATE * DT);
    }

    if (af & AFFIX_WARPED) {
      e.warpT = (e.warpT || 0) - DT;
      if (e.warpT <= 0 && !limp) {
        e.warpT = AFFIX_WARP_EVERY;
        const dx = px - e.x, dy = py - e.y, l = Math.hypot(dx, dy) || 1;
        if (l > AFFIX_WARP_DIST * 1.5) { e.x += (dx / l) * AFFIX_WARP_DIST; e.y += (dy / l) * AFFIX_WARP_DIST; }
      }
    }

    if (limp || isStunned(e)) {
      e.vx = 0; e.vy = 0;
    } else {
      let sp = e.speed * slowFactor(e);
      if (af & AFFIX_SPEED) sp *= AFFIX_SPEED_MULT;
      const dx = px - e.x, dy = py - e.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      const fn = AI[e.def.ai] || aiChase;
      fn(world, e, sp, px, py, d);
    }

    // Separation on alternating frames at double weight: the flock reads
    // identically and costs half the spatial queries.
    if (((e.id & 1) ^ staggerParity) === 0) separate(world, e);
    e.vx += e.sx; e.vy += e.sy;

    e.x += (e.vx + e.knockX) * DT;
    e.y += (e.vy + e.knockY) * DT;
    e.knockX *= KNOCK_DECAY;
    e.knockY *= KNOCK_DECAY;
    if (e.knockX * e.knockX + e.knockY * e.knockY < 0.25) { e.knockX = 0; e.knockY = 0; }

    if (!limp && !e.dying) contact(world, e, af);
  });
}

function separate(world, e) {
  const near = world.spatialQuery(e.x, e.y, SEP_RADIUS, NEI);
  let sx = 0, sy = 0, n = 0;
  for (let i = 0; i < near.length && n < SEP_SAMPLES; i++) {
    const o = near[i];
    if (o === e || o.kind === 'conductor' || o.dying) continue;
    let dx = e.x - o.x, dy = e.y - o.y;
    let d2 = dx * dx + dy * dy;
    if (d2 > SEP_RADIUS * SEP_RADIUS) continue;
    if (d2 < 0.01) {
      // Perfectly stacked bodies need a deterministic nudge or they weld.
      dx = ((e.id & 3) - 1.5) * 0.1; dy = ((o.id & 3) - 1.5) * 0.1; d2 = 0.01;
    }
    const inv = 1 / Math.sqrt(d2);
    const w = (1 - Math.sqrt(d2) / SEP_RADIUS);
    sx += dx * inv * w; sy += dy * inv * w;
    n++;
  }
  if (n === 0) { e.sx *= 0.5; e.sy *= 0.5; return; }
  e.sx = (sx / n) * SEP_FORCE * 2;
  e.sy = (sy / n) * SEP_FORCE * 2;
}

function contact(world, e, af) {
  const p = world.player;
  if (p.iframes > 0 || !p.alive) return;
  const dx = p.x - e.x, dy = p.y - e.y;
  const r = e.radius + PLAYER_RADIUS;
  if (dx * dx + dy * dy > r * r) return;
  let dmg = e.dmg;
  if (af & AFFIX_BURNING) dmg *= AFFIX_BURN_CONTACT;
  if (af & AFFIX_CHILL) {
    p.chillT = AFFIX_CHILL_TIME;
    p.chillMul = AFFIX_CHILL_MULT;
  }
  damagePlayer(world, dmg, e.x, e.y, { iframes: CONTACT_IFRAMES });
}

// ---- death -----------------------------------------------------------------
// Frees are DEFERRED to step 11. An explosion that kills a neighbour mid-`each`
// would otherwise swap the pool under the iterator.
export function killEnemy(world, e, opts) {
  if (!e.alive || e.dying) return;
  e.dying = true;
  e.hp = 0;
  world.kills++;

  world.events.push({ t: 'kill', x: e.x, y: e.y, enemyId: e.id,
                      defId: e.def ? e.def.id : null, elite: !!e.elite });

  if (e.stringId && typeof Strings.onEnemyDeath === 'function') Strings.onEnemyDeath(world, e);

  const od = e.def && e.def.onDeath;
  if (od === 'explode') onExplode(world, e);
  else if (od === 'split') onSplit(world, e);
  else if (od === 'summon') onSummon(world, e);

  drop(world, e);
  world._dead.push(e);
}

function onExplode(world, e) {
  const P = e.def.aiParams || EMPTY;
  explode(world, e.x, e.y, (P.blastRadius || 42) * (e.elite ? 1.6 : 1), e.dmg * (P.blastDamage || 2.5), {
    skip: e, hurtsPlayer: true, playerDamage: e.dmg * (P.blastPlayer || 1.4),
    source: 'blast', knock: 10, enemiesOnly: false,
  });
  world.events.push({ t: 'shake', amount: 8 });
}

function onSplit(world, e) {
  if (e.splitGen >= MAX_SPLIT_GEN) return;
  const P = e.def.aiParams || EMPTY;
  const into = P.splitInto || e.def.id;
  const n = P.splitCount || 2;
  const base = world.rng.next() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const a = base + (i / n) * Math.PI * 2;
    const c = spawnEnemy(world, into, e.x + Math.cos(a) * 8, e.y + Math.sin(a) * 8, {
      hp: (P.splitHp || 0.45), speed: (P.splitSpeed || 1.2), size: 0.7, splitGen: e.splitGen + 1,
    });
    if (c) { c.knockX = Math.cos(a) * 70; c.knockY = Math.sin(a) * 70; }
  }
}

function onSummon(world, e) {
  const P = e.def.aiParams || EMPTY;
  const into = P.summon;
  if (!into) return;
  const n = P.summonCount || 3;
  const base = world.rng.next() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const a = base + (i / n) * Math.PI * 2;
    spawnEnemy(world, into, e.x + Math.cos(a) * 12, e.y + Math.sin(a) * 12, 1);
  }
}

function drop(world, e) {
  if (typeof Pickups.dropFor === 'function') { Pickups.dropFor(world, e); return; }
  // Fallback until B-weapons lands pickup.js: the XP economy must exist for the
  // levelling curve to be testable at all.
  const cut = e.limpUntil > world.time;
  const value = Math.max(1, Math.round((e.def.xp || 1) * (e.elite ? 8 : 1) * (cut ? 2 : 1)));
  const p = world.pickups.alloc();
  if (!p) return;
  p.id = world.nextId++;
  p.x = e.x; p.y = e.y;
  p.kind = 'shard';
  p.value = value;
  p.pull = 0; p.vx = 0; p.vy = 0;
}

// Applies a Choir's gift. Called by B-strings/B-conductor when a thread lands.
export function applyAffix(world, e, bits) {
  e.affixes |= bits;
}

export function clearAffixes(e) { e.affixes = 0; }
