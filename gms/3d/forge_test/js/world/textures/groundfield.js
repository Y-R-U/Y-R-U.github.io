// A coarse terrain-height lookup the material shaders can sample, so every wall knows how far
// above its own ground a fragment is. That is what drives the contact skirt: a building on a
// slope has to darken along the line where it actually meets the hill, not at world y = 0.

import * as THREE from 'three';
import { heightAt } from '../terrain.js';
import { track } from '../../engine/budget.js';

const X0 = -160, X1 = 160, Z0 = -120, Z1 = 130;
const W = 256, H = 200;

let tex = null;

export function groundField() {
  if (tex) return { tex, grid: GRID };
  const data = new Uint16Array(W * H);
  for (let j = 0; j < H; j++) {
    const z = Z0 + (j + 0.5) / H * (Z1 - Z0);
    for (let i = 0; i < W; i++) {
      const x = X0 + (i + 0.5) / W * (X1 - X0);
      data[j * W + i] = THREE.DataUtils.toHalfFloat(heightAt(x, z));
    }
  }
  tex = new THREE.DataTexture(data, W, H, THREE.RedFormat, THREE.HalfFloatType);
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  track(tex, { w: W, h: H, fmt: 'rgb', mips: false, label: 'terrain:heightfield' });
  return { tex, grid: GRID };
}

// (originX, originZ, 1/spanX, 1/spanZ) — half a texel in from each edge so the bilinear tap
// lands on texel centres rather than smearing the border row across the world.
const GRID = new THREE.Vector4(
  X0 + (X1 - X0) / W * 0.5, Z0 + (Z1 - Z0) / H * 0.5,
  1 / ((X1 - X0) * (W - 1) / W), 1 / ((Z1 - Z0) * (H - 1) / H));
