import * as THREE from '../../vendor/three/three.module.js';

// Furniture between the follow camera and Garfield fades to see-through (walls/floors are handled by the
// camera pull-in and are never faded). Faded meshes get cloned materials; the originals come back when clear.
const FADED = 0.28;

export function createOccluderFade() {
  const ray = new THREE.Raycaster();
  const eye = new THREE.Vector3(), aim = new THREE.Vector3(), dir = new THREE.Vector3();
  const sphere = new THREE.Sphere();
  let cands = [], bigs = [], builtFor = null, builtAt = -99, clock = 0, tick = 0;
  // merged per-material furniture batches (all the sofa/armchair fabric is one mesh): fade only when right at the lens
  const BIG = /^(ground|upper):(fabric|woodGloss|wood|gloss|paint|tile|metal|ceramic)/;
  const NEAR = 0.75;
  const live = new Map();   // mesh → {orig, clones, k, want}

  function build(world, target) {
    const blockers = new Set(world.camBlockers || []);
    const isTarget = (o) => { for (let p = o; p; p = p.parent) if (p === target) return true; return false; };
    cands = []; bigs = [];
    world.scene.traverse((o) => {
      if (!o.isMesh || o.isSkinnedMesh || blockers.has(o) || o.userData.noFade) return;
      const mats = [].concat(o.material);
      if (mats.some((m) => !m || m.transparent || m.isShaderMaterial)) return;
      if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
      sphere.copy(o.geometry.boundingSphere).applyMatrix4(o.matrixWorld);
      if (sphere.radius < 0.06 || isTarget(o)) return;
      if (sphere.radius > 2.2) { if (BIG.test(o.name || '') && sphere.radius < 9) bigs.push(o); return; }
      cands.push(o);
      o.userData.fadeBox = new THREE.Box3().setFromObject(o);
    });
    builtFor = world; builtAt = clock;
  }

  function setFade(mesh, k) {
    let s = live.get(mesh);
    if (!s) {
      const orig = mesh.material;
      const clones = [].concat(orig).map((m) => { const c = m.clone(); c.transparent = true; c.depthWrite = false; return c; });
      s = { orig, clones, k: 1 };
      mesh.material = Array.isArray(orig) ? clones : clones[0];
      live.set(mesh, s);
    }
    s.k = k;
    for (const c of s.clones) c.opacity = k;
  }
  function restore(mesh) {
    const s = live.get(mesh); if (!s) return;
    mesh.material = s.orig;
    for (const c of s.clones) c.dispose();
    live.delete(mesh);
  }

  function update(dt, { camera, world, target, active }) {
    clock += dt;
    const hit = new Set();
    if (active && world?.scene && target?.visible !== false) {
      if (builtFor !== world || clock - builtAt > 4) build(world, target);
      tick -= dt;
      if (tick <= 0) {
        tick = 0.1;
        camera.getWorldPosition(eye);
        for (const h of [0.12, 0.3, 0.45]) {
          aim.copy(target.position); aim.y += h;
          dir.subVectors(aim, eye); const len = dir.length(); dir.multiplyScalar(1 / len);
          ray.set(eye, dir); ray.near = 0.05; ray.far = Math.max(0.1, len - 0.22);
          for (const i of ray.intersectObjects(cands, false)) hit.add(i.object);
          ray.far = Math.min(NEAR, ray.far);
          for (const i of ray.intersectObjects(bigs, false)) hit.add(i.object);
        }
        // anything the lens is practically inside (a sofa arm filling the screen) fades too
        for (const o of cands) if (o.userData.fadeBox.distanceToPoint(eye) < 0.35) hit.add(o);
        for (const m of live.keys()) live.get(m).want = hit.has(m) ? FADED : 1;
        for (const m of hit) if (!live.has(m)) { setFade(m, 1); live.get(m).want = FADED; }
      }
    } else for (const s of live.values()) s.want = 1;
    for (const [m, s] of [...live]) {
      const k = s.k + ((s.want ?? 1) - s.k) * Math.min(1, dt * 8);
      if (s.want === 1 && k > 0.98) restore(m); else setFade(m, k);
    }
  }
  function clear() { for (const m of [...live.keys()]) restore(m); cands = []; bigs = []; builtFor = null; }
  return { update, clear };
}
