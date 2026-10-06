import * as THREE from '../../vendor/three/three.module.js';

// Pick a cutscene camera pose around `look` that walls/furniture don't block.
const ray = new THREE.Raycaster();
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

function blockedDist(ctx, from, to) {
  const blockers = ctx.world?.camBlockers;
  const dir = V().subVectors(to, from); const len = dir.length(); dir.normalize();
  let best = Infinity;
  if (blockers?.length) {
    ray.set(from, dir); ray.far = len;
    const hit = ray.intersectObjects(blockers, false)[0];
    if (hit) best = hit.distance;
  }
  // tall solid colliders (walls) as a fallback
  for (const c of ctx.world?.colliders || []) {
    if (c.enabled === false || c.max.y - c.min.y < 0.5 || c.max.y < 0.7) continue;
    const box = new THREE.Box3(c.min, c.max);
    ray.set(from, dir); ray.far = len;
    if (box.containsPoint(from)) continue;
    const p = ray.ray.intersectBox(box, V());
    if (p && p.distanceTo(from) < best) best = p.distanceTo(from);
  }
  return best;
}

// prefer: preferred yaw (radians, 0 = camera on +Z side of look). Tries 16 yaws, shrinking distance down to min.
export function bestShot(ctx, look, { dist = 2.3, h = 0.9, prefer = 0, min = 1.1 } = {}) {
  let best = null, bestScore = -Infinity;
  for (let i = 0; i < 16; i++) {
    const yaw = prefer + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * (Math.PI / 8);
    for (let d = dist; d >= min; d -= 0.4) {
      const pos = V(look.x + Math.sin(yaw) * d, look.y + h, look.z + Math.cos(yaw) * d);
      const bd = blockedDist(ctx, look, pos);
      if (bd < d + 0.25) continue;
      const score = d * 2 - Math.abs(i) * 0.12;
      if (score > bestScore) { bestScore = score; best = { pos, look: look.clone() }; }
      break;
    }
    if (best && bestScore > dist * 2 - 0.5) break;
  }
  return best || { pos: V(look.x, look.y + h + 0.8, look.z + 0.6), look: look.clone() };
}
