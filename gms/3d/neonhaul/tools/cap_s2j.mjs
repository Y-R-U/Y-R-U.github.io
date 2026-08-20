#!/usr/bin/env node
// tools/cap_s2j.mjs — the S2-J capture pass. Every new screen, portrait and landscape, so they can
// be LOOKED AT rather than reported on.
//
//   node tools/cap_s2j.mjs                 # portrait 390x844
//   node tools/cap_s2j.mjs --land          # landscape 844x390
//   node tools/cap_s2j.mjs --only=runs
//
// Shots land in shots/s2j/ (gitignored, like every other render).
//
// Four of S2-I's defects were found in its pictures and in nothing else — two panels stacking, a
// feed opening behind a panel, flight consoles live over a feed, and a rank rail contradicting the
// ladder printed six centimetres below it. So every capture here asserts what should be on screen
// BEFORE the shutter and prints the assertion; a shot whose precondition failed is a shot of the
// wrong thing, which reads exactly like a dead feature.
//
// ONE SESSION PER SCENE, and each is CLOSED before the next opens: `shot.mjs`'s `cleanup()` pkills
// on `/tmp/neonhaul-cdp-<NODE PID>`, which every browser this process opens shares, so two live
// sessions kill each other and the next `evalJSON` hangs forever with no timeout.

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { open, parseArgs, waitFor, settle, evalJSON, hook, quiesce } from './shot.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = parseArgs();
const LAND = !!args.land;
const W = +(args.w || (LAND ? 844 : 390)), H = +(args.h || (LAND ? 390 : 844));
const TAG = LAND ? 'land' : 'port';
const ONLY = args.only || null;
const OUT = resolve(ROOT, 'shots/s2j');

