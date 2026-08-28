#!/usr/bin/env node
// The three hand-authored tutorial levels, held to a HARDER bar than the
// generated campaign — the opposite way round from how it sounds.
//
//   node tools/tutgate.mjs
//   node tools/tutgate.mjs --break <arm>   that check MUST go red
//     arms: budget  trivial  masher  aspect  oneshot
//
// A generated level has to be beatable by the deliberate bot on two seeds in
// three. A TUTORIAL has to be beatable by a player who has understood nothing
// yet, so it also has to fall to a masher that hard-drops at the flattest
// landing with no thought about colour at all. A tutorial a careless player can
// fail is not a tutorial; it is level four with a friendly name.
//
// And it must still be worth playing: a level that completes itself on the
// first frame teaches nothing either.

import { World, SIM_HZ } from '../js/sim/world.js';
import alchemy, { worldCfgFor, budgetOf, starsFor } from '../js/modes/alchemy.js';
import { TUTORIAL } from '../js/data/tutorial.js';
import { applyScene, makeTracker } from '../js/data/levelgen.js';
import { Bot } from '../js/ai/bot.js';
import { safeApi } from '../js/modes/api.js';
import { BLK, pieceBounds, collides } from '../js/sim/pieces.js';

const args = process.argv.slice(2);
const bi = args.indexOf('--break');
const BREAK = bi >= 0 ? args[bi + 1] : null;

const fails = [];
const check = (name, ok, detail = '') => {
  if (!ok) fails.push(`${name}${detail ? ': ' + detail : ''}`);
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
};

const mkApi = (w) => safeApi({
  rng: w.rng, biome() {}, shake() {}, banner() {}, sfx() {},
  setGravity(x, y) { w.setGravity(x, y); },
});

/**
 * The masher: flattest landing, hard drop, no thought about tint.
 *
 * Deliberately NOT random — a random-column masher tops itself out and would
 * make any level look beatable-by-anyone. That mistake was made once already on
 * this project and it made a broken mechanic look like a triumph.
 */
function mash(w) {
  const p = w.piece;
  if (!p) return;
  const g = w.g, b = pieceBounds(p);
  let bestX = p.x, bestY = -1e9;
  for (let ox = 0; ox + b.w * BLK <= g.cols; ox += BLK) {
    let y = 0;
    while (!collides(g, p, ox, y + 1) && y < g.rows) y++;
    if (y > bestY) { bestY = y; bestX = ox; }
  }
  if (p.x !== bestX) w.moveBy(bestX - p.x); else w.hardDrop();
}

function play(lv, seed, who) {
  // THE ARM HAS TO MOVE THE THING THE GAME READS. The first version of this set
  // `cfg.__budget` and `world.alchemy.budget`, and neither is an input —
  // budgetOf() reads `lv.pieces` — so the arm ran, changed nothing, and the
  // gate stayed green against a "broken" build. That is the same shape as the
  // arm in D9 that assigned to an accessor property and silently did nothing.
  const restore = lv.pieces;
  const restoreTarget = lv.objective.target;
  if (BREAK === 'budget') lv.pieces = 2;
  // Put the shipped fault back: a target so low the first drop satisfies it.
  if (BREAK === 'oneshot') lv.objective.target = lv.objective.type === 'purge' ? 1e9 : 1;
  const w = new World({ ...worldCfgFor({ level: lv.id }), seed });
  const api = mkApi(w);
  alchemy.onStart(w, api);
  const bot = who === 'bot' ? new Bot(w) : null;
  for (let t = 0; t < SIM_HZ * 900 && !w.over; t++) {
    if (bot) bot.update(); else mash(w);
    const before = w.chains;
    w.tick();
    if (w.chains > before) alchemy.onChain(w, api, w.clears.lastChain.slice());
    alchemy.onTick(w, api);
  }
  lv.pieces = restore;
  lv.objective.target = restoreTarget;
  const a = w.alchemy || {};
  return { won: !!a.won, stars: a.won ? a.stars : 0, used: a.used || 0, budget: a.budget || 0 };
}

console.log(BREAK ? `SILT tutorial gate  [FALSIFY: ${BREAK}]` : 'SILT tutorial gate');

