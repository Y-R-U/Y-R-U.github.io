// Whitewall against the files the game actually reads. Nothing here carries its own copy of a
// coordinate: the areas, the props, the bodies and the nodes all come off disk, so moving a rect
// in data/areas.json without moving the building turns these red.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TYPES, HOUSE_MIN_W } from './scene.js';
import { whitewall, PLOTS, SPOTS, GATES, CIRCUIT, segments } from './whitewall.js';
import { anchor } from '../game/placement.js';
import { contains, centreOf } from '../game/areas.js';

const DATA = resolve(dirname(fileURLToPath(import.meta.url)), '../../data');
const load = f => JSON.parse(readFileSync(`${DATA}/${f}`, 'utf8'));

const AREAS = Object.fromEntries(load('areas.json').map(a => [a.id, a]));
const OBJECTS = whitewall();

// colliders.js rebuildWalk: the object's bare plan plus 0.18, and the player's own 0.34 radius.
const WALK_PAD = 0.18;
const BODY = 0.34;

const boxes = OBJECTS.map(o => {
  const [hw, hd] = TYPES[o.type].plan(o.p);
  return { o, x: o.x, z: o.z, hw: hw + WALK_PAD, hd: hd + WALK_PAD, c: Math.cos(o.ry), s: Math.sin(o.ry) };
});

function blockedBy(x, z, pad = BODY) {
  return boxes.filter(b => {
    const px = x - b.x, pz = z - b.z;
    const lx = px * b.c - pz * b.s, lz = px * b.s + pz * b.c;
    return Math.abs(lx) < b.hw + pad && Math.abs(lz) < b.hd + pad;
  });
}

const clear = (x, z, pad) => blockedBy(x, z, pad).length === 0;
const name = b => `${b.o.type}(${b.o.x}, ${b.o.z})`;

// Every sample along a straight line, inclusive of both ends.
function walkable(from, to, pad = BODY) {
  const n = Math.max(2, Math.ceil(Math.hypot(to[0] - from[0], to[1] - from[1]) / 0.5));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = from[0] + (to[0] - from[0]) * t, z = from[1] + (to[1] - from[1]) * t;
    const hit = blockedBy(x, z, pad);
    if (hit.length) return { ok: false, at: [+x.toFixed(1), +z.toFixed(1)], by: hit.map(name) };
  }
  return { ok: true };
}

// Anything with a shape near enough to Whitewall to be this town's job.
const lightAreas = () => Object.values(AREAS).filter(a => a.town === 'light');

function referenced() {
  const ids = new Set();
  const walk = o => {
    if (Array.isArray(o)) return o.forEach(walk);
    if (!o || typeof o !== 'object') return;
    for (const [k, v] of Object.entries(o)) {
      if (typeof v === 'string' && ['area', 'in', 'at', 'to', 'from'].includes(k) && AREAS[v]) ids.add(v);
      else walk(v);
    }
  };
  for (const f of readdirSync(`${DATA}/quests`)) walk(load(`quests/${f}`));
  for (const f of ['props.json', 'cast_at.json', 'gather.json', 'escorts.json']) walk(load(f));
  return [...ids].filter(id => AREAS[id].town === 'light');
}

// Every prop, body and node the placement layer puts inside a light-side area, at the same world
// coordinate js/game/placement.js computes for it.
function placements() {
  const out = [];
  for (const f of ['props.json', 'cast_at.json', 'gather.json']) {
    for (const e of load(f)) {
      const area = AREAS[e.area];
      if (area?.town !== 'light') continue;
      const at = anchor(area, e.at || [0, 0]);
      out.push({ kind: f.replace('.json', ''), id: e.id, area: e.area, ...at });
    }
  }
  return out;
}

test('the plots are the rects data/areas.json declares, to the metre', () => {
  for (const [id, r] of Object.entries(PLOTS)) {
    const s = AREAS[id]?.shape;
    assert.ok(s, `${id} is no longer an area`);
    assert.deepEqual({ x0: s.x0, z0: s.z0, x1: s.x1, z1: s.z1 }, r, id);
  }
  for (const [id, p] of Object.entries(SPOTS)) {
    const s = AREAS[id]?.shape;
    assert.ok(s, `${id} is no longer an area`);
    assert.deepEqual({ x: s.x, z: s.z, r: s.r }, p, id);
  }
  for (const [side, g] of Object.entries(GATES)) {
    const s = AREAS[`wwa.${side}gate`]?.shape;
    assert.equal(s.x, g.x, `${side} gate x`);
    assert.equal(s.z, g.z, `${side} gate z`);
  }
});

