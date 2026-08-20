import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ZONE_IDS, zone } from '../zones.js';
import { roof, wood, road, ground } from './surfaces.js';
import { stone } from './stone.js';

const masonry = z => ({ ...z.stone, blockH: 0.21, blockW: 0.21 * (z.stone.blockW / z.stone.blockH) });

// Every generator is sampled on u,v in [0,1) and the result is tiled across the world, so a term
// whose field lookup is scaled by a non-integer breaks at the tile edge. The eye does not read
// that as noise — it reads as a hard line down the middle of the road, which is exactly the
// street_dusk seam. Field.at and voronoi both wrap at 1.0, so an integer multiplier is the whole
// requirement; constant offsets are free.
const edgeRatio = (buf, S, axis) => {
  const at = axis === 'u'
    ? (x, y) => buf[y * S + x]
    : (x, y) => buf[x * S + y];
  let wrap = 0;
  for (let y = 0; y < S; y++) wrap += Math.abs(at(S - 1, y) - at(0, y));
  wrap /= S;

  // Against the worst interior step, not the mean: a roof course and a cobble edge are real steps
  // and the mean is dominated by the flat pixels between them. The only question is whether the
  // wrap is a worse discontinuity than the ones the surface is supposed to have.
  const inner = [];
  for (let x = 0; x < S - 1; x++) {
    let d = 0;
    for (let y = 0; y < S; y++) d += Math.abs(at(x, y) - at(x + 1, y));
    inner.push(d / S);
  }
  const worst = Math.max(...inner);
  return worst < 1e-9 ? 0 : wrap / worst;
};

const luma = (rgba, S) => {
  const out = new Float32Array(S * S);
  for (let i = 0; i < S * S; i++) {
    out[i] = 0.2126 * rgba[i * 4] + 0.7152 * rgba[i * 4 + 1] + 0.0722 * rgba[i * 4 + 2];
  }
  return out;
};

const S = 128;
const surfaces = z => [
  ['wall', stone(S, masonry(z), 4.2, 3)],
  ['roof', roof(S, { kind: 'slate', ...z.roof }, 1.6, 5)],
  ['wood', wood(S, z.wood, 7)],
  ['road', road(S, z, 2.4, 9)],
  ['ground', ground(S, z, 3.2, 13)],
];

test('every baked surface tiles: no seam at the wrap in u or v', () => {
  const worst = [];
  for (const id of ZONE_IDS) {
    const z = zone(id);
    for (const [name, s] of surfaces(z)) {
      for (const [field, buf] of [['height', s.height], ['luma', luma(s.rgba, S)]]) {
        for (const axis of ['u', 'v']) {
          const r = edgeRatio(buf, S, axis);
          worst.push([`${id}:${name} ${field} ${axis}`, r]);
        }
      }
    }
  }
  worst.sort((a, b) => b[1] - a[1]);
  const bad = worst.filter(([, r]) => r > 1.2);
  assert.deepEqual(bad, [], `the wrap should look like the interior, not a step:\n${
    worst.slice(0, 6).map(([k, r]) => `  ${k} ${r.toFixed(2)}×`).join('\n')}`);
});
