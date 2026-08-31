import { test, eq, ok } from '../../tools/harness.mjs';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { clipPath, pitchOf, VO_EXT } from './voice.js';
import { place } from './place.js';

const url = p => new URL(`../../${p}`, import.meta.url);
const pack = JSON.parse(readFileSync(url('data/conversations.json'))).nodes;
const ledger = JSON.parse(readFileSync(url('data/vo.json')));
const voiced = Object.entries(pack)
  .flatMap(([id, n]) => n.lines.map((l, i) => ({ id, i, ...l })))
  .filter(l => l.vo);

test('every voiced line has a clip on disk that is not empty', () => {
  ok(voiced.length >= 9, `only ${voiced.length} voiced lines`);
  for (const l of voiced) {
    const p = clipPath(l.vo);
    ok(p, `${l.id}[${l.i}]: "${l.vo}" is not a usable basename`);
    ok(existsSync(url(p)), `${l.id}[${l.i}]: no clip at ${p}`);
    ok(statSync(url(p)).size > 2000, `${l.id}[${l.i}]: ${p} is suspiciously small`);
  }
});

test('the ledger records every line clip, against the words it was made from', () => {
  for (const l of voiced) {
    const rec = ledger.lines?.[l.vo];
    ok(rec, `${l.vo} is not in data/vo.json lines`);
    eq(rec.text, l.text, `${l.vo} was made from different words`);
    eq(rec.who, l.who);
    eq(rec.encoded, true);
  }
});

test('the bark ledger and the line ledger do not collide', () => {
  for (const k of Object.keys(ledger.lines || {})) ok(!ledger.clips[k], `${k} is in both sections`);
});

test('a clip path is the basename and nothing else', () => {
  eq(clipPath('greeter_hello_01'), `audio/vo/greeter_hello_01${VO_EXT}`);
  eq(clipPath('../../etc/passwd'), null);
  eq(clipPath('has space'), null);
  eq(clipPath(''), null);
  eq(clipPath(undefined), null);
});

test('voicePitch is clamped to the §7 range and defaults to none', () => {
  eq(pitchOf({ voicePitch: 2 }), 2);
  eq(pitchOf({ voicePitch: -9 }), -4);
  eq(pitchOf({ voicePitch: 40 }), 4);
  eq(pitchOf({}), 0);
  eq(pitchOf(undefined), 0);
});

const BOX = { x: 10, y: 10, w: 380, h: 824 };

test('a bubble sits above its speaker and points at them', () => {
  const at = place({ pt: { x: 200, y: 400 }, w: 240, h: 80, box: BOX });
  eq(at.x, 80);
  eq(at.y, 306);
  eq(at.below, false);
  eq(at.tail, 0.5);
});

test('against the edge of a phone it clamps but keeps pointing', () => {
  const at = place({ pt: { x: 30, y: 400 }, w: 240, h: 80, box: BOX });
  eq(at.x, 10, 'clamped into the safe box');
  ok(at.tail < 0.15 && at.tail >= 0, `tail moved to ${at.tail}`);
});

test('a speaker near the top of a landscape screen gets the bubble underneath', () => {
  const land = { x: 10, y: 10, w: 824, h: 370 };
  const at = place({ pt: { x: 400, y: 40 }, w: 300, h: 70, box: land });
  eq(at.below, true);
  ok(at.y > 40, 'below the head, not over it');
  ok(at.y + 70 <= land.y + land.h, 'still inside the screen');
});

test('a speaker behind the camera or well off screen gets no bubble at all', () => {
  eq(place({ pt: { x: 200, y: 400, behind: true }, w: 240, h: 80, box: BOX }), null);
  eq(place({ pt: { x: -300, y: 400 }, w: 240, h: 80, box: BOX }), null);
  eq(place({ pt: { x: 200, y: 2000 }, w: 240, h: 80, box: BOX }), null);
  eq(place({ pt: null, w: 240, h: 80, box: BOX }), null);
});

test('a bubble wider than the screen is pinned to the left edge rather than off it', () => {
  const at = place({ pt: { x: 200, y: 400 }, w: 900, h: 80, box: BOX });
  eq(at.x, 10);
});
