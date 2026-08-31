// getMaterial(zoneId, surface) plus the night-window API the building kit calls into.
// Textures are procedural (js/world/textures) and projected from world space, so a 56 m wall
// and a 5 m house get the same stone at the same scale without either having usable UVs.

import * as THREE from 'three';
import { zone } from './zones.js';
import { surface as bakeSurface, dropAll, onTexturesRebuilt } from './textures/bake.js';
import { stone } from './textures/stone.js';
import { roof as roofTex, wood as woodTex, road as roadTex, ground as groundTex, glass as glassTex } from './textures/surfaces.js';
import { project, setGroundField as applyGroundField } from './textures/project.js';

const TILE = { wall: 4.2, roof: 1.6, road: 2.4, ground: 3.2, wood: 1.2, glass: 0.92 };
// `ashlar` is half `wall` on purpose: it covers twice the metres per tile, so 512 over 8.4 m is
// 61 texels a metre against the outdoor wall's 244, and it is the only set in the room that
// would otherwise put 10 MB on the budget for one surface. See ashlarSet().
const RES = { wall: 1024, roof: 256, road: 256, ground: 512, wood: 256, glass: 256, flag: 512, ashlar: 512 };

// Course height in metres. zones.js authors blockW/blockH at roughly twice life size, which
// reads as cartoon blockwork against a 6 m house; the width/height ratio is kept, the absolute
// size is not.
const COURSE = { light: 0.22, neutral: 0.20, dark: 0.235 };

// A roof sits at this fraction of its zone's wall value so the break survives being looked at
// as a 200px thumbnail — but never below ROOF_FLOOR, because a roof plane whose albedo is
// under about 0.05 linear returns the same near-zero at every orientation and a whole district
// of them merges into one black mass. WALL_GAIN is the mean the masonry generator's own
// shading multiplies the authored base colour down by.
const ROOF_VS_WALL = 0.62, ROOF_FLOOR = 0.30, WALL_GAIN = 0.88;

// The three district grounds meet along dead-straight quad edges. Authored side by side they
// step from olive to near-black, which reads as a seam rather than as terrain, so value is
// pulled toward a common mid. Zone identity on the ground now comes from hue, not value.
const GROUND_MID = 0.44, GROUND_PULL = 0.55;

// Merged districts mean one mesh per zone+surface, so per-building tint has to come from world
// position in the shader. `amount/hue/period/rough` is the per-building drift; `grunge*` is a
// second, much larger-period layer over albedo and roughness that hides the texture's own
// repeat; `skirt` darkens the metre where a surface meets the terrain.
const VARY = {
  wall: { amount: 0.23, hue: 0.10, period: 13, rough: 0.11, grunge: 31, grungeAmount: 0.30, grungeRough: 0.17, skirt: 0.62, skirtFall: 0.5 },
  trim: { amount: 0.23, hue: 0.10, period: 13, rough: 0.11, grunge: 31, grungeAmount: 0.26, grungeRough: 0.15, skirt: 0.62, skirtFall: 0.5 },
  roof: { amount: 0.26, hue: 0.11, period: 13, rough: 0.10, grunge: 24, grungeAmount: 0.26, grungeRough: 0.15 },
  road: { amount: 0.22, hue: 0.05, period: 7, rough: 0.12, grunge: 17, grungeAmount: 0.22, grungeRough: 0.12 },
  ground: { amount: 0.28, hue: 0.06, period: 17, rough: 0.09, grunge: 37, grungeAmount: 0.24, grungeRough: 0.08 },
  wood: { amount: 0.16, hue: 0.07, period: 11, rough: 0.08, grunge: 15, grungeAmount: 0.22, grungeRough: 0.10, skirt: 0.5, skirtFall: 0.42 },
};

const cache = new Map();
const built = [];
const lit = new Set();
const envListeners = new Set();
let envIntensity = 1;
let varyScale = 1;
let skirtScale = 1;

const hashId = id => id.split('').reduce((a, c) => a * 31 + c.charCodeAt(0), 7) & 1023;

