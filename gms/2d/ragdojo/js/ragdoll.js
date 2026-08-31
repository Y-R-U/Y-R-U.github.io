// Verlet stick-figure ragdoll. Muscles pull points toward a posed target; cut the gain
// and the same body goes limp with no mode switch in the solver.

export const P = {
  PELVIS: 0, NECK: 1, HEAD: 2,
  ELBOW_L: 3, HAND_L: 4, ELBOW_R: 5, HAND_R: 6,
  KNEE_L: 7, FOOT_L: 8, KNEE_R: 9, FOOT_R: 10,
};
export const NPTS = 11;

export const BONE = {
  spine: 50, skull: 17, upperArm: 26, foreArm: 25, thigh: 27, shin: 27, headR: 14.5,
};

const LINKS = [
  [P.PELVIS, P.NECK, BONE.spine, 1],
  [P.NECK, P.HEAD, BONE.skull, 1],
  [P.NECK, P.ELBOW_L, BONE.upperArm, 0.92], [P.ELBOW_L, P.HAND_L, BONE.foreArm, 0.92],
  [P.NECK, P.ELBOW_R, BONE.upperArm, 0.92], [P.ELBOW_R, P.HAND_R, BONE.foreArm, 0.92],
  [P.PELVIS, P.KNEE_L, BONE.thigh, 1], [P.KNEE_L, P.FOOT_L, BONE.shin, 1],
  [P.PELVIS, P.KNEE_R, BONE.thigh, 1], [P.KNEE_R, P.FOOT_R, BONE.shin, 1],
  // Torso brace — without it a limp body folds in half at the waist.
  [P.PELVIS, P.HEAD, BONE.spine + BONE.skull, 0.42],
];

const MASS = [1.6, 1.3, 1.1, 0.55, 0.45, 0.55, 0.45, 0.85, 0.7, 0.85, 0.7];

/**
 * Joint ranges as min/max separations. Without these a limp body flattens into a straight
 * line on the floor: elbows and knees hyperextend and every limb ends up colinear with the
 * ground. These are what keep the crumple.
 */
const RANGES = [
  [P.NECK, P.HAND_L, 19, 49], [P.NECK, P.HAND_R, 19, 49],
  [P.PELVIS, P.FOOT_L, 21, 51], [P.PELVIS, P.FOOT_R, 21, 51],
  [P.NECK, P.KNEE_L, 32, 999], [P.NECK, P.KNEE_R, 32, 999],
  [P.HEAD, P.HAND_L, 15, 999], [P.HEAD, P.HAND_R, 15, 999],
  [P.FOOT_L, P.FOOT_R, 13, 999], [P.HAND_L, P.HAND_R, 11, 999],
  [P.KNEE_L, P.KNEE_R, 12, 999], [P.ELBOW_L, P.ELBOW_R, 12, 999],
];

/** Ground collision radius per point — gives the body thickness where it lands. */
const RADIUS = [6, 5, 0, 4.5, 4, 4.5, 4, 5, 4.5, 5, 4.5];

export class Ragdoll {
  constructor(scale = 1) {
    this.scale = scale;
    this.x = new Float64Array(NPTS);
    this.y = new Float64Array(NPTS);
    this.px = new Float64Array(NPTS);
    this.py = new Float64Array(NPTS);
    this.tx = new Float64Array(NPTS);   // pose target
    this.ty = new Float64Array(NPTS);
    this.inv = new Float64Array(NPTS);
    for (let i = 0; i < NPTS; i++) this.inv[i] = 1 / MASS[i];
    this.links = LINKS.map(([a, b, len, k]) => ({ a, b, len: len * scale, k }));
    this.ranges = RANGES.map(([a, b, lo, hi]) => ({ a, b, lo: lo * scale, hi: hi * scale }));
    this.grounded = false;
    this.restTimer = 0;
  }

  /** Drop the whole body at a spot with zero velocity. */
  place(ox, oy, targets) {
    if (!targets || targets.length < NPTS) return;
    for (let i = 0; i < NPTS; i++) {
      this.x[i] = this.px[i] = ox + targets[i][0];
      this.y[i] = this.py[i] = oy + targets[i][1];
      this.tx[i] = this.x[i];
      this.ty[i] = this.y[i];
    }
  }

  setTargets(ox, oy, targets) {
    for (let i = 0; i < NPTS; i++) {
      this.tx[i] = ox + targets[i][0];
      this.ty[i] = oy + targets[i][1];
    }
  }

  /** Snap instantly to the pose — used when a fighter recovers from a knockdown. */
  snap() {
    for (let i = 0; i < NPTS; i++) {
      this.x[i] = this.px[i] = this.tx[i];
      this.y[i] = this.py[i] = this.ty[i];
    }
  }

  impulse(i, ix, iy) {
    this.px[i] -= ix * this.inv[i];
    this.py[i] -= iy * this.inv[i];
  }

  /** Push the whole body, weighted by how close each point is to the blast. */
  blast(cx, cy, radius, power) {
    for (let i = 0; i < NPTS; i++) {
      const dx = this.x[i] - cx, dy = this.y[i] - cy;
      const d = Math.hypot(dx, dy) || 1;
      if (d > radius) continue;
      const f = (1 - d / radius) * power;
      this.impulse(i, (dx / d) * f, (dy / d) * f);
    }
  }

