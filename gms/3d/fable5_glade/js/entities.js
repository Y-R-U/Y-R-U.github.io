// Characters: chunky RuneScape-style hero (tap-to-move), villager NPC with
// waypoint patrol + wave greeting, wandering/pecking chickens, butterflies.

import * as THREE from 'three';
import { CFG, SITES } from './config.js';
import { rand, pick, clamp, lerpAngle, damp, M, mesh, makeNameSprite } from './utils.js';
import { register } from './registry.js';
import { groundHeight } from './world.js';

const SKIN = 0xe0b48a;

// ───────── humanoid factory ─────────

function makeHumanoid(o) {
  const g = new THREE.Group();
  const parts = {};

  if (o.robe) {
    g.add(mesh(new THREE.CylinderGeometry(0.27, 0.42, 0.95, 10), M(o.robe), 0, 0.48, 0));
  } else {
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.12, 0.55, 0);
      pivot.add(mesh(new THREE.BoxGeometry(0.17, 0.5, 0.2), M(o.pants), 0, -0.26, 0));
      pivot.add(mesh(new THREE.BoxGeometry(0.19, 0.15, 0.27), M(o.boots), 0, -0.48, 0.02));
      g.add(pivot);
      parts[side < 0 ? 'lLeg' : 'rLeg'] = pivot;
    }
  }

  const torso = mesh(new THREE.BoxGeometry(0.46, 0.55, 0.28), M(o.tunic), 0, 0.85, 0);
  g.add(torso);
  parts.torso = torso;
  if (!o.robe) {
    g.add(mesh(new THREE.BoxGeometry(0.5, 0.09, 0.32), M(0x4a3320), 0, 0.62, 0));
    g.add(mesh(new THREE.BoxGeometry(0.1, 0.11, 0.06), M(0xcaa34a, { metalness: 0.6, roughness: 0.4 }), 0, 0.62, 0.16));
  }
  if (o.apron) g.add(mesh(new THREE.BoxGeometry(0.3, 0.55, 0.03), M(o.apron), 0, 0.72, 0.16));

  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.31, 1.07, 0);
    pivot.add(mesh(new THREE.BoxGeometry(0.13, 0.46, 0.16), M(o.sleeves), 0, -0.2, 0));
    pivot.add(mesh(new THREE.BoxGeometry(0.12, 0.11, 0.14), M(SKIN), 0, -0.48, 0));
    if (o.pads) pivot.add(mesh(new THREE.BoxGeometry(0.2, 0.1, 0.22), M(0x8a8f98, { metalness: 0.6, roughness: 0.4 }), 0, 0.02, 0));
    g.add(pivot);
    parts[side < 0 ? 'lArm' : 'rArm'] = pivot;
  }

  const head = new THREE.Group();
  head.position.y = 1.2;
  head.add(mesh(new THREE.BoxGeometry(0.32, 0.34, 0.3), M(SKIN), 0, 0.15, 0));
  for (const side of [-1, 1])
    head.add(mesh(new THREE.BoxGeometry(0.05, 0.06, 0.02), M(0x2a2118), side * 0.075, 0.18, 0.151, false));
  head.add(mesh(new THREE.BoxGeometry(0.08, 0.022, 0.02), M(0x8a5a48), 0, 0.05, 0.151, false));
  if (o.hair) {
    head.add(mesh(new THREE.BoxGeometry(0.36, 0.1, 0.34), M(o.hair), 0, 0.33, 0));
    head.add(mesh(new THREE.BoxGeometry(0.36, 0.2, 0.08), M(o.hair), 0, 0.22, -0.13));
  }
  if (o.beard) {
    head.add(mesh(new THREE.BoxGeometry(0.26, 0.18, 0.08), M(o.beard), 0, -0.02, 0.12));
  }
  if (o.hat === 'straw') {
    head.add(mesh(new THREE.CylinderGeometry(0.36, 0.38, 0.04, 12), M(0xd4b86a), 0, 0.34, 0));
    head.add(mesh(new THREE.ConeGeometry(0.18, 0.2, 10), M(0xc9ab5c), 0, 0.45, 0));
  }
  g.add(head);
  parts.head = head;

  if (o.backSword) {
    const sw = new THREE.Group();
    sw.position.set(-0.12, 1.0, -0.18);
    sw.rotation.z = 0.45;
    sw.add(mesh(new THREE.BoxGeometry(0.1, 0.72, 0.05), M(0x4a3320)));
    sw.add(mesh(new THREE.BoxGeometry(0.22, 0.05, 0.06), M(0xcaa34a, { metalness: 0.6, roughness: 0.4 }), 0, 0.4, 0));
    sw.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.16, 6), M(0x2e2118), 0, 0.5, 0));
    sw.add(mesh(new THREE.SphereGeometry(0.04, 6, 5), M(0xcaa34a), 0, 0.6, 0));
    g.add(sw);
  }

  g.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });

  return {
    group: g, parts,
    // walk ∈ 0..1 blends between idle and full stride
    animate(t, walk) {
      const swing = Math.sin(t * 9) * 0.65 * walk;
      if (parts.lLeg) { parts.lLeg.rotation.x = swing; parts.rLeg.rotation.x = -swing; }
      parts.lArm.rotation.x = -swing * 0.8 + Math.sin(t * 1.8) * 0.04 * (1 - walk);
      parts.rArm.rotation.x = swing * 0.8 + Math.sin(t * 1.9 + 1) * 0.04 * (1 - walk);
      parts.torso.scale.x = 1 + Math.sin(t * 2.2) * 0.012 * (1 - walk);
      parts.head.rotation.y = Math.sin(t * 0.4) * 0.18 * (1 - walk);
      return Math.abs(Math.sin(t * 9)) * 0.05 * walk; // bob offset
    },
  };
}

