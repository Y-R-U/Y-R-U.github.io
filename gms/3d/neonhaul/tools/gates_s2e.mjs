#!/usr/bin/env node
// S2-E's gates — the debt arc, the pace signal, the warmth gauge, both act-one endings, the hire
// loop and the intro cutscene.
//
//   node tools/gates_s2e.mjs [--land] [--headed] [--w= --h=]
//
// **Every check here is falsified.** Not "written so it could fail" — each one breaks the thing it
// guards and asserts the same check goes the other way. This project has logged twenty-two
// measurements that silently measured nothing, and this run alone added a twenty-third: the first
// version of `tools/vo/gen_story.py --falsify` "proved" its energy check by feeding it silence,
// and the silence was rejected by the CLIPPING check instead, because loudnorm had amplified the
// noise floor to -6 dBFS. It rejected the right file for the wrong reason and would have passed a
// silent take.
//
// Two rules inherited from the suites before it: results are written to disk AS EACH CHECK
// COMPLETES, never batched; and no isolation is `&&`-guarded — every hook goes through `hook()`,
// which THROWS when it is missing rather than resolving quietly to undefined.
//
// SCHEMA NOTE: this file writes `{ok:[],fail:[]}` AND `{results:[]}`. p5/p7a/p8 write the first and
// p1a-p4 the second, and a parser reading only one key has reported 0/0 on a fully passing suite
// four times on this project. Writing both makes that impossible here.

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { open, parseArgs, waitFor, settle, evalJSON, hook, quiesce } from './shot.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = parseArgs();
const LAND = !!args.land;
const W = +(args.w || (LAND ? 844 : 390)), H = +(args.h || (LAND ? 390 : 844));
const OUT = resolve(ROOT, 'shots/s2e');
const FILE = resolve(OUT, `_gates${LAND ? '_land' : ''}.json`);

const ok = [], fail = [], detail = {};
function check(name, pass, det) {
  (pass ? ok : fail).push(name);
  detail[name] = det;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}\n      ${String(det).replace(/\n/g, '\n      ')}`);
  try {
    const results = [...ok.map(n => ({ name: n, pass: true, detail: detail[n] })),
      ...fail.map(n => ({ name: n, pass: false, detail: detail[n] }))];
    writeFileSync(FILE, JSON.stringify({ view: `${W}x${H}`, at: new Date().toISOString(),
      total: ok.length + fail.length, passed: ok.length, failed: fail.length, ok, fail, detail, results }, null, 1));
  } catch { /* a full disk must not swallow the console above */ }
}

async function session(url) {
  const { S, base, close } = await open({ w: W, h: H, dpr: 1, mobile: true, headed: !!args.headed });
  await S('Page.navigate', { url: `${base}${url}` });
  await waitFor(S, 'window.__ready', 60000);
  await settle(S, 30);
  await quiesce(S, { timeout: 60000 });
  // Every geometric and pixel check below would otherwise be measuring the 8 s boot hint, which
  // both covers the top of the screen and steals `--toast-h` px from every panel under it.
  await evalJSON(S, '(window.__game.clearToasts(), 1)');
  await settle(S, 6);
  return { S, base, close };
}

// Spies on the three functions the brief bans outright. Installed on EVERY session, asserted once
// at the end — an alert() that only fires on the seizure path is exactly the one a spot check
// would miss.
const MODAL_SPY = `(() => {
  window.__modals = [];
  for (const k of ['alert', 'confirm', 'prompt']) {
    const orig = window[k];
    window[k] = function (...a) { window.__modals.push([k, String(a[0]).slice(0, 60)]); return orig ? undefined : undefined; };
  }
  return true;
})()`;

mkdirSync(OUT, { recursive: true });

// ═══════════════════════════════════════════════════════════════════════════
// LEG A — the pace signal, in node against the pure module
// ═══════════════════════════════════════════════════════════════════════════
const Story = await import(resolve(ROOT, 'js/story.js'));
const Ranks = await import(resolve(ROOT, 'js/ranks.js'));
const E = await import(resolve(ROOT, 'js/economy.js'));

const econ = (credits, over = {}) => ({ credits, cargo: [], craft: 'kestrel',
  upgrades: { thrust: 0, cargo: 0, cell: 0, eff: 0 }, stats: {}, tier: 1, lifetime: 0, ...over });

{
  // A1 — THE MAPPING. `warmth` is `credits / target` and nothing else: 0 at nothing, 0.5 at half,
  // 1 at the target, monotone, and clamped at 1 rather than running on.
  //
  // This REPLACED a check on a pace projection (0.5 at ratio 1.00 against a 50 000 debt over an
  // 84-minute window). That gauge is gone with the window, and the assertion is rewritten to the
  // new behaviour rather than deleted — see A2 for the defect that forced it.
  const at = credits => Story.pace(Story.newStory({ stage: 'debt' }), econ(credits)).warmth;
  const zero = at(0), half = at(Story.SEIZE_AT / 2), full = at(Story.SEIZE_AT);
  const over = at(Story.SEIZE_AT * 3);
  const sweep = [0, 0.25, 0.5, 0.75, 1].map(f => at(Story.SEIZE_AT * f));
  const mono = sweep.every((v, i) => i === 0 || v >= sweep[i - 1] - 1e-9);
  // FALSIFY: a balance that must NOT read half scale.
  const notHalf = Math.abs(at(Story.SEIZE_AT * 0.2) - 0.5) > 0.25
    && Math.abs(at(Story.SEIZE_AT * 0.8) - 0.5) > 0.25;
  check('A1 warmth is the BALANCE against the demand, full scale at the demand',
    zero === 0 && Math.abs(half - 0.5) < 1e-6 && full === 1 && over === 1 && mono && notHalf,
    `target ${Story.SEIZE_AT} CRD · 0 -> ${zero} · ${Story.SEIZE_AT / 2} -> ${half} · `
    + `${Story.SEIZE_AT} -> ${full} · ${Story.SEIZE_AT * 3} -> ${over} (clamped, so a rich player `
    + `reads a pegged needle and not a needle off the end of the dial) · sweep `
    + `${sweep.map(v => v.toFixed(2)).join(' ')} monotone ${mono} · falsified: 20 % of the target `
    + `-> ${at(Story.SEIZE_AT * 0.2).toFixed(2)} and 80 % -> ${at(Story.SEIZE_AT * 0.8).toFixed(2)}, `
    + `both far from half scale`);
}

{
  // A2 — **THE DEFECT THIS PHASE EXISTS FOR, WITH THE OLD GAUGE AS THE CONTROL ARM.**
  //
  // Aaron played the shipped build, reached ~3 000 CRD, was told by the Boss that they were coming
  // and by the gauge that it was at maximum, and nothing happened. He kept going to 5 000. The
  // reason: `warmth` was `1` for any pace ratio <= 0.75, and the seeded rate put a player earning
  // 70 % of the required pace at MAX ON THE FIRST FRAME, where it stayed for 84 minutes.
  //
  // So this asserts two things a boolean could not:
  //   (a) the OLD formula really did pin at t = 0 — computed here, not asserted from memory, so
  //       the control is a measurement of the thing that was replaced;
  //   (b) the NEW signal at the same fixture moves across the same span, and moves with CREDITS
  //       and not with TIME.
  const OLD_WINDOW = 84 * 60, OLD_DEBT = 50000, OLD_COLD = 1.25, OLD_HOT = 0.75;
  const oldWarmth = (t, credits, rate) => {
    const proj = credits + rate * Math.max(0, OLD_WINDOW - t);
    const r = proj / OLD_DEBT;
    return Math.max(0, Math.min(1, (OLD_COLD - r) / (OLD_COLD - OLD_HOT)));
  };
  const slowRate = 0.70 * (OLD_DEBT / OLD_WINDOW);          // 70 % of the pace the old debt needed
  const oldAt = [0, 40 * 60, 80 * 60].map(t => oldWarmth(t, 250 + slowRate * t, slowRate));
  const oldSpread = Math.max(...oldAt) - Math.min(...oldAt);

  const newAt = [250, 1250, 2500].map(c => Story.pace(Story.newStory({ stage: 'debt' }), econ(c)).warmth);
  const newSpread = Math.max(...newAt) - Math.min(...newAt);
  // …and the same three balances at three wildly different playtimes. THE GAUGE MUST NOT MOVE.
  const clockProof = [0, 40 * 60, 80 * 60].map(t =>
    Story.pace(Story.newStory({ stage: 'debt', t }), econ(1250)).warmth);
  const clockSpread = Math.max(...clockProof) - Math.min(...clockProof);
  check('A2 the gauge cannot saturate at minute zero, and it reads MONEY not the clock',
    oldAt.every(v => v === 1) && oldSpread === 0
    && newSpread > 0.85 && newAt[0] < 0.15 && newAt[2] === 1 && clockSpread === 0,
    `THE OLD GAUGE, recomputed here rather than remembered: a pilot holding 70 % of the pace the `
    + `50 000 / 84 min window required reads ${oldAt.map(v => v.toFixed(3)).join(' / ')} at `
    + `0 / 40 / 80 minutes — spread ${oldSpread.toFixed(3)}. Pegged at MAX on the first frame and `
    + `dead for the whole run. That is what Aaron was looking at.\n`
    + `THE NEW GAUGE over the same run's money (250 -> 1 250 -> ${Story.SEIZE_AT} CRD): `
    + `${newAt.map(v => v.toFixed(3)).join(' / ')} — spread ${newSpread.toFixed(3)}.\n`
    + `And it is money and not time: the SAME 1 250 CRD balance at 0 / 40 / 80 minutes of play `
    + `reads ${clockProof.map(v => v.toFixed(3)).join(' / ')} — spread ${clockSpread.toFixed(3)}, `
    + `exactly zero. A gauge with a hidden clock in it could not do that.\n`
    + `Falsified in both directions in one check: the old arm must be all-ones and the new arm must `
    + `not be, so neither can pass on the other's behaviour.`);
}

