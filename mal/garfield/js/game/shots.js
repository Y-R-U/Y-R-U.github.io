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
    if (c.enabled === false || c.max.y - c.min.y < 0.3) continue;
    const box = new THREE.Box3(c.min, c.max);
    ray.set(from, dir); ray.far = len;
    if (box.containsPoint(from)) continue;
    const p = ray.ray.intersectBox(box, V());
    if (p && p.distanceTo(from) < best) best = p.distanceTo(from);
  }
  return best;
}

// a glowing lampshade in front of the lens (between it and the subject, near the centre of frame) blows the frame out
const lv = new THREE.Vector3(), ld = new THREE.Vector3();
function nearLamp(ctx, look, cam) {
  ld.subVectors(look, cam); const len = ld.length(); ld.multiplyScalar(1 / len);
  for (const l of ctx.world?.lamps || []) {
    if (l.spot) continue;
    lv.subVectors(l.pos, cam);
    const along = lv.dot(ld);
    if (along < 0.15 || along > len - 0.1) continue;
    const perp = Math.sqrt(Math.max(0, lv.lengthSq() - along * along));
    if (perp < 0.3 + along * 0.42) return true;
  }
  return false;
}

// prefer: preferred yaw (radians, 0 = camera on +Z side of look). Tries 16 yaws, shrinking distance down to min.
// a person (feet at q, ~1.7 m tall) standing between the lens and the subject — unless they ARE the subject
const sg = new THREE.Line3(), sp = new THREE.Vector3(), sc = new THREE.Vector3();
function blocksView(q, look, cam) {
  if (Math.hypot(q.x - look.x, q.z - look.z) < 0.3) return false;
  sg.set(cam, look);
  for (const h of [0.35, 0.9, 1.45]) {
    sp.set(q.x, q.y + h, q.z);
    sg.closestPointToPoint(sp, true, sc);
    if (sc.distanceTo(sp) < 0.3) return true;
  }
  return false;
}

// avoid: points (actor feet) the lens must keep clear of — the camera inside Jon's trousers is not a shot
export function bestShot(ctx, look, { dist = 2.3, h = 0.9, prefer = 0, min = 1.1, avoid = null } = {}) {
  let best = null, bestScore = -Infinity;
  for (let i = 0; i < 16; i++) {
    const yaw = prefer + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * (Math.PI / 8);
    for (let d = dist; d >= min; d -= 0.4) {
      const pos = V(look.x + Math.sin(yaw) * d, look.y + h, look.z + Math.cos(yaw) * d);
      const bd = blockedDist(ctx, look, pos);
      if (bd < d + 0.25 || nearLamp(ctx, look, pos) || (avoid && avoid.some((q) => Math.hypot(q.x - pos.x, q.z - pos.z) < 0.6 || blocksView(q, look, pos)))) continue;
      const score = d * 2 - Math.abs(i) * 0.12;
      if (score > bestScore) { bestScore = score; best = { pos, look: look.clone() }; }
      break;
    }
    if (best && bestScore > dist * 2 - 0.5) break;
  }
  return best || { pos: V(look.x, look.y + h + 0.8, look.z + 0.6), look: look.clone() };
}

// A floor spot about r m from p that a human can stand on (no furniture), trying 12 directions from `prefer`.
export function standSpot(ctx, p, { r = 1.1, prefer = 0, floorY = null } = {}) {
  const y0 = floorY ?? (p.y > 2.6 ? 3.0 : 0);
  for (let i = 0; i < 12; i++) {
    const a = prefer + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * (Math.PI / 6);
    for (const rr of [r, r * 1.35, r * 0.8]) {
      const q = V(p.x + Math.sin(a) * rr, y0, p.z + Math.cos(a) * rr);
      const hit = (ctx.world?.colliders || []).some((c) => c.enabled !== false && c.max.y > y0 + 0.15 && c.min.y < y0 + 1.6 &&
        q.x > c.min.x - 0.3 && q.x < c.max.x + 0.3 && q.z > c.min.z - 0.3 && q.z < c.max.z + 0.3);
      if (!hit) return q;
    }
  }
  return V(p.x, y0, p.z - r);
}
