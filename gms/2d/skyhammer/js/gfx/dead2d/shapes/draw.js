// ============================================================================
// DEAD CODE — Canvas-2D renderer, superseded by the Three.js 2.5D renderer
// (CONTRACTS §14, DECISIONS D12-D16). NOTHING LIVE IMPORTS THIS FILE.
// Kept only because the procedural CLOUD and SKY bakes transfer to 3D as
// textures on planes at negative z. See docs/ART_NOTES.md before reusing.
// Palettes moved on and were restructured: these modules expect the OLD flat
// palette shape (pal.cloudTop, pal.earth, ...), not the current js/gfx/palette.js.
// ============================================================================
// Draws hand-authored polygon shapes and bakes them into sprites with the shared lighting pass:
// dark expanded outline -> warm rim offset toward the light -> the real fills on top.
// That three-pass order is the readability law (ART.md §2) built into the drawing itself.

import { makeCanvas, ctx2d, rgba, shade } from '../bake.js';

function path(ctx, s) {
  if (s.t === 'c') { ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 6.2832); return; }
  if (s.t === 'e') {
    ctx.beginPath(); ctx.ellipse(s.x, s.y, s.rx, s.ry, s.rot || 0, 0, 6.2832); return;
  }
  const p = s.p;
  ctx.beginPath();
  ctx.moveTo(p[0], p[1]);
  for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]);
  if (s.t !== 'l') ctx.closePath();
}

/** One pass over the polys in a single flat colour (outline / rim silhouette). */
function pass(ctx, polys, col, grow) {
  ctx.fillStyle = col;
  ctx.strokeStyle = col;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (const s of polys) {
    if (s.skip) continue;
    path(ctx, s);
    if (s.t === 'l') { ctx.lineWidth = (s.w || 1) + grow; ctx.stroke(); }
    else { ctx.fill(); if (grow > 0) { ctx.lineWidth = grow; ctx.stroke(); } }
  }
}

function fills(ctx, polys, cols) {
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (const s of polys) {
    const col = cols[s.c] || s.c || '#888';
    ctx.globalAlpha = s.a === undefined ? 1 : s.a;
    path(ctx, s);
    if (s.t === 'l') { ctx.strokeStyle = col; ctx.lineWidth = s.w || 1; ctx.stroke(); }
    else { ctx.fillStyle = col; ctx.fill(); }
  }
  ctx.globalAlpha = 1;
}

/**
 * Bake a shape into a sprite.
 * shape: { w, h, ox, oy, polys }  — units are world units, +y up, origin at the anchor.
 * opts:  { px, cols, rim, outline, rimDx, rimDy, pad }
 * Returns { c, px, py, sx, sy } where (px,py) is the anchor's pixel position inside the sprite.
 */
export function bakeShape(shape, opts) {
  const scale = opts.px / shape.h;
  const pad = (opts.pad === undefined ? 5 : opts.pad);
  const w = Math.ceil(shape.w * scale) + pad * 2;
  const h = Math.ceil(shape.h * scale) + pad * 2;
  const c = makeCanvas(w, h), g = ctx2d(c);

  const ax = pad + (shape.ox === undefined ? shape.w / 2 : shape.ox) * scale;
  const ay = h - pad - (shape.oy === undefined ? 0 : shape.oy) * scale;

  g.translate(ax, ay);
  g.scale(scale, -scale);           // world +y up -> canvas +y down

  const grow = (opts.outlineW || 1.5) / scale;
  if (opts.outline) pass(g, shape.polys, opts.outline, grow);
  if (opts.rim) {
    g.save();
    g.translate((opts.rimDx || 0) / scale, (opts.rimDy || 0) / scale);
    pass(g, shape.polys, opts.rim, grow * 0.35);
    g.restore();
  }
  fills(g, shape.polys, opts.cols);

  return { c, ax, ay, w, h, scale };
}

export { path as shapePath, fills as shapeFills };

/** A soft elliptical lift used behind the player so it can never camouflage. */
export function bakeHalo(size, col) {
  const c = makeCanvas(size, size), g = ctx2d(c);
  const r = size / 2;
  const grd = g.createRadialGradient(r, r, 0, r, r, r);
  grd.addColorStop(0, rgba(col, 0.30));
  grd.addColorStop(0.30, rgba(col, 0.17));
  grd.addColorStop(0.65, rgba(col, 0.05));
  grd.addColorStop(1, rgba(col, 0));
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  return c;
}

export { shade };
