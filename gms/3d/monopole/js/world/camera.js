// The camera rig. Exactly three gestures on the 3D and nothing else: one-finger drag orbits,
// two-finger pinch dollies, tap selects. Everything else the player does is a 2D panel.
//
// The rig is always in orbit form — target, distance, two angles — so however the camera got
// where it is, a finger on the screen continues from there and focus() always gets the player
// back to a known framing. moveCamera() and flyBy() convert their endpoints into orbit form on
// arrival for the same reason.

import * as THREE from 'three';

const EASE = {
  linear: t => t,
  in: t => t * t,
  out: t => 1 - (1 - t) * (1 - t),
  inout: t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  smooth: t => t * t * (3 - 2 * t),
};

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const PHI_EPS = 0.06;

export class CameraRig {
  constructor(app, { onTap = null } = {}) {
    this.app = app;
    this.cam = app.camera;
    this.onTap = onTap;
    this.active = false;
    this.touch = true;

    this.target = new THREE.Vector3(0, 0, 0);
    this.dist = 90;
    this.phi = Math.PI * 0.44;
    this.theta = 0;
    this.fov = this.cam.fov;

    this.want = { target: this.target.clone(), dist: this.dist, phi: this.phi, theta: this.theta, fov: this.fov };

    this.tween = null;
    this.fly = null;
    this.pointers = new Map();
    this.gesture = null;
    this.raycaster = new THREE.Raycaster();
    // the starfield and the mote clouds are THREE.Points centred on the camera, so at the default
    // threshold a tap hits thousands of them at distance 0 and never reaches anything solid
    this.raycaster.params.Points.threshold = 0;
    this.sel = new THREE.Vector2();
    this._v = new THREE.Vector3();
    this._q = new THREE.Vector3();

    this.opt = {
      orbitSpeed: 0.0062, pinchSpeed: 1.0, damp: 11, distMin: 14, distMax: 4200,
      invertY: false, tapSlop: 9, tapMs: 380,
    };

    this.bind(app.renderer.domElement);
  }

  /* ── orbit maths ─────────────────────────────────────────────────────── */

  syncFromCamera(dist = this.dist) {
    this.cam.getWorldDirection(this._v);
    this.target.copy(this.cam.position).addScaledVector(this._v, dist);
    this.dist = dist;
    this._q.copy(this.cam.position).sub(this.target);
    this.phi = clamp(Math.acos(clamp(this._q.y / Math.max(1e-6, this._q.length()), -1, 1)), PHI_EPS, Math.PI - PHI_EPS);
    this.theta = Math.atan2(this._q.x, this._q.z);
    this.fov = this.cam.fov;
    this.copyWant();
  }

  // pos/look are what a scenario or a fly-by leaves behind; turn them into orbit terms.
  setFrom(pos, look, fov) {
    this.target.set(look[0] ?? look.x, look[1] ?? look.y, look[2] ?? look.z);
    const p = new THREE.Vector3(pos[0] ?? pos.x, pos[1] ?? pos.y, pos[2] ?? pos.z);
    this._q.copy(p).sub(this.target);
    this.dist = clamp(this._q.length(), this.opt.distMin, this.opt.distMax);
    this.phi = clamp(Math.acos(clamp(this._q.y / Math.max(1e-6, this._q.length()), -1, 1)), PHI_EPS, Math.PI - PHI_EPS);
    this.theta = Math.atan2(this._q.x, this._q.z);
    if (fov) this.fov = fov;
    this.copyWant();
  }

  copyWant() {
    this.want.target.copy(this.target);
    this.want.dist = this.dist;
    this.want.phi = this.phi;
    this.want.theta = this.theta;
    this.want.fov = this.fov;
  }

  place() {
    const sp = Math.sin(this.phi) * this.dist;
    this.cam.position.set(
      this.target.x + sp * Math.sin(this.theta),
      this.target.y + Math.cos(this.phi) * this.dist,
      this.target.z + sp * Math.cos(this.theta));
    this.cam.lookAt(this.target);
    if (Math.abs(this.cam.fov - this.fov) > 0.01) { this.cam.fov = this.fov; this.cam.updateProjectionMatrix(); }
  }

  /* ── moves ───────────────────────────────────────────────────────────── */

