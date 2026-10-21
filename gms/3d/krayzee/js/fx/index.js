import * as THREE from 'three';
import { createAtlas, F } from './atlas.js';
import { createParticles } from './particles.js';
import { createRibbons } from './ribbons.js';
import { createSkids } from './skids.js';
import { createDebris } from './debris.js';
import { createScreenFX } from './screen.js';

// Pooled, allocation-free (steady state) effects. See docs/FX.md for the wiring.

const TIERS = {
  low: { cap: 360, rate: 0.45, debris: 10, skidFade: 25, shimmer: false, glare: false, lines: 0.5, column: 0.5 },
  medium: { cap: 800, rate: 0.75, debris: 16, skidFade: 40, shimmer: false, glare: false, lines: 0.8, column: 0.8 },
  high: { cap: 1400, rate: 1, debris: 24, skidFade: 60, shimmer: true, glare: true, lines: 1, column: 1 },
};
const MAXP = 1400;
const PAVED = { runway: 1, taxiway: 1, apron: 1 };
const KT = 0.514444;

const rnd = (a, b) => a + Math.random() * (b - a);
const sat = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const sstep = (a, b, v) => { const t = sat((v - a) / (b - a)); return t * t * (3 - 2 * t); };

// Root-local effect anchors for the C172 (forward -Z, origin at CG). Other types scale by dims unless the rig
// provides rig.fxPoints with the same keys.
const C172 = {
  tipL: [-5.45, 1.0, 0.85], tipR: [5.45, 1.0, 0.85], mainL: [-1.27, -1.2, 0.43], mainR: [1.27, -1.2, 0.43],
  nose: [0, -1.2, -1.33], prop: [0, 0.05, -2.5], exhaust: [0.22, -0.58, -1.07], cowl: [0, 0.2, -1.8], tail: [0, -0.55, 5.0],
};

const hexRGB = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };
function liveryColors(rig) {
  try {
    const l = typeof rig.livery === 'function' ? rig.livery() : null;
    if (l && l.primary) return [hexRGB(l.primary), hexRGB(l.secondary || '#ffffff'), [0.85, 0.85, 0.85], hexRGB(l.primary), [0.22, 0.22, 0.24]];
  } catch (e) { /* livery is optional */ }
  return null;
}

const PALETTE = [[0.36, 0.13, 0.55], [0.95, 0.72, 0.2], [0.78, 0.1, 0.18], [0.95, 0.95, 0.95], [0.16, 0.3, 0.74], [1, 0.84, 0.36]];

