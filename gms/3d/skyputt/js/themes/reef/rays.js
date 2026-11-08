// Sunken Reef theme — god-rays: long soft shafts of sunlight slanting down through the water from the
// surface, each a quad that turns about its own axis to face the camera (one additive draw call). They
// flicker slowly as the surface ripples, fade toward the bottom, near the camera and in the fog.
// Mobile GPU rule: the side vector is length-guarded (falls back to a fixed axis), no pow() of negatives.
import * as THREE from 'three';

/**
 * shafts: [{ p: Vector3 (top), len, w, a, phase }], dir: unit Vector3 pointing DOWN the shafts.
 * Returns { mesh, dispose }.
 */
export function buildRays(shafts, dir, fog, uniforms) {
  const n = shafts.length;
  const pos = new Float32Array(n * 12), cor = new Float32Array(n * 8), ex = new Float32Array(n * 16);
  const idx = new (n * 4 > 65535 ? Uint32Array : Uint16Array)(n * 6);
  const C = [[-0.5, 0], [0.5, 0], [0.5, 1], [-0.5, 1]];
  shafts.forEach((s, i) => {
    for (let k = 0; k < 4; k++) {
      const v = i * 4 + k;
      pos.set([s.p.x, s.p.y, s.p.z], v * 3); cor.set(C[k], v * 2); ex.set([s.len, s.w, s.a, s.phase], v * 4);
    }
    idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aCorner', new THREE.BufferAttribute(cor, 2));
  g.setAttribute('aEx', new THREE.BufferAttribute(ex, 4));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: uniforms.uTime, uDir: { value: dir.clone().normalize() },
      fogNear: { value: fog ? fog.near : 1e6 }, fogFar: { value: fog ? fog.far : 2e6 },
    },
    vertexShader: /* glsl */`
      attribute vec2 aCorner; attribute vec4 aEx;
      uniform float uTime, fogNear, fogFar; uniform vec3 uDir;
      varying vec2 vUv; varying float vA;
      void main(){
        vec3 top = position;
        vec3 mid = top + uDir * aEx.x * 0.5;
        vec3 toCam = cameraPosition - mid;
        vec3 side = cross(uDir, toCam);
        float sl = length(side);
        side = sl > 1e-4 ? side / sl : vec3(1.0, 0.0, 0.0);
        float v = aCorner.y;
        // shafts widen a little as they fall and sway with the surface
        float sway = sin(uTime * 0.21 + aEx.w * 9.0) * 0.25;
        vec3 w = top + uDir * aEx.x * v + side * (aCorner.x * aEx.y * (1.0 + v * 0.6) + sway * v);
        vec4 mv = viewMatrix * vec4(w, 1.0);
        gl_Position = projectionMatrix * mv;
        vUv = vec2(aCorner.x + 0.5, v);
        float d = length(cameraPosition - w);
        float fl = 0.6 + 0.4 * sin(uTime * (0.35 + fract(aEx.w * 3.1) * 0.3) + aEx.w * 20.0);
        vA = aEx.z * fl * smoothstep(2.5, 7.0, d) * (1.0 - smoothstep(fogNear, fogFar, -mv.z));
      }`,
    fragmentShader: /* glsl */`
      varying vec2 vUv; varying float vA;
      void main(){
        float across = 1.0 - abs(vUv.x - 0.5) * 2.0;
        float edge = across * across * (3.0 - 2.0 * across);
        float along = smoothstep(0.0, 0.12, vUv.y) * (1.0 - smoothstep(0.35, 1.0, vUv.y));
        float a = edge * along * vA;
        if (a < 0.003) discard;
        gl_FragColor = vec4(vec3(0.7, 1.0, 0.92) * a, a);
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, fog: false, toneMapped: false,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false; mesh.renderOrder = 3; mesh.name = 'reef.godRays';
  mesh.raycast = () => {};
  return { mesh, dispose() { g.dispose(); mat.dispose(); } };
}
