// `?auto=1`. This REPLACES P2's `autocam.js`, which was a closed analytic camera path with no
// input, no thrust, no damping, no collision and no assist — its own header said nothing in it
// could survive into P4, and nothing has.
//
// What this is instead: a scripted set of FINGERS. It emits the same `emptyInput()` struct
// controls.js emits — stick deflection, look deltas in CSS pixels, the ▲/▼ buttons, boost — and
// flight.js cannot tell the difference. That is the entire point: `tools/soak.mjs` and
// `tools/budget.mjs` now exercise the real flight model, the real collision response and the real
// assists, rather than sampling a camera on rails that could never have hit anything.
//
// It is a pure function of sim time, so two soaks of the same length fly the same flight.
//
// The 120 s programme, and what each leg is there to prove:
//
//    0– 40  cruise ~250 m, slow yaw arc      streaming at §6.2's cruise speed over new ground
//   40– 52  look up 26° + full forward       DECISION 11 — climbs through AERIAL.y0/y1 (340→640)
//   52– 62  level, cruise high               the vista held, so the fog ramp is measured settled
//   62– 74  look down 26° + full forward     the descent back, which must be as easy as the climb
//   74– 82  boost                            MAX_BOOST and the 2.2× drain path
//   82– 88  EVERYTHING RELEASED              auto-stop and then altitude hold hovering
//   88–100  strafe + the ▲/▼ buttons         the axes a forward-only autopilot never touches
//  100–120  low cruise ~70 m among towers    proximity repulsion and soft collision, repeatedly
//
// The yaw rate is set in PIXELS PER SECOND, not radians, so the look path it drives is byte for
// byte the path a thumb drives. At the default sensitivity 2.86 px/s is 0.0120 rad/s, which at
// 62 m/s is a 5.2 km arc — the same figure autocam.js used, and for the same reason: `city.js`
// memoises generated chunks, so a tight circuit re-enters chunks it has already paid for and the
// streaming budget measures nothing.

import { FLIGHT as F } from './config.js';
import { clamp, wrapAngle } from './utils.js';
import { emptyInput } from './flight.js';
import { planLaneRoute, autoSpec, ALT } from './lanes.js';

const DEG = Math.PI / 180;
const PERIOD = 120;
const ARC_PX = 2.86;              // px/s of look drag → 0.0120 rad/s → a 5.2 km arc at 62 m/s

// ── the two sign-critical formulas, written ONCE ───────────────────────────
//
// `flight`'s forward under its own convention is (-sin h, ., -cos h), so the yaw that points at a
// target is `atan2(-dx, -dz)` and nothing else. Negating it flies the craft away from every pad in
// the city and still looks like a working controller — the Courier's own comment says so, and S2-F
// added a second pilot that would otherwise have carried a second copy of it.
function steerYaw(i, flight, dx, dz, dt) {
  const yawErr = wrapAngle(Math.atan2(-dx, -dz) - flight.yawT);
  i.lookDX = clamp(-yawErr / (F.YAW_SENS * flight.sens), -900, 900) * dt;
  return yawErr;
}

// Level the nose. The thrust vector follows the camera pitch, so a nose-down cruise dives.
function levelPitch(i, flight, dt, gain = 0.8, cap = 500) {
  i.lookDY += clamp(-(0 - flight.pitchT) / (F.PITCH_SENS * flight.sens) * gain, -cap, cap) * dt;
}

export class Autopilot {
  constructor() {
    this.inp = emptyInput();
    this.leg = '';
    this.escapes = 0;
    this._slow = 0;               // seconds spent under 8 m/s while commanding full forward
    this._esc = 0;                // seconds left of an escape manoeuvre
  }

