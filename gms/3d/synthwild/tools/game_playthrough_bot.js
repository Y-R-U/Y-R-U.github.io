// First-hour playthrough bot, imported into the real game page by tools/game_playthrough.mjs.
// It plays like a careful 9-year-old: walks (modelled time), breaks with real break times, fabricates with real
// recipes, builds a small hut at dusk and sits out the night. Game logic runs at full speed via game.update.
const WALK = 4.0, PATH = 1.35, UI_TAP = 3;

export async function run({ difficulty = 'easy', seed = 'synthwild', shelter = true, nights = 1 } = {}) {
  const G = window.__game, ctx = G.ctx;
  await G.engine.start({ id: 'pt-' + difficulty, name: 'Playthrough', seed, mode: 'survival', difficulty }, null);
  const game = ctx.game, world = ctx.world, inv = game.inv, items = game.items, P = ctx.player;
  const R = await import('../js/data/recipes.js');
  const { BLOCK, BLOCKS } = await import('../js/data/blocks.js');
  ctx.sky.setTime(0.02);
  const log = [], goals = [], charge = [], dmg = [], night = { spawned: {}, maxHostile: 0, maxNear: 0, hits: 0, deaths: 0 };
  let T = 0, deaths = 0, nightOn = false;
  const note = (msg) => log.push(`[${fmt(T)}] ${msg}`);
  const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  ctx.bus.on('goal:done', (e) => goals.push({ id: e.id, title: e.title, t: Math.round(T) }));
  ctx.bus.on('player:damage', (e) => { dmg.push({ t: Math.round(T), a: e.amount, src: e.src }); if (nightOn) night.hits++; });
  ctx.bus.on('player:death', (e) => { deaths++; note(`DIED (${e.src})`); if (nightOn) night.deaths++; });
  const spawnOrig = game.mobs.spawn.bind(game.mobs);
  game.mobs.spawn = (k, ...a) => { const m = spawnOrig(k, ...a); if (m && nightOn && m.def.hostile) night.spawned[k] = (night.spawned[k] || 0) + 1; return m; };
  const id = (k) => items.id(k);
  const cnt = (k) => inv.count(id(k));

  // Advance the game by `sec` at full speed (rendering paused meanwhile).
  function adv(sec) {
    const dt = 1 / 20;
    ctx.session.paused = false;
    for (let t = 0; t < sec; t += dt) {
      T += dt;
      ctx.sky.update(dt);
      try { world.update(P.pos.x, P.pos.z, 3); } catch {}
      game.update(dt);
      if (game.survival.dead) game.respawn();
      if (Math.floor(T) % 30 === 0 && Math.floor(T - dt) % 30 !== 0) charge.push([Math.round(T), +game.survival.charge.toFixed(1), game.survival.integrity]);
      if (nightOn) {
        const hs = game.mobs.list.filter((m) => m.def.hostile && !m.dying);
        night.maxHostile = Math.max(night.maxHostile, hs.length);
        night.maxNear = Math.max(night.maxNear, hs.filter((m) => m.pos.distanceTo(P.pos) < 16).length);
      }
      // A kid eats when the bar looks low.
      if (game.survival.charge < 12) eat();
    }
  }
  function eat() {
    const food = inv.slots.findIndex((s) => s && items.get(s.id).food);
    if (food < 0) return;
    const it = items.get(inv.slots[food].id);
    inv.removeId(it.id, 1, food);
    game.survival.charge = Math.min(20, game.survival.charge + it.food.charge);
  }
  const groundAt = (x, z) => { world.ensureArea(x, z, 1); return world.surfaceY(x, z); };
  function walkTo(x, y, z) {
    const d = Math.hypot(x - P.pos.x, z - P.pos.z);
    world.ensureArea(x, z, 2);
    P.teleport(x, y, z);
    adv((d / WALK) * PATH + 0.5);
    return d;
  }
  function breakCell(x, y, z, why = '') {
    const mat = world.getCell(x, y, z);
    if (mat <= 0) return 0;
    const t = game.breakTime(mat, inv.held());
    if (!Number.isFinite(t)) return 0;
    adv(t + 0.6);
    const r = world.setBox([x * 4, y * 4, z * 4], [x * 4 + 4, y * 4 + 4, z * 4 + 4], 0, 'fill');
    ctx.bus.emit('block:break', { minSub: [x * 4, y * 4, z * 4], maxSub: [x * 4 + 4, y * 4 + 4, z * 4 + 4], removed: r.removed, pos: [x, y, z] });
    adv(0.4);
    return t;
  }
  function holdBest(type) {
    const order = ['qubit', 'ferrite', 'basalt', 'lattice'];
    for (const t of order) { const i = inv.slots.findIndex((s) => s && items.get(s.id).key === `${t}_${type}`); if (i >= 0) { if (i >= 9) inv.swap(i, 8); inv.select(i >= 9 ? 8 : i); return true; } }
    const empty = inv.slots.findIndex((s, i) => i < 9 && !s);
    inv.select(empty >= 0 ? empty : 8);
    return false;
  }
  function fab(out, station = null, times = 1) {
    let made = 0;
    for (let i = 0; i < times; i++) {
      const r = R.available(items, inv, station).find((x) => x.out === out);
      if (!r) break;
      R.make(items, inv, r); made++;
      ctx.bus.emit('item:fabricate', { key: out, n: r.n });
      adv(UI_TAP);
    }
    return made;
  }
  function placeAt(x, y, z, key) {
    const m = BLOCK[key.toUpperCase()];
    if (!inv.count(id(key))) return false;
    world.setBox([x * 4, y * 4, z * 4], [x * 4 + 4, y * 4 + 4, z * 4 + 4], m, 'fill');
    inv.removeId(id(key), 1);
    ctx.bus.emit('block:place', { minSub: [x * 4, y * 4, z * 4], maxSub: [x * 4 + 4, y * 4 + 4, z * 4 + 4], mat: m, mode: 'fill' });
    adv(1);
    return true;
  }
  function findNear(pred, r = 24, dy = [-6, 10]) {
    const px = Math.floor(P.pos.x), py = Math.floor(P.pos.y), pz = Math.floor(P.pos.z);
    let best = null, bd = 1e9;
    for (let x = px - r; x <= px + r; x++) for (let z = pz - r; z <= pz + r; z++) {
      for (let y = py + dy[0]; y <= py + dy[1]; y++) {
        if (!pred(world.getCell(x, y, z), x, y, z)) continue;
        const d = Math.hypot(x - px, (y - py) * 2, z - pz);
        if (d < bd) { bd = d; best = [x, y, z]; }
      }
    }
    return best;
  }

  note(`spawn at ${P.pos.toArray().map((v) => v.toFixed(0))}, difficulty ${difficulty}`);
  adv(3);

  // 1. Starter outpost (or nearest outpost).
  const sp = P.pos.clone();
  const near = (world.structuresNear?.(sp.x, sp.z, 260) || []).sort((a, b) => a.dist - b.dist);
  const op = near.find((s) => s.starter) || near.find((s) => s.kind === 'outpost');
  let outpostDist = null;
  if (op && op.dist < 200) {
    outpostDist = Math.round(op.dist);
    const [ox, , oz] = op.pos;
    const gy = groundAt(ox, oz + 4);
    walkTo(ox, gy + 0.02, oz + 4);
    const c = op.cache && world.getCell(...op.cache) === BLOCK.CACHE ? op.cache : findNear((m) => m === BLOCK.CACHE, 14, [-8, 8]);
    if (c) {
      walkTo(c[0] + 0.5, groundAt(c[0] + 1.5, c[2] + 0.5) + 0.02, c[2] + 1.5);
      const st = game.stations.get('cache', ...c);
      const got = st.inv.slots.filter(Boolean).map((s) => `${items.get(s.id).key}×${s.n}`);
      st.inv.slots = st.inv.slots.map((s) => (s ? inv.addSlot(s) : null));
      adv(UI_TAP * 2);
      note(`outpost ${outpostDist} m away (${op.kind}${op.starter ? ', starter' : ''}); cache: ${got.join(', ') || 'empty'}`);
    } else note(`outpost ${outpostDist} m away but no cache found near it`);
  } else note(`no outpost within 200 m (nearest ${near[0] ? Math.round(near[0].dist) + ' m ' + near[0].kind : 'none'})`);

  // 2. Logs: break the reachable bottom of nearby trunks until we have 8.
  holdBest('saw');
  let trees = 0, tries = 0;
  while (cnt('carbon_log') < 8 && tries++ < 20) {
    const lg = findNear((m, x, y, z) => m === BLOCK.CARBON_LOG && world.getCell(x, y - 1, z) !== BLOCK.CARBON_LOG && world.getCell(x, y - 1, z) > 0, 40, [-12, 12]);
    if (!lg) { note('no tree in reach'); break; }
    walkTo(lg[0] + 1.5, lg[1] + 0.02, lg[2] + 0.5);
    for (let k = 0; k < 3; k++) if (world.getCell(lg[0], lg[1] + k, lg[2]) === BLOCK.CARBON_LOG) breakCell(lg[0], lg[1] + k, lg[2]);
    P.teleport(lg[0] + 0.5, lg[1] + 0.02, lg[2] + 0.5); adv(1.5);
    trees++;
  }
  note(`${cnt('carbon_log')} logs from ${trees} trees`);

  // 3. Hand fabrication: planks, rods, fabricator.
  fab('lattice_planks', null, Math.min(4, cnt('carbon_log')));
  fab('lattice_rod', null, 1);
  if (!cnt('fabricator')) fab('fabricator');
  const fx = Math.floor(P.pos.x) + 1, fz = Math.floor(P.pos.z);
  const fy = Math.floor(groundAt(fx + 0.5, fz + 0.5));
  placeAt(fx, fy, fz, 'fabricator');
  const fabAt = [fx, fy, fz];
  game.stations.open('fabricator', fx, fy, fz); adv(UI_TAP); game.stations.close();
  adv(UI_TAP);
  if (!cnt('lattice_cutter')) fab('lattice_cutter', 'fabricator');
  fab('lattice_saw', 'fabricator');
  note(`tools: ${['lattice_cutter', 'lattice_saw', 'lattice_blade'].filter((k) => cnt(k)).join(', ')}`);

  // 4. Stone and carbon for glowbulbs if the outpost didn't give any.
  holdBest('cutter');
  let carbonTries = 0;
  while (cnt('glowbulb') < 4 && carbonTries++ < 6) {
    if (cnt('carbon_nodule') && cnt('lattice_rod')) { fab('glowbulb'); continue; }
    if (!cnt('lattice_rod') && cnt('lattice_planks') >= 2) { fab('lattice_rod'); continue; }
    const ore = findNear((m) => m === BLOCK.ORE_CARBON, 28, [-10, 6]);
    if (!ore) { note('no carbon ore near the surface: no glowbulbs'); break; }
    walkTo(ore[0] + 0.5, ore[1] + 1.02, ore[2] + 1.5);
    adv(Math.max(0, Math.floor(P.pos.y) - ore[1]) * 2);   // digging down to it
    breakCell(...ore);
  }
  note(`glowbulbs ${cnt('glowbulb')}`);

  // 5. Dusk: dig loam and build a small hut around a lamp.
  const dusk = 0.72;
  const toDusk = ((dusk - ctx.sky.time01 + 1) % 1) * 1200;
  if (toDusk > 30 && toDusk < 900) { note(`waiting ${Math.round(toDusk)} s for dusk (exploring)`); adv(toDusk - 60); }
  let hut = null;
  if (!shelter) {
    const o = findNear((m, x, y, z) => m === 0 && world.getCell(x, y - 1, z) > 0 && (world.lightAt(x + 0.5, y + 1.6, z + 0.5) >> 4) === 15, 16, [-3, 3]);
    if (o) P.teleport(o[0] + 0.5, o[1] + 0.02, o[2] + 0.5);
    note('standing in the open for the night');
  }
  if (shelter) {
    holdBest('scoop');
    let loam = 0, guard = 0;
    while (cnt('loam_mesh') + cnt('fractured_matrix') < 30 && guard++ < 60) {
      const d = findNear((m, x, y, z) => (m === BLOCK.LOAM_MESH || m === BLOCK.PHOTOMOSS) && world.getCell(x, y + 1, z) === 0, 6, [-2, 1]);
      if (!d) break;
      breakCell(...d); loam++;
      P.teleport(d[0] + 0.5, groundAt(d[0] + 0.5, d[2] + 0.5) + 0.02, d[2] + 0.5); adv(0.3);
    }
    const hx = Math.floor(P.pos.x), hz = Math.floor(P.pos.z), hy = Math.floor(groundAt(hx + 0.5, hz + 0.5));
    // Hollow 3x4x3 shell (1x2 inside) the player stands in, with a glowbulb above the head... dirt-hut style.
    const mat = cnt('loam_mesh') ? BLOCK.LOAM_MESH : BLOCK.FRACTURED_MATRIX;
    const min = [(hx - 1) * 4, hy * 4, (hz - 1) * 4], max = [(hx + 2) * 4, (hy + 3) * 4, (hz + 2) * 4];
    const r = world.setBox(min, max, mat, 'shell');
    world.setBox([hx * 4, hy * 4, hz * 4], [hx * 4 + 4, (hy + 2) * 4, hz * 4 + 4], 0, 'fill');
    inv.removeId(items.get(mat).id, Math.min(inv.count(items.get(mat).id), r.changed));
    ctx.bus.emit('block:place', { minSub: min, maxSub: max, mat, mode: 'shell' });
    const blocks = Math.round(r.changed / 64);
    adv(blocks * 0.7);
    if (cnt('glowbulb')) { world.setBox([hx * 4, (hy + 1) * 4, hz * 4], [hx * 4 + 4, (hy + 2) * 4, hz * 4 + 4], BLOCK.GLOWBULB, 'fill'); inv.removeId(id('glowbulb'), 1); ctx.bus.emit('block:place', { minSub: [hx * 4, (hy + 1) * 4, hz * 4], maxSub: [hx * 4 + 4, (hy + 2) * 4, hz * 4 + 4], mat: BLOCK.GLOWBULB, mode: 'fill' }); }
    P.teleport(hx + 0.5, hy + 0.02, hz + 0.5);
    hut = [hx, hy, hz];
    note(`hut built (${blocks} blocks, ${loam} dug)`);
  }

  // 6. The night.
  const toNight = ((0.755 - ctx.sky.time01 + 1) % 1) * 1200;
  adv(Math.min(toNight, 900));
  nightOn = true;
  const n0 = { integ: game.survival.integrity, charge: game.survival.charge };
  for (let i = 0; i < 31 && ctx.sky.isNight !== false; i++) adv(10);
  nightOn = false;
  const L = ctx.world.lightAt(P.pos.x, P.pos.y + 1.6, P.pos.z);
  note(`night 1 over: integrity ${n0.integ}→${game.survival.integrity}, charge ${n0.charge.toFixed(1)}→${game.survival.charge.toFixed(1)}, light sky ${L >> 4} block ${L & 15}`);

  // 7. Morning: hunt passives for a Sleep Pod (fibre mesh or ibis fibre).
  holdBest('blade') || holdBest('cutter');
  let hunt = 0;
  const huntStart = T;
  while (!(cnt('fibre_mesh') >= 3 || cnt('ibis_fibre') >= 6) && hunt++ < 30 && T - huntStart < 900) {
    const prey = game.mobs.list.filter((m) => !m.def.hostile && !m.dying).sort((a, b) => a.pos.distanceTo(P.pos) - b.pos.distanceTo(P.pos))[0];
    if (!prey) { adv(20); continue; }
    walkTo(prey.pos.x + 1, prey.pos.y + 0.02, prey.pos.z);
    let swings = 0;
    while (!prey.dying && !prey.removed && swings++ < 20) { game.attack(prey, { x: prey.pos.x - P.pos.x, z: prey.pos.z - P.pos.z }); adv(0.55); P.teleport(prey.pos.x + 1, prey.pos.y + 0.02, prey.pos.z); }
    adv(1.5);
  }
  note(`hunting: ${Math.round(T - huntStart)} s, fibre mesh ${cnt('fibre_mesh')}, ibis fibre ${cnt('ibis_fibre')}`);
  if (fabAt) { walkTo(fabAt[0] + 1.5, fabAt[1] + 0.02, fabAt[2] + 0.5); adv(UI_TAP); }
  fab('lattice_planks', null, 1);
  const pod = fab('sleep_pod', 'fabricator');
  let slept = false;
  if (pod && hut) {
    const px = hut[0] + 2, pz = hut[2], py = Math.floor(groundAt(px + 0.5, pz + 0.5));
    placeAt(px, py, pz, 'sleep_pod');
    const toN = ((0.76 - ctx.sky.time01 + 1) % 1) * 1200;
    adv(toN);
    slept = game.stations.sleep(px, py, pz);
    adv(2);
  }
  note(!pod || !hut ? 'no Sleep Pod placed' : slept ? 'slept in a Sleep Pod' : `Sleep Pod refused: ${game.mobs.list.filter((m) => m.def.hostile && m.pos.distanceTo(P.pos) < 10).map((m) => m.kind).join(', ') || '?'} nearby`);
  return { difficulty, T: Math.round(T), deaths, goals, log, charge, dmg, night, outpostDist };
}
