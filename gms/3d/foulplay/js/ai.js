// The competition. They are genuinely quick — they read the corner ahead, take
// a real racing line and brake to the grip limit. That is deliberate: the
// player's edge is not supposed to be their right foot, it is the crowbar in
// the boot.

import { fireAttack, findTargets } from './attacks.js';
import { state } from './state.js';
import { emit } from './bus.js';
import { clamp, clamp01, lerp, rand, sign, damp } from './utils.js';

const MAX_LAT = 26;   // matches car.js

export class AIDriver {
  constructor(car, opts = {}) {
    this.car = car;
    this.skill = clamp(opts.skill != null ? opts.skill : 0.85, 0.35, 1);
    this.aggression = clamp(opts.aggression != null ? opts.aggression : 0.4, 0, 1);
    this.rubber = opts.rubber != null ? opts.rubber : 0.35;
    this.lineBias = rand(-0.34, 0.34);
    this.attackCd = rand(3, 9);
    this.noise = 0;
    this.noiseT = 0;
    this.brakeBias = lerp(0.66, 0.93, this.skill) + rand(-0.04, 0.04);
    this.aimT = 0;
    this.grudge = null;          // who wrecked them last; they remember
    this.grudgeT = 0;
    this.mistakeT = rand(6, 20);
    this.slipT = 0;
  }

