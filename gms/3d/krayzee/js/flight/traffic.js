import { runwayEnd, toRunway, onRunway, AIM_DIST, heavySpot, isHeavy, BOUNDARY, homeCenter } from './routes.js';
import { typeInfo } from './aircraft.js';
import { setLandAircraft } from '../assist/landahead.js';
import { STANDS } from '../world/layout.js';
import { clamp, lerp } from './vmath.js';
import { PROTECTION } from '../../data/rules.js';

export const AXES = ['aileron', 'elevator', 'rudder', 'throttle', 'flaps', 'brake'];
export const OVERRIDE = { deadzone: 0.08, wait: 1.5, blend: 2.0 };
// Wake turbulence (arcade, survivable): per roster `wake` class. str = peak roll acceleration (rad/s²) at the core,
// r = core radius (m), life = seconds a vortex lasts (sinking SINK m/s). Only planes under half the source's mass feel it.
export const WAKE = { super: { str: 7, r: 45, life: 70 }, heavy: { str: 4, r: 32, life: 50 }, medium: { str: 1.8, r: 18, life: 30 }, SINK: 0.6, band: [-30, 30], every: 0.5 };
const QUIPS = {
  warn: ['Your Majesty, that way lies Abroad. We do not do Abroad.', 'Sire, the map ends rather soon. The cartographer is on holiday.', 'Your Grace, beyond those hills there be foreigners. Turn back?'],
  turnback: ['Turning you home, Sire. Abroad has been informed you are not coming.', 'Royal escort engaged: home we go, Your Majesty. Mind the hedge.', 'The Kingdom ends here, Your Grace. The autopilot insists.'],
};

// Owns every aircraft in the world: fixed-step simulation, the player-vs-autopilot mixer, and the
// little bits of shared knowledge the autopilots need (runway occupancy, stands, taxi spacing).
export class Traffic {
  constructor(env, { hz = 120, aiProtection = null } = {}) {
    this.env = env; this.h = 1 / hz; this.acc = 0; this.list = []; this.standOwner = new Map(); this.time = 0;
    this.aiProtection = aiProtection;
  }

  // Room/mission protection for AI planes ('rubber' | 'partial' | 'realistic' | null = crash on any hit).
  setAIProtection(mode) {
    this.aiProtection = mode;
    for (const e of this.list) if (!e.player && !e.remote) e.ac.impactHandler = mode ? aiImpactHandler(mode) : null;
  }

  add({ aircraft, ap = null, rig = null, player = false, remote = false, name = '' }) {
    const ent = {
      ac: aircraft, ap, rig, player, remote, name,
      manual: Object.fromEntries(AXES.map((a) => [a, null])),
      axis: Object.fromEntries(AXES.map((a) => [a, { mode: 'auto', t: 0, val: 0 }])),
      apOff: false,
      bnd: { warned: false, lock: false, n: 0 },
    };
    if (ap) { ap.traffic = this; ap.isPlayer = !!player; if (player && ap.finalLen === undefined) ap.finalLen = 1300; }
    if (player) setLandAircraft(aircraft.type);   // LAND plans for the player's type (jets: runways only)
    if (!player && !remote && this.aiProtection && !aircraft.impactHandler) aircraft.impactHandler = aiImpactHandler(this.aiProtection);
    this.list.push(ent);
    return ent;
  }

  remove(ent) {
    this.list = this.list.filter((e) => e !== ent);
    this.releaseStand(ent.ac);
  }

  find(ac) { return this.list.find((e) => e.ac === ac); }

  // Advance the world by a frame; returns the interpolation fraction for rendering.
  update(dt) {
    this.acc = Math.min(this.acc + dt, 0.6);
    while (this.acc >= this.h) {
      this.acc -= this.h; this.time += this.h;
      for (const e of this.list) {
        if (e.remote) continue;
        this._mix(e, this.h);
        e.ac.step(this.h, this.env);
      }
      if ((this._wk = (this._wk || 0) + 1) >= 6) { this._wake(this._wk * this.h); this._wk = 0; }
    }
    this._contacts();
    return this.acc / this.h;
  }

