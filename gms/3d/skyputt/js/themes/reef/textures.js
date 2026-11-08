// Sunken Reef theme — procedural canvas textures (no downloaded assets).
// UV conventions (engine builder): floor u = lateral m, v = along m; walls u = along m, v = height m
// (0 at the floor, 0.12 at the top, -0.1 at the outer foot); wallTop u = along m, v 0..1 across;
// trim u = along m, v 0 (top of the 2.5 cm band) → 1 (bottom); boost u = lateral m from the pad centre.
import { makeCanvas, paintPixels, toTexture, fbm3, noise3, rng } from './util.js';

const clamp255 = v => (v < 0 ? 0 : v > 255 ? 255 : v | 0);
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
const mix3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];

/** Tileable cellular (Worley) F2-F1 in [0,1] for a `cells`-per-tile grid. Low values = near a cell edge. */
function cellular(u, v, cells, seed) {
  const x = u * cells, y = v * cells, xi = Math.floor(x), yi = Math.floor(y);
  let f1 = 9, f2 = 9;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = xi + i, cy = yi + j;
    const wx = ((cx % cells) + cells) % cells, wy = ((cy % cells) + cells) % cells;
    const hx = noise3(wx * 17.13 + 0.5, wy * 9.71 + 0.5, seed), hy = noise3(wx * 5.37 + 0.5, wy * 13.9 + 0.5, seed + 7);
    const px = cx + 0.15 + hx * 0.7, py = cy + 0.15 + hy * 0.7;
    const d = Math.hypot(px - x, py - y);
    if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
  }
  return Math.min(1, f2 - f1);
}

/** Scatter round specks over a canvas (wraps so it tiles). */
function specks(g, w, h, n, r0, r1, cols, seed, alpha = 1) {
  const r = rng(seed);
  g.save();
  g.globalAlpha = alpha;
  for (let i = 0; i < n; i++) {
    const x = r() * w, y = r() * h, rad = r0 + r() * (r1 - r0);
    g.fillStyle = cols[(r() * cols.length) | 0];
    for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) {
      if (x + ox < -rad || x + ox > w + rad || y + oy < -rad || y + oy > h + rad) continue;
      g.beginPath(); g.arc(x + ox, y + oy, rad, 0, Math.PI * 2); g.fill();
    }
  }
  g.restore();
}

/**
 * Sea-grass putting surface: 2 m tile (material repeat 0.5). A dense, short turtle-grass felt in a clear
 * mid green (kept green, not teal, so it still reads as a green under the blue water light) with soft
 * mowing stripes every 0.5 m along v and a few pale sand flecks. Mid-bright so a white ball pops.
 */
export function grassTexture(size = 512) {
  const c = makeCanvas(size);
  const L = [70, 136, 74], D = [58, 118, 64];
  const g = paintPixels(c, (u, v, x, y) => {
    const band = smooth(-0.3, 0.3, Math.sin(v * Math.PI * 4));
    const n = noise3(x * 0.9, y * 0.9, 1, size * 0.9) * 0.5 + noise3(x * 0.25, y * 0.25, 7, size * 0.25) * 0.5;
    const blade = noise3(x * 2.2, y * 0.35, 3, 0) * 0.5 + 0.5 * noise3(x * 0.35, y * 2.2, 4, 0);
    const patch = fbm3(u * 4, v * 4, 3, 3, 4);
    const k = 0.86 + n * 0.14 + (patch - 0.5) * 0.12 + (blade - 0.5) * 0.06;
    const col = mix3(L, D, band).map(q => q * k);
    const sandy = smooth(0.66, 0.8, patch) * 0.16;           // faint sandy patches
    return [clamp255(col[0] + sandy * 70), clamp255(col[1] + sandy * 30), clamp255(col[2] + sandy * 20)];
  });
  specks(g, size, size, Math.round(size * 0.18), size * 0.0022, size * 0.005, ['#e8e0c4', '#d8cfb0', '#f2ead4'], 11, 0.45);
  specks(g, size, size, Math.round(size * 0.05), size * 0.002, size * 0.004, ['#2e5a34', '#24502e'], 12, 0.5);
  return toTexture(c);
}