  centre() {
    let sx = 0, sy = 0, m = 0;
    for (let i = 0; i < NPTS; i++) { sx += this.x[i] * MASS[i]; sy += this.y[i] * MASS[i]; m += MASS[i]; }
    return [sx / m, sy / m];
  }

  velocity() {
    let sx = 0, sy = 0, m = 0;
    for (let i = 0; i < NPTS; i++) {
      sx += (this.x[i] - this.px[i]) * MASS[i]; sy += (this.y[i] - this.py[i]) * MASS[i]; m += MASS[i];
    }
    return [sx / m, sy / m];
  }

  speed() { const [vx, vy] = this.velocity(); return Math.hypot(vx, vy); }

  /**
   * @param gain 1 = fully animated, 0 = limp ragdoll. Anything between is a stagger.
   */
  step(dt, gain, world) {
    const g = world.gravity * dt * dt;
    const damp = gain > 0.5 ? 0.92 : 0.985;   // limp bodies keep their momentum longer
    for (let i = 0; i < NPTS; i++) {
      const vx = (this.x[i] - this.px[i]) * damp;
      const vy = (this.y[i] - this.py[i]) * damp;
      this.px[i] = this.x[i];
      this.py[i] = this.y[i];
      this.x[i] += vx;
      this.y[i] += vy + g;
    }

    if (gain > 0.001) {
      // Clamped so a big pose jump accelerates the limb instead of teleporting it.
      const k = Math.min(0.9, gain * 0.55);
      const maxStep = 26 + gain * 46;
      for (let i = 0; i < NPTS; i++) {
        let dx = (this.tx[i] - this.x[i]) * k;
        let dy = (this.ty[i] - this.y[i]) * k;
        const d = Math.hypot(dx, dy);
        if (d > maxStep) { dx = dx / d * maxStep; dy = dy / d * maxStep; }
        this.x[i] += dx;
        this.y[i] += dy;
      }
    }

    const iters = 7;
    for (let it = 0; it < iters; it++) {
      for (const L of this.links) {
        const a = L.a, b = L.b;
        let dx = this.x[b] - this.x[a], dy = this.y[b] - this.y[a];
        let d = Math.hypot(dx, dy);
        if (d < 1e-6) { dx = 0.01; d = 0.01; }
        const diff = (d - L.len) / d * L.k * 0.5;
        const ia = this.inv[a], ib = this.inv[b], sum = ia + ib;
        const wa = ia / sum * 2, wb = ib / sum * 2;
        this.x[a] += dx * diff * wa; this.y[a] += dy * diff * wa;
        this.x[b] -= dx * diff * wb; this.y[b] -= dy * diff * wb;
      }
      this.solveRanges();
      this.collide(world, gain);
    }
  }

  solveRanges() {
    for (const R of this.ranges) {
      const a = R.a, b = R.b;
      let dx = this.x[b] - this.x[a], dy = this.y[b] - this.y[a];
      let d = Math.hypot(dx, dy);
      if (d < 1e-6) { dx = 0.01; d = 0.01; }
      const target = d < R.lo ? R.lo : d > R.hi ? R.hi : 0;
      if (!target) continue;
      const diff = (d - target) / d * 0.5;
      const ia = this.inv[a], ib = this.inv[b], sum = ia + ib;
      const wa = ia / sum * 2, wb = ib / sum * 2;
      this.x[a] += dx * diff * wa; this.y[a] += dy * diff * wa;
      this.x[b] -= dx * diff * wb; this.y[b] -= dy * diff * wb;
    }
  }

  collide(world, gain) {
    const ground = world.groundY;
    this.grounded = false;
    for (let i = 0; i < NPTS; i++) {
      const r = (i === P.HEAD ? BONE.headR * 0.78 : RADIUS[i]) * this.scale;
      if (world.pit && this.x[i] > world.pit[0] && this.x[i] < world.pit[1]) {
        if (this.y[i] > world.pitFloor - r) {
          this.y[i] = world.pitFloor - r;
          this.px[i] += (this.x[i] - this.px[i]) * 0.5;
          this.grounded = true;
        }
        continue;
      }
      if (this.y[i] > ground - r) {
        this.y[i] = ground - r;
        const vx = this.x[i] - this.px[i];
        const fric = gain > 0.5 ? 0.55 : 0.24;
        this.px[i] = this.x[i] - vx * (1 - fric);
        this.grounded = true;
      }
      if (this.x[i] < world.minX) { this.x[i] = world.minX; this.px[i] += (world.minX - this.px[i]) * 0.3; }
      if (this.x[i] > world.maxX) { this.x[i] = world.maxX; this.px[i] += (world.maxX - this.px[i]) * 0.3; }
      if (this.y[i] < world.ceilY) { this.y[i] = world.ceilY; this.py[i] = this.y[i]; }
    }
  }
}

/** Cheap body-vs-body shove so a launched fighter bowls the others over. */
export function repel(a, b, minD = 20) {
  for (let i = 0; i < NPTS; i++) {
    for (let j = 0; j < NPTS; j++) {
      const dx = b.x[j] - a.x[i], dy = b.y[j] - a.y[i];
      const d2 = dx * dx + dy * dy;
      if (d2 > minD * minD || d2 < 1e-6) continue;
      const d = Math.sqrt(d2);
      const push = (minD - d) / d * 0.22;
      a.x[i] -= dx * push; a.y[i] -= dy * push;
      b.x[j] += dx * push; b.y[j] += dy * push;
    }
  }
}
