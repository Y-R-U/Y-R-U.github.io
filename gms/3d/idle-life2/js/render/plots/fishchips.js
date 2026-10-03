// 🐟 Fish & Chips: a whitewashed chippy on the quay, a trawler at the jetty swinging fish ashore on its derrick.
// L1 hut → L25 chippy with neon fish + benches → L100 seafood hall. Also exports the shared harbour/downtown helpers.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const QZ = -8.2, WY = -0.55;

// Lofted hull, bow = +x, keel at y = 0. Colours: top, stripe, bottom, deck.
export function hullGeo(kit, { len = 6, beam = 2.4, depth = 1.2, rise = 0.5, top = '#3f5577', stripe = '#f6f1e7', bottom = '#c9483f', deck = '#b98a5e', n = 15, transom = 0.82, soft = true } = {}) {
  const S = kit.shape;
  const rings = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n, x = -len / 2 + t * len;
    const B = (beam / 2) * (t < 0.55 ? transom + (1 - transom) * Math.sin((t / 0.55) * Math.PI / 2) : Math.max(0.02, Math.pow(Math.cos(((t - 0.55) / 0.45) * Math.PI / 2), 0.75)));
    const D = depth + rise * Math.pow(Math.max(0, (t - 0.5) / 0.5), 2) + 0.06 * (1 - t);
    const kz = depth * 0.28 * Math.pow(Math.max(0, (t - 0.7) / 0.3), 1.6);
    const prof = [[1, D], [1.0, D * 0.8], [0.99, D * 0.68], [0.95, depth * 0.42], [0.62, kz + depth * 0.12], [0, kz]];
    const ring = [];
    for (const [f, y] of prof) ring.push([x, y, B * f]);
    for (let i = prof.length - 2; i >= 0; i--) ring.push([x, prof[i][1], -B * prof[i][0]]);
    rings.push(ring.reverse());
  }
  const cols = [top, stripe, top, bottom, bottom, bottom, bottom, top, stripe, top, deck];
  const g = S.loft(rings, { col: (r, i) => (r < 0 ? top : r >= rings.length ? top : cols[i] || top) });
  return soft ? S.smooth(g, 2) : g;
}

// Props bought with throughput / boosts: every section is merged into one mesh and revealed by drawRange (1 draw call).
export function extras(kit, P, palette, sections) {
  const geos = [], ends = [];
  let n = 0;
  for (const fn of sections) {
    const b = kit.builder(palette);
    fn(b);
    if (b.count) { const g = b.geometry(); geos.push(g); n += g.attributes.position.count; }
    ends.push(n);
  }
  const g = geos.length ? mergeGeometries(geos, false) : new THREE.BufferGeometry();
  g.computeBoundingSphere();
  const mesh = new THREE.Mesh(g, kit.materials.uber);
  mesh.castShadow = mesh.receiveShadow = true;
  P.group.add(mesh);
  let shown = -1;
  return {
    mesh,
    show(k) {
      k = Math.max(0, Math.min(sections.length, k | 0));
      if (k === shown) return;
      shown = k;
      mesh.visible = k > 0;
      g.setDrawRange(0, k ? ends[k - 1] : 0);
    },
  };
}

// A few birds in one instanced draw. kind 'gull' | 'bat'.
export function flock(kit, P, count, kind = 'gull') {
  const b = kit.builder(P.pal);
  if (kind === 'bat') {
    b.ball('#2a2238', 0, 0, 0, 0.13, { sx: 1.3, detail: 0 });
    b.ball('#2a2238', 0.13, 0.05, 0, 0.08, { detail: 0 });
    for (const s of [-1, 1]) b.slab('#3a2f4e', -0.02, 0, s * 0.3, 0.26, 0.02, 0.42, { round: 0.01, rz: 0, ry: s * 0.25 });
  } else {
    b.ball('#f8f6f2', 0, 0, 0, 0.16, { sx: 1.7, sy: 0.85, detail: 1, smooth: true });
    b.ball('#f8f6f2', 0.22, 0.09, 0, 0.1, { detail: 1, smooth: true });
    b.cone('#f2b84b', 0.36, 0.08, 0, 0.035, 0.12, 0, { rz: -Math.PI / 2, sides: 5 });
    b.slab('#9aa3b4', -0.3, 0.02, 0, 0.18, 0.05, 0.12, { round: 0.02, rz: 0.3 });
    for (const s of [-1, 1]) b.slab('#c9ccd8', -0.02, 0.06, s * 0.3, 0.26, 0.03, 0.46, { round: 0.015, ry: s * 0.18 });
    for (const s of [-1, 1]) b.slab('#6d7286', -0.06, 0.06, s * 0.52, 0.2, 0.031, 0.06, { round: 0.01 });
  }
  const mesh = new THREE.InstancedMesh(b.geometry({ ao: 0 }), kit.materials.uber, count);
  mesh.castShadow = false;
  mesh.frustumCulled = false;
  P.group.add(mesh);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();
  const api = {
    mesh,
    set(i, x, y, z, heading, flap = 1, bank = 0, size = 1) {
      e.set(bank, heading, 0, 'YXZ');
      m.compose(p.set(x, y, z), q.setFromEuler(e), s.set(size, size, size * flap));
      mesh.setMatrixAt(i, m);
    },
    hide(i) { m.makeScale(0, 0, 0); mesh.setMatrixAt(i, m); },
    commit() { mesh.instanceMatrix.needsUpdate = true; },
  };
  for (let i = 0; i < count; i++) api.hide(i);
  return api;
}

// Fish & Chips supply-link van (stats.supply, DESIGN §1 Harbour). Each harbour plot has a loading bay in card view.
export const LINK_BAY = { fishchips: [7.4, -1.7], ferry: [7.6, -1.6], boatyard: [-7.4, -1.2] };
export function linkVan(kit, P) {
  const m = P.dynamic((d) => {
    kit.vehicles.van(d, 0, 0, 0, '#4f8fb5');
    d.slab('#f6f1e7', -0.25, 0.75, 0.75, 1.9, 0.5, 0.03, { round: 0.03 });
    d.ball('#f2a65a', -0.35, 1.0, 0.77, 0.28, { sx: 1.6, sy: 0.75, sz: 0.2, detail: 1 });
    d.ball('#f4c24f', 0.25, 1.0, 0.77, 0.08, { detail: 0 });
    d.slab('#9fb6c9', -0.4, 1.68, 0, 1.4, 0.3, 0.9, { round: 0.06 });
  }, { tier: -1 });
  m.visible = false;
  return m;
}

