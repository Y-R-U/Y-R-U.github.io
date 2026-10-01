// node tools/player_test.mjs — pure parts of lane 3: collision, snapping, survival cost.
import { BODY, moveBody, sweep, boxOf, canJumpOver, unstick, fallDamage } from '../js/player/physics.js';
import { placeBox, breakBox, unionBox, clampVolume, costUnits, payUnits, subsToBlocks, aabbOverlapsSubBox, boxVolume } from '../js/player/brushmath.js';
import { StubWorld, BLOCKS } from './player_stubworld.js';
import { Inventory } from '../js/game/inventory.js';
import { readBox, writeBox, rleEncode, rleDecode, greedyBoxes, rotateY, mirrorX, stampBox, createHistory } from '../js/player/edits.js';
import { createItems } from '../js/data/items.js';

let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) pass++; else { fail++; console.log('FAIL', msg); } };
const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const w = new StubWorld();
const solid = (x, y, z) => w.isSolidSub(x, y, z);
const body = (x, y, z, h = BODY.H) => ({ x, y, z, h, onGround: false });

function sim(b, vx, vz, secs, opts = { step: true }) {
  let vy = 0;
  for (let t = 0; t < secs; t += 1 / 60) {
    vy = Math.max(vy - BODY.GRAVITY / 60, -BODY.TERMINAL);
    const r = moveBody(solid, b, vx / 60, vy / 60, vz / 60, opts);
    if (r.hitY) vy = 0;
  }
  return b;
}

// --- falling and resting
{
  const b = sim(body(-20.5, 40, -20.5), 0, 0, 2);
  ok(near(b.y, 32) && b.onGround, `land on ground y=32 (got ${b.y})`);
  const b2 = sim(body(-20.5, 32, -20.5), 0, 0, 1);
  ok(near(b2.y, 32), 'rest stable');
}
// --- high speed doesn't tunnel
{
  const b = body(-20.5, 60, -20.5);
  const r = moveBody(solid, b, 0, -50, 0);
  ok(near(b.y, 32) && r.hitY, 'no tunnelling through floor');
}
// --- walls: stop flush
{
  const b = sim(body(0.5, 32, 0.5), -4.3, 0, 2, { step: false });
  ok(near(b.x, -2 + 0.3, 1e-4), `flush against wall (x=${b.x})`);
  const b0 = sim(body(-1.5, 32, -5.5), 4.3, 0, 1, { step: false });
  ok(near(b0.x, -0.3, 1e-4), `0.25 step blocks when stepping is off (x=${b0.x})`);
}
// --- auto-step: 0.25 and 0.5 climb, 1.0 does not
{
  const b = sim(body(-1.5, 32, -5.5), 4.3, 0, 0.6);
  ok(b.x > 0.5 && b.y >= 32.25 - 1e-6, `steps onto 0.25 (x=${b.x.toFixed(2)} y=${b.y})`);
  // staircase +0.25, +0.25, +0.5 is climbed; the +1.0 wall after it stops the walk
  const b2 = sim(body(-1.5, 32, -5.5), 4.3, 0, 2);
  ok(near(b2.x, 3 - 0.3, 1e-4) && near(b2.y, 33, 1e-4), `climbs 0.25/0.5 staircase, stops at +1 (x=${b2.x} y=${b2.y})`);
  // 1-unit ledge from ground level is not stepped
  const b4 = sim(body(-8, 32, 0.5), 4.3, 0, 1);
  ok(near(b4.x, -6.3, 1e-4) && near(b4.y, 32), `1+ ledge blocks (x=${b4.x} y=${b4.y})`);
}
// --- auto-jump test
{
  const b = body(1.65, 32.5, -5.5); b.onGround = true;
  ok(canJumpOver(solid, b, 0.3, 0, 1.0), 'can jump onto 1.0 block');
  const b2 = body(-6.31, 32, 0.5); b2.onGround = true;
  ok(!canJumpOver(solid, b2, 0.3, 0, 1.0), 'cannot jump a 2-high ledge');
}
// --- crouch edge guard on the ledge (x -6..-2, top y=34)
{
  const b = sim(body(-2.5, 34, 0.5, BODY.CROUCH_H), 1.4, 0, 2, { step: true, edgeGuard: true });
  ok(b.y > 33.9 && b.x <= -2 + 0.3 + 0.05, `crouch doesn't walk off edge (x=${b.x.toFixed(3)} y=${b.y})`);
  const b2 = sim(body(-2.5, 34, 0.5), 4.3, 0, 2, { step: true });
  ok(b2.y < 33, `walking does fall off (y=${b2.y})`);
}
// --- unstick
{
  const b = body(-4, 32.5, 0.5);
  ok(unstick(solid, b) && near(b.y, 34), `unstick to top (y=${b.y})`);
}
ok(fallDamage(3) === 0 && fallDamage(5) === 1 && fallDamage(10) === 3.5, 'fall damage curve');

