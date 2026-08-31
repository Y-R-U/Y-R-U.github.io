import { test, eq, ok } from '../../tools/harness.mjs';
import { readFileSync } from 'node:fs';
import { BOARDS, BOARD_IDS, RANKS, ADVENTURER_STEPS, rankOf, boardView, adventurerView } from './contracts.js';
import { validateAction } from './actions.js';

const level = JSON.parse(readFileSync(new URL('../../data/levels/academy.json', import.meta.url)));
const boardHotspots = level.hotspots.filter(h => h.id.startsWith('hs.board.'));

test('every board a hotspot names exists, and every board has a hotspot', () => {
  const opened = boardHotspots.flatMap(h => h.actions.filter(a => a.k === 'screen').map(a => a.id));
  eq(opened.sort(), [...BOARD_IDS, 'board.new'].sort());
  for (const h of boardHotspots) {
    eq(h.trigger, 'click', `${h.id} is a tap, not a walk-in`);
    for (const a of h.actions) eq(validateAction(a, h.id), []);
  }
});

test('the four boards sit where the four billboards do', () => {
  const bill = level.objects.filter(o => o.type === 'billboard');
  eq(bill.length, 4);
  for (const b of bill) {
    const near = boardHotspots.find(h => Math.abs(h.shape.x - b.x) < 0.01 && Math.abs(h.shape.z - b.z) < 0.01);
    ok(near, `nothing to tap on "${b.p.text}" at ${b.x},${b.z}`);
  }
});

test('the board hotspot circles do not overlap each other', () => {
  for (const a of boardHotspots) {
    for (const b of boardHotspots) {
      if (a === b) continue;
      const d = Math.hypot(a.shape.x - b.shape.x, a.shape.z - b.shape.z);
      ok(d >= a.shape.r + b.shape.r, `${a.id} and ${b.id} overlap`);
    }
  }
});

test('an unranked player has every contract locked, on all three boards', () => {
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
  eq(boardView('board.iron', { 'academy.rank': 'iron' }).open, BOARDS['board.iron'].jobs.length);
  eq(boardView('board.bronze', { 'academy.rank': 'iron' }).open, 0);
  eq(boardView('board.gold', { 'academy.rank': 'bronze' }).open, 0);
  eq(boardView('board.gold', { 'academy.rank': 'gold' }).open, BOARDS['board.gold'].jobs.length);
});

test('an unknown rank flag reads as unranked rather than throwing', () => {
  eq(rankOf({ 'academy.rank': 'platinum' }), 'none');
  eq(rankOf({}), 'none');
  eq(rankOf(undefined), 'none');
  for (const r of RANKS) eq(rankOf({ 'academy.rank': r }), r);
});

test('the boards climb: iron pays least and gold most, on every job', () => {
  const top = id => Math.max(...BOARDS[id].jobs.map(j => j.reward));
  const low = id => Math.min(...BOARDS[id].jobs.map(j => j.reward));
  ok(top('board.iron') < low('board.bronze'), 'iron and bronze overlap');
  ok(top('board.bronze') < low('board.gold'), 'bronze and gold overlap');
});

test('every example job is filled in, not a stub', () => {
  for (const id of BOARD_IDS) {
    for (const j of BOARDS[id].jobs) {
      for (const k of ['name', 'client', 'where', 'blurb']) ok(j[k]?.length > 4, `${j.id}.${k}`);
      ok(j.reward > 0 && j.days > 0, j.id);
      ok(j.difficulty >= 1 && j.difficulty <= 5, `${j.id} difficulty ${j.difficulty}`);
    }
  }
});

test('a fresh player is not eligible to be an Adventurer, and is told so plainly', () => {
  const v = adventurerView({});
  eq(v.eligible, false);
  eq(v.done, 0);
  eq(v.total, ADVENTURER_STEPS.length);
  ok(/not yet eligible/i.test(v.headline), v.headline);
  ok(v.steps.every(s => s.done === false));
});

test('the checklist ticks off the flags the rest of the game already sets', () => {
  const flags = Object.fromEntries(ADVENTURER_STEPS.map(s => [s.flag, true]));
  const v = adventurerView(flags);
  eq(v.eligible, true);
  eq(v.done, v.total);
  ok(!/not yet/i.test(v.headline), v.headline);
  // academy.greeted is set by the last node of the Vail conversation, so talking to her really
  // does tick a box rather than the checklist being a picture of one.
  eq(adventurerView({ 'academy.greeted': true }).done, 1);
});

test('an unknown board id is a null view, not a crash', () => {
  eq(boardView('board.mithril', {}), null);
});
