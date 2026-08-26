// The narrow-FOV side-on camera (CONTRACTS §14, D13).
//
// The frustum is fitted so the visible height at z = 0 is EXACTLY CAM.vh = 900 world units.
// Everything in the game — prop scale, HUD gaps, the top band — is designed against those 900,
// so this fit is load-bearing: D = (vh/2) / tan(fov/2).
//
// The camera is never rotated. That keeps sim x/y == mesh x/y (§14 rule 3), makes the curve
// shader in materials.js exact, and makes world->screen a pure scale.

import * as THREE from 'three';

export const VH = 900;
export const FOV = 20;

export function makeCamera() {
  const cam = new THREE.PerspectiveCamera(FOV, 2, 40, 12000);
  const D = (VH / 2) / Math.tan((FOV * Math.PI / 180) / 2);
  cam.position.set(0, 0, D);
  cam.lookAt(0, 0, 0);
  cam.rotation.set(0, 0, 0);

  const api = {
    cam, D, vh: VH, vw: 1600, W: 1, H: 1,
    scale: 1,          // css px per world unit
    curveK: 0,         // world units of drop per (world x)^2, see materials.js

    resize(W, H) {
      api.W = W; api.H = H;
      cam.aspect = W / H;
      cam.updateProjectionMatrix();
      api.vw = VH * (W / H);
      api.scale = H / VH;
      // ART.md §1: the horizon drops ~5% of screen height at the screen edges.
      const halfW = api.vw / 2;
      api.curveK = (VH * 0.048) / (halfW * halfW);
    },

    /** wc is world.cam: x/y are the viewport's LEFT and BOTTOM edges (CONTRACTS §2). */
    apply(wc, shakeX = 0, shakeY = 0) {
      const cx = (wc?.x ?? 0) + api.vw / 2 + shakeX;
      const cy = (wc?.y ?? -170) + VH / 2 + shakeY;
      cam.position.set(cx, cy, api.D);
      cam.updateMatrixWorld();
      return { cx, cy };
    },

    /** World -> CSS px, for the HUD overlay. Includes the horizon curve. */
    project(wx, wy, wz = 0) {
      const dx = wx - cam.position.x;
      const n = api.D / Math.max(120, api.D - wz);
      const cy = wy - api.curveK * n * dx * dx;
      return {
        x: (wx - (cam.position.x - api.vw / 2)) * api.scale,
        y: (cam.position.y + VH / 2 - cy) * api.scale,
      };
    },

    /** CSS px -> world, the inverse of project at z = 0. */
    unproject(sx, sy) {
      const wx = cam.position.x - api.vw / 2 + sx / api.scale;
      const dx = wx - cam.position.x;
      const wy = cam.position.y + VH / 2 - sy / api.scale + api.curveK * dx * dx;
      return { x: wx, y: wy };
    },
  };
  api.resize(844, 390);
  return api;
}
