// The proving, driven. The unit tests prove the elemental's arithmetic and the floor's; this
// proves the things only the running game can answer — that a conversation can move the player to
// another level without a page reload, that the fight spawns and can be won, that winning writes
// the flag and brings him back to the desk, and that the floor he fought on decided it.
//
//   node js/dev/proving.uitest.mjs [outdir]      KEEP_COPY=1 leaves the working copy behind
//
// Against a copy on its own port, never the working tree — DEV_CONTRACT §11.

import { launch, attach, sleep } from './cdp.mjs';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const COPY = path.resolve(ROOT, '../.wf-provingtest');
const OUT = process.argv[2] || '/tmp/wf-provingshots';
const PORT = 8801;

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

const { proc, port } = await launch({ port: 9338, profile: '/tmp/wf-cdp-proving' });
const p = await attach(port, `http://127.0.0.1:${PORT}/index.html`);
check(await p.waitFor('!!(window.__wf && window.__wf.game && window.__wf.player)', 30000), 'the game booted');
check(await p.eval('window.__wf.level.id === "society"'), 'it starts in the Society');

await p.eval(`(() => {
  const P = window.__wf.player;
  window.__pilot = { target: null, attack: false };
  P.input.read = () => {
    const t = window.__pilot.target;
    const a = window.__pilot.attack;
    window.__pilot.attack = false;
    if (!t) return { mx: 0, my: 0, lx: 0, ly: 0, sprint: false, attack: a };
    const dx = t.x - P.pos.x, dz = t.z - P.pos.z, yaw = P.moveYaw;
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    const my = dx * fx + dz * fz, mx = dz * fx - dx * fz;
    const m = Math.hypot(mx, my) || 1;
    return { mx: mx / m, my: my / m, lx: 0, ly: 0, sprint: false, attack: a };
  };
  return true;
})()`);

const state = () => p.eval(`(() => {
  const g = window.__wf.game, P = window.__wf.player;
  return {
    level: window.__wf.level.id, hp: g.combat.vitals.hp, ended: g.combat.ended,
    foes: g.combat.foes.map(f => ({ s: f.state, hp: +f.hp.toFixed(1), dirt: !!f.onDirt })),
    armed: !!P.hand.visible, passed: !!g.doc.flags['society.test.passed'],
    at: [+P.pos.x.toFixed(1), +P.pos.z.toFixed(1)],
  };
})()`);

// ── the swap ────────────────────────────────────────────────────────────────────────────────
await p.eval('window.__wf.game.gotoLevel("proving", { x: 0, z: 15, yaw: 3.14159 }); true');
check(await p.waitFor('window.__wf.level.id === "proving"', 20000), 'moved to the proving floor with no reload');
check(await p.eval('performance.getEntriesByType("navigation").length === 1'), 'and really did not reload');
await sleep(2500);
let s = await state();
check(s.armed, 'the proving knife is in hand');
check(s.foes.length === 1, `one elemental is standing (${s.foes.length})`);
check(s.foes[0]?.dirt === true, 'it starts on the dirt quarter, mending');
await p.shot(`${OUT}/arrived.png`);

// ── the floor decides it ────────────────────────────────────────────────────────────────────
// Held on the dirt and cut relentlessly, it must not die. The unit test proves the arithmetic;
// this proves the arena's own floor is wired to it.
await p.eval(`(() => {
  const g = window.__wf.game;
  window.__pin = setInterval(() => {
    const f = g.combat.foes[0];
    if (f) { f.x = -11; f.z = -11; }
    const P = window.__wf.player;
    P.pos.x = -11; P.pos.z = -8.6; P.yaw = Math.PI;
    window.__pilot.attack = true;
  }, 60);
  return true;
})()`);
await sleep(9000);
s = await state();
check(!s.ended, `it survived nine seconds of knife on dirt (ended: ${s.ended})`);
check(s.foes[0] && s.foes[0].hp > 40, `and stayed above half — ${s.foes[0]?.hp} hp`);
await p.shot(`${OUT}/on-dirt.png`);

// ── the same knife on flagstone ─────────────────────────────────────────────────────────────
await p.eval(`(() => {
  clearInterval(window.__pin);
  const g = window.__wf.game;
  window.__pin = setInterval(() => {
    const f = g.combat.foes[0];
    if (f) { f.x = 0; f.z = 0; }
    const P = window.__wf.player;
    P.pos.x = 0; P.pos.z = 2.4; P.yaw = Math.PI;
    window.__pilot.attack = true;
  }, 60);
  return true;
})()`);
check(await p.waitFor('window.__wf.game.combat.ended === "won"', 30000), 'on the stone the same knife killed it');
s = await state();
check(s.passed, 'the proving flag was written');
await p.eval('clearInterval(window.__pin); window.__pilot.attack = false; true');
await p.shot(`${OUT}/won.png`);

