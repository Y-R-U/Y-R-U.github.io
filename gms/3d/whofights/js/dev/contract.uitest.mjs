// The contract loop, driven. Everything here is a question only the running game can answer: that
// a job comes off the board as a level, that the arena is dressed the way the contract said, that
// casting spends mana and kills things, that experience lands and a star is crossed, and that the
// sheet, the mission panel and the head bars all draw what they say they draw.
//
//   node js/dev/contract.uitest.mjs [outdir]      KEEP_COPY=1 leaves the working copy behind
//
// Against a copy on its own port, never the working tree — DEV_CONTRACT §11.

import { launch, attach, sleep } from './cdp.mjs';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const COPY = path.resolve(ROOT, '../.wf-contracttest');
const OUT = process.argv[2] || '/tmp/wf-contractshots';
const PORT = 8803;

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

// A fresh profile every run. The browser profile carries localStorage, which carries the save —
// the first version of this test read 64 marks for a 32-mark contract because the previous run's
// were still in it, and a test that remembers the last run is a test that can pass for the wrong
// reason.
fs.rmSync('/tmp/wf-cdp-contract', { recursive: true, force: true });
const { proc, port } = await launch({ port: 9340, profile: '/tmp/wf-cdp-contract' });
const p = await attach(port, `http://127.0.0.1:${PORT}/index.html`);
check(await p.waitFor('!!(window.__wf && window.__wf.game && window.__wf.player)', 30000), 'the game booted');

// A registered iron adventurer with three essences taken, which is the state everything below is
// about. Written straight into the save rather than played through — the proving test owns that.
await p.eval(`(async () => {
  const g = window.__wf.game;
  g.doc.items = {};
  Object.assign(g.doc.flags, {
    'society.met.registrar': true, 'society.test.passed': true,
    'society.essences.chosen': true, 'society.registered': true,
    'society.rank': 'iron', 'society.xp': 0,
  });
  await g.loadEssenceTable();
  const r = (await import('/js/game/essences.js')).resolve(g.essences.doc, ['fire', 'void', 'life']);
  g.doc.essences = { picked: r.picked, confluence: r.confluence, abilities: r.abilities };
  return r.abilities.length;
})()`);
check(await p.eval('window.__wf.game.awakened().length === 4'), 'four abilities awakened');

const state = () => p.eval(`(() => {
  const g = window.__wf.game, P = window.__wf.player;
  return {
    level: window.__wf.level.id,
    zone: window.__wf.level.districts[0].zone,
    surfaces: window.__wf.level.objects.filter(o => o.type === 'plot').map(o => o.p.surface),
    foes: g.combat.foes.map(f => ({ s: f.state, hp: +f.hp.toFixed(1) })),
    names: g.combat.book.map(b => b.name),
    mana: +g.casting.well.mana.toFixed(1),
    xp: g.doc.flags['society.xp'] || 0,
    stars: g.progress().stars,
    marks: g.doc.items.marks || 0,
    active: g.doc.flags['contract.active'] || null,
    panel: !g.mission.root.hidden,
    heads: [...g.heads.pool.values()].filter(r => !r.root.hidden).length,
    headKeys: [...g.heads.pool].filter(([, r]) => !r.root.hidden).map(([k, r]) => {
      const b = r.root.getBoundingClientRect();
      return k + '@' + Math.round(b.x) + ',' + Math.round(b.y)
        + ' ' + Math.round(b.width) + 'x' + Math.round(b.height);
    }),
  };
})()`);

// ── the player sheet ────────────────────────────────────────────────────────────────────────
await p.eval('window.__wf.game.openSheet(); true');
check(await p.waitFor('window.__wf.game.sheet.open', 8000), 'the player sheet opens');
await sleep(600);
check(await p.eval('!!document.querySelector("#game .g-stars u")'), 'it draws stars');
check(await p.eval('document.querySelectorAll("#game .g-stars u").length === 4'), 'four of them');
check(await p.eval('!!document.querySelector("#game .g-xpbar i")'), 'and a bar to the next one');
check(await p.eval('document.querySelectorAll("#game .g-esschip").length === 4'),
  'and the three essences plus the confluence');
