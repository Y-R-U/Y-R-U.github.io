// Western building vocabulary (Look A). Every function takes (b, x, z, o) in the builder's space: o.ry rotates (0 = the
// front faces +z), o.y lifts, o.parent nests. Slots resolve through the builder palette (data/palette.js).
// Ownership skins (W3): o.skin = 'you' | 'pomfrey' | 'civic' | 'none' recolours trim, sign board, door, awning and adds
// Pomfrey's crest. Text is painted by kit.signs: pass o.signs (a batch) + o.text and the board gets lettered.
import * as THREE from 'three';
import * as S from './shape.js?v=20261004c';
import { CLAP, PLANK, PLANKX, ROOF } from './build.js?v=20261004c';
import { SKINS } from '../../data/palette.js?v=20261004c';

export { SKINS };
const at = (x, y, z, ry = 0, parent = null) => {
  const m = S.matrix({ pos: [x, y, z], ry });
  return parent ? m.premultiply(parent) : m;
};
export const skinOf = (s) => (typeof s === 'object' && s ? s : SKINS[s] || SKINS.none);
const _v = new THREE.Vector3();
export function toWorld(M, x, y, z) { return _v.set(x, y, z).applyMatrix4(M).toArray(); }

// ---------------------------------------------------------------- extruded outlines (soft clay bevels)
const exCache = new Map();
function extrude(pts, depth, bevel = 0.04, key = null) {
  if (key && exCache.has(key)) return exCache.get(key);
  const sh = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  let g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 6 });
  if (g.index) g = g.toNonIndexed();
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  g.computeVertexNormals();
  if (key) exCache.set(key, g);
  return g;
}

// Parapet top profile, left → right, for a facade of half-width W topping out at y = top.
export function parapetProfile(kind, W, top) {
  const P = [];
  if (kind === 'stepped') {
    const d = Math.min(1.1, top * 0.16);
    P.push([-W, top - d], [-W * 0.64, top - d], [-W * 0.64, top - d * 0.5], [-W * 0.32, top - d * 0.5], [-W * 0.32, top], [W * 0.32, top], [W * 0.32, top - d * 0.5], [W * 0.64, top - d * 0.5], [W * 0.64, top - d], [W, top - d]);
  } else if (kind === 'arched' || kind === 'scroll') {
    const d = kind === 'scroll' ? 1.25 : 0.95, a = kind === 'scroll' ? 0.5 : 0.72;
    P.push([-W, top - d]);
    if (kind === 'scroll') {
      for (let i = 0; i <= 5; i++) { const t = i / 5; P.push([-W + t * W * 0.42, top - d + Math.sin(t * Math.PI / 2) * d * 0.55]); }
    } else P.push([-W * a, top - d]);
    for (let i = 0; i <= 10; i++) {
      const t = -1 + (2 * i) / 10, x = t * W * (kind === 'scroll' ? 0.5 : a);
      const y = kind === 'scroll' ? top - d * 0.45 + d * 0.45 * Math.cos(t * Math.PI / 2) : top - d + d * Math.sqrt(Math.max(0, 1 - t * t));
      if (kind !== 'scroll' || (i > 0 && i < 10)) P.push([x, y]);
    }
    if (kind === 'scroll') for (let i = 0; i <= 5; i++) { const t = 1 - i / 5; P.push([W - t * W * 0.42, top - d + Math.sin(t * Math.PI / 2) * d * 0.55]); }
    else P.push([W * a, top - d]);
    P.push([W, top - d]);
  } else if (kind === 'gabled') {
    P.push([-W, top - 1.3], [0, top], [W, top - 1.3]);
  } else P.push([-W, top], [W, top]);
  return P;
}

function facadeShape(W, kind, top) {
  const prof = parapetProfile(kind, W, top);
  return [[-W, 0], [W, 0], ...prof.slice().reverse()];
}
function bandShape(prof, t) {
  return [...prof, ...prof.slice().reverse().map(([x, y]) => [x, y - t])];
}

// ---------------------------------------------------------------- small parts

export function windowW(b, x, y, z, o = {}) {
  const M = o.parent || null, w = o.w ?? 1.1, h = o.h ?? 1.4, trim = o.trim || 'trim';
  b.slab(trim, x, y - 0.14, z + 0.04, w + 0.34, 0.14, 0.2, { parent: M, round: 0.03, taper: 0 });
  b.slab(trim, x, y + h, z, w + 0.24, 0.16, 0.12, { parent: M, round: 0.03, taper: 0 });
  for (const s of [-1, 1]) b.slab(trim, x + s * (w / 2 + 0.06), y, z, 0.12, h, 0.12, { parent: M, round: 0.025, taper: 0 });
  b.slab(o.glass || 'window', x, y, z + 0.03, w, h, 0.05, { parent: M, round: 0.01, taper: 0, noAo: true });
  b.slab('woodDark', x, y, z + 0.07, 0.05, h, 0.05, { parent: M, round: 0.01, taper: 0, noAo: true });
  b.slab('woodDark', x, y + h * 0.5, z + 0.07, w, 0.05, 0.05, { parent: M, round: 0.01, taper: 0, noAo: true });
  if (o.shutters) for (const s of [-1, 1]) b.slab(o.shutters, x + s * (w / 2 + 0.36), y, z + 0.02, 0.48, h, 0.06, { parent: M, round: 0.02, taper: 0, surf: PLANK });
  if (o.curtain) b.slab(o.curtain, x, y + h * 0.62, z + 0.06, w * 0.96, h * 0.36, 0.03, { parent: M, round: 0.01, taper: 0, noAo: true });
}

export function doorW(b, x, y, z, o = {}) {
  const M = o.parent || null, kind = o.kind || 'single', trim = o.trim || 'trim', slot = o.slot || 'door';
  const w = o.w ?? (kind === 'double' ? 1.8 : kind === 'swing' ? 1.6 : 1.1), h = o.h ?? 2.3;
  b.slab(trim, x, y + h, z, w + 0.36, 0.18, 0.14, { parent: M, round: 0.03, taper: 0 });
  for (const s of [-1, 1]) b.slab(trim, x + s * (w / 2 + 0.08), y, z, 0.14, h, 0.14, { parent: M, round: 0.03, taper: 0 });
  if (kind === 'swing') {
    b.slab('dark', x, y, z - 0.05, w, h, 0.04, { parent: M, round: 0.01, taper: 0, noAo: true, g: 0.12 });
    if (!o.noLeaves) for (const s of [-1, 1]) {
      b.slab(slot, x + s * w * 0.255, y + 0.45, z + 0.04, w * 0.47, 1.0, 0.07, { parent: M, round: 0.03, taper: 0, surf: PLANK });
      b.slab(trim, x + s * w * 0.255, y + 1.42, z + 0.07, w * 0.47, 0.08, 0.06, { parent: M, round: 0.02, taper: 0 });
    }
  } else if (kind === 'double') {
    for (const s of [-1, 1]) b.slab(slot, x + s * w * 0.255, y, z, w * 0.49, h, 0.08, { parent: M, round: 0.03, taper: 0, surf: PLANK });
    b.slab(o.glass || 'window', x, y + h * 0.6, z + 0.07, w * 0.7, h * 0.24, 0.03, { parent: M, round: 0.01, taper: 0, noAo: true });
  } else {
    b.slab(slot, x, y, z, w, h, 0.08, { parent: M, round: 0.03, taper: 0, surf: PLANK });
    b.slab(o.glass || 'window', x, y + h * 0.62, z + 0.07, w * 0.56, h * 0.24, 0.03, { parent: M, round: 0.01, taper: 0, noAo: true });
    b.ball('brass', x + w * 0.34, y + h * 0.45, z + 0.08, 0.05, { parent: M, detail: 0 });
  }
  return { x, y, z, w, h };
}

