import * as THREE from 'three';

// Canvas input: tap/click-to-move (raycast to ground), WASD, wheel + pinch zoom.
export function createInput(canvas, camera, world, rig) {
  const keys = new Set();
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3();
  const pointers = new Map();
  let pinch0 = 0, zoom0 = 0;
  const input = {
    keys, tapTarget: null, tapCount: 0, onTap: null, enabled: true,
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
  };
  addEventListener('keydown', (e) => { if (e.target?.tagName === 'INPUT') return; keys.add(e.code); if (e.code === 'Equal') rig.addZoom(-0.1); if (e.code === 'Minus') rig.addZoom(0.1); });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); rig.addZoom(Math.sign(e.deltaY) * 0.08); }, { passive: false });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture?.(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t: performance.now() });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch0 = Math.hypot(a.x - b.x, a.y - b.y); zoom0 = rig.zoomTarget;
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId); if (!p) return;
    p.x = e.clientX; p.y = e.clientY;
    if (pointers.size === 2 && pinch0 > 0) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      rig.setZoom(zoom0 - (d / pinch0 - 1) * 0.9);
    }
  });
  const end = (e) => {
    const p = pointers.get(e.pointerId); if (!p) return;
    const wasPinch = pointers.size > 1 || pinch0 > 0;
    pointers.delete(e.pointerId);
    if (pointers.size === 0) pinch0 = 0;
    if (wasPinch || !input.enabled || e.type === 'pointercancel') return;
    const moved = Math.hypot(p.x - p.x0, p.y - p.y0), dt = performance.now() - p.t;
    if (moved < 14 && dt < 600) {
      const g = input.groundFromScreen(e.clientX, e.clientY);
      if (g) { input.tapTarget = g; input.tapCount++; input.onTap?.(g, e); }
    }
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  return input;
}
