import { clamp, lerp, DEG, KT, wrap180, bearing, moveTo } from './vmath.js';
import { runwayEnd, allRunwayEnds, toRunway, fromRunway, taxiPath, GLIDE_DEG, AIM_DIST, FAF_DIST, onRunway, circuitLegs, segInter } from './routes.js';
import { RUNWAYS, HOLD_OFFSET, threshold } from '../world/layout.js';

const G = 9.81, RHO = 1.225, TANG = Math.tan(GLIDE_DEG * DEG);
const AXES = ['aileron', 'elevator', 'rudder', 'throttle', 'flaps', 'brake'];

// Flies an Aircraft along a route of legs (see routes.js). Can be handed the plane in ANY state: replan() works out
// where it is and rejoins the route — onto final if it happens to be lined up with a runway, else the nearest leg.
export class Autopilot {
  constructor(ac, { traffic = null } = {}) {
    this.ac = ac; this.traffic = traffic;
    this.route = null; this.i = 0; this.cur = null; this.legT = 0; this.sub = '';
    this.engaged = true; this.done = false; this.recovering = false; this.overridden = false;
    this.out = { aileron: 0, elevator: 0, rudder: 0, throttle: 0, flaps: 0, brake: 1 };
    this.t = {};
    this.iSpeed = 0; this.iPitch = 0; this.iGround = 0;
    this.phase = 'IDLE'; this.override = null; this.waitAhead = 0;
    this.events = [];
  }

  setRoute(route, { start = 0 } = {}) {
    this.route = route; this.i = start; this.done = false; this.override = null;
    this._begin(true);
  }

  get leg() {
    const l = this.route?.legs[this.i];
    return l && this.override ? { ...l, ...this.override } : l;
  }

  _emit(type, data) { this.events.push({ type, ...data }); if (this.events.length > 30) this.events.shift(); }

  _next() {
    this.override = null;
    if (++this.i >= this.route.legs.length) {
      if (this.route.loop == null) { this.done = true; this.phase = 'DONE'; this.i = this.route.legs.length - 1; return; }
      this.i = this.route.loop;
    }
    this._begin(false);
  }

  _begin(fromCurrent) {
    const ac = this.ac, leg = this.leg;
    this.legT = 0; this.sub = ''; this.iGround = 0; this.waitAhead = 0;
    const cur = (this.cur = { fromCurrent });
    if (!leg) return;
    if (leg.kind === 'despawn') { this.done = true; this.phase = 'GONE'; return; }
    if (leg.kind === 'taxi') {
      let dest = leg.dest;
      if (dest.stand === 'auto') dest = { stand: this.traffic?.claimStand(ac) || 'S1' };
      cur.dest = dest;
      cur.path = taxiPath(ac.pos.x, ac.pos.z, ac.heading, dest).map(([x, z]) => ({ x, z, a: 0 }));
      cur.k = 0;
      this._prepCrossings();
    } else if (leg.kind === 'fly') {
      this._buildFlyPath(fromCurrent);
    } else if (leg.kind === 'takeoff') {
      const e = (cur.e = runwayEnd(leg.end));
      const p = toRunway(e, ac.pos.x, ac.pos.z);
      const herr = Math.abs(wrap180(e.hdg - ac.heading));
      if (!ac.onGround) this.sub = 'climb';
      else if (Math.abs(p.l) < 5 && p.s > -30 && p.s < e.len * 0.45 && herr < 12) this.sub = ac.speed > 10 || this._mayEnterRunway(e) ? 'roll' : 'ready';
      else if (onRunway(ac.pos.x, ac.pos.z) && p.s < e.len * 0.45) this._lineup(e);
      else if (Math.hypot(...this._d(this._holdOrThr(e))) < 90 && this._mayEnterRunway(e)) this._lineup(e);
      else {
        this.sub = 'taxi';
        cur.path = taxiPath(ac.pos.x, ac.pos.z, ac.heading, { hold: leg.end }).map(([x, z]) => ({ x, z, a: 0 }));
        cur.k = 0;
        this._prepCrossings();
      }
      cur.line = [{ x: e.thr[0], z: e.thr[1], a: 0 }, { x: e.far[0], z: e.far[1], a: 0 }];
    } else if (leg.kind === 'approach') {
      const e = (cur.e = runwayEnd(leg.end));
      const [bx, bz] = fromRunway(e, -9000, 0), [ax, az] = fromRunway(e, AIM_DIST, 0);
      cur.path = [{ x: bx, z: bz, a: 0 }, { x: ax, z: az, a: 0 }, { x: e.far[0], z: e.far[1], a: 0 }];
      cur.k = 0;
      const p = toRunway(e, ac.pos.x, ac.pos.z);
      this.extendDW = null;
      if (ac.onGround) this.sub = 'rollout';
      else if (p.s > -150 && ac.agl > 12) this.sub = 'goaround';
      else this.sub = 'final';
    }
  }

  _d(pt) { return [pt[0] - this.ac.pos.x, pt[1] - this.ac.pos.z]; }
  _holdOrThr(e) { return e.thr; }

