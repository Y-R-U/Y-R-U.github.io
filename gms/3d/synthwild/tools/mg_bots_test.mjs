// Bot pathing + movement tests (node): node tools/mg_bots_test.mjs
import { makeGrid, findPath, neighbours } from '../js/minigames/bots/path.js';
import { Bot } from '../js/minigames/bots/bot.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };

// Floor at y=0 (cells y<=0 solid) for x,z in [-20,20], plus extras.
function world(extra = [], holes = []) {
  const S = new Set(extra.map((c) => c.join(','))), H = new Set(holes.map((c) => c.join(',')));
  return (x, y, z) => S.has(`${x},${y},${z}`) || (y <= 0 && y >= -1 && Math.abs(x) <= 20 && Math.abs(z) <= 20 && !H.has(`${x},${y},${z}`));
}
const run = (b, secs) => { for (let t = 0; t < secs; t += 1 / 30) b.update(1 / 30, { n: 2 }); };

let G = makeGrid(world());
let p = findPath(G, [0, 1, 0], [10, 1, 5]);
ok(p && p.length >= 10 && p.length <= 12, `flat path (${p?.length})`);

// A wall at x=5 with a 1-wide door at z=3.
const wall = []; for (let z = -20; z <= 20; z++) if (z !== 3) for (let y = 1; y <= 3; y++) wall.push([5, y, z]);
G = makeGrid(world(wall));
p = findPath(G, [0, 1, 0], [10, 1, 0]);
ok(p && p.some(([x, , z]) => x === 5 && z === 3), 'goes through the door');

// Step up a 1-high block, but not a 2-high wall.
G = makeGrid(world([[3, 1, 0]]));
ok(neighbours(G, 2, 1, 0).some(([x, y, , , k]) => x === 3 && y === 2 && k === 'up'), 'step up 1');
G = makeGrid(world([[3, 1, 0], [3, 2, 0]]));
ok(!neighbours(G, 2, 1, 0).some(([x]) => x === 3), 'no 2-high step');

// Gap jump over a 2-wide pit, not a 3-wide one.
const pit = (w) => { const h = []; for (let x = 3; x < 3 + w; x++) for (let z = -20; z <= 20; z++) h.push([x, 0, z], [x, -1, z]); return h; };
G = makeGrid(world([], pit(2)));
ok(neighbours(G, 2, 1, 0).some(([x, , , , k]) => x === 5 && k === 'jump'), 'jumps a 2-gap');
G = makeGrid(world([], pit(3)));
ok(!neighbours(G, 2, 1, 0).some(([x]) => x >= 5), 'cannot jump a 3-gap');

// Drop up to 3 from a ledge.
const ledge = []; for (let x = -20; x <= 2; x++) for (let z = -20; z <= 20; z++) for (let y = 1; y <= 3; y++) ledge.push([x, y, z]);
G = makeGrid(world(ledge));
ok(neighbours(G, 2, 4, 0).some(([x, y, , , k]) => x === 3 && y === 1 && k === 'drop'), 'drops 3');

// A bot walks a route with a door, a step and a gap, and arrives.
const course = [...wall, [8, 1, 3]];
G = makeGrid(world(course, pit(2).map(([x, y, z]) => [x + 9, y, z])));
let b = new Bot({ id: 1, team: 'red', x: 0.5, y: 1, z: 0.5, grid: G, level: 'normal' });
b.goTo(15, 1, 0);
run(b, 20);
ok(b.arrived(1.2), `bot crosses door + step + gap (at ${b.x.toFixed(1)},${b.y.toFixed(1)},${b.z.toFixed(1)})`);

// Unreachable goal inside a sealed box: the bot gets close and never freezes forever.
const box = []; for (let x = 9; x <= 11; x++) for (let z = -1; z <= 1; z++) for (let y = 1; y <= 3; y++) if (!(x === 10 && z === 0 && y < 3)) box.push([x, y, z]);
G = makeGrid(world(box));
b = new Bot({ id: 2, team: 'red', x: 0.5, y: 1, z: 0.5, grid: G });
b.goTo(10, 1, 0);
run(b, 30);
ok(Math.hypot(b.x - 10.5, b.z - 0.5) < 4, `bot gets as close as it can to a sealed goal (${b.x.toFixed(1)},${b.z.toFixed(1)})`);

// Floor removed under a bot: it falls and lands.
const solidSet = new Set(); const fl = (x, y, z) => solidSet.has(`${x},${y},${z}`);
for (let x = -5; x <= 5; x++) for (let z = -5; z <= 5; z++) { solidSet.add(`${x},5,${z}`); solidSet.add(`${x},0,${z}`); }
G = makeGrid(fl);
b = new Bot({ id: 3, team: 'red', x: 0.5, y: 6, z: 0.5, grid: G });
solidSet.delete('0,5,0');
run(b, 2);
ok(Math.abs(b.y - 1) < 1e-6, `falls to the lower floor (y=${b.y.toFixed(2)})`);