// ───────── player ─────────

function createPlayer(scene) {
  const h = makeHumanoid({
    tunic: 0x3a6ea8, sleeves: 0x3a6ea8, pants: 0x5a4a3a, boots: 0x3a2d20,
    hair: 0x6a4a2a, pads: true, backSword: true,
  });
  const pos = new THREE.Vector3(0, groundHeight(0, 0), 0);
  h.group.position.copy(pos);
  scene.add(h.group);

  const entry = register({
    name: 'Hero (you)', category: 'Characters', icon: '🧝', object: h.group,
    collider: null, pickup: null, note: 'Tap-to-move, procedural walk cycle, shoulder pads + back sword',
  });

  const player = {
    group: h.group, pos, entry,
    target: null, yaw: 0, speed: 0,
    setTarget(p) { this.target = new THREE.Vector2(p.x, p.z); },
    tick(dt, t, keyDir) {
      const v = new THREE.Vector2();
      if (keyDir) { v.copy(keyDir).multiplyScalar(CFG.playerSpeed); this.target = null; }
      else if (this.target) {
        const to = new THREE.Vector2(this.target.x - pos.x, this.target.y - pos.z);
        const d = to.length();
        if (d < 0.12) this.target = null;
        else v.copy(to).normalize().multiplyScalar(Math.min(CFG.playerSpeed, d * 6));
      }
      const sp = v.length();
      this.speed = THREE.MathUtils.lerp(this.speed, sp, damp(10, dt));
      if (sp > 0.1) {
        pos.x += v.x * dt; pos.z += v.y * dt;
        this.yaw = lerpAngle(this.yaw, Math.atan2(v.x, v.y), damp(12, dt));
      }
      // keep inside the meadow
      const r = Math.hypot(pos.x, pos.z), maxR = CFG.playRadius - 0.8;
      if (r > maxR) { pos.x *= maxR / r; pos.z *= maxR / r; }

      const walk = clamp(this.speed / CFG.playerSpeed, 0, 1);
      const bob = h.animate(t, walk);
      pos.y = groundHeight(pos.x, pos.z);
      h.group.position.set(pos.x, pos.y + bob, pos.z);
      h.group.rotation.y = this.yaw;
    },
  };
  return player;
}

// ───────── villager NPC ─────────