// The board screens are a centred card and the sheet has to be one too — it shares .g-parch, so a
// sheet pinned to the left edge means something on it is fighting the wrapper's centring.
const box = await p.eval(`(() => {
  const w = document.querySelector('#game .g-boardwrap');
  const s = document.querySelector('#game .g-record');
  const a = w.getBoundingClientRect(), b = s.getBoundingClientRect();
  return { wrap: [Math.round(a.x), Math.round(a.width), Math.round(a.height)],
           card: [Math.round(b.x), Math.round(b.width), Math.round(b.height)],
           overflow: getComputedStyle(document.querySelector('#game .g-record .g-parch-body')).overflowY };
})()`);
check(Math.abs((box.card[0] + box.card[1] / 2) - (box.wrap[0] + box.wrap[1] / 2)) < 4,
  `the sheet is centred (${JSON.stringify(box)})`);
check(box.card[2] <= box.wrap[2], `and fits the screen (${JSON.stringify(box)})`);
await p.shot(`${OUT}/sheet.png`);
await p.eval('window.__wf.game.sheet.close(); true');

// ── taking a contract off the board ─────────────────────────────────────────────────────────
await p.eval('window.__wf.game.showScreen("board.iron"); true');
await sleep(700);
check(await p.eval('document.querySelectorAll("#game .g-take-b").length >= 8'),
  'every iron row on the board offers to be taken');
await p.shot(`${OUT}/board.png`);

// A `clear` contract for this lap — the lamps are a `survive` one now and have their own below.
await p.eval('window.__wf.game.takeContract("iron.rats"); true');
check(await p.waitFor('window.__wf.level.id === "arena"', 25000), 'it walked him out to the arena');
check(await p.eval('performance.getEntriesByType("navigation").length === 1'), 'without a reload');
await sleep(2600);
let s = await state();
check(s.zone === 'dark', `the contract painted the arena dark (${s.zone})`);
check(s.surfaces.filter(x => x === 'ash').length === 4, `and laid four ash corners (${s.surfaces.join(',')})`);
check(s.foes.length === 2, `two of them are standing (${s.foes.length})`);
check(s.names.every(n => n.includes('Shade')), `and they are shades (${s.names.join(', ')})`);
check(s.panel, 'the mission panel is up');
check(s.heads === 3, `a bar over each of them, and over the player (${s.headKeys.join(' | ')})`);
check(s.headKeys.some(k => k.startsWith('player@')), 'the player has one of their own');
check(s.headKeys.every(k => {
  const [, box] = k.split(' ');
  const [w, h] = box.split('x').map(Number);
  // The player's is a bar and nothing else — it is over your own head and does not need naming —
  // so the floor is the bar itself, not the bar plus a label.
  return w > 60 && h >= 8;
}), `and all of them are big enough to read (${s.headKeys.join(' | ')})`);
await p.shot(`${OUT}/arena.png`);

// ── the panel opens ─────────────────────────────────────────────────────────────────────────
await p.eval('window.__wf.game.mission.toggle(); true');
await sleep(400);
check(await p.eval('!!document.querySelector("#game .g-mission.open .g-mission-body")'),
  'and it expands into the brief');
await p.shot(`${OUT}/panel.png`);
await p.eval('window.__wf.game.mission.toggle(); true');

// ── casting ─────────────────────────────────────────────────────────────────────────────────
const before = (await state()).mana;
const cast = await p.eval(`(() => {
  const g = window.__wf.game, P = window.__wf.player;
  const f = g.combat.foes[0];
  P.camYaw = Math.atan2(f.x - P.pos.x, f.z - P.pos.z);
  return g.castSpell(g.awakened()[0]);
})()`);
check(cast === true, 'the first ability casts');
await sleep(150);
check((await state()).mana < before, `and it cost mana (${before} → ${(await state()).mana})`);
check(await p.eval('window.__wf.game.casting.fx.report().casts > 0 || window.__wf.game.casting.fx.report().glow > 0'),
  'and put particles in the world');
await p.shot(`${OUT}/cast.png`);
check(await p.waitFor('window.__wf.game.combat.foes.some(f => f.hp < f.max)', 6000),
  'and the bolt arrived and hurt something');

// Every one of the four, so a movement or a defence ability cannot throw where a bolt does not.
const all = await p.eval(`(async () => {
  const g = window.__wf.game;
  const out = [];
  for (const a of g.awakened()) {
    g.casting.well = { ...g.casting.well, mana: 100, cool: {} };
    try { out.push({ id: a.id, ok: g.castSpell(a) }); } catch (e) { out.push({ id: a.id, err: String(e) }); }
    await new Promise(r => setTimeout(r, 500));
  }
  return out;
})()`);
check(all.every(r => r.ok), `all four abilities cast without throwing (${JSON.stringify(all)})`);

