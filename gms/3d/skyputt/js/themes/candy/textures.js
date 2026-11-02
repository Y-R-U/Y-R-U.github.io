// Candy Land theme — procedural canvas textures (no downloaded assets).
// UV conventions (engine builder): floor u = lateral m, v = along m; walls u = along m, v = height m
// (0 at the floor, 0.12 at the top, -0.1 at the outer foot); wallTop u = along m, v 0..1 across;
// trim u = along m, v 0 (top of the 2.5 cm band) → 1 (bottom); boost u = lateral m from the pad centre.
import { makeCanvas, paintPixels, toTexture, fbm3, noise3, rng } from './util.js';

const clamp255 = v => (v < 0 ? 0 : v > 255 ? 255 : v | 0);
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
const mix3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];

export const SPRINKLE_COLS = ['#ff5c9a', '#ffd23f', '#4cc9f0', '#7ae582', '#b388ff', '#ff8c42', '#ffffff'];

/** Scatter sprinkles (rounded rods) over a canvas region; wraps across edges so it tiles. */
function sprinkles(g, w, h, n, len, wid, seed, cols = SPRINKLE_COLS, alpha = 1) {
  const r = rng(seed);
  g.save();
  g.lineCap = 'round';
  g.globalAlpha = alpha;
  for (let i = 0; i < n; i++) {
    const x = r() * w, y = r() * h, a = r() * Math.PI, l = len * (0.7 + r() * 0.6);
    g.strokeStyle = cols[(r() * cols.length) | 0];
    g.lineWidth = wid;
    const dx = Math.cos(a) * l / 2, dy = Math.sin(a) * l / 2;
    for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) {
      if (x + ox < -l || x + ox > w + l || y + oy < -l || y + oy > h + l) continue;
      g.beginPath(); g.moveTo(x + ox - dx, y + oy - dy); g.lineTo(x + ox + dx, y + oy + dy); g.stroke();
    }
  }
  g.restore();
}

/**
 * Mint frosting putting green: 2 m tile (material repeat 0.5), soft mowing stripes every 0.5 m along v,
 * a piped-cream ripple and a very light scatter of pale sprinkles (the ball must stay readable).
 */
export function grassTexture(size = 512) {
  const c = makeCanvas(size);
  const L = [112, 216, 142], D = [86, 192, 122];
  const g = paintPixels(c, (u, v, x, y) => {
    const band = smooth(-0.3, 0.3, Math.sin(v * Math.PI * 4));
    const n = noise3(x * 0.8, y * 0.8, 1, size * 0.8) * 0.5 + noise3(x * 0.22, y * 0.22, 7, size * 0.22) * 0.5;
    const swirl = 0.5 + 0.5 * Math.sin((u * 18 + fbm3(u * 4, v * 4, 3, 3, 4) * 5) * Math.PI * 2);
    const k = 0.9 + n * 0.14 + swirl * 0.04;
    const col = mix3(L, D, band).map(q => q * k);
    return [clamp255(col[0]), clamp255(col[1] + 4), clamp255(col[2])];
  });
  sprinkles(g, size, size, Math.round(size * 0.14), size * 0.018, Math.max(1.5, size * 0.006), 11,
    ['#ffd6e8', '#fff3b8', '#d4f3ff', '#ffffff', '#ead6ff'], 0.55);
  return toTexture(c);
}

/** Fringe: deeper green frosting thick with rainbow sprinkles (1 m tile). */
export function fringeTexture(size = 256) {
  const c = makeCanvas(size);
  const g = paintPixels(c, (u, v, x, y) => {
    const n = noise3(x * 1.1, y * 1.1, 2, size * 1.1);
    const b = fbm3(u * 8, v * 8, 5, 3, 8);
    const k = 0.78 + n * 0.25 + (b - 0.5) * 0.25;
    return [clamp255(84 * k), clamp255(178 * k), clamp255(112 * k)];
  });
  sprinkles(g, size, size, Math.round(size * 0.9), size * 0.045, Math.max(2, size * 0.014), 12);
  return toTexture(c);
}

/**
 * Strawberry wafer for the walls: a 0.25 m tile (material repeat 4) of pink wafer layers with a pressed
 * grid, separated by thin cream filling.
 */
