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
//                 four glass-crack stages, the button plate, the plank wall and
//                 the gamble gate's steel-and-window plate.
//
// The glyph atlas's METRICS are measured off its own pixels rather than off the
// font — see below — and the fitting that uses them (`fitRun`) is what keeps a
// gate readable as its number climbs from `+1` to `+358`.
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
const GLYPH_SET = '0123456789+-$%.:s' + 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' + '×÷▲⌖♥⚡?';

// Metrics are MEASURED off the rasterised atlas, not taken from the font.
//
// `measureText` lies for this job in three ways that all end with a number
// hanging off the side of a sign: it reports the advance (ink + side bearings)
// rather than the ink, it knows nothing about the 17 px stroke we add on top of
// it, and it reports nothing at all for the six symbols, which are paths. On top
// of that "Arial Black" is not on every device, so a headless Chrome and a phone
// can pick different fonts with different widths for the same string.
//
// So after the atlas is drawn we read it back once and take the alpha bounding
// box of each cell. Everything downstream — advance, how tall a digit actually
// is inside its cell, how far off-centre it sits — is then true by construction
// for whatever font actually rendered, and the fitting maths cannot drift from
// the pixels. One `getImageData` and a stride-2 scan at boot, never again.
const glyphCell = new Map();      // char → cell index
const glyphAdv = new Float32Array(G_COLS * G_ROWS);   // ink width + tracking, in cells
const glyphInkH = new Float32Array(G_COLS * G_ROWS);  // ink height, in cells
const glyphSym = new Uint8Array(G_COLS * G_ROWS);     // 1 = a hand-drawn symbol
const SPACE_ADV = 0.30;
// Negative: the reference's digits touch at the stroke. The white cores stay
// apart, which is what makes "+99" read as one fat block instead of three.
const TRACK = -0.012;
// Filled in by measureBox(): the digit is the reference glyph, because every
// label that matters is mostly digits.
let REF_INK_H = 0.59;             // a digit's ink height as a fraction of a cell
let REF_DY = 0;                   // digit ink centre offset from the cell centre

// Hand-drawn symbols. The font versions of these are thin, inconsistent across
// platforms, and '⌖' is outright missing on most — a tofu box on a gate face is
// unshippable, so the six that matter are paths.
//
// SYM_H is each path's vertical extent in units of the `s` it is drawn at. The
// atlas uses it to solve for the `s` that makes every symbol's inked height
// equal, so '♥ 20' and '× 2' put their digits at the same size as '+20' does.
// Drawn at one flat scale they do not: '⚡' spans 0.92 of `s` and '×' only 0.63,
// so the heart in "♥20" came out half again as tall as the panel's digits and
// shoved them down to 70% — a purple gate read as a heart with a footnote.
const SYM_H = { '▲': 0.78, '×': 0.629, '÷': 0.86, '♥': 0.72, '⚡': 0.92, '⌖': 0.96, '?': 1.075 };
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
  // The gamble gate's whole sign. Unlike the five above it is a CENTRELINE, not
  // an outline: `{ body }` marks it, and the atlas strokes it twice — once at
  // body + stroke in ink, once at body in white. A '?' built the other way, out
  // of overlapping filled shapes, gets the dark stroke drawn along every seam
  // where the bowl meets its own tail, and the hook comes out with a black scar
  // across it. A skeleton has no seams, and round caps give it the same soft
  // fat terminals as Arial Black's digits.
  // Proportioned off Arial Black's own '?' so it sits in a row of digits without
  // looking like a different typeface: ink 0.76 as wide as it is tall, a bowl
  // whose outer diameter is 0.76 of the height, and a stem ending at 0.72 down.
  // The gap before the dot is wider than the font's, because our 17 px stroke
  // is not the font's — at the typographic gap the two dark outlines close over
  // the white entirely and the '?' comes out as an '!'.
  // The counter is the hard constraint, not the outline. The dark stroke is
  // drawn UNDER the white, so it eats SW *inward* as well as outward: a bowl
  // whose inner diameter is under ~20 px in the cell closes up completely and
  // the glyph renders as a filled blob with a dot beneath it. Bowl radius,
  // body and the descender are solved together against that — inner diameter
  // 0.38 of `s` leaves ~7 px of counter after the stroke, which is the same
  // slit the '0' and '8' in the atlas have.
  '?': {
    body: 0.21,
    path: (g, s) => {
      // The bowl, and the 119° it does NOT sweep is the shape: the opening
      // faces straight down, so the hook's left terminal sits at lower-left and
      // its right terminal at upper-right, where the tail takes over. Sweep any
      // further round and the tail re-enters the bowl instead of descending
      // below it — the counter closes and the glyph reads as a 'Q'.
      g.arc(0, -0.10 * s, 0.30 * s, Math.PI * 0.78, Math.PI * 2.12);
      // tail, dropping below the bowl and curling in to the stem
      g.quadraticCurveTo(0.27 * s, 0.13 * s, 0.03 * s, 0.16 * s);
      g.lineTo(0, 0.185 * s);
      // the dot: a stub segment, so the round cap IS the dot
      g.moveTo(0, 0.455 * s);
      g.lineTo(0, 0.465 * s);
    },
  },
};

