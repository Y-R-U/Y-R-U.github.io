// SKYPUTT physics: one sphere vs static triangles + an analytic cup + kinematic bodies.
// Deterministic: fixed DT, no randomness, same iteration order every run. Pure JS, node-safe.
import {
  BALL_R as R, CUP_R, CUP_DEPTH, G, DT, SPEED_CAP, STOP_SPEED, STOP_TIME, SHOT_TIMEOUT,
  BOUNCE_MIN, ROLL_K, SURFACES, MAT, BOOST_ACC, BOOST_MAX,
} from './constants.js';
import { CP, closestOnTri, TriGrid, rotAxis } from './shapes.js';

const R2 = R * R;
const MAXC = 64;
const JN_CAP = 2.5 * G * DT;
const GRAZE = 0.3;                       // |u.n| < GRAZE*|u| counts as rolling over a curve
const RIM_HOP = 0.3, RIM_KEEP = 0.92;   // lip-out tuning (m/s upward cap, horizontal keep)        // rolling-friction normal impulse cap per step (landings don't skid to a halt)

// Contact scratch (kind: 0 tri, 1 cup rim, 2 cup wall, 3 cup floor, 4 kinematic shape)
const cKind = new Int32Array(MAXC), cIdx = new Int32Array(MAXC), cSub = new Int32Array(MAXC);
const cD = new Float64Array(MAXC);
const KV = { x: 0, y: 0, z: 0 };   // surface velocity of the last computed contact
const ROT = new Float64Array(9);

export class Ball {
  constructor(x = 0, y = 0, z = 0) {
    this.px = x; this.py = y; this.pz = z;
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.state = 'rest';           // rest | moving | cup | oob
    this.restT = 0; this.moveT = 0;
    this.supported = false;
    this.nx = 0; this.ny = 1; this.nz = 0;   // last support normal
    this.surf = MAT.GRASS;
    this.rest = { x, y, z };       // last resting spot (D9)
    this.events = [];
  }
  speed() { return Math.hypot(this.vx, this.vy, this.vz); }
  clone() {
    const b = new Ball(this.px, this.py, this.pz);
    b.vx = this.vx; b.vy = this.vy; b.vz = this.vz; b.state = this.state;
    b.restT = this.restT; b.moveT = this.moveT; b.supported = this.supported;
    b.nx = this.nx; b.ny = this.ny; b.nz = this.nz; b.surf = this.surf;
    b.rest = { ...this.rest };
    return b;
  }
  place(x, y, z) {
    this.px = x; this.py = y; this.pz = z; this.vx = this.vy = this.vz = 0;
    this.state = 'rest'; this.restT = 0; this.moveT = 0; this.rest = { x, y, z };
  }
}

export class World {
  // tris: Float64Array (9 per tri), mats: Uint8Array (1 per tri),
  // cup: {x,y,z} | null, kinematics: [{pivot, axis, omega, phase, basis:[ex,ey,ez], shapes, mat}]
  // dirs: optional Float32Array (3 per tri), the arrow of boost-pad triangles
  constructor({ tris, mats, dirs = null, cup = null, kinematics = [], killY = -3 }) {
    this.tris = tris; this.mats = mats; this.dirs = dirs; this.cup = cup; this.kin = kinematics; this.killY = killY;
    this._kinP = kinematics.map(k => Float64Array.from(k.pivot));   // posed pivot (sliders move it)
    this._kinV = kinematics.map(() => new Float64Array(3));          // slider linear velocity
    this.grid = new TriGrid(tris);
    this.time = 0;                 // obstacle clock (seconds)
    this._kinAxes = kinematics.map(() => new Float64Array(9));
    this._kinT = NaN;
  }

  shoot(b, vx, vz, vy = 0) {
    b.rest = { x: b.px, y: b.py, z: b.pz };
    b.vx = vx; b.vy = vy; b.vz = vz;
    b.state = 'moving'; b.restT = 0; b.moveT = 0;
  }

