// Building interiors (the bedroom you wake in + lootable buildings). Each is an
// "area" sitting on its own platform far from the town, built roofless with LOW
// walls so the close, steep interior camera always sees in (no roof/wall ever
// blocks vision). main swaps the player's heightAt/clamp/colliders/interactables
// and toggles visibility on enter/exit — the same pattern the dungeon used.
//
// The floor is a single tinted, textured plane at floor level (so the player
// and pickups sit ON it, not sunk into stacked GLB tiles). Pickups float, spin
// and glow over a coloured ground ring so you can clearly see what you collect.
//
// INTERIORS is authoring data: floor + walls + furniture + loot + an exit door,
// in LOCAL coords around each platform centre. Add a room by adding a spec here
// and pointing a town building's `interior` at its id (townobj.js).

import * as THREE from 'three';
import { model as loadModel } from './assets.js';
import { M, canvasTexture } from './utils.js';

export const PICKUP_COLOR = { weapon: 0xffd24a, ammo: 0x6fd0ff, medkit: 0x7aff8a };

const INTERIORS = {
  home: {
    center: [200, 0, 0], floorKind: 'wood', floorColor: 0x6e4f30,
    half: { x: 9, z: 7 }, wallH: 0.52, light: 0x6a5a44, ambient: 0.55,
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
      { model: 'pc', x: -7.4, z: -1.5, rot: Math.PI / 2 },
    ],
    loot: [
      { kind: 'medkit', x: -7.2, z: 2.4 },
      { kind: 'ammo', ammo: '9mm', n: 18, x: 6.4, z: 2.6 },
    ],
  },
  store: {
    center: [260, 0, 0], floorKind: 'tile', floorColor: 0x55554d,
    half: { x: 8, z: 7 }, wallH: 0.55, light: 0x55708a, ambient: 0.5,
    entry: [0, 5.5], exit: [0, 6.4],
    furniture: [
      { model: 'shelf', x: -6, z: -3.5, rot: 0, collide: 0.9 },
      { model: 'shelf', x: -2, z: -3.5, rot: 0, collide: 0.9 },
      { model: 'shelf', x: 2, z: -3.5, rot: 0, collide: 0.9 },
      { model: 'shelf', x: 6, z: -3.5, rot: 0, collide: 0.9 },
      { model: 'crate', x: -6.5, z: 4, rot: 0.4, collide: 0.7 },
      { model: 'crate', x: 6.5, z: 4, rot: -0.3, collide: 0.7 },
      { model: 'table_coffee', x: 0, z: 2.5, rot: 0, collide: 1.0 },
    ],
    loot: [
      { kind: 'weapon', id: 'shotgun', x: 0, z: 1 },
      { kind: 'ammo', ammo: 'shells', n: 16, x: -3, z: -1.5 },
      { kind: 'ammo', ammo: '9mm', n: 24, x: 3, z: -1.5 },
      { kind: 'medkit', x: 6, z: -1.5 },
    ],
  },
  police: {
    center: [320, 0, 0], floorKind: 'tile', floorColor: 0x474d54,
    half: { x: 9, z: 8 }, wallH: 0.55, light: 0x6a7a8a, ambient: 0.5,
    entry: [0, 6.5], exit: [0, 7.4],
    furniture: [
      { model: 'shelf', x: -7, z: -4.5, rot: 0, collide: 0.9 },
      { model: 'shelf', x: 7, z: -4.5, rot: 0, collide: 0.9 },
      { model: 'crate', x: -7, z: 4.5, rot: 0.3, collide: 0.7 },
      { model: 'crate', x: 7, z: 4.5, rot: -0.3, collide: 0.7 },
      { model: 'barrel', x: 0, z: -5.5, rot: 0, collide: 0.6 },
      { model: 'table_coffee', x: -3, z: 0.5, rot: 0, collide: 1.0 },
      { model: 'table_coffee', x: 3, z: 0.5, rot: 0, collide: 1.0 },
    ],
    loot: [
      { kind: 'weapon', id: 'rifle', x: -3, z: 0.5 },
      { kind: 'weapon', id: 'machinegun', x: 3, z: 0.5 },
      { kind: 'ammo', ammo: 'rifle', n: 60, x: -6.5, z: -3 },
      { kind: 'ammo', ammo: 'shells', n: 24, x: 6.5, z: -3 },
      { kind: 'ammo', ammo: '9mm', n: 40, x: 0, z: 3.5 },
      { kind: 'medkit', x: -6.5, z: 4.5 },
      { kind: 'medkit', x: 6.5, z: 4.5 },
    ],
  },
  cafe: {
    center: [380, 0, 0], floorKind: 'tile', floorColor: 0x5b5046,
    half: { x: 8, z: 7 }, wallH: 0.55, light: 0x8a7a5a, ambient: 0.55,
    entry: [0, 5.5], exit: [0, 6.4],
    furniture: [
      { model: 'table_coffee', x: -4, z: -2, rot: 0, collide: 1.0 },
      { model: 'table_coffee', x: 4, z: -2, rot: 0, collide: 1.0 },
      { model: 'chair', x: -4, z: 0.2, rot: 0, collide: 0.5 },
      { model: 'chair', x: 4, z: 0.2, rot: 0, collide: 0.5 },
      { model: 'shelf', x: 0, z: -5, rot: 0, collide: 0.9 },
      { model: 'crate', x: -6, z: 4, rot: 0.3, collide: 0.7 },
      { model: 'crate', x: 6, z: 4, rot: -0.3, collide: 0.7 },
    ],
    loot: [
      { kind: 'weapon', id: 'smg', x: 0, z: -3.3 },
      { kind: 'ammo', ammo: '9mm', n: 30, x: -4, z: -2 },
      { kind: 'medkit', x: 4, z: -2 },
      { kind: 'medkit', x: -6, z: 4 },
    ],
  },
};

