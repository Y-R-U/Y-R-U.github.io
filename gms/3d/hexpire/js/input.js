// Pointer gestures: tap-to-select, one-finger pan, pinch zoom, wheel zoom.
// Panning is exact — both pointer positions are unprojected onto the ground
// plane and the camera target moves by their world-space difference.
import * as THREE from 'three';
import { R, updateCamera, clampCam } from './render.js';

const ray = new THREE.Raycaster();
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _v2 = new THREE.Vector2();

function groundPoint(x, y, out) {
  _v2.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
  ray.setFromCamera(_v2, R.camera);
  return ray.ray.intersectPlane(plane, out);
}

export function initInput(canvas, { onTap, onPaint = null, isPainting = () => false }) {
  const pointers = new Map();
  let mode = 'idle';       // idle | maybe-tap | pan | paint | pinch
  let downX = 0, downY = 0, downT = 0;
  let pinchDist = 0, pinchHalf = 0;
  const pA = new THREE.Vector3(), pB = new THREE.Vector3();
  let enabled = true;

  canvas.style.touchAction = 'none';

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      mode = 'maybe-tap';
      downX = e.clientX; downY = e.clientY; downT = performance.now();
    } else if (pointers.size === 2) {
      mode = 'pinch';
      const [a, b] = [...pointers.values()];
      pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      pinchHalf = R.cam.half;
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    const prevX = p.x, prevY = p.y;
    p.x = e.clientX; p.y = e.clientY;

    if (mode === 'maybe-tap') {
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 9) {
        mode = isPainting() ? 'paint' : 'pan';
      }
    }
    if (mode === 'paint' && pointers.size === 1) {
      onPaint?.(e.clientX, e.clientY);
    } else if (mode === 'pan' && pointers.size === 1) {
      if (groundPoint(prevX, prevY, pA) && groundPoint(e.clientX, e.clientY, pB)) {
        R.cam.tx += pA.x - pB.x;
        R.cam.tz += pA.z - pB.z;
        clampCam(); updateCamera();
      }
    } else if (mode === 'pinch' && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d > 20) {
        R.cam.half = pinchHalf * (pinchDist / d);
        clampCam(); updateCamera();
      }
      // midpoint drag pans too
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const pmx = e.pointerId === [...pointers.keys()][0] ? (prevX + b.x) / 2 : (a.x + prevX) / 2;
      const pmy = e.pointerId === [...pointers.keys()][0] ? (prevY + b.y) / 2 : (a.y + prevY) / 2;
      if (groundPoint(pmx, pmy, pA) && groundPoint(mx, my, pB)) {
        R.cam.tx += pA.x - pB.x;
        R.cam.tz += pA.z - pB.z;
        clampCam(); updateCamera();
      }
    }
  });

  const finish = (e) => {
    const wasTap = mode === 'maybe-tap' && pointers.has(e.pointerId) &&
      performance.now() - downT < 450;
    pointers.delete(e.pointerId);
    if (pointers.size === 0) {
      if (wasTap && enabled) onTap(e.clientX, e.clientY);
      mode = 'idle';
    } else if (pointers.size === 1) {
      mode = 'pan';
    }
  };
  canvas.addEventListener('pointerup', finish);
  canvas.addEventListener('pointercancel', (e) => { pointers.delete(e.pointerId); if (!pointers.size) mode = 'idle'; });

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    R.cam.half *= Math.pow(1.0016, e.deltaY);
    clampCam(); updateCamera();
  }, { passive: false });

  return {
    setTapEnabled(v) { enabled = v; },
  };
}
