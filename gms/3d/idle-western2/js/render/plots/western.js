// Shared western dressing for the business plots (lane P). Plot-local space: x across the 24 m frontage, +z toward the
// street (road starts at z ≈ 3.5), y up. Building fronts sit near z ≈ 0.9 with a raised porch out to z ≈ 3.3.
// Every helper writes into a builder (b), so a plot stays one merged static mesh per tier.
import * as THREE from 'three';
import { CROWD_K } from '../kit/crowd.js?v=20261004c';
export { CROWD_K };

// Look A palette (docs/ART_DIRECTION.md §3). Plots pass these as `colors`, so they don't depend on the town palette.
export const COLORS = {
  barn: '#B5483A', teal: '#5E8F8C', mustard: '#D9A441', sage: '#8FA27A', rose: '#C98B7E', cream: '#EAD9B8',
  plank: '#A8714A', plank2: '#8E5C3C', plank3: '#6E452D', raw: '#B88B60', raw2: '#7A5236',
  tin: { c: '#8A8F93', r: 0.45, m: 0.35 }, rust: '#A86B4A', ink: '#3a2c2c', soot: '#2e2630',
  dust: '#F3E2C4', dirtL: '#E8B888', dirtM: '#D49A6A', rut: '#B97B52',
  cactus: '#6E9B57', cactus2: '#4E7A45', rockN: '#C5653F',
  brass: { c: '#D9A84A', r: 0.3, m: 0.8 }, gold: { c: '#FFD27A', r: 0.25, m: 0.9 }, ownTeal: '#3f8f8a',
  glass: { c: '#e8842e', r: 0.3, g: 0.3 }, glassN: { c: '#ffb45a', r: 0.2, g: -1.2 }, sil: { c: '#5a2e26', r: 0.9 }, interior: { c: '#ffb860', r: 0.6, g: 0.22 }, lantern: { c: '#FFC978', r: 0.3, g: 1.1 },
  lanternN: { c: '#ffb45a', r: 0.3, g: -1.6 }, star: { c: '#FFE45C', r: 0.4, g: 1.4 }, spark: { c: '#ffd36a', r: 0.4, g: 2.6 },
  hay: '#E3BE62', hay2: '#C99D45', iron: { c: '#4a4446', r: 0.5, m: 0.5 }, steam: '#f6efe6', water: { c: '#8cb8b4', r: 0.12 },
  pinkL: { c: '#ff8fb4', r: 0.35, g: 0.7 }, rope: '#d9c08a', canvas: '#efe2c6', bone: '#efe6d2',
};

const _col = new THREE.Color();
export function tone(hex, k) {
  _col.set(hex);
  return [Math.min(1, _col.r * k), Math.min(1, _col.g * k), Math.min(1, _col.b * k)];
}
const slotHex = (b, slot) => {
  const v = typeof slot === 'string' && slot[0] !== '#' ? b.palette[slot] : slot;
  return v && typeof v === 'object' && !Array.isArray(v) ? v.c : v;
};

// A wall face of horizontal planks (front plane at z, facing +z unless ry). Alternating ±5% value per plank.
export function planks(b, slot, x, y, z, w, h, o = {}) {
  const n = Math.max(2, Math.round(h / (o.ph ?? 0.32)));
  const ph = h / n, hex = slotHex(b, slot);
  for (let i = 0; i < n; i++) {
    const k = 1 + ((i * 7) % 3 - 1) * 0.05 + (i % 2 ? -0.02 : 0.02);
    b.slab(tone(hex, k), x, y + i * ph, z, w + (i % 3 === 1 ? 0.06 : 0), ph * 0.92, o.t ?? 0.12, { round: 0.03, taper: 0, ry: o.ry || 0, parent: o.parent, noAo: o.noAo });
  }
  return b;
}

// Vertical board-and-batten face.
export function battens(b, slot, x, y, z, w, h, o = {}) {
  const n = Math.max(2, Math.round(w / (o.pw ?? 0.42)));
  const pw = w / n, hex = slotHex(b, slot), c = Math.cos(o.ry || 0), s = Math.sin(o.ry || 0);
  for (let i = 0; i < n; i++) {
    const lx = -w / 2 + pw * (i + 0.5), k = 1 + ((i * 5) % 3 - 1) * 0.05;
    b.slab(tone(hex, k), x + lx * c, y, z - lx * s, pw * 0.94, h + ((i * 3) % 4 === 1 ? -0.08 : 0), o.t ?? 0.12, { round: 0.03, taper: 0, ry: o.ry || 0 });
  }
  return b;
}

