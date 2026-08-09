/**
 * Shared AI sensing for a platformer. Everything here is scalar maths against the
 * terrain grid or one pooled query array — nothing allocates per call, because a
 * dozen of these run per enemy per think tick and there can be dozens of enemies.
 *
 * Expensive senses (queries, line-of-sight, ledge probes) are gated behind
 * `thinkNow`, which staggers each entity onto its own frame slot so the cost is
 * spread instead of spiking every N frames for the whole crowd.
 */

const _q = [];
const _pt = { x: 0, y: 0 };

export const HAZARDS = ['fire', 'acid'];

/* --------------------------------------------------------------- think budget */

/**
 * True on the frames this entity is allowed to think hard. `period` is in frames.
 * The `e.id` offset is what spreads the load; do not remove it.
 */
export function thinkNow(world, e, period) {
  return ((world.frame + e.id) % period) === 0;
}

/* --------------------------------------------------------------- world probes */

/** Ground under a point, within `depth` px. NaN when there is nothing to stand on. */
export function groundBelow(world, x, y, depth) {
  return world.groundY(x, y, depth === undefined ? 220 : depth);
}

/** Is there floor to walk onto `dist` ahead? */
export function floorAhead(world, e, dist) {
  const x = e.x + e.faceX * dist;
  const y = e.y + e.h * 0.5 + 4;
  return world.solidAt(x, y + 6) || world.solidAt(x, y + 20);
}

/**
 * Measure a gap in front. Returns the horizontal distance to the far lip, or 0 if
 * there is no gap. Steps in 16px cells so it costs at most `maxCells` array reads.
 */
export function gapAhead(world, e, maxCells) {
  const step = 16;
  const n = maxCells || 12;
  const y = e.y + e.h * 0.5 + 10;
  if (world.solidAt(e.x + e.faceX * (e.w * 0.5 + step), y)) return 0;
  for (let i = 2; i <= n; i++) {
    const x = e.x + e.faceX * (e.w * 0.5 + step * i);
    if (world.solidAt(x, y) || world.solidAt(x, y + 24)) return step * i;
  }
  return -1;   // bottomless as far as it can see
}

/** Height of the obstruction directly ahead, in px, or 0 when the way is clear. */
export function wallAhead(world, e, reach) {
  const r = reach === undefined ? 10 : reach;
  const x = e.x + e.faceX * (e.w * 0.5 + r);
  const foot = e.y + e.h * 0.5 - 2;
  if (!world.solidAt(x, foot)) return 0;
  let h = 0;
  for (let i = 1; i <= 8; i++) {
    if (!world.solidAt(x, foot - i * 12)) break;
    h = i * 12;
  }
  return h + 12;
}

/** A prop blocking the way, if any — the thing a stonewarden smashes. */
export function propAhead(world, e, reach) {
  const r = reach === undefined ? 14 : reach;
  const p = world.propAt(e.x + e.faceX * (e.w * 0.5 + r), e.y);
  if (p && p.alive && p.solid) return p;
  return world.propAt(e.x + e.faceX * (e.w * 0.5 + r), e.y + e.h * 0.3);
}

/**
 * How much of a hazard sits in the next couple of steps. Enemies are not clairvoyant
 * — they only avoid what is in front of them on the ground they can see.
 */
export function hazardAhead(world, e, dist) {
  if (!world.surfaces) return 0;
  const x = e.x + e.faceX * (dist === undefined ? 56 : dist);
  const y = e.y + e.h * 0.5 - 4;
  let m = 0;
  for (let i = 0; i < HAZARDS.length; i++) {
    const a = world.surfaces.amountAt(HAZARDS[i], x, y);
    if (a > m) m = a;
  }
  return m;
}

export function standingInHazard(world, e) {
  if (!world.surfaces) return 0;
  let m = 0;
  for (let i = 0; i < HAZARDS.length; i++) {
    const a = world.surfaces.amountAt(HAZARDS[i], e.x, e.y + e.h * 0.4);
    if (a > m) m = a;
  }
  return m;
}

/* ------------------------------------------------------------------ targeting */

/**
 * Hostiles target Rook; anything raised or charmed onto team 0 hunts team 1. One
 * code path so a Gravewake minion is literally the same creature with a new team.
 */
export function findTarget(world, e, range) {
  if (e.team === 1) {
    const p = world.player;
    return p && p.alive && p.hp > 0 ? p : null;
  }
  return world.nearest(e.x, e.y, range || 900, { team: 1, exclude: e, targetable: true });
}

export function canSee(world, e, t) {
  if (!t) return false;
  return world.lineOfSight(e.x, e.y - e.h * 0.15, t.x, t.y - t.h * 0.2);
}

export function distTo(e, t) { return Math.hypot(t.x - e.x, t.y - e.y); }
export function dxTo(e, t) { return t.x - e.x; }

export function faceTo(e, x) {
  const dx = x - e.x;
  if (Math.abs(dx) > 4) e.faceX = dx < 0 ? -1 : 1;
}

/* ------------------------------------------------------------------- movement */

/** Accelerate horizontally toward a speed. Ground friction is the sim's job. */
export function driveX(e, wantVx, accel, dt) {
  const dv = wantVx - e.vx;
  const step = accel * dt;
  e.vx += dv > step ? step : dv < -step ? -step : dv;
}

