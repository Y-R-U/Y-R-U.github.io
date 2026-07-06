// LASTWALL — input (WASD / floating touch joystick + 2-finger orbit-zoom) and
// the chase camera that follows the player's direction of travel.
import * as THREE from 'three';
import { CFG } from './config.js';
import { clamp, damp, angLerp, TAU } from './utils.js';

export function makeControls(camera, dom, cb) {
  const keys = {};
  let joyId = -1, joyBase = null, joyVec = { x: 0, y: 0 };
  let orbId = -1, orbLast = 0, pinchD = 0;
  let orbit = 0, zoom = 1;
  let camYaw = 0; // 0 → camera sits south (+Z) of the player, looking north
  let mouseDown = false, mouseLastX = 0;

  const elBase = document.getElementById('joy-base'), elNub = document.getElementById('joy-nub');

  addEventListener('keydown', e => {
    if (e.repeat) return;
    keys[e.code] = true;
    if (e.code === 'Escape' || e.code === 'KeyP') cb.pause?.();
    if (e.code === 'Space') cb.superFire?.();
    if (e.code === 'KeyQ') cb.dropTemp?.();
    cb.anyKey?.(e.code);
  });
  addEventListener('keyup', e => keys[e.code] = false);

  dom.addEventListener('pointerdown', e => {
    cb.anyKey?.('pointer');
    if (e.pointerType === 'mouse') {
      if (e.button === 2 || e.button === 0) { mouseDown = true; mouseLastX = e.clientX; }
      return;
    }
    if (joyId === -1) {
      joyId = e.pointerId; joyBase = { x: e.clientX, y: e.clientY }; joyVec = { x: 0, y: 0 };
      elBase.style.display = elNub.style.display = 'block';
      elBase.style.left = (e.clientX - 55) + 'px'; elBase.style.top = (e.clientY - 55) + 'px';
      elNub.style.left = (e.clientX - 23) + 'px'; elNub.style.top = (e.clientY - 23) + 'px';
    } else if (orbId === -1) { orbId = e.pointerId; orbLast = e.clientX; pinchD = 0; }
  });
  dom.addEventListener('pointermove', e => {
    if (e.pointerType === 'mouse') {
      if (mouseDown) { orbit -= (e.clientX - mouseLastX) * 0.006; mouseLastX = e.clientX; }
      return;
    }
    if (e.pointerId === joyId) {
      const dx = e.clientX - joyBase.x, dy = e.clientY - joyBase.y;
      const d = Math.hypot(dx, dy), max = 52;
      const k = d > max ? max / d : 1;
      joyVec = { x: dx * k / max, y: dy * k / max };
      elNub.style.left = (joyBase.x + dx * k - 23) + 'px'; elNub.style.top = (joyBase.y + dy * k - 23) + 'px';
    } else if (e.pointerId === orbId) {
      orbit -= (e.clientX - orbLast) * 0.008; orbLast = e.clientX;
    }
  });
  const upTouch = e => {
    if (e.pointerId === joyId) { joyId = -1; joyVec = { x: 0, y: 0 }; elBase.style.display = elNub.style.display = 'none'; }
    if (e.pointerId === orbId) orbId = -1;
    if (e.pointerType === 'mouse') mouseDown = false;
  };
  dom.addEventListener('pointerup', upTouch); dom.addEventListener('pointercancel', upTouch);
  dom.addEventListener('contextmenu', e => e.preventDefault());
  addEventListener('wheel', e => { zoom = clamp(zoom + e.deltaY * 0.0009, 0.6, 1.7); }, { passive: true });

  const fwd = new THREE.Vector3();
  let latch = null; // { la: local stick angle, wx, wz: unit world dir }
  return {
    get camYaw() { return camYaw; },
    // camera-relative desired move (unit dir + mag), sprint bool.
    // The world direction LATCHES while the stick is held steady: the camera
    // realigning behind you must not rotate your input mid-stride (holding
    // right would spiral). Only re-read the camera frame when you steer >~23°.
    read() {
      let x = 0, z = 0;
      if (keys.KeyW || keys.ArrowUp) z -= 1;
      if (keys.KeyS || keys.ArrowDown) z += 1;
      if (keys.KeyA || keys.ArrowLeft) x -= 1;
      if (keys.KeyD || keys.ArrowRight) x += 1;
      const kl = Math.hypot(x, z); if (kl > 1) { x /= kl; z /= kl; }
      if (joyId !== -1) { x = joyVec.x; z = joyVec.y; }
      const mag = clamp(Math.hypot(x, z), 0, 1);
      if (mag < 0.05) { latch = null; return { x: 0, z: 0, mag: 0, sprint: false }; }
      const la = Math.atan2(x, z);
      let steer = true;
      if (latch) {
        let d = (la - latch.la) % TAU;
        if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU;
        steer = Math.abs(d) > 0.4;
      }
      if (steer) {
        // rotate into world by CURRENT camera yaw. Camera sits at +(sinθ,cosθ)·d,
        // so screen-up (z=-1) → world (-sinθ,-cosθ), screen-right (x=1) → (cosθ,-sinθ).
        const sin = Math.sin(camYaw), cos = Math.cos(camYaw);
        const ux = x / mag, uz = z / mag;
        latch = { la, wx: ux * cos + uz * sin, wz: -ux * sin + uz * cos };
      }
      return { x: latch.wx, z: latch.wz, mag, sprint: !!keys.ShiftLeft || !!keys.ShiftRight || mag > 0.96 };
    },
    updateCamera(dt, px, pz, vx, vz, speed) {
      // camera yaw chases travel direction (+ manual orbit offset that decays),
      // but NOT when running toward the camera — backing up must not whip the view
      if (speed > 1.2) {
        const travel = Math.atan2(vx, vz) + Math.PI; // camera behind motion
        let diff = (travel + orbit - camYaw) % (Math.PI * 2);
        if (diff > Math.PI) diff -= Math.PI * 2; if (diff < -Math.PI) diff += Math.PI * 2;
        if (Math.abs(diff) < 1.95) camYaw = angLerp(camYaw, travel + orbit, 1 - Math.exp(-1.5 * dt));
      } else {
        camYaw = angLerp(camYaw, camYaw + orbit, 1 - Math.exp(-2 * dt));
      }
      orbit = damp(orbit, 0, CFG.cam.orbitDecay, dt);
      const C = CFG.cam, d = C.dist * zoom, h = C.height * zoom;
      const cx = px + Math.sin(camYaw) * d, cz = pz + Math.cos(camYaw) * d;
      camera.position.x = damp(camera.position.x, cx, C.lerp, dt);
      camera.position.z = damp(camera.position.z, cz, C.lerp, dt);
      camera.position.y = damp(camera.position.y, CFG.wallH + h, C.lerp, dt);
      fwd.set(px - Math.sin(camYaw) * C.lookAhead, CFG.wallH + 1.2, pz - Math.cos(camYaw) * C.lookAhead);
      camera.lookAt(fwd);
    },
    snap(px, pz, yaw = 0) {
      camYaw = yaw; orbit = 0;
      camera.position.set(px + Math.sin(camYaw) * CFG.cam.dist, CFG.wallH + CFG.cam.height, pz + Math.cos(camYaw) * CFG.cam.dist);
      camera.lookAt(px, CFG.wallH + 1.2, pz);
    },
  };
}
