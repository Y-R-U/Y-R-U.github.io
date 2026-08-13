// Everything growing out of the ground: grass, flowers, shrubs, loose stone and trees.
// All instanced, one mesh per zone per type, density driven by quality.settings.foliage.

import * as THREE from 'three';
import { ZONE_IDS, zone } from './zones.js';
import { clamp, lerp, smoothstep } from './textures/noise.js';
import { heightAt, waterY, creekZ, creekHalf, zoneAt, fbm, TOWNS, BOUNDS as WB, nearCamera, inCorridor, camDist } from './terrain.js';
import { getEnvIntensity, onEnvIntensity } from './materials.js';
import { defineScenario, frameCamera } from '../scenarios.js';
import { paint, noFlip, SPECIES, barkGeo, crownGeo, LEAF_TEX, BARK_TEX, CROWN } from './tree.js';

// Per zone. grass rose from 3100 with A4: the placement loops now cover 1440 x 720 m and even
// with the `reach` gate the same budget has three separated camera bubbles to fill instead of one
// overlapping cluster, so the old cap thinned the near field to about 60% of its density.
const CAP = { grass: 4400, flower: 320, bush: 340, rock: 170, tree: 78 };

const TUNING = {
  grass: { cluster: [1, 5], clusterR: 0.78, footBlend: 0.5, footShade: 0.92, tip: 0.98, value: 0.82 },
  crown: { join: 0.50, rim: 0.07, top: 0.36 },
  bush: { lobes: 3, amp: 0.44, sharp: 1.5, noise: 0.14, mottle: 0.2, flat: 0.68, sy: 0.70, join: 0.36, rim: 0.16, top: 0.68 },
  trunk: { prof: [[0.54, 0], [0.29, 0.13], [0.165, 1]], sides: 6, foot: 0.32 },
  tree: { canopyDecal: 0.55, footDecal: 0.8, conifer: 'cone', style: 'mixed' },
  cone: { tiers: 4, sides: 7, under: 0.34, jitter: 0.21, rim: 0.10, join: 0.30, top: 0.70 },
  spire: { tiers: 4, sides: 8, under: 0, jitter: 0.24, rim: 0.12, join: 0.34, top: 0.70 },
  prism: { rim: 0.10, join: 0.62, top: 0.72 },
  needle: { alphaTest: 0.42 },
  level: { canopy: 0.78, grass: 0.78, env: 1.4 },
  flowerHues: [0x7b62b8, 0x9a7fd0, 0xe4e2ea, 0xd8a94e],
};

let GID = 0;
const BROAD = /^(bark|leaf)\d$/;

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

// Instance colour multiplies the geometry's baked colour, so anything whose geometry carries an
// absolute palette (canopy, bush, fringe, grass base blend) wants a near-1 multiplier here.
function tint(out, R, lo, hi, warm = 0.06) {
  const k = span(R, lo, hi), t = span(R, -warm, warm);
  return out.setRGB(k * (1 + t), k, k * (1 - t * 1.4));
}

// The hue of `target` relative to `ref`, with the brightness difference divided out — a pale
// ground would otherwise bleach the root of every blade standing in it. The instance colour of a
// grass card carries its own shade, so bending only the *root* means baking this into the geometry.
const A = new THREE.Color(), B = new THREE.Color();
function footRatio(target, ref, blend, shade) {
  A.set(target); B.set(ref);
  const r = [A.r / (B.r || 1e-3), A.g / (B.g || 1e-3), A.b / (B.b || 1e-3)];
  const m = (r[0] * 0.3 + r[1] * 0.6 + r[2] * 0.1) || 1;
  const [x, y, w] = r.map(v => lerp(1, clamp(v / m, 0.45, 2.2), blend) * shade);
  return new THREE.Color(x, y, w);
}

// ── alpha-tested foliage cards ──
// A painted cluster of blades on one quad costs four triangles. The old three-blade tuft cost six
// for three, which is why the grass read as isolated sticks: the triangle budget could never buy
// enough of them. Every quad is emitted twice with opposite winding rather than using DoubleSide,
// which flips the normal on the back face and turns half of each card black.

// Blades are painted near-white at the tip and only mildly darker at the root. The old map ran
// 0.44 → 1.0, and against pale ground that dark root is what made a lawn read as a field of spikes.
function bladeStrokes(g, x0p, w, h, R, n, { top = 0.06, root = 0.55, tint = 0.07 } = {}) {
  for (let i = 0; i < n; i++) {
    const x0 = x0p + w * (0.08 + 0.84 * ((i + 0.5) / n + (R() - 0.5) * 0.26));
    const tipY = h * top + h * (1 - top) * (1 - span(R, 0.42, 1.0));
    const lean = span(R, -0.38, 0.38) * w;
    const bw = w * span(R, 0.030, 0.058);
    const t = span(R, -tint, tint);
    const k = span(R, 0.86, 1.06);
    const shade = (v) => {
      const l = Math.min(255, v * k);
      return `rgb(${Math.round(Math.min(255, l * (1 + t)))},${Math.round(l)},${Math.round(l * (1 - t * 1.6))})`;
    };
    const grd = g.createLinearGradient(0, h, 0, tipY);
    grd.addColorStop(0, shade(255 * root));
    grd.addColorStop(0.55, shade(255 * (root + (1 - root) * 0.5)));
    grd.addColorStop(1, shade(248));
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(x0 - bw, h);
    g.quadraticCurveTo(x0 - bw * 0.4 + lean * 0.42, (h + tipY) * 0.5, x0 + lean, tipY);
    g.quadraticCurveTo(x0 + bw * 0.4 + lean * 0.42, (h + tipY) * 0.5, x0 + bw, h);
    g.closePath();
    g.fill();
  }
}

// The second panel of the grass atlas: a low skirt of short broad leaves with blades standing
// through it. The two crossed quads of one clump take one panel each, so every clump gets both
// silhouettes without a second draw call. Pure broad leaves at this scale read as agave.
function broadLeaves(g, x0p, w, h, R) {
  for (let i = 0; i < 14; i++) {
    const x0 = x0p + w * (0.1 + 0.8 * ((i + 0.5) / 14 + (R() - 0.5) * 0.34));
    const len = h * span(R, 0.14, 0.36);
    const out = span(R, -0.5, 0.5) * w * 0.22;
    const bw = w * span(R, 0.026, 0.052);
    const k = span(R, 0.5, 0.78);
    const t = span(R, -0.1, 0.1);
    const grd = g.createLinearGradient(0, h, 0, h - len);
    const shade = (v) => `rgb(${Math.round(Math.min(255, v * k * (1 + t)))},${Math.round(v * k)},${Math.round(v * k * (1 - t * 1.6))})`;
    grd.addColorStop(0, shade(170));
    grd.addColorStop(1, shade(250));
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(x0, h);
    g.quadraticCurveTo(x0 + out * 0.4 - bw, h - len * 0.7, x0 + out, h - len);
    g.quadraticCurveTo(x0 + out * 0.4 + bw, h - len * 0.7, x0 + bw * 0.5, h);
    g.closePath();
    g.fill();
  }
  bladeStrokes(g, x0p, w, h, R, 14, { root: 0.5 });
}

