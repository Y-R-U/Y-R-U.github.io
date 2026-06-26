// Building interiors (the bedroom you wake in + lootable buildings). Each is an
// "area" sitting on its own platform far from the town, built roofless with LOW
// walls so the close, steep interior camera always sees in (no roof/wall ever
// blocks vision). main swaps the player's heightAt/clamp/colliders/interactables
// and toggles visibility on enter/exit — the same pattern the dungeon used.
//
// INTERIORS is authoring data: floor + walls + furniture + loot + an exit door,
// in LOCAL coords around each platform centre. Add a room by adding a spec here
// and pointing a town building's `interior` at its id (townobj.js).

import * as THREE from 'three';
import { model as loadModel } from './assets.js';
import { M } from './utils.js';

// floor textures per room; loot {kind, id?/ammo?, n?, x, z}; furniture entries
// may set collide:r to add a circular collider. wallH scales walls low.
const INTERIORS = {
  home: {
    center: [200, 0, 0], floor: 'int_floor_parq', floorTint: 0x9a8f7e,
    half: { x: 9, z: 7 }, wallH: 0.52, light: 0x6a5a44, ambient: 0.7,
    entry: [0, 5.5], exit: [0, 6.4],
    tv: { x: -6.5, z: -4.5, rot: Math.PI * 0.7 },
    furniture: [
      { model: 'bed', x: 6, z: -4, rot: -Math.PI / 2, collide: 1.6 },
      { model: 'tv_table', x: -6.6, z: -5.4, rot: 0, collide: 0.8 },
      { model: 'television', x: -6.6, z: -5.4, rot: 0, y: 0.9 },
      { model: 'wardrobe', x: 7.6, z: 3, rot: -Math.PI / 2, collide: 1.0 },
      { model: 'shelf', x: -7.7, z: 2, rot: Math.PI / 2, collide: 0.8 },
      { model: 'table_coffee', x: 0, z: -1, rot: 0, collide: 1.0 },
      { model: 'chair', x: -2.4, z: -1.6, rot: 0.6, collide: 0.6 },
      { model: 'rug', x: 0, z: -1, rot: 0 },
      { model: 'lamp_floor', x: 7.4, z: -6, rot: 0 },
      { model: 'pc', x: -7.4, z: -1.5, rot: Math.PI / 2, y: 0.0 },
    ],
    loot: [
      { kind: 'medkit', x: -7.2, z: 2.2, y: 0.9 },
      { kind: 'ammo', ammo: '9mm', n: 18, x: 6.4, z: 2.6 },
    ],
  },
  store: {
    center: [260, 0, 0], floor: 'int_floor_wood', floorTint: 0x8a8a82,
    half: { x: 8, z: 7 }, wallH: 0.55, light: 0x55708a, ambient: 0.65,
    entry: [0, 5.5], exit: [0, 6.4],
    furniture: [
      { model: 'shelf', x: -6, z: -3, rot: 0, collide: 0.9 },
      { model: 'shelf', x: -2, z: -3, rot: 0, collide: 0.9 },
      { model: 'shelf', x: 2, z: -3, rot: 0, collide: 0.9 },
      { model: 'shelf', x: 6, z: -3, rot: 0, collide: 0.9 },
      { model: 'crate', x: -6.5, z: 4, rot: 0.4, collide: 0.7 },
      { model: 'crate', x: 6.5, z: 4, rot: -0.3, collide: 0.7 },
      { model: 'table_coffee', x: 0, z: 3.5, rot: 0, collide: 1.0 },
    ],
    loot: [
      { kind: 'weapon', id: 'shotgun', x: 0, z: 3.5, y: 0.9 },
      { kind: 'ammo', ammo: 'shells', n: 16, x: -2, z: -2, y: 0.9 },
      { kind: 'ammo', ammo: '9mm', n: 24, x: 2, z: -2, y: 0.9 },
      { kind: 'medkit', x: 6, z: -2, y: 0.9 },
    ],
  },
};

export function buildInteriors(scene) {
  const areas = {};
  for (const [id, spec] of Object.entries(INTERIORS)) areas[id] = buildOne(scene, id, spec);
  return { areas, get: (id) => areas[id] };
}