// Pomfrey's crest: a gold-edged purple shield bearing a gold top hat.
export function crest(b, x, y, z, o = {}) {
  const M = at(x, y, z, o.ry || 0, o.parent), s = o.s ?? 1;
  const sh = (k) => [[-0.5 * k, 0.55 * k], [0.5 * k, 0.55 * k], [0.5 * k, 0.05 * k], [0.25 * k, -0.42 * k], [0, -0.6 * k], [-0.25 * k, -0.42 * k], [-0.5 * k, 0.05 * k]];
  b.add(extrude(sh(s * 1.24), 0.08, 0.03, 'crestG' + s), 'pomTrim', { parent: M, noAo: true });
  b.add(extrude(sh(s), 0.08, 0.03, 'crestP' + s), 'pom', { parent: at(0, 0, 0.06, 0, M), noAo: true });
  b.slab('pomTrim', 0, 0.12 * s, 0.17, 0.62 * s, 0.07 * s, 0.06, { parent: M, round: 0.02, taper: 0, noAo: true });
  b.slab('pomTrim', 0, 0.17 * s, 0.17, 0.32 * s, 0.36 * s, 0.06, { parent: M, round: 0.02, taper: 0, noAo: true });
  b.slab('pom', 0, 0.21 * s, 0.2, 0.33 * s, 0.06 * s, 0.03, { parent: M, round: 0.01, taper: 0, noAo: true });
  return M;
}

// ---------------------------------------------------------------- the false-front shop
// o: { w 8, d 7, h 3.6 (eave), top (false-front top, default h + 2), parapet flat|stepped|arched|gabled|scroll,
//      paint slot, trim slot, skin, floors 1|2, door single|double|swing|none, doorX, windows n, porch true|false|{d,h},
//      awning (striped skin awning instead of the tin porch roof), balcony, sign true|false, text, signs (batch),
//      signStyle, roof 'gable'|'shed'|false, lean (rad), boardwalk true, steps true, lamps true, curtain slot }
// Returns { M, w, d, h, top, front, sign: {x,y,z,w,h} (local), door: {x,z}, porch: {d, y}, lamps: [[x,y,z]], hang }
export function falseFront(b, x, z, o = {}) {
  const w = o.w ?? 8, d = o.d ?? 7, h = o.h ?? 3.6, floors = o.floors ?? (h > 5 ? 2 : 1);
  const top = o.top ?? h + 2.0, kind = o.parapet || 'flat', sk = skinOf(o.skin);
  const paint = o.paint || 'wall', trim = o.trim || sk.trim, W = w / 2;
  const lean = o.lean ?? 0;
  const M = at(x, o.y || 0, z, o.ry || 0, o.parent);
  const ML = lean ? M.clone().multiply(new THREE.Matrix4().makeRotationZ(lean)) : M;
  const pc = o.porch === false ? null : { d: 2.5, h: floors > 1 ? 3.1 : Math.min(2.9, h - 0.3), ...(typeof o.porch === 'object' ? o.porch : {}) };
  const deckY = o.boardwalk === false ? 0 : 0.36;
  const F = 0;

  b.contact(0, -d / 2 + 0.2, w + 0.2, d, { parent: M, k: 0.85 });
  b.slab(o.base || 'woodDark', 0, -0.05, -d / 2 + 0.1, w - 0.1, 0.4, d - 0.2, { parent: M, round: 0.04, taper: 0 });
  b.slab(paint, 0, 0.3, -d / 2 - 0.05, w - 0.35, h - 0.3, d - 0.3, { parent: M, round: 0.08, taper: 0.01, surf: CLAP });
  const roof = o.roof ?? 'gable';
  if (roof === 'gable') b.roof(o.roofSlot || 'roof', 0, h - 0.02, -d / 2 - 0.1, w - 0.3, Math.min(1.6, w * 0.16), d - 0.6, 0, { parent: M, over: 0.22, surf: ROOF });
  else if (roof === 'shed') b.slab(o.roofSlot || 'roof', 0, h - 0.05, -d / 2 - 0.1, w - 0.2, 0.18, d, { parent: M, round: 0.04, taper: 0, rx: -0.06, surf: ROOF });

  b.add(extrude(facadeShape(W, kind, top), 0.26, 0.05, `ff:${w.toFixed(2)}:${kind}:${top.toFixed(2)}`), paint, { parent: at(0, 0, F - 0.26, 0, ML), surf: CLAP });
  const prof = parapetProfile(kind, W + 0.06, top + 0.04);
  b.add(extrude(bandShape(prof, 0.24), 0.16, 0.04, `fb:${w.toFixed(2)}:${kind}:${top.toFixed(2)}`), trim, { parent: at(0, 0, F + 0.02, 0, ML), noAo: true });
  b.slab(trim, 0, h - 0.02, F + 0.06, w + 0.3, 0.22, 0.3, { parent: ML, round: 0.05, taper: 0 });
  for (const s of [-1, 1]) b.slab(trim, s * (W - 0.08), 0.3, F + 0.02, 0.2, h - 0.3, 0.16, { parent: ML, round: 0.04, taper: 0 });
  if (sk.crest) crest(b, 0, top - (kind === 'flat' ? 0.15 : 0.45), F + 0.12, { parent: ML, s: Math.min(1.5, w * 0.13) });
  else if (o.finial !== false && kind !== 'flat') b.ball(trim, 0, top + 0.05, F - 0.1, 0.16, { parent: ML, detail: 0 });

  const signH = Math.min(1.25, Math.max(0.7, top - h - 0.75)), signW = Math.min(w * 0.78, w - 1.2);
  const sign = { x: 0, y: h + 0.32 + signH / 2, z: F + 0.11, w: signW, h: signH };
  if (o.sign !== false) {
    b.slab(sk.board2, 0, sign.y - signH / 2 - 0.06, F + 0.03, signW + 0.22, signH + 0.12, 0.14, { parent: ML, round: 0.04, taper: 0, noAo: true });
    if (o.signs && o.text) o.signs.board(o.text, 0, sign.y, sign.z, signW, signH, { parent: ML, style: o.signStyle || sk.key });
    else b.slab(sk.board, 0, sign.y - signH / 2, F + 0.12, signW, signH, 0.06, { parent: ML, round: 0.02, taper: 0, noAo: true });
  }

  const doorKind = o.door || 'single', doorX = o.doorX ?? 0;
  let door = null;
  if (doorKind !== 'none') door = doorW(b, doorX, deckY, F + 0.04, { parent: ML, kind: doorKind, trim, slot: sk.door === 'door' ? 'door' : sk.door, noLeaves: o.doorLeaves === false });
  const nWin = o.windows ?? (w > 9 ? 2 : w > 5 ? 2 : 0);
  const dw = door ? door.w / 2 + 0.5 : 0;
  for (let i = 0; i < nWin; i++) {
    const side = i % 2 ? 1 : -1, k = Math.floor(i / 2);
    const span = W - 0.6 - dw;
    const wx = doorX + side * (dw + span * (k + 0.5) / Math.ceil(nWin / 2));
    windowW(b, wx, deckY + 0.95, F + 0.05, { parent: ML, w: Math.min(1.5, span * 0.7), h: 1.45, trim, curtain: o.curtain });
  }
  if (floors > 1) {
    const uy = pc ? pc.h + 0.75 : h * 0.55;
    const n = Math.max(2, Math.round(w / 2.8));
    for (let i = 0; i < n; i++) windowW(b, -W + (w / n) * (i + 0.5), uy, F + 0.05, { parent: ML, w: 0.9, h: 1.25, trim, shutters: o.shutters, curtain: o.curtain });
  }

  const lamps = [];
  if (pc) {
    const pd = pc.d, ph = pc.h;
    if (o.boardwalk !== false) {
      b.slab('plank', 0, 0, pd / 2 - 0.05, w + 0.02, deckY, pd + 0.1, { parent: M, round: 0.03, taper: 0, surf: PLANK });
      b.slab('plank3', 0, 0, pd + 0.0, w + 0.02, deckY - 0.04, 0.12, { parent: M, round: 0.02, taper: 0, surf: PLANKX });
      if (o.steps !== false) for (let i = 0; i < 2; i++) b.slab('plank2', doorX, 0, pd + 0.2 + i * 0.28 - 0.14, 1.9 - i * 0.1, deckY * (1 - (i + 1) / 3), 0.32, { parent: M, round: 0.03, taper: 0, surf: PLANKX });
    }
    const np = Math.max(2, Math.ceil(w / 3.4) + 1);
    for (let i = 0; i < np; i++) {
      const px = -W + 0.2 + ((w - 0.4) * i) / (np - 1);
      if (Math.abs(px - doorX) < 0.9) continue;
      b.slab('wood', px, deckY, pd - 0.25, 0.2, ph - deckY, 0.2, { parent: M, round: 0.04, taper: 0.06 });
      if (o.braces !== false) for (const s of [-1, 1]) if ((i > 0 || s > 0) && (i < np - 1 || s < 0)) b.slab('wood', px + s * 0.28, ph - 0.42, pd - 0.25, 0.08, 0.5, 0.1, { parent: M, round: 0.02, taper: 0, rz: s * 0.75 });
    }
    if (o.awning) {
      b.slab('wood2', 0, ph - 0.05, pd - 0.25, w + 0.1, 0.16, 0.16, { parent: M, round: 0.03, taper: 0 });
      b.awning(sk.awning, 0, ph + 0.55, pd * 0.5 - 0.1, w + 0.2, pd + 0.4, 0, { parent: M, alt: sk.awningAlt, drop: 0.55 });
    } else if (o.balcony || floors > 1 && o.balcony !== false) {
      b.slab('plank', 0, ph - 0.02, pd / 2 - 0.1, w + 0.1, 0.2, pd + 0.1, { parent: M, round: 0.04, taper: 0, surf: PLANK });
      b.slab(trim, 0, ph - 0.12, pd - 0.02, w + 0.2, 0.14, 0.12, { parent: M, round: 0.03, taper: 0 });
      b.slab(trim, 0, ph + 0.9, pd - 0.1, w + 0.1, 0.1, 0.12, { parent: M, round: 0.02, taper: 0 });
      const ns = Math.round(w / 0.42);
      for (let i = 0; i <= ns; i++) b.cyl('wood', -W + (w * i) / ns, ph + 0.18, pd - 0.1, 0.045, 0.72, 0, { parent: M, sides: 5, taper: 0.8 });
      for (const s of [-1, 1]) b.slab('wood', s * (W - 0.05), ph + 0.18, pd / 2, 0.1, 0.82, pd - 0.2, { parent: M, round: 0.02, taper: 0 });
    } else {
      b.slab('wood2', 0, ph - 0.05, pd - 0.25, w + 0.1, 0.16, 0.16, { parent: M, round: 0.03, taper: 0 });
      b.slab(o.porchRoof || 'tin', 0, ph + 0.05, pd / 2 - 0.1, w + 0.3, 0.12, pd + 0.45, { parent: M, round: 0.03, taper: 0, rx: 0.13, surf: ROOF });
    }
    if (o.lamps !== false) for (const s of [-1, 1]) {
      const lx = doorX + s * ((door ? door.w : 1) / 2 + 0.55);
      b.slab('iron', lx, ph - 0.9, F + 0.12, 0.05, 0.05, 0.4, { parent: ML, round: 0.01, taper: 0 });
      b.cyl('lamp', lx, ph - 1.25, F + 0.32, 0.11, 0.3, 0, { parent: ML, sides: 6, taper: 1.15, noAo: true });
      b.cone('iron', lx, ph - 0.96, F + 0.32, 0.17, 0.16, 0, { parent: ML, sides: 6, curve: 0.9 });
      lamps.push(toWorld(ML, lx, ph - 1.1, F + 0.32));
    }
  }
  if (o.boardwalk !== false && !pc) b.slab('plank', 0, 0, 1.2, w, deckY, 2.4, { parent: M, round: 0.03, taper: 0, surf: PLANK });
  b.lamps?.push(...lamps);
  return { M, w, d, h, top, front: F, sign, door: door ? { x: doorX, z: F } : null, porch: pc ? { d: pc.d, h: pc.h, y: deckY } : null, lamps, hang: { x: W + 0.05, y: pc ? pc.h - 0.15 : h - 0.4, z: F + 0.1 } };
}

