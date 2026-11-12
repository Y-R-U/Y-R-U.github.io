import * as THREE from 'three';
import { shaderCommon, fogUniforms } from './shared.js';

// Interleaved per-instance layout (floats):
// 0 x, 1 y, 2 z, 3 yaw | 4 phase, 5 gait, 6 look, 7 flash | 8 r, 9 g, 10 b, 11 scale
export const STRIDE = 12;

// Regions: 0 skin, 1 shirt, 2 trousers, 3 hair, 4 shoes. Parts: 0 body, 1 legL, 2 legR, 3 armL, 4 armR, 5 head.
function builder() {
  const P = [], N = [], A = [], I = [];
  const face = (pts, n, part, reg) => {
    const b = P.length / 3;
    for (const p of pts) { P.push(p[0], p[1], p[2]); N.push(n[0], n[1], n[2]); A.push(part, reg); }
    for (let k = 1; k < pts.length - 1; k++) I.push(b, b + k, b + k + 1);
  };
  const nrm = (a, b, c) => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let x = uy * vz - uz * vy, y = uz * vx - ux * vz, z = ux * vy - uy * vx;
    const l = Math.hypot(x, y, z) || 1;
    return [x / l, y / l, z / l];
  };
  const quad = (a, b, c, d, part, reg) => face([a, b, c, d], nrm(a, b, c), part, reg);
  // Tapered box: bottom (w0,d0) at y0, top (w1,d1) at y1, centred at (cx,cz). regFn(faceName) -> region.
  const tbox = (cx, cz, y0, y1, w0, d0, w1, d1, part, reg, opts = {}) => {
    const b = [[cx - w0 / 2, y0, cz - d0 / 2], [cx + w0 / 2, y0, cz - d0 / 2], [cx + w0 / 2, y0, cz + d0 / 2], [cx - w0 / 2, y0, cz + d0 / 2]];
    const t = [[cx - w1 / 2, y1, cz - d1 / 2], [cx + w1 / 2, y1, cz - d1 / 2], [cx + w1 / 2, y1, cz + d1 / 2], [cx - w1 / 2, y1, cz + d1 / 2]];
    const r = (n) => (typeof reg === 'function' ? reg(n) : reg);
    if (!opts.noTop) quad(t[0], t[3], t[2], t[1], part, r('top'));
    if (!opts.noBottom) quad(b[0], b[1], b[2], b[3], part, r('bottom'));
    quad(b[3], b[2], t[2], t[3], part, r('front'));
    quad(b[1], b[0], t[0], t[1], part, r('back'));
    quad(b[2], b[1], t[1], t[2], part, r('right'));
    quad(b[0], b[3], t[3], t[0], part, r('left'));
  };
  // Octagonal frustum ring, used for the head.
  const ring = (cy0, cy1, r0, r1, n, part, regFn) => {
    for (let k = 0; k < n; k++) {
      const a0 = (k / n) * Math.PI * 2, a1 = ((k + 1) / n) * Math.PI * 2;
      const p = (a, y, r) => [Math.sin(a) * r, y, Math.cos(a) * r * 0.92];
      const v = [p(a0, cy0, r0), p(a1, cy0, r0), p(a1, cy1, r1), p(a0, cy1, r1)];
      quad(v[0], v[1], v[2], v[3], part, regFn((a0 + a1) / 2));
    }
  };
  const cap = (cy, r, n, up, part, reg) => {
    const pts = [];
    for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2; pts.push([Math.sin(a) * r, cy, Math.cos(a) * r * 0.92]); }
    if (!up) pts.reverse();
    face(pts, [0, up ? 1 : -1, 0], part, reg);
  };
  return { P, N, A, I, tbox, ring, cap };
}

export function personGeometry(detail = 1) {
  const g = builder();
  const HIP = 0.8, SH = 1.3;
  for (const s of [1, -1]) {
    const part = s > 0 ? 1 : 2;
    g.tbox(0.11 * s, 0, 0.1, HIP, 0.15, 0.16, 0.18, 0.2, part, 2, { noTop: true, noBottom: true });
    g.tbox(0.11 * s, 0.035, 0.0, 0.11, 0.16, 0.26, 0.15, 0.23, part, 4, { noBottom: true });
  }
  g.tbox(0, 0, 0.72, 0.9, 0.38, 0.23, 0.39, 0.24, 0, 2, { noTop: true });
  g.tbox(0, 0, 0.86, SH + 0.07, 0.42, 0.26, 0.6, 0.32, 0, 1, { noBottom: true });
  for (const s of [1, -1]) {
    const part = s > 0 ? 3 : 4;
    const x = 0.35 * s;
    g.tbox(x, 0, SH - 0.34, SH + 0.06, 0.15, 0.16, 0.16, 0.18, part, 1, { noBottom: true });
    g.tbox(x, 0.01, 0.7, SH - 0.3, 0.095, 0.105, 0.11, 0.12, part, 0, { noTop: true });
  }
  const n = detail > 1 ? 8 : detail ? 6 : 5;
  g.ring(SH + 0.04, SH + 0.11, 0.07, 0.115, n, 5, () => 0);
  g.ring(SH + 0.11, SH + 0.25, 0.115, 0.138, n, 5, () => 0);
  g.ring(SH + 0.25, SH + 0.35, 0.138, 0.133, n, 5, (a) => (Math.cos(a) < 0.3 ? 3 : 0));
  g.ring(SH + 0.35, SH + 0.42, 0.142, 0.095, n, 5, () => 3);
  g.cap(SH + 0.42, 0.095, n, true, 5, 3);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(g.P, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(g.N, 3));
  geo.setAttribute('aPR', new THREE.Float32BufferAttribute(g.A, 2));
  geo.setIndex(g.I);
  return geo;
}

