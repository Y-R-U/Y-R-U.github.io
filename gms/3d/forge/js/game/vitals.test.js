import { test } from 'node:test';
import assert from 'node:assert/strict';
import { limits, blank, tick, spend, hurt, low, down } from './vitals.js';
import { blankSchools } from '../sim/schools.js';
import { xpToReach } from '../sim/xp.js';

const at = (school, level) => ({ ...blankSchools(), [school]: xpToReach(level) });

test('a fresh character has SYSTEMS §4.1\'s Ward 1 numbers', () => {
  const l = limits(at('ward', 1));
  assert.equal(l.focus, 70);
  // 52, not §9.4's 48: levelFor(0) is 1, so a starter's Hearth 1 is already worth four points.
  assert.equal(l.hp, 52);
  assert.equal(l.regen, 6.6);
});

test('eight bolts at Ward 1, then the ninth overdraws', () => {
  const l = limits(at('ward', 1));
  let v = blank(at('ward', 1));
  for (let i = 0; i < 8; i++) v = spend(v, 8, l);
  assert.equal(Math.round(v.focus), 6);
  v = spend(v, 8, l);
  assert.equal(v.focus, 0);
  assert.ok(v.guttered > 0, 'overdrawing leaves you Guttered');
  assert.ok(v.hp < l.hp, 'the shortfall came out of HP 1:1');
});

test('a Guttered cast costs 60% more', () => {
  const l = limits(at('ward', 10));
  const v = { hp: l.hp, focus: l.focus, since: 0, guttered: 2 };
  assert.equal(spend(v, 10, l).focus, l.focus - 16);
});

test('Focus regenerates at double after 2.5 s without a cast', () => {
  const l = limits(at('ward', 5));
  let v = { hp: l.hp, focus: 0, since: 0, guttered: 0 };
  v = tick(v, 1, l);
  assert.equal(Math.round(v.focus * 10) / 10, 9);
  v = tick({ ...v, since: 3 }, 1, l);
  assert.equal(Math.round((v.focus - 9) * 10) / 10, 18);
});

test('health tops out at the maximum and the low-health flag is a quarter', () => {
  const l = limits(at('ward', 1));
  const v = hurt(blank(at('ward', 1)), l.hp * 0.8);
  assert.ok(low(v, l));
  assert.ok(!down(v));
  assert.ok(down(hurt(v, 999)));
});

test('a save that outlived its own maximum is clamped, never inflated', () => {
  const s = at('ward', 1);
  assert.equal(blank(s, { hp: 9999, focus: 9999 }).hp, limits(s).hp);
  assert.equal(blank(s, { hp: 3, focus: 4 }).focus, 4);
});
