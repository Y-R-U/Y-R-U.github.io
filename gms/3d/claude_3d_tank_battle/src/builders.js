// Mesh builders. Currently: tank.

import * as THREE from 'three';

const TRACK_COLOR = 0x1a1a1a;

function darken(hex, k) {
  const r = (hex >> 16) & 0xff;
  const g = (hex >> 8) & 0xff;
  const b = hex & 0xff;
  return ((Math.max(0, r - k) << 16) | (Math.max(0, g - k) << 8) | Math.max(0, b - k)) >>> 0;
}

export function buildTank(hullColor) {
  const root = new THREE.Group();
  const hullDarkColor = darken(hullColor, 24);
  const metalColor = 0x5a6068;

  const hullMat = new THREE.MeshPhongMaterial({
    color: hullColor, flatShading: true, shininess: 15,
  });
  const hullDarkMat = new THREE.MeshPhongMaterial({
    color: hullDarkColor, flatShading: true, shininess: 10,
  });
  const trackMat = new THREE.MeshPhongMaterial({
    color: TRACK_COLOR, flatShading: true, shininess: 2,
  });
  const metalMat = new THREE.MeshPhongMaterial({
    color: metalColor, flatShading: true, shininess: 30,
  });

  // Lower hull
  const hull = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.9, 4.2), hullMat);
  hull.position.y = 0.85;
  hull.castShadow = true;
  root.add(hull);

  // Sloped front glacis
  const glacis = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.6, 1.0), hullMat);
  glacis.position.set(0, 1.1, 2.1);
  glacis.rotation.x = -0.45;
  glacis.castShadow = true;
  root.add(glacis);

  // Sloped rear
  const rear = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.55, 0.9), hullDarkMat);
  rear.position.set(0, 1.08, -2.0);
  rear.rotation.x = 0.4;
  rear.castShadow = true;
  root.add(rear);

  // Upper deck
  const deck = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.35, 2.6), hullDarkMat);
  deck.position.y = 1.4;
  deck.castShadow = true;
  root.add(deck);

  // Fenders
  for (const sx of [-1, 1]) {
    const fender = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.15, 4.2), hullDarkMat);
    fender.position.set(sx * 1.4, 1.1, 0);
    root.add(fender);
  }

  // Tracks & wheels
  for (const sx of [-1, 1]) {
    const track = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.75, 4.4), trackMat);
    track.position.set(sx * 1.52, 0.4, 0);
    track.castShadow = true;
    root.add(track);

    const topRail = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.08, 4.4), hullDarkMat);
    topRail.position.set(sx * 1.52, 0.83, 0);
    root.add(topRail);

    for (let i = 0; i < 5; i++) {
      const wheel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.32, 0.32, 0.18, 10),
        metalMat
      );
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(sx * 1.52, 0.34, -1.7 + i * 0.85);
      root.add(wheel);
    }
    for (const ez of [-2.0, 2.0]) {
      const sprocket = new THREE.Mesh(
        new THREE.CylinderGeometry(0.4, 0.4, 0.2, 8),
        new THREE.MeshPhongMaterial({ color: 0x2a2a2a, flatShading: true })
      );
      sprocket.rotation.z = Math.PI / 2;
      sprocket.position.set(sx * 1.52, 0.42, ez);
      root.add(sprocket);
    }
  }

  // Turret pivot
  const turret = new THREE.Group();
  turret.position.y = 1.58;
  root.add(turret);

  const turretBase = new THREE.Mesh(
    new THREE.CylinderGeometry(0.95, 1.1, 0.35, 10),
    hullMat
  );
  turret.add(turretBase);

  const turretBody = new THREE.Mesh(
    new THREE.BoxGeometry(2.0, 0.7, 2.0),
    hullMat
  );
  turretBody.position.y = 0.42;
  turretBody.castShadow = true;
  turret.add(turretBody);

  const turretFront = new THREE.Mesh(
    new THREE.BoxGeometry(2.0, 0.65, 0.6),
    hullDarkMat
  );
  turretFront.position.set(0, 0.42, 1.15);
  turretFront.rotation.x = -0.25;
  turret.add(turretFront);

  const hatch = new THREE.Mesh(
    new THREE.CylinderGeometry(0.26, 0.26, 0.12, 10),
    metalMat
  );
  hatch.position.set(-0.45, 0.82, -0.3);
  turret.add(hatch);

  const antenna = new THREE.Mesh(
    new THREE.CylinderGeometry(0.02, 0.02, 1.4, 4),
    new THREE.MeshBasicMaterial({ color: 0x222222 })
  );
  antenna.position.set(0.7, 1.2, -0.6);
  turret.add(antenna);

  // Barrel pivot (pitch)
  const barrelPivot = new THREE.Group();
  barrelPivot.position.set(0, 0.42, 0.7);
  turret.add(barrelPivot);

  const cannonBase = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 0.45, 0.5),
    hullDarkMat
  );
  cannonBase.position.set(0, 0, 0.25);
  barrelPivot.add(cannonBase);

  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.18, 2.6, 10),
    metalMat
  );
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0, 1.7);
  barrel.castShadow = true;
  barrelPivot.add(barrel);

  const muzzleBrake = new THREE.Mesh(
    new THREE.CylinderGeometry(0.23, 0.23, 0.3, 10),
    trackMat
  );
  muzzleBrake.rotation.x = Math.PI / 2;
  muzzleBrake.position.set(0, 0, 3.0);
  barrelPivot.add(muzzleBrake);

  root.userData.turret = turret;
  root.userData.barrelPivot = barrelPivot;
  root.userData.muzzleLocal = new THREE.Vector3(0, 0, 3.2);
  root.userData.tagAnchorLocal = new THREE.Vector3(0, 3.2, 0); // for floating name tag

  root.rotation.order = 'YXZ';
  return root;
}
