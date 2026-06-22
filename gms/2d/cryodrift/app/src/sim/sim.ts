import { FEEL } from '../config/feel';
import {
  PLAYER,
  UPGRADES,
  WAVE,
  waveComposition,
  type EnemyDef,
  type EnemyType,
} from '../config/balance';
import type { InputState } from '../input/InputState';
import { dist2 } from './Vec2';
import { rememberPrev, stepBody, type MoveCmd, type MoveParams } from './movement';
import { flowAt } from './flow';
import type { World } from './World';
import type { Enemy, Pickup } from './entities';

const ARENA = WAVE.arenaRadius;
const flowTmp = { x: 0, y: 0 };

/** Effective membrane cap including nutrient growth. */
export function maxMembrane(world: World): number {
  return world.stats.maxMembrane + world.player.growth * PLAYER.growthHpScale;
}

function applyFlow(b: { pos: { x: number; y: number }; vel: { x: number; y: number } }, factor: number, t: number, dt: number): void {
  flowAt(b.pos.x, b.pos.y, t, flowTmp);
  b.vel.x += flowTmp.x * factor * dt;
  b.vel.y += flowTmp.y * factor * dt;
}

/** Reflect a body off the dish wall. Returns penetration depth (>0 if it hit). */
function keepInArena(b: { pos: { x: number; y: number }; vel: { x: number; y: number }; radius: number }): number {
  const d = Math.hypot(b.pos.x, b.pos.y);
  const limit = ARENA - b.radius;
  if (d <= limit || d < 1e-3) return 0;
  const nx = b.pos.x / d;
  const ny = b.pos.y / d;
  const pen = d - limit;
  b.pos.x = nx * limit;
  b.pos.y = ny * limit;
  const vn = b.vel.x * nx + b.vel.y * ny;
  if (vn > 0) {
    b.vel.x -= (1 + WAVE.wallBounce) * vn * nx;
    b.vel.y -= (1 + WAVE.wallBounce) * vn * ny;
  }
  return pen;
}

function enemyParams(def: EnemyDef): MoveParams {
  return {
    thrust: def.thrust,
    drag: def.drag,
    maxSpeed: def.maxSpeed,
    capSoftness: 0.2,
    boostThrustMult: 1.6,
    boostMaxMult: 1.5,
    turnResponse: 0.12,
  };
}

export function stepWorld(world: World, input: InputState, dt: number): void {
  if (world.demo) {
    world.time += dt;
    updateAntibodies(world, dt);
    return;
  }
  if (world.state === 'dead' || world.pendingUpgrade) return;
  world.time += dt;
  world.runTime += dt;

  updatePlayer(world, input, dt);
  updateEnemies(world, dt);
  updateProjectiles(world, dt);
  updatePickups(world, dt);
  updateAntibodies(world, dt);
  collide(world);
  hazards(world, dt);
  waves(world, dt);

  if (world.player.membrane <= 0 && world.state === 'playing') {
    world.state = 'dead';
    world.emit({ type: 'death', x: world.player.pos.x, y: world.player.pos.y });
  }
}

/* ───────────────────────── player ───────────────────────── */

const cmd: MoveCmd = { thrustX: 0, thrustY: 0, throttle: 0, boost: false };

