import test from 'node:test';
import assert from 'node:assert/strict';

import { QUESTS, ACTS, SANDBOX, BALANCE_TABLE, questXp, QUEST_WEIGHT, ALL_SCHOOL_SHARE,
         rewardXp, rewardMk, questsInAct } from './campaign.js';
import { xpToReach, levelFor } from './xp.js';
import { SCHOOLS } from './schools.js';
import { ENEMIES, CATCH, FORAGE, ROCK, ITEM_VALUE } from './tables.js';

test('the catalogue is 28 Light + 25 Dark + 26 Neutral + 20 sandbox = 99', () => {
  const by = c => QUESTS.filter(q => ACTS.find(a => a.id === q.act).campaign === c).length;
  assert.equal(by('light'), 28);
  assert.equal(by('dark'), 25);
  assert.equal(by('neutral'), 26);
  assert.equal(SANDBOX.length, 20);
  assert.equal(QUESTS.length + SANDBOX.length, 99);
});

test('fifteen acts, five per campaign, and every quest belongs to one', () => {
  assert.equal(ACTS.length, 15);
  for (const c of ['light', 'dark', 'neutral']) assert.equal(ACTS.filter(a => a.campaign === c).length, 5);
  for (const q of QUESTS) assert.ok(ACTS.some(a => a.id === q.act), `${q.id} has no act`);
  for (const a of ACTS) assert.ok(questsInAct(a.id) > 0, `${a.id} has no quests`);
});