/** Fringe: pale sand with tufts of darker sea grass and tiny shells (1 m tile). */
export function fringeTexture(size = 256) {
  const c = makeCanvas(size);
  const g = paintPixels(c, (u, v, x, y) => {
    const n = noise3(x * 1.2, y * 1.2, 2, size * 1.2);
    const b = fbm3(u * 8, v * 8, 5, 3, 8);
    const tuft = smooth(0.48, 0.62, fbm3(u * 6, v * 6, 9, 3, 6));
    const sand = [196 * (0.88 + n * 0.12), 182 * (0.88 + n * 0.12), 140 * (0.9 + n * 0.1)];
    const grass = [70 + b * 30, 120 + b * 30, 72 + b * 20];
    const col = mix3(sand, grass, tuft * 0.85);
    return col.map(clamp255);
  });
  specks(g, size, size, Math.round(size * 0.12), size * 0.006, size * 0.012, ['#f4e8e0', '#f0c8b8', '#e8d8c8'], 13, 0.8);
  specks(g, size, size, Math.round(size * 0.3), size * 0.004, size * 0.009, ['#8a7a5a', '#a08e68'], 14, 0.5);
  return toTexture(c);
}

/**
 * Coral-rock walls (0.25 m tile, material repeat 4): a porous grey-brown reef rock crusted with patches
 * of coral (pink, orange, violet) and dots of polyps. Emissive map = a few glowing polyp dots (cyan / pink).
 */
export function coralWallTextures(size = 256) {
  const cm = makeCanvas(size), ce = makeCanvas(size);
  const g = paintPixels(cm, (u, v, x, y) => {
    const n = fbm3(u * 6, v * 6, 43, 4, 6);
    const pore = cellular(u, v, 9, 45);
    const holes = smooth(0.0, 0.12, pore);
    const crust = fbm3(u * 3 + 11, v * 3, 47, 3, 3);
    const kind = noise3(u * 4, v * 4, 49, 4);
    const rock = [150, 140, 122].map(q => q * (0.7 + n * 0.4) * (0.65 + holes * 0.35));
    const coral = kind < 0.4 ? [226, 112, 120] : kind < 0.7 ? [236, 150, 84] : [168, 112, 190];
    const k = smooth(0.52, 0.6, crust);
    return mix3(rock, coral.map(q => q * (0.8 + n * 0.25) * (0.75 + holes * 0.25)), k * 0.6).map(clamp255);
  });
  specks(g, size, size, Math.round(size * 0.35), size * 0.004, size * 0.009, ['#f4b0b8', '#ffd0a0', '#e0c8f4', '#fff0e0'], 41, 0.7);
  const e = ce.getContext('2d');
  e.fillStyle = '#000'; e.fillRect(0, 0, size, size);
  specks(e, size, size, Math.round(size * 0.05), size * 0.004, size * 0.008, ['#40f0e0', '#80ffd0', '#ff80c8'], 42, 1);
  return { map: toTexture(cm), emissive: toTexture(ce) };
}

/**
 * Wall cap: mossy sunken-temple stone (512×128 = 0.5 m along): sandstone blocks with joints every
 * ~16 cm, a carved meander (Greek key) band down the middle, moss creeping in from the edges.
 */
export function capTexture(w = 512, h = 128) {
  const c = makeCanvas(w, h);
  const key = (x, y) => {   // meander on a 16 px grid, period 64 px, height 48 px around the middle
    const cy = y - h / 2;
    if (Math.abs(cy) > 22) return 0;
    const px = ((x % 64) + 64) % 64, py = cy + 24;   // 0..48
    const line = (a, b, t) => Math.abs(a - b) < t;
    const T = 3;
    const on = line(py, 4, T) && px < 56 || line(px, 52, T) && py > 4 && py < 44 || line(py, 44, T) && px > 12 && px < 52 ||
      line(px, 12, T) && py > 16 && py < 44 || line(py, 16, T) && px > 12 && px < 40 || line(px, 40, T) && py > 16 && py < 32 ||
      line(py, 32, T) && px > 24 && px < 40 || line(py, 44, T) && px < 4 || line(px, 60, T) && py > 4 && py < 44;
    return on ? 1 : 0;
  };
  paintPixels(c, (u, v, x, y) => {
    const n = fbm3(u * 10, v * 3, 21, 4, 10);
    const bx = (u * 3 + (Math.floor(v * 2) % 2) * 0.5) % 1;
    const joint = smooth(0.0, 0.025, Math.min(bx, 1 - bx)) * smooth(0.0, 0.05, Math.min(v, 1 - v) + 0.02);
    const blockTone = 0.9 + noise3(Math.floor(u * 3 + (Math.floor(v * 2) % 2) * 0.5) * 3.1, 0, 22, 3) * 0.18;
    const k = (0.76 + n * 0.3) * (0.55 + joint * 0.45) * blockTone * (1 - key(x, y) * 0.32);
    const stone = [196 * k, 184 * k, 150 * k];
    const edge = Math.min(v, 1 - v);
    const moss = smooth(0.42, 0.62, fbm3(u * 8, v * 2, 25, 3, 8) + (0.2 - edge) * 1.2);
    return mix3(stone, [78 + n * 30, 124 + n * 30, 70 + n * 20], moss * 0.9).map(clamp255);
  });
  return toTexture(c);
}

