// Auto-aim: the laser line out of the weapon + target selection. The laser
// points where the player faces; when a zombie enters the aim cone it snaps
// red onto that zombie and locks. player.js turns the body to the locked target
// and fires. Sticky targeting — once locked we keep the target through a wider
// cone so the lock doesn't flicker as the body rotates onto it.

import * as THREE from 'three';

export function createAim(scene) {
  // the beam (additive line) + a glowing dot at the business end
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const mat = new THREE.LineBasicMaterial({ color: 0x6fe0ff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });
  mat.userData.noWire = true;
  const laser = new THREE.Line(geo, mat);
  laser.renderOrder = 4; laser.frustumCulled = false;
  scene.add(laser);

  const dotMat = new THREE.SpriteMaterial({ color: 0x9bf0ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
  dotMat.userData.noWire = true;
  const dot = new THREE.Sprite(dotMat);
  dot.scale.set(0.5, 0.5, 1); dot.renderOrder = 5;
  scene.add(dot);

  let current = null;
  const _from = new THREE.Vector3(), _end = new THREE.Vector3(), _to = new THREE.Vector3();

  const api = {
    laser, dot,
    target: () => (current && current.alive ? current : null),
    setVisible(v) { laser.visible = v; dot.visible = v; },

    // muzzlePos: world Vector3; faceDir: normalized xz Vector3; zombies: array.
    // Returns the locked target (or null). Updates the laser visuals.
    update({ muzzlePos, faceDir, zombies, range, cone }) {
      // drop a stale target (dead, or not in the current area's zombie list —
      // e.g. after an area swap the old town target is no longer active)
      if (current && (!current.alive || !zombies.includes(current))) current = null;
      if (current) {
        _to.set(current.group.position.x - muzzlePos.x, 0, current.group.position.z - muzzlePos.z);
        const d = _to.length();
        _to.normalize();
        const dot2 = _to.x * faceDir.x + _to.z * faceDir.z;
        if (d > range + 2 || Math.acos(THREE.MathUtils.clamp(dot2, -1, 1)) > cone * 1.7) current = null;
      }
      // acquire the best (most-centred, then nearest) zombie in cone+range
      if (!current) {
        let best = null, bestScore = -Infinity;
        for (const z of zombies) {
          if (!z.alive) continue;
          _to.set(z.group.position.x - muzzlePos.x, 0, z.group.position.z - muzzlePos.z);
          const d = _to.length();
          if (d > range) continue;
          _to.normalize();
          const ang = Math.acos(THREE.MathUtils.clamp(_to.x * faceDir.x + _to.z * faceDir.z, -1, 1));
          if (ang > cone) continue;
          const score = (1 - d / range) * 2 + (1 - ang / cone);  // nearest first, centred as tie-break
          if (score > bestScore) { bestScore = score; best = z; }
        }
        current = best;
      }

      // draw the laser
      _from.copy(muzzlePos);
      const locked = !!current;
      if (locked) {
        _end.set(current.group.position.x, muzzlePos.y * 0.5 + current.aimPoint().y * 0.5, current.group.position.z);
      } else {
        _end.copy(faceDir).multiplyScalar(range).add(muzzlePos); _end.y = muzzlePos.y;
      }
      const pa = geo.attributes.position.array;
      pa[0] = _from.x; pa[1] = _from.y; pa[2] = _from.z;
      pa[3] = _end.x; pa[4] = _end.y; pa[5] = _end.z;
      geo.attributes.position.needsUpdate = true;
      const col = locked ? 0xff4536 : 0x6fe0ff;
      laser.material.color.setHex(col); laser.material.opacity = locked ? 0.85 : 0.42;
      dot.material.color.setHex(locked ? 0xff7a66 : 0x9bf0ff);
      dot.position.copy(_end); dot.material.opacity = locked ? 0.95 : 0.55;
      dot.scale.setScalar(locked ? 0.55 : 0.4);

      return current;
    },
  };
  return api;
}
