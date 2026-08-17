// Every runtime-generated texture. Canvases only — zero bytes shipped, ~40 ms at boot.
// (The *signage* atlas is different: it is baked offline and shipped. See §3.5.1 / P1b.)
//
// §3.4's two hard requirements live here and nothing else in the project can fix them:
//   1. gutters, so bilinear at a cell seam pulls in that cell's own wrapped continuation
//      instead of the neighbouring window pattern;
//   2. a mip chain clamped at 8x8 texels per cell, because below that a "mip" is an average of
//      several cells and no gutter can save it.

import * as THREE from 'three';
import { xorshift32, clamp } from './utils.js';

// What atlas.js bakes into one cell. §3.4 quotes 32/32; the pitch rule that actually matters is
// the world one (one row = 3.6 m, one column = 3.2 m), and materials.js derives iUvScale from
// these two constants, so the two stay in step by construction.
export const COLS_PER_CELL = 32;
export const ROWS_PER_CELL = 32;
export const GRID = 4;                 // 4x4 cells

// ── the window atlas ───────────────────────────────────────────────────────
//
// Layout, and the one deviation from §3.4 worth stating: §3.4 asks for 8-texel gutters *and*
// `CELL = 0.25` on a 4x4 atlas. Those cannot both be true — at 1024/4 = 256 there is no space
// left over, so a "gutter" would have to be the neighbour's texels. The gutter is therefore
// taken out of the cell: each 256 px cell holds a 240 px pattern with an 8 px ring of its own
// wrapped continuation around it, and the shader samples the inner rect via a `uCell` uniform
// (240/1024) with the ring baked into `iUvOffset`. Same technique, correct arithmetic: a sample
// at `fract()==0` or `==1` still has 8 clean texels beyond it, which covers bilinear and mips
// 0-3 exactly.

