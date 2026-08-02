// Robed figures. A faceted fold-prism shared by the crowd and the player, tinted per zone,
// with the cloth driven entirely in the vertex shader off an instance-id offset.

import * as THREE from 'three';
import { ZONE_IDS, zone } from './zones.js';
import { getMaterial } from './materials.js';
import { rng, span } from './details.js';
import { heightAt, waterY, creekZ, CENTERS, nearCamera } from './terrain.js';
import { defineScenario, frameCamera } from '../scenarios.js';

const TAU = Math.PI * 2;
const SEG = 12;
const HSEG = 8;
const SHOULDER = 1.26;

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

class Build {
  constructor() { this.p = []; this.n = []; this.c = []; this.k = []; this.tris = 0; }
  vert(v, n) {
    this.p.push(v.p[0], v.p[1], v.p[2]);
    const q = n || v.n;
    this.n.push(q[0], q[1], q[2]);
    this.c.push(v.c[0], v.c[1], v.c[2]);
    this.k.push(v.k[0], v.k[1]);
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
    g.setAttribute('aCloth', new THREE.Float32BufferAttribute(this.k, 2));
    return g;
  }
}

const ROBE = [
  { y: 0.00, r: 0.348, sh: 0.50 },
  { y: 0.34, r: 0.320, sh: 0.80 },
  { y: 0.72, r: 0.284, sh: 0.95 },
  { y: 1.02, r: 0.238, sh: 1.00 },
  { y: 1.26, r: 0.198, sh: 1.00 },
];

// Alternating radial push (cos at half the segment count hits ±1 exactly on every vertex),
// phase-rotated per ring so the fold lines wander down the body instead of running vertical.
function robeVert(i, j, seed) {
  const R = ROBE[i];
  const a = (((j % SEG) + SEG) % SEG) / SEG * TAU;
  const ph = seed + i * 0.66;
  const fold = Math.cos(SEG * 0.5 * a + ph) * (0.118 - 0.014 * i)
             + Math.cos(a * 2 + ph * 1.7) * 0.042;
  const fn = fold / 0.16;
  const r = R.r * (1 + fold);
  const y = i === 0
    ? -0.02 - 0.075 * fn + 0.04 * (hash(j * 3.7 + seed * 11) - 0.5)
    : R.y;
  return {
    p: [r * Math.cos(a), y, r * Math.sin(a)],
    n: [Math.cos(a), 0.18, Math.sin(a)],
    c: tone(R.sh * (1 + 0.11 * fn - 0.05 * Math.abs(fn))),
    k: [hemAmp(R.y), 0],
  };
}

function robe(B, seed) {
  const v = (i, j) => robeVert(i, j, seed);
  for (let i = 0; i < ROBE.length - 1; i++) {
    for (let j = 0; j < SEG; j++) B.flatQuad(v(i, j), v(i + 1, j), v(i + 1, j + 1), v(i, j + 1));
  }
  const hub = { p: [0, -0.135, 0], n: [0, -1, 0], c: tone(0.16), k: [1, 0] };
  for (let j = 0; j < SEG; j++) B.flatTri(v(0, j), v(0, j + 1), hub);

  const neck = { p: [0, 1.42, -0.012], n: [0, 1, 0], c: tone(0.55), k: [0, 0] };
  for (let j = 0; j < SEG; j++) B.flatTri(v(4, j), neck, v(4, j + 1));
}

// Triangulates a boundary loop, flipping the fan if it would face away from `ref`.
function fan(B, loop, ref) {
  _a.fromArray(loop[0].p);
  _b.fromArray(loop[1].p).sub(_a);
  _c.fromArray(loop[2].p).sub(_a);
  const flip = _b.cross(_c).dot(_a.fromArray(ref)) < 0;
  for (let i = 1; i < loop.length - 1; i++) {
    if (flip) B.tri(loop[0], loop[i + 1], loop[i]);
    else B.tri(loop[0], loop[i], loop[i + 1]);
  }
}

