// Arbitrary parallax at a real z.
//
// A layer at z = -Z is naturally scaled by n = D/(D+Z), which for our camera bottoms out around
// 0.30 — nowhere near ART.md §3's 0.06 far band. So the layer's own position is corrected each
// frame: put the group at camX*(1 - p/n) and pre-multiply every child coordinate by 1/n, and the
// layer moves at EXACTLY parallax p while still living at a true z (so fog and depth sorting
// still work on it). This is the whole reason the backgrounds can be both real 3D and on-model.

import * as THREE from 'three';

// REST is the camera CENTRE y at rest (CAM.baseY + vh/2). Without it, a parallax layer's design
// y is measured from the camera centre instead of from the world, so every background band sits
// hundreds of units too high and reads as enormous.
export const REST_Y = -100 + 450;

export function makeLayer(camApi, z, p, restY = REST_Y) {
  const group = new THREE.Group();
  group.position.z = z;
  const api = {
    group, z, p, inv: 1, n: 1,
    refit() {
      api.n = camApi.D / (camApi.D - z);
      api.inv = 1 / api.n;
    },
    place(camX, camY) {
      group.position.set(
        camX - api.inv * (camX * p),
        camY - api.inv * (restY + (camY - restY) * p),
        z,
      );
    },
  };
  api.refit();
  return api;
}
