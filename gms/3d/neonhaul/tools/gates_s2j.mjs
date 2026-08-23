#!/usr/bin/env node
// S2-J's gates — founding a company, the legit/shady branch tabs, multiple charters, and the two
// doors into the off-book side.
//
//   node tools/gates_s2j.mjs [--land] [--headed] [--w= --h=]
//
// **Every check is falsified**, and each falsification is written to fail for the reason the check
// is about rather than for a reason that happens to be nearby. Three traps this file is written
// against, all of them paid for in this project already:
//
//   · a gate tested `height >= 36` on a RAW FLOAT while printing `Math.round(height)`, so a 35.99
//     px element FAILED WHILE PRINTING "36 px tall". Nothing here prints a rounded value for a term
//     it tests exactly.
//   · **a precondition that queries the DOM is not a precondition about what is on screen.** This
//     phase's own capture tool found the ASK HIM row in the DOM, passed, and photographed act one's
//     ending panel covering the whole board. B6 hit-tests the key's centre.
//   · `25/25` is the shape of a PARTIAL run. This suite declares 17 checks; a file with any other
//     total in it is a suite that died, not a suite that passed.
//
// SCHEMA NOTE: writes `{ok:[],fail:[]}` AND `{results:[]}`, like gates_s2d/s2f/s2h/s2i, because a
// parser reading only one key has reported 0/0 on a fully passing suite four times here.

import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { open, parseArgs, waitFor, settle, evalJSON, hook, quiesce } from './shot.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = parseArgs();
const LAND = !!args.land;
const W = +(args.w || (LAND ? 844 : 390)), H = +(args.h || (LAND ? 390 : 844));
const OUT = resolve(ROOT, 'shots/s2j');
const FILE = resolve(OUT, `_gates${LAND ? '_land' : ''}.json`);
const DECLARED = 17;

