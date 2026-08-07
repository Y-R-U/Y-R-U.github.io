// Ground items, the well and the campfire, and the boars that fight back.
//
// Everything the game layer ever draws goes through the two swarms below — one solid, one unlit —
// so props, enemies, bolts and swing arcs together cost two draw calls. combat.js borrows `fx.glow`
// for its effects, which is why the swarms are module state rather than something populate() owns.

import * as THREE from 'three';
import {
  Mesh, prism, spire, blob, loft, hip, ringCircle, matrix, mix, shade, rgb,
} from '../world/shape.js';
import { palette } from '../world/palette.js';
import { makeRng } from '../world/rng.js';
import { item } from './items.js';

const TAU = Math.PI * 2;

// Merged dynamic geometry, rewritten per frame — the same trick life.js runs its villagers on.
// A part is a slice of one big buffer; posing it is a matrix multiply straight into the attribute.
class Swarm {
  constructor(cls, { shadow = true } = {}) {
    this.cls = cls; this.shadow = shadow;
    this.P = []; this.N = []; this.C = []; this.parts = [];
  }

  add(geo) {
    const p = geo.attributes.position.array;
    const n = geo.attributes.normal.array;
    const c = geo.attributes.color.array;
    const part = {
      start: this.P.length / 3, n: p.length / 3, swarm: this,
      base: new Float32Array(p), baseN: new Float32Array(n), baseC: new Float32Array(c),
      hidden: false,
    };
    for (let i = 0; i < p.length; i++) { this.P.push(p[i]); this.N.push(n[i]); this.C.push(c[i]); }
    geo.dispose();
    this.parts.push(part);
    return part;
  }

