// LASTWALL — juice: hitstop, screenshake, tracers, blood, debris pools,
// explosions, collapse spectacle, pickup visuals, floating damage-ish toasts.
import * as THREE from 'three';
import { CFG, LITE } from './config.js';
import { rand, pick } from './utils.js';
import { mat } from './models.js';

let scene = null;
const BOX = new THREE.BoxGeometry(1, 1, 1);
BOX.userData.shared = true; // never dispose on level teardown
let shake = 0, stopT = 0, slowT = 0;
const tracers = [], debris = [], rings = [], flashes = [];
let bloodIM = null, bloodDat = [], bloodActive = false;
// cached materials so debris/pickups create zero per-instance GPU resources
const chunkMats = new Map();
const chunkMat = c => { let m = chunkMats.get(c); if (!m) { m = mat(c); m.userData.shared = true; chunkMats.set(c, m); } return m; };
// module-level scratch — tickFx runs every frame, no per-frame allocations
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1), _p = new THREE.Vector3(), _hide = new THREE.Vector3(0, -100, 0);

export function initFx(sc) {
  scene = sc;
  tracers.length = debris.length = rings.length = flashes.length = 0;
  shake = 0; stopT = 0; slowT = 0; bloodActive = false;
  // blood: one instanced mesh pool
  const n = CFG.maxBlood;
  bloodIM = new THREE.InstancedMesh(new THREE.BoxGeometry(.14, .14, .14), new THREE.MeshBasicMaterial({ color: 0x4d0a06 }), n);
  bloodIM.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  bloodIM.frustumCulled = false;
  bloodDat = [];
  for (let i = 0; i < n; i++) bloodDat.push({ live: 0 });
  scene.add(bloodIM);
}

export const addShake = a => shake = Math.min(1.4, shake + a);
export const hitstop = t => stopT = Math.max(stopT, t);
export const slowmo = t => slowT = Math.max(slowT, t);
// returns dt multiplier for the sim + advances fx timers
export function timeScale(dt) {
  if (stopT > 0) { stopT -= dt; return 0.02; }
  if (slowT > 0) { slowT -= dt; return 0.3; }
  return 1;
}

export function applyShake(camera, dt) {
  if (shake > 0.005) {
    camera.position.x += (Math.random() - .5) * shake * .5;
    camera.position.y += (Math.random() - .5) * shake * .4;
    shake *= Math.exp(-6 * dt);
  }
}

export function tracer(from, to, color = 0xffd28a) {
  const g = new THREE.BufferGeometry().setFromPoints([from, to]);
  const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 }));
  scene.add(l); tracers.push({ l, t: 0.09 });
}

export function blood(pos, n = 8, pow = 4) {
  bloodActive = true;
  let placed = 0;
  for (const d of bloodDat) {
    if (d.live > 0) continue;
    d.live = rand(.5, 1.1); d.x = pos.x; d.y = pos.y; d.z = pos.z;
    d.vx = rand(-1, 1) * pow; d.vy = rand(.5, 1.4) * pow; d.vz = rand(-1, 1) * pow;
    if (++placed >= n) break;
  }
}

// tumbling box debris (crates, gibs, collapse chunks)
export function chunk(pos, vel, size = .5, color = 0x5a4a3a, life = 3) {
  if (debris.length > CFG.maxDebris) { const d = debris.shift(); scene.remove(d.m); }
  const m = new THREE.Mesh(BOX, chunkMat(color));
  m.scale.set(size * rand(.6, 1.4), size * rand(.6, 1.4), size * rand(.6, 1.4));
  m.position.copy(pos);
  scene.add(m);
  debris.push({ m, vx: vel.x, vy: vel.y, vz: vel.z, rx: rand(-4, 4), rz: rand(-4, 4), t: life, floorY: null });
}

export function gib(mesh, pos, vel) { // detached body part mesh becomes debris
  if (debris.length > CFG.maxDebris) { const d = debris.shift(); scene.remove(d.m); }
  scene.attach ? scene.attach(mesh) : scene.add(mesh);
  mesh.position.copy(pos);
  debris.push({ m: mesh, vx: vel.x, vy: vel.y, vz: vel.z, rx: rand(-8, 8), rz: rand(-8, 8), t: 5, floorY: null });
}

export function ring(pos, color = 0xffb056, maxR = 8, life = .45) {
  const g = new THREE.RingGeometry(0.5, 0.75, 26);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .9, side: THREE.DoubleSide }));
  m.rotation.x = -Math.PI / 2; m.position.copy(pos); m.position.y += .15;
  scene.add(m); rings.push({ m, t: 0, life, maxR });
}

export function flash(pos, color = 0xffca7a, size = 2.4, life = .18) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(size, 8, 6), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .95 }));
  m.position.copy(pos); scene.add(m); flashes.push({ m, t: 0, life });
}

export function explosion(pos, r = 5) {
  flash(pos, 0xffca7a, r * .55, .22);
  ring(pos, 0xff7a3a, r * 1.6, .5);
  blood(pos, 4, 6);
  for (let i = 0; i < (LITE ? 6 : 12); i++) chunk(pos, new THREE.Vector3(rand(-1, 1) * 9, rand(4, 12), rand(-1, 1) * 9), .3, pick([0x4a3a2c, 0x6a5a4a, 0x2e2620]));
  addShake(.7); hitstop(.06);
}

