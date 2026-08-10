import { MAT, MATERIAL, DAMAGE } from './materials.js';
import { STATUS } from './status.js';
import { moveBody, cornerCorrect, propBlocked } from './physics.js';

/**
 * Rook.
 *
 * Every number here was set by playing, not by reasoning. The brief is "scrawny
 * teenager, light, slightly out of control" — so: high acceleration but low mass
 * feel, a jump that floats a little at the apex, a hard turn-around, and a dash
 * that overshoots. The forgiveness features (coyote, buffer, corner correct,
 * step-up) are what make it read as *responsive* rather than as *floaty*.
 *
 * He is drawn procedurally: a two-bone IK leg pair, a swinging arm pair, a
 * verlet cloak and three verlet hair strands. That is why he can be lit by a
 * spell going off next to him — there is no baked sprite to fight.
 */

const RUN = 540;
const ACC_G = 5200, DEC_G = 6200, TURN_G = 9000;
const ACC_A = 2600, DEC_A = 1000;
const JUMP_V = -1075;
const FALL_MULT = 1.32;
const APEX_V = 220, APEX_GRAV = 0.72;      // a little hang time at the top
const LOW_JUMP = 0.42;
/**
 * Floor under the variable-height cut, and a window before it can apply at all.
 *
 * A held jump clears 196px; releasing early used to leave 78px, and a touch
 * "tap" has no hold length to read at all. Anything under a full press was
 * therefore unusable on mobile. The cut still shortens a jump — it just cannot
 * shorten it below ~150px, which is a height the level can be built against.
 */
const CUT_FLOOR = 745, CUT_AFTER = 0.055;
const COYOTE = 0.10, BUFFER = 0.13;

/**
 * Lift — the lifestone's air jump.
 *
 * Rook is a scrawny teenager with a god's battery bolted to his chest; a second
 * jump is the cheapest way to make that readable in the fingers rather than in
 * dialogue. It is deliberately feeble at level 1 (a stumble upward, ~70px) and
 * grows into a full second jump, because a traversal power that scales is a
 * reason to come back to a corridor you could not clear an hour ago.
 */
const LIFT_MIN = 0.56, LIFT_MAX = 1.0;
const LIFT_FULL_AT = 14;     // player level at which lift equals a ground jump
const LIFT_TWO_AT = 12;      // …and at which there are two of them
const LIFT_PUSH = 1.06;      // forward shove, as a fraction of run speed, for gaps
const DASH_V = 1290, DASH_T = 0.155, DASH_CD = 0.46, DASH_IFRAME = 0.24;
const WALL_SLIDE = 250, WALL_JUMP_X = 640, WALL_JUMP_Y = -940, WALL_STICK = 0.11;
const MAXFALL = 1750;
const BODY_W = 46, BODY_H = 152;

const CLOTH = [0.145, 0.150, 0.190];
const COAT = [0.105, 0.110, 0.150];
const CLOAK = [0.075, 0.080, 0.115];
const SKIN = [0.355, 0.265, 0.215];
const HAIR = [0.115, 0.085, 0.080];
const RIM = [0.52, 0.50, 0.52];
const STONE = [0.55, 0.85, 1.0];

function chain(n, x, y, seg) {
  const c = { n, x: new Float32Array(n), y: new Float32Array(n), ox: new Float32Array(n), oy: new Float32Array(n), seg };
  for (let i = 0; i < n; i++) { c.x[i] = x; c.y[i] = y + i * seg; c.ox[i] = c.x[i]; c.oy[i] = c.y[i]; }
  return c;
}

function stepChain(c, ax, ay, gx, gy, dt, damp, stiff) {
  c.x[0] = ax; c.y[0] = ay; c.ox[0] = ax; c.oy[0] = ay;
  for (let i = 1; i < c.n; i++) {
    const vx = (c.x[i] - c.ox[i]) * damp;
    const vy = (c.y[i] - c.oy[i]) * damp;
    c.ox[i] = c.x[i]; c.oy[i] = c.y[i];
    c.x[i] += vx + gx * dt * dt;
    c.y[i] += vy + gy * dt * dt;
  }
  for (let k = 0; k < 3; k++) {
    for (let i = 1; i < c.n; i++) {
      const dx = c.x[i] - c.x[i - 1], dy = c.y[i] - c.y[i - 1];
      const d = Math.hypot(dx, dy) || 1e-4;
      const diff = (d - c.seg) / d * stiff;
      c.x[i] -= dx * diff; c.y[i] -= dy * diff;
    }
  }
}

