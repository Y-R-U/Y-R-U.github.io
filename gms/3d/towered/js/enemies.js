// The horde. Every enemy is a rigged PolyPerfect SkinnedMesh walking the path
// curve, posed procedurally per style: shamble (zombies/mummy), march
// (vikings/knights/skeletons), sneak (shades), float (warlocks). Bosses are
// scaled + tinted with a gold crown and an aura ring.

import * as THREE from 'three';
import { ENEMIES } from './config.js';
import { loadRigGltf } from './assets.js';
import { buildRig, qx, qy } from './rig.js';
import { makeHealthBar, splat, goldPop, deathPuff, healSparkle, frostGlint } from './fx.js';
import { rand, mesh, M } from './utils.js';

const gltfCache = new Map();
const rigGltf = (n) => { if (!gltfCache.has(n)) gltfCache.set(n, loadRigGltf(n)); return gltfCache.get(n); };

let crownGeo = null;
function makeCrown() {
  if (!crownGeo) {
    const shape = [];
    const band = new THREE.CylinderGeometry(0.16, 0.18, 0.1, 8, 1, true);
    shape.push(band);
    for (let i = 0; i < 5; i++) {
      const spike = new THREE.ConeGeometry(0.035, 0.12, 4);
      const a = (i / 5) * Math.PI * 2;
      spike.translate(Math.cos(a) * 0.16, 0.1, Math.sin(a) * 0.16);
      shape.push(spike);
    }
    crownGeo = shape;
  }
  const g = new THREE.Group();
  const mat = M(0xf0c040, { metalness: 0.8, roughness: 0.3 });
  for (const geo of crownGeo) g.add(mesh(geo, mat));
  return g;
}

