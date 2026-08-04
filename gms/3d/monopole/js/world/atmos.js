// The medium. One system for every scene: distance fog, the additive dust cards that hang in it,
// and the haze banks that sit between two depth layers. Vacuum drawn as literally empty loses
// Atmosphere, Scale and Energy at once — a beam with nothing to scatter in cannot bloom.
//
// Fog is aerial perspective (contrast toward the fog hue with distance). Cards are the part fog
// cannot do: a finite bank of lit dust *between* two objects, so the far one loses its blacks and
// the near one keeps them. Both are tuned per scene off the same knobs.

import * as THREE from 'three';
import { track, untrack } from '../engine/budget.js';
import { system } from './palettes.js';
import { fxDensity, cardBucket } from './fx.js';

const A = { density: 1, size: 1, power: 1, fogHue: 0.4, fogLevel: 1, fogDesat: 0 };
const MATS = [];

const sys = system('tamber');
let fog = null;
let puff = null;

const rnd = s => () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;

// aCorner carries the quad corner, so one merged buffer is one draw call for every card in the
// scene. The billboard is built in view space — no per-frame quaternion copy, no sorting.
const CARD_VERT = `
attribute vec3 aCenter;
attribute vec2 aCorner;
attribute vec2 aSize;
attribute vec2 aCell;
attribute vec3 aCol;
attribute float aRot;
varying vec2 vUv;
varying vec3 vCol;
varying float vFade;
uniform float uSize;
void main(){
  vec4 mv = modelViewMatrix * vec4(aCenter, 1.0);
  float c = cos(aRot), s = sin(aRot);
  vec2 q = aCorner * aSize * uSize;
  mv.xy += vec2(q.x * c - q.y * s, q.x * s + q.y * c);
  vUv = (aCorner + 0.5) * 0.5 + aCell;
  vCol = aCol;
  // a card the camera is inside of fills the frame with one flat colour; fade it out over its
  // own radius instead
  vFade = smoothstep(aSize.y * 0.12, aSize.y * 0.55, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;

const CARD_FRAG = `
precision mediump float;
varying vec2 vUv;
varying vec3 vCol;
varying float vFade;
uniform sampler2D uMap;
uniform float uPower;
void main(){
  float a = texture2D(uMap, vUv).r * vFade;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vCol * a * uPower, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// four variants in a 2×2 atlas: two round puffs, one drawn-out wisp, one broad soft bank
function puffAtlas(N = 256) {
  const H = N >> 1;
  const buf = new Uint8Array(N * N);
  const hash = (x, y, s) => {
    let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 2246822519);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const vn = (x, y, s) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    let fx = x - xi, fy = y - yi;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
    const t = a + (b - a) * fx;
    return t + ((c + (d - c) * fx) - t) * fy;
  };
  const fbm = (x, y, s, oct) => {
    let v = 0, amp = 0.5;
    for (let i = 0; i < oct; i++) { v += amp * vn(x, y, s + i); x *= 2.07; y *= 2.07; amp *= 0.5; }
    return v;
  };
  // sRGB encoding lifts a low linear value a long way, so a falloff that looks generous in the
  // numbers renders as a flat disc with a rim. These exponents are steep on purpose.
  const SPEC = [
    { fall: 4.6, freq: 0.055, warp: 0.9, ax: 1.0, cut: 0.30 },
    { fall: 6.0, freq: 0.10, warp: 1.3, ax: 1.0, cut: 0.34 },
    { fall: 3.6, freq: 0.045, warp: 1.8, ax: 0.42, cut: 0.26 },
    { fall: 2.8, freq: 0.030, warp: 0.6, ax: 1.0, cut: 0.16 },
  ];
  for (let v = 0; v < 4; v++) {
    const s = SPEC[v], ox = (v % 2) * H, oy = (v >> 1) * H;
    for (let j = 0; j < H; j++) {
      for (let i = 0; i < H; i++) {
        const dx = (i / H - 0.5) * 2, dy = (j / H - 0.5) * 2 / s.ax;
        const wx = fbm(i * s.freq * 0.5, j * s.freq * 0.5, v * 17, 2) - 0.5;
        const r = Math.min(1, Math.hypot(dx + wx * s.warp * 0.5, dy) );
        let a = Math.max(0, 1 - r) ** s.fall;
        a *= 0.20 + 1.35 * fbm(i * s.freq, j * s.freq, v * 31 + 3, 4);
        a = Math.max(0, a - s.cut * a * (1 - a));
        buf[(oy + j) * N + ox + i] = Math.round(255 * Math.max(0, Math.min(1, a)));
      }
    }
  }
  const t = new THREE.DataTexture(buf, N, N, THREE.RedFormat, THREE.UnsignedByteType);
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  track(t, { w: N, h: N, fmt: 'r', label: 'atmos puff atlas' });
  return t;
}

const CELL = [[0, 0], [0.5, 0], [0, 0.5], [0.5, 0.5]];

