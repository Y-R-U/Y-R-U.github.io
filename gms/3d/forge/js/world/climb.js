// The scripted walk up and down a spiral stair. Same bargain as the doorway: at the landing you
// hand over, the flight is walked for you, and you get control back on the floor above.

import * as THREE from 'three';
import { stairPos, stairLanding, stairPath } from './stairs.js';

const NEAR = 0.9;     // how close to a landing counts as being at it
const AIM = 0.35;     // how squarely you have to be walking at the stair to be taken up it
const TIGHT = 0.7;    // arm once the camera is level with the loft floor: it has to fit down the well
const WIDE = 1.5;     // arm while it is still below the deck, where there is a room to swing into
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
    if (!this.I || !this.I.loft || !this.enabled) return false;
    this.cool = Math.max(0, this.cool - dt);
    if (this.running) { this.run(dt, P); return true; }
    return this.watch(P);
  }

  watch(P) {
    if (this.cool > 0) return false;
    const v = Math.hypot(P.vel.x, P.vel.z);
    if (v < 0.7) return false;
    const l = this.local(P.pos, _l);
    const s = stairPos(this.I);
    // Facing matters, exactly as at a door: walking past the foot of the stair must not take you
    // up it. Measured against the line from the landing into the stair, not against where you are
    // standing, which is the same line however close to the landing you already are.
    const vx = P.vel.x * this.cs - P.vel.z * this.sn;
    const vz = P.vel.x * this.sn + P.vel.z * this.cs;
    for (const top of [false, true]) {
      const g = stairLanding(this.I, top);
      const dx = l.x - g.x, dz = l.z - g.z;
      if (dx * dx + dz * dz > NEAR * NEAR || Math.abs(l.y - g.y) > 0.9) continue;
      const ix = s.x - g.x, iz = s.z - g.z;
      if ((vx * ix + vz * iz) / (Math.hypot(ix, iz) * v) < AIM) continue;
      this.begin(!top, P, l);
      return true;
    }
    return false;
  }

  // The foot of the stair backs onto the same wall as the front door, so the two hotspots can
  // overlap. The stair wins the overlap: you can always turn round and walk out again. Standing on
  // the flight counts too — nobody leaves a house from halfway up the stairs.
  atLanding(P) {
    if (!this.I || !this.I.loft) return false;
    if (this.I.onStair) return true;
    const l = this.local(P.pos, _l);
    for (const top of [false, true]) {
      const g = stairLanding(this.I, top);
      const dx = l.x - g.x, dz = l.z - g.z;
      if (dx * dx + dz * dz < NEAR * NEAR && Math.abs(l.y - g.y) < 0.9) return true;
    }
    return false;
  }

  begin(up, P, l) {
    const pts = stairPath(this.I, up);
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
    this.up = up;
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
    // The stair has no colliders, so nothing pushes the camera off a tread or out of the deck. The
    // camera rises with the player and so crosses the loft floor partway up: the arm is reeled in
    // as it gets there, so it comes up through the opening rather than into the boards.
    const room = this.oy + this.I.deck - (P.pos.y + EYE);
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
    this.I.landed(this.up);
  }

  // Test hook: starts a climb without input.
  force(up, P) {
    if (!this.I || !this.I.loft || this.running) return false;
    this.begin(up, P, this.local(P.pos, _l));
    return true;
  }

  report() {
    return { on: this.running, up: !!this.up, u: this.running ? +(this.s / this.len).toFixed(3) : 0 };
  }
}
