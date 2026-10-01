// Farming + Growth Journal tests (called from game_test.mjs).
import { BLOCKS, BLOCK } from '../js/data/blocks.js';
import { createItems } from '../js/data/items.js';
import { Inventory } from '../js/game/inventory.js';
import * as R from '../js/game/rules.js';
import { createBus } from '../js/core/bus.js';

export async function m3Tests({ ok, section }) {
  const items = createItems(BLOCKS);
  const I = (k) => items.id(k);
  const { Farm, STAGE_TIME, SAPLING_TIME, cropStage } = await import('../js/game/farm.js');

  section('farming');
  {
    const cells = new Map();
    const loaded = { v: true };
    let light = 0xa0 | 10, trees = 0;
    const world = {
      getCell: (x, y, z) => cells.get(`${x},${y},${z}`) ?? 0,
      setBox: (a, b, mat) => { cells.set(`${a[0] >> 2},${a[1] >> 2},${a[2] >> 2}`, mat); return { changed: 1 }; },
      isChunkLoaded: () => loaded.v,
      lightAt: () => light,
      growTree: (x, y, z) => { trees++; return 20; },
    };
    cells.set('0,40,0', BLOCK.PHOTOMOSS); cells.set('1,40,0', BLOCK.PHOTOMOSS); cells.set('1,41,0', BLOCK.LOAM_MESH);
    const bus = createBus(), evs = [];
    bus.on('farm:till', () => evs.push('till'));
    const inv = new Inventory(items);
    const game = { inv, creative: false };
    const farm = new Farm({ world, bus, sky: { daylight01: 1 }, settings: { get: () => false } }, game);
    inv.add(I('seed_scoop'), 1);
    const held = () => inv.held();
    ok(farm.use({ sub: [0, 160, 0] }, held()) && cells.get('0,40,0') === BLOCK.GROW_BED && evs[0] === 'till', 'Seed Scoop tills photomoss into a grow bed');
    ok(!farm.use({ sub: [4, 160, 0] }, held()), "can't till with a block on top");
    ok(inv.slots[0].dur === 130, 'tilling wears the scoop');
    inv.setSlot(0, I('sun_seeds'), 3);
    ok(farm.use({ sub: [0, 160, 0] }, held()) && cells.get('0,41,0') === BLOCK.SUN_CROP_0 && inv.count(I('sun_seeds')) === 2, 'seeds plant on a grow bed');
    ok(!farm.use({ sub: [4, 160, 0] }, held()), 'seeds need a grow bed');
    const tick = (secs) => { for (let t = 0; t < secs; t++) farm.update(1); };
    tick(STAGE_TIME + 2);
    ok(cropStage(cells.get('0,41,0')) === 1, 'grows a stage in lamp light');
    light = 0x00;
    tick(STAGE_TIME * 2);
    ok(cropStage(cells.get('0,41,0')) === 1, 'no growth in the dark');
    light = 0xa0 | 10;
    loaded.v = false;
    tick(STAGE_TIME * 3);
    ok(cropStage(cells.get('0,41,0')) === 1, 'unloaded chunks do not tick');
    const saved = JSON.parse(JSON.stringify(farm.serialize()));
    const farm2 = new Farm({ world, bus, sky: { daylight01: 1 }, settings: { get: () => false } }, game);
    farm2.load(saved);
    loaded.v = true;
    farm2.update(1);
    ok(cropStage(cells.get('0,41,0')) === 3, 'catches up on load from the saved clock: ripe');
    const drops = R.dropsFor(BLOCKS, BLOCK.SUN_CROP_3, 64, null);
    ok(drops.some((d) => d.key === 'sun_grain' && d.n >= 1) && drops.some((d) => d.key === 'sun_seeds'), 'ripe crop drops Sun Grain + seeds');
    ok(R.dropsFor(BLOCKS, BLOCK.SUN_CROP_1, 64, null).every((d) => d.key === 'sun_seeds'), 'unripe crop returns the seed');
    let seeds = 0;
    for (let i = 0; i < 1000; i++) for (const d of R.dropsFor(BLOCKS, BLOCK.PHOTOMOSS, 64, null)) if (d.key === 'sun_seeds') seeds += d.n;
    ok(seeds > 60 && seeds < 140, `photomoss drops Sun Seeds ~10% (${seeds}/1000)`);
    const { available } = await import('../js/data/recipes.js');
    const iv = new Inventory(items); iv.add(I('sun_grain'), 3);
    ok(available(items, iv, null).some((r) => r.out === 'sun_bread'), 'Sun Bread by hand from 3 grain');
    ok(items.get('sun_bread').food.charge >= 8, 'Sun Bread is good food');
    // Sapling: placed with the brush, grows a tree after enough light.
    cells.set('5,40,5', BLOCK.LOAM_MESH); cells.set('5,41,5', BLOCK.BIO_SAPLING);
    farm2.onPlace({ minSub: [20, 164, 20], maxSub: [24, 168, 24], mat: BLOCK.BIO_SAPLING });
    for (let t = 0; t < SAPLING_TIME + 2; t++) farm2.update(1);
    ok(trees === 1 && !farm2.map.has('5,41,5'), 'bio-sapling grows a tree via world.growTree');
    ok(items.get('bio_sapling')?.kind === 'block', 'sapling is a placeable item');
  }

  section('item descriptions');
  for (const it of items.list) if (it) ok(it.desc && it.desc.length <= 70, `desc for ${it.key} (${it.desc?.length})`);

  section('loot tables');
  {
    const { LOOT_TABLES, rollLoot } = await import('../js/data/loot.js');
    for (const [name, t] of Object.entries(LOOT_TABLES)) for (const e of t.entries) ok(items.get(e.key), `loot ${name}: ${e.key} is an item`);
    ok(rollLoot(items, 's', 1, 2, 3, 'forest', 27, 'vault').length >= LOOT_TABLES.vault.rolls[0], 'structure kind picks its table');
  }

  section('starter outpost loot');
  {
    const { rollLoot } = await import('../js/data/loot.js');
    const l = rollLoot(items, 'seed', 70, 40, 12, 'forest', 27, 'starter');
    const keys = l.map((x) => items.get(x.id).key);
    ok(keys.includes('lattice_cutter') && keys.includes('glowbulb') && keys.includes('sun_bread'), 'starter cache: cutter, glowbulbs, food');
    ok(l.find((x) => items.get(x.id).key === 'lattice_cutter').dur === 60, 'starter cutter is brand new');
    ok(new Set(l.map((x) => x.slot)).size === l.length, 'no slot collisions');
  }

  section('pulse bow through game.update');
  {
    globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {} }) }) };
    const THREE = await import('../../../lib/three/0.180.0/three.module.js');
    const { init } = await import('../js/game/index.js');
    const bus = createBus();
    const input = { held: { secondary: false }, pressed: () => false };
    const camera = new THREE.PerspectiveCamera();
    const ctx = { THREE, bus, input, camera, scene: null, world: null, session: { mode: 'survival' },
      player: { pos: new THREE.Vector3(0, 40, 0), vel: new THREE.Vector3(), onGround: true }, settings: { get: () => false, on: () => () => {} } };
    const g = init(ctx);
    g.inv.setSlot(0, I('pulse_bow'), 1); g.inv.select(0);
    input.held.secondary = true;
    for (let i = 0; i < 12; i++) g.update(1 / 30);
    ok(g.bow.charge === 0 && g.bow.noAmmo, 'no charges: the bow does not draw (noAmmo set)');
    g.inv.add(I('pulse_charge'), 3);
    for (let i = 0; i < 12; i++) g.update(1 / 30);
    ok(g.bow.charge > 0.35 && g.bow.charge < 0.45 && !g.bow.noAmmo, `0.4 s hold with ammo draws to ${g.bow.charge.toFixed(2)}`);
    input.held.secondary = false;
    g.update(1 / 30);
    ok(g.projectiles.list.length === 1 && g.inv.count(I('pulse_charge')) === 2 && g.bow.lastCharge > 0.35, 'release fires one bolt and uses a charge');
  }

  section('growth journal');
  {
    const { Journal } = await import('../js/game/journal/index.js');
    const bus = createBus();
    const inv = new Inventory(items);
    const done = [];
    bus.on('goal:done', (d) => done.push(d.id));
    const game = { inv, items, creative: false, mobs: { list: [] }, survival: {}, stations: {} };
    const ctx = { bus, settings: { get: () => undefined }, sky: { isNight: true }, player: { pos: { x: 0, y: 40, z: 0 } },
      world: { structuresNear: (x, z, r) => (x > 100 ? [{ kind: 'outpost', pos: [110, 40, 0], dist: 5 }] : []), surfaceY: () => 44, lightAt: () => 0x0a } };
    const j = new Journal(ctx, game);
    ok(j.current().id === 'log', 'first goal: break a log');
    bus.emit('block:break', { removed: [{ mat: BLOCK.CARBON_LOG, count: 64 }] });
    ok(j.done.log && j.current().id === 'fabricator', 'breaking a log completes it');
    bus.emit('item:fabricate', { key: 'fabricator' });
    inv.add(I('lattice_cutter'), 1);
    j.update(1.1);
    ok(j.done.fabricator && j.done.cutter && j.current().id === 'outpost', 'events and inventory polls both work; the outpost is an early goal');
    bus.emit('block:place', { mat: BLOCK.GLOWBULB, minSub: [0, 0, 0], maxSub: [4, 4, 4] });
    ok(j.done.glow, 'placing a glowbulb at night');
    j.update(1.1);
    ok(j.done.shelter, 'standing roofed (sky 0) in lamp light 10 near the surface counts as a shelter');
    ok(!j.done.outpost, 'no outpost yet');
    ctx.player.pos.x = 108;
    j.update(1.1);
    ok(j.done.outpost, 'finding a Grower Outpost via world.structuresNear');
    ok(done.length === 6 && !j.hidden, `goal:done events (${done.length})`);
    const s = JSON.parse(JSON.stringify(j.serialize()));
    const j2 = new Journal(ctx, game); j2.load(s);
    ok(j2.current().id === 'till', 'progress saves and loads');
    game.mobs.list.push({ def: { hostile: true }, dying: 0, seen: 3, pos: { distanceTo: () => 5 } });
    ok(j2.hidden, 'chip hides in combat');
    game.mobs.list.length = 0;
    ctx.settings.get = (k) => (k === 'guide' ? false : undefined);
    ok(j2.hidden, 'guide setting off hides it');
    game.creative = true;
    ok(j2.current().id === 'b_place', 'build mode shows creative goals');
    bus.emit('block:place', { mat: 3, mode: 'hollow', minSub: [0, 0, 0], maxSub: [8, 8, 8] });
    bus.emit('block:place', { mat: 3, mode: 'fill', minSub: [0, 0, 0], maxSub: [32, 32, 32] });
    bus.emit('brush:copy', { size: [4, 4, 4] });
    ok(j2.done.b_hollow && j2.done.b_big && j2.done.b_fill && j2.done.b_place && j2.done.b_copy, 'brush goals');
  }
}

