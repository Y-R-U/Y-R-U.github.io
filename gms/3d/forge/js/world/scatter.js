// Everything growing out of the ground: grass, flowers, shrubs, loose stone and trees.
// All instanced, one mesh per zone per type, density driven by quality.settings.foliage.

import * as THREE from 'three';
import { ZONE_IDS, zone } from './zones.js';
import { clamp, lerp, smoothstep } from './textures/noise.js';
import { heightAt, waterY, creekZ, creekHalf, zoneAt, fbm, CENTERS, nearCamera, inCorridor, camDist } from './terrain.js';
import { track } from '../engine/budget.js';

const CAP = { grass: 3050, flower: 440, bush: 300, rock: 150, tree: 66 };

function rng(seed) {
  let s = (seed >>> 0) || 0x9e3779b9;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

const span = (R, a, b) => a + R() * (b - a);

function white(g) {
  const n = g.attributes.position.count;
  const c = new Float32Array(n * 3).fill(1);
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}

// ── alpha-tested foliage cards ──
// A painted cluster of eleven blades on one quad costs four triangles. The old three-blade tuft
// cost six for three, which is why the grass read as isolated sticks: the triangle budget could
// never buy enough of them. Every quad is emitted twice with opposite winding rather than using
// DoubleSide, which flips the normal on the back face and turns half of each card black.

function paint(w, h, draw, label) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return track(t, { w, h, fmt: 'rgba', label });
}

function bladeStrokes(g, w, h, R, n, { top = 0.06, tipDot = 0 } = {}) {
  for (let i = 0; i < n; i++) {
    const x0 = w * (0.08 + 0.84 * ((i + 0.5) / n + (R() - 0.5) * 0.2));
    const tipY = h * top + h * (1 - top) * (1 - span(R, 0.42, 1.0));
    const lean = span(R, -0.34, 0.34) * w;
    const bw = w * span(R, 0.030, 0.058);
    const grd = g.createLinearGradient(0, h, 0, tipY);
    grd.addColorStop(0, 'rgba(112,112,112,1)');
    grd.addColorStop(0.5, 'rgba(200,200,200,1)');
    grd.addColorStop(1, 'rgba(255,255,255,1)');
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(x0 - bw, h);
    g.quadraticCurveTo(x0 - bw * 0.4 + lean * 0.42, (h + tipY) * 0.5, x0 + lean, tipY);
    g.quadraticCurveTo(x0 + bw * 0.4 + lean * 0.42, (h + tipY) * 0.5, x0 + bw, h);
    g.closePath();
    g.fill();
    if (tipDot) {
      g.fillStyle = '#fff';
      for (let k = 0; k < 3; k++) {
        g.beginPath();
        g.arc(x0 + lean + span(R, -1, 1) * w * 0.02, tipY + k * h * 0.045, tipDot * w, 0, 6.284);
        g.fill();
      }
    }
  }
}

// A quad standing on the ground, uv v = 0 at the base. Emitted with both windings so the same
// up-biased normal lights either side.
function pushCard(pos, nrm, uv, idx, { w, h, ry, ox = 0, oz = 0, lean = 0 }) {
  const c = Math.cos(ry), s = Math.sin(ry);
  const base = pos.length / 3;
  const corners = [[-w / 2, 0], [w / 2, 0], [w / 2, h], [-w / 2, h]];
  const nx = -s * 0.42, nz = c * 0.42;
  const nl = Math.hypot(nx, 0.9, nz);
  for (const [lx, ly] of corners) {
    const dz = ly > 0 ? lean : 0;
    pos.push(ox + lx * c + dz * -s, ly, oz + lx * s + dz * c);
    nrm.push(nx / nl, 0.9 / nl, nz / nl);
    uv.push(lx / w + 0.5, ly / h);
  }
  idx.push(base, base + 1, base + 2, base, base + 2, base + 3,
    base + 2, base + 1, base, base + 3, base + 2, base);
}

