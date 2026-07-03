// Towers: build / upgrade / sell, targeting (frontmost enemy in range), and
// firing. Visuals are PolyPerfect siege weapons on tower bases; the weapon
// head yaws onto the target. Upgrades grow the tower and add a gold trim ring
// (L2) and a war banner (L3).

import * as THREE from 'three';
import { CELL, TOWERS, ECON } from './config.js';
import { model } from './assets.js';
import { cellToWorld, cellKey } from './levels.js';
import { launchBolt, launchBall, boltTime, flightTime } from './projectiles.js';
import { explosion, frostPulse, zapArc, glowSprite } from './fx.js';
import { M, mesh, lerpAngle, damp } from './utils.js';

const fitScale = (inst, targetW, targetH) => {
  const s = inst.userData.size;
  return Math.min(targetW / Math.max(s.x, s.z, 0.001), targetH / Math.max(s.y, 0.001));
};

export function createTowers(scene, world, enemies, bus) {
  const mgr = { list: [], byCell: new Map() };

  mgr.preload = () => Promise.all(
    ['tower_wood', 'tower_stone', 'ballista', 'cannon', 'catapult', 'crystals', 'gems_green', 'flag', 'cannonballs']
      .map(n => model(n)));

  mgr.at = (cx, cz) => mgr.byCell.get(cellKey(cx, cz)) || null;

  mgr.build = async (type, cx, cz) => {
    const def = TOWERS[type];
    const { x, z } = cellToWorld(world.level, cx, cz);
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    scene.add(group);

    const t = {
      type, def, lvl: 0, cx, cz, group,
      pos: group.position, cd: def.period[0] * 0.4, invested: def.cost[0],
      head: null, headYaw: 0, baseH: 0, kills: 0,
    };

    // base (untinted — tint is for the head only)
    if (def.base) {
      const base = await model(def.base);
      const scl = fitScale(base, CELL * 0.92, 1.9);
      base.scale.setScalar(scl);
      group.add(base);
      t.baseH = base.userData.size.y * scl;
    } else if (type === 'catapult') {
      const slab = mesh(new THREE.CylinderGeometry(CELL * 0.52, CELL * 0.58, 0.24, 10), M(0x8d8578), 0, 0.12, 0);
      group.add(slab);
      t.baseH = 0.24;
    } else { // arcane: procedural obelisk
      const obelisk = mesh(new THREE.CylinderGeometry(0.22, 0.44, 1.7, 6), M(0x3d3a4a, { roughness: 0.7 }), 0, 0.85, 0);
      const cap = mesh(new THREE.ConeGeometry(0.26, 0.35, 6), M(0x4a4660), 0, 1.85, 0);
      group.add(obelisk, cap);
      t.baseH = 2.0;
    }

    // head (the weapon that aims)
    const headGroup = new THREE.Group();
    headGroup.position.y = t.baseH + 0.02;
    group.add(headGroup);
    t.head = headGroup;

    if (def.head) {
      const head = await model(def.head, { ownMaterial: !!def.tint });
      const scl = type === 'catapult' ? fitScale(head, CELL * 1.06, 2.2)
        : type === 'frost' ? fitScale(head, 0.95, 0.9)
        : type === 'arcane' ? fitScale(head, 0.6, 0.6)
        : fitScale(head, 1.7, 1.35);
      head.scale.setScalar(scl);
      if (def.tint) head.traverse(o => {
        if (o.isMesh) {
          o.material.color?.multiply(new THREE.Color(def.tint));
          o.material.emissive = new THREE.Color(def.tint);
          o.material.emissiveIntensity = 0.35;
        }
      });
      headGroup.add(head);
      t.headH = head.userData.size.y * scl;
      t.headModel = head;
    }
    if (type === 'frost' || type === 'arcane') {
      const halo = glowSprite(type === 'frost' ? 1.1 : 0.9, def.tint, 0.5);
      halo.position.y = (t.headH || 0.6) * 0.6;
      headGroup.add(halo);
      t.halo = halo;
    }
    if (type === 'cannon') {  // decorative ball stack beside the gun
      model('cannonballs').then(b => { b.scale.setScalar(0.5); b.position.set(0.55, 0, 0.4); headGroup.add(b); });
    }

    t.muzzle = () => {
      const p = new THREE.Vector3(0, (t.headH || 0.6) * 0.7, 0.3);
      return t.head.localToWorld(p);
    };

    mgr.list.push(t);
    mgr.byCell.set(cellKey(cx, cz), t);
    bus.onBuild?.(t);
    return t;
  };

  mgr.upgrade = async (t) => {
    if (t.lvl >= 2) return false;
    t.lvl++;
    t.invested += t.def.cost[t.lvl];
    const s = 1 + t.lvl * 0.09;
    t.group.scale.setScalar(s);
    if (t.lvl === 1) {
      const trim = mesh(new THREE.TorusGeometry(CELL * 0.34, 0.045, 8, 24).rotateX(Math.PI / 2),
        M(0xd8ae4e, { metalness: 0.7, roughness: 0.35 }), 0, 0.16, 0);
      t.group.add(trim);
    } else {
      try {
        const flag = await model('flag');
        flag.scale.setScalar(0.85);
        flag.position.set(CELL * 0.3, 0, -CELL * 0.3);
        t.group.add(flag);
      } catch { /* decorative only */ }
    }
    bus.onUpgrade?.(t);
    return true;
  };

  mgr.sell = (t) => {
    const refund = Math.round(t.invested * ECON.sellRefund);
    scene.remove(t.group);
    mgr.byCell.delete(cellKey(t.cx, t.cz));
    const i = mgr.list.indexOf(t);
    if (i >= 0) mgr.list.splice(i, 1);
    bus.onSell?.(t, refund);
    return refund;
  };

  // ── targeting: frontmost alive enemy within [minRange, range] ──
  function acquire(t) {
    const range = t.def.range[t.lvl], minR = t.def.minRange || 0;
    let best = null, bestS = -1;
    for (const e of enemies.list) {
      if (!e.alive) continue;
      const d = Math.hypot(e.group.position.x - t.pos.x, e.group.position.z - t.pos.z);
      if (d > range || d < minR) continue;
      if (e.s > bestS) { bestS = e.s; best = e; }
    }
    return best;
  }

  const _predict = new THREE.Vector3(), _tan = new THREE.Vector3();
  function predictPos(e, dt) {
    const s = Math.min(e.s + e.def.speed * e.slowMul * dt, e.curve.total - 0.01);
    e.curve.posAt(s, _predict, _tan);
    return new THREE.Vector3(_predict.x - _tan.z * e.off, e.height * 0.4, _predict.z + _tan.x * e.off);
  }

  function splashHit(at, radius, dmg) {
    let hits = 0;
    for (const e of enemies.list) {
      if (!e.alive) continue;
      const d = e.group.position.distanceTo(at);
      if (d <= radius) { e.hurt(dmg * (1 - 0.5 * (d / radius))); hits++; }
    }
    return hits;
  }

  mgr.update = (dt, t) => {
    for (const tw of mgr.list) {
      tw.cd -= dt;
      if (tw.halo) tw.halo.material.rotation += dt;
      if (tw.type === 'frost' && tw.headModel) tw.headModel.rotation.y += dt * 0.8;
      if (tw.type === 'arcane' && tw.headModel) tw.headModel.position.y = 0.1 + Math.sin(t * 2.4 + tw.cx) * 0.07;

      const def = tw.def, lvl = tw.lvl;

      if (def.proj === 'pulse') {  // frost: no aiming, pulse whenever enemies near
        if (tw.cd <= 0) {
          const range = def.range[lvl];
          let any = false;
          for (const e of enemies.list) {
            if (!e.alive) continue;
            const d = Math.hypot(e.group.position.x - tw.pos.x, e.group.position.z - tw.pos.z);
            if (d <= range) { e.chill(def.slow[lvl], def.slowDur); e.hurt(def.dmg[lvl], { quiet: true }); any = true; }
          }
          if (any) {
            tw.cd = def.period[lvl];
            frostPulse(tw.pos, range);
            bus.onShoot?.(tw);
          }
        }
        continue;
      }

      const target = acquire(tw);
      if (!target) continue;

      // yaw the head onto the target
      const want = Math.atan2(target.group.position.x - tw.pos.x, target.group.position.z - tw.pos.z);
      tw.headYaw = lerpAngle(tw.headYaw, want, damp(10, dt));
      tw.head.rotation.y = tw.headYaw;
      const aligned = Math.abs(((want - tw.headYaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < 0.3;
      if (tw.cd > 0 || !aligned) continue;
      tw.cd = def.period[lvl];
      const dmg = def.dmg[lvl];
      const from = tw.muzzle();

      if (def.proj === 'bolt') {
        const to = predictPos(target, boltTime(from, target.aimPoint()));
        launchBolt(from, to, () => { if (target.alive) target.hurt(dmg); });
      } else if (def.proj === 'cannonball' || def.proj === 'boulder') {
        const boulder = def.proj === 'boulder';
        const to = predictPos(target, flightTime(from, target.aimPoint(), boulder));
        to.y = 0.1;
        launchBall(from, to, { boulder, onArrive: () => {
          explosion(to, def.splash[lvl], boulder ? 0xc0a878 : 0xffa040);
          splashHit(to, def.splash[lvl], dmg);
          bus.onExplode?.(tw, to);
        } });
      } else if (def.proj === 'zap') {
        let cur = target, curPos = tw.muzzle(), d = dmg;
        const zapped = new Set();
        for (let c = 0; c < def.chain[lvl] && cur; c++) {
          zapArc(curPos, cur.aimPoint());
          cur.hurt(Math.round(d));
          zapped.add(cur);
          curPos = cur.aimPoint(); d *= def.falloff;
          let next = null, nd = 3.4;
          for (const e of enemies.list) {
            if (!e.alive || zapped.has(e)) continue;
            const dd = e.group.position.distanceTo(cur.group.position);
            if (dd < nd) { nd = dd; next = e; }
          }
          cur = next;
        }
      }
      bus.onShoot?.(tw);
    }
  };

  mgr.clear = () => {
    for (const t of mgr.list) scene.remove(t.group);
    mgr.list.length = 0;
    mgr.byCell.clear();
  };

  return mgr;
}
