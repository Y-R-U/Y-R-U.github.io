// LONGSHOT — the living city: civilians, guards, targets.
// Every human is a rigged PolyPerfect character (charrig.js) driven by simple
// routines. Exposes analytic colliders (head sphere + torso capsule) that
// ballistics.js tests against, plus panic/flee behaviour and death falls.

import * as THREE from 'three';
import * as BGU from 'three/addons/utils/BufferGeometryUtils.js';
import { initChars, loadCharacter, preloadTemplates } from './charrig.js';
import { raycast } from './ballistics.js';
import { PANIC } from './config.js';
import { rng } from './utils.js';

const T = THREE;

export const CIV_FILES = [
  'man_casual.glb', 'woman_casual.glb', 'man_casual_shorts.glb', 'woman_casual_shorts.glb',
  'man_coat_winter.glb', 'woman_coat_winter.glb', 'man_punk.glb', 'woman_punk.glb',
  'man_post.glb', 'woman_post.glb', 'man_chef.glb', 'woman_maid.glb',
  'man_doctor.glb', 'woman_doctor.glb', 'man_homeless.glb', 'woman_homeless.glb',
  'man_reporter.glb', 'woman_scientist.glb', 'man_mechanic.glb', 'woman_mechanic.glb',
  'man_construction_worker.glb', 'woman_construction_worker.glb',
  'man_carpenter.glb', 'woman_carpenter.glb',
  'man_paramedic.glb', 'woman_paramedic.glb',
  'man_skate.glb', 'woman_skate.glb',
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
let markerMat = null;            // one sprite material for every marker in the city

// ── impostors ───────────────────────────────────────────────────────────────
// A rigged character costs a draw call and an 80-bone skeleton update whether he
// is forty pixels tall or four. Everyone the current field of view cannot
// resolve is drawn instead as a box-built stand-in, packed into ONE instanced
// mesh per stride pose: three draw calls for however much of the city is too
// far away to read. Nothing else changes — the person, his collider, his
// routine and his panic all carry on; this is only how he is DRAWN.
const STRIDE = [-0.42, 0.0, 0.42];
const PROXY_PX = 11;             // projected height below which a rigged civilian becomes an impostor
// outfit tints, multiplied over the impostor's own vertex colours
const OUTFITS = [
  [0.75, 0.78, 0.88], [1.00, 0.92, 0.80], [0.60, 0.66, 0.78], [0.95, 0.95, 0.95],
  [0.90, 0.70, 0.65], [0.70, 0.80, 0.72], [1.05, 1.00, 0.95], [0.55, 0.60, 0.68],
];
const UP = new T.Vector3(0, 1, 0);

function tintedBox(w, h, d, c) {
  const g = new T.BoxGeometry(w, h, d);
  const n = g.attributes.position.count, cc = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { cc[i * 3] = c[0]; cc[i * 3 + 1] = c[1]; cc[i * 3 + 2] = c[2]; }
  g.setAttribute('color', new T.BufferAttribute(cc, 3));
  return g;
}

function impostorGeo(swing) {
  const parts = [];
  const box = (w, h, d, x, y, z, c) => parts.push(tintedBox(w, h, d, c).translate(x, y, z));
  // limbs pivot about the shoulder / hip, so build them hanging then rotate
  const limb = (w, h, d, px, py, ang, c) =>
    parts.push(tintedBox(w, h, d, c).translate(0, -h / 2, 0).rotateX(ang).translate(px, py, 0));
  const skin = [0.86, 0.72, 0.60], coat = [0.78, 0.78, 0.80], leg = [0.44, 0.45, 0.48];
  box(0.23, 0.25, 0.23, 0, 1.63, 0, skin);          // head
  box(0.38, 0.56, 0.23, 0, 1.20, 0, coat);          // torso
  box(0.34, 0.20, 0.23, 0, 0.83, 0, leg);           // hips
  limb(0.12, 0.54, 0.13, 0.25, 1.42, -swing * 0.8, coat);
  limb(0.12, 0.54, 0.13, -0.25, 1.42, swing * 0.8, coat);
  limb(0.15, 0.78, 0.16, 0.11, 0.84, swing, leg);
  limb(0.15, 0.78, 0.16, -0.11, 0.84, -swing, leg);
  return BGU.mergeGeometries(parts);
}

class ImpostorField {
  constructor(scene, cap) {
    this.scene = scene;
    this.n = [0, 0, 0];
    this.mat = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
    this.meshes = STRIDE.map(s => {
      const m = new T.InstancedMesh(impostorGeo(s), this.mat, cap);
      m.instanceMatrix.setUsage(T.DynamicDrawUsage);
      m.count = 0;                  // end() sets this to what was written
      m.frustumCulled = false;      // the field spans the whole city
      m.castShadow = false;
      scene.add(m);
      return m;
    });
    this.cap = cap;
    this._m = new T.Matrix4();
    this._q = new T.Quaternion();
    this._v = new T.Vector3();
    this._s = new T.Vector3();
  }

  // Instances are PACKED from slot 0 every frame and `count` trimmed to what was
  // written. A zero-scale instance still runs its vertex shader, so leaving 200
  // parked slots in three meshes cost 50k triangles a frame for nothing.
  begin(cam) {
    this.cam = cam;
    this.n[0] = this.n[1] = this.n[2] = 0;
  }
  write(pos, yaw, scale, pose, colour) {
    if (this.cam) {
      const v = this._v.copy(pos); v.y += 0.9; v.project(this.cam);
      if (v.z > 1 || Math.abs(v.x) > 1.15 || Math.abs(v.y) > 1.2) return;
    }
    const i = this.n[pose];
    if (i >= this.cap) return;
    this.n[pose]++;
    const mesh = this.meshes[pose];
    mesh.setMatrixAt(i, this._m.compose(pos, this._q.setFromAxisAngle(UP, yaw || 0), this._s.setScalar(scale)));
    if (colour) mesh.setColorAt(i, colour);
  }
  end() {
    for (let k = 0; k < this.meshes.length; k++) {
      const mesh = this.meshes[k];
      mesh.count = this.n[k];
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  dispose() {
    for (const mesh of this.meshes) { this.scene.remove(mesh); mesh.geometry.dispose(); mesh.dispose(); }
    this.mat.dispose();
  }
}

// A vendor with nothing to sell is just a man standing still, and the queue in
// front of him reads as a bug. One merged kiosk = one draw call.
function stallGeo() {
  const parts = [];
  const box = (w, h, d, x, y, z, c) => parts.push(tintedBox(w, h, d, c).translate(x, y, z));
  const body = [0.34, 0.30, 0.27], trim = [0.62, 0.20, 0.17], post = [0.22, 0.22, 0.24];
  box(2.2, 1.05, 1.0, 0, 0.52, 0, body);       // counter
  box(2.3, 0.10, 1.1, 0, 1.08, 0, trim);       // counter edge
  box(0.08, 1.1, 0.08, -1.05, 1.65, -0.4, post);
  box(0.08, 1.1, 0.08, 1.05, 1.65, -0.4, post);
  box(2.4, 0.12, 1.3, 0, 2.2, -0.1, trim);     // awning
  return BGU.mergeGeometries(parts);
}

export class Population {
  constructor(scene, city, seed) {
    this.scene = scene;
    this.city = city;
    this.r = rng(seed + ':pop');
    this.list = [];
    this.decals = [];
    this.props = [];
    this.queues = [];
    this.crowd = null;
    this.ready = initChars();
    makeTextures();
  }

  // Spawn a whole crowd at once. The cost is the DISTINCT templates — each one a
  // Range fetch, a gunzip, an XOR and a GLTF parse — not the head count, so those
  // are warmed together and the spawns themselves stay sequential: once the
  // template is cached a spawn is a SkeletonUtils clone, and keeping the order
  // fixed keeps the seeded RNG (and therefore the layout) reproducible.
  async spawnMany(specs) {
    await this.ready;
    await preloadTemplates(specs.map(s => s.file));
    const out = [];
    for (const s of specs) {
      const p = await this.spawn(s).catch(() => null);
      if (p) out.push(p);
    }
    return out;
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
    // blob shadows are one instanced disc for the whole city (see _shadows)
    // marker sprite (hidden until marked)
    if (!markerMat) markerMat = new T.SpriteMaterial({ map: markerTex, transparent: true, depthWrite: false, sizeAttenuation: false });
    const mk = new T.Sprite(markerMat);
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
    if (rt.type === 'loop' || rt.type === 'patrol' || rt.type === 'queue') {
      p.wpIdx = rt.start || 0;
      p.speed = rt.speed || (rt.type === 'patrol' ? 1.1 : 1.35);
      p.walkAnim = rt.walkAnim || 'walk';
      p.char.setAnim(rt.type === 'queue' ? (rt.anim || 'idle') : p.walkAnim);
    } else if (rt.type === 'sit') {
      p.char.setAnim('sit');
      p.group.position.y = 0.46;
      // Shuffle back onto the seat along the way he is FACING. The old line
      // applied sin(yaw) to x and nothing to z, so a sitter facing down the z
      // axis slid sideways off his bench instead of back onto it.
      p.group.position.x -= Math.sin(p.yaw) * 0.15;
      p.group.position.z -= Math.cos(p.yaw) * 0.15;
    } else {
      p.char.setAnim(rt.anim || 'idle');
      // A standing crowd that never changes what it is doing reads as a row of
      // statues; standers drift between a small set of idle behaviours.
      if (rt.vary) { p.varyT = this.r.range(2, 9); p.varyFrom = rt.vary; }
    }
  }

  // A queue is a line of marks shuffling forward: every `serve` seconds the
  // person at the head is served and walks off to the back, and everyone else
  // takes a step up. Cheap, and it reads instantly from 250 m.
  addQueue(line, people, serve = 9) {
    people.forEach((p, i) => {
      if (p.routine.type === 'queue') return;
      p.routine = { type: 'queue', line, slot: i };
      this.applyRoutine(p);
    });
    this.queues.push({ line, people, serve, t: serve * 0.5 });
  }

  addStall(pos, yaw) {
    const m = new T.Mesh(stallGeo(), new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }));
    m.position.copy(pos); m.rotation.y = yaw;
    this.scene.add(m);
    this.props.push(m);
    return m;
  }

  initImpostors(cap) { this.crowd = new ImpostorField(this.scene, cap); }

  // One instanced disc for every blob shadow in the city. As a child of each
  // character's group it was a second draw call per visible person — and it
  // rotated with the body when he fell over.
  _shadowsFor(n) {
    if (this.shadows && this.shadows.instanceMatrix.count >= n) return this.shadows;
    if (this.shadows) { this.scene.remove(this.shadows); this.shadows.dispose(); }
    const m = new T.InstancedMesh(shadowGeo, shadowMat, Math.max(16, n + 16));
    m.instanceMatrix.setUsage(T.DynamicDrawUsage);
    m.frustumCulled = false;
    m.renderOrder = -1;
    this.scene.add(m);
    this.shadows = m;
    return m;
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
          if (p.waitT <= 0) p.char.setAnim(p.walkAnim || 'walk');
        } else {
          const wp = rt.points[p.wpIdx % rt.points.length];
          const d = new T.Vector3().subVectors(wp, p.group.position); d.y = 0;
          if (d.length() < 0.8) {
            p.wpIdx++;
            if (rt.pause && this.r.chance(0.35)) {
              p.waitT = this.r.range(1.5, 5);
              p.char.setAnim(this.r.pick(['idle', 'phone', 'browse', 'watch']));
            }
          } else {
            d.normalize();
            p.targetYaw = Math.atan2(d.x, d.z);
            p.group.position.addScaledVector(d, p.speed * dt);
          }
        }
      } else if (rt.type === 'queue') {
        const wp = rt.line[Math.min(rt.slot, rt.line.length - 1)];
        const d = new T.Vector3().subVectors(wp, p.group.position); d.y = 0;
        if (d.length() > 0.45) {
          d.normalize();
          p.targetYaw = Math.atan2(d.x, d.z);
          p.group.position.addScaledVector(d, Math.min(1.1, p.speed || 1.1) * dt);
          if (p.char.anim !== 'walk') p.char.setAnim('walk');
        } else if (p.char.anim === 'walk') {
          p.char.setAnim(rt.anim || 'idle');
          p.targetYaw = rt.face != null ? rt.face : p.targetYaw;
        }
      } else if (rt.type === 'chat') {
        // turn-taking: one of the pair gestures while the other listens
        p.chatT = (p.chatT || 0) - dt;
        if (p.chatT <= 0) {
          p.chatT = this.r.range(2.5, 6);
          p.char.setAnim(p.char.anim === 'talk' ? 'idle' : 'talk');
        }
        if (rt.face != null) p.targetYaw = rt.face;
      } else if (p.varyFrom) {
        p.varyT -= dt;
        if (p.varyT <= 0) { p.varyT = this.r.range(4, 12); p.char.setAnim(this.r.pick(p.varyFrom)); }
      }
      // face target yaw smoothly
      let dy = p.targetYaw - p.group.rotation.y;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      p.group.rotation.y += dy * Math.min(1, dt * 7);
      p.char.update(dt);
    }
    for (const q of this.queues) {
      q.t -= dt;
      if (q.t > 0) continue;
      q.t = q.serve;
      const live = q.people.filter(p => p.alive && p.state === 'routine');
      if (live.length < 2) continue;
      const back = q.line.length - 1;
      for (const p of live) p.routine.slot = p.routine.slot <= 0 ? back : p.routine.slot - 1;
    }
    this._lodAndShadows();
  }

  // A rigged character costs a draw call and an 80-bone skeleton update whether
  // he is forty pixels tall or four. What decides that is ANGULAR size, not
  // distance — at 28× a man 250 m away fills the glass, and unscoped the same
  // man is five pixels — so the swap to an instanced stand-in is driven by his
  // projected height in pixels and reverses the instant the player zooms in.
  // Targets, guards, IDENTIFY decoys and anyone marked or named always stay
  // rigged: an identify contract is won by telling suits apart.
  _lodAndShadows() {
    const cam = this.cullCam;
    const sh = this._shadowsFor(this.list.length);
    const m = this._m || (this._m = new T.Matrix4());
    const q = this._q || (this._q = new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), -Math.PI / 2));
    const v = this._v || (this._v = new T.Vector3());
    const s = this._s || (this._s = new T.Vector3());
    // pixels per metre at one metre of range, for the camera as it is right now
    const px = cam
      ? (window.innerHeight || 800) / (2 * Math.tan((cam.fov * Math.PI / 180) / 2))
      : 0;
    if (this.crowd) this.crowd.begin(cam);
    let n = 0;
    for (const p of this.list) {
      if (p.gone || p.hidden) continue;
      const pos = p.group.position;
      if (p.alive) {
        v.set(pos.x, pos.y + 0.03, pos.z);
        s.set(0.9, 0.9, 0.9);
        sh.setMatrixAt(n++, m.compose(v, q, s));
      }
      if (!cam || !this.crowd || p.role !== 'civ' || !p.alive || p.marked || p.decoy || p.label) { p.group.visible = true; continue; }
      const d = cam.position.distanceTo(pos);
      const h = d > 0.5 ? (1.75 * p.scale * px) / d : 1e9;
      const small = h < PROXY_PX;
      p.group.visible = !small;
      if (small) {
        if (!p.proxyColour) p.proxyColour = new T.Color(...OUTFITS[p.id % OUTFITS.length]);
        const walking = p.char.anim === 'walk' || p.char.anim === 'carry' || p.char.anim === 'panic';
        const pose = walking ? Math.floor(p.char._t * 2.4) % 3 : 1;
        this.crowd.write(pos, p.group.rotation.y, p.scale, pose, p.proxyColour);
      }
    }
    if (this.crowd) this.crowd.end();
    sh.count = n;
    sh.instanceMatrix.needsUpdate = true;
  }

  // scare everyone in radius; returns how many people it actually scared
  panicFrom(pos, radius, missions) {
    let n = 0;
    for (const p of this.list) {
      if (!p.alive || p.state === 'panic' || p.state === 'escape') continue;
      const d = p.group.position.distanceTo(pos);
      if (d > radius) continue;
      n++;
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
    return n;
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
    for (const m of this.props) { this.scene.remove(m); m.geometry.dispose(); m.material.dispose(); }
    if (this.crowd) { this.crowd.dispose(); this.crowd = null; }
    if (this.shadows) { this.scene.remove(this.shadows); this.shadows.dispose(); this.shadows = null; }
    this.list = [];
    this.decals = [];
    this.props = [];
    this.queues = [];
  }
}