  build(materials) {
    if (!this.parts.length) return null;
    const g = new THREE.BufferGeometry();
    this.pos = new THREE.Float32BufferAttribute(this.P, 3);
    this.nor = new THREE.Float32BufferAttribute(this.N, 3);
    this.col = new THREE.Float32BufferAttribute(this.C, 3);
    for (const a of [this.pos, this.nor, this.col]) a.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.pos);
    g.setAttribute('normal', this.nor);
    g.setAttribute('color', this.col);
    this.mesh = new THREE.Mesh(g, materials[this.cls]);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = this.shadow;
    this.mesh.receiveShadow = this.shadow;
    this.pa = this.pos.array; this.na = this.nor.array; this.ca = this.col.array;
    this.P = this.N = this.C = null;
    for (const part of this.parts) this.hide(part);
    return this.mesh;
  }

  write(part, m, deform) {
    if (!this.pa) return;
    part.hidden = false;
    const e = m.elements, b = part.base, bn = part.baseN, pa = this.pa, na = this.na;
    let o = part.start * 3;
    for (let i = 0; i < b.length; i += 3) {
      let x = b[i], y = b[i + 1], z = b[i + 2];
      if (deform) { const d = deform(x, y, z); x = d[0]; y = d[1]; z = d[2]; }
      pa[o] = e[0] * x + e[4] * y + e[8] * z + e[12];
      pa[o + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
      pa[o + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
      const nx = bn[i], ny = bn[i + 1], nz = bn[i + 2];
      const ax = e[0] * nx + e[4] * ny + e[8] * nz;
      const ay = e[1] * nx + e[5] * ny + e[9] * nz;
      const az = e[2] * nx + e[6] * ny + e[10] * nz;
      const l = Math.hypot(ax, ay, az) || 1;
      na[o] = ax / l; na[o + 1] = ay / l; na[o + 2] = az / l;
      o += 3;
    }
  }

  // Collapsing a part onto one point leaves degenerate triangles: nothing rasterises, nothing
  // reaches the shadow map, and the slot stays available for whatever spawns next.
  hide(part) {
    if (!this.pa || part.hidden) return;
    part.hidden = true;
    const pa = this.pa;
    for (let o = part.start * 3, end = (part.start + part.n) * 3; o < end; o += 3) {
      pa[o] = 0; pa[o + 1] = -600; pa[o + 2] = 0;
    }
  }

  scaleColor(part, f) {
    if (!this.ca) return;
    const b = part.baseC, ca = this.ca;
    let o = part.start * 3;
    for (let i = 0; i < b.length; i++) ca[o++] = b[i] * f;
  }

  flush(colors = false) {
    if (!this.mesh) return;
    this.pos.needsUpdate = true;
    this.nor.needsUpdate = true;
    if (colors) this.col.needsUpdate = true;
  }
}

export const fx = {
  solid: new Swarm('solid'),
  glow: new Swarm('glow', { shadow: false }),
  group: new THREE.Group(),
  ready: false,
  p: null,
};

const emit = (c, f) => { const k = rgb(c); return [k[0] * f, k[1] * f, k[2] * f]; };

const _m = new THREE.Matrix4();
const _v = new THREE.Vector3();
const _qt = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _sc = new THREE.Vector3();

export function pose(x, y, z, rx, ry, rz, s = 1) {
  _v.set(x, y, z);
  _e.set(rx, ry, rz);
  _qt.setFromEuler(_e);
  _sc.set(s, s, s);
  return _m.compose(_v, _qt, _sc);
}

let S = null;

// ── the item kit ─────────────────────────────────────────────────────────────────────────────
// Each one rests on the ground in its own natural pose; the runtime matrix only supplies place,
// yaw and bob. Odd radial counts throughout, and nothing here has a bounding box near a cube.

const ITEM_KINDS = ['sword', 'staff', 'hpot', 'mpot', 'apple', 'bread', 'log', 'stone', 'coin'];

// Pickups are drawn larger than life: a real apple beside a 1.7 m villager is four pixels at the
// diorama's distance. Weapons stay near true size because they already read.
const ITEM_SCALE = {
  sword: 1.15, staff: 1.05, log: 1.25, stone: 1.7, coin: 1.9,
  apple: 1.9, bread: 1.6, hpot: 1.8, mpot: 1.8,
};

function flask(p, rng, glass, cork) {
  const m = new Mesh();
  m.add(loft([
    ringCircle(7, 0.052, 0, 0.3),
    ringCircle(7, 0.082, 0.075, 0.5),
    ringCircle(7, 0.062, 0.13, 0.2),
    ringCircle(7, 0.03, 0.175, 0.4),
  ], { col: (ri, fi, t) => shade(glass, -0.18 + t * 0.42 + (fi % 3) * 0.05) }), null);
  m.add(prism(5, 0.032, 0.026, 0.045, { rot: rng() * TAU, col: shade(cork, 0.04) }), matrix({ pos: [0, 0.172, 0] }));
  return m.geo();
}

function itemGeo(id, p, rng) {
  const b = p.build;
  const m = new Mesh();
  switch (id) {
    case 'sword': {
      const steel = mix(b.metal[1], b.wall[0], 0.45);
      m.add(prism(5, 0.05, 0.014, 0.5, { rot: 0.4, squash: 0.42, col: (ri, fi) => shade(steel, -0.1 + (fi % 3) * 0.14) }),
        matrix({ pos: [0, 0.038, 0.07], rx: 1.5708, rz: 0.06 }));
      m.add(prism(5, 0.03, 0.024, 0.2, { rot: 0.9, squash: 0.55, col: shade(b.metal[2], 0.05) }),
        matrix({ pos: [0, 0.04, 0.05], rz: 1.5708 }));
      m.add(prism(5, 0.03, 0.026, 0.15, { rot: 1.4, col: shade(b.trim[0], 0.06) }),
        matrix({ pos: [0, 0.04, -0.1], rx: 1.5708 }));
      m.add(blob(0.036, 0, { jitter: 0.14, rng, col: shade(b.metal[0], 0.12) }), matrix({ pos: [0, 0.04, -0.26] }));
      break;
    }
    case 'staff': {
      const wood = b.wood[0];
      m.add(prism(5, 0.038, 0.026, 0.98, { rot: 0.6, twist: 0.3, col: (ri, fi, t) => shade(wood, -0.14 + t * 0.3 + (fi % 3) * 0.06) }),
        matrix({ pos: [0, 0.05, -0.42], rx: 1.5708, rz: 0.09 }));
      m.add(spire(5, 0.062, 0.13, { curve: 1.1, rings: 2, col: shade(mix(p.water.shallow, b.wall[1], 0.35), 0.18) }),
        matrix({ pos: [0, 0.055, 0.55], rx: 1.4, rz: 0.4 }));
      break;
    }
    case 'hpot': return flask(p, rng, mix(p.accent, b.roof[0], 0.35), b.wood[1]);
    case 'mpot': return flask(p, rng, mix(p.water.deep, p.fill.sky, 0.4), b.wood[1]);
    case 'apple': {
      m.add(blob(0.082, 0, { jitter: 0.16, stretch: 0.92, rng, col: mix(p.accent, b.roof[1], 0.3) }),
        matrix({ pos: [0, 0.082, 0] }));
      m.add(prism(5, 0.008, 0.005, 0.055, { col: b.trim[0] }), matrix({ pos: [0, 0.14, 0], rz: 0.3 }));
      m.quad([0, 0.17, 0], [0.05, 0.185, 0.02], [0.075, 0.17, -0.01], [0.02, 0.163, -0.02], shade(p.flora.canopy[0], 0.1));
      break;
    }
    case 'bread': {
      const crust = mix(b.thatch[0], b.wood[1], 0.3);
      m.add(blob(0.13, 0, { jitter: 0.18, stretch: 0.52, squash: 0.66, rng, col: crust }), matrix({ pos: [0, 0.07, 0], ry: 0.5 }));
      for (let i = 0; i < 3; i++) {
        m.quad([-0.05, 0.135 - i * 0.004, -0.06 + i * 0.06], [0.05, 0.132, -0.05 + i * 0.06],
          [0.05, 0.132, -0.028 + i * 0.06], [-0.05, 0.135, -0.038 + i * 0.06], shade(crust, -0.22));
      }
      break;
    }
    case 'log': {
      const wood = b.wood[2];
      m.add(prism(7, 0.085, 0.072, 0.5, { rot: rng() * TAU, col: (ri, fi, t) => shade(wood, -0.12 + (fi % 4) * 0.09) }),
        matrix({ pos: [-0.24, 0.082, 0], rz: -1.5708, ry: 0.3 }));
      break;
    }
    case 'stone': {
      m.add(blob(0.115, 0, { jitter: 0.34, stretch: 0.74, squash: 0.86, rng, col: p.ground.rock[0], flatten: 0.3 }),
        matrix({ pos: [0, 0.075, 0], ry: rng() * TAU }));
      break;
    }
    case 'coin': {
      const gold = mix(b.thatch[1], p.accent, 0.18);
      for (let i = 0; i < 3; i++) {
        m.add(prism(9, 0.072 - i * 0.004, 0.068 - i * 0.004, 0.02, { rot: rng() * TAU, col: shade(gold, 0.05 + i * 0.06) }),
          matrix({ pos: [(i - 1) * 0.018, i * 0.021, (i % 2) * 0.022], rz: (i - 1) * 0.05 }));
      }
      break;
    }
  }
  return m.geo();
}

// ── the boar ─────────────────────────────────────────────────────────────────────────────────
// It has to read as "not one of theirs" next to sheep and deer, so: hunched shoulder mass in front
// of a small rump, head slung low, a mane of blades and two pale tusks. A hide pulled toward the
// palette shadow separates it by value from every animal in life.js.

function boarGeo(p, rng) {
  // Mixing toward p.shadow darkens but bleeds the hue out, which is the achromatic-prop tell.
  // shade()'s negative branch darkens and *gains* saturation, so it does the value job on its own.
  const hide = shade(mix(p.build.woodDark[0], p.shadow, 0.16), -0.3);
  const hump = mix(hide, p.build.wood[2], 0.3);
  const face = shade(mix(hide, p.build.wood[1], 0.22), 0.04);
  const mane = shade(hide, -0.3);
  const m = new Mesh();

  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      m.add(prism(5, 0.086, 0.055, 0.21 + sz * 0.012, { rot: rng() * TAU, capTop: false, col: shade(mane, -0.05 + rng() * 0.12) }),
        matrix({ pos: [sx * 0.16, 0, sz * 0.26], rz: sx * 0.08, rx: sz * 0.05 }));
    }
  }

  m.add(blob(0.29, 0, { jitter: 0.16, stretch: 0.8, squash: 0.88, rng, col: hide }), matrix({ pos: [0, 0.40, -0.27], ry: 0.4 }));
  m.add(blob(0.32, 0, { jitter: 0.15, stretch: 0.78, squash: 0.9, rng, col: shade(hide, 0.04) }), matrix({ pos: [0, 0.43, -0.02], ry: 1.1 }));
  m.add(blob(0.35, 0, { jitter: 0.19, stretch: 0.9, squash: 0.82, rng, col: hump }), matrix({ pos: [0, 0.47, 0.21], ry: 0.6 }));
  m.add(blob(0.185, 0, { jitter: 0.13, stretch: 0.86, squash: 0.92, rng, col: face }), matrix({ pos: [0, 0.37, 0.49] }));
  m.add(prism(7, 0.098, 0.072, 0.24, { rot: 0.4, col: (ri, fi) => shade(face, -0.12 + (fi % 3) * 0.09) }),
    matrix({ pos: [0, 0.31, 0.5], rx: 1.44 }));
  m.add(prism(7, 0.062, 0.05, 0.03, { rot: 0.2, col: shade(p.build.woodDark[2], -0.2) }), matrix({ pos: [0, 0.305, 0.72], rx: 1.44 }));

  for (const sx of [-1, 1]) {
    m.add(prism(5, 0.028, 0.005, 0.16, { rot: 0.5, col: shade(p.build.wall[1], 0.1) }),
      matrix({ pos: [sx * 0.072, 0.28, 0.66], rx: -1.15, rz: sx * 0.42 }));
    m.add(prism(5, 0.055, 0.014, 0.12, { rot: 0.2, squash: 0.42, col: shade(hide, -0.12) }),
      matrix({ pos: [sx * 0.115, 0.47, 0.4], rz: sx * 0.85, rx: -0.55 }));
  }

  // The mane is the silhouette that says "not livestock" — flattened blades, not spikes.
  for (let i = 0; i < 5; i++) {
    const t = i / 4;
    const h = 0.13 + Math.sin((1 - t) * 2.0) * 0.13;
    m.add(spire(5, 0.062, h, { curve: 1.15, rings: 2, col: shade(mane, -0.06 + i * 0.045) }),
      matrix({
        pos: [(rng() - 0.5) * 0.025, 0.665 - t * 0.14, 0.3 - t * 0.56],
        rx: -0.42 + t * 0.34, rz: (rng() - 0.5) * 0.2, scale: [0.42, 1, 0.9],
      }));
  }

  m.add(prism(5, 0.02, 0.007, 0.17, { col: shade(hide, 0.1) }), matrix({ pos: [0, 0.43, -0.51], rx: 2.6, rz: 0.25 }));
  return m.geo();
}