test('every light-side area a quest, prop, body or node names has geometry standing on it', () => {
  const missing = [];
  for (const id of referenced()) {
    const a = AREAS[id];
    // A reach or a town is a region rather than a plot; it is covered through its children.
    if (a.shape.k === 'rect' && Math.abs(a.shape.x1 - a.shape.x0) > 100) continue;
    const c = centreOf(a);
    const near = OBJECTS.filter(o => Math.hypot(o.x - c.x, o.z - c.z) < 34);
    if (!near.length) missing.push(id);
  }
  assert.deepEqual(missing, [], 'named place with nothing built at it');
});

test('the walled rooms enclose their own plot and nothing else', () => {
  for (const [id, r] of Object.entries(PLOTS)) {
    if (id === 'wwa.market') continue;           // the square is open by definition
    const walls = OBJECTS.filter(o => o.type === 'retaining'
      && o.x > r.x0 - 4 && o.x < r.x1 + 4 && o.z > r.z0 - 4 && o.z < r.z1 + 4);
    assert.ok(walls.length >= 3, `${id} has ${walls.length} wall runs — it is not a room`);
  }
});

test('no prop, named body or gather node in Whitewall is inside a collider', () => {
  const buried = [];
  for (const p of placements()) {
    const hit = blockedBy(p.x, p.z, 0);
    if (hit.length) buried.push(`${p.kind} ${p.id} in ${p.area} -> ${hit.map(name).join(', ')}`);
  }
  assert.deepEqual(buried, []);
});

test('every prop, body and node can be walked up to from its own area centre', () => {
  const stuck = [];
  for (const p of placements()) {
    const c = centreOf(AREAS[p.area]);
    const r = walkable([c.x, c.z], [p.x, p.z]);
    // The Yard's centre is the Lantern Spire's base, so the market's props are reached from the
    // Yard post instead — the one place in Whitewall where the area centre is a building.
    if (!r.ok && p.area !== 'wwa.market') stuck.push(`${p.id}: ${r.by.join(', ')} at ${r.at}`);
  }
  assert.deepEqual(stuck, []);
});

test('the granary the game opens in is enterable, and has room for its eight rats', () => {
  const r = PLOTS['wwa.granary'];
  const c = centreOf(AREAS['wwa.granary']);
  // beginCampaign() puts the player on the area centre, so that one point has to be standable.
  assert.ok(clear(c.x, c.z), 'the light.01 spawn point is inside a building');
  // and the door, six metres outside it, has to reach it
  assert.deepEqual(walkable([-547, r.z1 + 6], [c.x, c.z]).ok, true, 'the granary door is blocked');

  let room = 0;
  for (let z = r.z0 + 2; z <= r.z1 - 2; z += 1.5) {
    for (let x = r.x0 + 2; x <= r.x1 - 2; x += 1.5) if (clear(x, z)) room++;
  }
  assert.ok(room > 40, `only ${room} standable metres inside the granary`);
});

test('each named room has a doorway a player fits through', () => {
  // A route starts outside, comes straight in through the doorway, and then turns for the centre.
  // The Almonry has two doors because it has two door props on its south wall.
  const routes = {
    'wwa.temple': [[[-520, -40], [-520, -26]]],
    'wwa.granary': [[[-547, -8], [-547, -20]]],
    'wwa.kitchen': [[[-491, -40], [-491, -26]]],
    'wwa.cells': [[[-539, -116], [-539, -128]]],
    'wwa.almonry': [[[-460.8, -90], [-460.8, -104]], [[-447.5, -90], [-447.5, -104]]],
    'wwa.cloister': [[[-556, -111]]],
    'wwa.works': [[[-566, -43]]],
  };
  for (const [id, list] of Object.entries(routes)) {
    const c = centreOf(AREAS[id]);
    for (const route of list) {
      const legs = [...route, [c.x, c.z]];
      for (let i = 0; i < legs.length - 1; i++) {
        const r = walkable(legs[i], legs[i + 1]);
        assert.equal(r.ok, true, `${id} ${legs[i]} → ${legs[i + 1]}: ${r.by?.join(', ')} at ${r.at}`);
      }
    }
  }
});

