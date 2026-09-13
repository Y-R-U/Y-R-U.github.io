// Rank and stars. The rule that matters is that the ladder only ever goes one way and that a
// player can always see how far the next rung is.

import { test, eq, ok, near } from '../../tools/harness.mjs';
import { LADDER, STARS, XP_FLAG, RANK_FLAG, sheet, starsFor, award, promote, nextRank, stepsOf, ceilingOf } from './progress.js';
import { RANKS, RANK_LABEL } from './contracts.js';

const at = (rank, xp) => ({ [RANK_FLAG]: rank, [XP_FLAG]: xp });

test('every rank the Society has a board for has a ladder', () => {
  for (const r of RANKS.filter(r => r !== 'none')) {
    ok(LADDER[r], `no ladder for ${r}`);
    eq(LADDER[r].length, STARS + 1, `${r}: ${LADDER[r].length} steps`);
  }
});

// The bug this exists for: bronze's ladder used to start at 260 against an iron top of 380, so
// being promoted out of iron handed the player a bronze star for nothing.
test('a ladder only goes up, and each rank picks up where the one below it stopped', () => {
  let last = null;
  for (const r of RANKS.filter(r => r !== 'none')) {
    const steps = stepsOf(r);
    for (let i = 1; i < steps.length; i++) ok(steps[i] > steps[i - 1], `${r} step ${i} is not a step`);
    if (last !== null) eq(steps[0], last, `${RANK_LABEL[r]} does not start where the rank below ended`);
    last = steps[STARS];
  }
});

test('being promoted does not hand you a free star', () => {
  for (const r of RANKS.filter(x => x !== 'none' && x !== 'gold')) {
    const top = stepsOf(r)[STARS];
    const up = nextRank(r);
    eq(sheet({ [RANK_FLAG]: up, [XP_FLAG]: top }).stars, 0,
      `${RANK_LABEL[up]} starts with a star already earned`);
  }
});

test('stars are earned at the totals the ladder names, and no earlier', () => {
  const steps = stepsOf('iron');
  for (let n = 0; n <= STARS; n++) {
    eq(starsFor('iron', steps[n]).stars, n, `${steps[n]} xp should be ${n} stars`);
    if (n) eq(starsFor('iron', steps[n] - 1).stars, n - 1, `${steps[n] - 1} xp should still be ${n - 1}`);
  }
});

test('the bar between two stars runs from empty to full', () => {
  const steps = stepsOf('iron');
  near(starsFor('iron', steps[1]).fraction, 0, 1e-9, 'a star just earned is an empty next bar');
  near(starsFor('iron', (steps[1] + steps[2]) / 2).fraction, 0.5, 1e-9);
  near(starsFor('bronze', stepsOf('bronze')[0]).fraction, 0, 1e-9, 'and so is a rank just entered');
  const top = starsFor('iron', steps[STARS] + 9999);
  eq(top.stars, STARS);
  eq(top.next, null);
  eq(top.fraction, 1, 'a full rank reads as full, not as empty');
});

// The bug Aaron hit: he cleared the iron board well past four stars, was raised, and arrived at
// bronze already two stars up — because the ladder is one lifetime total and iron work had gone
// on adding to it. A rank now stops counting at its own fourth star.
test('a rank stops counting at its fourth star, so promotion lands at the bottom of the next', () => {
  const top = stepsOf('iron')[STARS];
  eq(ceilingOf('iron'), top);
  const r = award(at('iron', top - 10), 100000);
  eq(r.xp, top, 'iron kept counting past its own ceiling');
  eq(r.gain, 10);
  eq(r.wasted, 99990);
  eq(r.capped, true);
  // And that is exactly the bottom of bronze.
  eq(sheet({ [RANK_FLAG]: 'bronze', [XP_FLAG]: r.xp }).stars, 0);
  eq(award(at('iron', 0), 10).capped, false, 'an ordinary award must not read as capped');
});

test('a save from before the ceiling is not robbed by it', () => {
  const s = sheet(at('iron', 100000));
  eq(s.stars, STARS);
  eq(s.xp, 100000, 'the sheet shows what the save holds');
  ok(s.promotion.includes('Bronze'));
  const r = award(at('iron', 100000), 50);
  eq(r.xp, 100000, 'an award above the ceiling took experience away');
  eq(r.gain, 0);
});

test('every rank has a ceiling and it is that rank\u2019s own fourth star', () => {
  for (const r of RANKS.filter(x => x !== 'none')) eq(ceilingOf(r), stepsOf(r)[STARS]);
  eq(ceilingOf('none'), stepsOf('iron')[STARS], 'the unranked are shown against iron');
});

test('unranked is shown against the first iron star rather than as a blank', () => {
  const s = sheet({});
  eq(s.rank, 'none');
  eq(s.registered, false);
  eq(s.stars, 0);
  eq(s.next, stepsOf('iron')[1]);
  ok(s.promotion.includes('proving'));
});

test('an award says whether a star was crossed', () => {
  const steps = stepsOf('iron');
  const quiet = award(at('iron', 0), 5);
  eq(quiet.starGained, false);
  eq(quiet.xp, 5);
  const loud = award(at('iron', steps[1] - 1), 1);
  eq(loud.starGained, true);
  eq(loud.stars, 1);
  eq(loud.rankReady, false);
});

test('the fourth star is what makes the next rung open, and it says so once', () => {
  const steps = stepsOf('iron');
  const r = award(at('iron', steps[STARS] - 1), 1);
  eq(r.rankReady, true);
  eq(r.after.stars, STARS);
  // And not again on the next contract, or the player is told four times.
  eq(award(at('iron', steps[STARS]), 50).rankReady, false);
});

test('a negative or nonsense award changes nothing', () => {
  eq(award(at('iron', 40), -100).xp, 40);
  eq(award(at('iron', 40), undefined).xp, 40);
  eq(sheet({ [RANK_FLAG]: 'iron', [XP_FLAG]: -5 }).xp, 0);
});

test('promotion is a separate act and only offered at four stars', () => {
  eq(promote(at('iron', 0)), null);
  const p = promote(at('iron', stepsOf('iron')[STARS]));
  eq(p.to, 'bronze');
  eq(p[RANK_FLAG], 'bronze');
  eq(promote(at('gold', stepsOf('gold')[STARS])), null, 'there is nothing above gold here');
});

test('the ranks chain all the way up and stop', () => {
  eq(nextRank('none'), 'iron');
  eq(nextRank('iron'), 'bronze');
  eq(nextRank('bronze'), 'silver');
  eq(nextRank('silver'), 'gold');
  eq(nextRank('gold'), null);
});
