import * as THREE from 'three';

const D2R = Math.PI / 180;
const TAU = Math.PI * 2;
const LOOK = new THREE.Vector3();
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// Diablo-style follow camera. One zoom value drives distance/pitch/fov (keys); the player can orbit
// (yaw, 360°), tilt (pitch offset, clamped to pitchMin..pitchMax: 12°–70°, D16) and zoom; reset() eases back to default.
export function createCameraRig(camera, { zoom = 0.5 } = {}) {
  const rig = {
    camera, zoom, zoomTarget: zoom, yaw: 0, yawTarget: 0, yawVel: 0, pitchOff: 0, pitchTarget: 0, pitchVel: 0,
    defaultZoom: zoom, dragging: false, resetT: 0, reset0: null, pitchMin: 12, pitchMax: 70,
    // zoom keys: [zoom, dist, pitch°, fov°]
    keys: [[0, 7.5, 26, 50], [0.35, 12.5, 46, 44], [1, 27, 58, 38]],
    target: new THREE.Vector3(), smooth: new THREE.Vector3(), lead: new THREE.Vector3(),
    fixed: null, shake: 0,
    setZoom(z) { rig.zoomTarget = Math.min(1, Math.max(0, z)); rig.resetT = 0; },
    addZoom(d) { rig.setZoom(rig.zoomTarget + d); },
    snap() { rig.smooth.copy(rig.target); rig.zoom = rig.zoomTarget; rig.yaw = rig.yawTarget; rig.pitchOff = rig.pitchTarget; rig.update(0); },
    // look-drag in screen pixels; drag right turns the view right, drag down looks more top-down
    orbit(dx, dy) {
      rig.resetT = 0;
      rig.yawTarget -= dx * 0.0075;
      const k = rig.basePitch();
      rig.pitchTarget = Math.min(rig.pitchMax - k, Math.max(rig.pitchMin - k, rig.pitchTarget + dy * 0.14));
    },
    spin(rad) { rig.resetT = 0; rig.yawTarget += rad; },
    grab() { rig.dragging = true; rig.yawVel = 0; rig.pitchVel = 0; },
    release(vx = 0, vy = 0) { rig.dragging = false; rig.yawVel = -vx * 0.0075; rig.pitchVel = vy * 0.14; },
    reset(dur = 0.4) {
      rig.yawVel = rig.pitchVel = 0;
      rig.reset0 = { yaw: rig.yaw, pitch: rig.pitchOff, zoom: rig.zoom, dyaw: -wrap(rig.yaw) };
      rig.resetT = dur; rig.resetDur = dur;
    },
    isDefault() { return Math.abs(wrap(rig.yawTarget)) < 0.03 && Math.abs(rig.pitchTarget) < 0.6 && Math.abs(rig.zoomTarget - rig.defaultZoom) < 0.02; },
    // joystick (sx right, sy = screen-up) → world XZ direction for the current yaw
    screenToWorld(sx, sy) {
      const c = Math.cos(rig.yaw), s = Math.sin(rig.yaw);
      return { x: sx * c - sy * s, z: -sx * s - sy * c };
    },
    basePitch() {
      const K = rig.keys, t = rig.zoom;
      let i = 0; while (i < K.length - 2 && t > K[i + 1][0]) i++;
      const a = K[i], b = K[i + 1], u = Math.min(1, Math.max(0, (t - a[0]) / (b[0] - a[0])));
      return a[2] + (b[2] - a[2]) * u * u * (3 - 2 * u);
    },
    params() {
      const K = rig.keys, t = rig.zoom;
      let i = 0; while (i < K.length - 2 && t > K[i + 1][0]) i++;
      const a = K[i], b = K[i + 1], u = Math.min(1, Math.max(0, (t - a[0]) / (b[0] - a[0]))), e = u * u * (3 - 2 * u);
      const pitch = Math.min(rig.pitchMax, Math.max(rig.pitchMin, a[2] + (b[2] - a[2]) * e + rig.pitchOff));
      // vista: below 30° lift the look point, pull back and widen a little so the horizon sits in the upper third
      const low = Math.min(1, Math.max(0, (30 - pitch) / 18)), lw = low * low * (3 - 2 * low);
      return { dist: (a[1] + (b[1] - a[1]) * u) * (1 + lw * 0.2), pitch, fov: a[3] + (b[3] - a[3]) * u + lw * 6, lift: lw * 1.8 };
    },
    update(dt) {
      if (rig.fixed) {
        camera.position.copy(rig.fixed.pos); camera.lookAt(rig.fixed.look);
        if (rig.fixed.fov && camera.fov !== rig.fixed.fov) { camera.fov = rig.fixed.fov; camera.updateProjectionMatrix(); }
        return;
      }
      if (rig.resetT > 0) {
        rig.resetT = Math.max(0, rig.resetT - dt);
        const u = 1 - rig.resetT / rig.resetDur, e = u * u * (3 - 2 * u), r = rig.reset0;
        rig.yaw = rig.yawTarget = r.yaw + r.dyaw * e;
        rig.pitchOff = rig.pitchTarget = r.pitch * (1 - e);
        rig.zoom = rig.zoomTarget = r.zoom + (rig.defaultZoom - r.zoom) * e;
        if (!rig.resetT) { rig.yaw = rig.yawTarget = 0; }
      } else {
        if (!rig.dragging && (rig.yawVel || rig.pitchVel)) {
          rig.yawTarget += rig.yawVel * dt;
          const k = rig.basePitch();
          rig.pitchTarget = Math.min(rig.pitchMax - k, Math.max(rig.pitchMin - k, rig.pitchTarget + rig.pitchVel * dt));
          const d = Math.exp(-dt * 5);
          rig.yawVel *= d; rig.pitchVel *= d;
          if (Math.abs(rig.yawVel) < 0.01) rig.yawVel = 0;
          if (Math.abs(rig.pitchVel) < 0.2) rig.pitchVel = 0;
        }
        const ks = 1 - Math.exp(-dt * 18);
        rig.yaw += (rig.yawTarget - rig.yaw) * (dt ? ks : 1);
        rig.pitchOff += (rig.pitchTarget - rig.pitchOff) * (dt ? ks : 1);
        rig.zoom += (rig.zoomTarget - rig.zoom) * (1 - Math.exp(-dt * 10));
        // keep the angles bounded without a visible jump
        if (Math.abs(rig.yaw) > TAU) { const w = Math.round(rig.yaw / TAU) * TAU; rig.yaw -= w; rig.yawTarget -= w; }
      }
      const k = 1 - Math.exp(-dt * 7);
      rig.smooth.lerp(rig.target, dt ? k : 1);
      const { dist, pitch, fov, lift } = rig.params();
      if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
      const p = pitch * D2R;
      const look = LOOK.copy(rig.smooth); look.y += 1.1 + Math.max(0, rig.keys[1][0] - rig.zoom) * 1.2 + lift;
      camera.position.set(look.x + Math.sin(rig.yaw) * Math.cos(p) * dist, look.y + Math.sin(p) * dist, look.z + Math.cos(rig.yaw) * Math.cos(p) * dist);
      if (rig.shake > 0) { camera.position.x += (Math.random() - 0.5) * rig.shake; camera.position.y += (Math.random() - 0.5) * rig.shake; rig.shake = Math.max(0, rig.shake - dt * 2); }
      camera.lookAt(look);
    },
  };
  return rig;
}