// Cone whose rim is wider than the shoulders, with the two front segments left out and filled
// by a near-black inset. That void is what makes the shape read as hooded at thumbnail size.
function hood(B, seed) {
  const rim = [], brow = [], crown = [];
  for (let j = 0; j < HSEG; j++) {
    const a = j / HSEG * TAU;
    const co = Math.cos(a), si = Math.sin(a);
    const front = Math.max(0, si);
    const fold = Math.cos(a * 3 + seed * 2.3) * 0.05;
    const pinch = (j === 1 || j === 3) ? 0.82 : 1;          // narrows the mouth of the cowl
    const ring = (r, y, dz, sh, ny) => ({
      p: [r * pinch * co, y, r * pinch * si * 1.04 + dz], n: [co, ny, si],
      c: tone(sh * (1 + 1.8 * fold)), k: [0, 0],
    });
    rim.push(ring(0.226 * (1 + fold), 1.392 - 0.05 * front, 0.03 * front - 0.012, 0.88, -0.3));
    brow.push(ring(0.196 * (1 + fold * 0.8), 1.492 - 0.03 * front, -0.018, 0.97, 0.1));
    crown.push(ring(0.118 * (1 + fold * 0.6), 1.632, -0.034, 1.0, 0.55));
  }
  const apex = { p: [0, 1.712, -0.052], n: [0, 1, 0], c: tone(1.0), k: [0, 0] };
  const under = { p: [0, 1.452, -0.012], n: [0, -1, 0], c: tone(0.13), k: [0, 0] };

  for (let j = 0; j < HSEG; j++) {
    if (j === 1 || j === 2) continue;
    B.flatQuad(rim[j], brow[j], brow[(j + 1) % HSEG], rim[(j + 1) % HSEG]);
  }
  for (let j = 0; j < HSEG; j++) {
    B.flatQuad(brow[j], crown[j], crown[(j + 1) % HSEG], brow[(j + 1) % HSEG]);
    B.flatTri(crown[j], apex, crown[(j + 1) % HSEG]);
    B.flatTri(rim[j], rim[(j + 1) % HSEG], under);
  }

  const void_ = v => ({ p: v.p, n: [0, 0.2, 0.98], c: tone(0.05), k: [0, 0] });
  fan(B, [rim[1], rim[2], rim[3], brow[3], brow[2], brow[1]].map(void_), [0, 0.2, 1]);
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
      k: [typeof k === 'function' ? k(t) : k, 0],
    };
  };
  for (let i = 0; i < pts.length - 1; i++) {
    for (let j = 0; j < seg; j++) B.quad(at(i, j), at(i, j + 1), at(i + 1, j + 1), at(i + 1, j));
  }
}

// Double-wound so both faces light correctly — DoubleSide flips the normal and blackens the back.
// Every triangle is flat-shaded off its own winding, which is also what decides which side the
// renderer culls, so a mirrored ribbon can never end up lit from behind.
// `axes` banks the ribbon along its length; `curl` warps the two edges apart so no quad is planar.
function ribbon(B, pts, axes, halfW, curl, shade, amp) {
  const P = pts.map(p => new THREE.Vector3(...p));
  const W = axes.map(a => new THREE.Vector3(...a).normalize());
  const U = P.map((p, i) => {
    const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)];
    return new THREE.Vector3().crossVectors(_a.subVectors(b, a), W[i]).normalize();
  });
  const v = (i, s) => {
    const t = i / (P.length - 1), w = halfW(t) * s, u = curl(t) * s;
    return {
      p: [P[i].x + W[i].x * w + U[i].x * u,
        P[i].y + W[i].y * w + U[i].y * u,
        P[i].z + W[i].z * w + U[i].z * u],
      n: [0, 1, 0],
      c: tone(shade(t)),
      k: [amp(t), 1],
    };
  };
  for (let i = 0; i < P.length - 1; i++) {
    B.flatQuad(v(i, -1), v(i, 1), v(i + 1, 1), v(i + 1, -1));
    B.flatQuad(v(i, 1), v(i, -1), v(i + 1, -1), v(i + 1, 1));
  }
}

