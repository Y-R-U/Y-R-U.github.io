import * as THREE from 'three';

export const fxRegistry = { current: null };

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(),
  _e = new THREE.Euler(), _c = new THREE.Color();
const GOLD = 0xffc93c, SPARK = [0xfff3b0, 0xffd6e0, 0xc8f7ff, 0xfff8e7];

function pool(n, make) { return Array.from({ length: n }, make); }

export function white(g) {
  g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3));
  return g;
}

export function createFx(world, kit) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let scale = 1, motionPref = () => false;
  const motionOk = () => !reduced.matches && !motionPref();

  const coinGeo = white(new THREE.CylinderGeometry(1, 1, 1, 14));
  const coins = new THREE.InstancedMesh(coinGeo, kit.materials.lambertVCInst, 96);
  const fxMat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false, fog: false, blending: THREE.AdditiveBlending });
  const sparks = new THREE.InstancedMesh(new THREE.OctahedronGeometry(1, 0), fxMat, 96);
  const ringGeo = new THREE.RingGeometry(0.86, 1, 40).rotateX(-Math.PI / 2);
  const rings = new THREE.InstancedMesh(ringGeo, fxMat, 8);
  for (const m of [coins, sparks, rings]) {
    m.frustumCulled = false;
    m.count = 0;
    m.visible = false;
    m.renderOrder = 5;
    world.scene.add(m);
  }
  for (let i = 0; i < 96; i++) coins.setColorAt(i, _c.set(GOLD).offsetHSL(0, 0, ((i * 7) % 5) / 50));
  for (let i = 0; i < 96; i++) sparks.setColorAt(i, _c.set(SPARK[i % SPARK.length]));
  for (let i = 0; i < 8; i++) rings.setColorAt(i, _c.set(0xfff2a8));

  const C = pool(96, () => ({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, spin: 0, floor: 0, bounced: false }));
  const S = pool(96, () => ({ life: 0, max: 1, x: 0, y: 0, z: 0, vy: 0, size: 0.1, ph: 0 }));
  const R = pool(8, () => ({ life: 0, max: 1, x: 0, y: 0, z: 0, r0: 1, r1: 6 }));
  const pops = new Map();
  let ci = 0, si = 0, ri = 0;

  const n = (k) => Math.max(1, Math.round(k * scale * (motionOk() ? 1 : 0.4)));

  function plotPos(lineId, local, out = []) {
    const p = world.plots.get(lineId);
    if (!p) return null;
    _p.set(local?.[0] ?? 0, local?.[1] ?? 0, local?.[2] ?? 0).applyMatrix4(p.group.matrixWorld);
    out[0] = _p.x; out[1] = _p.y; out[2] = _p.z;
    return out;
  }

  const api = {
    burst(pos, count = 6) {
      const k = n(count);
      for (let i = 0; i < k; i++) {
        const c = C[ci++ % C.length];
        const a = Math.random() * Math.PI * 2, sp = 1.2 + Math.random() * 2.2;
        c.max = c.life = 1.1 + Math.random() * 0.3;
        c.x = pos[0]; c.y = (pos[1] || 0) + 0.8; c.z = pos[2];
        c.vx = Math.cos(a) * sp; c.vz = Math.sin(a) * sp; c.vy = 4.5 + Math.random() * 2.5;
        c.spin = (Math.random() - 0.5) * 18; c.floor = pos[1] || 0; c.bounced = false;
      }
    },
    sparkle(pos, count = 10, radius = 2.5) {
      const k = n(count);
      for (let i = 0; i < k; i++) {
        const s = S[si++ % S.length];
        const a = Math.random() * Math.PI * 2, r = Math.random() * radius;
        s.max = s.life = 0.7 + Math.random() * 0.7;
        s.x = pos[0] + Math.cos(a) * r; s.z = pos[2] + Math.sin(a) * r; s.y = (pos[1] || 0) + 0.3 + Math.random() * 2;
        s.vy = 0.6 + Math.random() * 1.2; s.size = 0.07 + Math.random() * 0.08; s.ph = Math.random() * 6;
      }
    },
    ring(pos, r1 = 7) {
      if (!motionOk() && scale < 0.6) return;
      const r = R[ri++ % R.length];
      r.max = r.life = 0.9;
      r.x = pos[0]; r.y = (pos[1] || 0) + 0.15; r.z = pos[2]; r.r0 = 0.6; r.r1 = r1;
    },
    // Squash & stretch the plot (or one of its children) once: 'small' for upgrades, 'big' for builds.
    pop(lineId, size = 'small', target = null) {
      const p = world.plots.get(lineId);
      if (!p) return;
      const obj = target || p.group;
      if (!motionOk()) return;
      pops.set(obj, { t: 0, dur: size === 'big' ? 0.7 : 0.38, amp: size === 'big' ? 0.16 : 0.06, base: pops.get(obj)?.base || obj.scale.clone() });
    },
    flash(lineId) {
      const pos = plotPos(lineId, [0, 0, 1]);
      if (!pos) return;
      api.ring(pos, 9);
      api.sparkle(pos, 26, 6);
      api.pop(lineId, 'big');
    },
    plotPos,
    live() { let k = 0; for (const c of C) if (c.life > 0) k++; for (const s of S) if (s.life > 0) k++; return k; },
    setScale(s) { scale = s; },
    setMotionPref(fn) { motionPref = fn; },
    update(dt) {
      let k = 0;
      for (const c of C) {
        if (c.life <= 0) continue;
        c.life -= dt;
        c.vy -= 14 * dt;
        c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt;
        if (c.y < c.floor + 0.05 && c.vy < 0) {
          if (!c.bounced) { c.bounced = true; c.vy = -c.vy * 0.35; c.vx *= 0.5; c.vz *= 0.5; c.y = c.floor + 0.05; }
          else { c.y = c.floor + 0.05; c.vy = 0; c.vx *= 0.9; c.vz *= 0.9; }
        }
        const f = Math.min(1, c.life / 0.25);
        _e.set(Math.PI / 2 + Math.sin(c.life * 3) * 0.4, c.spin * (c.max - c.life), 0);
        _q.setFromEuler(_e);
        _m.compose(_p.set(c.x, c.y, c.z), _q, _s.set(0.26 * f, 0.05, 0.26 * f));
        coins.setMatrixAt(k++, _m);
      }
      coins.count = k;
      coins.visible = k > 0;
      if (k) coins.instanceMatrix.needsUpdate = true;

      k = 0;
      for (const s of S) {
        if (s.life <= 0) continue;
        s.life -= dt;
        s.y += s.vy * dt;
        const tw = Math.sin((s.max - s.life) * 14 + s.ph) * 0.35 + 0.65;
        const f = Math.sin(Math.PI * Math.max(0, s.life / s.max)) * tw * s.size;
        _m.makeScale(f, f * 1.6, f).setPosition(s.x, s.y, s.z);
        sparks.setColorAt(k, _c.set(SPARK[k % SPARK.length]).multiplyScalar(0.5 + tw * 0.5));
        sparks.setMatrixAt(k++, _m);
      }
      sparks.count = k;
      sparks.visible = k > 0;
      if (k) { sparks.instanceMatrix.needsUpdate = true; sparks.instanceColor.needsUpdate = true; }

      k = 0;
      for (const r of R) {
        if (r.life <= 0) continue;
        r.life -= dt;
        const e = 1 - Math.pow(Math.max(0, r.life / r.max), 2);
        const rad = r.r0 + (r.r1 - r.r0) * e;
        _m.makeScale(rad, 1, rad).setPosition(r.x, r.y, r.z);
        rings.setColorAt(k, _c.set(0xfff2a8).multiplyScalar(1 - e));
        rings.setMatrixAt(k++, _m);
      }
      rings.count = k;
      rings.visible = k > 0;
      if (k) { rings.instanceMatrix.needsUpdate = true; rings.instanceColor.needsUpdate = true; }

      for (const [obj, p] of pops) {
        p.t += dt;
        const x = Math.min(1, p.t / p.dur);
        const w = Math.sin(x * Math.PI * 2.5) * Math.pow(1 - x, 1.6) * p.amp;
        obj.scale.set(p.base.x * (1 - w * 0.5), p.base.y * (1 + w), p.base.z * (1 - w * 0.5));
        if (x >= 1) { obj.scale.copy(p.base); pops.delete(obj); }
      }
    },
  };
  fxRegistry.current = api;
  return api;
}
