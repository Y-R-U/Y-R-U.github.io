// The scripted walk between two floors. Same bargain as the doorway: at the landing you hand
// over, the flight is walked for you, and you get control back on the floor above.
//
// Nothing here knows what kind of stair it is on. A cottage loft and the Society's five-storey
// helix answer the same three questions — where are the landings, which way does each one go, and
// what is the path between two floors — and js/world/interior.js answers them for both.

import * as THREE from 'three';

const NEAR = 1.6;     // how close to a landing counts as being at it
const AIM = 0.35;     // how squarely you have to be walking at the stair to be taken up it
const TIGHT = 0.7;    // arm once the camera is level with the floor above: it has to fit up the well
const WIDE = 1.5;     // arm while it is still clear of that floor, where there is a room to swing into
const PITCH = 0.06;
const EYE = 1.55;     // aimed at the chest, so the flight ahead is in shot and not just the player

const wrapPi = a => Math.atan2(Math.sin(a), Math.cos(a));
const _l = new THREE.Vector3();

export class Climb {
  constructor(player) {
    this.player = player;
    this.I = null;
    this.running = false;
    this.cool = 0;
    this.enabled = true;
    this.pace = 2.2;   // m/s along the path
    // Installed by the play session. Answers null to let a climb happen, or a reason not to —
    // which is how a rank you have not earned stops you at the foot of the stair rather than at
    // the top of it. It is asked at the landing, before the player is ever taken over.
    this.gate = null;
    this.refused = null;
  }

  bind(d, I) {
    this.I = I;
    this.cs = d.n.z;
    this.sn = d.n.x;
    this.ox = d.m.elements[12];
    this.oy = d.m.elements[13];
    this.oz = d.m.elements[14];
    this.running = false;
    this.cool = 0;
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    this.player.driven = false;
    this.player.walkSpeed = 0;
    this.restore(this.player);
  }

  restore(P) {
    P.distIn = this.armWas;
    P.heightIn = this.eyeWas;
  }

  clear() {
    this.stop();
    this.I = null;
  }

  local(p, out) {
    const dx = p.x - this.ox, dz = p.z - this.oz;
    return out.set(dx * this.cs - dz * this.sn, p.y - this.oy, dx * this.sn + dz * this.cs);
  }

  worldYaw(lx, lz) {
    return Math.atan2(lx * this.cs + lz * this.sn, -lx * this.sn + lz * this.cs);
  }

  // True while it owns the player.
  update(dt, P) {
    if (!this.I || !this.I.climbable || !this.enabled) return false;
    this.cool = Math.max(0, this.cool - dt);
    if (this.running) { this.run(dt, P); return true; }
    return this.watch(P);
  }

  // The landing the player is standing at, or null. Its `up` says which way its flight goes, so
  // the two sides of one floor's seam are two different intentions and neither has to be guessed.
  at(P) {
    const l = this.local(P.pos, _l);
    for (const g of this.I.landings()) {
      const dx = l.x - g.x, dz = l.z - g.z;
      if (dx * dx + dz * dz < NEAR * NEAR && Math.abs(l.y - g.y) < 0.9) return { g, l };
    }
    return null;
  }

  watch(P) {
    if (this.cool > 0) return false;
    const v = Math.hypot(P.vel.x, P.vel.z);
    if (v < 0.7) return false;
    const here = this.at(P);
    if (!here) return false;
    const { g, l } = here;
    const s = this.I.stairCentre();
    // Facing matters, exactly as at a door: walking past the foot of the stair must not take you
    // up it. Measured against the line from the landing into the stair, not against where you are
    // standing, which is the same line however close to the landing you already are.
    const vx = P.vel.x * this.cs - P.vel.z * this.sn;
    const vz = P.vel.x * this.sn + P.vel.z * this.cs;
    const ix = s.x - g.x, iz = s.z - g.z;
    if ((vx * ix + vz * iz) / (Math.hypot(ix, iz) * v) < AIM) return false;
    const to = g.i + (g.up ? 1 : -1);
    const why = this.gate ? this.gate(g.i, to) : null;
    if (why) {
      // Refused, not driven: the player keeps the stick and simply does not go up. Re-arming on a
      // cooldown is what stops a held forward key asking the same question sixty times a second.
      this.cool = 2.0;
      this.refused = { from: g.i, to, why };
      return false;
    }
    this.begin(g.i, to, P, l);
    return true;
  }

