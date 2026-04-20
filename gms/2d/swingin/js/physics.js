// ============================================================
//  PHYSICS UPDATE — gravity, swinging, collisions, collectibles
// ============================================================

import { W, H, GRAVITY, FROG_H } from './config.js';
import { game, camera, getEffective, world, shake } from './state.js';
import { frog } from './frog.js';
import { particles, spawnCoinParticles, spawnCelebration, updateParticles } from './particles.js';

export function update(dt) {
  if (game.state !== 'playing') return;
  if (frog.dead) return;

  const step = dt * 60;

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

    // Fell off screen
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
