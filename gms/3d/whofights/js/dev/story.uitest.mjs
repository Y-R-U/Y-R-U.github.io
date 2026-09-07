// The Long Count, the silver and gold boards, and the four new silhouettes. Driven.
//
// Two things only the running game can answer. First: Archivist Wren has ONE hotspot and seven
// gated choices on the hub behind it, and the whole reason it is built that way is that seven
// hotspots on one body would be seven predicates that have to be mutually exclusive in every save
// state there will ever be. So this walks the arc from end to end and checks that exactly one step
// is ever open. Second: silver and gold were silent for two passes because every monster in the
// bestiary was the same lump of rock with two colours swapped — so this takes a silver contract
// and a gold one and looks at what stands up.
//
//   node js/dev/story.uitest.mjs [outdir]      KEEP_COPY=1 leaves the working copy behind
//
// Against a copy on its own port, never the working tree — DEV_CONTRACT §11.

import { launch, attach, sleep } from './cdp.mjs';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const COPY = path.resolve(ROOT, '../.wf-storytest');
const OUT = process.argv[2] || '/tmp/wf-storyshots';
const PORT = 8807;

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

const { proc, port, kill } = await launch({ port: 9344, profile: '/tmp/wf-cdp-story' });
const p = await attach(port, `http://127.0.0.1:${PORT}/index.html`);
check(await p.waitFor('!!(window.__wf && window.__wf.game && window.__wf.player)', 30000), 'the game booted');
await p.eval('try { localStorage.clear(); } catch (e) {} location.reload(); true');
await sleep(1200);
check(await p.waitFor('!!(window.__wf && window.__wf.game && window.__wf.player)', 30000), 'from an empty save');

// Registered, essences taken, gold rank — the arc runs the length of the ladder and this test is
// about the arc, not about climbing it.
await p.eval(`(async () => {
  const g = window.__wf.game;
  await g.loadEssenceTable();
  const m = await import('./js/game/essences.js');
  const r = m.resolve(g.essences.doc, ['doom', 'void', 'dark']);
  g.doc.essences = { picked: r.picked, confluence: r.confluence, abilities: r.abilities };
  for (let i = 0; i < 40; i++) {
    const a = m.awakenOne(g.essences.doc, g.doc.essences);
    if (!a) break;
    g.doc.essences.abilities.push(a.id);
  }
  Object.assign(g.doc.flags, {
    'society.test.passed': true, 'society.essences.chosen': true,
    'society.rank': 'gold', 'society.xp': 20000,
  });
  g.awokeKey = null;
  g.awakened();
  g.syncStanding();
  return true;
})()`);
await sleep(500);

// ── the boards ──────────────────────────────────────────────────────────────────────────────
const boards = await p.eval(`(async () => {
  const c = await import('./js/game/contracts.js');
  const m = await import('./js/game/missions.js');
  return JSON.stringify(Object.fromEntries(Object.entries(c.BOARDS).map(([k, b]) =>
    [k, { n: b.jobs.length, playable: b.jobs.filter(j => m.playable(j.id)).length }])));
})()`).then(JSON.parse);
for (const [id, b] of Object.entries(boards)) {
  check(b.playable === b.n, `${id}: all ${b.n} rows walkable (${b.playable}/${b.n})`);
}
check(Object.values(boards).reduce((a, b) => a + b.n, 0) >= 40,
  `${Object.values(boards).reduce((a, b) => a + b.n, 0)} contracts on the four boards`);

check(await p.eval('window.__wf.game.showScreen("board.silver")'), 'the silver board opens');
await sleep(500);
const takes = await p.eval('document.querySelectorAll("#game .g-take-b").length');
check(takes === boards['board.silver'].n, `every silver row has a Take on it (${takes})`);
await p.shot(`${OUT}/board-silver.png`);
await p.eval('window.__wf.game.board.close(); true');

