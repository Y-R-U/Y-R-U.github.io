// Every painted surface in HOMEBOUND: gate faces, the numbers on them, the
// numbers on barrier walls, and the chunky wood-and-steel geometry they are
// bolted to.
//
// TWO ATLASES AND ONE RULE: NOTHING IS UPLOADED TO THE GPU DURING A RUN.
//
// A GROW gate's number climbs every single bullet hit — 60+ times a second, on
// every gate under fire. Redrawing a canvas and re-uploading it at that rate is
// a frame-killer, and caching "one texture per displayed value" just moves the
// problem: `+1 → +7 → +23 → +91` is four uploads on the way and the cache never
// hits twice.
//
// So the number is not painted at all. It is *typeset*:
//
//   GLYPH ATLAS   one 1024² canvas, an 8x8 grid of fat white glyphs with a hard
//                 dark stroke, built once at boot. Every digit, letter and
//                 symbol the game can put on a sign.
//   PANEL ATLAS   one 1024² canvas, 4x4 cells: the five saturated sign colours,
//                 four glass-crack stages, the button plate.
//
// A label is then a handful of instanced quads (one per glyph) sharing ONE
// InstancedMesh with a per-instance `aCell` attribute picking the atlas cell.
// Changing `+1` to `+23` writes six floats. It never touches a canvas.
//
// That is also why gates + barriers fit in a handful of draw calls: forty signs
// with forty different numbers are still one glyph draw and one panel draw.
//
// The face geometry faces -Z (toward the camera) and its UVs are handed so text
// is not mirrored — see QUAD below, and SCREEN_X for why left-to-right on screen
// is *negative* world x in this game.

import * as THREE from 'three';
import { PAL, EFFECTS, GATE } from './config.js';
import { canvasTex, hex } from './toon.js';

// --------------------------------------------------------------------------
// Handedness
// --------------------------------------------------------------------------
// The road runs +Z away from the camera, so the camera looks *along* +Z. Three's
// lookAt puts the camera's local +X (screen right) on world -X. Everything that
// lays glyphs out in reading order has to step in -x, and a gate at x = -3.6
// draws on the RIGHT of the screen. Getting this backwards mirrors every number
// on every sign, which is the kind of bug you only see in a screenshot.
export const SCREEN_X = -1;

// --------------------------------------------------------------------------
// Glyph atlas
// --------------------------------------------------------------------------
const G_CELL = 128, G_COLS = 8, G_ROWS = 8;
const G_SIZE = G_CELL * G_COLS;

// Order is the cell order. Keep it under 64. Letters are here because
// `EFFECTS.tier.fmt()` says "▲ PROMOTE" and a sign that reads "PROMOTE" is
// worth the eleven extra cells.
const GLYPH_SET = '0123456789+-$%.:s' + 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' + '×÷▲⌖♥⚡';

const glyphCell = new Map();      // char → cell index
const glyphAdv = new Float32Array(G_COLS * G_ROWS);   // advance, in cell heights
const SPACE_ADV = 0.30;

