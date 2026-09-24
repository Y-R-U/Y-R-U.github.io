import * as THREE from 'three';
import { SimplexNoise } from 'three/addons/math/SimplexNoise.js';

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));

export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
}

const simplex = new SimplexNoise({ random: rng(1337) });
export const noise2 = (x, y) => simplex.noise(x, y);
export const noise3 = (x, y, z) => simplex.noise3d(x, y, z);
export const fbm = (x, y) => noise2(x, y) * .6 + noise2(x * 2.1, y * 2.1) * .28 + noise2(x * 4.3, y * 4.3) * .12;

// Path centre line; the track runs along -Z and s is distance travelled.
export const pathX = (s) => 7 * Math.sin(s / 75) + 3 * Math.sin(s / 29 + 1.3);
export const pathDX = (s) => 7 / 75 * Math.cos(s / 75) + 3 / 29 * Math.cos(s / 29 + 1.3);

// Shared uniforms so every rim-lit material follows the current chapter's key light.
export const globalU = {
  uTime: { value: 0 },
  uRim: { value: new THREE.Color(0x8fb4ff) },
  uRimStr: { value: 0.6 },
};

export function rimify(mat, strength = 1) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uRim = globalU.uRim;
    sh.uniforms.uRimStr = globalU.uRimStr;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uRim; uniform float uRimStr;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float rimF = pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 2.6);
        totalEmissiveRadiance += uRim * rimF * uRimStr * ${strength.toFixed(2)};`);
  };
  mat.customProgramCacheKey = () => 'rim' + strength;
  return mat;
}

export function mat(color, opts = {}) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: opts.rough ?? 0.78, metalness: 0, ...opts.extra });
  if (opts.emissive) { m.emissive = new THREE.Color(opts.emissive); m.emissiveIntensity = opts.ei ?? 1; }
  if (opts.flat) m.flatShading = true;
  return opts.rim === false ? m : rimify(m, opts.rim ?? 1);
}

export function glowTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)', size = 128) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'); const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gr.addColorStop(0, inner); gr.addColorStop(0.25, inner.replace(/[\d.]+\)$/, '0.55)')); gr.addColorStop(1, outer);
  g.fillStyle = gr; g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function cloudTexture(size = 256, seed = 3) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'); const r = rng(seed);
  for (let i = 0; i < 26; i++) {
    const x = size * (0.25 + r() * 0.5), y = size * (0.35 + r() * 0.35), rad = size * (0.1 + r() * 0.2);
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));
