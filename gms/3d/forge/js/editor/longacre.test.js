// Longacre against the files the game actually reads, and against the King's Road, which is the
// one thing Whitewall never had to share a plan with. Nothing here carries its own copy of a
// coordinate: the areas, the props, the bodies, the nodes and the road all come off disk or out of
// field.js.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TYPES, HOUSE_MIN_W, tall } from './scene.js';
import { longacre, PLOTS, PAVED, SPOTS, GREEN_IDS } from './longacre.js';
import { whitewall } from './whitewall.js';
import { row } from './townkit.js';
import { ROADS, roadLine, roadPoints, depthAt } from '../world/field.js';
import { anchor } from '../game/placement.js';
import { contains, centreOf } from '../game/areas.js';

const DATA = resolve(dirname(fileURLToPath(import.meta.url)), '../../data');
const load = f => JSON.parse(readFileSync(`${DATA}/${f}`, 'utf8'));

const AREAS = Object.fromEntries(load('areas.json').map(a => [a.id, a]));
const OBJECTS = longacre();

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

const neutralAreas = () => Object.values(AREAS).filter(a => a.town === 'neutral');

// A reach and a town are regions, covered through the children standing inside them. Adding to
// this list is how the coverage test would go hollow, which is what the test under it is for.
const REGIONS = ['lac', 'reach.neutral'];
const plotAreas = () => neutralAreas().filter(a => !REGIONS.includes(a.id));

// Does an object's collider plan overlap the area's shape at all? Separating-axis for a rect,
// closest-point for a circle — the same test whitewall.test.js uses, and for the same reason: a
// radius round the area centre asks "is there a building somewhere near here".
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

// Every prop, body, node and escorted animal the placement layer puts inside a neutral-side area,
// at the same world coordinate js/game/placement.js computes for it.
function placements() {
  const out = [];
  for (const f of ['props.json', 'cast_at.json', 'gather.json', 'escorts.json']) {
    for (const e of load(f)) {
      const area = AREAS[e.area];
      if (area?.town !== 'neutral') continue;
      const at = anchor(area, e.at || [0, 0]);
      out.push({ kind: f.replace('.json', ''), id: e.id, area: e.area, ...at });
    }
  }
  return out;
}

// The stations of every road that runs through Longacre, and the carriageway a cart gets on them.
// terrain.js roadSeg narrows a road by `1 - 0.55 · townAt().m` and then wobbles it by up to 17 %,
// so where the town factor is full the King's Road's half-width is 4.74 m — WORLD.md §4.4's
// "tapering to 4 m inside one". `townAt` releases near the water and the ribbon fans back out
// over the bank there; that is the ground being a flood plain rather than the street getting
// wider, so the figure a layout has to respect is the town one at every station.
const CARRIAGEWAY = 9 * (1 - 0.55) * 1.17;

function carriageway() {
  const out = [];
  for (const r of ROADS) {
    const line = roadLine(roadPoints(r), 3);
    for (let i = 0; i < line.length; i++) {
      const p = line[i];
      if (!contains(AREAS.lac, p[0], p[1])) continue;
      const q = line[Math.min(i + 1, line.length - 1)], o = line[Math.max(i - 1, 0)];
      const nx = -(q[1] - o[1]), nz = q[0] - o[0];
      const l = Math.hypot(nx, nz) || 1;
      out.push({ x: p[0], z: p[1], nx: nx / l, nz: nz / l, hw: Math.min(r.width / 2, CARRIAGEWAY) });
    }
  }
  return out;
}

test('the plots and spots are the shapes data/areas.json declares, to the metre', () => {
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
});

test('every neutral-side plot has geometry standing inside its own shape', () => {
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
    const held = neutralAreas().filter(k => k !== a && !REGIONS.includes(k.id)
      && extremes(k).every(([x, z]) => contains(a, x, z)));
    assert.ok(held.length, `${id} is exempt from the coverage test and holds nothing that is not`);
  }
});

test('no prop, body, node or escorted animal in Longacre is inside a collider', () => {
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
    const r = walkable([centreOf(AREAS[p.area]).x, centreOf(AREAS[p.area]).z], [p.x, p.z]);
    if (!r.ok) stuck.push(`${p.id}: ${r.by.join(', ')} at ${r.at}`);
  }
  assert.deepEqual(stuck, []);
});

