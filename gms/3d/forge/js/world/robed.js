// The six `geo: 'people'` rows of the bestiary, on the crowd's own hooded-robe profile: a raider,
// a Hollow, a Watchman and the three champions are the same figure stretched, widened and retinted.
// Same rig interface as vermin.js — add/remove — so js/game/spawner.js places one the same way.

import * as THREE from 'three';
import { zone } from './zones.js';
import { onEnvIntensity } from './materials.js';
import { rng, span } from './details.js';
import { heightAt } from './terrain.js';
import { walkStep, groundAt, collidersReady } from './colliders.js';
import { defineScenario, frameCamera } from '../scenarios.js';
import { ACT, STATE } from '../sim/foes.js';
import { roster, buckets, seatsLeft, PER_MESH } from './roster.js';
import { FOES, shapeOf, lampAt, LAMP_STAFF } from './foeshape.js';
import {
  Build, robe, hood, tube, cavityTone, eyeTones, robeColor, robeMaterial, robeDepth, aoDisc,
} from './people.js';

const UP = new THREE.Vector3(0, 1, 0);

function foeColor(v) {
  const c = robeColor(zone(v.zone).robe);
  if (v.stone) c.lerp(new THREE.Color(zone(v.zone).stone.base), v.stone);
  return c.multiplyScalar(v.shade ?? 1);
}

function staffPart(B, v, S) {
  if (!v.staff) return;
  const tall = v.tall ?? 1, wide = v.wide ?? 1;
  const p = (x, y, z) => [x * wide, y * tall, z * wide];
  // Sleeve first, and it has to start inside the body and end on the shaft, or the staff reads as
  // a stick standing next to a figure rather than one held by it.
  tube(B, [p(-0.120, 1.020, 0.030), p(-0.282, 0.938, 0.079)], [0.070 * wide, 0.078 * wide], 5,
    t => 0.74 - 0.20 * t, 0);
  if (v.staff === 'fork') {
    const hy = 1.74, hx = -0.246;
    tube(B, [p(-0.318, 0.03, 0.115), p(hx, hy, 0.045)], [0.030 * wide, 0.024 * wide], 4, 0.30, 0);
    tube(B, [p(hx - 0.095, hy, 0.045), p(hx + 0.095, hy, 0.045)], [0.018 * wide, 0.018 * wide], 3, 0.26, 0);
    for (const d of [-0.088, 0, 0.088]) {
      tube(B, [p(hx + d, hy, 0.045), p(hx + d, hy + 0.21, 0.045)], [0.015 * wide, 0.004], 3, 0.26, 0);
    }
    return;
  }
  const top = v.staff === 'lamp' ? LAMP_STAFF : 1.86;
  tube(B, [p(-0.318, 0.03, 0.115), p(-0.242, top, 0.045)], [0.030 * wide, 0.023 * wide], 4, 0.30, 0);
  if (v.staff === 'lamp') {
    // A crook and a shallow cage over the flame. The flame itself is an emissive instance, so the
    // cage has to be open or it swallows the one thing that makes a Watchman visible at distance.
    tube(B, [p(-0.242, top, 0.045), p(-0.255, top + 0.10, 0.045)], [0.023 * wide, 0.020 * wide], 4, 0.24, 0);
    for (const a of [0, 1, 2, 3]) {
      const th = a / 4 * Math.PI * 2;
      const dx = Math.cos(th) * 0.075, dz = Math.sin(th) * 0.075;
      tube(B, [p(-0.255 + dx, top + 0.03, 0.045 + dz), p(-0.255 + dx, top + 0.20, 0.045 + dz)],
        [0.012 * wide, 0.012 * wide], 3, 0.22, 0);
    }
    tube(B, [p(-0.255, top + 0.20, 0.045), p(-0.255, top + 0.27, 0.045)], [0.070 * wide, 0.014], 5, 0.20, 0);
    return;
  }
  const t = zone(v.zone).staffTip;
  if (t?.shape === 'bulb') {
    tube(B, [p(-0.242, top, 0.045), p(-0.240, top + t.len * 0.42, 0.043)], [0.020 * wide, t.wide * wide], 5, t.shade, 0);
    tube(B, [p(-0.240, top + t.len * 0.42, 0.043), p(-0.238, top + t.len, 0.042)], [t.wide * wide, 0.014], 5, t.shade, 0);
  } else {
    tube(B, [p(-0.242, top, 0.045), p(-0.238, top + (t?.len ?? 0.24), 0.042)], [(t?.wide ?? 0.03) * wide, 0.004], 4,
      t?.shade ?? 0.24, 0);
  }
  // A raider's staff is cut down and bound, not finished: one collar of cloth part way up.
  if (v.ragged) tube(B, [p(-0.290, 0.78, 0.085), p(-0.276, 0.94, 0.075)], [0.055 * wide, 0.048 * wide], 4, 0.52, 0);
}