function cardGeo(cards) {
  const pos = [], nrm = [], uv = [], idx = [];
  for (const c of cards) pushCard(pos, nrm, uv, idx, c);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return white(g);
}

// ── soft blobs ──
// One closed icosahedron displaced by 3-D noise and given radial normals. The old version merged
// three overlapping spheres, and every intersection showed as a bright crack across the canopy.

function h3(x, y, z, s) {
  let n = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 1442695041) ^ Math.imul(s, 2246822519);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function vn3(x, y, z, s) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const f = (t) => t * t * (3 - 2 * t);
  const tx = f(x - ix), ty = f(y - iy), tz = f(z - iz);
  let v = 0;
  for (let k = 0; k < 2; k++) {
    let a = 0;
    for (let j = 0; j < 2; j++) {
      const l0 = h3(ix, iy + j, iz + k, s), l1 = h3(ix + 1, iy + j, iz + k, s);
      a += (l0 + (l1 - l0) * tx) * (j ? ty : 1 - ty);
    }
    v += a * (k ? tz : 1 - tz);
  }
  return v * 2 - 1;
}

function lumpGeo(detail, { sy = 1, lump = 0.3, flat = 0, seed = 1, shade = 0.5, ground = true }) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const p = g.attributes.position;
  const n = p.count;
  const nrm = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let ymin = Infinity, ymax = -Infinity;
  const dir = [];
  for (let i = 0; i < n; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const r = 1 + lump * vn3(x * 1.7 + 5, y * 1.7 + 5, z * 1.7 + 5, seed)
                + lump * 0.45 * vn3(x * 3.9 - 3, y * 3.9 - 3, z * 3.9 - 3, seed + 7);
    const py = (y < 0 ? y * (1 - flat) : y) * sy * r;
    p.setXYZ(i, x * r, py, z * r);
    dir.push(x, y, z);
    ymin = Math.min(ymin, py); ymax = Math.max(ymax, py);
  }
  for (let i = 0; i < n; i++) {
    const x = dir[i * 3], y = dir[i * 3 + 1] / (sy || 1), z = dir[i * 3 + 2];
    const l = Math.hypot(x, y, z) || 1;
    nrm[i * 3] = x / l; nrm[i * 3 + 1] = y / l; nrm[i * 3 + 2] = z / l;
    const c = shade + (1 - shade) * ((p.getY(i) - ymin) / (ymax - ymin || 1));
    col[i * 3] = c; col[i * 3 + 1] = c; col[i * 3 + 2] = c;
  }
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
  if (ground) g.translate(0, -ymin, 0);
  return g;
}

function rockGeo(R) {
  const g = new THREE.IcosahedronGeometry(0.5, 0).toNonIndexed();
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    p.setXYZ(i, p.getX(i) * span(R, 0.85, 1.35), p.getY(i) * span(R, 0.6, 0.95), p.getZ(i) * span(R, 0.85, 1.35));
  }
  g.computeVertexNormals();
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(p.count * 2), 2));
  return white(g);
}

// A root flare, not a cylinder pushed through the grass: the profile widens sharply in the
// bottom fifth so the trunk spreads into the ground the way the reference plates do.
function trunkGeo() {
  const prof = [[0.46, 0], [0.22, 0.14], [0.115, 1]].map(([r, y]) => new THREE.Vector2(r, y));
  return white(new THREE.LatheGeometry(prof, 6));
}

// Leaf clusters, dense in the middle and ragged at the border. Three of these crossed through a
// canopy cost twelve triangles and are the only affordable way to stop an 80-face icosphere
// reading as a polygon against the sky.
function leafCluster(g, w, h, R) {
  const cx = w / 2, cy = h * 0.52;
  for (let i = 0; i < 90; i++) {
    const a = R() * 6.284;
    const rr = Math.pow(R(), 0.55);
    const x = cx + Math.cos(a) * rr * w * 0.52;
    const y = cy + Math.sin(a) * rr * h * 0.46;
    const s = w * span(R, 0.035, 0.075) * (1.25 - rr * 0.5);
    const v = Math.round(205 + 50 * (1 - rr) * span(R, 0.4, 1));
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.beginPath();
    g.ellipse(x, y, s, s * span(R, 0.55, 0.95), a, 0, 6.284);
    g.fill();
  }
}

