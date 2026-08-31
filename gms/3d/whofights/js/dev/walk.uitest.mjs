// Regression: the player can always walk away from a wall he has run into. A wedge between two
// colliders used to be the whole failure class — every step reverts to where it began and no input
// escapes it — so this drives him at every face of the castle at sprint speed and then asks each
// of eight directions to get him off it.
//
//   node js/dev/walk.uitest.mjs [outdir]        KEEP_COPY=1 leaves the working copy behind
//
// Against a copy on its own port, never the working tree — DEV_CONTRACT §11.

import { launch, attach, sleep } from './cdp.mjs';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const COPY = path.resolve(ROOT, '../.wf-walktest');
const OUT = process.argv[2] || '/tmp/wf-walkshots';
const PORT = 8798;
// A wall stops him, so "moved" is about getting off it sideways, not about distance covered.
const ESCAPE = 1.5;

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

const { proc, port } = await launch({ port: 9336, profile: '/tmp/wf-cdp-walk' });
const p = await attach(port, `http://127.0.0.1:${PORT}/index.html`);
check(await p.waitFor('!!(window.__wf && window.__wf.game && window.__wf.player)', 30000), 'the game booted');

await p.eval(`(() => {
  const P = window.__wf.player;
  window.__pilot = { mx: 0, my: 0, target: null };
  P.input.read = () => {
    const t = window.__pilot.target;
    if (t) {
      const dx = t.x - P.pos.x, dz = t.z - P.pos.z, yaw = P.moveYaw;
      const fx = Math.sin(yaw), fz = Math.cos(yaw);
      const my = dx * fx + dz * fz, mx = dz * fx - dx * fz;
      const m = Math.hypot(mx, my) || 1;
      return { mx: mx / m, my: my / m, lx: 0, ly: 0, sprint: true, attack: false, interact: false };
    }
    return { ...window.__pilot, lx: 0, ly: 0, sprint: true, attack: false, interact: false };
  };
  window.__put = (x, z) => { P.pos.x = x; P.pos.z = z; P.vel.set(0, 0, 0);
    P.pos.y = window.__wf.walk.groundAt(x, z, 4); P.moveYaw = P.camYaw = 0; };
  return true;
})()`);

const at = () => p.eval('(() => { const P = window.__wf.player; return [+P.pos.x.toFixed(2), +P.pos.z.toFixed(2)]; })()');
const drive = async (mx, my, ms) => { await p.eval(`window.__pilot = { mx: ${mx}, my: ${my}, target: null }`); await sleep(ms); };

async function runAt(x0, z0, mx, my, label) {
  await p.eval(`window.__put(${x0}, ${z0}); window.__pilot = { mx: 0, my: 0, target: null }`);
  await sleep(150);
  await drive(mx, my, 2200);
  const hit = await at();
  let best = 0;
  for (const [ax, ay] of [[0, 1], [0, -1], [1, 0], [-1, 0], [0.7, 0.7], [-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7]]) {
    await drive(ax, ay, 500);
    const a = await at();
    best = Math.max(best, Math.hypot(a[0] - hit[0], a[1] - hit[1]));
    await p.eval(`window.__put(${hit[0]}, ${hit[1]})`);
    await sleep(60);
  }
  await drive(0, 0, 60);
  check(best > ESCAPE, `${label}: stopped at ${hit.join(', ')} and got ${best.toFixed(2)} m away`);
}

// __put pins moveYaw to 0, so my = +1 walks toward +z and mx = +1 toward −x (the stick's right
// vector is (−cos yaw, sin yaw) — see js/player.js).
for (const x of [-16, -8, 0, 8, 16]) await runAt(x, -38, 0, 1, `the castle's back wall at x=${x}`);
for (const z of [-28, -16, -4]) {
  await runAt(-30, z, -1, 0, `the castle's west wall at z=${z}`);
  await runAt(30, z, 1, 0, `the castle's east wall at z=${z}`);
  await runAt(-36, z, 1, 0, `the perimeter wall at z=${z}`);
}
for (const x of [-14, 14]) await runAt(x, 8, 0, -1, `the castle's front wall at x=${x}`);

// And the same inside the hall, which is where the report came from: walk in through the door,
// then run the length of it into the back wall.
// Lined up on the road first: from off to one side he walks into the front wall instead of the
// doorway, and the door script never takes him.
await p.eval('window.__put(0, 14); window.__pilot = { target: { x: 0, z: 6 } }');
await p.waitFor('Math.abs(window.__wf.player.pos.x) < 1.5 && window.__wf.player.pos.z < 7', 20000);
await p.eval('window.__pilot = { target: { x: 0, z: -8 } }');
const inside = await p.waitFor('window.__wf.player.indoor === 1 && !!window.__wf.player.confine', 25000);
check(inside, 'the player is inside the hall');
if (inside) {
  await p.eval('window.__pilot = { target: { x: 0, z: -40 } }');
  await sleep(5000);
  const hit = await at();
  let best = 0;
  for (const [x, z] of [[0, 20], [-30, -20], [30, -20]]) {
    await p.eval(`window.__pilot = { target: { x: ${x}, z: ${z} } }`);
    await sleep(1200);
    const a = await at();
    best = Math.max(best, Math.hypot(a[0] - hit[0], a[1] - hit[1]));
    await p.eval(`window.__put(${hit[0]}, ${hit[1]})`);
    await sleep(120);
  }
  check(best > ESCAPE, `the hall's back wall: stopped at ${hit.join(', ')} and got ${best.toFixed(2)} m away`);
  await p.shot(`${OUT}/hall-back-wall.png`);
}

console.log(p.logs().filter(l => l.level === 'error' || l.level === 'exception')
  .map(l => `  console: ${l.text}`).join('\n'));

p.close();
proc.kill();
server.kill();
if (!process.env.KEEP_COPY) fs.rmSync(COPY, { recursive: true, force: true });
console.log(fails ? `\n${fails} failed` : '\nall walls let go');
process.exit(fails ? 1 : 0);