  // Aircraft-to-aircraft contact. onContact({ a, b, relSpeed, remote }) may handle it (SCORE/ATC);
  // the physical response goes through each aircraft's impact handler, so rubber planes bounce off each other.
  _contacts() {
    const L = this.list;
    for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
      const A = L[i], B = L[j], a = A.ac, b = B.ac;
      if (a.crashed || b.crashed) continue;
      const dx = b.pos.x - a.pos.x, dy = b.pos.y - a.pos.y, dz = b.pos.z - a.pos.z;
      const r = (a.dims.span + b.dims.span) * 0.3;
      const d = Math.hypot(dx, dz);
      const key = a.id + '|' + b.id;
      // vertical: compare the airframes' middles (a jumbo's CG is 4.8 m up, a C172's 1.2 m: both sit on the ground)
      const dyc = dy - (b.dims.height / 2 - b.dims.gearHeight) + (a.dims.height / 2 - a.dims.gearHeight);
      if (d > r || Math.abs(dyc) > Math.max(2.6, (a.dims.height + b.dims.height) * 0.3)) { this._touching?.delete(key); continue; }
      (this._touching ||= new Set());
      const fresh = !this._touching.has(key);
      this._touching.add(key);
      const nx = d > 0.01 ? dx / d : 1, nz = d > 0.01 ? dz / d : 0, pen = (r - d) / 2;
      const rel = Math.hypot(a.vel.x - b.vel.x, a.vel.y - b.vel.y, a.vel.z - b.vel.z);
      if (!fresh) { a.pos.x -= nx * pen; a.pos.z -= nz * pen; b.pos.x += nx * pen; b.pos.z += nz * pen; continue; }
      const ev = { a: A, b: B, relSpeed: rel, remote: !!(A.remote || B.remote) };
      this.onContact?.(ev);
      a.emit('collision', { other: b.id, remote: !!B.remote, relSpeed: rel });
      b.emit('collision', { other: a.id, remote: !!A.remote, relSpeed: rel });
      const why = (o) => (a.onGround && b.onGround ? `bumped into ${o}` : `mid-air collision with ${o}`);
      const gentle = rel < 6 && a.onGround && b.onGround;
      for (const [E, o, s] of [[A, B, -1], [B, A, 1]]) {
        if (E.remote) continue;
        const n = [s * nx, 0, s * nz];
        if (gentle && !E.ac.impactHandler) { E.ac._push(n, pen); E.ac.vel.scale(0.3); }
        else E.ac._impact('aircraft', why(o.name || o.ac.id), { n, pen, onGear: false, other: o.ac.id, speedKt: rel / 0.514444 });
      }
    }
  }

  // Player input → per-axis override; release → wait (AP holds attitude, wings level), blend back, replan.
  // The throttle is a lever (PLAYTEST_2 B4): released it stays LATCHED where it was put until the player hands it back
  // (releaseThrottle — the lever's AUTO detent), a full resume(), an AP command (LAND, DEMAND TAKEOFF, skip to runway)
  // or an upset recovery. On the ground a lever left at idle goes back to the AP at once.
  // Releasing the stick low, sinking or banked hard skips the wait: the AP recovers at once.
  _mix(e, h) {
    const ac = e.ac, ap = e.ap, A = e.axis;
    if (e.player && ap) this._boundary(e);
    if (ap?.wantResume) { ap.wantResume = false; this.resume(e); }
    if (ap?.wantThrottleAuto) { ap.wantThrottleAuto = false; this.releaseThrottle(e); }
    const stickAxes = ['aileron', 'elevator', 'rudder'];
    const urgent = !ac.onGround && (ac.agl < 150 || ac.vs < -3.6 || Math.abs(ac.bank) > 1.05 || ac.stalled);
    let wait = false;
    for (const k of stickAxes) if (A[k].mode === 'wait') wait = true;
    if (ap) {
      ap.manualNow = AXES.some((k) => e.manual[k] != null && k !== 'throttle');
      ap.stickManual = stickAxes.some((k) => e.manual[k] != null);
      ap.attHold = wait && !ac.onGround;
      ap.playerThrottle = A.throttle.mode === 'manual' || A.throttle.mode === 'latched' ? A.throttle.val : null;
      ap.playerBrake = e.manual.brake;
    }
    const apOut = ap && !e.apOff ? ap.update(h) : null;
    let anyManual = false, anyWait = false, replan = false, recover = false;
    for (const k of AXES) {
      const st = A[k];
      let m = e.bnd?.lock && k !== 'brake' ? null : e.manual[k];   // the royal escort has the stick (and the throttle)
      // stick X steers the nosewheel on the ground when the rudder buttons are not in use
      if (k === 'rudder' && m == null && ac.onGround && e.manual.aileron != null) m = e.manual.aileron;
      if (m != null) {
        if (st.mode !== 'manual') { st.mode = 'manual'; if (ap && k !== 'throttle') { ap._emit('override', { axis: k }); ap.lastOverride = ac.time; } }
        st.val = m; st.t = 0;
      } else if (st.mode === 'manual') {
        st.t = 0;
        if (k === 'throttle' && (st.val > 0.05 || !ac.onGround)) st.mode = 'latched';
        else if (urgent && k !== 'throttle' && apOut) { st.mode = 'blend'; st.from = st.val; st.dur = 0.25; replan = true; recover = true; }
        else { st.mode = 'wait'; st.dur = OVERRIDE.blend; if (k === 'elevator' || k === 'aileron' || k === 'rudder') st.val = 0; }
      } else if (st.mode === 'latched') {
        st.t = 0;
        if (ac.onGround && st.val <= 0.05 && apOut) { st.mode = 'blend'; st.from = st.val; st.dur = OVERRIDE.blend; }
      } else if (st.mode === 'wait') {
        st.t += h;
        if (st.t >= OVERRIDE.wait || (urgent && k !== 'throttle')) { st.mode = 'blend'; st.t = 0; st.from = k !== 'throttle' && apOut && !ac.onGround ? apOut[k] : st.val; st.dur = urgent ? 0.25 : OVERRIDE.blend; replan = true; }
      } else if (st.mode === 'blend') {
        st.t += h;
        if (st.t >= (st.dur || OVERRIDE.blend)) st.mode = 'auto';
      }
      if (st.mode === 'manual') anyManual = true;
      if (st.mode === 'wait') anyWait = true;
      let v;
      if (!apOut) v = st.mode === 'auto' ? (k === 'brake' ? 0 : k === 'throttle' || k === 'flaps' ? ac.ctl[k] : 0) : st.val;
      else if (st.mode === 'auto') v = apOut[k];
      else if (st.mode === 'wait' && k !== 'throttle' && k !== 'brake' && k !== 'flaps' && !ac.onGround) v = apOut[k]; // AP attitude hold
      else if (st.mode === 'blend') {
        const f = Math.min(1, st.t / (st.dur || OVERRIDE.blend)), s = f * f * (3 - 2 * f);
        v = lerp(st.from, apOut[k], s);
      } else v = st.val;
      ac.ctl[k] = v;
    }
    if (ap) {
      ap.overridden = anyManual || anyWait;
      if (replan && !anyManual && !e.apOff) ap.replan();
      if (recover) ap.forceRecover = true;
    }
  }

  // The lever's AUTO detent: a latched (or held) throttle goes back to the autopilot. autoThrottle is the same call.
  autoThrottle(e) { this.releaseThrottle(e); }
  releaseThrottle(e) {
    const st = e.axis.throttle;
    e.manual.throttle = null;
    if (st.mode !== 'auto' && st.mode !== 'blend') { st.mode = 'blend'; st.from = e.ac.ctl.throttle; st.t = 0; st.dur = 1; }
  }

  // For the HUD lever: show the PLAYER's value while they own the throttle, the autopilot's otherwise.
  throttleState(e) {
    const st = e.axis.throttle, mine = st.mode === 'manual' || st.mode === 'latched';
    return { mode: st.mode, player: mine ? st.val : null, value: e.ac.ctl.throttle, auto: !mine };
  }

  // Deliberate hand-back (AP button, LAND assist): every axis, including a latched throttle, blends back now.
  resume(e) {
    for (const k of AXES) {
      const st = e.axis[k];
      e.manual[k] = null;
      if (st.mode !== 'auto') { st.mode = 'blend'; st.from = e.ac.ctl[k]; st.t = 0; st.dur = 1; }
    }
    e.ap?.replan();
  }

  modeOf(e) {
    const m = AXES.map((k) => e.axis[k].mode);   // a latched throttle shows as axis.throttle.mode === 'latched'
    if (e.apOff) return 'MANUAL';
    if (m.includes('manual')) return 'MANUAL';
    if (m.includes('wait') || m.includes('blend')) return 'RESUMING';
    return 'AUTOPILOT';
  }

  // Copy interpolated poses onto rigs; call once per rendered frame.
  sync(alpha, dt, posTmp, quatTmp) {
    for (const e of this.list) {
      if (!e.rig) continue;
      if (e.remote && e.remotePose) {
        e.rig.root.position.set(e.ac.pos.x, e.ac.pos.y, e.ac.pos.z);
        e.rig.root.quaternion.set(e.ac.q.x, e.ac.q.y, e.ac.q.z, e.ac.q.w);
      } else {
        e.ac.pose(alpha, posTmp, quatTmp);
        e.rig.root.position.set(posTmp.x, posTmp.y, posTmp.z);
        e.rig.root.quaternion.set(quatTmp.x, quatTmp.y, quatTmp.z, quatTmp.w);
      }
      e.rig.setControls(e.ac.ctl);
      // JETCORE: jet rigs show the flight model's automatic gear and afterburner (rig hooks from JETMODELS-A/B)
      if (e.ac.P.jet) {
        const gw = e.ac.gearWant ?? 1;
        if (e.rig.setGear && e._gearShown !== gw) { e.rig.setGear(gw, e._gearShown == null); e._gearShown = gw; }
        if (e.rig.setAfterburner && e._abShown !== e.ac.ab) { e._abShown = e.ac.ab; e.rig.setAfterburner(e.ac.ab); }
      }
      if (e.player) e.rig.updateInstruments(e.ac.instruments());
      e.rig.update(dt);
    }
  }

  // ---- shared knowledge for autopilots / ATC ----
  _others(self) { return this.list.filter((e) => e.ac !== self && !e.ac.crashed); }

  runwayClear(endId, self) { return this.runwayFree(runwayEnd(endId).rw.id, self); }

  runwayFree(rwId, self) {
    const rw = runwayEnd(rwId.split('/')[0]).rw;
    for (const o of this._others(self)) {
      const ac = o.ac;
      if (ac.onGround && onRunway(ac.pos.x, ac.pos.z, 6) === rw) return false;
      const l = o.ap?.leg;
      if (!l) continue;
      if (l.kind === 'takeoff' && ['lineup', 'roll', 'rotate'].includes(o.ap.sub) && runwayEnd(l.end).rw === rw) return false;
      if (l.kind === 'approach' && o.ap.sub !== 'goaround' && !ac.onGround) {
        const e = o.ap.cur?.e || (typeof l.end === 'object' ? l.end : runwayEnd(l.end));
        if (e.rw === rw && AIM_DIST - toRunway(e, ac.pos.x, ac.pos.z).s < 2600) return false;
      }
    }
    return true;
  }

  landingClear(endId, self) {
    const rw = runwayEnd(endId).rw;
    for (const o of this._others(self)) {
      const ac = o.ac;
      if (ac.onGround && onRunway(ac.pos.x, ac.pos.z, 2) === rw) return false;
    }
    return true;
  }

  // Who has to go when the player is placed at (x, z): ground traffic within r, and if that is on a runway, everyone on
  // it, on a final to it inside ~3.2 km or going round over it (PLAYTEST_2 B6: else the start parks for a minute+ and
  // the victim's go-around is scored on a player who did nothing).
  spawnConflicts(x, z, r = 160) {
    const rw = onRunway(x, z, 10);
    return this.list.filter((e) => {
      const ac = e.ac, l = e.ap?.leg;
      if (e.player || e.remote) return false;
      if (ac.onGround && Math.hypot(ac.pos.x - x, ac.pos.z - z) < r) return true;
      if (!rw) return false;
      if (ac.onGround) return onRunway(ac.pos.x, ac.pos.z, 10) === rw;
      const end = l?.kind === 'approach' ? (e.ap.cur?.e || (typeof l.end === 'object' ? l.end : runwayEnd(l.end))) : null;
      return end?.rw === rw && (e.ap.sub === 'goaround' || AIM_DIST - toRunway(end, ac.pos.x, ac.pos.z).s < 3200);
    });
  }

  // Polyline (xz) an on-ground plane is about to taxi along: its autopilot path, else a short line along its track.
  groundAhead(ent, L) {
    const ac = ent.ac, ap = ent.ap, P = ap?.cur?.path, kind = ap?.leg?.kind;
    const pts = [[ac.pos.x, ac.pos.z]];
    const pathing = ap && !ap.done && !ap.overridden && !ent.apOff && P && (kind === 'taxi' || (kind === 'takeoff' && (ap.sub === 'taxi' || ap.sub === 'lineup')));
    if (pathing) {
      let acc = 0;
      for (let k = (ap.cur.k || 0) + 1; k < P.length && acc < L; k++) {
        const q = pts[pts.length - 1];
        acc += Math.hypot(P[k].x - q[0], P[k].z - q[1]);
        pts.push([P[k].x, P[k].z]);
      }
    } else if (ac.gs > 0.5) {
      const h = ac.track * Math.PI / 180, d = Math.min(L, 6 + ac.gs * 8);
      pts.push([ac.pos.x + Math.sin(h) * d, ac.pos.z - Math.cos(h) * d]);
    }
    return pts;
  }

  // Taxi speed limit for `ap` from the other ground traffic: keep 45 m behind anyone on our path, never enter a
  // stretch an oncoming plane is already on, and give way at path crossings to whoever gets there first.
  groundLimit(ap, vt) {
    const me = this.list.find((e) => e.ap === ap);
    if (!me) return vt;
    const ac = ap.ac, mine = this.groundAhead(me, 420);
    if (mine.length < 2) return vt;
    const stopAt = (d) => Math.sqrt(2 * 0.7 * Math.max(0, d));
    const meRw = onRunway(ac.pos.x, ac.pos.z, 0);
    let lim = vt;
    ap.yieldTo = null;
    for (const o of this.list) {
      const oa = o.ac;
      if (o === me || !oa.onGround || oa.crashed || o.remote && !oa.onGround) continue;
      if (Math.abs(oa.pos.x - ac.pos.x) > 450 || Math.abs(oa.pos.z - ac.pos.z) > 450) continue;
      if (!meRw && onRunway(oa.pos.x, oa.pos.z, 0) && oa.gs > 9) continue; // runway traffic is ATC's (hold lines)
      const pr = projectPoly(mine, oa.pos.x, oa.pos.z);
      if (pr.d < 9 && pr.s > 0) {
        if (pr.s < 220) lim = Math.min(lim, stopAt(pr.s - 45 - Math.max(0, (ac.dims.length + oa.dims.length) / 2 - 9)));   // nose to tail, not CG to CG
        const oh = (oa.gs > 0.5 ? oa.track : oa.heading) * Math.PI / 180;
        const opp = Math.sin(oh) * pr.dir[0] - Math.cos(oh) * pr.dir[1] < -0.5;
        const theirs = this.groundAhead(o, 420);
        if (opp && theirs.length > 1) {
          const back = projectPoly(theirs, ac.pos.x, ac.pos.z);
          const meOnTheirs = back.d < 9 && back.s > 0;
          if (!meOnTheirs || oa.id < ac.id) { lim = 0; ap.yieldTo = oa.id; }
        }
        continue;
      }
      const theirs = this.groundAhead(o, 300);
      if (theirs.length < 2) continue;
      const X = polyCross(mine, theirs, 160);
      if (!X) continue;
      const tMe = X.sa / Math.max(ac.gs, 3), tThem = X.sb / Math.max(oa.gs, 3);
      if (Math.abs(tMe - tThem) > 14) continue;
      const theyFirst = X.sb < X.sa - 5 || (Math.abs(X.sb - X.sa) <= 5 && oa.id < ac.id);
      if (theyFirst) { lim = Math.min(lim, stopAt(X.sa - 30)); ap.yieldTo = oa.id; }
    }
    return lim;
  }

  // See-and-avoid for a plane on a 'fly' leg: the closest airborne plane we would pass within 300 m in the next 45 s at
  // a similar height, if it is OUR job to give way. Returns { other, alt (where to go), slow (it is ahead of us) } or null.
  // We give way to: the player, anyone not on a fly leg (final, climb-out), anyone ahead along our common track; abeam,
  // the later id gives way.
  airConflict(ap) {
    const me = this.list.find((e) => e.ap === ap);
    if (!me || me.player) return null;
    const ac = ap.ac;
    let best = null;
    for (const o of this.list) {
      const b = o.ac;
      if (o === me || b.onGround || b.crashed || b.agl < 15) continue;
      const dx = b.pos.x - ac.pos.x, dz = b.pos.z - ac.pos.z, dy = b.pos.y - ac.pos.y;
      if (Math.abs(dx) > 3000 || Math.abs(dz) > 3000 || Math.abs(dy) > 160) continue;
      const rvx = b.vel.x - ac.vel.x, rvz = b.vel.z - ac.vel.z, rv2 = rvx * rvx + rvz * rvz;
      const tc = rv2 > 1 ? clamp(-(dx * rvx + dz * rvz) / rv2, 0, 45) : 0;
      const d = Math.hypot(dx, dz), dmin = Math.hypot(dx + rvx * tc, dz + rvz * tc);
      if (Math.min(d, dmin) > 300) continue;
      const ux = ac.vel.x + b.vel.x, uz = ac.vel.z + b.vel.z, ul = Math.hypot(ux, uz);
      const along = ul > 5 ? (dx * ux + dz * uz) / ul : 0;
      const otherFlies = o.ap && !o.player && !o.remote && !o.ap.overridden && o.ap.leg?.kind === 'fly';
      const yieldMe = !otherFlies || along > 40 || (along > -40 && String(ac.id) > String(b.id));
      if (!yieldMe) continue;
      if (!best || d < best.d) best = { d, o, b, along };
    }
    if (!best) return null;
    const { b } = best;
    const up = ac.pos.y >= b.pos.y - 20 || ac.agl - (b.pos.y - ac.pos.y) < 260;
    const dirAhead = (ac.vel.x * (b.pos.x - ac.pos.x) + ac.vel.z * (b.pos.z - ac.pos.z)) > 0;
    const sameWay = ac.vel.x * b.vel.x + ac.vel.z * b.vel.z > 0;
    return { other: b.id, alt: b.pos.y + (up ? 100 : -100), slow: dirAhead && sameWay, dist: best.d };
  }

  trafficAhead(self, range) {
    let best = null;
    const hx = Math.sin(self.heading * Math.PI / 180), hz = -Math.cos(self.heading * Math.PI / 180);
    for (const o of this._others(self)) {
      const ac = o.ac;
      if (!ac.onGround) continue;
      const dx = ac.pos.x - self.pos.x, dz = ac.pos.z - self.pos.z, d = Math.hypot(dx, dz);
      if (d > range || d < 0.1) continue;
      if ((dx * hx + dz * hz) / d < 0.8) continue;
      if (best == null || d < best) best = d;
    }
    return best;
  }

  claimStand(ac, prefer) {
    if (isHeavy(ac.type)) return this._claimHeavy(ac, prefer);
    for (const [s, owner] of this.standOwner) if (owner === ac) return s;
    const occupied = new Set(this.standOwner.keys());
    for (const e of this.list) for (const s of STANDS) {
      if (Math.hypot(e.ac.pos.x - s.position[0], e.ac.pos.z - s.position[2]) < 12 && e.ac !== ac) occupied.add(s.id);
    }
    const free = STANDS.filter((s) => !occupied.has(s.id));
    if (!free.length) return null;
    const pick = (prefer && free.find((s) => s.id === prefer)) || free[Math.floor(Math.random() * free.length)];
    this.standOwner.set(pick.id, ac);
    return pick.id;
  }

  releaseStand(ac) { for (const [s, owner] of this.standOwner) if (owner === ac) this.standOwner.delete(s); }

  // A heavy takes two stands (routes.heavySpot: it parks in front of k-1/k) and needs its spot clear of other planes.
  _claimHeavy(ac, prefer) {
    const mine = [...this.standOwner].filter(([, o]) => o === ac).map(([s]) => s);
    const own = [prefer, ...mine].find((s) => s && heavySpot(s)?.stands.every((x) => this.standOwner.get(x) === ac));
    if (own) { this.releaseStand(ac); for (const x of heavySpot(own).stands) this.standOwner.set(x, ac); return own; }
    const ok = (sid) => {
      const h = heavySpot(sid);
      if (!h || h.stands.some((x) => this.standOwner.has(x) && this.standOwner.get(x) !== ac)) return false;
      return !this.list.some((e) => e.ac !== ac && (Math.hypot(e.ac.pos.x - h.x, e.ac.pos.z - h.z) < 45 ||
        h.stands.some((x) => { const st = STANDS.find((q) => q.id === x); return Math.hypot(e.ac.pos.x - st.position[0], e.ac.pos.z - st.position[2]) < 12; })));
    };
    const pick = (prefer && ok(prefer) && prefer) || [...STANDS].map((s) => s.id).reverse().find(ok);   // east first: nearest the inbound lane's feed
    if (!pick) return null;
    this.releaseStand(ac);
    for (const x of heavySpot(pick).stands) this.standOwner.set(x, ac);
    return pick;
  }

  // Wake turbulence (WAKE): sources drop vortex points behind them; lighter planes passing through get rolled and pushed down.
  _wake(dt) {
    const T = this.time;
    for (const e of this.list) {
      const ac = e.ac, cls = !e.remote && WAKE[typeInfo(ac.type).wake];
      if (!cls) continue;
      const W = (e.wake ||= { pts: [], last: -9 });
      while (W.pts.length && T - W.pts[0].t > cls.life) W.pts.shift();
      if (!ac.onGround && !ac.crashed && T - W.last >= WAKE.every) { W.last = T; W.pts.push({ x: ac.pos.x, y: ac.pos.y, z: ac.pos.z, t: T, fx: ac.vel.x / (ac.gs || 1), fz: ac.vel.z / (ac.gs || 1) }); }
    }
    for (const v of this.list) {
      const a = v.ac;
      if (v.remote || a.onGround || a.crashed) continue;
      let best = null;
      for (const e of this.list) {
        if (e === v || !e.wake?.pts.length || a.P.mass > e.ac.P.mass * 0.5) continue;
        const cls = WAKE[typeInfo(e.ac.type).wake];
        if (Math.abs(a.pos.x - e.ac.pos.x) > 6000 || Math.abs(a.pos.z - e.ac.pos.z) > 6000) continue;
        for (const p of e.wake.pts) {
          const age = T - p.t, dx = a.pos.x - p.x, dz = a.pos.z - p.z;
          if (Math.abs(dx) > cls.r || Math.abs(dz) > cls.r) continue;
          const y = p.y - WAKE.SINK * age, dy = a.pos.y - y;
          if (dy < WAKE.band[0] || dy > WAKE.band[1]) continue;
          const lat = dx * -p.fz + dz * p.fx, d = Math.hypot(dx, dz);
          if (d > cls.r) continue;
          const s = cls.str * (1 - age / cls.life) * (1 - d / cls.r) * Math.min(1, 1 - a.P.mass / (e.ac.P.mass * 0.5));
          if (!best || s > best.s) best = { s, side: lat >= 0 ? 1 : -1, src: e };
        }
      }
      if (!best || best.s < 0.05) continue;
      a.w.z += best.side * best.s * dt;           // the vortex on that side rolls you
      a.vel.y -= best.s * 1.2 * dt;               // and the downwash pushes you down
      if (a.time - (a._wakeT ?? -99) > 6) { a._wakeT = a.time; a.emit('wake', { from: best.src.ac.id, strength: +best.s.toFixed(2), cls: typeInfo(best.src.ac.type).wake }); }
    }
  }

  // Soft world boundary for the player (BOUNDARY): a warning, then the AP takes the stick and turns home while the
  // plane is (predicted to be) beyond `turn` and heading out. Events on the AP: 'boundary' { stage, dist, quip }.
  _boundary(e) {
    const ac = e.ac, B = e.bnd, [cx, cz] = homeCenter();
    if (ac.onGround || ac.crashed) { B.lock = false; return; }
    const dx = ac.pos.x - cx, dz = ac.pos.z - cz, r = Math.hypot(dx, dz), vr = (ac.vel.x * dx + ac.vel.z * dz) / (r || 1);
    // look ahead by reaction time + half a turn at the AP's bank (a jumbo at 260 kt needs ~3 km to turn round)
    const V = Math.max(ac.speed, 1), turnR = V * V / (9.81 * Math.tan(30 * (ac.P.apBankScale ?? 1) * Math.PI / 180));
    const ahead = r + Math.max(0, vr) * BOUNDARY.lookahead + (vr > 0 ? turnR * Math.min(1, vr / V) : 0);
    const q = (k) => QUIPS[k][B.n++ % QUIPS[k].length];
    if (!B.warned && ahead > BOUNDARY.warn) { B.warned = true; e.ap._emit('boundary', { stage: 'warn', dist: Math.round(r), quip: q('warn') }); }
    else if (B.warned && ahead < BOUNDARY.rearm) B.warned = false;
    if (!B.lock && ahead > BOUNDARY.turn && vr > 2) {
      B.lock = true; e.ap.wantResume = true; e.ap.homing = true;
      const quiet = ac.time - (B.quipT ?? -1e9) < 30; if (!quiet) B.quipT = ac.time;   // one quip per 30 s, however often it bounces off
      e.ap._emit('boundary', { stage: 'turnback', dist: Math.round(r), quip: quiet ? null : q('turnback') });
    } else if (B.lock && (r < BOUNDARY.rearm || (vr < -0.7 * ac.gs && Math.abs(ac.bank) < 0.25))) {   // pointing home, wings level: yours again
      B.lock = false; e.ap.homing = false;
      e.ap._emit('boundary', { stage: 'clear', dist: Math.round(r) });
    }
  }
}

