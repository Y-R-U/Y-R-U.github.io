// Nothing may strand the player. js/world/doors.js guards its traversal script with a timer for
// exactly this reason; walking has the same hazard — a step wedged between two colliders resolves
// back to where it started every frame, which from the stick feels like input being ignored, and
// there is no way out of it but a reload.
//
// Being pressed against a wall with the stick held is NOT stuck. The test is whether ANY direction
// gets out, probed through the caller's own step resolver, so the check and the movement it guards
// cannot drift apart. That probe only runs after a spell of not moving, so it costs nothing while
// the player is walking.

const DIRS = [];
for (let i = 0; i < 8; i++) DIRS.push([Math.sin(i * Math.PI / 4), Math.cos(i * Math.PI / 4)]);

// `resolve(x0, z0, x1, z1, y)` returns where a step from (x0,z0) to (x1,z1) actually lands.
export function wedged(x, z, y, probe, resolve) {
  for (const [dx, dz] of DIRS) {
    const r = resolve(x, z, x + dx * probe, z + dz * probe, y);
    if (Math.hypot(r.x - x, r.z - z) > probe * 0.5) return false;
  }
  return true;
}

export class Unstick {
  // `span` is both how far apart breadcrumbs are dropped and how far back one has to be to count
  // as somewhere else — a metre, so being freed puts him a pace behind rather than across the room.
  constructor({ secs = 0.7, eps = 0.03, span = 1.0, probe = 0.4 } = {}) {
    Object.assign(this, { secs, eps, span, probe });
    this.held = 0;
    this.trail = [];
    this.last = null;
  }

  // Once a frame, with where the player ended up. `asking` is whether the stick wants movement at
  // all. Returns null, or the point to put him back at.
  step(dt, x, z, y, asking, resolve) {
    const moved = this.last ? Math.hypot(x - this.last.x, z - this.last.z) : Infinity;
    this.last = { x, z };
    if (moved > this.eps) {
      this.held = 0;
      const t = this.trail[this.trail.length - 1];
      if (!t || Math.hypot(x - t.x, z - t.z) > this.span) {
        this.trail.push({ x, z, y });
        if (this.trail.length > 5) this.trail.shift();
      }
      return null;
    }
    if (!asking) { this.held = 0; return null; }
    this.held += dt;
    if (this.held < this.secs) return null;
    this.held = 0;
    if (!wedged(x, z, y, this.probe, resolve)) return null;
    return this.back(x, z);
  }

  // The most recent place he stood that is somewhere else. The trail is truncated there, so a
  // second wedge on the way out goes further back rather than bouncing off the same crumb.
  back(x, z) {
    for (let i = this.trail.length - 1; i >= 0; i--) {
      const p = this.trail[i];
      if (Math.hypot(p.x - x, p.z - z) > this.span * 0.6) { this.trail.length = i; return p; }
    }
    return null;
  }
}
