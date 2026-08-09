/**
 * A test double for the sim's world API, used only by `game/spell-test.html`.
 *
 * `sim/index.js` did not exist while the spells were being written, and a spell
 * you have never watched run is a spell you have not built. This implements the
 * subset of `sim/API.md` the spell module touches — terrain grid, props with a
 * support graph and a break chain, debris, the surface/fluid layer, entities,
 * damage, queries and explode — closely enough that the same spell code runs
 * unchanged against the real sim.
 *
 * It is deliberately simple where the real sim is clever (no chunking, no
 * rubble heightfield, flat arrays instead of pools with generations). If a
 * behaviour here disagrees with `API.md`, API.md is right and this is wrong.
 */

import { LAYER } from '../../gfx/renderer.js';
import { shockwave } from '../fx.js';
import { MATERIAL, MAT, DAMAGE, DAMAGE_NAMES, dmgType, resistOf } from '../../sim/materials.js';
import { STATUS, STATUS_COUNT, statusId } from '../../sim/status.js';

const CELL = 16;
const SCELL = 32;
const GRAV = 3000;
const DT = 1 / 60;

export function createTestWorld(ctx, opts) {
  const o = opts || {};
  const R = ctx.R, P = ctx.P, bus = ctx.bus, rng = ctx.rng;

  const X0 = o.x0 === undefined ? -2400 : o.x0;
  const Y0 = o.y0 === undefined ? -1600 : o.y0;
  const COLS = Math.ceil((o.w === undefined ? 6400 : o.w) / CELL);
  const ROWS = Math.ceil((o.h === undefined ? 2600 : o.h) / CELL);

  const tSolid = new Uint8Array(COLS * ROWS);
  const tMat = new Uint8Array(COLS * ROWS);
  const tHp = new Float32Array(COLS * ROWS);
  const tChar = new Float32Array(COLS * ROWS);

  const world = {
    ctx, R, P, bus, rng, LAYER, input: ctx.input, assets: ctx.assets,
    time: 0, frame: 0, dt: DT,
    player: null, playerControl: true,
    entities: [], props: [], debris: [],
    entityCap: 2048, debrisCap: 900,
    lastHits: [],
    hit: { what: '', entity: null, prop: null, debris: null, x: 0, y: 0, nx: 0, ny: -1, dist: 0, t: 0, material: 0, cellX: 0, cellY: 0 },
    debug: { aabb: false, grid: false, support: false, surfaces: false, rubble: false, player: false },
    stats: { entities: 0, props: 0, debris: 0, surfaceCells: 0 },
    shim: true,
  };

  /* ================================================================ *
   * Terrain
   * ================================================================ */

  const idx = (cx, cy) => cy * COLS + cx;
  const inGrid = (cx, cy) => cx >= 0 && cy >= 0 && cx < COLS && cy < ROWS;

  const terrain = {
    cell: CELL, cols: COLS, rows: ROWS, x0: X0, y0: Y0,
    toCellX: (x) => Math.floor((x - X0) / CELL),
    toCellY: (y) => Math.floor((y - Y0) / CELL),
    worldX: (cx) => X0 + cx * CELL,
    worldY: (cy) => Y0 + cy * CELL,
    solid(cx, cy) { return inGrid(cx, cy) ? tSolid[idx(cx, cy)] === 1 : false; },
    matAt(cx, cy) { return inGrid(cx, cy) ? tMat[idx(cx, cy)] : MATERIAL.ROCK; },

    set(cx, cy, material) {
      if (!inGrid(cx, cy)) return;
      const i = idx(cx, cy);
      tSolid[i] = 1; tMat[i] = material;
      tHp[i] = 22 + MAT[material].hardness * 40;
      tChar[i] = 0;
      dirty = true;
    },
    clearCell(cx, cy) {
      if (!inGrid(cx, cy)) return;
      tSolid[idx(cx, cy)] = 0;
      dirty = true;
    },

    box(x, y, w, h, material) {
      const c0 = terrain.toCellX(x), c1 = terrain.toCellX(x + w);
      const r0 = terrain.toCellY(y), r1 = terrain.toCellY(y + h);
      for (let cy = r0; cy < r1; cy++) for (let cx = c0; cx < c1; cx++) terrain.set(cx, cy, material);
    },
    hill(x0, x1, fn, material) {
      for (let x = x0; x < x1; x += CELL) {
        const top = fn(x);
        const c = terrain.toCellX(x);
        for (let cy = terrain.toCellY(top); cy < ROWS; cy++) terrain.set(c, cy, material);
      }
    },
    platform(x, y, w, h, material) { terrain.box(x, y, w, h, material); },
    circle(x, y, r, material) {
      const c0 = terrain.toCellX(x - r), c1 = terrain.toCellX(x + r);
      const r0 = terrain.toCellY(y - r), r1 = terrain.toCellY(y + r);
      for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) {
        const px = X0 + cx * CELL + CELL * 0.5, py = Y0 + cy * CELL + CELL * 0.5;
        if ((px - x) ** 2 + (py - y) ** 2 <= r * r) terrain.set(cx, cy, material);
      }
    },
    fill(x, y, r, material) { terrain.circle(x, y, r, material); },

    damage(x, y, radius, amount, type, dopts) {
      const t = dmgType(type);
      const c0 = terrain.toCellX(x - radius), c1 = terrain.toCellX(x + radius);
      const r0 = terrain.toCellY(y - radius), r1 = terrain.toCellY(y + radius);
      let destroyed = 0;
      let mat = MATERIAL.EARTH;
      for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) {
        if (!inGrid(cx, cy)) continue;
        const i = idx(cx, cy);
        if (!tSolid[i]) continue;
        const px = X0 + cx * CELL + 8, py = Y0 + cy * CELL + 8;
        const d = Math.hypot(px - x, py - y);
        if (d > radius) continue;
        mat = tMat[i];
        const fall = 1 - d / radius;
        tHp[i] -= amount * fall * resistOf(mat, t);
        if (tHp[i] <= 0) {
          tSolid[i] = 0; destroyed++;
          dirty = true;
          if (rng.next() < 0.25) spawnDebris({ x: px, y: py, vx: rng.range(-160, 160), vy: rng.range(-320, -40), material: mat, w: 10, h: 10 });
        }
      }
      if (destroyed) {
        dustPlume(x, y, radius, mat, destroyed);
        bus.emit('terrain:break', { x, y, radius, material: mat, cells: destroyed, type: DAMAGE_NAMES[t] });
        ctx.audio.sfx(MAT[mat].sfx.break, { x, y });
        needSupport = true;
      }
      return destroyed;
    },

    carve(x, y, radius) {
      const c0 = terrain.toCellX(x - radius), c1 = terrain.toCellX(x + radius);
      const r0 = terrain.toCellY(y - radius), r1 = terrain.toCellY(y + radius);
      for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) {
        if (!inGrid(cx, cy)) continue;
        const px = X0 + cx * CELL + 8, py = Y0 + cy * CELL + 8;
        if (Math.hypot(px - x, py - y) <= radius) { tSolid[idx(cx, cy)] = 0; dirty = true; }
      }
      needSupport = true;
    },

    scorch(x, y, radius, amount) {
      const c0 = terrain.toCellX(x - radius), c1 = terrain.toCellX(x + radius);
      const r0 = terrain.toCellY(y - radius), r1 = terrain.toCellY(y + radius);
      for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) {
        if (!inGrid(cx, cy)) continue;
        const i = idx(cx, cy);
        if (!tSolid[i]) continue;
        const px = X0 + cx * CELL + 8, py = Y0 + cy * CELL + 8;
        const d = Math.hypot(px - x, py - y);
        if (d > radius) continue;
        tChar[i] = Math.min(1, tChar[i] + amount * (1 - d / radius));
        dirty = true;
      }
    },
  };
  world.terrain = terrain;

  let dirty = true;
  let needSupport = false;

  world.solidAt = (x, y) => terrain.solid(terrain.toCellX(x), terrain.toCellY(y));
  world.materialAt = (x, y) => terrain.matAt(terrain.toCellX(x), terrain.toCellY(y));
  world.solidBox = function (x, y, w, h) {
    const c0 = terrain.toCellX(x - w * 0.5), c1 = terrain.toCellX(x + w * 0.5);
    const r0 = terrain.toCellY(y - h * 0.5), r1 = terrain.toCellY(y + h * 0.5);
    for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) if (terrain.solid(cx, cy)) return true;
    return false;
  };
  world.groundY = function (x, fromY, maxDist) {
    const cx = terrain.toCellX(x);
    const start = terrain.toCellY(fromY);
    const end = Math.min(ROWS - 1, terrain.toCellY(fromY + (maxDist === undefined ? 600 : maxDist)));
    for (let cy = Math.max(0, start); cy <= end; cy++) if (terrain.solid(cx, cy)) return Y0 + cy * CELL;
    return NaN;
  };
  world.ceilingY = function (x, fromY, maxDist) {
    const cx = terrain.toCellX(x);
    const start = terrain.toCellY(fromY);
    const end = Math.max(0, terrain.toCellY(fromY - (maxDist === undefined ? 600 : maxDist)));
    for (let cy = start; cy >= end; cy--) if (terrain.solid(cx, cy)) return Y0 + (cy + 1) * CELL;
    return NaN;
  };
  world.lineOfSight = function (x0, y0, x1, y1) {
    const n = Math.max(1, Math.floor(Math.hypot(x1 - x0, y1 - y0) / 12));
    for (let i = 1; i < n; i++) {
      const t = i / n;
      if (world.solidAt(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)) return false;
    }
    return true;
  };

  /* ================================================================ *
   * Props
   * ================================================================ */

  const PROPDEF = {
    wall_brick: { w: 110, h: 150, m: MATERIAL.MASONRY, hp: 200 },
    wall_tall: { w: 90, h: 300, m: MATERIAL.MASONRY, hp: 260 },
    arch_stone: { w: 320, h: 74, m: MATERIAL.MASONRY, hp: 240 },
    pillar_stone: { w: 66, h: 240, m: MATERIAL.ROCK, hp: 280 },
    boulder_big: { w: 130, h: 108, m: MATERIAL.ROCK, hp: 300 },
    boulder_small: { w: 70, h: 56, m: MATERIAL.ROCK, hp: 140 },
    rocks_small: { w: 54, h: 30, m: MATERIAL.ROCK, hp: 60 },
    crate: { w: 60, h: 60, m: MATERIAL.TIMBER, hp: 55 },
    barrel: { w: 52, h: 72, m: MATERIAL.TIMBER, hp: 60 },
    fence: { w: 130, h: 66, m: MATERIAL.TIMBER, hp: 34 },
    stump: { w: 62, h: 46, m: MATERIAL.TIMBER, hp: 80 },
    tree_trunk: { w: 46, h: 250, m: MATERIAL.TIMBER, hp: 130 },
    oak_trunk: { w: 66, h: 320, m: MATERIAL.TIMBER, hp: 190 },
    deadtree: { w: 40, h: 230, m: MATERIAL.TIMBER, hp: 90 },
    tree_foliage: { w: 240, h: 190, m: MATERIAL.FOLIAGE, hp: 60 },
    tree_foliage_b: { w: 190, h: 160, m: MATERIAL.FOLIAGE, hp: 50 },
    tree_small: { w: 120, h: 150, m: MATERIAL.FOLIAGE, hp: 40 },
    bush: { w: 96, h: 62, m: MATERIAL.FOLIAGE, hp: 26 },
    ferns: { w: 80, h: 44, m: MATERIAL.FOLIAGE, hp: 18 },
    lantern: { w: 28, h: 44, m: MATERIAL.GLASS, hp: 10 },
    window_glass: { w: 76, h: 100, m: MATERIAL.GLASS, hp: 14 },
    gate_iron: { w: 116, h: 170, m: MATERIAL.METAL, hp: 320 },
    brazier: { w: 54, h: 76, m: MATERIAL.METAL, hp: 150 },
    skull_pile: { w: 92, h: 56, m: MATERIAL.BONE, hp: 48 },
  };

  world.defineProp = (id, def) => { PROPDEF[id] = def; };

  world.addProp = function (id, x, yBottom, po) {
    const d = PROPDEF[id] || PROPDEF.crate;
    const p2 = po || {};
    const scale = p2.scale || 1;
    const w = (p2.w || d.w) * scale, h = (p2.h || d.h) * scale;
    const p = {
      alive: true, id, x, y: yBottom - h * 0.5, w, h,
      get left() { return this.x - this.w * 0.5; },
      get right() { return this.x + this.w * 0.5; },
      get top() { return this.y - this.h * 0.5; },
      get bottom() { return this.y + this.h * 0.5; },
      material: p2.material === undefined ? d.m : p2.material,
      hp: p2.hp === undefined ? d.hp * scale : p2.hp,
      maxHp: 0, state: 'intact', burn: 0, charred: 0, acid: 0, fuel: 1,
      solid: p2.solid === undefined ? (d.m !== MATERIAL.FOLIAGE) : p2.solid,
      grounded: false, stable: true,
      supports: [], supportedBy: [],
      tint: p2.tint || null, shatterT: 0, falling: 0, vy: 0, rot: 0, vrot: 0,
      onBreak: p2.onBreak || null, data: p2.data || {},
      layer: p2.layer === undefined ? LAYER.TERRAIN_FRONT : p2.layer,
      seed: rng.next(),
    };
    p.maxHp = p.hp;
    if (p2.supportedBy) for (const s of p2.supportedBy) { if (s) { p.supportedBy.push(s); s.supports.push(p); } }
    if (p2.supports) for (const s of p2.supports) { if (s) { s.supportedBy.push(p); p.supports.push(s); } }
    p.forceGrounded = p2.grounded === true;
    p.grounded = p2.grounded !== undefined ? p2.grounded : sampleGrounded(p);
    world.props.push(p);
    needSupport = true;
    return p;
  };

  world.addTree = function (id, x, yBottom) {
    const trunk = world.addProp(id === 'tree_young' ? 'tree_trunk' : 'oak_trunk', x, yBottom);
    const can = world.addProp(id === 'tree_young' ? 'tree_foliage_b' : 'tree_foliage',
      x, trunk.top + 40, { supportedBy: [trunk] });
    return trunk;
  };

  function sampleGrounded(p) {
    for (let x = p.left + 6; x <= p.right - 6; x += 12) if (world.solidAt(x, p.bottom + 6)) return true;
    return false;
  }

  world.propAt = function (x, y) {
    for (const p of world.props) {
      if (!p.alive) continue;
      if (x >= p.left && x <= p.right && y >= p.top && y <= p.bottom) return p;
    }
    return null;
  };
  world.queryProps = function (x, y, r, out) {
    const a = out || [];
    a.length = 0;
    for (const p of world.props) {
      if (!p.alive) continue;
      const dx = Math.max(p.left - x, 0, x - p.right);
      const dy = Math.max(p.top - y, 0, y - p.bottom);
      if (dx * dx + dy * dy <= r * r) a.push(p);
    }
    return a;
  };

  world.damageProp = function (p, amount, type, dopts) {
    if (!p || !p.alive || p.state === 'shattering') return 0;
    const t = dmgType(type);
    const m = MAT[p.material];
    let amt = amount * resistOf(p.material, t);
    if (amt < m.minDamage * 0.4) return 0;
    p.hp -= amt;
    p.hitFlash = 1;
    if (t === DAMAGE.ACID) p.acid = Math.min(0.55, p.acid + amt * 0.006);
    if (dopts && dopts.hitX !== undefined) world.materialFx(p.material, dopts.hitX, dopts.hitY, dopts.dirX, dopts.dirY, 0.5);
    if (p.hp <= 0) world.breakProp(p, DAMAGE_NAMES[t]);
    else {
      const frac = p.hp / p.maxHp;
      p.state = frac < 0.33 ? 'cracked2' : (frac < 0.66 ? 'cracked1' : 'intact');
      if (rng.next() < 0.3) ctx.audio.sfx(m.sfx.crack, { x: p.x, y: p.y });
    }
    return amt;
  };

  world.igniteProp = function (p, strength) {
    if (!p || !p.alive) return;
    if (MAT[p.material].flammable <= 0) return;
    p.burn = Math.max(p.burn, strength);
    world.surfaces.ignite(p.x, p.bottom - p.h * 0.35, Math.max(24, p.w * 0.4), strength);
  };

  world.breakProp = function (p, cause) {
    if (!p || !p.alive || p.state === 'shattering') return;
    p.state = 'shattering';
    p.shatterT = 0.1;
    p.cause = cause;
  };

  world.collapse = function (p, delay) {
    if (!p || !p.alive || p.falling) return;
    p.falling = (delay || 0) + 0.0001;
    p.stable = false;
    bus.emit('prop:collapse', { prop: p, id: p.id, x: p.x, y: p.y });
  };

  /** Never despawns in the real sim; Gravewake needs a prop to simply cease. */
  world.despawnProp = function (p) {
    if (!p || !p.alive) return;
    p.alive = false;
    for (const s of p.supports) { const i = s.supportedBy.indexOf(p); if (i >= 0) s.supportedBy.splice(i, 1); }
    needSupport = true;
  };

  function finishBreak(p) {
    p.alive = false;
    const m = MAT[p.material];
    const n = Math.round(6 + p.w * p.h / 1400);
    world.burstDebris(p.x, p.y, p.material, Math.min(22, n), { speed: 240, speedVar: 220, spread: Math.PI, dir: -Math.PI / 2, size: 0.9 + m.chunk * 0.3 });
    dustPlume(p.x, p.y, Math.max(p.w, p.h) * 0.6, p.material, 8);
    ctx.audio.sfx(m.sfx.break, { x: p.x, y: p.y });
    bus.emit('prop:break', { prop: p, id: p.id, x: p.x, y: p.y, material: p.material, cause: p.cause || 'damage' });
    if (p.onBreak) p.onBreak(p, p.cause);
    for (const s of p.supports) { const i = s.supportedBy.indexOf(p); if (i >= 0) s.supportedBy.splice(i, 1); }
    needSupport = true;
  }

  world.solveSupport = function () {
    const stack = [];
    // grounded is RE-SAMPLED every solve: a prop whose floor was blown out
    // must stop counting as grounded, or nothing above it ever falls.
    for (const p of world.props) {
      if (!p.alive) continue;
      p.stable = false;
      p.grounded = p.forceGrounded || sampleGrounded(p);
      if (p.grounded) { p.stable = true; stack.push(p); }
    }
    while (stack.length) {
      const p = stack.pop();
      for (const s of p.supports) if (s.alive && !s.stable) { s.stable = true; stack.push(s); }
    }
    let n = 0;
    for (const p of world.props) if (p.alive && !p.stable && !p.falling) world.collapse(p, 0.04 * (n++));
  };
  world.supportEdges = function (out) {
    const a = out || [];
    a.length = 0;
    for (const p of world.props) for (const s of p.supports) if (p.alive && s.alive) a.push({ ax: p.x, ay: p.y, bx: s.x, by: s.y, stable: s.stable });
    return a;
  };

  /* ================================================================ *
   * Debris
   * ================================================================ */

  function spawnDebris(d) {
    if (world.debris.length >= world.debrisCap) {
      let oldest = -1;
      for (let i = 0; i < world.debris.length; i++) if (world.debris[i].sleep) { oldest = i; break; }
      if (oldest < 0) return null;
      world.debris.splice(oldest, 1);
    }
    const m = MAT[d.material === undefined ? MATERIAL.ROCK : d.material];
    const b = {
      x: d.x, y: d.y, vx: d.vx || 0, vy: d.vy || 0,
      rot: rng.angle(), vrot: d.spin === undefined ? rng.range(-m.spin, m.spin) : d.spin,
      w: (d.w || rng.range(8, 20)) * (d.scale || 1), h: (d.h || rng.range(6, 16)) * (d.scale || 1),
      material: d.material === undefined ? MATERIAL.ROCK : d.material,
      life: d.life || 0, sleep: 0, still: 0, burning: d.burning || 0,
    };
    world.debris.push(b);
    return b;
  }
  world.spawnDebris = spawnDebris;

  world.burstDebris = function (x, y, material, count, bo) {
    const b = bo || {};
    const speed = b.speed === undefined ? 300 : b.speed;
    const sv = b.speedVar === undefined ? 220 : b.speedVar;
    const spread = b.spread === undefined ? Math.PI : b.spread;
    const dir = b.dir === undefined ? -Math.PI / 2 : b.dir;
    for (let i = 0; i < count; i++) {
      const a = dir + rng.range(-spread, spread);
      const s = speed + rng.range(-sv, sv);
      const sc = (b.size || 1) * (1 + rng.range(-(b.sizeVar || 0.4), b.sizeVar || 0.4));
      spawnDebris({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, material, scale: sc });
    }
  };

  world.shoveDebris = function (x, y, radius, force) {
    for (const b of world.debris) {
      const dx = b.x - x, dy = b.y - y;
      const L = Math.hypot(dx, dy) || 1;
      if (L > radius) continue;
      const f = force * (1 - L / radius);
      b.vx += (dx / L) * f * 0.02;
      b.vy += (dy / L) * f * 0.02 - 20;
      b.sleep = 0; b.still = 0;
    }
  };
  Object.defineProperty(world, 'debrisCount', { get: () => world.debris.length });
  world.clearDebris = () => { world.debris.length = 0; };

  /* ================================================================ *
   * Surfaces / fluids
   * ================================================================ */

  const SCOLS = Math.ceil(COLS * CELL / SCELL);
  const SROWS = Math.ceil(ROWS * CELL / SCELL);

  const kinds = new Map();
  const surfaces = {
    wind: 0,
    kinds,
    define(def) {
      if (kinds.has(def.id)) return kinds.get(def.id);
      const k = {
        id: def.id, color: def.color, color2: def.color2 || [0, 0, 0],
        add: !!def.add, light: def.light || 0, layer: def.layer === undefined ? LAYER.FX : def.layer,
        decay: def.decay || 0, spread: def.spread || 0, flow: def.flow || 0,
        needsFuel: !!def.needsFuel, consumes: def.consumes || 0,
        damage: def.damage || 0, damageType: def.damageType || 'impact',
        status: def.status || null, statusTime: def.statusTime || 0,
        onCell: def.onCell || null,
        amt: new Float32Array(SCOLS * SROWS),
        live: [], cursor: 0,
      };
      kinds.set(def.id, k);
      return k;
    },
    add(id, x, y, amount) {
      const k = kinds.get(id); if (!k) return;
      // Never seed a cell inside solid rock: it can never flow out, so it sits
      // there forever and draws as a bar of colour buried in the ground.
      if (world.solidAt(x, y)) {
        let up = 0;
        while (up < 4 && world.solidAt(x, y - SCELL)) { y -= SCELL; up++; }
        y -= SCELL;
        if (world.solidAt(x, y)) return;
      }
      const cx = Math.floor((x - X0) / SCELL), cy = Math.floor((y - Y0) / SCELL);
      if (cx < 0 || cy < 0 || cx >= SCOLS || cy >= SROWS) return;
      const i = cy * SCOLS + cx;
      if (k.amt[i] <= 0) k.live.push(i);
      k.amt[i] = Math.min(1.0, k.amt[i] + amount);
    },
    pour(id, x, y, amount, radius) {
      const r = radius === undefined ? SCELL : radius;
      const n = Math.max(1, Math.ceil(r / SCELL));
      for (let dy = -n; dy <= n; dy++) for (let dx = -n; dx <= n; dx++) {
        const d = Math.hypot(dx, dy) / (n + 0.001);
        if (d > 1) continue;
        surfaces.add(id, x + dx * SCELL, y + dy * SCELL, amount * (1 - d * 0.7));
      }
    },
    amountAt(id, x, y) {
      const k = kinds.get(id); if (!k) return 0;
      const cx = Math.floor((x - X0) / SCELL), cy = Math.floor((y - Y0) / SCELL);
      if (cx < 0 || cy < 0 || cx >= SCOLS || cy >= SROWS) return 0;
      return k.amt[cy * SCOLS + cx];
    },
    clear(id, x, y, radius) {
      const k = kinds.get(id); if (!k) return;
      const n = Math.ceil(radius / SCELL);
      const cx0 = Math.floor((x - X0) / SCELL), cy0 = Math.floor((y - Y0) / SCELL);
      for (let dy = -n; dy <= n; dy++) for (let dx = -n; dx <= n; dx++) {
        const cx = cx0 + dx, cy = cy0 + dy;
        if (cx < 0 || cy < 0 || cx >= SCOLS || cy >= SROWS) continue;
        if (Math.hypot(dx, dy) > n) continue;
        k.amt[cy * SCOLS + cx] = 0;
      }
    },
    freeze(x, y, radius, seconds) {
      frozen.push({ x, y, r: radius, t: seconds });
    },
    count(id) { const k = kinds.get(id); return k ? k.live.length : 0; },
    ignite(x, y, radius, strength) { surfaces.pour('fire', x, y, strength === undefined ? 0.6 : strength, radius); },
    totalCells() { let n = 0; kinds.forEach((k) => { n += k.live.length; }); return n; },
  };
  world.surfaces = surfaces;
  const frozen = [];

  surfaces.define({ id: 'fire', color: [1.0, 0.66, 0.26], color2: [0.7, 0.14, 0.05], add: true, light: 1, decay: 0.14, spread: 0.55, flow: 0, needsFuel: true, consumes: 1.6, damage: 26, damageType: 'fire', status: 'burn', statusTime: 2 });
  surfaces.define({ id: 'acid', color: [0.42, 0.66, 0.20], color2: [0.14, 0.24, 0.07], add: false, light: 0.05, layer: LAYER.TERRAIN_FRONT, decay: 0.012, spread: 0.02, flow: 0.55, consumes: 0.5, damage: 16, damageType: 'acid', status: 'acid', statusTime: 2 });
  surfaces.define({ id: 'slime', color: [0.34, 0.58, 0.36], color2: [0.10, 0.22, 0.12], layer: LAYER.TERRAIN_FRONT, decay: 0.01, spread: 0.03, flow: 0.4, damage: 0, status: 'slow', statusTime: 1 });
  surfaces.define({ id: 'frost', color: [0.60, 0.78, 0.95], color2: [0.22, 0.36, 0.54], layer: LAYER.TERRAIN_FRONT, decay: 0.03, spread: 0.02, flow: 0, damage: 3, damageType: 'impact', status: 'slow', statusTime: 1.2 });
  surfaces.define({ id: 'oil', color: [0.18, 0.15, 0.18], color2: [0.06, 0.05, 0.07], layer: LAYER.TERRAIN_FRONT, decay: 0.004, spread: 0, flow: 0.5, damage: 0 });

  function isFrozen(x, y) {
    for (let i = 0; i < frozen.length; i++) {
      const f = frozen[i];
      if (Math.hypot(x - f.x, y - f.y) <= f.r) return true;
    }
    return false;
  }

  function surfaceTick(dt) {
    for (let i = frozen.length - 1; i >= 0; i--) { frozen[i].t -= dt; if (frozen[i].t <= 0) frozen.splice(i, 1); }

    kinds.forEach((k) => {
      const live = k.live;
      if (!live.length) return;
      // a fifth of the cells per frame, staggered — 1000 cells cost what 200 do
      const chunk = Math.max(1, Math.ceil(live.length / 5));
      const el = dt * 5;
      for (let n = 0; n < chunk; n++) {
        if (k.cursor >= live.length) k.cursor = 0;
        const i = live[k.cursor];
        const cx = i % SCOLS, cy = (i / SCOLS) | 0;
        const x = X0 + cx * SCELL + SCELL * 0.5, y = Y0 + cy * SCELL + SCELL * 0.5;
        let a = k.amt[i];
        if (a <= 0.008) { live.splice(k.cursor, 1); k.amt[i] = 0; continue; }
        k.cursor++;
        if (isFrozen(x, y)) continue;

        let fuel = 1;
        if (k.needsFuel) {
          fuel = 0;
          const m = world.materialAt(x, y + SCELL * 0.6);
          if (MAT[m].flammable > 0) fuel = MAT[m].flammable;
          const near = world.queryProps(x, y, SCELL, PROPQ);
          for (let q = 0; q < near.length; q++) if (MAT[near[q].material].flammable > 0) { fuel = Math.max(fuel, MAT[near[q].material].flammable); near[q].burn = Math.max(near[q].burn, 0.6); }
          if (fuel <= 0) { k.amt[i] = a = Math.max(0, a - el * 0.9); continue; }
        }

        // fuel-scaled decay: grass fires gutter out, a burning tree keeps going.
        // Without this every fire has the same short lifetime and nothing ever
        // "keeps burning after the fight".
        a -= k.decay * el / (k.needsFuel ? (0.35 + fuel) : 1);

        if (k.consumes > 0) {
          const near = world.queryProps(x, y, SCELL * 0.9, PROPQ);
          for (let q = 0; q < near.length; q++) {
            const p = near[q];
            const soluble = k.id === 'acid' ? MAT[p.material].soluble : 1;
            if (soluble <= 0) continue;
            world.damageProp(p, k.consumes * a * el * 6 * soluble, k.damageType, null);
            p.charred = Math.min(1, p.charred + (k.id === 'fire' ? el * 0.25 : 0));
          }
          if (k.id === 'fire') terrain.scorch(x, y, SCELL, el * 0.4);
        }

        if (k.damage > 0) {
          for (const e of world.entities) {
            if (!e.alive || e.kind === 'effect' || e.kind === 'projectile') continue;
            if (Math.abs(e.x - x) > SCELL || Math.abs(e.y - y) > SCELL + e.h * 0.5) continue;
            world.damage(e, k.damage * a * el, k.damageType, null);
            if (k.status) world.applyStatus(e, statusId(k.status), k.statusTime, a);
          }
        }

        if (k.spread > 0 && a > 0.25) {
          const bias = k.id === 'fire' ? surfaces.wind : 0;
          for (let s = -1; s <= 1; s += 2) {
            const p = k.spread * el * (1 + s * bias * 1.6);
            if (rng.next() < p) surfaces.add(k.id, x + s * SCELL, y, a * 0.35);
          }
          if (rng.next() < k.spread * el * 0.6) surfaces.add(k.id, x, y - SCELL, a * 0.25);
        }
        if (k.flow > 0 && a > 0.02) {
          const below = world.solidAt(x, y + SCELL);
          // nothing underneath: the whole cell falls. A fluid left hanging in
          // mid-air is the single most obvious way this layer can look wrong.
          if (!below) { surfaces.add(k.id, x, y + SCELL, a); a = 0; }
          else {
            for (let s = -1; s <= 1; s += 2) {
              if (!world.solidAt(x + s * SCELL, y) && world.solidAt(x + s * SCELL, y + SCELL)) {
                surfaces.add(k.id, x + s * SCELL, y, a * k.flow * el * 0.9);
                a -= a * k.flow * el * 0.9;
              }
            }
          }
        }
        if (k.onCell) k.onCell(k, cx, cy, a, el);
        k.amt[i] = Math.max(0, a);

        // particles, sparsely — the cells that are drawn are enough
        if (rng.next() < 0.10 * a) {
          if (k.id === 'fire') {
            P.emit({ x: x + rng.range(-14, 14), y: y + 6, count: 1, vx: surfaces.wind * 0.6, vy: -1, speed: 90 + rng.next() * 70, vSpread: 0.5, life: 0.7, lifeVar: 0.4, size: 14, sizeEnd: 2, add: true, glow: 0.05, gravity: -160, drag: 1.2, color: [1, 0.82, 0.45, 0.9], color2: [0.7, 0.16, 0.05, 0] });
          } else {
            P.emit({ x: x + rng.range(-14, 14), y: y + 4, count: 1, vy: -1, speed: 24, vSpread: 0.7, life: 1.1, lifeVar: 0.6, size: 9, sizeEnd: 18, drag: 1, color: [k.color[0], k.color[1], k.color[2], 0.4], color2: [k.color2[0], k.color2[1], k.color2[2], 0] });
          }
        }
      }
    });
  }
  const PROPQ = [];

  /* ================================================================ *
   * Entities
   * ================================================================ */

  let nextId = 1;
  world.spawn = function (d) {
    if (world.entities.length >= world.entityCap) return null;
    const e = {
      id: nextId++, gen: 0, alive: true,
      kind: d.kind || 'custom',
      x: d.x, y: d.y, px: d.x, py: d.y,
      vx: d.vx || 0, vy: d.vy || 0,
      w: d.w === undefined ? 32 : d.w, h: d.h === undefined ? 32 : d.h,
      team: d.team === undefined ? 1 : d.team,
      hp: d.hp === undefined ? 1 : d.hp, maxHp: d.maxHp === undefined ? (d.hp === undefined ? 1 : d.hp) : d.maxHp,
      material: d.material === undefined ? MATERIAL.FLESH : d.material,
      gravity: d.gravity === undefined ? 1 : d.gravity,
      drag: d.drag || 0, bounce: d.bounce || 0, friction: d.friction || 0,
      collides: d.collides !== false, gridSolid: !!d.gridSolid, trigger: !!d.trigger,
      maxFall: d.maxFall || 1800,
      life: d.life || 0, invuln: d.invuln || 0, flammable: d.flammable || 0,
      faceX: d.faceX || 1, owner: d.owner || null, tag: d.tag || '',
      layer: d.layer === undefined ? LAYER.ACTORS : d.layer,
      onGround: false, wasGround: false, onWall: 0, hitFlash: 0,
      status: new Float32Array(STATUS_COUNT), power: new Float32Array(STATUS_COUNT),
      burning: 0, groundMat: MATERIAL.EARTH,
      onUpdate: d.onUpdate || null, onHit: d.onHit || null, onDamage: d.onDamage || null,
      onDeath: d.onDeath || null, onLand: d.onLand || null, onDespawn: d.onDespawn || null,
      render: d.render || null,
      data: {},
    };
    if (d.data) Object.assign(e.data, d.data);
    world.entities.push(e);
    return e;
  };

  world.despawn = function (e) {
    if (!e || !e.alive) return;
    e.alive = false;
    if (e.onDespawn) { try { e.onDespawn(e); } catch (err) { console.error(err); } }
  };
  world.kill = function (e, cause) {
    if (!e || !e.alive) return;
    if (e.onDeath) { try { e.onDeath(e, cause); } catch (err) { console.error(err); } }
    if (e.kind === 'enemy') bus.emit('enemy:died', { entity: e, x: e.x, y: e.y, kind: e.kind, tag: e.tag, src: cause, elite: !!e.data.elite });
    world.despawn(e);
  };
  world.each = function (kind, fn) {
    for (const e of world.entities) if (e.alive && e.kind === kind) fn(e);
  };
  Object.defineProperty(world, 'count', { get: () => world.entities.length });

  /* ---------------- queries ---------------- */

  const distBuf = [];
  world.queryRadius = function (x, y, r, qo, out) {
    const q = qo || {};
    const a = out || [];
    a.length = 0;
    const r2 = r * r;
    for (const e of world.entities) {
      if (!e.alive) continue;
      if (q.exclude === e) continue;
      if (q.team !== undefined && q.team >= 0 && e.team !== q.team) continue;
      if (q.kind) {
        if (Array.isArray(q.kind)) { if (q.kind.indexOf(e.kind) < 0) continue; }
        else if (e.kind !== q.kind) continue;
      }
      if (q.tag && e.tag !== q.tag) continue;
      if (q.targetable !== false && (e.kind === 'effect' || e.kind === 'pickup' || e.hp <= 0)) continue;
      const dx = e.x - x, dy = e.y - y;
      if (dx * dx + dy * dy > r2) continue;
      if (q.los && !world.lineOfSight(x, y, e.x, e.y)) continue;
      a.push(e);
      if (a.length >= (q.max || 64) && q.sort === false) break;
    }
    if (q.sort !== false) a.sort((p, b) => ((p.x - x) ** 2 + (p.y - y) ** 2) - ((b.x - x) ** 2 + (b.y - y) ** 2));
    if (a.length > (q.max || 64)) a.length = q.max || 64;
    return a;
  };
  world.queryBox = function (x, y, w, h, qo, out) {
    return world.queryRadius(x, y, Math.max(w, h) * 0.75, qo, out);
  };
  world.nearest = function (x, y, r, qo) {
    const a = world.queryRadius(x, y, r, qo, distBuf);
    return a.length ? a[0] : null;
  };
  const NEARQ = { team: 1, targetable: true, sort: true, max: 8 };
  world.nearestEnemy = function (x, y, r) {
    NEARQ.team = 1;
    const a = world.queryRadius(x, y, r, NEARQ, distBuf);
    for (let i = 0; i < a.length; i++) if (a[i].hp > 0) return a[i];
    return null;
  };

  world.raycast = function (x, y, dx, dy, maxDist, ro) {
    return world.sweep(x, y, x + dx * maxDist, y + dy * maxDist, ro);
  };

  world.sweep = function (x0, y0, x1, y1, so) {
    const s = so || {};
    const radius = s.radius || 0;
    const dx = x1 - x0, dy = y1 - y0;
    const dist = Math.hypot(dx, dy);
    const step = s.step || 6;
    const n = Math.max(1, Math.ceil(dist / step));
    const h = world.hit;
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const px = x0 + dx * t, py = y0 + dy * t;

      if (s.entities !== false) {
        for (const e of world.entities) {
          if (!e.alive || e === s.exclude || e.owner === s.exclude || e.kind === 'effect' || e.kind === 'projectile') continue;
          if (s.team !== undefined && s.team >= 0 && e.team !== s.team) continue;
          if (e.hp <= 0) continue;
          if (Math.abs(px - e.x) > e.w * 0.5 + radius || Math.abs(py - e.y) > e.h * 0.5 + radius) continue;
          h.what = 'entity'; h.entity = e; h.prop = null; h.debris = null;
          h.x = px; h.y = py; h.dist = dist * t; h.t = t; h.material = e.material;
          setNormal(h, dx, dy);
          return h;
        }
      }
      if (s.props !== false) {
        for (const p of world.props) {
          if (!p.alive || !p.solid) continue;
          if (px < p.left - radius || px > p.right + radius || py < p.top - radius || py > p.bottom + radius) continue;
          h.what = 'prop'; h.prop = p; h.entity = null; h.debris = null;
          h.x = px; h.y = py; h.dist = dist * t; h.t = t; h.material = p.material;
          setNormal(h, dx, dy);
          return h;
        }
      }
      if (s.terrain !== false && world.solidAt(px, py)) {
        h.what = 'terrain'; h.entity = null; h.prop = null; h.debris = null;
        h.x = px; h.y = py; h.dist = dist * t; h.t = t;
        h.cellX = terrain.toCellX(px); h.cellY = terrain.toCellY(py);
        h.material = terrain.matAt(h.cellX, h.cellY);
        setNormal(h, dx, dy);
        return h;
      }
    }
    return null;
  };
  function setNormal(h, dx, dy) {
    const L = Math.hypot(dx, dy) || 1;
    h.nx = -dx / L; h.ny = -dy / L;
  }

  /* ---------------- damage ---------------- */

  world.damage = function (target, amount, type, dopts) {
    if (!target) return 0;
    if (target.material !== undefined && target.maxHp !== undefined && target.state !== undefined) {
      return world.damageProp(target, amount, type, dopts);
    }
    const e = target;
    if (!e.alive) return 0;
    const t = dmgType(type);
    const opt = dopts || EMPTY;
    if (opt.src && opt.src === e.owner) return 0;
    if (e.invuln > 0 && !opt.ignoreInvuln && t !== DAMAGE.LIFE) return 0;

    let amt = amount * resistOf(e.material, t);
    if (t === DAMAGE.LIFE) {
      e.hp = Math.min(e.maxHp, e.hp + amt);
      return amt;
    }
    if (amt < MAT[e.material].minDamage * 0.5) return 0;
    if (e.onDamage) { const r = e.onDamage(e, amt, t, opt.src); if (typeof r === 'number') amt = r; }
    e.hp -= amt;
    if (!opt.noFlash) e.hitFlash = 1;
    if (opt.force) world.knockback(e, opt.dirX || 0, opt.dirY || 0, opt.force);
    if (opt.stagger) world.applyStatus(e, STATUS.STUN, opt.stagger, 1);
    if (opt.status) world.applyStatus(e, statusId(opt.status), opt.statusTime || 1, opt.statusPower === undefined ? 1 : opt.statusPower);
    if (opt.hitX !== undefined) world.materialFx(e.material, opt.hitX, opt.hitY, opt.dirX, opt.dirY, 0.6);
    if (e === world.player) bus.emit('player:damage', { amount: amt, type: DAMAGE_NAMES[t], hp: e.hp, maxHp: e.maxHp, src: opt.src, x: e.x, y: e.y });
    if (e.hp <= 0) world.kill(e, DAMAGE_NAMES[t]);
    return amt;
  };
  const EMPTY = {};

  world.damageArea = function (x, y, radius, amount, type, ao) {
    const a = ao || EMPTY;
    world.lastHits.length = 0;
    let n = 0;
    const falloff = a.falloff === undefined ? 1 : a.falloff;
    for (const e of world.entities) {
      if (!e.alive || e.kind === 'effect' || e.kind === 'projectile') continue;
      if (a.team !== undefined && a.team >= 0 && e.team !== a.team) continue;
      const d = Math.hypot(e.x - x, e.y - y);
      if (d > radius) continue;
      if (a.los && !world.lineOfSight(x, y, e.x, e.y)) continue;
      const k = falloff === 0 ? 1 : Math.pow(Math.max(0, 1 - d / radius), falloff);
      const dx = (e.x - x) / (d || 1), dy = (e.y - y) / (d || 1);
      world.damage(e, amount * k, type, dmgo(a, x, y, dx, dy, (a.force || 0) * k));
      n++;
      if (n >= (a.maxTargets || 64)) break;
    }
    if (a.props !== false) {
      const list = world.queryProps(x, y, radius, PROPQ2);
      for (const p of list) {
        const d = Math.hypot(p.x - x, p.y - y);
        const k = falloff === 0 ? 1 : Math.pow(Math.max(0, 1 - d / (radius * 1.3)), falloff);
        world.damageProp(p, amount * k, type, null);
        if (a.igniteChance && rng.next() < a.igniteChance) world.igniteProp(p, 0.8);
      }
    }
    if (a.terrain) terrain.damage(x, y, radius * (a.terrainScale === undefined ? 0.7 : a.terrainScale), amount, type);
    if (a.debris !== false && a.force) world.shoveDebris(x, y, radius, a.force);
    return n;
  };
  const PROPQ2 = [];
  const DOPT = {};
  function dmgo(a, x, y, dx, dy, force) {
    DOPT.src = a.src || null; DOPT.hitX = x; DOPT.hitY = y;
    DOPT.dirX = dx; DOPT.dirY = dy; DOPT.force = force;
    DOPT.stagger = a.stagger || 0; DOPT.status = a.status || null;
    DOPT.statusTime = a.statusTime || 0; DOPT.statusPower = a.statusPower || 1;
    DOPT.noFlash = false; DOPT.ignoreInvuln = false;
    return DOPT;
  }

  world.explode = function (x, y, eo) {
    const a = eo || EMPTY;
    const radius = a.radius === undefined ? 180 : a.radius;
    const dmg = a.damage === undefined ? 40 : a.damage;
    const type = a.type || 'fire';
    const m = world.materialAt(x, y + 20);

    world.damageArea(x, y, radius, dmg, type, {
      falloff: 1, props: a.props !== false, terrain: a.terrain, terrainScale: a.terrainScale,
      force: a.force === undefined ? 900 : a.force, igniteChance: a.igniteChance, debris: true,
    });

    const dust = a.dust === undefined ? 1 : a.dust;
    const sparks = a.sparks === undefined ? 1 : a.sparks;
    const cd = MAT[m].dust, cc = MAT[m].chip;
    if (dust > 0) {
      P.emit({ x, y, count: Math.round(30 * dust), speed: 220 * dust, speedVar: 200, life: 1.6, lifeVar: 0.9, size: 40, sizeEnd: 180 * dust, gravity: -70, drag: 1.5, fadeIn: 0.12, color: [cd[0], cd[1], cd[2], 0.5], color2: [cd[0] * 0.4, cd[1] * 0.4, cd[2] * 0.45, 0] });
    }
    if (sparks > 0) {
      P.emit({ x, y, count: Math.round(50 * sparks), speed: 700 * sparks, speedVar: 500, life: 0.55, lifeVar: 0.35, size: 14, sizeEnd: 1, gravity: 900, drag: 2.6, add: true, glow: 0.4, stretch: 2.2, collide: true, bounce: 0.35, color: [cc[0], cc[1], cc[2], 1], color2: [cc[0] * 0.5, cc[1] * 0.2, cc[2] * 0.1, 0] });
    }
    world.burstDebris(x, y, m, Math.round(8 * (a.props === false ? 0.4 : 1)), { speed: 460, speedVar: 300, spread: Math.PI, size: 1 });
    if (a.light !== 0) R.light({ x, y, radius: radius * 3, r: 1, g: 0.72, b: 0.4, intensity: 3 * (a.light === undefined ? 1 : a.light) });
    if (a.shake !== 0) R.fx.shake(a.shake === undefined ? 0.5 : a.shake, 0.45);
    if (a.hitstop !== 0) R.fx.timeScale(0.06, a.hitstop === undefined ? 0.05 : a.hitstop);
    if (a.flash !== 0) R.fx.flash(1, 0.7, 0.4, a.flash === undefined ? 0.15 : a.flash, 0.1);
    shockwave(R, x, y, Math.min(1.5, radius / 180));
    ctx.audio.sfx('explode', { x, y });
    return 1;
  };

  world.materialFx = function (material, x, y, dx, dy, strength) {
    const m = MAT[material === undefined ? MATERIAL.ROCK : material];
    const s = strength === undefined ? 1 : strength;
    const cc = m.chip, cd = m.dust;
    P.emit({
      x, y, count: Math.round(4 + 10 * s), vx: dx || 0, vy: dy || -1, vSpread: 1.1,
      speed: 220 * s + 80, speedVar: 180, life: 0.45, lifeVar: 0.3,
      size: 5 + 4 * s, sizeEnd: 0.5, gravity: 700, drag: 1.6,
      add: m.sparks > 0, glow: m.glow * 0.2, stretch: m.sparks > 0 ? 1.6 : 0,
      collide: true, bounce: m.bounce,
      color: [cc[0], cc[1], cc[2], 1], color2: [cc[0] * 0.4, cc[1] * 0.35, cc[2] * 0.35, 0],
    });
    P.emit({
      x, y, count: Math.round(2 + 4 * s * m.dustScale), speed: 60 * s, life: 0.9, lifeVar: 0.5,
      size: 14 * m.dustScale, sizeEnd: 46 * m.dustScale, gravity: -40, drag: 1.4, fadeIn: 0.15,
      color: [cd[0], cd[1], cd[2], 0.4], color2: [cd[0] * 0.4, cd[1] * 0.4, cd[2] * 0.45, 0],
    });
  };

  function dustPlume(x, y, radius, material, n) {
    const cd = MAT[material].dust;
    P.emit({
      x, y, count: Math.min(26, 6 + n), speed: radius * 1.4, speedVar: radius, life: 1.3, lifeVar: 0.8,
      size: radius * 0.5, sizeEnd: radius * 2, gravity: -60, drag: 1.6, fadeIn: 0.12,
      color: [cd[0], cd[1], cd[2], 0.45], color2: [cd[0] * 0.35, cd[1] * 0.35, cd[2] * 0.4, 0],
    });
  }

  world.knockback = function (e, dx, dy, force) {
    if (!e || !e.alive) return;
    const mass = 1 + (MAT[e.material].density - 1) * 0.4 + e.w * e.h / 20000;
    e.vx += dx * force / mass;
    e.vy += dy * force / mass;
  };

  world.applyStatus = function (e, id, seconds, power) {
    if (!e || !e.alive) return;
    const i = statusId(id);
    if (i < 0) return;
    e.status[i] = Math.max(e.status[i], seconds);
    e.power[i] = Math.max(e.power[i], power === undefined ? 1 : power);
  };
  world.hasStatus = (e, id) => (e ? e.status[statusId(id)] : 0);
  world.statusPower = (e, id) => (e ? e.power[statusId(id)] : 0);
  world.clearStatus = (e, id) => { if (e) e.status[statusId(id)] = 0; };

  world.castOrigin = function (out) {
    const p = world.player;
    const o = out || {};
    o.x = p ? p.x + p.faceX * 14 : 0;
    o.y = p ? p.y - 8 : 0;
    return o;
  };
  world.setPlayerSpawn = (x, y) => { spawnX = x; spawnY = y; };
  world.respawn = function () {
    const p = world.player;
    if (!p) return;
    p.x = spawnX; p.y = spawnY; p.vx = 0; p.vy = 0; p.hp = p.maxHp; p.alive = true;
  };
  let spawnX = 0, spawnY = 0;

  /* ================================================================ *
   * Physics + step
   * ================================================================ */

  function moveEntity(e, dt) {
    if (e.gravity) e.vy += GRAV * e.gravity * dt;
    if (e.drag) { const f = 1 / (1 + e.drag * dt); e.vx *= f; e.vy *= f; }
    if (e.vy > e.maxFall) e.vy = e.maxFall;

    e.wasGround = e.onGround;
    e.onGround = false;
    e.onWall = 0;
    if (!e.collides) { e.x += e.vx * dt; e.y += e.vy * dt; return; }

    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(e.vx), Math.abs(e.vy)) * dt / 8));
    const sdt = dt / steps;
    for (let s = 0; s < steps; s++) {
      let nx = e.x + e.vx * sdt;
      if (world.solidBox(nx, e.y, e.w, e.h) || propBlock(e, nx, e.y)) {
        e.onWall = e.vx > 0 ? 1 : -1;
        e.vx = 0;
      } else e.x = nx;

      let ny = e.y + e.vy * sdt;
      if (world.solidBox(e.x, ny, e.w, e.h) || propBlock(e, e.x, ny)) {
        if (e.vy > 0) {
          e.onGround = true;
          e.groundMat = world.materialAt(e.x, e.y + e.h * 0.5 + 8);
          if (!e.wasGround && e.onLand) e.onLand(e, e.vy);
        }
        if (e.bounce > 0 && Math.abs(e.vy) > 100) e.vy = -e.vy * e.bounce;
        else e.vy = 0;
      } else e.y = ny;
    }
    if (e.onGround && e.friction) {
      const f = 1 / (1 + e.friction * dt);
      e.vx *= f;
    }
  }

  function propBlock(e, x, y) {
    if (e.kind === 'projectile' || e.kind === 'effect') return false;
    for (const p of world.props) {
      if (!p.alive || !p.solid || p.falling) continue;
      if (Math.abs(x - p.x) < (e.w + p.w) * 0.5 && Math.abs(y - p.y) < (e.h + p.h) * 0.5) return true;
    }
    for (const o of world.entities) {
      if (o === e || !o.alive || !o.gridSolid) continue;
      if (Math.abs(x - o.x) < (e.w + o.w) * 0.5 && Math.abs(y - o.y) < (e.h + o.h) * 0.5) return true;
    }
    return false;
  }

  function statusTick(e, dt) {
    for (let i = 0; i < STATUS_COUNT; i++) if (e.status[i] > 0) e.status[i] -= dt;
    e.burning = Math.max(0, e.status[STATUS.BURN]);
    if (e.status[STATUS.BURN] > 0) {
      world.damage(e, 9 * e.power[STATUS.BURN] * dt, 'fire', null);
      if (rng.next() < 0.4) P.emit({ x: e.x + rng.range(-e.w * 0.4, e.w * 0.4), y: e.y + rng.range(-e.h * 0.4, e.h * 0.4), count: 1, vy: -1, speed: 90, vSpread: 0.5, life: 0.5, size: 12, sizeEnd: 1, add: true, glow: 0.04, gravity: -200, color: [1, 0.78, 0.4, 0.9], color2: [0.7, 0.15, 0.05, 0] });
    }
    if (e.status[STATUS.ACID] > 0) {
      world.damage(e, 7 * e.power[STATUS.ACID] * dt, 'acid', null);
      if (rng.next() < 0.3) P.emit({ x: e.x + rng.range(-e.w * 0.4, e.w * 0.4), y: e.y, count: 1, vy: 1, speed: 40, life: 0.7, size: 6, sizeEnd: 2, gravity: 400, color: [0.6, 0.88, 0.3, 0.8], color2: [0.2, 0.35, 0.1, 0] });
    }
    if (e.hitFlash > 0) e.hitFlash = Math.max(0, e.hitFlash - dt * 5);
    if (e.invuln > 0) e.invuln -= dt;
  }

  function propTick(dt) {
    for (let i = world.props.length - 1; i >= 0; i--) {
      const p = world.props[i];
      if (!p.alive) { world.props.splice(i, 1); continue; }
      if (p.hitFlash > 0) p.hitFlash = Math.max(0, p.hitFlash - dt * 5);

      if (p.burn > 0) {
        p.fuel -= dt * 0.075 * p.burn * MAT[p.material].flammable;
        p.charred = Math.min(1, p.charred + dt * 0.14 * p.burn);
        world.damageProp(p, 7 * p.burn * dt, 'fire', null);
        if (rng.next() < 0.5) {
          P.emit({ x: p.x + rng.range(-p.w * 0.45, p.w * 0.45), y: p.bottom - rng.next() * p.h, count: 1, vy: -1, speed: 110, vSpread: 0.5, life: 0.8, lifeVar: 0.4, size: 18, sizeEnd: 2, add: true, glow: 0.05, gravity: -230, drag: 1.1, color: [1, 0.8, 0.4, 0.85], color2: [0.7, 0.15, 0.05, 0] });
        }
        if (p.fuel <= 0 && p.alive) { world.collapse(p, 0); p.burn = 0; }
      }

      if (p.state === 'shattering') {
        p.shatterT -= dt;
        if (p.shatterT <= 0) finishBreak(p);
        continue;
      }
      if (p.falling > 0) {
        p.falling -= dt;
        if (p.falling <= 0) {
          p.falling = 0;
          p.vy = 40; p.vrot = rng.range(-2, 2);
          p.dropping = true;
        }
      }
      if (p.dropping) {
        p.vy += GRAV * 0.55 * dt;
        p.y += p.vy * dt;
        p.rot += p.vrot * dt;
        if (world.solidAt(p.x, p.bottom + 4) || p.bottom > Y0 + ROWS * CELL) {
          world.damageProp(p, p.maxHp * 2, 'impact', null);
          R.fx.shake(0.2, 0.3);
        }
      }
    }
    if (needSupport) { needSupport = false; world.solveSupport(); }
  }

  function debrisTick(dt) {
    for (let i = world.debris.length - 1; i >= 0; i--) {
      const b = world.debris[i];
      if (b.life > 0) { b.life -= dt; if (b.life <= 0) { world.debris.splice(i, 1); continue; } }
      if (b.sleep) continue;
      b.vy += GRAV * dt;
      let nx = b.x + b.vx * dt, ny = b.y + b.vy * dt;
      if (world.solidAt(nx, b.y)) { b.vx *= -MAT[b.material].bounce; nx = b.x; }
      if (world.solidAt(b.x, ny)) {
        if (Math.abs(b.vy) > 90) { b.vy = -b.vy * MAT[b.material].bounce; ny = b.y; }
        else { b.vy = 0; ny = b.y; b.vx *= 0.7; }
      }
      b.x = nx; b.y = ny;
      b.rot += b.vrot * dt;
      b.vrot *= 0.98;
      if (Math.abs(b.vx) + Math.abs(b.vy) < 24) { b.still += dt; if (b.still > 0.35) b.sleep = 1; }
      else b.still = 0;
      if (b.y > Y0 + ROWS * CELL + 400) world.debris.splice(i, 1);
    }
  }

  world.step = function (dt) {
    world.time += dt;
    world.frame++;
    for (let i = 0; i < world.entities.length; i++) {
      const e = world.entities[i];
      if (!e.alive) continue;
      e.px = e.x; e.py = e.y;
      if (e.life > 0) { e.life -= dt; if (e.life <= 0) { world.despawn(e); continue; } }
      statusTick(e, dt);
      if (e.status[STATUS.STUN] <= 0 && e.onUpdate) { try { e.onUpdate(e, dt); } catch (err) { console.error(err); } }
      if (!e.alive) continue;
      if (e.status[STATUS.ROOT] > 0) e.vx = 0;
      moveEntity(e, dt);
      if (e.hp <= 0 && e.kind !== 'effect' && e.kind !== 'projectile' && e.maxHp > 1) world.kill(e, 'hp');
    }
    for (let i = world.entities.length - 1; i >= 0; i--) if (!world.entities[i].alive) world.entities.splice(i, 1);
    propTick(dt);
    debrisTick(dt);
    surfaceTick(dt);
    P.update(dt);
    world.stats.entities = world.entities.length;
    world.stats.props = world.props.length;
    world.stats.debris = world.debris.length;
    world.stats.surfaceCells = surfaces.totalCells();
  };

  /* ================================================================ *
   * Rendering
   * ================================================================ */

  const runTop = [];
  world.draw = function (alpha) {
    // terrain as vertical runs — one quad per run, not per cell
    for (let cx = 0; cx < COLS; cx++) {
      let cy = 0;
      while (cy < ROWS) {
        if (!tSolid[idx(cx, cy)]) { cy++; continue; }
        const m = tMat[idx(cx, cy)];
        let end = cy;
        let charSum = 0;
        while (end < ROWS && tSolid[idx(cx, end)] && tMat[idx(cx, end)] === m) { charSum += tChar[idx(cx, end)]; end++; }
        const n = end - cy;
        const ch = charSum / n;
        const body = MAT[m].body;
        const k = 1 - ch * 0.45;   // scorched, not erased
        R.quad({
          x: X0 + cx * CELL + CELL * 0.5, y: Y0 + cy * CELL + n * CELL * 0.5,
          w: CELL + 1, h: n * CELL, r: body[0] * k, g: body[1] * k, b: body[2] * k, a: 1,
          layer: LAYER.TERRAIN,
        });
        // lit top lip: the difference between "a grid" and "ground"
        R.quad({
          x: X0 + cx * CELL + CELL * 0.5, y: Y0 + cy * CELL + 3,
          w: CELL + 1, h: 6, r: body[0] * 1.7 * k, g: body[1] * 1.65 * k, b: body[2] * 1.5 * k, a: 1,
          layer: LAYER.TERRAIN,
        });
        cy = end;
      }
    }

    for (const p of world.props) drawProp(p);

    for (const b of world.debris) {
      const body = MAT[b.material].body;
      R.quad({ x: b.x, y: b.y, w: b.w, h: b.h, rot: b.rot, r: body[0] * 1.1, g: body[1] * 1.1, b: body[2] * 1.1, a: 1, layer: LAYER.TERRAIN_FRONT });
    }

    drawSurfaces();

    for (const e of world.entities) {
      if (!e.alive || !e.render) continue;
      try { e.render(e, alpha, R); } catch (err) { console.error(err); }
    }
  };

  function drawProp(p) {
    const m = MAT[p.material];
    const body = m.body;
    const flash = p.hitFlash || 0;
    const ch = 1 - p.charred * 0.7;
    const acid = p.acid;
    let r = body[0] * ch, g = body[1] * ch, b = body[2] * ch;
    r = r + (0.9 - r) * flash; g = g + (0.9 - g) * flash; b = b + (0.9 - b) * flash;
    r = r * (1 - acid * 0.5) + 0.28 * acid; g = g * (1 - acid * 0.3) + 0.42 * acid; b = b * (1 - acid * 0.6) + 0.10 * acid;
    const sc = p.state === 'shattering' ? 1 + (0.1 - p.shatterT) * 3 : 1;

    if (p.material === MATERIAL.FOLIAGE) {
      for (let i = 0; i < 7; i++) {
        const a = i * 0.9 + p.seed * 6;
        R.sprite({
          tex: R.blob, x: p.x + Math.cos(a) * p.w * 0.28, y: p.y + Math.sin(a) * p.h * 0.26,
          w: p.w * 0.62 * sc, h: p.h * 0.6 * sc, rot: a,
          r, g, b, a: 1, layer: p.layer,
        });
      }
    } else {
      R.quad({ x: p.x, y: p.y, w: p.w * sc, h: p.h * sc, rot: p.rot, r, g, b, a: 1, layer: p.layer });
      R.quad({ x: p.x, y: p.top + 4, w: p.w * sc, h: 7, rot: p.rot, r: r * 1.5, g: g * 1.5, b: b * 1.45, a: 1, layer: p.layer });
      if (p.material === MATERIAL.MASONRY) {
        const rows = Math.max(1, Math.round(p.h / 26));
        for (let i = 1; i < rows; i++) {
          R.quad({ x: p.x, y: p.top + (i / rows) * p.h, w: p.w * sc, h: 2, r: r * 0.55, g: g * 0.55, b: b * 0.55, a: 1, layer: p.layer });
        }
      }
      if (p.material === MATERIAL.GLASS) {
        R.sprite({ tex: R.blob, x: p.x, y: p.y, w: p.w * 1.4, h: p.h * 1.4, r: 0.4, g: 0.6, b: 0.75, a: 0.35, layer: LAYER.FX, add: true });
      }
    }
    // crack states share the silhouette; they only add fracture lines
    const frac = p.hp / p.maxHp;
    if (frac < 0.66) {
      const n = frac < 0.33 ? 5 : 2;
      for (let i = 0; i < n; i++) {
        const t = (i + 1) / (n + 1);
        R.line(p.left + p.w * t, p.top + p.h * 0.1, p.left + p.w * (t + (p.seed - 0.5) * 0.3), p.bottom - p.h * 0.1,
          2.2, { r: 0.03, g: 0.03, b: 0.04, a: 0.8 }, p.layer);
      }
    }
    if (p.burn > 0) {
      R.light({ x: p.x, y: p.y, radius: Math.max(p.w, p.h) * 2.4, r: 1, g: 0.66, b: 0.32, intensity: 1.4 * p.burn, flicker: 0.6 });
    }
  }

  function drawSurfaces() {
    kinds.forEach((k) => {
      for (let n = 0; n < k.live.length; n++) {
        const i = k.live[n];
        const a = k.amt[i];
        if (a <= 0.02) continue;
        const cx = i % SCOLS, cy = (i / SCOLS) | 0;
        const x = X0 + cx * SCELL + SCELL * 0.5, y = Y0 + cy * SCELL + SCELL * 0.5;
        const t = Math.min(1, a);
        const c = k.color, c2 = k.color2;
        const r = c2[0] + (c[0] - c2[0]) * t, g = c2[1] + (c[1] - c2[1]) * t, b = c2[2] + (c[2] - c2[2]) * t;
        R.sprite({
          tex: R.blob, x, y: y + SCELL * (k.flow > 0.2 ? 0.42 : 0.2), w: SCELL * (k.flow > 0.2 ? 2.4 : 2.1), h: SCELL * (k.flow > 0.2 ? 0.8 : 1.5),
          r, g, b, a: Math.min(0.95, 0.35 + t * 0.6), layer: k.layer, add: k.add,
        });
        if (k.light > 0 && n % 3 === 0) {
          R.light({ x, y, radius: 190 * t, r: c[0], g: c[1], b: c[2], intensity: k.light * t * 1.2, flicker: 0.5 });
        }
      }
    });
  }

  /* ================================================================ *
   * Player
   * ================================================================ */

  world.makePlayer = function (x, y) {
    const p = world.spawn({
      kind: 'player', x, y, w: 40, h: 92, team: 0, hp: 120, material: MATERIAL.FLESH,
      gravity: 1, friction: 8, tag: 'rook',
      onUpdate: playerUpdate, render: playerRender,
    });
    p.data.state = 'idle'; p.data.dashCd = 0; p.data.canDash = true;
    p.data.pose = 0; p.data.anim = 0;
    p.data.castPose = (s) => { p.data.pose = s; };
    world.player = p;
    spawnX = x; spawnY = y;
    return p;
  };

  function playerUpdate(e, dt) {
    const d = e.data;
    d.anim += dt;
    if (d.pose > 0) d.pose -= dt;
    if (!world.playerControl) { e.vx *= 0.8; return; }
    const ax = ctx.input.axisX;
    e.vx += (ax * 420 - e.vx) * Math.min(1, 12 * dt);
    if (Math.abs(ax) > 0.15) e.faceX = ax > 0 ? 1 : -1;
    if (ctx.input.pressed('jump') && e.onGround) { e.vy = -1000; ctx.audio.sfx('jump', { x: e.x, y: e.y }); }
    d.state = e.onGround ? (Math.abs(e.vx) > 40 ? 'run' : 'idle') : (e.vy < 0 ? 'jump' : 'fall');
    ctx.input.setAimOrigin(e.x, e.y - 10);
  }

  function playerRender(e, alpha, R2) {
    const d = e.data;
    const x = e.px + (e.x - e.px) * alpha, y = e.py + (e.y - e.py) * alpha;
    const bob = d.state === 'run' ? Math.sin(d.anim * 16) * 3 : Math.sin(d.anim * 2.2) * 1.4;
    const lean = e.vx * 0.00016;
    const skin = [0.62, 0.44, 0.36], cloth = [0.20, 0.22, 0.30];
    R2.sprite({ tex: R2.blob, x, y: y + 26, w: 16, h: 44, rot: 0.1, r: cloth[0], g: cloth[1], b: cloth[2], a: 1, layer: LAYER.ACTORS });
    R2.sprite({ tex: R2.blob, x: x + 10, y: y + 26, w: 16, h: 44, rot: -0.1, r: cloth[0], g: cloth[1], b: cloth[2], a: 1, layer: LAYER.ACTORS });
    R2.sprite({ tex: R2.blob, x, y: y + bob, w: 40, h: 58, rot: lean, r: cloth[0] * 1.3, g: cloth[1] * 1.3, b: cloth[2] * 1.3, a: 1, layer: LAYER.ACTORS });
    R2.sprite({ tex: R2.blob, x: x + e.faceX * 4, y: y - 34 + bob, w: 28, h: 30, r: skin[0], g: skin[1], b: skin[2], a: 1, layer: LAYER.ACTORS });
    // the lifestone: it is the light source on him, and it flares when he casts
    const glow = 0.6 + (d.pose > 0 ? 1.8 : 0) + Math.sin(d.anim * 3) * 0.1;
    R2.sprite({ tex: R2.disc, x, y: y - 8 + bob, w: 14, h: 14, r: 1, g: 0.86, b: 0.6, a: 1, layer: LAYER.FX, add: true });
    R2.sprite({ tex: R2.blob, x, y: y - 8 + bob, w: 70, h: 70, r: 1, g: 0.72, b: 0.42, a: 0.35 * glow, layer: LAYER.FX, add: true });
    R2.light({ x, y: y - 8 + bob, radius: 300, r: 1, g: 0.74, b: 0.46, intensity: 1.1 * glow, flicker: 0.12 });
    const arm = d.pose > 0 ? -1.1 * e.faceX : 0.3 * e.faceX;
    R2.sprite({ tex: R2.streak, x: x + e.faceX * 18, y: y - 6 + bob, w: 11, h: 42, rot: arm, r: skin[0], g: skin[1], b: skin[2], a: 1, layer: LAYER.ACTORS });
  }

  ctx.world = world;
  P.setTerrainQuery((x, y) => world.solidAt(x, y));
  return world;
}