// A sign hung perpendicular to the facade from an iron arm (W3: reads when the camera looks down the street).
// (x, y, z) = where the arm leaves the wall; the board hangs out along +z. ry turns the whole fixture.
export function hangingSign(b, x, y, z, o = {}) {
  const M = at(x, y, z, o.ry || 0, o.parent), w = o.w ?? 1.5, h = o.h ?? 0.75, reach = o.reach ?? w + 0.45, sk = skinOf(o.skin);
  b.slab('iron', 0, -0.04, reach / 2, 0.06, 0.07, reach, { parent: M, round: 0.015, taper: 0 });
  b.slab('iron', 0, -0.5, 0.18, 0.05, 0.05, 0.9, { parent: M, round: 0.01, taper: 0, rx: -0.6 });
  b.ball('iron', 0, -0.02, reach, 0.05, { parent: M, detail: 0 });
  const cz = reach - w / 2 - 0.12;
  for (const s of [-1, 1]) b.slab('iron', 0, -0.22, cz + s * (w / 2 - 0.15), 0.02, 0.2, 0.02, { parent: M, round: 0.005, taper: 0 });
  b.slab(sk.board2, 0, -0.26 - h, cz, 0.1, h + 0.04, w + 0.06, { parent: M, round: 0.03, taper: 0, noAo: true });
  const rect = { x: 0, y: -0.24 - h / 2, z: cz, w, h };
  if (o.signs && o.text) o.signs.board(o.text, 0.055, rect.y, cz, w - 0.02, h - 0.02, { parent: M, ry: Math.PI / 2, style: o.style || sk.key, back: true });
  else for (const s of [-1, 1]) b.slab(sk.board, s * 0.055, -0.25 - h, cz, 0.02, h, w - 0.04, { parent: M, round: 0.01, taper: 0, noAo: true });
  if (o.glyph) o.glyph(b, M, rect);
  return { M, rect };
}