  // Pose every kinematic body at time t (cached per t).
  _poseKin(t) {
    if (t === this._kinT) return;
    this._kinT = t;
    for (let k = 0; k < this.kin.length; k++) {
      const body = this.kin[k], A = this._kinAxes[k], P = this._kinP[k], V = this._kinV[k];
      if (body.slide) {   // pure function of time: pivot + dir * amp * sin(w t + phase)
        const sl = body.slide, a = sl.omega * t + sl.phase, o = sl.amp * Math.sin(a), vo = sl.amp * sl.omega * Math.cos(a);
        for (let j = 0; j < 3; j++) { P[j] = body.pivot[j] + sl.dir[j] * o; V[j] = sl.dir[j] * vo; }
      }
      const ang = body.omega * t + body.phase;
      rotAxis(ROT, body.axis[0], body.axis[1], body.axis[2], ang);
      for (let a = 0; a < 3; a++) {
        const e = body.basis[a];
        A[a * 3]     = ROT[0] * e[0] + ROT[1] * e[1] + ROT[2] * e[2];
        A[a * 3 + 1] = ROT[3] * e[0] + ROT[4] * e[1] + ROT[5] * e[2];
        A[a * 3 + 2] = ROT[6] * e[0] + ROT[7] * e[1] + ROT[8] * e[2];
      }
    }
  }

  // Closest point for contact (kind, idx, sub) into CP; returns material id. Sets KV.
  _closest(kind, idx, sub, px, py, pz) {
    KV.x = KV.y = KV.z = 0;
    if (kind === 0) { closestOnTri(this.tris, idx * 9, px, py, pz); return this.mats[idx]; }
    const c = this.cup;
    if (kind === 1) {                                  // rim: a circle at cup.y
      let dx = px - c.x, dz = pz - c.z; const dh = Math.hypot(dx, dz) || 1e-9;
      CP.x = c.x + dx / dh * CUP_R; CP.y = c.y; CP.z = c.z + dz / dh * CUP_R; return MAT.RIM;
    }
    if (kind === 2) {                                  // inner wall
      let dx = px - c.x, dz = pz - c.z; const dh = Math.hypot(dx, dz) || 1e-9;
      CP.x = c.x + dx / dh * CUP_R; CP.z = c.z + dz / dh * CUP_R;
      CP.y = Math.min(c.y, Math.max(c.y - CUP_DEPTH, py)); return MAT.CUP;
    }
    if (kind === 3) { CP.x = px; CP.y = c.y - CUP_DEPTH; CP.z = pz; return MAT.CUP; }
    // kinematic shape
    const body = this.kin[idx], s = body.shapes[sub], A = this._kinAxes[idx], pv = this._kinP[idx];
    const dx = px - pv[0], dy = py - pv[1], dz = pz - pv[2];
    let lx = dx * A[0] + dy * A[1] + dz * A[2] - s.c[0];
    let ly = dx * A[3] + dy * A[4] + dz * A[5] - s.c[1];
    let lz = dx * A[6] + dy * A[7] + dz * A[8] - s.c[2];
    let qx, qy, qz;
    if (s.kind === 'box') {
      const h = s.h;
      qx = Math.max(-h[0], Math.min(h[0], lx));
      qy = Math.max(-h[1], Math.min(h[1], ly));
      qz = Math.max(-h[2], Math.min(h[2], lz));
      if (qx === lx && qy === ly && qz === lz) {      // centre inside: push to nearest face
        const ex = h[0] - Math.abs(lx), ey = h[1] - Math.abs(ly), ez = h[2] - Math.abs(lz);
        if (ex <= ey && ex <= ez) qx = Math.sign(lx || 1) * h[0];
        else if (ey <= ez) qy = Math.sign(ly || 1) * h[1];
        else qz = Math.sign(lz || 1) * h[2];
      }
    } else {                                           // vertical cylinder
      const rh = Math.hypot(lx, lz) || 1e-9;
      qy = Math.max(-s.hh, Math.min(s.hh, ly));
      if (rh > s.r || qy !== ly) { const k = Math.min(1, s.r / rh); qx = lx * k; qz = lz * k; }
      else { qx = lx / rh * s.r; qz = lz / rh * s.r; } // inside: push out radially
    }
    qx += s.c[0]; qy += s.c[1]; qz += s.c[2];
    const wx = A[0] * qx + A[3] * qy + A[6] * qz, wy = A[1] * qx + A[4] * qy + A[7] * qz, wz = A[2] * qx + A[5] * qy + A[8] * qz;
    CP.x = pv[0] + wx; CP.y = pv[1] + wy; CP.z = pv[2] + wz;
    if (body.omega) {                                  // v = omega * axis x r
      const w = body.omega, ax = body.axis;
      KV.x = w * (ax[1] * wz - ax[2] * wy); KV.y = w * (ax[2] * wx - ax[0] * wz); KV.z = w * (ax[0] * wy - ax[1] * wx);
    }
    if (body.slide) { const V = this._kinV[idx]; KV.x += V[0]; KV.y += V[1]; KV.z += V[2]; }
    return s.mat ?? body.mat ?? MAT.WALL;
  }

