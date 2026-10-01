// First-person and third-person chase camera. The chase camera is pulled in so it never sits inside blocks.

const BACK = 4.2, UP = 0.45, SIDE = 0.75;

export function createCameraRig(ctx) {
  const { THREE } = ctx;
  const cam = ctx.camera;
  const v = new THREE.Vector3(), off = new THREE.Vector3(), fwd = new THREE.Vector3(), eye = new THREE.Vector3();
  let dist = BACK, fov = cam.fov || 75;

  function clearAt(p) {
    const w = ctx.world;
    if (!w?.isSolidSub) return true;
    const r = 0.12;
    for (const dx of [-r, r]) for (const dy of [-r, r]) for (const dz of [-r, r])
      if (w.isSolidSub(Math.floor((p.x + dx) * 4), Math.floor((p.y + dy) * 4), Math.floor((p.z + dz) * 4))) return false;
    return true;
  }

  return {
    forward(out) { return cam.getWorldDirection(out); },
    update(dt, p) {
      const rp = p.rpos || p.pos;
      eye.set(rp.x, rp.y + p.eyeH, rp.z);
      cam.rotation.order = 'YXZ';
      cam.rotation.set(p.pitch, p.yaw, 0);
      const baseFov = +(ctx.settings?.get?.('fov') ?? 75) || 75;
      const want = baseFov + (p.sprinting ? 7 : 0) + (p.flying && p.speed > 6 ? 4 : 0);
      fov += (want - fov) * Math.min(1, dt * 8);
      if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }

      if (p.view !== 'third') { cam.position.copy(eye); dist = 0.3; return; }

      cam.getWorldDirection(fwd);
      // Over the right shoulder so the crosshair isn't hidden by the avatar.
      off.set(Math.cos(p.yaw) * SIDE, UP, -Math.sin(p.yaw) * SIDE).addScaledVector(fwd, -BACK);
      const full = off.length();
      off.divideScalar(full);
      const hit = ctx.world?.raycast?.([eye.x, eye.y, eye.z], [off.x, off.y, off.z], full + 0.4);
      const target = hit ? Math.max(0.3, hit.dist - 0.35) : full;
      dist = target < dist ? target : dist + (target - dist) * Math.min(1, dt * 3);
      for (let i = 0; i < 12; i++) {
        v.copy(eye).addScaledVector(off, dist);
        if (clearAt(v) || dist <= 0.3) break;
        dist = Math.max(0.3, dist - 0.3);
      }
      cam.position.copy(v);
    },
    get distance() { return dist; },
  };
}