function createNpc(scene, getPlayerPos) {
  const h = makeHumanoid({
    tunic: 0x7a5d3e, sleeves: 0x7a5d3e, robe: 0x7a5d3e, apron: 0xd8cdb4,
    beard: 0xb8b2a4, hat: 'straw',
  });
  h.group.add(makeNameSprite('Bram the Villager', 2.05));

  const H = SITES.house, W = SITES.well;
  const dir = new THREE.Vector2(-H.x, -H.z).normalize();
  const waypoints = [
    new THREE.Vector2(H.x + dir.x * 3.2, H.z + dir.y * 3.2),  // outside the door
    new THREE.Vector2(W.x + 1.5, W.z + 1.2),                  // by the well
    new THREE.Vector2(SITES.campfire.x - 1.8, SITES.campfire.z - 1.2),
  ];
  const pos = new THREE.Vector3(waypoints[0].x, 0, waypoints[0].y);
  scene.add(h.group);

  const npc = {
    group: h.group,
    wpIndex: 1, state: 'pause', stateT: rand(1, 3), yaw: 0, waveCooldown: 0,
    tick(dt, t) {
      this.stateT -= dt; this.waveCooldown -= dt;
      const pp = getPlayerPos();
      const dPlayer = Math.hypot(pp.x - pos.x, pp.z - pos.z);
      let walk = 0;

      if (this.state !== 'wave' && dPlayer < 3.2 && this.waveCooldown <= 0) {
        this.state = 'wave'; this.stateT = 2.4;
      }
      if (this.state === 'wave') {
        this.yaw = lerpAngle(this.yaw, Math.atan2(pp.x - pos.x, pp.z - pos.z), damp(8, dt));
        h.parts.rArm.rotation.z = THREE.MathUtils.lerp(h.parts.rArm.rotation.z, -2.5 + Math.sin(t * 9) * 0.25, damp(10, dt));
        if (this.stateT <= 0) { this.state = 'pause'; this.stateT = 1; this.waveCooldown = 6; }
      } else {
        h.parts.rArm.rotation.z = THREE.MathUtils.lerp(h.parts.rArm.rotation.z, 0, damp(8, dt));
        if (this.state === 'pause' && this.stateT <= 0) {
          this.state = 'walk';
          this.wpIndex = (this.wpIndex + 1) % waypoints.length;
        } else if (this.state === 'walk') {
          const wp = waypoints[this.wpIndex];
          const to = new THREE.Vector2(wp.x - pos.x, wp.y - pos.z);
          const d = to.length();
          if (d < 0.2) { this.state = 'pause'; this.stateT = rand(2.5, 6); }
          else {
            to.normalize();
            pos.x += to.x * 1.1 * dt; pos.z += to.y * 1.1 * dt;
            this.yaw = lerpAngle(this.yaw, Math.atan2(to.x, to.y), damp(8, dt));
            walk = 0.55;
          }
        }
      }
      const bob = h.animate(t, walk) + Math.sin(t * 7) * 0.015 * walk; // robe shuffle
      pos.y = groundHeight(pos.x, pos.z);
      h.group.position.set(pos.x, pos.y + bob, pos.z);
      h.group.rotation.y = this.yaw;
      h.group.rotation.z = Math.sin(t * 7) * 0.03 * walk;
    },
  };
  register({
    name: 'Bram the Villager', category: 'Characters', icon: '🧑‍🌾', object: h.group,
    collider: { r: 0.4 }, pickup: null, note: 'Robe + straw hat, patrols door/well/fire, waves when you come close',
  });
  return npc;
}

// ───────── chickens ─────────

