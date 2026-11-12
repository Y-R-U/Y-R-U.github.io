import { createRng } from './rng.js';
import { CONFIG } from '../config.js';

const NAV = 4;      // nav cell size (m)
const DEN = 16;     // pedestrian density cell size (m)
const UNREACHED = 65535;

function buildNav(sim) {
  const col = sim.collider, size = sim.map.size, half = size / 2;
  const n = Math.ceil(size / NAV);
  const blocked = new Uint8Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = -half + (i + 0.5) * NAV, z = -half + (j + 0.5) * NAV;
    blocked[j * n + i] = col.blocked(x, z, 1.3) ? 1 : 0;
  }
  const dist = new Uint16Array(n * n), parent = new Int32Array(n * n), queue = new Int32Array(n * n);
  const cellOf = (x, z) => {
    const i = Math.min(n - 1, Math.max(0, Math.floor((x + half) / NAV)));
    const j = Math.min(n - 1, Math.max(0, Math.floor((z + half) / NAV)));
    return j * n + i;
  };
  const cx = (c) => -half + ((c % n) + 0.5) * NAV;
  const cz = (c) => -half + (Math.floor(c / n) + 0.5) * NAV;
  function nearestFree(c) {
    if (!blocked[c]) return c;
    const ci = c % n, cj = Math.floor(c / n);
    for (let r = 1; r < 8; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
      const i = ci + di, j = cj + dj;
      if (i < 0 || j < 0 || i >= n || j >= n) continue;
      if (!blocked[j * n + i]) return j * n + i;
    }
    return c;
  }
  const DI = [1, -1, 0, 0, 1, 1, -1, -1], DJ = [0, 0, 1, -1, 1, -1, 1, -1];
  function bfs(start) {
    dist.fill(UNREACHED);
    start = nearestFree(start);
    let h = 0, t = 0;
    dist[start] = 0; parent[start] = -1; queue[t++] = start;
    while (h < t) {
      const c = queue[h++], i = c % n, j = (c - i) / n, d = dist[c] + 1;
      for (let k = 0; k < 8; k++) {
        const ii = i + DI[k], jj = j + DJ[k];
        if (ii < 0 || jj < 0 || ii >= n || jj >= n) continue;
        const nc2 = jj * n + ii;
        if (blocked[nc2] || dist[nc2] !== UNREACHED) continue;
        if (k >= 4 && (blocked[j * n + ii] || blocked[jj * n + i])) continue;
        dist[nc2] = d; parent[nc2] = c; queue[t++] = nc2;
      }
    }
    return start;
  }
  return { n, blocked, dist, parent, cellOf, cx, cz, nearestFree, bfs };
}

