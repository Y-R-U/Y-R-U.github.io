// Sparks, smoke, dust and shockwaves. Two pooled Points systems and a handful
// of expanding rings — no per-effect allocations once the game is running.

import * as THREE from 'three';
import { scene, quality } from './render.js';
import { rand, clamp01 } from './utils.js';

const SPARK_MAX = 420;
const SMOKE_MAX = 260;

let sparks = null;
let smoke = null;
const rings = [];

function softTexture(inner, outer) {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, inner);
  grad.addColorStop(1, outer);
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const POINT_VERT = `
attribute float size;
varying vec3 vColor;
varying float vAlpha;
attribute float alpha;
void main() {
  vColor = color;
  vAlpha = alpha;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * (340.0 / max(1.0, -mv.z));
  gl_Position = projectionMatrix * mv;
}`;

const POINT_FRAG = `
uniform sampler2D map;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec4 t = texture2D(map, gl_PointCoord);
  if (t.a < 0.02) discard;
  gl_FragColor = vec4(vColor, vAlpha) * t;
}`;

function makePool(max, mat) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(max * 3);
  const col = new Float32Array(max * 3);
  const siz = new Float32Array(max);
  const alp = new Float32Array(max);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(siz, 1));
  geo.setAttribute('alpha', new THREE.BufferAttribute(alp, 1));
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 5;
  const p = [];
  for (let i = 0; i < max; i++) {
    p.push({ alive: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 1, age: 0, size: 1, grow: 0, r: 1, g: 1, b: 1, grav: 0, drag: 0.9 });
  }
  return { pts, geo, pos, col, siz, alp, max, p, next: 0 };
}

export function initParticles() {
  if (sparks) return;
  const sparkMat = new THREE.ShaderMaterial({
    uniforms: { map: { value: softTexture('rgba(255,255,255,1)', 'rgba(255,170,40,0)') } },
    vertexShader: POINT_VERT, fragmentShader: POINT_FRAG,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true,
  });
  const smokeMat = new THREE.ShaderMaterial({
    uniforms: { map: { value: softTexture('rgba(255,255,255,0.8)', 'rgba(255,255,255,0)') } },
    vertexShader: POINT_VERT, fragmentShader: POINT_FRAG,
    transparent: true, depthWrite: false, vertexColors: true,
  });
  sparks = makePool(SPARK_MAX, sparkMat);
  smoke = makePool(SMOKE_MAX, smokeMat);
  scene.add(sparks.pts);
  scene.add(smoke.pts);
}

function emit(pool, x, y, z, vx, vy, vz, life, size, color, grav, drag, grow) {
  if (!pool) return;
  const p = pool.p[pool.next];
  pool.next = (pool.next + 1) % pool.max;
  p.alive = true;
  p.x = x; p.y = y; p.z = z;
  p.vx = vx; p.vy = vy; p.vz = vz;
  p.life = life; p.age = 0; p.size = size; p.grow = grow || 0;
  p.r = ((color >> 16) & 255) / 255;
  p.g = ((color >> 8) & 255) / 255;
  p.b = (color & 255) / 255;
  p.grav = grav; p.drag = drag;
}

const budget = () => quality.particles || 1;

// ---------------------------------------------------------------------------
// Emitters
// ---------------------------------------------------------------------------
export function sparkBurst(pos, dir, count = 12, color = 0xffcc55, speed = 12) {
  const n = Math.max(2, Math.round(count * budget()));
  for (let i = 0; i < n; i++) {
    const sp = rand(speed * 0.35, speed);
    emit(sparks, pos.x, pos.y, pos.z,
      (dir.x + rand(-0.7, 0.7)) * sp,
      (dir.y + rand(0.1, 1.0)) * sp,
      (dir.z + rand(-0.7, 0.7)) * sp,
      rand(0.28, 0.7), rand(0.5, 1.2), color, -26, 0.86, 0);
  }
}

export function explode(pos, count = 22, color = 0xff8a2a) {
  const n = Math.max(4, Math.round(count * budget()));
  for (let i = 0; i < n; i++) {
    emit(sparks, pos.x, pos.y, pos.z,
      rand(-1, 1) * 12, rand(0.2, 1.4) * 12, rand(-1, 1) * 12,
      rand(0.4, 1.0), rand(1.2, 3.0), color, -14, 0.9, 2.4);
  }
  for (let i = 0; i < n * 0.6; i++) {
    emit(smoke, pos.x, pos.y, pos.z,
      rand(-1, 1) * 5, rand(0.4, 1.6) * 5, rand(-1, 1) * 5,
      rand(1.0, 2.2), rand(2.2, 4.6), 0x3a3a3a, 1.5, 0.94, 5.5);
  }
  ring(pos, color);
}

