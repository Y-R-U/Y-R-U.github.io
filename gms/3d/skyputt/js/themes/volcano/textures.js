// Volcano Forge theme — procedural canvas textures (no downloaded assets).
// UV conventions (engine builder): floor u = lateral m, v = along m; walls u = along m, v = height m
// (0 at the floor, 0.12 at the top, -0.1 at the outer foot); wallTop u = along m, v 0..1 across;
// trim u = along m, v 0 (top of the 2.5 cm band) → 1 (bottom); boost u = lateral m from the pad centre.
import { makeCanvas, paintPixels, toTexture, fbm3, noise3, rng } from './util.js';

const clamp255 = v => (v < 0 ? 0 : v > 255 ? 255 : v | 0);
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
const mix3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];

/** Tileable cellular (Worley) F2-F1 in [0,1] for a `cells`-per-tile grid. Low values = near a crack. */
function cellular(u, v, cells, seed) {
  const x = u * cells, y = v * cells, xi = Math.floor(x), yi = Math.floor(y);
  let f1 = 9, f2 = 9;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = xi + i, cy = yi + j;
    const wx = ((cx % cells) + cells) % cells, wy = ((cy % cells) + cells) % cells;
    const hx = noise3(wx * 17.13 + 0.5, wy * 9.71 + 0.5, seed) , hy = noise3(wx * 5.37 + 0.5, wy * 13.9 + 0.5, seed + 7);
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
 * Scorched-moss putting surface: 2 m tile (material repeat 0.5), olive-grey moss with soft mowing
 * stripes every 0.5 m along v, a fine felt grain and a light dusting of pale ash. Kept mid-bright so a
 * white ball and the guide line read on a phone.
 */
export function grassTexture(size = 512) {
  const c = makeCanvas(size);
  const L = [132, 146, 96], D = [112, 128, 82];
  const g = paintPixels(c, (u, v, x, y) => {
    const band = smooth(-0.3, 0.3, Math.sin(v * Math.PI * 4));
    const n = noise3(x * 0.9, y * 0.9, 1, size * 0.9) * 0.5 + noise3(x * 0.25, y * 0.25, 7, size * 0.25) * 0.5;
    const patch = fbm3(u * 4, v * 4, 3, 3, 4);
    const k = 0.88 + n * 0.16 + (patch - 0.5) * 0.12;
    const scorch = smooth(0.62, 0.78, patch) * 0.12;            // faint browned patches
    const col = mix3(L, D, band).map(q => q * k);
    return [clamp255(col[0] + scorch * 40), clamp255(col[1] - scorch * 30), clamp255(col[2] - scorch * 30)];
  });
  specks(g, size, size, Math.round(size * 0.22), size * 0.0025, size * 0.006, ['#d8d2c4', '#bdb6a8', '#e8e0d0'], 11, 0.5);
  specks(g, size, size, Math.round(size * 0.05), size * 0.002, size * 0.004, ['#3a3226', '#2a241c'], 12, 0.5);
  return toTexture(c);
}

/** Fringe: dark ash and cinders with glowing ember specks (map + emissive), 1 m tile. */
export function fringeTextures(size = 256) {
  const cm = makeCanvas(size), ce = makeCanvas(size);
  const g = paintPixels(cm, (u, v, x, y) => {
    const n = noise3(x * 1.2, y * 1.2, 2, size * 1.2);
    const b = fbm3(u * 8, v * 8, 5, 3, 8);
    const k = 0.75 + n * 0.3 + (b - 0.5) * 0.3;
    return [clamp255(84 * k), clamp255(86 * k), clamp255(64 * k)];
  });
  specks(g, size, size, Math.round(size * 0.6), size * 0.006, size * 0.016, ['#2a2622', '#3c3530', '#57504a'], 13);
  const e = ce.getContext('2d');
  e.fillStyle = '#000'; e.fillRect(0, 0, size, size);
  specks(e, size, size, Math.round(size * 0.08), size * 0.004, size * 0.009, ['#ff6a18', '#ff8a2a', '#ffb040'], 14);
  specks(g, size, size, Math.round(size * 0.08), size * 0.004, size * 0.009, ['#c04010', '#d05818', '#e07020'], 14);
  return { map: toTexture(cm), emissive: toTexture(ce) };
}

/**
 * Basalt walls (0.25 m tile, material repeat 4): vertical columns ~4 cm wide with dark seams, each column
 * its own tone, a few horizontal joints; emissive map = thin molten cracks in a few seams.
 */
export function basaltTextures(size = 256) {
  const cm = makeCanvas(size), ce = makeCanvas(size);
  const COLS = 6;
  const tone = i => 0.82 + noise3(i * 3.7, 0, 41) * 0.36;
  paintPixels(cm, (u, v, x, y) => {
    const cu = u * COLS, ci = Math.floor(cu), f = cu - ci;
    const seam = smooth(0.0, 0.08, Math.min(f, 1 - f));
    const jv = (v * 3 + noise3(ci * 1.3, 0, 47) * 3) % 1;
    const joint = smooth(0.0, 0.04, Math.min(jv, 1 - jv)) * 0.5 + 0.5;
    const n = noise3(x * 1.1, y * 1.1, 43, size * 1.1) * 0.5 + fbm3(u * 6, v * 6, 45, 3, 6) * 0.5;
    const facet = 0.92 + 0.12 * (f < 0.5 ? f : 1 - f);
    const k = tone(((ci % COLS) + COLS) % COLS) * (0.62 + n * 0.5) * (0.35 + seam * 0.65) * joint * facet;
    return [clamp255(74 * k), clamp255(70 * k), clamp255(72 * k)];
  });
  paintPixels(ce, (u, v) => {
    const cu = u * COLS, ci = Math.floor(cu), f = cu - ci;
    const hot = noise3((((ci % COLS) + COLS) % COLS) * 5.1, 0, 49) > 0.55 ? 1 : 0;
    const d = Math.min(f, 1 - f);
    const line = (1 - smooth(0.0, 0.035, d)) * hot * (0.6 + 0.4 * noise3(u * 9, v * 30, 51, 0));
    const k = line;
    return [clamp255(255 * k), clamp255(110 * k), clamp255(30 * k)];
  });
  return { map: toTexture(cm), emissive: toTexture(ce) };
}

/** Wall cap: dark forged iron with brass edging along both edges and brass rivets (512×128 = 0.5 m along). */
export function capTexture(w = 512, h = 128) {
  const c = makeCanvas(w, h);
  const g = paintPixels(c, (u, v, x, y) => {
    const n = fbm3(u * 10, v * 3, 21, 3, 10);
    const edge = Math.min(v, 1 - v);
    if (edge < 0.13) {                       // brass edging
      const sh = 0.82 + 0.18 * Math.sin((edge / 0.13) * Math.PI);
      return [clamp255(214 * sh * (0.92 + n * 0.1)), clamp255(160 * sh * (0.92 + n * 0.1)), clamp255(78 * sh)];
    }
    const ham = noise3(x * 0.18, y * 0.5, 23) * 0.5 + noise3(x * 0.5, y * 1.2, 24) * 0.5;   // hammer marks
    const k = 0.78 + n * 0.2 + (ham - 0.5) * 0.25;
    return [clamp255(84 * k), clamp255(80 * k), clamp255(78 * k)];
  });
  // brass rivets every 10 cm along the middle line
  for (let i = 0; i < 5; i++) {
    const x = (i + 0.5) / 5 * w, y = h / 2, rr = h * 0.075;
    const grd = g.createRadialGradient(x - rr * 0.3, y - rr * 0.3, 0, x, y, rr);
    grd.addColorStop(0, '#ffe2a0'); grd.addColorStop(0.6, '#c89040'); grd.addColorStop(1, '#5a3a14');
    g.fillStyle = grd; g.beginPath(); g.arc(x, y, rr, 0, Math.PI * 2); g.fill();
  }
  return toTexture(c);
}

/**
 * Trim strip (2.5 cm tall, repeat 4 → 0.25 m tile): thin brass bands top and bottom, a molten channel in
 * the middle. Returns { map, emissive }; the emissive scrolls along u so the lava seems to flow.
 */
export function trimTextures(w = 256, h = 32) {
  const cm = makeCanvas(w, h), ce = makeCanvas(w, h);
  paintPixels(cm, (u, v) => {
    const n = noise3(u * 40, v * 4, 31, 0);
    if (v < 0.22 || v > 0.84) { const s = 0.85 + n * 0.2; return [clamp255(220 * s), clamp255(166 * s), clamp255(80 * s)]; }
    return [clamp255(70 + n * 30), clamp255(28 + n * 10), clamp255(14)];
  });
  paintPixels(ce, (u, v) => {
    if (v < 0.22 || v > 0.84) return [0, 0, 0];
    const mid = 1 - Math.abs((v - 0.53) / 0.31);
    const n = noise3(u * 24, v * 3, 33, 24) * 0.6 + noise3(u * 64, v * 6, 35, 64) * 0.4;
    const crust = smooth(0.62, 0.74, n);
    const k = smooth(0.0, 0.5, mid) * (1 - crust * 0.85);
    return [clamp255(255 * k), clamp255((90 + mid * 90) * k), clamp255(20 * k)];
  });
  return { map: toTexture(cm), emissive: toTexture(ce) };
}

/**
 * Island rock data map (linear, not sRGB): R = basalt tone with vertical column seams (sides),
 * G = plain grain (moss top), B = crack network mask (1 on a crack) for the lava glow.
 */
export function rockDataTexture(size = 256) {
  const c = makeCanvas(size);
  paintPixels(c, (u, v, x, y) => {
    const n = fbm3(u * 10, v * 10, 51, 4, 10);
    const cu = u * 10, f = cu - Math.floor(cu);
    const seam = smooth(0.0, 0.1, Math.min(f, 1 - f));
    const col = noise3(Math.floor(cu) * 3.1, 0, 52, 10);
    const R = (0.55 + col * 0.3 + (n - 0.5) * 0.35) * (0.45 + seam * 0.55);
    const G = 0.82 + (n - 0.5) * 0.4 + (noise3(x * 0.8, y * 0.8, 53, size * 0.8) - 0.5) * 0.2;
    const cr = cellular(u, v, 6, 55);
    const cr2 = cellular(u, v, 14, 57);
    const B = Math.max(1 - smooth(0.0, 0.06, cr), (1 - smooth(0.0, 0.05, cr2)) * 0.6);
    return [clamp255(R * 255), clamp255(G * 255), clamp255(B * 255)];
  });
  return toTexture(c, { srgb: false });
}

/** Ash / cinder trap: pale volcanic ash with dark cinders and a few red embers (1 m tile). */
export function ashTexture(size = 256) {
  const c = makeCanvas(size);
  const g = paintPixels(c, (u, v, x, y) => {
    const n = fbm3(u * 6, v * 6, 61, 4, 6);
    const grain = noise3(x * 1.6, y * 1.6, 62, size * 1.6);
    const ripple = 0.5 + 0.5 * Math.sin((v * 9 + n * 2.2) * Math.PI * 2);
    const k = 0.8 + n * 0.22 + grain * 0.1 + ripple * 0.05;
    return [clamp255(168 * k), clamp255(160 * k), clamp255(150 * k)];
  });
  specks(g, size, size, Math.round(size * 0.5), size * 0.004, size * 0.012, ['#2a2622', '#3e3832', '#4a403a'], 64, 0.85);
  specks(g, size, size, Math.round(size * 0.04), size * 0.004, size * 0.008, ['#c0441a', '#e06a20'], 65, 0.9);
  return toTexture(c);
}

/** Obsidian (ice patches): glossy deep plum-black glass with conchoidal ripples and pale sheen lines. */
export function obsidianTexture(size = 256) {
  const c = makeCanvas(size);
  paintPixels(c, (u, v) => {
    const n = fbm3(u * 4, v * 4, 71, 4, 4);
    const rip = 0.5 + 0.5 * Math.sin((Math.hypot(u - 0.3, v - 0.6) * 14 + n * 4) * Math.PI * 2);
    const line = smooth(0.88, 0.98, rip);
    const k = 0.75 + n * 0.35;
    return [clamp255(62 * k + line * 90), clamp255(46 * k + line * 76), clamp255(78 * k + line * 100)];
  });
  return toTexture(c);
}

/** Iron deck plates across u (0.25 m each along v, 1 m tile) with brass rivets at the seams and rust. */
export function ironPlateTexture(size = 256) {
  const c = makeCanvas(size);
  const g = paintPixels(c, (u, v, x, y) => {
    const j = Math.floor(v * 4), fv = v * 4 - j;
    const n = fbm3(u * 8, v * 8, 81, 3, 8);
    const rust = smooth(0.58, 0.75, fbm3(u * 5 + j, v * 5, 82, 3, 5));
    const gap = smooth(0.0, 0.04, Math.min(fv, 1 - fv));
    const tread = (Math.abs(((u * 20 + (j % 2) * 0.5) % 1) - 0.5) < 0.08 && Math.abs(((fv * 5) % 1) - 0.5) < 0.3) ? 1 : 0;
    const t = Math.abs((Math.sin(j * 12.9898) * 43758.5453) % 1);
    const k = (0.8 + n * 0.25 + t * 0.08) * (0.4 + gap * 0.6) * (1 + tread * 0.14);
    const base = mix3([118, 112, 106], [140, 82, 48], rust * 0.7);
    return [clamp255(base[0] * k), clamp255(base[1] * k), clamp255(base[2] * k)];
  });
  for (let j = 0; j < 4; j++) for (let i = 0; i < 8; i++) for (const fy of [0.08, 0.92]) {
    const x = (i + 0.5) / 8 * size, y = (j + fy) / 4 * size, rr = size * 0.012;
    g.fillStyle = '#d8a050'; g.beginPath(); g.arc(x, y, rr, 0, Math.PI * 2); g.fill();
  }
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

/** Boost pad emissive: glowing orange/yellow chevrons pointing +v, two per tile, tip at u = 0. */
export function chevronTexture(w = 128, h = 256) {
  const c = makeCanvas(w, h);
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
  for (let k = 0; k < 2; k++) {
    const y0 = k * h / 2;
    for (const [blur, width, col] of [[18, 20, 'rgba(255,80,10,0.6)'], [6, 12, 'rgba(255,150,40,0.95)'], [0, 4, '#fff0c0']]) {
      g.save();
      g.shadowColor = '#ff5a10'; g.shadowBlur = blur;
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

/**
 * Molten lava (pools, falls, crater, lava sea accents): bright orange-yellow with dark crust plates.
 * Tiles in both directions. Used as an emissive / basic map.
 */
export function lavaTexture(size = 256) {
  const c = makeCanvas(size);
  paintPixels(c, (u, v, x, y) => {
    const cr = cellular(u, v, 5, 91);
    const n = fbm3(u * 6, v * 6, 93, 4, 6);
    const crust = smooth(0.12, 0.3, cr + (n - 0.5) * 0.25);
    const hot = 1 - crust;
    const base = mix3([255, 200, 70], [255, 92, 18], smooth(0.0, 0.6, crust + n * 0.3));
    const dark = [58, 18, 10];
    const col = mix3(base, dark, crust * 0.85);
    const k = 0.85 + hot * 0.15;
    return [clamp255(col[0] * k), clamp255(col[1] * k), clamp255(col[2] * k)];
  });
  return toTexture(c);
}

/** Lava fall: vertical molten streaks with darker cooling ribs (tiles in v). Alpha in A. */
export function lavaFallTexture(w = 64, h = 256) {
  const c = makeCanvas(w, h);
  paintPixels(c, (u, v, x, y) => {
    const f = (yy) => noise3(x * 0.35, yy * 0.03, 81, 0) * 0.7 + noise3(x * 1.0, yy * 0.07, 83, 0) * 0.3;
    const t = y / h;
    const n = f(y) * (1 - t) + f(y - h) * t;
    const hl = smooth(0.55, 0.78, n);
    const dk = smooth(0.42, 0.25, n);
    const col = mix3(mix3([255, 110, 24], [255, 214, 96], hl), [90, 24, 10], dk * 0.8);
    return [clamp255(col[0]), clamp255(col[1]), clamp255(col[2]), clamp255(215 + n * 40)];
  });
  return toTexture(c);
}

/**
 * Loop band (u along m, v 0..1 across): dark riveted iron with a molten seam down the middle and brass
 * edges. Returns { map, emissive }.
 */
export function bandTextures(w = 128, h = 64) {
  const cm = makeCanvas(w, h), ce = makeCanvas(w, h);
  const g = paintPixels(cm, (u, v) => {
    const n = fbm3(u * 6, v * 3, 95, 3, 6);
    if (v < 0.12 || v > 0.88) { const s = 0.85 + n * 0.2; return [clamp255(214 * s), clamp255(160 * s), clamp255(76 * s)]; }
    const plate = ((u * 4) % 1) < 0.03 ? 0.55 : 1;
    const k = (0.72 + n * 0.3) * plate;
    return [clamp255(78 * k), clamp255(72 * k), clamp255(70 * k)];
  });
  for (let i = 0; i < 8; i++) for (const fy of [0.22, 0.78]) {
    g.fillStyle = '#6a4a30'; g.beginPath(); g.arc((i + 0.5) / 8 * w, fy * h, h * 0.035, 0, Math.PI * 2); g.fill();
  }
  paintPixels(ce, (u, v) => {
    const d = Math.abs(v - 0.5);
    const n = noise3(u * 16, v * 4, 97, 16);
    const k = (1 - smooth(0.03, 0.09, d)) * (0.7 + 0.3 * n);
    return [clamp255(255 * k), clamp255(120 * k), clamp255(24 * k)];
  });
  return { map: toTexture(cm), emissive: toTexture(ce) };
}

/**
 * Tee pad: a forged iron disc with a brass ring, rune marks and a hammer-over-anvil sigil (map), and the
 * sigil + rune ring glowing molten (emissive). The hammer head points to texture +v.
 */
export function teePadTextures(size = 512) {
  const cm = makeCanvas(size), ce = makeCanvas(size);
  const R = size / 2;
  const g = cm.getContext('2d');
  // iron base with hammered noise
  paintPixels(cm, (u, v, x, y) => {
    const n = noise3(x * 0.05, y * 0.05, 101) * 0.5 + noise3(x * 0.2, y * 0.2, 102) * 0.5;
    const k = 0.75 + n * 0.3;
    return [clamp255(92 * k), clamp255(86 * k), clamp255(84 * k)];
  });
  g.translate(R, R);
  // brass ring
  g.strokeStyle = '#d0a050'; g.lineWidth = R * 0.07;
  g.beginPath(); g.arc(0, 0, R * 0.86, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = '#8a6020'; g.lineWidth = R * 0.015;
  g.beginPath(); g.arc(0, 0, R * 0.82, 0, Math.PI * 2); g.stroke();
  // rune ticks
  const runes = (ctx, col, wdt) => {
    ctx.strokeStyle = col; ctx.lineWidth = wdt; ctx.lineCap = 'round';
    for (let i = 0; i < 16; i++) {
      const a = i / 16 * Math.PI * 2, r0 = R * 0.66, r1 = R * 0.74;
      ctx.save(); ctx.rotate(a);
      ctx.beginPath(); ctx.moveTo(0, -r0); ctx.lineTo(0, -r1);
      if (i % 2) { ctx.moveTo(-R * 0.025, -r0 - R * 0.02); ctx.lineTo(R * 0.025, -r1 + R * 0.02); }
      else { ctx.moveTo(-R * 0.03, -r1); ctx.lineTo(R * 0.03, -r1 + R * 0.04); }
      ctx.stroke(); ctx.restore();
    }
  };
  runes(g, '#3a2a20', R * 0.02);
  // sigil: anvil (bottom) with a hammer above it; hammer head toward canvas top (texture +v)
  const sigil = (ctx) => {
    ctx.beginPath();     // anvil
    ctx.moveTo(-R * 0.36, R * 0.08); ctx.lineTo(R * 0.24, R * 0.08); ctx.quadraticCurveTo(R * 0.36, R * 0.1, R * 0.44, R * 0.05);
    ctx.lineTo(R * 0.24, R * 0.2); ctx.lineTo(R * 0.12, R * 0.22); ctx.lineTo(R * 0.12, R * 0.34); ctx.lineTo(R * 0.26, R * 0.44);
    ctx.lineTo(-R * 0.3, R * 0.44); ctx.lineTo(-R * 0.16, R * 0.34); ctx.lineTo(-R * 0.16, R * 0.22); ctx.lineTo(-R * 0.36, R * 0.18);
    ctx.closePath(); ctx.fill();
    ctx.fillRect(-R * 0.05, -R * 0.42, R * 0.08, R * 0.42);     // hammer handle
    ctx.fillRect(-R * 0.2, -R * 0.52, R * 0.38, R * 0.16);      // hammer head
  };
  g.fillStyle = '#4a3a30'; sigil(g);
  g.strokeStyle = '#c89040'; g.lineWidth = R * 0.012; g.stroke();

  const e = ce.getContext('2d');
  e.fillStyle = '#000'; e.fillRect(0, 0, size, size);
  e.translate(R, R);
  e.shadowColor = '#ff6a10'; e.shadowBlur = size * 0.03;
  e.fillStyle = 'rgba(255,120,30,0.95)'; sigil(e);
  e.shadowBlur = size * 0.015;
  runes(e, 'rgba(255,140,40,0.9)', R * 0.022);
  return { map: toTexture(cm, { repeat: false }), emissive: toTexture(ce, { repeat: false }) };
}

/** Flag cloth: deep forge red with a gold border and a gold hammer-and-anvil emblem. u = 0 at the pole. */
export function flagTexture(w = 128, h = 96) {
  const c = makeCanvas(w, h);
  const g = paintPixels(c, (u, v) => {
    const n = fbm3(u * 6, v * 5, 93, 3, 0);
    const k = 0.85 + n * 0.2;
    const hem = (v < 0.08 || v > 0.92 || u > 0.93) ? 1 : 0;
    if (hem) return [clamp255(232 * k), clamp255(172 * k), 64];
    return [clamp255(178 * k), clamp255(30 * k), clamp255(22 * k)];
  });
  g.save(); g.translate(w * 0.48, h * 0.5);
  const s = h * 0.36;
  g.fillStyle = '#f2c050';
  g.beginPath();
  g.moveTo(-s * 0.8, s * 0.1); g.lineTo(s * 0.6, s * 0.1); g.lineTo(s * 0.95, 0); g.lineTo(s * 0.5, s * 0.35);
  g.lineTo(s * 0.25, s * 0.4); g.lineTo(s * 0.25, s * 0.7); g.lineTo(s * 0.55, s * 0.9); g.lineTo(-s * 0.6, s * 0.9);
  g.lineTo(-s * 0.3, s * 0.7); g.lineTo(-s * 0.3, s * 0.4); g.lineTo(-s * 0.8, s * 0.32); g.closePath(); g.fill();
  g.save(); g.rotate(-0.5);
  g.fillRect(-s * 0.06, -s * 0.95, s * 0.12, s * 0.9);
  g.fillRect(-s * 0.36, -s * 1.1, s * 0.72, s * 0.3);
  g.restore();
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

/** Ember spark: a hot core with a short soft halo (white, alpha). */
export function sparkTexture(size = 64) {
  const c = makeCanvas(size);
  const g = c.getContext('2d');
  const h = size / 2;
  const grd = g.createRadialGradient(h, h, 0, h, h, h);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.18, 'rgba(255,255,255,0.85)');
  grd.addColorStop(0.45, 'rgba(255,255,255,0.18)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, size, size);
  return toTexture(c, { repeat: false, srgb: false });
}

/** Smoke atlas 2×2 (soft billowing puffs, white; tinted per billboard). */
export function smokeAtlasTexture(size = 256) {
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

/** Vertical fade (alpha 1 at v=1 → 0 at v=0). */
export function fadeTexture(size = 64) {
  const c = makeCanvas(4, size);
  paintPixels(c, (u, v) => { const k = clamp255(Math.pow(1 - v, 1.4) * 255); return [k, k, k]; });
  return toTexture(c, { repeat: false, srgb: false });
}