{
  // A3 — the escalation ratchets, in order, once each, and NEVER below its threshold — and it now
  // ratchets on the SAME NUMBER THAT FIRES THE EVENT. That identity is the repair: under the
  // window the ladder read pace while the seizure read a hidden clock, so "we are on our way" could
  // be true of the gauge and false of the game.
  const st = Story.newStory({ stage: 'debt', t: Story.MSG_FLOOR + 1 });
  const got = [];
  let now = 1000;
  // Walk the BALANCE up. Each step is a full MSG_HOLD apart so the hold is not what is measured.
  for (const frac of [0.20, 0.45, 0.65, 0.83, 0.96]) {
    const e = econ(Math.round(Story.SEIZE_AT * frac));
    for (let k = 0; k < 3; k++) {
      const ev = Story.tick(st, e, 0.5, now);
      now += Story.MSG_HOLD + 1;
      if (ev.boss) got.push([ev.boss.id, +Story.pace(st, e).warmth.toFixed(2)]);
    }
  }
  const ids = got.map(g => g[0]);
  const ordered = ids.join(',') === 'b1,b2,b3,b4';
  const noneEarly = got.every(([id, w]) => {
    const row = Story.BOSS_LINES.find(l => l.id === id);
    return !row || w >= row.at - 1e-6;
  });
  // FALSIFY: a story held well below b1's threshold must emit NOTHING however long it runs.
  const cool = Story.newStory({ stage: 'debt', t: Story.MSG_FLOOR + 1 });
  const coolEcon = econ(Math.round(Story.SEIZE_AT * 0.2));
  let coolFired = 0, cn = 5000;
  for (let k = 0; k < 20; k++) { if (Story.tick(cool, coolEcon, 1, cn).boss) coolFired++; cn += Story.MSG_HOLD + 1; }
  // One more credit takes the same walk onto the target itself. The ladder must have run out
  // exactly there — the last rung already sent at 96 %, and the event arming on the next step.
  const armed = Story.tick(st, econ(Story.SEIZE_AT), 0.5, now);
  check('A3 the Boss ratchets on the same number that fires the seizure',
    ordered && noneEarly && ids.length === 4 && coolFired === 0
    && st.due === true && armed.due === true && armed.boss === null,
    `fired ${JSON.stringify(got)} — in order ${ordered}, none below its own threshold ${noneEarly} · `
    + `the walk stopped at 96 % of ${Story.SEIZE_AT} with the whole ladder spent; the next step, ONTO `
    + `the target, armed the seizure (due=${st.due}) and said nothing more `
    + `(${JSON.stringify(armed.boss)}) — the ladder finished ON the event rather than beside it · `
    + `falsified: a pilot parked at warmth `
    + `${Story.pace(cool, coolEcon).warmth.toFixed(2)} over 20 ticks fired ${coolFired} lines`);
}

{
  // A3b — THE PAYOFF LINE CANNOT BE EATEN BY THE SPACING. A player who blitzes to the target in
  // three minutes would otherwise arm the seizure with b1 and b2 still unsent and MSG_HOLD holding
  // b4 back, so the one line that says "the next pad is the one" would arrive after the pad. `tick`
  // force-fires the last rung on the frame `due` arms, spacing ignored.
  const fast = Story.newStory({ stage: 'debt', t: 0 });
  const ev = Story.tick(fast, econ(Story.SEIZE_AT), 0.5, 0);
  const last = Story.BOSS_LINES[Story.BOSS_LINES.length - 1];
  // FALSIFY: the ordinary path at the SAME balance one tick later must not re-send it, and must not
  // send anything else either — the ladder is exhausted, not merely quiet.
  const again = Story.tick(fast, econ(Story.SEIZE_AT), 0.5, 10000);
  check('A3b the last warning always lands, even on a run too fast for the spacing',
    ev.due === true && ev.boss && ev.boss.id === last.id
    && fast.t < Story.MSG_FLOOR && fast.sent.length === Story.BOSS_LINES.length
    && again.boss === null,
    `armed at t=${fast.t.toFixed(1)} s, which is inside MSG_FLOOR (${Story.MSG_FLOOR} s) and would `
    + `have suppressed every line on the ordinary path · fired "${ev.boss && ev.boss.text}" · the `
    + `whole ladder is marked sent (${fast.sent.join(' ')}) so it cannot walk backwards afterwards `
    + `· falsified: the next tick at the same balance fires ${JSON.stringify(again.boss)}`);
}

{
  // A4 — CLEAR is a state, not a very hot reading, and it comes back the moment you spend it —
  // except in act one, where it is a LATCH. Both halves matter: act one's crew do not call it off
  // because you bought an upgrade on the way to the pad, and act two's Boss does, because he is
  // waiting for money you no longer have.
  const one = Story.newStory({ stage: 'debt' });
  const armed = Story.tick(one, econ(Story.SEIZE_AT), 0.5, 0);
  const afterSpend = Story.pace(one, econ(Story.SEIZE_AT - 900));
  const two = Story.newStory({ stage: Story.STAGE.ACT2, branch: 'taken' });
  const ready = Story.pace(two, econ(Story.SUMMONS));
  const spent = Story.pace(two, econ(Story.SUMMONS - 900));
  check('A4 the demand is met, and act one latches while act two does not',
    armed.due === true && one.due === true && afterSpend.clear === true && afterSpend.state === 'due'
    && ready.clear === true && ready.state === 'ready'
    && spent.clear === false && spent.state === 'summons' && spent.warmth < 1,
    `act one at ${Story.SEIZE_AT} CRD: due ${one.due} · after spending 900 of it: clear `
    + `${afterSpend.clear}, state "${afterSpend.state}", warmth ${afterSpend.warmth} — the crew are `
    + `still coming, which is what a latch is for\n`
    + `act two at ${Story.SUMMONS} CRD: clear ${ready.clear}, state "${ready.state}" · after `
    + `spending 900: clear ${spent.clear}, state "${spent.state}", warmth ${spent.warmth} — he is `
    + `waiting for money you no longer have\n`
    + `falsified by the pair: the same 900 CRD purchase moves one and not the other`);
}

{
  // A5 — the swept constants are the ones in the file, and the hire arithmetic holds together.
  const wisp = Story.blockPrice('wisp');
  const mam = Story.blockPrice('mammoth');
  const d = [1, 2, 4, 8, 12].map(Story.hireDiscount);
  const descD = d.every((v, i) => i === 0 || v <= d[i - 1]);
  const s1 = Story.newStory({ wreckLeft: 1 });
  const w1 = Story.hireCost(s1, 'wisp', 1);
  const e1 = econ(5000);
  Story.takeHire(s1, e1, 'wisp', 1, 0);
  const w2 = Story.hireCost(s1, 'wisp', 1);
  check('A5 hire prices are the swept ones; the wreck is one-off',
    wisp === 1425 && Story.HIRE.BLOCK_S === 300 && mam > wisp * 5 && descD
    && w1.price === 90 && w1.wreck && w2.price === 1425 && !w2.wreck,
    `wisp block ${wisp} CRD / ${Story.HIRE.BLOCK_S} s (swept: 40.3 % of the normal pilot's median `
    + `5-min gross of 3 532 CRD, 0 % of blocks uncovered — docs/s2e_balance.json) · mammoth ${mam} · `
    + `discounts ${d.join(' ')} monotone ${descD} · wreck ${w1.price} then ${w2.price} — falsified by `
    + `the second call, which is the same story object after one purchase`);
}

