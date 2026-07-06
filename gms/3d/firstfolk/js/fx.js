// Particles & flourishes: dust bursts, wood chips, chimney smoke, prayer
// motes (faith made visible), fireflies, drifting leaves, rain clouds,
// lightning, expanding blessing rings, and floating "+2 🪵" text sprites.

import * as THREE from 'three';
import { SEA } from './config.js';
import { rand, clamp } from './utils.js';

let scene = null, T = null, W = null, lite = false;

const bursts = [];        // one-shot particle groups
const floaters = [];      // text sprites
const rings = [];         // expanding rings
const rains = [];         // active rain areas
const bolts = [];         // lightning meshes
const smokeSrc = [];      // {x,y,z,rate,acc} chimneys & fires

let smoke, smokeGeo, smokeN = 240, smokeP;
let motes, motesGeo, motesN = 200, motesP;
let flies, fliesGeo, fliesN = 90, fliesP;
let leaves, leavesGeo, leavesN = 60, leavesP;
let rainPts, rainGeo, rainN = 500, rainP;

function pool(n, size, color, opacity, blending = THREE.NormalBlending) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { pos[i * 3 + 1] = -999; }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color, size, transparent: true, opacity, depthWrite: false, blending });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  scene.add(pts);
  return { pts, geo, data: Array.from({ length: n }, () => ({ life: 0 })) };
}

export function initFx(_scene, _T, _W, _lite) {
  scene = _scene; T = _T; W = _W; lite = _lite;
  smokeP = pool(smokeN, 0.9, 0x9aa4a8, 0.35);
  smoke = smokeP.pts; smokeGeo = smokeP.geo;
  motesP = pool(motesN, 0.5, 0x8effd8, 0.85, THREE.AdditiveBlending);
  motes = motesP.pts; motesGeo = motesP.geo;
  fliesP = pool(fliesN, 0.35, 0xd8ff9a, 0.9, THREE.AdditiveBlending);
  flies = fliesP.pts; fliesGeo = fliesP.geo;
  for (const d of fliesP.data) { d.life = 1; d.x = rand(-70, 70); d.z = rand(-70, 70); d.y0 = 0; d.seed = rand(0, 20); }
  leavesP = pool(leavesN, 0.4, 0x9ac26a, 0.8);
  leaves = leavesP.pts; leavesGeo = leavesP.geo;
  for (const d of leavesP.data) { d.life = 1; d.x = rand(-70, 70); d.z = rand(-70, 70); d.y = rand(2, 10); d.seed = rand(0, 20); }
  rainP = pool(rainN, 0.55, 0xa8c8e8, 0.55);
  rainPts = rainP.pts; rainGeo = rainP.geo;
}

export function addSmokeSource(x, y, z, rate = 1) {
  const s = { x, y, z, rate, acc: 0, on: true };
  smokeSrc.push(s);
  return s;
}
export function removeSmokeSource(s) { const i = smokeSrc.indexOf(s); if (i >= 0) smokeSrc.splice(i, 1); }

let burstGeoCache = null;
export function burst(x, y, z, { color = 0xcbb98a, n = 10, spread = 0.8, up = 2.2, size = 0.5, life = 0.8 } = {}) {
  if (!burstGeoCache) burstGeoCache = new THREE.BufferGeometry();
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3), vel = [];
  for (let i = 0; i < n; i++) {
    pos[i * 3] = x + rand(-0.2, 0.2); pos[i * 3 + 1] = y; pos[i * 3 + 2] = z + rand(-0.2, 0.2);
    vel.push([rand(-spread, spread), rand(up * 0.4, up), rand(-spread, spread)]);
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color, size, transparent: true, opacity: 0.95, depthWrite: false });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  scene.add(pts);
  bursts.push({ pts, geo, mat, vel, t: 0, life });
}

const floaterTex = new Map();
function textTexture(text) {
  if (floaterTex.has(text)) return floaterTex.get(text);
  const c = document.createElement('canvas');
  c.width = 256; c.height = 80;
  const g = c.getContext('2d');
  g.font = '700 44px -apple-system, Segoe UI, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = 'rgba(0,0,0,0.7)'; g.shadowBlur = 9;
  g.fillStyle = '#fdf4d2';
  g.fillText(text, 128, 40);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  floaterTex.set(text, t);
  return t;
}
export function floater(x, y, z, text) {
  if (lite && floaters.length > 8) return;
  const mat = new THREE.SpriteMaterial({ map: textTexture(text), transparent: true, depthWrite: false });
  const sp = new THREE.Sprite(mat);
  sp.scale.set(5.4, 1.7, 1);
  sp.position.set(x, y, z);
  scene.add(sp);
  floaters.push({ sp, t: 0 });
}