function boarEyeGeo(p) {
  const m = new Mesh();
  const c = emit(mix(p.accent, '#ff9a5a', 0.28), 1.2);
  for (const sx of [-1, 1]) {
    const x = sx * 0.082, y = 0.42, z = 0.6;
    m.tri([x - 0.026, y - 0.014, z], [x + 0.026, y - 0.016, z + 0.006], [x, y + 0.022, z + 0.003], c);
    m.tri([x, y + 0.022, z + 0.003], [x + 0.026, y - 0.016, z + 0.006], [x - 0.026, y - 0.014, z], c);
  }
  return m.geo();
}

// ── the well and the fire ────────────────────────────────────────────────────────────────────

function wellGeo(p, rng) {
  const st = p.build.stone;
  const m = new Mesh();
  const rings = [
    ringCircle(9, 0.62, 0, 0.2), ringCircle(9, 0.56, 0.44, 0.4),
    ringCircle(9, 0.5, 0.78, 0.62), ringCircle(9, 0.56, 0.86, 0.62),
  ];
  m.add(loft(rings, { capTop: false, col: (ri, fi, t) => shade(st[fi % 3], -0.13 + t * 0.2 + (fi % 4) * 0.055) }), null);
  m.add(prism(9, 0.39, 0.36, 0.04, { rot: 0.5, col: shade(mix(p.water.deep, p.shadow, 0.7), -0.46) }), matrix({ pos: [0, 0.58, 0] }));

  for (const sx of [-1, 1]) {
    m.add(prism(5, 0.062, 0.046, 0.84, { rot: rng() * TAU, col: shade(p.build.wood[2], -0.05 + rng() * 0.18) }),
      matrix({ pos: [sx * 0.44, 0.72, 0], rz: -sx * 0.08 }));
  }
  m.add(prism(7, 0.036, 0.03, 0.9, { rot: 0.3, col: shade(p.build.wood[1], 0.08) }),
    matrix({ pos: [0, 1.46, 0], rz: 1.5708 }));
  m.add(hip(1.0, 0.74, 0.5, { over: 0.13, ridge: 0.3, col: (ri, fi) => shade(p.build.roof[fi % 3], -0.12 + fi * 0.15) }),
    matrix({ pos: [0, 1.52, 0], ry: 0.16 }));
  m.add(prism(7, 0.125, 0.145, 0.19, { rot: 0.7, col: shade(p.build.wood[0], -0.04) }), matrix({ pos: [0.14, 1.0, 0.05], rz: 0.16 }));
  return m.geo();
}

