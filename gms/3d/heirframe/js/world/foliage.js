import * as THREE from 'three';
import { rng, makeCanvas, canvasTexture } from './textures.js';

// Wind sway on any foliage material (uses world height above its base).
export function swayFoliage(material, time, fade) {
  material.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = time;
    if (fade) addFade(sh, fade);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
{
  vec3 wp = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
  float k = smoothstep( 1.0, 6.0, color.b * 10.0 );
  transformed.x += sin( uTime * 1.3 + wp.x * 0.35 + wp.z * 0.2 ) * 0.08 * k;
  transformed.z += cos( uTime * 1.1 + wp.x * 0.25 ) * 0.06 * k;
}`);
  };
  material.customProgramCacheKey = () => 'sway';
  return material;
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const trunkGeo = new THREE.CylinderGeometry(0.1, 0.19, 1, 7);
trunkGeo.translate(0, 0.5, 0);
const branchGeo = new THREE.CylinderGeometry(0.04, 0.08, 1, 5);
branchGeo.translate(0, 0.5, 0);

// Leaf atlas 768x256: [broadleaf spray | fine hedge | flowering hedge]. Drawn once, shared by every tree.
export function makeLeafAtlas() {
  const w = 768, h = 256, c = makeCanvas(w, h), x = c.getContext('2d');
  const R = rng(4242);
  const leaf = (cx, cy, ang, len, wid, col, rib) => {
    x.save(); x.translate(cx, cy); x.rotate(ang);
    x.fillStyle = col; x.beginPath(); x.moveTo(0, 0);
    x.quadraticCurveTo(len * 0.45, -wid, len, 0); x.quadraticCurveTo(len * 0.45, wid, 0, 0); x.fill();
    if (rib) { x.strokeStyle = rib; x.lineWidth = 1; x.beginPath(); x.moveTo(len * 0.1, 0); x.lineTo(len * 0.85, 0); x.stroke(); }
    x.restore();
  };
  const green = (l, sat = 1) => `rgb(${(40 + 44 * l) * sat | 0},${70 + 74 * l | 0},${(20 + 26 * l) * sat | 0})`;
  // broadleaf: a dense rounded clump, shaded darker toward the core, ragged at the rim
  for (let i = 0; i < 420; i++) {
    const a = R() * Math.PI * 2, r = Math.pow(R(), 0.6) * 108, px = 128 + Math.cos(a) * r, py = 128 + Math.sin(a) * r;
    const l = 0.15 + 0.85 * Math.pow(i / 420, 0.7) * (0.55 + 0.45 * R());
    leaf(px, py, a + (R() - 0.5) * 1.6, 17 + R() * 11, 6 + R() * 3, green(l), 'rgba(20,40,10,0.3)');
  }
  // fine hedge: dense tiny leaves in a soft round clump
  for (let i = 0; i < 700; i++) {
    const a = R() * Math.PI * 2, r = Math.sqrt(R()) * 112, px = 256 + 128 + Math.cos(a) * r, py = 128 + Math.sin(a) * r;
    leaf(px, py, R() * 7, 9 + R() * 6, 3 + R() * 2, green(0.2 + R() * 0.8 * (1 - r / 160)), null);
  }
  // flowering hedge: same clump with white / pink / gold blossoms
  for (let i = 0; i < 520; i++) {
    const a = R() * Math.PI * 2, r = Math.sqrt(R()) * 112, px = 512 + 128 + Math.cos(a) * r, py = 128 + Math.sin(a) * r;
    leaf(px, py, R() * 7, 9 + R() * 6, 3 + R() * 2, green(0.2 + R() * 0.7), null);
  }
  const petals = ['#fff6ec', '#ffd6e2', '#f7c96a', '#ffffff'];
  for (let i = 0; i < 90; i++) {
    const a = R() * Math.PI * 2, r = Math.sqrt(R()) * 100, px = 512 + 128 + Math.cos(a) * r, py = 128 + Math.sin(a) * r;
    const col = petals[(R() * petals.length) | 0];
    for (let k = 0; k < 5; k++) leaf(px, py, k * 1.2566 + R(), 6, 3, col, null);
    x.fillStyle = '#e8b030'; x.beginPath(); x.arc(px, py, 1.6, 0, 7); x.fill();
  }
  const t = canvasTexture(c);
  t.anisotropy = 4;
  return t;
}

export function createLeafMaterial(atlas, time, fade) {
  const m = new THREE.MeshStandardMaterial({ map: atlas, alphaTest: 0.45, side: THREE.DoubleSide, vertexColors: true,
    roughness: 0.62, metalness: 0, envMapIntensity: 0.8, emissive: new THREE.Color(0.02, 0.035, 0.008) });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = time;
    if (fade) addFade(sh, fade);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
{
  vec3 wp = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
  float ph = wp.x * 0.35 + wp.z * 0.22;
  transformed.x += sin( uTime * 1.3 + ph ) * 0.06 + sin( uTime * 4.1 + wp.y * 3.0 + wp.x * 5.0 ) * 0.015;
  transformed.z += cos( uTime * 1.1 + ph ) * 0.05;
  transformed.y += sin( uTime * 3.3 + wp.z * 4.0 ) * 0.012;
}`);
    // back faces of a card still read as lit foliage, not black
    sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
