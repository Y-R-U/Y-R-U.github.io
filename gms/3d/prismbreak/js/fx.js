// Particles, glass shards, beams, shockwaves, DOM text pops & floaters.
import * as THREE from 'three';
import { R, worldToScreen, addShake } from './render.js';

const active = []; // {mesh(es), update(dt,age)->alive, age}
let shardGeo, sparkTex;

export function initFx() {
  shardGeo = new THREE.TetrahedronGeometry(0.11, 0);
  // radial-gradient sprite texture for particles
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.5)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  sparkTex = new THREE.CanvasTexture(cv);
}

export function updateFx(dt) {
  for (let i = active.length - 1; i >= 0; i--) {
    const fx = active[i];
    fx.age += dt;
    if (!fx.update(dt, fx.age)) {
      fx.dispose?.();
      active.splice(i, 1);
    }
  }
}

// ── particle burst at a cell ──────────────────────────────────────────
export function burst(x, y, colorHex, count = 14, speed = 3.2, size = 0.22) {
  if (R.lite) count = Math.min(count, 8);
  const n = count;
  const pos = new Float32Array(n * 3);
  const vel = [];
  for (let i = 0; i < n; i++) {
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = 0.3;
    const a = Math.random() * Math.PI * 2, sp = speed * (0.4 + Math.random() * 0.8);
    vel.push(new THREE.Vector3(Math.cos(a) * sp, Math.sin(a) * sp, (Math.random() - 0.2) * sp * 0.7));
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    color: colorHex, size, map: sparkTex, transparent: true, opacity: 1,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const pts = new THREE.Points(geo, mat);
  R.fxLayer.add(pts);
  active.push({
    age: 0,
    update(dt, age) {
      const p = geo.attributes.position.array;
      for (let i = 0; i < n; i++) {
        vel[i].y -= 6 * dt;
        p[i * 3] += vel[i].x * dt; p[i * 3 + 1] += vel[i].y * dt; p[i * 3 + 2] += vel[i].z * dt;
      }
      geo.attributes.position.needsUpdate = true;
      mat.opacity = 1 - age / 0.7;
      return age < 0.7;
    },
    dispose() { R.fxLayer.remove(pts); geo.dispose(); mat.dispose(); },
  });
}

// ── glass shatter debris ──────────────────────────────────────────────
let shardCount = 0;
export function shatter(x, y, colorHex, metal = false, count = 7) {
  if (R.lite || shardCount > 90) return;
  count = Math.min(count, 110 - shardCount);
  const mat = metal
    ? new THREE.MeshStandardMaterial({ color: colorHex, metalness: 1, roughness: 0.3, envMapIntensity: 1.5 })
    : new THREE.MeshPhysicalMaterial({ color: colorHex, transparent: true, opacity: 0.85, roughness: 0.05, clearcoat: 1, envMapIntensity: 1.5 });
  const shards = [];
  for (let i = 0; i < count; i++) {
    const m = new THREE.Mesh(shardGeo, mat);
    m.position.set(x + (Math.random() - 0.5) * 0.3, y + (Math.random() - 0.5) * 0.3, 0.3);
    m.scale.setScalar(0.6 + Math.random() * 0.9);
    const a = Math.random() * Math.PI * 2;
    m.userData.v = new THREE.Vector3(Math.cos(a) * (1 + Math.random() * 2.5), 1.5 + Math.random() * 3, (Math.random()) * 2);
    m.userData.rv = new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8);
    R.fxLayer.add(m);
    shards.push(m);
  }
  shardCount += count;
  active.push({
    age: 0,
    update(dt, age) {
      for (const m of shards) {
        m.userData.v.y -= 12 * dt;
        m.position.addScaledVector(m.userData.v, dt);
        m.rotation.x += m.userData.rv.x * dt; m.rotation.y += m.userData.rv.y * dt;
      }
      if (!metal) mat.opacity = 0.85 * (1 - age / 1.1);
      return age < 1.1;
    },
    dispose() {
      for (const m of shards) R.fxLayer.remove(m);
      mat.dispose();
      shardCount -= count;
    },
  });
}

