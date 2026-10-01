// Floor Fall pacing + bot recovery on the real World (node): node tools/mg_floorfall_test.mjs [rounds]
// QA M2: bots should rarely need the unstick() teleport. QA M3: rounds should last ~60–90 s, not ~20 s.
import { World } from '../js/world/world.js';

globalThis.localStorage ??= { getItem: () => null, setItem() {} };
let seed = 0x5eed;   // deterministic rounds, so the pacing numbers are reproducible
Math.random = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const { default: floorfall } = await import('../js/minigames/games/floorfall.js');
const { createArena } = await import('../js/minigames/arena.js');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const ROUNDS = +(process.argv[2] || 4);
const DT = 1 / 30;

// A kid who keeps moving: every ~0.5 s walk onto a random solid, uncracked neighbouring tile.
function makePlayer(world, mode) {
  const P = { pos: { x: 0, y: 0, z: 0 }, onGround: false, vy: 0, yaw: 0, pitch: 0, goal: null, think: 0 };
  P.teleport = (x, y, z) => { P.pos.x = x; P.pos.y = y; P.pos.z = z; P.vy = 0; };
  const solid = (x, y, z) => world.isSolidSub(x * 4 + 2, y * 4 + 2, z * 4 + 2);
  P.step = (dt, cracks) => {
    const p = P.pos, fx = Math.floor(p.x), fz = Math.floor(p.z), fy = Math.floor(p.y - 0.05);
    if (!solid(fx, fy, fz)) {
      P.onGround = false; P.vy = Math.max(P.vy - 22 * dt, -30);
      const ny = p.y + P.vy * dt;
      if (solid(fx, Math.floor(ny), fz)) { p.y = Math.floor(ny) + 1; P.vy = 0; P.onGround = true; } else p.y = ny;
      return;
    }
    P.onGround = true;
    if (mode !== 'wander') return;
    if ((P.think -= dt) <= 0 || !P.goal) {
      P.think = 0.45;
      const opts = [];
      for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
        if (!dx && !dz) continue;
        if (solid(fx + dx, fy, fz + dz) && !cracks.has(`${fx + dx},${fy},${fz + dz}`)) opts.push([fx + dx, fz + dz]);
      }
      P.goal = opts.length ? opts[Math.floor(Math.random() * opts.length)] : null;
    }
    if (P.goal) {
      const dx = P.goal[0] + 0.5 - p.x, dz = P.goal[1] + 0.5 - p.z, d = Math.hypot(dx, dz);
      if (d > 0.05) { const s = Math.min(d, 4.3 * dt); p.x += (dx / d) * s; p.z += (dz / d) * s; }
    }
  };
  return P;
}

async function round(level, mode) {
  const world = new World({ seed: 'mg-floorfall', mode: 'minigame', sync: true });
  let result = null;
  const hud = new Proxy({}, { get: () => () => {} });
  const ctx = { world, settings: { get: () => null }, session: { mode: 'minigame' }, sky: null, input: { enabled: true, releaseAll() {}, requestPointer() {} }, fx: null, audio: null };
  ctx.player = makePlayer(world, mode);
  const A = createArena(ctx, floorfall, null);
  floorfall.build(A);
  const mg = { ctx, arena: A, hud, level, variant: null, finish(r) { result = r; } };
  await floorfall.start(mg);
  let t = 0;
  while (!result && t < 240) {
    ctx.player.step(DT, floorfall.cracks);
    floorfall.update(DT);
    t += DT;
  }
  const unsticks = floorfall.bots.reduce((a, b) => a + (b.stuckCount || 0), 0);
  const r = { level, mode, t: +floorfall.t.toFixed(1), unsticks, won: result?.won };
  floorfall.end();
  return r;
}

const rows = [];
for (const level of ['easy', 'normal', 'hard']) for (let i = 0; i < ROUNDS; i++) rows.push(await round(level, i % 2 ? 'still' : 'wander'));
for (const r of rows) console.log(`  ${r.level.padEnd(6)} ${r.mode.padEnd(6)} round ${String(r.t).padStart(5)} s  unstick ${r.unsticks}  ${r.won ? 'won' : 'lost'}`);
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const wander = rows.filter((r) => r.mode === 'wander').map((r) => r.t);
const tMed = med(rows.map((r) => r.t));
const uMax = Math.max(...rows.map((r) => r.unsticks)), uMed = med(rows.map((r) => r.unsticks));
ok(tMed >= 50 && tMed <= 110, `median round length ${tMed} s (want ~60–90)`);
ok(med(wander) >= 50, `a moving player's median round ${med(wander)} s`);
ok(uMed <= 2 && uMax <= 5, `unstick hops per round: median ${uMed}, max ${uMax} (want rare)`);
const card = floorfall.minutes;
ok(Math.abs(card * 60 - tMed) <= 60, `the card says ${card} min, rounds run ${tMed} s`);
console.log(`mg_floorfall_test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
