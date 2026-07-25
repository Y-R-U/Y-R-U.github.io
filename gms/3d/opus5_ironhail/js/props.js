// Destructible scenery. Everything on the field has hit points: trees topple
// or get launched outright, fuel drums cook off and chain, silos collapse,
// walls crumble. Dead props stop blocking movement, shells and lines of sight,
// so a mortar barrage genuinely re-opens the battlefield.

import * as THREE from 'three';
import { FIELD_R } from './config.js';
import { rand, randInt, clamp, clamp01, mulberry32, segHitsCircle, lerp } from './utils.js';
import { fieldRoot } from './render.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Parts, G, solidMat, mixHex } from './meshkit.js';
import { terrainHeight } from './terrain.js';
import { spawnDebris, spawnSmoke, spawnExplosion, spawnSparks, volAt } from './particles.js';
import { AudioFX } from './audio.js';
import { emit } from './bus.js';

export const props = [];          // every prop, alive or not
export const obstacles = [];      // live, movement-blocking subset (x, z, r, h)

let rootGroup = null;
let decorGroup = null;
let flyingCount = 0;
const MAX_FLYING = 26;

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();

// ---------------------------------------------------------------------------
// Palettes
// ---------------------------------------------------------------------------

function paletteFor(b) {
  const p = {
    wood: 0x4a3524, bark: 0x3a2a1e, foliage: 0x4f7a34, foliage2: 0x3f6a2a,
    rock: 0x6f6a63, metal: 0x4e545a, rust: 0x8a4a28, concrete: 0x8b8880,
    fabric: 0x9a8a5a, hay: 0xa8842e, snow: 0xe8f0f6, ember: 0xff6a2a,
    dark: 0x2a2724, red: 0x8a2b20,
  };
  switch (b.id) {
    case 'desert':
      return { ...p, wood: 0x6a5238, bark: 0x54402c, foliage: 0x5f8046,
        foliage2: 0x4d6b39, rock: 0x9a6f4c, concrete: 0xa89474, hay: 0xc0a060 };
    case 'tundra':
      return { ...p, foliage: 0x2c4a36, foliage2: 0x223a2a, rock: 0x76808c,
        concrete: 0x9aa4ac, wood: 0x3c2e22, hay: 0x8a7a54 };
    case 'forest':
      return { ...p, foliage: 0x3f7030, foliage2: 0x2f5a24, rock: 0x5a5c52 };
    case 'industrial':
      return { ...p, concrete: 0x7a7872, metal: 0x565c62, rust: 0x93502a,
        rock: 0x5c5a56, foliage: 0x46543a };
    case 'volcanic':
      return { ...p, wood: 0x2e2422, bark: 0x241c1a, foliage: 0x3a3028,
        foliage2: 0x2c2420, rock: 0x33292a, concrete: 0x4a4240, ember: 0xff7a2a };
    default:
      return p;
  }
}

// ---------------------------------------------------------------------------
// Prop catalogue. Each build() fills a Parts and returns collision info.
// mass drives whether a shell topples it or throws it across the field.
// ---------------------------------------------------------------------------

