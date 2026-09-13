// Procedural sprite atlas (CONTRACTS 9.2, DECISIONS D2).
//
// Everything the renderer can draw is baked into ONE 2048^2 canvas at boot from
// Canvas2D paths: enemy rigs and their walk cycles, the player, projectiles,
// pickups, particles, ground tiles, UI icons and the bitmap font. No files, no
// pop-in, and variety is a function of (palette, build, tatter, extra) rather
// than a folder.
//
// Everything is baked BONE WHITE and tinted at draw time, so one frame set
// serves nine Choir colours.

import { makeRng } from '../core/rng.js';

const W = 2048, H = 2048, PAD = 2;
const TAU = Math.PI * 2;

// ---------------------------------------------------------------- palettes

const BONE = ['#f2efe4', '#e7e1d1', '#ddd5c1', '#fbf8ef', '#d2cbb8', '#e3dac9'];
const CLOTH = ['#252a35', '#332c28', '#1e2430', '#2e2537', '#26302b', '#3a3330', '#1b1f28'];
const ACCENT = ['#ff3b58', '#ffd23f', '#39e6b0', '#8a6cff', '#ff7b2e', '#3fd2ff', '#ff4fd8', '#a3ff45', '#ff2020'];

const DARK = '#05060a';
const EXTRAS = ['horns', 'chains', 'lantern', 'armour', 'jaw', 'halo'];

// The internal variant table. Lane C's enemies.js supplies a SpriteSpec per
// enemy; `spriteKeyForSpec` folds any spec onto one of these baked variants, so
// content can be written before or after this file without a handshake.
const VARIANTS = {
  humanoid: 6, crawler: 4, bloat: 3, hulk: 3, wisp: 3, demon: 4, boss: 3, player: 6,
};
const CELL = { humanoid: 64, crawler: 64, bloat: 72, hulk: 80, wisp: 56, demon: 80, boss: 128, player: 64 };
const NFRAMES = { humanoid: 6, crawler: 6, bloat: 4, hulk: 6, wisp: 4, demon: 4, boss: 4, player: 6 };

// Friendly aliases so `spriteId('shambler')` works whatever Lane C names things.
const ALIASES = {
  shambler: 'humanoid.0', husk: 'humanoid.1', choirboy: 'humanoid.2',
  drowned: 'humanoid.3', pilgrim: 'humanoid.4', warden: 'humanoid.5',
  creeper: 'crawler.0', scuttler: 'crawler.1', hound: 'crawler.2', spitter: 'crawler.3',
  gorger: 'bloat.0', sac: 'bloat.1', chorister: 'bloat.2',
  breaker: 'hulk.0', ossuary: 'hulk.1', bellman: 'hulk.2',
  mote: 'wisp.0', candle: 'wisp.1', shade: 'wisp.2',
  conductor: 'demon.0', weaver: 'demon.1', cantor: 'demon.2', handmaid: 'demon.3',
  hollowth: 'boss.0', vellish: 'boss.1', morrow: 'boss.2',
  wick: 'player.0', vane: 'player.1', dredge: 'player.2',
  ilse: 'player.3', ash: 'player.4', ninth: 'player.5',
};

// --------------------------------------------------------------- the table

// frames is indexed by the renderer as a flat Float32Array for speed:
// [u0,v0,u1,v1,w,h,ox,oy] per id.
let DATA = new Float32Array(8);
let COUNT = 0;
let KEYS = new Map();          // key -> { id, n }
let LIST = [];                 // id -> { key, frame, x, y, w, h }
let FONT = null;
let BUILT = null;
let USED = 0;

/** O(1): key + frame -> integer atlas id. Cache the result, do not call per frame. */
export function spriteId(key, frame = 0) {
  const e = KEYS.get(key);
  if (!e) return 0;
  return e.id + (e.n > 1 ? ((frame | 0) % e.n + e.n) % e.n : 0);
}

/** How many frames a key has baked (1 for statics). */
export function frameCount(key) {
  const e = KEYS.get(key);
  return e ? e.n : 0;
}

export function hasKey(key) { return KEYS.has(key); }

/** Every baked key, for lanes that want to see what exists. */
export function atlasKeys() { return [...KEYS.keys()].sort(); }

/**
 * Fold any SpriteSpec onto a baked variant. Deterministic: the same spec always
 * lands on the same sprite, so an enemy type does not shimmer between variants.
 */
export function spriteKeyForSpec(spec, fallbackId) {
  if (!spec) return ALIASES[fallbackId] || (KEYS.has(fallbackId) ? fallbackId : 'humanoid.0');
  if (typeof spec === 'string') return ALIASES[spec] || (KEYS.has(spec) ? spec : 'humanoid.0');
  const rig = VARIANTS[spec.rig] ? spec.rig : 'humanoid';
  const n = VARIANTS[rig];
  let h = 0;
  const s = (spec.palette ? spec.palette.join('') : '') + (spec.extra ? spec.extra.join('') : '');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  h ^= Math.round((spec.build || 0) * 97) * 7 + Math.round((spec.tatter || 0) * 61) * 13;
  return rig + '.' + (((h % n) + n) % n);
}

// ------------------------------------------------------------------ packer

let px = PAD, py = PAD, rowH = 0, ctx = null, canvas = null;

function place(w, h) {
  if (px + w + PAD > W) { px = PAD; py += rowH + PAD; rowH = 0; }
  if (py + h + PAD > H) throw new Error('atlas full');
  const r = { x: px, y: py };
  px += w + PAD;
  if (h > rowH) rowH = h;
  USED += w * h;
  return r;
}

function addFrame(key, x, y, w, h, ox, oy) {
  const id = COUNT++;
  if (id * 8 >= DATA.length) {
    const d = new Float32Array(DATA.length * 2);
    d.set(DATA); DATA = d;
  }
  const o = id * 8;
  // Half-texel inset: without it a scaled sprite drags in its neighbour.
  DATA[o] = (x + 0.5) / W; DATA[o + 1] = (y + 0.5) / H;
  DATA[o + 2] = (x + w - 0.5) / W; DATA[o + 3] = (y + h - 0.5) / H;
  DATA[o + 4] = w; DATA[o + 5] = h;
  DATA[o + 6] = ox === undefined ? w / 2 : ox;
  DATA[o + 7] = oy === undefined ? h / 2 : oy;
  LIST[id] = { key, x, y, w, h };
  const e = KEYS.get(key);
  if (e) e.n++; else KEYS.set(key, { id, n: 1 });
  return id;
}

/** Bake one cell: fn draws into a (size x size) box with the origin at its centre. */
function cell(key, size, fn, oy) {
  const r = place(size, size);
  ctx.save();
  ctx.translate(r.x + size / 2, r.y + size / 2);
  fn(ctx, size);
  ctx.restore();
  return addFrame(key, r.x, r.y, size, size, size / 2, oy === undefined ? size / 2 : oy);
}

// ------------------------------------------------------------- path tools

function capsule(c, x0, y0, x1, y1, w0, w1) {
  const a = Math.atan2(y1 - y0, x1 - x0), q = Math.PI / 2;
  c.moveTo(x0 + Math.cos(a + q) * w0, y0 + Math.sin(a + q) * w0);
  c.lineTo(x1 + Math.cos(a + q) * w1, y1 + Math.sin(a + q) * w1);
  c.arc(x1, y1, w1, a + q, a - q, true);
  c.lineTo(x0 + Math.cos(a - q) * w0, y0 + Math.sin(a - q) * w0);
  c.arc(x0, y0, w0, a - q, a + q, true);
  c.closePath();
}

