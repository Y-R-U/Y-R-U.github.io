// The Kestrel Belt. Instanced rock at five size classes, ore veins that tell the player which
// rock is worth sending a rig to, and dust cards for the "three asteroids sharp, forty
// suggested" read. Draw calls, not triangles, are the thing being managed here: a field of
// three hundred rocks is nine meshes.

import * as THREE from 'three';
import { getMaterial, adopt } from '../materials.js';
import { softPoints, fxDensity, cardBucket } from '../fx.js';

const SIZES = { gravel: 1.4, small: 4.2, mid: 11, large: 26, huge: 60 };
const CLASSES = ['gravel', 'small', 'mid', 'large', 'huge'];
// geometry tier per class: icosahedron subdivision and how far the plate uv is stretched
const TIER = { gravel: 0, small: 0, mid: 1, large: 2, huge: 2 };
const TIER_DETAIL = [1, 2, 3];
// how many times the shared rock/vein maps repeat over the shape. Low on the big shapes on
// purpose: at 7× the ore veins magnify into a speckle field that reads as lava confetti.
const TIER_UV = [1.6, 2.4, 3.0];
const TIER_SHAPES = [2, 2, 3];

// A belt is a cone, not a box: the spread has to grow with distance or the near rocks all sit
// outside the frustum and the far ones bunch into a small angular patch in the middle of frame.
// `fan` is half the field's angular width; `z` is the depth band per size class, and the big
// rocks stand off further so a hero rock is a choice a scenario makes, not an accident.
const BELTS = {
  kestrel: {
    id: 'kestrel', name: 'Kestrel Belt', fan: 0.62, flat: 0.60,
    bands: {
      gravel: { n: 420, z: [60, 1500] },
      small: { n: 200, z: [90, 2600] },
      mid: { n: 78, z: [160, 4200] },
      large: { n: 24, z: [240, 5200] },
      huge: { n: 7, z: [340, 6000] },
    },
    ore: { gravel: 0, small: 0.05, mid: 0.18, large: 0.32, huge: 0.45 },
    dust: 11, dustSize: 900, dustColor: '#c99a6a',
  },
  drift: {
    id: 'drift', name: 'Ossian Drift', fan: 0.5, flat: 0.55,
    bands: {
      gravel: { n: 200, z: [80, 1200] },
      small: { n: 96, z: [120, 2000] },
      mid: { n: 34, z: [200, 3200] },
      large: { n: 10, z: [300, 4000] },
      huge: { n: 3, z: [420, 4600] },
    },
    ore: { gravel: 0, small: 0.04, mid: 0.12, large: 0.24, huge: 0.4 },
    dust: 8, dustSize: 800, dustColor: '#8fb0c4',
  },
};

export const allBelts = () => Object.keys(BELTS);

const BELT = { density: 1, ore: 3.0, dust: 1, dustSize: 1 };
const geoCache = new Map();
let rockMat = null, oreMat = null;

const rnd = s => () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;

const hash3 = (x, y, z) => {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  let fx = x - xi, fy = y - yi, fz = z - zi;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
  const l = (a, b, t) => a + (b - a) * t;
  const c = (i, j, k) => hash3(xi + i, yi + j, zi + k);
  return l(l(l(c(0, 0, 0), c(1, 0, 0), fx), l(c(0, 1, 0), c(1, 1, 0), fx), fy),
    l(l(c(0, 0, 1), c(1, 0, 1), fx), l(c(0, 1, 1), c(1, 1, 1), fx), fy), fz);
}

function fbm3(x, y, z, oct) {
  let s = 0, a = 0.5;
  for (let i = 0; i < oct; i++) { s += a * noise3(x, y, z); x *= 2.03; y *= 2.03; z *= 2.03; a *= 0.5; }
  return s;
}

