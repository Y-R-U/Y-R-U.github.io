import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { fogUniforms } from './shared.js';
import { GeoWriter, C, mul } from './geo.js';

const FOG_ALPHA = /* glsl */`
#include <tonemapping_fragment>
#include <colorspace_fragment>
#if defined(USE_FOG) && !defined(FOG_EXP2)
  gl_FragColor.rgb *= 1.0 - smoothstep(fogNear, fogFar, vFogDepth);
#endif
`;

function quadGeo() {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1], 3));
  g.setIndex([0, 2, 1, 0, 3, 2]);
  return g;
}

// ---------- team rings ----------
export function createRings(max, shared) {
  const g = quadGeo();
  const a = new Float32Array(max * 4), c = new Float32Array(max * 4);
  const ia = new THREE.InstancedBufferAttribute(a, 4).setUsage(THREE.DynamicDrawUsage);
  const ic = new THREE.InstancedBufferAttribute(c, 4).setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('iR', ia); g.setAttribute('iC', ic);
  g.instanceCount = 0;
  const mat = new THREE.ShaderMaterial({
    fog: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { ...fogUniforms(), uTime: shared.uTime },
    vertexShader: /* glsl */`
      attribute vec4 iR; attribute vec4 iC;
      varying vec2 vUv; varying vec4 vC; varying float vR;
      #include <fog_pars_vertex>
      void main() {
        float R = max(iR.z, 0.5);
        float ext = 1.0 + max(1.6, R * 0.22) / R;
        vUv = position.xz * ext; vR = R; vC = vec4(iC.rgb, iR.w * iC.w);
        vec3 w = vec3(iR.x + position.x * R * ext, 0.06, iR.y + position.z * R * ext);
        vec4 mvPosition = viewMatrix * vec4(w, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime;
      varying vec2 vUv; varying vec4 vC; varying float vR;
      #include <fog_pars_fragment>
      void main() {
        float d = length(vUv);
        float lw = max(0.14, vR * 0.012) / vR;
        float gw = max(0.9, vR * 0.09) / vR;
        float x = (d - 1.0);
        float line = exp(-x * x / (lw * lw));
        float glow = exp(-x * x / (gw * gw)) * (x > 0.0 ? 0.55 : 0.9);
        float fill = smoothstep(1.02, 0.2, d) * 0.16;
        float ang = atan(vUv.y, vUv.x);
        float spark = pow(max(0.5 + 0.5 * sin(ang * 6.0 - uTime * 1.6), 0.0), 8.0) * line;
        float rp = fract(uTime * 0.45);
        float rx = d - rp;
        float ripple = exp(-rx * rx / 0.0025) * (1.0 - rp) * 0.35 * step(d, 1.0);
        float v = line * 1.5 + glow * 0.45 + fill + spark * 1.2 + ripple;
        gl_FragColor = vec4(vC.rgb * v * vC.a, 1.0);
        ${FOG_ALPHA}
      }`,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 3;
  return {
    mesh,
    set(i, x, z, r, alpha, col, inten = 1) {
      a[i * 4] = x; a[i * 4 + 1] = z; a[i * 4 + 2] = r; a[i * 4 + 3] = alpha;
      c[i * 4] = col.r; c[i * 4 + 1] = col.g; c[i * 4 + 2] = col.b; c[i * 4 + 3] = inten;
    },
    commit(n) { g.instanceCount = n; ia.needsUpdate = true; ic.needsUpdate = true; },
  };
}

// ---------- glow points (lamp halos, sparks) ----------
const POINT_VERT = /* glsl */`
attribute float aSize;
attribute vec4 aCol;
uniform float uScale;
uniform float uFlip;
uniform float uTime;
varying vec4 vCol;
#include <fog_pars_vertex>
void main() {
  vec3 p = position; p.y *= uFlip;
  vCol = aCol;
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  gl_PointSize = aSize * uScale / max(-mvPosition.z, 0.1);
  #include <fog_vertex>
}`;
const POINT_FRAG = /* glsl */`
varying vec4 vCol;
#include <fog_pars_fragment>
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float d = dot(q, q);
  if (d > 1.0) discard;
  float core = exp(-d * 9.0);
  float halo = (1.0 - d) * (1.0 - d) * 0.35;
  gl_FragColor = vec4(vCol.rgb * (core + halo) * vCol.a, 1.0);
  ${FOG_ALPHA}
}`;

function pointsMaterial(shared, flip = 1) {
  return new THREE.ShaderMaterial({
    vertexShader: POINT_VERT, fragmentShader: POINT_FRAG, fog: true,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { ...fogUniforms(), uScale: shared.uPointScale, uFlip: { value: flip }, uTime: shared.uTime },
  });
}

export function createHalos(data, shared) {
  const n = data.length / 4;
  const pos = new Float32Array(n * 3), size = new Float32Array(n), col = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = data[i * 4]; pos[i * 3 + 1] = data[i * 4 + 1]; pos[i * 3 + 2] = data[i * 4 + 2];
    size[i] = data[i * 4 + 3];
    col[i * 4] = 1.0; col[i * 4 + 1] = 0.48; col[i * 4 + 2] = 0.16; col[i * 4 + 3] = 0.6;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  g.setAttribute('aCol', new THREE.BufferAttribute(col, 4));
  const pts = new THREE.Points(g, pointsMaterial(shared, 1));
  pts.frustumCulled = false; pts.renderOrder = 6;
  const rg = new THREE.BufferGeometry();
  const rcol = col.slice();
  for (let i = 0; i < n; i++) rcol[i * 4 + 3] = 0.45;
  rg.setAttribute('position', g.getAttribute('position'));
  rg.setAttribute('aSize', g.getAttribute('aSize'));
  rg.setAttribute('aCol', new THREE.BufferAttribute(rcol, 4));
  const refl = new THREE.Points(rg, pointsMaterial(shared, -1));
  refl.frustumCulled = false; refl.renderOrder = -3;
  return { points: pts, reflection: refl };
}

export function createParticles(max, shared) {
  const pos = new Float32Array(max * 3), size = new Float32Array(max), col = new Float32Array(max * 4);
  const vel = new Float32Array(max * 3), life = new Float32Array(max), maxLife = new Float32Array(max), size0 = new Float32Array(max);
  const grav = new Float32Array(max);
  const g = new THREE.BufferGeometry();
  const pa = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
  const sa = new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage);
  const ca = new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('position', pa); g.setAttribute('aSize', sa); g.setAttribute('aCol', ca);
  g.setDrawRange(0, 0);
  const pts = new THREE.Points(g, pointsMaterial(shared, 1));
  pts.frustumCulled = false; pts.renderOrder = 8;
  let top = 0, cursor = 0, alive = 0;
  return {
    points: pts,
    get alive() { return alive; },
    emit(x, y, z, vx, vy, vz, r, gr, b, sz, lf, gravity = 9) {
      let i = cursor;
      for (let k = 0; k < max; k++) { if (life[i] <= 0) break; i = (i + 1) % max; }
      cursor = (i + 1) % max;
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
      vel[i * 3] = vx; vel[i * 3 + 1] = vy; vel[i * 3 + 2] = vz;
      col[i * 4] = r; col[i * 4 + 1] = gr; col[i * 4 + 2] = b; col[i * 4 + 3] = 1;
      size0[i] = sz; size[i] = sz; life[i] = lf; maxLife[i] = lf; grav[i] = gravity;
      if (i + 1 > top) top = i + 1;
    },
    update(dt) {
      let hi = 0; alive = 0;
      for (let i = 0; i < top; i++) {
        if (life[i] <= 0) { size[i] = 0; continue; }
        life[i] -= dt;
        const t = Math.max(0, life[i] / maxLife[i]);
        vel[i * 3 + 1] -= grav[i] * dt;
        const drag = Math.exp(-dt * 1.2);
        vel[i * 3] *= drag; vel[i * 3 + 2] *= drag;
        pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        if (pos[i * 3 + 1] < 0.05) { pos[i * 3 + 1] = 0.05; vel[i * 3 + 1] *= -0.3; }
        col[i * 4 + 3] = Math.min(1, t * 2.5);
        size[i] = size0[i] * (0.4 + 0.6 * t);
        if (life[i] <= 0) size[i] = 0;
        hi = i + 1; alive++;
      }
      top = hi;
      g.setDrawRange(0, top);
      pa.needsUpdate = sa.needsUpdate = ca.needsUpdate = true;
      pa.clearUpdateRanges(); pa.addUpdateRange(0, top * 3);
      sa.clearUpdateRanges(); sa.addUpdateRange(0, top);
      ca.clearUpdateRanges(); ca.addUpdateRange(0, top * 4);
    },
    burst(x, z, col, n, speed = 6, size = 0.9, up = 6) {
      for (let k = 0; k < n; k++) {
        const a = Math.random() * Math.PI * 2, s = speed * (0.3 + Math.random() * 0.7);
        this.emit(x, 0.8 + Math.random(), z, Math.cos(a) * s, up * (0.4 + Math.random() * 0.8), Math.sin(a) * s,
          col.r * 2, col.g * 2, col.b * 2, size * (0.6 + Math.random() * 0.8), 0.7 + Math.random() * 0.6);
      }
    },
  };
}

// ---------- water + jets ----------
export function createWater(list, jets, shared) {
  const geos = [];
  for (const w of list) {
    const c = new THREE.CircleGeometry(w.r, 40);
    c.rotateX(-Math.PI / 2);
    const n = c.attributes.position.count;
    const l = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { l[i * 3] = c.attributes.position.getX(i); l[i * 3 + 1] = c.attributes.position.getZ(i); l[i * 3 + 2] = w.r; }
    c.setAttribute('aL', new THREE.BufferAttribute(l, 3));
    c.deleteAttribute('uv');
    c.translate(w.x, w.y, w.z);
    geos.push(c);
  }
  const wg = mergeGeometries(geos);
  const wmat = new THREE.ShaderMaterial({
    fog: true, uniforms: { ...fogUniforms(), uTime: shared.uTime },
    vertexShader: /* glsl */`
      attribute vec3 aL; varying vec3 vL; varying vec3 vW;
      #include <fog_pars_vertex>
      void main() { vL = aL; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;
        vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime; varying vec3 vL; varying vec3 vW;
      #include <fog_pars_fragment>
      void main() {
        float d = length(vL.xy);
        float rr = d / max(vL.z, 0.01);
        float w1 = sin(d * 4.5 - uTime * 2.6) * 0.5 + 0.5;
        float w2 = sin(vW.x * 2.3 + uTime * 1.3) * sin(vW.z * 2.7 - uTime * 1.1) * 0.5 + 0.5;
        float caust = pow(max(w1 * w2, 0.0), 3.0);
        vec3 deep = vec3(0.0, 0.07, 0.42);
        vec3 bright = vec3(0.05, 0.55, 1.6);
        vec3 col = mix(bright, deep, smoothstep(0.0, 1.0, rr) * 0.8) * (0.7 + 0.4 * w1);
        col += vec3(0.3, 0.8, 1.6) * caust * 0.8;
        col += vec3(0.3, 0.75, 1.5) * smoothstep(0.88, 1.0, rr) * 0.9;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const water = new THREE.Mesh(wg, wmat);
  water.renderOrder = 1;

  const jg = [];
  for (const j of jets) {
    const c = j.ring ? new THREE.CylinderGeometry(j.r * 1.6, j.r * 0.4, j.h, 16, 1, true) : new THREE.CylinderGeometry(j.r * 0.5, j.r, j.h, 8, 1, true);
    c.translate(j.x, j.y + j.h / 2, j.z);
    jg.push(c);
    if (!j.ring) {
      const top = new THREE.CylinderGeometry(j.r * 3.2, j.r * 0.6, j.h * 0.45, 10, 1, true);
      top.translate(j.x, j.y + j.h * 0.85, j.z);
      jg.push(top);
    }
  }
  const jgeo = mergeGeometries(jg);
  const jmat = new THREE.ShaderMaterial({
    fog: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { ...fogUniforms(), uTime: shared.uTime },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      #include <fog_pars_vertex>
      void main() { vUv = uv; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime; varying vec2 vUv;
      #include <fog_pars_fragment>
      void main() {
        float streak = sin(vUv.x * 50.0 + sin(vUv.y * 6.0) * 2.0) * 0.5 + 0.5;
        float flow = sin(vUv.y * 18.0 + uTime * 9.0 + vUv.x * 20.0) * 0.5 + 0.5;
        float a = pow(max(vUv.y, 0.0), 0.6) * (0.25 + 0.75 * streak * flow) * smoothstep(1.0, 0.75, vUv.y);
        gl_FragColor = vec4(vec3(0.55, 0.85, 1.0) * a * 0.9, 1.0);
        ${FOG_ALPHA}
      }`,
  });
  const jetMesh = new THREE.Mesh(jgeo, jmat);
  jetMesh.renderOrder = 7;
  return { water, jets: jetMesh, jetList: jets };
}

// ---------- crown ----------
function crownGeo() {
  const G = new GeoWriter();
  const gold = C(0xf2a200), deep = C(0xa85e00);
  const n = 10, r = 0.85;
  G.cyl(0, 0, 0, 0.5, r, r * 1.08, n, gold, { top: false, colFn: (k) => (k % 2 ? gold : mul(gold, 0.85)) });
  G.cyl(0, 0, -0.08, 0.06, r * 1.04, r * 1.04, n, deep, { top: false });
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    const a0 = a - 0.42, a1 = a + 0.42;
    const p = (an, y, rr) => [Math.cos(an) * rr, y, Math.sin(an) * rr];
    const tip = p(a, 1.25, r * 1.14);
    G.tri(p(a1, 0.5, r * 1.08), p(a0, 0.5, r * 1.08), tip, gold);
    G.tri(p(a0, 0.5, r * 1.0), p(a1, 0.5, r * 1.0), tip, deep);
    G.blob(tip[0], tip[1] + 0.08, tip[2], 0.13, C(0xffd060), Math.random, 1);
    const gem = p(a + Math.PI / 5, 0.26, r * 1.1);
    G.blob(gem[0], gem[1], gem[2], 0.12, k % 2 ? C(0xff2040) : C(0x2050ff), Math.random, 1);
  }
  return G.build();
}

