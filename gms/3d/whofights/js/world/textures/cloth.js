// One woven hanging per zone, drawn with the 2D canvas API in the same shape as stained.js —
// which is the module to read first, because this is deliberately its sibling.
//
// A tapestry is the only large block of colour in eleven metres of stone, and a flat dyed
// rectangle is what a critic pass, and then Aaron looking at `shots/hall.png`, both read as a
// missing material rather than as cloth. What a hanging needs at 30 m is not more geometry: it
// is a border, a charge in the middle, and a weave fine enough to break the flat.
//
// Every colour here is a read off zones.js. The charge is `interior.pattern` — the SAME name
// that names the zone's leaded light — so the hall's hanging and the hall's window carry the
// same device without a new field being authored for it. Tints come from `interior.glass`,
// the ground from `interior.cloth`, the metal thread from `interior.warmth`.
//
// Albedo only. The hanging keeps the timber normal map the room already has, at a low scale,
// for the weave relief — a second baked map is not worth it on a 4 m panel.

import * as THREE from 'three';
import { track } from '../../engine/budget.js';
import { releaseCanvas } from './bake.js';
import { zone } from '../zones.js';

const S = 512;
const cache = new Map();

// The panel is wider than it is tall, so a circle drawn square comes out an ellipse on the wall.
// `aspect` is the hanging's own width/height and every round thing is drawn through it.
export function clothTexture(zoneId, aspect = 1.33) {
  const key = `${zoneId}:${aspect.toFixed(2)}`;
  if (cache.has(key)) return cache.get(key);
  const z = zone(zoneId);
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  paint(ctx, z, aspect);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.anisotropy = 4;
  t.onUpdate = releaseCanvas;
  track(t, { w: S, h: S, fmt: 'rgba', mips: true, label: `cloth:${zoneId}` });
  cache.set(key, t);
  return t;
}

// ── palette ─────────────────────────────────────────────────────────────────────────────────
// The authored `interior.cloth` is a pastel — it came out as a grey patch across the room, which
// is why the material dyed it before this file existed. The dye moves here so the texture and
// the geometry cannot end up two different blues.
const _hsl = {};
function dye(hex, sat, light) {
  const c = new THREE.Color(hex);
  c.getHSL(_hsl);
  return c.setHSL(_hsl.h, sat, light);
}
const hex = c => `#${c.getHexString()}`;
const shade = (c, k) => hex(new THREE.Color().copy(c).multiplyScalar(k));

// The tints come from the same row the leaded light is cut from, but a hanging is dyed wool and
// a window is glass: read at glass saturation the twelve petals of a rose came out as a fairground
// colour wheel, which is what the first render of this file looked like. Pulled down to a wool
// chroma and cycled over two hues rather than five, the same device reads as embroidery.
function palette(z) {
  const ground = dye(z.interior.cloth, 0.44, 0.40);
  const src = z.interior.glass || z.window.glass;
  return {
    ground,
    deep: shade(ground, 0.52),
    lit: shade(ground, 1.5),
    field: shade(ground, 0.86),
    gold: hex(dye(z.interior.warmth, 0.58, 0.58)),
    goldDeep: hex(dye(z.interior.warmth, 0.62, 0.33)),
    tints: src.map(h => hex(dye(h, 0.34, 0.44))),
    tintsLit: src.map(h => hex(dye(h, 0.30, 0.56))),
  };
}

const px = v => v * S;

const CHARGE = { rose, quarry, rays };

function paint(ctx, z, aspect) {
  const p = palette(z);
  ctx.fillStyle = hex(p.ground);
  ctx.fillRect(0, 0, S, S);
  ctx.lineJoin = ctx.lineCap = 'round';
  diaper(ctx, p, aspect);

  // The charge sits in the field, above the middle: a hanging is read from below, and a device
  // centred on the panel disappears behind whatever is standing in front of it.
  ctx.save();
  ctx.translate(px(0.5), px(0.46));
  ctx.scale(1 / aspect, 1);
  (CHARGE[z.interior.pattern] || quarry)(ctx, p);
  ctx.restore();

  border(ctx, p);
  weave(ctx);
}

