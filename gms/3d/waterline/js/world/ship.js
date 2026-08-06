// The ship kit — C3. Origin at the waterline (y=0), centred. Local +X is bow, +Y up, +Z starboard.
//
// The hull is lofted from stations rather than boxed, because every silhouette cue a critic reads
// at 800 m — sheer, forecastle break, stem rake, transom — lives in that curve and none of it can
// be faked with a scaled cube. The loft also gives the unwrap materials/hull.js is painted for:
// u along the length, v carrying height above the waterline, mirrored about v=0.5 so port and
// starboard get different camo out of one map.
//
// Draw calls are the tight budget at sea, so a ship is merged by material, not by part:
//   detail 2 (hero)    hull · deck · structure · rails · windows · wake · one mesh per turret
//   detail 1 (mid)     hull · deck · structure+turrets · wake
//   detail 0 (distant) one mesh, one material, chunky enough not to alias

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { getMaterial } from './materials/index.js';
import { hullMaterial, windowMaterial, distantMaterial, foamTexture, collarMaterial,
  contactMaterial, crewMaterial, skirtMaterial, WATERLINE_V } from './materials/hull.js';
import { rng, clamp, smoothstep, lerp } from './textures/noise.js';
import { SHIP, KIT_FOR_LENGTH } from '../config.js';

// lenMul scales cells→metres per kit so each class lands near its real length/beam ratio; the
// nominal cell count for a kit reproduces SHIP.kits[kit].beam.
const KIT = {
  destroyer: { lenMul: 2.40, ratio: 9.4, free: 4.2, turrets: 2, barrels: 1, funnels: 2, masts: 1, boats: 1 },
  cruiser: { lenMul: 1.90, ratio: 8.6, free: 5.4, turrets: 3, barrels: 2, funnels: 2, masts: 2, boats: 2 },
  battleship: { lenMul: 1.50, ratio: 7.0, free: 6.6, turrets: 4, barrels: 3, funnels: 1, masts: 2, boats: 3 },
};

const NS = 40, NG = 9;                    // stations along the hull, girth samples per side
const RAKE = 0.055;                       // stem rake as a fraction of length

// ── hull section maths, shared by the shell, the deck and the wake ──────────────────────────

function shape(L, B, free) {
  const top = free * 2.1;                 // deck + bulwark headroom the texture band is sized for
  // The bake puts y=0 at v=WATERLINE_V, so the draft is not free: it is whatever puts the
  // waterline on that texture row. Nothing is ever seen below it.
  const draft = top * WATERLINE_V / (1 - WATERLINE_V);

  const halfBeam = u => {
    const bow = Math.pow(smoothstep(0, 0.34, u), 0.55);
    const mid = 1 - 0.10 * Math.pow(Math.abs(u - 0.46) / 0.46, 2.2);
    const stern = (1 - 0.50 * smoothstep(0.70, 1.0, u)) * (1 - 0.30 * smoothstep(0.92, 1.0, u));
    return B * 0.5 * bow * mid * stern;
  };
  // a raised forecastle with a quick break at ~0.36 of the length, plus ordinary sheer
  const deckY = u => free * (1 + 0.52 * smoothstep(0.42, 0.30, u) + 0.20 * Math.pow(1 - u, 3) - 0.30 * smoothstep(0.86, 1.0, u));
  const keelY = u => draft * clamp(smoothstep(0, 0.11, u), 0, 1) * (1 - 0.5 * smoothstep(0.80, 1.0, u));
  const bulwark = u => free * 0.34 * smoothstep(0.44, 0.34, u);
  const camber = u => halfBeam(u) * 0.035;

  // p is the girth parameter, 0 at the keel and 1 at the deck edge
  const sectionY = (u, p) => -keelY(u) + (deckY(u) + keelY(u)) * p;
  const sectionZ = (u, p) => {
    const kd = keelY(u), dh = deckY(u);
    const bh = halfBeam(u);
    const pw = clamp(kd / (kd + dh), 0.03, 0.9);
    if (p < pw) return bh * Math.sqrt(Math.max(0, 1 - Math.pow(1 - p / pw, 2.2)));
    const t = (p - pw) / (1 - pw);
    const flare = 0.20 * smoothstep(0.40, 0.02, u) - 0.055 * smoothstep(0.15, 0.55, u);
    return bh * (1 + flare * t * t);
  };
  const stationX = (u, p) => L * (0.5 - u) + L * RAKE * p * smoothstep(0.20, 0.0, u);
  const vBand = y => clamp((y + draft) / (draft + top), 0, 1);
  // the deck is cambered, so anything standing on it has to be placed on the curve or it floats
  const deckAt = (u, z) => {
    const bh = sectionZ(u, 1) * 0.985;
    const f = bh > 1e-3 ? clamp(z / bh, -1, 1) : 0;
    return deckY(u) - 0.04 + camber(u) * (1 - f * f);
  };

  return { L, B, free, top, draft, halfBeam, deckY, keelY, bulwark, camber, sectionY, sectionZ, stationX, vBand, deckAt };
}

// Vertex AO. There is no AO pass that reaches a deck, and "no darkening in any crevice" has now
// been found in every round on every component of this project. One float per vertex, no texture
// memory, and it is the only term that can darken an inside corner: a cast shadow cannot, because
// a corner is lit by the sky rather than by the sun.
function aoAttr(geo, fn) {
  const p = geo.attributes.position;
  const c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const k = clamp(fn(p.getX(i), p.getY(i), p.getZ(i)), 0, 1);
    c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = k;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return geo;
}

const flatAO = geo => aoAttr(geo, () => 1);