function blob(c, x, y, rx, ry, wob, rng, n = 12) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const k = 1 + (rng.next() - 0.5) * 2 * wob;
    pts.push([x + Math.cos(a) * rx * k, y + Math.sin(a) * ry * k]);
  }
  c.moveTo((pts[0][0] + pts[n - 1][0]) / 2, (pts[0][1] + pts[n - 1][1]) / 2);
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n];
    c.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2);
  }
  c.closePath();
}

// A hem that reads as cloth in ruins. `tatter` drives both depth and irregularity.
function hem(c, x, y, w, top, tatter, rng, teeth = 5) {
  c.moveTo(x - w, top);
  c.lineTo(x + w, top);
  for (let i = teeth; i >= 0; i--) {
    const t = i / teeth;
    const hx = x - w + 2 * w * t;
    const d = y + (rng.next() - 0.3) * tatter * 9;
    c.lineTo(hx + (rng.next() - 0.5) * 3, d);
    if (i > 0) c.lineTo(hx - w / teeth, y - tatter * 7 * rng.next());
  }
  c.closePath();
}

// ------------------------------------------------------------ rig plumbing

// Parts are collected first and painted in four passes, so every rig gets the
// same wet-black outline, the same top-down key light and the same rim without
// each rig re-implementing it. At 32-48px the silhouette is the whole sprite.
function paint(c, size, parts, spec, glowFn) {
  const u = size / 64;
  c.lineJoin = 'round'; c.lineCap = 'round';

  // 0. dark underlay -> a clean silhouette border against a near-black street.
  // It MUST scale with the cell: a fixed width welds a 56px rig's limbs
  // together while leaving a 128px boss with no outline at all.
  c.strokeStyle = DARK; c.fillStyle = DARK; c.lineWidth = 3.2 * u;
  for (const p of parts) { c.beginPath(); p.p(c); c.fill(); c.stroke(); }

  // 1. flats
  for (const p of parts) { c.beginPath(); p.p(c); c.fillStyle = p.f; c.fill(); }

  // 2. key light from above, clipped to the body. The floor shadow is kept
  // shallow - darken the legs and they vanish into the street.
  c.save();
  c.globalCompositeOperation = 'source-atop';
  let g = c.createLinearGradient(0, -size / 2, 0, size / 2);
  g.addColorStop(0, 'rgba(232,244,255,0.46)');
  g.addColorStop(0.40, 'rgba(255,255,255,0.06)');
  g.addColorStop(1, 'rgba(6,10,18,0.30)');
  c.fillStyle = g; c.fillRect(-size / 2, -size / 2, size, size);
  // rim: a cold edge down the left, which is what separates a body from the dark
  g = c.createLinearGradient(-size / 2, 0, -size * 0.14, 0);
  g.addColorStop(0, 'rgba(150,200,255,0.40)');
  g.addColorStop(1, 'rgba(150,200,255,0)');
  c.fillStyle = g; c.fillRect(-size / 2, -size / 2, size, size);
  c.restore();

  // 3. interior definition, thin so it does not eat the silhouette
  c.globalAlpha = 0.5; c.strokeStyle = DARK; c.lineWidth = 1.1 * u;
  for (const p of parts) { if (p.line !== false) { c.beginPath(); p.p(c); c.stroke(); } }
  c.globalAlpha = 1;

  // 4. the one saturated colour
  if (glowFn) { c.save(); c.globalCompositeOperation = 'lighter'; glowFn(c); c.restore(); }
}

// Tint a baked hex without a colour library: limbs need to sit a step below the
// torso or a body reads as one flat shape.
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, ((n >> 16) & 255) * k) | 0;
  const g = Math.min(255, ((n >> 8) & 255) * k) | 0;
  const b = Math.min(255, (n & 255) * k) | 0;
  return 'rgb(' + r + ',' + g + ',' + b + ')';
}

function eyes(c, x, y, r, accent, spread) {
  c.fillStyle = accent;
  c.beginPath(); c.arc(x - spread, y, r, 0, TAU); c.arc(x + spread, y, r, 0, TAU); c.fill();
  c.globalAlpha = 0.35;
  c.beginPath(); c.arc(x - spread, y, r * 3.2, 0, TAU); c.arc(x + spread, y, r * 3.2, 0, TAU); c.fill();
  c.globalAlpha = 1;
}

// The six characters, in CHARACTERS order: Wick's lamp is amber, Vane's censer
// verdigris, Dredge crimson, Ilse silver-cyan, Ash ember, the Ninth's Hand white.
const PLAYER_ACCENT = ['#ffb13f', '#39e6b0', '#ff3b58', '#8fdcff', '#ff7b2e', '#e8e2ff'];

function specFor(rig, i) {
  const rng = makeRng(1000 + i * 37 + rig.length * 911);
  return {
    rig,
    skin: BONE[(i * 2 + rig.length) % BONE.length],
    cloth: CLOTH[(i * 3 + 1) % CLOTH.length],
    accent: rig === 'player' ? PLAYER_ACCENT[i % 6] : ACCENT[(i * 5 + rig.length * 2) % ACCENT.length],
    build: 0.12 + ((i * 0.31 + rig.length * 0.17) % 1) * 0.82,
    tatter: 0.1 + ((i * 0.47 + 0.21) % 1) * 0.85,
    extra: [EXTRAS[(i + rig.length) % EXTRAS.length], EXTRAS[(i * 3 + 2) % EXTRAS.length]],
    v: i,
    // Silhouette switches. Two variants of the same rig must differ in OUTLINE,
    // not only in palette - a recolour is not a different enemy at 40px.
    hood: (i % 3) === 1,
    skirt: (i % 3) !== 2,
    rng,
  };
}

// ------------------------------------------------------------------- rigs