{
  // A6 — the standing arithmetic of ONE ROAD. This check asserted the old fork: seized costs a
  // rung, paid buys two. There is no fork, so it asserts the thing that replaced it, which is a
  // real design question rather than a rename — **every player loses the car, so a permanent
  // penalty for it would be an offset applied to the whole game rather than an axis.**
  //
  //   the seizure   car_seized -1 + dad_favour +1  =  0
  //   the meeting   crew_hook   0 + paid_up    +1  = +1
  //
  // `debt_cleared` is DELETED from the registry, not left in it: it was the paid branch's flag and
  // nothing on the single road can set it. A registry entry no code path reaches is the same kind
  // of dead measurement this project keeps finding.
  const base = { credits: 20000, craft: 'wisp', upgrades: {}, lifetime: 0, tier: 1 };
  const worth = Ranks.netWorth(base);
  const none = Ranks.standingRank(worth, []);
  const seized = Ranks.standingRank(worth, Story.OUTCOME.flags);
  const met = Ranks.standingRank(worth, [...Story.OUTCOME.flags, 'crew_hook', 'paid_up']);
  const carOnly = Ranks.standingRank(worth, ['car_seized']);
  const nonsense = Ranks.standingRank(worth, ['not_a_flag']);
  const gone = Ranks.STANDING_FLAGS.debt_cleared === undefined;
  check('A6 one road: the seizure nets to zero and the meeting pays a rung',
    seized.rung === none.rung && met.rung === none.rung + 1
    && carOnly.rung === none.rung - 1 && nonsense.rung === none.rung && gone,
    `at ${worth} CRD net worth: no flags ${none.rung} ${none.name}\n`
    + `after the seizure ${JSON.stringify(Story.OUTCOME.flags)}: ${seized.rung} ${seized.name} — `
    + `NET ZERO, deliberately\n`
    + `after the Boss meeting (+crew_hook +paid_up): ${met.rung} ${met.name}\n`
    + `falsified twice: \`car_seized\` ALONE reads ${carOnly.rung} ${carOnly.name}, so the zero `
    + `above is two live entries cancelling and not a dead registry; and an unknown flag returns `
    + `${nonsense.rung} ${nonsense.name}, so the mechanism reads the registry rather than counting `
    + `array entries · debt_cleared removed from the registry: ${gone}`);
}

{
  // A7 — a hire is NOT an asset. Without `borrowed` the standing ladder would pay the player for
  // renting, which is the exact defect S2-D's note asked S2-E to close.
  const st = Story.newStory();
  const e2 = econ(30000);
  Story.takeHire(st, e2, 'nocturne', 1, 0);
  const withFlag = Ranks.netWorth(e2);
  const without = Ranks.netWorth({ ...e2, borrowed: false });
  check('A7 a hired hull adds nothing to net worth',
    e2.borrowed === true && Ranks.assetValue(e2) === 0 && without > withFlag + 5000,
    `after hiring a nocturne: borrowed ${e2.borrowed}, assetValue ${Ranks.assetValue(e2)}, `
    + `net worth ${withFlag} · falsified: the SAME state with borrowed:false reports ${without}, `
    + `i.e. ${without - withFlag} CRD of somebody else's vehicle`);
}

{
  // A8 — **WHAT A PROFILE FROM THE SHIPPED BUILD BECOMES.** Every save on disk carries
  // `branch: 'paid' | 'seized'` and there is one road now, so this is the check that stops a real
  // player's profile landing somewhere the game can no longer leave.
  //
  // The rule, and the reasoning is in `Story.fromSave`'s header:
  //
  //   act one    untouched — the seizure re-arms off the BALANCE on the next tick, so a mid-arc
  //              save simply meets the new rule at its next dock
  //   act two    `met` forced TRUE on both old branches, because billing somebody ten thousand
  //              credits for an appointment that did not exist when they played act one is exactly
  //              the retroactive charge this restructure exists to remove
  //   seized     additionally keeps its shady desk: it was open from the moment act two began, and
  //              under one road the desk is the THREAD's, so a straight migration would shut a door
  //              that player already had
  const shippedDebt = { stage: 'debt', branch: null, t: 50 * 60, due: false, rate: 9.92,
    earned: 30000, sent: ['b1', 'b2'] };
  const shippedPaid = { stage: 'act2', branch: 'paid', due: false, grounded: true, wreckLeft: 0,
    hireSpend: 4200, hireBlocks: 3, thread: { remarks: 1, heard: ['r1'], cue: false, asked: false } };
  const shippedSeized = { stage: 'act2', branch: 'seized', due: false, grounded: true, wreckLeft: 1,
    hireSpend: 8550, hireBlocks: 6 };
  const d = Story.fromSave(shippedDebt, 0);
  const pd = Story.fromSave(shippedPaid, 0);
  const sz = Story.fromSave(shippedSeized, 0);
  // The act-one profile meets the new rule the moment it ticks against its own balance.
  const rich = econ(12000);
  const ev = Story.tick(d, rich, 0.5, 0);
  // FALSIFY: a FRESH story is not migrated — `met` must be false and the door shut — so the trues
  // above are the migration doing something rather than a default.
  const fresh = Story.fromSave({ stage: 'act2', branch: null }, 0);
  check('A8 a profile from the shipped build lands somewhere playable',
    d.stage === 'debt' && d.branch === null && d.met === false
    && ev.due === true && d.hireSpend === 0
    && pd.stage === 'act2' && pd.branch === 'taken' && pd.met === true
    && pd.thread.heard.join() === 'r1' && Story.shadyDoor(pd) === null
    && sz.branch === 'taken' && sz.met === true && sz.thread.asked === true
    && Story.shadyDoor(sz) === 'asked' && Story.shadyOpen(sz) === true
    && sz.hireSpend === 8550 && sz.wreckLeft === 1
    && fresh.met === false && Story.shadyDoor(fresh) === null,
    `mid-act-one (branch null, 50 min on the old clock): stage ${d.stage}, branch `
    + `${JSON.stringify(d.branch)}, met ${d.met} — and one tick against its own 12 000 CRD balance `
    + `armed the seizure (due ${ev.due}), so it meets the new rule at its next dock rather than `
    + `waiting on a clock that no longer exists\n`
    + `old PAID act two: branch ${pd.branch}, met ${pd.met} (the summons is NOT charged to somebody `
    + `who already finished act one), thread kept at ${JSON.stringify(pd.thread.heard)}, door `
    + `${JSON.stringify(Story.shadyDoor(pd))} — mid-thread, exactly where they left it\n`
    + `old SEIZED act two: branch ${sz.branch}, met ${sz.met}, door `
    + `"${Story.shadyDoor(sz)}", shadyOpen ${Story.shadyOpen(sz)} — the desk they already had stays `
    + `open, and their hire burn (${sz.hireSpend} CRD / ${sz.hireBlocks} blocks) survives\n`
    + `falsified by the un-branded control: a profile with branch null in act two reads met `
    + `${fresh.met} and door ${JSON.stringify(Story.shadyDoor(fresh))}, so none of the above is a `
    + `default`);
}

// ═══════════════════════════════════════════════════════════════════════════
// LEG B — the browser: the gauge, the cutscene, the panels, the endings
// ═══════════════════════════════════════════════════════════════════════════