function makeChickenMesh(tint) {
  const g = new THREE.Group();
  const feathers = M(tint, { roughness: 0.9 });
  const body = mesh(new THREE.SphereGeometry(0.22, 10, 8), feathers, 0, 0.3, 0);
  body.scale.set(1, 0.92, 1.3);
  g.add(body);
  for (const side of [-1, 1]) {
    const wing = mesh(new THREE.SphereGeometry(0.12, 8, 6), M(tint, { roughness: 1 }), side * 0.18, 0.32, -0.02);
    wing.scale.set(0.5, 0.8, 1.1);
    wing.material.color.offsetHSL(0, 0, -0.05);
    g.add(wing);
  }
  const tail = mesh(new THREE.ConeGeometry(0.1, 0.22, 6), feathers, 0, 0.42, -0.3);
  tail.rotation.x = -0.9; tail.scale.x = 0.5; g.add(tail);

  const headG = new THREE.Group();
  headG.position.set(0, 0.42, 0.2);
  headG.add(mesh(new THREE.SphereGeometry(0.11, 8, 7), feathers, 0, 0.12, 0.04));
  const beak = mesh(new THREE.ConeGeometry(0.045, 0.11, 6), M(0xe8923a), 0, 0.11, 0.15);
  beak.rotation.x = Math.PI / 2; headG.add(beak);
  headG.add(mesh(new THREE.BoxGeometry(0.035, 0.09, 0.09), M(0xd23b2e), 0, 0.23, 0.02));
  headG.add(mesh(new THREE.SphereGeometry(0.035, 6, 5), M(0xd23b2e), 0, 0.04, 0.12, false));
  for (const side of [-1, 1])
    headG.add(mesh(new THREE.SphereGeometry(0.02, 5, 4), M(0x1a1410), side * 0.085, 0.14, 0.07, false));
  g.add(headG);

  const legs = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(side * 0.08, 0.18, 0.02);
    leg.add(mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.18, 5), M(0xe8923a), 0, -0.09, 0, false));
    leg.add(mesh(new THREE.BoxGeometry(0.07, 0.02, 0.09), M(0xe8923a), 0, -0.18, 0.02, false));
    g.add(leg); legs.push(leg);
  }
  g.traverse(m => { if (m.isMesh && m.castShadow === undefined) m.castShadow = true; });
  body.castShadow = true;
  return { group: g, headG, legs, body };
}

function createChicken(scene, name, tint, getPlayerPos) {
  const c = makeChickenMesh(tint);
  const P = SITES.pen;
  const pos = new THREE.Vector3(P.x + rand(-1.5, 1.5), 0, P.z + rand(-1.5, 1.5));
  scene.add(c.group);

  const pickTarget = () => new THREE.Vector2(P.x + rand(-1.9, 1.9), P.z + rand(-1.9, 1.9));
  const chicken = {
    group: c.group,
    state: 'idle', stateT: rand(0.5, 2), target: pickTarget(), yaw: rand(0, 6), phase: rand(0, 9),
    tick(dt, t) {
      this.stateT -= dt;
      const tt = t + this.phase;
      const pp = getPlayerPos();
      const dPlayer = Math.hypot(pp.x - pos.x, pp.z - pos.z);
      if (dPlayer < 0.9 && this.state !== 'flee') {
        this.state = 'flee'; this.stateT = 1.2;
        const away = new THREE.Vector2(pos.x - pp.x, pos.z - pp.z).normalize().multiplyScalar(1.8);
        this.target = new THREE.Vector2(
          clamp(pos.x + away.x, P.x - 2, P.x + 2), clamp(pos.z + away.y, P.z - 2, P.z + 2));
      }
      let walk = 0;
      if (this.state === 'idle' && this.stateT <= 0) {
        this.state = pick(['walk', 'walk', 'peck']);
        this.stateT = this.state === 'peck' ? 1.1 : rand(2, 4);
        if (this.state === 'walk') this.target = pickTarget();
      } else if (this.state === 'peck') {
        c.headG.rotation.x = Math.max(0, Math.sin((1.1 - this.stateT) / 1.1 * Math.PI * 2)) * 1.0;
        if (this.stateT <= 0) { this.state = 'idle'; this.stateT = rand(0.5, 2.5); c.headG.rotation.x = 0; }
      }
      if (this.state === 'walk' || this.state === 'flee') {
        const speed = this.state === 'flee' ? 1.7 : 0.75;
        const to = new THREE.Vector2(this.target.x - pos.x, this.target.y - pos.z);
        const d = to.length();
        if (d < 0.15 || (this.state === 'flee' && this.stateT <= 0)) {
          this.state = 'idle'; this.stateT = rand(0.5, 2.5);
        } else {
          to.normalize();
          pos.x += to.x * speed * dt; pos.z += to.y * speed * dt;
          this.yaw = lerpAngle(this.yaw, Math.atan2(to.x, to.y), damp(10, dt));
          walk = speed;
        }
      }
      c.body.rotation.z = Math.sin(tt * 14) * 0.09 * walk;
      c.legs[0].rotation.x = Math.sin(tt * 14) * 0.8 * walk;
      c.legs[1].rotation.x = -Math.sin(tt * 14) * 0.8 * walk;
      if (this.state !== 'peck') c.headG.rotation.x = Math.abs(Math.sin(tt * 14)) * 0.12 * walk;
      pos.y = groundHeight(pos.x, pos.z);
      c.group.position.set(pos.x, pos.y + Math.abs(Math.sin(tt * 14)) * 0.025 * walk, pos.z);
      c.group.rotation.y = this.yaw;
    },
  };
  register({
    name, category: 'Animals', icon: '🐔', object: c.group,
    collider: null, pickup: null, note: 'Wander/peck/flee state machine inside the pen',
  });
  return chicken;
}