const SCARF = [
  [0.02, 1.250, -0.16], [0.06, 1.160, -0.45], [0.13, 1.030, -0.73],
  [0.19, 0.885, -0.99], [0.23, 0.750, -1.23], [0.25, 0.635, -1.45], [0.25, 0.550, -1.66],
];
const SCARF_AXES = [
  [1, 0, 0], [0.94, 0.34, 0], [0.70, 0.71, 0.05], [0.90, -0.44, 0],
  [0.99, 0.14, 0], [0.72, 0.69, 0], [0.95, -0.31, 0],
];

// Kept deliberately off the robe's own value so the tail reads as a separate cloth on every
// zone — on the dark robe that means a vertex colour above 1.
const SCARF_SHADE = { light: 0.52, neutral: 0.60, dark: 2.0 };

function scarf(B, zoneId, len, side) {
  const pts = SCARF.slice(0, len + 1).map(p => [p[0] * side, p[1], p[2]]);
  const axes = SCARF_AXES.slice(0, len + 1).map(a => [a[0] * side, a[1], a[2]]);
  const base = SCARF_SHADE[zoneId] ?? 0.6;
  ribbon(B, pts, axes,
    t => 0.04 + 0.075 * Math.sin(Math.pow(t, 0.7) * Math.PI * 0.9),
    t => 0.05 * Math.sin(t * 6.4 + 0.9),
    t => base * (1 - 0.18 * t),
    t => 0.10 + 1.35 * t * t);
}

function figureGeometry(zoneId, variant) {
  const B = new Build();
  const z = zone(zoneId);
  const seed = variant ? 2.15 : 0.35;

  robe(B, seed);
  hood(B, seed);

  if (variant) {
    scarf(B, zoneId, 6, -1);
  } else {
    scarf(B, zoneId, 4, 1);
    tube(B, [[0.145, 1.205, 0.015], [0.248, 1.135, 0.052], [0.318, 1.05, 0.088]],
      [0.078, 0.062, 0.05], 6, t => 0.84 - 0.18 * t, 0);

    if (z.staff === 'pitchfork') {
      tube(B, [[0.425, 0.02, 0.145], [0.292, 1.60, 0.055]], [0.030, 0.024], 4, 0.30, 0);
      const hy = 1.60, hx = 0.292;
      tube(B, [[hx - 0.10, hy, 0.055], [hx + 0.10, hy, 0.055]], [0.019, 0.019], 3, 0.26, 0);
      for (const d of [-0.092, 0, 0.092]) {
        tube(B, [[hx + d, hy, 0.055], [hx + d, hy + 0.20, 0.055]], [0.016, 0.004], 3, 0.26, 0);
      }
    } else {
      tube(B, [[0.425, 0.02, 0.145], [0.288, 1.66, 0.055]], [0.031, 0.024], 4, 0.30, 0);
      const dark = zoneId === 'dark';
      tube(B, [[0.288, 1.66, 0.055], [0.284, 1.66 + (dark ? 0.28 : 0.15), 0.052]],
        [dark ? 0.034 : 0.048, 0.004], 4, dark ? 0.20 : 0.86, 0);
    }
  }

  const g = B.geometry();
  g.userData.tris = B.tris;
  return g;
}

const PARS = `
uniform float uTime;
uniform vec4 uWind;
uniform vec4 uSelf;
uniform float uCloth;
attribute vec2 aCloth;
#ifdef USE_INSTANCING
attribute vec4 aInst;
#endif

vec3 clothOff(vec3 p, vec2 cl, vec4 self, vec2 wind) {
  if (cl.x < 0.001) return vec3(0.0);
  float spd = self.y, cape = cl.y;
  float t = uTime + self.x;

  float az = atan(p.z, p.x);
  float ripple = sin(t * 4.6 + az * 2.0 - p.y * 3.4) * 0.62
               + sin(t * 2.9 - az * 3.0 + 1.7) * 0.38;
  float gust = 0.40 + 0.60 * sin(t * uWind.w) * sin(t * uWind.w * 0.41 + 2.1);
  float swing = sin(t * (5.2 + spd * 2.4) + self.z);
  vec3 out3 = mix(normalize(vec3(p.x, 0.45, p.z - 0.001)), vec3(0.3, 0.15, -0.94), cape);

  vec3 o = vec3(0.0);
  o.xz += wind * (uWind.z * gust * (0.42 + cape * 0.9));
  o.z -= spd * 0.26 + self.w * 0.42;
  o.x += swing * (0.034 + spd * 0.085) + cape * sin(t * 3.4 + p.y * 6.2) * 0.075;
  o += out3 * ripple * (0.055 + spd * 0.055 + cape * 0.10);
  o.y -= abs(ripple) * 0.032;
  return o * (cl.x * uCloth);
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
  objectNormal = normalize(objectNormal + (nA - nRef) * 1.2 * (1.0 - aCloth.y * 0.85));
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
  gl_FragColor.rgb += uRimCol * pow(rimF, uRim.y) * uRim.x * clamp(rNdL * 1.8, 0.0, 1.0);`;

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