function updatePlayer(world: World, input: InputState, dt: number): void {
  const p = world.player;
  const s = world.stats;

  p.radius = PLAYER.baseRadius + p.growth;
  const gFrac = p.growth / (PLAYER.radiusCap - PLAYER.baseRadius);
  const sluggish = 1 - PLAYER.growthSluggish * gFrac;

  const boosting = input.boost && p.atp > 0;
  const params: MoveParams = {
    thrust: FEEL.thrust * s.thrustMul * sluggish,
    drag: Math.min(0.97, Math.max(0.05, FEEL.drag * s.dragMul)),
    maxSpeed: FEEL.maxSpeed * s.maxSpeedMul * sluggish,
    capSoftness: FEEL.capSoftness,
    boostThrustMult: FEEL.boostThrustMult,
    boostMaxMult: s.boostMaxMul,
    turnResponse: FEEL.turnResponse,
  };

  cmd.thrustX = input.thrustX;
  cmd.thrustY = input.thrustY;
  cmd.throttle = input.throttle;
  cmd.boost = boosting;

  rememberPrev(p);
  applyFlow(p, 1, world.time, dt);
  stepBody(p, cmd, params, dt);
  if (keepInArena(p) > 0 && p.invuln <= 0) {
    hurtPlayer(world, WAVE.wallDamage, p.pos.x, p.pos.y);
  }

  if (boosting) p.atp = Math.max(0, p.atp - s.boostAtpPerSec * dt);

  // fire
  p.fireCd -= dt;
  if (input.firing && p.fireCd <= 0 && (input.aimX !== 0 || input.aimY !== 0)) {
    const base = Math.atan2(input.aimY, input.aimX);
    const n = s.splitShot;
    for (let i = 0; i < n; i++) {
      const ang = base + (i - (n - 1) / 2) * PLAYER.splitSpread;
      const dx = Math.cos(ang);
      const dy = Math.sin(ang);
      world.spawnProjectile(
        0,
        p.pos.x + dx * (p.radius + 4),
        p.pos.y + dy * (p.radius + 4),
        dx * s.toxinSpeed + p.vel.x * PLAYER.toxinInheritVel,
        dy * s.toxinSpeed + p.vel.y * PLAYER.toxinInheritVel,
        s.toxinDamage,
        PLAYER.toxinLifetime,
        s.toxinRadius,
      );
    }
    p.fireCd = s.fireInterval;
    world.emit({ type: 'fire', x: p.pos.x, y: p.pos.y });
  }

  // special: context-sensitive engulf / lysis (edge-triggered)
  p.lysisCd -= dt;
  const pressed = input.special && !p.prevSpecial;
  p.prevSpecial = input.special;
  if (pressed) doSpecial(world);

  // regen
  p.sinceDamage += dt;
  if (p.sinceDamage > PLAYER.regenDelay) {
    p.membrane = Math.min(maxMembrane(world), p.membrane + s.regenRate * dt);
  }
  p.atp = Math.min(s.maxAtp, p.atp + s.atpRegen * dt);
  p.invuln = Math.max(0, p.invuln - dt);
}

function doSpecial(world: World): void {
  const p = world.player;
  const s = world.stats;

  // engulf: nearest weakened enemy within reach
  let best: Enemy | null = null;
  let bestD = Infinity;
  for (const e of world.enemies.items) {
    if (!e.alive || e.def.boss) continue;
    if (e.hp / e.maxHp > PLAYER.engulfHpFrac) continue;
    const reach = p.radius + e.radius + PLAYER.engulfReach;
    const d2 = dist2(p.pos, e.pos);
    if (d2 <= reach * reach && d2 < bestD) {
      bestD = d2;
      best = e;
    }
  }
  if (best && p.atp >= PLAYER.engulfAtpCost) {
    p.atp -= PLAYER.engulfAtpCost;
    p.membrane = Math.min(maxMembrane(world), p.membrane + PLAYER.engulfHeal);
    world.emit({ type: 'engulf', x: best.pos.x, y: best.pos.y });
    killEnemy(world, best, false);
    return;
  }

  // else lysis burst
  if (p.lysisCd <= 0 && p.atp >= PLAYER.lysisAtpCost) {
    p.atp -= PLAYER.lysisAtpCost;
    p.lysisCd = PLAYER.lysisCooldown;
    const r = s.lysisRadius;
    world.emit({ type: 'lysis', x: p.pos.x, y: p.pos.y, r });
    for (const e of world.enemies.items) {
      if (!e.alive) continue;
      const d2 = dist2(p.pos, e.pos);
      if (d2 <= (r + e.radius) * (r + e.radius)) {
        e.hp -= s.lysisDamage;
        e.hitFlash = 1;
        if (e.hp <= 0) killEnemy(world, e, true);
      }
    }
  }
}

export function hurtPlayer(world: World, dmg: number, x: number, y: number): void {
  const p = world.player;
  if (p.invuln > 0 || world.state !== 'playing') return;
  p.membrane -= dmg;
  p.sinceDamage = 0;
  p.invuln = PLAYER.contactInvuln;
  world.streak = 0;
  world.emit({ type: 'playerHit', x, y, n: dmg });
}

/* ───────────────────────── enemies ───────────────────────── */

