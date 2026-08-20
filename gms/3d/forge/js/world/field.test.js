import test from 'node:test';
import assert from 'node:assert/strict';
import {
  X0, X1, Z0, Z1, TOWNS, waterY, creekZ, creekHalf, creekBank, CHANNEL, landAt, carve, heightAt,
  buildLandGrid, sampleGrid, townAt, ROADS, roadPoints, roadLine, polyLength, CROSSINGS, PLAY,
} from './field.js';

const hg = buildLandGrid();
const surfaceY = (x, z) => sampleGrid(hg, x, z) + carve(x, z);

const rnd = (() => { let s = 12345; return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; })();

test('the world is finite everywhere, including the corners', () => {
  for (const [x, z] of [[X0, Z0], [X1, Z0], [X0, Z1], [X1, Z1], [0, 0]]) {
    assert.ok(Number.isFinite(heightAt(x, z)), `${x},${z}`);
  }
  for (let i = 0; i < 5000; i++) {
    const x = X0 + rnd() * (X1 - X0), z = Z0 + rnd() * (Z1 - Z0);
    assert.ok(Number.isFinite(heightAt(x, z)) && Number.isFinite(surfaceY(x, z)));
  }
});

// WORLD.md Phase 4. The tail is the terrace risers and the flood-plain lip at a grid seam and is
// recorded in docs/NOTES_WORLD_A2-A5.md; what must not regress is the body of the distribution.
test('surfaceY and heightAt agree — 5 cm at p90, and the river contributes nothing', () => {
  const all = [], river = [];
  for (let i = 0; i < 30000; i++) {
    const x = X0 + rnd() * (X1 - X0), z = Z0 + rnd() * (Z1 - Z0);
    const d = Math.abs(surfaceY(x, z) - heightAt(x, z));
    all.push(d);
    if (Math.abs(z - creekZ(x)) < creekBank(x)) river.push(d);
  }
  all.sort((a, b) => a - b);
  river.sort((a, b) => a - b);
  const p = (a, f) => a[Math.floor(a.length * f)];
  assert.ok(p(all, 0.9) < 0.05, `p90 ${p(all, 0.9)}`);
  assert.ok(p(all, 0.99) < 0.25, `p99 ${p(all, 0.99)}`);
  assert.ok(all[all.length - 1] < 0.6, `max ${all[all.length - 1]}`);
  // the whole point of building the world mesh without the channel term
  assert.ok(river.length > 500);
  assert.ok(p(river, 0.9) < 0.01, `river p90 ${p(river, 0.9)}`);
});

test('the Vail falls monotonically and never ponds', () => {
  let last = Infinity;
  for (let x = X0; x <= X1; x += 1) {
    const w = waterY(x);
    assert.ok(w <= last + 1e-9, `ponds at x=${x}`);
    last = w;
  }
  assert.ok(waterY(X0) - waterY(X1) > 8, 'the fall is worth having');
});

test('the channel holds water for its whole length and the land beside it never does', () => {
  for (let x = X0; x <= X1; x += 2) {
    const cz = creekZ(x), w = waterY(x);
    assert.ok(heightAt(x, cz) < w - 0.3, `dry bed at x=${x}`);
    const dry = cz + creekBank(x) + 30;
    assert.ok(landAt(x, dry) >= w + 0.7, `land under water at x=${x}`);
  }
});

test('carve is zero outside the banks, so the ribbon meets the world mesh with no step', () => {
  for (let x = X0 + 5; x < X1; x += 7) {
    const cz = creekZ(x), b = creekBank(x);
    assert.equal(carve(x, cz + b + 0.01), 0);
    assert.equal(carve(x, cz - b - 0.01), 0);
    assert.ok(Math.abs(carve(x, cz + b - 0.01)) < 0.02, `discontinuous at x=${x}`);
    assert.ok(carve(x, cz) < -0.3, `no channel at x=${x}`);
  }
});

// data/areas.json pins 89 areas to this spline. WORLD.md §4.2 proposed a different one and lost.
test('the four crossings are where areas.json put them', () => {
  const want = { downs: [-286, 38], mill: [-34, 119], ford: [200, 62], blackspan: [400, 30] };
  for (const c of CROSSINGS) {
    const [x, z] = want[c.id];
    assert.equal(c.x, x, `${c.id} x`);
    assert.ok(Math.abs(creekZ(c.x) - z) < 2.5, `${c.id} z ${creekZ(c.x)}`);
  }
});