// A quad standing on the ground, uv v = 0 at the base. Emitted with both windings so the same
// up-biased normal lights either side.
function pushCard(pos, nrm, uv, col, idx, c, ramp) {
  const { w, h, ry, ox = 0, oy = 0, oz = 0, lean = 0, u0 = 0, u1 = 1, up = 0.9 } = c;
  const cs = Math.cos(ry), sn = Math.sin(ry);
  const base = pos.length / 3;
  const corners = [[-w / 2, 0], [w / 2, 0], [w / 2, h], [-w / 2, h]];
  const nx = -sn * 0.42, nz = cs * 0.42;
  const nl = Math.hypot(nx, up, nz);
  for (const [lx, ly] of corners) {
    const dz = ly > 0 ? lean : 0;
    pos.push(ox + lx * cs + dz * -sn, oy + ly, oz + lx * sn + dz * cs);
    nrm.push(nx / nl, up / nl, nz / nl);
    uv.push(u0 + (lx / w + 0.5) * (u1 - u0), ly / h);
    const t = ramp ? ramp(ly / h) : null;
    col.push(t ? t.r : 1, t ? t.g : 1, t ? t.b : 1);
  }
  idx.push(base, base + 1, base + 2, base, base + 2, base + 3,
    base + 2, base + 1, base, base + 3, base + 2, base);
}

function cardGeo(cards, ramp) {
  const pos = [], nrm = [], uv = [], col = [], idx = [];
  for (const c of cards) pushCard(pos, nrm, uv, col, idx, c, ramp);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

// ── soft blobs ──
// One closed icosahedron pushed out by a handful of wide, overlapping lobes. Merging three real
// spheres showed a bright crack wherever two of them intersected; displacing a single surface
// gives the same clumped silhouette with no seam and no interior faces. Normals stay radial to
// the undisplaced sphere, which is what keeps the shading soft while the outline stays ragged.

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

function lobes(seed, n) {
  const R = rng(seed * 7919 + 13);
  const out = [];
  for (let i = 0; i < n; i++) {
    const y = span(R, -0.2, 0.8);
    const a = (i / n) * 6.284 + span(R, -0.7, 0.7);
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    out.push([Math.cos(a) * r, y, Math.sin(a) * r, span(R, 0.5, 1.0)]);
  }
  return out;
}

function blobGeo(detail, o) {
  const { sy = 1, flat = 0, seed = 1, ground = true, ramp,
    lobes: nl = 3, amp = 0.34, sharp = 1.45, noise = 0.12, mottle = 0 } = o;
  const g = new THREE.IcosahedronGeometry(1, detail);
  const p = g.attributes.position;
  const n = p.count;
  const L = lobes(seed, nl);
  const nrm = new Float32Array(n * 3), col = new Float32Array(n * 3);
  const norm = 1 / (1 + amp * 0.55);
  let ymin = Infinity, ymax = -Infinity;
  const dir = [];
  for (let i = 0; i < n; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    let r = 1;
    for (const [lx, ly, lz, la] of L) {
      const d = x * lx + y * ly + z * lz;
      if (d > 0) r += amp * la * Math.pow(d, sharp);
    }
    r = (r + noise * vn3(x * 2.4 + 5, y * 2.4 + 5, z * 2.4 + 5, seed)) * norm;
    const py = (y < 0 ? y * (1 - flat) : y) * sy * r;
    p.setXYZ(i, x * r, py, z * r);
    dir.push(x, y, z);
    ymin = Math.min(ymin, py); ymax = Math.max(ymax, py);
  }
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const x = dir[i * 3], y = dir[i * 3 + 1] / (sy || 1), z = dir[i * 3 + 2];
    const l = Math.hypot(x, y, z) || 1;
    nrm[i * 3] = x / l; nrm[i * 3 + 1] = y / l; nrm[i * 3 + 2] = z / l;
    ramp((p.getY(i) - ymin) / (ymax - ymin || 1), c);
    // without this the crown is one flat green mass at any distance closer than about 15 m
    const k = 1 + mottle * vn3(x * 2.4 - 9, y * 2.4 - 9, z * 2.4 - 9, seed + 41);
    col[i * 3] = c.r * k; col[i * 3 + 1] = c.g * k; col[i * 3 + 2] = c.b * k;
  }
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
  if (ground) g.translate(0, -ymin, 0);
  return g;
}

// ── conifers ──
// A conifer is the one tree shape cheap geometry is actually good at: the silhouette carries it,
// so the surface can be almost nothing. All three variants are built in the unit box y 0..1,
// radius ±1, so one instance matrix drives whichever is selected.