  _lineup(e) {
    const ac = this.ac, p = toRunway(e, ac.pos.x, ac.pos.z);
    const [lx, lz] = fromRunway(e, Math.max(p.s, 0) + 22, 0);
    this.sub = 'lineup';
    this.cur.path = [{ x: ac.pos.x, z: ac.pos.z, a: 0 }, { x: lx, z: lz, a: 0 }, { x: e.far[0], z: e.far[1], a: 0 }];
    this.cur.k = 0;
  }

  _buildFlyPath(fromCurrent) {
    const ac = this.ac, legs = this.route.legs, cur = this.cur;
    let start;
    const prev = legs[this.i - 1];
    if (!fromCurrent && prev && prev.kind === 'fly') start = { x: prev.to[0], z: prev.to[2], a: prev.to[1] };
    else start = { x: ac.pos.x, z: ac.pos.z, a: ac.alt };
    const path = [start];
    for (let j = this.i; j < legs.length; j++) {
      const l = legs[j];
      const ex = this.extendDW;
      if (l.kind === 'fly') {
        let [x, a, z] = l.to;
        if (ex && l.ext && l.end === ex.end) { const u = runwayEnd(l.end).u; x -= u[0] * ex.metres; z -= u[1] * ex.metres; }
        path.push({ x, z, a });
        continue;
      }
      if (l.kind === 'approach') {
        const e = runwayEnd(this.override?.end && j === this.i ? this.override.end : l.end);
        const fd = FAF_DIST + (ex && ex.end === e.id ? ex.metres : 0);
        const [fx, fz] = fromRunway(e, -fd, 0), [ax, az] = fromRunway(e, AIM_DIST, 0);
        path.push({ x: fx, z: fz, a: e.elev + Math.min(fd + AIM_DIST, FAF_DIST + 600) * TANG, appr: true }, { x: ax, z: az, a: e.elev, appr: true });
      }
      break;
    }
    if (path.length === 2 && !legs[this.i + 1]) {
      const a = path[0], b = path[1];
      path.push({ x: b.x + (b.x - a.x), z: b.z + (b.z - a.z), a: b.a });
    }
    cur.path = path; cur.k = 0;
  }

  // Pure pursuit along a polyline of {x,z,a}. Returns lookahead target and the projection.
  _pursue(path, L) {
    const ac = this.ac, x = ac.pos.x, z = ac.pos.z, cur = this.cur;
    const proj = (k) => {
      const a = path[k], b = path[k + 1];
      const dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz || 1;
      const t = ((x - a.x) * dx + (z - a.z) * dz) / L2, tc = clamp(t, 0, 1);
      const px = a.x + dx * tc, pz = a.z + dz * tc;
      return { t, px, pz, d: Math.hypot(x - px, z - pz), len: Math.sqrt(L2), xtk: ((x - a.x) * -dz + (z - a.z) * dx) / Math.sqrt(L2) * -1 };
    };
    let k = cur.k || 0;
    while (k < path.length - 2) {
      const p0 = proj(k), p1 = proj(k + 1);
      if (p0.t >= 1 || (p1.d < p0.d && p1.t > 0)) k++; else break;
    }
    const advanced = k - (cur.k || 0);
    cur.k = k;
    const pr = proj(k);
    let rem = L, sx = pr.px, sz = pr.pz, tx = sx, tz = sz, i = k, found = false;
    while (i < path.length - 1) {
      const b = path[i + 1], d = Math.hypot(b.x - sx, b.z - sz);
      if (d >= rem) { tx = sx + (b.x - sx) * rem / d; tz = sz + (b.z - sz) * rem / d; found = true; break; }
      rem -= d; sx = b.x; sz = b.z; i++;
    }
    if (!found) {
      const a = path[path.length - 2], b = path[path.length - 1], len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      tx = b.x + (b.x - a.x) / len * rem; tz = b.z + (b.z - a.z) / len * rem;
    }
    let toEnd = (1 - clamp(pr.t, 0, 1)) * pr.len;
    for (let j = k + 1; j < path.length - 1; j++) toEnd += Math.hypot(path[j + 1].x - path[j].x, path[j + 1].z - path[j].z);
    const a = path[k], b = path[k + 1];
    return { k, advanced, t: pr.t, d: pr.d, xtk: pr.xtk, tx, tz, toEnd, segLen: pr.len,
      alt: lerp(a.a, b.a, clamp(pr.t, 0, 1)), slope: (b.a - a.a) / pr.len, hdg: bearing(ac.pos.x, ac.pos.z, tx, tz) };
  }