// A lattice over the whole ground, one shade under it, with a fleck of metal thread where the
// lines cross. Twelve square metres of one flat colour is what made the panel read as a painted
// board, and a diaper is what the period actually put there.
function diaper(ctx, p, aspect) {
  const n = 9;
  ctx.save();
  ctx.strokeStyle = p.field;
  ctx.lineWidth = px(0.012);
  for (let i = -n; i <= n * 2; i++) {
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(px(i / n), px(s < 0 ? -0.2 : 1.2));
      ctx.lineTo(px(i / n + s * 1.4 / aspect), px(s < 0 ? 1.2 : -0.2));
      ctx.stroke();
    }
  }
  ctx.fillStyle = p.gold;
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      ctx.beginPath();
      ctx.arc(px((i + (j % 2) * 0.5) / n), px(j / n), px(0.006), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

// ── the border ──────────────────────────────────────────────────────────────────────────────
// Four sides, because three read as a poster stuck to the wall. A dark selvedge outside a metal
// band outside a dark line: the band is what carries the light from the sconce beside it.
function border(ctx, p) {
  const band = (inset, w, fill) => {
    ctx.strokeStyle = fill;
    ctx.lineWidth = px(w);
    ctx.strokeRect(px(inset + w / 2), px(inset + w / 2), px(1 - 2 * inset - w), px(1 - 2 * inset - w));
  };
  // The battens that hold the panel cover the outer twentieth of it, so nothing worth seeing may
  // be drawn there: the braid starts inside them.
  band(0.045, 0.026, p.deep);
  band(0.071, 0.062, p.gold);
  band(0.133, 0.016, p.goldDeep);

  // a running chevron on the metal band, so it is a woven edge and not a picture frame
  ctx.strokeStyle = p.goldDeep;
  ctx.lineWidth = px(0.016);
  const n = 22, c = 0.102, a = 0.021;
  for (let i = 0; i < n; i++) {
    const t = 0.09 + 0.82 * (i + 0.5) / n;
    for (const [x, y, hz] of [[t, c, 1], [t, 1 - c, 1], [c, t, 0], [1 - c, t, 0]]) {
      ctx.beginPath();
      if (hz) { ctx.moveTo(px(x - a), px(y - a)); ctx.lineTo(px(x), px(y + a)); ctx.lineTo(px(x + a), px(y - a)); }
      else { ctx.moveTo(px(x - a), px(y - a)); ctx.lineTo(px(x + a), px(y)); ctx.lineTo(px(x - a), px(y + a)); }
      ctx.stroke();
    }
  }
}

// ── the weave ───────────────────────────────────────────────────────────────────────────────
// Warp and weft as a multiply over everything already drawn, plus a slow vertical streak: a
// hanging that has been on a wall for a century is faded down its own folds. Cheap enough to do
// per-pixel once — 512² is a quarter of a megapixel and this runs at build time.
function weave(ctx) {
  const img = ctx.getImageData(0, 0, S, S);
  const d = img.data;
  for (let y = 0; y < S; y++) {
    // weft: a fatter, softer thread than the warp, and every fourth pick sits proud
    const wy = 0.94 + 0.06 * Math.cos(y * Math.PI / 2) + 0.035 * Math.cos(y * Math.PI / 8);
    for (let x = 0; x < S; x++) {
      const wx = 0.95 + 0.05 * Math.cos(x * Math.PI / 2);
      const streak = 1 - 0.10 * (0.5 + 0.5 * Math.cos(x * 0.055 + Math.sin(x * 0.011) * 2.4));
      // the bottom third of a hanging takes the dust and the top takes the light
      const age = 0.90 + 0.14 * (1 - y / S);
      const k = wx * wy * streak * age;
      const i = (y * S + x) * 4;
      d[i] *= k; d[i + 1] *= k; d[i + 2] *= k;
    }
  }
  ctx.putImageData(img, 0, 0);
}

// ── the charges ─────────────────────────────────────────────────────────────────────────────
// Drawn in an aspect-corrected frame whose origin is the middle of the device, so each of these
// works in units of the panel's own height.

function ring(ctx, r, w, fill) {
  ctx.beginPath();
  ctx.arc(0, 0, px(r), 0, Math.PI * 2);
  ctx.strokeStyle = fill;
  ctx.lineWidth = px(w);
  ctx.stroke();
}

function petal(ctx, a0, a1, r0, r1, fill, line) {
  ctx.beginPath();
  ctx.arc(0, 0, px(r0), a0, a1);
  ctx.arc(0, 0, px(r1), a1, a0, true);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = line;
  ctx.lineWidth = px(0.008);
  ctx.stroke();
}

function rose(ctx, p) {
  ring(ctx, 0.315, 0.026, p.goldDeep);
  ring(ctx, 0.300, 0.014, p.gold);
  // two hues alternating over two values: a rhythm, where five hues over twelve petals was a wheel
  const n = 12;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
    const set = i % 2 ? p.tintsLit : p.tints;
    petal(ctx, a0 + 0.02, a1 - 0.02, 0.115, 0.278, set[(i >> 1) % 2 ? 2 % set.length : 0], p.deep);
  }
  for (let i = 0; i < 6; i++) {
    const a0 = (i / 6) * Math.PI * 2, a1 = ((i + 1) / 6) * Math.PI * 2;
    petal(ctx, a0 + 0.03, a1 - 0.03, 0.038, 0.108, i % 2 ? p.field : p.tints[1 % p.tints.length], p.deep);
  }
  petal(ctx, 0, Math.PI * 2, 0, 0.042, p.gold, p.goldDeep);
  // four spurs, so the medallion is not a wheel floating in an empty field
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    ctx.save();
    ctx.rotate(a);
    ctx.fillStyle = p.goldDeep;
    ctx.beginPath();
    ctx.moveTo(px(0.33), 0);
    ctx.lineTo(px(0.43), px(-0.035));
    ctx.lineTo(px(0.46), 0);
    ctx.lineTo(px(0.43), px(0.035));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

function quarry(ctx, p) {
  // a diaper field under a plain shield: the workaday town's hanging is a pattern, not a jewel
  ctx.save();
  ctx.strokeStyle = p.deep;
  ctx.lineWidth = px(0.009);
  for (let i = -6; i <= 6; i++) {
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(px(i * 0.09 - 0.6), px(-0.6 * s));
      ctx.lineTo(px(i * 0.09 + 0.6), px(0.6 * s));
      ctx.stroke();
    }
  }
  ctx.restore();
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
    petal(ctx, a - 0.28, a + 0.28, 0.20, 0.315, (i % 2 ? p.tintsLit : p.tints)[0], p.deep);
  }
  ring(ctx, 0.19, 0.022, p.goldDeep);
  petal(ctx, 0, Math.PI * 2, 0, 0.175, p.tints[1 % p.tints.length], p.goldDeep);
  ctx.fillStyle = p.gold;
  ctx.beginPath();
  ctx.moveTo(0, px(-0.135));
  ctx.lineTo(px(0.105), px(-0.05));
  ctx.lineTo(0, px(0.145));
  ctx.lineTo(px(-0.105), px(-0.05));
  ctx.closePath();
  ctx.fill();
}

function rays(ctx, p) {
  const n = 16;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 0.9) / n) * Math.PI * 2;
    petal(ctx, a0, a1, 0.10, 0.34 + 0.06 * (i % 2), (i % 2 ? p.tintsLit : p.tints)[(i >> 1) % 2 ? 2 % p.tints.length : 0], p.deep);
  }
  ring(ctx, 0.115, 0.024, p.goldDeep);
  petal(ctx, 0, Math.PI * 2, 0, 0.105, p.gold, p.goldDeep);
  petal(ctx, 0, Math.PI * 2, 0, 0.045, p.deep, p.goldDeep);
}