// Parapet silhouette on top of a false front: 'flat' | 'stepped' | 'arched' | 'gabled' | 'peak'.
export function parapet(b, slot, x, y, z, w, kind = 'stepped', o = {}) {
  const t = o.t ?? 0.3, trim = o.trim ?? 'cream';
  if (kind === 'stepped') {
    b.slab(slot, x, y, z, w * 0.62, 0.7, t, { round: 0.05, taper: 0 });
    b.slab(slot, x, y + 0.7, z, w * 0.3, 0.55, t, { round: 0.05, taper: 0 });
    b.slab(trim, x, y + 0.66, z + 0.02, w * 0.66, 0.12, t + 0.12, { round: 0.03, taper: 0 });
    b.slab(trim, x, y + 1.22, z + 0.02, w * 0.34, 0.12, t + 0.12, { round: 0.03, taper: 0 });
  } else if (kind === 'arched') {
    b.cyl(slot, x, y - 0.2, z - t / 2, w * 0.36, t, 0, { sides: 15, taper: 1, rx: Math.PI / 2, sz: w * 0.36 * 0.5 });
    b.cyl(trim, x, y - 0.2, z - t / 2 - 0.12, w * 0.37, t + 0.05, 0, { sides: 15, taper: 1, rx: Math.PI / 2, sz: w * 0.37 * 0.55 + 0.12, sy: t + 0.05 });
  } else if (kind === 'gabled') {
    b.add(b.shape.gable(w * 0.8, t, 1.1, { over: 0, sag: 0 }), slot, { x, y, z: z });
    b.add(b.shape.gable(w * 0.84, t + 0.1, 0.12, { over: 0, sag: 0 }), trim, { x, y: y + 1.0, z, sy: 1 });
  } else if (kind === 'peak') {
    b.slab(slot, x, y, z, w * 0.4, 0.9, t, { round: 0.05, taper: 0.35 });
    b.ball(trim, x, y + 0.95, z, 0.22, { detail: 0 });
  }
  return b;
}

// The workhorse: a false-front shop. o: { x, fz (front plane z), w, d, h (wall height), fh (front height),
// wall, front, trim, roof, parapet, door: false|x offset, windows: [dx...], lean }
// Returns geometry anchors for the caller: { fz, top, signY, doorX }.
export function falseFront(b, o) {
  const x = o.x ?? 0, fz = o.fz ?? 0.9, w = o.w ?? 8, d = o.d ?? 5.5, h = o.h ?? 3.4, fh = o.fh ?? h + 2;
  const wall = o.wall ?? 'raw', front = o.front ?? 'barn', trim = o.trim ?? 'cream', roof = o.roof ?? 'tin';
  const bz = fz - d / 2;
  b.slab('plank3', x, 0, bz, w + 0.3, 0.32, d + 0.2, { round: 0.06, taper: 0 });
  b.slab(wall, x, 0.25, bz - 0.1, w - 0.2, h - 0.25, d - 0.3, { round: 0.1, taper: 0.015 });
  b.roof(roof, x, h - 0.05, bz - 0.15, w - 0.1, 0.9, d - 0.3, 0, { over: 0.2 });
  b.slab(front, x, 0.25, fz - 0.14, w, fh - 0.25, 0.3, { round: 0.06, taper: 0 });
  planks(b, front, x, 0.3, fz + 0.04, w - 0.12, fh - 0.4, { t: 0.06 });
  if (o.parapet !== 'none') parapet(b, front, x, fh - 0.05, fz - 0.1, w, o.parapet ?? 'stepped', { trim });
  b.slab(trim, x, fh - 0.12, fz - 0.04, w + 0.4, 0.2, 0.5, { round: 0.04, taper: 0 });
  b.slab(trim, x, h - 0.1, fz + 0.06, w + 0.1, 0.16, 0.18, { round: 0.03, taper: 0 });
  for (const s of [-1, 1]) b.slab(trim, x + s * (w / 2 - 0.08), 0.25, fz + 0.06, 0.18, fh - 0.4, 0.16, { round: 0.03, taper: 0 });
  const doorX = o.door === false ? null : x + (o.door ?? 0);
  if (doorX != null) door(b, doorX, 0.32, fz + 0.1, { w: o.doorW ?? 1.25, h: o.doorH ?? 2.3, c: o.doorC ?? 'plank3', trim });
  for (const dx of o.windows ?? [-w * 0.3, w * 0.3]) win(b, x + dx, 1.05, fz + 0.1, { w: o.winW ?? 1.25, h: o.winH ?? 1.35, trim });
  return { fz, top: fh, signY: h + (fh - h) * 0.45, doorX, bz };
}

export function door(b, x, y, z, o = {}) {
  const w = o.w ?? 1.2, h = o.h ?? 2.3, trim = o.trim ?? 'cream';
  b.slab('interior', x, y, z - 0.06, w, h, 0.06, { round: 0.01, taper: 0, noAo: true });
  b.slab(trim, x, y + h, z, w + 0.36, 0.16, 0.16, { round: 0.03, taper: 0 });
  for (const s of [-1, 1]) b.slab(trim, x + s * (w / 2 + 0.08), y, z, 0.14, h, 0.14, { round: 0.03, taper: 0 });
  if (o.c) for (const s of [-1, 1]) b.slab(o.c, x + s * w * 0.3, y, z + 0.02, w * 0.36, h - 0.1, 0.06, { round: 0.02, taper: 0, ry: s * 0.9 });
  return b;
}

