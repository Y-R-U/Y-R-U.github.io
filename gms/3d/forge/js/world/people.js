// Robed figures. A faceted fold-prism shared by the crowd and the player, tinted per zone,
// with the cloth driven entirely in the vertex shader off an instance-id offset.

import * as THREE from 'three';
import { ZONE_IDS, zone } from './zones.js';
import { getMaterial } from './materials.js';
import { rng, span } from './details.js';
import { heightAt, waterY, creekZ, CENTERS, nearCamera } from './terrain.js';
import { defineScenario, frameCamera } from '../scenarios.js';

const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);
const SEG = 10;
const HSEG = 8;
const SHOULDER = 1.22;

const hemAmp = y => Math.pow(Math.max(0, (SHOULDER - y) / SHOULDER), 1.5);
const hash = n => { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); };

// Darker means cooler: the red channel falls away faster than the blue.
const tone = s => [s * (0.86 + 0.14 * s), s * (0.93 + 0.07 * s), s];

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
function faceNormal(a, b, c) {
  _a.fromArray(a.p); _b.fromArray(b.p).sub(_a); _c.fromArray(c.p).sub(_a);
  _b.cross(_c).normalize();
  return [_b.x, _b.y, _b.z];
}

const NO_EYE = [0, 0, 0];

class Build {
  constructor() { this.p = []; this.n = []; this.c = []; this.k = []; this.e = []; this.tris = 0; }
  vert(v, n) {
    this.p.push(v.p[0], v.p[1], v.p[2]);
    const q = n || v.n;
    this.n.push(q[0], q[1], q[2]);
    this.c.push(v.c[0], v.c[1], v.c[2]);
    this.k.push(v.k);
    const e = v.e || NO_EYE;
    this.e.push(e[0], e[1], e[2]);
  }
  tri(a, b, c) { this.vert(a); this.vert(b); this.vert(c); this.tris++; }
  quad(a, b, c, d) { this.tri(a, b, c); this.tri(a, c, d); }
  flatTri(a, b, c) { const n = faceNormal(a, b, c); this.vert(a, n); this.vert(b, n); this.vert(c, n); this.tris++; }
  flatQuad(a, b, c, d) { this.flatTri(a, b, c); this.flatTri(a, c, d); }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('aCloth', new THREE.Float32BufferAttribute(this.k, 1));
    g.setAttribute('aEye', new THREE.Float32BufferAttribute(this.e, 3));
    return g;
  }
}

// hem / shin / knee / waist / neck. `sh` is baked ambient occlusion, not lighting: dark at the
// ground, dark in the waist pinch, dark again where the cowl overhangs. `f` is the fold depth, so
// the waist creases tight and the hem swings loose. The shoulder flare is the hood's mantle ring,
// not a robe ring — the neck ring is narrow and lives entirely inside the cowl.
const ROBE = [
  { y: 0.00, r: 0.402, sh: 0.36, f: 0.155 },
  { y: 0.31, r: 0.302, sh: 0.72, f: 0.138 },
  { y: 0.67, r: 0.270, sh: 0.86, f: 0.122 },
  { y: 0.98, r: 0.216, sh: 0.62, f: 0.088 },
  { y: 1.22, r: 0.182, sh: 0.74, f: 0.070 },
];

// Alternating radial push (cos at half the segment count hits ±1 exactly on every vertex),
// phase-rotated per ring so the fold lines wander down the body instead of running vertical.
// The 2- and 3-lobe terms stop the outline being a regular polygon and scallop the hem.
function robeVert(i, j, seed) {
  const R = ROBE[i];
  const a = (((j % SEG) + SEG) % SEG) / SEG * TAU;
  const ph = seed + i * 0.66;
  const fold = Math.cos(SEG * 0.5 * a + ph) * R.f
             + Math.cos(a * 2 + ph * 1.7) * 0.040
             + Math.cos(a * 3 - ph * 0.8) * 0.030;
  const fn = fold / (R.f + 0.07);
  const r = R.r * (1 + fold);
  const y = i === 0
    ? -0.045 - 0.085 * fn + 0.05 * (hash(j * 3.7 + seed * 11) - 0.5)
    : R.y;
  return {
    p: [r * Math.cos(a), y, r * Math.sin(a)],
    n: [Math.cos(a), i === 0 ? -0.06 : 0.18, Math.sin(a)],
    c: tone(R.sh * (1 + 0.18 * fn - 0.07 * Math.abs(fn))),
    k: hemAmp(R.y),
  };
}

function robe(B, seed) {
  const v = (i, j) => robeVert(i, j, seed);
  for (let i = 0; i < ROBE.length - 1; i++) {
    for (let j = 0; j < SEG; j++) B.flatQuad(v(i, j), v(i + 1, j), v(i + 1, j + 1), v(i, j + 1));
  }
  const hub = { p: [0, -0.20, 0], n: [0, -1, 0], c: tone(0.12), k: 1 };
  for (let j = 0; j < SEG; j++) B.flatTri(v(0, j), v(0, j + 1), hub);
}

