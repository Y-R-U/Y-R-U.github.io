// Doors, the scripted walk through one, and the interior that only exists while you are inside.
// Owns the collider set the player's camera arm rays against.

import * as THREE from 'three';
import { getMaterial } from './materials.js';
import { Colliders, wallBox } from './colliders.js';
import { Interior } from './interior.js';
import { Climb } from './climb.js';

const OUT = 2.05;     // where you are taken to before the door opens
const IN = 1.55;      // where you end up on the other side
const OPEN = 1.85;    // radians the leaf swings
const SEG = [0, 0.22, 0.62, 1];

const smooth = (a, b, x) => THREE.MathUtils.smootherstep(x, a, b);
const wrapPi = a => Math.atan2(Math.sin(a), Math.cos(a));

export class Doors {
  constructor(demo, player, lighting, hideWhileInside = []) {
    this.demo = demo;
    this.player = player;
    this.lighting = lighting;
    this.hideList = hideWhileInside;
    this.object3D = new THREE.Group();
    this.object3D.name = 'doors';
    this.colliders = new Colliders(demo.terrain);
    player.colliders = this.colliders;

    this.doors = [];
    this.leaves = new Map();
    this.state = 'out';
    this.u = 0;
    this.active = null;
    this.interior = null;
    this.climb = new Climb(player);
    this.cool = 0;
    this.since = 0;
    this.radius = 1.5;
    this.secs = 1.9;
    this.enabled = true;
    this.env = { power: 1, glow: 1, shaft: 0.45, day: 1, sunColor: new THREE.Color(1, 1, 1), t: 0 };
    this.refresh();
  }

  registerKnobs(q) {
    q.register({ key: 'doors', label: 'Doors enterable', type: 'toggle', default: true, group: 'Interiors' },
      v => { this.enabled = !!v; this.object3D.visible = !!v; if (!v && this.state !== 'out') this.abort(); });
    q.register({ key: 'doorRadius', label: 'Door hotspot radius', type: 'range', min: 0.6, max: 3.5, step: 0.1, default: 1.5, group: 'Interiors' },
      v => { this.radius = v; });
    q.register({ key: 'doorTime', label: 'Door transition (s)', type: 'range', min: 0.6, max: 4, step: 0.1, default: 1.9, group: 'Interiors' },
      v => { this.secs = v; });
    q.register({ key: 'interiorLight', label: 'Interior light', type: 'range', min: 0, max: 3, step: 0.05, default: 1, group: 'Interiors' },
      v => { this.env.power = v; });
    q.register({ key: 'glassGlow', label: 'Stained glass glow', type: 'range', min: 0, max: 3, step: 0.05, default: 1, group: 'Interiors' },
      v => { this.env.glow = v; });
    q.register({ key: 'sunShaft', label: 'Sun shaft through glass', type: 'range', min: 0, max: 1.5, step: 0.05, default: 0.45, group: 'Interiors' },
      v => { this.env.shaft = v; });
    q.register({ key: 'doorSnap', label: 'Jump inside door #', type: 'range', min: -1, max: 40, step: 1, default: -1, group: 'Interiors' },
      v => { this.snapTo = v | 0; });
    q.register({ key: 'autoStair', label: 'Auto-walk the stairs', type: 'toggle', default: true, group: 'Interiors' },
      v => { this.climb.enabled = !!v; if (!v) this.climb.stop(); });
    q.register({ key: 'stairPace', label: 'Stair walk speed', type: 'range', min: 0.8, max: 4, step: 0.1, default: 2.2, group: 'Interiors' },
      v => { this.climb.pace = v; });
  }

  // Skips the walk and drops the player inside, for renders and tests. -1 does nothing.
  jump(i) {
    const d = this.doors[i % this.doors.length];
    if (!d) return false;
    const P = this.player;
    P.pos.copy(d.pos).addScaledVector(d.n, OUT);
    this.begin(d, 'entering');
    this.u = 0.999;
    this.run(0.05, P);
    P.camYaw = this.faceYaw;
    P.camPitch = 0.18;
    P.started = false;
    return true;
  }

