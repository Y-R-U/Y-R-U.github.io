// Rival bot brain + kinematic voxel movement (pure, node-testable). The 3D body lives in view.js.
import { findPath, findPathClosest, snap } from './path.js';

// Personality per minigamesBots difficulty. speed m/s, reaction s, aim 0..1, caution 0..1.
export const BOT_LEVELS = {
  easy: { speed: 3.0, reaction: 0.7, aim: 0.45, caution: 0.25 },
  normal: { speed: 3.8, reaction: 0.4, aim: 0.7, caution: 0.5 },
  hard: { speed: 4.5, reaction: 0.2, aim: 0.9, caution: 0.75 },
};

const GRAV = 22;

export class Bot {
  constructor({ id, name, team, x, y, z, grid, level = 'normal', personality = {} }) {
    Object.assign(this, { id, name, team, grid });
    this.p = { ...(BOT_LEVELS[level] || BOT_LEVELS.normal), ...personality };
    this.p.speed *= 0.9 + Math.random() * 0.2;
    this.x = x; this.y = y; this.z = z; this.yaw = 0;
    this.path = null; this.seg = null; this.goal = null; this.goalNear = 0;
    this.repathT = 0; this.noPathT = 0; this.stuckT = 0; this.bestD = Infinity;
    this.vy = 0; this.falling = false; this.speed = 0;
    this.frozen = 0;        // seconds frozen (tagged, countdown)
    this.state = 'idle';
    this.mem = {};          // per-game scratch
    this.stuckCount = 0;
  }

  get pos() { return { x: this.x, y: this.y, z: this.z }; }
  dist(o) { return Math.hypot(o.x - this.x, (o.y ?? this.y) - this.y, o.z - this.z); }
  dist2(o) { return Math.hypot(o.x - this.x, o.z - this.z); }

  goTo(x, y, z, near = 0) {
    if (this.goal && Math.hypot(this.goal[0] - x, this.goal[1] - y, this.goal[2] - z) < 1.2 && this.goalNear === near) return;
    this.goal = [x, y, z]; this.goalNear = near; this.repathT = 0; this.bestD = Infinity; this.stuckT = 0; this.noPathT = 0;
  }
  stop() { this.goal = null; this.path = null; this.seg = null; this.speed = 0; }
  teleport(x, y, z) { this.x = x; this.y = y; this.z = z; this.path = null; this.seg = null; this.vy = 0; this.falling = false; this.bestD = Infinity; this.stuckT = 0; }
  arrived(near = 1.2) { return !this.goal || Math.hypot(this.goal[0] + 0.5 - this.x, this.goal[2] + 0.5 - this.z) <= near && Math.abs(this.goal[1] - this.y) < 1.5; }

  // budget: { n } path searches allowed this frame (shared by all bots).
  update(dt, budget = { n: 1 }) {
    const G = this.grid;
    if (this.frozen > 0) { this.frozen -= dt; this.speed = 0; return; }
    // Gravity when the floor vanished (spleef, a broken block).
    const fx = Math.floor(this.x), fz = Math.floor(this.z), fy = Math.floor(this.y + 1e-3);
    if (!this.seg && !G.solid(fx, fy - 1, fz)) this.falling = true;
    if (this.falling) {
      this.vy = Math.max(this.vy - GRAV * dt, -30);
      const ny = this.y + this.vy * dt;
      if (G.solid(fx, Math.floor(ny), fz)) { this.y = Math.floor(ny) + 1; this.vy = 0; this.falling = false; this.path = null; }
      else this.y = ny;
      this.speed = 0;
      return;
    }
    if (!this.goal) { this.speed = 0; return; }
    if (this.arrived(Math.max(0.6, this.goalNear))) { this.path = null; this.seg = null; this.speed = 0; return; }

    this.repathT -= dt;
    if ((!this.path || this.repathT <= 0) && !this.seg && budget.n > 0) {
      budget.n--;
      this.repathT = 1.2 + Math.random() * 0.4;
      const p = findPathClosest(G, [this.x, this.y + 0.1, this.z], this.goal, { maxNodes: 2500 });
      // An empty path means we already stand on the closest reachable cell: not a failed search.
      if (p) { this.path = p.length ? p : null; this.noPathT = 0; } else { this.path = null; this.noPathT += 1.2; }
    }
    if (!this.seg && this.path?.length) {
      const n = this.path[0];
      if (!G.standable(n[0], n[1], n[2])) { this.path = null; this.repathT = 0; }
      else {
        this.path.shift();
        const from = [this.x, this.y, this.z];
        const to = [n[0] + 0.5, n[1], n[2] + 0.5];
        this.seg = { from, to, kind: n[3], t: 0, len: Math.max(0.5, Math.hypot(to[0] - from[0], to[2] - from[2])) };
      }
    }
    if (this.seg) {
      const s = this.seg;
      const sp = this.p.speed * (s.kind === 'jump' ? 1.15 : s.kind === 'up' ? 0.8 : 1);
      s.t = Math.min(1, s.t + (sp * dt) / s.len);
      const t = s.t;
      const arc = s.kind === 'jump' ? 0.9 : s.kind === 'up' ? 0.55 : s.kind === 'drop' ? 0.2 : 0;
      this.x = s.from[0] + (s.to[0] - s.from[0]) * t;
      this.z = s.from[2] + (s.to[2] - s.from[2]) * t;
      const ty = s.kind === 'drop' ? Math.min(1, t * t * 1.4) : s.kind === 'up' ? Math.min(1, t * 1.6) : t;
      this.y = s.from[1] + (s.to[1] - s.from[1]) * ty + arc * 4 * t * (1 - t);
      const dx = s.to[0] - s.from[0], dz = s.to[2] - s.from[2];
      if (Math.abs(dx) + Math.abs(dz) > 0.01) this.yaw = Math.atan2(dx, dz);
      this.speed = sp;
      if (t >= 1) { this.y = s.to[1]; this.seg = null; }
    } else this.speed = 0;

    // Stuck watchdog: no progress toward the goal for 5 s, or no path for 6 s → recover.
    const d = Math.hypot(this.goal[0] + 0.5 - this.x, this.goal[1] - this.y, this.goal[2] + 0.5 - this.z);
    if (d < this.bestD - 0.5) { this.bestD = d; this.stuckT = 0; } else this.stuckT += dt;
    if (this.stuckT > 5 || this.noPathT > 6) this.unstick();
  }

  // Hop to the standable cell nearest the goal we can find; never stay stuck forever.
  unstick() {
    this.stuckCount++;
    const G = this.grid;
    const g = this.goal;
    let spot = null;
    if (g) {
      for (let r = 1; r <= 4 && !spot; r++) {
        const a = Math.random() * Math.PI * 2;
        spot = snap(G, this.x + Math.cos(a) * r * 1.5, this.y + 1, this.z + Math.sin(a) * r * 1.5, 2);
        if (spot && !findPath(G, spot, g, { maxNodes: 1500, near: Math.max(1, this.goalNear) })) spot = null;
      }
      if (!spot && this.stuckCount > 2) spot = snap(G, g[0], g[1] + 1, g[2], 4);
    }
    if (spot) this.teleport(spot[0] + 0.5, spot[1], spot[2] + 0.5);
    this.onUnstick?.(this);
    this.stuckT = 0; this.noPathT = 0; this.bestD = Infinity; this.repathT = 0;
  }
}