  // Advance one ball by one fixed step at obstacle time t.
  stepBall(b, t = this.time) {
    if (b.state !== 'moving') return;
    b.vy -= G * DT;
    let sp = Math.hypot(b.vx, b.vy, b.vz);
    if (sp > SPEED_CAP) { const k = SPEED_CAP / sp; b.vx *= k; b.vy *= k; b.vz *= k; }
    b.px += b.vx * DT; b.py += b.vy * DT; b.pz += b.vz * DT;
    b.moveT += DT;

    // ---- gather contacts
    let n = 0;
    const cell = this.grid.query(b.px, b.py, b.pz);
    for (let i = 0; i < cell.length && n < MAXC; i++) {
      const ti = cell[i];
      closestOnTri(this.tris, ti * 9, b.px, b.py, b.pz);
      const dx = b.px - CP.x, dy = b.py - CP.y, dz = b.pz - CP.z, d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < R2) { cKind[n] = 0; cIdx[n] = ti; cSub[n] = 0; cD[n++] = d2; }
    }
    const c = this.cup;
    if (c) {
      const dx = b.px - c.x, dz = b.pz - c.z, dh = Math.hypot(dx, dz);
      if (dh < CUP_R + R && Math.abs(b.py - c.y) < R + 0.01) {
        this._closest(1, 0, 0, b.px, b.py, b.pz);
        const ex = b.px - CP.x, ey = b.py - CP.y, ez = b.pz - CP.z, d2 = ex * ex + ey * ey + ez * ez;
        if (d2 < R2 && n < MAXC) { cKind[n] = 1; cIdx[n] = 0; cSub[n] = 0; cD[n++] = d2; }
      }
      if (dh < CUP_R && b.py <= c.y && b.py > c.y - CUP_DEPTH - R) {
        if (CUP_R - dh < R && n < MAXC) { cKind[n] = 2; cIdx[n] = 0; cSub[n] = 0; cD[n++] = (CUP_R - dh) ** 2; }
        const db = b.py - (c.y - CUP_DEPTH);
        if (db < R && n < MAXC) { cKind[n] = 3; cIdx[n] = 0; cSub[n] = 0; cD[n++] = db * db; }
      }
    }
    if (this.kin.length) {
      this._poseKin(t);
      for (let k = 0; k < this.kin.length; k++) {
        const body = this.kin[k];
        const pv = this._kinP[k], dx = b.px - pv[0], dy = b.py - pv[1], dz = b.pz - pv[2];
        if (dx * dx + dy * dy + dz * dz > (body.reach + R) ** 2) continue;
        for (let s = 0; s < body.shapes.length && n < MAXC; s++) {
          this._closest(4, k, s, b.px, b.py, b.pz);
          const ex = b.px - CP.x, ey = b.py - CP.y, ez = b.pz - CP.z, d2 = ex * ex + ey * ey + ez * ez;
          if (d2 < R2) { cKind[n] = 4; cIdx[n] = k; cSub[n] = s; cD[n++] = d2; }
        }
      }
    }
    // insertion sort by distance (deepest first)
    for (let i = 1; i < n; i++) {
      const d = cD[i], k = cKind[i], x = cIdx[i], s = cSub[i];
      let j = i - 1;
      while (j >= 0 && cD[j] > d) { cD[j + 1] = cD[j]; cKind[j + 1] = cKind[j]; cIdx[j + 1] = cIdx[j]; cSub[j + 1] = cSub[j]; j--; }
      cD[j + 1] = d; cKind[j + 1] = k; cIdx[j + 1] = x; cSub[j + 1] = s;
    }