  // ---------- main ----------
  update(dt) {
    const ac = this.ac, t = (this.t = {});
    this.legT += dt;
    if (!this.route || ac.crashed) { this._idle(); return this.out; }
    if (this.done) { this._groundStop(t); this.phase = 'DONE'; return this._finish(dt); }
    const leg = this.leg;

    if (!ac.onGround && !this.recovering && !this.overridden && this._upset()) { this.recovering = true; this._emit('recovery', {}); }
    if (this.recovering) {
      if (ac.onGround || (Math.abs(ac.bank) < 0.3 && ac.speed > this._vstall() * 1.3 && ac.pitch > -0.2 && ac.pitch < 0.3)) {
        this.recovering = false; this.replan();
      } else {
        this.phase = 'RECOVERY';
        t.air = true; t.bank = 0; t.pitch = ac.speed < this._vstall() * 1.25 ? -0.1 : 0.04; t.thr = 1; t.flaps = this.out.flaps;
        return this._finish(dt);
      }
    }

    switch (leg.kind) {
      case 'taxi': this._taxi(t, leg); break;
      case 'hold': this._hold(t, leg); break;
      case 'park': this._park(t, leg); break;
      case 'takeoff': this._takeoff(t, leg); break;
      case 'fly': this._fly(t, leg); break;
      case 'approach': this._approach(t, leg); break;
      default: this._groundStop(t);
    }
    if (!ac.onGround && t.air && leg.kind === 'fly' && ac.agl < 45) t.vs = Math.max(t.vs ?? 0, 2.5);
    return this._finish(dt);
  }

  _vstall() {
    const P = this.ac.P;
    return Math.sqrt((2 * P.mass * G) / (RHO * P.wingArea * (P.CL0 + P.CLa * P.alphaStall + this.ac.flapsPos * P.flapCL)));
  }

  _upset() {
    const ac = this.ac;
    if (this.leg?.kind === 'approach' && (this.sub === 'flare' || this.sub === 'rollout')) return false;
    if (this.leg?.kind === 'takeoff' && this.sub !== 'climb') return false;
    return Math.abs(ac.bank) > 1.05 || ac.pitch > 0.55 || ac.pitch < -0.45 || (ac.speed < this._vstall() * 0.98 && ac.agl > 20) || ac.stalled;
  }

  _idle() { Object.assign(this.out, { aileron: 0, elevator: 0, rudder: 0, throttle: 0, brake: 1 }); this.phase = this.ac.crashed ? 'CRASHED' : 'IDLE'; }

  _setPhase(p) { if (p !== this.phase) { this.phase = p; this._emit('phase', { phase: p }); } }

  // ---------- legs ----------
  _taxi(t, leg) {
    const ac = this.ac;
    this._setPhase(leg.label || 'TAXI');
    const pr = this._pursue(this.cur.path, clamp(ac.speed * 2.4, 7, 22));
    let vt = leg.speed ?? 9;
    t.flaps = 0;
    const herr = Math.abs(wrap180(pr.hdg - ac.heading));
    if (herr > 25) vt = Math.min(vt, 3.5);
    const nk = this.cur.path[pr.k + 2];
    if (nk) {
      const b = this.cur.path[pr.k + 1], a = this.cur.path[pr.k];
      const turn = Math.abs(wrap180(bearing(b.x, b.z, nk.x, nk.z) - bearing(a.x, a.z, b.x, b.z)));
      const db = Math.hypot(b.x - ac.pos.x, b.z - ac.pos.z);
      if (turn > 30 && db < 30) vt = Math.min(vt, 4);
    }
    vt = Math.min(vt, Math.sqrt(2 * 0.7 * Math.max(0, pr.toEnd - 1.5)));
    vt = this._crossingLimit(pr, vt);
    if (this._blockedAhead(1 / 120) || this._holdingPos()) vt = 0;
    t.gHeading = pr.hdg; t.gSpeed = vt;
    if (pr.toEnd < 3 && ac.speed < 0.8) this._next();
  }

  // Runway crossings on a taxi path: stop HOLD_OFFSET short, cross when cleared (ATC) or when the runway is free.
  _prepCrossings(extra) {
    const cur = this.cur, path = cur.path, ac = this.ac;
    const here = onRunway(ac.pos.x, ac.pos.z, 10);
    const out = [];
    let along = 0;
    for (let k = 0; k < path.length - 1; k++) {
      const a = path[k], b = path[k + 1], len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      for (const rw of RUNWAYS) {
        if (rw === here) continue;
        const h = segInter([a.x, a.z], [b.x, b.z], threshold(rw, rw.ends[0]), threshold(rw, rw.ends[1]));
        if (!h || (k === path.length - 2 && h[0] > 0.97)) continue;
        const [ux, uz] = runwayEnd(rw.ends[0]).u;
        const sinA = Math.abs(((b.x - a.x) * uz - (b.z - a.z) * ux) / len);
        out.push({ rw: rw.id, at: along + h[0] * len - (HOLD_OFFSET ?? 50) / Math.max(sinA, 0.3), cleared: false, wait: 0 });
      }
      along += len;
    }
    cur.pathLen = along;
    cur.crossings = out.sort((p, q) => p.at - q.at);
  }

  _crossingLimit(pr, vt) {
    const cur = this.cur;
    if (!cur.crossings?.length) return vt;
    const done = cur.pathLen - pr.toEnd;
    const c = cur.crossings.find((x) => !x.cleared && x.at > done - 4);
    if (!c) return vt;
    const d = c.at - done;
    if (d > 40) return vt;
    if (this.crossClear?.has(c.rw)) { c.cleared = true; this.crossClear.delete(c.rw); return vt; }
    const free = !this.traffic || this.traffic.runwayFree(c.rw, this.ac);
    if (d < 4 && this.ac.speed < 1) c.wait += 1 / 120;
    if (free && (!this.__atcGate || c.wait > 25)) { c.cleared = true; return vt; }
    this._setPhase('HOLD SHORT ' + c.rw);
    return Math.min(vt, Math.sqrt(2 * 0.7 * Math.max(0, d - 0.5)));
  }

