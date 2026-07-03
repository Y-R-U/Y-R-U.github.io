// Camera + picking. Mobile-first: one finger drags to pan, tap to select,
// two fingers pinch-zoom and twist-rotate. Desktop: left-drag pan, wheel zoom,
// right-drag orbit, click to select. Taps resolve to a tower or a grid cell.

import * as THREE from 'three';
import { CELL, CFG } from './config.js';
import { worldToCell, inGrid } from './levels.js';
import { clamp, lerp, damp } from './utils.js';

export function createInput(dom, camera, cb) {
  const inp = {
    target: new THREE.Vector3(0, 0, 0),
    r: CFG.cam.r0, phi: CFG.cam.phi0, theta: Math.PI,
    enabled: true, level: null, bounds: { x: 20, z: 14 },
  };
  // smoothed actuals
  let cr = inp.r, cphi = inp.phi, ctheta = inp.theta;
  const ctarget = inp.target.clone();

  inp.setLevel = (level) => {
    inp.level = level;
    inp.bounds.x = (level.grid.w / 2 + 2) * CELL;
    inp.bounds.z = (level.grid.h / 2 + 2) * CELL;
    inp.target.set(0, 0, 0);
    // portrait screens need to pull back further to fit the grid width
    const portrait = innerHeight > innerWidth ? 1.5 : 1;
    inp.r = clamp(Math.max(level.grid.w, level.grid.h) * CELL * 0.78 * portrait, CFG.cam.minR, CFG.cam.maxR);
    inp.phi = CFG.cam.phi0; inp.theta = Math.PI;
  };
  inp.snap = () => { cr = inp.r; cphi = inp.phi; ctheta = inp.theta; ctarget.copy(inp.target); apply(); };

  function apply() {
    const sp = Math.sin(cphi), y = Math.cos(cphi) * cr;
    camera.position.set(
      ctarget.x + Math.sin(ctheta) * sp * cr, y, ctarget.z + Math.cos(ctheta) * sp * cr);
    camera.lookAt(ctarget.x, 0, ctarget.z);
  }

  inp.update = (dt) => {
    const k = damp(9, dt);
    cr = lerp(cr, inp.r, k); cphi = lerp(cphi, inp.phi, k);
    ctheta = lerp(ctheta, inp.theta, k); ctarget.lerp(inp.target, k);
    apply();
  };

  // pan in camera-facing ground axes
  function pan(dx, dy) {
    const s = cr * 0.0016;
    const fwd = new THREE.Vector3(-Math.sin(ctheta), 0, -Math.cos(ctheta));
    const right = new THREE.Vector3(fwd.z, 0, -fwd.x);
    inp.target.addScaledVector(right, dx * s).addScaledVector(fwd, -dy * s);
    inp.target.x = clamp(inp.target.x, -inp.bounds.x, inp.bounds.x);
    inp.target.z = clamp(inp.target.z, -inp.bounds.z, inp.bounds.z);
  }

  const ray = new THREE.Raycaster();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const ndc = new THREE.Vector2();
  function groundPoint(clientX, clientY) {
    const rect = dom.getBoundingClientRect();
    ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const p = new THREE.Vector3();
    return ray.ray.intersectPlane(groundPlane, p) ? p : null;
  }
  inp.groundPoint = groundPoint;

  function tap(x, y) {
    if (!inp.enabled || !inp.level) return;
    const p = groundPoint(x, y);
    if (!p) return;
    const { cx, cz } = worldToCell(inp.level, p.x, p.z);
    if (inGrid(inp.level, cx, cz)) cb.onTapCell?.(cx, cz, p);
    else cb.onTapMiss?.();
  }

  // ── pointer wrangling ──
  const ptrs = new Map();
  let moved = 0, downT = 0, pinch0 = 0, angle0 = 0, r0 = 0, theta0 = 0, mode = null;

  dom.addEventListener('pointerdown', (ev) => {
    if (!inp.enabled) return;
    dom.setPointerCapture(ev.pointerId);
    ptrs.set(ev.pointerId, { x: ev.clientX, y: ev.clientY, b: ev.button });
    if (ptrs.size === 1) { moved = 0; downT = performance.now(); mode = ev.button === 2 ? 'orbit' : 'pan'; }
    if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      pinch0 = Math.hypot(a.x - b.x, a.y - b.y);
      angle0 = Math.atan2(a.y - b.y, a.x - b.x);
      r0 = inp.r; theta0 = inp.theta;
      mode = 'pinch';
    }
  });
  dom.addEventListener('pointermove', (ev) => {
    const p = ptrs.get(ev.pointerId);
    if (!p || !inp.enabled) return;
    const dx = ev.clientX - p.x, dy = ev.clientY - p.y;
    if (mode === 'pinch' && ptrs.size === 2) {
      p.x = ev.clientX; p.y = ev.clientY;
      const [a, b] = [...ptrs.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const ang = Math.atan2(a.y - b.y, a.x - b.x);
      inp.r = clamp(r0 * (pinch0 / Math.max(d, 1)), CFG.cam.minR, CFG.cam.maxR);
      inp.theta = theta0 + (ang - angle0);
      moved = 99;
      return;
    }
    moved += Math.abs(dx) + Math.abs(dy);
    p.x = ev.clientX; p.y = ev.clientY;
    if (moved < 7) return;
    if (mode === 'orbit') {
      inp.theta -= dx * 0.006;
      inp.phi = clamp(inp.phi - dy * 0.004, CFG.cam.phiMin, CFG.cam.phiMax);
    } else if (mode === 'pan') {
      pan(-dx, -dy);
    }
    cb.onDrag?.();
  });
  const end = (ev) => {
    const p = ptrs.get(ev.pointerId);
    ptrs.delete(ev.pointerId);
    if (p && ptrs.size === 0 && moved < 7 && performance.now() - downT < 450 && p.b !== 2)
      tap(ev.clientX, ev.clientY);
    if (ptrs.size < 2 && mode === 'pinch') mode = ptrs.size === 1 ? 'pan' : null;
  };
  dom.addEventListener('pointerup', end);
  dom.addEventListener('pointercancel', end);
  dom.addEventListener('contextmenu', (ev) => ev.preventDefault());
  dom.addEventListener('wheel', (ev) => {
    if (!inp.enabled) return;
    ev.preventDefault();
    inp.r = clamp(inp.r * (1 + Math.sign(ev.deltaY) * 0.09), CFG.cam.minR, CFG.cam.maxR);
  }, { passive: false });

  // desktop hover → cell highlight
  dom.addEventListener('mousemove', (ev) => {
    if (!inp.enabled || !inp.level || ptrs.size) return;
    const p = groundPoint(ev.clientX, ev.clientY);
    if (!p) return;
    const { cx, cz } = worldToCell(inp.level, p.x, p.z);
    cb.onHover?.(cx, cz);
  });

  inp.snap();
  return inp;
}