const TEX = {
  grass: paint(256, 128, (g, w, h) => bladeStrokes(g, w, h, rng(0x77aa11), 22), 'foliage:grass'),
  flower: paint(96, 96, (g, w, h) => bladeStrokes(g, w, h, rng(0x22bb44), 5, { top: 0.16, tipDot: 0.038 }), 'foliage:flower'),
  leaf: paint(128, 128, (g, w, h) => leafCluster(g, w, h, rng(0x5c31d9)), 'foliage:leaf'),
};

const foliageMat = (name, opts = {}) => new THREE.MeshStandardMaterial({
  vertexColors: true, roughness: 0.92, metalness: 0, name, ...opts,
});

class Kind {
  constructor(geo, mat, cap, { cast = true, receive = true } = {}) {
    this.geo = geo; this.mat = mat; this.cap = cap; this.cast = cast; this.receive = receive;
    this.items = [];
    this.pri = [];
  }
  add(m, c) { this.items.push({ m, c }); }
  // dressing that sits against a wall survives both the cap and the density knob
  addPri(m, c) { this.pri.push({ m, c }); }
}

export class Scatter {
  constructor(terrain) {
    this.terrain = terrain;
    this.object3D = new THREE.Group();
    this.object3D.name = 'scatter';
    this.meshes = [];
    this.density = 1;
  }