export async function m4Tests({ ok, section }) {
  section('difficulty');
  const { DIFFICULTY } = await import('../js/data/difficulty.js');
  const { Survival } = await import('../js/game/survival.js');
  const sim = (D) => { const s = new Survival(); s.charge = 15; for (let t = 0; t < 300; t += 0.1) s.tick(0.1, { daylight: 0, skyLight: 0, moving: true, drain: D.drain, starveFloor: D.starveFloor, regenEvery: D.regenEvery }); return s.charge; };
  ok(sim(DIFFICULTY.easy) > sim(DIFFICULTY.normal) && sim(DIFFICULTY.normal) > sim(DIFFICULTY.hard), 'Charge drains slower on easy, faster on hard');
  const starve = (D) => { const s = new Survival(); s.charge = 0; for (let t = 0; t < 400; t += 0.1) s.tick(0.1, { daylight: 0, skyLight: 0, starveFloor: D.starveFloor }); return s; };
  ok(starve(DIFFICULTY.easy).integrity === 10 && starve(DIFFICULTY.normal).integrity === 1 && starve(DIFFICULTY.hard).dead, 'starvation floor: easy 10, normal 1, hard can starve');
  globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {} }) }) };
  const THREE = await import('../../../lib/three/0.180.0/three.module.js');
  const { init } = await import('../js/game/index.js');
  const { createBus } = await import('../js/core/bus.js');
  const mk = (difficulty) => {
    const ctx = { THREE, bus: createBus(), input: { held: {}, pressed: () => false }, camera: new THREE.PerspectiveCamera(), scene: null, world: null,
      session: { mode: 'survival', meta: { difficulty } }, player: { pos: new THREE.Vector3(0, 40, 0), vel: new THREE.Vector3(), onGround: true }, settings: { get: () => false, on: () => () => {} } };
    return init(ctx);
  };
  const e = mk('easy'), n = mk('normal'), h = mk('hard'), p = mk('peaceful');
  ok(e.hurtPlayer(3, 'reboot') === 2 && n.hurtPlayer(3, 'reboot') === 3 && h.hurtPlayer(3, 'reboot') === 5 && p.hurtPlayer(3, 'reboot') === 0, 'mob damage scales (easy 2, normal 3, hard 5, peaceful 0)');
  e.survival.invuln = 0;
  ok(e.hurtPlayer(4, 'fall') === 4, 'fall damage is not scaled');
  ok(e.diff.firstNight.capHostile <= 2 && e.diff.capHostile < n.diff.capHostile, 'easy caps are lower, first night lower still');
}

