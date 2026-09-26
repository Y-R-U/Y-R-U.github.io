import * as THREE from 'three';
import { rng } from './textures.js';

// Wind sway on any foliage material (uses world height above its base).
export function swayFoliage(material, time, fade) {
  material.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = time;
    if (fade) addFade(sh, fade);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
{
  vec3 wp = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
  float k = smoothstep( 1.0, 6.0, color.b * 10.0 );
  transformed.x += sin( uTime * 1.3 + wp.x * 0.35 + wp.z * 0.2 ) * 0.08 * k;
  transformed.z += cos( uTime * 1.1 + wp.x * 0.25 ) * 0.06 * k;
}`);
  };
  material.customProgramCacheKey = () => 'sway';
  return material;
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const leafGeo = new THREE.IcosahedronGeometry(1, 1);
const trunkGeo = new THREE.CylinderGeometry(0.12, 0.2, 1, 7);
trunkGeo.translate(0, 0.5, 0);

// Adds one stylised broadleaf tree to the batcher at (x, y, z).
export function addTree(batch, M, x, y, z, seed = 1, scale = 1) {
  const R = rng(seed * 7919 + 13);
  const h = (3.4 + R() * 1.8) * scale;
  _m.compose(_p.set(x, y, z), _q.identity(), _s.set(scale * 1.1, h, scale * 1.1));
  batch.add(trunkGeo, M.bark, { matrix: _m });
  const blobs = 11 + (R() * 5 | 0);
  const hueShift = R();
  for (let i = 0; i < blobs; i++) {
    const a = R() * Math.PI * 2, rr = Math.sqrt(R()) * 1.7 * scale;
    const by = h - 0.1 + (R() - 0.35) * 1.5 * scale + (1.7 * scale - rr) * 0.35;
    const s = (0.55 + R() * 0.5) * scale;
    _m.compose(_p.set(x + Math.cos(a) * rr, y + by, z + Math.sin(a) * rr), _q.setFromEuler(new THREE.Euler(R() * 3, R() * 3, 0)), _s.set(s * 1.2, s * 0.85, s * 1.2));
    const light = (0.55 + R() * 0.5) * (0.75 + 0.35 * (by / h));
    // blue channel carries height-above-base / 10 for the sway weight
    const c = new THREE.Color(0.5 * light + hueShift * 0.12, 0.72 * light, Math.min(1, (by + s) / 10));
    batch.add(leafGeo, M.foliage, { matrix: _m, color: c });
  }
}

// Low shrubs for planters.
export function addShrubs(batch, M, x, y, z, len, wid, rot, seed = 1, count = 8) {
  const R = rng(seed * 104729 + 7);
  const c = Math.cos(rot), s = Math.sin(rot);
  for (let i = 0; i < count; i++) {
    const lx = (R() - 0.5) * len * 0.9, lz = (R() - 0.5) * wid * 0.6;
    const px = x + lx * c + lz * s, pz = z - lx * s + lz * c;
    const sc = 0.35 + R() * 0.35;
    _m.compose(_p.set(px, y + sc * 0.4, pz), _q.setFromEuler(new THREE.Euler(R(), R() * 3, 0)), _s.set(sc * 1.3, sc, sc * 1.3));
    const flower = R() < 0.25;
    const col = flower ? new THREE.Color(1.3, 0.85 + R() * 0.3, 0.55) : new THREE.Color(0.5 + R() * 0.2, 0.8 + R() * 0.2, 0.05);
    batch.add(leafGeo, M.foliage, { matrix: _m, color: col });
  }
}

// Dithered see-through for occluders standing between the camera and the player.
export function addFade(sh, fade) {
  Object.assign(sh.uniforms, fade);
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
uniform vec2 uFadeC; uniform float uFadeR, uFadeZ;`).replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
#ifdef USE_FOG
{
  float fd = length(gl_FragCoord.xy - uFadeC);
  if (vFogDepth < uFadeZ - 1.5 && fd < uFadeR) {
    float amt = 1.0 - smoothstep(uFadeR * 0.55, uFadeR, fd);
    float h = fract(sin(dot(floor(gl_FragCoord.xy), vec2(12.9898, 78.233))) * 43758.5453);
    if (h < amt * 0.8) discard;
  }
}
#endif`);
}
export function fadeMaterial(material, fade) {
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (sh, r) => { prev?.call(material, sh, r); addFade(sh, fade); };
  const k = material.customProgramCacheKey?.call(material) || '';
  material.customProgramCacheKey = () => k + 'fade';
}
