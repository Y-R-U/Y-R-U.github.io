// The round in flight: body, tracer, vapour trail, arc solver — C6 owns this file.
//
// One class serves two jobs, and they are the same object: the shell the chase camera follows, and
// the stretched glowing body the match cut hands from the plotting table to the sky (BUILD_PLAN
// §7.3). Splitting them would mean two silhouettes that have to match, which is the one thing that
// trick cannot survive.
//
// Everything visual here rides C4's shared card fields, so a round in flight costs ZERO extra draw
// calls beyond its own 200-triangle body.

import * as THREE from 'three';
import { hotField, smokeField, pumpCards, seaSource, dropSeaSource, warmSource, dropWarmSource, seaHeight, sunDir }
  from './vfx/field.js';
import { rng } from './textures/noise.js';

// Apex height for a given range, in metres. Kept here rather than in the vfx emitter because the
// camera needs it to frame the arc before the shell exists.
export const arcHeight = (from, to) => from.distanceTo(to) * 0.16;

// A pinned phase makes a still reproducible — same reason as C3's setMuzzlePhase and C4's
// setImpactPhase. u ∈ [0,1] along the arc, applied to every live round.
let pinned = null;
export function setShellPhase(u) { pinned = u; }
export function shellPhase() { return pinned; }

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _p = new THREE.Vector3();
const UPY = new THREE.Vector3(0, 1, 0);
const HOT = new THREE.Color();
const COOL = new THREE.Color();

// Parabolic arc with the apex scaled by range, so a long shot arcs high and a short one stays flat.
export function ballistic(from, to, { arc = null } = {}) {
  const a = from.clone(), b = to.clone();
  const range = a.distanceTo(b);
  const apex = arc ?? range * 0.16;
  const at = (u, out = new THREE.Vector3()) => out.set(
    a.x + (b.x - a.x) * u,
    a.y + (b.y - a.y) * u + apex * 4 * u * (1 - u),
    a.z + (b.z - a.z) * u,
  );
  // analytic tangent — a finite difference goes to zero length at the ends and the shell snaps flat
  const dir = (u, out = new THREE.Vector3()) => out.set(
    b.x - a.x,
    (b.y - a.y) + apex * 4 * (1 - 2 * u),
    b.z - a.z,
  ).normalize();
  return { at, dir, range, apex, from: a, to: b };
}

// ── the round ───────────────────────────────────────────────────────────────────────────────

// One lathe, vertex-coloured: dark steel body, a copper driving band, a hot base. A second
// material for the band would be a second draw call for four triangles' worth of read.
// t = 0 is the BASE and t = 1 the nose, because poseAt maps local +Y to the flight direction —
// build it the other way round and the round flies backwards, which is exactly what it did.
function bodyGeometry(len, cal) {
  const pts = [new THREE.Vector2(0.0001, 0), new THREE.Vector2(cal * 0.62, 0)];
  const N = 16;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const y = t * len;
    let r = cal;
    if (t < 0.04) r = cal * (0.86 + t / 0.04 * 0.14);
    else if (t > 0.58) {
      // secant ogive: r falls to a point over the forward 42%
      const s = (t - 0.58) / 0.42;
      r = cal * Math.sqrt(Math.max(0, 1 - s * s * s * 0.995));
    }
    pts.push(new THREE.Vector2(r, y));
  }
  pts.push(new THREE.Vector2(0.0001, len * 1.005));
  const g = new THREE.LatheGeometry(pts, 16);
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / len;
    const band = Math.max(0, 1 - Math.abs(y - 0.13) / 0.045);
    const base = Math.max(0, 1 - y / 0.05);
    col[i * 3] = 0.30 + band * 0.30 + base * 0.85;
    col[i * 3 + 1] = 0.30 + band * 0.17 + base * 0.36;
    col[i * 3 + 2] = 0.31 + band * 0.05 + base * 0.12;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.translate(0, -len * 0.5, 0);
  g.computeVertexNormals();
  return g;
}

let bodyGeo = null;
let bodyMat = null;