function buildOne(scene, id, spec) {
  const [cx, cy, cz] = spec.center;
  const root = new THREE.Group();
  root.visible = false;
  scene.add(root);

  const HX = spec.half.x, HZ = spec.half.z;
  const colliders = [];
  const interactables = [];
  const pickups = [];           // {kind,...,group,beacon,taken}
  const lights = [];

  // floor (tiled from a 3x3m piece, tinted)
  loadModel(spec.floor).then(tmpl => {
    const sz = tmpl.userData.size?.x || 3;
    for (let x = -HX; x <= HX; x += sz) for (let z = -HZ; z <= HZ; z += sz) {
      const m = tmpl.clone(true); m.position.set(cx + x, cy, cz + z); root.add(m);
    }
  });
  // a plain dark underlay so gaps never show sky
  const under = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2 + 6, HZ * 2 + 6).rotateX(-Math.PI / 2), M(0x2b2b28));
  under.position.set(cx, cy - 0.02, cz); under.receiveShadow = true; root.add(under);

  // LOW perimeter walls (no roof) so the close camera always sees in
  loadModel('int_wall').then(tmpl => {
    const sx = tmpl.userData.size?.x || 3;
    const wall = (x, z, rotY) => {
      const m = tmpl.clone(true);
      m.scale.set(sx ? 1 : 1, spec.wallH, 1);
      m.position.set(cx + x, cy, cz + z); m.rotation.y = rotY; root.add(m);
    };
    for (let x = -HX; x <= HX; x += sx) { wall(x, -HZ, 0); wall(x, HZ, Math.PI); }
    for (let z = -HZ; z <= HZ; z += sx) { wall(-HX, z, Math.PI / 2); wall(HX, z, -Math.PI / 2); }
  });

  // furniture
  for (const f of (spec.furniture || [])) {
    loadModel(f.model).then(m => {
      m.scale.setScalar(f.scale || 1);
      m.position.set(cx + f.x, cy + (f.y || 0), cz + f.z); m.rotation.y = f.rot || 0;
      root.add(m);
    });
    if (f.collide) colliders.push({ x: cx + f.x, z: cz + f.z, r: f.collide });
  }

  // the bedroom TV: an emissive screen plane + a glow light (intro.js animates it)
  let tv = null;
  if (spec.tv) {
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 0.7),
      new THREE.MeshBasicMaterial({ color: 0x223, toneMapped: false }));
    screen.material.userData.noWire = true;
    screen.position.set(cx + spec.tv.x, cy + 1.32, cz + spec.tv.z);
    screen.rotation.y = spec.tv.rot;
    screen.position.x += Math.sin(spec.tv.rot) * 0.18;
    screen.position.z += Math.cos(spec.tv.rot) * 0.18;
    root.add(screen);
    const glow = new THREE.PointLight(0x8fb8ff, 0.0, 7, 2);
    glow.position.set(cx + spec.tv.x, cy + 1.4, cz + spec.tv.z); root.add(glow);
    tv = { screen, glow, pos: new THREE.Vector3(cx + spec.tv.x, 0, cz + spec.tv.z) };
  }

  // loot pickups: glowing model + floating beacon, collected when you walk over
  for (const l of (spec.loot || [])) {
    const holder = new THREE.Group();
    holder.position.set(cx + l.x, cy + (l.y || 0.4), cz + l.z);
    root.add(holder);
    const mdl = l.kind === 'weapon' ? l.id : (l.kind === 'medkit' ? 'medkit' : 'ammo_box');
    loadModel(mdl).then(m => { m.scale.setScalar(l.kind === 'weapon' ? 1.0 : 0.9); holder.add(m); });
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xffe9a6, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
    beacon.material.userData.noWire = true; beacon.position.y = 0.9; holder.add(beacon);
    pickups.push({ ...l, group: holder, beacon, pos: new THREE.Vector3(cx + l.x, 0, cz + l.z), taken: false });
  }

  // lighting (warm/cool interior fill)
  root.add(new THREE.HemisphereLight(spec.light, 0x14110d, spec.ambient));
  const lamp = new THREE.PointLight(0xffe6c0, 1.4, 22, 2); lamp.position.set(cx, cy + 3.4, cz); root.add(lamp); lights.push(lamp);

  // exit door (back to the street)
  const exitIt = { kind: 'exit', interior: id, verb: '🚪 Go outside', pos: new THREE.Vector3(cx + spec.exit[0], 0, cz + spec.exit[1]), range: 3.0 };
  interactables.push(exitIt);

  return {
    id, root, tv, pickups,
    floorY: cy,
    interactables,
    colliders,
    entryPos: new THREE.Vector3(cx + spec.entry[0], cy, cz + spec.entry[1]),
    exit: exitIt,
    heightAt: () => cy,
    clampPos: (pos) => {
      pos.x = THREE.MathUtils.clamp(pos.x, cx - HX + 0.8, cx + HX - 0.8);
      pos.z = THREE.MathUtils.clamp(pos.z, cz - HZ + 0.8, cz + HZ - 0.8);
    },
    tick(t) { for (const pk of pickups) if (!pk.taken) pk.beacon.position.y = 0.9 + Math.sin(t * 3 + cx) * 0.08; },
  };
}