function campGeo(p, rng) {
  const m = new Mesh();
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU + rng() * 0.3;
    m.add(blob(0.13 + rng() * 0.05, 0, { jitter: 0.3, stretch: 0.66, rng, col: mix(p.ground.rock[i % 2 ? 0 : 2], p.ground.dirt[0], 0.3), flatten: 0.25 }),
      matrix({ pos: [Math.cos(a) * 0.62, 0.07, Math.sin(a) * 0.62], ry: rng() * TAU }));
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + 0.4;
    m.add(prism(7, 0.068, 0.05, 0.52, { rot: rng() * TAU, col: shade(p.build.woodDark[i % 2], -0.1 + rng() * 0.2) }),
      matrix({ pos: [Math.cos(a) * 0.2, 0.03, Math.sin(a) * 0.2], rx: Math.sin(a) * 0.95, rz: -Math.cos(a) * 0.95 }));
  }
  m.add(blob(0.2, 0, { jitter: 0.34, stretch: 0.4, rng, col: shade(p.shadow, -0.4) }), matrix({ pos: [0, 0.03, 0] }));
  return m.geo();
}

function flameGeo(p) {
  const m = new Mesh();
  m.add(spire(7, 0.27, 0.68, { curve: 1.5, rings: 3, col: (ri, fi, t) => emit(mix(p.lit.warm, p.accent, t * 0.95), 1.15 - t * 0.45) }), null);
  m.add(spire(5, 0.15, 0.34, { curve: 1.25, rings: 2, col: emit('#fff4d0', 1.4) }), matrix({ pos: [0, 0.04, 0], ry: 0.6 }));
  return m.geo();
}

