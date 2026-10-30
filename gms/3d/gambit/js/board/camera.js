// GAMBIT board camera rig: spherical orbit around the board centre, auto-fit to the
// container, eased toward a goal. No pan, clamped tilt and zoom, so the board can
// never be lost. Battle anims borrow it through focus()/release()/shake().
import * as THREE from 'three';

const D = THREE.MathUtils.degToRad;
// View modes. Locked modes ignore orbit/zoom input (battle focus + shake still work and
// always return to the locked pose). 'free' is the only user-orbitable mode.
export const PRESETS = {
  top: { phi: 0.0002, zoom: 1, locked: true },     // truly straight overhead
  tilt: { phi: D(13), zoom: 1, locked: true },     // slight tilt so pieces show some 3D
  angle: { phi: D(48), zoom: 1, locked: true },    // "3D"
  free: { phi: D(32), zoom: 1, locked: false },    // drag / arrows / pinch orbit and zoom
};
export const VIEW_ORDER = ['top', 'tilt', 'angle', 'free'];
export const VIEW_LABELS = { top: 'Top', tilt: 'Tilt', angle: '3D', free: 'Free' };
/** Normalise saved/legacy view names ('default' was the old tilt preset). */
export function normalizeView(name) {
  if (name === 'default') return 'tilt';
  return PRESETS[name] ? name : 'top';
}
const PHI_MIN = 0.0002, PHI_MAX = D(72), ZOOM_MIN = 0.5, ZOOM_MAX = 1.5;

export class CameraRig {
  constructor(camera, { fitHalf = 4.18, fitHeight = 0.55 } = {}) {
    this.camera = camera;
    this.fitHalf = fitHalf; this.fitHeight = fitHeight;
    this.baseTheta = 0;                     // 0 = white at bottom, PI = black
    this.presetName = 'top';
    this.locked = true;
    this.goal = { phi: PRESETS.top.phi, theta: 0, zoom: 1 };
    this.cur = { ...this.goal };
    this.focusState = { f: 0, point: new THREE.Vector3(), zoom: 1, tilt: 0 };
    this.shakeAmp = 0; this.shakeT = 0; this.shakeMs = 1;
    this.autoRotate = 0;
    this.stiff = 10;                        // easing rate (1/s)
    this._fitCache = new Map();
    this._tmpCam = new THREE.PerspectiveCamera();
    this.moving = true;
  }
  setOrientation(color) { this.baseTheta = color === 'b' ? Math.PI : 0; this.moving = true; }
  preset(name) {
    this.presetName = normalizeView(name);
    const p = PRESETS[this.presetName];
    this.locked = p.locked;
    this.goal.phi = p.phi; this.goal.zoom = p.zoom;
    // shortest way back to the player's side
    this.goal.theta = Math.round(this.cur.theta / (Math.PI * 2)) * Math.PI * 2;
    this.stiff = 7; this.moving = true;
  }
  reset() { this.preset(this.presetName); }
  /** Orbit by deltas in radians (dTheta around, dPhi tilt). */
  setLocked(on) { if (on) this.reset(); this.locked = !!on; this.moving = true; }
  orbit(dTheta, dPhi, immediate = false) {
    if (this.locked) return;
    this.goal.theta += dTheta;
    this.goal.phi = THREE.MathUtils.clamp(this.goal.phi + dPhi, PHI_MIN, PHI_MAX);
    if (immediate) { this.cur.theta = this.goal.theta; this.cur.phi = this.goal.phi; }
    this.stiff = 16; this.moving = true;
  }
  zoomBy(f) {
    if (this.locked) return;
    this.goal.zoom = THREE.MathUtils.clamp(this.goal.zoom * f, ZOOM_MIN, ZOOM_MAX);
    this.stiff = 14; this.moving = true;
  }
  setZoom(z) { if (this.locked) return; this.goal.zoom = THREE.MathUtils.clamp(z, ZOOM_MIN, ZOOM_MAX); this.stiff = 14; this.moving = true; }
  shake(amp, ms) { this.shakeAmp = Math.max(this.shakeAmp * (1 - this.shakeT / this.shakeMs), amp); this.shakeT = 0; this.shakeMs = Math.max(30, ms); this.moving = true; }

