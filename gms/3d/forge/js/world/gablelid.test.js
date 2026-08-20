import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { lidBands, gableUnder } from './gablelid.js';

const HERE = dirname(fileURLToPath(import.meta.url));

// The rig, from js/player.js. `dist`, `heightIn`, `camRadius`, `armMin` and the two pitches are
// the arm; interior.js clamps a loft to 3.00–4.05 m and stairs.js only fits a stair in a room
// wider than 2R + 1.80 by 2R + 1.05, which is the sweep below.
const EYE = 2.05, DIST = 2.10, RAD = 0.26, ARM_MIN = 0.40, WALL_T = 0.18, DROP = 0.20;
const PITCH = [0.26, 0.50, -0.35];
const rise = half => Math.min(half * 0.4, 1.28);

function rooms() {
  const out = [];
  for (const rx of [4.4, 4.65, 5.05, 5.4, 6.4, 8.4, 10.4]) {
    for (const rz of [3.9, 4.4, 4.9, 5.4, 6.4]) {
      for (const h of [3.00, 3.13, 3.20, 3.68, 4.05]) out.push({ rx, rz, roomH2: h });
    }
  }
  return out;
}

const bandsFor = (r, drop = DROP, eye = EYE, radius = RAD) =>
  lidBands(r.roomH2, rise(Math.min(r.rx, r.rz)), Math.min(r.rx, r.rz), WALL_T, eye, radius, drop);

// The room's collider set as doors.js lays it out, in the room's own frame with the ridge on the
// x axis: four walls, the flat lid at the structural ceiling, then the bands under it. Boxes are
// half-extents about a centre, which is what colliders.js `slab` reads.
function boxes(r) {
  const half = Math.min(r.rx, r.rz), run = Math.max(r.rx, r.rz) + WALL_T;
  const top = r.roomH2, y1 = top + 0.45;
  const B = [
    { cx: 0, cz: -half - WALL_T, hx: run, hz: WALL_T, y0: -9, y1 },
    { cx: 0, cz: half + WALL_T, hx: run, hz: WALL_T, y0: -9, y1 },
    { cx: run, cz: 0, hx: WALL_T, hz: half + WALL_T, y0: -9, y1 },
    { cx: -run, cz: 0, hx: WALL_T, hz: half + WALL_T, y0: -9, y1 },
    { cx: 0, cz: 0, hx: run, hz: half + WALL_T, y0: top, y1: top + 0.3 },
  ];
  for (const { u0, u1, lid } of bandsFor(r)) {
    if (!u0) { B.push({ cx: 0, cz: 0, hx: run, hz: u1, y0: lid, y1 }); continue; }
    for (const s of [-1, 1]) B.push({ cx: 0, cz: s * (u0 + u1) / 2, hx: run, hz: (u1 - u0) / 2, y0: lid, y1 });
  }
  return B;
}

// colliders.js `slab`, unrotated: nearest entry along the ray within `max`, boxes fattened by the
// camera's radius.
function hit(o, d, max, B) {
  let best = max;
  for (const b of B) {
    let t0 = 0, t1 = best;
    const axis = (l, u, e) => {
      if (Math.abs(u) < 1e-6) return Math.abs(l) <= e;
      const a = (-e - l) / u, c = (e - l) / u;
      t0 = Math.max(t0, Math.min(a, c));
      t1 = Math.min(t1, Math.max(a, c));
      return t0 <= t1;
    };
    const cy = (b.y0 + b.y1) / 2, hy = (b.y1 - b.y0) / 2;
    if (axis(o[0] - b.cx, d[0], b.hx + RAD) && axis(o[1] - cy, d[1], hy + RAD)
      && axis(o[2] - b.cz, d[2], b.hz + RAD) && t0 < best) best = t0;
  }
  return best;
}

// The worst the camera gets above the gable, over the walkable floor × 12 headings × the three
// pitches, for the eye positions the bands are able to defend — i.e. those where the ceiling is
// still clear of the eye. Out past that the eye is inside the roof and no box can be put there.
// Split by whether the arm ended on `armMin`: there the collider asked for a shorter arm than the
// rig will give and the last centimetres are player.js's floor, not the lid's doing.
function worstOver(r, B = boxes(r)) {
  const half = Math.min(r.rx, r.rz), rs = rise(half);
  const under = u => gableUnder(r.roomH2, rs, half, u);
  let free = -9, floored = -9;
  for (let uE = 0; uE <= half - 0.42 + 1e-9; uE += 0.25) {
    if (under(uE) < EYE + RAD) continue;
    for (const p of PITCH) {
      const cp = Math.cos(p), sp = Math.sin(p);
      for (let h = 0; h < 12; h++) {
        const yaw = h / 12 * Math.PI * 2;
        const d = [-Math.sin(yaw) * cp, sp, -Math.cos(yaw) * cp];
        const o = [0, EYE, uE];
        const clear = hit(o, d, DIST, B);
        const want = clear < DIST ? clear - 0.06 : DIST;
        const a = Math.max(ARM_MIN, want);
        const over = o[1] + d[1] * a - under(o[2] + d[2] * a);
        if (want < ARM_MIN) floored = Math.max(floored, over);
        else free = Math.max(free, over);
      }
    }
  }
  return { free, floored };
}

