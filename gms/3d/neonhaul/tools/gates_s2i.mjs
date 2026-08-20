#!/usr/bin/env node
// S2-I's gates — hired drivers, automatic wages, the vehicle-view switch and the earnings screens.
//
//   node tools/gates_s2i.mjs [--land] [--headed] [--w= --h=]
//
// **Every check here is falsified**, and each falsification is written to fail for the reason the
// check is about rather than for a reason that happens to be nearby. This project has logged
// twenty-two measurements that silently measured nothing, and the two most recent are the ones
// this file is written against:
//
//   · a gate tested `height >= 36` on a RAW FLOAT while printing `Math.round(height)`, so a 35.99
//     px element FAILED WHILE PRINTING "36 px tall". Nothing below prints a rounded value for a
//     term it tests exactly — every geometric assertion prints to 2 dp.
//   · a capture tool aimed every camera 180 deg away from its subject, producing four districts of
//     frames with no subject in them, which reads exactly like a dead feature. So D1 asserts the
//     camera is on the DRIVER'S FLIGHT MODEL by identity (`rig.flight === driver.flight`), not by
//     the label the panel is showing.
//
// Two rules inherited from every suite before it: results are written to disk AS EACH CHECK
// COMPLETES, never batched; and no isolation is `&&`-guarded — every hook goes through `hook()`,
// which THROWS when it is missing rather than resolving quietly to undefined.
//
// SCHEMA NOTE: writes `{ok:[],fail:[]}` AND `{results:[]}`, like gates_s2d/s2f/s2h, because a
// parser reading only one key has reported 0/0 on a fully passing suite four times here.

import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { open, parseArgs, waitFor, settle, evalJSON, hook, quiesce } from './shot.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = parseArgs();
const LAND = !!args.land;
const W = +(args.w || (LAND ? 844 : 390)), H = +(args.h || (LAND ? 390 : 844));
const OUT = resolve(ROOT, 'shots/s2i');
const FILE = resolve(OUT, `_gates${LAND ? '_land' : ''}.json`);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const ok = [], fail = [], detail = {};
// Read inside main() and asserted after `close()` — see E4.
let keysSeen = null;
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

// Advance the SIM by `seconds` of its own clock. `settle()` counts FRAMES and gives up after 25 s
// of wall time — asking it for 3600 frames returns -1 and advances whatever it managed, which on
// the first run of this suite was 26 sim seconds against the 60 that were asked for. A window that
// silently comes back short is a measurement of a smaller window, not a failed one, so this waits
// on `__state.t` and REPORTS what it actually got.
async function advance(S, seconds, budgetMs = 240000) {
  const t0 = await evalJSON(S, '__state.t');
  const w0 = Date.now();
  while (Date.now() - w0 < budgetMs) {
    await settle(S, 240, 20000);
    const t = await evalJSON(S, '__state.t');
    if (t - t0 >= seconds) return { got: +(t - t0).toFixed(2), want: seconds, short: false };
  }
  const t = await evalJSON(S, '__state.t');
  return { got: +(t - t0).toFixed(2), want: seconds, short: true };
}

