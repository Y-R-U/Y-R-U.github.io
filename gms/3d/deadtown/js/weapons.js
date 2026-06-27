// The arsenal: weapon definitions + the in-hand model attachment + the combat
// arm overlay (carry / aim / recoil for guns, swing for melee). Bolted onto the
// player rig by attachArsenal(). Weapons are real PolyPerfect GLBs parented to
// the right wrist; the tracer/laser origin is a STABLE muzzle node on the body
// (not the GLB barrel) so aiming reads right regardless of each model's pivot.
//
// Firing/swinging is driven by aim.js + player.js — this module only owns the
// pose state machine and the visible weapon model.

import * as THREE from 'three';
import { qx, qz } from './hero.js';
import { model as loadModel } from './assets.js';

// dmg is [min,max] per hit/bullet. cd = seconds between shots. ammo = null for
// melee, else the ammo pool name. auto = held-fire weapons (visual only; we
// auto-fire all guns while locked). pellets>1 = shotgun spread.
export const WEAPONS = {
  axe:        { name: 'Fire Axe',    model: 'axe',        kind: 'melee', dmg: [22, 36], range: 2.1, cd: 0.62, icon: '🪓',
                hand: { pos: [0, 0.02, 0.05], rot: [Math.PI / 2, 0, 0.2], scale: 1.0 } },
  bat:        { name: 'Baseball Bat', model: 'bat',       kind: 'melee', dmg: [14, 24], range: 2.1, cd: 0.52, icon: '🏏',
                hand: { pos: [0, 0.0, 0.05], rot: [Math.PI / 2, 0, 0.15], scale: 1.0 } },
  // guns share native orientation (re-origined to bottom-centre, barrel +Z),
  // so rot=[0,0,0] points the barrel down the forearm; pos.z pushes the grip
  // into the hand (longer guns need a bigger push), pos.y drops it into the palm.
  pistol:     { name: 'Pistol',      model: 'pistol',     kind: 'gun', dmg: [18, 26], range: 15, cd: 0.40, ammo: '9mm', spread: 0.015, mag: 12, reload: 1.1, icon: '🔫',
                hand: { pos: [0.03, -0.03, 0.03], rot: [0, 0, 0], scale: 1.0 } },
  revolver:   { name: 'Revolver',    model: 'revolver',   kind: 'gun', dmg: [34, 50], range: 17, cd: 0.78, ammo: '9mm', spread: 0.01, mag: 6, reload: 1.5, icon: '🔫',
                hand: { pos: [0.03, -0.03, 0.07], rot: [0, 0, 0], scale: 1.0 } },
  smg:        { name: 'Uzi',         model: 'smg',        kind: 'gun', dmg: [11, 17], range: 14, cd: 0.11, ammo: '9mm', spread: 0.05, auto: true, mag: 30, reload: 1.6, icon: '🔫',
                hand: { pos: [0.03, -0.03, 0.05], rot: [0, 0, 0], scale: 1.0 }, twoHand: true },
  shotgun:    { name: 'Shotgun',     model: 'shotgun',    kind: 'gun', dmg: [8, 14], pellets: 7, range: 10, cd: 0.82, ammo: 'shells', spread: 0.16, mag: 6, reload: 2.0, icon: '🔫',
                hand: { pos: [0.03, -0.03, 0.2], rot: [0, 0, 0], scale: 1.0 }, twoHand: true },
  rifle:      { name: 'Rifle',       model: 'rifle',      kind: 'gun', dmg: [44, 64], range: 26, cd: 1.05, ammo: 'rifle', spread: 0.006, mag: 8, reload: 1.8, icon: '🔫',
                hand: { pos: [0.03, -0.03, 0.26], rot: [0, 0, 0], scale: 1.0 }, twoHand: true },
  machinegun: { name: 'Machine Gun', model: 'machinegun', kind: 'gun', dmg: [15, 23], range: 22, cd: 0.085, ammo: 'rifle', spread: 0.04, auto: true, mag: 60, reload: 2.5, icon: '🔫',
                hand: { pos: [0.03, -0.03, 0.2], rot: [0, 0, 0], scale: 1.0 }, twoHand: true },
};

export const AMMO_KINDS = ['9mm', 'shells', 'rifle'];
export const startWeapon = 'axe';