// zones.js tints are authored for a UI swatch; clipping whites to 0.72 stops the robe reading as
// a blown-out cutout the moment the sun is anywhere near it.
function robeColor(hex) {
  const c = new THREE.Color(hex);
  const s = { r: 0, g: 0, b: 0 };
  c.getRGB(s, THREE.SRGBColorSpace);
  const mx = Math.max(s.r, s.g, s.b);
  if (mx > 0.72) {
    const k = 0.72 / mx;
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
    shader.fragmentShader = 'uniform vec2 uRim;\nuniform vec3 uRimCol;\nuniform vec2 uWrap;\nuniform vec3 uShade;\n'
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

const AO_R = 0.8;

function aoDisc() {
  const g = new THREE.CircleGeometry(AO_R, 10);
  g.rotateX(-Math.PI / 2);
  g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute('position').count * 3).fill(1), 3));
  const m = new THREE.MeshBasicMaterial({
    vertexColors: true, blending: THREE.MultiplyBlending, transparent: true,
    depthWrite: false, fog: false, toneMapped: false, name: 'robe:contact',
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
      uRim: { value: new THREE.Vector2(0.22, 3.0) },
      uRimCol: { value: new THREE.Color(0xcfd8dd) },
      uWrap: { value: new THREE.Vector2(0.4, 0.45) },
      uShade: { value: new THREE.Color(0x2f4a68).multiplyScalar(0.22) },
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
    this.ao.count = 0;
    this.object3D.add(this.ao);
    this.setAO(0.65);
  }

  setAO(v) {
    const g = this.ao.geometry;
    const pos = g.getAttribute('position'), col = g.getAttribute('color');
    for (let i = 0; i < pos.count; i++) {
      const r = Math.min(1, Math.hypot(pos.getX(i), pos.getZ(i)) / AO_R);
      const k = 1 - v * Math.pow(1 - r, 1.5);
      col.setXYZ(i, k, k + (1 - k) * 0.05, k + (1 - k) * 0.14);
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
    q.register({ key: 'robeRim', label: 'Robe rim light', type: 'range', min: 0, max: 0.6, step: 0.01, default: 0.22, group: 'People' },
      v => { this.uniforms.uRim.value.x = v; });
    q.register({ key: 'robeWrap', label: 'Robe wrap light', type: 'range', min: 0, max: 1.2, step: 0.02, default: 0.45, group: 'People' },
      v => { this.uniforms.uWrap.value.y = v; });
    q.register({ key: 'contactAO', label: 'Figure contact shade', type: 'range', min: 0, max: 0.9, step: 0.05, default: 0.65, group: 'People' },
      v => this.setAO(v));
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

        const gy = heightAt(x, z);
        const bob = a.speed > 0 ? Math.sin(this.time * (5.2 + a.speed * 2.4) * 2 + a.gait) * 0.022 * a.speed : 0;
        e.set(a.speed * 0.045, heading, 0);
        q.setFromEuler(e);
        pos.set(x, gy + bob, z);
        scl.setScalar(a.scale);
        m4.compose(pos, q, scl);
        mesh.setMatrixAt(i, m4);

        if (ai < POOL) {
          pos.set(x, gy + 0.045, z);
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
    return { per, crowd, contact: this.ao.count * 10, drawn: this.meshes.filter(m => m.count).length + 1 };
  }
}