// mantle / chin / eye / brow, then a point. The mantle is the figure's shoulder line — it flares
// 28% past the waist and swallows the robe's narrow neck ring whole. The brow ring stays wide and
// the apex is only 12 cm above it and 14 cm behind, so the top is a cowl flopped backwards rather
// than the mitre round 3 had.
const HOOD = [
  { y: 1.120, r: 0.276, sh: 0.60, ny: -0.34, dz: 0.010, dx: 0.000 },
  { y: 1.298, r: 0.234, sh: 0.66, ny: -0.05, dz: 0.030, dx: 0.006 },
  { y: 1.418, r: 0.226, sh: 0.76, ny: 0.10, dz: 0.026, dx: 0.012 },
  { y: 1.530, r: 0.196, sh: 0.92, ny: 0.40, dz: -0.020, dx: 0.020 },
];
const APEX = [0.034, 1.652, -0.158];

// The opening spans two whole bands of one 45° column. The half-segment offset in the ring puts the
// seam between columns 1 and 2 dead on +z, so columns MOUTH and MOUTH+1 straddle the front.
// `wx` narrows the mouth at chin and brow and leaves it wide at eye level — a vertical almond, not
// a letterbox — and `dy` pinches its top and bottom in towards each other.
const MOUTH = 1;
const LIP = [null, { wx: 0.34, dy: 0.030, wz: 0.96 }, { wx: 0.70, dy: 0, wz: 0.92 },
  { wx: 0.38, dy: -0.034, wz: 0.98 }];
const RIM = 0.034;       // how far the fabric edge folds back into the hood before the cavity starts
const CAVITY = 0.175;    // mouth centre to the black point at the back of the hood
const SKY = [1.0, 1.0, 0.56, 0.22, 0.22, 0.56];   // skylight reaching each rim vertex, chin to brow

function hood(B, seed, cav, eyes) {
  const rings = HOOD.map((R, i) => {
    const out = [];
    for (let j = 0; j < HSEG; j++) {
      const a = (j + 0.5) / HSEG * TAU;
      const co = Math.cos(a), si = Math.sin(a);
      const fold = Math.cos(a * 3 + seed * 2.3 + i * 0.5) * 0.05;
      const L = (j === MOUTH || j === MOUTH + 1) ? LIP[i] : null;
      const r = R.r * (1 + fold);
      out.push({
        p: [r * co * (L ? L.wx : 1) + R.dx, R.y + (L ? L.dy : 0), r * si * (L ? L.wz : 1) + R.dz],
        n: [co, R.ny, si],
        c: tone(R.sh * (1 + 1.5 * fold) * (L ? 0.86 : 1)),
        k: 0,
      });
    }
    return out;
  });
  const apex = { p: APEX, n: [0, 1, 0], c: tone(1.0), k: 0 };
  const under = { p: [0, HOOD[0].y, 0], n: [0, -1, 0], c: tone(0.10), k: 0 };
  const top = rings.length - 1;

  for (let i = 0; i < top; i++) {
    for (let j = 0; j < HSEG; j++) {
      if ((i === 1 || i === 2) && j === MOUTH) continue;
      B.flatQuad(rings[i][j], rings[i + 1][j], rings[i + 1][(j + 1) % HSEG], rings[i][(j + 1) % HSEG]);
    }
  }
  for (let j = 0; j < HSEG; j++) {
    B.flatTri(rings[top][j], apex, rings[top][(j + 1) % HSEG]);
    B.flatTri(rings[0][j], rings[0][(j + 1) % HSEG], under);
  }

  // Rim then cavity. The rim is a band of fabric folded back into the hood, so the opening has a
  // visible edge thickness; the cavity behind it runs from the zone's interior colour at the mouth
  // to near-black at a single point inside the skull. A flat fill here is what made round 3's face
  // read as a decal — the darkness has to come from a gradient the eye can follow inwards.
  const loop = [rings[1][MOUTH], rings[1][MOUTH + 1], rings[2][MOUTH + 1],
    rings[3][MOUTH + 1], rings[3][MOUTH], rings[2][MOUTH]];
  const C = [0, 1, 2].map(k => loop.reduce((s, v) => s + v.p[k], 0) / 6);
  const o = new THREE.Vector3().fromArray(loop[0].p);
  const inw = new THREE.Vector3().crossVectors(
    new THREE.Vector3().fromArray(loop[2].p).sub(o),
    new THREE.Vector3().fromArray(loop[4].p).sub(o)).normalize();

  const step = (v, d) => [C[0] + (v.p[0] - C[0]) * 0.72 + inw.x * d,
    C[1] + (v.p[1] - C[1]) * 0.72 + inw.y * d, C[2] + (v.p[2] - C[2]) * 0.72 + inw.z * d];
  const lip = loop.map((v, k) => {
    const f = 0.13 + 0.17 * SKY[k];
    return { p: v.p, n: v.n, k: 0, c: [v.c[0] * f, v.c[1] * f, v.c[2] * f] };
  });
  const in3 = loop.map((v, k) => ({ p: step(v, RIM), n: v.n, k: 0, c: cav(SKY[k]) }));
  const back = { p: [C[0] + inw.x * CAVITY, C[1] + inw.y * CAVITY, C[2] + inw.z * CAVITY],
    n: [-inw.x, -inw.y, -inw.z], c: cav(0.10), k: 0 };

  for (let k = 0; k < 6; k++) {
    const k1 = (k + 1) % 6;
    B.flatQuad(lip[k], in3[k], in3[k1], lip[k1]);
    B.flatTri(in3[k], back, in3[k1]);
  }

  if (eyes) {
    const eb = [C[0] + inw.x * 0.055, C[1] + inw.y * 0.055, C[2] + inw.z * 0.055];
    for (const s of [-1, 1]) {
      const v = (dx, dy, e) => ({ p: [eb[0] + dx * s, eb[1] + dy, eb[2]], n: [0, 0.2, 1],
        c: cav(0.5), k: 0, e });
      const t = [v(0.010, 0.004, eyes[1]), v(0.046, 0.020, eyes[1]), v(0.026, 0.034, eyes[0])];
      if (s < 0) t.reverse();
      B.flatTri(t[0], t[1], t[2]);
    }
  }
}

