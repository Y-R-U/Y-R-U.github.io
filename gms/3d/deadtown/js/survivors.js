// Survivor NPCs you find cowering in the town and rescue. Same rigged pipeline
// as zombies/hero (buildRig in body space) using freshly skinned-exported
// civilian prefabs. A survivor cowers (hands up, head darting) until you walk up
// and Use them; then they wave, give you a reward, and flee to the town edge.
// Tied to the "rescue survivors" objective via player.rescued.

import * as THREE from 'three';
import { rand, makeNameSprite } from './utils.js';
import { loadRigGltf } from './assets.js';
import { buildRig, qx, qy } from './hero.js';

export const SURVIVORS = {
  casual: { rig: 'survivor_w', name: 'Survivor', reward: { ammo: '9mm', n: 24 } },
  biz:    { rig: 'survivor_b', name: 'Survivor', reward: { ammo: 'shells', n: 10 } },
  doc:    { rig: 'survivor_d', name: 'Medic',    reward: { medkit: 2 } },
};

const gltfCache = new Map();
const rigGltf = (n) => { if (!gltfCache.has(n)) gltfCache.set(n, loadRigGltf(n)); return gltfCache.get(n); };
export async function preloadSurvivors() { await Promise.all(['survivor_w', 'survivor_b', 'survivor_d'].map(rigGltf)); }

export function makeSurvivor(type, x, z, scene, bus, heightFn) {
  const def = SURVIVORS[type] || SURVIVORS.casual;
  const groundY = heightFn || (() => 0);
  const group = new THREE.Group();
  group.position.set(x, groundY(x, z), z);
  group.rotation.y = rand(0, 6.28);
  scene.add(group);

  const c = {
    type, def, group, state: 'cower', rescued: false, t: rand(0, 3),
    parts: null, rig: null, phase: rand(0, 6.28), fleeYaw: 0,
    pos: new THREE.Vector3(x, 0, z),
  };

  rigGltf(def.rig).then(gltf => {
    const rig = buildRig(gltf.scene, { scale: 0.96 });
    group.add(rig.group); c.rig = rig; c.parts = rig.parts;
    group.add(makeNameSprite('🆘 ' + def.name, 2.0));
  });

  // the interactable main exposes (Use to rescue) + a beacon so they're findable
  c.interact = { kind: 'rescue', survivor: c, verb: `🆘 Rescue the ${def.name}`, pos: c.pos, range: 3.0 };
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0x7fd0ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
  beacon.material.userData.noWire = true; beacon.position.y = 2.3; group.add(beacon);
  c.beacon = beacon;

  c.rescue = () => {
    if (c.rescued) return null;
    c.rescued = true; c.state = 'wave'; c.t = 0; beacon.visible = false;
    return def.reward;
  };

  c.update = (dt, t, player) => {
    if (!c.parts) return;
    const P = c.parts, DR = c.rig.DOWN_R, DL = c.rig.DOWN_L, ph = c.phase;
    c.t += dt;
    if (c.state === 'cower') {
      // hands up near the face, head darting, a nervous shiver
      const sh = Math.sin(t * 18 + ph) * 0.03;
      P.rArm.apply(qx(-1.7 + sh).multiply(DR)); P.lArm.apply(qx(-1.7 - sh).multiply(DL));
      P.rElb.apply(qx(-1.4)); P.lElb.apply(qx(-1.4));
      P.head.apply(qy(Math.sin(t * 1.6 + ph) * 0.5).multiply(qx(-0.1)));
      c.rig.group.position.y = Math.abs(sh);
      // face the player if near
      if (player) { const dx = player.pos.x - group.position.x, dz = player.pos.z - group.position.z; if (dx * dx + dz * dz < 64) group.rotation.y += (((Math.atan2(dx, dz) - group.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * Math.min(1, dt * 4); }
      beacon.position.y = 2.2 + Math.sin(t * 3 + ph) * 0.12;
    } else if (c.state === 'wave') {
      // grateful wave with the right arm
      P.rArm.apply(qx(-2.6).multiply(DR)); P.rElb.apply(qx(-0.4 + Math.sin(t * 12) * 0.5));
      P.lArm.apply(qx(-0.2).multiply(DL));
      P.head.apply(qy(0));
      if (c.t > 1.6) { c.state = 'flee'; c.fleeYaw = Math.atan2(group.position.x, group.position.z); }   // run outward
    } else if (c.state === 'flee') {
      const sp = 5.0, sw = Math.sin(t * 11 + ph) * 0.6;
      P.rLeg.apply(qx(sw)); P.lLeg.apply(qx(-sw));
      P.rArm.apply(qx(-sw).multiply(DR)); P.lArm.apply(qx(sw).multiply(DL));
      group.position.x += Math.sin(c.fleeYaw) * sp * dt;
      group.position.z += Math.cos(c.fleeYaw) * sp * dt;
      group.rotation.y = c.fleeYaw;
      group.position.y = groundY(group.position.x, group.position.z) + Math.abs(Math.sin(t * 11 + ph)) * 0.04;
      if (Math.hypot(group.position.x, group.position.z) > 60) { c.state = 'gone'; c.remove = true; group.visible = false; }
    }
  };

  return c;
}