const DEFS = {
  tree_oak: {
    hp: 60, mass: 1.0, r: 1.0, h: 7.5, tall: true, crush: 6, fall: 'topple',
    build(P, rng, c) {
      const th = rand(5.2, 8.2);
      P.add(G.taper(6), c.bark, [0, th * 0.5, 0], [0, rng() * 3, 0], [0.75, th, 0.75]);
      const lumps = randInt(3, 4);
      for (let i = 0; i < lumps; i++) {
        const s = rand(2.4, 4.0);
        P.add(G.ico(0), i % 2 ? c.foliage2 : c.foliage,
          [rand(-1.3, 1.3), th * rand(0.78, 1.05) + s * 0.2, rand(-1.3, 1.3)],
          [rng(), rng(), rng()], [s, s * 0.82, s]);
      }
      return { r: 1.1, h: th + 2 };
    },
  },
  pine: {
    hp: 48, mass: 0.85, r: 0.9, h: 9, tall: true, crush: 6, fall: 'topple',
    build(P, rng, c) {
      const th = rand(6.5, 10.5);
      P.add(G.taper(6), c.bark, [0, th * 0.42, 0], [0, rng() * 3, 0], [0.6, th * 0.85, 0.6]);
      const tiers = randInt(3, 5);
      for (let i = 0; i < tiers; i++) {
        const k = i / tiers;
        const w = lerp(4.4, 1.5, k);
        P.add(G.cone(7), i % 2 ? c.foliage : c.foliage2,
          [0, th * (0.32 + k * 0.62), 0], [0, rng() * 3, 0], [w, th * 0.36, w]);
      }
      return { r: 1.0, h: th + 1 };
    },
  },
  dead_tree: {
    hp: 34, mass: 0.6, r: 0.8, h: 7, tall: true, crush: 5, fall: 'topple',
    build(P, rng, c) {
      const th = rand(4.6, 7.6);
      P.add(G.taper(5), c.bark, [0, th * 0.5, 0], [0, rng() * 3, 0], [0.6, th, 0.6]);
      for (let i = 0; i < randInt(3, 5); i++) {
        const bl = rand(1.8, 3.4);
        const a = rng() * Math.PI * 2;
        const tilt = rand(0.5, 1.15);
        P.add(G.cyl(4), c.bark,
          [Math.cos(a) * Math.sin(tilt) * bl * 0.5, th * rand(0.5, 0.95) + Math.cos(tilt) * bl * 0.5,
            Math.sin(a) * Math.sin(tilt) * bl * 0.5],
          [Math.sin(a) * tilt, 0, -Math.cos(a) * tilt], [0.22, bl, 0.22]);
      }
      return { r: 0.85, h: th };
    },
  },
  cactus: {
    hp: 26, mass: 0.5, r: 0.8, h: 5, tall: true, crush: 4, fall: 'topple',
    build(P, rng, c) {
      const th = rand(3.2, 5.6);
      P.add(G.cyl(7), c.foliage, [0, th * 0.5, 0], [0, rng() * 3, 0], [1.1, th, 1.1]);
      for (const s of [-1, 1]) {
        if (rng() < 0.45) continue;
        const y = th * rand(0.45, 0.7);
        const l = rand(1.0, 1.8);
        P.add(G.cyl(6), c.foliage, [s * l * 0.5, y, 0], [0, 0, Math.PI / 2], [0.7, l, 0.7]);
        P.add(G.cyl(6), c.foliage, [s * l, y + 0.7, 0], [0, 0, 0], [0.7, 1.5, 0.7]);
      }
      return { r: 0.9, h: th };
    },
  },
  rock: {
    hp: 150, mass: 2.6, r: 1.6, h: 2.6, crush: 0, fall: 'shatter',
    build(P, rng, c) {
      const s = rand(1.9, 4.2);
      P.add(G.ico(0), c.rock, [0, s * 0.36, 0], [rng(), rng(), rng()], [s, s * 0.78, s * rand(0.8, 1.2)]);
      if (rng() < 0.6) {
        P.add(G.ico(0), mixHex(c.rock, 0x000000, 0.2),
          [rand(-1, 1) * s * 0.5, s * 0.2, rand(-1, 1) * s * 0.5],
          [rng(), rng(), rng()], s * 0.5);
      }
      return { r: s * 0.55, h: s * 0.8 };
    },
  },
  spire: {
    hp: 240, mass: 3.4, r: 1.8, h: 8, tall: true, fall: 'shatter',
    build(P, rng, c) {
      const h = rand(5.5, 10);
      P.add(G.cone(5), c.rock, [0, h * 0.5, 0], [0, rng() * 3, 0.06], [rand(2.6, 4.2), h, rand(2.6, 4.2)]);
      P.add(G.ico(0), mixHex(c.rock, 0x000000, 0.25), [rand(-1, 1), 0.7, rand(-1, 1)],
        [rng(), rng(), rng()], rand(1.6, 2.6));
      return { r: 1.9, h };
    },
  },
  haybale: {
    hp: 42, mass: 0.55, r: 1.5, h: 2.6, crush: 8, fall: 'fly',
    build(P, rng, c) {
      const stacked = rng() < 0.35;
      P.add(G.cyl(9), c.hay, [0, 1.3, 0], [0, 0, Math.PI / 2], [2.6, 2.8, 2.6]);
      if (stacked) P.add(G.cyl(9), mixHex(c.hay, 0x000000, 0.12), [0, 3.6, 0], [0, 0.4, Math.PI / 2], [2.3, 2.5, 2.3]);
      return { r: 1.7, h: stacked ? 5 : 2.7 };
    },
  },
  fence: {
    hp: 16, mass: 0.3, r: 0.5, h: 1.7, crush: 20, fall: 'shatter', line: true,
    build(P, rng, c) {
      const n = randInt(3, 5);
      const span = 2.6;
      for (let i = 0; i < n; i++) {
        P.add(G.box(), c.wood, [(i - (n - 1) / 2) * span, 0.85, 0], [0, 0, rand(-0.05, 0.05)], [0.24, 1.7, 0.24]);
      }
      for (const y of [0.7, 1.35]) {
        P.add(G.box(), mixHex(c.wood, 0xffffff, 0.08), [0, y, 0], [0, 0, 0], [span * (n - 1) + 0.3, 0.13, 0.13]);
      }
      return { r: 0.6, h: 1.7, spanR: span * (n - 1) * 0.5 };
    },
  },
  log: {
    hp: 55, mass: 0.9, r: 1.0, h: 1.4, crush: 5, fall: 'fly',
    build(P, rng, c) {
      const l = rand(3.4, 6);
      P.add(G.cyl(7), c.bark, [0, 0.7, 0], [0, 0, Math.PI / 2], [1.3, l, 1.3]);
      return { r: 1.1, h: 1.4 };
    },
  },
  drum: {
    hp: 14, mass: 0.4, r: 0.8, h: 1.7, crush: 12, fall: 'explode',
    explosive: { dmg: 62, radius: 9.5, craterR: 5, craterD: 1.1, fuse: 0.12 },
    build(P, rng, c) {
      const stack = rng() < 0.4 ? 2 : 1;
      for (let i = 0; i < stack; i++) {
        const tint = rng() < 0.5 ? c.rust : c.red;
        P.add(G.cyl(9), tint, [rand(-0.1, 0.1), 0.85 + i * 1.72, rand(-0.1, 0.1)],
          [0, rng() * 3, 0], [1.5, 1.7, 1.5]);
        P.add(G.cyl(9), mixHex(tint, 0xffe066, 0.45), [0, 1.3 + i * 1.72, 0], [0, 0, 0], [1.56, 0.18, 1.56]);
      }
      return { r: 0.9, h: 1.7 * stack };
    },
  },
  crate: {
    hp: 40, mass: 0.6, r: 1.1, h: 2.0, crush: 9, fall: 'fly',
    build(P, rng, c) {
      const s = rand(1.6, 2.3);
      P.add(G.box(), c.wood, [0, s * 0.5, 0], [0, rng(), 0], [s, s, s]);
      P.add(G.box(), mixHex(c.wood, 0x000000, 0.3), [0, s * 0.5, 0], [0, rng(), 0], [s * 1.02, s * 0.16, s * 1.02]);
      return { r: s * 0.62, h: s };
    },
  },
  container: {
    hp: 120, mass: 2.2, r: 2.6, h: 3.2, crush: 0, fall: 'fly',
    build(P, rng, c) {
      const l = rand(6, 8.5);
      const tint = [0x2f6a7a, 0x7a3a2a, 0x6a6a3a, 0x3a4a6a][randInt(0, 3)];
      P.add(G.box(), tint, [0, 1.6, 0], [0, 0, 0], [l, 3.2, 3.0]);
      for (let i = 0; i < 6; i++) {
        P.add(G.box(), mixHex(tint, 0x000000, 0.22), [(i - 2.5) * l / 6, 1.6, 1.52], [0, 0, 0], [0.18, 3.0, 0.1]);
      }
      const stack = rng() < 0.3;
      if (stack) P.add(G.box(), mixHex(tint, 0xffffff, 0.15), [0, 4.9, 0], [0, 0.1, 0], [l * 0.9, 3.0, 2.9]);
      return { r: Math.max(2.4, l * 0.42), h: stack ? 6.5 : 3.3 };
    },
  },
  wall: {
    hp: 210, mass: 3.0, r: 2.4, h: 4.0, tall: true, fall: 'shatter',
    build(P, rng, c) {
      const l = rand(5, 9);
      const h = rand(3, 4.6);
      P.add(G.box(), c.concrete, [0, h * 0.5, 0], [0, 0, 0], [l, h, 0.9]);
      P.add(G.box(), mixHex(c.concrete, 0x000000, 0.25), [0, h, 0], [0, 0, 0], [l * 1.02, 0.3, 1.2]);
      if (rng() < 0.5) P.add(G.box(), c.rust, [rand(-1, 1) * l * 0.3, h * 0.55, 0.5], [0, 0, rand(-0.3, 0.3)], [1.2, 0.5, 0.2]);
      return { r: Math.max(2.0, l * 0.4), h };
    },
  },
  ruin: {
    hp: 170, mass: 2.6, r: 2.6, h: 3.6, tall: true, fall: 'shatter',
    build(P, rng, c) {
      const n = randInt(2, 4);
      let maxH = 0;
      for (let i = 0; i < n; i++) {
        const h = rand(1.6, 4.2);
        maxH = Math.max(maxH, h);
        P.add(G.box(), mixHex(c.concrete, c.dark, rand(0, 0.35)),
          [rand(-2.2, 2.2), h * 0.5, rand(-1.6, 1.6)], [0, rand(0, 3), rand(-0.08, 0.08)],
          [rand(1.6, 3.4), h, rand(0.7, 1.2)]);
      }
      P.add(G.box(), mixHex(c.concrete, 0x000000, 0.4), [0, 0.14, 0], [0, rand(0, 3), 0], [rand(4, 6), 0.28, rand(3, 5)]);
      return { r: 2.6, h: maxH };
    },
  },
  silo: {
    hp: 320, mass: 4.0, r: 2.8, h: 13, tall: true, fall: 'collapse',
    explosive: { dmg: 40, radius: 12, craterR: 6, craterD: 1.2, fuse: 0.5 },
    build(P, rng, c) {
      const h = rand(9, 15);
      P.add(G.cyl(12), mixHex(c.metal, 0xffffff, 0.25), [0, h * 0.5, 0], [0, 0, 0], [5.4, h, 5.4]);
      for (let i = 1; i < 4; i++) {
        P.add(G.cyl(12), mixHex(c.metal, 0x000000, 0.2), [0, h * (i / 4), 0], [0, 0, 0], [5.5, 0.22, 5.5]);
      }
      P.add(G.cone(12), c.rust, [0, h + 1.1, 0], [0, 0, 0], [5.6, 2.4, 5.6]);
      P.add(G.box(), c.dark, [0, 1.2, 2.75], [0, 0, 0], [1.4, 2.4, 0.2]);
      return { r: 2.9, h: h + 2 };
    },
  },
  shack: {
    hp: 190, mass: 2.8, r: 3.0, h: 4.4, tall: true, fall: 'shatter',
    build(P, rng, c) {
      const w = rand(4.5, 7), d = rand(4, 6), h = rand(2.6, 3.6);
      P.add(G.box(), c.wood, [0, h * 0.5, 0], [0, 0, 0], [w, h, d]);
      P.add(G.box(), mixHex(c.metal, c.rust, 0.5), [0, h + 0.5, 0], [0.16, 0, 0], [w * 1.15, 0.22, d * 0.62]);
      P.add(G.box(), mixHex(c.metal, c.rust, 0.5), [0, h + 0.5, 0], [-0.16, 0, 0], [w * 1.15, 0.22, d * 0.62]);
      P.add(G.box(), c.dark, [0, h * 0.42, d * 0.51], [0, 0, 0], [1.2, h * 0.8, 0.14]);
      if (rng() < 0.6) P.add(G.box(), mixHex(c.wood, 0xffe066, 0.4), [w * 0.28, h * 0.6, d * 0.51], [0, 0, 0], [0.9, 0.8, 0.1]);
      return { r: Math.max(w, d) * 0.42, h: h + 1 };
    },
  },
  hut: {
    hp: 200, mass: 2.8, r: 3.0, h: 5.0, tall: true, fall: 'shatter',
    build(P, rng, c) {
      const w = rand(4.5, 6.5);
      P.add(G.box(), c.wood, [0, 1.5, 0], [0, 0, 0], [w, 3, w * 0.85]);
      P.add(G.cone(4), mixHex(c.concrete, c.snow, 0.55), [0, 4.1, 0], [0, Math.PI / 4, 0], [w * 1.25, 2.4, w * 1.1]);
      P.add(G.box(), c.dark, [0, 1.2, w * 0.44], [0, 0, 0], [1.2, 2.2, 0.14]);
      P.add(G.cyl(6), c.rock, [w * 0.3, 4.2, -w * 0.2], [0, 0, 0], [0.7, 2.6, 0.7]);
      return { r: w * 0.5, h: 5.6 };
    },
  },
  wagon: {
    hp: 85, mass: 1.1, r: 2.6, h: 3.2, crush: 3, fall: 'fly',
    build(P, rng, c) {
      P.add(G.box(), c.wood, [0, 1.35, 0], [0, 0, 0], [6.4, 0.4, 2.8]);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        P.add(G.cyl(9), mixHex(c.wood, 0x000000, 0.3), [sx * 2.3, 0.85, sz * 1.5], [0, 0, Math.PI / 2], [1.7, 0.26, 1.7]);
      }
      P.add(G.cyl(9), c.hay, [0, 2.5, 0], [0, 0, Math.PI / 2], [2.2, 3.4, 2.2]);
      return { r: 2.5, h: 3.4 };
    },
  },
  pylon: {
    hp: 130, mass: 1.6, r: 1.4, h: 13, tall: true, fall: 'topple',
    build(P, rng, c) {
      const h = rand(10, 16);
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        P.add(G.box(), c.metal, [sx * 1.15, h * 0.5, sz * 1.15], [sz * 0.075, 0, -sx * 0.075], [0.22, h, 0.22]);
      }
      for (let i = 1; i <= 4; i++) {
        const y = h * (i / 5);
        const s = 2.3 * (1 - i * 0.06);
        P.add(G.box(), c.metal, [0, y, 0], [0, 0, 0], [s, 0.14, 0.14]);
        P.add(G.box(), c.metal, [0, y, 0], [0, 0, 0], [0.14, 0.14, s]);
      }
      P.add(G.box(), mixHex(c.metal, 0xffffff, 0.2), [0, h + 0.3, 0], [0, 0, 0], [3.4, 0.2, 0.2]);
      P.add(G.ico(0), 0xff4a3a, [0, h + 0.9, 0], [0, 0, 0], 0.5);
      return { r: 1.5, h };
    },
  },
  wreck: {
    hp: 240, mass: 3.2, r: 2.2, h: 2.4, fall: 'shatter',
    build(P, rng, c) {
      const burnt = mixHex(c.metal, 0x1a1614, 0.55);
      P.add(G.box(), burnt, [0, 0.85, 0], [0, 0, rand(-0.1, 0.1)], [3.0, 0.9, 4.4]);
      P.add(G.box(), burnt, [rand(-0.4, 0.4), 1.7, rand(-0.5, 0.5)], [0, rand(0, 3), 0], [1.9, 0.8, 2.0]);
      P.add(G.cyl(6), burnt, [rand(-0.6, 0.6), 1.9, -2.4], [rand(-0.3, 0.3), 0, Math.PI / 2 + rand(-0.2, 0.2)], [0.24, 3.0, 0.24]);
      for (const s of [-1, 1]) {
        P.add(G.box(), mixHex(burnt, 0x000000, 0.3), [s * 1.6, 0.5, 0], [0, 0, 0], [0.7, 1.0, 4.6]);
      }
      return { r: 2.2, h: 2.6 };
    },
  },
  bunker: {
    hp: 420, mass: 5, r: 3.6, h: 3.4, tall: true, fall: 'shatter',
    build(P, rng, c) {
      P.add(G.box(), c.concrete, [0, 1.5, 0], [0, 0, 0], [8, 3, 6]);
      P.add(G.box(), mixHex(c.concrete, 0x000000, 0.3), [0, 3.2, 0], [0, 0, 0], [8.6, 0.5, 6.6]);
      P.add(G.box(), 0x14100e, [0, 2.0, 3.05], [0, 0, 0], [5.4, 0.7, 0.2]);
      return { r: 3.6, h: 3.7 };
    },
  },
  tower: {   // decor only
    hp: 999, mass: 9, r: 2, h: 22, tall: true, fall: 'shatter',
    build(P, rng, c) {
      const h = rand(16, 28);
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        P.add(G.box(), c.metal, [sx * 1.8, h * 0.5, sz * 1.8], [sz * 0.09, 0, -sx * 0.09], [0.32, h, 0.32]);
      }
      for (let i = 1; i <= 6; i++) {
        P.add(G.box(), c.metal, [0, h * (i / 7), 0], [0, 0, 0], [3.6, 0.2, 0.2]);
        P.add(G.box(), c.metal, [0, h * (i / 7), 0], [0, 0, 0], [0.2, 0.2, 3.6]);
      }
      P.add(G.cyl(8), c.rust, [0, h + 1.4, 0], [0, 0, 0], [4.4, 2.6, 4.4]);
      return { r: 2.4, h: h + 3 };
    },
  },
};