async function shot(S, name, expect) {
  if (expect) console.log(`      expecting: ${expect}`);
  // Immediately before the shutter, not once at boot: three toasts stack 124 px down the screen and
  // land ON TOP of a centred panel, so a capture taken a second after an action photographs the
  // action's own toasts covering the thing it was taken to show.
  await evalJSON(S, '(window.__game.clearToasts(), 1)');
  await settle(S, 3);
  const { data } = await S('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(resolve(OUT, `${name}_${TAG}.png`), Buffer.from(data, 'base64'));
  console.log(`  → shots/s2j/${name}_${TAG}.png`);
}

async function session(url) {
  const { S, base, close } = await open({ w: W, h: H, dpr: 1, mobile: true, headed: !!args.headed });
  await S('Page.navigate', { url: `${base}${url}` });
  await waitFor(S, 'window.__ready', 60000);
  await settle(S, 30);
  await quiesce(S, { timeout: 60000 });
  await evalJSON(S, '(window.__game.clearToasts(), 1)');
  return { S, close };
}

// A precondition that must hold before a shutter press. It THROWS rather than warning, because a
// capture tool that carries on past a failed precondition produces a plausible-looking picture of
// the wrong state, and that is the failure mode this file exists to avoid.
function must(cond, what, saw) {
  if (!cond) throw new Error(`PRECONDITION FAILED — ${what} (saw ${JSON.stringify(saw)})`);
  console.log(`      ok: ${what} — ${JSON.stringify(saw)}`);
}

mkdirSync(OUT, { recursive: true });
const base = '/index.html?nosave=1&dpr=1';

// ── 1. FOUND — act two with no charter at all ──────────────────────────────
if (!ONLY || ONLY === 'found') {
  console.log(`FOUND ${W}x${H}`);
  const { S, close } = await session(`${base}&story=act2&crd=40000&dock=1`);
  try {
    const g = await evalJSON(S, '__state.group');
    must(g && g.count === 0, 'the registry is empty — this is the screen before any company exists', g && g.count);
    // `?story=act2` cleans the account out to the 90 CRD the crew leave, which is the point of it —
    // and it makes the REGISTER key correctly unaffordable. The primary screen wants the affordable
    // case, so this puts the money back through the same hook every other suite uses.
    await hook(S, 'setCredits', 40000);
    await hook(S, 'closeHirePanel');
    await hook(S, 'fleetPanel', null);
    await settle(S, 12);
    const seen = await evalJSON(S, `({ name: !!document.querySelector('.fl-name'),
      key: (document.querySelector('.flc-key.take')||{}).textContent || null,
      rungs: document.querySelectorAll('.fl-ladder.small .fl-rung').length })`);
    must(seen.name && seen.rungs === 4, 'the name field and the four charter tiers are on screen', seen);
    await shot(S, 'found', 'FOUND A COMPANY — a name field with a suggestion, the fee, and the four charter tiers');
  } finally { await close(); }
}

// ── 2. the GROUP rail — three charters in one layout ───────────────────────
if (!ONLY || ONLY === 'group') {
  console.log(`GROUP ${W}x${H}`);
  // TWO charters, not three: at GROUP_MAX the `+ NEW CHARTER` key correctly disappears, and the
  // shot has to show both the strip and the way another one is added.
  const { S, close } = await session(`${base}&story=act2&shady=1&cos=1&fleet=2&cogross=74000&crd=90000&dock=1`);
  try {
    const g = await evalJSON(S, '__state.group');
    must(g && g.count === 2, 'two charters on the registry', g && g.names);
    // A file on the SECOND charter only, so the strip shows two different states side by side
    // rather than two copies of one — which is the whole claim the layout is making.
    await hook(S, 'setExposure', 0.62, 1);
    await hook(S, 'closeHirePanel');
    await hook(S, 'fleetPanel', 'roster');
    await settle(S, 12);
    const chips = await evalJSON(S, `[...document.querySelectorAll('.flg-chip')].map(c =>
      c.textContent.replace(/\\s+/g,' ').trim()).slice(0,5)`);
    must(chips.length === 3 && /NEW CHARTER/.test(chips[2]),
      'two charter chips in different states, plus the NEW CHARTER key', chips);
    await shot(S, 'group', 'a chip strip: three charters with different files, plus + NEW CHARTER');
  } finally { await close(); }
}

// ── 3. RUNS — the off-book switch and what the file costs ──────────────────
if (!ONLY || ONLY === 'runs') {
  console.log(`RUNS ${W}x${H}`);
  const { S, close } = await session(`${base}&story=act2&shady=1&fleet=3&cogross=74000&crd=60000&dock=1`);
  try {
    const ids = await evalJSON(S, '__state.company.drivers.map(d => d.id)');
    must(ids.length === 3, 'three drivers on the books', ids);
    await hook(S, 'setOffBook', ids[0], true);
    await hook(S, 'setPlayerOffBook', true);
    await hook(S, 'setExposure', 0.44);
    await hook(S, 'closeHirePanel');
    await hook(S, 'fleetPanel', 'runs');
    await settle(S, 12);
    const seen = await evalJSON(S, `({ rows: document.querySelectorAll('.fl-run').length,
      running: document.querySelectorAll('.fl-run.on').length,
      file: (document.querySelector('.fh-n')||{}).textContent || null,
      edge: (document.querySelector('.fh-edge')||{}).textContent || null })`);
    must(seen.rows === 4 && seen.running === 2 && seen.file, 'four run rows, two of them running, the file showing', seen);
    await shot(S, 'runs', 'THE RUNS — the file gauge, the four multipliers, and one driver plus the player running');
    // Real runs through the shipped path before the books are photographed — the first version of
    // this capture shot an EXPOSURE sheet with two rows and a zero on it, which is an accurate
    // picture of a charter that has never run anything and a useless picture of the screen.
    let ran = 0, seized = 0;
    for (let i = 0; i < 14; i++) {
      const r = await hook(S, 'runOnce', 640 + i * 40, ids[0]);
      if (r && r.offBook) { ran++; if (r.busted) seized++; }
    }
    must(ran >= 10 && seized >= 1, 'a run history with at least one seizure in it', { ran, seized });
    await hook(S, 'fleetPanel', 'exposure');
    await settle(S, 10);
    const ex = await evalJSON(S, `({ rows: document.querySelectorAll('.flb-row').length,
      keys: [...document.querySelectorAll('.flb-k')].map(e => e.textContent),
      net: (document.querySelector('.flb-row.net .flb-v')||{}).textContent || null })`);
    must(ex.rows >= 4 && ex.keys.includes('FINES'), 'the exposure sheet is showing its workings', ex);
    await shot(S, 'exposure', 'EXPOSURE — run gross, fines, and the legit pay the file cost you');
    await hook(S, 'fleetPanel', 'ladder');
    await settle(S, 10);
    const rungs = await evalJSON(S, `[...document.querySelectorAll('.fl-ladder .flr-name')].map(e => e.textContent)`);
    must(rungs.length === 6 && rungs[0] === 'SMOKE' && rungs[5] === 'THE HOUSE',
      'SMOKE → THE HOUSE, in Aaron’s order', rungs);
    await shot(S, 'room', 'THE ROOM — SMOKE, EARNER, FIXER, BROKER, QUIET PARTNER, THE HOUSE');
    await hook(S, 'fleetPanel', 'earnings');
    await settle(S, 10);
    await shot(S, 'earnings', 'EARNINGS with RUN GROSS and REGISTRATION as ordinary rows in the same sum');
    await hook(S, 'fleetPanel', 'roster');
    await settle(S, 10);
    const off = await evalJSON(S, 'document.querySelectorAll(".fld-off").length');
    must(off === 1, 'the roster marks the driver who is running', off);
    await shot(S, 'roster', 'the ROSTER with one OFF BOOK badge on it');
  } finally { await close(); }
}

// ── 4. a SUSPENDED charter ─────────────────────────────────────────────────
if (!ONLY || ONLY === 'susp') {
  console.log(`SUSPENDED ${W}x${H}`);
  const { S, close } = await session(`${base}&story=act2&shady=1&fleet=2&cogross=74000&crd=60000&dock=1`);
  try {
    await hook(S, 'setPlayerOffBook', true);
    await hook(S, 'setExposure', 0.99);
    // Drive one real run through the shipped path until the charter goes down. It is the same call
    // a delivery makes; nothing here sets `suspendUntil`.
    let sus = null;
    for (let i = 0; i < 12 && !sus; i++) {
      const r = await hook(S, 'runOnce', 700);
      if (r && r.suspended) sus = r;
    }
    must(!!sus, 'a real run took the charter over and suspended it', sus);
    await hook(S, 'closeHirePanel');
    await hook(S, 'fleetPanel', 'runs');
    await settle(S, 12);
    const banner = await evalJSON(S, '(document.querySelector(".fls-t")||{}).textContent || null');
    must(!!banner, 'the suspension banner is on the panel', banner);
    await shot(S, 'suspended', 'CHARTER SUSPENDED, with the time left and the note that the payroll is still running');
  } finally { await close(); }
}

// ── 5. the THREAD — the paid branch's door ─────────────────────────────────
//
// Run this one on its own (`--only=thread`) when the four above have already run: a fifth Chrome in
// one node process fails to come up and the symptom is `timed out waiting for window.__ready`,
// which reads like a boot break in the page and is not one. See the header — the profile dir is
// keyed on the NODE pid and every session shares it.
if (!ONLY || ONLY === 'thread') {
  console.log(`THREAD ${W}x${H}`);
  const { S, close } = await session(`${base}&story=paid&crd=60000&dock=1`);
  try {
    // Settle act one on the paid branch, which is what puts the player in act two with `dad_favour`
    // and NO contact — the state the whole thread exists to change. `__game.settle()` is the same
    // call the dock makes when the crew arrive.
    await hook(S, 'settle');
    await settle(S, 20);
    await hook(S, 'closeHirePanel');
    let th = await evalJSON(S, '__state.thread');
    const sto = await evalJSON(S, '({ stage: __state.story.stage, branch: __state.story.branch })');
    // Asserted on the STAGE and the BRANCH and not only on `door === null`: before act one is
    // settled `door` is null too, so a check that read only the door would have passed on the
    // wrong state and captured it.
    must(sto.stage === 'act2' && sto.branch === 'paid' && th && th.door === null,
      'act two on the PAID branch, and the other side is sealed', { ...sto, ...th });
    // Two remarks, through the shipped path — `remark()` bypasses only the dice and the spacing.
    await hook(S, 'remark');
    th = await hook(S, 'remark');
    must(th && th.door === 'cue', 'two remarks have landed and the thread is live', th);
    await settle(S, 20);
    // The board has to be OPEN for the RECORD tab to exist at all. `?dock=1` does not survive
    // `__game.settle()` — the crew arriving is an undock — and the first version of this capture
    // asserted the row against a board that was not on screen, which fails identically to the row
    // being missing.
    const docked = await hook(S, 'forceDock');
    must(!!docked, 'on a pad with the board open', docked);
    // ORDER IS LOAD-BEARING. The ending panel's GO ON key re-opens the hire panel — a grounded
    // player has to hire something and act two says so — so closing the hire panel first and the
    // ending panel second leaves the hire panel back on top. It cost a run to find, and the
    // symptom was the hit-test reporting `hr-row` over the key.
    await evalJSON(S, `(() => { const b = document.querySelector('#ending .hp-close'); b && b.click(); return !!b; })()`);
    await settle(S, 8);
    await hook(S, 'closeHirePanel');
    await hook(S, 'closeFleetPanel');
    // The RECORD tab, where the one row appears. It is the LAST `.dk-tab` — gates_s2d B6 holds that
    // contract, which is why this indexes from the end rather than naming a position.
    const tabs = await evalJSON(S, `(() => { const t = [...document.querySelectorAll('.dk-tab')];
      const r = t[t.length - 1]; r && r.click(); return t.map(x => x.textContent); })()`);
    must(tabs.length >= 4, 'the dock board is up and RECORD is its last tab', tabs);
    await settle(S, 12);
    // A precondition that queries the DOM is NOT a precondition about what is on screen: the first
    // version of this capture found the row in the DOM, passed, and photographed ACT ONE's ending
    // panel covering the entire board. So this hit-tests the key's own centre, which is the check
    // gates_s2d B7 uses and the one that would have caught it.
    const row = await evalJSON(S, `(() => {
      const k = document.querySelector('.dk-key.ask');
      if (!k) return { key: false, self: false, covered: null };
      k.scrollIntoView({ block: 'center' });
      const r = k.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { key: true, self: !!(hit && k.contains(hit)),
        covered: hit ? (hit.className || hit.tagName) : null,
        title: (document.querySelector('.dk-sect.cue .dk-stitle')||{}).textContent || null,
        rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] };
    })()`);
    must(row.key && row.self, 'the ASK HIM row is on the RECORD tab AND nothing is covering it', row);
    await shot(S, 'record_cue', 'A NAME KEEPS COMING UP, with ASK HIM under the sealed ladder');
    await evalJSON(S, '(document.querySelector(".dk-key.ask").click(), 1)');
    await settle(S, 12);
    const tp = await hook(S, 'threadPanel');
    must(tp && tp.open && !tp.asked, 'the thread panel is open on the DEMAND', tp);
    await shot(S, 'thread', 'THE CALL — two lines and DEMAND A NAME, the answer not yet shown');
    await evalJSON(S, '(document.querySelector(".th-key.demand").click(), 1)');
    await settle(S, 12);
    const after = await evalJSON(S, '__state.thread');
    must(after && after.door === 'asked', 'the door is open because the player pulled it', after);
    await shot(S, 'thread_answer', 'the whole exchange, ending in the Tallow Yard desk');
  } finally { await close(); }
}

console.log('\ncaptures written to shots/s2j/');
