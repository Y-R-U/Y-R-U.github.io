// The garage turntable: your actual hull, gun and camo, lit and rotating, so
// buying a paint job or a new chassis is a decision you can see.

import * as THREE from 'three';
import { actorRoot, camera } from './render.js';
import { buildTank, buildDrone } from './tankFactory.js';
import { WEAPONS, CAMOS } from './arsenal.js';
import { terrainHeight } from './terrain.js';
import { damp, lerp } from './utils.js';
import { profile } from './save.js';


let group = null;
let tank = null;
let drone = null;
let spin = 0;
let key = '';

export function showPreview() {
  const camo = CAMOS[profile.camo] || CAMOS.olive;
  const gun = WEAPONS[profile.weapon] || WEAPONS.ap76;
  const k = [profile.chassis, gun.kind, camo.id].join('|');
  if (group && k === key) { group.visible = true; return; }
  key = k;
  hidePreview();

  group = new THREE.Group();
  const built = buildTank({
    chassis: profile.chassis, weaponKind: gun.kind,
    hull: camo.hull, accent: camo.accent, isPlayer: true,
  });
  tank = built;
  built.turretG.rotation.y = -0.34;
  built.barrelG.rotation.x = 0.06;
  group.add(built.grp);

  const d = buildDrone(camo.accent);
  drone = d;
  d.grp.position.set(2.6, 4.4, 2.2);
  d.grp.scale.setScalar(1.1);
  group.add(d.grp);

  // a simple dais so it does not look like it is floating on the battlefield
  const dais = new THREE.Mesh(
    new THREE.CylinderGeometry(5.0, 5.4, 0.45, 24),
    new THREE.MeshStandardMaterial({ color: 0x3a4048, flatShading: true, roughness: 0.85 }));
  dais.position.y = -0.22;
  dais.receiveShadow = true;
  group.add(dais);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(5.1, 5.4, 48),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(camo.accent).multiplyScalar(1.3), transparent: true,
      opacity: 0.5, side: THREE.DoubleSide, depthWrite: false,
      blending: THREE.AdditiveBlending, fog: false,
    }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  group.add(ring);

  group.position.set(0, terrainHeight(0, 0) + 0.2, 0);
  actorRoot.add(group);
  spin = 0.6;
}

export function hidePreview() {
  if (!group) return;
  actorRoot.remove(group);
  group.traverse((n) => {
    if (n.geometry) n.geometry.dispose();
    if (n.material && !Array.isArray(n.material)) n.material.dispose();
  });
  group = null;
  tank = null;
  drone = null;
  key = '';
}

export function previewVisible() { return !!group; }

const goal = new THREE.Vector3();
const look = new THREE.Vector3();

export function updatePreview(dt) {
  if (!group) return;
  spin += dt * 0.32;
  group.rotation.y = spin;
  if (drone) {
    drone.grp.position.y = 4.4 + Math.sin(spin * 2.4) * 0.3;
    for (let i = 0; i < drone.rotors.length; i++) {
      drone.rotors[i].rotation.z += (i % 2 ? 26 : -26) * dt;
    }
  }

  // Frame the hull low in the shot so it sits under the garage panels rather
  // than behind them.
  const base = group.position.y;
  const tall = window.innerHeight > 620;
  // On a wide screen the panels sit left and the turntable swings right; on a
  // phone it drops to the bottom of the frame instead.
  const wide = window.innerWidth >= 980;
  goal.set(0, base + (tall ? 9.5 : 7.5), tall ? 24 : 20);
  camera.position.lerp(goal, damp(3.2, dt));
  look.set(wide ? -7.5 : 0, base + (tall ? 5.6 : 3.6), 0);
  camera.lookAt(look);
  if (Math.abs(camera.fov - 42) > 0.1) {
    camera.fov = lerp(camera.fov, 42, damp(5, dt));
    camera.updateProjectionMatrix();
  }
}