/**
 * Trim strip (2.5 cm tall, repeat 4 → 0.25 m tile): verdigris bronze bands top and bottom with a carved
 * channel of glowing sea-light in the middle (emissive scrolls along u, a slow current of light).
 */
export function trimTextures(w = 256, h = 32) {
  const cm = makeCanvas(w, h), ce = makeCanvas(w, h);
  paintPixels(cm, (u, v) => {
    const n = noise3(u * 40, v * 4, 31, 0);
    if (v < 0.22 || v > 0.84) { const s = 0.85 + n * 0.2; return [clamp255(84 * s), clamp255(170 * s), clamp255(150 * s)]; }
    return [clamp255(30 + n * 14), clamp255(70 + n * 20), clamp255(80 + n * 20)];
  });
  paintPixels(ce, (u, v) => {
    if (v < 0.22 || v > 0.84) return [0, 0, 0];
    const mid = 1 - Math.abs((v - 0.53) / 0.31);
    const n = noise3(u * 18, v * 3, 33, 18) * 0.6 + noise3(u * 48, v * 6, 35, 48) * 0.4;
    const k = smooth(0.0, 0.6, mid) * (0.35 + smooth(0.45, 0.8, n) * 0.65);
    return [clamp255(60 * k), clamp255(230 * k), clamp255(220 * k)];
  });
  return { map: toTexture(cm), emissive: toTexture(ce) };
}

/**
 * Island rock data map (linear, not sRGB): R = porous reef-rock tone (sides), G = plain grain (sand /
 * sea-grass top), B = coral-polyp mask (spots that glow faintly where the vertex colour is coral).
 */
export function rockDataTexture(size = 256) {
  const c = makeCanvas(size);
  paintPixels(c, (u, v, x, y) => {
    const n = fbm3(u * 10, v * 10, 51, 4, 10);
    const pore = cellular(u, v, 12, 55);
    const R = (0.6 + (n - 0.5) * 0.5) * (0.5 + smooth(0.0, 0.14, pore) * 0.5);
    const G = 0.84 + (n - 0.5) * 0.35 + (noise3(x * 0.8, y * 0.8, 53, size * 0.8) - 0.5) * 0.2;
    const sp = cellular(u, v, 22, 57);
    const B = smooth(0.6, 0.75, sp) * (noise3(u * 7, v * 7, 59, 7) > 0.62 ? 1 : 0);   // sparse dots at cell centres
    return [clamp255(R * 255), clamp255(G * 255), clamp255(B * 255)];
  });
  return toTexture(c, { srgb: false });
}

/** Sand trap: pale sand with ripple marks, a few shell fragments (1 m tile). */
export function sandTexture(size = 256) {
  const c = makeCanvas(size);
  const g = paintPixels(c, (u, v, x, y) => {
    const n = fbm3(u * 6, v * 6, 61, 4, 6);
    const grain = noise3(x * 1.6, y * 1.6, 62, size * 1.6);
    const ripple = 0.5 + 0.5 * Math.sin((v * 7 + n * 1.6) * Math.PI * 2);
    const k = 0.84 + n * 0.14 + grain * 0.08 + ripple * 0.08;
    return [clamp255(232 * k), clamp255(214 * k), clamp255(168 * k)];
  });
  specks(g, size, size, Math.round(size * 0.08), size * 0.004, size * 0.01, ['#fff4ec', '#f4c8b4', '#e8dcc8'], 64, 0.85);
  specks(g, size, size, Math.round(size * 0.3), size * 0.003, size * 0.006, ['#a89470', '#b8a47e'], 65, 0.6);
  return toTexture(c);
}

