#!/usr/bin/env node
// The arc's curtain — "buy your own craft, debt-free", the beat that closes what act one opened.
//
//   node tools/gates_end.mjs [--land] [--headed] [--w= --h=]
//
// A SEPARATE suite from `gates_s2e`, and deliberately. That one is act one's: the debt window, the
// pace signal, the escalation, the seizure, the hire loop. This is the other end of the same arc
// and it runs hours of play later, against act two's state — a company with drivers on it, a shady
// ladder that may or may not have been climbed, a hull the player paid for. Bolting it onto s2e
// would have meant re-founding all of that inside a suite whose fixtures are all pre-act-two, and
// a suite that has to be read in two halves is a suite nobody re-runs.
//
// **Every check is falsified.** Each one breaks the thing it guards and asserts the same check
// goes the other way — this project has logged twenty-odd measurements that silently measured
// nothing, and the one that matters here is the whole point of leg A2: a predicate with six
// conditions in it that returns a boolean can only ever prove that a true is true, which is why
// `ownArc` returns the UNMET conditions and why this suite knocks them out one at a time.
//
// SCHEMA NOTE: writes `{ok,fail}` AND `{results}`, for the reason gates_s2e states — a parser
// reading only one key has reported 0/0 on a fully passing suite four times on this project.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { open, parseArgs, waitFor, settle, evalJSON, hook, quiesce } from './shot.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = parseArgs();
const LAND = !!args.land;
const W = +(args.w || (LAND ? 844 : 390)), H = +(args.h || (LAND ? 390 : 844));
const OUT = resolve(ROOT, 'shots/end');
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

// The three functions the brief bans outright, spied before any story code runs. Installed on
// EVERY session and asserted on every one of them: a modal that only fires on the curtain path is
// exactly the one a spot check misses.
const MODAL_SPY = `(() => {
  window.__modals = [];
  for (const k of ['alert', 'confirm', 'prompt']) {
    window[k] = function (...a) { window.__modals.push([k, String(a[0]).slice(0, 60)]); return undefined; };
  }
  return true;
})()`;

async function session(url) {
  const s = await open({ w: W, h: H, dpr: 1, mobile: true, headed: !!args.headed });
  await s.S('Page.navigate', { url: `${s.base}${url}` });
  await waitFor(s.S, 'window.__ready', 60000);
  await settle(s.S, 30);
  await quiesce(s.S, { timeout: 60000 });
  await evalJSON(s.S, '(window.__game.clearToasts(), 1)');
  await evalJSON(s.S, MODAL_SPY);
  await settle(s.S, 6);
  return s;
}

// The panel's own text, read off the DOM rather than off the module — the module is what the check
// in leg A already reads, and a panel that renders nothing would pass that one.
const PANEL = `(() => {
  const h = document.getElementById('own');
  const p = h.querySelector('.hud-panel');
  return {
    hidden: h.classList.contains('hidden'),
    layer: h.className,
    title: (h.querySelector('.hp-title') || {}).textContent || '',
    kicker: (h.querySelector('.hp-kicker') || {}).textContent || '',
    close: (h.querySelector('.hp-close') || {}).textContent || '',
    paras: [...h.querySelectorAll('.en-p')].map(e => e.textContent),
    cells: [...h.querySelectorAll('.en-cell')].map(e => [e.querySelector('i').textContent, e.querySelector('b').textContent]),
    next: (h.querySelector('.en-next') || {}).textContent || '',
    rect: p ? (r => ({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }))(p.getBoundingClientRect()) : null,
    vh: window.innerHeight,
  };
})()`;

mkdirSync(OUT, { recursive: true });

// ═══════════════════════════════════════════════════════════════════════════
// LEG A — the predicate, in node against the pure module
// ═══════════════════════════════════════════════════════════════════════════
const Story = await import(resolve(ROOT, 'js/story.js'));
const E = await import(resolve(ROOT, 'js/economy.js'));