// span collapse: rain of chunks over the rect + dust + big shake
export function collapseFx(box) {
  const n = LITE ? 26 : 54;
  for (let i = 0; i < n; i++) {
    const x = rand(box.x0, box.x1), z = rand(box.z0, box.z1), y = CFG.wallH - rand(0, 3);
    chunk(new THREE.Vector3(x, y, z), new THREE.Vector3(rand(-2, 2), rand(-3, .5), rand(-2, 2)), rand(.7, 1.8), pick([0x4a4038, 0x3a322c, 0x2e2823]), 4.5);
  }
  for (let i = 0; i < 5; i++) flash(new THREE.Vector3(rand(box.x0, box.x1), CFG.wallH - 2, rand(box.z0, box.z1)), 0x8a7a66, 3.5, .8);
  addShake(1.3);
}

// pickup visual: glowing box + ring, bobs & spins (tick moves them).
// Geometries + materials are shared per type — orbs spawn per kill, so
// per-instance GPU resources here would leak across a 100-level run.
const PICKUP_STYLE = {
  boost: [0xff5a36, '⚡'], med: [0x7fe07f, '✚'], serum: [0x35ff88, '⬢'],
  loot: [0xffb056, '▣'], super: [0xa97fff, '★'],
};
const pickGeoCore = new THREE.BoxGeometry(.55, .55, .55);
const pickGeoRing = new THREE.TorusGeometry(.75, .05, 6, 20);
pickGeoCore.userData.shared = pickGeoRing.userData.shared = true;
const pickMats = {};
export function pickupMesh(type) {
  const [color] = PICKUP_STYLE[type] || PICKUP_STYLE.loot;
  let pm = pickMats[type];
  if (!pm) {
    pm = pickMats[type] = { core: mat(0x1a1410, color, 1.4), ring: mat(0x1a1410, color, .9) };
    pm.core.userData.shared = pm.ring.userData.shared = true;
  }
  const g = new THREE.Group();
  const core = new THREE.Mesh(pickGeoCore, pm.core);
  const rg = new THREE.Mesh(pickGeoRing, pm.ring);
  rg.rotation.x = Math.PI / 2;
  g.add(core, rg); g.userData.spin = true;
  return g;
}

export function tickFx(dt, t) {
  for (let i = tracers.length - 1; i >= 0; i--) { const tr = tracers[i]; tr.t -= dt; tr.l.material.opacity = tr.t / .09; if (tr.t <= 0) { scene.remove(tr.l); tr.l.geometry.dispose(); tracers.splice(i, 1); } }
  // blood — skipped entirely (no compose, no GPU upload) while nothing is live
  if (bloodActive) {
    let live = 0;
    bloodDat.forEach((d, i) => {
      if (d.live <= 0) { _m4.compose(_hide, _q, _s.setScalar(1)); bloodIM.setMatrixAt(i, _m4); return; }
      live++;
      d.live -= dt;
      d.vy -= 26 * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
      if (d.y < CFG.wallH + .06 && d.vy < 0) { d.y = CFG.wallH + .06; d.vy = 0; d.vx *= .8; d.vz *= .8; }
      _p.set(d.x, d.y, d.z); _m4.compose(_p, _q, _s.setScalar(Math.min(1, d.live * 2)));
      bloodIM.setMatrixAt(i, _m4);
    });
    bloodIM.instanceMatrix.needsUpdate = true;
    if (live === 0) bloodActive = false; // this pass just wrote the hides
  }
  // debris
  for (let i = debris.length - 1; i >= 0; i--) {
    const d = debris[i]; d.t -= dt;
    d.vy -= 26 * dt;
    d.m.position.x += d.vx * dt; d.m.position.y += d.vy * dt; d.m.position.z += d.vz * dt;
    d.m.rotation.x += d.rx * dt; d.m.rotation.z += d.rz * dt;
    if (d.m.position.y < .3) { d.m.position.y = .3; d.vy *= -.3; d.vx *= .7; d.vz *= .7; d.rx *= .6; d.rz *= .6; }
    if (d.t <= 0) { scene.remove(d.m); debris.splice(i, 1); }
  }
  for (let i = rings.length - 1; i >= 0; i--) {
    const r = rings[i]; r.t += dt;
    const k = r.t / r.life;
    r.m.scale.setScalar(1 + k * r.maxR); r.m.material.opacity = .9 * (1 - k);
    if (k >= 1) { scene.remove(r.m); r.m.geometry.dispose(); rings.splice(i, 1); }
  }
  for (let i = flashes.length - 1; i >= 0; i--) {
    const f = flashes[i]; f.t += dt;
    const k = f.t / f.life;
    f.m.material.opacity = .95 * (1 - k); f.m.scale.setScalar(1 + k * .8);
    if (k >= 1) { scene.remove(f.m); f.m.geometry.dispose(); flashes.splice(i, 1); }
  }
}