// ── and back to the desk ────────────────────────────────────────────────────────────────────
check(await p.waitFor('window.__wf.level.id === "society"', 20000), 'it took him back to the Society');
await sleep(2500);
s = await state();
check(!s.armed, 'the knife went back to the quartermaster');
check(s.foes.length === 0, 'nothing followed him home');
check(Math.hypot(s.at[0] + 9.5, s.at[1] + 22.5) < 6, `he is at the desk (${s.at.join(', ')})`);

// The Registrar has to have something new to say, or the quest is a flag nobody reads.
const node = await p.eval(`(() => {
  const g = window.__wf.game, at = g.characters.at('greeter');
  const h = g.hotspots.candidates(at, ['interact'])[0];
  return h ? h.actions.find(a => a.k === 'say')?.node : null;
})()`);
check(node === 'society.greeter.essences', `she now talks about essences (got ${node})`);
await p.shot(`${OUT}/back.png`);

// ── the essence table ───────────────────────────────────────────────────────────────────────
// The choice the proving unlocks. Driven through the real screen, because the thing worth proving
// is that the sheet renders every essence, updates the confluence as the third is taken, and
// writes something the save keeps.
check(await p.eval('window.__wf.game.showScreen("essences") !== false'), 'the essence table opens');
check(await p.waitFor('!!(window.__wf.game.essences && window.__wf.game.essences.open)', 15000), 'and is on screen');
const cards = await p.eval('document.querySelectorAll("#game .g-esslist .g-ess").length');
check(cards >= 9, `all ${cards} essences are on one sheet`);
check(await p.eval('document.querySelectorAll("#game .g-abils .g-abil").length >= 45'),
  'every essence shows what it could become, not only what you would wake');

// Clicked, not called: a button that is not a button is the fault this project has hit before.
const clickEssence = async name => p.eval(`(() => {
  const b = [...document.querySelectorAll('#game .g-esslist .g-ess')]
    .find(n => n.querySelector('h3')?.textContent === ${JSON.stringify(name)});
  if (!b) return false;
  b.click();
  return true;
})()`);
for (const n of ['Blood', 'Dark']) check(await clickEssence(n), `took ${n}`);
check(!(await p.eval('!!document.querySelector("#game .g-take")')), 'nothing to confirm with only two');
check(await clickEssence('Doom'), 'took Doom');
const banner = await p.eval('document.querySelector("#game .g-standing b")?.textContent || ""');
check(/Sin/.test(banner), `the confluence is named before you commit (${banner})`);
check(await p.eval('document.querySelectorAll("#game .g-grant-row").length === 4'),
  'it lists one ability from each of the four');
await p.shot(`${OUT}/essences.png`);

// A fourth must be refused, not silently swallowed.
check(!(await clickEssence('Fire')) || await p.eval('window.__wf.game.essences.picked.length === 3'),
  'a fourth essence was refused');

check(await p.eval('document.querySelector("#game .g-take").click(), true'), 'confirmed');
await sleep(600);
const chose = await p.eval('JSON.stringify(window.__wf.game.doc.essences)').then(JSON.parse);
check(chose.picked.join(',') === 'blood,dark,doom', `the save has the triple (${chose.picked})`);
check(chose.confluence === 'sin', `and the confluence it made (${chose.confluence})`);
check(chose.abilities.length === 4, `and four abilities (${chose.abilities.length})`);
check(await p.eval('!!window.__wf.game.doc.flags["society.essences.chosen"]'), 'the flag is set');

// Reopening shows what you have rather than the table again, and the Registrar has moved on.
check(await p.eval('window.__wf.game.showScreen("essences"), true'), 'the sheet reopens');
await sleep(400);
check(await p.eval('!document.querySelector("#game .g-take")'), 'and it is a sheet now, not a picker');
await p.eval('window.__wf.game.essences.close(); true');
const after = await p.eval(`(() => {
  const g = window.__wf.game, at = g.characters.at('greeter');
  const h = g.hotspots.candidates(at, ['interact'])[0];
  return h ? h.actions.find(a => a.k === 'say')?.node : null;
})()`);
check(after === 'society.greeter.member', `Vail signs you up next (got ${after})`);

console.log(`\n${fails ? `${fails} FAILED` : 'all passed'} — shots in ${OUT}`);
proc.kill();
server.kill();
if (!process.env.KEEP_COPY) fs.rmSync(COPY, { recursive: true, force: true });
process.exit(fails ? 1 : 0);
