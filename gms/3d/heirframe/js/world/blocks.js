import * as THREE from 'three';
import { box, cyl, arcWall, arcTube, lathe } from './geo.js';
import { addTree } from './foliage.js';
import { HOLO_ART, createHoloMaterial, registerBillboard } from './holo.js';
import { createWaterfall, createWaterMaterial, createMist } from './water.js';
import { REFLECT_LAYER } from '../fx/reflection.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// A stepped city block: stone podium with shopfront glow, glass tiers above, garden roofs.
function block(ctx, x0, x1, zFront, depth, tiers) {
  const { batch, M, col } = ctx;
  const cx = (x0 + x1) / 2, w = x1 - x0;
  let y = 0, inset = 0;
  tiers.forEach((t, i) => {
    const tw = w - inset * 2, zf = zFront - inset, d = depth - inset;
    const zc = zf - d / 2;
    const mat = t.glass ? (t.warm ? M.facadeWarm : M.facade) : M.stoneUpper;
    batch.put(box(tw, t.h, d), i === 0 ? M.stone : mat, V(cx, y + t.h / 2, zc));
    if (i === 0) {
      batch.put(box(tw - 1.2, 4.2, 0.2), M.shopGlow, V(cx, 2.3, zf + 0.02), 0, null, { cast: false });
      batch.put(box(tw + 0.2, 0.6, 1.8), M.stoneUpper, V(cx, 4.9, zf + 0.9));
      batch.put(box(tw + 0.2, 0.08, 0.05), M.warmGlow, V(cx, 4.6, zf + 1.78), 0, null, { cast: false });
      for (let px = x0 + 3; px < x1 - 2; px += 4.5) batch.put(box(0.18, 4.4, 0.25), M.gold, V(px, 2.2, zf + 0.12));
    }
    batch.put(box(tw + 0.3, 0.45, d + 0.3), M.stoneUpper, V(cx, y + t.h + 0.22, zc));
    batch.put(box(tw + 0.34, 0.07, 0.05), M.gold, V(cx, y + t.h + 0.35, zf + 0.16), 0, null, { cast: false });
    y += t.h + 0.45;
    inset += t.setback || 0;
    if (t.garden) for (let gx = x0 + inset + 3; gx < x1 - inset - 2; gx += 5) addTree(batch, M, gx, y, zFront - inset - 2, (gx * 7) | 0, 1.1);
  });
  col.box(cx, zFront - depth / 2, w / 2, depth / 2, 0, 'block');
  return y;
}