function rigHumanoid(c, S, sp, t) {
  const u = S / 64, p = t * TAU;
  const swA = Math.sin(p), swB = Math.sin(p + Math.PI);
  const bulk = 0.62 + sp.build * 0.62;
  const bob = Math.cos(p * 2) * 1.2 * u;
  const lean = Math.sin(p) * 0.9 * u;
  const bone = sp.skin, boneL = shade(sp.skin, 0.76);

  const headR = 6.0 * u, headY = -19 * u + bob;
  const shY = -11 * u + bob, hipY = 4 * u + bob;
  const shW = 8.6 * bulk * u, waW = 6.0 * bulk * u;
  const legTop = hipY + 1 * u, legLen = 19 * u;
  const bkx = -3.2 * u + swB * 4.6 * u, bky = legTop + legLen - Math.abs(swB) * 2.4 * u;
  const frx = 3.2 * u + swA * 4.6 * u, fry = legTop + legLen - Math.abs(swA) * 2.4 * u;
  const parts = [];

  parts.push({ p: (x) => capsule(x, -shW * 0.86, shY + 1.5 * u, -shW - 2.6 * u + swB * 3.4 * u, hipY + 7 * u, 2.6 * u, 1.9 * u), f: boneL });
  parts.push({ p: (x) => capsule(x, -2.9 * u, legTop, bkx, bky, 3.1 * u, 2.3 * u), f: boneL });
  parts.push({ p: (x) => { x.ellipse(bkx - 0.4 * u, bky + 1.2 * u, 3.0 * u, 1.9 * u, 0, 0, TAU); }, f: sp.cloth });
  parts.push({ p: (x) => capsule(x, 2.9 * u, legTop, frx, fry, 3.2 * u, 2.4 * u), f: bone });
  parts.push({ p: (x) => { x.ellipse(frx + 0.4 * u, fry + 1.2 * u, 3.1 * u, 2.0 * u, 0, 0, TAU); }, f: sp.cloth });

  // torso: wide at the shoulders, pinched at the waist. A straight-sided box is
  // what made the first pass read as furniture rather than as a body.
  parts.push({
    p: (x) => {
      x.moveTo(-shW, shY);
      x.bezierCurveTo(-shW * 1.02, shY + 6 * u, -waW * 1.06, hipY - 3 * u, -waW, hipY + 1.5 * u);
      x.lineTo(waW, hipY + 1.5 * u);
      x.bezierCurveTo(waW * 1.06, hipY - 3 * u, shW * 1.02, shY + 6 * u, shW, shY);
      x.quadraticCurveTo(0, shY - 4.4 * u, -shW, shY);
      x.closePath();
    }, f: bone,
  });
  if (sp.skirt) {
    parts.push({ p: (x) => hem(x, 0, hipY + (9 + sp.tatter * 5) * u, waW * 1.22, hipY - 1 * u, sp.tatter * u, makeRng(sp.seed + 9), 5), f: sp.cloth });
  }

  parts.push({ p: (x) => capsule(x, lean * 0.4, shY - 1.5 * u, lean, headY + 4 * u, 2.1 * u, 2.5 * u), f: boneL });
  parts.push({ p: (x) => { x.ellipse(lean, headY, headR * 0.92, headR, 0, 0, TAU); }, f: bone });
  if (sp.extra.includes('jaw')) {
    parts.push({ p: (x) => { x.moveTo(lean - 2.6 * u, headY + 3.2 * u); x.lineTo(lean + 2.6 * u, headY + 3.2 * u); x.lineTo(lean, headY + 8.6 * u); x.closePath(); }, f: boneL });
  }
  if (sp.hood) {
    parts.push({
      p: (x) => {
        x.moveTo(lean - headR * 1.3, headY + 3 * u);
        x.quadraticCurveTo(lean, headY - headR * 2.0, lean + headR * 1.3, headY + 3 * u);
        x.quadraticCurveTo(lean, headY + 0.5 * u, lean - headR * 1.3, headY + 3 * u);
        x.closePath();
      }, f: sp.cloth,
    });
  }
  if (sp.extra.includes('horns')) {
    parts.push({ p: (x) => capsule(x, lean - 4.2 * u, headY - 3.4 * u, lean - 9 * u, headY - 10 * u, 1.7 * u, 0.45 * u), f: boneL, line: false });
    parts.push({ p: (x) => capsule(x, lean + 4.2 * u, headY - 3.4 * u, lean + 9 * u, headY - 10 * u, 1.7 * u, 0.45 * u), f: boneL, line: false });
  }
  if (sp.extra.includes('armour')) {
    parts.push({ p: (x) => { x.ellipse(-shW * 0.88, shY + 0.5 * u, 4.2 * u, 3.2 * u, -0.38, 0, TAU); }, f: '#616773' });
  }
  const handX = shW + 3.0 * u + swA * 3.4 * u, handY = hipY + 8 * u;
  parts.push({ p: (x) => capsule(x, shW * 0.86, shY + 1.5 * u, handX, handY, 2.8 * u, 2.0 * u), f: bone });

  paint(c, S, parts, sp, (x) => {
    eyes(x, lean, headY - 0.4 * u, 0.95 * u, sp.accent, 2.1 * u);
    if (sp.extra.includes('chains')) {
      x.strokeStyle = sp.accent; x.globalAlpha = 0.4; x.lineWidth = 1 * u;
      x.beginPath(); x.moveTo(-shW * 0.8, shY + 3 * u); x.quadraticCurveTo(0, hipY - 1 * u, shW * 0.8, shY + 3 * u); x.stroke();
      x.globalAlpha = 1;
    }
    if (sp.extra.includes('lantern')) {
      x.fillStyle = sp.accent;
      x.globalAlpha = 0.9; x.beginPath(); x.arc(handX, handY + 2.4 * u, 1.5 * u, 0, TAU); x.fill();
      x.globalAlpha = 0.2; x.beginPath(); x.arc(handX, handY + 2.4 * u, 5 * u, 0, TAU); x.fill();
      x.globalAlpha = 1;
    }
  });
}

function rigCrawler(c, S, sp, t) {
  const u = S / 64, p = t * TAU;
  const ph = [0, 1.9, 3.4, 5.0].map((k) => Math.sin(p + k));
  const bulk = 0.85 + sp.build * 0.5;
  const bodyY = 5 * u + Math.cos(p * 2) * 1.1 * u;
  const bone = sp.skin, boneL = shade(sp.skin, 0.74);
  const parts = [];
  const leg = (sx, sy, ex, ey, w, f) => parts.push({ p: (x) => capsule(x, sx, sy, ex, ey, w, w * 0.4), f });

  // splayed limbs, knees up: a low silhouette that cannot be confused with a
  // walker even at 30px
  leg(-6 * u, bodyY - 1 * u, -19 * u + ph[0] * 3 * u, bodyY - 9 * u + ph[0] * 3 * u, 2.6 * u, boneL);
  leg(6 * u, bodyY - 1 * u, 19 * u + ph[1] * 3 * u, bodyY - 9 * u + ph[1] * 3 * u, 2.6 * u, boneL);
  leg(-6 * u, bodyY + 3 * u, -17 * u + ph[2] * 3 * u, bodyY + 13 * u + ph[2] * 2 * u, 2.6 * u, boneL);
  leg(6 * u, bodyY + 3 * u, 17 * u + ph[3] * 3 * u, bodyY + 13 * u + ph[3] * 2 * u, 2.6 * u, boneL);
  parts.push({ p: (x) => blob(x, 0, bodyY + 1 * u, 10 * u * bulk, 7.6 * u * bulk, 0.1 + sp.tatter * 0.1, makeRng(sp.seed), 12), f: bone });
  parts.push({ p: (x) => capsule(x, 0, bodyY - 5 * u, 0, bodyY - 10 * u, 3.2 * u, 4.6 * u), f: bone });
  if (sp.extra.includes('jaw')) {
    parts.push({ p: (x) => { x.moveTo(-4.4 * u, bodyY - 11 * u); x.lineTo(4.4 * u, bodyY - 11 * u); x.lineTo(0, bodyY - 18 * u); x.closePath(); }, f: boneL });
  }
  paint(c, S, parts, sp, (x) => eyes(x, 0, bodyY - 10.5 * u, 0.95 * u, sp.accent, 1.9 * u));
}

