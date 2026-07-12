// LONGSHOT — the living city: civilians, guards, targets.
// Every human is a rigged PolyPerfect character (charrig.js) driven by simple
// routines. Exposes analytic colliders (head sphere + torso capsule) that
// ballistics.js tests against, plus panic/flee behaviour and death falls.

import * as THREE from 'three';
import { initChars, loadCharacter } from './charrig.js';
import { raycast } from './ballistics.js';
import { PANIC } from './config.js';
import { rng } from './utils.js';

const T = THREE;

export const CIV_FILES = [
  'man_casual.glb', 'woman_casual.glb', 'man_casual_shorts.glb', 'woman_casual_shorts.glb',
  'man_coat_winter.glb', 'woman_coat_winter.glb', 'man_punk.glb', 'woman_punk.glb',
  'man_post.glb', 'man_chef.glb', 'woman_maid.glb', 'man_doctor.glb',
  'man_homeless.glb', 'man_reporter.glb', 'woman_scientist.glb', 'man_mechanic.glb',
];
export const SUIT_FILES = [
  'man_business.glb', 'woman_business.glb', 'man_judge.glb', 'man_butler.glb',
  'man_naval_officer.glb', 'man_pilot.glb', 'man_scientist.glb', 'woman_reporter.glb',
];
export const GUARD_FILES = ['man_officer_swat.glb', 'man_soldier.glb', 'man_police.glb', 'woman_police.glb'];

let markerTex = null, bloodTex = null;
function makeTextures() {
  if (markerTex) return;
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const g = cv.getContext('2d');
  g.translate(32, 32); g.rotate(Math.PI / 4);
  g.fillStyle = '#ff3b30'; g.fillRect(-13, -13, 26, 26);
  g.strokeStyle = '#fff'; g.lineWidth = 4; g.strokeRect(-13, -13, 26, 26);
  markerTex = new T.CanvasTexture(cv);
  const bv = document.createElement('canvas'); bv.width = bv.height = 64;
  const b = bv.getContext('2d');
  const gr = b.createRadialGradient(32, 32, 3, 32, 32, 30);
  gr.addColorStop(0, 'rgba(96,10,8,0.85)'); gr.addColorStop(1, 'rgba(96,10,8,0)');
  b.fillStyle = gr;
  for (let i = 0; i < 5; i++) {
    b.save(); b.translate(32 + (Math.random() * 20 - 10), 32 + (Math.random() * 20 - 10));
    b.scale(0.4 + Math.random() * 0.8, 0.4 + Math.random() * 0.8);
    b.beginPath(); b.arc(0, 0, 26, 0, 7); b.fill(); b.restore();
  }
  bloodTex = new T.CanvasTexture(bv);
}

const shadowGeo = new T.CircleGeometry(0.5, 12);
const shadowMat = new T.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.34, depthWrite: false });

export class Population {
  constructor(scene, city, seed) {
    this.scene = scene;
    this.city = city;
    this.r = rng(seed + ':pop');
    this.list = [];
    this.decals = [];
    this.ready = initChars();
    makeTextures();
  }

  // spec: { file, pos, yaw, role: 'civ'|'target'|'guard'|'vip', routine, traits, armored, sit }
  async spawn(spec) {
    await this.ready;
    const char = await loadCharacter(spec.file, { anim: spec.anim || 'idle' });
    const p = {
      id: this.list.length,
      char, group: char.group, file: spec.file,
      role: spec.role || 'civ',
      routine: spec.routine || { type: 'stand', anim: 'idle' },
      traits: spec.traits || {},
      armored: !!spec.armored,
      alive: true, marked: false, state: 'routine',
      yaw: spec.yaw || 0, targetYaw: spec.yaw || 0,
      speed: 0, wpIdx: 0, waitT: 0, fall: null, fleeTo: null,
      escaped: false, panicked: false,
      onDeath: spec.onDeath || null,
      label: spec.label || null,
    };
    // normalise height ~1.75 m (±4%)
    const box = new T.Box3().setFromObject(char.group);
    const h = Math.max(0.1, box.max.y - box.min.y);
    p.scale = (1.75 / h) * (0.96 + this.r() * 0.08);
    char.group.scale.setScalar(p.scale);
    char.group.position.copy(spec.pos);
    char.group.rotation.y = p.yaw;
    // blob shadow
    const sh = new T.Mesh(shadowGeo, shadowMat);
    sh.rotation.x = -Math.PI / 2; sh.position.y = 0.02 / p.scale; sh.scale.setScalar(0.9 / p.scale);
    char.group.add(sh);
    p.shadow = sh;
    // marker sprite (hidden until marked)
    const mk = new T.Sprite(new T.SpriteMaterial({ map: markerTex, transparent: true, depthWrite: false, sizeAttenuation: false }));
    mk.scale.setScalar(0.022);
    mk.position.y = 2.25 / p.scale;
    mk.visible = false;
    char.group.add(mk);
    p.marker = mk;
    this.applyRoutine(p);
    this.scene.add(char.group);
    this.list.push(p);
    return p;
  }

