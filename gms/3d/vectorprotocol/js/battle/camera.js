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

// BATTLE-L (docs/LANDSCAPE.md §2.2): landscape framing (w/h >= 1). Pitch is fixed by aspect; the distance fits a "slot box" (the
// active lane profile's plates + heads, not the whole floor) between the HUD margins, and a horizontal lens shift centres it in the
// free band between the card grid (left) and the control rail (right).
const lerp = (a, b, k) => a + (b - a) * Math.max(0, Math.min(1, k));
export const FRAME_WIDE = {
  // deg: 30 at aspect >= 2.0, 34 at 1.6, 36 at <= 1.4, linear in between
  pitch(aspect) { return aspect >= 1.6 ? lerp(34, 30, (aspect - 1.6) / 0.4) : lerp(36, 34, (aspect - 1.4) / 0.2); },
  boxX: 1.6, boxNear: 2.5, boxFar: 1.6, boxTop: 4.5, // slot box: x +-(colX[1] + boxX), z laneZ[0] + boxNear .. far lane - boxFar, y 0..boxTop
  roomyH: [480, 800],  // H (CSS px) over which the fit box grows from the slot box to the whole arena
  gap: 4,              // CSS px between the box and the top / bottom margins
  bgHFov: 96,         // backdrop camera horizontal fov cap (deg)
  bgHorizon: 0.3,     // backdrop horizon height in wide mode (fraction of H from the top), when the seam projects above it
  seamMax: 0.35, seamBump: 2, seamBumpMax: 6, // backdrop seam must project at y <= seamMax * H, else pitch rises in 2 deg steps (max +6)
};

// D26 intro pose at full strength (offsets from the fitted camera, world m): pulled back, raised, looking up and down the arena
export const FRAME_INTRO = { zoomOut: 0.9, rise: 4, lookUp: 7, lookFar: 10 };