const rgbOf = hex => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const hexOf = c => '#' + c.map(v => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('');
const lumOf = c => (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255;
const scaleHex = (hex, k) => hexOf(rgbOf(hex).map(v => v * k));

function masonry(z) {
  const h = COURSE[z.id] ?? 0.21;
  return { ...z.stone, blockH: h, blockW: h * (z.stone.blockW / z.stone.blockH) };
}

function roofCfg(z) {
  const wall = lumOf(rgbOf(z.stone.base)) * (0.4 + 0.6 * lumOf(rgbOf(z.stone.dark)) / Math.max(lumOf(rgbOf(z.stone.base)), 0.02)) * WALL_GAIN;
  const lum = Math.max(wall * ROOF_VS_WALL, ROOF_FLOOR);
  const k = lum / Math.max(lumOf(rgbOf(z.roof.color)), 0.02);
  // lift `dark` less than `color` so a roof that had to be raised off the floor keeps some
  // tile-to-tile contrast instead of turning into one flat slab
  return { ...z.roof, lum, color: scaleHex(z.roof.color, k), dark: scaleHex(z.roof.dark, k * 0.86) };
}

function groundCfg(z) {
  const fix = hex => {
    const l = Math.max(lumOf(rgbOf(hex)), 0.02);
    return scaleHex(hex, 1 + (GROUND_MID / l - 1) * GROUND_PULL);
  };
  return {
    ...z,
    foliage: { ...z.foliage, grass: z.foliage.grass.map(fix) },
    groundTint: fix(z.groundTint),
  };
}

const texSets = {
  wall: z => bakeSurface(`${z.id}:wall`, RES.wall, S => stone(S, masonry(z), TILE.wall, hashId(z.id))),
  roof: z => bakeSurface(`${z.id}:roof`, RES.roof, S => roofTex(S, roofCfg(z), TILE.roof, hashId(z.id) + 2)),
  road: z => bakeSurface(`${z.id}:road`, RES.road, S => roadTex(S, z, TILE.road, hashId(z.id) + 4)),
  ground: z => bakeSurface(`${z.id}:ground`, RES.ground, S => groundTex(S, groundCfg(z), TILE.ground, hashId(z.id) + 6)),
  wood: z => bakeSurface(`${z.id}:wood`, RES.wood, S => woodTex(S, z.wood, hashId(z.id) + 8)),
  glass: z => bakeSurface(`${z.id}:glass`, RES.glass, S => glassTex(S, z, TILE.glass, hashId(z.id) + 10)),
};

function leaded(z, m) {
  const t = texSets.glass(z);
  m.map = t.map;
  m.normalMap = t.normalMap;
  m.normalScale.set(0.6, 0.6);
  m.metalness = 0;
  m.emissive.set(z.window.litColor);
  m.userData.lit = z.window.litIntensity;
  project(m, 'glass', TILE.glass, { amount: 0, hue: 0, period: 13, rough: 0 });
  lit.add(m);
  m.needsUpdate = true;
}

// A seam is the rock it is cut from, not the town it stands in. On `trim` the same chalk came out
// a pale cone in Whitewall and a dark boulder in Longacre, and iron and obsidian were one stone
// drawn twice — and the quests want them told apart.
const ROCK = {
  chalk: { color: '#bcb6a1', roughness: 0.94, metalness: 0 },
  iron_glass: { color: '#7a6650', roughness: 0.62, metalness: 0.18 },
  obsidian: { color: '#26232e', roughness: 0.24, metalness: 0.35 },
};

const SURFACE = {
  wall: (z, m) => textured(m, z, 'wall', 'triplanar', 'wall'),
  trim: (z, m) => { textured(m, z, 'wall', 'triplanar', 'trim'); m.color.copy(tint(z.stone.base, z.trim)); },
  roof: (z, m) => textured(m, z, 'roof', 'slope', 'roof'),
  road: (z, m) => textured(m, z, 'road', 'triplanar', 'road'),
  ground: (z, m) => textured(m, z, 'ground', 'triplanar', 'ground'),
  wood: (z, m) => textured(m, z, 'wood', 'triplanar', 'wood'),
  crest: (z, m) => { m.color.set(z.crest.color); m.roughness = 0.42; m.metalness = z.crest.metalness || 0; },
  // Leaf, for the things that grow and are not scattered: a flat colour off the zone's own bush
  // row, because the masonry and timber sets both make a herb read as debris.
  bush: (z, m) => { m.color.set(z.foliage.bush[0]); m.roughness = 0.88; },
  glass: (z, m) => { m.emissiveIntensity = 0; leaded(z, m); },
  ...Object.fromEntries(Object.entries(ROCK).map(([id, r]) => [`rock:${id}`, (z, m) => {
    m.color.set(r.color); m.roughness = r.roughness; m.metalness = r.metalness;
  }])),
};

function textured(m, z, set, mode, varyKey) {
  const t = texSets[set](z);
  m.map = t.map;
  m.normalMap = t.normalMap;
  m.normalScale.set(1, 1);
  m.metalness = 0;
  const v = VARY[varyKey] || VARY.wall;
  project(m, mode, TILE[set], { ...v, amount: v.amount * varyScale, hue: v.hue * varyScale, grungeAmount: v.grungeAmount * varyScale, skirt: (v.skirt || 0) * skirtScale });
  m.needsUpdate = true;
}

// The baked {map, normalMap} behind a surface, for the few things that want the texture but
// not the outdoor projection — interiors, where the ground skirt would darken a whole room.
export function textureSet(zoneId, set) { return texSets[set](zone(zoneId)); }

// ── interior-only sets ──────────────────────────────────────────────────────────────────────
// A great hall wants two surfaces the outdoor kit has no use for: a flagged floor and roof
// timber. Both are the existing generators read with different numbers — a flag is masonry with
// a metre-and-a-third block instead of a 0.22 m course, and a roof beam is the zone's own timber
// at a tighter tile so a 0.3 m rafter still shows grain. Neither is a new texture *kind*, which
// is why they live here beside the sets they are cut from rather than in a new module.
//
// `slab` is the flag's long edge in metres and `tile` the metres one texture covers; the pair is
// what stops a 35 m floor reading as brickwork. Cached per zone+size like every other set.
export function flagSet(zoneId, slab = 0.9, tile = 3.6) {
  const z = zone(zoneId);
  // `square` is not a zone read, it is what a flag is: the generator's joint width is a fraction
  // of the course height, so a rounded block at 0.9 m gives a 0.38 m mortar bed and the floor
  // comes out as black bars. Square-cut is 0.135 m at the same size, which is a flagstone joint.
  // Worn flat by feet: a shallower joint than a wall, and more chipping than a wall gets.
  const cfg = { ...z.stone, blockW: slab * 1.18, blockH: slab, blockShape: 'square',
    jointDepth: z.stone.jointDepth * 0.5, chipping: Math.min(0.85, z.stone.chipping + 0.22),
    roughness: Math.min(1, z.stone.roughness + 0.06) };
  const label = `${z.id}:flag:${slab}:${tile}`;
  return bakeSurface(label, RES.flag, S => stone(S, cfg, tile, hashId(z.id) + 14));
}

// A great hall's inside face is dressed ashlar, and the outdoor wall set cannot be it. COURSE
// shrinks every zone's authored block to ~0.21 m so a 6 m cottage does not read as cartoon
// blockwork — but eleven metres of that is a brick wall, which is exactly what a critic pass and
// Aaron both called it. This read goes back to the size zones.js actually authors (light is
// 0.9 x 0.42 m) and cuts the joint down to suit: a shape's joint is a fraction of its course, so
// the same `rounded` profile that gives a cottage a 0.09 m bed opens to 0.18 m at hall scale and
// the wall turns to rubble. Block *shape* is still the zone's own — this changes how big the
// stones are and how finely they are cut, not what rock the town is built of.
//
// `course` is the block height in metres and `tile` the metres one texture covers; the pair is
// what stops eleven metres of wall reading as brickwork. Cached per zone+size like every set.
export function ashlarSet(zoneId, course = ASHLAR.course, tile = ASHLAR.tile) {
  const z = zone(zoneId);
  const cfg = { ...z.stone,
    blockH: course, blockW: course * (z.stone.blockW / z.stone.blockH),
    joint: 0.13, bulge: Math.min(z.stone.blockShape === 'rounded' ? 0.12 : 0.06, 0.12),
    jointDepth: z.stone.jointDepth * 0.72,
    chipping: z.stone.chipping * 0.7,
  };
  return bakeSurface(`${z.id}:ashlar:${course}:${tile}`, RES.ashlar, S => stone(S, cfg, tile, hashId(z.id) + 18));
}

// The hall's own masonry read, in the same shape as INTERIOR_TILE so interior.js can swap one
// entry of the table rather than carrying a second one.
export const ASHLAR = { course: 0.42, tile: 8.4 };

// Metres per tile the interior kit projects its own UVs at. Exported so interior.js and this
// file cannot drift: `wall` and `wood` are literally the outdoor numbers.
export const INTERIOR_TILE = { stone: TILE.wall, wood: TILE.wood, flag: 3.6, beam: 1.35, cloth: 1.0 };

export function getMaterial(zoneId, surfaceName) {
  const key = `${zoneId}:${surfaceName}`;
  if (cache.has(key)) return cache.get(key);
  const z = zone(zoneId);
  const m = new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0 });
  m.envMapIntensity = envIntensity;
  m.name = key;
  (SURFACE[surfaceName] || SURFACE.wall)(z, m);
  cache.set(key, m);
  built.push({ m, z, surfaceName });
  return m;
}

