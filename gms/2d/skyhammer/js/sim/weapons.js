// The only file that reads data/weapons.js and the only entry point that creates projectiles.

import { WEAPONS } from '../data/weapons.js';
import { COMBAT } from '../data/tuning.js';
import { spawnProj } from './projectiles.js';

const NOSE = 0.55;   // fraction of half-length the muzzle sits forward at

function slotOf(ent, weaponId) {
  if (!ent.loadout) return -1;
  return ent.loadout.indexOf(weaponId);
}

export function canFire(ent, weaponId) {
  const w = WEAPONS[weaponId];
  if (!w) return false;
  if (w.slotType === 'main') return (ent.mainCool || 0) <= 0;
  const s = slotOf(ent, weaponId);
  if (s < 0) return false;
  return ent.cool[s] <= 0 && ent.ammo[s] > 0;
}

/** CONTRACTS §7. Returns true if something left the rails. */
export function fire(world, ent, weaponId) {
  const w = WEAPONS[weaponId];
  if (!w || ent.dead || ent.landed) return false;

  const ca = Math.cos(ent.ang), sa = Math.sin(ent.ang);
  const mx = ent.x + ca * ent.w * (1 + NOSE);
  const my = ent.y + sa * ent.w * (1 + NOSE);

  if (w.slotType === 'main') {
    if ((ent.mainCool || 0) > 0) return false;
    ent.mainCool = w.cooldown;
    const spread = (w.spread ?? COMBAT.mainGunSpread) * (ent.spreadMul || 1);
    const a = ent.ang + world.rng.range(-spread, spread);
    const sp = w.speed;
    ent.shotCount = (ent.shotCount || 0) + 1;
    const tracer = ent.shotCount % COMBAT.tracerEvery === 0;
    spawnProj(world, {
      kind: tracer ? 'tracer' : (w.proj === 'plasma' ? 'shell' : w.proj),
      def: w, x: mx, y: my,
      vx: Math.cos(a) * sp + ent.vx * 0.25, vy: Math.sin(a) * sp + ent.vy * 0.25,
      team: ent.team, dmg: w.dmg + (ent.def.gunBonus || 0), ttl: 1.5,
      radius: 5, owner: ent,
    });
    if (ent.team === 0) world.stats.shots++;
    world.push({ e: 'fire', x: mx, y: my, weapon: w.id, ang: ent.ang });
    return true;
  }

  const s = slotOf(ent, weaponId);
  if (s < 0 || ent.cool[s] > 0 || ent.ammo[s] <= 0) return false;
  ent.cool[s] = w.cooldown;
  ent.ammo[s]--;

  const common = {
    def: w, x: mx, y: my, team: ent.team, dmg: w.dmg, owner: ent,
    blastR: w.blastR || 0, shake: w.shake || 0, whiteout: w.whiteout | 0,
    pierce: w.pierce | 0, sub: w.submunitions | 0,
    fuseDelay: w.fuseDelay || 0, returns: w.returns || 0,
    moneyMult: w.moneyMult || 1, stunR: w.stunR || 0, stunTime: w.stunTime || 0,
  };

  if (w.gravity) {
    spawnProj(world, {
      ...common, kind: w.proj === 'cluster' ? 'cluster' : (w.proj === 'nuke' ? 'nuke' : 'bomb'),
      vx: ent.vx * 0.92, vy: ent.vy * 0.92 - 30, ttl: 9, gravity: 1, radius: 7,
    });
  } else {
    const sp = w.speed || 1200;
    spawnProj(world, {
      ...common, kind: 'rocket',
      vx: ca * sp + ent.vx * 0.2, vy: sa * sp + ent.vy * 0.2,
      ttl: w.returns ? 1.1 : 4, returnTtl: 1.1, gravity: 0, radius: 6, homing: w.homing || 0,
    });
  }
  if (ent.team === 0) world.stats.shots++;
  world.push({ e: 'fire', x: mx, y: my, weapon: w.id, ang: ent.ang });
  world.push({ e: 'haptic', pattern: 'hit' });
  return true;
}

export function tickCooldowns(ent, dt) {
  if (ent.mainCool > 0) ent.mainCool -= dt;
  if (ent.cool) for (let i = 0; i < ent.cool.length; i++) if (ent.cool[i] > 0) ent.cool[i] -= dt;
}

export const WEAPON_ROWS = WEAPONS;
