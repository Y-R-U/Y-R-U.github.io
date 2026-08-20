// Reusable building parts: openings, stone dressings, crenellation, roof crests, footings, debris.
// Everything here returns raw geometry in a local frame and is meant to be merged by a Batch.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { getMaterial } from './materials.js';

const KEEP = ['position', 'normal', 'uv'];

// mergeGeometries needs every input to agree on attributes and indexing.
function normalize(g) {
  if (g.index) g = g.toNonIndexed();
  for (const k of Object.keys(g.attributes)) if (!KEEP.includes(k)) g.deleteAttribute(k);
  if (!g.attributes.uv) {
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  }
  g.clearGroups();
  return g;
}

// Box-project UVs at world scale (1 unit = 1 uv). Primitives ship 0..1 UVs, which would
// stretch one stone across a whole merlon and shrink it on a wall — this keeps one size
// of stone across every part of the kit.
function projectUV(g) {
  const p = g.attributes.position, n = p.count;
  const uv = new Float32Array(n * 2);
  for (let i = 0; i < n; i += 3) {
    const ax = p.getX(i), ay = p.getY(i), az = p.getZ(i);
    const ux = p.getX(i + 1) - ax, uy = p.getY(i + 1) - ay, uz = p.getZ(i + 1) - az;
    const vx = p.getX(i + 2) - ax, vy = p.getY(i + 2) - ay, vz = p.getZ(i + 2) - az;
    const anx = Math.abs(uy * vz - uz * vy), any = Math.abs(uz * vx - ux * vz), anz = Math.abs(ux * vy - uy * vx);
    const axis = any >= anx && any >= anz ? 1 : anx >= anz ? 0 : 2;
    for (let k = 0; k < 3; k++) {
      const j = i + k, x = p.getX(j), y = p.getY(j), z = p.getZ(j);
      uv[j * 2] = axis === 0 ? z : x;
      uv[j * 2 + 1] = axis === 1 ? z : y;
    }
  }
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
}

export function rng(seed) {
  let s = (seed >>> 0) || 0x9e3779b9;
  const next = () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
  // rng(R.state()) continues the sequence exactly, which is how the demo's per-object seeds
  // are recorded without changing a single draw.
  next.state = () => s;
  return next;
}

export const pick = (R, arr) => arr[Math.min(arr.length - 1, Math.floor(R() * arr.length))];
export const span = (R, a, b) => a + R() * (b - a);

export function T(x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0) {
  const m = new THREE.Matrix4();
  m.makeRotationFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ'));
  m.setPosition(x, y, z);
  return m;
}

export class Batch {
  constructor(zoneId) { this.zoneId = zoneId; this.parts = new Map(); }

  add(surface, geo, m, keepUV) {
    const g = normalize(geo);
    if (m) g.applyMatrix4(m);
    if (!keepUV) projectUV(g);
    let arr = this.parts.get(surface);
    if (!arr) this.parts.set(surface, arr = []);
    arr.push(g);
    return this;
  }

  build(group = new THREE.Group()) {
    for (const [surface, arr] of this.parts) {
      if (!arr.length) continue;
      group.add(mergedMesh(this.zoneId, surface, arr));
    }
    this.parts.clear();
    return group;
  }
}

export function mergedMesh(zoneId, surface, geos) {
  const geo = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
  const mesh = new THREE.Mesh(geo, getMaterial(zoneId, surface));
  mesh.name = surface;
  mesh.castShadow = surface !== 'glass' && surface !== 'crest';
  mesh.receiveShadow = surface !== 'glass';
  return mesh;
}

const V2 = (x, y) => new THREE.Vector2(x, y);

function qbez(p0, p1, p2, t) {
  const u = 1 - t;
  return [u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]];
}

// Counter-clockwise outline of an opening: base on y=0, centred on x.
export function openingPts(kind, w, h) {
  const hw = w / 2;
  const pts = [[-hw, 0], [hw, 0]];
  if (kind === 'arch') {
    const spring = Math.max(h - hw, h * 0.42);
    pts.push([hw, spring]);
    for (let i = 1; i <= 8; i++) {
      const a = (i / 8) * Math.PI;
      pts.push([Math.cos(a) * hw, spring + Math.sin(a) * (h - spring)]);
    }
  } else if (kind === 'lancet') {
    const spring = h * 0.5;
    pts.push([hw, spring]);
    for (let i = 1; i <= 5; i++) pts.push(qbez([hw, spring], [hw * 0.86, h * 0.82], [0, h], i / 5));
    for (let i = 1; i <= 5; i++) pts.push(qbez([0, h], [-hw * 0.86, h * 0.82], [-hw, spring], i / 5));
  } else {
    pts.push([hw, h], [-hw, h]);
  }
  return pts;
}