function rigBloat(c, S, sp, t) {
  const u = S / 72, p = t * TAU;
  const pulse = 1 + Math.sin(p) * (0.045 + sp.tatter * 0.05);
  const bulk = (0.8 + sp.build * 0.6) * pulse;
  const sw = Math.sin(p);
  const cy = 2 * u + Math.cos(p * 2) * 1.4 * u;
  const parts = [];
  parts.push({ p: (x) => capsule(x, -6 * u, cy + 10 * u, -8 * u + sw * 3 * u, cy + 24 * u, 3.4 * u, 2.4 * u), f: sp.cloth });
  parts.push({ p: (x) => capsule(x, 6 * u, cy + 10 * u, 8 * u - sw * 3 * u, cy + 24 * u, 3.4 * u, 2.4 * u), f: sp.cloth });
  // A SAGGING gut, not a dome. Wider than it is tall, with its mass low and a
  // real neck and head above it: a symmetrical circle with a knob on top reads
  // as a mushroom, which is what the first pass looked like in a crowd.
  parts.push({ p: (x) => blob(x, 0, cy + 5 * u, 16 * u * bulk, 10.5 * u * bulk, 0.14 + sp.tatter * 0.12, makeRng(sp.seed), 14), f: sp.skin });
  // the neck, so the head is not sitting straight on the belly
  parts.push({ p: (x) => capsule(x, 0, cy - 6 * u, 0.6 * u * sw, cy - 12 * u, 2.6 * u, 2.2 * u), f: shade(sp.skin, 0.72) });
  parts.push({ p: (x) => { x.ellipse(0.6 * u * sw, cy - 15 * u, 5.0 * u, 4.6 * u, 0.12 * sw, 0, TAU); }, f: sp.skin });
  // arms hang forward off the mass and swing wide - the silhouette needs limbs
  parts.push({ p: (x) => capsule(x, -13 * u, cy - 1 * u, -18 * u + sw * 3 * u, cy + 15 * u, 2.8 * u, 1.7 * u), f: sp.skin });
  parts.push({ p: (x) => capsule(x, 13 * u, cy - 1 * u, 18 * u - sw * 3 * u, cy + 15 * u, 2.8 * u, 1.7 * u), f: sp.skin });
  paint(c, S, parts, sp, (x) => {
    // the splits: this is a body that is about to come apart
    x.strokeStyle = sp.accent; x.lineWidth = 1.6 * u; x.globalAlpha = 0.55 + sp.tatter * 0.35;
    const r = makeRng(sp.seed + 3);
    for (let i = 0; i < 4; i++) {
      const a = r.next() * TAU, d = (6 + r.next() * 7) * u;
      x.beginPath();
      x.moveTo(Math.cos(a) * d, cy + Math.sin(a) * d);
      x.lineTo(Math.cos(a + 0.5) * (d + 5 * u), cy + Math.sin(a + 0.5) * (d + 5 * u));
      x.stroke();
    }
    x.globalAlpha = 1;
    eyes(x, 0.6 * u * sw, cy - 15.5 * u, 0.9 * u, sp.accent, 2.0 * u);
  });
}

function rigHulk(c, S, sp, t) {
  const u = S / 80, p = t * TAU, sw = Math.sin(p), sw2 = Math.sin(p + Math.PI);
  const bulk = 1 + sp.build * 0.55;
  const bob = Math.cos(p * 2) * 2 * u;
  const shY = -6 * u + bob, hipY = 10 * u + bob;
  const shW = 17 * u * bulk;
  const parts = [];
  parts.push({ p: (x) => capsule(x, -shW * 0.8, shY, -shW * 1.15 + sw2 * 4 * u, hipY + 12 * u, 5 * u, 3.6 * u), f: sp.skin });
  parts.push({ p: (x) => capsule(x, -5 * u, hipY + 4 * u, -7 * u + sw * 4 * u, 30 * u, 5 * u, 3.4 * u), f: sp.cloth });
  parts.push({ p: (x) => capsule(x, 5 * u, hipY + 4 * u, 7 * u + sw2 * 4 * u, 30 * u, 5 * u, 3.4 * u), f: sp.cloth });
  parts.push({
    p: (x) => {
      x.moveTo(-shW, shY);
      x.quadraticCurveTo(-shW * 0.8, hipY, -9 * u, hipY + 6 * u);
      x.lineTo(9 * u, hipY + 6 * u);
      x.quadraticCurveTo(shW * 0.8, hipY, shW, shY);
      x.quadraticCurveTo(0, shY - 7 * u, -shW, shY);
      x.closePath();
    }, f: sp.skin,
  });
  // head sunk between the shoulders - the reason a hulk reads as a hulk
  parts.push({ p: (x) => { x.ellipse(0, shY - 3 * u, 4.6 * u, 4.2 * u, 0, 0, TAU); }, f: sp.skin });
  parts.push({ p: (x) => capsule(x, shW * 0.8, shY, shW * 1.2 + sw * 4 * u, hipY + 14 * u, 5.4 * u, 4 * u), f: sp.skin });
  if (sp.extra.includes('armour')) {
    parts.push({ p: (x) => { x.ellipse(-shW * 0.72, shY - 1 * u, 7 * u, 5 * u, -0.35, 0, TAU); }, f: '#5e636e' });
    parts.push({ p: (x) => { x.ellipse(shW * 0.72, shY - 1 * u, 7 * u, 5 * u, 0.35, 0, TAU); }, f: '#5e636e' });
  }
  paint(c, S, parts, sp, (x) => {
    eyes(x, 0, shY - 3 * u, 1.1 * u, sp.accent, 2 * u);
    x.fillStyle = sp.accent; x.globalAlpha = 0.3;
    x.beginPath(); x.ellipse(0, hipY - 2 * u, 4 * u, 6 * u, 0, 0, TAU); x.fill(); x.globalAlpha = 1;
  });
}

function rigWisp(c, S, sp, t) {
  const u = S / 56, p = t * TAU;
  const cy = -2 * u + Math.sin(p) * 2.4 * u;
  const r = makeRng(sp.seed);
  const parts = [];
  // a tail of rags instead of legs - it never touches the ground
  for (let i = 0; i < 4; i++) {
    const k = i / 3;
    const wob = Math.sin(p + i * 1.1) * (2 + i * 1.6) * u;
    parts.push({ p: (x) => capsule(x, wob * 0.4 + (i - 1.5) * 2.2 * u, cy + 4 * u, wob + (i - 1.5) * 3.4 * u, cy + (12 + k * 12) * u, 2.4 * u, 0.4 * u), f: sp.cloth, line: false });
  }
  parts.push({ p: (x) => blob(x, 0, cy, 7 * u * (0.7 + sp.build * 0.5), 8 * u * (0.7 + sp.build * 0.5), 0.14, r, 10), f: sp.skin });
  parts.push({ p: (x) => { x.ellipse(0, cy - 3 * u, 3.6 * u, 3.4 * u, 0, 0, TAU); }, f: sp.skin });
  paint(c, S, parts, sp, (x) => {
    x.fillStyle = sp.accent;
    x.globalAlpha = 0.9; x.beginPath(); x.arc(0, cy, 2.2 * u, 0, TAU); x.fill();
    x.globalAlpha = 0.3; x.beginPath(); x.arc(0, cy, 8 * u, 0, TAU); x.fill();
    x.globalAlpha = 0.14; x.beginPath(); x.arc(0, cy, 15 * u, 0, TAU); x.fill();
    x.globalAlpha = 1;
    eyes(x, 0, cy - 3 * u, 0.8 * u, sp.accent, 1.5 * u);
  });
}