normal = faceDirection < 0.0 ? -normal : normal;`);
  };
  m.customProgramCacheKey = () => 'leaves' + (fade ? 'f' : '');
  m.userData.reflect = true;
  return m;
}

// Quad cards at `centers`; normals point away from `hub` so a canopy lights like one soft volume.
function cards(list, hub, region, size, colorFn, R, { upBias = 0.35, sq = [1, 1] } = {}) {
  const n = list.length, pos = new Float32Array(n * 12), nor = new Float32Array(n * 12), uv = new Float32Array(n * 8), col = new Float32Array(n * 12);
  const idx = new Uint16Array(n * 6);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), d = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3();
  list.forEach((c, i) => {
    d.copy(c).sub(hub); d.y *= 1.4; d.normalize().lerp(up, upBias).normalize();
    d.x += (R() - 0.5) * 0.9; d.y += (R() - 0.5) * 0.6; d.z += (R() - 0.5) * 0.9; d.normalize();
    a.set(1, 0, 0); if (Math.abs(d.x) > 0.9) a.set(0, 0, 1);
    b.crossVectors(d, a).normalize(); a.crossVectors(b, d).normalize();
    const rot = R() * Math.PI * 2, ca = Math.cos(rot), sa = Math.sin(rot);
    const e1 = a.clone().multiplyScalar(ca).addScaledVector(b, sa), e2 = a.clone().multiplyScalar(-sa).addScaledVector(b, ca);
    const s = size * (0.75 + R() * 0.5);
    const tint = colorFn(c, i);
    [[-1, -1, 0, 0], [1, -1, 1, 0], [1, 1, 1, 1], [-1, 1, 0, 1]].forEach(([u, w, tu, tv], k) => {
      v.copy(c).addScaledVector(e1, u * s * 0.5 * sq[0]).addScaledVector(e2, w * s * 0.5 * sq[1]);
      pos.set([v.x, v.y, v.z], (i * 4 + k) * 3);
      const nv = v.clone().sub(hub); nv.y = nv.y * 1.2 + 0.6 * nv.length(); nv.normalize();
      nor.set([nv.x, nv.y, nv.z], (i * 4 + k) * 3);
      uv.set([region[0] + tu * (region[1] - region[0]), tv], (i * 4 + k) * 2);
      col.set([tint.r, tint.g, tint.b], (i * 4 + k) * 3);
    });
    idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}

const LEAF = [0, 1 / 3], HEDGE = [1 / 3, 2 / 3], BLOOM = [2 / 3, 1];

// One broadleaf tree: trunk + a few limbs + a canopy of ~40 alpha-tested leaf cards.
export function addTree(batch, M, x, y, z, seed = 1, scale = 1) {
  const R = rng(seed * 7919 + 13);
  const h = (3.2 + R() * 1.6) * scale;
  _m.compose(_p.set(x, y, z), _q.identity(), _s.set(scale, h * 0.78, scale));
  batch.add(trunkGeo, M.bark, { matrix: _m });
  const hub = new THREE.Vector3(x, y + h, z);
  const rad = (1.55 + R() * 0.4) * scale, ht = (1.05 + R() * 0.3) * scale;
  const limbs = 3 + (R() * 2 | 0);
  for (let i = 0; i < limbs; i++) {
    const a = i / limbs * Math.PI * 2 + R();
    const tip = new THREE.Vector3(x + Math.sin(a) * rad * 0.6, y + h + (R() - 0.2) * ht * 0.6, z + Math.cos(a) * rad * 0.6);
    const base = new THREE.Vector3(x, y + h * 0.62, z);
    const dir = tip.clone().sub(base), len = dir.length();
    _q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    _m.compose(base, _q, _s.set(scale, len, scale));
    batch.add(branchGeo, M.bark, { matrix: _m, cast: false });
  }
  const pts = [];
  const lobes = [...Array(3 + (R() * 2 | 0))].map(() => new THREE.Vector3((R() - 0.5) * rad * 0.9, (R() - 0.3) * ht * 0.6, (R() - 0.5) * rad * 0.9));
  const n = Math.round(60 + R() * 16);
  for (let i = 0; i < n; i++) {
    const lb = lobes[i % lobes.length];
    const u = R() * 2 - 1, t = R() * Math.PI * 2, rr = Math.pow(R(), 0.35) * 0.72;
    const q = Math.sqrt(1 - u * u);
    pts.push(new THREE.Vector3(hub.x + lb.x + q * Math.cos(t) * rad * rr, hub.y + lb.y + u * ht * rr, hub.z + lb.z + q * Math.sin(t) * rad * rr));
  }
  const hue = R();
  const col = new THREE.Color();
  const g = cards(pts, hub, LEAF, 1.05 * scale, (c) => {
    const k = (c.y - hub.y) / ht * 0.5 + 0.5, rr = Math.hypot(c.x - hub.x, c.z - hub.z) / rad;
    const l = 0.36 + 0.5 * Math.min(1, Math.max(0, k)) + 0.18 * rr;
    return col.setRGB(l * (0.95 + hue * 0.25), l * (1.02 - hue * 0.06), l * (0.8 + hue * 0.1));
  }, R);
  batch.add(g, M.leaves, { vcolor: true });
}

// Hedge + a few blossom clumps filling a planter bed.
export function addShrubs(batch, M, x, y, z, len, wid, rot, seed = 1, count = 8) {
  const R = rng(seed * 104729 + 7);
  const c = Math.cos(rot), s = Math.sin(rot);
  const pts = [], n = Math.round(count * 4), bloom = R() < 0.6;
  for (let i = 0; i < n; i++) {
    const lx = (R() - 0.5) * len * 0.92, lz = (R() - 0.5) * wid * 0.75;
    pts.push(new THREE.Vector3(x + lx * c + lz * s, y + 0.12 + R() * 0.32, z - lx * s + lz * c));
  }
  const hub = new THREE.Vector3(x, y - 0.6, z), col = new THREE.Color();
  const tone = (p) => { const l = 0.62 + (p.y - y) * 0.9; return col.setRGB(l, l * 1.03, l * 0.85); };
  const hedge = pts.filter((_, i) => !bloom || i % 4);
  batch.add(cards(hedge, hub, HEDGE, 0.9, tone, R, { upBias: 0.7 }), M.leaves, { vcolor: true, cast: false });
  if (bloom) batch.add(cards(pts.filter((_, i) => i % 4 === 0).map((p) => p.setY(p.y + 0.08)), hub, BLOOM, 0.8, tone, R, { upBias: 0.8 }), M.leaves, { vcolor: true, cast: false });
}

// Dithered see-through for occluders standing between the camera and the player.
export function addFade(sh, fade) {
  Object.assign(sh.uniforms, fade);
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
uniform vec2 uFadeC; uniform float uFadeR, uFadeZ;`).replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
#ifdef USE_FOG
{
  float fd = length(gl_FragCoord.xy - uFadeC);
  if (vFogDepth < uFadeZ - 1.5 && fd < uFadeR) {
    float amt = 1.0 - smoothstep(uFadeR * 0.55, uFadeR, fd);
    float h = fract(sin(dot(floor(gl_FragCoord.xy), vec2(12.9898, 78.233))) * 43758.5453);
    if (h < amt * 0.8) discard;
  }
}
#endif`);
}
export function fadeMaterial(material, fade) {
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (sh, r) => { prev?.call(material, sh, r); addFade(sh, fade); };
  const k = material.customProgramCacheKey?.call(material) || '';
  material.customProgramCacheKey = () => k + 'fade';
}
