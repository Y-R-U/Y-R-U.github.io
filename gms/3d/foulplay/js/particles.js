// Sparks, smoke, glass and shockwaves — all hard-edged, to match the cars.
//
// Nothing in here is a soft sprite. Every particle is a flat billboard quad cut
// to a hard silhouette in the fragment shader (streak / spike / shard / chunk)
// and, for anything fast, stretched along its own velocity in view space — so a
// shower reads as directional streaks instead of a fog of glowing dots. Two
// pooled instanced meshes and a handful of faceted rings; no per-effect
// allocations once the game is running.
//
// Sizes are metres, not pixels. A `gl_PointSize` particle explodes to fill the
// screen as it approaches the lens, which is what the chase camera was doing to
// the exhaust; a world-sized quad just gets closer, and the near fade takes it
// out before it reaches the glass.

import * as THREE from 'three';
import { scene, quality } from './render.js';
import { DEV_MODE } from './config.js';
import { rand, clamp01 } from './utils.js';

const SPARK_MAX = 340;
const SMOKE_MAX = 190;

// Silhouettes. STREAK is the whole quad, SPIKE a wedge with its point trailing,
// SHARD a lopsided diamond, CHUNK a hexagon — shapes a modeller would have
// built, not blurs. The first two are aligned to velocity, the last two spin.
const STREAK = 0, SPIKE = 1, SHARD = 2, CHUNK = 3;

let sparks = null;
let smoke = null;
const rings = [];

const VERT = `
attribute vec3 iPos;
attribute vec3 iVel;
attribute vec3 iColor;
attribute vec4 iAttr;   // x width, y length, z alpha, w shape
attribute float iRot;
uniform float uPxH;
uniform float uMinPx;
uniform float uMaxPx;
varying vec2 vC;
varying vec3 vCol;
varying float vA;
varying float vShape;
varying float vSeed;

void main() {
  vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
  vec2 ax;
  if (iAttr.w < 1.5 && dot(iVel, iVel) > 1e-3) {
    vec3 vv = (modelViewMatrix * vec4(iVel, 0.0)).xyz;
    float ln = length(vv.xy);
    ax = ln > 1e-4 ? vv.xy / ln : vec2(0.0, 1.0);
  } else {
    ax = vec2(cos(iRot), sin(iRot));
  }
  vec2 pe = vec2(-ax.y, ax.x);

  float depth = -mv.z;
  float pxPerUnit = uPxH * projectionMatrix[1][1] * 0.5 / max(0.05, depth);

  // A shard thinner than a pixel stops being a shard and becomes a grey smear,
  // which is the look we are getting rid of. A shard the size of the screen is
  // worse: nothing owns more than uMaxPx of the frame however close it drifts.
  float mn = uMinPx / max(1.0, pxPerUnit);
  float mx = uMaxPx / max(1.0, pxPerUnit);
  float w = clamp(iAttr.x, mn, mx);
  float l = clamp(iAttr.y, mn, max(mx, w));

  mv.xy += ax * (position.y * l) + pe * (position.x * w);
  vC = position.xy;
  vCol = iColor;
  // Anything about to clip the near plane is on the lens, not in the world —
  // fade it out rather than let it pop.
  vA = iAttr.z * smoothstep(0.5, 2.2, depth);
  vShape = iAttr.w;
  vSeed = iRot;
  gl_Position = projectionMatrix * mv;
}`;