export function createPlayer(world, x, y) {
  const e = world.spawn({
    kind: 'player', team: 0, x, y, w: BODY_W, h: BODY_H,
    // Step-up doubles as the "do not get stuck on scenery" budget. At 20 a kerb,
    // a root, a fallen brick or the crest of a slope could stop him dead, and
    // being stopped by a pebble reads as a bug even when the level is fine.
    // 52 walks over anything ankle-to-knee height; a crate (78) is still a jump.
    hp: 100, material: MATERIAL.FLESH, stepUp: 52, mass: 1,
    layer: world.LAYER.ACTORS, flammable: 0.5,
  });
  if (!e) throw new Error('[sim] no entity slot for the player');

  const d = e.data;
  d.state = 'idle';
  d.coyote = 0; d.buffer = 0; d.jumpHeld = false; d.jumping = false; d.jumpT = 0;
  d.liftLeft = 1; d.liftT = 0; d.liftEver = false;
  d.dashT = 0; d.dashCd = 0; d.dashDX = 1; d.dashDY = 0; d.canDash = true;
  d.wallT = 0; d.wallDir = 0;
  d.squash = 0; d.stretch = 0; d.lean = 0; d.leanV = 0;
  d.legPhase = 0; d.armPhase = 0; d.blink = 2 + world.rng.next() * 3;
  d.castT = 0; d.castHold = 0; d.hurtT = 0; d.landT = 0;
  d.trailN = 0;
  d.trailX = new Float32Array(12); d.trailY = new Float32Array(12); d.trailA = new Float32Array(12);
  d.cloak = chain(5, x, y, 15);
  d.hair = [chain(3, x, y, 7), chain(3, x, y, 8), chain(3, x, y, 6)];
  d.aimAng = 0;
  d.dustT = 0;
  d.castPose = (s) => { d.castT = Math.max(d.castT, s || 0.22); };

  e.onLand = (self, impact) => {
    const k = Math.min(1, impact / 1400);
    d.squash = Math.max(d.squash, 0.35 + k * 0.65);
    d.landT = 0.16;
    d.canDash = true;
    if (impact > 420) {
      const m = MAT[self.groundMat] || MAT[MATERIAL.EARTH];
      world.P.emit({
        x: self.x, y: self.y + BODY_H * 0.5, count: 6 + (k * 14) | 0,
        vx: 0, vy: -1, vSpread: 1.35, speed: 90 + k * 220, speedVar: 120,
        life: 0.5, lifeVar: 0.35, size: 12, sizeEnd: 42,
        color: [m.dust[0], m.dust[1], m.dust[2], 0.5], color2: [m.dust[0] * 0.4, m.dust[1] * 0.4, m.dust[2] * 0.4, 0],
        gravity: 260, drag: 3.2,
      });
      world.sfx('land', self.x, self.y);
      if (impact > 1200) world.R.fx.shake(0.10, 0.18);
    }
  };

  e.onDamage = (self, amount, type) => {
    // burn/acid tick every frame; only a real hit should flash and shake
    if (amount < 2.5) return amount;
    d.hurtT = 0.3;
    world.R.fx.shake(0.16 + Math.min(0.3, amount * 0.004), 0.24);
    world.R.fx.chroma(0.35, 0.2);
    return amount;
  };

  e.onDeath = () => {
    d.state = 'dead';
    world.playerControl = false;
    world.bus.emit('player:died', { x: e.x, y: e.y, cause: 'damage' });
    world.R.fx.timeScale(0.2, 0.5);
    world.R.fx.flash(0.6, 0.1, 0.1, 0.35, 0.4);
  };

  return e;
}