const FONT = (px) => `900 ${px}px "Arial Black", "Helvetica Neue", Impact, system-ui, sans-serif`;

let glyphTex = null, panelTex = null;

const FS = 80;                         // font size inside a 128 cell
const SW = 17;                         // stroke width — the reference's is FAT
// A symbol is drawn 1.12x a digit's inked height. Bigger than the digits it
// sits next to, because it carries the meaning at distance; not so much bigger
// that it owns the panel. At this height the widest symbol ('⌖', 0.96 of its
// own scale) lands at ±42 px in a 64 px half-cell — comfortably clear of the
// cell edge, which matters because a symbol that bleeds corrupts its
// NEIGHBOUR'S measurement as well as its own picture.
const SYM_INK = 1.12;

function cellXY(i) { return [(i % G_COLS) * G_CELL, ((i / G_COLS) | 0) * G_CELL]; }

function buildGlyphAtlas() {
  const c = document.createElement('canvas');
  c.width = c.height = G_SIZE;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.lineJoin = 'round';
  g.miterLimit = 2;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (let i = 0; i < GLYPH_SET.length; i++) glyphCell.set(GLYPH_SET[i], i);

  // Two passes, because the symbols are sized off the digits. Text first, so
  // REF_INK_H is known; then the symbols, solved to match it.
  for (let i = 0; i < GLYPH_SET.length; i++) {
    const ch = GLYPH_SET[i];
    if (SYM[ch]) continue;
    const [x0, y0] = cellXY(i);
    g.save();
    clipCell(g, x0, y0);
    g.translate(x0 + G_CELL / 2, y0 + G_CELL / 2);
    g.font = FONT(FS);
    g.lineWidth = SW;
    g.strokeStyle = hex(PAL.signStroke);
    g.strokeText(ch, 0, 4);            // +4: Arial Black sits high in its box
    g.fillStyle = '#ffffff';
    g.fillText(ch, 0, 4);
    g.restore();
  }
  measureText(g);

  const target = REF_INK_H * SYM_INK;
  for (let i = 0; i < GLYPH_SET.length; i++) {
    const ch = GLYPH_SET[i];
    if (!SYM[ch]) continue;
    const [x0, y0] = cellXY(i);
    // inkHeight = (extent * s + SW) / G_CELL, solved for s. SYM_H already
    // carries a centreline symbol's body width, so one formula covers both.
    const s = (target * G_CELL - SW) / SYM_H[ch];
    const sym = SYM[ch];
    glyphSym[i] = 1;
    g.save();
    clipCell(g, x0, y0);
    g.translate(x0 + G_CELL / 2, y0 + G_CELL / 2);
    g.beginPath();
    (sym.path || sym)(g, s);
    g.strokeStyle = hex(PAL.signStroke);
    if (sym.body) {
      g.lineCap = 'round';
      g.lineWidth = sym.body * s + SW;
      g.stroke();
      g.lineWidth = sym.body * s;
      g.strokeStyle = '#ffffff';
      g.stroke();
      g.lineCap = 'butt';
    } else {
      g.lineWidth = SW;
      g.stroke();
      g.fillStyle = '#ffffff';
      g.fill();
    }
    g.restore();
    measureCell(g, i, x0, y0);
  }

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

// A glyph that spills out of its cell corrupts its neighbour's picture AND its
// neighbour's measurement, so every draw is clipped. The worst case is then one
// clipped glyph instead of a ruined row — which a font substitution on some
// device could otherwise hand us at any time.
function clipCell(g, x0, y0) {
  g.beginPath();
  g.rect(x0, y0, G_CELL, G_CELL);
  g.clip();
}

// Alpha bounding box of one cell → advance, ink height, and (for '0') the
// vertical offset the whole run is corrected by. Stride 2, so a cell is 4k
// samples rather than 16k; the 2 px of slop that costs is padded back on, and
// 2 px in a 128 px cell is 1.5% of a glyph — well inside the margin the fitting
// leaves anyway.
function measureBox(data, i, x0, y0, stride) {
  const A = 24;                                  // alpha above which a pixel is ink
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  for (let y = 0; y < G_CELL; y += 2) {
    const rowOff = ((y0 + y) * stride + x0) * 4 + 3;
    for (let x = 0; x < G_CELL; x += 2) {
      if (data[rowOff + x * 4] <= A) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < minX) {                             // blank cell (should not happen)
    glyphAdv[i] = SPACE_ADV; glyphInkH[i] = 0;
    return;
  }
  glyphAdv[i] = (maxX - minX + 3) / G_CELL + TRACK;   // +1 span, +2 stride slop
  glyphInkH[i] = (maxY - minY + 3) / G_CELL;
  if (GLYPH_SET[i] === '0') {
    REF_INK_H = glyphInkH[i];
    // How far the digit's ink centre sits BELOW the cell centre, in cells. A
    // quad whose centre is at panel-centre + REF_DY*size therefore puts the
    // digit's ink on the panel centre: the glyph quad no longer has to be
    // centred, only the NUMBER does.
    REF_DY = ((minY + maxY + 1) / 2 - G_CELL / 2) / G_CELL;
  }
}

// Every text cell in one read — the symbols are not drawn yet.
function measureText(g) {
  const data = g.getImageData(0, 0, G_SIZE, G_SIZE).data;
  for (let i = 0; i < GLYPH_SET.length; i++) {
    if (SYM[GLYPH_SET[i]]) continue;
    const [x0, y0] = cellXY(i);
    measureBox(data, i, x0, y0, G_SIZE);
  }
}

// One symbol, read back on its own so the second pass costs six 128² reads
// rather than a second full-atlas one.
function measureCell(g, i, x0, y0) {
  measureBox(g.getImageData(x0, y0, G_CELL, G_CELL).data, i, 0, 0, G_CELL);
}

// --------------------------------------------------------------------------
// Panel atlas
// --------------------------------------------------------------------------
const P_CELL = 256, P_COLS = 4, P_ROWS = 4;

export const PANEL_CELL = {
  blue: 0, yellow: 1, green: 2, red: 3, purple: 4,
  glass0: 5, glass1: 6, glass2: 7, glass3: 8,
  button: 9, plank: 10, mystery: 11,
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

// The gamble gate. Every other sign in the game is a flat field with the answer
// printed on it; this one has no answer to print, so it is built to look like a
// different KIND of object rather than a purple version of the same one: a
// steel bezel bolted over the panel, a lozenge cut out of it, and the '?' laid
// in the hole. The lozenge is what does the work — the eye reads "a plate with
// something behind it" before it reads the colour, and that is the whole tell:
// this gate is hiding something.
function drawMysteryPlate(g, w, h) {
  const ink = Math.round(w * 0.022);
  const rim = Math.round(w * 0.055);
  g.fillStyle = hex(PAL.signStroke);
  g.fillRect(0, 0, w, h);
  g.fillStyle = hex(PAL.steel);
  g.fillRect(ink, ink, w - ink * 2, h - ink * 2);
  // the steel bezel's own bevel, so it sits proud of what is behind it
  g.globalAlpha = 0.30; g.fillStyle = '#ffffff';
  g.fillRect(ink, ink, w - ink * 2, h * 0.055);
  g.globalAlpha = 0.28; g.fillStyle = '#000000';
  g.fillRect(ink, h - ink - h * 0.055, w - ink * 2, h * 0.055);
  g.globalAlpha = 1;

  // The window the '?' sits in. An OCTAGON, not the diamond this started as: a
  // diamond has almost no width where a tall glyph needs it most, so the '?'
  // bowl and its dot both broke out through the top and bottom points and the
  // plate read as a badge with a sticker over it. A chamfered rectangle is the
  // same "cut through the bezel" idea and actually contains the glyph.
  const cx = w / 2, cy = h / 2;
  const win = (k, dy) => {
    const rx = w * 0.435 * k, ry = h * 0.435 * k, ch = Math.min(rx, ry) * 0.42;
    g.beginPath();
    g.moveTo(cx - rx + ch, cy - ry + dy);
    g.lineTo(cx + rx - ch, cy - ry + dy);
    g.lineTo(cx + rx, cy - ry + ch + dy);
    g.lineTo(cx + rx, cy + ry - ch + dy);
    g.lineTo(cx + rx - ch, cy + ry + dy);
    g.lineTo(cx - rx + ch, cy + ry + dy);
    g.lineTo(cx - rx, cy + ry - ch + dy);
    g.lineTo(cx - rx, cy - ry + ch + dy);
    g.closePath();
    g.fill();
  };
  g.fillStyle = hex(PAL.signStroke);
  win(1, 0);
  const deep = new THREE.Color(PAL.signPurple).multiplyScalar(0.52);
  g.fillStyle = '#' + deep.getHexString();
  win(0.94, 0);
  g.fillStyle = hex(PAL.signPurple);
  win(0.86, h * 0.012);
  // a soft top-lit sheen inside the window
  g.save();
  g.beginPath();
  const rx = w * 0.435 * 0.86, ry = h * 0.435 * 0.86, ch = Math.min(rx, ry) * 0.42;
  g.rect(cx - rx, cy - ry, rx * 2, ry * 2 - ch);
  g.clip();
  g.globalAlpha = 0.22; g.fillStyle = '#ffffff';
  g.fillRect(0, 0, w, h * 0.40);
  g.globalAlpha = 1;
  g.restore();

  // bolts in the four corners of the bezel — the same fastening language as the
  // button plate, so the two "mechanism" gates read as a family
  g.fillStyle = hex(PAL.signStroke);
  for (const [px, py] of [[0.075, 0.085], [0.925, 0.085], [0.075, 0.915], [0.925, 0.915]]) {
    g.beginPath(); g.arc(px * w, py * h, w * 0.030, 0, Math.PI * 2); g.fill();
  }
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
  cell(PANEL_CELL.mystery, (x) => drawMysteryPlate(x, P_CELL, P_CELL));

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

// The gamble gate breaks the "sign colour is the tell" rule on purpose — it is
// the one gate whose payload you cannot read off it — so it gets its own plate
// rather than the purple field a `♥` or `⚡` gate uses. Everything else maps
// straight through EFFECTS[type].sign.
export const panelCellFor = (type) =>
  (type === 'gamble' ? PANEL_CELL.mystery : PANEL_CELL[EFFECTS[type]?.sign || 'blue']) ?? 0;

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

// Ink width of a run at glyph size `size`, horizontally squeezed by `xs`.
function runWidth(text, size, xs) {
  let w = 0;
  for (let i = 0; i < text.length; i++) {
    const c = glyphCell.get(text[i]);
    w += c === undefined ? SPACE_ADV : glyphAdv[c];
  }
  return w * size * xs;
}

// Ink height of the TALLEST glyph in the run, in cells. A run of digits is
// REF_INK_H; a run that is a single '▲' is much taller, and sizing off this is
// what keeps a symbol from bursting out of the top of its panel.
function runInkH(text) {
  let h = 0;
  for (let i = 0; i < text.length; i++) {
    const c = glyphCell.get(text[i]);
    if (c !== undefined && glyphInkH[c] > h) h = glyphInkH[c];
  }
  return h || REF_INK_H;
}

// --------------------------------------------------------------------------
// Fitting
// --------------------------------------------------------------------------
// THE RULE: A LABEL NEVER OVERFLOWS ITS PANEL, AND LOSES HEIGHT LAST.
//
// The mechanic drives every gate toward more digits — `+1` becomes `+358` under
// sustained fire — so "lay glyphs at a fixed advance and hope" is not a policy,
// it is a countdown. But the obvious fix, scaling the whole run down until it
// fits, is what made a grown gate unreadable: four glyphs at a uniform 0.57
// scale put `+360` at 27% of the panel height, a third the size of the `+3`
// next to it, exactly when the number matters most.
//
// So we squeeze the way `toon.js:signText` does for the baked path: keep the
// cap height, compress the advance and the glyph width together. A condensed
// digit loses nothing at 40 m — its stroke is still the same weight vertically
// and it is still the full height of the sign. Only when the squeeze passes
// XS_MIN does the height start to give, and even then it gives at 1/XS_MIN of
// the rate. `+360` lands at 44% of the panel instead of 27%, and `+24` at 58%.
//
// The three numbers, and why:
//   FIT_W   0.85  the coloured field inside the plate's border is 0.86 of the
//                 panel; the reference's "+99" runs right to that edge, so this
//                 leaves the glyph's dark stroke a half-centimetre clear of the
//                 plate's dark rim instead of merging into it.
//   CAP_1   0.62  a single line's cap height. The reference's is ~0.65 of the
//                 panel, measured off ref1's "+99".
//   XS_MIN  0.62  a digit's natural ink is 0.84 as wide as it is tall; at 0.62
//                 it is 0.52, which is condensed but still unmistakably fat.
const FIT_W = 0.85;
const CAP_1 = 0.62;
const CAP_BIG = 0.44;              // the symbol line of a split label
const CAP_SMALL = 0.19;            // the word under it
const XS_MIN = 0.62;
// A label that is ONE hand-drawn symbol and nothing else is a poster, not a
// number: the gamble gate's '?' is the only sign in the game that does not say
// what it does, so it has to be the loudest thing on the road. It has no
// second glyph competing for the width, so it can take the height a number
// cannot. Restricted to symbols on purpose — a barrier counting 10 → 9 must not
// suddenly jump a size on its last digit.
const CAP_HERO = 0.70;
const isHero = (big, small) => {
  if (small || big.length !== 1) return false;
  const c = glyphCell.get(big);
  return c !== undefined && !!glyphSym[c];
};

const _fit = { size: 0, xs: 1, w: 0 };
function fitRun(text, capH, maxW) {
  let size = capH / runInkH(text);
  let xs = 1;
  const w = runWidth(text, size, 1);
  if (w > maxW) {
    xs = maxW / w;
    // Past the floor, trade height for width at the floor's rate rather than
    // squeezing further — 0.5-wide glyphs stop reading before small ones do.
    if (xs < XS_MIN) { size *= xs / XS_MIN; xs = XS_MIN; }
  }
  _fit.size = size; _fit.xs = xs;
  _fit.w = Math.min(w, maxW);
  return _fit;
}

/**
 * Width, glyph size and squeeze a label would get in a panel of `pw` x `ph`.
 * Nothing in the run uses it — `dev/t_gates.html` does, so the fit can be
 * asserted in numbers instead of squinted at in a screenshot.
 */
export function labelMetrics(text, pw, ph) {
  if (!matCache) initSigns();
  const { big, small } = splitLabel(text);
  const f = fitRun(big, ph * (small ? CAP_BIG : isHero(big, small) ? CAP_HERO : CAP_1), pw * FIT_W);
  const out = { text, big, small, w: f.w, size: f.size, xs: f.xs, cap: 0, smallW: 0, fits: false };
  out.cap = f.size * runInkH(big);
  if (small) {
    const g = fitRun(small, ph * CAP_SMALL, pw * FIT_W);
    out.smallW = g.w;
  }
  out.fits = out.w <= pw * FIT_W + 1e-4 && out.smallW <= pw * FIT_W + 1e-4;
  return out;
}

// Write one run of glyphs as instance matrices. `tilt` leans the quad back about
// X exactly as the panel does, so the number sits ON the sign rather than
// hovering in front of it. `xs` squeezes x only: the quad is scaled `size * xs`
// across and `size` tall, so the glyph condenses and never shrinks.
function writeRun(slot, limit, text, cx, cy, cz, size, xs, tiltC, tiltS) {
  let n = 0;
  const total = runWidth(text, size, xs);
  let px = -total / 2;                 // screen-space, left edge of the run
  const sx = size * xs;
  // Recentre the digit's ink on the panel; see REF_DY. Up the panel's local y
  // is +y*cos and +z*sin, exactly as in label().
  const dy = REF_DY * size;
  const oy = cy + dy * tiltC, oz = cz + dy * tiltS;
  for (let i = 0; i < text.length && slot + n < limit; i++) {
    const cell = glyphCell.get(text[i]);
    const adv = (cell === undefined ? SPACE_ADV : glyphAdv[cell]) * sx;
    if (cell !== undefined) {
      const lx = px + adv / 2;
      const o = (slot + n) * 16;
      // rotX(tilt) * scale(sx, size, 1), translated. Written by hand: a Matrix4
      // compose per glyph per frame is measurable at 500 glyphs.
      glyphArr[o] = sx;        glyphArr[o + 1] = 0;             glyphArr[o + 2] = 0;             glyphArr[o + 3] = 0;
      glyphArr[o + 4] = 0;     glyphArr[o + 5] = tiltC * size;  glyphArr[o + 6] = tiltS * size;  glyphArr[o + 7] = 0;
      glyphArr[o + 8] = 0;     glyphArr[o + 9] = -tiltS * size; glyphArr[o + 10] = tiltC * size; glyphArr[o + 11] = 0;
      glyphArr[o + 12] = cx + SCREEN_X * lx;
      glyphArr[o + 13] = oy;
      glyphArr[o + 14] = oz;
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
      const maxW = pw * FIT_W;
      let n = 0;
      if (small) {
        // symbol over word: the symbol carries the meaning at distance, the
        // word confirms it once you are close enough to read it.
        let f = fitRun(big, ph * CAP_BIG, maxW);
        // Moving up the panel's local y also moves +z, because the panel leans
        // back. Getting this sign backwards pushes the LOWER line behind the
        // panel it belongs to and the depth test eats it — the sign renders
        // with its symbol and no word, which looks like a font problem and is
        // not one.
        const y1 = ph * 0.17;
        n += writeRun(slot + n, limit, big, cx, cy + y1 * tc, cz + y1 * ts, f.size, f.xs, tc, ts);
        f = fitRun(small, ph * CAP_SMALL, maxW);
        const y2 = -ph * 0.28;
        n += writeRun(slot + n, limit, small, cx, cy + y2 * tc, cz + y2 * ts, f.size, f.xs, tc, ts);
      } else {
        // The number IS the sign. It gets the full cap height and gives up
        // width first — see fitRun.
        const f = fitRun(big, ph * (isHero(big, small) ? CAP_HERO : CAP_1), maxW);
        n += writeRun(slot + n, limit, big, cx, cy, cz, f.size, f.xs, tc, ts);
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
    else if (type === 'gamble') drawMysteryPlate(g, w, h);
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