const lin = (hex) => { const c = new THREE.Color(hex); return c; };
const SKIN = [0xf2c7a5, 0xe0a882, 0xc68a62, 0x9a6440, 0x6b4128].map(lin);
const HAIR = [0x2a1d16, 0x4a3020, 0x7a5030, 0xc8a060, 0x9a9590, 0x8c4a2a].map(lin);
const PANTS = [0x23293a, 0x2f3c5a, 0x1c1c22, 0x4a4a52, 0x6b5a44, 0x39424f].map(lin);

const VERT = /* glsl */`
attribute vec2 aPR;
attribute vec4 iA;
attribute vec4 iB;
attribute vec4 iC;
uniform float uTime;
uniform float uFlip;
uniform float uFigScale;
uniform vec3 uSkin[5];
uniform vec3 uHair[6];
uniform vec3 uPants[6];
varying vec3 vCol;
${shaderCommon.lightPars}
#include <fog_pars_vertex>

vec3 rotX(vec3 p, float py, float pz, float a) {
  float c = cos(a), s = sin(a);
  float y = p.y - py, z = p.z - pz;
  return vec3(p.x, py + y * c - z * s, pz + y * s + z * c);
}
vec3 rotXn(vec3 n, float a) {
  float c = cos(a), s = sin(a);
  return vec3(n.x, n.y * c - n.z * s, n.y * s + n.z * c);
}

void main() {
  float part = aPR.x;
  float reg = aPR.y;
  float ph = iB.x, g = clamp(iB.y, 0.0, 1.0), look = iB.z, flash = iB.w;
  vec3 p = position;
  vec3 n = normal;
  float sw = sin(ph);
  float idle = 1.0 - g;
  float breath = sin(uTime * 2.1 + look * 37.0);
  if (part > 0.5 && part < 2.5) {
    float a = sw * 0.72 * g * (part < 1.5 ? 1.0 : -1.0);
    p = rotX(p, 0.8, 0.0, a); n = rotXn(n, a);
    float lift = max(0.0, -cos(ph) * (part < 1.5 ? 1.0 : -1.0)) * 0.08 * g;
    if (p.y < 0.45) p.y += lift;
  } else if (part > 2.5 && part < 4.5) {
    float side = part < 3.5 ? 1.0 : -1.0;
    float a = -sw * 0.85 * g * side + idle * 0.06 * breath * side - 0.15 * g;
    p = rotX(p, 1.3, 0.0, a); n = rotXn(n, a);
    p.x += side * idle * 0.01;
  }
  if (part < 0.5 || part > 2.5) {
    float lean = 0.16 * g;
    p = rotX(p, 0.78, 0.0, lean); n = rotXn(n, lean);
    p.y += idle * breath * 0.008 * step(1.0, p.y);
  }
  p.y += abs(cos(ph)) * 0.07 * g;

  float s = iC.w * 1.28 * uFigScale;
  float cy = cos(iA.w), sy = sin(iA.w);
  p *= s;
  vec3 w = vec3(p.x * cy + p.z * sy, p.y, -p.x * sy + p.z * cy) + iA.xyz;
  vec3 nw = vec3(n.x * cy + n.z * sy, n.y, -n.x * sy + n.z * cy);
  w.y *= uFlip; nw.y *= uFlip;

  float h1 = fract(look * 7.13), h2 = fract(look * 13.7), h3 = fract(look * 3.31);
  float sat = clamp((max(iC.r, max(iC.g, iC.b)) - min(iC.r, min(iC.g, iC.b))) * 2.5, 0.0, 1.0);
  bool cap = h3 > 0.5 && sat > 0.4;
  vec3 base;
  if (reg < 0.5) base = uSkin[int(h1 * 4.99)];
  else if (reg < 1.5) base = iC.rgb;
  else if (reg < 2.5) base = uPants[int(h2 * 5.99)];
  else if (reg < 3.5) base = cap ? iC.rgb * 0.8 : uHair[int(h3 * 5.99)];
  else base = h2 > 0.7 ? vec3(0.8) : vec3(0.035);

  vec3 info = sampleInfo(iA.xz);
  vec3 V = normalize(cameraPosition - w);
  vec3 light = lightAt(nw, info);
  if (reg > 0.5 && reg < 1.5) light = mix(light, vec3(dot(light, vec3(0.3, 0.5, 0.2))), 0.55);
  float rim = pow(max(1.0 - max(dot(nw, V), 0.0), 0.0), 3.0);
  vec3 col = base * light * 0.72 + rim * uRimCol * (0.2 + 0.4 * info.r);
  if ((reg > 0.5 && reg < 1.5) || (reg > 2.5 && reg < 3.5 && cap)) col += iC.rgb * mix(0.1, 0.3, sat) * (1.0 + 0.6 * max(nw.y, 0.0)) + rim * iC.rgb * 0.6 * sat;
  col += flash * vec3(1.0, 0.95, 0.85) * 1.6;
  if (uFlip < 0.0) col = mix(col * 0.75, uReflSky, smoothstep(0.0, 2.2, -w.y) * 0.8);
  vCol = col;

  vec4 mvPosition = viewMatrix * vec4(w, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const FRAG = /* glsl */`
