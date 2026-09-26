import * as THREE from '../../../../lib/three/0.180.0/three.module.js';
import { mergeGeometries } from '../../../../lib/three/0.180.0/addons/utils/BufferGeometryUtils.js';

// Nexus frame-delivery drop-pod slung under a courier drone (the frame-swap set piece).
// const pod = createDropPod(); scene.add(pod.root); pod.root.position.set(x, groundY, z);
// await pod.play('land')  → drone lowers the pod from the sky, retro-flare + dust ring, drone lets go and hovers
// await pod.play('open')  → four petal doors fold down; stand a robot on pod.slot (it rides the pod when it leaves)
// await pod.play('close') → petals shut
// await pod.play('leave') → drone re-hooks and hauls the pod up and away; root hides when done
// Call pod.update(dt) every frame; pod.dispose() when finished. pod.state = idle|landing|landed|opening|open|closing|leaving|gone.
const PI = Math.PI;
const ease = (x) => x * x * (3 - 2 * x);
const easeOut = (x) => 1 - (1 - x) * (1 - x) * (1 - x);
const easeIn = (x) => x * x * x;
export const POD_DURATIONS = { land: 2.6, open: 1.1, close: 0.9, leave: 2.4 };

let MATS = null;
function mats() {
  if (MATS) return MATS;
  MATS = {
    shell: new THREE.MeshPhysicalMaterial({ color: 0xeef1f5, metalness: 0.35, roughness: 0.22, clearcoat: 0.8, clearcoatRoughness: 0.08, envMapIntensity: 1.2 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x1b1f26, metalness: 0.85, roughness: 0.3, envMapIntensity: 1.1 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xe8ecf0, metalness: 1, roughness: 0.1, envMapIntensity: 1.3 }),
    glow: new THREE.MeshStandardMaterial({ color: 0x000000, emissive: new THREE.Color(0.35, 0.8, 1.0), emissiveIntensity: 4 }),
    inner: new THREE.MeshStandardMaterial({ color: 0x10141a, emissive: new THREE.Color(0.25, 0.6, 1.0), emissiveIntensity: 0, roughness: 0.5 }),
    flare: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.7, 0.35).multiplyScalar(3), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
    dust: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.8, 0.85, 0.9), transparent: true, opacity: 0, depthWrite: false }),
  };
  return MATS;
}

const R = 0.78, H = 2.5;
function petalGeo(i) {
  // one quarter of an ogive shell, hinge line at its bottom edge (origin), shell rises along +y
  const pts = [];
  for (let k = 0; k <= 12; k++) { const t = k / 12, y = t * H; pts.push(new THREE.Vector2(R * Math.sqrt(Math.max(0, 1 - Math.pow(t, 2.2))) * (t < 0.1 ? 1 : 1) + 0.001, y)); }
  const shell = new THREE.LatheGeometry(pts, 10, -PI / 4 + 0.015, PI / 2 - 0.03);
  const stripe = new THREE.LatheGeometry(pts.slice(1, 10).map((p) => new THREE.Vector2(p.x + 0.012, p.y)), 2, -0.035, 0.07);
  const rim = new THREE.TorusGeometry(R + 0.01, 0.03, 4, 8, PI / 2 - 0.03); rim.rotateX(PI / 2); rim.rotateY(-PI / 4 + 0.015 + PI / 2 - (PI / 2 - 0.03)); rim.translate(0, 0.04, 0);
  return { shell, stripe, rim };
}

