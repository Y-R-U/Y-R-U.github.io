import { test, eq, ok } from '../../tools/harness.mjs';
import { readFileSync } from 'node:fs';
import {
  BOARDS, BOARD_IDS, RANKS, RANK_FLOOR, ADVENTURER_STEPS,
  rankOf, boardView, adventurerView, mayEnterFloor, topFloorFor, floorRank,
} from './contracts.js';
import { validateAction } from './actions.js';

const level = JSON.parse(readFileSync(new URL('../../data/levels/society.json', import.meta.url)));
const boardHotspots = level.hotspots.filter(h => h.id.startsWith('hs.board.'));

test('every board a hotspot names exists, and every board has a hotspot', () => {
  const opened = boardHotspots.flatMap(h => h.actions.filter(a => a.k === 'screen').map(a => a.id));
  eq(opened.sort(), [...BOARD_IDS, 'board.new'].sort());
  for (const h of boardHotspots) {
    eq(h.trigger, 'click', `${h.id} is a tap, not a walk-in`);
    for (const a of h.actions) eq(validateAction(a, h.id), []);
  }
});

test('the boards sit where the billboards do, on the same storey', () => {
  const bill = level.objects.filter(o => o.type === 'billboard');
  eq(bill.length, BOARD_IDS.length + 2, 'four contract boards, New Adventures and Registration');
  for (const b of bill) {
    const near = boardHotspots.find(h => Math.abs(h.shape.x - b.x) < 0.01 && Math.abs(h.shape.z - b.z) < 0.01);
    if (!near) { ok(b.p.text === 'Registration', `nothing to tap on "${b.p.text}"`); continue; }
    ok(Number.isFinite(near.shape.y), `${near.id} is on every floor at once`);
  }
});

// Five storeys of the same room means every board is the same circle seen from above. Without a
// height a player on the Gold floor would open the Iron board by standing still.
test('each contract board is pinned to the storey its rank hangs on', () => {
  const pinned = boardHotspots.filter(h => Number.isFinite(h.shape.y)).sort((a, b) => a.shape.y - b.shape.y);
  for (let i = 1; i < pinned.length; i++) {
    const gap = pinned[i].shape.y - pinned[i - 1].shape.y;
    ok(gap > pinned[i].shape.yr + pinned[i - 1].shape.yr,
      `${pinned[i - 1].id} and ${pinned[i].id} both answer between storeys`);
  }
  for (const [rank, floor] of Object.entries(RANK_FLOOR)) {
    const h = boardHotspots.find(x => x.id === `hs.board.${rank}`);
    ok(h, `no hotspot for ${rank}`);
    // The board object and its hotspot must name the same storey, or you tap a board that is
    // three floors above the one you are standing on.
    const obj = level.objects.find(o => o.type === 'billboard' && o.p.text.toLowerCase().startsWith(rank));
    eq(obj.floor, floor, `${rank} board is on floor ${obj.floor}, hotspot wants ${floor}`);
  }
});

test('the board hotspot circles do not overlap on any one storey', () => {
  for (const a of boardHotspots) {
    for (const b of boardHotspots) {
      if (a === b || Math.abs((a.shape.y ?? 0) - (b.shape.y ?? 0)) > 1) continue;
      const d = Math.hypot(a.shape.x - b.shape.x, a.shape.z - b.shape.z);
      ok(d >= a.shape.r + b.shape.r, `${a.id} and ${b.id} overlap`);
    }
  }
});

test('an unranked player has every contract locked, on all four boards', () => {
  for (const id of BOARD_IDS) {
    const v = boardView(id, {});
    eq(v.rank, 'none');
    eq(v.open, 0, `${id} let something through`);
    eq(v.locked, v.jobs.length);
    for (const j of v.jobs) ok(j.lock.need === BOARDS[id].rank, `${j.id} asks for the wrong rank`);
  }
});

