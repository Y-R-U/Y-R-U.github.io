// Enemy aeroplane brains. Each mode only chooses a want-angle and whether to shoot.

import { flyToward } from './plane.js';
import { fire } from './weapons.js';
import { wrapAngle } from '../core/math.js';

export function makeAi(mode, rng) {
  return {
    mode: mode || 'chase',
    state: 'engage', timer: rng.range(0.4, 1.8),
    weave: rng.range(0, 6.283), weaveAmp: rng.range(60, 200),
    breakDir: rng.f() < 0.5 ? 1 : -1,
    bombCool: rng.range(1, 3),
    burst: rng.range(0, 2.2), firing: false,
  };
}

function leadPoint(e, p, speed) {
  let t = 0;
  for (let k = 0; k < 3; k++) {
    const tx = p.x + p.vx * t, ty = p.y + p.vy * t;
    t = Math.hypot(tx - e.x, ty - e.y) / speed;
  }
  return { x: p.x + p.vx * t, y: p.y + p.vy * t };
}

/** Never fly into a hill: overrides the mode's choice when the ground is close. */
function terrainGuard(e, world, want) {
  const look = Math.max(240, Math.abs(e.vx) * 0.9);
  const ahead = world.terrain.heightAt(e.x + Math.sign(e.vx || 1) * look);
  const here = world.terrain.heightAt(e.x);
  const floor = Math.max(ahead, here) + 150;
  if (e.y < floor) return 0.7;
  return want;
}

export function stepAi(e, world, dt) {
  const ai = e.ai;
  const p = world.player;
  const cfg = e.flight;
  ai.timer -= dt;
  ai.weave += dt * 1.6;

  let want = e.ang;
  let shoot = false;

  if (!p || p.dead) {
    want = e.ang;
  } else if (ai.mode === 'straight') {
    want = e.facing < 0 ? Math.PI : 0;
    const dx = (p.x - e.x) * (e.facing < 0 ? -1 : 1);
    shoot = dx > 0 && dx < 1200 && Math.abs(p.y - e.y) < 120;
  } else if (ai.mode === 'bomber') {
    const above = { x: p.x + 260, y: p.y + 520 };
    if (ai.state === 'engage') {
      want = Math.atan2(above.y - e.y, above.x - e.x);
      if (Math.abs(e.x - above.x) < 340 && e.y > p.y + 260) { ai.state = 'dive'; ai.timer = 3.2; }
    } else {
      want = Math.atan2(p.y - e.y, p.x - e.x);
      shoot = true;
      if (ai.timer <= 0 || e.y < p.y - 80) { ai.state = 'engage'; ai.timer = 2.5; }
    }
  } else {
    const gunSpeed = 1500;
    const lp = leadPoint(e, p, gunSpeed);
    const d = Math.hypot(p.x - e.x, p.y - e.y);

    if (ai.mode === 'dogfight') {
      if (ai.state === 'engage' && d < 300) { ai.state = 'break'; ai.timer = 1.4; ai.breakDir = -ai.breakDir; }
      if (ai.state === 'break' && ai.timer <= 0) { ai.state = 'engage'; ai.timer = 2; }
    }

    if (ai.state === 'break') {
      want = Math.atan2(p.y - e.y, p.x - e.x) + Math.PI + ai.breakDir * 0.5;
    } else {
      const wob = Math.sin(ai.weave) * ai.weaveAmp;
      want = Math.atan2(lp.y + wob * 0.4 - e.y, lp.x - e.x);
      const err = Math.abs(wrapAngle(want - e.ang));
      shoot = err < 0.13 && d < 1100;
    }
  }

  want = terrainGuard(e, world, want);
  flyToward(e, want, dt, cfg);
  e.facing = Math.cos(e.ang) >= 0 ? 1 : -1;

  // Burst discipline. Without it two scouts hold the trigger and kill a full-health
  // player in under a second — the first thing the harness caught.
  ai.burst -= dt;
  if (ai.burst <= 0) {
    ai.firing = !ai.firing;
    ai.burst = ai.firing ? 0.75 : 1.5 + world.rng.f() * 0.9;
  }
  if (shoot && ai.firing && e.def.gun) fire(world, e, e.def.gun);
}
