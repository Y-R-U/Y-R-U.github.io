// Creatures: farm animals (rat, hen, cow, sheep) and goblins. Each is a
// static pack model animated procedurally (hop/sway/lunge), with HP, a health
// bar, hit-flash, RS-flavoured drops (bones from every beast), and respawn.
// Passive types flee when struck; goblins are aggressive and chase.

import * as THREE from 'three';
import { rand } from './utils.js';
import { model as loadModel } from './assets.js';
import { makeHealthBar, splat, feathers } from './fx.js';

export const CREATURES = {
  rat:    { name: 'Rat',     model: 'rat',    scale: 1.5, hp: 5,  level: 2, speed: 2.6, kind: 'passive', wanderR: 4,
            loot: { gold: [0, 0], always: ['bones'], rolls: [] } },
  hen:    { name: 'Chicken', model: 'hen',    scale: 1.1, hp: 4,  level: 1, speed: 1.8, kind: 'passive', wanderR: 5,
            loot: { gold: [0, 0], always: ['bones', 'feather'], rolls: [['feather', 0.6], ['feather', 0.4]] } },
  cow:    { name: 'Cow',     model: 'cow',    scale: 1.05, hp: 8, level: 2, speed: 1.6, kind: 'passive', wanderR: 5,
            loot: { gold: [0, 0], always: ['bones', 'raw_beef', 'cowhide'], rolls: [] } },
  sheep:  { name: 'Sheep',   model: 'sheep',  scale: 1.0, hp: 4,  level: 1, speed: 1.7, kind: 'passive', wanderR: 6,
            loot: { gold: [0, 0], always: ['bones'], rolls: [] } },
  goblin: { name: 'Goblin',  model: 'goblin', scale: 0.85, hp: 14, level: 5, speed: 2.5, kind: 'aggro', dmg: [0, 2], aggro: 7, wanderR: 7,
            loot: { gold: [1, 9], always: ['bones'], rolls: [['bronze_sword', 0.04], ['copper_ore', 0.1], ['raw_shrimp', 0.08]] } },
};

