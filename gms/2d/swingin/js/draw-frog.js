// ============================================================
//  FROG & TONGUE DRAWING
// ============================================================

import { FROG_W, FROG_H } from './config.js';
import { camera, mouse, game, getEffective } from './state.js';
import { frog } from './frog.js';
import { findAimTarget } from './tongue.js';

const IS_TOUCH = (typeof window !== 'undefined') &&
  ('ontouchstart' in window || (navigator.maxTouchPoints | 0) > 0);

export function drawFrogSprite(ctx) {
  const sx = frog.x - camera.x;
  const sy = frog.y - camera.y;

  ctx.save();
  ctx.translate(sx, sy);

  let facing = 1;
  if (frog.swinging && frog.tongue) {
    facing = frog.vx >= 0 ? 1 : -1;
  } else if (frog.vx < -0.5) {
    facing = -1;
  }
  ctx.scale(facing, 1);

  // Body
  ctx.fillStyle = '#4a8c3f';
  ctx.beginPath();
  ctx.ellipse(0, 0, FROG_W / 2, FROG_H / 2, 0, 0, Math.PI * 2);
  ctx.fill();

  // Belly
  ctx.fillStyle = '#c8e6a0';
  ctx.beginPath();
  ctx.ellipse(2, 4, FROG_W / 3, FROG_H / 3, 0, 0, Math.PI * 2);
  ctx.fill();

  // Back legs
  ctx.fillStyle = '#3d7a33';
  ctx.beginPath();
  ctx.ellipse(-10, 8, 8, 5, -0.3, 0, Math.PI * 2);
  ctx.fill();

  // Front legs
  ctx.beginPath();
  ctx.ellipse(10, 8, 6, 4, 0.3, 0, Math.PI * 2);
  ctx.fill();

  // Feet
  ctx.fillStyle = '#4a8c3f';
  ctx.beginPath();
  ctx.ellipse(-14, 12, 5, 2, -0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(14, 12, 4, 2, 0.2, 0, Math.PI * 2);
  ctx.fill();

  // Eyes
  const eyeY = -10;
  const blinking = frog.eyeBlink < 0.1;

  ctx.fillStyle = '#4a8c3f';
  ctx.beginPath();
  ctx.arc(-6, eyeY, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(6, eyeY, 7, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(-6, eyeY, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(6, eyeY, 5, 0, Math.PI * 2);
  ctx.fill();

  if (blinking) {
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-9, eyeY);
    ctx.lineTo(-3, eyeY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(3, eyeY);
    ctx.lineTo(9, eyeY);
    ctx.stroke();
  } else {
    const mx = (mouse.x - sx) * facing;
    const my = mouse.y - sy;
    const lookAngle = Math.atan2(my - eyeY, mx);
    const lookDist = 2;

    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.arc(-6 + Math.cos(lookAngle) * lookDist, eyeY + Math.sin(lookAngle) * lookDist, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(6 + Math.cos(lookAngle) * lookDist, eyeY + Math.sin(lookAngle) * lookDist, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Mouth
  if (frog.mouthOpen > 0) {
    ctx.fillStyle = '#e84057';
    ctx.beginPath();
    ctx.ellipse(FROG_W / 2 - 2, 0, 5, 4 * frog.mouthOpen, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.strokeStyle = '#2d5a28';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(8, -1, 5, 0.2, Math.PI - 0.2);
    ctx.stroke();
  }

  ctx.restore();
}

export function drawTongue(ctx) {
  if (!frog.tongue) return;
  const t = frog.tongue;

  let startX = frog.x - camera.x;
  let startY = frog.y - camera.y - 5;
  let endX, endY;

  if (t.shooting || t.retract) {
    const p = t.progress;
    endX = t.sx + (t.tx - t.sx) * p - camera.x;
    endY = t.sy + (t.ty - t.sy) * p - camera.y;
    startX = frog.x - camera.x;
    startY = frog.y - camera.y - 5;
  } else {
    endX = t.tx - camera.x;
    endY = t.ty - camera.y;
  }

  ctx.strokeStyle = '#e84057';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.quadraticCurveTo((startX + endX) / 2, (startY + endY) / 2 + 5, endX, endY);
  ctx.stroke();

  ctx.fillStyle = '#ff5070';
  ctx.beginPath();
  ctx.arc(endX, endY, 4, 0, Math.PI * 2);
  ctx.fill();
}

export function drawAimLine(ctx) {
  if (game.state !== 'playing' || frog.dead || frog.swinging || (frog.tongue && frog.tongue.shooting)) return;
  // On touch devices, only show aim while finger is down — otherwise it sits at a stale position.
  if (IS_TOUCH && !mouse.down) return;

  const maxRange = getEffective('tongueLength');
  const sx = frog.x - camera.x;
  const sy = frog.y - camera.y;

  ctx.strokeStyle = 'rgba(232, 64, 87, 0.1)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.arc(sx, sy, maxRange, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  const target = findAimTarget();
  if (!target) return;

  const tx = target.kind === 'fly' ? target.fly.x : target.anchor.x;
  const tax = tx - camera.x;
  const tay = target.bobY - camera.y;
  const isFly = target.kind === 'fly';

  ctx.strokeStyle = isFly ? 'rgba(255, 100, 50, 0.35)' : 'rgba(232, 64, 87, 0.25)';
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(tax, tay);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.strokeStyle = isFly ? 'rgba(255, 100, 50, 0.5)' : 'rgba(232, 64, 87, 0.4)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(tax, tay, 12, 0, Math.PI * 2);
  ctx.stroke();
}
