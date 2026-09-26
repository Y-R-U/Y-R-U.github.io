import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { REFLECT_LAYER } from '../fx/reflection.js';

// The y=0 promenade: one mesh, one material. Zones (cream marble / dark slate) and gold inlays are
// chosen per-pixel from world position so the whole floor costs a single draw call.
export function createGround(ctx) {
  const { M, scene } = ctx;
  const parts = [];
  const plane = new THREE.PlaneGeometry(150, 148, 30, 30);
  plane.rotateX(-Math.PI / 2);
  plane.translate(-35, 0, -36);
  parts.push(plane);
  for (const [cz, r] of ctx.layout.balconies) {
    const c = new THREE.CircleGeometry(r, 32, 0, Math.PI);
    c.rotateX(-Math.PI / 2); c.rotateY(-Math.PI / 2);
    c.translate(40, 0, cz);
    parts.push(c);
  }
  const g = mergeGeometries(parts.map((p) => { const q = p.index ? p.toNonIndexed() : p; q.deleteAttribute('uv'); return q; }), false);
  const pos = g.attributes.position, uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) { uv[i * 2] = pos.getX(i) / 12; uv[i * 2 + 1] = -pos.getZ(i) / 12; }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));

  const mat = M.marble;
  const slate = M.stoneTex.slate;
  const prev = mat.onBeforeCompile;
  const u = { tSlate: { value: slate.map }, tSlateR: { value: slate.roughnessMap }, uTime: ctx.time };
  mat.onBeforeCompile = (sh, r) => {
    prev?.(sh, r);
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vGW;')
      .replace('#include <fog_vertex>', '#include <fog_vertex>\nvGW = ( modelMatrix * vec4( transformed, 1.0 ) ).xz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
uniform sampler2D tSlate, tSlateR;
varying vec2 vGW;
float gH(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float gN(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(gH(i), gH(i + vec2(1, 0)), f.x), mix(gH(i + vec2(0, 1)), gH(i + vec2(1, 1)), f.x), f.y); }
float gLine(float d, float w) { float aa = fwidth(d) * 1.2 + 1e-4; return 1.0 - smoothstep(w * 0.5, w * 0.5 + aa, abs(d)); }
float zoneSlate(vec2 p) {
  float r = length(p);
  float s = step(25.8, r) * step(r, 28.6);
  s = max(s, step(abs(p.x), 12.0) * step(p.y, -27.0));
  s = max(s, step(35.5, p.x));
  return s;
}
float inlay(vec2 p) {
  float r = length(p);
  float m = gLine(r - 8.6, 0.16) + gLine(r - 17.0, 0.12) + gLine(r - 25.8, 0.22) + gLine(r - 28.6, 0.12);
  float a = atan(p.y, p.x);
  float seg = 3.14159265 / 12.0;
  float am = mod(a + seg * 0.5, seg) - seg * 0.5;
  m += gLine(r * sin(am), 0.1) * step(8.6, r) * step(r, 17.0);
  float bz = step(p.y, -28.6);
  m += (gLine(abs(p.x) - 12.0, 0.2) + gLine(abs(p.x) - 12.6, 0.06)) * bz;
  m += gLine(p.x - 35.5, 0.2) * step(-80.0, p.y);
  return clamp(m, 0.0, 1.0);
}`)
      .replace('#include <map_fragment>', `#include <map_fragment>
float zS = zoneSlate(vGW);
float zI = inlay(vGW);
if (zS > 0.5) diffuseColor.rgb = texture2D(tSlate, vMapUv).rgb;
float gn = gN(vGW * 0.07) * 0.6 + gN(vGW * 0.23) * 0.4;
diffuseColor.rgb *= 0.9 + 0.16 * gn;
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.95, 0.66, 0.26), zI);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
if (zS > 0.5) roughnessFactor = texture2D(tSlateR, vMapUv).g;
roughnessFactor *= 0.7 + 0.8 * gN(vGW * 0.11 + 7.0);
roughnessFactor = mix(roughnessFactor, 0.32, zI);`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
metalnessFactor = mix(metalnessFactor, 1.0, zI);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
totalEmissiveRadiance += vec3(0.22, 0.13, 0.03) * zI;`);
  };
  const baseKey = mat.customProgramCacheKey?.() || '';
  mat.customProgramCacheKey = () => baseKey + 'ground';

  const mesh = new THREE.Mesh(g, mat);
  mesh.receiveShadow = true;
  mesh.name = 'ground';
  mesh.matrixAutoUpdate = false;
  scene.add(mesh);
  return mesh;
}
