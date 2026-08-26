// The flight model (CONTRACTS §3b) and player-aeroplane construction. No DOM.

import { PHYS, CTRL } from '../data/tuning.js';
import { PLANES, UPGRADES } from '../data/planes.js';
import { WEAPONS } from '../data/weapons.js';
import { clamp, turnToward, wrapAngle } from '../core/math.js';

const SPEED_EASE = 0.9;     // 1/s toward cruise. Deliberately below gravAssist/(cruise-stall)
const FUEL = 600;           // seconds. See ENGINE_NOTES D-E2.
const HALF_PI = Math.PI / 2;

export function effectivePlaneDef(planeId, upgrades = {}) {
  const base = PLANES.find((p) => p.id === planeId) || PLANES[0];
  const lv = (id) => upgrades[id] | 0;
  const d = { ...base };
  const u = (id) => UPGRADES.find((x) => x.id === id);
  d.hp = base.hp + u('armor').step(lv('armor'));
  d.cruise = base.cruise + u('speed').step(lv('speed'));
  d.vmax = base.vmax + u('speed').step(lv('speed'));
  d.turnRate = base.turnRate + u('turn').step(lv('turn'));
  d.gunBonus = u('gun').step(lv('gun'));
  d.ammoBonus = u('ammo').step(lv('ammo'));
  d.landSpeed = base.landSpeed ?? Math.round(base.stall * 1.50);
  return d;
}

const p0 = (save, i) => (save.loadout && save.loadout[i]) || null;

export function syncSlots(p) {
  for (let i = 0; i < 4; i++) {
    const s = p.slots[i];
    s.id = p.loadout[i] || null;
    s.ammo = p.ammo[i];
    s.cd = Math.max(0, p.cool[i]);
  }
}

export function makePlayer(world, save) {
  const def = effectivePlaneDef(save.planeId, save.upgrades);
  const p = {
    id: world.nextId(), kind: 'player', def, team: 0,
    x: 240, y: 620, vx: def.cruise, vy: 0, ang: 0, speed: def.cruise,
    hp: def.hp, hpMax: def.hp,
    w: def.len / 2, h: 15, r: def.len * 0.55,
    dead: false, t: 0, ai: null, parts: null,
    want: 0, hasWant: false, stalling: false, fuel: FUEL, lowFuelFired: false,
    mainCool: 0, cool: [0, 0, 0, 0], ammo: [0, 0, 0, 0],
    loadout: save.loadout.slice(0, 4),
    landed: false, script: null, invuln: 0, hitFlash: 0,
    fuelMax: FUEL,
    // js/ui/hud.js reads this shape; the sim keeps using the flat arrays above.
    slots: [0, 1, 2, 3].map((i) => ({ id: p0(save, i), ammo: 0, cd: 0, cdMax: 1 })),
  };
  for (let i = 0; i < 4; i++) {
    const w = WEAPONS[p.loadout[i]];
    p.ammo[i] = w ? Math.round((w.ammo || 0) + def.ammoBonus) : 0;
    p.slots[i].cdMax = w ? w.cooldown : 1;
  }
  syncSlots(p);
  return p;
}

/**
 * The one flight integrator. Player and enemy aeroplanes both use it so a dogfight
 * is symmetric. `want` is null to hold heading.
 */
export function flyToward(e, want, dt, cfg) {
  const cruise = cfg.cruise, stall = cfg.stall, vmax = cfg.vmax;
  let rate = cfg.turnRate;
  if (e.y > PHYS.ceiling) rate *= PHYS.ceilingBite;

  if (e.stalling) {
    e.ang = turnToward(e.ang, -HALF_PI, PHYS.stallDrop * dt);
  } else if (want !== null && want !== undefined) {
    e.ang = turnToward(e.ang, want, rate * dt);
  }

  e.speed += (cruise - e.speed) * SPEED_EASE * dt;
  e.speed += -Math.sin(e.ang) * PHYS.gravAssist * dt;
  if (e.speed < stall) { e.speed = stall; e.stalling = true; }
  else if (e.speed > stall * 1.12) e.stalling = false;
  if (e.speed > vmax) e.speed = vmax;

  e.vx = Math.cos(e.ang) * e.speed;
  e.vy = Math.sin(e.ang) * e.speed;
  e.x += e.vx * dt;
  e.y += e.vy * dt;
}

export function stepPlayer(p, world, dt) {
  p.t += dt;
  syncSlots(p);
  if (p.invuln > 0) p.invuln -= dt;
  if (p.hitFlash > 0) p.hitFlash -= dt;

  if (p.script) { world.landing.stepScript(p, world, dt); return; }
  if (p.landed) return;

  // --- relative point-at-finger (CONTRACTS §3b) ---
  // Screen px in, angle out. The y flip is because screen y is down and world y is up.
  const a = world.stick;
  if (a.active) {
    const dx = a.sx - a.ax, dy = a.ay - a.sy;
    if (dx * dx + dy * dy > CTRL.deadPx * CTRL.deadPx) p.want = Math.atan2(dy, dx);
    p.hasWant = true;
  }

  // Near a landing pad the engine comes back to idle, otherwise nothing under
  // cruise is reachable in level flight and CONTRACTS §9 could never trigger.
  if (!p._cfg) p._cfg = { ...p.def };
  p._cfg.cruise = world.landing.nearPad(p) ? p.def.landSpeed * 0.8 : p.def.cruise;
  p._cfg.stall = p.def.stall; p._cfg.vmax = p.def.vmax; p._cfg.turnRate = p.def.turnRate;
  flyToward(p, p.hasWant ? p.want : null, dt, p._cfg);

  p.fuel -= dt;
  if (!p.lowFuelFired && p.fuel < FUEL * 0.2) {
    p.lowFuelFired = true;
    world.push({ e: 'ui', what: 'lowfuel' });
  }
  if (p.fuel <= 0 && !world.over) { world.over = 'bingo'; }

  // --- bounds ---
  if (p.x < 40) { p.x = 40; if (p.vx < 0) p.ang = wrapAngle(Math.PI - p.ang); }
  if (p.x > world.level.length - 40) {
    p.x = world.level.length - 40;
    if (p.vx > 0) p.ang = wrapAngle(Math.PI - p.ang);
  }
  const hardTop = PHYS.ceiling + 420;
  if (p.y > hardTop) { p.y = hardTop; if (p.vy > 0) p.ang = -Math.abs(p.ang || 0.4); }

  const ground = world.terrain.heightAt(p.x);
  if (p.y - 12 <= ground) {
    p.y = ground + 12;
    world.crashPlayer();
  }
}

export function refuel(p) {
  p.fuel = FUEL;
  p.lowFuelFired = false;
  p.hp = p.hpMax;
  for (let i = 0; i < 4; i++) {
    const w = WEAPONS[p.loadout[i]];
    p.ammo[i] = w ? Math.round((w.ammo || 0) + p.def.ammoBonus) : 0;
  }
}

export const FUEL_MAX = FUEL;