// The resolved figure, after lighting has folded time of day into the envPower knob. Anything
// keeping its own materials outside `built` has to read this, not the raw knob, or it stops
// tracking the sky the moment the sun goes down.
export function getEnvIntensity() { return envIntensity; }
export function onEnvIntensity(fn) { envListeners.add(fn); fn(envIntensity); }

export function setEnvIntensity(v) {
  envIntensity = v;
  for (const { m } of built) m.envMapIntensity = v;
  for (const m of glassCache.values()) m.envMapIntensity = v;
  for (const fn of envListeners) fn(v);
}

export function setVariation(v) {
  varyScale = v;
  for (const { m, surfaceName } of built) {
    const key = SURFACE[surfaceName] === SURFACE.trim ? 'trim' : surfaceName;
    const base = VARY[key];
    if (!base || !m.userData.pVar) continue;
    m.userData.pVar.value[0] = base.amount * v;
    m.userData.pVar.value[1] = base.hue * v;
    if (m.userData.pGrunge) m.userData.pGrunge.value[1] = (base.grungeAmount || 0) * v;
  }
}

export function setGroundField(tex, grid) { applyGroundField(tex, grid); }

export function setSkirt(v) {
  skirtScale = v;
  for (const { m, surfaceName } of built) {
    const key = SURFACE[surfaceName] === SURFACE.trim ? 'trim' : surfaceName;
    const base = VARY[key];
    if (!base?.skirt || !m.userData.pSkirt) continue;
    m.userData.pSkirt.value[0] = base.skirt * v;
  }
}