export function openingShape(kind, w, h, dy = 0) {
  return new THREE.Shape(openingPts(kind, w, h).map(p => V2(p[0], p[1] + dy)));
}

export function extrude(shape, depth, holes) {
  if (holes) shape.holes = holes;
  return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 4 });
}

// A pane sits inside a reveal and is only ever seen from the front, so it does not need the
// eight side triangles and the back cap an extrusion gives it. Two thousand panes across the
// three districts made this worth ~19k triangles.
export function flat(shape) {
  return new THREE.ShapeGeometry(shape, 4);
}

export function rectShape(w, h, y0 = 0) {
  const hw = w / 2;
  return new THREE.Shape([V2(-hw, y0), V2(hw, y0), V2(hw, y0 + h), V2(-hw, y0 + h)]);
}

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

// Box with independent top and bottom footprints. Centred like BoxGeometry.
export function taperBox(topW, topD, h, botW = topW, botD = topD) {
  const g = new THREE.BoxGeometry(1, h, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const top = p.getY(i) > 0;
    p.setX(i, p.getX(i) * (top ? topW : botW));
    p.setZ(i, p.getZ(i) * (top ? topD : botD));
  }
  g.computeVertexNormals();
  return g;
}

// A window or door. `m` puts the opening base-centre on the outer wall face with +z pointing out.
// The caller is responsible for punching the matching hole in its wall panel.
export function addOpening(b, { kind, w, h, m, reveal = 0.3, glass = true, bars = true, sill = true, head = true, surround = 'trim', pane = 'glass' }) {
  const e = 0.21;
  const ring = openingShape(kind, w + e * 2, h + e * 1.5);
  ring.holes = [openingShape(kind, w, h, 0.09)];
  b.add(surround, extrude(ring, 0.17), m.clone().multiply(T(0, 0, -0.03)));

  if (glass) {
    b.add(pane, flat(openingShape(kind, w - 0.12, h - 0.1, 0.05)), m.clone().multiply(T(0, 0, -reveal + 0.05)));
  }
  if (bars) {
    const z = -reveal + 0.07;
    b.add(surround, box(0.06, h - 0.12, 0.06), m.clone().multiply(T(0, h * 0.5, z)));
    if (h > 1.6) b.add(surround, box(w - 0.1, 0.06, 0.06), m.clone().multiply(T(0, h * 0.52, z)));
  }
  if (sill) {
    const sd = reveal + 0.46;
    b.add(surround, box(w + 0.74, 0.2, sd), m.clone().multiply(T(0, -0.06, 0.24 - sd / 2)));
    b.add(surround, taperBox(w + 0.5, sd * 0.72, 0.14, w + 0.62, sd * 0.8), m.clone().multiply(T(0, -0.23, 0.18 - sd * 0.36)));
  }
  if (head) {
    if (kind === 'square') {
      b.add(surround, box(w + 0.78, 0.26, 0.28), m.clone().multiply(T(0, h + e * 1.5 + 0.13, 0.05)));
    } else {
      b.add(surround, taperBox(0.44, 0.3, 0.46, 0.28, 0.28), m.clone().multiply(T(0, h + 0.09, 0.05)));
    }
  }
}

// Merlons along local x, base at y=0, wall running through z=0.
// The crest sits on the merlon caps rather than floating over the gaps.
export function addMerlons(b, R, { m, length, thickness, style, height = 1.15, step = 1.9, surface = 'wall', cap = 'trim', crest, crestSurface = 'crest' }) {
  const n = Math.max(2, Math.round(length / step));
  const s = length / n;
  const mw = s * 0.72;
  for (let i = 0; i < n; i++) {
    if (R() < 0.05) continue;                       // a gap where the parapet has gone
    const x = -length / 2 + s * (i + 0.5);
    const damaged = R() < 0.1;
    const h = height * (damaged ? span(R, 0.35, 0.55) : span(R, 0.92, 1.12));
    const t = thickness * span(R, 0.95, 1.0);
    b.add(surface, box(mw, h, t), m.clone().multiply(T(x, h / 2, 0)));
    if (damaged) continue;
    let capTop = h;
    if (style === 'sharp') {
      b.add(cap, new THREE.ConeGeometry(mw * 0.72, 0.34, 4).rotateY(Math.PI / 4), m.clone().multiply(T(x, h + 0.17, 0)));
      capTop = h + 0.34;
    } else if (style === 'curved') {
      b.add(cap, new THREE.CylinderGeometry(mw * 0.46, mw * 0.46, t + 0.1, 7, 1, false, 0, Math.PI).rotateX(-Math.PI / 2), m.clone().multiply(T(x, h - 0.02, 0)));
      capTop = h + mw * 0.44;
    } else {
      b.add(cap, box(mw + 0.14, 0.12, t + 0.14), m.clone().multiply(T(x, h + 0.06, 0)));
      capTop = h + 0.12;
    }
    if (!crest || crest.type === 'none' || R() > crest.density) continue;
    if (crest.type === 'spikes') {
      const sh = span(R, 0.7, 1.1);
      b.add(crestSurface, new THREE.ConeGeometry(0.075, sh, 4).rotateY(Math.PI / 4), m.clone().multiply(T(x, capTop + sh / 2, 0)));
    } else {
      b.add(crestSurface, new THREE.SphereGeometry(0.15, 7, 5).scale(1, 1.5, 1), m.clone().multiply(T(x, capTop + 0.14, 0)));
    }
  }
}

