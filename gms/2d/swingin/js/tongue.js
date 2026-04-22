// ============================================================
//  TONGUE MECHANICS — shoot, swing, release
// ============================================================

import { frog } from './frog.js';
import { mouse, camera, getEffective, world } from './state.js';
import { createParticle, particles } from './particles.js';

// Returns the best aim target in range + within the aim cone.
// Among in-range cone-passing targets, picks the one closest to the cursor
// so players can intentionally grab flies or specific anchors.
// Shape: { kind: 'anchor'|'fly', anchor?, fly?, bobY, dist } or null.
export function findAimTarget() {
  const worldMX = mouse.x + camera.x;
  const worldMY = mouse.y + camera.y;
  const maxRange = getEffective('tongueLength');
  const toMx = worldMX - frog.x;
  const toMy = worldMY - frog.y;
  const toMd = Math.sqrt(toMx * toMx + toMy * toMy);

  let best = null;
  let bestMouseDist = Infinity;

  const inCone = (dx, dy, dist) => {
    if (toMd <= 0) return true;
    const dot = (dx * toMx + dy * toMy) / (dist * toMd);
    return dot >= 0.3;
  };

  for (const a of world.anchors) {
    const bobY = a.y + Math.sin(Date.now() * 0.001 * a.bobSpeed + a.bobOffset) * a.bobAmount;
    const dx = a.x - frog.x;
    const dy = bobY - frog.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist >= maxRange || !inCone(dx, dy, dist)) continue;
    const mdx = a.x - worldMX;
    const mdy = bobY - worldMY;
    const md = Math.sqrt(mdx * mdx + mdy * mdy);
    if (md < bestMouseDist) {
      best = { kind: 'anchor', anchor: a, bobY, dist };
      bestMouseDist = md;
    }
  }

  const fly = world.flyTarget;
  if (fly && !fly.caught) {
    const flyBobY = fly.y + Math.sin(Date.now() * 0.003 + fly.bobOffset) * 8;
    const dx = fly.x - frog.x;
    const dy = flyBobY - frog.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < maxRange && inCone(dx, dy, dist)) {
      const mdx = fly.x - worldMX;
      const mdy = flyBobY - worldMY;
      const md = Math.sqrt(mdx * mdx + mdy * mdy);
      if (md < bestMouseDist) {
        best = { kind: 'fly', fly, bobY: flyBobY, dist };
        bestMouseDist = md;
      }
    }
  }

  return best;
}

export function shootTongue() {
  if (frog.tongue && frog.tongue.shooting) return;
  if (frog.swinging) return;

  const target = findAimTarget();
  if (!target) return;

  if (target.kind === 'fly') {
    frog.tongue = {
      tx: target.fly.x, ty: target.bobY,
      anchor: null, isFly: true,
      shooting: true, retract: false,
      progress: 0, sx: frog.x, sy: frog.y - 5,
    };
  } else {
    frog.tongue = {
      tx: target.anchor.x, ty: target.bobY,
      anchor: target.anchor,
      shooting: true, retract: false,
      progress: 0,
      sx: frog.x, sy: frog.y - 5,
      length: 0, angle: 0, angVel: 0,
    };
  }
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
