// §3.5.1 / §3.5.4 — the BAKED signage sheet at runtime, plus the three hero canvases.
//
// P1b baked `assets/signs.png` (2048², 8-bit greyscale, 250 regions) and `data/signs.json`. This
// file turns those two into one texture and one index. It is the only place that knows how the
// sheet is laid out; placement (signage.js) asks for "a blade" or "a board that says OPEN" and
// never touches a UV.
//
// Three rules from the bake that a reader will otherwise get wrong:
//
//   flipY = false     u,v are TOP-LEFT-origin fractions, exactly as js/atlas.js works. The quad
//                     shader flips v (materials.js §6). Load it the other way and the whole city
//                     reads upside down.
//   NoColorSpace      it is a MASK, not colour. An sRGB decode crushes the mid-greys the abstract
//                     glyph generator lives in.
//   3 mip levels      hand-built and stopped there. Beyond level 2 the bake's 4 px padding ring is
//                     under one texel and neighbouring regions bleed into each other — a smear
//                     that looks exactly like a bad atlas and cannot be fixed downstream.

import * as THREE from 'three';
import { xorshift32 } from './utils.js';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function halve(src) {
  const c = canvas(Math.max(1, src.width >> 1), Math.max(1, src.height >> 1));
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

export async function loadSignAtlas(renderer, base = './') {
  const [data, bmp] = await Promise.all([
    fetch(base + 'data/signs.json').then(r => r.json()),
    fetch(base + 'assets/signs.png').then(r => r.blob()).then(b => createImageBitmap(b)),
  ]);

  const c0 = canvas(bmp.width, bmp.height);
  c0.getContext('2d').drawImage(bmp, 0, 0);
  bmp.close?.();

  const levels = Math.max(1, data.mipLevels || 3);
  const mips = [c0];
  for (let i = 1; i < levels; i++) mips.push(halve(mips[i - 1]));

  const tex = new THREE.CanvasTexture(c0);
  tex.flipY = false;
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = false;
  tex.mipmaps = mips;
  // §3.5.4: 4 keeps a blade legible at the grazing angles you get flying down a canyon.
  tex.anisotropy = Math.min(4, renderer ? renderer.capabilities.getMaxAnisotropy() : 4);
  tex.needsUpdate = true;

  // A WebGL1 context cannot allocate a clamped chain, and an incomplete manual one samples black.
  if (renderer && !renderer.capabilities.isWebGL2) {
    tex.mipmaps = [];
    tex.generateMipmaps = true;
    console.warn('[neonhaul] WebGL1 context — the signage sheet falls back to a generated mip chain');
  }

  const regions = data.regions;
  const byKind = {};
  for (const r of regions) (byKind[r.kind] = byKind[r.kind] || []).push(r);

  return {
    tex, data, regions, byKind, levels,
    size: data.size,
    // "the board that says OPEN 24H", for landmark signage. Falls back to the kind's first tile.
    find(kind, text) {
      const list = byKind[kind];
      if (!list || !list.length) return null;
      if (!text) return list[0];
      return list.find(r => r.text === text) || null;
    },
    pick(kind, u) {
      const list = byKind[kind];
      if (!list || !list.length) return null;
      return list[Math.min(list.length - 1, (u * list.length) | 0)];
    },
  };
}

// ── the hero billboard canvases (§3.5.4) ───────────────────────────────────
//
// Three shared 256x512 panels in one 768x512 strip, redrawn at 8 fps. Twelve quads index into it
// with `iRegion`, so the whole L5 layer is ONE draw call and three canvas redraws a second.
//
// Content is abstract by construction — colour wipes, bar fields, sweeping arcs, ticker rules.
// Nothing figurative here (§1.1); the eight figurative POSTER tiles are baked into the sheet and
// live on upper facades under DECISIONS decision 9, which is a different layer entirely.

const PANEL_W = 256, PANEL_H = 512, PANELS = 3;

const HERO_PALETTES = [
  ['#12f0ff', '#0b6a86', '#ffffff', '#043040'],
  ['#ff2a9d', '#7a0b4c', '#ffd6ec', '#2b0418'],
  ['#ffb04a', '#7a4a10', '#fff0d0', '#2a1604'],
];

export function heroCanvases(seed = 0x5a17) {
  const c = canvas(PANEL_W * PANELS, PANEL_H);
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, c.width, c.height);

  const tex = new THREE.CanvasTexture(c);
  tex.flipY = false;                       // same convention as the sheet — the shader flips v
  tex.colorSpace = THREE.SRGBColorSpace;   // this one IS colour
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;

  // Per-panel deterministic constants, drawn once so the redraw is pure animation.
  const rng = xorshift32(seed);
  const panels = [];
  for (let p = 0; p < PANELS; p++) {
    const bars = [];
    for (let i = 0; i < 14; i++) bars.push([rng(), rng(), rng()]);
    panels.push({ pal: HERO_PALETTES[p], bars, phase: rng() * 10, rate: 0.25 + rng() * 0.5 });
  }

  function draw(t) {
    for (let p = 0; p < PANELS; p++) {
      const x0 = p * PANEL_W;
      const { pal, bars, phase, rate } = panels[p];
      g.save();
      g.beginPath();
      g.rect(x0, 0, PANEL_W, PANEL_H);
      g.clip();

      g.fillStyle = pal[3];
      g.fillRect(x0, 0, PANEL_W, PANEL_H);

      // a slow colour wipe down the panel
      const wy = ((t * rate * 0.35 + phase) % 1.6 - 0.3) * PANEL_H;
      const grad = g.createLinearGradient(0, wy - 160, 0, wy + 160);
      grad.addColorStop(0, pal[3]);
      grad.addColorStop(0.5, pal[1]);
      grad.addColorStop(1, pal[3]);
      g.fillStyle = grad;
      g.fillRect(x0, 0, PANEL_W, PANEL_H);

      // a field of bars with a travelling highlight
      for (let i = 0; i < bars.length; i++) {
        const [a, b, d] = bars[i];
        const y = 24 + i * 34;
        const w = PANEL_W * (0.18 + a * 0.66);
        const x = x0 + (PANEL_W - w) * b;
        const lit = Math.abs(((t * rate + phase + d) % 1) - i / bars.length) < 0.09;
        g.fillStyle = lit ? pal[0] : pal[2];
        g.globalAlpha = lit ? 0.95 : 0.16;
        g.fillRect(x, y, w, 12 + d * 10);
      }
      g.globalAlpha = 1;

      // a sweeping arc pair, the "screen is alive" tell at distance
      const a0 = t * rate * 1.7 + phase;
      g.strokeStyle = pal[0];
      g.lineWidth = 7;
      for (let k = 0; k < 2; k++) {
        g.beginPath();
        g.arc(x0 + PANEL_W / 2, PANEL_H * 0.5, 56 + k * 46, a0 + k * 2.1, a0 + k * 2.1 + 1.5);
        g.stroke();
      }

      // a ticker rule along the bottom
      g.fillStyle = pal[0];
      const tw = 22, off = (t * 46 * rate) % tw;
      for (let x = -tw; x < PANEL_W + tw; x += tw) g.fillRect(x0 + x + off, PANEL_H - 46, tw * 0.6, 16);

      g.restore();
    }
    tex.needsUpdate = true;
  }

  draw(0);
  return {
    tex, canvas: c, panels: PANELS, draw,
    // iRegion for panel p, in the same top-left fraction form the sheet uses.
    region: p => ({ u: (p % PANELS) / PANELS, v: 0, w: 1 / PANELS, h: 1, aspect: PANEL_W / PANEL_H }),
  };
}
