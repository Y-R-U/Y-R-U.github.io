// Candy Land theme — a light drift of rainbow sprinkles: one draw call of small coloured rods that tumble
// slowly down inside a box which wraps around the camera. They fade near the camera (never a blob over
// the ball), toward the box edges and with fog.
import * as THREE from 'three';
import { rng } from './util.js';

const COLS = [[1, 0.36, 0.6], [1, 0.82, 0.25], [0.3, 0.79, 0.94], [0.48, 0.9, 0.51], [0.7, 0.53, 1], [1, 1, 1]];

export function buildSprinkles(count, box, fog) {
  const r = rng(177);
  const n = count;
  const pos = new Float32Array(n * 12), corner = new Float32Array(n * 8), ex = new Float32Array(n * 16);
  const idx = new (n * 4 > 65535 ? Uint32Array : Uint16Array)(n * 6);
  const C = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
  for (let i = 0; i < n; i++) {
    const p = [r() * box, r() * box, r() * box];
    const size = 0.014 + r() * 0.01, speed = 0.12 + r() * 0.18, ph = r() * 100, ci = (r() * COLS.length) | 0;
    for (let k = 0; k < 4; k++) {
      const v = i * 4 + k;
      pos.set(p, v * 3); corner.set(C[k], v * 2); ex.set([size, speed, ph, ci], v * 4);
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
      uCols: { value: COLS.map(c => new THREE.Vector3(...c)) },
      fogNear: { value: fog ? fog.near : 1e6 }, fogFar: { value: fog ? fog.far : 2e6 },
    },
    vertexShader: /* glsl */`
      attribute vec2 aCorner; attribute vec4 aEx;
      uniform float uTime, uBox, fogNear, fogFar; uniform vec3 uCam; uniform vec3 uCols[6];
      varying vec2 vUv; varying float vA; varying vec3 vCol;
      void main(){
        float t = uTime;
        vec3 drift = vec3(sin(t * 0.4 + aEx.z) * 0.3 + t * 0.05, -t * aEx.y, cos(t * 0.33 + aEx.z * 1.3) * 0.3);
        vec3 rel = mod(position + drift - uCam + 0.5 * uBox, uBox) - 0.5 * uBox;
        vec3 w = uCam + rel;
        vec4 mv = modelViewMatrix * vec4(w, 1.0);
        float d = length(rel);
        float a = smoothstep(1.2, 2.6, d) * (1.0 - smoothstep(uBox * 0.32, uBox * 0.5, d));
        a *= 1.0 - smoothstep(fogNear, fogFar, -mv.z);
        // a tumbling rod: rotate the quad in screen space and squash it to 1:3.5
        float ang = t * (0.8 + fract(aEx.z) * 1.6) + aEx.z * 7.0;
        vec2 c = aCorner * vec2(1.0, 0.3);
        c = vec2(c.x * cos(ang) - c.y * sin(ang), c.x * sin(ang) + c.y * cos(ang));
        mv.xy += c * aEx.x * 2.0;
        gl_Position = projectionMatrix * mv;
        vUv = aCorner + 0.5;
        vA = a;
        int ci = int(aEx.w + 0.5);
        vCol = ci == 0 ? uCols[0] : ci == 1 ? uCols[1] : ci == 2 ? uCols[2] : ci == 3 ? uCols[3] : ci == 4 ? uCols[4] : uCols[5];
      }`,
    fragmentShader: /* glsl */`
      varying vec2 vUv; varying float vA; varying vec3 vCol;
      void main(){
        vec2 q = (vUv - 0.5) * vec2(2.0, 2.0);
        float e = 1.0 - smoothstep(0.75, 1.0, length(vec2(max(abs(q.x) - 0.7, 0.0) / 0.3, q.y)));
        float a = e * vA * 0.95;
        if (a < 0.02) discard;
        gl_FragColor = vec4(vCol * (0.85 + 0.15 * (1.0 - abs(q.y))), a);
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, fog: false,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false; mesh.renderOrder = 6; mesh.name = 'candy.sprinkles';
  return {
    mesh,
    update(t, camera) {
      mat.uniforms.uTime.value = t;
      if (camera) mat.uniforms.uCam.value.copy(camera.position);
    },
    dispose() { g.dispose(); mat.dispose(); },
  };
}
