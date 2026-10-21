import * as THREE from 'three';
import { rng, fbm } from './util.js';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

// Tileable fbm: blend of four offset copies so the texture wraps seamlessly.
function tfbm(x, y, S, sc, oct) {
  const u = x / S, v = y / S;
  const f = (a, b) => fbm(a / sc, b / sc, oct);
  return f(x, y) * (1 - u) * (1 - v) + f(x - S, y) * u * (1 - v) + f(x, y - S) * (1 - u) * v + f(x - S, y - S) * u * v;
}

function tex(c, renderer, { repeat = false, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// Seamless asphalt tile (light grey; tinted per-surface by vertex colour).
export function asphaltTexture(renderer, size = 512) {
  const [c, g] = canvas(size, size);
  const img = g.createImageData(size, size);
  const r = rng(11);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const big = tfbm(x, y, size, 64, 3);
    let v = 178 + (big - 0.5) * 10 + (r() - 0.5) * 30;
    const s = r();
    if (s > 0.985) v += 40; else if (s < 0.02) v -= 45;
    const k = (y * size + x) * 4;
    img.data[k] = v; img.data[k + 1] = v; img.data[k + 2] = v + 2; img.data[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return tex(c, renderer, { repeat: true });
}

export function grassTexture(renderer, size = 512) {
  const [c, g] = canvas(size, size);
  const img = g.createImageData(size, size);
  const r = rng(5);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const n = tfbm(x, y, size, 40, 4);
    const b = 0.86 + (n - 0.5) * 0.35 + (r() - 0.5) * 0.22;
    const k = (y * size + x) * 4;
    img.data[k] = 200 * b; img.data[k + 1] = 215 * b; img.data[k + 2] = 190 * b; img.data[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return tex(c, renderer, { repeat: true });
}

// Patchwork farmland, mirrored-tiled across the world.
export function farmTexture(renderer, size = 2048) {
  const [c, g] = canvas(size, size);
  const r = rng(42);
  g.fillStyle = '#6f8646';
  g.fillRect(0, 0, size, size);
  const cols = ['#7b8f4c', '#a39a63', '#687f40', '#b3a46c', '#7f9550', '#8f7e58', '#62793e', '#97a05e', '#857452', '#748a49'];
  const fields = [];
  const split = (x, y, w, h, depth) => {
    const lim = 110 + r() * 260;
    if ((w < lim && h < lim) || depth > 9) { fields.push([x, y, w, h]); return; }
    const t = 0.3 + r() * 0.4;
    if (w > h * (0.7 + r() * 0.6)) { split(x, y, w * t, h, depth + 1); split(x + w * t, y, w * (1 - t), h, depth + 1); }
    else { split(x, y, w, h * t, depth + 1); split(x, y + h * t, w, h * (1 - t), depth + 1); }
  };
  split(0, 0, size, size, 0);
  for (const [px, py, w, h] of fields) {
    const wood = r() < 0.1;
    g.fillStyle = wood ? '#3f5a2c' : cols[(r() * cols.length) | 0];
    g.fillRect(px, py, w + 1, h + 1);
    if (wood) {
      for (let k = 0; k < w * h / 5; k++) {
        g.fillStyle = r() < 0.5 ? 'rgba(30,48,22,0.55)' : 'rgba(92,118,62,0.45)';
        g.beginPath(); g.arc(px + r() * w, py + r() * h, 1 + r() * 2.2, 0, Math.PI * 2); g.fill();
      }
    } else if (r() < 0.75) {
      g.globalAlpha = 0.12 + r() * 0.1;
      g.fillStyle = r() < 0.6 ? '#3d3a26' : '#e8e2c0';
      const step = 8 + r() * 8;
      const vert = r() < 0.5;
      for (let q = step / 2; q < (vert ? w : h); q += step) {
        if (vert) g.fillRect(px + q, py, 1.2, h); else g.fillRect(px, py + q, w, 1.2);
      }
      g.globalAlpha = 1;
    }
    g.strokeStyle = 'rgba(52,70,36,0.6)';
    g.lineWidth = 2.2;
    g.strokeRect(px + 1, py + 1, w - 2, h - 2);
    if (r() < 0.5) {
      g.fillStyle = 'rgba(40,62,30,0.85)';
      for (let k = 0; k < (w + h) / 14; k++) {
        const e = r() < 0.5, along = r();
        g.beginPath(); g.arc(e ? px + along * w : px + 1, e ? py + 1 : py + along * h, 2.5 + r() * 2.5, 0, Math.PI * 2); g.fill();
      }
    }
  }
  const img = g.getImageData(0, 0, size, size);
  const d = img.data;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const k = (y * size + x) * 4;
    const v = 0.9 + (fbm(x / 70, y / 70, 3) - 0.5) * 0.22 + (r() - 0.5) * 0.06;
    d[k] *= v; d[k + 1] *= v; d[k + 2] *= v;
  }
  g.putImageData(img, 0, 0);
  const t = tex(c, renderer);
  t.wrapS = t.wrapT = THREE.MirroredRepeatWrapping;
  return t;
}

// R = mown airfield grass, G = lake shore, over [-extent, extent]^2.
export function maskTexture(renderer, extent, isAirfield, lake, isStrip, size = 512) {
  const [c, g] = canvas(size, size);
  const img = g.createImageData(size, size);
  const cell = (2 * extent) / size;
  for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
    const x = -extent + (px + 0.5) * cell, z = -extent + (py + 0.5) * cell;
    const k = (py * size + px) * 4;
    const ld = Math.hypot((x - lake.x) / lake.rx, (z - lake.z) / lake.rz);
    img.data[k] = isAirfield(x, z) * 255;
    img.data[k + 1] = Math.max(0, Math.min(1, (1.25 - ld) / 0.25)) * 255;
    img.data[k + 2] = isStrip(x, z) * 255;
    img.data[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.flipY = false;
  t.minFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  return t;
}

// Rubber / crack-seal / patch decals, white-on-transparent (material colour darkens them).
export function skidAtlas(renderer) {
  const S = 1024;
  const [c, g] = canvas(S, S);
  const r = rng(7);
  // cells: [0..3] streaks (each 64x1024 column), [4] cracks 512x512 at (512,0), [5] cracks (512,512), patch (256,0) 256x512
  for (let k = 0; k < 4; k++) {
    const x0 = k * 64;
    for (let y = 0; y < S; y++) {
      const t = y / S;
      const env = Math.pow(Math.sin(Math.PI * t), 0.6) * (0.55 + 0.45 * fbm(k * 9, y / 40, 2));
      for (let x = 0; x < 64; x++) {
        const u = (x - 32) / 32;
        const tracks = Math.exp(-Math.pow((Math.abs(u) - 0.45) / 0.22, 2));
        const a = env * tracks * (0.7 + 0.3 * r());
        g.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`;
        g.fillRect(x0 + x, y, 1, 1);
      }
    }
  }
  for (let cellY = 0; cellY < 2; cellY++) {
    g.save();
    g.beginPath(); g.rect(512, cellY * 512, 512, 512); g.clip();
    g.strokeStyle = 'rgba(255,255,255,0.9)';
    g.lineCap = 'round';
    for (let n = 0; n < 4; n++) {
      const horiz = r() < 0.5;
      let x = 512 + (horiz ? 10 : 60 + r() * 392), y = cellY * 512 + (horiz ? 60 + r() * 392 : 10);
      let a = horiz ? 0 : Math.PI / 2;
      const a0 = a;
      g.lineWidth = 1.5 + r() * 1.5;
      g.beginPath(); g.moveTo(x, y);
      for (let s2 = 0; s2 < 120; s2++) {
        a += (r() - 0.5) * 0.5 + (a0 - a) * 0.15;
        x += Math.cos(a) * 4.2; y += Math.sin(a) * 4.2;
        g.lineTo(x, y);
        if (r() < 0.02) { const bx = x, by = y; g.moveTo(bx + Math.cos(a + 1) * 20, by + Math.sin(a + 1) * 20); g.lineTo(bx, by); }
      }
      g.stroke();
    }
    g.restore();
  }
  const grd = g.createRadialGradient(384, 256, 20, 384, 256, 130);
  grd.addColorStop(0, 'rgba(255,255,255,0.8)');
  grd.addColorStop(0.75, 'rgba(255,255,255,0.7)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(256, 0, 256, 512);
  const t = tex(c, renderer, { srgb: false });
  return { texture: t, streak: (k) => [k * 64 / S, 0, (k + 1) * 64 / S, 1], crack: (k) => [0.5, k ? 0 : 0.5, 1, k ? 0.5 : 1], patch: [0.25, 0.5, 0.5, 1] };
}

const FONT = '"DIN Condensed","DIN Alternate","Roboto Condensed","Arial Narrow","Helvetica Neue",Arial,sans-serif';

function fitText(g, text, x, y, w, h, color, weight = 700, stretch = true) {
  g.save();
  g.font = `${weight} ${h}px ${FONT}`;
  g.textBaseline = 'alphabetic';
  g.textAlign = 'left';
  const m = g.measureText(text);
  const asc = m.actualBoundingBoxAscent, desc = m.actualBoundingBoxDescent;
  const tw = m.actualBoundingBoxRight + m.actualBoundingBoxLeft;
  const sy = h / (asc + desc);
  const sx = stretch ? w / tw : Math.min(sy, w / tw);
  g.translate(x + (w - tw * sx) / 2, y);
  g.scale(sx, sy);
  g.fillStyle = color;
  g.fillText(text, m.actualBoundingBoxLeft, asc);
  g.restore();
}

function arrow(g, x, y, s, dir, color) {
  g.save();
  g.translate(x, y); g.rotate(dir); g.fillStyle = color;
  g.beginPath();
  g.moveTo(s * 0.5, 0); g.lineTo(0, -s * 0.42); g.lineTo(0, -s * 0.14); g.lineTo(-s * 0.5, -s * 0.14);
  g.lineTo(-s * 0.5, s * 0.14); g.lineTo(0, s * 0.14); g.lineTo(0, s * 0.42); g.closePath(); g.fill();
  g.restore();
}

function crown(g, cx, cy, w, h) {
  g.save();
  g.translate(cx - w / 2, cy - h / 2);
  const gold = g.createLinearGradient(0, 0, 0, h);
  gold.addColorStop(0, '#ffe58a'); gold.addColorStop(0.5, '#e0a922'); gold.addColorStop(1, '#a8740e');
  g.fillStyle = gold;
  g.beginPath();
  g.moveTo(0, h); g.lineTo(0, h * 0.3); g.lineTo(w * 0.2, h * 0.62); g.lineTo(w * 0.35, h * 0.12); g.lineTo(w * 0.5, h * 0.55);
  g.lineTo(w * 0.65, h * 0.12); g.lineTo(w * 0.8, h * 0.62); g.lineTo(w, h * 0.3); g.lineTo(w, h); g.closePath(); g.fill();
  g.fillStyle = '#7a1030';
  g.fillRect(0, h * 0.78, w, h * 0.1);
  for (const [px, py, cc] of [[0, 0.27, '#fff'], [0.35, 0.1, '#fff'], [0.65, 0.1, '#fff'], [1, 0.27, '#fff'], [0.5, 0.83, '#2a7de1'], [0.25, 0.83, '#d61f45'], [0.75, 0.83, '#1aa860']]) {
    g.fillStyle = cc;
    g.beginPath(); g.arc(px * w, py * h, w * 0.045, 0, Math.PI * 2); g.fill();
  }
  g.restore();
}

function crest(g, x, y, s) {
  g.save();
  g.translate(x, y);
  const sh = new Path2D();
  sh.moveTo(s * 0.18, s * 0.3); sh.lineTo(s * 0.82, s * 0.3); sh.lineTo(s * 0.82, s * 0.62);
  sh.quadraticCurveTo(s * 0.8, s * 0.86, s * 0.5, s * 0.97); sh.quadraticCurveTo(s * 0.2, s * 0.86, s * 0.18, s * 0.62); sh.closePath();
  g.fillStyle = '#4b1f7a'; g.fill(sh);
  g.save(); g.clip(sh);
  g.fillStyle = '#e8b82a';
  g.fillRect(s * 0.5, s * 0.3, s * 0.35, s * 0.33);
  g.fillRect(s * 0.15, s * 0.63, s * 0.35, s * 0.4);
  g.strokeStyle = '#fff'; g.lineWidth = s * 0.03;
  g.beginPath(); g.moveTo(s * 0.18, s * 0.86); g.lineTo(s * 0.82, s * 0.36); g.stroke();
  g.restore();
  g.lineWidth = s * 0.025; g.strokeStyle = '#f3d36b'; g.stroke(sh);
  g.fillStyle = '#ffffff';
  g.save(); g.translate(s * 0.5, s * 0.62); g.rotate(-0.5);
  g.beginPath(); g.ellipse(0, 0, s * 0.2, s * 0.035, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.moveTo(-s * 0.04, 0); g.lineTo(s * 0.03, -s * 0.2); g.lineTo(s * 0.08, -s * 0.2); g.lineTo(s * 0.05, 0);
  g.lineTo(s * 0.08, s * 0.2); g.lineTo(s * 0.03, s * 0.2); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(-s * 0.17, 0); g.lineTo(-s * 0.21, -s * 0.07); g.lineTo(-s * 0.18, -s * 0.07); g.lineTo(-s * 0.13, 0); g.closePath(); g.fill();
  g.restore();
  crown(g, s * 0.5, s * 0.17, s * 0.42, s * 0.24);
  g.fillStyle = '#7a1030';
  g.beginPath(); g.moveTo(s * 0.04, s * 0.83); g.quadraticCurveTo(s * 0.5, s * 1.02, s * 0.96, s * 0.83);
  g.lineTo(s * 0.96, s * 0.93); g.quadraticCurveTo(s * 0.5, s * 1.12, s * 0.04, s * 0.93); g.closePath();
  g.restore();
}

// Shelf-packed atlas for all decals: runway numbers, stand labels, signs, crest, lettering, flags.
export function decalAtlas(renderer) {
  const S = 2048;
  const [c, g] = canvas(S, S);
  const uv = {};
  let x = 0, y = 0, rowH = 0;
  const PAD = 8;
  const place = (name, w, h, draw) => {
    if (x + w > S) { x = 0; y += rowH + PAD * 2; rowH = 0; }
    const px = x + PAD, py = y + PAD;
    g.save(); g.beginPath(); g.rect(px, py, w, h); g.clip();
    draw(px, py, w, h);
    g.restore();
    uv[name] = [px / S, 1 - (py + h) / S, (px + w) / S, 1 - py / S];
    x += w + PAD * 2; rowH = Math.max(rowH, h);
  };
  // Runway designators: two 9 m tall digits, 3 m wide, 1.5 m gap -> 7.5 x 9 m.
  for (const n of ['09', '27', '04', '22']) {
    place('rw' + n, 375, 450, (px, py, w, h) => {
      fitText(g, n[0], px, py, w * 0.4, h, '#fff', 700);
      fitText(g, n[1], px + w * 0.6, py, w * 0.4, h, '#fff', 700);
    });
  }
  for (let i = 1; i <= 8; i++) place('stand' + i, 256, 128, (px, py, w, h) => fitText(g, 'S' + i, px + 20, py + 10, w - 40, h - 20, '#f2c418', 700));
  const sign = (name, text, kind, w = 512) => place(name, w, 128, (px, py, w, h) => {
    if (kind === 'mand') {
      g.fillStyle = '#0d0d0d'; g.fillRect(px, py, w, h);
      g.fillStyle = '#c4122f'; g.fillRect(px + 8, py + 8, w - 16, h - 16);
      fitText(g, text, px + 30, py + 26, w - 60, h - 52, '#fff', 700, false);
    } else if (kind === 'loc') {
      g.fillStyle = '#0d0d0d'; g.fillRect(px, py, w, h);
      g.strokeStyle = '#f5c400'; g.lineWidth = 8; g.strokeRect(px + 14, py + 14, w - 28, h - 28);
      fitText(g, text, px + 34, py + 30, w - 68, h - 60, '#f5c400', 700, false);
    } else {
      g.fillStyle = '#0d0d0d'; g.fillRect(px, py, w, h);
      g.fillStyle = '#f5c400'; g.fillRect(px + 8, py + 8, w - 16, h - 16);
      const [t, dir] = text;
      fitText(g, t, px + 24, py + 28, w - 130, h - 56, '#111', 700, false);
      arrow(g, px + w - 60, py + h / 2, 70, dir, '#111');
    }
  });
  for (const t of ['27-09', '09-27', '22-04', '04-22']) sign('m' + t, t, 'mand');
  for (const t of ['A', 'A1', 'A2', 'A3', 'A4']) sign('l' + t, t, 'loc', 256);
  sign('dA1', ['A1', Math.PI], 'dir', 384);
  sign('dA4', ['A4', 0], 'dir', 384);
  sign('dApron', ['APRON', -Math.PI / 2], 'dir', 512);
  place('crest', 512, 512, (px, py, w) => crest(g, px, py, w));
  place('crown', 256, 160, (px, py, w, h) => crown(g, px + w / 2, py + h / 2, w * 0.9, h * 0.9));
  place('name', 2000, 150, (px, py, w, h) => {
    g.save();
    g.font = `700 ${h * 0.82}px Georgia,"Times New Roman",serif`;
    g.textBaseline = 'middle'; g.textAlign = 'center';
    const gold = g.createLinearGradient(0, py, 0, py + h);
    gold.addColorStop(0, '#fff0b0'); gold.addColorStop(0.5, '#e7b631'); gold.addColorStop(1, '#a8740e');
    g.fillStyle = gold;
    g.shadowColor = 'rgba(0,0,0,0.6)'; g.shadowOffsetY = 4; g.shadowBlur = 4;
    g.fillText('KRAYZEE ROYAL AIRPORT', px + w / 2, py + h / 2 + 6, w - 20);
    g.restore();
  });
  place('flag', 384, 256, (px, py, w, h) => {
    g.fillStyle = '#4b1f7a'; g.fillRect(px, py, w, h);
    g.fillStyle = '#e8b82a'; g.fillRect(px, py + h * 0.36, w, h * 0.28);
    g.fillStyle = '#d61f6a';
    g.beginPath();
    for (let k = 0; k <= 8; k++) g.lineTo(px + (k / 8) * w, py + h * (k % 2 ? 0.44 : 0.56));
    g.lineTo(px + w, py + h * 0.6); g.lineTo(px, py + h * 0.6); g.fill();
    crown(g, px + w * 0.3, py + h * 0.5, w * 0.26, h * 0.3);
  });
  place('flag2', 384, 256, (px, py, w, h) => {
    g.fillStyle = '#e8b82a'; g.fillRect(px, py, w, h);
    g.fillStyle = '#d61f6a';
    for (let k = 0; k < 5; k++) g.fillRect(px, py + k * h / 5 + h / 10 - 6, w, 12);
    g.fillStyle = '#4b1f7a'; g.fillRect(px, py, w * 0.42, h * 0.55);
    crown(g, px + w * 0.21, py + h * 0.28, w * 0.26, h * 0.32);
  });
  place('twr', 512, 128, (px, py, w, h) => {
    g.fillStyle = '#4b1f7a'; g.fillRect(px, py, w, h);
    fitText(g, 'ROYAL TOWER', px + 30, py + 30, w - 60, h - 60, '#f3d36b', 700, false);
  });
  place('screen', 128, 96, (px, py, w, h) => {
    g.fillStyle = '#061a2a'; g.fillRect(px, py, w, h);
    g.strokeStyle = '#3cf0a0'; g.lineWidth = 2;
    g.beginPath(); g.arc(px + w * 0.35, py + h / 2, h * 0.4, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#9fffd0';
    for (let k = 0; k < 7; k++) g.fillRect(px + w * 0.35 + Math.cos(k * 1.7) * h * 0.3, py + h / 2 + Math.sin(k * 2.3) * h * 0.3, 4, 4);
    g.fillStyle = '#7fd7ff';
    for (let k = 0; k < 6; k++) g.fillRect(px + w * 0.72, py + 10 + k * 13, w * 0.22, 5);
  });
  const t = tex(c, renderer);
  return { texture: t, uv };
}

export function uvQuad(r) {
  return [r[0], r[1], r[2], r[1], r[2], r[3], r[0], r[3]];
}
