import * as THREE from 'three';

const D2R = Math.PI / 180;

// Diablo-style follow camera: fixed yaw (looking north, -Z), pitch and distance driven by one zoom value.
export function createCameraRig(camera, { zoom = 0.5 } = {}) {
  const rig = {
    camera, zoom, zoomTarget: zoom, yaw: 0,
    // zoom keys: 0 = low vista, ~0.35 = default Diablo framing, 1 = tactical overview
    keys: [[0, 7.5, 26, 50], [0.35, 12.5, 46, 44], [1, 27, 58, 38]],
    target: new THREE.Vector3(), smooth: new THREE.Vector3(), lead: new THREE.Vector3(),
    fixed: null, shake: 0,
    setZoom(z) { rig.zoomTarget = Math.min(1, Math.max(0, z)); },
    addZoom(d) { rig.setZoom(rig.zoomTarget + d); },
    snap() { rig.smooth.copy(rig.target); rig.zoom = rig.zoomTarget; rig.update(0); },
    params() {
      const K = rig.keys, t = rig.zoom;
      let i = 0; while (i < K.length - 2 && t > K[i + 1][0]) i++;
      const a = K[i], b = K[i + 1], u = Math.min(1, Math.max(0, (t - a[0]) / (b[0] - a[0]))), e = u * u * (3 - 2 * u);
      return { dist: a[1] + (b[1] - a[1]) * u, pitch: a[2] + (b[2] - a[2]) * e, fov: a[3] + (b[3] - a[3]) * u };
    },
    update(dt) {
      if (rig.fixed) {
        camera.position.copy(rig.fixed.pos); camera.lookAt(rig.fixed.look);
        if (rig.fixed.fov && camera.fov !== rig.fixed.fov) { camera.fov = rig.fixed.fov; camera.updateProjectionMatrix(); }
        return;
      }
      const k = 1 - Math.exp(-dt * 7);
      rig.zoom += (rig.zoomTarget - rig.zoom) * (1 - Math.exp(-dt * 10));
      rig.smooth.lerp(rig.target, dt ? k : 1);
      const { dist, pitch, fov } = rig.params();
      if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
      const p = pitch * D2R;
      const look = rig.smooth.clone().add(new THREE.Vector3(0, 1.1 + Math.max(0, 0.35 - rig.zoom) * 6, 0));
      camera.position.set(look.x + Math.sin(rig.yaw) * Math.cos(p) * dist, look.y + Math.sin(p) * dist, look.z + Math.cos(rig.yaw) * Math.cos(p) * dist);
      if (rig.shake > 0) { camera.position.x += (Math.random() - 0.5) * rig.shake; camera.position.y += (Math.random() - 0.5) * rig.shake; rig.shake = Math.max(0, rig.shake - dt * 2); }
      camera.lookAt(look);
    },
  };
  return rig;
}