test('the precinct wall is solid everywhere except its four gates', () => {
  const open = [];
  const gapAt = (side, along) => {
    const g = GATES[side];
    return Math.abs(along - (g.axis === 'x' ? g.x : g.z)) < 20;
  };
  const probe = (x, z, side, along) => {
    if (gapAt(side, along)) return;
    if (!blockedBy(x, z, 0).length) open.push(`${side} wall at (${x}, ${z})`);
  };
  for (let x = CIRCUIT.x0; x <= CIRCUIT.x1; x += 2) {
    probe(x, CIRCUIT.z0, 'north', x);
    probe(x, CIRCUIT.z1, 'south', x);
  }
  for (let z = CIRCUIT.z0; z <= CIRCUIT.z1; z += 2) {
    probe(CIRCUIT.x0, z, 'west', z);
    probe(CIRCUIT.x1, z, 'east', z);
  }
  assert.deepEqual(open, []);
});

test('all four gates are walked through, not looked at', () => {
  for (const [side, g] of Object.entries(GATES)) {
    const n = g.axis === 'x' ? [0, 1] : [1, 0];
    const a = [g.x - n[0] * 16, g.z - n[1] * 16];
    const b = [g.x + n[0] * 16, g.z + n[1] * 16];
    const r = walkable(a, b);
    assert.equal(r.ok, true, `the ${side} gate is shut: ${r.by?.join(', ')} at ${r.at}`);
  }
});

test('no wall run is long enough to grow a gatehouse the collider then shuts', () => {
  for (const o of OBJECTS) {
    if (o.type !== 'wallRun') continue;
    assert.ok(o.p.length <= 24, `a ${o.p.length} m run at (${o.x}, ${o.z}) builds an arch nobody can pass`);
  }
});

test('every enterable house has three metres of clear ground in front of its door', () => {
  // doors.js walks the player to `pos + n · OUT` before the leaf opens; buildings.js puts the
  // door on the local +z face.
  const OUT = 3.1;
  const blocked = [];
  for (const o of OBJECTS) {
    if (o.type !== 'house') continue;
    assert.ok(o.p.w >= HOUSE_MIN_W, `house at (${o.x}, ${o.z}) is ${o.p.w} m wide`);
    const nx = Math.sin(o.ry), nz = Math.cos(o.ry);
    const reach = o.p.d / 2 + OUT;
    const hit = blockedBy(o.x + nx * reach, o.z + nz * reach, 0).filter(b => b.o !== o);
    if (hit.length) blocked.push(`house(${o.x}, ${o.z}) -> ${hit.map(name).join(', ')}`);
  }
  assert.deepEqual(blocked, []);
});

test('every object stays inside the schema its type declares', () => {
  for (const o of OBJECTS) {
    const t = TYPES[o.type];
    assert.ok(t, `${o.type} is not a scene type`);
    for (const s of t.params) {
      const v = o.p[s.key];
      assert.ok(Number.isFinite(v), `${o.type}(${o.x}, ${o.z}).${s.key} is ${v}`);
      assert.ok(v >= s.min && v <= s.max, `${o.type}(${o.x}, ${o.z}).${s.key} = ${v}, outside ${s.min}..${s.max}`);
    }
  }
});

test('the light-side river stands are places, not bare bank', () => {
  for (const id of ['wwa.fishsteps', 'stand.chalk', 'stand.low', 'stand.east']) {
    const a = AREAS[id];
    const near = OBJECTS.filter(o => contains(a, o.x, o.z) || Math.hypot(o.x - centreOf(a).x, o.z - centreOf(a).z) < a.shape.r + 12);
    assert.ok(near.length >= 2, `${id} has ${near.length} objects`);
  }
});

test('a gap cut out of a wall line leaves the two stretches either side of it', () => {
  assert.deepEqual(segments(0, 100, [[40, 60]]), [[0, 40], [60, 100]]);
  assert.deepEqual(segments(0, 100, [[-10, 10]]), [[10, 100]]);
  assert.deepEqual(segments(0, 100, []), [[0, 100]]);
  assert.deepEqual(segments(0, 100, [[0, 100]]), []);
});