export function waferTexture(size = 256) {
  const c = makeCanvas(size);
  const W = [238, 140, 168], W2 = [214, 108, 140], CR = [255, 241, 226];
  paintPixels(c, (u, v, x, y) => {
    const layers = 3;
    const lv = v * layers, li = Math.floor(lv), f = lv - li;     // f 0..1 inside a layer (+ cream)
    const cream = f > 0.8;
    const n = noise3(x * 0.9, y * 0.9, 41, size * 0.9);
    if (cream) {
      const e = smooth(0.8, 0.84, f) * smooth(1.0, 0.96, f);
      const k = 0.92 + n * 0.08;
      return [clamp255(CR[0] * k), clamp255(CR[1] * k - (1 - e) * 20), clamp255(CR[2] * k - (1 - e) * 26)];
    }
    // pressed grid: 16 cells per tile along u, 2 per layer up v
    const gu = (u * 10) % 1, gv = (f / 0.8 * 2) % 1;
    const ridge = Math.max(smooth(0.12, 0.0, Math.min(gu, 1 - gu)), smooth(0.12, 0.0, Math.min(gv, 1 - gv)));
    const shade = 1 - ridge * 0.22 + (gu < 0.5 ? 0.02 : -0.02);
    const k = (0.9 + n * 0.16) * shade;
    const col = mix3(W, W2, smooth(0.0, 0.25, f) * 0.15 + smooth(0.6, 0.8, f) * 0.5);
    return [clamp255(col[0] * k), clamp255(col[1] * k), clamp255(col[2] * k)];
  });
  return toTexture(c);
}

/** Wall cap: glossy white icing with rainbow sprinkles. 512×128 covers 0.5 m along × the cap width. */
export function capTexture(w = 512, h = 128) {
  const c = makeCanvas(w, h);
  const g = paintPixels(c, (u, v, x, y) => {
    const n = fbm3(u * 10, v * 3, 21, 3, 10);
    const rim = smooth(0.0, 0.18, Math.min(v, 1 - v));
    const k = 0.9 + n * 0.1;
    return [clamp255(255 * k), clamp255((244 + rim * 6) * k), clamp255((246 + rim * 4) * k)];
  });
  sprinkles(g, w, h, Math.round(w * 0.14), h * 0.16, Math.max(2, h * 0.045), 22);
  return toTexture(c);
}

/**
 * Icing drip band for the trim strip (2.5 cm tall, u = metres along with repeat 4 → 0.25 m tile):
 * white icing at the top of the strip with rounded drips of varying length; alpha cut-out below.
 * v = 0 is the TOP of the strip (canvas bottom, as textures flip).
 */
export function dripTexture(w = 256, h = 32) {
  const c = makeCanvas(w, h);
  const g = c.getContext('2d');
  const r = rng(31);
  g.clearRect(0, 0, w, h);
  // canvas y = h is the top of the strip (v = 0)
  const grd = g.createLinearGradient(0, h, 0, 0);
  grd.addColorStop(0, '#ffffff'); grd.addColorStop(1, '#fff2f6');
  g.fillStyle = grd;
  g.fillRect(0, h * 0.62, w, h * 0.38);
  const n = 11;
  for (let i = 0; i < n; i++) {
    const x = (i + 0.2 + r() * 0.6) / n * w, rw = w / n * (0.22 + r() * 0.18);
    const len = h * (0.25 + r() * 0.6);
    const yTip = h * 0.62 - len;
    g.beginPath();
    g.moveTo(x - rw * 1.6, h * 0.64);
    g.quadraticCurveTo(x - rw, h * 0.6, x - rw, Math.max(yTip + rw, h * 0.1));
    g.arc(x, Math.max(yTip + rw, h * 0.1), rw, Math.PI, 0, true);
    g.quadraticCurveTo(x + rw, h * 0.6, x + rw * 1.6, h * 0.64);
    g.closePath(); g.fill();
  }
  // a glossy highlight line along the top
  g.fillStyle = 'rgba(255,255,255,1)';
  g.fillRect(0, h * 0.9, w, h * 0.1);
  // a few sprinkles stuck in the icing
  const r2 = rng(32);
  g.lineCap = 'round'; g.lineWidth = Math.max(1.5, h * 0.09);
  for (let i = 0; i < 14; i++) {
    const x = r2() * w, y = h * (0.72 + r2() * 0.2), a = r2() * Math.PI, l = h * 0.14;
    g.strokeStyle = SPRINKLE_COLS[(r2() * 6) | 0];
    g.beginPath(); g.moveTo(x - Math.cos(a) * l, y - Math.sin(a) * l * 0.4); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l * 0.4); g.stroke();
  }
  return toTexture(c);
}

