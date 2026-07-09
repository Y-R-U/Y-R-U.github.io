// Input + the fixed isometric follow camera.
// One thumb on the MOVEMENT half of the screen = a floating joystick
// (world-relative: stick direction = desired heading). The other side holds
// the action buttons (enter/exit, fire, nitro) — sides swappable in settings.
// Pinch anywhere zooms. Desktop: WASD/arrows, Space fire, E enter, Shift nitro.

import * as THREE from 'three';
import { CFG } from './config.js';
import { P, saveProfile } from './save.js';
import { clamp, damp } from './utils.js';

export function createControls({ camera, dom, getFocus }) {
  const st = {
    zoom: P().settings.zoom || 1,
    lookAt: new THREE.Vector3(), smoothDist: CFG.cam.dist,
    shakeT: 0, shakeAmt: 0,
  };
  camera.fov = CFG.cam.fov;
  camera.updateProjectionMatrix();

  // ── keyboard ──
  const keys = new Set();
  addEventListener('keydown', e => {
    const k = e.key.toLowerCase();
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
    keys.add(k === ' ' ? 'space' : k);
    if (k === 'e') api.onEnter?.();
  });
  addEventListener('keyup', e => { const k = e.key.toLowerCase(); keys.delete(k === ' ' ? 'space' : k); });
  addEventListener('blur', () => keys.clear());

  // ── joystick (movement half of the screen) ──
  const joyBase = document.getElementById('joy-base');
  const joyKnob = document.getElementById('joy-knob');
  const JOY_R = 54;
  const joy = { id: null, ox: 0, oy: 0, dx: 0, dy: 0, active: false };
  const moveHalf = () => P().settings.side === 'right' ? 'left' : 'right';
  const inMoveHalf = (x) => moveHalf() === 'left' ? x < innerWidth * 0.55 : x > innerWidth * 0.45;

  function showJoy(x, y) {
    joy.ox = x; joy.oy = y; joy.dx = 0; joy.dy = 0; joy.active = true;
    joyBase.style.left = x + 'px'; joyBase.style.top = y + 'px'; joyBase.classList.add('on');
    joyKnob.style.left = x + 'px'; joyKnob.style.top = y + 'px'; joyKnob.classList.add('on');
  }
  function moveJoy(x, y) {
    let dx = x - joy.ox, dy = y - joy.oy;
    const d = Math.hypot(dx, dy);
    if (d > JOY_R) { dx *= JOY_R / d; dy *= JOY_R / d; }
    joy.dx = dx / JOY_R; joy.dy = dy / JOY_R;
    joyKnob.style.left = (joy.ox + dx) + 'px'; joyKnob.style.top = (joy.oy + dy) + 'px';
  }
  function hideJoy() {
    joy.active = false; joy.id = null; joy.dx = joy.dy = 0;
    joyBase.classList.remove('on'); joyKnob.classList.remove('on');
  }

  // ── pointers: joystick + pinch zoom ──
  const pts = new Map();
  let pinch0 = 0, zoom0 = 1;
  dom.addEventListener('pointerdown', e => {
    try { dom.setPointerCapture(e.pointerId); } catch { }
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 1 && inMoveHalf(e.clientX)) { joy.id = e.pointerId; showJoy(e.clientX, e.clientY); }
    if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      pinch0 = Math.hypot(a.x - b.x, a.y - b.y); zoom0 = st.zoom;
    }
  });
  dom.addEventListener('pointermove', e => {
    const p = pts.get(e.pointerId); if (!p) return;
    p.x = e.clientX; p.y = e.clientY;
    if (e.pointerId === joy.id) moveJoy(e.clientX, e.clientY);
    if (pts.size === 2 && pinch0 > 0) {
      const [a, b] = [...pts.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      st.zoom = clamp(zoom0 * (pinch0 / Math.max(d, 1)), CFG.cam.zoomMin, CFG.cam.zoomMax);
    }
  });
  const end = e => {
    pts.delete(e.pointerId);
    if (e.pointerId === joy.id) hideJoy();
    if (pts.size < 2 && pinch0 > 0) {   // pinch ended → remember the zoom
      P().settings.zoom = +st.zoom.toFixed(2); saveProfile();
    }
    if (pts.size < 2) pinch0 = 0;
  };
  dom.addEventListener('pointerup', end);
  dom.addEventListener('pointercancel', end);
  dom.addEventListener('contextmenu', e => e.preventDefault());
  dom.addEventListener('wheel', e => {
    e.preventDefault();
    st.zoom = clamp(st.zoom * (1 + e.deltaY * 0.001), CFG.cam.zoomMin, CFG.cam.zoomMax);
  }, { passive: false });

  const tmp = new THREE.Vector3();
  const api = {
    state: st,
    onEnter: null,          // set by main (E key / enter button)
    // desired world-space direction {x,z,mag} (iso camera is fixed-yaw, so
    // stick-up = away from camera along its yaw)
    getMove() {
      let mx = 0, mz = 0;
      if (keys.has('w') || keys.has('arrowup')) mz += 1;
      if (keys.has('s') || keys.has('arrowdown')) mz -= 1;
      if (keys.has('a') || keys.has('arrowleft')) mx -= 1;
      if (keys.has('d') || keys.has('arrowright')) mx += 1;
      let fwdAmt, rightAmt, mag;
      if (mx || mz) { fwdAmt = mz; rightAmt = mx; mag = 1; }
      else if (joy.active && (joy.dx || joy.dy)) {
        fwdAmt = -joy.dy; rightAmt = joy.dx;
        mag = Math.min(1, Math.hypot(joy.dx, joy.dy));
      } else return { x: 0, z: 0, mag: 0 };
      const yaw = CFG.cam.yaw;
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
      const rx = -fz, rz = fx;
      let vx = fx * fwdAmt + rx * rightAmt, vz = fz * fwdAmt + rz * rightAmt;
      const l = Math.hypot(vx, vz) || 1;
      return { x: vx / l, z: vz / l, mag };
    },
    firing: () => keys.has('space'),
    nitroKey: () => keys.has('shift'),
    shake(amt) { if (P().settings.shake) { st.shakeAmt = Math.max(st.shakeAmt, amt); st.shakeT = 0.35; } },
    setZoom(v) { st.zoom = clamp(v, CFG.cam.zoomMin, CFG.cam.zoomMax); },
    snap() {
      const f = getFocus();
      st.lookAt.set(f.x, 0, f.z);
      st.smoothDist = CFG.cam.dist * st.zoom;
    },
    tick(dt) {
      const f = getFocus();     // {x,z,vx,vz,speedFrac}
      tmp.set(
        f.x + (f.vx || 0) * CFG.cam.lookAhead,
        1.0,
        f.z + (f.vz || 0) * CFG.cam.lookAhead);
      st.lookAt.lerp(tmp, damp(5.5, dt));
      const want = (CFG.cam.dist + (CFG.cam.distFast - CFG.cam.dist) * (f.speedFrac || 0)) * st.zoom;
      st.smoothDist = THREE.MathUtils.lerp(st.smoothDist, want, damp(3, dt));
      const cp = Math.cos(CFG.cam.pitch), d = st.smoothDist;
      let sx = 0, sy = 0;
      if (st.shakeT > 0) {
        st.shakeT -= dt;
        const k = st.shakeAmt * (st.shakeT / 0.35);
        sx = (Math.random() - 0.5) * k; sy = (Math.random() - 0.5) * k;
        if (st.shakeT <= 0) st.shakeAmt = 0;
      }
      camera.position.set(
        st.lookAt.x + Math.sin(CFG.cam.yaw) * cp * d + sx,
        st.lookAt.y + Math.sin(CFG.cam.pitch) * d + sy,
        st.lookAt.z + Math.cos(CFG.cam.yaw) * cp * d);
      camera.lookAt(st.lookAt.x + sx * 0.5, st.lookAt.y, st.lookAt.z + sy * 0.5);
    },
  };
  return api;
}