// Speed: easy is slower than hard.
G = makeGrid(world());
const e = new Bot({ id: 4, team: 'r', x: 0.5, y: 1, z: 0.5, grid: G, level: 'easy', personality: { speed: 3 } });
const h = new Bot({ id: 5, team: 'r', x: 0.5, y: 1, z: 0.5, grid: G, level: 'hard', personality: { speed: 4.5 } });
e.goTo(18, 1, 0); h.goTo(18, 1, 0); run(e, 2); run(h, 2);
ok(h.x > e.x, 'hard bots are faster');

// Avoided floor cells (cracking glass): the path detours around a row when it can.
{
  const Ga = makeGrid(world());
  const straight = findPath(Ga, [0, 1, 0], [8, 1, 0]);
  Ga.avoid = (x, y, z) => x === 4 && y === 0 && z >= -1 && z <= 1;
  const around = findPath(Ga, [0, 1, 0], [8, 1, 0]);
  ok(straight.some(([x, , z]) => x === 4 && z === 0) && !around.some(([x, , z]) => x === 4 && Math.abs(z) <= 1), 'paths avoid cracking tiles');
}

// ---- Arena reachability: build each arena into a stub world and check the important spots are connected ----
const { BLOCKS } = await import('../js/data/blocks.js');
function stubWorld() {
  const cells = new Map();
  return {
    cells,
    setBox(a, b, mat, mode = 'fill') {
      const lo = a.map((v) => v >> 2), hi = b.map((v) => (v >> 2) - 1);
      for (let x = lo[0]; x <= hi[0]; x++) for (let y = lo[1]; y <= hi[1]; y++) for (let z = lo[2]; z <= hi[2]; z++) {
        const edge = x === lo[0] || x === hi[0] || y === lo[1] || y === hi[1] || z === lo[2] || z === hi[2];
        const m = mode === 'hollow' ? (edge ? mat : 0) : mat;
        if (m) cells.set(`${x},${y},${z}`, m); else cells.delete(`${x},${y},${z}`);
      }
      return { changed: 1, removed: [] };
    },
    getCell(x, y, z) { return cells.get(`${x},${y},${z}`) || 0; },
    isSolidSub(sx, sy, sz) { const m = cells.get(`${sx >> 2},${sy >> 2},${sz >> 2}`); return !!m && !!BLOCKS[m]?.solid; },
  };
}
const arenaFor = async (file) => {
  const w = stubWorld();
  const A = { world: w, origin: { x: 0, y: 70, z: 0 } };
  const mod = await import(file);
  return { w, A, mod };
};
const reach = (G, a, b) => !!findPath(G, a, b, { maxNodes: 20000 });
{
  const { w, A, mod } = await arenaFor('../js/minigames/games/ctf.js');
  mod.default.build(A);
  const G = makeGrid((x, y, z) => w.isSolidSub(x * 4 + 2, y * 4 + 2, z * 4 + 2));
  ok(reach(G, [-17, 71, 0], [18, 71, 0]), 'CTF: blue base reaches the red flag');
  ok(reach(G, [17, 71, 0], [-18, 71, 0]), 'CTF: red base reaches the blue flag');
  ok(reach(G, [-17, 71, 0], [0, 72, 0]), 'CTF: the centre tower is climbable');
}
{
  const { w, A, mod } = await arenaFor('../js/minigames/games/hideseek.js');
  mod.default.build(A);
  const G = makeGrid((x, y, z) => w.isSolidSub(x * 4 + 2, y * 4 + 2, z * 4 + 2));
  const spots = [[-11, 70, -9], [11, 70, -9], [-1, 70, 13], [5, 70, 6], [16, 70, -6], [6, 70, 16], [14, 70, 5]];
  for (const s of spots) ok(reach(G, [0, 70, 2], s), `Hide & Seek: spot ${s} reachable from the plaza`);
}
{
  const { w, A, mod } = await arenaFor('../js/minigames/games/siege.js');
  mod.default.build(A);
  const G = makeGrid((x, y, z) => w.isSolidSub(x * 4 + 2, y * 4 + 2, z * 4 + 2));
  for (const [gx, gz] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) ok(reach(G, [gx * 16, 70, gz * 16], [2, 70, 2]), `Siege: gate ${gx},${gz} reaches the core`);
  ok(!G.standable(16, 70, 5) , 'Siege: spawn bays are closed off at the sides');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