  // `flight` is read, never written: the autopilot closes its loops through the same look and
  // button channels a player has, so it can never reach a state a player could not.
  read(t, flight, dt) {
    const i = this.inp;
    i.moveX = 0; i.moveY = 0; i.moveActive = true;
    i.lookDX = 0; i.lookDY = 0; i.climb = 0; i.boost = false;

    const p = t % PERIOD;
    let pitchWant = 0, altWant = null;

    if (p < 40)       { this.leg = 'cruise';   i.moveY = -1; altWant = 250; }
    else if (p < 52)  { this.leg = 'climb';    i.moveY = -1; pitchWant = 26 * DEG; }
    else if (p < 62)  { this.leg = 'vista';    i.moveY = -1; pitchWant = -4 * DEG; }
    else if (p < 74)  { this.leg = 'descend';  i.moveY = -1; pitchWant = -26 * DEG; }
    else if (p < 82)  { this.leg = 'boost';    i.moveY = -1; i.boost = true; altWant = 200; }
    else if (p < 88)  { this.leg = 'release';  i.moveActive = false; }
    else if (p < 100) { this.leg = 'strafe';   i.moveX = Math.sin((p - 88) * 0.9); altWant = 160; }
    else              { this.leg = 'low';      i.moveY = -1; altWant = 70; }

    // An escape overrides the leg. It is a MANOEUVRE, not a fix: the model's own guarantee that it
    // never traps you is asserted separately in gates_p4 by flying a hull straight into a tower
    // and by teleporting one inside a landmark. What this stops is the autopilot spending four of
    // its five soak minutes grinding along one facade, which would test nothing.
    if (this._esc > 0) {
      this._esc -= dt;
      this.leg += '+escape';
      i.moveY = -1; i.moveX = 0; i.moveActive = true; i.climb = 1; i.boost = false;
      pitchWant = 10 * DEG; altWant = null;
      i.lookDX = 140 * dt;
    } else if (i.moveY < -0.5 && flight.hspeed < 8) {
      this._slow += dt;
      if (this._slow > 2) { this._esc = 3; this._slow = 0; this.escapes++; }
    } else {
      this._slow = 0;
    }

    // yaw: a steady drag with a slow wobble on top, so the frustum sweeps rather than stares —
    // a fixed forward view never puts a chunk boundary side-on, which is the case §3.2.2's
    // sweeping-line failure shows up in.
    i.lookDX += (ARC_PX * (1 + 0.6 * Math.sin(t / 37))) * dt;

    // pitch: a P controller on the LOOK channel, in pixels, capped so it reads as a thumb.
    if (this._esc > 0 || pitchWant !== 0 || altWant === null) {
      const err = pitchWant - flight.pitchT;
      i.lookDY += clamp(-err / (F.PITCH_SENS * flight.sens) * 0.9, -700, 700) * dt;
    }

    // altitude: the ▲/▼ buttons, with a 8 m deadband so the hold assist gets to do its job rather
    // than being overridden every frame.
    if (altWant !== null) {
      const e = altWant - flight.py;
      i.climb = e > 8 ? 1 : e < -8 ? -1 : 0;
      const err = 0 - flight.pitchT;
      i.lookDY += clamp(-err / (F.PITCH_SENS * flight.sens) * 0.6, -400, 400) * dt;
    }
    return i;
  }

  state() { return { leg: this.leg, escapes: this.escapes, escaping: this._esc > 0 }; }
}

// ───────────────────────────────────────────────────────────────────────────
// `?courier=1` — the NAVIGATING autopilot.
//
// **This is a second programme, not a replacement.** `?auto=1` stays byte-for-byte the fixed 120 s
// route above, because `gates_p2`, `gates_p4`, `gates_p5`, `budget.mjs` and `soak.mjs` all measure
// against it and a navigator that goes wherever the job board sends it would make every one of
// those numbers a different number each run. §13 words P7a's soak criterion as "`?auto=1` reaches
// tier 2", which cannot both be true; the deviation is reported in the handoff rather than taken
// silently.
//
// Same contract as Autopilot: it emits `emptyInput()` and closes its loops through the look and
// button channels a thumb has, so it can never reach a state a player could not. It knows nothing
// about missions — main.js hands it a point and it flies to it.
export class Courier {
  constructor() {
    this.inp = emptyInput();
    this.target = null;              // { x, y, z }
    this.leg = 'idle';
    this.escapes = 0;
    this._slow = 0;
    this._esc = 0;
    this._best = Infinity;        // closest approach so far — the PROGRESS watchdog's state
    this._noProg = 0;
    this.clearance = 0;           // extra approach altitude bought by each escape
    this.dist = 0;
    // §S2-I. A fraction of the hull's MAX_FWD, and it defaults to 1 so `?courier=1` and
    // `__game.flyTo()` fly EXACTLY as they did before this field existed — four gate suites and
    // `tools/courier_rate.mjs`'s 737.3 CRD/min measure against that behaviour. `js/fleet.js` sets
    // it to `lanes.AUTO_LEVELS[n].speed`, which is the ladder S2-F measured over 4,000 trips, so a
    // hired driver's competence is not a new number invented for the company layer.
    this.speedCap = 1;
  }