function hullShell(S) {
  const rings = [];
  for (let i = 0; i < NS; i++) {
    const u = i / (NS - 1);
    const bw = S.bulwark(u);
    const pts = [];
    for (let j = 0; j <= NG; j++) {
      const p = j / NG;
      pts.push([S.stationX(u, p), S.sectionY(u, p), S.sectionZ(u, p)]);
    }
    // one extra ring point carries the bulwark, so every station has the same vertex count
    const last = pts[pts.length - 1];
    pts.push([last[0], last[1] + bw, last[2] - bw * 0.25]);
    rings.push({ u, pts });
  }

  const M = rings[0].pts.length;          // per half-section
  const perRing = M * 2;                  // port then starboard
  const pos = [], uv = [], ao = [];
  for (const { u, pts } of rings) {
    for (let s = 0; s < 2; s++) {
      const sgn = s ? 1 : -1;
      for (let j = 0; j < M; j++) {
        const [x, y, z] = pts[j];
        pos.push(x, y, z * sgn);
        const vb = S.vBand(y);
        uv.push(u, s ? 0.5 + 0.5 * vb : 0.5 - 0.5 * vb);
        // the bulwark's inboard face and the strake tucked under the deck edge are both cavities
        ao.push(j === M - 1 ? 0.68 : j === M - 2 ? 0.86 : 1);
      }
    }
  }

  const idx = [];
  const at = (i, s, j) => i * perRing + s * M + j;
  for (let i = 0; i < NS - 1; i++) {
    for (let j = 0; j < M - 1; j++) {
      // port winds one way, starboard the other, so both faces point outboard
      idx.push(at(i, 0, j), at(i, 0, j + 1), at(i + 1, 0, j));
      idx.push(at(i, 0, j + 1), at(i + 1, 0, j + 1), at(i + 1, 0, j));
      idx.push(at(i, 1, j), at(i + 1, 1, j), at(i, 1, j + 1));
      idx.push(at(i, 1, j + 1), at(i + 1, 1, j), at(i + 1, 1, j + 1));
    }
    // close the keel seam between the two halves
    idx.push(at(i, 0, 0), at(i + 1, 0, 0), at(i, 1, 0));
    idx.push(at(i, 1, 0), at(i + 1, 0, 0), at(i + 1, 1, 0));
  }
  // Transom. A single flat quad across the stern stands in the water like a card, so the panel is
  // inset behind a rim: the rim is real geometry with real thickness and it is what gives the
  // stern a lit top edge and a shadowed face instead of one dead value.
  const t = NS - 1;
  const inset = pos.length / 3;
  const yMid = (S.deckY(1) - S.keelY(1)) * 0.5;
  const IN = 0.86, FWD = S.L * 0.024;
  for (let s = 0; s < 2; s++) {
    const sgn = s ? 1 : -1;
    for (let j = 0; j < M; j++) {
      const [x, y, z] = rings[t].pts[j];
      const yi = yMid + (y - yMid) * IN;
      pos.push(x + FWD, yi, z * IN * sgn);
      const vb = S.vBand(yi);
      uv.push(0.985, s ? 0.5 + 0.5 * vb : 0.5 - 0.5 * vb);
      // 0.52 put the recess at luma 21 against 95 on the hull plate 15 px beside it — a 74-luma
      // step between two aft-facing surfaces under one sky, which is C6's E4(b). A recess loses
      // sky, it does not lose all of it.
      ao.push(0.80);
    }
  }
  const ai = (s, j) => inset + s * M + j;
  for (let j = 0; j < M - 1; j++) {
    // rim band, outer ring → inset ring, on both halves
    idx.push(at(t, 0, j), ai(0, j), at(t, 0, j + 1));
    idx.push(at(t, 0, j + 1), ai(0, j), ai(0, j + 1));
    idx.push(at(t, 1, j), at(t, 1, j + 1), ai(1, j));
    idx.push(at(t, 1, j + 1), ai(1, j + 1), ai(1, j));
    // the recessed panel itself
    idx.push(ai(0, j), ai(1, j), ai(0, j + 1));
    idx.push(ai(0, j + 1), ai(1, j), ai(1, j + 1));
  }
  // keel seam across the rim
  idx.push(at(t, 0, 0), at(t, 1, 0), ai(0, 0));
  idx.push(ai(0, 0), at(t, 1, 0), ai(1, 0));

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const col = new Float32Array(ao.length * 3);
  for (let i = 0; i < ao.length; i++) col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = ao[i];
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function deckPlate(S, foots = []) {
  const pos = [], uv = [], idx = [], ao = [];
  const inset = 0.985;
  // v is scaled to the WIDEST station, not to each station's own beam. Mapping v 0→1 across a
  // narrowing hull squeezes the planking to a fifth of its width on the quarterdeck, which is the
  // stretched-UV tell; this keeps a plank the same real width from stem to stern.
  const zRef = S.sectionZ(0.5, 1) * inset;
  for (let i = 0; i < NS; i++) {
    const u = i / (NS - 1);
    const bh = S.sectionZ(u, 1) * inset;
    const y = S.deckY(u) - 0.04;
    const c = S.camber(u);
    for (let j = 0; j <= 6; j++) {
      const f = j / 6 * 2 - 1;
      const z = bh * f;
      pos.push(S.stationX(u, 1), y + c * (1 - f * f), z);
      uv.push(u, 0.5 + 0.5 * clamp(bh * f / zRef, -1, 1));
      // contact darkening around every footprint standing on the deck, plus the strip the
      // bulwark shades along the deck edge
      let k = 1;
      for (const ft of foots) {
        const du = Math.abs(u - ft.u) * S.L, dz = Math.abs(z - ft.z);
        const e = Math.max(du / (ft.w * 0.5 + 1.6), dz / (ft.d * 0.5 + 1.6));
        if (e < 1) k *= 1 - 0.62 * Math.pow(1 - e, 1.5);
      }
      ao.push(k * (1 - 0.20 * smoothstep(0.75, 1.0, Math.abs(f)) * (S.bulwark(u) > 0.05 ? 1 : 0.4)));
    }
  }
  for (let i = 0; i < NS - 1; i++) {
    for (let j = 0; j < 6; j++) {
      const a = i * 7 + j, b = a + 7;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const col = new Float32Array(ao.length * 3);
  for (let i = 0; i < ao.length; i++) col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = ao[i];
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ── block primitives ────────────────────────────────────────────────────────────────────────

// Metres of steel per texture tile. This is NOT a constant: one panel period shared by a 3 m
// ready-use locker, a 9 m funnel and a 25 m bridge block reads as a projection grid laid over the
// whole ship rather than as plating. Small fittings get small panels, big structures big ones.
const plateTile = size => clamp(size * 0.46, 2.0, 8.0);
// UV origin per object, so two blocks standing side by side never line their seams up into a
// lattice. `uvSeed` is re-pointed at each ship's own rng in buildShip.
let uvSeed = rng(7);
const uvOff = () => [uvSeed() * 6, uvSeed() * 6];

function boxUV(g, w, h, d, tile, off) {
  const uv = g.attributes.uv;
  const face = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, uv.getX(i) * face[f][0] / tile + off[0], uv.getY(i) * face[f][1] / tile + off[1]);
    }
  }
  return g;
}

// A tapered box. Straight-sided superstructure is the single loudest "boxes on a boat" tell, so
// every block above the deck loses 4–14% of its footprint by the time it reaches its own roof.
function block(w, h, d, taper = 0.94, x = 0, y = 0, z = 0, ry = 0, tile = 0) {
  const g = boxUV(new THREE.BoxGeometry(w, h, d), w, h, d, tile || plateTile(Math.max(w, h, d)), uvOff());
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    if (p.getY(i) > 0) { p.setX(i, p.getX(i) * taper); p.setZ(i, p.getZ(i) * taper); }
  }
  g.rotateY(ry);
  g.translate(x, y + h / 2, z);
  return g;
}

function cyl(rTop, rBot, h, seg, x, y, z, { flatZ = 1, rake = 0, tile = 0 } = {}) {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, false);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    p.setZ(i, p.getZ(i) * flatZ);
    p.setX(i, p.getX(i) + (p.getY(i) + h / 2) * rake);
  }
  const T = tile || plateTile(Math.max(h, rBot * 2));
  const off = uvOff();
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2 * Math.PI * rBot / T + off[0], uv.getY(i) * h / T + off[1]);
  g.translate(x, y + h / 2, z);
  g.computeVertexNormals();
  return g;
}

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

// An arbitrarily oriented tube. Mast legs, davits and stays are all diagonals, and a diagonal is
// the one thing block()/cyl() cannot make.
function strut(a, b, r, seg = 6) {
  const d = new THREE.Vector3().subVectors(b, a);
  const h = d.length();
  const g = new THREE.CylinderGeometry(r, r, h, seg, 1, false);
  const off = uvOff();
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2 * Math.PI * r / 2.4 + off[0], uv.getY(i) * h / 2.4 + off[1]);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), d.normalize()));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  g.computeVertexNormals();
  return g;
}

