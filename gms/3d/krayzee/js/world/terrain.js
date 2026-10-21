import * as THREE from 'three';
import { fbm } from './util.js';
import { farmTexture, maskTexture, grassTexture } from './textures.js';
import { RUNWAYS, headingToVec } from './layout.js';

export const EXTENT = 14000;
export const MAP_EXTENT = 4200;
const FARM_TILE = 3100;
export const FLAT_R = 3800;
export const LAKE = { x: -1500, z: -1250, rx: 340, rz: 210 };

function hillHeight(x, z) {
  const d = Math.hypot(x, z);
  if (d <= FLAT_R) return 0;
  const k = Math.min(1, (d - FLAT_R) / 3500);
  const ramp = k * k * (3 - 2 * k);
  const n = fbm(x / 2600 + 11, z / 2600 - 3, 4);
  const ridge = 1 - Math.abs(fbm(x / 5200 - 7, z / 5200 + 2, 3) * 2 - 1);
  return ramp * (40 + n * 220 + ridge * 160);
}

export function airfieldMask(x, z) {
  const ex = Math.max(Math.abs(x) - 820, 0), ez = Math.max(Math.abs(z + 5) - 455, 0);
  const d = Math.hypot(ex, ez) - 40;
  return 1 - Math.min(1, Math.max(0, d / 10));
}

export function stripMask(x, z) {
  let best = 0;
  for (const rw of RUNWAYS) {
    const [dx, dz] = headingToVec(rw.heading);
    const rx = x - rw.center[0], rz = z - rw.center[2];
    const a = Math.abs(rx * dx + rz * dz) - rw.length / 2 - 60;
    const b = Math.abs(-rx * dz + rz * dx) - (rw.width >= 30 ? 75 : 40);
    best = Math.max(best, 1 - Math.min(1, Math.max(a, b, 0) / 6));
  }
  return best;
}

export function createTerrain(renderer, quality) {
  const N = quality === 'low' ? 96 : 160;
  const xs = new Float32Array(N + 1);
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * 2 - 1;
    xs[i] = Math.sign(t) * Math.pow(Math.abs(t), 1.6) * EXTENT;
  }
  const H = new Float32Array((N + 1) * (N + 1));
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
    const x = xs[i], z = xs[j];
    const y = hillHeight(x, z);
    H[j * (N + 1) + i] = y;
    pos.push(x, y, z);
    uv.push(x / FARM_TILE + 0.37, z / FARM_TILE + 0.11);
  }
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const a = j * (N + 1) + i, b = a + 1, c = a + N + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();

  const farm = farmTexture(renderer, quality === 'low' ? 1024 : 2048);
  const mask = maskTexture(renderer, MAP_EXTENT, airfieldMask, LAKE, stripMask, quality === 'low' ? 512 : 1024);
  const detail = grassTexture(renderer);
  const m = new THREE.MeshLambertMaterial({ map: farm });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uDetail = { value: detail };
    sh.uniforms.uMask = { value: mask };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vWXZ;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWXZ = (modelMatrix * vec4(transformed, 1.0)).xz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uDetail, uMask;\nvarying vec2 vWXZ;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        vec2 w = vWXZ;
        vec4 mk = texture2D(uMask, (w + ${MAP_EXTENT.toFixed(1)}) / ${(2 * MAP_EXTENT).toFixed(1)});
        float d1 = texture2D(uDetail, w / 4.3).g, d2 = texture2D(uDetail, w / 31.0 + 0.3).g, d3 = texture2D(uDetail, w / 233.0 + 0.7).g;
        vec3 grass = vec3(0.165, 0.225, 0.08) * (0.78 + 0.5 * d3);
        grass = mix(grass, vec3(0.21, 0.24, 0.10), smoothstep(0.55, 0.85, d2) * 0.5);
        float sx = w.x / 7.5;
        float stripeFade = clamp(1.0 - fwidth(sx) * 1.5, 0.0, 1.0);
        grass *= 1.0 + 0.045 * stripeFade * sign(sin(sx * 3.14159));
        grass = mix(grass, grass * vec3(1.16, 1.12, 1.05), mk.b);
        diffuseColor.rgb = mix(diffuseColor.rgb, grass, mk.r);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.12, 0.13, 0.07), mk.g * 0.6);
        diffuseColor.rgb *= (0.72 + 0.42 * d1) * (0.85 + 0.3 * d2);`);
  };
  const mesh = new THREE.Mesh(g, m);
  mesh.receiveShadow = true;
  mesh.renderOrder = -10;
  mesh.name = 'terrain';

  function heightAt(x, z) {
    if (x * x + z * z <= FLAT_R * FLAT_R * 0.95) return 0;
    if (Math.abs(x) >= EXTENT || Math.abs(z) >= EXTENT) return hillHeight(x, z);
    const fi = gridIndex(xs, x), fj = gridIndex(xs, z);
    const i = fi | 0, j = fj | 0;
    const u = fi - i, v = fj - j;
    const h00 = H[j * (N + 1) + i], h10 = H[j * (N + 1) + i + 1], h01 = H[(j + 1) * (N + 1) + i], h11 = H[(j + 1) * (N + 1) + i + 1];
    // Triangles (a,c,b) and (b,c,d): split along the b-c diagonal (u + v = 1).
    if (u + v <= 1) return h00 + (h10 - h00) * u + (h01 - h00) * v;
    return h11 + (h01 - h11) * (1 - u) + (h10 - h11) * (1 - v);
  }
  return { mesh, heightAt };
}

function gridIndex(xs, x) {
  let lo = 0, hi = xs.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (xs[m] <= x) lo = m; else hi = m; }
  return lo + (x - xs[lo]) / (xs[hi] - xs[lo]);
}

export function createLake() {
  const pts = [];
  const n = 48;
  const shape = new THREE.Shape();
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    const x = Math.cos(a) * LAKE.rx, y = Math.sin(a) * LAKE.rz;
    if (k === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
    pts.push([x, y]);
  }
  const g = new THREE.ShapeGeometry(shape, 1);
  g.rotateX(-Math.PI / 2);
  g.translate(LAKE.x, 0.15, LAKE.z);
  const m = new THREE.MeshStandardMaterial({ color: '#3d6f86', roughness: 0.08, metalness: 0.1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const mesh = new THREE.Mesh(g, m);
  mesh.receiveShadow = true;
  mesh.renderOrder = -9;
  mesh.name = 'lake';
  return mesh;
}

export function inLake(x, z) {
  return Math.hypot((x - LAKE.x) / LAKE.rx, (z - LAKE.z) / LAKE.rz) < 1;
}