function rigDemon(c, S, sp, t) {
  const u = S / 80, p = t * TAU;
  const cy = -4 * u + Math.sin(p) * 2.6 * u;
  const spread = 1 + Math.sin(p * 2) * 0.08;
  const bulk = 0.8 + sp.build * 0.5;
  const parts = [];
  // robe: a long cone, because a conductor must never look like it walks
  parts.push({
    p: (x) => {
      x.moveTo(-10 * u * bulk, cy + 2 * u);
      x.quadraticCurveTo(-15 * u, cy + 18 * u, -6 * u + Math.sin(p) * 3 * u, cy + 32 * u);
      x.quadraticCurveTo(0, cy + 27 * u, 6 * u + Math.sin(p) * 3 * u, cy + 32 * u);
      x.quadraticCurveTo(15 * u, cy + 18 * u, 10 * u * bulk, cy + 2 * u);
      x.closePath();
    }, f: sp.cloth,
  });
  // long conducting arms
  parts.push({ p: (x) => capsule(x, -9 * u, cy + 1 * u, -22 * u * spread, cy - 10 * u - Math.sin(p) * 4 * u, 2.6 * u, 1.2 * u), f: sp.skin });
  parts.push({ p: (x) => capsule(x, 9 * u, cy + 1 * u, 22 * u * spread, cy - 10 * u + Math.sin(p) * 4 * u, 2.6 * u, 1.2 * u), f: sp.skin });
  parts.push({
    p: (x) => {
      x.moveTo(-10 * u * bulk, cy + 3 * u);
      x.quadraticCurveTo(-8 * u, cy - 8 * u, 0, cy - 10 * u);
      x.quadraticCurveTo(8 * u, cy - 8 * u, 10 * u * bulk, cy + 3 * u);
      x.closePath();
    }, f: sp.skin,
  });
  parts.push({ p: (x) => { x.ellipse(0, cy - 13 * u, 5 * u, 5.4 * u, 0, 0, TAU); }, f: sp.skin });
  parts.push({ p: (x) => capsule(x, -4 * u, cy - 16 * u, -11 * u, cy - 26 * u, 2.2 * u, 0.4 * u), f: sp.skin, line: false });
  parts.push({ p: (x) => capsule(x, 4 * u, cy - 16 * u, 11 * u, cy - 26 * u, 2.2 * u, 0.4 * u), f: sp.skin, line: false });
  paint(c, S, parts, sp, (x) => {
    eyes(x, 0, cy - 13 * u, 1.2 * u, sp.accent, 2.2 * u);
    x.strokeStyle = sp.accent; x.lineWidth = 1.4 * u; x.globalAlpha = 0.6;
    x.beginPath(); x.ellipse(0, cy - 24 * u, 9 * u, 3 * u, 0, 0, TAU); x.stroke();   // halo
    x.globalAlpha = 0.25; x.lineWidth = 4 * u; x.stroke(); x.globalAlpha = 1;
    x.fillStyle = sp.accent; x.globalAlpha = 0.8;
    x.beginPath(); x.arc(-22 * u * spread, cy - 10 * u - Math.sin(p) * 4 * u, 1.6 * u, 0, TAU); x.fill();
    x.beginPath(); x.arc(22 * u * spread, cy - 10 * u + Math.sin(p) * 4 * u, 1.6 * u, 0, TAU); x.fill();
    x.globalAlpha = 1;
  });
}

function rigBoss(c, S, sp, t) {
  const u = S / 128, p = t * TAU;
  const cy = 4 * u + Math.sin(p) * 3 * u;
  const sw = Math.sin(p);
  const bulk = 1 + sp.build * 0.4;
  const parts = [];
  // cloak: the widest thing on screen, so the boss reads at a glance
  parts.push({
    p: (x) => {
      x.moveTo(-20 * u * bulk, cy - 12 * u);
      x.quadraticCurveTo(-40 * u - sw * 4 * u, cy + 14 * u, -26 * u, cy + 46 * u);
      x.quadraticCurveTo(0, cy + 36 * u, 26 * u, cy + 46 * u);
      x.quadraticCurveTo(40 * u + sw * 4 * u, cy + 14 * u, 20 * u * bulk, cy - 12 * u);
      x.closePath();
    }, f: sp.cloth,
  });
  for (let i = 0; i < 3; i++) {
    const a = -0.6 - i * 0.55 + sw * 0.12;
    const L = (30 + i * 5) * u;
    parts.push({ p: (x) => capsule(x, -14 * u, cy - 6 * u + i * 5 * u, -14 * u + Math.cos(Math.PI + a) * L, cy - 6 * u + i * 5 * u + Math.sin(Math.PI + a) * L, 3 * u, 1 * u), f: sp.skin, line: false });
    parts.push({ p: (x) => capsule(x, 14 * u, cy - 6 * u + i * 5 * u, 14 * u - Math.cos(Math.PI + a) * L, cy - 6 * u + i * 5 * u + Math.sin(Math.PI + a) * L, 3 * u, 1 * u), f: sp.skin, line: false });
  }
  parts.push({
    p: (x) => {
      x.moveTo(-16 * u * bulk, cy - 10 * u);
      x.quadraticCurveTo(-13 * u, cy + 14 * u, 0, cy + 18 * u);
      x.quadraticCurveTo(13 * u, cy + 14 * u, 16 * u * bulk, cy - 10 * u);
      x.quadraticCurveTo(0, cy - 20 * u, -16 * u * bulk, cy - 10 * u);
      x.closePath();
    }, f: sp.skin,
  });
  parts.push({ p: (x) => { x.ellipse(0, cy - 24 * u, 8 * u, 8.6 * u, 0, 0, TAU); }, f: sp.skin });
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i - 2) * 0.42;
    parts.push({ p: (x) => capsule(x, Math.cos(a) * 7 * u, cy - 27 * u + Math.sin(a) * 7 * u, Math.cos(a) * 20 * u, cy - 27 * u + Math.sin(a) * 20 * u, 2.4 * u, 0.4 * u), f: sp.skin, line: false });
  }
  paint(c, S, parts, sp, (x) => {
    eyes(x, 0, cy - 24 * u, 1.8 * u, sp.accent, 3.2 * u);
    x.strokeStyle = sp.accent; x.globalAlpha = 0.5; x.lineWidth = 2 * u;
    x.beginPath(); x.ellipse(0, cy - 40 * u, 16 * u, 5 * u, 0, 0, TAU); x.stroke();
    x.globalAlpha = 0.2; x.lineWidth = 7 * u; x.stroke(); x.globalAlpha = 1;
  });
}