// Corbel table: little blocks under an overhanging walkway lip. Reads as machicolation.
export function addCorbels(b, { m, length, thickness, step = 1.15, surface = 'trim' }) {
  const n = Math.max(2, Math.round(length / step));
  const s = length / n;
  for (let i = 0; i < n; i++) {
    const x = -length / 2 + s * (i + 0.5);
    for (const side of [-1, 1]) {
      b.add(surface, taperBox(0.34, 0.52, 0.44, 0.19, 0.26), m.clone().multiply(T(x, -0.22, side * (thickness / 2 + 0.14))));
    }
  }
}

// Roofline character. Everything comes from zones.js `crest`.
export function addCrest(b, crest, R, { m, length, surface = 'crest' }) {
  if (!crest || crest.type === 'none' || !crest.density) return;
  const step = 1.4 / Math.max(0.15, crest.density);
  const n = Math.max(1, Math.round(length / step));
  const s = length / n;

  if (crest.type === 'spikes') {
    for (let i = 0; i < n; i++) {
      const x = -length / 2 + s * (i + 0.5);
      const h = span(R, 0.7, 1.25);
      b.add(surface, new THREE.ConeGeometry(0.085, h, 4).rotateY(Math.PI / 4), m.clone().multiply(T(x, h / 2, 0)));
    }
    for (const side of [-1, 1]) {
      const h = 1.9;
      b.add(surface, new THREE.SphereGeometry(0.18, 6, 5), m.clone().multiply(T(side * length / 2, 0.14, 0)));
      b.add(surface, new THREE.ConeGeometry(0.13, h, 4).rotateY(Math.PI / 4), m.clone().multiply(T(side * length / 2, 0.2 + h / 2, 0)));
    }
  } else if (crest.type === 'wing') {
    // arches whose feet sit on the ridge — soft, and never reads as floating
    for (let i = 0; i < n; i++) {
      const x = -length / 2 + s * (i + 0.5);
      const r = span(R, 0.24, 0.34);
      const g = new THREE.TorusGeometry(r, 0.055, 4, 9, Math.PI);
      b.add(surface, g, m.clone().multiply(T(x, 0.02, 0)));
    }
    for (const side of [-1, 1]) {
      const x = side * length / 2;
      b.add(surface, new THREE.CylinderGeometry(0.07, 0.09, 0.75, 6), m.clone().multiply(T(x, 0.37, 0)));
      b.add(surface, new THREE.SphereGeometry(0.24, 8, 6), m.clone().multiply(T(x, 0.86, 0)));
      b.add(surface, new THREE.SphereGeometry(0.13, 7, 5), m.clone().multiply(T(x, 1.16, 0)));
    }
  }
}

// Solid roof slab with real eaves thickness. `profile` 'curved' gives the flared Tiny Glade kick.
export function roofSlab({ w, d, rise, over = 0.5, th = 0.3, profile = 'flat' }) {
  const hw = w / 2 + over;
  const n = profile === 'curved' ? 4 : 1;
  const p = profile === 'curved' ? 0.72 : 1;
  const top = [];
  for (let i = -n; i <= n; i++) {
    const t = i / n;
    top.push([t * hw, rise * (1 - Math.pow(Math.abs(t), p))]);
  }
  const dv = th * Math.hypot(hw, rise) / hw;
  const pts = top.map(q => V2(q[0], q[1]));
  for (let i = top.length - 1; i >= 0; i--) pts.push(V2(top[i][0], top[i][1] - dv));
  const depth = d + over * 2;
  const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth, bevelEnabled: false });
  g.translate(0, 0, -depth / 2);
  return g;
}

