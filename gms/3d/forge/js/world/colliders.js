// Ray targets for the camera arm, rebuilt from the scene document rather than from geometry:
// a merged district is one 60k-triangle mesh and raycasting it every frame is not affordable.
// One oriented box per object is exact enough for a camera and costs a slab test each.

import { TYPES, tall } from '../editor/scene.js';
import { BRIDGE, KERB } from '../editor/build.js';
import { heightAt, waterY } from './terrain.js';

const PAD_BY_TYPE = { tower: 0.22, wallRun: 0.22, house: 0.38, mass: 0.38 };

export class Colliders {
  constructor(terrain) {
    this.terrain = terrain;
    this.boxes = [];
    this.extra = [];
    this.skip = 0;
    this.count = -1;
  }

  rebuild(doc) {
    this.boxes.length = 0;
    for (const o of doc.objects) {
      const [hw, hd] = TYPES[o.type].plan(o.p);
      const pad = PAD_BY_TYPE[o.type] ?? 0.2;
      const r = this.terrain.range(o.x, o.z, hw, hd, o.ry);
      const b = {
        id: o.id, x: o.x, z: o.z, hw: hw + pad, hd: hd + pad,
        c: Math.cos(o.ry), s: Math.sin(o.ry),
        y0: r.lo - 1.5, y1: r.hi + tall(o),
      };
      b.cy = (b.y0 + b.y1) / 2;
      b.rad = Math.hypot(b.hw, b.hd, (b.y1 - b.y0) / 2);
      this.boxes.push(b);
    }
    this.count = doc.objects.length;
    this.rebuildWalk(doc);
  }

  rebuildWalk(doc) {
    const boxes = [];
    const put = (x, z, hw, hd, ry, base, top, rise) =>
      boxes.push({ x, z, hw, hd, c: Math.cos(ry), s: Math.sin(ry), base, top, rise });

    for (const o of doc.objects) {
      const [hw, hd] = TYPES[o.type].plan(o.p);
      const r = this.terrain.range(o.x, o.z, hw, hd, o.ry);
      put(o.x, o.z, hw + 0.18, hd + 0.18, o.ry, r.lo - 2, r.hi + tall(o), 0);
    }

    for (const d of doc.districts) {
      if (d.bridge) {
        const { x, z, halfSpan, ry = 0 } = d.bridge;
        const deck = waterY(x) + (d.bridge.deck || BRIDGE.deck) + BRIDGE.trimTop;
        const half = halfSpan + BRIDGE.overhang + 0.3;
        put(x, z, BRIDGE.w / 2 - 0.9, half, ry, deck - 1.125, deck, WALK.stepUp);
        for (const s of [-1, 1]) {
          const o = s * BRIDGE.parapetX();
          put(x + o * Math.cos(ry), z - o * Math.sin(ry), BRIDGE.parapetT / 2 + 0.15, half, ry, deck - 0.3, deck + 1.155, 0);
        }
      }
      // A kerb is a retaining wall with a flight of steps cut into it, so it stays walkable well
      // past the general step-up; without that the road is fenced off from every front door.
      for (const k of d.kerbs) {
        const ry = heightAt(k.x, k.z);
        if (k.top - ry < KERB.minDrop) continue;
        put(k.x, k.z, 0.63, k.len / 2, 0, ry - KERB.sink, k.top + 0.195, 2.25);
      }
    }

    W = { terrain: this.terrain, ...index(boxes), boxes };
  }

