// Guest role: rebuild a contract-shaped state from the host's snapshots for the renderer and HUD.
// Other crowds and pedestrians are shown ~DELAY in the past (interpolated); your own leader is
// predicted locally from your input and gently corrected toward the host.
import { CONFIG } from '../config.js';
import { SIM_DT, leaderSpeed, integrateLeader } from '../sim/sim.js';
import { createCollider } from '../sim/collide.js';
import { decodeSnap, applyNeutrals, createNeutralModel, predictX, predictZ, encodeInput, quantAxis } from './proto.js';

export const DELAY_MS = 120;
const TICK_MS = SIM_DT * 1000;
const HIST = 256;

export function createGuest({ map, me, players, send, config = CONFIG.SIM, delayMs = DELAY_MS, mode = 'classic' }) {
  const C = config;
  const col = createCollider(map);
  const cap = C.neutralCap;
  const model = createNeutralModel(cap);
  const radiusOf = (n) => Math.max(C.radiusMin, C.radiusK * Math.sqrt(n));

  const N = {
    cap, x: new Float32Array(cap), z: new Float32Array(cap), heading: new Float32Array(cap),
    state: new Uint8Array(cap), target: new Int8Array(cap).fill(-1), look: new Uint8Array(cap), active: 0,
  };
  N.px = N.x; N.pz = N.z;
  const ox = new Float32Array(cap), oz = new Float32Array(cap);

  const crowds = players.map((p, i) => ({
    index: i, id: p.id ?? i, name: p.name, color: p.color, isBot: !p.human, remote: !!p.human,
    alive: true, x: 0, z: 0, px: 0, pz: 0, vx: 0, vz: 0, heading: 0, count: 1, radius: radiusOf(1), kills: 0, best: 1,
    fx: { speed: 0, magnet: 0, double: 0 }, rank: i + 1, protect: 0, respawnIn: 0, eating: 0, panic: 0,
    recruited: 0, stolen: 0, lost: 0, deaths: 0,
    team: mode === 'teams' ? (p.team ?? i % 2) : mode === 'infection' ? (p.horde ? 1 : 0) : i, score: 0, out: false, horde: mode === 'infection' && !!p.horde, outAt: 0, infections: 0,
  }));
  const view = {
    tick: 0, time: 0, timeLeft: 0, countdownLeft: 0, phase: 'countdown', duration: CONFIG.MATCH.duration,
    crowds, neutrals: N, pickups: [], leader: 0, leadChanges: 0, online: true, mode,
  };

  const queue = [];
  let latest = null, applied = null, epoch = -1, synced = false;
  let base = null, lastRecv = 0;
  const stats = { snaps: 0, keys: 0, bytes: 0, since: 0, latency: [], late: 0, corrections: 0, maxErr: 0 };

  // Own-leader prediction: a copy of the leader integrated every local tick from your input.
  const pred = { x: 0, z: 0, vx: 0, vz: 0, heading: 0, count: 1, fx: { speed: 0, magnet: 0, double: 0 }, eating: 0, panic: 0, alive: false, horde: false };
  const hx = new Float32Array(HIST), hz = new Float32Array(HIST);
  let lt = 0, acc = 0, predOk = false, offX = 0, offZ = 0, prevPX = 0, prevPZ = 0;
  let sentAx = 2, sentAz = 2, sentAt = 0;
  const sentTimes = new Map();
  const tmp = { x: 0, z: 0 };

  function onSnap(bytes, now) {
    const s = decodeSnap(bytes);
    if (!s) return;
    stats.bytes += s.bytes; stats.since = stats.since || now;
    if (s.full) stats.keys++; else stats.snaps++;
    if (s.epoch !== epoch) {
      if (!s.full) return;                         // a new host starts with a keyframe
      epoch = s.epoch; base = null;
      if (latest && s.tick < latest.tick) { queue.length = 0; latest = null; }
    } else {
      if (!synced && !s.full) return;
      if (latest && s.tick < latest.tick) return;
    }
    if (s.full) synced = true;
    const sample = now - s.tick * TICK_MS;
    if (base === null || sample < base || sample - base > 400) base = sample;
    else base += (sample - base) * 0.02;
    lastRecv = now;
    queue.push(s);
    while (queue.length > 90) applySnap(queue.shift(), []);   // a hidden tab stops drawing, not receiving
    latest = s;
    reconcile(s, now);
  }

  function renderTick(now) {
    if (base === null) return latest ? latest.tick : 0;
    let t = (now - base - delayMs) / TICK_MS;
    if (latest && t > latest.tick + 2) t = latest.tick + 2;
    return t;
  }

  function synthesize(s, out) {
    for (const e of s.events) {
      e.tick = s.tick;
      switch (e.type) {
        case 'recruit': e.x = N.x[e.slot] || 0; e.z = N.z[e.slot] || 0; break;
        case 'steal': {
          const a = crowds[e.from], b = crowds[e.to];
          if (!a || !b) continue;
          const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz) || 1;
          e.x = a.x + dx / d * a.radius * 0.6; e.z = a.z + dz / d * a.radius * 0.6;
          break;
        }
        case 'elim': { const v = crowds[e.victim]; e.x = v ? v.x : 0; e.z = v ? v.z : 0; break; }
        case 'pickup': { const p = view.pickups.find((q) => q.id === e.id); e.x = p ? p.x : 0; e.z = p ? p.z : 0; break; }
        case 'bleed': { const c = crowds[e.crowd]; e.x = c ? c.x : 0; e.z = c ? c.z : 0; break; }
        case 'zone': if (s.mode && s.mode.zone) { e.x = s.mode.zone.x; e.z = s.mode.zone.z; e.r = s.mode.zone.r; } break;
        case 'shrink': if (s.mode && s.mode.circle) e.r = s.mode.circle.nr; break;
      }
      out.push(e);
    }
  }

  function applySnap(s, out) {
    synthesize(s, out);
    const rt = s.tick;
    // Corrections move a pedestrian by at most a few decimetres: ease them in.
    const u = s.nupd;
    if (s.full) {
      applyNeutrals(model, s);
      for (let i = 0; i < cap; i++) { ox[i] = oz[i] = 0; N.state[i] = model.state[i]; if (model.state[i]) { N.x[i] = predictX(model, i, rt); N.z[i] = predictZ(model, i, rt); } }
    } else {
      for (let k = 0; k < u.n; k++) {
        const i = u.slots[k] & 0x3fff;
        if (i < cap && model.state[i] === 1 && (u.slots[k] >> 14) === 1) { ox[i] = N.x[i] - u.qx[k] / 100; oz[i] = N.z[i] - u.qz[k] / 100; }
        else if (i < cap) { ox[i] = oz[i] = 0; }
      }
      applyNeutrals(model, s);
      for (let k = 0; k < u.n; k++) {
        const i = u.slots[k] & 0x3fff;
        if (i >= cap) continue;
        const st = u.slots[k] >> 14;
        if (st && N.state[i] === 0) { N.x[i] = model.x[i]; N.z[i] = model.z[i]; }
        if (ox[i] * ox[i] + oz[i] * oz[i] > 9) { ox[i] = oz[i] = 0; }
      }
    }
    for (const sc of s.crowds) {
      const c = crowds[sc.index];
      if (!c) continue;
      const wasAlive = c.alive;
      c.alive = sc.alive; c.remote = sc.remote; c.isBot = !sc.remote;
      c.count = sc.count; c.best = sc.best; c.kills = sc.kills; c.deaths = sc.deaths;
      c.recruited = sc.recruited; c.stolen = sc.stolen; c.lost = sc.lost; c.rank = sc.rank;
      c.protect = sc.protect; c.respawnIn = sc.respawnIn; c.eating = sc.eating; c.panic = sc.panic;
      c.fx.speed = sc.fx.speed; c.fx.magnet = sc.fx.magnet; c.fx.double = sc.fx.double;
      c.radius = sc.alive ? radiusOf(sc.count) : c.radius;
      if (sc.alive && !wasAlive) { c.x = sc.x; c.z = sc.z; }
    }
    if (s.mode) applyMode(s.mode);
    view.pickups = s.pickups;
    view.leader = s.leader; view.leadChanges = s.leadChanges;
    view.phase = s.phase; view.duration = s.duration || view.duration;
    applied = s;
  }

  function applyMode(m) {
    m.crowds.forEach((mc, i) => {
      const c = crowds[i];
      if (!c) return;
      c.out = mc.out; c.horde = mc.horde; c.team = mc.team; c.score = mc.score;
      if (m.mode === 'lcs') c.outAt = mc.extra / 10; else c.infections = mc.extra;
    });
    if (m.zone) { view.zone = m.zone; view.zoneNext = m.zoneNext; view.zoneT = m.zoneT; }
    if (m.circle) view.circle = m.circle;
    if (m.teams) {
      if (!view.teams) view.teams = CONFIG.MODES.teams.sides.map((sd, t) => ({ team: t, name: sd.name, color: sd.colors[0], score: 0 }));
      m.teams.forEach((v, t) => { view.teams[t].score = v; });
    }
    view.endReason = m.endReason;
    pred.horde = !!(crowds[me] && crowds[me].horde);
  }

  // auto: autopilot (paused / tab was hidden). Nothing is sent, so the host's bot takes the crowd.
  function update(now, dt, ax, az, auto = false) {
    const out = [];
    if (!latest) return { state: view, events: out };
    if (auto) { predOk = false; acc = 0; } else stepLocal(dt, ax, az, now);
    const rt = renderTick(now);
    while (queue.length && queue[0].tick <= rt) applySnap(queue.shift(), out);
    if (!applied && queue.length) applySnap(queue.shift(), out);
    const next = queue[0] || null;
    const a = applied;
    const t = Math.max(a.tick, Math.min(rt, next ? next.tick : a.tick + 2));
    const k = next && next.tick > a.tick ? (t - a.tick) / (next.tick - a.tick) : 0;
    for (const sc of a.crowds) {
      const c = crowds[sc.index];
      if (!c || sc.index === me && predOk) continue;
      let x, z, vx = sc.vx, vz = sc.vz;
      const n = next && next.crowds[sc.index];
      if (n && n.alive === sc.alive && Math.hypot(n.x - sc.x, n.z - sc.z) < 12) {
        x = sc.x + (n.x - sc.x) * k; z = sc.z + (n.z - sc.z) * k;
        vx = sc.vx + (n.vx - sc.vx) * k; vz = sc.vz + (n.vz - sc.vz) * k;
      } else {
        const e = Math.min(t - a.tick, 3) * SIM_DT;
        x = sc.x + sc.vx * e; z = sc.z + sc.vz * e;
      }
      c.x = c.px = x; c.z = c.pz = z; c.vx = vx; c.vz = vz;
      if (vx * vx + vz * vz > 0.04) c.heading = Math.atan2(vx, vz); else c.heading = sc.heading;
    }
    if (predOk) {
      const c = crowds[me], f = Math.exp(-dt * 10);
      offX *= f; offZ *= f;
      const al = acc / SIM_DT;
      c.x = c.px = prevPX + (pred.x - prevPX) * al + offX;
      c.z = c.pz = prevPZ + (pred.z - prevPZ) * al + offZ;
      c.vx = pred.vx; c.vz = pred.vz; c.heading = pred.heading;
    }
    stepNeutrals(t, dt);
    view.tick = Math.floor(t);
    const lag = (t - a.tick) * SIM_DT;
    view.time = t * SIM_DT;
    if (a.phase === 'countdown') { view.countdownLeft = Math.max(0, a.countdownLeft - lag); view.timeLeft = a.timeLeft; }
    else if (a.phase === 'play') { view.countdownLeft = 0; view.timeLeft = Math.max(0, a.timeLeft - lag); }
    else { view.countdownLeft = 0; view.timeLeft = 0; }
    return { state: view, events: out };
  }

  function stepNeutrals(t, dt) {
    const f = Math.exp(-dt * 8);
    let active = 0;
    for (let i = 0; i < cap; i++) {
      const st = model.state[i];
      N.state[i] = st; N.target[i] = model.target[i]; N.look[i] = model.look[i];
      if (!st) continue;
      active++;
      if (st === 1) {
        ox[i] *= f; oz[i] *= f;
        const nx = predictX(model, i, t) + ox[i], nz = predictZ(model, i, t) + oz[i];
        const mvx = model.vx[i], mvz = model.vz[i];
        N.heading[i] = mvx * mvx + mvz * mvz > 0.01 ? Math.atan2(mvx, mvz) : model.heading[i];
        N.x[i] = nx; N.z[i] = nz;
      } else {
        const c = crowds[model.target[i]];
        if (!c || !c.alive) continue;
        const dx = c.x - N.x[i], dz = c.z - N.z[i], d = Math.hypot(dx, dz);
        if (d < Math.max(c.radius * 0.85, 1.4) || d < 1e-3) continue;
        const v = C.pullSpeed + Math.hypot(c.vx, c.vz);
        const s = Math.min(d, v * dt) / d;
        N.x[i] += dx * s; N.z[i] += dz * s;
        N.heading[i] = Math.atan2(dx, dz);
      }
    }
    N.active = active;
  }

  // ---------------------------------------------------------------- prediction

  function playing() { return latest && latest.phase === 'play'; }

  function integrate(ax, az) {
    if (!pred.alive) return;
    const sp = playing() ? leaderSpeed(pred, C) : 0;
    integrateLeader(pred, ax * sp, az * sp, C, col, tmp);
  }

  function stepLocal(dt, ax, az, now) {
    acc += Math.min(dt, 0.25);
    ax = quantAxis(ax); az = quantAxis(az);
    while (acc >= SIM_DT) {
      acc -= SIM_DT;
      lt++;
      hx[lt % HIST] = ax; hz[lt % HIST] = az;
      prevPX = pred.x; prevPZ = pred.z;
      // No snapshots for a while (host change, network stall): hold rather than run off on our own.
      if (now - lastRecv < 300) integrate(ax, az);
      const changed = ax !== sentAx || az !== sentAz;
      if ((changed && now - sentAt >= 45) || now - sentAt >= 250) {
        send(encodeInput(lt, ax, az));
        sentAx = ax; sentAz = az; sentAt = now;
        sentTimes.set(lt & 65535, now);
        if (sentTimes.size > 200) sentTimes.delete(sentTimes.keys().next().value);
      }
    }
  }

  function reconcile(s, now) {
    const sc = s.crowds[me];
    if (!sc) return;
    const t0 = sentTimes.get(sc.ackSeq);
    if (t0 !== undefined) { stats.latency.push(now - t0); sentTimes.delete(sc.ackSeq); if (stats.latency.length > 400) stats.latency.shift(); }
    pred.count = sc.count; pred.eating = sc.eating; pred.panic = sc.panic;
    pred.fx.speed = sc.fx.speed; pred.fx.magnet = sc.fx.magnet; pred.fx.double = sc.fx.double;
    const oldX = pred.x, oldZ = pred.z, had = predOk && pred.alive;
    pred.alive = sc.alive;
    pred.x = sc.x; pred.z = sc.z; pred.vx = sc.vx; pred.vz = sc.vz; pred.heading = sc.heading;
    if (!sc.alive) { predOk = false; return; }
    const ack = lt - ((lt - sc.ackSeq) & 65535);
    const from = ack + sc.applied;
    const n = lt - from + 1;
    if (sc.applied > 0 && n >= 0 && n < 90 && lt - ack < HIST - 2) {
      for (let j = from; j <= lt; j++) integrate(hx[j % HIST], hz[j % HIST]);
    }
    prevPX = pred.x; prevPZ = pred.z;
    if (had) {
      const ex = oldX - pred.x, ez = oldZ - pred.z, e = Math.hypot(ex, ez);
      if (e > 0.05) stats.corrections++;
      stats.maxErr = Math.max(stats.maxErr, e);
      if (e < 4) { offX += ex; offZ += ez; } else { offX = offZ = 0; }
    } else { offX = offZ = 0; }
    predOk = true;
  }

  // For host migration: everything received so far, applied, as a createSim restore object.
  function restoreState() {
    const out = [];
    while (queue.length) applySnap(queue.shift(), out);
    if (!applied) return null;
    const s = applied;
    const nx = new Float32Array(cap), nz = new Float32Array(cap);
    for (let i = 0; i < cap; i++) {
      if (model.state[i] === 1) { nx[i] = predictX(model, i, s.tick); nz[i] = predictZ(model, i, s.tick); }
      else { nx[i] = N.x[i]; nz[i] = N.z[i]; }
    }
    return {
      tick: s.tick, time: s.tick * SIM_DT, timeLeft: s.timeLeft, countdownLeft: s.countdownLeft, phase: s.phase,
      duration: s.duration || view.duration, leader: s.leader, leadChanges: s.leadChanges,
      crowds: s.crowds.map((c) => ({
        alive: c.alive, x: c.x, z: c.z, vx: c.vx, vz: c.vz, heading: c.heading, count: c.count, radius: c.alive ? radiusOf(c.count) : radiusOf(1),
        kills: c.kills, best: c.best, rank: c.rank, protect: c.protect, respawnIn: c.respawnIn, eating: c.eating, panic: c.panic,
        recruited: c.recruited, stolen: c.stolen, lost: c.lost, deaths: c.deaths, fx: { ...c.fx }, remote: c.remote,
        ...(s.mode ? { out: crowds[c.index].out, horde: crowds[c.index].horde, team: crowds[c.index].team, score: crowds[c.index].score,
          outAt: crowds[c.index].outAt, infections: crowds[c.index].infections } : {}),
      })),
      ...(view.zone ? { zone: view.zone, zoneNext: view.zoneNext, zoneT: view.zoneT } : {}),
      ...(view.circle ? { circle: view.circle } : {}),
      ...(view.teams ? { teams: view.teams } : {}),
      neutrals: { x: nx, z: nz, heading: model.heading, state: model.state.slice(), target: model.target.slice(), look: model.look.slice() },
      pickups: s.pickups.map((p) => ({ ...p })),
    };
  }

  return {
    onSnap, update, restoreState, stats, view,
    get latest() { return latest; },
    get synced() { return synced; },
    get lastRecv() { return lastRecv; },
    get epoch() { return epoch; },
    get localTick() { return lt; },
    setMe(i) { me = i; predOk = false; },
  };
}