export function makeCreature(type, x, z, scene, world, bus) {
  const def = CREATURES[type];
  const groundY = (gx, gz) => world.groundHeight(gx, gz);
  const group = new THREE.Group();
  group.position.set(x, groundY(x, z), z);
  scene.add(group);

  const c = {
    type, def, group, level: def.level, alive: true, hp: def.hp, maxHp: def.hp,
    spawn: new THREE.Vector3(x, 0, z), height: 1, model: null, mats: [],
    state: 'wander', stateT: rand(0, 2), wanderTo: null, flash: 0, faceY: rand(0, 6.28),
    atkCd: 0, respawnT: 0, hurtT: 0, bar: null,
  };
  group.userData.creature = c;

  // generous invisible tap proxy so small critters are easy to hit on mobile
  const proxy = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }));
  proxy.userData.creature = c; proxy.position.y = 0.8; group.add(proxy);
  c.proxy = proxy;

  loadModel(def.model, { ownMaterial: true }).then(m => {
    m.scale.setScalar(def.scale);
    group.add(m); c.model = m;
    c.height = (m.userData.size?.y || 1) * def.scale;
    m.traverse(o => { if (o.isMesh) c.mats.push(o.material); });
    c.bar = makeHealthBar(group, c.height + 0.35);
    const rad = Math.max(0.9, c.height * 0.65);
    proxy.scale.setScalar(rad); proxy.position.y = c.height * 0.55;
  });

  c.aimPoint = () => new THREE.Vector3(group.position.x, group.position.y + c.height * 0.6, group.position.z);

  c.hurt = (dmg, fromPos) => {
    if (!c.alive) return null;
    if (dmg > 0) {
      c.hp -= dmg; c.flash = 0.18; c.hurtT = 1.4;
      splat(new THREE.Vector3(group.position.x, group.position.y + c.height * 0.7, group.position.z), dmg);
      if (type === 'hen') feathers(c.aimPoint(), 0xeeddaa);
      c.bar?.set(Math.max(0, c.hp) / c.maxHp);
      if (def.kind === 'passive') { c.state = 'flee'; c.stateT = rand(2, 3.5); c.fleeFrom = fromPos.clone(); }
    } else {
      splat(new THREE.Vector3(group.position.x, group.position.y + c.height * 0.7, group.position.z), 0);
    }
    if (c.hp <= 0) { kill(); return { dead: true }; }
    return { dead: false };
  };

  function kill() {
    c.alive = false; c.state = 'dying'; c.stateT = 0; c.bar?.hide();
    const l = def.loot, gold = Math.round(rand(l.gold[0], l.gold[1]));
    const drops = [];
    if (gold > 0) drops.push({ gold });
    for (const id of (l.always || [])) drops.push({ id });
    for (const [id, ch] of (l.rolls || [])) if (Math.random() < ch) drops.push({ id });
    bus.loot?.(c, drops);
  }

  function scheduleRespawn() { c.respawnT = rand(12, 24); }
  c.update = (dt, t, player) => {
    if (!c.model) return;

    // flash fade
    if (c.flash > 0) { c.flash -= dt; const e = Math.max(0, c.flash) / 0.18; for (const m of c.mats) { m.emissive?.setRGB(e, 0, 0); m.emissiveIntensity = e; } }
    if (c.hurtT > 0) c.hurtT -= dt;

    if (!c.alive) {
      if (c.state === 'dying') {
        c.stateT += dt;
        group.rotation.z = Math.min(Math.PI / 2, c.stateT * 3);
        if (c.stateT > 0.5) group.position.y -= dt * 0.7;
        if (c.stateT > 1.6) { c.state = 'dead'; group.visible = false; scheduleRespawn(); }
      } else if (c.state === 'dead') {
        c.respawnT -= dt;
        if (c.respawnT <= 0) respawn();
      }
      return;
    }

    let moving = false, mvx = 0, mvz = 0;
    const toP = player && player.alive ? new THREE.Vector3(player.pos.x - group.position.x, 0, player.pos.z - group.position.z) : null;
    const dP = toP ? toP.length() : 999;

    if (def.kind === 'aggro') {
      if (dP < (def.aggro || 8) && player.alive) {
        if (dP > 1.3) { toP.normalize(); mvx = toP.x; mvz = toP.z; moving = true; c.state = 'chase'; }
        else { // attack
          c.faceY = Math.atan2(toP.x, toP.z); c.atkCd -= dt;
          if (c.atkCd <= 0) { c.atkCd = rand(1.6, 2.4); c.lunge = 0.0001; const d = Math.round(rand(def.dmg[0], def.dmg[1] + 0.49)); player.takeDamage(d, group.position, c); }
        }
      } else c.state = c.state === 'chase' ? 'wander' : c.state;
    }
    if (c.state === 'flee' && c.fleeFrom) {
      c.stateT -= dt;
      const away = new THREE.Vector3(group.position.x - c.fleeFrom.x, 0, group.position.z - c.fleeFrom.z);
      if (away.length() > 0.1) { away.normalize(); mvx = away.x; mvz = away.z; moving = true; }
      if (c.stateT <= 0) c.state = 'wander';
    } else if (!moving && (def.kind !== 'aggro' || dP >= (def.aggro || 8))) {
      // wander near the spawn point
      c.stateT -= dt;
      if (!c.wanderTo || c.stateT <= 0) {
        const a = rand(0, 6.28), r = rand(1.2, def.wanderR || 6);
        c.wanderTo = new THREE.Vector3(c.spawn.x + Math.cos(a) * r, 0, c.spawn.z + Math.sin(a) * r);
        c.stateT = rand(2.5, 5);
      }
      const to = new THREE.Vector3(c.wanderTo.x - group.position.x, 0, c.wanderTo.z - group.position.z);
      if (to.length() > 0.4 && Math.random() < 0.7) { to.normalize(); mvx = to.x; mvz = to.z; moving = true; }
    }

    const spd = def.speed * (c.state === 'flee' ? 1.4 : 1);
    if (moving) {
      group.position.x += mvx * spd * dt; group.position.z += mvz * spd * dt;
      c.faceY = Math.atan2(mvx, mvz);
    }
    group.position.y = groundY(group.position.x, group.position.z);
    group.rotation.y += (((c.faceY - group.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * Math.min(1, dt * 10);

    // procedural anim: hop while moving, breathe while idle, attack lunge
    const hop = moving ? Math.abs(Math.sin(t * 11 + c.spawn.x)) * 0.12 : Math.sin(t * 2 + c.spawn.x) * 0.02;
    let lunge = 0;
    if (c.lunge !== undefined) { c.lunge += dt; const k = c.lunge / 0.25; if (k < 1) lunge = Math.sin(k * Math.PI) * 0.4; else c.lunge = undefined; }
    c.model.position.y = hop + lunge * 0.2;
    c.model.position.z = lunge;
    c.model.rotation.x = moving ? Math.sin(t * 11 + c.spawn.x) * 0.06 : 0;
    c.bar?.tick(dt);
  };

  function respawn() {
    c.alive = true; c.hp = c.maxHp; c.state = 'wander'; c.stateT = rand(0, 2);
    group.visible = true; group.rotation.set(0, c.faceY, 0);
    group.position.set(c.spawn.x, groundY(c.spawn.x, c.spawn.z), c.spawn.z);
    if (c.model) { c.model.position.set(0, 0, 0); c.model.rotation.set(0, 0, 0); }
  }

  return c;
}