for (const lv of TUTORIAL) {
  console.log(`\n  --- ${lv.id}. ${lv.name}  (${lv.arch}, ${budgetOf(lv)} pieces)`);

  // Shape. The tutorial is not exempt from the rule that every board fills the
  // screen the same way — A4 in tools/modesim.mjs holds the generated table to
  // exactly this, and a hand-written level is the easiest place to lose it.
  const aspect = lv.cols / lv.rows;
  check(`${lv.id}: the board is the same shape as every other mode`,
    BREAK === 'aspect' ? aspect > 0.99 : Math.abs(aspect - 0.5) < 0.001, aspect.toFixed(3));

  // It must not be over before it starts.
  const probe = new World({ ...worldCfgFor({ level: lv.id }), seed: 1 });
  applyScene(probe, lv);
  const selfClear = probe.clears.detect() > 0;
  const tr = makeTracker(probe, lv);
  const bornDone = BREAK === 'trivial' ? true : tr.update(probe);
  check(`${lv.id}: does not solve itself on frame one`, !selfClear && !bornDone,
    selfClear ? 'the scene already spans' : bornDone ? 'the objective starts satisfied' : '');

  // Three seeds, deliberate play. Every one of them must win — a generated
  // level may fail one in three, a tutorial may not fail any.
  const botRuns = [1, 2, 3].map((k) => play(lv, 700 + k * 97, 'bot'));
  const botWins = botRuns.filter((r) => r.won).length;
  check(`${lv.id}: falls to deliberate play on every seed`, botWins === 3,
    `${botWins}/3, pieces ${botRuns.map((r) => r.used).join('/')} of ${budgetOf(lv)}`);

  // And to careless play, which is the point of a tutorial.
  const mashRuns = [1, 2, 3].map((k) => play(lv, 700 + k * 97, 'mash'));
  const mashWins = mashRuns.filter((r) => r.won).length;
  check(`${lv.id}: falls to careless play too`,
    BREAK === 'masher' ? mashWins === 0 : mashWins >= 2,
    `${mashWins}/3, pieces ${mashRuns.map((r) => r.used).join('/')}`);

  // A LESSON HAS TO HAPPEN MORE THAN ONCE.
  //
  // First Quench shipped winnable on a single drop: the player put one piece
  // down, was told they had won, and never found out what they had done —
  // "I drop a single piece and it says i win... what is the point of the level?"
  // A tutorial level that ends on the first piece has demonstrated nothing,
  // however correct its objective is.
  const cheapest = Math.min(...botRuns.filter((r) => r.won).map((r) => r.used), Infinity);
  // No inversion here on purpose. The arm makes the LEVEL winnable on one drop
  // and this assertion is left exactly as it ships — an arm that flips the
  // comparison instead of breaking the thing is testing the arm, not the check.
  check(`${lv.id}: cannot be won on the first drop`, cheapest >= 2,
    `cheapest win spent ${cheapest} piece${cheapest === 1 ? '' : 's'}`);

  // The stars have to be reachable AND not free, or the rating says nothing.
  const best = Math.min(...botRuns.filter((r) => r.won).map((r) => r.used));
  const three = starsFor(lv, best) === 3;
  check(`${lv.id}: three stars is reachable by playing well`, three,
    `best run spent ${best}, three-star bar is ${lv.stars[2]}`);
  check(`${lv.id}: three stars is not simply given`, lv.stars[2] < budgetOf(lv),
    `${lv.stars[2]} against a ${budgetOf(lv)}-piece budget`);
}

if (fails.length) {
  console.log('\nFAIL\n' + fails.map((f) => '  x ' + f).join('\n'));
  console.log(BREAK ? `  (expected — falsify arm "${BREAK}" correctly tripped a check)` : '');
  process.exit(BREAK ? 0 : 1);
} else {
  console.log('\nPASS  the tutorial teaches, and cannot be failed by carelessness');
  if (BREAK) {
    console.log(`  !! falsify arm "${BREAK}" did NOT trip a check — that check is not testing what it claims`);
    process.exit(1);
  }
}