// The wall that closes the triangle between a wall head and the underside of its roof.
// Without this you look straight through the building into the roof void.
export function gableShape(spanW, rise, over, profile, th, inset = 0.03) {
  const half = spanW / 2 - inset;
  const hw = spanW / 2 + over;
  const dv = th * Math.hypot(hw, rise) / hw;
  const n = profile === 'curved' ? 4 : 1;
  const p = profile === 'curved' ? 0.72 : 1;
  const pts = [V2(-half, -0.4), V2(half, -0.4)];
  for (let i = n; i >= -n; i--) {
    const x = half * i / n;
    pts.push(V2(x, rise * (1 - Math.pow(Math.abs(x) / hw, p)) - dv - 0.02));
  }
  return new THREE.Shape(pts);
}

// Height of a roofSlab's upper surface at a given x, for seating dormers and chimneys.
export function roofY(w, rise, over, profile, x) {
  const hw = w / 2 + over;
  const p = profile === 'curved' ? 0.72 : 1;
  return rise * (1 - Math.pow(Math.min(1, Math.abs(x) / hw), p));
}

// Alternating corner blocks. The single cheapest thing that makes a box read as cut stone.
export function addQuoins(b, R, { m, w, d, h, from = 0, surface = 'trim', proud = 0.075 }) {
  const bh = 0.46, n = Math.floor((h - from) / bh);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    for (let i = 0; i < n; i++) {
      if (i % 2 && R() < 0.25) continue;
      const long = i % 2 === 0;
      const y = from + bh * (i + 0.5);
      const a = long ? 1.0 : 0.62, c = long ? 0.62 : 1.0;
      b.add(surface, box(a + proud, bh - 0.06, c + proud),
        m.clone().multiply(T(sx * (w / 2 - a / 2 + proud * 0.5), y, sz * (d / 2 - c / 2 + proud * 0.5))));
    }
  }
}

// Broken stone where a wall meets the ground. Kills the hard join line.
// Debris in clusters, half-buried. Scattering evenly reads as pebbles; clustering reads as spill.
export function addRubble(b, R, { m, length, offset, count = 10, size = 0.42, surface = 'wall' }) {
  const clusters = Math.max(1, Math.round(count / 3));
  for (let c = 0; c < clusters; c++) {
    const cx = span(R, -length / 2, length / 2);
    const big = R() < 0.35;
    for (let i = 0; i < 3; i++) {
      const s = size * (big && i === 0 ? span(R, 1.5, 2.3) : span(R, 0.35, 1.0));
      const g = new THREE.IcosahedronGeometry(s, 0);
      g.scale(span(R, 0.85, 1.5), span(R, 0.45, 0.8), span(R, 0.85, 1.5));
      const x = cx + span(R, -size * 3, size * 3);
      const z = offset * span(R, 0.35, 1.5);
      b.add(surface, g, m.clone().multiply(T(x, s * span(R, -0.15, 0.22), z, span(R, 0, 6.28), span(R, -0.35, 0.35), span(R, -0.35, 0.35))));
    }
  }
}

// Low flared skirt so the wall/ground join is never a clean edge.
export function addSkirt(b, { m, length, thickness, surface = 'wall', h = 0.3, flare = 0.85 }) {
  b.add(surface, taperBox(length, thickness + 0.14, h, length + flare, thickness + flare * 1.5), m.clone().multiply(T(0, h / 2, 0)));
  b.add(surface, taperBox(length + flare * 0.8, thickness + flare * 1.3, h * 0.5, length + flare * 1.5, thickness + flare * 2.1), m.clone().multiply(T(0, -h * 0.1, 0)));
}

export function addSteps(b, { m, w, count = 3, rise = 0.19, tread = 0.4, surface = 'trim' }) {
  for (let i = 0; i < count; i++) {
    const d = tread * (count - i);
    b.add(surface, box(w + i * 0.22, rise, d), m.clone().multiply(T(0, rise * (i + 0.5) - rise * count, d / 2)));
  }
}

export function addChimney(b, R, { m, w = 0.85, h = 2.4, surface = 'wall', cap = 'trim' }) {
  b.add(surface, taperBox(w, w * 0.9, h, w * 1.2, w * 1.08), m.clone().multiply(T(0, h / 2, 0)));
  b.add(cap, box(w + 0.34, 0.17, w * 0.9 + 0.34), m.clone().multiply(T(0, h + 0.085, 0)));
  b.add(cap, box(w + 0.16, 0.12, w * 0.9 + 0.16), m.clone().multiply(T(0, h + 0.23, 0)));
  if (R() < 0.5) b.add(cap, new THREE.CylinderGeometry(0.13, 0.16, 0.34, 6), m.clone().multiply(T(w * 0.2, h + 0.44, 0)));
}