// ── the four new silhouettes ────────────────────────────────────────────────────────────────
const beasts = await p.eval(`(async () => {
  const b = await import('./js/game/bestiary.js');
  const e = await import('./js/world/elemental.js');
  return JSON.stringify({
    kinds: b.KIND_IDS.length,
    builds: e.BUILD_IDS,
    drawn: [...new Set(b.KIND_IDS.map(id => b.describe({ kind: id }).build))],
    fresh: ['chant', 'tally', 'glass', 'verge'].map(id => {
      const d = b.describe({ kind: id });
      return { id, build: d.build, heals: d.heals, hp: d.tuning.hp, xp: d.xp };
    }),
  });
})()`).then(JSON.parse);
check(beasts.kinds === 14, `fourteen kinds in the bestiary (${beasts.kinds})`);
check(beasts.drawn.length === 4, `drawn as ${beasts.drawn.length} different silhouettes (${beasts.drawn.join(', ')})`);
for (const f of beasts.fresh) {
  check(!!f.build && f.hp > 0, `${f.id}: ${f.build}, ${f.hp} hp, mends off ${f.heals || 'nothing'}, worth ${f.xp}`);
}

// ── a silver contract, walked ───────────────────────────────────────────────────────────────
check(await p.eval('window.__wf.game.takeContract("silver.procession"), true'), 'took Break the Procession');
check(await p.waitFor('window.__wf.level.id === "arena"', 25000), 'and it walked out to the arena');
await sleep(2500);
await p.eval('window.__wf.game.combat.begin(); true');
await sleep(1500);
const room = await p.eval(`(() => {
  const g = window.__wf.game;
  return JSON.stringify({
    foes: g.combat.foes.length,
    names: g.combat.book.map(b => b.name),
    builds: [...new Set(g.combat.book.map(b => b.build))],
    bodies: g.combat.bodies.map(b => b.build),
  });
})()`).then(JSON.parse);
check(room.foes >= 2, `a procession stood up (${room.foes})`);
check(room.builds.includes('tall'), `and it is drawn tall, not as a lump of rock (${room.builds.join(', ')})`);
check(room.bodies.every(b => b === 'tall'), `and the bodies in the scene agree (${room.bodies.join(', ')})`);
await p.shot(`${OUT}/procession.png`);

// ── and a gold one ──────────────────────────────────────────────────────────────────────────
await p.eval('window.__wf.game.gotoLevel("society", { x: -9.5, z: -22.5, yaw: 3.14159, inside: 0 }); true');
await p.waitFor('window.__wf.level.id === "society"', 25000);
await sleep(2000);
await p.eval(`(() => { const g = window.__wf.game; g.doc.flags['contract.active'] = null; g.run = null; g.mission.set(null); return true; })()`);
check(await p.eval('window.__wf.game.takeContract("gold.tide"), true'), 'took The Tide at Marrow Sands');
check(await p.waitFor('window.__wf.level.id === "arena"', 25000), 'and that walked out too');
await sleep(2500);
await p.eval('window.__wf.game.combat.begin(); true');
await sleep(1500);
const gold = await p.eval(`(() => {
  const g = window.__wf.game;
  return JSON.stringify({ names: g.combat.book.map(b => b.name), hp: g.combat.foes.map(f => Math.round(f.max)), floor: g.combat.book.map(b => b.heals) });
})()`).then(JSON.parse);
check(gold.names.some(nm => /Verge/.test(nm)), `something gold-sized is standing in it (${gold.names.join(', ')})`);
check(Math.max(...gold.hp) > 250, `and it is the biggest thing in the game (${Math.max(...gold.hp)} hp)`);
await p.shot(`${OUT}/verge.png`);

await p.eval('window.__wf.game.gotoLevel("society", { x: -9.5, z: -22.5, yaw: 3.14159, inside: 0 }); true');
await p.waitFor('window.__wf.level.id === "society"', 25000);
await sleep(2000);
await p.eval(`(() => { const g = window.__wf.game; g.doc.flags['contract.active'] = null; g.run = null; g.mission.set(null); return true; })()`);