// --- sweep exactness vs fine grid
{
  const bx = boxOf(body(0.5, 32.25, -5.5));
  ok(near(sweep(solid, bx, 1, -1), 0), 'standing on 0.25 step: no downward room');
}

// --- snapping
{
  const top = [5, 127, 9];
  ok(eq(placeBox(top, [0, 1, 0], 1), { min: [4, 128, 8], max: [8, 132, 12] }), 'place scale 1 on top');
  ok(eq(placeBox(top, [0, 1, 0], 0.25), { min: [5, 128, 9], max: [6, 129, 10] }), 'place scale 0.25 on top');
  ok(eq(placeBox([5, 128, 9], [0, 1, 0], 1), { min: [4, 129, 8], max: [8, 133, 12] }), 'flush on a 0.25-high face, not snapped vertically');
  ok(eq(placeBox([8, 128, 3], [-1, 0, 0], 1), { min: [4, 128, 0], max: [8, 132, 4] }), 'place on -x face');
  ok(eq(placeBox([8, 128, 3], [1, 0, 0], 2), { min: [9, 128, 0], max: [17, 136, 8] }), 'place scale 2 on +x face');
  ok(eq(placeBox(top, [0, 1, 0], 1, [3, 2, 3]), { min: [0, 128, 4], max: [12, 136, 16] }), 'dims centre in-plane, extend off face');
  ok(eq(breakBox(top, [0, 1, 0], 2), { min: [0, 120, 8], max: [8, 128, 16] }), 'break scale 2 aligned');
  ok(eq(breakBox(top, [0, 1, 0], 0.25), { min: [5, 127, 9], max: [6, 128, 10] }), 'break scale 0.25');
  ok(eq(breakBox(top, [0, 1, 0], 1, [1, 3, 1]), { min: [4, 116, 8], max: [8, 128, 12] }), 'break dims go into surface');
  ok(eq(breakBox(top, [0, -1, 0], 1, [1, 2, 1]), { min: [4, 124, 8], max: [8, 132, 12] }), 'break from below goes up');
  const a = placeBox([0, 127, 0], [0, 1, 0], 1), b = placeBox([20, 127, -7], [0, 1, 0], 1);
  ok(eq(unionBox(a, b), { min: [0, 128, -8], max: [24, 132, 4] }), 'volume union');
  const big = clampVolume({ min: [0, 0, 0], max: [1000, 4, 4] }, { min: [0, 0, 0], max: [4, 4, 4] }, 256);
  ok(big.max[0] === 256, 'volume cap');
  const pl = boxOf(body(1.5, 32, 1.5));
  ok(!aabbOverlapsSubBox(pl, { min: [4, 124, 4], max: [8, 128, 8] }), 'block under feet is not "inside player"');
  ok(aabbOverlapsSubBox(pl, { min: [4, 128, 4], max: [8, 132, 8] }), 'block at feet is inside player');
  ok(!aabbOverlapsSubBox(pl, { min: [8, 128, 4], max: [9, 129, 5] }), '0.25 sub beside the AABB edge ok');
}