async function shot(S, name) {
  const { data } = await S('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(resolve(OUT, `${name}.png`), Buffer.from(data, 'base64'));
  return `shots/s2i/${name}.png`;
}

// ── A — the money, in node, before a browser is opened ─────────────────────
//
// `js/company.js` is pure, so these run against the shipped module directly. A browser adds
// nothing to an assertion about arithmetic and would only make it slower to falsify.
async function nodeChecks() {
  const C = await import(resolve(ROOT, 'js/company.js'));
  const E = await import(resolve(ROOT, 'js/economy.js'));
  const Story = await import(resolve(ROOT, 'js/story.js'));
  const Lanes = await import(resolve(ROOT, 'js/lanes.js'));
  const R = await import(resolve(ROOT, 'js/ranks.js'));

  // A1. Nothing in the wage table is a second copy of a number that lives somewhere else. The
  // lease is derived from story.js's SWEPT block price; competence is AUTO_LEVELS' SWEPT speed.
  const hulls = Object.keys(E.CRAFT);
  const leaseRows = hulls.map(h => ({
    hull: h, got: C.leasePerMin(h),
    want: E.round5(Story.blockPrice(h) / (Story.HIRE.BLOCK_S / 60) * C.LEASE_FRAC),
  }));
  const gradeRows = C.GRADES.map(g => ({
    grade: g.name, got: C.gradeSpeed(g.g), want: Lanes.AUTO_LEVELS[g.auto].speed,
  }));
  const pred = (l, g) => l.every(r => r.got === r.want) && g.every(r => r.got === r.want);
  // The falsification runs the SAME predicate over a copy with one row moved by the smallest
  // amount that matters — if it still passes, the predicate is not reading what it claims to.
  const badL = leaseRows.map((r, i) => (i === 2 ? { ...r, got: r.got + 5 } : r));
  const badG = gradeRows.map((r, i) => (i === 1 ? { ...r, got: +(r.got + 0.01).toFixed(2) } : r));
  check('S2-I/A1 FALSIFIED — the lease is story.js’s swept block price and competence is lanes.js’s swept speed ladder; neither is restated',
    pred(leaseRows, gradeRows) && !pred(badL, gradeRows) && !pred(leaseRows, badG),
    leaseRows.map(r => `  ${r.hull.padEnd(9)} lease ${String(r.got).padStart(5)} CRD/min  = blockPrice ${Story.blockPrice(r.hull)} / 5 min x ${C.LEASE_FRAC}`).join('\n')
    + '\n' + gradeRows.map(r => `  ${r.grade.padEnd(9)} speed ${r.got}  = AUTO_LEVELS[${C.GRADES.find(g => g.name === r.grade).auto}].speed`).join('\n')
    + `\nFALSIFIED: the same predicate over a copy with one lease +5 returns ${pred(badL, gradeRows)}, `
    + `and with one grade speed +0.01 returns ${pred(leaseRows, badG)}`);

  // A2. THE DESIGN RULE. "Wages paid automatically must be able to hurt. A driver who always nets
  // positive is a button that prints money, not a decision." The evidence is the committed sweep,
  // and this asserts the sweep says what company.js's header claims it says.
  const balPath = resolve(ROOT, 'docs/s2i_balance.json');
  const bal = existsSync(balPath) ? JSON.parse(readFileSync(balPath, 'utf8')) : null;
  const losing = bal ? bal.pairs.filter(p => p.loses) : [];
  const winning = bal ? bal.pairs.filter(p => !p.loses) : [];
  // The falsification is the counterfactual the design is defined against: zero the lease, which
  // is the term that makes the hull choice bite, and see whether ANY pairing still loses.
  const zeroLease = bal ? bal.pairs.map(p => ({ ...p, netP50: +(p.netP50 + p.lease).toFixed(1) })) : [];
  const zeroLosing = zeroLease.filter(p => p.netP50 < 0);
  check('S2-I/A2 FALSIFIED — a hire CAN lose money, and the lease is the term that makes it',
    !!bal && losing.length > 0 && winning.length > 0
      && bal.checks.every(c => c.pass)
      && zeroLosing.length < losing.length / 2,
    `docs/s2i_balance.json — ${bal ? bal.seeds : 0} worlds x ${bal ? bal.minutes : 0} min per pairing\n`
    + `  ${losing.length} of ${bal ? bal.pairs.length : 0} (grade x hull) pairings have a NEGATIVE median net\n`
    + (bal ? `  worst ${losing.sort((a, b) => a.netP50 - b.netP50)[0].gradeName} in a ${losing[0].hull}: ${losing[0].netP50} CRD/min\n` : '')
    + (bal ? `  best  ${winning.sort((a, b) => b.netP50 - a.netP50)[0].gradeName} in a ${winning[0].hull}: +${winning[0].netP50} CRD/min (${(winning[0].marginP50 * 100).toFixed(0)} % margin)\n` : '')
    + (bal ? bal.checks.map(c => `  sweep check "${c.name}": ${c.pass ? 'pass' : 'FAIL'}`).join('\n') + '\n' : '')
    + `FALSIFIED: add the lease back to every net (i.e. the hulls are free) and the number of losing `
    + `pairings goes ${losing.length} → ${zeroLosing.length} — the lease accounts for `
    + `${losing.length - zeroLosing.length} of the ${losing.length}. The remainder `
    + `(${zeroLease.filter(p => p.netP50 < 0).map(p => p.gradeName + '/' + p.hull).join(', ') || 'none'}) `
    + `lose on SPEED alone, which is the other half of the same decision and is why the check is `
    + `"a majority", not "all of them"`);

  // A3. The two reserved courier rungs open on FLEET gross and cannot be reached without a company
  // — which is what keeps gates_s2d A1's `courierRank(99) === HAULMASTER` true at the same time.
  const noCo = R.courierRank(99).name;
  const t3 = R.COMPANY_TIERS ? null : null; void t3;
  const at60 = R.courierRank(6, { gross: C.COMPANY_TIERS[2].gross }).name;
  const at165 = R.courierRank(6, { gross: C.COMPANY_TIERS[3].gross }).name;
  const justUnder = R.courierRank(6, { gross: C.COMPANY_TIERS[2].gross - 1 }).name;
  const lowTier = R.courierRank(3, { gross: 10e6 }).name;
  const reserved = R.COURIER_RANKS.filter(r => r.opens);
  check('S2-I/A3 FALSIFIED — LANE MARSHAL and SPIRE HAULIER open on FLEET gross, and are still unreachable without a company',
    noCo === 'HAULMASTER' && justUnder === 'HAULMASTER'
      && at60 === 'LANE MARSHAL' && at165 === 'SPIRE HAULIER'
      && lowTier === 'BONDED COURIER'
      && reserved.every(r => r.lifetime === null && typeof r.fleet === 'number'),
    `courierRank(99) with NO company     → ${noCo}   (gates_s2d A1 asserts exactly this and still holds)\n`
    + `courierRank(6, gross ${C.COMPANY_TIERS[2].gross - 1}) → ${justUnder}\n`
    + `courierRank(6, gross ${C.COMPANY_TIERS[2].gross}) → ${at60}\n`
    + `courierRank(6, gross ${C.COMPANY_TIERS[3].gross}) → ${at165}\n`
    + `courierRank(3, gross 10,000,000) → ${lowTier}  — a fleet cannot buy you the sixth rung, only the seventh and eighth\n`
    + reserved.map(r => `  ${r.name}: lifetime ${r.lifetime} · fleet ${r.fleet}`).join('\n')
    + `\nFALSIFIED by construction: the one-argument call is byte-for-byte the pre-S2-I function, `
    + `so the "just under" and "no company" rows above ARE the negative control`);

  // A4. The candidate pool cannot be re-rolled by closing the panel. Same trap missions.js closes
  // on the job board: an outcome a player can reroll for free is not an outcome.
  const co = C.newCompany({ seed: 0x1234 });
  const a = C.candidates(co).map(c => c.id + ':' + c.grade).join(',');
  const b = C.candidates(co).map(c => c.id + ':' + c.grade).join(',');
  const econ = E.newState({ credits: 5000 });
  C.refreshCandidates(co, econ);
  const c2 = C.candidates(co).map(c => c.id + ':' + c.grade).join(',');
  check('S2-I/A4 FALSIFIED — the agency list is deterministic in (seed, gen) and only a PAID refresh moves it',
    a === b && a !== c2 && econ.credits === 5000 - C.REFRESH_FEE,
    `two reads of the same company: identical ${a === b}\n  ${a}\n`
    + `after refreshCandidates (${C.REFRESH_FEE} CRD, balance 5000 → ${econ.credits}): different ${a !== c2}\n  ${c2}\n`
    + `FALSIFIED: the second read is the control — if `
    + `candidates() drew from Math.random it would differ WITHOUT the fee, and the first term would be false`);

  // A5. Driver income must never reach `economy.lifetime`. That is the licence ladder's axis and
  // idling to HAULMASTER on somebody else's flying would make it mean nothing.
  const e2 = E.newState({ credits: 1000 });
  const co2 = C.newCompany();
  const d = C.newDriver({ id: 'x', name: 'X', grade: 2, craft: 'wisp' });
  co2.drivers.push(d);
  const life0 = e2.lifetime, cr0 = e2.credits;
  C.creditDelivery(co2, e2, d, 900);
  // The control: the same 900 through the PLAYER's own path does move lifetime.
  const e3 = E.newState({ credits: 1000 });
  E.earn(e3, 900);
  check('S2-I/A5 FALSIFIED — a driver’s delivery credits the account and the FLEET ledger, and never economy.lifetime',
    e2.lifetime === life0 && e2.credits === cr0 + 900 && co2.gross === 900
      && e3.lifetime === 900,
    `driver delivery of 900: credits ${cr0} → ${e2.credits} · fleet gross → ${co2.gross} · lifetime ${life0} → ${e2.lifetime}\n`
    + `CONTROL — the same 900 through economy.earn(), which is the player's own path: lifetime 0 → ${e3.lifetime}. `
    + `The two paths are genuinely different, so the first result is not "nothing happened"`);

  // A6. Arrears, and the walk-out. No fail state: the penalty is that they leave.
  const e4 = E.newState({ credits: 0 });
  const co4 = C.newCompany();
  const d4 = C.newDriver({ id: 'y', name: 'Y', grade: 1, craft: 'wisp' });
  co4.drivers.push(d4);
  const lim = C.arrearsLimit(d4);
  let t = 0, quitAt = null;
  while (t < 600 && !quitAt) {
    const r = C.payWages(co4, e4, 1, t);
    t += 1;
    if (r.quit.length) quitAt = t;
  }
  // The control arm: the same driver, the same window, with money in the account.
  const e5 = E.newState({ credits: 1e6 });
  const co5 = C.newCompany();
  co5.drivers.push(C.newDriver({ id: 'y', name: 'Y', grade: 1, craft: 'wisp' }));
  let t5 = 0, quit5 = 0;
  while (t5 < 600) { quit5 += C.payWages(co5, e5, 1, t5).quit.length; t5 += 1; }
  const wagePerSec = C.wageOf(d4).total / 60;
  check('S2-I/A6 FALSIFIED — an unpayable wage accrues as arrears and the driver WALKS; a paid one never does',
    quitAt !== null && Math.abs(quitAt - C.ARREARS_MINUTES * 60) <= 2
      && co4.drivers.length === 0 && co4.quits === 1
      && quit5 === 0 && co5.drivers.length === 1 && co5.wages > 0,
    `broke account: ${C.gradeOf(1).name} on ${C.wageOf(d4).total} CRD/min (${wagePerSec.toFixed(3)}/s), `
    + `arrears limit ${lim.toFixed(1)} CRD = ${C.ARREARS_MINUTES} min of wage\n`
    + `  walked out at t = ${quitAt} s (expected ${C.ARREARS_MINUTES * 60}) · roster ${co4.drivers.length} · quits ${co4.quits}\n`
    + `CONTROL — identical driver, identical 600 s, 1,000,000 CRD in the account: `
    + `${quit5} walk-outs, roster ${co5.drivers.length}, ${Math.round(co5.wages)} CRD of wages actually paid.\n`
    + `The control is what shows the walk-out is caused by the EMPTY ACCOUNT and not by the clock`);

  // A7. The save round-trips. A company that loses its roster on reload is worse than no company.
  const co7 = C.newCompany({ seed: 99, gen: 3, gross: 44000, wages: 900.4, fuel: 12, signing: 700 });
  const e7 = E.newState({ credits: 90000 });
  const list = C.candidates(co7);
  C.hire(co7, e7, list[0], 'kestrel', 0);
  C.payWages(co7, e7, 30, 30);
  const round = C.fromSave(C.toSave(co7));
  const same = ['seed', 'gen', 'gross', 'signing', 'quits', 'released', 'jobs']
    .every(k => Math.round(co7[k]) === Math.round(round[k]));
  const drvSame = round.drivers.length === co7.drivers.length
    && round.drivers[0].id === co7.drivers[0].id
    && round.drivers[0].craft === co7.drivers[0].craft
    && Math.round(round.drivers[0].wages) === Math.round(co7.drivers[0].wages);
  // Falsify: a hull that no longer exists must DROP rather than come back as an undefined lease.
  const corrupt = C.toSave(co7);
  corrupt.drivers[0].craft = 'zeppelin';
  const dropped = C.fromSave(corrupt);
  check('S2-I/A7 FALSIFIED — the company round-trips through the save, and a driver on a hull that no longer exists is dropped, not resurrected',
    same && drvSame && dropped.drivers.length === 0,
    `co: seed/gen/gross/signing/quits/released/jobs all preserved: ${same}\n`
    + `driver: ${co7.drivers[0].name} in a ${co7.drivers[0].craft}, ${Math.round(co7.drivers[0].wages)} CRD of wages — preserved: ${drvSame}\n`
    + `FALSIFIED: the same save with craft "zeppelin" comes back with ${dropped.drivers.length} drivers, `
    + `not one with an undefined lease`);
}

// ── the browser half ───────────────────────────────────────────────────────
async function main() {
  mkdirSync(OUT, { recursive: true });
  await nodeChecks();

  const { S, base, close } = await open({ w: W, h: H, dpr: 1, mobile: true, headed: !!args.headed });
  // Two drivers, tier 4 so the hull picker has real choices, and act two so the layer is open.
  await S('Page.navigate', { url: `${base}/index.html?nosave=1&story=act2&fleet=2&tier=4&dpr=1` });
  await waitFor(S, 'window.__ready', 60000);
  await settle(S, 30);
  await quiesce(S, { timeout: 60000 });
  await hook(S, 'setCredits', 200000);
  await evalJSON(S, '(window.__game.clearToasts(), 1)');

  // ═══ B — the drivers actually fly and actually earn ══════════════════════

  // B1. The whole claim of the phase: a hired driver is a `Courier` at the stick of a real
  // `Flight`, and its income is DELIVERIES. So the identity is asserted, then the money is
  // measured as a DELTA — `?fleet=` winds the ladder on to allow the cap, so the absolute gross
  // starts non-zero and reading it as earnings would be reading the test fixture.
  const wired = await evalJSON(S, `(() => {
    const g = window.__game, f = g.fleet;
    const d = f.live[0];
    return {
      live: f.live.length,
      isCourier: d.courier.constructor.name,
      isFlight: d.flight.constructor.name,
      // Its OWN Missions instance, not the player's. Asserted by identity against the one the
      // game holds, because Missions.accept() bumps the pad's board generation and a driver
      // sharing it would refresh the board under the player's fingers from three km away.
      ownMissions: d.missions !== g.missions,
      seeds: [d.missions.seed, g.missions.seed],
      speedCap: d.courier.speedCap,
      grade: d.rec.grade,
    };
  })()`);
  const m0 = await evalJSON(S, '({gross:__state.company.gross, jobs:__state.company.jobs, wages:__state.company.wages, credits:__state.credits, life:__state.lifetime})');
  const adv = await advance(S, 170);
  const m1 = await evalJSON(S, '({gross:__state.company.gross, jobs:__state.company.jobs, wages:__state.company.wages, credits:__state.credits, life:__state.lifetime, mins:__state.company.minutes, t:__state.t, st:__state.company.statuses})');
  const dGross = m1.gross - m0.gross, dJobs = m1.jobs - m0.jobs, dWages = m1.wages - m0.wages;
  const stats = Object.values(m1.st);
  check('S2-I/B1 — a driver is a Courier at the stick of a real Flight, with its own Missions, and it delivers',
    wired.isCourier === 'Courier' && wired.isFlight === 'Flight' && wired.live === 2
      && wired.ownMissions === true && !adv.short
      && dJobs > 0 && dGross > 0 && dWages > 0 && m1.life === m0.life,
    `fleet: ${wired.live} live · pilot class "${wired.isCourier}" · physics class "${wired.isFlight}" · own Missions ${wired.ownMissions} (seeds ${wired.seeds.join(' vs ')})\n`
    + `window: asked for ${adv.want} sim seconds, got ${adv.got} (short: ${adv.short})\n`
    + `over that window: ${dJobs} deliveries, +${Math.round(dGross)} CRD fleet gross, `
    + `−${Math.round(dWages)} CRD wages · ${Math.round(dGross / (adv.got / 60))} CRD/min gross against `
    + `a ${Math.round(dWages / (adv.got / 60))} CRD/min payroll\n`
    + `economy.lifetime UNMOVED: ${m0.life} → ${m1.life} — the licence ladder cannot be idled up (A5 is the unit proof)\n`
    + stats.map((s, i) => `  driver ${i}: ${s.state}/${s.leg} · ${s.deliveries} delivered · ${s.escapes} escapes · ${s.stucks} abandoned targets · cell ${(s.cell * 100).toFixed(0)} %`).join('\n'));

  // B2 FALSIFIED. The gross is produced by the DRIVERS and by nothing else. Release the fleet, run
  // the same window, and the same counters must not move — otherwise B1 was measuring something
  // that would have happened anyway.
  const ids = await evalJSON(S, 'window.__game.ledger().drivers.map(d => d.id)');
  for (const id of ids) await hook(S, 'releaseDriver', id);
  await settle(S, 20);
  const z0 = await evalJSON(S, '({gross:__state.company.gross, jobs:__state.company.jobs, wages:__state.company.wages, live:__state.company.live})');
  const advZ = await advance(S, 70);
  const z1 = await evalJSON(S, '({gross:__state.company.gross, jobs:__state.company.jobs, wages:__state.company.wages, live:__state.company.live})');
  check('S2-I/B2 FALSIFIED — with the roster empty the fleet earns nothing and the payroll stops, so B1 measured the drivers',
    z1.live === 0 && z1.gross === z0.gross && z1.jobs === z0.jobs
      && Math.round(z1.wages) === Math.round(z0.wages)
      && !advZ.short && dGross > 0 && dJobs > 0,
    `roster released: ${z0.live} live craft\n`
    + `over ${advZ.got} sim seconds (short: ${advZ.short}): gross ${Math.round(z0.gross)} → ${Math.round(z1.gross)} · jobs ${z0.jobs} → ${z1.jobs} · `
    + `wages ${Math.round(z0.wages)} → ${Math.round(z1.wages)}\n`
    + `against ${dJobs} deliveries and +${Math.round(dGross)} CRD with the fleet on the books. `
    + `A zero here that the arm above did not move would mean the counters were dead, not that the drivers were`);

  // ═══ C — competence is the measured ladder, not a new number ═════════════

  // C1 FALSIFIED. The speed cap is the ONLY place competence becomes a flight number, and it is
  // AUTO_LEVELS'. Measured on the craft, not read off the field: a cap the pilot ignores is a
  // number in a struct.
  await hook(S, 'hireDriver', 0, 'wisp');
  await settle(S, 30);
  const capInfo = await evalJSON(S, `(() => {
    const d = window.__game.fleet.live[0];
    return { grade: d.rec.grade, cap: d.courier.speedCap, maxFwd: +d.flight.maxFwd.toFixed(2),
      want: window.__game.Company.gradeSpeed(d.rec.grade) };
  })()`);
  // Fly it and sample the top speed it reaches under its own cap.
  let capped = 0;
  for (let i = 0; i < 26; i++) {
    await settle(S, 40);
    const v = await evalJSON(S, '(+window.__game.fleet.live[0].flight.speed.toFixed(3))');
    if (v > capped) capped = v;
  }
  // The falsification: lift the cap to 1 and watch the SAME craft exceed what it could reach before.
  await evalJSON(S, '(window.__game.fleet.live[0].courier.speedCap = 1, 1)');
  let lifted = 0;
  for (let i = 0; i < 26; i++) {
    await settle(S, 40);
    const v = await evalJSON(S, '(+window.__game.fleet.live[0].flight.speed.toFixed(3))');
    if (v > lifted) lifted = v;
  }
  const limit = capInfo.cap * capInfo.maxFwd;
  check('S2-I/C1 FALSIFIED — the grade’s speed cap is lanes.js’s measured ladder, and the CRAFT actually honours it',
    capInfo.cap === capInfo.want && capped <= limit + 1.5 && lifted > capped + 3,
    `grade ${capInfo.grade} (${['GREEN', 'STEADY', 'SEASONED', 'ACE'][capInfo.grade]}) · cap ${capInfo.cap} = AUTO_LEVELS speed ${capInfo.want}\n`
    + `hull MAX_FWD ${capInfo.maxFwd.toFixed(2)} m/s → cap allows ${limit.toFixed(2)} m/s\n`
    + `fastest the craft actually reached over 26 samples: ${capped.toFixed(2)} m/s\n`
    + `FALSIFIED: same craft, cap lifted to 1.0 → fastest ${lifted.toFixed(2)} m/s, `
    + `${(lifted - capped).toFixed(2)} m/s past what the capped arm could manage`);

  // C2. The whole fleet costs ZERO extra draw calls. Same claim S2-C and S2-G made, and it needs
  // TWO ARMS, because the isolation that removes the noise also removes the baseline.
  //
  //   DRAWS      measured with the traffic ON, which is the shipping case. A field draws once if
  //              it holds any instance and not at all if it is empty — so with the traffic off the
  //              baseline is an EMPTY field and "4 draws → 0 draws" is the fields going away, not
  //              the fleet costing four. Traffic is what keeps the comparison a real one.
  //   INSTANCES  measured with the traffic OFF, because `craftBody` counts the traffic too and its
  //              population churns as craft enter and leave the near ring — by about the size of
  //              the +1 being measured. One landscape run read 31/30/30 and passed; the next read
  //              31/31/31 and failed. A check whose effect is the size of its noise is a coin toss.
  //
  // The falsification is the cull itself, on the live model: shove the same hired, still-flying
  // driver 4 km out and watch its instance come off.
  const snap = `(() => { const b = window.__game.craftFields.breakdown();
    const c = window.__game.camera.position;
    const f = window.__game.fleet.live;
    return { draws: b.rows ? b.rows.reduce((s, r) => s + r.draws, 0) : b.draws,
      body: (b.rows ? b.rows.find(r => r.field === 'craftBody') : null),
      dists: f.map(d => +Math.hypot(d.flight.px - c.x, d.flight.pz - c.z).toFixed(1)) }; })()`;

  // ── arm 1: DRAWS, traffic on ──────────────────────────────────────────
  await hook(S, 'hireDriver', 0, 'wisp');
  await settle(S, 10);
  const drawsWith = await evalJSON(S, snap);
  let ids2 = await evalJSON(S, 'window.__game.ledger().drivers.map(d => d.id)');
  for (const id of ids2) await hook(S, 'releaseDriver', id);
  await settle(S, 14);
  const drawsWithout = await evalJSON(S, snap);

  // ── arm 2: INSTANCES, traffic off ─────────────────────────────────────
  const trafficOff = await hook(S, 'setTraffic', false);
  await hook(S, 'hireDriver', 0, 'wisp');
  await settle(S, 10);
  const instWith = await evalJSON(S, snap);
  await evalJSON(S, '(window.__game.fleet.live.forEach(d => { d.flight.px += 4000; }), 1)');
  await settle(S, 10);
  const instFar = await evalJSON(S, snap);
  ids2 = await evalJSON(S, 'window.__game.ledger().drivers.map(d => d.id)');
  for (const id of ids2) await hook(S, 'releaseDriver', id);
  await settle(S, 14);
  const instNone = await evalJSON(S, snap);
  await hook(S, 'setTraffic', true);
  await settle(S, 10);

  const near = instWith.dists.filter(d => d < 1600).length;
  check('S2-I/C2 FALSIFIED — the fleet costs ZERO extra draw calls, and a driver past the draw radius costs not even an instance',
    drawsWith.draws === drawsWithout.draws && drawsWith.draws > 0
      && near >= 1
      && instWith.body.instances === instNone.body.instances + near
      && instFar.body.instances === instNone.body.instances,
    `ARM 1 — DRAWS, traffic ON (the shipping case; an empty field draws nothing, so the traffic is\n`
    + `        what keeps this a real comparison rather than a measurement of fields disappearing)\n`
    + `  with a hired driver: ${drawsWith.draws} draws · with the roster released: ${drawsWithout.draws} draws\n`
    + `ARM 2 — INSTANCES, traffic OFF (setTraffic returned ${JSON.stringify(trafficOff)}; craftBody counts\n`
    + `        the traffic too and its churn is about the size of the +1 being measured)\n`
    + `  driver ${instWith.dists.join(', ')} m from the camera — ${near} inside the 1,600 m band\n`
    + `  in the band: ${instWith.body.instances} craftBody instances\n`
    + `  +4,000 m:    ${instFar.body.instances}\n`
    + `  released:    ${instNone.body.instances}\n`
    + `The +4,000 m arm is the SAME driver, still hired and still flying, contributing nothing — so `
    + `the instance the first arm counted was the pose, and not something that was there anyway`);

  // ═══ D — switch to their vehicle view ═══════════════════════════════════

  await hook(S, 'hireDriver', 0, 'wisp');
  await hook(S, 'hireDriver', 1, 'kestrel');
  await settle(S, 20);
  // The feed is offered from a pad only — dock first, which is the condition the VIEW key is
  // disabled by, then let the driver get clear of the deck so the camera has somewhere to go.
  await hook(S, 'forceDock');
  await advance(S, 45);
  const drvIds = await evalJSON(S, 'window.__game.ledger().drivers.map(d => d.id)');
  const before = await evalJSON(S, '({ rig: __game.rigTarget() })');
  await hook(S, 'viewDriver', drvIds[0]);
  await settle(S, 20);
  const during = await evalJSON(S, `(() => {
    const g = window.__game, d = g.fleet.find(${JSON.stringify(drvIds[0])});
    const c = g.camera ? g.camera.position : null;
    return { rig: g.rigTarget(),
      camToDriver: c ? +Math.hypot(c.x - d.flight.px, c.z - d.flight.pz).toFixed(2) : null,
      camToPlayer: c ? +Math.hypot(c.x - __state.player.x, c.z - __state.player.z).toFixed(2) : null,
      driverToPlayer: +Math.hypot(d.flight.px - __state.player.x, d.flight.pz - __state.player.z).toFixed(2),
      feedShown: !document.getElementById('feed').classList.contains('hidden'),
      feedName: (document.querySelector('#feed .df-name') || {}).textContent || null,
      dashOn: g.rigTarget().cabin,
      chaseHud: !document.getElementById('hud-strip').classList.contains('hidden'),
    };
  })()`);
  await hook(S, 'viewDriver', null);
  await settle(S, 20);
  const after = await evalJSON(S, `(() => {
    const g = window.__game;
    const c = g.camera ? g.camera.position : null;
    return { rig: g.rigTarget(),
      camToPlayer: c ? +Math.hypot(c.x - __state.player.x, c.z - __state.player.z).toFixed(2) : null,
      feedShown: !document.getElementById('feed').classList.contains('hidden'),
      dashOn: g.rigTarget().cabin };
  })()`);
  check('S2-I/D1 FALSIFIED — the camera rig is pointed at the DRIVER’S OWN flight model, and leaving the feed puts every term back',
    before.rig.onPlayer === true && before.rig.onDriver === false
      && during.rig.onDriver === true && during.rig.onPlayer === false
      && during.camToDriver !== null && during.camToDriver < 40
      && during.camToPlayer > 60
      && during.feedShown === true && during.dashOn === false && during.chaseHud === false
      && after.rig.onPlayer === true && after.rig.onDriver === false
      && after.feedShown === false && after.camToPlayer < 40,
    `The assertion is IDENTITY, not a label: rig.flight === driver.flight.\n`
    + `  before: onPlayer ${before.rig.onPlayer} · onDriver ${before.rig.onDriver}\n`
    + `  during: onDriver ${during.rig.onDriver} · camera is ${during.camToDriver} m from the driver `
    + `and ${during.camToPlayer} m from the player's own pad\n`
    + `          #feed up ${during.feedShown} ("${during.feedName}") · cabin dash off ${!during.dashOn} · chase HUD off ${!during.chaseHud}\n`
    + `  after:  onPlayer ${after.rig.onPlayer} · camera back to ${after.camToPlayer} m from the player · #feed down ${!after.feedShown} · dash back ${after.dashOn}\n`
    + `FALSIFIED both ways — the before and after arms are the negative controls, and the camera `
    + `DISTANCE is what stops "onDriver true" being a flag nobody moved the camera for`);

  // D2. The two existing rigs are REUSED. Toggling the view while on a driver has to give the same
  // cockpit/chase pair `js/camera.js` already has — a third bespoke spectator camera is exactly
  // what the brief said not to build.
  await hook(S, 'viewDriver', drvIds[0]);
  await settle(S, 16);
  const rigA = await evalJSON(S, `(() => { const g = window.__game, d = g.fleet.find(${JSON.stringify(drvIds[0])});
    const c = g.camera.position;
    return { mode: g.rigTarget().mode, dist: +Math.hypot(c.x - d.flight.px, c.y - d.flight.py, c.z - d.flight.pz).toFixed(2) }; })()`);
  await hook(S, 'toggleView');
  await settle(S, 16);
  const rigB = await evalJSON(S, `(() => { const g = window.__game, d = g.fleet.find(${JSON.stringify(drvIds[0])});
    const c = g.camera.position;
    return { mode: g.rigTarget().mode, dist: +Math.hypot(c.x - d.flight.px, c.y - d.flight.py, c.z - d.flight.pz).toFixed(2) }; })()`);
  const png = await shot(S, LAND ? 'feed_land' : 'feed_port');
  check('S2-I/D2 — both existing camera rigs work on a driver; no third rig was built',
    rigA.mode !== rigB.mode
      && ((rigA.mode === 'cockpit' ? rigA.dist : rigB.dist) < 4)
      && ((rigA.mode === 'chase' ? rigA.dist : rigB.dist) > 5),
    `${rigA.mode}: camera ${rigA.dist.toFixed(2)} m from the driver's hull\n`
    + `${rigB.mode}: camera ${rigB.dist.toFixed(2)} m from the driver's hull\n`
    + `The COCKPIT arm sits inside the hull (<4 m) and the CHASE arm is out on the boom (>5 m), which `
    + `is the two rigs camera.js already had, doing what they already did, to a different flight model\n`
    + `capture: ${png}`);

  // ═══ E — the screens ════════════════════════════════════════════════════

  await hook(S, 'viewDriver', null);
  await settle(S, 14);
  await hook(S, 'setFleetGross', 74000);
  const panel = await hook(S, 'fleetPanel', 'earnings');
  await settle(S, 12);

  // E1. The books show the ARITHMETIC. Every line the screen prints must sum to the NET it prints.
  // A screen whose total does not equal its own workings is lying, and it is the one failure this
  // tab can have that a screenshot would not reveal.
  const books = await evalJSON(S, `(() => {
    const rows = [...document.querySelectorAll('.flb-row')].map(r => ({
      k: r.querySelector('.flb-k').textContent,
      v: r.querySelector('.flb-v').textContent,
      net: r.classList.contains('net'),
    }));
    // Parse exactly what is ON SCREEN — the thin space is the group separator crd() writes, and
    // U+2212 is the minus sign. Reading the model instead would prove nothing about the screen.
    const num = s => {
      const neg = s.indexOf('\\u2212') >= 0 || s.indexOf('-') >= 0;
      const n = +s.replace(/[^0-9.]/g, '');
      return neg ? -n : n;
    };
    const lines = rows.filter(r => !r.net).map(r => ({ k: r.k, n: num(r.v) }));
    const netRow = rows.find(r => r.net);
    return { lines, netShown: netRow ? num(netRow.v) : null, rows: rows.length,
      ledgerNet: window.__game.ledger().net };
  })()`);
  const summed = books.lines.reduce((s, l) => s + l.n, 0);
  // Every line is printed through `crd()`, which ROUNDS, so the screen's own sum can legitimately
  // differ from the model by up to one credit per line. The tolerance is therefore the LINE COUNT,
  // stated rather than widened until it passed — and it is still tight enough that a genuinely
  // wrong term (which would be tens or thousands out) fails.
  const tol = books.lines.length + 1;
  check('S2-I/E1 FALSIFIED — the EARNINGS tab shows the arithmetic: every line it prints sums to the NET it prints',
    books.rows >= 3 && books.netShown !== null
      && Math.abs(summed - books.netShown) <= tol
      && Math.abs(books.netShown - books.ledgerNet) <= tol,
    books.lines.map(l => `  ${l.k.padEnd(14)} ${String(l.n).padStart(9)}`).join('\n')
    + `\n  ${'='.repeat(24)}\n  ${'SUM'.padEnd(14)} ${String(summed).padStart(9)}   vs the NET the screen prints: ${books.netShown}\n`
    + `  company.ledger().net says ${books.ledgerNet}\n`
    + `  tolerance ${tol} CRD = one per rounded line + 1; the two gaps are `
    + `${Math.abs(summed - books.netShown)} and ${Math.abs(books.netShown - books.ledgerNet)}\n`
    + `FALSIFIED: the terms are parsed OUT OF THE DOM, not read from the model, so a screen that `
    + `printed a total its own rows do not add up to would fail here while the model stayed correct`);

  // E2. No alert / confirm / prompt, anywhere near this layer. Aaron's hard rule.
  const modal = await evalJSON(S, `(() => {
    let hits = 0;
    const A = window.alert, C = window.confirm, P = window.prompt;
    window.alert = window.confirm = window.prompt = () => { hits++; throw new Error('modal'); };
    const g = window.__game;
    try {
      g.fleetPanel('recruit');
      // Drive every refusal path there is: no money, then a hull above the licence, then a full roster.
      const keep = __state.credits;
      g.setCredits(0);
      [...document.querySelectorAll('.flc-key, .fl-refresh, .flh, .fld-key, .fl-tab')].forEach(b => { try { b.click(); } catch (e) { hits++; } });
      g.fleetPanel('roster');
      [...document.querySelectorAll('.fld-key, .fl-tab')].forEach(b => { try { b.click(); } catch (e) { hits++; } });
      g.setCredits(keep);
    } finally {
      window.alert = A; window.confirm = C; window.prompt = P;
    }
    return { hits, note: (document.querySelector('.fl-note') || {}).textContent || null };
  })()`);
  check('S2-I/E2 FALSIFIED — no alert / confirm / prompt anywhere in the company layer; every refusal is a note on the panel',
    modal.hits === 0,
    `alert/confirm/prompt replaced with a throwing stub, then every key on both tabs pressed with a `
    + `ZERO balance (which is the state that produces every refusal this layer has): ${modal.hits} calls\n`
    + `the panel's own refusal line instead: ${JSON.stringify(modal.note)}\n`
    + `FALSIFIED: the stub INCREMENTS AND THROWS, so a single call would both raise the counter and `
    + `break the click loop — it cannot pass by being silently swallowed`);

  // E3. Mobile geometry, in the orientation this run is in. Tested on the RAW floats and printed
  // to 2 dp: S2-G's find was a gate that tested `height >= 36` while printing Math.round(height),
  // so a 35.99 px element FAILED WHILE PRINTING "36 px tall".
  //
  // The roster must have drivers ON it: C2 released the fleet to measure the draw calls, and the
  // first run of this suite then measured an EMPTY roster and reported "3 pressable keys" — a
  // geometry check that passes over a screen with nothing on it is the failure mode this project
  // is named after.
  if ((await evalJSON(S, 'window.__game.ledger().count')) < 1) {
    await hook(S, 'hireDriver', 0, 'wisp');
    await settle(S, 12);
  }
  await hook(S, 'fleetPanel', 'roster');
  await settle(S, 10);
  const geo = await evalJSON(S, `(() => {
    const host = document.getElementById('fleet');
    const panel = host.querySelector('.hud-panel');
    const pr = panel.getBoundingClientRect();
    const keys = [...host.querySelectorAll('.fld-key, .fl-tab, .flc-key, .fl-refresh, .flh')]
      .map(b => { const r = b.getBoundingClientRect();
        return { cls: b.className, h: r.height, w: r.width, top: r.top }; });
    const tallest = keys.length ? Math.min(...keys.map(k => k.h)) : 0;
    const worst = keys.slice().sort((a, b) => a.h - b.h)[0] || null;
    return {
      vw: window.innerWidth, vh: window.innerHeight,
      panel: { x: pr.left, y: pr.top, w: pr.width, h: pr.height },
      fits: pr.left >= -0.5 && pr.right <= window.innerWidth + 0.5,
      docScrollW: document.documentElement.scrollWidth,
      minKeyH: tallest, worst, keys: keys.length,
      // How many driver rows the screen is actually showing. A geometry check over an EMPTY roster
      // would find only the three tab keys and pass while measuring nothing.
      drivers: host.querySelectorAll('.fl-drv').length,
      // Does the panel body scroll rather than the page? A layer that makes the BODY scroll
      // horizontally is the failure mode S2-D shipped once by terminating a CSS comment early.
      bodyOverflowX: document.body.scrollWidth - window.innerWidth,
    };
  })()`);
  check('S2-I/E3 — the company panel fits the frame in this orientation and every key clears the touch floor',
    geo.fits && geo.docScrollW <= geo.vw + 0.5 && geo.bodyOverflowX <= 0.5
      && geo.drivers >= 1 && geo.keys >= 5 && geo.minKeyH >= 36,
    `viewport ${geo.vw}x${geo.vh} · panel [${geo.panel.x.toFixed(2)}, ${geo.panel.y.toFixed(2)}, `
    + `${geo.panel.w.toFixed(2)}, ${geo.panel.h.toFixed(2)}] · inside the frame: ${geo.fits}\n`
    + `document scrollWidth ${geo.docScrollW} against a ${geo.vw} px frame · body overflow ${geo.bodyOverflowX.toFixed(2)} px\n`
    + `${geo.drivers} driver rows on screen · ${geo.keys} pressable keys · shortest ${geo.minKeyH.toFixed(2)} px `
    + `("${geo.worst ? geo.worst.cls : '?'}") against a floor of 36.00\n`
    + `Every number above is the RAW float to 2 dp — no term is tested at a precision it is not printed at`);

  const shotPanel = await shot(S, LAND ? 'panel_land' : 'panel_port');

  // E4. The FLEET key exists on the DOCK only when the company layer is open, and it is NOT a
  // `.dk-tab` — gates_wire presses `.dk-tab` index 2 and requires the SHOP, and gates_s2d B6
  // asserts RECORD is the last `.dk-tab`. Adding a fifth member to that collection broke the
  // second of those on S2-E's first run.
  await hook(S, 'closeFleetPanel');
  await settle(S, 10);
  keysSeen = await evalJSON(S, `(() => {
    const tabs = [...document.querySelectorAll('#ui .dk-tab')].map(b => b.querySelector('.dkt-l').textContent);
    const ks = [...document.querySelectorAll('#ui .dk-key')].map(b => b.querySelector('.dkt-l').textContent);
    return { tabs, ks, fleetIsTab: tabs.includes('FLEET'), last: tabs[tabs.length - 1] };
  })()`);
  // The falsification needs a SECOND page — one with no company at all — and that cannot be opened
  // while this session is live. `shot.mjs`'s `cleanup()` pkills on `/tmp/neonhaul-cdp-<NODE PID>`,
  // which every session this script opens SHARES, so closing a second browser kills the first one's
  // Chrome too and the next `evalJSON` on it hangs forever on a dead socket with no timeout. That
  // cost a 25-minute stall on the first run of this suite and it reads exactly like a slow gate.
  // So the control runs after `close()`, at the bottom of main().
  const closed = { deferred: true };
  void closed;

  // ═══ F — the licence rungs the company opens ════════════════════════════

  // F1. The RECORD tab must print the FLEET threshold under a header that says FLEET GROSS. A
  // fleet number printed in a column headed "CRD HAULED" is the surface lying about which quantity
  // the promotion is waiting on.
  //
  // The player has to be a HAULMASTER first: `courierRank` refuses rung 7 to anybody below the top
  // of the LIFETIME ladder, because a fleet buys the seventh and eighth rungs and never the sixth.
  // This session boots at `?tier=4`, so the licence is granted here — through `grantCredits`, which
  // is the same `economy.earn()` path a delivery takes, not by writing `tier`.
  await hook(S, 'grantCredits', 90000);
  await hook(S, 'setFleetGross', 180000);
  await settle(S, 12);
  const rec = await evalJSON(S, `(() => {
    const tabs = [...document.querySelectorAll('#ui .dk-tab')];
    tabs[tabs.length - 1].click();
    return 1;
  })()`);
  void rec;
  await settle(S, 10);
  const ladder = await evalJSON(S, `(() => {
    const sub = (document.querySelector('.dk-sect.lad .dk-ssub') || {}).textContent || '';
    const rungs = [...document.querySelectorAll('.dk-sect.lad .dk-rung')].slice(0, 8).map(r => ({
      name: (r.querySelector('.dkg-name') || {}).textContent,
      at: (r.querySelector('.dkg-at') || {}).textContent,
      here: r.classList.contains('here'), locked: r.classList.contains('locked'),
      done: r.classList.contains('done'),
    }));
    const du = window.__game.dockUI();
    return { sub, rungs, rank: du && du.ranks ? du.ranks.licence : null };
  })()`);
  const spire = ladder.rungs.find(r => r.name === 'SPIRE HAULIER');
  const marshal = ladder.rungs.find(r => r.name === 'LANE MARSHAL');
  check('S2-I/F1 — the RECORD tab reaches SPIRE HAULIER on the FLEET GROSS axis, and says so in the header',
    /FLEET GROSS/.test(ladder.sub) && ladder.rank && ladder.rank.axis === 'fleet'
      && ladder.rank.name === 'SPIRE HAULIER'
      && spire && spire.here && !spire.locked
      && marshal && marshal.done && !marshal.locked,
    `header: "${ladder.sub}"  (axis "${ladder.rank ? ladder.rank.axis : '?'}", rank ${ladder.rank ? ladder.rank.name : '?'})\n`
    + ladder.rungs.map(r => `  ${String(r.name).padEnd(15)} ${String(r.at).padStart(9)}`
      + `${r.here ? '  ← here' : r.done ? '  done' : ''}${r.locked ? '  SEALED' : ''}`).join('\n')
    + `\nBefore this phase both of the last two rows read SEALED with no threshold, and `
    + `courierRank() could not return either (gates_s2d A1). A3 above is the falsification and it `
    + `shows the one-argument call still cannot`);
  const shotRec = await shot(S, LAND ? 'record_land' : 'record_port');
  console.log(`      captures: ${shotPanel} · ${shotRec}`);

  await close();

  // ── E4's negative control, on its own browser, AFTER the main one is shut down ────────────
  // See the note at E4: two live sessions cannot both be closed cleanly in one node process.
  const s2 = await open({ w: W, h: H, dpr: 1, mobile: true, headed: !!args.headed });
  await s2.S('Page.navigate', { url: `${s2.base}/index.html?nosave=1&dpr=1` });
  await waitFor(s2.S, 'window.__ready', 60000);
  await settle(s2.S, 20);
  await hook(s2.S, 'forceDock');
  await settle(s2.S, 14);
  const noCompany = await evalJSON(s2.S, `(() => ({
    open: window.__game.companyOpen(),
    keys: [...document.querySelectorAll('#ui .dk-key')].map(b => b.querySelector('.dkt-l').textContent),
    tabs: [...document.querySelectorAll('#ui .dk-tab')].map(b => b.querySelector('.dkt-l').textContent),
  }))()`);
  await s2.close();

  check('S2-I/E4 FALSIFIED — the FLEET key is a `.dk-key`, never a `.dk-tab`, and it only exists once the company layer is open',
    keysSeen.ks.includes('FLEET') && !keysSeen.fleetIsTab && keysSeen.last === 'RECORD'
      && noCompany.open === false && !noCompany.keys.includes('FLEET')
      && noCompany.tabs[noCompany.tabs.length - 1] === 'RECORD',
    `act two: .dk-tab = [${keysSeen.tabs.join(', ')}] · .dk-key = [${keysSeen.ks.join(', ')}]\n`
    + `  RECORD is still the last .dk-tab: ${keysSeen.last === 'RECORD'} (gates_s2d B6's contract)\n`
    + `FALSIFIED — a SEPARATE page with no company at all (act one, no ?fleet): companyOpen `
    + `${noCompany.open}, .dk-key = [${noCompany.keys.join(', ')}], .dk-tab = `
    + `[${noCompany.tabs.join(', ')}]. The key is absent, not merely disabled`);

  console.log(`\n${ok.length}/${ok.length + fail.length} passed · shots/s2i/_gates${LAND ? '_land' : ''}.json`);
  process.exit(fail.length ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(2); });
void sleep;
