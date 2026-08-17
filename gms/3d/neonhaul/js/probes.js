// The P1a MATERIAL PROBE RIG: 40 instanced boxes and a ground plane, built only under `?probes=1`.
//
// P1a wrote this as `js/debug_scene.js` and marked it for P2 to delete. P2 deleted the file — but
// not the five fixtures inside it, because `tools/gates_p1a.mjs` asserts on them and deleting
// them would delete five standing gates (§3.4's atlas wrap, §4.1.1's three depths, §4.2's fog
// band, §4.6's ACES A/B and the daysmog blue check). A 400 m box with a known iUvScale is the
// only honest way to test those; a procedural city is not a controlled sample. So the 40-box
// scene survives, renamed, behind its own flag, and `?probes=1` SUPPRESSES the city entirely so
// the P1a numbers keep measuring exactly what they measured before.
//
// Five of the forty are not decoration. They are the gates:
//   T  — a 400 m box, 111 window rows, iUvScale.y = 3.47. §3.4's whole point: a naive
//        `uv * iUvScale + iUvOffset` runs three and a half times across the entire atlas here.
//   D1..D3 — unlit silhouettes at 300 / 600 / 850 m, for §4.1.1's three-depth luminance check.
//   B  — a 500 m unlit slab for the §4.2 height-fog band, which must sit at 90-260 m.

import * as THREE from 'three';
import { xorshift32 } from './utils.js';
import { DISTRICTS, windowTint } from './districts.js';
import { COLS_PER_CELL, ROWS_PER_CELL, GRID, cellOffset } from './atlas.js';
import { uvScaleFor } from './materials.js';

export const COUNT = 40;

// Camera presets each gate drives itself to. Kept here, next to the geometry they frame, so a
// moved box and a stale camera cannot drift apart.
export const VIEWS = {
  boxes: { pos: [0, 150, 220], yaw: 0, pitch: -6, fov: 62 },
  tiling: { pos: [-900, 200, 150], yaw: 0, pitch: 0, fov: 62 },
  depth: { pos: [900, 320, 0], yaw: 0, pitch: 0, fov: 62 },
  band: { pos: [1900, 250, 0], yaw: 0, pitch: 0, fov: 62 },
};