  // The foot of the stair can back onto the same wall as the front door, so the two hotspots can
  // overlap. The stair wins: you can always turn round and walk out again. Standing on the flight
  // counts too — nobody leaves a building from halfway up the stairs.
  atLanding(P) {
    if (!this.I || !this.I.climbable) return false;
    if (this.I.onStair) return true;
    return !!this.at(P);
  }

  begin(from, to, P, l) {
    const pts = this.I.stairPath(from, to);
    pts[0] = { x: l.x, y: l.y, z: l.z };   // start where they are, so handing over does not jerk
    this.cum = [];
    let total = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      total += Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
      this.cum.push(total);
    }
    this.pts = pts;
    this.len = total;
    this.s = 0;
    this.from = from;
    this.to = to;
    this.up = to > from;
    this.running = true;
    P.driven = true;
    P.vel.set(0, 0, 0);
    P.walkSpeed = this.pace;
    this.armWas = P.distIn;
    this.eyeWas = P.heightIn;
  }

  run(dt, P) {
    this.s = Math.min(this.len, this.s + this.pace * dt);
    let i = 0;
    while (i < this.cum.length - 1 && this.s > this.cum[i]) i++;
    const a = this.pts[i], b = this.pts[i + 1];
    const s0 = i ? this.cum[i - 1] : 0;
    const t = THREE.MathUtils.clamp((this.s - s0) / Math.max(1e-4, this.cum[i] - s0), 0, 1);
    const lx = a.x + (b.x - a.x) * t, ly = a.y + (b.y - a.y) * t, lz = a.z + (b.z - a.z) * t;

    P.pos.set(this.ox + lx * this.cs + lz * this.sn, this.oy + ly, this.oz - lx * this.sn + lz * this.cs);
    this.I.onFlight(ly);

    const yaw = this.worldYaw(b.x - a.x, b.z - a.z);
    P.yaw += wrapPi(yaw - P.yaw) * (1 - Math.exp(-9 * dt));
    // The camera follows the turn a little behind the body, which reads as a spiral rather than as
    // the room swinging round you. It must not lag much more than this: the arm is set so that a
    // camera pointing along the flight stays inside the well, and a big lag swings it into the newel.
    P.camYaw += wrapPi(yaw - P.camYaw) * (1 - Math.exp(-6 * dt));
    // The stair has no colliders, so nothing pushes the camera off a tread or out of a floor. The
    // camera rises with the player and so crosses the slab overhead partway up: the arm is reeled
    // in as it gets there, so it comes up through the well rather than into the boards.
    const room = this.I.headroom(ly) - EYE;
    const arm = THREE.MathUtils.clamp(TIGHT + room * 0.7, TIGHT, WIDE);
    const k = 1 - Math.exp(-5 * dt);
    P.distIn += (arm - P.distIn) * k;
    P.heightIn += (EYE - P.heightIn) * k;
    P.camPitch += (PITCH - P.camPitch) * k;
    if (this.s < this.len) return;

    this.restore(P);
    this.running = false;
    this.cool = 0.8;
    P.driven = false;
    P.walkSpeed = 0;
    P.vel.set(0, 0, 0);
    // The stick is read against the heading it was pressed at, which here is whatever you were
    // walking when the stair took over — into it. Left alone, holding forward at the top walks you
    // straight back onto the flight and you yo-yo between the floors.
    P.moveYaw = P.camYaw;
    this.I.landed(this.to);
  }

  // Test hook: starts a climb without input.
  force(up, P) {
    if (!this.I || !this.I.climbable || this.running) return false;
    const here = this.at(P);
    const from = here ? here.g.i : (this.I.floorAt ? this.I.floorAt(P.pos.y - this.oy) : 0);
    const to = from + (up ? 1 : -1);
    if (to < 0 || to >= this.I.floors) return false;
    this.begin(from, to, P, this.local(P.pos, _l));
    return true;
  }

  report() {
    return {
      on: this.running, up: !!this.up, from: this.from, to: this.to,
      u: this.running ? +(this.s / this.len).toFixed(3) : 0,
      refused: this.refused?.why || null,
    };
  }
}