test('the ford is wide and shallow and the gorge is narrow and deep', () => {
  assert.ok(CHANNEL(200) < 0.6, 'wadeable ford');
  assert.ok(creekHalf(200) > 12, 'wide ford');
  assert.ok(CHANNEL(430) > 4, 'deep gorge');
  assert.ok(creekHalf(430) < 6, 'narrow gorge');
  // WORLD.md §4.3 wants Blackspan 14 m above the water
  const rim = landAt(400, creekZ(400) + creekBank(400) + 2) - waterY(400);
  assert.ok(rim > 12 && rim < 17, `Blackspan rim ${rim}`);
});

test('the town mask releases between the towns and at the river', () => {
  for (const t of TOWNS) {
    assert.ok(townAt(t.cx, t.cz).m > 0.9, `${t.id} centre`);
    assert.equal(townAt(t.cx + t.hw + 71, t.cz).m, 0, `${t.id} east`);
    assert.equal(townAt(t.cx, t.cz + t.hd + 71).m, 0, `${t.id} south`);
  }
  for (const x of [-260, 260]) assert.equal(townAt(x, -20).m, 0, `midway ${x}`);
});

test('each town is flat enough to build a planned street on', () => {
  for (const t of TOWNS) {
    let lo = Infinity, hi = -Infinity;
    for (let x = t.cx - t.hw * 0.5; x <= t.cx + t.hw * 0.5; x += 5) {
      for (let z = t.cz - t.hd * 0.5; z <= t.cz + t.hd * 0.5; z += 5) {
        if (Math.abs(z - creekZ(x)) < creekBank(x) + 24) continue;
        const h = heightAt(x, z);
        lo = Math.min(lo, h); hi = Math.max(hi, h);
      }
    }
    // Blackstone is three terraces 9 m apart by design; the other two are one pad each
    const limit = t.pad.length > 1 ? (t.pad.length - 1) * 9 + 3 : 3;
    assert.ok(hi - lo < limit, `${t.id} relief ${(hi - lo).toFixed(2)} m`);
  }
});

test('the roads join the three towns and stay inside the playable box', () => {
  const kings = ROADS.find(r => r.id === 'kings');
  const line = roadLine(roadPoints(kings), 2.2);
  const len = polyLength(line);
  assert.ok(len > 1000 && len < 1200, `King's Road ${len} m`);
  // WORLD.md §1.1 measures the legs off the town gates
  assert.ok(Math.hypot(line[0][0] + 408, line[0][1] + 66) < 2, 'starts at the Whitewall east gate');
  const end = line[line.length - 1];
  assert.ok(Math.hypot(end[0] - 411, end[1] + 80) < 2, 'ends at the Blackstone west gate');
  for (const r of ROADS) {
    for (const [x, z] of roadLine(roadPoints(r), 6)) {
      assert.ok(x >= PLAY.x0 && x <= PLAY.x1 && z >= PLAY.z0 && z <= PLAY.z1, `${r.id} leaves the box at ${x},${z}`);
    }
  }
});

test('no road runs through water except at its crossings', () => {
  for (const r of ROADS) {
    for (const [x, z] of roadLine(roadPoints(r), 2.2)) {
      if (CROSSINGS.some(c => Math.abs(x - c.x) < 30)) continue;
      assert.ok(heightAt(x, z) > waterY(x), `${r.id} is under water at ${x.toFixed(0)},${z.toFixed(0)}`);
    }
  }
});

test('the roads climb rather than step, away from the gorge', () => {
  for (const r of ROADS) {
    const line = roadLine(roadPoints(r), 2.2);
    for (let i = 1; i < line.length; i++) {
      const [x, z] = line[i], [px, pz] = line[i - 1];
      if (CROSSINGS.some(c => Math.abs(x - c.x) < 40)) continue;
      const step = Math.abs(surfaceY(x, z) - surfaceY(px, pz));
      assert.ok(step < 1.2, `${r.id} steps ${step.toFixed(2)} m at ${x.toFixed(0)},${z.toFixed(0)}`);
    }
  }
});
