// GRUDGE BUGS — pure physics. Plain {x,y,z} objects, NO THREE, so node can
// unit-test everything: ledge walking, ballistics with wind, bounces, rolling
// dung, explosions with knockback, ledge destruction and ragdoll landings.
// Ledge polylines are the TOP-CENTRE walk line of each plank.

import { PHYS } from './config.js';
import { v3, vadd, vsub, vscale, vlen, vdist, vnorm, clamp, lerp } from './utils.js';

// ---------------- ledges ----------------
// def: { pts: [{x,y,z}...], w?: halfWidth, tag?: string }
export function buildLedges(defs) {
  return defs.map((d, i) => {
    const pts = d.pts.map(p => v3(p.x, p.y, p.z));
    const segLen = [];
    let len = 0;
    for (let k = 0; k < pts.length - 1; k++) { const l = vdist(pts[k], pts[k + 1]); segLen.push(l); len += l; }
    return { i, pts, segLen, len, w: d.w ?? PHYS.ledgeHalfW, tag: d.tag || '', gaps: [], dirty: true };
  });
}

export function posAt(L, s) {
  s = clamp(s, 0, L.len);
  let acc = 0;
  for (let k = 0; k < L.segLen.length; k++) {
    if (s <= acc + L.segLen[k] + 1e-9) {
      const t = L.segLen[k] < 1e-9 ? 0 : (s - acc) / L.segLen[k];
      const a = L.pts[k], b = L.pts[k + 1];
      return {
        pos: v3(lerp(a.x, b.x, t), lerp(a.y, b.y, t), lerp(a.z, b.z, t)),
        dir: vnorm(vsub(b, a)),
      };
    }
    acc += L.segLen[k];
  }
  const a = L.pts[L.pts.length - 2], b = L.pts[L.pts.length - 1];
  return { pos: v3(b.x, b.y, b.z), dir: vnorm(vsub(b, a)) };
}

// nearest point on ledge walk-line in XZ; returns {s, distXZ, y}
export function nearestS(L, p) {
  let best = { s: 0, distXZ: 1e9, y: 0 };
  let acc = 0;
  for (let k = 0; k < L.segLen.length; k++) {
    const a = L.pts[k], b = L.pts[k + 1];
    const abx = b.x - a.x, abz = b.z - a.z;
    const q = abx * abx + abz * abz;
    let t = q < 1e-9 ? 0 : ((p.x - a.x) * abx + (p.z - a.z) * abz) / q;
    t = clamp(t, 0, 1);
    const cx = a.x + abx * t, cz = a.z + abz * t;
    const d = Math.hypot(p.x - cx, p.z - cz);
    if (d < best.distXZ) best = { s: acc + t * L.segLen[k], distXZ: d, y: lerp(a.y, b.y, t) };
    acc += L.segLen[k];
  }
  return best;
}

// contiguous walkable span containing s, or null when s is inside a gap
export function spanAt(L, s) {
  let a = 0, b = L.len;
  for (const [g0, g1] of L.gaps) {
    if (s > g0 - 1e-6 && s < g1 + 1e-6) return null;
    if (g1 <= s) a = Math.max(a, g1);
    if (g0 >= s) b = Math.min(b, g0);
  }
  return [a, b];
}

export function addGap(L, s0, s1) {
  s0 = clamp(s0, 0, L.len); s1 = clamp(s1, 0, L.len);
  if (s1 - s0 < 0.05) return;
  L.gaps.push([s0, s1]);
  // merge overlaps
  L.gaps.sort((x, y) => x[0] - y[0]);
  const m = [L.gaps[0].slice()];
  for (let i = 1; i < L.gaps.length; i++) {
    const g = L.gaps[i], last = m[m.length - 1];
    if (g[0] <= last[1] + 0.05) last[1] = Math.max(last[1], g[1]);
    else m.push(g.slice());
  }
  L.gaps = m;
  L.dirty = true;
}

// solid pieces of a ledge (between gaps) — for meshing and collision
export function solidSpans(L) {
  const out = [];
  let a = 0;
  for (const [g0, g1] of L.gaps) { if (g0 - a > 0.05) out.push([a, g0]); a = g1; }
  if (L.len - a > 0.05) out.push([a, L.len]);
  return out;
}

// does point p (with radius r) touch ledge solid volume? returns hit info or null
export function ledgeHit(ledges, p, r = 0) {
  for (const L of ledges) {
    const n = nearestS(L, p);
    if (n.distXZ > L.w + r) continue;
    const topY = n.y;
    if (p.y > topY + r || p.y < topY - PHYS.ledgeThick - r) continue;
    if (!spanAt(L, n.s)) continue;              // inside a blown-out gap
    return { ledge: L, s: n.s, topY, distXZ: n.distXZ };
  }
  return null;
}