function soup() {
  const s = { pos: [], nrm: [], col: [], uv: [], c: new THREE.Color() };
  s.v = (x, y, z, nx, ny, nz, t, k, u, v) => {
    const l = Math.hypot(nx, ny, nz) || 1;
    s.pos.push(x, y, z); s.nrm.push(nx / l, ny / l, nz / l); s.uv.push(u, v);
    s.ramp(t, s.c);
    s.col.push(s.c.r * k, s.c.g * k, s.c.b * k);
  };
  s.geo = () => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(s.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(s.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(s.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(s.col, 3));
    return g;
  };
  return s;
}

// A stack of skirts, each one a cone standing on its own rim. The overhang of a tier over the one
// below is the whole trick — it casts the dark horizontal band that reads as a conifer at 40 m,
// and it costs `sides` triangles. `under` > 0 closes each rim with a downward-facing fan so the
// overhang is opaque and dark from below; `under` 0 leaves the skirts open and is half the price.
function tierGeo({ tiers, sides, seed, under, jitter, ramp }) {
  const R = rng(seed * 7919 + 977);
  const s = soup();
  s.ramp = ramp;
  const [pu0, pu1] = PANEL[0];
  for (let i = 0; i < tiers; i++) {
    const t = tiers > 1 ? i / (tiers - 1) : 0;
    const yb = lerp(0, 0.66, t);
    const hh = lerp(0.46, 1 - 0.66, t);
    const rb = lerp(1.0, 0.30, Math.pow(t, 0.85));
    const off = R() * 6.284;
    const rad = [], ry = [];
    for (let k = 0; k < sides; k++) {
      rad.push(rb * (1 + span(R, -jitter, jitter)));
      // the rim droops unevenly; without this the tier edge is a perfect straight line in profile
      ry.push(yb + span(R, -0.45, 0.2) * jitter * hh);
    }
    for (let k = 0; k < sides; k++) {
      const a0 = off + (k / sides) * 6.284, a1 = off + ((k + 1) / sides) * 6.284;
      const am = (a0 + a1) * 0.5;
      const r0 = rad[k], r1 = rad[(k + 1) % sides];
      const y0 = ry[k], y1 = ry[(k + 1) % sides];
      const p = (a, r, y, u) => s.v(Math.cos(a) * r, y, Math.sin(a) * r,
        Math.cos(a) * hh, rb, Math.sin(a) * hh, yb, 1, u, 0);
      p(a1, r1, y1, pu1);
      p(a0, r0, y0, pu0);
      s.v(0, yb + hh, 0, Math.cos(am) * hh, rb, Math.sin(am) * hh, yb + hh, 1, (pu0 + pu1) * 0.5, 1);
      if (!under) continue;
      const yu = yb + 0.05;
      s.v(0, yu, 0, 0, -1, 0, yb, under, (pu0 + pu1) * 0.5, 0.5);
      s.v(Math.cos(a0) * r0, y0, Math.sin(a0) * r0, Math.cos(a0) * 0.4, -1, Math.sin(a0) * 0.4, yb, under, pu0, 0.42);
      s.v(Math.cos(a1) * r1, y1, Math.sin(a1) * r1, Math.cos(a1) * 0.4, -1, Math.sin(a1) * 0.4, yb, under, pu1, 0.42);
    }
  }
  return s.geo();
}

// Aaron's triangular prism taken literally: three tapered three-sided prisms of different heights
// clustered on one trunk, flat-shaded, with the needle band alpha-tested across each face. Four
// triangles a spike, twelve for the whole crown — an eighth of what the broadleaf crown costs.
function prismGeo({ seed, ramp }) {
  const R = rng(seed * 2654435 + 31);
  const s = soup();
  s.ramp = ramp;
  const [pu0, pu1] = PANEL[0];
  const um = (pu0 + pu1) * 0.5;
  const spikes = [[0, 0, 1.0, 0, 1.0], [0.5, 0.62, 0.52, 0.0, 0.60], [0.42, 0.50, 0.46, 0.02, 0.46]];
  for (const [dx, dz, rb, yb, ht] of spikes) {
    const dir = R() * 6.284, off = R() * 6.284;
    const ox = Math.cos(dir) * dx, oz = Math.sin(dir) * dz;
    const base = [];
    for (let k = 0; k < 3; k++) {
      const a = off + (k / 3) * 6.284;
      const r = rb * span(R, 0.86, 1.12);
      base.push([ox + Math.cos(a) * r, yb, oz + Math.sin(a) * r]);
    }
    const apex = [ox * 0.45, yb + ht, oz * 0.45];
    for (let k = 0; k < 3; k++) {
      const a = base[k], b = base[(k + 1) % 3];
      const e1 = [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
      const e2 = [apex[0] - b[0], apex[1] - b[1], apex[2] - b[2]];
      const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      s.v(b[0], b[1], b[2], n[0], n[1], n[2], yb + 0.1, 1, pu1, 0);
      s.v(a[0], a[1], a[2], n[0], n[1], n[2], yb + 0.1, 1, pu0, 0);
      s.v(apex[0], apex[1], apex[2], n[0], n[1], n[2], yb + ht, 1, um, 1);
    }
    for (const k of [0, 2, 1]) s.v(base[k][0], base[k][1], base[k][2], 0, -1, 0, yb, 0.5, um, 0.5);
  }
  return s.geo();
}

// The needle atlas: left panel a band with a ragged hem for a prism face, right panel a spray card
// with an empty middle for breaking a skirt's outline. Every needle is a filled polygon rather than
// a stroke — a hairline is almost all antialiased edge and survives mipping only as a dark smudge.
function sprig(g, x, y, a, len, wide, v) {
  const c = Math.cos(a), s = Math.sin(a);
  g.fillStyle = `rgb(${v},${v},${v})`;
  g.beginPath();
  g.moveTo(x - s * wide, y + c * wide);
  g.lineTo(x + c * len, y + s * len);
  g.lineTo(x + s * wide, y - c * wide);
  g.closePath();
  g.fill();
}

function needleBand(g, x0, w, h, R) {
  const grd = g.createLinearGradient(0, h, 0, 0);
  grd.addColorStop(0, 'rgb(170,170,170)');
  grd.addColorStop(1, 'rgb(250,250,250)');
  g.fillStyle = grd;
  g.fillRect(x0, 0, w, h * 0.80);
  for (let i = 0; i < 15; i++) {
    const x = x0 + w * (i + span(R, 0.2, 0.8)) / 15;
    const v = (176 + R() * 56) | 0;
    sprig(g, x, h * 0.74, 1.571 + span(R, -0.5, 0.5), h * span(R, 0.05, 0.17), w * 0.05, v);
  }
  for (let i = 0; i < 20; i++) {
    const x = x0 + w * span(R, 0.03, 0.97), y = h * span(R, 0.05, 0.7);
    const v = (110 + R() * 60) | 0;
    sprig(g, x, y, span(R, 1.0, 2.1), h * span(R, 0.12, 0.3), w * 0.035, v);
  }
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 14; i++) {
    const y = h * span(R, 0.34, 0.79);
    const side = R() < 0.5 ? x0 : x0 + w;
    g.beginPath();
    g.ellipse(side, y, w * span(R, 0.04, 0.13), h * span(R, 0.02, 0.05), 0, 0, 6.284);
    g.fill();
  }
  g.globalCompositeOperation = 'source-over';
}

function needleSpray(g, x0, w, h, R) {
  const cx = x0 + w / 2, cy = h * 0.5;
  for (let i = 0; i < 26; i++) {
    const a = R() * 6.284;
    const rr = span(R, 0.3, 1.0);
    const bx = cx + Math.cos(a) * rr * w * 0.26, by = cy + Math.sin(a) * rr * h * 0.2;
    const v = (176 + R() * 72) | 0;
    for (let k = 0; k < 4; k++) {
      const b = a + span(R, -0.45, 0.45);
      sprig(g, bx, by, b, span(R, 0.16, 0.34) * w, w * 0.038, v);
    }
  }
}

function rockGeo(R) {
  const g = new THREE.IcosahedronGeometry(0.5, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    p.setXYZ(i, p.getX(i) * span(R, 0.85, 1.35), p.getY(i) * span(R, 0.6, 0.95), p.getZ(i) * span(R, 0.85, 1.35));
  }
  g.computeVertexNormals();
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(p.count * 2), 2));
  return white(g);
}