function tube(B, pts, radii, seg, shade, k) {
  const axis = new THREE.Vector3().subVectors(
    new THREE.Vector3(...pts[pts.length - 1]), new THREE.Vector3(...pts[0])).normalize();
  const up = Math.abs(axis.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const ex = new THREE.Vector3().crossVectors(up, axis).normalize();
  const ez = new THREE.Vector3().crossVectors(axis, ex);

  const at = (i, j) => {
    const a = (j % seg) / seg * TAU;
    const n = new THREE.Vector3().addScaledVector(ex, Math.cos(a)).addScaledVector(ez, Math.sin(a));
    const t = i / (pts.length - 1);
    return {
      p: [pts[i][0] + n.x * radii[i], pts[i][1] + n.y * radii[i], pts[i][2] + n.z * radii[i]],
      n: [n.x, n.y, n.z],
      c: tone(typeof shade === 'function' ? shade(t) : shade),
      k: typeof k === 'function' ? k(t) : k,
    };
  };
  for (let i = 0; i < pts.length - 1; i++) {
    for (let j = 0; j < seg; j++) B.quad(at(i, j), at(i, j + 1), at(i + 1, j + 1), at(i + 1, j));
  }
}

// Variant 1: a shorter, stouter build off the same rings, for nothing.
const STOUT = new THREE.Matrix4().makeScale(1.055, 0.935, 1.055);

// The cavity has to land on the zones.js colour whatever the fabric is, and vertexColors multiplies
// the material tint — so divide it back out. Every interior value is far darker than every robe, so
// the ratio never wants to exceed 1.
function cavityTone(zoneId) {
  const base = robeColor(zone(zoneId).robe);
  const inner = new THREE.Color(zone(zoneId).hood.inner);
  const ch = (a, b) => s => Math.min(1, a * s / Math.max(b, 1e-4));
  const r = ch(inner.r, base.r), g = ch(inner.g, base.g), b = ch(inner.b, base.b);
  return s => [r(s), g(s), b(s)];
}

function eyeTones(zoneId) {
  return zone(zoneId).hood.eyes.map(hex => {
    const c = new THREE.Color(hex);
    return [c.r, c.g, c.b];
  });
}

function figureGeometry(zoneId, variant) {
  const B = new Build();
  const z = zone(zoneId);
  const seed = variant ? 2.15 : 0.35;

  robe(B, seed);
  hood(B, seed, cavityTone(zoneId), eyeTones(zoneId));

  if (!variant) {
    // Sleeve starts inside the body and ends on the shaft: the three parts have to overlap or the
    // staff reads as a stick standing next to a figure rather than one held by it.
    tube(B, [[0.150, 1.085, 0.045], [0.284, 1.000, 0.086]], [0.072, 0.046], 5,
      t => 0.78 - 0.16 * t, 0);

    if (z.staff === 'pitchfork') {
      const hy = 1.74, hx = 0.246;
      tube(B, [[0.318, 0.03, 0.115], [hx, hy, 0.045]], [0.030, 0.024], 4, 0.30, 0);
      tube(B, [[hx - 0.095, hy, 0.045], [hx + 0.095, hy, 0.045]], [0.018, 0.018], 3, 0.26, 0);
      for (const d of [-0.088, 0, 0.088]) {
        tube(B, [[hx + d, hy, 0.045], [hx + d, hy + 0.21, 0.045]], [0.015, 0.004], 3, 0.26, 0);
      }
    } else {
      tube(B, [[0.318, 0.03, 0.115], [0.242, 1.86, 0.045]], [0.030, 0.023], 4, 0.30, 0);
      const dark = zoneId === 'dark';
      tube(B, [[0.242, 1.86, 0.045], [0.238, 1.86 + (dark ? 0.28 : 0.15), 0.042]],
        [dark ? 0.032 : 0.046, 0.004], 4, dark ? 0.20 : 0.78, 0);
    }
  }

  const g = B.geometry();
  if (variant) g.applyMatrix4(STOUT);
  g.userData.tris = B.tris;
  return g;
}

const PARS = `
uniform float uTime;
uniform vec4 uWind;
uniform vec4 uSelf;
uniform float uCloth;
attribute float aCloth;
attribute vec3 aEye;
varying vec3 vEye;
#ifdef USE_INSTANCING
attribute vec4 aInst;
#endif

vec3 clothOff(vec3 p, float cl, vec4 self, vec2 wind) {
  if (cl < 0.001) return vec3(0.0);
  float spd = self.y;
  float t = uTime + self.x;

  float az = atan(p.z, p.x);
  float ripple = sin(t * 4.6 + az * 2.0 - p.y * 3.4) * 0.62
               + sin(t * 2.9 - az * 3.0 + 1.7) * 0.38;
  float gust = 0.40 + 0.60 * sin(t * uWind.w) * sin(t * uWind.w * 0.41 + 2.1);
  float swing = sin(t * (5.2 + spd * 2.4) + self.z);
  vec3 out3 = normalize(vec3(p.x, 0.45, p.z - 0.001));

  vec3 o = vec3(0.0);
  o.xz += wind * (uWind.z * gust * 0.42);
  o.z -= spd * 0.26 + self.w * 0.42;
  o.x += swing * (0.034 + spd * 0.085);
  o += out3 * ripple * (0.055 + spd * 0.055);
  o.y -= abs(ripple) * 0.032;
  return o * (cl * uCloth);
}

vec2 clothWind() {
  vec2 fw;
  #ifdef USE_INSTANCING
    fw = instanceMatrix[2].xz;
  #else
    fw = vec2(modelMatrix[2].x, modelMatrix[2].z);
  #endif
  fw = normalize(fw + vec2(1e-5, 1e-5));
  return vec2(uWind.x * fw.y - uWind.y * fw.x, uWind.x * fw.x + uWind.y * fw.y);
}

vec4 clothSelf() {
  #ifdef USE_INSTANCING
    return aInst;
  #else
    return uSelf;
  #endif
}
`;

const CALC = `
  vEye = aEye;
  vec4 cSelf = clothSelf();
  vec2 cWind = clothWind();
  vec3 cOff = clothOff(position, aCloth, cSelf, cWind);
`;

// Finite difference around the body axis. Only the *change* the cloth causes is applied, so the
// authored facet normal survives — swapping in the raw cross product flattens every fold.
const NORMAL = `
  vec3 objectNormal = vec3(normal);
  ${CALC}
  vec3 cT = normalize(vec3(-position.z, 0.0, position.x) + vec3(1e-4, 0.0, 1e-4)) * 0.09;
  vec3 cB = vec3(0.0, 0.09, 0.0);
  vec3 nRef = normalize(cross(cB, cT));
  vec3 nA = normalize(cross(cB + clothOff(position + cB, aCloth, cSelf, cWind) - cOff,
                            cT + clothOff(position + cT, aCloth, cSelf, cWind) - cOff));
  objectNormal = normalize(objectNormal + (nA - nRef) * 1.2);
`;

// Wrap diffuse rolls the terminator like fabric; the fresnel band is gated on N·L so it only
// fires on the sunward silhouette edge instead of ringing the whole figure.
const FRAG = `#include <opaque_fragment>
  vec3 rN = normalize(normal);
  float rNdL = 1.0;
  #if NUM_DIR_LIGHTS > 0
    rNdL = dot(rN, directionalLights[0].direction);
    float wrapped = max(0.0, (rNdL + uWrap.x) / (1.0 + uWrap.x));
    gl_FragColor.rgb += diffuseColor.rgb * directionalLights[0].color
                      * (wrapped - max(0.0, rNdL)) * uWrap.y;
  #endif
  gl_FragColor.rgb += uShade * diffuseColor.rgb * (1.0 - clamp(rNdL, 0.0, 1.0));
  float rimF = 1.0 - clamp(dot(rN, normalize(vViewPosition)), 0.0, 1.0);
  // Every facet inside the hood is seen edge-on, so an unguarded fresnel puts a white sliver in the
  // cavity. The baked value attribute is the only thing that knows fabric from interior.
  float rimFab = smoothstep(0.12, 0.42, dot(vColor, vec3(0.3333)));
  gl_FragColor.rgb += uRimCol * pow(rimF, uRim.y) * uRim.x * clamp(rNdL * 1.8, 0.0, 1.0) * rimFab;
  gl_FragColor.rgb += vEye * uEye;`;

function patchVertex(shader, uniforms, withNormal) {
  Object.assign(shader.uniforms, uniforms);
  shader.vertexShader = PARS + shader.vertexShader;
  if (withNormal) {
    shader.vertexShader = shader.vertexShader
      .replace('#include <beginnormal_vertex>', NORMAL)
      .replace('#include <begin_vertex>', 'vec3 transformed = position + cOff;');
  } else {
    shader.vertexShader = shader.vertexShader
      .replace('#include <begin_vertex>', CALC + '\n vec3 transformed = position + cOff;');
  }
}

// zones.js tints are authored for a UI swatch, and the light one blows out under a ceiling that
// leaves the neutral one (max channel 0.61) alone. Anything above 0.61 clips only the light robe;
// anything below clips both and collapses the value gap between the two zones.
const ROBE_CEIL = 0.70;

function robeColor(hex) {
  const c = new THREE.Color(hex);
  const s = { r: 0, g: 0, b: 0 };
  c.getRGB(s, THREE.SRGBColorSpace);
  const mx = Math.max(s.r, s.g, s.b);
  if (mx > ROBE_CEIL) {
    const k = ROBE_CEIL / mx;
    c.setRGB(s.r * k, s.g * k, s.b * k, THREE.SRGBColorSpace);
  }
  return c;
}

function robeMaterial(zoneId, uniforms) {
  const m = new THREE.MeshStandardMaterial({
    color: robeColor(zone(zoneId).robe), roughness: 0.94, metalness: 0,
    vertexColors: true, name: `robe:${zoneId}`,
  });
  m.onBeforeCompile = shader => {
    patchVertex(shader, uniforms, true);
    shader.fragmentShader = 'uniform vec2 uRim;\nuniform vec3 uRimCol;\nuniform vec2 uWrap;\n'
      + 'uniform vec3 uShade;\nuniform float uEye;\nvarying vec3 vEye;\n'
      + shader.fragmentShader.replace('#include <opaque_fragment>', FRAG);
  };
  m.customProgramCacheKey = () => 'robe';
  return m;
}

function robeDepth(uniforms) {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  m.onBeforeCompile = shader => patchVertex(shader, uniforms, false);
  m.customProgramCacheKey = () => 'robeDepth';
  return m;
}

const AO_R = 0.86;
const AO_SEG = 9;
const AO_CORE = 0.46;   // the robe hides everything inside this, so the ramp has to start outside it

// Same recipe terrain.js proves works for its own ground decals: dst * (1 - srcAlpha), with the
// strength in the alpha channel. A CircleGeometry cannot do this — its only interior vertex is the
// centre, so the alpha ramps linearly from under the hem and the visible ring is nearly clear.
function aoDisc() {
  const pos = [0, 0, 0], col = [0, 0, 0, 1], idx = [];
  for (let ring = 0; ring < 2; ring++) {
    for (let j = 0; j < AO_SEG; j++) {
      const a = j / AO_SEG * TAU;
      const r = ring ? AO_R : AO_R * AO_CORE;
      pos.push(Math.cos(a) * r, 0, Math.sin(a) * r);
      col.push(0, 0, 0, ring ? 0 : 1);
    }
  }
  for (let j = 0; j < AO_SEG; j++) {
    const a = 1 + j, b = 1 + (j + 1) % AO_SEG;
    idx.push(0, b, a, a, b, 1 + AO_SEG + (j + 1) % AO_SEG, a, 1 + AO_SEG + (j + 1) % AO_SEG, 1 + AO_SEG + j);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  g.setIndex(idx);
  const m = new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, depthWrite: false, fog: false, toneMapped: false,
    blending: THREE.CustomBlending, blendSrc: THREE.ZeroFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor, blendEquation: THREE.AddEquation,
    // without these the same factors run on the alpha channel and punch a hole in the framebuffer
    blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
    name: 'robe:contact',
  });
  return { g, m };
}