export function updatePlayer(world, e, dt) {
  const d = e.data;
  const input = world.input;
  const ctrl = world.playerControl && d.state !== 'dead' && e.status[STATUS.STUN] <= 0;

  let ax = 0;
  let jumpPressed = false, jumpHeld = false, dashPressed = false;
  if (ctrl) {
    ax = input.axisX;
    if (Math.abs(ax) < 0.2) ax = 0;
    jumpPressed = input.pressed('jump');
    jumpHeld = input.held('jump');
    dashPressed = input.pressed('dash');
  }
  if (e.status[STATUS.ROOT] > 0) ax = 0;
  const slow = e.status[STATUS.SLOW] > 0 ? 1 - Math.min(0.75, e.power[STATUS.SLOW]) : 1;
  const haste = e.status[STATUS.HASTE] > 0 ? 1 + e.power[STATUS.HASTE] * 0.35 : 1;
  const speedMul = slow * haste;

  d.coyote -= dt; d.buffer -= dt; d.dashCd -= dt;
  if (d.hurtT > 0) d.hurtT -= dt;
  if (d.castT > 0) d.castT -= dt;
  if (d.landT > 0) d.landT -= dt;
  if (d.liftT > 0) d.liftT -= dt;
  if (jumpPressed) d.buffer = BUFFER;

  const wasGround = e.onGround;

  /* ---------------- dash ---------------- */
  if (d.dashT > 0) {
    d.dashT -= dt;
    e.vx = d.dashDX * DASH_V * speedMul;
    e.vy = d.dashDY * DASH_V * 0.62;
    if (d.dashT <= 0) {
      e.vx *= 0.55; e.vy *= 0.4;
      d.state = 'fall';
    }
  } else if (dashPressed && d.dashCd <= 0 && d.canDash) {
    let dx = ax, dy = 0;
    if (Math.abs(input.axisY) > 0.6) dy = Math.sign(input.axisY) * 0.75;
    if (dx === 0 && dy === 0) dx = e.faceX;
    const len = Math.hypot(dx, dy) || 1;
    d.dashDX = dx / len; d.dashDY = dy / len;
    d.dashT = DASH_T; d.dashCd = DASH_CD;
    d.canDash = e.onGround;
    e.invuln = Math.max(e.invuln, DASH_IFRAME);
    d.state = 'dash';
    d.stretch = 1;
    world.R.fx.shake(0.08, 0.12);
    world.sfx('dash', e.x, e.y);
    world.P.emit({
      x: e.x, y: e.y, count: 16, vx: -d.dashDX, vy: -d.dashDY, vSpread: 0.5,
      speed: 260, speedVar: 220, life: 0.34, lifeVar: 0.2, size: 16, sizeEnd: 1,
      color: [0.62, 0.86, 1, 0.85], color2: [0.25, 0.4, 0.7, 0], drag: 3.4, add: true, glow: 0.2,
    });
  }

  /* ---------------- horizontal ---------------- */
  if (d.dashT <= 0) {
    const target = ax * RUN * speedMul;
    if (e.onGround) {
      if (ax === 0) e.vx = approach(e.vx, 0, DEC_G * dt);
      else if (Math.sign(ax) !== Math.sign(e.vx) && e.vx !== 0) e.vx = approach(e.vx, target, TURN_G * dt);
      else e.vx = approach(e.vx, target, ACC_G * dt);
    } else {
      if (ax === 0) e.vx = approach(e.vx, 0, DEC_A * dt);
      else e.vx = approach(e.vx, target, ACC_A * dt);
    }
  }
  if (ax !== 0 && d.dashT <= 0) e.faceX = ax > 0 ? 1 : -1;

  /* ---------------- wall ---------------- */
  const pressingWall = e.onWall !== 0 && ax !== 0 && Math.sign(ax) === e.onWall;
  if (!e.onGround && pressingWall && e.vy > 0 && d.dashT <= 0) {
    e.vy = Math.min(e.vy, WALL_SLIDE);
    d.wallT = WALL_STICK; d.wallDir = e.onWall;
    d.state = 'wall';
    d.canDash = true;
    if (world.frame % 5 === 0) {
      const m = MAT[world.terrain.materialAtWorld(e.x + e.onWall * (BODY_W * 0.6), e.y)] || MAT[MATERIAL.ROCK];
      world.P.emit({
        x: e.x + e.onWall * BODY_W * 0.5, y: e.y + 20, count: 1, speed: 30, life: 0.4,
        size: 6, sizeEnd: 1, color: [m.dust[0], m.dust[1], m.dust[2], 0.6], color2: [0, 0, 0, 0], gravity: 300,
      });
    }
  } else d.wallT -= dt;

  /* ---------------- jump ---------------- */
  const lift = liftStats(world);
  if (e.onGround || d.wallT > 0) d.liftLeft = lift.charges;
  if (d.jumpT !== undefined) d.jumpT += dt;
  if (e.onGround) { d.coyote = COYOTE; d.canDash = true; }
  if (d.buffer > 0) {
    if (d.coyote > 0) {
      e.vy = JUMP_V; d.buffer = 0; d.coyote = 0; d.jumping = true; d.jumpT = 0;
      d.jumpedEver = true;
      d.stretch = 1; d.squash = 0;
      d.state = 'jump';
      world.sfx('jump', e.x, e.y);
      const m = MAT[e.groundMat] || MAT[MATERIAL.EARTH];
      world.P.emit({
        x: e.x, y: e.y + BODY_H * 0.5, count: 7, vx: 0, vy: 1, vSpread: 1.2, speed: 70, speedVar: 90,
        life: 0.4, lifeVar: 0.2, size: 10, sizeEnd: 30,
        color: [m.dust[0], m.dust[1], m.dust[2], 0.42], color2: [0, 0, 0, 0], gravity: 120, drag: 3,
      });
    } else if (d.wallT > 0) {
      e.vy = WALL_JUMP_Y; e.vx = -d.wallDir * WALL_JUMP_X;
      e.faceX = -d.wallDir;
      d.buffer = 0; d.wallT = 0; d.jumping = true; d.jumpT = 0; d.stretch = 1;
      d.state = 'jump';
      world.sfx('jump', e.x, e.y);
    } else if (d.liftLeft > 0 && d.dashT <= 0 && !aboutToLand(world, e)) {
      doLift(world, e, lift, ax, speedMul);
    }
  }
  // Never cut below a height the level can be built against, and never in the
  // first few ms — a touch tap carries no hold length to read.
  if (d.jumping && !jumpHeld && e.vy < 0 && d.jumpT > CUT_AFTER) {
    e.vy = Math.max(e.vy, Math.min(e.vy * LOW_JUMP, -CUT_FLOOR));
    d.jumping = false;
  }
  if (e.vy > 0) d.jumping = false;

  /* ---------------- gravity ---------------- */
  let g = world.gravity;
  if (e.vy > 0) g *= FALL_MULT;
  if (Math.abs(e.vy) < APEX_V && !e.onGround) g *= APEX_GRAV;
  if (d.dashT <= 0) {
    e.vy += g * dt;
    if (e.vy > MAXFALL) e.vy = MAXFALL;
  }

  /* ---------------- move ---------------- */
  const preVy = e.vy;
  e.px = e.x; e.py = e.y;
  moveBody(world, e, dt);
  if (e.hitY < 0) cornerCorrect(world, e, 15);
  if (e.onGround && !wasGround && e.onLand) e.onLand(e, preVy);
  e.wasGround = wasGround;

  /* ---------------- state + juice ---------------- */
  if (d.state !== 'dead') {
    if (d.dashT > 0) d.state = 'dash';
    else if (e.onGround) d.state = Math.abs(e.vx) > 40 ? 'run' : 'idle';
    else if (d.state !== 'wall' || !pressingWall) d.state = e.vy < 0 ? 'jump' : 'fall';
  }

  // trail ring buffer — sampled every tick during a dash, faded otherwise
  for (let i = 0; i < 12; i++) d.trailA[i] *= 0.86;
  if (d.dashT > 0 && world.frame % 1 === 0) {
    const i = d.trailN % 12;
    d.trailX[i] = e.x; d.trailY[i] = e.y; d.trailA[i] = 1;
    d.trailN++;
  }

  d.squash = Math.max(0, d.squash - dt * 4.2);
  d.stretch = Math.max(0, d.stretch - dt * 3.4);
  const leanTarget = clampf(e.vx / RUN, -1, 1) * 0.20 + (e.onGround ? 0 : clampf(e.vy / 1400, -0.4, 0.4) * -0.06);
  d.leanV += (leanTarget - d.lean) * 26 * dt;
  d.leanV *= 1 - Math.min(1, dt * 9);
  d.lean += d.leanV * dt;

  d.legPhase += (e.onGround ? Math.abs(e.vx) / 46 : 3) * dt;
  d.armPhase = d.legPhase;

  // run dust
  if (e.onGround && Math.abs(e.vx) > 260) {
    d.dustT -= dt;
    if (d.dustT <= 0) {
      d.dustT = 0.075;
      const m = MAT[e.groundMat] || MAT[MATERIAL.EARTH];
      world.P.emit({
        x: e.x - e.faceX * 12, y: e.y + BODY_H * 0.5 - 2, count: 1,
        vx: -e.faceX, vy: -0.4, vSpread: 0.5, speed: 60, speedVar: 60,
        life: 0.42, lifeVar: 0.2, size: 9, sizeEnd: 26,
        color: [m.dust[0], m.dust[1], m.dust[2], 0.34], color2: [0, 0, 0, 0], gravity: 60, drag: 3,
      });
      world.sfx('step_' + MAT[e.groundMat].name.toLowerCase(), e.x, e.y);
    }
  }

  // secondary motion
  const shoulderX = e.x - e.faceX * 4, shoulderY = e.y - BODY_H * 0.28;
  stepChain(d.cloak, shoulderX, shoulderY, -e.vx * 0.55 + world.wind * 40, world.gravity * 0.55, dt, 0.90, 0.55);
  const headX = e.x + Math.sin(d.lean) * 44, headY = e.y - BODY_H * 0.42;
  for (let i = 0; i < 3; i++) {
    stepChain(d.hair[i], headX + (i - 1) * 9, headY - 12, -e.vx * 0.30, world.gravity * 0.22, dt, 0.86, 0.7);
  }

  // Teach the lift once per run, and teach it at the moment it is useful: the
  // first time he is falling with a charge in hand and has not used one.
  if (!d.liftTold && !d.liftEver && d.jumpedEver && !e.onGround && e.vy > 120 && d.liftLeft > 0) {
    d.liftTold = true;
    world.bus.emit('hint:tip', { text: 'Tap jump again in mid-air', value: 'LIFT', life: 4.5 });
  }

  if (e.onGround) d.groundFoot = e.y + BODY_H * 0.5;
  blockedHint(world, e, dt, ax);
  autoAim(world, e, dt);
  d.aimAng = Math.atan2(world.input.aim.y - (e.y - BODY_H * 0.1), world.input.aim.x - e.x);
  world.input.setAimOrigin(e.x, e.y - BODY_H * 0.1);
}

