// ============================================================
//  PHYSICS UPDATE — gravity, swinging, collisions, collectibles
// ============================================================

import {
  W, H, GRAVITY, FROG_H, MAX_TANGENTIAL_SPEED,
  FISH_BOUNCE_VY, BRANCH_BOUNCE_VX, BRANCH_BOUNCE_VY, SIDE_MARGIN,
} from './config.js';
import { game, camera, getEffective, world, shake, mouse } from './state.js';
import { frog } from './frog.js';
import { particles, spawnCoinParticles, spawnCelebration, updateParticles, createParticle } from './particles.js';
import { shootTongue } from './tongue.js';
import { GROUND_Y } from './level.js';

function inGap(x) {
  for (const g of world.gaps) {
    if (x >= g.x && x <= g.x + g.w) return g;
  }
  return null;
}

function spawnSplash(x, y) {
  for (let i = 0; i < 12; i++) {
    const p = createParticle(x, y, 'coin');
    p.color = '#bfe6ff';
    p.vx = (Math.random() - 0.5) * 8;
    p.vy = -4 - Math.random() * 6;
    p.maxLife = 0.6 + Math.random() * 0.4;
    particles.push(p);
  }
}

function consumeFishSave(gap) {
  game.saves--;
  shake.timer = 0.2; shake.intensity = 4;
  const surfaceY = GROUND_Y + 5;
  spawnSplash(frog.x, surfaceY);
  // Bounce frog up and nudge toward the gap centre so the next swing arc
  // clears the water.
  const centre = gap.x + gap.w / 2;
  frog.vy = -FISH_BOUNCE_VY;
  frog.vx = (frog.x < centre ? 1 : -1) * Math.max(2, Math.abs(frog.vx) * 0.6);
  frog.y = surfaceY - FROG_H;
  world.rescueAnims.push({
    type: 'fish', x: frog.x, y: surfaceY,
    vy: -10, life: 0.8, maxLife: 0.8,
  });
}

function consumeBranchSave(side) {
  game.saves--;
  shake.timer = 0.2; shake.intensity = 4;
  if (side === 'left') {
    frog.x = 12;
    frog.vx = BRANCH_BOUNCE_VX;
  } else {
    frog.x = world.levelWidth - 12;
    frog.vx = -BRANCH_BOUNCE_VX;
  }
  frog.vy = Math.min(frog.vy, 0) - BRANCH_BOUNCE_VY;
  // Drop any in-progress tongue (e.g. mid-shoot when bumped).
  frog.swinging = false;
  frog.tongue = null;
  world.rescueAnims.push({
    type: 'branch', side, x: side === 'left' ? 0 : world.levelWidth,
    y: frog.y, life: 0.5, maxLife: 0.5, swing: 0,
  });
}

function updateRescueAnims(dt) {
  const step = dt * 60;
  for (let i = world.rescueAnims.length - 1; i >= 0; i--) {
    const a = world.rescueAnims[i];
    a.life -= dt;
    if (a.type === 'fish') {
      a.y += a.vy * step;
      a.vy += 0.5 * step;
    } else if (a.type === 'branch') {
      a.swing = (a.maxLife - a.life) / a.maxLife;
    }
    if (a.life <= 0) world.rescueAnims.splice(i, 1);
  }
}

