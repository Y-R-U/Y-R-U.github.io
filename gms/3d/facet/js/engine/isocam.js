// The isometric rig. Owns both cameras and swaps which one the app renders with.
//
// Orthographic is the honest answer for a diorama, but a very long lens sitting a long way back
// gives ~2° of convergence, which stops tall towers reading as cut-outs. Both are one knob apart
// so a scenario can pick.

import * as THREE from 'three';

const D2R = Math.PI / 180;

// Elevation angles that matter. 30° is the 2:1 game isometric every pixel-art tile ever cut used;
// 35.264° = atan(1/√2) is true isometric, where all three axes foreshorten equally.
export const ANGLES = { true: 35.264, game: 30, low: 22, high: 45 };

export class IsoCam {
  constructor(mount) {
    this.mount = mount;
    this.target = new THREE.Vector3(0, 2, 0);
    this.azimuth = 45;
    this.elevation = ANGLES.game;
    this.height = 46;
    this.mode = 'ortho';
    this.fov = 16;
    this.dist = 260;
    this.snap = 0;

    this.ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.5, 1600);
    this.persp = new THREE.PerspectiveCamera(this.fov, 1, 1, 1600);
    this.camera = this.ortho;
    this.aspect = 1;
    this.enabled = true;
    this.bindInput(mount);
    this.apply();
  }

  set(props) { Object.assign(this, props); this.apply(); return this; }

  resize(w, h) {
    this.aspect = w / h;
    this.apply();
  }

  apply() {
    const az = (this.snap ? Math.round(this.azimuth / this.snap) * this.snap : this.azimuth) * D2R;
    const el = THREE.MathUtils.clamp(this.elevation, 2, 88) * D2R;
    const ch = Math.cos(el), sh = Math.sin(el);

    // Sizing on height alone crops the diorama's sides on a portrait phone. max(R, R/aspect)
    // keeps the whole thing framed at any aspect, and ortho depth is linear so a negative near
    // plane costs nothing and guarantees the slab never clips as the rig orbits.
    const o = this.ortho, hh = Math.max(this.height / 2, this.height / 2 / this.aspect);
    o.left = -hh * this.aspect; o.right = hh * this.aspect; o.top = hh; o.bottom = -hh;
    o.near = -this.dist; o.far = this.dist * 2.4;
    o.updateProjectionMatrix();

    // Perspective distance is solved so the framed height matches ortho's exactly — swapping
    // modes must not change what is in shot, only how it converges.
    this.persp.fov = this.fov;
    this.persp.aspect = this.aspect;
    const pd = Math.max(this.height / 2, this.height / 2 / this.aspect) / Math.tan(this.fov * 0.5 * D2R);
    this.persp.updateProjectionMatrix();

    const cam = this.mode === 'lens' ? this.persp : this.ortho;
    const d = this.mode === 'lens' ? pd : this.dist;
    cam.position.set(
      this.target.x + Math.cos(az) * ch * d,
      this.target.y + sh * d,
      this.target.z + Math.sin(az) * ch * d,
    );
    cam.lookAt(this.target);
    cam.updateMatrixWorld();
    this.camera = cam;
    return cam;
  }

  registerKnobs(q, app) {
    const re = () => { this.apply(); app.camera = this.camera; };
    q.register({ key: 'camMode', label: 'Projection', type: 'select', options: ['ortho', 'lens'], default: 'ortho', group: 'Camera' },
      v => { this.mode = v; re(); });
    q.register({ key: 'camAz', label: 'Azimuth', type: 'range', min: 0, max: 360, step: 1, default: 45, group: 'Camera' },
      v => { this.azimuth = v; re(); });
    q.register({ key: 'camEl', label: 'Elevation', type: 'range', min: 5, max: 80, step: 0.5, default: ANGLES.game, group: 'Camera' },
      v => { this.elevation = v; re(); });
    q.register({ key: 'camZoom', label: 'Frame height', type: 'range', min: 8, max: 140, step: 0.5, default: 46, group: 'Camera' },
      v => { this.height = v; re(); });
    q.register({ key: 'camLens', label: 'Lens fov', type: 'range', min: 6, max: 40, step: 0.5, default: 16, group: 'Camera' },
      v => { this.fov = v; re(); });
    q.register({ key: 'camSnap', label: 'Snap azimuth', type: 'select', options: [0, 15, 45, 90], default: 0, group: 'Camera' },
      v => { this.snap = +v; re(); });
  }

  bindInput(el) {
    let drag = null, pinch = 0;
    const pts = new Map();

    const down = e => {
      if (!this.enabled) return;
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pts.size === 1) drag = { x: e.clientX, y: e.clientY, az: this.azimuth, el: this.elevation };
      if (pts.size === 2) { pinch = spread(pts); drag = null; this.h0 = this.height; }
      el.setPointerCapture?.(e.pointerId);
    };
    const move = e => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pts.size === 2 && pinch) {
        const s = spread(pts);
        this.height = THREE.MathUtils.clamp(this.h0 * (pinch / s), 8, 160);
        this.apply();
      } else if (drag) {
        this.azimuth = drag.az - (e.clientX - drag.x) * 0.32;
        this.elevation = THREE.MathUtils.clamp(drag.el + (e.clientY - drag.y) * 0.22, 6, 82);
        this.apply();
      }
      this.onChange?.();
    };
    const up = e => {
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = 0;
      if (!pts.size) drag = null;
    };

    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    // NOT pointerleave: the pointer is captured, so a drag that travels past the canvas edge is
    // still ours — listening to it ended every swipe the moment a finger crossed the bound, which
    // is what made rotation move a little and then stop dead.
    for (const t of ['pointerup', 'pointercancel']) el.addEventListener(t, up);
    el.addEventListener('wheel', e => {
      if (!this.enabled) return;
      e.preventDefault();
      this.height = THREE.MathUtils.clamp(this.height * (1 + Math.sign(e.deltaY) * 0.08), 8, 160);
      this.apply();
      this.onChange?.();
    }, { passive: false });
  }
}

function spread(pts) {
  const [a, b] = [...pts.values()];
  return Math.hypot(a[0] - b[0], a[1] - b[1]) || 1;
}