// Fairy lights on a sagging wire between two points: chunky warm bulbs with dark caps, a soft catenary wire.
export function lights(B, a, c, n = 9, sag = 0.3, o = {}) {
  const at = (t) => [a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t - Math.sin(t * Math.PI) * sag, a[2] + (c[2] - a[2]) * t];
  const r = Math.max(o.r ?? 0.09, 0.075), col = o.c || { c: '#ffd98a', r: 0.35, g: o.g ?? 1.1 };
  for (let i = 1; i < n; i++) {
    const p = at(i / n);
    B.cyl('#3e3a44', p[0], p[1] - r * 0.35, p[2], r * 0.45, r * 0.5, 0, { sides: 5, taper: 1, noAo: true });
    B.ball(col, p[0], p[1] - r * 1.15, p[2], r, { detail: 1, smooth: true, sy: 1.25, g: o.g ?? 1.1, noAo: true });
  }
  const seg = 14;
  for (let i = 0; i < seg; i++) {
    const p0 = at(i / seg), p1 = at((i + 1) / seg);
    const h = Math.hypot(p1[0] - p0[0], p1[2] - p0[2]), len = Math.hypot(h, p1[1] - p0[1]);
    B.slab('#3e3a44', (p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2 - 0.02, (p0[2] + p1[2]) / 2, len + 0.02, 0.035, 0.035, { round: 0.012, taper: 0, ry: Math.atan2(-(c[2] - a[2]), c[0] - a[0]), rz: Math.atan2(p1[1] - p0[1], h), noAo: true });
  }
}

// White swirl lines on the water (the refs' hard ripple marks): arcs of a spiral, flat at the water line.
export function ripple(B, kit, x, z, r = 1.2, o = {}) {
  const S = kit.shape, m = new S.Mesh(), col = S.rgb(o.c || '#f4fbf8'), y = (o.y ?? -0.55) + 0.03;
  const turns = o.turns ?? 1.6, n = Math.round(turns * 18), w = o.w ?? 0.07, a0 = o.a0 ?? 0;
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n;
    if ((i % 9) === 8) continue;
    const ra = r * (0.35 + 0.65 * t0), rb = r * (0.35 + 0.65 * t1), aa = a0 + t0 * turns * Math.PI * 2, ab = a0 + t1 * turns * Math.PI * 2;
    const sq = o.squash ?? 0.6;
    const p = (rr, a, d) => [x + Math.cos(a) * (rr + d), y, z + Math.sin(a) * (rr + d) * sq];
    m.quad(p(ra, aa, -w), p(rb, ab, -w), p(rb, ab, w), p(ra, aa, w), col);
  }
  B.add(m.geo(), null, { r: 0.5, noAo: true, g: 0.08 });
}

// Flat water quad that always faces up, whatever the corner order.
export function fq(m, a, b, c, d, col) {
  const n = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
  return n >= 0 ? m.quad(a, b, c, d, col) : m.quad(a, d, c, b, col);
}

// Plot-local harbour water over the world sea: shallow turquoise at the quay → deep teal, faceted wave sheen,
// animated foam along the quay wall and round hulls, V-wakes behind sailing boats. One draw call.
const SEA_VERT_HEAD = `#include <common>
uniform float uTime;
varying vec3 vLoc;
varying vec3 vWW;
flat varying vec3 vFN;
vec2 seaSlope(vec2 p, float t) {
  vec2 s = vec2(0.0);
  s += vec2(0.9, 0.35) * cos(dot(p, vec2(0.9, 0.35)) * 0.55 + t * 1.1) * 0.55;
  s += vec2(-0.4, 1.0) * cos(dot(p, vec2(-0.4, 1.0)) * 0.8 - t * 0.9) * 0.45;
  s += vec2(0.7, -0.7) * cos(dot(p, vec2(0.7, -0.7)) * 1.6 + t * 1.7) * 0.25;
  return s;
}`;
const SEA_FRAG_HEAD = `#include <common>
uniform float uTime;
uniform float uNight;
uniform float uWall;
uniform vec4 uFade;
uniform vec3 uShallow;
uniform vec3 uDeep;
uniform vec3 uFar;
uniform vec3 uFoamC;
uniform vec4 uHull[8];
uniform vec4 uHullS[8];
varying vec3 vLoc;
varying vec3 vWW;
flat varying vec3 vFN;
float sh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float sn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(sh(i), sh(i + vec2(1.0, 0.0)), f.x), mix(sh(i + vec2(0.0, 1.0)), sh(i + vec2(1.0, 1.0)), f.x), f.y); }`;
const SEA_COLOR = `vec4 diffuseColor = vec4(diffuse, opacity);
{
  vec2 wp = vWW.xz, lp = vLoc.xz;
  float t = uTime, dist = uWall - lp.y;
  vec3 col = mix(uShallow, uDeep, smoothstep(0.5, 15.0, dist));
  col = mix(col, uFar, smoothstep(22.0, 80.0, dist));
  float n1 = sn(wp * 0.22 + vec2(t * 0.04, t * 0.03)), n2 = sn(wp * 0.6 - vec2(t * 0.07, 0.0));
  col *= 0.93 + 0.1 * n1 + 0.05 * n2;
  float foam = 0.0;
  float fa = sn(vec2(wp.x * 0.8 + t * 0.3, t * 0.2)), fb = sn(vec2(wp.x * 1.7 - t * 0.25, 5.0 + t * 0.15));
  foam = max(foam, 1.0 - smoothstep(0.3 + 0.4 * fa, 0.38 + 0.4 * fa, dist));
  float l2 = abs(dist - (0.85 + 0.35 * fb + 0.12 * sin(t * 0.9 + wp.x * 0.3)));
  foam = max(foam, (1.0 - smoothstep(0.045, 0.085, l2)) * step(0.42, sn(vec2(wp.x * 0.55 + 9.0, t * 0.12))));
  col = mix(col, col * 0.8, (1.0 - smoothstep(0.0, 1.6, dist)) * 0.5);
  for (int i = 0; i < 8; i++) {
    vec4 H = uHull[i], S = uHullS[i];
    if (S.z <= 0.0) continue;
    vec2 d = wp - H.xy;
    float u = dot(d, H.zw), v = dot(d, vec2(-H.w, H.z));
    vec2 q = vec2(u / S.x, v / S.y);
    float e = (length(q) - 1.0) * S.y;
    float nn = sn(vec2(u * 1.3 + t * 0.6, v * 1.3 - t * 0.4));
    float collar = (1.0 - smoothstep(0.1 + 0.32 * nn, 0.2 + 0.32 * nn, e)) * step(-0.05, e);
    float ao = (1.0 - smoothstep(0.0, 1.8, e)) * step(-0.05, e);
    col *= 1.0 - 0.18 * ao * S.z;
    foam = max(foam, collar * S.z);
    float s = -u - S.x * 0.85;
    if (S.w > 0.0 && s > 0.0) {
      float L = 14.0 * S.w, k = 1.0 - smoothstep(0.0, L, s);
      float arm = S.y * 0.75 + s * 0.36, w = 0.12 + s * 0.02;
      float wn = sn(vec2(s * 0.9 - t * 1.4, v * 0.8));
      foam = max(foam, k * (1.0 - smoothstep(w, w + 0.08, abs(abs(v) - arm))) * step(0.3, wn));
      foam = max(foam, k * k * (1.0 - smoothstep(S.y * 0.55 * (1.0 + s * 0.06), S.y * 0.7 * (1.0 + s * 0.06), abs(v))) * step(0.5, sn(vec2(s * 1.4 - t * 2.2, v * 2.1))));
    }
  }
  col = mix(col, vec3(dot(col, vec3(0.3, 0.55, 0.15))) * vec3(0.8, 0.95, 1.0), clamp(uNight, 0.0, 1.0) * 0.45);
  diffuseColor.rgb = mix(col, uFoamC, clamp(foam, 0.0, 1.0));
  float fx = min(smoothstep(uFade.x, uFade.x + uFade.z, vLoc.x), 1.0 - smoothstep(uFade.y - uFade.w, uFade.y, vLoc.x));
  diffuseColor.a = opacity * fx * (1.0 - smoothstep(120.0, 150.0, dist));
}`;