// ── winning it ──────────────────────────────────────────────────────────────────────────────
await p.eval('window.__wf.game.combat.foes = window.__wf.game.combat.foes.map(f => ({ ...f, hp: 0, state: "dead" })); true');
check(await p.waitFor('window.__wf.game.combat.ended === "won"', 8000), 'clearing the floor wins it');
check(await p.waitFor('window.__wf.level.id === "society"', 25000), 'and it brings him back to the desk');
await sleep(2000);
s = await state();
const firstXp = s.xp;
check(firstXp > 0, `experience landed (${firstXp})`);
check(s.stars === 0, `one iron contract is not a star on its own (${s.stars})`);
check(s.marks > 0, `the contract paid (${s.marks} marks)`);
check(s.active === null, 'and nothing is in hand any more');
check(!s.panel, 'so the mission panel is gone');
// A bar belonging to a fight in a level that no longer exists is the pooled-element bug this
// system is otherwise built to avoid.
check(s.heads === 0, `and no head bars are left over from the arena (${s.headKeys.join(' | ')})`);
await p.shot(`${OUT}/back.png`);

// ── a second one, which is what crosses the star ─────────────────────────────────────────────
// Also the only test that the arena is really re-dressed rather than kept: the culvert is a dirt
// floor with standing water in it and one big slow thing, and the lamps were ash and three small
// fast ones.
await p.eval('window.__wf.game.takeContract("iron.drain"); true');
check(await p.waitFor('window.__wf.level.id === "arena"', 25000), 'a second contract goes out again');
await sleep(2600);
s = await state();
check(s.surfaces[0] === 'dirt' && s.surfaces.includes('water'),
  `and the arena was re-dressed for it (${s.surfaces.join(',')})`);
check(s.foes.length === 1 && s.names[0].includes('Mire'), `with something else in it (${s.names.join(', ')})`);
// The pool is keyed by slot, and the second contract has one monster where the first had three.
// A bar left over from the first is a bar for something that is not in the room.
check(s.heads === 2, `and one bar for it, plus the player's (${s.headKeys.join(' | ')})`);
await p.shot(`${OUT}/arena2.png`);
await p.eval('window.__wf.game.combat.foes = window.__wf.game.combat.foes.map(f => ({ ...f, hp: 0, state: "dead" })); true');
check(await p.waitFor('window.__wf.level.id === "society"', 30000), 'and back again');
await sleep(2000);
s = await state();
check(s.xp > firstXp, `the second contract added to the first (${firstXp} → ${s.xp})`);
check(s.stars >= 1, `and crossed the first star (${s.stars})`);

// ── a contract you survive rather than clear ────────────────────────────────────────────────
// The one that proves the clock and the waves: the floor being empty at eleven seconds must not
// win it, and outlasting the clock must.
await p.eval('window.__wf.game.takeContract("iron.ledger"); true');
check(await p.waitFor('window.__wf.level.id === "arena"', 25000), 'a survive contract goes out');
check(await p.waitFor('!!window.__wf.game.run', 20000), 'and starts a clock');
const run = await p.eval('JSON.stringify({ o: window.__wf.game.run.objective, s: window.__wf.game.run.seconds, w: window.__wf.game.run.waves.length })').then(JSON.parse);
check(run.o === 'survive' && run.s > 30 && run.w >= 2, `with an objective and waves (${JSON.stringify(run)})`);
check(await p.eval('window.__wf.game.combat.expecting === true'), 'and combat knows more is coming');
// Kill everything early. With a wave outstanding this must NOT end it.
await p.eval('window.__wf.game.combat.foes = window.__wf.game.combat.foes.map(f => ({ ...f, hp: 0, state: "dead" })); true');
await sleep(1200);
check(await p.eval('window.__wf.game.combat.ended === null'), 'an empty floor with a wave still to come is not a win');
check(await p.eval('!!document.querySelector("#game .g-mission-clock")'), 'the panel is counting down');
await p.shot(`${OUT}/survive.png`);
// Wind the clock past the end rather than waiting a minute for it.
await p.eval('window.__wf.game.run.t = window.__wf.game.run.seconds - 0.2; window.__wf.game.run.waves.length = 0; true');
check(await p.waitFor('window.__wf.game.combat.ended === "won"', 8000), 'and outlasting it wins');
check(await p.waitFor('window.__wf.level.id === "society"', 25000), 'and it brings him back');
await sleep(1800);
check(await p.eval('window.__wf.game.run === null'), 'the clock does not survive the level it belonged to');

