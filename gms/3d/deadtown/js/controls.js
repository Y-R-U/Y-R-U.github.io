// Input + camera. Mobile-first: press one finger anywhere → a floating joystick
// appears there; sliding your thumb moves the character (camera-relative).
// TWO fingers orbit (drag) / zoom (pinch) the camera. Desktop: WASD + Shift to
// run, mouse-wheel to zoom, right-drag to orbit. The camera is an over-the-
// shoulder Diablo/RuneScape follow with a fixed yaw (rotatable) and high tilt.

import * as THREE from 'three';
import { CFG } from './config.js';
import { clamp, damp } from './utils.js';

export function createControls({ camera, dom, player }) {
  const cam = CFG.cam;
  const st = {
    yaw: cam.town.yaw, pitch: cam.town.pitch, dist: cam.town.dist, smoothDist: cam.town.dist,
    lookAt: new THREE.Vector3(player.pos.x, player.pos.y + 1.1, player.pos.z),
  };
  camera.fov = cam.town.fov; camera.updateProjectionMatrix();

  // ── keyboard (desktop) ──
  const keys = new Set();
  addEventListener('keydown', e => { if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(e.key.toLowerCase())) e.preventDefault(); keys.add(e.key.toLowerCase()); });
  addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
  addEventListener('blur', () => keys.clear());

  // ── joystick (one finger) ──
  const joyBase = document.getElementById('joy-base');
  const joyKnob = document.getElementById('joy-knob');
  const JOY_R = 56;                       // px radius of the stick travel
  const joy = { id: null, ox: 0, oy: 0, dx: 0, dy: 0, active: false };
  function showJoy(x, y) {
    joy.ox = x; joy.oy = y; joy.dx = 0; joy.dy = 0; joy.active = true;
    if (joyBase) { joyBase.style.left = x + 'px'; joyBase.style.top = y + 'px'; joyBase.classList.add('on'); }
    if (joyKnob) { joyKnob.style.left = x + 'px'; joyKnob.style.top = y + 'px'; joyKnob.classList.add('on'); }
  }
  function moveJoy(x, y) {
    let dx = x - joy.ox, dy = y - joy.oy;
    const d = Math.hypot(dx, dy);
    if (d > JOY_R) { dx *= JOY_R / d; dy *= JOY_R / d; }
    joy.dx = dx / JOY_R; joy.dy = dy / JOY_R;
    if (joyKnob) { joyKnob.style.left = (joy.ox + dx) + 'px'; joyKnob.style.top = (joy.oy + dy) + 'px'; }
  }
  function hideJoy() {
    joy.active = false; joy.id = null; joy.dx = joy.dy = 0;
    joyBase?.classList.remove('on'); joyKnob?.classList.remove('on');
  }

  // ── pointers: 1 = joystick, 2 = camera orbit/zoom ──
  const pts = new Map();
  let pinch0 = 0, dist0 = 0, orbiting = false;
  dom.addEventListener('pointerdown', e => {
    try { dom.setPointerCapture(e.pointerId); } catch { }
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (e.pointerType === 'mouse' && e.button === 2) { joy.id = null; hideJoy(); orbiting = true; return; }   // right-drag orbit
    if (pts.size === 1) { joy.id = e.pointerId; showJoy(e.clientX, e.clientY); }
    if (pts.size === 2) { hideJoy(); const [a, b] = [...pts.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); dist0 = st.dist; orbiting = true; }
  });
  dom.addEventListener('pointermove', e => {
    const p = pts.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    if (pts.size === 1) {
      if (e.pointerId === joy.id) moveJoy(e.clientX, e.clientY);
      else if (orbiting) { st.yaw -= dx * 0.005; st.pitch = clamp(st.pitch + dy * 0.004, cam.pitchMin, cam.pitchMax); }
    } else if (pts.size === 2) {
      const [a, b] = [...pts.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch0 > 0) st.dist = clamp(dist0 * (pinch0 / Math.max(d, 1)), cam.distMin, cam.distMax);
      st.yaw -= dx * 0.0035; st.pitch = clamp(st.pitch + dy * 0.0028, cam.pitchMin, cam.pitchMax);
    }
  });
  const end = e => {
    pts.delete(e.pointerId);
    if (e.pointerId === joy.id) hideJoy();
    if (pts.size < 2) { pinch0 = 0; if (pts.size === 0) orbiting = false; }
  };
  dom.addEventListener('pointerup', end);
  dom.addEventListener('pointercancel', end);
  dom.addEventListener('contextmenu', e => e.preventDefault());
  dom.addEventListener('wheel', e => { e.preventDefault(); st.dist = clamp(st.dist * (1 + e.deltaY * 0.001), cam.distMin, cam.distMax); }, { passive: false });

  const tmp = new THREE.Vector3();
  return {
    state: st,
    _joy: joy,
    setPreset(name) {
      const c = cam[name]; if (!c) return;
      st.yaw = c.yaw; st.pitch = c.pitch; st.dist = c.dist;
      camera.fov = c.fov; camera.updateProjectionMatrix();
    },
    // instantly recentre on the player (after an area-swap teleport, so the
    // follow camera doesn't swoop across the void between platforms)
    snap() { st.lookAt.set(player.pos.x, player.pos.y + 1.1, player.pos.z); st.smoothDist = st.dist; },
    // camera-relative movement vector (world xz, magnitude 0..1) + run flag
    getMove() {
      let kx = 0, kz = 0;
      if (keys.has('w') || keys.has('arrowup')) kz += 1;
      if (keys.has('s') || keys.has('arrowdown')) kz -= 1;
      if (keys.has('a') || keys.has('arrowleft')) kx -= 1;
      if (keys.has('d') || keys.has('arrowright')) kx += 1;
      const run = keys.has('shift');
      let fwdAmt, rightAmt, mag;
      if (kx || kz) { fwdAmt = kz; rightAmt = kx; mag = 1; }
      else if (joy.active) { fwdAmt = -joy.dy; rightAmt = joy.dx; mag = Math.min(1, Math.hypot(joy.dx, joy.dy)); }
      else return { x: 0, z: 0, run: false };
      const fwd = new THREE.Vector2(-Math.sin(st.yaw), -Math.cos(st.yaw));
      const right = new THREE.Vector2(-fwd.y, fwd.x);
      const vx = fwd.x * fwdAmt + right.x * rightAmt, vz = fwd.y * fwdAmt + right.y * rightAmt;
      const l = Math.hypot(vx, vz) || 1;
      return { x: (vx / l) * mag, z: (vz / l) * mag, run };
    },
    tick(dt) {
      tmp.set(player.pos.x, player.pos.y + 1.1, player.pos.z);
      st.lookAt.lerp(tmp, damp(9, dt));
      st.smoothDist = THREE.MathUtils.lerp(st.smoothDist, st.dist, damp(7, dt));
      const cp = Math.cos(st.pitch), d = st.smoothDist;
      camera.position.set(
        st.lookAt.x + Math.sin(st.yaw) * cp * d,
        st.lookAt.y + Math.sin(st.pitch) * d,
        st.lookAt.z + Math.cos(st.yaw) * cp * d
      );
      camera.lookAt(st.lookAt);
    },
  };
}