// Every silhouette in here used to be filled with ONE flat colour, which is how
// a smoke chunk ended up reading as "a pale hard-edged roughly hexagonal patch
// on the tarmac, lighter than the road, with no caster" — the same critique
// three reviews running. A flat-filled polygon IS geometry to the eye. It does
// not matter that it is a particle.
//
// So every shape now carries facets, cut in the fragment shader for free:
//
//   CHUNK  three wedges — a bright top, a mid flank, a dark underside — plus a
//          per-instance corner lopped off at a random angle, so no two puffs
//          share a silhouette and none of them is a regular octagon.
//   SHARD  a lit face and a shaded face split down the long axis, which is what
//          "give them faceted light and dark sides" means for a billboard.
//   SPIKE  the same split, weaker, so a spark still reads as hot metal.
//
// The values are the same three-tone the rest of the scene is lit with, so a
// puff sits in the frame's value structure instead of on top of it.
const FRAG = `
varying vec2 vC;
varying vec3 vCol;
varying float vA;
varying float vShape;
varying float vSeed;
void main() {
  vec2 c = vC;
  float shade = 1.0;
  if (vShape > 2.5) {
    if (max(abs(c.y), abs(c.x) * 0.866 + abs(c.y) * 0.5) > 0.5) discard;  // hex chunk
    // One corner off, angle and depth from the instance's own rotation.
    vec2 n = vec2(cos(vSeed * 1.7), sin(vSeed * 1.7));
    if (dot(c, n) > 0.20 + 0.16 * fract(vSeed * 0.37)) discard;
    shade = c.y > abs(c.x) * 0.62 ? 1.16 : (c.x > 0.0 ? 0.82 : 0.58);
  } else if (vShape > 1.5) {
    if (abs(c.x) * 1.35 + abs(c.y) > 0.5) discard;                        // shard
    shade = c.x > 0.0 ? 1.14 : 0.52;
  } else if (vShape > 0.5) {
    if (abs(c.x) > (0.62 + c.y) * 0.42) discard;                          // spike
    shade = c.x > 0.0 ? 1.12 : 0.58;
  }
  gl_FragColor = vec4(vCol * shade, vA);
}`;

function makePool(max, mat) {
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
    -0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0,
  ]), 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);

  const iPos = new Float32Array(max * 3);
  const iVel = new Float32Array(max * 3);
  const iCol = new Float32Array(max * 3);
  const iAttr = new Float32Array(max * 4);
  const iRot = new Float32Array(max);
  geo.setAttribute('iPos', new THREE.InstancedBufferAttribute(iPos, 3));
  geo.setAttribute('iVel', new THREE.InstancedBufferAttribute(iVel, 3));
  geo.setAttribute('iColor', new THREE.InstancedBufferAttribute(iCol, 3));
  geo.setAttribute('iAttr', new THREE.InstancedBufferAttribute(iAttr, 4));
  geo.setAttribute('iRot', new THREE.InstancedBufferAttribute(iRot, 1));
  geo.instanceCount = 0;

  const m = new THREE.Mesh(geo, mat);
  m.frustumCulled = false;
  m.renderOrder = 5;

  const p = [];
  for (let i = 0; i < max; i++) {
    p.push({
      alive: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
      life: 1, age: 0, w: 0.1, stretch: 0, maxLen: 1, grow: 0,
      r: 1, g: 1, b: 1, grav: 0, drag: 0.9,
      shape: STREAK, rot: 0, spin: 0, flick: 0, peak: 1,
    });
  }
  return { mesh: m, geo, iPos, iVel, iCol, iAttr, iRot, max, p, next: 0 };
}