// ── the ladder ──────────────────────────────────────────────────────────────────────────────
// Four stars at iron does not raise you: somebody at a desk does. Nothing called promote() before
// this, so a player who earned four stars at iron simply stopped.
await p.eval(`(() => {
  const g = window.__wf.game;
  g.doc.flags['society.xp'] = 380;
  g.syncStanding();
  return true;
})()`);
check(await p.eval('window.__wf.game.progress().stars === 4'), 'four stars at iron');
check(await p.eval('window.__wf.game.doc.flags["society.promotable"] === true'), 'and the Society knows it');
const greeter = await p.eval(`(() => {
  const g = window.__wf.game;
  const at = g.characters.at('greeter');
  const open = g.hotspots.candidates(at, ['interact']).filter(h => h.attach === 'greeter');
  return JSON.stringify(open.map(h => h.id));
})()`).then(JSON.parse);
check(greeter.length === 1 && greeter[0] === 'hs.greeter.promote',
  `Vail has exactly one thing to say and it is the promotion (${greeter.join(', ')})`);

check(await p.eval('window.__wf.game.say("society.greeter.promote")'), 'the promotion conversation opens');
await sleep(500);
await p.shot(`${OUT}/promote.png`);
// Walk it to the end. The rank moves on the parting node's `sets`, so every path through it lands.
await p.eval(`(() => {
  const d = window.__wf.game.dialogue;
  for (let i = 0; i < 40 && d.active; i++) { if (d.scene?.choosing) d.pick(0); else d.next(); }
  return !d.active;
})()`);
check(await p.eval('window.__wf.game.doc.flags["society.rank"] === "bronze"'), 'and it raises you to bronze');
check(await p.eval('window.__wf.game.doc.flags["society.promotable"] === false'), 'and stops offering');
check(await p.eval('window.__wf.game.progress().stars === 0'),
  'bronze starts at no stars, because its ladder begins where iron ended');

// Bronze work is takeable now, and only now.
await p.eval('window.__wf.game.showScreen("board.bronze"); true');
await sleep(700);
check(await p.eval('document.querySelectorAll("#game .g-take-b").length >= 8'),
  'the bronze board is open and every row can be taken');
await p.shot(`${OUT}/bronze.png`);
await p.eval('window.__wf.game.board.close(); true');
await sleep(400);
await p.eval('window.__wf.game.takeContract("bronze.quarry"); true');
check(await p.waitFor('window.__wf.level.id === "arena"', 25000), 'and a bronze contract walks out');
await sleep(2600);
s = await state();
check(s.names.some(n => n.includes('Quarry Warden')), `to something iron never sent (${s.names.join(', ')})`);
await p.shot(`${OUT}/bronze-arena.png`);
// Every bronze contract arrives in waves, and on a `clear` one an empty floor brings the next
// group forward rather than leaving the player waiting out a clock they cannot see.
await p.eval('window.__wf.game.combat.foes = window.__wf.game.combat.foes.map(f => ({ ...f, hp: 0, state: "dead" })); true');
check(await p.waitFor('window.__wf.game.combat.foes.length > 1', 8000),
  'clearing the floor brings the next wave forward instead of running the clock out');
await p.eval('window.__wf.game.combat.foes = window.__wf.game.combat.foes.map(f => ({ ...f, hp: 0, state: "dead" })); true');
check(await p.waitFor('window.__wf.level.id === "society"', 30000), 'and back again');
await sleep(1800);

// ── the sheet again ─────────────────────────────────────────────────────────────────────────
await p.eval('window.__wf.game.openSheet(); true');
await sleep(700);
// No filled star here on purpose: bronze's ladder starts where iron's ended, so one bronze
// contract is a long way short of its first one. What the sheet has to show is the new rank.
check(await p.eval('!!document.querySelector("#game .g-rank-bronze")'), 'the sheet reads as bronze');
check(await p.eval('document.querySelectorAll("#game .g-stars u").length === 4'), 'with four star slots');
check(await p.eval('document.querySelector("#game .g-parch-title h2").textContent.includes("Bronze")'),
  'and says so at the top');
await p.shot(`${OUT}/sheet-star.png`);

console.log(`\n${fails ? `${fails} FAILED` : 'all checks passed'} — shots in ${OUT}`);
try { proc.kill(); } catch { /* gone */ }
try { server.kill(); } catch { /* gone */ }
if (!process.env.KEEP_COPY) fs.rmSync(COPY, { recursive: true, force: true });
process.exit(fails ? 1 : 0);
