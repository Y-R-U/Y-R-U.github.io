// Zombies: now REAL rigged SkinnedMeshes (freshly skinned-exported man_zombie /
// woman_zombie / man_skeleton), sharing the hero's bone family, so they're
// driven procedurally through buildRig in body space — an articulated shamble
// (legs shuffle, arms reach forward, head loll) + a lunge bite. HP bar, emissive
// hit-flash, blood, death topple. They chase the player on sight and hit back;
// no pathfinding (main pushes them off walls/props).

import * as THREE from 'three';
import { rand } from './utils.js';
import { loadRigGltf } from './assets.js';
import { buildRig, qx, qy } from './hero.js';
import { makeHealthBar, splat, blood } from './fx.js';

export const ZTYPES = {
  walker: { rig: 'zombie_m', hp: 60,  speed: 1.55, dmg: [6, 11],  aggro: 34, scale: 0.97, tint: null },
  woman:  { rig: 'zombie_w', hp: 52,  speed: 1.75, dmg: [5, 9],   aggro: 34, scale: 0.95, tint: null },
  brute:  { rig: 'zombie_m', hp: 150, speed: 1.2,  dmg: [15, 24], aggro: 38, scale: 1.22, tint: 0x9fcf8a },
  runner: { rig: 'zombie_w', hp: 40,  speed: 3.1,  dmg: [4, 8],   aggro: 40, scale: 0.9,  tint: 0xc8a090 },
  skeleton:{ rig: 'skeleton', hp: 46, speed: 2.3,  dmg: [7, 12],  aggro: 36, scale: 0.97, tint: null },
};

const gltfCache = new Map();
const rigGltf = (n) => { if (!gltfCache.has(n)) gltfCache.set(n, loadRigGltf(n)); return gltfCache.get(n); };
export async function preloadZombies() { await Promise.all(['zombie_m', 'zombie_w', 'skeleton'].map(rigGltf)); }

