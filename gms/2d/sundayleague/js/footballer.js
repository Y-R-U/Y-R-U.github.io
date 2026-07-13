// ---- footballer entity: movement, states, animation ----
import {
  P_ACCEL, P_SPEED, SLIDE_SPEED, SLIDE_TIME, SLIDE_RECOVER, FALL_TIME,
} from './const.js';
import { dir8, damp, clamp } from './util.js';
import { POSE } from './sprites.js';

export class Footballer {
  constructor(team, idx, role, person, sheet) {
    this.team = team;         // 0 | 1
    this.idx = idx;
    this.role = role;         // GK DF MF FW
    this.person = person;     // {name,num,pace,skill,...}
    this.sheet = sheet;
    this.x = 0; this.y = 0;
    this.vx = 0; this.vy = 0;
    this.fx = 0; this.fy = 1; // facing (unit)
    this.desX = 0; this.desY = 0; // desired velocity (px/s), set by AI/input each frame
    this.state = 'run';
    this.stateT = 0;
    this.anim = 0;
    this.kickCD = 0;          // can't kick again while > 0
    this.controlBlend = 0;    // 0 = AI, 1 = user
    this.speedMul = 1;        // pace * pitch * difficulty (set by match)
    this.aiSpeedMul = 1;      // AI throttle vs user
    this.decideT = 0;         // AI decision timer
    this.plan = 'position';
    this.homeX = 0; this.homeY = 0;   // formation target (updated by AI)
    this.celebX = 0; this.celebY = 0;
    this.diveVX = 0; this.diveVY = 0;
    this.slideDX = 0; this.slideDY = 1;
    this.slideMul = 1;
    this.shadowScale = 1;
    this.yellows = 0;         // 2 = off
  }

  get busy() { return this.state === 'slide' || this.state === 'fallen' || this.state === 'kick' || this.state === 'dive'; }
  get grounded() { return this.state === 'slide' || this.state === 'fallen' || this.state === 'dive'; }

  maxSpeed() { return P_SPEED * this.speedMul * this.person.pace; }

  setFacing(x, y) {
    const l = Math.hypot(x, y);
    if (l > 0.01) { this.fx = x / l; this.fy = y / l; }
  }

  startKick() {
    if (this.busy) return false;
    this.state = 'kick'; this.stateT = 0;
    return true;
  }

  startSlide(dx, dy, slideMul = 1) {
    if (this.busy) return false;
    this.state = 'slide'; this.stateT = 0;
    const l = Math.hypot(dx, dy) || 1;
    this.slideDX = dx / l; this.slideDY = dy / l;
    this.slideMul = slideMul;
    this.setFacing(dx, dy);
    return true;
  }

  fall() {
    if (this.state === 'fallen') return;
    this.state = 'fallen'; this.stateT = 0;
  }

  startDive(vx, vy) {
    this.state = 'dive'; this.stateT = 0;
    this.diveVX = vx; this.diveVY = vy;
  }

  celebrate(tx, ty) {
    this.state = 'celeb'; this.stateT = 0;
    this.celebX = tx; this.celebY = ty;
  }

  stopCelebrate() {
    if (this.state === 'celeb') { this.state = 'run'; this.stateT = 0; }
  }

  update(dt) {
    this.stateT += dt;
    if (this.kickCD > 0) this.kickCD -= dt;

    switch (this.state) {
      case 'kick': {
        // brief lock; slight follow-through drift
        this.vx *= Math.exp(-6 * dt); this.vy *= Math.exp(-6 * dt);
        this.x += this.vx * dt; this.y += this.vy * dt;
        if (this.stateT > 0.16) { this.state = 'run'; this.stateT = 0; }
        break;
      }
      case 'slide': {
        const t = this.stateT / (SLIDE_TIME * this.slideMul);
        const sp = SLIDE_SPEED * this.slideMul * Math.max(0, 1 - t);
        this.vx = this.slideDX * sp; this.vy = this.slideDY * sp;
        this.x += this.vx * dt; this.y += this.vy * dt;
        if (this.stateT > SLIDE_TIME * this.slideMul + SLIDE_RECOVER) { this.state = 'run'; this.stateT = 0; }
        break;
      }
      case 'fallen': {
        this.vx *= Math.exp(-8 * dt); this.vy *= Math.exp(-8 * dt);
        this.x += this.vx * dt; this.y += this.vy * dt;
        if (this.stateT > FALL_TIME) { this.state = 'run'; this.stateT = 0; }
        break;
      }
      case 'dive': {
        const decel = Math.exp(-2.2 * dt);
        this.diveVX *= decel; this.diveVY *= decel;
        this.x += this.diveVX * dt; this.y += this.diveVY * dt;
        this.vx = this.diveVX; this.vy = this.diveVY;
        if (this.stateT > 0.85) { this.state = 'fallen'; this.stateT = FALL_TIME * 0.5; }
        break;
      }
      case 'celeb': {
        const dx = this.celebX - this.x, dy = this.celebY - this.y;
        const d = Math.hypot(dx, dy);
        if (d > 20) {
          const sp = this.maxSpeed() * 0.8;
          this.vx = dx / d * sp; this.vy = dy / d * sp;
          this.x += this.vx * dt; this.y += this.vy * dt;
          this.setFacing(dx, dy);
        } else { this.vx = 0; this.vy = 0; }
        this.anim += dt * 6;
        break;
      }
      default: { // run — steer toward desired velocity
        const ms = this.maxSpeed();
        let dx = this.desX, dy = this.desY;
        const dl = Math.hypot(dx, dy);
        if (dl > ms) { dx = dx / dl * ms; dy = dy / dl * ms; }
        const ax = clamp(dx - this.vx, -P_ACCEL * dt, P_ACCEL * dt);
        const ay = clamp(dy - this.vy, -P_ACCEL * dt, P_ACCEL * dt);
        this.vx += ax; this.vy += ay;
        this.x += this.vx * dt; this.y += this.vy * dt;
        const sp = Math.hypot(this.vx, this.vy);
        if (sp > 20) this.setFacing(this.vx, this.vy);
        this.anim += sp * dt * 0.045;
        break;
      }
    }
  }

  // sprite cell for current state
  pose() {
    const d = dir8(this.fx, this.fy);
    switch (this.state) {
      case 'kick': return { d, p: POSE.KICK };
      case 'slide': return { d, p: this.stateT > SLIDE_TIME * this.slideMul ? POSE.FALL : POSE.SLIDE };
      case 'fallen': return { d, p: POSE.FALL };
      case 'dive': return { d, p: this.diveVX < 0 ? POSE.DIVEL : POSE.DIVER };
      case 'celeb': return { d, p: (this.anim | 0) % 2 ? POSE.CELEB1 : POSE.CELEB0 };
      default: {
        const sp = Math.hypot(this.vx, this.vy);
        if (sp < 15) return { d, p: POSE.IDLE };
        return { d, p: POSE.RUN0 + ((this.anim | 0) % 4) };
      }
    }
  }
}