export function createDropPod() {
  const M = mats();
  const root = new THREE.Group(); root.name = 'dropPod';
  const pod = new THREE.Group(); root.add(pod);
  // base: landing skirt, legs, floor with a glow ring
  const base = mergeGeometries([
    new THREE.CylinderGeometry(R + 0.06, R + 0.18, 0.28, 24).translate(0, 0.14, 0),
    ...[0, 1, 2, 3].map((i) => new THREE.BoxGeometry(0.14, 0.5, 0.5).translate(0, 0.1, R + 0.2).rotateY(i * PI / 2 + PI / 4)),
  ]);
  pod.add(new THREE.Mesh(base, M.dark));
  const floorRing = new THREE.Mesh(new THREE.TorusGeometry(R - 0.12, 0.03, 4, 32).rotateX(PI / 2).translate(0, 0.3, 0), M.glow);
  pod.add(floorRing);
  const inner = new THREE.Mesh(new THREE.CylinderGeometry(R - 0.05, R - 0.05, 0.02, 24).translate(0, 0.29, 0), M.inner);
  pod.add(inner);
  const slot = new THREE.Object3D(); slot.name = 'pod:slot'; slot.position.y = 0.3; pod.add(slot);
  // petals, each on a hinge at the skirt's top edge
  const petals = [];
  for (let i = 0; i < 4; i++) {
    const g = petalGeo(i), hinge = new THREE.Group();
    const a = i * PI / 2;
    hinge.position.set(Math.sin(a) * R, 0.28, Math.cos(a) * R); hinge.rotation.y = a;
    const inside = new THREE.Group(); inside.position.set(0, 0, -R); hinge.add(inside);
    inside.add(new THREE.Mesh(g.shell, M.shell), new THREE.Mesh(g.stripe, M.glow), new THREE.Mesh(g.rim, M.chrome));
    pod.add(hinge); petals.push(hinge);
  }
  // nose cap + hook eye
  const cap = new THREE.Mesh(mergeGeometries([new THREE.CylinderGeometry(0.1, 0.22, 0.2, 16).translate(0, H + 0.2, 0), new THREE.TorusGeometry(0.1, 0.03, 6, 16).translate(0, H + 0.4, 0)]), M.chrome);
  pod.add(cap);
  const flare = new THREE.Mesh(new THREE.ConeGeometry(0.7, 2.2, 16, 1, true).rotateX(PI).translate(0, -1.1, 0), M.flare);
  pod.add(flare);
  // courier drone: X frame, four ducted rotors, winch cable down to the cap
  const drone = new THREE.Group(); root.add(drone);
  const body = mergeGeometries([
    new THREE.CylinderGeometry(0.9, 1.1, 0.45, 20),
    ...[0, 1, 2, 3].map((i) => new THREE.BoxGeometry(0.28, 0.18, 2.4).translate(0, 0, 1.2).rotateY(i * PI / 2 + PI / 4)),
  ]);
  drone.add(new THREE.Mesh(body, M.shell));
  drone.add(new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.5, 16).translate(0, 0.2, 0), M.dark));
  drone.add(new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.04, 4, 32).rotateX(PI / 2).translate(0, -0.2, 0), M.glow));
  const rotors = [];
  for (let i = 0; i < 4; i++) {
    const a = i * PI / 2 + PI / 4, x = Math.sin(a) * 2.3, z = Math.cos(a) * 2.3;
    const duct = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.1, 6, 24).rotateX(PI / 2), M.dark); duct.position.set(x, 0, z); drone.add(duct);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.73, 0.025, 4, 24).rotateX(PI / 2), M.glow); ring.position.set(x, -0.1, z); drone.add(ring);
    const blade = new THREE.Mesh(mergeGeometries([new THREE.BoxGeometry(1.3, 0.02, 0.14), new THREE.BoxGeometry(0.14, 0.02, 1.3)]), M.chrome);
    blade.position.set(x, 0.02, z); drone.add(blade); rotors.push(blade);
  }
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1, 6).translate(0, -0.5, 0), M.dark);
  drone.add(cable);
  const dust = new THREE.Mesh(new THREE.RingGeometry(0.6, 1.2, 40).rotateX(-PI / 2), M.dust);
  dust.position.y = 0.05; root.add(dust);
  root.traverse((o) => { if (o.isMesh && o !== flare && o !== dust) { o.castShadow = true; o.layers.enable(1); } });

  const HANG = H + 0.45;                 // drone height above the pod's base while carrying
  const HOVER = 7;
  const S = { state: 'idle', t: 0, name: null, dur: 0, resolve: null, open: 0, podY: 0, droneY: HANG, flare: 0, spin: 1, dustT: 0 };
  const setOpen = (u) => { S.open = u; for (const p of petals) p.rotation.x = u * 1.75; M.inner.emissiveIntensity = u * 2.2; };
  const place = () => {
    pod.position.y = S.podY; drone.position.y = S.droneY;
    const gap = S.droneY - (S.podY + H + 0.4);
    cable.visible = gap > 0.02; cable.scale.y = Math.max(0.01, gap); cable.position.y = -0.2;
    M.flare.opacity = S.flare; flare.scale.set(0.6 + S.flare * 0.6, 0.3 + S.flare, 0.6 + S.flare * 0.6);
  };
  S.podY = 60; S.droneY = 60 + HANG; place(); root.visible = false;

  const api = {
    root, pod, drone, slot, durations: POD_DURATIONS,
    get state() { return S.state; },
    play(name) {
      if (!POD_DURATIONS[name]) return Promise.resolve();
      S.resolve?.();
      S.name = name; S.t = 0; S.dur = POD_DURATIONS[name];
      S.state = { land: 'landing', open: 'opening', close: 'closing', leave: 'leaving' }[name];
      root.visible = true;
      if (name === 'land') { S.podY = 45; S.droneY = 45 + HANG; setOpen(0); }
      return new Promise((r) => { S.resolve = r; });
    },
    update(dt) {
      for (const b of rotors) b.rotation.y += dt * 40 * S.spin;
      if (S.dustT > 0) { S.dustT -= dt; const u = 1 - S.dustT / 1.2; dust.scale.setScalar(1 + u * 3.5); M.dust.opacity = 0.45 * (1 - u); }
      if (!S.name) return;
      S.t += dt;
      const u = Math.min(1, S.t / S.dur);
      if (S.name === 'land') {
        const d = u < 0.8 ? 45 * (1 - easeOut(u / 0.8)) + 0.0 : 0;
        S.podY = d;
        S.droneY = u < 0.8 ? d + HANG : HANG + (HOVER - HANG) * ease((u - 0.8) / 0.2);
        S.flare = u > 0.55 && u < 0.85 ? Math.sin((u - 0.55) / 0.3 * PI) : 0;
        if (u >= 0.8 && S.dustT <= 0 && S.state === 'landing') { S.dustT = 1.2; S.state = 'touchdown'; }
      } else if (S.name === 'open') setOpen(ease(u));
      else if (S.name === 'close') setOpen(1 - ease(u));
      else if (S.name === 'leave') {
        if (S.open > 0) setOpen(Math.max(0, S.open - dt * 2));
        const hook = Math.min(1, u / 0.25), lift = Math.max(0, (u - 0.25) / 0.75);
        const y = 55 * easeIn(lift);
        S.droneY = lift > 0 ? HANG + y : HOVER + (HANG - HOVER) * ease(hook);
        S.podY = y;
        root.position.x += dt * 6 * lift;
        S.flare = lift > 0 && lift < 0.3 ? Math.sin(lift / 0.3 * PI) * 0.8 : 0;
      }
      place();
      if (u >= 1) {
        const n = S.name; S.name = null;
        S.state = { land: 'landed', open: 'open', close: 'landed', leave: 'gone' }[n];
        if (n === 'leave') root.visible = false;
        const r = S.resolve; S.resolve = null; r?.();
      }
    },
    dispose() {
      root.removeFromParent();
      root.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
    },
  };
  return api;
}