// ── superstructure ──────────────────────────────────────────────────────────────────────────

function superstructure(S, kit, r, detail) {
  const parts = [];
  const glass = [];
  const ao = [];                            // deck footprints that want a contact shadow
  // Horizontal surfaces that other structure STANDS ON. The deck is not the only one: a bridge is
  // four blocks stacked, and the join between two of them is as much a crevice as the join between
  // the bottom one and the deck. Without these every stack above deck level reads as one extrusion.
  const shelves = [];
  const ladders = [];
  const B = S.B, L = S.L;
  const dk = u => S.deckY(u) - 0.05;
  const foot = (u, w, d, z = 0) => ao.push({ u, z, w, d });
  const shelf = (x, y, z, w, d) => shelves.push({ x, y, z, w, d });

  // bridge tower: a stack of shrinking frusta, each one nudged and rotated off the last so the
  // stack never reads as a single extruded prism
  const uB = 0.36;
  let y = dk(uB), w = B * 0.62, len = L * 0.16;
  const tiers = detail > 1 ? 4 : detail ? 3 : 2;
  foot(uB, L * 0.16, B * 0.62);
  for (let i = 0; i < tiers; i++) {
    const h = S.free * (0.62 - i * 0.06) * (0.85 + r() * 0.3);
    parts.push(block(len, h, w, 0.90 - i * 0.02, S.stationX(uB, 1) - i * len * 0.06, y, 0, (r() - 0.5) * 0.02));
    if (i === tiers - 2 && detail) {
      // bridge wings — a warship's widest point above the deck, and the shape that reads as a
      // bridge rather than as a chimney at any distance
      parts.push(block(len * 0.42, h * 0.32, B * 0.92, 0.98, S.stationX(uB, 1) - len * 0.1, y + h * 0.55, 0));
      if (detail > 1) glass.push(block(len * 0.30, h * 0.34, w * 0.86, 1.0, S.stationX(uB, 1) - len * 0.06, y + h * 0.22, 0));
    }
    y += h;
    shelf(S.stationX(uB, 1) - i * len * 0.06, y, 0, len, w);
    w *= 0.80; len *= 0.80;
  }
  // director / rangefinder cap
  parts.push(cyl(w * 0.34, w * 0.40, S.free * 0.34, 8, S.stationX(uB, 1) - len * 0.2, y, 0, { flatZ: 0.7 }));
  const bridgeTop = y;
  if (detail > 1) {
    // an inclined ladder up the bridge front: two decks of it, at human rise and human going
    ladders.push({ x0: S.stationX(uB, 1) + L * 0.075, y0: dk(uB), z: B * 0.20,
      x1: S.stationX(uB, 1) + L * 0.045, y1: dk(uB) + S.free * 1.20, w: 0.9 });
  }

  // funnels, raked aft, each one a different height and rake
  const fu = kit.funnels === 1 ? [0.52] : [0.47, 0.62];
  for (let i = 0; i < fu.length; i++) {
    const u = fu[i];
    const rr = B * (0.19 - i * 0.02) * (0.92 + r() * 0.16);
    const fh = S.free * (1.15 - i * 0.12);
    parts.push(cyl(rr * 0.88, rr, fh, 12, S.stationX(u, 1), dk(u), 0, { flatZ: 0.62, rake: -0.13 }));
    parts.push(cyl(rr * 1.06, rr * 1.02, fh * 0.10, 12, S.stationX(u, 1) - fh * 0.13, dk(u) + fh * 0.94, 0, { flatZ: 0.64 }));
    foot(u, rr * 2.2, rr * 1.5);
    shelf(S.stationX(u, 1) - fh * 0.13, dk(u) + fh * 1.04, 0, rr * 2.1, rr * 1.4);
    if (detail) parts.push(block(rr * 0.5, fh * 0.5, rr * 2.4, 1, S.stationX(u, 1) + rr * 1.0, dk(u) + fh * 0.35, 0));
    if (detail > 1) {
      // steam pipes up the funnel side, and a grab rail round the cap: the two fittings that give
      // a plain cylinder a size
      for (const s of [-1, 1]) {
        parts.push(cyl(0.13, 0.15, fh * 0.86, 5, S.stationX(u, 1) - fh * 0.06, dk(u), s * rr * 0.60, { rake: -0.13 }));
      }
      parts.push(cyl(rr * 1.14, rr * 1.14, 0.16, 12, S.stationX(u, 1) - fh * 0.10, dk(u) + fh * 0.74, 0, { flatZ: 0.64 }));
    }
  }

  // aft deckhouse
  const uA = 0.74;
  parts.push(block(L * 0.13, S.free * 0.60, B * 0.52, 0.92, S.stationX(uA, 1), dk(uA), 0));
  foot(uA, L * 0.13, B * 0.52);
  const aftTop = dk(uA) + S.free * 0.60;
  shelf(S.stationX(uA, 1), aftTop, 0, L * 0.13, B * 0.52);
  if (detail) parts.push(cyl(B * 0.10, B * 0.12, S.free * 0.5, 8, S.stationX(uA - 0.05, 1), aftTop, 0, { flatZ: 0.8 }));

  // Masts. Pass 1 hung every mast at a fixed `deck + 1.4 × freeboard`, which happens to land inside
  // the bridge stack forward and in CLEAR AIR above a deckhouse only 0.6 freeboards tall aft. The
  // pole now runs from the deck (the lower part is buried in whatever it passes through, so it can
  // never float again) and the housing and tripod legs sit on the real top of that structure.
  const masts = kit.masts === 1
    ? [{ u: 0.42, base: bridgeTop, span: B * 0.15 }]
    : [{ u: 0.42, base: bridgeTop, span: B * 0.15 }, { u: 0.70, base: aftTop, span: B * 0.19 }];
  for (let i = 0; i < masts.length; i++) {
    const { u, base, span } = masts[i];
    const mx = S.stationX(u, 1);
    const yTop = dk(u) + S.free * (3.9 - i * 0.9);
    const H = yTop - dk(u);
    const rr = detail > 1 ? 0.40 + S.free * 0.042 : 1.0;
    parts.push(cyl(rr * 0.52, rr * 1.25, H, 8, mx, dk(u), 0, { rake: -0.055, tile: 3.2 }));
    // mast house: the pole meets its structure in a box, not at a point
    parts.push(block(rr * 4.4, S.free * 0.34, rr * 4.8, 0.84, mx, base, 0));
    shelf(mx, base + S.free * 0.34, 0, rr * 4.4, rr * 4.8);
    const legTop = V3(mx - (yTop - base) * 0.5 * 0.055, base + (yTop - base) * 0.46, 0);
    if (detail > 1) {
      for (const s of [-1, 1]) {
        parts.push(strut(V3(mx - rr * 0.6, base + S.free * 0.30, s * span), legTop.clone().setZ(s * rr * 0.7), rr * 0.40));
      }
      parts.push(strut(V3(mx + span * 0.9, base + S.free * 0.30, 0), legTop.clone(), rr * 0.34));
    }
    const at = k => base + (yTop - base) * k;
    const rake = k => mx - (at(k) - dk(u)) * 0.055;
    // a bare cross reads as a crucifix. A platform, one long yard low and one short yard high,
    // plus the array at the head, is what makes a masthead read as equipment.
    parts.push(block(rr * 4.0, rr * 1.0, rr * 4.2, 0.80, rake(0.50), at(0.50), 0));
    shelf(rake(0.50), at(0.50) + rr, 0, rr * 4.0, rr * 4.2);
    for (const [k, sp, thick] of [[0.64, 0.56 - i * 0.18, 1.9], [0.84, 0.30 - i * 0.09, 1.5]]) {
      parts.push(block(rr * thick, rr * thick * 0.78, B * sp, 1, rake(k), at(k), 0, k > 0.7 ? 0.16 : 0));
      // the yard hangs off the mast, so it needs a lift to hang from
      if (detail > 1) for (const s of [-1, 1]) {
        parts.push(strut(V3(rake(k), at(k), s * B * sp * 0.44), V3(rake(k + 0.10), at(k + 0.10), 0), rr * 0.16, 4));
      }
    }
    if (i === 0) {
      // air-search array: a flat rectangle, the most recognisable thing on a WW2 masthead
      parts.push(block(rr * 1.1, S.free * 0.46, B * 0.32, 1, rake(0.97), at(0.97), 0));
    } else {
      parts.push(cyl(rr * 1.5, rr * 1.2, S.free * 0.24, 8, rake(0.97), at(0.97), 0, { flatZ: 0.6 }));
    }
  }

  return { parts, glass, ao, shelves, ladders };
}