  setTarget(t) {
    this.target = t || null;
    this._best = Infinity; this._noProg = 0; this.clearance = 0; this._esc = 0; this._slow = 0;
    return this.target;
  }

  read(t, flight, dt) {
    const i = this.inp;
    i.moveX = 0; i.moveY = 0; i.moveActive = false;
    i.lookDX = 0; i.lookDY = 0; i.climb = 0; i.boost = false;

    const tg = this.target;
    if (!tg) { this.leg = 'idle'; this.dist = 0; return i; }

    const dx = tg.x - flight.px, dz = tg.z - flight.pz;
    const d = Math.hypot(dx, dz);
    this.dist = d;

    // Heading. flight's forward under its own convention is (-sin h, ., -cos h), so the yaw that
    // points at the target is atan2(-dx, -dz) and nothing else. Negating it here would fly the
    // craft away from every pad in the city and still look like a working controller.
    steerYaw(i, flight, dx, dz, dt);

    // Altitude: high while crossing the city, THEN DOWN ONTO THE PAD FROM ABOVE — the descent is
    // held back to the last 60 m on purpose.
    //
    // The first version levelled off at `pad.y + 8` as soon as it was inside 220 m and flew the
    // rest of the way horizontally. Measured, that puts the craft into the side of whatever mass
    // stands next to the pad: on `-6,0` (CHARGE "Ashlock Upper", pad at x −1408, y 59) it stopped
    // dead at x −1427.74 — 19.7 m short — and slid up and down the facade at 7 m/s for seventy
    // seconds. It was simply behind a wall on that bearing: a vertical city wants a vertical final
    // approach.
    //
    // **The parenthesis that used to live here was WRONG and is worth keeping as a warning.** It
    // read "the pad itself is open air — solidAt says so; only 5 of 242 sampled pads are inside
    // geometry, so this is NOT a placement bug". `solidAt()` returns null for a chunk that was
    // never generated, which is indistinguishable from open air, and that probe swept 242 pads
    // from the spawn with almost none of them streamed. Probed properly, with each pad's chunks
    // streamed and the world quiesced, 21 of 21 ledge pads WERE inside geometry — it was a
    // placement bug, and it is fixed in zones.js `_ledgeSite`. The approach fix below is real and
    // separate; the reasoning that dismissed the placement bug was not.
    //
    // `clearance` is the second half: each escape buys 45 m more approach altitude, so a pilot that
    // has already been stopped once comes back over the top instead of into the same wall.
    // `clearance` applies right up to the last 16 m. The first version dropped it at d < 60, which
    // meant a pilot that had escaped a wall at 20 m out immediately dived back to `pad.y + 8` and
    // flew into the same wall — seven escapes in a row on the same pad, measured. The final descent
    // is vertical, from directly over the pad.
    const altWant = d > 220 ? Math.max(tg.y + 50 + this.clearance, 180)
      : d > 16 ? tg.y + 45 + this.clearance
        : tg.y + 8;
    const ae = altWant - flight.py;
    i.climb = ae > 4 ? 1 : ae < -4 ? -1 : 0;

    // Level pitch. A P controller on the LOOK channel, in pixels, exactly as the fixed programme
    // does it — see `levelPitch` at the top of this file.
    levelPitch(i, flight, dt, 0.8, 500);

    // Throttle is BANG-BANG against a distance-proportional speed target, because §6.2's model
    // does not damp a held stick: `vf` is clamped to MAX_FWD while the stick is down and only
    // bleeds at DAMP_RELEASE when it is released. A proportional stick would cruise at MAX_FWD all
    // the way onto the pad. Release distance is v / DAMP_RELEASE ≈ v / 4.5, hence the 0.35 slope.
    const wantSpeed = clamp(d * 0.35, 0, flight.maxFwd * this.speedCap);
    const arrived = d < 7;
    this.leg = arrived ? 'settle' : d > 220 ? 'cruise' : 'approach';
    if (!arrived && flight.speed < wantSpeed) { i.moveY = -1; i.moveActive = true; }

    // The escape manoeuvre, carried over verbatim in intent from the fixed programme: what it
    // stops is the pilot spending the whole soak grinding along one facade. It is a manoeuvre, not
    // a fix — flight.js's own no-trap guarantee is asserted separately in gates_p4.
    if (this._esc > 0) {
      this._esc -= dt;
      this.leg += '+escape';
      // Climb OUT, do not push forward: the thing that stopped it is in front of it.
      i.moveY = 0; i.moveX = 0; i.moveActive = false; i.climb = 1; i.boost = false;
      i.lookDX = 90 * dt;
    } else if (!arrived) {
      // PROGRESS, not speed. The old test — "commanding forward and hspeed < 8" — never fired on
      // the real failure, because §6.3's tangential slide assist converts the blocked forward
      // command into ~7 m/s of sideways travel along the facade. The craft was moving the whole
      // time and getting no closer, and a stuck detector that measures speed cannot see that.
      if (d < this._best - 3) { this._best = d; this._noProg = 0; }
      else this._noProg += dt;
      if (this._noProg > 3.5 && d > 12) {
        this._esc = 3; this._noProg = 0; this._best = Infinity;
        this.clearance = Math.min(180, this.clearance + 45);
        this.escapes++;
      }
      if (i.moveY < -0.5 && flight.hspeed < 2.5) {
        this._slow += dt;
        if (this._slow > 2.5) { this._esc = 3; this._slow = 0; this.escapes++; }
      } else this._slow = 0;
    }
    return i;
  }