  // A slab test per box. Returns the distance to the nearest surface along `dir` within `max`,
  // or `max` if nothing is in the way. `pad` is the camera's radius.
  hit(ox, oy, oz, dx, dy, dz, max, pad = 0) {
    let best = max;
    // Terraced houses sit closer together than their padded boxes, so indoors the neighbours'
    // boxes reach through the room you are standing in. Inside, only the room's own walls count.
    if (!this.interiorOnly) {
      for (const b of this.boxes) {
        if (b.id === this.skip) continue;
        // No point in a slab test on a building the arm cannot reach: the segment is at most
        // `max` long, so anything whose bounding sphere is further than that misses. At three
        // towns this is the difference between 550 slab tests a frame and a dozen.
        const rx = b.x - ox, ry = b.cy - oy, rz = b.z - oz;
        const reach = b.rad + pad + best;
        if (rx * rx + ry * ry + rz * rz > reach * reach) continue;
        best = slab(b, ox, oy, oz, dx, dy, dz, best, pad);
      }
    }
    for (const b of this.extra) best = slab(b, ox, oy, oz, dx, dy, dz, best, pad);
    return best;
  }

  inside(id, x, y, z, pad = 0) {
    const b = this.boxes.find(v => v.id === id);
    if (!b) return false;
    const px = x - b.x, pz = z - b.z;
    const lx = px * b.c - pz * b.s, lz = px * b.s + pz * b.c;
    return Math.abs(lx) < b.hw + pad && Math.abs(lz) < b.hd + pad && y > b.y0 - pad && y < b.y1 + pad;
  }
}

// Boxes carry cos/sin of their own yaw, so world→local is the transpose of three's Y rotation.
function slab(b, ox, oy, oz, dx, dy, dz, max, pad) {
  const px = ox - b.x, pz = oz - b.z;
  const lx = px * b.c - pz * b.s, lz = px * b.s + pz * b.c;
  const ux = dx * b.c - dz * b.s, uz = dx * b.s + dz * b.c;
  const cy = (b.y0 + b.y1) / 2, hy = (b.y1 - b.y0) / 2;

  let t0 = 0, t1 = max;
  const axis = (l, u, e) => {
    if (Math.abs(u) < 1e-6) return Math.abs(l) <= e;
    const a = (-e - l) / u, c = (e - l) / u;
    t0 = Math.max(t0, Math.min(a, c));
    t1 = Math.min(t1, Math.max(a, c));
    return t0 <= t1;
  };
  if (!axis(lx, ux, b.hw + pad)) return max;
  if (!axis(oy - cy, dy, hy + pad)) return max;
  if (!axis(lz, uz, b.hd + pad)) return max;
  return t0 < max ? t0 : max;
}

// A thin slab for a room wall, in the frame of the building that owns it.
export function wallBox(cx, cz, hw, hd, y0, y1, cos, sin, ox, oz) {
  return {
    id: 0,
    x: ox + cx * cos + cz * sin,
    z: oz - cx * sin + cz * cos,
    hw, hd, c: cos, s: sin, y0, y1,
  };
}

// ── walkable world ──────────────────────────────────────────────────────────────────────────
// The same footprints again, this time as things you can bump into and stand on. One primitive
// does both: a box with a `top` and a `rise`. `rise` is how far above your feet its top may sit
// and still be walked up onto — 0 means it is a wall, a large value means it carries steps.
// Buildings are solid and have no doorway gap: the door hotspot is the only way in, and a gap
// you could walk through would put you inside an empty shell.

// stepUp 0.93 is 1.5 × the old 0.62 and must stay above the 0.66 house plinth, or every front
// doorstep in the game is unclimbable.
const WALK = { stepUp: 0.93, cell: 12 };
let W = null;

export function setStepUp(v) { WALK.stepUp = v; }
export const collidersReady = () => W !== null;

// Ground height a walker whose feet are at `y` stands at. Terrain unless a platform it can
// reach — a bridge deck, a kerb top — is higher.
export function groundAt(x, z, y) {
  if (!W) return 0;
  let h = W.terrain.surfaceY(x, z);
  for (const b of cellAt(x, z)) {
    if (!b.rise || b.top <= h || b.top > y + b.rise) continue;
    if (!within(b, x, z, 0)) continue;
    h = b.top;
  }
  return h;
}