function cellPattern(ctx, w, h, kind, rng) {
  const cols = COLS_PER_CELL, rows = ROWS_PER_CELL;
  const cw = w / cols, ch = h / rows;

  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);

  // Pane inset, in texels, kept below half a pane so the grid never closes up at low res.
  //
  // P11 raised it from 0.16 to 0.25 of the pitch. At 0.16 a lit pane covered 68 % of its 3.2 x
  // 3.6 m cell, so a fully lit floor was a continuous bar of light with a hairline between panes —
  // which is a decal, and is what "the window grid is uniform in size, spacing and colour"
  // actually describes. Opened at full resolution, 746850_01's glazing is roughly HALF its pitch
  // with real wall between. 0.25 gives 50 %. The PITCH is untouched (§3.10 #1) — only the glass
  // inside it.
  const inset = Math.max(0.35, Math.min(cw, ch) * 0.25);

  const pane = (c, r, v, warm) => {
    const g = clamp(v, 0, 1);
    const rr = Math.round(255 * Math.min(1, g * (warm ? 1.0 : 0.86)));
    const gg = Math.round(255 * Math.min(1, g * (warm ? 0.82 : 0.90)));
    const bb = Math.round(255 * Math.min(1, g * (warm ? 0.58 : 1.0)));
    // P11 — the SPILL HALO, and it is the single most-named thing in the whole critic history of
    // this project. Round 7's six blind critics all led with a version of "the emissive windows do
    // not light the wall around them, so each tower reads as a decal rather than a lit surface",
    // and three of them wrote the fix in the same terms: "the wall around each lit pane should be
    // 15-30 % brighter and colour-shifted toward the pane".
    //
    // A per-fragment term cannot do this well — P11's `uSpill` lifts the WHOLE facade uniformly,
    // which at any strength that reads on the wall next to a window also washes out the wall
    // fifty metres from one. What the eye wants is LOCAL: a halo the size of the window, plus the
    // longer spill down the spandrel below it, because that is where the light actually falls.
    // Baked into the atlas it costs nothing per frame and it is correct per pane rather than per
    // building.
    const hx = c * cw + cw * 0.5, hy = r * ch + ch * 0.5;
    const hg = ctx.createRadialGradient(hx, hy, Math.min(cw, ch) * 0.22, hx, hy, Math.max(cw, ch) * 0.92);
    hg.addColorStop(0, `rgba(${rr},${gg},${bb},${(0.30 * g).toFixed(3)})`);
    hg.addColorStop(0.55, `rgba(${rr},${gg},${bb},${(0.10 * g).toFixed(3)})`);
    hg.addColorStop(1, `rgba(${rr},${gg},${bb},0)`);
    ctx.fillStyle = hg;
    ctx.fillRect(c * cw - cw * 0.9, r * ch - ch * 0.9, cw * 2.8, ch * 2.8);
    // the sill: light falls further DOWN the wall than sideways, which is what makes it read as
    // light from a window rather than as a glow sprite centred on one.
    const sg = ctx.createLinearGradient(0, r * ch + ch - inset, 0, r * ch + ch * 1.85);
    sg.addColorStop(0, `rgba(${rr},${gg},${bb},${(0.34 * g).toFixed(3)})`);
    sg.addColorStop(1, `rgba(${rr},${gg},${bb},0)`);
    ctx.fillStyle = sg;
    ctx.fillRect(c * cw + inset * 0.2, r * ch + ch - inset, cw - inset * 0.4, ch * 0.85 + inset);
    ctx.fillStyle = `rgb(${rr},${gg},${bb})`;
    ctx.fillRect(c * cw + inset, r * ch + inset, cw - inset * 2, ch - inset * 2);
  };

  switch (kind) {
    // 0-3 — office grids at four pitches, 55-80 % lit
    case 0: case 1: case 2: case 3: {
      const step = 1 + (kind & 1);                  // every row, or every other row
      const wide = kind >= 2 ? 2 : 1;               // 1 or 2 panes per bay
      const lit = 0.55 + kind * 0.065;
      for (let r = 0; r < rows; r += step)
        for (let c = 0; c < cols; c += wide)
          if (rng() < lit) {
            const v = 0.55 + rng() * 0.45;
            for (let k = 0; k < wide && c + k < cols; k++) pane(c + k, r, v, false);
          }
      break;
    }
    // 4-6 — residential: irregular, 25-40 % lit, warmer
    case 4: case 5: case 6: {
      const lit = 0.25 + (kind - 4) * 0.075;
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++)
          if (rng() < lit) pane(c, r, 0.35 + rng() * 0.65, true);
      break;
    }
    // 7-8 — ribbon windows: horizontal bands, no verticals
    case 7: case 8: {
      const step = kind === 7 ? 2 : 3;
      for (let r = 0; r < rows; r += step) {
        const v = 0.4 + rng() * 0.5;
        const grad = ctx.createLinearGradient(0, 0, w, 0);
        for (let s = 0; s <= 8; s++) grad.addColorStop(s / 8, `rgba(255,246,228,${(v * (0.55 + rng() * 0.45)).toFixed(3)})`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, r * ch + inset, w, ch - inset * 2);
      }
      break;
    }
    // 9-10 — banded: 3 lit floors, 2 dark, repeating
    case 9: case 10: {
      const on = 3, off = 2, warm = kind === 10;
      for (let r = 0; r < rows; r++) {
        if (r % (on + off) >= on) continue;
        for (let c = 0; c < cols; c++) if (rng() < 0.9) pane(c, r, 0.5 + rng() * 0.5, warm);
      }
      break;
    }
    // 11 — mostly dead, a dozen lit panes. The Drownings.
    case 11: {
      for (let i = 0; i < 14; i++) pane((rng() * cols) | 0, (rng() * rows) | 0, 0.4 + rng() * 0.5, true);
      break;
    }
    // 12-13 — mechanical floors: louvres and vents, no light
    case 12: case 13: {
      ctx.fillStyle = 'rgb(9,9,10)';
      for (let r = 0; r < rows; r++)
        if (r % 2 === (kind === 12 ? 0 : 1)) ctx.fillRect(0, r * ch + ch * 0.3, w, ch * 0.4);
      break;
    }
    // 14-15 — curtain wall: a faint grid with occasional bright panes
    default: {
      ctx.fillStyle = 'rgb(14,16,20)';
      for (let r = 0; r < rows; r++) ctx.fillRect(0, r * ch, w, Math.max(0.5, ch * 0.06));
      for (let c = 0; c < cols; c++) ctx.fillRect(c * cw, 0, Math.max(0.5, cw * 0.06), h);
      for (let i = 0; i < 26; i++) pane((rng() * cols) | 0, (rng() * rows) | 0, 0.6 + rng() * 0.4, kind === 15);
      break;
    }
  }
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

