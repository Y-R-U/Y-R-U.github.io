// ============================================================
//  TONGUE MECHANICS — shoot, swing, release
// ============================================================

import { frog } from './frog.js';
import { mouse, camera, getEffective, world } from './state.js';
import { createParticle, particles } from './particles.js';

export function shootTongue() {
  if (frog.tongue && frog.tongue.shooting) return;
  if (frog.swinging) return;

  const worldMouse = {
    x: mouse.x + camera.x,
    y: mouse.y + camera.y,
  };

  const maxRange = getEffective('tongueLength');
  let closest = null;
  let closestDist = Infinity;

  for (const a of world.anchors) {
    const bobY = a.y + Math.sin(Date.now() * 0.001 * a.bobSpeed + a.bobOffset) * a.bobAmount;
    const dx = a.x - frog.x;
    const dy = bobY - frog.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    const toMouseDx = worldMouse.x - frog.x;
    const toMouseDy = worldMouse.y - frog.y;
    const toMouseDist = Math.sqrt(toMouseDx * toMouseDx + toMouseDy * toMouseDy);

    if (toMouseDist > 0) {
      const dot = (dx * toMouseDx + dy * toMouseDy) / (dist * toMouseDist);
      if (dot < 0.3) continue;
    }

    if (dist < maxRange && dist < closestDist) {
      closestDist = dist;
      closest = a;
    }
  }

  // Check fly target
  const fly = world.flyTarget;
  if (fly && !fly.caught) {
    const flyBobY = fly.y + Math.sin(Date.now() * 0.003 + fly.bobOffset) * 8;
    const dx = fly.x - frog.x;
    const dy = flyBobY - frog.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    const toMouseDx = worldMouse.x - frog.x;
    const toMouseDy = worldMouse.y - frog.y;
    const toMouseDist = Math.sqrt(toMouseDx * toMouseDx + toMouseDy * toMouseDy);

    if (toMouseDist > 0) {
      const dot = (dx * toMouseDx + dy * toMouseDy) / (dist * toMouseDist);
      if (dot > 0.3 && dist < maxRange && dist < closestDist) {
        frog.tongue = {
          tx: fly.x, ty: flyBobY,
          anchor: null, isFly: true,
          shooting: true, retract: false,
          progress: 0, sx: frog.x, sy: frog.y - 5,
        };
        frog.mouthOpen = 1;
        return;
      }
    }
  }

  if (!closest) return;

  const bobY = closest.y + Math.sin(Date.now() * 0.001 * closest.bobSpeed + closest.bobOffset) * closest.bobAmount;

  frog.tongue = {
    tx: closest.x, ty: bobY,
    anchor: closest,
    shooting: true, retract: false,
    progress: 0,
    sx: frog.x, sy: frog.y - 5,
    length: 0, angle: 0, angVel: 0,
  };
  frog.mouthOpen = 1;
}

export function releaseTongue() {
  if (!frog.swinging) return;

  const power = getEffective('swingPower');
  frog.vx *= power;
  frog.vy *= power;

  frog.swinging = false;
  frog.tongue = null;
  frog.mouthOpen = 0;

  for (let i = 0; i < 5; i++) {
    particles.push(createParticle(frog.x, frog.y - 5, 'tongue'));
  }
}
