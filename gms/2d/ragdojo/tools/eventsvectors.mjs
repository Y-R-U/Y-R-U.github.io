#!/usr/bin/env node
/**
 * The JS events engine's answers, written down for the Go port to match (server/events_test.go).
 *
 *   node tools/eventsvectors.mjs           # rewrite server/testdata/events_vectors.json
 *   node tools/eventsvectors.mjs --check   # exit 1 if the committed file no longer matches the engine
 *
 * Change hash32/die/makeBoard/windows and --check goes red until the vectors (and the Go
 * port) are brought along with it.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hash32, mulberry32, die } from '../js/events/hash.js';
import { EVENT_DEFS, windowOf, parseEventId, eventIdOf, CAMPAIGN_CAP, PAID_CAP } from '../js/events/calendar.js';
import { counted } from '../js/events/points.js';
import * as V from '../js/events/vines.js';
import * as TW from '../js/events/tower.js';
import * as ST from '../js/events/story.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'server/testdata/events_vectors.json');
const r = mulberry32(hash32('vectors'));
const int = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));

const strings = ['', 'ragdojo', 'a', 'die|uid-aaron|vines-day:2026-10-13|0', 'ünïcødé ✓', '日本語', 'x'.repeat(300)];
for (let i = 0; i < 40; i++) strings.push(Array.from({ length: int(1, 40) }, () => String.fromCharCode(int(32, 126))).join(''));

const mulberry = [0, 1, 2596282342, 4294967295].map((seed) => {
  const g = mulberry32(seed);
  return { seed, out: Array.from({ length: 8 }, () => g()) };
});

const uids = ['uid-aaron', 'lan:abc123', 'Zx9QkPq2LmVt8sWuYb4R', 'dev:kid'];
const ids = ['vines-day:2026-10-13', 'vines-day:2027-01-01', 'vines-day:2026-11-30', 'reveal-week:2026-W53'];
const dice = [];
for (const u of uids) for (const e of ids) dice.push({ uid: u, event: e, rolls: Array.from({ length: 40 }, (_, n) => die(u, e, n)) });

const boards = [];
for (let d = 0; d < 30; d++) {
  const day = new Date(Date.UTC(2026, 9, 1) + d * 86400000 * 7).toISOString().slice(0, 10);
  for (const id of [`vines-day:${day}`, `vines-day:${day.slice(0, 8)}0${(d % 9) + 1}`]) {
    const b = V.makeBoard(id);
    boards.push({ event: id, ladders: b.ladders, vines: b.vines });
  }
}

const players = [];
for (let i = 0; i < 60; i++) {
  const points = Array.from({ length: int(0, 25) }, () => int(1, 3));
  const banked = V.rollsBanked(points);
  const rolls = int(0, banked);
  const uid = uids[i % uids.length], ev = ids[i % ids.length];
  const board = V.makeBoard(ev);
  const at = V.positionAfterRolls(board, uid, ev, rolls);
  const turns = V.turnsDone(board, uid, ev, points, rolls);
  const byTurn = Array.from({ length: points.length + 1 }, (_, k) => V.positionAtTurn(board, uid, ev, points, k).pos);
  const myTurns = int(0, 20);
  const view = V.rivalView(board, ev, { uid, points, rolls }, myTurns);
  players.push({ uid, event: ev, points, rolls, pos: at.pos, finishedAt: at.finishedAt, turns, ends: V.turnEnds(points),
    byTurn, myTurns, shownTurns: view.shownTurns, shownPos: view.pos });
}

// Windows and ids: every def at a spread of instants, including year and ISO-week edges.
const instants = ['2026-10-13T00:00:00Z', '2026-10-12T23:59:59.999Z', '2027-01-01T05:00:00Z', '2026-12-28T00:00:00Z',
  '2026-10-24T00:00:00Z', '2026-10-31T23:59:59Z', '2026-11-01T00:00:00Z', '2027-10-30T10:00:00Z', '2026-02-28T12:00:00Z',
  '2028-02-29T12:00:00Z', '2026-01-01T00:00:00Z', '2026-06-15T08:30:00Z'];
for (let i = 0; i < 40; i++) instants.push(new Date(Date.UTC(2026, 0, 1) + int(0, 900) * 86400000 + int(0, 86399999)).toISOString());
const windows = [];
for (const iso of instants) {
  const ms = Date.parse(iso);
  for (const def of EVENT_DEFS) {
    const w = windowOf(def, ms);
    windows.push({ def: def.id, ms, win: w ? { key: w.key, start: w.start, end: w.end, id: eventIdOf(def, w) } : null });
  }
}
const parsed = [...new Set(windows.filter((w) => w.win).map((w) => w.win.id))].map((id) => {
  const p = parseEventId(id);
  return { id, start: p.win.start, end: p.win.end };
});
for (const bad of ['nope:2026-10-13', 'vines-day:2026-13-40', 'reveal-week:2026-W60', 'halloween:2026x', 'vines-day', 'vines-month:2026-10', 'reveal-month:2026-10', 'story:2026-1', 'tower:2026-W60']) {
  parsed.push({ id: bad, start: null, end: null, bad: !parseEventId(bad) });
}

// The campaign cap and play order, on messy battle lists.
const countedCases = [];
for (let i = 0; i < 40; i++) {
  const def = EVENT_DEFS[i % EVENT_DEFS.length], paid = i % 4 === 3;
  const w = windowOf(def, Date.parse('2026-10-27T12:00:00Z')) || windowOf(def, Date.parse('2026-10-13T12:00:00Z'));
  const battles = [];
  for (let k = 0; k < int(0, 40); k++) {
    const src = r() < 0.7 ? 'campaign' : 'arena';
    const at = w.start - 3600000 + int(0, Math.min(w.end - w.start + 7200000, 3 * 86400000));
    battles.push({ id: `${src}:${int(0, 30)}`, at: at - (at % 1000) + int(0, 2) * 30000, src, won: r() < 0.4, oppDmg: r() });
  }
  const out = counted(def, w, battles, paid ? PAID_CAP : CAMPAIGN_CAP);
  countedCases.push({ def: def.id, start: w.start, end: w.end, paid,
    battles: battles.map((b) => ({ id: b.id, at: b.at, src: b.src, pts: b.won ? 3 : b.oppDmg > 0.5 ? 2 : 1 })),
    out: out.map((b) => ({ id: b.id, at: b.at, src: b.src, pts: b.pts })) });
}

// THE TOWER: messy W/L lists through the gap, the daily limit and the window, then the floor.
const towerCases = [];
for (let i = 0; i < 30; i++) {
  const w = windowOf(EVENT_DEFS.find((d) => d.id === 'tower'), Date.parse('2026-10-14T12:00:00Z'));
  const rows = [];
  let at = w.start - 3600000;
  for (let k = 0; k < int(0, i === 29 ? 260 : 60); k++) {
    at += [int(1000, 7000), int(8000, 9000), int(8000, 60000), int(60000, 3600000)][int(0, 3)];
    // an admin drop now and then (won = -floors): no gap, no fight
    rows.push(r() < 0.04 ? [`tower:drop:${k}`, -int(1, 5), at] : [`tower:${int(0, 400)}`, r() < 0.55 ? 1 : 0, at]);
  }
  const out = TW.towerCounted(w, rows);
  towerCases.push({ start: w.start, end: w.end, rows, out, ...TW.towerOf(out) });
}
// STORY: which story a month tells, and where a number of points puts you.
const storyCases = [];
for (let i = 0; i < 40; i++) {
  const key = `${int(2025, 2031)}-${String(int(1, 12)).padStart(2, '0')}`;
  const story = ST.storyIndex(key), points = int(0, 100);
  const p = ST.progress(ST.STORIES[story], points);
  storyCases.push({ key, story, points, chapter: p.chapter, circle: p.circle, done: p.done });
}

const vectors = { note: 'generated by tools/eventsvectors.mjs from js/events — do not edit by hand', cap: CAMPAIGN_CAP, paidCap: { gapMs: PAID_CAP.gapMs },
  towerCap: TW.TOWER_CAP, storyCircles: ST.STORIES.map((s) => s.chapters.map((c) => c.circles)),
  hash: strings.map((s) => ({ s, h: hash32(s) })), mulberry, dice, boards, players, windows, parsed, counted: countedCases, tower: towerCases, story: storyCases };
const text = JSON.stringify(vectors, null, 0).replace(/},{/g, '},\n{') + '\n';

if (process.argv.includes('--check')) {
  let old = '';
  try { old = readFileSync(OUT, 'utf8'); } catch {}
  if (old !== text) { console.error('FAIL  server/testdata/events_vectors.json is stale: run node tools/eventsvectors.mjs, then go test'); process.exit(1); }
  console.log('PASS  events vectors match the JS engine');
} else {
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, text);
  console.log(`wrote ${OUT} (${(text.length / 1024).toFixed(0)} KB)`);
}