function updateEnemies(world: World, dt: number): void {
  const p = world.player;
  for (const e of world.enemies.items) {
    if (!e.alive) continue;
    e.hitFlash = Math.max(0, e.hitFlash - dt * 4);
    e.contactCd -= dt;
    e.fireCd -= dt;

    const dx = p.pos.x - e.pos.x;
    const dy = p.pos.y - e.pos.y;
    const d = Math.hypot(dx, dy) || 1;
    const ux = dx / d;
    const uy = dy / d;

    cmd.thrustX = 0;
    cmd.thrustY = 0;
    cmd.throttle = 0;
    cmd.boost = false;

    switch (e.type) {
      case 'seeker':
        cmd.thrustX = ux;
        cmd.thrustY = uy;
        cmd.throttle = 1;
        break;

      case 'macrophage':
        cmd.thrustX = ux;
        cmd.thrustY = uy;
        cmd.throttle = 0.9;
        break;

      case 'drifter': {
        e.wander += world.rng.range(-1, 1) * 2.4 * dt;
        let wx = Math.cos(e.wander);
        let wy = Math.sin(e.wander);
        if (d < 220) {
          wx -= ux * 0.8;
          wy -= uy * 0.8;
        }
        const wl = Math.hypot(wx, wy) || 1;
        cmd.thrustX = wx / wl;
        cmd.thrustY = wy / wl;
        cmd.throttle = 0.55;
        if (d < (e.def.range ?? 0) && e.fireCd <= 0) enemyFire(world, e, ux, uy);
        break;
      }

      case 'orbiter': {
        const orbit = e.def.orbitRadius ?? 220;
        const radial = (d - orbit) / orbit; // >0 too far, <0 too close
        const tx = -uy * e.orbitDir;
        const ty = ux * e.orbitDir;
        let mx = tx + ux * radial * 1.4;
        let my = ty + uy * radial * 1.4;
        const ml = Math.hypot(mx, my) || 1;
        cmd.thrustX = mx / ml;
        cmd.thrustY = my / ml;
        cmd.throttle = 1;
        if (d < (e.def.range ?? 0) && e.fireCd <= 0) enemyFire(world, e, ux, uy);
        break;
      }

      case 'burster': {
        cmd.thrustX = ux;
        cmd.thrustY = uy;
        cmd.throttle = 1;
        cmd.boost = d < 360;
        const trigger = e.def.trigger ?? 80;
        if (e.fuse === 0 && d < trigger) e.fuse = e.def.fuse ?? 0.4;
        if (e.fuse > 0) {
          e.fuse -= dt;
          if (e.fuse <= 0) {
            burst(world, e);
            continue;
          }
        }
        break;
      }
    }

    rememberPrev(e);
    applyFlow(e, 0.6, world.time, dt);
    stepBody(e, cmd, enemyParams(e.def), dt);
    keepInArena(e);
  }
}

function enemyFire(world: World, e: Enemy, ux: number, uy: number): void {
  const def = e.def;
  e.fireCd = def.fireInterval ?? 1.2;
  const sp = def.projSpeed ?? 360;
  world.spawnProjectile(
    1,
    e.pos.x + ux * (e.radius + 3),
    e.pos.y + uy * (e.radius + 3),
    ux * sp,
    uy * sp,
    def.projDamage ?? 6,
    2.6,
    5,
  );
  world.emit({ type: 'enemyFire', x: e.pos.x, y: e.pos.y });
}

function burst(world: World, e: Enemy): void {
  const r = e.def.explodeRadius ?? 110;
  world.emit({ type: 'explosion', x: e.pos.x, y: e.pos.y, r, color: e.def.tint });
  const p = world.player;
  if (dist2(p.pos, e.pos) <= (r + p.radius) * (r + p.radius)) {
    hurtPlayer(world, e.def.explodeDamage ?? 30, e.pos.x, e.pos.y);
  }
  world.enemies.release(e);
}

function killEnemy(world: World, e: Enemy, score: boolean): void {
  if (score) {
    world.score += Math.round(e.def.score * (1 + world.streak * 0.02));
    world.streak++;
    world.bestStreak = Math.max(world.bestStreak, world.streak);
  }
  world.kills++;
  world.emit({ type: 'kill', x: e.pos.x, y: e.pos.y, color: e.def.tint, r: e.radius });

  // drops
  const drops = e.def.boss ? 8 : 1 + (world.rng.bool(0.3) ? 1 : 0);
  for (let i = 0; i < drops; i++) world.spawnPickup('nutrient', e.pos.x, e.pos.y, 1);
  if (e.def.dropOrganelle) world.spawnPickup('organelle', e.pos.x, e.pos.y, 1);

  world.enemies.release(e);
}

/* ───────────────────────── projectiles ───────────────────────── */