// ── line-blaster beam across a row or column ──────────────────────────
export function beam(rc, isRow, colorHex) {
  const len = isRow ? 10 : 10;
  const geo = new THREE.PlaneGeometry(isRow ? len : 0.4, isRow ? 0.4 : len);
  const mat = new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
  const m = new THREE.Mesh(geo, mat);
  m.position.set(isRow ? 0 : rc.x, isRow ? rc.y : 0, 0.4);
  R.fxLayer.add(m);
  addShake(0.06);
  active.push({
    age: 0,
    update(dt, age) {
      const k = 1 - age / 0.4;
      mat.opacity = k;
      m.scale.set(isRow ? 1 : 1 + age * 2, isRow ? 1 + age * 2 : 1, 1);
      return age < 0.4;
    },
    dispose() { R.fxLayer.remove(m); geo.dispose(); mat.dispose(); },
  });
}

// ── expanding shockwave ring ──────────────────────────────────────────
export function shockwave(x, y, colorHex, maxR = 2.4) {
  const geo = new THREE.RingGeometry(0.8, 1, 40);
  const mat = new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false });
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, 0.45);
  m.scale.setScalar(0.2);
  R.fxLayer.add(m);
  addShake(maxR > 3 ? 0.22 : 0.12);
  active.push({
    age: 0,
    update(dt, age) {
      const k = age / 0.5;
      m.scale.setScalar(0.2 + k * maxR);
      mat.opacity = 0.9 * (1 - k);
      return age < 0.5;
    },
    dispose() { R.fxLayer.remove(m); geo.dispose(); mat.dispose(); },
  });
}

// ── prism zap: glowing bolt from orb to each victim ───────────────────
export function zapBolt(x1, y1, x2, y2, colorHex) {
  if (R.lite) return;
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  const geo = new THREE.PlaneGeometry(len, 0.12);
  const mat = new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const m = new THREE.Mesh(geo, mat);
  m.position.set((x1 + x2) / 2, (y1 + y2) / 2, 0.5);
  m.rotation.z = Math.atan2(dy, dx);
  R.fxLayer.add(m);
  active.push({
    age: 0,
    update(dt, age) { mat.opacity = 0.9 * (1 - age / 0.3); return age < 0.3; },
    dispose() { R.fxLayer.remove(m); geo.dispose(); mat.dispose(); },
  });
}

// ══ DOM layer: huge flashy text + floating score labels ═══════════════
const bigtextEl = () => document.getElementById('bigtext');

export function bigText(text, cls = '', ms = 1100) {
  const el = document.createElement('div');
  el.className = 'pop ' + cls;
  el.textContent = text;
  bigtextEl().appendChild(el);
  setTimeout(() => el.remove(), ms);
}

export function comboText(mult) {
  const el = document.createElement('div');
  el.className = 'pop combo';
  el.textContent = '×' + mult;
  el.style.setProperty('--rot', (Math.random() * 24 - 12) + 'deg');
  bigtextEl().appendChild(el);
  setTimeout(() => el.remove(), 900);
}

export function floater(wx, wy, text, cls = '') {
  const s = worldToScreen(wx, wy, 0.6);
  const el = document.createElement('div');
  el.className = 'floater ' + cls;
  el.textContent = text;
  el.style.left = s.x + 'px';
  el.style.top = s.y + 'px';
  document.getElementById('floaters').appendChild(el);
  setTimeout(() => el.remove(), 950);
}

export function flash(color = 'rgba(255,255,255,0.35)', ms = 180) {
  const el = document.getElementById('flash');
  el.style.transition = 'none';
  el.style.background = color;
  el.style.opacity = '1';
  requestAnimationFrame(() => {
    el.style.transition = `opacity ${ms}ms ease-out`;
    el.style.opacity = '0';
  });
}

export function clearDomFx() {
  bigtextEl().innerHTML = '';
  document.getElementById('floaters').innerHTML = '';
}
