// Transient effects: tweens, arrow arcs, damage floaties, puffs, pulses.
// Everything registers into one list advanced by fxUpdate(dt).
import * as THREE from 'three';
import { easeOut, easeInOut } from './utils.js';

let scene = null;
const live = [];

export function initFx(sc) { scene = sc; }

export function fxUpdate(dt) {
  for (let i = live.length - 1; i >= 0; i--) {
    const f = live[i];
    f.t += dt;
    const done = f.t >= f.dur;
    f.step(Math.min(f.t / f.dur, 1));
    if (done) { f.end?.(); live.splice(i, 1); }
  }
}

function add(dur, step, end) { live.push({ t: 0, dur, step, end }); }

export function tweenPromise(dur, step) {
  return new Promise(res => add(dur, step, res));
}

// march a mesh through world points; light hop per segment
export function moveAlong(mesh, points, secPerStep = 0.16) {
  if (!points.length) return Promise.resolve();
  const path = [mesh.position.clone(), ...points];
  const total = (path.length - 1) * secPerStep;
  return tweenPromise(total, (t) => {
    const ft = t * (path.length - 1);
    const i = Math.min(Math.floor(ft), path.length - 2);
    const lt = ft - i;
    mesh.position.lerpVectors(path[i], path[i + 1], lt);
    mesh.position.y += Math.sin(lt * Math.PI) * 0.08;
    const dx = path[i + 1].x - path[i].x, dz = path[i + 1].z - path[i].z;
    if (dx * dx + dz * dz > 1e-6) mesh.rotation.y = Math.atan2(-dz, dx) + Math.PI / 2;
  });
}

const arrowGeo = new THREE.ConeGeometry(0.035, 0.34, 5);
const arrowMat = new THREE.MeshBasicMaterial({ color: 0x3a2d1c });
export function arrowShot(from, to, dur = 0.42) {
  const m = new THREE.Mesh(arrowGeo, arrowMat);
  scene.add(m);
  const peak = Math.max(from.y, to.y) + from.distanceTo(to) * 0.35 + 0.4;
  const a = from.clone(), b = to.clone();
  const prev = a.clone();
  return tweenPromise(dur, (t) => {
    const x = a.x + (b.x - a.x) * t;
    const z = a.z + (b.z - a.z) * t;
    const y = (1 - t) * (1 - t) * a.y + 2 * (1 - t) * t * peak + t * t * b.y;
    prev.copy(m.position);
    m.position.set(x, y, z);
    if (t > 0.02) {
      const d = m.position.clone().sub(prev).normalize();
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
    }
  }).then(() => { scene.remove(m); });
}

export function floatText(pos, text, color = '#fff', size = 0.9) {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 96;
  const g = cv.getContext('2d');
  g.font = 'bold 56px system-ui';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 10; g.strokeStyle = 'rgba(10,14,8,.85)';
  g.strokeText(text, 128, 48);
  g.fillStyle = color; g.fillText(text, 128, 48);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sp.scale.set(1.6 * size, 0.6 * size, 1);
  sp.position.copy(pos);
  sp.renderOrder = 40;
  scene.add(sp);
  add(1.05, (t) => {
    sp.position.y = pos.y + easeOut(t) * 0.9;
    sp.material.opacity = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;
  }, () => { scene.remove(sp); tex.dispose(); sp.material.dispose(); });
}

const puffGeo = new THREE.SphereGeometry(0.09, 6, 5);
export function puff(pos, color = 0xcccccc, n = 7, spread = 0.5) {
  const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 });
  const parts = [];
  for (let i = 0; i < n; i++) {
    const p = new THREE.Mesh(puffGeo, m.clone());
    p.position.copy(pos);
    const a = Math.random() * Math.PI * 2;
    p.userData.v = new THREE.Vector3(Math.cos(a) * spread, 0.6 + Math.random() * 0.8, Math.sin(a) * spread);
    p.userData.s = 0.7 + Math.random() * 1.1;
    scene.add(p);
    parts.push(p);
  }
  add(0.7, (t) => {
    for (const p of parts) {
      p.position.addScaledVector(p.userData.v, 0.016);
      p.userData.v.y -= 0.05;
      p.scale.setScalar((1 - t * 0.6) * p.userData.s);
      p.material.opacity = 0.85 * (1 - t);
    }
  }, () => { for (const p of parts) { scene.remove(p); p.material.dispose(); } });
}

export function ringPulse(pos, color = 0xffffff) {
  const g = new THREE.RingGeometry(0.5, 0.62, 24);
  g.rotateX(-Math.PI / 2);
  const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false });
  const ring = new THREE.Mesh(g, m);
  ring.position.copy(pos).setY(pos.y + 0.04);
  ring.renderOrder = 12;
  scene.add(ring);
  add(0.55, (t) => {
    ring.scale.setScalar(1 + easeOut(t) * 1.6);
    m.opacity = 0.9 * (1 - t);
  }, () => { scene.remove(ring); g.dispose(); m.dispose(); });
}

// building collapse: sink + tip + dust
export function collapse(mesh) {
  puff(mesh.position.clone().setY(mesh.position.y + 0.2), 0x8a7f6a, 12, 0.8);
  const startY = mesh.position.y;
  return tweenPromise(0.5, (t) => {
    mesh.position.y = startY - easeInOut(t) * 0.7;
    mesh.rotation.z = t * 0.5;
    mesh.scale.setScalar(1 - t * 0.4);
  });
}

// gentle camera-space flash for hits — a quick emissive plate under target
export function hitFlash(pos) {
  const g = new THREE.CircleGeometry(0.55, 18);
  g.rotateX(-Math.PI / 2);
  const m = new THREE.MeshBasicMaterial({ color: 0xffdd66, transparent: true, opacity: 0.7, depthWrite: false });
  const c = new THREE.Mesh(g, m);
  c.position.copy(pos).setY(pos.y + 0.03);
  c.renderOrder = 11;
  scene.add(c);
  add(0.3, (t) => { m.opacity = 0.7 * (1 - t); }, () => { scene.remove(c); g.dispose(); m.dispose(); });
}