// ---------------- projectile simulation ----------------
// shot: { pos, vel, w:{kind,dmg,radius,impulse,wind,gravityMul,fuse,rest,speed}, shooterId }
// world: { ledges, bugs:[{id,pos,alive}], wind:{x,z}, killY }
// returns { path:[{t,x,y,z}], impact:{t,pos,type,hitBugId?}, rollLedge? }
export function simulate(shot, world) {
  const dt = PHYS.dt;
  const w = shot.w;
  const g = PHYS.gravity * (w.gravityMul ?? 1);
  const windX = (world.wind?.x || 0) * (w.wind ?? 0);
  const windZ = (world.wind?.z || 0) * (w.wind ?? 0);
  let p = v3(shot.pos.x, shot.pos.y, shot.pos.z);
  let v = v3(shot.vel.x, shot.vel.y, shot.vel.z);
  const path = [{ t: 0, x: p.x, y: p.y, z: p.z }];
  let t = 0, graceT = 0.12;                     // ignore shooter for first beat
  let mode = 'fly';                             // fly | roll
  let rollLedge = null, rollS = 0, rollDir = 1, rollSpeed = 0;
  const projR = 0.16;

  const record = () => { path.push({ t, x: p.x, y: p.y, z: p.z }); };
  const boom = (type, hitBugId) => ({ path, impact: { t, pos: v3(p.x, p.y, p.z), type, hitBugId }, rollLedge });

  while (t < PHYS.maxFlight) {
    t += dt;
    if (mode === 'fly') {
      v.x += windX * dt; v.z += windZ * dt; v.y += g * dt;
      p = vadd(p, vscale(v, dt));
      record();
      if (p.y < world.killY) return boom('splash');
      // bug hit
      for (const b of world.bugs) {
        if (!b.alive) continue;
        if (t < graceT && b.id === shot.shooterId) continue;
        const c = v3(b.pos.x, b.pos.y + PHYS.bugHeight * 0.5, b.pos.z);
        if (vdist(p, c) < PHYS.bugRadius + projR + 0.06) {
          if (w.kind === 'bounce' || w.kind === 'roll') { /* contact-fused anyway */ }
          return boom('bug', b.id);
        }
      }
      // ledge hit
      const hit = ledgeHit(world.ledges, p, projR);
      if (hit) {
        if (w.kind === 'bounce') {
          const fromAbove = v.y < 0 && p.y > hit.topY - 0.18;
          if (fromAbove) {
            p.y = hit.topY + projR + 0.01;
            v.y = -v.y * (w.rest ?? 0.45); v.x *= 0.72; v.z *= 0.72;
            if (Math.abs(v.y) < 0.6) v.y = 0;
          } else {
            // side hit: push out horizontally from the walk line
            const at = posAt(hit.ledge, hit.s).pos;
            let nx = p.x - at.x, nz = p.z - at.z;
            const nl = Math.hypot(nx, nz) || 1; nx /= nl; nz /= nl;
            const dot = v.x * nx + v.z * nz;
            v.x -= 2 * dot * nx; v.z -= 2 * dot * nz;
            v.x *= (w.rest ?? 0.45); v.z *= (w.rest ?? 0.45);
            p.x += nx * 0.05; p.z += nz * 0.05;
          }
        } else if (w.kind === 'roll') {
          mode = 'roll';
          rollLedge = hit.ledge; rollS = hit.s;
          const d = posAt(rollLedge, rollS).dir;
          rollDir = (v.x * d.x + v.z * d.z) >= 0 ? 1 : -1;
          rollSpeed = Math.max(w.speed ?? 4, vlen(v) * 0.4);
        } else {
          return boom('ledge');
        }
      }
      if ((w.kind === 'bounce' || w.kind === 'roll') && w.fuse && t >= w.fuse) return boom('fuse');
    } else {
      // rolling along a ledge
      rollS += rollDir * rollSpeed * dt;
      const span = spanAt(rollLedge, clamp(rollS, 0, rollLedge.len));
      const off = span ? (rollS < span[0] || rollS > span[1]) : true;
      if (off || rollS < 0 || rollS > rollLedge.len) {
        // roll off the end — back to ballistic
        const at = posAt(rollLedge, clamp(rollS, 0, rollLedge.len));
        p = v3(at.pos.x, at.pos.y + projR, at.pos.z);
        v = vscale(at.dir, rollDir * rollSpeed); v.y = 0.5;
        mode = 'fly';
        record();
        continue;
      }
      const at = posAt(rollLedge, rollS);
      p = v3(at.pos.x, at.pos.y + projR + 0.05, at.pos.z);
      record();
      for (const b of world.bugs) {
        if (!b.alive || b.id === shot.shooterId) continue;
        if (vdist(p, b.pos) < 0.75) return boom('bug', b.id);
      }
      if (w.fuse && t >= w.fuse) return boom('fuse');
    }
  }
  return boom('timeout');
}

