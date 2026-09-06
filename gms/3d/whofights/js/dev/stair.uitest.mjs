// The grand stair, driven. Five storeys of one room is the whole of Phase 1 and none of it is
// provable from a unit test: the helix maths has its own suite, but whether a player can actually
// walk in off the square, be carried up a flight, be turned back at a rank they have not earned,
// and get down again is a question about doors.js, climb.js, the collider set and the save all at
// once.
//
//   node js/dev/stair.uitest.mjs [outdir]        KEEP_COPY=1 leaves the working copy behind
//
// Against a copy on its own port, never the working tree — DEV_CONTRACT §11.

import { launch, attach, sleep } from './cdp.mjs';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const COPY = path.resolve(ROOT, '../.wf-stairtest');
const OUT = process.argv[2] || '/tmp/wf-stairshots';
const PORT = 8799;

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

const { proc, port } = await launch({ port: 9337, profile: '/tmp/wf-cdp-stair' });
const p = await attach(port, `http://127.0.0.1:${PORT}/index.html`);
check(await p.waitFor('!!(window.__wf && window.__wf.game && window.__wf.player)', 30000), 'the game booted');

// A pilot that walks at a world point, and the room-local ↔ world transform the climb uses, so a
// landing can be named the way the interior names it.
await p.eval(`(() => {
  const P = window.__wf.player;
  window.__pilot = { target: null };
  P.input.read = () => {
    const t = window.__pilot.target;
    if (!t) return { mx: 0, my: 0, lx: 0, ly: 0, sprint: false, attack: false };
    const dx = t.x - P.pos.x, dz = t.z - P.pos.z, yaw = P.moveYaw;
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    const my = dx * fx + dz * fz, mx = dz * fx - dx * fz;
    const m = Math.hypot(mx, my) || 1;
    return { mx: mx / m, my: my / m, lx: 0, ly: 0, sprint: false, attack: false };
  };
  window.__world = l => {
    const c = window.__wf.doors.climb;
    return { x: c.ox + l.x * c.cs + l.z * c.sn, y: c.oy + l.y, z: c.oz - l.x * c.sn + l.z * c.cs };
  };
  window.__landing = (i, up) => {
    const g = window.__wf.doors.interior.landings().find(l => l.i === i && l.up === up);
    return g ? window.__world(g) : null;
  };
  window.__rank = r => { window.__wf.game.doc.flags['society.rank'] = r; };
  // Every question the stair asked the rank gate, and every answer. The gate is only half the
  // feature — being turned back is meant to be a person saying so — and a refusal that never
  // fires looks exactly like a wall.
  const c = window.__wf.doors.climb;
  const inner = c.gate;
  window.__gate = [];
  c.gate = (from, to) => { const why = inner ? inner(from, to) : null; window.__gate.push([from, to, why]); return why; };
  // And every conversation the refusal path tried to open, with whether it opened. The seen list
  // alone cannot tell 'nobody was refused' from 'somebody was, and the node would not open'.
  const g = window.__wf.game;
  const said = g.say.bind(g);
  window.__said = [];
  g.say = id => { const ok = said(id); window.__said.push([id, ok]); return ok; };
  return true;
})()`);

const state = () => p.eval(`(() => {
  const P = window.__wf.player, D = window.__wf.doors, I = D.interior;
  return { y: +P.pos.y.toFixed(2), x: +P.pos.x.toFixed(2), z: +P.pos.z.toFixed(2),
    state: D.state, floors: I ? I.floors : 0, level: I ? +(I.level).toFixed(2) : null,
    onStair: !!(I && I.onStair), climb: D.climb.report(),
    limit: I ? I.climbLimit : null,
    floorYs: I ? [0, 1, 2].map(n => +I.floorY(n).toFixed(2)) : null,
    refused: D.climb.refused, rank: window.__wf.game.doc.flags['society.rank'] || null };
})()`);

const drive = async (to, secs = 8) => {
  await p.eval(`window.__pilot.target = ${JSON.stringify(to)}; true`);
  await sleep(secs * 1000);
  await p.eval('window.__pilot.target = null; true');
  await sleep(400);
};

// ── inside ──────────────────────────────────────────────────────────────────────────────────
check(await p.eval('window.__wf.doors.jump(0)'), 'walked in through the great doorway');
await sleep(1200);
let s = await state();
check(s.state === 'in', `inside the Society (state ${s.state})`);
check(s.floors === 5, `the room has five storeys (got ${s.floors})`);
const ground = s.y;

// ── the gate turns an unranked player back ──────────────────────────────────────────────────
await p.eval('window.__rank("none"); true');
const up0 = await p.eval('JSON.stringify(window.__landing(0, true))').then(JSON.parse);
check(!!up0, `the ground floor has a landing to climb from (${JSON.stringify(up0)})`);
await drive({ x: up0.x, z: up0.z }, 6);
const centre = await p.eval(`(() => { const c = window.__wf.doors.interior.stairCentre();
  return JSON.stringify(window.__world({ x: c.x, y: 0, z: c.z })); })()`).then(JSON.parse);