// An icosahedron is non-indexed, so displacing by a function of the *undisplaced* position keeps
// the shell watertight and computeVertexNormals then gives flat facets — which is what a rock is.
function rockGeom(tier, index) {
  const key = `${tier}:${index}`;
  const hit = geoCache.get(key);
  if (hit) return hit;

  const g = new THREE.IcosahedronGeometry(1, TIER_DETAIL[tier]);
  const R = rnd(0x7f31 + tier * 977 + index * 24007);
  const off = [R() * 60, R() * 60, R() * 60];

  // planar cuts are what separate an asteroid from a lumpy potato: flat facets meeting at edges
  const cuts = [];
  for (let i = 0, n = 3 + Math.floor(R() * 3); i < n; i++) {
    const u = R() * 2 - 1, a = R() * Math.PI * 2, s = Math.sqrt(1 - u * u);
    cuts.push([s * Math.cos(a), u, s * Math.sin(a), 0.52 + 0.34 * R()]);
  }

  const p = g.attributes.position;
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const lump = fbm3(x * 1.35 + off[0], y * 1.35 + off[1], z * 1.35 + off[2], 4);
    const grain = fbm3(x * 5.4 + off[0], y * 5.4 + off[1], z * 5.4 + off[2], 3);
    let r = 0.72 + 0.62 * lump + 0.13 * grain;
    let cav = 0;
    for (const [nx, ny, nz, d] of cuts) {
      const t = x * nx + y * ny + z * nz - d;
      if (t > 0) { r -= t * 0.85; cav = Math.max(cav, Math.min(1, t * 2.6)); }
    }
    p.setXYZ(i, x * r, y * r, z * r);
    // vertex cavity, used twice: it darkens the rock and it is inverted to place the ore glow
    const ao = Math.max(0.16, Math.min(1, 0.42 + 0.85 * (r - 0.88) / 0.34 - 0.55 * cav));
    col[i * 3] = ao; col[i * 3 + 1] = ao; col[i * 3 + 2] = ao;
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));

  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * TIER_UV[tier], uv.getY(i) * TIER_UV[tier]);

  g.deleteAttribute('normal');
  g.computeVertexNormals();
  g.computeBoundingSphere();
  geoCache.set(key, g);
  return g;
}

const ORE_PATCH = `#include <emissivemap_fragment>
  float oreV = smoothstep(0.16, 0.52, texture2D(emissiveMap, vEmissiveMapUv).r);
  totalEmissiveRadiance *= oreV * 2.0 * pow(1.0 - vColor.r, 1.3);`;

function materials() {
  if (rockMat) return;
  rockMat = getMaterial('reach', 'rock').clone();
  rockMat.vertexColors = true;
  rockMat.userData = { palette: 'reach', surface: 'rock', envMul: 0.5 };
  adopt(rockMat);

  oreMat = getMaterial('reach', 'ore').clone();
  oreMat.vertexColors = true;
  oreMat.emissive.set('#ff5010');
  oreMat.emissiveIntensity = BELT.ore;
  oreMat.userData = { palette: 'reach', surface: 'ore', envMul: 0.5 };
  // the vein map says *where* the ore is across the uv, the vertex cavity says how deep the
  // pocket is, and the ore only glows where both agree. Without the cavity term the whole rock
  // lights up and reads as a painted orange ball rather than as molten cracks.
  oreMat.onBeforeCompile = s => {
    s.fragmentShader = s.fragmentShader.replace('#include <emissivemap_fragment>', ORE_PATCH);
  };
  // an onBeforeCompile edit is invisible to the program cache, so without this the ore can be
  // handed the rock's already-compiled program and the patch silently does nothing
  oreMat.customProgramCacheKey = () => 'mono.ore';
  oreMat.needsUpdate = true;
  adopt(oreMat);
}

function inst(geom, mat, mats) {
  const m = new THREE.InstancedMesh(geom, mat, mats.length);
  // the bounding sphere is one rock, so a field spread over kilometres disappears the moment
  // the origin rock leaves frame
  m.frustumCulled = false;
  for (let i = 0; i < mats.length; i++) m.setMatrixAt(i, mats[i]);
  m.instanceMatrix.needsUpdate = true;
  return m;
}

function place(R, size) {
  const q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3();
  q.setFromEuler(e.set(R() * 6.283, R() * 6.283, R() * 6.283));
  const k = size * (0.62 + 0.76 * R());
  s.set(k, k * (0.62 + 0.6 * R()), k * (0.62 + 0.6 * R()));
  return { q, s };
}

// One standalone rock. Used for the hero rocks a scenario puts near the camera and by the
// showroom; the field itself never calls this — it instances.
export function asteroid(sizeClass, { seed = 0, ore = 0, palette = 'reach' } = {}) {
  materials();
  const cls = SIZES[sizeClass] ? sizeClass : 'mid';
  const tier = TIER[cls];
  const R = rnd(0x1a37 + seed * 2654435761 + cls.length * 7919);
  const g = rockGeom(tier, Math.floor(R() * TIER_SHAPES[tier]));
  const mesh = new THREE.Mesh(g, ore > 0 ? oreMat : rockMat);
  const { q, s } = place(R, SIZES[cls]);
  mesh.quaternion.copy(q);
  mesh.scale.copy(s);
  const grp = new THREE.Group();
  grp.name = `asteroid:${cls}`;
  grp.add(mesh);
  grp.userData = { sizeClass: cls, ore, radius: Math.max(s.x, s.y, s.z) };
  return grp;
}