// Resolved end of a step from (x0,z0) to (x1,z1). Penetration is pushed out along the box's own
// shorter axis, which is what turns a diagonal walk into a slide instead of a dead stop.
export function walkStep(x0, z0, x1, z1, y, radius = 0.34) {
  if (!W) return { x: x1, z: z1, y, hit: false };
  // If the walker was already overlapping something when the step began — spawned there, or
  // dropped there by the editor — the start is not a safe place to fall back to, and reverting
  // to it every frame freezes him for good.
  const startClear = !standing(x0, z0, y);
  let x = x1, z = z1, hit = false;
  for (let iter = 0; iter < 3; iter++) {
    let moved = false;
    for (const b of cellAt(x, z)) {
      if (!blocks(b, y)) continue;
      const px = x - b.x, pz = z - b.z;
      let lx = px * b.c - pz * b.s, lz = px * b.s + pz * b.c;
      const ex = b.hw + radius, ez = b.hd + radius;
      const ox = ex - Math.abs(lx), oz = ez - Math.abs(lz);
      if (ox <= 0 || oz <= 0) continue;
      if (ox < oz) lx = (lx < 0 ? -1 : 1) * ex; else lz = (lz < 0 ? -1 : 1) * ez;
      x = b.x + lx * b.c + lz * b.s;
      z = b.z - lx * b.s + lz * b.c;
      moved = hit = true;
    }
    if (!moved) break;
  }
  // A push-out can land you inside the next box along; if two iterations did not clear it, the
  // start point is the only place known to be legal.
  if (hit && startClear && standing(x, z, y)) { x = x0; z = z0; }
  return { x, z, y: groundAt(x, z, y), hit };
}

function blocks(b, y) {
  if (b.top <= y + 0.05) return false;
  if (b.rise && b.top <= y + b.rise) return false;
  return b.base <= y + 1.9;
}

function standing(x, z, y) {
  for (const b of cellAt(x, z)) if (blocks(b, y) && within(b, x, z, 0.02)) return true;
  return false;
}

function within(b, x, z, pad) {
  const px = x - b.x, pz = z - b.z;
  const lx = px * b.c - pz * b.s, lz = px * b.s + pz * b.c;
  return Math.abs(lx) < b.hw + pad && Math.abs(lz) < b.hd + pad;
}

const NONE = [];

function cellAt(x, z) {
  const i = Math.floor((x - W.x0) / WALK.cell), j = Math.floor((z - W.z0) / WALK.cell);
  if (i < 0 || j < 0 || i >= W.nx || j >= W.nz) return NONE;
  return W.grid[j * W.nx + i] || NONE;
}

// Every box is registered in each cell its AABB touches, so a point query only ever reads one
// cell. Rebuilt with the collider set, which is once at boot and once per editor change.
function index(boxes) {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const b of boxes) {
    const ax = Math.abs(b.c) * b.hw + Math.abs(b.s) * b.hd;
    const az = Math.abs(b.s) * b.hw + Math.abs(b.c) * b.hd;
    b.ax = ax + 1; b.az = az + 1;
    x0 = Math.min(x0, b.x - b.ax); x1 = Math.max(x1, b.x + b.ax);
    z0 = Math.min(z0, b.z - b.az); z1 = Math.max(z1, b.z + b.az);
  }
  if (!boxes.length) { x0 = z0 = 0; x1 = z1 = 1; }
  const nx = Math.max(1, Math.ceil((x1 - x0) / WALK.cell));
  const nz = Math.max(1, Math.ceil((z1 - z0) / WALK.cell));
  const grid = new Array(nx * nz);
  for (const b of boxes) {
    const i0 = Math.max(0, Math.floor((b.x - b.ax - x0) / WALK.cell));
    const i1 = Math.min(nx - 1, Math.floor((b.x + b.ax - x0) / WALK.cell));
    const j0 = Math.max(0, Math.floor((b.z - b.az - z0) / WALK.cell));
    const j1 = Math.min(nz - 1, Math.floor((b.z + b.az - z0) / WALK.cell));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const k = j * nx + i;
        (grid[k] || (grid[k] = [])).push(b);
      }
    }
  }
  return { x0, z0, nx, nz, grid };
}
