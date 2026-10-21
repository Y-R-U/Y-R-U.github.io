import * as THREE from 'three';

// Tyre marks: a ring buffer of flat quads on paved surfaces, faded in the shader (no per-frame CPU work).

const vert = /* glsl */`
attribute vec3 aMark; // birth time, alpha, across (0..1)
uniform float uTime, uFade;
varying float vA; varying float vX; varying float vAlong;
#include <fog_pars_vertex>
void main() {
  vec4 mvPosition = viewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  float age = uTime - aMark.x;
  vA = aMark.y * (1.0 - smoothstep(uFade * 0.25, uFade, age));
  vX = aMark.z;
  vAlong = position.x * 0.71 + position.z * 0.71;
  #include <fog_vertex>
}`;
const frag = /* glsl */`
varying float vA; varying float vX; varying float vAlong;
#include <fog_pars_fragment>
void main() {
  float edge = smoothstep(0.0, 0.25, vX) * smoothstep(1.0, 0.75, vX);
  float tread = 0.7 + 0.3 * sin(vX * 31.0) * sin(vAlong * 3.0 + vX * 5.0);
  float a = vA * edge * tread;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vec3(0.045, 0.04, 0.038), a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

export function createSkids(scene, maxQuads = 512) {
  const Q = maxQuads;
  const pos = new Float32Array(Q * 4 * 3), mark = new Float32Array(Q * 4 * 3);
  const index = new Uint16Array(Q * 6);
  for (let q = 0; q < Q; q++) {
    const v = q * 4, o = q * 6;
    index[o] = v; index[o + 1] = v + 1; index[o + 2] = v + 2; index[o + 3] = v + 1; index[o + 4] = v + 3; index[o + 5] = v + 2;
  }
  for (let i = 0; i < Q * 4; i++) mark[i * 3] = -1e9;
  const geo = new THREE.BufferGeometry();
  const pa = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
  const ma = new THREE.BufferAttribute(mark, 3).setUsage(THREE.DynamicDrawUsage);
  const pr = { start: 0, count: 0 }, mr = { start: 0, count: 0 };
  pa.updateRanges.push(pr); pa.clearUpdateRanges = () => pa;
  ma.updateRanges.push(mr); ma.clearUpdateRanges = () => ma;
  geo.setAttribute('position', pa);
  geo.setAttribute('aMark', ma);
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  geo.setDrawRange(0, 0);
  const mat = new THREE.ShaderMaterial({
    vertexShader: vert, fragmentShader: frag,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uFade: { value: 45 } }]),
    transparent: true, depthWrite: false, fog: true,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -4;
  mesh.name = 'fx-skids';
  mesh.visible = false;
  scene.add(mesh);

  let next = 0, used = 0, dMin = Q, dMax = -1;
  const lastBirth = new Float64Array([-1e9]);
  const S = { mesh, material: mat, cap: Q };

  // One quad from a to b ({x,y,z}); p = Float64Array [width, alpha, time].
  S.add = (a, b, p) => {
    const x0 = a.x, y0 = a.y, z0 = a.z, x1 = b.x, y1 = b.y, z1 = b.z, w = p[0], alpha = p[1], time = p[2];
    const dx = x1 - x0, dz = z1 - z0, L = Math.sqrt(dx * dx + dz * dz);
    if (L < 0.02) return;
    const nx = (-dz / L) * w * 0.5, nz = (dx / L) * w * 0.5;
    const q = next, v = q * 12;
    pos[v] = x0 - nx; pos[v + 1] = y0; pos[v + 2] = z0 - nz;
    pos[v + 3] = x0 + nx; pos[v + 4] = y0; pos[v + 5] = z0 + nz;
    pos[v + 6] = x1 - nx; pos[v + 7] = y1; pos[v + 8] = z1 - nz;
    pos[v + 9] = x1 + nx; pos[v + 10] = y1; pos[v + 11] = z1 + nz;
    for (let c = 0; c < 4; c++) { const m = v + c * 3; mark[m] = time; mark[m + 1] = alpha; mark[m + 2] = c & 1; }
    if (q < dMin) dMin = q;
    if (q > dMax) dMax = q;
    next = (next + 1) % Q;
    if (used < Q) used++;
    lastBirth[0] = time;
  };
  S.clear = () => { used = 0; next = 0; geo.setDrawRange(0, 0); };
  S.setFade = (s) => { mat.uniforms.uFade.value = s; };
  S.update = (T) => {
    const time = T[0];
    mat.uniforms.uTime.value = time;
    mesh.visible = used > 0 && time - lastBirth[0] < mat.uniforms.uFade.value;
    if (dMax >= dMin) {
      pr.start = dMin * 12; pr.count = (dMax - dMin + 1) * 12; pa.needsUpdate = true;
      mr.start = dMin * 12; mr.count = (dMax - dMin + 1) * 12; ma.needsUpdate = true;
      dMin = Q; dMax = -1;
    }
    geo.setDrawRange(0, used * 6);
  };
  S.dispose = () => { scene.remove(mesh); geo.dispose(); mat.dispose(); };
  return S;
}
