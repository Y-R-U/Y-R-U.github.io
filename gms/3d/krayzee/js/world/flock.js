// C5 sheep scatter (Muckle Bottom). Pure flock logic, no THREE, so tools/sheep-sim.mjs can run it in node.
// Each sheep grazes inside its field footprint; a plane that is low (or rolling on the ground) and close makes the
// sheep it can reach bolt directly away, the panic spreads to near neighbours, they settle after a few seconds and
// graze again, drifting back towards where they started. Sheep never leave their field (the hedges keep them off
// the strip and the taxi track) and are never colliders.
export const SHEEP = {
  ceiling: 60,          // m AGL: above this a plane is ignored
  airR: [130, 45],      // scare radius at 0 m AGL → at the ceiling
  groundR: [40, 110],   // scare radius of a rolling plane, at 4 m/s → 30 m/s
  groundMinGs: 4,       // m/s: a plane parked or crawling slower than this scares nobody
  run: [5.5, 7.5],      // m/s bolting speed
  flee: [2.5, 4.5],     // s of bolting after the last scare
  panic: 14,            // m: neighbours this close catch the panic
  bleatGap: 3.5,        // s between scatter bleats of one flock
  hearing: 450,         // m: a bleat further than this from the listener is not played
};

const rr = (rnd, [a, b]) => a + rnd() * (b - a);

/**
 * fields: [{ cx, cz, u:[ux,uz], v:[vx,vz], a, b, count }] (footprints in world metres, half-sizes a/b).
 * opts: { rnd, cfg?, heightAt?(x,z) }. Returns { sheep, update(dt, planes, listener), state, onBleat, onScatter }.
 * planes: [{ x, z, agl, gs, onGround, id, player }].
 */
