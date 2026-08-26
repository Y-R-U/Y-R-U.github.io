// Projectile integration and collision (CONTRACTS §6). Only sim/weapons.js creates these.

import { PHYS } from '../data/tuning.js';
import { applyBlast, applyDamage, damagePart } from './damage.js';
import { turnToward } from '../core/math.js';

const G = 900;                 // world units/s^2 on gravity projectiles
const BLASTLESS = { bullet: 1, shell: 1, tracer: 1, plasma: 1 };

export function spawnProj(world, o) {
  const p = {
    id: world.nextId(), kind: o.kind, def: o.def || null,
    x: o.x, y: o.y, vx: o.vx, vy: o.vy, ang: Math.atan2(o.vy, o.vx),
    team: o.team, dmg: o.dmg, ttl: o.ttl ?? 3,
    dead: false, homing: o.homing || 0, gravity: o.gravity ? 1 : 0,
    radius: o.radius || 4, owner: o.owner || null, pierce: o.pierce | 0,
    blastR: o.blastR || 0, shake: o.shake || 0, whiteout: o.whiteout | 0,
    sub: o.sub | 0, armed: 0,
    fuseDelay: o.fuseDelay || 0, returns: o.returns || 0, returnTtl: o.returnTtl || 0,
    moneyMult: o.moneyMult || 1, stunR: o.stunR || 0, stunTime: o.stunTime || 0,
  };
  world.projs.push(p);
  return p;
}

function detonate(world, p, hitEnt, hitPart, fused) {
  if (p.dead) return;
  if (p.fuseDelay && !fused) {                   // §15.3 fuseDelay: stick, then go off
    if (p.stuck === undefined) { p.stuck = p.fuseDelay; p.vx = 0; p.vy = 0; p.gravity = 0; }
    return;
  }
  p.dead = true;
  if (BLASTLESS[p.kind]) {
    if (hitPart) damagePart(world, hitEnt, hitPart, p.dmg, p.team);
    else if (hitEnt) applyDamage(world, hitEnt, p.dmg, p.team, p.owner ? (p.owner.defId || p.owner.kind) : 'gun');
    else world.push({ e: 'hit', x: p.x, y: p.y, team: -1, dmg: 0 });
    return;
  }
  if (p.sub > 0) {                     // cluster: split instead of exploding
    for (let i = 0; i < p.sub; i++) {
      spawnProj(world, {
        kind: 'bomb', def: p.def, x: p.x, y: p.y,
        vx: p.vx * 0.35 + world.rng.range(-150, 150),
        vy: p.vy * 0.3 + world.rng.range(20, 190),
        team: p.team, dmg: p.dmg, ttl: 6, gravity: 1, radius: 5,
        blastR: p.blastR, shake: p.shake * 0.4, owner: p.owner,
      });
    }
    return;
  }
  applyBlast(world, p.x, p.y, {
    blastR: p.blastR, dmg: p.dmg, shake: p.shake, whiteout: p.whiteout,
    moneyMult: p.moneyMult, stunR: p.stunR, stunTime: p.stunTime,
    srcKind: p.owner ? (p.owner.defId || p.owner.kind) : 'blast',
  }, p.team, null);
}

function findHoming(world, p) {
  let best = null, bd = 1e12;
  for (const e of world.ents) {
    if (e.dead || e.team === p.team || e.kind === 'pad' || e.kind === 'pickup' || e.kind === 'balloon') continue;
    const d = (e.x - p.x) * (e.x - p.x) + (e.y - p.y) * (e.y - p.y);
    if (d < bd) { bd = d; best = e; }
  }
  return bd < 1600 * 1600 ? best : null;
}

export function stepProjectiles(world, dt) {
  const list = world.projs;
  const camL = world.cam.x - 900, camR = world.cam.x + world.cam.vw + 1800;

  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    if (p.dead) continue;
    p.ttl -= dt;
    p.armed += dt;
    if (p.stuck !== undefined) {                 // §15.3 fuseDelay
      p.stuck -= dt;
      if (p.stuck <= 0) detonate(world, p, null, null, true);
      continue;
    }
    if (p.ttl <= 0) {
      if (p.returns && !p.returned) {            // §15.3 returns
        p.returned = 1; p.vx = -p.vx; p.vy = -p.vy; p.ttl = p.returnTtl; p.team = p.team; continue;
      }
      detonate(world, p, null); continue;
    }

    if (p.homing) {
      const tgt = findHoming(world, p);
      if (tgt) {
        const want = Math.atan2(tgt.y - p.y, tgt.x - p.x);
        const sp = Math.hypot(p.vx, p.vy);
        p.ang = turnToward(p.ang, want, p.homing * dt);
        p.vx = Math.cos(p.ang) * sp; p.vy = Math.sin(p.ang) * sp;
      }
    }
    if (p.gravity) p.vy -= G * dt;

    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (!p.homing) p.ang = Math.atan2(p.vy, p.vx);

    if (p.x < camL || p.x > camR) { p.dead = true; continue; }

    // terrain
    const ground = world.terrain.heightAt(p.x);
    if (p.y <= ground) {
      p.y = ground;
      if (p.pierce > 0) { p.pierce--; p.y = ground - 40; p.ttl = Math.min(p.ttl, 0.25); continue; }
      detonate(world, p, null);
      continue;
    }
    if (p.y > PHYS.ceiling + 900) { p.dead = true; continue; }

    // actors
    const ents = world.ents;
    for (let j = 0; j < ents.length; j++) {
      const e = ents[j];
      if (e.dead || e.team === p.team) continue;
      if (e.kind === 'pad' || e.kind === 'pickup' || e.kind === 'balloon') continue;
      if (e === p.owner) continue;
      if (e.kind === 'player' && p.armed < 0.06) continue;
      if (Math.abs(p.x - e.x) > e.w + p.radius) continue;
      if (Math.abs(p.y - e.y) > e.h + p.radius) continue;
      if (e.parts) {
        let hit = null;
        for (const pt of e.parts) {
          if (pt.dead) continue;
          if (Math.abs(p.x - pt.x) <= pt.w + p.radius && Math.abs(p.y - pt.y) <= pt.h + p.radius) { hit = pt; break; }
        }
        if (!hit) continue;
        detonate(world, p, e, hit);
        break;
      }
      detonate(world, p, e);
      break;
    }
  }

  for (let i = list.length - 1; i >= 0; i--) if (list[i].dead) list.splice(i, 1);
}
