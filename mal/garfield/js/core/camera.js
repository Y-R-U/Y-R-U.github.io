import * as THREE from '../../vendor/three/three.module.js';
import { createOccluderFade } from './fade.js';

const EASE = {
  linear: (t) => t,
  in: (t) => t * t,
  out: (t) => 1 - (1 - t) * (1 - t),
  inOut: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  smooth: (t) => t * t * (3 - 2 * t),
};
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const damp = (k, dt) => 1 - Math.exp(-k * dt);

// 3rd-person orbit camera with wall pull-in, auto-recenter and cutscene shots.
export function createCamera(R) {
  const camera = new THREE.PerspectiveCamera(55, 1, 0.04, 90);
  R.onResize((w, h) => { camera.aspect = w / h; camera.updateProjectionMatrix(); });

  const ray = new THREE.Raycaster();
  const fader = createOccluderFade();
  const pivot = new THREE.Vector3(), pivotGoal = new THREE.Vector3();
  const tmp = new THREE.Vector3(), dir = new THREE.Vector3(), desired = new THREE.Vector3();
  const lookCur = new THREE.Vector3();
  let target = null, world = null;

  const cam = {
    camera,
    yaw: Math.PI, pitch: 0.36, dist: 2.6, distCur: 2.6,
    minDist: 0.9, maxDist: 4.2, minPitch: -0.2, maxPitch: 1.15,
    height: 0.34, lookUp: 0.22,
    sensitivity: 1, invertY: false,
    mode: 'follow',            // follow | shot | orbit
    lastLook: -99, time: 0,
    shakeAmt: 0,
    setWorld(w) { world = w; },
    setTarget(obj) { target = obj; if (obj) snapPivot(); },
    snapBehind(rotY) { cam.yaw = roomyYaw(wrap(rotY + Math.PI)); cam.pitch = 0.36; cam.distCur = cam.dist; snapPivot(); placeFollow(1); },
    look(dx, dy) {
      if (!dx && !dy) return;
      const s = 0.0042 * cam.sensitivity;
      cam.yaw = wrap(cam.yaw - dx * s);
      cam.pitch = THREE.MathUtils.clamp(cam.pitch + (cam.invertY ? -dy : dy) * s, cam.minPitch, cam.maxPitch);
      cam.lastLook = cam.time;
    },
    zoom(delta) { cam.dist = THREE.MathUtils.clamp(cam.dist * Math.pow(1.0015, delta), cam.minDist, cam.maxDist); },
    shake(a = 0.15) { cam.shakeAmt = Math.max(cam.shakeAmt, a); },
    // Forward/right on the ground plane for camera-relative movement.
    basis(outF, outR) {
      outF.set(-Math.sin(cam.yaw), 0, -Math.cos(cam.yaw));
      outR.set(-outF.z, 0, outF.x);
    },
    shot, cut, follow, orbit,
    update,
  };

  let hintSpots = null;
  function yawHint(p) {
    if (!hintSpots) {
      const d = world?.anchors?.get('dresser');
      hintSpots = d ? [{ x: d.pos.x, y: d.pos.y, z: d.pos.z, rot: d.rotY ?? Math.PI, w: (d.w || 1) / 2 + 0.35, depth: 1.05 }] : [];
    }
    for (const h of hintSpots) {
      if (p.y < h.y - 0.2 || p.y > h.y + 1.0) continue;
      // local frame: +f = out of the dresser front
      const fx = Math.sin(h.rot), fz = Math.cos(h.rot), dx = p.x - h.x, dz = p.z - h.z;
      const f = dx * fx + dz * fz, side = Math.abs(dx * fz - dz * fx);
      if (f > -0.1 && f < h.depth && side < h.w) return { yaw: h.rot, pitch: 0.5 };
    }
    return null;
  }

  // Pick the yaw nearest `base` that leaves the camera the most room (used after cutscenes / spawns).
  function roomyYaw(base) {
    if (!target) return base;
    snapPivot();
    let best = base, bestA = -1;
    for (const off of [0, 0.5, -0.5, 1.0, -1.0, 1.6, -1.6, 2.3, -2.3, Math.PI]) {
      const y = wrap(base + off), cp = Math.cos(cam.pitch);
      dir.set(Math.sin(y) * cp, Math.sin(cam.pitch), Math.cos(y) * cp);
      const a = clipDistance(pivot, dir, cam.dist);
      if (a >= cam.dist * 0.9) return y;
      if (a > bestA + 0.2) { bestA = a; best = y; }
    }
    return best;
  }
  cam.roomyYaw = roomyYaw;

  // --- cutscene shots ---
  let shotState = null;
  function resolvePose(p) {
    if (!p) return null;
    if (typeof p === 'string') {
      const a = world?.anchors?.get(p) || world?.anchors?.get('cam_' + p);
      if (!a) return null;
      return { pos: a.pos.clone(), look: (a.look || a.target || a.pos).clone?.() || a.pos.clone(), fov: a.fov };
    }
    return p;
  }
  function shot(p, opts = {}) {
    const pose = resolvePose(p);
    if (!pose) return Promise.resolve();
    const dur = opts.dur ?? pose.dur ?? 1.2;
    cam.mode = 'shot';
    shotState?.resolve?.();
    return new Promise((resolve) => {
      shotState = {
        fromPos: camera.position.clone(), fromLook: lookCur.clone(), fromFov: camera.fov,
        toPos: toV(pose.pos), toLook: toV(pose.look), toFov: pose.fov ?? opts.fov ?? camera.fov,
        t: 0, dur: Math.max(0.0001, dur), ease: EASE[opts.ease || pose.ease || 'inOut'] || EASE.inOut, resolve,
        drift: opts.drift ? toV(opts.drift) : null,
      };
      if (dur <= 0) applyShot(1);
    });
  }
  function cut(p) { return shot(p, { dur: 0 }); }
  function follow(opts = {}) {
    const dur = opts.dur ?? 0.8;
    if (target && opts.behind !== false) { cam.yaw = roomyYaw(wrap(target.rotation.y + Math.PI)); cam.lastLook = cam.time; }
    if (dur <= 0 || cam.mode === 'follow') { cam.mode = 'follow'; shotState = null; snapPivot(); placeFollow(1); return Promise.resolve(); }
    cam.mode = 'blend';
    snapPivot();
    return new Promise((resolve) => {
      shotState = { fromPos: camera.position.clone(), fromLook: lookCur.clone(), fromFov: camera.fov, t: 0, dur, ease: EASE.inOut, resolve, blend: true };
    });
  }
  let orbitState = null;
  function orbit(o) { cam.mode = 'orbit'; orbitState = { a: o.start ?? 0, ...o }; }

  const toV = (v) => (v?.isVector3 ? v.clone() : new THREE.Vector3(v[0] ?? v.x, v[1] ?? v.y, v[2] ?? v.z));

  function applyShot(k) {
    const s = shotState, e = s.ease(Math.min(1, k));
    camera.position.lerpVectors(s.fromPos, s.toPos, e);
    lookCur.lerpVectors(s.fromLook, s.toLook, e);
    camera.fov = s.fromFov + (s.toFov - s.fromFov) * e;
  }

  function snapPivot() {
    if (!target) return;
    pivot.copy(target.position); pivot.y += cam.height;
    pivotGoal.copy(pivot);
  }

  // --- collision: pull the camera in so it never ends up behind a wall ---
  const box = new THREE.Box3(), hitP = new THREE.Vector3();
  function clipDistance(from, d, want) {
    let best = want;
    const blockers = world?.camBlockers;
    if (blockers?.length) {
      ray.set(from, d); ray.near = 0; ray.far = want + 0.25;
      const hits = ray.intersectObjects(blockers, true);
      if (hits.length) best = Math.min(best, hits[0].distance - 0.2);
    }
    const cols = world?.colliders;
    if (cols) {
      for (const c of cols) {
        if (c.enabled === false || c.cam === false) continue;
        const tall = c.max.y - c.min.y > 1.1 || c.cam === true || c.wall;
        if (!tall) { occl(c, from, d, want); continue; }
        box.min.copy(c.min).addScalar(-0.14); box.max.copy(c.max).addScalar(0.14);
        if (box.containsPoint(from)) continue;
        ray.ray.origin.copy(from); ray.ray.direction.copy(d);
        if (ray.ray.intersectBox(box, hitP)) {
          const dd = hitP.distanceTo(from);
          if (dd < best) best = dd;
        }
      }
    }
    best = Math.min(best, occBest);
    occBest = Infinity;
    // never park the lens inside furniture (a sofa arm filling the screen): step in until clear
    if (cols) {
      for (let dd = best; dd > 0.3; dd -= 0.08) {
        camP.copy(from).addScaledVector(d, dd);
        let inside = false;
        for (const c of cols) {
          if (c.enabled === false || c.floor || c.max.y - c.min.y < 0.08) continue;
          if (camP.x > c.min.x - 0.1 && camP.x < c.max.x + 0.1 && camP.z > c.min.z - 0.1 && camP.z < c.max.z + 0.1 && camP.y > c.min.y - 0.1 && camP.y < c.max.y + 0.1) { inside = true; break; }
        }
        if (!inside) break;
        best = dd - 0.08;
      }
    }
    return Math.max(0.3, best);
  }
  // Furniture (counters, sofa, fridge sides) hiding Garfield's body: test a ray from his middle to the
  // would-be camera spot, so the lift logic raises the camera to look over it.
  let occBest = Infinity;
  const low = new THREE.Vector3(), camP = new THREE.Vector3(), d2 = new THREE.Vector3();
  function occl(c, from, d, want) {
    const h = c.max.y - c.min.y;
    if (c.floor || c.stairs || c.noCam) return;
    const minXZ = Math.min(c.max.x - c.min.x, c.max.z - c.min.z);
    if (minXZ < 0.15) return;
    if (h < 0.35 && !(minXZ >= 0.5 && c.min.y > 0.3)) return;   // thin table tops still hide a cat underneath
    low.copy(from); low.y -= 0.16;
    if (c.max.y <= low.y + 0.02) return;
    box.min.copy(c.min).addScalar(-0.03); box.max.copy(c.max).addScalar(0.03);
    if (box.containsPoint(low)) return;
    camP.copy(from).addScaledVector(d, want);
    d2.subVectors(camP, low);
    const len = d2.length();
    d2.multiplyScalar(1 / len);
    ray.ray.origin.copy(low); ray.ray.direction.copy(d2);
    if (ray.ray.intersectBox(box, hitP)) {
      const t = hitP.distanceTo(low);
      if (t < len) occBest = Math.min(occBest, Math.max(0.3, (t / len) * want - 0.12));
    }
  }

  // Near walls the camera lifts over Garfield instead of crushing into him.
  let lift = 0;
  const pdir = (pitch, out) => { const cp = Math.cos(pitch); return out.set(Math.sin(cam.yaw) * cp, Math.sin(pitch), Math.cos(cam.yaw) * cp); };
  function followPose(dt, out) {
    const want = cam.dist, good = Math.min(want, 1.5);
    let bestLift = 0, bestAllowed = -1;
    for (const l of [0, 0.25, 0.5, 0.75, 1.0]) {
      const p = Math.min(1.35, cam.pitch + l);
      const a = clipDistance(pivot, pdir(p, dir), want);
      if (a > bestAllowed + 0.25) { bestAllowed = a; bestLift = l; }
      if (a >= good) break;
    }
    lift += (bestLift - lift) * damp(bestLift > lift ? 6 : 2, dt);
    pdir(Math.min(1.35, cam.pitch + lift), dir);
    const allowed = clipDistance(pivot, dir, want);
    // Pull in instantly, ease back out.
    if (allowed < cam.distCur) cam.distCur = allowed;
    else cam.distCur += (Math.min(allowed, want) - cam.distCur) * damp(3.5, dt);
    out.copy(pivot).addScaledVector(dir, cam.distCur);
    return out;
  }
  function placeFollow(dt) {
    followPose(dt, desired);
    camera.position.copy(desired);
    lookCur.copy(pivot); lookCur.y += cam.lookUp;
    camera.lookAt(lookCur);
  }

  function update(dt, info = {}) {
    cam.time += dt;
    if (target) {
      pivotGoal.copy(target.position); pivotGoal.y += cam.height;
      pivot.x += (pivotGoal.x - pivot.x) * damp(14, dt);
      pivot.z += (pivotGoal.z - pivot.z) * damp(14, dt);
      // Vertical lags more so jumps don't jerk the view, but catches up on landings/ledges.
      const vy = info.grounded ? 9 : 3.5;
      pivot.y += (pivotGoal.y - pivot.y) * damp(vy, dt);
      if (pivot.distanceToSquared(pivotGoal) > 9) pivot.copy(pivotGoal);
    }
    if (cam.mode === 'follow' || cam.mode === 'blend') {
      // furniture you use from the front (Jon's dresser drawers): swing round to look at its face, or the follow
      // cam ends up behind the dresser's flank looking through it
      const hint = target && cam.time - cam.lastLook > 1.1 ? yawHint(target.position) : null;
      if (hint) {
        cam.yaw = wrap(cam.yaw + wrap(hint.yaw - cam.yaw) * damp(2.6, dt));
        cam.pitch += (hint.pitch - cam.pitch) * damp(2, dt);
      } else if (info.moving && cam.time - cam.lastLook > 1.1 && target) {
        const behind = wrap(target.rotation.y + Math.PI), diff = wrap(behind - cam.yaw);
        if (Math.abs(diff) < 2.3) cam.yaw = wrap(cam.yaw + diff * damp(1.5 * Math.min(1, info.speed / 2.5), dt));
        cam.pitch += (0.36 - cam.pitch) * damp(0.6, dt);
      }
      followPose(dt, desired);
      if (cam.mode === 'blend') {
        const s = shotState;
        s.t += dt;
        const e = s.ease(Math.min(1, s.t / s.dur));
        camera.position.lerpVectors(s.fromPos, desired, e);
        tmp.copy(pivot); tmp.y += cam.lookUp;
        lookCur.lerpVectors(s.fromLook, tmp, e);
        camera.fov = s.fromFov + (55 - s.fromFov) * e;
        if (s.t >= s.dur) { cam.mode = 'follow'; shotState = null; s.resolve(); }
      } else {
        camera.position.copy(desired);
        lookCur.copy(pivot); lookCur.y += cam.lookUp;
        camera.fov += (55 - camera.fov) * damp(4, dt);
      }
    } else if (cam.mode === 'shot' && shotState) {
      shotState.t += dt;
      const k = shotState.t / shotState.dur;
      applyShot(k);
      if (k >= 1) {
        if (shotState.drift) { camera.position.addScaledVector(shotState.drift, dt); }
        if (shotState.resolve) { const r = shotState.resolve; shotState.resolve = null; r(); }
      }
    } else if (cam.mode === 'orbit' && orbitState) {
      const o = orbitState;
      o.a += dt * (o.speed ?? 0.06);
      camera.position.set(o.center.x + Math.sin(o.a) * o.radius, o.center.y + (o.height ?? 1.5), o.center.z + Math.cos(o.a) * o.radius);
      lookCur.copy(o.look || o.center);
    }
    camera.lookAt(lookCur);
    if (cam.shakeAmt > 0.001) {
      camera.rotation.z += (Math.random() - 0.5) * cam.shakeAmt * 0.2;
      camera.position.y += (Math.random() - 0.5) * cam.shakeAmt * 0.05;
      cam.shakeAmt *= Math.exp(-8 * dt);
    }
    camera.updateProjectionMatrix();
    if (cam.fadeOccluders !== false) {
      camera.updateMatrixWorld();
      try { fader.update(dt, { camera, world, target, active: (cam.mode === 'follow' || cam.mode === 'blend') && !!target }); } catch (e) { console.warn('[fade]', e); cam.fadeOccluders = false; fader.clear(); }
    }
  }

  return cam;
}