export function win(b, x, y, z, o = {}) {
  const w = o.w ?? 1.2, h = o.h ?? 1.3, trim = o.trim ?? 'cream';
  b.slab('glass', x, y, z - 0.02, w, h, 0.05, { round: 0.01, taper: 0, noAo: true });
  b.slab('interior', x, y + 0.02, z - 0.12, w - 0.05, h - 0.04, 0.03, { round: 0.01, taper: 0, noAo: true });
  b.slab(trim, x, y - 0.12, z + 0.02, w + 0.3, 0.14, 0.22, { round: 0.03, taper: 0 });
  b.slab(trim, x, y + h, z + 0.02, w + 0.3, 0.14, 0.14, { round: 0.03, taper: 0 });
  for (const s of [-1, 1]) b.slab(trim, x + s * (w / 2 + 0.05), y, z + 0.02, 0.1, h, 0.12, { round: 0.02, taper: 0 });
  b.slab(trim, x, y + h * 0.5 - 0.03, z + 0.02, w, 0.06, 0.06, { round: 0.01, taper: 0 });
  b.slab(trim, x, y, z + 0.02, 0.06, h, 0.06, { round: 0.01, taper: 0 });
  if (o.shutters) for (const s of [-1, 1]) b.slab(o.shutters, x + s * (w / 2 + 0.32), y, z + 0.04, 0.42, h, 0.06, { round: 0.02, taper: 0 });
  if (o.sil !== false && w >= 0.8 && h >= 0.9) silhouettes(b, x, y, z + 0.012, w, h, o.sil ?? 1);
  return b;
}

// Warm-lit interior figures painted on the glass (a drinker, a hat, a raised glass): hashed by position so neighbours differ.
export function silhouettes(b, x, y, z, w, h, n = 1) {
  let a = Math.abs(Math.round(x * 97 + y * 31 + z * 13)) + 7;
  const r = () => { a = (a * 16807) % 2147483647; return a / 2147483647; };
  for (let k = 0; k < n; k++) {
    const sx = x + (n > 1 ? (k / (n - 1) - 0.5) * w * 0.55 : (r() - 0.5) * w * 0.45), s = Math.min(1, h / 1.3) * (0.85 + r() * 0.25), base = y + 0.02;
    b.slab('sil', sx, base, z, 0.5 * s, 0.42 * s, 0.01, { round: 0.12 * s, taper: 0.25, noAo: true });
    b.ball('sil', sx, base + 0.58 * s, z, 0.15 * s, { sz: 0.08, detail: 1, noAo: true });
    if (r() < 0.7) { b.slab('sil', sx, base + 0.68 * s, z, 0.5 * s, 0.04, 0.01, { round: 0.01, taper: 0, noAo: true }); b.slab('sil', sx, base + 0.7 * s, z, 0.24 * s, 0.17 * s, 0.01, { round: 0.04, taper: 0.1, noAo: true }); }
    if (r() < 0.5) { const d = r() < 0.5 ? -1 : 1; b.slab('sil', sx + d * 0.25 * s, base + 0.3 * s, z, 0.08 * s, 0.42 * s, 0.01, { round: 0.03, taper: 0, rz: -d * 0.5, noAo: true }); b.slab('sil', sx + d * 0.42 * s, base + 0.62 * s, z, 0.09 * s, 0.14 * s, 0.01, { round: 0.02, taper: 0, noAo: true }); }
  }
  return b;
}

// Raised boardwalk porch from z0 to z1 with posts, a step and a sloped tin/plank awning at awnY.
export function porch(b, x0, x1, z0, z1, o = {}) {
  const ph = o.h ?? 0.35, cx = (x0 + x1) / 2, w = x1 - x0, d = z1 - z0;
  b.slab('plank3', cx, 0, (z0 + z1) / 2, w, ph - 0.06, d, { round: 0.04, taper: 0 });
  const n = Math.round(w / 0.36);
  for (let i = 0; i < n; i++) b.slab(tone(slotHex(b, i % 3 ? 'plank' : 'plank2'), 1 + ((i * 7) % 5 - 2) * 0.03), x0 + (i + 0.5) * (w / n), ph - 0.08, (z0 + z1) / 2, w / n - 0.03, 0.08, d, { round: 0.02, taper: 0, noAo: true });
  if (o.step !== false) {
    const sx = o.stepX ?? cx;
    b.slab('plank2', sx, 0, z1 + 0.28, o.stepW ?? 2.0, ph * 0.5, 0.56, { round: 0.03, taper: 0 });
  }
  if (o.awn !== false) {
    const ay = o.awnY ?? 2.75, posts = o.posts ?? Math.max(2, Math.round(w / 2.6) + 1);
    for (let i = 0; i < posts; i++) {
      const px = x0 + 0.2 + i * ((w - 0.4) / (posts - 1));
      b.cyl('raw2', px, ph - 0.05, z1 - 0.2, 0.09, ay - ph + 0.05, 0, { sides: 6, taper: 1 });
      b.slab('raw2', px, ay - 0.62, z1 - 0.45, 0.07, 0.07, 0.6, { round: 0.02, taper: 0, rx: -0.75 });
    }
    b.slab('raw2', cx, ay - 0.05, z1 - 0.2, w, 0.14, 0.14, { round: 0.03, taper: 0 });
    const aw = o.awn ?? 'tin';
    const ns = Math.round(w / 0.55);
    for (let i = 0; i < ns; i++) {
      const k = aw === 'tin' ? (i % 2 ? 0.9 : 1.05) : 1 + ((i * 7) % 3 - 1) * 0.05;
      const slot = Array.isArray(aw) ? aw[i % aw.length] : aw;
      b.slab(tone(slotHex(b, slot), k), x0 + (i + 0.5) * (w / ns), ay + 0.1, (z0 + z1) / 2 + 0.1, w / ns + 0.02, 0.07, d + 0.5, { round: 0.02, taper: 0, rx: 0.2 });
    }
  }
  b.contact(cx, z1 + 0.1, w, 0.6, { k: 0.6 });
  return b;
}