    // ---- resolve sequentially, re-measuring each contact after earlier pushes
    let fJn = 0, fnx = 0, fny = 0, fnz = 0, fMat = -1, fBest = 0;
    const wasSupported = b.supported;
    let boostTri = -1;
    let gax = 0, gay = -G * DT, gaz = 0;   // the gravity this step that is still inside v
    for (let i = 0; i < n; i++) {
      const mat = this._closest(cKind[i], cIdx[i], cSub[i], b.px, b.py, b.pz);
      let nx = b.px - CP.x, ny = b.py - CP.y, nz = b.pz - CP.z;
      const d = Math.hypot(nx, ny, nz);
      if (d >= R) continue;
      if (d < 1e-9) { nx = 0; ny = 1; nz = 0; } else { nx /= d; ny /= d; nz /= d; }
      const pen = R - d;
      b.px += nx * pen; b.py += ny * pen; b.pz += nz * pen;
      let rvx = b.vx - KV.x, rvy = b.vy - KV.y, rvz = b.vz - KV.z;
      const vn = rvx * nx + rvy * ny + rvz * nz;
      if (vn >= 0) continue;
      const S = SURFACES[mat];
      const jn = -vn;
      // Rolling over a curved floor (loop, ramp, the facets of any swept surface): the surface turns
      // the ball, it does not take speed away. Rotate the pre-gravity velocity onto the tangent plane
      // (keeping its speed), then add this step's gravity along the slope. Landings and steep
      // kinks use the plain impulse below.
      let rolled = false;
      if (S.floor && mat !== MAT.RIM && wasSupported && cKind[i] !== 4) {
        const ux = rvx - gax, uy = rvy - gay, uz = rvz - gaz;
        const us = Math.hypot(ux, uy, uz), un = ux * nx + uy * ny + uz * nz;
        if (-un < GRAZE * us + 1e-6) {
          const tx = ux - un * nx, ty = uy - un * ny, tz = uz - un * nz, ts = Math.hypot(tx, ty, tz);
          const gn = -G * DT * ny;
          gax = -gn * nx; gay = -G * DT - gn * ny; gaz = -gn * nz;
          const k = ts > 1e-9 ? us / ts : 0;
          rvx = tx * k + gax; rvy = ty * k + gay; rvz = tz * k + gaz;
          rolled = true;
        }
      }
      const e = !rolled && jn > BOUNCE_MIN && !(S.floor && wasSupported) ? S.e : 0;
      if (!rolled) { rvx -= (1 + e) * vn * nx; rvy -= (1 + e) * vn * ny; rvz -= (1 + e) * vn * nz; }
      if (mat === MAT.RIM && jn > 0.25) {
        // The far lip: a rolling ball pivots round the edge and keeps its pace (energy), it does
        // not just lose the normal component. Rotate the velocity onto the tangent, keep RIM_KEEP of
        // the speed, and keep the hop low so a firm putt skips over instead of flying away.
        const sp0 = Math.hypot(rvx + (1 + e) * vn * nx, rvy + (1 + e) * vn * ny, rvz + (1 + e) * vn * nz);
        const st = Math.hypot(rvx, rvy, rvz);
        if (st > 1e-6) { const k = sp0 * RIM_KEEP / st; rvx *= k; rvy *= k; rvz *= k; }
        if (rvy > RIM_HOP) rvy = RIM_HOP + (rvy - RIM_HOP) * 0.25;
      }
      if (!S.floor) {
        // scrub: tangential loss proportional to the impact
        const vnn = rvx * nx + rvy * ny + rvz * nz;
        const tx = rvx - vnn * nx, ty = rvy - vnn * ny, tz = rvz - vnn * nz;
        const ts = Math.hypot(tx, ty, tz);
        if (ts > 1e-9) { const k = Math.max(0, 1 - S.scrub * jn / ts); rvx = vnn * nx + tx * k; rvy = vnn * ny + ty * k; rvz = vnn * nz + tz * k; }
        if (jn > 0.12) b.events.push({ type: cKind[i] === 4 ? 'obstacle' : (mat === MAT.CUP ? 'cup-hit' : 'wall'), speed: jn, mat });
      } else {
        fJn += jn; fnx += nx * jn; fny += ny * jn; fnz += nz * jn;
        if (jn > fBest) { fBest = jn; fMat = mat; }
        if (mat === MAT.BOOST && cKind[i] === 0) boostTri = cIdx[i];
        if (jn > 0.8 && !wasSupported) b.events.push({ type: mat === MAT.RIM ? 'rim' : 'land', speed: jn, mat });
        else if (mat === MAT.RIM && jn > 0.15) b.events.push({ type: 'rim', speed: jn, mat });
      }
      b.vx = rvx + KV.x; b.vy = rvy + KV.y; b.vz = rvz + KV.z;
    }

