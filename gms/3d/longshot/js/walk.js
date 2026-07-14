// LONGSHOT — walking the perch.
//
// A sniper who cannot move is a sniper who can be BLOCKED: one water tank, one
// crane, one unlucky facade and the contract is unshootable from the single
// pixel he was nailed to. So the shooter owns his whole roof. He can pace it for
// parallax around an obstruction, and step up onto the coping at the rim to look
// straight down at the pavement below — which is the only way to see a mark
// standing at the foot of his own building.
//
// He cannot fall off. The roof is a rectangle (the perch tower's footprint) and
// the walk is clamped inside it; the outermost strip IS the coping, so pushing
// into the edge climbs you onto it instead of over it.

import * as THREE from 'three';
import { MOVE } from './config.js';

const T = THREE;

export class Walker {
  constructor(rig) {
    this.rig = rig;
    this.enabled = false;
    this.pos = new T.Vector3();      // feet, on the surface underfoot
    this.vel = new T.Vector3();
    this.footY = 0;                  // smoothed height of that surface
    this.bobT = 0; this.bob = 0;
    this.speed = 0;                  // current ground speed (m/s) — HUD/fx
    this.blockers = [];
  }

  // b: the perch collider (its footprint) · roofY: top of the roof slab
  // blockers: [{ x, z, r, top }] — top ≤ MOVE.stepUp means you stand ON it
  setPerch(b, roofY, start, blockers = []) {
    const m = MOVE.edge;
    this.minX = b.minX + m; this.maxX = b.maxX - m;   // how far he may walk
    this.minZ = b.minZ + m; this.maxZ = b.maxZ - m;
    this.rim = b;                                     // where the roof actually ends
    this.roofY = roofY;
    this.blockers = blockers;
    this.pos.set(start.x, roofY, start.z);
    this.vel.set(0, 0, 0);
    this.speed = 0; this.bob = 0; this.bobT = 0;
    this.footY = this.surfaceAt(start.x, start.z);
    this.pos.y = this.footY;
    this.enabled = true;
    this._writeEye();
  }

  clear() { this.enabled = false; }

  // height of whatever the shooter is standing on at (x,z), relative to the world
  surfaceAt(x, z) {
    let y = this.roofY;
    // the coping ring at the rim — a curb you climb onto to toe the edge.
    // Measured from the REAL roof edge, so it lines up with the geometry city.js
    // laid down (the walk clamp sits a little inside it, on top of the curb).
    const b = this.rim;
    const rim = Math.min(x - b.minX, b.maxX - x, z - b.minZ, b.maxZ - z);
    if (rim <= MOVE.copingW) y = this.roofY + MOVE.coping;
    for (const o of this.blockers) {
      if (o.top > MOVE.stepUp) continue;                       // solid: handled below
      if (Math.hypot(x - o.x, z - o.z) < o.r) y = Math.max(y, this.roofY + o.top);
    }
    return y;
  }

  // input: { x, y } in [-1,1] (screen-space stick) · yaw: where the shooter faces
  update(dt, input, yaw, scoped) {
    if (!this.enabled || dt <= 0) return;
    const fx = Math.sin(yaw), fz = Math.cos(yaw);      // forward (game yaw convention)
    const rx = -Math.cos(yaw), rz = Math.sin(yaw);     // screen-right
    let ix = input ? input.x : 0, iy = input ? input.y : 0;
    const mag = Math.hypot(ix, iy);
    if (mag > 1) { ix /= mag; iy /= mag; }

    const top = MOVE.speed * (scoped ? MOVE.scopedMul : 1);
    const wantX = (fx * iy + rx * ix) * top;
    const wantZ = (fz * iy + rz * ix) * top;
    const k = mag > 0.02 ? MOVE.accel : MOVE.damp;
    this.vel.x += (wantX - this.vel.x) * Math.min(1, dt * k);
    this.vel.z += (wantZ - this.vel.z) * Math.min(1, dt * k);
    if (Math.abs(this.vel.x) < 0.02) this.vel.x = 0;
    if (Math.abs(this.vel.z) < 0.02) this.vel.z = 0;

    let nx = this.pos.x + this.vel.x * dt;
    let nz = this.pos.z + this.vel.z * dt;

    // Resolve the roof first and the clutter second, then the roof again: the
    // rim is the hard constraint (you may NEVER be off it), and a lone push-out
    // pass can shove you over the edge only for the clamp to shove you straight
    // back inside the thing you were pushed out of.
    const onRoof = () => {
      nx = Math.min(this.maxX, Math.max(this.minX, nx));
      nz = Math.min(this.maxZ, Math.max(this.minZ, nz));
    };
    onRoof();
    for (const o of this.blockers) {
      if (o.top <= MOVE.stepUp) continue;                      // low enough to step on
      const dx = nx - o.x, dz = nz - o.z;
      const d = Math.hypot(dx, dz);
      if (d < o.r && d > 1e-4) { nx = o.x + dx / d * o.r; nz = o.z + dz / d * o.r; }
    }
    onRoof();

    this.pos.x = nx; this.pos.z = nz;
    this.speed = Math.hypot(this.vel.x, this.vel.z);

    // climb/step down smoothly — a snap to the coping reads as a glitch
    const want = this.surfaceAt(nx, nz);
    const dy = want - this.footY;
    const step = MOVE.climb * dt;
    this.footY += Math.abs(dy) <= step ? dy : Math.sign(dy) * step;
    this.pos.y = this.footY;

    // Head-bob SETTLES when he stops. Freeze the phase instead and the eye keeps
    // whatever offset it happened to stop on — so two shots from the same spot
    // are taken from two different eye heights.
    this.bobT += dt * this.speed;
    const amp = MOVE.bobAmp * Math.min(1, this.speed / (MOVE.speed * 0.4));
    const wantBob = Math.sin(this.bobT * MOVE.bobHz * 6.28) * amp;
    this.bob += (wantBob - this.bob) * Math.min(1, dt * 9);
    this._writeEye();
  }

  _writeEye() {
    // Mutate the rig's eye IN PLACE: MissionRun holds it as `this.origin`, and
    // ballistics/LOS/markers all read through that same object. Replacing it
    // would silently leave the whole game shooting from where you used to stand.
    this.rig.eye.set(this.pos.x, this.pos.y + MOVE.eyeH + this.bob, this.pos.z);
  }
}
