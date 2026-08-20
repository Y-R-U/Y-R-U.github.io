import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blank, normalise, clampAll, clampQuests, rollDay, checkPosition, addItem, itemCount,
  SAVE_VERSION, POSITION, GROUND_TOLERANCE } from './save.js';
import { Autosave } from './savestore.js';
import { SCHOOLS } from '../sim/schools.js';

test('a blank save is complete, versioned and round-trips through JSON', () => {
  const d = blank(7);
  assert.equal(d.v, SAVE_VERSION);
  assert.equal(d.seed, 7);
  const back = normalise(JSON.parse(JSON.stringify(d)));
  assert.equal(back.error, null);
  assert.deepEqual(back.warnings, []);
  assert.deepEqual(back.doc, d);
});

test('a save from a newer build is refused rather than half-read', () => {
  const r = normalise({ ...blank(), v: SAVE_VERSION + 1 });
  assert.equal(r.doc, null);
  assert.match(r.error, /newer build/);
});

test('junk is not a save', () => {
  for (const junk of [null, undefined, 4, 'save', []]) assert.equal(normalise(junk).doc, null);
});

test('every field survives a full round-trip', () => {
  const d = blank(11);
  d.clock.t = 990.667;
  d.campaign = { current: 'dark', act: 3, done: ['light'], echoes: ['white_cord'], postures: { l27: 'held' }, merged: { ansel: 'dob' } };
  d.faction = 'dark';
  d.schools.line = 6640;
  d.purse = { marks: 218, banked: 1400 };
  d.standing = { light: 26, neutral: 4, dark: -12 };
  d.items = [{ id: 'silverling', n: 4, caught: 1786312790000 }, { id: 'thread', n: 6 }];
  d.quests = { 'light.02': { s: 'active', i: 1, c: { catch: [3] }, t: 41.2, e: 0, scene: null } };
  d.tracked = 'light.02';
  d.flags = { 'sold.once': true };
  d.truths = [{ id: 'overdraw', day: 22, campaign: 'light', quest: 'light.10', scene: 'n' }];
  d.at = { x: -63.2, y: 4.9, z: 18.4, yaw: 1.92, area: 'wwa.market', door: null, rev: 12 };
  d.pins = ['kindle', 'line', 'forage'];

  const back = normalise(JSON.parse(JSON.stringify(d))).doc;
  assert.equal(back.clock.t, 990.667);
  assert.deepEqual(back.campaign, d.campaign);
  assert.deepEqual(back.items, d.items, 'the caught stamp is the one wall-clock field and it survives');
  assert.deepEqual(back.quests, d.quests);
  assert.deepEqual(back.truths, d.truths);
  assert.deepEqual(back.at, d.at);
  assert.deepEqual(back.pins, d.pins);
  assert.equal(back.purse.banked, 1400);
});

test('clampAll never throws on hostile input', () => {
  const nasty = {
    v: 1, seed: 'x', clock: { t: -5 }, campaign: { current: 'purple', act: 99 },
    faction: 'purple', worn: 'purple',
    schools: { line: -400, cooking: 900, kindle: 1e12 },
    purse: { marks: -8, banked: NaN }, standing: { light: 9000 },
    items: [{ id: 'silverling', n: -2 }, null, { n: 3 }, 'nope'],
    charms: 'no', pins: ['line', 'nope', 'cull', 'ward', 'mend'],
    quests: { 'light.02': { s: 'exploded', i: -3, c: null, e: 900 }, bad: 4 },
    tracked: 'nothing', truths: ['legacy.string', { id: 'overdraw' }, {}],
    at: { x: 1, y: 'high', z: 2 },
    settings: { uiScale: 40, volume: -1 },
    log: [{ line: ['bel', 'hi', 'there', 'and more'] }, 'junk'],
  };
  let r;
  assert.doesNotThrow(() => { r = normalise(nasty); });
  const d = r.doc;
  assert.equal(d.clock.t, 0);
  assert.equal(d.campaign.current, 'light');
  assert.equal(d.campaign.act, 5);
  assert.equal(d.faction, 'light');
  assert.equal(d.worn, null);
  assert.equal(d.schools.line, 0);
  assert.equal(d.schools.cooking, undefined, 'an unknown school is dropped, not kept');
  assert.equal(SCHOOLS.every(s => typeof d.schools[s] === 'number'), true);
  assert.equal(d.purse.marks, 0);
  assert.equal(d.purse.banked, 0);
  assert.equal(d.standing.light, 100);
  assert.deepEqual(d.items, []);
  assert.deepEqual(d.charms, [null, null, null]);
  assert.equal(d.pins.length, 3);
  assert.equal(d.quests['light.02'].s, 'active');
  assert.equal(d.quests['light.02'].i, 0);
  assert.equal(d.tracked, null, 'tracking a quest with no record is dropped');
  assert.equal(d.at, null, 'a position with a non-numeric axis is not a position');
  assert.equal(d.settings.uiScale, 1.6);
  assert.equal(d.settings.volume, 0);
  assert.equal(d.log[0].line.length, 3, 'a fourth line cannot enter through the save either');
  assert.ok(r.warnings.length > 5);
});

