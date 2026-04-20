// ============================================================
//  WORLD DRAWING — background, ground, anchors, collectibles, fly
// ============================================================

import { W, H } from './config.js';
import { camera, world } from './state.js';

export function drawBackground(ctx) {
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#87ceeb');
  grad.addColorStop(0.5, '#b8e4f0');
  grad.addColorStop(1, '#d4f0e8');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Clouds (parallax)
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  const cloudOffset = -camera.x * 0.1;
  for (let i = 0; i < 8; i++) {
    const cx = ((i * 250 + cloudOffset) % (W + 200)) - 50;
    const cy = 40 + (i % 3) * 50;
    drawCloud(ctx, cx, cy, 30 + (i % 3) * 15);
  }

  // Distant hills
  ctx.fillStyle = '#7fb77e';
  ctx.beginPath();
  ctx.moveTo(0, H);
  for (let x = 0; x <= W; x += 5) {
    const wx = x - camera.x * 0.15;
    ctx.lineTo(x, H - 120 + Math.sin(wx * 0.005) * 40 + Math.sin(wx * 0.012) * 20);
  }
  ctx.lineTo(W, H);
  ctx.fill();

  // Mid hills
  ctx.fillStyle = '#6aaf68';
  ctx.beginPath();
  ctx.moveTo(0, H);
  for (let x = 0; x <= W; x += 5) {
    const wx = x - camera.x * 0.3;
    ctx.lineTo(x, H - 80 + Math.sin(wx * 0.008) * 30 + Math.sin(wx * 0.02) * 15);
  }
  ctx.lineTo(W, H);
  ctx.fill();
}

function drawCloud(ctx, x, y, size) {
  ctx.beginPath();
  ctx.arc(x, y, size, 0, Math.PI * 2);
  ctx.arc(x + size * 0.8, y - size * 0.3, size * 0.7, 0, Math.PI * 2);
  ctx.arc(x + size * 1.4, y, size * 0.6, 0, Math.PI * 2);
  ctx.arc(x - size * 0.5, y + size * 0.1, size * 0.5, 0, Math.PI * 2);
  ctx.fill();
}

export function drawGround(ctx) {
  for (const p of world.platforms) {
    const sx = p.x - camera.x;
    const sy = p.y - camera.y;

    ctx.fillStyle = '#8B6914';
    ctx.fillRect(sx, sy, p.w, H - p.y + camera.y + 10);

    ctx.fillStyle = '#4a8c3f';
    ctx.fillRect(sx, sy, p.w, 8);

    ctx.fillStyle = '#5da64e';
    for (let gx = sx; gx < sx + p.w; gx += 6) {
      ctx.fillRect(gx, sy - 3, 3, 6);
    }

    ctx.fillStyle = '#7a5c12';
    if (p.dirt) {
      for (const d of p.dirt) ctx.fillRect(sx + d.dx, sy + d.dy, d.dw, 1);
    }
  }
}