/** Seaweed mat (sticky): tangled dark olive-green and brown strands on a dark base (1 m tile). */
export function seaweedTexture(size = 256) {
  const c = makeCanvas(size);
  const g = paintPixels(c, (u, v) => {
    const n = fbm3(u * 6, v * 6, 66, 3, 6);
    return [clamp255(46 + n * 30), clamp255(60 + n * 34), clamp255(30 + n * 14)];
  });
  const r = rng(67);
  g.lineCap = 'round';
  for (let i = 0; i < size * 0.7; i++) {
    const x = r() * size, y = r() * size, a = r() * Math.PI * 2, L = size * (0.05 + r() * 0.12);
    const t = r();
    g.strokeStyle = t < 0.4 ? '#5c7a2e' : t < 0.7 ? '#7a6a2a' : t < 0.9 ? '#3e5a26' : '#9aa040';
    g.lineWidth = size * (0.006 + r() * 0.01);
    for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) {
      g.beginPath(); g.moveTo(x + ox, y + oy);
      g.quadraticCurveTo(x + ox + Math.cos(a + 0.8) * L * 0.6, y + oy + Math.sin(a + 0.8) * L * 0.6, x + ox + Math.cos(a) * L, y + oy + Math.sin(a) * L);
      g.stroke();
    }
  }
  return toTexture(c);
}

/** Mother-of-pearl (ice patches): pale nacre with soft pastel growth lines (the shader adds the sheen). */
export function pearlTexture(size = 256) {
  const c = makeCanvas(size);
  paintPixels(c, (u, v) => {
    const n = fbm3(u * 4, v * 4, 71, 4, 4);
    const w = Math.sin((u * 3 + n * 2.4) * Math.PI * 2) * 0.5 + Math.sin((v * 5 + n * 1.7) * Math.PI * 2) * 0.5;
    const k = 0.5 + 0.5 * w;
    const pink = [244, 222, 230], blue = [214, 236, 246], gold = [246, 238, 214];
    const col = k < 0.5 ? mix3(pink, blue, k * 2) : mix3(blue, gold, (k - 0.5) * 2);
    const line = smooth(0.92, 0.99, 0.5 + 0.5 * Math.sin((u * 9 + v * 4 + n * 6) * Math.PI * 2));
    return col.map(q => clamp255(q * (0.9 + n * 0.1) + line * 14));
  });
  return toTexture(c);
}

/** Ship deck planks along v (0.16 m each across u, 1 m tile): weathered grey-brown wood, nails, barnacles. */
export function deckTexture(size = 256) {
  const c = makeCanvas(size);
  const g = paintPixels(c, (u, v, x, y) => {
    const j = Math.floor(u * 6), fu = u * 6 - j;
    const gap = smooth(0.0, 0.05, Math.min(fu, 1 - fu));
    const grain = noise3(x * 0.4, y * 0.04 + j * 30, 81, 0) * 0.6 + noise3(x * 1.5, y * 0.12, 82, 0) * 0.4;
    const tone = 0.85 + Math.abs((Math.sin(j * 12.9898) * 43758.5453) % 1) * 0.2;
    const mossy = smooth(0.55, 0.75, fbm3(u * 4, v * 4, 83, 3, 4));
    const k = (0.7 + grain * 0.35) * tone * (0.35 + gap * 0.65);
    return mix3([138 * k, 116 * k, 88 * k], [88 * k, 116 * k, 84 * k], mossy * 0.6).map(clamp255);
  });
  for (let j = 0; j < 6; j++) for (const fy of [0.12, 0.62]) {
    const x = (j + 0.5) / 6 * size, y = fy * size;
    g.fillStyle = '#3a4a44'; g.beginPath(); g.arc(x - size * 0.02, y, size * 0.007, 0, Math.PI * 2); g.arc(x + size * 0.02, y, size * 0.007, 0, Math.PI * 2); g.fill();
  }
  specks(g, size, size, Math.round(size * 0.06), size * 0.006, size * 0.014, ['#d8d0c0', '#c0b8a8'], 84, 0.8);
  return toTexture(c);
}

/** Tileable greyscale noise (R). */
export function noiseTexture(size = 256, scale = 8, seed = 61, oct = 5) {
  const c = makeCanvas(size);
  paintPixels(c, (u, v) => {
    const k = clamp255(fbm3(u * scale, v * scale, seed, oct, scale) * 255);
    return [k, k, k];
  });
  return toTexture(c, { srgb: false });
}