  moveTo({ pos, look, fov, ms = 0, ease = 'inout' } = {}) {
    const to = { target: this.target.clone(), dist: this.dist, phi: this.phi, theta: this.theta, fov: fov || this.fov };
    if (pos || look) {
      const probe = new CameraRig.Probe();
      probe.from(pos || this.cam.position, look || this.target, this.opt);
      to.target.copy(probe.target); to.dist = probe.dist; to.phi = probe.phi; to.theta = probe.theta;
    }
    // take the short way round the pole
    while (to.theta - this.theta > Math.PI) to.theta -= Math.PI * 2;
    while (to.theta - this.theta < -Math.PI) to.theta += Math.PI * 2;

    if (ms <= 0) {
      this.target.copy(to.target); this.dist = to.dist; this.phi = to.phi; this.theta = to.theta; this.fov = to.fov;
      this.copyWant(); this.place();
      return Promise.resolve(this);
    }
    // Interrupting a move has to settle the one it replaces, or a caller awaiting the old
    // destination hangs forever. `cut` says it never arrived — the intro reads it to tell a
    // completed beat from one the player paged past.
    this.cancelMove();
    return new Promise(resolve => {
      this.tween = {
        t0: performance.now(), ms, ease: EASE[ease] || EASE.inout, resolve,
        from: { target: this.target.clone(), dist: this.dist, phi: this.phi, theta: this.theta, fov: this.fov },
        to,
      };
    });
  }