// A complete act-two state whose arc HAS closed. Every A-check below starts here and takes one
// thing away, so the thing taken away is the only variable.
const done = (over = {}) => ({
  story: Story.newStory({ stage: Story.STAGE.ACT2, branch: 'paid', hireSpend: 8550, hireBlocks: 6,
    ...(over.story || {}) }),
  econ: { credits: 4000, craft: Story.STARTER_HULL, borrowed: false, tier: 2, lifetime: 30000,
    flags: ['debt_cleared', 'dad_favour'], upgrades: { thrust: 0, cargo: 0, cell: 0, eff: 0 },
    ...(over.econ || {}) },
  arrears: over.arrears === undefined ? 0 : over.arrears,
});

{
  // A1 — the hull floor is the hull the player is ACTUALLY booted in, read out of save.js rather
  // than believed. A pure module cannot import save.js, so the string is copied; this is the only
  // thing that stops the copy drifting the day the starter hull changes.
  const src = readFileSync(resolve(ROOT, 'js/save.js'), 'utf8');
  const m = src.match(/^\s*craft: '([a-z]+)',/m);
  const boots = m ? m[1] : null;
  const floor = E.CRAFT[Story.STARTER_HULL].price;
  // FALSIFY: the same comparison against every OTHER hull in the table must reject.
  const wrong = Object.keys(E.CRAFT).filter(id => id !== boots);
  check('A1 the hull floor is the hull save.js boots the player in',
    boots === Story.STARTER_HULL && floor === E.CRAFT[boots].price && floor > 0
    && wrong.every(id => id !== Story.STARTER_HULL),
    `js/save.js defaults() boots \`${boots}\` · Story.STARTER_HULL is \`${Story.STARTER_HULL}\` · `
    + `floor = CRAFT.${Story.STARTER_HULL}.price = ${floor} CRD, DERIVED from the table and not `
    + `written · falsified: the other ${wrong.length} hulls (${wrong.join(' ')}) are all rejected `
    + `as the floor, so the match is not vacuous`);
}

{
  // A2 — EVERY CONDITION IS LOAD-BEARING. The positive control first, then one knock-out per
  // condition, each asserting that `need` names exactly that one. A predicate that returned true
  // for the wrong reasons would pass a boolean check and fails this.
  const base = done();
  const pos = Story.ownArc(base.story, base.econ, base.arrears);
  const arms = [
    ['act2', done({ story: { stage: Story.STAGE.DEBT } })],
    ['hire', done({ story: { hire: { craft: 'wisp', until: 999, blocks: 1, spent: 1425, took: 0 } } })],
    ['borrowed', done({ econ: { borrowed: true } })],
    ['hull', done({ econ: { craft: 'wisp' } })],
    ['arrears', done({ arrears: 42 })],
    ['done', done({ story: { own: true } })],
  ];
  const rows = arms.map(([want, st]) => {
    const r = Story.ownArc(st.story, st.econ, st.arrears);
    return { want, done: r.done, need: r.need, hit: !r.done && r.need.length === 1 && r.need[0] === want };
  });
  check('A2 every condition is load-bearing, one knock-out at a time',
    pos.done === true && pos.need.length === 0 && rows.every(r => r.hit),
    `positive control: done=${pos.done} need=[] · `
    + rows.map(r => `${r.want} removed -> done=${r.done} need=[${r.need}] ${r.hit ? 'ok' : 'MISS'}`).join(' · ')
    + ` · falsified six ways: each arm is the SAME state with one field changed, and each names only `
    + `its own condition`);
}