// Hitching rail: two posts and a rail.
export function hitch(b, x, z, w = 2.4, ry = 0) {
  const c = Math.cos(ry), s = Math.sin(ry);
  for (const k of [-1, 1]) b.cyl('raw2', x + (k * w) / 2 * c, 0, z - (k * w) / 2 * s, 0.08, 1.05, 0, { sides: 6, taper: 0.9 });
  b.slab('raw', x, 0.95, z, w + 0.3, 0.12, 0.12, { round: 0.04, taper: 0, ry });
  return b;
}

export function barrel(b, x, y, z, s = 1, slot = 'plank') {
  b.cyl(slot, x, y, z, 0.38 * s, 0.98 * s, 0, { sides: 11, taper: 0.9 });
  b.cyl(slot, x, y + 0.49 * s, z, 0.42 * s, 0.02, 0, { sides: 11, taper: 1 });
  for (const h of [0.12, 0.8]) b.cyl('iron', x, y + h * s, z, 0.4 * s, 0.07 * s, 0, { sides: 11, taper: 0.98, noAo: true });
  b.cyl('plank3', x, y + 0.97 * s, z, 0.33 * s, 0.03, 0, { sides: 11, taper: 1 });
  return b;
}

export function crate(b, x, y, z, s = 1, ry = 0, slot = 'raw') {
  b.slab(slot, x, y, z, 0.8 * s, 0.62 * s, 0.62 * s, { round: 0.05, ry });
  b.slab('raw2', x, y + 0.27 * s, z, 0.84 * s, 0.08 * s, 0.66 * s, { round: 0.02, taper: 0, ry, noAo: true });
  b.slab('raw2', x, y, z, 0.1 * s, 0.62 * s, 0.66 * s, { round: 0.02, taper: 0, ry, rz: 0.75, noAo: true });
  return b;
}

// Hanging blade sign under the awning, perpendicular to the street (W3). icon(b, x, y, z) draws the picture.
export function blade(b, x, y, z, o = {}) {
  const w = o.w ?? 1.1, h = o.h ?? 0.8;
  b.slab('raw2', x, y + h + 0.32, z - 0.6, 0.08, 0.08, 1.3, { round: 0.02, taper: 0 });
  for (const s of [-1, 1]) b.cyl('iron', x, y + h, z + s * 0.36, 0.015, 0.34, 0, { sides: 3, taper: 1 });
  b.slab(o.board ?? 'ownTeal', x, y, z, 0.1, h, w, { round: 0.03, taper: 0 });
  b.slab('brass', x, y - 0.04, z, 0.12, 0.08, w + 0.08, { round: 0.02, taper: 0 });
  b.slab('brass', x, y + h - 0.04, z, 0.12, 0.08, w + 0.08, { round: 0.02, taper: 0 });
  return b;
}

// Big front sign board (blank, icon-only).
export function signBoard(b, x, y, z, w, h, o = {}) {
  b.slab(o.trim ?? 'brass', x, y - 0.08, z, w + 0.24, h + 0.16, 0.1, { round: 0.04, taper: 0 });
  b.slab(o.board ?? 'cream', x, y, z + 0.06, w, h, 0.08, { round: 0.03, taper: 0, noAo: true });
  const txt = o.text ?? b.signText; if (txt && b.signs) b.signs.board(w / h > 3.2 ? txt : txt.replace(/\n/g, ' ').replace(/ (?=[^ ]*$)/, '\n'), x, y + h / 2, z + 0.115, w * 0.96, h * 0.92, { style: /pom|6b3f8f/.test(String(o.board)) ? 'pomfrey' : 'civic' });
  return b;
}

