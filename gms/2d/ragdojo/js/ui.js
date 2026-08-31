// Screen-space HUD. Drawn after the world, in unscaled pixels.

import { stroke, line, rect, circle, hatch, splat, INK } from './ink.js';
import { glyphPoints } from './gestures.js';
import { MOVES, moveStats } from './config.js';
import { P as RIG } from './ragdoll.js';

const P_HEAD = RIG.HEAD;

export const FONT = '"Patrick Hand", "Bradley Hand", "Segoe Print", "Comic Sans MS", cursive';
export const FONT_B = '"Caveat", "Bradley Hand", "Segoe Print", cursive';

export function handText(ctx, str, x, y, size, col = INK, align = 'left', weight = 700) {
  ctx.save();
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.fillStyle = col;
  ctx.fillText(str, x, y);
  ctx.restore();
}

/** Sketched health bar with hatched fill. */
function bar(ctx, x, y, w, h, frac, label, name, rank, align, seed, marker) {
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';

  handText(ctx, label, align === 'right' ? x + w : x, y - 12, 26, '#3a4050', align);
  // The same blue triangle that floats over the player, so the panel and the body on the
  // page are visibly the same thing.
  if (marker) {
    ctx.save();
    const mx = x + ctx.measureText(label).width + 46;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#2f6ad0';
    ctx.beginPath();
    ctx.moveTo(mx, y - 8);
    ctx.lineTo(mx - 8, y - 23);
    ctx.lineTo(mx + 8, y - 23);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  if (name) handText(ctx, name, align === 'right' ? x + w : x, y + h + 26, 19, '#6a7080', align, 400);

  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = 'rgba(255,253,246,0.55)';
  ctx.fillRect(x, y, w, h);
  ctx.restore();

  const fw = Math.max(0, w * frac);
  if (fw > 2) {
    const bx = align === 'right' ? x + w - fw : x;
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = frac > 0.5 ? 'rgba(70,120,80,0.20)' : frac > 0.22 ? 'rgba(200,150,40,0.22)' : 'rgba(190,60,50,0.26)';
    ctx.fillRect(bx, y, fw, h);
    ctx.restore();
    hatch(ctx, bx, y, fw, h, { gap: 8, ang: -1.0, w: 2.4, seed: seed + 3,
      col: frac > 0.5 ? '#2f5c39' : frac > 0.22 ? '#8a6a10' : '#8f2420', a: 0.85 });
  }
  rect(ctx, x, y, w, h, { w: 3.2, passes: 2, wob: 0.9, seed, col: '#2b3040', a: 0.95, step: 16 });

  // Rank swatch on the outer end.
  const sx = align === 'right' ? x + w + 24 : x - 24;
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.beginPath();
  ctx.arc(sx, y + h / 2, 13, 0, 6.283);
  ctx.fillStyle = rank.col;
  ctx.fill();
  ctx.restore();
  circle(ctx, sx, y + h / 2, 13, { w: 2.6, passes: 1, wob: 0.7, seed: seed + 9, col: rank.edge });
  ctx.restore();
}

export function drawHUD(ctx, vw, vh, m, save, input) {
  const pad = Math.max(14, vw * 0.028);
  const bw = Math.min(300, vw * 0.34);
  const bh = 26;

  ctx.save();
  ctx.font = `700 26px ${FONT}`;
  bar(ctx, pad + 26, pad + 30, bw, bh, m.player.hp / m.player.maxHp, 'YOU',
    m.demo ? m.player.name : null, m.player.rank, 'left', 11, !m.demo);
  ctx.restore();

  const live = m.enemies.filter((e) => !e.dead);
  const boss = m.enemies.find((e) => e.boss);
  if (boss) {
    bar(ctx, vw - pad - 26 - bw, pad + 30, bw, bh, boss.hp / boss.maxHp, 'ENEMY', boss.name, boss.rank, 'right', 23);
  } else {
    const totalMax = m.enemies.reduce((s, e) => s + e.maxHp, 0);
    const totalHp = m.enemies.reduce((s, e) => s + e.hp, 0);
    bar(ctx, vw - pad - 26 - bw, pad + 30, bw, bh, totalHp / totalMax, 'ENEMY',
      live.length > 1 ? `${live.length} LEFT` : (live[0]?.name || ''), m.enemies[0].rank, 'right', 23);
  }

  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  handText(ctx, m.level.title, vw / 2, pad + 70, 22, '#7b8294', 'center', 400);
  if (m.level.dojo) handText(ctx, m.level.dojo, vw / 2, pad + 92, 17, '#9aa0ad', 'center', 400);

  if (m.announceT > 0 && m.announce) {
    const u = 1 - m.announceT / 1.7;
    ctx.save();
    ctx.globalAlpha = Math.min(1, m.announceT * 2.4);
    ctx.translate(vw / 2, vh * 0.36);
    ctx.rotate(-0.02);
    const s = 1 + Math.max(0, 0.25 - u) * 1.2;
    ctx.scale(s, s);
    ctx.font = `700 ${Math.min(54, vw * 0.075)}px ${FONT_B}`;
    ctx.textAlign = 'center';
    ctx.lineWidth = 7;
    ctx.strokeStyle = 'rgba(250,247,238,0.92)';
    ctx.strokeText(m.announce, 0, 0);
    ctx.fillStyle = '#c0392b';
    ctx.fillText(m.announce, 0, 0);
    ctx.restore();
  }
  ctx.restore();

  if (!m.demo) drawMoveStrip(ctx, vw, vh, m, save, input);
  if (input) drawTouch(ctx, input);
}

/** Owned specials with their gesture glyph and cooldown sweep. */
function drawMoveStrip(ctx, vw, vh, m, save, input) {
  const owned = MOVES.filter((mv) => (save.moves[mv.id] || {}).owned);
  if (!owned.length) return;
  const side = (input?.hand || 'right') === 'right' ? 1 : -1;
  const size = Math.min(46, vw * 0.062);
  const gap = size * 1.28;
  const total = owned.length * gap;
  const x0 = vw / 2 - total / 2 + gap / 2;
  const y = vh - size * 0.9 - 8;

  ctx.save();
  for (let i = 0; i < owned.length; i++) {
    const mv = owned[i];
    const st = moveStats(save, mv.id);
    const cd = m.player.cooldown(mv.id);
    const ready = cd <= 0;
    const x = x0 + i * gap;

    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = ready ? 0.5 : 0.32;
    ctx.fillStyle = ready ? 'rgba(255,253,246,0.85)' : 'rgba(210,205,192,0.7)';
    ctx.beginPath();
    ctx.arc(x, y, size * 0.5, 0, 6.283);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.globalCompositeOperation = 'multiply';
    circle(ctx, x, y, size * 0.5, { w: 2.4, passes: 1, wob: 0.7, seed: 300 + i * 7,
      col: ready ? '#2b3040' : '#9aa0ad', a: ready ? 0.9 : 0.5 });

    const pts = glyphPoints(mv.gesture, 26, 1);
    if (pts.length > 1) {
      const s = size * 0.52;
      stroke(ctx, pts.map(([px, py]) => [x + px * s, y + py * s]),
        { w: 3, passes: 1, wob: 0.5, seed: 400 + i, col: ready ? '#20242c' : '#a8aebb', a: ready ? 1 : 0.55, step: 5 });
    }
    if (!ready && st) {
      const u = cd / st.cooldown;
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 0.34;
      ctx.fillStyle = '#5a6070';
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.arc(x, y, size * 0.5, -Math.PI / 2, -Math.PI / 2 + u * 6.283);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }
  ctx.restore();
}

/** Always-on 4-way stick, so JUMP / DUCK / BACK / FORWARD are visible without a tutorial. */
function drawStick(ctx, input) {
  const b = input.baseAt();
  const active = !!input.stick;
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = active ? 0.42 : 0.24;
  circle(ctx, b.x, b.y, b.r, { w: 3, passes: 1, wob: 0.9, seed: 555, col: '#3a4050' });

  const arrows = [
    { dx: 0, dy: -1, txt: 'JUMP', on: input.jumpLatch },
    { dx: 0, dy: 1, txt: 'DUCK', on: input.block },
    { dx: -1, dy: 0, txt: '', on: input.moveX < -0.1 },
    { dx: 1, dy: 0, txt: '', on: input.moveX > 0.1 },
  ];
  for (const a of arrows) {
    const r0 = b.r * 0.46, r1 = b.r * 0.80;
    const px = b.x + a.dx * r0, py = b.y + a.dy * r0;
    const qx = b.x + a.dx * r1, qy = b.y + a.dy * r1;
    ctx.globalAlpha = a.on ? 0.85 : (active ? 0.4 : 0.24);
    const nx = -a.dy, ny = a.dx;
    stroke(ctx, [[qx + nx * 8 - a.dx * 8, qy + ny * 8 - a.dy * 8], [qx, qy],
                 [qx - nx * 8 - a.dx * 8, qy - ny * 8 - a.dy * 8]],
      { w: 3, passes: 1, wob: 0.6, seed: 560 + a.dx * 3 + a.dy * 7, col: '#3a4050', step: 5 });
    stroke(ctx, [[px, py], [qx - a.dx * 5, qy - a.dy * 5]],
      { w: 2.6, passes: 1, wob: 0.6, seed: 570 + a.dx * 3 + a.dy * 7, col: '#3a4050', step: 6 });
    if (a.txt) {
      ctx.globalAlpha = a.on ? 0.9 : (active ? 0.5 : 0.3);
      handText(ctx, a.txt, b.x, b.y + a.dy * (b.r + (a.dy > 0 ? 20 : -8)), 15, '#3a4050', 'center', 400);
    }
  }
  if (input.knob) {
    ctx.globalAlpha = 0.5;
    circle(ctx, input.knob.x, input.knob.y, b.r * 0.30, { w: 3.2, passes: 1, wob: 0.7, seed: 556, col: '#2b3040' });
  } else {
    ctx.globalAlpha = active ? 0.4 : 0.22;
    circle(ctx, b.x, b.y, b.r * 0.28, { w: 2.6, passes: 1, wob: 0.7, seed: 556, col: '#3a4050' });
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

/** The pencil line that follows your finger. */
function drawTouch(ctx, input) {
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  if (input.trail.length > 1) {
    const a = input.draw ? 0.75 : Math.max(0, input.trailFade / 0.32) * 0.6;
    stroke(ctx, input.trail.map((p) => [p.x, p.y]),
      { w: 4.5, passes: 2, wob: 0.8, seed: 777, col: '#3a4050', a, step: 7 });
    const tip = input.trail[input.trail.length - 1];
    if (input.draw) {
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = '#3a4050';
      ctx.beginPath();
      ctx.arc(tip.x, tip.y, 5, 0, 6.283);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
  drawStick(ctx, input);
  ctx.restore();
}

/**
 * "YOU" / enemy names over each fighter for the first couple of seconds. Drawn in world
 * space so the tags track the figures. Early enemies are identical white stick figures,
 * so without this there is nothing tying the YOU health panel to a body on the page.
 */
export function drawNameTags(ctx, m) {
  if (m.introT <= 0) return;
  const fade = Math.min(1, m.introT / 0.55);
  const rise = (1 - Math.min(1, (2.6 - m.introT) / 0.3)) * 14;

  const tag = (f, text, col) => {
    if (f.dead) return;
    const hx = f.rag.x[P_HEAD], hy = f.rag.y[P_HEAD];
    const y = hy - 44 * f.scale - rise;
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.font = `700 ${Math.round(30 * f.scale)}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(250,247,238,0.92)';
    ctx.strokeText(text, hx, y);
    ctx.fillStyle = col;
    ctx.fillText(text, hx, y);
    stroke(ctx, [[hx, y + 8], [hx, y + 20]], { w: 3, passes: 1, wob: 0.5, seed: 61, col, a: 0.85, step: 6 });
    stroke(ctx, [[hx - 6, y + 14], [hx, y + 21], [hx + 6, y + 14]],
      { w: 3, passes: 1, wob: 0.5, seed: 62, col, a: 0.85, step: 5 });
    ctx.restore();
  };

  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  tag(m.player, 'YOU', '#2f6ad0');
  for (const e of m.enemies) tag(e, e.name, '#a8322c');
  ctx.restore();
}
