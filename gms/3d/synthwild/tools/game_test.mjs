// Lane 4 pure-logic tests: node tools/game_test.mjs
import { BLOCKS, BLOCK } from '../js/data/blocks.js';
import { createItems } from '../js/data/items.js';
import { Inventory, HOTBAR, SIZE } from '../js/game/inventory.js';
import { Survival, TUNING, MAX } from '../js/game/survival.js';
import * as R from '../js/game/rules.js';

let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) pass++; else { fail++; console.log('FAIL', msg); } };
const near = (a, b, msg, eps = 1e-6) => ok(Math.abs(a - b) <= eps, `${msg} (got ${a}, want ${b})`);
const section = (s) => console.log('—', s);

const items = createItems(BLOCKS);
const I = (k) => items.id(k);
const bus = { log: [], emit(t, d) { this.log.push([t, d]); } };

section('items');
ok(items.get(BLOCK.CARBON_LOG).block === BLOCK.CARBON_LOG, 'block item id = block id');
ok(!items.get(0), 'no air item');
ok(items.get(I('lattice_cutter')).tool.level === 1 && items.get(I('qubit_blade')).tool.level === 4, 'tool tiers');
ok(items.list.filter((x) => x?.kind === 'tool').length === 18, '16 tools + Pulse Bow + Seed Scoop');
ok(items.get('sun_fruit').food.charge > 0, 'sun fruit is food');
ok(items.palette().includes(BLOCK.GLOWBULB) && !items.palette().includes(BLOCK.WATER), 'palette: placeable blocks only');

section('inventory');
let inv = new Inventory(items, bus);
near(inv.add(BLOCK.LOAM_MESH, 100), 0, 'add 100 fits');
ok(inv.slots[0].n === 64 && inv.slots[1].n === 36, 'stacks at 64');
near(inv.add(BLOCK.LOAM_MESH, 64 * SIZE), 64 * SIZE - (64 * SIZE - 100), 'overflow returned');
inv = new Inventory(items, bus);
inv.add(BLOCK.LOAM_MESH, 2);
for (let i = 0; i < 64; i++) ok(inv.consume(1 / 64), 'sub consume ' + i);
near(inv.count(BLOCK.LOAM_MESH), 1, 'sixty-four 1/64 placements cost exactly one block');
ok(inv.consume(1 / 8) && inv.slots[0].n === 0 && inv.slots[0].f === 56, '0.5 placement costs 1/8');
ok(!inv.consume(1), 'cannot over-consume');
near(inv.count(BLOCK.LOAM_MESH), 7 / 8, 'failed consume changes nothing');
ok(inv.consume(7 / 8) && inv.slots[0] === null, 'slot empties at zero');
inv.add(BLOCK.LOAM_MESH, 1 / 64);
near(inv.count(BLOCK.LOAM_MESH), 1 / 64, 'fractional pickup');
inv = new Inventory(items, bus);
inv.setSlot(0, BLOCK.LOAM_MESH, 10);
inv.setSlot(5, BLOCK.LOAM_MESH, 60);
ok(inv.consume(20), 'consume pulls from other stacks');
near(inv.count(BLOCK.LOAM_MESH), 50, 'total after multi-stack consume');
ok(inv.slots[0] === null, 'held slot drained first');
inv = new Inventory(items, bus);
inv.setSlot(0, BLOCK.LOAM_MESH, 40); inv.setSlot(1, BLOCK.LOAM_MESH, 40);
inv.move(0, 1);
ok(inv.slots[1].n === 64 && inv.slots[0].n === 16, 'move merges to 64');
inv.setSlot(2, BLOCK.CARBON_LOG, 3);
inv.move(0, 2);
ok(inv.slots[0].id === BLOCK.CARBON_LOG && inv.slots[2].id === BLOCK.LOAM_MESH, 'move swaps different items');
inv.setSlot(3, BLOCK.CARBON_LOG, 9);
ok(inv.split(3) && inv.slots[3].n === 5 && inv.slots.some((s, i) => i !== 3 && s?.id === BLOCK.CARBON_LOG && s.n === 4), 'split');
inv = new Inventory(items, bus);
inv.add(I('lattice_cutter'), 2);
ok(inv.slots[0].dur === 60 && inv.slots[1].dur === 60, 'tools stack 1 with durability');
for (let i = 0; i < 59; i++) inv.wear(0);
ok(inv.slots[0]?.dur === 1, 'wear');
ok(inv.wear(0) && inv.slots[0] === null, 'breaks at 0');
ok(!inv.wear(1, 1, true) && inv.slots[1].dur === 60, 'toolsNeverBreak');
inv = new Inventory(items, bus);
inv.setSlot(0, BLOCK.LOAM_MESH, 5); inv.setSlot(HOTBAR + 2, BLOCK.CARBON_LOG, 7);
const back = inv.takeBackpack();
ok(back.length === 1 && inv.slots[0].n === 5 && !inv.slots[HOTBAR + 2], 'death takes the backpack only');
ok(inv.addSlot(back[0]) === null && inv.count(BLOCK.CARBON_LOG) === 7, 'cache slot restore');
const snap = JSON.parse(JSON.stringify(inv.serialize()));
const inv2 = new Inventory(items, bus); inv2.load(snap);
ok(inv2.count(BLOCK.CARBON_LOG) === 7 && inv2.count(BLOCK.LOAM_MESH) === 5, 'serialize roundtrip');
inv2.creative = true;
inv2.select(0);
ok(inv2.consume(1000) && inv2.count(BLOCK.LOAM_MESH) === 5, 'creative never runs out');
inv2.select(12);
ok(inv2.sel === 3, 'select wraps');
inv2.select(0); ok(inv2.held().block === BLOCK.LOAM_MESH && inv2.held().infinite, 'held view');

