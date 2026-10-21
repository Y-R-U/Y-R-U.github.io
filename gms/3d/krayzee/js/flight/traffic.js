import { runwayEnd, toRunway, onRunway, AIM_DIST } from './routes.js';
import { STANDS } from '../world/layout.js';
import { clamp, lerp } from './vmath.js';

export const AXES = ['aileron', 'elevator', 'rudder', 'throttle', 'flaps', 'brake'];
export const OVERRIDE = { deadzone: 0.08, wait: 1.5, blend: 2.0 };

// Owns every aircraft in the world: fixed-step simulation, the player-vs-autopilot mixer, and the
// little bits of shared knowledge the autopilots need (runway occupancy, stands, taxi spacing).
export class Traffic {
  constructor(env, { hz = 120 } = {}) {
    this.env = env; this.h = 1 / hz; this.acc = 0; this.list = []; this.standOwner = new Map(); this.time = 0;
  }

  add({ aircraft, ap = null, rig = null, player = false, remote = false, name = '' }) {
    const ent = {
      ac: aircraft, ap, rig, player, remote, name,
      manual: Object.fromEntries(AXES.map((a) => [a, null])),
      axis: Object.fromEntries(AXES.map((a) => [a, { mode: 'auto', t: 0, val: 0 }])),
      apOff: false,
    };
    if (ap) ap.traffic = this;
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
    }
    return this.acc / this.h;
  }

  // Player input → per-axis override; release → wait, blend back, replan.
  _mix(e, h) {
    const ac = e.ac, ap = e.ap;
    const apOut = ap && !e.apOff ? ap.update(h) : null;
    let anyManual = false, anyWait = false, replan = false;
    for (const k of AXES) {
      const st = e.axis[k], m = e.manual[k];
      if (m != null) {
        if (st.mode !== 'manual') { st.mode = 'manual'; if (ap && k !== 'throttle') ap._emit('override', { axis: k }); }
        st.val = m; st.t = 0;
      } else if (st.mode === 'manual') {
        st.mode = 'wait'; st.t = 0;
        if (k === 'elevator' || k === 'aileron' || k === 'rudder') st.val = 0;
      } else if (st.mode === 'wait') {
        st.t += h;
        if (st.t >= OVERRIDE.wait) { st.mode = 'blend'; st.t = 0; st.from = st.val; replan = true; }
      } else if (st.mode === 'blend') {
        st.t += h;
        if (st.t >= OVERRIDE.blend) st.mode = 'auto';
      }
      if (st.mode === 'manual') anyManual = true;
      if (st.mode === 'wait') anyWait = true;
      let v;
      if (!apOut) v = st.mode === 'auto' ? (k === 'brake' ? 0 : k === 'throttle' || k === 'flaps' ? ac.ctl[k] : 0) : st.val;
      else if (st.mode === 'auto') v = apOut[k];
      else if (st.mode === 'blend') {
        const f = st.t / OVERRIDE.blend, s = f * f * (3 - 2 * f);
        v = lerp(st.from, apOut[k], s);
      } else v = st.val;
      ac.ctl[k] = v;
    }
    if (ap) {
      ap.overridden = anyManual || anyWait;
      if (replan && !anyManual && !anyWait && !e.apOff) ap.replan();
    }
  }

  modeOf(e) {
    const m = AXES.map((k) => e.axis[k].mode);
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
      if (e.player) e.rig.updateInstruments(e.ac.instruments());
      e.rig.update(dt);
    }
  }

  // ---- shared knowledge for autopilots / ATC ----
  _others(self) { return this.list.filter((e) => e.ac !== self && !e.ac.crashed); }

  runwayClear(endId, self) {
    const rw = runwayEnd(endId).rw;
    for (const o of this._others(self)) {
      const ac = o.ac;
      if (ac.onGround && onRunway(ac.pos.x, ac.pos.z, 6) === rw) return false;
      const l = o.ap?.leg;
      if (!l) continue;
      if (l.kind === 'takeoff' && ['lineup', 'roll', 'rotate'].includes(o.ap.sub) && runwayEnd(l.end).rw === rw) return false;
      if (l.kind === 'approach' && o.ap.sub !== 'goaround' && !ac.onGround) {
        const e = o.ap.cur?.e || runwayEnd(l.end);
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
}