test('the headline names the rank you want, and never says "cannot"', () => {
  for (const id of BOARD_IDS) {
    const h = boardView(id, {}).headline;
    ok(/rank/i.test(h), `${id}: ${h}`);
    ok(!/cannot|can't|denied|forbidden/i.test(h), `${id}: ${h}`);
  }
});

test('rank opens its own board and everything under it', () => {
  eq(boardView('board.iron', { 'society.rank': 'iron' }).open, BOARDS['board.iron'].jobs.length);
  eq(boardView('board.bronze', { 'society.rank': 'iron' }).open, 0);
  eq(boardView('board.silver', { 'society.rank': 'bronze' }).open, 0);
  eq(boardView('board.silver', { 'society.rank': 'silver' }).open, BOARDS['board.silver'].jobs.length);
  eq(boardView('board.gold', { 'society.rank': 'silver' }).open, 0);
  eq(boardView('board.gold', { 'society.rank': 'gold' }).open, BOARDS['board.gold'].jobs.length);
});

test('an unknown rank flag reads as unranked rather than throwing', () => {
  eq(rankOf({ 'society.rank': 'diamond' }), 'none');
  eq(rankOf({}), 'none');
  eq(rankOf(undefined), 'none');
  for (const r of RANKS) eq(rankOf({ 'society.rank': r }), r);
});

test('the boards climb: every rung pays more than the whole rung below it', () => {
  const top = id => Math.max(...BOARDS[id].jobs.map(j => j.reward));
  const low = id => Math.min(...BOARDS[id].jobs.map(j => j.reward));
  const order = ['board.iron', 'board.bronze', 'board.silver', 'board.gold'];
  for (let i = 1; i < order.length; i++) {
    ok(top(order[i - 1]) < low(order[i]), `${order[i - 1]} and ${order[i]} overlap`);
  }
});

// The brief: iron a lot, bronze still a lot, silver kind of a lot, gold not really that much.
test('the ladder thins as it climbs', () => {
  const n = id => BOARDS[id].jobs.length;
  ok(n('board.iron') >= n('board.bronze'), 'bronze has more work than iron');
  ok(n('board.bronze') > n('board.silver'), 'silver is not scarcer than bronze');
  ok(n('board.silver') > n('board.gold'), 'gold is not scarcer than silver');
  ok(n('board.gold') <= 4, 'gold is meant to be a short board');
});

test('every example job is filled in, not a stub', () => {
  const ids = new Set();
  for (const id of BOARD_IDS) {
    for (const j of BOARDS[id].jobs) {
      for (const k of ['name', 'client', 'where', 'blurb']) ok(j[k]?.length > 4, `${j.id}.${k}`);
      ok(j.reward > 0 && j.days > 0, j.id);
      ok(j.difficulty >= 1 && j.difficulty <= 5, `${j.id} difficulty ${j.difficulty}`);
      ok(!ids.has(j.id), `duplicate job id ${j.id}`);
      ids.add(j.id);
    }
  }
});

// The stair gate and the boards read the same ladder, or a player is let onto a floor whose board
// then tells them they are not welcome on it.
test('the stair lets you exactly as high as your rank', () => {
  eq(floorRank(0), null, 'the ground floor is open to anybody');
  ok(mayEnterFloor(0, 'none'));
  for (const [rank, floor] of Object.entries(RANK_FLOOR)) {
    ok(mayEnterFloor(floor, rank), `${rank} refused its own floor`);
    ok(!mayEnterFloor(floor, RANKS[RANKS.indexOf(rank) - 1]), `${rank}'s floor let the rung below in`);
    ok(mayEnterFloor(floor, 'gold'), `gold refused floor ${floor}`);
  }
  ok(!mayEnterFloor(1, 'none'), 'an unranked walk-in reached the Iron floor');
});

test('a fresh player is not an adventurer, and is told so plainly', () => {
  const v = adventurerView({});
  eq(v.eligible, false);
  eq(v.done, 0);
  eq(v.total, ADVENTURER_STEPS.length);
  ok(/not yet/i.test(v.headline), v.headline);
  ok(v.steps.every(s => s.done === false));
});

test('the checklist ticks off the flags the rest of the game already sets', () => {
  const flags = Object.fromEntries(ADVENTURER_STEPS.map(s => [s.flag, true]));
  const v = adventurerView(flags);
  eq(v.eligible, true);
  eq(v.done, v.total);
  ok(!/not yet/i.test(v.headline), v.headline);
  eq(adventurerView({ 'society.met.registrar': true }).done, 1);
});

// Every step has to be reachable: a checklist with a flag nothing sets is a picture of a quest.
test('every step names a flag the level document or a conversation can set', () => {
  const doc = readFileSync(new URL('../../data/conversations.json', import.meta.url), 'utf8');
  const lvl = JSON.stringify(level);
  for (const s of ADVENTURER_STEPS) {
    ok(doc.includes(s.flag) || lvl.includes(s.flag), `nothing ever sets ${s.flag}`);
  }
});

test('an unknown board id is a null view, not a crash', () => {
  eq(boardView('board.mithril', {}), null);
});

// The gate has two halves: the scripted climb is refused, and the flight itself is closed above
// the storey you have earned. Both read this, so a rank cannot be let past by one and stopped by
// the other.
test('the flight closes exactly where the ladder says it does', () => {
  eq(topFloorFor('none'), 0, 'an unranked walk-in gets the ground floor and no more');
  eq(topFloorFor('iron'), 1);
  eq(topFloorFor('bronze'), 2);
  eq(topFloorFor('silver'), 3);
  eq(topFloorFor('gold'), 4);
  for (const rank of RANKS) {
    const top = topFloorFor(rank);
    for (let f = 0; f <= 4; f++) eq(mayEnterFloor(f, rank), f <= top, `${rank} on floor ${f}`);
  }
});
