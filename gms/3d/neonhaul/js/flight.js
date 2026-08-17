// §6 — the flight model. Velocity, damping, clamps, the five assists, and the soft collision.
//
// NOTHING IN THIS FILE IMPORTS three.js OR TOUCHES THE DOM, for the same reason city.js does not:
// `tools/gates_p4.mjs` imports it straight into node and asserts the auto-stop curve, the clamps
// and the assists as NUMBERS. §6.2 states auto-stop as an arithmetic claim ("under the 0.6 m/s
// snap at 1.03 s") and an arithmetic claim deserves an arithmetic test, not a screenshot.
//
// ── the one idea (§6) ──────────────────────────────────────────────────────
//
// **Attitude is a decoration, not a state variable.** `bank` and `vpitch` are written at the very
// end of update(), after the velocity is final, and are read by camera.js and (at P5) the craft
// mesh. No line above them reads them. That is the whole mechanism behind "flying should feel
// extremely easy": the craft can look like it is banking hard while the physics underneath is a
// damped point mass with hard clamps, so there is no attitude to fight, no stall, no recovery and
// no way to get into a state you cannot get out of by letting go.
//
// ── the axis decomposition, which is where the §6.2 arithmetic actually lands ──
//
// Velocity is decomposed each frame onto an orthonormal craft basis (fwd, right, up) built from
// the heading and the THRUST pitch (±35°, §6.1) — not from the visual attitude. Then:
//
//   · a COMMANDED axis accelerates at its ACC_* and is hard-clamped at its MAX_*;
//   · an UNCOMMANDED axis is not clamped at all, it only damps — at DAMP_ACTIVE (0.9/s) while
//     any stick is held, at DAMP_RELEASE (4.5/s) when everything is released.
//
// Not clamping the uncommanded axes is deliberate and is a reading of §6.2 rather than a literal
// transcription. Clamp them and a hard turn re-decomposes 62 m/s of forward velocity onto an axis
// capped at 26 and the craft brakes for no reason the player can see. Damping them is what §6.2
// calls "where the sense of weight comes from without any of it fighting the input".
//
// ── why an uncommanded axis still cannot run away ──
//
// |vf| <= MAX_FWD, and everything else decays. The worst transient total is
// sqrt(62² + 26² + 22²) = 71.4 m/s and it is decaying the whole time. `NAN_GUARD` below is a
// guard against arithmetic going wrong, not against the model; `guardHits` in state() reports it
// so a run can prove it never fired rather than assuming it.

import { clamp, wrapAngle } from './utils.js';
import { FLIGHT as F, CRAFT_SPEED, CRAFT_DEFAULT } from './config.js';

const DEG = Math.PI / 180;
const NAN_GUARD = 200;              // m/s — arithmetic guard only; see state().guardHits

// The input contract. controls.js and autopilot.js both produce exactly this and nothing else,
// which is what makes `?auto=1` a test of the flight model rather than a second flight model.
export function emptyInput() {
  return {
    moveX: 0, moveY: 0, moveActive: false,   // stick, -1..1. moveY < 0 is forward (screen up).
    lookDX: 0, lookDY: 0,                    // CSS px since the last read
    climb: 0,                                // -1 / 0 / +1, the ▼/▲ buttons
    boost: false,
  };
}

export class Flight {
  constructor(opts = {}) {
    this.setCraft(opts.craft);
    this.sens = 1.0;              // §6.5 look sensitivity, 0.5–2.0
    this.invert = false;          // §6.5 invert pitch
    this.assists = 'on';          // 'on' | 'reduced' — §6.5, reduced halves proximity repulsion

    this.px = 0; this.py = 60; this.pz = 0;
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.yaw = 0; this.pitch = 0;         // smoothed camera look
    this.yawT = 0; this.pitchT = 0;       // the raw look target the drag integrates into
    this.heading = 0;                     // the craft's own heading, chasing yaw at 2.6 rad/s

    this.bank = 0; this.vpitch = 0;       // §6.3 item 1 — COSMETIC. Nothing above reads these.
    this.bankForce = null;                // gate hook: pins the decoration to prove it is one

    this.altHold = null;
    this.sinceVert = 99;
    this.boostOn = false;

    this.speed = 0; this.hspeed = 0;
    this.shake = 0;
    this.contact = 0;                     // seconds of continuous CONTACT (hull within 3.2 m)
    this.insideT = 0;                     // seconds of continuous PENETRATION (hull centre inside)
    this.contacts = 0;                    // resolved contacts, lifetime
    this.maxContact = 0; this.maxInside = 0;
    this.unsticks = 0;                    // frames the escape hatch fired — must be 0 in normal play
    this.repelMag = 0; this.slideMag = 0;
    this.nearest = Infinity;
    this.guardHits = 0;
    this.snaps = 0;

    this._buf = [];
    this._nx = 0; this._ny = 0; this._nz = 0;
    this._headingRate = 0;
  }