function rigPlayer(c, S, sp, t) {
  const u = S / 64, p = t * TAU;
  const swA = Math.sin(p), swB = Math.sin(p + Math.PI);
  const bob = Math.cos(p * 2) * 1.2 * u;
  const bone = sp.skin, boneL = shade(sp.skin, 0.78);
  const headR = 5.8 * u, headY = -19 * u + bob;
  const shY = -11 * u + bob, hipY = 4 * u + bob;
  const shW = 9.0 * u, waW = 6.4 * u;
  const legTop = hipY + 1 * u, legLen = 18 * u;
  const bkx = -3.2 * u + swB * 5 * u, bky = legTop + legLen - Math.abs(swB) * 2.4 * u;
  const frx = 3.2 * u + swA * 5 * u, fry = legTop + legLen - Math.abs(swA) * 2.4 * u;
  const parts = [];

  parts.push({ p: (x) => capsule(x, -shW * 0.86, shY + 1.5 * u, -shW - 2.4 * u + swB * 3.2 * u, hipY + 7 * u, 2.6 * u, 1.9 * u), f: shade(sp.cloth, 1.5) });
  parts.push({ p: (x) => capsule(x, -2.9 * u, legTop, bkx, bky, 3.0 * u, 2.2 * u), f: shade(sp.cloth, 1.6) });
  parts.push({ p: (x) => { x.ellipse(bkx - 0.4 * u, bky + 1.2 * u, 3.0 * u, 1.9 * u, 0, 0, TAU); }, f: sp.cloth });
  parts.push({ p: (x) => capsule(x, 2.9 * u, legTop, frx, fry, 3.1 * u, 2.3 * u), f: shade(sp.cloth, 1.9) });
  parts.push({ p: (x) => { x.ellipse(frx + 0.4 * u, fry + 1.2 * u, 3.1 * u, 2.0 * u, 0, 0, TAU); }, f: sp.cloth });

  // a coat, not rags: the player must never be mistaken for the horde
  parts.push({
    p: (x) => {
      x.moveTo(-shW, shY);
      x.bezierCurveTo(-shW * 1.04, shY + 7 * u, -waW * 1.5, hipY + 4 * u, -waW * 1.5, hipY + 12 * u);
      x.lineTo(waW * 1.5, hipY + 12 * u);
      x.bezierCurveTo(waW * 1.5, hipY + 4 * u, shW * 1.04, shY + 7 * u, shW, shY);
      x.quadraticCurveTo(0, shY - 4.4 * u, -shW, shY);
      x.closePath();
    }, f: sp.cloth,
  });
  parts.push({ p: (x) => { x.moveTo(-2.6 * u, shY - 1 * u); x.lineTo(2.6 * u, shY - 1 * u); x.lineTo(1.8 * u, hipY + 11 * u); x.lineTo(-1.8 * u, hipY + 11 * u); x.closePath(); }, f: bone });
  parts.push({ p: (x) => capsule(x, 0, shY - 1.5 * u, 0, headY + 4 * u, 2.1 * u, 2.5 * u), f: boneL });
  parts.push({ p: (x) => { x.ellipse(0, headY, headR * 0.92, headR, 0, 0, TAU); }, f: bone });
  parts.push({ p: (x) => { x.ellipse(0, headY - 3.6 * u, 9.4 * u, 3.0 * u, 0, 0, TAU); }, f: sp.cloth });
  parts.push({ p: (x) => { x.ellipse(0, headY - 6.2 * u, 5.0 * u, 3.4 * u, 0, 0, TAU); }, f: shade(sp.cloth, 1.4) });
  const handX = shW + 3.2 * u + swA * 3.2 * u, handY = hipY + 8 * u;
  parts.push({ p: (x) => capsule(x, shW * 0.86, shY + 1.5 * u, handX, handY, 2.8 * u, 2.0 * u), f: bone });

  paint(c, S, parts, sp, (x) => {
    // the lamp: the only warm light in the game, and the player's read at a glance
    x.fillStyle = sp.accent;
    x.globalAlpha = 0.95; x.beginPath(); x.arc(handX, handY + 3 * u, 2.0 * u, 0, TAU); x.fill();
    x.globalAlpha = 0.28; x.beginPath(); x.arc(handX, handY + 3 * u, 7 * u, 0, TAU); x.fill();
    x.globalAlpha = 0.1; x.beginPath(); x.arc(handX, handY + 3 * u, 15 * u, 0, TAU); x.fill();
    x.globalAlpha = 1;
    eyes(x, 0, headY + 0.6 * u, 0.85 * u, sp.accent, 1.9 * u);
  });
}

const RIGS = {
  humanoid: rigHumanoid, crawler: rigCrawler, bloat: rigBloat, hulk: rigHulk,
  wisp: rigWisp, demon: rigDemon, boss: rigBoss, player: rigPlayer,
};

// ------------------------------------------------------------ non-rig art

function bakeParticles() {
  // soft radial glow - the workhorse of every additive effect
  const soft = (size, key, pow) => {
    const r = place(size, size);
    const g = ctx.createRadialGradient(r.x + size / 2, r.y + size / 2, 0, r.x + size / 2, r.y + size / 2, size / 2);
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      g.addColorStop(t, `rgba(255,255,255,${Math.pow(1 - t, pow).toFixed(4)})`);
    }
    ctx.fillStyle = g; ctx.fillRect(r.x, r.y, size, size);
    addFrame(key, r.x, r.y, size, size);
  };
  soft(96, 'glow', 2.4);
  soft(64, 'glow.tight', 4.5);
  soft(128, 'glow.wide', 1.7);
  soft(24, 'spark', 3.0);

  // a soft-edged band, sampled across v: this is what makes a line look lit
  {
    const s = 32, r = place(s, s);
    const g = ctx.createLinearGradient(0, r.y, 0, r.y + s);
    for (let i = 0; i <= 16; i++) {
      const t = i / 16, a = Math.pow(Math.max(0, 1 - Math.abs(t - 0.5) * 2), 1.9);
      g.addColorStop(t, `rgba(255,255,255,${a.toFixed(4)})`);
    }
    ctx.fillStyle = g; ctx.fillRect(r.x, r.y, s, s);
    addFrame('linegrad', r.x, r.y, s, s);
  }

  // solid white, used as the UV for every untextured quad and line core
  {
    const s = 8, r = place(s, s);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(r.x, r.y, s, s);
    addFrame('white', r.x, r.y, s, s);
  }

  // smoke: several soft blobs so it is not a perfect circle
  {
    const s = 64, r = place(s, s), rng = makeRng(77);
    ctx.save(); ctx.translate(r.x + s / 2, r.y + s / 2);
    for (let i = 0; i < 7; i++) {
      const a = rng.next() * TAU, d = rng.next() * 11, rad = 9 + rng.next() * 11;
      const g = ctx.createRadialGradient(Math.cos(a) * d, Math.sin(a) * d, 0, Math.cos(a) * d, Math.sin(a) * d, rad);
      g.addColorStop(0, 'rgba(255,255,255,0.34)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(-s / 2, -s / 2, s, s);
    }
    ctx.restore();
    addFrame('smoke', r.x, r.y, s, s);
  }

  // shockwave ring
  {
    const s = 128, r = place(s, s);
    ctx.save(); ctx.translate(r.x + s / 2, r.y + s / 2);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, s / 2);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.72, 'rgba(255,255,255,0.05)');
    g.addColorStop(0.88, 'rgba(255,255,255,1)');
    g.addColorStop(0.96, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(-s / 2, -s / 2, s, s);
    ctx.restore();
    addFrame('ring', r.x, r.y, s, s);
  }

  // slash: a tapered crescent, drawn along +x
  {
    const w = 96, h = 40, r = place(w, h);
    ctx.save(); ctx.translate(r.x, r.y);
    ctx.beginPath();
    ctx.moveTo(2, h / 2);
    ctx.quadraticCurveTo(w * 0.4, 2, w - 2, h * 0.34);
    ctx.quadraticCurveTo(w * 0.45, h * 0.4, 2, h / 2);
    ctx.closePath();
    ctx.fillStyle = '#ffffff'; ctx.fill();
    ctx.filter = 'blur(1.5px)'; ctx.fill(); ctx.filter = 'none';
    ctx.restore();
    addFrame('cut', r.x, r.y, w, h);
  }

  // a thin vertical taper for thread snaps and trails
  {
    const w = 16, h = 64, r = place(w, h);
    ctx.save(); ctx.translate(r.x, r.y);
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(w / 2 - 3, 0); ctx.lineTo(w / 2 + 3, 0); ctx.lineTo(w / 2, h); ctx.closePath(); ctx.fill();
    ctx.restore();
    addFrame('trail', r.x, r.y, w, h, w / 2, 0);
  }
}