section('survival: a full day and night');
const DAY = 900, NIGHT = 300;
function sim(sv, secs, env, step = 0.05) { for (let t = 0; t < secs; t += step) sv.tick(step, env); }
let sv = new Survival();
sim(sv, DAY, { daylight: 1, skyLight: 15, blockLight: 0, moving: false });
near(sv.charge, MAX, 'idle in the sun: Charge stays full', 0.01);
sv = new Survival();
sim(sv, DAY, { daylight: 1, skyLight: 15, blockLight: 0, moving: true });
const afterDay = sv.charge;
ok(afterDay < MAX && afterDay > 15, `walking all day under sky: slow net drain (${afterDay.toFixed(2)})`);
sim(sv, NIGHT, { daylight: 0.05, skyLight: 15, blockLight: 0, moving: true });
const nightLoss = afterDay - sv.charge;
ok(nightLoss > 4, `night power-droop: no trickle, drains (${nightLoss.toFixed(2)} lost)`);
sv = new Survival(); sv.charge = 10;
sim(sv, NIGHT, { daylight: 0.05, skyLight: 15, blockLight: 10, moving: false });
ok(sv.charge > 10 + 3, `night in a lit shelter (block light 10) recharges (${sv.charge.toFixed(2)})`);
sv = new Survival(); sv.charge = 10;
sim(sv, NIGHT, { daylight: 0.05, skyLight: 15, blockLight: 7, moving: false });
ok(sv.charge < 10, 'block light 7 is not enough');
sv = new Survival(); sv.charge = 10;
sim(sv, 300, { daylight: 1, skyLight: 6, blockLight: 0, moving: false });
ok(sv.charge < 10, 'daylight under a roof gives no trickle');
sv = new Survival(); sv.integrity = 10;
sim(sv, 20, { daylight: 1, skyLight: 15 });
ok(sv.integrity >= 16, `regen above 18 Charge (${sv.integrity})`);
sv = new Survival(); sv.integrity = 10; sv.charge = 17;
sim(sv, 20, { daylight: 0, skyLight: 0 });
ok(sv.integrity === 10, 'no regen at 17 Charge');
sv = new Survival(); sv.charge = 0;
sim(sv, 200, { daylight: 0, skyLight: 0 });
ok(sv.integrity === TUNING.starveFloor && !sv.dead, 'starvation is slow and stops at 1');
sv = new Survival();
sim(sv, TUNING.airSeconds - 0.5, { daylight: 1, skyLight: 15, eyeInWater: true });
ok(sv.integrity === MAX && sv.air > 0, 'air lasts ~15 s');
sim(sv, 3, { daylight: 1, skyLight: 15, eyeInWater: true });
ok(sv.integrity < MAX, 'drowning damages');
sim(sv, 4, { daylight: 1, skyLight: 15, eyeInWater: false });
ok(sv.air === 10, 'air refills');
sv = new Survival();
ok(sv.fallDamage(3) === 0 && sv.fallDamage(5) === 2 && sv.fallDamage(23.5) === 20, 'fall damage 1 per metre over 3');
sv = new Survival(bus);
sv.damage(5); ok(sv.damage(5) === 0, 'invulnerability frames');
sv.invuln = 0; sv.damage(30);
ok(sv.dead && bus.log.some(([t]) => t === 'player:death'), 'death event');
sv.revive(); ok(!sv.dead && sv.integrity === MAX, 'revive');
sv = new Survival(); sv.charge = 10;
const fruit = items.get('sun_fruit');
let r; let t = 0;
while ((r = sv.holdEat(fruit, 0.1)) === 'eating') t += 0.1;
ok(r === 'done' && t > 0.8 && sv.charge === 14, `eating takes a hold (${t.toFixed(1)} s)`);
sv.charge = MAX; ok(sv.holdEat(fruit, 0.1) === 'full', 'cannot eat when full');
sv = new Survival(); sim(sv, 100, { peaceful: true, daylight: 0, skyLight: 0 }); ok(sv.charge === MAX, 'peaceful: no drain');
sv = new Survival(); sv.integrity = 3; sim(sv, 10, { creative: true }); ok(sv.integrity === MAX, 'build mode: full stats');

