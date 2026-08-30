// Painted lettering on a board. One canvas texture per distinct string, cached, so four boards
// reading the same thing cost one texture.

import * as THREE from 'three';
import { track } from '../../engine/budget.js';

const cache = new Map();

// `px` is texels per world metre. 96 keeps a 9 m contract board inside 1024 across, which is what
// makes the letters hold up from the far side of a 29 m hall.
export function textTexture(text, { w, h, bg = '#e7e0cf', fg = '#22201c', px = 96, pad = 0.12,
  font = 'Georgia, "Times New Roman", serif', weight = '600', rule = null } = {}) {
  const key = [text, w, h, bg, fg, px, pad, font, weight, rule].join('|');
  const hit = cache.get(key);
  if (hit) return hit;

  // True aspect, not rounded to a power of two: WebGL2 mipmaps NPOT textures, and rounding a
  // 3.6:1 board up to 4:1 stretched every letter.
  const cw = texSize(w * px), ch = texSize(h * px);
  const c = document.createElement('canvas');
  c.width = cw; c.height = ch;
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, cw, ch);

  if (rule) {
    g.strokeStyle = rule;
    g.lineWidth = Math.max(2, ch * 0.022);
    g.strokeRect(ch * 0.05, ch * 0.05, cw - ch * 0.1, ch - ch * 0.1);
  }

  const m = pad * ch;
  const inner = { w: cw - m * 2, h: ch - m * 2 };
  const lines = String(text).split('\n');
  // Binary-free fit: start from the height a single line could take and shrink until the widest
  // line fits too. Cheap, and it runs once per string.
  let fs = inner.h / lines.length * 0.82;
  for (let i = 0; i < 40; i++) {
    g.font = `${weight} ${fs}px ${font}`;
    const wide = Math.max(...lines.map(l => g.measureText(l).width));
    if (wide <= inner.w) break;
    fs *= inner.w / wide;
  }
  g.font = `${weight} ${fs}px ${font}`;
  g.fillStyle = fg;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const step = fs * 1.16;
  const top = ch / 2 - (lines.length - 1) * step / 2;
  lines.forEach((l, i) => g.fillText(l, cw / 2, top + i * step));

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  track(tex, { w: cw, h: ch, label: `text:${text.slice(0, 24)}` });
  cache.set(key, tex);
  return tex;
}

const texSize = v => Math.min(2048, Math.max(64, Math.round(v / 4) * 4));