// Hand-drawn symbols. The font versions of these are thin, inconsistent across
// platforms, and '⌖' is outright missing on most — a tofu box on a gate face is
// unshippable, so the six that matter are paths.
const SYM = {
  '▲': (g, s) => { g.moveTo(0, -0.44 * s); g.lineTo(0.46 * s, 0.34 * s); g.lineTo(-0.46 * s, 0.34 * s); g.closePath(); },
  '×': (g, s) => {
    const a = 0.34 * s, t = 0.105 * s;
    for (const r of [Math.PI / 4, -Math.PI / 4]) {
      const c = Math.cos(r) , sn = Math.sin(r);
      const pts = [[-a, -t], [a, -t], [a, t], [-a, t]];
      g.moveTo(pts[0][0] * c - pts[0][1] * sn, pts[0][0] * sn + pts[0][1] * c);
      for (let i = 1; i < 4; i++) g.lineTo(pts[i][0] * c - pts[i][1] * sn, pts[i][0] * sn + pts[i][1] * c);
      g.closePath();
    }
  },
  '÷': (g, s) => {
    g.rect(-0.40 * s, -0.09 * s, 0.80 * s, 0.18 * s);
    g.moveTo(0.13 * s, -0.30 * s); g.arc(0, -0.30 * s, 0.13 * s, 0, Math.PI * 2);
    g.moveTo(0.13 * s, 0.30 * s); g.arc(0, 0.30 * s, 0.13 * s, 0, Math.PI * 2);
  },
  '♥': (g, s) => {
    g.moveTo(0, 0.40 * s);
    g.bezierCurveTo(-0.66 * s, -0.02 * s, -0.42 * s, -0.52 * s, 0, -0.20 * s);
    g.bezierCurveTo(0.42 * s, -0.52 * s, 0.66 * s, -0.02 * s, 0, 0.40 * s);
    g.closePath();
  },
  '⚡': (g, s) => {
    g.moveTo(0.16 * s, -0.46 * s); g.lineTo(-0.34 * s, 0.06 * s); g.lineTo(-0.04 * s, 0.06 * s);
    g.lineTo(-0.18 * s, 0.46 * s); g.lineTo(0.34 * s, -0.08 * s); g.lineTo(0.04 * s, -0.08 * s);
    g.closePath();
  },
  '⌖': (g, s) => {
    // ring, drawn as two opposed arcs so the middle stays hollow under a fill
    g.moveTo(0.34 * s, 0); g.arc(0, 0, 0.34 * s, 0, Math.PI * 2);
    g.moveTo(0.20 * s, 0); g.arc(0, 0, 0.20 * s, Math.PI * 2, 0, true);
    g.rect(-0.05 * s, -0.48 * s, 0.10 * s, 0.24 * s);
    g.rect(-0.05 * s, 0.24 * s, 0.10 * s, 0.24 * s);
    g.rect(-0.48 * s, -0.05 * s, 0.24 * s, 0.10 * s);
    g.rect(0.24 * s, -0.05 * s, 0.24 * s, 0.10 * s);
  },
};

const FONT = (px) => `900 ${px}px "Arial Black", "Helvetica Neue", Impact, system-ui, sans-serif`;

let glyphTex = null, panelTex = null;

