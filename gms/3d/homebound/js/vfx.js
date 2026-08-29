// The show. Muzzle bloom, tracer-adjacent sparks, explosions, smoke, debris,
// floating numbers, screen shake and the red flash you get when your men die.
//
// ARCHITECTURE, and why it is not "one Sprite per particle":
//
// A firefight in this game is 26 shooters × 3 volleys/s × 2 flash quads, plus
// every impact, plus an explosion that is 60 quads on its own. That is a few
// hundred live particles at any moment. Three.js `Sprite` is one draw call each
// and one Object3D of garbage each, so the whole file is instead FIVE pools:
//
//   puff    additive billboards, 4-glyph atlas — flash, fireball, dust, core
//   spark   additive billboards STRETCHED ALONG VELOCITY — the streaky bits
//   smoke   alpha billboards, drift and grow
//   ring    additive quads laid flat on the ground — shockwaves
//   debris  a real InstancedMesh of lit boxes, because tumbling chunks need
//           to catch the light or they read as flat stickers
//
// That is 5 draw calls for every particle in the game. The billboarding and the
// velocity stretch both happen in the vertex shader, so the CPU only ever
// writes floats into a Float32Array — no Matrix4, no Object3D, no allocation
// inside `updateVfx`.
//
// The one glyph atlas is what lets a muzzle star and a fireball share a pool:
// each instance carries a uv offset into a 2×2 sheet. Two textures would have
// meant two materials, and two materials is two draw calls.

import * as THREE from 'three';
import { PAL, DEV_MODE } from './config.js';
import { state } from './state.js';
import { on } from './bus.js';
import { clamp, rand, lerp } from './utils.js';
import { addShake, toScreen } from './render.js';
import { sfx } from './audio.js';

let group = null;
let PQ = 1;                    // ctx.quality.particles — every count scales by it
let bound = false;

// --------------------------------------------------------------------------
// Glyph atlas
// --------------------------------------------------------------------------
// Every additive billboard in the game is one of these four. They are white
// masks: colour comes from the per-instance `aColor`, so one atlas serves a
// yellow muzzle flash, an orange fireball and a grey dust puff.

export const G_STAR = 0, G_GLOW = 1, G_CORE = 2, G_DUST = 3;
// uv offsets into the 2×2 sheet. Canvas y runs down and the texture is flipped
// on upload, so the BOTTOM half of the canvas is uv.y 0..0.5.
const G_UV = [0.0, 0.5, 0.5, 0.5, 0.0, 0.0, 0.5, 0.0];

function radial(g2, cx, cy, r, stops) {
  const grd = g2.createRadialGradient(cx, cy, 0, cx, cy, r);
  for (const [o, c] of stops) grd.addColorStop(o, c);
  g2.fillStyle = grd;
  g2.fillRect(cx - r, cy - r, r * 2, r * 2);
}

function buildAtlas() {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g2 = c.getContext('2d');
  g2.clearRect(0, 0, S, S);

  // STAR — top-left. A hot core with four spikes. This is the muzzle flash and
  // the impact bloom; the spikes are what make it read as a *flash* and not a
  // ball, at 12 px on a phone.
  g2.save();
  g2.translate(64, 64);
  radial(g2, 0, 0, 30, [[0, 'rgba(255,255,255,1)'], [0.35, 'rgba(255,255,255,0.85)'], [1, 'rgba(255,255,255,0)']]);
  g2.globalCompositeOperation = 'lighter';
  for (let k = 0; k < 4; k++) {
    g2.save();
    g2.rotate((k * Math.PI) / 2 + Math.PI / 4 * (k % 2 ? 1 : 0));
    const grd = g2.createLinearGradient(0, 0, 0, -60);
    grd.addColorStop(0, 'rgba(255,255,255,0.95)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g2.fillStyle = grd;
    g2.beginPath();
    g2.moveTo(-7, 0); g2.lineTo(0, -60); g2.lineTo(7, 0); g2.closePath();
    g2.fill();
    g2.restore();
  }
  g2.restore();

  // GLOW — top-right. A plain soft ball; the body of every fireball.
  radial(g2, 192, 64, 62, [
    [0, 'rgba(255,255,255,1)'], [0.30, 'rgba(255,255,255,0.72)'],
    [0.65, 'rgba(255,255,255,0.22)'], [1, 'rgba(255,255,255,0)'],
  ]);

  // CORE — bottom-left. Tight and hard-edged. Stacked under a GLOW it is what
  // makes an explosion look like it has a white-hot centre rather than a
  // uniform orange blob.
  radial(g2, 64, 192, 46, [
    [0, 'rgba(255,255,255,1)'], [0.42, 'rgba(255,255,255,0.95)'],
    [0.6, 'rgba(255,255,255,0.35)'], [1, 'rgba(255,255,255,0)'],
  ]);

  // DUST — bottom-right. Lumpy, so dirt does not read as a circle. The centre
  // is laid down FIRST and heavy: seven blobs on a ring with nothing in the
  // middle is a smoke ring, and a hundred of them a second across the squad
  // looked like the road was covered in bubbles.
  g2.save();
  g2.globalCompositeOperation = 'lighter';
  radial(g2, 192, 192, 46, [
    [0, 'rgba(255,255,255,0.95)'], [0.45, 'rgba(255,255,255,0.6)'],
    [0.8, 'rgba(255,255,255,0.16)'], [1, 'rgba(255,255,255,0)'],
  ]);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + 0.3;
    const r = 16 + (k % 3) * 6;
    radial(g2, 192 + Math.cos(a) * 17, 192 + Math.sin(a) * 17, r,
      [[0, 'rgba(255,255,255,0.4)'], [1, 'rgba(255,255,255,0)']]);
  }
  g2.restore();

  return canvasTexture(c);
}

