// Sunken Reef theme — ambient particles in a box that wraps around the camera (one draw call each):
// small bubbles that rise and wobble (a bright rim, alpha blended) and plankton specks / marine snow
// that drift slowly (a faint additive glow, some of them bioluminescent). Both fade near the camera
// (never a blob over the ball), toward the box edge and with fog.
import * as THREE from 'three';
import { rng } from './util.js';

function particles(count, box, fog, kind, seed) {
  const r = rng(seed);
  const n = count;
  const pos = new Float32Array(n * 12), corner = new Float32Array(n * 8), ex = new Float32Array(n * 16);
  const idx = new (n * 4 > 65535 ? Uint32Array : Uint16Array)(n * 6);
  const C = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
  const bubble = kind === 'bubble';
  for (let i = 0; i < n; i++) {
    const p = [r() * box, r() * box, r() * box];
    const size = bubble ? 0.012 + r() * 0.026 : 0.01 + r() * 0.016;
    const speed = bubble ? 0.25 + r() * 0.35 : 0.02 + r() * 0.05;
    const ph = r() * 100, hue = r();
    for (let k = 0; k < 4; k++) {
      const v = i * 4 + k;
      pos.set(p, v * 3); corner.set(C[k], v * 2); ex.set([size, speed, ph, hue], v * 4);
    }
    idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aCorner', new THREE.BufferAttribute(corner, 2));
  g.setAttribute('aEx', new THREE.BufferAttribute(ex, 4));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uBox: { value: box },
      fogNear: { value: fog ? fog.near : 1e6 }, fogFar: { value: fog ? fog.far : 2e6 },
      fogColor: { value: fog ? fog.color : new THREE.Color(0) },
    },
    vertexShader: /* glsl */`
      attribute vec2 aCorner; attribute vec4 aEx;
      uniform float uTime, uBox, fogNear, fogFar; uniform vec3 uCam;
      varying vec2 vUv; varying float vA; varying float vHue; varying float vFog;
      void main(){
        float t = uTime;
        #if BUBBLE
          vec3 drift = vec3(sin(t * 2.1 + aEx.z) * 0.06, t * aEx.y, cos(t * 1.7 + aEx.z * 1.3) * 0.06);
        #else
          vec3 drift = vec3(sin(t * 0.13 + aEx.z) * 0.6 + t * 0.05, sin(t * 0.09 + aEx.z * 2.0) * 0.3 - t * aEx.y, cos(t * 0.11 + aEx.z * 1.3) * 0.6);
        #endif
        vec3 rel = mod(position + drift - uCam + 0.5 * uBox, uBox) - 0.5 * uBox;
        vec3 w = uCam + rel;
        vec4 mv = modelViewMatrix * vec4(w, 1.0);
        float d = length(rel);
        float a = smoothstep(1.2, 2.6, d) * (1.0 - smoothstep(uBox * 0.32, uBox * 0.5, d));
        vFog = smoothstep(fogNear, fogFar, -mv.z);
        #if BUBBLE
          a *= 0.85;
          mv.xy += aCorner * aEx.x * 2.0;
        #else
          float tw = 0.55 + 0.45 * sin(t * (0.8 + aEx.w * 1.5) + aEx.z * 30.0);
          a *= tw * (1.0 - vFog);
          mv.xy += aCorner * aEx.x * 1.4;
        #endif
        gl_Position = projectionMatrix * mv;
        vUv = aCorner + 0.5;
        vA = a;
        vHue = aEx.w;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 fogColor;
      varying vec2 vUv; varying float vA; varying float vHue; varying float vFog;
      void main(){
        vec2 q = (vUv - 0.5) * 2.0;
        float r2 = dot(q, q);
        #if BUBBLE
          float rr = sqrt(r2);
          float rim = smoothstep(0.55, 0.8, rr) * (1.0 - smoothstep(0.82, 1.0, rr));
          float hl = 1.0 - smoothstep(0.0, 0.08, dot(q - vec2(-0.3, 0.3), q - vec2(-0.3, 0.3)));
          vec3 col = mix(vec3(0.75, 0.95, 1.0), fogColor, vFog * 0.8);
          float a = (rim * 0.75 + hl * 0.9 + 0.06 * (1.0 - smoothstep(0.8, 1.0, rr))) * vA;
          if (a < 0.02) discard;
          gl_FragColor = vec4(col, a);
        #else
          float e = clamp(1.0 - r2, 0.0, 1.0);
          e = e * e;
          // most specks are pale marine snow; one in five glows blue-green
          vec3 col = vHue > 0.8 ? vec3(0.3, 1.0, 0.85) * 1.4 : vec3(0.7, 0.85, 0.8) * 0.6;
          float a = e * vA;
          if (a < 0.01) discard;
          gl_FragColor = vec4(col * a, a);
        #endif
        #include <colorspace_fragment>
      }`,
    defines: { BUBBLE: bubble ? 1 : 0 },
    transparent: true, depthWrite: false, fog: false,
    blending: bubble ? THREE.NormalBlending : THREE.AdditiveBlending,
    toneMapped: bubble,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false; mesh.renderOrder = 6; mesh.name = 'reef.' + (bubble ? 'bubbles' : 'plankton');
  return { mesh, mat, g };
}

/** Returns { group, update(t, camera), dispose }. */
export function buildParticles(nBubble, nPlankton, box, fog) {
  const group = new THREE.Group(); group.name = 'reef.particles';
  const parts = [nBubble > 0 && particles(nBubble, box, fog, 'bubble', 177), particles(nPlankton, box * 1.3, fog, 'plankton', 211)].filter(Boolean);
  for (const p of parts) group.add(p.mesh);
  return {
    group,
    update(t, camera) {
      for (const p of parts) {
        p.mat.uniforms.uTime.value = t;
        if (camera) p.mat.uniforms.uCam.value.copy(camera.position);
      }
    },
    dispose() { for (const p of parts) { p.g.dispose(); p.mat.dispose(); } },
  };
}
