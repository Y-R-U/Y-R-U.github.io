import { V3, Quat, clamp, moveTo, DEG, KT, FT } from './vmath.js';
import { packState, applyRemote } from './netstate.js';

const RHO = 1.225, G = 9.81;

// Control conventions: elevator +1 = stick back (nose up), aileron +1 = roll right, rudder +1 = yaw right.
export const TYPES = {
  c172: {
    mass: 1050, wingArea: 16.2, span: 11, length: 8.3,
    CL0: 0.32, CLa: 5.2, alphaStall: 0.27, flapCL: 0.65, CD0: 0.032, flapCD: 0.05, K: 0.055, CY: 0.9,
    thrustMax: 2700, thrustV0: 115, idle: 0.04,
    maxPitchRate: 0.7, maxRollRate: 1.05, maxYawRate: 0.45,
    kAlpha: 2.4, alphaTrim: 0.04, kBeta: 2.2, kBank: 0.06, kTrack: 5.5, vRef: 45,
    inertia: [1350, 2200, 1150],          // pitch(x), yaw(y), roll(z)
    gear: { main: [1.25, 0.32], nose: -1.62, kMain: 42000, kNose: 22000, cMain: 3800, cNose: 2400, maxSteer: 0.55 },
    vr: 55 * KT, vy: 74 * KT, vapp: 65 * KT, vcruise: 95 * KT, vs0: 44 * KT,
    flapNotches: [0, 1 / 3, 2 / 3, 1],
  },
};

const ROLL_MU = { runway: 0.02, taxiway: 0.022, apron: 0.022, grass: 0.075, building: 0.3, water: 0.6 };

let nextId = 1;

export class Aircraft {
  constructor(opts = {}) {
    this.id = opts.id || `ac${nextId++}`;
    this.type = opts.type || 'c172';
    this.P = TYPES[this.type] || TYPES.c172;
    const d = opts.dims || {};
    this.dims = { length: d.length || this.P.length, span: d.span || this.P.span, height: d.height || 2.7, gearHeight: d.gearHeight || 1.2 };
    this.pos = new V3(); this.vel = new V3(); this.q = new Quat(); this.w = new V3();
    this.prevPos = new V3(); this.prevQ = new Quat();
    this.ctl = { aileron: 0, elevator: 0, rudder: 0, throttle: 0, flaps: 0, brake: 0 };
    this.eng = 0; this.flapsPos = 0;
    this.events = [];
    this.wind = new V3();
    this._buildPoints();
    this.reset();
  }

  _buildPoints() {
    const gh = this.dims.gearHeight, g = this.P.gear, L = this.dims.length, S = this.dims.span;
    const sMain = 0.8 * this.P.mass * G / 2 / g.kMain, sNose = 0.2 * this.P.mass * G / g.kNose;
    this.wheels = [
      { r: new V3(-g.main[0], -(gh + sMain), g.main[1]), k: g.kMain, c: g.cMain, nose: false, contact: false, load: 0 },
      { r: new V3(g.main[0], -(gh + sMain), g.main[1]), k: g.kMain, c: g.cMain, nose: false, contact: false, load: 0 },
      { r: new V3(0, -(gh + sNose), g.nose), k: g.kNose, c: g.cNose, nose: true, contact: false, load: 0 },
    ];
    this.hardPoints = [
      { r: new V3(0, -0.2, -L * 0.47), name: 'nose' },
      { r: new V3(0, 0.6, L * 0.55), name: 'tail' },
      { r: new V3(-S / 2, 0.7, 0), name: 'left wingtip' },
      { r: new V3(S / 2, 0.7, 0), name: 'right wingtip' },
      { r: new V3(0, -gh * 0.55, -0.2), name: 'belly' },
    ];
    this.tailSkid = new V3(0, -gh * 0.2, L * 0.5);
  }