// "FOR SALE" / "RESERVED · POMFREY" stake for an empty lot.
export function stake(b, x, z, o = {}) {
  const M = at(x, o.y || 0, z, o.ry || 0, o.parent), kind = o.kind || 'forsale';
  const reserved = kind === 'reserved', w = o.w ?? (reserved ? 2.3 : 1.7), h = o.h ?? (reserved ? 0.9 : 0.8), ph = o.ph ?? 1.7;
  b.contact(0, 0, w * 0.8, 0.4, { parent: M, k: 0.5 });
  for (const s of [-1, 1]) b.slab('wood2', s * (w / 2 - 0.2), 0, 0, 0.12, ph + h * 0.5, 0.12, { parent: M, round: 0.03, taper: 0.1, rz: s * 0.02 });
  b.slab(reserved ? 'pom2' : 'woodDark', 0, ph - h / 2 - 0.04, -0.02, w + 0.08, h + 0.08, 0.08, { parent: M, round: 0.03, taper: 0, rz: o.tilt ?? 0.04, noAo: true });
  const text = o.text || (reserved ? 'RESERVED\n· POMFREY ·' : 'FOR SALE');
  if (o.signs) o.signs.board(text, 0, ph, 0.03, w, h, { parent: M, rz: o.tilt ?? 0.04, style: reserved ? 'reserved' : 'forsale' });
  if (reserved) crest(b, 0, ph + h / 2 + 0.25, 0.0, { parent: M, s: 0.42 });
  if (o.string !== false && o.lot) {
    const [lw, ld] = o.lot;
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.slab('raw', sx * lw / 2, 0, sz * ld / 2 - 0, 0.08, 0.55, 0.08, { parent: M, round: 0.02, taper: 0.3 });
    for (const [ax, az, bx, bz] of [[-1, -1, 1, -1], [-1, 1, 1, 1], [-1, -1, -1, 1], [1, -1, 1, 1]]) {
      const cx = (ax + bx) * lw / 4, cz = (az + bz) * ld / 4, len = ax === bx ? ld : lw;
      b.slab(reserved ? 'pomTrim' : 'cloth', cx, 0.42, cz, ax === bx ? 0.02 : len, 0.02, ax === bx ? len : 0.02, { parent: M, round: 0.005, taper: 0, noAo: true });
    }
  }
  return { M, text };
}

// ---------------------------------------------------------------- street furniture

export function hitch(b, x, z, o = {}) {
  const M = at(x, o.y || 0, z, o.ry || 0, o.parent), w = o.w ?? 2.6;
  for (const s of [-1, 1]) b.slab('woodDark', s * (w / 2 - 0.1), 0, 0, 0.16, 1.05, 0.16, { parent: M, round: 0.03, taper: 0.08 });
  b.slab('wood2', 0, 0.92, 0, w + 0.2, 0.13, 0.15, { parent: M, round: 0.04, taper: 0, rz: 0.015 });
  b.contact(0, 0, w, 0.3, { parent: M, k: 0.4 });
}

export function trough(b, x, z, o = {}) {
  const M = at(x, o.y || 0, z, o.ry || 0, o.parent), w = o.w ?? 2.2;
  b.contact(0, 0, w + 0.2, 0.9, { parent: M, k: 0.7 });
  b.slab('wood2', 0, 0, 0, w, 0.62, 0.78, { parent: M, round: 0.06, taper: -0.06, surf: PLANKX });
  b.slab('water', 0, 0.5, 0, w - 0.22, 0.06, 0.56, { parent: M, round: 0.02, taper: 0, noAo: true, r: 0.12 });
  for (const s of [-1, 1]) b.slab('iron', s * (w / 2 - 0.25), 0.05, 0, 0.06, 0.6, 0.82, { parent: M, round: 0.01, taper: -0.06 });
}

export function barrel(b, x, z, o = {}) {
  const M = at(x, o.y || 0, z, o.ry || 0, o.parent), s = o.s ?? 1;
  if (o.lying) {
    const L = at(0, 0.36 * s, 0, 0, M).multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2));
    b.cyl(o.slot || 'wood', 0, -0.47 * s, 0, 0.36 * s, 0.94 * s, 0, { parent: L, sides: 10, taper: 1 });
    for (const y of [-0.3, 0.22]) b.cyl('iron', 0, y * s, 0, 0.38 * s, 0.07 * s, 0, { parent: L, sides: 10, taper: 1 });
    return;
  }
  b.contact(0, 0, 0.75 * s, 0.75 * s, { parent: M, k: 0.6 });
  b.cyl(o.slot || 'wood', 0, 0, 0, 0.34 * s, 0.48 * s, 0, { parent: M, sides: 10, taper: 1.1 });
  b.cyl(o.slot || 'wood', 0, 0.48 * s, 0, 0.374 * s, 0.48 * s, 0, { parent: M, sides: 10, taper: 0.91 });
  for (const y of [0.1, 0.8]) b.cyl('iron', 0, y * s, 0, (y < 0.5 ? 0.355 : 0.36) * s, 0.07 * s, 0, { parent: M, sides: 10, taper: 1 });
  b.cyl('woodDark', 0, 0.95 * s, 0, 0.3 * s, 0.03 * s, 0, { parent: M, sides: 10, taper: 1 });
}

export function crate(b, x, z, o = {}) {
  const M = at(x, o.y || 0, z, o.ry || 0, o.parent), s = o.s ?? 0.7;
  b.contact(0, 0, s, s, { parent: M, k: 0.55 });
  b.slab(o.slot || 'raw', 0, 0, 0, s, s, s, { parent: M, round: 0.04, taper: 0, surf: PLANKX });
  for (const k of [-1, 1]) b.slab('wood2', 0, s / 2 - 0.04, k * (s / 2 + 0.01), s * 1.25, 0.08, 0.03, { parent: M, round: 0.01, taper: 0, rz: 0.78 * k });
}

export function hay(b, x, z, o = {}) {
  const M = at(x, o.y || 0, z, o.ry || 0, o.parent);
  b.contact(0, 0, 1.3, 0.8, { parent: M, k: 0.6 });
  b.slab('hay', 0, 0, 0, 1.2, 0.62, 0.72, { parent: M, round: 0.16, taper: 0.04 });
  for (const s of [-0.3, 0.3]) b.slab('wood2', s, 0, 0, 0.04, 0.64, 0.74, { parent: M, round: 0.01, taper: 0.04 });
}

export function wheel(b, x, z, o = {}) {
  const M = at(x, o.y || 0, z, o.ry || 0, o.parent), r = o.r ?? 0.6;
  const L = at(0, r * 0.95, 0, 0, M).multiply(new THREE.Matrix4().makeRotationX(o.lean ?? -0.25));
  const ring = S.prism(14, r, r, 0.08, {});
  ring.rotateX(Math.PI / 2);
  b.add(ring, 'woodDark', { parent: L });
  for (let i = 0; i < 6; i++) b.slab('wood', 0, 0, 0, 0.05, r * 1.9, 0.04, { parent: at(0, 0, 0, 0, L).multiply(new THREE.Matrix4().makeRotationZ((i * Math.PI) / 6).multiply(new THREE.Matrix4().makeTranslation(0, -r * 0.95, 0))), round: 0.01, taper: 0 });
  b.cyl('iron', 0, -0.06, 0, 0.1, 0.12, 0, { parent: at(0, 0, 0, 0, L).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2)), sides: 7, taper: 1 });
}