section('break times and drops');
const held = (k) => (k ? { item: items.get(k) } : null);
const bt = (b, k, o) => R.breakTime(BLOCKS, b, held(k), o);
near(bt(BLOCK.BASALT_MATRIX, null), 1.5 * 5, 'stone by hand: slow');
near(bt(BLOCK.BASALT_MATRIX, 'lattice_cutter'), (1.5 * 1.5) / 2, 'lattice cutter');
ok(bt(BLOCK.BASALT_MATRIX, 'qubit_cutter') < bt(BLOCK.BASALT_MATRIX, 'ferrite_cutter'), 'higher tier is faster');
ok(bt(BLOCK.CARBON_LOG, 'basalt_saw') < bt(BLOCK.CARBON_LOG, null), 'saw on logs');
ok(bt(BLOCK.CARBON_LOG, 'basalt_cutter') === bt(BLOCK.CARBON_LOG, null), 'wrong tool = hand speed');
ok(bt(BLOCK.COREPLATE, 'qubit_cutter') === Infinity, 'coreplate unbreakable');
ok(bt(BLOCK.BASALT_MATRIX, null, { creative: true }) === 0, 'build mode instant');
ok(bt(BLOCK.LUMEN_BLOOM, null) <= 0.05, 'plants instant');
ok(bt(BLOCK.BASALT_MATRIX, 'lattice_cutter', { scale: 0.25 }) < bt(BLOCK.BASALT_MATRIX, 'lattice_cutter'), 'fine-grid breaks are quicker');
ok(R.dropsFor(BLOCKS, BLOCK.BASALT_MATRIX, 64, null).length === 0, 'stone by hand drops nothing');
const st = R.dropsFor(BLOCKS, BLOCK.BASALT_MATRIX, 64, held('lattice_cutter'));
ok(st.length === 1 && st[0].key === 'fractured_matrix' && st[0].n === 1, 'stone with cutter drops fractured matrix');
ok(R.dropsFor(BLOCKS, BLOCK.ORE_FERRITE, 64, held('lattice_cutter')).length === 0, 'ferrite needs basalt cutter');
ok(R.dropsFor(BLOCKS, BLOCK.ORE_FERRITE, 64, held('basalt_cutter')).length === 1, 'basalt cutter mines ferrite');
ok(R.dropsFor(BLOCKS, BLOCK.ORE_QUBIT, 64, held('basalt_cutter')).length === 0 && R.dropsFor(BLOCKS, BLOCK.ORE_QUBIT, 64, held('ferrite_cutter'))[0]?.key === 'qubit_crystal', 'qubit needs ferrite');
near(R.dropsFor(BLOCKS, BLOCK.LOAM_MESH, 1, null)[0].n, 1 / 64, 'sub break drops 1/64 block');
ok(R.dropsFor(BLOCKS, BLOCK.PHOTOMOSS, 64, null)[0].key === 'loam_mesh', 'photomoss drops loam');
let fruits = 0;
for (let i = 0; i < 2000; i++) for (const d of R.dropsFor(BLOCKS, BLOCK.SOLAR_LEAVES, 64, null)) if (d.key === 'sun_fruit') fruits += d.n;
ok(fruits > 160 && fruits < 320, `solar leaves drop Sun Fruit ~12% (${fruits}/2000)`);
ok(R.dropsFor(BLOCKS, BLOCK.WATER, 64, null).length === 0, 'water drops nothing');
ok(R.meleeDamage(held('ferrite_blade')) > R.meleeDamage(held('ferrite_cutter')) && R.meleeDamage(null) === 1, 'Arc Blade hits harder');
for (const b of BLOCKS) if (b && b.id) for (const d of R.dropsFor(BLOCKS, b.id, 64, held('qubit_cutter'), () => 0)) ok(items.get(d.key ?? d.id), `drop of ${b.key} is a real item (${d.key ?? d.id})`);