// Distance along a polyline to the projection of (x, z), lateral distance and the segment direction there.
function projectPoly(pts, x, z) {
  let best = { s: -1, d: Infinity, dir: [0, 0] }, acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1e-6;
    const t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / (L * L), 0, 1);
    const d = Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
    if (d < best.d) best = { s: acc + t * L, d, dir: [dx / L, dz / L] };
    acc += L;
  }
  return best;
}
// First crossing of polyline A (within maxA metres) with polyline B: distances along each.
function polyCross(A, B, maxA) {
  let sa = 0;
  for (let i = 1; i < A.length && sa < maxA; i++) {
    const a0 = A[i - 1], a1 = A[i], la = Math.hypot(a1[0] - a0[0], a1[1] - a0[1]);
    let sb = 0;
    for (let j = 1; j < B.length; j++) {
      const b0 = B[j - 1], b1 = B[j], lb = Math.hypot(b1[0] - b0[0], b1[1] - b0[1]);
      const rx = a1[0] - a0[0], rz = a1[1] - a0[1], qx = b1[0] - b0[0], qz = b1[1] - b0[1];
      const den = rx * qz - rz * qx;
      if (Math.abs(den) > 1e-9) {
        const t = ((b0[0] - a0[0]) * qz - (b0[1] - a0[1]) * qx) / den, u = ((b0[0] - a0[0]) * rz - (b0[1] - a0[1]) * rx) / den;
        if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return { sa: sa + t * la, sb: sb + u * lb };
      }
      sb += lb;
    }
    sa += la;
  }
  return null;
}