export function lanternPost(b, x, z, o = {}) {
  const M = at(x, o.y || 0, z, o.ry || 0, o.parent), h = o.h ?? 2.9;
  b.contact(0, 0, 0.3, 0.3, { parent: M, k: 0.6 });
  b.slab('woodDark', 0, 0, 0, 0.16, h, 0.16, { parent: M, round: 0.03, taper: 0.1 });
  b.slab('woodDark', 0, h - 0.2, 0.25, 0.08, 0.08, 0.6, { parent: M, round: 0.02, taper: 0 });
  b.cyl('lamp', 0, h - 0.62, 0.48, 0.12, 0.32, 0, { parent: M, sides: 6, taper: 1.15, noAo: true });
  b.cone('iron', 0, h - 0.32, 0.48, 0.18, 0.18, 0, { parent: M, sides: 6, curve: 0.9 });
  b.cyl('iron', 0, h - 0.66, 0.48, 0.13, 0.05, 0, { parent: M, sides: 6, taper: 1 });
  const p = toWorld(M, 0, h - 0.48, 0.48);
  b.lamps?.push(p);
  return p;
}

// Wanted-poster board: a post-and-plank noticeboard with n painted posters (signs batch required for paint).
export function wantedBoard(b, x, z, o = {}) {
  const M = at(x, o.y || 0, z, o.ry || 0, o.parent), w = o.w ?? 1.9, n = o.n ?? 3;
  b.contact(0, 0, w, 0.4, { parent: M, k: 0.5 });
  for (const s of [-1, 1]) b.slab('woodDark', s * (w / 2 - 0.1), 0, 0, 0.14, 2.2, 0.14, { parent: M, round: 0.03, taper: 0.08 });
  b.slab('wood2', 0, 1.0, 0, w, 1.05, 0.08, { parent: M, round: 0.03, taper: 0, surf: PLANK });
  b.slab('roof2', 0, 2.1, 0.02, w + 0.4, 0.08, 0.45, { parent: M, round: 0.02, taper: 0, rx: 0.2 });
  const names = o.bounties || ['$500', '$1,000', '$50', '$5,000'];
  for (let i = 0; i < n; i++) {
    const px = -w / 2 + (w / n) * (i + 0.5), tilt = ((i * 37) % 7 - 3) * 0.02;
    if (o.signs) o.signs.board(names[i % names.length], px, 1.53, 0.06, Math.min(0.52, w / n - 0.08), 0.72, { parent: M, rz: tilt, style: 'poster' });
    else b.slab('cloth', px, 1.17, 0.05, w / n - 0.12, 0.72, 0.01, { parent: M, round: 0.005, taper: 0, rz: tilt, noAo: true });
  }
}

// Bunting: a sagging line of pennants between two points [x, y, z] (colours cycle).
export function bunting(b, a, c, o = {}) {
  const n = o.n ?? Math.max(4, Math.round(Math.hypot(c[0] - a[0], c[2] - a[2]) / 0.6));
  const cols = o.colors || ['pom', 'pomTrim'];
  const sag = o.sag ?? 0.7;
  const dx = c[0] - a[0], dz = c[2] - a[2], ry = Math.atan2(dx, dz) - Math.PI / 2;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n, y = a[1] + (c[1] - a[1]) * t - Math.sin(t * Math.PI) * sag;
    const M = at(a[0] + dx * t, y, a[2] + dz * t, ry);
    b.add(flagGeo(), cols[i % cols.length], { parent: M, noAo: true, sway: 0.04 });
  }
  const segs = 8;
  for (let i = 0; i < segs; i++) {
    const t0 = i / segs, t1 = (i + 1) / segs;
    const p0 = [a[0] + dx * t0, a[1] + (c[1] - a[1]) * t0 - Math.sin(t0 * Math.PI) * sag, a[2] + dz * t0];
    const p1 = [a[0] + dx * t1, a[1] + (c[1] - a[1]) * t1 - Math.sin(t1 * Math.PI) * sag, a[2] + dz * t1];
    const L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
    const M = at((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2 - 0.01, (p0[2] + p1[2]) / 2, ry).multiply(new THREE.Matrix4().makeRotationZ(Math.atan2(p1[1] - p0[1], Math.hypot(p1[0] - p0[0], p1[2] - p0[2]))));
    b.slab('dark', 0, 0, 0, L, 0.02, 0.02, { parent: M, round: 0.005, taper: 0, noAo: true });
  }
}
let _flag = null;
function flagGeo() {
  if (_flag) return _flag;
  const m = new S.Mesh();
  m.tri([-0.2, 0, 0.01], [0.2, 0, 0.01], [0, -0.38, 0.01], '#ffffff').tri([0.2, 0, -0.01], [-0.2, 0, -0.01], [0, -0.38, -0.01], '#ffffff');
  _flag = m.geo();
  return _flag;
}

// String of bulbs (glow at night) along a sagging catenary.
export function bulbString(b, a, c, o = {}) {
  const n = o.n ?? 12, sag = o.sag ?? 0.8, dx = c[0] - a[0], dz = c[2] - a[2];
  for (let i = 0; i <= n; i++) {
    const t = i / n, y = a[1] + (c[1] - a[1]) * t - Math.sin(t * Math.PI) * sag;
    b.ball('lamp', a[0] + dx * t, y - 0.08, a[2] + dz * t, 0.075, { detail: 0, noAo: true, g: -1.4 });
  }
  bunting(b, a, c, { n: 1, sag, colors: ['dark'] });
}

// ---------------------------------------------------------------- desert & skyline

export function cactus(b, x, z, o = {}) {
  const M = at(x, o.y || 0, z, o.ry ?? b.rnd() * 6.28, o.parent), s = o.s ?? 1, arms = o.arms ?? 2;
  b.contact(0, 0, 0.7 * s, 0.7 * s, { parent: M, k: 0.5 });
  const trunk = (lx, ly, lz, r, h) => {
    b.cyl('cactus', lx, ly, lz, r, h, 0, { parent: M, sides: 9, taper: 0.92 });
    b.ball('cactus', lx, ly + h, lz, r * 0.93, { parent: M, detail: 1, smooth: true, sy: 0.9 });
  };
  trunk(0, 0, 0, 0.3 * s, 3.0 * s);
  const sides = [-1, 1];
  for (let i = 0; i < arms; i++) {
    const sd = sides[i % 2], ay = (1.1 + ((i * 0.37) % 0.7) + (i > 1 ? 0.5 : 0)) * s, ah = (0.8 + (i % 2) * 0.5) * s;
    b.slab('cactus', sd * 0.42 * s, ay, 0, 0.62 * s, 0.36 * s, 0.36 * s, { parent: M, round: 0.12 * s, taper: 0 });
    trunk(sd * 0.68 * s, ay + 0.08 * s, 0, 0.19 * s, ah);
  }
  if (o.flower) b.ball('pink', 0, 3.25 * s, 0, 0.12 * s, { parent: M, detail: 0 });
}

export function prickly(b, x, z, o = {}) {
  const M = at(x, o.y || 0, z, o.ry ?? b.rnd() * 6.28, o.parent), s = o.s ?? 1;
  const pad = (lx, ly, rz, k = 1) => b.ball('cactus', lx * s, ly * s, 0, 0.3 * s * k, { parent: M, sx: 1, sy: 1.25, sz: 0.32, rz, detail: 1, smooth: true });
  pad(0, 0.32, 0); pad(-0.28, 0.75, 0.5, 0.8); pad(0.3, 0.7, -0.45, 0.85); pad(0.05, 1.05, 0.1, 0.7);
  b.ball('pink', 0.05 * s, 1.32 * s, 0, 0.07 * s, { parent: M, detail: 0 });
}