function foeGeometry(id) {
  const v = FOES[id];
  const S = shapeOf(v);
  const B = new Build();
  const seed = (id.charCodeAt(0) * 7 + id.length * 13) % 100 / 16;
  const tint = foeColor(v);
  robe(B, seed, S);
  hood(B, seed, cavityTone(v.zone, tint), eyeTones(v.zone), S);
  staffPart(B, v, S);
  const g = B.geometry();
  g.userData.tris = B.tris;
  g.userData.top = S.apex[1];
  return g;
}

const POOL = 24;
// props.js's numbers for a lit lantern, which that wave measured against daylight at nine metres:
// a hard core and five nested additive shells. A Watchman has to be seen further off than a lamp
// post does, so it is the same recipe one size up.
const LAMP_R = 0.115, HALO_R = [0.17, 0.23, 0.30, 0.38, 0.47], HALO_GAIN = 0.055;

// Where the ?dev=1 turntable stands each variant, relative to the dev site.
const DEV_ROW = Object.keys(FOES);

export class Robed {
  constructor(terrain, uniforms) {
    this.terrain = terrain;
    this.uniforms = uniforms;
    this.object3D = new THREE.Group();
    this.object3D.name = 'robed';
    this.agents = [];
    this.active = [];
    this.time = 0;
    this.recount = 0;
    this.frozen = false;
    this.lampLevel = 1;
    this.rand = rng(0x2f61bd);

    this.geo = new Map();
    this.mat = new Map();
    this.meshes = new Map();
    this.depth = robeDepth(uniforms);
    onEnvIntensity(v => { this.env = v; for (const m of this.mat.values()) m.envMapIntensity = v; });

    const { g, m } = aoDisc();
    this.ao = new THREE.InstancedMesh(g, m, POOL);
    this.ao.name = 'robed:contact';
    this.ao.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.ao.frustumCulled = false;
    this.ao.renderOrder = 2;
    this.ao.castShadow = false;
    this.ao.count = 0;
    this.object3D.add(this.ao);
    this.buildLamp();
    if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('dev')) this.devScenarios();
  }

  // The lamp is the props.js recipe: a hard core for the flame and nested additive shells for the
  // glow, both instanced, both drawn only while a Watchman is alight.
  buildLamp() {
    const lit = new THREE.Color(zone('dark').window.litColor);
    const make = (name, geo, mat) => {
      const mesh = new THREE.InstancedMesh(geo, mat, PER_MESH);
      mesh.name = name;
      mesh.castShadow = mesh.receiveShadow = false;
      mesh.frustumCulled = false;
      mesh.count = 0;
      mesh.visible = false;
      this.object3D.add(mesh);
      return mesh;
    };
    this.lampCore = make('robed:lamp', new THREE.SphereGeometry(LAMP_R, 8, 6),
      new THREE.MeshBasicMaterial({ color: lit, toneMapped: false }));
    this.lampHalo = make('robed:halo', mergeShells(HALO_R),
      new THREE.MeshBasicMaterial({
        color: lit.clone().multiplyScalar(HALO_GAIN), toneMapped: false,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      }));
    this.lampHalo.renderOrder = 3;
  }

  mesh(id) {
    let m = this.meshes.get(id);
    if (m) return m;
    if (!this.geo.has(id)) this.geo.set(id, foeGeometry(id));
    if (!this.mat.has(id)) {
      const mat = robeMaterial(FOES[id].zone, this.uniforms, { color: foeColor(FOES[id]), name: `robe:${id}` });
      if (this.env !== undefined) mat.envMapIntensity = this.env;
      this.mat.set(id, mat);
    }
    m = new THREE.InstancedMesh(this.geo.get(id), this.mat.get(id), PER_MESH);
    m.name = `robed:${id}`;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.castShadow = true;
    m.receiveShadow = true;
    m.customDepthMaterial = this.depth;
    m.count = 0;
    m.geometry.setAttribute('aInst',
      new THREE.InstancedBufferAttribute(new Float32Array(PER_MESH * 4), 4).setUsage(THREE.DynamicDrawUsage));
    m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(PER_MESH * 3).fill(1), 3);
    this.object3D.add(m);
    this.meshes.set(id, m);
    return m;
  }

  // The spawner's side of the rig. `zi` is always 0 — a Watchman's palette is its own, not the
  // ground's — so roster.js's per-(kind, zone) seat count is per-variant here.
  add(spec) {
    if (!FOES[spec.enemy]) return null;
    if (seatsLeft(this.agents, spec.enemy, 0) <= 0) return null;
    const R = this.rand;
    const a = {
      // Pinned from the moment it exists: js/game/spawner.js only calls foes.js `arm` once this
      // has returned, and roster() would leave the body undrawn until the next re-assign.
      enemy: spec.enemy, kind: spec.enemy, zi: 0, state: STATE.idle,
      x: spec.x, z: spec.z, home: spec.home || [spec.x, spec.z],
      heading: span(R, 0, Math.PI * 2), speed: 0, run: FOES[spec.enemy].run,
      phase: span(R, 0, 40), gait: span(R, 0, 6.28),
      scale: FOES[spec.enemy].scale * span(R, 0.96, 1.05), tone: span(R, 0.9, 1.08),
      act: 0, at: 0,
    };
    this.agents.push(a);
    this.assign();
    return a;
  }

  remove(a) {
    const i = this.agents.indexOf(a);
    if (i < 0) return false;
    this.agents.splice(i, 1);
    this.assign();
    return true;
  }

  // Same invariant vermin.js holds: a body in a fight is pinned to the front of the draw list and
  // keeps its mesh seat. Nothing ambient wears these, so the count is whatever is pinned.
  assign(cam) {
    this.active = roster(this.agents, 0, cam, POOL);
    for (const m of this.meshes.values()) { m.count = 0; m.userData.list = null; }
    const col = new THREE.Color();
    for (const [key, list] of buckets(this.active, PER_MESH)) {
      const mesh = this.mesh(key.split(':')[0]);
      mesh.count = list.length;
      mesh.userData.list = list;
      const ic = mesh.instanceColor;
      list.forEach((a, i) => { col.setRGB(a.tone, a.tone, a.tone).toArray(ic.array, i * 3); });
      ic.needsUpdate = true;
    }
    this.recount = 0;
  }

  registerKnobs(q) {
    q.register({ key: 'watchLamp', label: 'Watch lamp', type: 'range', min: 0, max: 3, step: 0.1, default: 1, group: 'Combat' },
      v => { this.lampLevel = v; });
  }

  update(dt, app) {
    // Frozen leaves the frame exactly as it was: clearing the contact discs and the lamps here
    // meant opening a menu put every Watchman's light out.
    if (this.frozen) return;
    if (!this.active.length) { this.ao.count = 0; this.drawLamps([]); return; }
    this.time = (this.time + dt) % 600;

    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler(0, 0, 0, 'YXZ');
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();
    const flat = new THREE.Quaternion();
    const up = new THREE.Vector3();
    const T = this.terrain;
    const lamps = [];
    let ai = 0;

    for (const mesh of this.meshes.values()) {
      const list = mesh.userData.list;
      if (!list || !list.length) continue;
      const inst = mesh.geometry.getAttribute('aInst');

      for (let i = 0; i < list.length; i++) {
        const a = list[i];
        // The act clock is js/sim/foes.js's; this only reads it. A lunge, a recoil and a fall are
        // all body attitude, so they ride the instance matrix and leave the cloth shader alone.
        const lunge = a.act === ACT.attack ? win(a.at, 0.28, 0.40, 0.56, 0.86) : 0;
        const wind = a.act === ACT.attack ? win(a.at, 0.0, 0.20, 0.26, 0.42) : 0;
        const flinch = a.act === ACT.hurt ? win(a.at, 0, 0.07, 0.16, 0.70) : 0;
        const fall = a.act === ACT.die ? Math.min(1, a.at / 0.45) : 0;
        const drop = fall * fall * (3 - 2 * fall);

        this.walk(a, dt);
        const fwd = this.terrainStep(a, dt, T);
        e.set(0.30 * lunge - 0.16 * wind - 0.34 * flinch + 1.44 * drop, a.heading, 0);
        q.setFromEuler(e);
        const bob = a.speed > 0.05 ? Math.sin(this.time * (4.2 + a.speed) * 2 + a.gait) * 0.022 * Math.min(1.5, a.speed) : 0;
        pos.set(a.x + Math.sin(a.heading) * lunge * 0.26, fwd + bob - 0.05 * drop,
          a.z + Math.cos(a.heading) * lunge * 0.26);
        scl.setScalar(a.scale);
        m4.compose(pos, q, scl);
        mesh.setMatrixAt(i, m4);

        if (a.enemy === 'watchman' && a.act !== ACT.die) {
          lamps.push(new THREE.Vector3(...lampAt(FOES.watchman)).applyMatrix4(m4));
        }

        if (ai < POOL) {
          if (T) {
            up.set(T.surfaceY(a.x - 0.6, a.z) - T.surfaceY(a.x + 0.6, a.z), 1.2,
              T.surfaceY(a.x, a.z - 0.6) - T.surfaceY(a.x, a.z + 0.6)).normalize();
            flat.setFromUnitVectors(UP, up);
          }
          pos.set(a.x, fwd + 0.07, a.z);
          scl.set(a.scale, 1, a.scale);
          m4.compose(pos, flat, scl);
          this.ao.setMatrixAt(ai++, m4);
        }

        inst.array[i * 4] = a.phase;
        inst.array[i * 4 + 1] = a.speed / 3;
        inst.array[i * 4 + 2] = a.gait;
        inst.array[i * 4 + 3] = lunge * 1.2 - wind * 0.5;
      }
      mesh.instanceMatrix.needsUpdate = true;
      inst.needsUpdate = true;
    }

    this.ao.count = ai;
    this.ao.instanceMatrix.needsUpdate = true;
    this.drawLamps(lamps);

    this.recount -= dt;
    if (this.recount <= 0) {
      this.recount = 1.5;
      this.assign(app?.camera);
      for (const m of this.meshes.values()) if (m.count) m.computeBoundingSphere();
    }
  }

  // js/sim/foes.js sets the heading and the speed; carrying the body along them is the rig's job,
  // exactly as vermin.js does it. No wander and no leash turn: giving up is the AI's call.
  walk(a, dt) {
    if (!(a.speed > 0.01) || a.act === ACT.die) return;
    const wx = a.x + Math.sin(a.heading) * a.speed * dt;
    const wz = a.z + Math.cos(a.heading) * a.speed * dt;
    const step = collidersReady() ? walkStep(a.x, a.z, wx, wz, a.y ?? 0, 0.34) : { x: wx, z: wz };
    a.x = step.x;
    a.z = step.z;
  }

  // Eased rather than snapped, so a step up onto a bridge deck is climbed instead of teleported.
  terrainStep(a, dt, T) {
    const fall = T ? T.surfaceY(a.x, a.z) : heightAt(a.x, a.z);
    const want = collidersReady() ? groundAt(a.x, a.z, a.y ?? fall) : fall;
    a.y = a.y === undefined ? want : a.y + (want - a.y) * (1 - Math.exp(-9 * dt));
    return a.y;
  }

  drawLamps(at) {
    const m4 = new THREE.Matrix4();
    const s = new THREE.Vector3(), q = new THREE.Quaternion();
    for (const mesh of [this.lampCore, this.lampHalo]) {
      const n = Math.min(at.length, PER_MESH);
      for (let i = 0; i < n; i++) {
        s.setScalar(this.lampLevel);
        m4.compose(at[i], q, s);
        mesh.setMatrixAt(i, m4);
      }
      mesh.count = n;
      mesh.visible = n > 0 && this.lampLevel > 0;
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  cost() {
    let drawn = 0, tris = 0;
    for (const [id, m] of this.meshes) {
      if (!m.count) continue;
      drawn++;
      tris += m.count * this.geo.get(id).userData.tris;
    }
    return { tris, drawn: drawn + (this.ao.count ? 1 : 0) + (this.lampCore.count ? 2 : 0) };
  }

  // Only with ?dev=1: --all must keep rendering exactly the five scenarios the critic scores.
  devScenarios() {
    const site = { x: 0, z: 44 };
    const stand = i => ({ x: site.x - 5.6 + i * 2.4, z: site.z });
    for (const [i, id] of DEV_ROW.entries()) {
      const p = stand(i);
      this.agents.push({
        enemy: id, kind: id, zi: 0, x: p.x, z: p.z, home: [p.x, p.z], state: STATE.idle,
        heading: 0, speed: 0, phase: i * 3.1, gait: i * 1.7,
        scale: FOES[id].scale, tone: 1, act: 0, at: 0,
      });
    }
    this.assign();
    const shot = (id, label, opts) => defineScenario({
      id, label, zone: 'neutral',
      setup: app => {
        const gy = heightAt(opts.at.x, opts.at.z);
        frameCamera(app, {
          pos: [opts.at.x + opts.dx, gy + opts.h, opts.at.z + opts.dz],
          look: [opts.at.x, gy + (opts.ly ?? 1.0), opts.at.z], fov: opts.fov,
        });
        app.quality.set('time', opts.t ?? 10.5);
        app.quality.set('crowd', 0);
      },
    });
    shot('foe_line', 'The bestiary, six abreast', { at: { x: site.x, z: site.z }, dx: 0, dz: 12.5, h: 3.0, fov: 52, ly: 1.1 });
    DEV_ROW.forEach((id, i) => {
      shot(`foe_${id}`, `${id} at 4 m`, { at: stand(i), dx: 0.9, dz: 3.9, h: 1.9, fov: 40, ly: 1.0 });
      shot(`foe_${id}_night`, `${id} at night`, { at: stand(i), dx: 0.9, dz: 3.9, h: 1.9, fov: 40, ly: 1.0, t: 22 });
    });
  }
}

// Front faces of nested spheres: each shell adds its gain once, so the overlaps step the
// brightness down toward the edge instead of leaving one hard-edged ball.
function mergeShells(radii) {
  const geo = new THREE.BufferGeometry();
  const pos = [], nrm = [];
  for (const r of radii) {
    const s = new THREE.SphereGeometry(r, 10, 8).toNonIndexed();
    pos.push(...s.attributes.position.array);
    nrm.push(...s.attributes.normal.array);
  }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  return geo;
}

const win = (t, a, b, c, d) => Math.max(0, smooth(t, a, b) - smooth(t, c, d));
function smooth(t, a, b) {
  const x = Math.min(1, Math.max(0, (t - a) / Math.max(1e-4, b - a)));
  return x * x * (3 - 2 * x);
}
