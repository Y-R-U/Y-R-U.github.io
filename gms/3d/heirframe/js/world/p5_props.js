import * as THREE from 'three';
import { box, cyl } from './geo.js';
import { HOLO_ART, createHoloMaterial, faceCamera, twoSided } from './holo.js';
import { rng } from './textures.js';
import { REFLECT_LAYER } from '../fx/reflection.js';

// Shared dressing for the Act 5–6 districts (the Spine, Hullside, Meridian, the Helm).
const V = (x, y, z) => new THREE.Vector3(x, y, z);
export const YELLOW = new THREE.Color(0.85, 0.62, 0.1), STEEL = new THREE.Color(0.42, 0.45, 0.5), GRAPHITE = new THREE.Color(0.2, 0.21, 0.24);

// Industrial safety rail along a polyline: dark posts, painted top rail, mid rail, kick plate.
export function rail(ctx, pts, y = 0, { h = 1.05, color = YELLOW, posts = 2.5 } = {}) {
  const { batch, M } = ctx;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, z0] = pts[i], [x1, z1] = pts[i + 1];
    const len = Math.hypot(x1 - x0, z1 - z0), ang = Math.atan2(x1 - x0, z1 - z0), mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
    if (len < 0.1) continue;
    batch.put(box(0.07, 0.07, len), M.stoneUpper, V(mx, y + h, mz), ang, null, { color, cast: false });
    batch.put(box(0.04, 0.04, len), M.darkMetal, V(mx, y + h * 0.55, mz), ang, null, { cast: false });
    batch.put(box(0.03, 0.12, len), M.darkMetal, V(mx, y + 0.06, mz), ang, null, { cast: false });
    const n = Math.max(1, Math.round(len / posts));
    for (let k = 0; k <= n; k++) { const t = k / n; batch.put(box(0.06, h, 0.06), M.darkMetal, V(x0 + (x1 - x0) * t, y + h / 2, z0 + (z1 - z0) * t), ang, null, { cast: false }); }
  }
}