// ---------------------------------------------------------------------------
// Building a field
// ---------------------------------------------------------------------------

function weightedPick(rng, weights) {
  let total = 0;
  for (const k in weights) total += weights[k];
  let r = rng() * total;
  for (const k in weights) {
    r -= weights[k];
    if (r <= 0) return k;
  }
  return Object.keys(weights)[0];
}

function tryPlace(rng, minR, maxR, gap, avoid, placed) {
  for (let attempt = 0; attempt < 44; attempt++) {
    const a = rng() * Math.PI * 2;
    const r = minR + Math.sqrt(rng()) * (maxR - minR);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    let ok = true;
    for (const p of placed) {
      if (Math.hypot(p.x - x, p.z - z) < gap) { ok = false; break; }
    }
    if (ok && avoid) {
      for (const a2 of avoid) {
        if (Math.hypot(a2.x - x, a2.z - z) < (a2.r || 12)) { ok = false; break; }
      }
    }
    if (ok) return { x, z };
  }
  return null;
}

export function buildProps(seed, biome, { avoid = [], density = 1, extra = null } = {}) {
  clearProps();
  const rng = mulberry32(seed ^ 0x5eed10);
  const pal = paletteFor(biome);
  rootGroup = new THREE.Group();
  rootGroup.name = 'props';
  fieldRoot.add(rootGroup);

  const placed = [];
  const wanted = Math.round(58 * density);
  const weights = { ...biome.props };
  if (extra) for (const k in extra) weights[k] = (weights[k] || 0) + extra[k];

  for (let i = 0; i < wanted; i++) {
    const kind = weightedPick(rng, weights);
    const def = DEFS[kind];
    if (!def) continue;
    const gap = def.tall ? 11 : 8;
    const spot = tryPlace(rng, 10, FIELD_R - 8, gap, avoid, placed);
    if (!spot) continue;
    placed.push(spot);
    addProp(kind, spot.x, spot.z, rng, pal);
  }

  buildDecor(seed, biome, pal, rng);
  rebuildObstacles();
  return props;
}

