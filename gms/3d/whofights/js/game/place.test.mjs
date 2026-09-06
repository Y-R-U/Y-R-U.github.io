// Where a bubble lands. The two things that go wrong here are the landscape clamp and the choice
// band, and both are arithmetic over a rectangle, so both are testable without a renderer.

import { test, eq, ok, near } from '../../tools/harness.mjs';
import { place, OFF_MARGIN } from './place.js';

// A phone in landscape: the band is short and the bubble is nearly a third of the height.
const BOX = { x: 10, y: 10, w: 780, h: 370 };
const W = 240, H = 70;
const at = (x, y, extra = {}) => place({ pt: { x, y }, w: W, h: H, box: BOX, ...extra });

test('place: sits above the anchor by the gap', () => {
  const r = at(400, 200);
  eq(r.below, false);
  near(r.y, 200 - 14 - H, 1e-9, 'gap then bubble');
  near(r.x, 400 - W / 2, 1e-9, 'centred on the anchor');
  near(r.tail, 0.5, 1e-9);
});

test('place: flips below when the anchor is near the top', () => {
  const r = at(400, 40);
  eq(r.below, true);
  near(r.y, 40 + 14, 1e-9);
});

test('place: clamps to the box and walks the tail across the bubble', () => {
  const l = at(12, 200);
  near(l.x, BOX.x, 1e-9, 'never leaves the left edge');
  ok(l.tail < 0.5, 'tail points back left at the speaker');
  const r = at(788, 200);
  near(r.x, BOX.x + BOX.w - W, 1e-9);
  ok(r.tail > 0.5);
});

test('place: refuses an anchor well off the edge', () => {
  eq(at(BOX.x + BOX.w + OFF_MARGIN + 1, 200), null);
  eq(at(400, BOX.y - OFF_MARGIN - 1), null);
  eq(place({ pt: { x: 400, y: 200, behind: true }, w: W, h: H, box: BOX }), null);
  eq(place({ pt: null, w: W, h: H, box: BOX }), null);
});

// The band lives on a lower layer than a floating bubble, so "not overlapping" is the whole rule.
const BAND = { x: 16, y: 240, w: 500, h: 130 };
const overlaps = (r, b) => r.y < b.y + b.h && r.y + H > b.y;

test('place: a bubble above the band is untouched by it', () => {
  const free = at(400, 200);
  const guarded = at(400, 200, { avoid: BAND });
  eq(guarded, free, 'nothing to avoid up there');
  ok(!overlaps(guarded, BAND));
});

test('place: the anchor low on screen that used to cover the buttons now docks', () => {
  // Vail at the end of a conversation, camera pulled in to `close`, her head two thirds down.
  const free = at(400, 350);
  ok(free, 'floats when there are no choices on screen');
  ok(overlaps(free, BAND), 'and this is the bug — the line sat on top of the buttons');
  eq(at(400, 350, { avoid: BAND }), null, 'so it docks into the band instead');
});

test('place: the band only bites once the anchor reaches it', () => {
  ok(at(400, BAND.y - 14 - 1, { avoid: BAND }), 'a hair above still floats');
  eq(at(400, BAND.y - 14 + 1, { avoid: BAND }), null, 'a hair below does not');
  ok(!overlaps(at(400, BAND.y - 15, { avoid: BAND }), BAND), 'and what floats is clear');
});

test('place: a band that leaves no room at all docks', () => {
  eq(at(400, 30, { avoid: { x: 16, y: 60, w: 500, h: 300 } }), null);
});

// The guard the band fix could easily have broken: OFF_MARGIN deliberately accepts an anchor a
// little past the edge of the safe box, and that has to keep floating when there are no choices.
test('place: an anchor just past the bottom of the box still floats with no band', () => {
  const justPast = BOX.y + BOX.h + 10;
  ok(at(400, justPast), 'no band, so nothing to be behind');
  eq(at(400, justPast, { avoid: BAND }), null, 'with a band it is well behind it');
});

test('place: an empty band is not a band', () => {
  eq(at(400, 300, { avoid: { x: 16, y: 240, w: 500, h: 0 } }), at(400, 300));
  eq(at(400, 300, { avoid: null }), at(400, 300));
});
