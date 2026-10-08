import * as THREE from '../../vendor/three/three.module.js';

// Claw swipe: a short cone in front of Garfield tested against Jon's hit zones and registered targets.
export function createScratch({ garfield, events, audio }) {
  const targets = new Map();
  const jonW = new THREE.Vector3(), fwd = new THREE.Vector3(), claw = new THREE.Vector3(), tp = new THREE.Vector3(), tmp = new THREE.Vector3();
  const REACH = 0.58, CONE = Math.cos(THREE.MathUtils.degToRad(70)), ASSIST = -1.01;   // any direction: a kid tapping Scratch right next to the dog expects it to land
  let cooldown = 0, jon = null;

  const api = {
    enabled: true,
    lastHit: null,
    setJon(j) { jon = j; },
    register(def) {
      const t = { radius: 0.3, heightTol: 0.5, enabled: () => true, ...def };
      targets.set(t.id, t);
      return () => { if (targets.get(t.id) === t) targets.delete(t.id); };
    },
    unregister(id) { targets.delete(id); },
    clear() { targets.clear(); },
    get targets() { return targets; },
    update(dt) { cooldown = Math.max(0, cooldown - dt); },
    trigger() {
      if (!api.enabled || cooldown > 0) return null;
      cooldown = 0.42;
      garfield.claw?.(true);
      const p = garfield.play?.('scratch', { once: true, loop: false, fade: 0.05, speed: 1.15 });
      Promise.resolve(p).then(() => garfield.claw?.(false));
      setTimeout(() => garfield.claw?.(false), 600);
      audio?.sfx?.('swipe', { pos: garfield.root.position });
      return api.hitTest();
    },
    hitTest() {
      const root = garfield.root;
      fwd.set(Math.sin(root.rotation.y), 0, Math.cos(root.rotation.y));
      claw.copy(root.position).addScaledVector(fwd, 0.32);
      claw.y += 0.26;
      const inCone = (pos, extra) => {
        tmp.copy(pos).sub(root.position); tmp.y = 0;
        const d = tmp.length();
        if (d > REACH + extra) return -1;
        if (d > 0.12 && tmp.normalize().dot(fwd) < CONE) return -1;
        return d;
      };
      let info = null, bestD = Infinity;

      if (jon?.root && jon.root.visible !== false) {
        // Jon may be parented to his chair while seated: always work in world space.
        const jr = jon.root.getWorldPosition(jonW);
        const d = inCone(jr, jon.radius || 0.28);
        const top = jr.y + (jon.height || 1.82);
        if (d >= 0 && claw.y > jr.y - 0.1 && claw.y < top + 0.1) {
          // Point on Jon's surface at claw height, on the side facing Garfield.
          tp.copy(claw).sub(jr); tp.y = 0;
          if (tp.lengthSq() < 1e-6) tp.copy(fwd).negate();
          tp.setLength(jon.radius || 0.25).add(jr); tp.y = claw.y;
          const zone = jon.hitZone ? jon.hitZone(tp.clone()) : guessZone(jon, tp, jr);
          info = { hit: 'jon', zone, point: tp.clone(), propId: null };
          bestD = d;
        }
      }
      for (const t of targets.values()) {
        let ok = false;
        try { ok = t.enabled(); } catch {}
        if (!ok) continue;
        const pos = t.getPos ? t.getPos(new THREE.Vector3()) : t.pos;
        if (!pos) continue;
        const d = inCone(pos, t.radius);
        if (d < 0 || Math.abs(pos.y - claw.y) > t.heightTol + 0.25) continue;
        // Jon wins ties unless a prop is clearly closer.
        if (d + (info?.hit === 'jon' ? 0.15 : 0) < bestD) {
          bestD = d;
          info = { hit: 'prop', propId: t.id, zone: null, point: pos.clone(), target: t };
        }
      }
      // kid assist: a registered target right beside (or behind) him still gets the swipe, and he spins to it
      if (!info) {
        let best = null, bd = Infinity;
        for (const t of targets.values()) {
          let ok = false;
          try { ok = t.enabled(); } catch {}
          if (!ok || t.noAssist) continue;
          const pos = t.getPos ? t.getPos(new THREE.Vector3()) : t.pos;
          if (!pos || Math.abs(pos.y - claw.y) > t.heightTol + 0.25) continue;
          tmp.copy(pos).sub(root.position); tmp.y = 0;
          const d = tmp.length();
          if (d > REACH + t.radius - 0.08 || (d > 0.12 && tmp.normalize().dot(fwd) < ASSIST)) continue;
          if (d < bd) { bd = d; best = { t, pos }; }
        }
        if (best) {
          root.rotation.y = Math.atan2(best.pos.x - root.position.x, best.pos.z - root.position.z);
          info = { hit: 'prop', propId: best.t.id, zone: null, point: best.pos.clone(), target: best.t };
        }
      }
      info = info || { hit: null, zone: null, propId: null, point: claw.clone() };
      api.lastHit = info;
      if (info.hit) audio?.sfx?.(info.hit === 'jon' ? 'hit' : 'rip', { pos: info.point });
      if (info.target) { try { info.target.onHit?.(info); } catch (e) { console.error('[scratch]', info.propId, e); } }
      const out = { ...info }; delete out.target;
      events?.emit('scratch', out);
      return out;
    },
  };
  return api;
}

const _q = new THREE.Quaternion(), _e = new THREE.Euler();
function guessZone(jon, p, jr) {
  const h = p.y - jr.y;
  const ry = _e.setFromQuaternion(jon.root.getWorldQuaternion(_q), 'YXZ').y;
  const sitting = jon.sitting;
  if (h > (sitting ? 0.95 : 1.4)) return 'face';
  const back = new THREE.Vector3(Math.sin(ry), 0, Math.cos(ry));
  const to = p.clone().sub(jr); to.y = 0; to.normalize();
  if (to.dot(back) < -0.3 && h > 0.7) return 'butt';
  return h > 0.95 ? 'body' : 'leg';
}
