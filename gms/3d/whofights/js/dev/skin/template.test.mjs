import { test, eq, ok } from '../../../tools/harness.mjs';
import { poseRef, FACE_BAND } from '../../../tools/skin/template.mjs';
import { ATLAS, PANEL, SCALE } from '../../../tools/skin/layout.mjs';

const plain = poseRef({ relief: false });
const relief = poseRef();

// [x, y] of every pixel the face relief moved.
const moved = [];
for (let y = 0; y < ATLAS.h; y++) {
  for (let x = 0; x < ATLAS.w; x++) {
    const i = (y * ATLAS.w + x) * 4;
    if (plain.d[i] !== relief.d[i]) moved.push([x, y, plain.d[i], relief.d[i]]);
  }
}

test('the relief actually draws something', () => {
  ok(moved.length > 800, `only ${moved.length} pixels moved — the head is still an egg`);
});

// The whole point is an anchor for a face, not a second one on the back of the skull.
test('the relief is confined to the front head band', () => {
  const top = PANEL.feetRow - FACE_BAND[1] * SCALE, bot = PANEL.feetRow - FACE_BAND[0] * SCALE;
  for (const [x, y] of moved) {
    ok(x < PANEL.split, `moved a pixel at x ${x}, which is the back panel`);
    ok(y >= top - 1 && y <= bot + 1, `moved row ${y}, outside the face band ${top | 0}…${bot | 0}`);
  }
  for (let y = 0; y < ATLAS.h; y++) {
    for (let x = PANEL.split; x < ATLAS.w; x++) {
      const i = (y * ATLAS.w + x) * 4;
      eq(relief.d[i], plain.d[i], `back panel changed at ${x},${y}`);
    }
  }
});

// SKIN.md §5: anything painted outside the silhouette is what the folded side strips sample, and it
// comes back down the length of the model as a stripe.
test('the relief never reaches the background', () => {
  for (const [x, y, before] of moved) ok(before < 250, `painted background at ${x},${y}`);
});

// Structural, not aesthetic: a brow is a ridge, the sockets under it are a recess, and if either
// inverts the head reads as a dent. Mean of the delta on each row, so one stray texel cannot flip it.
test('the brow is a ridge and the sockets under it are a recess', () => {
  const rowDelta = yWorld => {
    const row = Math.round(PANEL.feetRow - yWorld * SCALE);
    let sum = 0, n = 0;
    for (const [x, y, before, after] of moved) if (y === row) { sum += after - before; n++; }
    ok(n > 6, `only ${n} moved pixels on the row for y=${yWorld}`);
    return sum / n;
  };
  ok(rowDelta(1.688) > 4, `the brow row is not lit: ${rowDelta(1.688).toFixed(1)}`);
  ok(rowDelta(1.656) < -4, `the socket row is not shadowed: ${rowDelta(1.656).toFixed(1)}`);
});