// ── B: the demand gauge on the real dash ───────────────────────────────────
{
  const { S, close } = await session('/index.html?nosave=1&intro=0&crd=300');
  await evalJSON(S, MODAL_SPY);

  const slots = await evalJSON(S, '__game.dashSlots()');
  const wrect = slots.warmth, crect = slots.cell;

  const readBay = async () => ({
    warm: await hook(S, 'dashRegion', ...wrect),
    cell: await hook(S, 'dashRegion', ...crect),
  });
  // The axis is the BALANCE now, so the fixture is money and it goes through the real account.
  // `seedWarmth` re-seeds the 8 s display filter so the bay is photographed where the fixture put
  // it rather than 8 s behind — it moves the DISPLAY and never the signal.
  await hook(S, 'setCredits', 300);
  await hook(S, 'seedWarmth');
  await settle(S, 20);
  const cool = await readBay();
  const coolState = await evalJSON(S, '__state.story');
  await hook(S, 'setCredits', 2400);
  await hook(S, 'seedWarmth');
  await settle(S, 20);
  const hot = await readBay();
  const hotState = await evalJSON(S, '__state.story');
  const dWarm = Math.hypot(hot.warm.r - cool.warm.r, hot.warm.g - cool.warm.g, hot.warm.b - cool.warm.b);
  const dCell = Math.hypot(hot.cell.r - cool.cell.r, hot.cell.g - cool.cell.g, hot.cell.b - cool.cell.b);
  // FALSIFY: the same bay sampled twice at the SAME balance must not move. Without this a dash that
  // repaints anything at all would pass the difference above.
  await settle(S, 40);
  const hot2 = await readBay();
  const dNull = Math.hypot(hot2.warm.r - hot.warm.r, hot2.warm.g - hot.warm.g, hot2.warm.b - hot.warm.b);
  check('B1 the reserved bay draws a gauge that tracks the demand',
    dWarm > 6 && dCell < 1.5 && dNull < 1.5 && coolState.warmth < 0.2 && hotState.warmth > 0.9,
    `warmth bay ${JSON.stringify(wrect)}: 300 CRD (warmth ${coolState.warmth}) rgb `
    + `${cool.warm.r}/${cool.warm.g}/${cool.warm.b} -> 2 400 CRD (warmth ${hotState.warmth}) `
    + `${hot.warm.r}/${hot.warm.g}/${hot.warm.b}, distance ${dWarm.toFixed(2)} (gate > 6) · `
    + `the CELL bay beside it moved ${dCell.toFixed(2)} (gate < 1.5), so this is the instrument and `
    + `not the panel · falsified: the same bay re-read 40 frames later at unchanged balance moved `
    + `${dNull.toFixed(2)}`);

  // B1b — **THE SATURATION CONTROL, ON THE REAL DASH.** A1/A2 prove the module cannot pin at
  // minute zero; this proves the pixels cannot either, because the defect Aaron met was a gauge
  // that looked identical at 3 000 and 5 000 credits. Three balances, three DIFFERENT bays.
  const steps = [];
  for (const c of [300, 900, 1500, 2100]) {
    await hook(S, 'setCredits', c);
    await hook(S, 'seedWarmth');
    await settle(S, 12);
    const px = await hook(S, 'dashRegion', ...wrect);
    const w = await evalJSON(S, '__state.story.warmth');
    steps.push({ c, w, px });
  }
  const gaps = steps.slice(1).map((s2, i) => Math.hypot(s2.px.r - steps[i].px.r,
    s2.px.g - steps[i].px.g, s2.px.b - steps[i].px.b));
  const warms = steps.map(s2 => s2.w);
  const rising = warms.every((v, i) => i === 0 || v > warms[i - 1]);
  check('B1b the gauge moves at EVERY step of the climb, not only at the ends',
    rising && gaps.every(g => g > 1.5),
    `${steps.map(s2 => `${s2.c} CRD -> warmth ${s2.w} rgb ${s2.px.r}/${s2.px.g}/${s2.px.b}`).join('\n')}\n`
    + `consecutive bay distances ${gaps.map(g => g.toFixed(2)).join(' / ')} (gate > 1.5 on EVERY `
    + `one) · the shipped gauge pinned to 1.0 for a player under 75 % of pace and would have `
    + `returned four identical readings here, which is a check a two-point difference could not `
    + `have failed · falsified by the per-step bound: one flat pair fails it`);

  // B2 — the display needle is a FILTERED copy of the raw signal, and the two are separate.
  await hook(S, 'setCredits', 300);
  await hook(S, 'seedWarmth');
  await settle(S, 20);
  const start = await evalJSON(S, '__state.story');
  await hook(S, 'grantCredits', 2200);
  await settle(S, 3);
  const early = await evalJSON(S, '__state.story');
  // The filter's time constant is 8 s, so "converged" needs ~2.5 constants of REAL time. `settle()`
  // counts frames and times out at 25 s, so this is two rounds rather than one long one.
  await settle(S, 600);
  await settle(S, 600);
  const late = await evalJSON(S, '__state.story');
  check('B2 the needle lags the signal, and __state reports the raw one',
    start.warmth < 0.2 && early.warmth > 0.9 && early.shown < early.warmth - 0.3
    && late.shown > early.shown + 0.2 && Math.abs(late.shown - late.warmth) < 0.2,
    `held at raw ${start.warmth} / needle ${start.shown} · 3 frames after banking 2 200 CRD: raw `
    + `${early.warmth}, needle ${early.shown} — the signal has moved and the needle has not · 1 200 `
    + `frames later: raw ${late.warmth}, needle ${late.shown}, converged · falsified by the middle `
    + `reading, where the two differ by ${(early.warmth - early.shown).toFixed(2)}: a gate that read `
    + `the needle would have been measuring an 8 s low-pass filter`);

  // B3 — the chase HUD carries the same signal AND the actionable number, changes what it is
  // measuring at the seizure, and stands down once the Boss has been paid.
  await hook(S, 'toggleView');
  await settle(S, 20);
  const readChase = () => evalJSON(S, `(() => {
    const e = document.querySelector('.ch-warm');
    if (!e) return null;
    const f = e.querySelector('[data-f=warmfill]');
    return { off: e.classList.contains('off'), label: e.querySelector('[data-f=warmlabel]').textContent,
      sub: e.querySelector('[data-f=warmsub]').textContent,
      w: f.style.width, cls: f.className, vis: e.getBoundingClientRect().width > 0,
      stage: window.__state.story.stage, state: window.__game.hudData().warmthState }; })()`);
  // B1b's climb latched `due`; un-arm it so the bar can be read MID-climb, which is the state the
  // player spends the whole of act one in and the one the old gauge could not show.
  await hook(S, 'setCredits', 1000);
  await hook(S, 'setDue', false);
  await settle(S, 400);
  const chaseOne = await readChase();
  // Through the seizure: the bar must RE-TARGET on the summons rather than disappear.
  await hook(S, 'setCredits', 3000);
  await hook(S, 'forceDock', 0);
  await settle(S, 14);
  await hook(S, 'closeEnding');
  await hook(S, 'closeHirePanel');
  await settle(S, 400);
  const chaseTwo = await readChase();
  // …and once he has been paid there is nothing left to measure, so the bay blanks.
  await hook(S, 'grantCredits', 12000);
  await settle(S, 10);
  await hook(S, 'meetBoss');
  await hook(S, 'closeBoss');
  await hook(S, 'closeHirePanel');
  await settle(S, 20);
  const chaseOff = await readChase();
  const dashOff = await evalJSON(S, '__game.hudData().warmth');
  check('B3 the chase HUD names the number, re-targets at the seizure, and stands down after him',
    chaseOne && !chaseOne.off && chaseOne.vis && chaseOne.state === 'call'
    && /^1,500 TO GO$/.test(chaseOne.sub)
    && chaseTwo && !chaseTwo.off && chaseTwo.state === 'summons' && /^7,000 TO GO$/.test(chaseTwo.sub)
    && chaseOff && chaseOff.off && dashOff === null,
    `act one at 1 000 CRD: off ${chaseOne && chaseOne.off}, label ${chaseOne && chaseOne.label}, `
    + `sub "${chaseOne && chaseOne.sub}", fill ${chaseOne && chaseOne.w} ${chaseOne && chaseOne.cls}\n`
    + `after the seizure (3 000 CRD kept): state ${chaseTwo && chaseTwo.state}, label `
    + `${chaseTwo && chaseTwo.label}, sub "${chaseTwo && chaseTwo.sub}" — the SAME bar now measuring `
    + `the 10 000, which is the thing the player is actually being asked for\n`
    + `after the meeting (stage ${chaseOff && chaseOff.stage}): off ${chaseOff && chaseOff.off}, and `
    + `hudData().warmth is ${dashOff} so the dash bay reverts to a blanking plate · falsified by the `
    + `same selector reading three different ways in one session, and by the two "TO GO" figures, `
    + `which are compared against DIFFERENT numbers`);

  const modals = await evalJSON(S, 'window.__modals');
  check('B4 no alert / confirm / prompt anywhere on the debt + seizure path',
    Array.isArray(modals) && modals.length === 0,
    `spies installed on window.alert/confirm/prompt before any story code ran; after a full pass `
    + `through the demand gauge, the seizure, the ending panel, the Boss meeting and the hire panel `
    + `they recorded ${JSON.stringify(modals)}`);
  await close();
}

