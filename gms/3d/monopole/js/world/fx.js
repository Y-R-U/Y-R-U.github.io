// Mining beams, engine trails, motes and debris. Every material here is additive with
// depthWrite off, and one knob — fxDensity — scales every particle count in the game together.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { getMaterial } from './materials.js';

const FX = { density: 1, beam: 1, width: 1, dust: 1, trail: 1, mote: 1 };
const BEAM_MATS = [];
const TRAIL_MATS = [];
const MOTE_MATS = [];
const CARD_MATS = [];

export const fxDensity = () => FX.density;

const V2 = new THREE.Vector2();
const rnd = s => () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;

// gl_PointSize is a screen measure, so the perspective divide has to be done by hand or the
// motes stay the same size at every distance and read as a screen-space filter.
const POINT_VERT = `
attribute float aSize;
attribute vec3 aCol;
varying vec3 vCol;
uniform float uViewH, uScale, uMax;
void main(){
  vCol = aCol;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float s = aSize * uScale * projectionMatrix[1][1] * uViewH * 0.5 / max(0.001, -mv.z);
  gl_PointSize = clamp(s, 1.0, uMax);
  gl_Position = projectionMatrix * mv;
}`;

const POINT_FRAG = `
varying vec3 vCol;
uniform float uSoft, uPower;
void main(){
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = pow(max(0.0, 1.0 - d), uSoft);
  if (a < 0.002) discard;
  gl_FragColor = vec4(vCol * a * uPower, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// AdditiveBlending is (srcAlpha, one), so the alpha channel is not free — everything here
// premultiplies its falloff into rgb and writes alpha 1.
function additive(mat) {
  mat.blending = THREE.AdditiveBlending;
  mat.transparent = true;
  mat.depthWrite = false;
  mat.fog = false;
  return mat;
}

export function softPoints(pos, col, size, { soft = 2.2, power = 1, max = 200, bucket = MOTE_MATS } = {}) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aCol', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aSize', new THREE.Float32BufferAttribute(size, 1));
  const m = additive(new THREE.ShaderMaterial({
    uniforms: { uViewH: { value: 720 }, uScale: { value: 1 }, uMax: { value: max },
      uSoft: { value: soft }, uPower: { value: power } },
    vertexShader: POINT_VERT, fragmentShader: POINT_FRAG,
    depthTest: true,
  }));
  m.userData.basePower = power;
  bucket.push(m);
  const p = new THREE.Points(g, m);
  p.frustumCulled = false;
  p.onBeforeRender = r => { m.uniforms.uViewH.value = r.getDrawingBufferSize(V2).y; };
  return p;
}

// ── beams ────────────────────────────────────────────────────────────────────

const OFF = [-1, -0.42, 0, 0.42, 1];
const FADE = [0, 0.52, 1, 0.52, 0];

// A quad strip across the beam with the colour falling to zero at both edges. Two of these at
// right angles read as a round beam from any bearing and cost no per-frame work.
function ribbon(a, b, r0, r1, axis, cA, cB) {
  const pos = [], col = [];
  const p = (t, i) => {
    const s = t ? r1 : r0, o = t ? b : a, c = t ? cB : cA, k = FADE[i];
    return [o.x + axis.x * OFF[i] * s, o.y + axis.y * OFF[i] * s, o.z + axis.z * OFF[i] * s,
      c.r * k, c.g * k, c.b * k];
  };
  for (let i = 0; i < 4; i++) {
    const q = [p(0, i), p(1, i), p(1, i + 1), p(0, i + 1)];
    for (const k of [0, 1, 2, 0, 2, 3]) {
      pos.push(q[k][0], q[k][1], q[k][2]);
      col.push(q[k][3], q[k][4], q[k][5]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

function crossAxes(dir) {
  const up = Math.abs(dir.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const a1 = new THREE.Vector3().crossVectors(dir, up).normalize();
  const a2 = new THREE.Vector3().crossVectors(dir, a1).normalize();
  return [a1, a2];
}

// list: [{ from, to, color? }]. The whole set is two draw calls — one mesh for the cores, the
// glow sheaths and the dust cones, one Points for the muzzle and impact flares.
export function beams(list, { color = '#8df0c8', width = 0.55, glow = 1, dust = 1,
  impact = 1, ejecta = 14, ejectaColor = '#ffcf96' } = {}) {
  const grp = new THREE.Group();
  grp.name = 'beams';
  const geos = [];
  const fp = [], fc = [], fs = [];
  const base = new THREE.Color(color).convertSRGBToLinear();
  const hot = base.clone().lerp(new THREE.Color(1, 1, 1), 0.72);
  const ej = new THREE.Color(ejectaColor).convertSRGBToLinear();
  const R = rnd(0x4d13 + list.length * 2654435761);

  for (const b of list) {
    const from = new THREE.Vector3(...(Array.isArray(b.from) ? b.from : b.from.toArray()));
    const to = new THREE.Vector3(...(Array.isArray(b.to) ? b.to : b.to.toArray()));
    const hue = b.color ? new THREE.Color(b.color).convertSRGBToLinear() : base;
    const core = b.color ? hue.clone().lerp(new THREE.Color(1, 1, 1), 0.72) : hot;
    const dir = new THREE.Vector3().subVectors(to, from).normalize();
    const [a1, a2] = crossAxes(dir);
    const w = width * FX.width;

    // sRGB encoding lifts a low linear value a long way — 0.14 linear is a 0.41 pixel — so a
    // sheath that looks conservative in the numbers renders as a solid bar the width of itself
    const cCore = core.clone().multiplyScalar(2.2 * glow);
    const cSheath = hue.clone().multiplyScalar(0.055 * glow);
    const cDustA = hue.clone().lerp(new THREE.Color(1, 0.94, 0.82), 0.6).multiplyScalar(0.05 * dust * FX.dust);
    const cDustB = cDustA.clone().multiplyScalar(0.28);

    // the core loses width and energy down its length, so the far end is not the same bar of
    // pixels as the near one — the impact puts the energy back where the rock is
    const cFar = cCore.clone().multiplyScalar(0.42);
    for (const ax of [a1, a2]) {
      geos.push(ribbon(from, to, w * 1.15, w * 0.72, ax, cCore, cFar));
      geos.push(ribbon(from, to, w * 5.0, w * 3.4, ax, cSheath, cSheath.clone().multiplyScalar(0.5)));
      if (FX.dust > 0.001 && dust > 0.001) geos.push(ribbon(from, to, w * 3, w * 52, ax, cDustA, cDustB));
    }

    const flares = [
      [from, w * 9, core.clone().multiplyScalar(1.6 * glow)],
      [from, w * 3.5, new THREE.Color(1, 1, 1).multiplyScalar(2.4 * glow)],
    ];

    // the impact: a hot bloom on the rock, a cone of lit dust thrown back up the beam, and
    // ejecta streaking off it. Without this the beam simply stops in mid air.
    if (impact > 0.001) {
      const back = dir.clone().multiplyScalar(-1);
      const L = w * 26 * impact;
      const cSpray = ej.clone().multiplyScalar(0.16 * impact * dust * FX.dust);
      for (const ax of [a1, a2]) {
        geos.push(ribbon(to, to.clone().addScaledVector(back, L), w * 1.2, w * 12 * impact, ax,
          cSpray, new THREE.Color(0, 0, 0)));
      }
      const n = Math.max(0, Math.round(ejecta * FX.density));
      for (let i = 0; i < n; i++) {
        // spray in the plane across the beam with a backward lean. Seeded on a sphere the half
        // that points at the camera foreshortens to nothing and the impact reads as one dot.
        const a = R() * Math.PI * 2;
        const v = a1.clone().multiplyScalar(Math.cos(a)).addScaledVector(a2, Math.sin(a))
          .addScaledVector(back, 0.20 + 0.55 * R()).normalize();
        const len = w * (10 + 46 * R() ** 2) * impact;
        const tip = to.clone().addScaledVector(v, len);
        const [e1] = crossAxes(v);
        const cHot = ej.clone().multiplyScalar((0.35 + 1.5 * R() ** 2) * impact * glow);
        geos.push(ribbon(to, tip, w * 0.55, w * 0.10, e1, cHot, new THREE.Color(0, 0, 0)));
      }
      flares.push(
        [to, w * 46 * impact, ej.clone().multiplyScalar(0.30 * impact * glow)],
        [to, w * 20 * impact, ej.clone().multiplyScalar(0.95 * impact * glow)],
        [to, w * 9 * impact, hue.clone().lerp(ej, 0.5).multiplyScalar(2.2 * impact * glow)],
        [to, w * 3.6 * impact, new THREE.Color(1, 1, 1).multiplyScalar(4.0 * impact * glow)]);
    } else {
      flares.push([to, w * 14, hue.clone().multiplyScalar(1.2 * glow)],
        [to, w * 5, core.clone().multiplyScalar(2.0 * glow)]);
    }

    for (const [p, s, c] of flares) {
      fp.push(p.x, p.y, p.z); fc.push(c.r, c.g, c.b); fs.push(s);
    }
  }

  if (geos.length) {
    const m = additive(new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    m.userData.kind = 'beam';
    m.color.setScalar(FX.beam);
    BEAM_MATS.push(m);
    const mesh = new THREE.Mesh(mergeGeometries(geos, false), m);
    mesh.renderOrder = 20;
    mesh.frustumCulled = false;
    grp.add(mesh);
    for (const g of geos) g.dispose();
  }
  if (fp.length) {
    const f = softPoints(fp, fc, fs, { soft: 2.6, power: FX.beam, max: 420, bucket: BEAM_MATS });
    f.renderOrder = 21;
    grp.add(f);
  }
  return grp;
}

// ── engine trails ────────────────────────────────────────────────────────────

// The ship kit leaves an empty Object3D at every nozzle. Forward is −Z, so the plume runs +Z.
export function engineTrails(ship, { color = '#ffbe6a', length = 1, width = 1, power = 1 } = {}) {
  const anchors = ship.userData?.trails || [];
  if (!anchors.length) return null;
  const L = (ship.userData.length || 60) * 0.55 * length;
  const hue = new THREE.Color(color).convertSRGBToLinear();
  const geos = [];
  const fp = [], fc = [], fs = [];

  for (const a of anchors) {
    const from = a.position.clone();
    const to = from.clone().add(new THREE.Vector3(0, 0, L));
    const w = Math.max(0.35, (ship.userData.length || 60) * 0.012 * width);
    const [x1, x2] = crossAxes(new THREE.Vector3(0, 0, 1));
    const cA = hue.clone().lerp(new THREE.Color(1, 1, 1), 0.3).multiplyScalar(0.26 * power);
    const cB = new THREE.Color(0, 0, 0);
    for (const ax of [x1, x2]) {
      geos.push(ribbon(from, to, w * 0.7, w * 2.6, ax, cA, cB));
      geos.push(ribbon(from, from.clone().add(new THREE.Vector3(0, 0, L * 0.3)), w * 1.6, w * 2.4, ax,
        hue.clone().multiplyScalar(0.16 * power), cB));
    }
    fp.push(from.x, from.y, from.z + w * 0.5);
    fc.push(cA.r * 1.6, cA.g * 1.6, cA.b * 1.6);
    fs.push(w * 3.6);
  }

  const grp = new THREE.Group();
  grp.name = 'trails';
  const m = additive(new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  m.userData.kind = 'trail';
  m.color.setScalar(FX.trail);
  TRAIL_MATS.push(m);
  const mesh = new THREE.Mesh(mergeGeometries(geos, false), m);
  mesh.renderOrder = 12;
  grp.add(mesh);
  for (const g of geos) g.dispose();
  grp.add(softPoints(fp, fc, fs, { soft: 2.2, power: FX.trail, max: 240, bucket: TRAIL_MATS }));
  ship.add(grp);
  return grp;
}

// ── motes and debris ─────────────────────────────────────────────────────────

// Lit specks between the camera and the subject. `toward` biases the cloud so it reads as
// drifting past rather than as an evenly seeded box.
export function motes({ count = 400, radius = 90, spread = [1, 0.55, 1], center = [0, 0, 0],
  color = '#e8d6ae', size = 0.42, seed = 7, jitter = 0.7 } = {}) {
  const n = Math.max(0, Math.round(count * FX.density));
  if (!n) return new THREE.Group();
  const R = rnd(0x51ed + seed * 2654435761);
  const c = new THREE.Color(color).convertSRGBToLinear();
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), sz = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const u = R() * 2 - 1, a = R() * Math.PI * 2, s = Math.sqrt(1 - u * u);
    const r = radius * Math.cbrt(R());
    pos[i * 3] = center[0] + r * s * Math.cos(a) * spread[0];
    pos[i * 3 + 1] = center[1] + r * u * spread[1];
    pos[i * 3 + 2] = center[2] + r * s * Math.sin(a) * spread[2];
    // brightness spread, not one value: a mote field at one level reads as grain
    const m = (0.12 + 0.88 * R() ** 2.4) * (1 - jitter + jitter * R());
    col[i * 3] = c.r * m; col[i * 3 + 1] = c.g * m; col[i * 3 + 2] = c.b * m;
    sz[i] = size * (0.35 + 1.5 * R() ** 2);
  }
  const p = softPoints(pos, col, sz, { soft: 1.8, power: FX.mote, max: 22 });
  p.renderOrder = 14;
  return p;
}

// Tumbling chips. Lit, not additive — they are the one thing in here that reads as solid, and
// that is what sells the motes around them as light rather than as sprites.
export function debris({ count = 60, radius = 120, spread = [1, 0.5, 1], center = [0, 0, 0],
  size = 0.8, seed = 3, palette = 'reach' } = {}) {
  const n = Math.max(0, Math.round(count * FX.density));
  if (!n) return new THREE.Group();
  const R = rnd(0x2b19 + seed * 40503);
  const g = new THREE.TetrahedronGeometry(1, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    p.setXYZ(i, p.getX(i) * (0.6 + 0.8 * R()), p.getY(i) * (0.6 + 0.8 * R()), p.getZ(i) * (0.6 + 0.8 * R()));
  }
  g.computeVertexNormals();
  const mesh = new THREE.InstancedMesh(g, getMaterial(palette, 'rock'), n);
  // the geometry's bounding sphere is one 1 m chip; without this the whole cloud vanishes as
  // soon as the origin chip leaves frame
  mesh.frustumCulled = false;
  const M = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const u = R() * 2 - 1, a = R() * Math.PI * 2, st = Math.sqrt(1 - u * u);
    const r = radius * Math.cbrt(R());
    v.set(center[0] + r * st * Math.cos(a) * spread[0], center[1] + r * u * spread[1], center[2] + r * st * Math.sin(a) * spread[2]);
    const k = size * (0.4 + 1.4 * R() ** 2);
    s.set(k, k * (0.6 + 0.7 * R()), k * (0.6 + 0.7 * R()));
    q.setFromEuler(e.set(R() * 6.28, R() * 6.28, R() * 6.28));
    mesh.setMatrixAt(i, M.compose(v, q, s));
  }
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

export function registerFxKnobs(q) {
  const G = 'FX';
  // build-time: anything already in the scene keeps the count it was built with
  q.register({ key: 'fxDensity', label: 'Particle density (rebuild)', type: 'range', min: 0, max: 2, step: 0.05, default: 1, group: G },
    v => { FX.density = v; });
  q.register({ key: 'beamGlow', label: 'Mining beam', type: 'range', min: 0, max: 4, step: 0.02, default: 1, group: G },
    v => { FX.beam = v; for (const m of BEAM_MATS) setPower(m, v); });
  q.register({ key: 'beamWidth', label: 'Beam width (rebuild)', type: 'range', min: 0.2, max: 4, step: 0.05, default: 1, group: G },
    v => { FX.width = v; });
  q.register({ key: 'beamDust', label: 'Beam dust cone (rebuild)', type: 'range', min: 0, max: 3, step: 0.05, default: 1, group: G },
    v => { FX.dust = v; });
  q.register({ key: 'trailPower', label: 'Engine trail', type: 'range', min: 0, max: 3, step: 0.02, default: 1, group: G },
    v => { FX.trail = v; for (const m of TRAIL_MATS) setPower(m, v); });
  q.register({ key: 'motePower', label: 'Motes', type: 'range', min: 0, max: 3, step: 0.02, default: 1, group: G },
    v => { FX.mote = v; for (const m of MOTE_MATS) setPower(m, v); });
  q.register({ key: 'cardPower', label: 'Dust cards', type: 'range', min: 0, max: 3, step: 0.02, default: 1, group: G },
    v => { for (const m of CARD_MATS) setPower(m, v); });
}

function setPower(m, v) {
  if (m.uniforms) m.uniforms.uPower.value = v;
  else m.color.setScalar(v);
}

export const cardBucket = () => CARD_MATS;