export function drawAnchor(ctx, a) {
  const sx = a.x - camera.x;
  const bobY = a.y + Math.sin(Date.now() * 0.001 * a.bobSpeed + a.bobOffset) * a.bobAmount;
  const sy = bobY - camera.y;

  ctx.save();
  ctx.translate(sx, sy);

  switch (a.type) {
    case 'twig':
      ctx.strokeStyle = a.used ? '#6b4423' : '#8B6914';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(-18, 3);
      ctx.lineTo(18, -3);
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(5, 0);
      ctx.lineTo(12, -10);
      ctx.stroke();
      break;
    case 'leaf':
      ctx.fillStyle = a.used ? '#3a7a35' : '#5da64e';
      ctx.beginPath();
      ctx.ellipse(0, 0, 16, 8, -0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#4a8c3f';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-12, 1);
      ctx.lineTo(12, -1);
      ctx.stroke();
      break;
    case 'grass':
      ctx.strokeStyle = a.used ? '#3a7a35' : '#5da64e';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, 15);
      ctx.quadraticCurveTo(-5, -5, -2, -15);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(3, 15);
      ctx.quadraticCurveTo(8, -5, 5, -12);
      ctx.stroke();
      break;
    case 'flower': {
      ctx.strokeStyle = '#4a8c3f';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 15);
      ctx.lineTo(0, -5);
      ctx.stroke();
      const petalColors = ['#ff6b6b', '#ffd93d', '#ff922b', '#e84057'];
      const pc = petalColors[Math.floor(a.bobOffset * 2) % petalColors.length];
      ctx.fillStyle = a.used ? '#888' : pc;
      for (let i = 0; i < 5; i++) {
        const pa = (i / 5) * Math.PI * 2;
        ctx.beginPath();
        ctx.ellipse(Math.cos(pa) * 6, -5 + Math.sin(pa) * 6, 5, 3, pa, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#ffd93d';
      ctx.beginPath();
      ctx.arc(0, -5, 3, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'branch':
      ctx.strokeStyle = a.used ? '#5a3a15' : '#8B6914';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(-22, 2);
      ctx.lineTo(22, -2);
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-10, 0);
      ctx.lineTo(-15, -12);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(10, -1);
      ctx.lineTo(16, -14);
      ctx.stroke();
      ctx.fillStyle = '#5da64e';
      ctx.beginPath();
      ctx.ellipse(-15, -14, 6, 3, -0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(16, -16, 6, 3, 0.3, 0, Math.PI * 2);
      ctx.fill();
      break;
  }

  ctx.restore();
}

export function drawCollectible(ctx, c) {
  if (c.collected) return;
  const sx = c.x - camera.x;
  const bobY = c.y + Math.sin(Date.now() * 0.003 + c.bobOffset) * 5;
  const sy = bobY - camera.y;
  if (sx < -30 || sx > W + 30 || sy < -30 || sy > H + 30) return;

  ctx.save();
  ctx.translate(sx, sy);

  if (c.type === 'beetle') {
    ctx.fillStyle = '#5b3a29';
    ctx.beginPath();
    ctx.ellipse(0, 0, 6, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#3a2515';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(0, 7);
    ctx.stroke();
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(-5, i * 4);
      ctx.lineTo(-9, i * 4 + 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(5, i * 4);
      ctx.lineTo(9, i * 4 + 2);
      ctx.stroke();
    }
  } else {
    ctx.fillStyle = '#333';
    ctx.beginPath();
    ctx.ellipse(0, 0, 3, 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(200,220,255,0.5)';
    ctx.beginPath();
    ctx.ellipse(-3, -2, 4, 2, -0.5 + c.wingAngle, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(3, -2, 4, 2, 0.5 - c.wingAngle, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = 'rgba(255, 215, 0, 0.15)';
  ctx.beginPath();
  ctx.arc(0, 0, 12, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

export function drawFly(ctx) {
  const fly = world.flyTarget;
  if (!fly || fly.caught) return;

  const bobY = fly.y + Math.sin(Date.now() * 0.003 + fly.bobOffset) * 8;
  const sx = fly.x - camera.x;
  const sy = bobY - camera.y;

  ctx.save();
  ctx.translate(sx, sy);

  ctx.fillStyle = 'rgba(255, 100, 50, 0.15)';
  ctx.beginPath();
  ctx.arc(0, 0, 25, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 100, 50, 0.08)';
  ctx.beginPath();
  ctx.arc(0, 0, 35, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#222';
  ctx.beginPath();
  ctx.ellipse(0, 0, 8, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#333';
  ctx.beginPath();
  ctx.arc(8, -1, 5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#ff3333';
  ctx.beginPath();
  ctx.arc(11, -3, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(11, 1, 2.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(180, 210, 255, 0.4)';
  const wa = fly.wingAngle;
  ctx.beginPath();
  ctx.ellipse(-2, -6, 12, 5, -0.3 + wa * 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(-2, 6, 12, 5, 0.3 - wa * 0.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(150, 180, 230, 0.3)';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(-2, -6);
  ctx.lineTo(-12, -8);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-2, 6);
  ctx.lineTo(-12, 8);
  ctx.stroke();

  ctx.strokeStyle = '#222';
  ctx.lineWidth = 1;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(-3 + i * 3, 5);
    ctx.lineTo(-5 + i * 3, 12);
    ctx.stroke();
  }

  ctx.fillStyle = '#ff6b3d';
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('CATCH ME!', 0, -30);

  ctx.restore();
}