// Mirrors the road control points demo.js lays down per district. Kept in step by hand —
// see NOTES_PEOPLE.md.
function roadOf(cx) {
  const cz = creekZ(cx);
  return [[cx - 3.0, -33], [cx - 3.0, -27], [cx - 1.4, -15], [cx + 2.0, 1], [cx + 1.4, 17],
    [cx - 1.8, 31], [cx - 0.6, cz - 9], [cx - 0.2, cz + 10]];
}

function roadX(pts, z) {
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    if (z >= a[1] && z <= b[1]) return a[0] + (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]);
  }
  return z < pts[0][1] ? pts[0][0] : pts[pts.length - 1][0];
}

const POOL = 120;
const MAX_PER_MESH = 32;

export class People {
  constructor(terrain) {
    this.terrain = terrain;
    this.object3D = new THREE.Group();
    this.object3D.name = 'people';
    this.time = 0;
    this.recount = 0;
    this.envScale = 1;

    this.uniforms = {
      uTime: { value: 0 },
      uWind: { value: new THREE.Vector4(0.82, 0.57, 0.34, 0.55) },
      uCloth: { value: 1 },
      uSelf: { value: new THREE.Vector4(0, 0, 0, 0) },
      uRim: { value: new THREE.Vector2(0.5, 2.4) },
      uRimCol: { value: new THREE.Color(0xcfd8dd) },
      uWrap: { value: new THREE.Vector2(0.4, 0.45) },
      uShade: { value: new THREE.Color(0x2f4a68).multiplyScalar(0.22) },
      uEye: { value: 0 },
    };

    this.geo = {}; this.geoB = {}; this.mat = {};
    this.depth = robeDepth(this.uniforms);
    for (const id of ZONE_IDS) {
      this.geo[id] = figureGeometry(id, 0);
      this.geoB[id] = figureGeometry(id, 1);
      this.mat[id] = robeMaterial(id, this.uniforms);
    }

    this.spawn();
    this.buildMeshes();
    this.setCrowd(36);
    const p = new URLSearchParams(location.search);
    this.freeze = p.has('ct') ? +p.get('ct') : null;   // pins cloth time so two shots are comparable
    if (p.has('dev')) this.devScenarios();
  }

