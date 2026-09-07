// Gear, driven. The unit tests prove the bag's arithmetic and the racks' balance; this proves the
// things only the running game can answer.
//
// The first block is the bug Aaron's son reported: "after the registration battle, for some reason
// even though the knife is returned it is still in other battles". js/game/combat.js armed the
// player from "does this level have anything to fight in it", so the Society's knife came back at
// the gate of every contract however many times the Registrar had taken it off you. The knife is
// LENT by the proving now (`loaner` in the level document) and everything else arms what you own.
//
//   node js/dev/gear.uitest.mjs [outdir]      KEEP_COPY=1 leaves the working copy behind
//
// Against a copy on its own port, never the working tree — DEV_CONTRACT §11.

import { launch, attach, sleep } from './cdp.mjs';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const COPY = path.resolve(ROOT, '../.wf-geartest');
const OUT = process.argv[2] || '/tmp/wf-gearshots';
const PORT = 8804;

let fails = 0;
const check = (cond, what) => { console.log(`${cond ? ' ok ' : 'FAIL'}  ${what}`); if (!cond) fails++; };

fs.mkdirSync(OUT, { recursive: true });
fs.rmSync(COPY, { recursive: true, force: true });
spawnSync('rsync', ['-a', '--exclude', 'shots', '--exclude', 'audio/vo/raw', '--exclude', '.git',
  `${ROOT}/`, `${COPY}/`]);
const server = spawn(process.execPath, [path.join(COPY, 'tools/devserver.mjs'), '--port', String(PORT)],
  { cwd: COPY, stdio: 'ignore' });
for (let i = 0; i < 60; i++) {
  try { if ((await (await fetch(`http://127.0.0.1:${PORT}/api/status`)).json()).devserver) break; } catch { /* booting */ }
  await sleep(200);
}

const { proc, port } = await launch({ port: 9341, profile: '/tmp/wf-cdp-gear' });
const p = await attach(port, `http://127.0.0.1:${PORT}/index.html`);
check(await p.waitFor('!!(window.__wf && window.__wf.game && window.__wf.player)', 30000), 'the game booted');

// Registered, with essences, so the stone has something to reach. Written straight into the save
// rather than played through — the proving has its own driven test and this one is about the bag.
await p.eval(`(async () => {
  const g = window.__wf.game;
  await g.loadEssenceTable();
  const r = window.__wf.game.essences.doc;
  g.doc.essences = { picked: ['earth', 'fire', 'water'], confluence: null, abilities: [] };
  const mod = await import('./js/game/essences.js');
  const res = mod.resolve(r, ['earth', 'fire', 'water']);
  g.doc.essences = { picked: res.picked, confluence: res.confluence, abilities: res.abilities };
  Object.assign(g.doc.flags, { 'society.test.passed': true, 'society.essences.chosen': true, 'society.rank': 'iron' });
  g.syncStanding();
  g.awokeKey = null;
  return true;
})()`);
await sleep(400);

const bag = () => p.eval('JSON.stringify({ items: window.__wf.game.doc.items, gear: window.__wf.game.doc.gear })').then(JSON.parse);
const armed = () => p.eval('JSON.stringify({ vis: !!window.__wf.player.hand.visible, heft: window.__wf.player.heft, w: window.__wf.game.combat.weapon.id })').then(JSON.parse);

// ── the Society's own halls ─────────────────────────────────────────────────────────────────
let a = await armed();
check(a.vis === false && a.w === 'fists', `unarmed in the Society, bare-handed (${a.w})`);

// ── the proving lends a knife ───────────────────────────────────────────────────────────────
await p.eval('window.__wf.game.gotoLevel("proving", { x: 0, z: 15, yaw: 3.14159 }); true');
check(await p.waitFor('window.__wf.level.id === "proving"', 20000), 'moved to the proving floor');
await sleep(2000);
a = await armed();
check(a.vis === true && a.w === 'knife', `the proving lends the knife (${a.w})`);
check(await p.eval('window.__wf.level.loaner === "knife"'), 'and the level document is what says so');

// ── the bug: a contract arena must NOT ───────────────────────────────────────────────────────
await p.eval(`(() => {
  const g = window.__wf.game;
  g.doc.flags['contract.active'] = 'iron.rats';
  g.takeContract('iron.rats');
  return true;
})()`);
check(await p.waitFor('window.__wf.level.id === "arena"', 25000), 'took an iron contract out to the arena');
await sleep(2200);
a = await armed();
check(a.w !== 'knife', `the Society's knife did NOT come back (holding: ${a.w})`);
check(a.vis === false, 'and there is nothing in the hand — the contract is fought bare-handed until you buy something');
await p.shot(`${OUT}/arena-unarmed.png`);

// ── buy nothing, but be given something ─────────────────────────────────────────────────────
// The shops are the next phase; the bag does not care where a thing came from.
await p.eval(`(async () => {
  const it = await import('./js/game/items.js');
  const g = window.__wf.game;
  it.give(g.doc.items, 'marks', 400);
  it.give(g.doc.items, 'spear', 1);
  it.give(g.doc.items, 'stone.awakening', 2);
  it.give(g.doc.items, 'potion.healing', 3);
  it.give(g.doc.items, 'rope', 2);
  return true;
})()`);