await drive({ x: centre.x, z: centre.z }, 4);
s = await state();
check(Math.abs(s.y - ground) < 1.0, `unranked, the stair did not carry him up (y ${s.y} vs ${ground})`);
check(await p.eval('!!window.__wf.game.doc.flags["society.doorway.seen"] || true'), 'session is live');
// Being turned back is meant to be a person saying so, not a wall. Warden Bel is the one at the
// foot of the flight, and this is the unranked half of the rule.
const saidSoFar = () => p.eval('JSON.stringify(window.__said)').then(JSON.parse);
check((await saidSoFar()).some(([id, ok]) => id === 'society.stair.refuse.iron' && ok),
  `Bel came over to say so (${JSON.stringify(await saidSoFar())})`);
// And it stays open until it is read, which is the point of it — but it also means every later
// refusal is dropped rather than stacked, so the test has to read it before asking again.
await p.eval('window.__wf.game.dialogue.close(); window.__said.length = 0; true');

// ── with iron rank it does ──────────────────────────────────────────────────────────────────
await p.eval('window.__rank("iron"); true');
await drive({ x: up0.x, z: up0.z }, 5);
await drive({ x: centre.x, z: centre.z }, 9);
s = await state();
const iron = s.y;
check(iron - ground > 5, `iron rank climbed a storey (${ground} → ${iron})`);
check(s.state === 'in', 'still inside after the climb');
await p.shot(`${OUT}/floor1.png`);

// ── and stops at the next one ───────────────────────────────────────────────────────────────
// Every refusal conversation the box has opened. The gate is only half the feature — being turned
// back is meant to be somebody saying so, and the aim test that decides whether the stair noticed
// you at all is the part that was rewritten.
await p.eval('window.__wf.game.dialogue.close(); window.__said.length = 0; true');
const up1 = await p.eval('JSON.stringify(window.__landing(1, true))').then(JSON.parse);
check(!!up1, 'the Iron floor has a landing of its own');
await drive({ x: up1.x, z: up1.z }, 6);
await drive({ x: centre.x, z: centre.z }, 6);
s = await state();
const asked = await p.eval('JSON.stringify(window.__gate)').then(JSON.parse);
const said = await p.eval('JSON.stringify(window.__said)').then(JSON.parse);
// A step or two onto the flight before the room pushes him back off it is expected and is what a
// player walking into a stair they may not use should feel. A storey is ~7.9 m; the rule is that
// he did not climb one. The old 1.0 m was inside the noise of where the push-off catches him and
// failed about one run in three.
check(s.y - iron < 2.5,
  `iron rank was turned back from bronze (y ${s.y} vs ${iron}; ${JSON.stringify({ limit: s.limit, floorYs: s.floorYs, onStair: s.onStair, rank: s.rank })})`);
check(said.some(([id, ok]) => id === 'society.stair.refuse.bronze' && ok),
  `and a person came over to say so (said ${JSON.stringify(said)}; gate asked ${JSON.stringify(asked.slice(0, 8))})`);

// ── gold rank walks the whole building ──────────────────────────────────────────────────────
await p.eval('window.__rank("gold"); true');
let last = iron;
for (const floor of [1, 2, 3]) {
  const g = await p.eval(`JSON.stringify(window.__landing(${floor}, true))`).then(JSON.parse);
  if (!g) { check(false, `no up-landing on floor ${floor}`); break; }
  await drive({ x: g.x, z: g.z }, 5);
  await drive({ x: centre.x, z: centre.z }, 9);
  s = await state();
  check(s.y - last > 5, `gold rank climbed to floor ${floor + 1} (${last} → ${s.y})`);
  last = s.y;
  await p.shot(`${OUT}/floor${floor + 1}.png`);
}
check(last - ground > 28, `reached the top of the building (${(last - ground).toFixed?.(2) ?? last} m up)`);

// ── and back down ───────────────────────────────────────────────────────────────────────────
for (const floor of [4, 3, 2, 1]) {
  const g = await p.eval(`JSON.stringify(window.__landing(${floor}, false))`).then(JSON.parse);
  if (!g) { check(false, `no down-landing on floor ${floor}`); break; }
  await drive({ x: g.x, z: g.z }, 5);
  await drive({ x: centre.x, z: centre.z }, 9);
}
s = await state();
check(Math.abs(s.y - ground) < 1.2, `walked all the way back down (y ${s.y} vs ${ground})`);
await p.shot(`${OUT}/back-down.png`);

// ── the boards answer on their own storey and no other ──────────────────────────────────────
const boards = await p.eval(`(() => {
  const g = window.__wf.game, hs = g.hotspots;
  const out = [];
  for (const h of hs.list.filter(x => x.id.startsWith('hs.board.') && x.shape && x.shape.y != null)) {
    const at = { x: h.shape.x, z: h.shape.z, y: h.shape.y };
    out.push([h.id, hs.candidates(at, ['click']).map(c => c.id)]);
  }
  return JSON.stringify(out);
})()`).then(JSON.parse);
for (const [id, answered] of boards) {
  check(answered.length === 1 && answered[0] === id, `${id} answers alone on its floor (${answered.join(', ')})`);
}

console.log(`\n${fails ? `${fails} FAILED` : 'all passed'} — shots in ${OUT}`);
proc.kill();
server.kill();
if (!process.env.KEEP_COPY) fs.rmSync(COPY, { recursive: true, force: true });
process.exit(fails ? 1 : 0);
