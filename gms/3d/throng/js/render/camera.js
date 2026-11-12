import * as THREE from 'three';

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function createCameraRig(camera) {
  const rig = {
    yaw: 0.55, pitch: 0.95, tx: 0, tz: 0, d: 20, lx: 0, lz: 0,
    p: 0, pv: 0, end: 0, endOn: false, init: false, fixed: null,
    fovV: 45,
  };
  const target = new THREE.Vector3();

  function fit(R, aspect) {
    const fovV = aspect < 1 ? 62 - (1 - aspect) * 6 : aspect > 1.7 ? 40 : 58 - (aspect - 1) / 0.7 * 18;
    const hv = THREE.MathUtils.degToRad(fovV / 2);
    const hh = Math.atan(Math.tan(hv) * aspect);
    const M = R * 1.12 + 5 + R * 0.5;
    const pitch = rig.pitch;
    const dh = M / Math.tan(hh);
    const dv = (M * Math.sin(pitch) * 1.12 + 1.5) / Math.tan(hv);
    return { fovV, d: Math.max(15, dh, dv) };
  }

  return {
    rig,
    yaw: () => rig.yaw,
    punch(s) { rig.pv -= Math.max(0, Math.min(1.5, s)) * 2.6; },
    setEnd(on) { if (on && !rig.endOn) rig.end = 0; rig.endOn = on; },
    snap() { rig.init = false; },
    update(dt, focus, aspect) {
      dt = Math.min(dt, 0.1);
      const R = Math.max(1, focus.radius || 1);
      rig.pitch = THREE.MathUtils.lerp(0.86, 1.0, smooth(18, 110, rig.d));
      const f = fit(R, aspect);
      const sp = Math.hypot(focus.vx || 0, focus.vz || 0);
      const M = R * 1.12 + 5 + R * 0.5;
      let lx = (focus.vx || 0) * 0.5, lz = (focus.vz || 0) * 0.5;
      const ll = Math.hypot(lx, lz), lmax = 0.28 * M;
      if (ll > lmax) { lx *= lmax / ll; lz *= lmax / ll; }
      void sp;
      if (!rig.init) {
        rig.tx = focus.x; rig.tz = focus.z; rig.d = f.d; rig.lx = lx; rig.lz = lz; rig.init = true; rig.fovV = f.fovV;
      }
      const kl = 1 - Math.exp(-dt * 1.8);
      rig.lx += (lx - rig.lx) * kl; rig.lz += (lz - rig.lz) * kl;
      const kt = 1 - Math.exp(-dt * 5);
      rig.tx += (focus.x + rig.lx - rig.tx) * kt; rig.tz += (focus.z + rig.lz - rig.tz) * kt;
      const kd = 1 - Math.exp(-dt * (f.d > rig.d ? 1.4 : 0.6));
      rig.d += (f.d - rig.d) * kd;
      rig.fovV += (f.fovV - rig.fovV) * (1 - Math.exp(-dt * 3));
      // punch spring
      const acc = -70 * rig.p - 8 * rig.pv;
      rig.pv += acc * dt; rig.p += rig.pv * dt;
      if (rig.endOn) rig.end = Math.min(1, rig.end + dt / 4);
      const e = smooth(0, 1, rig.end);
      let d = rig.d * (1 + 0.16 * rig.p) * (1 - 0.4 * e);
      let yaw = rig.yaw + 0.22 * e + (rig.yawDrift ? 0.35 * Math.sin(rig.yawDrift) : 0);
      let pitch = rig.pitch - 0.1 * e;
      let tx = rig.tx, tz = rig.tz;
      if (rig.fixed) { d = rig.fixed.d; tx = rig.fixed.x; tz = rig.fixed.z; yaw = rig.fixed.yaw ?? yaw; pitch = rig.fixed.pitch ?? pitch; }
      camera.fov = rig.fovV;
      const hd = Math.cos(pitch) * d;
      target.set(tx, 0.8, tz);
      camera.position.set(tx + Math.sin(yaw) * hd, 0.8 + Math.sin(pitch) * d, tz + Math.cos(yaw) * hd);
      camera.lookAt(target);
      camera.near = Math.max(0.5, d * 0.04);
      camera.far = d * 5 + 400;
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
      return d;
    },
  };
}