// A local stand-in for SCORE's reportImpact for AI planes (DESIGN §1.4): Rubber always bounces; Partial bounces while its
// protection lasts (restitution scales down with it), then behaves like Realistic: gentle on-gear prangs, else destroyed.
export function aiImpactHandler(mode) {
  const P = PROTECTION;
  let pct = P.partial.startPct;
  return ({ speedKt = 0, onGear = false }) => {
    const kt = Math.abs(speedKt);
    if (mode === 'rubber' || (mode === 'partial' && pct > 0)) {
      let restitution = P.rubber.restitution;
      if (mode === 'partial') {
        const a = P.partial.restitutionAt10, b = P.partial.restitutionAt100;
        restitution = pct >= 10 ? a + (b - a) * (pct - 10) / 90 : a * pct / 10;
        pct = Math.max(0, pct - clamp(kt * P.partial.lossPerKt, P.partial.lossMin, P.partial.lossMax));
      }
      return { result: 'bounce', restitution, spinDegPerS: (Math.random() * 2 - 1) * P.rubber.spinMaxDegPerS, protectionLeft: mode === 'partial' ? pct : 100 };
    }
    if (!onGear || kt > P.realistic.destroyAboveKt) return { result: 'destroyed' };
    return { result: 'damage', restitution: 0.1 };
  };
}