export function addProp(kind, x, z, rng = Math.random, pal = null, opts = {}) {
  const def = DEFS[kind];
  if (!def) return null;
  const c = pal || paletteFor({ id: 'farmland' });
  const P = new Parts();
  const info = def.build(P, rng, c) || {};
  const mesh = P.mesh(solidMat);
  if (!mesh) return null;
  // the small stuff skips the shadow pass — it is half the draw calls and you
  // cannot see the difference at a fence post
  if (def.mass < 0.6) mesh.castShadow = false;

  const grp = new THREE.Group();
  grp.add(mesh);
  const y = terrainHeight(x, z);
  grp.position.set(x, y, z);
  grp.rotation.y = (rng() || Math.random()) * Math.PI * 2;
  (rootGroup || fieldRoot).add(grp);

  const hpMul = opts.hpMul || 1;
  const p = {
    kind, grp, mesh, x, z,
    r: (info.r != null ? info.r : def.r),
    h: (info.h != null ? info.h : def.h),
    hp: def.hp * hpMul, maxHp: def.hp * hpMul,
    mass: def.mass, tall: !!def.tall, crush: def.crush || 0,
    fall: def.fall, explosive: def.explosive || null,
    alive: true, state: 'alive', blocks: true,
    fuse: 0, fadeT: 0, ttl: 0,
    vel: null, spin: null, tipAxis: null, tipT: 0, tipDur: 1,
    objective: !!opts.objective, label: opts.label || null,
    hpBar: !!opts.objective,
  };
  props.push(p);
  return p;
}