export function update(dt) {
  if (game.state !== 'playing') return;
  updateRescueAnims(dt);
  if (frog.dead) return;

  const step = dt * 60;

  // Auto-grab: while the player holds the button, attach to the first
  // anchor that enters reach. allowHop=false so the grounded recovery hop
  // only fires on the original press, not every frame.
  if (mouse.down && !frog.swinging && !frog.tongue) {
    shootTongue({ allowHop: false });
  }

  // Timer
  game.timer -= dt;
  if (game.timer <= 0) {
    game.timer = 0;
    frog.dead = true;
    shake.timer = 0.3; shake.intensity = 8;
    game.state = 'gameover';
    return;
  }

  // Tongue shooting animation
  if (frog.tongue && frog.tongue.shooting) {
    frog.tongue.progress += getEffective('tongueSpeed') * dt * 3;

    if (frog.tongue.progress >= 1) {
      frog.tongue.shooting = false;

      if (frog.tongue.isFly) {
        world.flyTarget.caught = true;
        frog.tongue.retract = true;
        frog.tongue.progress = 1;
        frog.mouthOpen = 1;
      } else {
        const a = frog.tongue.anchor;
        a.used = true;
        const bobY = a.y + Math.sin(Date.now() * 0.001 * a.bobSpeed + a.bobOffset) * a.bobAmount;
        const dx = frog.x - a.x;
        const dy = frog.y - bobY;
        frog.tongue.length = Math.sqrt(dx * dx + dy * dy);
        frog.tongue.angle = Math.atan2(dx, -dy);
        const tangent = { x: -Math.cos(frog.tongue.angle), y: -Math.sin(frog.tongue.angle) };
        frog.tongue.angVel = (frog.vx * tangent.x + frog.vy * tangent.y) / frog.tongue.length;
        frog.swinging = true;
        frog.grounded = false;
      }
    }
    return;
  }

  // Retracting tongue (fly caught)
  if (frog.tongue && frog.tongue.retract) {
    frog.tongue.progress -= dt * 3;
    if (frog.tongue.progress <= 0) {
      frog.tongue = null;
      frog.mouthOpen = 0;
      game.coins += 5;
      game.totalCoins += 5;
      spawnCelebration(frog.x, frog.y);
      game.state = 'levelcomplete';
    }
    return;
  }

  if (frog.swinging && frog.tongue) {
    // Pendulum physics — angVel/angle in per-frame units, scaled by step for dt-independence
    const t = frog.tongue;

    // Reel in while input is held — this is the "pump" mechanic.
    // Conservation of angular momentum (m·r²·ω = const) means ω scales as
    // 1/r²: pulling the rope shorter at the bottom of a swing converts the
    // player's "work against centripetal force" into kinetic energy. Doing
    // this at high ω (near the bottom of swings) gains altitude over time.
    if (mouse.down) {
      const minLen = 24;
      const reelRate = 150; // pixels per second
      if (t.length > minLen) {
        const newLen = Math.max(minLen, t.length - reelRate * dt);
        if (newLen < t.length) {
          const ratio = t.length / newLen;
          let newAngVel = t.angVel * ratio * ratio;
          // Cap tangential speed so pumping can't run away to infinity.
          const tangential = Math.abs(newAngVel) * newLen;
          if (tangential > MAX_TANGENTIAL_SPEED) {
            newAngVel = Math.sign(newAngVel) * MAX_TANGENTIAL_SPEED / newLen;
          }
          t.angVel = newAngVel;
          t.length = newLen;
        }
      }
    }

    const gravityAng = (GRAVITY / t.length) * Math.sin(t.angle);
    t.angVel += gravityAng * step;
    t.angVel *= Math.pow(0.998, step);
    t.angle += t.angVel * step;

    const anchorBobY = t.anchor.y + Math.sin(Date.now() * 0.001 * t.anchor.bobSpeed + t.anchor.bobOffset) * t.anchor.bobAmount;
    frog.x = t.anchor.x + Math.sin(t.angle) * t.length;
    frog.y = anchorBobY - Math.cos(t.angle) * t.length;

    frog.vx = t.angVel * t.length * Math.cos(t.angle);
    frog.vy = t.angVel * t.length * Math.sin(t.angle);

    t.tx = t.anchor.x;
    t.ty = anchorBobY;
  } else {
    // Free flight
    frog.vy += GRAVITY * step;
    frog.x += frog.vx * step;
    frog.y += frog.vy * step;
    frog.vx *= Math.pow(0.999, step);

    // Ground collision
    for (const p of world.platforms) {
      if (frog.x >= p.x && frog.x <= p.x + p.w &&
          frog.y >= p.y - FROG_H && frog.y < p.y + 10 && frog.vy > 0) {
        frog.y = p.y - FROG_H;
        frog.vy = 0;
        frog.vx *= 0.85;
        frog.grounded = true;
        if (Math.abs(frog.vx) < 0.1) frog.vx = 0;
      }
    }

    // Side protection: swung off the edge of the level.
    if (frog.x < -SIDE_MARGIN) {
      if (game.saves > 0) consumeBranchSave('left');
      else { frog.dead = true; shake.timer = 0.3; shake.intensity = 8; game.state = 'gameover'; return; }
    } else if (frog.x > world.levelWidth + SIDE_MARGIN) {
      if (game.saves > 0) consumeBranchSave('right');
      else { frog.dead = true; shake.timer = 0.3; shake.intensity = 8; game.state = 'gameover'; return; }
    }

    // Water / fall protection: dropping into a gap between platforms.
    if (frog.y + FROG_H >= GROUND_Y + 5 && frog.vy > 0) {
      const gap = inGap(frog.x);
      if (gap) {
        if (game.saves > 0) consumeFishSave(gap);
        else { frog.dead = true; shake.timer = 0.3; shake.intensity = 8; game.state = 'gameover'; return; }
      }
    }

    // Fell off screen (rare now — anything past the bottom didn't hit a
    // gap, so this is the final safety net).
    if (frog.y > H + 100 + camera.y) {
      frog.dead = true;
      shake.timer = 0.3; shake.intensity = 8;
      game.state = 'gameover';
      return;
    }

    // Ceiling bounce
    if (frog.y < camera.y - 50) {
      frog.vy = Math.abs(frog.vy) * 0.5;
    }
  }

  // Collectibles
  const magnetR = getEffective('magnetRadius');
  for (const c of world.collectibles) {
    if (c.collected) continue;
    const bobY = c.y + Math.sin(Date.now() * 0.003 + c.bobOffset) * 5;
    const dx = frog.x - c.x;
    const dy = frog.y - bobY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < magnetR) {
      c.collected = true;
      const value = c.type === 'beetle' ? 3 : 1;
      game.coins += value;
      game.totalCoins += value;
      spawnCoinParticles(c.x, bobY, value);
    }
  }

  // Eye blink
  frog.eyeBlink -= dt;
  if (frog.eyeBlink <= 0) frog.eyeBlink = 2 + Math.random() * 4;

  // Camera follow (dt-independent exponential smoothing)
  const targetCamX = Math.max(0, frog.x - W * 0.35);
  const targetCamY = Math.max(0, Math.min(frog.y - H * 0.5, 100));
  camera.x += (targetCamX - camera.x) * (1 - Math.pow(1 - 0.08, step));
  camera.y += (targetCamY - camera.y) * (1 - Math.pow(1 - 0.05, step));

  updateParticles(dt);

  // Animate wings
  for (const c of world.collectibles) c.wingAngle = Math.sin(Date.now() * 0.02) * 0.5;
  if (world.flyTarget) world.flyTarget.wingAngle = Math.sin(Date.now() * 0.015) * 0.6;
}
