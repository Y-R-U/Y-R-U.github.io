// Volcano Forge theme — ambient particles in a box that wraps around the camera (one draw call each):
// glowing embers that rise, wiggle and flicker out (additive), and pale ash flakes that drift down
// (alpha blended). Both fade near the camera (never a blob over the ball), toward the box edge and with fog.
import * as THREE from 'three';
import { rng } from './util.js';

function particles(count, box, fog, kind, seed) {
  const r = rng(seed);
  const n = count;
  const pos = new Float32Array(n * 12), corner = new Float32Array(n * 8), ex = new Float32Array(n * 16);
  const idx = new (n * 4 > 65535 ? Uint32Array : Uint16Array)(n * 6);
  const C = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
  for (let i = 0; i < n; i++) {
    const p = [r() * box, r() * box, r() * box];
    const size = kind === 'ember' ? 0.018 + r() * 0.022 : 0.016 + r() * 0.02;
    const speed = kind === 'ember' ? 0.25 + r() * 0.4 : 0.1 + r() * 0.14;
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
  const ember = kind === 'ember';
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
        #if EMBER
          vec3 drift = vec3(sin(t * 0.9 + aEx.z) * 0.35 + t * 0.06, t * aEx.y, cos(t * 0.7 + aEx.z * 1.3) * 0.35);
        #else
          vec3 drift = vec3(sin(t * 0.3 + aEx.z) * 0.5 + t * 0.08, -t * aEx.y, cos(t * 0.23 + aEx.z * 1.3) * 0.5);
        #endif
        vec3 rel = mod(position + drift - uCam + 0.5 * uBox, uBox) - 0.5 * uBox;
        vec3 w = uCam + rel;
        vec4 mv = modelViewMatrix * vec4(w, 1.0);
        float d = length(rel);
        float a = smoothstep(1.2, 2.6, d) * (1.0 - smoothstep(uBox * 0.32, uBox * 0.5, d));
        vFog = smoothstep(fogNear, fogFar, -mv.z);
        #if EMBER
          // flicker and burn out: each ember lives along its rise, brightness pulsing
          float life = fract(t * 0.13 + aEx.z * 0.37);
          a *= sin(life * 3.14159) * (0.6 + 0.4 * sin(t * 13.0 + aEx.z * 50.0));
          a *= 1.0 - vFog;
          vec2 c = aCorner;
          mv.xy += c * aEx.x * (1.0 + 0.6 * (1.0 - life));
        #else
          float ang = t * (0.5 + fract(aEx.z) * 1.0) + aEx.z * 7.0;
          vec2 c = aCorner * vec2(1.0, 0.6);
          c = vec2(c.x * cos(ang) - c.y * sin(ang), c.x * sin(ang) + c.y * cos(ang));
          mv.xy += c * aEx.x * 1.6;
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
        #if EMBER
          float e = clamp(1.0 - r2, 0.0, 1.0);
          e = e * e;
          vec3 col = mix(vec3(1.0, 0.32, 0.05), vec3(1.0, 0.75, 0.3), vHue) * (0.6 + 0.8 * e);
          float a = e * vA;
          if (a < 0.01) discard;
          gl_FragColor = vec4(col, a);
        #else
          float e = 1.0 - smoothstep(0.55, 1.0, r2);
          vec3 col = mix(vec3(0.62, 0.6, 0.58), vec3(0.8, 0.78, 0.74), vHue);
          col = mix(col, fogColor, vFog * 0.8);
          float a = e * vA * 0.6;
          if (a < 0.02) discard;
          gl_FragColor = vec4(col, a);
        #endif
        #include <colorspace_fragment>
      }`,
    defines: { EMBER: ember ? 1 : 0 },
    transparent: true, depthWrite: false, fog: false,
    blending: ember ? THREE.AdditiveBlending : THREE.NormalBlending,
    toneMapped: !ember,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false; mesh.renderOrder = 6; mesh.name = 'volcano.' + (ember ? 'embers' : 'ash');
  return { mesh, mat, g };
}

/** Returns { group, update(t, camera), dispose }. */
export function buildEmbers(nEmber, nAsh, box, fog) {
  const group = new THREE.Group(); group.name = 'volcano.particles';
  const parts = [particles(nEmber, box, fog, 'ember', 177), particles(nAsh, box, fog, 'ash', 211)];
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