{
  // A3 — THE FREE HULL. `wisp` costs 0 credits and is unlocked at tier 1, so `economy.buyCraft`
  // will hand a grounded act-two player a hull for nothing — which clears `borrowed`, ends the
  // grounding, and under the naive reading of "owns a hull outright" would fire the game's climax
  // about ten seconds into act two. This asserts BOTH halves: that the hole is real, and that the
  // predicate refuses to celebrate it.
  const st = done({ econ: { craft: 'wisp' } });
  const naive = st.econ.borrowed === false && !st.story.hire && st.story.stage === Story.STAGE.ACT2;
  const r = Story.ownArc(st.story, st.econ, 0);
  const free = E.CRAFT.wisp.price === 0 && E.unlockedCraft(1).includes('wisp');
  const paid = Story.ownArc(done().story, done().econ, 0);
  check('A3 a free wisp satisfies the naive reading and is refused',
    free && naive === true && r.done === false && r.need.join() === 'hull' && paid.done === true,
    `CRAFT.wisp.price = ${E.CRAFT.wisp.price} and it is unlocked at tier 1, so the free hull is `
    + `genuinely buyable · the naive reading (act two + not borrowed + no hire) is ${naive} on it · `
    + `ownArc says done=${r.done} need=[${r.need}] · falsified by the ${Story.STARTER_HULL} arm, `
    + `which is the same state with a ${E.CRAFT[Story.STARTER_HULL].price} CRD hull and reads `
    + `done=${paid.done}`);
}

{
  // A4 — arrears hold it and RELEASE it. The direction matters as much as the block: a condition
  // that can never clear is a curtain that never falls, and DECISIONS 6 says there is no fail
  // state. `payWages` pays back pay before it pays anybody new, so arrears clear themselves.
  const owed = Story.ownArc(done().story, done().econ, 120);
  const clear = Story.ownArc(done().story, done().econ, 0);
  const eps = [0.4, 0.6].map(a => Story.ownArc(done().story, done().econ, a).done);
  check('A4 money owed to a person holds the curtain, and clearing it opens it',
    owed.done === false && owed.need.join() === 'arrears' && clear.done === true
    && eps[0] === true && eps[1] === false,
    `120 CRD of unpaid wages -> done=${owed.done} need=[${owed.need}] · 0 -> done=${clear.done} · `
    + `the sub-credit slack is real and bounded: 0.4 -> ${eps[0]}, 0.6 -> ${eps[1]} · falsified by `
    + `the cleared arm, which is the same call with one argument moved`);
}

{
  // A5 — ONCE. And the latch has to be the reason, not luck: the second call must refuse for the
  // reason 'done' and not for some other condition that happened to change.
  const st = done();
  const first = Story.closeArc(st.story, st.econ, 0);
  const latch = st.story.own;
  const second = Story.closeArc(st.story, st.econ, 0);
  const why = Story.ownArc(st.story, st.econ, 0);
  // FALSIFY: the same state with the latch cleared fires again, so the refusal IS the latch.
  st.story.own = false;
  const again = Story.closeArc(st.story, st.econ, 0);
  check('A5 it fires exactly once, and the latch is why',
    !!first && latch === true && second === null && why.need.join() === 'done' && !!again,
    `first call -> ${first ? `${first.branch} / "${first.title}"` : 'null'} · latch story.own=${latch} · `
    + `second call -> ${second} (need=[${why.need}]) · falsified: clearing the latch on the same `
    + `state fires it again (-> ${again ? again.title : 'null'}), so nothing else was refusing it`);
}