// A soft streak, brightest along its spine. Used by the spark pool in BEAM mode
// so a spark's length is its speed.
function buildStreak() {
  const W = 32, H = 128;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g2 = c.getContext('2d');
  const grd = g2.createLinearGradient(0, 0, W, 0);
  grd.addColorStop(0, 'rgba(255,255,255,0)');
  grd.addColorStop(0.5, 'rgba(255,255,255,1)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g2.fillStyle = grd;
  g2.fillRect(0, 0, W, H);
  // taper both ends so a spark has a head and a tail, not two blunt cuts
  g2.globalCompositeOperation = 'destination-in';
  const v = g2.createLinearGradient(0, 0, 0, H);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(0.22, 'rgba(0,0,0,1)');
  v.addColorStop(0.72, 'rgba(0,0,0,0.9)');
  v.addColorStop(1, 'rgba(0,0,0,0)');
  g2.fillStyle = v;
  g2.fillRect(0, 0, W, H);
  return canvasTexture(c);
}

function buildRing() {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g2 = c.getContext('2d');
  const grd = g2.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0.00, 'rgba(255,255,255,0)');
  grd.addColorStop(0.62, 'rgba(255,255,255,0)');
  grd.addColorStop(0.80, 'rgba(255,255,255,0.55)');
  grd.addColorStop(0.93, 'rgba(255,255,255,1)');
  grd.addColorStop(1.00, 'rgba(255,255,255,0)');
  g2.fillStyle = grd;
  g2.fillRect(0, 0, S, S);
  return canvasTexture(c);
}

function buildSmoke() {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g2 = c.getContext('2d');
  g2.globalCompositeOperation = 'lighter';
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2 + 0.4;
    const rr = 14 + (k % 4) * 7;
    radial(g2, 64 + Math.cos(a) * 22, 64 + Math.sin(a) * 22, rr,
      [[0, 'rgba(255,255,255,0.42)'], [1, 'rgba(255,255,255,0)']]);
  }
  radial(g2, 64, 64, 46, [[0, 'rgba(255,255,255,0.8)'], [0.55, 'rgba(255,255,255,0.35)'], [1, 'rgba(255,255,255,0)']]);
  return canvasTexture(c);
}

// Local, not toon.js:canvasTex — that cache is shared with signage and
// `clearTexCache()` from another system would pull our textures out from under
// a running run.
const _tex = [];
function canvasTexture(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  // NoColorSpace: these are white masks, and the shader below appends
  // <colorspace_fragment> so the *output* is converted exactly once.
  t.colorSpace = THREE.NoColorSpace;
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  _tex.push(t);
  return t;
}

// --------------------------------------------------------------------------
// The pooled quad. One shader, three modes.
// --------------------------------------------------------------------------

const VERT = /* glsl */`
attribute vec3 aPos;
attribute vec2 aScale;
attribute float aRot;
attribute vec3 aColor;
attribute float aAlpha;
#ifdef BEAM
attribute vec3 aDir;
#endif
#ifdef ATLAS
attribute vec2 aUv;
#endif
varying vec2 vUv;
varying vec3 vColor;
varying float vAlpha;

void main() {
  #ifdef ATLAS
    vUv = uv * 0.5 + aUv;
  #else
    vUv = uv;
  #endif
  vColor = aColor;
  vAlpha = aAlpha;

  #ifdef GROUND
    // Flat on the road. No billboard: a shockwave that turns to face the
    // camera stops reading as something lying on the ground.
    vec3 wp = aPos + vec3(position.x * aScale.x, 0.0, position.y * aScale.y);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(wp, 1.0);
  #else
    vec4 mv = modelViewMatrix * vec4(aPos, 1.0);
    #ifdef BEAM
      // Stretch along the world direction, widen across the view vector. This
      // is what turns a dot into a bolt.
      vec3 a = (modelViewMatrix * vec4(aDir, 0.0)).xyz;
      float al = length(a);
      a = al > 1e-5 ? a / al : vec3(0.0, 1.0, 0.0);
      vec3 toCam = normalize(-mv.xyz);
      vec3 side = cross(a, toCam);
      float sl = length(side);
      side = sl > 1e-5 ? side / sl : vec3(1.0, 0.0, 0.0);
      mv.xyz += a * (position.y * aScale.y) + side * (position.x * aScale.x);
    #else
      float c = cos(aRot), s = sin(aRot);
      vec2 p = position.xy * aScale;
      mv.xy += vec2(p.x * c - p.y * s, p.x * s + p.y * c);
    #endif
    gl_Position = projectionMatrix * mv;
  #endif
}`;

const FRAG = /* glsl */`
uniform sampler2D uMap;
varying vec2 vUv;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec4 t = texture2D(uMap, vUv);
  float a = t.a * vAlpha;
  if (a <= 0.002) discard;
  gl_FragColor = vec4(vColor * t.rgb, a);
  #include <colorspace_fragment>
}`;

// The scratch descriptor every spawn fills in. Reused, never allocated — a
// literal `{x,y,z,...}` per particle is exactly the garbage this file exists to
// avoid, and at 400 particles/second it is a GC pause a frame.
const S = {
  x: 0, y: 0, z: 0,
  vx: 0, vy: 0, vz: 0,
  dx: 0, dy: 1, dz: 0,        // BEAM direction
  w: 1, h: 1, w1: 1, h1: 1,   // start and end size
  rot: 0, spin: 0,
  life: 0.5, grav: 0, drag: 0,
  a0: 1, fade: 1, rise: 0,    // alpha = a0 * min(1, age/rise) * (1-t)^fade
  c0: 0xffffff, c1: -1,       // -1 = no colour ramp
  glyph: G_GLOW,
};
function S0() {
  S.x = S.y = S.z = 0;
  S.vx = S.vy = S.vz = 0;
  S.dx = 0; S.dy = 1; S.dz = 0;
  S.w = S.h = S.w1 = S.h1 = 1;
  S.rot = 0; S.spin = 0;
  S.life = 0.5; S.grav = 0; S.drag = 0;
  S.a0 = 1; S.fade = 1; S.rise = 0;
  S.c0 = 0xffffff; S.c1 = -1;
  S.glyph = G_GLOW;
  return S;
}