export function jump(e, vy) {
  if (!e.onGround) return false;
  e.vy = -Math.abs(vy);
  e.onGround = false;
  return true;
}

/**
 * The whole "does this thing have pathing sense" package for a walker.
 * Returns a movement intent in −1..1 and mutates `e` when it decides to jump.
 *
 * d.stuck / d.turnLock live on the enemy's data block; the caller owns them.
 */
export function walkToward(world, e, d, targetX, opts, dt) {
  const speed = opts.speed;
  const accel = opts.accel || speed * 6;
  const jumpV = opts.jump || 0;
  const stopAt = opts.stopAt || 0;

  let dir = targetX > e.x ? 1 : -1;
  const gap = Math.abs(targetX - e.x);
  if (gap < stopAt) { driveX(e, 0, accel * 1.6, dt); return 0; }

  if (d.turnLock > 0) { d.turnLock -= dt; dir = d.lockDir; }
  else d.lockDir = dir;

  const prevFace = e.faceX;
  e.faceX = dir;

  if (e.onGround) {
    // Never walk into a fire you can see. Turn, or hop it if it is a thin line.
    if (opts.avoidHazard !== false && hazardAhead(world, e, 46) > 0.12) {
      if (jumpV && hazardAhead(world, e, 120) < 0.08) jump(e, jumpV);
      else { d.turnLock = 0.6; d.lockDir = -dir; dir = -dir; }
    }

    const wall = wallAhead(world, e, 12);
    if (wall > 0) {
      if (jumpV && wall <= (opts.stepUp || 78)) jump(e, jumpV);
      else if (opts.smash && propAhead(world, e)) d.wantSmash = true;
      else { d.turnLock = 0.5; d.lockDir = -dir; }
    } else if (!floorAhead(world, e, e.w * 0.5 + 14)) {
      const g = gapAhead(world, e, 10);
      const jumpable = jumpV > 0 && g > 0 && g < (opts.gapReach || 190);
      if (jumpable) { jump(e, jumpV); e.vx = dir * speed * 1.25; }
      else if (opts.ledgeStop) { driveX(e, 0, accel * 2, dt); e.faceX = prevFace; return 0; }
      else { d.turnLock = 0.55; d.lockDir = -dir; dir = -dir; e.faceX = dir; }
    }
  }

  driveX(e, dir * speed, accel, dt);
  return dir;
}

/** Flyer steering: drift toward a point with damping, plus terrain avoidance. */
export function flyToward(world, e, d, tx, ty, opts, dt) {
  const speed = opts.speed;
  const accel = opts.accel || speed * 2.2;
  let dx = tx - e.x, dy = ty - e.y;
  const len = Math.hypot(dx, dy) || 1;
  dx /= len; dy /= len;

  // steer out of walls before they are reached — a flyer grinding a ceiling reads as broken
  const look = opts.look || 70;
  if (world.solidAt(e.x + dx * look, e.y + dy * look)) {
    if (world.solidAt(e.x, e.y - look)) dy = 0.8;
    else if (world.solidAt(e.x, e.y + look)) dy = -0.8;
    else dy -= 0.7;
    dx *= 0.4;
  }
  if (world.solidAt(e.x, e.y + e.h * 0.5 + 26)) dy -= 0.5;

  const near = len < (opts.slowIn || 90) ? len / (opts.slowIn || 90) : 1;
  driveX(e, dx * speed * near, accel, dt);
  const wantVy = dy * speed * near;
  const dv = wantVy - e.vy, step = accel * dt;
  e.vy += dv > step ? step : dv < -step ? -step : dv;
}

/* ----------------------------------------------------------------- perception */

/** Nearest ledge top within `r` that is above the entity — gloamarcher perch search. */
export function findPerch(world, e, cx, cy, r) {
  let best = null, bestScore = -1e9;
  for (let i = -6; i <= 6; i++) {
    if (i === 0) continue;
    const x = cx + i * (r / 6);
    const gy = world.groundY(x, cy - 400, 900);
    if (!Number.isFinite(gy)) continue;
    const high = (cy - gy);
    if (high < 40) continue;
    const score = high * 1.2 - Math.abs(x - e.x) * 0.5;
    if (score > bestScore) { bestScore = score; _pt.x = x; _pt.y = gy; best = _pt; }
  }
  return best;
}

/**
 * What a walker does with nobody to chase: shuffle a few steps, stop, look around.
 * Deliberately dull — an idle that draws the eye steals attention from the fight.
 */
export function idleWander(world, e, d, dt, opts) {
  const o = opts || {};
  d.idleT = (d.idleT || 0) - dt;
  if (d.idleT <= 0) {
    d.idleT = 1.2 + Math.random() * 2.4;
    d.idleDir = Math.random() < 0.45 ? (Math.random() < 0.5 ? -1 : 1) : 0;
  }
  d.state = d.idleDir ? 'move' : 'idle';
  if (!d.idleDir) { driveX(e, 0, (o.accel || 400) * 1.5, dt); return; }
  walkToward(world, e, d, e.x + d.idleDir * 200, {
    speed: (o.speed || 30), accel: o.accel || 260, jump: 0, ledgeStop: true, avoidHazard: true,
  }, dt);
}

export function scratchQuery() { _q.length = 0; return _q; }