// Glowing coolant / fluid flowing along +flow (x, z): streaks, turbulence, a bright core. Emissive, fogged, opaque.
export function flowMaterial(ctx, { color = [0.05, 0.55, 0.7], core = [0.5, 1.6, 1.9], speed = 3, scale = 1 } = {}) {
  const m = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uC: { value: new THREE.Vector3(...color) }, uK: { value: new THREE.Vector3(...core) }, uSpeed: { value: speed }, uS: { value: scale } }]),
    vertexShader: /* glsl */`varying vec3 vW;
      #include <fog_pars_vertex>
      void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`uniform float uTime, uSpeed, uS; uniform vec3 uC, uK; varying vec3 vW;
      #include <fog_pars_fragment>
      float fh(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
      float fn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(fh(i), fh(i + vec2(1, 0)), f.x), mix(fh(i + vec2(0, 1)), fh(i + vec2(1, 1)), f.x), f.y); }
      void main(){
        vec2 p = vW.xz * uS;
        float t = uTime * uSpeed;
        float w1 = fn(vec2(p.x * 0.9, p.y * 0.12 + t * 0.35) + fn(p * 0.3 + t * 0.05) * 2.0);
        float w2 = fn(vec2(p.x * 2.3 + 5.0, p.y * 0.3 + t * 0.9));
        float streak = smoothstep(0.62, 0.9, w1 * 0.6 + w2 * 0.5);
        float body = 0.55 + 0.45 * fn(p * 0.15 + vec2(0.0, t * 0.08));
        vec3 col = uC * body + uK * streak * 0.9;
        gl_FragColor = vec4(col, 1.0);
        #include <fog_fragment>
      }`,
    fog: true,
  });
  m.uniforms.uTime = ctx.time;
  m.name = 'flow';
  return m;
}

// Blast door in a wall facing +z (local), centred at (x, z), rotated by rot. Panels, chevrons, a lit auth plate, a holo sign.
export function blastDoor(ctx, x, z, rot, { w = 10, h = 9, label = 'FIRMAMENT ACCESS', sub = 'CREW ONLY  •  AUTH: VAEL', glow = [1.2, 0.85, 0.4] } = {}) {
  const { batch, M, scene } = ctx;
  const c = Math.cos(rot), s = Math.sin(rot);
  const P = (lx, y, lz) => V(x + lx * c + lz * s, y, z - lx * s + lz * c);
  batch.put(box(w + 3, h + 2.5, 1.2), M.stoneUpper, P(0, (h + 2.5) / 2, -0.4), rot, null, { color: GRAPHITE });
  for (const sd of [-1, 1]) {
    batch.put(box(w / 2 - 0.1, h, 0.5), M.stoneUpper, P(sd * w / 4, h / 2, 0.3), rot, null, { color: STEEL });
    for (let i = 0; i < 5; i++) batch.put(box(w / 2 - 0.6, 0.08, 0.1), M.darkMetal, P(sd * w / 4, 1 + i * (h - 2) / 4, 0.58), rot, null, { cast: false });
    for (let i = 0; i < 6; i++) { const g = box(0.5, 1.4, 0.06); g.rotateZ(sd * 0.6); batch.put(g, M.stoneUpper, P(sd * (0.6 + i * 0.75), 0.9, 0.58), rot, null, { color: YELLOW, cast: false }); }
  }
  batch.put(box(0.12, h, 0.12), M.warmGlow, P(0, h / 2, 0.6), rot, null, { cast: false, color: new THREE.Color(...glow) });
  batch.put(box(1.1, 1.5, 0.2), M.gold, P(w / 2 + 0.9, 1.6, 0.35), rot);
  batch.put(box(0.7, 0.7, 0.05), M.blueGlow, P(w / 2 + 0.9, 1.75, 0.47), rot, null, { cast: false });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(8, 1.9), createHoloMaterial(HOLO_ART.ad(label, sub, 5, '#3a2a10'), { bright: 2.3, alpha: 0.95, tint: [1.2, 0.95, 0.7], time: ctx.time }));
  sign.position.copy(P(0, h + 1.4, 0.3)); sign.rotation.y = rot; sign.layers.enable(REFLECT_LAYER); scene.add(sign); twoSided(sign);
  ctx.col.box(x, z, (w + 3) / 2, 0.9, rot, 'door');
}

// Operator console: angled desk with a lit screen (screen colour c).
export function consoleDesk(ctx, x, z, rot, c = [0.35, 0.8, 1.4], y = 0) {
  const { batch, M, col } = ctx;
  const cc = Math.cos(rot), ss = Math.sin(rot);
  batch.put(box(1.8, 0.9, 0.8), M.darkMetal, V(x, y + 0.45, z), rot);
  const top = box(1.8, 0.06, 0.7); top.rotateX(0.35);
  batch.put(top, M.stoneUpper, V(x + 0.05 * ss, y + 0.95, z + 0.05 * cc), rot, null, { color: STEEL });
  const scr = box(1.5, 0.02, 0.5); scr.rotateX(0.35);
  batch.put(scr, M.blueGlow, V(x + 0.07 * ss, y + 0.99, z + 0.07 * cc), rot, null, { cast: false, color: new THREE.Color(...c) });
  const up = box(1.2, 0.7, 0.05); up.rotateX(-0.15);
  batch.put(up, M.blueGlow, V(x - 0.3 * ss, y + 1.45, z - 0.3 * cc), rot, null, { cast: false, color: new THREE.Color(c[0] * 0.8, c[1] * 0.8, c[2] * 0.8) });
  col.box(x, z, 0.95, 0.45, rot, 'console');
}

// Pipe run between two points (straight), with flange rings every `step` m.
export function pipe(ctx, a, b, r = 0.5, { color = STEEL, step = 6, mat = null, cast = false } = {}) {
  const { batch, M } = ctx;
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), len = d.length();
  const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.clone().normalize());
  const m4 = new THREE.Matrix4();
  const put = (g, t, material, col) => { m4.compose(V(a[0] + d.x * t, a[1] + d.y * t, a[2] + d.z * t), q, V(1, 1, 1)); batch.add(g, material, { matrix: m4, color: col, cast }); };
  put(new THREE.CylinderGeometry(r, r, len, 14, 1, true), 0.5, mat || M.stoneUpper, color);
  const n = Math.floor(len / step);
  for (let i = 1; i <= n; i++) put(new THREE.CylinderGeometry(r * 1.18, r * 1.18, 0.25, 14), i / (n + 1), M.stoneUpper, GRAPHITE);
}

// Instanced free-floating debris (zero-g): list [x, y, z, size, kind 0 plate / 1 beam / 2 chunk]. Drifts and tumbles in the vertex shader.
export function driftDebris(ctx, list, { color = 0x3a3d44, amp = 0.6 } = {}) {
  if (!list.length) return null;
  const geos = [new THREE.BoxGeometry(1, 0.08, 0.7), new THREE.BoxGeometry(0.18, 0.18, 1.6), new THREE.IcosahedronGeometry(0.5, 0)];
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.7, envMapIntensity: 1.1 });
  const u = { uTime: ctx.time, uAmp: { value: amp } };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
uniform float uTime, uAmp;
mat3 hfRot(vec3 a){ vec3 s = sin(a), c = cos(a);
  return mat3(c.y * c.z, c.y * s.z, -s.y, s.x * s.y * c.z - c.x * s.z, s.x * s.y * s.z + c.x * c.z, s.x * c.y, c.x * s.y * c.z + s.x * s.z, c.x * s.y * s.z - s.x * c.z, c.x * c.y); }`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