// --- cost fractions
{
  ok(costUnits(placeBox([0, 0, 0], [0, 1, 0], 0.25)) === 1, '0.25 costs 1/64');
  ok(costUnits(placeBox([0, 0, 0], [0, 1, 0], 1)) === 64, '1 costs 1 block');
  ok(costUnits(placeBox([0, 0, 0], [0, 1, 0], 2)) === 512, '2 costs 8 blocks');
  ok(costUnits({ min: [0, 0, 0], max: [3, 3, 3] }, 'hollow') === 26, 'hollow cost excludes interior');
  let credit = 0, have = 1, placed = 0;
  for (let i = 0; i < 70; i++) {
    const r = payUnits(credit, 1, have);
    if (!r.ok) break;
    have -= r.blocks; credit = r.credit; placed++;
  }
  ok(placed === 64 && have === 0 && credit === 0, `64 placements at 0.25 per block (placed ${placed})`);
  ok(eq(subsToBlocks(100, 30), { blocks: 2, carry: 2 }), 'subs → blocks with carry');
  // Lane 4's inventory handles 64ths natively.
  const items = createItems(BLOCKS);
  const inv = new Inventory(items);
  inv.add(10, 1);
  let n = 0;
  while (inv.canAfford(1 / 64) && n < 100) { inv.consume(1 / 64); n++; }
  ok(n === 64, `inventory: 64 × 0.25 placements per block (got ${n})`);
}

// --- stub raycast + setBox
{
  const hit = w.raycast([-20.5, 33.6, -20.5], [0, -1, 0], 6);
  ok(hit && eq(hit.sub, [-82, 127, -82]) && eq(hit.normal, [0, 1, 0]), 'raycast down hits ground top');
  const box = placeBox(hit.sub, hit.normal, 1);
  const r = w.setBox(box.min, box.max, 10, 'fill');
  ok(r.changed === 64, 'setBox fill one block');
  const r2 = w.setBox(box.min, box.max, 0, 'fill');
  ok(r2.changed === 64 && r2.removed[0].count === 64 && boxVolume(box) === 64, 'break returns removed subs');
}

// --- edit history, stamps
{
  const ew = new StubWorld();
  const min = [-8, 124, -26], max = [16, 140, -18];        // straddles the steps + ground
  const before = readBox(ew, min, max);
  let same = true;
  for (let y = min[1], i = 0; y < max[1]; y++) for (let z = min[2]; z < max[2]; z++) for (let x = min[0]; x < max[0]; x++, i++)
    if (before[i] !== ew.getSub(x, y, z)) same = false;
  ok(same, 'readBox matches getSub');
  ok(eq([...rleDecode(rleEncode(before), before.length)], [...before]), 'RLE round trip');
  ok(rleEncode(before).length < before.length / 4, `RLE compresses terrain (${rleEncode(before).length}/${before.length})`);
  const boxes = greedyBoxes(before, [24, 16, 8]);
  ok(boxes.reduce((a, b) => a + (b[3] - b[0]) * (b[4] - b[1]) * (b[5] - b[2]), 0) === before.length && boxes.length < 40, `greedy covers exactly (${boxes.length} boxes)`);
  const h = createHistory();
  ok(h.record(ew, min, max), 'record');
  ew.setBox(min, max, 10, 'hollow', { wall: 2 });
  ok(!eq([...readBox(ew, min, max)], [...before]), 'edit changed the box');
  h.undo(ew);
  ok(eq([...readBox(ew, min, max)], [...before]) && h.canRedo, 'undo restores exactly');
  h.redo(ew);
  const after = readBox(ew, min, max);
  ok(after.filter(v => v === 10).length > 0 && h.canUndo && !h.canRedo, 'redo re-applies');
  h.undo(ew);
  ok(eq([...readBox(ew, min, max)], [...before]), 'undo again');
  // cap by steps
  const h2 = createHistory({ maxSteps: 3 });
  for (let i = 0; i < 6; i++) h2.record(ew, [0, 128, 0], [4, 132, 4]);
  ok(h2.steps === 3, 'history step cap');
  const h3 = createHistory({ maxBytes: 100 });
  for (let i = 0; i < 6; i++) h3.record(ew, min, max);
  ok(h3.bytes <= 100 || h3.steps <= 1, 'history byte cap');
  // rotate / mirror
  const d = Uint8Array.from([1, 2, 3, 4, 5, 6]);                // size [3,1,2]: rows z0=[1,2,3], z1=[4,5,6]
  const r = rotateY(d, [3, 1, 2]);
  ok(eq(r.size, [2, 1, 3]) && eq([...rotateY(rotateY(rotateY(r.data, r.size).data, [3, 1, 2]).data, [2, 1, 3]).data], [...d]), 'rotate ×4 = identity');
  ok(eq([...mirrorX(d, [3, 1, 2]).data], [3, 2, 1, 6, 5, 4]), 'mirror X');
  ok(eq(stampBox([5, 127, 9], [0, 1, 0], [8, 4, 4], 4), { min: [0, 128, 4], max: [8, 132, 8] }), 'stamp sits on top, centred, grid aligned');
  ok(eq(stampBox([5, 129, 9], [1, 0, 0], [4, 8, 4], 1), { min: [6, 129, 7], max: [10, 137, 11] }), 'stamp on a side face: bottom at hit level');
  // keepAir paste leaves world where stamp is air
  const stamp = new Uint8Array(4 * 4 * 4); stamp[0] = 10;
  const pmin = [-80, 128, -80];
  ew.setBox([-79, 128, -80], [-78, 129, -79], 3, 'fill');
  writeBox(ew, pmin, [-76, 132, -76], stamp, { keepAir: true });
  ok(ew.getSub(-80, 128, -80) === 10 && ew.getSub(-79, 128, -80) === 3, 'keepAir paste');
}