function bakeGround() {
  // Wet black street. Four variants, hashed by tile coordinate so the ground
  // never visibly repeats at a 2-tile pitch.
  for (let v = 0; v < 4; v++) {
    const s = 64, r = place(s, s), rng = makeRng(400 + v * 131);
    ctx.save();
    ctx.beginPath(); ctx.rect(r.x, r.y, s, s); ctx.clip();
    ctx.translate(r.x, r.y);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, s, s);
    // grain
    ctx.globalAlpha = 0.14;
    for (let i = 0; i < 150; i++) {
      ctx.fillStyle = rng.next() > 0.5 ? '#000000' : '#b8c8e0';
      ctx.fillRect(rng.next() * s, rng.next() * s, 1 + rng.next() * 2, 1 + rng.next());
    }
    // slab seams
    ctx.globalAlpha = 0.22; ctx.strokeStyle = '#000000'; ctx.lineWidth = 1.5;
    if (v < 2) {
      ctx.beginPath();
      ctx.moveTo(0, s * (0.3 + v * 0.4)); ctx.lineTo(s, s * (0.3 + v * 0.4) + (rng.next() - 0.5) * 4);
      ctx.moveTo(s * (0.45 + v * 0.2), 0); ctx.lineTo(s * (0.45 + v * 0.2) + (rng.next() - 0.5) * 4, s);
      ctx.stroke();
    }
    // puddle sheen
    if (v === 2 || v === 3) {
      ctx.globalAlpha = 0.40;
      const g = ctx.createRadialGradient(s * 0.5, s * 0.55, 2, s * 0.5, s * 0.55, s * 0.5);
      g.addColorStop(0, '#9fd0ff'); g.addColorStop(1, 'rgba(159,208,255,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    addFrame('ground', r.x, r.y, s, s);
  }

  // a soft blot used for grime/decals on top of the tiles
  {
    const s = 64, r = place(s, s), rng = makeRng(981);
    ctx.save(); ctx.translate(r.x + s / 2, r.y + s / 2);
    for (let i = 0; i < 5; i++) {
      const a = rng.next() * TAU, d = rng.next() * 10;
      const g = ctx.createRadialGradient(Math.cos(a) * d, Math.sin(a) * d, 0, Math.cos(a) * d, Math.sin(a) * d, 10 + rng.next() * 14);
      g.addColorStop(0, 'rgba(255,255,255,0.28)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(-s / 2, -s / 2, s, s);
    }
    ctx.restore();
    addFrame('decal', r.x, r.y, s, s);
  }

  // soft ellipse drop shadow
  {
    const s = 64, r = place(s, s);
    ctx.save(); ctx.translate(r.x + s / 2, r.y + s / 2); ctx.scale(1, 0.5);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, s / 2);
    g.addColorStop(0, 'rgba(255,255,255,0.85)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(-s / 2, -s, s, s * 2);
    ctx.restore();
    addFrame('shadow', r.x, r.y, s, s);
  }
}

function bakePickups() {
  const gem = (s, key) => {
    const r = place(s, s);
    ctx.save(); ctx.translate(r.x + s / 2, r.y + s / 2);
    const k = s * 0.32;
    const path = (c) => { c.beginPath(); c.moveTo(0, -k * 1.5); c.lineTo(k, -k * 0.2); c.lineTo(0, k * 1.5); c.lineTo(-k, -k * 0.2); c.closePath(); };
    path(ctx); ctx.fillStyle = DARK; ctx.lineWidth = 4; ctx.strokeStyle = DARK; ctx.stroke(); ctx.fill();
    path(ctx); ctx.fillStyle = '#ffffff'; ctx.fill();
    ctx.globalCompositeOperation = 'source-atop';
    const g = ctx.createLinearGradient(-k, -k, k, k);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.5, 'rgba(150,180,220,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0.9)');
    ctx.fillStyle = g; ctx.fillRect(-s / 2, -s / 2, s, s);
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
    addFrame(key, r.x, r.y, s, s);
  };
  gem(20, 'shard'); gem(28, 'shard'); gem(40, 'shard');

  const icon = (s, key, draw) => {
    const r = place(s, s);
    ctx.save(); ctx.translate(r.x + s / 2, r.y + s / 2);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.strokeStyle = DARK; ctx.lineWidth = 5; ctx.fillStyle = DARK;
    draw(ctx, s, true);
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
    draw(ctx, s, false);
    ctx.restore();
    addFrame(key, r.x, r.y, s, s);
  };

  icon(32, 'heart', (c, s, under) => {
    const k = s * 0.3;
    c.beginPath();
    c.moveTo(0, k * 0.9);
    c.bezierCurveTo(-k * 1.6, -k * 0.3, -k * 0.8, -k * 1.4, 0, -k * 0.5);
    c.bezierCurveTo(k * 0.8, -k * 1.4, k * 1.6, -k * 0.3, 0, k * 0.9);
    c.closePath();
    if (under) c.stroke();
    c.fill();
  });

  icon(40, 'chest', (c, s, under) => {
    const w = s * 0.34, h = s * 0.24;
    c.beginPath(); c.rect(-w, -h * 0.2, w * 2, h * 1.6);
    if (under) c.stroke();
    c.fill();
    c.beginPath(); c.moveTo(-w, -h * 0.2); c.quadraticCurveTo(0, -h * 2.1, w, -h * 0.2); c.closePath();
    if (under) c.stroke();
    c.fill();
    if (!under) { c.fillStyle = '#2a2f3a'; c.beginPath(); c.rect(-w * 0.16, -h * 0.5, w * 0.32, h * 1.1); c.fill(); c.fillStyle = '#ffffff'; }
  });

  icon(24, 'coin', (c, s, under) => {
    c.beginPath(); c.ellipse(0, 0, s * 0.28, s * 0.32, 0, 0, TAU);
    if (under) c.stroke();
    c.fill();
  });

  icon(32, 'magnet', (c, s, under) => {
    const k = s * 0.28;
    c.beginPath();
    c.arc(0, k * 0.2, k, Math.PI, 0);
    c.lineTo(k * 0.5, k * 0.2); c.arc(0, k * 0.2, k * 0.5, 0, Math.PI, true);
    c.closePath();
    if (under) c.stroke();
    c.fill();
  });

  icon(32, 'bomb', (c, s, under) => {
    const k = s * 0.26;
    c.beginPath(); c.arc(0, k * 0.3, k, 0, TAU);
    if (under) c.stroke();
    c.fill();
    c.beginPath(); c.moveTo(k * 0.4, -k * 0.55); c.quadraticCurveTo(k * 1.2, -k * 1.4, k * 0.3, -k * 1.8);
    c.lineWidth = under ? 5 : 2.4; c.stroke();
  });

  icon(28, 'skull', (c, s, under) => {
    const k = s * 0.26;
    c.beginPath(); c.ellipse(0, -k * 0.2, k, k * 0.95, 0, 0, TAU);
    c.rect(-k * 0.5, k * 0.4, k, k * 0.6);
    if (under) c.stroke();
    c.fill();
    if (!under) { c.fillStyle = '#1a1f28'; c.beginPath(); c.arc(-k * 0.4, -k * 0.2, k * 0.26, 0, TAU); c.arc(k * 0.4, -k * 0.2, k * 0.26, 0, TAU); c.fill(); c.fillStyle = '#ffffff'; }
  });

  icon(28, 'soul', (c, s, under) => {
    const k = s * 0.25;
    c.beginPath();
    c.moveTo(0, -k * 1.3);
    c.quadraticCurveTo(k * 1.1, -k * 0.2, 0, k * 1.3);
    c.quadraticCurveTo(-k * 1.1, -k * 0.2, 0, -k * 1.3);
    c.closePath();
    if (under) c.stroke();
    c.fill();
  });

  icon(28, 'clock', (c, s, under) => {
    const k = s * 0.28;
    c.beginPath(); c.arc(0, 0, k, 0, TAU);
    if (under) { c.stroke(); c.fill(); return; }
    c.lineWidth = 2.6; c.stroke();
    c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -k * 0.6); c.moveTo(0, 0); c.lineTo(k * 0.45, k * 0.2); c.stroke();
  });

  icon(28, 'star', (c, s, under) => {
    const k = s * 0.3;
    c.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? k * 0.44 : k;
      i ? c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : c.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    c.closePath();
    if (under) c.stroke();
    c.fill();
  });

  icon(28, 'scissors', (c, s, under) => {
    const k = s * 0.28;
    c.lineWidth = under ? 6 : 2.6;
    c.beginPath();
    c.moveTo(-k, -k); c.lineTo(k * 0.5, k * 0.5);
    c.moveTo(k, -k); c.lineTo(-k * 0.5, k * 0.5);
    c.stroke();
    c.beginPath(); c.arc(-k * 0.75, k * 0.85, k * 0.32, 0, TAU); c.arc(k * 0.75, k * 0.85, k * 0.32, 0, TAU);
    c.stroke();
  });
}

