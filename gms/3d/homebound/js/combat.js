// Bullets and damage. One instanced quad batch, one flat Float32Array per
// property, and the hit resolution that feeds gates, barriers, enemies and the
// boss.
//
// MANAGER: three notes on contracts this file sits across.
//   1. GATE AND BARRIER DAMAGE GOES THROUGH THE RETURNED OBJECT, not the bus.
//      `gateHitTest()` and `barrierHitTest()` both hand back an object carrying
//      `hit/damage/applyDamage`, and gates.js emits `gate:hit` from inside its
//      own `hitGate()`. So combat.js must NOT also emit `gate:hit` — every
//      listener would fire twice and the gate would grow at double rate. The
//      bus emit below is a fallback for a stub that returns a bare object.
//   2. `army:count` reason. Losses from enemy fire are reported with
//      reason:'enemy', which is not in the four listed in CLAUDE.md
//      (gate|kill|barrier|trap). Enemy fire is the main source of losses in a
//      run and labelling it 'trap' would make the HUD lie. Please add 'enemy'
//      to the table, or tell me to fall back to 'trap'.
//   3. `state.kills` is incremented by enemies.js, not game.js. There is no bus
//      listener in game.js that would otherwise ever move it off zero, and
//      `endRun` reports it in the stats.
//
// WHY THE SHOOTERS ARE FAKE. 400 men firing individually is 400 bullets, 400
// hit tests and 400 muzzle quads a volley, which is not a frame budget, it is a
// slideshow. `army.js:shooters()` hands back at most `GUN.fireCap` positions
// across the FRONT of the blob; those men stand in for the whole squad and the
// squad's entire `squadDps()` is divided among the bullets they actually spawn.
// Damage is therefore independent of how many tracers you can see, which is the
// only reason 400 men and 60 fps coexist.

import * as THREE from 'three';
import { GUN, PAL, ROAD, RUN, DEV_MODE } from './config.js';
import { state, tierDef, squadDps } from './state.js';
import { emit, on } from './bus.js';
import { clamp, rand } from './utils.js';
import { addShake } from './render.js';
import { muzzleFlash, battleGlow, impactFlash, sparkBurst, hitPuff } from './vfx.js';
import { sfx } from './audio.js';

// Sibling systems. These are stubs in some builds and are called defensively —
// a missing hit test must mean "nothing there", never a thrown frame.
import { shooters } from './army.js';
import { killTroops } from './army.js';
import { enemyHitTest } from './enemies.js';
import { gateHitTest } from './gates.js';
import { barrierHitTest } from './barriers.js';

const N = GUN.poolSize;

// --------------------------------------------------------------------------
// The bullet pool — structure of arrays, dense, swap-removed
// --------------------------------------------------------------------------
// Dense means the GPU write is a straight memcpy-shaped loop with no gaps and
// no per-frame compaction pass. Swap-remove keeps it dense for free: a dead
// bullet is overwritten by the last live one and the count drops by one.

const px = new Float32Array(N), py = new Float32Array(N), pz = new Float32Array(N);
const vx = new Float32Array(N), vy = new Float32Array(N), vz = new Float32Array(N);
const life = new Float32Array(N);
const dmg = new Float32Array(N);
const side = new Uint8Array(N);          // 0 = ours, 1 = theirs
const pierce = new Uint8Array(N);
let n = 0;

let shotAcc = 0;                          // fractional rounds owed this frame
let shotIdx = 0;                          // round-robin over the stand-in shooters
let bloomT = 0;                           // refresh timer for the front-rank glow
let lossAcc = 0;                          // fractional men owed to enemy fire
let running = false;
let batch = null;

// --------------------------------------------------------------------------
// The tracer batch
// --------------------------------------------------------------------------
// Deliberately NOT vfx.js's pool: those particles simulate themselves, and a
// bullet's position is owned by the hit tests below. This is the same
// view-aligned beam trick — stretch the quad along the world velocity, widen it
// across the view vector — with a texture tuned for the reference's fat yellow
// bolts: a hard white spine inside a saturated shaft with a pointed head.