  update(dt, cars) {
    const car = this.car;
    if (!car.alive || car.mode === 'wreck' || car.mode === 'grid' || car.respawnTimer > 0) {
      car.controls.steer = 0;
      car.controls.throttle = car.mode === 'grid' ? 0 : 1;
      car.controls.brake = 0;
      return;
    }
    const tr = car.track;
    const speed = clamp(car.forwardSpeed || 1, 1, 200);
    const w = tr.widthAt(car.s);

    // --- drift the line around a little so eight cars are not one car -------
    this.noiseT -= dt;
    if (this.noiseT <= 0) {
      this.noiseT = rand(1.4, 3.6);
      this.noise = rand(-1, 1) * (1 - this.skill) * 0.7;
    }
    // --- occasional honest mistake -----------------------------------------
    this.mistakeT -= dt;
    if (this.mistakeT <= 0) {
      this.mistakeT = rand(9, 26) / (1.1 - this.skill);
      this.slipT = rand(0.35, 0.9) * (1.15 - this.skill);
    }
    if (this.slipT > 0) this.slipT -= dt;

    // --- racing line --------------------------------------------------------
    const look = clamp(speed * 1.15, 28, 120);
    const cMid = tr.curvatureAt(car.s + look * 0.5);
    const cFar = tr.curvatureAt(car.s + look * 1.25);
    const inCorner = Math.abs(cMid) > 0.0035;

    let target;
    if (inCorner) {
      // hug the inside, harder the tighter it gets
      target = -sign(cMid) * w * 0.58 * clamp01(Math.abs(cMid) / 0.011);
    } else if (Math.abs(cFar) > 0.0035) {
      // set up wide for what is coming
      target = sign(cFar) * w * 0.5;
    } else {
      target = 0;
    }
    target += this.lineBias * w * 0.22 + this.noise * w * 0.3;
    if (car.blinded > 0) target += Math.sin(state.raceTime * 3 + car.id) * w * 0.5;

    // --- traffic ------------------------------------------------------------
    let ramming = 0;
    const ahead = findTargets(car, cars, 34);
    for (const o of ahead) {
      if (o.ds < 1 || o.ds > 30) continue;
      if (Math.abs(o.dt) > 4.4) continue;
      // Pick the side with more road, biased away from the barrier.
      const roomR = w - o.car.t, roomL = w + o.car.t;
      const side = roomR > roomL ? 1 : -1;
      const urgency = clamp01((30 - o.ds) / 26);
      target = lerp(target, o.car.t + side * 4.6, urgency * 0.85);
      break;
    }

    // --- the part where they try to put you in the wall ---------------------
    if (this.grudgeT > 0) this.grudgeT -= dt;
    const alongside = findTargets(car, cars, 9, { radial: true })
      .filter((o) => Math.abs(o.ds) < 5.2 && Math.abs(o.dt) < 5.5);
    if (alongside.length) {
      const o = alongside[0];
      const wantsIt = this.aggression * (o.car.isPlayer ? 1.25 : 0.5)
        + (this.grudge === o.car ? 0.5 : 0);
      if (wantsIt > 0.55) {
        // Lean on them, toward whichever barrier is nearer to them.
        target = o.car.t + sign(o.car.t || o.dt || 1) * 1.4;
        ramming = 1;
      }
    }

    target = clamp(target, -w * 0.88, w * 0.88);
    this.aimT = lerp(this.aimT, target, damp(6, dt));

    // --- steering -----------------------------------------------------------
    const err = this.aimT - car.t;
    const wantPsi = clamp(err * 0.05 - car.vl * 0.13, -0.62, 0.62);
    let steer = clamp((wantPsi - car.psi) * 3.6, -1, 1);
    if (this.slipT > 0) steer += Math.sin(state.raceTime * 11) * 0.5;
    car.controls.steer = clamp(steer * lerp(0.82, 1, this.skill), -1, 1);

    // --- braking to the grip limit -----------------------------------------
    const grip = MAX_LAT * (car.stats.grip || 1);
    const limit = tr.speedLimitAhead(car.s, Math.max(60, speed * 2.1), grip) * this.brakeBias;
    let brake = 0;
    if (speed > limit) brake = clamp((speed - limit) / 14, 0, 1);
    if (this.slipT > 0) brake *= 0.3;

    // Nobody lifts for a loop. If one is coming and they are short of the
    // speed it needs, the throttle stays pinned and the nitro goes in.
    const loop = tr.loopAhead(car.s, Math.max(90, speed * 2.6));
    const needLoop = loop && speed < loop.minSpeed * 1.14;
    if (needLoop) {
      brake = 0;
      if (car.boosts > 0 && !car.boosting && loop.dist < 120) car.useBoost();
    }

    car.controls.brake = brake;
    car.controls.throttle = brake > 0.35 ? 0 : 1;

    // --- rubber band --------------------------------------------------------
    if (this.rubber > 0 && state.player) {
      const gap = (car.progress - state.player.progress);
      const k = clamp(gap / 260, -1, 1);
      car.slowMul = lerp(car.slowMul, 1 - k * this.rubber * 0.13, damp(0.7, dt));
      if (car.slowT <= 0) car.slowT = 0.0001;   // keep slowMul from being reset
    }

    // --- kit ----------------------------------------------------------------
    if (!inCorner && car.boosts > 0 && !car.boosting && Math.random() < dt * (0.4 + this.skill * 0.5)) {
      car.useBoost();
    }

    this.attackCd -= dt;
    if (this.attackCd <= 0) {
      const near = findTargets(car, cars, 26, { radial: true });
      const wantsPlayer = near.find((o) => o.car.isPlayer);
      const pickIt = wantsPlayer || near[0];
      const roll = this.aggression * (wantsPlayer ? 1.5 : 0.7) + (this.grudge ? 0.3 : 0);
      if (pickIt && Math.random() < roll) {
        const r = fireAttack(car, cars);
        this.attackCd = rand(5, 13) / (0.4 + this.aggression);
        if (r && r.target && r.target.isPlayer) emit('ai:attackedPlayer', { car, skill: r.skill });
      } else {
        this.attackCd = rand(1.5, 3.5);
      }
    }
  }

  remember(attacker) {
    this.grudge = attacker;
    this.grudgeT = 22;
  }
}

// A quick personality generator so a grid of eight all feel different.
export function makeGrid(count, baseSkill, baseAggro) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const r = i / Math.max(1, count - 1);
    out.push({
      skill: clamp(baseSkill + lerp(0.1, -0.14, r) + rand(-0.05, 0.05), 0.3, 1),
      aggression: clamp(baseAggro + rand(-0.22, 0.28), 0.05, 1),
    });
  }
  return out;
}