  build(quality) {
    const T = this.terrain;
    const R = rng(0x51f3a2);
    const kinds = ZONE_IDS.map((id, i) => {
      const z = zone(id);
      return {
        grass: new Kind(cardGeo([
          { w: 1.45, h: 1.0, ry: 0, lean: 0.07 },
          { w: 1.15, h: 0.86, ry: 1.16, ox: 0.14, oz: -0.08, lean: -0.06 },
        ]), foliageMat('grass', { map: TEX.grass, alphaTest: 0.28, roughness: 0.96 }), CAP.grass, { cast: false }),
        flower: new Kind(cardGeo([{ w: 0.52, h: 1.0, ry: 0, lean: 0.04 }]),
          foliageMat('flower', { map: TEX.flower, alphaTest: 0.26 }), CAP.flower, { cast: false }),
        bush: new Kind(lumpGeo(0, { sy: 0.8, lump: 0.36, flat: 0.6, seed: 3 + i, shade: 0.4 }),
          foliageMat('bush'), CAP.bush),
        rock: new Kind(rockGeo(R), foliageMat('rock', { roughness: 0.85 }), CAP.rock),
        trunk: new Kind(trunkGeo(), foliageMat('trunk', { roughness: 0.9 }), CAP.tree),
        canopy: new Kind(lumpGeo(1, { sy: 1.02, lump: 0.36, flat: 0.22, seed: 11 + i, shade: 0.42, ground: false }),
          foliageMat('canopy'), CAP.tree),
        fringe: new Kind(cardGeo([
          { w: 2.5, h: 2.3, ry: 0, ox: 0, oz: 0 },
          { w: 2.4, h: 2.2, ry: 1.05, ox: 0, oz: 0 },
          { w: 2.3, h: 2.15, ry: 2.1, ox: 0, oz: 0 },
        ]), foliageMat('fringe', { map: TEX.leaf, alphaTest: 0.35 }), CAP.tree),
        z,
      };
    });

    const m4 = new THREE.Matrix4();
    const col = new THREE.Color();
    const place = (x, z, sx, sy, sz, ry) => m4.makeRotationY(ry).scale(new THREE.Vector3(sx, sy, sz)).setPosition(x, T.surfaceY(x, z), z);
    const free = (x, z, margin = 0) => {
      if (T.blocked(x, z)) return false;
      return heightAt(x, z) > waterY(x) + margin;
    };

    // One clump, not one quad. A single tuft next to a wall footing leaves the razor line intact
    // either side of it; a clump of three to six overlapping pieces, some of them tucked back
    // *under* the wall face, is what actually eats the join.
    const clump = (px, pz, { n = 4, spread = 0.55, size = 1, pri = true, litter = 0 }) => {
      if (heightAt(px, pz) < waterY(px) + 0.02) return;
      const zi = zoneAt(px, pz);
      const zz = kinds[zi].z;
      for (let k = 0; k < n; k++) {
        const qx = px + span(R, -spread, spread), qz = pz + span(R, -spread, spread);
        const roll = R();
        const add = (kind, m, c) => (pri ? kinds[zi][kind].addPri(m, c) : kinds[zi][kind].add(m, c));
        if (roll < 0.14 + litter * 0.4) {
          col.set(zz.stone.base).lerp(new THREE.Color(zz.stone.dark), span(R, 0.3, 1)).multiplyScalar(span(R, 0.5, 0.85));
          const sc = span(R, 0.3, 0.85) * size;
          // sunk, not perched — a pebble sitting on top of the grass is its own sticker problem
          const m = place(qx, qz, sc, sc * span(R, 0.5, 0.9), sc, span(R, 0, 6.28)).clone();
          m.elements[13] -= sc * span(R, 0.18, 0.4);
          add('rock', m, col.clone());
        } else if (roll < 0.34) {
          col.set(R() < 0.5 ? zz.foliage.leaf : zz.foliage.grass[2]).multiplyScalar(span(R, 0.42, 0.82));
          const sc = span(R, 0.5, 1.15) * size;
          const m = place(qx, qz, sc, sc * span(R, 0.55, 1.0), sc, span(R, 0, 6.28)).clone();
          m.elements[13] -= sc * 0.12;
          add('bush', m, col.clone());
        } else {
          col.set(zz.foliage.grass[R() < 0.5 ? 2 : 0]).multiplyScalar(span(R, 0.55, 1.0));
          if (litter) col.lerp(new THREE.Color(0x8f7a4a), litter * span(R, 0.3, 0.8));
          const sc = span(R, 0.55, 1.0) * size;
          add('grass', place(qx, qz, sc, sc * span(R, 0.8, 1.5) * (litter ? 0.55 : 1), sc, span(R, 0, 6.28)).clone(), col.clone());
        }
      }
    };

    // Every wall/ground join gets a clump growing out of it. Runs first and is priority-tagged,
    // so neither the cap nor the density knob can strip it.
    for (const fp of T.footprints) {
      const per = 4 * (fp.hw + fp.hd);
      const c = Math.cos(fp.rot), s = Math.sin(fp.rot);
      const n = Math.max(5, Math.round(per * 0.3));
      for (let i = 0; i < n; i++) {
        const t = ((i + span(R, 0.1, 0.9)) / n) * per;
        let lx, lz;
        if (t < 2 * fp.hw) { lx = t - fp.hw; lz = -fp.hd; }
        else if (t < 2 * fp.hw + 2 * fp.hd) { lx = fp.hw; lz = t - 2 * fp.hw - fp.hd; }
        else if (t < 4 * fp.hw + 2 * fp.hd) { lx = 3 * fp.hw + 2 * fp.hd - t; lz = fp.hd; }
        else { lx = -fp.hw; lz = 3 * fp.hd + 4 * fp.hw - t; }
        // negative `out` puts part of the clump behind the wall face, which is the whole point
        const out = span(R, -0.35, 0.95);
        lx += Math.sign(lx || 1) * (Math.abs(lx) > fp.hw - 0.01 ? out : 0);
        lz += Math.sign(lz || 1) * (Math.abs(lz) > fp.hd - 0.01 ? out : 0);
        clump(fp.x + lx * c - lz * s, fp.z + lx * s + lz * c,
          { n: 3 + Math.floor(R() * 4), spread: span(R, 0.35, 0.75), size: span(R, 0.8, 1.25) });
      }
    }

    // the waterline: reed clumps and shingle where the creek meets its bank, plus a wet fringe
    // standing in the shallows so the water does not stop at a clean vector edge
    for (let x = -148; x < 148; x += 2.1) {
      const cz = creekZ(x), wy = waterY(x), half = creekHalf(x);
      for (const side of [-1, 1]) {
        const px = x + span(R, -1.0, 1.0);
        const pz = cz + side * (half + span(R, -0.9, 2.4));
        if (T.blocked(px, pz)) continue;
        const zi = zoneAt(px, pz);
        const zz = kinds[zi].z;
        if (heightAt(px, pz) < wy - 0.45) continue;
        if (R() < 0.42) {
          for (let k = 0; k < 3; k++) {
            col.set(zz.stone.base).lerp(new THREE.Color(zz.stone.dark), span(R, 0.4, 1)).multiplyScalar(span(R, 0.4, 0.72));
            const sc = span(R, 0.2, 0.6);
            const m = place(px + span(R, -0.6, 0.6), pz + span(R, -0.5, 0.5), sc, sc * span(R, 0.4, 0.8), sc, span(R, 0, 6.28)).clone();
            m.elements[13] -= sc * 0.3;
            kinds[zi].rock.addPri(m, col.clone());
          }
        } else {
          for (let k = 0; k < 4; k++) {
            col.set(zz.foliage.grass[1]).lerp(new THREE.Color(0xa8a055), span(R, 0, 0.6)).multiplyScalar(span(R, 0.55, 1.0));
            const sc = span(R, 0.7, 1.4);
            kinds[zi].grass.addPri(place(px + span(R, -0.7, 0.7), pz + span(R, -0.6, 0.6),
              sc * 0.75, sc * span(R, 1.3, 2.2), sc * 0.75, span(R, 0, 6.28)).clone(), col.clone());
          }
        }
      }
    }

    // the verge: a road that ends in a clean polygon edge is the other half of the sticker problem
    for (const { pts, halfWidth } of T.paths) {
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const nx = -(b[1] - a[1]) / len, nz = (b[0] - a[0]) / len;
        for (let s = 0; s < len; s += 1.5) {
          for (const side of [-1, 1]) {
            const t = s / len;
            const off = side * (halfWidth + span(R, -0.9, 1.6));
            const px = lerp(a[0], b[0], t) + nx * off, pz = lerp(a[1], b[1], t) + nz * off;
            if (T.blocked(px, pz)) continue;
            clump(px, pz, { n: 2 + Math.floor(R() * 3), spread: 0.55, size: span(R, 0.65, 1.0), litter: 0.35 });
          }
        }
      }
    }

