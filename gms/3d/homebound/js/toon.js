// Shared render vocabulary. Every material, outline and crowd in HOMEBOUND is
// made here, because the moment two systems build their own "olive" the units
// stop matching their own outlines and the whole flat-colour look falls apart.
//
// THE CROWD SHADER IS THE LOAD-BEARING PIECE. 700 animated humans at 60 fps on
// a phone means the CPU may only write instance matrices; the gait runs in the
// vertex shader off a per-instance phase. Geometry opts in by carrying an
// `aPart` attribute:
//
//   0 body   1 leg-left   2 leg-right   3 arm-left   4 arm-right   5 head
//   6 spinner (rotates about model Y — rotors, turret fans)
//
// Parts 1-4 swing fore/aft, the body bobs, the head counter-bobs. A geometry
// with no `aPart` still works — it just bobs as one lump.

import * as THREE from 'three';
import { PAL } from './config.js';

// --------------------------------------------------------------------------
// Materials
// --------------------------------------------------------------------------

// Flat, unlit-looking but lit enough to read form. Lambert is deliberate:
// Standard costs too much for 40 draw calls of crowd on a phone, and the look
// we want has no speculars in it anyway.
export function flatMat(color, opts = {}) {
  return new THREE.MeshLambertMaterial({
    color, emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 1,
    transparent: !!opts.transparent, opacity: opts.opacity ?? 1,
    side: opts.side ?? THREE.FrontSide,
    flatShading: opts.flat ?? false,
    depthWrite: opts.depthWrite ?? true,
    map: opts.map || null,
    ...(opts.extra || {}),
  });
}