  flyBy({ keys, ms = 6000, loop = false, ease = 'inout' } = {}) {
    if (!keys || keys.length < 2) return Promise.resolve(this);
    const pts = keys.map(k => new THREE.Vector3(...k.pos));
    const looks = keys.map(k => new THREE.Vector3(...(k.look || [0, 0, 0])));
    const ts = keys.map((k, i) => (k.t === undefined ? i / (keys.length - 1) : k.t));
    const posCurve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.5);
    const lookCurve = new THREE.CatmullRomCurve3(looks, false, 'catmullrom', 0.5);
    this.tween = null;
    const handle = { stop: () => this.stopFly() };
    const p = new Promise(resolve => {
      this.fly = {
        t0: performance.now(), ms, loop, ease: EASE[ease] || EASE.inout,
        posCurve, lookCurve, ts, fovs: keys.map(k => k.fov || this.fov), resolve, handle,
      };
    });
    handle.promise = p;
    return loop ? handle : p;
  }

  focus(object3D, { dist, phi, theta, ms = 700, ease = 'inout' } = {}) {
    if (!object3D) return Promise.resolve(this);
    const box = new THREE.Box3().setFromObject(object3D);
    if (box.isEmpty()) return Promise.resolve(this);
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const r = Math.max(1, sphere.radius);
    const d = clamp(dist ?? r * 2.9, this.opt.distMin, this.opt.distMax);
    const ph = clamp(phi ?? Math.PI * 0.40, PHI_EPS, Math.PI - PHI_EPS);
    const th = theta ?? this.theta;
    const sp = Math.sin(ph) * d;
    return this.moveTo({
      pos: [sphere.center.x + sp * Math.sin(th), sphere.center.y + Math.cos(ph) * d, sphere.center.z + sp * Math.cos(th)],
      look: [sphere.center.x, sphere.center.y, sphere.center.z],
      ms, ease,
    });
  }

  cancelMove() {
    const t = this.tween;
    this.tween = null;
    this.fly = null;
    t?.resolve?.({ cut: true });
    return this;
  }

  setTouchEnabled(on) {
    this.touch = !!on;
    if (!on) { this.pointers.clear(); this.gesture = null; }
    return this;
  }

  // Cutting a fly-by short has to settle its promise, or whatever was waiting on the fly to
  // finish never runs — that is how skipping the cold open used to leave the camera locked.
  stopFly() {
    const f = this.fly;
    this.fly = null;
    this.tween = null;
    this.syncFromCamera(this.dist);
    if (this.homePending) this.markHome();
    f?.resolve?.(this);
    return this;
  }

  // Where the player came in. Any scene that moves the camera sets this, so "reset view" means
  // something everywhere rather than only in the live game. Called while a move is still playing
  // it takes the move's destination, not the frame it happens to be passing through.
  markHome(opts = null) {
    if (opts) { this.home = opts; this.homePending = false; return this; }
    if (this.fly) { this.homePending = true; return this; }
    const t = this.tween;
    this.home = t
      ? { target: t.to.target.clone(), dist: t.to.dist, phi: t.to.phi, theta: t.to.theta, fov: t.to.fov }
      : { target: this.target.clone(), dist: this.dist, phi: this.phi, theta: this.theta, fov: this.fov };
    this.homePending = false;
    return this;
  }

  resetView(ms = 620) {
    this.stopFly();
    return this.goTo(this.home, ms);
  }

  // Orbit state as a plain object, and the move back to one. Anything that takes the camera
  // somewhere temporarily — the inspect card's fly-to — grabs one of these first so its Back
  // button means "exactly where I was", not "roughly the middle".
  snapshot() {
    return { target: this.want.target.clone(), dist: this.want.dist, phi: this.want.phi, theta: this.want.theta, fov: this.want.fov };
  }

  goTo(h, ms = 700) {
    if (!h) return Promise.resolve(this);
    if (h.object) return this.focus(h.object, { dist: h.dist, phi: h.phi, theta: h.theta, ms });
    const sp = Math.sin(h.phi) * h.dist;
    return this.moveTo({
      pos: [h.target.x + sp * Math.sin(h.theta), h.target.y + Math.cos(h.phi) * h.dist, h.target.z + sp * Math.cos(h.theta)],
      look: [h.target.x, h.target.y, h.target.z], fov: h.fov, ms,
    });
  }

  // Same as focus() but for something with no Object3D of its own — one rock out of an instanced
  // field, say, where all we have is where the finger landed and how big the thing is.
  focusPoint(p, r = 40, { ms = 800, phi, theta } = {}) {
    const d = clamp(r * 3.4, this.opt.distMin, this.opt.distMax);
    const ph = clamp(phi ?? this.phi, PHI_EPS, Math.PI - PHI_EPS);
    const th = theta ?? this.theta;
    const sp = Math.sin(ph) * d;
    return this.moveTo({
      pos: [p.x + sp * Math.sin(th), p.y + Math.cos(ph) * d, p.z + sp * Math.cos(th)],
      look: [p.x, p.y, p.z], ms,
    });
  }

  /* ── gestures ────────────────────────────────────────────────────────── */

  bind(el) {
    this.el = el;
    el.style.touchAction = 'none';

    const down = e => {
      if (!this.active || !this.touch) return;
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      // a capture that throws must not abort the rest of the gesture setup
      try { el.setPointerCapture?.(e.pointerId); } catch {}
      if (this.pointers.size === 1) {
        this.gesture = {
          mode: 'maybe', x: e.clientX, y: e.clientY, t0: performance.now(), travel: 0,
          phi0: this.want.phi, theta0: this.want.theta,
        };
      } else if (this.pointers.size === 2 && this.gesture) {
        // A pinch that began as a drag would otherwise leave the framing wherever the first
        // finger dragged it before the second landed. Put the angles back and dolly from there.
        this.want.phi = this.gesture.phi0;
        this.want.theta = this.gesture.theta0;
        this.gesture.mode = 'pinch';
        this.gesture.pinch0 = this.spread();
        this.gesture.dist0 = this.want.dist;
      }
      this.tween = null;
    };

    const move = e => {
      const p = this.pointers.get(e.pointerId);
      if (!p || !this.active || !this.touch) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      const g = this.gesture;
      if (!g) return;

      if (g.mode === 'pinch') {
        const s = this.spread();
        if (s > 4 && g.pinch0 > 4) {
          this.want.dist = clamp(g.dist0 * Math.pow(g.pinch0 / s, this.opt.pinchSpeed), this.opt.distMin, this.opt.distMax);
        }
        return;
      }
      if (this.pointers.size !== 1) return;
      g.travel += Math.hypot(dx, dy);
      if (g.mode === 'maybe') {
        if (g.travel < this.opt.tapSlop) return;
        g.mode = 'orbit';
      }
      const k = this.opt.orbitSpeed * (this.fov / 45);
      this.want.theta -= dx * k;
      this.want.phi = clamp(this.want.phi + dy * k * (this.opt.invertY ? -1 : 1), PHI_EPS, Math.PI - PHI_EPS);
    };

    const up = e => {
      const g = this.gesture;
      this.pointers.delete(e.pointerId);
      try { el.releasePointerCapture?.(e.pointerId); } catch {}
      if (g && g.mode === 'maybe' && this.pointers.size === 0
        && g.travel < this.opt.tapSlop && performance.now() - g.t0 < this.opt.tapMs) {
        this.pick(e.clientX, e.clientY);
      }
      if (this.pointers.size === 0) this.gesture = null;
      // one finger lifted out of a pinch: stay in pinch until the hand is off, or the framing
      // snaps as the remaining finger is read as a drag
      else if (g && g.mode === 'pinch') { g.pinch0 = this.spread(); g.dist0 = this.want.dist; }
    };

    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', e => {
      if (!this.active || !this.touch) return;
      e.preventDefault();
      this.tween = null;
      this.want.dist = clamp(this.want.dist * (1 + Math.sign(e.deltaY) * 0.12), this.opt.distMin, this.opt.distMax);
    }, { passive: false });
  }

  spread() {
    const [a, b] = [...this.pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }

  pick(cx, cy) {
    if (!this.onTap) return;
    const r = this.el.getBoundingClientRect();
    this.sel.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.sel, this.cam);
    const hits = this.raycaster.intersectObjects(this.app.scene.children, true)
      .filter(h => !h.object.isPoints && h.object.renderOrder >= 0);
    this.onTap(hits[0] || null, hits);
  }

  /* ── frame ───────────────────────────────────────────────────────────── */

  update(dt) {
    if (!this.active) { this.syncFromCamera(this.dist); return; }

    if (this.fly) {
      const f = this.fly;
      let u = (performance.now() - f.t0) / f.ms;
      if (u >= 1) {
        if (f.loop) { f.t0 = performance.now(); u = 0; }
        else {
          u = 1;
          const done = f;
          this.fly = null;
          this.sampleFly(done, 1);
          this.syncFromCamera(this.dist);
          if (this.homePending) this.markHome();
          done.resolve?.(this);
          return;
        }
      }
      this.sampleFly(f, u);
      return;
    }

    if (this.tween) {
      const t = this.tween;
      const u = Math.min(1, (performance.now() - t.t0) / t.ms);
      const k = t.ease(u);
      this.target.lerpVectors(t.from.target, t.to.target, k);
      this.dist = t.from.dist + (t.to.dist - t.from.dist) * k;
      this.phi = t.from.phi + (t.to.phi - t.from.phi) * k;
      this.theta = t.from.theta + (t.to.theta - t.from.theta) * k;
      this.fov = t.from.fov + (t.to.fov - t.from.fov) * k;
      this.copyWant();
      this.place();
      if (u >= 1) { const r = t.resolve; this.tween = null; r?.(this); }
      return;
    }

    const a = 1 - Math.exp(-this.opt.damp * Math.max(0.001, dt));
    this.target.lerp(this.want.target, a);
    this.dist += (this.want.dist - this.dist) * a;
    this.phi += (this.want.phi - this.phi) * a;
    this.theta += (this.want.theta - this.theta) * a;
    this.fov += (this.want.fov - this.fov) * a;
    this.place();
  }

  registerKnobs(q) {
    const k = (key, label, min, max, step, get, set) =>
      q.register({ key, label, type: 'range', min, max, step, default: get(), group: 'Camera' }, v => set(v));
    k('camOrbitSpeed', 'Orbit speed', 0.002, 0.02, 0.0002, () => this.opt.orbitSpeed, v => { this.opt.orbitSpeed = v; });
    k('camPinchSpeed', 'Pinch speed', 0.4, 2.4, 0.05, () => this.opt.pinchSpeed, v => { this.opt.pinchSpeed = v; });
    k('camDamp', 'Damping', 2, 30, 0.5, () => this.opt.damp, v => { this.opt.damp = v; });
    k('camDistMin', 'Closest', 4, 400, 2, () => this.opt.distMin, v => { this.opt.distMin = v; });
    k('camDistMax', 'Furthest', 200, 9000, 50, () => this.opt.distMax, v => { this.opt.distMax = v; });
    k('camTapSlop', 'Tap slop px', 4, 24, 1, () => this.opt.tapSlop, v => { this.opt.tapSlop = v; });
    q.register({ key: 'camInvertY', label: 'Invert drag Y', type: 'toggle', default: false, group: 'Camera' },
      v => { this.opt.invertY = !!v; });
    q.register({ key: 'camTouch', label: 'Touch enabled', type: 'toggle', default: true, group: 'Camera' },
      v => this.setTouchEnabled(v));
  }

  sampleFly(f, u) {
    const e = f.ease(clamp(u, 0, 1));
    const p = f.posCurve.getPoint(e);
    const l = f.lookCurve.getPoint(e);
    this.cam.position.copy(p);
    this.cam.lookAt(l);
    const seg = segAt(f.ts, e);
    const fov = f.fovs[seg.i] + (f.fovs[seg.j] - f.fovs[seg.i]) * seg.k;
    if (Math.abs(this.cam.fov - fov) > 0.01) { this.cam.fov = fov; this.cam.updateProjectionMatrix(); }
    this.fov = fov;
    this.target.copy(l);
    this.dist = p.distanceTo(l);
  }
}