export function createCrown(shared) {
  const group = new THREE.Group();
  const mat = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: { uSunDir: shared.uSunDir, uTime: shared.uTime },
    vertexShader: /* glsl */`
      attribute vec3 color; varying vec3 vC; varying vec3 vN; varying vec3 vW;
      void main() { vC = color; vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`
      uniform vec3 uSunDir; uniform float uTime; varying vec3 vC; varying vec3 vN; varying vec3 vW;
      void main() {
        vec3 V = normalize(cameraPosition - vW);
        vec3 N = normalize(vN); if (dot(N, V) < 0.0) N = -N;
        float dif = max(dot(N, uSunDir), 0.0);
        vec3 R = reflect(-V, N);
        float spec = pow(max(dot(R, uSunDir), 0.0), 24.0) + pow(max(R.y, 0.0), 6.0) * 0.6;
        float rim = pow(max(1.0 - max(dot(N, V), 0.0), 0.0), 2.0);
        vec3 col = vC * (0.35 + 0.75 * dif + 0.45 * max(N.y, 0.0)) + vec3(1.0, 0.75, 0.35) * spec * 0.9 + vC * rim * 0.9 + vC * 0.25;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const crown = new THREE.Mesh(crownGeo(), mat);
  group.add(crown);
  const shaftGeo = new THREE.CylinderGeometry(1.1, 1.8, 1, 20, 1, true);
  shaftGeo.translate(0, 0.5, 0);
  const shaftMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uTime: shared.uTime, uA: { value: 1 } },
    vertexShader: /* glsl */`varying vec2 vUv; varying vec3 vN; varying vec3 vW;
      void main() { vUv = uv; vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`uniform float uTime; uniform float uA; varying vec2 vUv; varying vec3 vN; varying vec3 vW;
      void main() {
        vec3 V = normalize(cameraPosition - vW);
        float edge = pow(max(abs(dot(normalize(vN), V)), 0.0), 1.5);
        float rays = 0.6 + 0.4 * sin(vUv.x * 40.0 + uTime * 1.5) * sin(vUv.x * 17.0 - uTime);
        float a = edge * rays * pow(max(vUv.y, 0.0), 1.6) * smoothstep(0.25, 0.7, vUv.y) * smoothstep(1.0, 0.85, vUv.y) * 0.7 * uA;
        gl_FragColor = vec4(vec3(1.0, 0.58, 0.12) * a, 1.0);
      }`,
  });
  const shaft = new THREE.Mesh(shaftGeo, shaftMat);
  shaft.renderOrder = 9;
  crown.renderOrder = 10;
  return { group, crown, shaft, shaftMat };
}

// ---------- pickups ----------
function iconAtlas() {
  const cv = document.createElement('canvas');
  cv.width = 384; cv.height = 128;
  const x = cv.getContext('2d');
  x.fillStyle = '#fff'; x.strokeStyle = '#fff'; x.lineCap = 'round'; x.lineJoin = 'round';
  // speed: double chevron
  x.lineWidth = 16;
  for (const y of [70, 100]) { x.beginPath(); x.moveTo(30, y); x.lineTo(64, y - 34); x.lineTo(98, y); x.stroke(); }
  // magnet
  x.lineWidth = 22;
  x.beginPath(); x.moveTo(128 + 34, 28); x.lineTo(128 + 34, 66); x.arc(128 + 64, 66, 30, Math.PI, 0, true); x.lineTo(128 + 94, 28); x.stroke();
  x.fillRect(128 + 22, 18, 24, 18); x.fillRect(128 + 82, 18, 24, 18);
  // x2
  x.font = 'bold 76px system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText('x2', 256 + 64, 68);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = false;
  t.minFilter = THREE.LinearFilter;
  return t;
}

export const PICKUP_COL = { speed: new THREE.Color(0x2a8cff), magnet: new THREE.Color(0xff3048), double: new THREE.Color(0xa64dff) };
const KIND_IDX = { speed: 0, magnet: 1, double: 2 };

export function createPickups(max, shared) {
  const atlas = iconAtlas();
  const g = quadGeo();
  const a = new Float32Array(max * 4), c = new Float32Array(max * 4);
  const ia = new THREE.InstancedBufferAttribute(a, 4).setUsage(THREE.DynamicDrawUsage);
  const ic = new THREE.InstancedBufferAttribute(c, 4).setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('iP', ia); g.setAttribute('iC', ic);
  g.instanceCount = 0;
  const padMat = new THREE.ShaderMaterial({
    fog: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { ...fogUniforms(), uTime: shared.uTime, uAtlas: { value: atlas }, uYaw: shared.uYaw },
    vertexShader: /* glsl */`
      attribute vec4 iP; attribute vec4 iC; varying vec2 vUv; varying vec4 vC; varying float vK;
      #include <fog_pars_vertex>
      void main() { float R = 2.6 * iP.w; vUv = position.xz; vC = iC; vK = iP.z;
        vec3 w = vec3(iP.x + position.x * R, 0.08, iP.y + position.z * R);
        vec4 mvPosition = viewMatrix * vec4(w, 1.0); gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime; uniform float uYaw; uniform sampler2D uAtlas; varying vec2 vUv; varying vec4 vC; varying float vK;
      #include <fog_pars_fragment>
      void main() {
        float d = length(vUv);
        if (d > 1.0) discard;
        float q1 = (d - 0.78) / 0.05, q2 = (d - 0.78) / 0.2, q3 = (d - 0.9) / 0.03;
        float ring = exp(-q1 * q1) * 1.6 + exp(-q2 * q2) * 0.4;
        float inner = smoothstep(0.7, 0.0, d) * 0.35;
        float ang = atan(vUv.y, vUv.x);
        float dash = step(0.5, fract(ang * 1.909 + uTime * 0.4)) * exp(-q3 * q3);
        float pulse = 0.85 + 0.15 * sin(uTime * 4.0);
        vec2 rt = vec2(cos(uYaw), -sin(uYaw)), up = vec2(-sin(uYaw), -cos(uYaw));
        vec2 iuv = vec2(dot(vUv, rt), dot(vUv, up)) / 0.62 * 0.5 + 0.5;
        float icon = 0.0;
        if (iuv.x > 0.04 && iuv.x < 0.96 && iuv.y > 0.04 && iuv.y < 0.96) icon = texture2D(uAtlas, vec2((iuv.x + vK) / 3.0, iuv.y)).a;
        vec3 col = vC.rgb * (ring + inner + dash) * pulse + mix(vC.rgb, vec3(1.0), 0.6) * icon * 1.4;
        gl_FragColor = vec4(col * vC.a, 1.0);
        ${FOG_ALPHA}
      }`,
  });
  const pads = new THREE.Mesh(g, padMat);
  pads.frustumCulled = false; pads.renderOrder = 4;

  const bg = new THREE.InstancedBufferGeometry();
  const cyl = new THREE.CylinderGeometry(1.5, 1.9, 1, 16, 1, true);
  cyl.translate(0, 0.5, 0);
  bg.index = cyl.index;
  bg.setAttribute('position', cyl.getAttribute('position'));
  bg.setAttribute('uv', cyl.getAttribute('uv'));
  bg.setAttribute('normal', cyl.getAttribute('normal'));
  bg.setAttribute('iP', ia); bg.setAttribute('iC', ic);
  bg.instanceCount = 0;
  const beamMat = new THREE.ShaderMaterial({
    fog: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { ...fogUniforms(), uTime: shared.uTime },
    vertexShader: /* glsl */`
      attribute vec4 iP; attribute vec4 iC; varying vec2 vUv; varying vec4 vC; varying float vE;
      #include <fog_pars_vertex>
      void main() { vUv = uv; vC = iC;
        vec3 w = vec3(iP.x + position.x * iP.w, position.y * 3.2 * iP.w, iP.y + position.z * iP.w);
        vec3 V = normalize(cameraPosition - w);
        vE = abs(dot(normalize(vec3(normal.x, 0.0, normal.z)), V));
        vec4 mvPosition = viewMatrix * vec4(w, 1.0); gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime; varying vec2 vUv; varying vec4 vC; varying float vE;
      #include <fog_pars_fragment>
      void main() {
        float streak = 0.5 + 0.5 * sin(vUv.x * 60.0 + uTime * 0.7);
        float rise = fract(vUv.y * 2.0 - uTime * 0.8);
        float a = (1.0 - vUv.y) * (1.0 - vUv.y) * (0.35 + 0.65 * streak) * (0.6 + 0.4 * rise) * pow(max(vE, 0.0), 0.7) * 0.7;
        gl_FragColor = vec4(vC.rgb * a * vC.a, 1.0);
        ${FOG_ALPHA}
      }`,
  });
  const beams = new THREE.Mesh(bg, beamMat);
  beams.frustumCulled = false; beams.renderOrder = 5;
  return {
    pads, beams,
    set(i, x, z, kind, alpha, scale = 1) {
      const col = PICKUP_COL[kind] || PICKUP_COL.speed;
      a[i * 4] = x; a[i * 4 + 1] = z; a[i * 4 + 2] = KIND_IDX[kind] ?? 0; a[i * 4 + 3] = scale;
      c[i * 4] = col.r * 1.6; c[i * 4 + 1] = col.g * 1.6; c[i * 4 + 2] = col.b * 1.6; c[i * 4 + 3] = alpha;
    },
    commit(n) { g.instanceCount = n; bg.instanceCount = n; ia.needsUpdate = true; ic.needsUpdate = true; },
  };
}