export function glowMat(color, opacity = 1) {
  return new THREE.MeshBasicMaterial({
    color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1,
    blending: opacity < 1 ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
}

// Inverted-hull outline: a back-face shell pushed out along the normal. Post-
// process outlines do not survive instancing and cost a full-screen pass; this
// costs one extra draw per crowd and works on 700 instances for free.
export function outlineMat(thickness = 0.035, color = PAL.signStroke) {
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  m.userData.outlineThickness = thickness;
  m.onBeforeCompile = (s) => {
    s.uniforms.uThick = { value: thickness };
    s.vertexShader = 'uniform float uThick;\n' + s.vertexShader.replace(
      '#include <begin_vertex>',
      // MeshBasicMaterial only declares objectNormal when it has an env map or
      // a skeleton, so without this include the outline program fails to link
      // and every crowd in the game silently loses its outline.
      '#include <beginnormal_vertex>\n#include <begin_vertex>\n  transformed += normalize(objectNormal) * uThick;'
    );
    m.userData.shader = s;
  };
  return m;
}

// --------------------------------------------------------------------------
// The crowd shader
// --------------------------------------------------------------------------

const CROWD_ATTRS = /* glsl */`
attribute float aPart;
attribute float aPhase;
attribute float aAnim;     // 0 idle .. 1 run
attribute vec3  aTint;
uniform   float uTime;
varying   vec3  vTint;
`;

// One shared body of GLSL so the colour pass, the depth pass and the outline
// shell all deform identically. If they ever drift, the outline detaches from
// the man inside it and it looks like a bug in the renderer.
const CROWD_BODY = /* glsl */`
  vTint = aTint;
  float ph   = uTime * mix(2.2, 8.4, aAnim) + aPhase;
  float run  = aAnim;
  float sw   = sin(ph);

  // legs and arms swing about their top, in opposition
  float part = aPart;
  float isLL = step(0.5, part) * step(part, 1.5);
  float isLR = step(1.5, part) * step(part, 2.5);
  float isAL = step(2.5, part) * step(part, 3.5);
  float isAR = step(3.5, part) * step(part, 4.5);
  float isHd = step(4.5, part);

  float legSwing = sw * mix(0.10, 0.55, run);
  float armSwing = sw * mix(0.06, 0.42, run);
  float pivotLeg = 0.78;   // hip height in model space
  float pivotArm = 1.28;   // shoulder height

  float dz = 0.0, dy = 0.0;
  dz += isLL * ( legSwing * (transformed.y - pivotLeg) * -1.0);
  dz += isLR * (-legSwing * (transformed.y - pivotLeg) * -1.0);
  dz += isAL * (-armSwing * (transformed.y - pivotArm) * -1.0);
  dz += isAR * ( armSwing * (transformed.y - pivotArm) * -1.0);

  // whole-body bounce, twice per stride; head lags a touch so it reads alive
  float bounce = abs(sin(ph)) * mix(0.012, 0.085, run);
  dy += bounce;
  dy += isHd * sin(ph * 2.0 + 0.7) * mix(0.004, 0.022, run);

  transformed.z += dz;
  transformed.y += dy;

  // Part 6 spins about the model's Y axis. Everything else here is a translate,
  // which is enough for a stride but cannot turn a rotor — and a helicopter
  // whose blades are welded still is worse than no helicopter.
  if (part > 5.5) {
    float a = uTime * 26.0 + aPhase;
    float ca = cos(a), sa = sin(a);
    transformed.xz = vec2(transformed.x * ca - transformed.z * sa,
                          transformed.x * sa + transformed.z * ca);
  }
`;

function injectCrowd(mat, uniforms, tinted) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (s) => {
    if (prev) prev(s);
    s.uniforms.uTime = uniforms.uTime;
    s.vertexShader = CROWD_ATTRS + s.vertexShader.replace(
      '#include <begin_vertex>', '#include <begin_vertex>\n' + CROWD_BODY
    );
    if (tinted) {
      s.fragmentShader = 'varying vec3 vTint;\n' + s.fragmentShader.replace(
        '#include <color_fragment>',
        '#include <color_fragment>\n  diffuseColor.rgb *= vTint;'
      );
    } else {
      s.fragmentShader = 'varying vec3 vTint;\n' + s.fragmentShader;
    }
    mat.userData.shader = s;
  };
  mat.customProgramCacheKey = () => 'hb-crowd' + (tinted ? '-t' : '');
  return mat;
}

/**
 * An instanced crowd with a gait, an outline shell and working shadows.
 *
 *   const crowd = makeCrowd(geo, { color: PAL.friend, max: 900, outline: 0.03 });
 *   crowd.set(i, x, y, z, scale, yaw, anim, phase, tintVec3?)
 *   crowd.count = n;  crowd.commit();
 *   crowd.update(dt);     // advances the shared clock
 *   scene.add(crowd.group);
 *
 * `set()` writes straight into the instance matrix array — no Object3D churn,
 * no per-unit garbage. Call `commit()` once a frame after the last `set()`.
 */
export function makeCrowd(geometry, opts = {}) {
  const max = opts.max || 512;
  const uniforms = { uTime: { value: 0 } };
  const tinted = opts.tint !== false;

  const mat = injectCrowd(flatMat(opts.color ?? 0xffffff, opts), uniforms, tinted);
  const mesh = new THREE.InstancedMesh(geometry, mat, max);
  mesh.frustumCulled = false;
  mesh.castShadow = opts.castShadow !== false;
  mesh.receiveShadow = false;
  mesh.count = 0;

  // Per-instance animation data. `aTint` lets one crowd carry casualties,
  // flashes and team shading without a second draw call.
  const phase = new Float32Array(max);
  const anim = new Float32Array(max);
  const tint = new Float32Array(max * 3).fill(1);
  for (let i = 0; i < max; i++) phase[i] = Math.random() * Math.PI * 2;
  geometry.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
  geometry.setAttribute('aAnim', new THREE.InstancedBufferAttribute(anim, 1));
  geometry.setAttribute('aTint', new THREE.InstancedBufferAttribute(tint, 3));

  // Shadows need the same deformation or the shadow stands still while the man
  // runs. This is the whole reason the GLSL above is shared.
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  injectCrowd(depth, uniforms, false);
  mesh.customDepthMaterial = depth;

  const group = new THREE.Group();
  group.add(mesh);

  let outline = null;
  if (opts.outline) {
    const om = injectCrowd(outlineMat(opts.outline, opts.outlineColor), uniforms, false);
    outline = new THREE.InstancedMesh(geometry, om, max);
    outline.frustumCulled = false;
    outline.count = 0;
    outline.instanceMatrix = mesh.instanceMatrix;   // one buffer, two draws
    outline.renderOrder = -1;
    group.add(outline);
  }

  const arr = mesh.instanceMatrix.array;
  const api = {
    group, mesh, outline, geometry, material: mat, max,
    get count() { return mesh.count; },
    set count(n) { mesh.count = Math.min(n, max); if (outline) outline.count = mesh.count; },

    // Position + uniform scale + yaw, written as a 4x4 by hand. A Matrix4
    // compose per unit per frame is measurably slower at 700 units.
    set(i, x, y, z, s = 1, yaw = 0, animV = 0, ph = null, tintRGB = null) {
      if (i >= max) return;
      const c = Math.cos(yaw) * s, sn = Math.sin(yaw) * s;
      const o = i * 16;
      arr[o] = c;  arr[o + 1] = 0; arr[o + 2] = -sn; arr[o + 3] = 0;
      arr[o + 4] = 0; arr[o + 5] = s; arr[o + 6] = 0; arr[o + 7] = 0;
      arr[o + 8] = sn; arr[o + 9] = 0; arr[o + 10] = c; arr[o + 11] = 0;
      arr[o + 12] = x; arr[o + 13] = y; arr[o + 14] = z; arr[o + 15] = 1;
      anim[i] = animV;
      if (ph != null) phase[i] = ph;
      if (tintRGB) { tint[i * 3] = tintRGB[0]; tint[i * 3 + 1] = tintRGB[1]; tint[i * 3 + 2] = tintRGB[2]; }
      else if (tint[i * 3] !== 1 || tint[i * 3 + 1] !== 1 || tint[i * 3 + 2] !== 1) {
        tint[i * 3] = tint[i * 3 + 1] = tint[i * 3 + 2] = 1;
      }
    },
    commit() {
      mesh.instanceMatrix.needsUpdate = true;
      geometry.attributes.aAnim.needsUpdate = true;
      geometry.attributes.aPhase.needsUpdate = true;
      geometry.attributes.aTint.needsUpdate = true;
    },
    update(dt) { uniforms.uTime.value += dt; },
    setColor(c) { mat.color.set(c); },
    dispose() {
      mesh.dispose(); mat.dispose(); depth.dispose();
      if (outline) { outline.dispose(); outline.material.dispose(); }
      geometry.dispose();
    },
  };
  return api;
}

// --------------------------------------------------------------------------
// Geometry helpers
// --------------------------------------------------------------------------

// Tag every vertex of a box with a body part and merge it into a running list.
// units.js builds every soldier and vehicle this way, so one geometry per tier
// carries its own rig with no bones anywhere in the project.
export function partBox(w, h, d, x, y, z, part = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  const n = g.attributes.position.count;
  g.setAttribute('aPart', new THREE.BufferAttribute(new Float32Array(n).fill(part), 1));
  return g;
}

export function mergeParts(geos) {
  // Hand-rolled merge: BufferGeometryUtils would pull in an addon for one call
  // and we need `aPart` preserved either way.
  let vTotal = 0, iTotal = 0;
  for (const g of geos) { vTotal += g.attributes.position.count; iTotal += g.index ? g.index.count : 0; }
  const pos = new Float32Array(vTotal * 3);
  const nor = new Float32Array(vTotal * 3);
  const uv = new Float32Array(vTotal * 2);
  const part = new Float32Array(vTotal);
  const idx = new Uint16Array(iTotal);
  let vo = 0, io = 0;
  for (const g of geos) {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array, vo * 3);
    nor.set(g.attributes.normal.array, vo * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, vo * 2);
    if (g.attributes.aPart) part.set(g.attributes.aPart.array, vo);
    if (g.index) for (let i = 0; i < g.index.count; i++) idx[io + i] = g.index.array[i] + vo;
    vo += n; io += g.index ? g.index.count : 0;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setAttribute('aPart', new THREE.BufferAttribute(part, 1));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}

// --------------------------------------------------------------------------
// Signage
// --------------------------------------------------------------------------

// Canvas textures for gate faces and barrier numbers. Cached by key — a level
// with forty `+1` gates must not allocate forty 256px canvases.
const texCache = new Map();
export function canvasTex(key, w, h, draw) {
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 4;
  t.colorSpace = THREE.SRGBColorSpace;
  texCache.set(key, t);
  return t;
}
export function clearTexCache() {
  for (const t of texCache.values()) t.dispose();
  texCache.clear();
}

// The house lettering: fat, white, hard black stroke, squeezed to fit. Used on
// every sign in the game so a `+99` and a `140` are unmistakably the same font.
export function signText(ctx, text, cx, cy, maxW, size, fill = '#fff', stroke = '#14202c') {
  ctx.save();
  ctx.font = `900 ${size}px "Arial Black", Impact, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const w = ctx.measureText(text).width;
  if (w > maxW) { ctx.translate(cx, cy); ctx.scale(maxW / w, 1); ctx.translate(-cx, -cy); }
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(4, size * 0.14);
  ctx.strokeStyle = stroke;
  ctx.strokeText(text, cx, cy);
  ctx.fillStyle = fill;
  ctx.fillText(text, cx, cy);
  ctx.restore();
}

export const hex = (n) => '#' + n.toString(16).padStart(6, '0');
