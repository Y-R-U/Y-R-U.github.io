// Projectiles, their collisions, and lingering hazards.
//
// Collision is one pass over the projectile pool, each doing one spatial query.
// Enemies are never iterated against projectiles directly - at 400 bodies and
// 300 shots that is 120k pair tests a frame, and the hash makes it ~3k.

import { DT } from './world.js';
import { applyDamage } from './damage.js';
import { severSweep } from './strings.js';

const SCR = [];

export function stepProjectiles(world) {
  world.projectiles.each((p) => {
    if (p.hostile) return;            // world.js owns hostile shots
    p.life -= DT;
    if (p.life <= 0) { world.projectiles.free(p); return; }

    const d = p.data;
    if (d && d.boomerang) {
      // Out, turn, and come back to wherever the player is NOW - a boomerang
      // that returns to where you threw it feels broken on a moving character.
      d.t += DT;
      if (d.t > d.turn) {
        const pl = world.player;
        const dx = pl.x - p.x, dy = pl.y - p.y;
        const dist = Math.hypot(dx, dy) || 1;
        const sp = Math.hypot(p.vx, p.vy) || 200;
        p.vx += (dx / dist) * sp * 3.2 * DT;
        p.vy += (dy / dist) * sp * 3.2 * DT;
        if (dist < 14 && d.t > d.turn + 0.25) { world.projectiles.free(p); return; }
      }
      p.rot += DT * 18;
    }

    const px = p.x, py = p.y;
    p.x += p.vx * DT;
    p.y += p.vy * DT;

    // The sever test uses the SWEPT segment, not the point. A fast projectile
    // moves further than a thread is wide in one tick, and testing only the new
    // position lets it tunnel straight through.
    if (p.cuts) severSweep(world, px, py, p.x, p.y, p.radius + 5);
  });
}

export function stepCollisions(world) {
  world.projectiles.each((p) => {
    if (p.hostile) return;
    const hits = world.spatialQuery(p.x, p.y, p.radius + 14, SCR);
    for (let i = 0; i < hits.length; i++) {
      const e = hits[i];
      if (!e.alive || e.dying) continue;
      if (p.hitSet.has(e.id)) continue;
      const rr = p.radius + (e.radius || 6);
      const dx = e.x - p.x, dy = e.y - p.y;
      if (dx * dx + dy * dy > rr * rr) continue;

      p.hitSet.add(e.id);
      applyDamage(world, e, p.damage, {
        weaponId: p.ownerWeapon, knock: p.knock, kx: p.vx, ky: p.vy,
      });

      if (p.pierce > 0) p.pierce--;
      else { world.projectiles.free(p); return; }
    }
  });
}

export function stepHazards(world) {
  world.hazards.each((h) => {
    h.life -= DT;
    if (h.life <= 0) { world.hazards.free(h); return; }
    h.acc += DT;
    if (h.acc < (h.tickRate || 0.35)) return;
    h.acc -= (h.tickRate || 0.35);

    const hits = world.spatialQuery(h.x, h.y, h.r, SCR);
    for (let i = 0; i < hits.length; i++) {
      const e = hits[i];
      if (!e.alive || e.dying) continue;
      applyDamage(world, e, h.damage, {
        weaponId: h.ownerWeapon, knock: h.knock,
        kx: e.x - h.x, ky: e.y - h.y, quiet: true,
      });
    }
  });
}