export function lantern(b, x, y, z, o = {}) {
  b.slab('iron', x, y + 0.5, z - 0.22, 0.05, 0.05, 0.4, { round: 0.01, taper: 0 });
  b.cyl('iron', x, y + 0.38, z, 0.015, 0.13, 0, { sides: 3, taper: 1 });
  b.cyl(o.glow ?? 'lantern', x, y, z, 0.13, 0.32, 0, { sides: 7, taper: 1.25, noAo: true });
  b.cone('iron', x, y + 0.3, z, 0.18, 0.14, 0, { sides: 7, curve: 1 });
  b.disc('iron', x, y - 0.03, z, 0.12, 0.04);
  b.lamps.push([x, y + 0.1, z]);
  return [x, y + 0.1, z];
}

export function cactus(b, x, z, s = 1, arms = 2) {
  b.cyl('cactus', x, 0, z, 0.3 * s, 2.6 * s, 0, { sides: 9, taper: 0.82 });
  b.ball('cactus', x, 2.55 * s, z, 0.25 * s, { detail: 1, sy: 0.9 });
  for (let k = 0; k < arms; k++) {
    const sd = k % 2 ? -1 : 1, ay = (0.9 + k * 0.45) * s;
    b.slab('cactus2', x + sd * 0.42 * s, ay, z, 0.62 * s, 0.32 * s, 0.32 * s, { round: 0.12 });
    b.cyl('cactus', x + sd * 0.7 * s, ay, z, 0.18 * s, 0.95 * s, 0, { sides: 7, taper: 0.8 });
    b.ball('cactus', x + sd * 0.7 * s, ay + 0.93 * s, z, 0.14 * s, { detail: 0 });
  }
  b.contact(x, z, 0.7 * s, 0.7 * s);
  return b;
}

export function tufts(b, pts, s = 1) {
  for (const [x, z] of pts) for (let i = 0; i < 4; i++) b.cone(i % 2 ? 'hay2' : 'hay', x + Math.cos(i * 1.7) * 0.12 * s, 0, z + Math.sin(i * 1.7) * 0.12 * s, 0.07 * s, 0.4 * s, 0, { sides: 4, rz: Math.cos(i * 2.1) * 0.4, rx: Math.sin(i * 2.1) * 0.4, sway: 0.02 });
  return b;
}

export function rock(b, x, z, s = 1) {
  b.ball('rockN', x, 0, z, 0.35 * s, { sy: 0.55, detail: 0 });
  return b;
}

// Hay bale.
export function bale(b, x, y, z, ry = 0, s = 1) {
  b.slab('hay', x, y, z, 1.1 * s, 0.55 * s, 0.6 * s, { round: 0.12 * s, ry });
  for (const k of [-0.25, 0.25]) b.slab('hay2', x + Math.cos(ry) * k * s, y, z - Math.sin(ry) * k * s, 0.05, 0.57 * s, 0.62 * s, { round: 0.01, ry, noAo: true });
  return b;
}

// Wagon wheel (standing on its rim, axis along x after ry).
export function wheel(b, x, y, z, r = 0.55, o = {}) {
  const ry = o.ry || 0, rz = o.lean || 0;
  b.cyl('raw2', x, y, z, r, 0.09, 0, { sides: 13, taper: 1, rx: Math.PI / 2, ry: ry + Math.PI / 2, rz, sz: r });
  for (let i = 0; i < 6; i++) b.slab('raw', x, y, z, 0.05, r * 1.9, 0.05, { round: 0.01, taper: 0, ry, rx: 0, rz: rz + (i * Math.PI) / 6, aoBase: y - r });
  b.ball('iron', x, y, z, 0.1, { detail: 0 });
  return b;
}

// Simple open cart (bed + 2 wheels + shafts), facing +x.
export function cart(b, x, z, o = {}) {
  const ry = o.ry || 0, c = Math.cos(ry), s = Math.sin(ry);
  const P = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
  const [bx, bz] = P(0, 0);
  b.slab(o.c ?? 'plank', bx, 0.62, bz, 2.4, 0.16, 1.3, { round: 0.04, ry });
  for (const k of [-1, 1]) { const [sx, sz] = P(0, k * 0.62); b.slab(o.side ?? 'plank2', sx, 0.74, sz, 2.4, 0.42, 0.08, { round: 0.03, ry, taper: 0 }); }
  for (const k of [-1, 1]) { const [ex, ez] = P(k * 1.18, 0); b.slab(o.side ?? 'plank2', ex, 0.74, ez, 0.08, 0.42, 1.26, { round: 0.03, ry, taper: 0 }); }
  for (const k of [-1, 1]) { const [wx, wz] = P(-0.3, k * 0.78); wheel(b, wx, 0.55, wz, 0.55, { ry: ry + Math.PI / 2 }); }
  for (const k of [-1, 1]) { const [hx, hz] = P(1.9, k * 0.4); b.slab('raw2', hx, 0.55, hz, 1.6, 0.08, 0.08, { round: 0.02, ry, rz: 0.25 }); }
  b.contact(bx, bz, 2.6, 1.6, { ry });
  return b;
}