export function buildBlocks(ctx) {
  const { batch, M, scene, col, updaters, layout } = ctx;
  const time = ctx.time;
  // NW: waterfall court + "A BRIGHTER FUTURE TOGETHER"
  // NW pair split by a service lane (x -36..-31)
  block(ctx, -62, -36, -66, 44, [{ h: 6 }, { h: 14, glass: true, warm: true, setback: 2 }, { h: 10, glass: true, setback: 3, garden: true }, { h: 8, glass: true }]);
  block(ctx, -31, -14, -66, 44, [{ h: 6 }, { h: 18, glass: true, setback: 2 }, { h: 12, glass: true, warm: true, setback: 3, garden: true }]);
  const fall = createWaterfall(ctx, { width: 12, height: 19.5, lip: 1.8 });
  fall.position.set(-47, 20.6, -66.2);
  scene.add(fall);
  batch.put(box(13, 1.0, 3.2), M.stoneUpper, V(-47, 20.3, -66.6));
  batch.put(box(13.2, 0.08, 0.06), M.gold, V(-47, 20.8, -65.0), 0, null, { cast: false });
  batch.put(box(14, 20, 0.4), M.facadeWarm, V(-47, 10, -66.1), 0, null, { cast: false });
  const pool = lathe([[0, 0], [8.2, 0], [8.4, 0.1], [8.4, 0.6], [8.0, 0.7], [7.7, 0.45], [0, 0.45]], 48);
  const poolG = pool.clone(); poolG.scale(1, 1, 0.55);
  batch.put(poolG, M.stoneUpper, V(-47, 0, -63.5));
  const pw = new THREE.Mesh(new THREE.CircleGeometry(7.75, 48).rotateX(-Math.PI / 2).scale(1, 1, 0.55), createWaterMaterial(ctx, { color: 0x1d4f60, reflect: true }));
  pw.position.set(-47, 0.55, -63.5); pw.layers.enable(REFLECT_LAYER); scene.add(pw);
  if (ctx.tier.mist) scene.add(createMist(ctx, { x: -47, y: 0.6, z: -64.5, w: 11, d: 3, count: 120, size: 3.5 }));
  col.custom((x, z, r) => { const dx = (x + 47) / (8.5 + r), dz = (z + 63.5) / (4.7 + r); return dx * dx + dz * dz < 1; });

  // curved billboard on NW block's east end
  const bb = new THREE.Group();
  const bbR = 26, bbA = 0.62;
  const bbGeo = new THREE.CylinderGeometry(bbR, bbR, 9, 32, 1, true, Math.PI - bbA / 2, bbA);
  { const uv = bbGeo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i)); }
  const bbMesh = new THREE.Mesh(bbGeo, createHoloMaterial(HOLO_ART.brighter(), { bright: 2.1, alpha: 0.95, time }));
  bbMesh.layers.enable(REFLECT_LAYER);
  registerBillboard(ctx, bbMesh.material, 1024, 576);
  bb.add(bbMesh);
  const bbZ = -63.8 + bbR;
  bb.position.set(-22.5, 13.5, bbZ);
  scene.add(bb);
  const frameM = new THREE.Matrix4().makeTranslation(-22.5, 0, bbZ);
  batch.add(arcTube(bbR + 0.05, Math.PI - bbA / 2, Math.PI + bbA / 2, 18.1, 0.12, 32), M.gold, { matrix: frameM });
  batch.add(arcTube(bbR + 0.05, Math.PI - bbA / 2, Math.PI + bbA / 2, 8.9, 0.12, 32), M.gold, { matrix: frameM });
  batch.add(arcWall(bbR + 0.6, Math.PI - bbA / 2, Math.PI + bbA / 2, 8.6, 18.4, 32, true), M.darkMetal, { matrix: frameM });

  // NE: tower block with the tall HARMONY THROUGH UNITY panel
  // NE pair: tall block A, low block B, service yard behind B (x 26..40, z -80..-96)
  block(ctx, 14, 26, -66, 44, [{ h: 6 }, { h: 16, glass: true, setback: 1.5 }, { h: 14, glass: true, setback: 2, garden: true }]);
  block(ctx, 33, 46, -66, 14, [{ h: 6 }, { h: 7, glass: true, warm: true, setback: 1, garden: true }]);
  const hp = new THREE.Mesh(new THREE.PlaneGeometry(8, 16), createHoloMaterial(HOLO_ART.harmony(), { bright: 2.0, alpha: 0.96, time }));
  registerBillboard(ctx, hp.material, 512, 1024);
  hp.position.set(20, 15, -65.4); hp.rotation.y = -0.12; hp.layers.enable(REFLECT_LAYER);
  scene.add(hp);
  batch.put(box(8.6, 16.6, 0.5), M.darkMetal, V(20.05, 15, -65.95), -0.12);
  batch.put(box(8.8, 0.18, 0.3), M.gold, V(20, 23.35, -65.6), -0.12);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(6, 0.9), createHoloMaterial(HOLO_ART.sign('NEXUS'), { bright: 3, alpha: 0.9, time }));
  sign.position.set(-22.5, 5.6, -63.9); sign.layers.enable(REFLECT_LAYER); scene.add(sign);

  // North: Concord Hall closing the boulevard
  const hallZ = -84;
  for (let i = 0; i < 6; i++) batch.put(box(26, 0.2 * (i + 1), 0.6), M.stoneUpper, V(0, 0.1 * (i + 1), -80.2 - i * 0.6));
  batch.put(box(30, 16, 22), M.stoneUpper, V(0, 8 + 1.2, hallZ - 11));
  batch.put(box(12, 12, 0.4), M.shopGlow, V(0, 7.2, hallZ + 0.05), 0, null, { cast: false });
  for (let k = -5; k <= 5; k += 2) batch.add(cyl(0.55, 0.65, 13.5, k * 1.4, 1.2, hallZ + 2.5, 18), M.gold);
  batch.put(box(16, 1.4, 5), M.stoneUpper, V(0, 15.2, hallZ + 1.5));
  batch.put(box(16.2, 0.12, 0.08), M.warmGlow, V(0, 14.45, hallZ + 4.0), 0, null, { cast: false });
  const hallSign = new THREE.Mesh(new THREE.PlaneGeometry(14, 1.6), createHoloMaterial(HOLO_ART.sign('CONCORD HALL', 1024, 128), { bright: 2.6, alpha: 0.9, time }));
  hallSign.position.set(0, 17.4, hallZ + 1.0); hallSign.layers.enable(REFLECT_LAYER); scene.add(hallSign);
  batch.put(box(26, 22, 18), M.facade, V(0, 17.2 + 11, hallZ - 14));
  col.box(0, -90, 16, 9, 0, 'hall');
}
