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
  // A1 — the mapping. 0.5 at ratio 1.00, 1 at or below HOT, 0 at or above COLD, and monotone.
  const at = ratio => {
    const remain = Story.WINDOW_S / 2;
    const st = Story.newStory({ stage: 'debt', t: Story.WINDOW_S - remain });
    // Solve the rate that produces this ratio from a zero balance, so `ratio` is the only variable.
    st.rate = (ratio * Story.DEBT) / remain;
    return Story.pace(st, econ(0)).warmth;
  };
  const mid = at(1.0), hot = at(Story.HOT - 0.2), cold = at(Story.COLD + 0.2);
  const mono = [0.7, 0.85, 1.0, 1.15, 1.3].map(at);
  const desc = mono.every((v, i) => i === 0 || v <= mono[i - 1] + 1e-9);
  // FALSIFY: the same mapping fed a ratio it must NOT map to 0.5.
  const notMid = Math.abs(at(1.30) - 0.5) > 0.3 && Math.abs(at(0.70) - 0.5) > 0.3;
  check('A1 warmth maps pace, half scale at break-even',
    Math.abs(mid - 0.5) < 0.01 && hot === 1 && cold === 0 && desc && notMid,
    `ratio 1.00 -> ${mid.toFixed(3)} (want 0.500) · ratio ${(Story.HOT - 0.2).toFixed(2)} -> ${hot} · `
    + `ratio ${(Story.COLD + 0.2).toFixed(2)} -> ${cold} · monotone ${desc} · `
    + `sweep ${mono.map(v => v.toFixed(2)).join(' ')} · falsified: ratio 1.30 -> ${at(1.3).toFixed(2)}, `
    + `0.70 -> ${at(0.7).toFixed(2)}, both far from 0.5`);
}

{
  // A2 — THE PROPERTY A COUNTDOWN CANNOT HAVE. A player earning exactly the required rate reads
  // the SAME needle at 5, 40 and 80 minutes. A timer would read 6 %, 48 % and 95 % at those marks.
  const sample = mins => {
    const st = Story.newStory({ stage: 'debt', t: mins * 60 });
    const banked = Story.BREAK_EVEN * mins * 60;           // exactly on pace
    st.rate = Story.BREAK_EVEN;
    return Story.pace(st, econ(banked)).warmth;
  };
  const marks = [5, 40, 80].map(sample);
  const spread = Math.max(...marks) - Math.min(...marks);
  // The control: what the same three marks would read on a countdown.
  const clock = [5, 40, 80].map(m => (m * 60) / Story.WINDOW_S);
  const clockSpread = Math.max(...clock) - Math.min(...clock);
  check('A2 the gauge reads PACE, not elapsed time',
    spread < 0.02 && clockSpread > 0.85,
    `on-pace warmth at 5/40/80 min = ${marks.map(v => v.toFixed(4)).join(' / ')} — spread ${spread.toFixed(4)} `
    + `(gate < 0.02). The countdown control over the same three marks reads `
    + `${clock.map(v => v.toFixed(2)).join(' / ')} — spread ${clockSpread.toFixed(2)}. A timer and a pace `
    + `gauge are therefore measurably different things here, which is what makes this check able to fail.`);
}

{
  // A3 — the escalation ratchets, in order, once each, and NEVER below its threshold.
  const st = Story.newStory({ stage: 'debt', t: Story.MSG_FLOOR + 1 });
  const got = [];
  let now = 1000;
  // Walk warmth up by starving the rate. Each step is a full MSG_HOLD apart so the hold is not
  // what is being measured.
  for (const rate of [Story.BREAK_EVEN * 1.4, Story.BREAK_EVEN * 0.9, Story.BREAK_EVEN * 0.62,
    Story.BREAK_EVEN * 0.42, Story.BREAK_EVEN * 0.1]) {
    st.rate = rate;
    for (let k = 0; k < 3; k++) {
      const ev = Story.tick(st, econ(1000), 0.5, now);
      now += Story.MSG_HOLD + 1;
      if (ev.boss) got.push([ev.boss.id, +Story.pace(st, econ(1000)).warmth.toFixed(2)]);
    }
  }
  const ids = got.map(g => g[0]);
  const ordered = ids.join(',') === 'b1,b2,b3,b4';
  const noneEarly = got.every(([id, w]) => {
    const row = Story.BOSS_LINES.find(l => l.id === id);
    return !row || w >= row.at - 1e-6;
  });
  // FALSIFY: a story parked at a warmth below b1's threshold must emit NOTHING however long it runs.
  const cool = Story.newStory({ stage: 'debt', t: Story.MSG_FLOOR + 1, rate: Story.BREAK_EVEN * 3 });
  let coolFired = 0, cn = 5000;
  for (let k = 0; k < 20; k++) { if (Story.tick(cool, econ(1000), 1, cn).boss) coolFired++; cn += Story.MSG_HOLD + 1; }
  check('A3 the Boss ratchets on pace, in order, once each',
    ordered && noneEarly && ids.length === 4 && coolFired === 0,
    `fired ${JSON.stringify(got)} — in order ${ordered}, none below its own threshold ${noneEarly} · `
    + `falsified: a pilot held at warmth `
    + `${Story.pace(cool, econ(1000)).warmth.toFixed(2)} over 20 ticks fired ${coolFired} lines`);
}

