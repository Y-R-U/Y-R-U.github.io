// A creature's own side of a fight: hit points, the six states it moves through, and when a bite
// lands. Pure — js/world/vermin.js animates what this decides and js/game/spawner.js drives it.

import { ENEMIES } from './tables.js';

export const ACT = { none: 0, attack: 1, hurt: 2, die: 3 };

// Seconds each act runs for. vermin.js reads the same table, so the frame the bite lands on and
// the frame the lunge peaks on cannot drift apart.
export const ACT_T = { 1: 1.15, 2: 0.45, 3: 1.30 };

export const STATE = {
  idle: 'idle', alert: 'alert', chase: 'chase', attack: 'attack', dying: 'dying', dead: 'dead',
};

// Vermin do not charge. They are in the grain because the grain is there, and they turn on you
// when you hurt one — which is what makes L01 a hunt in the dark rather than eight rats at once.
// Anything with a grudge comes at you on sight.
export const CHARGES = new Set(['blight_boar', 'raider', 'hollow', 'watchman',
  'champion_1', 'champion_2', 'champion_3', 'brood_mother']);

export const AI = {
  notice: 7,
  reach: 1.3,
  leash: 26,
  alert: 0.35,
  gap: 1.4,
  chase: 0.85,
  // Where in the lunge the bite lands. The shader drives the body forward over at 0.28–0.56, so
  // anything outside that window reads as damage from a creature standing still.
  strikeAt: 0.42,
  // How long a body is left lying in the death pose before the world takes it away.
  corpse: 3.0,
  // A hurt creature's neighbours notice. This is the radius of "the nest heard that".
  alarm: 4.5,
};

export const isLive = f => f.state !== STATE.dying && f.state !== STATE.dead;

export function arm(a, enemy) {
  const e = ENEMIES[enemy];
  if (!e) return null;
  a.enemy = enemy;
  a.level = e.level;
  a.armour = e.armour;
  a.bite = e.damage;
  a.hp = a.maxHp = e.hp;
  a.state = STATE.idle;
  a.hostile = CHARGES.has(enemy);
  a.since = 0;
  a.cool = 0;
  a.bit = false;
  a.act = ACT.none;
  a.at = 0;
  a.speed = 0;
  return a;
}

// Returns whether this hit was the killing one. A second hit on a body answers false, which is
// what makes `kill` fire exactly once however many bolts are already in flight.
export function hurt(a, damage) {
  if (!isLive(a)) return { killed: false, hit: false };
  a.hp = Math.max(0, a.hp - damage);
  a.hostile = true;
  a.since = 0;
  if (a.hp > 0) {
    // A recoil interrupts a lunge: the creature comes out of it wanting to close again, and the
    // cooldown is what stops a flinch from being a free attack reset.
    if (a.state !== STATE.chase) { a.state = STATE.chase; a.cool = AI.gap; }
    a.act = ACT.hurt;
    a.at = 0;
    a.speed = 0;
    return { killed: false, hit: true };
  }
  a.state = STATE.dying;
  a.act = ACT.die;
  a.at = 0;
  a.speed = 0;
  return { killed: true, hit: true };
}

function tickAct(a, dt) {
  if (!a.act) return;
  a.at += dt / ACT_T[a.act];
  if (a.at < 1) return;
  if (a.act === ACT.die) { a.at = 1; return; }
  a.act = ACT.none;
  a.at = 0;
}

// One creature's frame. Returns the raw damage it deals this frame — the player's Ward mitigates
// it on the other side of the seam, in session.js.
export function think(a, dt, { px, pz, run = 1 }) {
  if (a.state === STATE.dead) return 0;
  a.since += dt;
  a.cool = Math.max(0, a.cool - dt);
  tickAct(a, dt);

  if (a.state === STATE.dying) {
    if (a.since >= ACT_T[ACT.die] + AI.corpse) a.state = STATE.dead;
    return 0;
  }

  const dx = px - a.x, dz = pz - a.z;
  const d = Math.hypot(dx, dz);

  if (a.state === STATE.idle) {
    if (d > AI.leash || (!a.hostile && d > AI.notice)) return 0;
    a.state = STATE.alert;
    a.since = 0;
    a.speed = 0;
    return 0;
  }

  // Losing you is not forgiving you: a creature that gives up goes back to wandering, but it
  // stays hostile and picks the fight up again the moment you come back inside its notice.
  if (d > AI.leash) {
    a.state = STATE.idle;
    a.speed = 0;
    return 0;
  }

  a.heading = Math.atan2(dx, dz);

  if (a.state === STATE.alert) {
    if (a.since >= AI.alert) { a.state = STATE.chase; a.since = 0; }
    return 0;
  }

  if (a.state === STATE.chase) {
    a.speed = a.act === ACT.hurt ? 0 : run * AI.chase;
    if (d <= AI.reach && !a.cool && a.act !== ACT.hurt) {
      a.state = STATE.attack;
      a.since = 0;
      a.speed = 0;
      a.act = ACT.attack;
      a.at = 0;
      a.bit = false;
    }
    return 0;
  }

  a.speed = 0;
  let dealt = 0;
  if (!a.bit && a.since >= ACT_T[ACT.attack] * AI.strikeAt) {
    a.bit = true;
    // Missed if you backed off during the windup, which is the whole reason the windup exists.
    if (d <= AI.reach * 1.7) dealt = a.bite;
  }
  if (a.since >= ACT_T[ACT.attack]) {
    a.state = STATE.chase;
    a.cool = AI.gap;
    a.since = 0;
  }
  return dealt;
}