  _holdingPos() {
    if (!this.holdPos) return false;
    if (this.ac.time > this.holdPos) { this.holdPos = 0; return false; }
    this._setPhase('HOLDING POSITION');
    return true;
  }

  // ---------- public commands (ATC / game) ----------
  goAround(reason = 'go around') {
    if (this.leg?.kind === 'approach' && !this.ac.onGround && this.sub !== 'goaround') { this._goAround(reason); return true; }
    return false;
  }
  // Push this circuit's base turn out by `metres` (total, not cumulative). 0 cancels.
  extendDownwind(metres, end) {
    end = end || this.route?.legs.find((l) => l.ext)?.end;
    this.extendDW = metres > 0 ? { metres, end } : null;
    if (this.leg?.kind === 'fly') { this._buildFlyPath(true); }
    this._emit('extend', { metres, end });
  }
  rejectTakeoff(reason = 'rejected') {
    if (this.leg?.kind !== 'takeoff' || !this.ac.onGround || !['lineup', 'roll', 'rotate', 'ready'].includes(this.sub)) return false;
    this.sub = 'reject'; this._emit('reject', { reason });
    return true;
  }
  holdPosition(reason = 'hold', secs = 30) { this.holdPos = this.ac.time + secs; this._emit('holdposition', { reason }); }
  clearCrossing(runway) { (this.crossClear ||= new Set()).add(runway); this.holdPos = 0; }
  setTaxiRoute(cmd) {
    this.holdPos = 0;
    const dest = cmd.dest === 'stand' && cmd.stand ? { stand: cmd.stand } : cmd.runwayEnd ? { hold: cmd.runwayEnd } : null;
    const l = this.leg;
    if (!dest || !l) return false;
    if (dest.stand) this.traffic?.standOwner.set(dest.stand, this.ac);
    if (l.kind === 'taxi') { this.override = { ...(this.override || {}), dest }; this._begin(true); }
    else if (l.kind === 'takeoff' && this.sub === 'taxi' && dest.hold) { this.override = { end: dest.hold }; this._begin(true); }
    else return false;
    return true;
  }

  _mayEnterRunway(e) {
    if (this.overridden) return true;
    if (this.gate) return this.gate({ kind: 'hold', end: e.id, takeoff: true }, this);
    return !this.traffic || this.traffic.runwayClear(e.id, this.ac);
  }

  _blockedAhead(dt) {
    if (!this.traffic) return false;
    const d = this.traffic.trafficAhead(this.ac, 42);
    void dt;
    if (d == null) { this.waitAhead = 0; return false; }
    this.waitAhead += dt;
    return this.waitAhead < 25;
  }

  _hold(t, leg) {
    this._setPhase(leg.label || 'HOLD');
    this._groundStop(t);
    let ok = this.legT >= (leg.seconds ?? 0);
    if (ok && leg.untilClear && this.traffic) ok = this.traffic.runwayClear(leg.end, this.ac);
    if (ok && this.gate) ok = this.gate(leg, this);
    if (ok) this._next();
  }

  _park(t, leg) {
    this._setPhase(leg.label || 'PARKED');
    this._groundStop(t);
    if (this.legT >= (leg.seconds ?? 20)) { this.traffic?.releaseStand?.(this.ac); this._next(); }
  }

  _groundStop(t) { t.gSpeed = 0; t.gHeading = this.ac.heading; t.thr = 0; }