function bakeProjectiles() {
  const P = (w, h, key, draw, frames = 1) => {
    for (let f = 0; f < frames; f++) {
      const r = place(w, h);
      ctx.save(); ctx.translate(r.x + w / 2, r.y + h / 2);
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.strokeStyle = DARK; ctx.lineWidth = 5; ctx.fillStyle = DARK;
      draw(ctx, w, h, f / frames, true);
      ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
      draw(ctx, w, h, f / frames, false);
      ctx.restore();
      addFrame(key, r.x, r.y, w, h);
    }
  };

  P(40, 16, 'proj.blade', (c, w, h, t, u) => {
    c.beginPath();
    c.moveTo(-w * 0.42, 0); c.quadraticCurveTo(0, -h * 0.42, w * 0.46, 0);
    c.quadraticCurveTo(0, h * 0.42, -w * 0.42, 0); c.closePath();
    if (u) c.stroke();
    c.fill();
  });

  P(20, 10, 'proj.bullet', (c, w, h, t, u) => {
    c.beginPath();
    c.moveTo(w * 0.45, 0); c.quadraticCurveTo(0, -h * 0.45, -w * 0.42, 0);
    c.quadraticCurveTo(0, h * 0.45, w * 0.45, 0); c.closePath();
    if (u) c.stroke();
    c.fill();
  });

  P(40, 40, 'proj.saw', (c, w, h, t, u) => {
    const k = w * 0.34, rot = t * TAU / 6;
    c.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = rot + i * TAU / 6;
      c.lineTo(Math.cos(a) * k * 1.32, Math.sin(a) * k * 1.32);
      c.lineTo(Math.cos(a + 0.38) * k, Math.sin(a + 0.38) * k);
    }
    c.closePath();
    if (u) c.stroke();
    c.fill();
    if (!u) { c.fillStyle = '#20252f'; c.beginPath(); c.arc(0, 0, k * 0.35, 0, TAU); c.fill(); }
  }, 4);

  P(48, 48, 'proj.bell', (c, w, h, t, u) => {
    c.lineWidth = u ? 7 : 3;
    c.beginPath(); c.arc(0, 0, w * 0.36, 0, TAU); c.stroke();
    if (!u) { c.globalAlpha = 0.4; c.lineWidth = 1.6; c.beginPath(); c.arc(0, 0, w * 0.46, 0, TAU); c.stroke(); c.globalAlpha = 1; }
  });

  P(24, 40, 'proj.candle', (c, w, h, t, u) => {
    c.beginPath();
    c.moveTo(0, -h * 0.44);
    c.quadraticCurveTo(w * 0.34, 0, 0, h * 0.42);
    c.quadraticCurveTo(-w * 0.34, 0, 0, -h * 0.44);
    c.closePath();
    if (u) c.stroke();
    c.fill();
  });

  P(28, 8, 'proj.nail', (c, w, h, t, u) => {
    c.beginPath();
    c.moveTo(w * 0.46, 0); c.lineTo(-w * 0.3, -h * 0.4); c.lineTo(-w * 0.46, 0); c.lineTo(-w * 0.3, h * 0.4);
    c.closePath();
    if (u) c.stroke();
    c.fill();
  });

  P(44, 44, 'proj.bloom', (c, w, h, t, u) => {
    const k = w * 0.2 * (1 + t * 0.5);
    for (let i = 0; i < 5; i++) {
      const a = i * TAU / 5 + t * 0.8;
      c.beginPath(); c.ellipse(Math.cos(a) * k, Math.sin(a) * k, k * 0.8, k * 0.5, a, 0, TAU);
      if (u) c.stroke();
      c.fill();
    }
  }, 4);

  P(28, 28, 'proj.orb', (c, w, h, t, u) => {
    c.beginPath(); c.arc(0, 0, w * 0.3, 0, TAU);
    if (u) c.stroke();
    c.fill();
    if (!u) { c.globalAlpha = 0.35; c.beginPath(); c.arc(0, 0, w * 0.46, 0, TAU); c.fill(); c.globalAlpha = 1; }
  });
}

function bakeFont() {
  const SIZE = 40, PADX = 3;
  // Condensed geometric sans, with a dark halo so it reads on any ground.
  const stack = '600 40px "Avenir Next Condensed", "Roboto Condensed", "Oswald", "Helvetica Neue", Arial, sans-serif';
  const adv = new Float32Array(128);
  ctx.font = stack;
  ctx.textBaseline = 'alphabetic';
  const ascent = 30, descent = 11, cellH = ascent + descent + PADX * 2;
  const SQUEEZE = 0.86;

  for (let code = 32; code <= 126; code++) {
    const ch = String.fromCharCode(code);
    ctx.font = stack;
    const a = ctx.measureText(ch).width * SQUEEZE;
    adv[code] = a;
    const cw = Math.ceil(a) + PADX * 2;
    const r = place(cw, cellH);
    ctx.save();
    ctx.translate(r.x + PADX, r.y + PADX + ascent);
    ctx.scale(SQUEEZE, 1);
    ctx.font = stack;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(0,0,0,0.9)'; ctx.lineWidth = 5;
    ctx.strokeText(ch, 0, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(ch, 0, 0);
    ctx.restore();
    addFrame('font.' + code, r.x, r.y, cw, cellH, PADX, PADX + ascent);
  }
  FONT = { size: SIZE, ascent, descent, lineHeight: cellH, adv, first: 32, last: 126 };
}

// ------------------------------------------------------------------ build

/** Build (or return the cached) atlas. Called once by the renderer at boot. */
export function buildAtlas() {
  if (BUILT) return BUILT;
  const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());

  canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  ctx = canvas.getContext('2d', { alpha: true, willReadFrequently: false });
  ctx.clearRect(0, 0, W, H);

  bakeParticles();
  bakeGround();
  bakePickups();
  bakeProjectiles();

  for (const rig of Object.keys(VARIANTS)) {
    const n = VARIANTS[rig], S = CELL[rig], nf = NFRAMES[rig], fn = RIGS[rig];
    for (let v = 0; v < n; v++) {
      const sp = specFor(rig, v);
      sp.seed = 77 + v * 313 + rig.length * 17;
      for (let f = 0; f < nf; f++) cell(rig + '.' + v, S, (c, s) => fn(c, s, sp, f / nf));
    }
  }
  for (const alias of Object.keys(ALIASES)) {
    const src = KEYS.get(ALIASES[alias]);
    if (src) KEYS.set(alias, { id: src.id, n: src.n });
  }

  bakeFont();

  const occupancy = USED / (W * H);
  const ms = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;

  // frames is the renderer's index table; `data` is the flat form it actually reads.
  const frames = LIST;
  frames.data = DATA;
  frames.count = COUNT;
  frames.keys = KEYS;

  BUILT = {
    texCanvas: canvas, frames, data: DATA, count: COUNT, keys: KEYS,
    font: FONT, width: W, height: H, occupancy, ms,
  };
  ctx = null;
  console.log(`[atlas] ${COUNT} frames, ${(occupancy * 100).toFixed(1)}% of ${W}x${H} used, ${ms.toFixed(0)}ms`);
  return BUILT;
}

export function getAtlas() { return BUILT; }
export function atlasFont() { return FONT; }
