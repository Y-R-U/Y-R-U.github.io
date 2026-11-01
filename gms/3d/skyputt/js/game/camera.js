// Chase camera: behind and above the ball, looking down the fairway (like the refs).
// yaw = horizontal view heading; the rig eases toward a goal heading and the ball position.
import * as THREE from 'three';

const TAU = Math.PI * 2;
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

  update(dt, ball, { rolling = false, frozen = false, center = null } = {}) {
    if (this.mode === 'orbit' && center) {
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
    // D13: landscape (desktop) frames wider — a little higher and further back, looking further ahead
    const land = this.camera.aspect > 1.05;
    const pitch = Math.min(1.35, Math.max(0.2, this.pitch + (land ? 0.08 : 0) + this.lookPitch));
    const d = this.dist * this.zoom * (land ? 1.3 : 1);
    const fx = Math.sin(yaw), fz = -Math.cos(yaw);
    // look a little ahead of the ball so it sits in the lower part of the portrait frame
    const ahead = 0.55 * d;
    this.target.set(this.focus.x + fx * ahead, this.focus.y, this.focus.z + fz * ahead);
    const back = Math.cos(pitch) * d, up = Math.sin(pitch) * d;
    this.camera.position.set(this.focus.x - fx * back, this.focus.y + up, this.focus.z - fz * back);
    this.camera.lookAt(this.target);
  }
}

export { wrap };