  applyRoutine(p) {
    const rt = p.routine;
    if (rt.type === 'loop' || rt.type === 'patrol') {
      p.wpIdx = rt.start || 0;
      p.speed = rt.speed || (rt.type === 'patrol' ? 1.1 : 1.35);
      p.char.setAnim('walk');
    } else if (rt.type === 'sit') {
      p.char.setAnim('sit');
      p.group.position.y = 0.46;
      p.group.position.x += Math.sin(p.yaw) * -0.15;
    } else {
      p.char.setAnim(rt.anim || 'idle');
    }
  }

  update(dt, missions) {
    for (const p of this.list) {
      // velocity is what the ballistics sim leads against — track it for real
      if (p.alive && dt > 0) {
        if (!p._last) p._last = p.group.position.clone();
        const v = p.group.position.clone().sub(p._last).divideScalar(dt);
        p.vel = p.vel ? p.vel.lerp(v, 0.4) : v;
        p._last.copy(p.group.position);
      }
      if (!p.alive) {
        if (p.fall) {
          p.fall.t = Math.min(1, p.fall.t + dt * 2.1);
          const k = p.fall.t, e = 1 - Math.pow(1 - k, 3);
          p.group.rotation.x = p.fall.dir * e * (Math.PI / 2) * 1.02;
          p.group.position.y = p.fall.y0 * (1 - e) + 0.12 * e;
          if (k >= 1) p.fall = null;
        }
        p.char.update(dt);
        continue;
      }
      const rt = p.routine;
      if (p.state === 'panic' || p.state === 'escape') {
        if (p.fleeTo) {
          const d = new T.Vector3().subVectors(p.fleeTo, p.group.position); d.y = 0;
          const dist = d.length();
          if (dist < 2.5) {
            if (p.state === 'escape') { p.escaped = true; missions && missions.onEscape && missions.onEscape(p); }
            p.group.visible = false; p.alive = false; p.gone = true;
            continue;
          }
          d.normalize();
          p.targetYaw = Math.atan2(d.x, d.z);
          const sp = p.state === 'escape' ? PANIC.fleeSpeed * 1.12 : PANIC.fleeSpeed;
          p.group.position.addScaledVector(d, sp * dt);
        }
      } else if (rt.type === 'loop' || rt.type === 'patrol') {
        if (p.waitT > 0) {
          p.waitT -= dt;
          if (p.waitT <= 0) p.char.setAnim('walk');
        } else {
          const wp = rt.points[p.wpIdx % rt.points.length];
          const d = new T.Vector3().subVectors(wp, p.group.position); d.y = 0;
          if (d.length() < 0.8) {
            p.wpIdx++;
            if (rt.pause && this.r.chance(0.35)) { p.waitT = this.r.range(1.5, 5); p.char.setAnim(this.r.chance(0.5) ? 'idle' : 'phone'); }
          } else {
            d.normalize();
            p.targetYaw = Math.atan2(d.x, d.z);
            p.group.position.addScaledVector(d, p.speed * dt);
          }
        }
      }
      // face target yaw smoothly
      let dy = p.targetYaw - p.group.rotation.y;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      p.group.rotation.y += dy * Math.min(1, dt * 7);
      p.char.update(dt);
    }
  }

  // scare everyone in radius; returns whether anybody targeted flees
  panicFrom(pos, radius, missions) {
    for (const p of this.list) {
      if (!p.alive || p.state === 'panic' || p.state === 'escape') continue;
      const d = p.group.position.distanceTo(pos);
      if (d > radius) continue;
      if (p.role === 'target' || p.role === 'vip') {
        if (p.routine.type !== 'room') {                 // room targets duck & hide instead
          p.state = 'escape';
          p.fleeTo = this.nearestEscape(p.group.position, this.losTest);
          p.char.setAnim('panic');
          p.group.position.y = 0;
          missions && missions.onTargetFlees && missions.onTargetFlees(p);
        } else {
          missions && missions.onTargetFlees && missions.onTargetFlees(p, true);
        }
      } else if (p.role === 'guard') {
        p.panicked = true;                                // guards go loud (missions handles exposure)
        p.char.setAnim('guard');
      } else {
        p.state = 'panic';
        p.fleeTo = this.nearestEscape(p.group.position);   // civilians just run
        p.char.setAnim('panic');
        p.group.position.y = 0;
        p.panicked = true;
      }
    }
  }