  _takeoff(t, leg) {
    const ac = this.ac, e = this.cur.e, P = ac.P;
    if (this.sub === 'taxi') {
      this._setPhase('TAXI');
      const pr = this._pursue(this.cur.path, clamp(ac.speed * 2.4, 7, 22));
      let vt = Math.min(9, Math.sqrt(2 * 0.7 * Math.max(0, pr.toEnd - 1.5)));
      vt = this._crossingLimit(pr, vt);
      t.gHeading = pr.hdg; t.gSpeed = this._blockedAhead(1 / 120) || this._holdingPos() ? 0 : vt;
      if (pr.toEnd < 4 && ac.speed < 1) {
        if (this._mayEnterRunway(e)) this._lineup(e); else this._setPhase('HOLD SHORT');
      }
      return;
    }
    if (this.sub === 'reject') {
      this._setPhase('REJECTED TAKEOFF');
      t.gHeading = ac.heading; t.gSpeed = 0; t.thr = 0; t.brakeOverride = 1;
      if (ac.speed < 1) {
        this.sub = 'taxi';
        this.cur.path = taxiPath(ac.pos.x, ac.pos.z, ac.heading, { hold: e.id }).map(([x, z]) => ({ x, z, a: 0 }));
        this.cur.k = 0; this._prepCrossings();
      }
      return;
    }
    if (this.sub === 'ready') {
      this._setPhase('LINED UP');
      this._groundStop(t);
      if (this._mayEnterRunway(e)) { this.sub = 'roll'; this._emit('takeoffroll', { end: e.id }); }
      return;
    }
    if (this.sub === 'lineup') {
      this._setPhase('LINE UP');
      const pr = this._pursue(this.cur.path, 13);
      t.gHeading = pr.hdg; t.gSpeed = 4.5; t.flaps = 0;
      const p = toRunway(e, ac.pos.x, ac.pos.z);
      if (Math.abs(p.l) < 2.5 && Math.abs(wrap180(e.hdg - ac.heading)) < 6) { this.sub = 'roll'; this.cur.k = 0; this._emit('takeoffroll', { end: e.id }); }
      return;
    }
    const pr = this._pursue(this.cur.line, Math.max(30, ac.speed * 2.6));
    if (this.sub === 'roll' && ac.speed < 8 && !this._mayEnterRunway(e)) { this.sub = 'ready'; return this._takeoff(t, leg); }
    if (this.sub === 'roll') {
      this._setPhase('TAKEOFF ROLL');
      t.gHeading = pr.hdg; t.gSpeed = 99; t.thr = 1; t.flaps = 0; t.elev = -0.05;
      if (ac.speed >= P.vr) this.sub = 'rotate';
      return;
    }
    if (this.sub === 'rotate') {
      this._setPhase('ROTATE');
      t.air = true; t.pitch = 0.14; t.bank = 0; t.thr = 1; t.flaps = 0; t.rudHeading = pr.hdg; t.elevMin = ac.onGround && ac.pitch < 0.1 ? 0.8 : null;
      if (!ac.onGround && ac.agl > 4) this.sub = 'climb';
      return;
    }
    this._setPhase('CLIMB');
    t.air = true; t.thr = 1; t.flaps = 0; t.speed = P.vy; t.vs = 6;
    t.bank = this._bankFor(pr.hdg, ac.agl < 60 ? 8 : 20);
    if (ac.agl > (leg.alt ?? 110)) this._next();
  }

  _fly(t, leg) {
    const ac = this.ac;
    this._setPhase(leg.label || 'ENROUTE');
    if (ac.onGround && ac.speed < 15 && this.legT > 2) return this.replan();
    const pr = this._pursue(this.cur.path, clamp(ac.speed * 7, 170, 380));
    if (pr.advanced > 0) {
      const steps = pr.advanced;
      for (let s = 0; s < steps; s++) {
        this.i++;
        const nl = this.route.legs[this.i];
        if (!nl || nl.kind !== 'fly') { this._begin(false); return; }
      }
      this.legT = 0;
      const k = this.cur.k;
      this.cur.path = this.cur.path.slice(k); this.cur.k = 0;
      this._emit('waypoint', { leg: this.i });
      return this._fly(t, this.leg);
    }
    const last = this.cur.path.length === 2 || (this.cur.path[2] && this.cur.path[2].appr && false);
    if (pr.k === 0 && (pr.t >= 1 || (this.cur.path.length === 2 && pr.toEnd < 60))) {
      this._next(); return;
    }
    t.air = true;
    t.speed = (leg.speed ?? 85) * KT; t.flaps = leg.flaps ?? 0;
    if (pr.alt - ac.alt > 25 && t.flaps === 0) t.speed = Math.min(t.speed, ac.P.vy);
    t.vs = clamp((pr.alt - ac.alt) * 0.12 + pr.slope * ac.gs, -5, 5);
    t.bank = this._bankFor(pr.hdg, 30);
    this.t.target = { x: this.cur.path[pr.k + 1].x, z: this.cur.path[pr.k + 1].z, alt: pr.alt };
    void last;
  }