// opts.backdrop (from the arena theme) adds `bgCamera`: a near-level camera for the backdrop layer, lens-shifted so its
// horizon sits exactly where the board camera sees the top of the back barrier (`seam`), so the join hides behind it.
export function createBattleCamera(opts = {}) {
  const F = { ...FRAME, ...opts };
  const camera = new THREE.PerspectiveCamera(F.fov, 0.45, 0.3, 900);
  camera.layers.enable(1);
  const BD = opts.backdrop || null;
  const bgCamera = BD ? new THREE.PerspectiveCamera(50, 0.45, 0.5, 1200) : null;
  if (bgCamera) bgCamera.layers.set(BD.layer ?? 3);
  const bg = { pos: new THREE.Vector3(), shift: 0, shiftX: 0 };
  const base = { pos: new THREE.Vector3(), target: new THREE.Vector3(), shiftY: 0, shiftX: 0, wide: false };
  const shake = { a: 0, t: 0 }, push = { k: 0, to: new THREE.Vector3() };
  const v = new THREE.Vector3();
  const margins = { top: null, bottom: null, left: null, right: null };
  let lastW = 412, lastH = 915;

  function apply(pos, target, shiftY, shiftX = 0) {
    camera.position.copy(pos);
    camera.lookAt(target);
    camera.updateProjectionMatrix();
    camera.projectionMatrix.elements[9] = -shiftY;
    if (shiftX) camera.projectionMatrix.elements[8] = -shiftX; // NDC x += shiftX (portrait never sets it)
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
    base.shiftX = 0; base.wide = false;
    apply(base.pos, base.target, base.shiftY);
    fitBg(aspect);
  }
  const _pts = Array.from({ length: 6 }, () => new THREE.Vector3());
  function fitWide(w, h) {
    const aspect = w / h;
    camera.aspect = aspect;
    camera.fov = F.fov;
    const W = FRAME_WIDE, L = BOARD.laneZ;
    const bx = BOARD.colX[1] + W.boxX, zN = L[0] + W.boxNear, zF = L[2] + BOARD.backShift - W.boxFar, bt = F.boxTop ?? W.boxTop;
    _pts[0].set(-bx, 0, zN); _pts[1].set(bx, 0, zN); _pts[2].set(-bx, 0, zF); _pts[3].set(bx, 0, zF); _pts[4].set(-bx, bt, zF); _pts[5].set(bx, bt, zF);
    // tall landscape (tablet / desktop, h >= roomyH): room to show the whole arena like ref_02, so the box blends toward the full floor
    // + the back barrier top; a 1080p window otherwise showed 370 px units on a cropped board
    const roomy = Math.max(0, Math.min(1, (h - W.roomyH[0]) / (W.roomyH[1] - W.roomyH[0])));
    if (roomy > 0) {
      const zNr = zN + (BOARD.zNear - zN) * roomy, zFr = zF + (BD ? BD.seam.z - zF : BOARD.zFar - zF) * roomy, xr = bx + (BOARD.W / 2 - bx) * roomy;
      _pts[0].set(-xr, 0, zNr); _pts[1].set(xr, 0, zNr); _pts[2].set(-xr, 0, zFr); _pts[3].set(xr, 0, zFr); _pts[4].set(-bx, bt, zF); _pts[5].set(bx, bt, zF);
      if (BD) { _pts[2].y = _pts[3].y = BD.seam.y * roomy; }
    }
    const top = (margins.top ?? 0) + W.gap, bot = h - (margins.bottom ?? 0) - W.gap;
    // no side margins given (battle_test without a HUD): centre on the screen
    const x0 = margins.left ?? 0, x1 = w - (margins.right ?? 0);
    const wantV = Math.max(0.1, (bot - top) / h * 2), wantH = Math.max(0.1, (x1 - x0) / w * 2);
    const target = new THREE.Vector3(0, 0, (zN + zF) / 2), dir = new THREE.Vector3(), pos = new THREE.Vector3();
    const ext = { x0: 0, x1: 0, y0: 0, y1: 0 };
    const measure = () => {
      ext.x0 = ext.y0 = 1e9; ext.x1 = ext.y1 = -1e9;
      for (const p of _pts) { project(p, pos, target, 0); ext.x0 = Math.min(ext.x0, v.x); ext.x1 = Math.max(ext.x1, v.x); ext.y0 = Math.min(ext.y0, v.y); ext.y1 = Math.max(ext.y1, v.y); }
    };
    let pitchDeg = W.pitch(aspect), shiftX = 0, shiftY = 0, d = 30;
    for (let bump = 0; ; bump += W.seamBump) {
      const pitch = (pitchDeg + bump) * Math.PI / 180;
      dir.set(0, Math.sin(pitch), Math.cos(pitch));
      // smallest distance at which the box fits both bands (projected size only shrinks with distance)
      let lo = 4, hi = 300;
      for (let i = 0; i < 36; i++) {
        d = (lo + hi) / 2;
        pos.copy(target).addScaledVector(dir, d); measure();
        if (ext.y1 - ext.y0 > wantV || ext.x1 - ext.x0 > wantH) lo = d; else hi = d;
      }
      d = hi; pos.copy(target).addScaledVector(dir, d); measure();
      shiftY = (1 - (top + bot) / h) - (ext.y0 + ext.y1) / 2;
      shiftX = ((x0 + x1) / w - 1) - (ext.x0 + ext.x1) / 2;
      if (!BD || bump + W.seamBump > W.seamBumpMax) { base.pitch = pitch; break; }
      apply(pos, target, shiftY, shiftX);
      const seamY = (1 - v.copy(BD.seam).project(camera).y) / 2 * h;
      if (seamY <= W.seamMax * h) { base.pitch = pitch; break; }
    }
    base.pos.copy(pos); base.target.copy(target); base.shiftY = shiftY; base.shiftX = shiftX || 1e-9; base.dist = d; base.wide = true;
    apply(base.pos, base.target, base.shiftY, base.shiftX);
    fitBg(aspect);
  }
  function fitBg(aspect) {
    if (bgCamera) {
      const ndcSeam = v.copy(BD.seam).project(camera).y; // where the board camera sees the barrier top
      // level camera; horizon (ndc 0 unshifted) moved up to ndcSeam; top edge then sees topAngle above the horizon
      let t = Math.tan(BD.topAngle * Math.PI / 180) / Math.max(0.2, 1 - ndcSeam);
      // wide: the seam sits high, so the formula above explodes (125 deg at 915x412) and smears the stands; cap the horizontal fov
      let hz = ndcSeam;
      if (base.wide) {
        t = Math.min(t, Math.tan((F.bgHFov ?? FRAME_WIDE.bgHFov) * Math.PI / 360) / aspect);
        // landscape shows the backdrop beside the side barriers too (and the seam itself is usually under the top HUD), so the
        // backdrop horizon drops to bgHorizon (fraction of H from the top): the stands then fill the sides instead of pale fog
        hz = Math.min(ndcSeam, 1 - 2 * (F.bgHorizon ?? FRAME_WIDE.bgHorizon));
      }
      bgCamera.fov = 2 * Math.atan(t) * 180 / Math.PI;
      bgCamera.aspect = aspect;
      bg.pos.set(0, BD.height, BOARD.zNear + BD.back);
      bg.shift = bg.shift0 = hz; bg.seam0 = ndcSeam;
      bg.shiftX = base.wide ? base.shiftX : 0;
      applyBg(0, 0);
    }
  }
  function applyBg(dx, dy) {
    bgCamera.position.set(bg.pos.x + dx, bg.pos.y + dy, bg.pos.z);
    bgCamera.lookAt(bg.pos.x + dx * 0.3, bg.pos.y + dy, bg.pos.z - 50);
    bgCamera.updateProjectionMatrix();
    // NDC y = clipY / w with w = -z_eye; adding s to elements[9] (z column) shifts NDC by -s, so pass -shift
    bgCamera.projectionMatrix.elements[9] = -bg.shift;
    if (bg.shiftX) bgCamera.projectionMatrix.elements[8] = -bg.shiftX;
    bgCamera.projectionMatrixInverse.copy(bgCamera.projectionMatrix).invert();
    bgCamera.updateMatrixWorld();
  }

  function refit() { if (lastW / lastH >= 1) fitWide(lastW, lastH); else fit(lastW / lastH, lastH); }
  const cur = { pos: new THREE.Vector3(), target: new THREE.Vector3() };
  const intro = { k: 1, s: 1 };
  return {
    camera, bgCamera, frame: F, base,
    resize(w, h) { lastW = w; lastH = h; refit(); },
    // HUD margins in CSS px (portrait ui passes {top: 64, bottom: 150}; landscape adds left / right: card grid and rail bands)
    setMargins(m = {}) {
      m = m || {};
      margins.top = m.top ?? null; margins.bottom = m.bottom ?? null; margins.left = m.left ?? null; margins.right = m.right ?? null;
      refit();
    },
    refit,
    get wide() { return base.wide; },
    margins,
    shake(a = 0.3) { shake.a = Math.min(1, Math.max(shake.a, a)); },
    // Overdrive push: k 0..1 eases the camera toward a world point
    push(k, to) { push.k = k; if (to) push.to.copy(to); },
    // D26 battle intro: k 0..1 (0 = zoomed out + panned up toward the backdrop, 1 = the fitted framing), strength 0..1.
    // The pose is an offset from `base`, so a refit (rotation) mid-intro just carries on. k >= 1 = off (the exact old path).
    setIntro(k, strength = 1) { intro.k = Math.max(0, Math.min(1, k)); intro.s = strength; },
    get introK() { return intro.k; },
    update(dt, t) {
      cur.pos.copy(base.pos); cur.target.copy(base.target);
      let iy = 1, ir = 0;
      if (intro.k < 1) {
        const k = intro.k, e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; // easeInOutCubic
        const r = intro.s * (1 - e), I = { ...FRAME_INTRO, ...(F.intro || {}), ...(base.wide ? F.introWide || {} : {}) };
        v.copy(base.pos).sub(base.target);
        cur.target.y += I.lookUp * r; cur.target.z -= I.lookFar * r;
        cur.pos.copy(base.target).addScaledVector(v, 1 + I.zoomOut * r); cur.pos.y += I.rise * r;
        iy = 1 - r; // the lens shift fades in with the move
        ir = intro.s > 0 ? r / intro.s : 0;
      }
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
      apply(cur.pos, cur.target, base.shiftY * (1 - push.k * 0.4) * iy, base.shiftX);
      // intro: the backdrop horizon follows the barrier top as the board camera tilts, so the join stays hidden
      // battle-8: wide drops its horizon below the seam (bgHorizon); at the intro start it sits on the seam (as portrait), so the
      // backdrop's ruins / arch / Rift show above the back wall instead of hiding behind it, then eases to the wide offset
      if (bgCamera && intro.k < 1) bg.shift = v.copy(BD.seam).project(camera).y + (bg.shift0 - bg.seam0) * (1 - ir);
      else if (bgCamera) bg.shift = bg.shift0;
      // backdrop parallax follows the breathing/shake a little (it is far away, so it should move less)
      if (bgCamera) applyBg((cur.pos.x - base.pos.x) * 1.2, (cur.pos.y - base.pos.y) * 0.3);
    },
  };
}