export function tuft(b, x, z, o = {}) {
  const M = at(x, o.y || 0, z, b.rnd() * 6.28, o.parent), s = o.s ?? 1;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * 6.28;
    b.cone(o.slot || 'scrub', Math.cos(a) * 0.08 * s, 0, Math.sin(a) * 0.08 * s, 0.07 * s, (0.35 + (i % 3) * 0.1) * s, 0, { parent: M, sides: 4, curve: 1, rx: Math.cos(a) * 0.4, rz: -Math.sin(a) * 0.4, sway: 0.05 });
  }
}

export function rock(b, x, z, o = {}) {
  const s = o.s ?? 1;
  b.ball(o.slot || 'rock3', x, (o.y || 0) + 0.1 * s, z, 0.5 * s, { sy: 0.55, detail: 0, ry: b.rnd() * 6, parent: o.parent });
}

// Tumbleweed: a loose ball of bent twig ribbons (geometry, for an instanced/dynamic roller). Radius ≈ 0.45.
let _tw = null;
export function tumbleweedGeo() {
  if (_tw) return _tw;
  const m = new S.Mesh();
  const col = S.rgb('#b8975e'), col2 = S.rgb('#9c7a48');
  for (let i = 0; i < 9; i++) {
    const a0 = (i * 2.4) % 6.28, tilt = ((i * 1.7) % 3.14) - 1.57;
    const pts = [];
    for (let k = 0; k <= 9; k++) {
      const t = (k / 9) * 5.2 + a0;
      const r = 0.42 + Math.sin(t * 3 + i) * 0.05;
      pts.push(new THREE.Vector3(Math.cos(t) * r, Math.sin(t) * r * Math.cos(tilt), Math.sin(t) * r * Math.sin(tilt)).applyAxisAngle(new THREE.Vector3(0, 1, 0), i * 0.7));
    }
    for (let k = 0; k < pts.length - 1; k++) {
      const p = pts[k], q = pts[k + 1], w = 0.025;
      const n = new THREE.Vector3().subVectors(q, p).cross(p).normalize().multiplyScalar(w);
      const c = k % 2 ? col : col2;
      m.quad([p.x - n.x, p.y - n.y, p.z - n.z], [q.x - n.x, q.y - n.y, q.z - n.z], [q.x + n.x, q.y + n.y, q.z + n.z], [p.x + n.x, p.y + n.y, p.z + n.z], c);
      m.quad([p.x + n.x, p.y + n.y, p.z + n.z], [q.x + n.x, q.y + n.y, q.z + n.z], [q.x - n.x, q.y - n.y, q.z - n.z], [p.x - n.x, p.y - n.y, p.z - n.z], c);
    }
  }
  _tw = S.setPbr(m.geo(), 0.9, 0, 0);
  return _tw;
}

// Faceted mesa: 2–3 stacked tapered blocks with a darker cap band (steal from Look B). h ~25–60 at 150–400 m.
export function mesa(b, x, z, w, d, h, o = {}) {
  // Monument-Valley butte, faceted (Look B steal): talus skirt, striped vertical cliff strata, an overhanging caprock,
  // and sometimes a lone spire. Flat-shaded prisms so the facets catch the low sun.
  const M = at(x, o.y || 0, z, o.ry || 0, o.parent);
  const slot = o.slot || 'rock', band = o.band || 'rockDark', r = o.rnd || b.rnd;
  const sz = d / w, R = w * 0.5;
  b.add(S.jitter(S.prism(9, R * 1.5, R * 1.02, h * 0.24, { rot: r() }), w * 0.035, r), slot, { parent: M, sz, noAo: true });
  let y = h * 0.22, rr = R;
  const strata = [[0.2, slot], [0.07, band], [0.22, slot], [0.05, band], [0.12, slot]];
  for (const [k, sl] of strata) {
    const r1 = rr * (0.97 + r() * 0.02);
    b.add(S.jitter(S.prism(8, rr, r1, h * k, { rot: 0.3 }), w * 0.008, r), sl, { parent: at(0, y, 0, 0, M), sz, noAo: true });
    y += h * k; rr = r1;
  }
  b.add(S.prism(8, rr * 1.04, rr * 1.06, h * 0.06, { rot: 0.3 }), band, { parent: at(0, y, 0, 0, M), sz, noAo: true });
  b.add(S.prism(8, rr * 1.0, rr * 0.92, h * 0.025, { rot: 0.3 }), slot, { parent: at(0, y + h * 0.06, 0, 0, M), sz, noAo: true });
  if (o.spire) {
    const sx = R * (1.25 + r() * 0.3), sh = h * (0.9 + r() * 0.35), sr = w * 0.07;
    b.add(S.jitter(S.prism(7, sr * 2.4, sr * 1.3, sh * 0.25, { rot: r() }), sr * 0.2, r), slot, { parent: at(sx, 0, 0, 0, M), noAo: true });
    b.add(S.prism(6, sr * 1.15, sr * 0.85, sh * 0.72, { rot: r() }), slot, { parent: at(sx, sh * 0.22, 0, 0, M), noAo: true });
    b.add(S.prism(6, sr * 1.05, sr * 1.1, sh * 0.06, { rot: 0.2 }), band, { parent: at(sx, sh * 0.92, 0, 0, M), noAo: true });
  }
}

// Water tower: a 3 m tank on a 7 m trestle with a conical cap (skyline hero).
export function waterTower(b, x, z, o = {}) {
  const M = at(x, o.y || 0, z, o.ry || 0, o.parent), H = o.h ?? 7, R = o.r ?? 1.6;
  b.contact(0, 0, 4.6, 4.6, { parent: M, k: 0.7 });
  const legs = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (const [sx, sz] of legs) b.slab('woodDark', sx * 1.6, 0, sz * 1.6, 0.24, H + 0.1, 0.24, { parent: M, round: 0.04, taper: 0, rx: -sz * 0.06, rz: sx * 0.06 });
  for (const y of [2.2, 4.6]) for (let i = 0; i < 4; i++) {
    const [ax, az] = legs[i], [bx, bz] = legs[(i + 1) % 4], k = 1.6 - y * 0.06;
    b.slab('wood2', (ax + bx) * k / 2, y, (az + bz) * k / 2, ax === bx ? 0.1 : 2 * k, 0.14, ax === bx ? 2 * k : 0.1, { parent: M, round: 0.02, taper: 0 });
    b.slab('wood2', (ax + bx) * k / 2, y - 2.0, (az + bz) * k / 2, ax === bx ? 0.08 : 2.5 * k, 0.1, ax === bx ? 2.5 * k : 0.08, { parent: M, round: 0.02, taper: 0, rz: ax === bx ? 0 : 0.7, rx: ax === bx ? 0.7 : 0 });
  }
  b.slab('plank', 0, H - 0.1, 0, 4.0, 0.16, 4.0, { parent: M, round: 0.04, taper: 0, surf: PLANK });
  b.cyl('wood', 0, H + 0.05, 0, R, 2.9, 0, { parent: M, sides: 14, taper: 1.0, surf: PLANK });
  for (const y of [0.4, 1.5, 2.6]) b.cyl('iron', 0, H + 0.05 + y, 0, R + 0.04, 0.08, 0, { parent: M, sides: 14, taper: 1 });
  b.cone('roof2', 0, H + 2.9, 0, R + 0.35, 1.2, 0, { parent: M, sides: 14, curve: 1, surf: ROOF });
  b.ball('iron', 0, H + 4.1, 0, 0.12, { parent: M, detail: 0 });
}