// Soft cards of lit dust hung through the field. Points rather than quads so they always face
// the camera and the whole set is one draw call; the trade is that gl_PointSize is clamped, so
// a card closer than ~40 m stops growing.
function dustCards(def, R, far) {
  const n = Math.max(0, Math.round(def.dust * fxDensity() * BELT.dust));
  if (!n) return null;
  const c = new THREE.Color(def.dustColor).convertSRGBToLinear();
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), sz = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const z = 200 + (R() ** 0.8) * far * 0.8;
    pos[i * 3] = (R() * 2 - 1) * z * def.fan;
    pos[i * 3 + 1] = (R() * 2 - 1) * z * def.fan * def.flat;
    pos[i * 3 + 2] = -z;
    const m = 0.012 + 0.05 * (R() ** 1.8);
    col[i * 3] = c.r * m; col[i * 3 + 1] = c.g * m; col[i * 3 + 2] = c.b * m;
    sz[i] = def.dustSize * BELT.dustSize * (0.5 + 1.6 * R()) * (0.4 + z / far);
  }
  const p = softPoints(pos, col, sz, { soft: 1.15, power: 1, max: 900, bucket: cardBucket() });
  p.renderOrder = 6;
  return p;
}

export function belt(beltId, { seed = 0, density = 1 } = {}) {
  materials();
  const def = BELTS[beltId] || BELTS.kestrel;
  const R = rnd(0x4c11 + seed * 2654435761 + def.id.length * 8191);
  const grp = new THREE.Group();
  grp.name = `belt:${def.id}`;

  const buckets = new Map();
  const oreRocks = [];
  const v = new THREE.Vector3();
  let far = 0;

  for (const cls of CLASSES) {
    const tier = TIER[cls];
    const band = def.bands[cls];
    const n = Math.max(0, Math.round(band.n * density * BELT.density));
    for (let i = 0; i < n; i++) {
      const isOre = R() < def.ore[cls];
      // ore only ever lands on shape 0 of its tier, so the ore bucket cannot multiply the
      // draw-call count by the number of shapes
      const shape = isOre ? 0 : Math.floor(R() * TIER_SHAPES[tier]);
      const z = band.z[0] + (R() ** 0.72) * (band.z[1] - band.z[0]);
      const w = z * def.fan;
      v.set((R() * 2 - 1) * w, (R() * 2 - 1) * w * def.flat, -z);
      far = Math.max(far, z);
      const { q, s } = place(R, SIZES[cls]);
      const key = `${tier}:${shape}:${isOre ? 1 : 0}`;
      if (!buckets.has(key)) buckets.set(key, { tier, shape, ore: isOre, mats: [] });
      buckets.get(key).mats.push(new THREE.Matrix4().compose(v.clone(), q.clone(), s.clone()));
      if (isOre) oreRocks.push({ pos: v.clone(), radius: Math.max(s.x, s.y, s.z), sizeClass: cls });
    }
  }

  for (const b of buckets.values()) {
    grp.add(inst(rockGeom(b.tier, b.shape), b.ore ? oreMat : rockMat, b.mats));
  }

  const dust = dustCards(def, R, far);
  if (dust) grp.add(dust);

  oreRocks.sort((a, b) => b.radius - a.radius);
  grp.userData = { beltId: def.id, oreRocks, far, meshes: buckets.size + (dust ? 1 : 0) };
  return grp;
}

export function registerBeltKnobs(q) {
  const G = 'Belt';
  q.register({ key: 'beltDensity', label: 'Rock count (rebuild)', type: 'range', min: 0, max: 2, step: 0.05, default: 1, group: G },
    v => { BELT.density = v; });
  q.register({ key: 'oreGlow', label: 'Ore vein glow', type: 'range', min: 0, max: 12, step: 0.05, default: 3.0, group: G },
    v => { BELT.ore = v; if (oreMat) oreMat.emissiveIntensity = v; });
  q.register({ key: 'beltDust', label: 'Dust card count (rebuild)', type: 'range', min: 0, max: 3, step: 0.05, default: 1, group: G },
    v => { BELT.dust = v; });
  q.register({ key: 'beltDustSize', label: 'Dust card size (rebuild)', type: 'range', min: 0.2, max: 3, step: 0.05, default: 1, group: G },
    v => { BELT.dustSize = v; });
}