function updateProjectiles(world: World, dt: number): void {
  for (const pr of world.projectiles.items) {
    if (!pr.alive) continue;
    rememberPrev(pr);
    applyFlow(pr, 0.3, world.time, dt);
    pr.pos.x += pr.vel.x * dt;
    pr.pos.y += pr.vel.y * dt;
    pr.heading = Math.atan2(pr.vel.y, pr.vel.x);
    pr.life -= dt;
    if (pr.life <= 0 || pr.pos.x * pr.pos.x + pr.pos.y * pr.pos.y > ARENA * ARENA) {
      world.projectiles.release(pr);
    }
  }
}

/* ───────────────────────── pickups ───────────────────────── */

function updatePickups(world: World, dt: number): void {
  const p = world.player;
  for (const pk of world.pickups.items) {
    if (!pk.alive) continue;
    rememberPrev(pk);
    pk.wobble += dt * 4;
    pk.life -= dt;
    if (pk.life <= 0) {
      world.pickups.release(pk);
      continue;
    }
    const dx = p.pos.x - pk.pos.x;
    const dy = p.pos.y - pk.pos.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d < world.stats.magnetRange) {
      const pull = (1 - d / world.stats.magnetRange) * 900;
      pk.vel.x += (dx / d) * pull * dt;
      pk.vel.y += (dy / d) * pull * dt;
    }
    applyFlow(pk, 0.5, world.time, dt);
    pk.vel.x *= Math.pow(0.2, dt);
    pk.vel.y *= Math.pow(0.2, dt);
    pk.pos.x += pk.vel.x * dt;
    pk.pos.y += pk.vel.y * dt;

    if (d < p.radius + pk.radius + 4) collect(world, pk);
  }
}

function collect(world: World, pk: Pickup): void {
  const p = world.player;
  if (pk.kind === 'nutrient') {
    p.growth = Math.min(PLAYER.radiusCap - PLAYER.baseRadius, p.growth + PLAYER.growthPerNutrient);
    p.membrane = Math.min(maxMembrane(world), p.membrane + 4);
    world.score += 5;
    world.emit({ type: 'absorb', x: pk.pos.x, y: pk.pos.y });
  } else {
    p.atp = world.stats.maxAtp;
    p.membrane = Math.min(maxMembrane(world), p.membrane + 20);
    applyRandomUpgrade(world);
    world.emit({ type: 'organelle', x: pk.pos.x, y: pk.pos.y });
  }
  world.pickups.release(pk);
}

/* ───────────────────────── antibodies ───────────────────────── */

function updateAntibodies(world: World, dt: number): void {
  for (const ab of world.antibodies.items) {
    if (!ab.alive) continue;
    rememberPrev(ab);
    applyFlow(ab, 1.2, world.time, dt);
    ab.vel.x *= Math.pow(0.85, dt);
    ab.vel.y *= Math.pow(0.85, dt);
    ab.pos.x += ab.vel.x * dt;
    ab.pos.y += ab.vel.y * dt;
    ab.heading += ab.spin * dt;
    keepInArena(ab);
  }
}

/* ───────────────────────── collisions ───────────────────────── */

function collide(world: World): void {
  const p = world.player;

  // player toxin vs enemies
  for (const pr of world.projectiles.items) {
    if (!pr.alive || pr.team !== 0) continue;
    for (const e of world.enemies.items) {
      if (!e.alive) continue;
      const rr = pr.radius + e.radius;
      if (dist2(pr.pos, e.pos) <= rr * rr) {
        e.hp -= pr.damage;
        e.hitFlash = 1;
        if (world.stats.lifesteal > 0) {
          p.membrane = Math.min(maxMembrane(world), p.membrane + pr.damage * world.stats.lifesteal);
        }
        world.emit({ type: 'hit', x: pr.pos.x, y: pr.pos.y, color: e.def.tint });
        world.projectiles.release(pr);
        if (e.hp <= 0) killEnemy(world, e, true);
        break;
      }
    }
  }

  // enemy projectiles vs player
  for (const pr of world.projectiles.items) {
    if (!pr.alive || pr.team !== 1) continue;
    const rr = pr.radius + p.radius;
    if (dist2(pr.pos, p.pos) <= rr * rr) {
      hurtPlayer(world, pr.damage, pr.pos.x, pr.pos.y);
      world.projectiles.release(pr);
    }
  }

  // enemy bodies vs player (contact)
  for (const e of world.enemies.items) {
    if (!e.alive || e.def.contact <= 0) continue;
    const rr = e.radius + p.radius;
    if (e.contactCd <= 0 && dist2(e.pos, p.pos) <= rr * rr) {
      hurtPlayer(world, e.def.contact, p.pos.x, p.pos.y);
      e.contactCd = 0.6;
      // soft separation
      const dx = e.pos.x - p.pos.x;
      const dy = e.pos.y - p.pos.y;
      const d = Math.hypot(dx, dy) || 1;
      e.vel.x += (dx / d) * 120;
      e.vel.y += (dy / d) * 120;
    }
  }

  // antibodies vs player (solid + chip)
  for (const ab of world.antibodies.items) {
    if (!ab.alive) continue;
    const rr = ab.radius + p.radius;
    const d2 = dist2(ab.pos, p.pos);
    if (d2 <= rr * rr) {
      const d = Math.sqrt(d2) || 1;
      const nx = (p.pos.x - ab.pos.x) / d;
      const ny = (p.pos.y - ab.pos.y) / d;
      p.pos.x = ab.pos.x + nx * rr;
      p.pos.y = ab.pos.y + ny * rr;
      const vn = p.vel.x * nx + p.vel.y * ny;
      if (vn < 0) {
        p.vel.x -= 1.4 * vn * nx;
        p.vel.y -= 1.4 * vn * ny;
      }
      if (p.invuln <= 0) hurtPlayer(world, 5, p.pos.x, p.pos.y);
    }
  }
}