/**
 * Caustics (linear, tiles): bright wobbly net lines (inverted cellular edges, softened). Two copies at
 * different scales / scroll directions are min()-combined in the shaders for the moving caustic light.
 */
export function causticTexture(size = 256) {
  const c = makeCanvas(size);
  paintPixels(c, (u, v) => {
    const wu = u + (noise3(u * 4, v * 4, 91, 4) - 0.5) * 0.08, wv = v + (noise3(u * 4 + 9, v * 4, 92, 4) - 0.5) * 0.08;
    const e = cellular(((wu % 1) + 1) % 1, ((wv % 1) + 1) % 1, 6, 93);
    const k = Math.pow(1 - smooth(0.0, 0.32, e), 2.2);
    const kk = clamp255(k * 255);
    return [kk, kk, kk];
  });
  return toTexture(c, { srgb: false });
}

/** Boost pad emissive: glowing cyan current chevrons pointing +v, two per tile, tip at u = 0, plus streaks. */
export function chevronTexture(w = 128, h = 256) {
  const c = makeCanvas(w, h);
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
  // faint streaks of moving water
  const r = rng(95);
  for (let i = 0; i < 18; i++) {
    const x = r() * w, y = r() * h, L = h * (0.1 + r() * 0.2);
    g.strokeStyle = `rgba(80,200,230,${0.15 + r() * 0.2})`; g.lineWidth = 1 + r() * 2;
    for (const oy of [-h, 0]) { g.beginPath(); g.moveTo(x, y + oy); g.lineTo(x, y + oy + L); g.stroke(); }
  }
  for (let k = 0; k < 2; k++) {
    const y0 = k * h / 2;
    for (const [blur, width, col] of [[18, 20, 'rgba(20,160,220,0.6)'], [6, 12, 'rgba(60,220,240,0.95)'], [0, 4, '#e8ffff']]) {
      g.save();
      g.shadowColor = '#20c0f0'; g.shadowBlur = blur;
      g.strokeStyle = col; g.lineWidth = width; g.lineJoin = 'round'; g.lineCap = 'round';
      for (const cx of [0, w]) {
        g.beginPath();
        g.moveTo(cx - w * 0.4, y0 + h * 0.36);
        g.lineTo(cx, y0 + h * 0.14);
        g.lineTo(cx + w * 0.4, y0 + h * 0.36);
        g.stroke();
      }
      g.restore();
    }
  }
  return toTexture(c);
}

/** Loop band (u along m, v 0..1 across): barnacled ship-hull planks with verdigris edges and a glow seam. */
export function bandTextures(w = 128, h = 64) {
  const cm = makeCanvas(w, h), ce = makeCanvas(w, h);
  const g = paintPixels(cm, (u, v) => {
    const n = fbm3(u * 6, v * 3, 95, 3, 6);
    if (v < 0.12 || v > 0.88) { const s = 0.85 + n * 0.2; return [clamp255(84 * s), clamp255(168 * s), clamp255(148 * s)]; }
    const plank = Math.abs(((v - 0.12) / 0.76 * 4) % 1 - 0.5) > 0.46 ? 0.5 : 1;
    const k = (0.72 + n * 0.3) * plank;
    return [clamp255(122 * k), clamp255(104 * k), clamp255(80 * k)];
  });
  specks(g, w, h, 40, h * 0.02, h * 0.05, ['#d8d0c0', '#bcb4a4', '#e8a0a8'], 96, 0.8);
  paintPixels(ce, (u, v) => {
    const d = Math.abs(v - 0.5);
    const n = noise3(u * 16, v * 4, 97, 16);
    const k = (1 - smooth(0.02, 0.06, d)) * (0.6 + 0.4 * n);
    return [clamp255(50 * k), clamp255(220 * k), clamp255(230 * k)];
  });
  return { map: toTexture(cm), emissive: toTexture(ce) };
}

/**
 * Tee pad: a round temple mosaic: sandstone disc, a turquoise tile ring, a compass-rose / scallop shell
 * sigil (map), the sigil and ring glowing sea-light (emissive). The shell's hinge points to texture -v,
 * its fan opens toward +v.
 */