  reset() {
    this.crashed = false; this.crashReason = ''; this.onGround = false; this.mainsDown = false; this.noseDown = false;
    this.airTime = 0; this.groundTime = 0; this.lastTouchdown = null; this.bounces = 0;
    this.stalled = false; this.surface = 'grass'; this.groundY = 0; this.time = 0;
    this.w.set(0, 0, 0);
  }

  // Put the aircraft somewhere: { x, z, y?, alt? (m AGL), heading (deg), pitch, roll (rad), speed (m/s) }.
  place(o, env) {
    this.reset();
    const gy = env ? env.groundHeightAt(o.x, o.z) : 0;
    const air = o.alt != null && o.alt > 2;
    const y = o.y != null ? o.y : air ? gy + o.alt : gy + this.dims.gearHeight;
    this.pos.set(o.x, y, o.z);
    this.q.setFromHPR(o.heading || 0, o.pitch || 0, o.roll || 0);
    const sp = o.speed || 0;
    this.vel.set(0, 0, -sp).applyQuat(this.q);
    this.eng = this.ctl.throttle = o.throttle != null ? o.throttle : air ? 0.6 : 0;
    this.flapsPos = this.ctl.flaps = o.flaps || 0;
    this.onGround = this.mainsDown = !air;
    this.prevPos.copy(this.pos); this.prevQ.copy(this.q);
    this._derive(env);
  }

  setControls(c) { Object.assign(this.ctl, c); }

  emit(type, data) { this.events.push({ type, t: this.time, ...data }); if (this.events.length > 40) this.events.shift(); }