test('quest ids are unique and in campaign order', () => {
  const ids = QUESTS.map(q => q.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(ids.filter(i => i[0] === 'L').slice(0, 3), ['L01', 'L02', 'L03']);
});

test('every work verb resolves against real table data', () => {
  const verbs = new Set(['kill', 'catch', 'sell', 'cook', 'forage', 'rock', 'mend', 'evade', 'absorb', 'travel', 'escort', 'talk', 'interact', 'survive']);
  for (const q of [...QUESTS, ...SANDBOX]) {
    for (const [kind, a] of q.work || []) {
      assert.ok(verbs.has(kind), `${q.id}: unknown verb ${kind}`);
      if (kind === 'kill' && a !== 'band') assert.ok(ENEMIES[a], `${q.id}: no enemy ${a}`);
      if (kind === 'catch' && a !== 'local') assert.ok(CATCH[a], `${q.id}: no reach ${a}`);
      if (kind === 'forage' && a !== 'local') assert.ok(FORAGE[a], `${q.id}: no zone ${a}`);
      if (kind === 'rock') assert.ok(ROCK[a], `${q.id}: no rock ${a}`);
      if (kind === 'sell') assert.ok(ITEM_VALUE[a] !== undefined, `${q.id}: no item ${a}`);
    }
  }
});

test('every quest names a school that exists, or pays all ten', () => {
  for (const q of QUESTS) {
    assert.ok(q.xpAll || (q.schools && q.schools.length), `${q.id} pays nobody`);
    for (const s of q.schools || []) assert.ok(SCHOOLS.includes(s), `${q.id}: ${s}`);
  }
  for (const j of SANDBOX) if (j.school) assert.ok(SCHOOLS.includes(j.school), j.id);
});

test('every quest carries exactly one weight', () => {
  for (const q of QUESTS) assert.ok(QUEST_WEIGHT[q.w] !== undefined, `${q.id}: ${q.w}`);
});

test('rewards are generated from §10.3, not authored', () => {
  const l01 = rewardXp(QUESTS.find(q => q.id === 'L01'));
  assert.deepEqual(l01, { cull: 157, kindle: 157 });
  const l24 = rewardXp(QUESTS.find(q => q.id === 'L24'));
  assert.deepEqual(l24, { all: Math.round(questXp(10, QUEST_WEIGHT.finale) * ALL_SCHOOL_SHARE) });
  assert.equal(l24.all, 774);
});

test('an all-schools quest lands near a three-school quest, not ten times a one-school quest', () => {
  const act = ACTS.find(a => a.id === 'L5');
  const perSchool = questXp(act.lead, QUEST_WEIGHT.finale);
  const allTotal = Math.round(perSchool * ALL_SCHOOL_SHARE) * 10;
  assert.ok(allTotal > perSchool * 3 * 0.9 && allTotal < perSchool * 3 * 1.3);
});

test("an act's quest pay sums to its budget", () => {
  for (const act of ACTS) {
    const paid = QUESTS.filter(q => q.act === act.id).reduce((n, q) => n + rewardMk(q), 0);
    assert.ok(Math.abs(paid - act.mk) <= questsInAct(act.id), `${act.id}: ${paid} against ${act.mk}`);
  }
});

test('the three Echoes are granted by L24, D22 and N21 and by nothing else', () => {
  const echoes = QUESTS.filter(q => q.echo).map(q => [q.id, q.echo]);
  assert.deepEqual(echoes, [['L24', 'white_cord'], ['D22', 'short_rope'], ['N21', 'long_furrow']]);
});

test('Graft is granted by N07, not by a Glamour level', () => {
  const granter = QUESTS.find(q => q.grants === 'graft');
  assert.equal(granter.id, 'N07');
  // SYSTEMS §2.2 and §8.3 both say N09. STORY §8.3 grants it at N07 and gives N09 to
  // "Weigh the Temple", which the player could not do without already being disguised.
  assert.notEqual(granter.id, 'N09');
});

test('§10.3 — the quest reward formula reproduces its own table', () => {
  const rows = [
    [3, 522, 78, 157, 313], [5, 1220, 183, 366, 732], [8, 2593, 389, 778, 1556],
    [12, 4901, 735, 1470, 2941], [16, 7654, 1148, 2296, 4592], [20, 9973, 1496, 2992, 5984],
  ];
  for (const [M, cost, chore, main, finale] of rows) {
    const hi = Math.min(20, M + 1);
    assert.equal(xpToReach(hi) - xpToReach(hi - 1), cost);
    assert.equal(questXp(M, QUEST_WEIGHT.chore), chore);
    assert.equal(questXp(M, QUEST_WEIGHT.main), main);
    assert.equal(questXp(M, QUEST_WEIGHT.finale), finale);
  }
});

test('the catalogue pays 7,940 mk in quest rewards, against 27,658 when it was authored', () => {
  assert.equal(QUESTS.reduce((n, q) => n + rewardMk(q), 0), 7940);
  assert.equal(ACTS.reduce((n, a) => n + a.mk, 0), 7940);
});

test('the Neutral Act 1 marks dip is in the act budgets, not only in the prose', () => {
  const d5 = ACTS.find(a => a.id === 'D5').mk;
  const n1 = ACTS.find(a => a.id === 'N1').mk;
  assert.ok(n1 < d5, `N1 pays ${n1} against D5's ${d5}`);
});

test('turn-in XP is a tip: no school gains more than 60% of a level from one quest', () => {
  for (const q of QUESTS) {
    const act = ACTS.find(a => a.id === q.act);
    const hi = Math.min(20, act.lead + 1);
    const oneLevel = xpToReach(hi) - xpToReach(hi - 1);
    for (const v of Object.values(rewardXp(q))) {
      assert.ok(v <= Math.ceil(oneLevel * QUEST_WEIGHT.finale), `${q.id} pays ${v} against a level of ${oneLevel}`);
    }
  }
});

test('§11 is a harness transcript: it rises monotonically and its hours add up', () => {
  // h and cumH are each rounded to two places, so the sum drifts by up to half a centihour per row.
  let prev = { cumH: 0, xp: -1, grasp: -1 };
  for (const r of BALANCE_TABLE) {
    assert.ok(Math.abs(r.cumH - prev.cumH - r.h) <= 0.011, `${r.act} act hours`);
    assert.ok(r.xp > prev.xp, `${r.act} XP went backwards`);
    assert.ok(r.grasp > prev.grasp, `${r.act} Grasp went backwards`);
    prev = r;
  }
  assert.equal(BALANCE_TABLE.length, ACTS.length);
  assert.deepEqual(BALANCE_TABLE.map(r => r.act), ACTS.map(a => a.id));
});

test('§11 sits above the profile it used to be modelled from, and within reach of it', () => {
  const xpAt = L => L <= 1 ? 0 : 50 * Math.pow(L - 1, 2.5) + 25 * (L - 1);
  const prof = M => 3 * xpAt(M) + 3 * xpAt(0.7 * M) + 4 * xpAt(0.4 * M);
  assert.equal(Math.round(prof(20)), 356463);
  assert.equal(Math.round(6.7 * 20), 134);

  // The profile is a sketch of three lead schools, three secondary and four incidental. Content
  // adds push the measured run above it; a run that falls below means a school stopped training.
  const last = BALANCE_TABLE.at(-1);
  assert.ok(last.xp > prof(20), `measured ${last.xp} below modelled 356,460`);
  assert.ok(last.xp < prof(20) * 1.5, `measured ${last.xp} is running away from the profile`);
  assert.ok(last.grasp >= 134 && last.grasp <= 175, `Grasp ${last.grasp}`);
});

test('§11 is a six-to-eight hour game, not the 10.25 it used to claim', () => {
  const h = BALANCE_TABLE.at(-1).cumH;
  assert.ok(h > 6 && h < 8.5, `${h} h`);
  // 10.25 h across the same 94 jobs would need over 300 s of per-job overhead; WORLD.md's 101 s
  // and 115 s town legs cannot supply it. More quests is the way to a longer game, not slower ones.
  assert.ok(Math.round((10.25 - h) * 3600 / 94 + 131) > 240);
});

test('the deepest dip in the marks curve is Neutral Act 1', () => {
  const dips = BALANCE_TABLE
    .map((r, i) => i === 0 ? null : { act: r.act, drop: BALANCE_TABLE[i - 1].mk - r.mk })
    .filter(d => d && d.drop > 0)
    .sort((a, b) => b.drop - a.drop);
  assert.ok(dips.length, 'the curve never dips');
  assert.equal(dips[0].act, 'N1');
});

test('a Watchman pays 1,040 XP across three schools', () => {
  assert.equal(Object.values(ENEMIES.watchman.xp).reduce((a, b) => a + b, 0), 1040);
});

test('no quest asks for a rock the story path cannot break', () => {
  // D07 was moved to iron-glass and obsidian came down from 12 to 7. The soak reaches D19, the
  // first obsidian quest, at Setting 8 — one level of headroom, and the harness warns if that
  // goes negative after any content change.
  const firstObsidian = QUESTS.find(q => (q.work || []).some(([k, a]) => k === 'rock' && a === 'obsidian'));
  assert.equal(firstObsidian.id, 'D19');
  assert.equal(ROCK.obsidian.req, 7);
  assert.ok(ROCK.iron_glass.req < ROCK.obsidian.req);
});

test('quests are grouped in act order, because ids no longer ascend with it', () => {
  // STORY revision 3 appends ids rather than renumbering, so L25 sits inside Light Act 3.
  const order = QUESTS.map(q => ACTS.findIndex(a => a.id === q.act));
  assert.ok(order.every((v, i) => i === 0 || v >= order[i - 1]), 'a quest is out of act order');
  assert.ok(order.every(v => v >= 0), 'a quest names an act that does not exist');
  const light3 = QUESTS.filter(q => q.act === 'L3').map(q => q.id);
  assert.ok(light3.includes('L25'));
  assert.ok(light3.indexOf('L25') < light3.indexOf('L17'), 'the act finale must come last');
});

test('every act ends on its finale', () => {
  for (const act of ACTS) {
    const inAct = QUESTS.filter(q => q.act === act.id);
    assert.equal(inAct.at(-1).w, 'finale', `${act.id} does not end on a finale`);
    assert.equal(inAct.filter(q => q.w === 'finale').length, 1, `${act.id} has more than one finale`);
  }
});

test('the eight quest primitives cover every objective, and no ninth appears', () => {
  const primitives = ['kill', 'gather', 'deliver', 'interact', 'goto', 'escort', 'talk', 'survive'];
  assert.equal(primitives.length, 8);
  const workToPrimitive = {
    kill: 'kill', catch: 'gather', forage: 'gather', rock: 'gather',
    sell: 'deliver', cook: 'interact', mend: 'interact', interact: 'interact',
    travel: 'goto', escort: 'escort', talk: 'talk', survive: 'survive',
    evade: 'goto', absorb: 'kill',
  };
  for (const q of [...QUESTS, ...SANDBOX]) {
    for (const [kind] of q.work || []) assert.ok(workToPrimitive[kind], `${q.id}: ${kind} has no primitive`);
  }
});

test('quest turn-ins alone cannot cap a school', () => {
  const perSchool = Object.fromEntries(SCHOOLS.map(s => [s, 0]));
  for (const q of QUESTS) {
    const r = rewardXp(q);
    if (r.all !== undefined) for (const s of SCHOOLS) perSchool[s] += r.all;
    else for (const [s, v] of Object.entries(r)) perSchool[s] += v;
  }
  for (const s of SCHOOLS) {
    assert.ok(perSchool[s] < xpToReach(20), `${s} caps on turn-ins alone at ${perSchool[s]}`);
    assert.ok(levelFor(perSchool[s]) < 20, s);
  }
});

test('no school is named on fewer than four quests, and the spread is under 5x', () => {
  // STORY revision 3 added 12 quests to close this. Hearth was on 5 rows of 67 and Line on 6,
  // which is why the soak ended them six levels behind everything else.
  const count = school => QUESTS.filter(q => (q.schools || []).includes(school)).length;
  const counts = SCHOOLS.map(count);
  assert.ok(Math.min(...counts) >= 4, `thinnest school is on ${Math.min(...counts)} quests`);
  assert.ok(Math.max(...counts) / Math.min(...counts) < 5);
  assert.ok(count('hearth') >= 10);
  assert.ok(count('line') >= 10);
  assert.ok(count('cull') >= 10);
});