/* ───────────────────────── hazards ───────────────────────── */

function hazards(world: World, dt: number): void {
  const p = world.player;
  for (const z of world.phZones) {
    z.phase += dt;
    const rr = z.radius + p.radius * 0.5;
    if (dist2(z, p.pos) <= rr * rr) {
      p.membrane -= z.dps * dt;
      p.sinceDamage = 0;
    }
  }
}

/* ───────────────────────── waves ───────────────────────── */

function waves(world: World, dt: number): void {
  world.phaseTimer -= dt;
  switch (world.phase) {
    case 'breather':
      if (world.phaseTimer <= 0) startWave(world);
      break;
    case 'spawning':
      world.spawnCd -= dt;
      if (world.spawnCd <= 0) {
        const next = world.spawnQueue.pop();
        if (next) {
          spawnAtEdge(world, next);
          world.spawnCd = WAVE.spawnInterval;
        } else {
          world.phase = 'fighting';
        }
      }
      break;
    case 'fighting':
      if (world.enemies.aliveCount === 0) {
        world.phase = 'cleared';
        world.score += 50 * world.wave;
        world.pendingUpgrade = true;
        world.upgradeChoices = pickUpgrades(world, 3);
        world.emit({ type: 'waveClear', n: world.wave });
      }
      break;
    case 'cleared':
      break; // waiting for UI -> applyUpgrade()
  }
}

function startWave(world: World): void {
  world.wave++;
  const groups = waveComposition(world.wave);
  const queue: EnemyType[] = [];
  for (const g of groups) for (let i = 0; i < g.count; i++) queue.push(g.type);
  // shuffle
  for (let i = queue.length - 1; i > 0; i--) {
    const j = world.rng.int(0, i);
    [queue[i], queue[j]] = [queue[j], queue[i]];
  }
  world.spawnQueue = queue;
  world.spawnCd = 0;
  world.phase = 'spawning';
  world.emit({ type: 'waveStart', n: world.wave });
}

function spawnAtEdge(world: World, type: EnemyType): void {
  const a = world.rng.next() * Math.PI * 2;
  const d = ARENA * 0.92;
  world.spawnEnemyAt(type, Math.cos(a) * d, Math.sin(a) * d);
}

function pickUpgrades(world: World, n: number) {
  const pool = [...UPGRADES];
  const out = [];
  for (let i = 0; i < n && pool.length; i++) {
    const idx = world.rng.int(0, pool.length - 1);
    out.push(pool.splice(idx, 1)[0]);
  }
  return out;
}

function applyRandomUpgrade(world: World): void {
  const u = world.rng.pick(UPGRADES);
  u.apply(world.stats);
  world.player.membrane = Math.min(maxMembrane(world), world.player.membrane);
  world.emit({ type: 'upgradeApplied', x: world.player.pos.x, y: world.player.pos.y });
}

/** Called by UI after the player picks an upgrade on wave clear. */
export function applyUpgrade(world: World, id: string): void {
  const u = UPGRADES.find((x) => x.id === id);
  if (u) u.apply(world.stats);
  world.player.membrane = Math.min(maxMembrane(world), world.player.membrane + maxMembrane(world) * 0.25);
  world.player.atp = world.stats.maxAtp;
  world.pendingUpgrade = false;
  world.upgradeChoices = [];
  world.phase = 'breather';
  world.phaseTimer = WAVE.breather;
}
