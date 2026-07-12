// Input + camera. Tap ground to move, tap a creature to attack it, one-finger
// drag orbits, pinch/wheel zoom, WASD/arrows + Shift to run. Camera follows the
// player over the shoulder.

import * as THREE from 'three';
import { CFG } from './config.js';
import { clamp, damp } from './utils.js';

export function createControls({ camera, dom, player, getGround, attackables, interactTargets, onTapGround, onTapCreature, onTapInteract, clampPoint }) {
  const st = {
    yaw: CFG.camYaw, pitch: CFG.camPitch, dist: CFG.camDist,
    lookAt: new THREE.Vector3(player.pos.x, player.pos.y + 1.1, player.pos.z),
    smoothDist: CFG.camDist,
  };

  const keys = new Set();
  window.addEventListener('keydown', e => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault();
    keys.add(e.key.toLowerCase());
  });
  window.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
  window.addEventListener('blur', () => keys.clear());

  const raycaster = new THREE.Raycaster();
  function raycastTap(cx, cy) {
    const ndc = new THREE.Vector2((cx / innerWidth) * 2 - 1, -(cy / innerHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const targets = attackables ? attackables() : [];
    const hitC = raycaster.intersectObjects(targets, true)[0];
    if (hitC) { let o = hitC.object; while (o && !o.userData.creature) o = o.parent; if (o) return { creature: o.userData.creature }; }
    const its = interactTargets ? interactTargets() : [];
    const hitI = its.length ? raycaster.intersectObjects(its, true)[0] : null;
    if (hitI) { let o = hitI.object; while (o && !o.userData.interact) o = o.parent; if (o) return { interact: o.userData.interact }; }
    // ground is area-aware: overworld terrain plane OR the dungeon floor
    const ground = getGround ? getGround() : null;
    const hit = ground ? raycaster.intersectObject(ground, false)[0] : null;
    if (!hit) return null;
    const p = hit.point;
    clampPoint?.(p);   // keep the destination inside the current area (disc / river / dungeon box)
    return { point: p };
  }

  const pointers = new Map();
  let dragging = false, downAt = 0, pinchStart = 0, distStart = 0;
  dom.addEventListener('pointerdown', e => {
    try { dom.setPointerCapture(e.pointerId); } catch { }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY });
    if (pointers.size === 1) { dragging = false; downAt = performance.now(); }
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinchStart = Math.hypot(a.x - b.x, a.y - b.y); distStart = st.dist; }
  });
  dom.addEventListener('pointermove', e => {
    const p = pointers.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    if (pointers.size === 1) {
      if (!dragging && Math.hypot(e.clientX - p.sx, e.clientY - p.sy) > 10) dragging = true;
      if (dragging) { st.yaw -= dx * 0.0045; st.pitch = clamp(st.pitch + dy * 0.0035, CFG.camPitchMin, CFG.camPitchMax); }
    } else if (pointers.size === 2 && pinchStart > 0) {
      const [a, b] = [...pointers.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
      st.dist = clamp(distStart * (pinchStart / Math.max(d, 1)), CFG.camDistMin, CFG.camDistMax);
    }
  });
  const endPointer = e => {
    const wasSingle = pointers.size === 1;
    pointers.delete(e.pointerId);
    if (wasSingle && !dragging && performance.now() - downAt < 450) {
      const res = raycastTap(e.clientX, e.clientY);
      if (res?.creature) onTapCreature?.(res.creature);
      else if (res?.interact) onTapInteract?.(res.interact);
      else if (res?.point) onTapGround?.(res.point);
    }
    if (pointers.size < 2) pinchStart = 0;
  };
  dom.addEventListener('pointerup', endPointer);
  dom.addEventListener('pointercancel', e => pointers.delete(e.pointerId));
  dom.addEventListener('wheel', e => { e.preventDefault(); st.dist = clamp(st.dist * (1 + e.deltaY * 0.001), CFG.camDistMin, CFG.camDistMax); }, { passive: false });

  const tmp = new THREE.Vector3();
  return {
    state: st,
    _raycastTap: raycastTap,
    isDown: (k) => keys.has(k),
    keyDir() {
      let fx = 0, fz = 0;
      if (keys.has('w') || keys.has('arrowup')) fz += 1;
      if (keys.has('s') || keys.has('arrowdown')) fz -= 1;
      if (keys.has('a') || keys.has('arrowleft')) fx -= 1;
      if (keys.has('d') || keys.has('arrowright')) fx += 1;
      const run = keys.has('shift');
      if (!fx && !fz) return { x: 0, y: 0, run };
      const fwd = new THREE.Vector2(-Math.sin(st.yaw), -Math.cos(st.yaw));
      const right = new THREE.Vector2(-fwd.y, fwd.x);
      const v = new THREE.Vector2(fwd.x * fz + right.x * fx, fwd.y * fz + right.y * fx).normalize();
      return { x: v.x, y: v.y, run };
    },
    tick(dt) {
      tmp.set(player.pos.x, player.pos.y + 1.1, player.pos.z);
      st.lookAt.lerp(tmp, damp(8, dt));
      st.smoothDist = THREE.MathUtils.lerp(st.smoothDist, st.dist, damp(6, dt));
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
