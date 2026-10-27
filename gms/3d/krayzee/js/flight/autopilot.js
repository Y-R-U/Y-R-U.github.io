import { clamp, lerp, DEG, KT, wrap180, bearing, moveTo } from './vmath.js';
import { runwayEnd, allRunwayEnds, toRunway, fromRunway, taxiPath, GLIDE_DEG, AIM_DIST, FAF_DIST, onRunway, circuitLegs, circuitRoute, circuitOpts, segInter, departureRoute, runwayEntries, rerouteRunway, isHeavy, homeCenter, circuitSide } from './routes.js';
import { RUNWAYS, HOLD_OFFSET, threshold } from '../world/layout.js';
import { TYPES, typeInfo, stallSpeed, thrustFactor } from './aircraft.js';
import { takeoffRun } from '../assist/landahead.js';
import { level as stovlLevel, vsToLever, CONVERT } from './stovl.js';

const G = 9.81, RHO = 1.225, TANG = Math.tan(GLIDE_DEG * DEG);
const endOf = (x) => (typeof x === 'object' && x ? x : runwayEnd(x)); // ASSIST plans pass virtual runway-end objects
const AXES = ['aileron', 'elevator', 'rudder', 'throttle', 'flaps', 'brake'];
const FIELD_QUIPS = ['A field? Sire, this aircraft has standards.', 'The turnips would never survive it, Your Majesty.', 'Runways only, Your Grace. It is in the warranty.'];

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
    this._endStovl();
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

  // runway a takeoff needs from where it starts rolling: jets their book roll + 10 % (the jumbo: all 1400 m); light
  // planes their book roll × 1.4 (C172 406 m, Moth 224 m, Bathtub 210 m), so the 620 m farm strip takes the C172 and a
  // 240 m lawn the Moth and the Bathtub from a line-up 12 m in
  _minRun() {
    const P = this.ac.P, roll = typeInfo(this.ac.type).performance?.takeoffRollM;
    return P.jet ? Math.max(600, (roll ?? 600) * 1.1) : roll ? Math.max(150, roll * 1.4) : 600;
  }

  // JETCORE: the type's circuit options (routes.circuitOpts) and the lowest flap notch that keeps 1.25 Vs at this speed
  _circ() { return (this.route?.circ?.fin ? this.route.circ : null) || circuitOpts(this.ac.type) || {}; }
  _minFlaps() {
    const P = this.ac.P;
    if (P.toFlaps == null || this.ac.onGround) return 0;
    for (const n of P.flapNotches) if (this.ac.speed > 1.25 * stallSpeed(P, n)) return n;
    return P.flapNotches[P.flapNotches.length - 1];
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
    this.legT = 0; this.sub = ''; this.iGround = 0; this.waitAhead = 0; this._jetWaitT = 0; this._jetGo = false;
    const cur = (this.cur = { fromCurrent });
    if (!leg) return;
    if (leg.kind === 'despawn') { this.done = true; this.phase = 'GONE'; return; }
    if (leg.kind === 'taxi') {
      let dest = leg.dest;
      if (dest.stand === 'auto') dest = { stand: this.traffic?.claimStand(ac) || 'S1' };
      // a heavy re-claims (two stands, its own pull-in spot) whatever stand it was given
      if (dest.stand && isHeavy(ac.type)) dest = { stand: this.traffic?.claimStand(ac, dest.stand) || dest.stand, heavy: true };
      cur.dest = dest;
      cur.path = taxiPath(ac.pos.x, ac.pos.z, ac.heading, dest).map(([x, z]) => ({ x, z, a: 0 }));
      cur.k = 0;
      this._prepCrossings();
    } else if (leg.kind === 'fly') {
      this._buildFlyPath(fromCurrent);
    } else if (leg.kind === 'takeoff') {
      const e = (cur.e = endOf(leg.end));
      const p = toRunway(e, ac.pos.x, ac.pos.z);
      const herr = Math.abs(wrap180(e.hdg - ac.heading));
      if (!ac.onGround) this.sub = 'climb';
      else if (e.virtual) { if (Math.abs(p.l) < 5 && herr < 12) this.sub = 'roll'; else this._lineup(e); }   // a field run: turn onto it here
      else if (Math.abs(p.l) < 5 && p.s > -30 && p.s < e.len * 0.45 && herr < 12 && e.len - p.s >= this._minRun()) this.sub = ac.speed > 10 || this._mayEnterRunway(e, true) ? 'roll' : 'ready';
      else if (onRunway(ac.pos.x, ac.pos.z) === e.rw && p.s < e.len * 0.45 && e.len - Math.max(0, p.s) >= this._minRun()) this._lineup(e);   // on THIS runway (a stop on 04 used to "line up" on 27 from 150 m away at line-up speed)
      else if (Math.hypot(...this._d(this._holdOrThr(e))) < 90 && this._mayEnterRunway(e)) this._lineup(e);
      else {
        this.sub = 'taxi';
        cur.path = (this.demand && this.demandDirect && this.demandEntry ? [[ac.pos.x, ac.pos.z], this.demandEntry]
          : taxiPath(ac.pos.x, ac.pos.z, ac.heading, this.demand ? (this.demandEntry ? { xz: this.demandEntry } : { threshold: leg.end }) : { hold: leg.end })).map(([x, z]) => ({ x, z, a: 0 }));
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
      this._sf = null; this._apFl = 0;
      if (ac.onGround) this.sub = 'rollout';
      else if (ac.agl > 12 && (this.landing ? ac.agl > Math.max(0, AIM_DIST - p.s) * 0.16 : p.s > -150)) this.sub = 'goaround';
      else this.sub = 'final';
    }
  }

  _d(pt) { return [pt[0] - this.ac.pos.x, pt[1] - this.ac.pos.z]; }
  _holdOrThr(e) { return e.thr; }

  _lineup(e) {
    const ac = this.ac, p = toRunway(e, ac.pos.x, ac.pos.z);
    const [lx, lz] = fromRunway(e, Math.max(p.s, 0) + 22, 0);
    this.sub = 'lineup'; this._luT = ac.time;
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
        if (sf) fd = Math.min(fd, this.finalLen * Math.max(1, typeInfo(this.ac.type).circuitScale ?? 1) + 100);
        const [fx, fz] = fromRunway(e, -fd, 0), [ax, az] = fromRunway(e, AIM_DIST, 0);
        path.push({ x: fx, z: fz, a: e.elev + Math.min(fd + AIM_DIST, Math.max(FAF_DIST + 600, (l.fafDist ?? 0) + AIM_DIST)) * TANG, appr: true }, { x: ax, z: az, a: e.elev, appr: true });
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
    if (!this.finalLen || this.extendDW || this.landing || this.ac.P.jet) return 0;   // jets: the stretched circuit is the circuit
    const key = end + '|' + this.route?.name;
    if (this._sf?.key === key) return this._sf.m;
    const base = legs.find((l) => l.ext && l.end === end && l.label === 'BASE') || legs.filter((l) => l.ext && l.end === end).pop();
    const fl = this.finalLen * Math.max(1, typeInfo(this.ac.type).circuitScale ?? 1);   // a jumbo's "short" final is still 3 km
    const e = runwayEnd(end), m = base ? Math.max(0, -toRunway(e, base.to[0], base.to[2]).s - fl) : 0;
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
    if (this.stovl) {
      if (ac.crashed) this._endStovl();
      else { this.forceRecover = false; this.recovering = false; return this._stovlStep(dt); }
    }
    if (!this.route || ac.crashed) { this._idle(); return this.out; }
    if (this.landing) {
      this.landing.leg = this.leg?.kind;   // LAND NOW shows only while a plan is still on its circuit/join legs
      this._lovT = this.manualNow ? (this._lovT || 0) + dt : 0;
      if (this._lovT > 0.5) this.cancelLand();
    }
    if (!this.done) this._doneHdg = null;
    // airborne again after a vertical landing without a STOVL departure (a bounce, a teleport): fly the circuit
    if (this.done && this.route?.name === 'vland' && !ac.onGround && ac.agl > 8) this.resumeCircuit();
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
    if (!leg) { this.i = this.route.legs.length - 1; this._next(); leg = this.leg; if (!leg || this.done) return this._finish(dt); }
    // bounced back into the air on a ground leg (a Rubber smash): fly again rather than "taxi" at 26 m
    if (!ac.onGround && ac.agl > 8 && !this.manualNow && /^(taxi|hold|park)$/.test(leg?.kind) && !(this._airRe > ac.time - 2)) {
      this._airRe = ac.time; this.replan(); leg = this.leg;
    }

    if (this.forceRecover) {
      this.forceRecover = false;
      if (!ac.onGround && ((ac.agl < 150 && ac.vs < -1) || Math.abs(ac.bank) > 0.5 || this._upset())) {
        this.recovering = true; this._emit('recovery', { low: ac.agl < 150 });
        // a latched lever stays the player's (PLAYTEST_3 #8) unless this is a real upset or it is near idle
        if (this._upset() || ac.stalled || (this.playerThrottle ?? 0) < 0.3) this.wantThrottleAuto = true;
      }
    }
    if (!ac.onGround && !this.recovering && !this.overridden && this._upset()) { this.recovering = true; this.wantThrottleAuto = true; this._emit('recovery', {}); }
    if (this.recovering) {
      const low = ac.agl < 150, vst = this._vstall();
      // LAND after an upset: once the wings are level and the nose is out of the dive the approach arrests the sink itself
      if (this.landing && !ac.onGround && Math.abs(ac.bank) < 0.5 && ac.pitch > -0.12 && ac.speed > vst * 1.05) this.recovering = false;
      else if (ac.onGround || (Math.abs(ac.bank) < 0.3 && ac.speed > vst * 1.3 && ac.pitch > -0.2 && ac.pitch < 0.3 && (!low || ac.vs > 0.5))) {
        this.recovering = false; this.replan();
      } else {
        this.phase = 'RECOVERY';
        // STORY2: a latched lever too low to climb away on kept it in RECOVERY at ~30 m for minutes: take it back
        if (low && ac.vs < 0.5 && this.playerThrottle != null && (this._recLow = (this._recLow || 0) + dt) > 2) { this.wantThrottleAuto = true; this._recLow = 0; }
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
    if (this.homing && !ac.onGround && t.air && !t.direct) {
      // world boundary (traffic._boundary): turn for home first, whatever the leg says, at the type's best rate
      const [hx, hz] = homeCenter(), hb = bearing(ac.pos.x, ac.pos.z, hx, hz);
      if (Math.abs(wrap180(hb - ac.track)) > 45) { t.bank = this._bankFor(hb, 30 * (ac.P.apBankScale > 1 ? 1.33 : 1)); t.speed = Math.min(t.speed ?? ac.speed, Math.max(ac.P.vcruise, this._vstall() * 1.5)); }
    }
    if (this.stickManual && !ac.onGround) {
      // the player is flying: no flap schedule and no speed-hold on the throttle underneath them (PLAYTEST_2 B3: a
      // speed-hold idled the engine in any bank or dive). The throttle stays where it was; power only near the stall.
      if (this._ov == null) this._ov = { flaps: this.out.flaps, thr: Math.max(this.ac.ctl.throttle, 0.55) };   // PLAYTEST_3 #8: never hand over an idle engine
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
  // ground pursuit lookahead: a 25 m wheelbase (jumbo) snakes on the C172's 7–22 m
  _gLook() { const g = this.ac.P.gear; return clamp(this.ac.speed * 2.4, 7, 22) + (this.ac.P.jet ? Math.abs(g.nose - g.main[1]) * 0.6 : 0); }
  _taxi(t, leg) {
    const ac = this.ac;
    const pr = this._pursue(this.cur.path, this._gLook());
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
    this.landing = plan; this.tgo = false; this.wantThrottleAuto = true; this._landDown = false; this._landGAs = 0;
    this.setRoute(plan.route);
    this._emit('replan', { to: 'land', label: plan.label });
    return true;
  }
  cancelLand() {
    let prev = this._landPrev;
    this.landing = null; this._landPrev = null;
    if (!prev?.route) return false;
    // the player never flies back onto an AI departure (it ends in despawn): circuits on that runway instead
    if (this.isPlayer && prev.route.legs.some((l) => l.kind === 'despawn')) {
      const end = prev.route.legs.find((l) => l.kind === 'takeoff')?.end ?? allRunwayEnds().find((e) => !e.rw.closed)?.id;
      prev = { route: circuitRoute(end, this._circOpts()), i: 1 };
    }
    this.route = prev.route; this.i = prev.i; this.done = false; this.override = null;
    this._begin(true); this.replan();
    this._emit('landcancel', {});
    return true;
  }

  // The route to carry on with from a takeoff on `end`: this route's (or, after LAND, the pre-LAND route's) takeoff leg,
  // else a departure for AI. FLIGHTFIX3: the player never gets an AI departure (it ends in `despawn` = GONE ~10 km
  // out): a LAND plan has no takeoff leg, so DEMAND TAKEOFF used to fall through to one. The player flies circuits.
  _takeoffRoute(end) {
    const usable = (r) => r && r.legs.some((l) => l.kind === 'takeoff') && !(this.isPlayer && r.legs.some((l) => l.kind === 'despawn'));
    const r0 = [this.route, this._landPrev?.route].find(usable);
    if (r0) {
      const ti = r0.legs.findIndex((l) => l.kind === 'takeoff');
      if (r0.legs[ti].end === end) return { route: r0, i: ti, override: null };
      if (!r0.name?.startsWith('circuits')) return { route: r0, i: ti, override: { end } };   // a story route: just this end
    }
    if (this.isPlayer || r0) {
      const r = circuitRoute(end, this._circOpts());
      return { route: r, i: r.legs.findIndex((l) => l.kind === 'takeoff'), override: null };
    }
    const r = departureRoute(end);
    return { route: r, i: r.legs.findIndex((l) => l.kind === 'takeoff'), override: null };
  }
  _circOpts() { return this.route?.circ || this._landPrev?.route?.circ || { type: this.ac.type }; }

  // D21 DEMAND TAKEOFF: taxi straight to the nearest usable runway start and go — no queue, no clearance.
  // ends: candidate runway ends (default 09/27's); prefer: the active end (others cost 25 % more).
  demandTakeoff({ ends = allRunwayEnds().filter((e) => !e.rw.closed).map((e) => e.id), prefer = null, minRun = null } = {}) {
    const ac = this.ac;
    // JETCORE: a jet needs its takeoff run plus 10 % (the jumbo: the whole runway, from the threshold)
    minRun ??= this._minRun();
    if (!ac.onGround) return false;
    const pathLen = (pts) => { let L = 0; for (let k = 1; k < pts.length; k++) L += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]); return L; };
    const busy = (x, z) => (this.traffic?.list || []).some((o) => o.ac !== ac && o.ac.onGround && Math.hypot(o.ac.pos.x - x, o.ac.pos.z - z) < 70);
    let best = null;
    for (const id of ends) {
      const e = runwayEnd(id);
      const here = toRunway(e, ac.pos.x, ac.pos.z);
      // already on this runway pointing the right way with room to go: just roll
      if (onRunway(ac.pos.x, ac.pos.z, 2) === e.rw && Math.abs(wrap180(e.hdg - ac.heading)) < 60 && e.len - here.s > minRun && here.s < e.len * 0.45) { best = { id, L: -1, entry: null }; break; }
      for (const en of runwayEntries(id)) {
        if (en.left < minRun || (en.left < e.len - 50 && en.left < 600)) continue;   // short strips from the threshold; intersections keep 600 m (a mid-runway line-up there stalls)
        let L = pathLen(taxiPath(ac.pos.x, ac.pos.z, ac.heading, { xz: [en.x, en.z] }));
        if (busy(en.x, en.z)) L += ac.P.jet ? 3000 : 500;   // a jet cannot squeeze past whoever waits at that hold: the other end
        if (prefer && id !== prefer) L = L * 1.25 + 50;
        if (!best || L < best.L) best = { id, L, entry: [en.x, en.z] };
      }
    }
    // FLIGHTFIX3: a royal shortcut — straight across the grass onto the runway (≤ 450 m, clear of buildings/water,
    // runway left ≥ minRun) when that beats the taxiways (from the terminal stands it is ~230 m straight ahead)
    for (const id of ends) {
      const e = runwayEnd(id), p = toRunway(e, ac.pos.x, ac.pos.z);
      if (Math.abs(p.l) < e.width) continue;   // already on it: handled above
      const sIn = clamp(p.s + Math.min(60, Math.abs(p.l) * 0.4), 0, e.len);   // meet the centreline at an angle: a smaller line-up turn
      const [ex, ez] = fromRunway(e, sIn, 0), d = Math.hypot(ex - ac.pos.x, ez - ac.pos.z);
      if (e.len - sIn < Math.min(minRun, Math.max(350, (typeInfo(ac.type).performance?.takeoffRollM ?? 290) * 1.8)) || d > 450 || !this._directClear(ac.pos.x, ac.pos.z, ex, ez)) continue;
      let L = d * 1.1 + 60 + (Math.abs(wrap180(bearing(ac.pos.x, ac.pos.z, ex, ez) - ac.heading)) > 100 ? 80 : 0);
      if (busy(ex, ez)) L += 500;
      if (prefer && id !== prefer) L = L * 1.25 + 50;
      if (!best || L < best.L) best = { id, L, entry: [ex, ez], direct: true };
    }
    if (!best) return false;
    this._endStovl();
    const T = this._takeoffRoute(best.id);
    this.landing = null; this._landPrev = null;
    this.route = T.route; this.i = T.i; this.done = false; this.override = T.override;
    this.demand = true; this.demandEntry = best.entry; this.demandDirect = !!best.direct; this.wantThrottleAuto = true;
    this._begin(true);
    this._emit('demand', { end: best.id, entry: best.entry, direct: !!best.direct });
    return best.id;
  }

  // a straight ground run from (x0,z0) to (x1,z1): no building/collider (8 m margin) or water on the way
  _directClear(x0, z0, x1, z1) {
    const env = this.traffic?.env, d = Math.hypot(x1 - x0, z1 - z0);
    if (!env) return false;
    for (let k = 0; k <= d; k += 4) {
      const x = x0 + (x1 - x0) * k / d, z = z0 + (z1 - z0) * k / d, sf = env.surfaceAt?.(x, z);
      if (sf === 'water' || sf === 'building') return false;
      for (const b of env.colliders || []) if (x > b.min[0] - 8 && x < b.max[0] + 8 && z > b.min[2] - 8 && z < b.max[2] + 8) return false;
      if (env.treeTop && env.treeTop(x, z, 6) > -1e8) return false;   // main.js treeTop: -Infinity = no tree
    }
    return true;
  }

  // D22 skip to runway: lined up on `end` at once, waiting for the takeoff clearance as if we had taxied there.
  skipToRunway(end, env = this.traffic?.env) {
    const e = runwayEnd(end), [x, z] = fromRunway(e, 12, 0), ac = this.ac;
    this._endStovl();
    ac.place({ x, z, heading: e.hdg }, env);
    const T = this._takeoffRoute(end);
    this.route = T.route; this.i = T.i; this.done = false; this.override = T.override; this.demand = false; this.landing = null; this._landPrev = null;
    this.wantThrottleAuto = true;
    this._begin(true);
    this.sub = 'ready';
    this._emit('skiptorunway', { end });
    return true;
  }

  // FLIGHTFIX3: DEMAND TAKEOFF from a field — turn onto a clear run right here and go, then fly `end`'s circuit
  // (no 2 km grass taxi, no teleport). world: the planner world (trees!). false = no clear run: the caller decides.
  fieldTakeoff({ world = null, end = null, need = null } = {}) {
    const ac = this.ac;
    if (!ac.onGround || !world) return false;
    if (ac.P.stovl) return this.verticalTakeoff({ flyOn: true, end }) ? { vto: true } : false;
    // JETCORE: jets do not take off from turnip fields. false = main falls back (DEMAND TAKEOFF / its hop)
    if (ac.P.noField) { this._emit('refused', { what: 'fieldTakeoff', quip: FIELD_QUIPS[(this._fq = (this._fq || 0) + 1) % FIELD_QUIPS.length] }); return false; }
    const book = typeInfo(ac.type).performance?.takeoffRollM ?? 290;
    const run = takeoffRun(world, { x: ac.pos.x, z: ac.pos.z, heading: ac.heading, need: need ?? Math.round(book * 1.35 + 40) });
    if (!run) return false;
    const ends = allRunwayEnds().filter((x) => !x.rw.closed);
    end = end || ends[0]?.id;
    const [ux, uz] = [Math.sin(run.heading * DEG), -Math.cos(run.heading * DEG)];
    const e = { id: 'FIELD', virtual: true, label: 'FIELD', hdg: run.heading, u: [ux, uz], thr: run.start, far: run.end, len: run.length, width: 24, elev: run.elev };
    const circ = this._circOpts(), c = circuitRoute(end, circ);
    this.landing = null; this._landPrev = null;
    this.route = { ...c, name: c.name, legs: [{ kind: 'takeoff', end: e, alt: 60, label: 'TAKEOFF' }, ...c.legs], loop: 1 };
    this.i = 0; this.done = false; this.override = null;
    this.demand = true; this.demandEntry = null; this.wantThrottleAuto = true;
    this._begin(true);
    this._emit('demand', { end: 'FIELD', heading: run.heading, run: Math.round(run.length) });
    return run;
  }

  // FLIGHTFIX3: airborne after a teleport (main's last-resort field hop): drop LAND and fly `end`'s circuit from here.
  resumeCircuit(end = null) {
    end = end || allRunwayEnds().find((x) => !x.rw.closed)?.id;
    const c = circuitRoute(end, this._circOpts());
    this.landing = null; this._landPrev = null; this.demand = false;
    this.route = c; this.i = 1; this.done = false; this.override = null;
    this._begin(true); this.replan({ noLand: true });
    return true;
  }

  // FLIGHTFIX3: taxi to a stand (Hard's terminal finish) from wherever we stopped, then park. GAMEFIX calls it.
  taxiIn({ stand = 'auto' } = {}) {
    const ac = this.ac;
    if (!ac.onGround || ac.crashed) return false;
    const sid = stand === 'auto' ? this.traffic?.claimStand?.(ac) || 'S1' : (this.traffic?.claimStand?.(ac, stand) || stand);
    const circ = this._circOpts();
    this.landing = null; this._landPrev = null; this.demand = false; this.demandEntry = null;
    this.setRoute({ name: 'taxi in', legs: [{ kind: 'taxi', dest: { stand: sid }, label: 'TAXI IN' }, { kind: 'park', seconds: 1e9, label: 'PARKED' }], loop: null, circ });
    this._emit('taxiin', { stand: sid });
    return sid;
  }
  get taxiingIn() { return this.route?.name === 'taxi in' && this.leg?.kind === 'taxi' && !this.done; }

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
    if (this.demand || this.cur?.e?.virtual || this.leg?.kind !== 'takeoff' || !this.ac.onGround || !['lineup', 'roll', 'rotate', 'ready'].includes(this.sub)) return false;
    if (this.ac.P.jet && this.ac.speed > 0.35 * this.ac.P.vr) return false;   // a jet past ~50 kt is committed (no 140 kt aborts on 1400 m)
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
    if (this.overridden || this.demand || e.virtual) return true;
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
      const pr = this._pursue(this.cur.path, this._gLook());
      let vt = Math.min((this.demand ? 12 : 9) * this._gnd.v, Math.sqrt(2 * 0.7 * Math.max(0, pr.toEnd - 1.5)));
      if (this._gnd.turn < 1) vt = this._turnCaps(pr, vt);
      else if (Math.abs(wrap180(pr.hdg - ac.heading)) > 60 && ac.speed < 2) vt = Math.min(vt, 0.8);
      if (this.mischief === 'speed') vt = Math.max(vt, this._naughtyTaxi(pr));
      else if (this.isPlayer) vt = Math.max(vt, Math.min(this._gnd.turn < 1 ? 8 : 10, this._naughtyTaxi(pr)));
      if (this.demand && pr.toEnd < 30) vt = Math.max(vt, 4 * Math.min(1, this._gnd.turn * 1.25));   // rolling start
      if (this.demand && this._gnd.turn < 0.5) vt = Math.min(vt, 1.4 + Math.sqrt(2 * 0.7 * Math.max(0, pr.toEnd - 25)));   // FLIGHTFIX3: a narrow track (bathtub) arrives slow: the line-up turn tips it past ~1.6 m/s
      // JETCORE (loop jumbo-hard): a jet's DEMAND still waits at the hold line while someone is ON the runway (lined up,
      // rolling, landed): its nose 35 m ahead of the CG crept onto the runway, ATC then held the lined-up plane for ever
      // (or the jumbo bumped into it). Nose behind the hold line; it goes the moment the runway is physically clear.
      // (only someone on the pavement AHEAD of where we join it, or just behind: a plane lined up at the far threshold behind
      // our intersection departure is not in the way)
      const end0 = this.cur.path[this.cur.path.length - 1], sIn = end0 ? toRunway(e, end0.x, end0.z).s : 0;
      const onRw = P.jet && !e.virtual && (this.traffic?.list || []).some((o) => o.ac !== ac && o.ac.onGround && !o.ac.crashed && onRunway(o.ac.pos.x, o.ac.pos.z, 0) === e.rw && toRunway(e, o.ac.pos.x, o.ac.pos.z).s > sIn - 80
        // one that has sat still well beyond our lift-off point is waited for 40 s at most (it waits for us, ATC-wise)
        && (!this._jetGo || o.ac.gs > 1 || toRunway(e, o.ac.pos.x, o.ac.pos.z).s - sIn < (typeInfo(ac.type).performance?.takeoffRollM ?? 600) + 100));
      this._jetWait = false;
      if (this.demand && onRw && !onRunway(ac.pos.x, ac.pos.z, 2)) {
        // measured square off the centreline (a direct path comes in at an angle): nose behind the hold line, clear of ATC's 30 m
        const d = Math.min(pr.toEnd, Math.abs(toRunway(e, ac.pos.x, ac.pos.z).l)) - (HOLD_OFFSET ?? 50) - ac.dims.length * 0.5;
        if (d < 40) { vt = Math.min(vt, Math.sqrt(2 * 0.7 * Math.max(0, d))); this._jetWait = d < 3; }
      }
      if (this._jetWait && (this._jetWaitT = (this._jetWaitT ?? 0) + 1 / 120) > 40) this._jetGo = true;   // waited 40 s: a still one far beyond lift-off is passed
      this._holdLbl = null;
      vt = this._groundLimit(this._crossingLimit(pr, vt));
      t.gHeading = pr.hdg; t.gSpeed = this._holdingPos() ? 0 : vt;
      if (this._jetWait) { this._setPhase('HOLD SHORT · RUNWAY BUSY'); return; }
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
      const herrL0 = Math.abs(wrap180(pr.hdg - ac.heading)), tip = this._gnd.turn < 0.5 ? (herrL0 > 45 ? 1.4 : 2) : 9, herrL = Math.abs(wrap180(pr.hdg - ac.heading));   // FLIGHTFIX3: the bathtub tips past ~1.6 m/s in a turn
      if ((this.demand || e.virtual) && herrL > 20 && ac.speed > tip + 0.5) { t.gHeading = ac.heading; t.thr = 0; t.brakeOverride = 0.8; }   // brake straight (firmly: it once rolled on at 3 m/s for a minute), then turn
      if ((this.demand || e.virtual) && herrL > 20) t.gSpeed = Math.min(t.gSpeed, tip, e.virtual && herrL > 25 ? 4 * this._gnd.turn : 3.5 * Math.max(this._gnd.turn, 0.6));   // field: turn round tight onto the run
      const p = toRunway(e, ac.pos.x, ac.pos.z), k = this.demand ? (ac.time - (this._luT ?? ac.time) > 20 ? 4 : 2.5) : 1;   // DEMAND: a rolling start (looser after 20 s: never fiddle for a minute)
      if (Math.abs(p.l) < 2.5 * k && Math.abs(wrap180(e.hdg - ac.heading)) < 6 * k) { this.sub = this._mayEnterRunway(e, true) ? 'roll' : 'ready'; this.cur.k = 0; if (this.sub === 'roll') this._emit('takeoffroll', { end: e.id }); }
      return;
    }
    const pr = this._pursue(this.cur.line, Math.max(30, ac.speed * 2.6));
    if (this.sub === 'roll' && ac.speed < 8 && !this._mayEnterRunway(e, true)) { this.sub = 'ready'; return this._takeoff(t, leg); }
    if (this.sub === 'roll') {
      this._setPhase('TAKEOFF ROLL');
      t.gHeading = pr.hdg; t.gSpeed = 99; t.thr = 1; t.flaps = P.toFlaps ?? 0; t.elev = -0.05;
      // taildragger: stick back to keep the tail wheel planted, then forward to fly the tail up at ~0.8 Vr
      if (ac.taildragger) t.elev = ac.speed > 0.8 * P.vr ? clamp((0.035 - ac.pitch) * 5 - ac.w.x * 1.5, -0.7, 0.3) : 0.25;
      if (ac.speed >= P.vr * (e.virtual ? 0.9 : 1)) this.sub = 'rotate';   // grass: soft-field, off a little early
      return;
    }
    if (this.sub === 'rotate') {
      this._setPhase('ROTATE');
      t.air = true; t.pitch = P.rotPitch ?? 0.14; t.bank = 0; t.thr = 1; t.flaps = P.toFlaps ?? 0; t.rudHeading = pr.hdg; t.elevMin = ac.onGround && ac.pitch < (P.rotPitch ? Math.min(0.1, P.rotPitch * 0.7) : 0.1) ? 0.8 : null;
      if (ac.taildragger) { t.pitch = 0.11; t.elevMin = ac.onGround && ac.pitch < 0.07 ? 0.3 : null; }
      if (e.virtual && !ac.onGround) t.pitch = 0.17;   // grass: climb straight out of ground effect
      if (!ac.onGround && ac.agl > 4) this.sub = 'climb';
      return;
    }
    this._setPhase('CLIMB');
    this.demand = false; this.demandEntry = null;
    t.air = true; t.thr = 1; t.flaps = 0; t.speed = P.vy; t.vs = P.jet ? 9 : 6;
    if (P.jet) t.speed = Math.min(P.vy, Math.max(ac.speed, P.vr) + 3);   // accelerate on the excess thrust, never by diving
    t.bank = this._bankFor(pr.hdg, ac.agl < 60 ? 8 : 20);
    if (ac.agl > (leg.alt ?? 110)) {
      if (!e.virtual) return this._next();
      // off a field: straight into the circuit, from wherever we are. The virtual FIELD end goes with the leg (it must
      // never reach ATC / traffic / a later replan — tiger-hard: traffic.runwayFree threw on it and froze the sim)
      const r = this.route;
      this.route = { ...r, legs: r.legs.slice(1), loop: 0 }; this.i = 0; this.override = null;
      this._begin(true); this.replan({ noLand: true });
    }
  }

  _fly(t, leg) {
    const ac = this.ac;
    this._setPhase(leg.label || 'ENROUTE');
    if (ac.onGround && ac.speed < 15 && this.legT > 2) return this.replan();
    // jets: look ahead about one turn radius, or a 1.5 km radius overshoots every corner of the circuit
    const pr = this._pursue(this.cur.path, ac.P.jet ? clamp(ac.speed * ac.speed / (G * Math.tan(30 * (ac.P.apBankScale ?? 1) * DEG)) * 0.85, 170, 1800) : clamp(ac.speed * 7 * TYPES.c172.vcruise / ac.P.vcruise, 170, 380));
    if (pr.advanced > 0) {
      const steps = pr.advanced;
      for (let s = 0; s < steps; s++) {
        if (this.i + 1 >= this.route.legs.length) { this._next(); return; }   // wrap to route.loop (or done), never run off the end
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
    // jets: the path's speed-for-height trade would dive a slow-spooling heavy at the ground to make a leg speed 50 kt
    // higher (after a go-around); low down they accelerate on thrust only
    if (ac.P.jet && ac.agl < 400 && t.speed > ac.speed + 3) t.speed = ac.speed + 3;
    t.vs = clamp((pr.alt - ac.alt) * 0.12 + pr.slope * ac.gs, -5, 5);
    const sep = !this.overridden && !this.noAvoid && this.traffic?.airConflict?.(this);
    this.sep = sep || null;
    if (sep) {
      t.vs = clamp((sep.alt - ac.alt) * 0.15, -4, 5);
      if (sep.slow) t.speed = Math.min(t.speed, Math.max(this._vstall() * 1.35, this._kt(64)));
    }
    // a latched lever that cannot hold the path near the ground (slow, or sinking while the path is level) goes back
    // to the AP before the field arrives (the lever would fly it into the ground — FLIGHTFIX3 #6 lets the speed float)
    if (this.playerThrottle != null && !this.manualNow && ac.agl < 60 && t.vs > -1 && (ac.speed < this._vstall() * 1.3 || ac.vs < -2)) this.wantThrottleAuto = true;
    if (!(this._floorT > ac.time - 0.5)) { this._floorT = ac.time; this._floor = this._terrainFloor(pr.hdg, leg.clearance ?? (this.landing ? 35 : 120)); }
    const floor = this._floor;
    if (floor != null && ac.alt < floor + 40) {
      t.vs = Math.max(t.vs, ac.alt < floor ? clamp((floor - ac.alt) * 0.1, 1.5, 5) : 0);
      if (ac.alt < floor) t.speed = Math.min(t.speed, ac.P.vy);
    }
    // PLAYTEST_3 #9: handed back low and slow → wings nearly level and climbing before any real turn
    const lowSlow = this.isPlayer && !this.landing && ac.agl < 60 && ac.speed < this._vstall() * 1.4;
    t.bank = this._bankFor(pr.hdg, lowSlow ? 5 : this.isPlayer && !this.landing && ac.agl < 60 ? 15 : 30);
    if (lowSlow) { t.thr = 1; t.vs = Math.max(t.vs, 1); t.speed = Math.min(t.speed, ac.speed + 1); }   // full power, gentle climb, no dive for speed
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
    if (sub === 'flare' && this._flPrev !== 'flare') this._flT0 = ac.time;
    this._flPrev = sub;
    if (sub === 'goaround') {
      this._setPhase('GO AROUND');
      // jets sidestep 300 m toward the circuit side: a heavy going round must not climb straight up a departure's back
      const [fx, fz] = fromRunway(e, p.s + 800, P.jet && !e.virtual ? (circuitSide(e.id) === 'left' ? -300 : 300) : 0);
      t.air = true; t.thr = 1; t.flaps = ac.agl > 60 ? 0 : 1 / 3; t.speed = P.vy; t.vs = 5;
      if (P.jet) { t.speed = Math.max(P.vapp, Math.min(P.vy, ac.speed + 3)); t.vs = ac.agl < 30 ? 3 : 6; }   // spooling up: climb, never dive for speed
      t.bank = this._bankFor(bearing(ac.pos.x, ac.pos.z, fx, fz), P.jet && ac.agl < 40 ? 4 : 15);   // a jumbo's outboard pods touch at ~9° of bank
      if (this.landing && ac.agl > 50) { this._landCircuit(e); return this._fly(t, this.leg); }
      if (ac.agl > (P.jet ? 220 : 140)) { this._ignoreLand = e.id; this._ignoreUntil = ac.time + 40; this.replan(); }
      return;
    }
    if (sub === 'rollout') {
      this._setPhase('ROLLOUT');
      if (ac.mainsDown) this._landDown = true;
      const pr = this._pursue(this.cur.path, Math.max(25, ac.speed * 2.5));
      t.gHeading = pr.hdg; t.thr = 0; t.flaps = ac.flapsPos;
      t.elev = ac.speed > 20 ? (this.landing || P.jet ? clamp((0.01 - ac.pitch) * 10, -0.3, 0.25) : 0.25) : 0;   // nose wheel light, but never rotate back into the air
      if (this.landing && ac.groundTime > 0.3) t.flaps = 0;
      t.gSpeed = 7;
      t.brakeOverride = ac.noseDown && ac.speed > 9 ? clamp(0.25 + (ac.speed - 9) * 0.03, 0, 0.75) : null;
      if (P.jet && ac.mainsDown && ac.speed > 9) t.brakeOverride = P.brakeAP ?? 0.4;   // reversers + spoilers deploy with the brakes
      if (ac.taildragger) {
        t.elev = ac.tailDown ? 0.7 : ac.speed < P.vr ? 0.35 : this.landing ? clamp((0.03 - ac.pitch) * 6, -0.4, 0) : 0;
        // FLIGHTFIX3 (LAND): a fast wheel landing keeps the tail flying (no lift) until the wing can no longer fly at
        // the 3-point attitude; then the tail comes down, never pulled past it (a 44 kt tail-down pull hopped 0.9 m / 2.4 s)
        if (this.landing) t.elev = !ac.tailDown && ac.speed > P.vs0 ? clamp((0.01 - ac.pitch) * 6, -0.5, 0) : ac.speed < P.vs0 * 0.85 ? 0.7 : clamp((P.groundPitch - 0.01 - ac.pitch) * 25, -0.4, 0.5);
        t.brakeOverride = ac.tailDown && ac.speed > 9 ? clamp(0.15 + (ac.speed - 9) * 0.02, 0, 0.4) : ac.tailDown ? null : 0;
      }
      if (pr.toEnd < 40) t.gHeading = e.hdg;   // past the end of the path the pursuit point swings round
      if (this.landing && ac.speed > 3) t.brakeOverride = Math.max(t.brakeOverride ?? 0, ac.taildragger ? (ac.tailDown ? 0.4 : 0) : ac.noseDown ? 0.6 : 0);   // LAND: stop briskly
      if (this.landing && ac.speed > 3 && pr.toEnd < (ac.speed * ac.speed) / 3 + 30) t.brakeOverride = Math.max(t.brakeOverride ?? 0, ac.taildragger ? (ac.tailDown ? 0.45 : 0.1) : 0.7);
      if (!ac.mainsDown && ac.agl > (this.landing ? 0.5 : 1.2)) { this.sub = 'flare'; return; }
      if (this.tgo && !this.overridden && ac.mainsDown && ac.groundTime > 1.2 && this._touchAndGo(e)) return;
      if (ac.speed < 9 && ac.onGround) { this._emit('landed', { end: e.id }); this._next(); }
      return;
    }
    const sc = ac.P.vcruise / TYPES.c172.vcruise, pr = this._pursue(this.cur.path, clamp(d * 0.22, 70, 350) * (sc < 1 ? sc * sc : Math.sqrt(sc)));
    t.air = true;
    if (sub === 'flare') {
      this._setPhase('FLARE');
      // LANDFIX2 (LAND only; circuits unchanged): down within ~2-4 s. Fast (a LAND from a dive) = no float: flaps up, nose
      // may go below level, never climb
      const N = !!this.landing, fast = N && ac.speed > P.vapp * 1.12, el = ac.time - (this._flT0 ?? ac.time);
      t.thr = fast ? 0 : ac.agl > 3 ? 0.08 : 0; t.flaps = fast ? 0 : 1;
      // sink relative to the ground under us: a field falling away 1.5 % used to float the flare for ever (B2)
      const env = this.traffic?.env, gr = env?.groundHeightAt ? env.groundHeightAt(ac.pos.x + ac.vel.x, ac.pos.z + ac.vel.z) - env.groundHeightAt(ac.pos.x, ac.pos.z) : 0;
      const gRate = clamp(gr, -3, 3);
      t.vs = gRate - (N ? clamp(ac.agl * 0.55, 0.95 + Math.max(0, el - 1.5), 2.4) : clamp(ac.agl * 0.42, 0.3, 2.6));
      if (P.jet && !fast) t.vs = gRate - clamp(ac.agl * 0.3, 0.7 + Math.max(0, el - 4) * 0.4, 2.6);   // a long, slow-pitching flare
      t.pitchMin = !N ? 0.012 : fast ? -0.04 : ac.speed > P.vapp * 1.03 ? -0.02 : 0.012 - clamp((el - 0.8) * 0.03, 0, 0.02); t.free = true;
      if (ac.taildragger) {
        const hold = fast ? 0 : clamp((ac.speed - P.vs0) / (P.vapp - P.vs0) * 1.3, 0, 1) * (N ? clamp((3 - el) / 1.5, 0, 1) : 1);   // a 3-point arrival floats a little by design
        t.vs = gRate - clamp((ac.agl - hold) * 0.6, fast ? 0.8 : N ? clamp((el - 1.5) * 0.5, 0.06, 0.7) : 0.06, 2.6);   // tail up, the mains touch above agl 0
        if (!fast) t.pitchMin = P.groundPitch * clamp((P.vapp - ac.speed) / (P.vapp - P.vs0 * 1.05), 0.1, 0.95);  // hold off into the 3-point attitude as it slows
      }
      if (N && ac.vel.y > 0.3) t.vs = Math.min(t.vs, gRate - 2);
      // LAND on a short strip: a floating hold-off is put down by a quarter of the way along, not gone round from
      if (this.landing && d < -e.len * 0.3) t.vs = Math.min(t.vs, gRate - 0.5);
      t.bank = this._bankFor(pr.hdg, 5); t.rudHeading = e.hdg;
      t.speed = P.vapp;
      if (ac.mainsDown && (!this.landing || ac.vel.y < 1)) { this.sub = 'rollout'; this.cur.k = 0; }   // LAND: a rubber bounce pops up ≥ 2 m/s: still flying
      else if (d < -e.len * (this.landing ? 0.65 : 0.45) && !this.overridden && !(this.landing && this._landDown)) this._goAround('long landing');   // a LAND that has touched down stays down
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
    // a heavy balloons when full flap goes out fast or flaps come and go: by speed, and never retracted on final
    if (P.jet) this._apFl = t.flaps = Math.max(this._apFl ?? 0, est && ac.speed < P.vapp * 1.12 ? 1 : 2 / 3);
    t.speed = est ? (this.landing && ac.taildragger ? Math.min(P.vapp, P.vs0 * 1.25) : P.vapp) : this._kt(75);   // LAND: a slower taildragger arrival = a short 3-point float
    let vs = -ac.gs * TANG + (gpAlt - ac.alt) * 0.22;
    if (d > 2600 && ac.alt < gpAlt) vs = Math.max(vs, 0);
    t.vs = clamp(vs, P.jet ? -Math.max(4.2, ac.gs * TANG + 2) : -4.2, 3);   // a jet's glide path alone sinks ~5 m/s
    if (P.jet) t.free = true;   // jets fly the glide path and leave the speed to the throttle (no zooming to bleed it)
    if (this.landing && ac.agl < 60) {
      // LANDFIX2: low LAND never climbs back up to the glide path (level off and let it come down to us), never trades
      // excess speed for height, and only puts full flap out once slow enough not to balloon
      t.vs = Math.min(t.vs, d < AIM_DIST && ac.agl < 8 ? -1.2 : 0); t.noClimb = true;   // over the strip already: down, not along
      if (est && ac.speed > P.vapp * 1.2) t.flaps = Math.min(this.out.flaps, 1 / 3);
    }
    t.bank = this._bankFor(pr.hdg, ac.agl < 40 ? (P.jet ? (P.span > 30 ? (ac.agl < 12 ? 5 : 12) : 10) : !this.landing ? 8 : ac.agl > (ac.taildragger ? 6 : 4) ? 15 : ac.agl > 3 ? 10 : 8) : 25);
    this.t.target = { x: e.thr[0], z: e.thr[1], alt: gpAlt };
    if (this.mischief === 'lowpass' && !this.overridden && ac.agl < 12 && d < 400 && Math.abs(p.l) < e.width / 2) { this.sub = 'lowpass'; return; }
    const flAgl = P.flareAgl ? clamp(-ac.vs * 3.2, 3, P.flareAgl) : !this.landing ? 4.5 : clamp(-ac.vs * 1.3, ac.taildragger ? 1.5 : 2, 4.5);
    if (ac.agl < flAgl && d < (this.landing ? 400 : 900) && Math.abs(p.l) < e.width) { this.sub = 'flare'; this.iPitch = 0; return; }
    if (this.landing && ac.mainsDown && ac.vel.y < 1) { this.sub = 'rollout'; this.cur.k = 0; return; }   // already down short of the aim point: stay down
    if (this.landing && ac.time - (ac.lastTouchdown?.t ?? -9) < 3 && ac.agl < 15) { this.sub = 'flare'; this.iPitch = 0; return; }   // bounced: settle it back down
    if (this._jetTrafficAhead(e, d) && !this.overridden && !this._landDown) return this._goAround('traffic ahead');
    if (this.overridden || (this.landing && this._landDown)) return;
    const hi = ac.alt - gpAlt;
    if (d < 450 && ((Math.abs(p.l) > (this.landing ? 45 : 35) && d < (this.landing ? 150 : 450) && !(this.landing && ac.agl < 5)) || hi > (this.landing && e.len > 900 ? 80 : 45))) return this._goAround(Math.abs(p.l) > 35 ? 'not lined up' : 'too high');   // LAND on a long runway: land long rather than go round
    if (ac.agl < 50 && herr > (this.landing ? 45 : 30) && !(this.landing && ac.agl < 5)) return this._goAround('not lined up');   // LAND a few metres up: put it down, don't climb away
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

  // JETCORE see-and-avoid on final (AI only, only when a jet is involved): a 140 kt jet closing on a 65 kt light plane down
  // the same final (ATC sequences by distance; a light plane's base turn can put it right in front) goes round.
  // The player's own jet only for a collision course (≤ 600 m, closing): LAND refuses the tower's go-around otherwise, and a
  // jumbo on LAND flew into a C172 ahead on final (loop suite jumbo-hard).
  _jetTrafficAhead(e, d) {
    const ac = this.ac;
    if (!this.traffic || d < 250 || (this.isPlayer && !ac.P.jet)) return false;
    const far = this.isPlayer ? 600 : 900;
    const cool = ac.time - (this._tgaT ?? -1e9) < 90;   // after one, only a really close one sends it round again
    for (const o of this.traffic.list) {
      const b = o.ac;
      if (b === ac || b.onGround || b.crashed || !(ac.P.jet || b.P.jet)) continue;
      const dx = b.pos.x - ac.pos.x, dz = b.pos.z - ac.pos.z, dist = Math.hypot(dx, dz);
      if (dist > far || Math.abs(b.pos.y - ac.pos.y) > 90) continue;
      const ahead = dx * e.u[0] + dz * e.u[1], closing = ac.gs - (b.vel.x * e.u[0] + b.vel.z * e.u[1]);
      if (this.isPlayer ? ahead > 0 && closing > 5 && Math.abs(dx * -e.u[1] + dz * e.u[0]) < 150 && closing * 20 > dist - 100
        : ahead > 0 && Math.abs(dx * -e.u[1] + dz * e.u[0]) < 300 && ((!cool && closing * 25 > dist - 150) || dist < 300)) { this._tgaT = ac.time; return true; }
    }
    return false;
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
    if (this.landing) this._landGAs = (this._landGAs || 0) + (/occupied/.test(reason) ? 2 : 1);   // occupied: land long next time round
    this.tgo = false;
    this.sub = 'goaround';
    this._emit('goaround', { reason });
  }

  _bankFor(hdg, maxBankDeg) {
    const ac = this.ac, V = Math.max(ac.speed, 20);
    if (maxBankDeg >= 20 && ac.P.apBankScale) maxBankDeg *= ac.P.apBankScale;   // a fighter turns at 45°
    const err = wrap180(hdg - ac.track) * DEG;
    const rate = clamp(err * 0.4, -0.22, 0.22);
    return clamp(Math.atan((V * rate) / G), -maxBankDeg * DEG, maxBankDeg * DEG);
  }

  // ---------- replanning ----------
  // Called when the player lets go (or after a go-around / recovery). Works from wherever the aircraft is now.
  replan({ noLand = false } = {}) {
    const ac = this.ac;
    if (this.stovl) { this.stovl.hold = null; return; }
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
    const land = !noLand && this._landableEnd();
    if (land) {
      let ai = legs.findIndex((l) => l.kind === 'approach' && l.end === land.id);
      if (ai < 0) ai = legs.findIndex((l) => l.kind === 'approach');
      if (ai >= 0) {
        this.i = ai; this.override = legs[ai].end === land.id ? null : { end: land.id };
        this._begin(true); this._emit('replan', { to: 'approach', end: land.id }); return;
      }
    }
    // otherwise rejoin the best flying leg ahead of us — never one that only comes after landing and taking off again
    // (JETCORE: a jumbo going round on an arrival rejoined the appended departure: its circuit legs are 2.6 km away)
    const tko = legs.map((l, j) => (l.kind === 'takeoff' ? j : -1)).filter((j) => j >= 0);
    const afterTakeoff = (j) => tko.some((k) => (j > this.i ? k > this.i && k < j : false));
    let best = -1, bc = Infinity;
    for (let j = 0; j < legs.length; j++) {
      const l = legs[j];
      if (l.kind !== 'fly' || (ac.P.jet && afterTakeoff(j))) continue;
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
    this.route = { name: 'divert', legs: [...circuitLegs(e.id, this.route.circ || { type: ac.type }).slice(2), { kind: 'approach', end: e.id, label: 'FINAL', ...(this._circ().faf ? { fafDist: this._circ().faf } : {}) }, { kind: 'taxi', dest: { stand: 'auto' }, label: 'TAXI IN' }, { kind: 'park', seconds: 30 }], loop: null };
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
    // FLIGHTFIX3: gone round for an occupied runway (or twice for anything): a plane parked in the touchdown zone kept a
    // LAND circling for 5 min. Land long,
    // past whoever is sitting on the runway, when enough of it is left; the virtual end keeps the runway's id
    if ((this._landGAs || 0) >= 2 && e.rw) {
      if (e.virtual) e = runwayEnd(e.id);   // always measured on the real runway
      let sMax = -1e9;
      for (const o of this.traffic?.list || []) {
        if (o.ac === this.ac || !o.ac.onGround || o.ac.crashed) continue;
        const q = toRunway(e, o.ac.pos.x, o.ac.pos.z);
        if (q.s > -30 && q.s < e.len && Math.abs(q.l) < (e.width || 30) / 2 + 8) sMax = Math.max(sMax, q.s);
      }
      const s0 = sMax + AIM_DIST + 90, left = e.len - s0;   // the busy check looks from 30 m before the (virtual) threshold
      if (sMax > -1e9 && left >= 450) {
        const [tx, tz] = fromRunway(e, s0 - AIM_DIST, 0);
        e = { ...e, virtual: true, thr: [tx, tz], len: left + AIM_DIST };
        this._emit('landlong', { end: e.id, at: Math.round(s0) });
      }
    }
    const ac = this.ac, k = typeInfo(ac.type).circuitScale ?? 1;
    const p = toRunway(e, ac.pos.x, ac.pos.z), sg = Math.abs(p.l) > 40 ? Math.sign(p.l) : -1;
    let W = 750 * k, F = 1100 * Math.max(k, 0.8), A = e.elev + Math.max(110, 190 * k * k), bl = W * 0.35, faf = F - 250;
    // jets: k² made the jumbo's LAND circuit 1 km high and the F-35 arrived too high for its approach every time round
    if (ac.P.jet) { A = e.elev + Math.min(350, circuitOpts(ac.type).alt ?? 300); F = 1100 * k * 1.25; W = Math.max(W, 0.85 * ac.P.vcruise ** 2 / (G * Math.tan(30 * (ac.P.apBankScale ?? 1) * DEG)) * 1.6);
      // base a full turn radius out at base speed, the FAF where that turn rolls out (as the stretched circuits)
      bl = Math.max(W * 0.35, (ac.P.vapp * 1.15) ** 2 / (G * Math.tan(30 * (ac.P.apBankScale ?? 1) * DEG))); faf = F - bl * 1.05; }
    const gp = (s) => e.elev + (AIM_DIST - s) * TANG;
    const at = (s, l, a, label, speed, flaps = 0) => { const [x, z] = fromRunway(e, s, l * sg); return { kind: 'fly', to: [x, a, z], speed, flaps, clearance: 35, label }; };
    const s0 = Math.max(p.s + 500, e.len * 0.6);
    if (ac.P.jet && e.rw) {
      // jets: the type's own stretched circuit (proven geometry: base a turn radius out, FAF where it rolls out). The
      // squeezed light-plane LAND circuit left a jumbo still turning onto final at 50 m.
      const o = circuitOpts(ac.type), id = e.virtual ? runwayEnd(e.id).id : e.id;
      const legs = [...circuitLegs(id, { type: ac.type }).slice(1).map((l) => ({ ...l, clearance: 35, label: 'LAND · ' + l.label })),
        { kind: 'approach', end: e.virtual ? e : id, fafDist: o.faf ?? FAF_DIST, label: 'LAND', land: true }];
      this.route = { name: 'land', legs, loop: null }; this.i = 0; this.override = null; this.done = false; this.tgo = false;
      this._begin(true);
      if (!this._inLandCirc) { this._inLandCirc = true; try { this.replan(); } finally { this._inLandCirc = false; } }   // rejoin the nearest sensible leg (once: no recursion)
      this._emit('replan', { to: 'land', label: 'circuit' });
      return;
    }
    const legs = [
      at(s0, W * 0.6, A, 'LAND · CIRCUIT', 80),
      at(Math.min(e.len * 0.4, s0 - 400), W, A, 'LAND · CIRCUIT', 85),
      at(250 - F, W, Math.max(A - 40, gp(250 - F) + 40), 'LAND · CIRCUIT', 75, 1 / 3),
      at(-F, bl, gp(-F) + 15, 'LAND · BASE', 72, 1 / 3),
      { kind: 'approach', end: e.virtual ? e : e.id, fafDist: Math.round(faf), label: 'LAND', land: true },
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
    want.flaps = Math.max(t.flaps ?? o.flaps, t.air || this.ac.onGround === false ? this._minFlaps() : 0);
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
    const tf = Math.max(0.05, thrustFactor(P, V));
    const Tmax = P.thrustMax * tf, Tidle = P.thrustMax * P.idle * tf;
    const spd = t.speed ?? V;
    let pitchT;
    if (t.pitch != null) pitchT = t.pitch;
    else {
      const fixed = t.thr ?? this.playerThrottle;   // a latched lever: fly the path its power allows
      const thrMax = fixed != null ? P.thrustMax * (P.idle + (1 - P.idle) * fixed) * tf : Tmax;
      const thrMin = fixed != null ? thrMax : Tidle;
      const sp = t.noClimb ? Math.min(0, (V - spd) * 0.03) : (V - spd) * 0.03;
      const gMax = Math.asin(clamp((thrMax - D) / W, -0.5, 0.5)) + sp;
      const gMin = Math.asin(clamp((thrMin - D) / W, -0.5, 0.5)) - 0.05 + sp;
      let gamma = Math.asin(clamp(t.vs / V, -0.4, 0.4));
      // FLIGHTFIX3 (STORY2): a latched lever flies the path and lets the speed float (it used to zoom-climb to hold the
      // leg speed); only near the stall or well over cruise does the path give way
      if (!t.free && t.thr == null && this.playerThrottle != null) {
        if (V < this._vstall() * 1.3) gamma = Math.min(gamma, gMax);
        else if (V > P.vcruise * 1.2) gamma = Math.max(gamma, gMin);
      } else if (!t.free) gamma = clamp(gamma, Math.min(gMin, gMax), Math.max(gMin, gMax));
      pitchT = gamma + alphaReq * Math.cos(bank);
      this.iPitch = clamp(this.iPitch + (t.vs - ac.vs) * dt * 0.004, -0.05, 0.05);
      pitchT += this.iPitch;
    }
    if (t.pitchMin != null) pitchT = Math.max(pitchT, t.pitchMin);
    pitchT = clamp(pitchT, -0.3, P.maxPitchAP ?? 0.32);
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
      const Treq = D + W * Math.sin(gam) + P.mass * (spd - ac.speed) * 0.35 * clamp((P.spool ?? 1.2) / 1.2, 0.3, 1);   // slow-spooling jets: gentler, or it hunts
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

  // ---- D35 STOVL (F-35B): HOVER, VERTICAL TAKEOFF, LAND HERE, FLY ON (docs/STOVL.md) ----
  get stovlMode() { return this.stovl?.mode ?? null; }
  _endStovl() { if (this.stovl) this.stovl = null; this.ac.vtolWant = 0; }
  _fwdSpeed() { const h = this.ac.heading * DEG; return this.ac.vel.x * Math.sin(h) - this.ac.vel.z * Math.cos(h); }
  _stovlStart(st) {
    if (!this.stovl) this._stovlPrev = this._landPrev?.route ? this._landPrev : { route: this.route, i: this.i };
    this.landing = null; this._landPrev = null; this.demand = false;
    this.stovl = { t: 0, hold: null, ...st };
    this.ac.vtolWant = 1; this.wantThrottleAuto = true;
    this._emit('stovl', { mode: st.mode });
    return true;
  }
  // wing-borne (or flying on): slow to a hover straight ahead; jet-borne: stop and hold here
  hover() {
    const ac = this.ac, S = ac.P.stovl;
    if (!S || ac.crashed || ac.onGround) return false;
    const m = this.stovl?.mode, still = m === 'hover' || m === 'vto' || m === 'land';
    return this._stovlStart({ mode: still ? 'hover' : 'convert', vf: Math.max(0, this._fwdSpeed()), agl: clamp(ac.agl, still ? 4 : S.hoverAgl * 0.7, S.maxHoverAgl), end: this.stovl?.end });
  }
  verticalTakeoff({ flyOn = false, end = null } = {}) {
    const ac = this.ac, S = ac.P.stovl;
    if (!S || ac.crashed || !ac.onGround || ac.gs > CONVERT.vtoKt * KT) return false;   // rolling: brake to a stop first
    return this._stovlStart({ mode: 'vto', agl: S.hoverAgl, flyOn, end, hold: { x: ac.pos.x, z: ac.pos.z } });
  }
  landHere(pad) {
    const ac = this.ac, m = this.stovl?.mode;
    if (ac.onGround || !(m === 'hover' || m === 'vto')) return false;
    Object.assign(this.stovl, { mode: 'land', pad: { x: pad?.x ?? ac.pos.x, z: pad?.z ?? ac.pos.z }, t: 0 });
    this._emit('stovl', { mode: 'land' });
    return true;
  }
  flyOn() {
    const ac = this.ac;
    if (!this.stovl || ac.onGround) return false;
    Object.assign(this.stovl, { mode: 'flyon', vf: Math.max(0, this._fwdSpeed()), t: 0, agl: Math.max(ac.agl, 40) });
    this._emit('stovl', { mode: 'flyon' });
    return true;
  }
  // back to wing-borne flight: the circuit we were flying (or end's), from here
  _stovlExit() {
    const prev = this._stovlPrev?.route, end = this.stovl?.end || prev?.legs.find((l) => l.kind === 'takeoff' && typeof l.end === 'string')?.end || prev?.legs.find((l) => l.kind === 'approach' && typeof l.end === 'string')?.end;
    this.ac.hov = { vf: this.ac.P.vapp * 1.25, vl: 0, yaw: 0 };
    this._endStovl(); this._stovlPrev = null;
    this.resumeCircuit(end || null);
    this._emit('stovl', { mode: 'wingborne' });
  }
  // a velocity (heading frame) that flies toward p with gain k, capped
  _posHold(p, k, cap = 6) {
    if (!p || !k) return [0, 0];
    const ac = this.ac, h = ac.heading * DEG, dx = p.x - ac.pos.x, dz = p.z - ac.pos.z;
    let f = (dx * Math.sin(h) - dz * Math.cos(h)) * k, l = (dx * Math.cos(h) + dz * Math.sin(h)) * k;
    const n = Math.hypot(f, l); if (n > cap) { f *= cap / n; l *= cap / n; }
    return [f, l];
  }
  _stovlStep(dt) {
    const ac = this.ac, P = ac.P, S = P.stovl, lv = stovlLevel(ac.stovlLevel), st = this.stovl;
    st.t += dt;
    if (st.mode !== 'landed') ac.vtolWant = 1;
    let vf = 0, vl = 0, vs = 0, brake = 0;
    const manual = this.stickManual || this.overridden, holdAgl = (k = 0.6) => clamp((st.agl - ac.agl) * k, -S.vsDown * 0.8, 3);
    if (this.playerThrottle != null) { if (lv.autoLever && this.throttleLatched && !ac.onGround) this.wantThrottleAuto = true; st.agl = clamp(ac.agl, 3, 900); }
    switch (st.mode) {
      case 'vto':
        if (ac.onGround && (ac.vtol < 0.9 || ac.gs > 0.8)) { brake = 1; if (ac.gs > 0.8) st.hold = { x: ac.pos.x, z: ac.pos.z }; break; }
        vs = clamp((st.agl - ac.agl) * 0.5, 1.2, 4);
        [vf, vl] = this._posHold(st.hold, 0.5);
        if (ac.agl > st.agl - 1.5) { st.mode = st.flyOn ? 'flyon' : 'hover'; st.vf = 0; st.t = 0; this._emit('stovl', { mode: st.mode }); }
        break;
      case 'convert': {
        st.vf = Math.min(moveTo(st.vf, 0, 2.8 * dt), Math.max(0, this._fwdSpeed()) + 4);
        vf = st.vf; vs = holdAgl(0.15);
        if (st.vf < 0.5 && ac.gs < 2) { st.mode = 'hover'; st.hold = null; st.t = 0; this._emit('stovl', { mode: 'hover' }); }
        break;
      }
      case 'hover':
        if (manual) st.hold = null;
        else if (!st.hold && ac.gs < 1.5) st.hold = { x: ac.pos.x, z: ac.pos.z };
        [vf, vl] = this._posHold(st.hold, lv.hold);
        vs = holdAgl();
        if (ac.mainsDown) { st.mode = 'landed'; st.t = 0; }   // let down (too hot, or the lever) onto the ground: settle
        break;
      case 'land': {
        if (this.stickManual) { st.mode = 'hover'; st.hold = null; st.agl = Math.max(ac.agl, 4); this._emit('stovl', { mode: 'hover', cancelled: true }); break; }
        [vf, vl] = this._posHold(st.pad, lv.land);
        const d = Math.hypot(st.pad.x - ac.pos.x, st.pad.z - ac.pos.z);
        if (d < 10 || st.t > 15) vs = ac.agl < 4 ? -lv.sink : -clamp(ac.agl * 0.3, lv.sink, S.vsDown * 0.9);
        else vs = holdAgl();
        if (ac.mainsDown) { st.mode = 'landed'; st.t = 0; }
        break;
      }
      case 'landed':
        vs = -S.vsDown; brake = 1;
        if (st.t > 0.6) ac.vtolWant = 0;
        if (ac.vtol <= 0) {
          this._endStovl(); this._stovlPrev = null;
          this.route = { name: 'vland', legs: [{ kind: 'park', seconds: 1e9, label: 'LANDED' }], loop: null, circ: this._circOpts() };
          this.i = 0; this.done = true; this.override = null; this.phase = 'DONE';
          this._emit('stovl', { mode: 'down' });
          this._emit('landed', { vertical: true, x: ac.pos.x, z: ac.pos.z });
          return this.out;
        }
        break;
      case 'flyon':
        st.vf = moveTo(Math.max(st.vf, this._fwdSpeed() - 2), P.vapp * 1.3, 3.2 * dt);
        vf = st.vf; vs = clamp((st.agl - ac.agl) * 0.3, 0.6, 3);
        if (ac.speed > P.vapp * 1.12 && ac.agl > 20) { this._stovlExit(); return this.update(0); }
        break;
    }
    ac.hov = { vf, vl, yaw: 0 };
    this._setPhase({ vto: 'VERTICAL TAKEOFF', convert: 'HOVER', hover: 'HOVER', land: 'LAND HERE', landed: 'LAND HERE', flyon: 'FLY ON' }[st.mode] || 'HOVER');
    if (this.manualNow) this._setPhase('MANUAL', true);
    Object.assign(this.out, { aileron: 0, elevator: 0, rudder: 0, throttle: vsToLever(vs, S, lv), flaps: P.toFlaps ?? 0, brake });
    return this.out;
  }

  status() {
    const l = this.leg;
    return {
      engaged: this.engaged, overridden: this.overridden, phase: this.phase, sub: this.sub, leg: l?.kind, legIndex: this.i,
      label: l?.label, route: this.route?.name, recovering: this.recovering, done: this.done,
      target: this.t.target || null, speedKt: this.t.speed ? this.t.speed / KT : null, end: typeof l?.end === "object" ? l.end?.id : l?.end,
      stableFinal: this.stableFinal, stovl: this.stovl?.mode ?? null,
    };
  }
}