export class Round {
  // ctx is the frozen vfx emitter context (root, lights, app, size()).
  constructor(ctx, { from, to, ms = 2400, size = 1, seed = 4001, trail = 1, light = false, sea = true, arc = null }) {
    const cfg = ctx.size(size);
    this.ctx = ctx;
    this.cfg = cfg;
    this.ms = ms;
    this.size = size;
    this.arc = ballistic(from, to, { arc });
    this.u = 0;
    this.stretch = 1;
    this.elapsed = 0;
    this.dead = false;

    // length / diameter = 4.5, which is what a naval shell actually is. Pass 1 ran 9:1 and the
    // round read as a sausage as long as the ship it was aimed at.
    const cal = this.cal = 0.150 * cfg.scale;
    this.len = 1.35 * cfg.scale;
    if (!bodyGeo) bodyGeo = bodyGeometry(1, 0.168);   // unit body, scaled per round
    if (!bodyMat) bodyMat = new THREE.MeshStandardMaterial({
      vertexColors: true, metalness: 0.38, roughness: 0.40, envMapIntensity: 1.0,
      emissive: 0x241004, emissiveIntensity: 1,
    });
    this.mesh = new THREE.Mesh(bodyGeo, bodyMat);
    this.mesh.frustumCulled = false;
    this.mesh.scale.set(cal / 0.168, this.len, cal / 0.168);
    ctx.root.add(this.mesh);

    // glow + trail live on C4's shared fields: no new draw call, no new texture
    this.hot = hotField(ctx.root);
    this.smoke = smokeField(ctx.root);
    this.glow = [];
    for (let i = 0; i < 5; i++) { const s = this.hot.take(); if (s) this.glow.push(s); }

    this.trailN = Math.round(24 * cfg.cards * trail);
    this.trail = [];
    for (let i = 0; i < this.trailN; i++) { const s = this.smoke.take(); if (!s) break; this.trail.push(s); }
    this.trailN = this.trail.length;

    // seeded jitter per trail card, so the column is turbulent rather than a string of beads
    const r = rng(seed);
    this.jit = Array.from({ length: this.trailN }, () => [
      (r() - 0.5) * 2, (r() - 0.5) * 2, (r() - 0.5) * 2, 0.6 + r() * 0.9, r() * 6.283,
    ]);

    // A tracer that does not light what is near it is the finding every critic on this project has
    // repeated. The water gets a sea source (the only way the ocean shader can be lit), the rain
    // and the smoke get a warm source, and the trail cards near the head are tinted by hand.
    this.seaSrc = sea ? seaSource() : null;
    if (this.seaSrc) { this.seaSrc.colour = '#ff9c3e'; this.seaSrc.radius = 38; }
    // Small on purpose. `rain()` lights a streak by the ANGLE it subtends from the camera against
    // this radius, so a 78 m warm source tinted every drop in frame pink — measured as ΔR−ΔB
    // +14.8 over the sky.
    this.warm = warmSource(11 * cfg.scale);
    this.light = light ? ctx.lights.acquire() : null;
    if (this.light) { this.light.color.set(0xffb267); this.light.distance = 90 * cfg.scale; }

    this.poseAt(0);
  }

  head(out = new THREE.Vector3()) { return this.arc.at(this.u, out); }

  // Pure function of u — this is what makes a chase shot poseable and a match cut measurable.
  poseAt(u, stretch = this.stretch, fat = this.fat ?? 1) {
    this.u = THREE.MathUtils.clamp(u, 0, 1);
    this.stretch = stretch;
    this.fat = fat;
    const cam = this.ctx.app.camera;
    const cfg = this.cfg;
    const R = cfg.scale;

    const p = this.arc.at(this.u, _a);
    const d = this.arc.dir(this.u, _b);

    this.mesh.position.copy(p);
    this.mesh.quaternion.setFromUnitVectors(UPY, d);
    this.mesh.scale.set(this.cal / 0.168 * fat, this.len * stretch, this.cal / 0.168 * fat);

    // screen-space angle of travel, so the streak card lies along the flight path
    const ang = this.screenAngle(p, d, cam);

    // The tracer is ONE streak plus a base blob, not a row of blobs: five equal cards spaced along
    // the axis is the countable-sprite finding drawn in fire.
    const back = _c.copy(d).multiplyScalar(-1);
    const G = [
      [0.30, 0.52, 0.52, 1.00],     // offset·len, sx·R, sy·R, brightness
      [1.30, 0.30, 3.20, 0.52],
      [3.40, 0.62, 8.00, 0.17],
      [0.62, 0.34, 1.10, 0.72],
      [7.20, 0.95, 14.0, 0.062],
    ];
    for (let i = 0; i < this.glow.length; i++) {
      const s = this.glow[i];
      const [off, sx, sy, b] = G[i];
      s.pos.copy(p).addScaledVector(back, this.len * stretch * off);
      s.sx = R * sx * (i ? Math.sqrt(fat) : fat);
      // NOT scaled by `stretch`. The stretch is a stylistic elongation of the BODY for the match
      // cut; the tracer plume is a physical length, and multiplying it by 3.4 put an 80 m flare on
      // a camera seven metres away.
      s.sy = R * sy;
      s.rot = ang;
      HOT.setRGB(1.0, 0.46, 0.17);
      s.colour.copy(HOT).multiplyScalar(b);
      s.alpha = 1;
    }

    this.poseTrail(p, d, ang, R, stretch, fat);

    const glowI = cfg.light * (0.5 + 0.5 * Math.sin(Math.PI * Math.min(1, this.u * 3)));
    if (this.seaSrc) {
      this.seaSrc.pos.copy(p);
      this.seaSrc.intensity = 0.62 * glowI;
    }
    if (this.warm) { this.warm.pos.copy(p); this.warm.intensity = 0.34 * (glowI / cfg.light); }
    if (this.light) { this.light.position.copy(p); this.light.intensity = 140 * glowI; }
    return this;
  }