    // grass — everywhere, thickest where the AO field says a wall is close by
    for (let z = -104; z < 112; z += 2.15) {
      for (let x = -146; x < 146; x += 2.15) {
        const px = x + span(R, -1.2, 1.2), pz = z + span(R, -1.2, 1.2);
        if (!free(px, pz, 0.02)) continue;
        const sl = T.slopeAt(px, pz);
        if (sl > 0.95) continue;
        const ao = T.ao(px, pz);
        const dn = fbm(px * 0.028, pz * 0.028, 2, 3) * 0.5 + 0.5;
        const bank = smoothstep(1.5, 0.15, heightAt(px, pz) - waterY(px));
        // The instance budget is finite and the map is 300 × 224 m; spreading it evenly buys a
        // blade every 20 m². Weighting towards the shot positions is what makes the near field
        // read as a lawn instead of a sprinkling of sticks.
        const near = 0.12 + 0.88 * smoothstep(132, 28, camDist(px, pz));
        const p = (0.28 + 0.6 * dn + 1.4 * ao + 0.8 * bank - 0.5 * sl) * near;
        if (R() > p) continue;
        const zi = zoneAt(px, pz);
        const g = kinds[zi].z.foliage.grass;
        const shade = g[Math.floor(clamp(fbm(px * 0.09, pz * 0.09, 2, 21) * 1.6 + 1.5, 0, 2.99))];
        col.set(shade);
        if (bank > 0.35) col.lerp(new THREE.Color(0xb8b063), bank * 0.5);
        const k = 1 - 0.35 * ao;
        col.multiplyScalar(k * span(R, 0.85, 1.18));
        const meadow = smoothstep(0.15, 0.75, dn) * (1 - clamp(ao * 1.6, 0, 1));
        const s = span(R, 0.42, 0.78) * (1 + meadow * 0.85 + bank * 0.9) * (1 + ao * 0.3);
        kinds[zi].grass.add(place(px, pz, s, s * span(R, 0.9, 1.5), s, span(R, 0, 6.28)).clone(), col.clone());
      }
    }