  _approach(t, leg) {
    const ac = this.ac, e = this.cur.e, P = ac.P;
    const p = toRunway(e, ac.pos.x, ac.pos.z), d = AIM_DIST - p.s;
    const gpAlt = e.elev + Math.max(0, d) * TANG;
    const herr = Math.abs(wrap180(e.hdg - ac.track));
    const sub = this.sub;
    if (sub === 'goaround') {
      this._setPhase('GO AROUND');
      const [fx, fz] = fromRunway(e, p.s + 800, 0);
      t.air = true; t.thr = 1; t.flaps = ac.agl > 60 ? 0 : 1 / 3; t.speed = P.vy; t.vs = 5;
      t.bank = this._bankFor(bearing(ac.pos.x, ac.pos.z, fx, fz), 15);
      if (ac.agl > 140) { this._ignoreLand = e.id; this._ignoreUntil = ac.time + 40; this.replan(); }
      return;
    }
    if (sub === 'rollout') {
      this._setPhase('ROLLOUT');
      const pr = this._pursue(this.cur.path, Math.max(25, ac.speed * 2.5));
      t.gHeading = pr.hdg; t.thr = 0; t.flaps = ac.flapsPos;
      t.elev = ac.speed > 20 ? 0.25 : 0;
      t.gSpeed = 7;
      t.brakeOverride = ac.noseDown && ac.speed > 9 ? clamp(0.25 + (ac.speed - 9) * 0.03, 0, 0.75) : null;
      if (!ac.mainsDown && ac.agl > 1.2) { this.sub = 'flare'; return; }
      if (ac.speed < 9 && ac.onGround) { this._emit('landed', { end: e.id }); this._next(); }
      return;
    }
    const pr = this._pursue(this.cur.path, clamp(d * 0.22, 70, 350));
    t.air = true;
    if (sub === 'flare') {
      this._setPhase('FLARE');
      t.thr = ac.agl > 3 ? 0.08 : 0; t.flaps = 1;
      t.vs = -clamp(ac.agl * 0.42, 0.3, 2.6);
      t.pitchMin = 0.012; t.free = true;
      t.bank = this._bankFor(pr.hdg, 5); t.rudHeading = e.hdg;
      t.speed = P.vapp;
      if (ac.mainsDown) { this.sub = 'rollout'; this.cur.k = 0; }
      else if (d < -e.len * 0.45 && !this.overridden) this._goAround('long landing');
      return;
    }
    this._setPhase('FINAL');
    const est = d < 2400;
    t.flaps = est ? 1 : 1 / 3;
    t.speed = est ? P.vapp : 75 * KT;
    let vs = -ac.gs * TANG + (gpAlt - ac.alt) * 0.22;
    if (d > 2600 && ac.alt < gpAlt) vs = Math.max(vs, 0);
    t.vs = clamp(vs, -4.2, 3);
    t.bank = this._bankFor(pr.hdg, ac.agl < 40 ? 8 : 25);
    this.t.target = { x: e.thr[0], z: e.thr[1], alt: gpAlt };
    if (ac.agl < 4.5 && d < 900 && Math.abs(p.l) < e.width) { this.sub = 'flare'; this.iPitch = 0; return; }
    if (this.overridden) return;
    const hi = ac.alt - gpAlt;
    if (d < 450 && (Math.abs(p.l) > 35 || hi > 45)) return this._goAround(Math.abs(p.l) > 35 ? 'not lined up' : 'too high');
    if (ac.agl < 50 && herr > 30) return this._goAround('not lined up');
    if (d < -150) return this._goAround('overshot');
    if (this.traffic && d < 1300 && ac.agl < 110 && !this.traffic.landingClear(e.id, ac)) return this._goAround('runway occupied');
  }

  _goAround(reason) {
    this.sub = 'goaround';
    this._emit('goaround', { reason });
  }

  _bankFor(hdg, maxBankDeg) {
    const ac = this.ac, V = Math.max(ac.speed, 20);
    const err = wrap180(hdg - ac.track) * DEG;
    const rate = clamp(err * 0.4, -0.22, 0.22);
    return clamp(Math.atan((V * rate) / G), -maxBankDeg * DEG, maxBankDeg * DEG);
  }

  // ---------- replanning ----------
  // Called when the player lets go (or after a go-around / recovery). Works from wherever the aircraft is now.
  replan() {
    const ac = this.ac;
    if (!this.route) return;
    this.recovering = false;
    const legs = this.route.legs;
    const kind = this.leg?.kind;
    if (ac.onGround) {
      if (kind === 'approach' && (this.sub === 'rollout' || this.sub === 'flare')) { this.sub = 'rollout'; return; }
      if (kind === 'takeoff' && ac.speed > 12) return;
      if (ac.speed > 18 && onRunway(ac.pos.x, ac.pos.z)) {
        const e = this._runwayEndAligned(30);
        const ai = legs.findIndex((l) => l.kind === 'approach');
        if (e && ai >= 0) { this.i = ai; this.override = { end: e.id }; this._begin(true); this.sub = 'rollout'; this._emit('replan', { to: 'rollout' }); return; }
      }
      if (['taxi', 'hold', 'park', 'takeoff'].includes(kind)) { this._begin(true); this._emit('replan', { to: kind }); return; }
      for (let n = 1; n <= legs.length; n++) {
        const j = (this.i + n) % legs.length;
        if (['taxi', 'hold', 'takeoff', 'park'].includes(legs[j].kind)) { this.i = j; this.override = null; this._begin(true); this._emit('replan', { to: legs[j].kind }); return; }
      }
      return;
    }
    // airborne: are we set up to land somewhere? ("cut in on final and the autopilot lands you there")
    const land = this._landableEnd();
    if (land) {
      let ai = legs.findIndex((l) => l.kind === 'approach' && l.end === land.id);
      if (ai < 0) ai = legs.findIndex((l) => l.kind === 'approach');
      if (ai >= 0) {
        this.i = ai; this.override = legs[ai].end === land.id ? null : { end: land.id };
        this._begin(true); this._emit('replan', { to: 'approach', end: land.id }); return;
      }
    }
    // otherwise rejoin the best flying leg ahead of us
    let best = -1, bc = Infinity;
    for (let j = 0; j < legs.length; j++) {
      const l = legs[j];
      if (l.kind !== 'fly') continue;
      const pl = legs[j - 1];
      const a = pl && pl.kind === 'fly' ? { x: pl.to[0], z: pl.to[2] } : { x: l.to[0] - 1, z: l.to[2] - 1 };
      const b = { x: l.to[0], z: l.to[2] };
      const dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz || 1;
      const tt = ((ac.pos.x - a.x) * dx + (ac.pos.z - a.z) * dz) / L2;
      if (tt > 0.9) continue;
      const tc = clamp(tt, 0, 1);
      const dist = Math.hypot(ac.pos.x - (a.x + dx * tc), ac.pos.z - (a.z + dz * tc));
      const hd = Math.abs(wrap180(bearing(a.x, a.z, b.x, b.z) - ac.track));
      const toB = Math.abs(wrap180(bearing(ac.pos.x, ac.pos.z, b.x, b.z) - ac.track));
      const cost = dist + hd * 6 + toB * 4 + Math.abs(l.to[1] - ac.alt) * 2;
      if (cost < bc) { bc = cost; best = j; }
    }
    if (best >= 0) { this.i = best; this.override = null; this._begin(true); this._emit('replan', { to: 'fly', leg: best }); return; }
    // no flying legs in this route (eg. a taxi route): land on the most convenient runway
    const ai = legs.findIndex((l) => l.kind === 'approach');
    if (ai >= 0) { this.i = ai; this._begin(true); return; }
    const e = allRunwayEnds().sort((p, q) => Math.abs(wrap180(p.hdg - ac.track)) - Math.abs(wrap180(q.hdg - ac.track)))[0];
    this.route = { name: 'divert', legs: [...circuitLegs(e.id).slice(2), { kind: 'approach', end: e.id, label: 'FINAL' }, { kind: 'taxi', dest: { stand: 'auto' }, label: 'TAXI IN' }, { kind: 'park', seconds: 30 }], loop: null };
    this.i = 0; this._begin(true);
  }

