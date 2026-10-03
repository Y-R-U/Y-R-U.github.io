import * as THREE from 'three';
import * as S from './shape.js?v=20261004a';
import { WORLD_LIGHT_HEAD, WORLD_LIGHT_FRAG, WORLD_POS_VERT } from './materials.js?v=20261004a';

// Chibi townsfolk: one merged rig, one InstancedMesh per crowd, limbs animated in the vertex shader.
// aPart = (limb, colourSlot, style). limb: 0 body 1/2 legs 3/4 arms 5 head 6 carried item 7 apron.
// colourSlot: 0 baked 1 top 2 bottom 3 skin 4 hair. style: -1 always, 0..4 hair styles, 10+n accessory n.
export const CLIP = { idle: 0, walk: 1, carry: 2, work: 3, cheer: 4, sit: 5, sip: 6, sweep: 7 };
export const SKIN = ['#f8cfae', '#efb98f', '#dc9c70', '#bd7b51', '#8f5838', '#fad6bd'];
export const HAIR = ['#5a3a2c', '#7c4a2c', '#b8743e', '#e8bc66', '#46343c', '#cc6440', '#e0dbd3', '#a09692', '#3c3a52', '#a8503a'];
export const CROWD_K = 1.22;
const STYLES = 7;
export const OUTFITS = ['#e8776a', '#f2b84b', '#4fa89a', '#6f8fd8', '#e58fb0', '#7fbf5a', '#f29a5c', '#a07ad6', '#3f9ac9', '#f4d06f', '#e9e4da', '#d9545e'];
export const PANTS = ['#4a5878', '#6b5a7d', '#3f6b74', '#8a6a52', '#5b5f66', '#7a4f5a', '#2f4a66', '#c9b08a', '#5f7d4a'];