// --- against lane 1's real World (sync generation)
try {
  const { World } = await import('../js/world/world.js');
  const rw = new World({ seed: 'synthwild', mode: 'survival' });
  const [sx, , sz] = rw.spawn;
  rw.ensureArea(sx, sz, 1);
  const rs = (x, y, z) => rw.isSolidSub(x, y, z);
  const b = { x: sx, y: rw.surfaceY(sx, sz) + 3, z: sz, h: BODY.H, onGround: false };
  let vy = 0;
  for (let i = 0; i < 120; i++) { vy -= BODY.GRAVITY / 60; const r = moveBody(rs, b, 0, vy / 60, 0, { step: true }); if (r.hitY) vy = 0; }
  ok(b.onGround && near(b.y, rw.surfaceY(sx, sz), 1e-6), `real world: lands on surfaceY (${b.y} vs ${rw.surfaceY(sx, sz)})`);
  const hit = rw.raycast([b.x, b.y + BODY.EYE, b.z], [0, -1, 0], 6);
  const pb = placeBox(hit.sub, hit.normal, 1);
  ok(aabbOverlapsSubBox(boxOf(b), pb), 'real world: block at own feet is refused');
  const r1 = rw.setBox(pb.min.map((v, i) => i === 0 ? v + 8 : v), pb.max.map((v, i) => i === 0 ? v + 8 : v), 10, 'fill');
  ok(r1.changed === 64, 'real world: place 1 block nearby');
  const hb = { min: [pb.min[0] - 16, pb.min[1], pb.min[2]], max: [pb.max[0] - 4, pb.max[1] + 12, pb.max[2] + 12] };
  const r2 = rw.setBox(hb.min, hb.max, 10, 'hollow', { wall: 2 });
  ok(r2.changed === costUnits(hb, 'hollow', 2), `real world: hollow wall:2 matches costUnits (${r2.changed} vs ${costUnits(hb, 'hollow', 2)})`);
  // undo on the real world: a box through terrain, trees and sky
  const umin = [Math.floor(sx * 4) - 24, Math.floor(rw.surfaceY(sx, sz) * 4) - 12, Math.floor(sz * 4) + 8];
  const umax = [umin[0] + 40, umin[1] + 40, umin[2] + 24];
  const orig = readBox(rw, umin, umax);
  const hist = createHistory();
  hist.record(rw, umin, umax);
  rw.setBox(umin, umax, 10, 'hollow', { wall: 4 });
  const t0 = performance.now();
  hist.undo(rw);
  const ms = performance.now() - t0;
  ok(eq([...readBox(rw, umin, umax)], [...orig]), `real world: undo restores exactly (${ms.toFixed(0)} ms)`);
} catch (e) { ok(false, 'real world tests: ' + e.message); }

console.log(`player_test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
