// Muzzle bloom, propellant smoke and the blast wash on the water — C3.
// Drifting smoke that follows a shell is NOT here; that is round.js, C6's, on the same cards.
//
// Three things the plates make non-negotiable, and the reason this file is bigger than a puff of
// sprites: the flash has a DARK core (brown propellant smoke wrapped around a white centre, not a
// uniform orange blob), it throws ember sparks, and it LIGHTS things — the turret face, the deck,
// its own smoke and the sea. An emitter's own frame must be the brightest thing its glow touches.
//
// The shared card field is additive, which cannot draw dark smoke, so this file owns one extra
// CardField on a normal-blended material. It is still pooled and still one draw call.

import * as THREE from 'three';
import { registerEmitter } from './index.js';
import { CardField } from './pool.js';
import { rng, fields, smoothstep, clamp } from '../textures/noise.js';
import { track } from '../../engine/budget.js';

const BASE = 6.2;              // metres of fireball at size 1, before VFX[size].scale
const LIFE = 1.35;

// A pinned phase makes a still reproducible: the shot harness settles for 45 frames, so an
// unpinned flash is long dead by capture and every render would land on a different frame anyway.
let pinned = null;
let pinSpread = 0;
let order = 0;
// `spread` staggers a salvo: the nth gun emitted is that many seconds younger, which is what a
// broadside looks like in every plate we have — never four identical fireballs.
export function setMuzzlePhase(t, spread = 0) { pinned = t; pinSpread = spread; }
export function resetGunOrder() { order = 0; }
export function muzzlePhase() { return pinned; }

// Additive blending happens in the FRAMEBUFFER, after each fragment has already been tone-mapped,
// so N overlapping cards sum in LDR and anything past 1.0 is a flat white plateau — measured at
// 0.94% of the guns_fire frame sitting at exactly (255,255,255) against the plate's 0.000%. There
// is no bloom pass to give the core a soft knee, so the knee goes in the BLEND:
//   dst' = src * (1 - dst) + dst
// which approaches 1 asymptotically and can never reach it. The core keeps a gradient all the way
// through instead of clipping, and it costs nothing.
//
// The blend factor is on the source COLOUR, so the fragment's alpha no longer modulates it — every
// texture on this path carries its falloff premultiplied into rgb.
function softAdd(mat) {
  mat.blending = THREE.CustomBlending;
  mat.blendEquation = THREE.AddEquation;
  mat.blendSrc = THREE.OneMinusDstColorFactor;
  mat.blendDst = THREE.OneFactor;
  mat.blendSrcAlpha = THREE.OneFactor;
  mat.blendDstAlpha = THREE.OneFactor;
  return mat;
}

let smoke = null;
let smokeAlpha = null;
let smokeFrame = -1;
let fireCards = null;
let fireFrame = -1;

// The shared card field is a hard additive on a soft DISC, and at 4x that disc's rim is countable
// — ten crisp white bokeh circles round the flash in the last round. This field is the same idea
// with the two things that were wrong fixed: soft-additive blending, and a falloff with no rim.
function fireField(ctx) {
  if (fireCards) return fireCards;
  const mat = softAdd(new THREE.MeshBasicMaterial({
    map: fireCardTexture(), transparent: true, depthWrite: false, fog: false, toneMapped: true,
  }));
  fireCards = new CardField(250, mat);
  fireCards.mesh.renderOrder = 5;
  ctx.root.add(fireCards.mesh);
  return fireCards;
}

function pumpFire(ctx) {
  const f = window.__waterline?.frames?.() ?? -1;
  if (!fireCards || f === fireFrame) return;
  fireFrame = f;
  fireCards.update(ctx.app.camera);
}