// ── placement ────────────────────────────────────────────────────────────────────────────────

// A light pool is a claim on the ground's vertex colour, not on the ground — walking and dropping
// through one is fine, so it is the one tag ignored here.
function clear(x, z, r) {
  for (const c of S.claims) if (c.tag !== 'pool' && Math.hypot(c.x - x, c.z - z) < c.r + r) return false;
  for (const o of S.taken) if (Math.hypot(o.x - x, o.z - z) < o.r + r) return false;
  return true;
}

function spot(cx, cz, rMin, rMax, r, { tries = 90, level = 0 } = {}) {
  const t = S.terrain;
  const h0 = t.heightAt(cx, cz);
  for (let i = 0; i < tries; i++) {
    const a = S.rng() * TAU;
    const k = i / tries;
    const d = rMin + Math.sqrt(S.rng()) * (rMax - rMin) + k * rMax * 0.5;
    const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
    if (!t.inBounds(x, z, 5)) continue;
    if (t.heightAt(x, z) < t.waterY + 0.9) continue;
    if (t.slopeAt(x, z) > 0.34) continue;
    if (level && Math.abs(t.heightAt(x, z) - h0) > level) continue;
    if (!clear(x, z, r * (1 - k * 0.6))) continue;
    S.taken.push({ x, z, r: r * 0.7 });
    return { x, z };
  }
  return null;
}

// spot() gives up after its tries and every caller needs *somewhere*. A fixed offset is not a
// safe answer — it put boars in the lake, where the walk correctly refused to follow.
function dryGround(c, r0) {
  const t = S.terrain;
  const ok = (x, z) => t.inBounds(x, z, 5) && t.heightAt(x, z) > t.waterY + 0.9 && t.slopeAt(x, z) < 0.4;
  for (let r = r0; r < 34; r += 1.6) {
    const n = Math.max(10, Math.round(r * 3));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + r * 0.9;
      const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
      if (ok(x, z)) return { x, z };
    }
  }
  return { x: c.x, z: c.z };
}

// ── populate ─────────────────────────────────────────────────────────────────────────────────