  _runwayEndAligned(tol) {
    const ac = this.ac;
    let best = null;
    for (const e of allRunwayEnds()) {
      const p = toRunway(e, ac.pos.x, ac.pos.z);
      if (p.s < -50 || p.s > e.len || Math.abs(p.l) > e.width) continue;
      const herr = Math.abs(wrap180(e.hdg - ac.track));
      if (herr < tol && (!best || herr < best.h)) best = { e, h: herr };
    }
    return best?.e;
  }

  _landableEnd() {
    const ac = this.ac;
    let best = null;
    for (const e of allRunwayEnds()) {
      if (this._ignoreLand === e.id && ac.time < this._ignoreUntil) continue;
      const p = toRunway(e, ac.pos.x, ac.pos.z), d = AIM_DIST - p.s;
      if (d < 250 || d > 6000) continue;
      if (Math.abs(p.l) > 60 + d * 0.3) continue;
      const herr = Math.abs(wrap180(e.hdg - ac.track));
      if (herr > 40) continue;
      const gp = e.elev + d * TANG;
      if (ac.alt > gp + 80 + d * 0.03 || ac.agl < 8) continue;
      const score = d + Math.abs(p.l) * 4 + herr * 20;
      if (!best || score < best.score) best = { e, score };
    }
    return best?.e;
  }

  // ---------- inner loops ----------
  _finish(dt) {
    const ac = this.ac, t = this.t, o = this.out, P = ac.P;
    const want = {};
    if (t.air) Object.assign(want, this._airLoops(dt, t));
    else Object.assign(want, this._groundLoops(dt, t));
    want.flaps = t.flaps ?? o.flaps;
    for (const k of AXES) {
      const v = want[k] ?? o[k];
      const rate = k === 'flaps' ? 99 : k === 'throttle' ? 1.5 : k === 'brake' ? 4 : 6;
      o[k] = moveTo(o[k], v, rate * dt);
    }
    // nearest flap notch for display purposes only
    o.flaps = P.flapNotches.reduce((b, n) => (Math.abs(n - o.flaps) < Math.abs(b - o.flaps) ? n : b), 0);
    return o;
  }

