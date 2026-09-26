import * as THREE from 'three';

export function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function canvas(w, h = w) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

// Height field -> tangent-space normal map
function normalFromHeight(h, w, strength) {
  const c = canvas(w), ctx = c.getContext('2d'), img = ctx.createImageData(w, w), d = img.data;
  for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    const l = h[y * w + ((x - 1 + w) % w)], r = h[y * w + ((x + 1) % w)];
    const u = h[((y - 1 + w) % w) * w + x], dn = h[((y + 1) % w) * w + x];
    let nx = (l - r) * strength, ny = (u - dn) * strength, nz = 1;
    const len = Math.hypot(nx, ny, nz); nx /= len; ny /= len; nz /= len;
    d[i * 4] = (nx * 0.5 + 0.5) * 255; d[i * 4 + 1] = (ny * 0.5 + 0.5) * 255; d[i * 4 + 2] = nz * 255; d[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function tex(c, srgb, repeat = true, aniso = 8) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

// Polished stone tiles: `tiles` x `tiles` slabs per texture, veining, grout, per-slab tone & gloss.
export function makeStoneSet({ size = 1024, tiles = 4, base = [233, 226, 214], vary = 10, vein = [150, 140, 128],
  veinAlpha = 0.18, grout = [120, 112, 100], rough = [0.07, 0.2], seed = 3, gold = false } = {}) {
  const R = rng(seed);
  const col = canvas(size), cx = col.getContext('2d');
  const rgh = canvas(size), rx = rgh.getContext('2d');
  const ts = size / tiles;
  const height = new Float32Array(size * size);
  for (let ty = 0; ty < tiles; ty++) for (let tx = 0; tx < tiles; tx++) {
    const k = (R() - 0.5) * vary;
    cx.fillStyle = `rgb(${base[0] + k | 0},${base[1] + k | 0},${base[2] + k * 0.8 | 0})`;
    cx.fillRect(tx * ts, ty * ts, ts, ts);
    const rv = rough[0] + R() * (rough[1] - rough[0]);
    rx.fillStyle = `rgb(${rv * 255 | 0},${rv * 255 | 0},${rv * 255 | 0})`;
    rx.fillRect(tx * ts, ty * ts, ts, ts);
  }
  // soft clouding
  for (let i = 0; i < 260; i++) {
    const x = R() * size, y = R() * size, r = 20 + R() * 90;
    const g = cx.createRadialGradient(x, y, 0, x, y, r);
    const a = 0.035 * R();
    const c = R() < 0.5 ? `rgba(255,250,240,${a})` : `rgba(${vein[0]},${vein[1]},${vein[2]},${a})`;
    g.addColorStop(0, c); g.addColorStop(1, 'rgba(0,0,0,0)');
    cx.fillStyle = g; cx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // veins: wandering polylines
  cx.lineCap = 'round';
  for (let v = 0; v < 38; v++) {
    let x = R() * size, y = R() * size, a = R() * Math.PI * 2;
    const steps = 30 + R() * 90;
    cx.strokeStyle = `rgba(${vein[0]},${vein[1]},${vein[2]},${veinAlpha * (0.3 + R())})`;
    cx.lineWidth = 0.6 + R() * 1.6;
    cx.beginPath(); cx.moveTo(x, y);
    for (let s = 0; s < steps; s++) { a += (R() - 0.5) * 0.7; x += Math.cos(a) * 6; y += Math.sin(a) * 6; cx.lineTo(x, y); }
    cx.stroke();
  }
  // grout
  const gw = Math.max(2, size / 400);
  cx.fillStyle = `rgb(${grout[0]},${grout[1]},${grout[2]})`;
  rx.fillStyle = 'rgb(150,150,150)';
  for (let i = 0; i <= tiles; i++) {
    const p = i * ts;
    cx.fillRect(p - gw / 2, 0, gw, size); cx.fillRect(0, p - gw / 2, size, gw);
    rx.fillRect(p - gw / 2, 0, gw, size); rx.fillRect(0, p - gw / 2, size, gw);
    if (gold) {
      cx.fillStyle = 'rgb(214,170,90)';
      cx.fillRect(p - gw / 4, 0, gw / 2, size); cx.fillRect(0, p - gw / 4, size, gw / 2);
      cx.fillStyle = `rgb(${grout[0]},${grout[1]},${grout[2]})`;
    }
  }
  // wet streaks on roughness (large gloss variation reads as polish)
  for (let i = 0; i < 90; i++) {
    const x = R() * size, y = R() * size, r = 30 + R() * 140;
    const g = rx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(0,0,0,${0.12 * R()})`); g.addColorStop(1, 'rgba(0,0,0,0)');
    rx.fillStyle = g; rx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const gx = (x % ts), gy = (y % ts);
    const dEdge = Math.min(gx, ts - gx, gy, ts - gy);
    height[y * size + x] = Math.min(1, dEdge / (gw * 1.5));
  }
  const nrm = normalFromHeight(height, size, 1.2);
  return { map: tex(col, true), roughnessMap: tex(rgh, false), normalMap: tex(nrm, false) };
}

// Soft noise used by foliage, facades etc.
export function makeNoiseTexture(size = 256, seed = 7) {
  const R = rng(seed), c = canvas(size), x = c.getContext('2d');
  x.fillStyle = '#808080'; x.fillRect(0, 0, size, size);
  for (let i = 0; i < 1400; i++) {
    const px = R() * size, py = R() * size, r = 2 + R() * 18, a = R() * 0.12;
    x.fillStyle = R() < 0.5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`;
    x.beginPath(); x.arc(px, py, r, 0, 7); x.fill();
  }
  return tex(c, false);
}

export function makeCanvas(w, h) { return canvas(w, h); }
export function canvasTexture(c, srgb = true) { const t = tex(c, srgb, false, 4); return t; }

// Tileable water ripple normal map from summed sine waves.
export function makeWaterNormal(size = 256, seed = 9) {
  const R = rng(seed), h = new Float32Array(size * size);
  const waves = [];
  for (let i = 0; i < 24; i++) waves.push({ kx: Math.round((R() - 0.5) * 16), ky: Math.round((R() - 0.5) * 16), p: R() * 6.28, a: 0.3 + R() });
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let v = 0;
    for (const w of waves) v += Math.sin((w.kx * x + w.ky * y) / size * Math.PI * 2 + w.p) * w.a / (1 + Math.hypot(w.kx, w.ky) * 0.2);
    h[y * size + x] = v * 0.08;
  }
  return tex(normalFromHeight(h, size, 6), false);
}

// Warm shop/atrium interiors: ceiling light, shelves, silhouettes of shoppers.
export function makeInteriorTexture() {
  const w = 512, h = 128, R = rng(21), c = canvas(w, h), x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#2a1a0c'); g.addColorStop(0.18, '#ffd9a0'); g.addColorStop(0.3, '#b87b3e'); g.addColorStop(0.75, '#6a4526'); g.addColorStop(1, '#3a2614');
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  for (let i = 0; i < 14; i++) { const px = R() * w; const lg = x.createRadialGradient(px, 22, 2, px, 22, 60); lg.addColorStop(0, 'rgba(255,240,210,0.8)'); lg.addColorStop(1, 'rgba(255,200,140,0)'); x.fillStyle = lg; x.fillRect(px - 60, 0, 120, 90); }
  for (let i = 0; i < 10; i++) { x.fillStyle = `rgba(40,24,12,${0.5 + R() * 0.4})`; const sx = R() * w; x.fillRect(sx, 40, 30 + R() * 50, 50); x.fillStyle = 'rgba(255,210,150,0.55)'; for (let k = 0; k < 3; k++) x.fillRect(sx + 2, 46 + k * 15, 26 + R() * 40, 2); }
  for (let i = 0; i < 26; i++) { const px = R() * w, ph = 26 + R() * 18; x.fillStyle = `rgba(${20 + R() * 30},${14 + R() * 20},${10},0.9)`; x.beginPath(); x.ellipse(px, h - 12 - ph + 5, 4, 5, 0, 0, 7); x.fill(); x.fillRect(px - 5, h - 12 - ph + 10, 10, ph - 6); }
  x.fillStyle = 'rgba(255,230,190,0.9)'; x.fillRect(0, 8, w, 3);
  x.fillStyle = 'rgba(20,12,6,0.9)'; x.fillRect(0, 0, w, 6); x.fillRect(0, h - 6, w, 6);
  return tex(c, true);
}