export function populate(game, app, world) {
  const params = new URLSearchParams(location.search);
  const p = palette(world.paletteId);
  fx.p = p;
  const rng = makeRng(`${world.seed}:props`);
  const C = world.village?.centre || { x: 4, z: 2 };

  S = {
    game, app, world, p, rng, terrain: world.terrain, centre: C,
    claims: world.claims || [], taken: [],
    t: 0, boot: 0, seq: 0, pools: new Map(), items: [], enemies: [], hotspots: [],
    flame: null, wantPlay: params.has('play'), tookOver: false,
  };

  if (!game.player.pos) game.player.pos = game.spawnPoint.clone();

  for (const id of ITEM_KINDS) {
    const pool = [];
    for (let i = 0; i < 3; i++) {
      pool.push({ kind: id, part: fx.solid.add(itemGeo(id, p, rng)), live: false, inter: null });
    }
    S.pools.set(id, pool);
  }

  const n = Math.max(0, Math.min(16, +(params.get('dummies') ?? 3) || 0));
  for (let i = 0; i < n; i++) {
    S.enemies.push({
      idx: i, part: fx.solid.add(boarGeo(p, rng)), eyes: fx.glow.add(boarEyeGeo(p)),
      pos: new THREE.Vector3(), home: new THREE.Vector3(), yaw: rng() * TAU, gait: rng() * TAU,
      hp: 20, hpMax: 20, dmg: [2, 5], swing: 2.4, range: 1.5, speed: 1.75,
      alive: false, aggro: false, cool: 0, wander: 0, wx: 0, wz: 0, dead: 0, inter: null,
      scale: 0.94 + rng() * 0.2, phase: rng() * TAU,
    });
  }

  S.wellPart = fx.solid.add(wellGeo(p, rng));
  S.campPart = fx.solid.add(campGeo(p, rng));
  S.flamePart = fx.glow.add(flameGeo(p));

  for (const [sw, name] of [[fx.solid, 'fx-solid'], [fx.glow, 'fx-glow']]) {
    const mesh = sw.build(world.materials);
    if (mesh) { mesh.name = name; fx.group.add(mesh); }
  }
  fx.group.visible = false;
  app.scene.add(fx.group);
  fx.ready = true;
  if (window.__facet) window.__facet.props = { dropAt, enemies, fx };

  scatterItems();
  placeHotspots();
  for (const e of S.enemies) spawnEnemy(e, true);

  game.on('drop', d => {
    const id = d?.id || game.inv.slots?.[d?.index]?.id;
    if (!id || !S.pools.has(id)) return;
    const q = game.player.pos;
    const a = S.rng() * TAU, r = 0.7 + S.rng() * 0.5;
    dropAt(id, q.x + Math.cos(a) * r, q.z + Math.sin(a) * r);
  });
}

function scatterItems() {
  const C = S.centre;
  const plan = [
    ['sword', 1], ['staff', 1], ['hpot', 2], ['mpot', 1],
    ['apple', 2], ['bread', 1], ['log', 2], ['stone', 2], ['coin', 2],
  ];
  for (const [id, n] of plan) {
    for (let i = 0; i < n; i++) {
      const s = spot(C.x, C.z, 4.0, 12, 0.8, { level: 3.5 });
      if (s) spawnItem(id, s.x, s.z);
    }
  }
}

function spawnItem(id, x, z) {
  const pool = S.pools.get(id);
  if (!pool) return null;
  let slot = pool.find(s => !s.live) || pool[0];
  if (slot.live) despawnItem(slot);
  const it = item(id);
  slot.live = true;
  slot.x = x; slot.z = z;
  slot.y = S.terrain.heightAt(x, z);
  slot.yaw = S.rng() * TAU;
  slot.phase = S.rng() * TAU;
  slot.spin = 0.22 + S.rng() * 0.2;
  slot.inter = S.game.addInteractable({
    id: `item-${++S.seq}`, kind: 'item',
    pos: new THREE.Vector3(x, slot.y + 0.2, z),
    radius: 0.8, reach: 1.25, label: it?.name || id,
    onReach: g => {
      if (g.inv.add(id, 1)) { g.emit('toast', { text: `Picked up ${it?.name || id}.` }); despawnItem(slot); }
      else g.emit('toast', { text: 'No room for that.' });
    },
  });
  return slot;
}

function despawnItem(slot) {
  if (slot.inter) S.game.removeInteractable(slot.inter.id);
  slot.inter = null;
  slot.live = false;
  fx.solid.hide(slot.part);
}

export function dropAt(id, x, z) {
  if (!S) return null;
  const t = S.terrain;
  if (!t.inBounds(x, z, 3) || t.heightAt(x, z) < t.waterY + 0.3) { x = S.centre.x; z = S.centre.z; }
  return spawnItem(id, x, z);
}

// ── hotspots ─────────────────────────────────────────────────────────────────────────────────