export function createBots({ sim, indices, specs, seed = 1 }) {
  const state = sim.state, col = sim.collider;
  const nav = buildNav(sim);
  const half = sim.map.size / 2;
  const dn = Math.ceil(sim.map.size / DEN);
  const den = new Float32Array(dn * dn), denX = new Float32Array(dn * dn), denZ = new Float32Array(dn * dn);
  let denTick = -1;

  function density() {
    if (denTick === state.tick) return;
    denTick = state.tick;
    den.fill(0); denX.fill(0); denZ.fill(0);
    const N = state.neutrals;
    for (let i = 0; i < N.cap; i++) {
      if (N.state[i] !== 1) continue;
      const x = N.x[i], z = N.z[i];
      const ci = Math.min(dn - 1, Math.max(0, Math.floor((x + half) / DEN)));
      const cj = Math.min(dn - 1, Math.max(0, Math.floor((z + half) / DEN)));
      const c = cj * dn + ci;
      den[c]++; denX[c] += x; denZ[c] += z;
    }
  }

  const bots = indices.map((ci, k) => {
    const spec = specs[k] || { persona: 'collector', skill: 0.6 };
    const P = CONFIG.PERSONAS[spec.persona] || CONFIG.PERSONAS.collector;
    const skill = Math.max(0, Math.min(1, spec.skill ?? 0.6));
    return {
      ci, persona: spec.persona, P, skill,
      rng: createRng('bot:' + seed + ':' + ci),
      react: Math.round(16 - 11 * skill),
      turn: 0.1 + 0.22 * skill,
      next: k % 5,
      mode: 'idle', goal: null, path: [], pathAt: 0,
      dirX: 0, dirZ: 0, wantX: 0, wantZ: 0,
      checkX: 0, checkZ: 0, checkTick: 0, stuck: 0, unstickUntil: 0,
      wanderX: 0, wanderZ: 0, wanderUntil: 0,
      lastScore: 0, emergAt: -99,
    };
  });

  function decide(b) {
    const me = state.crowds[b.ci];
    density();
    const start = nav.bfs(nav.cellOf(me.x, me.z));
    const P = b.P, skill = b.skill, rng = b.rng;
    const late = state.timeLeft < 30;
    const aware = 0.65 + 0.45 * skill;
    const noise = () => 1 + (rng.next() - 0.5) * 0.8 * (1 - skill);
    const ignoreThreats = rng.chance((1 - skill) * 0.18);

    const threats = [];
    let pressure = 0;
    for (const o of state.crowds) {
      if (o === me || !o.alive) continue;
      const ratio = o.count / me.count;
      if (ratio < 1.1) continue;
      const d = Math.hypot(o.x - me.x, o.z - me.z);
      const gap = d - o.radius - me.radius;
      const range = (10 + o.radius * 0.9) * P.fear * aware;
      if (gap > range) continue;
      let p = (1 - Math.max(0, gap) / range) * Math.min(1, (ratio - 1) / 0.5);
      if (skill > 0.45) {
        const vx = o.vx, vz = o.vz, vl = Math.hypot(vx, vz);
        if (vl > 1 && d > 0.1) {
          const toward = (vx * (me.x - o.x) + vz * (me.z - o.z)) / (vl * d);
          if (toward > 0.6) p *= 1.4;
        }
      }
      if (o.protect > 0) p *= 0.5;
      threats.push({ o, gap, p });
      pressure += p;
    }

    const threatPenalty = (x, z) => {
      let f = 1;
      for (const t of threats) {
        const d = Math.hypot(x - t.o.x, z - t.o.z) - t.o.radius;
        if (d < 14) f *= 0.08; else if (d < 28) f *= 0.5;
      }
      return f;
    };
    const pathDist = (x, z) => {
      const c = nav.nearestFree(nav.cellOf(x, z));
      const d = nav.dist[c];
      return d === UNREACHED ? -1 : d * NAV;
    };
    const speed = sim.speedOf(me);

    if (!ignoreThreats && pressure > 0.32 * P.courage) {
      let best = -1, bestS = -Infinity;
      for (let c = 0; c < nav.dist.length; c += 1) {
        const d = nav.dist[c];
        if (d === UNREACHED || d < 5 || d > 14) continue;
        if ((c + state.tick) % 2) continue;
        const x = nav.cx(c), z = nav.cz(c);
        let s = 0, minD = 1e9;
        for (const t of threats) {
          const dd = Math.hypot(x - t.o.x, z - t.o.z) - t.o.radius;
          s += Math.min(dd, 60) * t.p;
          minD = Math.min(minD, dd);
          const ax = x - me.x, az = z - me.z, al = Math.hypot(ax, az) || 1;
          const bx = t.o.x - me.x, bz = t.o.z - me.z, bl = Math.hypot(bx, bz) || 1;
          if ((ax * bx + az * bz) / (al * bl) > 0.3) s -= 40 * t.p;
        }
        if (Math.abs(x) > half - 14 || Math.abs(z) > half - 14) s -= 15;
        const di = Math.floor((x + half) / DEN) + Math.floor((z + half) / DEN) * dn;
        s += Math.min(den[di], 20) * 0.3 + rng.next() * 2;
        if (s > bestS) { bestS = s; best = c; }
      }
      if (best >= 0) { setGoal(b, 'flee', nav.cx(best), nav.cz(best), null, best, start); return; }
    }

    let goal = null, gs = 0;
    const consider = (kind, x, z, s, target) => { if (s > gs) { gs = s; goal = { kind, x, z, target }; } };

    const chase = P.chase * (late ? 1.3 : 1);
    for (const o of state.crowds) {
      if (o === me || !o.alive || o.protect > 0) continue;
      const ratio = o.count / me.count;
      if (ratio > 0.86) continue;
      const pd = pathDist(o.x, o.z);
      if (pd < 0) continue;
      const gap = Math.max(0, pd - o.radius - me.radius);
      if (gap > chase) continue;
      const catchP = (1 - gap / chase) * Math.min(1, 1.3 * speed / Math.max(1, sim.speedOf(o)) - 0.2);
      if (catchP <= 0) continue;
      let s = P.hunt * o.count * catchP * Math.min(1, (1 - ratio) * 2.5) / (gap / speed + 2);
      if (o.index === state.leader) s *= 1.4;
      if (late) s *= 1.4;
      if (b.goal && b.goal.target === o.index) s *= 1.35;
      consider('prey', o.x, o.z, s * threatPenalty(o.x, o.z) * noise(), o.index);
    }

    for (const p of state.pickups) {
      if (!p.active) continue;
      const pd = pathDist(p.x, p.z);
      if (pd < 0 || pd > 90) continue;
      let s = P.pickup * (8 + me.count * 0.08) / (pd / speed + 2);
      if (b.goal && b.goal.kind === 'pickup' && Math.hypot(b.goal.x - p.x, b.goal.z - p.z) < 1) s *= 1.3;
      consider('pickup', p.x, p.z, s * threatPenalty(p.x, p.z) * noise());
    }

    for (let c = 0; c < den.length; c++) {
      if (den[c] < 2) continue;
      const x = denX[c] / den[c], z = denZ[c] / den[c];
      const pd = pathDist(x, z);
      if (pd < 0) continue;
      let s = P.greed * den[c] / (pd / speed + 2.5);
      if (b.goal && b.goal.kind === 'people' && Math.hypot(b.goal.x - x, b.goal.z - z) < 12) s *= 1.3;
      consider('people', x, z, s * threatPenalty(x, z) * noise());
    }

    if (P.wander > 0) {
      if (state.time > b.wanderUntil || Math.hypot(b.wanderX - me.x, b.wanderZ - me.z) < 6) {
        for (let t = 0; t < 10; t++) {
          const x = rng.range(-half + 10, half - 10), z = rng.range(-half + 10, half - 10);
          if (pathDist(x, z) > 0) { b.wanderX = x; b.wanderZ = z; break; }
        }
        b.wanderUntil = state.time + rng.range(6, 14);
      }
      consider('wander', b.wanderX, b.wanderZ, (P.wander * gs * 0.9 + 0.5) * (b.goal && b.goal.kind === 'wander' ? 1.35 : 1), null);
    }

    if (!goal) {
      const x = rng.range(-half + 10, half - 10), z = rng.range(-half + 10, half - 10);
      goal = { kind: 'roam', x, z, target: null };
    }
    setGoal(b, goal.kind, goal.x, goal.z, goal.target, nav.nearestFree(nav.cellOf(goal.x, goal.z)), start);
    b.lastScore = gs;
  }

  function setGoal(b, mode, x, z, target, cell, start) {
    b.mode = mode;
    b.goal = { kind: mode, x, z, target };
    const path = b.path;
    path.length = 0;
    if (nav.dist[cell] !== UNREACHED) {
      let c = cell, guard = 0;
      while (c !== start && c >= 0 && guard++ < 4000) { path.push(c); c = nav.parent[c]; }
      path.reverse();
    }
    b.pathAt = 0;
  }

  function steer(b) {
    const me = state.crowds[b.ci];
    let gx = b.goal.x, gz = b.goal.z;
    if (b.goal.target != null) {
      const o = state.crowds[b.goal.target];
      if (o && o.alive) {
        const lead = b.skill > 0.5 ? Math.min(1.2, Math.hypot(o.x - me.x, o.z - me.z) / 12) * b.skill : 0;
        gx = o.x + o.vx * lead; gz = o.z + o.vz * lead;
        b.goal.x = o.x; b.goal.z = o.z;
      }
    }
    let ax = gx, az = gz;
    if (!col.segmentClear(me.x, me.z, gx, gz, 1.0, 2)) {
      const path = b.path;
      while (b.pathAt < path.length - 1 && Math.hypot(nav.cx(path[b.pathAt]) - me.x, nav.cz(path[b.pathAt]) - me.z) < NAV * 1.2) b.pathAt++;
      let pick = Math.min(b.pathAt, path.length - 1);
      for (let k = Math.min(path.length - 1, b.pathAt + 8); k > b.pathAt; k--) {
        if (col.segmentClear(me.x, me.z, nav.cx(path[k]), nav.cz(path[k]), 1.0, 2)) { pick = k; break; }
      }
      if (pick >= 0 && path.length) { ax = nav.cx(path[pick]); az = nav.cz(path[pick]); }
    }
    let dx = ax - me.x, dz = az - me.z;
    const l = Math.hypot(dx, dz);
    if (l < 0.5) { dx = b.dirX; dz = b.dirZ; } else { dx /= l; dz /= l; }
    b.wantX = dx; b.wantZ = dz;
  }

  function turnToward(b) {
    if (b.dirX === 0 && b.dirZ === 0) { b.dirX = b.wantX; b.dirZ = b.wantZ; return; }
    const a0 = Math.atan2(b.dirX, b.dirZ), a1 = Math.atan2(b.wantX, b.wantZ);
    let d = a1 - a0;
    d -= Math.round(d / (Math.PI * 2)) * Math.PI * 2;
    const t = b.mode === 'flee' ? b.turn * 1.6 : b.turn;
    const a = a0 + Math.max(-t, Math.min(t, d));
    b.dirX = Math.sin(a); b.dirZ = Math.cos(a);
  }

  function emergency(b, me) {
    if (b.mode === 'flee' || b.skill < 0.3 || state.tick - b.emergAt < 12) return false;
    b.emergAt = state.tick;
    for (const o of state.crowds) {
      if (o === me || !o.alive || o.count < me.count * 1.15) continue;
      if (Math.hypot(o.x - me.x, o.z - me.z) - o.radius - me.radius < 3 + 4 * b.skill) return true;
    }
    return false;
  }

  function update() {
    const playing = state.phase === 'play';
    for (const b of bots) {
      const me = state.crowds[b.ci];
      if (!me.alive || !playing) { sim.setInput(b.ci, 0, 0); b.goal = null; b.dirX = b.dirZ = 0; continue; }
      if (state.tick - b.checkTick >= 30) {
        const moved = Math.hypot(me.x - b.checkX, me.z - b.checkZ);
        b.stuck = moved < 1.5 && b.goal ? b.stuck + 1 : 0;
        b.checkX = me.x; b.checkZ = me.z; b.checkTick = state.tick;
        if (b.stuck >= 2) {
          b.stuck = 0;
          const start = nav.bfs(nav.cellOf(me.x, me.z));
          for (let t = 0; t < 30; t++) {
            const c = b.rng.int(nav.dist.length);
            if (nav.dist[c] !== UNREACHED && nav.dist[c] > 3 && nav.dist[c] < 10) { setGoal(b, 'unstick', nav.cx(c), nav.cz(c), null, c, start); break; }
          }
          b.unstickUntil = state.tick + 45;
          b.next = state.tick + 45;
        }
      }
      if (!b.goal || (state.tick >= b.next && state.tick >= b.unstickUntil) || (state.tick >= b.unstickUntil && emergency(b, me))) {
        decide(b);
        b.next = state.tick + b.react + b.rng.int(4);
      }
      steer(b);
      turnToward(b);
      sim.setInput(b.ci, b.dirX, b.dirZ);
    }
  }

  return { update, bots, nav };
}
