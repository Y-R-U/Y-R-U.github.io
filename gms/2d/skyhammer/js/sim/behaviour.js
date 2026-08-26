// One entry per CONTRACTS §5 kind. Adding a kind must never require editing world.js.

import { stepPlayer } from './plane.js';
import { stepAi } from './ai.js';
import { fire, tickCooldowns } from './weapons.js';
import { spawnProj } from './projectiles.js';
import { applyDamage, killEnt } from './damage.js';
import { aabbOverlap } from '../core/math.js';
import { ENEMIES } from '../data/enemies.js';

export const BEHAVIOUR = {};

/** §15.3: a stunned ent stops shooting and moving. Checked before anything else. */
function stunned(e, dt) {
  if (!e.stun) return false;
  e.stun -= dt;
  if (e.stun <= 0) { e.stun = 0; return false; }
  e.t += dt;
  return true;
}

BEHAVIOUR.player = (e, world, dt) => {
  tickCooldowns(e, dt);
  stepPlayer(e, world, dt);
};

BEHAVIOUR.fighter = (e, world, dt) => {
  if (stunned(e, dt)) return;
  e.t += dt;
  if (e.hitFlash > 0) e.hitFlash -= dt;
  tickCooldowns(e, dt);
  stepAi(e, world, dt);
  const behind = world.cam.x - 1600;
  const ahead = world.cam.x + world.cam.vw + 3000;
  if (e.x < behind || e.x > ahead || e.y < world.terrain.heightAt(e.x) - 40) {
    if (e.y < world.terrain.heightAt(e.x)) killEnt(world, e, 2);
    else e.despawn = true;
  }
};

/** Shared by `flak` and by `ground` rows that carry a `shoots` row id. */
function aaFire(e, world, dt, row) {
  const p = world.player;
  if (!p || p.dead || p.landed) return;
  e.gunCool = (e.gunCool || 0) - dt;
  const dx = p.x - e.x, dy = p.y - e.y;
  const d = Math.hypot(dx, dy);
  if (d > row.range || dy < 40) return;
  if (e.gunCool > 0) return;
  e.gunCool = row.rof;

  const sp = row.shellSpeed;
  let t = d / sp;
  for (let k = 0; k < 3; k++) {
    const tx = p.x + p.vx * t, ty = p.y + p.vy * t;
    t = Math.hypot(tx - e.x, ty - e.y) / sp;
  }
  const tx = p.x + p.vx * t, ty = p.y + p.vy * t;
  const burst = row.flakBurst ? 3 : 1;
  for (let i = 0; i < burst; i++) {
    const jitter = world.rng.range(-0.035, 0.035) * (1 + i);
    const a = Math.atan2(ty - e.y, tx - e.x) + jitter;
    spawnProj(world, {
      kind: 'shell', def: row, x: e.x, y: e.y + e.h, team: 1,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      dmg: row.dmg, ttl: Math.min(4, t + 1.2), radius: 6, owner: e,
      blastR: row.flakBurst ? 90 : 0, shake: 0,
    });
  }
  world.push({ e: 'fire', x: e.x, y: e.y + e.h, weapon: 'flak', ang: 1.4 });
}

BEHAVIOUR.flak = (e, world, dt) => {
  if (stunned(e, dt)) return;
  e.t += dt;
  if (e.hitFlash > 0) e.hitFlash -= dt;
  aaFire(e, world, dt, e.def);
};

BEHAVIOUR.ground = (e, world, dt) => {
  if (stunned(e, dt)) return;
  e.t += dt;
  if (e.hitFlash > 0) e.hitFlash -= dt;
  if (e.def.moves) {
    // Never drive off the map: a vehicle that despawns makes its objective
    // permanently unreachable, which the harness caught on a1-09.
    if (e.x > 240) e.x -= e.def.moves * dt;
    e.y = world.terrain.heightAt(e.x) + e.h;
  }
  if (e.def.shoots) {
    const row = ENEMIES[e.def.shoots];
    if (row) aaFire(e, world, dt, row);
  }
};

BEHAVIOUR.balloon = (e, world, dt) => {
  e.t += dt;
  const d = e.def.drift || 18;
  e.y += Math.sin(e.t * 0.7 + e.id) * d * dt * 2;
  e.x += Math.sin(e.t * 0.31 + e.id) * d * 0.5 * dt;
  const p = world.player;
  if (p && !p.dead && aabbOverlap(p.x, p.y, p.w, p.h, e.x, e.y, e.w, e.h)) {
    e.dead = true;
    const money = e.def.money || 35;
    world.stats.money += money;
    world.stats.kills.balloon = (world.stats.kills.balloon || 0) + 1;
    world.stats.collected++;
    for (let i = 0; i < 4; i++) if (p.ammo[i] > 0 || p.loadout[i]) p.ammo[i] += 1;
    world.push({ e: 'pickup', x: e.x, y: e.y, what: 'balloon', amount: money });
    world.push({ e: 'haptic', pattern: 'hit' });
    world.mission.onKill(world, e);
  }
};

BEHAVIOUR.pickup = (e, world, dt) => {
  e.t += dt;
  e.vy -= 900 * dt;
  e.x += e.vx * dt; e.y += e.vy * dt;
  const g = world.terrain.heightAt(e.x) + e.h;
  if (e.y < g) { e.y = g; e.vy = 0; e.vx *= 0.6; }
  if (e.t > 20) e.despawn = true;
  const p = world.player;
  if (p && !p.dead && aabbOverlap(p.x, p.y, p.w, p.h, e.x, e.y, e.w, e.h)) {
    e.dead = true;
    world.stats.money += e.amount | 0;
    world.push({ e: 'pickup', x: e.x, y: e.y, what: e.what, amount: e.amount });
  }
};

BEHAVIOUR.pad = (e, world, dt) => { e.t += dt; };

BEHAVIOUR.boss = (e, world, dt) => {
  if (stunned(e, dt)) return;
  e.t += dt;
  if (e.hitFlash > 0) e.hitFlash -= dt;
  if (e.drift) {
    e.x += e.drift * dt;
    e.y = e.baseY + Math.sin(e.t * 0.5) * 26;
    e.vx = e.drift;
  }
  if (!e.parts) return;
  for (const pt of e.parts) {
    pt.x = e.x + pt.dx;
    pt.y = e.y + pt.dy;
    if (pt.hitFlash > 0) pt.hitFlash -= dt;
    if (pt.dead || !pt.shoots) continue;
    const row = ENEMIES[pt.shoots];
    if (row) aaFire(pt, world, dt, row);
  }
  if (e.parts.every((pt) => pt.dead) && !e.dead) killEnt(world, e, 0);
};

export { fire, applyDamage };