function floorTexture(kind) {
  return canvasTexture(256, (g, s) => {
    if (kind === 'wood') {
      g.fillStyle = '#5a4029'; g.fillRect(0, 0, s, s);
      for (let y = 0; y < s; y += 26) {
        g.fillStyle = 'rgba(0,0,0,0.10)'; g.fillRect(0, y, s, 2);
        for (let i = 0; i < 5; i++) { g.strokeStyle = 'rgba(35,22,10,0.28)'; g.beginPath(); const x = Math.random() * s; g.moveTo(x, y); g.lineTo(x + (Math.random() - 0.5) * 20, y + 26); g.stroke(); }
      }
    } else {
      g.fillStyle = '#4d4d46'; g.fillRect(0, 0, s, s);
      g.strokeStyle = 'rgba(0,0,0,0.28)'; g.lineWidth = 2;
      for (let p = 0; p <= s; p += 64) { g.beginPath(); g.moveTo(p, 0); g.lineTo(p, s); g.moveTo(0, p); g.lineTo(s, p); g.stroke(); }
      for (let i = 0; i < 500; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.06})`; g.fillRect(Math.random() * s, Math.random() * s, 3, 3); }
    }
  });
}

export function buildInteriors(scene) {
  const areas = {};
  for (const [id, spec] of Object.entries(INTERIORS)) areas[id] = buildOne(scene, id, spec);
  return { areas, get: (id) => areas[id] };
}

// shared pickup visual: a floating, spinning item over a coloured ground ring,
// so the player clearly sees what they're collecting. Used by interiors + town.
export function makePickupVisual(kind, id) {
  const color = PICKUP_COLOR[kind] || 0xffe9a6;
  const holder = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.34, 0.5, 22).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  ring.material.userData.noWire = true; ring.position.y = 0.04; holder.add(ring);
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.16, 1.0, 8, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
  );
  beam.material.userData.noWire = true; beam.position.y = 0.5; holder.add(beam);
  const itemNode = new THREE.Group(); itemNode.position.y = 0.95; holder.add(itemNode);
  const mdl = kind === 'weapon' ? id : (kind === 'medkit' ? 'medkit' : 'ammo_box');
  loadModel(mdl).then(m => { m.scale.setScalar(kind === 'weapon' ? 1.25 : 1.0); itemNode.add(m); });
  return { holder, itemNode, ring };
}

export function tickPickup(pk, t) {
  if (pk.taken || !pk.itemNode) return;
  pk.itemNode.rotation.y = t * 1.7;
  pk.itemNode.position.y = 0.95 + Math.sin(t * 2.4 + (pk.pos.x + pk.pos.z)) * 0.09;
  if (pk.ring) pk.ring.material.opacity = 0.45 + (Math.sin(t * 3) * 0.5 + 0.5) * 0.35;
}

function buildOne(scene, id, spec) {
  const [cx, cy, cz] = spec.center;
  const root = new THREE.Group();
  root.visible = false;
  scene.add(root);

  const HX = spec.half.x, HZ = spec.half.z;
  const colliders = [];
  const interactables = [];
  const pickups = [];

  // single tinted, textured floor plane at floor level (no sink, no washout)
  const ftex = floorTexture(spec.floorKind);
  ftex.repeat.set(HX, HZ);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(HX * 2 + 2, HZ * 2 + 2).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ map: ftex, color: spec.floorColor, roughness: 0.92, metalness: 0 })
  );
  floor.position.set(cx, cy, cz); floor.receiveShadow = true; root.add(floor);

  // LOW perimeter walls (no roof) so the close camera always sees in
  loadModel('int_wall').then(tmpl => {
    const sx = tmpl.userData.size?.x || 3;
    const wall = (x, z, rotY) => { const m = tmpl.clone(true); m.scale.set(1, spec.wallH, 1); m.position.set(cx + x, cy, cz + z); m.rotation.y = rotY; root.add(m); };
    for (let x = -HX; x <= HX; x += sx) { wall(x, -HZ, 0); wall(x, HZ, Math.PI); }
    for (let z = -HZ; z <= HZ; z += sx) { wall(-HX, z, Math.PI / 2); wall(HX, z, -Math.PI / 2); }
  });

  // furniture
  for (const f of (spec.furniture || [])) {
    loadModel(f.model).then(m => { m.scale.setScalar(f.scale || 1); m.position.set(cx + f.x, cy + (f.y || 0), cz + f.z); m.rotation.y = f.rot || 0; root.add(m); });
    if (f.collide) colliders.push({ x: cx + f.x, z: cz + f.z, r: f.collide });
  }

  // bedroom TV: emissive screen plane + glow (intro.js animates it)
  let tv = null;
  if (spec.tv) {
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 0.7), new THREE.MeshBasicMaterial({ color: 0x223, toneMapped: false }));
    screen.material.userData.noWire = true;
    screen.position.set(cx + spec.tv.x + Math.sin(spec.tv.rot) * 0.18, cy + 1.32, cz + spec.tv.z + Math.cos(spec.tv.rot) * 0.18);
    screen.rotation.y = spec.tv.rot; root.add(screen);
    const glow = new THREE.PointLight(0x8fb8ff, 0.0, 7, 2); glow.position.set(cx + spec.tv.x, cy + 1.4, cz + spec.tv.z); root.add(glow);
    tv = { screen, glow, pos: new THREE.Vector3(cx + spec.tv.x, 0, cz + spec.tv.z) };
  }

  // loot pickups
  for (const l of (spec.loot || [])) {
    const v = makePickupVisual(l.kind, l.id);
    v.holder.position.set(cx + l.x, cy, cz + l.z); root.add(v.holder);
    pickups.push({ ...l, group: v.holder, itemNode: v.itemNode, ring: v.ring, pos: new THREE.Vector3(cx + l.x, 0, cz + l.z), taken: false });
  }

  // lighting (interior fill) — kept modest so nothing blows out
  root.add(new THREE.HemisphereLight(spec.light, 0x14110d, spec.ambient));
  const lamp = new THREE.PointLight(0xffe6c0, 1.1, 22, 2); lamp.position.set(cx, cy + 3.4, cz); root.add(lamp);

  const exitIt = { kind: 'exit', interior: id, verb: '🚪 Go outside', pos: new THREE.Vector3(cx + spec.exit[0], 0, cz + spec.exit[1]), range: 3.0 };
  interactables.push(exitIt);

  return {
    id, root, tv, pickups, floorY: cy, interactables, colliders,
    entryPos: new THREE.Vector3(cx + spec.entry[0], cy, cz + spec.entry[1]),
    exit: exitIt,
    heightAt: () => cy,
    clampPos: (pos) => {
      pos.x = THREE.MathUtils.clamp(pos.x, cx - HX + 0.8, cx + HX - 0.8);
      pos.z = THREE.MathUtils.clamp(pos.z, cz - HZ + 0.8, cz + HZ - 0.8);
    },
    tick(t) { for (const pk of pickups) tickPickup(pk, t); },
  };
}