let fireCardTex = null;
// rgb carries the falloff (premultiplied — softAdd ignores alpha), and the falloff runs to zero
// over the WHOLE quad with a high exponent, so there is no radius at which it stops and draws an
// edge. NoColorSpace: this is a ramp, not a colour, and an sRGB decode would bend it.
function fireCardTexture() {
  if (fireCardTex) return fireCardTex;
  const S = 64;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  const img = g.createImageData(S, S);
  for (let y = 0; y < S; y++) {
    const v = (y + 0.5) / S - 0.5;
    for (let x = 0; x < S; x++) {
      const u = (x + 0.5) / S - 0.5;
      const d = Math.min(1, Math.hypot(u, v) * 2);
      const a = Math.pow(1 - d, 2.8) * (0.55 + 0.45 * (1 - d * d));
      const i = (y * S + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = a * 255;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  fireCardTex = new THREE.CanvasTexture(cv);
  fireCardTex.colorSpace = THREE.NoColorSpace;
  fireCardTex.minFilter = THREE.LinearMipmapLinearFilter;
  fireCardTex.needsUpdate = true;
  track(fireCardTex, { w: S, h: S, fmt: 'rgba', mips: true, label: 'vfx:firecard' });
  return fireCardTex;
}

// The shared card field is additive, so a per-instance alpha would be meaningless there and
// index.js does not provide one. Dark smoke needs it: without a per-card fade every puff pops out
// of existence at the same instant, which is the tell that a "cloud" is twelve quads.
function smokeField(ctx) {
  if (smoke) return smoke;
  const mat = new THREE.MeshBasicMaterial({
    map: smokeTexture(), transparent: true, depthWrite: false, fog: true, toneMapped: true,
  });
  mat.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aAlpha;\nvarying float vA;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vA = aAlpha;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vA;')
      .replace('#include <opaque_fragment>', 'gl_FragColor = vec4( outgoingLight, diffuseColor.a * vA );');
  };
  mat.customProgramCacheKey = () => 'waterlineGunSmokeAlpha';
  smoke = new CardField(300, mat);
  smokeAlpha = new THREE.InstancedBufferAttribute(new Float32Array(300), 1);
  smokeAlpha.setUsage(THREE.DynamicDrawUsage);
  smoke.mesh.geometry.setAttribute('aAlpha', smokeAlpha);
  smoke.mesh.renderOrder = 3;
  ctx.root.add(smoke.mesh);
  return smoke;
}

// index.js only pumps its own field, so this one ticks off the first live muzzle each frame.
function pumpSmoke(ctx) {
  const f = window.__waterline?.frames?.() ?? -1;
  if (!smoke || f === smokeFrame) return;
  smokeFrame = f;
  for (const s of smoke.slots) smokeAlpha.array[s.i] = s.live ? s.alpha : 0;
  smokeAlpha.needsUpdate = true;
  smoke.update(ctx.app.camera);
}

let smokeTex = null;
// Its own texture rather than index.js's soft disc: a smooth radial gradient stacked twelve deep
// integrates into a hard-edged lozenge, which is what propellant smoke must not look like.
//
// Two rules learned at 4x magnification. The alpha carries ONLY low-frequency shape — the fine
// noise pass-1 multiplied in resolved as clumps of dithered pixels the moment anyone zoomed in.
// And the rgb carries a top-to-bottom light ramp, so every card has a lit face and a shadowed
// face; cards are rotated only a few degrees off vertical so that ramp survives billboarding.
function smokeTexture() {
  if (smokeTex) return smokeTex;
  const S = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  const img = g.createImageData(S, S);
  const f = fields();
  for (let y = 0; y < S; y++) {
    const v = (y + 0.5) / S - 0.5;
    for (let x = 0; x < S; x++) {
      const u = (x + 0.5) / S - 0.5;
      const d = Math.hypot(u, v) * 2;
      const n = f.coarse.at(u * 1.1 + 0.5, v * 1.1 + 0.5) - 0.5;
      const a = smoothstep(1.0, 0.10, d * (0.90 + 0.34 * n));
      // sun from above: the top of a puff is 2.4x the value of its underside
      const lit = (0.40 + 0.60 * smoothstep(0.55, -0.55, v * 2)) * (0.88 + 0.12 * (1 - d));
      const i = (y * S + x) * 4;
      img.data[i] = 255 * lit; img.data[i + 1] = 249 * lit; img.data[i + 2] = 240 * lit;
      img.data[i + 3] = a * 255;
    }
  }
  g.putImageData(img, 0, 0);
  smokeTex = new THREE.CanvasTexture(cv);
  smokeTex.colorSpace = THREE.SRGBColorSpace;
  smokeTex.minFilter = THREE.LinearMipmapLinearFilter;
  smokeTex.needsUpdate = true;
  track(smokeTex, { w: S, h: S, fmt: 'rgba', mips: true, label: 'vfx:gunsmoke' });
  return smokeTex;
}

// ── the flash itself: a lit volume, not a card ──────────────────────────────────────────────
//
// There is no bloom pass in engine/post.js, so a big glow cannot be got by making a card bright —
// pass 1 tried that and clipped 6% of the frame to pure white while lighting nothing. The read has
// to come from geometry instead: a lathed flame body along the bore axis with a gradient down its
// length, a shock ring perpendicular to it, and a light placed OFF the axis so the barrels it
// stands over actually take some of it.

let flame = null, ring = null;
const CAP = 8;

function flameTexture() {
  const S = 64;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  const img = g.createImageData(S, S);
  for (let y = 0; y < S; y++) {
    const v = (y + 0.5) / S;                       // 0 at the bore, 1 at the tip
    // hot and tight at the muzzle, cooling and thinning down the length
const a = Math.pow(smoothstep(-0.06, 0.46, v), 0.85) * Math.pow(1 - v, 1.9);
    for (let x = 0; x < S; x++) {
      const u = (x + 0.5) / S;
      // four soft flutes around the axis: a perfectly smooth cone is an airbrush, and the plates
      // all show a flash breaking into lobes as it leaves the bore
      const flute = 0.93 + 0.07 * Math.cos(u * Math.PI * 6);
      const heat = Math.pow(1 - v, 1.8);
      const i = (y * S + x) * 4;
      img.data[i] = 255;
      img.data[i + 1] = (150 + 95 * heat);
      img.data[i + 2] = (36 + 150 * heat * heat);
      img.data[i + 3] = clamp(a * flute, 0, 1) * 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.needsUpdate = true;
  return track(t, { w: S, h: S, fmt: 'rgba', mips: true, label: 'vfx:flame' });
}

// Pass 2's thin shock ring drew a countable circle across the flash — a hard-edged annulus is the
// one shape a flash must not have. Same slot, same cost, but it is now the broad warm halo the
// scene has no bloom pass to give it: soft-additive means a big halo cannot flatten what is under
// it, which is exactly what a bloom pass would have bought.
function ringTexture() {
  const S = 64;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  const img = g.createImageData(S, S);
  for (let y = 0; y < S; y++) {
    const v = (y + 0.5) / S - 0.5;
    for (let x = 0; x < S; x++) {
      const u = (x + 0.5) / S - 0.5;
      const d = Math.min(1, Math.hypot(u, v) * 2);
      // premultiplied: softAdd blends on the source colour and never looks at alpha
      const a = clamp(Math.pow(1 - d, 3.2) * (0.4 + 0.6 * (1 - d)), 0, 1);
      const i = (y * S + x) * 4;
      img.data[i] = 255 * a; img.data[i + 1] = 176 * a; img.data[i + 2] = 92 * a;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return track(t, { w: S, h: S, fmt: 'rgba', mips: true, label: 'vfx:shock' });
}

function flameGeo() {
  const pts = [];
  const N = 16;
  for (let i = 0; i <= N; i++) {
    const s = i / N;
    // s^0.42 (1-s)^0.75 peaks at s = 0.36 — a body that swells just off the bore and tapers to a
    // point, which is the silhouette of every naval muzzle flash in the plate set
    pts.push(new THREE.Vector2(Math.max(0.004, Math.pow(s, 0.42) * Math.pow(1 - s, 0.75) * 0.62), s));
  }
  // LatheGeometry revolves about +Y; the bore is local +X
  return new THREE.LatheGeometry(pts, 20).rotateZ(-Math.PI / 2);
}

// A lathed shell drawn flat is a conch, not a flame: its silhouette is exactly where the alpha is
// highest and the eye reads a hard rim. Fading by |N·V| inverts that — the shell is thickest where
// a ray passes through the most of it, which is the centre — and the same surface reads as a soft
// body of burning gas. This is the only way to get volume out of one draw call with no bloom pass.
function volumeShade(mat) {
  mat.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vNv;\nvarying vec3 vVv;')
      .replace('#include <project_vertex>', `
        vec3 iN = normal;
        #ifdef USE_INSTANCING
          iN = mat3( instanceMatrix ) * iN;
        #endif
        vNv = normalize( normalMatrix * iN );
        #include <project_vertex>
        vVv = normalize( -mvPosition.xyz );`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vNv;\nvarying vec3 vVv;')
      .replace('#include <opaque_fragment>',
        'float dk = pow( abs( dot( normalize( vNv ), normalize( vVv ) ) ), 4.00 );\n'
        + 'gl_FragColor = vec4( outgoingLight * dk * diffuseColor.a, 1.0 );');
  };
  mat.customProgramCacheKey = () => 'waterlineFlameVolPre';
  return mat;
}

function volumes(ctx) {
  if (flame) return;
  const mk = (geo, map, vol) => {
    const mat = softAdd(new THREE.MeshBasicMaterial({
      map, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      toneMapped: true, fog: false, forceSinglePass: true,
    }));
    const m = new THREE.InstancedMesh(geo, vol ? volumeShade(mat) : mat, CAP);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 3), 3);
    m.instanceColor.setUsage(THREE.DynamicDrawUsage);
    m.frustumCulled = false;
    m.count = CAP;
    m.renderOrder = 4;
    ctx.root.add(m);
    return { mesh: m, busy: new Array(CAP).fill(false) };
  };
  flame = mk(flameGeo(), flameTexture(), true);
  ring = mk(new THREE.PlaneGeometry(1, 1), ringTexture(), false);
  hideAll();
}

const ZERO = new THREE.Vector3(0, 0, 0);
const M4 = new THREE.Matrix4();
const QI = new THREE.Quaternion();
function hideAll() {
  for (const f of [flame, ring]) {
    for (let i = 0; i < CAP; i++) { M4.compose(ZERO, QI, ZERO); f.mesh.setMatrixAt(i, M4); }
    f.mesh.instanceMatrix.needsUpdate = true;
  }
}

function takeSlot(f) {
  const i = f.busy.indexOf(false);
  if (i < 0) return -1;
  f.busy[i] = true;
  return i;
}

function setSlot(f, i, pos, quat, scale, col) {
  if (i < 0) return;
  M4.compose(pos, quat, scale);
  f.mesh.setMatrixAt(i, M4);
  f.mesh.setColorAt(i, col);
  f.mesh.instanceMatrix.needsUpdate = true;
  f.mesh.instanceColor.needsUpdate = true;
}

function freeSlot(f, i) {
  if (i < 0) return;
  f.busy[i] = false;
  M4.compose(ZERO, QI, ZERO);
  f.mesh.setMatrixAt(i, M4);
  f.mesh.instanceMatrix.needsUpdate = true;
}

// The disturbed patch of water under a muzzle. Additive and horizontal, so it reads as the sea
// being lit and flattened by the blast rather than as a decal pasted on it.
let washGeo = null;
let washMat = null;
function washMesh(ctx) {
  if (!washGeo) {
    washGeo = new THREE.PlaneGeometry(2, 2);
    washGeo.rotateX(-Math.PI / 2);
    // a flat ring with no falloff draws a hard-edged ellipse on the water, which is exactly the
    // decal look the critics name; the radial map is what makes it read as light on the sea
    washMat = new THREE.MeshBasicMaterial({
      map: radialTexture(), color: 0xffb268, transparent: true, opacity: 0, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false, forceSinglePass: true,
    });
  }
  const m = new THREE.Mesh(washGeo, washMat);
  m.frustumCulled = false;
  ctx.root.add(m);
  return m;
}

let radTex = null;
function radialTexture() {
  if (radTex) return radTex;
  const S = 64;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, S, S);
  radTex = new THREE.CanvasTexture(cv);
  radTex.colorSpace = THREE.SRGBColorSpace;
  radTex.needsUpdate = true;
  track(radTex, { w: S, h: S, fmt: 'rgba', mips: true, label: 'vfx:blastwash' });
  return radTex;
}

const washPool = [];
function takeWash(ctx) {
  const m = washPool.find(w => !w.userData.busy) ?? (washPool.length < 2 ? washPool[washPool.push(washMesh(ctx)) - 1] : washPool[0]);
  m.userData.busy = true;
  return m;
}

const SEA = [{ pos: new THREE.Vector3(), colour: new THREE.Color('#ff9433'), intensity: 0, radius: 220 }];
let seaOwner = null;

const v = new THREE.Vector3();
const fwd = new THREE.Vector3();
let shots = 0;

// The sun's direction, so smoke can have a lit face. lighting.sun sits at dir * extent, so its
// position normalised IS the direction toward the sun.
const SUN = new THREE.Vector3(-0.5, 0.7, 0.4).normalize();
function sunDir() {
  const s = window.__waterline?.world?.lighting?.sun;
  return s ? SUN.copy(s.position).normalize() : SUN;
}

registerEmitter('muzzle', (ctx, anchor, size) => {
  const cfg = ctx.size(size);
  const R = BASE * cfg.scale;
  anchor.updateWorldMatrix(true, false);
  anchor.getWorldPosition(v);
  // the bore is ship-local +X, which is column 0 of the anchor's world matrix — not
  // getWorldDirection(), which returns -Z and would fire every gun sideways
  const e = anchor.matrixWorld.elements;
  fwd.set(e[0], e[1], e[2]).normalize();

  const side = new THREE.Vector3(-fwd.z, 0, fwd.x).normalize();
  const up = new THREE.Vector3(0, 1, 0);
  const ord = order++;
  const r = rng(1000 + (shots++ % 64) * 37);

  const hot = [];       // soft-additive: fireball and embers
  const puffs = [];     // normal-blended propellant smoke
  const field = smokeField(ctx);
  const hotField = fireField(ctx);

  const push = (arr, slot, o) => { if (slot) arr.push({ s: slot, ...o }); };

  volumes(ctx);
  const bore = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), fwd);
  const iFlame = takeSlot(flame);
  const iRing = takeSlot(ring);

  // No core cards. Two big bright cards stacked on the bore were the 90x110 px structureless white
  // slab: under LDR additive they were the layer that pushed the sum past 1.0 and flattened it.
  // The core is the flame body's job, and the body has a gradient all the way through.
  //
  // fireball — an outward shell rather than a filled blob. Each card carries well under unit
  // brightness so the sum keeps its colour, and the deep-orange fringe cards are the largest,
  // which is what gives the cauliflower edge in the plates.
  const N = Math.round(13 * cfg.cards);
  for (let i = 0; i < N; i++) {
    const t = i / N;
    const dep = 0.16 + Math.pow(t, 0.7) * 0.86;                       // along the bore
    const rad = R * (0.30 + Math.pow(t, 0.55) * 0.58) * (0.65 + r() * 0.7);
    const a = r() * Math.PI * 2;
    const o = fwd.clone().multiplyScalar(R * dep)
      .addScaledVector(side, Math.cos(a) * rad)
      .addScaledVector(up, Math.sin(a) * rad * 0.9);
    const heat = Math.pow(1 - t, 1.7) * (0.65 + r() * 0.5);
    const b = 0.085 + heat * 1.15;
    push(hot, hotField.take(), {
      off: o,
      vel: o.clone().normalize().multiplyScalar(R * (0.5 + r() * 1.0)),
      s0: R * (0.17 + t * 0.34 + r() * 0.12), grow: R * (0.55 + r() * 0.7),
      col: new THREE.Color().setRGB(b, b * (0.22 + heat * 0.44), b * (0.006 + heat * 0.28)),
      fade: 0.16 + t * 0.30 + r() * 0.10, born: t * 0.030,
    });
  }

  // embers — the detail that stops a fireball reading as one painted blob. Dim and small: at full
  // brightness on a hard additive they resolved as ten crisp white bokeh discs, which is the
  // opposite of detail.
  for (let i = 0; i < Math.round(8 * cfg.cards); i++) {
    const dir = fwd.clone().multiplyScalar(0.6 + r())
      .addScaledVector(side, (r() - 0.5) * 1.6).addScaledVector(up, (r() - 0.5) * 1.5).normalize();
    push(hot, hotField.take(), {
      off: dir.clone().multiplyScalar(R * (0.3 + r() * 0.5)),
      vel: dir.multiplyScalar(R * (1.6 + r() * 2.6)), grav: -R * 1.4,
      s0: R * (0.016 + r() * 0.020), grow: 0,
      col: new THREE.Color(0.42, 0.26, 0.10), fade: 0.5 + r() * 0.5, born: 0.01,
    });
  }

  // propellant smoke — a shell wrapped AROUND and behind the fireball, not a plume leaving it.
  // The dark ring hugging a white centre is the single most recognisable thing about a naval
  // muzzle flash and it is the reason this field exists at all.
  const NS = Math.round(30 * cfg.cards);
  for (let i = 0; i < NS; i++) {
    const t = i / NS;
    // fully random around the bore, not a spiral: a regular ring seen end-on reads as an arch
    // hanging over the barrel rather than as a body of smoke
    const a = r() * Math.PI * 2;
    const rad = R * (0.42 + t * 0.72) * (0.55 + r() * 0.85);
    const o = fwd.clone().multiplyScalar(R * (-0.10 + t * 1.30 + (r() - 0.5) * 0.45))
      .addScaledVector(side, Math.cos(a) * rad)
      .addScaledVector(up, Math.sin(a) * rad * 0.85);
    push(puffs, field.take(), {
      off: o,
      n: o.clone().normalize(),
      vel: o.clone().normalize().multiplyScalar(R * (0.30 + r() * 0.45)).addScaledVector(up, R * 0.22),
      s0: R * (0.28 + t * 0.34) * (0.6 + r() * 0.8), grow: R * (0.5 + r() * 0.55),
      dark: 0.055 + r() * 0.055, fade: 0.9 + r() * 0.5, born: 0.008 + t * 0.05,
      // only a few degrees off vertical, so the card's own baked top-light survives
      rot: (r() - 0.5) * 0.7,
    });
  }

  const light = ctx.lights.acquire();
  light.color.set(0xffab5c);
  // OFF the bore axis, and this is the whole fix. Pass 1 put the light on the axis extended, where
  // N·L on a barrel running along that same axis is cos 89° — the barrels a metre from a 2400 cd
  // flash came back stone cold, and the answer was never a brighter light.
  light.distance = R * 6;
  light.position.copy(v).addScaledVector(fwd, R * 0.20).addScaledVector(up, R * 0.28)
    .addScaledVector(side, R * 0.10);

  const wash = takeWash(ctx);
  const ocean = window.__waterline?.world?.ocean;
  const wx = v.x + fwd.x * R * 0.7, wz = v.z + fwd.z * R * 0.7;
  // the sea has waves and this plane does not, so it has to clear the crests or it slices
  // through them and draws an angular polygon boundary on the water
  wash.position.set(wx, (ocean?.heightAt(wx, wz) ?? 0) + 2.2, wz);

  if (ocean) {
    SEA[0].pos.set(wash.position.x, 3, wash.position.z);
    // radius is the r in r/(r+d), so it is where the falloff bites — not a reach. At R*26 a single
    // gun lit the sea to the horizon and the whole frame came back striped orange.
    SEA[0].radius = R * 1.6;
    seaOwner = wash;
  }

  const w = new THREE.Vector3();
  const ball = new THREE.Vector3();
  const camQ = new THREE.Quaternion();
  const sun = sunDir();
  const fCol = new THREE.Color();
  const fPos = new THREE.Vector3();
  const fScale = new THREE.Vector3();
  let t = 0;

  const shape = () => {
    const glow = Math.max(0, 1 - t / 0.30);          // what the flash lights the world with
    ball.copy(v).addScaledVector(fwd, R * 0.55);     // the fireball's centre, for the smoke's lit side
    // the flame body: it grows along the bore for the first 40 ms, then burns back and dims
    const gk = Math.min(1, t / 0.030);
    const len = R * (0.44 + 0.46 * gk);
    const fade = Math.max(0, 1 - t / 0.20);
    fPos.copy(v).addScaledVector(fwd, R * 0.02);
    fScale.set(len, len * 0.80, len * 0.80);
    fCol.setScalar(3.40 * Math.pow(fade, 1.2));
    setSlot(flame, iFlame, fPos, bore, fScale, fCol);
    // the halo: broad, warm, and it swells for the first 120 ms
    const rk = Math.min(1, t / 0.12);
    const rs = R * (0.85 + rk * 0.60);
    fPos.copy(v).addScaledVector(fwd, R * 0.58);
    fScale.set(rs, rs, rs);
    fCol.setScalar(1.00 * Math.pow(fade, 0.8));
    // billboarded, not bored: from a camera near the line of fire a bore-aligned plane is edge-on
    setSlot(ring, iRing, fPos, ctx.app.camera.getWorldQuaternion(camQ), fScale, fCol);
    for (const c of hot) {
      const age = Math.max(0, t - c.born);
      const k = Math.max(0, 1 - age / c.fade);
      c.s.pos.copy(v).add(c.off).addScaledVector(c.vel, age);
      if (c.grav) c.s.pos.y += 0.5 * c.grav * age * age;
      c.s.scale = c.s0 + c.grow * age;
      // additive cards carry their own brightness in the colour, so the fade is a multiply
      c.s.colour.copy(c.col).multiplyScalar(k * k * (age > 0 ? 1 : 0));
      c.s.alpha = k > 0 ? 1 : 0;
    }
    for (const c of puffs) {
      const age = Math.max(0, t - c.born);
      const k = Math.max(0, 1 - age / c.fade);
      c.s.pos.copy(v).add(c.off).addScaledVector(c.vel, age);
      c.s.pos.y += age * age * 1.1;
      c.s.scale = c.s0 + c.grow * age;
      c.s.rot = c.rot;
      // Three directions do the shading. The sun gives every puff a lit face and a shadowed face.
      // The other two are the fix for "the flash-facing hemisphere of its own smoke is untouched":
      // smoke is MeshBasic, so no PointLight can ever reach it, and the warm term has to be
      // computed here — from the FIREBALL's position, not from the bore. A puff two metres to one
      // side of the ball was getting n.fwd ~ 0 and coming back as cold grey next to a white core,
      // which is the single clearest tell that a cloud is a stack of cards.
      const top = clamp(0.5 + 0.5 * c.n.dot(sun), 0, 1);
      w.copy(c.s.pos).sub(ball);
      const dist = Math.max(R * 0.5, w.length());
      w.divideScalar(dist);
      const facing = Math.pow(clamp(-w.dot(c.n), 0, 1), 1.5);
      const l = c.dark * (0.85 + 1.95 * top);
      const warm = glow * 1.25 * facing * Math.min(1, (R * 0.9) / dist) ** 2;
      c.s.colour.setRGB(l * 1.04 + warm, l * 0.90 + warm * 0.46, l * 0.80 + warm * 0.13);
      c.s.alpha = Math.min(0.62, k * 0.95) * (age > 0 ? 1 : 0);
    }
    // candela at 1 m with decay 2, so the near thirty metres take it and the far hull does not.
    // Off-axis placement is what makes this readable at all — see where light.position is set.
    light.intensity = 2100 * cfg.light * Math.pow(glow, 1.6);
    wash.scale.setScalar(R * (1.3 + t * 4.5));
    wash.material.opacity = 0.28 * Math.pow(glow, 2.0);
    if (seaOwner === wash) {
      SEA[0].intensity = 0.55 * Math.pow(glow, 1.5);
      window.__waterline?.world?.ocean?.setSeaLights(SEA[0].intensity > 0.01 ? SEA : []);
    }
  };

  shape();

  return ctx.add({
    update(dt) {
      t = pinned !== null ? Math.max(0.004, pinned - ord * pinSpread) : t + dt;
      shape();
      pumpSmoke(ctx);
      pumpFire(ctx);
      return pinned !== null || t < LIFE;
    },
    kill() {
      for (const c of hot) hotField.give(c.s);
      for (const c of puffs) field.give(c.s);
      freeSlot(flame, iFlame);
      freeSlot(ring, iRing);
      ctx.lights.release(light);
      wash.material.opacity = 0;
      wash.userData.busy = false;
      if (seaOwner === wash) { seaOwner = null; window.__waterline?.world?.ocean?.setSeaLights([]); }
    },
  });
});