/* ------------------------------------------------------------------ *
 * Lift — the air jump, and the arithmetic that says how high anything can get
 * ------------------------------------------------------------------ */

/** Strength and number of air jumps at the player's current level. */
export function liftStats(world) {
  const lv = world.playerLevel ? world.playerLevel() : 1;
  const k = clampf((lv - 1) / (LIFT_FULL_AT - 1), 0, 1);
  return { power: LIFT_MIN + (LIFT_MAX - LIFT_MIN) * k, charges: lv >= LIFT_TWO_AT ? 2 : 1, k, level: lv };
}

/** How far a launch at `v` px/s rises, honouring the apex-gravity cheat. */
function riseFor(world, v) {
  const g = world.gravity;
  const gApex = g * APEX_GRAV;
  if (v <= APEX_V) return v * v / (2 * gApex);
  return (v * v - APEX_V * APEX_V) / (2 * g) + APEX_V * APEX_V / (2 * gApex);
}

/**
 * Total height Rook can reach from standing, lifts included. The blocked hint
 * is sized off this rather than a constant, so telling the player to jump can
 * never outrun what he is actually able to do.
 */
export function jumpReach(world) {
  const l = liftStats(world);
  return riseFor(world, -JUMP_V) + riseFor(world, -JUMP_V * l.power) * l.charges;
}

/**
 * Jump is buffered for 130ms, which is what makes landing-and-jumping feel
 * good — but an early press on the way down would otherwise be spent on a lift
 * one frame before the ground jump it was meant for. If he is falling with
 * floor just below him, hold the press for the landing.
 */
function aboutToLand(world, e) {
  if (e.vy <= 0) return false;
  const y = e.y + e.h * 0.5 + 26;
  return world.terrain.solidBox(e.x, y, e.w * 0.8, 50) || !!propBlocked(world, e.x, y, e.w * 0.8, 50);
}

