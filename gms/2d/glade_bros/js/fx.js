// Speech bubbles, fart clouds, and rising emote pops — all drawn in world space.
import { TILE } from './config.js';

const bubbles = [];   // { target, text, t, dur }
const clouds = [];    // gas / dust particles
const pops = [];      // rising emoji

export function say(target, text, dur = 2.2) {
  clearBubble(target);
  bubbles.push({ target, text, t: 0, dur });
}
export function clearBubble(target) {
  for (let i = bubbles.length - 1; i >= 0; i--)
    if (bubbles[i].target === target) bubbles.splice(i, 1);
}
export function clearAllBubbles() { bubbles.length = 0; }

export function fart(x, y) {
  for (let i = 0; i < 24; i++) {
    const a = Math.random() * Math.PI * 2, sp = 8 + Math.random() * 30;
    clouds.push({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 16,
      r: 5 + Math.random() * 8, t: 0, life: 1.1 + Math.random() * 0.8,
      hue: 88 + Math.random() * 36,
    });
  }
  pop(x, y - 8, '💨', 1.1, -30);
}

export function lookPuff(x, y) {
  for (let i = 0; i < 8; i++) {
    const a = Math.random() * Math.PI * 2;
    clouds.push({ x, y, vx: Math.cos(a) * 20, vy: Math.sin(a) * 20, r: 3 + Math.random() * 3, t: 0, life: 0.5, gray: true });
  }
}

export function pop(x, y, icon, life = 1, vy = -26) { pops.push({ x, y, icon, t: 0, life, vy }); }

export function updateFx(dt) {
  for (let i = clouds.length - 1; i >= 0; i--) {
    const p = clouds[i]; p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt;
    p.vy *= 0.92; p.vx *= 0.93; p.r += dt * 11;
    if (p.t >= p.life) clouds.splice(i, 1);
  }
  for (let i = pops.length - 1; i >= 0; i--) {
    const p = pops[i]; p.t += dt; p.y += p.vy * dt; p.vy *= 0.95;
    if (p.t >= p.life) pops.splice(i, 1);
  }
  for (let i = bubbles.length - 1; i >= 0; i--) {
    const b = bubbles[i]; b.t += dt; if (b.t >= b.dur) bubbles.splice(i, 1);
  }
}

export function drawFx(ctx) {
  // gas / dust
  for (const p of clouds) {
    const k = p.t / p.life, a = (1 - k) * 0.5;
    ctx.fillStyle = p.gray ? `rgba(208,202,196,${a})` : `hsla(${p.hue},58%,52%,${a})`;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill();
  }
  // rising emotes
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const p of pops) {
    const k = p.t / p.life;
    ctx.globalAlpha = 1 - k * k;
    ctx.font = `${Math.round(TILE * (0.5 + k * 0.25))}px serif`;
    ctx.fillText(p.icon, p.x, p.y);
  }
  ctx.globalAlpha = 1;
  // bubbles on top
  for (const b of bubbles) drawBubble(ctx, b);
}

function drawBubble(ctx, b) {
  const t = b.target;
  const fade = b.t < 0.12 ? b.t / 0.12 : (b.dur - b.t < 0.25 ? (b.dur - b.t) / 0.25 : 1);
  if (fade <= 0) return;
  const scale = 0.85 + 0.15 * Math.min(1, b.t / 0.12);

  ctx.save();
  ctx.font = `700 ${Math.round(TILE * 0.34)}px 'Baloo 2', sans-serif`;
  const padX = 10, padY = 7;
  const tw = ctx.measureText(b.text).width;
  const w = tw + padX * 2, h = TILE * 0.34 + padY * 2;
  const cx = t.pos.x;
  const by = t.pos.y - TILE * 0.9 - h;       // bubble bottom sits above the head
  const x = cx - w / 2, y = by;

  ctx.globalAlpha = fade;
  ctx.translate(cx, by + h);
  ctx.scale(scale, scale);
  ctx.translate(-cx, -(by + h));

  // body
  roundRect(ctx, x, y, w, h, 10);
  ctx.fillStyle = '#fff6e9';
  ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = '#2a1d3a'; ctx.stroke();
  // tail
  ctx.beginPath();
  ctx.moveTo(cx - 7, y + h - 1);
  ctx.lineTo(cx, y + h + 11);
  ctx.lineTo(cx + 7, y + h - 1);
  ctx.closePath();
  ctx.fillStyle = '#fff6e9'; ctx.fill();
  ctx.strokeStyle = '#2a1d3a'; ctx.stroke();
  // text
  ctx.fillStyle = '#2a1d3a';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(b.text, cx, y + h / 2 + 1);
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, rad) {
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}