{
  // A6 — the save. `story` is in save.js's REPLACE set, so a field added to the story object is
  // carried whole and needs no defaults() entry; what still has to be checked is that toSave WRITES
  // it and fromSave READS it, and that a profile from before this beat existed reads `false`
  // rather than `undefined` — a player who is already there gets the beat, rather than losing it.
  const st = done();
  Story.closeArc(st.story, st.econ, 0);
  const wire = Story.toSave(st.story, 0);
  const back = Story.fromSave(wire, 0);
  const old = Story.fromSave({ stage: 'act2', branch: 'paid' }, 0);
  // FALSIFY: a profile that says false must come back false, or `own` is being defaulted true.
  const no = Story.fromSave({ ...wire, own: false }, 0);
  const src = readFileSync(resolve(ROOT, 'js/save.js'), 'utf8');
  const replaces = /REPLACE = new Set\(\[[^\]]*'story'/.test(src);
  check('A6 the latch persists, and an older profile is not silently retired',
    wire.own === true && back.own === true && old.own === false && no.own === false && replaces,
    `toSave wrote own=${wire.own} · fromSave read own=${back.own} · a profile written before this `
    + `beat existed (no key at all) reads own=${old.own}, so it fires on their next dock · `
    + `save.js REPLACEs the whole \`story\` key (${replaces}), so no defaults() entry is needed and `
    + `merge() cannot walk it · falsified by the explicit-false profile, which reads ${no.own}`);
}

{
  // A7 — the two roads arrive at the same fact and say different things about it.
  const p = Story.closeArc(done({ story: { branch: 'paid' } }).story, done().econ, 0);
  const s = Story.closeArc(done({ story: { branch: 'seized' } }).story,
    done({ econ: { flags: ['car_seized', 'crew_hook'] } }).econ, 0);
  check('A7 both branches close the arc, and they do not read the same',
    p.branch === 'paid' && s.branch === 'seized' && p.title !== s.title && p.kicker === s.kicker
    && p.flags.join() !== s.flags.join(),
    `paid   "${p.kicker}" / "${p.title}" / record ${JSON.stringify(p.flags)}\n`
    + `seized "${s.kicker}" / "${s.title}" / record ${JSON.stringify(s.flags)} · the kicker is `
    + `shared on purpose (it is the one fact both roads reach) and everything else differs · `
    + `falsified by the titles and the records, which are compared for INEQUALITY`);
}

// ═══════════════════════════════════════════════════════════════════════════
// LEG B — the browser: reaching it for real, on both branches
// ═══════════════════════════════════════════════════════════════════════════

// Act one, settled at a dock, exactly as a player reaches it. Returns the state after the ending
// panel is dismissed.
async function throughActOne(S, branch) {
  await hook(S, 'forceDock', 0);
  await settle(S, 12);
  const end = await evalJSON(S, '({branch:__state.story.branch, stage:__state.story.stage, ending:__state.ending.open})');
  if (end.branch !== branch) throw new Error(`act one settled as ${end.branch}, wanted ${branch}`);
  await hook(S, 'closeHirePanel');
  await hook(S, 'closeEnding');
  await settle(S, 8);
  return end;
}

for (const [branch, crd] of [['paid', 62000], ['seized', 4000]]) {
  const s = await session(`/index.html?nosave=1&intro=0&story=${branch}&crd=${crd}&tier=2`);
  const { S, close } = s;
  await throughActOne(S, branch);

  // Grounded, on hires, nothing owned — the state every player is in for the whole of act two.
  const before = await evalJSON(S, '({arc:window.__game.arcCheck(), panel:window.__game.ownState()})');

  // B1 — THE FREE HULL, IN THE REAL GAME. `wisp` lists at 0 and unlocks at tier 1, so the shop USED
  // to hand it over: `borrowed` cleared, the grounding ended, and the player skipped the hire loop
  // the whole game is built on for nothing. S2-P took the starter hull off the lot, so this arm now
  // asserts BOTH defences at once and they are independent: the shop refuses the sale, AND — the
  // reason A3 still exists — the arc predicate would refuse to celebrate it even if the sale went
  // through. Two locks on one door, because the first is an economy rule that a later phase could
  // reasonably want to change.
  await hook(S, 'buyCraft', E.STARTER_HULL);
  await settle(S, 20);
  const onWisp = await evalJSON(S, `({arc:window.__game.arcCheck(), panel:window.__game.ownState(),
    credits:__state.credits, borrowed:__state.borrowed, grounded:__state.story.grounded,
    craft:__game.economy.craft, hidden:document.getElementById('own').classList.contains('hidden')})`);

  // …and now the hull that is actually the arc.
  const spend = await evalJSON(S, '__state.credits');
  await hook(S, 'grantCredits', 40000);
  await hook(S, 'buyCraft', Story.STARTER_HULL);
  await settle(S, 20);
  const after = await evalJSON(S, `({arc:window.__game.arcCheck(), panel:window.__game.ownState(),
    stage:__state.story.stage, grounded:__state.story.grounded, hire:__state.story.hire,
    borrowed:__state.borrowed, credits:__state.credits})`);
  const panel = await evalJSON(S, PANEL);

  check(`B1 ${branch}: the free hull is not for sale, and the bought hull closes the arc`,
    onWisp.borrowed === true && onWisp.craft !== E.STARTER_HULL
    && onWisp.arc.done === false && onWisp.panel.open === false && onWisp.hidden === true
    && after.arc.done === false && after.arc.need.join() === 'done'
    && after.panel.open === true && after.stage === 'act2' && panel.hidden === false,
    `act two opens grounded: need=[${before.arc.need}] panel open ${before.panel.open}\n`
    + `asked the shop for the FREE ${E.STARTER_HULL} (0 CRD, ${spend} in the account): still on a `
    + `borrowed ${onWisp.craft}, borrowed=${onWisp.borrowed} — the sale was refused, so the naive `
    + `reading is never even reachable through the game; curtain shut, #own hidden ${onWisp.hidden}\n`
    + `bought a ${Story.STARTER_HULL}: panel open ${after.panel.open}, \"${panel.title}\", stage `
    + `${after.stage}\n`
    + `the two locks are independent: this arm is the SHOP refusing, A3 is the arc PREDICATE `
    + `refusing the same state built directly, so neither is the other's control`);

  // B2 — what the panel actually SAYS, per branch. Read off the DOM, because leg A already read
  // the module and a panel that rendered nothing at all would pass that.
  const shady = await evalJSON(S, 'window.__game.thread()');
  check(`B2 ${branch}: the panel reads for this branch, and names the shady side`,
    panel.kicker === 'ACT TWO' && panel.title === Story.OWN[branch].title
    && panel.paras.length >= 5 && panel.close === 'FLY'
    && panel.cells.some(c => c[0] === 'THE METER' && c[1] === 'off')
    && panel.cells.some(c => c[0] === 'SPENT ON HIRE')
    && /Nothing closes here/.test(panel.next)
    && (branch === 'paid'
      ? /manifest/.test(panel.paras.join(' ')) && /warranty/.test(panel.paras.join(' '))
      : /Tallow Yard/.test(panel.paras.join(' ')) && /crew/.test(panel.paras.join(' '))),
    `kicker "${panel.kicker}" title "${panel.title}" close "${panel.close}"\n`
    + panel.paras.map((t, i) => `  p${i + 1} ${t}`).join('\n') + '\n'
    + `  cells ${JSON.stringify(panel.cells)}\n  next ${panel.next}\n`
    + `  shady door ${shady.door} gross ${shady.shadyGross} · falsified by the other branch, which `
    + `is the same panel class asserted against different text in the same run`);

  // B3 — IT IS NOT AN ENDING. Close it and play: undock, take a job, fly it, get paid. Everything
  // the game had before the curtain it still has after it.
  await evalJSON(S, `(() => { const b = document.querySelector('#own .hp-close');
    const r = b.getBoundingClientRect();
    const t = new Touch({ identifier: 7, target: b, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 });
    b.dispatchEvent(new TouchEvent('touchend', { bubbles: true, cancelable: true, changedTouches: [t], touches: [] }));
    b.click();
    return true; })()`);
  await settle(S, 10);
  const shut = await evalJSON(S, `({panel:window.__game.ownState(), hidden:document.getElementById('own').classList.contains('hidden')})`);
  // The board is emptied by UNDOCK, so the job comes off it first. Any acceptable row will do —
  // this asserts the board still works, not which job it offered.
  const took = await evalJSON(S, `(() => { for (let i = 0; i < 8; i++) {
    window.__game.accept(i);
    if (__game.economy.cargo.length) return { i, cargo: __game.economy.cargo.length, board: __state.board };
  } return { i: -1, cargo: 0, board: __state.board }; })()`);
  const undocked = await evalJSON(S, '(window.__game.undock(), {dock:__state.dock})');
  await settle(S, 20);
  const paidBefore = await evalJSON(S, '__state.credits');
  await evalJSON(S, 'JSON.stringify(window.__game.completeJob())');
  await settle(S, 20);
  const played = await evalJSON(S, `({credits:__state.credits, delivered:__game.economy.stats.delivered,
    stage:__state.story.stage, own:__state.own.latch, ready:window.__ready,
    hirePanel:!!window.__game.openHire('extend'), thread:!!window.__game.thread()})`);
  await hook(S, 'closeHire');
  check(`B3 ${branch}: the curtain is not a stop — the game plays on afterwards`,
    shut.panel.open === false && shut.hidden === true && undocked.dock === null
    && took.cargo > 0 && played.credits > paidBefore && played.delivered > 0 && played.thread === true
    && played.stage === 'act2' && played.own === true && played.ready === true
    && played.hirePanel === true,
    `a real touch on FLY closed it (open ${shut.panel.open}, #own hidden ${shut.hidden}) · UNDOCK `
    + `left the pad: dock ${JSON.stringify(undocked.dock)} (it must be null — a player who OWNS a `
    + `hull is not grounded, and \`Story.grounded\` returned true for them until this phase, which `
    + `made UNDOCK refuse and re-open the hire panel on a craft they had just bought) · took a job `
    + `off the board (${took.cargo} parcel(s) from `
    + `${took.board}) and delivered it: ${paidBefore} -> ${played.credits} CRD, `
    + `${played.delivered} delivered · stage still ${played.stage}, latch still ${played.own}, the `
    + `hire panel still opens (${played.hirePanel}) · falsified by the panel-open reading taken `
    + `before the press, and by the balance, which is compared for INCREASE`);

  const modals = await evalJSON(S, 'window.__modals');
  const spyWorks = await evalJSON(S, '(window.alert("probe"), window.__modals.length)');
  check(`B3b ${branch}: no modal anywhere on the curtain path, and the spy can see one`,
    Array.isArray(modals) && modals.length === 0 && spyWorks === 1,
    `alert/confirm/prompt spied from before the first story frame; through act one's settlement, `
    + `the free hull, the purchase, the panel and a delivery afterwards they recorded `
    + `${JSON.stringify(modals)} · falsified in place: one deliberate alert() straight afterwards `
    + `was counted (${spyWorks}), so the zero above is a measurement and not a broken spy`);
  await close();
}

// ── C: arrears in the live game ────────────────────────────────────────────
{
  // The one condition leg A can prove and a normal play-through cannot reach: a fleet the player
  // cannot make payroll on. Both halves are asserted on ONE page — the curtain held shut with the
  // hull already bought, and the same curtain falling the moment the drivers are square.
  const s = await session(`/index.html?nosave=1&intro=0&story=seized&crd=4000&tier=2&fleet=1`);
  const { S, close } = s;
  await throughActOne(S, 'seized');

  // Out of the dock on a hire, so the purchase below happens in the AIR and the curtain's own
  // dock rule is not what is holding it. Then buy the hull, then empty the account.
  await hook(S, 'grantCredits', 40000);
  await hook(S, 'hire', 'wisp', 2);
  await evalJSON(S, '(window.__game.undock(), 1)');
  await settle(S, 10);
  await hook(S, 'buyCraft', Story.STARTER_HULL);
  await settle(S, 10);
  const air = await evalJSON(S, '({arc:window.__game.arcCheck(), dock:__state.dock, panel:window.__game.ownState()})');
  await hook(S, 'setCredits', 0);
  await settle(S, 120);
  const owing = await evalJSON(S, `({arc:window.__game.arcCheck(), arrears:__state.company.arrears,
    drivers:__state.company.count, credits:__state.credits})`);
  await hook(S, 'forceDock', 0);
  await settle(S, 12);
  const held = await evalJSON(S, `({arc:window.__game.arcCheck(), panel:window.__game.ownState(),
    dock:!!__state.dock, hidden:document.getElementById('own').classList.contains('hidden')})`);
  // Square the drivers. `payWages` clears back pay before it pays anybody new, so this needs no
  // hook of its own — the shipped payroll does it.
  await hook(S, 'grantCredits', 30000);
  await settle(S, 40);
  const paid = await evalJSON(S, `({arc:window.__game.arcCheck(), panel:window.__game.ownState(),
    arrears:__state.company.arrears})`);
  const modals = await evalJSON(S, 'window.__modals');
  check('C1 wages owed hold the curtain shut, and paying them opens it',
    air.dock === null && air.arc.done === true && air.panel.open === false
    && owing.arrears > 0 && owing.arc.need.join() === 'arrears'
    && held.dock === true && held.panel.open === false && held.hidden === true
    && held.arc.need.join() === 'arrears'
    && paid.arrears === 0 && paid.panel.open === true && paid.arc.need.join() === 'done'
    && Array.isArray(modals) && modals.length === 0,
    `hull bought in the AIR: arc complete (${air.arc.done}) and the panel stayed shut because there `
    + `was no dock — need=[${air.arc.need}]\n`
    + `account emptied with ${owing.drivers} driver(s) on the books: ${owing.arrears} CRD of `
    + `arrears, need=[${owing.arc.need}]\n`
    + `then DOCKED, which is the frame the curtain would otherwise fall on: docked ${held.dock}, `
    + `panel open ${held.panel.open}, #own hidden ${held.hidden}, need=[${held.arc.need}]\n`
    + `then paid the fleet through the shipped payroll: arrears ${paid.arrears}, panel open `
    + `${paid.panel.open}, need=[${paid.arc.need}] · falsified by the docked-and-held reading, `
    + `which is the same dock one payroll earlier · modals ${JSON.stringify(modals)}`);
  await close();
}

// ── D: the shady ladder is acknowledged ────────────────────────────────────
{
  // A player who is a BROKER when they buy their hull has had a different game from one who never
  // opened the door. Three states, not two — never opened / opened and never used / climbed — and
  // this arm is the third, against the second which the seized run above already photographed.
  const s = await session(`/index.html?nosave=1&intro=0&story=seized&crd=4000&tier=2&fleet=1&shady=1`);
  const { S, close } = s;
  await throughActOne(S, 'seized');
  // Off-book gross, set on the live ledger. It is the shady ladder's own axis (`groupShady`) and
  // nothing else reads it, so this moves one quantity — the rung — and not the player's money.
  const BROKER = 130000;
  const set = await evalJSON(S, `(() => { window.__game.company.shadyGross = ${BROKER};
    return { gross: window.__game.company.shadyGross, door: window.__game.thread().door }; })()`);
  await hook(S, 'grantCredits', 40000);
  await hook(S, 'buyCraft', Story.STARTER_HULL);
  await settle(S, 20);
  const panel = await evalJSON(S, PANEL);
  const text = panel.paras.join(' ');
  const cell = panel.cells.find(c => c[0] === 'OFF THE BOOKS');
  const modals = await evalJSON(S, 'window.__modals');
  check('D1 the beat knows how far up the shady ladder the player went',
    set.gross === BROKER && /BROKER/.test(text) && !/never used it/.test(text)
    && !!cell && /BROKER/.test(cell[1])
    && Array.isArray(modals) && modals.length === 0,
    `door ${set.door}, off-book gross ${set.gross} CRD (SHADY_TIERS puts BROKER at 120 000)\n`
    + `  the line: ${panel.paras[panel.paras.length - 1]}\n`
    + `  the cell: ${JSON.stringify(cell)}\n`
    + `falsified by the seized run above, which is the SAME panel with the same door open at 0 CRD `
    + `off the books and prints "…has been open to you the whole time and you have never used it" `
    + `instead — asserted here as an ABSENCE (${!/never used it/.test(text)}) so the two arms `
    + `cannot both be passing on the same string`);
  await close();
}

// ── E: it survives a reload ────────────────────────────────────────────────
{
  // WITHOUT ?nosave, and without ?story= — that flag is re-applied on every boot and would replay
  // act one on the second one, which would look exactly like a latch that had not persisted. So
  // this reaches the settlement through the shipped hooks and then reloads the same URL.
  const URL = '/index.html?intro=0&crd=62000&tier=2';
  const s = await session(URL);
  const { S, close } = s;
  await hook(S, 'setStoryTime', 84 * 60);
  await hook(S, 'setDue', true);
  await throughActOne(S, 'paid');
  await hook(S, 'buyCraft', Story.STARTER_HULL);
  await settle(S, 20);
  const first = await evalJSON(S, `({panel:window.__game.ownState(), arc:window.__game.arcCheck(),
    stage:__state.story.stage, craft:__game.economy.craft})`);
  await hook(S, 'closeOwn');
  // save() debounces 2 s; give it real wall time and then read what is actually on disk.
  await settle(S, 200);
  const stored = await evalJSON(S, `(() => { const raw = localStorage.getItem('neonhaul.save.v1');
    if (!raw) return null; const p = JSON.parse(raw);
    return { own: p.story ? p.story.own : null, stage: p.story ? p.story.stage : null, craft: p.craft }; })()`);

  await s.S('Page.navigate', { url: `${s.base}${URL}` });
  await waitFor(S, 'window.__ready', 60000);
  await settle(S, 30);
  await quiesce(S, { timeout: 60000 });
  await evalJSON(S, MODAL_SPY);
  await hook(S, 'forceDock', 0);
  await settle(S, 20);
  const second = await evalJSON(S, `({panel:window.__game.ownState(), arc:window.__game.arcCheck(),
    stage:__state.story.stage, craft:__game.economy.craft,
    hidden:document.getElementById('own').classList.contains('hidden'), opens:__state.own.opens})`);
  const modals = await evalJSON(S, 'window.__modals');
  check('E1 the latch survives a reload and the beat does not play twice',
    first.panel.open === true && stored && stored.own === true && stored.stage === 'act2'
    && second.stage === 'act2' && second.panel.latch === true && second.panel.open === false
    && second.hidden === true && second.opens === 0 && second.arc.need.join() === 'done'
    && Array.isArray(modals) && modals.length === 0,
    `first boot: the arc closed (panel open ${first.panel.open}) on a ${first.craft} · what is `
    + `actually on disk under neonhaul.save.v1: ${JSON.stringify(stored)}\n`
    + `after a real reload of the same URL and a dock: stage ${second.stage}, latch `
    + `${second.panel.latch}, panel open ${second.panel.open}, #own hidden ${second.hidden}, opens `
    + `this session ${second.opens}, need=[${second.arc.need}] · falsified by \`opens\`, which counts `
    + `shows on THIS page and would be 1 if it had replayed — it was 1 on the first boot`);
  await close();
}

// ── F: it fits on the screen ───────────────────────────────────────────────
{
  // The lesson style.css already paid for: on a short landscape viewport the act-one ending had
  // GO ON below the fold — the PRIMARY ACTION off screen. #own is a fourth host under that rule
  // and it is the one nobody would think to re-check.
  const s = await session(`/index.html?nosave=1&intro=0&story=seized&crd=4000&tier=2`);
  const { S, close } = s;
  await throughActOne(S, 'seized');
  await hook(S, 'grantCredits', 40000);
  await hook(S, 'buyCraft', Story.STARTER_HULL);
  await settle(S, 20);
  const p = await evalJSON(S, PANEL);
  const btn = await evalJSON(S, `(() => { const b = document.querySelector('#own .hp-close');
    const r = b.getBoundingClientRect();
    return { top: Math.round(r.y), bottom: Math.round(r.bottom), vh: window.innerHeight,
      hit: (document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) || {}).className || null }; })()`);
  check(`F1 the panel and its way out are on screen at ${W}x${H}`,
    p.rect.y >= 0 && p.rect.y + p.rect.h <= p.vh + 1 && btn.bottom <= btn.vh
    && /hp-close/.test(String(btn.hit)),
    `panel ${p.rect.w}x${p.rect.h} at y ${p.rect.y}, viewport ${p.vh} px tall · the FLY key runs `
    + `${btn.top}-${btn.bottom} px and the topmost element at its centre is "${btn.hit}" · `
    + `falsified by the arithmetic itself: the bound is the viewport height, so a panel one pixel `
    + `taller than the screen fails it`);
  await close();
}

console.log(`\n${ok.length}/${ok.length + fail.length} gates green${fail.length ? '  FAILED: ' + fail.join(', ') : ''}`);
process.exit(fail.length ? 1 : 0);