    // ---- rolling: 5/7 slope pull + rolling friction against the support
    b.supported = fJn > 0;
    if (fJn > 0) {
      const nl = Math.hypot(fnx, fny, fnz) || 1;
      const nx = fnx / nl, ny = fny / nl, nz = fnz / nl;
      b.nx = nx; b.ny = ny; b.nz = nz; b.surf = fMat;
      // tangential gravity g_t = g - (g.n)n with g = (0,-G,0); remove (1 - ROLL_K) of it
      const k = (1 - ROLL_K) * DT;
      b.vx -= k * (G * ny * nx); b.vy -= k * (-G + G * ny * ny); b.vz -= k * (G * ny * nz);
      const S = SURFACES[fMat];
      const vn = b.vx * nx + b.vy * ny + b.vz * nz;
      const tx = b.vx - vn * nx, ty = b.vy - vn * ny, tz = b.vz - vn * nz;
      const ts = Math.hypot(tx, ty, tz);
      const dec = S.roll * Math.min(fJn, JN_CAP) + S.drag * ts * DT;
      if (dec >= ts) { b.vx -= tx; b.vy -= ty; b.vz -= tz; }
      else if (ts > 1e-9) { const q = dec / ts; b.vx -= tx * q; b.vy -= ty * q; b.vz -= tz * q; }
    }
    // boost pad: push along its arrow up to BOOST_MAX
    if (boostTri >= 0 && this.dirs) {
      const o = boostTri * 3, dx = this.dirs[o], dy = this.dirs[o + 1], dz = this.dirs[o + 2];
      const along = b.vx * dx + b.vy * dy + b.vz * dz;
      if (along < BOOST_MAX) { const k = Math.min(BOOST_ACC * DT, BOOST_MAX - along); b.vx += dx * k; b.vy += dy * k; b.vz += dz * k; }
      if (!b.onBoost) b.events.push({ type: 'boost' });
      b.onBoost = true;
    } else if (b.supported) b.onBoost = false;

    // ---- cup capture, out of bounds, rest
    if (c) {
      const dh = Math.hypot(b.px - c.x, b.pz - c.z);
      if (dh < CUP_R && b.py < c.y - R * 1.05) { b.state = 'cup'; b.events.push({ type: 'cup' }); return; }
    }
    if (b.py < this.killY) { b.state = 'oob'; b.events.push({ type: 'oob' }); return; }
    sp = Math.hypot(b.vx, b.vy, b.vz);
    if (b.supported && sp < STOP_SPEED) {
      b.restT += DT;
      if (b.restT >= STOP_TIME) { b.vx = b.vy = b.vz = 0; b.state = 'rest'; b.events.push({ type: 'rest' }); }
    } else b.restT = 0;
    if (b.moveT > SHOT_TIMEOUT) { b.vx = b.vy = b.vz = 0; b.state = 'rest'; b.events.push({ type: 'rest', timeout: true }); }
  }
}

// Helper for kinematic bodies: reach = bounding radius of its shapes around the pivot.
export function kinematicBody(def) {
  let reach = 0;
  for (const s of def.shapes) {
    const ext = s.kind === 'box' ? Math.hypot(...s.h) : Math.hypot(s.r, s.hh);
    reach = Math.max(reach, Math.hypot(...s.c) + ext);
  }
  return { omega: 0, phase: 0, axis: [0, 1, 0], basis: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], ...def, reach };
}