  // save.js ships `craft: 'kite'`, which is not in §5.2's family (plan defect, reported). An
  // unknown id falls back rather than producing NaN speeds.
  setCraft(id) {
    this.craft = CRAFT_SPEED[id] ? id : CRAFT_DEFAULT;
    this.maxFwd = CRAFT_SPEED[this.craft];
    this.accFwd = 0.74 * this.maxFwd;                       // §6.2's per-craft rule
    this.maxBoost = F.MAX_BOOST * (this.maxFwd / F.MAX_FWD);
    return this.craft;
  }

  reset(x, y, z, yaw = 0, pitch = 0) {
    this.px = x; this.py = y; this.pz = z;
    this.vx = this.vy = this.vz = 0;
    this.yaw = this.yawT = this.heading = yaw;
    this.pitch = this.pitchT = pitch;
    this.bank = this.vpitch = 0;
    this.altHold = null; this.sinceVert = 99;
    this.speed = this.hspeed = 0;
    this.shake = 0; this.contact = 0; this.insideT = 0;
    return this;
  }

  // `world` is anything with aabbsNear(x, z, r, out) — CityRenderer in the game, a stub array in
  // the node tests. null means open air, which is what most of the numeric gates want.
  update(dt, inp, world) {
    if (!(dt > 0)) return this;
    dt = Math.min(dt, 0.05);

    // ── look (§6.2 YAW_SENS / PITCH_SENS / LOOK_SMOOTH) ───────────────────
    const s = this.sens;
    this.yawT -= inp.lookDX * F.YAW_SENS * s;
    this.pitchT -= inp.lookDY * F.PITCH_SENS * s * (this.invert ? -1 : 1);
    this.pitchT = clamp(this.pitchT, -F.PITCH_CLAMP * DEG, F.PITCH_CLAMP * DEG);
    const kLook = 1 - Math.exp(-F.LOOK_SMOOTH * dt);
    this.yaw += wrapAngle(this.yawT - this.yaw) * kLook;
    this.pitch += (this.pitchT - this.pitch) * kLook;

    // ── heading chases the look (§6.1) ────────────────────────────────────
    const dh = wrapAngle(this.yaw - this.heading);
    const step = F.HEADING_CHASE * dt;
    const applied = clamp(dh, -step, step);
    this.heading = wrapAngle(this.heading + applied);
    this._headingRate = applied / dt;

    // ── the craft basis. THRUST pitch, clamped separately at ±35° (§6.1) ──
    const tp = clamp(this.pitch, -F.THRUST_PITCH * DEG, F.THRUST_PITCH * DEG);
    const ch = Math.cos(this.heading), sh = Math.sin(this.heading);
    const cp = Math.cos(tp), sp = Math.sin(tp);
    const fx = -sh * cp, fy = sp, fz = -ch * cp;      // forward
    const rx = ch, ry = 0, rz = -sh;                  // right
    const ux = sh * sp, uy = cp, uz = ch * sp;        // craft up = right × forward

    // ── commands ──────────────────────────────────────────────────────────
    const cf = clamp(-inp.moveY, -1, 1);              // stick up = forward
    const cs = clamp(inp.moveX, -1, 1);
    const cv = clamp(inp.climb, -1, 1);
    const active = !!inp.moveActive || cf !== 0 || cs !== 0;
    this.boostOn = !!inp.boost && cf > 0.1;

    let vf = this.vx * fx + this.vy * fy + this.vz * fz;
    let vr = this.vx * rx + this.vy * ry + this.vz * rz;
    let vu = this.vx * ux + this.vy * uy + this.vz * uz;

    const dampAll = !active && cv === 0;
    const kHoriz = Math.exp(-(dampAll ? F.DAMP_RELEASE : F.DAMP_ACTIVE) * dt);
    const kVert = Math.exp(-(dampAll ? F.DAMP_RELEASE : F.DAMP_VERT_RELEASE) * dt);

    const maxF = this.boostOn ? this.maxBoost : this.maxFwd;
    if (cf !== 0) vf = accClamp(vf, this.accFwd * cf * dt, -F.MAX_REV, maxF);
    else vf *= kHoriz;
    if (cs !== 0) vr = accClamp(vr, F.ACC_STRAFE * cs * dt, -F.MAX_STRAFE, F.MAX_STRAFE);
    else vr *= kHoriz;
    if (cv !== 0) vu = accClamp(vu, F.ACC_VERT * cv * dt, -F.MAX_VERT, F.MAX_VERT);
    else vu *= kVert;

    // The one-sided clamp. See config.FLIGHT's OVER_DECAY note: you can never accelerate past a
    // MAX_*, but a clamp that DROPPED under you (boost released; a 35° climb levelled out) bleeds
    // rather than snapping.
    const od = F.OVER_DECAY * dt;
    vf = overDecay(vf, -F.MAX_REV, maxF, od);
    vr = overDecay(vr, -F.MAX_STRAFE, F.MAX_STRAFE, od);
    vu = overDecay(vu, -F.MAX_VERT, F.MAX_VERT, od);

    this.vx = fx * vf + rx * vr + ux * vu;
    this.vy = fy * vf + ry * vr + uy * vu;
    this.vz = fz * vf + rz * vr + uz * vu;

    // ── assist 2 — altitude hold (§6.3 item 2) ────────────────────────────
    // "Engages 0.25 s after the last ▲/▼ input AND whenever stick Y is zero." The second half is
    // the important one: while you are pushing forward the LOOK PITCH is the altitude control,
    // and a PD holding your old altitude would be fighting the input. So the hold is for the
    // hands-off case — and hands-off, it hovers indefinitely.
    if (cv !== 0) { this.sinceVert = 0; this.altHold = null; }
    else this.sinceVert += dt;
    const holdOn = this.sinceVert >= F.ALT_HOLD_DELAY && Math.abs(cf) < 0.02;
    if (holdOn) {
      if (this.altHold === null) this.altHold = this.py;
      const a = clamp(F.ALT_HOLD_KP * (this.altHold - this.py) - F.ALT_HOLD_KD * this.vy,
        -F.ALT_HOLD_CLAMP, F.ALT_HOLD_CLAMP);
      this.vy += a * dt;
    } else if (cv === 0) {
      this.altHold = null;
    }

    // ── assist 5 — floor and ceiling (§6.3 item 5) ────────────────────────
    if (this.py < F.ALT_MIN) this.vy += F.FLOOR_ASSIST * (1 - this.py / F.ALT_MIN) * dt;
    if (this.py > F.ALT_WARN) {
      this.vy -= F.CEIL_ASSIST * clamp((this.py - F.ALT_WARN) / (F.ALT_MAX - F.ALT_WARN), 0, 1) * dt;
    }

    // ── assists 3 and 4 — repulsion, then integrate, then resolve ─────────
    const list = world ? world.aabbsNear(this.px, this.pz, F.REPEL_RANGE + F.HULL_R, this._buf) : null;
    if (list && list.length) {
      // Intent = where the craft is going plus where it is being TOLD to go. 12 m/s of commanded
      // direction is enough for the slide to work from a standstill and small enough that at
      // cruise the velocity dominates.
      this.repel(dt, list,
        this.vx + (fx * cf + rx * cs) * 12,
        this.vy + (fy * cf + ry * cs) * 12,
        this.vz + (fz * cf + rz * cs) * 12);
    } else { this.repelMag = 0; this.slideMag = 0; this.nearest = Infinity; }

    this.px += this.vx * dt;
    this.py += this.vy * dt;
    this.pz += this.vz * dt;

    if (list && list.length) this.resolve(dt, list);
    else { this.contact = 0; this.insideT = 0; }

    // ── hard bounds. ALT_MAX is §6.2's ceiling; HARD_FLOOR keeps a dive above the ground. ──
    if (this.py < F.HARD_FLOOR) { this.py = F.HARD_FLOOR; if (this.vy < 0) this.vy = 0; }
    if (this.py > F.ALT_MAX) { this.py = F.ALT_MAX; if (this.vy > 0) this.vy = 0; }

    // ── the stop snap (§6.2) ──────────────────────────────────────────────
    // Only when nothing is commanded. Applied unconditionally it would eat the first frame of
    // every launch: ACC_FWD * 16 ms = 0.74 m/s, which is barely over the 0.6 m/s snap.
    this.speed = Math.hypot(this.vx, this.vy, this.vz);
    // `repelMag < 1` is load-bearing: without it the snap eats the proximity assist every frame,
    // so a craft parked 5 m off a facade with the stick released would never be nudged clear —
    // the assist would be running and having no effect at all, which is worse than not having it.
    if (dampAll && this.speed < F.STOP_SNAP && this.repelMag < 1) {
      if (this.speed > 0) this.snaps++;
      this.vx = this.vy = this.vz = 0;
      this.speed = 0;
    }
    if (!(this.speed <= NAN_GUARD)) {          // catches NaN as well as runaway
      this.guardHits++;
      const k = Number.isFinite(this.speed) && this.speed > 0 ? NAN_GUARD / this.speed : 0;
      this.vx *= k; this.vy *= k; this.vz *= k;
      if (!Number.isFinite(this.px)) { this.px = 0; this.pz = 0; this.py = 200; }
      this.speed = Math.hypot(this.vx, this.vy, this.vz);
    }
    this.hspeed = Math.hypot(this.vx, this.vz);
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt);