  // Doors are read off the builders' own groups: endBatch() re-homes their geometry but leaves
  // each group in place with its transform and userData, which is exactly the handle needed.
  refresh() {
    const doc = this.demo.builder.doc;
    this.rev = doc.rev | 0;
    this.colliders.rebuild(doc);
    this.demo.builder.object3D.updateMatrixWorld(true);
    this.doors = [];
    this.demo.builder.object3D.traverse(o => {
      const u = o.userData;
      if (!u || u.kind !== 'house' || !u.door) return;
      const m = o.matrixWorld.clone();
      const n = new THREE.Vector3(0, 0, 1).transformDirection(m).setY(0).normalize();
      this.doors.push({
        id: u.sceneId | 0, zoneId: u.zoneId, house: u, m, n,
        pos: new THREE.Vector3(0, u.door.floor, u.door.z).applyMatrix4(m),
        yaw: Math.atan2(n.x, n.z),
        swing: 0,
      });
    });
    this.buildLeaves();
  }

  // Every door leaf in the world is one instance of one box per zone. The alternative is a mesh
  // per house for the sake of the one door that is ever moving.
  buildLeaves() {
    for (const mesh of this.leaves.values()) { mesh.geometry.dispose(); mesh.dispose(); this.object3D.remove(mesh); }
    this.leaves.clear();
    const byZone = new Map();
    for (const d of this.doors) {
      if (!byZone.has(d.zoneId)) byZone.set(d.zoneId, []);
      d.slot = byZone.get(d.zoneId).length;
      byZone.get(d.zoneId).push(d);
    }
    for (const [zoneId, list] of byZone) {
      const { leafW, leafH } = list[0].house.door;
      const mesh = new THREE.InstancedMesh(leafGeo(leafW, leafH), getMaterial(zoneId, 'wood'), list.length);
      mesh.name = `doorLeaves:${zoneId}`;
      // A shadow-casting instanced mesh is a second draw call per zone, and the leaf lives inside
      // a reveal the wall already shadows. Three draw calls is 2% of the whole scene budget.
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.frustumCulled = true;
      mesh.userData.gw = leafW;
      mesh.userData.gh = leafH;
      this.leaves.set(zoneId, mesh);
      this.object3D.add(mesh);
      for (const d of list) this.placeLeaf(d);
      mesh.computeBoundingSphere();
    }
  }

  placeLeaf(d) {
    const mesh = this.leaves.get(d.zoneId);
    if (!mesh) return;
    const { leafW, leafH, leafY, leafZ } = d.house.door;
    _m.makeRotationY(d.swing);
    _m.scale(_s.set(leafW / mesh.userData.gw, leafH / mesh.userData.gh, 1));
    _hinge.makeTranslation(-leafW / 2, leafY, leafZ).multiply(_m);
    mesh.setMatrixAt(d.slot, _hinge.premultiply(d.m));
    mesh.instanceMatrix.needsUpdate = true;
  }

  nearest(p) {
    let best = null, bd = this.radius * this.radius;
    const inside = this.state === 'in';
    for (const d of this.doors) {
      const s = inside ? -IN : OUT;
      const dx = d.pos.x + d.n.x * s - p.x, dz = d.pos.z + d.n.z * s - p.z;
      const dy = d.pos.y - p.y;
      const q = dx * dx + dz * dz;
      // Outdoors the slack absorbs the ground falling away from the step; indoors it must not,
      // or standing on the loft directly over the door walks you out of the house.
      if (q > bd || Math.abs(dy) > (inside ? 1.2 : 3.5)) continue;
      if (inside && d !== this.active) continue;
      bd = q; best = d;
    }
    return best;
  }

  update(dt, app) {
    const P = this.player;
    this.env.t += dt;
    this.cool = Math.max(0, this.cool - dt);

    if (!P.enabled || P.free) {
      if (this.state !== 'out') this.abort();
      return;
    }
    if (this.rev !== (this.demo.builder.doc.rev | 0)) this.refresh();
    if (this.snapTo >= 0 && this.state === 'out') { const i = this.snapTo; this.snapTo = -1; this.jump(i); }

    if (this.releasing) this.release(P, dt);
    if (this.state === 'out') this.watchOutside(P);
    else if (this.state === 'in') {
      P.indoor = 1;
      this.since += dt;
      if (!this.climb.update(dt, P) && !this.climb.atLanding(P)) this.watchInside(P);
    }
    else this.run(dt, P);

    if (this.interior) {
      this.interior.update(this.sunLocal(), this.env);
      // The whole outdoor world is behind a closed shell once you are in — 495k triangles that
      // cannot contribute a pixel. It comes back the moment the exit starts.
      const hide = this.state === 'in';
      if (hide !== this.hidden) this.setHidden(hide);
    }
  }

