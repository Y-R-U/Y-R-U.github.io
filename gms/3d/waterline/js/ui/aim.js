// Tap → shot, and the camera pose that makes a tap possible — C7. New file in pass 1.
//
// Targeting is on the 3D table, not on a DOM board: C2 built the affordance (setAimMode /
// showGhost / localToAnchor) and HANDOFF_BRIDGE §4 spells out the one call sequence that keeps the
// renderer and the sim agreeing about what cell was tapped. Nothing here rounds a coordinate.
//
// Two-stage commit (BUILD_PLAN §3.2): a tap or a drag moves the ghost, a second tap inside the same
// footprint fires, and the HUD's FIRE button commits from anywhere. That is what makes a 20-pixel
// cell workable with a thumb — the small target only ever moves the ghost, and the big one fires.

import * as THREE from 'three';
import * as sim from '../sim/index.js';
import { UI } from '../config.js';

const DEG = THREE.MathUtils.degToRad;
const TAP_SLOP = 12;            // CSS px of travel still counted as a tap rather than a drag
const CAM = UI.camera;
const smooth = t => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

export function createAim({ app, hook, getTable, getGame, canAim, onGhost, onCommit }) {
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const plane = new THREE.Plane();
  const hitPoint = new THREE.Vector3();
  const up = new THREE.Vector3();
  const origin = new THREE.Vector3();

  let kind = 'shell';
  let anchor = null;
  let armed = false;
  let active = false;
  let owner = 'none';           // who is writing the camera: 'play', 'menu', or the director
  let handover = null;          // the ease from wherever a sequence left us to the play pose
  let wideT = 0;
  let down = null;

  const canvas = () => app.renderer.domElement;

  function anchorAt(clientX, clientY, k = kind) {
    const t = getTable();
    const g = getGame();
    if (!t || !g) return null;
    const obj = t.object3D;
    obj.updateMatrixWorld(true);
    const rect = canvas().getBoundingClientRect();
    ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    ray.setFromCamera(ndc, app.camera);
    origin.setFromMatrixPosition(obj.matrixWorld);
    up.set(0, 1, 0).applyQuaternion(obj.getWorldQuaternion(new THREE.Quaternion()));
    plane.setFromNormalAndCoplanarPoint(up, origin);
    if (!ray.ray.intersectPlane(plane, hitPoint)) return null;
    return t.localToAnchor(obj.worldToLocal(hitPoint.clone()), k);
  }

  function paint() {
    const t = getTable();
    const g = getGame();
    if (!t) return;
    if (!anchor || !g) { t.showGhost(null); onGhost?.(null, []); return; }
    const shot = { kind, r: anchor.r, c: anchor.c };
    const cells = sim.footprint(g, shot);
    t.showGhost(cells);
    onGhost?.(shot, cells);
  }

  function setAnchor(r, c, k = kind) {
    const g = getGame();
    if (!g) return null;
    const snapped = sim.snapTarget(g, { kind: k, r, c });
    kind = snapped.kind;
    anchor = { r: snapped.r, c: snapped.c };
    armed = true;
    paint();
    return anchor;
  }

  function inFootprint(a) {
    return !!(anchor && a && a.r === anchor.r && a.c === anchor.c);
  }

  // A tap that starts on a control belongs to the control. Without this the FIRE button also
  // raycasts the chart underneath it and moves the ghost it is about to commit.
  const onUI = e => !!(e.target?.closest && e.target.closest('#ui'));

  function onDown(e) {
    if (onUI(e)) return;
    down = { x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, moved: false, was: anchor && { ...anchor } };
    if (!active || !canAim()) return;
    const a = anchorAt(e.clientX, e.clientY);
    if (a) { anchor = a; armed = true; paint(); }
  }

  function onMove(e) {
    if (!down || onUI(e)) return;
    if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > TAP_SLOP) down.moved = true;
    const dx = e.clientX - down.lx;
    const dy = e.clientY - down.ly;
    down.lx = e.clientX;
    down.ly = e.clientY;
    const a = active && canAim() ? anchorAt(e.clientX, e.clientY) : null;
    // Brief step 2: a drag that lands on the chart moves the ghost, a drag anywhere else looks
    // around the bridge. One gesture, two meanings, told apart by what is under the finger.
    if (!a) { if (down.moved) try { hook.cine?.rig?.nudge?.(dx, dy); } catch {} return; }
    if (!inFootprint(a)) { anchor = a; armed = true; paint(); }
  }

  function onUp(e) {
    if (!down) return;
    const start = down;
    down = null;
    if (!active || !canAim()) return;
    if (start.moved) return;                       // a drag only ever moves the ghost
    const a = anchorAt(e.clientX, e.clientY);
    if (!a) return;
    // Second tap on the same anchor is the commit. `was` is the anchor BEFORE this gesture, so the
    // tap that first lights a footprint can never also fire it.
    if (start.was && start.was.r === a.r && start.was.c === a.c) commit();
  }

  function commit() {
    if (!anchor || !armed || !canAim()) return;
    onCommit?.({ kind, r: anchor.r, c: anchor.c });
  }

  // ── camera ────────────────────────────────────────────────────────────────────────────────
  //
  // D25: a sequence owns the camera while it plays, and when it ends the camera is C7's. That is a
  // handoff, not an override, and C6 published both halves of it:
  //
  //   rig.adopt()    take the camera exactly as it stands and hold it every frame from here on.
  //                  Free-look (brief step 2) rides on the same path, so the play pose uses this
  //                  rather than writing the camera per frame — the ease-back is already built.
  //   rig.release()  go inert. Nothing in js/cine/ touches the camera until a sequence poses again,
  //                  which is what the menu orbit and the hand-over ease need.
  //
  // Nothing here writes the camera on a frame the rig also writes it, so there is no last-writer
  // race of the kind D21 was.

  // The fit, measured rather than derived. A paraxial solve is wrong here by a factor of nearly
  // two: at a 30° depression the board's near edge is a third of the distance of its far edge and
  // projects far wider than its size at the centre suggests. So a scratch camera is posed, the
  // four corners are projected, and the distance is scaled by the overshoot until the projected
  // box fits — which also means the number in config is the fraction of frame it actually gets.
  //
  // The room is the other half of it: the camera may not rise into the deckhead or retreat through
  // the after bulkhead, so when the fit will not fit, the field of view opens instead.
  const probe = new THREE.PerspectiveCamera(50, 1.78, 0.05, 9000);
  const _corner = new THREE.Vector3();

  function boxAt(obj, size, eye, look, fov, aspect) {
    probe.fov = fov;
    probe.aspect = aspect;
    probe.updateProjectionMatrix();
    probe.position.copy(eye);
    probe.up.set(0, 1, 0);
    probe.lookAt(look);
    probe.updateMatrixWorld(true);
    probe.matrixWorldInverse.copy(probe.matrixWorld).invert();
    let x0 = 9, x1 = -9, y0 = 9, y1 = -9;
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const p = obj.localToWorld(_corner.set((sx * size.x) / 2, 0, (sz * size.z) / 2)).project(probe);
      x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
      y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
    }
    return { w: x1 - x0, h: y1 - y0, cy: (y0 + y1) / 2 };
  }

  function solve() {
    const t = getTable();
    if (!t) return null;
    const obj = t.object3D;
    obj.updateMatrixWorld(true);
    const aspect = app.camera.aspect || 1.78;
    const P = aspect < 1 ? CAM.portrait : CAM.landscape;
    let fov = P.fov;
    let a = DEG(P.pitch);
    let d = 2.2;
    let shift = 0;                           // metres the aim is raised above the board's centre
    let eye, box, look;
    const centre = obj.localToWorld(new THREE.Vector3(0, 0, 0));
    const up = new THREE.Vector3();
    const dir = new THREE.Vector3();
    // Aim and distance are solved together, not in sequence: sitting the board low in frame puts
    // it off-axis, where the projection stretches it, so a box measured on-axis is not the box the
    // player sees. Measured on a 10×10 portrait board, fitting first and aiming after left it 8%
    // wider than the frame.
    for (let i = 0; i < 16; i++) {
      if (d * Math.sin(a) > CAM.ceiling) a = Math.max(DEG(16), Math.asin(Math.min(0.98, CAM.ceiling / d)));
      if (d * Math.cos(a) > CAM.back) {
        if (fov < CAM.fovMax) fov = Math.min(CAM.fovMax, fov + 4);
        d = CAM.back / Math.cos(a);
      }
      eye = obj.localToWorld(new THREE.Vector3(0, d * Math.sin(a), -d * Math.cos(a)));
      dir.copy(centre).sub(eye).normalize();
      up.set(0, 1, 0).addScaledVector(dir, -dir.y).normalize();
      look = centre.clone().addScaledVector(up, shift);
      box = boxAt(obj, t.size, eye, look, fov, aspect);

      const half = box.h / 2;
      let wantCy = Math.max(P.centreY, -1 + P.padBottom + half);
      if (wantCy + half > 1 - P.padTop) wantCy = 1 - P.padTop - half;
      // Raising the aim by `u` metres at `dist` moves the scene down by u / (dist·tan(fov/2)) NDC.
      shift += (box.cy - wantCy) * eye.distanceTo(centre) * Math.tan(DEG(fov) / 2);

      // NDC spans −1..1, so a full-frame width is 2. `over` > 1 means the board is too big.
      const over = Math.max(box.w / (2 * P.fillW), box.h / (2 * P.fillH));
      if (Math.abs(over - 1) < 0.01 && Math.abs(box.cy - wantCy) < 0.01) break;
      d *= 0.4 + 0.6 * over;                 // damped: projected size is not exactly 1/d
    }
    return { eye, look, fov };
  }

  function writeCamera(eye, look, fov) {
    const cam = app.camera;
    cam.near = 0.05;
    cam.far = 9000;
    cam.position.copy(eye);
    if (cam.fov !== fov) { cam.fov = fov; cam.updateProjectionMatrix(); }
    cam.up.set(0, 1, 0);
    cam.lookAt(look);
  }

  // Take the camera for play. `ms` eases in from wherever the last sequence left it — after an
  // enemy volley that is out over the water beside your own hull, and cutting straight back to the
  // table from there reads as a dropped frame.
  function take(ms = CAM.handOverMs) {
    const p = solve();
    if (!p) return;
    const rig = hook.cine?.rig;
    rig?.reset?.();                     // drop the departing sequence's sway, jolt and roll
    const cam = app.camera;
    if (ms > 0 && cam.position.distanceTo(p.eye) > 0.05) {
      rig?.release?.();
      cam.getWorldDirection(_dir);
      handover = {
        from: { eye: cam.position.clone(), look: cam.position.clone().addScaledVector(_dir, 12), fov: cam.fov },
        to: p, t: 0, ms,
      };
      owner = 'play';
      return;
    }
    settle(p);
  }

  function settle(p) {
    handover = null;
    owner = 'play';
    writeCamera(p.eye, p.look, p.fov);
    const rig = hook.cine?.rig;
    if (!rig) return;
    // adopt() claims the camera and reads the pose back off it; restate the authored one so a
    // turn's worth of sway can never be adopted as the new rest pose and accumulate.
    rig.adopt();
    rig.pos.copy(p.eye);
    rig.target.copy(p.look);
    rig.fovDeg = p.fov;
    const s = CAM.sway;
    rig.sway.pos = s.pos; rig.sway.aim = s.aim; rig.sway.hz = s.hz;
    // The sequences turn free-look on at the end of bridge_settle and bridge_return and nowhere
    // else, so after an enemy volley — which has no return beat — nothing would enable it. It
    // belongs to whoever owns the resting camera, and per D25 that is now here.
    rig.freeLook(true);
  }

  // Give the camera back for a beat. Free-look has to go with it or the player's drag offset is
  // still applied through the whole sequence.
  function release() {
    handover = null;
    owner = 'none';
    try { hook.cine?.rig?.freeLook?.(false); } catch {}
  }

  // The menu camera: the fleet at sea, turning slowly. Written straight onto the camera every
  // frame, so the rig is released rather than adopted — a held pose would fight the orbit.
  function parkWide() {
    handover = null;
    owner = 'menu';
    wideT = 0;
    try { hook.cine?.rig?.release?.(); } catch {}
  }

  const _dir = new THREE.Vector3();
  const _eye = new THREE.Vector3();
  const _look = new THREE.Vector3(0, 10, 0);
  const _a = new THREE.Vector3();
  const _b = new THREE.Vector3();
  // Registered after main.js's director pump, so on any frame both write, this one lands last.
  app.add({
    update(dt) {
      if (owner === 'menu') {
        wideT += dt;
        const a = 0.5 + wideT * UI.menu.spin;
        writeCamera(_eye.set(Math.cos(a) * UI.menu.radius, UI.menu.height, Math.sin(a) * UI.menu.radius), _look, UI.menu.fov);
        return;
      }
      if (!handover) return;
      handover.t = Math.min(1, handover.t + (dt * 1000) / handover.ms);
      const e = smooth(handover.t);
      const { from, to } = handover;
      writeCamera(_a.lerpVectors(from.eye, to.eye, e), _b.lerpVectors(from.look, to.look, e), from.fov + (to.fov - from.fov) * e);
      if (handover.t >= 1) settle(to);
    },
  });

  addEventListener('pointerdown', onDown, { passive: true });
  addEventListener('pointermove', onMove, { passive: true });
  addEventListener('pointerup', onUp, { passive: true });
  addEventListener('pointercancel', () => { down = null; }, { passive: true });

  return {
    take,
    frame: () => take(0),
    release,
    parkWide,
    setActive(on) {
      active = on;
      if (!on) { getTable()?.showGhost(null); }
      else if (anchor) paint();
    },
    setKind(k) {
      const g = getGame();
      kind = k;
      getTable()?.setAimMode(k === 'shell' ? null : k);
      if (anchor && g) setAnchor(anchor.r, anchor.c, k);
      else paint();
    },
    get kind() { return kind; },
    setAnchor,
    shot: () => (anchor ? { kind, r: anchor.r, c: anchor.c } : null),
    commit,
    clear() { anchor = null; armed = false; getTable()?.showGhost(null); onGhost?.(null, []); },
  };
}