section('recipes');
{
  const { RECIPES, OVEN, available, make } = await import('../js/data/recipes.js');
  for (const r of RECIPES) { ok(items.get(r.out), 'recipe out ' + r.out); for (const k of Object.keys(r.in)) ok(items.get(k), `recipe in ${k}`); }
  for (const o of OVEN) ok(items.get(o.out) && items.get(o.in), 'oven ' + o.in);
  const iv = new Inventory(items);
  iv.add(BLOCK.CARBON_LOG, 2);
  const av = available(items, iv);
  ok(av.length === 1 && av[0].out === 'lattice_planks', 'only planks available from logs');
  make(items, iv, av[0]); make(items, iv, av[0]);
  ok(iv.count(BLOCK.LATTICE_PLANKS) === 8 && !iv.count(BLOCK.CARBON_LOG), 'make planks');
  make(items, iv, RECIPES.find((r) => r.out === 'lattice_rod'));
  ok(!available(items, iv).some((r) => r.out === 'lattice_cutter'), 'tools need a Fabricator');
  ok(available(items, iv, 'fabricator').some((r) => r.out === 'lattice_cutter'), 'lattice cutter at a Fabricator');
}
await mobTests();
await (await import('./game_test_m2.mjs')).m2Tests({ ok, near, section });
await (await import('./game_test_m3.mjs')).m3Tests({ ok, near, section });
await (await import('./game_test_m3.mjs')).m4Tests({ ok, near, section });
await (await import('./game_test_m3.mjs')).m5Tests({ ok, near, section });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