// ── C: the seizure, the summons and the meeting ────────────────────────────
//
// ONE road. This leg used to loop over ['paid', 'seized'] and assert two different settlements;
// there is one settlement, so the loop is gone and what replaced it is the set of properties the
// brief asks for by name: it fires at the right money, at a dock, exactly once, the player keeps
// their cash, and the game is fully playable afterwards.
{
  const { S, close } = await session('/index.html?nosave=1&intro=0&crd=2000');
  await evalJSON(S, MODAL_SPY);

  // C1 — IT DOES NOT FIRE BELOW THE MONEY. Dock at 2 000 and nothing happens, which is the arm
  // that makes every "it fired" below a measurement rather than a coincidence of docking.
  await hook(S, 'forceDock', 0);
  await settle(S, 16);
  const under = await evalJSON(S, `({stage:__state.story.stage, due:__state.story.due,
    credits:__state.credits, ending:__state.ending.open, warmth:__state.story.warmth,
    need:__state.story.need})`);
  await evalJSON(S, '(window.__game.undock(), 1)');
  await settle(S, 8);

  // …now earn past it, in the air. It must ARM and must NOT settle.
  await hook(S, 'grantCredits', 700);
  await settle(S, 60);
  const airborne = await evalJSON(S, `({stage:__state.story.stage, due:__state.story.due,
    credits:__state.credits, warmth:__state.story.warmth, dock:__state.dock})`);
  check('C1 it fires at the money, and only at a dock',
    under.stage === 'debt' && under.due === false && under.ending === false
    && Math.abs(under.warmth - 0.8) < 0.01 && under.need === 500
    && airborne.due === true && airborne.stage === 'debt' && airborne.dock === null
    && airborne.credits === 2700 && airborne.warmth === 1,
    `DOCKED at ${under.credits} CRD, which is ${under.need} short of ${Story.SEIZE_AT}: stage `
    + `${under.stage}, due ${under.due}, panel open ${under.ending}, gauge ${under.warmth} — `
    + `nothing happened, and this is the arm that stops "docking" being the thing measured below\n`
    + `then earned 700 in the AIR: due ${airborne.due}, gauge ${airborne.warmth}, still stage `
    + `${airborne.stage} with ${airborne.credits} CRD in the account and dock `
    + `${JSON.stringify(airborne.dock)} — the settlement is NOT on the frame path: `
    + `${airborne.stage === 'debt' && airborne.credits === 2700 ? 'correct' : 'THIS IS THE DEFECT'}\n`
    + `falsified by the pair: the same dock 700 credits earlier did nothing`);

  // C2 — the settlement itself. It takes the CRAFT and NOT the money, exactly once.
  const before = await evalJSON(S, '__state.credits');
  await hook(S, 'forceDock', 0);
  await settle(S, 16);
  const after = await evalJSON(S, `({stage:__state.story.stage, branch:__state.story.branch,
    credits:__state.credits, flags:__state.flags, grounded:__state.story.grounded,
    wreck:__state.story.wreckLeft, hire:__state.story.hire, ending:__state.ending,
    borrowed:__state.borrowed, met:__state.story.met, left:__state.story.left,
    rung:__state.ranks.standing.rung, rank:__state.ranks.standing.name})`);
  const panel = await evalJSON(S, `(() => { const h = document.getElementById('ending');
    return { kicker: (h.querySelector('.en-kick')||{}).textContent || '',
      title: (h.querySelector('.hp-title')||{}).textContent || '',
      paras: [...h.querySelectorAll('.en-p')].map(e => e.textContent),
      cells: [...h.querySelectorAll('.en-cell')].map(e => [e.querySelector('i').textContent, e.querySelector('b').textContent]) }; })()`);
  // ONCE. Dock again and the panel must not re-open.
  await hook(S, 'closeEnding');
  await hook(S, 'closeHirePanel');
  await evalJSON(S, '(window.__game.undock(), 1)');
  await settle(S, 8);
  await hook(S, 'forceDock', 0);
  await settle(S, 16);
  const twice = await evalJSON(S, '({opens:__state.ending.opens, credits:__state.credits, stage:__state.story.stage})');
  const keep = panel.cells.find(c => c[0] === 'YOU KEEP');
  const wants = panel.cells.find(c => c[0] === 'HE WANTS');
  const text = panel.paras.join(' ');
  check('C2 they take the craft, they leave the money, and it happens exactly once',
    after.stage === 'act2' && after.branch === 'taken' && after.credits === before
    && after.grounded === true && after.hire === null && after.wreck === 1
    && after.borrowed === true && after.met === false && after.left === Story.DEBT
    && after.flags.includes('car_seized') && after.flags.includes('dad_favour')
    && !after.flags.includes('debt_cleared')
    && after.ending.open === true && after.ending.opens === 1
    && panel.title === Story.OUTCOME.title && panel.kicker === Story.OUTCOME.kicker
    && keep && keep[1].replace(/\D/g, '') === String(before)
    && wants && wants[1].replace(/\D/g, '') === String(Story.SUMMONS)
    && /worth more to him flying/.test(text) && /He does not touch the account/.test(text)
    && twice.opens === 1 && twice.credits === before,
    `${before} -> ${after.credits} CRD — **UNCHANGED**, which is the whole of Aaron's *"it could `
    + `even allow to let the player keep his cash"*; the shipped build set it to 90\n`
    + `stage ${after.stage}/${after.branch}, grounded ${after.grounded}, wrecks ${after.wreck}, `
    + `flags ${JSON.stringify(after.flags)}, standing ${after.rung} ${after.rank}\n`
    + `panel "${panel.kicker}" / "${panel.title}", cells ${JSON.stringify(panel.cells)}\n`
    + `the arm: ${panel.paras[2]}\n`
    + `falsified two ways: the balance is compared for EQUALITY (a settlement that took anything `
    + `fails), and a SECOND dock afterwards left opens at ${twice.opens} and the balance at `
    + `${twice.credits} — it is a one-shot, not a per-dock event`);

  // C3 — NO FAIL STATE. Grounded blocks UNDOCK, but the button that would refuse opens the panel
  // that fixes it, and hiring gets the player flying again on what they were left with.
  const groundedUndock = await evalJSON(S, '(window.__game.undock(), {dock:__state.dock, grounded:__state.story.grounded, hire:__state.hirePanel})');
  const wreckCost = await evalJSON(S, 'window.__game.Story.hireCost(__game.story(), "wisp", 1)');
  const hired = await hook(S, 'hire', 'wisp', 1);
  await settle(S, 8);
  const afterHire = await evalJSON(S, `({grounded:__state.story.grounded, hire:__state.story.hire,
    craft:__game.economy.craft, credits:__state.credits, borrowed:__state.borrowed})`);
  const undocked = await evalJSON(S, '(window.__game.undock(), {dock:__state.dock})');
  check('C3 no fail state — grounded, then hired on the money they kept, then flying',
    groundedUndock.dock !== null && groundedUndock.grounded === true
    && wreckCost.wreck === true && wreckCost.price === Story.HIRE.WRECK_PRICE
    && hired && hired.ok && afterHire.grounded === false && afterHire.hire
    && afterHire.borrowed === true && undocked.dock === null
    && afterHire.credits >= Story.HIRE.BLOCK_BASE,
    `grounded UNDOCK left the player docked (${JSON.stringify(groundedUndock.dock)}) and opened the `
    + `hire panel instead of refusing · the wreck is on the lot at ${wreckCost.price} CRD · hired `
    + `for ${JSON.stringify(hired)}, leaving ${afterHire.credits} CRD on a ${afterHire.craft} with `
    + `${afterHire.hire ? afterHire.hire.left.toFixed(0) : '-'} s on the meter — and that balance is `
    + `still above one full-price block (${Story.HIRE.BLOCK_BASE} CRD), so the loop is affordable `
    + `without the one-off · UNDOCK then worked (dock ${undocked.dock}) · falsified by the first `
    + `UNDOCK, which is the same call before the hire`);

  // C4 — THE SUMMONS. It refuses one credit short, it takes exactly SUMMONS at a dock, and it is
  // what opens act two: the company layer and the remarks about the player's father.
  await hook(S, 'setCredits', Story.SUMMONS - 1);
  await hook(S, 'forceDock', 0);
  await settle(S, 16);
  const short = await evalJSON(S, `({boss:__state.boss, met:__state.story.met, credits:__state.credits,
    company:__state.company, door:__state.thread.door, remark:!!window.__game.remark().id})`);
  await hook(S, 'closeHirePanel');
  await hook(S, 'grantCredits', 4001);
  await settle(S, 20);
  const met = await evalJSON(S, `({boss:__state.boss, met:__state.story.met, credits:__state.credits,
    flags:__state.flags, left:__state.story.left, paid:__state.story.paid,
    group:!!__state.group, warmth:__state.story.warmth})`);
  const bossPanel = await evalJSON(S, `(() => { const h = document.getElementById('boss');
    return { hidden: h.classList.contains('hidden'),
      title: (h.querySelector('.hp-title')||{}).textContent || '',
      paras: [...h.querySelectorAll('.en-p')].map(e => e.textContent),
      cells: [...h.querySelectorAll('.en-cell')].map(e => [e.querySelector('i').textContent, e.querySelector('b').textContent]),
      close: (h.querySelector('.hp-close')||{}).textContent || '' }; })()`);
  const remarkNow = await evalJSON(S, 'window.__game.remark()');
  check('C4 the meeting takes the ten thousand in person, and it is what opens act two',
    short.met === false && short.boss.open === false && short.company === null
    && short.door === null && short.remark === false
    && met.met === true && met.boss.open === true
    && met.credits === (Story.SUMMONS - 1) + 4001 - Story.SUMMONS
    && met.paid === Story.SUMMONS && met.left === Story.DEBT - Story.SUMMONS
    && met.flags.includes('crew_hook') && met.flags.includes('paid_up')
    && met.warmth === null && met.group === true
    && bossPanel.hidden === false && bossPanel.close === 'GO ON'
    && bossPanel.cells.some(c => c[0] === 'STILL OWED' && /40 000/.test(c[1]))
    && !!remarkNow.id,
    `DOCKED one credit short (${short.credits} of ${Story.SUMMONS}): met ${short.met}, panel open `
    + `${short.boss.open}, company layer ${JSON.stringify(short.company)}, thread door `
    + `${JSON.stringify(short.door)}, a forced remark delivered ${short.remark} — every one of `
    + `those is the act-two content staying shut\n`
    + `then one credit over: he takes ${met.paid} and leaves ${met.credits}; ${met.left} CRD of the `
    + `${Story.DEBT} still stands; flags ${JSON.stringify(met.flags)}; the company registry exists `
    + `(${met.group}); the gauge goes to ${JSON.stringify(met.warmth)}, a blanking plate, because `
    + `there is nothing left to be short of; and the remarks are live — "${remarkNow.id}" landed\n`
    + `panel "${bossPanel.title}" / ${bossPanel.close}, cells ${JSON.stringify(bossPanel.cells)}\n`
    + `falsified by the one-credit arm, which is the SAME dock with one credit less`);

  const modals = await evalJSON(S, 'window.__modals');
  check('C5 no modal on the seizure or the meeting path',
    Array.isArray(modals) && modals.length === 0, `recorded ${JSON.stringify(modals)}`);
  await close();
}