/** Island cake crumb: a pale porous sponge map (multiplied by the vertex colour layers). */
export function crumbTexture(size = 256) {
  const c = makeCanvas(size);
  paintPixels(c, (u, v, x, y) => {
    const n = fbm3(u * 10, v * 10, 51, 4, 10);
    const pore = noise3(x * 0.6, y * 0.6, 53, size * 0.6);
    const pore2 = noise3(x * 1.4, y * 1.4, 55, size * 1.4);
    const hole = smooth(0.66, 0.8, pore) * 0.45 + smooth(0.72, 0.86, pore2) * 0.3;
    const k = 0.92 + (n - 0.5) * 0.25 - hole * 0.45;
    return [clamp255(255 * k), clamp255(250 * k), clamp255(244 * k)];
  });
  return toTexture(c);
}

/** Brown sugar trap: golden crystals with sparkle points (1 m tile). */
export function sugarTexture(size = 256) {
  const c = makeCanvas(size);
  paintPixels(c, (u, v, x, y) => {
    const n = fbm3(u * 6, v * 6, 61, 4, 6);
    const grain = noise3(x * 1.6, y * 1.6, 62, size * 1.6);
    const grain2 = noise3(x * 0.7, y * 0.7, 63, size * 0.7);
    const glint = grain > 0.8 ? 1 : 0;
    const k = 0.78 + n * 0.2 + grain2 * 0.12;
    return [clamp255(222 * k + glint * 40), clamp255(170 * k + glint * 50), clamp255(104 * k + glint * 60)];
  });
  return toTexture(c);
}

/** Blue-raspberry hard candy (ice patches): glassy blue with cream swirls. */
export function hardCandyTexture(size = 256) {
  const c = makeCanvas(size);
  paintPixels(c, (u, v) => {
    const n = fbm3(u * 4, v * 4, 71, 4, 4);
    const sw = 0.5 + 0.5 * Math.sin((u * 3 + v * 2 + n * 3) * Math.PI * 2);
    const line = smooth(0.9, 0.98, sw);
    const k = 0.84 + n * 0.25;
    return [clamp255(92 * k + line * 150), clamp255(180 * k + line * 70), clamp255(250 * k + line * 5)];
  });
  return toTexture(c);
}

