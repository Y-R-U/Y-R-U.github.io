// Pure maths shared by sim and gfx. No state, no DOM.

export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));

export function wrapAngle(a) {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}

/** Shortest-arc rotation from `a` toward `b`, capped at `maxStep` radians. */
export function turnToward(a, b, maxStep) {
  const d = wrapAngle(b - a);
  if (d > maxStep) return wrapAngle(a + maxStep);
  if (d < -maxStep) return wrapAngle(a - maxStep);
  return wrapAngle(b);
}

export const dist2 = (ax, ay, bx, by) => (ax - bx) * (ax - bx) + (ay - by) * (ay - by);

export function aabbOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
  return Math.abs(ax - bx) <= aw + bw && Math.abs(ay - by) <= ah + bh;
}

export function pointInAabb(px, py, bx, by, bw, bh) {
  return Math.abs(px - bx) <= bw && Math.abs(py - by) <= bh;
}

// CONTRACTS §2, inverted. cam.scale is CSS px per world unit; sx/sy are canvas CSS px.
export function screenToWorld(cam, sx, sy) {
  return { wx: cam.x + sx / cam.scale, wy: cam.y + cam.vh - sy / cam.scale };
}

export function worldToScreen(cam, wx, wy) {
  return { sx: (wx - cam.x) * cam.scale, sy: (cam.y + cam.vh - wy) * cam.scale };
}
