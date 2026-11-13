import { createRng } from './rng.js';
import { createCollider } from './collide.js';
import { CONFIG } from '../config.js';

export const SIM_DT = 1 / 30;

export function leaderSpeed(c, C) {
  const f = Math.min(1, Math.log(Math.max(1, c.count)) / Math.log(C.speedRef));
  return C.speedBase * (1 - C.speedFall * f) * (c.fx.speed > 0 ? C.fx.speed.mult : 1)
    * (c.eating > 0 ? C.eatDrag : 1) * (c.panic > 0 ? C.panicBoost : 1);
}

// One fixed step of a leader toward target velocity (tx, tz). Shared with the online guest's prediction.
export function integrateLeader(c, tx, tz, C, col, tmp) {
  const dt = SIM_DT;
  const dot = c.vx * tx + c.vz * tz;
  const a = Math.min(1, C.accel * (dot < 0 ? C.turnBoost : 1) * dt);
  c.vx += (tx - c.vx) * a; c.vz += (tz - c.vz) * a;
  tmp.x = c.x + c.vx * dt; tmp.z = c.z + c.vz * dt;
  col.pushOut(tmp, C.leaderRadius);
  const mx = tmp.x - c.x, mz = tmp.z - c.z;
  c.vx = mx / dt; c.vz = mz / dt;
  c.x = tmp.x; c.z = tmp.z;
  const m = Math.sqrt(mx * mx + mz * mz);
  if (m > 0.004) c.heading = Math.atan2(c.vx, c.vz);
  return m;
}

const CROWD_KEYS = ['alive', 'x', 'z', 'px', 'pz', 'vx', 'vz', 'heading', 'count', 'radius', 'kills', 'best', 'rank',
  'protect', 'respawnIn', 'eating', 'panic', 'recruited', 'stolen', 'lost', 'deaths', 'travelled', 'ix', 'iz', 'remote', 'name', 'id', 'isBot'];
const STATE_KEYS = ['tick', 'time', 'timeLeft', 'countdownLeft', 'phase', 'duration', 'leader', 'leadChanges'];