  state() {
    return { leg: this.leg, dist: +this.dist.toFixed(1), escapes: this.escapes,
      escaping: this._esc > 0, clearance: this.clearance, speedCap: this.speedCap,
      noProgress: +this._noProg.toFixed(1), best: this._best === Infinity ? null : +this._best.toFixed(1),
      target: this.target };
  }
}

// ───────────────────────────────────────────────────────────────────────────
// S2-F — the PLAYER's autopilot.
//
// A third pilot, and the only one a player ever meets. `Autopilot` is the fixed `?auto=1` route
// four gate suites measure against; `Courier` is the `?courier=1` soak. Neither is reachable from
// the cabin and neither changes here.
//
// **What makes this one different is that it flies the LANES.** `Courier` points itself at the
// target and goes, which is the fast line and the one a player flies by hand. This one climbs to a
// lane altitude, runs a corridor along X, turns, runs a corridor along Z, and drops onto the pad —
// so it is always further, and at every rung of the ladder it is also slower per metre. That is
// the design: the autopilot is the safe lazy option and your thumbs are the quick one. A ladder
// that ended by making the autopilot fastest would delete the reason to fly.
//
// **The stick is never taken away.** This class has no authority over `main.js`'s input path: it
// hands back an `emptyInput()` struct exactly as `controls.js` does, and main.js prefers the
// player's the instant a thumb touches anything. There is no mode to cancel and no transition to
// animate — the property is free, and it is the best thing about building the autopilot out of
// synthetic fingers instead of a state machine.
export class LanePilot {
  constructor({ seed = 0, level = 0 } = {}) {
    this.inp = emptyInput();
    this.seed = seed | 0;
    this.level = level | 0;
    this.route = null;              // { legs, order, total, lane, off, vert }
    this.wp = 0;                    // index of the waypoint being flown to
    this.target = null;             // the final destination, kept for the HUD and for re-planning
    this.label = '';                // what the player asked for: 'HOME' or a job name
    this.leg = 'idle';
    this.active = false;
    this.arrived = false;
    this.escapes = 0;
    this.flown = 0;                 // metres actually covered since engage — gates measure this
    this.offLane = 0;               // …of which, metres NOT on a lane leg
    this._prev = null;
    this._esc = 0;
    this._noProg = 0;
    this._best = Infinity;
  }