    // ── the decoration, LAST, after the velocity is final (§6.3 item 1) ───
    // A turn at speed reads as lateral acceleration even though nothing accelerates sideways —
    // that is what makes banking track what the player did rather than what the stick says.
    const lateralAcc = cs * F.ACC_STRAFE + vf * this._headingRate;
    const fwdAcc = cf * this.accFwd;
    const bankT = clamp(-lateralAcc * F.BANK_K, -F.BANK_MAX, F.BANK_MAX);
    const vpT = clamp(-fwdAcc * F.VPITCH_K, -F.VPITCH_MAX, F.VPITCH_MAX);
    const kA = 1 - Math.exp(-F.ATT_DAMP * dt);
    this.bank += ((this.bankForce === null ? bankT : this.bankForce) - this.bank) * kA;
    this.vpitch += (vpT - this.vpitch) * kA;
    return this;
  }

  // §6.3 item 3 — proximity repulsion, plus the SLIDE term §6.3 describes as its purpose.
  //
  // The normal half is §6.3 verbatim: "within 12 m of any near-ring building AABB, an extra
  // acceleration along the surface normal of up to 18 m/s², scaled (1 − d/12)²". The summed
  // vector is clamped to REPEL_ACC so a corner between four towers does not fire 72 m/s² — and so
  // that two opposite walls in a canyon CANCEL, which is what centres you in a gap.
  //
  // The TANGENTIAL half is not in §6.3's numbers and is added deliberately, because the normal
  // term alone does not produce the behaviour §6.3 says it is for. Measured before it existed:
  // flown dead-on into the centre of a 40 m face at 62 m/s, the craft parked at exactly 3.2 m and
  // sat there — "you slide along facades instead of stopping dead against them" was true only for
  // approaches that were already angled. So while the hull is closing on a surface, an equal
  // acceleration is applied ALONG that surface, in the direction the craft is already sliding.
  // Dead-on, where that direction is undefined, it falls back to the nearer horizontal way round
  // the face, so the craft is deflected past the tower instead of pinned to it.
  //
  // This is an assist and it is meant to be one. `assists: 'reduced'` (§6.5) halves both halves.
  //
  // The slide is keyed on INTENT — velocity plus the commanded thrust direction — not on velocity
  // alone. Velocity alone is not enough: a craft already stopped against a facade with the stick
  // still pushed forward has no velocity to slide along, so it sat there, which is the exact
  // failure the term was added to remove.
  repel(dt, list, ix, iy, iz) {
    let ax = 0, ay = 0, az = 0, nearest = Infinity;
    let tx = 0, ty = 0, tz = 0;
    const scale = this.assists === 'reduced' ? 0.5 : 1;
    const ilen = Math.hypot(ix, iy, iz);
    if (ilen > 1e-4) { ix /= ilen; iy /= ilen; iz /= ilen; }
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      const d = signedTo(a, this.px, this.py, this.pz, this);
      if (d < nearest) nearest = d;
      if (d >= F.REPEL_RANGE) continue;
      const nx = this._nx, ny = this._ny, nz = this._nz;
      const t = 1 - Math.max(d, 0) / F.REPEL_RANGE;
      const m = F.REPEL_ACC * t * t;
      ax += nx * m; ay += ny * m; az += nz * m;

      if (ilen < 4) continue;
      const vn = ix * nx + iy * ny + iz * nz;
      if (vn >= 0) continue;                       // not closing on this surface
      let sx = ix - nx * vn, sy = iy - ny * vn, sz = iz - nz * vn;
      let sl = Math.hypot(sx, sy, sz);
      if (sl < 0.10) {
        // Dead-on. Go round horizontally, toward whichever side of this face is nearer — a
        // deterministic choice, so the same approach always deflects the same way.
        let ex = -nz, ez = nx;                     // a horizontal tangent of this face
        const el = Math.hypot(ex, ez);
        if (el < 1e-4) { ex = 1; ez = 0; }
        else { ex /= el; ez /= el; }
        const offs = (this.px - (a.x0 + a.x1) / 2) * ex + (this.pz - (a.z0 + a.z1) / 2) * ez;
        const s = offs >= 0 ? 1 : -1;
        sx = ex * s; sy = 0; sz = ez * s; sl = 1;
      }
      tx += (sx / sl) * m; ty += (sy / sl) * m; tz += (sz / sl) * m;
    }
    this.nearest = nearest;
    const mag = Math.hypot(ax, ay, az);
    const tmag = Math.hypot(tx, ty, tz);
    this.repelMag = 0; this.slideMag = 0;
    if (mag > 1e-6) {
      const k = (Math.min(mag, F.REPEL_ACC) / mag) * scale * dt;
      this.vx += ax * k; this.vy += ay * k; this.vz += az * k;
      this.repelMag = Math.min(mag, F.REPEL_ACC) * scale;
    }
    if (tmag > 1e-6) {
      const k = (Math.min(tmag, F.REPEL_ACC) / tmag) * F.SLIDE * scale * dt;
      this.vx += tx * k; this.vy += ty * k; this.vz += tz * k;
      this.slideMag = Math.min(tmag, F.REPEL_ACC) * F.SLIDE * scale;
    }
  }

  // §6.3 item 4 — collision softening. A 3.2 m hull against the LOD0 AABB set. Push out along the
  // closest-surface normal, kill the velocity INTO the surface, keep everything tangential (that
  // is the slide), and add 0.35 restitution as a nudge off the wall.
  //
  // NO DAMAGE, NO FAIL STATE, EVER (§6.3 item 4, brief). `shake` and `contacts` are the entire
  // consequence; P6 hangs the cockpit edge flash on them and P8 the scrape.
  //
  // UNSTICK is the thing that makes "never trapped" true rather than hoped for: a hull that has
  // been penetrating continuously for UNSTICK_AFTER seconds — teleported inside a tower, or wedged
  // in a corner the normal push cannot resolve — gets a growing push and a straight-up escape
  // acceleration until it is out. Tested by teleporting into the middle of a landmark.
  resolve(dt, list) {
    let hit = false, inside = false;
    const grow = this.insideT > F.UNSTICK_AFTER ? 1.6 : 1.0;
    for (let i = 0; i < list.length; i++) {
      const d = signedTo(list[i], this.px, this.py, this.pz, this);
      if (d >= F.HULL_R) continue;
      hit = true;
      // TOUCHING (0 <= d < 3.2) and INSIDE (d < 0) are different states and only the second one
      // is a trap. Driving the unstick off "touching" made holding thrust against a wall levitate
      // the craft at 4.3 m/s — the escape hatch firing during ordinary contact.
      if (d < 0) inside = true;
      const depth = (F.HULL_R - d) * grow;
      this.px += this._nx * depth; this.py += this._ny * depth; this.pz += this._nz * depth;
      const vn = this.vx * this._nx + this.vy * this._ny + this.vz * this._nz;
      if (vn < 0) {
        const k = vn * (1 + F.RESTITUTION);
        this.vx -= this._nx * k; this.vy -= this._ny * k; this.vz -= this._nz * k;
        if (-vn > 2 && this.contact === 0) { this.contacts++; this.shake = F.SHAKE; }
      }
    }
    this.contact = hit ? this.contact + dt : 0;
    this.insideT = inside ? this.insideT + dt : 0;
    if (this.contact > this.maxContact) this.maxContact = this.contact;
    if (this.insideT > this.maxInside) this.maxInside = this.insideT;
    if (this.insideT > F.UNSTICK_AFTER) { this.vy += F.UNSTICK_ACC * dt; this.unsticks++; }
  }

  // The unit forward the camera looks along — camera.js's only geometric dependency.
  lookDir(out = [0, 0, 0]) {
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    out[0] = -Math.sin(this.yaw) * cp; out[1] = sp; out[2] = -Math.cos(this.yaw) * cp;
    return out;
  }

  state() {
    return {
      craft: this.craft, maxFwd: this.maxFwd, accFwd: +this.accFwd.toFixed(2),
      maxBoost: +this.maxBoost.toFixed(1),
      x: +this.px.toFixed(2), y: +this.py.toFixed(2), z: +this.pz.toFixed(2),
      vx: +this.vx.toFixed(3), vy: +this.vy.toFixed(3), vz: +this.vz.toFixed(3),
      speed: +this.speed.toFixed(3), hspeed: +this.hspeed.toFixed(3),
      yaw: +this.yaw.toFixed(4), pitch: +this.pitch.toFixed(4), heading: +this.heading.toFixed(4),
      bank: +this.bank.toFixed(4), vpitch: +this.vpitch.toFixed(4), bankForced: this.bankForce,
      altHold: this.altHold === null ? null : +this.altHold.toFixed(2),
      boost: this.boostOn, sinceVert: +this.sinceVert.toFixed(3),
      contact: +this.contact.toFixed(3), inside: +this.insideT.toFixed(3), contacts: this.contacts,
      maxContact: +this.maxContact.toFixed(3), maxInside: +this.maxInside.toFixed(3),
      unsticks: this.unsticks, shake: +this.shake.toFixed(3),
      repel: +this.repelMag.toFixed(2), slide: +this.slideMag.toFixed(2), nearest: Number.isFinite(this.nearest) ? +this.nearest.toFixed(2) : null,
      snaps: this.snaps, guardHits: this.guardHits,
      sens: this.sens, invert: this.invert, assists: this.assists,
    };
  }
}