// ── C6: the whole of it survives a reload ──────────────────────────────────
{
  // WITHOUT ?nosave, so the profile is real, and without ?story=, because that flag is re-applied
  // on every boot and would replay the beat on the second one — which looks exactly like a latch
  // that did not persist.
  const URL = '/index.html?intro=0&crd=2600&tier=2';
  const { S, base, close } = await session(URL);
  await evalJSON(S, MODAL_SPY);
  await hook(S, 'forceDock', 0);
  await settle(S, 16);
  await hook(S, 'closeEnding');
  await hook(S, 'closeHirePanel');
  await hook(S, 'setCredits', Story.SUMMONS);
  await settle(S, 20);
  const first = await evalJSON(S, `({stage:__state.story.stage, met:__state.story.met,
    credits:__state.credits, opens:__state.ending.opens, bossOpens:__state.boss.opens})`);
  await hook(S, 'closeBoss');
  await hook(S, 'closeHirePanel');
  // save() debounces 2 s; give it real wall time and then read what is actually on disk.
  await settle(S, 200);
  const stored = await evalJSON(S, `(() => { const raw = localStorage.getItem('neonhaul.save.v1');
    if (!raw) return null; const p = JSON.parse(raw);
    return { stage: p.story && p.story.stage, branch: p.story && p.story.branch,
      met: p.story && p.story.met, due: p.story && p.story.due, credits: p.credits,
      flags: p.flags }; })()`);
  await S('Page.navigate', { url: `${base}${URL}` });
  await waitFor(S, 'window.__ready', 60000);
  await settle(S, 30);
  await quiesce(S, { timeout: 60000 });
  await evalJSON(S, MODAL_SPY);
  await hook(S, 'forceDock', 0);
  await settle(S, 20);
  const second = await evalJSON(S, `({stage:__state.story.stage, met:__state.story.met,
    branch:__state.story.branch, credits:__state.credits, endingOpens:__state.ending.opens,
    bossOpens:__state.boss.opens, door:__state.thread.door, warmth:__state.story.warmth})`);
  const modals = await evalJSON(S, 'window.__modals');
  check('C6 both beats survive a reload and neither plays twice',
    first.stage === 'act2' && first.met === true && first.opens === 1 && first.bossOpens === 1
    && stored && stored.stage === 'act2' && stored.branch === 'taken' && stored.met === true
    && stored.flags.includes('paid_up')
    && second.stage === 'act2' && second.met === true && second.branch === 'taken'
    && second.endingOpens === 0 && second.bossOpens === 0 && second.warmth === null
    && Array.isArray(modals) && modals.length === 0,
    `first boot: seizure then meeting, ending opens ${first.opens}, boss opens ${first.bossOpens}, `
    + `${first.credits} CRD left\n`
    + `what is actually on disk under neonhaul.save.v1: ${JSON.stringify(stored)}\n`
    + `after a real reload of the same URL and a dock: stage ${second.stage}, met ${second.met}, `
    + `branch ${second.branch}, ending opens THIS session ${second.endingOpens}, boss opens `
    + `${second.bossOpens}, gauge ${JSON.stringify(second.warmth)} · falsified by the two \`opens\` `
    + `counters, which count shows on THIS page and were both 1 on the first boot · modals `
    + `${JSON.stringify(modals)}`);
  await close();
}