    // flowers — clustered, the one saturated accent in the palette
    const HUES = [0x7b62b8, 0x9a7fd0, 0xe4e2ea, 0xd8a94e];
    for (let z = -60; z < 96; z += 3.2) {
      for (let x = -146; x < 146; x += 3.2) {
        const px = x + span(R, -1.4, 1.4), pz = z + span(R, -1.4, 1.4);
        if (!free(px, pz, 0.15)) continue;
        const cl = fbm(px * 0.055, pz * 0.055, 2, 33);
        const ao = T.ao(px, pz);
        if (cl < 0.2 && ao < 0.2) continue;
        if (R() > 0.3 + 0.8 * cl + 0.7 * ao) continue;
        const zi = zoneAt(px, pz);
        col.set(HUES[Math.floor(R() * (R() < 0.72 ? 2 : 4))]);
        col.multiplyScalar(span(R, 0.8, 1.15) * (zi === 2 ? 0.62 : 1));
        for (let k = 0, n = 1 + Math.floor(R() * 3); k < n; k++) {
          const s = span(R, 0.4, 0.78);
          kinds[zi].flower.add(place(px + span(R, -0.6, 0.6), pz + span(R, -0.6, 0.6),
            s, s * span(R, 0.8, 1.4), s, span(R, 0, 6.28)).clone(), col.clone());
        }
      }
    }

    // shrubs — thickets rather than single balls, so they read as one mass with a ragged edge
    for (let z = -100; z < 110; z += 6.4) {
      for (let x = -144; x < 144; x += 6.4) {
        const px = x + span(R, -2.6, 2.6), pz = z + span(R, -2.6, 2.6);
        if (!free(px, pz, 0.25)) continue;
        const ao = T.ao(px, pz);
        const dn = fbm(px * 0.021, pz * 0.021, 2, 51) * 0.5 + 0.5;
        if (R() > 0.14 + 0.4 * dn + 1.1 * ao) continue;
        const zi = zoneAt(px, pz);
        const zz = kinds[zi].z;
        const big = span(R, 0.55, 1.1);
        for (let k = 0, n = 2 + Math.floor(R() * 3); k < n; k++) {
          const qx = px + span(R, -1.0, 1.0), qz = pz + span(R, -1.0, 1.0);
          col.set(R() < 0.4 ? zz.foliage.grass[2] : zz.foliage.leaf).multiplyScalar(span(R, 0.48, 1.0));
          const s = big * span(R, 0.55, 1.05);
          const m = place(qx, qz, s, s * span(R, 0.75, 1.2), s, span(R, 0, 6.28)).clone();
          m.elements[13] -= s * 0.14;
          kinds[zi].bush.add(m, col.clone());
        }
        for (let k = 0; k < 3; k++) {
          col.set(zz.foliage.grass[R() < 0.5 ? 0 : 2]).multiplyScalar(span(R, 0.6, 1.0));
          const s = span(R, 0.5, 0.9);
          kinds[zi].grass.add(place(px + span(R, -1.3, 1.3), pz + span(R, -1.3, 1.3), s, s * span(R, 0.9, 1.5), s, span(R, 0, 6.28)).clone(), col.clone());
        }
        T.mark(px, pz, big * 0.5);
        T.addPropDecal(px, pz, 1.1 + big * 1.1, 0.34);
      }
    }