// Deck furniture, all merged into the structure mesh. Positions are seeded per ship so two ships
// of the same kit never carry the same clutter in the same places.
// Deck fittings. Everything here is sized in METRES against a person, not as a fraction of the
// hull: a 150 m ship with nothing on it whose size a viewer already knows reads as a 40 cm desk
// model, and that was the single largest gap the round-1 review found.
function furniture(S, kit, r, detail, ao, ladders) {
  const parts = [];
  const B = S.B, L = S.L;
  const dk = u => S.deckY(u) - 0.05;
  const n = detail > 1 ? 1 : detail ? 0.6 : 0.3;
  const at = (u, z) => S.deckAt(u, z) - 0.02;
  const foot = (u, z, w, d) => ao.push({ u, z, w, d });

  for (let i = 0; i < Math.round(19 * n); i++) {
    const u = 0.16 + r() * 0.72;
    const z = (r() - 0.5) * 1.7 * S.sectionZ(u, 1);
    const s = 0.5 + r() * 0.9;
    const kind = Math.floor(r() * 4);
    const x = S.stationX(u, 1), y = at(u, z);
    if (kind === 0) {
      // cowl ventilator: a trunk with a bell, ~2 m to the mouth
      parts.push(cyl(0.34 * s, 0.40 * s, 1.7 * s, 8, x, y, z));
      parts.push(cyl(0.62 * s, 0.34 * s, 0.55 * s, 8, x + 0.18 * s, y + 1.6 * s, z, { rake: 0.55 }));
    } else if (kind === 1) {
      parts.push(block(2.2 * s, 1.1 * s, 1.3 * s, 0.95, x, y, z));                       // ready-use locker
      parts.push(block(2.3 * s, 0.10, 1.4 * s, 1, x, y + 1.1 * s, z));                   // lid, with an overhang
    } else if (kind === 2) {
      parts.push(cyl(0.9 * s, 0.9 * s, 0.55 * s, 10, x, y, z, { flatZ: 0.5 }));          // reel
      parts.push(cyl(0.16, 0.16, 1.0 * s, 6, x, y, z));
    } else {
      // AA mount: a tub a man stands in, with barrels. The most legible scale object on a warship.
      const R = 1.5 * s;
      parts.push(cyl(R, R * 1.06, 1.15, 12, x, y, z));
      parts.push(block(0.9, 0.7, 1.1, 0.9, x, y + 0.9, z));
      for (let k = 0; k < 2; k++) {
        parts.push(strut(V3(x, y + 1.35, z + (k - 0.5) * 0.42), V3(x + 2.0, y + 2.5, z + (k - 0.5) * 0.42), 0.075, 5));
      }
      foot(u, z, R * 2.2, R * 2.2);
    }
    if (kind !== 3 && s > 1.1) foot(u, z, 2.4 * s, 1.6 * s);
  }

  // Ship's boats in davits, with a real boat shape rather than a lying-down cylinder. A 9 m
  // motor launch hanging off the side is a scale cue nobody has to be told to read.
  for (let i = 0; i < kit.boats; i++) {
    const u = 0.55 + i * 0.07 + r() * 0.03;
    const z = (i % 2 ? 1 : -1) * S.sectionZ(u, 1) * 0.72;
    const bl = Math.min(L * 0.075, 10.5);
    const x = S.stationX(u, 1), y = dk(u) + 2.6;
    const hull = new THREE.BoxGeometry(bl, 1.5, bl * 0.30);
    const p = hull.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const tt = Math.abs(p.getX(k)) / (bl / 2);
      const nar = 1 - 0.72 * tt * tt;
      p.setZ(k, p.getZ(k) * nar * (p.getY(k) > 0 ? 1 : 0.55));
      if (p.getY(k) < 0) p.setY(k, p.getY(k) * (1 - 0.35 * tt * tt));
    }
    hull.computeVertexNormals();
    parts.push(boxUV(hull, bl, 1.5, bl * 0.3, 2.6, uvOff()).translate(x, y, z));
    parts.push(block(bl * 0.34, 1.0, bl * 0.20, 0.9, x - bl * 0.06, y + 0.6, z));         // cabin
    // davits: two curved arms and their falls
    for (const s of [-1, 1]) {
      const dx = x + s * bl * 0.38;
      parts.push(strut(V3(dx, dk(u), z * 0.80), V3(dx, y + 2.6, z * 0.86), 0.16, 6));
      parts.push(strut(V3(dx, y + 2.6, z * 0.86), V3(dx, y + 2.4, z * 1.10), 0.14, 6));
      parts.push(strut(V3(dx, y + 2.4, z * 1.10), V3(dx, y + 0.7, z), 0.055, 4));
    }
    foot(u, z * 0.8, bl, 1.4);
  }

  // Carley floats stacked against the deckhouse — human-sized rings, and they break the long
  // straight run of a superstructure side.
  if (detail) {
    for (let i = 0; i < 4; i++) {
      const u = 0.62 + i * 0.045;
      const z = (i % 2 ? 1 : -1) * S.sectionZ(u, 1) * 0.70;
      for (let k = 0; k < 2; k++) {
        parts.push(cyl(1.25, 1.25, 0.34, 10, S.stationX(u, 1), at(u, z) + k * 0.36, z, { flatZ: 0.62 }));
      }
      foot(u, z, 2.8, 1.9);
    }
  }

  // anchor gear and a capstan forward, so the forecastle is not an empty plate
  parts.push(cyl(0.85, 1.0, 1.05, 10, S.stationX(0.12, 1), at(0.12, 0), 0));
  parts.push(block(2.4, 1.1, S.B * 0.40, 1, S.stationX(0.17, 1), at(0.17, 0), 0));
  foot(0.17, 0, 3.0, S.B * 0.5);
  // bollards in pairs, fore and aft — 0.6 m of steel, and the eye knows how big that is
  if (detail > 1) {
    for (const u of [0.10, 0.22, 0.90]) {
      for (const s of [-1, 1]) {
        const z = s * S.sectionZ(u, 1) * 0.80;
        for (let k = 0; k < 2; k++) parts.push(cyl(0.19, 0.22, 0.62, 7, S.stationX(u, 1) + (k - 0.5) * 0.9, at(u, z), z));
      }
    }
    // a ladder down the aft deckhouse front
    ladders.push({ x0: S.stationX(0.74, 1) + L * 0.062, y0: dk(0.70), z: B * 0.16,
      x1: S.stationX(0.74, 1) + L * 0.048, y1: dk(0.74) + S.free * 0.60, w: 0.8 });
  }

  return parts;
}

