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

// Periodic value noise (period p lattice cells) — seamless when sampled over [0, p).
function pnoise(x, y, p, seed) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const h = (a, b) => {
    let k = (((a % p) + p) % p) * 374761393 + (((b % p) + p) % p) * 668265263 + seed * 2246822519;
    k = Math.imul(k ^ (k >>> 13), 1274126177);
    return ((k ^ (k >>> 16)) >>> 0) / 4294967296;
  };
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function pfbm(x, y, p, oct, seed) {
  let s = 0, a = 0.5, n = 0;
  for (let i = 0; i < oct; i++) { s += a * pnoise(x, y, p, seed + i); n += a; x *= 2; y *= 2; p *= 2; a *= 0.5; }
  return s / n;
}

// Tiling detail: R = grass blades / soil grain, G = soft fbm, B = clumpy cells (canopy, hedges). Linear data.
export function detailTexture(renderer, size = 512) {
  const [c, g] = canvas(size, size);
  g.fillStyle = '#808080';
  g.fillRect(0, 0, size, size);
  const r = rng(5);
  g.lineCap = 'round';
  for (let k = 0; k < size * size / 22; k++) {
    const x = r() * size, y = r() * size, a = r() * Math.PI * 2, L = 1.5 + r() * 4.5;
    const v = (r() < 0.5 ? 40 + r() * 70 : 150 + r() * 100) | 0;
    g.strokeStyle = `rgba(${v},${v},${v},${0.35 + r() * 0.4})`;
    g.lineWidth = 0.6 + r() * 0.9;
    for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) {
      if (x + ox < -8 || x + ox > size + 8 || y + oy < -8 || y + oy > size + 8) continue;
      g.beginPath(); g.moveTo(x + ox, y + oy); g.lineTo(x + ox + Math.cos(a) * L, y + oy + Math.sin(a) * L); g.stroke();
    }
  }
  const blades = g.getImageData(0, 0, size, size).data;
  const data = new Uint8Array(size * size * 4);
  const CP = 10, jit = new Float32Array(CP * CP * 2);
  for (let k = 0; k < CP * CP; k++) { jit[k * 2] = 0.5 + (pnoise(k % CP + 0.5, (k / CP | 0) + 0.5, CP, 21) - 0.5) * 0.9; jit[k * 2 + 1] = 0.5 + (pnoise(k % CP + 0.5, (k / CP | 0) + 0.5, CP, 37) - 0.5) * 0.9; }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const k = (y * size + x) * 4;
    const u = x / size, v = y / size;
    const grain = pfbm(u * 32, v * 32, 32, 3, 3);
    data[k] = Math.max(0, Math.min(255, blades[k] * 0.75 + grain * 64));
    data[k + 1] = pfbm(u * 6, v * 6, 6, 5, 11) * 255;
    let md = 9;
    {
      const px = u * CP, py = v * CP, ix = Math.floor(px), iy = Math.floor(py);
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
        const cx = ix + i, cy = iy + j, ci = (((cy % CP) + CP) % CP) * CP + (((cx % CP) + CP) % CP);
        const jx = cx + jit[ci * 2] - px, jy = cy + jit[ci * 2 + 1] - py;
        md = Math.min(md, jx * jx + jy * jy);
      }
    }
    const cell = Math.max(0, 1 - Math.sqrt(md) * 1.45);
    data[k + 2] = Math.min(255, (cell * 0.75 + pfbm(u * 16, v * 16, 16, 2, 5) * 0.35) * 255);
    data[k + 3] = 255;
  }
  const t = new THREE.DataTexture(data, size, size);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  t.needsUpdate = true;
  return t;
}

// Ripple normal map (xy in RG), tiling.
export function waterNormalTexture(renderer, size = 256) {
  const data = new Uint8Array(size * size * 4);
  const hgt = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) hgt[y * size + x] = pfbm(x / size * 8, y / size * 8, 8, 4, 71);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const hx = hgt[y * size + (x + 1) % size] - hgt[y * size + (x + size - 1) % size];
    const hy = hgt[((y + 1) % size) * size + x] - hgt[((y + size - 1) % size) * size + x];
    const k = (y * size + x) * 4;
    data[k] = Math.max(0, Math.min(255, 128 - hx * 900));
    data[k + 1] = Math.max(0, Math.min(255, 128 - hy * 900));
    data[k + 2] = 255; data[k + 3] = 255;
  }
  const t = new THREE.DataTexture(data, size, size);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  t.needsUpdate = true;
  return t;
}

// World mask over [-extent, extent]^2: fn(x, z) -> [r, g, b, a] in 0..1.
export function maskTexture(extent, size, fn) {
  const data = new Uint8Array(size * size * 4);
  const cell = (2 * extent) / size;
  for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
    const v = fn(-extent + (px + 0.5) * cell, -extent + (py + 0.5) * cell);
    const k = (py * size + px) * 4;
    for (let c = 0; c < 4; c++) data[k + c] = Math.max(0, Math.min(1, v[c])) * 255;
  }
  const t = new THREE.DataTexture(data, size, size);
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
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