test('nothing in Longacre is walled off from the King\'s Road, or standing in the water', () => {
  // A 1 m flood fill out of the road at the market cross, over everything the town reaches. Test
  // 5 only shows a straight line from an area centre; this is the one that would catch a yard
  // enclosed on all four sides. Water is not walkable, so it also asserts that the mill reach's
  // content is on the bank rather than in the Vail.
  const X0 = -145, X1 = 170, Z0 = -75, Z1 = 160;
  const NX = X1 - X0, NZ = Z1 - Z0;
  const seen = new Uint8Array(NX * NZ);
  const open = (ix, iz) => clear(X0 + ix + 0.5, Z0 + iz + 0.5) && depthAt(X0 + ix + 0.5, Z0 + iz + 0.5) <= 0;

  const road = carriageway().reduce((a, b) => (Math.hypot(b.x, b.z - 30) < Math.hypot(a.x, a.z - 30) ? b : a));
  const start = [Math.round(road.x - X0), Math.round(road.z - Z0)];
  assert.ok(open(start[0], start[1]), 'the King\'s Road at the market square is blocked');

  const q = [start[0] + start[1] * NX];
  seen[q[0]] = 1;
  for (let h = 0; h < q.length; h++) {
    const i = q[h] % NX, j = (q[h] / NX) | 0;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + di, b = j + dj;
      if (a < 0 || b < 0 || a >= NX || b >= NZ) continue;
      const k = a + b * NX;
      if (seen[k] || !open(a, b)) continue;
      seen[k] = 1;
      q.push(k);
    }
  }

  const cut = [];
  for (const p of placements()) {
    const k = Math.round(p.x - X0 - 0.5) + Math.round(p.z - Z0 - 0.5) * NX;
    if (!seen[k]) cut.push(`${p.id} in ${p.area} at (${p.x.toFixed(1)}, ${p.z.toFixed(1)})`);
  }
  assert.deepEqual(cut, []);
});

test('nothing but the market cross is built on the King\'s Road through Longacre', () => {
  // The road is the town's High Street and its plan, not a thing laid over it afterwards; three
  // buildings and a fence were moved because of this test. A market cross standing in the road at
  // the junction is the one exception, because that is what a market cross is.
  const on = new Set();
  for (const s of carriageway()) {
    for (let t = -1; t <= 1.0001; t += 0.2) {
      for (const b of blockedBy(s.x + s.nx * t * s.hw, s.z + s.nz * t * s.hw, 0)) on.add(b);
    }
  }
  assert.deepEqual([...on].filter(b => b.o.type !== 'cross').map(name), []);
  assert.deepEqual([...on].map(name), ['cross(0, 25.5)'], 'the cross has left the road, or gained company');
});

test('the barn plat is a yard: something on every side of it, and the barn on the south', () => {
  // The coverage test above is satisfied by the Tithe Barn alone, which touches the plot's south
  // edge and nothing else — so without this, deleting every wall of the plat stays green. This is
  // the same hole whitewall.test.js's per-side room test was written to close.
  const r = PLOTS['lac.barn'];
  const near = (axis, at, want) => OBJECTS.some(o => o.type === want
    && Math.abs((axis === 'x' ? o.z : o.x) - at) < 2.5
    && (axis === 'x' ? o.x > r.x0 - 4 && o.x < r.x1 + 4 : o.z > r.z0 - 4 && o.z < r.z1 + 4));
  const bare = [];
  for (const [side, axis, at] of [['n', 'x', r.z0], ['w', 'z', r.x0], ['e', 'z', r.x1]]) {
    if (!near(axis, at, 'retaining')) bare.push(side);
  }
  const barn = OBJECTS.find(o => o.type === 'barn');
  if (!barn || Math.abs(barn.z - barn.p.d / 2 - r.z1) > 2.5) bare.push('s');
  assert.deepEqual(bare, [], 'a barn plat with a side missing is a field with a table in it');
});

test('Longacre is unwalled, ungated and has one landmark', () => {
  // STORY.md §1: "Longacre is the only unwalled town in the valley." zones.js neutral says
  // `walled: false`. This is the assertion that stops the second town being the first one in
  // different paint — Whitewall is 29 wallRun, 13 tower and 7 arcade.
  const count = t => OBJECTS.filter(o => o.type === t).length;
  assert.equal(count('wallRun'), 0, 'a curtain wall');
  assert.equal(count('arcade'), 0, 'a colonnade in a farm village');
  assert.equal(count('tower'), 1, 'the seed store is the only tower');
  const yard = OBJECTS.filter(o => o.type === 'retaining');
  assert.ok(yard.length, 'no yard walls at all');
  for (const o of yard) assert.ok(o.p.height <= 3, `a ${o.p.height} m ${o.type} is a precinct wall, not a yard wall`);
});

