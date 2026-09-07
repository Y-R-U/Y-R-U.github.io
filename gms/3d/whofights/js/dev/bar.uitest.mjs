// The action bar, the number row, the Bronze gate and what going down costs. Driven.
//
// The unit tests prove the arrangement's arithmetic (js/game/slots.test.mjs); this proves the
// things only the running game can answer — that the bar and the keyboard reach the same twenty
// things in the same order, that rearranging one slot survives, and that the Society will not
// raise a half-awake adventurer however many stars they have.
//
//   node js/dev/bar.uitest.mjs [outdir]      KEEP_COPY=1 leaves the working copy behind
//
// Against a copy on its own port, never the working tree — DEV_CONTRACT §11.

import { launch, attach, sleep } from './cdp.mjs';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const COPY = path.resolve(ROOT, '../.wf-bartest');
const OUT = process.argv[2] || '/tmp/wf-barshots';
const PORT = 8806;

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

const { proc, port, kill } = await launch({ port: 9343, profile: '/tmp/wf-cdp-bar' });
const p = await attach(port, `http://127.0.0.1:${PORT}/index.html`);
check(await p.waitFor('!!(window.__wf && window.__wf.game && window.__wf.player)', 30000), 'the game booted');
await p.eval('try { localStorage.clear(); } catch (e) {} location.reload(); true');
await sleep(1200);
check(await p.waitFor('!!(window.__wf && window.__wf.game && window.__wf.player)', 30000), 'from an empty save');

// Registered, with three essences taken, so there is something to put on the bar.
await p.eval(`(async () => {
  const g = window.__wf.game;
  await g.loadEssenceTable();
  const m = await import('./js/game/essences.js');
  const r = m.resolve(g.essences.doc, ['dark', 'fire', 'life']);
  g.doc.essences = { picked: r.picked, confluence: r.confluence, abilities: r.abilities };
  Object.assign(g.doc.flags, { 'society.test.passed': true, 'society.essences.chosen': true, 'society.rank': 'iron' });
  g.awokeKey = null;
  g.awakened();
  g.syncStanding();
  return true;
})()`);
await sleep(600);

// ── the bar ─────────────────────────────────────────────────────────────────────────────────
check(await p.eval('!document.querySelector("#game .g-abar").hidden'), 'the bar is up once there is something on it');
check(await p.eval('document.querySelectorAll("#game .g-abar-cell").length === 10'), 'ten slots');
const keys = await p.eval('JSON.stringify([...document.querySelectorAll("#game .g-abar-cell u")].map(u => u.textContent))').then(JSON.parse);
check(keys.join(',') === '1,2,3,4,5,6,7,8,9,0', `and they are the number row (${keys.join('')})`);
check(await p.eval('[...document.querySelectorAll("#game .g-abar-cell")].filter(c => !c.classList.contains("empty")).length === 4'),
  'with the four you start with on it and the rest empty');
await p.shot(`${OUT}/bar.png`);

// ── the keyboard and the bar are the same twenty things ─────────────────────────────────────
const same = await p.eval(`(async () => {
  const g = window.__wf.game;
  const s = await import('./js/game/slots.js');
  const bar = s.resolve(g.doc.slots, g.awakened());
  const cells = [...document.querySelectorAll('#game .g-abar-cell b')].map(b => b.textContent);
  return JSON.stringify({ bar: bar.slice(0, 10).map(a => (a ? a.name : '')), cells });
})()`).then(JSON.parse);
check(same.bar.join('|') === same.cells.join('|'), 'the bar draws exactly what the keys reach');

// Wake everything, so both pages have something on them.
await p.eval(`(async () => {
  const m = await import('./js/game/essences.js');
  const g = window.__wf.game;
  for (let i = 0; i < 40; i++) {
    const a = m.awakenOne(g.essences.doc, g.doc.essences);
    if (!a) break;
    g.doc.essences.abilities.push(a.id);
  }
  g.awokeKey = null;
  g.awakened();
  g.syncStanding();
  return true;
})()`);
await sleep(500);
check(await p.eval('window.__wf.game.doc.essences.abilities.length === 20'), 'twenty abilities awake');
check(await p.eval('window.__wf.game.doc.slots.filter(Boolean).length === 20'), 'and all twenty found a key');
check(await p.eval('!document.querySelector("#game .g-abar-page").hidden'), 'the page flip appears once the second ten is filled');