function tint(fromHex, toHex) {
  const a = new THREE.Color(fromHex), b = new THREE.Color(toHex);
  return new THREE.Color().setRGB(
    Math.min(2, b.r / Math.max(a.r, 0.02)),
    Math.min(2, b.g / Math.max(a.g, 0.02)),
    Math.min(2, b.b / Math.max(a.b, 0.02)));
}

onTexturesRebuilt(() => {
  for (const { m, z, surfaceName } of built) {
    if (SURFACE[surfaceName] === SURFACE.crest) continue;
    (SURFACE[surfaceName] || SURFACE.wall)(z, m);
  }
});

// Panes share one material per zone+variant; a small pool of point lights follows the camera.
const glassCache = new Map();
const _v = new THREE.Vector3(), _fwd = new THREE.Vector3();

export function glassMaterial(zoneId, variant = 0) {
  const z = zone(zoneId);
  const tints = z.window.glass;
  const i = ((variant % tints.length) + tints.length) % tints.length;
  const key = `${zoneId}:${i}`;
  if (glassCache.has(key)) return glassCache.get(key);
  const m = new THREE.MeshStandardMaterial({ color: tints[i], metalness: 0, emissiveIntensity: 0 });
  m.envMapIntensity = envIntensity;
  m.name = `glass:${key}`;
  leaded(z, m);
  glassCache.set(key, m);
  return m;
}

