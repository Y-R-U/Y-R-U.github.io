import { test, eq, ok } from '../../../tools/harness.mjs';
import { stone } from './stone.js';

// The masonry generator is pure — an RGBA buffer and a height field out of a config object — so
// the thing that had never been pinned is the one thing the hall's ashlar read depends on: a
// joint whose width is a fraction of the course height. At a cottage's 0.22 m course the shape
// table's own fraction is a mortar bed; at the hall's 0.42 m it is a rubble bed, and the wall
// stops being dressed stone. `joint` (and `bulge` beside it) are the overrides that let a read
// change how big the blocks are without changing what the wall is built of.

const LIGHT = {
  base: '#d9d7cf', dark: '#b3b2ac', mortar: '#c4c3bb',
  blockShape: 'rounded', blockW: 0.9, blockH: 0.42,
  jointDepth: 0.55, chipping: 0.15, roughness: 0.72, roughVariance: 0.18,
};

const bake = (over, S = 128) => stone(S, { ...LIGHT, ...over }, 8.4, 11);

// Mortar sits at the bottom of the height field: the joint is the low ground between blocks.
// Its share of the surface is the one number that says how coarsely the wall is jointed.
function mortarShare({ height }) {
  let lo = Infinity, hi = -Infinity;
  for (const h of height) { if (h < lo) lo = h; if (h > hi) hi = h; }
  let n = 0;
  for (const h of height) if (h < lo + (hi - lo) * 0.35) n++;
  return n / height.length;
}

test('a narrower joint really does lay less mortar', () => {
  const wide = mortarShare(bake({}));                 // the rounded shape's own 0.42 of a course
  const fine = mortarShare(bake({ joint: 0.13 }));    // what ashlarSet() asks for
  ok(fine < wide * 0.6, `joint override did nothing: ${fine.toFixed(3)} vs ${wide.toFixed(3)}`);
});

test('joint 0 is a joint of zero, not a missing argument', () => {
  // The trap `||` would fall into. A dry-stone read has to be able to ask for no bed at all.
  const none = mortarShare(bake({ joint: 0 }));
  const fine = mortarShare(bake({ joint: 0.13 }));
  ok(none < fine, `joint 0 laid more mortar than joint 0.13: ${none.toFixed(3)} vs ${fine.toFixed(3)}`);
});

test('omitting the override leaves the shape table in charge', () => {
  // Every wall in the game outside the hall takes this path, so it must be byte-identical.
  const a = bake({});
  const b = bake({ joint: undefined, bulge: undefined });
  eq(a.height.length, b.height.length);
  let same = true;
  for (let i = 0; i < a.height.length; i++) if (a.height[i] !== b.height[i]) { same = false; break; }
  ok(same, 'an absent override changed the wall');
});

test('bulge is wired to the relief and not only to the comment', () => {
  const flat = bake({ bulge: 0 });
  const round = bake({ bulge: 0.6 });
  let peakFlat = -Infinity, peakRound = -Infinity;
  for (const h of flat.height) if (h > peakFlat) peakFlat = h;
  for (const h of round.height) if (h > peakRound) peakRound = h;
  ok(peakRound > peakFlat * 1.05, `bulge did not raise the block face: ${peakRound} vs ${peakFlat}`);
});

test('a hall course is twice a cottage course at the size each is projected at', () => {
  // Not a style choice — it is the whole ashlar read. rows = tile / blockH, and the wall is drawn
  // over `tile` metres, so metres-per-course is what the eye reads. The cottage number is
  // COURSE.light over TILE.wall; the hall's is ASHLAR.course over ASHLAR.tile.
  const courses = (blockH, tile, S = 128) => {
    const g = stone(S, { ...LIGHT, blockH, blockW: blockH * (0.9 / 0.42), joint: 0.13 }, tile, 3);
    // count the mortar bands down the middle of the texture
    let lo = Infinity, hi = -Infinity;
    for (const h of g.height) { if (h < lo) lo = h; if (h > hi) hi = h; }
    const cut = lo + (hi - lo) * 0.35;
    let bands = 0, was = false;
    for (let y = 0; y < S; y++) {
      const now = g.height[y * S + (S >> 1)] < cut;
      if (now && !was) bands++;
      was = now;
    }
    return bands;
  };
  const cottage = courses(0.22, 4.2);
  const hall = courses(0.42, 8.4);
  ok(cottage >= 8, `cottage laid only ${cottage} courses across its tile`);
  // Same count per tile, but the hall's tile is twice as wide in metres — which is exactly why
  // the interior needed its own tile and not just its own bake.
  ok(Math.abs(hall - cottage) <= 3, `hall ${hall} vs cottage ${cottage} courses per tile`);
});