// Accelerate an axis, clamped — but the clamp may never REDUCE a value that is already past it.
// `clamp(v + a*dt, lo, hi)` looks equivalent and is not: release boost at 105 m/s with the stick
// still forward and it snaps to 62 in one frame, a 43 m/s step the player sees as a handbrake.
// Past the limit, overDecay() below owns the value and bleeds it at OVER_DECAY.
function accClamp(v, dv, lo, hi) {
  if (dv > 0) return Math.min(v + dv, Math.max(hi, v));
  if (dv < 0) return Math.max(v + dv, Math.min(lo, v));
  return v;
}

function overDecay(v, lo, hi, d) {
  if (v > hi) return Math.max(hi, v - d);
  if (v < lo) return Math.min(lo, v + d);
  return v;
}

// Distance from a point to an AABB whose vertical extent is [0, top] — buildings sit on the
// ground plane, so there is no bottom face to escape through. Writes the outward unit normal into
// f._nx/_ny/_nz. Outside: the closest-point normal. Inside: the shallowest face, which is what
// §6.3 item 4's "push out along the shallowest axis" means, returned as a NEGATIVE distance so
// the caller's `HULL_R - d` push clears the surface in one step.
function signedTo(a, x, y, z, f) {
  const cx = x < a.x0 ? a.x0 : x > a.x1 ? a.x1 : x;
  const cy = y < 0 ? 0 : y > a.top ? a.top : y;
  const cz = z < a.z0 ? a.z0 : z > a.z1 ? a.z1 : z;
  let nx = x - cx, ny = y - cy, nz = z - cz;
  const d = Math.hypot(nx, ny, nz);
  if (d > 1e-6) {
    f._nx = nx / d; f._ny = ny / d; f._nz = nz / d;
    return d;
  }
  // Inside — five faces, shallowest wins. The BOTTOM face is excluded (Infinity): a building
  // sits on the ground plane, so "shallowest" at y = 1 m is the floor, and pushing the hull out
  // through it drops it below HARD_FLOOR, which clamps it straight back inside — a two-frame
  // trap that reads exactly like the stuck-on-wall bug the soak gate exists to catch.
  const e = [x - a.x0, a.x1 - x, Infinity, a.top - y, z - a.z0, a.z1 - z];
  let k = 0;
  for (let i = 1; i < 6; i++) if (e[i] < e[k]) k = i;
  f._nx = k === 0 ? -1 : k === 1 ? 1 : 0;
  f._ny = k === 2 ? -1 : k === 3 ? 1 : 0;
  f._nz = k === 4 ? -1 : k === 5 ? 1 : 0;
  return -e[k];
}