varying vec3 vCol;
#include <fog_pars_fragment>
void main() {
  gl_FragColor = vec4(vCol, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

const SHADOW_VERT = /* glsl */`
attribute vec4 iA;
attribute vec4 iC;
uniform vec2 uSunXZ;
uniform float uFigScale;
varying vec2 vUv;
varying float vA;
#include <fog_pars_vertex>
void main() {
  vUv = position.xz;
  float s = iC.w * 1.12 * uFigScale;
  vec2 dir = uSunXZ;
  vec2 perp = vec2(-dir.y, dir.x);
  vec2 q = position.x * perp * 0.42 + position.z * dir * 0.85 + dir * 0.55;
  vec3 w = vec3(iA.x + q.x * s, 0.03, iA.z + q.y * s);
  vA = clamp(1.0 - iA.y * 0.4, 0.0, 1.0) * step(0.01, s);
  vec4 mvPosition = viewMatrix * vec4(w, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;
const SHADOW_FRAG = /* glsl */`
uniform float uShadowA;
varying vec2 vUv;
varying float vA;
#include <fog_pars_fragment>
void main() {
  float d = length(vUv);
  float a = smoothstep(1.0, 0.15, d) * uShadowA * vA;
  gl_FragColor = vec4(0.03, 0.02, 0.06, a);
  #if defined(USE_FOG) && !defined(FOG_EXP2)
    a *= 1.0 - smoothstep(fogNear, fogFar, vFogDepth);
    gl_FragColor.a = a;
  #endif
}
`;

export function createPeople(capacity, shared, opts = {}) {
  const geo = personGeometry(opts.detail ?? 1);
  const data = new Float32Array(capacity * STRIDE);
  const buf = new THREE.InstancedInterleavedBuffer(data, STRIDE, 1);
  buf.setUsage(THREE.DynamicDrawUsage);
  const ia = new THREE.InterleavedBufferAttribute(buf, 4, 0);
  const ib = new THREE.InterleavedBufferAttribute(buf, 4, 4);
  const ic = new THREE.InterleavedBufferAttribute(buf, 4, 8);

  const mkGeo = () => {
    const g = new THREE.InstancedBufferGeometry();
    g.index = geo.index;
    for (const k of ['position', 'normal', 'aPR']) g.setAttribute(k, geo.getAttribute(k));
    g.setAttribute('iA', ia); g.setAttribute('iB', ib); g.setAttribute('iC', ic);
    g.instanceCount = 0;
    return g;
  };
  const igeo = mkGeo();

  const mk = (flip) => new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, fog: true,
    uniforms: {
      ...fogUniforms(), ...shared,
      uFlip: { value: flip },
      uSkin: { value: SKIN }, uHair: { value: HAIR }, uPants: { value: PANTS },
    },
  });
  const mat = mk(1);
  const mesh = new THREE.Mesh(igeo, mat);
  mesh.frustumCulled = false;

  const rgeo = mkGeo();
  const reflMat = mk(-1);
  reflMat.side = THREE.BackSide;
  const reflection = new THREE.Mesh(rgeo, reflMat);
  reflection.frustumCulled = false;
  reflection.renderOrder = -5;

  const sgeo = new THREE.InstancedBufferGeometry();
  sgeo.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1], 3));
  sgeo.setIndex([0, 2, 1, 0, 3, 2]);
  sgeo.setAttribute('iA', ia); sgeo.setAttribute('iC', ic);
  sgeo.instanceCount = 0;
  const smat = new THREE.ShaderMaterial({
    vertexShader: SHADOW_VERT, fragmentShader: SHADOW_FRAG, fog: true,
    transparent: true, depthWrite: false,
    uniforms: { ...fogUniforms(), uSunXZ: shared.uSunXZ, uFigScale: shared.uFigScale, uShadowA: { value: 0.42 } },
  });
  const shadows = new THREE.Mesh(sgeo, smat);
  shadows.frustumCulled = false;
  shadows.renderOrder = 2;

  return {
    data, capacity, mesh, reflection, shadows,
    setCount(n) {
      igeo.instanceCount = n; rgeo.instanceCount = n; sgeo.instanceCount = n;
      buf.clearUpdateRanges();
      buf.addUpdateRange(0, n * STRIDE);
      buf.needsUpdate = true;
    },
    dispose() { geo.dispose(); igeo.dispose(); rgeo.dispose(); sgeo.dispose(); mat.dispose(); reflMat.dispose(); smat.dispose(); },
  };
}