let baseGeo = null;
function rigGeometry() {
  if (baseGeo) return baseGeo;
  const parts = [];
  const P = (geo, m, limb, slot, style = -1, col = '#ffffff') => {
    S.paint(geo, col);
    geo.applyMatrix4(m);
    parts.push({ geo, limb, slot, style });
  };
  const M = (x, y, z, sx = 1, sy = sx, sz = sx, rx = 0, ry = 0, rz = 0) => S.matrix({ pos: [x, y, z], scale: [sx, sy, sz], rx, ry, rz });
  const ball = (d = 1, j = 0.03) => S.smooth(S.blob(1, d, { jitter: j, rng: () => 0.5 }));
  for (const sx of [-1, 1]) {
    const leg = sx < 0 ? 1 : 2, arm = sx < 0 ? 3 : 4;
    P(ball(0), M(sx * 0.075, 0.045, 0.03, 0.065, 0.045, 0.095), leg, 0, -1, '#4a3a3a');
    P(S.prism(7, 0.062, 0.07, 0.34), M(sx * 0.075, 0.05, 0), leg, 2);
    P(S.prism(7, 0.06, 0.066, 0.27), M(sx * 0.19, 0.42, 0, 1, 1, 1, 0, 0, -sx * 0.12), arm, 1);
    P(ball(1), M(sx * 0.215, 0.405, 0.005, 0.056), arm, 3);
  }
  P(S.smooth(S.prism(9, 0.165, 0.125, 0.4, { rings: 2, squash: 0.82 })), M(0, 0.34, 0), 0, 1);
  P(ball(1), M(0, 0.36, 0, 0.17, 0.09, 0.14), 0, 2);
  P(S.prism(7, 0.055, 0.05, 0.08), M(0, 0.72, 0), 5, 3);
  P(ball(1), M(0, 0.98, 0.01, 0.255, 0.24, 0.245), 5, 3);
  for (const sx of [-1, 1]) {
    P(ball(1), M(sx * 0.092, 0.962, 0.222, 0.05, 0.066, 0.032), 5, 0, -1, '#241a2c');
    P(ball(0), M(sx * 0.092 + 0.016, 0.985, 0.25, 0.017, 0.02, 0.01), 5, 0, -1, '#ffffff');
    P(ball(0), M(sx * 0.092 - 0.012, 0.938, 0.252, 0.008, 0.009, 0.006), 5, 0, -1, '#ffffff');
    P(ball(0), M(sx * 0.165, 0.9, 0.195, 0.05, 0.03, 0.02), 5, 0, -1, '#f38f92');
    P(ball(0), M(sx * 0.094, 1.055, 0.218, 0.05, 0.014, 0.016, 0, 0, sx * -0.2), 5, 4, -1);
  }
  P(ball(0), M(0, 0.882, 0.236, 0.045, 0.016, 0.014), 5, 0, -1, '#a3404c');
  P(ball(0), M(0, 0.925, 0.252, 0.022, 0.018, 0.016), 5, 3, -1);
  P(ball(1), M(0, 1.0, -0.06, 0.285, 0.29, 0.27), 5, 4, 5);
  P(ball(1), M(0, 0.78, -0.12, 0.24, 0.24, 0.16), 5, 4, 5);
  P(ball(1), M(0, 1.13, 0.1, 0.235, 0.1, 0.14, 0.35), 5, 4, 5);
  P(ball(1), M(0, 1.02, -0.04, 0.27, 0.23, 0.262), 5, 4, 6);
  P(ball(1), M(0, 1.15, 0.11, 0.21, 0.08, 0.13, 0.4), 5, 4, 6);
  for (const sx of [-1, 1]) P(ball(1), M(sx * 0.27, 0.92, -0.06, 0.09, 0.13, 0.09, 0, 0, sx * 0.3), 5, 4, 6);
  P(ball(1), M(0, 1.03, -0.035, 0.272, 0.235, 0.265), 5, 4, 0);
  P(ball(1), M(0, 1.14, 0.12, 0.2, 0.08, 0.13, 0.4), 5, 4, 0);
  P(ball(1), M(0, 1.0, -0.05, 0.285, 0.27, 0.28), 5, 4, 1);
  P(ball(1), M(0, 0.86, -0.08, 0.25, 0.14, 0.2), 5, 4, 1);
  P(ball(1), M(0, 1.14, 0.12, 0.22, 0.09, 0.13, 0.4), 5, 4, 1);
  P(ball(1), M(0, 1.04, -0.035, 0.27, 0.23, 0.262), 5, 4, 2);
  P(ball(1), M(0, 1.27, -0.04, 0.11), 5, 4, 2);
  P(ball(1), M(0, 1.035, -0.03, 0.265, 0.215, 0.26), 5, 4, 3);
  P(ball(1), M(0, 0.98, -0.25, 0.08, 0.16, 0.08, -0.4), 5, 4, 3);
  P(S.prism(9, 0.27, 0.24, 0.12), M(0, 1.07, -0.02), 5, 2, 4);
  P(ball(1), M(0, 1.19, -0.02, 0.24, 0.1, 0.235), 5, 2, 4);
  P(S.prism(9, 0.17, 0.17, 0.02, { squash: 0.7 }), M(0, 1.1, 0.17, 1, 1, 1, 0.25), 5, 2, 4);
  P(S.block(0.24, 0.34, 0.02, { cut: 0.03, taper: -0.1 }), M(0, 0.2, 0.15, 1, 1, 1, -0.08), 7, 0, 10, '#f6f1e6');
  P(S.prism(7, 0.07, 0.085, 0.18), M(0, 0.47, 0.27), 6, 0, -1, '#fff6dc');
  P(S.prism(7, 0.07, 0.07, 0.02), M(0, 0.62, 0.27), 6, 0, -1, '#f4d64a');
  const pos = [], col = [], nor = [], part = [];
  for (const p of parts) {
    if (!p.geo.attributes.normal) p.geo.computeVertexNormals();
    const A = p.geo.attributes;
    for (let i = 0; i < A.position.count; i++) {
      pos.push(A.position.getX(i), A.position.getY(i), A.position.getZ(i));
      nor.push(A.normal.getX(i), A.normal.getY(i), A.normal.getZ(i));
      col.push(A.color.getX(i), A.color.getY(i), A.color.getZ(i));
      part.push(p.limb, p.slot, p.style);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(part, 3));
  baseGeo = g;
  return g;
}

const lin = (hex) => new THREE.Color(hex);

export function crowdMaterial(shared) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0, envMapIntensity: 0.25 });
  const skins = SKIN.map(lin), hairs = HAIR.map(lin);
  m.userData.hair = hairs;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = shared.uTime;
    sh.uniforms.uRim = shared.uRimCrowd;
    sh.uniforms.uSkin = { value: skins };
    sh.uniforms.uHair = { value: hairs };
    for (const k of ['uBounce', 'uLamps', 'uLampCol', 'uLampK']) sh.uniforms[k] = shared[k];
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec3 aPart;
attribute vec3 aAnim;
attribute vec3 aTop;
attribute vec3 aBot;
attribute vec4 aLook;
attribute vec2 aBody;
uniform float uTime;
varying float vSkin;
varying vec3 vWP;
varying vec3 vWN;
uniform vec3 uSkin[${SKIN.length}];
uniform vec3 uHair[${HAIR.length}];
mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
mat3 rotZ(float a) { float c = cos(a), s = sin(a); return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0); }`)
      .replace('#include <beginnormal_vertex>', `