  step(dt, env) {
    this.prevPos.copy(this.pos); this.prevQ.copy(this.q);
    if (this.crashed) { this.vel.scale(0.9); this.w.scale(0.9); return; }
    this.time += dt;
    const P = this.P, c = this.ctl;
    this.eng = moveTo(this.eng, clamp(c.throttle, 0, 1), dt * 1.2);
    this.flapsPos = moveTo(this.flapsPos, clamp(c.flaps, 0, 1), dt * 0.35);

    const F = _f.set(0, 0, -1).applyQuat(this.q), U = _u.set(0, 1, 0).applyQuat(this.q), R = _r.set(1, 0, 0).applyQuat(this.q);
    const va = _va.copy(this.vel).sub(this.wind), V = va.len();
    const vb = _vb.copy(va).applyQuatInv(this.q);
    const alpha = V > 2 ? Math.atan2(-vb.y, -vb.z) : 0, beta = V > 2 ? Math.asin(clamp(vb.x / V, -1, 1)) : 0;
    const qd = 0.5 * RHO * V * V;
    const force = _force.set(0, -P.mass * G, 0), torque = _torque.set(0, 0, 0);

    const agl = this.pos.y - this.groundY - this.dims.gearHeight;
    let CL, stalled = false;
    const aS = P.alphaStall - this.flapsPos * 0.025;
    const lin = (a) => P.CL0 + P.CLa * a + this.flapsPos * P.flapCL;
    if (alpha > aS) { stalled = true; CL = Math.max(lin(aS) * (1 - (alpha - aS) * 2.2), 0.9 * Math.sin(2 * alpha)); }
    else if (alpha < -0.25) { CL = Math.min(lin(-0.25) * (1 - (-0.25 - alpha) * 2.2), 0.9 * Math.sin(2 * alpha)); }
    else CL = lin(alpha);
    this.stalled = stalled && !this.mainsDown;
    if (V > 1) {
      const ge = agl < this.dims.span ? 0.55 + 0.45 * Math.max(0, agl) / this.dims.span : 1;
      const CD = P.CD0 + this.flapsPos * P.flapCD + P.K * ge * CL * CL + (Math.abs(alpha) > aS ? 1.4 * Math.sin(alpha) ** 2 : 0);
      const vdir = _vd.copy(va).scale(1 / V);
      const ldir = _ld.crossVectors(R, vdir).normalize();
      force.addScaled(ldir, qd * P.wingArea * CL);
      force.addScaled(vdir, -qd * P.wingArea * CD);
      force.addScaled(R, -qd * P.wingArea * P.CY * beta * 0.25);
    }
    const thrust = P.thrustMax * (P.idle + (1 - P.idle) * this.eng) * clamp(1 - V / P.thrustV0, -0.15, 1);
    force.addScaled(F, thrust);

    // Wheels: spring/damper normal force, rolling+brake friction, lateral grip, nosewheel steering.
    const surf = env.surfaceAt(this.pos.x, this.pos.z);
    this.surface = surf;
    this.groundY = env.groundHeightAt(this.pos.x, this.pos.z);
    const wasDown = this.mainsDown;
    let mains = 0, nose = false, gearOver = false;
    const wW = _ww.copy(this.w).applyQuat(this.q);
    for (const wh of this.wheels) {
      const rw = _rw.copy(wh.r).applyQuat(this.q);
      const px = this.pos.x + rw.x, py = this.pos.y + rw.y, pz = this.pos.z + rw.z;
      const gy = env.groundHeightAt(px, pz);
      const comp = gy - py;
      wh.contact = comp > 0; wh.load = 0;
      if (!wh.contact) continue;
      const pv = _pv.crossVectors(wW, rw).add(this.vel);
      let N = wh.k * comp - wh.c * pv.y;
      if (comp > 0.32) { N += (comp - 0.32) * wh.k * 8; gearOver = true; }
      N = Math.max(0, N);
      wh.load = N;
      if (wh.nose) nose = true; else mains++;
      const fwd = _wf.set(F.x, 0, F.z);
      if (wh.nose) {
        const steer = -c.rudder * P.gear.maxSteer * clamp(1.2 - V / 30, 0.15, 1);
        const cs = Math.cos(steer), sn = Math.sin(steer);
        fwd.set(fwd.x * cs + fwd.z * sn, 0, -fwd.x * sn + fwd.z * cs);
      }
      fwd.normalize();
      const side = _ws.set(-fwd.z, 0, fwd.x);
      const vl = pv.x * fwd.x + pv.z * fwd.z, vs = pv.x * side.x + pv.z * side.z;
      const mu = (ROLL_MU[surf] ?? 0.05) + (wh.nose ? 0 : c.brake * 0.55);
      const fl = -clamp(vl / 0.4, -1, 1) * mu * N;
      const fs = -clamp(vs * 2.2, -1, 1) * 0.85 * N;
      const wf = _wfo.set(fwd.x * fl + side.x * fs, N, fwd.z * fl + side.z * fs);
      force.add(wf);
      torque.add(_tq.crossVectors(rw, wf));
    }
    this.mainsDown = mains > 0;
    this.noseDown = nose;
    this.onGround = mains > 0 || nose;

    // Aerodynamic rotation: rate tracking toward what the surfaces + stability ask for.
    const eff = clamp(V / P.vRef, 0, 1.4);
    const effE = Math.max(eff, this.eng * 0.45 * (this.onGround ? 1 : 0.4));
    const bank = Math.atan2(-R.y, U.y);
    let tq = c.elevator * P.maxPitchRate * effE - P.kAlpha * (alpha - P.alphaTrim) * eff;
    if (this.stalled) tq -= 0.35 * eff;
    let ty = -(c.rudder * P.maxYawRate * effE + P.kBeta * beta * eff);
    let tz = -(c.aileron * P.maxRollRate * eff) + (this.onGround ? 0 : P.kBank * bank * eff * (Math.abs(bank) < 1.2 ? 1 : 0));
    if (this.stalled) tz += Math.sin(this.time * 1.7 + this.pos.x) * 0.5 * eff;
    const kt = P.kTrack * (this.onGround ? 0.35 + eff : Math.max(0.4, eff));
    const ax = (tq - this.w.x) * kt, ay = (ty - this.w.y) * kt, az = (tz - this.w.z) * kt;
    const tb = torque.applyQuatInv(this.q);
    if (this.onGround) tb.x += c.elevator * qd * P.wingArea * 0.09 * (1 + this.eng * 0.3);
    const I = P.inertia;
    this.w.x += (ax + tb.x / I[0]) * dt;
    this.w.y += (ay + tb.y / I[1]) * dt;
    this.w.z += (az + tb.z / I[2]) * dt;

    this.vel.addScaled(force, dt / P.mass);
    this.pos.addScaled(this.vel, dt);
    this.q.integrateBody(this.w, dt);

    if (this.onGround) { this.groundTime += dt; this.airTime = 0; } else { this.airTime += dt; this.groundTime = 0; }
    if (this.mainsDown && !wasDown && this._lastAirTime > 0.6) this._touchdown(gearOver);
    else if (gearOver && this._vsWas < -4.5) this._crash('gear collapsed');
    if (!this.onGround) this._lastAirTime = this.airTime;
    else if (this.groundTime > 1.5) this._lastAirTime = 0;
    this._vsWas = this.vel.y;

    this._checkCrash(env, surf);
    this._derive(env, alpha, beta, V, bank);
  }

