// Slingshot aim (D8): drag anywhere, back and away from where you touched. The ball goes the
// opposite way to the drag; power = drag length (capped). A small cancel zone near the start point.
// Also owns pinch / wheel zoom and one-finger look-around (when not aiming or in look mode).
import * as THREE from 'three';
import { shotSpeed, BALL_R } from '../engine/constants.js';
import { traceGuide } from '../engine/sim.js';

const CANCEL_PX = 24;

export class AimInput {
  // opts: { el, rig, canReady(): bool, getBall(): Ball, world, onShoot(vx, vz, power), onAimChange(state) }
  constructor(opts) {
    Object.assign(this, opts);
    this.pointers = new Map();
    this.mode = null;            // aim | look | pinch
    this.lookMode = false;       // toggle: one finger looks around even when the ball is ready
    this.guideLevel = 0;         // Long Sight stacks (0 = base: short line, no bounce)
    this.aim = { active: false, power: 0, cancel: true, dir: new THREE.Vector3(0, 0, -1) };
    this._down = this._down.bind(this); this._move = this._move.bind(this); this._up = this._up.bind(this); this._wheel = this._wheel.bind(this);
    const el = this.el;
    el.addEventListener('pointerdown', this._down);
    el.addEventListener('pointermove', this._move);
    el.addEventListener('pointerup', this._up);
    el.addEventListener('pointercancel', this._up);
    el.addEventListener('wheel', this._wheel, { passive: false });
    this.guide = new GuideLine();
  }
  dispose() {
    const el = this.el;
    el.removeEventListener('pointerdown', this._down); el.removeEventListener('pointermove', this._move);
    el.removeEventListener('pointerup', this._up); el.removeEventListener('pointercancel', this._up);
    el.removeEventListener('wheel', this._wheel);
    this.guide.dispose();
  }
  maxDrag() { return Math.min(innerWidth, innerHeight) * 0.5; }

  _down(e) {
    this.el.setPointerCapture?.(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY });
    if (this.pointers.size === 2) {
      if (this.mode === 'aim') this._endAim(true);
      const [a, b] = [...this.pointers.values()];
      this.mode = 'pinch'; this.pinch0 = Math.hypot(a.x - b.x, a.y - b.y); this.zoom0 = this.rig.zoom;
      return;
    }
    if (this.pointers.size > 2) return;
    if (!this.lookMode && this.canReady()) {
      this.mode = 'aim';
      this.aim.active = true; this.aim.power = 0; this.aim.cancel = true;
      this._yaw0 = this.rig.yaw + this.rig.lookYaw;
      this.onAimChange?.(this.aim);
    } else {
      this.mode = 'look'; this.look0 = { yaw: this.rig.lookYaw, pitch: this.rig.lookPitch };
    }
  }
  _move(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    p.x = e.clientX; p.y = e.clientY;
    if (this.mode === 'pinch' && this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      this.rig.zoom = clampZoom(this.zoom0 * this.pinch0 / Math.max(10, d));
    } else if (this.mode === 'look') {
      const dx = p.x - p.x0, dy = p.y - p.y0;
      this.rig.lookYaw = this.look0.yaw - dx * 0.006;
      this.rig.lookPitch = Math.max(-0.4, Math.min(0.7, this.look0.pitch + dy * 0.004));
    } else if (this.mode === 'aim') {
      this._updateAim(p);
    }
  }
  _up(e) {
    const p = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);
    if (!p) return;
    if (this.mode === 'aim') { this._updateAim(p); this._endAim(false); }
    if (this.pointers.size === 0) this.mode = null;
    else if (this.mode === 'pinch' && this.pointers.size === 1) this.mode = null;
  }
  _wheel(e) {
    e.preventDefault();
    this.rig.zoom = clampZoom(this.rig.zoom * Math.exp(e.deltaY * 0.0012));
  }

  _updateAim(p) {
    const dx = p.x - p.x0, dy = p.y - p.y0;
    const len = Math.hypot(dx, dy);
    const a = this.aim;
    a.cancel = len < CANCEL_PX;
    a.power = a.cancel ? 0 : Math.min(1, (len - CANCEL_PX) / (this.maxDrag() - CANCEL_PX));
    if (len > 2) {
      // screen drag (dx right, dy down) → world aim: pull down = shoot forward, pull right = shoot left
      const y = this._yaw0;
      const fx = Math.sin(y), fz = -Math.cos(y), rx = Math.cos(y), rz = Math.sin(y);
      a.dir.set(fx * dy - rx * dx, 0, fz * dy - rz * dx).normalize();
    }
    this.onAimChange?.(a);
  }
  _endAim(cancelled) {
    const a = this.aim;
    a.active = false;
    this.mode = cancelled ? 'pinch' : null;
    if (!cancelled && !a.cancel && a.power > 0) {
      const sp = shotSpeed(a.power);
      this.onShoot(a.dir.x * sp, a.dir.z * sp, a.power);
    }
    a.power = 0;
    this.onAimChange?.(a);
  }

  // Guide line for the current aim (runs the real sim forward).
  updateGuide(scene, worldTime) {
    const a = this.aim;
    if (!a.active || a.cancel || a.power <= 0) { this.guide.hide(); return; }
    const b = this.getBall();
    const sp = shotSpeed(a.power);
    const lv = this.guideLevel;
    const g = traceGuide(this.world, b, a.dir.x * sp, a.dir.z * sp, { len: 0.9 + 1.1 * lv, maxBounces: lv, t0: worldTime });
    this.guide.show(scene, g.pts, a.power);
  }
}

