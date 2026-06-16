// Static world: village (store, well, campfire, anvil, tent, house, fences,
// signposts, lanterns), forest + orchard (choppable + fruit trees), rocks,
// bushes, riverside fish spots, and the dungeon entrance. Solid props register
// a collider; usable props push an Interactable that interact.js scans.
//
// An Interactable: { kind, verb, pos:Vector3, range, get?(): dynamic verb,
//   ready?: bool, data }. interact.js highlights the nearest in range and runs
// its action (pick fruit / chop / cook / fish / shop / enter dungeon).

import * as THREE from 'three';
import { rand, pick } from './utils.js';
import { model as loadModel } from './assets.js';
import { register } from './registry.js';
import { SITES } from './config.js';
import { riverDist } from './world.js';

export function buildWorldObjects(scene, world) {
  const interactables = [];
  const targets = [];               // holders tagged for tap-to-interact raycasts
  const tickers = [];
  const ground = (x, z) => world.groundHeight(x, z);

  // register an interactable and (optionally) make a holder tappable
  function usable(it, holder) {
    interactables.push(it);
    if (holder) { holder.userData.interact = it; it.object = holder; targets.push(holder); }
    return it;
  }

  function place(name, x, z, { scale = 1, rotY = null, collide = 0, reg = null, y = 0 } = {}) {
    const holder = new THREE.Group();
    holder.position.set(x, ground(x, z) + y, z);
    holder.rotation.y = rotY == null ? rand(0, 6.28) : rotY;
    scene.add(holder);
    loadModel(name).then(m => { m.scale.setScalar(scale); holder.add(m); });
    if (collide) register({ name: reg || name, category: 'Props', icon: '🌳', object: holder, collider: { r: collide }, note: name });
    return holder;
  }

  // ── village ──
  const store = place('store', SITES.store.x, SITES.store.z, { scale: 1.0, rotY: Math.PI * 0.5, collide: 1.6, reg: 'General Store' });
  usable({ kind: 'store', verb: '🛒 Trade at General Store', pos: vec(SITES.store, ground), range: 3.2 }, store);
  // shopkeeper handled by main (humanoid NPC) at the stall

  const well = place('well', SITES.well.x, SITES.well.z, { scale: 1.0, collide: 1.0, reg: 'Well' });
  // well is a water source (auto-refill happens in interact via nearWater + this point)

  const campfire = place('campfire', SITES.campfire.x, SITES.campfire.z, { scale: 1.0, collide: 0.7, reg: 'Campfire' });
  addFireGlow(campfire, scene, tickers);
  usable({ kind: 'cook', verb: '🍳 Cook at the campfire', pos: vec(SITES.campfire, ground), range: 3.0 }, campfire);

  place('anvil', SITES.anvil.x, SITES.anvil.z, { scale: 1.0, collide: 0.7, reg: 'Anvil' });
  place('tent', SITES.spawn.x - 6, SITES.spawn.z + 3, { scale: 1.0, collide: 1.4, reg: 'Tent' });
  place('house', 12, 4, { scale: 1.0, rotY: -Math.PI * 0.5, collide: 3.0, reg: 'Forester House' });
  for (const [lx, lz] of [[-2, -2], [4, -1], [-8, 2]]) place('lantern', lx, lz, { scale: 1.0, collide: 0.3 });
  for (const [bx, bz, n] of [[-9, -6, 'barrel'], [-9.8, -5, 'crate'], [10, 2, 'barrel']]) place(n, bx, bz, { scale: 1, collide: 0.5 });

  // village fence ring (decorative posts)
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2, r = 16; place('fence', Math.cos(a) * r, Math.sin(a) * r + 1, { scale: 1.1, rotY: a + Math.PI / 2, collide: 0.5 }); }

  // ── orchard: fruit trees ──
  const O = SITES.orchard;
  for (let i = 0; i < 7; i++) {
    const x = O.x + rand(-7, 7), z = O.z + rand(-7, 7);
    const g = place('tree_apple', x, z, { scale: rand(0.9, 1.2), collide: 1.1, reg: 'Apple Tree' });
    const it = usable({ kind: 'forage', verb: '🍎 Pick fruit', pos: new THREE.Vector3(x, ground(x, z), z), range: 2.8, ready: true, regrow: 0 }, g);
    tickers.push((dt) => { if (!it.ready) { it.regrow -= dt; if (it.regrow <= 0) it.ready = true; } });
  }

  // ── forest: choppable trees (need an axe) ──
  for (let i = 0; i < 26; i++) {
    const a = rand(0, 6.28), r = rand(26, 58);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (riverDist(x, z) < 7) continue;
    const which = pick(['tree', 'tree_forest', 'tree_forest']);
    const g = place(which, x, z, { scale: rand(0.85, 1.3), collide: 1.0, reg: 'Tree' });
    const it = usable({ kind: 'chop', verb: '🪓 Chop tree', pos: new THREE.Vector3(x, ground(x, z), z), range: 2.6, ready: true, regrow: 0, group: g }, g);
    tickers.push((dt) => { if (!it.ready) { it.regrow -= dt; if (it.regrow <= 0) { it.ready = true; g.visible = true; } } });
  }

  // ── rocks + bushes + mushrooms scatter ──
  for (let i = 0; i < 18; i++) { const a = rand(0, 6.28), r = rand(12, 60); const x = Math.cos(a) * r, z = Math.sin(a) * r; if (riverDist(x, z) < 6) continue; place(pick(['rock_large', 'rocks_small']), x, z, { scale: rand(0.8, 1.6), collide: 0.8 }); }
  for (let i = 0; i < 30; i++) { const a = rand(0, 6.28), r = rand(10, 60); const x = Math.cos(a) * r, z = Math.sin(a) * r; place(pick(['bush', 'bush_small']), x, z, { scale: rand(0.8, 1.3) }); }
  // foragable mushrooms near the forest floor
  for (let i = 0; i < 8; i++) {
    const a = rand(0, 6.28), r = rand(20, 50); const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (riverDist(x, z) < 7) continue;
    const g = place('mushroom', x, z, { scale: 1.2 });
    const it = usable({ kind: 'mushroom', verb: '🍄 Pick mushroom', pos: new THREE.Vector3(x, ground(x, z), z), range: 2.2, ready: true, regrow: 0, group: g }, g);
    tickers.push((dt) => { if (!it.ready) { it.regrow -= dt; if (it.regrow <= 0) { it.ready = true; g.visible = true; } } });
  }

  // ── riverside fish spots ──
  const F = SITES.fishSpot;
  for (const [fx, fz] of [[F.x, F.z], [F.x + 8, F.z - 3], [F.x - 7, F.z + 2], [14, 24]]) {
    const sx = fx, sz = fz;
    const bob = makeBobber(scene, world, sx, sz);
    tickers.push((dt, t) => bob.tick(t));
    usable({ kind: 'fish', verb: '🎣 Fish here', pos: new THREE.Vector3(sx, ground(sx, sz), sz), range: 3.6 }, bob.group);
  }

  // ── dungeon entrance ──
  const D = SITES.dungeon;
  const dz = place('cave_skull', D.x, D.z, { scale: 2.2, collide: 0, reg: 'Dungeon Entrance' });
  for (const [tx, tz] of [[D.x - 2.5, D.z + 1.5], [D.x + 2.5, D.z + 1.5]]) place('torch', tx, tz, { scale: 1.3 });
  usable({ kind: 'dungeon', verb: '🕳️ Enter the dungeon', pos: new THREE.Vector3(D.x, ground(D.x, D.z), D.z), range: 4.0 }, dz);

  return {
    interactables, targets,
    tick(dt, t) { for (const f of tickers) f(dt, t); },
  };
}