  _touchdown(gearOver) {
    const vs = this._vsWas ?? this.vel.y;
    const fpm = -vs / FT * 60;
    const bounce = this.lastTouchdown && this.time - this.lastTouchdown.t < 4;
    let grade = fpm < 250 ? 'butter' : fpm < 500 ? 'smooth' : fpm < 800 ? 'firm' : fpm < 1100 ? 'hard' : 'crash';
    this.lastTouchdown = { t: this.time, fpm, grade, x: this.pos.x, z: this.pos.z, surface: this.surface, speed: this.speed };
    if (bounce) this.bounces++; else this.bounces = 0;
    this.emit('touchdown', { fpm: Math.round(fpm), grade, bounce: !!bounce, surface: this.surface });
    if (grade === 'crash' || (gearOver && fpm > 900)) this._impact('touchdown', 'hard landing', { n: [0, 1, 0], pen: 0, onGear: false, speedKt: -vs / KT });
    else if (grade === 'hard') this.emit('hardlanding', { fpm: Math.round(fpm) });
  }

  // Something solid was hit. Without an impactHandler (SCORE protection modes) that is a crash; with one, the
  // handler decides: 'bounce'/'damage' reflect the velocity (impossiRubber), 'destroyed' crashes.
  _impact(kind, reason, { n = [0, 1, 0], pen = 0, onGear = false, other = null, speedKt } = {}) {
    if (!this.impactHandler) return this._crash(reason);
    if (this.time - (this._lastImpact ?? -9) < 0.35) { this._push(n, pen); return; }
    this._lastImpact = this.time;
    const vn = this.vel.x * n[0] + this.vel.y * n[1] + this.vel.z * n[2];
    const r = this.impactHandler({ kind, reason, speedKt: speedKt ?? Math.max(Math.abs(vn), this.speed * 0.5) / KT, onGear, other, ac: this });
    if (!r || r.result === 'destroyed') return this._crash(reason);
    const e = r.restitution ?? 0.5;
    if (vn < 0) this.vel.addScaled(_n.set(n[0], n[1], n[2]), -(1 + e) * vn);
    if (n[1] > 0.5 && this.vel.y < 2) this.vel.y = Math.max(this.vel.y, 2 + e * 4);
    this._push(n, pen);
    if (r.spinDegPerS) this.w.y += (r.spinDegPerS * DEG);
    this.w.scale(0.5);
    this.emit('impact', { result: r.result, reason, kind, restitution: e, other });
  }
  _push(n, pen) { if (pen > 0) this.pos.addScaled(_n.set(n[0], n[1], n[2]), pen + 0.05); }

  _crash(reason) {
    if (this.crashed) return;
    this.crashed = true; this.crashReason = reason;
    this.emit('crash', { reason, speed: this.speed });
  }