  spec() { return autoSpec(this.level); }

  // `to` is a world point. Planning happens ONCE per engage: a route re-planned every frame from a
  // moving start point walks its own corridor sideways, which reads as drift and is impossible to
  // assert against.
  engage(to, { label = '', level = this.level, from = null } = {}) {
    if (!to) return this.disengage();
    this.level = level | 0;
    this.target = { x: to.x, y: to.y, z: to.z };
    this.label = label;
    this.route = planLaneRoute(from || this._prev || { x: to.x, y: to.y, z: to.z }, this.target,
      { seed: this.seed, level: this.level });
    this.wp = 0;
    this.active = true;
    this.arrived = false;
    this.flown = 0; this.offLane = 0;
    this._esc = 0; this._noProg = 0; this._best = Infinity;
    this.leg = this.route.legs[0].kind;
    return this.state();
  }

  disengage(why = 'off') {
    this.active = false;
    this.route = null;
    this.wp = 0;
    this.leg = why;
    const i = this.inp;
    i.moveX = 0; i.moveY = 0; i.moveActive = false;
    i.lookDX = 0; i.lookDY = 0; i.climb = 0; i.boost = false;
    return this.state();
  }

  // Distance still to fly along the PLANNED route, not the straight line to the pad. A player
  // watching an ETA count down against a straight line while the pilot flies a dog-leg would
  // reasonably conclude the ETA is lying, and it would be.
  remaining(flight) {
    if (!this.route) return 0;
    const legs = this.route.legs;
    let p = { x: flight.px, y: flight.py, z: flight.pz }, d = 0;
    for (let k = this.wp; k < legs.length; k++) {
      const q = legs[k];
      d += Math.hypot(q.x - p.x, q.z - p.z) + Math.abs(q.y - p.y);
      p = q;
    }
    return d;
  }

