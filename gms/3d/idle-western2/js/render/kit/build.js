import * as THREE from 'three';
import * as S from './shape.js?v=20261004g';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(),
  _s = new THREE.Vector3(), _n3 = new THREE.Matrix3(), _c = new THREE.Color();

// Surface response per slot name; palettes may override with { c, r, m, g }.
export const SLOT_PBR = {
  glass: [0.08, 0.15, 0], bottle: [0.1, 0.12, 0], iron: [0.3, 0.72, 0], brass: [0.28, 0.85, 0], window: [0.1, 0.1, -1], metal: [0.32, 0.75, 0], chrome: [0.18, 0.9, 0], gold: [0.25, 0.9, 0],
  neon: [0.5, 0, 1.6], bulb: [0.4, 0, 1.3], lamp: [0.4, 0, -1], paint: [0.45, 0.05, 0], car: [0.3, 0.1, 0], water: [0.1, 0, 0],
  tile: [0.7, 0, 0], ceramic: [0.3, 0, 0], plastic: [0.5, 0, 0], leaf: [0.85, 0, 0], foliage: [0.85, 0, 0],
};

export function resolveSlot(palette, slot) {
  let v = typeof slot === 'string' && slot[0] !== '#' ? palette[slot] : slot;
  if (v === undefined) v = 0xff00ff;
  const base = SLOT_PBR[slot] || null;
  if (v && typeof v === 'object' && !Array.isArray(v) && !v.isColor) {
    return { c: v.c, r: v.r ?? base?.[0] ?? 0.8, m: v.m ?? base?.[1] ?? 0, g: v.g ?? base?.[2] ?? 0 };
  }
  return { c: v, r: base?.[0] ?? 0.82, m: base?.[1] ?? 0, g: base?.[2] ?? 0 };
}

