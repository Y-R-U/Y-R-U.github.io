import * as THREE from 'three';
import { enableReflect } from '../engine/player.js';

const COLOR = { rental: 0xffa040, brawler: 0xffc860, gunner: 0xbfe6ff, ghost: 0x7ff6ff };
const STEP = { rental: 'rental', brawler: 'heavy', gunner: 'elegant', ghost: 'light' };
const ATTACK = { rental: 'baton', brawler: 'fist', gunner: 'carbine', ghost: 'blade' };

// Frame bodies: builds the robot for the active frame and plays the beam-out / beam-in swap (~1.1 s, the
// drop-pod courier lands in P2b). The sim owns which frame is active; this follows its frame:* events.
export function createFrames(G, { world, robots, tier, player, fx, audio, ui, rig }) {
  const v = new THREE.Vector3();
  let anim = null;
  let bodyKey = 'rental:0';

  function build(frame) {
    const kind = frame.archetype === 'rental' ? 'rental' : frame.archetype;
    let a;
    try { a = robots.createRobot({ kind, tier: frame.rental ? 0 : frame.tier || 0, seed: 1, quality: tier.name }); }
    catch (e) { console.warn('frame robot failed', kind, e); return null; }
    enableReflect(a.root);
    return a;
  }

  function attach(a) {
    const old = player.actor;
    if (old === a) return;
    const carry = G.carrying;
    if (G.carryMesh) G.carryMesh.parent?.remove(G.carryMesh);
    world.scene.remove(old.root);
    old.dispose?.();
    world.scene.add(a.root);
    player.setActor(a);
    G.combat?.reset();
    if (carry) G.setCarrying?.(carry);
  }

  const keyOf = (f) => `${f.archetype}:${f.rental ? 0 : f.tier || 0}`;

  // instant (session start / continue): no transition
  function sync(frame = G.sim.activeFrame()) {
    const k = keyOf(frame);
    if (k === bodyKey && !anim) return;
    const a = build(frame);
    if (!a) return;
    attach(a);
    bodyKey = k;
    ui?.controls.setAttack({ icon: ATTACK[frame.archetype] || 'fist' });
  }

  function deploy(frame, { reason = 'swap' } = {}) {
    const k = keyOf(frame);
    if (k === bodyKey && !anim) return false;
    if (anim) { anim.frame = frame; anim.key = k; return true; }
    const col = COLOR[frame.archetype] || 0xffffff;
    anim = { t: 0, phase: 'out', frame, key: k, col, reason, next: null };
    player.frozen = true;
    fx.beam(player.pos, col, 0.9, 7, 1.4);
    fx.ring(player.pos, 2.4, col, 0.5);
    audio.sfx('power_down', { vol: 0.7 });
    audio.sfx('scan', { vol: 0.6 });
    return true;
  }

  function update(dt) {
    if (!anim) return;
    const A = anim;
    A.t += dt;
    const root = player.actor.root;
    if (A.phase === 'out') {
      const u = Math.min(1, A.t / 0.38);
      root.scale.set(1 - u * 0.7, 1 - u * 0.95, 1 - u * 0.7);
      if (Math.random() < dt * 40) fx.sparks(v.set(player.pos.x, player.pos.y + 0.3 + Math.random() * 1.6, player.pos.z), A.col, 1, 3);
      if (u >= 1) {
        const a = build(A.frame);
        if (a) { attach(a); a.root.scale.set(0.3, 0.02, 0.3); }
        bodyKey = A.key;
        A.phase = 'in'; A.t = 0;
        fx.flash(v.set(player.pos.x, player.pos.y + 1, player.pos.z), 1.4, A.col, 0.18);
        fx.beam(player.pos, A.col, 0.8, 8, 1.8);
        rig.shake = Math.max(rig.shake, 0.12);
        audio.sfx('contract_accept', { vol: 0.8 });
        ui?.controls.setAttack({ icon: ATTACK[A.frame.archetype] || 'fist' });
      }
    } else {
      const u = Math.min(1, A.t / 0.5);
      const e = 1 - Math.pow(1 - u, 3);
      root.scale.set(0.3 + 0.7 * e, 0.02 + 0.98 * e + Math.sin(u * Math.PI) * 0.06, 0.3 + 0.7 * e);
      if (u >= 1) {
        root.scale.set(1, 1, 1);
        fx.ring(player.pos, 3.2, A.col, 0.5);
        fx.sparks(v.set(player.pos.x, player.pos.y + 0.2, player.pos.z), A.col, 18, 6);
        player.frozen = false;
        anim = null;
        G.onFrameDeployed?.(A.frame, A.reason);
      }
    }
  }

  return { sync, deploy, update, stepKind: (f) => STEP[f.archetype] || 'rental', get busy() { return !!anim; } };
}