test('a Truth is never dropped, even when the build no longer has it', () => {
  const raw = { ...blank(), truths: [{ id: 'gone', day: 4 }, 'older.format'] };
  const r = normalise(raw, { truths: { overdraw: {} } });
  assert.deepEqual(r.doc.truths.map(t => t.id), ['gone', 'older.format']);
  assert.match(r.warnings.join(' '), /gone/);
});

test('a quest that no longer exists is dropped so it cannot block a prereq', () => {
  const raw = { ...blank(), quests: { 'light.01': { s: 'done' }, 'cut.99': { s: 'active' } }, tracked: 'cut.99' };
  const r = normalise(raw, { defs: { 'light.01': {} } });
  assert.deepEqual(Object.keys(r.doc.quests), ['light.01']);
  assert.equal(r.doc.tracked, null);
  assert.match(r.warnings.join(' '), /cut\.99/);
});

// Editing a quest under a live save is a daily event while the packs are being written, and a
// `rec.i` past the end used to brick it silently: active for ever, nothing to finish, no warning.
test('a quest that lost a step is moved back onto its last one, out loud', () => {
  const defs = { q: { steps: [{ id: 'a' }, { id: 'b' }, { id: 'c', optional: true }] } };
  const warnings = [];
  const out = clampQuests({
    q: { s: 'active', i: 4 },
    done: { s: 'done', i: 9 },
    low: { s: 'active', i: -3 },
  }, { ...defs, done: defs.q, low: defs.q }, warnings);

  assert.equal(out.q.i, 1, 'the last required step, and optional steps do not count');
  assert.equal(out.q.s, 'active');
  assert.match(warnings.join(' '), /q was on step 5 of 2/);
  assert.equal(out.done.i, 9, 'a finished quest keeps its index; nothing reads it');
  assert.equal(out.low.i, 0, 'and the bottom is still clamped');
  assert.equal(warnings.length, 1, 'one warning, for the one quest that was actually stuck');
});

test('an unknown item is dropped and named', () => {
  const raw = { ...blank(), items: [{ id: 'silverling', n: 2 }, { id: 'renamed_fish', n: 9 }] };
  const r = normalise(raw, { items: new Set(['silverling']) });
  assert.deepEqual(r.doc.items, [{ id: 'silverling', n: 2 }]);
  assert.match(r.warnings.join(' '), /renamed_fish/);
});

test('combat-timescale state dies on load, economy-timescale state survives', () => {
  const raw = blank();
  raw.worn = 'light';
  raw.quests = { q: { s: 'active', i: 0, c: {}, t: 12, e: 480 } };
  raw.ledger = { day: 41, sold: { silverling: 14 } };
  raw.daily = { day: 41, standing: { light: 2.5 }, mended: ['fence.7'], reforgeT: 964 };
  const d = normalise(raw).doc;
  assert.equal(d.worn, null, 'you are never reloaded mid-disguise');
  assert.equal(d.quests.q.e, 0, 'a within-deadline is real seconds and does not survive');
  assert.equal(d.quests.q.t, 12, 'the world-hour the step started does survive');
  assert.deepEqual(d.ledger.sold, { silverling: 14 }, 'the glut ledger is keyed on the day');
  assert.deepEqual(d.daily.mended, ['fence.7']);
});

test('the day boundary clears the ledger once, with no catch-up loop', () => {
  const d = normalise({ ...blank(), ledger: { day: 41, sold: { silverling: 14 } },
    daily: { day: 41, standing: { light: 2.5 }, mended: ['fence.7'], reforgeT: 964 },
    board: { day: 41, ids: ['a'] } }).doc;
  const same = rollDay(d, 41);
  assert.deepEqual(same.ledger.sold, { silverling: 14 }, 'the same day changes nothing');

  const later = rollDay(d, 48);
  assert.deepEqual(later.ledger, { day: 48, sold: {} });
  assert.deepEqual(later.daily.standing, {});
  assert.deepEqual(later.daily.mended, []);
  assert.equal(later.daily.reforgeT, 964, 'Reforge is a game-day counter, not a daily reset');
  assert.equal(later.board.day, -1, 'the board re-rolls for the new day');
  assert.deepEqual(rollDay(later, 48), later, 'rolling again is a no-op');
});