    // loose stone — screes on slopes, spill at wall feet, shingle at the water
    for (let z = -104; z < 112; z += 4.6) {
      for (let x = -146; x < 146; x += 4.6) {
        const px = x + span(R, -2, 2), pz = z + span(R, -2, 2);
        if (!free(px, pz, -0.35)) continue;
        const sl = T.slopeAt(px, pz);
        const ao = T.ao(px, pz);
        const shore = smoothstep(0.9, -0.3, heightAt(px, pz) - waterY(px));
        if (R() > 0.05 + 0.75 * smoothstep(0.3, 0.9, sl) + 1.0 * ao + 0.6 * shore) continue;
        const zi = zoneAt(px, pz);
        col.set(kinds[zi].z.stone.base).lerp(new THREE.Color(kinds[zi].z.stone.dark), span(R, 0.35, 1));
        col.multiplyScalar(span(R, 0.5, 0.85) * (shore > 0.4 ? 0.75 : 1));
        const s = span(R, 0.24, 0.68) * (1 + ao * 0.5);
        const m = place(px, pz, s, s * span(R, 0.6, 1.1), s, span(R, 0, 6.28)).clone();
        m.elements[13] -= s * span(R, 0.2, 0.45);
        kinds[zi].rock.add(m, col.clone());
        if (R() < 0.55) {
          col.set(kinds[zi].z.foliage.grass[R() < 0.5 ? 0 : 2]).multiplyScalar(span(R, 0.55, 1.0));
          const gs = span(R, 0.45, 0.8);
          kinds[zi].grass.add(place(px + span(R, -0.7, 0.7), pz + span(R, -0.7, 0.7), gs, gs * span(R, 0.9, 1.4), gs, span(R, 0, 6.28)).clone(), col.clone());
        }
      }
    }

    // trees — a wooded rim behind the walls and across the water, sparse inside the towns
    const inTown = (x, z) => {
      if (z < -46 || z > 26) return 0;
      let m = 0;
      for (const cx of CENTERS) m = Math.max(m, smoothstep(33, 20, Math.abs(x - cx)));
      return m;
    };
    // one tree per grid cell reads as an orchard; a copse of two or three with different heights
    // crowding each other reads as woodland, and it breaks a hard ridge line as well
    const tree = (px, pz, ridge, boost) => {
      if (!free(px, pz, 0.45) || nearCamera(px, pz, 7)) return;
      if (inCorridor(px, pz, 34, 7) || T.slopeAt(px, pz) > 0.85) return;
      const zi = zoneAt(px, pz);
      const zz = kinds[zi].z;
      const th = span(R, 2.4, 5.6) * boost * (1 + ridge * span(R, 0.1, 0.7));
      const tr = span(R, 0.8, 1.1) * (0.8 + th * 0.05);
      const cs = span(R, 1.4, 2.4) * (1 + (th - 2.4) * 0.08);
      const ry = span(R, 0, 6.28);
      col.set(zz.foliage.trunk).multiplyScalar(span(R, 0.8, 1.15));
      kinds[zi].trunk.add(place(px, pz, tr, th, tr, ry).clone(), col.clone());
      col.set(R() < 0.3 ? zz.foliage.grass[2] : zz.foliage.leaf).multiplyScalar(span(R, 0.5, 1.05));
      const cy = cs * span(R, 0.82, 1.2);
      const m = place(px, pz, cs, cy, cs, ry).clone();
      m.elements[13] += th * 0.86;
      kinds[zi].canopy.add(m, col.clone());
      const f = place(px, pz, cs, cy, cs, ry + span(R, 0, 1)).clone();
      f.elements[13] += th * 0.86 - cy * 1.12;
      kinds[zi].fringe.add(f, col.clone());
      // leaf litter and long grass around the flare, so the trunk grows out of the ground
      clump(px + span(R, -0.5, 0.5), pz + span(R, -0.5, 0.5),
        { n: 4, spread: 0.85, size: span(R, 0.7, 1.1), pri: false, litter: 0.7 });
      T.addPropDecal(px, pz, 0.9 + cs * 0.7, 0.5);
      T.mark(px, pz, 0.85);
    };

