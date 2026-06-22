/** Minimal mutable 2D vector helpers. Plain objects keep entities poolable + serializable. */
export interface Vec2 {
  x: number;
  y: number;
}

export const vec = (x = 0, y = 0): Vec2 => ({ x, y });

export const len = (v: Vec2): number => Math.hypot(v.x, v.y);

export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);

export const dist2 = (a: Vec2, b: Vec2): number => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
};

export const set = (out: Vec2, x: number, y: number): Vec2 => {
  out.x = x;
  out.y = y;
  return out;
};

export const copy = (out: Vec2, a: Vec2): Vec2 => {
  out.x = a.x;
  out.y = a.y;
  return out;
};

/** Linear interpolation, written into `out`. Used for render interpolation. */
export const lerp = (out: Vec2, a: Vec2, b: Vec2, t: number): Vec2 => {
  out.x = a.x + (b.x - a.x) * t;
  out.y = a.y + (b.y - a.y) * t;
  return out;
};

/** Shortest-path angle lerp (radians). */
export const lerpAngle = (a: number, b: number, t: number): number => {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
};