float limb = aPart.x;
float clip = aAnim.x;
float t = uTime * aAnim.z + aAnim.y;
float sw = sin(t);
float isWalk = float(abs(clip - 1.0) < 0.5) + float(abs(clip - 2.0) < 0.5);
float isWork = float(abs(clip - 3.0) < 0.5);
float isCheer = float(abs(clip - 4.0) < 0.5);
float isSit = float(abs(clip - 5.0) < 0.5);
float isSip = float(abs(clip - 6.0) < 0.5);
float isSweep = float(abs(clip - 7.0) < 0.5);
float isCarry = float(abs(clip - 2.0) < 0.5);
float vis = 1.0;
if (aPart.z > -0.5) vis = aPart.z < 9.5 ? float(abs(aPart.z - aLook.z) < 0.1) : float(abs(aPart.z - 10.0 - aLook.w) < 0.1);
if (limb > 5.5 && limb < 6.5) vis *= isCarry;
float legK = aBody.y, headK = aBody.x;
vec3 piv = vec3(0.0);
float ang = 0.0;
float angZ = 0.0;
if (limb > 0.5 && limb < 2.5) {
  float sd = limb < 1.5 ? 1.0 : -1.0;
  piv = vec3(0.0, 0.4, 0.0);
  ang = sd * sw * 0.6 * isWalk - 1.45 * isSit;
} else if (limb > 2.5 && limb < 4.5) {
  float sd = limb < 3.5 ? 1.0 : -1.0;
  float right = limb > 3.5 ? 1.0 : 0.0;
  piv = vec3(sd * -0.17, 0.68, 0.0);
  ang = -sd * sw * 0.55 * isWalk * (1.0 - isCarry);
  ang += -1.25 * isCarry;
  ang += isWork * mix(-0.55 + 0.15 * sw, -1.0 + 0.55 * sin(t * 2.0), right);
  ang += isSweep * (-0.7 + 0.35 * sin(t * 1.6) * sd);
  ang += isCheer * -(2.7 + 0.25 * sin(t * 2.0 + sd));
  ang += isSit * -0.35;
  ang += isSip * right * (-1.9 + 0.15 * sw) + isSip * (1.0 - right) * -0.2;
  angZ = isCheer * sd * 0.35;
} else if (limb > 4.5 && limb < 5.5) {
  piv = vec3(0.0, 0.74, 0.0);
  ang = 0.08 * sin(t * 0.5) * (1.0 - isWalk) + isWork * 0.18;
  angZ = 0.06 * sin(t * 0.37);
}
mat3 R = rotX(ang) * rotZ(angZ);
vec3 objectNormal = R * vec3(normal);
#ifdef USE_TANGENT
vec3 objectTangent = vec3(tangent.xyz);
#endif`)
      .replace('#include <begin_vertex>', `vec3 transformed = vec3(position);
transformed = R * (transformed - piv) + piv;
if (limb > 4.5 && limb < 5.5) transformed = (transformed - vec3(0.0, 0.76, 0.0)) * headK + vec3(0.0, 0.76, 0.0);
if (transformed.y > 0.4 || limb > 2.5) transformed.y += 0.4 * (legK - 1.0);
else transformed.y *= legK;
float bob = abs(sw) * 0.045 * isWalk + max(0.0, sin(t * 2.0)) * 0.13 * isCheer + abs(sin(t * 2.0)) * 0.02 * isWork + 0.012 * sin(t * 0.8) * (1.0 - isWalk);
transformed.y += bob - 0.22 * isSit * legK;
transformed.z += 0.12 * isSit;
transformed *= vis;`)
      .replace('#include <color_vertex>', `vColor = vec3(1.0);
float slot = aPart.y;
if (slot < 0.5) vColor = color;
else if (slot < 1.5) vColor = aTop;
else if (slot < 2.5) vColor = aBot;
else if (slot < 3.5) vColor = uSkin[int(aLook.x + 0.5)];
else vColor = uHair[int(aLook.y + 0.5)];
vSkin = float(abs(slot - 3.0) < 0.5);`)
      .replace('#include <project_vertex>', WORLD_POS_VERT);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uRim;\nvarying float vSkin;\nvarying vec3 vWP;\nvarying vec3 vWN;\n' + WORLD_LIGHT_HEAD)
      .replace('#include <opaque_fragment>', `{
  float nv = saturate(dot(geometryNormal, geometryViewDir));
  float fr = pow(1.0 - nv, 2.2);
  outgoingLight += uRim * fr * (0.55 + 0.6 * diffuseColor.rgb);
  outgoingLight += vSkin * diffuseColor.rgb * vec3(0.16, 0.07, 0.04) * (0.6 + 0.4 * nv);
}
${WORLD_LIGHT_FRAG}
#include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'iw2-crowd';
  return m;
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1),
  _y = new THREE.Vector3(0, 1, 0), _c = new THREE.Color(), _bm = new THREE.Matrix4();
let blobGeo = null;

export function createCrowd(materials, { count = 8, colors = OUTFITS, scale = 1.25, seed = 1, radius = 22, center = [0, 1, 0], blobs = true } = {}) {
  const base = rigGeometry();
  if (!materials.crowd) materials.crowd = crowdMaterial(materials.shared);
  const geo = new THREE.BufferGeometry();
  for (const k of ['position', 'normal', 'color', 'aPart']) geo.setAttribute(k, base.attributes[k]);
  const mk = (n) => new THREE.InstancedBufferAttribute(new Float32Array(count * n), n);
  const anim = mk(3), top = mk(3), bot = mk(3), look = mk(4), body = mk(2);
  geo.setAttribute('aAnim', anim);
  geo.setAttribute('aTop', top);
  geo.setAttribute('aBot', bot);
  geo.setAttribute('aLook', look);
  geo.setAttribute('aBody', body);
  const mesh = new THREE.InstancedMesh(geo, materials.crowd, count);
  mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(...center), radius);
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  let r = seed * 9301 + 49297;
  const rnd = () => { r = (r * 9301 + 49297) % 233280; return r / 233280; };
  const scales = new Float32Array(count).fill(1);
  for (let i = 0; i < count; i++) {
    _c.set(colors[i % colors.length]); top.setXYZ(i, _c.r, _c.g, _c.b);
    _c.set(PANTS[Math.floor(rnd() * PANTS.length)]); bot.setXYZ(i, _c.r, _c.g, _c.b);
    look.setXYZ(i, Math.floor(rnd() * 5), Math.floor(rnd() * HAIR.length), Math.floor(rnd() * STYLES));
    look.setW(i, -1);
    body.setXY(i, 1.24, 0.95);
    anim.setXYZ(i, 0, rnd() * 6.28, 3.6 + rnd() * 1.6);
    scales[i] = 0.93 + rnd() * 0.14;
    mesh.setMatrixAt(i, _m.makeScale(0, 0, 0));
  }
  let blobMesh = null;
  if (blobs) {
    blobGeo ||= new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    blobMesh = new THREE.InstancedMesh(blobGeo, materials.basicBlob, count);
    blobMesh.boundingSphere = mesh.boundingSphere;
    blobMesh.renderOrder = 1;
    for (let i = 0; i < count; i++) blobMesh.setMatrixAt(i, _m.makeScale(0, 0, 0));
    mesh.add(blobMesh);
  }
  const api = {
    mesh, blobMesh, count,
    set(i, x, y, z, heading = 0, clip = 0, phase, speed) {
      _q.setFromAxisAngle(_y, heading);
      _m.compose(_p.set(x, y, z), _q, _s.setScalar(scale * CROWD_K * scales[i]));
      mesh.setMatrixAt(i, _m);
      if (blobMesh) {
        const k = scale * CROWD_K * scales[i] * (clip === CLIP.sit ? 0.3 : 0.56);
        _bm.makeScale(k, 1, k * 0.85).setPosition(x, y + 0.09, z);
        blobMesh.setMatrixAt(i, _bm);
      }
      anim.setX(i, clip);
      if (phase !== undefined) anim.setY(i, phase);
      if (speed !== undefined) anim.setZ(i, speed);
      return api;
    },
    hide(i) {
      _m.makeScale(0, 0, 0);
      mesh.setMatrixAt(i, _m);
      blobMesh?.setMatrixAt(i, _m);
      return api;
    },
    look(i, { top: t, bot: b, skin, hair, style, acc } = {}) {
      if (t != null) { _c.set(t); top.setXYZ(i, _c.r, _c.g, _c.b); }
      if (b != null) { _c.set(b); bot.setXYZ(i, _c.r, _c.g, _c.b); }
      if (skin != null) look.setX(i, skin);
      if (hair != null) look.setY(i, hair);
      if (style != null) look.setZ(i, style);
      if (acc != null) look.setW(i, acc);
      top.needsUpdate = bot.needsUpdate = look.needsUpdate = true;
      return api;
    },
    body(i, headK = 1, legK = 1, s = null) {
      body.setXY(i, headK, legK);
      body.needsUpdate = true;
      if (s != null) scales[i] = s;
      return api;
    },
    commit() {
      mesh.instanceMatrix.needsUpdate = true;
      anim.needsUpdate = true;
      if (blobMesh) blobMesh.instanceMatrix.needsUpdate = true;
    },
  };
  return api;
}
