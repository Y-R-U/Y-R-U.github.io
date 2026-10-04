import * as THREE from 'three';
import * as S from './shape.js?v=20261004h';
import { hatGeometry } from './crowd.js?v=20261004h';

// Cartoon bedsheet ghosts in cowboy hats (Ghost Town, DESIGN W12). One InstancedMesh, one transparent draw,
// ~1.6 k vertices each; the hem flutters and the body bobs in the vertex shader. Origin = the ground under it.
//   const g = kit.ghost({ count: 3 }); scene.add(g.mesh);
//   g.set(i, x, y, z, heading, s, { tint, alpha, hat }) · g.hide(i) · g.commit() · g.mesh
// hat: a kit.hats.TYPES name (default 'stetson') — baked per ghost mesh, so pass it to kit.ghost({ hat }).
let cache = new Map();
function ghostGeometry(hatType = 'stetson') {
  if (cache.has(hatType)) return cache.get(hatType);
  const pos = [], nor = [], col = [];
  const push = (g, rgba, lid = 0) => {
    const A = g.attributes;
    for (let i = 0; i < A.position.count; i++) {
      pos.push(A.position.getX(i), A.position.getY(i), A.position.getZ(i));
      nor.push(A.normal.getX(i), A.normal.getY(i), A.normal.getZ(i));
      col.push(rgba[0], rgba[1], rgba[2], rgba[3] + lid);
    }
  };
  const SHEET = [0.93, 0.98, 1, 0.8], DARK = [0.05, 0.06, 0.14, 0.96], HAT = [0.07, 0.055, 0.1, 0.985];
  const prof = [[0.0005, 1.62], [0.2, 1.6], [0.36, 1.5], [0.45, 1.3], [0.48, 1.0], [0.52, 0.6], [0.62, 0.25], [0.68, 0.06], [0.0005, 0.06]];
  let body = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 18);
  body = body.toNonIndexed();
  body.deleteAttribute('uv');
  const p = body.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (y < 0.3) p.setY(i, y + 0.05 * Math.sin(Math.atan2(z, x) * 6));
  }
  body.computeVertexNormals();
  S.smooth(body);
  push(body, SHEET);
  for (const sx of [-1, 1]) {
    const arm = S.smooth(S.blob(1, 1, { jitter: 0, rng: () => 0.5 }));
    arm.applyMatrix4(S.matrix({ pos: [sx * 0.56, 0.95, 0.08], scale: [0.12, 0.26, 0.12], rz: sx * 0.9 }));
    push(arm, SHEET);
    const eye = S.smooth(S.blob(1, 1, { jitter: 0, rng: () => 0.5 }));
    eye.applyMatrix4(S.matrix({ pos: [sx * 0.16, 1.27, 0.42], scale: [0.095, 0.15, 0.06] }));
    push(eye, DARK);
  }
  const mouth = S.smooth(S.blob(1, 1, { jitter: 0, rng: () => 0.5 }));
  mouth.applyMatrix4(S.matrix({ pos: [0, 1.02, 0.46], scale: [0.1, 0.13, 0.05] }));
  push(mouth, DARK);
  const hg = hatGeometry(hatType).clone();
  hg.applyMatrix4(S.matrix({ pos: [0, 1.5, -0.02], scale: 1.45, rx: -0.12, rz: 0.12 }));
  const A = hg.attributes;
  for (let i = 0; i < A.position.count; i++) {
    pos.push(A.position.getX(i), A.position.getY(i), A.position.getZ(i));
    nor.push(A.normal.getX(i), A.normal.getY(i), A.normal.getZ(i));
    const w = A.color.getX(i) > 0.9 ? 1 : 0.55;
    col.push(HAT[0] * w, HAT[1] * w, HAT[2] * w, HAT[3]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  g.computeBoundingSphere();
  cache.set(hatType, g);
  return g;
}

const VERT = `
uniform float uTime;
varying vec4 vCol;
varying vec3 vN;
varying vec3 vV;
void main() {
  vCol = color;
  #ifdef USE_INSTANCING_COLOR
    vCol.rgb *= instanceColor;
  #endif
  vec3 p = position;
  mat4 im = mat4(1.0);
  #ifdef USE_INSTANCING
    im = instanceMatrix;
  #endif
  float ph = im[3].x * 0.7 + im[3].z * 0.3;
  float hem = 1.0 - smoothstep(0.1, 0.9, p.y);
  float a = atan(p.z, p.x);
  p.x += hem * 0.07 * sin(uTime * 3.2 + a * 3.0 + ph);
  p.z += hem * 0.07 * cos(uTime * 2.7 + a * 2.0 + ph);
  p.y += 0.12 * sin(uTime * 1.7 + ph) + 0.06;
  p.x += 0.05 * sin(uTime * 0.9 + ph) * smoothstep(0.6, 1.6, position.y);
  vec4 wp = modelMatrix * im * vec4(p, 1.0);
  vN = normalize(mat3(modelMatrix) * mat3(im) * normal);
  vV = normalize(cameraPosition - wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const FRAG = `
uniform float uAlpha;
uniform vec3 uGlow;
varying vec4 vCol;
varying vec3 vN;
varying vec3 vV;
void main() {
  float nv = abs(dot(normalize(vN), normalize(vV)));
  float rim = pow(1.0 - nv, 2.0);
  float dark = step(vCol.a, 0.97) * step(0.95, vCol.a);
  float hat = step(0.975, vCol.a);
  vec3 c = vCol.rgb * (0.55 + 0.45 * nv) + uGlow * rim * (1.0 - dark) * (1.0 - 0.7 * hat);
  float a = clamp(vCol.a * (0.72 + 0.4 * rim) + dark, 0.0, 1.0) * uAlpha;
  gl_FragColor = vec4(c, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function createGhosts(materials, { count = 4, hat = 'stetson', tint = '#e6f4ff', glow = '#9fe8ff' } = {}) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: materials.uTime, uAlpha: { value: 1 }, uGlow: { value: new THREE.Color(glow) } },
    vertexShader: VERT, fragmentShader: FRAG, vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  const mesh = new THREE.InstancedMesh(ghostGeometry(hat), mat, count);
  mesh.name = 'kit:ghosts';
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.renderOrder = 6;
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color(), _y = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < count; i++) { mesh.setMatrixAt(i, _m.makeScale(0, 0, 0)); mesh.setColorAt(i, _c.set(tint)); }
  let shown = 0;
  const api = {
    mesh, count, material: mat,
    set(i, x, y, z, heading = 0, s = 1, o = {}) {
      mesh.setMatrixAt(i, _m.compose(_p.set(x, y, z), _q.setFromAxisAngle(_y, heading), _s.setScalar(s)));
      if (o.tint) { mesh.setColorAt(i, _c.set(o.tint)); mesh.instanceColor.needsUpdate = true; }
      shown = Math.max(shown, i + 1);
      return api;
    },
    hide(i) { mesh.setMatrixAt(i, _m.makeScale(0, 0, 0)); return api; },
    // 0..1 fade for every ghost of this mesh (spawn/vanish).
    alpha(a) { mat.uniforms.uAlpha.value = a; mesh.visible = a > 0.005 && shown > 0; return api; },
    commit() { mesh.instanceMatrix.needsUpdate = true; },
  };
  return api;
}
