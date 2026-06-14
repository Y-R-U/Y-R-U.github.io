// Orbit/zoom diorama camera, tap-to-move (raycast onto the floor plane), and
// camera-relative WASD nudging.
import * as THREE from 'three';

export class Controls {
  constructor(dom, camera, game) {
    this.dom = dom; this.camera = camera; this.game = game;
    this.yaw = 0.0;
    this.pitch = 0.98;            // radians from horizontal; higher = more top-down
    this.dist = 30;
    this.target = new THREE.Vector3(0, 0.4, 1.0);
    this.keys = new Set();
    this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.ray = new THREE.Raycaster();
    this.pointers = new Map();
    this.pinchD = 0;
    this.down = null;

    dom.style.touchAction = 'none';
    dom.addEventListener('pointerdown', e => this._onDown(e));
    dom.addEventListener('pointermove', e => this._onMove(e));
    dom.addEventListener('pointerup', e => this._onUp(e));
    dom.addEventListener('pointercancel', e => this._onUp(e));
    dom.addEventListener('wheel', e => { e.preventDefault(); this._zoom(this.dist * (1 + e.deltaY * 0.001)); }, { passive: false });

    addEventListener('keydown', e => {
      const k = e.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
      this.keys.add(k);
    });
    addEventListener('keyup', e => this.keys.delete(e.key.toLowerCase()));
    addEventListener('blur', () => this.keys.clear());
  }

  _onDown(e) {
    this.dom.setPointerCapture?.(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 1) this.down = { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 };
    else if (this.pointers.size === 2) { this.pinchD = this._twoDist(); this.down = null; }
  }
  _onMove(e) {
    const p = this.pointers.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (this.pointers.size === 2) {
      const d = this._twoDist();
      if (this.pinchD) this._zoom(this.dist * (this.pinchD / d));
      this.pinchD = d;
      return;
    }
    if (this.down) {
      this.down.moved += Math.abs(dx) + Math.abs(dy);
      this.yaw -= dx * 0.006;
      this.pitch = THREE.MathUtils.clamp(this.pitch + dy * 0.005, 0.55, 1.4);
    }
  }
  _onUp(e) {
    const wasTap = this.down && this.pointers.size === 1 && this.down.moved < 8 && (performance.now() - this.down.t) < 500;
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinchD = 0;
    if (wasTap) this._tap(e.clientX, e.clientY);
    this.down = null;
  }
  _twoDist() { const [a, b] = [...this.pointers.values()]; return Math.hypot(a.x - b.x, a.y - b.y); }
  _zoom(d) { this.dist = THREE.MathUtils.clamp(d, 14, 46); }

  _tap(cx, cy) {
    const r = this.dom.getBoundingClientRect();
    const ndc = new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    if (this.ray.ray.intersectPlane(this.plane, hit)) this.game.handleTap(hit.x, hit.z);
  }

  keyDir() {
    let f = 0, s = 0;
    const k = this.keys;
    if (k.has('w') || k.has('arrowup')) f += 1;
    if (k.has('s') || k.has('arrowdown')) f -= 1;
    if (k.has('d') || k.has('arrowright')) s += 1;
    if (k.has('a') || k.has('arrowleft')) s -= 1;
    if (!f && !s) return { x: 0, z: 0 };
    // camera-relative: forward points from camera toward target on the ground
    const fwd = { x: -Math.sin(this.yaw), z: -Math.cos(this.yaw) };
    const right = { x: Math.cos(this.yaw), z: -Math.sin(this.yaw) };
    let x = fwd.x * f + right.x * s, z = fwd.z * f + right.z * s;
    const d = Math.hypot(x, z) || 1;
    return { x: x / d, z: z / d };
  }

  updateCamera() {
    const t = this.target, d = this.dist, p = this.pitch, y = this.yaw;
    this.camera.position.set(
      t.x + d * Math.cos(p) * Math.sin(y),
      t.y + d * Math.sin(p),
      t.z + d * Math.cos(p) * Math.cos(y),
    );
    this.camera.lookAt(t);
  }
}