// ---------------- explosions ----------------
// returns per-bug results: [{id, dmg, imp:{x,y,z}}]
export function explosionEffects(at, w, bugs) {
  const out = [];
  for (const b of bugs) {
    if (!b.alive) continue;
    const c = v3(b.pos.x, b.pos.y + PHYS.bugHeight * 0.5, b.pos.z);
    const d = vdist(at, c);
    const R = w.radius * 1.15;
    if (d > R) continue;
    const f = clamp(1 - d / R, 0, 1);
    const dmg = Math.max(1, Math.round(w.dmg * Math.pow(f, 0.7)));
    let dir = vsub(c, at);
    if (vlen(dir) < 0.05) dir = v3(0, 1, 0);
    dir = vnorm(dir);
    dir.y = Math.max(dir.y, 0.45);              // worms-style up-bias
    dir = vnorm(dir);
    const imp = vscale(dir, (w.impulse ?? 8) * (0.35 + 0.65 * f));
    out.push({ id: b.id, dmg, imp });
  }
  return out;
}

// blow chunks out of nearby ledges; returns [{ledge, s0, s1}]
export function biteLedges(ledges, at, radius) {
  const bites = [];
  for (const L of ledges) {
    const n = nearestS(L, at);
    if (n.distXZ > radius * 0.85 + L.w) continue;
    if (Math.abs(n.y - at.y) > radius * 0.95) continue;
    const half = Math.max(0.45, radius * 0.62);
    const s0 = n.s - half, s1 = n.s + half;
    addGap(L, s0, s1);
    bites.push({ ledge: L, s0: clamp(s0, 0, L.len), s1: clamp(s1, 0, L.len) });
  }
  return bites;
}

// ---------------- ragdoll (knocked bug) ----------------
// returns { path, end:{type:'land'|'splash', ledge?, s?, pos, t, landV} }
export function simulateRag(start, vel, world, ignoreLedge = null, ignoreUntilClear = false) {
  const dt = PHYS.dt;
  let p = v3(start.x, start.y, start.z);
  let v = v3(vel.x, vel.y, vel.z);
  const path = [{ t: 0, x: p.x, y: p.y, z: p.z }];
  let t = 0, bounced = 0, clearOfHome = !ignoreUntilClear;
  while (t < 8) {
    t += dt;
    v.y += PHYS.gravity * dt;
    v = vscale(v, 1 - PHYS.ragDrag * dt);
    p = vadd(p, vscale(v, dt));
    path.push({ t, x: p.x, y: p.y, z: p.z });
    if (p.y < world.killY) return { path, end: { type: 'splash', pos: p, t, landV: vlen(v) } };
    // launched off own ledge: don't re-collide with it until we've left its slab
    const hits = [];
    for (const L of world.ledges) {
      if (!clearOfHome && L === ignoreLedge) continue;
      const n = nearestS(L, p);
      if (n.distXZ <= L.w + 0.1 && v.y <= 0 && p.y <= n.y + 0.12 && p.y >= n.y - 0.45 && spanAt(L, n.s)) {
        hits.push({ L, n });
      }
    }
    if (!clearOfHome && ignoreLedge) {
      const n = nearestS(ignoreLedge, p);
      if (n.distXZ > ignoreLedge.w + 0.25 || p.y > n.y + 0.6) clearOfHome = true;
    }
    if (hits.length) {
      const { L, n } = hits[0];
      const vv = Math.abs(v.y);
      if (vv > 4.2 && bounced < 1) {
        bounced++;
        p.y = n.y + 0.05;
        v.y = vv * PHYS.ragBounce; v.x *= 0.55; v.z *= 0.55;
        continue;
      }
      return { path, end: { type: 'land', ledge: L, s: n.s, pos: v3(p.x, n.y, p.z), t, landV: vv } };
    }
  }
  return { path, end: { type: 'splash', pos: p, t, landV: vlen(v) } };
}

// landing damage from a hard fall
export function landDamage(landV) {
  if (landV <= PHYS.landDmgV) return 0;
  return Math.round((landV - PHYS.landDmgV) * PHYS.landDmgMul);
}

// initial velocity for a shot given yaw/pitch/power(0..1) and weapon speed
export function muzzleVel(yaw, pitch, power, speed) {
  const s = speed * (0.25 + 0.75 * power);
  return v3(
    Math.sin(yaw) * Math.cos(pitch) * s,
    Math.sin(pitch) * s,
    Math.cos(yaw) * Math.cos(pitch) * s,
  );
}