// A root flare, not a cylinder pushed through the grass: the profile widens sharply in the bottom
// fifth, and the vertex ramp darkens the last handspan so the trunk is occluded where it enters
// the earth instead of ending on a lit edge.
function trunkGeo(foot) {
  const g = new THREE.LatheGeometry(TUNING.trunk.prof.map(([r, y]) => new THREE.Vector2(r, y)), TUNING.trunk.sides);
  const p = g.attributes.position;
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const k = lerp(foot, 1, smoothstep(0, 0.26, p.getY(i)));
    col[i * 3] = k; col[i * 3 + 1] = k; col[i * 3 + 2] = k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

// The instance colour multiplies the whole card, so a flower painted like a blade of grass comes
// out as a solid purple stick. The stalk is painted dark enough that any hue times it reads as a
// stem, and only the head is near-white.
function flowerHeads(g, w, h, R) {
  for (let i = 0; i < 6; i++) {
    const x0 = w * (0.12 + 0.76 * ((i + 0.5) / 6 + (R() - 0.5) * 0.3));
    const tipY = h * span(R, 0.1, 0.46);
    const lean = span(R, -0.1, 0.1) * w;
    g.strokeStyle = 'rgb(46,46,46)';
    g.lineWidth = w * span(R, 0.014, 0.022);
    g.beginPath();
    g.moveTo(x0, h);
    g.quadraticCurveTo(x0 + lean * 0.3, (h + tipY) * 0.5, x0 + lean, tipY + h * 0.05);
    g.stroke();
    for (let k = 0; k < 4; k++) {
      const v = Math.round(span(R, 205, 255));
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.beginPath();
      g.arc(x0 + lean + span(R, -1, 1) * w * 0.028, tipY + span(R, -1, 1) * h * 0.035,
        w * span(R, 0.022, 0.04), 0, 6.284);
      g.fill();
    }
  }
  for (let i = 0; i < 5; i++) {
    const x0 = w * span(R, 0.1, 0.9);
    const len = h * span(R, 0.14, 0.3);
    g.fillStyle = 'rgb(60,60,60)';
    g.beginPath();
    g.ellipse(x0, h - len * 0.5, w * 0.02, len * 0.5, span(R, -0.5, 0.5), 0, 6.284);
    g.fill();
  }
}

const GW = 256, GH = 160;
const TEX = {
  grass: paint(GW * 2, GH, (g, w, h) => {
    bladeStrokes(g, 0, GW, h, rng(0x77aa11), 24);
    broadLeaves(g, GW, GW, h, rng(0x13ff02));
  }, 'foliage:grass'),
  flower: paint(96, 96, (g, w, h) => flowerHeads(g, w, h, rng(0x22bb44)), 'foliage:flower'),
  needle: paint(256, 128, (g, w, h) => {
    needleBand(g, 0, w / 2, h, rng(0x1af09c));
    needleSpray(g, w / 2, w / 2, h, rng(0x6b2d41));
  }, 'foliage:needle'),
};

const PANEL = [[0.004, 0.496], [0.504, 0.996]];

// Foliage builds its own materials, so materials.js `setEnvIntensity` never reached them and every
// card and crown drew the sky at 1.0 while the world around it drew it at `envPower`. Collecting
// them here is what lets `foliageEnv` and the two value knobs fix that.
const MADE = { all: [], canopy: [], grass: [] };

const foliageMat = (name, opts = {}) => {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, name, ...opts });
  MADE.all.push(m);
  if (/canopy|fringe|cone|prism|spire|sprig|bush/.test(name)) MADE.canopy.push(m);
  if (name === 'grass') MADE.grass.push(m);
  return m;
};

class Kind {
  constructor(geo, mat, cap, { cast = true, receive = true } = {}) {
    this.geo = geo; this.mat = mat; this.cap = cap; this.cast = cast; this.receive = receive;
    this.items = [];
    this.pri = [];
  }
  add(m, c, g) { const it = { m, c, g: g ?? ++GID }; this.items.push(it); return it; }
  // dressing that sits against a wall survives both the cap and the density knob
  addPri(m, c) { this.pri.push({ m, c }); }
}

// Vertical palettes. The canopy runs dark leaf at the trunk join through mid to the light shade,
// with the zone's rim colour mixed into the crown so the sun side reads warm; the last fifth above
// the trunk is crushed further, which is the difference between a tree and a lollipop.
function leafRamp(f, cfg) {
  const dark = new THREE.Color(f.leaves[2]);
  const mid = new THREE.Color(f.leaves[0]);
  const light = new THREE.Color(f.leaves[1]);
  const rim = new THREE.Color(f.rim);
  return (t, out) => {
    if (t < 0.45) out.copy(dark).lerp(mid, smoothstep(0.0, 0.45, t));
    else out.copy(mid).lerp(light, smoothstep(0.45, 0.96, t) * cfg.top);
    out.lerp(rim, cfg.rim * smoothstep(0.68, 1.0, t));
    out.multiplyScalar(lerp(cfg.join, 1, smoothstep(0, 0.22, t)));
  };
}

// Needles run darker and less yellow than leaves and the base is crushed harder — the bottom of a
// conifer is in its own shade, which is most of what separates it from a lollipop.
function needleRamp(f, cfg) {
  const n = f.needles || f.leaves;
  const dark = new THREE.Color(n[2]);
  const mid = new THREE.Color(n[0]);
  const light = new THREE.Color(n[1]);
  const rim = new THREE.Color(f.rim);
  return (t, out) => {
    if (t < 0.5) out.copy(dark).lerp(mid, smoothstep(0.0, 0.5, t));
    else out.copy(mid).lerp(light, smoothstep(0.5, 1.0, t) * cfg.top);
    out.lerp(rim, cfg.rim * smoothstep(0.7, 1.0, t));
    out.multiplyScalar(lerp(cfg.join, 1, smoothstep(0, 0.34, t)));
  };
}

function bushRamp(f, cfg) {
  const dark = new THREE.Color(f.bush[2]);
  const mid = new THREE.Color(f.bush[0]);
  const light = new THREE.Color(f.bush[1]);
  return (t, out) => {
    if (t < 0.5) out.copy(dark).lerp(mid, smoothstep(0.0, 0.5, t));
    else out.copy(mid).lerp(light, smoothstep(0.5, 1.0, t) * cfg.top);
    out.multiplyScalar(lerp(cfg.join, 1, smoothstep(0, 0.3, t)));
  };
}

export class Scatter {
  constructor(terrain) {
    this.terrain = terrain;
    this.object3D = new THREE.Group();
    this.object3D.name = 'scatter';
    this.meshes = [];
    this.trees = [];
    this.treeSets = [];
    this.density = 1;
    this.treeStyle = TUNING.tree.style;
  }