const clampZoom = z => Math.max(0.55, Math.min(2.8, z));

// Chevron ribbon on the ground, fading out at the tip.
class GuideLine {
  constructor() {
    const MAX = 160;
    this.max = MAX;
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(MAX * 2 * 3);
    this.uv = new Float32Array(MAX * 2 * 2);
    const idx = [];
    for (let i = 0; i < MAX - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    geo.setIndex(idx);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('uv', new THREE.BufferAttribute(this.uv, 2).setUsage(THREE.DynamicDrawUsage));
    this.geo = geo;
    this.tex = chevronTexture();
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { map: { value: this.tex }, uTime: { value: 0 }, uColor: { value: new THREE.Color(0x8af0ff) } },
      vertexShader: `attribute float fade; varying vec2 vUv; varying float vFade;
        void main(){ vUv = uv; vFade = fade; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform sampler2D map; uniform float uTime; uniform vec3 uColor; varying vec2 vUv; varying float vFade;
        void main(){ float a = texture2D(map, vec2(vUv.x, fract(vUv.y - uTime * 1.6))).a;
          gl_FragColor = vec4(uColor * (0.75 + 0.5 * a), (0.18 + 0.82 * a) * vFade); }`,
    });
    this.fade = new Float32Array(MAX * 2);
    geo.setAttribute('fade', new THREE.BufferAttribute(this.fade, 1).setUsage(THREE.DynamicDrawUsage));
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.mesh.visible = false;
  }
  hide() { this.mesh.visible = false; }
  show(scene, pts, power) {
    if (this.mesh.parent !== scene) scene.add(this.mesh);
    this.mat.uniforms.uTime.value = performance.now() / 1000;
    const c = this.mat.uniforms.uColor.value;
    c.setHSL(0.52 - 0.5 * power * power * 0.55, 0.9, 0.62);
    const n = Math.min(pts.length, this.max);
    if (n < 2) { this.hide(); return; }
    let total = 0;
    const cum = [0];
    for (let i = 1; i < n; i++) { total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][2] - pts[i - 1][2], pts[i][1] - pts[i - 1][1]); cum.push(total); }
    const W = 0.075;
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      let dx = b[0] - a[0], dz = b[2] - a[2]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      const sx = -dz * W, sz = dx * W;
      const p = pts[i], y = p[1] - BALL_R + 0.008;
      const k = i * 6;
      this.pos[k] = p[0] + sx; this.pos[k + 1] = y; this.pos[k + 2] = p[2] + sz;
      this.pos[k + 3] = p[0] - sx; this.pos[k + 4] = y; this.pos[k + 5] = p[2] - sz;
      const v = cum[i] / 0.16;
      this.uv[i * 4] = 0; this.uv[i * 4 + 1] = v; this.uv[i * 4 + 2] = 1; this.uv[i * 4 + 3] = v;
      const t = cum[i] / Math.max(1e-6, total);
      const f = Math.min(1, cum[i] / 0.12) * (1 - Math.max(0, (t - 0.6) / 0.4));
      this.fade[i * 2] = this.fade[i * 2 + 1] = f;
    }
    this.geo.setDrawRange(0, (n - 1) * 6);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.uv.needsUpdate = true;
    this.geo.attributes.fade.needsUpdate = true;
    this.mesh.visible = true;
  }
  dispose() { this.mesh.parent?.remove(this.mesh); this.geo.dispose(); this.mat.dispose(); this.tex.dispose(); }
}

function chevronTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 64, 64);
  g.strokeStyle = '#fff'; g.lineWidth = 11; g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath(); g.moveTo(10, 44); g.lineTo(32, 22); g.lineTo(54, 44); g.stroke();   // ^ points along +v
  const t = new THREE.CanvasTexture(c);
  t.wrapT = THREE.RepeatWrapping;
  return t;
}