  watchOutside(P) {
    if (!this.enabled || this.cool > 0) return;
    const d = this.nearest(P.pos);
    if (!d) return;
    // Facing matters, or walking past a front door drags you into the house.
    const v = Math.hypot(P.vel.x, P.vel.z);
    const toward = v > 0.6 ? -(P.vel.x * d.n.x + P.vel.z * d.n.z) / v : 0;
    if (toward < 0.25) return;
    this.begin(d, 'entering');
  }

  watchInside(P) {
    if (this.since < 0.6 || this.cool > 0) return;
    if (!this.nearest(P.pos)) return;
    const v = Math.hypot(P.vel.x, P.vel.z);
    const toward = v > 0.4 ? (P.vel.x * this.active.n.x + P.vel.z * this.active.n.z) / v : 0;
    if (toward < 0.25) return;
    this.begin(this.active, 'leaving');
  }

  begin(d, state) {
    const P = this.player;
    this.climb.stop();
    this.active = d;
    this.state = state;
    this.u = 0;
    this.since = 0;
    const enter = state === 'entering';
    const gy = this.demo.terrain.surfaceY(d.pos.x + d.n.x * OUT, d.pos.z + d.n.z * OUT);
    const outer = new THREE.Vector3(d.pos.x + d.n.x * OUT, gy, d.pos.z + d.n.z * OUT);
    const thresh = new THREE.Vector3(d.pos.x, d.pos.y, d.pos.z);
    const inner = new THREE.Vector3(d.pos.x - d.n.x * IN, d.pos.y, d.pos.z - d.n.z * IN);
    this.way = enter ? [P.pos.clone(), outer, thresh, inner] : [P.pos.clone(), inner, thresh, outer];
    this.faceYaw = enter ? wrapPi(d.yaw + Math.PI) : d.yaw;

    if (enter) this.open(d.zoneId);
    this.releasing = null;
    P.driven = true;
    P.snap = true;
    P.confine = null;
    P.walkSpeed = 2.4;
    this.colliders.extra.length = 0;
    this.colliders.interiorOnly = false;
  }

  // The house you are walking through must not clip the arm while the camera is in its doorway,
  // and on the way out it must stay ignored until the camera itself is clear of the wall —
  // releasing it a frame early snaps the camera onto the head.
  skipRule(P) {
    const d = this.active;
    if (!d) return 0;
    if (this.state === 'entering') return this.u > 0.42 ? d.id : 0;
    if (this.state === 'in') return d.id;
    return this.colliders.inside(d.id, P.camPos.x, P.camPos.y, P.camPos.z, 0.35) ? d.id : 0;
  }

  run(dt, P) {
    const d = this.active;
    this.u = Math.min(1, this.u + dt / Math.max(0.2, this.secs));
    const u = this.u;
    const enter = this.state === 'entering';

    let seg = 0;
    while (seg < 2 && u > SEG[seg + 1]) seg++;
    P.pos.lerpVectors(this.way[seg], this.way[seg + 1], smooth(SEG[seg], SEG[seg + 1], u));
    P.vel.set(0, 0, 0);
    P.walkSpeed = u < 0.98 ? 2.4 : 0;

    P.yaw += wrapPi(this.faceYaw - P.yaw) * (1 - Math.exp(-9 * dt));
    P.camYaw += wrapPi(this.faceYaw - P.camYaw) * (1 - Math.exp(-6 * dt));
    // On the way out the arm stays short for the whole walk — release() lets it grow only once
    // the camera has real room, or it reaches its full length while still in the doorway.
    P.indoor = enter ? smooth(0.4, 0.88, u) : 1;
    P.floorY = null;
    this.colliders.skip = this.skipRule(P);

    d.swing = OPEN * (smooth(0.16, 0.4, u) - smooth(0.7, 0.94, u));
    this.placeLeaf(d);

    if (u < 1) return;

    d.swing = 0;
    this.placeLeaf(d);
    P.driven = false;
    P.snap = false;
    this.cool = 0.5;
    this.since = 0;
    if (enter) {
      this.state = 'in';
      P.indoor = 1;
      P.floorY = this.floor;
      P.pos.y = this.floor(P.pos.x, P.pos.z, P.pos.y);
      this.confineTo(d);
      this.wallColliders(d);
      this.colliders.interiorOnly = true;
    } else {
      this.state = 'out';
      P.confine = null;
      this.colliders.extra.length = 0;
      this.colliders.interiorOnly = false;
      // The camera trails the player, so at the instant the walk ends it can still be in the
      // doorway. Handing the house back to the collider set now would find the camera inside a
      // box and snap it onto the head; the room has to stay standing until it is genuinely out.
      this.releasing = d;
    }
  }