// Windmill tower (static); build the rotor with windmillRotor() as a dynamic part and spin it about its local z.
export function windmill(b, x, z, o = {}) {
  const M = at(x, o.y || 0, z, o.ry || 0, o.parent), H = o.h ?? 9;
  b.contact(0, 0, 2.8, 2.8, { parent: M, k: 0.6 });
  const legs = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (const [sx, sz] of legs) b.slab('wood2', sx * 1.1, 0, sz * 1.1, 0.14, H + 0.2, 0.14, { parent: M, round: 0.02, taper: 0, rx: -sz * 0.11, rz: sx * 0.11 });
  for (let y = 1.5; y < H; y += 2.2) {
    const k = 1.1 - y * 0.11;
    for (let i = 0; i < 4; i++) {
      const [ax, az] = legs[i], [bx, bz] = legs[(i + 1) % 4];
      b.slab('wood2', (ax + bx) * k / 2, y, (az + bz) * k / 2, ax === bx ? 0.06 : 2 * k, 0.07, ax === bx ? 2 * k : 0.06, { parent: M, round: 0.01, taper: 0 });
    }
  }
  b.slab('plank', 0, H, 0, 0.9, 0.12, 0.9, { parent: M, round: 0.02, taper: 0 });
  b.slab('iron', 0, H + 0.1, -0.1, 0.32, 0.35, 0.9, { parent: M, round: 0.06, taper: 0 });
  b.slab('tin', 0, H + 0.2, -1.4, 0.04, 0.9, 1.4, { parent: M, round: 0.01, taper: 0 });
  return { hub: toWorld(M, 0, H + 0.3, 0.45), M };
}
export function windmillRotor(b, o = {}) {
  const R = o.r ?? 1.7, n = o.blades ?? 15;
  b.cyl('iron', 0, 0, -0.1, 0.18, 0.3, 0, { rx: Math.PI / 2, sides: 8, taper: 1 });
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const m = new THREE.Matrix4().makeRotationZ(a).multiply(new THREE.Matrix4().makeTranslation(0, R * 0.62, 0)).multiply(new THREE.Matrix4().makeRotationY(0.5));
    b.slab(i % 3 ? 'tin' : 'cream', 0, -R * 0.38, 0, 0.32, R * 0.76, 0.02, { parent: m, round: 0.01, taper: -0.4, noAo: true });
  }
  const ring = S.prism(18, R, R, 0.05);
  ring.rotateX(Math.PI / 2);
  b.add(ring, 'iron', { noAo: true, sy: 1 });
}

// Headstone / wooden cross for Boot Hill. kind: 'cross' | 'stone' | 'board'.
export function grave(b, x, z, o = {}) {
  const M = at(x, o.y || 0, z, o.ry || 0, o.parent), kind = o.kind || 'cross';
  b.slab('dirt', 0, -0.05, 0.6, 0.8, 0.2, 1.7, { parent: M, round: 0.15, taper: 0.2 });
  if (kind === 'stone') { b.slab('stone', 0, 0, 0, 0.7, 0.9, 0.16, { parent: M, round: 0.12, taper: 0.04, rz: o.tilt ?? 0 }); b.ball('stone', 0, 0.86, 0, 0.36, { parent: M, sz: 0.24, detail: 1, smooth: true }); }
  else if (kind === 'board') b.slab('wood2', 0, 0, 0, 0.5, 1.05, 0.06, { parent: M, round: 0.03, taper: 0.1, rz: o.tilt ?? 0.06 });
  else {
    b.slab('wood2', 0, 0, 0, 0.12, 1.25, 0.1, { parent: M, round: 0.02, taper: 0, rz: o.tilt ?? 0.08 });
    b.slab('wood2', 0, 0.8, 0.0, 0.62, 0.12, 0.1, { parent: M, round: 0.02, taper: 0, rz: o.tilt ?? 0.08 });
  }
  if (o.hat) b.add(o.hat, null, { parent: at(0, kind === 'cross' ? 1.25 : 1.15, 0, 0, M), noAo: true });
}

// Picket/rail fence between two points.
export function rail(b, x0, z0, x1, z1, o = {}) {
  const L = Math.hypot(x1 - x0, z1 - z0), ry = Math.atan2(x1 - x0, z1 - z0) - Math.PI / 2, n = Math.max(1, Math.round(L / (o.span ?? 2.4)));
  const M = at((x0 + x1) / 2, o.y || 0, (z0 + z1) / 2, ry, o.parent);
  for (let i = 0; i <= n; i++) b.slab('woodDark', -L / 2 + (L * i) / n, 0, 0, 0.13, o.h ?? 1.0, 0.13, { parent: M, round: 0.03, taper: 0.1 });
  for (const y of o.rails ?? [0.45, 0.85]) b.slab(o.slot || 'wood2', 0, y, 0.0, L, 0.09, 0.07, { parent: M, round: 0.02, taper: 0, rz: (b.rnd() - 0.5) * 0.02 });
}

// ---------------------------------------------------------------- yard & street dressing