test('the landmark is the shortest of the towns built so far', () => {
  const top = list => list.reduce((a, o) => Math.max(a, tall(o)), 0);
  assert.ok(top(OBJECTS) < top(whitewall()),
    'WORLD.md §3.2: the middle town is humble and reads as humble from the road');
  const t = OBJECTS.find(o => o.type === 'tower');
  assert.equal(tall(t), top(OBJECTS), 'something in Longacre is taller than its own landmark');
});

test('the Tithe Barn is the longest building in the world and stands clear of the plat', () => {
  const barn = OBJECTS.find(o => o.type === 'barn');
  assert.ok(barn, 'no Tithe Barn');
  const len = o => (o.type === 'arcade' ? o.p.length : o.p.w ?? 0);
  for (const o of [...OBJECTS, ...whitewall()]) {
    if (o === barn || !['house', 'mass', 'mill', 'barn'].includes(o.type)) continue;
    assert.ok(len(o) < barn.p.w, `${o.type}(${o.x}, ${o.z}) is ${len(o)} m against the barn's ${barn.p.w}`);
  }
  // and it is south of its plat, not on it — five things stand inside that rect
  assert.ok(barn.z - barn.p.d / 2 >= PLOTS['lac.barn'].z1, 'the Tithe Barn is standing on the barn plat');
});

test('the mill wheel turns in water', () => {
  // build.js mill() hangs the wheel off the +x face at w/2 + 0.9. If the mill drifts off the weir
  // the wheel is a 3.5 m paddle over a field, and field.js's 1.2 m drop at x −32…−12 — the one
  // its own comment calls "the Longacre weir that drives the mill wheel" — drives nothing.
  const m = OBJECTS.find(o => o.type === 'mill');
  assert.ok(m, 'no mill');
  const hub = m.p.w / 2 + 0.9;
  const x = m.x + Math.cos(m.ry) * hub, z = m.z - Math.sin(m.ry) * hub;
  assert.ok(depthAt(x, z) > 0, `the wheel hangs over dry land at (${x.toFixed(1)}, ${z.toFixed(1)})`);
});

// A named plot with this much bare ground in it reads as a lawn in the middle of a town unless
// something is done about it. 400 m² is a 20 m square. Whitewall surfaced its whole plot table;
// Longacre is a farm village and most of its ground is *meant* to be grass, so the rule is on the
// size of the hole rather than on the list.
const OPEN_GROUND = 400;

const openArea = r => {
  let free = 0;
  for (let z = r.z0 + 0.5; z < r.z1; z += 1) for (let x = r.x0 + 0.5; x < r.x1; x += 1) if (clear(x, z, 0)) free++;
  return free;
};

test('a plot with 400 m² of open ground is surfaced, or is a declared field', () => {
  const lawns = [];
  for (const [id, r] of Object.entries(PLOTS)) {
    if (PAVED.includes(r) || GREEN_IDS.includes(id)) continue;
    if (openArea(r) > OPEN_GROUND) lawns.push(id);
  }
  assert.deepEqual(lawns, [], 'terrain.groundColour() never reads the scatter mask; only a surface can stop a rect being green');
});

test('a declared field is a field: nothing on it but its fence, and no surface under it', () => {
  for (const id of GREEN_IDS) {
    const a = AREAS[id];
    assert.ok(!PAVED.includes(PLOTS[id]), `${id} is declared green and surfaced`);
    const built = OBJECTS.filter(o => overlaps(a, o) && o.type !== 'pen');
    assert.deepEqual(built.map(o => `${o.type}(${o.x}, ${o.z})`), [],
      `${id} is exempt from the surfacing rule and is not a field`);
  }
});

test('everything surfaced is a plot of this town', () => {
  for (const r of PAVED) {
    assert.ok(Object.values(PLOTS).includes(r), `a surfaced rect that is not a plot: ${JSON.stringify(r)}`);
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

test('townkit row() staggers alternate plots, and leaves a terrace in a line without one', () => {
  const line = [];
  row(line, { axis: 'x', front: 0, facing: -1, from: 0, to: 40, n: 4, w: 8, d: 10, h: 7 });
  assert.equal(new Set(line.map(o => o.z)).size, 1, 'Whitewall\'s rows moved');
  const broken = [];
  row(broken, { axis: 'x', front: 0, facing: -1, from: 0, to: 40, n: 4, w: 8, d: 10, h: 7, stagger: 2 });
  assert.deepEqual(broken.map(o => o.z - line[0].z), [0, -2, 0, -2]);
});