// ───────── butterflies ─────────

function createButterflies(scene) {
  const colours = [0xfff7e0, 0xffd95e, 0xcaa3e8];
  const group = new THREE.Group();
  const flies = [];
  colours.forEach((col, i) => {
    const b = new THREE.Group();
    const wings = [];
    for (const side of [-1, 1]) {
      const w = new THREE.Group();
      const plane = mesh(new THREE.PlaneGeometry(0.13, 0.1), M(col, { side: THREE.DoubleSide }), side * 0.065, 0, 0, false);
      plane.rotation.x = -Math.PI / 2;
      w.add(plane); b.add(w); wings.push(w);
    }
    b.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.1, 4).rotateX(Math.PI / 2), M(0x2a2118), 0, 0, 0, false));
    const anchor = pick([
      new THREE.Vector3(-6, 0, 12), new THREE.Vector3(5, 0, -10), new THREE.Vector3(-12, 0, -1),
    ]);
    group.add(b);
    flies.push({ b, wings, anchor, phase: i * 2.3, prev: new THREE.Vector3() });
  });
  scene.add(group);
  register({
    name: 'Butterflies', category: 'Animals', icon: '🦋', object: group,
    collider: null, pickup: null, note: 'Lissajous flight paths, flapping quad wings ×3',
  });
  return {
    tick(dt, t) {
      for (const f of flies) {
        const tt = t * 0.55 + f.phase;
        f.prev.copy(f.b.position);
        const x = f.anchor.x + Math.sin(tt * 0.57) * 2.4;
        const z = f.anchor.z + Math.cos(tt * 0.41) * 2.4;
        f.b.position.set(x, groundHeight(x, z) + 1.0 + Math.sin(tt * 1.7) * 0.35, z);
        if (f.prev.lengthSq() > 0) {
          const dx = f.b.position.x - f.prev.x, dz = f.b.position.z - f.prev.z;
          if (Math.abs(dx) + Math.abs(dz) > 1e-5) f.b.rotation.y = Math.atan2(dx, dz);
        }
        const flap = Math.sin(t * 13 + f.phase) * 0.85;
        f.wings[0].rotation.z = flap; f.wings[1].rotation.z = -flap;
      }
    },
  };
}

// ───────── build all ─────────

export function buildEntities(scene) {
  const player = createPlayer(scene);
  const getPlayerPos = () => player.pos;
  const npc = createNpc(scene, getPlayerPos);
  const chickens = [
    createChicken(scene, 'Hen Penny', 0xf2ede2, getPlayerPos),
    createChicken(scene, 'Hen Poppy', 0xb8743a, getPlayerPos),
  ];
  const butterflies = createButterflies(scene);

  return {
    player, npc, chickens,
    tick(dt, t, keyDir) {
      player.tick(dt, t, keyDir);
      npc.tick(dt, t);
      for (const ch of chickens) ch.tick(dt, t);
      butterflies.tick(dt, t);
    },
  };
}