function vec(s, ground) { return new THREE.Vector3(s.x, ground(s.x, s.z), s.z); }

function addFireGlow(parent, scene, tickers) {
  const light = new THREE.PointLight(0xff8a3a, 2.2, 9, 2);
  light.position.set(0, 1.0, 0); parent.add(light);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.7, 8), new THREE.MeshBasicMaterial({ color: 0xffb24a, transparent: true, opacity: 0.9 }));
  flame.material.userData.noWire = true; flame.position.y = 0.7; parent.add(flame);
  tickers.push((dt, t) => { const f = 0.8 + Math.sin(t * 14) * 0.18 + Math.sin(t * 7.3) * 0.1; light.intensity = 2.0 * f; flame.scale.set(1, f, 1); flame.material.opacity = 0.7 + f * 0.2; });
}

function makeBobber(scene, world, x, z) {
  const g = new THREE.Group();
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshStandardMaterial({ color: 0xd83b2a, roughness: 0.6 }));
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.18, 0.5, 18).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.4 }));
  ring.material.userData.noWire = true;
  // big invisible tap proxy so the fishing spot is easy to hit
  const proxy = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 2, 8), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }));
  proxy.position.y = 0.6; g.add(proxy);
  g.add(ball); g.add(ring);
  g.position.set(x, world.waterLevel, z); scene.add(g);
  return { group: g, tick(t) { ball.position.y = world.waterLevel + 0.1 + Math.sin(t * 3 + x) * 0.06; ring.scale.setScalar(1 + Math.sin(t * 2 + x) * 0.15); } };
}