// A throwaway used only to convert a pos/look pair into orbit terms.
CameraRig.Probe = class {
  from(pos, look, opt) {
    this.target = new THREE.Vector3(...(Array.isArray(look) ? look : [look.x, look.y, look.z]));
    const p = new THREE.Vector3(...(Array.isArray(pos) ? pos : [pos.x, pos.y, pos.z]));
    const q = p.clone().sub(this.target);
    this.dist = clamp(q.length(), opt.distMin, opt.distMax);
    this.phi = clamp(Math.acos(clamp(q.y / Math.max(1e-6, q.length()), -1, 1)), PHI_EPS, Math.PI - PHI_EPS);
    this.theta = Math.atan2(q.x, q.z);
  }
};

function segAt(ts, u) {
  for (let i = 0; i < ts.length - 1; i++) {
    if (u <= ts[i + 1] || i === ts.length - 2) {
      const span = Math.max(1e-6, ts[i + 1] - ts[i]);
      return { i, j: i + 1, k: clamp((u - ts[i]) / span, 0, 1) };
    }
  }
  return { i: 0, j: Math.min(1, ts.length - 1), k: 0 };
}

/* ── the module-level handle the §3 contract names ─────────────────────── */

export const camera = {
  rig: null,
  attach(app, opts) {
    if (camera.rig) return camera.rig;
    camera.rig = new CameraRig(app, opts);
    app.add(camera.rig);
    app.cameraRig = camera.rig;
    return camera.rig;
  },
  enable(on = true) { if (camera.rig) camera.rig.active = !!on; return camera; },
  get active() { return !!camera.rig?.active; },
  stopFly() { camera.rig?.stopFly(); return camera; },
  cancelMove() { camera.rig?.cancelMove(); return camera; },
  moveTo(opts) { return camera.rig ? camera.rig.moveTo(opts) : Promise.resolve({ cut: true }); },
  markHome(opts) { camera.rig?.markHome(opts); return camera; },
  resetView(ms) { return camera.rig ? camera.rig.resetView(ms) : Promise.resolve(); },
  focus(object3D, opts) { return camera.rig ? camera.rig.focus(object3D, opts) : Promise.resolve(); },
  focusPoint(p, r, opts) { return camera.rig ? camera.rig.focusPoint(p, r, opts) : Promise.resolve(); },
  snapshot() { return camera.rig?.snapshot() || null; },
  goTo(h, ms) { return camera.rig ? camera.rig.goTo(h, ms) : Promise.resolve(); },
  setTouchEnabled(on) { camera.rig?.setTouchEnabled(on); return camera; },
  setFrom(pos, look, fov) { camera.rig?.setFrom(pos, look, fov); return camera; },
  onTap(fn) { if (camera.rig) camera.rig.onTap = fn; return camera; },
};

export function moveCamera(app, opts) {
  const rig = app.cameraRig || camera.rig;
  if (!rig) return Promise.resolve();
  rig.active = true;
  return rig.moveTo(opts);
}

export function flyBy(app, opts) {
  const rig = app.cameraRig || camera.rig;
  if (!rig) return Promise.resolve();
  rig.active = true;
  return rig.flyBy(opts);
}

export default camera;