export function ringPulse(x, z, color = 0xe8d9a0, maxR = 9) {
  const geo = new THREE.RingGeometry(0.9, 1, 48).rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false });
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, T.heightAt(x, z) + 0.15, z);
  scene.add(m);
  rings.push({ m, t: 0, maxR });
}

export function startRain(x, z, r, dur = 18) {
  const cloudGeo = new THREE.CircleGeometry(r * 0.9, 26).rotateX(-Math.PI / 2);
  const cloud = new THREE.Mesh(cloudGeo, new THREE.MeshBasicMaterial({ color: 0x3a4654, transparent: true, opacity: 0.0, depthWrite: false }));
  cloud.position.set(x, 24, z);
  scene.add(cloud);
  rains.push({ x, z, r, dur, t: 0, cloud });
}
export const isRaining = () => rains.length > 0;

// quick arrow tracer between two points
export function tracer(x0, y0, z0, x1, y1, z1) {
  const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1)]);
  const mat = new THREE.LineBasicMaterial({ color: 0xf4e6c0, transparent: true, opacity: 0.9 });
  const line = new THREE.Line(geo, mat);
  scene.add(line);
  bolts.push({ line, light: null, t: 0.22 });   // reuse bolt fade-out
}

export function lightning(x, z) {
  const pts = [];
  let px = x, pz = z, py = T.heightAt(x, z);
  const top = 30;
  const segs = 9;
  for (let i = 0; i <= segs; i++) {
    const k = i / segs;
    pts.push(new THREE.Vector3(
      x + (i === 0 ? 0 : rand(-2.2, 2.2)) * (1 - k) * 1.4,
      py + (top - py) * k,
      z + (i === 0 ? 0 : rand(-2.2, 2.2)) * (1 - k) * 1.4));
  }
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const mat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1 });
  const line = new THREE.Line(geo, mat);
  scene.add(line);
  const light = new THREE.PointLight(0xcfe0ff, 90, 60);
  light.position.set(x, 12, z);
  scene.add(light);
  bolts.push({ line, light, t: 0 });
  burst(x, py + 0.3, z, { color: 0xffe89a, n: 16, spread: 2.4, up: 4, size: 0.7, life: 0.7 });
}

function emit(P, x, y, z, d0) {
  for (const d of P.data) {
    if (d.life <= 0) {
      Object.assign(d, d0, { x, y, z });
      return;
    }
  }
}
export function moteAt(x, y, z) { emit(motesP, x + rand(-0.4, 0.4), y, z + rand(-0.4, 0.4), { life: rand(2.2, 3.4), vy: rand(1.2, 2) }); }
export function smokePuffAt(x, y, z) { emit(smokeP, x + rand(-0.2, 0.2), y, z + rand(-0.2, 0.2), { life: rand(2.5, 4), vy: rand(0.5, 0.9) }); }

