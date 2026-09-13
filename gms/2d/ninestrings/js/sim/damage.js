// The single damage funnel. EVERY source - weapons, projectiles, hazards, burn,
// contact, explosions - resolves here, which is the only reason balance is
// testable from a node script instead of by feel.
// LANE B-core owns this file.

import { killEnemy, AFFIX_ARMOUR, AFFIX_SHIELDED, AFFIX_THORNED, affixesActive } from './enemy.js';

// Severed puppets are the point of the game, so the reward for hitting a thread
// has to be felt in the numbers, not just in the fiction.
export const LIMP_DAMAGE_MULT = 1.75;
const ARMOUR_FLOOR = 0.15;      // armour can never reduce a hit below this fraction
const ARMOUR_K = 30;            // half damage at 30 armour; see applyDamage
const SHIELD_MULT = 0.65;
const ELITE_ARMOUR = 3;
const PLAYER_IFRAMES = 0.5;

export function isLimp(world, e) {
  return e.limpUntil > world.time;
}

function effectiveArmour(world, e) {
  let a = e.armour || 0;
  if (e.elite) a += ELITE_ARMOUR;
  const af = affixesActive(world, e);
  if (af & AFFIX_ARMOUR) a += 4;
  return a;
}

// opts: { weaponId, source, crit, noCrit, ignoreArmour, quiet,
//         knock, kx, ky, x, y }
export function applyDamage(world, target, amount, opts) {
  if (!target || !target.alive || target.dying || amount <= 0) return 0;
  if (world.over) return 0;

  const stats = world.player.stats;
  const o = opts || EMPTY;
  const isCond = target.kind === 'conductor';

  let dmg = amount;
  let crit = false;
  if (o.crit === true) crit = true;
  else if (!o.noCrit && stats && world.rng.chance(Math.min(0.95, stats.crit))) crit = true;
  if (crit) dmg *= stats ? stats.critMult : 2;

  if (!isCond) {
    if (isLimp(world, target)) dmg *= LIMP_DAMAGE_MULT;
    else {
      const af = affixesActive(world, target);
      if (af & AFFIX_SHIELDED) dmg *= SHIELD_MULT;
    }
    if (!o.ignoreArmour) {
      const a = effectiveArmour(world, target);
      // Armour is a PERCENTAGE, derived from its flat rating - not a flat
      // subtraction. Flat armour is quietly lethal to this genre: weapon hits
      // run from 6 to 46 damage, so an Act IV armour of 26 turned every
      // multi-hit weapon into 15% chip damage and a 6000hp throneguard became
      // literally unkillable. The curve keeps the data's relative ordering
      // (4 -> 12%, 8 -> 21%, 26 -> 46%) while never making a weapon useless.
      if (a > 0) dmg *= Math.max(ARMOUR_FLOOR, 1 - a / (a + ARMOUR_K));
    }
  }

  dmg = Math.max(1, Math.round(dmg));
  target.hp -= dmg;

  if (!isCond) {
    const knock = o.knock || 0;
    if (knock > 0) {
      const mass = (target.def && target.def.mass) || 1;
      let kx = o.kx, ky = o.ky;
      if (kx === undefined || (kx === 0 && ky === 0)) {
        kx = target.x - world.player.x; ky = target.y - world.player.y;
      }
      const l = Math.hypot(kx, ky) || 1;
      const imp = (knock * 60) / Math.max(0.25, mass) * (target.elite ? 0.5 : 1);
      target.knockX += (kx / l) * imp;
      target.knockY += (ky / l) * imp;
    }
  }

  // Thorns reflect weapon hits only. Reflecting a burn tick would turn a
  // damage-over-time into an instant player death.
  if (!isCond && o.source !== 'burn' && o.source !== 'shock' && o.source !== 'hazard') {
    if (affixesActive(world, target) & AFFIX_THORNED) {
      damagePlayer(world, Math.max(1, dmg * 0.15), target.x, target.y, { iframes: 0.12 });
    }
  }

  if (!o.quiet) {
    world.events.push({ t: 'hit', x: o.x !== undefined ? o.x : target.x, y: o.y !== undefined ? o.y : target.y,
                        dmg, crit, enemyId: target.id, weaponId: o.weaponId || null });
  }
  world.damageDealt += dmg;

  if (target.hp <= 0) {
    if (isCond) killConductor(world, target, o);
    else killEnemy(world, target, o);
  }
  return dmg;
}

const EMPTY = {};

// Conductor death is the game's big moment. The shockwave and the choir snap are
// B-strings' work; all we do here is route it and make sure the event fires once.
export function killConductor(world, c, opts) {
  if (!c.alive || c.dying) return;
  c.dying = true;
  c.hp = 0;
  world.conductorsKilled++;
  world.events.push({ t: 'conductorDown', x: c.x, y: c.y, conductorId: c.id,
                      colour: c.choirColour, choir: c.choirSize | 0 });
  // Every thread in the Choir snaps at once. Routed through a world hook rather
  // than importing strings.js, which would close a damage->strings->enemy->
  // damage cycle for no benefit.
  if (world._snapChoir) world._snapChoir(world, c.id);
  world._deadConductors.push(c);
}

export function damagePlayer(world, amount, x, y, opts) {
  const p = world.player;
  if (!p.alive || world.over || p.iframes > 0 || amount <= 0) return 0;

  const stats = p.stats;
  let dmg = amount;
  if (stats && stats.armour > 0) dmg = Math.max(dmg * 0.2, dmg - stats.armour);
  dmg = Math.max(1, Math.round(dmg));

  p.hp -= dmg;
  p.iframes = (opts && opts.iframes) || PLAYER_IFRAMES;

  const dead = p.hp <= 0;
  world.events.push({ t: 'playerHurt', x: x !== undefined ? x : p.x, y: y !== undefined ? y : p.y, dmg, dead });
  if (dead) world.onPlayerDown();
  return dmg;
}

// Radial hit used by explosions, bombs and burst enemies. Goes through
// applyDamage per target so armour, crit and limp stay in one place.
export function explode(world, x, y, radius, damage, opts) {
  // Chain reactions: an explosion that kills a bomber triggers another explode
  // from inside this loop, so each level of recursion needs its own result
  // array or the outer walk reads the inner one's contents.
  const depth = Math.min(world._qdepth++, world._qstack.length - 1);
  const out = world.spatialQuery(x, y, radius, world._qstack[depth]);
  const o = opts || EMPTY;
  for (let i = 0; i < out.length; i++) {
    const e = out[i];
    if (o.skip === e) continue;
    if (o.enemiesOnly && e.kind === 'conductor') continue;
    const d = Math.hypot(e.x - x, e.y - y);
    const falloff = o.flat ? 1 : Math.max(0.35, 1 - d / radius);
    applyDamage(world, e, damage * falloff, {
      weaponId: o.weaponId, source: o.source || 'blast', noCrit: o.noCrit,
      knock: o.knock !== undefined ? o.knock : 6, kx: e.x - x, ky: e.y - y, x, y,
    });
  }
  if (o.hurtsPlayer) {
    const p = world.player;
    if (Math.hypot(p.x - x, p.y - y) < radius) damagePlayer(world, o.playerDamage || damage * 0.5, x, y);
  }
  const n = out.length;
  world._qdepth--;
  return n;
}