export function makeZombie(type, x, z, scene, bus, heightFn, collide) {
  const def = ZTYPES[type] || ZTYPES.walker;
  const groundY = heightFn || (() => 0);
  const group = new THREE.Group();
  group.position.set(x, groundY(x, z), z);
  scene.add(group);

  const c = {
    type, def, group, alive: true, hp: def.hp, maxHp: def.hp,
    height: 1.75 * def.scale, rig: null, parts: null, mats: [],
    state: 'wander', stateT: rand(0, 2), wanderTo: null,
    flash: 0, atkCd: rand(0.5, 1.5), lunge: 0, faceY: rand(0, 6.28), phase: rand(0, 6.28),
  };
  group.userData.zombie = c;

  rigGltf(def.rig).then(gltf => {
    const rig = buildRig(gltf.scene, { scale: def.scale, tint: def.tint, emissive: 0x550000 });
    group.add(rig.group);
    c.rig = rig; c.parts = rig.parts;
    rig.model.traverse(o => { if (o.isMesh || o.isSkinnedMesh) c.mats.push(...(Array.isArray(o.material) ? o.material : [o.material])); });
    c.bar = makeHealthBar(group, c.height + 0.28);
  });

  c.aimPoint = () => new THREE.Vector3(group.position.x, group.position.y + c.height * 0.55, group.position.z);

  c.hurt = (dmg, fromDir) => {
    if (!c.alive) return null;
    c.hp -= dmg; c.flash = 0.16;
    splat(new THREE.Vector3(group.position.x, group.position.y + c.height * 0.82, group.position.z), dmg);
    blood(c.aimPoint(), fromDir);
    c.bar?.set(Math.max(0, c.hp) / c.maxHp);
    if (c.hp <= 0) { kill(); return { dead: true }; }
    return { dead: false };
  };

  function kill() {
    c.alive = false; c.state = 'dying'; c.stateT = 0; c.bar?.hide();
    bus.zombieKilled?.(c);
  }
  // free per-instance materials + health-bar texture on cull (geometry shared)
  c.dispose = () => { c.bar?.dispose(); for (const m of c.mats) m.dispose(); };

  // articulated shamble: legs shuffle, both arms reach forward, head lolls, and
  // a lunge punch on the bite. Runs in place of the rig's default walk anim.
  function pose(t, moving) {
    const P = c.parts, ph = c.phase, DR = c.rig.DOWN_R, DL = c.rig.DOWN_L;
    const sp = moving ? 4.4 : 1.4, amp = moving ? 0.5 : 0.1;
    const sw = Math.sin(t * sp + ph) * amp;
    P.rLeg.apply(qx(sw)); P.lLeg.apply(qx(-sw));
    P.rKnee.apply(qx(Math.max(0, -sw) * 0.75)); P.lKnee.apply(qx(Math.max(0, sw) * 0.75));
    const reach = -1.35 + Math.sin(t * 1.7 + ph) * 0.12 - c.lunge * 0.7;
    P.rArm.apply(qx(reach + 0.12).multiply(DR));
    P.lArm.apply(qx(reach - 0.12).multiply(DL));
    P.rElb.apply(qx(-0.5)); P.lElb.apply(qx(-0.5));
    P.head.apply(qy(Math.sin(t * 0.8 + ph) * 0.25).multiply(qx(0.18)));
    return Math.abs(Math.sin(t * sp + ph)) * 0.03 * (moving ? 1 : 0.3);
  }

  c.update = (dt, t, player) => {
    if (c.flash > 0) { c.flash -= dt; const e = Math.max(0, c.flash) / 0.16; for (const m of c.mats) if (m.emissive) m.emissiveIntensity = e * 1.5; }
    else for (const m of c.mats) if (m.emissive && m.emissiveIntensity) m.emissiveIntensity = 0;
    if (c.lunge > 0) c.lunge = Math.max(0, c.lunge - dt * 3);

    if (!c.alive) {
      if (c.state === 'dying') {
        c.stateT += dt;
        group.rotation.z = Math.min(Math.PI / 2, c.stateT * 2.6);
        if (c.stateT > 0.6) group.position.y -= dt * 0.5;
        if (c.stateT > 2.4) { c.state = 'gone'; group.visible = false; c.remove = true; }
      }
      return;
    }
    if (!c.parts) return;

    let mvx = 0, mvz = 0, moving = false;
    const toP = player.alive ? new THREE.Vector3(player.pos.x - group.position.x, 0, player.pos.z - group.position.z) : null;
    const dP = toP ? toP.length() : 999;

    if (player.alive && dP < def.aggro) {
      if (dP > 1.2) { toP.normalize(); mvx = toP.x; mvz = toP.z; moving = true; c.state = 'chase'; }
      else {
        c.faceY = Math.atan2(player.pos.x - group.position.x, player.pos.z - group.position.z);
        c.atkCd -= dt;
        if (c.atkCd <= 0) { c.atkCd = rand(1.3, 2.0); c.lunge = 1; const d = Math.round(rand(def.dmg[0], def.dmg[1])); player.takeDamage(d, group.position, c); }
      }
    } else {
      c.state = 'wander'; c.stateT -= dt;
      if (!c.wanderTo || c.stateT <= 0) {
        const a = rand(0, 6.28), r = rand(2, 7);
        c.wanderTo = new THREE.Vector3(group.position.x + Math.cos(a) * r, 0, group.position.z + Math.sin(a) * r);
        c.stateT = rand(3, 6);
      }
      const to = new THREE.Vector3(c.wanderTo.x - group.position.x, 0, c.wanderTo.z - group.position.z);
      if (to.length() > 0.5 && Math.random() < 0.7) { to.normalize(); mvx = to.x; mvz = to.z; moving = true; }
    }

    if (moving) {
      group.position.x += mvx * def.speed * dt;
      group.position.z += mvz * def.speed * dt;
      c.faceY = Math.atan2(mvx, mvz);
    }
    collide?.(group.position);
    group.position.y = groundY(group.position.x, group.position.z);
    group.rotation.y += (((c.faceY - group.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * Math.min(1, dt * 7);

    const bob = pose(t, moving);
    c.rig.group.position.y = bob + c.lunge * 0.05;
    c.rig.group.position.z = c.lunge * 0.3;
    c.bar?.tick(dt);
  };

  return c;
}