check(await p.eval('document.querySelector("#game .g-abar-page").click(), true'), 'flipped to the second page');
await sleep(300);
const keys2 = await p.eval('JSON.stringify([...document.querySelectorAll("#game .g-abar-cell u")].map(u => u.textContent))').then(JSON.parse);
check(keys2.every(k => k.startsWith('⇧')), `and the second page is the Shift row (${keys2.slice(0, 3).join(' ')}…)`);
await p.shot(`${OUT}/bar-page2.png`);
await p.eval('document.querySelector("#game .g-abar-page").click(), true');
await sleep(200);

// ── the grid, and reordering ────────────────────────────────────────────────────────────────
check(await p.eval('window.__wf.game.bar.openGrid(null)'), 'the twenty-grid opens');
await sleep(400);
check(await p.eval('document.querySelectorAll("#game .g-slotrow").length === 20'), 'with twenty rows');
check(await p.eval('document.querySelectorAll("#game .g-slotcol").length === 2'), 'in two columns of ten');
await p.shot(`${OUT}/grid.png`);

const swapped = await p.eval(`(() => {
  const g = window.__wf.game;
  const before = [g.doc.slots[0], g.doc.slots[13]];
  const rows = document.querySelectorAll('#game .g-slotrow');
  rows[0].click();       // pick key 1
  rows[13].click();      // and say what goes on it
  const after = [g.doc.slots[0], g.doc.slots[13]];
  return JSON.stringify({ before, after });
})()`).then(JSON.parse);
check(swapped.after[0] === swapped.before[1] && swapped.after[1] === swapped.before[0],
  `two keys swapped rather than one being lost (${swapped.before} -> ${swapped.after})`);
await p.eval('window.__wf.game.bar.closeGrid(); true');
await sleep(300);

// It survives a save round trip, which is the whole point of the arrangement being in the save.
const kept = await p.eval(`(() => {
  const g = window.__wf.game;
  g.autosave.mark();
  const snap = JSON.stringify(g.snapshot().slots);
  return snap === JSON.stringify(g.doc.slots);
})()`);
check(kept, 'and the arrangement is what gets written to the save');

// ── casting off the bar and off the keys ────────────────────────────────────────────────────
const cast = await p.eval(`(() => {
  const g = window.__wf.game;
  g.casting.well = { ...g.casting.well, mana: 100, cool: {} };
  const s = g.doc.slots;
  const before = g.casting.well.mana;
  // The number key path: js/player.js banks the slot, session.drainCast spends it.
  window.__wf.player.spellEdge = 0;
  g.drainCast();
  return JSON.stringify({ before, after: g.casting.well.mana, slot0: s[0] });
})()`).then(JSON.parse);
check(cast.after < cast.before, `pressing 1 cast what is on key 1 (${cast.before} -> ${cast.after} mana)`);

const cast2 = await p.eval(`(() => {
  const g = window.__wf.game;
  g.casting.well = { ...g.casting.well, mana: 100, cool: {} };
  window.__wf.player.spellEdge = 13;   // Shift+4
  g.drainCast();
  return g.casting.well.mana;
})()`);
check(cast2 < 100, `and Shift+4 cast what is on the fourteenth slot (${cast2} mana left)`);

// With twenty abilities and twenty keys there is no empty key to test — normalise() fills every
// hole, which is what puts a newly woken ability under a finger without the player going to find
// it. So this one is checked with half a sheet.
const empty = await p.eval(`(() => {
  const g = window.__wf.game;
  const keep = g.doc.essences.abilities.slice();
  g.doc.essences.abilities = keep.slice(0, 6);
  g.doc.slots = new Array(20).fill(null);
  g.awokeKey = null;
  g.awakened();
  const filled = g.doc.slots.filter(Boolean).length;
  g.casting.well = { ...g.casting.well, mana: 100, cool: {} };
  window.__wf.player.spellEdge = 19;
  g.drainCast();
  const spent = g.casting.well.mana < 100;
  g.doc.essences.abilities = keep;
  g.awokeKey = null;
  g.awakened();
  return JSON.stringify({ filled, spent, back: g.doc.slots.filter(Boolean).length });
})()`).then(JSON.parse);
check(empty.filled === 6, `six abilities take six keys and leave fourteen empty (${empty.filled})`);
check(!empty.spent, 'an empty key casts nothing rather than the next thing along');
check(empty.back === 20, 'and waking the rest fills the empty keys back up');

// ── the Bronze gate ─────────────────────────────────────────────────────────────────────────
const gate = await p.eval(`(() => {
  const g = window.__wf.game;
  g.doc.flags['society.xp'] = 400;      // four stars at iron
  g.syncStanding();
  const full = { stars: g.doc.flags['society.stars'], all: g.doc.flags['society.awakened.all'], promotable: g.doc.flags['society.promotable'] };
  const promoted = !!g.promote();
  return JSON.stringify({ full, promoted, rank: g.doc.flags['society.rank'] });
})()`).then(JSON.parse);
check(gate.full.stars === 4 && gate.full.all === true, 'four stars and twenty abilities');
check(gate.promoted && gate.rank === 'bronze', 'so the Society raises you');

