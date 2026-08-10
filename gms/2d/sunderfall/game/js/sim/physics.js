/**
 * Swept AABB movement against the terrain grid, solid props, one-way platforms
 * and the rubble heightfield.
 *
 * Substepped at 8px so nothing tunnels at dash speed, and separated per axis so
 * a body sliding along a wall keeps its vertical speed. Slopes are handled by
 * step-up rather than by real slope normals: a body that is blocked horizontally
 * but has clear space `stepUp` px higher is lifted instead of stopped, which
 * reads identically for stairs, rubble and the crest of a hill and costs
 * nothing extra in the solver.
 */

const SUB = 8;
const propBuf = [];

export function terrainBlocked(world, x, y, w, h) {
  return world.terrain.solidBox(x, y, w, h);
}

export function propBlocked(world, x, y, w, h, ignore) {
  const l = x - w * 0.5, r = x + w * 0.5, t = y - h * 0.5, b = y + h * 0.5;
  world.props.near(l, r, propBuf);
  for (let i = 0; i < propBuf.length; i++) {
    const p = propBuf[i];
    if (p === ignore || !p.solid) continue;
    if (r > p.left && l < p.right && b > p.top && t < p.bottom) return p;
  }
  return null;
}

function blockedFull(world, e, x, y) {
  if (terrainBlocked(world, x, y, e.w, e.h)) return true;
  if (e.ignoreProps) return false;
  return !!propBlocked(world, x, y, e.w, e.h);
}

/** One-way surfaces (platform cells + settled rubble) only stop a downward body. */
function oneWayFloorY(world, e, x, bottom, prevBottom) {
  let best = Infinity;
  const T = world.terrain;
  const a = T.toCellX(x - e.w * 0.5 + 2), c = T.toCellX(x + e.w * 0.5 - 2);
  const r0 = T.toCellY(prevBottom - 1), r1 = T.toCellY(bottom);
  for (let cx = a; cx <= c; cx++) {
    for (let cy = r0; cy <= r1; cy++) {
      if (!T.oneWay(cx, cy)) continue;
      const top = T.cellTop(cy);
      if (prevBottom <= top + 1.5 && bottom >= top && top < best) best = top;
    }
    const rt = world.debris.rubble[cx];
    if (rt < Infinity && prevBottom <= rt + 2 && bottom >= rt && rt < best) best = rt;
  }
  return best;
}

export function moveBody(world, e, dt) {
  const dx = e.vx * dt, dy = e.vy * dt;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / SUB));
  let sx = dx / steps, sy = dy / steps;
  const stepUp = e.stepUp || 0;

  e.onGround = false;
  e.onWall = 0;
  e.hitX = 0; e.hitY = 0;

  for (let s = 0; s < steps; s++) {
    // ---- X ----
    if (sx !== 0) {
      const nx = e.x + sx;
      if (blockedFull(world, e, nx, e.y)) {
        let climbed = false;
        if (stepUp > 0) {
          // 3px granularity: at the old 2px a 52px step-up cost 26 probe pairs
          // per blocked substep, and landing 3px high is a frame of gravity.
          for (let up = 3; up <= stepUp; up += 3) {
            if (!blockedFull(world, e, nx, e.y - up) && !blockedFull(world, e, e.x, e.y - up)) {
              e.y -= up; e.x = nx; climbed = true; break;
            }
          }
        }
        if (!climbed) {
          e.onWall = sx > 0 ? 1 : -1;
          e.hitX = e.onWall;
          if (e.bounce > 0 && Math.abs(e.vx) > 30) { e.vx = -e.vx * e.bounce; sx = -sx * e.bounce; }
          else { e.vx = 0; sx = 0; }
          // Stop the axis, NOT the solver. This used to `break`, which abandoned
          // the Y axis for this substep and every substep left in the frame — so
          // a body holding a direction into a wall could not rise or fall at all.
          // Walk into a crate while still holding right and you were pinned:
          // vy integrated, y never moved, and the jump looked broken.
        }
      } else e.x = nx;
    }

    // ---- Y ----
    if (sy !== 0) {
      const prevBottom = e.y + e.h * 0.5;
      const ny = e.y + sy;
      if (blockedFull(world, e, e.x, ny)) {
        // walk back to contact
        const dir = sy > 0 ? -1 : 1;
        let y = ny;
        for (let k = 0; k < SUB + 2 && blockedFull(world, e, e.x, y); k++) y += dir;
        e.y = y;
        if (sy > 0) { e.onGround = true; e.hitY = 1; } else e.hitY = -1;
        // same rule the other way round: landing or hitting your head stops the
        // vertical axis, it does not cancel the horizontal movement you had left
        if (e.bounce > 0 && Math.abs(e.vy) > 60) { e.vy = -e.vy * e.bounce; sy = -sy * e.bounce; }
        else { e.vy = 0; sy = 0; }
        continue;
      }
      if (sy > 0 && !e.ignoreOneWay) {
        const nb = ny + e.h * 0.5;
        const f = oneWayFloorY(world, e, e.x, nb, prevBottom);
        if (f < Infinity) {
          e.y = f - e.h * 0.5;
          e.onGround = true; e.hitY = 1;
          if (e.bounce > 0 && Math.abs(e.vy) > 60) { e.vy = -e.vy * e.bounce; sy = -sy * e.bounce; }
          else { e.vy = 0; sy = 0; }
          continue;
        }
      }
      e.y = ny;
    }
  }

  // resting check — one probe below, so onGround survives a frame with vy == 0
  if (!e.onGround && e.vy >= 0) {
    const b = e.y + e.h * 0.5;
    if (blockedFull(world, e, e.x, e.y + 2)) e.onGround = true;
    else if (!e.ignoreOneWay && oneWayFloorY(world, e, e.x, b + 2, b) < Infinity) e.onGround = true;
  }
  if (e.onGround) {
    const m = world.terrain.materialAtWorld(e.x, e.y + e.h * 0.5 + 3);
    e.groundMat = m >= 0 ? m : e.groundMat;
  }
}

/**
 * Corner correction: a body moving up that clips a ledge by only a few pixels
 * gets nudged sideways instead of stopped. This is invisible when it works and
 * infuriating when it is missing.
 */
export function cornerCorrect(world, e, maxNudge = 14) {
  if (e.vy >= 0) return false;
  for (let n = 2; n <= maxNudge; n += 2) {
    if (!blockedFull(world, e, e.x + n, e.y)) { e.x += n; return true; }
    if (!blockedFull(world, e, e.x - n, e.y)) { e.x -= n; return true; }
  }
  return false;
}

/** Push a body out of anything it is already inside — after a teleport or a Bulwark. */
export function unstick(world, e, maxPush = 48) {
  if (!blockedFull(world, e, e.x, e.y)) return true;
  for (let d = 2; d <= maxPush; d += 2) {
    if (!blockedFull(world, e, e.x, e.y - d)) { e.y -= d; return true; }
    if (!blockedFull(world, e, e.x + d, e.y)) { e.x += d; return true; }
    if (!blockedFull(world, e, e.x - d, e.y)) { e.x -= d; return true; }
    if (!blockedFull(world, e, e.x, e.y + d)) { e.y += d; return true; }
  }
  return false;
}
