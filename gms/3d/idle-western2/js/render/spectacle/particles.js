import * as THREE from 'three';
import { white } from '../fx.js?v=20261004b';

// Budgeted particles: soft clay dust/smoke/splash spheres (lit) and glowing cartoon stars/flashes/shards.
// Two instanced draws. `budget()` returns how many may still spawn (W10: ≤ 256 in the hero, fx.js juice included).
const C = (h) => new THREE.Color(h);
const DUST = C('#f3e2c4'), SMOKE = C('#c9bfd6'), SPLASH = C('#bfe3f2'), STAR = C('#ffe45c'), FLASH = C('#fff3b0'), GLASS = C('#dff3ff');
export const PCOL = { DUST, SMOKE, SPLASH, STAR, FLASH, GLASS, SOOT: C('#4a4048'), GOLD: C('#ffd27a'), RED: C('#e8776a'), ECTO: C('#8ff0c0') };
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();

function starGeo() {
  const sh = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2, r = i % 2 ? 0.45 : 1;
    if (i) sh.lineTo(Math.sin(a) * r, Math.cos(a) * r); else sh.moveTo(0, r);
  }
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.25, bevelEnabled: false });
  g.translate(0, 0, -0.125);
  return white(g);
}

export function createParticles(kit, scene, cap = 2048) {
  const dust = new THREE.InstancedMesh(white(new THREE.IcosahedronGeometry(1, 1)), kit.materials.lambertVCInst, cap);
  const glowMat = new THREE.MeshBasicMaterial({ toneMapped: false, fog: false });
  const glow = new THREE.InstancedMesh(starGeo(), glowMat, cap);
  for (const m of [dust, glow]) {
    m.frustumCulled = false;
    m.count = 0;
    m.visible = false;
    m.castShadow = false;
    m.renderOrder = 4;
    for (let i = 0; i < cap; i++) m.setColorAt(i, _c.set(0xffffff));
    scene.add(m);
  }
  dust.name = 'spectacle:dust';
  glow.name = 'spectacle:glow';
  const P = Array.from({ length: cap }, () => ({ on: false, glow: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, g: 0, life: 0, max: 1, s: 1, col: DUST, line: null, spin: 0, ph: 0, orbit: null, follow: null, drag: 0 }));
  let live = 0, hi = 0, limit = 256, extern = () => 0;

  function take() {
    if (live + extern() >= limit) return null;
    for (let k = 0; k < cap; k++) {
      const p = P[k];
      if (!p.on) { if (k >= hi) hi = k + 1; p.on = true; live++; p.orbit = p.follow = null; p.spin = 0; p.drag = 0; p.g = 0; return p; }
    }
    return null;
  }
  const R = Math.random;

  const api = {
    get live() { return live; },
    budget() { return Math.max(0, limit - live - extern()); },
    setLimit(n) { limit = n; },
    setExtern(fn) { extern = fn; },
    // Cartoon dust puff: n cream spheres popping out and rising.
    puff(pos, n = 7, { r = 0.7, col = DUST, up = 1.2, line = null, size = 0.45, life = 0.9 } = {}) {
      for (let i = 0; i < n; i++) {
        const p = take();
        if (!p) return;
        const a = R() * Math.PI * 2, d = R() * r;
        p.glow = false; p.col = col; p.line = line;
        p.x = pos[0] + Math.cos(a) * d; p.y = (pos[1] || 0) + 0.2 + R() * 0.3; p.z = pos[2] + Math.sin(a) * d;
        p.vx = Math.cos(a) * (0.6 + R()); p.vz = Math.sin(a) * (0.6 + R()); p.vy = up * (0.5 + R() * 0.6);
        p.drag = 2.2;
        p.max = p.life = life * (0.8 + R() * 0.5); p.s = size * (0.7 + R() * 0.6);
      }
    },
    smoke(pos, n = 4, line = null) { api.puff(pos, n, { r: 0.15, col: SMOKE, up: 0.7, line, size: 0.22, life: 1.3 }); },
    splash(pos, n = 14, line = null) {
      for (let i = 0; i < n; i++) {
        const p = take();
        if (!p) return;
        const a = R() * Math.PI * 2;
        p.glow = false; p.col = SPLASH; p.line = line;
        p.x = pos[0]; p.y = pos[1] || 0.5; p.z = pos[2];
        p.vx = Math.cos(a) * (1 + R() * 1.5); p.vz = Math.sin(a) * (1 + R() * 1.5); p.vy = 4 + R() * 3; p.g = 14;
        p.max = p.life = 0.8 + R() * 0.3; p.s = 0.12 + R() * 0.1;
      }
    },
    // A churning brawl cloud: spheres orbiting a centre for `life` seconds.
    cloud(pos, n = 10, life = 1.2, line = null, R0 = 1.1) {
      for (let i = 0; i < n; i++) {
        const p = take();
        if (!p) return;
        p.glow = false; p.col = DUST; p.line = line;
        p.orbit = { cx: pos[0], cy: (pos[1] || 0) + 0.8, cz: pos[2], r: R0 * (0.5 + R() * 0.6), w: (R() < 0.5 ? -1 : 1) * (5 + R() * 4), ph: R() * 6.28, tilt: R() * 1.2 };
        p.max = p.life = life * (0.7 + R() * 0.5); p.s = 0.45 + R() * 0.35;
      }
    },
    // Cartoon impact stars; with `follow` (fn → [x,y,z]) they orbit a head.
    stars(pos, n = 5, { line = null, follow = null, life = 1.2, col = STAR, burst = 3 } = {}) {
      for (let i = 0; i < n; i++) {
        const p = take();
        if (!p) return;
        const a = (i / n) * Math.PI * 2 + R();
        p.glow = true; p.col = col; p.line = line; p.follow = follow;
        p.x = pos[0]; p.y = pos[1]; p.z = pos[2];
        if (follow) p.orbit = { r: 0.45, w: 6, ph: a, tilt: 0.25 };
        else { p.vx = Math.cos(a) * burst; p.vz = Math.sin(a) * burst; p.vy = 1.5 + R() * 2; p.drag = 3; }
        p.spin = (R() - 0.5) * 10;
        p.max = p.life = life; p.s = 0.16 + R() * 0.06;
      }
    },
    flash(pos, s = 0.5, line = null) {
      const p = take();
      if (!p) return;
      p.glow = true; p.col = FLASH; p.line = line;
      p.x = pos[0]; p.y = pos[1]; p.z = pos[2]; p.vx = p.vy = p.vz = 0;
      p.max = p.life = 0.12; p.s = s; p.spin = 0; p.ph = R() * 6;
    },
    shards(pos, n = 10, line = null) {
      for (let i = 0; i < n; i++) {
        const p = take();
        if (!p) return;
        const a = R() * Math.PI * 2;
        p.glow = true; p.col = GLASS; p.line = line;
        p.x = pos[0]; p.y = pos[1]; p.z = pos[2];
        p.vx = Math.cos(a) * (1 + R() * 2); p.vz = Math.sin(a) * (1 + R() * 2) + 1.5; p.vy = 2 + R() * 3; p.g = 12;
        p.spin = (R() - 0.5) * 20; p.max = p.life = 0.9; p.s = 0.08 + R() * 0.08;
      }
    },
    clear() { for (const p of P) p.on = false; live = 0; hi = 0; },
    update(dt) {
      while (hi > 0 && !P[hi - 1].on) hi--;
      for (let i = 0; i < hi; i++) {
        const p = P[i];
        if (!p.on) continue;
        p.life -= dt;
        if (p.life <= 0) { p.on = false; live--; continue; }
        if (p.orbit) {
          const o = p.orbit;
          o.ph += o.w * dt;
          let cx = o.cx, cy = o.cy, cz = o.cz;
          if (p.follow) { const f = p.follow(); if (f) { cx = f[0]; cy = f[1] + 0.15; cz = f[2]; } }
          p.x = cx + Math.cos(o.ph) * o.r; p.z = cz + Math.sin(o.ph) * o.r; p.y = cy + Math.sin(o.ph * 1.3 + o.tilt) * o.r * 0.45;
        } else {
          const k = Math.exp(-p.drag * dt);
          p.vx *= k; p.vz *= k; if (!p.g) p.vy *= k;
          p.vy -= p.g * dt;
          p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
          if (p.y < 0.05) { p.y = 0.05; p.vy = 0; }
        }
      }
    },
    write(line) {
      let nd = 0, ng = 0;
      for (let i = 0; i < hi; i++) {
        const p = P[i];
        if (!p.on || (line && p.line !== line)) continue;
        const u = 1 - p.life / p.max;
        if (p.glow) {
          const f = p.col === FLASH ? 1 : Math.min(1, p.life / 0.25) * Math.min(1, u * 8 + 0.3);
          _e.set(0, p.spin * u + p.ph, p.spin * u * 0.7);
          _q.setFromEuler(_e);
          _m.compose(_p.set(p.x, p.y, p.z), _q, _s.setScalar(p.s * f));
          glow.setMatrixAt(ng, _m);
          glow.setColorAt(ng++, p.col);
        } else {
          const f = p.orbit ? Math.sin(Math.PI * Math.min(1, u * 1.3)) : Math.min(1, u * 6) * (1 - u * u) * 1.1;
          _m.makeScale(p.s * f, p.s * f * 0.88, p.s * f).setPosition(p.x, p.y, p.z);
          dust.setMatrixAt(nd, _m);
          dust.setColorAt(nd++, p.col);
        }
      }
      dust.count = nd; dust.visible = nd > 0;
      glow.count = ng; glow.visible = ng > 0;
      if (nd) { dust.instanceMatrix.needsUpdate = true; dust.instanceColor.needsUpdate = true; }
      if (ng) { glow.instanceMatrix.needsUpdate = true; glow.instanceColor.needsUpdate = true; }
      return nd + ng;
    },
    get calls() { return (dust.visible ? 1 : 0) + (glow.visible ? 1 : 0); },
  };
  return api;
}
