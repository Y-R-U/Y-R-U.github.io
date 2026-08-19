#!/usr/bin/env node
// S2-D's gates — the screen idiom, the two rank ladders and the holo-panel legibility fix.
//
//   node tools/gates_s2d.mjs [--land] [--headed] [--w= --h=]
//
// **Every check here is falsified.** Not "written so it could fail" — each one breaks the thing it
// guards and asserts the same check goes the other way. This project has logged twenty-two
// measurements that silently measured nothing and three of them landed in this run alone.
//
// Two rules inherited from the suites before it: results are written to disk AS EACH CHECK
// COMPLETES, never batched, because agents here have been killed mid-suite; and no isolation is
// `&&`-guarded — every hook goes through `hook()`, which THROWS when it is missing rather than
// resolving quietly to undefined.
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
const OUT = resolve(ROOT, 'shots/s2d');
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

async function shot(S, name) {
  const { data } = await S('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(resolve(OUT, `${name}.png`), Buffer.from(data, 'base64'));
  return `shots/s2d/${name}.png`;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const { S, base, close } = await open({ w: W, h: H, dpr: 1, mobile: true, headed: !!args.headed });
  await S('Page.navigate', { url: `${base}/index.html?nosave=1&crd=9000&tier=4` });
  await waitFor(S, 'window.__ready', 60000);
  await settle(S, 30);
  await quiesce(S, { timeout: 60000 });
  // The boot hint is an 8 s toast and it both covers the header and steals `--toast-h` px of the
  // sheet. Every geometric check below would otherwise be measuring the hint.
  await evalJSON(S, '(window.__game.clearToasts(), 1)');
  await settle(S, 6);

  // ═══ A — the ladders ════════════════════════════════════════════════════

  // A1. The licence names hang on economy.js's LADDER. Nothing is restated.
  const sync = await evalJSON(S, `(() => {
    const R = __game.Ranks, E = __game.economyModule;
    const rows = E.LADDER.map((r, i) => ({ tier: r.tier, want: r.lifetime,
      got: R.COURIER_RANKS[i] ? R.COURIER_RANKS[i].lifetime : null,
      name: R.COURIER_RANKS[i] ? R.COURIER_RANKS[i].name : null }));
    // the FALSIFICATION runs the same predicate over a deliberately corrupted copy
    const pred = list => list.every(r => r.got === r.want && typeof r.name === 'string' && r.name.length > 2);
    const bad = rows.map((r, i) => (i === 2 ? { ...r, got: r.want + 1 } : r));
    return { rows, live: pred(rows), corrupt: pred(bad), sync: R.LADDER_SYNC,
      reserved: R.COURIER_RANKS.filter(r => r.opens).map(r => r.name),
      reachable: R.courierRank(99).name };
  })()`);
  check('S2-D/A1 FALSIFIED — the six licence names hang on economy.js LADDER, and the two company-layer names can never be reached',
    sync.live && !sync.corrupt && sync.sync === true
      && sync.reserved.join('|') === 'LANE MARSHAL|SPIRE HAULIER'
      && sync.reachable === 'HAULMASTER',
    sync.rows.map(r => `  tier ${r.tier}  ${String(r.name).padEnd(15)} threshold ${r.got} (LADDER says ${r.want})`).join('\n')
    + `\nLADDER_SYNC ${sync.sync} — every live tier got a name, so a seventh LADDER row could not show up as "TIER 7"\n`
    + `reserved for the company layer: ${sync.reserved.join(' → ')}, with no threshold\n`
    + `courierRank(99) returns ${sync.reachable} — a reserved name is unreachable by construction, not by luck\n`
    + `FALSIFIED: the same predicate over a copy with tier 3's threshold moved by 1 returns ${sync.corrupt}`);

  // A2. The two ladders are INDEPENDENT. Earn, and only the licence moves; spend the same money on
  // a hull, and only standing moves. If standing were a second reading of lifetime — which is what
  // it would be if assets counted at list price — these two states would be identical.
  const indep = await evalJSON(S, `(() => {
    const g = __game;
    const snap = () => { const r = g.ranks(); return { lic: r.licence.name, tier: r.licence.tier,
      std: r.standing.name, rung: r.standing.rung, worth: r.worth, lifetime: r.licence.at }; };
    const a = snap();
    g.grantCredits(60000);                 // pure income: lifetime up, net worth up
    const b = snap();
    // A hull the licence ACTUALLY allows at this tier. The first version bought a mammoth, which
    // is tier 6, and the shop correctly refused — so "spending moved nothing" was the gate buying
    // nothing, not the economy failing to notice. Assert the purchase landed rather than assuming.
    const bought = g.buyCraft('nocturne');   // pure capital spend: lifetime UNCHANGED, worth down
    const c = snap();
    return { a, b, c, bought: bought && bought.note, craft: g.economy.craft };
  })()`);
  if (indep.craft !== 'nocturne') throw new Error(`A2's purchase did not happen (craft ${indep.craft}, `
    + `note "${indep.bought}") — the check would be measuring nothing`);
  const earnMovedLic = indep.b.tier > indep.a.tier;
  const buyMovedNothingLic = indep.c.tier === indep.b.tier && indep.c.lifetime === indep.b.lifetime;
  const buyDroppedWorth = indep.c.worth < indep.b.worth;
  check('S2-D/A2 FALSIFIED — the two ladders move independently: earning moves the licence, spending moves standing and not the licence',
    earnMovedLic && buyMovedNothingLic && buyDroppedWorth && indep.c.rung <= indep.b.rung,
    `start      licence ${indep.a.lic} (tier ${indep.a.tier})  ·  standing ${indep.a.std} (rung ${indep.a.rung})  ·  worth ${indep.a.worth}\n`
    + `+60 000    licence ${indep.b.lic} (tier ${indep.b.tier})  ·  standing ${indep.b.std} (rung ${indep.b.rung})  ·  worth ${indep.b.worth}\n`
    + `buy hull   licence ${indep.c.lic} (tier ${indep.c.tier})  ·  standing ${indep.c.std} (rung ${indep.c.rung})  ·  worth ${indep.c.worth}\n`
    + `The hull purchase left lifetime at ${indep.c.lifetime} and moved net worth by `
    + `${indep.c.worth - indep.b.worth}. FALSIFICATION IS THE THIRD LINE ITSELF: if standing read `
    + `lifetime, or if assets counted at list, that row would be identical to the one above it and `
    + `this check would fail on \`buyDroppedWorth\` (${buyDroppedWorth})`);

  // A3. The story-flag axis. The registry is EMPTY by design — S2-E owns the entries — so the
  // mechanism is proved by installing a fixture flag in the LIVE registry, not in a copy of it.
  const flags = await evalJSON(S, `(() => {
    const g = __game, R = g.Ranks;
    const before = g.setFlags(['s2d_fixture']).standing;     // registry empty → no effect
    R.STANDING_FLAGS.s2d_fixture = 2;
    const after = g.setFlags(['s2d_fixture']).standing;
    R.STANDING_FLAGS.s2d_fixture = -1;
    const down = g.setFlags(['s2d_fixture']).standing;
    delete R.STANDING_FLAGS.s2d_fixture;
    const back = g.setFlags([]).standing;
    return { registryEmpty: Object.keys(R.STANDING_FLAGS).length,
      before: before.rung, after: after.rung, down: down.rung, back: back.rung,
      names: [before.name, after.name, down.name, back.name] };
  })()`);
  check('S2-D/A3 FALSIFIED — standing has a second, story-driven axis, and it moves in both directions',
    // `registryEmpty === 0` was S2-D's assertion that the registry SHIPPED empty. S2-E owns the
    // story and has filled it, so the assertion is now the opposite one: the four story flags are
    // present, and an unknown flag still moves nothing — which is the property the empty check was
    // really protecting.
    flags.before === flags.back && flags.after === flags.before + 2 && flags.down === flags.before - 1
      && flags.registryEmpty === 4,
    `an unknown flag moves nothing: rung ${flags.before} (${flags.names[0]})\n`
    + `a fixture worth +2 rungs installed in the LIVE registry: rung ${flags.after} (${flags.names[1]})\n`
    + `the same fixture at -1: rung ${flags.down} (${flags.names[2]}) — it goes DOWN as well as up, which a `
    + `check that only asserted "it changed" would not have caught\n`
    + `removed again: rung ${flags.back} (${flags.names[3]})\n`
    + `STANDING_FLAGS carries ${flags.registryEmpty} entries — S2-E's four story flags `
    + `(debt_cleared +1, dad_favour +1, car_seized -1, crew_hook 0). They landed on the path this `
    + `gate had already run with a fixture, which is what the empty registry was for`);

  // A4. A BORROWED hull is not an asset. S2-E opens the game in a hull that belongs to the
  // player's parents; at recovery value a nocturne would boot a brand-new player in at NAMEHOLDER.
  const borrowed = await evalJSON(S, `(() => {
    const g = __game, R = g.Ranks, ec = g.economy;
    ec.craft = 'nocturne'; ec.upgrades = { thrust: 0, cargo: 0, cell: 0, eff: 0 };
    // S2-E made borrowed:true the DEFAULT - the player opens the game in their parents' hull - so
    // the "owned" arm has to clear it explicitly. Without this line both arms measured a borrowed
    // hull, both read 0, and the check failed on its own premise rather than on the code.
    // (No backticks in here: this whole block is inside a template literal.)
    delete ec.borrowed;
    const owned = { worth: R.netWorth(ec), assets: R.assetValue(ec), rung: R.standingRank(R.netWorth(ec)).rung };
    ec.borrowed = true;
    const lent = { worth: R.netWorth(ec), assets: R.assetValue(ec), rung: R.standingRank(R.netWorth(ec)).rung };
    delete ec.borrowed;
    const restored = R.assetValue(ec);
    return { owned, lent, restored, price: g.economyModule.CRAFT.nocturne.price, recovery: R.ASSET_RECOVERY };
  })()`);
  check('S2-D/A4 FALSIFIED — a borrowed hull carries no net worth, and clearing the flag gives it back',
    borrowed.owned.assets === Math.round(borrowed.price * borrowed.recovery)
      && borrowed.lent.assets === 0 && borrowed.restored === borrowed.owned.assets
      && borrowed.lent.worth < borrowed.owned.worth,
    `a nocturne the player OWNS: assets ${borrowed.owned.assets} (${borrowed.price} at ${borrowed.recovery}), `
    + `net worth ${borrowed.owned.worth}, standing rung ${borrowed.owned.rung}\n`
    + `the same hull BORROWED: assets ${borrowed.lent.assets}, net worth ${borrowed.lent.worth}, rung ${borrowed.lent.rung}\n`
    + `FALSIFIED: clearing the flag restores the asset to ${borrowed.restored}. Without this, S2-E's opening — a `
    + `borrowed hull above the player's licence tier — would hand a brand-new player ${borrowed.owned.assets} `
    + `CRD of net worth and boot them in several rungs up the ladder they are supposed to climb`);

  // ═══ B — the screens ════════════════════════════════════════════════════

  await evalJSON(S, '(__game.grantCredits(0), 1)');
  const docked = await hook(S, 'forceDock');
  await settle(S, 20);
  await evalJSON(S, '(window.__game.clearToasts(), 1)');
  await settle(S, 6);

  // B1. NOTHING IS ROUNDED. Rule 2 of the idiom, measured over every element in the live sheet.
  const round = await evalJSON(S, `(() => {
    const sheet = document.querySelector('.dk-sheet');
    const all = [sheet, ...sheet.querySelectorAll('*')];
    const sweep = () => all.filter(e => {
      const cs = getComputedStyle(e);
      return ['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomLeftRadius', 'borderBottomRightRadius']
        .some(k => parseFloat(cs[k]) > 0);
    }).map(e => (e.className && String(e.className).split(' ')[0]) || e.tagName);
    const clean = sweep();
    const victim = sheet.querySelector('.dk-accept') || sheet.querySelector('.dk-tab');
    victim.style.borderRadius = '6px';
    const dirty = sweep();
    victim.style.borderRadius = '';
    return { n: all.length, clean, dirty };
  })()`);
  check('S2-D/B1 FALSIFIED — nothing on the board is a rounded rectangle, and the sweep catches one that is',
    round.clean.length === 0 && round.dirty.length === 1,
    `${round.n} elements in the live sheet, ${round.clean.length} with a non-zero border radius\n`
    + `FALSIFIED: giving one button a 6 px radius makes the same sweep report ${JSON.stringify(round.dirty)}\n`
    + `Corners are cut with clip-path instead. A machined corner is the strongest single signal that a `
    + `surface is a device and not a document, which is what "it looks fine if it was a web form" was about`);

  // B2. THE SHEET IS A WINDOW, NOT A FILL — and this is the corrected version of a check that first
  // claimed more than was true. §7.3 puts a static blurred still of the city UNDER the board (a
  // 96 px capture taken in the rAF callback at the moment you dock, upscaled — the upscale is the
  // blur), so the board does not transmit LIVE frames and never did. It transmits that still, which
  // is the same picture, because the craft is parked while the board is open. The measurement is
  // therefore: swap what is behind the glass and require the interior to change; then make the
  // glass opaque and require the identical swap to make no difference at all.
  const sheetBox = await evalJSON(S, `(() => {
    const r = document.querySelector('.dk-sheet').getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  })()`);
  const MAGENTA = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="#ff00c8"/></svg>');
  const GREEN = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="#00ff40"/></svg>');
  const behind = async url => {
    await evalJSON(S, `(document.querySelector('.dk-sheet').style.backgroundImage = 'url("' + ${JSON.stringify(url)} + '")', 1)`);
    await settle(S, 4);
    const { data } = await S('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false,
      clip: { x: sheetBox.x + 10, y: sheetBox.y + 120, width: Math.max(8, sheetBox.w - 20),
        height: Math.max(8, Math.min(240, sheetBox.h - 200)), scale: 1 } });
    return Buffer.from(data, 'base64');
  };
  const bM = await behind(MAGENTA);
  const bG = await behind(GREEN);
  const transmits = !bM.equals(bG);
  // FALSIFICATION — put the shipped opacity back (an opaque fill over the still) and require the
  // same swap to become invisible.
  await evalJSON(S, `(() => { const st = document.createElement('style'); st.id = 's2d-opaque';
    st.textContent = '.dk-sheet::after{background:#070b11 !important}'; document.head.appendChild(st); return 1; })()`);
  const oM = await behind(MAGENTA);
  const oG = await behind(GREEN);
  const opaqueBlind = oM.equals(oG);
  await evalJSON(S, `(() => { document.getElementById('s2d-opaque').remove();
    document.querySelector('.dk-sheet').style.backgroundImage = 'none'; return 1; })()`);
  await settle(S, 4);
  check('S2-D/B2 FALSIFIED — the sheet is glass over the city, not a filled card',
    transmits && opaqueBlind,
    `swapping what is behind the glass (a magenta plate, then a green one) changes a `
    + `${sheetBox.w - 20}x${Math.min(240, sheetBox.h - 200)} px window of the sheet's own interior: `
    + `${bM.length} vs ${bG.length} bytes of PNG, different: ${transmits}\n`
    + `FALSIFIED: forcing the glass layer to a solid #070b11 — which is what the shipped `
    + `rgba(8,10,15,.96) sheet effectively was — makes the identical swap ${opaqueBlind ? 'byte-identical' : 'still differ'}\n`
    + `NOTE, because the claim is narrower than it looks: what the board transmits is §7.3's STATIC `
    + `blurred still, captured once when you docked, not live frames. The craft is parked while the `
    + `board is open, so it is the same picture — but a check saying "the live city shows through" `
    + `would be claiming something this build does not do`);

  // B3. THE CHAMFER IS REAL GEOMETRY, not a decoration. A pixel 5 px in from the sheet's top-left
  // corner is OUTSIDE a 20 px cut; the same pixel is inside the sheet once the clip is removed.
  const cut = await evalJSON(S, `(() => {
    const s = document.querySelector('.dk-sheet');
    const r = s.getBoundingClientRect();
    const p = [Math.round(r.x + 5), Math.round(r.y + 5)];
    const own = e => !!(e && e.closest && (e.closest('.dk-sheet')));
    const inCorner = document.elementFromPoint(p[0], p[1]);
    const clip = getComputedStyle(s).clipPath;
    s.dataset.clip = clip;
    s.style.clipPath = 'none';
    const without = document.elementFromPoint(p[0], p[1]);
    s.style.clipPath = '';
    const nm = e => (e ? (e.className && String(e.className).split(' ')[0]) || e.id || e.tagName : null);
    // "inside the panel" means inside the SHEET OR ANY OF ITS CHILDREN. The first version compared
    // against the class name 'dk-sheet' and the header sits in that corner, so the falsification
    // arm looked like a miss when it was a hit.
    return { p, clip: clip.slice(0, 40), hitWith: nm(inCorner), hitWithout: nm(without),
      insideWith: own(inCorner), insideWithout: own(without) };
  })()`);
  check('S2-D/B3 FALSIFIED — the sheet corner is genuinely CUT, not drawn to look cut',
    /polygon/.test(cut.clip) && cut.insideWith === false && cut.insideWithout === true,
    `clip-path "${cut.clip}…" · a hit test at (${cut.p}) — 5 px inside the corner of a 20 px chamfer — lands on `
    + `"${cut.hitWith}", i.e. straight past the panel\n`
    + `FALSIFIED: removing the clip makes the identical hit test land on "${cut.hitWithout}". A corner drawn with a `
    + `triangle would pass a screenshot and fail this`);

  // B4. THE PRIMARY ACTION IS NOT A PALE SLAB. HUB's zone colour is 0xdfeaff, so a tint-FILLED
  // ACCEPT rendered as a large white rectangle on the first board of the game.
  const key = await evalJSON(S, `(() => {
    const b = document.querySelector('.dk-accept');
    const sheet = document.querySelector('.dk-sheet');
    const rgb = s => { const m = s.match(/[\\d.]+/g) || [0, 0, 0]; return (+m[0] * 0.2126 + +m[1] * 0.7152 + +m[2] * 0.0722) / 255; };
    const after = getComputedStyle(b, '::after');
    const now = { tint: getComputedStyle(sheet).getPropertyValue('--tint').trim(),
      colour: getComputedStyle(b).color, fill: after.background.slice(0, 90),
      lum: rgb(getComputedStyle(b).backgroundColor) };
    // the shipped arrangement, restored on the live element
    b.style.background = 'var(--tint)';
    const old = { lum: rgb(getComputedStyle(b).backgroundColor) };
    b.style.background = '';
    return { now, old, zoneTint: __game.zoneTypes().HUB.color };
  })()`);
  check('S2-D/B4 FALSIFIED — the primary key is lit glass, not a pale slab, at every zone colour',
    key.now.tint === '#35e6ff' && key.now.lum < 0.25 && key.old.lum > 0.7,
    `this pad is a HUB and its zone colour is 0x${key.zoneTint.toString(16)} — near WHITE. accentOf() substitutes `
    + `the HUD cyan, so --tint resolves to ${key.now.tint} and ACCEPT renders as ${key.now.colour} on a fill of `
    + `luminance ${key.now.lum.toFixed(3)}\n`
    + `FALSIFIED: putting the shipped \`background: var(--tint)\` back on the same live button takes that to `
    + `${key.old.lum.toFixed(3)} — the white rectangle in the before-shot`);

  // B5. Both ladders are ON SCREEN, and they follow the game rather than a copy of it.
  const rail = await evalJSON(S, `(() => {
    const read = () => ({
      dom: [...document.querySelectorAll('.dkr-name')].map(e => e.textContent),
      state: [__state.ranks.licence.name, __state.ranks.standing.name] });
    const a = read();
    __game.grantCredits(400000);
    return { a };
  })()`);
  // The board repaints on an ACTION, and `__game.charge()` is a hook into the economy that never
  // touches the panel — the first version used it and read an unchanged DOM, which looks exactly
  // like a rail that does not track. A tab press is what a player does and it calls paint().
  await evalJSON(S, `(document.querySelectorAll('.dk-tab')[1].click(),
    document.querySelectorAll('.dk-tab')[0].click(), 1)`);
  await settle(S, 8);
  const rail2 = await evalJSON(S, `({ dom: [...document.querySelectorAll('.dkr-name')].map(e => e.textContent),
    state: [__state.ranks.licence.name, __state.ranks.standing.name] })`);
  check('S2-D/B5 FALSIFIED — the board shows both ladders, and they track the game rather than a snapshot',
    rail.a.dom.join('|') === rail.a.state.join('|')
      && rail2.dom.join('|') === rail2.state.join('|')
      && rail2.dom.join('|') !== rail.a.dom.join('|'),
    `on opening: DOM [${rail.a.dom.join(', ')}] against __state [${rail.a.state.join(', ')}]\n`
    + `after +400 000 CRD and a repaint: DOM [${rail2.dom.join(', ')}] against __state [${rail2.state.join(', ')}]\n`
    + `FALSIFIED by the third clause: a rail painted once from a snapshot would still read `
    + `[${rail.a.dom.join(', ')}] on the second line`);

  // B6. The tab ORDER is a contract, not a layout choice: gates_wire presses .dk-tab index 2 and
  // requires the SHOP. RECORD is therefore last, always.
  const tabs = await evalJSON(S, `(() => {
    const t = [...document.querySelectorAll('.dk-tab')].map(b => b.textContent.replace(/\\s+/g, ' ').trim());
    const before = __state.dockUI.tab;
    document.querySelectorAll('.dk-tab')[2].click();
    const two = __state.dockUI.tab;
    document.querySelectorAll('.dk-tab')[3].click();
    const three = __state.dockUI.tab;
    return { t, before, two, three, charge: !!__state.dock };
  })()`);
  check('S2-D/B6 — the RECORD tab is LAST, because .dk-tab index 2 is gates_wire\'s contract for the SHOP',
    tabs.t.length === 4 && tabs.two === 'shop' && tabs.three === 'record'
      && /RECORD/.test(tabs.t[3]) && /SHOP/.test(tabs.t[2]),
    `tabs [${tabs.t.join(' | ')}] · pressing index 2 selects "${tabs.two}", index 3 selects "${tabs.three}"\n`
    + `gates_wire W-shop does \`clickSel('.dk-tab', 2)\` then FILL then the first .dk-shop. Putting RECORD anywhere `
    + `but last would have made that suite press a ladder and report the shop broken`);

  // B7. MOBILE-FIRST, MEASURED. The way out and the primary action are both on screen and both
  // pressable at this viewport — the check S2-A's landscape dash defect would have failed.
  await evalJSON(S, `(document.querySelectorAll('.dk-tab')[0].click(), 1)`);
  await settle(S, 8);
  const reach = await evalJSON(S, `(() => {
    const hit = sel => {
      const e = document.querySelector(sel);
      if (!e) return { missing: sel };
      const r = e.getBoundingClientRect();
      const x = Math.round(r.x + r.width / 2), y = Math.round(r.y + r.height / 2);
      const t = document.elementFromPoint(x, y);
      const self = !!(t && (t === e || e.contains(t)));
      // WHAT covered it, not just that something did. S2-F's residual flake landed on tab.self,
      // the one term of this gate's condition the detail line did not print, so a one-in-four
      // failure carried no evidence at all with it.
      const over = self || !t ? null
        : t.tagName.toLowerCase() + '.' + (t.className || '').toString().split(' ').join('.');
      return { rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
        onScreen: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth,
        // The RAW height, not the rounded one. tall tests r.height >= 36 while the rect prints
        // Math.round(r.height), so a 35.98 px tab failed the term and printed 36 px tall.
        self, over, h: +r.height.toFixed(2), tall: r.height >= 36 };
    };
    const rail = document.getElementById('toasts');
    const rr = rail ? rail.getBoundingClientRect() : null;
    return { undock: hit('.dk-undock'), accept: hit('.dk-accept'), tab: hit('.dk-tab'),
      sheet: (() => { const r = document.querySelector('.dk-sheet').getBoundingClientRect();
        return { bottom: Math.round(r.bottom), h: Math.round(r.height) }; })(),
      toastH: getComputedStyle(document.documentElement).getPropertyValue('--toast-h').trim(),
      toasts: document.querySelectorAll('#toasts .toast').length,
      rail: rr ? [Math.round(rr.x), Math.round(rr.y), Math.round(rr.width), Math.round(rr.height)] : null,
      vh: innerHeight, vw: innerWidth };
  })()`);
  // FALSIFICATION — the shipped board put UNDOCK below the fold in portrait with three jobs on it.
  // Force that arrangement back (a static footer inside a scrolling sheet) and require the check
  // to catch it.
  const broke = await evalJSON(S, `(() => {
    const s = document.querySelector('.dk-sheet'), u = document.querySelector('.dk-undock');
    s.dataset.disp = s.style.display; s.style.display = 'block'; s.style.overflow = 'auto';
    const r = u.getBoundingClientRect();
    const out = r.bottom > innerHeight || r.top < 0;
    s.style.display = s.dataset.disp; s.style.overflow = '';
    return { out, bottom: Math.round(r.bottom) };
  })()`);
  await settle(S, 4);
  check('S2-D/B7 FALSIFIED — the way out and the primary action are both on screen and both pressable at this viewport',
    reach.undock.onScreen && reach.undock.self && reach.undock.tall
      && reach.tab.onScreen && reach.tab.self && reach.tab.tall
      && reach.accept.self && broke.out === true,
    `viewport ${reach.vw}x${reach.vh}, sheet ${reach.sheet.h} px tall ending at y ${reach.sheet.bottom}\n`
    + `UNDOCK ${JSON.stringify(reach.undock.rect)} on screen ${reach.undock.onScreen}, hit-tests to itself ${reach.undock.self}, `
    + `${reach.undock.h} px tall (>= 36: ${reach.undock.tall})\n`
    + `first ACCEPT ${JSON.stringify(reach.accept.rect)} hit-tests to itself ${reach.accept.self}`
    + `${reach.accept.self ? '' : ` — covered by ${reach.accept.over}`}\n`
    + `first tab ${JSON.stringify(reach.tab.rect)} on screen ${reach.tab.onScreen}, hit-tests to itself `
    + `${reach.tab.self}${reach.tab.self ? '' : ` — covered by ${reach.tab.over}`}, ${reach.tab.h} px tall `
    + `(>= 36: ${reach.tab.tall})\n`
    + `toast rail ${JSON.stringify(reach.rail)} with ${reach.toasts} toast(s), --toast-h ${reach.toastH || '(unset)'}\n`
    + `FALSIFIED: collapsing the sheet back to the shipped \`display:block; overflow:auto\` puts UNDOCK's bottom at `
    + `y ${broke.bottom} against a ${reach.vh} px frame — off screen: ${broke.out}. That is the defect the first `
    + `browser run of P7a found and the flex column makes structurally impossible`);

  // ═══ C — the holo panels ════════════════════════════════════════════════

  await evalJSON(S, '(__game.undock(), 1)');
  await hook(S, 'applySettings', { camera: 'cockpit' });
  await settle(S, 16);

  // C1. THE LEGIBILITY FIX, MEASURED WHERE IT FAILED. The panels were unreadable OVER A BRIGHT
  // BUILDING, so the metric composites the live holo canvas over a bright ground and takes the
  // Michelson contrast — under the blend mode the material actually uses, and again under the
  // ADDITIVE one it used to use. Additive can only ever add, so over a bright ground it has no
  // floor to put text on; that is the defect, and this is it as a number.
  const contrast = await evalJSON(S, `(() => {
    const c = __game.cockpit.holoCanvas;
    const g = c.getContext('2d');
    const BH = Math.round(c.height / 3);
    const d = g.getImageData(0, 0, c.width, BH).data;      // band 0 — the JOB panel
    const GROUND = 217;                                    // a lit facade, not white: 0.85 luma
    let nMin = 1e9, nMax = -1, aMin = 1e9, aMax = -1, alpha = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) {
      const a = d[i + 3] / 255;
      if (a < 0.02) continue;                              // outside the plate
      const lum = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      const normal = lum * a + GROUND * (1 - a);           // source-over
      const additive = Math.min(255, GROUND + lum * a);    // what it used to do
      if (normal < nMin) nMin = normal; if (normal > nMax) nMax = normal;
      if (additive < aMin) aMin = additive; if (additive > aMax) aMax = additive;
      alpha += a; n++;
    }
    const mich = (lo, hi) => (hi + lo <= 0 ? 0 : (hi - lo) / (hi + lo));
    return { n, meanAlpha: +(alpha / Math.max(1, n)).toFixed(3),
      normal: +mich(nMin, nMax).toFixed(4), additive: +mich(aMin, aMax).toFixed(4),
      normalRange: [Math.round(nMin), Math.round(nMax)], additiveRange: [Math.round(aMin), Math.round(aMax)],
      blending: __game.cockpit.holo.material.blending,
      colourItems: __game.cockpit.holo.geometry.attributes.color.itemSize };
  })()`);
  check('S2-D/C1 FALSIFIED — the holo panels have contrast over a LIT FACADE, which is exactly where they had none',
    contrast.blending === 1 && contrast.colourItems === 4 && contrast.meanAlpha > 0.45
      && contrast.normal > 0.30 && contrast.additive < 0.10 && contrast.normal > contrast.additive * 4,
    `band 0, ${contrast.n} painted pixels, mean alpha ${contrast.meanAlpha} (the shipped plate was a 10 % tint wash)\n`
    + `composited over a lit facade at luma 217:\n`
    + `  normal blending (what it does now)  luma ${contrast.normalRange[0]}–${contrast.normalRange[1]}  Michelson contrast ${contrast.normal}\n`
    + `  additive        (what it did)       luma ${contrast.additiveRange[0]}–${contrast.additiveRange[1]}  Michelson contrast ${contrast.additive}\n`
    + `FALSIFICATION IS THE SECOND ROW: the identical pixels, composited the way the shipped material composited `
    + `them, measure ${(contrast.normal / Math.max(1e-6, contrast.additive)).toFixed(1)}x less contrast. Additive blending cannot `
    + `be darker than what is behind it, so over a bright building the text had nothing to sit on\n`
    + `material.blending ${contrast.blending} (1 = Normal, 2 = Additive) · colour attribute itemSize `
    + `${contrast.colourItems}, so the look-away fade moves ALPHA and not just brightness`);

  // C2. …and the fade still works, in both directions, now that it rides alpha.
  const hd = await evalJSON(S, 'window.__state.flight ? window.__state.flight.heading : 0');
  const lay = await evalJSON(S, 'window.__game.hudLayout()');
  const sep = Math.atan2(Math.abs(lay.panels[1].pos[0]), Math.abs(lay.panels[1].pos[2]));
  const dir = a => `window.__game.forceFade(${-Math.sin(hd + a)}, 0, ${-Math.cos(hd + a)})`;
  const ahead = await evalJSON(S, dir(0));
  const left = await evalJSON(S, dir(sep + 0.38));
  const away = await evalJSON(S, dir(Math.PI / 2));
  const alphaAt = await evalJSON(S, `(() => { const c = __game.cockpit.holo.geometry.attributes.color;
    const live = { items: c.itemSize, r: c.getX(0), a: c.getW ? c.getW(0) : null };
    // EXECUTED falsification, not a described one: write the alpha back to 1 — which is exactly
    // what the pre-S2-D setXYZ() left it at — and re-read. The clause below compares W against the
    // fade, so this is the state that has to be rejected.
    c.setW(0, 1); c.needsUpdate = true;
    const rgbOnly = { r: c.getX(0), a: c.getW(0) };
    c.setW(0, live.a); c.needsUpdate = true;
    return { ...live, rgbOnly }; })()`);
  await evalJSON(S, dir(0));
  check('S2-D/C2 FALSIFIED — the look-away fade survived the blend change and now moves the alpha channel too',
    ahead[0] > 0.7 && left[0] > left[1] + 0.12 && Math.abs(away[0] - 0.35) < 1e-6
      && alphaAt.items === 4 && Math.abs(alphaAt.a - away[0]) < 1e-3
      && Math.abs(alphaAt.rgbOnly.a - away[0]) > 0.5,
    `looking ahead  job ${ahead[0]}  zone ${ahead[1]}\n`
    + `looking left   job ${left[0]}  zone ${left[1]}  (the right-hand panel dims — the direction gates_p6 pinned)\n`
    + `looking away   job ${away[0]}  zone ${away[1]}  (§8.3's 0.35 floor)\n`
    + `the vertex colour attribute is itemSize ${alphaAt.items}; R reads ${alphaAt.r.toFixed(4)} and W reads `
    + `${alphaAt.a.toFixed(4)} — the fade reaches ALPHA as well as brightness\n`
    + `FALSIFIED by writing W back to ${alphaAt.rgbOnly.a} on the live buffer, which is what the pre-S2-D `
    + `setXYZ() left it at: the same clause then measures |${alphaAt.rgbOnly.a} - ${away[0]}| and rejects it. A `
    + `panel faded on RGB alone is a dark slab, not a ghost`);

  // C3. …and the portrait drawing is big enough to read on the phone it is drawn for.
  const type = await evalJSON(S, `(() => {
    const lay = __game.hudLayout();
    const per = f => f * innerWidth / 384;                  // 384 = HUD.HOLO_W
    const now = per(lay.panelFrac), was = per(0.36);        // 0.36 = the shipped portrait panelFrac
    return { dense: __game.cockpit.holoDense(), panelFrac: lay.panelFrac,
      panelCss: +(lay.panelFrac * innerWidth).toFixed(1),
      nowPer: +now.toFixed(4), wasPer: +was.toFixed(4),
      // label first, then the two DATA lines
      nowLabel: +(26 * now).toFixed(2), nowData: [34, 32].map(u => +(u * now).toFixed(2)),
      wasLabel: +(22 * was).toFixed(2), wasData: [26, 24].map(u => +(u * was).toFixed(2)) };
  })()`);
  const dataMin = Math.min(...type.nowData), wasMin = Math.min(...type.wasData);
  check('S2-D/C3 — the portrait holo drawing survives the mapping onto a phone-sized panel',
    LAND || (!type.dense && dataMin >= 12 && type.nowLabel >= 10 && dataMin > wasMin * 1.35),
    `the panel covers ${type.panelFrac} of the frame = ${type.panelCss} CSS px, so one canvas unit is `
    + `${type.nowPer} CSS px (it was ${type.wasPer} at the shipped panelFrac 0.36)\n`
    + `                     label      data\n`
    + `  now (S2-D)         ${type.nowLabel} px    ${type.nowData.join(' / ')} px\n`
    + `  before             ${type.wasLabel} px     ${type.wasData.join(' / ')} px\n`
    + `The data lines went from ${wasMin} px to ${dataMin} px — a ${(dataMin / wasMin).toFixed(2)}x. Half of that is the `
    + `wider panel and half is dropping a line: three facts at nine pixels is worse than two at thirteen, which is `
    + `why the sparse band lost a row rather than shrinking one\n`
    + (LAND ? 'landscape run: this check is portrait-only and passes by declaration'
      : `dense drawing selected: ${type.dense} (must be false in portrait, or none of the above is what is on screen)`));

  // ── evidence ─────────────────────────────────────────────────────────────
  await settle(S, 12);
  await shot(S, `cockpit_${W}x${H}`);
  await hook(S, 'forceDock');
  await settle(S, 16);
  await evalJSON(S, '(window.__game.clearToasts(), 1)');
  await settle(S, 6);
  await shot(S, `board_${W}x${H}`);
  await evalJSON(S, `(document.querySelectorAll('.dk-tab')[3].click(), 1)`);
  await settle(S, 8);
  await shot(S, `record_${W}x${H}`);

  console.log(`\n${ok.length}/${ok.length + fail.length} passed · ${FILE.replace(ROOT + '/', '')}`);
  await close();
  process.exit(fail.length ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