// Hat shapes for named characters until the art lane's crowd hats land (docs/ART.md). One unit geometry per kind.
export function hatGeo(kit, kind = 'ten') {
  const b = kit.builder(COLORS);
  if (kind === 'ten') {
    b.cyl('#ffffff', 0, 0, 0, 0.5, 0.05, 0, { sides: 15, taper: 1.02 });
    b.cyl('#ffffff', 0, 0.04, 0, 0.27, 0.32, 0, { sides: 11, taper: 0.82 });
    b.slab(tone('#ffffff', 0.55), 0, 0.06, 0, 0.56, 0.07, 0.56, { round: 0.03, taper: 0, sx: 1, sz: 1 });
    for (const s of [-1, 1]) b.slab('#ffffff', s * 0.4, 0.05, 0, 0.22, 0.06, 0.62, { round: 0.03, taper: 0, rz: -s * 0.45 });
  } else if (kind === 'pipe') {
    b.cyl('#ffffff', 0, 0, 0, 0.36, 0.04, 0, { sides: 13, taper: 1 });
    b.cyl('#ffffff', 0, 0.03, 0, 0.22, 0.8, 0, { sides: 11, taper: 1.06 });
    b.cyl(tone('#ffffff', 0.5), 0, 0.06, 0, 0.225, 0.08, 0, { sides: 11, taper: 1 });
  } else if (kind === 'bowler') {
    b.cyl('#ffffff', 0, 0, 0, 0.3, 0.04, 0, { sides: 13, taper: 1 });
    b.ball('#ffffff', 0, 0.02, 0, 0.21, { sy: 0.9, detail: 1, smooth: true, aoBase: -1 });
  } else if (kind === 'bonnet') {
    b.ball('#ffffff', 0, 0, -0.02, 0.32, { sy: 0.7, detail: 1, aoBase: -1 });
    b.cyl(tone('#ffffff', 0.7), 0, 0.02, 0.05, 0.36, 0.05, 0, { sides: 13, taper: 1, rx: -0.5 });
  }
  return b.geometry({ ao: 0.1 });
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();

// Per-plot hat instancing for the crowd: one draw per hat kind. put(i, x, y, z, ry, scale, tilt) follows a head.
export function hats(kit, P, kind, count, colors = []) {
  const m = new THREE.InstancedMesh(hatGeo(kit, kind), kit.materials.uber, count);
  m.castShadow = false; m.receiveShadow = true;
  m.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 2, 0), 16);
  for (let i = 0; i < count; i++) { m.setMatrixAt(i, _m.makeScale(0, 0, 0)); m.setColorAt(i, _c.set(colors[i % Math.max(1, colors.length)] || '#7a5236')); }
  P.group.add(m);
  return Object.assign(m, {
    put(i, x, y, z, ry = 0, s = 1, rx = 0, rz = 0) { _e.set(rx, ry, rz, 'YXZ'); m.setMatrixAt(i, _m.compose(_p.set(x, y, z), _q.setFromEuler(_e), _s.set(s, s, s))); },
    hide(i) { m.setMatrixAt(i, _m.makeScale(0, 0, 0)); },
    commit() { m.instanceMatrix.needsUpdate = true; },
  });
}

// Where a hat sits on a crowd head: the rig's head scales about y = 0.76 by headK; legs shift everything by 0.4·(legK−1).
export function headY(scale, s = 1, legK = 0.95, headK = 1.2) { return (0.76 + 0.37 * headK + 0.4 * (legK - 1)) * scale * CROWD_K * s; }

// Gives a crowd in-rig hats (lane A's parametric hat: zero extra draws, follows head bob/pose/tilt). kind: a hat type
// name or a list cycled per instance; sizes[i] scales a hat (0 = bare head, the barkeep's tiny bowler is the inverse joke). Extras are capped so the
// brims never eat the faces at card distance (PLAYTEST_1 #3). crowd.hats is a no-op shim for old call sites.
export const EXTRA_HATS = ['stetson', 'bowler', 'derby', 'ten', 'flat', 'boater', 'stetson', 'droopy'];
export function hatted(crowd, kind = EXTRA_HATS, colors = [], sizes = [], cap = 1.0) {
  for (let i = 0; i < crowd.count; i++) {
    const s = sizes[i] ?? 0.9;
    if (s <= 0) crowd.look(i, { hat: -1 });
    else crowd.look(i, { hat: Array.isArray(kind) ? kind[i % kind.length] : kind, hatScale: Math.min(cap, s) * 0.8, hatColor: colors[i % Math.max(1, colors.length)] || '#7a5236' });
  }
  crowd.hats = { put() {}, hide() {}, commit() {}, setColorAt: (i, c) => crowd.look(i, { hatColor: '#' + c.getHexString() }) };
  return crowd;
}