  // The house stays in the collider set here, so the arm is pushed off the wall rather than
  // reaching through it. Growing it back is gated on the camera actually being out of the box,
  // which is self-correcting: if growing puts it back inside, the next frame holds it again.
  release(P, dt) {
    const d = this.releasing;
    this.colliders.skip = 0;
    this.held = (this.held || 0) + dt;
    const blocked = this.colliders.inside(d.id, P.camPos.x, P.camPos.y, P.camPos.z, 0.3);
    P.indoor += ((blocked ? 1 : 0) - P.indoor) * (1 - Math.exp(-3.5 * dt));
    if (this.held < 4 && (blocked || P.indoor > 0.04)) return;
    P.indoor = 0;
    this.held = 0;
    this.releasing = null;
    this.close();
  }

  abort() {
    const P = this.player;
    if (this.active) { this.active.swing = 0; this.placeLeaf(this.active); }
    P.driven = false; P.snap = false; P.indoor = 0; P.floorY = null; P.confine = null;
    this.colliders.skip = 0;
    this.colliders.extra.length = 0;
    this.colliders.interiorOnly = false;
    this.releasing = null;
    this.state = 'out';
    this.close();
  }

  open(zoneId) {
    this.close();
    const d = this.active;
    this.interior = new Interior(zoneId, d.house);
    this.interior.object3D.applyMatrix4(d.m);
    this.object3D.add(this.interior.object3D);
    // The room is built in the house's own frame, so a world query has to go back into it and the
    // answer come back out. Both floors and the stair between them live behind this one call.
    const I = this.interior;
    const ox = d.m.elements[12], oy = d.m.elements[13], oz = d.m.elements[14];
    const cs = d.n.z, sn = d.n.x;
    this.floor = (x, z, y) => {
      const dx = x - ox, dz = z - oz;
      return oy + I.floorLocal(dx * cs - dz * sn, dx * sn + dz * cs, y - oy);
    };
    this.climb.bind(d, I);
  }

  setHidden(v) {
    for (const o of this.hideList) o.visible = !v;
    this.hidden = v;
  }

  close() {
    this.climb.clear();
    if (this.hidden) this.setHidden(false);
    if (!this.interior) return;
    this.object3D.remove(this.interior.object3D);
    this.interior.dispose();
    this.interior = null;
  }

  confineTo(d) {
    const I = this.interior;
    const { rx, rz } = I.bounds;
    const cs = d.n.z, sn = d.n.x;
    const ox = d.m.elements[12], oy = d.m.elements[13], oz = d.m.elements[14];
    this.player.confine = p => {
      const dx = p.x - ox, dz = p.z - oz;
      _l.x = THREE.MathUtils.clamp(dx * cs - dz * sn, -rx, rx);
      _l.z = THREE.MathUtils.clamp(dx * sn + dz * cs, -rz, rz);
      I.blockLocal(_l, p.y - oy);
      p.x = ox + _l.x * cs + _l.z * sn;
      p.z = oz - _l.x * sn + _l.z * cs;
    };
  }