// Background scenery is static and indestructible, so the whole skyline is
// baked into a single geometry — one draw call instead of thirty.
function buildDecor(seed, biome, pal, rng) {
  const d = biome.decor;
  if (!d) return;
  const def = DEFS[d.kind];
  if (!def) return;
  decorGroup = new THREE.Group();
  decorGroup.name = 'decor';
  fieldRoot.add(decorGroup);

  const geos = [];
  for (let i = 0; i < d.count; i++) {
    const a = rng() * Math.PI * 2;
    const r = FIELD_R + 8 + rng() * 68;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const P = new Parts();
    def.build(P, rng, pal);
    const g = P.merge();
    if (!g) continue;
    const s = 1 + rng() * 1.4;
    g.scale(s, s, s);
    g.rotateY(rng() * Math.PI * 2);
    g.translate(x, terrainHeight(x, z), z);
    geos.push(g);
  }
  if (!geos.length) return;
  const merged = mergeGeometries(geos, false);
  for (const g of geos) g.dispose();
  if (!merged) return;
  const mesh = new THREE.Mesh(merged, solidMat);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  decorGroup.add(mesh);

  if (biome.ember) buildVents(rng);
}

// Glowing fissures for the cinder flats: flat additive patches laid on the
// ground, merged into one mesh. They are what makes the night boss readable.
function buildVents(rng) {
  const geos = [];
  const disc = new THREE.CircleGeometry(1, 10).toNonIndexed();
  disc.rotateX(-Math.PI / 2);
  for (let i = 0; i < 30; i++) {
    const a = rng() * Math.PI * 2;
    const r = 14 + Math.sqrt(rng()) * (FIELD_R * 1.3);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const g = disc.clone();
    const s = 1.6 + rng() * 5.5;
    g.scale(s, 1, s * (0.4 + rng() * 0.8));
    g.rotateY(rng() * Math.PI);
    g.translate(x, terrainHeight(x, z) + 0.14, z);
    geos.push(g);
  }
  disc.dispose();
  const merged = mergeGeometries(geos, false);
  for (const g of geos) g.dispose();
  if (!merged) return;
  const mesh = new THREE.Mesh(merged, new THREE.MeshBasicMaterial({
    color: 0xff6a1e, transparent: true, opacity: 0.5, depthWrite: false,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  }));
  mesh.renderOrder = -1;
  decorGroup.add(mesh);
}