// heading convention: Math.atan2(vx, vz) — 0 faces +Z, matches three's rotation.y for a +Z-forward model.
// restore: a sim.serialize() result (exact continuation) or a contract-shaped state (online host migration:
// wander targets, steal progress and the RNG are regenerated).
export function createSim({ seed = 1, map, players, duration = CONFIG.MATCH.duration, countdown = CONFIG.MATCH.countdown, config, restore = null }) {
  const C = { ...CONFIG.SIM, ...(config || {}) };
  const rng = createRng('sim:' + seed);
  const col = createCollider(map);
  const half = map.size / 2;
  const dt = SIM_DT;
  const plazas = map.plazas && map.plazas.length ? map.plazas : [{ x: 0, z: 0, r: 20 }];
  const spawns = map.spawns && map.spawns.length ? map.spawns : [{ x: 0, z: 0 }];

  const events = [];
  const emit = (e) => { e.tick = state.tick; events.push(e); };

  const radiusOf = (n) => Math.max(C.radiusMin, C.radiusK * Math.sqrt(n));
  const speedOf = (c) => leaderSpeed(c, C);
  let topCount = 1;
  const reachOf = (c) => {
    let r = c.radius + C.reachPad + c.radius * C.reachGrow;
    if (c.count < topCount * C.underdogBelow) r += C.underdogReach;
    if (c.fx.magnet > 0) r = r * C.fx.magnet.mult + C.fx.magnet.pad;
    return r;
  };

  const nc = players.length;
  const crowds = players.map((p, i) => ({
    index: i, id: p.id ?? i, name: p.name, color: p.color, isBot: !!p.isBot,
    alive: true, x: 0, z: 0, px: 0, pz: 0, vx: 0, vz: 0, heading: 0,
    count: C.startCount, radius: radiusOf(C.startCount),
    kills: 0, best: C.startCount,
    fx: { speed: 0, magnet: 0, double: 0 },
    rank: i + 1,
    protect: 0, respawnIn: 0, eating: 0, panic: 0,
    recruited: 0, stolen: 0, lost: 0, deaths: 0, travelled: 0,
    ix: 0, iz: 0, remote: !!p.remote,
  }));

  // Initial spawns: spread crowds over the spawn list, deterministic shuffle.
  const order = spawns.map((s, i) => i);
  for (let i = order.length - 1; i > 0; i--) { const j = rng.int(i + 1); [order[i], order[j]] = [order[j], order[i]]; }
  const used = [];
  for (const c of crowds) {
    let best = -1, bestScore = -Infinity;
    for (const si of order) {
      const s = spawns[si];
      let m = 1e9;
      for (const u of used) m = Math.min(m, Math.hypot(s.x - u.x, s.z - u.z));
      if (m > bestScore) { bestScore = m; best = si; }
    }
    const s = spawns[best];
    used.push(s);
    c.x = c.px = s.x; c.z = c.pz = s.z;
    c.heading = Math.atan2(-s.x, -s.z);
  }

  const cap = C.neutralCap;
  const neutrals = {
    cap,
    x: new Float32Array(cap), z: new Float32Array(cap),
    px: new Float32Array(cap), pz: new Float32Array(cap),
    heading: new Float32Array(cap),
    state: new Uint8Array(cap),
    target: new Int8Array(cap).fill(-1),
    look: new Uint8Array(cap),
    active: 0,
  };
  const nTx = new Float32Array(cap), nTz = new Float32Array(cap), nTimer = new Float32Array(cap), nSpeed = new Float32Array(cap);

  const pickups = [];
  const state = {
    tick: 0, time: 0, timeLeft: duration, countdownLeft: countdown,
    phase: countdown > 0 ? 'countdown' : 'play',
    duration,
    crowds, neutrals, pickups,
    leader: 0,
    leadChanges: 0,
  };

  function pickWanderTarget(i) {
    const x = neutrals.x[i], z = neutrals.z[i];
    for (let t = 0; t < 4; t++) {
      let tx, tz;
      if (rng.chance(C.plazaBias)) {
        let bp = null, bd = 1e9;
        for (const p of plazas) {
          const d = Math.hypot(p.x - x, p.z - z) - p.r;
          if (d < bd) { bd = d; bp = p; }
        }
        if (bd < 55) {
          const a = rng.next() * Math.PI * 2, r = Math.sqrt(rng.next()) * bp.r * 0.92;
          tx = bp.x + Math.cos(a) * r; tz = bp.z + Math.sin(a) * r;
        }
      }
      if (tx === undefined) {
        const a = rng.next() * Math.PI * 2, r = rng.range(6, 24);
        tx = x + Math.cos(a) * r; tz = z + Math.sin(a) * r;
      }
      if (!col.blocked(tx, tz, 0.6)) { nTx[i] = tx; nTz[i] = tz; nTimer[i] = rng.range(5, 14); return; }
    }
    nTx[i] = x; nTz[i] = z; nTimer[i] = rng.range(0.5, 2);
  }

  function spawnNeutral(i, clear) {
    for (let t = 0; t < 10; t++) {
      let x, z;
      if (rng.chance(0.5)) {
        const p = plazas[rng.int(plazas.length)];
        const a = rng.next() * Math.PI * 2, r = Math.sqrt(rng.next()) * p.r;
        x = p.x + Math.cos(a) * r; z = p.z + Math.sin(a) * r;
      } else {
        x = rng.range(-half + 3, half - 3); z = rng.range(-half + 3, half - 3);
      }
      if (col.blocked(x, z, 0.6)) continue;
      let ok = true;
      for (const c of crowds) {
        if (!c.alive) continue;
        const dx = x - c.x, dz = z - c.z, r = c.radius + clear;
        if (dx * dx + dz * dz < r * r) { ok = false; break; }
      }
      if (!ok) continue;
      neutrals.x[i] = neutrals.px[i] = x; neutrals.z[i] = neutrals.pz[i] = z;
      neutrals.heading[i] = rng.next() * Math.PI * 2;
      neutrals.state[i] = 1; neutrals.target[i] = -1;
      neutrals.look[i] = rng.int(256);
      nSpeed[i] = rng.range(C.neutralSpeedMin, C.neutralSpeedMax);
      neutrals.active++;
      pickWanderTarget(i);
      return true;
    }
    return false;
  }

  for (let i = 0; i < C.neutralStart; i++) spawnNeutral(i, 5);

  function placePickup(p) {
    for (let t = 0; t < 20; t++) {
      let x, z;
      if (rng.chance(0.45)) {
        const pl = plazas[rng.int(plazas.length)];
        const a = rng.next() * Math.PI * 2, r = (0.4 + 0.5 * rng.next()) * pl.r;
        x = pl.x + Math.cos(a) * r; z = pl.z + Math.sin(a) * r;
      } else {
        x = rng.range(-half + 8, half - 8); z = rng.range(-half + 8, half - 8);
      }
      if (col.blocked(x, z, 2.5)) continue;
      if (pickups.some((q) => q !== p && q.active && Math.hypot(q.x - x, q.z - z) < 40)) continue;
      if (crowds.some((c) => c.alive && Math.hypot(c.x - x, c.z - z) < c.radius + 10)) continue;
      p.x = x; p.z = z; p.active = true; p.kind = C.pickupKinds[rng.int(C.pickupKinds.length)];
      p.respawnIn = 0;
      return;
    }
    p.respawnIn = 1;
  }
  let pickupId = 0;
  for (let i = 0; i < C.pickupCount; i++) {
    const p = { id: pickupId++, kind: 'speed', x: 0, z: 0, active: false, respawnIn: 0 };
    pickups.push(p);
    placePickup(p);
  }

  const stealAcc = new Float64Array(nc * nc);
  let neutralRespawnAcc = 0;

  function setInput(i, ax, az) {
    const c = crowds[i];
    if (!c) return;
    if (!Number.isFinite(ax) || !Number.isFinite(az)) { ax = 0; az = 0; }
    const l = Math.sqrt(ax * ax + az * az);
    if (l > 1) { ax /= l; az /= l; }
    c.ix = ax; c.iz = az;
  }

  function respawnCrowd(c) {
    let best = spawns[0], bestScore = -Infinity;
    for (const s of spawns) {
      let m = 1e9;
      for (const o of crowds) {
        if (!o.alive || o === c) continue;
        m = Math.min(m, Math.hypot(s.x - o.x, s.z - o.z) - o.radius * 2.2);
      }
      const score = m + rng.next() * 6;
      if (score > bestScore) { bestScore = score; best = s; }
    }
    c.alive = true;
    c.x = c.px = best.x; c.z = c.pz = best.z; c.vx = c.vz = 0;
    let sum = 0, n = 0;
    for (const o of crowds) if (o.alive && o !== c) { sum += o.count; n++; }
    c.count = Math.max(C.respawnCount, Math.round(C.respawnShare * (n ? sum / n : 0)));
    c.radius = radiusOf(c.count);
    c.protect = C.protect;
    c.fx.speed = c.fx.magnet = c.fx.double = 0;
    emit({ type: 'respawn', crowd: c.index, x: c.x, z: c.z, count: c.count });
  }

  const tmp = { x: 0, z: 0 };

  function stepCrowds(playing) {
    for (const c of crowds) {
      c.px = c.x; c.pz = c.z;
      if (!c.alive) {
        if (playing) {
          c.respawnIn -= dt;
          if (c.respawnIn <= 0) respawnCrowd(c);
        }
        continue;
      }
      if (c.protect > 0) c.protect = Math.max(0, c.protect - dt);
      if (c.eating > 0) c.eating -= dt;
      if (c.panic > 0) c.panic -= dt;
      for (const k in c.fx) if (c.fx[k] > 0) c.fx[k] = Math.max(0, c.fx[k] - dt);
      const sp = speedOf(c);
      c.travelled += integrateLeader(c, playing ? c.ix * sp : 0, playing ? c.iz * sp : 0, C, col, tmp);
    }
  }

  function stepNeutrals(playing) {
    const N = neutrals;
    for (let i = 0; i < cap; i++) {
      const st = N.state[i];
      if (st === 0) continue;
      let x = N.x[i], z = N.z[i];
      N.px[i] = x; N.pz[i] = z;
      if (st === 2) {
        const c = crowds[N.target[i]];
        if (!c || !c.alive || !playing) { N.state[i] = 1; N.target[i] = -1; pickWanderTarget(i); continue; }
        const dx = c.x - x, dz = c.z - z, d = Math.sqrt(dx * dx + dz * dz);
        if (d < Math.max(c.radius * 0.85, 1.4)) {
          const n = c.fx.double > 0 ? 2 : 1;
          c.count += n; c.recruited += n;
          N.state[i] = 0; N.target[i] = -1; N.active--;
          emit({ type: 'recruit', crowd: c.index, slot: i, x, z, n });
          continue;
        }
        if (d > reachOf(c) + 8) { N.state[i] = 1; N.target[i] = -1; pickWanderTarget(i); continue; }
        const v = C.pullSpeed + Math.sqrt(c.vx * c.vx + c.vz * c.vz);
        const s = Math.min(d, v * dt) / d;
        N.x[i] = x + dx * s; N.z[i] = z + dz * s;
        N.heading[i] = Math.atan2(dx, dz);
        continue;
      }
      if (playing) {
        let best = -1, bestEdge = 1e9;
        for (let k = 0; k < nc; k++) {
          const c = crowds[k];
          if (!c.alive) continue;
          const dx = c.x - x, dz = c.z - z, d2 = dx * dx + dz * dz, r = reachOf(c);
          if (d2 < r * r) {
            const edge = Math.sqrt(d2) - c.radius;
            if (edge < bestEdge) { bestEdge = edge; best = k; }
          }
        }
        if (best >= 0) { N.state[i] = 2; N.target[i] = best; continue; }
      }
      nTimer[i] -= dt;
      const dx = nTx[i] - x, dz = nTz[i] - z, d = Math.sqrt(dx * dx + dz * dz);
      if (d < 1 || nTimer[i] <= 0) { pickWanderTarget(i); continue; }
      const want = Math.atan2(dx, dz);
      let h = N.heading[i];
      let dh = want - h;
      dh -= Math.round(dh / (Math.PI * 2)) * Math.PI * 2;
      h += Math.max(-3 * dt, Math.min(3 * dt, dh));
      const sp = nSpeed[i] * (Math.abs(dh) > 1.2 ? 0.4 : 1);
      const nx = x + Math.sin(h) * sp * dt, nz = z + Math.cos(h) * sp * dt;
      N.heading[i] = h;
      if (col.blocked(nx, nz, 0.35)) { pickWanderTarget(i); continue; }
      N.x[i] = nx; N.z[i] = nz;
    }
    if (N.active < cap) {
      neutralRespawnAcc += C.neutralRespawn * dt;
      while (neutralRespawnAcc >= 1) {
        neutralRespawnAcc -= 1;
        let slot = -1;
        for (let i = 0; i < cap; i++) if (N.state[i] === 0) { slot = i; break; }
        if (slot < 0) break;
        spawnNeutral(slot, C.neutralSpawnClear);
      }
    } else neutralRespawnAcc = 0;
  }

  function eliminate(victim, by) {
    victim.alive = false;
    victim.count = 0;
    victim.respawnIn = C.respawnDelay;
    victim.deaths++;
    victim.vx = victim.vz = 0;
    by.kills++;
    for (let k = 0; k < nc; k++) { stealAcc[k * nc + victim.index] = 0; stealAcc[victim.index * nc + k] = 0; }
    emit({ type: 'elim', victim: victim.index, by: by.index, x: victim.x, z: victim.z });
  }

  function stepSteals() {
    for (let i = 0; i < nc; i++) {
      const a = crowds[i];
      for (let j = i + 1; j < nc; j++) {
        const b = crowds[j];
        const key = i * nc + j, keyR = j * nc + i;
        if (!a.alive || !b.alive || a.protect > 0 || b.protect > 0 || a.count === b.count) { stealAcc[key] = stealAcc[keyR] = 0; continue; }
        const dx = b.x - a.x, dz = b.z - a.z, d = Math.sqrt(dx * dx + dz * dz);
        const big = a.count > b.count ? a : b, small = big === a ? b : a;
        const depth = big.radius + small.radius - d;
        const k = big === a ? key : keyR;
        if (depth <= 0) { stealAcc[key] = stealAcc[keyR] = 0; continue; }
        const ratio = big.count / small.count;
        if (ratio < 1 + C.stealDeadzone) { stealAcc[k] = 0; continue; }
        const overlap = Math.min(1, depth / (2 * small.radius));
        const rf = Math.min(1, (ratio - 1 - C.stealDeadzone) / C.stealRatioFull);
        const boost = 1 + Math.min(ratio - 1, C.stealBoostCap) * C.stealBoost;
        const rate = (C.stealBase + C.stealPer * small.count) * Math.pow(overlap, C.stealOverlapPow) * rf * boost;
        stealAcc[k] += rate * dt;
        big.eating = small.panic = C.eatHold;
        let n = Math.floor(stealAcc[k]);
        if (n <= 0) continue;
        n = Math.min(n, small.count);
        stealAcc[k] -= n;
        small.count -= n; big.count += n;
        small.lost += n; big.stolen += n;
        const inv = d > 1e-6 ? 1 / d : 0;
        const sx = small === a ? 1 : -1;
        emit({ type: 'steal', from: small.index, to: big.index, n,
          x: small.x + dx * inv * sx * small.radius * 0.6, z: small.z + dz * inv * sx * small.radius * 0.6 });
        if (small.count <= 0) eliminate(small, big);
      }
    }
  }

  function stepPickups() {
    for (const p of pickups) {
      if (!p.active) {
        p.respawnIn -= dt;
        if (p.respawnIn <= 0) placePickup(p);
        continue;
      }
      for (const c of crowds) {
        if (!c.alive) continue;
        const r = Math.max(C.pickupRadius, c.radius * 0.45);
        if ((c.x - p.x) ** 2 + (c.z - p.z) ** 2 < r * r) {
          c.fx[p.kind] = C.fx[p.kind].dur;
          p.active = false; p.respawnIn = C.pickupRespawn;
          emit({ type: 'pickup', crowd: c.index, id: p.id, kind: p.kind, x: p.x, z: p.z });
          break;
        }
      }
    }
  }

  const rankOrder = crowds.map((c, i) => i);
  function stepRanks(playing) {
    // Stable: ties keep their previous order, so the lead only changes on a strict overtake.
    rankOrder.sort((a, b) => (crowds[b].count - crowds[a].count) || (crowds[a].rank - crowds[b].rank));
    rankOrder.forEach((ci, r) => { crowds[ci].rank = r + 1; });
    const top = rankOrder[0];
    topCount = Math.max(1, crowds[top].count);
    if (top !== state.leader) {
      state.leader = top;
      if (playing) { state.leadChanges++; emit({ type: 'lead', crowd: top }); }
    }
  }

  function step() {
    state.tick++;
    state.time += dt;
    if (state.phase === 'countdown') {
      state.countdownLeft -= dt;
      if (state.countdownLeft <= 1e-9) {
        state.countdownLeft = 0;
        state.phase = 'play';
        emit({ type: 'phase', phase: 'play' });
      }
    } else if (state.phase === 'play') {
      state.timeLeft -= dt;
      if (state.timeLeft <= 1e-9) {
        state.timeLeft = 0;
        state.phase = 'over';
        emit({ type: 'phase', phase: 'over' });
      }
    }
    const playing = state.phase === 'play';
    stepCrowds(playing);
    stepNeutrals(playing);
    if (playing) { stepSteals(); stepPickups(); }
    for (const c of crowds) {
      if (!c.alive) continue;
      c.radius = radiusOf(c.count);
      if (c.count > c.best) c.best = c.count;
    }
    stepRanks(playing);
  }

  // Online: a remote crowd is steered by a network player, so bots leave it alone.
  function setRemote(i, on, name) {
    const c = crowds[i];
    if (!c) return;
    c.remote = !!on;
    c.isBot = !on;
    if (name) c.name = name;
  }

  function serialize() {
    const N = neutrals, A = (a) => Array.from(a);
    return {
      v: 1, seed, rng: rng.getState(), pickupId, neutralRespawnAcc, topCount,
      state: Object.fromEntries(STATE_KEYS.map((k) => [k, state[k]])),
      crowds: crowds.map((c) => ({ ...Object.fromEntries(CROWD_KEYS.map((k) => [k, c[k]])), fx: { ...c.fx } })),
      neutrals: { x: A(N.x), z: A(N.z), heading: A(N.heading), state: A(N.state), target: A(N.target), look: A(N.look),
        tx: A(nTx), tz: A(nTz), timer: A(nTimer), speed: A(nSpeed) },
      pickups: pickups.map((p) => ({ ...p })),
      stealAcc: A(stealAcc),
    };
  }

  function applyRestore(R) {
    const S = R.state || R;
    for (const k of STATE_KEYS) if (S[k] !== undefined) state[k] = S[k];
    if (!R.rng) rng.setState(createRng('sim:' + seed + ':restore:' + state.tick).getState());
    else rng.setState(R.rng);
    (R.crowds || []).forEach((src, i) => {
      const c = crowds[i];
      if (!c || !src) return;
      for (const k of CROWD_KEYS) if (src[k] !== undefined) c[k] = src[k];
      if (src.fx) Object.assign(c.fx, src.fx);
      if (src.px === undefined) { c.px = c.x; c.pz = c.z; }
    });
    const N = neutrals, RN = R.neutrals;
    if (RN) {
      N.active = 0;
      for (let i = 0; i < cap; i++) {
        N.state[i] = RN.state[i] || 0;
        N.x[i] = N.px[i] = RN.x[i] || 0; N.z[i] = N.pz[i] = RN.z[i] || 0;
        N.heading[i] = RN.heading ? RN.heading[i] : 0;
        N.target[i] = RN.target ? RN.target[i] : -1;
        N.look[i] = RN.look ? RN.look[i] : rng.int(256);
        if (N.state[i] === 2 && !(N.target[i] >= 0 && N.target[i] < nc)) { N.state[i] = 1; N.target[i] = -1; }
        if (!N.state[i]) continue;
        N.active++;
        if (RN.tx) { nTx[i] = RN.tx[i]; nTz[i] = RN.tz[i]; nTimer[i] = RN.timer[i]; nSpeed[i] = RN.speed[i]; }
        else { nSpeed[i] = rng.range(C.neutralSpeedMin, C.neutralSpeedMax); pickWanderTarget(i); }
      }
    }
    if (R.pickups) {
      R.pickups.forEach((src, i) => {
        if (!pickups[i]) pickups[i] = { id: src.id, kind: 'speed', x: 0, z: 0, active: false, respawnIn: 0 };
        Object.assign(pickups[i], src);
      });
      pickups.length = R.pickups.length;
    }
    pickupId = R.pickupId ?? pickups.reduce((m, p) => Math.max(m, p.id + 1), 0);
    neutralRespawnAcc = R.neutralRespawnAcc ?? 0;
    if (R.stealAcc) stealAcc.set(R.stealAcc); else stealAcc.fill(0);
    let top = 1;
    for (const c of crowds) top = Math.max(top, c.count);
    topCount = R.topCount ?? top;
    events.length = 0;
  }
  if (restore) applyRestore(restore);

  const out = [];
  function drainEvents() {
    out.length = 0;
    for (const e of events) out.push(e);
    events.length = 0;
    return out;
  }

  return {
    state, step, setInput, drainEvents, setRemote, serialize,
    collider: col, map, config: C,
    radiusOf, speedOf, reachOf,
  };
}

export function stateHash(state) {
  let h = 2166136261 >>> 0;
  const mix = (v) => { h ^= v >>> 0; h = Math.imul(h, 16777619) >>> 0; };
  const f = new Float32Array(1), u = new Uint32Array(f.buffer);
  const mixF = (v) => { f[0] = v; mix(u[0]); };
  mix(state.tick);
  for (const c of state.crowds) { mix(c.count); mix(c.kills); mixF(c.x); mixF(c.z); mix(c.alive ? 1 : 0); }
  const N = state.neutrals;
  for (let i = 0; i < N.cap; i++) { mix(N.state[i]); mixF(N.x[i]); mixF(N.z[i]); }
  for (const p of state.pickups) { mix(p.active ? 1 : 0); mixF(p.x); mixF(p.z); }
  return h.toString(16).padStart(8, '0');
}