export function mergeParts(parts, { ao = 0.35, aoH = 0.9, speckle = 0.05, seed = 1, extra = null } = {}) {
  let n = 0;
  for (const p of parts) n += p.geo.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3), pbr = new Float32Array(n * 4);
  const ex = extra ? Object.fromEntries(extra.map((k) => [k, new Float32Array(n)])) : null;
  let o = 0, r = seed >>> 0;
  const rnd = () => { r = (r * 1664525 + 1013904223) >>> 0; return r / 4294967296; };
  for (const p of parts) {
    const P = p.geo.attributes.position, N = p.geo.attributes.normal, C = p.geo.attributes.color, A = p.geo.attributes.aPbr, SF = p.geo.attributes.aSurf;
    _n3.getNormalMatrix(p.m);
    const tint = p.color != null ? S.rgb(p.color) : null;
    const pb = p.pbr;
    let f = 1;
    for (let i = 0; i < P.count; i++, o++) {
      if (i % 3 === 0) f = 1 + (rnd() - 0.5) * 2 * (p.speckle ?? speckle);
      _v.fromBufferAttribute(P, i).applyMatrix4(p.m);
      pos[o * 3] = _v.x; pos[o * 3 + 1] = _v.y; pos[o * 3 + 2] = _v.z;
      const k = (ao > 0 && !p.noAo ? 1 - ao * Math.min(1, Math.max(0, 1 - (_v.y - (p.aoBase ?? 0)) / aoH)) : 1) * f;
      if (tint) { col[o * 3] = tint[0] * k; col[o * 3 + 1] = tint[1] * k; col[o * 3 + 2] = tint[2] * k; }
      else if (C) { col[o * 3] = C.getX(i) * k; col[o * 3 + 1] = C.getY(i) * k; col[o * 3 + 2] = C.getZ(i) * k; }
      else { col[o * 3] = col[o * 3 + 1] = col[o * 3 + 2] = k; }
      if (pb) { pbr[o * 4] = pb[0]; pbr[o * 4 + 1] = pb[1]; pbr[o * 4 + 2] = pb[2]; pbr[o * 4 + 3] = 1 + (pb[3] || 0) * Math.max(0, _v.y - (p.aoBase ?? 0)); }
      else if (A) { pbr[o * 4] = A.getX(i); pbr[o * 4 + 1] = A.getY(i); pbr[o * 4 + 2] = A.getZ(i); pbr[o * 4 + 3] = 1; }
      else { pbr[o * 4] = 0.82; pbr[o * 4 + 3] = 1; }
      if (SF) pbr[o * 4 + 3] = SF.getX(i);
      else if (p.surf === WOOD) { if (!pb?.[3]) pbr[o * 4 + 3] = p.wax ??= woodAxis(p.geo, p.m); }
      else if (p.surf != null) pbr[o * 4 + 3] = p.surf;
      if (N) {
        _v.fromBufferAttribute(N, i).applyMatrix3(_n3).normalize();
        nor[o * 3] = _v.x; nor[o * 3 + 1] = _v.y; nor[o * 3 + 2] = _v.z;
      }
      if (ex) for (const k2 in ex) ex[k2][o] = p.extra?.[k2] ?? 0;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aPbr', new THREE.BufferAttribute(pbr, 4));
  if (ex) for (const k in ex) g.setAttribute(k, new THREE.BufferAttribute(ex[k], 1));
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

// aPbr.w < 0.5 selects a procedural surface (kit/surface.js): DIRT(k) street dirt, CLAP clapboard, PLANK/PLANKX boards,
// GRASS desert scrub, ROOF shingle courses, TIN corrugated sheet. `cobble` is the old name for DIRT.
export const GRASS = 0.25;
export const ROOF = 0.4;
export const TIN = 0.44;
export const CLAP = 0.1;
export const PLANK = 0.18;
export const PLANKX = 0.21;
export const DIRT = (wet = 0) => -1 - Math.max(0, Math.min(1, wet));
export const cobble = DIRT;
export const SURF = { GRASS, ROOF, TIN, CLAP, PLANK, PLANKX, DIRT };
const GRASS_SLOTS = new Set(['grass', 'grass2', 'lawn']);
// R5 wood grain: 'W' resolves at merge time to WOOD_X/Y/Z (0.27/0.28/0.29) = the world axis of the part's long side.
export const WOOD = 'W';
const AUTO_SURF = { plank: PLANK, plank2: PLANK, plank3: PLANK, road: DIRT(0), dirt: DIRT(0.15), rut: DIRT(0.5), wood: WOOD, wood2: WOOD, woodDark: WOOD, raw: WOOD, door: WOOD, trunk: WOOD };
const _bx = new THREE.Vector3(), _ax = new THREE.Vector3();
function woodAxis(geo, m) {
  if (!geo.boundingBox) geo.computeBoundingBox();
  geo.boundingBox.getSize(_bx);
  const e = m.elements;
  let best = -1, bi = 0;
  for (let i = 0; i < 3; i++) {
    const L = Math.hypot(e[i * 4], e[i * 4 + 1], e[i * 4 + 2]) * _bx.getComponent(i);
    if (L > best) { best = L; bi = i; }
  }
  _ax.set(Math.abs(e[bi * 4]), Math.abs(e[bi * 4 + 1]), Math.abs(e[bi * 4 + 2]));
  return _ax.x >= _ax.y && _ax.x >= _ax.z ? 0.27 : _ax.y >= _ax.z ? 0.28 : 0.29;
}

const cache = new Map();
const unit = (key, make) => { let g = cache.get(key); if (!g) { g = make(); cache.set(key, g); } return g; };

export function createBuilder(materials, palette = {}, { seed = 7 } = {}) {
  const parts = [], contacts = [];
  let aoStrength = 0.32, rs = seed >>> 0;
  const rnd = () => { rs = (rs * 1664525 + 1013904223) >>> 0; return rs / 4294967296; };

  // opts: x,y,z | pos, ry, rx, rz, s|sx,sy,sz ; slot = palette slot, hex, or null to keep the geometry's own colours.
  function add(geo, slot, o = {}) {
    const s = o.scale ?? 1;
    const sx = o.sx ?? (Array.isArray(s) ? s[0] : s), sy = o.sy ?? (Array.isArray(s) ? s[1] : s), sz = o.sz ?? (Array.isArray(s) ? s[2] : s);
    _e.set(o.rx || 0, o.ry || 0, o.rz || 0, 'YXZ');
    _q.setFromEuler(_e);
    const p = o.pos || [o.x || 0, o.y || 0, o.z || 0];
    _m.compose(_v.set(p[0], p[1], p[2]), _q, _s.set(sx, sy, sz));
    if (o.parent) _m.premultiply(o.parent);
    let color = null, pbr = null;
    if (slot != null) {
      const rs2 = resolveSlot(palette, slot);
      color = rs2.c;
      pbr = [o.r ?? rs2.r, o.m ?? rs2.m, o.g ?? rs2.g, o.sway || 0];
    } else if (o.r != null || o.g != null || o.sway) pbr = [o.r ?? 0.8, o.m ?? 0, o.g ?? 0, o.sway || 0];
    const surf = o.surf !== undefined ? o.surf : GRASS_SLOTS.has(slot) ? GRASS : AUTO_SURF[slot];
    parts.push({ geo, m: _m.clone(), color, pbr, noAo: o.noAo, aoBase: o.aoBase, speckle: o.speckle, surf });
    return b;
  }

  const b = {
    palette,
    rnd,
    add,
    shape: S,
    slab(slot, x, y, z, w, h, d, o = {}) {
      const r = o.round ?? Math.min(0.12, Math.min(w, h, d) * 0.22);
      const tp = o.taper ?? 0.02;
      const g = unit(`slab:${w.toFixed(2)}:${h.toFixed(2)}:${d.toFixed(2)}:${r.toFixed(3)}:${tp}`, () => S.block(w, h, d, { cut: r, taper: tp }));
      return add(g, slot, { ...o, x, y, z });
    },
    box(slot, x, y, z, sx, sy, sz, ry = 0) { return b.slab(slot, x, y, z, sx, sy, sz, { ry }); },
    tilt(slot, x, y, z, sx, sy, sz, ry = 0, rx = 0, rz = 0) { return b.slab(slot, x, y, z, sx, sy, sz, { ry, rx, rz }); },
    cyl(slot, x, y, z, r, h, ry = 0, o = {}) {
      const sides = o.sides ?? 9, t = o.taper ?? 0.88;
      return add(unit(`cyl:${sides}:${t}`, () => S.prism(sides, 1, t, 1)), slot, { ...o, x, y, z, sx: r, sy: h, sz: r, ry });
    },
    disc(slot, x, y, z, r, h, o = {}) {
      return add(unit('disc:11', () => S.prism(11, 1, 0.94, 1)), slot, { ...o, x, y, z, sx: r, sy: h, sz: r });
    },
    cone(slot, x, y, z, r, h, ry = 0, o = {}) {
      return add(unit(`cone:${o.sides ?? 7}`, () => S.spire(o.sides ?? 7, 1, 1, { curve: o.curve ?? 1.15, rings: 3 })), slot, { ...o, x, y, z, sx: r, sy: h, sz: r, ry });
    },
    ball(slot, x, y, z, r, o = {}) {
      const d = o.detail ?? 1;
      return add(unit(`ball:${d}:${o.smooth ? 1 : 0}`, () => { const g = S.blob(1, d, { jitter: 0.06, rng: mulberry(d * 7 + 3) }); return o.smooth ? S.smooth(g) : g; }),
        slot, { ...o, x, y, z, sx: r * (o.sx ?? 1), sy: r * (o.sy ?? 1), sz: r * (o.sz ?? 1) });
    },
    roof(slot, x, y, z, w, h, d, ry = 0, o = {}) {
      return add(S.gable(w, d, h, { over: o.over ?? 0.25 }), slot, { ...o, x, y, z, ry });
    },
    hip(slot, x, y, z, w, h, d, ry = 0, o = {}) {
      return add(S.hip(w, d, h, { over: o.over ?? 0.25 }), slot, { ...o, x, y, z, ry });
    },
    // Striped canopy: a gently curved sheet sloping toward +z (front) with a scalloped valance.
    awning(slot, x, y, z, w, d, ry = 0, o = {}) {
      const n = o.stripes ?? Math.max(3, Math.round(w / 0.42) | 1);
      const alt = o.alt ?? 'white';
      const drop = o.drop ?? d * 0.55;
      const c = Math.cos(ry), s = Math.sin(ry);
      const P = (lx, ly, lz) => [x + lx * c + lz * s, y + ly, z - lx * s + lz * c];
      for (let i = 0; i < n; i++) {
        const m = new S.Mesh();
        const x0 = -w / 2 + (i / n) * w, x1 = -w / 2 + ((i + 1) / n) * w, xm = (x0 + x1) / 2;
        const col = resolveSlot(palette, i % 2 ? alt : slot).c;
        const rows = 4;
        for (let k = 0; k < rows; k++) {
          const t0 = k / rows, t1 = (k + 1) / rows;
          const zA = -d / 2 + t0 * d, zB = -d / 2 + t1 * d;
          const yA = -drop * Math.pow(t0, 1.4) + Math.sin(t0 * Math.PI) * 0.06, yB = -drop * Math.pow(t1, 1.4) + Math.sin(t1 * Math.PI) * 0.06;
          m.quad(P(x0, yA, zA), P(x0, yB, zB), P(x1, yB, zB), P(x1, yA, zA), col);
          m.quad(P(x1, yA - 0.03, zA), P(x1, yB - 0.03, zB), P(x0, yB - 0.03, zB), P(x0, yA - 0.03, zA), col);
        }
        const yE = -drop, zE = d / 2, v = 0.2;
        m.quad(P(x0, yE, zE), P(x0, yE - v * 0.6, zE + 0.01), P(xm, yE - v, zE + 0.01), P(xm, yE, zE), col);
        m.quad(P(xm, yE, zE), P(xm, yE - v, zE + 0.01), P(x1, yE - v * 0.6, zE + 0.01), P(x1, yE, zE), col);
        m.quad(P(xm, yE, zE - 0.01), P(xm, yE - v, zE), P(x0, yE - v * 0.6, zE), P(x0, yE, zE - 0.01), col);
        m.quad(P(x1, yE, zE - 0.01), P(x1, yE - v * 0.6, zE), P(xm, yE - v, zE), P(xm, yE, zE - 0.01), col);
        add(m.geo(), null, { r: 0.75, noAo: true, parent: o.parent });
      }
      return b;
    },
    tree(kind, x, z, s = 1, o = {}) {
      const ry = rnd() * 6.28, lean = (rnd() - 0.5) * 0.12;
      if (kind === 'pine') {
        b.cyl('trunk', x, 0, z, 0.16 * s, 1.0 * s, ry, { sides: 5, taper: 0.6 });
        for (let i = 0; i < 3; i++) b.cone(i === 1 ? 'leaf2' : 'leaf', x, (0.7 + i * 0.75) * s, z, (1.15 - i * 0.28) * s, (1.4 - i * 0.2) * s, ry + i, { sway: 0.05, rx: lean });
      } else {
        b.cyl('trunk', x, 0, z, 0.17 * s, 1.6 * s, ry, { sides: 5, taper: 0.62, rz: lean });
        b.ball('leaf', x + lean * 2 * s, 2.1 * s, z, 1.05 * s, { sy: 0.92, ry, sway: 0.08, aoBase: 1.2 * s });
        if (o.full !== false) b.ball('leaf2', x + 0.55 * s, 1.75 * s, z + 0.25 * s, 0.62 * s, { ry: ry + 1, sway: 0.08, aoBase: 1.2 * s });
      }
      return b;
    },
    // Soft contact shadow on the ground under a footprint (sx × sz metres), drawn by the owner's contact mesh.
    contact(x, z, sx, sz, o = {}) {
      let y = o.y ?? 0, ry = o.ry || 0;
      if (o.parent) {
        _v.set(x, y, z).applyMatrix4(o.parent);
        const e = o.parent.elements;
        ry += Math.atan2(e[8], e[0]);
        x = _v.x; y = _v.y; z = _v.z;
      }
      contacts.push([x, y, z, sx, sz, ry, o.k ?? 1, o.m ?? Math.min(0.55, 0.12 + 0.12 * Math.max(sx, sz))]);
      return b;
    },
    contacts,
    lamps: [],
    ao(strength) { aoStrength = strength; return b; },
    get count() { return parts.length; },
    geometry(o = {}) { return mergeParts(parts, { ao: aoStrength, seed, ...o }); },
    finish(o = {}) {
      const mesh = new THREE.Mesh(mergeParts(parts, { ao: aoStrength, seed, ...o }), o.material || materials.uber);
      mesh.castShadow = o.cast !== false;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      return mesh;
    },
    clear() { parts.length = 0; contacts.length = 0; return b; },
  };
  return b;
}

function mulberry(a) {
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), a | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// One transparent mesh of soft contact quads (rows of [x, y, z, sx, sz, ry, k]). Lifted above the cobble relief.
export function contactMesh(materials, rows) {
  const n = rows.length;
  const pos = new Float32Array(n * 18), uv = new Float32Array(n * 12), col = new Float32Array(n * 24);
  const U = [[0, 0], [1, 0], [1, 1], [0, 0], [1, 1], [0, 1]];
  rows.forEach(([x, y, z, sx, sz, ry, k, mg = 0.3], i) => {
    const c = Math.cos(ry), s = Math.sin(ry);
    U.forEach(([u, v], j) => {
      const lx = (u - 0.5) * (sx + mg * 2), lz = (0.5 - v) * (sz + mg * 2);
      const o = i * 6 + j;
      pos[o * 3] = x + lx * c + lz * s; pos[o * 3 + 1] = y + 0.09; pos[o * 3 + 2] = z - lx * s + lz * c;
      uv[o * 2] = u; uv[o * 2 + 1] = v;
      col[o * 4] = col[o * 4 + 1] = col[o * 4 + 2] = 1; col[o * 4 + 3] = Math.min(1, k);
    });
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.BufferAttribute(col, 4));
  g.computeBoundingSphere();
  const m = new THREE.Mesh(g, materials.contact);
  m.renderOrder = 1;
  m.castShadow = m.receiveShadow = false;
  m.matrixAutoUpdate = false;
  m.name = 'contact';
  m.raycast = () => {};
  return m;
}