function doLift(world, e, lift, ax, speedMul) {
  const d = e.data;
  e.vy = JUMP_V * lift.power;
  // A shove in the held direction: the lift is for crossing gaps as much as
  // for topping ledges, and from a standing fall there is no speed to keep.
  if (ax !== 0) e.vx = approach(e.vx, ax * RUN * LIFT_PUSH * speedMul, 1400);
  d.liftLeft--;
  d.buffer = 0; d.jumping = true; d.jumpT = 0;
  d.stretch = 1; d.squash = 0; d.liftT = 0.42;
  d.state = 'jump';
  world.sfx('lift', e.x, e.y);
  world.R.fx.shake(0.05, 0.12);
  // a flat ring of stone-light kicked downward — reads as "pushed off nothing"
  world.P.emit({
    x: e.x, y: e.y + BODY_H * 0.34, count: 20, vx: 0, vy: 1, vSpread: 0.55,
    speed: 210 + lift.k * 160, speedVar: 130, life: 0.42, lifeVar: 0.2,
    size: 16, sizeEnd: 2, color: [0.62, 0.88, 1, 0.85], color2: [0.2, 0.42, 0.8, 0],
    drag: 3.6, add: true, glow: 0.25,
  });
  if (!d.liftEver) {
    d.liftEver = true;
    world.bus.emit('bark', { text: '…huh. It caught me.', priority: 2 });
  }
}

/* ------------------------------------------------------------------ *
 * "Why am I stuck?"
 *
 * Being blocked is fine — half this game is deciding what to break. Being
 * blocked with no idea whether the answer is jump, break, or a bug is not.
 * Lean into something for a second while actually pushing towards it and the
 * game says which it is, sized off the obstacle rather than guessed.
 * ------------------------------------------------------------------ */

const HINT_DELAY = 0.9;      // long enough that brushing a crate says nothing
const HINT_REPEAT = 6;       // seconds before the same advice is offered again
const SAFE = 0.82;           // margin on a plain jump — even a flick-tap clears this (measured 152)
const SAFE_LIFT = 0.78;      // and a wider one on a jump that needs the lift timed

/** Pretty names for the things most likely to be in the way. */
const BLOCK_NAMES = {
  crate: 'Crates', barrel: 'Barrels', wall_brick: 'Brick wall', pillar_stone: 'Stone pillar',
  arch_stone: 'Stone arch', boulder_big: 'Boulder', boulder_small: 'Boulder', gate_iron: 'Iron gate',
  fence: 'Fence', stump: 'Stump', deadtree: 'Dead tree', tree_trunk: 'Tree', oak_trunk: 'Oak',
  burnt_trunk: 'Burnt trunk', rocks_small: 'Rocks', skull_pile: 'Bones',
};

function blockedHint(world, e, dt, ax) {
  const d = e.data;
  const dir = e.onWall;
  // Only while he is actually pushing into it — standing beside a wall is not
  // stuck. Jumping does NOT reset the timer, because jumping at a wall is what
  // a player does when they are stuck and it is exactly when they want telling.
  if (!dir || Math.sign(ax) !== dir) { d.blockT = 0; return; }
  d.blockT = (d.blockT || 0) + dt;
  if (d.blockT < HINT_DELAY) return;
  if (world.time - (d.blockHintAt || -99) < HINT_REPEAT) return;
  d.blockHintAt = world.time;

  // How tall is it, and is it a prop or the ground itself? Measured from the
  // ground he last stood on, not from his current feet — measuring mid-jump
  // made a 335px pillar report 158 and advise a jump that cannot work.
  const px = e.x + dir * (e.w * 0.5 + 8);
  const foot = d.groundFoot === undefined ? e.y + e.h * 0.5 : d.groundFoot;
  let clear = null, prop = null;
  for (let y = foot - 6; y > foot - 620; y -= 8) {
    const p = world.terrain.solidBox(px, y, 6, 6) ? null : propBlocked(world, px, y, 6, 6);
    if (p && !prop) prop = p;
    if (!p && !world.terrain.solidBox(px, y, 6, 6)) { clear = y; break; }
  }
  const height = clear === null ? 999 : foot - clear;

  // Sized off what he can actually do at this level, not off a constant — the
  // lift grows, so what counts as jumpable grows with it.
  const plain = riseFor(world, -JUMP_V) * SAFE;
  const withLift = jumpReach(world) * SAFE_LIFT;

  let text, action;
  if (height <= plain) { text = 'Jump it'; action = 'JUMP'; }
  else if (height <= withLift) { text = 'Jump, then jump again'; action = 'LIFT'; }
  else if (prop) { text = (BLOCK_NAMES[prop.id] || 'This') + ' — break it'; action = 'BREAK'; }
  else { text = 'Solid rock — blast through it'; action = 'BREAK'; }
  world.bus.emit('hint:blocked', { text, action, x: e.x, y: e.y, height: Math.round(height), prop });
}

const AUTO_AIM_RANGE = 820;
const AUTO_PROP_RANGE = 600;

/**
 * The blocker auto-aim.
 *
 * With no enemy up, aim used to default to a point 340px ahead at head height —
 * which sails clean over a crate and misses anything below you entirely. Half
 * this game is deciding what to break, so with nothing to fight the aim goes to
 * the nearest thing that is actually in the way.
 *
 * Only SOLID props: fences and ferns are walked and shot straight through, so
 * targeting one is targeting scenery. And never the structure holding him up —
 * an auto-cast circle chewing through the bridge under his own feet is a death
 * he never asked for. That means the prop underfoot, whatever props that up,
 * and its siblings on the same supports: the bridge deck is four segments on
 * shared pillars, so excluding only the one he stands on still had the aim
 * quietly demolishing the span he was about to walk along.
 */
const propBuf = [];
const safeBuf = [];
function standingSet(world, e) {
  safeBuf.length = 0;
  if (!e.onGround) return safeBuf;
  const stand = propBlocked(world, e.x, e.y + e.h * 0.5 + 4, e.w * 0.8, 10);
  if (!stand) return safeBuf;
  safeBuf.push(stand);
  const sup = stand.supportedBy;
  for (let i = 0; i < sup.length; i++) {
    const s = sup[i];
    if (safeBuf.indexOf(s) < 0) safeBuf.push(s);
    for (let j = 0; j < s.supports.length; j++) {
      const sib = s.supports[j];
      if (safeBuf.indexOf(sib) < 0) safeBuf.push(sib);
    }
  }
  return safeBuf;
}

