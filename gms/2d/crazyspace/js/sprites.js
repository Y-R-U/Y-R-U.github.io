// sprites.js — pre-render glow blobs & vector ships to offscreen canvases.
// Drawing cached bitmaps (with additive blend for glow) is far cheaper on
// mobile than per-frame shadowBlur, and gives the neon Subspace look.

import { TAU } from './util.js';

const cache = new Map();
function make(key, w, h, draw) {
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas');
  c.width = Math.ceil(w);
  c.height = Math.ceil(h);
  const ctx = c.getContext('2d');
  draw(ctx, c.width, c.height);
  cache.set(key, c);
  return c;
}

// Soft radial glow blob, bright core.
export function glow(color, radius, core = 0.35) {
  const r = Math.ceil(radius);
  return make(`glow:${color}:${r}:${core}`, r * 2, r * 2, (ctx, w, h) => {
    const g = ctx.createRadialGradient(r, r, 0, r, r, r);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(core, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(r, r, r, 0, TAU);
    ctx.fill();
  });
}

// Solid-ish orb with halo (bombs, prizes).
export function orb(color, radius) {
  const r = Math.ceil(radius * 2.2);
  return make(`orb:${color}:${radius}`, r * 2, r * 2, (ctx, w, h) => {
    const cx = w / 2, cy = h / 2;
    const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    halo.addColorStop(0, color);
    halo.addColorStop(0.4, color);
    halo.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
    const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    core.addColorStop(0, '#ffffff');
    core.addColorStop(0.5, color);
    core.addColorStop(1, color);
    ctx.fillStyle = core;
    ctx.beginPath(); ctx.arc(cx, cy, radius, 0, TAU); ctx.fill();
  });
}

function shipPath(ctx, shape, R) {
  ctx.beginPath();
  switch (shape) {
    case 'dart':
      ctx.moveTo(R, 0);
      ctx.lineTo(-R * 0.7, R * 0.85);
      ctx.lineTo(-R * 0.35, 0);
      ctx.lineTo(-R * 0.7, -R * 0.85);
      break;
    case 'spider':
      ctx.moveTo(R, 0);
      ctx.lineTo(-R * 0.2, R * 0.55);
      ctx.lineTo(-R * 0.85, R * 0.95);
      ctx.lineTo(-R * 0.5, 0);
      ctx.lineTo(-R * 0.85, -R * 0.95);
      ctx.lineTo(-R * 0.2, -R * 0.55);
      break;
    case 'heavy':
      ctx.moveTo(R, R * 0.32);
      ctx.lineTo(R, -R * 0.32);
      ctx.lineTo(R * 0.2, -R);
      ctx.lineTo(-R, -R * 0.7);
      ctx.lineTo(-R, R * 0.7);
      ctx.lineTo(R * 0.2, R);
      break;
    case 'wedge':
      ctx.moveTo(R, 0);
      ctx.lineTo(-R * 0.8, R * 0.7);
      ctx.lineTo(-R * 0.55, 0);
      ctx.lineTo(-R * 0.8, -R * 0.7);
      break;
    default: // arrow
      ctx.moveTo(R, 0);
      ctx.lineTo(-R * 0.75, R * 0.78);
      ctx.lineTo(-R * 0.45, 0);
      ctx.lineTo(-R * 0.75, -R * 0.78);
  }
  ctx.closePath();
}

// Ship sprite pointing +x (right). team = {color, glow, dark}
export function ship(shape, team, radius) {
  const R = radius;
  const pad = R * 1.9;
  const key = `ship:${shape}:${team.color}:${R}`;
  return make(key, pad * 2, pad * 2, (ctx, w, h) => {
    ctx.translate(w / 2, h / 2);

    // outer glow
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.5;
    ctx.shadowColor = team.glow;
    ctx.shadowBlur = R * 0.9;
    shipPath(ctx, shape, R);
    ctx.fillStyle = team.color;
    ctx.fill();
    ctx.restore();

    // body gradient
    const g = ctx.createLinearGradient(-R, -R, R, R);
    g.addColorStop(0, team.dark);
    g.addColorStop(0.5, team.color);
    g.addColorStop(1, '#ffffff');
    shipPath(ctx, shape, R);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = team.glow;
    ctx.stroke();

    // cockpit
    ctx.beginPath();
    ctx.arc(R * 0.12, 0, R * 0.26, 0, TAU);
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.fill();
  });
}

// Small four-point star/diamond prize.
export function prize(color, radius) {
  const r = Math.ceil(radius * 2.4);
  return make(`prize:${color}:${radius}`, r * 2, r * 2, (ctx, w, h) => {
    const cx = w / 2, cy = h / 2;
    const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    halo.addColorStop(0, color);
    halo.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.6; ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.translate(cx, cy);
    ctx.beginPath();
    const R = radius;
    ctx.moveTo(0, -R); ctx.lineTo(R * 0.4, 0);
    ctx.lineTo(0, R); ctx.lineTo(-R * 0.4, 0);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, -R, 0, R);
    g.addColorStop(0, '#ffffff'); g.addColorStop(1, color);
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = '#eafff0'; ctx.lineWidth = 1; ctx.stroke();
  });
}

export function clearSprites() { cache.clear(); }