export function attachArsenal(rig) {
  // stable muzzle/aim origin: right of centre, chest height, a little forward.
  // The laser and bullet tracers spawn here and run along the body's facing.
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0.16, 1.32, 0.52);
  rig.group.add(muzzle);
  rig.muzzleNode = muzzle;
  rig.muzzle = () => muzzle.getWorldPosition(new THREE.Vector3());

  const slot = new THREE.Group();          // holds the current weapon model
  rig.handAttach.add(slot);
  const loaded = {};                       // id -> Group (cached weapon model)
  let curId = null, curDef = null;

  const c = { state: 'carry', t: 0, dur: 0, recoil: 0, onHit: null, hitDone: false, aiming: false };
  rig.combat = c;
  rig.weaponDef = () => curDef;
  rig.weaponId = () => curId;

  rig.setWeapon = (id) => {
    const def = WEAPONS[id]; if (!def || id === curId) return;
    curId = id; curDef = def;
    // hide all loaded models, show/lazy-load the chosen one
    for (const k in loaded) loaded[k].visible = false;
    if (loaded[id]) { loaded[id].visible = true; placed(loaded[id], def); }
    else {
      loadModel(def.model).then(m => {
        m.traverse(o => { o.userData.gear = true; if (o.isMesh) { o.castShadow = true; } });
        loaded[id] = m; slot.add(m); placed(m, def);
        if (curId !== id) m.visible = false;
      });
    }
    c.state = 'carry'; c.recoil = 0;
  };
  function placed(m, def) {
    const h = def.hand;
    m.position.set(...h.pos);
    m.rotation.set(...h.rot);
    m.scale.setScalar(h.scale);
    m.visible = true;
  }

  // fire a gun: kick recoil. onMuzzle gets the world muzzle pos (for the flash).
  rig.fire = () => { c.recoil = 1; };
  // swing melee: onHit fires at the contact frame.
  rig.swing = (onHit) => {
    if (c.state === 'swing') return false;
    c.state = 'swing'; c.t = 0; c.dur = 0.42; c.hitDone = false; c.onHit = onHit;
    return true;
  };
  rig.setAiming = (on) => { c.aiming = on; };
  rig.isMelee = () => curDef?.kind === 'melee';
  rig.forceIdle = () => { c.state = 'carry'; c.recoil = 0; c.aiming = false; };

  const DOWN_R = rig.DOWN_R, DOWN_L = rig.DOWN_L;
  const P = rig.parts;
  const S = (p) => THREE.MathUtils.smoothstep(p, 0, 1);

  // Runs AFTER rig.animate() each frame; overrides the arms only, so legs/bob
  // keep working underneath. `aiming` raises the gun to bear on the target.
  rig.tickCombat = (dt, t, walk) => {
    if (c.recoil > 0) c.recoil = Math.max(0, c.recoil - dt * 7);
    const twoHand = curDef?.twoHand;

    if (c.state === 'swing') {
      c.t += dt; const k = Math.min(c.t / c.dur, 1);
      if (k < 0.3) {                          // wind up overhead
        const p = S(k / 0.3);
        P.rArm.apply(qx(-0.5 - 2.6 * p).multiply(DOWN_R));
      } else if (k < 0.62) {                  // chop down
        const p = S((k - 0.3) / 0.32);
        P.rArm.apply(qx(-3.1 + 2.9 * p).multiply(DOWN_R));
        if (p > 0.5 && !c.hitDone) { c.hitDone = true; c.onHit?.(); }
      } else {                                // recover
        const p = S((k - 0.62) / 0.38);
        P.rArm.apply(qx(-0.2 - 0.3 * p).multiply(DOWN_R));
      }
      if (k >= 1) c.state = 'carry';
      return;
    }

    // gun / melee carry + aim
    const kick = c.recoil * 0.32;
    if (curDef?.kind === 'gun') {
      if (c.aiming) {
        const aim = -1.5 + kick;              // raise to bear, recoil rocks up
        P.rArm.apply(qx(aim).multiply(DOWN_R));
        P.rElb.apply(qx(-0.15));
        if (twoHand) { P.lArm.apply(qx(-1.25).multiply(DOWN_L)); P.lElb.apply(qx(-0.7)); }
      } else {                                // carried forward-low, muzzle ahead
        const bob = Math.sin(t * 8.4) * 0.08 * walk;
        P.rArm.apply(qx(-0.62 + bob).multiply(DOWN_R));
        if (twoHand) P.lArm.apply(qx(-0.5).multiply(DOWN_L));
      }
    } else {                                  // melee carry at the side
      const bob = Math.sin(t * 8.4) * 0.1 * walk;
      P.rArm.apply(qx(-0.35 + bob).multiply(DOWN_R));
    }
  };

  rig.setWeapon(startWeapon);
}