function autoBlocker(world, e) {
  if (!world.queryProps) return null;
  const foot = e.y + e.h * 0.5;
  const list = world.queryProps(e.x, e.y, AUTO_PROP_RANGE, propBuf);
  if (!list.length) return null;
  const safe = standingSet(world, e);

  let best = null, bestScore = Infinity;
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    if (!p.solid || p.hp <= 0 || p.state === 'falling') continue;
    if (safe.indexOf(p) >= 0) continue;
    const dx = p.x - e.x, dy = p.y - (e.y - BODY_H * 0.1);
    // behind him is not in the way; straight up or down still is
    if (dx * e.faceX < -90 && Math.abs(dx) > 200) continue;
    let score = Math.hypot(dx, dy);
    // something whose top is above his feet is standing in the road, which
    // beats a low kerb at the same distance
    if (foot - p.top > 60) score *= 0.7;
    if (score < bestScore) { bestScore = score; best = p; }
  }
  return best;
}

/**
 * Auto-aim. On touch there is no second stick: the thumbs are busy moving and
 * jumping, so a manual crosshair meant every cast went wherever the last tap
 * happened to land. When the pointer is not claiming aim (see
 * `input.aimIsManual`) the sim points at the nearest live enemy instead, and
 * falls back to a point ahead of Rook so a cast with nothing on screen still
 * goes the way he is facing.
 *
 * It snaps on a target *change* and eases while tracking one, so a moving
 * target does not jitter but a switch never sweeps the aim through the scenery.
 */
function autoAim(world, e, dt) {
  const input = world.input;
  if (!input.aimIsManual || input.aimIsManual()) { input.autoTarget = null; return; }
  const d = e.data;
  const oy = e.y - BODY_H * 0.1;
  let t = world.nearestEnemy ? world.nearestEnemy(e.x, oy, AUTO_AIM_RANGE) : null;
  let tx, ty;
  if (t) { tx = t.x; ty = t.y - t.h * 0.12; }
  else {
    t = autoBlocker(world, e);
    if (t) { tx = t.x; ty = t.y; }
    else { tx = e.x + e.faceX * 340; ty = oy - 30; }
  }
  if (t !== d.aimTarget || d.aimX === undefined) {
    d.aimTarget = t; d.aimX = tx; d.aimY = ty;
  } else {
    const k = Math.min(1, dt * 12);
    d.aimX += (tx - d.aimX) * k;
    d.aimY += (ty - d.aimY) * k;
  }
  input.aim.x = d.aimX;
  input.aim.y = d.aimY;
  input.autoTarget = t;
}

function approach(v, t, k) { return v < t ? Math.min(t, v + k) : Math.max(t, v - k); }
function clampf(v, a, b) { return v < a ? a : v > b ? b : v; }

/* ------------------------------------------------------------------ *
 * Drawing. Everything here is primitives so the light buffer can hit it.
 * ------------------------------------------------------------------ */

