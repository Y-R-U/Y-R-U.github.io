// Input + camera: tap to move, one-finger drag orbits, pinch/wheel zooms,
// WASD/arrows for desktop. Camera follows the player (or a debug-focus target).

import * as THREE from 'three';
import { CFG } from './config.js';
import { clamp, damp } from './utils.js';

export function createControls({ camera, dom, player, ground, attackables, onTap }) {
  const st = {
    yaw: CFG.camYaw, pitch: CFG.camPitch, dist: CFG.camDist,
    focusObj: null,
    lookAt: new THREE.Vector3(player.pos.x, player.pos.y + 1.1, player.pos.z),
    smoothDist: CFG.camDist,
  };

  const keys = new Set();
  window.addEventListener('keydown', e => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
    keys.add(e.key.toLowerCase());
  });
  window.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));

  const raycaster = new THREE.Raycaster();
  // Returns { chicken } when a tap hits an attackable, else { point } on the ground.
  function raycastTap(cx, cy) {
    const ndc = new THREE.Vector2(
      (cx / window.innerWidth) * 2 - 1,
      -(cy / window.innerHeight) * 2 + 1
    );
    raycaster.setFromCamera(ndc, camera);
    const targets = attackables ? attackables() : [];
    const hitT = raycaster.intersectObjects(targets, true)[0];
    if (hitT) {
      let o = hitT.object;
      while (o && !o.userData.chicken) o = o.parent;
      if (o) return { chicken: o.userData.chicken };
    }
    const hit = raycaster.intersectObject(ground, false)[0];
    if (!hit) return null;
    const p = hit.point;
    const r = Math.hypot(p.x, p.z), maxR = CFG.playRadius - 0.8;
    if (r > maxR) { p.x *= maxR / r; p.z *= maxR / r; }
    return { point: p };
  }

  // ── pointers ──
  const pointers = new Map();
  let dragging = false, downAt = 0, pinchStart = 0, distStart = 0;

  dom.addEventListener('pointerdown', e => {
    try { dom.setPointerCapture(e.pointerId); } catch { /* synthetic pointers */ }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY });
    if (pointers.size === 1) { dragging = false; downAt = performance.now(); }
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchStart = Math.hypot(a.x - b.x, a.y - b.y);
      distStart = st.dist;
    }
  });

  dom.addEventListener('pointermove', e => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (pointers.size === 1) {
      if (!dragging && Math.hypot(e.clientX - p.sx, e.clientY - p.sy) > 10) dragging = true;
      if (dragging) {
        st.yaw -= dx * 0.0045;
        st.pitch = clamp(st.pitch + dy * 0.0035, CFG.camPitchMin, CFG.camPitchMax);
      }
    } else if (pointers.size === 2 && pinchStart > 0) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      st.dist = clamp(distStart * (pinchStart / Math.max(d, 1)), CFG.camDistMin, CFG.camDistMax);
    }
  });

  const endPointer = e => {
    const wasSingle = pointers.size === 1;
    pointers.delete(e.pointerId);
    if (wasSingle && !dragging && performance.now() - downAt < 450) {
      const res = raycastTap(e.clientX, e.clientY);
      if (res) { st.focusObj = null; onTap(res.point || null, res.chicken || null); }
    }
    if (pointers.size < 2) pinchStart = 0;
  };
  dom.addEventListener('pointerup', endPointer);
  dom.addEventListener('pointercancel', e => pointers.delete(e.pointerId));

  dom.addEventListener('wheel', e => {
    e.preventDefault();
    st.dist = clamp(st.dist * (1 + e.deltaY * 0.001), CFG.camDistMin, CFG.camDistMax);
  }, { passive: false });

  const tmp = new THREE.Vector3();

  return {
    state: st,
    _raycastTap: raycastTap, // test hook
    focus(obj) { st.focusObj = obj; },
    clearFocus() { st.focusObj = null; },

    // camera-relative movement from WASD/arrows, or null
    keyDir() {
      let fx = 0, fz = 0;
      if (keys.has('w') || keys.has('arrowup')) fz += 1;
      if (keys.has('s') || keys.has('arrowdown')) fz -= 1;
      if (keys.has('a') || keys.has('arrowleft')) fx -= 1;
      if (keys.has('d') || keys.has('arrowright')) fx += 1;
      if (!fx && !fz) return null;
      const fwd = new THREE.Vector2(-Math.sin(st.yaw), -Math.cos(st.yaw));
      const right = new THREE.Vector2(-fwd.y, fwd.x);
      return new THREE.Vector2(fwd.x * fz + right.x * fx, fwd.y * fz + right.y * fx).normalize();
    },

    tick(dt) {
      if (st.focusObj) {
        st.focusObj.getWorldPosition(tmp);
        tmp.y += 0.8;
      } else {
        tmp.set(player.pos.x, player.pos.y + 1.1, player.pos.z);
      }
      st.lookAt.lerp(tmp, damp(8, dt));
      st.smoothDist = THREE.MathUtils.lerp(st.smoothDist, st.focusObj ? Math.min(st.dist, 9) : st.dist, damp(6, dt));
      const cp = Math.cos(st.pitch), spD = st.smoothDist;
      camera.position.set(
        st.lookAt.x + Math.sin(st.yaw) * cp * spD,
        st.lookAt.y + Math.sin(st.pitch) * spD,
        st.lookAt.z + Math.cos(st.yaw) * cp * spD
      );
      camera.lookAt(st.lookAt);
    },
  };
}