  wallColliders(d) {
    const I = this.interior;
    const ox = d.m.elements[12], oz = d.m.elements[14], oy = d.m.elements[13];
    const cs = d.n.z, sn = d.n.x;
    const y0 = oy + I.fy, y1 = oy + I.top + 0.3;
    const th = 0.12;
    this.colliders.extra = [
      wallBox(0, -I.rz - th, I.rx + th, th, y0, y1, cs, sn, ox, oz),
      wallBox(0, I.rz + th, I.rx + th, th, y0, y1, cs, sn, ox, oz),
      wallBox(I.rx + th, 0, th, I.rz + th, y0, y1, cs, sn, ox, oz),
      wallBox(-I.rx - th, 0, th, I.rz + th, y0, y1, cs, sn, ox, oz),
    ];
  }

  // The sun direction in the active house's own frame, which is the frame the room is built in.
  sunLocal() {
    const k = this.lighting?.keyDir;
    if (!k || !this.active) return _sun.set(0, 1, 0);
    const cs = this.active.n.z, sn = this.active.n.x;
    _sun.set(k.x * cs - k.z * sn, k.y, k.x * sn + k.z * cs);
    this.env.day = this.lighting.night !== undefined ? 1 - this.lighting.night : 1;
    if (this.lighting.key) this.env.sunColor.copy(this.lighting.key.color);
    return _sun;
  }

  // Test hook: drives a full entry (or exit) without touching input.
  trigger(index = 0) {
    if (this.state !== 'out' && this.state !== 'in') return false;
    const d = this.state === 'in' ? this.active : this.doors[index];
    if (!d) return false;
    this.begin(d, this.state === 'in' ? 'leaving' : 'entering');
    return true;
  }

  // Test hook: drives a climb without input.
  triggerStair(up = true) {
    return this.state === 'in' && this.climb.force(up, this.player);
  }

  report() {
    const I = this.interior;
    return {
      state: this.state, u: +this.u.toFixed(3), doors: this.doors.length,
      indoor: +this.player.indoor.toFixed(3),
      arm: +this.player.camPos.distanceTo(this.player.camAim).toFixed(3),
      tris: I ? I.tris : 0,
      loft: !!I?.loft, level: I?.level, climb: this.climb.report(),
    };
  }
}

const _m = new THREE.Matrix4(), _hinge = new THREE.Matrix4(), _s = new THREE.Vector3();
const _sun = new THREE.Vector3();
const _l = { x: 0, z: 0 };

// Hinge edge at local x = 0, so the instance matrix is a plain rotation about it.
function leafGeo(w, h) {
  const g = new THREE.BoxGeometry(w, h, 0.09);
  g.translate(w / 2, 0, 0);
  const strap = new THREE.BoxGeometry(w * 0.55, 0.09, 0.12);
  strap.translate(w * 0.3, 0, 0.05);
  const s2 = strap.clone();
  strap.translate(0, h * 0.3, 0);
  s2.translate(0, -h * 0.3, 0);
  const knob = new THREE.SphereGeometry(0.055, 6, 5);
  knob.translate(w * 0.86, 0, 0.09);
  return mergeAll([g, strap, s2, knob]);
}

function mergeAll(list) {
  const out = list[0];
  for (let i = 1; i < list.length; i++) {
    const src = list[i];
    merge(out, src);
    src.dispose();
  }
  return out;
}

// BufferGeometryUtils would do this, but every part here is an indexed BoxGeometry-alike with
// the same attribute set, so a straight concat is smaller than pulling the util in.
function merge(dst, src) {
  const grow = (name, size) => {
    const a = dst.attributes[name], b = src.attributes[name];
    const arr = new Float32Array(a.count * size + b.count * size);
    arr.set(a.array); arr.set(b.array, a.count * size);
    return new THREE.Float32BufferAttribute(arr, size);
  };
  const base = dst.attributes.position.count;
  const pos = grow('position', 3), nrm = grow('normal', 3), uv = grow('uv', 2);
  const idx = [];
  for (const v of dst.index.array) idx.push(v);
  for (const v of src.index.array) idx.push(v + base);
  dst.setAttribute('position', pos);
  dst.setAttribute('normal', nrm);
  dst.setAttribute('uv', uv);
  dst.setIndex(idx);
  return dst;
}