const SEA_HULLS = new Map();
export function seaPlane(kit, P, { x0 = -29.5, x1 = 29.5, fade0 = 14, fade1 = 14, zFar = -160, cell = 1.5 } = {}) {
  const pal = P.pal, wall = QZ - 1.42;
  const pos = [];
  const zs = [QZ + 0.4];
  for (let step = 1.0; zs[zs.length - 1] > zFar; step *= 1.07) zs.push(zs[zs.length - 1] - step);
  const nx = Math.max(1, Math.round((x1 - x0) / cell)), dx = (x1 - x0) / nx;
  const ox = P.group.position?.x || 0;
  const jit = (x, z, j, i) => {
    if (i === 0 || i === nx || j === 0 || j === zs.length - 1) return [x, z];
    const h = Math.sin((x + ox) * 12.9898 + z * 78.233) * 43758.5453, r = h - Math.floor(h), r2 = (h * 7.13) - Math.floor(h * 7.13);
    const sz = zs[j - 1] - zs[j];
    return [x + (r - 0.5) * dx * 0.55, z + (r2 - 0.5) * sz * 0.5];
  };
  const V = zs.map((z, j) => Array.from({ length: nx + 1 }, (_, i) => jit(x0 + i * dx, z, j, i)));
  const y = WY + 0.012;
  for (let j = 0; j < zs.length - 1; j++) for (let i = 0; i < nx; i++) {
    const a = V[j][i], b = V[j][i + 1], c = V[j + 1][i + 1], d = V[j + 1][i];
    const tri = (p, q, r) => pos.push(p[0], y, p[1], q[0], y, q[1], r[0], y, r[1]);
    if ((i + j) % 2) { tri(a, b, c); tri(a, c, d); } else { tri(a, b, d); tri(b, c, d); }
  }
  for (let k = 0; k < pos.length; k += 9) {
    const n = (pos[k + 5] - pos[k + 2]) * (pos[k + 6] - pos[k]) - (pos[k + 3] - pos[k]) * (pos[k + 8] - pos[k + 2]);
    if (n < 0) for (let m = 0; m < 3; m++) { const t = pos[k + 3 + m]; pos[k + 3 + m] = pos[k + 6 + m]; pos[k + 6 + m] = t; }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(pos.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.computeBoundingSphere();
  const c = (v, d) => new THREE.Color(v || d);
  const U = {
    uWall: { value: wall }, uFade: { value: new THREE.Vector4(x0, x1, fade0, fade1) },
    uShallow: { value: c(pal.seaShallow, '#6fd6c6') }, uDeep: { value: c(pal.seaDeep, '#2a909f') }, uFar: { value: c(pal.seaFar, '#2f8b9e') },
    uFoamC: { value: c(null, '#f6fffc') },
    uHull: { value: Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, 1, 0)) },
    uHullS: { value: Array.from({ length: 8 }, () => new THREE.Vector4(1, 1, 0, 0)) },
  };
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.24, metalness: 0, envMapIntensity: 0.32, transparent: true, opacity: 0.97 });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U, { uTime: kit.materials.uTime, uNight: kit.materials.uNight });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', SEA_VERT_HEAD)
      .replace('#include <beginnormal_vertex>', `vec4 _ww = modelMatrix * vec4(position, 1.0);
vec2 _sl = seaSlope(_ww.xz, uTime) * 0.16;
vec3 objectNormal = normalize(vec3(-_sl.x, 1.0, -_sl.y));`)
      .replace('#include <normal_vertex>', '#include <normal_vertex>\nvFN = normalize(transformedNormal);')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLoc = position;\nvWW = _ww.xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', SEA_FRAG_HEAD)
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', SEA_COLOR)
      .replace('#include <normal_fragment_begin>', 'float faceDirection = 1.0;\nvec3 normal = normalize(vFN);\nvec3 nonPerturbedNormal = normal;');
  };
  mat.customProgramCacheKey = () => 'il2-sea';
  const mesh = new THREE.Mesh(g, mat);
  mesh.name = 'sea:' + (P.id || '');
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.renderOrder = 3;
  P.group.add(mesh);
  const H = U.uHull.value, HS = U.uHullS.value;
  mesh.onBeforeRender = () => {
    let n = 0;
    for (const e of SEA_HULLS.values()) {
      if (n >= 8) break;
      if (!(e.k > 0) || !e.group.visible) continue;
      H[n].set(e.x + e.group.position.x, e.z + e.group.position.z, Math.cos(e.ry), -Math.sin(e.ry));
      HS[n].set(e.hl, e.hb, e.k, e.w);
      n++;
    }
    for (; n < 8; n++) HS[n].z = 0;
  };
  const key = (i) => (P.id || 'sea') + ':' + i;
  return {
    mesh,
    hull(i, x, z, ry, hl, hb, k = 1, w = 0) {
      let e = SEA_HULLS.get(key(i));
      if (!e) SEA_HULLS.set(key(i), (e = {}));
      Object.assign(e, { group: P.group, x, z, ry, hl, hb, k, w });
    },
    off(i) { const e = SEA_HULLS.get(key(i)); if (e) e.k = 0; },
  };
}

// Timber mooring post with a rope collar.
export function post(B, x, z, h = 1.0, o = {}) {
  B.cyl(o.c || 'timber', x, o.y ?? 0, z, 0.16, h, B.rnd() * 6, { sides: 7, taper: 0.9 });
  B.cyl('rope', x, (o.y ?? 0) + h * 0.68, z, 0.18, 0.1, 0, { sides: 7, taper: 1 });
  B.ball(o.c || 'timber', x, (o.y ?? 0) + h, z, 0.15, { sy: 0.5, detail: 0 });
}

// Rope swag between two posts.
export function swag(B, a, c, sag = 0.35) {
  const n = 7;
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n;
    const y0 = a[1] + (c[1] - a[1]) * t0 - Math.sin(t0 * Math.PI) * sag, y1 = a[1] + (c[1] - a[1]) * t1 - Math.sin(t1 * Math.PI) * sag;
    const x0 = a[0] + (c[0] - a[0]) * t0, x1 = a[0] + (c[0] - a[0]) * t1, z0 = a[2] + (c[2] - a[2]) * t0, z1 = a[2] + (c[2] - a[2]) * t1;
    const h = Math.hypot(x1 - x0, z1 - z0);
    B.cyl('rope', x0, y0, z0, 0.035, Math.hypot(h, y1 - y0), Math.atan2(-(z1 - z0), x1 - x0), { sides: 5, taper: 1, rz: -Math.atan2(h, y1 - y0), noAo: true });
  }
}