function placeHotspots() {
  const C = S.centre;
  const g = S.game;
  const w = spot(C.x, C.z, 3.5, 8, 1.6, { level: 2.5 }) || { x: C.x + 4, z: C.z + 3 };
  S.well = { x: w.x, z: w.z, y: S.terrain.heightAt(w.x, w.z), yaw: S.rng() * TAU, cool: 0 };
  g.addInteractable({
    id: 'hs-well', kind: 'hotspot',
    pos: new THREE.Vector3(w.x, S.well.y + 0.7, w.z),
    radius: 1.3, reach: 1.9, label: 'Village well',
    onReach: () => {
      if (S.well.cool > 0) return g.emit('toast', { text: 'The bucket is still down the shaft.' });
      S.well.cool = 18;
      const p = g.player;
      p.mp = Math.min(p.mpMax, p.mp + 10);
      g.emit('change');
      g.emit('toast', { text: 'You draw a bucket. The water is cold and clean.' });
    },
  });

  const c = spot(C.x, C.z, 3.5, 9, 1.5, { level: 2.5 }) || { x: C.x - 4, z: C.z - 3 };
  S.camp = { x: c.x, z: c.z, y: S.terrain.heightAt(c.x, c.z), yaw: S.rng() * TAU, cool: 0 };
  g.addInteractable({
    id: 'hs-camp', kind: 'hotspot',
    pos: new THREE.Vector3(c.x, S.camp.y + 0.5, c.z),
    radius: 1.3, reach: 1.9, label: 'Campfire',
    onReach: () => {
      if (S.camp.cool > 0) return g.emit('toast', { text: 'The embers need time to build again.' });
      S.camp.cool = 18;
      const p = g.player;
      p.hp = Math.min(p.hpMax, p.hp + 10);
      g.emit('change');
      g.emit('toast', { text: 'You warm your hands. The ache eases.' });
    },
  });
}

// ── enemies ──────────────────────────────────────────────────────────────────────────────────

function spawnEnemy(e, first) {
  const C = S.centre;
  const s = first ? (spot(C.x, C.z, 6, 13, 1.7, { level: 2.6 }) || dryGround(C, 6 + e.idx * 1.5))
    : { x: e.home.x, z: e.home.z };
  e.home.set(s.x, S.terrain.heightAt(s.x, s.z), s.z);
  e.pos.copy(e.home);
  e.hp = e.hpMax;
  e.alive = true;
  e.aggro = false;
  e.dead = 0;
  e.cool = 1 + S.rng() * 1.5;
  e.wander = 0;
  e.inter = S.game.addInteractable({
    id: `boar-${e.idx}`, kind: 'enemy', enemy: e,
    pos: e.pos, radius: 1.05, reach: 1.5, label: 'Wild boar',
    onReach: g => g.combat?.engage?.(e),
  });
}

export function enemies() { return S ? S.enemies : []; }

export function enemyOf(o) {
  if (!o || !S) return null;
  if (o.hpMax && o.pos) return o;
  if (o.enemy) return o.enemy;
  return S.enemies.find(e => e.inter === o || e.inter?.id === o.id) || null;
}

// Returns true if this was the killing blow.
export function hurtEnemy(e, dmg) {
  if (!e.alive) return false;
  e.hp -= dmg;
  e.aggro = true;
  if (e.hp > 0) return false;
  e.hp = 0;
  e.alive = false;
  e.dead = 11 + S.rng() * 6;
  if (e.inter) S.game.removeInteractable(e.inter.id);
  e.inter = null;
  fx.solid.hide(e.part);
  fx.glow.hide(e.eyes);
  dropAt(S.rng.pick(['coin', 'bread', 'apple', 'hpot', 'stone', 'log']), e.pos.x, e.pos.z);
  return true;
}

const _leg = [0, 0, 0];

