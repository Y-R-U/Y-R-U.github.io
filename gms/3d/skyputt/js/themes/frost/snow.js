// Frost Fair theme — gentle falling snow: one draw call of camera-facing quads that live in a box which
// wraps around the camera (so it snows wherever the camera goes). Flakes fade near the camera (never a
// blob over the ball) and toward the box edges.
import * as THREE from 'three';
import { rng } from './util.js';

export function buildSnow(count, box, flakeTex, fog) {
  const r = rng(77);
  const n = count;
  const pos = new Float32Array(n * 12), corner = new Float32Array(n * 8), ex = new Float32Array(n * 12);
  const idx = new (n * 4 > 65535 ? Uint32Array : Uint16Array)(n * 6);
  const C = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
  for (let i = 0; i < n; i++) {
    const p = [r() * box, r() * box, r() * box];
    const size = 0.018 + r() * r() * 0.035, speed = 0.35 + r() * 0.35, ph = r() * 100;
    for (let k = 0; k < 4; k++) {
      const v = i * 4 + k;
      pos.set(p, v * 3); corner.set(C[k], v * 2); ex.set([size, speed, ph], v * 3);
    }
    idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aCorner', new THREE.BufferAttribute(corner, 2));
  g.setAttribute('aEx', new THREE.BufferAttribute(ex, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      map: { value: flakeTex }, uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uBox: { value: box },
      fogColor: { value: fog ? fog.color : new THREE.Color(0xffffff) }, fogNear: { value: fog ? fog.near : 1e6 }, fogFar: { value: fog ? fog.far : 2e6 },
    },
    vertexShader: /* glsl */`
      attribute vec2 aCorner; attribute vec3 aEx;
      uniform float uTime, uBox, fogNear, fogFar; uniform vec3 uCam;
      varying vec2 vUv; varying float vA;
      void main(){
        float t = uTime;
        vec3 drift = vec3(sin(t * 0.6 + aEx.z) * 0.25 + t * 0.12, -t * aEx.y, cos(t * 0.5 + aEx.z * 1.3) * 0.25);
        // wrap into a box centred on the camera
        vec3 rel = mod(position + drift - uCam + 0.5 * uBox, uBox) - 0.5 * uBox;
        vec3 w = uCam + rel;
        vec4 mv = modelViewMatrix * vec4(w, 1.0);
        float d = length(rel);
        float a = smoothstep(0.5, 1.4, d) * (1.0 - smoothstep(uBox * 0.32, uBox * 0.5, d));
        a *= 1.0 - smoothstep(fogNear, fogFar, -mv.z);
        mv.xy += aCorner * aEx.x * 2.0;
        gl_Position = projectionMatrix * mv;
        vUv = aCorner + 0.5;
        vA = a;
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D map; varying vec2 vUv; varying float vA;
      void main(){
        float m = texture2D(map, vUv).a;
        float a = m * vA * 0.9;
        if (a < 0.01) discard;
        gl_FragColor = vec4(vec3(0.94, 0.97, 1.0), a);
      }`,
    transparent: true, depthWrite: false, fog: false,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false; mesh.renderOrder = 6; mesh.name = 'frost.snowfall';
  return {
    mesh,
    update(t, camera) {
      mat.uniforms.uTime.value = t;
      if (camera) mat.uniforms.uCam.value.copy(camera.position);
    },
    dispose() { g.dispose(); mat.dispose(); },
  };
}