// Halve `src` into a new canvas. Used to build the mip chain by hand — three uploads whatever
// array we hand it and, on WebGL2, allocates the texture with texStorage2D at exactly
// mipmaps.length levels, which is what makes the clamp real rather than aspirational.
function halve(src) {
  const c = canvas(Math.max(1, src.width >> 1), Math.max(1, src.height >> 1));
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

export function windowAtlas(size = 1024, seed = 0x7717) {
  const cell = size / GRID;
  const gutter = Math.max(2, Math.round(cell / 32));   // 8 texels at 1024, 4 at 512
  const inner = cell - gutter * 2;

  const c = canvas(size, size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, size, size);

  const tile = canvas(inner, inner);
  const tctx = tile.getContext('2d');

  for (let k = 0; k < GRID * GRID; k++) {
    const cx = (k % GRID) * cell, cy = ((k / GRID) | 0) * cell;
    cellPattern(tctx, inner, inner, k, xorshift32(seed + k * 7919));

    // The gutter: the same tile blitted eight more times around itself, clipped to the cell.
    // Every window pattern is periodic with period `inner`, so this IS the true continuation —
    // it costs nine drawImages and removes the neighbour-bleed seam entirely.
    ctx.save();
    ctx.beginPath();
    ctx.rect(cx, cy, cell, cell);
    ctx.clip();
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++)
        ctx.drawImage(tile, cx + gutter + dx * inner, cy + gutter + dy * inner);
    ctx.restore();
  }

  // Stop at the level where a cell is 8x8 texels (mip 5 of a 256 px cell, mip 4 of a 128 px one).
  const levels = Math.max(1, Math.round(Math.log2(cell / 8)) + 1);
  const mips = [c];
  for (let i = 1; i < levels; i++) mips.push(halve(mips[i - 1]));

  const tex = new THREE.CanvasTexture(c);
  tex.flipY = false;                       // canvas (0,0) == uv (0,0); no mental arithmetic
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = false;
  tex.mipmaps = mips;
  tex.needsUpdate = true;

  // What the shader and the placement code both need to agree on.
  tex.userData.cell = inner / size;                    // uCell — the SAMPLED width of a cell
  tex.userData.gutter = gutter / size;
  tex.userData.step = cell / size;                     // 0.25
  tex.userData.levels = levels;
  // §3.4's window grid inside one cell, so materials.js can hash PER WINDOW without duplicating
  // the constants.
  tex.userData.cols = COLS_PER_CELL;
  tex.userData.rows = ROWS_PER_CELL;
  return tex;
}

// The atlas cell origin for pattern `k`, already advanced past the gutter. This is what goes in
// `iUvOffset`; getting it wrong is the difference between a window grid and a smear.
export function cellOffset(tex, k) {
  const g = tex.userData.gutter, s = tex.userData.step;
  return [(k % GRID) * s + g, ((k / GRID) | 0) * s + g];
}

// A WebGL1 context cannot allocate a clamped chain (no texStorage2D), and an incomplete manual
// chain samples black. Fall back to a generated one rather than shipping a black city.
export function ensureMipSupport(tex, renderer) {
  if (renderer.capabilities.isWebGL2) return tex;
  tex.mipmaps = [];
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  console.warn('[neonhaul] WebGL1 context — window atlas falls back to a generated mip chain');
  return tex;
}

// ── ground ─────────────────────────────────────────────────────────────────
// Near-black wet asphalt. RGB is albedo; the green channel doubles as the roughness map, so one
// canvas drives both and the puddles read as smoother than the deck around them.