async function mobTests() {
  section('mobs on a stub voxel world');
  globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {} }) }) };
  globalThis.performance ??= { now: () => Date.now() };
  const THREE = await import('../../../lib/three/0.180.0/three.module.js');
  const { Mobs } = await import('../js/game/mobs/index.js');
  const { FUSE_TIME } = await import('../js/game/mobs/kinds.js');
  // Flat ground top at y=32; extra solid cells in `extra`; ground absent where x >= cliffX.
  const mkWorld = ({ extra = [], cliffX = 1e9 } = {}) => {
    const set = new Set(extra.map((c) => c.join(',')));
    const solidCell = (x, y, z) => set.has(`${x},${y},${z}`) || (y < 32 && (x < cliffX || y < 20));
    return {
      isSolidSub: (sx, sy, sz) => solidCell(sx >> 2, sy >> 2, sz >> 2),
      getSub: (sx, sy, sz) => (solidCell(sx >> 2, sy >> 2, sz >> 2) ? 3 : 0),
      surfaceY: (x) => (x < cliffX ? 31 : 19),
      sections: new Map(), raycast: () => null,
    };
  };
  const hurts = [], spawned = [];
  const settings = { get: (k) => ({ mobGrief: false })[k] ?? false };
  const night = { isNight: true, daylight01: 0.05 };
  const day = { isNight: false, daylight01: 1 };
  const setup = (world) => {
    const ctx = { THREE, world, scene: null, bus: null, session: { mode: 'survival' } };
    const game = { hurtPlayer: (a, src, k) => hurts.push({ a, src, k }), drops: { spawnItem: (...a) => spawned.push(a) } };
    const mobs = new Mobs(ctx, game);
    mobs.spawnTick = () => {};
    return mobs;
  };
  const run = (mobs, secs, p, sky = night) => { for (let t = 0; t < secs; t += 1 / 30) mobs.update(1 / 30, p, settings, sky); };

  let mobs = setup(mkWorld());
  let m = mobs.spawn('reboot', 0.5, 32, 0.5);
  run(mobs, 4, { x: 10.5, y: 32, z: 0.5 });
  ok(m.pos.x > 5 && Math.abs(m.pos.y - 32) < 1e-6, `reboot chases on flat ground (x=${m.pos.x.toFixed(2)})`);

  const wall = []; for (let z = -6; z <= 6; z++) wall.push([4, 32, z]);
  mobs = setup(mkWorld({ extra: wall }));
  m = mobs.spawn('reboot', 0.5, 32, 0.5);
  run(mobs, 6, { x: 9.5, y: 32, z: 0.5 });
  ok(m.pos.x > 4, `reboot steps up a 1-block wall (x=${m.pos.x.toFixed(2)}, y=${m.pos.y})`);

  const wall2 = []; for (let z = -8; z <= 8; z++) wall2.push([4, 32, z], [4, 33, z]);
  mobs = setup(mkWorld({ extra: wall2 }));
  m = mobs.spawn('reboot', 0.5, 32, 0.5);
  run(mobs, 4, { x: 9.5, y: 32, z: 0.5 });
  ok(m.pos.x < 4, `reboot cannot climb a 2-block wall (x=${m.pos.x.toFixed(2)})`);

  mobs = setup(mkWorld({ cliffX: 5 }));
  m = mobs.spawn('reboot', 0.5, 32, 0.5);
  run(mobs, 5, { x: 9.5, y: 20, z: 0.5 });
  ok(m.pos.y === 32 && m.pos.x < 5.4, `reboot refuses a 12 m drop (x=${m.pos.x.toFixed(2)})`);

  hurts.length = 0;
  mobs = setup(mkWorld());
  m = mobs.spawn('reboot', 0.5, 32, 0.5);
  let swungAt = -1;
  for (let t = 0; t < 1.5; t += 1 / 30) {
    mobs.update(1 / 30, { x: 1.9, y: 32, z: 0.5 }, settings, night);
    if (m.atk > 0 && swungAt < 0) swungAt = t;
  }
  ok(swungAt >= 0 && hurts.length >= 1 && hurts[0].src === 'reboot', 'reboot telegraphs then swings');

  mobs = setup(mkWorld());
  m = mobs.spawn('reboot', 0.5, 32, 0.5);
  run(mobs, 3, { x: 30, y: 32, z: 0.5 }, day);
  ok(m.removed, 'reboot burns out in direct sunlight');

  hurts.length = 0;
  mobs = setup(mkWorld());
  m = mobs.spawn('glitchfuse', 0.5, 32, 0.5);
  run(mobs, 0.5, { x: 2.8, y: 32, z: 0.5 });
  ok(m.fusing, 'glitchfuse fuses within 3');
  run(mobs, 0.4, { x: 10, y: 32, z: 0.5 });
  ok(!m.fusing && m.fuse < FUSE_TIME, 'walking away cancels the fuse');
  ok(hurts.length === 0, 'no damage when escaped');
  run(mobs, 6, { x: 2.5, y: 32, z: 0.5 });
  ok(m.removed && hurts.length === 1 && hurts[0].src === 'glitchfuse' && hurts[0].a >= 4, `EMP hurts (${hurts[0]?.a}) and knocks back`);
  ok(hurts[0]?.k.x > 3, 'knockback pushes away');

  mobs = setup(mkWorld());
  m = mobs.spawn('ibis', 0.5, 32, 0.5);
  const hit = mobs.raycast([0.5, 32.5, -3], [0, 0, 1], 5);
  ok(hit?.mob === m && Math.abs(hit.dist - (3.5 - 0.225 - 0.12)) < 0.05, `raycast finds mob (d=${hit?.dist.toFixed(2)})`);
  ok(!mobs.raycast([0.5, 32.5, -3], [0, 0, 1], 2), 'raycast respects max distance');
  ok(mobs.hit(m, 4, { x: 0, z: 1 }) && !mobs.hit(m, 4, { x: 0, z: 1 }), 'invulnerability frames on mobs');
  ok(m.panic > 0 && Math.abs(m.kz) > 1, 'ibis panics and is knocked back');
  m.invuln = 0; spawned.length = 0;
  mobs.hit(m, 4, { x: 0, z: 1 });
  ok(m.dying > 0 && spawned.some((s) => s[0] === 'ibis_fibre'), 'ibis dies and drops fibre');
  run(mobs, 1, { x: 20, y: 32, z: 0.5 });
  ok(m.removed, 'corpse removed after death anim');

  mobs = setup(mkWorld());
  m = mobs.spawn('ibis', 0.5, 40, 0.5);
  let minVy = 0;
  for (let t = 0; t < 1; t += 1 / 30) { mobs.update(1 / 30, { x: 20, y: 32, z: 0.5 }, settings, day); minVy = Math.min(minVy, m.vel.y); }
  ok(minVy >= -2.3, `ibis flutters down slowly (vy ${minVy.toFixed(2)})`);
}
