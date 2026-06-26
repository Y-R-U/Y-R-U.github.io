// Zombies: the PolyPerfect zombie meshes (man-zombie / woman-zombie). These
// gallery exports are STATIC (no skeleton — only the hero GLB is truly rigged),
// and the models already stand arms-outstretched, so we sell the shamble with a
// whole-body procedural lurch (side-rock + forward hunch + a lunge bite) like
// the old chickens. HP bar, emissive hit-flash, blood, death topple. They chase
// the player on sight and hit back; no pathfinding (main pushes them off walls).

import * as THREE from 'three';
import { rand } from './utils.js';
import { model as loadModel } from './assets.js';
import { makeHealthBar, splat, blood } from './fx.js';

export const ZTYPES = {
  walker: { model: 'zombie_m', hp: 60,  speed: 1.55, dmg: [6, 11],  aggro: 34, scale: 1.0, tint: null },
  woman:  { model: 'zombie_w', hp: 52,  speed: 1.75, dmg: [5, 9],   aggro: 34, scale: 1.0, tint: null },
  brute:  { model: 'zombie_m', hp: 140, speed: 1.25, dmg: [14, 22], aggro: 38, scale: 1.28, tint: 0x9fcf8a },
  runner: { model: 'zombie_w', hp: 40,  speed: 3.1,  dmg: [4, 8],   aggro: 40, scale: 0.9,  tint: 0xc8a090 },
};

export async function preloadZombies() {
  await Promise.all(['zombie_m', 'zombie_w'].map(n => loadModel(n)));
}

export function makeZombie(type, x, z, scene, bus, heightFn, collide) {
  const def = ZTYPES[type] || ZTYPES.walker;
  const groundY = heightFn || (() => 0);
  const group = new THREE.Group();
  group.position.set(x, groundY(x, z), z);
  scene.add(group);

  const c = {
    type, def, group, alive: true, hp: def.hp, maxHp: def.hp,
    height: 1.8, model: null, mats: [],
    state: 'wander', stateT: rand(0, 2), wanderTo: null,
    flash: 0, atkCd: rand(0.5, 1.5), lunge: 0, faceY: rand(0, 6.28),
    phase: rand(0, 6.28), bob: 0,
  };
  group.userData.zombie = c;

  loadModel(def.model, { ownMaterial: true }).then(m => {
    const baseScale = def.scale || 1;
    m.scale.setScalar(baseScale);
    group.add(m); c.model = m;
    c.height = (m.userData.size?.y || 1.8) * baseScale;
    m.traverse(o => {
      if (o.isMesh) {
        c.mats.push(o.material);
        if (def.tint && o.material.color) o.material.color.multiply(new THREE.Color(def.tint));
        if (o.material.emissive !== undefined) o.material.emissive = new THREE.Color(0x550000);
      }
    });
    c.bar = makeHealthBar(group, c.height + 0.3);
  });

  c.aimPoint = () => new THREE.Vector3(group.position.x, group.position.y + c.height * 0.55, group.position.z);

  c.hurt = (dmg, fromDir) => {
    if (!c.alive) return null;
    c.hp -= dmg; c.flash = 0.16;
    splat(new THREE.Vector3(group.position.x, group.position.y + c.height * 0.85, group.position.z), dmg);
    blood(c.aimPoint(), fromDir);
    c.bar?.set(Math.max(0, c.hp) / c.maxHp);
    if (c.hp <= 0) { kill(); return { dead: true }; }
    return { dead: false };
  };

  function kill() {
    c.alive = false; c.state = 'dying'; c.stateT = 0; c.bar?.hide();
    bus.zombieKilled?.(c);
  }

  // free the per-instance materials (ownMaterial clones) + the health-bar
  // texture when this zombie is culled. Geometry is shared via clone(), so we
  // must NOT dispose it.
  c.dispose = () => { c.bar?.dispose(); for (const m of c.mats) m.dispose(); };

  c.update = (dt, t, player) => {
    // emissive hit-flash
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
    if (!c.model) return;

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

    // whole-body shamble: side-rock + forward hunch + a bob, plus the lunge
    const sp = moving ? 5.2 : 1.6, amp = moving ? 0.13 : 0.05;
    const rock = Math.sin(t * sp + c.phase) * amp;
    c.bob = moving ? Math.abs(Math.sin(t * sp + c.phase)) * 0.07 : Math.sin(t * 1.6 + c.phase) * 0.02;
    c.model.rotation.z = rock;
    c.model.rotation.x = 0.14 + c.lunge * 0.4;
    c.model.position.y = c.bob + c.lunge * 0.05;
    c.model.position.z = c.lunge * 0.35;
    c.bar?.tick(dt);
  };

  return c;
}
