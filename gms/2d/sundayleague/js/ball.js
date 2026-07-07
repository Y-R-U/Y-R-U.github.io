// ---- ball physics: 2D + height (z), bounce, friction, curl ----
import { GRAVITY, BOUNCE, DRIBBLE_AHEAD, PITCH_TYPES } from './const.js';
import { clamp, damp } from './util.js';

export class Ball {
  constructor() {
    this.reset(0, 0);
    this.onBounce = null; // cb(speed)
  }

  reset(x, y) {
    this.x = x; this.y = y; this.z = 0;
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.spin = 0;            // lateral curl: accel perpendicular to velocity
    this.owner = null;        // Footballer dribbling it
    this.lastKicker = null;
    this.lastTouchTeam = -1;
    this.regainT = 0;         // time since last kick (for regain cooldown)
    this.anim = 0;            // rotation frame accumulator
    this.shotAtGoal = -1;     // team index of the goal this shot is heading for (-1 none)
  }

  speed() { return Math.sqrt(this.vx * this.vx + this.vy * this.vy); }

  // f kicks: releases ownership, applies velocity
  kick(f, vx, vy, vz = 0, spin = 0) {
    this.owner = null;
    this.vx = vx; this.vy = vy; this.vz = vz;
    this.spin = spin;
    this.z = Math.max(this.z, 0.1);
    this.lastKicker = f;
    if (f) this.lastTouchTeam = f.team;
    this.regainT = 0;
    this.shotAtGoal = -1;
  }

  touch(f) { // deflection / trap credit
    if (f) this.lastTouchTeam = f.team;
    this.shotAtGoal = -1;
  }

  update(dt, pitchType = 'grass') {
    this.regainT += dt;
    const pt = PITCH_TYPES[pitchType] || PITCH_TYPES.grass;

    if (this.owner) {
      // carried: spring to a point ahead of the dribbler
      const f = this.owner;
      const tx = f.x + f.fx * DRIBBLE_AHEAD;
      const ty = f.y + f.fy * DRIBBLE_AHEAD;
      const k = damp(14, dt);
      this.x += (tx - this.x) * k;
      this.y += (ty - this.y) * k;
      this.vx = f.vx; this.vy = f.vy;
      this.z = Math.max(0, this.z - 200 * dt);
      this.vz = 0;
      this.spin = 0;
      this.anim += (Math.abs(f.vx) + Math.abs(f.vy)) * dt * 0.05;
      return;
    }

    // curl (aftertouch): accel perpendicular to travel, fades
    if (this.spin !== 0) {
      const sp = this.speed();
      if (sp > 40) {
        const nx = -this.vy / sp, ny = this.vx / sp;
        this.vx += nx * this.spin * dt;
        this.vy += ny * this.spin * dt;
      }
      this.spin *= Math.exp(-1.1 * dt);
      if (Math.abs(this.spin) < 4) this.spin = 0;
    }

    // vertical
    if (this.z > 0 || this.vz > 0) {
      this.vz -= GRAVITY * dt;
      this.z += this.vz * dt;
      if (this.z <= 0) {
        this.z = 0;
        if (this.vz < -60) {
          this.vz = -this.vz * BOUNCE;
          const sp = this.speed();
          this.vx *= 0.82; this.vy *= 0.82;
          if (this.onBounce) this.onBounce(sp);
          if (this.vz < 50) this.vz = 0;
        } else {
          this.vz = 0;
        }
      }
      // light air drag
      const ad = Math.exp(-0.14 * dt);
      this.vx *= ad; this.vy *= ad;
    } else {
      // ground friction by pitch type
      const fr = Math.exp(-pt.friction * dt);
      this.vx *= fr; this.vy *= fr;
      if (this.speed() < 6) { this.vx = 0; this.vy = 0; }
    }

    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.anim += this.speed() * dt * 0.05;
  }
}