// A chunky toy horse (static), facing +x after ry. Tail and mane sway.
export function horse(b, x, z, o = {}) {
  const ry = o.ry || 0, c = Math.cos(ry), s = Math.sin(ry), col = o.c ?? '#9a5a35', dark = o.dark ?? '#4a2e22', y0 = o.y ?? 0;
  const at = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
  const B = (slot, lx, ly, lz, r, opt = {}) => { const [px, pz] = at(lx, lz); b.ball(slot, px, y0 + ly, pz, r, { detail: 1, smooth: true, ...opt, ry, aoBase: y0 + 0.5 }); };
  B(col, 0, 1.15, 0, 0.6, { sx: 1.45, sy: 0.8, sz: 0.78 });
  for (const [lx, lz] of [[-0.55, -0.24], [-0.55, 0.24], [0.5, -0.24], [0.5, 0.24]]) { const [px, pz] = at(lx, lz); b.cyl(col, px, y0, pz, 0.11, 1.05, 0, { sides: 6, taper: 0.8 }); b.cyl(o.sock ?? dark, px, y0, pz, 0.12, 0.14, 0, { sides: 6, taper: 1 }); }
  { const [px, pz] = at(0.8, 0); b.slab(col, px, y0 + 1.15, pz, 0.38, 0.75, 0.36, { round: 0.14, ry, rz: -0.55 }); }
  B(col, 1.12, 1.78, 0, 0.32, { sx: 1.45, sy: 0.85, sz: 0.78, rz: -0.35 });
  B(o.muzzle ?? '#d9b08a', 1.5, 1.66, 0, 0.2, { sx: 0.95, sy: 0.8, sz: 1.0 });
  for (const k of [-1, 1]) { const [px, pz] = at(0.98, k * 0.12); b.cone(col, px, y0 + 1.98, pz, 0.08, 0.3, 0, { sides: 5, rz: 0.2, rx: k * 0.2 }); }
  for (const k of [-1, 1]) { const [px, pz] = at(1.28, k * 0.2); b.ball('#241a2c', px, y0 + 1.86, pz, 0.05, { detail: 0 }); }
  for (let i = 0; i < 4; i++) { const [px, pz] = at(0.55 + i * 0.16, 0); b.slab(dark, px, y0 + 1.35 + i * 0.15, pz, 0.22, 0.4, 0.1, { round: 0.04, ry, rz: -0.55, sway: 0.03 }); }
  { const [px, pz] = at(-0.88, 0); b.cyl(dark, px, y0 + 0.55, pz, 0.12, 0.75, 0, { sides: 6, taper: 0.5, rz: (c > 0 ? 1 : -1) * -0.25, sway: 0.08 }); }
  if (o.saddle !== false) { const [px, pz] = at(-0.05, 0); b.slab(o.saddle ?? '#6b3a24', px, y0 + 1.55, pz, 0.7, 0.18, 0.86, { round: 0.08, ry }); b.slab(o.blanket ?? '#c4473a', px, y0 + 1.45, pz, 0.8, 0.1, 0.95, { round: 0.03, ry }); }
  const [cx, cz] = at(0.2, 0);
  b.contact(cx, cz, 2.2, 0.9, { ry });
  return b;
}

// Overwrite a crowd instance with a tilted pose (thrown, fainted, kicked). Call after crowd.set(...).
export function tilt(crowd, i, x, y, z, ry, rx, rz, k) {
  _e.set(rx, ry, rz, 'YXZ');
  crowd.mesh.setMatrixAt(i, _m.compose(_p.set(x, y, z), _q.setFromEuler(_e), _s.setScalar(k)));
}

// A pool of small particles (dust puffs, steam, sparks, notes, stars): one instanced draw.
export function particles(kit, P, build, count, { cast = false } = {}) {
  const b = kit.builder(P.pal);
  build(b);
  const m = new THREE.InstancedMesh(b.geometry({ ao: 0 }), kit.materials.uber, count);
  m.castShadow = cast; m.receiveShadow = false;
  m.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 3, 0), 18);
  for (let i = 0; i < count; i++) m.setMatrixAt(i, _m.makeScale(0, 0, 0));
  P.group.add(m);
  const live = Array.from({ length: count }, () => ({ t: 1, life: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s: 1, g: 0, spin: 0 }));
  let next = 0, dirty = false, want = true;
  // An idle pool costs a draw call for nothing (P#4): it only renders while it is wanted (plots still set .visible) AND
  // has a live particle. Pools posed by hand (setMatrixAt) set .manual = true and are shown while wanted.
  Object.defineProperty(m, 'visible', { get: () => want && (m.manual || dirty), set: (v) => { want = !!v; }, configurable: true });
  return Object.assign(m, {
    emit(x, y, z, vx, vy, vz, life = 1, s = 0.3, g = 0, spin = 0) {
      const p = live[next]; next = (next + 1) % count;
      Object.assign(p, { t: 0, life, x, y, z, vx, vy, vz, s, g, spin });
      dirty = true;
    },
    // shape(u) → scale multiplier over a particle's life (0..1).
    step(dt, shape = (u) => Math.sin(Math.min(1, u * 1.6) * Math.PI * 0.5) * (1 - u * 0.6)) {
      if (!dirty) return;
      dirty = false;
      for (let i = 0; i < count; i++) {
        const p = live[i];
        if (p.t >= 1) { m.setMatrixAt(i, _m.makeScale(0, 0, 0)); continue; }
        dirty = true;
        p.t += dt / p.life;
        p.vy -= p.g * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        const k = p.t >= 1 ? 0 : p.s * shape(p.t);
        _e.set(0, p.spin * p.t * 6, 0);
        m.setMatrixAt(i, _m.compose(_p.set(p.x, p.y, p.z), _q.setFromEuler(_e), _s.setScalar(k)));
      }
      m.instanceMatrix.needsUpdate = true;
    },
    clear() { for (const p of live) p.t = 1; },
  });
}

