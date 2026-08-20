// Whitewall against the files the game actually reads. Nothing here carries its own copy of a
// coordinate: the areas, the props, the bodies and the nodes all come off disk, so moving a rect
// in data/areas.json without moving the building turns these red.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TYPES, HOUSE_MIN_W, TOWER_FOOT } from './scene.js';
import { whitewall, PLOTS, PAVED, SPOTS, GATES, CIRCUIT, segments } from './whitewall.js';
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

// The coverage test below reads the area table rather than the quest graph. Walking `area` / `in`
// / `at` keys out of the packs only ever found 15 of the 19 light-side areas, so the Spire, the
// board, the Cloister and three of the four gates had nothing asserting they were built at all.
// These three are the only exemptions: a reach and a town are regions, covered through the
// children standing inside them. Adding to this list is how the coverage would go hollow again,
// which is what the test under it is for.
const REGIONS = ['wwa', 'reach.light', 'reach.east'];
const plotAreas = () => lightAreas().filter(a => !REGIONS.includes(a.id));

// Does an object's collider plan overlap the area's shape at all? Separating-axis on the four
// candidate axes for a rect, closest-point for a circle. This replaces a 34 m radius around the
// area centre, which in a town of 20 m plots asked "is there a building somewhere near here" —
// true of eleven of the twelve areas it checked even with their own geometry deleted.
function overlaps(area, o) {
  const s = area.shape;
  const [hw, hd] = TYPES[o.type].plan(o.p);
  const c = Math.cos(o.ry), sn = Math.sin(o.ry);
  if (s.k === 'circle') {
    const px = s.x - o.x, pz = s.z - o.z;
    const lx = px * c - pz * sn, lz = px * sn + pz * c;
    return Math.hypot(Math.max(0, Math.abs(lx) - hw), Math.max(0, Math.abs(lz) - hd)) <= s.r;
  }
  const rhw = Math.abs(s.x1 - s.x0) / 2, rhd = Math.abs(s.z1 - s.z0) / 2;
  const dx = o.x - (s.x0 + s.x1) / 2, dz = o.z - (s.z0 + s.z1) / 2;
  const ac = Math.abs(c), as = Math.abs(sn);
  if (Math.abs(dx) > rhw + hw * ac + hd * as || Math.abs(dz) > rhd + hw * as + hd * ac) return false;
  const lx = dx * c + dz * sn, lz = dz * c - dx * sn;
  return Math.abs(lx) <= hw + rhw * ac + rhd * as && Math.abs(lz) <= hd + rhw * as + rhd * ac;
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

test('every light-side plot has geometry standing inside its own shape', () => {
  const missing = [];
  for (const a of plotAreas()) if (!OBJECTS.some(o => overlaps(a, o))) missing.push(a.id);
  assert.deepEqual(missing, [], 'named place with nothing built on it');
});

const extremes = a => (a.shape.k === 'circle'
  ? [[a.shape.x - a.shape.r, a.shape.z], [a.shape.x + a.shape.r, a.shape.z],
    [a.shape.x, a.shape.z - a.shape.r], [a.shape.x, a.shape.z + a.shape.r]]
  : [[a.shape.x0, a.shape.z0], [a.shape.x1, a.shape.z1]]);

test('the only areas exempt from that are regions holding a place that is not', () => {
  for (const id of REGIONS) {
    const a = AREAS[id];
    assert.ok(a?.shape.k === 'rect' && Math.abs(a.shape.x1 - a.shape.x0) >= 100,
      `${id} is exempt from the coverage test and is not big enough to be a region`);
    const held = lightAreas().filter(k => k !== a && extremes(k).every(([x, z]) => contains(a, x, z)));
    assert.ok(held.length, `${id} is exempt from the coverage test and holds nothing that is not`);
  }
});

// Which side of which room is deliberately open. `wwa.cells` has no north wall because the
// precinct wall is it; the works yard is open to the street on the east.
const OPEN_SIDE = { 'wwa.cells': ['n'], 'wwa.works': ['e'] };

test('every side of a walled room has wall on it, except the sides that are meant to be open', () => {
  const bare = [];
  for (const [id, r] of Object.entries(PLOTS)) {
    if (id === 'wwa.market') continue;           // the square is open by definition
    const on = (axis, at) => OBJECTS.some(o => o.type === 'retaining'
      && Math.abs((axis === 'x' ? o.z : o.x) - at) < 2
      && (axis === 'x' ? o.x > r.x0 - 2 && o.x < r.x1 + 2 : o.z > r.z0 - 2 && o.z < r.z1 + 2));
    for (const [side, axis, at] of [['n', 'x', r.z0], ['s', 'x', r.z1], ['w', 'z', r.x0], ['e', 'z', r.x1]]) {
      if (OPEN_SIDE[id]?.includes(side)) continue;
      if (!on(axis, at)) bare.push(`${id} ${side}`);
    }
  }
  assert.deepEqual(bare, [], 'a room with a side missing is a courtyard, not a room');
});

test('the square and every walled room stands on paved ground, not on lawn', () => {
  // terrain.groundColour() never reads the scatter mask, so masking scatter off a rect cannot
  // stop the rect being green. Only a surface can — see terrain.addPatch, demoScene.paveLight.
  assert.deepEqual(new Set(PAVED), new Set(Object.values(PLOTS)));
});

test('a tower is collided at the foot it is drawn with, not at its shaft', () => {
  // buildings.js flares the battered foot out to TOWER_FOOT × radius at ground level. While the
  // collider was the bare shaft, the player walked 4 m into the Lantern Spire's plinth.
  assert.ok(TOWER_FOOT > 1, 'the drawn foot is wider than the shaft');
  for (const o of OBJECTS) {
    if (o.type !== 'tower') continue;
    assert.equal(TYPES.tower.plan(o.p)[0], o.p.radius * TOWER_FOOT, `tower(${o.x}, ${o.z})`);
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