export default function buildPlot(kit, { line, palette, rng }) {
  const P = kit.plot({
    id: 'fishchips', line, palette, rng, seed: 21,
    colors: {
      accent: '#e44b3c', awn: '#3f7fb5', timber: '#8b6a4e', timber2: '#6f533d', rope: '#d8bf8a', hut: '#f6f1e7', navy: '#3f5577',
      paper: '#f1e9d6', chip: '#f4c24f', batter: '#e8a33c', steel: { c: '#c8ccd2', r: 0.3, m: 0.7 }, fishC: '#9fb6c9', salt: '#eef2f2',
      neonFish: { c: '#5fd6ff', r: 0.4, g: -2.2 }, neonPink: { c: '#ff8fb4', r: 0.4, g: -2.2 }, stock: '#f4c24f', pea: '#7fbf4a',
    },
  });
  const { b, t1, t2, lot, props: K } = P;
  const S = kit.shape;
  const HX = -3.4, HZ = -5.0;
  const SP = S.spire(5, 1, 1, { curve: 1, rings: 2 });

  steps(b);
  const sea = seaPlane(kit, P, { x0: -13.5 - 34, fade0: 28 });
  sea.hull(1, -6.2, -10.3, 0.25, 1.5, 0.62, 0.8, 0);
  for (const [x, z, r, a] of [[-2.4, -12.2, 1.4, 0.5], [9.6, -11.6, 1.1, 2.0], [-7.8, -13.4, 0.9, 4]]) ripple(b, kit, x, z, r, { a0: a });
  rowboat(b, -6.2, -10.3, 0.25);
  hut(b, HX, HZ);
  K.lamp(b, -8.4, -5.0);
  K.bin(b, -7.4, -2.4, { c: 'navy' });
  for (const x of [-9.5, -5.0, -0.6, 7.8]) post(b, x, QZ + 0.35, 0.9);
  swag(b, [-9.5, 0.62, QZ + 0.35], [-5.0, 0.62, QZ + 0.35]);
  swag(b, [-5.0, 0.62, QZ + 0.35], [-0.6, 0.62, QZ + 0.35]);
  for (const x of [0.9, 4.2, 7.2]) { b.slab('rope', x, 0.04, QZ + 0.5, 0.06, 0.06, 1.0, { ry: 0.5, round: 0.02 }); }
  lifeRing(b, -7.2, 0.75, QZ + 0.5);
  K.crate(b, 0.9, -7.45, { ry: 0.3, fill: 'fishC' });
  K.crate(b, 1.0, -7.5, { ry: -0.1, y: 0.47, s: 0.85 });
  lobsterPot(b, -1.6, -7.1);
  lobsterPot(b, -1.0, -6.6, 0.8);
  lobsterPot(b, -1.3, -6.85, 0.7, 0.42);
  netPile(b, 8.2, -6.4);
  K.planter(b, HX - 2.9, HZ + 2.0, { s: 1.0, flowers: true });
  K.planter(b, HX + 2.8, HZ + 2.2, { s: 0.8 });
  aboard(b, -0.6, -2.6, -0.5);
  picnic(b, 6.4, -3.6, 0.25);
  meal(b, 6.15, 0.8, -3.75, 0.3);
  meal(b, 6.75, 0.8, -3.45, -0.5);
  barrels(b, 8.4, -6.4);
  K.planter(b, 8.9, -4.6, { s: 0.9, flowers: true });

  // L25: chippy with a neon fish, picnic benches and string lights
  const AX = 0.6;
  t1.slab('hut', AX, 0, HZ - 0.4, 2.2, 2.0, 2.4, { round: 0.12, taper: 0.03 });
  t1.add(K.roofGeo(2.4, 2.2, 0.6, { col: S.rgb('#eeb64e'), over: 0.2, overZ: 0.18 }), null, { x: AX, y: 2.0, z: HZ - 0.4, ry: Math.PI / 2 });
  K.windowUnit(t1, AX, 0.85, HZ + 0.82, { w: 1.2, h: 0.9 });
  neonFish(t1, AX, 2.25, HZ + 0.86, 0.62);
  picnic(t1, 2.6, -5.6, -0.3);
  meal(t1, 2.4, 0.8, -5.5, 0.2);
  lights(t1, [HX + 1.9, 2.75, HZ + 1.6], [6.4, 2.4, -3.6], 9, 0.35);
  t1.cyl('iron', 6.4, 0, -3.6, 0.04, 2.5, 0, { sides: 5 });

  // L100: seafood hall: a long timber hall with a glazed gable and a giant gilded fish weathervane
  {
    const x = -9.4, z = -5.2;
    t2.slab('#e8d3a8', x, 0, z, 4.2, 3.2, 4.6, { round: 0.14, taper: 0.02 });
    t2.add(K.roofGeo(4.6, 4.2, 1.7, { col: S.rgb('#c9483f'), over: 0.3 }), null, { x, y: 3.2, z, ry: Math.PI / 2 });
    t2.slab('glass', x, 0.4, z + 2.32, 3.0, 2.3, 0.06, { round: 0.03, noAo: true });
    t2.slab('window', x, 1.2, z + 2.35, 2.8, 1.3, 0.03, { noAo: true, g: -0.9 });
    for (let i = 0; i < 4; i++) t2.slab('timber2', x - 1.5 + i, 0.4, z + 2.38, 0.1, 2.4, 0.08, { round: 0.02 });
    t2.awning('awn', x, 2.95, z + 2.9, 4.4, 1.1, 0, { alt: 'white' });
    t2.cyl('iron', x, 4.9, z, 0.04, 1.2, 0, { sides: 5 });
    fishShape(t2, x, 6.05, z, 1.1, 'gold', 0);
    lights(t2, [x - 2.2, 3.1, z + 2.4], [x + 2.2, 3.1, z + 2.4], 11, 0.25);
    picnic(t2, -10.6, -1.6, -0.2);
  }

  // For sale: tarp over crates, a sign
  K.crate(lot, HX - 0.6, HZ + 0.6, { ry: 0.3 });
  K.crate(lot, HX + 0.3, HZ + 0.8, { ry: -0.4, s: 0.85 });
  lot.slab('#7f9fb5', HX - 0.1, 0.45, HZ + 0.7, 1.9, 0.12, 1.3, { round: 0.06, rz: 0.08 });
  K.signPost(lot, HX + 1.8, HZ + 2.0, { c: 'white', w: 1.0 });
  fishShape(lot, HX + 1.8, 1.45, HZ + 2.12, 0.3, 'accent', 0);
  for (const [x, z] of [[-9.5, QZ + 0.4], [-1.5, QZ + 0.4]]) post(lot, x, z, 0.9);

  // Trawler (bobs) with its derrick boom (child) and the swinging fish crate
  const TX = 6.2, TZ = -10.15;
  const trawler = P.dynamic((d) => trawlerGeo(d), { tier: -1 });
  trawler.position.set(TX, WY - 0.5, TZ);
  const boom = P.dynamic((d) => {
    d.ao(0);
    d.cyl('#e9c46a', 0, 0, 0, 0.08, 3.4, 0, { sides: 7, taper: 0.6, rz: -Math.PI / 2 });
    d.ball('iron', 3.35, 0, 0, 0.09, { detail: 0 });
  }, { tier: -1 });
  trawler.remove(boom); P.group.remove(boom); trawler.add(boom);
  boom.position.set(0.6, 3.1, 0);
  const load = P.dynamic((d) => {
    d.ao(0);
    d.cyl('rope', 0, -1.45, 0, 0.02, 1.45, 0, { sides: 5, taper: 1 });
    for (const s of [-1, 1]) d.cyl('rope', 0, -1.45, 0, 0.015, 0.5, 0, { sides: 5, taper: 1, rz: s * 0.55 });
    d.slab('timber', 0, -1.85, 0, 0.75, 0.42, 0.55, { round: 0.05 });
    for (let i = 0; i < 6; i++) d.ball('fishC', -0.25 + (i % 3) * 0.25, -1.41, (i < 3 ? -0.1 : 0.12), 0.11, { sx: 1.9, sy: 0.6, detail: 0, ry: (i % 2) * 0.4 });
  }, { tier: -1 });
  load.position.set(3.35, 0, 0);
  boom.add(load);
  P.group.remove(load);

  // Throughput / boost props, revealed as they're bought
  const thr = extras(kit, P, P.pal, [
    (e) => { fryer(e, HX - 1.15, HZ - 1.15); },
    (e) => { e.slab('hut', HX - 2.3, 0.85, HZ + 0.4, 0.2, 0.9, 1.4, { round: 0.04 }); e.slab('timber', HX - 2.55, 0.92, HZ + 0.4, 0.45, 0.08, 1.4, { round: 0.03 }); e.awning('accent', HX - 2.6, 2.1, HZ + 0.4, 1.6, 0.8, -Math.PI / 2, { alt: 'white' }); },
    (e) => moped(e, 5.0, -2.3, 0.5),
    (e) => { K.bench(e, 2.4, -2.2, { ry: -0.2, wood: 'timber' }); K.bench(e, -0.6, -7.5, { ry: 0.1, wood: 'timber' }); },
    (e) => { for (let i = 0; i < 6; i++) e.slab(i % 2 ? 'paper' : 'white', HX + 2.95 + (i % 2) * 0.05, i * 0.13, HZ + 2.3, 0.5, 0.12, 0.36, { round: 0.03, ry: i * 0.07 }); },
  ]);
  const bst = extras(kit, P, P.pal, [
    (e) => { for (let i = 0; i < 3; i++) K.crate(e, 2.2 + i * 0.8, -7.4 + (i % 2) * 0.3, { ry: 0.2 * i, fill: 'fishC' }); },
    (e) => { e.cyl('pea', HX - 1.2, 1.08, HZ + 1.95, 0.17, 0.2, 0, { sides: 9, taper: 1.1 }); e.cyl('#8fd06a', HX - 1.2, 1.27, HZ + 1.95, 0.15, 0.04, 0, { sides: 9 }); },
    (e) => { e.cyl('timber2', HX - 0.75, 1.08, HZ + 1.95, 0.2, 0.12, 0, { sides: 9, taper: 1.2 }); for (let i = 0; i < 5; i++) e.ball('#f6d35c', HX - 0.75 + Math.cos(i * 1.3) * 0.1, 1.22, HZ + 1.95 + Math.sin(i * 1.3) * 0.1, 0.07, { sx: 1.4, detail: 0 }); },
    (e) => { e.cyl('salt', HX + 0.2, 3.0, HZ + 1.2, 0.28, 0.8, 0, { sides: 9, taper: 0.9 }); e.cyl('steel', HX + 0.2, 3.78, HZ + 1.2, 0.26, 0.22, 0, { sides: 9, taper: 0.7 }); },
  ]);

  // Stock: chip cones on the counter, then fish boxes on the quay
  const cone = kit.builder(P.pal);
  cone.cyl('paper', 0, 0, 0, 0.14, 0.82, 0, { sides: 9, taper: 3.0 });
  cone.cyl('#d2c6b2', 0, 0.38, 0, 0.27, 0.07, 0, { sides: 9, taper: 1.2, noAo: true });
  for (let i = 0; i < 6; i++) cone.slab('chip', Math.cos(i * 1.1) * 0.18, 0.72, Math.sin(i * 1.1) * 0.18, 0.08, 0.36, 0.08, { round: 0.02, rx: Math.sin(i * 1.1) * 0.35, rz: -Math.cos(i * 1.1) * 0.35 });
  cone.ball('batter', 0.05, 0.92, 0, 0.17, { sx: 2.0, sy: 0.8, detail: 1, rz: 0.5 });
  P.pile({ at: [HX + 0.55, 1.08, HZ + 1.95], geo: cone.geometry({ ao: 0.1, aoH: 0.4 }), size: 0.4, max: 6, cols: 3, layout: 'pyramid', range: [0, 0.55] });
  P.pile({ at: [2.6, 0, -6.4], kind: 'crate', color: '#a7c2d6', size: 0.75, max: 5, layout: [[0, 0, 0, 0.1], [0.82, 0, 0.05, -0.2], [0.4, 0.46, 0, 0.15], [-0.75, 0, 0.3, 0.4], [-0.3, 0.46, 0.15, -0.1]], range: [0.55, 1] });

  const gulls = flock(kit, P, 4, 'gull');
  const van = linkVan(kit, P);
  const LANE = 6.2, DEST = { ferry: 27, boatyard: 54 };
  const MY = LINK_BAY.fishchips;
  const route = (D, to) => [[MY[0], MY[1]], [MY[0] + 2.6, LANE], [D + to[0] - 2.6, LANE], [D + to[0], to[1]]];
  const along = (pts, u) => {
    let L = 0; const seg = [];
    for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(l); L += l; }
    let d = u * L, i = 0;
    while (i < seg.length - 1 && d > seg[i]) { d -= seg[i]; i++; }
    const k = Math.min(1, d / seg[i]), a = pts[i], c = pts[i + 1];
    return [a[0] + (c[0] - a[0]) * k, a[1] + (c[1] - a[1]) * k, Math.atan2(-(c[1] - a[1]), c[0] - a[0])];
  };

  const staff = P.crowd({ count: 4, seed: 4, scale: 1.36 });
  staff.look(0, { top: '#f6f1e7', acc: 0, style: 1, hair: 4, skin: 1 }).body(0, 1.2, 0.75, 0.9);
  staff.look(1, { top: '#f6f1e7', acc: 0, style: 3, hair: 2, skin: 3 }).body(1, 1.2, 0.75, 0.88);
  staff.look(2, { top: '#f2b84b', bot: '#3f5577', style: 2, hair: 6, skin: 2 }).body(2, 1.15, 0.85, 0.95);
  staff.look(3, { top: '#7fb5a8', style: 0, hair: 0, skin: 0 }).body(3, 1.15, 0.85, 0.8);
  const folk = P.crowd({ count: 9, seed: 12, scale: 1.36 });
  const q = P.queue(folk, {
    ids: [0, 1, 2, 3, 4, 5], spawn: [[12.5, -1.6], [12.5, -2.2]], counter: [HX - 0.3, HZ + 2.45], dir: [1, 0.1], gap: 0.82, faceCounter: Math.PI,
    exit: [[HX - 2.9, HZ + 2.9], [-9, -1.4], [-13, -1.0]],
    serve: (s) => Math.max(1.4, Math.min(3.4, s?.cycleSec ?? 2)),
  });
  const eaters = [6, 7, 8];
  let tAcc = 0;

  return Object.assign(P.done({
    w: 13.5, cardW: 11.6, d: 9, h: 4,
    camera: { pos: [-4.0, 7.2, 8.8], look: [-0.2, 1.5, -6.0], fov: 32 },
    exit: [[HX + 1.6, 2.4], [6.5, 3.6], [12, 6.1]],
    exitWater: [[TX + 4.5, TZ - 0.4], [TX + 6, -14], [12, -16]],
    update(dt, stats, time, tier, ctx) {
      const owned = ctx.owned, vt = ctx.vt;
      tAcc += dt;
      const t = time;
      trawler.position.y = WY - 0.48 + Math.sin(t * 1.3) * 0.05;
      sea.hull(0, TX, TZ, 0, 3.8, 1.4, 1, 0);
      trawler.rotation.z = Math.sin(t * 0.9) * 0.025;
      trawler.rotation.x = Math.sin(t * 0.7 + 1) * 0.02;
      // derrick: slew from the hold (aft) to the jetty (west), luffing up on the way
      const cyc = Math.max(4, (stats?.cycleSec ?? 3) * 2.4);
      const ph = owned ? (t % cyc) / cyc : 0.1;
      const swing = ph < 0.4 ? smooth(ph / 0.4) : ph < 0.5 ? 1 : ph < 0.9 ? 1 - smooth((ph - 0.5) / 0.4) : 0;
      const lift = Math.sin(Math.min(1, ph < 0.5 ? ph / 0.4 : (ph - 0.5) / 0.4) * Math.PI);
      boom.rotation.set(0, Math.PI * 1.02 + swing * Math.PI * 0.48, 0.42 + lift * 0.28, 'YXZ');
      load.rotation.set(0, 0, -(0.42 + lift * 0.28));
      load.visible = ph < 0.5 || !owned;

      thr.show(owned ? stats?.sigmaUpgrades ?? 0 : 0);
      bst.show(owned ? stats?.boosts ?? 0 : 0);
      const sup = stats?.supply;
      if (owned && sup?.on && DEST[sup.from] && !(sup.phase > 0.45 && sup.phase < 0.6)) {
        const ph = sup.phase, pts = route(DEST[sup.from], LINK_BAY[sup.from]);
        let p;
        if (ph <= 0.12 || ph >= 0.93) p = [MY[0], MY[1], Math.PI];
        else if (ph < 0.45) p = along(pts, smooth((ph - 0.12) / 0.33));
        else { p = along(pts, 1 - smooth((ph - 0.6) / 0.33)); p[2] += Math.PI; }
        van.visible = true;
        van.position.set(p[0], 0, p[1]);
        van.rotation.y = p[2];
      } else van.visible = false;

      const serving = q.serving();
      if (owned) {
        staff.set(0, HX - 0.3, 0.25, HZ + 1.2, 0, serving ? 3 : 0, 0, 5);
        if ((stats?.sigmaUpgrades ?? 0) >= 1) staff.set(1, HX + 0.55, 0.25, HZ - 0.4, Math.PI, 3, 1.4, 4.6); else staff.hide(1);
        const cw = (t * 0.45) % 2, cx = cw < 1 ? cw : 2 - cw;
        staff.set(2, 3.6 - cx * 1.2, 0.02, -7.6 + cx * 0.9, cw < 1 ? -Math.PI * 0.33 : Math.PI * 0.67, cw < 1 ? 2 : 1, 0, 4.8);
        if (stats?.kid) staff.set(3, HX - 1.3, 0.25, HZ + 0.6, 0.2, 3, 2.2, 4); else staff.hide(3);
        const sit = vt >= 1;
        eaters.forEach((i, k) => {
          void sit;
          if (k < 2) { const oz = k ? -0.98 : 0.98; folk.set(i, 6.4 + Math.sin(0.25) * oz, 0.02, -3.6 + Math.cos(0.25) * oz, k ? 0.25 : Math.PI + 0.25, 6, k * 2.1, 2.2); }
          else folk.set(i, -3.2, 0.02, -7.3, Math.PI * 0.95, 0, 0, 1);
        });
      } else { for (let i = 0; i < 4; i++) staff.hide(i); eaters.forEach((i) => folk.hide(i)); }

      // gulls: one wheels over the queue and dives at the leaver, one perches on a post, two circle the trawler
      const lead = q.agents.find((a) => a.st === 'leave');
      const ga = t * 0.7;
      const gx = lead ? lead.x : 3 + Math.cos(ga) * 3.5, gz = lead ? lead.z : 0.5 + Math.sin(ga) * 2;
      gulls.set(0, gx + Math.cos(t * 1.4) * 1.6, 3.2 + Math.sin(t * 2.1) * 0.4 + (lead ? -0.3 : 0.6), gz + Math.sin(t * 1.4) * 1.2, -t * 1.4 + Math.PI / 2, 0.55 + Math.abs(Math.sin(t * 9)) * 0.7, 0.3, 1.0);
      const peck = Math.sin(t * 0.8) > 0.6;
      gulls.set(1, -5.0, 0.97, QZ + 0.35, 2.2 + Math.sin(t * 0.3) * 0.6, 0.35, peck ? 0.3 : 0, 1.0);
      for (let i = 2; i < 4; i++) {
        const a = t * (0.32 + i * 0.05) + i * 2.5;
        gulls.set(i, TX + Math.cos(a) * (4 + i), 5.6 + i * 0.6 + Math.sin(a * 2) * 0.3, TZ - 2 + Math.sin(a) * (3 + i * 0.5), -a, 0.6 + Math.abs(Math.sin(t * 6 + i)) * 0.6, 0.35, 1.0);
      }
      gulls.commit();
    },
  }), { focus: [1.5, -5.5] });

  function smooth(x) { return x * x * (3 - 2 * x); }

  function steps(B) {
    for (let i = 0; i < 4; i++) B.slab('stone2', -3.6, WY - 0.2 + i * 0.16 - 0.5, QZ - 0.5 - (3 - i) * 0.35, 1.4, 0.5, 0.4, { round: 0.04, taper: 0 });
    post(B, -2.6, QZ + 0.35, 0.9);
  }

  function rowboat(B, x, z, ry) {
    const M = S.matrix({ pos: [x, WY - 0.3, z], ry });
    B.add(hullGeo(kit, { len: 2.8, beam: 1.15, depth: 0.55, rise: 0.15, top: '#e9c46a', stripe: '#f6f1e7', bottom: '#5b8fb0', deck: '#b98a5e', n: 7, transom: 0.7 }), null, { aoBase: -1.3, parent: M, r: 0.5 });
    for (const x2 of [-0.5, 0.3]) B.slab('timber', x2, 0.45, 0, 0.22, 0.05, 1.0, { aoBase: -1.3, parent: M, round: 0.02 });
    for (const s of [-1, 1]) B.slab('timber2', 0, 0.6, s * 0.6, 1.5, 0.04, 0.08, { aoBase: -1.3, parent: M, round: 0.01, ry: s * 0.25 });
  }

  function barrels(B, x, z) {
    for (const [dx, dz, y] of [[0, 0, 0], [0.62, 0.1, 0], [0.3, -0.5, 0], [0.3, -0.1, 0.78]]) {
      B.cyl('timber', x + dx, y, z + dz, 0.3, 0.76, 0, { sides: 9, taper: 1.0 });
      for (const h of [0.12, 0.6]) B.cyl('iron', x + dx, y + h, z + dz, 0.31, 0.05, 0, { sides: 9, taper: 1, noAo: true });
    }
  }

  function netPile(B, x, z) {
    for (let i = 0; i < 6; i++) B.ball(i % 2 ? '#5aa39a' : '#4f8a84', x + Math.cos(i * 1.7) * 0.35, 0.18 + (i > 3 ? 0.18 : 0), z + Math.sin(i * 1.7) * 0.28, 0.32, { sy: 0.55, detail: 1 });
    for (let i = 0; i < 4; i++) B.ball('#f2a65a', x + Math.cos(i * 2.2) * 0.5, 0.3, z + Math.sin(i * 2.2) * 0.4, 0.09, { detail: 0 });
  }

  function jetty(B) {
    const x0 = 3.6, x1 = 5.6, z0 = QZ + 0.2, z1 = -16.2;
    const n = 15;
    for (let i = 0; i < n; i++) {
      const z = z0 - ((i + 0.5) / n) * (z0 - z1);
      B.slab(i % 3 ? 'timber' : 'timber2', (x0 + x1) / 2, 0.02, z, x1 - x0 + 0.1 * B.rnd(), 0.1, (z0 - z1) / n - 0.06, { round: 0.02, ry: (B.rnd() - 0.5) * 0.03, taper: 0 });
    }
    for (const x of [x0 + 0.1, x1 - 0.1]) B.slab('timber2', x, -0.12, (z0 + z1) / 2, 0.16, 0.16, z0 - z1, { round: 0.04, taper: 0 });
    for (let z = z0 - 1; z > z1; z -= 2.4) for (const x of [x0 + 0.1, x1 - 0.1]) B.cyl('timber2', x, WY - 1.6, z, 0.15, 1.75, 0, { aoBase: -1.3, sides: 7, taper: 0.95 });
    for (const z of [z0 - 2.2, z0 - 5.0, z1 + 0.4]) { post(B, x1 - 0.05, z, 0.85); post(B, x0 + 0.05, z, 0.85); }
    swag(B, [x1 - 0.05, 0.6, z0 - 2.2], [x1 - 0.05, 0.6, z0 - 5.0]);
    swag(B, [x0 + 0.05, 0.6, z0 - 2.2], [x0 + 0.05, 0.6, z0 - 5.0]);
    for (let z = z0 - 1.2; z > z1; z -= 1.8) B.slab('#2f3a3c', x1 + 0.14, WY - 0.05, z, 0.14, 0.5, 0.6, { aoBase: -1.3, round: 0.06 });
  }

  function hut(B, x, z) {
    const W = 4.6, D = 3.4, H = 2.7, T = 0.2, h0 = 1.0, h1 = 2.4, hx0 = -1.95, hx1 = 1.15;
    B.slab('stone2', x, 0, z, W + 0.2, 0.25, D + 0.2, { round: 0.06 });
    B.slab('#cfd6d8', x, 0.22, z, W - 0.2, 0.06, D - 0.2, { round: 0.02, taper: 0 });
    B.slab('hut', x, 0.2, z - D / 2 + T / 2, W, H - 0.2, T, { round: 0.08, taper: 0.01 });
    for (const sd of [-1, 1]) B.slab('hut', x + sd * (W / 2 - T / 2), 0.2, z, T, H - 0.2, D, { round: 0.08, taper: 0.01 });
    B.slab('hut', x, 0.2, z + D / 2 - T / 2, W, h0 - 0.2, T, { round: 0.06, taper: 0 });
    B.slab('hut', x, h1, z + D / 2 - T / 2, W, H - h1, T, { round: 0.06, taper: 0 });
    B.slab('hut', x + (hx1 + W / 2) / 2, h0, z + D / 2 - T / 2, W / 2 - hx1, h1 - h0, T, { round: 0.06, taper: 0 });
    B.slab('hut', x + (hx0 - W / 2) / 2, h0, z + D / 2 - T / 2, hx0 + W / 2, h1 - h0, T, { round: 0.04, taper: 0 });
    B.slab('#f3e8d0', x, H - 0.06, z, W - 0.3, 0.08, D - 0.3, { round: 0.02, taper: 0 });
    for (let i = 0; i < 8; i++) B.slab(i % 2 ? '#bcd4e2' : '#9cc3d6', x - W / 2 + 0.35 + i * 0.56, 0.25, z + D / 2 + 0.01, 0.5, 0.6, 0.04, { round: 0.02, taper: 0, noAo: true });
    // inside: menu board, fryers along the back, a warm hanging lamp
    B.slab('#33404a', x - 0.4, 1.35, z - D / 2 + T + 0.03, 2.2, 0.7, 0.05, { round: 0.03 });
    for (let i = 0; i < 4; i++) B.slab(['#f4c24f', '#f6f1e7', '#7fd1c7', '#f6f1e7'][i], x - 1.05 + (i % 2) * 1.2, 1.5 + Math.floor(i / 2) * 0.25, z - D / 2 + T + 0.07, 0.8, 0.06, 0.02, { round: 0.01, noAo: true });
    fryer(B, x + 0.55, z - D / 2 + T + 0.35);
    B.slab('steel', x - 1.15, 0.25, z - D / 2 + T + 0.3, 1.2, 0.8, 0.55, { round: 0.05 });
    B.cyl('iron', x - 0.4, h1 - 0.1, z + 0.2, 0.015, 0.3, 0, { sides: 5 });
    B.cone({ c: '#f2b84b', g: 0.6 }, x - 0.4, h1 - 0.32, z + 0.2, 0.2, 0.22, 0, { sides: 7 });
    // serving counter outside the hatch
    B.slab('#f3e8d0', x + (hx0 + hx1) / 2, h0 - 0.02, z + D / 2 - T / 2, hx1 - hx0, 0.06, T + 0.04, { round: 0.01, taper: 0 });
    B.slab('timber', x + (hx0 + hx1) / 2, h0 - 0.04, z + D / 2 + 0.24, hx1 - hx0 + 0.3, 0.1, 0.5, { round: 0.04 });
    for (const sx of [hx0 + 0.1, hx1 - 0.1]) B.slab('timber2', x + sx, 0.25, z + D / 2 + 0.36, 0.08, h0 - 0.3, 0.08, { round: 0.02, rx: 0.2 });
    B.awning('awn', x + (hx0 + hx1) / 2, 2.75, z + D / 2 + 0.5, 3.9, 1.0, 0, { alt: 'white', drop: 0.32 });
    K.windowUnit(B, x + 1.75, 1.05, z + D / 2 + 0.02, { w: 0.62, h: 0.8, shutter: 'awn' });
    const RH = 1.75;
    B.add(K.roofGeo(W, D, RH, { col: S.rgb('#86b9d9'), over: 0.3, overZ: 0.32 }), null, { x, y: H, z });
    B.slab('#f6f1e7', x, H + RH + 0.02, z, 0.24, 0.14, D + 0.66, { round: 0.06, taper: 0 });
    const gm = new S.Mesh();
    gm.tri([-W / 2, 0, 0], [W / 2, 0, 0], [0, RH, 0], S.rgb('#f6f1e7'));
    gm.tri([W / 2, 0, -0.03], [-W / 2, 0, -0.03], [0, RH, -0.03], S.rgb('#f6f1e7'));
    for (const s of [-1, 1]) B.add(gm.geo(), null, { x, y: H, z: z + s * (D / 2 - 0.01), ry: s > 0 ? 0 : Math.PI, noAo: true });
    K.windowUnit(B, x, H + 0.35, z + D / 2 + 0.02, { w: 0.7, h: 0.75 });
    B.slab('brick', x + 1.3, H + 0.2, z - 0.9, 0.55, 1.6, 0.6, { round: 0.06, taper: 0.05 });
    B.slab('trim', x + 1.3, H + 1.76, z - 0.9, 0.7, 0.13, 0.75, { round: 0.04 });
    // the fish: big painted sign on the ridge, the hut's silhouette mark
    B.cyl('iron', x, H + RH - 0.1, z + 0.6, 0.04, 0.5, 0, { sides: 5 });
    fishShape(B, x, H + RH + 0.75, z + 0.6, 0.95, '#f2a65a', 0);
    lifeRing(B, x - 2.32, 1.5, z + 0.6, Math.PI / 2);
    K.door(B, x - W / 2 - 0.03, 0.25, z - 0.4, { ry: -Math.PI / 2, color: 'navy' });

  }

  function fishShape(B, x, y, z, s, col, ry, flat = false) {
    const k = flat ? 0.3 : 1;
    B.ball(col, x, y, z, 0.5 * s, { sx: 1.5, sy: 0.82, sz: 0.36 * k, detail: 1, smooth: true, ry });
    B.add(SP, col, { x: x - 1.25 * s * Math.cos(ry), y, z: z + 1.25 * s * Math.sin(ry), sx: 0.36 * s, sy: 0.62 * s, sz: 0.12 * k, rz: -Math.PI / 2, ry });
    B.ball('white', x + 0.48 * s * Math.cos(ry), y + 0.1 * s, z + 0.17 * s * k, 0.09 * s, { detail: 0 });
    B.ball('#2a2a33', x + 0.5 * s * Math.cos(ry), y + 0.1 * s, z + 0.22 * s * k, 0.045 * s, { detail: 0 });
    B.add(SP, col, { x: x - 0.1 * s, y: y + 0.3 * s, z, sx: 0.22 * s, sy: 0.3 * s, sz: 0.06 * k, rz: 0.6, ry });
  }

  function neonFish(B, x, y, z, s) {
    B.slab('#2f3448', x, y - 0.45, z, 1.9 * s, 1.0 * s, 0.12, { round: 0.06 });
    B.ball('neonFish', x - 0.05, y + 0.05 - 0.45 + 0.5 * s, z + 0.08, 0.32 * s, { sx: 1.6, sy: 0.75, sz: 0.2, detail: 1 });
    B.add(SP, 'neonFish', { x: x - 0.85 * s, y: y - 0.45 + 0.55 * s, z: z + 0.08, sx: 0.24 * s, sy: 0.36 * s, sz: 0.05, rz: -Math.PI / 2 });
    B.ball('neonPink', x + 0.62 * s, y - 0.45 + 0.66 * s, z + 0.08, 0.07 * s, { detail: 0 });
    B.ball('neonPink', x + 0.78 * s, y - 0.45 + 0.84 * s, z + 0.08, 0.05 * s, { detail: 0 });
    B.cyl('iron', x - 0.6, y - 1.25, z - 0.05, 0.03, 0.8, 0, { sides: 5 });
    B.cyl('iron', x + 0.6, y - 1.25, z - 0.05, 0.03, 0.8, 0, { sides: 5 });
  }

  function lifeRing(B, x, y, z, ry = 0) {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      B.ball(i % 2 ? 'white' : 'accent', x + Math.cos(a) * 0.26 * Math.cos(ry), y + Math.sin(a) * 0.26, z - Math.cos(a) * 0.26 * Math.sin(ry), 0.1, { detail: 0, sx: 1.3 });
    }
  }

  function lobsterPot(B, x, z, s = 1, y = 0) {
    B.slab('#5e7f8a', x, y, z, 0.7 * s, 0.08, 0.5 * s, { round: 0.03 });
    for (let i = 0; i < 4; i++) B.slab('timber', x - 0.28 * s + i * 0.187 * s, y + 0.05, z, 0.04, 0.42 * s, 0.52 * s, { round: 0.02, taper: 0.4 });
    B.slab('rope', x, y + 0.4 * s, z, 0.72 * s, 0.05, 0.36 * s, { round: 0.02 });
  }

  function aboard(B, x, z, ry) {
    for (const s of [-1, 1]) B.slab('timber', x, 0, z + s * 0.16, 0.7, 1.05, 0.05, { ry, rx: s * 0.16, round: 0.02 });
    B.slab('#33404a', x, 0.25, z + 0.24, 0.56, 0.6, 0.02, { ry, rx: 0.16, round: 0.02 });
    fishShape(B, x + 0.04, 0.68, z + 0.31, 0.2, 'chip', -ry, true);
  }

  function meal(B, x, y, z, ry) {
    const M = S.matrix({ pos: [x, y, z], ry });
    B.slab('paper', 0, 0, 0, 0.62, 0.05, 0.4, { parent: M, round: 0.02 });
    B.ball('batter', -0.1, 0.1, 0, 0.13, { parent: M, sx: 1.9, sy: 0.6, detail: 1 });
    for (let i = 0; i < 6; i++) B.slab('chip', 0.14 + (i % 3) * 0.06, 0.06 + Math.floor(i / 3) * 0.04, -0.08 + (i % 2) * 0.12, 0.2, 0.05, 0.05, { parent: M, round: 0.015, ry: i * 0.5 });
    B.ball('#f2e86a', -0.24, 0.07, 0.12, 0.04, { parent: M, sx: 1.4, detail: 0 });
  }

  function picnic(B, x, z, ry) {
    const M = S.matrix({ pos: [x, 0, z], ry });
    B.slab('timber', 0, 0.72, 0, 1.6, 0.08, 0.8, { parent: M, round: 0.03 });
    for (const s of [-1, 1]) {
      B.slab('timber', 0, 0.42, s * 0.75, 1.6, 0.07, 0.3, { parent: M, round: 0.03 });
      B.slab('timber2', s * 0.6, 0, 0, 0.08, 0.72, 1.7, { parent: M, round: 0.02, rx: 0 });
    }
  }

  function fryer(B, x, z) {
    B.slab('steel', x, 0.25, z, 1.0, 0.85, 0.6, { round: 0.06 });
    for (const s of [-0.24, 0.24]) {
      B.slab({ c: '#ffb347', g: 0.9 }, x + s, 1.08, z, 0.38, 0.03, 0.42, { round: 0.01, noAo: true });
      B.slab('steel', x + s, 1.2, z + 0.05, 0.3, 0.16, 0.26, { round: 0.03, taper: 0 });
      B.cyl('iron', x + s, 1.3, z + 0.25, 0.02, 0.3, 0, { sides: 5, rx: 0.9 });
    }
  }

  function moped(B, x, z, ry) {
    const M = S.matrix({ pos: [x, 0, z], ry });
    for (const s of [-1, 1]) {
      B.add(S.drum(11, 0.24, 0.12), 'dark', { parent: M, x: s * 0.55, y: 0.24, z: 0, rx: Math.PI / 2 });
    }
    B.slab('#7fd1c7', 0.1, 0.25, 0, 1.0, 0.28, 0.35, { parent: M, round: 0.12 });
    B.slab('#7fd1c7', 0.55, 0.3, 0, 0.18, 0.75, 0.3, { parent: M, round: 0.07, rz: -0.25 });
    B.slab('dark', -0.15, 0.55, 0, 0.6, 0.12, 0.3, { parent: M, round: 0.05 });
    B.slab('steel', 0.65, 1.05, 0, 0.08, 0.06, 0.65, { parent: M, round: 0.02 });
    B.slab('#e44b3c', -0.5, 0.58, 0, 0.5, 0.45, 0.45, { parent: M, round: 0.08 });
  }

  function trawlerGeo(d) {
    d.add(hullGeo(kit, { len: 7.4, beam: 2.7, depth: 1.45, rise: 0.55, top: '#2f6f88', stripe: '#f6f1e7', bottom: '#c9483f', deck: '#b98a5e' }), null, { r: 0.4 });
    d.slab('white', -1.6, 1.4, 0, 2.0, 1.55, 1.9, { round: 0.14, taper: 0.06 });
    for (let i = 0; i < 3; i++) d.slab('glass', -0.58, 2.2, -0.6 + i * 0.6, 0.05, 0.45, 0.45, { round: 0.03, noAo: true });
    for (const s of [-1, 1]) for (let i = 0; i < 2; i++) d.slab('glass', -2.1 + i * 0.75, 2.2, s * 0.94, 0.45, 0.42, 0.05, { round: 0.03, noAo: true });
    d.slab('#c9483f', -1.6, 2.95, 0, 2.3, 0.12, 2.15, { round: 0.05 });
    d.cyl('#c9483f', -2.0, 3.0, 0.2, 0.18, 0.55, 0, { sides: 7, taper: 0.9 });
    d.cyl('#2a2a33', -2.0, 3.52, 0.2, 0.19, 0.08, 0, { sides: 7 });
    d.cyl('white', 0.6, 1.4, 0, 0.09, 4.0, 0, { sides: 7, taper: 0.6 });
    d.cyl('white', 0.6, 4.2, 0, 0.05, 0.3, 0, { sides: 5 });
    d.ball('bulb', 0.6, 5.4, 0, 0.08, { detail: 0 });
    d.slab('white', 0.6, 4.6, 0, 0.08, 0.06, 1.2, { round: 0.02 });
    for (const s of [-1, 1]) d.cyl('white', 0.6, 3.1, s * 0.05, 0.04, 2.2, 0, { sides: 5, rx: s * 1.0 });
    d.add(kit.shape.drum(9, 0.36, 1.2), '#e9c46a', { x: -3.0, y: 1.85, z: 0, rx: Math.PI / 2 });
    for (let i = 0; i < 3; i++) d.slab(i % 2 ? '#9fb6c9' : '#e9c46a', 1.6 + i * 0.4, 1.3, 0.3 - i * 0.25, 0.55, 0.32, 0.42, { round: 0.04, ry: i * 0.3 });
    d.slab('#2f6f88', 2.6, 1.32, 0, 0.6, 0.4, 0.9, { round: 0.06 });
    for (const s of [-1, 1]) for (let i = 0; i < 4; i++) d.slab('#2f3a3c', -2.4 + i * 1.4, 0.95, s * 1.38, 0.5, 0.35, 0.12, { round: 0.06 });
    lifeRingOn(d, -1.6, 1.85, 0.96);
  }

  function lifeRingOn(B, x, y, z) {
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; B.ball(i % 2 ? 'white' : 'accent', x + Math.cos(a) * 0.24, y + Math.sin(a) * 0.24, z + 0.02, 0.09, { detail: 0, sx: 1.3 }); }
  }
}