{
  // A4 — CLEAR is a state, not a very cool reading, and it comes back the moment you spend it.
  const st = Story.newStory({ stage: 'debt', t: Story.WINDOW_S * 0.9, rate: 0 });
  const clear = Story.pace(st, econ(Story.DEBT));
  const spent = Story.pace(st, econ(Story.DEBT - 5000));
  // 0.6, not 0.9. With 504 s left and a zero trailing rate the projection after spending 5,000 is
  // 45,000 / 50,000 = ratio 0.90, which maps to 0.70 — the gate's first number was an expectation,
  // not a derivation, and the code was right.
  check('A4 CLEAR when the account covers it, and it returns when spent',
    clear.clear && clear.warmth === 0 && !spent.clear && spent.warmth > 0.6,
    `at ${Story.DEBT} CRD: clear ${clear.clear}, warmth ${clear.warmth} · `
    + `after spending 5 000: clear ${spent.clear}, warmth ${spent.warmth} · `
    + `falsified by the second reading, which is the SAME state object one purchase later`);
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
  // A6 — the standing flags S2-D left empty. The seized branch must cost a rung and the paid one
  // must buy two, at IDENTICAL net worth, or the flag axis is decoration.
  const base = { credits: 20000, craft: 'wisp', upgrades: {}, lifetime: 0, tier: 1 };
  const none = Ranks.standingRank(Ranks.netWorth(base), []);
  const paid = Ranks.standingRank(Ranks.netWorth(base), ['debt_cleared', 'dad_favour']);
  const seiz = Ranks.standingRank(Ranks.netWorth(base), ['car_seized', 'crew_hook']);
  const nonsense = Ranks.standingRank(Ranks.netWorth(base), ['not_a_flag']);
  check('A6 story flags move standing, in both directions',
    paid.rung === none.rung + 2 && seiz.rung === none.rung - 1 && nonsense.rung === none.rung,
    `at ${Ranks.netWorth(base)} CRD net worth: no flags ${none.rung} ${none.name} · `
    + `paid ${paid.rung} ${paid.name} · seized ${seiz.rung} ${seiz.name} · `
    + `falsified: an unknown flag returns ${nonsense.rung} ${nonsense.name}, i.e. the mechanism is `
    + `reading the registry rather than counting array entries`);
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

// ═══════════════════════════════════════════════════════════════════════════
// LEG B — the browser: the gauge, the cutscene, the panels, the endings
// ═══════════════════════════════════════════════════════════════════════════

// ── B: the warmth gauge on the real dash ───────────────────────────────────
{
  const { S, close } = await session('/index.html?nosave=1&intro=0&crd=6000');
  await evalJSON(S, MODAL_SPY);

  const slots = await evalJSON(S, '__game.dashSlots()');
  const wrect = slots.warmth, crect = slots.cell;

  const readBay = async () => ({
    warm: await hook(S, 'dashRegion', ...wrect),
    cell: await hook(S, 'dashRegion', ...crect),
  });
  await hook(S, 'setStoryTime', 1800);
  await hook(S, 'setStoryRate', 40);        // miles ahead
  await settle(S, 60);
  const cool = await readBay();
  const coolState = await evalJSON(S, '__state.story');
  await hook(S, 'setStoryRate', 1.0);       // hopeless
  await settle(S, 60);
  const hot = await readBay();
  const hotState = await evalJSON(S, '__state.story');
  const dWarm = Math.hypot(hot.warm.r - cool.warm.r, hot.warm.g - cool.warm.g, hot.warm.b - cool.warm.b);
  const dCell = Math.hypot(hot.cell.r - cool.cell.r, hot.cell.g - cool.cell.g, hot.cell.b - cool.cell.b);
  // FALSIFY: the same bay sampled twice at the SAME warmth must not move. Without this a dash that
  // repaints anything at all would pass the difference above.
  await settle(S, 40);
  const hot2 = await readBay();
  const dNull = Math.hypot(hot2.warm.r - hot.warm.r, hot2.warm.g - hot.warm.g, hot2.warm.b - hot.warm.b);
  check('B1 the reserved bay draws a gauge that tracks pace',
    dWarm > 6 && dCell < 1.5 && dNull < 1.5,
    `warmth bay ${JSON.stringify(wrect)}: cool(warmth ${coolState.warmth}) rgb `
    + `${cool.warm.r}/${cool.warm.g}/${cool.warm.b} -> hot(warmth ${hotState.warmth}) `
    + `${hot.warm.r}/${hot.warm.g}/${hot.warm.b}, distance ${dWarm.toFixed(2)} (gate > 6) · `
    + `the CELL bay beside it moved ${dCell.toFixed(2)} (gate < 1.5), so this is the instrument and `
    + `not the panel · falsified: the same bay re-read 40 frames later at unchanged warmth moved `
    + `${dNull.toFixed(2)}`);

  // B2 — the display needle is a FILTERED copy of the raw signal, and the two are separate.
  //
  // The jump has to be made with `grantCredits`, NOT with `setStoryRate`: `setStoryRate` re-seeds
  // the display filter on purpose (a fixture has to land immediately for a screenshot), so the
  // first version of this check moved both numbers together and could not have failed. Banking
  // credits moves the projection through the real path and leaves the filter alone.
  await hook(S, 'setStoryRate', 1.0);
  await settle(S, 60);
  const start = await evalJSON(S, '__state.story');
  await hook(S, 'grantCredits', 44000);
  await settle(S, 3);
  const early = await evalJSON(S, '__state.story');
  // The filter's time constant is 8 s, so "converged" needs ~2.5 constants of REAL time. 150 frames
  // is 2.5 s and left the needle at 0.72, which the first run of this gate reported as a failure of
  // the code rather than of the wait. `settle()` counts frames and times out at 25 s, so this is
  // two rounds rather than one long one.
  await settle(S, 600);
  await settle(S, 600);
  const late = await evalJSON(S, '__state.story');
  check('B2 the needle lags the signal, and __state reports the raw one',
    start.warmth > 0.9 && early.warmth < 0.2 && early.shown > early.warmth + 0.3
    && late.shown < early.shown - 0.2 && Math.abs(late.shown - late.warmth) < 0.2,
    `held at raw ${start.warmth} / needle ${start.shown} · 3 frames after banking 44 000 CRD: raw `
    + `${early.warmth}, needle ${early.shown} — the signal has moved and the needle has not · 150 `
    + `frames later: raw ${late.warmth}, needle ${late.shown}, converged · falsified by the middle `
    + `reading, where the two differ by ${(early.shown - early.warmth).toFixed(2)}: a gate that read `
    + `the needle would have been measuring an 8 s low-pass filter`);

  // B3 — the chase HUD carries the same signal, and disappears when there is no debt.
  await hook(S, 'toggleView');
  await settle(S, 20);
  const chaseOn = await evalJSON(S, `(() => {
    const e = document.querySelector('.ch-warm');
    if (!e) return null;
    const f = e.querySelector('[data-f=warmfill]');
    return { off: e.classList.contains('off'), label: e.querySelector('[data-f=warmlabel]').textContent,
      w: f.style.width, cls: f.className, vis: e.getBoundingClientRect().width > 0 };
  })()`);
  // Move the arc to act two: the bar must go, because a gauge with nothing to measure teaches the
  // player to ignore the panel it is on.
  await hook(S, 'setDue', true);
  await hook(S, 'forceDock', 0);
  await settle(S, 10);
  await hook(S, 'closeEnding');
  await hook(S, 'closeHire');
  await hook(S, 'toggleView');
  await hook(S, 'toggleView');
  await settle(S, 20);
  const chaseOff = await evalJSON(S, `(() => {
    const e = document.querySelector('.ch-warm');
    return e ? { off: e.classList.contains('off'), stage: window.__state.story.stage } : null;
  })()`);
  const dashOff = await evalJSON(S, '__game.hudData().warmth');
  check('B3 the chase HUD carries the same signal and stands down in act two',
    chaseOn && !chaseOn.off && chaseOn.vis && chaseOff && chaseOff.off && dashOff === null,
    `debt live: off ${chaseOn && chaseOn.off}, label ${chaseOn && chaseOn.label}, fill `
    + `${chaseOn && chaseOn.w} ${chaseOn && chaseOn.cls} · after the arc closes (stage `
    + `${chaseOff && chaseOff.stage}): off ${chaseOff && chaseOff.off}, and hudData().warmth is `
    + `${dashOff} so the dash bay reverts to a blanking plate · falsified by the same selector `
    + `reading both ways in one session`);

  const modals = await evalJSON(S, 'window.__modals');
  check('B4 no alert / confirm / prompt anywhere on the debt + seizure path',
    Array.isArray(modals) && modals.length === 0,
    `spies installed on window.alert/confirm/prompt before any story code ran; after a full pass `
    + `through the pace gauge, the seizure, the ending panel and the hire panel they recorded `
    + `${JSON.stringify(modals)}`);
  await close();
}

// ── C: both endings ────────────────────────────────────────────────────────
for (const [branch, crd, want] of [['paid', 62000, 12000], ['seized', 4000, 90]]) {
  const { S, close } = await session(`/index.html?nosave=1&intro=0&story=${branch}&crd=${crd}`);
  await evalJSON(S, MODAL_SPY);
  const before = await evalJSON(S, '({credits:__state.credits, stage:__state.story.stage, due:__state.story.due})');

  // C1/C2 — DUE IN THE AIR MUST NOT SETTLE. The brief is explicit that the seizure happens at a
  // dock so the player is standing somewhere they can hire. This is the half of that which can
  // silently rot: a settlement wired into the per-frame tick would look identical in every other
  // check in this file.
  await settle(S, 120);
  const airborne = await evalJSON(S, '({stage:__state.story.stage, due:__state.story.due, credits:__state.credits})');
  await hook(S, 'forceDock', 0);
  await settle(S, 12);
  const after = await evalJSON(S, `({stage:__state.story.stage, branch:__state.story.branch,
    credits:__state.credits, flags:__state.flags, grounded:__state.story.grounded,
    wreck:__state.story.wreckLeft, hire:__state.story.hire, ending:__state.ending,
    borrowed:__state.borrowed, rung:__state.ranks.standing.rung, rank:__state.ranks.standing.name})`);
  const wantFlags = branch === 'paid' ? ['debt_cleared', 'dad_favour'] : ['car_seized', 'crew_hook'];
  const flagsOk = wantFlags.every(f => after.flags.includes(f))
    && !after.flags.includes(branch === 'paid' ? 'car_seized' : 'debt_cleared');
  check(`C1 ${branch}: settles only at a dock, and takes what it should`,
    airborne.stage === 'debt' && airborne.due === true && airborne.credits === before.credits
    && after.stage === 'act2' && after.branch === branch && after.credits === want
    && flagsOk && after.grounded === true && after.hire === null
    && after.wreck === (branch === 'seized' ? 1 : 0) && after.ending.open === true,
    `120 frames airborne with due=${airborne.due}: stage ${airborne.stage}, balance ${airborne.credits} `
    + `(was ${before.credits}) — settlement on the frame path: `
    + `${airborne.stage === 'debt' && airborne.credits === before.credits ? 'NO' : 'YES, WHICH IS THE DEFECT'}`
    + ` · after one dock: ${after.stage}/`
    + `${after.branch}, ${before.credits} -> ${after.credits} CRD (want ${want}), flags `
    + `${JSON.stringify(after.flags)}, grounded ${after.grounded}, wrecks ${after.wreck}, standing `
    + `${after.rung} ${after.rank}, panel open ${after.ending.open} · falsified by the airborne half, `
    + `which is the same state one dock earlier`);

  // C3 — NO FAIL STATE. Grounded blocks UNDOCK, but the button that would refuse opens the panel
  // that fixes it, and hiring gets the player flying again from whatever they were left with.
  await hook(S, 'closeEnding');
  await settle(S, 8);
  const groundedUndock = await evalJSON(S, '(window.__game.undock(), {dock:__state.dock, grounded:__state.story.grounded, hire:__state.hirePanel})');
  const cheapest = branch === 'seized' ? 'wisp' : 'wisp';
  const hired = await hook(S, 'hire', cheapest, 1);
  await settle(S, 8);
  const afterHire = await evalJSON(S, `({grounded:__state.story.grounded, hire:__state.story.hire,
    craft:__game.economy.craft, credits:__state.credits, borrowed:__state.borrowed})`);
  const undocked = await evalJSON(S, '(window.__game.undock(), {dock:__state.dock})');
  check(`C3 ${branch}: no fail state — grounded, then hired, then flying`,
    groundedUndock.dock !== null && groundedUndock.grounded === true
    && hired && hired.ok && afterHire.grounded === false && afterHire.hire
    && afterHire.borrowed === true && undocked.dock === null,
    `grounded UNDOCK left the player docked (${JSON.stringify(groundedUndock.dock)}) and opened the `
    + `hire panel instead of refusing · hire ${cheapest} for ${JSON.stringify(hired)} left `
    + `${afterHire.credits} CRD on a ${afterHire.craft} with `
    + `${afterHire.hire ? afterHire.hire.left.toFixed(0) : '-'} s on the meter · UNDOCK then worked `
    + `(dock ${undocked.dock}) · falsified by the first UNDOCK, which is the same call before the hire`);

  const modals = await evalJSON(S, 'window.__modals');
  check(`C4 ${branch}: no modal on the ending path`,
    Array.isArray(modals) && modals.length === 0, `recorded ${JSON.stringify(modals)}`);
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
  const { S, close } = await session('/index.html?nosave=1&intro=0&crd=2000');
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