const VERT = /* glsl */`
attribute vec3 aPos;
attribute vec3 aDir;
attribute vec2 aScale;
attribute vec3 aColor;
attribute float aAlpha;
varying vec2 vUv;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vUv = uv; vColor = aColor; vAlpha = aAlpha;
  vec4 mv = modelViewMatrix * vec4(aPos, 1.0);
  vec3 a = (modelViewMatrix * vec4(aDir, 0.0)).xyz;
  float al = length(a);
  a = al > 1e-5 ? a / al : vec3(0.0, 1.0, 0.0);
  vec3 side = cross(a, normalize(-mv.xyz));
  float sl = length(side);
  side = sl > 1e-5 ? side / sl : vec3(1.0, 0.0, 0.0);
  mv.xyz += a * (position.y * aScale.y) + side * (position.x * aScale.x);
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */`
uniform sampler2D uMap;
varying vec2 vUv;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec4 t = texture2D(uMap, vUv);
  float a = t.a * vAlpha;
  if (a <= 0.003) discard;
  gl_FragColor = vec4(vColor * t.rgb, a);
  #include <colorspace_fragment>
}`;

// The bolt. Alpha is what the additive blend multiplies, so the spine is drawn
// well above 1.0 and clips to white on screen — that is where the reference's
// white-hot core inside a yellow shaft comes from, without a second draw.
function boltTexture() {
  const W = 64, H = 256;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');

  // shaft: soft across, brightest in the middle
  const across = g.createLinearGradient(0, 0, W, 0);
  across.addColorStop(0.00, 'rgba(255,255,255,0)');
  across.addColorStop(0.10, 'rgba(255,255,255,0.5)');
  across.addColorStop(0.24, 'rgba(255,255,255,1)');
  across.addColorStop(0.76, 'rgba(255,255,255,1)');
  across.addColorStop(0.90, 'rgba(255,255,255,0.5)');
  across.addColorStop(1.00, 'rgba(255,255,255,0)');
  g.fillStyle = across;
  g.fillRect(0, 0, W, H);

  // taper: fade the tail, keep the head hot, and point it
  g.globalCompositeOperation = 'destination-in';
  const along = g.createLinearGradient(0, H, 0, 0);   // y=H is the tail
  along.addColorStop(0.00, 'rgba(0,0,0,0)');
  along.addColorStop(0.30, 'rgba(0,0,0,0.55)');
  along.addColorStop(0.72, 'rgba(0,0,0,1)');
  along.addColorStop(0.94, 'rgba(0,0,0,1)');
  along.addColorStop(1.00, 'rgba(0,0,0,0)');
  g.fillStyle = along;
  g.fillRect(0, 0, W, H);
  // knock the corners off the head so it reads as an arrow tip
  g.fillStyle = 'rgba(0,0,0,0)';
  g.beginPath(); g.moveTo(0, 0); g.lineTo(W * 0.5, H * 0.13); g.lineTo(0, H * 0.13); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(W, 0); g.lineTo(W * 0.5, H * 0.13); g.lineTo(W, H * 0.13); g.closePath(); g.fill();

  // spine: a thin over-bright line straight up the middle
  g.globalCompositeOperation = 'lighter';
  const spine = g.createLinearGradient(0, 0, W, 0);
  spine.addColorStop(0.40, 'rgba(255,255,255,0)');
  spine.addColorStop(0.50, 'rgba(255,255,255,0.9)');
  spine.addColorStop(0.60, 'rgba(255,255,255,0)');
  g.fillStyle = spine;
  g.fillRect(0, H * 0.10, W, H * 0.82);

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  t.minFilter = t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  return t;
}

function makeBatch(scene) {
  const geo = new THREE.InstancedBufferGeometry();
  const base = new THREE.PlaneGeometry(1, 1);
  geo.setAttribute('position', base.attributes.position);
  geo.setAttribute('uv', base.attributes.uv);
  geo.setIndex(base.index);
  geo.instanceCount = 0;

  const aPos = new Float32Array(N * 3);
  const aDir = new Float32Array(N * 3);
  const aScale = new Float32Array(N * 2);
  const aColor = new Float32Array(N * 3);
  const aAlpha = new Float32Array(N);
  const at = {};
  const add = (name, arr, size) => {
    at[name] = new THREE.InstancedBufferAttribute(arr, size);
    at[name].setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute(name, at[name]);
  };
  add('aPos', aPos, 3); add('aDir', aDir, 3); add('aScale', aScale, 2);
  add('aColor', aColor, 3); add('aAlpha', aAlpha, 1);

  const tex = boltTexture();
  const mat = new THREE.ShaderMaterial({
    uniforms: { uMap: { value: tex } },
    vertexShader: VERT, fragmentShader: FRAG,
    transparent: true, depthTest: true, depthWrite: false,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 8;
  mesh.visible = false;
  mesh.name = 'tracers';
  scene.add(mesh);
  return { mesh, geo, mat, tex, base, at, aPos, aDir, aScale, aColor, aAlpha };
}

// Bolt colours, pre-converted to the renderer's working space once. Doing this
// per bullet would be a THREE.Color allocation per shot.
const _c = new THREE.Color();
const COL = new Float32Array(6);
function initColours() {
  _c.setHex(PAL.tracer); COL[0] = _c.r; COL[1] = _c.g; COL[2] = _c.b;
  _c.setHex(0xff6a3a);   COL[3] = _c.r; COL[4] = _c.g; COL[5] = _c.b;
}

// --------------------------------------------------------------------------
// Spawning
// --------------------------------------------------------------------------

function spawn(x, y, z, dx, dy, dz, speed, damage, sd, pierceN, len) {
  let i = n;
  if (i >= N) {
    // Pool full. Drop the OLDEST rather than the new shot: a missing muzzle
    // flash at the front of the squad is far more visible than a bolt that
    // ends early 40 m up the road.
    swap(0, --n);
    i = n;
  }
  n++;
  px[i] = x; py[i] = y; pz[i] = z;
  vx[i] = dx * speed; vy[i] = dy * speed; vz[i] = dz * speed;
  life[i] = GUN.bulletLife;
  dmg[i] = damage;
  side[i] = sd;
  pierce[i] = pierceN;
  const o3 = i * 3, o2 = i * 2;
  // FULL width and length in metres — the quad spans -0.5..0.5 in local space,
  // so aScale is the size, not the half-size. Fat on purpose: at this camera a
  // 0.3 m bolt is eight pixels and reads as a scratch, not as ordnance.
  batch.aScale[o2] = sd ? 0.40 : 0.78;
  batch.aScale[o2 + 1] = len || (sd ? 1.8 : 3.4);
  const c = sd ? 3 : 0;
  batch.aColor[o3] = COL[c]; batch.aColor[o3 + 1] = COL[c + 1]; batch.aColor[o3 + 2] = COL[c + 2];
  batch.aAlpha[i] = sd ? 1.5 : 2.4;
  return i;
}

function swap(i, j) {
  if (i === j) return;
  px[i] = px[j]; py[i] = py[j]; pz[i] = pz[j];
  vx[i] = vx[j]; vy[i] = vy[j]; vz[i] = vz[j];
  life[i] = life[j]; dmg[i] = dmg[j]; side[i] = side[j]; pierce[i] = pierce[j];
  const i3 = i * 3, j3 = j * 3, i2 = i * 2, j2 = j * 2;
  const b = batch;
  b.aScale[i2] = b.aScale[j2]; b.aScale[i2 + 1] = b.aScale[j2 + 1];
  b.aColor[i3] = b.aColor[j3]; b.aColor[i3 + 1] = b.aColor[j3 + 1]; b.aColor[i3 + 2] = b.aColor[j3 + 2];
  b.aAlpha[i] = b.aAlpha[j];
}

// --------------------------------------------------------------------------
// Where the shooters are
// --------------------------------------------------------------------------
// army.js owns this. The fallback is not a nicety: this file has to be
// developable and screenshot-able while army.js is still a stub, and a game
// that renders no gunfire cannot be art-directed.

const fallbackPos = new Float32Array(GUN.fireCap * 3);
function shooterPositions() {
  let arr = null;
  try { arr = shooters?.(); } catch (e) { arr = null; }
  if (arr && arr.length >= 3) return arr;

  const troops = Math.max(1, state.troops);
  const k = clamp(Math.round(Math.sqrt(troops) * 1.7), 1, GUN.fireCap);
  // The blob is a golden-angle disc, so its front edge is an arc of radius
  // `spacing * sqrt(count)`. Spread the stand-ins across it.
  const r = RUN.formSpacing * Math.sqrt(troops) * 0.92;
  for (let i = 0; i < k; i++) {
    const f = k === 1 ? 0.5 : i / (k - 1);
    const a = (f - 0.5) * 1.9;
    fallbackPos[i * 3] = clamp(state.x + Math.sin(a) * r, -ROAD.halfW, ROAD.halfW);
    fallbackPos[i * 3 + 1] = 1.28;
    fallbackPos[i * 3 + 2] = state.z + Math.cos(a) * r * 0.55 + 0.5;
  }
  return fallbackPos.subarray(0, k * 3);
}

// --------------------------------------------------------------------------
// Firing
// --------------------------------------------------------------------------

// Fire is STAGGERED, not volleyed. `tierDef().rate` is one man's cycle time, so
// firing all 26 stand-ins on the same tick gives a burst every 0.42 s and dead
// air between — the exact opposite of the reference, where the front of the
// squad is a continuous sheet of light. Instead the shooters are treated as one
// stream running at `k / interval` rounds per second and taken in turn. Same
// total damage, same total bolts, but the muzzle work never goes out.
function fireStream(dt, interval) {
  const pos = shooterPositions();
  const k = Math.min(GUN.fireCap, (pos.length / 3) | 0);
  if (k <= 0) return;

  const rate = k / interval;                  // rounds per second, whole squad
  shotAcc += rate * dt;
  const want = Math.floor(shotAcc);
  if (want <= 0) return;
  shotAcc -= want;

  // Per-frame cap. A 50 ms frame at gunship rate is 30 rounds; drawing them all
  // in one tick would stack 30 bolts on top of each other for no visible gain.
  const shots = Math.min(want, 12);
  const tier = tierDef();
  // Damage per bolt keeps the SQUAD's dps exact even when the cap drops bolts.
  const per = (squadDps() / rate) * (want / shots);
  const pierceN = tier.kind === 'foot' ? 0 : 1;
  const len = tier.kind === 'foot' ? 3.2 : 4.0;
  const flashScale = tier.kind === 'foot' ? 1 : 1.4;

  for (let s = 0; s < shots; s++) {
    const i = shotIdx++ % k;
    const x = pos[i * 3], y = pos[i * 3 + 1] || 1.28, z = pos[i * 3 + 2];
    let dx = rand(-GUN.spread, GUN.spread);
    let dy = rand(-0.004, 0.014);
    const inv = 1 / Math.hypot(dx, dy, 1);
    dx *= inv; dy *= inv;
    spawn(x, y, z + 0.35, dx, dy, inv, GUN.bulletSpeed, per, 0, pierceN, len);
    muzzleFlash(x, y + 0.06, z + 0.5, flashScale);
  }

  sfx('shot', { tier: state.tier });
  addShake(0.015 + (tier.kind === 'foot' ? 0 : 0.02));

  // The bloom. Individual flashes are 0.1 s and scattered across eleven metres;
  // what makes the reference read as a firefight is the soft white mass sitting
  // ON the front rank the whole time. That is this: one big cheap additive
  // glow, refreshed six times a second, centred on the shooters.
  bloomT -= dt;
  if (bloomT <= 0) {
    bloomT = 0.055;
    // Two glows across the front, not one in the middle. A 200-man blob is nine
    // metres wide; a single bloom over its centre leaves the flanks dark and the
    // squad reads as one man with a torch.
    let lo = 1e9, hi = -1e9, cz = -1e9;
    for (let i = 0; i < k; i++) {
      const sx = pos[i * 3];
      if (sx < lo) lo = sx;
      if (sx > hi) hi = sx;
      if (pos[i * 3 + 2] > cz) cz = pos[i * 3 + 2];
    }
    const rad = 0.9 + Math.min(1.1, k / 18);
    battleGlow(lo + (hi - lo) * 0.3, 1.15, cz + 0.35, rad, flashScale);
    if (hi - lo > 3.5) battleGlow(lo + (hi - lo) * 0.72, 1.15, cz + 0.2, rad, flashScale);
  }
}

// Public: a one-off burst from an arbitrary point. `dir` may be a number (the z
// sign) or a {x,y,z}. enemies.js drives its return fire through the bus event
// below rather than importing this, so the module graph stays a DAG.
export function fireBurst(x, y, z, dir, opts) {
  if (!batch) return null;
  let dx = 0, dy = 0, dz = 1;
  if (typeof dir === 'number') dz = dir < 0 ? -1 : 1;
  else if (dir) { dx = dir.x || 0; dy = dir.y || 0; dz = dir.z || 0; }
  const l = Math.hypot(dx, dy, dz) || 1;
  dx /= l; dy /= l; dz /= l;

  const o = opts || EMPTY;
  const count = Math.max(1, o.n || 1);
  const spread = o.spread ?? GUN.spread;
  const speed = o.speed ?? GUN.bulletSpeed;
  const sd = o.side ?? (dz < 0 ? 1 : 0);
  const damage = (o.dmg ?? 1) / count;
  for (let i = 0; i < count; i++) {
    const jx = dx + rand(-spread, spread);
    const jy = dy + rand(-spread * 0.4, spread * 0.4);
    const jz = dz;
    const il = 1 / Math.hypot(jx, jy, jz);
    spawn(x, y, z, jx * il, jy * il, jz * il, speed, damage, sd, o.pierce || 0, o.len);
  }
  if (o.flash !== false) muzzleFlash(x, y, z + (dz < 0 ? -0.4 : 0.4), o.flashScale || 1);
  return count;
}
const EMPTY = {};

// --------------------------------------------------------------------------
// Hit resolution
// --------------------------------------------------------------------------

const _gateHit = { gate: null, damage: 0 };     // reused: gates take 60 hits/sec

function callTest(fn, x, y, z, r) {
  if (typeof fn !== 'function') return null;
  try { return fn(x, y, z, r); } catch (e) { return null; }
}

// Apply damage to whatever a hit test handed back, without knowing which system
// owns it. gates.js and barriers.js both hang `hit/damage/applyDamage` on the
// object they return and emit their own `gate:hit` / `barrier:broken` from
// inside it, so calling the method is the ONLY correct route — emitting
// `gate:hit` here as well would fire every listener twice. The bus emit is kept
// as a last resort for a stub that returns a bare object.
function applyDamage(target, kind, damage, x, y, z) {
  if (typeof target === 'function') { target(damage); return; }
  if (typeof target.apply === 'function') { target.apply(damage, x, y, z); return; }
  if (typeof target.hit === 'function') { target.hit(damage, x, y, z); return; }
  if (typeof target.damage === 'function') { target.damage(damage, x, y, z); return; }
  if (typeof target.applyDamage === 'function') { target.applyDamage(damage, x, y, z); return; }
  if (typeof target.hp === 'number') { target.hp -= damage; return; }
  if (kind === 'gate') {
    _gateHit.gate = target;
    _gateHit.damage = damage;
    emit('gate:hit', _gateHit);
  }
}

// --------------------------------------------------------------------------
// Frame
// --------------------------------------------------------------------------

export function updateCombat(dt) {
  if (!batch) return;

  // --- fire -------------------------------------------------------------
  if (running && state.running && state.troops > 0) {
    const interval = Math.max(0.05, tierDef().rate / Math.max(0.2, state.rateMul));
    fireStream(dt, interval);
  }

  // --- integrate + resolve ---------------------------------------------
  const zBack = state.z - 14;                 // behind the squad, nothing to hit
  const zFar = state.z + GUN.range + 12;
  // 78 m/s is 1.3 m at 60 fps and 3.9 m on a 50 ms frame; enemy ranks are 0.6 m
  // apart, so the step is subdivided until it cannot skip one.
  const SUB = clamp(Math.ceil((GUN.bulletSpeed * dt) / 0.7), 2, 6);
  const sdt = dt / SUB;

  for (let i = 0; i < n; i++) {
    life[i] -= dt;
    let dead = life[i] <= 0;

    for (let s = 0; s < SUB && !dead; s++) {
      px[i] += vx[i] * sdt;
      py[i] += vy[i] * sdt;
      pz[i] += vz[i] * sdt;

      if (pz[i] > zFar || pz[i] < zBack || Math.abs(px[i]) > ROAD.halfW + 6 || py[i] < 0.05) { dead = true; break; }

      const x = px[i], y = py[i], z = pz[i];

      if (side[i] === 0) {
        // Ours. Order is fixed: bodies first, then signage, then walls — a
        // gate standing behind an enemy block must not eat the shot.
        let t = callTest(enemyHitTest, x, y, z, 0.55);
        if (t) {
          applyDamage(t, 'enemy', dmg[i], x, y, z);
          // The mass of light on the enemy's leading edge is the reference's
          // signature. It is not one big effect — it is sixty of these a second
          // stacked additively where the fire is landing.
          impactFlash(x, y, z, 1.15, PAL.spark);
          sparkBurst(x, y, z, 0, 0.3, -0.6, 3, PAL.spark, 8);
          // A piercing round must be pushed clear of the body it just went
          // through, or next frame it is still inside him and hits again.
          if (pierce[i] > 0) { pierce[i]--; px[i] += vx[i] * 0.012; pz[i] += vz[i] * 0.012; }
          else dead = true;
          break;
        }
        t = callTest(gateHitTest, x, y, z, 0.5);
        if (t) {
          applyDamage(t, 'gate', dmg[i], x, y, z);
          impactFlash(x, y, z, 0.6, PAL.signYellow);
          sparkBurst(x, y, z, 0, 0.35, -0.6, 2, PAL.spark, 6);
          dead = true; break;
        }
        t = callTest(barrierHitTest, x, y, z, 0.5);
        if (t) {
          applyDamage(t, 'barrier', dmg[i], x, y, z);
          impactFlash(x, y, z, 0.7, PAL.wood);
          sparkBurst(x, y, z, 0, 0.3, -0.6, 3, 0xffb060, 7);
          hitPuff(x, y, z, PAL.woodDark, 0.5);
          dead = true; break;
        }
      } else {
        // Theirs. The squad is a disc: one radius test, no per-man check —
        // 400 men would be 400 tests per enemy bullet for a result the player
        // could not possibly distinguish.
        const r = RUN.formSpacing * Math.sqrt(Math.max(1, state.troops)) + 0.9;
        const ddx = x - state.x, ddz = z - state.z;
        if (ddz < 1.2 && ddx * ddx + ddz * ddz < r * r) {
          // Raw men. `army.js:killTroops` applies the shield and the armour
          // upgrade itself — discounting here as well would apply both twice.
          lossAcc += dmg[i];
          impactFlash(x, 0.9, z, 0.55, 0xff7a4a);
          hitPuff(x, 0.7, z, 0x6b3a2a, 0.7);
          dead = true; break;
        }
      }
    }

    if (dead) { swap(i, --n); i--; }
  }

  // Fractional damage banks up so a stream of small hits still kills men at the
  // right rate instead of rounding to zero forever.
  if (lossAcc >= 1) {
    const men = Math.floor(lossAcc);
    lossAcc -= men;
    try { killTroops?.(men, 'enemy'); } catch (e) { /* army stub */ }
  }

  // --- push to the GPU --------------------------------------------------
  const b = batch;
  for (let i = 0; i < n; i++) {
    const o3 = i * 3;
    b.aPos[o3] = px[i]; b.aPos[o3 + 1] = py[i]; b.aPos[o3 + 2] = pz[i];
    // Direction is the velocity; the quad is centred, so pull the sprite back
    // half its length to put the arrow head on the bullet.
    const sp = Math.hypot(vx[i], vy[i], vz[i]) || 1;
    const dx = vx[i] / sp, dy = vy[i] / sp, dz = vz[i] / sp;
    const half = b.aScale[i * 2 + 1] * 0.5;
    b.aDir[o3] = dx; b.aDir[o3 + 1] = dy; b.aDir[o3 + 2] = dz;
    b.aPos[o3] -= dx * half; b.aPos[o3 + 1] -= dy * half; b.aPos[o3 + 2] -= dz * half;
  }
  b.geo.instanceCount = n;
  b.mesh.visible = n > 0;
  if (n > 0) {
    b.at.aPos.needsUpdate = true; b.at.aDir.needsUpdate = true;
    b.at.aScale.needsUpdate = true; b.at.aColor.needsUpdate = true;
    b.at.aAlpha.needsUpdate = true;
  }
}

// --------------------------------------------------------------------------
// Lifecycle
// --------------------------------------------------------------------------

// The `combat:fire` payload carries a POSITION (x,y,z) and a DIRECTION
// (dx,dy,dz); `fireBurst` takes a direction vector as `{x,y,z}`. This one
// reused object is the adapter between the two, and it exists because handing
// the payload straight to fireBurst makes every enemy round fly off toward the
// horizon along its own coordinates instead of at the squad.
const _dir = { x: 0, y: 0, z: -1 };

export function initCombat(ctx) {
  initColours();
  batch = makeBatch(ctx.scene);

  // enemies.js announces its return fire here instead of importing this module,
  // which would make combat↔enemies a cycle. The payload is a shared object;
  // listeners must read it synchronously and never retain it.
  on('combat:fire', (e) => {
    if (!e) return;
    _dir.x = e.dx || 0; _dir.y = e.dy || 0; _dir.z = e.dz ?? -1;
    fireBurst(e.x, e.y, e.z, _dir, {
      side: e.side ?? 1, dmg: e.dmg ?? 1, n: e.n || 1,
      speed: e.speed || GUN.bulletSpeed * 0.62,
      spread: e.spread ?? 0.05, len: e.len || 1.5,
      flash: e.flash !== false, flashScale: e.flashScale || 0.8,
    });
  });

  on('run:start', () => { running = true; });
  on('run:end', () => { running = false; });

  if (DEV_MODE) window.__hbCombat = { get bullets() { return n; }, fireBurst };
  return batch.mesh;
}

export function resetCombat(level) {
  n = 0;
  shotAcc = 0; shotIdx = 0; bloomT = 0;
  lossAcc = 0;
  running = true;
  if (batch) { batch.geo.instanceCount = 0; batch.mesh.visible = false; }
  return level;
}

export function disposeCombat() {
  if (!batch) return;
  batch.mesh.parent?.remove(batch.mesh);
  batch.geo.dispose(); batch.base.dispose(); batch.mat.dispose(); batch.tex.dispose();
  batch = null; n = 0;
}
