import * as THREE from 'three';
import { box, cyl, lathe } from './geo.js';
import { addTree } from './foliage.js';
import { createWaterfall, createWaterMaterial, createMist } from './water.js';
import { REFLECT_LAYER } from '../fx/reflection.js';
import { tiered } from './backdrop.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// Everything east of the rail: the lower basin, cascading pools and the great falls (ref 1's right side).
export function buildVista(ctx) {
  const { scene, batch, M, tier } = ctx;
  const WY = -7;
  const water = new THREE.Mesh(new THREE.PlaneGeometry(420, 460).rotateX(-Math.PI / 2), createWaterMaterial(ctx, { color: 0x1b4a5c }));
  water.position.set(250, WY, -60);
  water.geometry.attributes.uv.array.forEach((v, i, a) => { a[i] = v * 40; });
  water.receiveShadow = true;
  scene.add(water);

  // Great falls north-east: a curved lip pouring from a high terrace.
  const fallX = 72, fallZ = -104, top = 22;
  batch.put(box(56, top - WY + 2, 30), M.stoneUpper, V(fallX, (top + WY) / 2 - 1, fallZ - 16), 0, null, { cast: false });
  batch.put(box(58, 1.2, 4), M.stoneUpper, V(fallX, top + 0.4, fallZ - 0.5), 0, null, { cast: false });
  batch.put(box(58.2, 0.1, 0.06), M.gold, V(fallX, top + 1.0, fallZ + 1.52), 0, null, { cast: false });
  for (let x = fallX - 24; x <= fallX + 24; x += 6) addTree(batch, M, x, top + 1, fallZ - 6, (x * 3) | 0, 1.4);
  for (const [w, x] of [[20, fallX - 14], [16, fallX + 12]]) {
    const f = createWaterfall(ctx, { width: w, height: top - WY, lip: 2.5, bright: 1.05 });
    f.position.set(x, top, fallZ + 1.2);
    scene.add(f);
  }
  if (tier.mist) scene.add(createMist(ctx, { x: fallX, y: WY + 0.2, z: fallZ + 4, w: 46, d: 6, count: 200, size: 9 }));

  // Cascade terraces on the far bank: stepped pools with short falls.
  const bankX = 128;
  for (let i = 0; i < 4; i++) {
    const y = WY + 3 + i * 3.2, x = bankX + i * 9;
    batch.put(box(9, y - WY + 1, 150), M.stoneUpper, V(x, (y + WY) / 2 - 0.5, -30), 0, null, { cast: false });
    batch.put(box(0.1, 0.1, 150), M.warmGlow, V(x - 4.5, y - 0.6, -30), 0, null, { cast: false });
    const f = createWaterfall(ctx, { width: 40, height: 3.2, lip: 0.6, segsY: 4, bright: 1.5 });
    f.rotation.y = -Math.PI / 2; f.position.set(x - 4.5, y + 0.45, -52 + i * 18);
    scene.add(f);
    const pw = new THREE.Mesh(new THREE.PlaneGeometry(8.6, 150).rotateX(-Math.PI / 2), water.material);
    pw.position.set(x, y + 0.4, -30); scene.add(pw);
    for (let z = -100; z < 40; z += 11) if ((z + i * 7) % 3 !== 0) addTree(batch, M, x + 2.5, y + 0.5, z + i * 3, (z * 13 + i) | 0, 1.1);
  }
  // Far-bank buildings (low, cheap)
  for (let k = 0; k < 6; k++) {
    const z = -100 + k * 30, h = 18 + (k * 37) % 22;
    tiered(ctx, bankX + 52, WY + 12, z, 22, 20, -Math.PI / 2 + 0.1 * (k % 3 - 1),
      [{ h: 8 }, { h: h * 0.6, glass: true, warm: k % 2 === 0, setback: 1.5, garden: k % 2 === 1 }, { h: h * 0.5, glass: true, setback: 2.5, garden: true }], 40 + k);
  }
  // east-bank towers so the basin view has height
  for (const [x, z, h] of [[205, -70, 120], [230, 10, 90], [196, 60, 70]]) {
    batch.add(cyl(8, 10, h, x, WY, z, 16), M.facade, { cast: false });
    for (let y = WY + 20; y < h; y += 20) batch.add(cyl(10.6, 10.6, 1.4, x, y, z, 16), M.stoneUpper, { cast: false });
    batch.add(cyl(0.4, 7, 26, x, WY + h, z, 12), M.goldSolid, { cast: false });
  }
  // Islands with trees in the basin
  for (const [x, z, r] of [[70, -30, 7], [92, 20, 5]]) {
    batch.put(lathe([[0, 0], [r, 0], [r + 0.5, 0.6], [r, 1.2], [0, 1.2]], 32), M.stoneUpper, V(x, WY - 0.2, z), 0, null, { cast: false });
    for (let i = 0; i < 3; i++) addTree(batch, M, x + Math.sin(i * 2.1) * r * 0.45, WY + 1.2, z + Math.cos(i * 2.1) * r * 0.45, (x + i) | 0, 1.2);
  }
}