    for (let z = -104; z < 112; z += 11) {
      for (let x = -146; x < 146; x += 11) {
        const px = x + span(R, -4.4, 4.4), pz = z + span(R, -4.4, 4.4);
        const wood = fbm(px * 0.016, pz * 0.016, 2, 67) * 0.5 + 0.5;
        const rim = smoothstep(-40, -62, pz) + smoothstep(58, 76, pz) + smoothstep(96, 126, Math.abs(px));
        const ridge = smoothstep(-52, -74, pz);
        const town = inTown(px, pz);
        const p = (0.24 + 1.0 * wood + 1.1 * Math.min(rim, 1) + 0.5 * ridge) * (1 - town * 0.87);
        if (R() > p) continue;
        const n = 1 + Math.floor(R() * (2 + Math.round(wood * 2)));
        for (let k = 0; k < n; k++) {
          tree(px + span(R, -3.2, 3.2), pz + span(R, -3.2, 3.2), ridge, k === 0 ? 1 : span(R, 0.6, 0.95));
        }
      }
    }

    for (const [zi, set] of kinds.entries()) {
      // trunk, canopy and fringe are one tree, so they must be thinned in step
      shuffle(set.trunk.items, R, set.canopy.items, set.fringe.items);
      for (const name of ['grass', 'flower', 'bush', 'rock', 'trunk', 'canopy', 'fringe']) {
        const k = set[name];
        if (name === 'grass' || name === 'flower' || name === 'bush' || name === 'rock') shuffle(k.items, R);
        k.items = k.pri.concat(k.items);
        if (k.items.length > k.cap) k.items.length = k.cap;
        if (!k.items.length) continue;
        const mesh = new THREE.InstancedMesh(k.geo, k.mat, k.items.length);
        for (let i = 0; i < k.items.length; i++) {
          mesh.setMatrixAt(i, k.items[i].m);
          mesh.setColorAt(i, k.items[i].c);
        }
        mesh.instanceMatrix.needsUpdate = true;
        mesh.castShadow = k.cast;
        mesh.receiveShadow = k.receive;
        mesh.name = `${ZONE_IDS[zi]}:${name}`;
        mesh.userData.max = k.items.length;
        mesh.computeBoundingSphere();
        this.object3D.add(mesh);
        this.meshes.push(mesh);
      }
    }

    this.applyDensity(quality?.get('foliage') ?? 1);
  }

  applyDensity(f) {
    this.density = f;
    for (const m of this.meshes) m.count = Math.max(0, Math.min(m.userData.max, Math.round(m.userData.max * f)));
  }

  registerKnobs(q) {
    q.register({ key: 'foliage', label: 'Foliage density', type: 'range', min: 0, max: 1.5, step: 0.05, group: 'World' },
      v => this.applyDensity(v));
  }
}

function shuffle(a, R, ...rest) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(R() * (i + 1));
    const t = a[i]; a[i] = a[j]; a[j] = t;
    for (const b of rest) { const u = b[i]; b[i] = b[j]; b[j] = u; }
  }
}