// Crew. Three boxes and about forty triangles each, because the silhouette is the whole job: at
// 30 m a figure is ten pixels tall and all that survives is "that is a person, so this is 150 m".
function crewGeo(S, kit, r) {
  const parts = [];
  const spots = [
    [0.14, 0.55], [0.17, -0.40], [0.20, 0.62], [0.20, -0.55], [0.24, 0.30], [0.27, 0.0],
    [0.30, -0.66], [0.34, 0.80], [0.38, -0.30], [0.42, 0.55], [0.46, -0.72], [0.52, 0.66],
    [0.56, -0.20], [0.60, -0.40], [0.66, 0.52], [0.72, -0.62], [0.76, 0.24], [0.80, 0.35],
    [0.86, -0.30], [0.90, 0.55],
  ];
  for (const [u, zf] of spots) {
    const z = zf * S.sectionZ(u, 1) * 0.92;
    const y = S.deckAt(u, z);
    const ry = r() * 6.283;
    const lean = (r() - 0.5) * 0.10;
    const g = [];
    g.push(new THREE.BoxGeometry(0.36, 0.86, 0.30).translate(0, 0.43, 0));
    const torso = new THREE.BoxGeometry(0.44, 0.66, 0.32);
    const p = torso.attributes.position;
    for (let i = 0; i < p.count; i++) if (p.getY(i) < 0) { p.setX(i, p.getX(i) * 0.86); p.setZ(i, p.getZ(i) * 0.86); }
    g.push(torso.translate(0, 1.20, 0));
    g.push(new THREE.BoxGeometry(0.23, 0.26, 0.22).translate(0, 1.66, 0));
    // arms. Without them the silhouette is a post, and a post is not a scale cue.
    for (const sd of [-1, 1]) g.push(new THREE.BoxGeometry(0.13, 0.60, 0.14).translate(sd * 0.29, 1.16, 0));
    for (const b of g) {
      b.deleteAttribute('uv');
      b.rotateZ(lean); b.rotateY(ry); b.translate(S.stationX(u, 1), y, z);
      parts.push(b);
    }
  }
  return mergeGeometries(parts, false);
}