export function smokePuff(pos, count = 5, color = 0x9aa3ad, size = 2.0, up = 2.5) {
  const n = Math.max(1, Math.round(count * budget()));
  for (let i = 0; i < n; i++) {
    emit(smoke, pos.x + rand(-0.4, 0.4), pos.y, pos.z + rand(-0.4, 0.4),
      rand(-1.4, 1.4), rand(0.4, 1) * up, rand(-1.4, 1.4),
      rand(0.7, 1.6), rand(size * 0.6, size), color, 1.2, 0.93, 3.4);
  }
}

export function tyreSmoke(pos, amount) {
  if (Math.random() > amount * budget()) return;
  emit(smoke, pos.x + rand(-0.3, 0.3), pos.y + 0.2, pos.z + rand(-0.3, 0.3),
    rand(-1, 1), rand(0.6, 2.0), rand(-1, 1),
    rand(0.5, 1.1), rand(1.2, 2.4), 0xb8bcc2, 1.0, 0.9, 3.0);
}

export function dust(pos, amount, color = 0xbfa87a) {
  if (Math.random() > amount * budget()) return;
  emit(smoke, pos.x + rand(-0.6, 0.6), pos.y + 0.1, pos.z + rand(-0.6, 0.6),
    rand(-2, 2), rand(0.5, 2.4), rand(-2, 2),
    rand(0.6, 1.4), rand(1.4, 3.0), color, 0.8, 0.9, 3.4);
}

export function boostFlame(pos, dir, hot = 1) {
  const n = Math.max(1, Math.round(3 * budget()));
  for (let i = 0; i < n; i++) {
    emit(sparks, pos.x, pos.y, pos.z,
      dir.x * rand(4, 11) + rand(-1.5, 1.5),
      dir.y * rand(4, 11) + rand(-0.6, 1.2),
      dir.z * rand(4, 11) + rand(-1.5, 1.5),
      rand(0.16, 0.36), rand(1.1, 2.3) * hot,
      Math.random() < 0.5 ? 0x66ddff : 0xffe089, 0, 0.85, 1.2);
  }
}

export function glassBurst(pos) {
  const n = Math.max(4, Math.round(16 * budget()));
  for (let i = 0; i < n; i++) {
    emit(sparks, pos.x, pos.y, pos.z,
      rand(-1, 1) * 7, rand(0.2, 1.2) * 7, rand(-1, 1) * 7,
      rand(0.5, 1.1), rand(0.4, 0.9), 0xc9f0ff, -20, 0.9, 0);
  }
}

// Expanding ground ring — shockwaves, big impacts, boost pads.
export function ring(pos, color = 0xffffff, maxR = 9, life = 0.5, up = null) {
  const geo = new THREE.RingGeometry(0.6, 1.0, 24);
  const mat = new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false,
  });
  const m = new THREE.Mesh(geo, mat);
  m.position.copy(pos);
  if (up) m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), up);
  else m.rotation.x = -Math.PI / 2;
  m.renderOrder = 4;
  scene.add(m);
  rings.push({ m, age: 0, life, maxR });
}

// ---------------------------------------------------------------------------
export function updateParticles(dt) {
  for (const pool of [sparks, smoke]) {
    if (!pool) continue;
    let n = 0;
    const { p, pos, col, siz, alp } = pool;
    for (let i = 0; i < pool.max; i++) {
      const q = p[i];
      if (!q.alive) continue;
      q.age += dt;
      if (q.age >= q.life) { q.alive = false; continue; }
      const d = Math.pow(q.drag, dt * 60);
      q.vx *= d; q.vz *= d;
      q.vy = q.vy * d + q.grav * dt;
      q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      const t = q.age / q.life;
      const o = n * 3;
      pos[o] = q.x; pos[o + 1] = q.y; pos[o + 2] = q.z;
      col[o] = q.r; col[o + 1] = q.g; col[o + 2] = q.b;
      siz[n] = q.size + q.grow * t;
      alp[n] = 1 - t * t;
      n++;
    }
    pool.geo.setDrawRange(0, n);
    pool.geo.attributes.position.needsUpdate = true;
    pool.geo.attributes.color.needsUpdate = true;
    pool.geo.attributes.size.needsUpdate = true;
    pool.geo.attributes.alpha.needsUpdate = true;
  }

  for (let i = rings.length - 1; i >= 0; i--) {
    const r = rings[i];
    r.age += dt;
    const t = clamp01(r.age / r.life);
    const s = 0.4 + t * r.maxR;
    r.m.scale.set(s, s, s);
    r.m.material.opacity = 0.85 * (1 - t);
    if (t >= 1) {
      scene.remove(r.m);
      r.m.geometry.dispose();
      r.m.material.dispose();
      rings.splice(i, 1);
    }
  }
}

export function clearParticles() {
  for (const pool of [sparks, smoke]) {
    if (!pool) continue;
    for (const q of pool.p) q.alive = false;
    pool.geo.setDrawRange(0, 0);
  }
  for (const r of rings) {
    scene.remove(r.m);
    r.m.geometry.dispose();
    r.m.material.dispose();
  }
  rings.length = 0;
}
