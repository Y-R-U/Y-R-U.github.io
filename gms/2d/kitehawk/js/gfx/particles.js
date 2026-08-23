import { LAYER } from './renderer.js';

const CAP = 12000;

/**
 * Flat SoA pool. Dead particles are removed by swapping the last live one into
 * the hole, so the live set is always [0, count) and the update loop is a
 * straight linear walk with no branching on liveness and no allocation.
 */
export function createParticles(R, capacity = CAP) {
  const N = capacity;
  const x = new Float32Array(N), y = new Float32Array(N);
  const vx = new Float32Array(N), vy = new Float32Array(N);
  const life = new Float32Array(N), maxLife = new Float32Array(N);
  const s0 = new Float32Array(N), s1 = new Float32Array(N);
  const rot = new Float32Array(N), vrot = new Float32Array(N);
  const grav = new Float32Array(N), drag = new Float32Array(N);
  const cr0 = new Float32Array(N), cg0 = new Float32Array(N), cb0 = new Float32Array(N), ca0 = new Float32Array(N);
  const cr1 = new Float32Array(N), cg1 = new Float32Array(N), cb1 = new Float32Array(N), ca1 = new Float32Array(N);
  const glow = new Float32Array(N), bounce = new Float32Array(N), stretch = new Float32Array(N);
  const fadeIn = new Float32Array(N);
  const layer = new Uint8Array(N), flags = new Uint8Array(N);
  const tex = new Array(N);

  const F_ADD = 1, F_COLLIDE = 2, F_ALIGN = 4, F_KILL_ON_HIT = 8;

  let count = 0;
  let terrainQuery = null;
  let glowStride = 1;
  const FLOATS = [x, y, vx, vy, life, maxLife, s0, s1, rot, vrot, grav, drag,
    cr0, cg0, cb0, ca0, cr1, cg1, cb1, ca1, glow, bounce, stretch, fadeIn];

  function kill(i) {
    const last = --count;
    if (i !== last) {
      for (let k = 0; k < FLOATS.length; k++) FLOATS[k][i] = FLOATS[k][last];
      layer[i] = layer[last];
      flags[i] = flags[last];
      tex[i] = tex[last];
    }
    tex[last] = null;
  }

  const rand = Math.random;

  const P = {
    get count() { return count; },
    get capacity() { return N; },
    glowBudget: 24,
    /** How much of a glow particle's colour becomes light. */
    glowGain: 1.0,

    /** fn(x, y) -> true if solid. Registered by the sim once terrain exists. */
    setTerrainQuery(fn) { terrainQuery = fn; },

    clear() { count = 0; },

    emit(o) {
      let n = o.count === undefined ? 1 : o.count | 0;
      if (n <= 0) return;
      if (count + n > N) n = N - count;
      if (n <= 0) return;

      const ox = o.x, oy = o.y;
      const bvx = o.vx || 0, bvy = o.vy || 0;
      const hasDir = bvx !== 0 || bvy !== 0;
      const baseDir = hasDir ? Math.atan2(bvy, bvx) : 0;
      const baseSpeed = o.speed !== undefined ? o.speed : Math.hypot(bvx, bvy);
      const spdVar = o.speedVar || 0;
      const spread = o.vSpread === undefined ? (hasDir ? 0 : Math.PI) : o.vSpread;
      const lf = o.life === undefined ? 0.7 : o.life;
      const lfVar = o.lifeVar || 0;
      const sz = o.size === undefined ? 8 : o.size;
      const szVar = o.sizeVar || 0;
      const szEnd = o.sizeEnd === undefined ? sz : o.sizeEnd;
      const c0 = o.color || [1, 1, 1, 1];
      const c1 = o.color2 || [c0[0], c0[1], c0[2], 0];
      const g = o.gravity || 0;
      const dr = o.drag || 0;
      const ly = o.layer === undefined ? LAYER.FX : o.layer;
      const t = o.tex === undefined ? R.blob : o.tex;
      const gl_ = o.glow || 0;
      const sp = o.spin || 0, spVar = o.spinVar || 0;
      const r0 = o.rot || 0, rVar = o.rotVar === undefined ? (o.tex ? 0 : Math.PI) : o.rotVar;
      const jit = o.jitter || 0;
      let fl = 0;
      if (o.add) fl |= F_ADD;
      if (o.collide) fl |= F_COLLIDE;
      if (o.alignVel || o.stretch) fl |= F_ALIGN;
      if (o.killOnHit) fl |= F_KILL_ON_HIT;

      for (let k = 0; k < n; k++) {
        const i = count++;
        const dir = baseDir + (rand() * 2 - 1) * spread;
        const spd = baseSpeed + (rand() * 2 - 1) * spdVar;
        x[i] = ox + (rand() * 2 - 1) * jit;
        y[i] = oy + (rand() * 2 - 1) * jit;
        vx[i] = Math.cos(dir) * spd;
        vy[i] = Math.sin(dir) * spd;
        const l = Math.max(0.02, lf + (rand() * 2 - 1) * lfVar);
        life[i] = l; maxLife[i] = l;
        const ssz = Math.max(0.1, sz + (rand() * 2 - 1) * szVar);
        s0[i] = ssz;
        s1[i] = szEnd * (ssz / sz);
        rot[i] = r0 + (rand() * 2 - 1) * rVar;
        vrot[i] = sp + (rand() * 2 - 1) * spVar;
        grav[i] = g; drag[i] = dr;
        cr0[i] = c0[0]; cg0[i] = c0[1]; cb0[i] = c0[2]; ca0[i] = c0[3] === undefined ? 1 : c0[3];
        cr1[i] = c1[0]; cg1[i] = c1[1]; cb1[i] = c1[2]; ca1[i] = c1[3] === undefined ? 0 : c1[3];
        glow[i] = gl_;
        bounce[i] = o.bounce === undefined ? 0.35 : o.bounce;
        stretch[i] = o.stretch || 0;
        fadeIn[i] = o.fadeIn || 0;
        layer[i] = ly;
        flags[i] = fl;
        tex[i] = t;
      }
    },

    update(dt) {
      const q = terrainQuery;
      for (let i = 0; i < count; i++) {
        const l = life[i] - dt;
        if (l <= 0) { kill(i); i--; continue; }
        life[i] = l;

        let px = x[i], py = y[i], pvx = vx[i], pvy = vy[i];
        pvy += grav[i] * dt;
        const d = drag[i];
        if (d > 0) {
          const f = 1 / (1 + d * dt);
          pvx *= f; pvy *= f;
        }
        let nx = px + pvx * dt;
        let ny = py + pvy * dt;

        if ((flags[i] & F_COLLIDE) && q) {
          if (q(nx, ny)) {
            if (flags[i] & F_KILL_ON_HIT) { kill(i); i--; continue; }
            const b = bounce[i];
            if (!q(nx, py)) { pvy = -pvy * b; pvx *= 0.82; ny = py; }
            else if (!q(px, ny)) { pvx = -pvx * b; pvy *= 0.82; nx = px; }
            else { pvx *= -b; pvy *= -b; nx = px; ny = py; }
          }
        }

        x[i] = nx; y[i] = ny; vx[i] = pvx; vy[i] = pvy;
        rot[i] += vrot[i] * dt;
      }
    },

    render() {
      let glowSeen = 0, glowUsed = 0;
      const stride = glowStride;
      for (let i = 0; i < count; i++) {
        const t = 1 - life[i] / maxLife[i];
        let a = ca0[i] + (ca1[i] - ca0[i]) * t;
        const fi = fadeIn[i];
        if (fi > 0 && t < fi) a *= t / fi;
        if (a <= 0.002) continue;
        const r = cr0[i] + (cr1[i] - cr0[i]) * t;
        const g = cg0[i] + (cg1[i] - cg0[i]) * t;
        const b = cb0[i] + (cb1[i] - cb0[i]) * t;
        const sz = s0[i] + (s1[i] - s0[i]) * t;
        const add = (flags[i] & F_ADD) !== 0;

        let w = sz, h = sz, rr = rot[i];
        if (flags[i] & F_ALIGN) {
          const spd = Math.hypot(vx[i], vy[i]);
          rr = Math.atan2(vy[i], vx[i]);
          w = sz * (1 + stretch[i] * spd * 0.0016);
        }
        R.spriteRaw(tex[i], 0, 0, 1, 1, x[i], y[i], w, h, rr, r, g, b, a, layer[i], add, 1, 1);

        const gw = glow[i];
        if (gw > 0) {
          glowSeen++;
          if (glowSeen % stride === 0 && glowUsed < P.glowBudget) {
            glowUsed++;
            R.lightRaw(x[i], y[i], sz * 5.5 * gw, r, g, b, a * gw * P.glowGain * 0.9, 0);
          }
        }
      }
      glowStride = glowSeen > P.glowBudget ? Math.ceil(glowSeen / P.glowBudget) : 1;
    },
  };

  return P;
}
