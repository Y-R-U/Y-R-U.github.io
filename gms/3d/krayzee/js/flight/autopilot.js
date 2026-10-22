import { clamp, lerp, DEG, KT, wrap180, bearing, moveTo } from './vmath.js';
import { runwayEnd, allRunwayEnds, toRunway, fromRunway, taxiPath, GLIDE_DEG, AIM_DIST, FAF_DIST, onRunway, circuitLegs, segInter, departureRoute, runwayEntries, rerouteRunway } from './routes.js';
import { RUNWAYS, HOLD_OFFSET, threshold } from '../world/layout.js';
import { TYPES, typeInfo } from './aircraft.js';

const G = 9.81, RHO = 1.225, TANG = Math.tan(GLIDE_DEG * DEG);
const endOf = (x) => (typeof x === 'object' && x ? x : runwayEnd(x)); // ASSIST plans pass virtual runway-end objects
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

  // Route/leg speeds are C172 knots: other types fly them scaled by cruise speed, never below ~1.2 Vs0 / Vapp.
  _kt(kt) {
    const P = this.ac.P, s = P.vcruise / TYPES.c172.vcruise;
    return s === 1 ? kt * KT : Math.max(kt * KT * s, P.vapp, P.vs0 * 1.22);
  }

  // Ground: taxi speed by type (roster taxi kt vs the C172's 15), turns slower still on a narrow, tall track (tip-over).
  get _gnd() {
    if (this.__gnd?.ac === this.ac) return this.__gnd;
    const P = this.ac.P, taxi = typeInfo(this.ac.type).speeds?.taxi ?? 15;
    const tip = clamp((P.gear.main[0] / this.ac.aglRef) / (1.25 / 1.2), 0.3, 1);
    return (this.__gnd = { ac: this.ac, v: P === TYPES.c172 ? 1 : taxi / 15, turn: P === TYPES.c172 ? 1 : tip });
  }
  _turnCaps(pr, vt) {
    const ac = this.ac, g = this._gnd;
    const herr = Math.abs(wrap180(pr.hdg - ac.heading));
    if (herr > 25) vt = Math.min(vt, 3.5 * g.turn);
    if (herr > 60 && ac.speed < 2) vt = Math.min(vt, 0.8);   // turning round from a stop (eg. at a hold): pivot tight, don't swing forward
    const nk = this.cur.path[pr.k + 2];
    if (nk) {
      const b = this.cur.path[pr.k + 1], a = this.cur.path[pr.k];
      const turn = Math.abs(wrap180(bearing(b.x, b.z, nk.x, nk.z) - bearing(a.x, a.z, b.x, b.z)));
      const db = Math.hypot(b.x - ac.pos.x, b.z - ac.pos.z);
      if (turn > 30 && db < 30) vt = Math.min(vt, 4 * g.turn);
    }
    return vt;
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
      else if (Math.abs(p.l) < 5 && p.s > -30 && p.s < e.len * 0.45 && herr < 12) this.sub = ac.speed > 10 || this._mayEnterRunway(e, true) ? 'roll' : 'ready';
      else if (onRunway(ac.pos.x, ac.pos.z) && p.s < e.len * 0.45) this._lineup(e);
      else if (Math.hypot(...this._d(this._holdOrThr(e))) < 90 && this._mayEnterRunway(e)) this._lineup(e);
      else {
        this.sub = 'taxi';
        cur.path = taxiPath(ac.pos.x, ac.pos.z, ac.heading, this.demand ? (this.demandEntry ? { xz: this.demandEntry } : { threshold: leg.end }) : { hold: leg.end }).map(([x, z]) => ({ x, z, a: 0 }));
        cur.k = 0;
        this._prepCrossings();
      }
      cur.line = [{ x: e.thr[0], z: e.thr[1], a: 0 }, { x: e.far[0], z: e.far[1], a: 0 }];
    } else if (leg.kind === 'approach') {
      const e = (cur.e = endOf(leg.end));
      const [bx, bz] = fromRunway(e, -9000, 0), [ax, az] = fromRunway(e, AIM_DIST, 0);
      cur.path = [{ x: bx, z: bz, a: 0 }, { x: ax, z: az, a: 0 }, { x: e.far[0], z: e.far[1], a: 0 }];
      cur.k = 0;
      const p = toRunway(e, ac.pos.x, ac.pos.z);
      this.extendDW = null;
      this._sf = null;
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
    let sf = 0;
    for (let j = this.i; j < legs.length; j++) {
      const l = legs[j];
      const ex = this.extendDW;
      if (l.kind === 'fly') {
        let [x, a, z] = l.to;
        if (ex && l.ext && l.end === ex.end) { const u = runwayEnd(l.end).u; x -= u[0] * ex.metres; z -= u[1] * ex.metres; }
        else if (l.ext && (sf = this._shortFinal(l.end, legs))) {
          // B7: the player's AP turns base early (finalLen) when nobody is in the pattern for this runway
          const e = runwayEnd(l.end);
          x += e.u[0] * sf; z += e.u[1] * sf;
          const gs = e.elev + (AIM_DIST - toRunway(e, x, z).s) * TANG;
          a = Math.min(a, gs + (l.label === 'BASE' ? 20 : 90));
        }
        path.push({ x, z, a });
        continue;
      }
      if (l.kind === 'approach') {
        const e = endOf(this.override?.end && j === this.i ? this.override.end : l.end);
        let fd = (l.fafDist ?? FAF_DIST) + (ex && ex.end === e.id ? ex.metres : 0);
        if (sf) fd = Math.min(fd, this.finalLen + 100);
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

  // Metres to pull this circuit's base turn in (0 = fly it as published): the player's `finalLen` (default 1300 m),
  // decided once per circuit and only with nobody else on this runway's final or base/downwind.
  _shortFinal(end, legs) {
    if (!this.finalLen || this.extendDW || this.landing) return 0;
    const key = end + '|' + this.route?.name;
    if (this._sf?.key === key) return this._sf.m;
    const base = legs.find((l) => l.ext && l.end === end && l.label === 'BASE') || legs.filter((l) => l.ext && l.end === end).pop();
    const e = runwayEnd(end), m = base ? Math.max(0, -toRunway(e, base.to[0], base.to[2]).s - this.finalLen) : 0;
    const busy = (this.traffic?.list || []).some((o) => {
      if (o.ap === this || o.ac.onGround || o.ac.crashed) return false;
      const l = o.ap?.leg, oe = l?.kind === 'approach' ? endOf(o.ap.override?.end || l.end) : l?.ext ? runwayEnd(l.end) : null;
      return oe?.rw === e.rw && Math.hypot(o.ac.pos.x - e.thr[0], o.ac.pos.z - e.thr[1]) < 5000;
    });
    this._sf = { key, m: busy ? 0 : m };
    return this._sf.m;
  }

  // A steady, lined-up final (STORY's time warp may run 2× through it): on the approach leg, not overridden,
  // within 20 m of the centreline, 10° of the runway heading and 20 m of the glide path, more than 350 m out.
  get stableFinal() {
    const ac = this.ac, l = this.leg;
    if (l?.kind !== 'approach' || this.sub !== 'final' || this.overridden || ac.onGround || !this.cur?.e) return false;
    const e = this.cur.e, p = toRunway(e, ac.pos.x, ac.pos.z), d = AIM_DIST - p.s;
    return d > 350 && Math.abs(p.l) < 20 && Math.abs(wrap180(e.hdg - ac.track)) < 10 && Math.abs(ac.alt - (e.elev + d * TANG)) < 20;
  }

  // Pure pursuit along a polyline of {x,z,a}. Returns lookahead target and the projection.
  _pursue(path, L) {
    const ac = this.ac, x = ac.pos.x, z = ac.pos.z, cur = this.cur;
    // a degenerate path (taxiPath can return a single point when already there): pad it so nothing indexes past the end
    while (path.length < 2) path.push(path.length ? { ...path[0] } : { x, z, a: ac.alt });
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
    if (this.landing) {
      this._lovT = this.manualNow ? (this._lovT || 0) + dt : 0;
      if (this._lovT > 0.5) this.cancelLand();
    }
    if (!this.done) this._doneHdg = null;
    if (this.done) {
      if (this.phase === 'GONE' && !ac.onGround) { t.air = true; t.bank = 0; t.vs = 0; t.speed = this._kt(95); t.flaps = 0; return this._finish(dt); }
      this._groundStop(t);
      if (ac.onGround && ac.speed > 2) {   // still rolling: straight ahead on the heading we stopped steering at, gentle brakes
        this._doneHdg ??= ac.heading; t.gHeading = this._doneHdg; t.gSpeed = 0;
        t.brakeOverride = ac.taildragger ? 0.15 : 0.35; if (ac.taildragger) t.elev = 0.7;
      }
      if (this.phase !== 'GONE') this.phase = 'DONE'; return this._finish(dt);
    }
    let leg = this.leg;
    // bounced back into the air on a ground leg (a Rubber smash): fly again rather than "taxi" at 26 m
    if (!ac.onGround && ac.agl > 8 && !this.manualNow && /^(taxi|hold|park)$/.test(leg?.kind) && !(this._airRe > ac.time - 2)) {
      this._airRe = ac.time; this.replan(); leg = this.leg;
    }

    if (this.forceRecover) {
      this.forceRecover = false;
      if (!ac.onGround && ((ac.agl < 150 && ac.vs < -1) || Math.abs(ac.bank) > 0.5 || this._upset())) { this.recovering = true; this.wantThrottleAuto = true; this._emit('recovery', { low: ac.agl < 150 }); }
    }
    if (!ac.onGround && !this.recovering && !this.overridden && this._upset()) { this.recovering = true; this.wantThrottleAuto = true; this._emit('recovery', {}); }
    if (this.recovering) {
      const low = ac.agl < 150, vst = this._vstall();
      if (ac.onGround || (Math.abs(ac.bank) < 0.3 && ac.speed > vst * 1.3 && ac.pitch > -0.2 && ac.pitch < 0.3 && (!low || ac.vs > 0.5))) {
        this.recovering = false; this.replan();
      } else {
        this.phase = 'RECOVERY';
        if (Math.abs(ac.bank) > 0.5 || ac.pitch < -0.12) return this._upsetOut(dt);
        t.air = true; t.bank = 0; t.thr = 1; t.flaps = Math.min(this.out.flaps, 1 / 3);
        // low down: climb away at once (full power climbs from ~1.15 Vs); never settle back onto the ground
        t.pitch = low && Math.abs(ac.bank) < 0.6 ? (ac.speed > vst * 1.2 ? 0.12 : ac.speed > vst * 1.1 ? 0.07 : -0.05) : ac.speed < vst * 1.25 ? -0.1 : 0.04;
        return this._finish(dt);
      }
    }
    if (this.attHold) {
      // the player just let go: hold the attitude they left (pitch clamped), wings level, until the blend
      if (this._hold0 == null) this._hold0 = clamp(ac.pitch, -0.05, 0.18);
      t.air = true; t.bank = 0; t.pitch = this._hold0; t.speed = ac.speed;
      return this._finish(dt);
    }
    this._hold0 = null;

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
    if (this.stickManual && !ac.onGround) {
      // the player is flying: no flap schedule and no speed-hold on the throttle underneath them (PLAYTEST_2 B3: a
      // speed-hold idled the engine in any bank or dive). The throttle stays where it was; power only near the stall.
      if (this._ov == null) this._ov = { flaps: this.out.flaps, thr: this.ac.ctl.throttle };
      if (!t.air) { t.air = true; t.bank = 0; t.vs = 0; delete t.pitch; }
      if (ac.speed < this._vstall() * 1.25) this._ov.thr = Math.min(1, this._ov.thr + dt * 0.5);
      t.flaps = this._ov.flaps; t.thr = this._ov.thr; delete t.speed;
    } else this._ov = null;
    if (this.manualNow) this._setPhase('MANUAL', true);
    return this._finish(dt);
  }

  // Upset recovery (PLAYTEST B5): unload while beyond 90° of bank, roll the short way at full rate, then pull hard
  // (alpha just under the stall) out of the dive; idle while the nose is low and fast, else full power.
  _upsetOut(dt) {
    const ac = this.ac, P = ac.P, t = this.t;
    const V = Math.max(ac.speed, 18), eff = clamp(V / P.vRef, 0.2, 1.4), effE = Math.max(eff, ac.eng * 0.18);
    const bank = ac.bank, ab = Math.abs(bank), cb = Math.cos(bank);
    const bdot = clamp(-bank * 3, -2, 2);
    const aileron = (bdot - P.kBank * bank * eff * (ab < 1.2 ? 1 : 0)) / (P.maxRollRate * eff);
    const aS = P.alphaStall - ac.flapsPos * 0.025;
    let alphaT, q;
    if (ab > 1.57) { alphaT = -0.02; q = (alphaT - ac.alpha) * 3; }
    else if (ab > 1.0) { alphaT = 0.03; q = (alphaT - ac.alpha) * 3; }
    else {
      alphaT = ac.pitch > 0.05 ? P.alphaTrim : aS * 0.82;
      const qd = 0.5 * RHO * V * V, n = (qd * P.wingArea * (P.CL0 + P.CLa * alphaT + ac.flapsPos * P.flapCL)) / (P.mass * G);
      q = (alphaT - ac.alpha) * 3 + (G / V) * (n - Math.cos(ac.pitch) * cb);
    }
    const elevator = (q + P.kAlpha * (ac.alpha - P.alphaTrim) * eff + (ac.stalled ? 0.35 * eff : 0)) / (P.maxPitchRate * effE);
    const fast = ac.speed > P.vcruise * 0.95;
    t.air = true; t.flaps = Math.min(this.out.flaps, 1 / 3);
    t.direct = { aileron: clamp(aileron, -1, 1), elevator: clamp(elevator, -1, 1), rudder: clamp(ac.beta * 1.2, -1, 1), throttle: ac.pitch < -0.2 && fast ? 0 : 1, brake: 0 };
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

  _setPhase(p, force = false) {
    if (this.manualNow && !force) { this._phaseUnder = p; return; }
    if (p !== this.phase) { this.phase = p; this._emit('phase', { phase: p }); }
  }

  // ---------- legs ----------
  _taxi(t, leg) {
    const ac = this.ac;
    const pr = this._pursue(this.cur.path, clamp(ac.speed * 2.4, 7, 22));
    let vt = (leg.speed ?? 9) * (onRunway(ac.pos.x, ac.pos.z, 0) ? 1 : this._gnd.v);   // vacate a runway briskly, whatever the type
    t.flaps = 0;
    vt = this._turnCaps(pr, vt);
    vt = Math.min(vt, Math.sqrt(2 * 0.7 * Math.max(0, pr.toEnd - 1.5)));
    if (this.mischief === 'speed') vt = Math.max(vt, this._naughtyTaxi(pr));
    else if (this.isPlayer) vt = Math.max(vt, Math.min(this._gnd.turn < 1 ? 8 : 10, this._naughtyTaxi(pr)));   // B7: brisk on long straights
    this._holdLbl = null;
    vt = this._crossingLimit(pr, vt);
    vt = this._groundLimit(vt);
    if (this._holdingPos()) vt = 0;
    this._setPhase(this._holdLbl || leg.label || 'TAXI');
    t.gHeading = pr.hdg; t.gSpeed = vt;
    if (pr.toEnd < 3 && ac.speed < 0.8) this._next();
  }

  // aiMischief: ~32 kt down a long straight, braking in time for the next turn, crossing or the end of the path.
  _naughtyTaxi(pr) {
    const P = this.cur.path, ac = this.ac;
    let turnAt = pr.toEnd;
    for (let k = pr.k + 1, acc = Math.hypot(P[pr.k + 1].x - ac.pos.x, P[pr.k + 1].z - ac.pos.z); k < P.length - 1; k++) {
      const a = P[k - 1], b = P[k], c = P[k + 1];
      if (Math.abs(wrap180(bearing(b.x, b.z, c.x, c.z) - bearing(a.x, a.z, b.x, b.z))) > 20) { turnAt = acc; break; }
      acc += Math.hypot(c.x - b.x, c.z - b.z);
    }
    const done = (this.cur.pathLen ?? 0) - pr.toEnd;
    for (const c of this.cur.crossings || []) if (!c.cleared && c.at > done) turnAt = Math.min(turnAt, c.at - done - 40);
    if (Math.abs(wrap180(pr.hdg - ac.heading)) > 8) return 0;
    return Math.min(16.5, Math.sqrt(2 * 0.7 * Math.max(0, turnAt - 35)));
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
        // still rolling along the runway we landed on (a slow type stopping short of an intersection): no hold-short
        // in the middle of it — the landing clearance already holds that intersection
        if (here && onRunway(a.x + (b.x - a.x) * h[0], a.z + (b.z - a.z) * h[0], 2) === here) continue;
        const [ux, uz] = runwayEnd(rw.ends[0]).u;
        const sinA = Math.abs(((b.x - a.x) * uz - (b.z - a.z) * ux) / len);
        out.push({ rw: rw.id, at: along + h[0] * len - (HOLD_OFFSET ?? 50) / Math.max(sinA, 0.3), cleared: false, wait: 0 });
      }
      along += len;
    }
    cur.pathLen = along;
    cur.crossings = out.sort((p, q) => p.at - q.at).filter((c, i, a) => !a.slice(0, i).some((o) => o.rw === c.rw && Math.abs(o.at - c.at) < 15));
  }

  _crossingLimit(pr, vt) {
    const cur = this.cur;
    if (!cur.crossings?.length || this.demand || this.playerThrottle != null) return vt;
    const done = cur.pathLen - pr.toEnd;
    const c = cur.crossings.find((x) => !x.cleared && x.at > done - 4);
    if (!c) return vt;
    const d = c.at - done;
    if (d > 40) return vt;
    if (this.crossClear?.has(c.rw)) { c.cleared = true; this.crossClear.delete(c.rw); return vt; }
    const free = !this.traffic || this.traffic.runwayFree(c.rw, this.ac);
    if (d < 4 && this.ac.speed < 1) c.wait += 1 / 120;
    if (free && (!this.__atcGate || c.wait > 120)) { c.cleared = true; return vt; }
    this._holdLbl = 'HOLD SHORT ' + c.rw;
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
  // LAND assist (docs/ASSIST.md §2): fly plan.route to a stop; cancelLand() goes back to the previous route.
  landAt(plan) {
    if (!plan?.route) return false;
    if (!this._landPrev) this._landPrev = { route: this.route, i: this.i };
    this.landing = plan; this.tgo = false; this.wantThrottleAuto = true;
    this.setRoute(plan.route);
    this._emit('replan', { to: 'land', label: plan.label });
    return true;
  }
  cancelLand() {
    const prev = this._landPrev;
    this.landing = null; this._landPrev = null;
    if (!prev?.route) return false;
    this.route = prev.route; this.i = prev.i; this.done = false; this.override = null;
    this._begin(true); this.replan();
    this._emit('landcancel', {});
    return true;
  }

  // The route to carry on with from a takeoff on `end`: this route's takeoff leg if it has one, else a departure.
  _takeoffRoute(end) {
    const legs = this.route?.legs || [];
    const ti = legs.findIndex((l) => l.kind === 'takeoff');
    if (ti >= 0) return { route: this.route, i: ti, override: legs[ti].end === end ? null : { end } };
    const r = departureRoute(end);
    return { route: r, i: r.legs.findIndex((l) => l.kind === 'takeoff'), override: null };
  }

  // D21 DEMAND TAKEOFF: taxi straight to the nearest usable runway start and go — no queue, no clearance.
  // ends: candidate runway ends (default 09/27's); prefer: the active end (others cost 25 % more).
  demandTakeoff({ ends = allRunwayEnds().filter((e) => !e.rw.closed).map((e) => e.id), prefer = null, minRun = 600 } = {}) {
    const ac = this.ac;
    if (!ac.onGround) return false;
    const pathLen = (pts) => { let L = 0; for (let k = 1; k < pts.length; k++) L += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]); return L; };
    const busy = (x, z) => (this.traffic?.list || []).some((o) => o.ac !== ac && o.ac.onGround && Math.hypot(o.ac.pos.x - x, o.ac.pos.z - z) < 70);
    let best = null;
    for (const id of ends) {
      const e = runwayEnd(id);
      const here = toRunway(e, ac.pos.x, ac.pos.z);
      // already on this runway pointing the right way with room to go: just roll
      if (onRunway(ac.pos.x, ac.pos.z, 2) === e.rw && Math.abs(wrap180(e.hdg - ac.heading)) < 60 && e.len - here.s > minRun) { best = { id, L: -1, entry: null }; break; }
      for (const en of runwayEntries(id)) {
        if (en.left < minRun) continue;
        let L = pathLen(taxiPath(ac.pos.x, ac.pos.z, ac.heading, { xz: [en.x, en.z] }));
        if (busy(en.x, en.z)) L += 500;
        if (prefer && id !== prefer) L = L * 1.25 + 50;
        if (!best || L < best.L) best = { id, L, entry: [en.x, en.z] };
      }
    }
    if (!best) return false;
    const T = this._takeoffRoute(best.id);
    this.landing = null; this._landPrev = null;
    this.route = T.route; this.i = T.i; this.done = false; this.override = T.override;
    this.demand = true; this.demandEntry = best.entry; this.wantThrottleAuto = true;
    this._begin(true);
    this._emit('demand', { end: best.id, entry: best.entry });
    return best.id;
  }

  // D22 skip to runway: lined up on `end` at once, waiting for the takeoff clearance as if we had taxied there.
  skipToRunway(end, env = this.traffic?.env) {
    const e = runwayEnd(end), [x, z] = fromRunway(e, 12, 0), ac = this.ac;
    ac.place({ x, z, heading: e.hdg }, env);
    const T = this._takeoffRoute(end);
    this.route = T.route; this.i = T.i; this.done = false; this.override = T.override; this.demand = false; this.landing = null; this._landPrev = null;
    this.wantThrottleAuto = true;
    this._begin(true);
    this.sub = 'ready';
    this._emit('skiptorunway', { end });
    return true;
  }

  // The active runway changed: same kind of route for `end`, rejoined from here. Rolling/landing planes are left alone.
  changeRunway(end, oldEnd = null) {
    const ac = this.ac, k = this.leg?.kind;
    if (!this.route || this.landing || this.demand) return false;
    if (k === 'takeoff' && ['lineup', 'ready', 'roll', 'rotate'].includes(this.sub)) return false;
    if (k === 'approach' && (ac.onGround || this.sub === 'flare' || this.sub === 'rollout')) return false;
    const r = rerouteRunway(this.route, this.i, { onGround: ac.onGround, x: ac.pos.x, z: ac.pos.z }, end);
    if (!r) return false;
    this.route = r.route; this.i = r.i; this.override = null; this.done = false; this.extendDW = null; this.tgo = false;
    this._begin(true);
    if (!ac.onGround) {
      if (oldEnd) { this._ignoreLand = oldEnd; this._ignoreUntil = ac.time + 240; }
      this.replan();
    }
    this._emit('replan', { to: 'runway', end });
    return true;
  }

  // ATC: the next landing is a touch-and-go (true) or a full stop (false).
  touchAndGo(on = true) { this.tgo = !!on; }
  rejectTakeoff(reason = 'rejected') {
    if (this.demand || this.leg?.kind !== 'takeoff' || !this.ac.onGround || !['lineup', 'roll', 'rotate', 'ready'].includes(this.sub)) return false;
    this.sub = 'reject'; this._emit('reject', { reason });
    return true;
  }
  holdPosition(reason = 'hold', secs = 30) { if (this.demand) return false; this.holdPos = this.ac.time + secs; this._emit('holdposition', { reason }); return true; }
  clearCrossing(runway) { (this.crossClear ||= new Set()).add(runway); this.holdPos = 0; }
  setTaxiRoute(cmd) {
    this.holdPos = 0;
    const dest = cmd.dest === 'stand' && cmd.stand ? { stand: cmd.stand } : cmd.runwayEnd ? { hold: cmd.runwayEnd } : null;
    const l = this.leg;
    if (!dest || !l) return false;
    // the player's own destination (a story/finish taxi to a named stand) is not ATC's to change
    if (this.isPlayer && l.kind === 'taxi' && l.dest?.stand && l.dest.stand !== 'auto') return false;
    if (dest.stand) this.traffic?.standOwner.set(dest.stand, this.ac);
    if (l.kind === 'taxi') { this.override = { ...(this.override || {}), dest }; this._begin(true); }
    else if (l.kind === 'takeoff' && this.sub === 'taxi' && dest.hold) { this.override = { end: dest.hold }; this._begin(true); }
    else return false;
    return true;
  }

  _mayEnterRunway(e, roll = false) {
    if (this.overridden || this.demand) return true;
    if (this.gate) return this.gate({ kind: 'hold', end: e.id, takeoff: true, roll }, this);
    return !this.traffic || this.traffic.runwayClear(e.id, this.ac);
  }

  // Other ground traffic: follow at a distance, give way at crossings, never meet head-on (see Traffic.groundLimit).
  _groundLimit(vt) {
    if (!this.traffic?.groundLimit) return vt;
    const lim = this.traffic.groundLimit(this, vt);
    this.waitAhead = lim < 0.5 && vt > 0.5 ? this.waitAhead + 1 / 120 : 0;
    return Math.min(vt, lim);
  }

  _hold(t, leg) {
    this._setPhase(leg.label || 'HOLD');
    this._groundStop(t);
    if ((this.playerThrottle ?? 0) > 0.3) { this.demand = true; this._next(); return; } // throttle up at the hold: go
    let ok = this.legT >= (leg.seconds ?? 0);
    if (ok && leg.untilClear && this.traffic && !this.gate) ok = this.traffic.runwayClear(leg.end, this.ac);
    if (ok && this.gate) ok = this.gate(leg, this);
    if (ok) this._next();
  }

  _park(t, leg) {
    this._setPhase(leg.label || 'PARKED');
    this._groundStop(t);
    if (this.legT >= (leg.seconds ?? 20) || (this.playerThrottle ?? 0) > 0.15) { this.traffic?.releaseStand?.(this.ac); this._next(); }
  }

  _groundStop(t) { t.gSpeed = 0; t.gHeading = this.ac.heading; t.thr = 0; }

  _takeoff(t, leg) {
    const ac = this.ac, e = this.cur.e, P = ac.P;
    if (this.sub === 'taxi') {
      const pr = this._pursue(this.cur.path, clamp(ac.speed * 2.4, 7, 22));
      let vt = Math.min((this.demand ? 12 : 9) * this._gnd.v, Math.sqrt(2 * 0.7 * Math.max(0, pr.toEnd - 1.5)));
      if (this._gnd.turn < 1) vt = this._turnCaps(pr, vt);
      else if (Math.abs(wrap180(pr.hdg - ac.heading)) > 60 && ac.speed < 2) vt = Math.min(vt, 0.8);
      if (this.mischief === 'speed') vt = Math.max(vt, this._naughtyTaxi(pr));
      else if (this.isPlayer) vt = Math.max(vt, Math.min(this._gnd.turn < 1 ? 8 : 10, this._naughtyTaxi(pr)));
      if (this.demand && pr.toEnd < 30) vt = Math.max(vt, 4);
      this._holdLbl = null;
      vt = this._groundLimit(this._crossingLimit(pr, vt));
      t.gHeading = pr.hdg; t.gSpeed = this._holdingPos() ? 0 : vt;
      if (pr.toEnd < (this.demand ? 25 : 4) && (ac.speed < 1 || this.demand)) {
        if (this._mayEnterRunway(e)) this._lineup(e); else this._setPhase('HOLD SHORT');
      } else this._setPhase(this._holdLbl || 'TAXI');
      return;
    }
    if (this.sub === 'reject' && (this.playerThrottle ?? 0) > 0.3) this.sub = 'roll';
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
      if (this._mayEnterRunway(e, true)) { this.sub = 'roll'; this._emit('takeoffroll', { end: e.id }); }
      return;
    }
    if (this.sub === 'lineup') {
      this._setPhase('LINE UP');
      const pr = this._pursue(this.cur.path, 13);
      t.gHeading = pr.hdg; t.gSpeed = (this.demand ? 6 : 4.5) * this._gnd.turn; t.flaps = 0;
      const p = toRunway(e, ac.pos.x, ac.pos.z), k = this.demand ? 2.5 : 1;   // DEMAND: a rolling start
      if (Math.abs(p.l) < 2.5 * k && Math.abs(wrap180(e.hdg - ac.heading)) < 6 * k) { this.sub = this._mayEnterRunway(e, true) ? 'roll' : 'ready'; this.cur.k = 0; if (this.sub === 'roll') this._emit('takeoffroll', { end: e.id }); }
      return;
    }
    const pr = this._pursue(this.cur.line, Math.max(30, ac.speed * 2.6));
    if (this.sub === 'roll' && ac.speed < 8 && !this._mayEnterRunway(e, true)) { this.sub = 'ready'; return this._takeoff(t, leg); }
    if (this.sub === 'roll') {
      this._setPhase('TAKEOFF ROLL');
      t.gHeading = pr.hdg; t.gSpeed = 99; t.thr = 1; t.flaps = 0; t.elev = -0.05;
      // taildragger: stick back to keep the tail wheel planted, then forward to fly the tail up at ~0.8 Vr
      if (ac.taildragger) t.elev = ac.speed > 0.8 * P.vr ? clamp((0.035 - ac.pitch) * 5 - ac.w.x * 1.5, -0.7, 0.3) : 0.25;
      if (ac.speed >= P.vr) this.sub = 'rotate';
      return;
    }
    if (this.sub === 'rotate') {
      this._setPhase('ROTATE');
      t.air = true; t.pitch = 0.14; t.bank = 0; t.thr = 1; t.flaps = 0; t.rudHeading = pr.hdg; t.elevMin = ac.onGround && ac.pitch < 0.1 ? 0.8 : null;
      if (ac.taildragger) { t.pitch = 0.11; t.elevMin = ac.onGround && ac.pitch < 0.07 ? 0.3 : null; }
      if (!ac.onGround && ac.agl > 4) this.sub = 'climb';
      return;
    }
    this._setPhase('CLIMB');
    this.demand = false; this.demandEntry = null;
    t.air = true; t.thr = 1; t.flaps = 0; t.speed = P.vy; t.vs = 6;
    t.bank = this._bankFor(pr.hdg, ac.agl < 60 ? 8 : 20);
    if (ac.agl > (leg.alt ?? 110)) this._next();
  }

  _fly(t, leg) {
    const ac = this.ac;
    this._setPhase(leg.label || 'ENROUTE');
    if (ac.onGround && ac.speed < 15 && this.legT > 2) return this.replan();
    const pr = this._pursue(this.cur.path, clamp(ac.speed * 7 * TYPES.c172.vcruise / ac.P.vcruise, 170, 380));
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
    t.speed = this._kt(leg.speed ?? 85); t.flaps = leg.flaps ?? 0;
    if (pr.alt - ac.alt > 25 && t.flaps === 0) t.speed = Math.min(t.speed, ac.P.vy);
    t.vs = clamp((pr.alt - ac.alt) * 0.12 + pr.slope * ac.gs, -5, 5);
    const sep = !this.overridden && !this.noAvoid && this.traffic?.airConflict?.(this);
    this.sep = sep || null;
    if (sep) {
      t.vs = clamp((sep.alt - ac.alt) * 0.15, -4, 5);
      if (sep.slow) t.speed = Math.min(t.speed, Math.max(this._vstall() * 1.35, this._kt(64)));
    }
    if (!(this._floorT > ac.time - 0.5)) { this._floorT = ac.time; this._floor = this._terrainFloor(pr.hdg, leg.clearance ?? (this.landing ? 35 : 120)); }
    const floor = this._floor;
    if (floor != null && ac.alt < floor + 40) {
      t.vs = Math.max(t.vs, ac.alt < floor ? clamp((floor - ac.alt) * 0.1, 1.5, 5) : 0);
      if (ac.alt < floor) t.speed = Math.min(t.speed, ac.P.vy);
    }
    t.bank = this._bankFor(pr.hdg, 30);
    this.t.target = { x: this.cur.path[pr.k + 1].x, z: this.cur.path[pr.k + 1].z, alt: pr.alt };
    void last;
  }

  // Lowest safe altitude ahead (terrain and collider tops along the track and the way we are turning), or null.
  _terrainFloor(hdg, clearance) {
    const env = this.traffic?.env, ac = this.ac;
    if (!env?.groundHeightAt) return null;
    let top = -Infinity;
    for (const h of [ac.track, hdg]) {
      const [ux, uz] = [Math.sin(h * DEG), -Math.cos(h * DEG)];
      for (const d of [0, 300, 700, 1200, 1800]) {
        const x = ac.pos.x + ux * d, z = ac.pos.z + uz * d;
        top = Math.max(top, env.groundHeightAt(x, z));
        if (env.colliders) for (const b of env.colliders) if (b.max[1] > 60 && x > b.min[0] - 150 && x < b.max[0] + 150 && z > b.min[2] - 150 && z < b.max[2] + 150) top = Math.max(top, b.max[1]);
      }
    }
    return top + clearance;
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
      if (this.landing && ac.agl > 50) { this._landCircuit(e); return this._fly(t, this.leg); }
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
      if (ac.taildragger) { t.elev = ac.tailDown ? 0.7 : ac.speed < P.vr ? 0.35 : 0; t.brakeOverride = ac.tailDown && ac.speed > 9 ? clamp(0.15 + (ac.speed - 9) * 0.02, 0, 0.4) : ac.tailDown ? null : 0; }
      if (pr.toEnd < 40) t.gHeading = e.hdg;   // past the end of the path the pursuit point swings round
      if (this.landing && ac.speed > 3 && pr.toEnd < (ac.speed * ac.speed) / 3 + 30) t.brakeOverride = Math.max(t.brakeOverride ?? 0, ac.taildragger ? (ac.tailDown ? 0.45 : 0.1) : 0.7);
      if (!ac.mainsDown && ac.agl > 1.2) { this.sub = 'flare'; return; }
      if (this.tgo && !this.overridden && ac.mainsDown && ac.groundTime > 1.2 && this._touchAndGo(e)) return;
      if (ac.speed < 9 && ac.onGround) { this._emit('landed', { end: e.id }); this._next(); }
      return;
    }
    const sc = ac.P.vcruise / TYPES.c172.vcruise, pr = this._pursue(this.cur.path, clamp(d * 0.22, 70, 350) * sc * sc);
    t.air = true;
    if (sub === 'flare') {
      this._setPhase('FLARE');
      t.thr = ac.agl > 3 ? 0.08 : 0; t.flaps = 1;
      // sink relative to the ground under us: a field falling away 1.5 % used to float the flare for ever (B2)
      const env = this.traffic?.env, gr = env?.groundHeightAt ? env.groundHeightAt(ac.pos.x + ac.vel.x, ac.pos.z + ac.vel.z) - env.groundHeightAt(ac.pos.x, ac.pos.z) : 0;
      const gRate = clamp(gr, -3, 3);
      t.vs = gRate - clamp(ac.agl * 0.42, 0.3, 2.6);
      t.pitchMin = 0.012; t.free = true;
      if (ac.taildragger) {
        const hold = clamp((ac.speed - P.vs0) / (P.vapp - P.vs0) * 1.3, 0, 1);
        t.vs = gRate - clamp((ac.agl - hold) * 0.6, 0.06, 2.6);
      }
      if (ac.taildragger) t.pitchMin = P.groundPitch * clamp((P.vapp - ac.speed) / (P.vapp - P.vs0 * 1.05), 0.1, 0.95);  // hold off into the 3-point attitude as it slows
      // LAND on a short strip: a floating hold-off is put down by a quarter of the way along, not gone round from
      if (this.landing && d < -e.len * 0.3) t.vs = Math.min(t.vs, gRate - 0.5);
      t.bank = this._bankFor(pr.hdg, 5); t.rudHeading = e.hdg;
      t.speed = P.vapp;
      if (ac.mainsDown) { this.sub = 'rollout'; this.cur.k = 0; }
      else if (d < -e.len * (this.landing ? 0.65 : 0.45) && !this.overridden) this._goAround('long landing');
      return;
    }
    if (sub === 'lowpass') {
      this._setPhase('LOW PASS');
      t.flaps = 1 / 3; t.speed = this._kt(74); t.vs = clamp((4.5 - ac.agl) * 0.6, -1.5, 2.5);
      t.bank = this._bankFor(pr.hdg, 5); t.rudHeading = e.hdg;
      if (p.s > e.len * 0.75 || ac.onGround) { this.mischief = null; this._goAround('low pass'); }
      return;
    }
    this._setPhase('FINAL');
    const est = d < 2400;
    t.flaps = est ? 1 : 1 / 3;
    t.speed = est ? P.vapp : this._kt(75);
    let vs = -ac.gs * TANG + (gpAlt - ac.alt) * 0.22;
    if (d > 2600 && ac.alt < gpAlt) vs = Math.max(vs, 0);
    t.vs = clamp(vs, -4.2, 3);
    t.bank = this._bankFor(pr.hdg, ac.agl < 40 ? 8 : 25);
    this.t.target = { x: e.thr[0], z: e.thr[1], alt: gpAlt };
    if (this.mischief === 'lowpass' && !this.overridden && ac.agl < 12 && d < 400 && Math.abs(p.l) < e.width / 2) { this.sub = 'lowpass'; return; }
    if (ac.agl < 4.5 && d < 900 && Math.abs(p.l) < e.width) { this.sub = 'flare'; this.iPitch = 0; return; }
    if (this.overridden) return;
    const hi = ac.alt - gpAlt;
    if (d < 450 && (Math.abs(p.l) > 35 || hi > (this.landing && e.len > 900 ? 80 : 45))) return this._goAround(Math.abs(p.l) > 35 ? 'not lined up' : 'too high');   // LAND on a long runway: land long rather than go round
    if (ac.agl < 50 && herr > 30) return this._goAround('not lined up');
    if (d < -150) return this._goAround('overshot');
    if (this.landing) { if (d < 300 && ac.agl < 40 && this._touchdownZoneBusy(e)) return this._goAround('runway occupied'); }
    else if (this.traffic && !e.virtual && d < (this.__atcGate ? 380 : 1300) && ac.agl < 110 && !this.traffic.landingClear(e.id, ac)) return this._goAround('runway occupied');
  }

  // Cleared touch-and-go: power up from the rollout and carry on with the route's takeoff leg (upwind follows).
  _touchAndGo(e) {
    const legs = this.route.legs, ti = legs.findIndex((l) => l.kind === 'takeoff');
    if (ti < 0 || e.virtual) return false;
    this.tgo = false;
    this.i = ti; this.override = legs[ti].end === e.id ? null : { end: e.id };
    this._begin(true);
    this.sub = 'roll';
    this._emit('touchandgo', { end: e.id }); this._emit('takeoffroll', { end: e.id });
    return true;
  }

  // LAND (B2): someone physically in the first 700 m of the strip (rolling traffic further down will be gone)
  _touchdownZoneBusy(e) {
    return (this.traffic?.list || []).some((o) => {
      if (o.ac === this.ac || !o.ac.onGround || o.ac.crashed) return false;
      const p = toRunway(e, o.ac.pos.x, o.ac.pos.z), away = o.ac.vel.x * e.u[0] + o.ac.vel.z * e.u[1];
      if (away > 4 && p.s > AIM_DIST - 50) return false;   // rolling away down the runway ahead of us: gone by the time we get there
      return p.s > -30 && p.s < AIM_DIST + 600 && Math.abs(p.l) < (e.width || 30) / 2 + 8;
    });
  }

  _goAround(reason) {
    // LAND is a royal command: the tower's go-around is noted and ignored (ATC sees the landing for what it is)
    if (this.landing && /^Tower/.test(reason) && this.cur?.e && !this._touchdownZoneBusy(this.cur.e)) { this._emit('goaroundrefused', { reason }); return; }
    this.tgo = false;
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
    if (this.landing) return this._landReplan();
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
    this.route = { name: 'divert', legs: [...circuitLegs(e.id, this.route.circ || { type: ac.type }).slice(2), { kind: 'approach', end: e.id, label: 'FINAL' }, { kind: 'taxi', dest: { stand: 'auto' }, label: 'TAXI IN' }, { kind: 'park', seconds: 30 }], loop: null };
    this.i = 0; this._begin(true);
  }

  // LAND (PLAYTEST_2 B2): after any replan or go-around the plan's touchdown stays the target — straight onto its final
  // when set up for it, else a tight circuit back to it. Never a fly-away.
  _landEnd() {
    const a = this.landing?.route?.legs.find((l) => l.kind === 'approach');
    return a ? endOf(a.end) : null;
  }
  _landReplan() {
    const ac = this.ac, e = this._landEnd(), legs = this.route.legs;
    if (!e) return;
    const ai = legs.findIndex((l) => l.kind === 'approach');
    const p = toRunway(e, ac.pos.x, ac.pos.z), d = AIM_DIST - p.s, herr = Math.abs(wrap180(e.hdg - ac.track));
    if (ai >= 0 && d > 250 && d < 5000 && Math.abs(p.l) < 60 + d * 0.25 && herr < 40 && ac.alt < e.elev + d * TANG + 60 + d * 0.03) {
      this.i = ai; this.override = null; this._begin(true); this._emit('replan', { to: 'approach', end: e.id }); return;
    }
    let best = -1, bc = Infinity;
    for (let j = 0; j < legs.length; j++) {
      const l = legs[j];
      if (l.kind !== 'fly') continue;
      const b = bearing(ac.pos.x, ac.pos.z, l.to[0], l.to[2]), dist = Math.hypot(l.to[0] - ac.pos.x, l.to[2] - ac.pos.z);
      if (dist < 250) continue;
      const cost = dist + Math.abs(wrap180(b - ac.track)) * 8;
      if (Math.abs(wrap180(b - ac.track)) < 70 && cost < bc) { bc = cost; best = j; }
    }
    if (best >= 0) { this.i = best; this.override = null; this._begin(true); this._emit('replan', { to: 'land', leg: best }); return; }
    this._landCircuit(e);
  }
  // A short circuit back onto the plan's final, on the side the plane is already on.
  _landCircuit(e) {
    const ac = this.ac, k = typeInfo(ac.type).circuitScale ?? 1;
    const p = toRunway(e, ac.pos.x, ac.pos.z), sg = Math.abs(p.l) > 40 ? Math.sign(p.l) : -1;
    const W = 750 * k, F = 1100 * Math.max(k, 0.8), A = e.elev + Math.max(110, 190 * k * k);
    const gp = (s) => e.elev + (AIM_DIST - s) * TANG;
    const at = (s, l, a, label, speed, flaps = 0) => { const [x, z] = fromRunway(e, s, l * sg); return { kind: 'fly', to: [x, a, z], speed, flaps, clearance: 35, label }; };
    const s0 = Math.max(p.s + 500, e.len * 0.6);
    const legs = [
      at(s0, W * 0.6, A, 'LAND · CIRCUIT', 80),
      at(Math.min(e.len * 0.4, s0 - 400), W, A, 'LAND · CIRCUIT', 85),
      at(250 - F, W, Math.max(A - 40, gp(250 - F) + 40), 'LAND · CIRCUIT', 75, 1 / 3),
      at(-F, W * 0.35, gp(-F) + 15, 'LAND · BASE', 72, 1 / 3),
      { kind: 'approach', end: e.virtual ? e : e.id, fafDist: Math.round(F - 250), label: 'LAND', land: true },
    ];
    this.route = { name: 'land', legs, loop: null }; this.i = 0; this.override = null; this.done = false; this.tgo = false;
    this._begin(true);
    this._emit('replan', { to: 'land', label: 'circuit' });
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
    if (t.direct) Object.assign(want, t.direct);
    else if (t.air) Object.assign(want, this._airLoops(dt, t));
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
    const bdot = clamp(((t.bank ?? 0) - bank) * 2.2, -0.75, 0.75);
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
      const fixed = t.thr ?? this.playerThrottle;   // a latched lever: fly the path its power allows
      const thrMax = fixed != null ? P.thrustMax * (P.idle + (1 - P.idle) * fixed) * tf : Tmax;
      const thrMin = fixed != null ? thrMax : Tidle;
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
    const wb = Math.abs((ac.taildragger ? P.gear.tail : P.gear.nose) - P.gear.main[1]);
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
    if (t.thr === 1 || (this.playerThrottle ?? 0) > 0.05) brake = 0; // the player is driving: never brake against them
    return { aileron: clamp(-ac.bank * 2, -1, 1), elevator: t.elev ?? 0, rudder: clamp(rudder, -1, 1), throttle, brake };
  }

  status() {
    const l = this.leg;
    return {
      engaged: this.engaged, overridden: this.overridden, phase: this.phase, sub: this.sub, leg: l?.kind, legIndex: this.i,
      label: l?.label, route: this.route?.name, recovering: this.recovering, done: this.done,
      target: this.t.target || null, speedKt: this.t.speed ? this.t.speed / KT : null, end: typeof l?.end === "object" ? l.end?.id : l?.end,
      stableFinal: this.stableFinal,
    };
  }
}