export async function m5Tests({ ok, section }) {
  section('tree felling');
  globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {} }) }) };
  const THREE = await import('../../../lib/three/0.180.0/three.module.js');
  const { init } = await import('../js/game/index.js');
  const { createBus } = await import('../js/core/bus.js');
  const { BLOCK } = await import('../js/data/blocks.js');
  const mk = (extra = [], felling = true) => {
    const cells = new Map();
    for (let y = 40; y < 46; y++) cells.set(`0,${y},0`, BLOCK.CARBON_LOG);
    cells.set('1,44,0', BLOCK.CARBON_LOG); cells.set('2,45,1', BLOCK.CARBON_LOG);     // a branch, diagonal step
    for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) for (let y = 46; y <= 47; y++) cells.set(`${x},${y},${z}`, BLOCK.SOLAR_LEAVES);
    cells.set('5,40,5', BLOCK.CARBON_LOG);                                                // a separate tree stump
    for (const [k, v] of extra) cells.set(k, v);
    const world = {
      getCell: (x, y, z) => cells.get(`${x},${y},${z}`) ?? 0,
      setBox: (a, b, mat) => { const k = `${a[0] >> 2},${a[1] >> 2},${a[2] >> 2}`; const old = cells.get(k) ?? 0; cells.set(k, mat); return { changed: old !== mat ? 64 : 0, removed: old ? [{ mat: old, count: 64 }] : [] }; },
      isSolidSub: () => false, getSub: () => 0, raycast: () => null,
    };
    const bus = createBus();
    const ctx = { THREE, bus, world, input: { held: {}, pressed: () => false }, camera: new THREE.PerspectiveCamera(), scene: null,
      session: { mode: 'survival', meta: { difficulty: 'normal' } }, player: { pos: new THREE.Vector3(0, 40, 2), vel: new THREE.Vector3(), onGround: true },
      settings: { get: (k) => (k === 'treeFelling' ? felling : false), on: () => () => {} } };
    const g = init(ctx);
    const brk = (x, y, z) => { const r = world.setBox([x * 4, y * 4, z * 4], [x * 4 + 4, y * 4 + 4, z * 4 + 4], 0); bus.emit('block:break', { minSub: [x * 4, y * 4, z * 4], maxSub: [x * 4 + 4, y * 4 + 4, z * 4 + 4], removed: r.removed }); };
    return { g, cells, brk, bus };
  };
  let T = mk();
  T.g.inv.setSlot(0, T.g.items.id('lattice_saw'), 1); T.g.inv.select(0);
  let fellEv = null; T.bus.on('tree:fell', (e) => { fellEv = e; });
  T.brk(0, 40, 0);
  const logsLeft = [...T.cells.values()].filter((v) => v === BLOCK.CARBON_LOG).length;
  ok(fellEv?.logs === 7 && logsLeft === 1, `saw fells the trunk + branch (${fellEv?.logs} logs), the other stump stays`);
  const logDrops = T.g.drops.list.filter((d) => d.item.key === 'carbon_log').reduce((a, d) => a + d.n, 0);
  ok(logDrops === 8, `all 8 logs drop as items (${logDrops})`);
  ok(T.g.inv.slots[0].dur === 60 - 8, `saw wears once per log (${T.g.inv.slots[0].dur})`);
  ok(![...T.cells.values()].includes(BLOCK.SOLAR_LEAVES) && fellEv.leaves === 50, 'canopy comes down with it');
  T = mk([], false);
  T.brk(0, 40, 0);
  ok([...T.cells.values()].filter((v) => v === BLOCK.CARBON_LOG).length === 8, 'by hand with treeFelling off: just one log');
  T = mk([], true);
  T.brk(0, 40, 0);
  ok([...T.cells.values()].filter((v) => v === BLOCK.CARBON_LOG).length === 1, 'by hand with treeFelling on: fells');
  T = mk([['1,42,0', BLOCK.LATTICE_PLANKS]]);
  T.g.inv.setSlot(0, T.g.items.id('lattice_saw'), 1); T.g.inv.select(0);
  T.brk(0, 40, 0);
  ok([...T.cells.values()].filter((v) => v === BLOCK.CARBON_LOG).length === 8, 'logs built into a house are not felled');

  section('R1 A12: a sapling never grows into the player');
  {
    const { World } = await import('../js/world/world.js');
    const { Farm, SAPLING_TIME } = await import('../js/game/farm.js');
    const { boxOf, BODY } = await import('../js/player/physics.js');
    const W = new World({ seed: 'r1sap', sync: true });
    const [sx, , sz] = W.spawn;
    W.ensureArea(sx, sz, 1);
    const x = Math.floor(sx) + 4, z = Math.floor(sz) + 4, y = Math.ceil(W.surfaceY(x + 0.5, z + 0.5));
    W.setBox([x * 4, (y - 1) * 4, z * 4], [x * 4 + 4, y * 4, z * 4 + 4], BLOCK.PHOTOMOSS, 'fill');
    for (let k = 0; k < 16; k++) W.setBox([(x - 6) * 4, (y + k) * 4, (z - 6) * 4], [(x + 7) * 4, (y + k + 1) * 4, (z + 7) * 4], 0, 'fill');
    W.setBox([x * 4, y * 4, z * 4], [x * 4 + 4, y * 4 + 4, z * 4 + 4], BLOCK.BIO_SAPLING, 'fill');
    const player = { pos: { x: x + 0.5, y, z: z + 0.5 } };
    player.aabb = () => boxOf({ ...player.pos, h: BODY.H });
    const farm = new Farm({ world: W, player, sky: { daylight01: 1 }, settings: { get: () => false } }, { inv: null, creative: false });
    farm.track(x, y, z, 'sapling');
    const e = farm.map.get(`${x},${y},${z}`);
    e.g = SAPLING_TIME + 1; farm.tickT = 0; farm.update(0.01);
    ok(W.getCell(x, y, z) === BLOCK.BIO_SAPLING && farm.map.has(`${x},${y},${z}`), 'growth is deferred while the player stands in the sapling');
    player.pos.x += 10;
    e.g = SAPLING_TIME + 1; farm.tickT = 0; farm.update(0.01);
    ok(W.getCell(x, y, z) === BLOCK.CARBON_LOG, 'it grows once the player steps away');
  }
}
