import * as THREE from 'three';

const TAP_PX = 10, TAP_MS = 250;

// Canvas input: tap/click-to-move (raycast to ground), one-finger / right-drag camera look,
// pinch + wheel zoom, WASD, Q/E rotate.
export function createInput(canvas, camera, world, rig) {
  const keys = new Set();
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3();
  const pointers = new Map();
  let pinch0 = 0, zoom0 = 0, looker = null;
  const input = {
    keys, tapTarget: null, tapCount: 0, onTap: null, enabled: true, lookEnabled: true,
    get looking() { return !!looker; },
    groundFromScreen(cx, cy) {
      const r = canvas.getBoundingClientRect();
      ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      let y = 0;
      for (let i = 0; i < 2; i++) {
        plane.constant = -y;
        if (!ray.ray.intersectPlane(plane, hit)) return null;
        y = world.groundAt(hit.x, hit.z);
      }
      hit.y = y;
      return hit.clone();
    },
    keyVector() {
      let x = 0, y = 0;
      if (keys.has('KeyW') || keys.has('ArrowUp')) y += 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) y -= 1;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
      const l = Math.hypot(x, y);
      return l ? { x: x / l, y: y / l } : { x: 0, y: 0 };
    },
    // Q/E held: rotate the view (called once per frame)
    update(dt) {
      if (!input.lookEnabled || rig.fixed) return;
      const q = keys.has('KeyQ'), e = keys.has('KeyE');
      if (q !== e && !(e && input.eBusy?.())) rig.spin((q ? 1 : -1) * 2.0 * dt);
    },
  };
  addEventListener('keydown', (e) => { if (e.target?.tagName === 'INPUT') return; keys.add(e.code); if (e.code === 'Equal') rig.addZoom(-0.1); if (e.code === 'Minus') rig.addZoom(0.1); });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); if (!rig.fixed) rig.addZoom(Math.sign(e.deltaY) * 0.08); }, { passive: false });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture?.(e.pointerId);
    const now = performance.now();
    const p = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t: now, lt: now, vx: 0, vy: 0, mouseLook: e.pointerType === 'mouse' && (e.button === 1 || e.button === 2) };
    pointers.set(e.pointerId, p);
    if (pointers.size === 2) {
      if (looker) { rig.release(); looker = null; }
      const [a, b] = [...pointers.values()];
      pinch0 = Math.hypot(a.x - b.x, a.y - b.y); zoom0 = rig.zoomTarget;
    } else if (p.mouseLook && input.lookEnabled && !rig.fixed) { looker = e.pointerId; rig.grab(); }
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y, now = performance.now();
    p.x = e.clientX; p.y = e.clientY;
    if (pointers.size === 2 && pinch0 > 0) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (!rig.fixed) rig.setZoom(zoom0 - (d / pinch0 - 1) * 0.9);
      return;
    }
    if (looker == null && pointers.size === 1 && input.lookEnabled && !rig.fixed && e.pointerType !== 'mouse' && Math.hypot(p.x - p.x0, p.y - p.y0) > TAP_PX) {
      looker = e.pointerId; rig.grab();
      rig.orbit(p.x - p.x0 - dx, p.y - p.y0 - dy);   // catch up the slop so the drag doesn't lag the finger
    }
    if (looker === e.pointerId) {
      rig.orbit(dx, dy);
      const t = Math.max(1, now - p.lt) / 1000, a = 0.35;
      p.vx = p.vx * (1 - a) + (dx / t) * a; p.vy = p.vy * (1 - a) + (dy / t) * a;
      p.lt = now;
    }
  });
  const end = (e) => {
    const p = pointers.get(e.pointerId); if (!p) return;
    const wasPinch = pointers.size > 1 || pinch0 > 0;
    pointers.delete(e.pointerId);
    if (pointers.size === 0) pinch0 = 0;
    if (looker === e.pointerId) {
      looker = null;
      const idle = performance.now() - p.lt > 80;   // finger stopped before lifting: no fling
      rig.release(idle ? 0 : clampV(p.vx), idle ? 0 : clampV(p.vy) * 0.5);
      return;
    }
    if (wasPinch || !input.enabled || e.type === 'pointercancel' || p.mouseLook) return;
    const moved = Math.hypot(p.x - p.x0, p.y - p.y0), dt = performance.now() - p.t;
    if (moved < TAP_PX && (dt < TAP_MS || e.pointerType === 'mouse')) {
      const g = input.groundFromScreen(e.clientX, e.clientY);
      if (g) { input.tapTarget = g; input.tapCount++; input.onTap?.(g, e); }
    }
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  return input;
}

const clampV = (v) => Math.max(-1600, Math.min(1600, v));