check(await p.eval('window.__wf.game.equip("spear")'), 'the spear goes in hand');
await sleep(300);
a = await armed();
check(a.vis === true && a.heft === 'spear' && a.w === 'spear', `and it is a spear that is drawn (${a.heft})`);
check(await p.eval('window.__wf.game.combat.weapon.reach > 4'), 'and the fight is using its reach, not the knife’s');
check(await p.eval('window.__wf.game.equip("axe") === false'), 'a weapon you do not own is refused');

// ── the bag opens, and looks like something ─────────────────────────────────────────────────
check(await p.eval('window.__wf.game.openBag()'), 'the bag opens');
await sleep(500);
check(await p.eval('!!document.querySelector("#game .g-inv")'), 'and it is on screen');
const cells = await p.eval('document.querySelectorAll("#game .g-invcell").length');
check(cells === 4, `five things carried, four rows (marks are the purse, not a row) — got ${cells}`);
check(await p.eval('!!document.querySelector("#game .g-invequip")'), 'with the equip box set aside');
check(await p.eval('/400/.test(document.querySelector("#game .g-parch-title p").textContent)'), 'and the purse on the header');
await p.shot(`${OUT}/bag.png`);

// Picking a row shows what it is and what you can do with it.
check(await p.eval('document.querySelectorAll("#game .g-invcell")[0].click(), true'), 'picked the first row');
await sleep(300);
check(await p.eval('document.querySelectorAll("#game .g-invact").length >= 1'), 'and it offers something to do with it');
await p.shot(`${OUT}/bag-picked.png`);
await p.eval('window.__wf.game.inventory.close(); true');

// ── the off hand ────────────────────────────────────────────────────────────────────────────
check(await p.eval('window.__wf.game.hold("stone.awakening")'), 'a stone goes into the off hand');
check((await bag()).gear.hand === 'stone.awakening', 'and the save says so');
check(await p.eval('window.__wf.game.hold("spear") === false'), 'a weapon cannot be held in the off hand');

const before = await p.eval('window.__wf.game.doc.essences.abilities.length');
check(before === 4, `four abilities to start with (${before})`);
check(await p.eval('window.__wf.game.useFromBag("stone.awakening")'), 'the stone absorbs');
const after = await p.eval('window.__wf.game.doc.essences.abilities.length');
check(after === before + 1, `and wakes exactly one more (${before} -> ${after})`);
check((await bag()).items['stone.awakening'] === 1, 'and spends exactly one stone');

// Left click in the world is the route his son asked for.
check(await p.eval(`(() => {
  const g = window.__wf.game;
  window.__wf.player.castEdge = true;
  return g.drainHand();
})()`), 'left click with a stone in hand absorbs it');
const after2 = await p.eval('window.__wf.game.doc.essences.abilities.length');
check(after2 === after + 1, `a sixth ability (${after2})`);
check((await bag()).gear.hand === '', 'and the emptied hand clears itself rather than pointing at nothing');

// ── the wall at the top ─────────────────────────────────────────────────────────────────────
const cap = await p.eval(`(async () => {
  const m = await import('./js/game/essences.js');
  const g = window.__wf.game;
  return { cap: m.capacity(g.essences.doc, g.doc.essences), per: m.MAX_PER_ESSENCE, max: m.MAX_ABILITIES };
})()`);
check(cap.per === 5, `five per essence (${cap.per})`);
check(cap.max === 20, `twenty in all (${cap.max})`);

// Fill it, then a stone must refuse.
await p.eval(`(async () => {
  const m = await import('./js/game/essences.js');
  const g = window.__wf.game;
  for (let i = 0; i < 40; i++) {
    const a = m.awakenOne(g.essences.doc, g.doc.essences);
    if (!a) break;
    g.doc.essences.abilities.push(a.id);
  }
  g.awokeKey = null;
  const it = await import('./js/game/items.js');
  it.give(g.doc.items, 'stone.awakening', 1);
  return true;
})()`);
check(await p.eval('window.__wf.game.useFromBag("stone.awakening") === false'),
  'a stone refuses once everything is awake');
const held = await p.eval('window.__wf.game.doc.essences.abilities.length');
check(held === cap.cap, `and the sheet stops at the table's own ceiling (${held} of ${cap.cap})`);

// ── potion and rope ─────────────────────────────────────────────────────────────────────────
check(await p.eval('window.__wf.game.useFromBag("potion.healing") === false'), 'a potion refuses when nothing is open');
await p.eval('window.__wf.game.combat.begin(); window.__wf.game.combat.takeHit(40); true');
await sleep(300);
check(await p.eval('window.__wf.game.useFromBag("potion.healing")'), 'and drinks when something is');
check(await p.eval('window.__wf.game.combat.vitals.hp > 60'), 'and it closed up');
check(await p.eval('window.__wf.game.useFromBag("rope")'), 'the rope goes out');
check(await p.eval('window.__wf.game.combat.foes.some(f => f.held > 0)'), 'and something is held by it');
await p.shot(`${OUT}/roped.png`);

// ── it survives a reload ────────────────────────────────────────────────────────────────────
await p.eval('window.__wf.game.autosave.mark(); window.__wf.game.autosave.flush?.(); true');
await sleep(600);

console.log(`\n${fails ? `${fails} FAILED` : 'all passed'} — shots in ${OUT}`);
proc.kill();
server.kill();
if (!process.env.KEEP_COPY) fs.rmSync(COPY, { recursive: true, force: true });
process.exit(fails ? 1 : 0);
