import * as THREE from 'three';

// Scheduled rain (P4): streaks in a box that follows the camera, wrapped in the vertex shader. One draw call;
// hidden entirely when uAmount is 0.
export function createRain(time, { count = 1800, box = [40, 22, 40] } = {}) {
  const pos = new Float32Array(count * 6), seed = new Float32Array(count * 2 * 3);
  for (let i = 0; i < count; i++) {
    const x = Math.random(), y = Math.random(), z = Math.random();
    for (let k = 0; k < 2; k++) {
      const o = (i * 2 + k) * 3;
      pos[o] = x; pos[o + 1] = y; pos[o + 2] = z;
      seed[o] = k; seed[o + 1] = 0.8 + Math.random() * 0.4; seed[o + 2] = Math.random();
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('seed', new THREE.BufferAttribute(seed, 3));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: time, uAmount: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uBox: { value: new THREE.Vector3(...box) }, uWind: { value: new THREE.Vector2(0.9, 0.3) } },
    vertexShader: /* glsl */`uniform float uTime, uAmount; uniform vec3 uCenter, uBox; uniform vec2 uWind; attribute vec3 seed; varying float vA;
      void main(){
        vec3 p = position;
        p.y = fract(p.y - uTime * 0.9 * seed.y);
        vec3 w = (p - 0.5) * uBox;
        vec3 base = floor(uCenter / uBox) * uBox;
        vec3 q = w + uCenter + vec3(uWind.x, 0.0, uWind.y) * (p.y - 0.5) * 2.0;
        q.xz = mod(q.xz - uCenter.xz + uBox.xz * 0.5, uBox.xz) + uCenter.xz - uBox.xz * 0.5;
        q.y = uCenter.y + (p.y - 0.35) * uBox.y;
        q += vec3(uWind.x, -1.0, uWind.y) * 0.9 * seed.x;           // the streak's lower end
        vA = uAmount * (0.35 + 0.65 * seed.z) * step(seed.z, uAmount * 1.2 + 0.1);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(q, 1.0);
      }`,
    fragmentShader: /* glsl */`varying float vA; void main(){ gl_FragColor = vec4(vec3(0.72, 0.78, 0.86) * vA * 0.5, vA * 0.5); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.LineSegments(g, mat);
  mesh.frustumCulled = false; mesh.visible = false; mesh.renderOrder = 5; mesh.name = 'rain';
  return {
    mesh,
    set(amount, center) { mat.uniforms.uAmount.value = amount; mesh.visible = amount > 0.01; if (center) mat.uniforms.uCenter.value.copy(center); },
  };
}