export function renderPlayer(world, e, alpha) {
  const R = world.R, L = world.LAYER, d = e.data;
  const x = e.px + (e.x - e.px) * alpha;
  const y = e.py + (e.y - e.py) * alpha;
  const f = e.faceX;

  const sq = d.squash, st = d.stretch;
  const sy = 1 - sq * 0.30 + st * 0.20;
  const sx = 1 + sq * 0.26 - st * 0.14;
  const lean = d.lean;
  const hurt = d.hurtT > 0 ? Math.max(0, d.hurtT / 0.3) : 0;
  const flash = Math.max(hurt, e.hitFlash);

  const H = BODY_H;
  const footY = y + H * 0.5;
  const hipY = footY - H * 0.42 * sy;
  const chestY = footY - H * 0.70 * sy;
  const neckY = footY - H * 0.80 * sy;
  const headY = footY - H * 0.90 * sy;
  const leanX = (v) => x + (footY - v) * Math.sin(lean);

  const cloth = tint(CLOTH, flash), cloak = tint(CLOAK, flash), coat = tint(COAT, flash);
  const skin = tint(SKIN, flash), hair = tint(HAIR, flash);
  const casting = d.castT > 0;
  const stride = Math.min(1, Math.abs(e.vx) / RUN);
  const airborne = !e.onGround;

  // contact shadow — grounds him, and it is the cheapest depth cue there is
  if (e.onGround) {
    R.spriteRaw(R.blob, 0, 0, 1, 1, x, footY + 3, 86 * sx, 20, 0, 0, 0, 0, 0.5, L.ACTORS_BACK, false, 1);
  }

  // dash ghosts
  for (let i = 0; i < 12; i++) {
    const a = d.trailA[i];
    if (a < 0.04) continue;
    R.spriteRaw(R.blob, 0, 0, 1, 1, d.trailX[i], d.trailY[i] - 6, 52, 132, 0,
      0.42, 0.68, 1, a * 0.26, L.FX, true, 1);
  }

  /* cloak — verlet strip, behind everything */
  const c = d.cloak;
  for (let i = 0; i < c.n - 1; i++) {
    const w0 = 40 - i * 5.5, w1 = 40 - (i + 1) * 5.5;
    const k = 1 - i * 0.10;
    const col = [cloak[0] * k, cloak[1] * k, cloak[2] * k, 1];
    R.tri(c.x[i] - w0 * 0.5, c.y[i], col, c.x[i] + w0 * 0.5, c.y[i], col, c.x[i + 1] + w1 * 0.5, c.y[i + 1], col, L.ACTORS_BACK);
    R.tri(c.x[i] - w0 * 0.5, c.y[i], col, c.x[i + 1] + w1 * 0.5, c.y[i + 1], col, c.x[i + 1] - w1 * 0.5, c.y[i + 1], col, L.ACTORS_BACK);
  }

  /* legs — two-bone IK to a walking foot target */
  for (let i = 0; i < 2; i++) {
    const ph = d.legPhase + i * Math.PI;
    let tx, ty;
    if (airborne) {
      const tuck = e.vy < 0 ? 0.7 : 0.3;
      tx = x - f * (8 + i * 7) - f * tuck * 16;
      ty = footY - 30 * tuck - i * 7;
    } else {
      tx = leanX(footY) + f * Math.cos(ph) * 36 * stride;
      ty = footY - Math.max(0, Math.sin(ph)) * 32 * stride;
    }
    const hx2 = leanX(hipY) - f * 2 + (i === 0 ? -6 : 6);
    drawLimb(R, L, hx2, hipY, tx, ty, H * 0.25 * sy, 13 - i * 2, i === 0 ? mul(cloth, 0.7) : cloth, 1, f);
    R.spriteRaw(R.white, 0, 0, 1, 1, tx + f * 6, ty - 3, 28, 11, lean * 0.4,
      cloak[0] * 1.3, cloak[1] * 1.3, cloak[2] * 1.3, 1, L.ACTORS, false, 1);
  }

  /* torso, then the coat over it — the coat is what gives him a silhouette */
  const tw = 30 * sx;
  R.spriteRaw(R.white, 0, 0, 1, 1, (leanX(hipY) + leanX(chestY)) * 0.5, (hipY + chestY) * 0.5,
    tw, Math.abs(chestY - hipY) * 1.08, -lean, cloth[0], cloth[1], cloth[2], 1, L.ACTORS, false, 1);

  // hem sway comes off the cloak chain so the coat and the cape agree
  const sway = (c.x[1] - c.x[0]) * 0.5;
  const hemY = hipY + 30 * sy;
  const COAT_N = 5;
  for (let i = 0; i < COAT_N; i++) {
    const t = i / (COAT_N - 1);
    const cy2 = chestY + (hemY - chestY) * t;
    const cw = (34 + t * t * 28) * sx;
    const cx2 = leanX(cy2) + sway * t * t;
    const k = 1 - t * 0.18;
    R.spriteRaw(R.white, 0, 0, 1, 1, cx2, cy2, cw, (hemY - chestY) / (COAT_N - 1) * 1.9, -lean * 0.7,
      coat[0] * k, coat[1] * k, coat[2] * k, 1, L.ACTORS, false, 1);
  }
  R.spriteRaw(R.blob, 0, 0, 1, 1, leanX(chestY), chestY - 2, 44 * sx, 24 * sy, -lean,
    coat[0] * 1.2, coat[1] * 1.2, coat[2] * 1.2, 1, L.ACTORS, false, 1);
  // soft rim down both edges — a cool backlight is what separates a near-black
  // silhouette from a near-black background without brightening the character
  for (let s2 = -1; s2 <= 1; s2 += 2) {
    R.spriteRaw(R.blob, 0, 0, 1, 1, leanX((chestY + hemY) * 0.5) + s2 * 21 * sx, (chestY + hemY) * 0.5,
      13, Math.abs(hemY - chestY) * 0.9, -lean * 0.7,
      RIM[0], RIM[1], RIM[2], s2 === f ? 0.28 : 0.16, L.ACTORS, false, 1);
  }

  /* arms */
  for (let i = 0; i < 2; i++) {
    const back = i === 0;
    const shX = leanX(chestY) + (back ? -f * 9 : f * 9);
    const shY = chestY + 6;
    let tx, ty;
    if (casting && !back) {
      tx = shX + Math.cos(d.aimAng) * 46; ty = shY + Math.sin(d.aimAng) * 46;
    } else if (d.state === 'wall' && !back) {
      tx = shX + d.wallDir * 28; ty = shY - 18;
    } else {
      const ph = d.armPhase + (back ? 0 : Math.PI);
      const sw = airborne ? 0.5 : stride;
      tx = shX - f * Math.cos(ph) * 27 * sw - f * 5;
      ty = shY + 38 - Math.abs(Math.sin(ph)) * 9 * sw + (airborne ? -16 : 0);
    }
    const k = back ? 0.68 : 1;
    drawLimb(R, L, shX, shY, tx, ty, 26, 9.5, mul(coat, k), 1, f);
    R.spriteRaw(R.blob, 0, 0, 1, 1, tx, ty, 14, 14, 0, skin[0] * k, skin[1] * k, skin[2] * k, 1, L.ACTORS, false, 1);
  }

  /* head */
  const hx = leanX(headY), hyy = headY;
  R.spriteRaw(R.white, 0, 0, 1, 1, hx, neckY + 3, 13, 16, -lean, coat[0] * 1.1, coat[1] * 1.1, coat[2] * 1.1, 1, L.ACTORS, false, 1);
  R.spriteRaw(R.disc, 0, 0, 1, 1, hx, hyy, 27 * sx, 30 * sy, -lean * 0.6, skin[0], skin[1], skin[2], 1, L.ACTORS, false, 1);
  R.spriteRaw(R.white, 0, 0, 1, 1, hx + f * 6.5, hyy, 4.5, 5.5, 0, 0.05, 0.045, 0.06, 1, L.ACTORS, false, 1);
  // shadow under the fringe keeps the face from reading as a bright ball
  R.spriteRaw(R.disc, 0, 0, 1, 1, hx - f * 2, hyy - 9, 26 * sx, 13 * sy, -lean * 0.6,
    skin[0] * 0.45, skin[1] * 0.45, skin[2] * 0.48, 1, L.ACTORS, false, 1);

  /* hair: a mop over the crown plus three strands with their own motion */
  R.spriteRaw(R.blob, 0, 0, 1, 1, hx - f * 2.5, hyy - 8, 44 * sx, 31, -lean * 0.6, hair[0], hair[1], hair[2], 1, L.ACTORS, false, 1);
  for (let i = 0; i < 3; i++) {
    const ch = d.hair[i];
    for (let j = 0; j < ch.n - 1; j++) {
      drawSeg(R, L.ACTORS, ch.x[j], ch.y[j], ch.x[j + 1], ch.y[j + 1], 8.5 - j * 2.4, hair, 1);
    }
  }
  R.spriteRaw(R.blob, 0, 0, 1, 1, hx - f * 2, hyy - 15, 38 * sx, 12, -lean * 0.6,
    RIM[0], RIM[1], RIM[2], 0.20, L.ACTORS, false, 1);

  /* the lifestone — also the air-jump gauge: spent, it goes to an ember of
     itself, so "can I lift again?" is answered on the character, not in a HUD */
  const liftK = d.liftT > 0 ? d.liftT / 0.42 : 0;
  const spent = !e.onGround && d.liftLeft <= 0 ? 0.45 : 1;
  const pulse = (0.8 + Math.sin(world.time * 3.1) * 0.10 + (casting ? 0.45 : 0)) * (spent + liftK * 1.6);
  const lx = leanX(chestY + 10), ly = chestY + 10;
  R.spriteRaw(R.blob, 0, 0, 1, 1, lx, ly, 30 * pulse, 30 * pulse, 0, STONE[0], STONE[1], STONE[2], 0.38 * spent, L.FX, true, 1);
  R.spriteRaw(R.disc, 0, 0, 1, 1, lx, ly, 6.5, 6.5, 0, 0.8, 0.95, 1, spent, L.FX, true, 1);
  R.light({
    x: lx, y: ly, radius: (250 + (casting ? 200 : 0)) * (spent + liftK), r: STONE[0], g: STONE[1], b: STONE[2],
    intensity: (0.75 + (casting ? 1.0 : 0)) * spent + liftK * 1.4, flicker: 0.05,
  });
  // the shove itself: a flat ring under the feet, expanding as it fades
  if (liftK > 0) {
    const g2 = 1 - liftK;
    R.spriteRaw(R.blob, 0, 0, 1, 1, x, y + H * 0.36, 60 + g2 * 190, 20 + g2 * 26, 0,
      STONE[0], STONE[1], STONE[2], liftK * 0.5, L.FX, true, 1);
  }

  if (e.burning > 0) {
    R.spriteRaw(R.blob, 0, 0, 1, 1, x, y - 10, 78, 150, 0, 1, 0.5, 0.18, 0.35, L.FX, true, 1);
  }
}