  // Where a panicked mark runs. A target that vanishes behind a tower the
  // instant it bolts is a coin-flip, not a chase — so among the nearby exits we
  // prefer one the shooter can still SEE (`losTest` is supplied by the mission).
  // You can still lose them: they're fast and the clock is short.
  nearestEscape(pos, losTest) {
    const sorted = [...this.city.escapePts].sort(
      (a, b) => a.distanceToSquared(pos) - b.distanceToSquared(pos));
    if (losTest) {
      // Score each nearby exit by how much of the RUN stays in your glass, not
      // just its endpoint — a mark that ducks behind a tower one stride out is a
      // coin-flip. They can still get away; you just get to watch them try.
      let best = null, bestScore = -1;
      for (const e of sorted.slice(0, 10)) {
        let vis = 0;
        for (let i = 1; i <= 6; i++) {
          const p = pos.clone().lerp(e, i / 8);
          if (losTest({ x: p.x, y: 1.6, z: p.z })) vis++;
        }
        if (vis > bestScore) { bestScore = vis; best = e; }
        if (vis === 6) break;
      }
      if (best) return best.clone();
    }
    return sorted[0] ? sorted[0].clone() : pos.clone().multiplyScalar(2);
  }

  // analytic colliders for the ballistic ray
  colliders() {
    const out = [];
    for (const p of this.list) {
      if (!p.alive || p.gone || p.hidden) continue;
      const s = p.scale, base = p.group.position;
      const sitting = p.char.anim === 'sit';
      const headY = sitting ? 1.18 : 1.62, torsoA = sitting ? 0.55 : 0.82, torsoB = sitting ? 1.0 : 1.42;
      out.push({
        person: p,
        vel: p.vel ? p.vel.clone() : null,
        head: { c: new T.Vector3(base.x, base.y + headY * s, base.z), r: 0.15 },
        torso: {
          a: new T.Vector3(base.x, base.y + torsoA * s, base.z),
          b: new T.Vector3(base.x, base.y + torsoB * s, base.z),
          r: 0.24,
        },
      });
    }
    return out;
  }

  kill(p, dir, opts = {}) {
    if (!p.alive) return;
    p.alive = false;
    p.state = 'dead';
    p.marker.visible = false;
    p.char.setAnim('dead');
    const fwd = new T.Vector3(Math.sin(p.group.rotation.y), 0, Math.cos(p.group.rotation.y));
    const fromBehind = dir ? dir.dot(fwd) > 0 : true;
    p.fall = { t: 0, dir: fromBehind ? 1 : -1, y0: p.group.position.y };
    // blood pool
    if (!opts.noBlood) {
      const d = new T.Mesh(new T.PlaneGeometry(1.6, 1.6),
        new T.MeshBasicMaterial({ map: bloodTex, transparent: true, depthWrite: false }));
      d.rotation.x = -Math.PI / 2;
      d.rotation.z = Math.random() * 6.28;
      d.position.set(p.group.position.x, 0.03, p.group.position.z);
      this.scene.add(d);
      this.decals.push(d);
    }
    if (p.onDeath) p.onDeath(p);
  }

  mark(p, on = true) {
    p.marked = on;
    p.marker.visible = on && p.alive;
  }

  // Who is under the crosshair? Whoever the ray actually strikes wins — so a
  // body drifting between you and the mark can't steal the reticle from a mark
  // you're dead on. Only if the ray hits nobody do we fall back to the nearest
  // silhouette within `maxAngle` (forgiving on a phone, at 4× zoom).
  pick(origin, dir, maxAngle = 0.02) {
    const hit = raycast(origin, dir, { people: this.colliders(), max: 2500 });
    if (hit.person) return hit.person;
    const v = new T.Vector3();
    let best = null, bestA = maxAngle;
    for (const p of this.list) {
      if (!p.alive || p.gone || p.hidden) continue;
      v.copy(p.group.position); v.y += 1.35 * p.scale;
      v.sub(origin);
      if (v.length() < 5) continue;
      v.normalize();
      const a = Math.acos(Math.min(1, Math.max(-1, v.dot(dir))));
      if (a < bestA) { bestA = a; best = p; }
    }
    return best;
  }

  dispose() {
    for (const p of this.list) this.scene.remove(p.group);
    for (const d of this.decals) { this.scene.remove(d); d.geometry.dispose(); d.material.dispose(); }
    this.list = [];
    this.decals = [];
  }
}