// Wagon: 'flat' (flatbed, optional load), 'covered' (canvas hoops) or 'hay'. Front = +z (tongue).
export function wagon(b, x, z, o = {}) {
  const M = at(x, o.y || 0, z, o.ry || 0, o.parent), kind = o.kind || 'flat', L = o.l ?? 3.2, Wd = o.w ?? 1.5;
  b.contact(0, 0, Wd + 0.4, L + 0.4, { parent: M, k: 0.75 });
  b.slab(o.slot || 'wood2', 0, 0.75, 0, Wd, 0.14, L, { parent: M, round: 0.03, taper: 0, surf: PLANK });
  for (const s of [-1, 1]) b.slab(o.slot || 'wood2', s * (Wd / 2 - 0.04), 0.88, 0, 0.08, 0.38, L, { parent: M, round: 0.02, taper: 0, surf: PLANKX });
  for (const s of [-1, 1]) b.slab(o.slot || 'wood2', 0, 0.88, s * (L / 2 - 0.04), Wd, 0.38, 0.08, { parent: M, round: 0.02, taper: 0 });
  const wheelAt = (wx, wz, r) => {
    const W2 = at(wx, r, wz, Math.PI / 2, M);
    const ring = S.prism(14, r, r, 0.09, {}); ring.rotateX(Math.PI / 2); ring.translate(0, 0, -0.045);
    b.add(ring, 'woodDark', { parent: W2 });
    for (let i = 0; i < 6; i++) b.slab('wood', 0, -r * 0.95, 0, 0.05, r * 1.9, 0.04, { parent: W2.clone().multiply(new THREE.Matrix4().makeRotationZ((i * Math.PI) / 6)), round: 0.01, taper: 0 });
    b.cyl('iron', 0, -0.07, 0, 0.1, 0.14, 0, { parent: W2.clone().multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2)), sides: 7, taper: 1 });
  };
  for (const s of [-1, 1]) { wheelAt(s * (Wd / 2 + 0.08), -L * 0.32, 0.62); if (!(o.broken && s > 0)) wheelAt(s * (Wd / 2 + 0.08), L * 0.3, 0.5); }
  if (o.broken) { b.slab('woodDark', Wd / 2 + 0.4, 0, L * 0.45, 0.1, 0.1, 1.1, { parent: M, round: 0.02, taper: 0, ry: 0.4 }); }
  b.slab('woodDark', 0, 0.42, L / 2 + 0.9, 0.12, 0.1, 1.9, { parent: M, round: 0.02, taper: 0, rx: o.broken ? 0.3 : 0.18 });
  if (kind === 'covered') {
    for (let i = 0; i < 4; i++) {
      const hz = -L / 2 + 0.25 + (i * (L - 0.5)) / 3;
      const arch = new THREE.Matrix4().makeTranslation(0, 1.05, hz).premultiply(M);
      const g = new THREE.TorusGeometry(Wd / 2 + 0.05, 0.035, 4, 12, Math.PI);
      b.add(g.toNonIndexed(), 'woodDark', { parent: arch, noAo: true });
    }
    const cv = new THREE.CylinderGeometry(Wd / 2 + 0.08, Wd / 2 + 0.08, L - 0.2, 14, 3, true, -Math.PI / 2, Math.PI);
    cv.rotateX(-Math.PI / 2);
    b.add(cv.toNonIndexed(), 'cloth', { parent: new THREE.Matrix4().makeTranslation(0, 1.05, 0).premultiply(M), noAo: true });
  } else if (kind === 'hay') {
    b.slab('hay', 0, 0.88, 0, Wd - 0.15, 0.85, L - 0.2, { parent: M, round: 0.35, taper: 0.12 });
  } else if (o.load) {
    for (let i = 0; i < 3; i++) barrel(b, (i % 2 ? 0.35 : -0.35), -0.6 + i * 0.7, { parent: M, y: 0.89, s: 0.75 });
    crate(b, 0, 1.15, { parent: M, y: 0.89, s: 0.6, ry: 0.3 });
  }
  return M;
}

// Sagebrush / dry bush ball, cow skull, lumber pile, washing line, wood pile, doghouse.
export function sage(b, x, z, o = {}) {
  const s = o.s ?? 1;
  b.ball(o.slot || 'scrub', x, (o.y || 0) + 0.28 * s, z, 0.45 * s, { sy: 0.65, detail: 1, ry: b.rnd() * 6, sway: 0.03 });
  b.ball('leafDark', x + 0.15 * s, (o.y || 0) + 0.22 * s, z + 0.1 * s, 0.3 * s, { sy: 0.7, detail: 0 });
}
export function skull(b, x, z, o = {}) {
  const M = at(x, o.y || 0, z, o.ry ?? b.rnd() * 6, o.parent);
  b.ball('bone', 0, 0.12, 0, 0.16, { parent: M, sx: 0.9, sz: 1.3, sy: 0.7, detail: 1 });
  b.ball('dark', 0.06, 0.15, 0.12, 0.035, { parent: M, detail: 0 });
  b.ball('dark', -0.06, 0.15, 0.12, 0.035, { parent: M, detail: 0 });
  for (const s of [-1, 1]) b.cone('bone', s * 0.13, 0.17, -0.05, 0.05, 0.45, 0, { parent: M, sides: 5, rz: -s * 1.3, rx: -0.2, curve: 1.2 });
}
export function lumber(b, x, z, o = {}) {
  const M = at(x, o.y || 0, z, o.ry || 0, o.parent), n = o.n ?? 9;
  b.contact(0, 0, 3.4, 1.4, { parent: M, k: 0.6 });
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / 4), col = i % 4;
    b.slab(i % 3 ? 'raw' : 'wood', -0.5 + col * 0.33 + row * 0.16, row * 0.2, 0, 0.3, 0.18, 3.2 - row * 0.2, { parent: M, round: 0.03, taper: 0, ry: (col - 1.5) * 0.02 });
  }
}
export function washLine(b, x, z, o = {}) {
  const M = at(x, o.y || 0, z, o.ry || 0, o.parent), L = o.l ?? 4.5;
  for (const s of [-1, 1]) b.slab('woodDark', s * L / 2, 0, 0, 0.1, 2.1, 0.1, { parent: M, round: 0.02, taper: 0.1 });
  b.slab('cloth', 0, 1.95, 0, L, 0.02, 0.02, { parent: M, round: 0.005, taper: 0, noAo: true });
  const items = o.items || [['red', 0.55, 0.9, 1], ['cloth', 0.6, 0.5, 0], ['red', 0.55, 0.9, 1], ['blue', 0.5, 0.45, 0], ['cream', 0.7, 0.55, 0]];
  items.forEach(([slot, w, h, legs], i) => {
    const ix = -L / 2 + 0.5 + i * ((L - 1) / Math.max(1, items.length - 1));
    if (legs) { // long johns: body + two legs (the Garter gag, a constant joke on the line)
      b.slab(slot, ix, 1.92 - h * 0.45, 0, w, h * 0.45, 0.04, { parent: M, round: 0.02, taper: 0, sway: 0.12 });
      for (const s of [-1, 1]) b.slab(slot, ix + s * w * 0.24, 1.92 - h, 0, w * 0.4, h * 0.56, 0.04, { parent: M, round: 0.02, taper: 0.1, sway: 0.16 });
    } else b.slab(slot, ix, 1.92 - h, 0, w, h, 0.03, { parent: M, round: 0.02, taper: -0.05, sway: 0.14 });
  });
}
export function woodPile(b, x, z, o = {}) {
  const M = at(x, o.y || 0, z, o.ry || 0, o.parent);
  b.contact(0, 0, 1.6, 0.9, { parent: M, k: 0.6 });
  for (let i = 0; i < 10; i++) {
    const row = i < 4 ? 0 : i < 7 ? 1 : i < 9 ? 2 : 3, col = [0, 1, 2, 3, 0, 1, 2, 0, 1, 0][i];
    const L2 = at(-0.45 + col * 0.3 + row * 0.15, 0.13 + row * 0.24, 0, 0, M).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
    b.cyl(i % 3 ? 'wood' : 'raw', 0, -0.45, 0, 0.13, 0.9, 0, { parent: L2, sides: 7, taper: 1 });
  }
  b.slab('raw', 0.8, 0, 0.1, 0.5, 0.45, 0.5, { parent: M, round: 0.08, taper: 0.1 });
}
export function doghouse(b, x, z, o = {}) {
  const M = at(x, o.y || 0, z, o.ry || 0, o.parent);
  b.contact(0, 0, 1.3, 1.4, { parent: M, k: 0.7 });
  b.slab(o.slot || 'red', 0, 0, 0, 1.0, 0.75, 1.2, { parent: M, round: 0.05, taper: 0, surf: CLAP });
  b.roof('roof2', 0, 0.74, 0, 1.0, 0.45, 1.2, 0, { parent: M, over: 0.12 });
  b.slab('dark', 0, 0.02, 0.6, 0.4, 0.5, 0.04, { parent: M, round: 0.18, taper: 0, noAo: true });
  b.slab('bone', 0.6, 0.02, 0.8, 0.28, 0.06, 0.08, { parent: M, round: 0.03, taper: 0, ry: 0.5 });
}
