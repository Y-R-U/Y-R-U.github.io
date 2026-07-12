// Static world content: Bramblewick (tutorial hamlet), Ashford (main town:
// bank, store, smithy, pasture, windmill), Milbrook (fishing village: dock,
// bank chest, cooking fire), Oakwood forest, Stonefell Mine, the goblin camp,
// roadside scatter, and every resource node. Solid props register a collider;
// usable props push an Interactable that interact.js scans.
//
// An Interactable: { kind, verb, pos:Vector3, range, ready?, data..., object }.
// Resource nodes deplete + respawn: trees swap to a stump, ore rocks hide
// their ore studs. `poi` exposes named nodes the tutorial points its beacon at.

import * as THREE from 'three';
import { rand, pick } from './utils.js';
import { model as loadModel } from './assets.js';
import { register } from './registry.js';
import { SITES, TOWNS } from './config.js';
import { riverDist, roadDist, riverClosest } from './world.js';

export function buildWorldObjects(scene, world) {
  const interactables = [];
  const targets = [];               // holders tagged for tap-to-interact raycasts
  const tickers = [];
  const poi = {};                   // tutorial points of interest
  const ground = (x, z) => world.groundHeight(x, z);

  function usable(it, holder) {
    interactables.push(it);
    if (holder) { holder.userData.interact = it; it.object = holder; targets.push(holder); }
    return it;
  }

  function place(name, x, z, { scale = 1, rotY = null, collide = 0, box = null, reg = null, y = 0, tint = null } = {}) {
    const holder = new THREE.Group();
    holder.position.set(x, ground(x, z) + y, z);
    holder.rotation.y = rotY == null ? rand(0, 6.28) : rotY;
    scene.add(holder);
    loadModel(name, tint ? { ownMaterial: true } : {}).then(m => {
      m.scale.setScalar(scale);
      if (tint) m.traverse(o => { if (o.isMesh && o.material.color) o.material.color.multiply(new THREE.Color(tint)); });
      holder.add(m);
    });
    if (box) register({ name: reg || name, category: 'Props', icon: '🏠', object: holder, collider: { box }, note: name });
    else if (collide) register({ name: reg || name, category: 'Props', icon: '🌳', object: holder, collider: { r: collide }, note: name });
    return holder;
  }

  // ── resource node builders ────────────────────────────────────────────────

  // Choppable tree: whole tree swaps to a stump while felled.
  function chopTree(x, z, kind = 'normal') {
    const oak = kind === 'oak';
    const holder = place(oak ? 'tree' : pick(['tree', 'tree_forest']), x, z,
      { scale: oak ? rand(1.5, 1.8) : rand(0.9, 1.25), collide: oak ? 1.3 : 1.0, reg: oak ? 'Oak Tree' : 'Tree' });
    const stump = new THREE.Group();
    stump.position.copy(holder.position); stump.rotation.y = holder.rotation.y; stump.visible = false;
    scene.add(stump);
    loadModel(oak ? 'stump' : 'stump_small').then(m => { m.scale.setScalar(oak ? 1.4 : 1.1); stump.add(m); });
    const it = usable({
      kind: 'chop', tree: kind, verb: oak ? '🪓 Chop Oak' : '🪓 Chop Tree',
      pos: new THREE.Vector3(x, ground(x, z), z), range: 3.0, ready: true, regrow: 0,
    }, holder);
    tickers.push((dt) => {
      if (!it.ready) {
        it.regrow -= dt;
        if (it.regrow <= 0) { it.ready = true; holder.visible = true; stump.visible = false; }
      }
    });
    it.deplete = (secs) => { it.ready = false; it.regrow = secs; holder.visible = false; stump.visible = true; };
    return it;
  }

  // Ore rock: an ore-studded boulder (tinted per metal) while ready; swaps to
  // a plain boulder while mined out.
  const ORE_TINT = { copper: 0xe08a4e, tin: 0xcfd6de, iron: 0xb05840 };
  function oreRock(x, z, ore) {
    const holder = new THREE.Group();
    holder.position.set(x, ground(x, z), z);
    holder.rotation.y = rand(0, 6.28);
    scene.add(holder);
    const oreH = new THREE.Group(), plainH = new THREE.Group();
    plainH.visible = false;
    holder.add(oreH, plainH);
    loadModel('ore', { ownMaterial: true }).then(m => {
      m.scale.setScalar(1.25);
      m.traverse(o => { if (o.isMesh && o.material.color) o.material.color.multiply(new THREE.Color(ORE_TINT[ore])); });
      oreH.add(m);
    });
    loadModel('rock_large').then(m => { m.scale.setScalar(0.85); plainH.add(m); });
    register({ name: `${ore} rock`, category: 'Props', icon: '🪨', object: holder, collider: { r: 1.0 }, note: 'ore rock' });
    const it = usable({
      kind: 'mine', ore, verb: `⛏️ Mine ${ore[0].toUpperCase() + ore.slice(1)}`,
      pos: new THREE.Vector3(x, ground(x, z), z), range: 3.0, ready: true, regrow: 0,
    }, holder);
    tickers.push((dt) => {
      if (!it.ready) { it.regrow -= dt; if (it.regrow <= 0) { it.ready = true; oreH.visible = true; plainH.visible = false; } }
    });
    it.deplete = (secs) => { it.ready = false; it.regrow = secs; oreH.visible = false; plainH.visible = true; };
    return it;
  }

  // Fishing spot near a bank anchor: the bobbing marker floats in the
  // shallows, the interaction anchor stands on the walkable bank.
  function fishSpot(x, z, method) {
    const rc = riverClosest(x, z);
    let dx = x - rc.cx, dz = z - rc.cz;
    const d = Math.hypot(dx, dz) || 1;
    dx /= d; dz /= d;                                    // river centre → bank side
    const mx = rc.cx + dx * 3.4, mz = rc.cz + dz * 3.4;  // marker in the water
    const sx = rc.cx + dx * 6.2, sz = rc.cz + dz * 6.2;  // stand point on the bank

    const g = new THREE.Group();
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6),
      new THREE.MeshStandardMaterial({ color: method === 'net' ? 0xd83b2a : 0x3577d8, roughness: 0.6 }));
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.18, 0.5, 18).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.4 }));
    ring.material.userData.noWire = true;
    const proxy = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 2.4, 8),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }));
    proxy.position.y = 0.6;
    g.add(proxy, ball, ring);
    g.position.set(mx, world.waterLevel, mz);
    scene.add(g);
    tickers.push((dt, t) => { ball.position.y = 0.1 + Math.sin(t * 3 + mx) * 0.06; ring.scale.setScalar(1 + Math.sin(t * 2 + mx) * 0.15); });
    return usable({
      kind: 'fish', method, verb: method === 'net' ? '🕸️ Net fish (shrimp)' : '🎣 Rod fish (trout)',
      pos: new THREE.Vector3(sx, ground(sx, sz), sz), range: 4.4,
    }, g);
  }

  function firePlace(x, z, label = '🍳 Cook here') {
    const holder = place('campfire', x, z, { scale: 1.0, collide: 0.7, reg: 'Campfire' });
    addFireGlow(holder, tickers);
    return usable({ kind: 'cook', verb: label, pos: new THREE.Vector3(x, ground(x, z), z), range: 3.0 }, holder);
  }

  function smithy(x, z, rotY = 0) {
    const f = place('furnace', x - 1.6, z, { scale: 1.3, rotY, collide: 1.0, reg: 'Furnace' });
    const fit = usable({ kind: 'smelt', verb: '🔥 Smelt at Furnace', pos: new THREE.Vector3(x - 1.6, ground(x - 1.6, z), z), range: 3.0 }, f);
    const a = place('anvil', x + 1.6, z, { scale: 1.0, rotY, collide: 0.7, reg: 'Anvil' });
    const ait = usable({ kind: 'smith', verb: '🔨 Smith at Anvil', pos: new THREE.Vector3(x + 1.6, ground(x + 1.6, z), z), range: 3.0 }, a);
    // ember glow in the furnace mouth
    const ember = new THREE.PointLight(0xff7a30, 1.4, 5, 2);
    ember.position.set(0, 1.0, 0.4); f.add(ember);
    tickers.push((dt, t) => { ember.intensity = 1.2 + Math.sin(t * 9 + x) * 0.25; });
    return { furnace: fit, anvil: ait };
  }

  function bankChest(x, z, rotY = 0) {
    const holder = place('chest', x, z, { scale: 1.3, rotY, collide: 0.6, reg: 'Bank chest' });
    // gentle gold shimmer so banks read as special
    const glow = new THREE.PointLight(0xffd870, 0.8, 4, 2);
    glow.position.y = 1.0; holder.add(glow);
    return usable({ kind: 'bank', verb: '🏦 Use Bank', pos: new THREE.Vector3(x, ground(x, z), z), range: 3.0 }, holder);
  }

  // ══ BRAMBLEWICK — the tutorial hamlet ══
  {
    const T = SITES.tutTrees;
    poi.tree = chopTree(T.x, T.z, 'normal');
    chopTree(T.x - 3.5, T.z + 3, 'normal');
    chopTree(T.x + 2, T.z + 4.5, 'normal');

    poi.fire = firePlace(SITES.tutFire.x, SITES.tutFire.z, '🍳 Cook at the campfire');

    const R = SITES.tutRocks;
    poi.copper = oreRock(R.x, R.z, 'copper');
    poi.tin = oreRock(R.x + 3, R.z - 2, 'tin');
    oreRock(R.x + 1.5, R.z + 3, 'copper');

    const S = SITES.tutSmithy;
    const sm = smithy(S.x, S.z, Math.PI);
    poi.furnace = sm.furnace; poi.anvil = sm.anvil;

    poi.bank = bankChest(SITES.tutBank.x, SITES.tutBank.z, 0.6);
    poi.fish = fishSpot(SITES.tutFish.x, SITES.tutFish.z, 'net');

    // rat pen: fence ring with a gap
    const P = SITES.ratPen;
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2;
      if (a > 1.1 && a < 1.9) continue;   // gate gap
      place('fence', P.x + Math.cos(a) * 3.6, P.z + Math.sin(a) * 3.6, { scale: 1.1, rotY: a + Math.PI / 2, collide: 0.5 });
    }

    place('house', -13, 70, { scale: 0.9, rotY: 2.2, box: { hx: 3.4, hz: 2.8 }, reg: 'Cottage' });
    place('well', -1, 58, { scale: 1.0, collide: 1.0, reg: 'Well' });
    place('flag', 3, 71, { scale: 1.2, rotY: 0.3, collide: 0.3 });
    for (const [bx, bz, n] of [[5, 63.5, 'barrel'], [6, 64.5, 'crate'], [-6.5, 61.5, 'crate']]) place(n, bx, bz, { scale: 1, collide: 0.5 });
    for (const [lx, lz] of [[-3, 65], [5, 58]]) place('lantern', lx, lz, { scale: 1.0, collide: 0.3 });
    place('logs', -7.5, 69, { scale: 1.1 });
  }

  // ══ ASHFORD — the main town ══
  {
    // bank: a proper building; the interactable sits at its door (south face)
    const B = SITES.bank;
    place('bank', B.x, B.z, { scale: 1.0, rotY: Math.PI / 2, box: { hx: 5.2, hz: 4.2 }, reg: 'Ashford Bank' });
    const bIt = usable({ kind: 'bank', verb: '🏦 Use Bank', pos: new THREE.Vector3(B.x + 5.8, ground(B.x + 5.8, B.z), B.z), range: 3.4 });
    // tappable door proxy in front of the bank
    const bproxy = new THREE.Mesh(new THREE.BoxGeometry(3, 3.6, 2.4),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }));
    bproxy.position.set(B.x + 5.8, ground(B.x + 5.8, B.z) + 1.6, B.z);
    scene.add(bproxy); bproxy.userData.interact = bIt; bIt.object = bproxy; targets.push(bproxy);

    const St = SITES.store;
    const store = place('store', St.x, St.z, { scale: 1.0, rotY: -Math.PI / 2, collide: 1.6, reg: 'General Store' });
    usable({ kind: 'shop', verb: '🛒 Trade at General Store', pos: new THREE.Vector3(St.x, ground(St.x, St.z), St.z), range: 3.4 }, store);

    const Sm = SITES.smithy;
    place('barn', Sm.x + 4, Sm.z - 6, { scale: 0.62, rotY: Math.PI, box: { hx: 6.6, hz: 4.4 }, reg: 'Smithy barn' });
    smithy(Sm.x, Sm.z, 0);

    place('well', SITES.well.x, SITES.well.z, { scale: 1.0, collide: 1.0, reg: 'Well' });
    place('house', -12, -18, { scale: 1.0, rotY: 1.0, box: { hx: 3.8, hz: 3.0 }, reg: 'House' });
    place('house', 12, -14, { scale: 0.95, rotY: -2.0, box: { hx: 3.6, hz: 2.9 }, reg: 'House' });
    place('house', -4, -38, { scale: 1.05, rotY: 0.2, box: { hx: 3.9, hz: 3.1 }, reg: 'House' });
    for (const [fx, fz] of [[-6, -21], [7, -28]]) place('flag', fx, fz, { scale: 1.3, rotY: rand(0, 6), collide: 0.3 });
    for (const [lx, lz] of [[-4, -26], [4, -20], [8, -30], [-9, -35]]) place('lantern', lx, lz, { scale: 1.0, collide: 0.3 });
    for (const [bx, bz, n] of [[9, -24, 'barrel'], [10, -25.3, 'barrel'], [-11, -26, 'crate'], [3.5, -35, 'crate']]) place(n, bx, bz, { scale: 1, collide: 0.5 });

    // cow pasture: fenced rectangle east of town with hay
    const Pa = SITES.pasture;
    for (let i = -3; i <= 3; i++) {
      place('fence', Pa.x + i * 2.4, Pa.z - 8, { scale: 1.1, rotY: 0, collide: 0.5 });
      if (i < -1 || i > 1) place('fence', Pa.x + i * 2.4, Pa.z + 8, { scale: 1.1, rotY: 0, collide: 0.5 });  // north gap = gate
    }
    for (let i = -2; i <= 2; i++) {
      place('fence', Pa.x - 8, Pa.z + i * 3.1, { scale: 1.1, rotY: Math.PI / 2, collide: 0.5 });
      place('fence', Pa.x + 8, Pa.z + i * 3.1, { scale: 1.1, rotY: Math.PI / 2, collide: 0.5 });
    }
    place('hay', Pa.x + 4, Pa.z + 3, { scale: 1.1, collide: 0.8 });
    place('hay', Pa.x - 3, Pa.z - 4, { scale: 0.9, collide: 0.7 });

    // windmill + wheat west of town
    const W = SITES.windmill;
    place('windmill', W.x, W.z, { scale: 1.0, rotY: 0.8, box: { hx: 3.2, hz: 3.2 }, reg: 'Windmill' });
    for (let i = 0; i < 14; i++) place('wheat', W.x + rand(4, 12), W.z + rand(-6, 6), { scale: rand(0.9, 1.2) });
    place('scarecrow', W.x + 8, W.z, { scale: 1.0, collide: 0.4 });
  }

  // ══ MILBROOK — the fishing village ══
  {
    const D = SITES.dock;
    // aim the dock out over the river
    const rc = riverClosest(D.x, D.z);
    const ang = Math.atan2(rc.cx - D.x, rc.cz - D.z);
    place('dock', D.x, D.z, { scale: 1.0, rotY: ang, y: -0.2, reg: 'Dock' });
    const boat = place('boat', rc.cx + 2, rc.cz + 1, { scale: 0.5, rotY: rand(0, 6), y: 0 });
    boat.position.y = world.waterLevel + 0.05;
    tickers.push((dt, t) => { boat.rotation.z = Math.sin(t * 0.9) * 0.03; boat.position.y = world.waterLevel + 0.05 + Math.sin(t * 1.1) * 0.04; });

    poi.mbBank = bankChest(SITES.mbBank.x, SITES.mbBank.z, -0.8);
    firePlace(SITES.mbFire.x, SITES.mbFire.z, '🍳 Cook at the fire');

    place('house', 52, 27, { scale: 0.9, rotY: 2.4, box: { hx: 3.4, hz: 2.8 }, reg: 'Cottage' });
    place('house', 62, 34, { scale: 0.85, rotY: -0.6, box: { hx: 3.2, hz: 2.7 }, reg: 'Cottage' });
    for (const [bx, bz, n] of [[57, 24, 'barrel'], [58.3, 24.4, 'crate'], [64, 28, 'barrel']]) place(n, bx, bz, { scale: 1, collide: 0.5 });
    for (const [lx, lz] of [[55, 30], [63, 31]]) place('lantern', lx, lz, { scale: 1.0, collide: 0.3 });
    place('fishing_pole', 60, 25, { scale: 1.2, rotY: 1.2 });

    // fishing spots along the river by the dock
    const spots = [[D.x - 4, 'net'], [D.x + 5, 'rod'], [D.x + 10, 'rod']];
    for (const [sx, method] of spots) {
      const it = fishSpot(sx, D.z + 4, method);   // anchor on the village side of the bank
      if (method === 'rod' && !poi.trout) poi.trout = it;
    }
  }

  // ══ STONEFELL MINE ══
  {
    const M = TOWNS.mine;
    oreRock(M.x - 4, M.z - 2, 'copper');
    oreRock(M.x - 6, M.z + 3, 'copper');
    oreRock(M.x - 1, M.z + 5, 'tin');
    oreRock(M.x + 2, M.z - 4, 'tin');
    poi.iron = oreRock(M.x + 5, M.z + 1, 'iron');
    oreRock(M.x + 7, M.z + 4, 'iron');
    oreRock(M.x + 9, M.z - 2, 'iron');
    for (let i = 0; i < 6; i++) place(pick(['rock_large', 'rocks_small']), M.x + rand(-11, 11), M.z + rand(-9, 9), { scale: rand(0.8, 1.5), collide: 0.8 });
    for (const [tx, tz] of [[M.x - 3, M.z - 6], [M.x + 4, M.z + 6]]) place('torch', tx, tz, { scale: 1.3 });
    place('crate', M.x - 7, M.z - 4, { scale: 1, collide: 0.5 });
    place('pickaxe', M.x - 6.5, M.z - 3.2, { scale: 1.0 });
  }

  // ══ GOBLIN CAMP ══
  {
    const G = TOWNS.goblincamp;
    place('totem', G.x, G.z, { scale: 1.2, rotY: 0.4, collide: 0.8, reg: 'Goblin totem' });
    place('tent_war', G.x - 6, G.z + 3, { scale: 1.0, rotY: 2.2, collide: 2.0, reg: 'War tent' });
    place('tent_war', G.x + 6, G.z - 3, { scale: 0.9, rotY: -0.6, collide: 1.8, reg: 'War tent' });
    place('teepee', G.x + 3, G.z + 6, { scale: 1.0, rotY: 1.0, collide: 1.4 });
    for (const [tx, tz] of [[G.x - 3, G.z - 4], [G.x + 2, G.z - 6]]) place('torch', tx, tz, { scale: 1.3 });
    const fire = place('campfire', G.x - 1, G.z + 3, { scale: 1.0, collide: 0.7, reg: 'Goblin fire' });
    addFireGlow(fire, tickers);
    place('crate', G.x + 7, G.z + 2, { scale: 1, collide: 0.5 });
  }

  // ══ OAKWOOD FOREST ══
  {
    const F = SITES.forest;
    for (let i = 0; i < 13; i++) {
      const x = F.x + rand(-16, 16), z = F.z + rand(-14, 16);
      if (riverDist(x, z) < 7 || roadDist(x, z) < 3) continue;
      chopTree(x, z, 'normal');
    }
    for (let i = 0; i < 6; i++) {
      const x = F.x + rand(-13, 13), z = F.z + rand(-11, 13);
      if (riverDist(x, z) < 8 || roadDist(x, z) < 3.5) continue;
      const it = chopTree(x, z, 'oak');
      poi.oak = poi.oak || it;
    }
  }

  // ── wilderness scatter: trees, bushes, rocks (kept off roads/rivers/towns) ──
  const townClear = (x, z) => {
    for (const k in TOWNS) { const t = TOWNS[k]; if (Math.hypot(x - t.x, z - t.z) < t.r + 3) return false; }
    return true;
  };
  for (let i = 0; i < 26; i++) {
    const a = rand(0, 6.28), r = rand(25, 102);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (riverDist(x, z) < 8 || roadDist(x, z) < 4 || !townClear(x, z)) continue;
    chopTree(x, z, 'normal');
  }
  for (let i = 0; i < 40; i++) {
    const a = rand(0, 6.28), r = rand(12, 104);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (riverDist(x, z) < 6 || roadDist(x, z) < 3) continue;
    place(pick(['bush', 'bush_small']), x, z, { scale: rand(0.8, 1.3) });
  }
  for (let i = 0; i < 14; i++) {
    const a = rand(0, 6.28), r = rand(20, 100);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (riverDist(x, z) < 6 || roadDist(x, z) < 3 || !townClear(x, z)) continue;
    place(pick(['rock_large', 'rocks_small']), x, z, { scale: rand(0.8, 1.6), collide: 0.8 });
  }
  // stepping stones across the ford
  for (const [fx, fz] of [[-1.5, 34], [0.3, 36], [1.6, 38]]) place('rocks_small', fx, fz, { scale: 1.0, y: 0.1 });

  return {
    interactables, targets, poi,
    tick(dt, t) { for (const f of tickers) f(dt, t); },
  };
}

function addFireGlow(parent, tickers) {
  const light = new THREE.PointLight(0xff8a3a, 2.2, 9, 2);
  light.position.set(0, 1.0, 0); parent.add(light);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.7, 8), new THREE.MeshBasicMaterial({ color: 0xffb24a, transparent: true, opacity: 0.9 }));
  flame.material.userData.noWire = true; flame.position.y = 0.7; parent.add(flame);
  tickers.push((dt, t) => { const f = 0.8 + Math.sin(t * 14) * 0.18 + Math.sin(t * 7.3) * 0.1; light.intensity = 2.0 * f; flame.scale.set(1, f, 1); flame.material.opacity = 0.7 + f * 0.2; });
}