  read(t, flight, dt) {
    const i = this.inp;
    i.moveX = 0; i.moveY = 0; i.moveActive = false;
    i.lookDX = 0; i.lookDY = 0; i.climb = 0; i.boost = false;
    if (!this.active || !this.route) { this.leg = 'idle'; return i; }

    // Odometer first, and it is measured on the CRAFT, not on the plan — the plan is what was
    // intended and the flown path is what happened. gates_s2f compares the two.
    if (this._prev) {
      const step = Math.hypot(flight.px - this._prev.x, flight.pz - this._prev.z);
      this.flown += step;
      if (this.leg !== 'lane') this.offLane += step;
    }
    this._prev = { x: flight.px, y: flight.py, z: flight.pz };

    const legs = this.route.legs;
    let wp = legs[this.wp];
    const spec = this.spec();

    // Waypoint advance. A vertical waypoint is reached on ALTITUDE and a horizontal one on
    // HORIZONTAL distance — testing both on every leg leaves the pilot circling a climb waypoint
    // it is already directly under, because the horizontal error is already zero and the altitude
    // error is what it is there to close.
    const vertical = wp.kind === 'climb' || wp.kind === 'turn' || wp.kind === 'drop';
    const last = this.wp >= legs.length - 1;
    const dh = Math.hypot(wp.x - flight.px, wp.z - flight.pz);
    const dv = wp.y - flight.py;
    // The last waypoint is the PAD, and `zones.js` VOLUME is a 14 m cylinder — so "arrived" here
    // means inside the docking volume with the craft slowing, not on the deck. The autopilot
    // delivers the player to the prompt; pressing DOCK stays the player's.
    const near = last ? (dh < 14 && Math.abs(dv) < 16)
      : vertical ? (dh < 26 && Math.abs(dv) < 12)
        : dh < 22;
    if (near) {
      if (this.wp >= legs.length - 1) {
        this.arrived = true;
        this.leg = 'arrived';
        this.active = false;
        return i;
      }
      this.wp++;
      wp = legs[this.wp];
      this._noProg = 0; this._best = Infinity;
    }
    this.leg = this._esc > 0 ? wp.kind + '+escape' : wp.kind;

    const dx = wp.x - flight.px, dz = wp.z - flight.pz;
    const d = Math.hypot(dx, dz);
    steerYaw(i, flight, dx, dz, dt);
    levelPitch(i, flight, dt, 0.8, 500);

    // Altitude on the ▲/▼ buttons, the same channel the collective lever drives. 4 m deadband so
    // the hold assist gets to do its job rather than being overridden every frame.
    const ae = wp.y - flight.py;
    i.climb = ae > 4 ? 1 : ae < -4 ? -1 : 0;

    // Throttle. Bang-bang against a distance-proportional target, capped by the LADDER — this cap
    // is the whole of "the upgrade buys speed", and it is a fraction of the hull's own MAX_FWD so
    // a better hull moves every rung without reordering them.
    const cap = spec.speed * flight.maxFwd;
    const wantSpeed = Math.min(cap, d * 0.35);
    // On a vertical leg the craft is meant to stop and go up. Commanding forward there is how the
    // first version drifted off its own corridor while climbing.
    //
    // The hold radius is TIGHTER on the last waypoint than on the others, and that difference is
    // not cosmetic: with one radius of 26 m the pilot arrived over the pad at the right altitude,
    // at 0.0 m/s, 20 m sideways of it — inside its own no-thrust bubble but outside the 14 m
    // docking volume, hovering forever one thumb-flick from a dock it would not make itself.
    const holdR = last ? 9 : 26;
    if (!(vertical && dh < holdR) && flight.speed < wantSpeed) { i.moveY = -1; i.moveActive = true; }

    // The escape manoeuvre, carried over from Courier in intent and in the reason for it: what it
    // stops is the pilot spending its whole flight grinding along one facade. Lanes are over the
    // roads and are meant to be clear, so an escape here is EVIDENCE — `escapes > 0` on a lane leg
    // means something is standing in a corridor, and gates_s2f reports the count rather than
    // absorbing it.
    if (this._esc > 0) {
      this._esc -= dt;
      i.moveY = 0; i.moveX = 0; i.moveActive = false; i.climb = 1; i.boost = false;
      i.lookDX = 90 * dt;
    } else if (!vertical) {
      // PROGRESS in three dimensions, and NOT on a vertical leg. The first version measured the
      // horizontal distance only and ran the watchdog on every leg — so on the final drop onto a
      // ledge pad, where the craft is already directly over the target and 120 m below it, the
      // horizontal distance was correctly not improving and the watchdog called it a wall. It
      // fired an escape, whose whole action is `climb = 1`, and drove the craft 21 m PAST the pad
      // it was arriving at. A watchdog that cannot see the axis the craft is making progress on
      // will always eventually fight it.
      const d3 = Math.hypot(d, dv);
      if (d3 < this._best - 3) { this._best = d3; this._noProg = 0; }
      else this._noProg += dt;
      if (this._noProg > 3.5 && d > 14) {
        this._esc = 3; this._noProg = 0; this._best = Infinity; this.escapes++;
      }
    } else {
      this._noProg = 0; this._best = Infinity;
    }
    return i;
  }

  state() {
    const s = this.spec();
    return {
      active: this.active, arrived: this.arrived, leg: this.leg, label: this.label,
      level: this.level, tier: s.name, speedCap: s.speed, smart: s.smart,
      wp: this.wp, legs: this.route ? this.route.legs.length : 0,
      order: this.route ? this.route.order : null,
      plan: this.route ? { total: Math.round(this.route.total), lane: Math.round(this.route.lane),
        off: Math.round(this.route.off), vert: Math.round(this.route.vert) } : null,
      flown: Math.round(this.flown), offLane: Math.round(this.offLane),
      escapes: this.escapes, target: this.target,
      alts: [ALT[s.famX], ALT[s.famZ]],
    };
  }
}