  build(quality) {
    const T = this.terrain;
    const R = rng(0x51f3a2);
    MADE.all.length = MADE.canopy.length = MADE.grass.length = 0;
    const kinds = ZONE_IDS.map((id, i) => {
      const z = zone(id);
      const f = z.foliage;
      // the blade root takes the ground's hue so a card starts in the earth rather than on it
      const foot = footRatio(z.groundTint, f.grass[0], TUNING.grass.footBlend, TUNING.grass.footShade);
      const gramp = (t) => A.copy(foot).lerp(B.setRGB(TUNING.grass.tip, TUNING.grass.tip, TUNING.grass.tip), smoothstep(0.0, 0.42, t));
      const crownRamp = leafRamp(f, TUNING.crown);
      const nRamp = needleRamp(f, TUNING.cone);
      const sRamp = needleRamp(f, TUNING.spire);
      const sprigRamp = (t) => { sRamp(clamp(0.48 + t * 0.5, 0, 1), A); return A; };
      const needleMat = (n) => foliageMat(n, { map: TEX.needle, alphaTest: TUNING.needle.alphaTest });
      const barkMat = foliageMat('bark', { map: BARK_TEX, roughness: 0.88 });
      const crownMat = noFlip(foliageMat('canopy', { map: LEAF_TEX, alphaTest: CROWN.alphaTest, roughness: 0.94 }));
      const set = {
        grass: new Kind(cardGeo([
          { w: 1.5, h: 1.0, ry: 0, lean: 0.07, u0: PANEL[0][0], u1: PANEL[0][1] },
          { w: 1.28, h: 0.84, ry: 1.16, ox: 0.14, oz: -0.08, lean: -0.06, u0: PANEL[1][0], u1: PANEL[1][1] },
        ], gramp), foliageMat('grass', { map: TEX.grass, alphaTest: 0.28, roughness: 0.96 }), CAP.grass, { cast: false }),
        flower: new Kind(cardGeo([{ w: 0.52, h: 1.0, ry: 0, lean: 0.04 }]),
          foliageMat('flower', { map: TEX.flower, alphaTest: 0.26 }), CAP.flower, { cast: false }),
        bush: new Kind(blobGeo(0, { ...TUNING.bush, seed: 3 + i, ramp: bushRamp(f, TUNING.bush) }),
          foliageMat('bush'), CAP.bush),
        rock: new Kind(rockGeo(R), foliageMat('rock', { roughness: 0.85 }), CAP.rock),
        trunk: new Kind(trunkGeo(TUNING.trunk.foot), foliageMat('trunk', { roughness: 0.9 }), CAP.tree),
        cone: new Kind(tierGeo({ ...TUNING.cone, seed: 21 + i, ramp: nRamp }), foliageMat('cone'), CAP.tree),
        prism: new Kind(prismGeo({ seed: 31 + i, ramp: needleRamp(f, TUNING.prism) }),
          needleMat('prism'), CAP.tree),
        spire: new Kind(tierGeo({ ...TUNING.spire, seed: 41 + i, ramp: sRamp }), foliageMat('spire'), CAP.tree),
        sprig: new Kind(cardGeo([
          { w: 2.36, h: 0.30, ry: 0.2, oy: -0.06, up: 3.8, u0: PANEL[1][0], u1: PANEL[1][1] },
          { w: 1.58, h: 0.25, ry: 1.3, oy: 0.27, up: 3.8, u0: PANEL[1][0], u1: PANEL[1][1] },
          { w: 0.96, h: 0.19, ry: 2.4, oy: 0.60, up: 3.8, u0: PANEL[1][0], u1: PANEL[1][1] },
        // receive:false as well as cast:false — a sprig sits inside the skirt that would shadow it,
        // and a shadowed alpha card against a lit crown reads as a black spike, not as needles
        ], sprigRamp), needleMat('sprig'), CAP.tree, { cast: false, receive: false }),
        pend: [], z, f,
      };
      SPECIES.forEach((sp, k) => {
        set['bark' + k] = new Kind(barkGeo(sp, 5 + k * 7 + i * 3), barkMat, CAP.tree);
        set['leaf' + k] = new Kind(crownGeo(sp, 9 + k * 11 + i * 5, crownRamp), crownMat, CAP.tree);
      });
      return set;
    });

    const m4 = new THREE.Matrix4();
    const col = new THREE.Color();
    // The placement loops now cover 1440 × 720 m instead of 300 × 224. The instance caps did not
    // grow with the world, so spreading them evenly would buy one clump per 300 m² and the near
    // field would be bare. Cells beyond `reach` of a live camera are skipped before they draw any
    // RNG, which keeps today's density exactly and leaves the empty countryside empty until A7
    // makes this player-centred (WORLD.md §6.4) — the same gate, aimed at the player instead.
    const reach = this.reach ?? 150;
    const off = (x, z, pad = 0) => camDist(x, z) > reach + pad;
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
      const zz = kinds[zi].z, f = kinds[zi].f;
      const gid = ++GID;
      for (let k = 0; k < n; k++) {
        const qx = px + span(R, -spread, spread), qz = pz + span(R, -spread, spread);
        const roll = R();
        const add = (kind, m, c) => (pri ? kinds[zi][kind].addPri(m, c) : kinds[zi][kind].add(m, c, gid));
        if (roll < 0.14 + litter * 0.4) {
          col.set(zz.stone.base).lerp(new THREE.Color(zz.stone.dark), span(R, 0.3, 1)).multiplyScalar(span(R, 0.5, 0.85));
          const sc = span(R, 0.3, 0.85) * size;
          // sunk, not perched — a pebble sitting on top of the grass is its own sticker problem
          const m = place(qx, qz, sc, sc * span(R, 0.5, 0.9), sc, span(R, 0, 6.28)).clone();
          m.elements[13] -= sc * span(R, 0.18, 0.4);
          add('rock', m, col.clone());
        } else if (roll < 0.34) {
          const sc = span(R, 0.35, 0.78) * size;
          const m = place(qx, qz, sc, sc * span(R, 0.5, 0.9), sc, span(R, 0, 6.28)).clone();
          m.elements[13] -= sc * 0.24;
          add('bush', m, tint(col, R, 0.55, 0.95).clone());
        } else {
          col.set(f.grass[R() < 0.5 ? 2 : 0]).multiplyScalar(span(R, 0.62, 1.05));
          if (litter) col.lerp(new THREE.Color(f.dirt[0]), litter * span(R, 0.3, 0.8));
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
    for (let x = WB.x0; x < WB.x1; x += 2.1) {
      if (off(x, creekZ(x), 24)) continue;
      const cz = creekZ(x), wy = waterY(x), half = creekHalf(x);
      for (const side of [-1, 1]) {
        const px = x + span(R, -1.0, 1.0);
        const pz = cz + side * (half + span(R, -0.9, 2.4));
        if (T.blocked(px, pz)) continue;
        const zi = zoneAt(px, pz);
        const zz = kinds[zi].z, f = kinds[zi].f;
        if (heightAt(px, pz) < wy - 0.45) continue;
        if (R() < 0.5) {
          for (let k = 0; k < 3; k++) {
            col.set(zz.stone.base).lerp(new THREE.Color(zz.stone.dark), span(R, 0.4, 1)).multiplyScalar(span(R, 0.4, 0.72));
            const sc = span(R, 0.2, 0.6);
            const m = place(px + span(R, -0.6, 0.6), pz + span(R, -0.5, 0.5), sc, sc * span(R, 0.4, 0.8), sc, span(R, 0, 6.28)).clone();
            m.elements[13] -= sc * 0.3;
            kinds[zi].rock.addPri(m, col.clone());
          }
        } else {
          for (let k = 0; k < 3; k++) {
            col.set(f.grass[0]).lerp(new THREE.Color(f.sand[2]), span(R, 0, 0.35)).multiplyScalar(span(R, 0.45, 0.8));
            const sc = span(R, 0.7, 1.4);
            kinds[zi].grass.addPri(place(px + span(R, -0.7, 0.7), pz + span(R, -0.6, 0.6),
              sc * 0.75, sc * span(R, 1.0, 1.6), sc * 0.75, span(R, 0, 6.28)).clone(), col.clone());
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

    // Grass — sampled on a coarser grid than the instance budget would allow, then two to four
    // cards dropped inside a metre of each accepted point. The same number of cards spread evenly
    // reads as a sprinkling of sticks; in tufts with bare ground between them it reads as a lawn.
    const [cLo, cHi] = TUNING.grass.cluster;
    for (let z = WB.z0; z < WB.z1; z += 2.7) {
      for (let x = WB.x0; x < WB.x1; x += 2.7) {
        if (off(x, z, 4)) continue;
        const px = x + span(R, -1.4, 1.4), pz = z + span(R, -1.4, 1.4);
        if (!free(px, pz, 0.02)) continue;
        const sl = T.slopeAt(px, pz);
        if (sl > 0.95) continue;
        const ao = T.ao(px, pz);
        const dn = fbm(px * 0.028, pz * 0.028, 2, 3) * 0.5 + 0.5;
        const bank = smoothstep(0.95, 0.1, heightAt(px, pz) - waterY(px));
        // The instance budget is finite and the map is 300 × 224 m; spreading it evenly buys a
        // blade every 20 m². Weighting towards the shot positions is what makes the near field
        // read as a lawn instead of a sprinkling of sticks.
        const near = 0.07 + 0.93 * smoothstep(126, 26, camDist(px, pz));
        const zi = zoneAt(px, pz);
        const f = kinds[zi].f;
        const p = (0.28 + 0.6 * dn + 1.4 * ao + 0.8 * bank - 0.5 * sl) * near * (f.density ?? 1);
        if (R() > p) continue;
        const shade = f.grass[Math.floor(clamp(fbm(px * 0.09, pz * 0.09, 2, 21) * 1.6 + 1.5, 0, 2.99))];
        const meadow = smoothstep(0.15, 0.75, dn) * (1 - clamp(ao * 1.6, 0, 1));
        const gid = ++GID;
        const cr = TUNING.grass.clusterR;
        // a tuft near a camera is worth more cards than one on the far ridge, and the global cap
        // then thins everything in proportion — this is how the near field ends up dense
        const n = Math.round(lerp(cLo, cHi, near * span(R, 0.5, 1.15)));
        for (let k = 0; k < n; k++) {
          const qx = px + span(R, -cr, cr), qz = pz + span(R, -cr, cr);
          if (!free(qx, qz, 0.02)) continue;
          col.set(shade);
          if (bank > 0.35) col.lerp(new THREE.Color(f.sand[2]), bank * 0.22);
          // tone varies inside one tuft, not just between tufts
          col.multiplyScalar(TUNING.grass.value * (1 - 0.35 * ao) * span(R, 0.78, 1.24));
          const s = span(R, 0.42, 0.78) * (1 + meadow * 0.85 + bank * 0.9) * (1 + ao * 0.3) * (k ? span(R, 0.6, 1.0) : 1);
          kinds[zi].grass.add(place(qx, qz, s, s * span(R, 0.9, 1.5), s, span(R, 0, 6.28)).clone(), col.clone(), gid);
        }
      }
    }

    // flowers — clustered, the one saturated accent in the palette
    for (let z = WB.z0; z < WB.z1; z += 3.2) {
      for (let x = WB.x0; x < WB.x1; x += 3.2) {
        if (off(x, z, 4)) continue;
        const px = x + span(R, -1.4, 1.4), pz = z + span(R, -1.4, 1.4);
        if (!free(px, pz, 0.15)) continue;
        const cl = fbm(px * 0.055, pz * 0.055, 2, 33);
        const ao = T.ao(px, pz);
        if (cl < 0.2 && ao < 0.2) continue;
        if (R() > 0.16 + 0.55 * cl + 0.5 * ao) continue;
        const zi = zoneAt(px, pz);
        col.set(TUNING.flowerHues[Math.floor(R() * (R() < 0.72 ? 2 : 4))]);
        col.multiplyScalar(span(R, 0.8, 1.15) * (zi === 2 ? 0.62 : 1));
        const gid = ++GID;
        for (let k = 0, n = 1 + Math.floor(R() * 3); k < n; k++) {
          const s = span(R, 0.34, 0.6);
          kinds[zi].flower.add(place(px + span(R, -0.55, 0.55), pz + span(R, -0.55, 0.55),
            s, s * span(R, 0.7, 1.1), s, span(R, 0, 6.28)).clone(), col.clone(), gid);
        }
      }
    }

    // shrubs — thickets rather than single balls, so they read as one mass with a ragged edge
    for (let z = WB.z0; z < WB.z1; z += 6.4) {
      for (let x = WB.x0; x < WB.x1; x += 6.4) {
        if (off(x, z, 8)) continue;
        const px = x + span(R, -2.6, 2.6), pz = z + span(R, -2.6, 2.6);
        if (!free(px, pz, 0.25)) continue;
        const ao = T.ao(px, pz);
        const dn = fbm(px * 0.021, pz * 0.021, 2, 51) * 0.5 + 0.5;
        if (R() > 0.14 + 0.4 * dn + 1.1 * ao) continue;
        const zi = zoneAt(px, pz);
        const f = kinds[zi].f;
        const big = span(R, 0.55, 1.1);
        const gid = ++GID;
        for (let k = 0, n = 2 + Math.floor(R() * 3); k < n; k++) {
          const qx = px + span(R, -1.0, 1.0), qz = pz + span(R, -1.0, 1.0);
          const s = big * span(R, 0.55, 1.05);
          const m = place(qx, qz, s, s * span(R, 0.75, 1.2), s, span(R, 0, 6.28)).clone();
          m.elements[13] -= s * 0.14;
          kinds[zi].bush.add(m, tint(col, R, 0.7, 1.12).clone(), gid);
        }
        for (let k = 0; k < 3; k++) {
          col.set(f.grass[R() < 0.5 ? 0 : 2]).multiplyScalar(span(R, 0.6, 1.0));
          const s = span(R, 0.5, 0.9);
          kinds[zi].grass.add(place(px + span(R, -1.3, 1.3), pz + span(R, -1.3, 1.3), s, s * span(R, 0.9, 1.5), s, span(R, 0, 6.28)).clone(), col.clone(), gid);
        }
        T.mark(px, pz, big * 0.5);
        T.addPropDecal(px, pz, 1.1 + big * 1.1, 0.34);
      }
    }

    // loose stone — screes on slopes, spill at wall feet, shingle at the water
    for (let z = WB.z0; z < WB.z1; z += 4.6) {
      for (let x = WB.x0; x < WB.x1; x += 4.6) {
        if (off(x, z, 6)) continue;
        const px = x + span(R, -2, 2), pz = z + span(R, -2, 2);
        if (!free(px, pz, -0.35)) continue;
        const sl = T.slopeAt(px, pz);
        const ao = T.ao(px, pz);
        const shore = smoothstep(0.9, -0.3, heightAt(px, pz) - waterY(px));
        if (R() > 0.05 + 0.75 * smoothstep(0.3, 0.9, sl) + 1.0 * ao + 0.6 * shore) continue;
        const zi = zoneAt(px, pz);
        const f = kinds[zi].f;
        const gid = ++GID;
        col.set(kinds[zi].z.stone.base).lerp(new THREE.Color(kinds[zi].z.stone.dark), span(R, 0.35, 1));
        col.multiplyScalar(span(R, 0.5, 0.85) * (shore > 0.4 ? 0.75 : 1));
        const s = span(R, 0.24, 0.68) * (1 + ao * 0.5);
        const m = place(px, pz, s, s * span(R, 0.6, 1.1), s, span(R, 0, 6.28)).clone();
        m.elements[13] -= s * span(R, 0.2, 0.45);
        kinds[zi].rock.add(m, col.clone(), gid);
        if (R() < 0.55) {
          col.set(f.grass[R() < 0.5 ? 0 : 2]).multiplyScalar(span(R, 0.55, 1.0));
          const gs = span(R, 0.45, 0.8);
          kinds[zi].grass.add(place(px + span(R, -0.7, 0.7), pz + span(R, -0.7, 0.7), gs, gs * span(R, 0.9, 1.4), gs, span(R, 0, 6.28)).clone(), col.clone(), gid);
        }
      }
    }

    // trees — a wooded rim behind the walls and across the water, sparse inside the towns
    const inTown = (x, z) => {
      let m = 0;
      for (const t of TOWNS) {
        m = Math.max(m, smoothstep(46, 20, Math.abs(x - t.cx)) * smoothstep(46, 20, Math.abs(z - t.cz)));
      }
      return m;
    };
    // one tree per grid cell reads as an orchard; a copse of two or three with different heights
    // crowding each other reads as woodland, and it breaks a hard ridge line as well
    const tree = (px, pz, ridge, boost) => {
      if (!free(px, pz, 0.45) || nearCamera(px, pz, 7)) return;
      if (inCorridor(px, pz, 34, 7) || T.slopeAt(px, pz) > 0.85) return;
      const zi = zoneAt(px, pz);
      const K = kinds[zi];
      const f = K.f;
      const th = span(R, 2.4, 5.6) * boost * (1 + ridge * span(R, 0.1, 0.7));
      const tr = span(R, 0.8, 1.1) * (0.8 + th * 0.05);
      const ry = span(R, 0, 6.28);
      // whether this tree is a conifer when the world is mixed; the single-style views ignore it
      const con = R() < (f.conifer ?? 0);
      const sp = Math.floor(R() * SPECIES.length);
      col.set(f.trunk).multiplyScalar(span(R, 0.72, 1.02));
      const bark = col.clone();

      // a conifer carries its crown on a taller, much thinner bole, so it needs its own matrices
      const hc = th * span(R, 1.15, 1.45);
      const cw = hc * span(R, 0.19, 0.27);
      K.trunk.add(place(px, pz, tr * 0.58, hc * 0.72, tr * 0.58, ry).clone(), bark);
      const nt = tint(col, R, 0.86, 1.1, 0.04).clone();
      const cm = place(px, pz, cw, hc * 0.88, cw, ry + span(R, 0, 2.1)).clone();
      cm.elements[13] += hc * 0.15;
      for (const k of ['cone', 'prism', 'spire', 'sprig']) K[k].add(cm, nt);

      // Broadleaf bark and crown share one matrix — geometry y 0..1 is the whole tree, so the
      // limbs land inside the crown by construction instead of by two matrices agreeing.
      const S = SPECIES[sp];
      const sy = th * span(R, 1.1, 1.4);
      const sx = sy * span(R, 0.85, 1.3);
      const bm = place(px, pz, sx, sy, sx, ry).clone();
      const lt = tint(col, R, 0.88, 1.08, 0.05).clone();
      for (let k = 0; k < SPECIES.length; k++) {
        K['bark' + k].add(bm, bark);
        K['leaf' + k].add(bm, lt);
      }
      const cs = sx * (S.rx * 1.05 + S.size * 0.9);
      // Ground dressing is deferred: roughly three times as many trees are generated as the cap
      // keeps, and paying for a decal and a litter clump per *candidate* spent about 6 k triangles
      // and a third of the grass budget on trees that never got drawn.
      K.pend.push({ x: px, z: pz, cs, tr: con ? tr : sx * S.trunk * 2.4, th: con ? hc : sy, cw, con, sp });
      T.mark(px, pz, 0.85);
    };

    for (let z = WB.z0; z < WB.z1; z += 11) {
      for (let x = WB.x0; x < WB.x1; x += 11) {
        if (off(x, z, 14)) continue;
        const px = x + span(R, -4.4, 4.4), pz = z + span(R, -4.4, 4.4);
        const wood = fbm(px * 0.016, pz * 0.016, 2, 67) * 0.5 + 0.5;
        // a wooded rim behind and beside each town, measured from the town rather than from a
        // fixed z, so it follows the towns instead of the old three-district map
        let near = 1e9;
        for (const t of TOWNS) near = Math.min(near, Math.hypot(px - t.cx, pz - t.cz));
        const rim = smoothstep(52, 88, near);
        const ridge = smoothstep(-70, -150, pz);
        const town = inTown(px, pz);
        const wooded = kinds[zoneAt(px, pz)].f.trees ?? 1;
        const p = (0.24 + 1.0 * wood + 1.1 * Math.min(rim, 1) + 0.5 * ridge) * (1 - town * 0.87) * wooded;
        if (R() > p) continue;
        const n = 1 + Math.floor(R() * (2 + Math.round(wood * 2)));
        for (let k = 0; k < n; k++) {
          tree(px + span(R, -3.2, 3.2), pz + span(R, -3.2, 3.2), ridge, k === 0 ? 1 : span(R, 0.6, 0.95));
        }
      }
    }

    const CROWNS = ['cone', 'prism', 'spire', 'sprig',
      ...SPECIES.map((_, k) => 'bark' + k), ...SPECIES.map((_, k) => 'leaf' + k)];
    for (const set of kinds) {
      // every crown variant plus the trunk is the same tree, so they must be thinned in step
      shuffle(set.trunk.items, R, ...CROWNS.map(n => set[n].items), set.pend);
      const keep = Math.min(set.trunk.items.length, CAP.tree);
      set.trunk.items.length = keep;
      for (const n of CROWNS) set[n].items.length = keep;
      for (let i = 0; i < keep; i++) {
        const t = set.pend[i];
        this.trees.push(t);
        for (const n of CROWNS) { set[n].items[i].con = t.con; set[n].items[i].sp = t.sp; }
        // two discs: the crown's own shade, then a tight one at the flare. Without the tight one
        // the trunk meets a lit patch of grass and the whole tree reads as a sticker.
        // The decals are baked into the terrain once, so a mixed world sizes them from the style
        // the tree was born with — flipping `treeStyle` live does not move them.
        T.addPropDecal(t.x, t.z, 0.9 + (t.con ? t.cw * 1.35 : t.cs) * 0.7, TUNING.tree.canopyDecal);
        T.addPropDecal(t.x, t.z, 0.42 + t.tr * 0.42, TUNING.tree.footDecal);
        clump(t.x + span(R, -0.5, 0.5), t.z + span(R, -0.5, 0.5),
          { n: 4, spread: 0.85, size: span(R, 0.7, 1.1), litter: 0.7 });
      }
    }

    for (const [zi, set] of kinds.entries()) {
      for (const name of ['grass', 'flower', 'bush', 'rock', 'trunk', ...CROWNS]) {
        const k = set[name];
        // thin by tuft, not by blade — shuffling individual cards turns every clump back into a
        // sprinkle the moment the density knob comes off 1
        if (name === 'grass' || name === 'flower' || name === 'bush' || name === 'rock') k.items = groupShuffle(k.items, R);
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
        if (name === 'trunk' || CROWNS.includes(name)) this.treeSets.push({ mesh, items: k.items, name });
      }
    }

    this.applyTreeStyle(this.treeStyle);
    this.applyDensity(quality?.get('foliage') ?? 1);
    if (new URLSearchParams(location.search).has('dev')) this.devScenarios();
  }

  // Working framings only, registered with ?dev=1 so --all keeps rendering the five the critic scores.
  devScenarios() {
    // the tallest tree that is still near a scored camera, so the macro shot shows what ships
    const t = this.trees.reduce((b, c) =>
      (!b || c.th - camDist(c.x, c.z) * 0.12 > b.th - camDist(b.x, b.z) * 0.12 ? c : b), null);
    if (!t) return;
    defineScenario({
      id: 'tree_macro', label: 'Tree macro', zone: 'neutral',
      setup: app => {
        frameCamera(app, {
          pos: [t.x + 11, heightAt(t.x + 11, t.z + 13) + 4.5, t.z + 13],
          look: [t.x, heightAt(t.x, t.z) + t.th * 0.72, t.z], fov: 44,
        });
        app.quality.set('time', 10.5);
      },
    });
    defineScenario({
      id: 'tree_stand', label: 'Tree stand', zone: 'neutral',
      setup: app => {
        frameCamera(app, {
          pos: [t.x + 26, heightAt(t.x + 26, t.z + 30) + 11, t.z + 30],
          look: [t.x, heightAt(t.x, t.z) + t.th * 0.5, t.z], fov: 42,
        });
        app.quality.set('time', 10.5);
      },
    });
    defineScenario({
      id: 'grass_macro', label: 'Grass macro', zone: 'neutral',
      setup: app => {
        frameCamera(app, {
          pos: [-40, heightAt(-40, 76) + 1.15, 76],
          look: [-14, heightAt(-14, 64) + 0.4, 64], fov: 40,
        });
        app.quality.set('time', 10.5);
      },
    });
  }

  applyDensity(f) {
    this.density = f;
    for (const m of this.meshes) m.count = Math.max(0, Math.min(m.userData.max, Math.round(m.userData.max * f)));
  }

  // Every tree carries an instance in every crown variant, so switching silhouette is a repack of
  // 66 matrices per zone rather than a rebuild. Anything not wanted by the current style ends up
  // with count 0 and is never drawn, so only one crown's triangles are ever paid for.
  applyTreeStyle(style) {
    this.treeStyle = style;
    const mix = style === 'mixed';
    const pick = mix ? TUNING.tree.conifer : style;
    for (const { mesh, items, name } of this.treeSets) {
      let n = 0;
      for (const it of items) {
        if (style === 'none') break;
        const con = mix ? it.con : style !== 'broadleaf';
        const want = name === 'trunk' ? con
          : BROAD.test(name) ? !con && +name[4] === it.sp
            : con && (name === pick || (name === 'sprig' && pick === 'spire'));
        if (!want) continue;
        mesh.setMatrixAt(n, it.m);
        mesh.setColorAt(n, it.c);
        n++;
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.userData.max = n;
      // InstancedMesh.computeBoundingSphere only walks up to `count`, so this has to happen while
      // count still covers the instances just written or the mesh gets an empty sphere and is culled
      mesh.count = n;
      mesh.computeBoundingSphere();
    }
    this.applyDensity(this.density);
  }

  registerKnobs(q) {
    q.register({ key: 'foliage', label: 'Foliage density', type: 'range', min: 0, max: 1.5, step: 0.05, group: 'World' },
      v => this.applyDensity(v));
    q.register({ key: 'treeStyle', label: 'Tree silhouette', type: 'select', group: 'World',
      options: ['broadleaf', 'cone', 'prism', 'spire', 'mixed', 'none'], default: 'mixed' },
      v => this.applyTreeStyle(v));
    // a multiplier on `envPower`, not an absolute: leaves are translucent so a little above the
    // world's figure is right, but 3.6× above it was what put the treeline inside 0.06 of the sky
    q.register({ key: 'foliageEnv', label: 'Foliage sky bounce', type: 'range', min: 0, max: 3, step: 0.05, group: 'World', default: TUNING.level.env },
      v => { this.envMul = v; this.applyEnv(); });
    q.register({ key: 'canopyLevel', label: 'Canopy + shrub value', type: 'range', min: 0.3, max: 1.3, step: 0.02, group: 'World', default: TUNING.level.canopy },
      v => { for (const m of MADE.canopy) m.color.setScalar(v); });
    q.register({ key: 'grassLevel', label: 'Grass value', type: 'range', min: 0.3, max: 1.3, step: 0.02, group: 'World', default: TUNING.level.grass },
      v => { for (const m of MADE.grass) m.color.setScalar(v); });
    onEnvIntensity(() => this.applyEnv());
  }

  applyEnv() {
    const v = getEnvIntensity() * (this.envMul ?? 1);
    for (const m of MADE.all) m.envMapIntensity = v;
  }
}

function shuffle(a, R, ...rest) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(R() * (i + 1));
    const t = a[i]; a[i] = a[j]; a[j] = t;
    for (const b of rest) { const u = b[i]; b[i] = b[j]; b[j] = u; }
  }
}

function groupShuffle(items, R) {
  const by = new Map();
  for (const it of items) {
    const a = by.get(it.g);
    if (a) a.push(it); else by.set(it.g, [it]);
  }
  const keys = Array.from(by.keys());
  shuffle(keys, R);
  const out = [];
  for (const k of keys) for (const it of by.get(k)) out.push(it);
  return out;
}
