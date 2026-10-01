// Review R3 regression tests (node): node tools/r3_test.mjs
import { World } from '../js/world/world.js';
import { BLOCK } from '../js/data/blocks.js';
import { placeBox } from '../js/player/brushmath.js';
import { sanitizeSave } from '../js/net/savecheck.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };

// C11: a survival place never overwrites solid subs, even when the place box straddles two cells.
{
  const W = new World({ seed: 'r3place', sync: true });
  const [sx, , sz] = W.spawn;
  W.ensureArea(sx, sz, 1);
  for (const above of [BLOCK.BASALT_MATRIX, BLOCK.COREPLATE]) {
    const x = Math.floor(sx) + 4, z = Math.floor(sz), y0 = Math.floor(W.surfaceY(x + 0.5, z + 0.5)) + 1;
    W.setBox([x * 4, y0 * 4, z * 4], [x * 4 + 4, y0 * 4 + 12, z * 4 + 4], 0, 'fill', { flow: false });
    W.setBox([x * 4, y0 * 4, z * 4], [x * 4 + 4, y0 * 4 + 2, z * 4 + 4], BLOCK.LOAM_MESH, 'fill', { flow: false });
    W.setBox([x * 4, (y0 + 1) * 4, z * 4], [x * 4 + 4, (y0 + 2) * 4, z * 4 + 4], above, 'fill', { flow: false });
    const box = placeBox([x * 4 + 1, y0 * 4 + 1, z * 4 + 1], [0, 1, 0], 1, [1, 1, 1]);
    const r = W.setBox(box.min, box.max, BLOCK.POLYMER_BRICK, 'place');
    ok(W.getCell(x, y0 + 1, z) === above, `place leaves the ${above === BLOCK.COREPLATE ? 'coreplate' : 'basalt'} above a ½ slab intact`);
    ok(r.changed === 32 && W.getSub(x * 4, y0 * 4 + 2, z * 4) === BLOCK.POLYMER_BRICK, `place fills only the air half (${r.changed} subs)`);
    ok(!r.removed.some((e) => e.mat === above), 'nothing solid is reported removed');
  }
  const x = Math.floor(sx) - 4, z = Math.floor(sz), y = Math.floor(W.surfaceY(x + 0.5, z + 0.5)) + 1;
  W.setBox([x * 4, y * 4, z * 4], [x * 4 + 4, y * 4 + 4, z * 4 + 4], BLOCK.WATER, 'fill', { flow: false });
  W.setBox([x * 4, y * 4, z * 4], [x * 4 + 4, y * 4 + 4, z * 4 + 4], BLOCK.POLYMER_BRICK, 'place');
  ok(W.getCell(x, y, z) === BLOCK.POLYMER_BRICK, 'placing into a water cell works');
  W.setBox([x * 4, (y + 1) * 4, z * 4], [x * 4 + 4, (y + 2) * 4, z * 4 + 4], BLOCK.LUMEN_BLOOM, 'fill', { flow: false });
  const rp = W.setBox([x * 4, (y + 1) * 4, z * 4], [x * 4 + 4, (y + 2) * 4, z * 4 + 4], BLOCK.POLYMER_BRICK, 'place');
  ok(W.getCell(x, y + 1, z) === BLOCK.POLYMER_BRICK && rp.removed.some((e) => e.mat === BLOCK.LUMEN_BLOOM), 'placing over a plant replaces it (and reports it for drops)');
}

// C14: saves are clamped to the world border, and sections past it are dropped.
{
  const s = sanitizeSave({ v: 1, player: { pos: [1e6, 40, -9e5] }, game: { spawn: { x: 5e5, y: 40, z: 0 } }, world: { seed: 'x', sections: { '0,2,0': 'AA', '40000,2,0': 'AA', '0,2,-2000': 'AA' } } });
  ok(s.player.pos[0] === 30000 && s.player.pos[2] === -30000, `player clamped to ±30,000 (${s.player.pos})`);
  ok(s.game.spawn.x === 30000, 'spawn clamped');
  ok(Object.keys(s.world.sections).join() === '0,2,0', `sections past the border dropped (${Object.keys(s.world.sections)})`);
  const { WORLD_BORDER, clampToBorder } = await import('../js/world/world.js');
  const p = { x: 30010, y: 40, z: -40000 };
  ok(WORLD_BORDER === 30000 && clampToBorder(p) && p.x < 30000 && p.z > -30000, `clampToBorder pulls a position inside (${p.x}, ${p.z})`);
}


// C2 (remainder a): a second big stamp while the first relight is pending chains its relight instead of finishing the
// first one synchronously, and the result still equals a full recompute.
{
  const Wd = new World({ seed: 'chain', sync: true });
  const [ax, , az] = Wd.spawn;
  Wd.ensureArea(ax, az, 2);
  const bx = Math.floor(ax) * 4 - 64, bz = Math.floor(az) * 4 - 64;
  let forced = 0;
  const fl = Wd.finishLight.bind(Wd);
  Wd.finishLight = () => { if (Wd.lightPending()) forced++; return fl(); };
  Wd.setBox([bx, 100 * 4, bz], [bx + 128, 108 * 4, bz + 128], BLOCK.POLYMER_BRICK, 'fill');
  ok(Wd.lightPending(), 'first stamp defers its relight');
  Wd.setBox([bx + 40, 96 * 4, bz + 40], [bx + 168, 104 * 4, bz + 168], 0, 'fill');                 // overlaps the first
  Wd.setBox([bx + 8, 110 * 4, bz + 8], [bx + 12, 111 * 4, bz + 12], BLOCK.GLOWBULB, 'fill');        // a small edit too
  ok(forced === 0 && Wd.lightPending(), `back-to-back edits never finish a pending relight synchronously (${forced})`);
  let frames = 0;
  while (Wd.lightPending() && frames < 2000) { Wd.update(ax, az, 2); frames++; }
  Wd.finishLight = fl;
  const W3 = World.deserialize(JSON.parse(JSON.stringify(Wd.serialize())), { sync: true });
  W3.ensureArea(ax, az, 2);
  let diff = 0;
  for (const [key, s] of Wd.sections) {
    const s3 = W3.sections.get(key);
    if (!s || !s3) { const a = s || s3; if (a && a.light.some((v) => v !== 0xf0)) diff++; continue; }
    for (let i = 0; i < 4096; i++) if (s.light[i] !== s3.light[i]) diff++;
  }
  ok(diff === 0, `chained relights equal a full recompute (${diff} diffs, ${frames} frames)`);
}

console.log(`r3_test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
