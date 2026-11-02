// Chase camera: behind and above the ball, looking down the fairway (like the refs).
// yaw = horizontal view heading; the rig eases toward a goal heading and the ball position.
import * as THREE from 'three';

const TAU = Math.PI * 2;
// Landscape framing (D13). pitch: added to the chase pitch (negative = flatter); dist: distance
// multiplier; shift: lens shift as a fraction of the view height (see applyShift).
export const LAND = { pitch: -0.12, dist: 1.05, shift: 0.12 };
const wrap = a => { a = (a + Math.PI) % TAU; return a < 0 ? a + Math.PI : a - Math.PI; };

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.yaw = 0; this.goalYaw = 0;          // heading: 0 looks toward -Z
    this.pitch = 0.62; this.basePitch = 0.62;
    this.zoom = 1;                          // multiplies distance; pinch / wheel
    this.dist = 2.5;
    this.lookYaw = 0; this.lookPitch = 0;   // user look-around offsets
    this.target = new THREE.Vector3();
    this.focus = new THREE.Vector3();       // smoothed ball position
    this.mode = 'follow';                   // follow | orbit (title screen)
    this.orbitT = 0;
    this._v = new THREE.Vector3();
  }
  snap(ball, yaw) {
    this.focus.copy(ball); this.yaw = this.goalYaw = yaw; this.lookYaw = this.lookPitch = 0;
  }
  setGoalYaw(y) { this.goalYaw = y; }
  forward(out = new THREE.Vector3()) { const y = this.yaw + this.lookYaw; return out.set(Math.sin(y), 0, -Math.cos(y)); }
  right(out = new THREE.Vector3()) { const y = this.yaw + this.lookYaw; return out.set(Math.cos(y), 0, Math.sin(y)); }

  // Landscape lens shift: slide the view window up (a shift lens, no extra tilt) so the ball sits
  // lower and the tall backdrop pieces (palace, moon, castle, rainbow) clear the top edge.
  applyShift(on) {
    const s = on ? LAND.shift : 0, cam = this.camera;
    if (s === (cam.view?.enabled ? -cam.view.offsetY : 0)) return;
    // setViewOffset sets camera.aspect = fullWidth / fullHeight, so pass the real aspect
    if (s) cam.setViewOffset(cam.aspect, 1, 0, -s, cam.aspect, 1); else cam.clearViewOffset();
  }

  update(dt, ball, { rolling = false, frozen = false, center = null } = {}) {
    if (this.mode === 'orbit' && center) {
      this.applyShift(false);
      this.orbitT += dt * 0.08;
      const r = center.r;
      this.camera.position.set(center.x + Math.sin(this.orbitT) * r, center.y + r * 0.55, center.z + Math.cos(this.orbitT) * r);
      this.camera.lookAt(center.x, center.y - r * 0.05, center.z);
      return;
    }
    const k = 1 - Math.exp(-dt * (rolling ? 5 : 3.5));
    this.focus.lerp(ball, rolling ? 1 - Math.exp(-dt * 9) : k);
    if (!frozen) this.yaw += wrap(this.goalYaw - this.yaw) * (1 - Math.exp(-dt * (rolling ? 1.6 : 3)));
    const yaw = this.yaw + this.lookYaw;
    // D13: landscape frames wider: flatter, a taller FOV (main.js) and a lens shift (LAND), so the tall
    // backdrop pieces clear the top edge (top of frame ~17° above the horizon vs ~4° before)
    const land = this.camera.aspect > 1.05;
    this.applyShift(land);
    const L = LAND;
    const pitch = Math.min(1.35, Math.max(0.2, this.pitch + (land ? L.pitch : 0) + this.lookPitch));
    const d = this.dist * this.zoom * (land ? L.dist : 1);
    const fx = Math.sin(yaw), fz = -Math.cos(yaw);
    // look a little ahead of the ball so it sits in the lower part of the portrait frame
    const ahead = 0.55 * d;
    this.target.set(this.focus.x + fx * ahead, this.focus.y, this.focus.z + fz * ahead);
    const back = Math.cos(pitch) * d, up = Math.sin(pitch) * d;
    this.camera.position.set(this.focus.x - fx * back, this.focus.y + up, this.focus.z - fz * back);
    this.camera.lookAt(this.target);
  }
}

const _ray = new THREE.Raycaster(), _dir = new THREE.Vector3(), _from = new THREE.Vector3();

// Keep the ball visible: if scenery sits between the ball and the camera, pull the camera in
// along that line (eased both ways). `occluders` is a list of Object3Ds (from the hole view).
CameraRig.prototype.avoidOcclusion = function (ball, dt) {
  if (!this.occluders || this.mode !== 'follow') return;
  const cam = this.camera;
  _from.set(ball.x, ball.y + 0.04, ball.z);
  _dir.copy(cam.position).sub(_from);
  const full = _dir.length();
  if (full < 1e-3) return;
  _dir.multiplyScalar(1 / full);
  this._occN = (this._occN || 0) + 1;
  if (this._occN % 2 === 0 || this._occHit === undefined) {   // ray every other frame
    _ray.set(_from, _dir); _ray.near = 0.12; _ray.far = full; _ray.camera = cam;
    let hit = full;
    for (const h of _ray.intersectObjects(this.occluders, true)) {
      const m = h.object.material;
      const o = h.object;
      if (!o.visible || o.isSprite || o.isPoints || o.isLine || (m && (m.transparent || m.depthWrite === false)) || o.userData.noOcclude) continue;
      hit = h.distance; break;
    }
    this._occHit = hit;
  }
  const want = this._occHit < full ? Math.max(0.35, this._occHit - 0.12) : full;
  this._occD = this._occD === undefined ? full : this._occD;
  // pull in fast, ease back out slowly
  this._occD += (want - this._occD) * (1 - Math.exp(-dt * (want < this._occD ? 14 : 2.5)));
  if (this._occD < full - 1e-3) cam.position.copy(_from).addScaledVector(_dir, this._occD);
  else this._occD = full;
};

export { wrap };
