// Ghost ball: plays back a recorded shot (ball centre sampled at ~30 Hz, see round.js) as a
// translucent ball with a fading trail. A plain THREE.Group the game adds to its scene; no game
// imports. Usage:
//   const g = new GhostBall({ color: golfer.color }); scene.add(g);
//   g.place(tee); g.play(shot, { onDone });   // shot = { path: Float32Array xyz, hz, state, to }
//   each frame: g.update(dt);   when finished: scene.remove(g); g.dispose();
import * as THREE from 'three';
import { BALL_R } from '../engine/constants.js';

const TRAIL_MAX = 40;          // samples kept in the trail (≈1.3 s at 30 Hz)

export class GhostBall extends THREE.Group {
  constructor({ color = 0xffffff, opacity = 0.5, radius = BALL_R, trail = TRAIL_MAX, label = null } = {}) {
    super();
    this.name = 'ghost';
    this.radius = radius; this.baseOpacity = opacity; this.trailMax = Math.max(4, trail);
    const col = new THREE.Color(color);
    this.ballMat = new THREE.MeshStandardMaterial({ color: col, emissive: col.clone().multiplyScalar(0.35), roughness: 0.4, transparent: true, opacity, depthWrite: false });
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(radius, 20, 14), this.ballMat);
    this.ball.renderOrder = 2;
    this.add(this.ball);
    // flat ribbon trail, tapered and fading toward the tail (RGBA vertex colours)
    const n = this.trailMax;
    this.trailPos = new Float32Array(n * 2 * 3);
    this.trailCol = new Float32Array(n * 2 * 4);
    const idx = [];
    for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.trailPos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.trailCol, 4).setUsage(THREE.DynamicDrawUsage));
    g.setIndex(idx);
    g.setDrawRange(0, 0);
    this.trailGeo = g;
    this.trailMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    this.trail = new THREE.Mesh(g, this.trailMat);
    this.trail.frustumCulled = false;
    this.trail.renderOrder = 1;
    this.add(this.trail);
    this.color = col;
    this.hist = [];            // trail points [x, y, z]
    this.shot = null; this.t = 0; this.fade = 1; this.done = true;
    this.label = label;
  }

  place(p) {
    const [x, y, z] = Array.isArray(p) ? p : [p.x, p.y, p.z];
    this.ball.position.set(x, y, z);
    this.ball.visible = true; this.fade = 1; this._setOpacity(1);
    this.hist.length = 0; this._rebuildTrail();
  }

  // Play one recorded shot. opts: { speed = 1, onDone(shot) }
  play(shot, { speed = 1, onDone } = {}) {
    this.shot = shot; this.t = 0; this.speed = speed; this.onDone = onDone; this.done = false;
    this.hist.length = 0; this.fade = 1; this._setOpacity(1);
    const p = shot.path;
    if (p && p.length >= 3) this.ball.position.set(p[0], p[1], p[2]);
    this.ball.visible = true;
  }

  get playing() { return !this.done; }

  // at (optional): seconds since this shot started, from the obstacle clock (GhostPlayer clocked
  // mode) instead of accumulating dt, so the replay stays in phase with the moving obstacles.
  update(dt, at) {
    if (this.done) {   // trail keeps fading out after the shot
      if (this.hist.length) { this.hist.shift(); this._rebuildTrail(); }
      return;
    }
    const s = this.shot, p = s.path, hz = s.hz || 30;
    const n = p ? p.length / 3 : 0;
    if (at != null) this.t = Math.max(0, at); else this.t += dt * this.speed;
    const f = this.t * hz;
    if (n === 0 || f >= n - 1) {
      // end of the path: settle, sink or vanish
      if (n) this.ball.position.set(p[(n - 1) * 3], p[(n - 1) * 3 + 1], p[(n - 1) * 3 + 2]);
      if (s.state === 'cup' || s.state === 'oob') {
        this.fade -= dt * 2.5;
        if (s.state === 'cup') this.ball.position.y -= dt * 0.25;
        this._setOpacity(Math.max(0, this.fade));
        if (this.fade > 0) { this._pushHist(); return; }
        this.ball.visible = s.state !== 'cup';
        if (s.state === 'oob' && s.to) { this.ball.position.set(s.to[0], s.to[1], s.to[2]); this._setOpacity(1); }   // back to the last rest spot (D9)
      }
      this.done = true;
      const cb = this.onDone; this.onDone = null;
      cb?.(s);
      return;
    }
    const i = Math.floor(f), k = f - i, a = i * 3, b = a + 3;
    this.ball.position.set(p[a] + (p[b] - p[a]) * k, p[a + 1] + (p[b + 1] - p[a + 1]) * k, p[a + 2] + (p[b + 2] - p[a + 2]) * k);
    this._pushHist();
  }

  _pushHist() {
    const q = this.ball.position, h = this.hist, last = h[h.length - 1];
    if (!last || Math.hypot(q.x - last[0], q.y - last[1], q.z - last[2]) > 0.012) h.push([q.x, q.y, q.z]);
    while (h.length > this.trailMax) h.shift();
    this._rebuildTrail();
  }

  _rebuildTrail() {
    const h = this.hist, n = h.length, P = this.trailPos, C = this.trailCol;
    if (n < 2) { this.trailGeo.setDrawRange(0, 0); return; }
    let lx = 1, lz = 0;
    for (let i = 0; i < n; i++) {
      const a = h[Math.max(0, i - 1)], b = h[Math.min(n - 1, i + 1)];
      const dx = b[0] - a[0], dz = b[2] - a[2], L = Math.hypot(dx, dz);
      if (L > 1e-5) { lx = -dz / L; lz = dx / L; }   // keep the last good lateral (no zero normalise)
      const u = i / (n - 1);                     // 0 tail → 1 head
      const w = this.radius * (0.25 + 0.75 * u);
      const y = h[i][1] - this.radius * 0.55;
      const o = i * 6;
      P[o] = h[i][0] + lx * w; P[o + 1] = y; P[o + 2] = h[i][2] + lz * w;
      P[o + 3] = h[i][0] - lx * w; P[o + 4] = y; P[o + 5] = h[i][2] - lz * w;
      const al = Math.pow(u, 1.6) * this.baseOpacity * 0.9 * Math.max(0, this.fade);
      for (const c of [i * 8, i * 8 + 4]) { C[c] = this.color.r; C[c + 1] = this.color.g; C[c + 2] = this.color.b; C[c + 3] = al; }
    }
    this.trailGeo.attributes.position.needsUpdate = true;
    this.trailGeo.attributes.color.needsUpdate = true;
    this.trailGeo.setDrawRange(0, (n - 1) * 6);
  }

  _setOpacity(k) { this.ballMat.opacity = this.baseOpacity * k; }

  dispose() {
    this.ball.geometry.dispose(); this.ballMat.dispose();
    this.trailGeo.dispose(); this.trailMat.dispose();
  }
}

