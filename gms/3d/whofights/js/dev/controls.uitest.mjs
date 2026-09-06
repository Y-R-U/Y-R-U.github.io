// The controls, driven with real events. Space is a jump, the left button is an attack and the
// right button opens the interact menu — and none of those three is provable from a unit test,
// because every one of them is a browser event reaching a system through two other systems.
//
//   node js/dev/controls.uitest.mjs [outdir]     KEEP_COPY=1 leaves the working copy behind
//
// Against a copy on its own port, never the working tree — DEV_CONTRACT §11.

import { launch, attach, sleep } from './cdp.mjs';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const COPY = path.resolve(ROOT, '../.wf-controlstest');
const OUT = process.argv[2] || '/tmp/wf-controlshots';
const PORT = 8802;

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

const { proc, port } = await launch({ port: 9339, profile: '/tmp/wf-cdp-controls' });
const p = await attach(port, `http://127.0.0.1:${PORT}/index.html`);
check(await p.waitFor('!!(window.__wf && window.__wf.game && window.__wf.player)', 30000), 'the game booted');
await sleep(1200);

const key = async (code, type) => p.send('Input.dispatchKeyEvent', {
  type, code, key: code === 'Space' ? ' ' : code, windowsVirtualKeyCode: code === 'Space' ? 32 : 0,
});
const press = async (x, y, button) => {
  const b = button === 2 ? 'right' : 'left';
  const mask = button === 2 ? 2 : 1;
  await p.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: b, buttons: mask, clickCount: 1 });
  await sleep(60);
  await p.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: b, buttons: 0, clickCount: 1 });
};

const st = () => p.eval(`(() => {
  const P = window.__wf.player, g = window.__wf.game;
  return { y: +P.pos.y.toFixed(3), air: !!P.airborne, vy: +P.vy.toFixed(2), swing: +P.swing.toFixed(2),
    menu: !!g.menuAt.open, spells: !!g.spells.open };
})()`);

// ── Space is a jump, and only a jump ────────────────────────────────────────────────────────
const before = await st();
check(!before.air, 'he starts on the ground');
await key('Space', 'keyDown');
await key('Space', 'keyUp');
await sleep(90);
let s = await st();
check(s.air, 'Space put him in the air');
check(s.y > before.y + 0.05, `and he actually went up (${before.y} → ${s.y})`);
check(s.swing < 0.05, 'Space did not also swing the knife');
await p.shot(`${OUT}/jump.png`);

// He has to come down, and land where he started.
check(await p.waitFor('!window.__wf.player.airborne', 6000), 'and he came down again');
s = await st();
check(Math.abs(s.y - before.y) < 0.25, `landing put him back on the floor (${s.y} vs ${before.y})`);

// A second jump while already airborne is not a second jump.
await key('Space', 'keyDown'); await key('Space', 'keyUp');
await sleep(140);
const mid = await st();
await key('Space', 'keyDown'); await key('Space', 'keyUp');
await sleep(60);
const after = await st();
check(after.vy <= mid.vy + 0.01, `no double jump (vy ${mid.vy} → ${after.vy})`);
await p.waitFor('!window.__wf.player.airborne', 6000);

// ── the left button attacks ─────────────────────────────────────────────────────────────────
await p.eval('window.__wf.player.swing = 0; true');
await press(700, 500, 0);
await sleep(90);
s = await st();
check(s.swing > 0.4, `left click swung the knife (swing ${s.swing})`);
check(!s.menu, 'and did not open the menu');

// ── the right button opens the interact menu ────────────────────────────────────────────────
await press(700, 500, 2);
await sleep(300);
s = await st();
check(s.menu, 'right click opened the interact menu');
const rows = await p.eval(`JSON.stringify([...document.querySelectorAll('#game .g-imenu-b')]
  .map(n => [n.querySelector('b').textContent, n.querySelector('span').textContent, !n.classList.contains('off')]))`)
  .then(JSON.parse);
check(rows.length === 3, `three options (${rows.length})`);
check(rows[0][0] === 'Cast a spell' && rows[1][0] === 'Talk' && rows[2][0] === 'Trade offer',
  `the three Aaron asked for (${rows.map(r => r[0]).join(', ')})`);
check(rows.every(r => r[1].length > 3), 'every one says what it is or why it is not');
await p.shot(`${OUT}/menu.png`);

// Nothing is castable before the essence table, and it says so rather than opening nothing.
check(rows[0][2] === false, 'casting is shut with no essences');
await p.eval(`[...document.querySelectorAll('#game .g-imenu-b')][0].click(), true`);
await sleep(300);
check(!(await st()).spells, 'a shut option did not open a sheet');
check(await p.eval('!!document.querySelector("#game .g-toast, #game .g-low")'), 'it said why instead');

// With essences, it opens and lists them.
await p.eval(`(async () => {
  const g = window.__wf.game;
  await g.loadEssenceTable();
  g.takeEssences({ picked: ['blood', 'dark', 'doom'], confluence: 'sin', confluenceName: 'Sin',
    abilities: ['blood.price', 'dark.step', 'doom.mark', 'sin.tally'] });
  g.menuAt.close();
  return true;
})()`);
await sleep(400);
await press(700, 500, 2);
await sleep(300);
const rows2 = await p.eval(`JSON.stringify([...document.querySelectorAll('#game .g-imenu-b')]
  .map(n => [n.querySelector('span').textContent, !n.classList.contains('off')])) `).then(JSON.parse);
check(rows2[0][1] === true && /4 awakened/.test(rows2[0][0]), `casting is open now (${rows2[0][0]})`);
await p.eval(`[...document.querySelectorAll('#game .g-imenu-b')][0].click(), true`);
await sleep(400);
check((await st()).spells, 'the ability sheet opened');
const spells = await p.eval('document.querySelectorAll("#game .g-castable").length');
check(spells === 4, `it lists the four awakened abilities (${spells})`);
await p.shot(`${OUT}/spells.png`);

console.log(`\n${fails ? `${fails} FAILED` : 'all passed'} — shots in ${OUT}`);
proc.kill();
server.kill();
if (!process.env.KEEP_COPY) fs.rmSync(COPY, { recursive: true, force: true });
process.exit(fails ? 1 : 0);