class Windows {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'windowLights';
    this.items = [];
    this.pool = [];
    this.night = 0;
    this.cap = 12;
    this.power = 9;
    this.reach = 11;
    this.glow = 1;
    this.acc = 1;
    this.attached = false;
  }

  add(mesh, { zoneId = 'neutral', normal = null, inset = 0.35, intensity = 1, variant = 0 } = {}) {
    mesh.material = glassMaterial(zoneId, variant);
    const dir = normal ? new THREE.Vector3().copy(normal).normalize() : new THREE.Vector3(0, 0, 1);
    this.items.push({ mesh, zoneId, dir, inset, intensity, pos: null });
    return mesh;
  }

  // For merged/batched geometry, where there is no per-pane mesh to hang a light off.
  addAt(worldPos, { zoneId = 'neutral', normal = null, inset = 0.35, intensity = 1 } = {}) {
    const pos = new THREE.Vector3().copy(worldPos);
    const dir = normal ? new THREE.Vector3().copy(normal).normalize() : new THREE.Vector3(0, 0, 1);
    this.items.push({ zoneId, dir, inset, intensity, pos, lightPos: pos.clone().addScaledVector(dir, inset) });
  }

  clear() {
    this.items.length = 0;
    this.scanned = false;
    for (const l of this.pool) l.intensity = 0;
  }

  // Fallback for a kit that batches its panes into shared geometry: find every run of
  // triangles drawn with a lit glass material and cluster it back into individual panes.
  discover(scene) {
    if (this.scanned) return;
    this.scanned = true;
    const cells = new Map();
    const p = new THREE.Vector3(), n = new THREE.Vector3();
    scene.updateMatrixWorld();

    scene.traverse(o => {
      if (!o.isMesh || !o.geometry?.attributes?.position) return;
      // A block's proxy set carries the same windows as its detail set. Both are in the graph at
      // once, so without this every house past `lodDetail` claims a second point light.
      for (let a = o; a; a = a.parent) if (a.name.endsWith(':proxy')) return;
      const mats = [].concat(o.material);
      const geo = o.geometry;
      const idx = geo.index;
      const total = idx ? idx.count : geo.attributes.position.count;
      const groups = geo.groups.length ? geo.groups : [{ start: 0, count: total, materialIndex: 0 }];
      const nrm = new THREE.Matrix3().getNormalMatrix(o.matrixWorld);

      for (const g of groups) {
        const m = mats[g.materialIndex | 0];
        if (!m || !lit.has(m)) continue;
        const zoneId = (m.name.match(/(light|neutral|dark)/) || [, 'neutral'])[1];
        const end = Math.min(g.start + g.count, total);
        for (let i = g.start; i < end; i += 3) {
          const vi = idx ? idx.getX(i) : i;
          p.fromBufferAttribute(geo.attributes.position, vi).applyMatrix4(o.matrixWorld);
          if (geo.attributes.normal) n.fromBufferAttribute(geo.attributes.normal, vi).applyMatrix3(nrm).normalize();
          const key = `${Math.round(p.x / 1.3)},${Math.round(p.y / 1.3)},${Math.round(p.z / 1.3)}`;
          let c = cells.get(key);
          if (!c) cells.set(key, c = { zoneId, n: 0, p: new THREE.Vector3(), d: new THREE.Vector3() });
          c.p.add(p); c.d.add(n); c.n++;
        }
      }
    });

    const panes = [];
    for (const c of cells.values()) {
      if (c.n < 3) continue;
      c.p.divideScalar(c.n);
      panes.push(c);
    }
    for (const b of buildingsOf(panes)) {
      for (const c of b.panes) {
        // A point light on the inside of the wall contributes nothing to the outer face
        // (N·L < 0), so the pane normal has to point out of the building it belongs to.
        // The owning building is found by clustering the panes themselves — a merged
        // district's bounding box centre is tens of metres from any of them.
        const out = c.p.clone().sub(b.centre).setY(0);
        if (out.lengthSq() < 0.36) out.copy(b.face);
        if (c.d.lengthSq() > 1e-4) {
          c.d.setY(0);
          if (c.d.lengthSq() > 1e-4 && c.d.dot(out) > 0) out.copy(c.d);
        }
        if (out.lengthSq() < 1e-6) out.set(0, 0, 1);
        this.addAt(c.p, { zoneId: c.zoneId, normal: out.normalize(), inset: 0.45 });
      }
    }
  }

  setCap(n) {
    this.cap = Math.max(0, n | 0);
    while (this.pool.length > this.cap) { const l = this.pool.pop(); this.group.remove(l); l.dispose?.(); }
    this.acc = 1;
  }

  setNight(f) {
    this.night = f;
    for (const m of lit) m.emissiveIntensity = (m.userData.lit || 1) * f * this.glow;
    this.acc = 1;
  }

  attach(parent) { this.parent = parent; }

  update(dt, app) {
    if (this.night > 0.02 && !this.scanned && !this.items.length) this.discover(app.scene);
    const on = this.night > 0.02 && this.cap > 0 && this.items.length > 0;
    if (on !== this.attached && this.parent) {
      on ? this.parent.add(this.group) : this.parent.remove(this.group);
      this.attached = on;
    }
    if (!on) return;

    this.acc += dt;
    if (this.acc < 0.35) return;
    this.acc = 0;

    const cam = app.camera.position;
    const fwd = app.camera.getWorldDirection(_fwd);
    for (const it of this.items) {
      if (!it.pos) {
        it.mesh.updateWorldMatrix(true, false);
        it.pos = new THREE.Vector3().setFromMatrixPosition(it.mesh.matrixWorld);
        it.lightPos = it.pos.clone().addScaledVector(
          it.dir.clone().applyQuaternion(it.mesh.getWorldQuaternion(new THREE.Quaternion())), it.inset);
      }
      _v.subVectors(it.pos, cam);
      const ahead = _v.dot(fwd);
      // Nearest-to-camera alone hands every light to whatever is beside you and off screen.
      it.d = ahead < 1 ? Infinity : _v.lengthSq() / Math.max(0.15, ahead / _v.length());
    }
    // Greedy min-separation, or the nearest facade swallows the whole pool and floodlights itself.
    const sorted = this.items.filter(i => i.d < Infinity).sort((a, b) => a.d - b.d);
    const near = [];
    for (const it of sorted) {
      if (near.length >= this.cap) break;
      if (near.every(o => o.lightPos.distanceToSquared(it.lightPos) > 15)) near.push(it);
    }

    while (this.pool.length < near.length) {
      const l = new THREE.PointLight(0xffffff, 0, 14, 2);
      this.pool.push(l);
      this.group.add(l);
    }
    for (let i = 0; i < this.pool.length; i++) {
      const l = this.pool[i], it = near[i];
      if (!it) { l.intensity = 0; continue; }
      const z = zone(it.zoneId);
      l.color.set(z.window.litColor);
      l.position.copy(it.lightPos);
      l.intensity = this.power * it.intensity * z.window.litIntensity * this.night;
      l.distance = this.reach;
    }
  }
}

