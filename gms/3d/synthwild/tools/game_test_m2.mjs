// M2 tests (called from game_test.mjs): tech tree walk, oven, stations, new mobs.
import { BLOCKS, BLOCK } from '../js/data/blocks.js';
import { createItems } from '../js/data/items.js';
import { Inventory } from '../js/game/inventory.js';
import * as R from '../js/game/rules.js';
import { RECIPES, OVEN, available, make, almost } from '../js/data/recipes.js';
import { newOven, ovenTick } from '../js/game/stations/oven.js';

export async function m2Tests({ ok, near, section }) {
  const items = createItems(BLOCKS);
  const I = (k) => items.id(k);

  section('tech tree: punch a tree to qubit tools, from an empty inventory');
  {
    const inv = new Inventory(items);
    const held = () => inv.held();
    const holdKey = (k) => { const i = inv.slots.findIndex((s) => s && s.id === I(k)); ok(i >= 0, `holding ${k}`); inv.swap(i, 0); inv.select(0); };
    const mine = (key, n) => {
      let got = 0;
      for (let i = 0; i < n; i++) {
        ok(Number.isFinite(R.breakTime(BLOCKS, BLOCK[key.toUpperCase()], held())), `${key} is breakable`);
        for (const d of R.dropsFor(BLOCKS, BLOCK[key.toUpperCase()], 64, held(), () => 0.5)) { inv.add(d.key != null ? I(d.key) : d.id, d.n); got += d.n; }
      }
      return got;
    };
    const fab = (out, station, times = 1) => {
      for (let t = 0; t < times; t++) {
        const r = available(items, inv, station).find((x) => x.out === out);
        ok(!!r, `can fabricate ${out}${station ? ' at ' + station : ' by hand'}`);
        if (r) make(items, inv, r);
      }
    };
    const smelt = (inKey, n, fuelKey, fuelN) => {
      const o = newOven();
      o.in = { id: I(inKey), n }; o.fuel = { id: I(fuelKey), n: fuelN };
      inv.removeId(I(inKey), n); inv.removeId(I(fuelKey), fuelN);
      ovenTick(o, n * 5 + 1, items);
      ok(o.out?.n === n, `oven smelts ${n} ${inKey} (got ${o.out?.n})`);
      if (o.out) inv.add(o.out.id, o.out.n);
    };
    ok(mine('carbon_log', 8) === 8, 'punching trees gives logs');
    fab('lattice_planks', null, 6);
    fab('lattice_rod', null, 3);
    ok(!available(items, inv, null).some((r) => r.out === 'lattice_cutter'), 'no tools without a Fabricator');
    fab('fabricator', null);
    ok(mine('basalt_matrix', 3) === 0, 'stone by hand gives nothing');
    fab('lattice_cutter', 'fabricator');
    holdKey('lattice_cutter');
    ok(mine('basalt_matrix', 20) === 20, 'lattice cutter mines stone');
    ok(mine('ore_ferrite', 1) === 0, 'lattice cutter cannot mine ferrite');
    ok(mine('ore_carbon', 6) === 6, 'lattice cutter mines carbon');
    fab('basalt_cutter', 'fabricator');
    holdKey('basalt_cutter');
    ok(mine('ore_ferrite', 6) === 6, 'basalt cutter mines ferrite');
    ok(mine('ore_qubit', 1) === 0, 'basalt cutter cannot mine qubit');
    fab('reflow_oven', 'fabricator');
    smelt('ore_ferrite', 6, 'carbon_nodule', 1);
    fab('lattice_planks', null, 2);
    fab('lattice_rod', null, 2);
    fab('ferrite_cutter', 'fabricator');
    holdKey('ferrite_cutter');
    ok(mine('ore_qubit', 6) >= 6, 'ferrite cutter mines qubit crystal');
    ok(mine('ore_aurum', 2) === 2, 'ferrite cutter mines aurum');
    smelt('ore_aurum', 2, 'carbon_nodule', 1);
    fab('qubit_cutter', 'fabricator');
    fab('qubit_blade', 'fabricator');
    ok(inv.count(I('qubit_cutter')) === 1 && inv.count(I('qubit_blade')) === 1, 'qubit tools made');
    ok(inv.count(I('aurum_wire')) === 2, 'aurum wire smelted');
    fab('glowbulb', null);
    inv.add(I('silk_strand'), 3);
    fab('pulse_bow', 'fabricator');
    fab('pulse_charge', 'fabricator');
    ok(inv.count(I('pulse_charge')) === 8 && inv.count(I('pulse_bow')) === 1, 'bow and charges');
  }

  section('every recipe is reachable from the world');
  {
    const have = new Set();
    const qubit = { item: items.get('qubit_cutter') }, saw = { item: items.get('qubit_saw') }, scoop = { item: items.get('qubit_scoop') };
    for (const b of BLOCKS) if (b?.id) for (const h of [qubit, saw, scoop, null]) for (const d of R.dropsFor(BLOCKS, b.id, 64, h, () => 0)) have.add(d.key ?? items.get(d.id)?.key);
    const { ALL_KINDS } = await import('../js/game/mobs/index.js').catch(() => ({}));
    for (const k of ['ibis_fibre', 'scrap_egg', 'protein_gel', 'fibre_mesh', 'silk_strand', 'void_pearl', 'gel_bead', 'pulse_charge', 'lattice_rod']) have.add(k);
    let grew = true;
    while (grew) {
      grew = false;
      for (const o of OVEN) if (have.has(o.in) && !have.has(o.out)) { have.add(o.out); grew = true; }
      for (const r of RECIPES) if (Object.keys(r.in).every((k) => have.has(k)) && !have.has(r.out)) { have.add(r.out); grew = true; }
    }
    for (const r of RECIPES) ok(have.has(r.out), `reachable: ${r.out}`);
    for (const it of items.list) if (it?.kind === 'tool') ok(have.has(it.key), `tool reachable: ${it.key}`);
    ok(!!ALL_KINDS, 'mob registry loads');
  }

  section('fabricator lists');
  {
    const inv = new Inventory(items);
    inv.add(I('lattice_planks'), 2);
    const a = almost(items, inv, 'fabricator');
    const fabA = a.find((x) => x.r.out === 'fabricator');
    ok(fabA && fabA.need[0].n === 2, 'almost: fabricator needs 2 more planks');
    ok(available(items, inv, null).some((r) => r.out === 'lattice_rod'), 'rods by hand');
  }

  section('reflow oven');
  {
    const o = newOven();
    o.in = { id: I('ore_ferrite'), n: 3 };
    ovenTick(o, 30, items);
    ok(!o.out && o.in.n === 3, 'no fuel, no smelting');
    o.fuel = { id: I('lattice_planks'), n: 1 };
    ovenTick(o, 30, items);
    ok(o.out?.n === 1 && o.in.n === 2 && !o.fuel, `one plank smelts 1.5 items -> 1 done (${o.out?.n})`);
    o.fuel = { id: I('carbon_nodule'), n: 1 };
    ovenTick(o, 4, items);
    ok(o.out.n === 1 && o.prog > 0 && o.burn > 0, 'in progress');
    ovenTick(o, 20, items);
    ok(o.out.n === 3 && !o.in && o.burn > 0, 'carbon keeps burning after the input runs out');
    const o2 = newOven(); o2.in = { id: I('loam_mesh'), n: 1 }; o2.fuel = { id: I('carbon_nodule'), n: 1 };
    ovenTick(o2, 20, items);
    ok(!o2.out && o2.fuel.n === 1, "unsmeltable input doesn't waste fuel");
    const o3 = newOven(); o3.in = { id: I('protein_gel'), n: 2 }; o3.fuel = { id: I('carbon_log'), n: 2 };
    ovenTick(o3, 11, items);
    ok(o3.out?.id === I('grilled_gel') && o3.out.n === 2, 'cooks food');
  }

  section('stations: cache, oven save, breaking spills, sleep pod');
  {
    const THREE = await import('../../../lib/three/0.180.0/three.module.js');
    const { Stations } = await import('../js/game/stations/index.js');
    const cells = new Map([['5,40,5', BLOCK.CACHE], ['6,40,5', BLOCK.REFLOW_OVEN], ['7,40,5', BLOCK.SLEEP_POD]]);
    const spawned = [];
    let spawnSet = null, timeSet = null;
    const hostile = { def: { hostile: true, name: 'Reboot' }, dying: 0, pos: new THREE.Vector3(7.5, 41, 8) };
    const game = {
      items, mobs: { list: [hostile] }, survival: { dead: false },
      drops: { spawnItem: (id, n) => { spawned.push([id, n]); return {}; } },
      setSpawn: (p) => { spawnSet = p; },
    };
    const ctx = { THREE, world: { getCell: (x, y, z) => cells.get(`${x},${y},${z}`) ?? 0 }, sky: { isNight: true, setTime: (t) => { timeSet = t; } }, settings: { get: () => false } };
    const st = new Stations(ctx, game);
    st.open = () => {}; st.say = () => {};
    ok(st.useBlock({ sub: [20, 160, 20], mat: BLOCK.CACHE }), 'cache is interactable');
    ok(!st.useBlock({ sub: [0, 160, 0], mat: BLOCK.LOAM_MESH }), 'dirt is not');
    const c = st.get('cache', 5, 40, 5);
    c.inv.add(I('carbon_log'), 70);
    c.inv.add(I('lattice_cutter'), 1);
    const ov = st.get('oven', 6, 40, 5);
    ov.in = { id: I('ore_ferrite'), n: 4 }; ov.fuel = { id: I('carbon_nodule'), n: 1 };
    st.update(6);
    ok(ov.out?.n === 1, 'oven ticks with no panel open');
    const saved = JSON.parse(JSON.stringify(st.serialize()));
    const st2 = new Stations(ctx, game);
    st2.load(saved);
    ok(st2.get('cache', 5, 40, 5).inv.count(I('carbon_log')) === 70, 'cache contents saved per position');
    ok(st2.get('oven', 6, 40, 5).in.n === 3 && st2.get('oven', 6, 40, 5).burn > 0, 'oven progress saved');
    cells.set('5,40,5', 0);
    st2.onBreak({ minSub: [20, 160, 20], maxSub: [24, 164, 24] });
    ok(!st2.map.has('5,40,5') && spawned.filter(([id]) => id === I('carbon_log')).reduce((a, b) => a + b[1], 0) === 70 && spawned.some(([id]) => id === I('lattice_cutter')), 'breaking a cache spills it');
    ok(st2.map.has('6,40,5'), 'the oven next to it is untouched');
    ok(!st.sleep(7, 40, 5) && !spawnSet, "can't sleep with a hostile within 8");
    hostile.pos.set(30, 41, 30);
    ok(st.sleep(7, 40, 5) && spawnSet?.y === 41 && timeSet != null, 'sleep pod skips the night and sets spawn');
    ctx.sky.isNight = false; spawnSet = null; timeSet = null;
    ok(st.sleep(7, 40, 5) && spawnSet && timeSet == null, 'by day it only sets spawn');

    // Loot: world caches roll deterministic themed loot; placed caches are empty.
    const { rollLoot, LOOT_TABLES } = await import('../js/data/loot.js');
    const l1 = rollLoot(items, 'seedA', 10, 40, -3, 'desert'), l2 = rollLoot(items, 'seedA', 10, 40, -3, 'desert');
    ok(l1.length >= LOOT_TABLES.ruin.rolls[0] && JSON.stringify(l1) === JSON.stringify(l2), `ruin loot is deterministic (${l1.length} stacks)`);
    ok(JSON.stringify(rollLoot(items, 'seedA', 11, 40, -3, 'desert')) !== JSON.stringify(l1), 'a different position rolls differently');
    let aur = 0;
    for (let i = 0; i < 200; i++) for (const l of rollLoot(items, 'x', i, 30, 0, 'desert')) if (items.get(l.id).key === 'aurum_wire' || items.get(l.id).key === 'qubit_crystal') aur++;
    ok(aur > 100, `ruins often hold aurum/qubit (${aur} stacks in 200 caches)`);
    ok(l1.every((l) => !items.get(l.id).tool || (l.dur > 0 && l.n === 1)), 'loot tools are worn singles');
    cells.set('9,40,5', BLOCK.CACHE);
    const wc = st.get('cache', 9, 40, 5);
    ok(wc.inv.slots.some(Boolean), 'opening a world cache finds loot');
    cells.set('9,41,5', BLOCK.CACHE);
    st.onPlace({ minSub: [36, 164, 20], maxSub: [40, 168, 24], mat: BLOCK.CACHE });
    ok(!st.get('cache', 9, 41, 5).inv.slots.some(Boolean), 'a placed cache is empty');
    spawned.length = 0;
    cells.set('9,42,5', 0);
    st.onBreak({ minSub: [36, 168, 20], maxSub: [40, 172, 24], removed: [{ mat: BLOCK.CACHE, count: 64 }] });
    ok(spawned.length > 0, 'breaking an unopened world cache spills its loot');
  }

  section('R1 A3/A12: stations spill once per cell, placed caches never roll, pods clear the spawn');
  {
    const { World } = await import('../js/world/world.js');
    const { Stations } = await import('../js/game/stations/index.js');
    const W = new World({ seed: 'r1a3', sync: true });
    const [sx, , sz] = W.spawn;
    W.ensureArea(sx, sz, 1);
    const spawned = [], remainder = [];
    const game = {
      items, mobs: { list: [] }, survival: { dead: false }, spawnPoint: null,
      drops: { spawnItem: (id, n) => { spawned.push([id, n]); return {}; }, onBreak: (ev) => remainder.push(...(ev.removed || [])) },
      setSpawn(p) { this.spawnPoint = p; },
    };
    const st = new Stations({ world: W, settings: { get: () => false } }, game);
    st.say = () => {};
    const cell = (x, y, z) => [x * 4, y * 4, z * 4];
    const brk = (s) => { const max = s.map((v) => v + 1); const r = W.setBox(s, max, 0, 'fill'); st.onBreak({ minSub: s, maxSub: max, removed: r.removed }); };
    const subsOf = (x, y, z, mat) => W.readBox(cell(x, y, z), cell(x + 1, y + 1, z + 1)).data.filter((m) => m === mat).length;
    const cx = Math.floor(sx) + 3, cz = Math.floor(sz) + 3, cy = Math.ceil(W.surfaceY(cx + 0.5, cz + 0.5)) + 2;

    W.setBox(cell(cx, cy, cz), cell(cx + 1, cy + 1, cz + 1), BLOCK.CACHE, 'fill');
    st.onPlace({ minSub: cell(cx, cy, cz), maxSub: cell(cx + 1, cy + 1, cz + 1), mat: BLOCK.CACHE });
    for (let i = 0; i < 6; i++) brk([cx * 4 + (i & 3), cy * 4 + 3, cz * 4 + (i >> 2)]);
    ok(spawned.length === 0, `quarter-breaking an empty placed cache spills no loot (${spawned.length} stacks)`);
    ok(subsOf(cx, cy, cz, BLOCK.CACHE) === 0 && !st.map.has(`${cx},${cy},${cz}`), 'the first partial break removes the whole station');
    ok(remainder.filter((r) => r.mat === BLOCK.CACHE).reduce((a, r) => a + r.count, 0) === 63, 'the rest of the station drops as items');

    const wx = cx + 5;
    W.setBox(cell(wx, cy, cz), cell(wx + 1, cy + 1, cz + 1), BLOCK.CACHE, 'fill');
    const want = st.newCache(wx, cy, cz, true).inv.slots.filter(Boolean).length;
    spawned.length = 0;
    for (let i = 0; i < 6; i++) brk([wx * 4 + (i & 3), cy * 4 + 3, cz * 4 + (i >> 2)]);
    ok(want > 0 && spawned.length === want, `a world cache broken a sub at a time spills its loot exactly once (${spawned.length} vs ${want})`);

    const qx = cx + 8, q = cell(qx, cy, cz);
    W.setBox(q, q.map((v) => v + 1), BLOCK.CACHE, 'fill');
    st.onPlace({ minSub: q, maxSub: q.map((v) => v + 1), mat: BLOCK.CACHE });
    ok(st.map.has(`${qx},${cy},${cz}`) && !st.get('cache', qx, cy, cz).inv.slots.some(Boolean), 'a 1/4 placed cache registers as player-placed and is empty');

    const px = cx + 11;
    W.setBox(cell(px, cy, cz), cell(px + 1, cy + 1, cz + 1), BLOCK.SLEEP_POD, 'fill');
    game.setSpawn({ x: px + 0.5, y: cy + 1, z: cz + 0.5 });
    brk(cell(px, cy, cz));
    ok(game.spawnPoint === null && subsOf(px, cy, cz, BLOCK.SLEEP_POD) === 0, 'breaking the sleep pod clears the respawn point');
  }

  section('M2 mobs on a stub world');
  {
    globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {} }) }) };
    const THREE = await import('../../../lib/three/0.180.0/three.module.js');
    const { Mobs } = await import('../js/game/mobs/index.js');
    const { Projectiles } = await import('../js/game/projectiles.js');
    const { AIM_TIME } = await import('../js/game/mobs/kinds2.js');
    const mkWorld = (extra = []) => {
      const set = new Set(extra.map((c) => c.join(',')));
      const solidCell = (x, y, z) => set.has(`${x},${y},${z}`) || y < 32;
      return { isSolidSub: (sx, sy, sz) => solidCell(sx >> 2, sy >> 2, sz >> 2), getSub: (sx, sy, sz) => (solidCell(sx >> 2, sy >> 2, sz >> 2) ? 3 : 0),
        surfaceY: () => 32, sections: new Map(), raycast: () => null, lightAt: () => 0xf0 };
    };
    const settings = { get: () => false };
    const night = { isNight: true, daylight01: 0.05 }, day = { isNight: false, daylight01: 1 };
    const setup = (world) => {
      const hurts = [], spawned = [];
      const ctx = { THREE, world, scene: null, session: { mode: 'survival' } };
      const game = { hurtPlayer: (a, src) => hurts.push({ a, src }), drops: { spawnItem: (...a) => spawned.push(a) } };
      const mobs = new Mobs(ctx, game);
      game.mobs = mobs;
      game.projectiles = new Projectiles(ctx, game);
      mobs.spawnTick = () => {};
      return { mobs, game, hurts, spawned };
    };
    const run = (S, secs, p, sky = night, each) => {
      for (let t = 0; t < secs; t += 1 / 30) { S.mobs.update(1 / 30, p, settings, sky); S.game.projectiles.update(1 / 30, p); each?.(t); }
    };

    // Archer: aim telegraph, then a bolt that hits a standing player; a sidestep during the lock dodges.
    let S = setup(mkWorld());
    let m = S.mobs.spawn('archer', 0.5, 32, 0.5);
    let aimSeen = 0, firedAt = -1;
    const P = { x: 10.5, y: 32, z: 0.5, dead: false };
    run(S, 4, P, night, (t) => { if (m.aim > 0) aimSeen = Math.max(aimSeen, AIM_TIME - m.aim); if (firedAt < 0 && S.game.projectiles.list.length) firedAt = t; });
    ok(aimSeen > 0.8, `archer shows its aim line before firing (${aimSeen.toFixed(2)} s)`);
    ok(S.hurts.some((h) => h.src === 'archer'), 'archer bolt hits a player who stands still');
    S = setup(mkWorld());
    m = S.mobs.spawn('archer', 0.5, 32, 0.5);
    const P2 = { x: 10.5, y: 32, z: 0.5, dead: false };
    let dodgeT = 0;
    run(S, 4, P2, night, () => { if (m.aim > 0 && m.aim < 0.2) { P2.z = 3.5; dodgeT = 1; } else if ((dodgeT -= 1 / 30) <= 0) P2.z = 0.5; });
    ok(!S.hurts.length, 'sidestepping after the aim locks dodges the bolt');
    S = setup(mkWorld());
    m = S.mobs.spawn('archer', 0.5, 32, 0.5);
    m.cool = 99;
    run(S, 3, { x: 3.5, y: 32, z: 0.5, dead: false });
    ok(m.pos.x < -1.5, `archer backs off when you close in (x=${m.pos.x.toFixed(1)})`);

    // Spider: neutral in daylight, pounces at night after a crouch, climbs walls.
    S = setup(mkWorld());
    m = S.mobs.spawn('spider', 0.5, 32, 0.5);
    run(S, 4, { x: 2.5, y: 32, z: 0.5, dead: false }, day);
    ok(!S.hurts.length && !m.angry, 'spider is neutral by day');
    S.mobs.hit(m, 1, { x: -1, z: 0 });
    let crouched = false;
    run(S, 4, { x: 2.5, y: 32, z: 0.5, dead: false }, day, () => { if (m.crouch > 0) crouched = true; });
    ok(crouched && S.hurts.some((h) => h.src === 'spider'), 'hit it and it crouches, then pounces');
    const wall = []; for (let z = -6; z <= 6; z++) for (let y = 32; y < 35; y++) wall.push([4, y, z]);
    S = setup(mkWorld(wall));
    m = S.mobs.spawn('spider', 0.5, 32, 0.5);
    run(S, 6, { x: 9.5, y: 32, z: 0.5, dead: false }, night);
    ok(m.pos.x > 4, `spider climbs a 3-high wall (x=${m.pos.x.toFixed(1)}, y=${m.pos.y.toFixed(1)})`);

    // Bull drops.
    S = setup(mkWorld());
    m = S.mobs.spawn('bull', 0.5, 32, 0.5);
    S.mobs.hit(m, 99, { x: 1, z: 0 });
    ok(S.spawned.some((s) => s[0] === 'protein_gel'), 'bull drops Protein Gel');

    // Void linker: ignores you until you look at it, then shimmers and teleports next to you.
    S = setup(mkWorld());
    m = S.mobs.spawn('voidlinker', 0.5, 32, 0.5);
    m.hopT = 99;
    const away = { x: 15.5, y: 32, z: 0.5, dead: false, dir: { x: 0, y: 0, z: 1 } };
    run(S, 2, away);
    ok(m.provoked <= 0 && Math.abs(m.pos.x - 0.5) < 3, 'void linker stays neutral when not looked at');
    const look = { x: 15.5, y: 32, z: 0.5, dead: false };
    let shimmered = false;
    run(S, 2.5, look, night, () => { const dx = m.pos.x - look.x, dy = m.pos.y + m.h * 0.8 - 33.62, dz = m.pos.z - look.z, l = Math.hypot(dx, dy, dz); look.dir = { x: dx / l, y: dy / l, z: dz / l }; if (m.shimmer > 0) shimmered = true; });
    ok(m.provoked > 0 && shimmered, 'staring at it provokes it, with a shimmer first');
    ok(Math.hypot(m.pos.x - look.x, m.pos.z - look.z) < 4, `it teleports next to you (d=${Math.hypot(m.pos.x - look.x, m.pos.z - look.z).toFixed(1)})`);

    // Gel-core: squash telegraph before each hop, splits into smaller cores on death.
    S = setup(mkWorld());
    m = S.mobs.spawn('gelcore', 0.5, 32, 0.5, { size: 3 });
    ok(m.w === 1.5 && m.hp === 16, 'big gel-core');
    let squashBeforeHop = false, wasSquash = false;
    run(S, 3, { x: 6.5, y: 32, z: 0.5, dead: false }, night, () => { if (m.squash > 0) wasSquash = true; if (!m.onGround && m.vel.y > 0 && wasSquash) squashBeforeHop = true; });
    ok(squashBeforeHop, 'gel-core squashes before it hops');
    m.invuln = 0;
    S.mobs.hit(m, 99, { x: 1, z: 0 });
    const kids = S.mobs.list.filter((x) => x.kind === 'gelcore' && x.size === 2);
    ok(kids.length >= 2, `splits into ${kids.length} medium cores`);
    const small = S.mobs.spawn('gelcore', 0.5, 32, 0.5, { size: 1 });
    S.spawned.length = 0;
    S.mobs.hit(small, 99, { x: 1, z: 0 });
    ok(!S.mobs.list.some((x) => x.size === 0), 'smallest cores do not split');

    // Player Pulse Bow bolt hits a mob.
    S = setup(mkWorld());
    m = S.mobs.spawn('bull', 6.5, 32, 0.5);
    S.game.projectiles.fire({ x: 0.5, y: 33, z: 0.5 }, { x: 30, y: 0, z: 0 }, { owner: 'player', dmg: 5, gravity: 0 });
    run(S, 0.5, { x: 0.5, y: 32, z: 0.5, dead: false }, day);
    ok(m.hp === 5, `pulse bolt damages the mob (hp ${m.hp})`);
  }
}