/** Graham-cracker planks across u (0.125 m each along v), 1 m tile, with docking holes. */
export function crackerTexture(size = 256) {
  const c = makeCanvas(size);
  paintPixels(c, (u, v, x, y) => {
    const j = Math.floor(v * 8), fv = v * 8 - j;
    const n = fbm3(u * 8, v * 8, 81, 3, 8);
    const gap = smooth(0.0, 0.08, Math.min(fv, 1 - fv));
    const hx = ((u * 16) % 1) - 0.5, hy = fv - 0.5;
    const hole = smooth(0.1, 0.06, Math.hypot(hx * 1.0, hy * 2.0)) * (Math.floor(u * 16) % 2 === j % 2 ? 1 : 0);
    const t = Math.abs((Math.sin(j * 12.9898) * 43758.5453) % 1);
    const k = (0.84 + n * 0.22 + t * 0.08) * (0.55 + gap * 0.45) * (1 - hole * 0.35);
    return [clamp255(214 * k), clamp255(152 * k), clamp255(92 * k)];
  });
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

/** Boost pad emissive: glowing pink/white chevrons pointing +v, two per tile, tip at u = 0. */
export function chevronTexture(w = 128, h = 256) {
  const c = makeCanvas(w, h);
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
  for (let k = 0; k < 2; k++) {
    const y0 = k * h / 2;
    for (const [blur, width, col] of [[18, 20, 'rgba(255,60,160,0.6)'], [6, 12, 'rgba(255,140,200,0.95)'], [0, 4, '#fff4fa']]) {
      g.save();
      g.shadowColor = '#ff4fa8'; g.shadowBlur = blur;
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

/** Candy stripes (pink / white diagonal, seamless) for candy canes and rails. */
export function candyStripeTexture(size = 128, a = [255, 92, 154], b = [255, 250, 252]) {
  const c = makeCanvas(size);
  paintPixels(c, (u, v) => {
    const s = ((u + v) * 2) % 1;
    const r = smooth(0.0, 0.03, s) * smooth(0.5, 0.47, s);
    const sheen = 0.95 + 0.05 * Math.sin(v * Math.PI * 2);
    const col = mix3(b, a, r).map(q => q * sheen);
    return [clamp255(col[0]), clamp255(col[1]), clamp255(col[2])];
  });
  return toTexture(c);
}

/** Rainbow sour-belt band (stripes across v: red→violet), u along (plain), for the loop band. */
export function rainbowTexture(w = 16, h = 128) {
  const c = makeCanvas(w, h);
  const cols = [[255, 92, 120], [255, 160, 70], [255, 226, 90], [120, 220, 120], [90, 190, 255], [180, 130, 255]];
  paintPixels(c, (u, v) => {
    const k = Math.min(cols.length - 1, Math.floor(v * cols.length));
    const f = v * cols.length - k;
    const edge = 0.86 + 0.14 * smooth(0.0, 0.12, Math.min(f, 1 - f));
    const sugar = 0.94 + 0.06 * noise3(u * 40, v * 200, 91);
    return cols[k].map(q => clamp255(q * edge * sugar));
  });
  const t = toTexture(c);
  return t;
}

/**
 * Lollipop swirl mask for CylinderGeometry caps (uv = the disc mapped into 0..1). R = arm mask (1 = the
 * vertex colour, 0 = white), a 3-arm spiral with a thin white rim; the `swirl` material mixes it.
 */
export function swirlTexture(size = 256) {
  const c = makeCanvas(size);
  paintPixels(c, (u, v) => {
    const x = u - 0.5, y = v - 0.5, r = Math.hypot(x, y) * 2, a = Math.atan2(y, x);
    const s = ((a / (Math.PI * 2)) * 3 + r * 2.6 + 10) % 1;
    const band = smooth(0.0, 0.05, s) * smooth(0.55, 0.5, s);
    const k = band * (1 - smooth(0.86, 0.93, r)) * smooth(0.0, 0.08, r);
    return [clamp255(k * 255), clamp255(k * 255), clamp255(k * 255)];
  });
  return toTexture(c, { repeat: false, srgb: false });
}

/**
 * Tee pad: a pink-iced cookie (map) with a white piped star, sprinkles and a scalloped icing ring,
 * plus a glowing star and ring (emissive). The star's top point is texture +v.
 */
export function teePadTextures(size = 512) {
  const cm = makeCanvas(size), ce = makeCanvas(size);
  const R = size / 2;
  const g = cm.getContext('2d');
  g.translate(R, R);
  // cookie base
  g.fillStyle = '#d99a5a'; g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.fill();
  // pink icing with a scalloped edge
  g.fillStyle = '#ff8cbc';
  g.beginPath();
  for (let i = 0; i <= 240; i++) {
    const a = i / 240 * Math.PI * 2, rr = R * (0.86 + 0.025 * Math.cos(a * 24));
    if (i) g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  g.fill();
  const grd = g.createRadialGradient(-R * 0.25, -R * 0.25, 0, 0, 0, R);
  grd.addColorStop(0, 'rgba(255,255,255,0.35)'); grd.addColorStop(0.6, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.beginPath(); g.arc(0, 0, R * 0.86, 0, Math.PI * 2); g.fill();
  // white piped dots ring
  g.fillStyle = '#ffffff';
  for (let i = 0; i < 28; i++) { const a = i / 28 * Math.PI * 2; g.beginPath(); g.arc(Math.cos(a) * R * 0.74, Math.sin(a) * R * 0.74, R * 0.028, 0, Math.PI * 2); g.fill(); }
  // sprinkles between the ring and the star
  g.save(); g.beginPath(); g.arc(0, 0, R * 0.68, 0, Math.PI * 2); g.clip();
  g.translate(-R, -R); sprinkles(g, size, size, 70, R * 0.08, R * 0.022, 33); g.restore();
  // white star (top point toward canvas top = texture +v)
  const star = (ctx, s) => {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? s * 0.46 : s; if (i) ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    ctx.closePath();
  };
  g.fillStyle = '#ffffff'; star(g, R * 0.5); g.fill();
  g.strokeStyle = '#ffd23f'; g.lineWidth = R * 0.03; g.lineJoin = 'round'; star(g, R * 0.5); g.stroke();

  const e = ce.getContext('2d');
  e.fillStyle = '#000'; e.fillRect(0, 0, size, size);
  e.translate(R, R);
  e.shadowColor = '#ffffff'; e.shadowBlur = size * 0.03;
  e.fillStyle = 'rgba(255,240,250,0.85)'; star(e, R * 0.5); e.fill();
  e.shadowColor = '#ff6ab4'; e.shadowBlur = size * 0.02;
  e.strokeStyle = 'rgba(255,120,190,0.7)'; e.lineWidth = size * 0.012;
  e.beginPath(); e.arc(0, 0, R * 0.86, 0, Math.PI * 2); e.stroke();
  return { map: toTexture(cm, { repeat: false }), emissive: toTexture(ce, { repeat: false }) };
}

/** Flag cloth: hot pink with white polka dots, a swirl lollipop emblem and a yellow hem. u = 0 at the pole. */
export function flagTexture(w = 128, h = 96) {
  const c = makeCanvas(w, h);
  const g = paintPixels(c, (u, v) => {
    const n = fbm3(u * 6, v * 5, 93, 3, 0);
    const k = 0.9 + n * 0.16;
    const hem = (v < 0.07 || v > 0.93 || u > 0.94) ? 1 : 0;
    if (hem) return [255, 214, 70];
    const du = ((u * 7) % 1) - 0.5, dv = ((v * 5.25 + (Math.floor(u * 7) % 2) * 0.5) % 1) - 0.5;
    const dot = Math.hypot(du, dv * 0.75) < 0.17 ? 1 : 0;
    return dot ? [255, 236, 246] : [clamp255(250 * k), clamp255(74 * k), clamp255(150 * k)];
  });
  // emblem: a swirl lollipop
  g.save(); g.translate(w * 0.5, h * 0.44);
  const rr = h * 0.24;
  g.fillStyle = '#ffffff'; g.beginPath(); g.arc(0, 0, rr * 1.08, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#ff5c9a'; g.lineWidth = rr * 0.28; g.lineCap = 'round';
  g.beginPath();
  for (let i = 0; i <= 60; i++) { const t = i / 60, a = t * Math.PI * 5, q = rr * 0.92 * t; if (i) g.lineTo(Math.cos(a) * q, Math.sin(a) * q); else g.moveTo(0, 0); }
  g.stroke();
  g.fillStyle = '#ffffff'; g.fillRect(-rr * 0.08, rr * 1.05, rr * 0.16, rr * 0.9);
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

/** Four-point sugar sparkle (white, alpha). */
export function sparkleTexture(size = 64) {
  const c = makeCanvas(size);
  const g = c.getContext('2d');
  const h = size / 2;
  const grd = g.createRadialGradient(h, h, 0, h, h, h * 0.5);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, size, size);
  g.fillStyle = 'rgba(255,255,255,0.9)';
  for (const rot of [0, Math.PI / 2]) {
    g.save(); g.translate(h, h); g.rotate(rot);
    g.beginPath(); g.moveTo(-h, 0); g.quadraticCurveTo(0, h * 0.07, h, 0); g.quadraticCurveTo(0, -h * 0.07, -h, 0); g.fill();
    g.restore();
  }
  return toTexture(c, { repeat: false, srgb: false });
}

/** Cotton-candy cloud atlas 2×2 (soft white puffs; tinted per billboard). */
export function cloudAtlasTexture(size = 256) {
  const c = makeCanvas(size);
  const g = c.getContext('2d');
  const cell = size / 2;
  const r = rng(78);
  for (let k = 0; k < 4; k++) {
    const ox = (k % 2) * cell, oy = Math.floor(k / 2) * cell;
    g.save(); g.beginPath(); g.rect(ox, oy, cell, cell); g.clip();
    for (let i = 0; i < 20; i++) {
      const t = i / 19;
      const x = ox + cell * (0.14 + t * 0.72), y = oy + cell * (0.58 - Math.sin(t * Math.PI) * 0.18 + (r() - 0.5) * 0.08);
      const rx = cell * (0.1 + Math.sin(t * Math.PI) * 0.14);
      const grd = g.createRadialGradient(x, y - rx * 0.3, 0, x, y, rx);
      grd.addColorStop(0, 'rgba(255,255,255,0.75)'); grd.addColorStop(0.7, 'rgba(255,255,255,0.35)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.beginPath(); g.arc(x, y, rx, 0, Math.PI * 2); g.fill();
    }
    g.restore();
  }
  return toTexture(c, { repeat: false });
}

/** Chocolate fall: flowing brown streaks with glossy highlights (tiles in v). */
export function chocoFallTexture(w = 64, h = 256) {
  const c = makeCanvas(w, h);
  paintPixels(c, (u, v, x, y) => {
    const f = (yy) => noise3(x * 0.35, yy * 0.03, 81, 0) * 0.7 + noise3(x * 1.0, yy * 0.07, 83, 0) * 0.3;
    const t = y / h;
    const n = f(y) * (1 - t) + f(y - h) * t;
    const hl = smooth(0.62, 0.8, n);
    const k = 0.75 + n * 0.35;
    return [clamp255(110 * k + hl * 120), clamp255(62 * k + hl * 80), clamp255(38 * k + hl * 60), clamp255(225 + n * 30)];
  });
  return toTexture(c);
}

/** Vertical fade (alpha 1 at v=1 → 0 at v=0). */
export function fadeTexture(size = 64) {
  const c = makeCanvas(4, size);
  paintPixels(c, (u, v) => { const k = clamp255(Math.pow(1 - v, 1.4) * 255); return [k, k, k]; });
  return toTexture(c, { repeat: false, srgb: false });
}