export function createFlocks(fields, { rnd = Math.random, cfg = {}, heightAt = () => 0 } = {}) {
  const C = { ...SHEEP, ...cfg };
  const sheep = [];
  const flocks = fields.map((f, k) => {
    const F = { ...f, k, bleatAt: -99, idleAt: 8 + rnd() * 20, scatters: 0, r: Math.hypot(f.a, f.b) };
    for (let i = 0; i < f.count; i++) {
      const lx = (rnd() - 0.5) * f.a * 1.8, lz = (rnd() - 0.5) * f.b * 1.8;
      const x = f.cx + lx * f.u[0] + lz * f.v[0], z = f.cz + lx * f.u[1] + lz * f.v[1];
      sheep.push({ f: F, x, z, hx: x, hz: z, ang: rnd() * Math.PI * 2, vx: 0, vz: 0, mode: 0, until: 0, panicAt: -1, pdx: 0, pdz: 0,
        speed: 0, scares: 0, run: rr(rnd, C.run), stepAt: rnd() * 6, tx: x, tz: z, hop: rnd() * 6, s: 0.9 + rnd() * 0.25, dirty: true, y: heightAt(x, z) });
    }
    return F;
  });
  const S = { t: 0, bleats: 0, scatterBleats: 0, scared: 0 };
  const api = { sheep, flocks, cfg: C, onBleat: null, onScatter: null };

  function clampToField(s) {
    if (C.fence === false) return false; // tools/sheep-sim.mjs --falsify=fence only
    const f = s.f, dx = s.x - f.cx, dz = s.z - f.cz;
    let lx = dx * f.u[0] + dz * f.u[1], lz = dx * f.v[0] + dz * f.v[1];
    const ax = f.a - 1, bz = f.b - 1;
    let hit = false;
    if (lx > ax) { lx = ax; hit = true; } else if (lx < -ax) { lx = -ax; hit = true; }
    if (lz > bz) { lz = bz; hit = true; } else if (lz < -bz) { lz = -bz; hit = true; }
    if (hit) { s.x = f.cx + lx * f.u[0] + lz * f.v[0]; s.z = f.cz + lx * f.u[1] + lz * f.v[1]; }
    return hit;
  }

  function scare(s, dx, dz, now) {
    const d = Math.hypot(dx, dz) || 1, j = (rnd() - 0.5) * 0.9;
    const c = Math.cos(j), sn = Math.sin(j);
    s.pdx = (dx * c - dz * sn) / d; s.pdz = (dx * sn + dz * c) / d;
    if (s.mode !== 1) { S.scared++; s.scares++; }
    s.mode = 1; s.until = now + rr(rnd, C.flee); s.panicAt = -1;
  }

  function radius(p) {
    if (p.onGround) return p.gs < C.groundMinGs ? 0 : C.groundR[0] + (C.groundR[1] - C.groundR[0]) * Math.min(1, (p.gs - C.groundMinGs) / 26);
    if (!(p.agl < C.ceiling)) return 0;
    return C.airR[0] + (C.airR[1] - C.airR[0]) * Math.max(0, p.agl) / C.ceiling;
  }

  function update(dt, planes = [], listener = null) {
    if (!(dt > 0)) return false;
    dt = Math.min(dt, 0.25);
    const now = (S.t += dt);
    let moved = false;
    for (const F of flocks) {
      let fresh = 0, fx = 0, fz = 0, by = null;
      for (const p of planes) {
        const R = radius(p);
        if (!R || Math.hypot(p.x - F.cx, p.z - F.cz) > R + F.r) continue;
        for (const s of sheep) {
          if (s.f !== F) continue;
          const dx = s.x - p.x, dz = s.z - p.z;
          if (dx * dx + dz * dz > R * R) continue;
          const was = s.mode === 1;
          scare(s, dx, dz, now);
          if (!was) { fresh++; fx += s.x; fz += s.z; if (!by || p.player) by = p; }
        }
      }
      // panic spreads to neighbours, a beat later, running the same way
      if (fresh) for (const s of sheep) {
        if (s.f !== F || s.mode === 1 || s.panicAt >= 0) continue;
        for (const o of sheep) {
          if (o.f !== F || o.mode !== 1 || Math.hypot(o.x - s.x, o.z - s.z) > C.panic) continue;
          s.panicAt = now + 0.1 + rnd() * 0.35; s.pdx = o.pdx; s.pdz = o.pdz;
          break;
        }
      }
      if (fresh) {
        F.scatters++;
        const at = [fx / fresh, fz / fresh];
        api.onScatter?.({ flock: F.k, n: fresh, x: at[0], z: at[1], by: by?.id ?? null, player: !!by?.player, air: by ? !by.onGround : false });
        if (now - F.bleatAt > C.bleatGap) {
          F.bleatAt = now;
          const n = Math.min(3, 1 + Math.floor(fresh / 4));
          for (let i = 0; i < n; i++) bleat(at[0] + (rnd() - 0.5) * 12, at[1] + (rnd() - 0.5) * 12, { scatter: true, delay: i ? 0.12 + rnd() * 0.5 * i : 0, flock: F.k }, listener);
        }
      }
      // an occasional contented bleat from a grazing flock, only when someone is near enough to hear it
      if (now > F.idleAt) {
        F.idleAt = now + 18 + rnd() * 30;
        const s = sheep.find((q) => q.f === F && q.mode !== 1);
        if (s) bleat(s.x, s.z, { scatter: false, gain: 0.35, flock: F.k }, listener);
      }
    }
    for (const s of sheep) {
      if (s.panicAt >= 0 && now >= s.panicAt) { s.panicAt = -1; if (s.mode !== 1) { S.scared++; s.scares++; s.mode = 1; s.until = now + rr(rnd, C.flee) * 0.8; } }
      let want = 0, dx = 0, dz = 0;
      if (s.mode === 1) {
        if (now > s.until) { s.mode = 2; s.until = now + 1.5; }
        want = s.run; dx = s.pdx; dz = s.pdz;
      }
      if (s.mode === 2) {
        want = s.run * Math.max(0, (s.until - now) / 1.5) * 0.6; dx = s.pdx; dz = s.pdz;
        if (now > s.until) { s.mode = 0; s.stepAt = now + 2 + rnd() * 5; s.tx = s.x; s.tz = s.z; }
      }
      if (s.mode === 0) {
        if (now > s.stepAt) {
          // a few steps to fresh grass, leaning back towards where the flock grazed before the fright
          s.stepAt = now + 3 + rnd() * 6;
          const hx = s.hx - s.x, hz = s.hz - s.z, hd = Math.hypot(hx, hz);
          const pull = hd > 6 ? Math.min(0.85, hd / 40) : 0, a = rnd() * Math.PI * 2, step = 0.6 + rnd() * 1.8;
          const ux = Math.cos(a) * (1 - pull) + (hd ? hx / hd : 0) * pull, uz = Math.sin(a) * (1 - pull) + (hd ? hz / hd : 0) * pull;
          const ul = Math.hypot(ux, uz) || 1;
          s.tx = s.x + (ux / ul) * step * (1 + pull * 3); s.tz = s.z + (uz / ul) * step * (1 + pull * 3);
        }
        const tx = s.tx - s.x, tz = s.tz - s.z, td = Math.hypot(tx, tz);
        if (td > 0.15) { want = 0.7; dx = tx / td; dz = tz / td; }
      }
      const tvx = dx * want, tvz = dz * want, k = Math.min(1, dt * (s.mode === 1 ? 5 : 3));
      s.vx += (tvx - s.vx) * k; s.vz += (tvz - s.vz) * k;
      const sp = Math.hypot(s.vx, s.vz);
      s.speed = sp;
      if (sp > 0.02) {
        s.x += s.vx * dt; s.z += s.vz * dt;
        if (clampToField(s)) {
          // at the hedge: turn along it instead of pushing into it
          const f = s.f, ln = s.pdx * f.u[0] + s.pdz * f.u[1], lw = s.pdx * f.v[0] + s.pdz * f.v[1];
          const dxl = s.x - f.cx, dzl = s.z - f.cz, onA = Math.abs(dxl * f.u[0] + dzl * f.u[1]) >= f.a - 1.01;
          const nx = onA ? 0 : ln, nz = onA ? lw : 0, nl = Math.hypot(nx, nz) || 1;
          if (s.mode !== 0) { s.pdx = (nx * f.u[0] + nz * f.v[0]) / nl; s.pdz = (nx * f.u[1] + nz * f.v[1]) / nl; }
          s.vx *= 0.5; s.vz *= 0.5; s.tx = s.x; s.tz = s.z;
        }
        let da = Math.atan2(-s.vz, s.vx) - s.ang; da = Math.atan2(Math.sin(da), Math.cos(da));
        s.ang += da * Math.min(1, dt * (s.mode === 1 ? 9 : 3));
        s.hop += sp * dt * 2.4;
        s.y = heightAt(s.x, s.z);
        s.dirty = moved = true;
      } else if (s.hop % Math.PI > 0.05) { s.hop = Math.round(s.hop / Math.PI) * Math.PI; s.dirty = moved = true; }
    }
    return moved;
  }

  function bleat(x, z, o, listener) {
    if (listener && Math.hypot(x - listener.x, z - listener.z) > C.hearing) return;
    S.bleats++; if (o.scatter) S.scatterBleats++;
    api.onBleat?.({ x, z, ...o });
  }

  api.update = update;
  api.now = () => S.t;
  api.inField = (s) => {
    const f = s.f, dx = s.x - f.cx, dz = s.z - f.cz;
    return Math.abs(dx * f.u[0] + dz * f.u[1]) <= f.a + 0.01 && Math.abs(dx * f.v[0] + dz * f.v[1]) <= f.b + 0.01;
  };
  Object.defineProperty(api, 'state', {
    get: () => ({
      t: +S.t.toFixed(2), bleats: S.bleats, scatterBleats: S.scatterBleats, scared: S.scared,
      fleeing: sheep.filter((s) => s.mode === 1).length, moving: sheep.filter((s) => s.speed > 0.3).length,
      flocks: flocks.map((F) => ({ n: sheep.filter((s) => s.f === F).length, scatters: F.scatters, cx: F.cx, cz: F.cz })),
    }),
  });
  return api;
}