export function rebuildObstacles() {
  obstacles.length = 0;
  for (const p of props) {
    if (p.alive && p.blocks) obstacles.push(p);
  }
}

export function clearProps() {
  for (const p of props) {
    if (p.grp.parent) p.grp.parent.remove(p.grp);
    p.mesh.geometry.dispose();
  }
  props.length = 0;
  obstacles.length = 0;
  flyingCount = 0;
  if (rootGroup) { fieldRoot.remove(rootGroup); rootGroup = null; }
  if (decorGroup) {
    decorGroup.traverse((n) => { if (n.geometry) n.geometry.dispose(); });
    fieldRoot.remove(decorGroup);
    decorGroup = null;
  }
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

// First live prop whose footprint contains this point at this height.
export function propAt(x, y, z, pad = 0) {
  for (const p of props) {
    if (!p.alive || !p.blocks) continue;
    const dx = x - p.grp.position.x, dz = z - p.grp.position.z;
    const rr = p.r + pad;
    if (dx * dx + dz * dz > rr * rr) continue;
    if (y > p.grp.position.y + p.h) continue;
    return p;
  }
  return null;
}

// Does live scenery block the sight/fire line? Height-aware, so shooting over
// a low wall works and shooting through a silo does not.
export function propsBlockLine(ax, ay, az, bx, by, bz) {
  const len = Math.hypot(bx - ax, bz - az) || 1e-4;
  for (const p of props) {
    if (!p.alive || !p.blocks || !p.tall) continue;
    const px = p.grp.position.x, pz = p.grp.position.z;
    if (!segHitsCircle(ax, az, bx, bz, px, pz, p.r + 0.4)) continue;
    // height of the line where it passes closest to the prop centre
    const t = clamp01(((px - ax) * (bx - ax) + (pz - az) * (bz - az)) / (len * len));
    const y = lerp(ay, by, t);
    if (y < p.grp.position.y + p.h) return p;
  }
  return null;
}

export function countAlive(kind) {
  let n = 0;
  for (const p of props) if (p.alive && (!kind || p.kind === kind)) n++;
  return n;
}

export function objectiveProps() {
  return props.filter((p) => p.objective);
}

// ---------------------------------------------------------------------------
// Damage
// ---------------------------------------------------------------------------

export function damageProp(p, dmg, fromPos, impulse = 0, byPlayer = false) {
  if (!p || !p.alive) return false;
  p.hp -= dmg;
  p.lastHitBy = byPlayer;
  if (p.hp > 0) {
    // visible chip: shake, splinters
    const pos = _v.copy(p.grp.position);
    pos.y += p.h * 0.45;
    spawnDebris(pos, 2, 0.5);
    if (p.explosive && Math.random() < 0.35) spawnSparks(pos, 3, null, 0.6);
    return false;
  }
  killProp(p, fromPos, impulse, byPlayer);
  return true;
}

export function killProp(p, fromPos, impulse = 0, byPlayer = false) {
  if (!p.alive) return;
  p.alive = false;
  p.blocks = false;
  const pos = p.grp.position;
  const cx = fromPos ? pos.x - fromPos.x : rand(-1, 1);
  const cz = fromPos ? pos.z - fromPos.z : rand(-1, 1);
  const len = Math.hypot(cx, cz) || 1;
  const dirX = cx / len, dirZ = cz / len;

  emit('prop-killed', { prop: p, byPlayer });

  const mode = p.fall;
  const thrown = impulse > p.mass * 26 && flyingCount < MAX_FLYING &&
                 mode !== 'explode' && mode !== 'collapse';

  if (mode === 'explode') {
    p.state = 'fusing';
    p.fuse = p.explosive.fuse;
    return;
  }
  if (thrown || mode === 'fly') {
    p.state = 'flying';
    p.countedFlying = true;
    flyingCount++;
    const power = clamp(impulse / (p.mass * 22), 0.6, 5.5);
    p.vel = new THREE.Vector3(dirX * rand(6, 12) * power, rand(9, 17) * power, dirZ * rand(6, 12) * power);
    p.spin = new THREE.Vector3(rand(-5, 5), rand(-4, 4), rand(-5, 5));
    p.ttl = rand(3.2, 5);
    spawnDebris(_v2.copy(pos).setY(pos.y + p.h * 0.4), 4, 0.8);
    AudioFX.clang(volAt(pos) * 0.5);
    return;
  }
  if (mode === 'topple') {
    p.state = 'toppling';
    p.tipAxis = new THREE.Vector3(dirZ, 0, -dirX).normalize();
    p.tipT = 0;
    p.tipDur = 0.55 + p.mass * 0.35;
    p.ttl = 7;
    spawnDebris(_v2.copy(pos).setY(pos.y + 0.6), 4, 0.7);
    return;
  }
  if (mode === 'collapse') {
    p.state = 'collapsing';
    p.tipT = 0;
    p.tipDur = 1.1;
    p.ttl = 5;
    if (p.explosive) {
      p.fuse = p.explosive.fuse;
      p.state = 'fusing';
    }
    return;
  }
  // shatter
  p.state = 'dead';
  shatter(p);
}

function shatter(p) {
  const pos = p.grp.position;
  const n = clamp(Math.round(4 + p.mass * 3), 4, 14);
  spawnDebris(_v.copy(pos).setY(pos.y + p.h * 0.4), n, 0.8 + p.mass * 0.2);
  spawnSmoke(_v.copy(pos).setY(pos.y + p.h * 0.3), {
    scale: 1.4 + p.mass * 0.4, life: 1.5, colour: 0x8a8478, rise: 2.4, opacity: 0.45,
  });
  AudioFX.boom(false, volAt(pos) * 0.6);
  p.grp.visible = false;
  rebuildObstacles();
}

// Splash: damage every prop in radius, with impulse falling off from the centre.
export function damagePropsInRadius(pos, radius, dmg, impulseScale = 1, byPlayer = false) {
  let killed = 0;
  for (let i = props.length - 1; i >= 0; i--) {
    const p = props[i];
    if (!p.alive) continue;
    const d = Math.hypot(p.grp.position.x - pos.x, p.grp.position.z - pos.z);
    if (d > radius + p.r) continue;
    const k = clamp01(1 - (d - p.r) / Math.max(0.001, radius));
    const applied = dmg * (0.45 + 0.55 * k);
    if (damageProp(p, applied, pos, applied * impulseScale, byPlayer)) killed++;
  }
  if (killed) rebuildObstacles();
  return killed;
}

// ---------------------------------------------------------------------------
// Per-frame: fuses, flight, toppling, fade-out
// ---------------------------------------------------------------------------

const _up = new THREE.Vector3(0, 1, 0);

export function updateProps(dt) {
  let obstaclesDirty = false;

  for (let i = props.length - 1; i >= 0; i--) {
    const p = props[i];

    if (p.state === 'fusing') {
      p.fuse -= dt;
      if (p.fuse <= 0) {
        const e = p.explosive;
        const pos = _v.copy(p.grp.position).setY(p.grp.position.y + p.h * 0.4);
        spawnExplosion(pos, {
          scale: 1.5 + p.mass * 0.2, colour: 0xffa030,
          craterR: e.craterR, craterD: e.craterD,
        });
        emit('chain-blast', {
          pos: pos.clone(), radius: e.radius, dmg: e.dmg,
          byPlayer: !!p.lastHitBy, source: p,
        });
        p.grp.visible = false;
        p.state = 'dead';
        obstaclesDirty = true;
      }
      continue;
    }

    if (p.state === 'flying') {
      p.vel.y -= 24 * dt;
      p.grp.position.addScaledVector(p.vel, dt);
      p.grp.rotation.x += p.spin.x * dt;
      p.grp.rotation.y += p.spin.y * dt;
      p.grp.rotation.z += p.spin.z * dt;
      const gh = terrainHeight(p.grp.position.x, p.grp.position.z);
      if (p.grp.position.y < gh) {
        p.grp.position.y = gh;
        if (Math.abs(p.vel.y) > 4) {
          p.vel.y *= -0.3;
          p.vel.x *= 0.55;
          p.vel.z *= 0.55;
          p.spin.multiplyScalar(0.5);
          spawnDebris(p.grp.position, 2, 0.5);
        } else {
          p.vel.set(0, 0, 0);
          p.spin.multiplyScalar(0);
          p.state = 'settling';
          if (p.countedFlying) { flyingCount--; p.countedFlying = false; }
        }
      }
      p.ttl -= dt;
      if (p.ttl <= 0) { p.state = 'fading'; p.fadeT = 1.2; }
      continue;
    }

    if (p.state === 'settling') {
      p.ttl -= dt;
      if (p.ttl <= 0) { p.state = 'fading'; p.fadeT = 1.4; }
      continue;
    }

    if (p.state === 'toppling') {
      p.tipT += dt / p.tipDur;
      const k = clamp01(p.tipT);
      // ease out, overshoot slightly, then settle flat
      const ang = (Math.PI / 2) * (1 - Math.pow(1 - k, 2.2)) * 1.02;
      p.grp.quaternion.setFromAxisAngle(p.tipAxis, Math.min(ang, Math.PI / 2));
      if (p.tipT >= 1) {
        p.state = 'settling';
        p.ttl = 6;
        const pos = p.grp.position;
        spawnDebris(_v.copy(pos).setY(pos.y + 0.4), 5, 0.9);
        spawnSmoke(_v.copy(pos).setY(pos.y + 0.5), {
          scale: 1.6, life: 1.2, colour: 0xa89878, rise: 1.6, opacity: 0.3,
        });
        AudioFX.boom(false, volAt(pos) * 0.45);
      }
      continue;
    }

    if (p.state === 'collapsing') {
      p.tipT += dt / p.tipDur;
      const k = clamp01(p.tipT);
      p.grp.scale.y = 1 - k * 0.92;
      p.grp.position.y = terrainHeight(p.x, p.z);
      if (p.tipT >= 1) {
        p.state = 'settling';
        p.ttl = 5;
        shatterQuiet(p);
      }
      continue;
    }

    if (p.state === 'fading') {
      p.fadeT -= dt;
      const k = clamp01(p.fadeT / 1.4);
      p.grp.scale.setScalar(Math.max(0.01, k));
      p.grp.position.y -= dt * 1.4;
      if (p.fadeT <= 0) {
        if (p.grp.parent) p.grp.parent.remove(p.grp);
        p.mesh.geometry.dispose();
        props.splice(i, 1);
        if (p.countedFlying) { flyingCount--; p.countedFlying = false; }
      }
    }
  }

  if (obstaclesDirty) rebuildObstacles();
}

function shatterQuiet(p) {
  const pos = p.grp.position;
  spawnDebris(_v.copy(pos).setY(pos.y + 1), 8, 1.2);
  for (let i = 0; i < 3; i++) {
    spawnSmoke(_v.copy(pos).setY(pos.y + 1 + i), {
      scale: 2.4, life: 2.2, colour: 0x9a9084, rise: 2.2, opacity: 0.4,
    });
  }
  AudioFX.boom(true, volAt(pos) * 0.8);
}

// Tanks bulldozing light scenery.
export function crushCheck(x, z, radius, speed, byPlayer) {
  if (speed < 6) return;
  for (const p of props) {
    if (!p.alive || !p.crush) continue;
    const dx = p.grp.position.x - x, dz = p.grp.position.z - z;
    if (dx * dx + dz * dz > (radius + p.r) * (radius + p.r)) continue;
    damageProp(p, p.crush * (speed / 12), { x, z, y: p.grp.position.y },
      speed * 3 * p.crush * 0.2, byPlayer);
  }
}

export const PROP_KINDS = Object.keys(DEFS);
export { DEFS as PROP_DEFS, paletteFor };