export function groundTexture(size = 512, seed = 0x1a2b) {
  const rng = xorshift32(seed);
  const c = canvas(size, size);
  const g = c.getContext('2d');
  g.fillStyle = 'rgb(11,12,15)';
  g.fillRect(0, 0, size, size);

  // slab joints
  g.strokeStyle = 'rgba(24,26,32,0.75)';
  g.lineWidth = Math.max(1, size / 256);
  for (let i = 1; i < 8; i++) {
    const p = (i / 8) * size;
    g.beginPath(); g.moveTo(p, 0); g.lineTo(p, size); g.stroke();
    g.beginPath(); g.moveTo(0, p); g.lineTo(size, p); g.stroke();
  }

  // grime speckle
  for (let i = 0; i < size * 6; i++) {
    const v = 8 + (rng() * 16) | 0;
    g.fillStyle = `rgba(${v},${v + 1},${v + 3},0.5)`;
    g.fillRect(rng() * size, rng() * size, 1 + rng() * 2, 1 + rng() * 2);
  }

  // puddles — dark and SMOOTH: low green == low roughness == a mirror (§3.7's cheap half)
  for (let i = 0; i < 22; i++) {
    const x = rng() * size, y = rng() * size, r = size * (0.02 + rng() * 0.07);
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(6,7,9,0.95)');
    grad.addColorStop(0.7, 'rgba(8,9,12,0.6)');
    grad.addColorStop(1, 'rgba(11,12,15,0)');
    g.fillStyle = grad;
    g.beginPath(); g.ellipse(x, y, r, r * (0.55 + rng() * 0.5), rng() * 3.14, 0, 6.2832); g.fill();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// §3.6's roughness map, and the reason it is a SECOND canvas.
//
// P1a's `groundMaterial` set `roughnessMap: atlas.ground` and `roughness: 1.0`, so the deck's
// roughness was the green channel of a near-black asphalt albedo: 12/255 = 0.047 on dry slab and
// 7/255 = 0.027 in a puddle. Both are mirrors, so the ENTIRE road was a mirror and §3.6's whole
// point — "partly wet rather than a uniform mirror, which is the difference between 1475810_04 and
// a plastic floor" — could not happen. One channel cannot be both a near-black albedo and a 0.62
// roughness. So the puddle mask gets its own canvas, generated from the SAME seed so the puddles
// land exactly where the albedo darkened.
export function groundRoughness(size = 512, seed = 0x1a2b) {
  const rng = xorshift32(seed);
  const c = canvas(size, size);
  const g = c.getContext('2d');
  g.fillStyle = 'rgb(158,158,158)';           // 0.62 — dry asphalt
  g.fillRect(0, 0, size, size);
  // the same three RNG draws per feature as groundTexture, in the same order, so the puddles are
  // in the same places. (Joints and grime consume no draws here, so they are replayed as skips.)
  for (let i = 1; i < 8; i++) { /* joints: no rng */ }
  for (let i = 0; i < size * 6; i++) { rng(); rng(); rng(); rng(); rng(); }
  for (let i = 0; i < 22; i++) {
    const x = rng() * size, y = rng() * size, r = size * (0.02 + rng() * 0.07);
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(10,10,10,1)');     // 0.04 — standing water
    grad.addColorStop(0.7, 'rgba(60,60,60,0.75)');
    grad.addColorStop(1, 'rgba(158,158,158,0)');
    g.fillStyle = grad;
    g.beginPath(); g.ellipse(x, y, r, r * (0.55 + rng() * 0.5), rng() * 3.14, 0, 6.2832); g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;          // data, not colour
  tex.anisotropy = 4;
  return tex;
}

// ── ripple normal ──────────────────────────────────────────────────────────
// §3.6's water film carries "the scrolling ripple normal". A tangent-space normal map built from
// two crossed low-frequency sine fields plus a rain-stipple: scrolled, it makes the reflection
// under it shiver instead of sitting there like a decal. Encoded the standard way — 128 is flat.

export function rippleNormal(size = 128, seed = 0x5e11) {
  const rng = xorshift32(seed);
  const c = canvas(size, size);
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  const d = img.data;
  // four octaves of directional sine, so the field tiles exactly (integer wave numbers).
  const waves = [];
  for (let i = 0; i < 5; i++) {
    const kx = 1 + ((rng() * 4) | 0), ky = 1 + ((rng() * 4) | 0);
    waves.push({ kx, ky, ph: rng() * 6.2832, a: 0.9 / (1 + i) });
  }
  const H = (x, y) => {
    let h = 0;
    for (const w of waves) h += w.a * Math.sin(6.2832 * (w.kx * x + w.ky * y) + w.ph);
    return h;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size, e = 1 / size;
      const dx = (H(u + e, v) - H(u - e, v)) * 0.5;
      const dy = (H(u, v + e) - H(u, v - e)) * 0.5;
      // a shallow slope: the film is a millimetre of water, not the sea.
      let nx = -dx * 0.35, ny = -dy * 0.35, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      const i = (y * size + x) * 4;
      d[i] = Math.round((nx / l * 0.5 + 0.5) * 255);
      d[i + 1] = Math.round((ny / l * 0.5 + 0.5) * 255);
      d[i + 2] = Math.round((nz / l * 0.5 + 0.5) * 255);
      d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  // A 1,400 m plane tiling this 140 times reaches ~50 samples per texel at the far edge. Without
  // anisotropy the tiling beats against the pixel grid and the water film shows concentric arcs
  // that look like a bug in the ripple rather than like water.
  tex.anisotropy = 8;
  return tex;
}

// ── the distant figure (§3.9) ──────────────────────────────────────────────
// The ONE permitted depiction of a person in the 3D world, and §1.1 sets its limits: a dark
// hooded cloth shape, no face, no limbs, seen only past 140 m. It is an alpha silhouette drawn
// with two ellipses and a taper — anything more detailed is out of scope by rule, not by budget.

export function figureTexture(w = 64, h = 128) {
  const c = canvas(w, h);
  const g = c.getContext('2d');
  g.clearRect(0, 0, w, h);
  g.fillStyle = '#fff';
  // the cloak: a taper from the hood down to a wide hem
  g.beginPath();
  g.moveTo(w * 0.50, h * 0.06);
  g.bezierCurveTo(w * 0.26, h * 0.16, w * 0.20, h * 0.52, w * 0.14, h * 0.99);
  g.lineTo(w * 0.86, h * 0.99);
  g.bezierCurveTo(w * 0.80, h * 0.52, w * 0.74, h * 0.16, w * 0.50, h * 0.06);
  g.closePath();
  g.fill();
  // the hood
  g.beginPath();
  g.ellipse(w * 0.50, h * 0.13, w * 0.19, h * 0.085, 0, 0, 6.2832);
  g.fill();
  // soften the hem so it does not end on a hard line at any mip
  const fade = g.createLinearGradient(0, h * 0.86, 0, h);
  fade.addColorStop(0, 'rgba(0,0,0,0)');
  fade.addColorStop(1, 'rgba(0,0,0,1)');
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = fade;
  g.fillRect(0, h * 0.86, w, h * 0.14);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

// ── droplets ───────────────────────────────────────────────────────────────
// The rain-on-glass / water-film speck sheet. P3b's weather consumes it; P1a bakes it so the
// canvas set is complete and the cost is measured now rather than discovered later.

export function dropletTexture(size = 256, seed = 0x3c4d) {
  const rng = xorshift32(seed);
  const c = canvas(size, size);
  const g = c.getContext('2d');
  g.fillStyle = 'rgb(0,0,0)';
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < 260; i++) {
    const x = rng() * size, y = rng() * size, r = 1 + rng() * (size / 42);
    const grad = g.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
    grad.addColorStop(0, 'rgba(255,255,255,0.95)');
    grad.addColorStop(0.45, 'rgba(140,150,170,0.35)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.beginPath(); g.arc(x, y, r, 0, 6.2832); g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// ── halo ───────────────────────────────────────────────────────────────────
// §4.4's LOW substitute for composer bloom: a 64x64 radial gradient, additive. P3b builds the
// halo *field*; the texture is a P1a canvas.

export function haloTexture(size = 64) {
  const c = canvas(size, size);
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0.0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.42)');
  grad.addColorStop(0.6, 'rgba(255,255,255,0.09)');
  grad.addColorStop(1.0, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

// ── light shaft gradient ───────────────────────────────────────────────────
// §4.5: 128x512, soft on every edge so the card has no silhouette of its own.

export function shaftTexture(w = 128, h = 512) {
  const c = canvas(w, h);
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, w, h);
  const across = g.createLinearGradient(0, 0, w, 0);
  across.addColorStop(0.0, 'rgba(255,255,255,0)');
  across.addColorStop(0.5, 'rgba(255,255,255,1)');
  across.addColorStop(1.0, 'rgba(255,255,255,0)');
  g.fillStyle = across;
  g.fillRect(0, 0, w, h);
  const down = g.createLinearGradient(0, 0, 0, h);
  down.addColorStop(0.0, 'rgba(0,0,0,1)');
  down.addColorStop(0.12, 'rgba(0,0,0,0)');
  down.addColorStop(0.62, 'rgba(0,0,0,0)');
  down.addColorStop(1.0, 'rgba(0,0,0,1)');
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = down;
  g.fillRect(0, 0, w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

// ── blue noise ─────────────────────────────────────────────────────────────
// Void-and-cluster, the real thing. §4.6's dither and §3.2.2's LOD cross-fade share it.
// White noise dithers a near-black gradient into visible grain; blue noise does not, and the
// frame is 80 % near-black gradient.
//
// 64x64 costs ~30 ms in a desktop JIT and roughly 3x that on a phone. LOW gets 32x32 (~3 ms) —
// at +/- 1/255 the tile size is not what the eye is judging.

export function blueNoise(n = 64, seed = 0x9e37) {
  const N = n * n, R = 4, sig = 1.9;
  const kx = [], ky = [], kw = [];
  for (let dy = -R; dy <= R; dy++)
    for (let dx = -R; dx <= R; dx++) {
      if (!dx && !dy) continue;
      kx.push(dx); ky.push(dy); kw.push(Math.exp(-(dx * dx + dy * dy) / (2 * sig * sig)));
    }
  const K = kx.length;
  const bin = new Uint8Array(N), E = new Float32Array(N), rank = new Int32Array(N);
  const rnd = xorshift32(seed);

  const bump = (i, s) => {
    const x = i % n, y = (i / n) | 0;
    for (let k = 0; k < K; k++) E[(((y + ky[k]) % n + n) % n) * n + (((x + kx[k]) % n + n) % n)] += s * kw[k];
  };
  const findMax = v => { let bi = -1, be = -Infinity; for (let i = 0; i < N; i++) if (bin[i] === v && E[i] > be) { be = E[i]; bi = i; } return bi; };
  const findMin = v => { let bi = -1, be = Infinity; for (let i = 0; i < N; i++) if (bin[i] === v && E[i] < be) { be = E[i]; bi = i; } return bi; };

  const M = Math.max(1, (N / 10) | 0);
  for (let placed = 0; placed < M;) { const i = (rnd() * N) | 0; if (!bin[i]) { bin[i] = 1; bump(i, 1); placed++; } }
  for (let it = 0; it < N; it++) {
    const c = findMax(1); bin[c] = 0; bump(c, -1);
    const v = findMin(0);
    if (v === c) { bin[c] = 1; bump(c, 1); break; }
    bin[v] = 1; bump(v, 1);
  }
  const init = bin.slice(), Einit = E.slice();
  for (let r = M - 1; r >= 0; r--) { const c = findMax(1); bin[c] = 0; bump(c, -1); rank[c] = r; }
  bin.set(init); E.set(Einit);
  for (let r = M; r < N / 2; r++) { const v = findMin(0); bin[v] = 1; bump(v, 1); rank[v] = r; }
  for (let i = 0; i < N; i++) bin[i] = 1 - bin[i];
  E.fill(0);
  for (let i = 0; i < N; i++) if (bin[i]) bump(i, 1);
  for (let r = (N / 2) | 0; r < N; r++) { const c = findMax(1); bin[c] = 0; bump(c, -1); rank[c] = r; }

  const data = new Uint8Array(N * 4);
  for (let i = 0; i < N; i++) {
    const v = Math.min(255, (rank[i] * 256 / N) | 0);
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = tex.minFilter = THREE.NearestFilter;   // one texel per pixel; never filtered
  tex.needsUpdate = true;
  return tex;
}

// ── the whole set ──────────────────────────────────────────────────────────

export function buildAtlases(Q, seed = 0x7717) {
  const t0 = performance.now();
  const set = {
    windows: windowAtlas(Q.atlasSize, seed),
    ground: groundTexture(Q.name === 'low' ? 256 : 512, seed ^ 0x11),
    groundRough: groundRoughness(Q.name === 'low' ? 256 : 512, seed ^ 0x11),
    ripple: rippleNormal(Q.name === 'low' ? 64 : 128, seed ^ 0x44),
    figure: figureTexture(64, 128),
    droplets: dropletTexture(Q.name === 'low' ? 128 : 256, seed ^ 0x22),
    halo: haloTexture(64),
    shaft: shaftTexture(128, 512),
    noise: blueNoise(Q.name === 'low' ? 32 : 64, seed ^ 0x33),
  };
  set.msBuild = +(performance.now() - t0).toFixed(1);
  return set;
}

export function disposeAtlases(set) {
  for (const k of ['windows', 'ground', 'groundRough', 'ripple', 'figure', 'droplets', 'halo',
    'shaft', 'noise']) set[k]?.dispose?.();
}
