// math.js — Vec2 and angle utilities
const MathUtils = (() => {
  class Vec2 {
    constructor(x = 0, y = 0) {
      this.x = x;
      this.y = y;
    }
    add(v) { return new Vec2(this.x + v.x, this.y + v.y); }
    sub(v) { return new Vec2(this.x - v.x, this.y - v.y); }
    scale(s) { return new Vec2(this.x * s, this.y * s); }
    length() { return Math.sqrt(this.x * this.x + this.y * this.y); }
    lengthSq() { return this.x * this.x + this.y * this.y; }
    normalize() {
      const l = this.length();
      if (l === 0) return new Vec2(0, 0);
      return new Vec2(this.x / l, this.y / l);
    }
    dot(v) { return this.x * v.x + this.y * v.y; }
    distTo(v) { return this.sub(v).length(); }
    distToSq(v) { return this.sub(v).lengthSq(); }
    angle() { return Math.atan2(this.y, this.x); }
    rotate(a) {
      const c = Math.cos(a), s = Math.sin(a);
      return new Vec2(this.x * c - this.y * s, this.x * s + this.y * c);
    }
    lerp(v, t) { return new Vec2(this.x + (v.x - this.x) * t, this.y + (v.y - this.y) * t); }
    clone() { return new Vec2(this.x, this.y); }
    set(x, y) { this.x = x; this.y = y; return this; }
    addTo(v) { this.x += v.x; this.y += v.y; return this; }
    subFrom(v) { this.x -= v.x; this.y -= v.y; return this; }
    scaleBy(s) { this.x *= s; this.y *= s; return this; }
    static fromAngle(a, len = 1) { return new Vec2(Math.cos(a) * len, Math.sin(a) * len); }
    static zero() { return new Vec2(0, 0); }
  }

  function angleTo(from, to) {
    return Math.atan2(to.y - from.y, to.x - from.x);
  }

  function angleDiff(a, b) {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function randomRange(min, max) {
    return min + Math.random() * (max - min);
  }

  function randomInt(min, max) {
    return Math.floor(randomRange(min, max + 1));
  }

  function randomAngle() {
    return Math.random() * Math.PI * 2;
  }

  function circlesOverlap(ax, ay, ar, bx, by, br) {
    const dx = ax - bx;
    const dy = ay - by;
    const distSq = dx * dx + dy * dy;
    const minDist = ar + br;
    return distSq < minDist * minDist;
  }

  function distSq(ax, ay, bx, by) {
    const dx = ax - bx;
    const dy = ay - by;
    return dx * dx + dy * dy;
  }

  function dist(ax, ay, bx, by) {
    return Math.sqrt(distSq(ax, ay, bx, by));
  }

  function choose(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  return { Vec2, angleTo, angleDiff, clamp, lerp, randomRange, randomInt, randomAngle, circlesOverlap, distSq, dist, choose, shuffle };
})();