const _col = new THREE.Color();
function toLin(hex, out, o) {
  _col.setHex(hex);              // sRGB → working (linear) space
  out[o] = _col.r; out[o + 1] = _col.g; out[o + 2] = _col.b;
}

function makePool(name, opts) {
  const max = opts.max | 0;
  const beam = opts.mode === 'beam';
  const ground = opts.mode === 'ground';
  const atlas = !!opts.atlas;

  const geo = new THREE.InstancedBufferGeometry();
  const base = new THREE.PlaneGeometry(1, 1);
  geo.setAttribute('position', base.attributes.position);
  geo.setAttribute('uv', base.attributes.uv);
  geo.setIndex(base.index);
  geo.instanceCount = 0;

  const aPos = new Float32Array(max * 3);
  const aScale = new Float32Array(max * 2);
  const aRot = new Float32Array(max);
  const aColor = new Float32Array(max * 3);
  const aAlpha = new Float32Array(max);
  const aDir = beam ? new Float32Array(max * 3) : null;
  const aUv = atlas ? new Float32Array(max * 2) : null;

  const at = {};
  const add = (n, arr, size) => {
    at[n] = new THREE.InstancedBufferAttribute(arr, size);
    at[n].setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute(n, at[n]);
  };
  add('aPos', aPos, 3); add('aScale', aScale, 2); add('aRot', aRot, 1);
  add('aColor', aColor, 3); add('aAlpha', aAlpha, 1);
  if (beam) add('aDir', aDir, 3);
  if (atlas) add('aUv', aUv, 2);

  const defines = {};
  if (beam) defines.BEAM = '';
  if (ground) defines.GROUND = '';
  if (atlas) defines.ATLAS = '';

  const mat = new THREE.ShaderMaterial({
    uniforms: { uMap: { value: opts.tex } },
    vertexShader: VERT, fragmentShader: FRAG, defines,
    transparent: true, depthTest: true, depthWrite: false,
    blending: opts.additive === false ? THREE.NormalBlending : THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;          // instances are placed by attribute
  mesh.renderOrder = opts.order || 0;
  mesh.visible = false;
  mesh.name = 'fx-' + name;

  // CPU-side simulation, structure-of-arrays and parallel to the GPU arrays so
  // a swap-remove is one index copied through both.
  const vx = new Float32Array(max), vy = new Float32Array(max), vz = new Float32Array(max);
  const life = new Float32Array(max), maxLife = new Float32Array(max);
  const grav = new Float32Array(max), drag = new Float32Array(max);
  const spin = new Float32Array(max);
  const w0 = new Float32Array(max), h0 = new Float32Array(max);
  const w1 = new Float32Array(max), h1 = new Float32Array(max);
  const a0 = new Float32Array(max), fade = new Float32Array(max), rise = new Float32Array(max);
  const c0 = new Float32Array(max * 3), c1 = new Float32Array(max * 3);
  const ramp = new Uint8Array(max);
  let n = 0;

  function emitOne(s) {
    let i = n;
    if (i >= max) {
      // Full: recycle slot 0. The oldest particle is the one nobody misses,
      // and a dropped spawn is more visible than a shortened tail.
      i = 0;
      swapDown(0, --n);
      i = n;
    }
    n++;
    const p3 = i * 3, p2 = i * 2;
    aPos[p3] = s.x; aPos[p3 + 1] = s.y; aPos[p3 + 2] = s.z;
    vx[i] = s.vx; vy[i] = s.vy; vz[i] = s.vz;
    if (beam) { aDir[p3] = s.dx; aDir[p3 + 1] = s.dy; aDir[p3 + 2] = s.dz; }
    if (atlas) { aUv[p2] = G_UV[s.glyph * 2]; aUv[p2 + 1] = G_UV[s.glyph * 2 + 1]; }
    w0[i] = s.w; h0[i] = s.h; w1[i] = s.w1; h1[i] = s.h1;
    aScale[p2] = s.w; aScale[p2 + 1] = s.h;
    aRot[i] = s.rot; spin[i] = s.spin;
    life[i] = maxLife[i] = Math.max(0.016, s.life);
    grav[i] = s.grav; drag[i] = s.drag;
    a0[i] = s.a0; fade[i] = s.fade; rise[i] = s.rise;
    aAlpha[i] = s.rise > 0 ? 0 : s.a0;
    toLin(s.c0, c0, p3);
    if (s.c1 >= 0) { toLin(s.c1, c1, p3); ramp[i] = 1; } else { ramp[i] = 0; }
    aColor[p3] = c0[p3]; aColor[p3 + 1] = c0[p3 + 1]; aColor[p3 + 2] = c0[p3 + 2];
    return i;
  }

  function swapDown(i, j) {
    if (i === j) return;
    const i3 = i * 3, j3 = j * 3, i2 = i * 2, j2 = j * 2;
    aPos[i3] = aPos[j3]; aPos[i3 + 1] = aPos[j3 + 1]; aPos[i3 + 2] = aPos[j3 + 2];
    aColor[i3] = aColor[j3]; aColor[i3 + 1] = aColor[j3 + 1]; aColor[i3 + 2] = aColor[j3 + 2];
    c0[i3] = c0[j3]; c0[i3 + 1] = c0[j3 + 1]; c0[i3 + 2] = c0[j3 + 2];
    c1[i3] = c1[j3]; c1[i3 + 1] = c1[j3 + 1]; c1[i3 + 2] = c1[j3 + 2];
    if (beam) { aDir[i3] = aDir[j3]; aDir[i3 + 1] = aDir[j3 + 1]; aDir[i3 + 2] = aDir[j3 + 2]; }
    aScale[i2] = aScale[j2]; aScale[i2 + 1] = aScale[j2 + 1];
    if (atlas) { aUv[i2] = aUv[j2]; aUv[i2 + 1] = aUv[j2 + 1]; }
    aRot[i] = aRot[j]; aAlpha[i] = aAlpha[j];
    vx[i] = vx[j]; vy[i] = vy[j]; vz[i] = vz[j];
    life[i] = life[j]; maxLife[i] = maxLife[j];
    grav[i] = grav[j]; drag[i] = drag[j]; spin[i] = spin[j];
    w0[i] = w0[j]; h0[i] = h0[j]; w1[i] = w1[j]; h1[i] = h1[j];
    a0[i] = a0[j]; fade[i] = fade[j]; rise[i] = rise[j]; ramp[i] = ramp[j];
  }

  function update(dt) {
    for (let i = 0; i < n; i++) {
      life[i] -= dt;
      if (life[i] <= 0) { swapDown(i, --n); i--; continue; }
      const i3 = i * 3, i2 = i * 2;
      const t = 1 - life[i] / maxLife[i];

      if (drag[i] > 0) {
        const k = 1 - Math.min(0.95, drag[i] * dt);
        vx[i] *= k; vy[i] *= k; vz[i] *= k;
      }
      vy[i] += grav[i] * dt;
      aPos[i3] += vx[i] * dt;
      aPos[i3 + 1] += vy[i] * dt;
      aPos[i3 + 2] += vz[i] * dt;

      if (beam) {
        // A spark's direction and length ARE its velocity, so the stretch keeps
        // up with it as drag and gravity bend the arc.
        const sp = Math.hypot(vx[i], vy[i], vz[i]);
        if (sp > 0.001) {
          aDir[i3] = vx[i] / sp; aDir[i3 + 1] = vy[i] / sp; aDir[i3 + 2] = vz[i] / sp;
          aScale[i2 + 1] = lerp(h0[i], h1[i], t) * clamp(sp * 0.035, 0.35, 2.2);
        }
        aScale[i2] = lerp(w0[i], w1[i], t);
      } else {
        aScale[i2] = lerp(w0[i], w1[i], t);
        aScale[i2 + 1] = lerp(h0[i], h1[i], t);
      }

      if (spin[i]) aRot[i] += spin[i] * dt;

      const u = 1 - t;
      const f = fade[i];
      let al = a0[i] * (f === 1 ? u : f === 2 ? u * u : f === 3 ? u * u * u : Math.pow(u, f));
      // `rise` fades a particle IN. Smoke that is at full opacity on frame one
      // reads as a grey disc appearing out of nowhere and it smothers the
      // fireball it is supposed to be billowing off.
      if (rise[i] > 0) {
        const age = maxLife[i] - life[i];
        if (age < rise[i]) al *= age / rise[i];
      }
      aAlpha[i] = al;

      if (ramp[i]) {
        aColor[i3] = c0[i3] + (c1[i3] - c0[i3]) * t;
        aColor[i3 + 1] = c0[i3 + 1] + (c1[i3 + 1] - c0[i3 + 1]) * t;
        aColor[i3 + 2] = c0[i3 + 2] + (c1[i3 + 2] - c0[i3 + 2]) * t;
      }
    }
    geo.instanceCount = n;
    mesh.visible = n > 0;
    if (n > 0) {
      at.aPos.needsUpdate = true; at.aScale.needsUpdate = true;
      at.aRot.needsUpdate = true; at.aColor.needsUpdate = true;
      at.aAlpha.needsUpdate = true;
      if (beam) at.aDir.needsUpdate = true;
      if (atlas) at.aUv.needsUpdate = true;
    }
  }

  return {
    mesh, emit: emitOne, update,
    clear() { n = 0; geo.instanceCount = 0; mesh.visible = false; },
    get count() { return n; },
    dispose() { geo.dispose(); base.dispose(); mat.dispose(); },
  };
}

// --------------------------------------------------------------------------
// Debris — the only lit particles in the file
// --------------------------------------------------------------------------
// Chunks are boxes in an InstancedMesh with a real Lambert material, because a
// tumbling chunk that does not change brightness as it turns reads as a decal.

const DEB_MAX = 96;
let deb = null;
const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v3 = new THREE.Vector3();
const _s3 = new THREE.Vector3();

function makeDebris(scene) {
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
  const mesh = new THREE.InstancedMesh(geo, mat, DEB_MAX);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(DEB_MAX * 3).fill(1), 3);
  mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.count = 0;
  mesh.visible = false;
  mesh.name = 'fx-debris';

  const px = new Float32Array(DEB_MAX), py = new Float32Array(DEB_MAX), pz = new Float32Array(DEB_MAX);
  const vX = new Float32Array(DEB_MAX), vY = new Float32Array(DEB_MAX), vZ = new Float32Array(DEB_MAX);
  const rx = new Float32Array(DEB_MAX), ry = new Float32Array(DEB_MAX), rz = new Float32Array(DEB_MAX);
  const sx = new Float32Array(DEB_MAX), sy = new Float32Array(DEB_MAX), sz = new Float32Array(DEB_MAX);
  const wx = new Float32Array(DEB_MAX), wy = new Float32Array(DEB_MAX), wz = new Float32Array(DEB_MAX);
  const life = new Float32Array(DEB_MAX), maxLife = new Float32Array(DEB_MAX);
  let n = 0;

  function spawn(x, y, z, vx, vy, vz, size, color, ttl) {
    let i = n;
    if (i >= DEB_MAX) { swap(0, --n); i = n; }
    n++;
    px[i] = x; py[i] = y; pz[i] = z;
    vX[i] = vx; vY[i] = vy; vZ[i] = vz;
    rx[i] = rand(6.28); ry[i] = rand(6.28); rz[i] = rand(6.28);
    wx[i] = rand(-9, 9); wy[i] = rand(-9, 9); wz[i] = rand(-9, 9);
    sx[i] = size * rand(0.6, 1.4); sy[i] = size * rand(0.6, 1.4); sz[i] = size * rand(0.6, 1.4);
    life[i] = maxLife[i] = ttl;
    _col.setHex(color);
    mesh.instanceColor.array[i * 3] = _col.r;
    mesh.instanceColor.array[i * 3 + 1] = _col.g;
    mesh.instanceColor.array[i * 3 + 2] = _col.b;
  }
  function swap(i, j) {
    if (i === j) return;
    px[i] = px[j]; py[i] = py[j]; pz[i] = pz[j];
    vX[i] = vX[j]; vY[i] = vY[j]; vZ[i] = vZ[j];
    rx[i] = rx[j]; ry[i] = ry[j]; rz[i] = rz[j];
    wx[i] = wx[j]; wy[i] = wy[j]; wz[i] = wz[j];
    sx[i] = sx[j]; sy[i] = sy[j]; sz[i] = sz[j];
    life[i] = life[j]; maxLife[i] = maxLife[j];
    const a = mesh.instanceColor.array;
    a[i * 3] = a[j * 3]; a[i * 3 + 1] = a[j * 3 + 1]; a[i * 3 + 2] = a[j * 3 + 2];
  }
  function update(dt) {
    for (let i = 0; i < n; i++) {
      life[i] -= dt;
      if (life[i] <= 0) { swap(i, --n); i--; continue; }
      vY[i] -= 21 * dt;
      px[i] += vX[i] * dt; py[i] += vY[i] * dt; pz[i] += vZ[i] * dt;
      if (py[i] < 0.08) {
        // One bounce, then it lies down: the spin damps hard so a chunk does
        // not skate across the road spinning forever.
        py[i] = 0.08; vY[i] = -vY[i] * 0.34;
        vX[i] *= 0.5; vZ[i] *= 0.5;
        wx[i] *= 0.3; wy[i] *= 0.3; wz[i] *= 0.3;
      }
      rx[i] += wx[i] * dt; ry[i] += wy[i] * dt; rz[i] += wz[i] * dt;
      const k = Math.min(1, life[i] / 0.35);      // shrink out instead of popping
      _e.set(rx[i], ry[i], rz[i]);
      _q.setFromEuler(_e);
      _v3.set(px[i], py[i], pz[i]);
      _s3.set(sx[i] * k, sy[i] * k, sz[i] * k);
      _m4.compose(_v3, _q, _s3);
      mesh.setMatrixAt(i, _m4);
    }
    mesh.count = n;
    mesh.visible = n > 0;
    if (n > 0) { mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true; }
  }
  scene.add(mesh);
  return { mesh, spawn, update, clear() { n = 0; mesh.count = 0; mesh.visible = false; },
    dispose() { geo.dispose(); mat.dispose(); mesh.dispose(); } };
}

// --------------------------------------------------------------------------
// Pools
// --------------------------------------------------------------------------

let puff = null, spark = null, smoke = null, ring = null;

// --------------------------------------------------------------------------
// Floating numbers — DOM, not 3D
// --------------------------------------------------------------------------
// A digit atlas in 3D would be a sixth draw call and a second shader for text
// that is legible for 800 ms. DOM with `toScreen()` costs nothing on the GPU,
// gets crisp text at any DPR for free, and the pool means no element churn.

const NUM_MAX = 22;
let numLayer = null, flashEl = null;
const nums = [];
let numN = 0;

function buildNumbers() {
  numLayer = document.createElement('div');
  numLayer.id = 'fx-layer';
  numLayer.style.cssText =
    'position:fixed;inset:0;pointer-events:none;z-index:20;overflow:hidden;' +
    'font:900 1px/1 "Arial Black",Impact,system-ui,sans-serif;';
  document.body.appendChild(numLayer);

  for (let i = 0; i < NUM_MAX; i++) {
    const e = document.createElement('b');
    e.style.cssText =
      'position:absolute;left:0;top:0;white-space:nowrap;will-change:transform,opacity;' +
      'font-size:26px;letter-spacing:-0.02em;-webkit-text-stroke:5px #14202c;' +
      'paint-order:stroke fill;text-shadow:0 3px 0 rgba(0,0,0,.35);opacity:0;';
    numLayer.appendChild(e);
    nums.push({ el: e, x: 0, y: 0, z: 0, vy: 0, life: 0, max: 1, size: 26 });
  }

  // The player-loss flash. A vignette rather than a full wash, so it never
  // hides the thing that is killing you.
  flashEl = document.createElement('div');
  flashEl.style.cssText =
    'position:fixed;inset:0;pointer-events:none;opacity:0;' +
    'background:radial-gradient(ellipse at 50% 60%,rgba(200,20,20,0) 38%,rgba(190,16,16,.72) 100%);';
  numLayer.appendChild(flashEl);
}

let flashA = 0;

export function floatNumber(pos, text, color) {
  if (!numLayer || !pos) return null;
  let s;
  if (numN < NUM_MAX) s = nums[numN++];
  else { s = nums[0]; nums[0] = nums[numN - 1]; nums[numN - 1] = s; }   // steal the oldest
  s.x = pos.x || 0; s.y = (pos.y || 0) + 1.4; s.z = pos.z || 0;
  s.vy = 3.4;
  s.life = s.max = 0.8;
  // Long strings are titles ("THE COLONEL DOWN"), short ones are damage ticks.
  // Sizing the other way round buries the thing the number is sitting on.
  const len = String(text).length;
  s.size = len > 6 ? 30 : 34 - len * 1.5;
  s.el.textContent = String(text);
  s.el.style.color = typeof color === 'number' ? '#' + color.toString(16).padStart(6, '0') : (color || '#fff');
  s.el.style.fontSize = s.size + 'px';
  return s;
}

function updateNumbers(dt) {
  for (let i = 0; i < numN; i++) {
    const s = nums[i];
    s.life -= dt;
    if (s.life <= 0) {
      s.el.style.opacity = '0';
      const last = nums[--numN];
      nums[numN] = s; nums[i] = last;
      i--; continue;
    }
    s.vy -= 5.2 * dt;
    s.y += s.vy * dt;
    const p = toScreen(s.x, s.y, s.z);
    if (p.behind) { s.el.style.opacity = '0'; continue; }
    const t = 1 - s.life / s.max;
    // Pop on entry, drift and fade out. The pop is what makes a +50 land.
    const k = t < 0.14 ? 0.7 + (t / 0.14) * 0.45 : 1.15 - (t - 0.14) * 0.18;
    s.el.style.transform = `translate3d(${(p.x - 40) | 0}px,${(p.y - 20) | 0}px,0) scale(${k.toFixed(3)})`;
    s.el.style.opacity = String(Math.min(1, (1 - t) * 2.2));
  }
  if (flashA > 0) {
    flashA = Math.max(0, flashA - dt * 2.6);
    flashEl.style.opacity = String(flashA);
  }
}

// --------------------------------------------------------------------------
// Public spawners. combat.js and enemies.js call these directly; everything
// else goes through the bus.
// --------------------------------------------------------------------------

export function muzzleFlash(x, y, z, scale = 1) {
  if (!puff) return;
  const s = S0();
  s.x = x; s.y = y; s.z = z;
  s.glyph = G_STAR;
  s.w = s.h = 1.15 * scale; s.w1 = s.h1 = 2.1 * scale;
  s.life = 0.13; s.a0 = 3.2; s.fade = 2;
  s.rot = rand(6.28);
  s.c0 = 0xfff4c8; s.c1 = PAL.fire;
  puff.emit(s);
  // A second, wider, softer copy is the "bloom" — it is what makes the front
  // of the squad glow white in the reference instead of showing 26 sparkles.
  const g = S0();
  g.x = x; g.y = y; g.z = z + 0.25;
  g.glyph = G_GLOW;
  g.w = g.h = 2.2 * scale; g.w1 = g.h1 = 3.4 * scale;
  g.life = 0.16; g.a0 = 1.15; g.fade = 2;
  g.c0 = 0xffe9a0; g.c1 = PAL.fire;
  puff.emit(g);
}

// The sheet of light that sits ON the front rank while the squad is firing.
// Individual muzzle flashes are 0.1 s and eleven metres apart; this is the soft
// white mass between them, and without it a firefight reads as sparkles rather
// than as the reference's wall of fire. Two overlapping glows, refreshed by
// combat.js about eighteen times a second.
export function battleGlow(x, y, z, radius = 2, scale = 1) {
  if (!puff) return;
  const g = S0();
  g.x = x; g.y = y; g.z = z;
  g.glyph = G_GLOW;
  // Wider than it is tall: the bloom has to sit ON the front rank, and a square
  // billboard this size reads as a lens flare floating above the squad.
  g.w = radius * 3.4 * scale; g.h = radius * 1.7 * scale;
  g.w1 = radius * 4.2 * scale; g.h1 = radius * 2.1 * scale;
  g.life = 0.15; g.a0 = 1.05; g.fade = 1;
  g.c0 = 0xffd88a; g.c1 = PAL.fire;
  puff.emit(g);
  const c = S0();
  c.x = x + rand(-0.45, 0.45); c.y = y; c.z = z;
  c.glyph = G_CORE;
  c.w = radius * 1.6 * scale; c.h = radius * 1.05 * scale;
  c.w1 = radius * 2.2 * scale; c.h1 = radius * 1.4 * scale;
  c.life = 0.12; c.a0 = 2.6; c.fade = 1;
  c.c0 = 0xfffbe8; c.c1 = PAL.muzzle;
  puff.emit(c);
}

export function impactFlash(x, y, z, scale = 1, color = PAL.spark) {
  if (!puff) return;
  const s = S0();
  s.x = x; s.y = y; s.z = z;
  s.glyph = G_CORE;
  s.w = s.h = 0.8 * scale; s.w1 = s.h1 = 1.8 * scale;
  s.life = 0.13; s.a0 = 3.0; s.fade = 2;
  s.c0 = 0xffffff; s.c1 = color;
  puff.emit(s);
  const g = S0();
  g.x = x; g.y = y; g.z = z;
  g.glyph = G_GLOW;
  g.w = g.h = 1.5 * scale; g.w1 = g.h1 = 3.0 * scale;
  g.life = 0.22; g.a0 = 1.2; g.fade = 2;
  g.c0 = color; g.c1 = PAL.fire;
  puff.emit(g);
}

export function sparkBurst(x, y, z, nx, ny, nz, count, color = PAL.spark, speed = 11) {
  if (!spark) return;
  count = Math.max(1, Math.round(count * PQ));
  for (let i = 0; i < count; i++) {
    const s = S0();
    s.x = x; s.y = y; s.z = z;
    const sp = speed * rand(0.45, 1.35);
    s.vx = (nx + rand(-0.9, 0.9)) * sp;
    s.vy = (ny + rand(-0.2, 1.0)) * sp;
    s.vz = (nz + rand(-0.9, 0.9)) * sp;
    s.w = 0.11; s.w1 = 0.02;
    s.h = 0.5; s.h1 = 0.22;
    s.life = rand(0.22, 0.55);
    s.grav = -26; s.drag = 1.6;
    s.a0 = 2.0; s.fade = 2;
    s.c0 = color; s.c1 = PAL.fire;
    spark.emit(s);
  }
}

// Dirt kicked off a body or the road. Cheap, dark, and the thing that stops a
// kill from being a unit vanishing.
export function hitPuff(x, y, z, color = PAL.enemyDark, scale = 1) {
  if (!puff) return;
  const s = S0();
  s.x = x; s.y = y; s.z = z;
  s.glyph = G_DUST;
  s.w = s.h = 0.4 * scale; s.w1 = s.h1 = 1.1 * scale;
  s.life = 0.3; s.a0 = 0.75; s.fade = 2;
  s.vy = 1.1; s.rot = rand(6.28); s.spin = rand(-3, 3);
  s.c0 = color; s.c1 = 0x2a1010;
  puff.emit(s);
}

export function smokePuff(x, y, z, scale = 1, ttl = 1.4, color = PAL.smoke) {
  if (!smoke) return;
  const s = S0();
  s.x = x; s.y = y; s.z = z;
  s.w = s.h = 0.85 * scale; s.w1 = s.h1 = 2.4 * scale;
  s.life = ttl; s.a0 = 0.8; s.fade = 1.5; s.rise = Math.min(0.35, ttl * 0.22);
  s.vx = rand(-1.1, 1.1); s.vy = rand(1.0, 2.6); s.vz = rand(-1.1, 1.1);
  s.drag = 0.7;
  s.rot = rand(6.28); s.spin = rand(-1.2, 1.2);
  // Dark going pale: fresh smoke is soot, old smoke is dust, and the ramp is
  // what stops a puff reading as a grey circle pasted on the road.
  s.c0 = color; s.c1 = 0x9aa4ad;
  smoke.emit(s);
}

export function shockRing(x, z, r0, r1, ttl, color = PAL.fire, a = 1.4) {
  if (!ring) return;
  const s = S0();
  s.x = x; s.y = 0.07; s.z = z;
  s.w = s.h = r0 * 2; s.w1 = s.h1 = r1 * 2;
  s.life = ttl; s.a0 = a; s.fade = 2;
  s.c0 = color; s.c1 = PAL.fire;
  ring.emit(s);
}

// --------------------------------------------------------------------------
// Explosions — the payoff
// --------------------------------------------------------------------------
// Six layers, in the order the eye reads them: white core, fire body, ground
// shockwave, sparks, tumbling debris, and smoke that outlives all of it. Take
// any one away and it stops looking expensive; the smoke is the one people
// notice last and miss most, because it is what leaves a mark on the frame
// after the flash is gone.

export function explode(pos, scale = 1, color = PAL.fire) {
  if (!puff) return;
  const x = pos?.x || 0, y = (pos?.y ?? 0.6), z = pos?.z || 0;
  const s = clamp(scale, 0.3, 4);

  // 1. white-hot core, gone in a fifth of a second
  const core = S0();
  core.x = x; core.y = y; core.z = z;
  core.glyph = G_CORE;
  core.w = core.h = 0.9 * s; core.w1 = core.h1 = 3.2 * s;
  core.life = 0.22; core.a0 = 3.4; core.fade = 2;
  core.c0 = 0xffffff; core.c1 = 0xffb648;
  puff.emit(core);

  // 2. the fire body — several offset balls so the silhouette is lumpy
  const nFire = Math.max(3, Math.round(7 * s * PQ));
  for (let i = 0; i < nFire; i++) {
    const f = S0();
    // Pushed OUT, not stacked: overlapping soft glows at the same point sum to
    // one smooth ball and the whole thing reads as a light bulb. The lumpy
    // silhouette is the difference between fire and a lamp.
    const a = (i / nFire) * 6.283 + rand(-0.4, 0.4);
    const r = rand(0.55, 1.25) * s;
    f.x = x + Math.cos(a) * r;
    f.y = y + rand(-0.1, 1.1) * s;
    f.z = z + Math.sin(a) * r;
    f.glyph = G_GLOW;
    f.vx = Math.cos(a) * rand(2.5, 6) * s;
    f.vy = rand(1.6, 5.0) * s;
    f.vz = Math.sin(a) * rand(2.5, 6) * s;
    f.drag = 3.2;
    f.w = f.h = 1.1 * s; f.w1 = f.h1 = 2.9 * s;
    f.life = rand(0.45, 0.9);
    // Deliberately BELOW the core's brightness. If every lobe saturates to
    // white there is no orange left and the fireball has no temperature.
    f.a0 = 1.65; f.fade = 1.6;
    f.rot = rand(6.28); f.spin = rand(-2, 2);
    // Cooling, not dissolving: a fireball ends dark red and sooty, and the
    // colour ramp is what sells that at 60 frames of life.
    f.c0 = i % 2 ? 0xff9a1e : 0xffc247;
    f.c1 = i % 3 === 0 ? 0x4a1405 : 0xa8360a;
    puff.emit(f);
  }

  // 3. ground shockwave — the thing that gives an explosion a floor
  shockRing(x, z, 0.5 * s, 6.0 * s, 0.40, 0xfff0c8, 2.6);
  shockRing(x, z, 0.3 * s, 3.4 * s, 0.66, color, 1.6);

  // 4. sparks, thrown up and out
  sparkBurst(x, y, z, 0, 0.35, 0, Math.round(16 * s), PAL.spark, 13 * Math.sqrt(s));

  // 5. debris
  if (deb) {
    const nd = Math.max(2, Math.round(7 * s * PQ));
    for (let i = 0; i < nd; i++) {
      const a = rand(6.28), sp = rand(5, 13) * Math.sqrt(s);
      deb.spawn(x, y, z,
        Math.cos(a) * sp, rand(6, 13) * Math.sqrt(s), Math.sin(a) * sp,
        0.16 * s, i % 3 === 0 ? 0x3a3a3a : 0x5c5449, rand(1.0, 1.9));
    }
  }

  // 6. smoke, which outlives everything and is why the frame still reads as
  // "something blew up here" a second later
  const ns = Math.max(3, Math.round(8 * s * PQ));
  for (let i = 0; i < ns; i++) {
    const a = rand(6.28), r = rand(0, 0.7) * s;
    smokePuff(x + Math.cos(a) * r, y + rand(0, 0.8), z + Math.sin(a) * r, 1.15 * s, rand(1.4, 2.6), 0x2b2622);
  }

  addShake(clamp(0.16 * s + 0.06, 0, 0.6) * distFade(z));
  sfx('boom', { scale: s });
}

// Shake and audio both fall off with distance, or a boss volley 60 m up the
// road rattles the camera as hard as one landing on your own men.
function distFade(z) {
  const d = Math.abs(z - state.z);
  return clamp(1 - d / 55, 0.12, 1);
}

// --------------------------------------------------------------------------
// Lifecycle
// --------------------------------------------------------------------------

export function initVfx(ctx) {
  PQ = ctx?.quality?.particles ?? 1;
  group = new THREE.Group();
  group.name = 'vfx';

  const atlas = buildAtlas();
  puff = makePool('puff', { max: Math.round(320 * clamp(PQ, 0.5, 1)), tex: atlas, atlas: true, mode: 'billboard', order: 6 });
  spark = makePool('spark', { max: Math.round(360 * clamp(PQ, 0.5, 1)), tex: buildStreak(), mode: 'beam', order: 7 });
  ring = makePool('ring', { max: 40, tex: buildRing(), mode: 'ground', order: 4 });
  smoke = makePool('smoke', { max: Math.round(170 * clamp(PQ, 0.5, 1)), tex: buildSmoke(), mode: 'billboard', additive: false, order: 5 });

  group.add(ring.mesh, smoke.mesh, puff.mesh, spark.mesh);
  ctx.scene.add(group);
  deb = makeDebris(ctx.scene);

  buildNumbers();

  if (!bound) {
    bound = true;
    on('fx:explosion', (e) => explode(e?.pos, e?.scale ?? 1, e?.color ?? PAL.fire));
    on('fx:number', (e) => floatNumber(e?.pos, e?.text, e?.color));
    // render.js owns the actual camera shake for `fx:shake`; we listen only to
    // put a vignette on the big ones, so the two never double up.
    on('fx:shake', (e) => { if ((e?.amount || 0) >= 0.45) flashA = Math.min(0.55, flashA + 0.25); });

    on('enemy:killed', (e) => {
      const p = e?.pos; if (!p) return;
      hitPuff(p.x, (p.y || 0) + 0.7, p.z, PAL.enemyDark, 0.9);
      sparkBurst(p.x, (p.y || 0) + 0.8, p.z, 0, 0.3, -0.4, 3, PAL.enemy, 5.5);
    });

    on('barrier:broken', (e) => {
      // barriers.js emits its own `fx:explosion` for the blast, so this handler
      // only adds what that cannot know about: the plank shrapnel and the value
      // the wall was worth.
      const p = e?.pos || { x: 0, y: 1, z: state.z + 8 };
      if (deb) for (let i = 0; i < Math.round(9 * PQ); i++) {
        const a = rand(6.28), sp = rand(4, 11);
        deb.spawn(p.x, (p.y || 1) + 0.5, p.z, Math.cos(a) * sp, rand(5, 11), Math.sin(a) * sp,
          0.22, i % 2 ? PAL.wood : PAL.woodDark, rand(1.1, 2.0));
      }
      if (e?.value) floatNumber(p, '+' + Math.round(e.value), '#ffd24a');
      sfx('barrier');
    });

    on('gate:break', (e) => {
      const g = e?.gate;
      const p = g?.pos || g || { x: 0, y: 1.5, z: state.z + 10 };
      const x = p.x || 0, z = p.z ?? state.z + 10, y = p.y ?? 1.5;
      // Glass: no fireball, all shards. The verb has to read differently from
      // a barrier or the player cannot tell them apart at speed.
      sparkBurst(x, y, z, 0, 0.2, -0.3, 26, PAL.glass, 12);
      impactFlash(x, y, z, 1.6, PAL.glass);
      smokePuff(x, y, z, 0.9, 0.8, 0xcfe9f2);
      sfx('barrier', { vol: 0.6 });   // gates.js already emitted fx:shake
    });

    // Losing men is the only thing that flashes the screen. Gaining them gets a
    // number and nothing else — reward is quiet, damage is loud.
    on('army:count', (e) => {
      const d = e?.delta || 0;
      if (!d) return;
      const x = state.x, z = state.z + 1.2;
      if (d < 0) {
        floatNumber({ x, y: 1.6, z }, String(d), '#ff5b52');
        flashA = Math.min(0.7, flashA + clamp(-d / 25, 0.12, 0.5));
        for (let i = 0; i < Math.min(4, Math.round(-d / 3) + 1); i++) {
          hitPuff(x + rand(-2.2, 2.2), 0.55, z + rand(-2.2, 2.2), 0x7a4630, 0.7);
        }
        sfx('hurt');
      } else {
        floatNumber({ x, y: 1.6, z }, '+' + d, '#7dff8c');
      }
    });
  }

  if (DEV_MODE) window.__hbVfx = { puff, spark, smoke, ring, deb };
  return group;
}

export function resetVfx() {
  puff?.clear(); spark?.clear(); smoke?.clear(); ring?.clear(); deb?.clear();
  for (let i = 0; i < numN; i++) nums[i].el.style.opacity = '0';
  numN = 0;
  flashA = 0;
  if (flashEl) flashEl.style.opacity = '0';
}

export function updateVfx(dt) {
  if (!puff) return;
  puff.update(dt);
  spark.update(dt);
  smoke.update(dt);
  ring.update(dt);
  deb.update(dt);
  updateNumbers(dt);
}

export function disposeVfx() {
  puff?.dispose(); spark?.dispose(); smoke?.dispose(); ring?.dispose(); deb?.dispose();
  group?.parent?.remove(group);
  deb?.mesh?.parent?.remove(deb.mesh);
  numLayer?.remove();
  for (const t of _tex) t.dispose();
  _tex.length = 0;
  puff = spark = smoke = ring = deb = null;
  group = null; numLayer = null;
  nums.length = 0; numN = 0;
}
