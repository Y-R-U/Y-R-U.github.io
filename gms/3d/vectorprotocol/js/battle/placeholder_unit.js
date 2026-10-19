import * as THREE from 'three';

// Fallback used only if js/actors/units.js fails to load (keeps the battle booting, D19). Same contract, crude look.
const FC = { corporate: 0x22d3ff, rogue: 0xff6a1a, experimental: 0xa855f7, legendary: 0xffc23a };
const DUR = { attack: 0.8, attack_alt: 0.9, cast: 1.1, overdrive: 1.6, hit: 0.35, die: 1.2, victory: 2, deploy: 0.8 };
export const MODELS = {};
export function createUnit({ faction = 'corporate', role = 'tank' } = {}) {
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const h = role === 'tank' ? 2.0 : 1.7;
  const mat = new THREE.MeshStandardMaterial({ color: 0x2a3550, metalness: 0.7, roughness: 0.35, emissive: FC[faction] || FC.corporate, emissiveIntensity: 0.25 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(role === 'tank' ? 1.1 : 0.7, h * 0.5, 0.6), mat); torso.position.y = h * 0.62; body.add(torso);
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.6, h * 0.4, 0.4), mat); legs.position.y = h * 0.2; body.add(legs);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 0.4), mat); head.position.y = h * 0.95; body.add(head);
  for (const m of [torso, legs, head]) m.castShadow = true;
  const mk = (x, y, z) => { const o = new THREE.Object3D(); o.position.set(x, y, z); body.add(o); return o; };
  const sockets = { muzzle: mk(0, h * 0.62, 0.7), head: mk(0, h, 0), core: mk(0, h * 0.62, 0.2), hand: mk(0.4, h * 0.6, 0.3) };
  const L = new Set();
  let cur = 'idle', t = 0, dur = 1, fired = false, dead = false;
  return {
    root, body, sockets, height: h, radius: 0.6, role, faction,
    get dead() { return dead; },
    play(name) { cur = name; t = 0; fired = false; dead = false; dur = DUR[name] || Infinity; return dur; },
    update(dt) {
      t += dt;
      if (!fired && /attack|overdrive|cast/.test(cur) && t > Math.min(0.3, dur * 0.4)) { fired = true; for (const f of L) f(cur === 'cast' ? 'cast' : 'fire', { anim: cur, socket: sockets.muzzle }); }
      if (cur === 'die') { body.rotation.z = Math.min(1.4, t * 2); body.position.y = -Math.min(0.5, t * 0.4); if (t > dur) dead = true; }
      else if (t > dur) { cur = 'idle'; t = 0; body.rotation.z = 0; body.position.y = 0; }
      if (cur === 'idle') body.position.y = Math.sin(t * 2.5) * 0.02;
    },
    setFacing(y) { root.rotation.y = y; }, hitFlash() {}, setShield() {},
    onEvent(fn) { L.add(fn); return () => L.delete(fn); },
    dispose() { body.traverse((o) => o.geometry?.dispose()); mat.dispose(); },
  };
}
