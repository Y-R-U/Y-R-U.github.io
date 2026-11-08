// Sunken Reef theme — schools of small fish: one InstancedMesh (one draw call) for every school. Each
// fish swims an oval round its school's centre, bobbing and wiggling its tail; everything is computed in
// the vertex shader from per-instance attributes, so the CPU only sets uTime.
// Mobile GPU rule: atan() never gets (0, 0) (the oval radius is clamped > 0), no normalize of a zero vector.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng } from './util.js';

/** A fish about 1 unit long, nose toward +z, flattened sideways; tail fin at z < -0.3. */
function fishGeometry() {
  const body = new THREE.SphereGeometry(0.5, 5, 3);   // 9-50 cm fish: 24 tris each with the fins
  body.scale(0.32, 0.6, 1.0);
  const p = body.attributes.position;
  for (let i = 0; i < p.count; i++) { const z = p.getZ(i); if (z < 0) { p.setX(i, p.getX(i) * (1 + z * 0.9)); p.setY(i, p.getY(i) * (1 + z * 0.6)); } }
  const tail = new THREE.BufferGeometry();
  tail.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.42, 0, 0.26, -0.72, 0, -0.26, -0.72, 0, 0, -0.42, 0, -0.26, -0.72, 0, 0.26, -0.72], 3));
  const dorsal = new THREE.BufferGeometry();
  dorsal.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.26, 0.15, 0, 0.42, -0.1, 0, 0.24, -0.25, 0, 0.26, 0.15, 0, 0.24, -0.25, 0, 0.42, -0.1], 3));
  const parts = [body.toNonIndexed(), tail, dorsal];
  body.dispose();
  for (const g of parts) { for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k); g.computeVertexNormals(); }
  const g = mergeGeometries(parts, false);
  parts.forEach(x => x.dispose());
  return g;
}

const FISH_GLSL = /* glsl */`
  attribute vec4 aSchool;   // centre xyz, radius
  attribute vec4 aFish;     // phase, angular speed (signed), height offset, size
  uniform float uTime;
  float fishYaw(out vec3 fpos) {
    float a = aFish.x + uTime * aFish.y;
    float rad = max(0.2, aSchool.w * (0.75 + 0.25 * sin(aFish.x * 3.7)) + sin(a * 3.0 + aFish.x) * 0.08 * aSchool.w);
    fpos = aSchool.xyz + vec3(cos(a) * rad, aFish.z + sin(a * 2.0 + aFish.x * 5.0) * 0.12 * aSchool.w, sin(a) * rad * 0.65);
    float dir = aFish.y < 0.0 ? -1.0 : 1.0;
    float tx = -sin(a) * rad * dir, tz = cos(a) * rad * 0.65 * dir;
    return atan(tx, abs(tz) < 1e-4 ? 1e-4 : tz);
  }
  vec3 yawRot(vec3 v, float y) { float c = cos(y), s = sin(y); return vec3(v.x * c + v.z * s, v.y, -v.x * s + v.z * c); }
`;

/**
 * schools: [{ c: Vector3, R, n, size, speed, colors: [hex...] }]. Returns { mesh, dispose }.
 */
export function buildFish(schools, fog, seed = 5) {
  const r = rng(seed);
  const total = schools.reduce((a, s) => a + s.n, 0);
  const geo = fishGeometry();
  const sch = new Float32Array(total * 4), fish = new Float32Array(total * 4);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, metalness: 0.25, side: THREE.DoubleSide });
  const uTime = { value: 0 };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + FISH_GLSL)
      .replace('#include <beginnormal_vertex>', `
        vec3 fPos;
        float fYaw = fishYaw(fPos);
        vec3 objectNormal = yawRot(normal, fYaw);
        #ifdef USE_TANGENT
          vec3 objectTangent = vec3(tangent.xyz);
        #endif`)
      .replace('#include <begin_vertex>', `
        vec3 fl = position;
        float tailK = 1.0 - smoothstep(-0.6, 0.2, fl.z);
        fl.x += sin(uTime * 11.0 + aFish.x * 7.0 + fl.z * 5.0) * 0.14 * tailK;
        vec3 transformed = fPos + yawRot(fl * aFish.w, fYaw);`);
  };
  mat.customProgramCacheKey = () => 'reef-fish';
  const mesh = new THREE.InstancedMesh(geo, mat, total);
  const c = new THREE.Color();
  let k = 0;
  const I = new THREE.Matrix4();
  for (const s of schools) {
    const dir = r() < 0.5 ? -1 : 1;
    for (let i = 0; i < s.n; i++, k++) {
      sch.set([s.c.x, s.c.y, s.c.z, s.R], k * 4);
      // fish of a school bunch up in phase (a school, not a ring), with a little spread
      const ph = (i / s.n) * 1.4 + r() * 0.5;
      fish.set([ph, dir * s.speed * (0.9 + r() * 0.2) / Math.max(1, s.R), (r() - 0.5) * s.R * 0.35, s.size * (0.8 + r() * 0.4)], k * 4);
      mesh.setMatrixAt(k, I);
      mesh.setColorAt(k, c.set(s.colors[(i + (r() < 0.2 ? 1 : 0)) % s.colors.length]));
    }
  }
  geo.setAttribute('aSchool', new THREE.InstancedBufferAttribute(sch, 4));
  geo.setAttribute('aFish', new THREE.InstancedBufferAttribute(fish, 4));
  mesh.frustumCulled = false;
  mesh.castShadow = false; mesh.receiveShadow = false;
  mesh.name = 'reef.fish';
  mesh.raycast = () => {};
  return {
    mesh,
    update(t) { uTime.value = t; },
    dispose() { geo.dispose(); mat.dispose(); },
  };
}
