// Pure AABB physics on the 0.25 fine grid. No THREE: node-testable.
// solid(sx,sy,sz) -> bool. A body's (x,y,z) is the centre of its feet.

export const BODY = {
  W: 0.6, H: 1.8, EYE: 1.62, CROUCH_H: 1.5, CROUCH_EYE: 1.27,
  STEP: 0.5, GRAVITY: 32, JUMP_V: 9.0, TERMINAL: 60,
  WALK: 4.3, SPRINT: 5.8, CROUCH: 1.4, SWIM: 2.2, FLY: 10.5, FLY_V: 7.5,
};

const EPS = 1e-5;
const lo4 = v => Math.floor(v * 4 + EPS);
const hi4 = v => Math.ceil(v * 4 - EPS) - 1;

export function boxOf(b) {
  const hw = BODY.W / 2;
  return [b.x - hw, b.y, b.z - hw, b.x + hw, b.y + b.h, b.z + hw];
}

export function boxHitsSolid(solid, bx) {
  for (let y = lo4(bx[1]); y <= hi4(bx[4]); y++)
    for (let z = lo4(bx[2]); z <= hi4(bx[5]); z++)
      for (let x = lo4(bx[0]); x <= hi4(bx[3]); x++)
        if (solid(x, y, z)) return true;
  return false;
}

// Largest movement along `axis` (0,1,2) up to d before the box touches a solid sub.
export function sweep(solid, bx, axis, d) {
  if (d === 0) return 0;
  const a = axis, b = (axis + 1) % 3, c = (axis + 2) % 3;
  const b0 = lo4(bx[b]), b1 = hi4(bx[b + 3]), c0 = lo4(bx[c]), c1 = hi4(bx[c + 3]);
  const cell = [0, 0, 0];
  const layerSolid = s => {
    cell[a] = s;
    for (let i = b0; i <= b1; i++) {
      cell[b] = i;
      for (let j = c0; j <= c1; j++) { cell[c] = j; if (solid(cell[0], cell[1], cell[2])) return true; }
    }
    return false;
  };
  if (d > 0) {
    const start = bx[a + 3], end = start + d;
    for (let s = Math.ceil(start * 4 - EPS), last = Math.ceil(end * 4 - EPS) - 1; s <= last; s++)
      if (layerSolid(s)) return Math.max(0, s / 4 - start);
  } else {
    const start = bx[a], end = start + d;
    for (let s = Math.floor(start * 4 + EPS) - 1, last = Math.floor(end * 4 + EPS); s >= last; s--)
      if (layerSolid(s)) return Math.min(0, (s + 1) / 4 - start);
  }
  return d;
}

function shift(bx, axis, d) { bx[axis] += d; bx[axis + 3] += d; }

function moveXZ(solid, bx, dx, dz, out) {
  const mx = sweep(solid, bx, 0, dx); shift(bx, 0, mx);
  const mz = sweep(solid, bx, 2, dz); shift(bx, 2, mz);
  out.hitX = Math.abs(mx - dx) > 1e-6; out.hitZ = Math.abs(mz - dz) > 1e-6;
  return Math.hypot(mx, mz);
}

function supported(solid, bx, dx, dz) {
  const t = bx.slice(); t[0] += dx; t[3] += dx; t[2] += dz; t[5] += dz;
  return sweep(solid, t, 1, -(BODY.STEP + 0.05)) > -(BODY.STEP + 0.05) + 1e-6;
}

// Moves body in place. opts: { step:bool, edgeGuard:bool }. Returns collision info.
export function moveBody(solid, body, dx, dy, dz, opts = {}) {
  const bx = boxOf(body);
  const res = { hitX: false, hitZ: false, hitY: false, landed: false, stepped: 0 };
  const wasGround = body.onGround;

  if (opts.edgeGuard && wasGround) {
    const step = 0.05;
    while (dx !== 0 && !supported(solid, bx, dx, 0)) dx = Math.abs(dx) < step ? 0 : dx - Math.sign(dx) * step;
    while (dz !== 0 && !supported(solid, bx, 0, dz)) dz = Math.abs(dz) < step ? 0 : dz - Math.sign(dz) * step;
    while (dx !== 0 && dz !== 0 && !supported(solid, bx, dx, dz)) {
      dx = Math.abs(dx) < step ? 0 : dx - Math.sign(dx) * step;
      dz = Math.abs(dz) < step ? 0 : dz - Math.sign(dz) * step;
    }
  }

  const my = sweep(solid, bx, 1, dy); shift(bx, 1, my);
  res.hitY = Math.abs(my - dy) > 1e-6;
  const onGround = res.hitY && dy < 0;
  res.landed = onGround;

  const start = bx.slice();
  const flat = moveXZ(solid, bx, dx, dz, res);

  if (opts.step && (onGround || wasGround) && (res.hitX || res.hitZ) && dy <= 0) {
    const t = start.slice();
    const up = sweep(solid, t, 1, BODY.STEP); shift(t, 1, up);
    const r2 = {};
    const stepped = moveXZ(solid, t, dx, dz, r2);
    const down = sweep(solid, t, 1, -up); shift(t, 1, down);
    if (stepped > flat + 1e-4) {
      for (let i = 0; i < 6; i++) bx[i] = t[i];
      res.hitX = r2.hitX; res.hitZ = r2.hitZ; res.stepped = up + down;
      res.landed = true;
    }
  }

  body.x = (bx[0] + bx[3]) / 2; body.y = bx[1]; body.z = (bx[2] + bx[5]) / 2;
  body.onGround = res.landed;
  return res;
}

// Could the body clear a ledge `h` high by jumping, moving (dx,dz)?
export function canJumpOver(solid, body, dx, dz, h = 1.0) {
  const bx = boxOf(body);
  const flat = moveXZ(solid, bx.slice(), dx, dz, {});
  const up = sweep(solid, bx, 1, h + 0.05);
  if (up < h) return false;
  shift(bx, 1, up);
  return moveXZ(solid, bx, dx, dz, {}) > flat + 0.02;
}

// Push a body out of solid blocks (e.g. spawned or a block placed into it), upward first.
export function unstick(solid, body) {
  if (!boxHitsSolid(solid, boxOf(body))) return false;
  for (let i = 1; i <= 16; i++) {
    const t = { ...body, y: body.y + i * 0.25 };
    if (!boxHitsSolid(solid, boxOf(t))) { body.y = t.y; return true; }
  }
  return false;
}