const ok = [], fail = [], detail = {};
function check(name, pass, det) {
  (pass ? ok : fail).push(name);
  detail[name] = det;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}\n      ${String(det).replace(/\n/g, '\n      ')}`);
  try {
    const results = [...ok.map(n => ({ name: n, pass: true, detail: detail[n] })),
      ...fail.map(n => ({ name: n, pass: false, detail: detail[n] }))];
    writeFileSync(FILE, JSON.stringify({ view: `${W}x${H}`, at: new Date().toISOString(),
      declared: DECLARED, total: ok.length + fail.length, passed: ok.length, failed: fail.length,
      ok, fail, detail, results }, null, 1));
  } catch { /* a full disk must not swallow the console above */ }
}

// ═══ A — the money and the story, in node ═════════════════════════════════
// `js/company.js`, `js/ranks.js` and `js/story.js` are pure, so these run against the shipped
// modules directly. A browser adds nothing to an assertion about arithmetic.
async function nodeChecks() {
  const C = await import(resolve(ROOT, 'js/company.js'));
  const E = await import(resolve(ROOT, 'js/economy.js'));
  const R = await import(resolve(ROOT, 'js/ranks.js'));
  const Story = await import(resolve(ROOT, 'js/story.js'));

  const mkGroup = (exposure = 0, shady = true) => {
    const g = C.newGroup({ seed: 0x4e454f4e });
    const econ = E.newState({ credits: 1000000 });
    C.openBranch(g, 0);
    const a = C.foundCompany(g, econ, 'ALPHA', 0);
    a.company.shady = shady;
    a.company.exposure = exposure;
    a.company.gross = 200000;
    return { g, econ, co: a.company };
  };

  // ── A1. AT EXPOSURE ZERO NOTHING S2-J ADDED DOES ANYTHING ─────────────────
  // The load-bearing compatibility claim of the whole phase: a charter that has never run a job off
  // the books behaves EXACTLY as an S2-I company, which is what keeps every S2-I measurement — the
  // wage table, the 180-second walk-out, the pairing sweep — valid rather than merely re-run.
  {
    const { econ, co } = mkGroup(0);
    const d = C.newDriver({ id: 'd1', name: 'D', grade: 2, craft: 'lance' });
    co.drivers.push(d);
    const bare = C.wageOf(d);            // the S2-I signature, one argument
    const withCo = C.wageOf(d, co);
    const before = econ.credits;
    const res = C.creditDelivery(co, econ, d, 900, 1, 0);
    const clean = { wageSame: bare.total === withCo.total, mul: C.payMultiplier(co, 0, false),
      legit: C.legitMult(co), wage: C.wageExposure(co), paid: res.credits, gross: co.gross };
    // The falsification is the same predicate on a HOT charter. If it still reports "identical",
    // the terms are not reading exposure at all and A1 would be true for a reason that is not the one
    // it claims — which is the failure mode this project has twenty-two of.
    const hot = mkGroup(0.8);
    const hd = C.newDriver({ id: 'd1', name: 'D', grade: 2, craft: 'lance' });
    hot.co.drivers.push(hd);
    const hotWage = C.wageOf(hd, hot.co);
    const hotRes = C.creditDelivery(hot.co, hot.econ, hd, 900, 1, 0);
    const hotSame = C.wageOf(hd).total === hotWage.total && hotRes.credits === 900;
    check('S2-J/A1 FALSIFIED — at exposure 0 every term this phase added is EXACTLY its S2-I self',
      clean.wageSame && clean.mul === 1 && clean.legit === 1 && clean.wage === 1
        && clean.paid === 900 && co.gross === 200900 && econ.credits - before === 900
        && !hotSame,
      `CLEAN charter: wageOf(d) ${bare.total} === wageOf(d, co) ${withCo.total} · legitMult `
      + `${clean.legit} · wageExposure ${clean.wage} · payMultiplier ${clean.mul} · a 900 CRD delivery `
      + `paid ${clean.paid} and moved co.gross to ${co.gross}\n`
      + `FALSIFIED on a charter at exposure 0.80: wageOf(d) ${C.wageOf(hd).total} vs wageOf(d, co) `
      + `${hotWage.total}, and the same 900 CRD delivery paid ${hotRes.credits}. The "identical" `
      + `predicate returns ${hotSame} there, so A1 is reading exposure and not merely reading a constant`);
  }

  // ── A2. the SWEEP, and the property the brief actually asked for ──────
  {
    const p = resolve(ROOT, 'docs/s2j_balance.json');
    const bal = existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null;
    const by = bal ? Object.fromEntries(bal.table.map(r => [r.policy, r])) : {};
    const best = bal ? bal.table.slice().sort((a, b) => b.netP50 - a.netP50)[0] : null;
    // The counterfactual the design is defined against: give the fines back. If a policy that pays
    // 1.7x and is never fined would STILL not be the best, the fines are not what is holding it
    // down and the check would be crediting the wrong term.
    const noFines = bal ? bal.table.map(r => ({ ...r,
      netP50: +(r.netP50 + r.fines / bal.minutes).toFixed(1) })) : [];
    const noFinesBest = noFines.length ? noFines.slice().sort((a, b) => b.netP50 - a.netP50)[0] : null;
    check('S2-J/A2 FALSIFIED — a dodgy trade is a TRADE-OFF: some off-book beats clean, and running everything off the books is ruinous',
      !!bal && bal.checks.every(c => c.pass) && best.policy !== 'all_off'
        && by.one_off.netP50 > by.clean.netP50 && by.all_off.netP50 < by.clean.netP50
        && by.all_off.suspensions >= 1 && by.clean.suspensions === 0,
      `docs/s2j_balance.json — ${bal ? bal.seeds : 0} worlds x ${bal ? bal.minutes : 0} min, `
      + `net CRD/min p50:\n`
      + (bal ? bal.table.map(r => `  ${r.policy.padEnd(9)} ${String(r.netP50).padStart(8)}  `
        + `charter ${String(r.charterP50).padStart(7)}  shady ${String(r.shadyP50).padStart(7)}  `
        + `susp ${r.suspensions}  fines ${r.fines}`).join('\n') : '')
      + `\n  best is ${best ? best.policy : '?'}; the sweep's own ${bal ? bal.checks.length : 0} `
      + `properties are ${bal && bal.checks.every(c => c.pass) ? 'all holding' : 'NOT all holding'}\n`
      + `FALSIFIED: hand the fines back to every arm and the best policy becomes `
      + `${noFinesBest ? noFinesBest.policy : '?'} at ${noFinesBest ? noFinesBest.netP50 : '?'} — so `
      + `the fines are load-bearing and A2 is not passing on an ordering that would hold anyway`);
  }

  // ── A3. off-book gross moves NEITHER ladder it is not on ──────────────
  {
    const a = mkGroup(0);
    const d = C.newDriver({ id: 'd1', name: 'D', grade: 2, craft: 'lance' });
    d.offBook = true; a.co.drivers.push(d);
    const g0 = a.co.gross, t0 = C.companyTier(a.co.gross).tier;
    for (let i = 0; i < 10; i++) C.creditDelivery(a.co, a.econ, d, 900, 1, 0);
    const after = { gross: a.co.gross, shady: a.co.shadyGross, tier: C.companyTier(a.co.gross).tier,
      lifetime: a.econ.lifetime };
    // The control arm: the SAME driver, the SAME ten deliveries, on the books.
    const b = mkGroup(0);
    const d2 = C.newDriver({ id: 'd1', name: 'D', grade: 2, craft: 'lance' });
    b.co.drivers.push(d2);
    for (let i = 0; i < 10; i++) C.creditDelivery(b.co, b.econ, d2, 900, 1, 0);
    check('S2-J/A3 FALSIFIED — off-book gross is a SECOND ledger: it does not move the charter ladder, against a control that does',
      after.gross === g0 && after.shady > 0 && after.tier === t0
        && b.co.gross === g0 + 9000 && b.co.shadyGross === 0,
      `ten 900 CRD deliveries OFF the books: co.gross ${g0} → ${after.gross} (unmoved), `
      + `shadyGross 0 → ${after.shady}, charter tier ${t0} → ${after.tier}\n`
      + `CONTROL — the same ten deliveries ON the books: co.gross ${g0} → ${b.co.gross}, `
      + `shadyGross ${b.co.shadyGross}\n`
      + 'The control is the falsification: it proves creditDelivery CAN move gross at all, so '
      + `the zero above is a measurement and not a dead counter`);
  }

  // ── A4. a bust, a fine, and a suspension, through the shipped path ────
  {
    const a = mkGroup(0.99);
    a.co.playerOffBook = true;
    const start = a.econ.credits;
    let busts = 0, fines = 0, sus = 0, clean = 0;
    for (let i = 0; i < 30; i++) {
      const r = C.playerRun(a.co, a.econ, 800, 0);
      if (!r) break;
      if (r.busted) { busts++; fines += r.fine; } else clean++;
      if (r.suspended) sus++;
      if (C.suspended(a.co, 0)) break;
    }
    const suspended = C.suspended(a.co, 0);
    const zeroed = C.payMultiplier(a.co, 0, false);
    // The falsification is the SAME loop on a cold charter: at exposure 0 the bust chance is BUST_BASE
    // and the run must be able to complete without the charter going down.
    // The control PINS the exposure at 0 between runs. Without that the control is not a control: each
    // run adds PER_RUN, so thirty of them walk the charter to exposure 0.42 and the "cold" arm ends up
    // at a bust chance of 0.15 — which is the accumulation working, not the dice being constant,
    // and it would have made the arm look like a failure of the isolation rather than of the check.
    const b = mkGroup(0);
    b.co.playerOffBook = true;
    let cb = 0, cn = 0;
    for (let i = 0; i < 60; i++) {
      b.co.exposure = 0;
      const r = C.playerRun(b.co, b.econ, 800, 0);
      if (!r) break;
      cn++;
      if (r.busted) cb++;
    }
    const coldRate = cn ? cb / cn : 1;
    check('S2-J/A4 FALSIFIED — a run can be seized, the fine is real, and a hot charter goes down',
      busts > 0 && fines > 0 && suspended && sus === 1 && zeroed === 0
        && cn === 60 && coldRate < C.bustChance(a.co) / 2 && !C.suspended(b.co, 0),
      `at exposure 0.99: ${busts} seized of ${busts + clean} runs, ${fines} CRD of fines, charter `
      + `SUSPENDED for ${Math.round(C.suspendedFor(a.co, 0))} s, and a legit delivery now pays `
      + `${zeroed}x. Account ${Math.round(start)} → ${Math.round(a.econ.credits)}\n`
      + `FALSIFIED with the exposure PINNED at 0 over 60 runs: ${cb} seized, a realised rate of `
      + `${coldRate.toFixed(3)} against a declared BUST_BASE of ${C.EXPOSURE.BUST_BASE} and the hot `
      + `charter's ${C.bustChance(a.co).toFixed(3)} — and the charter never went down `
      + `(${C.suspended(b.co, 0)}). The dice are read off the exposure, not off a constant`);
  }

  // ── A5. Aaron's ladder, verbatim, on the GROUP's off-book gross ───────
  {
    const names = R.SHADY_TIERS.map(t => t.name);
    const want = ['SMOKE', 'EARNER', 'FIXER', 'BROKER', 'QUIET PARTNER', 'THE HOUSE'];
    const a = mkGroup(0);
    const b = C.foundCompany(a.g, a.econ, 'BETA', 0);
    a.co.shadyGross = 30000;
    b.company.shadyGross = 20000;
    const st = R.shadyState(C.groupShady(a.g), true);
    // The licence and standing ladders must not have moved. The whole point of three ladders is
    // that they are three quantities.
    const lic = R.courierRank(99).name;
    const rising = R.SHADY_TIERS.every((t, i) => i === 0 || t.at > R.SHADY_TIERS[i - 1].at);
    check('S2-J/A5 FALSIFIED — SMOKE → THE HOUSE, in Aaron’s words and order, on GROUP off-book gross',
      names.join('|') === want.join('|') && rising && st.at === 50000
        && st.name === R.shadyRank(50000).name && lic === 'HAULMASTER'
        && R.shadyState(0).rung === 1 && R.shadyState(1e9).rung === 6,
      `${names.join(' → ')}\n`
      + `thresholds ${R.SHADY_TIERS.map(t => t.at).join(' / ')} — strictly rising: ${rising}\n`
      + `two charters holding 30 000 and 20 000 give a GROUP total of ${st.at} and the rung `
      + `${st.name} (${st.rung}/6), ${st.next ? st.next.need + ' to ' + st.next.name : 'top'}\n`
      + `the other two ladders are untouched: courierRank(99) is still ${lic}\n`
      + `FALSIFIED at the ends: shadyState(0) is rung ${R.shadyState(0).rung} and shadyState(1e9) `
      + `is rung ${R.shadyState(1e9).rung}, so the lookup is not returning a constant`);
  }

  // ── A6. founding is a transaction, and the group round-trips ──────────
  {
    const g = C.newGroup({ seed: 0x4e454f4e });
    const econ = E.newState({ credits: 100 });
    const poor = C.foundCompany(g, econ, 'ALPHA', 0);
    econ.credits = 200000;
    const fee1 = C.foundFee(g);
    const one = C.foundCompany(g, econ, 'ALPHA HAULAGE', 10);
    const afterOne = econ.credits;
    const dup = C.foundCompany(g, econ, 'ALPHA HAULAGE', 20);
    const fee2 = C.foundFee(g);
    C.foundCompany(g, econ, 'BETA', 30);
    C.foundCompany(g, econ, 'GAMMA', 40);
    const over = C.foundCompany(g, econ, 'DELTA', 50);
    const cap = C.driverCap(g.companies[0]);
    // Round-trip, including the v1 shape every build before this phase wrote.
    g.companies[1].exposure = 0.42;
    g.companies[1].shadyGross = 7777;
    const round = C.groupFromSave(C.groupToSave(g, 0), 0);
    const v1 = C.groupFromSave(C.toSave(C.newCompany({ gross: 4321, name: '' }), 0), 0);
    check('S2-J/A6 FALSIFIED — founding is a priced transaction, GROUP_MAX is enforced, and the registry round-trips (v1 included)',
      !poor.ok && poor.why === 'credits' && one.ok && afterOne === 200000 - fee1
        && !dup.ok && dup.why === 'name' && fee2 > fee1
        && g.companies.length === C.GROUP_MAX && !over.ok && over.why === 'max' && cap === 1
        && round.companies.length === C.GROUP_MAX
        && round.companies[1].exposure === 0.42 && round.companies[1].shadyGross === 7777
        && round.shady === g.shady && v1.companies.length === 1 && v1.companies[0].gross === 4321,
      `100 CRD in hand: refused, why "${poor.why}" (short ${poor.short})\n`
      + `registered for ${fee1} CRD; the account went 200000 → ${afterOne}\n`
      + `the same name again: refused, why "${dup.why}" · the NEXT charter costs ${fee2}, not ${fee1}\n`
      + `at ${C.GROUP_MAX} charters a fourth is refused, why "${over.why}"\n`
      + `a fresh charter's driver cap is ${cap} — a shell cannot grow, because ${C.COMPANY_TIERS[1].name} `
      + `needs CHARTER gross and a run makes none\n`
      + `round-trip: ${round.companies.length} charters, exposure ${round.companies[1].exposure}, `
      + `off-book gross ${round.companies[1].shadyGross}\n`
      + `FALSIFIED against a V1 profile (a single flat company, which is what every build before `
      + `this phase wrote): it comes back as ${v1.companies.length} charter holding `
      + `${v1.companies[0].gross} CRD rather than being dropped`);
  }

  // ── A7. THE ONE DOOR ──────────────────────────────────────────────────
  //
  // **This check asserted TWO doors and there is one.** §S2-P collapsed the paid/seized fork into a
  // single storyline, so `shadyDoor`'s immediate `'seized'` state is gone and the delayed, earned-by-
  // curiosity thread is the only way in — opened after the Boss meeting rather than after the
  // seizure. The assertion is rewritten to the new behaviour rather than deleted: what it still
  // guards, and what it always guarded, is that **listening is not enough — the player opens it.**
  {
    const beforeMeeting = Story.newStory({ stage: Story.STAGE.ACT2, branch: 'taken', met: false });
    const afterMeeting = Story.newStory({ stage: Story.STAGE.ACT2, branch: 'taken', met: true });
    const doors = { unmet: Story.shadyDoor(beforeMeeting), met: Story.shadyDoor(afterMeeting) };
    // The meeting is the gate on the REMARKS as well as on the door: a player who has not sat
    // opposite him hears nothing, however long they fly.
    let unmetHeard = 0, ut = 0;
    for (let i = 0; i < Story.REMARKS.length; i++) {
      ut += Story.REMARK_GAP_S + 1;
      if (Story.nextRemark(beforeMeeting, ut, 0)) unmetHeard++;
    }
    // The CONTROL: a player who hears every remark and never presses the key. This is the arm that
    // makes "the player opens it themselves" a measurement rather than a sentence.
    const listener = Story.newStory({ stage: Story.STAGE.ACT2, branch: 'taken', met: true });
    let t = 0;
    for (let i = 0; i < Story.REMARKS.length; i++) {
      t += Story.REMARK_GAP_S + 1;
      const r = Story.nextRemark(listener, t, 0);
      if (r) Story.hearRemark(listener, r, t);
    }
    const heardAll = { remarks: listener.thread.remarks, door: Story.shadyDoor(listener),
      open: Story.shadyOpen(listener) };
    // …and the same story with the key pressed.
    const asker = Story.fromSave(Story.toSave(listener, t), 0);
    const early = Story.newStory({ stage: Story.STAGE.ACT2, branch: 'taken', met: true });
    const earlyAsk = Story.askDad(early, 0);
    const ask = Story.askDad(asker, t);
    // Spacing: two remarks cannot land inside REMARK_GAP_S of each other.
    const spaced = Story.newStory({ stage: Story.STAGE.ACT2, branch: 'taken', met: true });
    const s1 = Story.nextRemark(spaced, 100, 0);
    Story.hearRemark(spaced, s1, 100);
    const s2 = Story.nextRemark(spaced, 100 + Story.REMARK_GAP_S - 1, 0);
    check('S2-J/A7 FALSIFIED — one door into one room: it opens after the Boss meeting and the PLAYER opens it',
      doors.unmet === null && doors.met === null && unmetHeard === 0
        && !Story.shadyOpen(beforeMeeting) && !Story.shadyOpen(afterMeeting)
        && heardAll.remarks === Story.REMARKS.length && heardAll.door === 'cue' && !heardAll.open
        && !earlyAsk.ok && earlyAsk.why === 'early'
        && ask.ok && Story.shadyDoor(asker) === 'asked' && Story.shadyOpen(asker)
        && s2 === null,
      `ACT TWO before the Boss meeting: door ${JSON.stringify(doors.unmet)}, and ${unmetHeard} of `
      + `${Story.REMARKS.length} remarks reachable — the sub-story does not exist until you have sat `
      + `opposite the man who took the car\n`
      + `ACT TWO after it, nothing heard yet: door ${JSON.stringify(doors.met)} — still sealed. The `
      + `meeting un-gates the remarks; it does not open the desk\n`
      + `CONTROL — a player who hears all ${heardAll.remarks} remarks and never asks: door `
      + `"${heardAll.door}", shadyOpen ${heardAll.open}. **Listening is not enough**\n`
      + `askDad() before the cue: refused, why "${earlyAsk.why}" (needs ${Story.THREAD_NEED})\n`
      + `askDad() after it: ok, door "${Story.shadyDoor(asker)}" — and the state survived a save `
      + `round-trip, which is where a thread mid-pull would otherwise be lost\n`
      + `FALSIFIED on the spacing: a second remark ${Story.REMARK_GAP_S - 1} s after the first `
      + `returns ${JSON.stringify(s2)}, so they cannot arrive in a clump and read as a cutscene`);
  }

  // ── A8. the standing cost ─────────────────────────────────────────────
  {
    const st = E.newState({ credits: 20000 });
    const before = R.standingRank(R.netWorth(st), st.flags || []);
    const after = R.standingRank(R.netWorth(st), ['marked']);
    const both = R.standingRank(R.netWorth(st), ['marked', 'dad_favour']);
    check('S2-J/A8 FALSIFIED — being read by the patrol costs a STANDING rung, and it is the registry that does it',
      R.STANDING_FLAGS.marked === -1 && after.rung === before.rung - 1
        && both.rung === before.rung && R.flagSteps(['marked']) === -1
        && R.flagSteps(['not_a_flag']) === 0,
      `STANDING_FLAGS.marked = ${R.STANDING_FLAGS.marked}\n`
      + `at ${R.netWorth(st)} CRD net worth: no flags → ${before.name} (${before.rung}); `
      + `["marked"] → ${after.name} (${after.rung})\n`
      + `["marked","dad_favour"] → ${both.name} (${both.rung}) — the axis is additive, not a switch\n`
      + `FALSIFIED: an unknown flag moves ${R.flagSteps(['not_a_flag'])} rungs, so A8 is reading the `
      + `registry entry and not merely reacting to the presence of a string`);
  }
}