const shut = await p.eval(`(() => {
  const g = window.__wf.game;
  g.doc.flags['society.rank'] = 'iron';
  g.doc.flags['society.xp'] = 400;
  const keep = g.doc.essences.abilities.slice();
  g.doc.essences.abilities = keep.slice(0, 12);   // half awake
  g.awokeKey = null;
  g.syncStanding();
  const out = {
    stars: g.doc.flags['society.stars'],
    all: g.doc.flags['society.awakened.all'],
    promotable: g.doc.flags['society.promotable'],
    starred: g.doc.flags['society.starred'],
    promoted: !!g.promote(),
    rank: g.doc.flags['society.rank'],
  };
  const at = g.characters.at('greeter');
  out.says = (g.hotspots.candidates(at, ['interact'])[0] || {}).id || null;
  g.doc.essences.abilities = keep;
  g.awokeKey = null;
  g.syncStanding();
  return JSON.stringify(out);
})()`).then(JSON.parse);
check(shut.stars === 4 && shut.all === false, 'four stars and twelve abilities');
check(!shut.promoted && shut.rank === 'iron', 'the Society refuses');
check(shut.starred === true && shut.promotable === false, 'and says so through its own flags');
check(shut.says === 'hs.greeter.notyet', `and Vail has a reason ready rather than going quiet (${shut.says})`);

// ── going down costs a star ─────────────────────────────────────────────────────────────────
const fall = await p.eval(`(() => {
  const g = window.__wf.game;
  g.doc.flags['society.rank'] = 'iron';
  g.doc.flags['society.xp'] = 250;
  g.doc.flags['contract.active'] = 'iron.rats';
  g.syncStanding();
  const before = g.progress().stars;
  g.finishContract(false);
  const after = g.progress().stars;
  return JSON.stringify({ before, after, xp: g.doc.flags['society.xp'], rank: g.doc.flags['society.rank'] });
})()`).then(JSON.parse);
check(fall.after === fall.before - 1, `going down cost a star (${fall.before} -> ${fall.after})`);
check(fall.rank === 'iron', 'and never the rank');
await sleep(2000);
await p.shot(`${OUT}/fell.png`);

// ── on a phone ──────────────────────────────────────────────────────────────────────────────
// "mobile will need small combat/action bar at bottom of screen" — so the ten slots have to fit
// across 390 points without any of them falling off the end or shrinking under a thumb.
// The fall above sends him back to the desk, and the swap fades to black on the way. Wait for the
// world to come back or the phone shot is a black rectangle.
await p.waitFor('window.__wf.level.id === "society"', 25000);
await sleep(2500);
await p.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await sleep(1200);
const phone = await p.eval(`(() => {
  const bar = document.querySelector('#game .g-abar');
  const cells = [...document.querySelectorAll('#game .g-abar-cell')];
  const r = bar.getBoundingClientRect();
  const c = cells[0].getBoundingClientRect();
  return JSON.stringify({
    cells: cells.length,
    left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width),
    cellW: Math.round(c.width), cellH: Math.round(c.height),
    view: innerWidth,
    bottom: Math.round(innerHeight - r.bottom),
  });
})()`).then(JSON.parse);
check(phone.cells === 10, `all ten slots are still there on a phone (${phone.cells})`);
check(phone.left >= 0 && phone.right <= phone.view + 1,
  `and the bar fits the screen (${phone.left}..${phone.right} of ${phone.view})`);
check(phone.cellH >= 40, `and a slot is still big enough for a thumb (${phone.cellW}x${phone.cellH})`);
check(phone.bottom >= 0 && phone.bottom < 80, `sitting at the bottom of the screen (${phone.bottom}px up)`);
await p.shot(`${OUT}/phone.png`);
await p.eval('window.__wf.game.bar.openGrid(3); true');
await sleep(400);
check(await p.eval('document.querySelectorAll("#game .g-slotrow").length === 20'), 'and the grid still opens on it');
await p.shot(`${OUT}/phone-grid.png`);
await p.eval('window.__wf.game.bar.closeGrid(); true');
await p.send('Emulation.clearDeviceMetricsOverride');

console.log(`\n${fails ? `${fails} FAILED` : 'all passed'} — shots in ${OUT}`);
kill();
server.kill();
if (!process.env.KEEP_COPY) fs.rmSync(COPY, { recursive: true, force: true });
process.exit(fails ? 1 : 0);