test('items add, subtract and never go negative', () => {
  const d = blank();
  addItem(d, 'silverling', 5);
  addItem(d, 'silverling', -2);
  assert.equal(itemCount(d, 'silverling'), 3);
  addItem(d, 'silverling', -9);
  assert.equal(itemCount(d, 'silverling'), 0);
  assert.deepEqual(d.items, [], 'an empty stack is removed');
});

// §5.3 — the position is guilty until proven innocent, because Track A is moving the world.
test('a position from a rebuilt world is discarded', () => {
  const at = { x: 1, y: 5, z: 2, yaw: 0, area: 'wwa.market', door: null, rev: 12 };
  const ground = () => 5;
  assert.equal(checkPosition(at, { rev: 13, groundAt: ground }).ok, false);
  assert.equal(checkPosition(at, { rev: 13, groundAt: ground }).reason, POSITION.stale);
  assert.equal(checkPosition(at, { rev: 12, groundAt: ground }).ok, true);
});

test('a position the ground has moved under is discarded', () => {
  const at = { x: 1, y: 5, z: 2, yaw: 0, area: 'wwa.market', door: null, rev: 12 };
  const drop = checkPosition(at, { rev: 12, groundAt: () => 5 - GROUND_TOLERANCE - 0.1 });
  assert.equal(drop.ok, false);
  assert.equal(drop.reason, POSITION.sky);
  const fine = checkPosition(at, { rev: 12, groundAt: () => 5.5 });
  assert.equal(fine.ok, true);
  assert.equal(fine.y, 5.5, 'the sampled ground wins over the stored y');
});

test('an unverifiable or missing position is discarded, never guessed', () => {
  const at = { x: 1, y: 5, z: 2, yaw: 0, area: 'wwa', door: null, rev: 12 };
  assert.equal(checkPosition(at, { rev: 12 }).reason, POSITION.unverifiable);
  assert.equal(checkPosition(at, { rev: 12, groundAt: () => NaN }).reason, POSITION.sky);
  assert.equal(checkPosition(null, { rev: 12 }).reason, POSITION.none);
  assert.equal(checkPosition(at, { rev: null, groundAt: () => 5 }).reason, POSITION.stale);
});

test('a position inside a door is restored through the door, not by coordinates', () => {
  const at = { x: 1, y: 5, z: 2, yaw: 0, area: 'wwa.house', door: 3, rev: 99 };
  const r = checkPosition(at, { rev: 12, groundAt: () => 400 });
  assert.equal(r.ok, true);
  assert.equal(r.door, 3);
  assert.equal(r.reason, POSITION.door);
});

test('the discarded area is handed back so the loader can pick that town hearth', () => {
  const at = { x: 1, y: 5, z: 2, yaw: 0, area: 'wwa.market', door: null, rev: 1 };
  assert.equal(checkPosition(at, { rev: 2, groundAt: () => 5 }).area, 'wwa.market');
});

test('the autosave skips writes when nothing has changed', () => {
  const doc = blank(3);
  const written = [];
  const a = new Autosave(() => doc, { every: 10, sink: d => { written.push(JSON.stringify(d)); return true; } });
  assert.equal(a.tick(4), false);
  assert.equal(a.tick(7), true, 'the first write at ten seconds');
  assert.equal(a.tick(11), false, 'nothing changed, nothing written');
  doc.purse.marks = 5;
  assert.equal(a.tick(11), true);
  assert.equal(written.length, 2);
  assert.equal(a.skipped, 1);
});

test('the autosave defers while blocked and fires on demand', () => {
  const doc = blank(3);
  let n = 0;
  const a = new Autosave(() => doc, { sink: () => { n++; return true; } });
  a.block(true);
  assert.equal(a.flush(), false);
  assert.equal(n, 0, 'never mid-channel');
  a.block(false);
  a.mark();
  assert.equal(a.tick(0), true);
  assert.equal(n, 1);
});

test('a failed write does not mark the document as saved', () => {
  const doc = blank(3);
  const a = new Autosave(() => doc, { sink: () => false });
  assert.equal(a.flush(), false);
  assert.equal(a.last, null, 'the next attempt still has something to write');
});
