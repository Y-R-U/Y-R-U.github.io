import * as THREE from 'three';
import { BOARD } from './layout.js';

// Fixed battle camera (D4), framed like refs/ref_battle_02: the whole floor rectangle visible, near edge across the
// screen width just above the bottom HUD strip, far edge under the top HUD with the backdrop above.
// fit(aspect) solves distance + aim for a given pitch/fov so it works on any portrait aspect (and a desktop column).
export const FRAME = {
  pitch: 42 * Math.PI / 180, fov: 40, // pitch is solved by fit(); fov 40 + the deep board give ~42 deg like ref_02
  nearY: 0.83, farY: 0.25, // battle-4: 0.30 -> 0.25 with the deeper board (zFar -26.66): pitch ~39 deg, far row clear of the barrier // screen y (0 top, 1 bottom) of the floor's near / far edge centres (no margins given)
  gapBottom: 6, gapTop: 0,  // CSS px between the HUD margins and the floor edges
  widthFill: 1.06,          // near edge width / screen width (battle-4: 1.15 -> 1.06, steeper fit + side-button clearance)
};

// opts.backdrop (from the arena theme) adds `bgCamera`: a near-level camera for the backdrop layer, lens-shifted so its
// horizon sits exactly where the board camera sees the top of the back barrier (`seam`), so the join hides behind it.
export function createBattleCamera(opts = {}) {
  const F = { ...FRAME, ...opts };
  const camera = new THREE.PerspectiveCamera(F.fov, 0.45, 0.3, 900);
  camera.layers.enable(1);
  const BD = opts.backdrop || null;
  const bgCamera = BD ? new THREE.PerspectiveCamera(50, 0.45, 0.5, 1200) : null;
  if (bgCamera) bgCamera.layers.set(BD.layer ?? 3);
  const bg = { pos: new THREE.Vector3(), shift: 0 };
  const base = { pos: new THREE.Vector3(), target: new THREE.Vector3(), shiftY: 0 };
  const shake = { a: 0, t: 0 }, push = { k: 0, to: new THREE.Vector3() };
  const v = new THREE.Vector3();
  const margins = { top: null, bottom: null };
  let lastW = 412, lastH = 915;

  function apply(pos, target, shiftY) {
    camera.position.copy(pos);
    camera.lookAt(target);
    camera.updateProjectionMatrix();
    camera.projectionMatrix.elements[9] = -shiftY;
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    camera.updateMatrixWorld();
  }
  function project(p, pos, target, shiftY) {
    apply(pos, target, shiftY);
    v.copy(p).project(camera);
    return v;
  }
  // Camera on a pitch ray from the board centre. For each pitch, distance comes from the width fill; pitch itself is
  // searched so the floor's near/far edges span exactly nearY..farY (steeper pitch = taller span); a vertical lens
  // shift then drops the span into place. Margins (CSS px of HUD) move nearY / farY.
  function solve(pitch, aspect) {
    const dir = new THREE.Vector3(0, Math.sin(pitch), Math.cos(pitch));
    const target = new THREE.Vector3(0, 0, BOARD.zMid);
    // F.nearRim (theme): the near-edge console must sit above the bottom HUD, so it (not the floor edge) is the near constraint
    const near = new THREE.Vector3(BOARD.W / 2, 0, BOARD.zNear), farC = new THREE.Vector3(0, 0, BOARD.zFar);
    const nearC = F.nearRim ? new THREE.Vector3(0, F.nearRim.y, BOARD.zNear + F.nearRim.dz) : new THREE.Vector3(0, 0, BOARD.zNear);
    let lo = 4, hi = 300, d = 30;
    for (let i = 0; i < 36; i++) {
      d = (lo + hi) / 2;
      const pos = target.clone().addScaledVector(dir, d);
      if (project(near, pos, target, 0).x > F.widthFill) lo = d; else hi = d;
    }
    const pos = target.clone().addScaledVector(dir, d);
    const yN = project(nearC, pos, target, 0).y, yF = project(farC, pos, target, 0).y;
    return { pos, target, yN, yF };
  }
  function fit(aspect, h = 915) {
    camera.aspect = aspect;
    camera.fov = F.fov;
    const nearY = margins.bottom != null ? 1 - (margins.bottom + F.gapBottom) / h : F.nearY;
    const farY = margins.top != null ? Math.max(F.farY, (margins.top + F.gapTop) / h) : F.farY;
    const wantSpan = (nearY - farY) * 2;
    let lo = 25 * Math.PI / 180, hi = 75 * Math.PI / 180, r = null;
    for (let i = 0; i < 24; i++) {
      const p = (lo + hi) / 2;
      r = solve(p, aspect);
      if (r.yF - r.yN > wantSpan) hi = p; else lo = p;
    }
    const wantMid = 1 - (nearY + farY);
    const shiftY = wantMid - (r.yN + r.yF) / 2;
    base.pos.copy(r.pos); base.target.copy(r.target); base.shiftY = shiftY; base.pitch = (lo + hi) / 2; base.dist = r.pos.distanceTo(r.target);
    apply(base.pos, base.target, base.shiftY);
    if (bgCamera) {
      const ndcSeam = v.copy(BD.seam).project(camera).y; // where the board camera sees the barrier top
      // level camera; horizon (ndc 0 unshifted) moved up to ndcSeam; top edge then sees topAngle above the horizon
      const t = Math.tan(BD.topAngle * Math.PI / 180) / Math.max(0.2, 1 - ndcSeam);
      bgCamera.fov = 2 * Math.atan(t) * 180 / Math.PI;
      bgCamera.aspect = aspect;
      bg.pos.set(0, BD.height, BOARD.zNear + BD.back);
      bg.shift = ndcSeam;
      applyBg(0, 0);
    }
  }
  function applyBg(dx, dy) {
    bgCamera.position.set(bg.pos.x + dx, bg.pos.y + dy, bg.pos.z);
    bgCamera.lookAt(bg.pos.x + dx * 0.3, bg.pos.y + dy, bg.pos.z - 50);
    bgCamera.updateProjectionMatrix();
    // NDC y = clipY / w with w = -z_eye; adding s to elements[9] (z column) shifts NDC by -s, so pass -shift
    bgCamera.projectionMatrix.elements[9] = -bg.shift;
    bgCamera.projectionMatrixInverse.copy(bgCamera.projectionMatrix).invert();
    bgCamera.updateMatrixWorld();
  }

  const cur = { pos: new THREE.Vector3(), target: new THREE.Vector3() };
  return {
    camera, bgCamera, frame: F, base,
    resize(w, h) { lastW = w; lastH = h; fit(w / h, h); },
    // HUD margins in CSS px (ui passes {top: 64, bottom: 150}); the floor then fills the space between them
    setMargins(m = {}) { margins.top = m.top ?? null; margins.bottom = m.bottom ?? null; fit(lastW / lastH, lastH); },
    shake(a = 0.3) { shake.a = Math.min(1, Math.max(shake.a, a)); },
    // Overdrive push: k 0..1 eases the camera toward a world point
    push(k, to) { push.k = k; if (to) push.to.copy(to); },
    update(dt, t) {
      cur.pos.copy(base.pos); cur.target.copy(base.target);
      // idle breathing
      const ds = (base.dist || 27) / 27; // breathing / shake were tuned at 27 m; keep the same on-screen amount
      cur.pos.x += Math.sin(t * 0.21) * 0.18 * ds; cur.pos.y += Math.sin(t * 0.33) * 0.12 * ds;
      cur.target.x += Math.sin(t * 0.17 + 1) * 0.05;
      if (push.k > 0.001) {
        const k = push.k * push.k * (3 - 2 * push.k);
        cur.target.lerp(push.to, k * 0.35);
        cur.pos.lerp(push.to.clone().add(v.copy(base.pos).sub(base.target).multiplyScalar(0.72)), k * 0.5);
      }
      if (shake.a > 0.001) {
        shake.t += dt;
        const a = shake.a * shake.a * 0.35 * ds;
        cur.pos.x += Math.sin(shake.t * 61) * a; cur.pos.y += Math.sin(shake.t * 47 + 2) * a * 0.7;
        shake.a = Math.max(0, shake.a - dt * 2.4);
      }
      apply(cur.pos, cur.target, base.shiftY * (1 - push.k * 0.4));
      // backdrop parallax follows the breathing/shake a little (it is far away, so it should move less)
      if (bgCamera) applyBg((cur.pos.x - base.pos.x) * 1.2, (cur.pos.y - base.pos.y) * 0.3);
    },
  };
}
