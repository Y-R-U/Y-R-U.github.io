/* A 2D silhouette for cards, traced from the same profile() the 3D mesh uses,
   so an icon can never be a lie about the animal. */

import { profile, centreline } from '../render/fishgeo.js';
import { clamp, TAU } from '../util.js';

const hex = n => '#' + (n >>> 0).toString(16).padStart(6, '0');

export function drawSpecies(cv, sp) {
  const w = cv.width, h = cv.height, c = cv.getContext('2d');
  c.clearRect(0, 0, w, h);
  const B = sp.body;
  const cx = w * 0.50, cy = h * 0.54, L = w * 0.72;

  if (sp.shape === 'jelly') {
    const grd = c.createLinearGradient(0, cy - h * 0.3, 0, cy + h * 0.3);
    grd.addColorStop(0, hex(sp.pal.belly)); grd.addColorStop(1, hex(sp.pal.body));
    c.fillStyle = grd; c.globalAlpha = 0.85;
    c.beginPath(); c.ellipse(cx, cy - h * 0.05, L * 0.34, L * 0.27, 0, Math.PI, 0); c.closePath(); c.fill();
    c.globalAlpha = 0.7; c.strokeStyle = hex(sp.pal.accent); c.lineWidth = 1.4;
    for (let i = 0; i < 8; i++) {
      const x = cx - L * 0.30 + i * L * 0.086;
      c.beginPath(); c.moveTo(x, cy - h * 0.05);
      c.quadraticCurveTo(x + Math.sin(i) * 5, cy + h * 0.18, x + Math.cos(i) * 6, cy + h * 0.36);
      c.stroke();
    }
    c.globalAlpha = 1; return;
  }
  if (sp.shape === 'seahorse') {
    const grd = c.createLinearGradient(0, cy - h * 0.35, 0, cy + h * 0.35);
    grd.addColorStop(0, hex(sp.pal.body)); grd.addColorStop(1, hex(sp.pal.belly));
    c.strokeStyle = grd; c.lineWidth = Math.max(3.5, h * 0.15); c.lineCap = 'round';
    c.beginPath(); c.moveTo(cx + L * 0.13, cy - h * 0.34);
    c.quadraticCurveTo(cx - L * 0.17, cy - h * 0.08, cx - L * 0.02, cy + h * 0.18);
    c.quadraticCurveTo(cx + L * 0.15, cy + h * 0.38, cx - L * 0.07, cy + h * 0.39);
    c.stroke();
    c.lineWidth = 2.2; c.beginPath(); c.moveTo(cx + L * 0.13, cy - h * 0.34); c.lineTo(cx + L * 0.38, cy - h * 0.30); c.stroke();
    c.fillStyle = '#0d0b07'; c.beginPath(); c.arc(cx + L * 0.10, cy - h * 0.30, 1.8, 0, TAU); c.fill();
    return;
  }
  if (sp.shape === 'snail') {
    c.fillStyle = hex(sp.pal.belly);
    c.beginPath(); c.ellipse(cx - L * 0.05, cy + h * 0.18, L * 0.30, h * 0.09, 0, 0, TAU); c.fill();
    const grd = c.createRadialGradient(cx, cy - h * 0.05, 2, cx, cy - h * 0.05, L * 0.28);
    grd.addColorStop(0, hex(sp.pal.accent2)); grd.addColorStop(1, hex(sp.pal.body));
    c.fillStyle = grd;
    c.beginPath(); c.arc(cx, cy - h * 0.04, L * 0.27, 0, TAU); c.fill();
    c.strokeStyle = hex(sp.pal.accent); c.lineWidth = 2; c.beginPath();
    for (let a = 0; a < 9; a += 0.08) {
      const r = L * 0.27 * (a / 9);
      const x = cx + Math.cos(a * 2) * r, y = cy - h * 0.04 + Math.sin(a * 2) * r;
      a === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
    }
    c.stroke();
    return;
  }
  if (sp.shape === 'shrimp') {
    const grd = c.createLinearGradient(0, cy - h * 0.2, 0, cy + h * 0.2);
    grd.addColorStop(0, hex(sp.pal.body)); grd.addColorStop(1, hex(sp.pal.belly));
    c.strokeStyle = grd; c.lineWidth = Math.max(4, h * 0.17); c.lineCap = 'round';
    c.beginPath(); c.moveTo(cx + L * 0.30, cy - h * 0.03);
    c.quadraticCurveTo(cx - L * 0.08, cy + h * 0.02, cx - L * 0.30, cy + h * 0.22);
    c.stroke();
    c.lineWidth = 1.3; c.strokeStyle = 'rgba(255,255,255,.75)';
    c.beginPath(); c.moveTo(cx + L * 0.30, cy - h * 0.03); c.lineTo(cx + L * 0.50, cy - h * 0.22); c.stroke();
    c.beginPath(); c.moveTo(cx + L * 0.30, cy - h * 0.03); c.lineTo(cx + L * 0.48, cy - h * 0.08); c.stroke();
    c.fillStyle = '#100c0a'; c.beginPath(); c.arc(cx + L * 0.27, cy - h * 0.05, 2, 0, TAU); c.fill();
    return;
  }

  /* ── the general case: trace the real silhouette ─────────────────────── */
  const hgt = L * 0.5;
  const yOf = t => cy - (centreline(B, t) + profile(B, t)[0]) * hgt;
  const yUn = t => cy - (centreline(B, t) - profile(B, t)[0]) * hgt;
  const xOf = t => cx + (0.5 - t) * L;

  const grd = c.createLinearGradient(0, cy - hgt * B.h * 0.6, 0, cy + hgt * B.h * 0.6);
  grd.addColorStop(0, hex(sp.pal.body));
  grd.addColorStop(1, hex(sp.pal.belly));

  /* fins first, behind the body */
  c.fillStyle = hex(sp.pal.fin); c.globalAlpha = 0.85;
  const TL = B.tail;
  if (TL && TL.h > 0.03) {
    const th = TL.h * hgt * 0.5, tl = TL.len * L * (1 + (B.veil || 0) * 0.6);
    const x0 = xOf(1);
    c.beginPath();
    c.moveTo(x0, cy);
    const notch = TL.type === 'forked' || TL.type === 'lunate' || TL.type === 'lyre' ? 0.45 : 0.92;
    c.lineTo(x0 - tl, cy - th); c.lineTo(x0 - tl * notch, cy); c.lineTo(x0 - tl, cy + th);
    c.closePath(); c.fill();
  }
  const D = B.dorsal;
  if (D && D.h > 0.05) {
    const t0 = D.start, t1 = Math.min(0.92, D.start + D.len);
    c.beginPath(); c.moveTo(xOf(t0), yOf(t0));
    c.quadraticCurveTo(xOf((t0 + t1) / 2), yOf((t0 + t1) / 2) - D.h * hgt * 0.85, xOf(t1), yOf(t1));
    c.closePath(); c.fill();
  }
  const A = B.anal;
  if (A && A.h > 0.05) {
    const t0 = A.start, t1 = Math.min(0.94, A.start + A.len);
    c.beginPath(); c.moveTo(xOf(t0), yUn(t0));
    c.quadraticCurveTo(xOf((t0 + t1) / 2), yUn((t0 + t1) / 2) + A.h * hgt * 0.8, xOf(t1), yUn(t1));
    c.closePath(); c.fill();
  }
  c.globalAlpha = 1;

  /* body */
  c.beginPath();
  for (let i = 0; i <= 32; i++) { const t = i / 32; i === 0 ? c.moveTo(xOf(t), yOf(t)) : c.lineTo(xOf(t), yOf(t)); }
  for (let i = 32; i >= 0; i--) { const t = i / 32; c.lineTo(xOf(t), yUn(t)); }
  c.closePath();
  c.fillStyle = grd; c.fill();

  /* the pattern, clipped to the body */
  c.save(); c.clip();
  c.globalAlpha = 0.78; c.fillStyle = hex(sp.pal.accent);
  const pat = sp.pal.pattern;
  if (pat === 'bars' || pat === 'lionbars' || pat === 'clown' || pat === 'bands') {
    const n = pat === 'lionbars' ? 8 : pat === 'bands' ? 9 : pat === 'clown' ? 3 : 4;
    for (let i = 0; i < n; i++) {
      const t = 0.14 + i * (0.66 / n);
      c.fillRect(xOf(t) - (pat === 'clown' ? 2.6 : 1.8), 0, pat === 'clown' ? 5 : 3, h);
    }
  } else if (pat === 'neon') {
    c.fillRect(cx - L * 0.36, cy - hgt * B.h * 0.30, L * 0.74, Math.max(2, hgt * B.h * 0.22));
    c.fillStyle = hex(sp.pal.accent2);
    c.fillRect(cx - L * 0.42, cy + hgt * B.h * 0.06, L * 0.44, Math.max(1.6, hgt * B.h * 0.2));
  } else if (pat === 'stripes') {
    for (let i = 0; i < 5; i++) c.fillRect(0, cy - hgt * B.h * 0.4 + i * hgt * B.h * 0.22, w, Math.max(1.4, hgt * B.h * 0.07));
  } else if (pat === 'rainbow' || pat === 'gramma') {
    c.fillStyle = hex(sp.pal.fin); c.fillRect(cx - L * 0.5, 0, L * 0.5, h);
  } else if (pat === 'lamp') {
    c.fillStyle = hex(sp.pal.accent);
    c.beginPath(); c.ellipse(cx + L * 0.28, cy - hgt * B.h * 0.16, 4, 2.6, 0, 0, TAU); c.fill();
  } else if (pat === 'speckle' || pat === 'mottle' || pat === 'mandarin' || pat === 'discus') {
    for (let i = 0; i < 34; i++) {
      const t = 0.05 + (i * 0.618034 % 1) * 0.9;
      const yy = cy + (Math.sin(i * 3.1) * 0.5) * hgt * B.h * 0.8;
      c.fillStyle = i % 3 === 0 ? hex(sp.pal.accent2) : hex(sp.pal.accent);
      c.beginPath(); c.arc(xOf(t), yy, pat === 'mandarin' ? 2.6 : 1.7, 0, TAU); c.fill();
    }
  }
  c.restore(); c.globalAlpha = 1;

  /* eye */
  const te = 0.135;
  const eyY = cy - (centreline(B, te) + profile(B, te)[0] * 0.34) * hgt;
  const r = clamp(hgt * B.h * 0.16 * (B.eye || 1), 1.6, 5.5);
  c.fillStyle = '#f2ede2'; c.beginPath(); c.arc(xOf(te), eyY, r, 0, TAU); c.fill();
  c.fillStyle = '#0b0a09'; c.beginPath(); c.arc(xOf(te) + r * 0.22, eyY, r * 0.58, 0, TAU); c.fill();
  c.fillStyle = 'rgba(255,255,255,.9)'; c.beginPath(); c.arc(xOf(te) + r * 0.42, eyY - r * 0.3, r * 0.24, 0, TAU); c.fill();
}
