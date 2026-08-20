import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  advance, hourOf, dayOf, weekdayOf, isEighthDay, crossedDay, isNight, hoursUntil,
  bellsBetween, DAY_ROLL, DAWN, DUSK, WEEK,
} from './clock.js';
import { WorldClock } from './worldclock.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} !≈ ${b}`);

test('hour derives from t and wraps', () => {
  near(hourOf(0), 0);
  near(hourOf(10.5), 10.5);
  near(hourOf(24), 0);
  near(hourOf(30.25), 6.25);
  near(hourOf(-1), 23);
});

test('the day rolls at 05:00, not midnight', () => {
  assert.equal(dayOf(DAY_ROLL), 0);
  assert.equal(dayOf(4.99), -1);
  assert.equal(dayOf(23), 0);
  assert.equal(dayOf(28.99), 0);
  assert.equal(dayOf(29), 1);
  assert.equal(crossedDay(28.9, 29.1), true);
  assert.equal(crossedDay(23, 28.9), false, 'midnight is not a day boundary');
  assert.equal(crossedDay(29.1, 28.9), false);
});

test('the week is eight days', () => {
  assert.equal(WEEK, 8);
  const days = [];
  for (let d = 0; d < 17; d++) days.push(weekdayOf(DAY_ROLL + d * 24 + 3));
  assert.deepEqual(days, [0, 1, 2, 3, 4, 5, 6, 7, 0, 1, 2, 3, 4, 5, 6, 7, 0]);
  assert.equal(isEighthDay(DAY_ROLL + 7 * 24), true);
  assert.equal(isEighthDay(DAY_ROLL + 8 * 24), false);
  assert.equal(weekdayOf(DAY_ROLL - 24), 7, 'the week counts back as well as forward');
});

test('night is dusk to dawn', () => {
  assert.equal(isNight(DUSK), true);
  assert.equal(isNight(DAWN), false);
  assert.equal(isNight(0), true);
  assert.equal(isNight(12), false);
  assert.equal(isNight(DAWN - 0.01), true);
});

test('advance runs 1 game hour per real minute at the default rate', () => {
  near(advance(10, 60), 11);
  near(advance(10, 30), 10.5);
  near(advance(10, 60 * 24), 34);
  near(advance(10, 0), 10);
});

test('advance handles rate, freeze and the night multiplier', () => {
  near(advance(10, 60, 2), 12);
  near(advance(10, 600, 0), 10, 1e-9);
  // 21:00 with nightRate 3: one real minute buys three game hours of night
  near(advance(21, 60, 1, 3), 24);
  // starting in daylight, only the part after dusk is multiplied
  near(advance(DUSK - 0.5, 60, 1, 2), DUSK + 1, 1e-6);
});

test('advance never steps over a day roll in one frame', () => {
  const a = 28.4, b = advance(a, 60);
  near(b, 29.4);
  assert.equal(crossedDay(a, b), true);
});

test('hoursUntil always looks forward', () => {
  near(hoursUntil(10, 21), 11);
  near(hoursUntil(22, 6), 8);
  near(hoursUntil(6, 6), 24);
});

test('bells strike at 06, 12, 18 and 21', () => {
  assert.deepEqual(bellsBetween(5, 22).map(b => b.id), ['rising', 'high', 'setting', 'low']);
  assert.deepEqual(bellsBetween(12, 12).map(b => b.id), []);
  assert.deepEqual(bellsBetween(11.9, 12).map(b => b.id), ['high']);
  assert.deepEqual(bellsBetween(20, 30).map(b => b.id), ['low', 'rising']);
});

// The adapter is testable without a renderer: it takes a quality registry and a player object.
function harness(time = 10.5) {
  const settings = { time };
  const applied = [];
  const listeners = new Set();
  const q = {
    settings,
    knobs: new Map(),
    register(schema, apply) {
      q.knobs.set(schema.key, apply);
      if (schema.default !== undefined && !(schema.key in settings)) settings[schema.key] = schema.default;
      apply(settings[schema.key], settings);
    },
    set(key, v) {
      settings[key] = v;
      q.knobs.get(key)?.(v, settings);
      if (key === 'time') applied.push(v);
      for (const fn of listeners) fn(key, settings);
    },
    get: key => settings[key],
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
  const player = { enabled: true };
  const clock = new WorldClock(player);
  clock.registerKnobs(q);
  return { clock, q, player, applied, settings };
}

test('the clock seeds from the time knob and pushes it at 4 Hz, not 60', () => {
  const { clock, applied, settings } = harness(10.5);
  near(clock.hour, 10.5);
  for (let i = 0; i < 600; i++) clock.tick(1 / 60);
  near(clock.hour, 10.5 + 10 / 60);
  assert.ok(applied.length <= 40, `${applied.length} writes in 10 s`);
  assert.ok(applied.length >= 30, `${applied.length} writes in 10 s`);
  near(settings.time, clock.hour, 0.005);   // at most one 0.25 s push behind
});

test('an external write to time rebases the clock instead of fighting it', () => {
  const { clock, q, applied } = harness(10.5);
  q.set('time', 3);
  near(clock.hour, 3);
  assert.equal(applied.length, 1, 'the rebase does not echo a write back');
  for (let i = 0; i < 30; i++) clock.tick(1 / 60);
  near(clock.hour, 3 + 0.5 / 60);
});

test('a disabled player or a pause stops the clock', () => {
  const { clock, player } = harness(10.5);
  player.enabled = false;
  for (let i = 0; i < 60; i++) clock.tick(1 / 60);
  near(clock.hour, 10.5);
  player.enabled = true;
  clock.pause();
  for (let i = 0; i < 60; i++) clock.tick(1 / 60);
  near(clock.hour, 10.5);
  clock.resume();
  clock.tick(60);
  near(clock.hour, 11.5);
});

test('dayMinutes is the day length and 0 freezes the clock', () => {
  const { clock, q } = harness(10.5);
  q.set('dayMinutes', 12);
  clock.tick(60);
  near(clock.hour, 12.5, 1e-9);
  q.set('dayMinutes', 0);
  clock.tick(600);
  near(clock.hour, 12.5, 1e-9);
  assert.equal(clock.rate, 0);
});

test('advanceTo returns the hours skipped and fades to the hour', () => {
  const { clock } = harness(10);
  assert.equal(clock.advanceTo(21), 11);
  clock.tick(1.2);
  near(clock.hour, 21);
  assert.equal(clock.advanceTo(21), 24, 'the same hour means tomorrow');
});

test('the day event fires once per roll', () => {
  const { clock } = harness(4);
  const days = [];
  clock.on('day', d => days.push(d));
  for (let i = 0; i < 48 * 60; i++) clock.tick(1);
  assert.deepEqual(days, [0, 1]);
});

test('save is one float and load round-trips day, hour and weekday', () => {
  const { clock } = harness(10.5);
  clock.tick(60 * 90);
  const saved = JSON.parse(JSON.stringify(clock.toJSON()));
  assert.deepEqual(Object.keys(saved), ['t']);

  const { clock: b } = harness(0);
  b.load(saved);
  near(b.t, clock.t);
  near(b.hour, clock.hour);
  assert.equal(b.day, clock.day);
  assert.equal(b.weekday, clock.weekday);
  assert.equal(b.eighthDay, clock.eighthDay);
});

test('reset starts a new game at startHour', () => {
  const { clock, q } = harness(10.5);
  q.set('startHour', 4);
  clock.reset();
  near(clock.hour, 4);
  assert.equal(clock.day, -1, 'four in the morning is still the previous day');
});