  // Only registered with ?dev=1 so --all keeps rendering just the five the critic scores.
  devScenarios() {
    ZONE_IDS.forEach((id, i) => {
      const [a, b] = this.agents.filter(g => g.zi === i);
      const x = -3.0 + i * 3.0;
      if (a) Object.assign(a, { kind: 'idle', x, z: 42, heading: 0, speed: 0, turn: 0, scale: 1, tone: 1, vi: 0 });
      if (b) Object.assign(b, { kind: 'idle', x, z: 38, heading: Math.PI * 0.5, speed: 1.4, turn: 0, scale: 1, tone: 1, vi: 1 });
    });
    this.setCrowd(24);
    defineScenario({
      id: 'people_macro', label: 'People macro', zone: 'neutral',
      setup: app => {
        frameCamera(app, { pos: [0, heightAt(0, 44.6) + 1.42, 44.6], look: [0, heightAt(0, 42) + 1.26, 42], fov: 34 });
        app.quality.set('time', 10.5);
      },
    });
    for (const [t, label] of [[10.5, 'day'], [17.6, 'dusk']]) {
      defineScenario({
        id: `people_${label}`, label: `People close-up, ${label}`, zone: 'neutral',
        setup: app => {
          frameCamera(app, { pos: [0, heightAt(0, 48.5) + 1.35, 48.5], look: [0, heightAt(0, 41) + 0.9, 41], fov: 42 });
          app.quality.set('time', t);
        },
      });
    }
  }

