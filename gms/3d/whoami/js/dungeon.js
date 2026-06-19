// The dungeon: a dark stone crypt built from the pack's dungeon kit, sitting on
// its own flat platform far from the meadow. It's an "area" — main swaps the
// player's heightAt/clamp/colliders to these and toggles visibility when you
// enter/exit. Holds monster spawn points and a treasure chest.

import * as THREE from 'three';
import { model as loadModel } from './assets.js';
import { rand } from './utils.js';

const CX = 400, CZ = 0;          // platform centre (far from the overworld)
const HALF_X = 19, HALF_Z = 30;  // interior half-extents
const FLOOR_Y = 0;

export function buildDungeon(scene) {
  const root = new THREE.Group();
  root.visible = false;
  scene.add(root);

  // dark stone floor
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(HALF_X * 2 + 4, HALF_Z * 2 + 4).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x3a3733, roughness: 1, metalness: 0 })
  );
  floor.position.set(CX, FLOOR_Y, CZ); floor.receiveShadow = true; root.add(floor);
  // ceiling (low) for enclosure
  const ceil = floor.clone(); ceil.rotation.x = Math.PI / 2; ceil.position.y = 6; ceil.material = new THREE.MeshStandardMaterial({ color: 0x222020, roughness: 1 }); root.add(ceil);

  const colliders = [];
  const torchLights = [];

  // perimeter walls from dn_wall, tiled
  const SEG = 4;
  loadModel('dn_wall').then(tmpl => {
    const sx = tmpl.userData.size?.x || 2;
    const scale = SEG / sx;
    const addWall = (x, z, rotY) => {
      const m = tmpl.clone(true); m.scale.setScalar(scale * 1.0); m.scale.y = 3.0 / (tmpl.userData.size?.y || 2) * scale * (tmpl.userData.size?.y || 2);
      m.scale.setScalar(scale); m.scale.y = scale * 1.5;
      m.position.set(x, FLOOR_Y, z); m.rotation.y = rotY; root.add(m);
    };
    for (let x = -HALF_X; x <= HALF_X; x += SEG) { addWall(CX + x, CZ - HALF_Z, 0); addWall(CX + x, CZ + HALF_Z, Math.PI); }
    for (let z = -HALF_Z; z <= HALF_Z; z += SEG) { addWall(CX - HALF_X, CZ + z, Math.PI / 2); addWall(CX + HALF_X, CZ + z, -Math.PI / 2); }
  });
  // wall colliders (as a ring of circles)
  for (let x = -HALF_X; x <= HALF_X; x += SEG) { colliders.push({ x: CX + x, z: CZ - HALF_Z, r: 1.6 }, { x: CX + x, z: CZ + HALF_Z, r: 1.6 }); }
  for (let z = -HALF_Z; z <= HALF_Z; z += SEG) { colliders.push({ x: CX - HALF_X, z: CZ + z, r: 1.6 }, { x: CX + HALF_X, z: CZ + z, r: 1.6 }); }

  // pillars
  const pillars = [[-9, -12], [9, -12], [-9, 12], [9, 12], [0, 0]];
  loadModel('dn_pillar').then(tmpl => {
    for (const [px, pz] of pillars) { const m = tmpl.clone(true); m.scale.setScalar(1.4); m.position.set(CX + px, FLOOR_Y, CZ + pz); root.add(m); }
  });
  for (const [px, pz] of pillars) colliders.push({ x: CX + px, z: CZ + pz, r: 1.1 });

  // wall torches with light
  const torchPos = [[-HALF_X + 1, -16], [-HALF_X + 1, 16], [HALF_X - 1, -16], [HALF_X - 1, 16], [0, -HALF_Z + 2]];
  loadModel('dn_torch').then(tmpl => {
    for (const [tx, tz] of torchPos) { const m = tmpl.clone(true); m.scale.setScalar(1.4); m.position.set(CX + tx, FLOOR_Y + 2.4, CZ + tz); root.add(m); }
  });
  for (const [tx, tz] of torchPos) {
    const L = new THREE.PointLight(0xff8a3a, 2.0, 18, 2);
    L.position.set(CX + tx, FLOOR_Y + 2.8, CZ + tz); root.add(L); torchLights.push(L);
  }
  root.add(new THREE.HemisphereLight(0x46506a, 0x14110d, 0.35));

  // entrance portal (back to the surface)
  const portal = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.18, 8, 20), new THREE.MeshStandardMaterial({ color: 0x6fc7ff, emissive: 0x2a6fae, emissiveIntensity: 1.4, roughness: 0.4 }));
  portal.material.userData.noWire = true;
  portal.position.set(CX, FLOOR_Y + 1.6, CZ + HALF_Z - 2.5); portal.rotation.x = Math.PI / 2; root.add(portal);

  // treasure chest at the far end — a gold glow + floating beacon make it easy
  // to spot across the dark crypt, and an invisible proxy makes it easy to tap.
  const chest = { pos: new THREE.Vector3(CX, FLOOR_Y, CZ - HALF_Z + 3), opened: false, group: null };
  const chestGlow = new THREE.PointLight(0xffd66a, 2.6, 14, 2);
  chestGlow.position.set(chest.pos.x, FLOOR_Y + 1.6, chest.pos.z); root.add(chestGlow);
  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 12, 10),
    new THREE.MeshBasicMaterial({ color: 0xffe9a6, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  beacon.material.userData.noWire = true;
  beacon.position.set(chest.pos.x, FLOOR_Y + 2.2, chest.pos.z); root.add(beacon);
  chest.glow = chestGlow; chest.beacon = beacon;
  loadModel('chest').then(m => {
    m.scale.setScalar(1.4); m.position.copy(chest.pos); root.add(m); chest.group = m;
    const proxy = new THREE.Mesh(new THREE.SphereGeometry(1.1, 8, 6),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }));
    proxy.position.y = 0.5; m.add(proxy);   // child of the chest → a tap walks up to userData.interact
  });

  // monster spawn points
  const spawns = [];
  const types = ['skeleton', 'spider', 'snake', 'skeleton', 'zombie', 'skeleton_soldier', 'spider', 'snake'];
  for (let i = 0; i < types.length; i++) {
    const x = CX + rand(-HALF_X + 4, HALF_X - 4), z = CZ + rand(-HALF_Z + 6, HALF_Z - 8);
    spawns.push({ type: types[i], x, z });
  }

  return {
    root, floor, colliders, chest, portal,
    floorY: FLOOR_Y,
    center: new THREE.Vector3(CX, 0, CZ),
    entryPos: new THREE.Vector3(CX, 0, CZ + HALF_Z - 9),     // arrive clear of the exit portal
    portalPos: new THREE.Vector3(CX, 0, CZ + HALF_Z - 2.5),  // step here to leave
    spawns,
    heightAt: () => FLOOR_Y,
    clampPos: (pos) => {
      pos.x = Math.max(CX - HALF_X + 1, Math.min(CX + HALF_X - 1, pos.x));
      pos.z = Math.max(CZ - HALF_Z + 1, Math.min(CZ + HALF_Z - 1, pos.z));
    },
    tick(t) {
      for (let i = 0; i < torchLights.length; i++) torchLights[i].intensity = 1.7 + Math.sin(t * 12 + i) * 0.4;
      portal.rotation.z = t * 0.6;
      const open = chest.opened;
      beacon.visible = !open; chestGlow.visible = !open;   // hide the glow once looted
      if (!open) {
        beacon.position.y = FLOOR_Y + 2.1 + Math.sin(t * 2) * 0.14;
        beacon.material.opacity = 0.55 + (Math.sin(t * 4) * 0.5 + 0.5) * 0.4;
        chestGlow.intensity = 2.2 + Math.sin(t * 5) * 0.5;
      }
    },
  };
}