#ifdef USE_INSTANCING
float hfSeed = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.53 + instanceMatrix[3].y;
mat3 hfR = hfRot(vec3(uTime * 0.11, uTime * 0.07, uTime * 0.05) * (0.4 + fract(hfSeed)) + hfSeed);
objectNormal = hfR * objectNormal;
#endif`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
#ifdef USE_INSTANCING
transformed = hfR * transformed;
transformed += vec3(sin(uTime * 0.13 + hfSeed), sin(uTime * 0.09 + hfSeed * 2.1) * 0.6, cos(uTime * 0.11 + hfSeed * 1.3)) * uAmp / max(length(instanceMatrix[0].xyz), 0.1);
#endif`);
  };
  mat.customProgramCacheKey = () => 'drift';
  const meshes = [];
  for (let k = 0; k < 3; k++) {
    const items = list.filter((d) => (d[4] | 0) === k);
    if (!items.length) continue;
    const im = new THREE.InstancedMesh(geos[k], mat, items.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), R = rng(k + 3);
    items.forEach(([x, y, z, s], i) => im.setMatrixAt(i, m4.compose(V(x, y, z), q.setFromEuler(new THREE.Euler(R() * 6, R() * 6, R() * 6)), V(s, s, s))));
    im.castShadow = true; im.name = 'debris' + k;
    im.computeBoundingSphere(); im.boundingSphere.radius += 4;
    ctx.scene.add(im); meshes.push(im);
  }
  return meshes;
}

// Frost / ice: pale blue-white, rough, with sparkle; for frozen memorials and the wreck.
export function iceMaterial() {
  const m = new THREE.MeshPhysicalMaterial({ color: 0xcfe4f2, roughness: 0.25, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.15, envMapIntensity: 1.4, emissive: new THREE.Color(0.02, 0.05, 0.08) });
  m.name = 'ice';
  return m;
}

// A floating holo label that faces the camera.
export function holoLabel(ctx, text, x, y, z, w = 3.2, tint = [0.8, 0.95, 1.1]) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.16), createHoloMaterial(HOLO_ART.sign(text), { bright: 2.8, alpha: 0.9, tint, time: ctx.time }));
  m.position.set(x, y, z); m.layers.enable(REFLECT_LAYER); ctx.scene.add(m); faceCamera(ctx, m);
  return m;
}

export function crateStack(ctx, x, z, rot = 0, n = 2, s = 1.1) {
  const { batch, M, col } = ctx;
  for (let k = 0; k < n; k++) {
    batch.put(box(1.2 * s, 1.0 * s, 1.2 * s), M.crate, V(x, 0.5 * s + k * s, z), rot + k * 0.2, null, { color: new THREE.Color(0.55, 0.58, 0.6) });
    batch.put(box(1.24 * s, 0.08, 1.24 * s), M.darkMetal, V(x, 0.9 * s + k * s, z), rot + k * 0.2, null, { cast: false });
  }
  col.box(x, z, 0.65 * s, 0.65 * s, rot, 'crate');
}