function mul(c, k) { SCRATCH[0] = c[0] * k; SCRATCH[1] = c[1] * k; SCRATCH[2] = c[2] * k; return SCRATCH; }
const SCRATCH = [0, 0, 0];

function tint(c, f) {
  if (f <= 0) return c;
  return [c[0] + (1 - c[0]) * f, c[1] + (1 - c[1]) * f, c[2] + (1 - c[2]) * f];
}

/** two-bone limb: knee/elbow placed by circle intersection, drawn as two capsules */
function drawLimb(R, L, x0, y0, x1, y1, len, w, col, alpha, face) {
  const dx = x1 - x0, dy = y1 - y0;
  let d = Math.hypot(dx, dy);
  const l = Math.max(len, d * 0.52);
  if (d > l * 2 - 1) d = l * 2 - 1;
  const a = Math.atan2(dy, dx);
  const h = Math.sqrt(Math.max(0, l * l - (d * 0.5) * (d * 0.5)));
  const mx = x0 + Math.cos(a) * d * 0.5, my = y0 + Math.sin(a) * d * 0.5;
  const kx = mx + Math.cos(a + Math.PI * 0.5) * h * face;
  const ky = my + Math.sin(a + Math.PI * 0.5) * h * face;
  drawSeg(R, L.ACTORS, x0, y0, kx, ky, w, col, alpha);
  drawSeg(R, L.ACTORS, kx, ky, x1, y1, w * 0.85, col, alpha);
}

function drawSeg(R, layer, x0, y0, x1, y1, w, col, alpha) {
  const dx = x1 - x0, dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  const rot = Math.atan2(dy, dx);
  R.spriteRaw(R.white, 0, 0, 1, 1, (x0 + x1) * 0.5, (y0 + y1) * 0.5, len, w, rot, col[0], col[1], col[2], alpha, layer, false, 1);
  R.spriteRaw(R.disc, 0, 0, 1, 1, x1, y1, w, w, 0, col[0], col[1], col[2], alpha, layer, false, 1);
}