// Contact shadow decals. Nothing in this engine gives an object standing on a deck an ambient
// occlusion term, and "objects that do not touch what they rest on" has been found in every round
// on every component. A dark soft quad on the deck under each footprint is the cheap honest fix.
function contactGeo(S, ao) {
  const pos = [], uv = [], idx = [];
  let k = 0;
  for (const f of ao) {
    const w = f.w * 0.72, d = f.d * 0.80;
    const du = w / S.L;
    for (let a = 0; a < 2; a++) {
      for (let b = 0; b < 2; b++) {
        const u = clamp(f.u + (a - 0.5) * du * 2, 0.02, 0.99);
        const z = f.z + (b - 0.5) * d * 2;
        pos.push(S.stationX(u, 1), S.deckAt(u, z) + 0.035, z);
        uv.push(a, b);
      }
    }
    idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    k += 4;
  }
  if (!k) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Inclined ladders, on the rail material: the rail strip's three wires become three stringers and
// its stanchions become rungs when the UVs are transposed, so a ladder costs no extra texture.
function ladderGeo(S, list) {
  const pos = [], uv = [], idx = [];
  let k = 0;
  for (const l of list) {
    const run = Math.hypot(l.x1 - l.x0, l.y1 - l.y0);
    for (let a = 0; a < 2; a++) {
      for (let b = 0; b < 2; b++) {
        pos.push(a ? l.x1 : l.x0, a ? l.y1 : l.y0, l.z + (b - 0.5) * l.w);
        uv.push(a * run / 1.1, b);
      }
    }
    idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    k += 4;
  }
  if (!k) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ── turrets ─────────────────────────────────────────────────────────────────────────────────

function turretGeo(R) {
  // Turret armour is a handful of very large plates, not the 2 m panels a deckhouse is built from.
  // Giving it the same panel period as the funnel and the bridge is what made three objects of
  // wildly different size read as one projected grid.
  const T = R * 4.2;
  const parts = [block(R * 2.1, R * 0.95, R * 2.3, 0.80, 0, 0, 0, 0, T)];
  // a sloped face plate: the turret's front is the surface a muzzle flash lights, and a flat
  // vertical box front takes that light as one dead constant value
  parts.push(block(R * 0.7, R * 0.7, R * 2.0, 0.9, R * 0.95, R * 0.12, 0, 0.14, T));
  // rangefinder ears and a roof hatch, both about a person across
  parts.push(block(0.5, 0.42, R * 2.6, 1, -R * 0.35, R * 0.72, 0, 0, T));
  parts.push(cyl(0.42, 0.42, 0.22, 8, R * 0.30, R * 0.95, R * 0.55, { tile: T }));
  return mergeGeometries(parts, false);
}

// Barrels are their own mesh so they can elevate without tipping the turret with them. That
// elevation is not a detail: at 0 degrees every forward muzzle flash on a battleship sits behind
// its own bridge from any elevated camera on the disengaged side.
function barrelGeo(R, barrels, len) {
  const parts = [];
  for (let i = 0; i < barrels; i++) {
    const z = barrels === 1 ? 0 : (i / (barrels - 1) - 0.5) * R * 1.35;
    // cyl() puts its base at y=0, so after rotateZ(-90°) the barrel runs from x=0 to x=len and the
    // translate is the breech offset, not the centre
    parts.push(cyl(R * 0.15, R * 0.20, len, 8, 0, 0, 0).rotateZ(-Math.PI / 2).translate(R * 0.5, 0, z));
    parts.push(cyl(R * 0.19, R * 0.17, len * 0.10, 8, 0, 0, 0).rotateZ(-Math.PI / 2).translate(R * 0.5 + len * 0.9, 0, z));
  }
  return mergeGeometries(parts, false);
}

// ── rails and wake ──────────────────────────────────────────────────────────────────────────

function railGeo(S) {
  const pos = [], uv = [], idx = [];
  let run = 0, k = 0;
  for (let s = 0; s < 2; s++) {
    const sgn = s ? 1 : -1;
    let prev = null;
    for (let i = 3; i < NS - 1; i++) {
      const u = i / (NS - 1);
      // Pass 2 broke the rail wherever there was a bulwark, which is the whole forecastle — the
      // one stretch of deck this project's closest camera looks straight down. A bulwark carries a
      // guardrail on top of it; a bare steel wall with nothing on it has no scale at all.
      const bw = S.bulwark(u);
      const cap = bw > 0.05;
      const H = cap ? 0.86 : 1.15;
      const x = S.stationX(u, 1), y = S.deckY(u) + bw;
      const z = (S.sectionZ(u, 1) * 0.99 - bw * 0.25) * sgn;
      if (prev) run += Math.hypot(x - prev[0], z - prev[2]);
      else run = 0;
      pos.push(x, y, z, x, y + H, z);
      uv.push(run / 4, 0, run / 4, 1);
      if (prev) { idx.push(k - 2, k, k - 1, k - 1, k, k + 1); }
      prev = [x, y, z];
      k += 2;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// A hull that stops dead at a flat waterline is the "objects that do not touch what they rest on"
// failure in its marine form. The wake is one strip per side plus a stern trail; its vertices are
// pushed onto ocean.heightAt() every frame so the foam sits ON the swell, not through it.
function wakeGeo(S) {
  const pos = [], uv = [], idx = [];
  const NW = 34, NX = 5;
  for (let s = 0; s < 2; s++) {
    const sgn = s ? 1 : -1;
    const base = pos.length / 3;
    for (let i = 0; i < NW; i++) {
      const t = i / (NW - 1);
      const u = t * 2.6;                                     // runs well past the transom
      const uh = Math.min(u, 0.999);
      // aft of the transom the strip keeps going as a trail, converging then slowly spreading
      const tail = Math.max(0, u - 1);
      const x = S.stationX(uh, 1) - tail * S.L * 1.1;
      // 0.88, not 0.97: at the hull's own waterline beam this strip's brightest texel row lands
      // exactly on the silhouette and draws the 1 px dashed white seam the round-1 review named.
      // Isolated by hiding the wake — the seam went with it. The collar owns the contact now.
      const inner = tail > 0 ? S.sectionZ(0.999, 0.55) * Math.max(0.15, 1 - tail * 1.4) : S.halfBeam(uh) * 0.88;
      // the bow bulge is part of the same strip; a separate V overlapped it and the doubled
      // alpha drew a hard triangular facet right where the eye goes first
      const wide = S.B * (0.06 + 0.20 * smoothstep(0.14, 0.0, u) + 0.30 * smoothstep(0.0, 0.34, u) + 0.34 * tail);
      for (let j = 0; j < NX; j++) {
        const f = j / (NX - 1);
        pos.push(x - f * S.L * 0.06, 0, sgn * (inner + wide * f));
        uv.push(u * 1.6, f);
      }
    }
    for (let i = 0; i < NW - 1; i++) {
      for (let j = 0; j < NX - 1; j++) {
        const a = base + i * NX + j, b = a + NX;
        if (s) idx.push(a, b, a + 1, a + 1, b, b + 1);
        else idx.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

// The hull/water contact, which pass 1 did not have at all: the plating simply stopped at a hard
// line and the ship read as a decal laid on the surface. This is one ribbon that does four jobs —
// a contact shadow and foam collar along the whole waterline, a bow wave that peels off the stem,
// a quarter wave, and the propeller wash astern of the transom.
//
// `lift` is a per-vertex height above the LOCAL sea surface, so the whole thing is written onto
// ocean.heightAt() every frame and a crest can stand proud of the water without leaving it.
function collarGeo(S) {
  const pos = [], uv = [], lift = [], hold = [], idx = [];
  const NW = 46, NX = 7;
  // `hold` is 1 where the vertex must stay welded to the HULL's own waterline and 0 where it
  // belongs to the sea. Without it the ribbon sits on the swell while the hull heaves and trims
  // above it, and the inner edge shows as a lace line offset from the plating.
  const push = (x, z, l, h, u2, v2) => { pos.push(x, 0, z); uv.push(u2, v2); lift.push(l); hold.push(h); };

  for (let s = 0; s < 2; s++) {
    const sgn = s ? 1 : -1;
    const base = pos.length / 3;
    for (let i = 0; i < NW; i++) {
      const u = i / (NW - 1);
      const bow = smoothstep(0.34, 0.015, u);
      const quarter = smoothstep(0.56, 0.80, u) * smoothstep(1.02, 0.84, u);
      const wide = S.B * (0.42 + 0.40 * bow + 0.30 * quarter);
      // the sea C1 renders is a low swell, so this stays a peeling sheet rather than a rooster
      // tail: a metre-high bow wave on a half-metre sea is a physical contradiction
      const crest = S.free * 0.15 * bow;
      const zin = S.halfBeam(u) * 0.93;
      const x0 = S.stationX(u, 0.5);
      for (let j = 0; j < NX; j++) {
        const f = j / (NX - 1);
        // the sheet trails aft as it goes outboard, which is what makes the bow wave read as a
        // wave leaving the stem rather than as a moustache painted on it
        const x = x0 - f * S.L * (0.012 + 0.060 * bow);
        push(x, sgn * (zin + wide * f), 0.26 + crest * 4 * f * (1 - f), Math.pow(1 - f, 1.6), u * 5.2, f);
      }
    }
    for (let i = 0; i < NW - 1; i++) {
      for (let j = 0; j < NX - 1; j++) {
        const a = base + i * NX + j, b = a + NX;
        if (s) idx.push(a, b, a + 1, a + 1, b, b + 1);
        else idx.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
  }

  // propeller wash: a churned band directly behind the transom, densest on the centreline. v is
  // mirrored about the middle so both edges lace out, and it slides into the laced part of the
  // map as it runs aft, which is the fade.
  const NT = 18, NZ = 7;
  const base = pos.length / 3;
  const xs = S.stationX(1, 0.5);
  for (let i = 0; i < NT; i++) {
    const t = i / (NT - 1);
    const x = xs - t * S.L * 1.15;
    const half = S.halfBeam(0.985) * (0.72 + t * 1.9);
    for (let j = 0; j < NZ; j++) {
      const f = j / (NZ - 1) * 2 - 1;
      push(x, f * half, 0.16 * (1 - t * 0.5), Math.max(0, 0.7 - t * 3),
        t * 3.4, clamp(0.16 + 0.74 * Math.abs(f) + t * 0.55, 0, 1));
    }
  }
  for (let i = 0; i < NT - 1; i++) {
    for (let j = 0; j < NZ - 1; j++) {
      const a = base + i * NZ + j, b = a + NZ;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.userData.lift = new Float32Array(lift);
  g.userData.hold = new Float32Array(hold);
  return g;
}

// The other half of the contact, and the one that kills the 1 px dashed seam. Where the hull
// surface and the sea surface intersect they are at the same depth and the fragments stipple —
// which is exactly what "a dashed, stair-stepped 1 px seam along the bottom of the boot topping"
// is. This skirt is a band of foam clinging to the PLATING (so it rides on `body` with the hull,
// not on the swell), pushed 2% outboard of the shell so it always wins the depth test and covers
// the intersection line with wet dark below and foam lace at the line itself.
function skirtGeo(S) {
  const k = S.free / 6.5;
  // the bottom row stops just under hullMaterial's waterline clip (-0.199 x freeboard): below that
  // the shell is discarded, so a skirt reaching deeper is a foam blade hanging in open water
  const rows = [[-0.28 * k, 0.02], [-0.18 * k, 0.24], [-0.08 * k, 0.44], [0.8 * k, 0.70], [2.2 * k, 0.99]];
  const NR = rows.length;
  const pos = [], uv = [], idx = [];
  for (let s = 0; s < 2; s++) {
    const sgn = s ? 1 : -1;
    const base = pos.length / 3;
    for (let i = 0; i < NS; i++) {
      const u = i / (NS - 1);
      const kd = S.keelY(u), dh = S.deckY(u);
      for (const [y, v2] of rows) {
        const p = clamp((y + kd) / (kd + dh), 0.02, 0.995);
        pos.push(S.stationX(u, p), y, sgn * (S.sectionZ(u, p) * 1.02 + 0.05));
        uv.push(u * 6.5, v2);
      }
    }
    for (let i = 0; i < NS - 1; i++) {
      for (let j = 0; j < NR - 1; j++) {
        const a = base + i * NR + j, b = a + NR;
        if (s) idx.push(a, b, a + 1, a + 1, b, b + 1);
        else idx.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

let wakeMat = null;
function wakeMaterial() {
  if (!wakeMat) {
    wakeMat = new THREE.MeshBasicMaterial({
      map: foamTexture(), color: 0xe6f0f4, transparent: true, opacity: 0.74,
      depthWrite: false, side: THREE.DoubleSide, fog: true, forceSinglePass: true,
    });
  }
  return wakeMat;
}

// ── the ship ────────────────────────────────────────────────────────────────────────────────

export function buildShip(kitId, quality, cells = 4, opts = {}) {
  const kit = { ...KIT[kitId] || KIT.cruiser, ...SHIP.kits[kitId] };
  const detail = opts.detail ?? 2;
  const r = rng(opts.seed ?? 1013);

  const L = cells * SHIP.cellMetres * kit.lenMul;
  const B = L / kit.ratio;
  // freeboard tracks the actual beam, so a 3-cell cruiser is not as tall as a 4-cell one
  const S = shape(L, B, kit.free * (B / kit.beam));

  const object3D = new THREE.Group();
  object3D.name = `ship:${kitId}`;
  // The hull rides on `body`; `object3D` carries only the ship's XZ position and heading. The wake
  // hangs off object3D, so its vertices can be pushed straight onto ocean.heightAt() — under the
  // hull's own pitch and roll a point 200 m astern picks up ten metres of error and the trail
  // reads as torn sheets of paper floating over the swell.
  const body = new THREE.Group();
  object3D.add(body);

  const meshes = [];
  const add = (geo, mat, cast = true, parent = body) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = cast && detail > 1;
    m.receiveShadow = detail > 1;
    parent.add(m);
    meshes.push(m);
    return m;
  };

  uvSeed = rng((opts.seed ?? 1013) * 7 + 3);
  const { parts: superParts, glass, ao, shelves, ladders } = superstructure(S, kit, r, detail);
  const structure = [...superParts, ...furniture(S, kit, r, detail, ao, ladders)];

  // turret placement: a superfiring pair forward, the rest aft, never evenly spread
  const tR = B * 0.19;
  const tLen = L * 0.13;
  const nT = detail ? kit.turrets : Math.max(1, kit.turrets - 1);
  const spots = [];
  for (let i = 0; i < nT; i++) {
    const fwd = i < Math.ceil(nT / 2);
    const k = fwd ? i : i - Math.ceil(nT / 2);
    const u = fwd ? 0.19 + k * 0.075 : 0.86 - k * 0.075;
    spots.push({ u, rise: k * tR * 0.85, face: fwd ? 0 : Math.PI });
  }

  const gunAnchors = [];
  const turrets = [];
  let turretIM = null, barrelIM = null;
  const ELEV = 0.30;                       // radians of barrel elevation, ~17 degrees
  if (detail === 0) {
    for (const sp of spots) {
      structure.push(turretGeo(tR).translate(S.stationX(sp.u, 1), S.deckY(sp.u) + sp.rise, 0));
      structure.push(barrelGeo(tR, 1, tLen * 0.8).rotateZ(ELEV).rotateY(sp.face)
        .translate(S.stationX(sp.u, 1), S.deckY(sp.u) + sp.rise + tR * 0.5, 0));
    }
  } else {
    const tg = turretGeo(tR);
    const bg = barrelGeo(tR, kit.barrels, tLen);
    if (detail > 1) {
      aoAttr(tg, (x, y) => 1 - 0.42 * Math.exp(-Math.max(0, y) / (tR * 0.45)));
      flatAO(bg);
    }
    for (const sp of spots) {
      const g = new THREE.Group();
      g.position.set(S.stationX(sp.u, 1), S.deckY(sp.u) - 0.05 + sp.rise, 0);
      g.rotation.y = sp.face;
      const barbette = cyl(tR * 1.12, tR * 1.18, tR * 0.9 + sp.rise, 12,
        S.stationX(sp.u, 1), S.deckY(sp.u) - 0.05 - 0.4, 0, { flatZ: 0.94 });
      structure.push(barbette);
      const elev = new THREE.Group();
      elev.position.set(tR * 0.35, tR * 0.5, 0);
      elev.rotation.z = ELEV;
      g.add(elev);
      if (detail > 1) {
        // the meshes go into two InstancedMeshes below; the groups stay because the gun anchors,
        // the recoil and the training angle all hang off them
      } else {
        structure.push(tg.clone().rotateY(sp.face).translate(g.position.x, g.position.y, g.position.z));
        structure.push(bg.clone().rotateZ(ELEV).rotateY(sp.face)
          .translate(g.position.x + Math.cos(sp.face) * tR * 0.35, g.position.y + tR * 0.5, -Math.sin(sp.face) * tR * 0.35));
      }
      const a = new THREE.Object3D();
      a.position.set(tR * 0.5 + tLen, 0, 0);
      elev.add(a);
      body.add(g);
      gunAnchors.push(a);
      turrets.push({ group: g, elev, anchor: a, recoil: 0, base: g.position.x });
    }
    // A battleship's four turrets and four barrels were eight meshes in the main pass and eight
    // more in the shadow pass. They share one material and one geometry apiece, so they instance.
    if (detail > 1 && turrets.length) {
      const mat = getMaterial('hull', 'turret');
      turretIM = new THREE.InstancedMesh(tg, mat, turrets.length);
      barrelIM = new THREE.InstancedMesh(bg, mat, turrets.length);
      for (const im of [turretIM, barrelIM]) {
        im.castShadow = true;
        im.receiveShadow = true;
        im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        // instance matrices move with recoil and training, so the bound has to cover the hull
        im.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, S.deckY(0.5), 0), L * 0.62);
        body.add(im);
        meshes.push(im);
      }
      writeTurrets();
    }
  }

  function writeTurrets() {
    if (!turretIM) return;
    const m = new THREE.Matrix4();
    for (let i = 0; i < turrets.length; i++) {
      const t2 = turrets[i];
      t2.group.updateMatrix();
      t2.elev.updateMatrix();
      turretIM.setMatrixAt(i, t2.group.matrix);
      barrelIM.setMatrixAt(i, m.multiplyMatrices(t2.group.matrix, t2.elev.matrix));
    }
    turretIM.instanceMatrix.needsUpdate = true;
    barrelIM.instanceMatrix.needsUpdate = true;
  }

  // u from a world x, so the structure's AO can ask how far a vertex stands above the deck it is
  // sitting on. The rake term is under a percent of the length and is not worth inverting.
  const uOf = x => clamp(0.5 - x / L, 0, 1);
  const structAO = (x, y, z) => {
    let k = Math.exp(-Math.max(0, y - S.deckAt(uOf(x), z)) / 1.5);
    for (const sh of shelves) {
      if (y < sh.y - 0.4 || Math.abs(x - sh.x) > sh.w * 0.62 || Math.abs(z - sh.z) > sh.d * 0.62) continue;
      k = Math.max(k, Math.exp(-(y - sh.y) / 1.2));
    }
    return 1 - 0.58 * k;
  };

  if (detail === 0) {
    structure.push(hullShell(S).deleteAttribute('color'), deckPlate(S).deleteAttribute('color').translate(0, 0.02, 0));
    const m = add(flatAO(mergeGeometries(structure, false)), distantMaterial(), false);
    m.frustumCulled = true;
  } else {
    add(hullShell(S), hullMaterial(kitId));
    add(deckPlate(S, ao), getMaterial('hull', 'deck'));
    add(aoAttr(mergeGeometries(structure, false), structAO), getMaterial('hull', 'turret'));
    if (detail > 1) {
      add(mergeGeometries(glass, false), windowMaterial(), false);
      const rails = [railGeo(S), ladderGeo(S, ladders)].filter(Boolean);
      const rail = add(mergeGeometries(rails, false), getMaterial('hull', 'rail'), false);
      rail.receiveShadow = false;
      const cg = contactGeo(S, ao);
      if (cg) {
        const c = add(cg, contactMaterial(), false);
        c.receiveShadow = false;
        c.renderOrder = 1;
      }
      const crew = add(crewGeo(S, kit, r), crewMaterial(), true);
      crew.receiveShadow = false;
    }
  }

  let wake = null, collar = null;
  if (detail > 0) {
    // Both ride on ocean.heightAt() every frame, so their y drifts out of the bounds three baked at
    // build time; the swell is under a metre and the pad covers it. Culling these matters — a fleet
    // behind the camera was drawing 4 foam calls per ship for nothing.
    const pad = g => { g.computeBoundingSphere(); g.boundingSphere.radius += 10; return g; };
    wake = new THREE.Mesh(pad(wakeGeo(S)), wakeMaterial());
    wake.renderOrder = 2;
    object3D.add(wake);
    collar = new THREE.Mesh(pad(collarGeo(S)), collarMaterial());
    collar.renderOrder = 3;
    object3D.add(collar);
    const skirt = new THREE.Mesh(skirtGeo(S), skirtMaterial());
    skirt.renderOrder = 3;
    body.add(skirt);
    meshes.push(skirt);
  }

  const deckAnchor = new THREE.Object3D();
  deckAnchor.position.set(0, S.deckY(0.5), 0);
  body.add(deckAnchor);

  let damage = 0, roll = 0, t = 0;
  const wakeBase = wake ? wake.geometry.attributes.position.array.slice() : null;
  const collarBase = collar ? collar.geometry.attributes.position.array.slice() : null;
  const collarLift = collar ? collar.geometry.userData.lift : null;
  const collarHold = collar ? collar.geometry.userData.hold : null;
  const heaveSeed = r() * 100;

  const handle = {
    object3D, length: L, beam: B, freeboard: S.free, kitId, cells, detail,
    gunAnchors, deckAnchor, turrets, shape: S,

    // t = 0 at the bow, 1 at the stern
    hullPoint(t2) {
      const u = clamp(t2, 0, 1);
      return body.localToWorld(new THREE.Vector3(S.stationX(u, 1), S.deckY(u) * 0.35, 0));
    },

    // where a shell that struck this cell would break the skin: on the flank, not on the centreline
    hullSide(t2, side = 1) {
      const u = clamp(t2, 0, 1);
      return body.localToWorld(new THREE.Vector3(S.stationX(u, 0.9), S.deckY(u) * 0.25, S.sectionZ(u, 0.9) * side));
    },

    // recoil is a shove, not a rotation: the whole mounting rocks back and settles
    fireGun(i = 0) {
      const g = turrets[i % Math.max(1, turrets.length)];
      if (g) g.recoil = 1;
      return gunAnchors[i % Math.max(1, gunAnchors.length)] ?? deckAnchor;
    },

    trainGuns(rad) { for (const g of turrets) g.group.rotation.y = rad; writeTurrets(); },

    elevateGuns(rad) { for (const g of turrets) g.elev.rotation.z = rad; writeTurrets(); },

    setDamage(d) {
      damage = clamp(d, 0, 1);
      handle.listAngle(damage * SHIP.listMax);
    },

    listAngle(rad) { roll = rad; },

    get damage() { return damage; },

    update(dt) {
      t += dt;
      let moved = false;
      for (const g of turrets) {
        if (g.recoil > 0) {
          g.recoil = Math.max(0, g.recoil - dt * 3.2);
          g.group.position.x = g.base - Math.sin(g.recoil * Math.PI) * S.B * 0.06;
          moved = true;
        }
      }
      if (moved) writeTurrets();
      const ocean = window.__waterline?.world?.ocean;
      if (!ocean) return;
      const p = object3D.position;
      // sit in the water rather than on it: the heave is sampled a third of a length forward and
      // aft so the trim follows the swell the hull is actually straddling
      const c = Math.cos(object3D.rotation.y), s2 = Math.sin(object3D.rotation.y);
      const d = L * 0.33;
      const fwd = ocean.heightAt(p.x + c * d, p.z - s2 * d);
      const aft = ocean.heightAt(p.x - c * d, p.z + s2 * d);
      body.position.y = (fwd + aft) * 0.5 - damage * S.free * 0.30;
      // rotation.x rolls (Y↔Z, and Z is athwartships); rotation.z trims (X↔Y, and X is the bow).
      // Pass 1 had these the wrong way round, so a damaged ship pitched instead of listing and the
      // fore-and-aft swell gradient heeled the hull sideways — which is most of why the waterline
      // never lined up with the sea.
      body.rotation.x = roll + Math.sin(t * 0.55 + heaveSeed) * 0.012;
      body.rotation.z = Math.atan2(fwd - aft, d * 2) * 0.85;

      if (wake && detail > 1) {
        const a = wake.geometry.attributes.position;
        for (let i = 0; i < a.count; i++) {
          const bx = wakeBase[i * 3], bz = wakeBase[i * 3 + 2];
          a.setY(i, ocean.heightAt(p.x + c * bx + s2 * bz, p.z - s2 * bx + c * bz) - p.y + 0.25);
        }
        a.needsUpdate = true;
      }
      if (collar) {
        const a = collar.geometry.attributes.position;
        const hy = body.position.y, sp = Math.sin(body.rotation.z), sr = Math.sin(body.rotation.x);
        for (let i = 0; i < a.count; i++) {
          const bx = collarBase[i * 3], bz = collarBase[i * 3 + 2];
          const sea = ocean.heightAt(p.x + c * bx + s2 * bz, p.z - s2 * bx + c * bz) - p.y;
          const h = collarHold[i];
          a.setY(i, sea + (hy + bx * sp - bz * sr - sea) * h + collarLift[i]);
        }
        a.needsUpdate = true;
      }
    },

    dispose() {
      for (const m of meshes) m.geometry.dispose();
      wake?.geometry.dispose();
      collar?.geometry.dispose();
    },
  };

  return handle;
}

export const kitForLength = KIT_FOR_LENGTH;