// ── D: the hire loop from inside the cabin ─────────────────────────────────
{
  const { S, close } = await session('/index.html?nosave=1&intro=0&crd=20000');
  await evalJSON(S, MODAL_SPY);
  const hidden0 = await evalJSON(S, `(() => { const b = document.getElementById('btn-hire');
    return { hidden: b.classList.contains('hidden'), disabled: b.disabled }; })()`);
  await hook(S, 'hire', 'wisp', 1);
  await settle(S, 12);
  const onHire = await evalJSON(S, `(() => { const b = document.getElementById('btn-hire');
    const r = b.getBoundingClientRect();
    return { hidden: b.classList.contains('hidden'), disabled: b.disabled, w: Math.round(r.width),
      h: Math.round(r.height), covered: (document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) || {}).id || null,
      left: window.__state.story.hire.left, maxFwd: window.__state.flight.maxFwd }; })()`);
  // D1 — press it FOR REAL. A synthesised click on #controls is suppressed by its own
  // preventDefault (S2-A found this the hard way), so the press goes through touch.
  const r = onHire;
  await evalJSON(S, `(() => { const b = document.getElementById('btn-hire');
    const rr = b.getBoundingClientRect();
    const t = new Touch({ identifier: 1, target: b, clientX: rr.x + rr.width / 2, clientY: rr.y + rr.height / 2 });
    b.dispatchEvent(new TouchEvent('touchend', { bubbles: true, cancelable: true, changedTouches: [t], touches: [] }));
    return true; })()`);
  await settle(S, 10);
  const opened = await evalJSON(S, '__state.hirePanel');
  check('D1 the cabin HIRE key exists, un-hides on a hire, and opens the panel',
    hidden0.hidden === true && onHire.hidden === false && onHire.disabled === false
    && onHire.w >= 40 && onHire.h >= 30 && opened && opened.open === true,
    `before any hire: hidden ${hidden0.hidden} disabled ${hidden0.disabled} (S2-A's reserved slot) · `
    + `on a hire: ${onHire.w}x${onHire.h} px, hidden ${onHire.hidden}, topmost element at its centre `
    + `is #${onHire.covered} · a real touchend opened the panel (${opened && opened.open}) · `
    + `falsified by the before-state, which is the same selector with no hire on the meter`);

  // D2 — extending ADDS a block rather than restarting one, which is what "+5 minutes" means.
  await hook(S, 'closeHire');
  const beforeExt = await evalJSON(S, '({left:__state.story.hire.left, credits:__state.credits, blocks:__state.story.hire.blocks})');
  const ext = await hook(S, 'hire', 'wisp', 1);
  const afterExt = await evalJSON(S, '({left:__state.story.hire.left, credits:__state.credits, blocks:__state.story.hire.blocks})');
  const added = afterExt.left - beforeExt.left;
  check('D2 extending adds a block to what is left, and charges for it',
    ext.ok && Math.abs(added - 300) < 3 && beforeExt.credits - afterExt.credits === 1425
    && afterExt.blocks === beforeExt.blocks + 1,
    `${beforeExt.left.toFixed(1)} s -> ${afterExt.left.toFixed(1)} s (+${added.toFixed(1)}, want 300) · `
    + `${beforeExt.credits} -> ${afterExt.credits} CRD (-${beforeExt.credits - afterExt.credits}, want 1425) · `
    + `blocks ${beforeExt.blocks} -> ${afterExt.blocks}`);

  // D3 — a lapsed hire limps at §7.4.3's tow speed and extending restores the hull. The falsifier
  // is the reading taken one hook call earlier on the same craft.
  const flying = await evalJSON(S, '__state.flight.maxFwd');
  await hook(S, 'expireHire');
  await settle(S, 20);
  const limp = await evalJSON(S, '({maxFwd:__state.flight.maxFwd, limp:__state.story.limp, left:__state.story.hire.left})');
  await hook(S, 'hire', 'wisp', 1);
  await settle(S, 10);
  const restored = await evalJSON(S, '({maxFwd:__state.flight.maxFwd, limp:__state.story.limp})');
  check('D3 a lapsed hire limps, and is not a fail state',
    Math.abs(limp.maxFwd - E.CELL.TOW_SPEED) < 0.01 && limp.limp === true
    && Math.abs(restored.maxFwd - flying) < 0.01 && restored.limp === false,
    `maxFwd ${flying} m/s on a live hire -> ${limp.maxFwd} on a lapsed one (§7.4.3 tow speed `
    + `${E.CELL.TOW_SPEED}) -> ${restored.maxFwd} after extending from the cabin · falsified by the `
    + `first and third readings, which bracket the second on the same hull`);

  // D5 — buying a hull OUTRIGHT is the arc's destination and it has to end the hire, clear
  // `borrowed` and un-ground the player. `Econ.buyCraft` alone does none of that, so this is the
  // one purchase with a story wrapper and the one most likely to be refactored back into the pure
  // module by somebody tidying up.
  await hook(S, 'closeHire');
  await hook(S, 'grantCredits', 40000);
  const beforeBuy = await evalJSON(S, '({hire:!!__state.story.hire, borrowed:__state.borrowed, assets:__state.ranks.assets})');
  await hook(S, 'buyCraft', 'kestrel');
  await settle(S, 10);
  const afterBuy = await evalJSON(S, `({hire:!!__state.story.hire, borrowed:__state.borrowed,
    grounded:__state.story.grounded, craft:__game.economy.craft, assets:__state.ranks.assets, limp:__state.story.limp})`);
  check('D5 buying a hull outright ends the hire and makes it yours',
    beforeBuy.hire === true && beforeBuy.borrowed === true && beforeBuy.assets === 0
    && afterBuy.hire === false && afterBuy.borrowed === false && afterBuy.grounded === false
    && afterBuy.craft === 'kestrel' && afterBuy.assets > 500 && afterBuy.limp === false,
    `on a hire: hire ${beforeBuy.hire}, borrowed ${beforeBuy.borrowed}, recoverable assets `
    + `${beforeBuy.assets} CRD · after buying a kestrel: hire ${afterBuy.hire}, borrowed `
    + `${afterBuy.borrowed}, grounded ${afterBuy.grounded}, assets ${afterBuy.assets} CRD — the hull `
    + `finally counts on the standing ladder · falsified by the before-state, which is the same `
    + `three fields one purchase earlier`);

  // D4 — the panel refuses without a modal and says why, and a hull above the licence is refused
  // for hire exactly as it is for purchase.
  await hook(S, 'openHire', 'extend');
  await settle(S, 8);
  const rows = await evalJSON(S, `[...document.querySelectorAll('.hr-row')].map(e => ({
    id: e.querySelector('.hrr-id').textContent, why: e.querySelector('.hrr-why').textContent,
    dis: e.disabled }))`);
  const wispRow = rows.find(x => x.id === 'WISP');
  const mamRow = rows.find(x => x.id === 'MAMMOTH');
  const modals = await evalJSON(S, 'window.__modals');
  check('D4 refusals are greyed rows with a reason, never a modal',
    wispRow && !wispRow.dis && mamRow && mamRow.dis && /licence/i.test(mamRow.why)
    && Array.isArray(modals) && modals.length === 0,
    `${rows.length} fleet rows · WISP enabled ${!wispRow.dis} ("${wispRow.why}") · MAMMOTH disabled `
    + `${mamRow.dis} ("${mamRow.why}") · modals recorded ${JSON.stringify(modals)} · falsified by the `
    + `two rows reading opposite ways in the same painted panel`);
  await close();
}

// ── E: the intro cutscene ──────────────────────────────────────────────────
{
  // E1 — the two doors, in one comparison. A harness must NOT get the cutscene and must still end
  // up in the same arc state, or eleven gate suites boot behind a speech bubble.
  const a = await session('/index.html?nosave=1');
  const noIntro = await evalJSON(a.S, '({intro:__state.intro, stage:__state.story.stage, name:__state.story.name})');
  await a.close();

  const { S, close } = await session('/index.html?nosave=1&intro=1');
  await evalJSON(S, MODAL_SPY);
  const withIntro = await evalJSON(S, '({intro:__state.intro, stage:__state.story.stage, mode:__state.mode})');
  check('E1 the cutscene plays for a player and is silently completed for a harness',
    noIntro.intro === null && noIntro.stage === 'debt'
    && withIntro.intro && withIntro.intro.active === true && withIntro.stage === 'intro',
    `?nosave=1 alone: intro ${noIntro.intro}, stage ${noIntro.stage}, name "${noIntro.name}" — the arc `
    + `is running and nothing is blocking the frame · ?nosave=1&intro=1: active `
    + `${withIntro.intro.active}, phase ${withIntro.intro.phase}, stage ${withIntro.stage}, mode `
    + `${withIntro.mode} · falsified by the pair, which differ only in the flag`);

  // E2 — Aaron asked for the docking cylinder to be almost invisible BY NAME.
  const dim = await evalJSON(S, `(() => { const out = [];
    window.__game.scene.traverse(o => { if (o.name === 'zones') o.children.forEach(c => out.push(c.material ? +c.material.opacity.toFixed(4) : null)); });
    return out; })()`);
  await hook(S, 'introSkip');
  await settle(S, 12);
  const restored = await evalJSON(S, `(() => { const out = [];
    window.__game.scene.traverse(o => { if (o.name === 'zones') o.children.forEach(c => out.push(c.material ? +c.material.opacity.toFixed(4) : null)); });
    return out; })()`);
  const dimmed = dim[0] < 0.05 && dim[1] < 0.08;
  const back = Math.abs(restored[0] - 0.55) < 1e-3 && Math.abs(restored[1] - 0.9) < 1e-3;
  check('E2 the docking cylinder is almost invisible for the cutscene, and comes back',
    dimmed && back,
    `zone material opacities during the scene ${JSON.stringify(dim.slice(0, 6))} (cylinder ${dim[0]}, `
    + `ring ${dim[1]}) · after it ${JSON.stringify(restored.slice(0, 6))} · falsified by the pair. `
    + `NOTE: an earlier probe of this measured 0.55/0.9 during the scene and looked like a failure — `
    + `the probe itself had called setDim(undefined), which is setDim(1). The measurement was the bug.`);

  const after = await evalJSON(S, '({stage:__state.story.stage, mode:__state.mode, name:__state.story.name, ctl: !document.getElementById("controls").classList.contains("hidden")})');
  check('E3 skipping lands in the same state confirming does',
    after.stage === 'debt' && after.mode === 'fly' && !!after.name && after.ctl === true,
    `after SKIP: stage ${after.stage}, mode ${after.mode}, name "${after.name}", controls visible `
    + `${after.ctl} · the skip path calls the same beginDebt() the CONFIRM button does, so there is `
    + `no state only reachable one way`);
  await close();
}

