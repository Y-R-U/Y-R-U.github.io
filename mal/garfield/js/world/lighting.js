import * as THREE from '../../vendor/three/three.module.js';
import { RoomEnvironment } from '../../vendor/three/addons/environments/RoomEnvironment.js';

const SHADOW = { high: 2048, medium: 1024, low: 0 };
const MAX_LAMPS = { high: 4, medium: 2, low: 1 };
// Evening: lamps carry the rooms (pools of warm light), ambient stays low so corners fall off.
const LAMP_GAIN = 1.55;
const LAMP_TINT = new THREE.Color(0xffdcb0);

// Warm evening interior: hemisphere fill + one shadow-casting warm key + a few unshadowed lamp points.
export function createLighting({ renderer, scene, quality = 'high', lamps = [] }) {
  const hemi = new THREE.HemisphereLight(0xffdcb0, 0x7a5640, 0.48);
  scene.add(hemi);

  const key = new THREE.DirectionalLight(0xffc996, 2.4);
  const target = new THREE.Object3D();
  scene.add(target);
  key.target = target;
  scene.add(key);
  const sm = SHADOW[quality] ?? 1024;
  key.castShadow = sm > 0;
  if (sm) {
    key.shadow.mapSize.set(sm, sm);
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.025;
    key.shadow.radius = 3;
  }

  const fill = new THREE.DirectionalLight(0x9db8e0, 0.35);
  fill.position.set(14, 6, 20);
  scene.add(fill);

  // Fixed light count (changing it recompiles every shader); lamps are re-assigned per storey.
  const points = [];
  for (let i = 0; i < (MAX_LAMPS[quality] ?? 2); i++) {
    const p = new THREE.PointLight(0xffffff, 0, 5, 2);
    scene.add(p);
    points.push(p);
  }
  // one downward spot for the kitchen pendant (not on low: one more light isn't worth it there)
  let spot = null;
  if (quality !== 'low' && lamps.some(l => l.spot)) {
    spot = new THREE.SpotLight(0xffffff, 0, 10, Math.PI * 0.42, 0.75, 2);
    scene.add(spot, spot.target);
  }
  let focus = null;
  function assignLamps(floor) {
    let list = lamps.filter(l => (l.pos.y > 2.9 ? 1 : 0) === floor).sort((a, b) => (a.room === focus ? -10 : 0) + a.prio - (b.room === focus ? -10 : 0) - b.prio);
    if (spot) {
      const l = list.find(q => q.spot);
      spot.intensity = 0;
      if (l) {
        spot.position.copy(l.pos); spot.target.position.set(l.pos.x, l.pos.y - 3, l.pos.z);
        spot.color.set(l.color).lerp(LAMP_TINT, 0.35); spot.distance = l.distance * 1.15; spot.intensity = l.intensity * LAMP_GAIN * 0.72;
        list = list.filter(q => q !== l);
      }
    }
    points.forEach((p, i) => {
      const l = list[i];
      if (!l) { p.intensity = 0; return; }
      p.position.copy(l.pos); p.color.set(l.color).lerp(LAMP_TINT, 0.35); p.distance = l.distance * 1.15;
      p.intensity = l.intensity * LAMP_GAIN; p.userData.base = p.intensity;
    });
  }

  let env = null;
  if (renderer) {
    const pm = new THREE.PMREMGenerator(renderer);
    env = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    pm.dispose();
    scene.environment = env;
  }
  scene.environmentIntensity = 0.32;

  let mode = null;
  const api = {
    hemi, key, fill, points, spot, env,
    // lamps of the room the camera is in win the limited point-light slots (Lyman's room upstairs)
    setFocusRoom(room, floor) { if (room === focus) return; focus = room; if (mode && mode.startsWith('interior')) assignLamps(floor); },
    // 'interior': shadow box over the active floor; 'exterior': dusk sun over the whole cul-de-sac.
    setMode(m, floor = 0) {
      const tag = m + floor;
      if (mode === tag) return;
      mode = tag;
      const cam = key.shadow.camera;
      if (m === 'exterior') {
        hemi.color.set(0x9a84d0); hemi.groundColor.set(0x4a3848); hemi.intensity = 0.7;
        key.color.set(0xff8a44); key.intensity = 1.75;
        target.position.set(4.6, 0, -10);
        key.position.set(4.6 + 0.45 * 50, 9, -10 + 0.89 * 50);
        Object.assign(cam, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 120 });
        scene.environmentIntensity = 0.25;
        assignLamps(0);
      } else {
        hemi.color.set(0xffd6a8); hemi.groundColor.set(0x6a4a38); hemi.intensity = 0.32;
        key.color.set(0xffbc80); key.intensity = 1.05;
        assignLamps(floor ? 1 : 0);
        const y = floor ? 3.0 : 0;
        target.position.set(4.6, y, 5.5);
        key.position.set(4.6 - 6, y + 11, 5.5 - 7);
        Object.assign(cam, { left: -8.5, right: 8.5, top: 8.5, bottom: -8.5, near: 2, far: 30 });
        scene.environmentIntensity = 0.13;
      }
      cam.updateProjectionMatrix();
      key.shadow.needsUpdate = true;
    },
    dispose() {
      for (const o of [hemi, key, fill, target, ...points, spot, spot?.target]) if (o) scene.remove(o);
      env?.dispose();
    },
  };
  api.setMode('interior', 0);
  return api;
}