test('the gable underside is the one stairs.js builds', () => {
  // door 10's loft, the lowest in the world: camfit raycasts 3.05 m at the ridge and 1.90 m at
  // 0.9 of the half-width, off the built mesh.
  assert.equal(+gableUnder(3.13, 1.28, 4.4, 0).toFixed(2), 3.05);
  assert.equal(+gableUnder(3.13, 1.28, 4.4, 0.9 * 4.4).toFixed(2), 1.90);
});

test('no lid band comes down onto the eye, which would collapse the arm in every direction', () => {
  for (const r of rooms()) {
    for (const { lid, u0 } of bandsFor(r)) {
      assert.ok(lid - RAD - EYE >= 0.05,
        `${r.rx}×${r.rz} h${r.roomH2}: band at u=${u0.toFixed(2)} lids ${lid.toFixed(3)} over a ${EYE} m eye`);
    }
  }
});

test('a band never stands more than the camera radius above the ceiling it covers', () => {
  for (const r of rooms()) {
    const half = Math.min(r.rx, r.rz), rs = rise(half);
    for (const { u0, u1, lid } of bandsFor(r)) {
      if (lid <= EYE + RAD + 0.09) continue;   // the flat clearance band, which cannot follow
      assert.ok(lid - gableUnder(r.roomH2, rs, half, u1) <= RAD + 1e-9,
        `${r.rx}×${r.rz} h${r.roomH2}: band ${u0.toFixed(2)}–${u1.toFixed(2)} lids ${lid.toFixed(3)} `
        + `over a ${gableUnder(r.roomH2, rs, half, u1).toFixed(3)} ceiling`);
    }
  }
});

test('a step taller than the camera radius stops containing the slope', () => {
  // the widest loft in the world, where the whole half-width is sloped band and none of it is the
  // flat clearance one — so this reads the drop and nothing else
  const roomH2 = 4.05, half = 6.4, rs = rise(half);
  const gap = drop => lidBands(roomH2, rs, half, WALL_T, EYE, RAD, drop)
    .filter(b => b.u0)
    .map(b => b.lid - gableUnder(roomH2, rs, half, b.u1));
  assert.ok(Math.max(...gap(DROP)) <= RAD, 'the default drop is inside the camera radius');
  assert.ok(Math.max(...gap(0.6)) > RAD,
    'the drop knob is meant to be the thing that trades tightness for boxes');
});

test('the arm cannot put the camera above a loft gable anywhere the bands can reach', () => {
  for (const r of rooms()) {
    const { free, floored } = worstOver(r);
    const half = Math.min(r.rx, r.rz);
    // the boarding's own vertical half-thickness: inside it the camera is still in the slab, which
    // is what the near plane needs, rather than out in the roof void looking at sky
    const board = 0.075 * Math.hypot(1, rise(half) / half);
    assert.ok(free <= 0, `${r.rx}×${r.rz} h${r.roomH2}: camera ${free.toFixed(3)} m above the gable`);
    assert.ok(floored < board,
      `${r.rx}×${r.rz} h${r.roomH2}: armMin leaves the camera ${floored.toFixed(3)} m up, past ${board.toFixed(3)} m of board`);
  }
});

test('the flat ridge lid alone is what let it through, so the bands are load-bearing', () => {
  const r = { rx: 5.4, rz: 4.4, roomH2: 3.13 };
  const flatOnly = boxes(r).slice(0, 5);
  assert.ok(worstOver(r, flatOnly).free > 0.1,
    'door 10 loft used to show sky through the roof; this is the condition that produced it');
});

test('doors.js builds its loft lid out of gablelid.js and keeps the flat one under everything', () => {
  const src = readFileSync(resolve(HERE, 'doors.js'), 'utf8');
  assert.match(src, /import \{ lidBands \} from '\.\/gablelid\.js'/);
  const body = src.slice(src.indexOf('  lidBoxes(I, oy'));
  assert.match(body, /wallBox\(0, 0, I\.rx \+ th, I\.rz \+ th, oy \+ I\.top, oy \+ I\.top \+ 0\.3/,
    'the flat lid is what every ground floor and every flat-ceilinged room still rays against');
  assert.match(body, /if \(!I\.loft\) return out;/);
  assert.match(body, /lidBands\(I\.roomH2, gableRise\(I\), Math\.min\(I\.rx, I\.rz\), th,\s*P\.heightIn, P\.camRadius, this\.lidDrop\)/);
  assert.match(body, /for \(const \{ u0, u1, lid \} of bands\)/);
  assert.match(body, /const y0 = oy \+ I\.deck \+ lid;/,
    'a band lid is a height above the deck; anything else puts the boxes in the wrong place');
});

test('the loft step is a knob and rebuilding it mid-climb is refused', () => {
  const src = readFileSync(resolve(HERE, 'doors.js'), 'utf8');
  assert.match(src, /q\.register\(\{ key: 'lidDrop',[^\n]*default: 0\.20/);
  assert.match(src, /this\.lidDrop = v; if \(this\.state === 'in' && !this\.climb\.running\) this\.wallColliders\(this\.active\)/,
    'climb.js drives heightIn down to 1.55, so bands placed mid-climb would swallow the eye after it');
});
