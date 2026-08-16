import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { fovFor, hFovFor, FOV_MINOR, FOV_MAX } from './fov.js';

const near = (a, b, eps = 0.15) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const rad = d => d * Math.PI / 180;
const A_CAP = Math.tan(rad(FOV_MINOR / 2)) / Math.tan(rad(FOV_MAX / 2));

test('every landscape aspect keeps the 55° the scale pass was derived from', () => {
  for (const a of [1, 4 / 3, 16 / 9, 844 / 390, 21 / 9, 32 / 9]) {
    assert.equal(fovFor(a), FOV_MINOR);
  }
});

test('the gate aspect still has WORLD.md §2.1\'s 96.8° horizontal field', () => {
  near(hFovFor(844 / 390, fovFor(844 / 390)), 96.8);
});

test('rotating the phone holds the field on the short axis, so nothing changes size', () => {
  const land = 844 / 390, port = 390 / 844;
  near(hFovFor(land, fovFor(land)), 96.8);
  near(fovFor(port), 96.8);
  near(hFovFor(port, fovFor(port)), FOV_MINOR);
});

test('a viewport taller than the cap gives up horizontal field rather than stretch', () => {
  const a = 0.3;
  assert.equal(fovFor(a), FOV_MAX);
  assert.ok(hFovFor(a, fovFor(a)) < FOV_MINOR);
});

test('the cap binds at 1 : 2.29, which the 21:9 phones reach', () => {
  near(A_CAP, 0.4368, 0.0005);
  assert.ok(fovFor(A_CAP + 0.001) < FOV_MAX, 'a hair wider than the threshold is not capped');
  assert.equal(fovFor(A_CAP - 0.001), FOV_MAX);
  // Sony's 21:9 line, 1644 × 3840. Capped, so the transpose is inexact here and only here: 54.1°
  // horizontal in portrait against 55° vertical in landscape, a 2% rescale on rotating.
  const xperia = 1644 / 3840;
  assert.equal(fovFor(xperia), FOV_MAX);
  near(hFovFor(xperia, FOV_MAX), 54.06, 0.02);
  near(Math.tan(rad(FOV_MINOR / 2)) / Math.tan(rad(hFovFor(xperia, FOV_MAX) / 2)), 1.021, 0.002);
});

// Six reviews running, this project has shipped a comment that said the opposite of the code, and
// this one carries the number the notes and CLAUDE.md quote.
test('fov.js states the threshold its own constants produce', () => {
  const src = readFileSync(new URL('./fov.js', import.meta.url), 'utf8');
  near(+src.match(/=\s*(0\.\d{3,})/)[1], A_CAP, 0.0005);
  near(+src.match(/1\s*:\s*(\d\.\d+)/)[1], 1 / A_CAP, 0.005);
});

test('the rule is continuous through square', () => {
  near(fovFor(1.0001), fovFor(0.9999), 0.02);
});

test('a degenerate viewport answers rather than throwing', () => {
  assert.equal(fovFor(0), FOV_MINOR);
  assert.equal(fovFor(NaN), FOV_MINOR);
});