  _airLoops(dt, t) {
    const ac = this.ac, P = ac.P;
    const V = Math.max(ac.speed, 18), qd = 0.5 * RHO * V * V, W = P.mass * G;
    const bank = ac.bank, cb = Math.max(Math.cos(bank), 0.5);
    const eff = clamp(V / P.vRef, 0.2, 1.4), effE = Math.max(eff, ac.eng * 0.45 * 0.4);
    const flaps = ac.flapsPos;
    // lateral
    const bdot = clamp((t.bank - bank) * 2.2, -0.75, 0.75);
    const aileron = (bdot - P.kBank * bank * eff) / (P.maxRollRate * eff);
    // vertical: model-inverted pitch for the wanted flight path angle
    const CLreq = (W * Math.cos(clamp((ac.vs / V), -0.5, 0.5))) / (qd * P.wingArea * cb);
    const aS = P.alphaStall - flaps * 0.025;
    const alphaReq = clamp((CLreq - P.CL0 - flaps * P.flapCL) / P.CLa, -0.12, aS - 0.04);
    const D = qd * P.wingArea * (P.CD0 + flaps * P.flapCD + P.K * CLreq * CLreq);
    const tf = Math.max(0.05, 1 - V / P.thrustV0);
    const Tmax = P.thrustMax * tf, Tidle = P.thrustMax * P.idle * tf;
    const spd = t.speed ?? V;
    let pitchT;
    if (t.pitch != null) pitchT = t.pitch;
    else {
      const thrMax = t.thr != null ? P.thrustMax * (P.idle + (1 - P.idle) * t.thr) * tf : Tmax;
      const thrMin = t.thr != null ? thrMax : Tidle;
      const gMax = Math.asin(clamp((thrMax - D) / W, -0.5, 0.5)) + (V - spd) * 0.03;
      const gMin = Math.asin(clamp((thrMin - D) / W, -0.5, 0.5)) - 0.05 + (V - spd) * 0.03;
      let gamma = Math.asin(clamp(t.vs / V, -0.4, 0.4));
      if (!t.free) gamma = clamp(gamma, Math.min(gMin, gMax), Math.max(gMin, gMax));
      pitchT = gamma + alphaReq * Math.cos(bank);
      this.iPitch = clamp(this.iPitch + (t.vs - ac.vs) * dt * 0.004, -0.05, 0.05);
      pitchT += this.iPitch;
    }
    if (t.pitchMin != null) pitchT = Math.max(pitchT, t.pitchMin);
    pitchT = clamp(pitchT, -0.3, 0.32);
    if (ac.speed < this._vstall() * 1.12 && !(this.sub === 'flare')) pitchT = Math.min(pitchT, ac.pitch - 0.03);
    const turnRate = (G * Math.tan(bank)) / V;
    const thdot = clamp((pitchT - ac.pitch) * 1.8, -0.3, 0.3);
    const qCmd = thdot * Math.cos(bank) + turnRate * Math.sin(bank) * Math.cos(ac.pitch);
    let elevator = (qCmd + P.kAlpha * (ac.alpha - P.alphaTrim) * eff + (ac.stalled ? 0.35 * eff : 0)) / (P.maxPitchRate * effE);
    // throttle
    let throttle;
    if (t.thr != null) throttle = t.thr;
    else {
      const gam = Math.asin(clamp(ac.vs / V, -0.5, 0.5));
      this.iSpeed = clamp(this.iSpeed + (spd - ac.speed) * dt * 0.02, -0.25, 0.25);
      const Treq = D + W * Math.sin(gam) + P.mass * (spd - ac.speed) * 0.35;
      throttle = (Treq / (P.thrustMax * tf) - P.idle) / (1 - P.idle) + this.iSpeed;
    }
    // rudder: coordinate, or hold runway heading low down
    let rudder = (turnRate * Math.cos(bank)) / (P.maxYawRate * effE) + ac.beta * 1.2;
    if (t.rudHeading != null && (ac.onGround || ac.agl < 3)) rudder = clamp(wrap180(t.rudHeading - ac.heading) * DEG * 3 + this.ac.w.y * 1.5, -1, 1);
    if (t.elevMin != null) elevator = Math.max(elevator, t.elevMin);
    return {
      aileron: clamp(aileron, -1, 1), elevator: clamp(elevator, -1, 1), rudder: clamp(rudder, -1, 1),
      throttle: clamp(throttle, 0, 1), brake: 0,
    };
  }

  _groundLoops(dt, t) {
    const ac = this.ac, P = ac.P, V = ac.speed;
    const err = wrap180((t.gHeading ?? ac.heading) - ac.heading) * DEG;
    const yawRate = -ac.w.y;
    const want = clamp(err * 1.6, -0.6, 0.6);
    const wb = Math.abs(P.gear.nose - P.gear.main[1]);
    const steerScale = P.gear.maxSteer * clamp(1.2 - V / 30, 0.15, 1);
    let rudder = Math.atan((want * wb) / Math.max(V, 0.6)) / steerScale + (want - yawRate) * (V > 15 ? 2.5 : 0.8);
    if (V < 0.3 && Math.abs(err) < 0.02) rudder = 0;
    const vt = t.gSpeed ?? 0;
    let throttle, brake = 0;
    if (t.thr != null) throttle = t.thr;
    else {
      this.iGround = clamp(this.iGround + (vt - V) * dt * 0.05, -0.1, 0.25);
      throttle = vt <= 0.01 ? 0 : clamp(0.06 + (vt - V) * 0.18 + this.iGround, 0, 0.6);
    }
    if (vt <= 0.01) brake = V < 0.5 ? 1 : 0.8;
    else if (V > vt + 1.2) brake = clamp((V - vt - 1) * 0.35, 0, 0.9);
    if (t.brakeOverride != null) brake = t.brakeOverride;
    if (t.thr === 1) brake = 0;
    return { aileron: clamp(-ac.bank * 2, -1, 1), elevator: t.elev ?? 0, rudder: clamp(rudder, -1, 1), throttle, brake };
  }

  status() {
    const l = this.leg;
    return {
      engaged: this.engaged, overridden: this.overridden, phase: this.phase, sub: this.sub, leg: l?.kind, legIndex: this.i,
      label: l?.label, route: this.route?.name, recovering: this.recovering, done: this.done,
      target: this.t.target || null, speedKt: this.t.speed ? this.t.speed / KT : null, end: l?.end,
    };
  }
}