  // Quotas, not dice: the five scenario cameras look at very different parts of the map and a
  // uniform roll left three of them empty.
  spawn() {
    const R = rng(0x6b1f27);
    const T = this.terrain;
    // terrain.blocked() is the *scatter* mask and includes the roads, which is exactly where
    // people belong — so walkability is tested against the building footprints directly.
    const indoors = (x, z) => (T ? T.footprints : []).some(fp => {
      const dx = x - fp.x, dz = z - fp.z;
      const c = Math.cos(-fp.rot), s = Math.sin(-fp.rot);
      return Math.abs(dx * c - dz * s) < fp.hw + 0.7 && Math.abs(dx * s + dz * c) < fp.hd + 0.7;
    });
    const free = (x, z) => !indoors(x, z) && heightAt(x, z) > waterY(x) + 0.4 && !nearCamera(x, z, -6);
    const PLAN = ['road', 'front', 'road', 'outer', 'road', 'meadow', 'road', 'bank', 'front', 'road', 'outer', 'meadow'];
    const agents = [];

    for (let n = 0; agents.length < POOL && n < POOL * 40; n++) {
      const zi = agents.length % 3;
      const cx = CENTERS[zi];
      const pts = roadOf(cx);
      const cz = creekZ(cx);
      const kind = PLAN[Math.floor(agents.length / 3) % PLAN.length];
      let a = null;

      if (kind === 'road') {
        const z0 = span(R, -30, cz + 12);
        const off = span(R, -2.3, 2.3);
        const x = roadX(pts, z0) + off;
        if (!free(x, z0)) continue;
        a = { kind: 'walk', pts, off, z: z0, zMin: -32, zMax: cz + 17, dir: R() < 0.5 ? 1 : -1,
          speed: span(R, 0.85, 1.55) };
      } else if (kind === 'front') {
        const z0 = span(R, -20, 34);
        const x = roadX(pts, z0) + (R() < 0.5 ? -1 : 1) * span(R, 3.0, 5.4);
        if (!free(x, z0)) continue;
        a = { kind: 'idle', x, z: z0, heading: span(R, 0, 6.28), speed: 0, turn: span(R, -0.25, 0.25) };
      } else {
        const band = kind === 'meadow' ? [cz + 9, cz + 30] : kind === 'outer' ? [-54, -40] : [cz - 15, cz - 6];
        const x = cx + span(R, -30, 30);
        const z0 = span(R, band[0], band[1]);
        if (!free(x, z0)) continue;
        a = { kind: 'stroll', x, z: z0, heading: span(R, 0, 6.28), speed: span(R, 0.5, 1.0),
          box: [cx - 34, cx + 34, band[0] - 3, band[1] + 3], turn: span(R, -0.3, 0.3) };
      }

      a.zi = zi;
      a.vi = R() < 0.5 ? 0 : 1;
      a.phase = span(R, 0, 40);
      a.gait = span(R, 0, 6.28);
      a.scale = span(R, 0.92, 1.09);
      a.tone = span(R, 0.86, 1.12);
      a.warm = span(R, -0.05, 0.05);
      agents.push(a);
    }
    this.agents = agents;
  }

