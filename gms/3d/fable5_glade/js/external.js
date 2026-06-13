// Optional imported-asset showcase (?pp=1).
//
// The Glade is deliberately 100% primitives + canvas textures — that's the
// point of the test. This module is the ONE exception: when ?pp=1 is set it
// loads a couple of PolyPerfect GLBs (exported from the Unity pack via the
// shared cache — see ~/cc/assets/POLYPERFECT_ASSET_HOWTO.md) and drops them
// into the scene next to their hand-built equivalents so you can compare the
// look and the triangle budgets side by side in the 🐞 panel.
//
// Models live in ./models/ ; they keep their own baked materials (no retint),
// get a ground-snapped placement, a collider, and a registry entry under the
// "Imported" category. Animation clips are NOT exported yet, so the person
// stands in its bind pose (see the HOWTO's "Scenes And Animations" section).

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { register } from './registry.js';
import { groundHeight } from './world.js';

const loader = new GLTFLoader();

// scale a loaded root so its height (or max dimension) hits a target size,
// then recenter on x/z and drop its base to y=0 — same idea as fitToSize in
// the codex_pp_test proof scene.
function fitToSize(root, target, mode = 'height') {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const measure = mode === 'height' ? size.y : Math.max(size.x, size.y, size.z);
  root.scale.multiplyScalar(target / Math.max(measure, 1e-3));
  root.updateMatrixWorld(true);
  const b2 = new THREE.Box3().setFromObject(root);
  const c = b2.getCenter(new THREE.Vector3());
  root.position.x -= c.x;
  root.position.z -= c.z;
  root.position.y -= b2.min.y;
}

async function loadOne(scene, { file, x, z, target, mode, rotY, name, icon, note, colliderR }) {
  const gltf = await loader.loadAsync(`./models/${file}`);
  const model = gltf.scene;
  model.traverse((o) => {
    if (!o.isMesh && !o.isSkinnedMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    o.frustumCulled = false; // scaled skinned meshes cull wrong otherwise
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) { if (m && m.map) m.map.colorSpace = THREE.SRGBColorSpace; }
  });

  // wrap so fitToSize can move the inner model freely while the group sits at
  // the placement point — matches the rest of the scene's "Group at ground" rule
  const group = new THREE.Group();
  group.add(model);
  fitToSize(model, target, mode);
  group.position.set(x, groundHeight(x, z), z);
  group.rotation.y = rotY || 0;
  scene.add(group);

  register({
    name, category: 'Imported', icon, object: group,
    collider: colliderR ? { r: colliderR } : null, pickup: null, note,
  });
  return group;
}

// loads in the background; failures are swallowed into the error log so a
// missing GLB never breaks the pure-primitives scene.
export async function loadExternal(scene) {
  try {
    await Promise.all([
      loadOne(scene, {
        file: 'tree-ddf7f5e4.glb', x: 4.2, z: 9.4, target: 5.2, mode: 'height',
        rotY: 0.6, name: 'PolyPerfect Tree', icon: '📦', colliderR: 0.5,
        note: 'Imported GLB (PolyPerfect Low Poly Ultimate Pack). Baked atlas material — compare with the hand-built Oak/Pine beside it',
      }),
      loadOne(scene, {
        file: 'man-casual-e7731e31.glb', x: 2.6, z: 1.6, target: 1.82, mode: 'height',
        rotY: -2.4, name: 'PolyPerfect Person', icon: '📦', colliderR: 0.4,
        note: 'Imported rigged GLB (man_casual). Bind pose — animation clips not exported yet. Compare budget with Roland/Maeve/Garrick/Wren',
      }),
    ]);
    console.info('[pp] imported PolyPerfect assets loaded — open 🐞 to see tri counts under "Imported"');
  } catch (e) {
    window.__errors?.push('pp load: ' + String(e));
    console.warn('[pp] import failed', e);
  }
}