export function createEnemies(scene, world, bus) {
  const mgr = { list: [], scene, world, bus };

  mgr.preload = (types) => Promise.all(
    [...new Set(types.map(t => ENEMIES[t].rig))].map(rigGltf));

  mgr.spawn = async (type, pathIdx = 0) => {
    const def = ENEMIES[type];
    const curve = world.curves[Math.min(pathIdx, world.curves.length - 1)];
    const gltf = await rigGltf(def.rig);

    const group = new THREE.Group();
    scene.add(group);
    const rig = buildRig(gltf.scene, { scale: 0.96 * def.scale, tint: def.tint || null });
    group.add(rig.group);

    const e = {
      type, def, group, rig, curve, alive: true,
      hp: def.hp, maxHp: def.hp,
      s: 0, off: rand(-0.45, 0.45) * (def.boss ? 0 : 1),
      phase: rand(0, 6.28), flash: 0,
      slowUntil: 0, slowMul: 1,
      healT: def.heal ? def.heal.period * rand(0.5, 1) : 0,
      dieT: 0, height: 1.75 * def.scale,
      mats: [],
    };
    rig.model.traverse(o => {
      if (o.isMesh || o.isSkinnedMesh)
        e.mats.push(...(Array.isArray(o.material) ? o.material : [o.material]));
    });
    e.bar = makeHealthBar(group, e.height + 0.35, def.boss ? 1.4 : 0.72);

    if (def.boss) {
      const crown = makeCrown();
      crown.scale.setScalar(1.6);
      crown.position.y = 0.16;
      rig.headAttach.add(crown);
      const aura = mesh(
        new THREE.RingGeometry(0.7, 0.95, 28).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: def.tint || 0xffb0ff, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }),
        0, 0.05, 0, false);
      group.add(aura);
      e.aura = aura;
    }

    e.aimPoint = () => new THREE.Vector3(
      group.position.x, group.position.y + e.height * 0.55, group.position.z);

    e.chill = (mul, dur) => {
      if (!e.alive) return;
      e.slowMul = Math.min(e.slowMul === 1 ? 1 : e.slowMul, mul);
      e.slowMul = mul;
      e.slowUntil = e.t + dur;
      frostGlint(e.aimPoint());
    };

    e.hurt = (dmg, opts = {}) => {
      if (!e.alive) return { dead: false };
      const applied = Math.max(1, Math.round(dmg - (opts.trueDmg ? 0 : e.def.armor)));
      e.hp -= applied;
      e.flash = 0.14;
      if (!opts.quiet) splat(e.aimPoint().add(new THREE.Vector3(0, e.height * 0.3, 0)), applied);
      e.bar.set(Math.max(0, e.hp) / e.maxHp);
      if (e.hp <= 0) {
        e.alive = false; e.dieT = 0;
        e.bar.hide();
        goldPop(e.aimPoint(), e.def.bounty);
        bus.onKill?.(e);
        return { dead: true };
      }
      return { dead: false };
    };

    e.heal = (amt) => {
      if (!e.alive || e.hp >= e.maxHp) return false;
      e.hp = Math.min(e.maxHp, e.hp + amt);
      e.bar.set(e.hp / e.maxHp);
      healSparkle(e.aimPoint());
      return true;
    };

    e.dispose = () => { e.bar.dispose(); for (const m of e.mats) m.dispose(); };
    mgr.list.push(e);
    bus.onSpawn?.(e);
    return e;
  };

  // ── per-style pose (returns bob height) ──
  function pose(e, t) {
    const P = e.rig.parts, ph = e.phase, DR = e.rig.DOWN_R, DL = e.rig.DOWN_L;
    const rate = e.def.speed * e.slowMul;
    switch (e.def.pose) {
      case 'shamble': {
        const sp = 3.2 + rate, sw = Math.sin(t * sp + ph) * 0.48;
        P.rLeg.apply(qx(sw)); P.lLeg.apply(qx(-sw));
        P.rKnee.apply(qx(Math.max(0, -sw) * 0.7)); P.lKnee.apply(qx(Math.max(0, sw) * 0.7));
        const reach = -1.3 + Math.sin(t * 1.6 + ph) * 0.12;
        P.rArm.apply(qx(reach + 0.1).multiply(DR)); P.lArm.apply(qx(reach - 0.1).multiply(DL));
        P.rElb.apply(qx(-0.5)); P.lElb.apply(qx(-0.5));
        P.head.apply(qy(Math.sin(t * 0.8 + ph) * 0.25).multiply(qx(0.15)));
        return Math.abs(Math.sin(t * sp + ph)) * 0.035;
      }
      case 'sneak': {
        const sp = 7.5 + rate, sw = Math.sin(t * sp + ph) * 0.75;
        P.rLeg.apply(qx(sw)); P.lLeg.apply(qx(-sw));
        P.rKnee.apply(qx(Math.max(0, -sw) * 1.1)); P.lKnee.apply(qx(Math.max(0, sw) * 1.1));
        P.rArm.apply(qx(-0.5 + sw * 0.3).multiply(DR)); P.lArm.apply(qx(-0.5 - sw * 0.3).multiply(DL));
        P.rElb.apply(qx(-1.1)); P.lElb.apply(qx(-1.1));
        P.head.apply(qx(-0.12));
        return Math.abs(Math.sin(t * sp + ph)) * 0.05;
      }
      case 'float': {
        P.rLeg.apply(qx(0.06)); P.lLeg.apply(qx(-0.06));
        P.rKnee.apply(qx(0.1)); P.lKnee.apply(qx(0.1));
        const wave = Math.sin(t * 1.8 + ph) * 0.12;
        P.rArm.apply(qx(-0.85 + wave).multiply(DR)); P.lArm.apply(qx(-0.85 - wave).multiply(DL));
        P.rElb.apply(qx(-0.7)); P.lElb.apply(qx(-0.7));
        P.head.apply(qy(Math.sin(t * 0.7 + ph) * 0.2));
        return 0.28 + Math.sin(t * 2.2 + ph) * 0.09;
      }
      default: { // march
        const sp = 4.6 + rate * 1.4, sw = Math.sin(t * sp + ph) * 0.55;
        P.rLeg.apply(qx(sw)); P.lLeg.apply(qx(-sw));
        P.rKnee.apply(qx(Math.max(0, -sw) * 0.9)); P.lKnee.apply(qx(Math.max(0, sw) * 0.9));
        P.rArm.apply(qx(-sw * 0.8).multiply(DR)); P.lArm.apply(qx(sw * 0.8).multiply(DL));
        P.rElb.apply(qx(-0.25)); P.lElb.apply(qx(-0.25));
        P.head.apply(qy(0));
        return Math.abs(Math.sin(t * sp + ph)) * 0.045;
      }
    }
  }

  const _pos = new THREE.Vector3(), _tan = new THREE.Vector3();

  mgr.update = (dt, t) => {
    for (let i = mgr.list.length - 1; i >= 0; i--) {
      const e = mgr.list[i];
      e.t = t;

      // hit flash / chill glow
      if (e.flash > 0) {
        e.flash -= dt;
        const k = Math.max(0, e.flash) / 0.14;
        for (const m of e.mats) if (m.emissive) { m.emissive.setHex(0xff2010); m.emissiveIntensity = k * 1.4; }
      } else {
        const chilled = t < e.slowUntil;
        for (const m of e.mats) if (m.emissive) {
          if (chilled) { m.emissive.setHex(0x3060c0); m.emissiveIntensity = 0.4; }
          else if (m.emissiveIntensity) m.emissiveIntensity = 0;
        }
      }

      if (!e.alive) {
        e.dieT += dt;
        const topple = e.def.boss ? 1.4 : 0.55;
        e.rig.group.rotation.z = Math.min(Math.PI / 2, (e.dieT / topple) * (Math.PI / 2));
        if (e.dieT > topple + 0.25) e.group.position.y -= dt * 0.9;
        if (e.dieT > topple + 1.1) {
          e.dispose();
          scene.remove(e.group);
          mgr.list.splice(i, 1);
        }
        continue;
      }

      if (t >= e.slowUntil) e.slowMul = 1;
      if (e.def.regen && e.hp < e.maxHp) { e.hp = Math.min(e.maxHp, e.hp + e.def.regen * dt); e.bar.set(e.hp / e.maxHp); }
      if (e.def.heal) {
        e.healT -= dt;
        if (e.healT <= 0) {
          e.healT = e.def.heal.period;
          let healed = false;
          for (const o of mgr.list) {
            if (o === e || !o.alive) continue;
            if (o.group.position.distanceTo(e.group.position) <= e.def.heal.radius)
              healed = o.heal(e.def.heal.amount) || healed;
          }
          if (healed) healSparkle(e.aimPoint());
        }
      }

      e.s += e.def.speed * e.slowMul * dt;
      if (e.s >= e.curve.total) {
        e.alive = false;
        deathPuff(e.aimPoint(), 0x201828);
        e.dispose();
        scene.remove(e.group);
        mgr.list.splice(i, 1);
        bus.onLeak?.(e);
        continue;
      }

      e.curve.posAt(e.s, _pos, _tan);
      e.group.position.set(_pos.x - _tan.z * e.off, 0, _pos.z + _tan.x * e.off);
      e.group.rotation.y = Math.atan2(_tan.x, _tan.z);

      const bob = pose(e, t);
      e.rig.group.position.y = bob;
      if (e.aura) e.aura.rotation.y = t * 0.8;
    }
  };

  mgr.aliveCount = () => { let n = 0; for (const e of mgr.list) if (e.alive) n++; return n; };
  mgr.clear = () => {
    for (const e of mgr.list) { e.dispose(); scene.remove(e.group); }
    mgr.list.length = 0;
  };

  return mgr;
}