export function buildProbeScene(scene, mats, atlas) {
  const rng = xorshift32(0x51ce);
  const geo = new THREE.BoxGeometry(1, 1, 1);

  const off = new Float32Array(COUNT * 2);
  const scl = new Float32Array(COUNT * 3);   // vec3 since P2 — (W, H, D); these boxes are square
  const emi = new Float32Array(COUNT * 3);
  // P11 added two shell attributes. This rig SHARES the shell material, so a missing attribute
  // would be read as the generic (0,0,0,1) and every fixture would render with a black upper zone
  // — five standing P1a gates measuring a bug. The rig is deliberately ZONE-FREE: second zone
  // equal to the first, split below the ground, no band, crown above the roof. A 400 m box with a
  // known iUvScale is only a controlled sample if nothing about it varies that the gate does not
  // name.
  const emi2 = new Float32Array(COUNT * 3);
  const zon = new Float32Array(COUNT * 4);
  const sed = new Float32Array(COUNT);

  const mesh = new THREE.InstancedMesh(geo, mats.shell, COUNT);
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  mesh.frustumCulled = false;

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const tint = [0, 0, 0];
  const uv = [0, 0, 0];
  const anchors = {};

  // `cell` is the atlas cell index (which window pattern); `lit` false makes an unlit silhouette,
  // which is what §4.1.1 measures — fog against shell albedo, with nothing emissive in the way.
  function put(i, x, y, z, w, h, d, cell, district, lit = true) {
    pos.set(x, y + h / 2, z);
    sc.set(w, h, d);
    m4.compose(pos, q, sc);
    mesh.setMatrixAt(i, m4);

    const o = cellOffset(atlas.windows, cell % (GRID * GRID));
    off[i * 2] = o[0]; off[i * 2 + 1] = o[1];

    uvScaleFor(w, h, COLS_PER_CELL, ROWS_PER_CELL, uv);
    scl[i * 3] = uv[0]; scl[i * 3 + 1] = uv[1]; scl[i * 3 + 2] = uv[0];

    if (lit) {
      windowTint(district, rng, tint);
      emi[i * 3] = tint[0]; emi[i * 3 + 1] = tint[1]; emi[i * 3 + 2] = tint[2];
      emi2[i * 3] = tint[0]; emi2[i * 3 + 1] = tint[1]; emi2[i * 3 + 2] = tint[2];
    }
    zon[i * 4] = -1;                     // split below the ground → one colour everywhere
    zon[i * 4 + 1] = 0; zon[i * 4 + 2] = 0;   // band0 === band1 → no unlit band
    zon[i * 4 + 3] = 1e6;                // crown above the roof → no unlit crown
    sed[i] = rng() * 100;
  }

  // 0-31 — the field. Eight districts, so every palette is on screen at once.
  for (let i = 0; i < 32; i++) {
    const row = (i / 7) | 0, col = i % 7;
    const d = DISTRICTS[i % DISTRICTS.length];
    const h = d.h[0] + Math.pow(rng(), 2.2) * (d.h[1] - d.h[0]);
    const w = 26 + rng() * 40, dep = 26 + rng() * 40;
    put(i, (col - 3) * 92 + (rng() - 0.5) * 20, 0, -120 - row * 130 + (rng() - 0.5) * 30,
      w, h, dep, (i * 5 + row) % 16, d, true);
  }

  // 32-34 — the TWIN STACK, and it is the whole §3.4 gate.
  //
  // Three boxes of exactly 115.2 m — 32 rows x 3.6 m, i.e. ONE atlas cell — stacked to 345.6 m
  // beside the tall one. Each has iUvScale.y = 1.0, so each tiles its cell exactly once and none
  // of them ever wraps; the stack is therefore what the 400 m box's fract() wrap is supposed to
  // reproduce, at the same heights, the same distance, the same fog and the same cell. Comparing
  // against a SHORT twin instead would have compared two different fog altitudes and measured the
  // §4.2 band by mistake.
  const CELL_M = ROWS_PER_CELL * 3.6;
  for (let k = 0; k < 3; k++) put(32 + k, -810, k * CELL_M, -260, 60, CELL_M, 60, 0, DISTRICTS[0], true);

  // 35 — T, the §3.4 tiling case. 400 m tall: iUvScale.y = 400 / 3.6 / 32 = 3.47.
  put(35, -900, 0, -260, 60, 400, 60, 0, DISTRICTS[0], true);
  anchors.tiling = { x: -900, z: -260, w: 60, h: 400, camZ: 150,
    uvScaleY: +(400 / 3.6 / ROWS_PER_CELL).toFixed(4),
    cellRows: ROWS_PER_CELL, cellMetres: +(ROWS_PER_CELL * 3.6).toFixed(1),
    // sample heights up the tall face — 40 m to 360 m spans three atlas-cell wraps
    ys: [40, 105, 170, 235, 300],
    twinX: -810, twinTop: +(ROWS_PER_CELL * 3.6 * 3).toFixed(1), uvScaleTwin: 1.0 };

  // 36-38 — D1..D3, §4.1.1's three depths, sampled at the camera's own altitude so "depth" is
  // exactly |z| and the arithmetic in §4.1.1 is the arithmetic being tested.
  const D = [[700, -300], [930, -600], [1150, -850]];
  D.forEach(([x, z], k) => put(36 + k, x, 0, z, 90, 640, 60, 12, DISTRICTS[6], false));
  // three's vFogDepth is `-mvPosition.z` — the VIEW-SPACE depth, not the radial distance — so
  // with the camera unrotated these three are at exactly 300 / 600 / 850 m whatever their x is.
  anchors.depth = { camera: VIEWS.depth.pos, points: D.map(([x, z]) => [x, 320, z + 30]),
    depths: D.map(([, z]) => -z) };

  // 39 — B, the height-fog band. 500 m of unlit slab crossing 90 m and 260 m.
  put(39, 1900, 0, -620, 150, 500, 60, 12, DISTRICTS[6], false);
  anchors.band = { camera: VIEWS.band.pos, x: 1900, z: -590,
    ys: [20, 45, 70, 90, 110, 135, 160, 185, 210, 235, 260, 300, 350, 420, 480],
    smogTop: 90, clearY: 260 };

  geo.setAttribute('iUvOffset', new THREE.InstancedBufferAttribute(off, 2));
  geo.setAttribute('iUvScale', new THREE.InstancedBufferAttribute(scl, 3));
  geo.setAttribute('iEmissive', new THREE.InstancedBufferAttribute(emi, 3));
  geo.setAttribute('iEmissive2', new THREE.InstancedBufferAttribute(emi2, 3));
  geo.setAttribute('iZone', new THREE.InstancedBufferAttribute(zon, 4));
  geo.setAttribute('iSeed', new THREE.InstancedBufferAttribute(sed, 1));
  mesh.instanceMatrix.needsUpdate = true;
  scene.add(mesh);

  // the deck
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), mats.ground);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.5;
  scene.add(ground);

  return { mesh, ground, anchors, views: VIEWS, count: COUNT };
}
