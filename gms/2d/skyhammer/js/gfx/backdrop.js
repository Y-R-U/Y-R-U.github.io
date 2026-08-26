// The distant skyline: mountain and hill plates on curved, tiled quads at real negative z.
// These are a GFX parallax layer, never gameplay terrain (D21) — the heightfield is short now.
// Fog does the aerial perspective on top of the haze already baked into the plate.

import * as THREE from 'three';
import { getPlate } from './plates.js';
import { makeTex, makeBin, patchCurve } from './materials.js';
import { makeLayer } from './layer.js';

const BANDS = [
  { key: 'mountains', p: 0.14, z: -3600, tileScreen: 3080, aspect: 1600 / 400, baseY: -231, order: -820 },
  { key: 'hills',     p: 0.35, z: -1500, tileScreen: 3256, aspect: 1600 / 260, baseY: -259, order: -810 },
];

export function makeBackdrop(camApi) {
  const bin = makeBin();
  const root = new THREE.Group();
  const geo = new THREE.PlaneGeometry(1, 1, 40, 1);

  const bands = BANDS.map((b) => {
    const layer = makeLayer(camApi, b.z, b.p);
    const mat = patchCurve(new THREE.MeshBasicMaterial({
      // fog OFF: one scene fog colour is tuned to the HORIZON, and applying it to bands that rise
      // well above the horizon turned every distant mountain warm (the "orange sand dunes" defect).
      // The per-band haze baked with band.hazeFar gives the same aerial perspective, per band.
      transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide,
    }));
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = b.order;
    layer.group.add(mesh);
    root.add(layer.group);
    return { b, layer, mesh, mat };
  });

  let pal = null;

  return {
    root,
    setPalette(p, key) {
      pal = p;
      bin.dispose();
      for (const bd of bands) {
        const tex = makeTex(getPlate(bd.b.key, p, key, p.biome), { wrapX: true, aniso: 4 });
        bd.mat.map = bin.keep(tex);
        bd.mat.needsUpdate = true;
      }
    },
    refit() { for (const bd of bands) bd.layer.refit(); },
    update(camX, camY) {
      if (!pal) return;
      for (const bd of bands) {
        const { b, layer, mesh, mat } = bd;
        layer.place(camX, camY);
        const inv = layer.inv;
        const wScreen = camApi.vw * 1.6;
        const hScreen = b.tileScreen / b.aspect;
        mesh.scale.set(wScreen * inv, hScreen * inv, 1);
        mesh.position.set(camX * b.p * inv, (b.baseY + hScreen / 2) * inv, 0);
        if (mat.map) {
          mat.map.repeat.x = wScreen / b.tileScreen;
          mat.map.offset.x = (camX * b.p) / b.tileScreen;
        }
      }
    },
    setVisible(v) { root.visible = v; },
    dispose() { bin.dispose(); geo.dispose(); for (const bd of bands) bd.mat.dispose(); },
  };
}