// Plays a whole ghost record (round.js playHoleSync / worker 'hole') shot after shot.
//   const p = new GhostPlayer(ghost, record, { gap: 0.8 }); each frame p.update(dt); p.finished
// Clocked: p.update(dt, worldTime) with the live hole's obstacle clock (world.time, 0 at hole load like
// the record's t0 = 0). Each shot then starts when the clock reaches its recorded t0 and its path is
// sampled at clock - t0, so movers are where they were when the shot was simulated (no passing through
// them; Steady Hands slows the ghost with the obstacles). Shots without a t0 fall back to `gap`.
export class GhostPlayer {
  constructor(ghost, record, { gap = 0.8, speed = 1, onShot, onDone } = {}) {
    this.ghost = ghost; this.rec = record; this.gap = gap; this.speed = speed; this.onShot = onShot; this.onDone = onDone;
    this.i = 0; this.wait = 0; this.finished = false;
    const s0 = record.shots[0];
    if (s0) ghost.place(s0.from);
  }
  update(dt, worldTime) {
    const clocked = worldTime != null && this.cur && Number.isFinite(this.cur.t0);
    this.ghost.update(dt, clocked && this.ghost.playing ? worldTime - this.cur.t0 : undefined);
    if (this.finished || this.ghost.playing) return;
    if (this.i >= this.rec.shots.length) { this.finished = true; this.onDone?.(this.rec); return; }
    const next = this.rec.shots[this.i];
    if (worldTime != null && Number.isFinite(next.t0)) {
      if (worldTime < next.t0) return;
    } else {
      this.wait += dt;
      if (this.wait < this.gap) return;
      this.wait = 0;
    }
    this.i++; this.cur = next;
    this.onShot?.(next, this.i);
    this.ghost.play(next, { speed: this.speed });
    if (worldTime != null && Number.isFinite(next.t0)) this.ghost.update(0, worldTime - next.t0);
  }
}