  /** Fit distance so the board (±fitHalf) fills the viewport at this angle. */
  fitRadius(phi, theta) {
    const cam = this.camera, aspect = cam.aspect;
    const key = `${phi.toFixed(3)}|${(((theta % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)).toFixed(3)}|${aspect.toFixed(3)}|${cam.fov}`;
    const hit = this._fitCache.get(key); if (hit) return hit;
    const t = this._tmpCam; t.fov = cam.fov; t.aspect = aspect; t.near = 0.1; t.far = 500; t.updateProjectionMatrix();
    const h = this.fitHalf, pts = [];
    for (const x of [-h, h]) for (const z of [-h, h]) { pts.push(new THREE.Vector3(x, 0, z)); pts.push(new THREE.Vector3(x, this.fitHeight, z)); }
    let lo = 2, hi = 200; const p = new THREE.Vector3();
    for (let i = 0; i < 26; i++) {
      const R = (lo + hi) / 2;
      this._place(t, phi, theta, R, new THREE.Vector3());
      t.updateMatrixWorld(); t.matrixWorldInverse.copy(t.matrixWorld).invert();
      let ok = true;
      for (const q of pts) { p.copy(q).project(t); if (Math.abs(p.x) > 1 || Math.abs(p.y) > 1 || p.z > 1) { ok = false; break; } }
      if (ok) hi = R; else lo = R;
    }
    if (this._fitCache.size > 400) this._fitCache.clear();
    this._fitCache.set(key, hi);
    return hi;
  }
  _place(cam, phi, theta, R, target) {
    const sp = Math.sin(phi), cp = Math.cos(phi), st = Math.sin(theta), ct = Math.cos(theta);
    cam.position.set(target.x + R * sp * st, target.y + R * cp, target.z + R * sp * ct);
    cam.up.set(-st * cp, sp, -ct * cp);
    cam.lookAt(target);
  }
  /** Advance easing; returns true while anything is still moving. */
  update(dtMs) {
    const dt = Math.min(dtMs, 50) / 1000;
    if (this.autoRotate) { this.goal.theta += this.autoRotate * dt; }
    const k = 1 - Math.exp(-this.stiff * dt);
    const c = this.cur, g = this.goal;
    c.phi += (g.phi - c.phi) * k; c.theta += (g.theta - c.theta) * k; c.zoom += (g.zoom - c.zoom) * k;
    const settled = Math.abs(g.phi - c.phi) < 1e-4 && Math.abs(g.theta - c.theta) < 1e-4 && Math.abs(g.zoom - c.zoom) < 1e-4;
    if (settled) { c.phi = g.phi; c.theta = g.theta; c.zoom = g.zoom; }
    const f = this.focusState;
    const phi = THREE.MathUtils.clamp(c.phi + f.tilt * f.f, PHI_MIN, PHI_MAX);
    const theta = this.baseTheta + c.theta;
    const R = this.fitRadius(phi, theta) * c.zoom * (1 + (f.zoom - 1) * f.f);
    const target = new THREE.Vector3().copy(f.point).multiplyScalar(f.f);
    this._place(this.camera, phi, theta, R, target);
    let shaking = false;
    if (this.shakeAmp > 0) {
      this.shakeT += dtMs;
      const left = 1 - this.shakeT / this.shakeMs;
      if (left <= 0) this.shakeAmp = 0;
      else {
        shaking = true;
        const a = this.shakeAmp * left * left, t = performance.now() / 1000;
        const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
        const up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1);
        this.camera.position.addScaledVector(right, a * Math.sin(t * 71)).addScaledVector(up, a * Math.sin(t * 53 + 1.3));
      }
    }
    this.camera.updateMatrixWorld();
    this.moving = !settled || shaking || !!this.autoRotate;
    return this.moving;
  }
  get state() { return { phi: this.cur.phi, theta: this.cur.theta, zoom: this.cur.zoom, preset: this.presetName, locked: this.locked }; }
}