// ── the Long Count ──────────────────────────────────────────────────────────────────────────
// One hotspot on Wren, seven gated choices behind it. Walk the whole arc and assert that exactly
// one step is ever offered, whatever order the contracts were finished in.
check(await p.eval(`(() => {
  const g = window.__wf.game;
  const at = g.characters.at('archivist');
  return !!at && g.hotspots.candidates(at, ['interact']).length === 1;
})()`), 'Wren is on the floor with exactly one hotspot');

// Asked of the model rather than of the DOM: the hub has a line before its choices, so the
// buttons are not on screen until that line has played, and this test is about which choices are
// OPEN and not about how long a line takes to read.
const open = () => p.eval(`(async () => {
  const g = window.__wf.game;
  const d = await import('./js/game/dialogue.js');
  const node = g.dialogue.pack['society.wren.hub'];
  return JSON.stringify(d.visibleChoices(node, g.ctx).map(c => c.say));
})()`).then(JSON.parse);

// Open the hub and take the first choice on offer, which is always the gated one — "Nothing
// today" is authored last so it is the fallback rather than the first thing a thumb lands on.
// `pick(i)` indexes into the VISIBLE choices, so 0 is whichever step is open.
const walk = () => p.eval(`(() => {
  const g = window.__wf.game;
  g.dialogue.close();
  if (!g.say('society.wren.hub')) return 'the hub would not open';
  const d = g.dialogue;
  for (let i = 0; i < 60 && d.active; i++) { if (d.scene?.choosing) d.pick(0); else d.next(); }
  return d.active ? 'the conversation would not end' : 'ok';
})()`);

let choices = await open();
check(choices.length === 2 && /Who are you/.test(choices[0]),
  `before anything, she offers only who she is (${choices.join(' | ')})`);
check(await p.eval(`window.__wf.game.say('society.wren.hub')`), 'her hub opens');
await sleep(500);
await p.shot(`${OUT}/wren.png`);
check(await walk() === 'ok', 'and it can be walked to the end');
check(await p.eval('!!window.__wf.game.doc.flags["count.met"]'), 'and meeting her is remembered');

const STEPS = [
  ['iron.ledger', 1, 'tally book'],
  ['iron.claypit', 2, 'clay pit'],
  ['bronze.secondledger', 3, 'second book'],
  ['silver.wake', 4, 'four numbers'],
  ['silver.bells', 5, 'bells'],
  ['silver.procession', 6, 'procession'],
  ['gold.ledger', 7, 'closed'],
];

// Every contract in the arc marked done UP FRONT, which is the case that would break a ladder of
// seven hotspots: the player who cleared the whole board before ever speaking to her.
await p.eval(`(() => {
  const g = window.__wf.game;
  for (const id of ${JSON.stringify(STEPS.map(s2 => s2[0]))}) g.doc.flags['contract.done.' + id] = true;
  return true;
})()`);

for (const [job, step] of STEPS) {
  choices = await open();
  const offered = choices.filter(c => !/^Nothing today/.test(c));
  check(offered.length === 1,
    `step ${step}: exactly one thing to say, with every contract already done (${offered.join(' | ') || 'none'})`);
  check(await walk() === 'ok', `  and it plays through (${offered[0] || '—'})`);
  check(await p.eval(`!!window.__wf.game.doc.flags["count.${step}.seen"]`), `  and step ${step} is remembered (${job})`);
}

choices = await open();
check(choices.length === 1 && /Nothing today/.test(choices[0]),
  `the arc is finished and she has nothing left (${choices.join(' | ')})`);
check(await p.eval('!!window.__wf.game.doc.flags["count.closed"]'), 'and the ledger is closed');
await walk();

const badLogs = p.logs().filter(l => (l.level === 'exception' || l.level === 'error') && !/favicon\.ico/.test(l.text));
check(badLogs.length === 0, `nothing threw (${badLogs.slice(0, 2).map(l => l.text.split('\n')[0]).join(' | ') || 'clean'})`);

console.log(`\n${fails ? `${fails} FAILED` : 'all passed'} — shots in ${OUT}`);
kill();
server.kill();
if (!process.env.KEEP_COPY) fs.rmSync(COPY, { recursive: true, force: true });
process.exit(fails ? 1 : 0);