function stepEnemies(dt, game) {
  const t = S.terrain;
  const target = game.player.pos;
  for (const e of S.enemies) {
    if (!e.alive) {
      e.dead -= dt;
      if (e.dead <= 0) spawnEnemy(e, false);
      continue;
    }

    let speed = 0;
    if (e.aggro && game.player.alive) {
      const dx = target.x - e.pos.x, dz = target.z - e.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      e.yaw = turn(e.yaw, Math.atan2(dx, dz), dt * 4);
      if (d > e.range * 0.8) { speed = e.speed; }
      if (d > 26) e.aggro = false;
    } else {
      e.wander -= dt;
      if (e.wander <= 0) {
        e.wander = 2.5 + S.rng() * 4;
        const a = S.rng() * TAU, r = S.rng() * 5;
        e.wx = e.home.x + Math.cos(a) * r;
        e.wz = e.home.z + Math.sin(a) * r;
      }
      const dx = e.wx - e.pos.x, dz = e.wz - e.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.4) {
        e.yaw = turn(e.yaw, Math.atan2(dx, dz), dt * 1.6);
        speed = e.speed * 0.32;
      }
    }

    if (speed > 0) {
      const nx = e.pos.x + Math.sin(e.yaw) * speed * dt;
      const nz = e.pos.z + Math.cos(e.yaw) * speed * dt;
      if (t.inBounds(nx, nz, 4) && t.heightAt(nx, nz) > t.waterY + 0.5 && t.slopeAt(nx, nz) < 0.55) {
        e.pos.x = nx; e.pos.z = nz;
      } else {
        e.wander = 0;
        e.yaw += 1.7;
      }
    }
    e.pos.y = t.heightAt(e.pos.x, e.pos.z);
    e.gait += speed * dt * 3.4;

    const bob = Math.abs(Math.sin(e.gait)) * 0.035 * (speed > 0 ? 1 : 0)
      + Math.sin(S.t * 1.4 + e.phase) * 0.012;
    const swing = Math.sin(e.gait);
    pose(e.pos.x, e.pos.y + bob, e.pos.z, Math.sin(e.gait * 2) * 0.03, e.yaw,
      Math.sin(S.t * 0.9 + e.phase) * 0.03, e.scale);
    fx.solid.write(e.part, _m, speed > 0 ? (x, y, z) => {
      _leg[0] = x; _leg[1] = y; _leg[2] = z;
      if (y < 0.34) {
        const k = 1 - y / 0.34;
        _leg[2] = z + swing * (x * z > 0 ? 1 : -1) * 0.12 * k;
        _leg[1] = y + Math.max(0, swing * (x * z > 0 ? 1 : -1)) * 0.04 * k;
      }
      return _leg;
    } : null);
    fx.glow.write(e.eyes, _m);
  }
}

const turn = (a, want, k) => {
  let d = want - a;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  return a + d * Math.min(1, k);
};

// ── frame ────────────────────────────────────────────────────────────────────────────────────

export function update(dt, game) {
  if (!S || !fx.ready) return;

  // The character controller may still be a stub. Nothing here may show before someone is playing,
  // so ?play=1 with nobody claiming control after a beat means we claim it ourselves.
  if (!game.controlled && S.wantPlay && !S.tookOver && !game.control?.player) {
    S.boot += dt;
    if (S.boot > 0.25) { S.tookOver = true; game.controlled = true; game.emit('change'); }
  }
  if (!game.controlled) { if (fx.group.visible) fx.group.visible = false; return; }
  fx.group.visible = true;

  S.t += dt;
  const t = S.t;

  for (const [, pool] of S.pools) {
    for (const s of pool) {
      if (!s.live) continue;
      const w = Math.sin(t * 1.4 + s.phase);
      pose(s.x, s.y + 0.17 + w * 0.05, s.z, 0.32, s.yaw + t * s.spin, w * 0.07, ITEM_SCALE[s.kind] || 1.5);
      fx.solid.write(s.part, _m);
      s.inter.pos.set(s.x, s.y + 0.35, s.z);
    }
  }

  if (!S.placed) {
    S.placed = true;
    fx.solid.write(S.wellPart, pose(S.well.x, S.well.y - 0.08, S.well.z, 0, S.well.yaw, 0, 1));
    fx.solid.write(S.campPart, pose(S.camp.x, S.camp.y - 0.05, S.camp.z, 0, S.camp.yaw, 0, 1));
  }
  S.well.cool = Math.max(0, S.well.cool - dt);
  S.camp.cool = Math.max(0, S.camp.cool - dt);

  const f = 1 + Math.sin(t * 3.1) * 0.13 + Math.sin(t * 7.7) * 0.06;
  _v.set(S.camp.x, S.camp.y + 0.16, S.camp.z);
  _e.set(Math.sin(t * 2.3) * 0.09, t * 0.9, Math.sin(t * 1.9) * 0.11);
  _qt.setFromEuler(_e);
  _sc.set(0.9 + (f - 1) * 0.8, 0.92 + (f - 1) * 1.3, 0.9 + (f - 1) * 0.8);
  fx.glow.write(S.flamePart, _m.compose(_v, _qt, _sc));
  fx.glow.scaleColor(S.flamePart, f);

  stepEnemies(dt, game);

  fx.solid.flush();
  fx.glow.flush(true);
}