  _checkCrash(env, surf) {
    if (this.onGround && (surf === 'water' || surf === 'building') && this.speed > 3) return this._impact('surface', surf === 'water' ? 'ditched in the water' : 'hit a building', { n: [-this.vel.x, 0, -this.vel.z].map((v) => v / (this.gs || 1)), pen: 1 });
    for (const hp of this.hardPoints) {
      const r = _rw.copy(hp.r).applyQuat(this.q);
      const x = this.pos.x + r.x, y = this.pos.y + r.y, z = this.pos.z + r.z;
      const gy = env.groundHeightAt(x, z);
      if (y < gy) return this._impact('ground', `${hp.name} hit the ground`, { n: [0, 1, 0], pen: gy - y });
      if (env.colliders) for (const b of env.colliders) {
        if (x > b.min[0] && x < b.max[0] && y > b.min[1] && y < b.max[1] && z > b.min[2] && z < b.max[2]) {
          const d = [x - b.min[0], b.max[0] - x, y - b.min[1], b.max[1] - y, z - b.min[2], b.max[2] - z];
          const i = d.indexOf(Math.min(...d));
          const n = [[-1, 0, 0], [1, 0, 0], [0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1]][i];
          return this._impact('collider', `hit the ${b.kind || 'building'}`, { n, pen: d[i] });
        }
      }
    }
    const ts = _rw.copy(this.tailSkid).applyQuat(this.q);
    if (this.pos.y + ts.y < this.groundY && !this._tailStruck) { this._tailStruck = true; this.emit('tailstrike', {}); }
    else if (this.pos.y + ts.y > this.groundY + 0.3) this._tailStruck = false;
    if (this.mainsDown && Math.abs(this.bank) > 0.5) {
      this._impact('ground', 'cartwheeled', { n: [0, 1, 0], pen: 0.3 });
      if (!this.crashed) this.w.z += this.bank * 2;
    }
  }

  _derive(env, alpha = 0, beta = 0, V = this.vel.len(), bank) {
    const F = _f.set(0, 0, -1).applyQuat(this.q), U = _u.set(0, 1, 0).applyQuat(this.q), R = _r.set(1, 0, 0).applyQuat(this.q);
    this.alpha = alpha; this.beta = beta;
    this.speed = V;
    this.gs = Math.hypot(this.vel.x, this.vel.z);
    this.pitch = Math.asin(clamp(F.y, -1, 1));
    this.bank = bank ?? Math.atan2(-R.y, U.y);
    this.heading = ((Math.atan2(F.x, -F.z) / DEG) + 360) % 360;
    this.track = this.gs > 2 ? ((Math.atan2(this.vel.x, -this.vel.z) / DEG) + 360) % 360 : this.heading;
    this.vs = this.vel.y;
    if (env) this.groundY = env.groundHeightAt(this.pos.x, this.pos.z);
    this.agl = this.pos.y - this.groundY - this.dims.gearHeight;
    this.alt = this.pos.y;
  }

  // Values for rig.updateInstruments.
  instruments() {
    return {
      airspeed: this.speed / KT, altitude: this.alt / FT, vsi: this.vs / FT * 60, heading: this.heading,
      pitch: this.pitch, roll: this.bank, rpm: 600 + this.eng * 2100 + Math.min(300, this.speed * 4),
      slip: clamp(this.beta * 4, -1, 1), flaps: this.flapsPos,
    };
  }

  // Online: 32-byte snapshot of this plane / drive it from received snapshots instead of simulating.
  packState(opts) { return packState(this, opts); }
  applyRemote(samples, renderMs) { this.remote = true; return applyRemote(this, samples, renderMs); }

  // Rendering pose interpolated between the last two fixed steps.
  pose(t, outPos, outQuat) {
    outPos.copy(this.prevPos).lerp(this.pos, t);
    outQuat.slerpQuats(this.prevQ, this.q, t);
  }
}

const _f = new V3(), _u = new V3(), _r = new V3(), _va = new V3(), _vb = new V3(), _force = new V3(), _torque = new V3();
const _vd = new V3(), _ld = new V3(), _ww = new V3(), _rw = new V3(), _pv = new V3(), _wf = new V3(), _ws = new V3();
const _wfo = new V3(), _tq = new V3(), _n = new V3();
