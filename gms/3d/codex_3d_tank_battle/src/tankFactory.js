import * as THREE from 'three';
import { TANK_RADIUS, TUNING } from './config.js';

const geometries = {
  chassis: new THREE.BoxGeometry(2.6, 0.78, 3.35),
  tread: new THREE.BoxGeometry(0.58, 0.55, 3.75),
  wheel: new THREE.CylinderGeometry(0.24, 0.24, 0.13, 10),
  turret: new THREE.CylinderGeometry(0.78, 0.96, 0.62, 8),
  barrel: new THREE.CylinderGeometry(0.12, 0.17, 2.75, 8),
  antenna: new THREE.CylinderGeometry(0.025, 0.035, 1.4, 6),
  beacon: new THREE.SphereGeometry(0.14, 10, 8)
};

export function createTankEntity({ id, name, isPlayer, personality, color, accent, position }) {
  const materials = {
    body: new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0.18 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x101817, roughness: 0.74, metalness: 0.28 }),
    trim: new THREE.MeshStandardMaterial({ color: accent, roughness: 0.48, metalness: 0.14 }),
    glow: new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: isPlayer ? 1.9 : 1.25 })
  };
  const root = new THREE.Group();
  root.position.copy(position);
  root.position.y = 0.55;

  const chassis = new THREE.Mesh(geometries.chassis, materials.body);
  chassis.position.y = 0.38;
  chassis.castShadow = true;
  chassis.receiveShadow = true;
  root.add(chassis);

  for (const side of [-1, 1]) {
    const tread = new THREE.Mesh(geometries.tread, materials.dark);
    tread.position.set(side * 1.36, 0.12, 0);
    tread.castShadow = true;
    tread.receiveShadow = true;
    root.add(tread);

    for (let i = 0; i < 4; i += 1) {
      const wheel = new THREE.Mesh(geometries.wheel, materials.trim);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(side * 1.7, 0.12, -1.34 + i * 0.9);
      wheel.castShadow = true;
      root.add(wheel);
    }
  }

  const turretPivot = new THREE.Group();
  turretPivot.position.y = 1.0;
  root.add(turretPivot);

  const turret = new THREE.Mesh(geometries.turret, materials.body);
  turret.position.y = 0.16;
  turret.castShadow = true;
  turretPivot.add(turret);

  const barrel = new THREE.Mesh(geometries.barrel, materials.dark);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.25, 1.48);
  barrel.castShadow = true;
  turretPivot.add(barrel);

  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.25, 2.96);
  turretPivot.add(muzzle);

  const antenna = new THREE.Mesh(geometries.antenna, materials.dark);
  antenna.position.set(-0.48, 0.82, 0.34);
  antenna.rotation.z = -0.22;
  turretPivot.add(antenna);

  const beacon = new THREE.Mesh(geometries.beacon, materials.glow);
  beacon.position.set(0.46, 0.58, 0.26);
  turretPivot.add(beacon);

  const labelAnchor = new THREE.Object3D();
  labelAnchor.position.set(0, 3.35, 0);
  root.add(labelAnchor);

  return {
    id,
    name,
    isPlayer,
    personality,
    root,
    turretPivot,
    muzzle,
    labelAnchor,
    materials,
    color,
    accent,
    radius: TANK_RADIUS,
    maxHp: TUNING.maxHp,
    hp: TUNING.maxHp,
    alive: true,
    eliminatedAt: null,
    kills: 0,
    damage: 0,
    cooldown: 0,
    yaw: 0,
    turretYaw: 0,
    velocity: new THREE.Vector3(),
    brain: {
      targetId: null,
      retargetTimer: 0,
      strafeSide: Math.random() > 0.5 ? 1 : -1,
      wanderTimer: 0
    }
  };
}

export function markTankDestroyed(tank) {
  tank.alive = false;
  tank.root.visible = false;
}
