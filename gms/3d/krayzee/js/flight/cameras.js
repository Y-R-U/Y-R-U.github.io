import * as THREE from 'three';

const _p = new THREE.Vector3(), _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ');
const UP = new THREE.Vector3(0, 1, 0);

// Vertical FOV that keeps roughly the same horizontal view in portrait and landscape.
export function fitFov(camera, hfov, vMin = 45, vMax = 100) {
  const a = camera.aspect || 1;
  const v = (2 * Math.atan(Math.tan((hfov * Math.PI) / 360) / a) * 180) / Math.PI;
  camera.fov = Math.min(vMax, Math.max(vMin, v));
  camera.updateProjectionMatrix();
}

export function createFlightCamera(camera, env) {
  const S = {
    view: 'chase', pos: new THREE.Vector3(), look: new THREE.Vector3(), fwd: new THREE.Vector3(0, 0, -1),
    yaw: 0, pitch: 0, inited: false, shake: 0, pitchBias: 0,
  };
  const api = {
    get view() { return S.view; },
    setView(v) { S.view = v === 'cockpit' || v === 'center' ? v : 'chase'; S.inited = false; api.fit(); },
    fit() {
      // Inside views: wide phones in landscape get a fixed ~92° horizontal view, not 66° vertical (that was ~110° wide and
      // filled the screen with door panels and A-pillars); look a touch lower there so the panel isn't cropped.
      if (S.view !== 'chase') {
        camera.near = 0.05;
        if (camera.aspect >= 1) fitFov(camera, 92, 44, 66); else { camera.fov = 80; camera.updateProjectionMatrix(); }
        S.pitchBias = camera.aspect > 1.8 ? -0.05 : 0;
      }
      else { camera.near = 0.4; fitFov(camera, 78, 45, 90); }
    },
    kick(a) { S.shake = Math.max(S.shake, a); },
    // look = controls' look-around state { x (yaw rad), y (pitch rad), active }
    update(dt, rig, ac, look) {
      if (!look.active) { const k = 1 - Math.exp(-dt * 3.5); look.x -= look.x * k; look.y -= look.y * k; }
      const root = rig.root;
      if (S.view !== 'chase') {
        const center = S.view === 'center';
        let eye, pitch;
        if (rig.viewEye) {
          const v = rig.viewEye(S.view, camera.aspect, _v);
          eye = v.eye; pitch = v.pitch;
          if (v.fov && Math.abs(camera.fov - v.fov) > 0.01) { camera.fov = v.fov; camera.updateProjectionMatrix(); }
        } else {
          eye = center ? (rig.eyeCenter || _v.set(0, rig.eye.y, rig.eye.z)) : rig.eye;
          pitch = center ? rig.eyeCenterPitch ?? rig.eyePitch : rig.eyePitch;
        }
        camera.position.copy(eye).applyMatrix4(root.matrixWorld);
        _e.set(look.y + (pitch || 0) + (S.pitchBias || 0), look.x, 0);
        camera.quaternion.copy(root.quaternion).multiply(_q.setFromEuler(_e));
      } else {
        const p = root.position;
        const fwd = _v.set(0, 0, -1).applyQuaternion(root.quaternion);
        if (ac.gs > 6) fwd.set(ac.vel.x, ac.vel.y * 0.5, ac.vel.z);
        fwd.y = Math.max(-0.5, Math.min(0.5, fwd.y));
        fwd.normalize();
        S.fwd.lerp(fwd, S.inited ? 1 - Math.exp(-dt * 3) : 1).normalize();
        const dist = 15 + Math.min(6, ac.speed * 0.05), h = 3.6;
        const back = _v.copy(S.fwd).applyAxisAngle(UP, look.x);
        const want = new THREE.Vector3().copy(p).addScaledVector(back, -dist * Math.cos(look.y * 0.8));
        want.y += h + dist * Math.sin(look.y * 0.8) * -1;
        const gy = env.groundHeightAt(want.x, want.z) + 1.4;
        if (want.y < gy) want.y = gy;
        for (const b of env.colliders || []) {
          if (want.x > b.min[0] - 1 && want.x < b.max[0] + 1 && want.z > b.min[2] - 1 && want.z < b.max[2] + 1 && want.y < b.max[1] + 1) want.y = b.max[1] + 1.5;
        }
        if (!S.inited) S.pos.copy(want);
        else S.pos.lerp(want, 1 - Math.exp(-dt * 6));
        const lk = new THREE.Vector3().copy(p).addScaledVector(S.fwd, 7);
        lk.y += 1;
        if (!S.inited) S.look.copy(lk); else S.look.lerp(lk, 1 - Math.exp(-dt * 10));
        camera.position.copy(S.pos);
        camera.lookAt(S.look);
        // PLAYTEST_1 §4: put the plane in a band no HUD sits on (below the subtitles, above the prompt/popup slot):
        // tilt the camera so the plane projects at FRAME_Y of the screen height.
        camera.updateMatrixWorld();
        _p.copy(p).project(camera);
        const fy = 1 - 2 * (camera.aspect >= 1 ? 0.5 : 0.47), th = Math.tan((camera.fov * Math.PI) / 360);
        if (Math.abs(_p.z) < 1) camera.rotateX(Math.atan(_p.y * th) - Math.atan(fy * th));
        S.inited = true;
      }
      if (S.shake > 0.001) {
        camera.position.x += (Math.random() - 0.5) * S.shake * 0.25;
        camera.position.y += (Math.random() - 0.5) * S.shake * 0.25;
        S.shake *= Math.exp(-dt * 6);
      }
    },
  };
  return api;
}