export function initParticles() {
  if (sparks) return;
  const uni = (maxPx) => ({
    uPxH: { value: 720 }, uMinPx: { value: 1.7 }, uMaxPx: { value: maxPx },
  });
  // Smoke was allowed 150px of a 720px frame per instance. One puff could
  // therefore own a fifth of the screen height as a single filled polygon, which
  // is the "opaque octagon" and also the "black octagon floating in the sky".
  // A puff is now capped at 62px and has to be built out of several of them.
  // Flat, not additive. Additive sparks wash to white the moment they cross the
  // sky or a pale car, which is the one thing the art style cannot afford — the
  // cars are saturated flat colour and the sparks have to be too.
  const sparkMat = new THREE.ShaderMaterial({
    uniforms: uni(90), vertexShader: VERT, fragmentShader: FRAG,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  const smokeMat = new THREE.ShaderMaterial({
    uniforms: uni(62), vertexShader: VERT, fragmentShader: FRAG,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  sparks = makePool(SPARK_MAX, sparkMat);
  smoke = makePool(SMOKE_MAX, smokeMat);
  scene.add(sparks.mesh);
  scene.add(smoke.mesh);
  // "One wheel is a stream, four is a shower" is a promise about density, so a
  // headless run has to be able to COUNT it rather than squint at a screenshot.
  if (DEV_MODE) {
    window.__fx = () => ({ sparks: sparks.geo.instanceCount, smoke: smoke.geo.instanceCount });
  }
}

function emit(pool, x, y, z, vx, vy, vz, life, w, color, grav, drag, o) {
  if (!pool) return;
  const p = pool.p[pool.next];
  pool.next = (pool.next + 1) % pool.max;
  p.alive = true;
  p.x = x; p.y = y; p.z = z;
  p.vx = vx; p.vy = vy; p.vz = vz;
  p.life = life; p.age = 0;
  p.w = w;
  p.r = ((color >> 16) & 255) / 255;
  p.g = ((color >> 8) & 255) / 255;
  p.b = (color & 255) / 255;
  p.grav = grav; p.drag = drag;
  p.stretch = (o && o.stretch) || 0;
  p.maxLen = (o && o.maxLen) || 1;
  p.grow = (o && o.grow) || 0;
  p.shape = (o && o.shape) || STREAK;
  p.rot = o && o.rot != null ? o.rot : rand(0, 6.283);
  p.spin = (o && o.spin) || 0;
  p.flick = (o && o.flick) || 0;
  p.peak = o && o.peak != null ? o.peak : 1;
}

const budget = () => quality.particles || 1;

// Per-particle value spread, applied to the packed hex before it is unpacked.
// Two shards of the same colour at the same angle are one shard drawn twice;
// two shards forty levels apart are debris.
function shade(hex, k) {
  const r = Math.min(255, ((hex >> 16) & 255) * k) | 0;
  const g = Math.min(255, ((hex >> 8) & 255) * k) | 0;
  const b = Math.min(255, (hex & 255) * k) | 0;
  return (r << 16) | (g << 8) | b;
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// One shared ceiling on CONTINUOUS spark sources for the whole field — rims
// grinding, panels dragging, debris skidding down the road. A token bucket in
// REAL time, not sim time, because it exists to protect the GPU.
//
// It lives here rather than in car.js because loose debris needs it too, and
// debris.js cannot import car.js without a cycle. Everything that sparks *every
// frame while a condition holds* must go through this; one-off bursts (an
// impact, a panel tearing off) bypass it, because those are the ones the player
// is actually meant to notice and there are never many at once.
let sparkPool = 0;
let sparkLast = 0;
export function sparkAllow(want) {
  if (want <= 0) return 0;
  const t = performance.now();
  const cap = SPARK_BUDGET * (quality.particles || 1);
  if (!sparkLast) { sparkLast = t; sparkPool = cap; }
  const el = Math.min(0.25, (t - sparkLast) / 1000);
  sparkLast = t;
  sparkPool = Math.min(cap, sparkPool + cap * el);
  const give = Math.min(want, Math.floor(sparkPool));
  sparkPool -= give;
  return give;
}
// Bursts per second across the whole field. Raised from 170 when loose panels
// and skidding debris became spark sources of their own: at the old ceiling a
// couple of cars on their rims ate the entire budget and every flapping panel
// in the race went dry, which is exactly the "I haven't noticed any sparks"
// report. One car on its floorpan wants ~45/s.
const SPARK_BUDGET = 420;

// Emitters
// ---------------------------------------------------------------------------
// Sparks are the workhorse: rim grinding, panel strikes, rail scrapes. Fast,
// short-lived and thin, so a stream of them draws lines away from the impact
// instead of filling the road with dots.
// A critic looked at the old version of this and said the shards "read as UI
// arrow icons that leaked into the 3D scene", which is exactly right: they came
// out of a narrow speed band, a narrow size band, a four-colour palette and a
// +-0.5 direction cone, so a burst was a dozen copies of one glyph at one angle.
// Everything below is spread — length, width, hue, value, and above all ANGLE.
export function sparkBurst(pos, dir, count = 12, color = 0xffcc55, speed = 12) {
  const n = Math.max(2, Math.round(count * budget() * 0.85));
  for (let i = 0; i < n; i++) {
    const sp = rand(speed * 0.55, speed * 1.7);
    const r = Math.random();
    const dim = 0.62 + Math.random() * 0.5;   // value spread inside one burst
    emit(sparks, pos.x, pos.y, pos.z,
      (dir.x + rand(-0.9, 0.9)) * sp,
      // Sparks off a rim skitter along the road; they do not fountain. Keep the
      // vertical component small or the shower arcs over the car.
      (dir.y * 0.7 + rand(0.0, 0.55)) * sp,
      (dir.z + rand(-0.9, 0.9)) * sp,
      rand(0.13, 0.42), rand(0.018, 0.058),
      shade(r < 0.1 ? 0xfff4d0 : r < 0.5 ? 0xff5a00 : r < 0.85 ? 0xff9500 : color, dim), -38, 0.94,
      { stretch: rand(0.012, 0.030), maxLen: rand(0.22, 0.58), shape: SPIKE, peak: rand(0.7, 1) });
  }
  // The odd proper chip of metal, thrown clear of the streaks.
  if (Math.random() < 0.5 * budget()) {
    emit(sparks, pos.x, pos.y, pos.z,
      (dir.x + rand(-0.8, 0.8)) * speed * 0.8,
      (dir.y + rand(0.4, 1.3)) * speed * 0.8,
      (dir.z + rand(-0.8, 0.8)) * speed * 0.8,
      rand(0.3, 0.55), rand(0.05, 0.13), shade(0xffa011, rand(0.6, 1.1)), -24, 0.96,
      { shape: SHARD, spin: rand(-14, 14), peak: rand(0.7, 0.95) });
  }
}

export function explode(pos, count = 22, color = 0xff8a2a) {
  const n = Math.max(4, Math.round(count * budget() * 0.75));
  for (let i = 0; i < n; i++) {
    const sp = rand(9, 26);
    const d = new THREE.Vector3(rand(-1, 1), rand(0.15, 1.3), rand(-1, 1)).normalize();
    emit(sparks, pos.x, pos.y, pos.z, d.x * sp, d.y * sp, d.z * sp,
      rand(0.22, 0.5), rand(0.1, 0.18),
      Math.random() < 0.35 ? 0xffd24a : color, -18, 0.94,
      { stretch: 0.045, maxLen: 1.5, shape: SPIKE, peak: 0.95 });
  }
  // Fireball core: several small facets, not one big one. At rand(1.0, 2.1)
  // metres plus 1.6 of growth a single chunk was a two-metre filled polygon.
  const core = Math.max(3, Math.round(n * 0.55));
  for (let i = 0; i < core; i++) {
    emit(sparks, pos.x + rand(-0.5, 0.5), pos.y + rand(-0.3, 0.5), pos.z + rand(-0.5, 0.5),
      rand(-1, 1) * 5, rand(0.2, 1.1) * 5, rand(-1, 1) * 5,
      rand(0.16, 0.3), rand(0.5, 1.05), shade(color, rand(0.75, 1.15)), -4, 0.9,
      { shape: CHUNK, grow: 0.8, spin: rand(-3, 3), peak: rand(0.7, 0.92) });
  }
  for (let i = 0; i < n * 0.55; i++) {
    emit(smoke, pos.x + rand(-0.6, 0.6), pos.y + rand(-0.3, 0.6), pos.z + rand(-0.6, 0.6),
      rand(-1, 1) * 5, rand(0.4, 1.6) * 5, rand(-1, 1) * 5,
      rand(0.9, 1.9), rand(0.55, 1.15), shade(0x4c5158, rand(0.7, 1.25)), 1.5, 0.94,
      { shape: CHUNK, grow: 1.1, spin: rand(-2, 2), peak: rand(0.3, 0.46) });
  }
  ring(pos, color);
}

// SMOKE IS THE ONE THING IN THIS FILE THAT MUST NOT READ AS GEOMETRY, and the
// old numbers guaranteed it would. A single chunk at peak alpha 0.66, grown to
// two and a half metres, filled with one flat 0x9aa3ad, is a light-grey polygon
// sitting on the road at a higher value than the road — which is a slab, not a
// cloud, and three separate reviews said so.
//
// The rule now: a puff is ALWAYS several small pieces, never one big one; peak
// alpha stays under a third so whatever is behind it still shows through the
// silhouette; and the colour is spread per piece so overlapping pieces build
// tone instead of forming one even plate. The faceting in FRAG does the rest.
export function smokePuff(pos, count = 5, color = 0x9aa3ad, size = 2.0, up = 2.5) {
  const n = Math.max(2, Math.round(count * budget() * 1.5));
  for (let i = 0; i < n; i++) {
    emit(smoke, pos.x + rand(-0.6, 0.6), pos.y + rand(-0.15, 0.35), pos.z + rand(-0.6, 0.6),
      rand(-1.4, 1.4), rand(0.4, 1) * up, rand(-1.4, 1.4),
      rand(0.5, 1.15), rand(size * 0.16, size * 0.3), shade(color, rand(0.72, 1.12)), 1.2, 0.93,
      { shape: CHUNK, grow: size * 0.28, spin: rand(-1.8, 1.8), peak: rand(0.2, 0.32) });
  }
}

export function tyreSmoke(pos, amount) {
  if (Math.random() > amount * budget() * 0.8) return;
  // Two small pieces where there used to be one large one, and knocked well
  // down off 0xc3c8ce: tyre smoke sitting a hundred levels over the tarmac is
  // the pale patch everybody kept finding and looking for a caster under.
  for (let i = 0; i < 2; i++) {
    emit(smoke, pos.x + rand(-0.4, 0.4), pos.y + 0.2 + rand(0, 0.3), pos.z + rand(-0.4, 0.4),
      rand(-1, 1), rand(0.6, 2.0), rand(-1, 1),
      rand(0.35, 0.75), rand(0.18, 0.38), shade(0x9ba1a8, rand(0.72, 1.1)), 1.0, 0.9,
      { shape: CHUNK, grow: 0.42, spin: rand(-1.4, 1.4), peak: rand(0.13, 0.23) });
  }
}

export function dust(pos, amount, color = 0xbfa87a) {
  if (Math.random() > amount * budget() * 0.8) return;
  for (let i = 0; i < 2; i++) {
    emit(smoke, pos.x + rand(-0.7, 0.7), pos.y + 0.1 + rand(0, 0.3), pos.z + rand(-0.7, 0.7),
      rand(-2, 2), rand(0.5, 2.4), rand(-2, 2),
      rand(0.45, 0.95), rand(0.22, 0.46), shade(color, rand(0.7, 1.12)), 0.8, 0.9,
      { shape: CHUNK, grow: 0.5, spin: rand(-1.6, 1.6), peak: rand(0.16, 0.27) });
  }
}

export function boostFlame(pos, dir, hot = 1) {
  const n = Math.max(1, Math.round(3 * budget()));
  for (let i = 0; i < n; i++) {
    emit(sparks, pos.x, pos.y, pos.z,
      dir.x * rand(6, 15) + rand(-1.2, 1.2),
      dir.y * rand(6, 15) + rand(-0.5, 1.0),
      dir.z * rand(6, 15) + rand(-1.2, 1.2),
      rand(0.12, 0.26), rand(0.1, 0.2) * hot,
      Math.random() < 0.5 ? 0x33ccff : 0xffc02a, 0, 0.88,
      { stretch: 0.035, maxLen: 1.1, shape: SPIKE, peak: 0.9 });
  }
}

// A fire in the engine bay. Small, and it has to STAY small — a big flame on a
// car doing 200km/h reads as an explosion, and this one has to burn for laps.
// Three pieces per call: a hot core that barely moves, a lick of flame carried
// back over the screen by the airflow, and the soot it makes. `k` is 0..1 of
// how far gone the car is, and it only widens the flame, never brightens it.
export function engineFire(pos, back, k = 1) {
  const n = Math.max(1, Math.round(2 * budget()));
  for (let i = 0; i < n; i++) {
    const sp = rand(1.4, 4.2) * (0.7 + k * 0.6);
    emit(sparks, pos.x + rand(-0.16, 0.16), pos.y, pos.z + rand(-0.2, 0.2),
      back.x * sp + rand(-1.1, 1.1), rand(2.2, 5.0), back.z * sp + rand(-1.1, 1.1),
      rand(0.16, 0.34), rand(0.1, 0.17 + k * 0.09),
      shade(Math.random() < 0.35 ? 0xfff0b0 : Math.random() < 0.6 ? 0xff8c14 : 0xff4a08, rand(0.8, 1.15)),
      -3, 0.9, { shape: CHUNK, grow: 0.5, spin: rand(-4, 4), peak: rand(0.55, 0.85) });
  }
  // The plume off the top of it. Dark, thin, and it wants to be READ as smoke
  // from a distance rather than fill the frame.
  if (Math.random() < 0.55 * budget()) {
    emit(smoke, pos.x + rand(-0.2, 0.2), pos.y + 0.28, pos.z + rand(-0.2, 0.2),
      back.x * rand(2, 6) + rand(-0.8, 0.8), rand(2.2, 4.6), back.z * rand(2, 6) + rand(-0.8, 0.8),
      rand(0.8, 1.5), rand(0.22, 0.42), shade(0x33302c, rand(0.7, 1.3)), 1.0, 0.94,
      { shape: CHUNK, grow: 0.75, spin: rand(-1.6, 1.6), peak: rand(0.22, 0.36) });
  }
}

// Black smoke out of the back of a car whose engine is on its way out. Blown
// backwards along the car's own axis and left hanging, so from behind it is a
// trail you follow rather than a puff you drive past.
export function sootPlume(pos, back, k = 1) {
  const n = Math.max(1, Math.round((1 + k) * budget()));
  for (let i = 0; i < n; i++) {
    emit(smoke, pos.x + rand(-0.3, 0.3), pos.y + rand(-0.1, 0.25), pos.z + rand(-0.3, 0.3),
      back.x * rand(3, 9) + rand(-1.2, 1.2), rand(0.9, 2.6), back.z * rand(3, 9) + rand(-1.2, 1.2),
      rand(0.7, 1.6), rand(0.2, 0.36 + k * 0.18),
      shade(0x2a2724, rand(0.65, 1.35)), 0.9, 0.93,
      { shape: CHUNK, grow: 0.6 + k * 0.5, spin: rand(-1.5, 1.5), peak: rand(0.18, 0.3 + k * 0.12) });
  }
}

// Glass does not puff. It bursts into shards that catch the light and wink out.
export function glassBurst(pos) {
  const n = Math.max(4, Math.round(14 * budget()));
  for (let i = 0; i < n; i++) {
    const d = new THREE.Vector3(rand(-1, 1), rand(0.15, 1.1), rand(-1, 1)).normalize();
    const sp = rand(5, 12);
    emit(sparks, pos.x, pos.y, pos.z, d.x * sp, d.y * sp, d.z * sp,
      rand(0.5, 1.0), rand(0.05, 0.15),
      shade(Math.random() < 0.4 ? 0xffffff : 0xa8e4ff, rand(0.6, 1.05)), -22, 0.97,
      { shape: SHARD, spin: rand(-20, 20), flick: rand(26, 44), peak: rand(0.75, 1) });
  }
}

// Expanding ground ring — shockwaves, big impacts, boost pads. Deliberately
// low-segment so the edge reads as a polygon, like everything else on screen.
export function ring(pos, color = 0xffffff, maxR = 9, life = 0.5, up = null) {
  const geo = new THREE.RingGeometry(0.68, 1.0, 9);
  const mat = new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false,
  });
  const m = new THREE.Mesh(geo, mat);
  m.position.copy(pos);
  if (up) m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), up);
  else m.rotation.x = -Math.PI / 2;
  m.rotation.z = rand(0, 0.7);
  m.renderOrder = 4;
  scene.add(m);
  rings.push({ m, age: 0, life, maxR });
}

// ---------------------------------------------------------------------------
// Alpha is stepped, never a smooth ramp: a particle that dissolves gradually is
// the soft look arriving by another route.
function stepAlpha(t, peak) {
  const k = 1 - t;
  return peak * (k > 0.62 ? 1 : k > 0.34 ? 0.72 : k > 0.14 ? 0.42 : 0.18);
}

export function updateParticles(dt) {
  const pxH = window.innerHeight || 720;
  for (const pool of [sparks, smoke]) {
    if (!pool) continue;
    pool.mesh.material.uniforms.uPxH.value = pxH;
    let n = 0;
    const { p, iPos, iVel, iCol, iAttr, iRot } = pool;
    for (let i = 0; i < pool.max; i++) {
      const q = p[i];
      if (!q.alive) continue;
      q.age += dt;
      if (q.age >= q.life) { q.alive = false; continue; }
      const d = Math.pow(q.drag, dt * 60);
      q.vx *= d; q.vz *= d;
      q.vy = q.vy * d + q.grav * dt;
      q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      if (q.spin) q.rot += q.spin * dt;
      const t = q.age / q.life;

      const o3 = n * 3, o4 = n * 4;
      iPos[o3] = q.x; iPos[o3 + 1] = q.y; iPos[o3 + 2] = q.z;
      iVel[o3] = q.vx; iVel[o3 + 1] = q.vy; iVel[o3 + 2] = q.vz;
      iCol[o3] = q.r; iCol[o3 + 1] = q.g; iCol[o3 + 2] = q.b;

      const w = q.w + q.grow * t;
      let len = w;
      if (q.stretch) {
        const sp = Math.sqrt(q.vx * q.vx + q.vy * q.vy + q.vz * q.vz);
        len = Math.min(w + sp * q.stretch, q.maxLen);
      }
      let a = stepAlpha(t, q.peak);
      // Glass glitters: a hard on/off wink, not a fade.
      if (q.flick) a *= Math.sin(q.age * q.flick + q.rot) > -0.15 ? 1 : 0.15;
      iAttr[o4] = w; iAttr[o4 + 1] = len; iAttr[o4 + 2] = a; iAttr[o4 + 3] = q.shape;
      iRot[n] = q.rot;
      n++;
    }
    pool.geo.instanceCount = n;
    pool.geo.attributes.iPos.needsUpdate = true;
    pool.geo.attributes.iVel.needsUpdate = true;
    pool.geo.attributes.iColor.needsUpdate = true;
    pool.geo.attributes.iAttr.needsUpdate = true;
    pool.geo.attributes.iRot.needsUpdate = true;
  }

  for (let i = rings.length - 1; i >= 0; i--) {
    const r = rings[i];
    r.age += dt;
    const t = clamp01(r.age / r.life);
    const s = 0.4 + t * r.maxR;
    r.m.scale.set(s, s, s);
    r.m.material.opacity = 0.9 * (t < 0.5 ? 1 : t < 0.8 ? 0.6 : 0.25);
    if (t >= 1) {
      scene.remove(r.m);
      r.m.geometry.dispose();
      r.m.material.dispose();
      rings.splice(i, 1);
    }
  }
}

export function clearParticles() {
  for (const pool of [sparks, smoke]) {
    if (!pool) continue;
    for (const q of pool.p) q.alive = false;
    pool.geo.instanceCount = 0;
  }
  for (const r of rings) {
    scene.remove(r.m);
    r.m.geometry.dispose();
    r.m.material.dispose();
  }
  rings.length = 0;
}