  poseTrail(p, d, ang, R, stretch, fat) {
    if (!this.trailN) return;
    // trail is a fixed WORLD length, so a long shot does not get a proportionally silly plume
    const span = Math.min(0.5, (58 + 46 * R) / Math.max(60, this.arc.range));
    const step = span / this.trailN;
    // cards are laid ALONG the path and overlap by 2.4x their spacing. A card narrower than the
    // gap between cards is what makes a trail read as a dotted line of sprites.
    const gap = (span * this.arc.range) / this.trailN;
    const sun = sunDir();
    for (let k = 0; k < this.trailN; k++) {
      const s = this.trail[k];
      const f = this.u - k * step;
      if (f <= 0.002) { s.alpha = 0; continue; }
      const age = k / this.trailN;
      const j = this.jit[k];
      this.arc.at(f, _p);
      const wide = R * (0.34 + age * 3.4) * j[3];
      const grow = 0.25 + age * 2.6;
      _p.x += j[0] * grow * R * 1.1;
      _p.y += j[1] * grow * R * 0.7;
      _p.z += j[2] * grow * R * 1.1;
      _p.y = Math.max(_p.y, seaHeight(_p.x, _p.z) + wide * 0.65);
      s.pos.copy(_p);
      s.sx = wide;
      s.sy = Math.max(wide, gap * 2.4);
      s.rot = ang + j[4] * age * 0.35;
      // the head lights the first few metres of its own vapour; the tail cools to sun-lit grey
      const lit = Math.max(0, 1 - age * 11);
      HOT.setRGB(1.0, 0.52, 0.24);
      COOL.setRGB(0.63, 0.65, 0.68).multiplyScalar(0.78 + 0.28 * Math.max(0, sun.y));
      s.colour.copy(COOL).lerp(HOT, lit * 0.6);
      // exponent well under 1: at 1.15 the tail faded before it had finished broadening, so the
      // visible trail NARROWED with age — smoke does the opposite
      s.alpha = 0.40 * (1 - age) ** 0.55 * Math.min(1, this.u * 14) * (0.55 + 0.45 * j[3]) / stretch;
    }
  }

  screenAngle(p, d, cam) {
    _p.copy(p).project(cam);
    const x0 = _p.x, y0 = _p.y;
    _p.copy(p).addScaledVector(d, Math.max(1, this.arc.range * 0.004)).project(cam);
    return Math.atan2(_p.y - y0, (_p.x - x0) * (cam.aspect || 1)) - Math.PI / 2;
  }

  // Real-time flight. Returns false when the round has landed.
  update(dt) {
    if (pinned !== null) { this.poseAt(pinned); pumpCards(this.ctx.app.camera); return true; }
    this.elapsed += dt * 1000;
    this.poseAt(Math.min(1, this.elapsed / this.ms));
    pumpCards(this.ctx.app.camera);
    return this.elapsed < this.ms;
  }

  kill() {
    if (this.dead) return;
    this.dead = true;
    this.ctx.root.remove(this.mesh);
    for (const s of this.glow) this.hot.give(s);
    for (const s of this.trail) this.smoke.give(s);
    if (this.seaSrc) dropSeaSource(this.seaSrc);
    if (this.warm) dropWarmSource(this.warm);
    if (this.light) this.ctx.lights.release(this.light);
  }
}

// The seam main.js imports. Everything else goes through vfx.tracer.
export function fireShell(vfx, from, to, ms, size = 1) {
  return vfx.tracer(from, to, ms, size);
}

// Where the impact happens on the water, given a target cell's world position: the sea moves, and
// a splash written at y = 0 is sliced by the swell.
export function seaImpact(x, z, out = new THREE.Vector3()) { return out.set(x, seaHeight(x, z), z); }