// Link panes into buildings so each one can be told which way is out. Panes on one facade of a
// long wall run collapse onto their own centre, so each group also carries a fallback facing.
function buildingsOf(panes, radius = 6) {
  const r2 = radius * radius;
  const seen = new Set();
  const out = [];
  for (const start of panes) {
    if (seen.has(start)) continue;
    const group = [start];
    seen.add(start);
    for (let i = 0; i < group.length; i++) {
      for (const q of panes) {
        if (seen.has(q)) continue;
        const dx = q.p.x - group[i].p.x, dz = q.p.z - group[i].p.z;
        if (dx * dx + dz * dz <= r2) { seen.add(q); group.push(q); }
      }
    }
    const centre = new THREE.Vector3();
    for (const c of group) centre.add(c.p);
    centre.divideScalar(group.length);
    centre.y = 0;
    // principal axis of the group in XZ; a facade's outward face is perpendicular to it
    let sxx = 0, sxz = 0, szz = 0;
    for (const c of group) {
      const dx = c.p.x - centre.x, dz = c.p.z - centre.z;
      sxx += dx * dx; sxz += dx * dz; szz += dz * dz;
    }
    const ang = 0.5 * Math.atan2(2 * sxz, sxx - szz);
    const face = new THREE.Vector3(-Math.sin(ang), 0, Math.cos(ang));
    let sign = 0;
    for (const c of group) sign += c.d.x * face.x + c.d.z * face.z;
    if (sign < 0) face.negate();
    out.push({ panes: group, centre, face });
  }
  return out;
}

export const windows = new Windows();

export function disposeAll() {
  for (const m of cache.values()) m.dispose();
  for (const m of glassCache.values()) m.dispose();
  cache.clear(); glassCache.clear(); lit.clear(); built.length = 0;
  dropAll();
}