// ═══ B — the screens ═══════════════════════════════════════════════════════
async function browserChecks() {
  const { S, base, close } = await open({ w: W, h: H, dpr: 1, mobile: true, headed: !!args.headed });
  const go = async q => {
    await S('Page.navigate', { url: `${base}/index.html?nosave=1&dpr=1&${q}` });
    await waitFor(S, 'window.__ready', 60000);
    await settle(S, 30);
    await quiesce(S, { timeout: 60000 });
    await evalJSON(S, '(window.__game.clearToasts(), 1)');
  };

  try {
    // ── B1. the branch tabs exist ONLY once the door is open ───────────
    // §S2-P — the door is the THREAD's now and the player pulls it, so the open arm reaches it the
    // way a player does: `?shady=1` runs `Story.askDad` and `Company.openBranch`, and `?story=act2`
    // is what puts the arc past the Boss meeting that un-gates them. It used to read `story=act2`
    // alone, because the seized branch handed the desk over on arrival.
    await go('story=act2&shady=1&fleet=2&cogross=74000');
    await hook(S, 'closeHirePanel');
    await hook(S, 'fleetPanel', 'roster');
    await settle(S, 12);
    const openArm = await evalJSON(S, `({ br: [...document.querySelectorAll('.fl-br')].map(b => b.textContent.replace(/\\s+/g,' ').trim()),
      door: __state.thread && __state.thread.door, groupOpen: __state.group && __state.group.open })`);
    // The NEGATIVE control is the arc BEFORE act two — the door has not opened by either route, and
    // a greyed OFF BOOK tab would be the game pointing at a story the player has not reached.
    await go('debt=10&fleet=2&cogross=74000');
    await hook(S, 'fleetPanel', 'roster');
    await settle(S, 12);
    const shutArm = await evalJSON(S, `({ br: document.querySelectorAll('.fl-br').length,
      door: __state.thread && __state.thread.door, tabs: [...document.querySelectorAll('.fl-tab')].map(b => b.textContent.replace(/\\s+/g,' ').trim()) })`);
    check('S2-J/B1 FALSIFIED — the OFF BOOK tab exists only once a door is open, and is not merely greyed before',
      openArm.br.length === 2 && /HAULAGE/.test(openArm.br[0]) && /OFF BOOK/.test(openArm.br[1])
        && openArm.door === 'asked' && shutArm.br === 0 && shutArm.door === null
        && shutArm.tabs.length === 3,
      `ACT TWO, the thread pulled — branch tabs: ${JSON.stringify(openArm.br)}, door "${openArm.door}"\n`
      + `CONTROL, mid-debt (the door has opened by neither route) — ${shutArm.br} branch tabs, `
      + `door ${JSON.stringify(shutArm.door)}, and the panel still shows its three legit sections `
      + `${JSON.stringify(shutArm.tabs)}\n`
      + `FALSIFIED by the control: zero elements, not a disabled one. A player who has not reached `
      + `the story is not told it is coming`);

    // ── B2. no charter, no roster — FOUND is the panel ─────────────────
    await go('story=act2');
    await hook(S, 'setCredits', 40000);
    await hook(S, 'closeHirePanel');
    await hook(S, 'fleetPanel', 'roster');    // ASK for the roster; the panel must refuse to show one
    await settle(S, 12);
    const empty = await evalJSON(S, `({ count: __state.group.count,
      name: !!document.querySelector('.fl-name'),
      register: (document.querySelector('.flc-key.take')||{}).textContent || null,
      rosterRows: document.querySelectorAll('.fl-drv').length,
      recruitRows: document.querySelectorAll('.fl-cand').length })`);
    const noHire = await hook(S, 'hireGrade', 2, 'wisp', 'nocharter');
    const founded = await hook(S, 'found', 'GATE HAULAGE');
    // The panel is still on ROSTER: `__game.found` is the transaction, not the key, and the key is
    // what moves the tab. Asking for RECRUIT here is the point — the same tab, the same query, and
    // the difference is only that a charter now exists.
    await hook(S, 'fleetPanel', 'recruit');
    await settle(S, 12);
    const after = await evalJSON(S, `({ count: __state.group.count, names: __state.group.names,
      cap: __state.company.cap, tier: __state.company.tier.name,
      recruitRows: document.querySelectorAll('.fl-cand').length })`);
    check('S2-J/B2 FALSIFIED — a driver cannot be on your books until there are books; FOUND is the whole panel until then',
      empty.count === 0 && empty.name && /REGISTER/.test(empty.register || '')
        && empty.rosterRows === 0 && empty.recruitRows === 0 && noHire === null
        && founded.ok && after.count === 1 && after.cap === 1 && after.recruitRows === 4,
      `an EMPTY registry, with the ROSTER tab explicitly asked for: ${empty.rosterRows} driver rows, `
      + `${empty.recruitRows} candidate rows, and a name field with "${empty.register}" under it\n`
      + `__game.hireGrade() against no charter returns ${JSON.stringify(noHire)}\n`
      + `after registering "GATE HAULAGE": ${after.count} charter (${after.tier}, cap ${after.cap}) `
      + `and ${after.recruitRows} candidates appear\n`
      + `FALSIFIED by the second half: the same panel, the same call, and the rows are THERE once a `
      + `charter exists — so the zeros above are a refusal and not an empty renderer`);

    // ── B3. one layout, n charters ─────────────────────────────────────
    await go('story=act2&shady=1&cos=1&fleet=2&cogross=74000&crd=90000');
    await hook(S, 'setExposure', 0.62, 1);
    await hook(S, 'closeHirePanel');
    await hook(S, 'fleetPanel', 'roster');
    await settle(S, 12);
    const chips = await evalJSON(S, `({
      chips: [...document.querySelectorAll('.flg-chip')].map(c => c.textContent.replace(/\\s+/g,' ').trim()),
      on: [...document.querySelectorAll('.flg-chip')].findIndex(c => c.classList.contains('on')),
      rail: (document.querySelector('.flt-n')||{}).textContent || null,
      gross: (document.querySelector('.fl-nums .dk-ro b')||{}).textContent || null })`);
    // Press the second chip — the SHIPPED control, not a hook — and read what the rail below says.
    await evalJSON(S, `(document.querySelectorAll('.flg-chip')[1].click(), 1)`);
    await settle(S, 12);
    const after3 = await evalJSON(S, `({ active: __state.group.active,
      on: [...document.querySelectorAll('.flg-chip')].findIndex(c => c.classList.contains('on')),
      rail: (document.querySelector('.flt-n')||{}).textContent || null,
      gross: (document.querySelector('.fl-nums .dk-ro b')||{}).textContent || null,
      file: (document.querySelector('.fl-nums .dk-ro:last-child b')||{}).textContent || null })`);
    check('S2-J/B3 FALSIFIED — ONE layout lists n charters, and pressing a chip changes what every readout below it says',
      chips.chips.length === 3 && /NEW CHARTER/.test(chips.chips[2]) && chips.on === 0
        && after3.active === 1 && after3.on === 1
        && after3.rail !== chips.rail && after3.gross !== chips.gross,
      `chips: ${JSON.stringify(chips.chips)}\n`
      + `charter 1 selected → rail "${chips.rail}", fleet gross ${chips.gross}\n`
      + `the second chip PRESSED (the shipped control) → active ${after3.active}, rail `
      + `"${after3.rail}", fleet gross ${after3.gross}, file "${after3.file}"\n`
      + `FALSIFIED by the pair: both the tier name AND the gross change. A chip strip that lit up `
      + `without repointing the panel would pass a "the chip is on" check and fail this one`);

    // ── B4. the off-book switch is a real state change ─────────────────
    await go('story=act2&shady=1&fleet=3&cogross=74000&crd=60000');
    const ids = await evalJSON(S, '__state.company.drivers.map(d => d.id)');
    await hook(S, 'closeHirePanel');
    await hook(S, 'fleetPanel', 'runs');
    await settle(S, 12);
    const beforeSwitch = await evalJSON(S, `({ on: document.querySelectorAll('.fl-run.on').length,
      recs: __state.company.drivers.map(d => d.offBook) })`);
    // Press the KEY, not the hook: the second `.fl-run` is the first driver (the first is the
    // player's own row), and its key is the shipped path a thumb takes.
    await evalJSON(S, `(document.querySelectorAll('.fl-run')[1].querySelector('.fld-key').click(), 1)`);
    await settle(S, 12);
    const afterSwitch = await evalJSON(S, `({ on: document.querySelectorAll('.fl-run.on').length,
      recs: __state.company.drivers.map(d => d.offBook),
      live: (__state.company.statuses[${JSON.stringify(ids[0])}]||{}).offBook })`);
    await hook(S, 'fleetPanel', 'roster');
    await settle(S, 10);
    const badge = await evalJSON(S, 'document.querySelectorAll(".fld-off").length');
    check('S2-J/B4 FALSIFIED — the RUNS key moves the driver record AND the live craft, and the roster says so',
      beforeSwitch.on === 0 && beforeSwitch.recs.every(v => v === false)
        && afterSwitch.on === 1 && afterSwitch.recs[0] === true
        && afterSwitch.recs.slice(1).every(v => v === false)
        && afterSwitch.live === true && badge === 1,
      `before: ${beforeSwitch.on} rows lit, records ${JSON.stringify(beforeSwitch.recs)}\n`
      + `after pressing ONE driver's key: ${afterSwitch.on} rows lit, records `
      + `${JSON.stringify(afterSwitch.recs)}, and the LIVE craft's own status reports offBook `
      + `${afterSwitch.live}\n`
      + `the ROSTER tab then carries ${badge} OFF BOOK badge\n`
      + `FALSIFIED by the other two records staying false: a switch that set a company-wide mode `
      + `would light all three and pass a "something changed" check`);

    // ── B5. the books still sum to the NET they print ──────────────────
    // S2-I's E1, re-run with the three terms this phase added. Parsed OUT OF THE DOM: a screen
    // whose total does not equal its own workings is the one failure a screenshot cannot show.
    let ran = 0;
    for (let i = 0; i < 12; i++) { const r = await hook(S, 'runOnce', 700 + i * 30, ids[0]); if (r && r.offBook) ran++; }
    await hook(S, 'fleetPanel', 'earnings');
    await settle(S, 12);
    const books = await evalJSON(S, `(() => {
      const rows = [...document.querySelectorAll('.flb-row')].map(r => ({
        k: r.querySelector('.flb-k').textContent, v: r.querySelector('.flb-v').textContent,
        net: r.classList.contains('net') }));
      const num = s => { const neg = s.indexOf('\\u2212') >= 0 || s.indexOf('-') >= 0;
        const n = +s.replace(/[^0-9.]/g, ''); return neg ? -n : n; };
      const lines = rows.filter(r => !r.net).map(r => ({ k: r.k, n: num(r.v) }));
      const netRow = rows.find(r => r.net);
      return { lines, netShown: netRow ? num(netRow.v) : null, ledgerNet: window.__game.ledger().net };
    })()`);
    const summed = books.lines.reduce((s, l) => s + l.n, 0);
    const tol = books.lines.length + 1;
    const keys = books.lines.map(l => l.k);
    check('S2-J/B5 FALSIFIED — RUN GROSS, FINES and REGISTRATION are ordinary rows in the same sum, and the sum is still the NET the screen prints',
      ran >= 8 && keys.includes('RUN GROSS') && keys.includes('REGISTRATION')
        && Math.abs(summed - books.netShown) <= tol
        && Math.abs(books.netShown - books.ledgerNet) <= tol,
      books.lines.map(l => `  ${l.k.padEnd(16)} ${String(l.n).padStart(9)}`).join('\n')
      + `\n  ${'='.repeat(28)}\n  ${'SUM'.padEnd(16)} ${String(summed).padStart(9)}   vs the NET the screen prints: ${books.netShown}`
      + `\n  company.ledger().net says ${books.ledgerNet}; tolerance ${tol} CRD = one per rounded line + 1`
      + `\n  ${ran} real runs were driven through the shipped path first, so the new rows are not zero`
      + `\nFALSIFIED: the terms are parsed OUT OF THE DOM, not read from the model, so a screen that `
      + `printed a total its own rows do not add up to fails here while the model stays correct`);

    // ── B6. the ASK HIM row — the ONE door, on screen ──────────────────
    //
    // §S2-P — it was the paid branch's door and it is the only one now, opened after the Boss
    // meeting. So this arm reaches it the way a player does: the seizure at a dock, then the
    // meeting at a dock with the ten thousand, then the remarks. The row itself, the hit test and
    // "the player's own press is what opens it" are unchanged, because none of that was branch
    // logic — it was always the delayed door, and the delay is now the meeting rather than luck.
    await go('story=taken&crd=60000');
    await hook(S, 'forceDock');
    await settle(S, 20);
    const sealed = await evalJSON(S, `({ stage: __state.story.stage, branch: __state.story.branch,
      door: __state.thread.door })`);
    await evalJSON(S, `(() => { const b = document.querySelector('#ending .hp-close'); b && b.click(); return !!b; })()`);
    await settle(S, 8);
    await hook(S, 'closeHirePanel');
    // The meeting, through the shipped transaction. The remarks do not exist before it.
    await hook(S, 'meetBoss');
    await settle(S, 12);
    await hook(S, 'closeBoss');
    await hook(S, 'closeHirePanel');
    await settle(S, 8);
    await evalJSON(S, `(() => { const t = [...document.querySelectorAll('.dk-tab')]; t[t.length-1].click(); return 1; })()`);
    await settle(S, 10);
    const noRow = await evalJSON(S, 'document.querySelectorAll(".dk-key.ask").length');
    await hook(S, 'remark');
    await hook(S, 'remark');
    await settle(S, 40);
    const row = await evalJSON(S, `(() => {
      const k = document.querySelector('.dk-key.ask');
      if (!k) return { key: false };
      k.scrollIntoView({ block: 'center' });
      const r = k.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { key: true, self: !!(hit && k.contains(hit)),
        covered: hit ? String(hit.className || hit.tagName) : null,
        h: +r.height.toFixed(2), w: +r.width.toFixed(2),
        title: (document.querySelector('.dk-sect.cue .dk-stitle')||{}).textContent || null };
    })()`);
    await evalJSON(S, '(document.querySelector(".dk-key.ask").click(), 1)');
    await settle(S, 12);
    const panel = await hook(S, 'threadPanel');
    await evalJSON(S, '(document.querySelector(".th-key.demand").click(), 1)');
    await settle(S, 12);
    const opened = await evalJSON(S, `({ door: __state.thread.door, groupOpen: __state.group.open,
      flags: __state.flags || [] })`);
    check('S2-J/B6 FALSIFIED — the row appears only after two remarks, hit-tests to itself, and the player’s own press is what opens the branch',
      sealed.stage === 'act2' && sealed.branch === 'taken' && sealed.door === null
        && noRow === 0 && row.key && row.self && row.h >= 36
        && /A NAME KEEPS COMING UP/.test(row.title || '')
        && panel.open && !panel.asked && opened.door === 'asked' && opened.groupOpen,
      `act two, the Boss paid, before any remark: ${noRow} ASK HIM rows on the RECORD tab, `
      + `door ${JSON.stringify(sealed.door)}\n`
      + `after two remarks on the ordinary chatter channel: "${row.title}", key `
      + `${row.w.toFixed(2)} x ${row.h.toFixed(2)} px, hit-tests to itself: ${row.self} `
      + `(the element at its centre is ${JSON.stringify(row.covered)})\n`
      + `pressing it opens the panel (open ${panel.open}, asked ${panel.asked}); pressing DEMAND A `
      + `NAME sets the door to "${opened.door}" and the branch to open ${opened.groupOpen}\n`
      + `flags now ${JSON.stringify(opened.flags)}\n`
      + `FALSIFIED by the FIRST arm: the same tab, the same query, ZERO rows before the remarks. And `
      + `the geometry is tested on the RAW float and printed to 2 dp — S2-G's find was a gate that `
      + `tested height >= 36 while printing Math.round(height), so a 35.99 px element failed while `
      + `printing "36 px tall"`);

    // ── B7. no modals, anywhere in any of it ───────────────────────────
    await go('story=act2&shady=1&cos=1&fleet=2&cogross=74000&crd=90000');
    await hook(S, 'closeHirePanel');
    const modal = await evalJSON(S, `(() => {
      let hits = 0;
      const A = window.alert, C = window.confirm, P = window.prompt;
      window.alert = window.confirm = window.prompt = () => { hits++; throw new Error('modal'); };
      const g = window.__game;
      const press = sel => [...document.querySelectorAll(sel)].forEach(b => { try { b.click(); } catch (e) { hits++; } });
      try {
        const keep = __state.credits;
        g.setCredits(0);                       // the state that produces every refusal there is
        for (const tab of ['runs', 'exposure', 'ladder', 'roster', 'recruit', 'earnings', 'found']) {
          g.fleetPanel(tab);
          press('.fl-tab, .fl-br, .flg-chip, .fld-key, .flc-key, .fl-refresh, .flh, .fl-suggest');
        }
        g.setCredits(keep);
      } finally { window.alert = A; window.confirm = C; window.prompt = P; }
      return { hits, note: (document.querySelector('.fl-note') || {}).textContent || null };
    })()`);
    check('S2-J/B7 FALSIFIED — no alert / confirm / prompt anywhere in the company layer, including every new surface',
      modal.hits === 0,
      `alert/confirm/prompt replaced with a THROWING stub, then every key on all seven screens `
      + `pressed with a ZERO balance: ${modal.hits} calls\n`
      + `the panel's own refusal line instead: ${JSON.stringify(modal.note)}\n`
      + `FALSIFIED: the stub INCREMENTS AND THROWS, so one call would both raise the counter and `
      + `break the click loop — it cannot pass by being silently swallowed`);

    // ── B8. mobile geometry, in the orientation this run is in ─────────
    await hook(S, 'setCredits', 90000);
    await hook(S, 'fleetPanel', 'runs');
    await settle(S, 12);
    const geo = await evalJSON(S, `(() => {
      const vw = innerWidth, vh = innerHeight;
      const rects = sel => [...document.querySelectorAll(sel)].map(e => {
        const r = e.getBoundingClientRect();
        return { sel, w: +r.width.toFixed(2), h: +r.height.toFixed(2),
          right: +r.right.toFixed(2), bottom: +r.bottom.toFixed(2) };
      });
      const keys = [...rects('.fld-key'), ...rects('.fl-br'), ...rects('.fl-tab')];
      const chips = rects('.flg-chip');
      const panel = document.querySelector('#fleet .hud-panel');
      const pr = panel ? panel.getBoundingClientRect() : null;
      const strip = document.querySelector('.flg-list');
      const sr = strip ? strip.getBoundingClientRect() : null;
      return { vw, vh, keys, chips,
        minKeyH: keys.length ? Math.min(...keys.map(k => k.h)) : null,
        // KEYS only. The chip strip is its own overflow-x scroller and a chip past the edge is
        // the strip working, not a layout fault — so what is asserted about the strip is that
        // the STRIP fits, and what is asserted about the chips is nothing. (No backticks in
        // here: this comment lives INSIDE a template literal and a backtick ends it.)
        overflowX: keys.filter(k => k.right > vw + 0.5).length,
        chipsOut: chips.filter(k => k.right > vw + 0.5).length,
        strip: sr ? { w: +sr.width.toFixed(2), right: +sr.right.toFixed(2),
          scroll: strip.scrollWidth - Math.round(sr.width) } : null,
        panel: pr ? { w: +pr.width.toFixed(2), h: +pr.height.toFixed(2),
          bottom: +pr.bottom.toFixed(2), over: +(pr.bottom - vh).toFixed(2) } : null,
        scrollX: document.documentElement.scrollWidth - vw };
    })()`);
    check('S2-J/B8 FALSIFIED — every new key clears the touch floor, nothing runs off the side, and the panel fits the frame',
      geo.minKeyH !== null && geo.minKeyH >= 28
        && geo.overflowX === 0 && geo.panel && geo.panel.over <= 0.5 && geo.scrollX <= 0
        && geo.strip && geo.strip.right <= geo.vw + 0.5,
      `viewport ${geo.vw} x ${geo.vh} — ${geo.keys.length} keys, smallest ${geo.minKeyH.toFixed(2)} px tall\n`
      + `${geo.keys.length} keys past the right edge: ${geo.overflowX}; page scrollWidth overhang `
      + `${geo.scrollX}\n`
      + `the chip strip is ${geo.strip.w.toFixed(2)} px wide ending at ${geo.strip.right.toFixed(2)} `
      + `and scrolls ${geo.strip.scroll} px; ${geo.chipsOut} of ${geo.chips.length} chips sit past `
      + `the edge INSIDE it, which is the scroller working\n`
      + `panel ${geo.panel.w.toFixed(2)} x ${geo.panel.h.toFixed(2)}, bottom `
      + `${geo.panel.bottom.toFixed(2)} against a ${geo.vh} px frame — ${geo.panel.over.toFixed(2)} over\n`
      + `Every figure here is tested on the RAW float and printed to 2 dp. The chip strip is its own `
      + `horizontal scroller, which is why "past the right edge" is measured on the KEYS and the `
      + `CHIPS and the page overhang separately — a strip that scrolls is not an overflow and a `
      + `single combined test could not tell them apart`);

    // ── B9. the surface is not computing its own numbers ───────────────
    await hook(S, 'setExposure', 0.5);
    await hook(S, 'fleetPanel', 'runs');
    await settle(S, 12);
    const shown = await evalJSON(S, `(() => {
      const txt = s => (document.querySelector(s) || {}).textContent || null;
      const ros = [...document.querySelectorAll('.fh-costs .dk-ro')].map(r =>
        ({ k: r.querySelector('i').textContent, v: r.querySelector('b').textContent }));
      const L = window.__game.ledger();
      return { file: txt('.fh-n'), band: txt('.fh-b'), ros, model: L.shady };
    })()`);
    const pct = s => (s ? +String(s).replace(/[^0-9]/g, '') : null);
    const find = k => (shown.ros.find(r => r.k === k) || {}).v || null;
    const num = s => (s ? +String(s).replace(/[^0-9.]/g, '') : null);
    const agree = pct(shown.file) === Math.round(shown.model.exposure * 100)
      && shown.band === shown.model.band.name
      && num(find('LEGIT PAYS')) === +shown.model.legitMul.toFixed(2)
      && num(find('PAYROLL')) === +shown.model.wageMul.toFixed(2)
      && num(find('SEIZED')) === Math.round(shown.model.bust * 100);
    // The falsification MOVES the model and re-reads the screen: if the screen were computing its
    // own numbers it would agree with the model at one value and disagree after.
    await hook(S, 'setExposure', 0.8);
    await hook(S, 'fleetPanel', 'runs');
    await settle(S, 10);
    const moved = await evalJSON(S, `(() => {
      const txt = s => (document.querySelector(s) || {}).textContent || null;
      const ros = [...document.querySelectorAll('.fh-costs .dk-ro')].map(r =>
        ({ k: r.querySelector('i').textContent, v: r.querySelector('b').textContent }));
      const L = window.__game.ledger();
      return { file: txt('.fh-n'), band: txt('.fh-b'), ros, model: L.shady };
    })()`);
    const find2 = k => (moved.ros.find(r => r.k === k) || {}).v || null;
    const agree2 = pct(moved.file) === Math.round(moved.model.exposure * 100)
      && moved.band === moved.model.band.name
      && num(find2('LEGIT PAYS')) === +moved.model.legitMul.toFixed(2);
    check('S2-J/B9 FALSIFIED — the gauge reads company.js, and follows it when it moves',
      agree && agree2 && shown.file !== moved.file && shown.band !== moved.band
        && find('LEGIT PAYS') !== find2('LEGIT PAYS'),
      `exposure 0.50 — screen "${shown.file}" / "${shown.band}", LEGIT PAYS ${find('LEGIT PAYS')}, `
      + `PAYROLL ${find('PAYROLL')}, SEIZED ${find('SEIZED')}\n`
      + `model    — ${Math.round(shown.model.exposure * 100)}% / ${shown.model.band.name}, `
      + `legitMul ${shown.model.legitMul}, wageMul ${shown.model.wageMul}, bust ${shown.model.bust}\n`
      + `exposure 0.80 — screen "${moved.file}" / "${moved.band}", LEGIT PAYS ${find2('LEGIT PAYS')}; `
      + `model ${Math.round(moved.model.exposure * 100)}% / ${moved.model.band.name}, legitMul `
      + `${moved.model.legitMul}\n`
      + `FALSIFIED by the SECOND reading: every one of those three strings changed. A screen holding `
      + `its own constants would agree at one exposure and be caught at the other`);
  } finally {
    // ONE session for the whole suite, closed here. `shot.mjs`'s cleanup pkills on the NODE pid's
    // profile dir, which every browser this process opens shares — a second live session kills the
    // first and the next evalJSON hangs forever with no timeout.
    await close();
  }
}

mkdirSync(OUT, { recursive: true });
await nodeChecks();
await browserChecks();

const total = ok.length + fail.length;
console.log(`\n${ok.length}/${total} (declared ${DECLARED})  ${W}x${H}`);
if (total !== DECLARED) {
  console.log(`PARTIAL RUN — ${total} checks completed of ${DECLARED} declared. A ratio like `
    + `"${total}/${total}" is the shape of a suite that DIED, not one that passed.`);
}
if (fail.length) console.log('FAILED: ' + fail.join(', '));
process.exit(fail.length || total !== DECLARED ? 1 : 0);
