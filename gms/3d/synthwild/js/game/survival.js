// Integrity (health) and Charge (hunger), both 0..20. Pure: tick(dt, env) takes everything it needs.

export const MAX = 20;
export const AIR_MAX = 10;
export const TUNING = {
  drainIdle: 0.008,        // Charge/s just existing
  drainWalk: 0.008,        // extra while moving
  drainSprint: 0.03,
  drainSwim: 0.012,
  costJump: 0.05,
  costBreak: 0.02,
  costAttack: 0.06,
  solar: 0.012,            // daylight trickle under open sky (scaled by daylight)
  lamp: 0.02,              // trickle while standing in block light >= LAMP_LIGHT
  lampLight: 8,
  openSky: 13,             // sky light at the head that counts as open sky
  regenAbove: 18,
  regenEvery: 2.5,
  regenCost: 0.25,
  starveEvery: 4,
  starveFloor: 1,          // Charge starvation never finishes you off
  airSeconds: 15,
  drownEvery: 1,
  drownDmg: 2,
  fallSafe: 3,
  invuln: 0.5,
};

export class Survival {
  constructor(bus = null) {
    this.bus = bus;
    this.reset();
  }

  reset() {
    this.integrity = MAX;
    this.charge = MAX;
    this.air = AIR_MAX;
    this.dead = false;
    this.invuln = 0;
    this.regenT = 0;
    this.starveT = 0;
    this.drownT = 0;
    this.eat = null;
    this.trickle = 0;      // last frame's trickle rate, for the HUD ("charging" glow)
    this.droop = false;    // night with no lamp: the solar trickle has stopped
    this.underwater = false;
    this.lastDamage = null;
  }

  emit(ev, d) { this.bus?.emit?.(ev, d); }

  spend(n) { this.charge = Math.max(0, this.charge - n); }

  // env: { creative, peaceful, daylight (0..1), skyLight, blockLight, moving, sprinting, swimming, eyeInWater }
  tick(dt, env = {}) {
    if (this.dead) return;
    this.invuln = Math.max(0, this.invuln - dt);
    if (env.creative) {
      this.integrity = MAX; this.charge = MAX; this.air = AIR_MAX; this.trickle = 0;
      this.droop = this.underwater = false;
      return;
    }
    const T = TUNING;
    let drain = T.drainIdle;
    const dmul = env.drain ?? 1;
    if (env.moving) drain += env.sprinting ? T.drainSprint : T.drainWalk;
    if (env.swimming) drain += T.drainSwim;

    let trickle = 0;
    const daylight = env.daylight ?? 1;
    if ((env.skyLight ?? 15) >= T.openSky && daylight > 0.15) trickle = T.solar * Math.min(1, daylight * 1.25);
    if ((env.blockLight ?? 0) >= T.lampLight) trickle = Math.max(trickle, T.lamp);
    this.trickle = trickle;
    this.droop = trickle === 0 && daylight <= 0.15;
    this.underwater = !!env.eyeInWater;
    this.charge = Math.min(MAX, Math.max(0, this.charge + (trickle - drain * dmul) * dt));
    if (env.peaceful) this.charge = MAX;

    if (this.charge > T.regenAbove && this.integrity < MAX) {
      this.regenT += dt;
      const every = env.regenEvery ?? T.regenEvery;
      while (this.regenT >= every && this.integrity < MAX) {
        this.regenT -= every;
        this.integrity = Math.min(MAX, this.integrity + 1);
        this.spend(T.regenCost);
        this.emit('player:heal', { amount: 1 });
      }
    } else this.regenT = 0;

    if (this.charge <= 0) {
      this.starveT += dt;
      while (this.starveT >= T.starveEvery) {
        this.starveT -= T.starveEvery;
        if (this.integrity > (env.starveFloor ?? T.starveFloor)) this.damage(1, 'starve', { ignoreInvuln: true });
      }
    } else this.starveT = 0;

    if (env.eyeInWater) {
      this.air = Math.max(0, this.air - (AIR_MAX / T.airSeconds) * dt);
      if (this.air <= 0) {
        this.drownT += dt;
        while (this.drownT >= T.drownEvery) { this.drownT -= T.drownEvery; this.damage(T.drownDmg, 'drown', { ignoreInvuln: true }); }
      }
    } else {
      this.air = Math.min(AIR_MAX, this.air + AIR_MAX * 0.5 * dt);
      this.drownT = 0;
    }
  }

  fallDamage(dist) {
    return Math.max(0, Math.floor(dist - TUNING.fallSafe));
  }

  // Returns the damage actually taken.
  damage(amount, src = 'unknown', { ignoreInvuln = false, creative = false, dir = null } = {}) {
    if (this.dead || creative || amount <= 0) return 0;
    if (!ignoreInvuln && this.invuln > 0) return 0;
    this.integrity = Math.max(0, this.integrity - amount);
    if (!ignoreInvuln) this.invuln = TUNING.invuln;
    this.lastDamage = { amount, src };
    this.emit('player:damage', { amount, src, dir });
    if (this.integrity <= 0) {
      this.dead = true;
      this.eat = null;
      this.emit('player:death', { src });
    }
    return amount;
  }

  heal(n) { this.integrity = Math.min(MAX, this.integrity + n); }

  // Food: hold for item.food.eat seconds. Returns 'eating' | 'done' | 'full' | null.
  holdEat(item, dt) {
    if (!item?.food || this.dead) { this.eat = null; return null; }
    if (this.charge >= MAX) { this.eat = null; return 'full'; }
    if (!this.eat || this.eat.id !== item.id) {
      this.eat = { id: item.id, t: 0, dur: item.food.eat || 1 };
      this.emit('player:eatStart', { id: item.id, dur: this.eat.dur });
    }
    this.eat.t += dt;
    if (this.eat.t >= this.eat.dur) {
      this.charge = Math.min(MAX, this.charge + item.food.charge);
      this.emit('player:eat', { id: item.id, charge: item.food.charge });
      this.eat = null;
      return 'done';
    }
    return 'eating';
  }
  stopEat() {
    if (this.eat) this.emit('player:eatStop', {});
    this.eat = null;
  }
  get eatProgress() { return this.eat ? Math.min(1, this.eat.t / this.eat.dur) : 0; }

  revive() {
    this.dead = false;
    this.integrity = MAX;
    this.charge = Math.max(this.charge, MAX * 0.75);
    this.air = AIR_MAX;
    this.invuln = 2;
  }

  serialize() {
    return { integrity: this.integrity, charge: +this.charge.toFixed(3), air: +this.air.toFixed(2), dead: this.dead };
  }
  load(d) {
    if (!d) return;
    this.integrity = d.integrity ?? MAX;
    this.charge = d.charge ?? MAX;
    this.air = d.air ?? AIR_MAX;
    this.dead = !!d.dead;
  }
}
