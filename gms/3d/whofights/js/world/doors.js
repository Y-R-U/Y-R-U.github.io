// Doors, the scripted walk through one, and the interior that only exists while you are inside.
// Owns the collider set the player's camera arm rays against.

import * as THREE from 'three';
import { getMaterial } from './materials.js';
import { Colliders, wallBox } from './colliders.js';
import { Interior } from './interior.js';
import { Climb } from './climb.js';
import { gableRise } from './stairs.js';
import { lidBands } from './gablelid.js';
import { pathEase, pathSpeed } from './doorpath.js';
import { stalePeek, idleDoorState } from './doorstate.js';

const OUT = 3.10;     // where you are taken to before the door opens
const IN = 2.35;      // where you end up on the other side
const OPEN = 1.85;    // radians the leaf swings

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
    // Halls only: their doors stand open, so the room has to exist before anyone walks in — you
    // can see straight into it from the road. Built once and kept, rather than on entry.
    this.standing = new Map();
    this.state = 'out';
    this.u = 0;
    this.active = null;
    this.interior = null;
    this.climb = new Climb(player);
    this.cool = 0;
    this.since = 0;
    this.radius = 2.25;
    this.secs = 1.9;
    this.lidDrop = 0.20;
    this.enabled = true;
    this.env = { power: 1, glow: 1, shaft: 0.45, day: 1, sunColor: new THREE.Color(1, 1, 1), t: 0 };
    this.refresh();
  }

  registerKnobs(q) {
    q.register({ key: 'doors', label: 'Doors enterable', type: 'toggle', default: true, group: 'Interiors' },
      v => { this.enabled = !!v; this.object3D.visible = !!v; if (!v && this.state !== 'out') this.abort(); });
    q.register({ key: 'doorRadius', label: 'Door hotspot radius', type: 'range', min: 0.9, max: 5.25, step: 0.1, default: 2.25, group: 'Interiors' },
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
    // Not rebuilt mid-climb: the climb drops heightIn to 1.55 and the steps are placed off it, so
    // a rebuild there would leave boxes the eye is inside of once the climb restores it.
    q.register({ key: 'lidDrop', label: 'Loft ceiling step (m)', type: 'range', min: 0.05, max: 0.6, step: 0.05, default: 0.20, group: 'Interiors' },
      v => { this.lidDrop = v; if (this.state === 'in' && !this.climb.running) this.wallColliders(this.active); });
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
    // Every building is built twice — once into the block's detail set and once into its proxy
    // set, only one of which is visible — so a plain traverse finds each front door twice. Two
    // door records means two standing interiors in the same room, which z-fights and double-lights.
    const seen = new Set();
    this.demo.builder.object3D.traverse(o => {
      const u = o.userData;
      if (!u || u.kind !== 'house' || !u.door) return;
      if (seen.has(u.sceneId | 0)) return;
      seen.add(u.sceneId | 0);
      const m = o.matrixWorld.clone();
      const n = new THREE.Vector3(0, 0, 1).transformDirection(m).setY(0).normalize();
      this.doors.push({
        id: u.sceneId | 0, zoneId: u.zoneId, house: u, m, n, open: !!u.door.open,
        pos: new THREE.Vector3(0, u.door.floor, u.door.z).applyMatrix4(m),
        yaw: Math.atan2(n.x, n.z),
        swing: 0,
      });
    });
    this.buildLeaves();
    this.buildStanding();
  }

  buildStanding() {
    for (const I of this.standing.values()) { this.object3D.remove(I.object3D); I.dispose(); }
    this.standing.clear();
    const walk = [];
    for (const d of this.doors) {
      if (!d.house.hall) continue;
      const I = this.makeInterior(d);
      this.standing.set(d.id, I);
      // A standing room is always there, so its furniture belongs in the walk world permanently —
      // which is how the crowd bumps into a table without knowing an interior exists.
      const oy = d.m.elements[13];
      for (const b of I.solids) walk.push(walkBox(b, oy, d));
    }
    this.colliders.setWalkExtra(walk);
  }

  // Every door leaf in the world is one instance of one box per zone. The alternative is a mesh
  // per house for the sake of the one door that is ever moving.
  buildLeaves() {
    for (const mesh of this.leaves.values()) { mesh.geometry.dispose(); mesh.dispose(); this.object3D.remove(mesh); }
    this.leaves.clear();
    const byZone = new Map();
    for (const d of this.doors) {
      // A hall's doors are drawn open as part of the building; there is no leaf to swing.
      if (d.open) continue;
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
    if (d.open) return;
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
      if (q > bd || Math.abs(dy) > (inside ? 1.80 : 5.25)) continue;
      if (inside && d !== this.active) continue;
      bd = q; best = d;
    }
    return best;
  }

  // Render hook: stands a house's interior up and hides the world, with no player involved, so a
  // scenario can look inside a room under ?shot= where nothing in the game layer exists.
  peek(index = 0) {
    const d = this.doors[index];
    if (!d) return false;
    this.active = d;
    this.state = 'in';
    this.peeking = true;
    this.open(d.zoneId);
    this.setHidden(!d.house.hall);
    return true;
  }

  update(dt, app) {
    const P = this.player;
    // Before any early return below, or the field stays where the last frame left it for good.
    if (stalePeek(this.peeking, P.enabled, P.free)) this.unpeek();
    const idle = idleDoorState(this.state, this.releasing);
    if (idle) Object.assign(P, idle);
    this.env.t += dt;
    // Standing rooms are lit whether or not anyone is in them — you can see into them from the
    // road, so they have to keep up with the hour even when nothing else about them is running.
    for (const [id, I] of this.standing) {
      I.update(this.sunFor(this.doors.find(d => d.id === id)), this.env);
    }
    if (this.peeking) { if (!this.standing.has(this.active?.id)) this.interior?.update(this.sunLocal(), this.env); return; }
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
    else {
      this.guard -= dt;
      // A throw here would leave the player driven for good, which is a reload to recover from.
      try { this.run(dt, P); } catch (e) { console.warn(`doors: transition failed — ${e.message}`); this.abort(); }
      if (this.guard <= 0 && this.state !== 'in' && this.state !== 'out') this.abort();
    }

    if (this.interior) {
      this.interior.update(this.sunLocal(), this.env);
      // The whole outdoor world is behind a closed shell once you are in — triangles that cannot
      // contribute a pixel. It comes back the moment the exit starts. A hall is the exception:
      // its doors stand open, so hiding the world would put a void in the doorway.
      const hide = this.state === 'in' && !this.active?.house?.hall;
      if (hide !== this.hidden) this.setHidden(hide);
    }
  }

  watchOutside(P) {
    // The room is still standing while the arm grows back after an exit; walking into the door
    // again in that window turns a held stick into an in-out-in loop.
    if (!this.enabled || this.cool > 0 || this.releasing) return;
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
    this.legs = this.way.slice(1).map((p, i) => p.distanceTo(this.way[i]));
    this.pathLen = this.legs.reduce((a, v) => a + v, 0);
    this.ease0 = this.pathLen > 0.05 ? Math.hypot(P.vel.x, P.vel.z) * this.secs / this.pathLen : 0;
    // Nothing else can strand a driven player: if the script stops advancing for any reason the
    // guard runs out and abort() hands him back.
    this.guard = this.secs * 3 + 2;

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

    let i = 0, acc = 0;
    const s = pathEase(u, this.ease0) * this.pathLen;
    while (i < this.legs.length - 1 && acc + this.legs[i] < s) acc += this.legs[i++];
    P.pos.lerpVectors(this.way[i], this.way[i + 1], this.legs[i] > 1e-4 ? Math.min(1, (s - acc) / this.legs[i]) : 1);
    P.vel.set(0, 0, 0);
    P.walkSpeed = Math.min(6, pathSpeed(u, this.ease0) * this.pathLen / Math.max(0.2, this.secs));

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

  // Handing a peek back is an abort with the flag cleared first, so the next frame runs the state
  // machine rather than sitting out again.
  unpeek() {
    this.peeking = false;
    this.abort();
  }

  abort() {
    const P = this.player;
    if (this.active) { this.active.swing = 0; this.placeLeaf(this.active); }
    P.driven = false; P.snap = false; P.indoor = 0; P.floorY = null; P.confine = null;
    this.colliders.skip = 0;
    this.colliders.extra.length = 0;
    this.colliders.interiorOnly = false;
    this.releasing = null;
    // Carried into the next exit otherwise, where it spends its 4 s escape hatch on the first frame.
    this.held = 0;
    this.state = 'out';
    this.close();
  }

  makeInterior(d) {
    const I = new Interior(d.zoneId, d.house, { hall: !!d.house.hall, boards: this.boardsFor(d) });
    I.object3D.applyMatrix4(d.m);
    this.object3D.add(I.object3D);
    return I;
  }

  open(zoneId) {
    this.close();
    const d = this.active;
    this.interior = this.standing.get(d.id) || this.makeInterior(d);
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

  // Scene objects flagged `inside: <houseId>` belong to this room, not to the world. They are
  // authored in world coordinates, so they come back into the house's own frame here.
  boardsFor(d) {
    const list = this.demo.builder?.insideOf?.(d.id) || [];
    if (!list.length) return [];
    const ox = d.m.elements[12], oz = d.m.elements[14];
    const cs = d.n.z, sn = d.n.x;
    return list.filter(o => o.type === 'billboard').map(o => {
      const dx = o.x - ox, dz = o.z - oz;
      return { x: dx * cs - dz * sn, z: dx * sn + dz * cs, ry: (o.ry || 0) - d.yaw, zone: o.zone, p: o.p };
    });
  }

  setHidden(v) {
    for (const o of this.hideList) o.visible = !v;
    this.hidden = v;
  }

  close() {
    this.climb.clear();
    if (this.hidden) this.setHidden(false);
    if (!this.interior) return;
    // A standing room outlives the visit: it is what you see through the open doors from outside.
    if (!this.standing.has(this.active?.id)) {
      this.object3D.remove(this.interior.object3D);
      this.interior.dispose();
    }
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
      I.blockLocal(_l, p.y - oy, this.player.walkRadius);
      p.x = ox + _l.x * cs + _l.z * sn;
      p.z = oz - _l.x * sn + _l.z * cs;
    };
  }

  wallColliders(d) {
    const I = this.interior;
    const ox = d.m.elements[12], oz = d.m.elements[14], oy = d.m.elements[13];
    const cs = d.n.z, sn = d.n.x;
    const y0 = oy + I.fy, y1 = oy + I.top + 0.45;
    const th = 0.18;
    this.colliders.extra = [
      wallBox(0, -I.rz - th, I.rx + th, th, y0, y1, cs, sn, ox, oz),
      wallBox(0, I.rz + th, I.rx + th, th, y0, y1, cs, sn, ox, oz),
      wallBox(I.rx + th, 0, th, I.rz + th, y0, y1, cs, sn, ox, oz),
      wallBox(-I.rx - th, 0, th, I.rz + th, y0, y1, cs, sn, ox, oz),
      ...this.lidBoxes(I, oy, y1, th, cs, sn, ox, oz),
    ];
  }

  // The shell has a lid too. At max indoor pitch the eye plus its radius reaches 3.32 m above the
  // floor and the smallest room is 3.40 m, so without one the camera leaves through the boards on
  // any room near the minimum.
  //
  // Over a loft that lid is a gable, not a slab: stairs.js drops it to `ceil2 − gableRise` at the
  // eaves, 1.90 m in the lowest one, so a single box at the ridge is up to 1.28 m above the
  // ceiling the player can see and the arm sails straight through it. gablelid.js's bands follow
  // the slope, and go *under* the flat lid rather than instead of it — the band past where they
  // stop would otherwise lose the one lid it had.
  lidBoxes(I, oy, y1, th, cs, sn, ox, oz) {
    const out = [wallBox(0, 0, I.rx + th, I.rz + th, oy + I.top, oy + I.top + 0.3, cs, sn, ox, oz)];
    if (!I.loft) return out;
    const alongX = I.rx >= I.rz, run = Math.max(I.rx, I.rz) + th;
    const P = this.player;
    const bands = lidBands(I.roomH2, gableRise(I), Math.min(I.rx, I.rz), th,
      P.heightIn, P.camRadius, this.lidDrop);
    for (const { u0, u1, lid } of bands) {
      const y0 = oy + I.deck + lid;
      if (!u0) { out.push(wallBox(0, 0, alongX ? run : u1, alongX ? u1 : run, y0, y1, cs, sn, ox, oz)); continue; }
      const c = (u0 + u1) / 2, h = (u1 - u0) / 2;
      for (const s of [-1, 1]) {
        out.push(wallBox(alongX ? 0 : s * c, alongX ? s * c : 0,
          alongX ? run : h, alongX ? h : run, y0, y1, cs, sn, ox, oz));
      }
    }
    return out;
  }

  sunLocal() { return this.sunFor(this.active); }

  // The sun direction in that house's own frame, which is the frame its room is built in.
  sunFor(door) {
    const k = this.lighting?.keyDir;
    if (!k || !door) return _sun.set(0, 1, 0);
    const cs = door.n.z, sn = door.n.x;
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

// A room-local solid as a walk-world box. `rise` 0 makes it a wall rather than a step-up: a hall
// table is something to walk round, not something to climb onto.
function walkBox(b, oy, d) {
  const cs = d.n.z, sn = d.n.x;
  const ry = Math.atan2(sn, cs) + Math.atan2(b.s, b.c);
  return {
    x: d.m.elements[12] + b.x * cs + b.z * sn,
    z: d.m.elements[14] - b.x * sn + b.z * cs,
    hw: b.hw, hd: b.hd, c: Math.cos(ry), s: Math.sin(ry),
    base: oy, top: oy + b.top, rise: 0, id: 0,
  };
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