// Tiny deterministic rng for gags (no Math.random in tick paths that tests might snapshot).
export function rand(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), a | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export const smooth01 = (x) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };

// Card camera (round 3, a three-quarter diorama of the whole lot): the camera stands `dist` from `look` at yaw (deg, + = from
// the west) and elevation, then tilts only `sky` degrees under the frame's top edge, so the top of every card is a band of
// sky + mesas and the building sits whole beneath it (a high camera with a shallow pitch keeps the street foreground
// short). dist = final distance on a portrait card (the rig multiplies by 1.15; finishPlot sets cardW so it never widens).
// `build` (same args) is the framing while the Mulligans work on the lot, read by createCardRig.
export function cardCam(look, yaw = 16, elev = 32, dist = 14, fov = 40, sky = null, build = null) {
  const a = (yaw * Math.PI) / 180, e = (elev * Math.PI) / 180, d = dist / 1.15;
  const pos = [look[0] - Math.sin(a) * Math.cos(e) * d, look[1] + Math.sin(e) * d, look[2] + Math.cos(a) * Math.cos(e) * d];
  let at = look;
  if (sky != null) {
    const pt = ((fov / 2 - sky) * Math.PI) / 180;
    at = [pos[0] + Math.sin(a) * Math.cos(pt) * d, pos[1] - Math.sin(pt) * d, pos[2] - Math.cos(a) * Math.cos(pt) * d];
  }
  const cam = { pos, look: at, fov, facade: true };
  if (build) cam.build = cardCam(...build);
  return cam;
}

// A builder view that places everything it draws at (x, z) turned by ry (uses the builder's `parent` option), so a
// prop authored along +x can be dropped in at any heading.
const OPT_AT = { slab: 7, cyl: 7, cone: 7, ball: 5, contact: 4 };
export function placed(b, x, z, ry = 0, y = 0) {
  const parent = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(1, 1, 1));
  return new Proxy(b, {
    get(t, k) {
      const at = OPT_AT[k];
      if (at == null) return t[k];
      return (...a) => { while (a.length < at) a.push(k === 'cyl' || k === 'cone' ? 0 : undefined); a[at] = { ...(a[at] || {}), parent }; return t[k](...a); };
    },
  });
}

// R3 prop vignette (refs: barrels + crates + bottles clustered on the porch edge, a lantern on a post): one cluster per
// card foreground corner. side = +1 when the post stands to the cluster's right. Static, zero extra draws.
export function vignette(b, x, z, o = {}) {
  const s = o.s ?? 1, sd = o.side ?? 1, glow = o.glow ?? 'lantern';
  barrel(b, x, 0, z, 0.95 * s);
  barrel(b, x + 0.82 * s, 0, z - 0.25 * s, 0.9 * s, 'plank2');
  barrel(b, x + 0.4 * s, 0.95 * s, z - 0.1 * s, 0.75 * s);
  crate(b, x - 0.9 * s, 0, z + 0.35 * s, 0.95 * s, 0.35);
  crate(b, x - 0.85 * s, 0.6 * s, z + 0.3 * s, 0.7 * s, -0.2, 'raw2');
  for (const [dx, dz, h] of [[-0.98, 0.25, 0.34], [-0.72, 0.38, 0.28]]) { b.cyl(dx < -0.8 ? '#4f6b3a' : '#7a3a1e', x + dx * s, 1.03 * s, z + dz * s, 0.07 * s, h * s, 0, { sides: 6, taper: 0.75 }); b.cyl('#e9dcc0', x + dx * s, (1.03 + h) * s, z + dz * s, 0.03 * s, 0.1 * s, 0, { sides: 4, taper: 1 }); }
  b.cyl('#4f6b3a', x + 0.3 * s, 0.05, z + 0.62 * s, 0.07 * s, 0.3 * s, 0, { sides: 6, taper: 0.75, rz: Math.PI / 2 - 0.1 });
  const px = x + sd * 1.7 * s, pz = z + 0.2 * s;
  b.cyl('raw2', px, 0, pz, 0.08 * s, 2.7 * s, 0, { sides: 6, taper: 0.9 });
  b.slab('raw2', px - sd * 0.28 * s, 2.55 * s, pz, 0.62 * s, 0.07 * s, 0.07 * s, { round: 0.01, taper: 0 });
  lantern(b, px - sd * 0.5 * s, 2.05 * s, pz + 0.22, { glow });
  b.contact(x, z, 3.2 * s, 1.8 * s);
  tufts(b, [[x - 1.5 * s, z + 0.7 * s], [px + sd * 0.3, pz + 0.4]], s);
  return b;
}