  buildMeshes() {
    this.meshes = [];
    ZONE_IDS.forEach((id, zi) => {
      for (let v = 0; v < 2; v++) {
        const m = new THREE.InstancedMesh(v ? this.geoB[id] : this.geo[id], this.mat[id], MAX_PER_MESH);
        m.name = `people:${id}:${v}`;
        m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        m.castShadow = true;
        m.receiveShadow = true;
        m.customDepthMaterial = this.depth;
        m.count = 0;
        m.geometry.setAttribute('aInst',
          new THREE.InstancedBufferAttribute(new Float32Array(MAX_PER_MESH * 4), 4).setUsage(THREE.DynamicDrawUsage));
        m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PER_MESH * 3).fill(1), 3);
        this.object3D.add(m);
        this.meshes.push(m);
      }
    });

    const { g, m } = aoDisc();
    this.ao = new THREE.InstancedMesh(g, m, POOL);
    this.ao.name = 'people:contact';
    this.ao.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.ao.frustumCulled = false;
    this.ao.renderOrder = 2;
    this.ao.castShadow = false;
    this.ao.count = 0;
    this.object3D.add(this.ao);
    this.setAO(0.8);
  }

  setAO(v) {
    const g = this.ao.geometry;
    const pos = g.getAttribute('position'), col = g.getAttribute('color');
    for (let i = 0; i < pos.count; i++) {
      col.setW(i, Math.hypot(pos.getX(i), pos.getZ(i)) > AO_R * 0.9 ? 0 : v);
    }
    col.needsUpdate = true;
  }

  setCrowd(n) {
    this.active = this.agents.slice(0, Math.min(n, POOL));
    const col = new THREE.Color();
    this.meshes.forEach((mesh, mi) => {
      const list = this.active.filter(a => a.zi === (mi >> 1) && a.vi === (mi & 1)).slice(0, MAX_PER_MESH);
      mesh.count = list.length;
      mesh.userData.list = list;
      const ic = mesh.instanceColor;
      list.forEach((a, i) => {
        col.setRGB(a.tone * (1 + a.warm), a.tone, a.tone * (1 - a.warm)).toArray(ic.array, i * 3);
      });
      ic.needsUpdate = true;
    });
    this.recount = 0;
  }

  registerKnobs(q) {
    q.register({ key: 'crowd', label: 'Crowd', type: 'range', min: 0, max: POOL, step: 4, default: 36, group: 'People' },
      v => this.setCrowd(v));
    q.register({ key: 'cloth', label: 'Cloth motion', type: 'range', min: 0, max: 2.5, step: 0.05, default: 1, group: 'People' },
      v => { this.uniforms.uCloth.value = v; });
    q.register({ key: 'wind', label: 'Wind', type: 'range', min: 0, max: 1.2, step: 0.02, default: 0.34, group: 'People' },
      v => { this.uniforms.uWind.value.z = v; });
    q.register({ key: 'robeRim', label: 'Robe rim light', type: 'range', min: 0, max: 1.2, step: 0.02, default: 0.5, group: 'People' },
      v => { this.uniforms.uRim.value.x = v; });
    q.register({ key: 'robeWrap', label: 'Robe wrap light', type: 'range', min: 0, max: 1.2, step: 0.02, default: 0.45, group: 'People' },
      v => { this.uniforms.uWrap.value.y = v; });
    q.register({ key: 'contactAO', label: 'Figure contact shade', type: 'range', min: 0, max: 1, step: 0.05, default: 0.8, group: 'People' },
      v => this.setAO(v));
    // Off by design — two emissive shards per hood, colours from zones.js. Prototype only.
    q.register({ key: 'robeEyes', label: 'Hood eyes', type: 'range', min: 0, max: 3, step: 0.1, default: 0, group: 'People' },
      v => { this.uniforms.uEye.value = v; });
  }

  update(dt, app) {
    this.time = this.freeze ?? (this.time + dt) % 600;
    this.uniforms.uTime.value = this.time;
    if (app?.scene?.fog) this.uniforms.uRimCol.value.copy(app.scene.fog.color);

    // lighting.js drives env intensity through materials.js only, and an untracked material
    // sits at 1.0 while the whole town is at ~0.3 — which blows the robes out to white.
    const env = getMaterial('neutral', 'crest').envMapIntensity * this.envScale;
    if (env !== this.env) {
      this.env = env;
      for (const id of ZONE_IDS) this.mat[id].envMapIntensity = env;
    }

    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler(0, 0, 0, 'YXZ');
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();
    const flat = new THREE.Quaternion();
    const up = new THREE.Vector3();
    const T = this.terrain;
    let ai = 0;

    for (const mesh of this.meshes) {
      const list = mesh.userData.list;
      if (!list || !list.length) continue;
      const inst = mesh.geometry.getAttribute('aInst');

      for (let i = 0; i < list.length; i++) {
        const a = list[i];
        let x, z, heading;
        if (a.kind === 'walk') {
          a.z += a.dir * a.speed * dt;
          if (a.z > a.zMax) { a.z = a.zMax; a.dir = -1; }
          if (a.z < a.zMin) { a.z = a.zMin; a.dir = 1; }
          z = a.z;
          x = roadX(a.pts, z) + a.off;
          const ahead = roadX(a.pts, z + a.dir * 0.6) + a.off;
          heading = Math.atan2(ahead - x, a.dir * 0.6);
        } else if (a.kind === 'stroll') {
          a.heading += a.turn * dt * Math.sin(this.time * 0.17 + a.gait);
          a.x += Math.sin(a.heading) * a.speed * dt;
          a.z += Math.cos(a.heading) * a.speed * dt;
          const b = a.box;
          if (a.x < b[0] || a.x > b[1] || a.z < b[2] || a.z > b[3]) {
            a.x = Math.min(b[1], Math.max(b[0], a.x));
            a.z = Math.min(b[3], Math.max(b[2], a.z));
            a.heading += Math.PI * 0.87;
          }
          x = a.x; z = a.z; heading = a.heading;
        } else {
          x = a.x; z = a.z;
          a.heading += a.turn * dt * Math.sin(this.time * 0.21 + a.gait);
          heading = a.heading;
        }

        // The rendered mesh is not the analytic field, and the difference is enough to float a
        // figure or bury its contact disc under the ground.
        const gy = T ? T.surfaceY(x, z) : heightAt(x, z);
        const bob = a.speed > 0 ? Math.sin(this.time * (5.2 + a.speed * 2.4) * 2 + a.gait) * 0.022 * a.speed : 0;
        e.set(a.speed * 0.045, heading, 0);
        q.setFromEuler(e);
        pos.set(x, gy + bob, z);
        scl.setScalar(a.scale);
        m4.compose(pos, q, scl);
        mesh.setMatrixAt(i, m4);

        // A flat disc on undulating ground depth-fails almost everywhere, so it is tilted onto the
        // local surface normal first. Without this the contact shade is a two-pixel sliver.
        if (ai < POOL) {
          if (T) {
            up.set(T.surfaceY(x - 0.6, z) - T.surfaceY(x + 0.6, z), 1.2,
              T.surfaceY(x, z - 0.6) - T.surfaceY(x, z + 0.6)).normalize();
            flat.setFromUnitVectors(UP, up);
          }
          pos.set(x, gy + 0.07, z);
          scl.set(a.scale, 1, a.scale);
          m4.compose(pos, flat, scl);
          this.ao.setMatrixAt(ai++, m4);
        }

        inst.array[i * 4] = a.phase;
        inst.array[i * 4 + 1] = a.speed / 3;
        inst.array[i * 4 + 2] = a.gait;
        inst.array[i * 4 + 3] = 0;
      }
      mesh.instanceMatrix.needsUpdate = true;
      inst.needsUpdate = true;
    }

    this.ao.count = ai;
    this.ao.instanceMatrix.needsUpdate = true;

    this.recount -= dt;
    if (this.recount <= 0) {
      this.recount = 1.5;
      for (const m of this.meshes) if (m.count) m.computeBoundingSphere();
    }
  }

  triangleCost() {
    const per = {};
    for (const id of ZONE_IDS) per[id] = [this.geo[id].userData.tris, this.geoB[id].userData.tris];
    const crowd = this.meshes.reduce((s, m, i) => s + m.count * per[ZONE_IDS[i >> 1]][i & 1], 0);
    return { per, crowd, contact: this.ao.count * AO_SEG * 3, drawn: this.meshes.filter(m => m.count).length + 1 };
  }
}