// layers: [{ count, center:[x,y,z], size:[w,h,d], scale:[min,max], aspect, color, power, variant }]
// One mesh for the whole set whatever the layer count. Counts ride fxDensity and atmosDensity, so
// the fill-rate risk this project has been managing all along has one place to turn it down.
export function atmosphere({ seed = 1, layers = [] } = {}) {
  const grp = new THREE.Group();
  grp.name = 'atmos';
  const R = rnd(0x71c3 + seed * 2654435761);
  const pos = [], corner = [], size = [], cell = [], col = [], rot = [];
  const C = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
  const c = new THREE.Color();

  for (const L of layers) {
    const n = Math.max(0, Math.round((L.count ?? 20) * A.density * fxDensity()));
    if (!n) continue;
    const [cx, cy, cz] = L.center || [0, 0, 0];
    const [sx, sy, sz] = L.size || [200, 100, 200];
    const [s0, s1] = L.scale || [40, 120];
    const asp = L.aspect ?? 1;
    const pw = L.power ?? 1;
    c.set(L.color || '#c8b79a').convertSRGBToLinear();
    for (let i = 0; i < n; i++) {
      const px = cx + (R() - 0.5) * sx, py = cy + (R() - 0.5) * sy, pz = cz + (R() - 0.5) * sz;
      const s = s0 + (s1 - s0) * R() ** 1.5;
      const v = L.variant ?? (R() < 0.30 ? 2 : R() < 0.5 ? 3 : R() < 0.75 ? 0 : 1);
      // brightness spread, not one value: a card field at one level reads as a screen filter
      const m = pw * (0.20 + 0.80 * R() ** 1.8);
      const a = R() * Math.PI * 2;
      for (const [ux, uy] of C) {
        pos.push(px, py, pz);
        corner.push(ux, uy);
        size.push(s * asp, s);
        cell.push(CELL[v][0], CELL[v][1]);
        col.push(c.r * m, c.g * m, c.b * m);
        rot.push(a);
      }
    }
  }
  if (!pos.length) return grp;

  if (!puff) puff = puffAtlas();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(pos.length), 3));
  g.setAttribute('aCenter', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aCorner', new THREE.Float32BufferAttribute(corner, 2));
  g.setAttribute('aSize', new THREE.Float32BufferAttribute(size, 2));
  g.setAttribute('aCell', new THREE.Float32BufferAttribute(cell, 2));
  g.setAttribute('aCol', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aRot', new THREE.Float32BufferAttribute(rot, 1));

  const m = new THREE.ShaderMaterial({
    uniforms: { uMap: { value: puff }, uPower: { value: A.power }, uSize: { value: A.size } },
    vertexShader: CARD_VERT, fragmentShader: CARD_FRAG,
    blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false,
  });
  m.userData.kind = 'card';
  MATS.push(m);
  cardBucket().push(m);

  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false;
  mesh.renderOrder = 15;
  grp.add(mesh);
  return grp;
}

export function registerAtmosKnobs(q, app) {
  const G = 'Atmosphere';
  fog = new THREE.FogExp2(new THREE.Color(sys.fog), 0.00006);
  app.scene.fog = fog;

  q.register({ key: 'fogDensity', label: 'Haze density', type: 'range', min: 0, max: 0.006, step: 0.00002, default: 0.00006, group: G },
    v => { fog.density = v; });
  // 0 = the system's cool haze, 1 = the nebula's warm band. Belt shots want the warm end,
  // anything backlit by the star wants it warmer still or the far layers read as a blue filter.
  q.register({ key: 'fogTint', label: 'Haze hue', type: 'range', min: 0, max: 1, step: 0.02, default: 0.4, group: G },
    v => { A.fogHue = v; setFog(); });
  // both palette hues are saturated, so the lerp between them never passes through a neutral —
  // and a belt plate's medium is a warm *grey*. This pulls the mix toward its own luminance.
  q.register({ key: 'fogDesat', label: 'Haze desaturation', type: 'range', min: 0, max: 1, step: 0.01, default: 0, group: G },
    v => { A.fogDesat = v; setFog(); });
  // both palette hues are bright, so a scene whose backdrop is dark gets *lighter* with distance —
  // far rocks come out as pale blobs instead of fading into the field. This matches the haze to
  // what is actually behind it.
  q.register({ key: 'fogLevel', label: 'Haze brightness', type: 'range', min: 0, max: 1.5, step: 0.01, default: 1, group: G },
    v => { A.fogLevel = v; setFog(); });

  q.register({ key: 'atmosDensity', label: 'Dust cards (rebuild)', type: 'range', min: 0, max: 2, step: 0.05, default: 1, group: G },
    v => { A.density = v; });
  q.register({ key: 'atmosSize', label: 'Dust card size', type: 'range', min: 0.2, max: 3, step: 0.02, default: 1, group: G },
    v => { A.size = v; for (const m of MATS) m.uniforms.uSize.value = v; });
  q.register({ key: 'atmosPower', label: 'Dust card brightness', type: 'range', min: 0, max: 3, step: 0.02, default: 1, group: G },
    v => { A.power = v; for (const m of MATS) m.uniforms.uPower.value = v; });
}

function setFog() {
  if (!fog) return;
  const c = fog.color.set(sys.cool).lerp(new THREE.Color(sys.mid), A.fogHue);
  const lum = c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722;
  c.lerp(new THREE.Color(lum * 1.12, lum, lum * 0.86), A.fogDesat).multiplyScalar(A.fogLevel);
}

export function disposeAtmos() {
  if (puff) { untrack(puff); puff.dispose(); puff = null; }
  MATS.length = 0;
}