export function tickFx(dt, t) {
  // chimney smoke
  for (const s of smokeSrc) {
    if (!s.on) continue;
    s.acc += dt * s.rate;
    while (s.acc > 0.4) { s.acc -= 0.4; smokePuffAt(s.x, s.y, s.z); }
  }
  stepPool(smokeP, dt, (d) => { d.y += d.vy * dt; d.x += Math.sin(t + d.y) * dt * 0.3; });
  stepPool(motesP, dt, (d) => { d.y += d.vy * dt; d.x += Math.sin(t * 2 + d.y * 2) * dt * 0.25; });

  // fireflies hover near the ground at night
  const night = W.nightness();
  flies.material.opacity = night * 0.9;
  if (night > 0.05) {
    const a = fliesGeo.attributes.position.array;
    for (let i = 0; i < fliesN; i++) {
      const d = fliesP.data[i];
      a[i * 3] = d.x + Math.sin(t * 0.7 + d.seed) * 3;
      a[i * 3 + 2] = d.z + Math.cos(t * 0.5 + d.seed * 2) * 3;
      const gy = T.heightAt(a[i * 3], a[i * 3 + 2]);
      a[i * 3 + 1] = (gy > SEA ? gy : SEA) + 1 + Math.sin(t * 1.8 + d.seed * 3) * 0.6;
    }
    fliesGeo.attributes.position.needsUpdate = true;
  }
  // leaves drift by day
  leaves.material.opacity = (1 - night) * 0.55;
  {
    const a = leavesGeo.attributes.position.array;
    for (let i = 0; i < leavesN; i++) {
      const d = leavesP.data[i];
      d.x += dt * (0.5 + Math.sin(t * 0.3 + d.seed) * 0.4);
      d.y -= dt * 0.25;
      if (d.x > 95) d.x = -95;
      const gy = T.heightAt(d.x, d.z);
      if (d.y < gy + 0.2) d.y = gy + rand(3, 9);
      a[i * 3] = d.x; a[i * 3 + 1] = d.y; a[i * 3 + 2] = d.z + Math.sin(t * 0.6 + d.seed * 2) * 1.5;
    }
    leavesGeo.attributes.position.needsUpdate = true;
  }
  // rain
  for (const r of [...rains]) {
    r.t += dt;
    r.cloud.material.opacity = Math.min(0.5, r.t * 1.2) * (r.t > r.dur - 1.5 ? Math.max(0, (r.dur - r.t) / 1.5) : 1);
    if (r.t > r.dur) {
      scene.remove(r.cloud);
      rains.splice(rains.indexOf(r), 1);
    }
  }
  {
    const a = rainGeo.attributes.position.array;
    let need = rains.length ? Math.min(rainN, rains.reduce((s, r) => s + r.r * r.r * 0.9, 0)) : 0;
    for (let i = 0; i < rainN; i++) {
      const d = rainP.data[i];
      if (d.life <= 0 && i < need && rains.length) {
        const r = rains[i % rains.length];
        const ang = rand(0, Math.PI * 2), rr = Math.sqrt(Math.random()) * r.r;
        d.x = r.x + Math.cos(ang) * rr; d.z = r.z + Math.sin(ang) * rr;
        d.y = rand(14, 23); d.life = 5;
      }
      if (d.life > 0) {
        d.y -= dt * 22;
        const gy = Math.max(T.heightAt(d.x, d.z), SEA);
        if (d.y <= gy) { d.life = 0; d.y = -999; }
        a[i * 3] = d.x; a[i * 3 + 1] = d.y; a[i * 3 + 2] = d.z;
      }
    }
    rainGeo.attributes.position.needsUpdate = true;
  }
  // bursts
  for (const b of [...bursts]) {
    b.t += dt;
    const a = b.geo.attributes.position.array;
    for (let i = 0; i < b.vel.length; i++) {
      a[i * 3] += b.vel[i][0] * dt;
      a[i * 3 + 1] += b.vel[i][1] * dt;
      a[i * 3 + 2] += b.vel[i][2] * dt;
      b.vel[i][1] -= 5 * dt;
    }
    b.geo.attributes.position.needsUpdate = true;
    b.mat.opacity = Math.max(0, 0.95 * (1 - b.t / b.life));
    if (b.t > b.life) { scene.remove(b.pts); b.geo.dispose(); bursts.splice(bursts.indexOf(b), 1); }
  }
  // floaters
  for (const f of [...floaters]) {
    f.t += dt;
    f.sp.position.y += dt * 1.6;
    f.sp.material.opacity = Math.max(0, 1 - f.t / 1.6);
    if (f.t > 1.6) { scene.remove(f.sp); floaters.splice(floaters.indexOf(f), 1); }
  }
  // rings
  for (const r of [...rings]) {
    r.t += dt;
    const k = r.t / 1.1;
    r.m.scale.setScalar(1 + k * r.maxR);
    r.m.material.opacity = Math.max(0, 0.85 * (1 - k));
    if (k >= 1) { scene.remove(r.m); rings.splice(rings.indexOf(r), 1); }
  }
  // lightning
  for (const b of [...bolts]) {
    b.t += dt;
    b.line.material.opacity = Math.max(0, 1 - b.t * 3);
    if (b.light) b.light.intensity = Math.max(0, 90 * (1 - b.t * 4));
    if (b.t > 0.4) { scene.remove(b.line); if (b.light) scene.remove(b.light); bolts.splice(bolts.indexOf(b), 1); }
  }
}

function stepPool(P, dt, mv) {
  const a = P.geo.attributes.position.array;
  let any = false;
  for (let i = 0; i < P.data.length; i++) {
    const d = P.data[i];
    if (d.life > 0) {
      d.life -= dt;
      mv(d);
      a[i * 3] = d.x; a[i * 3 + 1] = d.life > 0 ? d.y : -999; a[i * 3 + 2] = d.z;
      any = true;
    }
  }
  if (any) P.geo.attributes.position.needsUpdate = true;
}