export function teePadTextures(size = 512) {
  const cm = makeCanvas(size), ce = makeCanvas(size);
  const R = size / 2;
  const g = cm.getContext('2d');
  paintPixels(cm, (u, v, x, y) => {
    const n = noise3(x * 0.05, y * 0.05, 101) * 0.5 + noise3(x * 0.2, y * 0.2, 102) * 0.5;
    const k = 0.78 + n * 0.25;
    return [clamp255(204 * k), clamp255(190 * k), clamp255(154 * k)];
  });
  g.translate(R, R);
  // mosaic ring of small tiles
  for (let ring = 0; ring < 2; ring++) {
    const rr = R * (0.8 + ring * 0.07), n = 48 + ring * 6;
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2;
      g.save(); g.rotate(a); g.translate(0, -rr);
      g.fillStyle = (i + ring) % 3 === 0 ? '#2a8a90' : (i + ring) % 3 === 1 ? '#46b0a8' : '#e8e0c8';
      g.fillRect(-R * 0.045, -R * 0.03, R * 0.09, R * 0.06);
      g.restore();
    }
  }
  const shell = (ctx) => {
    ctx.beginPath();
    ctx.moveTo(0, R * 0.38);
    for (let i = 0; i <= 10; i++) {
      const a = Math.PI * (0.15 + 0.7 * i / 10);
      const rr = R * 0.5 * (1 + 0.06 * Math.sin(i * Math.PI));
      ctx.lineTo(Math.cos(a) * rr * -1, R * 0.38 - Math.sin(a) * rr * 1.25);
    }
    ctx.closePath(); ctx.fill();
  };
  const ribs = (ctx, col, wdt) => {
    ctx.strokeStyle = col; ctx.lineWidth = wdt; ctx.lineCap = 'round';
    for (let i = 0; i <= 8; i++) {
      const a = Math.PI * (0.2 + 0.6 * i / 8);
      ctx.beginPath(); ctx.moveTo(0, R * 0.36); ctx.lineTo(-Math.cos(a) * R * 0.46, R * 0.38 - Math.sin(a) * R * 0.56); ctx.stroke();
    }
    // the hinge "ears"
    ctx.beginPath(); ctx.moveTo(-R * 0.14, R * 0.42); ctx.lineTo(R * 0.14, R * 0.42); ctx.stroke();
  };
  g.fillStyle = '#e8c8b8'; shell(g);
  ribs(g, '#b88a78', R * 0.022);
  // compass ticks
  g.strokeStyle = '#6a5a44'; g.lineWidth = R * 0.02;
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * Math.PI * 2;
    g.save(); g.rotate(a); g.beginPath(); g.moveTo(0, -R * 0.64); g.lineTo(0, -R * (i % 4 ? 0.69 : 0.74)); g.stroke(); g.restore();
  }
  const e = ce.getContext('2d');
  e.fillStyle = '#000'; e.fillRect(0, 0, size, size);
  e.translate(R, R);
  e.shadowColor = '#30e0e0'; e.shadowBlur = size * 0.03;
  ribs(e, 'rgba(80,240,230,0.9)', R * 0.026);
  e.shadowBlur = size * 0.015;
  e.strokeStyle = 'rgba(80,220,240,0.85)'; e.lineWidth = R * 0.02;
  e.beginPath(); e.arc(0, 0, R * 0.74, 0, Math.PI * 2); e.stroke();
  return { map: toTexture(cm, { repeat: false }), emissive: toTexture(ce, { repeat: false }) };
}

/** Flag cloth: a tattered sea-green sail with a pale border and a white scallop shell. u = 0 at the pole. */
export function flagTexture(w = 128, h = 96) {
  const c = makeCanvas(w, h);
  const g = paintPixels(c, (u, v) => {
    const n = fbm3(u * 6, v * 5, 93, 3, 0);
    const k = 0.85 + n * 0.2;
    // ragged fly edge: transparent notches
    const rag = u > 0.86 + noise3(v * 14, 0, 94, 0) * 0.12;
    if (rag) return [0, 0, 0, 0];
    const hem = (v < 0.08 || v > 0.92) ? 1 : 0;
    if (hem) return [clamp255(232 * k), clamp255(224 * k), clamp255(196 * k), 255];
    return [clamp255(30 * k), clamp255(150 * k), clamp255(140 * k), 255];
  });
  g.save(); g.translate(w * 0.44, h * 0.56);
  const s = h * 0.34;
  g.fillStyle = '#fff6ea';
  g.beginPath(); g.moveTo(0, s * 0.7);
  for (let i = 0; i <= 10; i++) { const a = Math.PI * (0.1 + 0.8 * i / 10); g.lineTo(-Math.cos(a) * s, s * 0.7 - Math.sin(a) * s * 1.3); }
  g.closePath(); g.fill();
  g.strokeStyle = '#a0d8d0'; g.lineWidth = 1.5;
  for (let i = 0; i <= 6; i++) { const a = Math.PI * (0.15 + 0.7 * i / 6); g.beginPath(); g.moveTo(0, s * 0.66); g.lineTo(-Math.cos(a) * s * 0.92, s * 0.7 - Math.sin(a) * s * 1.18); g.stroke(); }
  g.restore();
  return toTexture(c, { repeat: false });
}

