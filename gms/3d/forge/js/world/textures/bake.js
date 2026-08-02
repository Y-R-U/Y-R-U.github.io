// Turns a generator's height field + RGBA buffer into tracked three textures.
// Albedo alpha carries roughness so the shader gets it for free — one fetch, not two.

import * as THREE from 'three';
import { track, untrack } from '../../engine/budget.js';

const cfg = { texCap: 1024, aniso: 4 };
const cache = new Map();
let onRebuild = null;

export function configure(quality) {
  const next = { texCap: quality.get('texCap') ?? 1024, aniso: quality.get('aniso') ?? 4 };
  const capChanged = next.texCap !== cfg.texCap;
  Object.assign(cfg, next);
  for (const set of cache.values()) {
    for (const t of Object.values(set)) if (t?.isTexture) t.anisotropy = cfg.aniso;
  }
  if (capChanged && cache.size) { dropAll(); onRebuild?.(); }
}

export function onTexturesRebuilt(fn) { onRebuild = fn; }

export const texSize = want => Math.max(64, Math.min(want, cfg.texCap));

function canvas(S) {
  const c = document.createElement('canvas');
  c.width = c.height = S;
  return c;
}

function makeTex(cv, label, srgb) {
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = cfg.aniso;
  t.needsUpdate = true;
  return track(t, { w: cv.width, h: cv.height, fmt: 'rgba', mips: true, label });
}

function normalMap(height, S, strength) {
  const cv = canvas(S);
  const img = new ImageData(S, S);
  const p = img.data;
  for (let y = 0; y < S; y++) {
    const yUp = ((y - 1) + S) % S, yDn = (y + 1) % S;
    for (let x = 0; x < S; x++) {
      const xL = ((x - 1) + S) % S, xR = (x + 1) % S;
      const nx = (height[y * S + xL] - height[y * S + xR]) * strength;
      const ny = (height[yDn * S + x] - height[yUp * S + x]) * strength;
      const inv = 1 / Math.sqrt(nx * nx + ny * ny + 1);
      const i = (y * S + x) * 4;
      p[i] = (nx * inv * 0.5 + 0.5) * 255;
      p[i + 1] = (ny * inv * 0.5 + 0.5) * 255;
      p[i + 2] = (inv * 0.5 + 0.5) * 255;
      p[i + 3] = 255;
    }
  }
  cv.getContext('2d').putImageData(img, 0, 0);
  return cv;
}

// gen(S) -> { rgba: Uint8ClampedArray (a = roughness), height: Float32Array, strength }
export function surface(label, want, gen) {
  if (cache.has(label)) return cache.get(label);
  const S = texSize(want);
  const { rgba, height, strength = 1 } = gen(S);

  const albedo = canvas(S);
  albedo.getContext('2d').putImageData(new ImageData(rgba, S, S), 0, 0);

  const set = {
    map: makeTex(albedo, `${label}:albedo`, true),
    normalMap: makeTex(normalMap(height, S, strength * S / 512), `${label}:normal`, false),
    size: S,
  };
  cache.set(label, set);
  return set;
}

export function dropAll() {
  for (const set of cache.values()) {
    for (const t of Object.values(set)) {
      if (t?.isTexture) { untrack(t); t.dispose(); }
    }
  }
  cache.clear();
}