export function createFX({ scene, camera, renderer, quality = 'low', world = null } = {}) {
  const atlas = createAtlas();
  const P = createParticles(scene, atlas.texture, MAXP);
  const ribbons = createRibbons(scene, { trails: 10, points: 64 });
  const skids = createSkids(scene, 512);
  const debris = createDebris(scene, 24);
  const screen = renderer ? createScreenFX(scene, renderer, camera) : null;

  let tier = TIERS[quality] || TIERS.low, q = TIERS[quality] ? quality : 'low';
  // doubles kept in a typed array: a closure `let` holding a float allocates a HeapNumber on every write
  const T = new Float64Array(4); // 0 time, 1 last dt, 2 smoothed cpu ms, 3 emission rate for take()
  const RW = new Float64Array(3); // ribbon point: alpha, width, time
  const SK = new Float64Array(3); // skid quad: width, alpha, time
  T[1] = 1 / 60;
  let view = 'chase';
  const wind = new THREE.Vector3(1.6, 0, 0.9);
  const sunDir = new THREE.Vector3(-0.42, 0.72, 0.55).normalize();
  const planes = new Map(), list = [];
  const ground = (x, z) => (world && world.groundHeightAt ? world.groundHeightAt(x, z) : 0);
  const surfaceAt = (x, z) => (world && world.surfaceAt ? world.surfaceAt(x, z) : 'runway');

  // ---------- scratch (never reallocated) ----------
  const S = {};
  const def = () => {
    S.x = S.y = S.z = 0; S.vx = S.vy = S.vz = 0; S.life = 1; S.s0 = 1; S.s1 = 1; S.rot = Math.random() * 6.283; S.rv = 0;
    S.r0 = S.g0 = S.b0 = 1; S.r1 = S.g1 = S.b1 = 1; S.a = 1; S.fin = 0.05; S.fout = 0.5; S.frame = F.PUFF; S.add = 0; S.orient = 0;
    S.drag = 1; S.buoy = 0; S.grav = 0; S.floor = -1e9; S.str = 0; S.flick = 0; S.wind = 1; S.fixed = 0; S.sx = S.sy = S.sz = 0; S.delay = 0;
  };
  def();
  const col = (r, g, b, r1 = r, g1 = g, b1 = b) => { S.r0 = r; S.g0 = g; S.b0 = b; S.r1 = r1; S.g1 = g1; S.b1 = b1; };
  const spawn = () => {
    const i = P.spawn(S);
    if (i >= 0 && S.delay > 0) P.age[i] = -S.delay;
    return i;
  };
  const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3(), v4 = new THREE.Vector3();
  const up = new THREE.Vector3(), fw = new THREE.Vector3(), rt = new THREE.Vector3(), camF = new THREE.Vector3();
  const nrm = new THREE.Vector3(), tmpVel = new THREE.Vector3();
  const emitAcc = new Float64Array(1);
  const A_WASH = 0, A_DUST = 1, A_SMOKE = 2, A_LINES = 3, A_WISP = 4, A_BRAKE = 5;

  // Fractional emission: whole particles to emit this frame at T[3] per second (rate goes through T, not an
  // argument, so it is never boxed); st is a Float64Array of accumulators.
  const take = (st, key) => {
    st[key] += T[3] * T[1];
    const n = Math.floor(st[key]);
    st[key] -= n;
    return n;
  };

  // ---------- primitive recipes ----------
  function puff(x, y, z, vx, vy, vz, size, grow, life, r, g, b, a, frame = F.PUFF) {
    def();
    S.x = x; S.y = y; S.z = z; S.vx = vx; S.vy = vy; S.vz = vz;
    S.s0 = size; S.s1 = size * grow; S.life = life; col(r, g, b, Math.min(1, r * 1.08), Math.min(1, g * 1.08), Math.min(1, b * 1.08));
    S.a = a; S.frame = frame; S.rv = rnd(-0.6, 0.6); S.drag = 1.8; S.buoy = 0.35; S.fin = 0.06; S.fout = 0.35;
    return spawn();
  }
  function tyreSmoke(x, y, z, cvx, cvz, k) {
    puff(x + rnd(-0.3, 0.3), y + 0.3, z + rnd(-0.3, 0.3), cvx * 0.3 + rnd(-1.4, 1.4), rnd(0.3, 1.2), cvz * 0.3 + rnd(-1.4, 1.4),
      rnd(0.7, 1.0), 4 + 2 * k, rnd(1.8, 3.2), 0.84, 0.84, 0.86, 0.35 + 0.3 * k, Math.random() < 0.5 ? F.PUFF : F.PUFF2);
  }
  function dust(x, y, z, vx, vy, vz, size, k, dirt) {
    const r = dirt ? 0.5 : 0.56, g = dirt ? 0.42 : 0.52, b = dirt ? 0.32 : 0.38;
    puff(x, y, z, vx, vy, vz, size, 3.2 + k, rnd(1.2, 2.4), r, g, b, 0.45 + 0.3 * k, F.DUST);
  }
  // Per-frame emitters set S.x..S.vz/S.s0/S.s1/S.a inline and call a style helper (no double arguments to box).
  function styleDust(dirt) {
    if (dirt) col(0.5, 0.42, 0.32, 0.54, 0.45, 0.35); else col(0.56, 0.52, 0.38, 0.6, 0.56, 0.41);
    S.frame = F.DUST; S.life = rnd(1.2, 2.4); S.rv = rnd(-0.6, 0.6); S.drag = 1.8; S.buoy = 0.35; S.fin = 0.06; S.fout = 0.35;
  }
  function styleFleck(dirt) {
    S.frame = F.FLECK; S.s0 = S.s1 = rnd(0.35, 0.6);
    if (dirt) col(0.33, 0.25, 0.16); else col(0.32, 0.5, 0.18, 0.4, 0.5, 0.22);
    S.a = 0.95; S.life = rnd(0.6, 1.1); S.grav = 9.8; S.drag = 1.2; S.floor = S.y - 0.3; S.rv = rnd(-8, 8); S.fout = 0.7; S.wind = 0.5;
  }
  function styleTyre() {
    S.frame = Math.random() < 0.5 ? F.PUFF : F.PUFF2; col(0.84, 0.84, 0.86, 0.9, 0.9, 0.93);
    S.life = rnd(1.8, 3.2); S.rv = rnd(-0.6, 0.6); S.drag = 1.8; S.buoy = 0.35; S.fin = 0.06; S.fout = 0.35;
  }
  function fleck(x, y, z, vx, vy, vz, dirt) {
    def();
    S.x = x; S.y = y; S.z = z; S.vx = vx; S.vy = vy; S.vz = vz; S.frame = F.FLECK; S.s0 = S.s1 = rnd(0.35, 0.6);
    if (dirt) col(0.33, 0.25, 0.16); else col(0.32, 0.5, 0.18, 0.4, 0.5, 0.22);
    S.a = 0.95; S.life = rnd(0.6, 1.1); S.grav = 9.8; S.drag = 1.2; S.floor = y - 0.3; S.rv = rnd(-8, 8); S.fout = 0.7; S.wind = 0.5;
    spawn();
  }
  function spark(x, y, z, vx, vy, vz, floorY) {
    def();
    S.x = x; S.y = y; S.z = z; S.vx = vx; S.vy = vy; S.vz = vz; S.frame = F.STREAK; S.orient = 1; S.str = 0.06;
    S.s0 = 0.16; S.s1 = 0.08; col(1, 0.85, 0.45, 1, 0.38, 0.1); S.add = 1; S.a = 1.4; S.life = rnd(0.35, 0.9);
    S.grav = 9.8; S.drag = 0.6; S.floor = floorY; S.fin = 0; S.fout = 0.5; S.wind = 0;
    spawn();
  }
  function pow(x, y, z, size, r = 1, g = 0.96, b = 0.75) {
    def();
    S.x = x; S.y = y; S.z = z; S.frame = F.POW; S.s0 = size * 0.4; S.s1 = size; S.life = 0.24; col(r, g, b); S.add = 1; S.a = 1;
    S.fin = 0; S.fout = 0.3; S.wind = 0;
    spawn();
  }
  function ring(x, y, z, size, life, a, r, g, b, delay = 0) {
    def();
    S.x = x; S.y = y; S.z = z; S.frame = F.RING; S.orient = 2; S.s0 = size * 0.1; S.s1 = size; S.life = life; col(r, g, b);
    S.a = a; S.fin = 0; S.fout = 0.25; S.wind = 0; S.delay = delay;
    spawn();
  }
  function star(x, y, z, vx, vy, vz, gold) {
    def();
    S.x = x; S.y = y; S.z = z; S.vx = vx; S.vy = vy; S.vz = vz; S.frame = F.STAR; S.s0 = 0.7; S.s1 = rnd(1.3, 1.8);
    if (gold) col(1, 0.74, 0.06); else col(1, 1, 0.9);
    S.a = 1; S.life = rnd(0.8, 1.2); S.grav = 5; S.drag = 2.2; S.rv = rnd(-7, 7); S.fin = 0.04; S.fout = 0.55; S.wind = 0;
    spawn();
  }
  function sparkle(x, y, z, vx, vy, vz, size, life, r = 1, g = 0.86, b = 0.45) {
    def();
    S.x = x; S.y = y; S.z = z; S.vx = vx; S.vy = vy; S.vz = vz; S.frame = F.SPARKLE; S.s0 = size; S.s1 = size * 0.3;
    col(r, g, b); S.add = 1; S.a = 1.3; S.life = life; S.flick = 0.55; S.drag = 2.5; S.rv = rnd(-2, 2); S.fin = 0.1; S.fout = 0.5; S.wind = 0.2;
    return spawn();
  }

  // ---------- smoke columns (crash sites) ----------
  const COLS = 4;
  const colX = new Float32Array(COLS), colY = new Float32Array(COLS), colZ = new Float32Array(COLS), colT = new Float32Array(COLS);
  const colLife = new Float32Array(COLS), colAcc = new Float32Array(COLS), colFireAcc = new Float32Array(COLS);
  let colNext = 0;
  function addColumn(x, y, z, life = 22) {
    const c = colNext; colNext = (colNext + 1) % COLS;
    colX[c] = x; colY[c] = y; colZ[c] = z; colT[c] = 0; colLife[c] = life; colAcc[c] = 0; colFireAcc[c] = 0;
  }
  function updateColumns(dt) {
    for (let c = 0; c < COLS; c++) {
      if (colLife[c] <= 0) continue;
      const t = (colT[c] += dt), L = colLife[c];
      if (t > L) { colLife[c] = 0; continue; }
      const k = 1 - sstep(L * 0.55, L, t);
      colAcc[c] += dt * 8 * tier.column * k;
      while (colAcc[c] >= 1) {
        colAcc[c] -= 1;
        def();
        S.x = colX[c] + rnd(-1.2, 1.2); S.y = colY[c] + rnd(0.5, 1.5); S.z = colZ[c] + rnd(-1.2, 1.2);
        S.vx = rnd(-0.6, 0.6); S.vy = rnd(2.5, 4.5); S.vz = rnd(-0.6, 0.6);
        S.frame = Math.random() < 0.6 ? F.SOOT : F.PUFF; S.s0 = rnd(2, 3); S.s1 = rnd(11, 17) * (0.6 + 0.4 * tier.column);
        col(0.09, 0.085, 0.08, 0.3, 0.29, 0.29); S.a = 0.8 * (0.5 + 0.5 * k); S.life = rnd(7, 10) * (0.7 + 0.3 * tier.column);
        S.drag = 0.45; S.buoy = 0.6; S.wind = 1.4; S.rv = rnd(-0.25, 0.25); S.fin = 0.05; S.fout = 0.45;
        spawn();
      }
      if (t < 9) {
        colFireAcc[c] += dt * 10 * tier.rate * (1 - t / 9);
        while (colFireAcc[c] >= 1) {
          colFireAcc[c] -= 1;
          def();
          S.x = colX[c] + rnd(-1.5, 1.5); S.y = colY[c] + rnd(0.2, 0.8); S.z = colZ[c] + rnd(-1.5, 1.5);
          S.vy = rnd(1.5, 3.5); S.frame = F.FIRE; S.s0 = rnd(1.2, 2); S.s1 = rnd(2.4, 3.6); col(1, 0.72, 0.32, 0.95, 0.28, 0.06);
          S.add = 1; S.a = 1; S.life = rnd(0.45, 0.8); S.drag = 1.5; S.buoy = 2; S.rv = rnd(-1.5, 1.5); S.fin = 0.1; S.fout = 0.4; S.wind = 0.6;
          spawn();
        }
      }
    }
  }

  // ---------- tracked planes ----------
  const L = (p, key, out) => out.set(p.pts[key][0], p.pts[key][1], p.pts[key][2]).applyMatrix4(p.rig.root.matrixWorld);

  function track(id, { rig, ac = null, player = false, applyScale = true } = {}) {
    if (!rig) return null;
    let p = planes.get(id);
    if (!p) {
      const d = rig.dims || { length: 8.28, span: 11, gearHeight: 1.2 };
      const sx = (d.span || 11) / 11, sz = (d.length || 8.28) / 8.28, sy = (d.gearHeight || 1.2) / 1.2;
      const pts = {};
      for (const k in C172) {
        const src = rig.fxPoints && rig.fxPoints[k];
        pts[k] = src ? [src.x ?? src[0], src.y ?? src[1], src.z ?? src[2]] : [C172[k][0] * sx, C172[k][1] * sy, C172[k][2] * sz];
      }
      p = {
        id, pts, last: new THREE.Vector3(), vel: new THREE.Vector3(), pvel: new THREE.Vector3(), has: false, nz: 1,
        trailL: -1, trailR: -1, damage: 0, damageSeen: 0, squash: new THREE.Vector3(1, 1, 1), sqT: 9, sqA: 0,
        skidT: 0, skidK: 0, skidL: new THREE.Vector3(), skidR: new THREE.Vector3(), skidHas: false, crashedSeen: false,
        acc: new Float64Array(6), lastPt: new THREE.Vector3(), lastPtHas: false,
        speed: 0, agl: 99, surface: 'grass', onGround: false,
      };
      planes.set(id, p); list.push(p);
    }
    p.rig = rig; p.ac = ac; p.player = player; p.applyScale = applyScale;
    if (p.trailL < 0) p.trailL = ribbons.alloc(1, 1, 1, 1.4, 2.2, 2);
    if (p.trailR < 0) p.trailR = ribbons.alloc(1, 1, 1, 1.4, 2.2, 2);
    return p;
  }
  function untrack(id) {
    const p = planes.get(id);
    if (!p) return;
    ribbons.free(p.trailL); ribbons.free(p.trailR);
    if (p.applyScale) p.rig.root.scale.set(1, 1, 1);
    planes.delete(id);
    list.splice(list.indexOf(p), 1);
  }
  function reset(id) {
    const p = planes.get(id);
    if (!p) return;
    p.damage = 0; p.sqT = 9; p.has = false; p.skidT = 0; p.crashedSeen = false; p.lastPtHas = false;
    ribbons.cut(p.trailL); ribbons.cut(p.trailR);
    p.squash.set(1, 1, 1);
    if (p.applyScale) p.rig.root.scale.set(1, 1, 1);
  }

  function planeFrame(p, dt) {
    const root = p.rig.root, m = root.matrixWorld.elements;
    rt.set(m[0], m[1], m[2]).normalize(); up.set(m[4], m[5], m[6]).normalize(); fw.set(-m[8], -m[9], -m[10]).normalize();
    const px = m[12], py = m[13], pz = m[14];
    const ac = p.ac;
    p.pvel.copy(p.vel);
    if (ac && ac.vel) p.vel.set(ac.vel.x, ac.vel.y, ac.vel.z);
    else if (p.has && dt > 0) p.vel.set((px - p.last.x) / dt, (py - p.last.y) / dt, (pz - p.last.z) / dt);
    if (!p.has) p.pvel.copy(p.vel);
    p.last.set(px, py, pz);
    p.has = true;
    if (dt > 0) {
      const ax = (p.vel.x - p.pvel.x) / dt, ay = (p.vel.y - p.pvel.y) / dt + 9.81, az = (p.vel.z - p.pvel.z) / dt;
      const nz = (ax * up.x + ay * up.y + az * up.z) / 9.81;
      p.nz += (Math.max(-3, Math.min(6, nz)) - p.nz) * Math.min(1, dt * 5);
    }
    p.speed = p.vel.length();
    const gy = ground(px, pz);
    const gh = (p.rig.dims && p.rig.dims.gearHeight) || 1.2;
    p.agl = ac && ac.agl != null ? ac.agl : py - gy - gh;
    p.onGround = ac ? !!ac.onGround : p.agl < 0.15;
    p.surface = ac && ac.surface ? ac.surface : surfaceAt(px, pz);
    p.groundY = gy;
    p.px = px; p.py = py; p.pz = pz;
  }

  function updatePlane(p, dt) {
    planeFrame(p, dt);
    const ac = p.ac;
    const crashed = !!(ac && ac.crashed);
    const dx = p.px - camera.position.x, dy = p.py - camera.position.y, dz = p.pz - camera.position.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const lod = p.player ? 1 : sat(1.15 - dist / 1400);

    // squash and stretch
    if (p.sqT < 3) {
      p.sqT += dt;
      const s = p.sqA * Math.exp(-p.sqT * 5.5) * Math.sin(p.sqT * 24);
      p.squash.set(1 + s * 0.5, 1 - s, 1 + s * 0.5);
      if (p.applyScale) p.rig.root.scale.copy(p.squash);
      if (p.sqT >= 3 && p.applyScale) p.rig.root.scale.set(1, 1, 1);
    }

    if (crashed) { ribbons.cut(p.trailL); ribbons.cut(p.trailR); p.lastPtHas = false; return; }
    if (lod <= 0) { ribbons.cut(p.trailL); ribbons.cut(p.trailR); return; }

    // per-effect functions stay small so V8 inlines their maths (a non-inlined call returning a float boxes it)
    p.eng = ac ? (ac.eng ?? (ac.ctl ? ac.ctl.throttle : 0)) : (p.power ?? 0);
    p.gs = Math.sqrt(p.vel.x * p.vel.x + p.vel.z * p.vel.z);
    p.soft = p.surface === 'grass' || p.surface === 'dirt'; p.dirt = p.surface === 'dirt';
    p.paved = PAVED[p.surface] === 1;
    p.lod = lod; p.dist = dist;
    fxWash(p); fxDust(p); fxSkid(p); fxVapour(p); fxSmoke(p);
    if (p.player) fxPlayer(p);
  }


  function fxWash(p) {
    const ac = p.ac, eng = p.eng, gs = p.gs, lod = p.lod, dist = p.dist, soft = p.soft, dirt = p.dirt, paved = p.paved, dt = T[1];
    // prop wash
    if (p.agl < 5 && eng > 0.45) {
      const k = Math.pow((eng - 0.45) / 0.55, 1.2) * (1 - sstep(22, 40, gs)) * (1 - sat(p.agl / 5));
      const rate = soft ? 70 * k : paved && gs < 8 ? 7 * k : 0;
      T[3] = rate * tier.rate * lod;
      const n = take(p.acc, A_WASH);
      if (n) {
        L(p, 'prop', v1);
        for (let i = 0; i < n; i++) {
          const back = rnd(1.5, 4.5), side = rnd(-1.6, 1.6);
          const x = v1.x - fw.x * back + rt.x * side, z = v1.z - fw.z * back + rt.z * side;
          const y = p.groundY + 0.25, sp = rnd(6, 13) * (0.5 + eng * 0.5);
          def();
          S.x = x; S.y = y; S.z = z;
          if (soft && Math.random() < 0.22) {
            S.y += 0.2; S.vx = -fw.x * sp + rt.x * side * 1.5; S.vy = rnd(1.5, 4); S.vz = -fw.z * sp + rt.z * side * 1.5;
            styleFleck(dirt);
          } else if (soft) {
            S.vx = -fw.x * sp + p.vel.x * 0.5 + rt.x * side * 1.2; S.vy = rnd(0.6, 2.6); S.vz = -fw.z * sp + p.vel.z * 0.5 + rt.z * side * 1.2;
            S.s0 = rnd(0.8, 1.3); S.s1 = S.s0 * (3.2 + k); S.a = 0.45 + 0.3 * k;
            styleDust(dirt);
          } else {
            S.vx = -fw.x * sp; S.vy = rnd(0.2, 0.8); S.vz = -fw.z * sp; S.s0 = 0.4; S.s1 = 1.2; S.a = 0.12 * k;
            styleDust(false); S.r0 = S.r1 = 0.75; S.g0 = S.g1 = 0.73; S.b0 = S.b1 = 0.7; S.life = rnd(0.8, 1.4);
          }
          spawn();
        }
      }
    }
  }
  function fxDust(p) {
    const ac = p.ac, eng = p.eng, gs = p.gs, lod = p.lod, dist = p.dist, soft = p.soft, dirt = p.dirt, paved = p.paved, dt = T[1];
    // rolling dust on grass (taxi / landing roll)
    if (p.onGround && soft && gs > 2) {
      const k = sat(gs / 25);
      T[3] = 26 * k * tier.rate * lod;
      const n = take(p.acc, A_DUST);
      for (let i = 0; i < n; i++) {
        L(p, (i & 1) ? 'mainL' : 'mainR', v1);
        def();
        S.x = v1.x + rnd(-0.3, 0.3); S.y = p.groundY + 0.2; S.z = v1.z + rnd(-0.3, 0.3);
        S.vx = p.vel.x * 0.15 + rnd(-1, 1); S.vy = rnd(0.4, 1.4); S.vz = p.vel.z * 0.15 + rnd(-1, 1);
        S.s0 = rnd(0.35, 0.6); S.s1 = S.s0 * (3.2 + k); S.a = 0.45 + 0.3 * k;
        styleDust(dirt);
        spawn();
      }
    }
  }
  function fxSkid(p) {
    const ac = p.ac, eng = p.eng, gs = p.gs, lod = p.lod, dist = p.dist, soft = p.soft, dirt = p.dirt, paved = p.paved, dt = T[1];
    // tyre marks + smoke after touchdown or under heavy braking on paved surfaces
    const brake = ac && ac.ctl ? ac.ctl.brake || 0 : 0;
    const braking = p.onGround && paved && brake > 0.75 && gs > 10;
    if ((p.skidT > 0 || braking) && p.onGround && paved) {
      L(p, 'mainL', v1); L(p, 'mainR', v2);
      const a = p.skidT > 0 ? 0.35 + 0.45 * p.skidK : 0.3;
      v1.y = ground(v1.x, v1.z) + 0.02; v2.y = ground(v2.x, v2.z) + 0.02;
      if (p.skidHas) {
        SK[0] = 0.24; SK[1] = a; SK[2] = T[0];
        skids.add(p.skidL, v1, SK);
        skids.add(p.skidR, v2, SK);
      }
      p.skidL.copy(v1); p.skidR.copy(v2); p.skidHas = true;
      T[3] = (p.skidT > 0 ? 30 * p.skidK : 6) * tier.rate * lod;
      const n = take(p.acc, A_BRAKE);
      const kk = p.skidT > 0 ? p.skidK : 0.2;
      for (let i = 0; i < n; i++) {
        const w = (i & 1) ? v1 : v2;
        def();
        S.x = w.x + rnd(-0.3, 0.3); S.y = p.groundY + 0.3; S.z = w.z + rnd(-0.3, 0.3);
        S.vx = p.vel.x * 0.3 + rnd(-1.4, 1.4); S.vy = rnd(0.3, 1.2); S.vz = p.vel.z * 0.3 + rnd(-1.4, 1.4);
        S.s0 = rnd(0.7, 1.0); S.s1 = S.s0 * (4 + 2 * kk); S.a = 0.35 + 0.3 * kk;
        styleTyre();
        spawn();
      }
    } else p.skidHas = false;
    if (p.skidT > 0) p.skidT -= dt;

  }
  function fxVapour(p) {
    const ac = p.ac, eng = p.eng, gs = p.gs, lod = p.lod, dist = p.dist, soft = p.soft, dirt = p.dirt, paved = p.paved, dt = T[1];
    // wingtip vapour
    if (!p.onGround) {
      const sf = sstep(28, 45, p.speed);
      const aoa = ac && ac.alpha != null ? sstep(0.15, 0.25, ac.alpha) : 0;
      const I = Math.max(sstep(1.7, 2.8, p.nz), aoa) * sf * (p.vapourBoost || 1);
      if (I > 0.04) {
        L(p, 'tipL', v1); L(p, 'tipR', v2);
        RW[0] = 0.42 * Math.min(1, I); RW[1] = 0.2 + 0.45 * I; RW[2] = T[0];
        ribbons.push(p.trailL, v1, RW);
        ribbons.push(p.trailR, v2, RW);
      } else { ribbons.cut(p.trailL); ribbons.cut(p.trailR); }
    } else { ribbons.cut(p.trailL); ribbons.cut(p.trailR); }

  }
  function fxSmoke(p) {
    const ac = p.ac, eng = p.eng, gs = p.gs, lod = p.lod, dist = p.dist, soft = p.soft, dirt = p.dirt, paved = p.paved, dt = T[1];
    // engine smoke when damaged (partial protection lost), trailing from the cowl
    if (p.damage > 0.02) {
      L(p, 'cowl', v1);
      const lvl = p.damage;
      T[3] = (8 + 40 * lvl) * tier.rate * Math.max(0.35, lod);
      const n = take(p.acc, A_SMOKE);
      const g0 = 0.62 - 0.48 * lvl;
      for (let i = 0; i < n; i++) {
        const f = p.lastPtHas ? (i + Math.random()) / n : 1;
        const x = p.lastPt.x + (v1.x - p.lastPt.x) * f, y = p.lastPt.y + (v1.y - p.lastPt.y) * f, z = p.lastPt.z + (v1.z - p.lastPt.z) * f;
        def();
        S.x = x + rnd(-0.15, 0.15); S.y = y + rnd(-0.1, 0.1); S.z = z + rnd(-0.15, 0.15);
        S.vx = p.vel.x * 0.15 + rnd(-0.5, 0.5); S.vy = rnd(0.2, 0.8); S.vz = p.vel.z * 0.15 + rnd(-0.5, 0.5);
        S.frame = lvl > 0.6 ? F.SOOT : F.PUFF; S.s0 = 0.6 + 0.5 * lvl; S.s1 = 1.6 + 4 * lvl; col(g0, g0, g0 * 1.02, g0 + 0.15, g0 + 0.15, g0 + 0.16);
        S.a = 0.4 + 0.45 * lvl; S.life = 1.8 + 2.6 * lvl; S.drag = 1.2; S.buoy = 0.5; S.rv = rnd(-0.8, 0.8); S.fin = 0.08; S.fout = 0.35;
        spawn();
      }
      if (lvl > 0.75 && Math.random() < dt * 12 * tier.rate) {
        def();
        S.x = v1.x; S.y = v1.y; S.z = v1.z; S.vx = p.vel.x * 0.6; S.vy = p.vel.y * 0.6; S.vz = p.vel.z * 0.6;
        S.frame = F.FIRE; S.s0 = 0.35; S.s1 = 0.8; col(1, 0.7, 0.3, 1, 0.3, 0.05); S.add = 1; S.a = 1; S.life = 0.25; S.drag = 3; S.wind = 0;
        spawn();
      }
      p.lastPt.copy(v1); p.lastPtHas = true;
    } else p.lastPtHas = false;

  }
  function fxPlayer(p) {
    const ac = p.ac, eng = p.eng, gs = p.gs, lod = p.lod, dist = p.dist, soft = p.soft, dirt = p.dirt, paved = p.paved, dt = T[1];

    // heat shimmer (high tier, chase view, slow + high power)
    if (screen) {
      const amt = tier.shimmer && view === 'chase' && dist < 70 && p.agl < 2 ? sstep(0.35, 0.9, eng) * (1 - sstep(12, 28, p.speed)) : 0;
      L(p, 'exhaust', v3);
      v3.addScaledVector(fw, -1.3).addScaledVector(up, -0.15);
      screen.setShimmer(amt, v3, T);
    }
    // speed lines (subtle)
    const sk = sstep(56, 80, p.speed);
    if (sk > 0 && tier.lines > 0) {
      T[3] = 40 * sk * tier.lines;
      const n = take(p.acc, A_LINES);
      if (n) {
        tmpVel.copy(p.vel).normalize();
        for (let i = 0; i < n; i++) {
          const ang = Math.random() * 6.283, r = rnd(3, 10), ahead = rnd(18, 50);
          v4.set(0, 1, 0).cross(tmpVel).normalize();
          v3.copy(tmpVel).cross(v4);
          def();
          S.x = camera.position.x + tmpVel.x * ahead + (v4.x * Math.cos(ang) + v3.x * Math.sin(ang)) * r;
          S.y = camera.position.y + tmpVel.y * ahead + (v4.y * Math.cos(ang) + v3.y * Math.sin(ang)) * r;
          S.z = camera.position.z + tmpVel.z * ahead + (v4.z * Math.cos(ang) + v3.z * Math.sin(ang)) * r;
          S.frame = F.STREAK; S.orient = 1; S.fixed = 1; S.sx = -tmpVel.x; S.sy = -tmpVel.y; S.sz = -tmpVel.z; S.str = rnd(6, 12) * sk;
          S.s0 = S.s1 = 0.13; col(1, 1, 1); S.add = 1; S.a = rnd(0.16, 0.32) * sk; S.life = rnd(0.35, 0.6); S.fin = 0.2; S.fout = 0.5; S.wind = 0; S.drag = 0;
          spawn();
        }
      }
    }
    // thin cloud wisps when high and quick
    const wk = sstep(350, 700, p.agl) * sstep(38, 55, p.speed) * (p.wispBoost ?? 1);
    if (wk > 0) {
      T[3] = 4 * wk * tier.rate;
      const n = take(p.acc, A_WISP);
      if (n) {
        tmpVel.copy(p.vel).normalize();
        for (let i = 0; i < n; i++) {
          def();
          const ahead = rnd(60, 120);
          S.x = p.px + tmpVel.x * ahead + rnd(-18, 18); S.y = p.py + tmpVel.y * ahead + rnd(-6, 8); S.z = p.pz + tmpVel.z * ahead + rnd(-18, 18);
          S.frame = F.WISP; S.orient = 1; S.fixed = 1; S.sx = tmpVel.x; S.sy = tmpVel.y; S.sz = tmpVel.z; S.str = rnd(10, 22);
          S.s0 = rnd(6, 10); S.s1 = S.s0 * 1.3; col(1, 1, 1); S.a = 0.5 * wk; S.life = rnd(2.2, 3.2); S.fin = 0.3; S.fout = 0.6; S.wind = 0.5; S.drag = 0;
          spawn();
        }
      }
    }
    }

  // ---------- public emitters ----------
  const posOf = (o, out) => {
    if (o.pos) return out.set(o.pos.x, o.pos.y, o.pos.z);
    const p = o.id != null ? planes.get(o.id) : null;
    if (p) return out.set(p.rig.root.matrixWorld.elements[12], p.rig.root.matrixWorld.elements[13], p.rig.root.matrixWorld.elements[14]);
    return out.copy(camera.position);
  };

  function touchdown(o = {}) {
    const p = o.id != null ? planes.get(o.id) : null;
    if (p) planeFrame(p, 0);
    const sink = o.sinkFpm ?? 300, slip = Math.abs(o.sideslip ?? 0);
    const surface = o.surface || (p ? p.surface : 'runway');
    const k = sat((sink - 120) / 700 + slip * 2.5);
    posOf(o, v3);
    const vx = p ? p.vel.x : (o.vel ? o.vel.x : 0), vz = p ? p.vel.z : (o.vel ? o.vel.z : 0);
    const gy = ground(v3.x, v3.z);
    const wheelsL = v1, wheelsR = v2;
    if (p) { L(p, 'mainL', wheelsL); L(p, 'mainR', wheelsR); }
    else {
      const sp = Math.hypot(vx, vz) || 1;
      wheelsL.set(v3.x + (vz / sp) * 1.27, gy, v3.z - (vx / sp) * 1.27); wheelsR.set(v3.x - (vz / sp) * 1.27, gy, v3.z + (vx / sp) * 1.27);
    }
    if (surface === 'water') return impact({ pos: v3, kind: 'water', strength: k, vel: o.vel || (p && p.vel) });
    if (PAVED[surface]) {
      const n = Math.round((5 + 16 * k) * tier.rate);
      for (let i = 0; i < n; i++) {
        const w = (i & 1) ? wheelsL : wheelsR;
        puff(w.x + rnd(-0.4, 0.4), gy + 0.35, w.z + rnd(-0.4, 0.4), vx * 0.45 + rnd(-2.5, 2.5), rnd(0.6, 2.2), vz * 0.45 + rnd(-2.5, 2.5),
          rnd(0.8, 1.3) * (0.7 + 0.5 * k), 3.6 + 2 * k, rnd(1.6, 2.8), 0.88, 0.88, 0.9, 0.5 + 0.3 * k, Math.random() < 0.5 ? F.PUFF : F.PUFF2);
      }
      if (p) { p.skidT = 0.25 + 0.55 * k; p.skidK = k; p.skidHas = false; }
      else {
        const sp = Math.hypot(vx, vz) || 1, len = 3 + 7 * k;
        SK[0] = 0.24; SK[1] = 0.35 + 0.45 * k; SK[2] = T[0];
        for (const w of [wheelsL, wheelsR]) { w.y = gy + 0.02; v4.set(w.x - (vx / sp) * len, gy + 0.02, w.z - (vz / sp) * len); skids.add(v4, w, SK); }
      }
    } else {
      const dirt = surface === 'dirt';
      const n = Math.round((6 + 18 * k) * tier.rate);
      for (let i = 0; i < n; i++) {
        const w = (i & 1) ? wheelsL : wheelsR;
        dust(w.x + rnd(-0.4, 0.4), gy + 0.2, w.z + rnd(-0.4, 0.4), vx * 0.25 + rnd(-2, 2), rnd(0.6, 2.2), vz * 0.25 + rnd(-2, 2), rnd(0.5, 0.9), k, dirt);
        if (Math.random() < 0.35) fleck(w.x, gy + 0.3, w.z, vx * 0.3 + rnd(-3, 3), rnd(2, 5), vz * 0.3 + rnd(-3, 3), dirt);
      }
    }
  }

  function wash(o) {
    const pw = o.power ?? 1, soft = o.surface === 'grass' || o.surface === 'dirt';
    T[3] = (soft ? 70 : 7) * pw * pw * tier.rate;
    const n = take(emitAcc, 0);
    const dx = o.dir ? o.dir.x : 0, dz = o.dir ? o.dir.z : 1;
    for (let i = 0; i < n; i++) {
      const sp = rnd(6, 13) * pw, y = ground(o.pos.x, o.pos.z) + 0.25;
      if (soft) dust(o.pos.x + rnd(-1.5, 1.5), y, o.pos.z + rnd(-1.5, 1.5), dx * sp, rnd(0.4, 1.8), dz * sp, rnd(0.5, 0.9), pw, o.surface === 'dirt');
      else puff(o.pos.x, y, o.pos.z, dx * sp, 0.4, dz * sp, 0.4, 3, 1.1, 0.75, 0.73, 0.7, 0.12 * pw, F.DUST);
    }
  }

  let manualL = -1, manualR = -1;
  function vapour(o) {
    if (manualL < 0) { manualL = ribbons.alloc(1, 1, 1, 1.4, 2.2, 2); manualR = ribbons.alloc(1, 1, 1, 1.4, 2.2, 2); }
    const I = o.intensity ?? 1;
    if (I < 0.04) { ribbons.cut(manualL); ribbons.cut(manualR); return; }
    RW[0] = 0.42 * Math.min(1, I); RW[1] = 0.2 + 0.45 * I; RW[2] = T[0];
    ribbons.push(manualL, o.wingtipL, RW);
    ribbons.push(manualR, o.wingtipR, RW);
  }

  function impact(o = {}) {
    const kind = o.kind || 'bounce', s = sat(o.strength ?? 0.6);
    const p = o.id != null ? planes.get(o.id) : null;
    if (p) planeFrame(p, 0);
    posOf(o, v3);
    if (o.normal) nrm.set(o.normal.x ?? o.normal[0], o.normal.y ?? o.normal[1], o.normal.z ?? o.normal[2]).normalize(); else nrm.set(0, 1, 0);
    const cvx = p ? p.vel.x : o.vel ? o.vel.x : 0, cvy = p ? p.vel.y : o.vel ? o.vel.y : 0, cvz = p ? p.vel.z : o.vel ? o.vel.z : 0;
    const gy = ground(v3.x, v3.z);
    // contact point: the ground under the plane for floor hits, the plane itself for walls
    if (nrm.y > 0.5 && v3.y - gy < 4) v3.y = gy + 0.3;
    const surf = surfaceAt(v3.x, v3.z);
    if (kind === 'water' || (surf === 'water' && v3.y - gy < 3)) splash(v3, s, cvx, cvz, kind === 'crash');
    if (kind === 'bounce' || kind === 'damage') {
      const big = kind === 'bounce' ? 1 : 0.6;
      pow(v3.x, v3.y + 0.4, v3.z, (3 + 3 * s) * big, 1, 0.86, 0.35);
      const ns = Math.round((5 + 4 * s) * big);
      v4.set(0, 1, 0); if (Math.abs(nrm.y) > 0.9) v4.set(1, 0, 0);
      v1.crossVectors(nrm, v4).normalize(); v2.crossVectors(nrm, v1).normalize();
      for (let i = 0; i < ns; i++) {
        const a = (i / ns) * 6.283 + rnd(-0.2, 0.2), sp = rnd(8, 12);
        const dx = v1.x * Math.cos(a) + v2.x * Math.sin(a), dy = v1.y * Math.cos(a) + v2.y * Math.sin(a), dz = v1.z * Math.cos(a) + v2.z * Math.sin(a);
        star(v3.x, v3.y + 0.6, v3.z, cvx * 0.6 + dx * sp + nrm.x * 3, cvy * 0.3 + dy * sp + nrm.y * 4 + 2, cvz * 0.6 + dz * sp + nrm.z * 3, i % 2 === 0);
      }
      if (nrm.y > 0.5) ring(v3.x, gy + 0.12, v3.z, 7 + 5 * s, 0.55, 0.55, 1, 1, 0.95);
      const soft = surf === 'grass' || surf === 'dirt';
      const nPuff = Math.round((5 + 6 * s) * tier.rate);
      for (let i = 0; i < nPuff; i++) {
        if (soft) dust(v3.x + rnd(-1, 1), v3.y, v3.z + rnd(-1, 1), cvx * 0.3 + rnd(-3, 3), rnd(0.5, 2.5), cvz * 0.3 + rnd(-3, 3), rnd(0.6, 1), s, surf === 'dirt');
        else tyreSmoke(v3.x, v3.y - 0.3, v3.z, cvx, cvz, s);
      }
      if (p) { p.sqT = 0; p.sqA = (kind === 'bounce' ? 0.14 : 0.09) + 0.12 * s; }
    }
    if (kind === 'damage' || kind === 'crash') {
      const n = Math.round((kind === 'crash' ? 30 : 16 + 18 * s) * tier.rate) + 6;
      for (let i = 0; i < n; i++) {
        const sp = rnd(5, 16);
        spark(v3.x, v3.y + 0.3, v3.z, cvx * 0.4 + nrm.x * sp * 0.6 + rnd(-8, 8), Math.abs(nrm.y) * sp * 0.5 + rnd(1, 7), cvz * 0.4 + nrm.z * sp * 0.6 + rnd(-8, 8), gy + 0.05);
      }
      puff(v3.x, v3.y, v3.z, cvx * 0.2, 1, cvz * 0.2, 0.8, 4, 1.6, 0.35, 0.34, 0.33, 0.6, F.SOOT);
    }
    if (kind === 'crash' && surf !== 'water') crash(v3, gy, cvx, cvy, cvz, s, o.colors || (p && liveryColors(p.rig)));
    return p ? p.squash : null;
  }

  function splash(at, s, cvx, cvz, big) {
    const k = big ? 1 : 0.4 + 0.6 * s, wy = ground(at.x, at.z);
    const n = Math.round((20 + 50 * k) * tier.rate) + 8;
    for (let i = 0; i < n; i++) {
      def();
      const a = Math.random() * 6.283, r = rnd(1, 6) * k;
      S.x = at.x + Math.cos(a) * rnd(0, 2); S.y = wy + 0.2; S.z = at.z + Math.sin(a) * rnd(0, 2);
      S.vx = Math.cos(a) * r + cvx * 0.3; S.vy = rnd(4, 14) * (0.6 + 0.4 * k); S.vz = Math.sin(a) * r + cvz * 0.3;
      S.frame = F.DROP; S.orient = 1; S.str = 0.07; S.s0 = rnd(0.25, 0.55); S.s1 = S.s0 * 0.8; col(0.9, 0.95, 1);
      S.a = 0.9; S.life = rnd(0.9, 1.7); S.grav = 9.8; S.drag = 0.3; S.floor = wy - 2; S.fin = 0; S.fout = 0.6; S.wind = 0.3;
      spawn();
    }
    const m = Math.round((6 + 10 * k) * tier.rate) + 2;
    for (let i = 0; i < m; i++) {
      puff(at.x + rnd(-2, 2), wy + rnd(0.5, 2.5), at.z + rnd(-2, 2), cvx * 0.2 + rnd(-2, 2), rnd(1, 4) * k, cvz * 0.2 + rnd(-2, 2),
        rnd(1.6, 3) * (0.6 + 0.4 * k), 3, rnd(1.2, 2.2), 0.95, 0.97, 1, 0.75, i & 1 ? F.SPRAY : F.PUFF);
    }
    for (let i = 0; i < 3; i++) ring(at.x, wy + 0.06, at.z, (9 + i * 5) * (0.6 + 0.4 * k), 1.5 + i * 0.6, 0.55 - i * 0.12, 0.95, 0.98, 1, i * 0.22);
  }

  function crash(at, gy, cvx, cvy, cvz, s, colors) {
    def();
    S.x = at.x; S.y = at.y + 1; S.z = at.z; S.frame = F.GLOW; S.s0 = 3; S.s1 = 10; S.life = 0.3; col(1, 0.7, 0.35); S.add = 1; S.a = 0.7; S.fin = 0; S.fout = 0.2; S.wind = 0;
    spawn();
    const nf = Math.round(14 + 14 * tier.rate);
    for (let i = 0; i < nf; i++) {
      def();
      const a = Math.random() * 6.283, sp = rnd(2, 8);
      S.x = at.x + rnd(-1, 1); S.y = at.y + rnd(0, 1.5); S.z = at.z + rnd(-1, 1);
      S.vx = Math.cos(a) * sp + cvx * 0.25; S.vy = rnd(2, 7); S.vz = Math.sin(a) * sp + cvz * 0.25;
      S.frame = F.FIRE; S.s0 = rnd(1.5, 2.5); S.s1 = rnd(5, 8); col(1, 0.55, 0.18, 0.75, 0.16, 0.03); S.add = 0.75; S.a = 0.75;
      S.life = rnd(0.6, 1.3); S.drag = 2.2; S.buoy = 3.5; S.rv = rnd(-2, 2); S.fin = 0.05; S.fout = 0.35; S.wind = 0.5;
      spawn();
      // the fire's own smoke, starting where the flame dies
      def();
      S.x = at.x + rnd(-1.5, 1.5); S.y = at.y + rnd(1, 3); S.z = at.z + rnd(-1.5, 1.5);
      S.vx = Math.cos(a) * sp * 0.4 + cvx * 0.1; S.vy = rnd(2, 4); S.vz = Math.sin(a) * sp * 0.4 + cvz * 0.1;
      S.frame = F.SOOT; S.s0 = rnd(3, 4); S.s1 = rnd(8, 12); col(0.12, 0.11, 0.1, 0.28, 0.27, 0.26); S.a = 0.8;
      S.life = rnd(3, 4.5); S.drag = 1; S.buoy = 1.2; S.rv = rnd(-0.4, 0.4); S.fin = 0.1; S.fout = 0.5; S.delay = rnd(0.25, 0.6);
      spawn();
    }
    // cartoon touch: a sooty smoke ring that rises
    def();
    S.x = at.x; S.y = at.y + 3; S.z = at.z; S.vy = 5; S.frame = F.RING; S.s0 = 2; S.s1 = 11; col(0.18, 0.17, 0.16); S.a = 0.75;
    S.life = 2.6; S.drag = 0.8; S.fin = 0.1; S.fout = 0.4; S.delay = 0.35; S.wind = 0.6;
    spawn();
    for (let i = 0; i < 3; i++) star(at.x, at.y + 2, at.z, rnd(-5, 5), rnd(6, 10), rnd(-5, 5), true);
    addColumn(at.x, gy, at.z, 22 * (0.6 + 0.4 * tier.column));
    // debris
    debris.clear();
    const nd = tier.debris;
    for (let i = 0; i < nd; i++) {
      const a = Math.random() * 6.283, sp = rnd(4, 14);
      const c = colors && colors.length ? colors[i % colors.length] : null;
      let r = 0.85, g = 0.85, b = 0.85;
      if (c) { r = c.r ?? c[0]; g = c.g ?? c[1]; b = c.b ?? c[2]; } else if (i % 3 === 1) { r = 0.75; g = 0.12; b = 0.15; } else if (i % 3 === 2) { r = 0.25; g = 0.25; b = 0.27; }
      const panel = i % 2 === 0;
      debris.spawn(at.x + rnd(-1, 1), at.y + rnd(0.5, 2), at.z + rnd(-1, 1), Math.cos(a) * sp + cvx * 0.35, rnd(4, 13), Math.sin(a) * sp + cvz * 0.35,
        panel ? rnd(0.6, 1.4) : rnd(0.08, 0.15), panel ? rnd(0.03, 0.06) : rnd(0.08, 0.15), panel ? rnd(0.4, 0.9) : rnd(0.8, 1.8), r, g, b, i < 3 ? 1 : 0, rnd(12, 18));
    }
    // the runaway wheel
    const wa = Math.random() * 6.283;
    debris.spawn(at.x, at.y + 1, at.z, Math.cos(wa) * 16 + cvx * 0.5, 9, Math.sin(wa) * 16 + cvz * 0.5, 0.42, 0.42, 0.16, 0.08, 0.08, 0.08, 0, 20);
  }
  const debrisSmoke = (i, x, y, z, k) => {
    if (Math.random() > T[1] * 9 * k * tier.rate) return;
    def();
    S.x = x; S.y = y + 0.2; S.z = z; S.vy = rnd(0.8, 1.6); S.frame = F.SOOT; S.s0 = 0.4; S.s1 = 2.6; col(0.16, 0.15, 0.14, 0.32, 0.31, 0.3);
    S.a = 0.55; S.life = rnd(1.8, 2.8); S.drag = 1; S.buoy = 0.4; S.fin = 0.1; S.fout = 0.4;
    spawn();
  };

  function damageSmoke(id, o = {}) {
    const p = planes.get(id);
    const lvl = sat(o.level ?? 0);
    if (p) { p.damage = lvl; return; }
    if (!o.pos || lvl <= 0.02) return;
    T[3] = (5 + 30 * lvl) * tier.rate;
    const n = take(emitAcc, 0);
    for (let i = 0; i < n; i++) puff(o.pos.x, o.pos.y, o.pos.z, rnd(-0.4, 0.4), rnd(0.2, 0.8), rnd(-0.4, 0.4), 0.3 + 0.3 * lvl, 4, 2 + 2 * lvl, 0.55 - 0.4 * lvl, 0.55 - 0.4 * lvl, 0.56 - 0.4 * lvl, 0.35 + 0.4 * lvl);
  }

  // Inside views get the burst a few metres ahead of the camera so the player actually sees it.
  function celebrate(o = {}) {
    const kind = o.kind || 'combo';
    const p = o.id != null ? planes.get(o.id) : null;
    if (p) planeFrame(p, 0);
    camera.getWorldDirection(camF);
    const cv = p ? p.vel : o.vel ? tmpVel.set(o.vel.x, o.vel.y, o.vel.z) : tmpVel.set(0, 0, 0);
    if (view !== 'chase' || (!o.pos && !p)) v3.copy(camera.position).addScaledVector(camF, kind === 'rankup' ? 16 : 11);
    else posOf(o, v3);
    const cvx = cv.x, cvy = cv.y, cvz = cv.z;
    if (kind === 'rankup') {
      if (view === 'chase' && p) v3.addScaledVector(fw.set(p.vel.x, 0, p.vel.z).normalize(), 9);
      crown(v3, cvx, cvy, cvz, view !== 'chase' || (!o.pos && !p) ? 2 : 3.5);
      return;
    }
    const big = Math.min(1.6, Math.max(0.7, (o.mult ?? 2) / 2));
    const n = Math.round((40 + 50 * tier.rate) * big);
    for (let i = 0; i < n; i++) {
      def();
      const c = PALETTE[i % PALETTE.length];
      const u = Math.random() * 2 - 1, a = Math.random() * 6.283, rr = Math.sqrt(1 - u * u), sp = rnd(4, 11);
      S.x = v3.x; S.y = v3.y + 2; S.z = v3.z;
      S.vx = cvx * 0.9 + rr * Math.cos(a) * sp; S.vy = cvy * 0.9 + u * sp * 0.7 + 3; S.vz = cvz * 0.9 + rr * Math.sin(a) * sp;
      S.frame = F.CONFETTI; S.s0 = S.s1 = rnd(0.22, 0.34); col(c[0], c[1], c[2]); S.a = 1; S.life = rnd(2.2, 3.4);
      S.grav = 3; S.drag = 1.1; S.rv = rnd(-14, 14); S.fin = 0; S.fout = 0.75; S.wind = 0.6; S.flick = 0.35;
      spawn();
    }
    const m = Math.round(10 + 10 * tier.rate);
    for (let i = 0; i < m; i++) {
      const a = Math.random() * 6.283, sp = rnd(2, 7);
      sparkle(v3.x + rnd(-1, 1), v3.y + 2 + rnd(-1, 1), v3.z + rnd(-1, 1), cvx * 0.95 + Math.cos(a) * sp, cvy * 0.95 + rnd(-2, 4), cvz * 0.95 + Math.sin(a) * sp, rnd(0.6, 1.2), rnd(0.8, 1.5));
    }
    pow(v3.x, v3.y + 2, v3.z, 4, 1, 0.88, 0.5);
  }

  // A crown drawn in smoke, in the plane facing the camera.
  const CROWN = [];
  {
    const tips = [[-1, 0.85], [-0.5, 1.08], [0, 1.28], [0.5, 1.08], [1, 0.85]], vals = [[-0.75, 0.45], [-0.25, 0.5], [0.25, 0.5], [0.75, 0.45]];
    for (let i = 0; i <= 14; i++) { CROWN.push([-1 + i / 7, 0]); CROWN.push([-1 + i / 7, 0.3]); }
    const outline = [tips[0], vals[0], tips[1], vals[1], tips[2], vals[2], tips[3], vals[3], tips[4]];
    for (let i = 0; i < outline.length - 1; i++) for (let k = 0; k < 6; k++) {
      const t = k / 6; CROWN.push([outline[i][0] + (outline[i + 1][0] - outline[i][0]) * t, outline[i][1] + (outline[i + 1][1] - outline[i][1]) * t]);
    }
    CROWN.push(tips[4]);
    for (const t of [[-1, 0.15], [1, 0.15], [-1, 0.6], [1, 0.6]]) CROWN.push(t);
    CROWN.tips = tips;
  }
  const GEMS = [[-0.5, 0.15, 0.9, 0.12, 0.2], [0, 0.15, 0.2, 0.35, 1], [0.5, 0.15, 0.15, 0.85, 0.35]];
  function crown(at, cvx, cvy, cvz, lift) {
    camera.getWorldDirection(camF);
    v1.set(0, 1, 0).cross(camF).normalize().negate();
    if (v1.lengthSq() < 0.5) v1.set(1, 0, 0);
    const sc = 3.4, cx = at.x, cy = at.y + lift - 1.5, cz = at.z;
    const keep = 0.85;
    for (let i = 0; i < CROWN.length; i++) {
      const [u, w] = CROWN[i];
      def();
      S.x = cx + v1.x * u * sc + rnd(-0.12, 0.12); S.y = cy + w * sc + rnd(-0.12, 0.12); S.z = cz + v1.z * u * sc + rnd(-0.12, 0.12);
      S.vx = cvx * keep + rnd(-0.3, 0.3); S.vy = cvy * keep + rnd(0.1, 0.6); S.vz = cvz * keep + rnd(-0.3, 0.3);
      S.frame = i & 1 ? F.PUFF : F.PUFF2; S.s0 = 0.5; S.s1 = rnd(1.0, 1.35); col(1, 0.7, 0.2, 1, 0.9, 0.6); S.a = 0.95; S.add = 0.3;
      S.life = rnd(2.4, 3.0); S.drag = 0.15; S.buoy = 0.25; S.fin = 0.08; S.fout = 0.5; S.wind = 0.15; S.rv = rnd(-0.4, 0.4);
      spawn();
    }
    for (const [u, w] of CROWN.tips) {
      const i = sparkle(cx + v1.x * u * sc, cy + w * sc + 0.4, cz + v1.z * u * sc, cvx * keep, cvy * keep, cvz * keep, 1.3, 1.6);
      if (i >= 0) P.drag[i] = 0.15;
    }
    for (const g of GEMS) {
      def();
      S.x = cx + v1.x * g[0] * sc; S.y = cy + g[1] * sc; S.z = cz + v1.z * g[0] * sc; S.vx = cvx * keep; S.vy = cvy * keep; S.vz = cvz * keep;
      S.frame = F.GLOW; S.s0 = 1.6; S.s1 = 1.2; col(g[2], g[3], g[4]); S.add = 1; S.a = 1.4; S.life = 2.2; S.drag = 0.15; S.fin = 0.15; S.fout = 0.5; S.wind = 0.15;
      spawn();
    }
  }

  // ---------- event adapters (the tiny wiring surface for GAMEPLAY) ----------
  function onAircraftEvent(id, ev) {
    const p = planes.get(id);
    const ac = p && p.ac;
    switch (ev.type) {
      case 'touchdown': touchdown({ id, sinkFpm: ev.fpm, sideslip: ac ? ac.beta : 0, surface: ev.surface }); break;
      case 'impact': {
        const water = ev.kind === 'surface' && ac && ac.surface === 'water';
        const spd = p ? p.speed : 20;
        const s = sat(spd / 45);
        if (water) impact({ id, kind: 'water', strength: s });
        if (ev.result === 'bounce' || ev.result === 'damage') impact({ id, kind: ev.result, strength: s, normal: ev.normal });
        break;
      }
      case 'crash': {
        const water = (ac && ac.surface === 'water') || /water/.test(ev.reason || '');
        impact({ id, kind: water ? 'water' : 'crash', strength: 1 });
        break;
      }
      case 'tailstrike': {
        if (!p) break;
        L(p, 'tail', v3);
        const gy = ground(v3.x, v3.z);
        for (let i = 0; i < Math.round(10 * tier.rate) + 4; i++) spark(v3.x, gy + 0.1, v3.z, p.vel.x * 0.5 + rnd(-3, 3), rnd(1, 4), p.vel.z * 0.5 + rnd(-3, 3), gy + 0.05);
        break;
      }
      default: break;
    }
  }
  function onGameEvent(type, d = {}, id = 'player') {
    if (type === 'combo' && (d.mult ?? 0) >= 2) celebrate({ id, kind: 'combo', mult: d.mult });
    else if (type === 'rankUp') celebrate({ id, kind: 'rankup' });
    else if (type === 'protection' && d.mode === 'partial' && d.pct != null) {
      const p = planes.get(id);
      if (p) p.damage = d.pct >= 100 ? 0 : sat(1 - d.pct / 100) * 0.9 + 0.1;
    }
  }

  // ---------- frame ----------
  // performance.now() boxes a fresh double per call, so CPU timing is opt-in (setTiming) for benches.
  let timing = false;
  function update(dt) {
    const t0 = timing ? performance.now() : 0;
    T[1] = dt;
    if (dt > 0) {
      T[0] += dt;
      for (let i = 0; i < list.length; i++) updatePlane(list[i], dt);
      updateColumns(dt);
      debris.update(T, ground, debrisSmoke);
    }
    P.update(T, camera.position, wind);
    ribbons.update(T, camera.position);
    skids.update(T);
    if (screen) screen.updateGlare(tier.glare && view !== 'chase', sunDir, 1);
    if (timing) T[2] += (performance.now() - t0 - T[2]) * 0.05;
  }

  function setQuality(qq) {
    if (!TIERS[qq]) return;
    q = qq; tier = TIERS[qq];
    P.cap = tier.cap;
    debris.setCap(tier.debris);
    skids.setFade(tier.skidFade);
    if (screen && !tier.shimmer) screen.setShimmer(0, v3, T);
  }
  setQuality(q);

  // world.wind = { from: deg, kt } (AIRPORT); smoke drifts downwind
  const setWindFrom = (from, kt) => {
    const r = ((from + 180) * Math.PI) / 180, v = (kt || 0) * KT;
    wind.set(Math.sin(r) * v, 0, -Math.cos(r) * v);
  };
  if (world && world.wind && world.wind.from != null) setWindFrom(world.wind.from, world.wind.kt);
  if (world && world.sun) {
    const s = world.sun, tp = s.target ? s.target.position : v1.set(0, 0, 0);
    sunDir.copy(s.position).sub(tp).normalize();
  }

  function clear() {
    P.clear(); ribbons.clear(); skids.clear(); debris.clear();
    for (let c = 0; c < COLS; c++) colLife[c] = 0;
    for (const p of list) reset(p.id);
  }

  function dispose() {
    clear();
    P.dispose(); ribbons.dispose(); skids.dispose(); debris.dispose(); screen && screen.dispose();
    atlas.texture.dispose();
    planes.clear(); list.length = 0;
  }

  return {
    update, setQuality, dispose, clear,
    get quality() { return q; },
    setView(v) { view = v; },
    setTiming(on) { timing = !!on; },
    setWind(x, z) { wind.set(x, 0, z); },
    setWindFrom,
    setLight(k) { P.material.uniforms.uLight.value = k; ribbons.material.uniforms.uLight.value = k; },
    setSunDir(v) { sunDir.set(v.x, v.y, v.z).normalize(); },
    track, untrack, reset,
    scaleOf(id) { const p = planes.get(id); return p ? p.squash : null; },
    touchdown, wash, vapour, impact, damageSmoke, celebrate,
    onAircraftEvent, onGameEvent,
    stats() {
      return {
        quality: q, particles: P.n, cap: P.cap, poolMax: MAXP, spawned: P.spawned, dropped: P.dropped, debris: debris.n,
        ribbonsVisible: ribbons.mesh.visible, skidsVisible: skids.mesh.visible, tracked: list.length, cpuMs: +T[2].toFixed(3),
        shimmer: screen ? screen.shimmer.visible : false, shimmerOk: screen ? screen.shimmerOk : false, glare: screen ? screen.glare.visible : false,
        calls: (P.mesh.visible ? 1 : 0) + (ribbons.mesh.visible ? 1 : 0) + (skids.mesh.visible ? 1 : 0) + (debris.mesh.visible ? 1 : 0)
          + (screen && screen.shimmer.visible ? 1 : 0) + (screen && screen.glare.visible ? 1 : 0),
      };
    },
    _internals: { P, ribbons, skids, debris, screen, planes },
  };
}