function buildGlyphAtlas() {
  const c = document.createElement('canvas');
  c.width = c.height = G_SIZE;
  const g = c.getContext('2d');
  // Sized to leave a margin inside the cell: the glyph plus its stroke has to
  // stay clear of the cell edge or mip level 3 smears its neighbour into it.
  const FS = 80;                       // font size inside a 128 cell
  const SW = 17;                       // stroke width — the reference's is FAT
  g.lineJoin = 'round';
  g.miterLimit = 2;
  g.textAlign = 'center';
  g.textBaseline = 'middle';

  for (let i = 0; i < GLYPH_SET.length; i++) {
    const ch = GLYPH_SET[i];
    const col = i % G_COLS, row = (i / G_COLS) | 0;
    const cx = col * G_CELL + G_CELL / 2, cy = row * G_CELL + G_CELL / 2;
    glyphCell.set(ch, i);

    g.save();
    g.translate(cx, cy);
    let w;
    if (SYM[ch]) {
      g.beginPath();
      SYM[ch](g, G_CELL);
      g.lineWidth = SW;
      g.strokeStyle = hex(PAL.signStroke);
      g.stroke();
      g.fillStyle = '#ffffff';
      g.fill();
      w = 0.86 * G_CELL;
    } else {
      g.font = FONT(FS);
      w = g.measureText(ch).width;
      g.lineWidth = SW;
      g.strokeStyle = hex(PAL.signStroke);
      g.strokeText(ch, 0, 4);          // +4: Arial Black sits high in its box
      g.fillStyle = '#ffffff';
      g.fillText(ch, 0, 4);
    }
    g.restore();
    // Tight tracking. The reference's "+99" is almost touching, which is what
    // lets three glyphs fill a 3 m panel instead of floating in the middle.
    glyphAdv[i] = (w + SW * 0.55) / G_CELL;
  }

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

// --------------------------------------------------------------------------
// Panel atlas
// --------------------------------------------------------------------------
const P_CELL = 256, P_COLS = 4, P_ROWS = 4;

export const PANEL_CELL = {
  blue: 0, yellow: 1, green: 2, red: 3, purple: 4,
  glass0: 5, glass1: 6, glass2: 7, glass3: 8,
  button: 9, plank: 10,
};
const SIGN_HEX = {
  blue: PAL.signBlue, yellow: PAL.signYellow, green: PAL.signGreen,
  red: PAL.signRed, purple: PAL.signPurple,
};

// The face of a sign, minus its label: a hard dark border, a saturated field, a
// light bevel along the top and a shadow along the bottom. Everything a gate
// face is, drawn once here so `signTexture()` and the atlas cannot drift apart.
function drawSignPlate(g, w, h, color) {
  // Three bands, like the reference: a hard ink line so the sign has an edge
  // against any background, a deeper shade of its own colour so the panel reads
  // as one object rather than a sticker, then the field.
  const ink = Math.round(w * 0.022);
  const rim = Math.round(w * 0.048);
  const deep = new THREE.Color(color).multiplyScalar(0.62);
  g.fillStyle = hex(PAL.signStroke);
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#' + deep.getHexString();
  g.fillRect(ink, ink, w - ink * 2, h - ink * 2);
  g.fillStyle = hex(color);
  g.fillRect(ink + rim, ink + rim, w - (ink + rim) * 2, h - (ink + rim) * 2);
  // bevel: a light band under the top edge, a shadow above the bottom
  g.globalAlpha = 0.26; g.fillStyle = '#ffffff';
  g.fillRect(ink + rim, ink + rim, w - (ink + rim) * 2, h * 0.09);
  g.globalAlpha = 0.20; g.fillStyle = '#000000';
  g.fillRect(ink + rim, h - ink - rim - h * 0.08, w - (ink + rim) * 2, h * 0.08);
  g.globalAlpha = 1;
}

// Glass is drawn NEUTRAL — near-white, not cyan — because gates.js tints each
// pane with its effect's sign colour through `instanceColor`. Without that a
// `+50` pane and a `-30` pane are the same object, and the level would be
// hiding a trap behind an identical-looking panel, which the brief forbids.
function drawGlassPlate(g, w, h, stage) {
  const b = Math.round(w * 0.045);
  g.clearRect(0, 0, w, h);
  g.fillStyle = 'rgba(20,32,44,0.92)';
  g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(226,246,252,0.74)';
  g.fillRect(b, b, w - b * 2, h - b * 2);
  // a diagonal sheen so it reads as glass and not as a pale gate
  g.save();
  g.beginPath(); g.rect(b, b, w - b * 2, h - b * 2); g.clip();
  g.globalAlpha = 0.30; g.fillStyle = '#ffffff';
  g.beginPath();
  g.moveTo(w * 0.05, h); g.lineTo(w * 0.42, 0); g.lineTo(w * 0.60, 0); g.lineTo(w * 0.23, h);
  g.closePath(); g.fill();
  g.globalAlpha = 1;
  // Cracks branch out from the centre and get denser with each stage, so a
  // player can read "one more burst" off the panel without a health bar.
  if (stage > 0) {
    g.strokeStyle = 'rgba(255,255,255,0.95)';
    g.lineCap = 'round';
    const arms = 3 + stage * 3;
    for (let a = 0; a < arms; a++) {
      const ang = (a / arms) * Math.PI * 2 + a * 0.7;
      let x = w / 2, y = h / 2;
      g.lineWidth = 6 - stage;
      g.beginPath(); g.moveTo(x, y);
      const segs = 2 + stage;
      for (let s = 0; s < segs; s++) {
        x += Math.cos(ang + Math.sin(a * 3 + s) * 0.5) * (w * 0.14);
        y += Math.sin(ang + Math.cos(a * 2 + s) * 0.5) * (h * 0.16);
        g.lineTo(x, y);
      }
      g.stroke();
    }
  }
  g.restore();
}

function drawButtonPlate(g, w, h) {
  const b = Math.round(w * 0.05);
  g.fillStyle = hex(PAL.signStroke);
  g.fillRect(0, 0, w, h);
  g.fillStyle = hex(PAL.steel);
  g.fillRect(b, b, w - b * 2, h - b * 2);
  // the plunger: a red dome with a hard rim and a highlight
  const cx = w / 2, cy = h / 2, r = Math.min(w, h) * 0.33;
  g.fillStyle = hex(PAL.signStroke);
  g.beginPath(); g.arc(cx, cy, r * 1.16, 0, Math.PI * 2); g.fill();
  g.fillStyle = hex(PAL.enemy);
  g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
  g.globalAlpha = 0.45; g.fillStyle = '#ffffff';
  g.beginPath(); g.ellipse(cx, cy - r * 0.34, r * 0.52, r * 0.28, 0, 0, Math.PI * 2); g.fill();
  g.globalAlpha = 0.35; g.fillStyle = '#000000';
  g.beginPath(); g.ellipse(cx, cy + r * 0.42, r * 0.62, r * 0.26, 0, 0, Math.PI * 2); g.fill();
  g.globalAlpha = 1;
  // corner bolts, so the plate reads as bolted to the frame
  g.fillStyle = hex(PAL.signStroke);
  for (const [px, py] of [[0.13, 0.14], [0.87, 0.14], [0.13, 0.86], [0.87, 0.86]]) {
    g.beginPath(); g.arc(px * w, py * h, w * 0.028, 0, Math.PI * 2); g.fill();
  }
}

// Wooden planks with steel rivets — the barrier wall and the gate sill. Drawn
// here rather than as geometry because at 40 m the seams are two pixels and
// geometry for them is wasted triangles.
function drawPlanks(g, w, h) {
  g.fillStyle = hex(PAL.woodDark);
  g.fillRect(0, 0, w, h);
  const rows = 3, gap = Math.max(2, h * 0.018);
  const ph = (h - gap * (rows + 1)) / rows;
  for (let i = 0; i < rows; i++) {
    const y = gap + i * (ph + gap);
    g.fillStyle = hex(i % 2 ? PAL.wood : 0xb8813f);
    g.fillRect(gap, y, w - gap * 2, ph);
    g.globalAlpha = 0.16; g.fillStyle = '#000000';
    g.fillRect(gap, y + ph * 0.72, w - gap * 2, ph * 0.28);
    g.globalAlpha = 1;
  }
  g.fillStyle = hex(PAL.steel);
  g.fillRect(0, 0, w, h * 0.055);
  g.fillRect(0, h - h * 0.055, w, h * 0.055);
}

function buildPanelAtlas() {
  const c = document.createElement('canvas');
  c.width = P_CELL * P_COLS; c.height = P_CELL * P_ROWS;
  const g = c.getContext('2d');
  const cell = (i, draw) => {
    g.save();
    g.translate((i % P_COLS) * P_CELL, ((i / P_COLS) | 0) * P_CELL);
    g.beginPath(); g.rect(0, 0, P_CELL, P_CELL); g.clip();
    draw(g);
    g.restore();
  };
  for (const k of ['blue', 'yellow', 'green', 'red', 'purple']) {
    cell(PANEL_CELL[k], (x) => drawSignPlate(x, P_CELL, P_CELL, SIGN_HEX[k]));
  }
  for (let s = 0; s < 4; s++) cell(PANEL_CELL['glass' + s], (x) => drawGlassPlate(x, P_CELL, P_CELL, s));
  cell(PANEL_CELL.button, (x) => drawButtonPlate(x, P_CELL, P_CELL));
  cell(PANEL_CELL.plank, (x) => drawPlanks(x, P_CELL, P_CELL));

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

export const panelCellFor = (type) => PANEL_CELL[EFFECTS[type]?.sign || 'blue'] ?? 0;

// The colour a gate of this type "is". Wood panels get it baked into the atlas;
// glass panes get it as an instance tint over the neutral pane, so glass keeps
// the same colour vocabulary as everything else.
export const signColorOf = (type) => SIGN_HEX[EFFECTS[type]?.sign || 'blue'];

// --------------------------------------------------------------------------
// Atlas material — one draw call for N different faces
// --------------------------------------------------------------------------
// MeshBasic, not Lambert: signage in this game is UI painted into the world and
// has to win every readability fight it is in. A sign that dims when the sun
// swings round is a sign the player misreads at 12 m/s.
//
// The cell lookup happens in the fragment shader off `vMapUv`, which three
// guarantees exists whenever `map` is set. Doing it in the vertex shader would
// mean touching the raw `uv` attribute and betting on three's prefix.
function atlasMaterial(tex, cols, rows, opts = {}) {
  // Half-texel inset. Bilinear filtering (and every mip level above 0) samples
  // across a cell boundary otherwise, and a `+1` picks up a sliver of the `+2`
  // next to it in the atlas.
  const pad = (opts.pad ?? 0.006).toFixed(4);
  const m = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: !!opts.transparent,
    opacity: opts.opacity ?? 1,
    alphaTest: opts.alphaTest ?? 0,
    depthWrite: opts.depthWrite !== false,
    side: THREE.FrontSide,
    toneMapped: false,
    fog: true,
  });
  m.onBeforeCompile = (s) => {
    // The cell index is resolved in the VERTEX shader and only the resulting
    // grid offset is interpolated. Doing the `mod` per fragment looks identical
    // and is subtly, viciously wrong: `aCell` arrives as a varying, and a
    // varying carrying the integer 4.0 interpolates to 3.9999998 on some
    // fragments. `mod(3.9999998, 4.0)` is 3.99 rather than 0, so every panel
    // whose cell index is an exact multiple of the column count strobes between
    // two atlas rows per pixel — purple gates came out as purple-and-black
    // stripes. `+ 0.5` parks the index in the middle of its integer bin so no
    // amount of interpolation noise can push it over an edge.
    s.vertexShader = 'attribute float aCell;\nvarying vec2 vCellOff;\n' + s.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       float _c = aCell + 0.5;
       float _col = floor( mod( _c, ${cols}.0 ) );
       float _row = floor( _c / ${cols}.0 );
       vCellOff = vec2( _col, ${rows}.0 - 1.0 - _row );`
    );
    s.fragmentShader = 'varying vec2 vCellOff;\n' + s.fragmentShader.replace(
      '#include <map_fragment>',
      `vec2 _cu = clamp( vMapUv, ${pad}, ${(1).toFixed(4)} - ${pad} );
       vec2 _uv = ( _cu + vCellOff ) / vec2( ${cols}.0, ${rows}.0 );
       diffuseColor *= texture2D( map, _uv );`
    );
  };
  m.customProgramCacheKey = () =>
    `hb-atlas${cols}x${rows}${opts.transparent ? 't' : ''}${opts.alphaTest || 0}`;
  return m;
}

// The shared face quad. Rotated to face -Z so it looks at the camera, which
// also flips its UVs into reading order — see SCREEN_X. Cloned per InstancedMesh
// because each one carries its own `aCell` instanced attribute.
export function faceQuad() {
  const g = new THREE.PlaneGeometry(1, 1);
  g.rotateY(Math.PI);
  return g;
}

// Attach a per-instance cell attribute and hand back the array to write into.
export function attachCells(geo, count) {
  const a = new THREE.InstancedBufferAttribute(new Float32Array(count), 1);
  a.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aCell', a);
  return a;
}

// --------------------------------------------------------------------------
// Materials
// --------------------------------------------------------------------------
let matCache = null;

/**
 * The physical panel a sign is bolted to.
 *   wood   — the frame/wall material: vertex-coloured planks and steel brackets
 *   glass  — translucent cyan, crack stage picked per instance from the atlas
 *   button — the red plunger plate
 * All three are shared singletons: two gates with the same panel must be the
 * same material object or they cannot share an InstancedMesh.
 */
export function panelMaterial(kind = 'wood') {
  if (!matCache) initSigns();
  return matCache[kind] || matCache.wood;
}

export const faceMaterial = () => panelMaterial('face');
export const glassMaterial = () => panelMaterial('glass');
export const glyphMaterial = () => panelMaterial('glyph');

// --------------------------------------------------------------------------
// The glyph mesh — every number in the game, in one draw call
// --------------------------------------------------------------------------
// Bands, not a free list. Gates and barriers each own a fixed slice of the
// instance buffer, so neither has to know the other exists and neither can
// stomp the other's glyphs when update order changes.
const LBL_CAP = 12;                    // glyphs per label
const BANDS = [{ labels: 30 }, { labels: 14 }];   // 0 = gates, 1 = barriers
let bandBase = [];
let glyphMesh = null, glyphGeo = null, glyphCells = null, glyphArr = null, glyphGroup = null;
let glyphTotal = 0;

export function initSigns() {
  if (matCache) return;
  glyphTex = buildGlyphAtlas();
  panelTex = buildPanelAtlas();

  matCache = {
    // Lambert + flat shading + vertex colours: one material paints wood, steel
    // and the rivets on it, so a gate frame and a barrier wall are one draw.
    wood: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
    button: new THREE.MeshLambertMaterial({ color: PAL.enemy, flatShading: true }),
    // alphaTest, not blending: opaque faces must write depth or a gate 40 m out
    // paints over the one in front of it.
    face: atlasMaterial(panelTex, P_COLS, P_ROWS, { alphaTest: 0.35, pad: 0.004 }),
    glass: atlasMaterial(panelTex, P_COLS, P_ROWS, { transparent: true, opacity: 0.94, depthWrite: false, pad: 0.004 }),
    // Blended, not alpha-tested: an alpha cutout eats the stroke off a glyph as
    // soon as mipmapping kicks in and the number thins to nothing at 40 m,
    // which is the exact distance it most needs to be readable.
    glyph: atlasMaterial(glyphTex, G_COLS, G_ROWS, { transparent: true, alphaTest: 0.02, depthWrite: false, pad: 0.005 }),
  };

  let base = 0;
  bandBase = BANDS.map((b) => { const v = base; base += b.labels * LBL_CAP; return v; });
  glyphTotal = base;

  glyphGeo = faceQuad();
  glyphCells = attachCells(glyphGeo, glyphTotal);
  glyphMesh = new THREE.InstancedMesh(glyphGeo, matCache.glyph, glyphTotal);
  glyphMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  glyphMesh.frustumCulled = false;
  glyphMesh.renderOrder = 6;
  glyphMesh.count = glyphTotal;
  // Every slot starts as a zero-scale but otherwise valid matrix. A wholly zero
  // matrix has w = 0 and the perspective divide turns the vertex into NaN,
  // which on some drivers is a full-screen triangle rather than nothing at all.
  glyphArr = glyphMesh.instanceMatrix.array;
  glyphArr.fill(0);
  for (let i = 0; i < glyphTotal; i++) glyphArr[i * 16 + 15] = 1;
  glyphGroup = new THREE.Group();
  glyphGroup.add(glyphMesh);
  return glyphGroup;
}

// gates.js adds this to the scene: initSigns() takes no ctx by contract, so it
// cannot add itself.
export function glyphLayer() { if (!matCache) initSigns(); return glyphGroup; }

// --------------------------------------------------------------------------
// Typesetting
// --------------------------------------------------------------------------

// `EFFECTS[type].fmt()` produces things like "▲ PROMOTE" and "⌖ GUN +3". Nine
// glyphs across a 3 m panel is unreadable at speed, so a label that ends in a
// word is split: the symbol goes big, the word goes small underneath. "♥ 20"
// does NOT split — its tail is a number and belongs next to the heart.
const _split = { big: '', small: '' };
export function splitLabel(text) {
  const i = text.indexOf(' ');
  if (i > 0 && text.length - i - 1 >= 3 && /^[A-Za-z]/.test(text[i + 1])) {
    _split.big = text.slice(0, i);
    _split.small = text.slice(i + 1);
  } else {
    _split.big = text.replace(/ /g, '');
    _split.small = '';
  }
  return _split;
}

function runWidth(text, size) {
  let w = 0;
  for (let i = 0; i < text.length; i++) {
    const c = glyphCell.get(text[i]);
    w += c === undefined ? SPACE_ADV * size : glyphAdv[c] * size;
  }
  return w;
}

// Write one run of glyphs as instance matrices. `tilt` leans the quad back about
// X exactly as the panel does, so the number sits ON the sign rather than
// hovering in front of it.
function writeRun(slot, limit, text, cx, cy, cz, size, tiltC, tiltS) {
  let n = 0;
  const total = runWidth(text, size);
  let px = -total / 2;                 // screen-space, left edge of the run
  for (let i = 0; i < text.length && slot + n < limit; i++) {
    const cell = glyphCell.get(text[i]);
    const adv = cell === undefined ? SPACE_ADV * size : glyphAdv[cell] * size;
    if (cell !== undefined) {
      const lx = px + adv / 2;
      const o = (slot + n) * 16;
      // rotX(tilt) * scale(size), translated. Written by hand: a Matrix4
      // compose per glyph per frame is measurable at 500 glyphs.
      glyphArr[o] = size;      glyphArr[o + 1] = 0;             glyphArr[o + 2] = 0;             glyphArr[o + 3] = 0;
      glyphArr[o + 4] = 0;     glyphArr[o + 5] = tiltC * size;  glyphArr[o + 6] = tiltS * size;  glyphArr[o + 7] = 0;
      glyphArr[o + 8] = 0;     glyphArr[o + 9] = -tiltS * size; glyphArr[o + 10] = tiltC * size; glyphArr[o + 11] = 0;
      glyphArr[o + 12] = cx + SCREEN_X * lx;
      glyphArr[o + 13] = cy;
      glyphArr[o + 14] = cz;
      glyphArr[o + 15] = 1;
      glyphCells.array[slot + n] = cell;
      n++;
    }
    px += adv;
  }
  return n;
}

/**
 * A writer over one band of the glyph buffer.
 *
 *   const w = labelWriter(0);
 *   w.begin();
 *   w.label('+99', '', x, y, z, panelW, panelH, tilt);   // once per visible sign
 *   w.end();
 *
 * `begin`/`end` cost nothing and allocate nothing; `end()` zeroes whatever the
 * previous frame left behind so a despawned gate's number vanishes with it.
 */
export function labelWriter(band) {
  if (!matCache) initSigns();
  const base = bandBase[band];
  const limit = base + BANDS[band].labels * LBL_CAP;
  let cur = base, high = base;
  return {
    begin() { high = cur; cur = base; },
    /**
     * Lay a label inside a panel. Returns false if the band is full.
     * `h` is the panel height in metres; glyph size is derived from it so a
     * label always fills its sign the way the reference's do.
     */
    label(big, small, cx, cy, cz, pw, ph, tilt = 0) {
      if (cur + LBL_CAP > limit) return false;
      const slot = cur;
      const tc = Math.cos(tilt), ts = Math.sin(tilt);
      const maxW = pw * 0.85;
      let n = 0;
      if (small) {
        // symbol over word: the symbol carries the meaning at distance, the
        // word confirms it once you are close enough to read it.
        let s1 = ph * 0.54;
        const w1 = runWidth(big, s1);
        if (w1 > maxW) s1 *= maxW / w1;
        // Moving up the panel's local y also moves +z, because the panel leans
        // back. Getting this sign backwards pushes the LOWER line behind the
        // panel it belongs to and the depth test eats it — the sign renders
        // with its symbol and no word, which looks like a font problem and is
        // not one.
        const y1 = ph * 0.19;
        n += writeRun(slot + n, limit, big, cx, cy + y1 * tc, cz + y1 * ts, s1, tc, ts);
        let s2 = ph * 0.25;
        const w2 = runWidth(small, s2);
        if (w2 > maxW) s2 *= maxW / w2;
        const y2 = -ph * 0.27;
        n += writeRun(slot + n, limit, small, cx, cy + y2 * tc, cz + y2 * ts, s2, tc, ts);
      } else {
        let s1 = ph * 0.80;   // the number is the sign; leave it a hair of margin
        const w1 = runWidth(big, s1);
        if (w1 > maxW) s1 *= maxW / w1;
        n += writeRun(slot + n, limit, big, cx, cy, cz, s1, tc, ts);
      }
      cur = slot + LBL_CAP;
      return true;
    },
    end() {
      const top = Math.max(cur, high);
      for (let i = cur; i < top; i++) {
        const o = i * 16;
        // scale 0 → degenerate triangles, rasterized away for free
        glyphArr[o] = glyphArr[o + 5] = glyphArr[o + 10] = 0;
      }
      glyphMesh.instanceMatrix.needsUpdate = true;
      glyphCells.needsUpdate = true;
    },
  };
}

// --------------------------------------------------------------------------
// Baked faces
// --------------------------------------------------------------------------

/**
 * A complete gate face as a single texture: panel colour, hard dark border,
 * and the label in fat white glyphs. Cached by key, so a level with forty `+1`
 * gates allocates exactly one canvas.
 *
 * The run does NOT use this for growing gates — a value that changes 60 times a
 * second would blow the cache and re-upload a texture per hit, which is why the
 * glyph atlas above exists. It is the right tool for a *static* face: a one-off
 * quad, a HUD preview, `dev/t_gates.html`. Pass `value: null` for the bare plate.
 */
export function signTexture(spec = {}) {
  const { type = 'troops', value = null, panel = 'wood' } = spec;
  const S = GATE.signTexSize;
  const key = `sign:${panel}:${type}:${value}`;
  return canvasTex(key, S, S, (g, w, h) => {
    if (panel === 'glass') drawGlassPlate(g, w, h, 0);
    else if (panel === 'button') drawButtonPlate(g, w, h);
    else drawSignPlate(g, w, h, SIGN_HEX[EFFECTS[type]?.sign || 'blue']);
    if (value == null) return;
    const text = EFFECTS[type]?.fmt ? EFFECTS[type].fmt(value) : String(value);
    const { big, small } = splitLabel(text);
    bakeText(g, big, w / 2, small ? h * 0.40 : h * 0.52, w * 0.88, small ? h * 0.46 : h * 0.60);
    if (small) bakeText(g, small, w / 2, h * 0.76, w * 0.88, h * 0.18);
  });
}

/**
 * The reference's numbered plank wall: wood, steel rails, one very large white
 * number. Same caching rule — one texture per distinct value. barriers.js
 * overlays its live HP with the glyph mesh instead, and uses `value: null`.
 */
export function barrierTexture(value = null) {
  const S = GATE.signTexSize;
  return canvasTex(`barrier:${value}`, S, S / 2, (g, w, h) => {
    drawPlanks(g, w, h);
    if (value == null) return;
    bakeText(g, String(Math.max(0, Math.round(value))), w / 2, h / 2, w * 0.72, h * 0.66);
  });
}

// Baked text uses the same fat-white-on-hard-dark recipe as the glyph atlas, so
// a baked face and a typeset one are indistinguishable.
function bakeText(g, text, cx, cy, maxW, size) {
  g.save();
  g.font = FONT(size);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const w = g.measureText(text).width;
  if (w > maxW) { g.translate(cx, cy); g.scale(maxW / w, 1); g.translate(-cx, -cy); }
  g.lineJoin = 'round';
  g.miterLimit = 2;
  g.lineWidth = Math.max(5, size * 0.20);
  g.strokeStyle = hex(PAL.signStroke);
  g.strokeText(text, cx, cy);
  g.fillStyle = '#ffffff';
  g.fillText(text, cx, cy);
  g.restore();
}

// --------------------------------------------------------------------------
// Chunky geometry helpers — shared by gates.js and barriers.js
// --------------------------------------------------------------------------

// A vertex-coloured box. Colour lives on the vertices so a frame's wood, steel
// and rivets all ride on ONE material and therefore one instanced draw call.
export function cbox(w, h, d, x, y, z, color) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  const n = g.attributes.position.count;
  const c = new Float32Array(n * 3);
  const col = new THREE.Color(color);
  for (let i = 0; i < n; i++) { c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}

// A 4-sided pyramid cap — the pointed steel post tops in the reference.
export function ccone(r, h, x, y, z, color) {
  const g = new THREE.ConeGeometry(r, h, 4);
  g.rotateY(Math.PI / 4);
  g.translate(x, y, z);
  const n = g.attributes.position.count;
  const c = new Float32Array(n * 3);
  const col = new THREE.Color(color);
  for (let i = 0; i < n; i++) { c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}

// Merge vertex-coloured pieces into one geometry. toon.js:mergeParts carries
// `aPart` for the crowd shader and drops `color`; props need the opposite.
export function cmerge(geos) {
  let vT = 0, iT = 0;
  for (const g of geos) {
    vT += g.attributes.position.count;
    iT += g.index ? g.index.count : g.attributes.position.count;
  }
  const pos = new Float32Array(vT * 3), nor = new Float32Array(vT * 3);
  const col = new Float32Array(vT * 3), uv = new Float32Array(vT * 2);
  const idx = vT > 65535 ? new Uint32Array(iT) : new Uint16Array(iT);
  let vo = 0, io = 0;
  for (const g of geos) {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array, vo * 3);
    nor.set(g.attributes.normal.array, vo * 3);
    if (g.attributes.color) col.set(g.attributes.color.array, vo * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, vo * 2);
    if (g.index) for (let i = 0; i < g.index.count; i++) idx[io + i] = g.index.array[i] + vo;
    else for (let i = 0; i < n; i++) idx[io + i] = i + vo;
    vo += n; io += g.index ? g.index.count : n;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}

export function disposeSigns() {
  if (!matCache) return;
  for (const m of Object.values(matCache)) m.dispose();
  glyphGeo?.dispose();
  glyphMesh?.dispose();
  glyphTex?.dispose();
  panelTex?.dispose();
  glyphGroup?.parent?.remove(glyphGroup);
  matCache = null; glyphMesh = null; glyphGeo = null; glyphGroup = null;
  glyphTex = null; panelTex = null;
  glyphCell.clear();
}