/** Soft radial glow (white, alpha falloff). */
export function glowTexture(size = 64) {
  const c = makeCanvas(size);
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  grd.addColorStop(0.6, 'rgba(255,255,255,0.12)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, size, size);
  return toTexture(c, { repeat: false, srgb: false });
}

/** Bubble: a thin bright rim with a highlight, transparent middle (white, alpha). */
export function bubbleTexture(size = 64) {
  const c = makeCanvas(size);
  const g = c.getContext('2d');
  const h = size / 2;
  const grd = g.createRadialGradient(h, h, 0, h, h, h);
  grd.addColorStop(0, 'rgba(255,255,255,0.08)'); grd.addColorStop(0.62, 'rgba(255,255,255,0.18)');
  grd.addColorStop(0.8, 'rgba(255,255,255,0.85)'); grd.addColorStop(0.9, 'rgba(255,255,255,0.4)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, size, size);
  g.fillStyle = 'rgba(255,255,255,0.95)';
  g.beginPath(); g.ellipse(h * 0.68, h * 0.62, h * 0.16, h * 0.1, -0.6, 0, Math.PI * 2); g.fill();
  return toTexture(c, { repeat: false, srgb: false });
}

/** Silt / sand cloud atlas 2×2 (soft billowing puffs, white; tinted per billboard). */
export function cloudAtlasTexture(size = 256) {
  const c = makeCanvas(size);
  const g = c.getContext('2d');
  const cell = size / 2;
  const r = rng(78);
  for (let k = 0; k < 4; k++) {
    const ox = (k % 2) * cell, oy = Math.floor(k / 2) * cell;
    g.save(); g.beginPath(); g.rect(ox, oy, cell, cell); g.clip();
    for (let i = 0; i < 26; i++) {
      const t = i / 25;
      const x = ox + cell * (0.18 + r() * 0.64), y = oy + cell * (0.25 + r() * 0.5);
      const rx = cell * (0.08 + r() * 0.16) * (1 - Math.abs(t - 0.5));
      const grd = g.createRadialGradient(x, y, 0, x, y, rx * 1.6);
      grd.addColorStop(0, 'rgba(255,255,255,0.5)'); grd.addColorStop(0.6, 'rgba(255,255,255,0.22)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.beginPath(); g.arc(x, y, rx * 1.6, 0, Math.PI * 2); g.fill();
    }
    g.restore();
  }
  return toTexture(c, { repeat: false });
}

/** Kelp blade: a long olive-gold ribbon with a midrib and lighter edges (u across, v along; alpha in A). */
export function kelpTexture(w = 32, h = 128) {
  const c = makeCanvas(w, h);
  paintPixels(c, (u, v, x, y) => {
    const across = Math.abs(u - 0.5) * 2;
    const wave = 0.86 + 0.14 * Math.sin(v * 40);
    const edge = across > wave ? 0 : 1;
    const rib = 1 - smooth(0.0, 0.12, across);
    const n = noise3(x * 0.3, y * 0.1, 98, 0);
    const k = 0.75 + n * 0.3;
    const col = mix3([120, 128, 44], [176, 156, 70], across * 0.6 + rib * 0.3);
    return [clamp255(col[0] * k), clamp255(col[1] * k), clamp255(col[2] * k), edge * 255];
  });
  return toTexture(c, { repeat: false });
}

/** Vertical fade (alpha 1 at v=1 → 0 at v=0). */
export function fadeTexture(size = 64) {
  const c = makeCanvas(4, size);
  paintPixels(c, (u, v) => { const k = clamp255(Math.pow(1 - v, 1.4) * 255); return [k, k, k]; });
  return toTexture(c, { repeat: false, srgb: false });
}