{
  // E6 — the cutscene's controls are REAL controls. S2-A shipped a VIEW button that did nothing
  // because `#controls`' own preventDefault suppressed the synthesised click, and the only reason
  // that was found is that a gate pressed it for real. `#intro` is `pointer-events: none` with two
  // opt-outs, so "is anything actually hittable" is exactly the question worth asking here.
  const { S: S6, close: close6 } = await session('/index.html?nosave=1&intro=1');
  const hit = await evalJSON(S6, `(() => {
    const at = sel => { const e = document.querySelector(sel); if (!e) return null;
      const r = e.getBoundingClientRect();
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return { w: Math.round(r.width), h: Math.round(r.height), self: top === e || e.contains(top) }; };
    return { skip: at('.iv-skip'), go: at('.ivf-go'), male: at('.ivf-g'), input: at('.ivf-name') };
  })()`);
  await evalJSON(S6, `(() => { document.querySelectorAll('.ivf-g')[1].click();
    document.querySelector('.ivf-name').value = 'REALCLICK';
    document.querySelector('.ivf-go').click(); return true; })()`);
  await settle(S6, 10);
  const clicked = await evalJSON(S6, '({phase:__state.intro && __state.intro.phase, pick:__state.intro && __state.intro.pick})');
  await evalJSON(S6, `(document.querySelector('.iv-skip').click(), true)`);
  await settle(S6, 10);
  const skipped = await evalJSON(S6, '({intro:__state.intro, stage:__state.story.stage, name:__state.story.name, gender:__state.story.gender})');
  check('E6 the cutscene\'s buttons are hittable and real clicks work',
    hit.skip && hit.skip.self && hit.go && hit.go.self && hit.male && hit.male.self
    && hit.input && hit.input.self && hit.skip.w >= 44 && hit.go.h >= 30
    && clicked.phase === 'pullout' && clicked.pick.name === 'REALCLICK' && clicked.pick.gender === 'f'
    && skipped.intro === null && skipped.stage === 'debt' && skipped.name === 'REALCLICK'
    && skipped.gender === 'f',
    `hit tests (elementFromPoint at each centre resolves to the control itself): SKIP `
    + `${hit.skip.w}x${hit.skip.h} ${hit.skip.self} · CONFIRM ${hit.go.w}x${hit.go.h} ${hit.go.self} · `
    + `a gender key ${hit.male.w}x${hit.male.h} ${hit.male.self} · the name field ${hit.input.self} — `
    + `#intro is pointer-events:none, so a missing opt-out shows up here as false · a real click on `
    + `FEMALE + CONFIRM moved the scene to ${clicked.phase} carrying `
    + `${JSON.stringify(clicked.pick)} · a real click on SKIP finished it into stage `
    + `${skipped.stage} as "${skipped.name}"/${skipped.gender}`);
  await close6();
}

{
  // E4 — the name and gender the player picks land on the arc, and the scene costs no draw calls.
  const { S, close } = await session('/index.html?nosave=1&intro=1');
  await evalJSON(S, MODAL_SPY);
  const drawsIdle = await evalJSON(S, '__state.draws');
  await hook(S, 'introName', 'HALLOW', 'f');
  await hook(S, 'introStep', 6);
  await settle(S, 30);
  const mid = await evalJSON(S, '({draws:__state.draws, intro:__state.intro, bubbles: document.querySelectorAll(".iv-bubble").length, lines: document.querySelectorAll(".iv-lead").length})');
  await hook(S, 'introStep', 60);
  await settle(S, 20);
  const done = await evalJSON(S, '({stage:__state.story.stage, name:__state.story.name, gender:__state.story.gender, intro:__state.intro})');
  const modals = await evalJSON(S, 'window.__modals');
  check('E4 the pick lands on the arc; the crew cost no draw calls',
    done.stage === 'debt' && done.name === 'HALLOW' && done.gender === 'f' && done.intro === null
    && mid.draws <= drawsIdle + 1 && mid.bubbles >= 1 && mid.lines >= 1
    && Array.isArray(modals) && modals.length === 0,
    `name "${done.name}" gender ${done.gender} survived into stage ${done.stage} · draw calls `
    + `${drawsIdle} with the scene parked -> ${mid.draws} with six crew hulls and the player's in `
    + `frame (gate <= ${drawsIdle + 1}) — they are instances of meshes that were already being drawn · `
    + `${mid.bubbles} bubble(s) and ${mid.lines} leader line(s) up at beat ${mid.intro.beat} · `
    + `modals ${JSON.stringify(modals)}`);
  await close();
}

{
  // E5 — the VO exists, matches the script slot for slot, and is NOT band-limited. The last part is
  // the one that can rot silently: running the story clips through tools/radio_fx.sh would leave
  // every other check in this file passing.
  const { S, base, close } = await session('/index.html?nosave=1&intro=0');
  // The slot list is DERIVED from the shipped script rather than typed out here — a line added to
  // storyui.js without a clip behind it must show up as a miss, and a hand-copied list could not
  // see that. `StoryVoice.slotFor` is the same function the game uses to name a file.
  const { SCRIPT, MONOLOGUE, StoryVoice } = await import(resolve(ROOT, 'js/storyui.js'));
  const V = new StoryVoice({});
  const want = [];
  for (const row of SCRIPT) if (row.who === 'boss') want.push(V.slotFor(row, 'n'));
  for (const g of ['m', 'f', 'n']) {
    for (const row of SCRIPT.concat([MONOLOGUE])) if (row.who === 'pc') want.push(V.slotFor(row, g));
  }
  // Fetched from node, not from the page: `Runtime.evaluate` returns the JSON of a PROMISE when
  // the expression is an async IIFE wrapped in JSON.stringify, and "{}" filters as an empty object
  // rather than as a failure. That is a measurement that measures nothing, caught by it throwing.
  const got = [];
  for (const slot of want) {
    const r = await fetch(`${base}/assets/audio/story/${slot}.mp3`);
    const buf = r.ok ? await r.arrayBuffer() : new ArrayBuffer(0);
    got.push([slot, r.status, buf.byteLength]);
  }
  const missing = got.filter(g => g[1] !== 200 || g[2] < 2000);
  const bytes = got.reduce((s, g) => s + g[2], 0);
  check('E5 all 19 story clips ship, one Boss take and three player takes',
    want.length === 19 && got.length === 19 && missing.length === 0 && bytes > 300000 && bytes < 900000,
    `${got.length - missing.length}/19 present, ${bytes} B total (mean ${Math.round(bytes / 19)}) · `
    + `7 Boss slots x 1 take + 4 player lines x 3 takes · missing ${JSON.stringify(missing)} · `
    + `falsified by the size floor: a 0-byte or 404 slot lands in the missing list rather than being counted`);
  await close();
}

// ── F: the pace signal is fed by the real payment path ─────────────────────
{
  // 500 CRD, deliberately: one delivery must not carry the account past SEIZE_AT while this leg is
  // standing on a pad, or the ending panel lands in the middle of a measurement about payments.
  const { S, close } = await session('/index.html?nosave=1&intro=0&crd=500');
  await evalJSON(S, MODAL_SPY);
  await hook(S, 'setStoryRate', 0);
  const before = await evalJSON(S, '({earned:__state.story.earned, rate:__state.story.rate, credits:__state.credits})');
  // A real delivery through the real board, not a synthetic credit.
  await hook(S, 'forceDock', 0);
  await settle(S, 8);
  const board = await evalJSON(S, '__state.board');
  await hook(S, 'accept', 0);
  await settle(S, 6);
  const paid = await hook(S, 'completeJob');
  await settle(S, 10);
  const after = await evalJSON(S, '({earned:__state.story.earned, rate:__state.story.rate, credits:__state.credits})');
  const gained = after.credits - before.credits;
  check('F1 every credit earned reaches the pace signal',
    board > 0 && gained > 0 && after.earned === gained && after.rate > before.rate,
    `board had ${board} jobs · one real accept + delivery paid ${gained} CRD · story.earned `
    + `${before.earned} -> ${after.earned} (must equal the payment, not merely rise) · the trailing `
    + `rate went ${before.rate} -> ${after.rate} CRD/s · falsified by the equality: a payment path `
    + `that forgot Story.credit() leaves earned at ${before.earned} while credits still move`);
  const modals = await evalJSON(S, 'window.__modals');
  check('F2 no modal on the delivery path either',
    Array.isArray(modals) && modals.length === 0, `recorded ${JSON.stringify(modals)}`);
  await close();
}

console.log(`\n${ok.length}/${ok.length + fail.length} pass  ${fail.length ? '· FAILED: ' + fail.join(', ') : ''}`);
console.log(`wrote ${FILE.replace(ROOT + '/', '')}`);
process.exit(fail.length ? 1 : 0);
