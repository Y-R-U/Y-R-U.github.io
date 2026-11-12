// Fake sim for the render harness: produces state + events in the contract's shape.
export const SIM_DT = 1 / 30;

const TEAMS = [
  ['Blue Empire', 0x2f7bff], ['Red Legion', 0xff3a3a], ['Gold Squad', 0xffbf1a], ['Purple Power', 0x9b4dff],
  ['Green Force', 0x2fd14a], ['Orange Crush', 0xff8320], ['Pink Panthers', 0xff58c0], ['Cyan Tide', 0x19d3e6],
];

function rng(seed) {
  let a = (seed >>> 0) || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createFakeSim({ map, seed = 1, scene = 'late', player = 1200, rivals = [1100, 900, 780, 640], neutrals = 600, move = 1, ai = 1, duration = 120 }) {
  const R = rng(seed * 7919 + 3);
  const K = 0.55;
  const radiusOf = (n) => Math.max(1.2, K * Math.sqrt(n));
  const events = [];
  let tick = 0;
  const crowds = TEAMS.map(([name, color], i) => ({
    index: i, id: 'c' + i, name, color, isBot: i !== 0, alive: true,
    x: 0, z: 0, vx: 0, vz: 0, heading: 0, count: 5, radius: 1.2, kills: 0, best: 5,
    fx: { speed: 0, magnet: 0, double: 0 }, rank: i + 1,
    _wx: 0, _wz: 0, _wt: 0, _acc: 0, _resp: 0, _ix: 0, _iz: 0,
  }));
  const plaza = map.plazas[0];
  if (scene === 'late') {
    crowds[0].x = plaza.x + plaza.r * 0.25; crowds[0].z = plaza.z + plaza.r * 0.3; crowds[0].count = player;
    const r0 = radiusOf(player);
    const angs = [-2.2, -0.9, 0.5, 2.3];
    rivals.forEach((n, k) => {
      const c = crowds[k + 1];
      const d = r0 + radiusOf(n) + 7 + R() * 4;
      c.x = crowds[0].x + Math.cos(angs[k % 4]) * d; c.z = crowds[0].z + Math.sin(angs[k % 4]) * d; c.count = n;
    });
    for (let k = rivals.length + 1; k < 8; k++) {
      const s = map.spawns[(k * 3) % map.spawns.length];
      crowds[k].x = s.x; crowds[k].z = s.z; crowds[k].count = 40 + Math.floor(R() * 200);
    }
  } else {
    crowds.forEach((c, k) => {
      const s = map.spawns[k % map.spawns.length];
      c.x = s.x; c.z = s.z; c.count = k === 0 ? player : 4 + Math.floor(R() * 20);
    });
  }
  for (const c of crowds) {
    if (map.pushOut) { const o = {}; map.pushOut(c.x, c.z, 0.8, o); c.x = o.x; c.z = o.z; }
    c.radius = radiusOf(c.count); c.best = c.count; c._wx = c.x; c._wz = c.z;
  }

  const cap = Math.ceil(neutrals * 1.1) + 20;
  const N = {
    cap, x: new Float32Array(cap), z: new Float32Array(cap), heading: new Float32Array(cap),
    state: new Uint8Array(cap), target: new Int8Array(cap).fill(-1), look: new Uint8Array(cap),
  };
  const nSpeed = new Float32Array(cap), nTurn = new Float32Array(cap), nResp = new Float32Array(cap);
  const H = map.size / 2;
  const randomWalkable = () => {
    for (let k = 0; k < 60; k++) {
      let x, z;
      if (R() < 0.6) { const p = map.plazas[Math.floor(R() * map.plazas.length)]; const a = R() * 6.283, r = Math.sqrt(R()) * p.r; x = p.x + Math.cos(a) * r; z = p.z + Math.sin(a) * r; }
      else { x = (R() - 0.5) * (map.size - 30); z = (R() - 0.5) * (map.size - 30); }
      if (map.walkable(x, z)) return [x, z];
    }
    return [plaza.x + 10, plaza.z + 10];
  };
  const spawnNeutral = (s, avoid) => {
    let p;
    for (let k = 0; k < 20; k++) {
      p = randomWalkable();
      if (!avoid) break;
      let ok = true;
      for (const c of crowds) if (c.alive && Math.hypot(p[0] - c.x, p[1] - c.z) < c.radius + 18) ok = false;
      if (ok) break;
    }
    N.x[s] = p[0]; N.z[s] = p[1]; N.heading[s] = R() * 6.283; N.state[s] = 1; N.target[s] = -1;
    N.look[s] = Math.floor(R() * 256); nSpeed[s] = 1 + R() * 0.9; nTurn[s] = R() * 3;
  };
  for (let s = 0; s < neutrals; s++) spawnNeutral(s, scene === 'late');

  const pickups = [];
  const kinds = ['speed', 'magnet', 'double'];
  for (let k = 0; k < 5; k++) {
    const p = map.plazas[(k + 1) % map.plazas.length];
    const a = k * 1.7;
    const x = p.x + Math.cos(a) * p.r * 0.5, z = p.z + Math.sin(a) * p.r * 0.5;
    pickups.push({ id: k, kind: kinds[k % 3], x, z, active: true, _t: 0 });
  }
  if (scene === 'late') {
    pickups[0].x = crowds[0].x + 26; pickups[0].z = crowds[0].z - 6;
  }

  const state = { tick: 0, time: 0, timeLeft: duration, phase: 'play', crowds, neutrals: N, pickups, leader: 0 };
  let input = null;
  const tmp = {};

  function moveLeader(c, dt) {
    const sp = 8.6 * (1 - 0.34 * Math.min(1, c.count / 1500)) * (c.fx.speed > 0 ? 1.45 : 1) * move;
    let dx = c._wx - c.x, dz = c._wz - c.z;
    c._wt -= dt;
    if (c.index === 0 && input) { dx = input[0]; dz = input[1]; }
    else {
      if (Math.hypot(dx, dz) < 3 || c._wt <= 0) {
        let tx, tz;
        if (ai && R() < 0.6) {
          let best = null, bd = 1e9;
          for (const o of crowds) {
            if (o === c || !o.alive) continue;
            const d = Math.hypot(o.x - c.x, o.z - c.z);
            if (o.count * 1.15 < c.count && d < 70 && d < bd) { bd = d; best = o; }
          }
          if (best) { tx = best.x; tz = best.z; }
        }
        if (tx === undefined) { const p = randomWalkable(); tx = p[0]; tz = p[1]; }
        c._wx = tx; c._wz = tz; c._wt = 4 + R() * 5;
        dx = tx - c.x; dz = tz - c.z;
      }
      if (ai) for (const o of crowds) {
        if (o === c || !o.alive) continue;
        const d = Math.hypot(o.x - c.x, o.z - c.z);
        if (o.count > c.count * 1.15 && d < o.radius + c.radius + 14) { dx += (c.x - o.x) / d * 30; dz += (c.z - o.z) / d * 30; }
      }
    }
    const l = Math.hypot(dx, dz);
    const tvx = l > 0.01 ? dx / l * sp * Math.min(1, l) : 0, tvz = l > 0.01 ? dz / l * sp * Math.min(1, l) : 0;
    const k = 1 - Math.exp(-dt * 9);
    c.vx += (tvx - c.vx) * k; c.vz += (tvz - c.vz) * k;
    let nx = c.x + c.vx * dt, nz = c.z + c.vz * dt;
    if (map.pushOut) { map.pushOut(nx, nz, 0.8, tmp); nx = tmp.x; nz = tmp.z; }
    if (!map.walkable(nx, nz)) { nx = c.x; nz = c.z; c._wt = 0; }
    nx = Math.max(-H + 13, Math.min(H - 13, nx)); nz = Math.max(-H + 13, Math.min(H - 13, nz));
    c.vx = (nx - c.x) / dt; c.vz = (nz - c.z) / dt;
    c.x = nx; c.z = nz;
    if (Math.hypot(c.vx, c.vz) > 0.3) c.heading = Math.atan2(c.vx, c.vz);
  }

  function step() {
    const dt = SIM_DT;
    tick++; state.tick = tick; state.time += dt; state.timeLeft = Math.max(0, duration - state.time);
    if (state.timeLeft <= 0 && state.phase !== 'over') { state.phase = 'over'; events.push({ type: 'phase', phase: 'over', tick }); }
    const playing = state.phase === 'play';
    for (const c of crowds) {
      for (const k of ['speed', 'magnet', 'double']) c.fx[k] = Math.max(0, c.fx[k] - dt);
      if (!c.alive) {
        c._resp -= dt;
        if (c._resp <= 0) {
          let best = map.spawns[0], bs = -1;
          for (const s of map.spawns) {
            let m = 1e9;
            for (const o of crowds) if (o.alive) m = Math.min(m, Math.hypot(s.x - o.x, s.z - o.z) - o.radius);
            if (m > bs) { bs = m; best = s; }
          }
          c.alive = true; c.count = 5; c.x = best.x; c.z = best.z; c.vx = c.vz = 0; c.radius = radiusOf(5);
          events.push({ type: 'respawn', crowd: c.index, x: c.x, z: c.z, tick });
        }
        continue;
      }
      if (playing) moveLeader(c, dt);
    }
    // neutrals
    for (let s = 0; s < cap; s++) {
      if (!N.state[s]) {
        if (nResp[s] > 0) { nResp[s] -= dt; if (nResp[s] <= 0) spawnNeutral(s, true); }
        continue;
      }
      let pulled = -1, pd = 1e9;
      for (const c of crowds) {
        if (!c.alive) continue;
        const reach = c.radius + 3.2 + c.radius * 0.12 + (c.fx.magnet > 0 ? 9 : 0);
        const d = Math.hypot(N.x[s] - c.x, N.z[s] - c.z);
        if (d < reach && d - c.radius < pd) { pd = d - c.radius; pulled = c.index; }
      }
      if (pulled >= 0 && playing) {
        const c = crowds[pulled];
        N.state[s] = 2; N.target[s] = pulled;
        const dx = c.x - N.x[s], dz = c.z - N.z[s], d = Math.hypot(dx, dz) || 1;
        N.x[s] += dx / d * 7.5 * dt; N.z[s] += dz / d * 7.5 * dt; N.heading[s] = Math.atan2(dx, dz);
        if (d < c.radius) {
          const n = c.fx.double > 0 ? 2 : 1;
          c.count += n; c.best = Math.max(c.best, c.count);
          events.push({ type: 'recruit', crowd: c.index, slot: s, x: N.x[s], z: N.z[s], tick });
          N.state[s] = 0; N.target[s] = -1; nResp[s] = 1 + R() * 3;
        }
        continue;
      }
      N.state[s] = 1; N.target[s] = -1;
      nTurn[s] -= dt;
      if (nTurn[s] <= 0) { N.heading[s] += (R() - 0.5) * 1.6; nTurn[s] = 1.5 + R() * 3; }
      const nx = N.x[s] + Math.sin(N.heading[s]) * nSpeed[s] * dt, nz = N.z[s] + Math.cos(N.heading[s]) * nSpeed[s] * dt;
      if (map.walkable(nx, nz)) { N.x[s] = nx; N.z[s] = nz; } else { N.heading[s] += Math.PI * (0.6 + R() * 0.8); }
    }
    // crowd contact
    if (playing) for (let a = 0; a < 8; a++) for (let b = a + 1; b < 8; b++) {
      const A = crowds[a], B = crowds[b];
      if (!A.alive || !B.alive) continue;
      const d = Math.hypot(A.x - B.x, A.z - B.z);
      const ov = A.radius + B.radius - d;
      if (ov <= 0) continue;
      const big = A.count >= B.count ? A : B, small = big === A ? B : A;
      if (big.count < small.count * 1.06) continue;
      const frac = Math.min(1, ov / (small.radius * 2));
      small._acc += (7 + 0.9 * Math.sqrt(small.count) * 3) * frac * dt;
      const n = Math.min(small.count, Math.floor(small._acc));
      if (n > 0) {
        small._acc -= n;
        small.count -= n; big.count += n; big.best = Math.max(big.best, big.count);
        const cx = small.x + (big.x - small.x) / (d || 1) * small.radius, cz = small.z + (big.z - small.z) / (d || 1) * small.radius;
        events.push({ type: 'steal', from: small.index, to: big.index, n, x: cx, z: cz, tick });
        if (small.count <= 0) {
          small.alive = false; small.count = 0; small._resp = 3; big.kills++;
          events.push({ type: 'elim', victim: small.index, by: big.index, x: small.x, z: small.z, tick });
        }
      }
    }
    for (const c of crowds) c.radius = radiusOf(Math.max(1, c.count));
    // pickups
    for (const p of pickups) {
      if (!p.active) { p._t -= dt; if (p._t <= 0) p.active = true; continue; }
      if (!playing) continue;
      for (const c of crowds) {
        if (!c.alive) continue;
        if (Math.hypot(c.x - p.x, c.z - p.z) < 2.2 + c.radius * 0.3) {
          p.active = false; p._t = 11;
          c.fx[p.kind] = { speed: 6, magnet: 8, double: 8 }[p.kind];
          events.push({ type: 'pickup', crowd: c.index, id: p.id, kind: p.kind, x: p.x, z: p.z, tick });
          break;
        }
      }
    }
    // ranks
    const order = crowds.filter((c) => c.alive).sort((a, b) => b.count - a.count);
    crowds.forEach((c) => { c.rank = 99; });
    order.forEach((c, i) => { c.rank = i + 1; });
    const lead = order[0] ? order[0].index : -1;
    if (lead !== state.leader) { state.leader = lead; events.push({ type: 'lead', crowd: lead, tick }); }
  }

  return {
    state, step,
    drainEvents() { const out = events.slice(); events.length = 0; return out; },
    setInput(ax, az) { input = ax || az ? [ax, az] : null; },
  };
}
