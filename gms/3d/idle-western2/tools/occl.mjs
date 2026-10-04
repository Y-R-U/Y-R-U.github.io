// Spectacle occlusion probe (lane S). Installed in the page: on the next hero render (after heroTidy, the shipment fill
// and the spectacle fill have run, i.e. with exactly what the frame draws) it casts rays from the hero camera to a grid of
// points on each focal actor's body and reports, per actor, the fraction of in-frame samples that hit a non-cast mesh
// first and which mesh did it. `spectacle:*` meshes and the terrain are the cast/ground, never occluders.
export const OCCL_PROBE = `(async () => {
  if (window.__occl) return true;
  const THREE = await import('three');
  const w = __iw2.world, s = w.spectacle, scene = w.scene, rc = new THREE.Raycaster();
  const P = new THREE.Vector3(), D = new THREE.Vector3(), N = new THREE.Vector3(), R = new THREE.Vector3(), H = [0, 0, 0];
  const shown = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
  const isFocal = (a) => a.used && !a.hidden && !a.bodyless && a.scene && (a.scene.kind === 'duel' || a.scene.which === 'duel') && a.char !== 'mortimer' && a.char !== 'pickles';
  function measure(cam) {
    rc.layers.mask = cam.layers.mask;
    const meshes = [];
    scene.traverse((o) => { if (o.isMesh && !/^spectacle:/.test(o.name) && o.name !== 'terrain' && !(o.isInstancedMesh && !o.count) && o.layers.test(rc.layers) && shown(o)) meshes.push(o); });
    const out = [];
    for (const a of s.pool.filter(isFocal)) {
      s.cast.head(a, H);
      const y0 = a.y + 0.25, y1 = Math.max(y0 + 0.4, H[1] + 0.15);
      D.set(a.x - cam.position.x, 0, a.z - cam.position.z).normalize();
      R.set(-D.z, 0, D.x);
      const by = {}; let n = 0, occ = 0;
      for (let i = 0; i < 7; i++) for (const k of [-0.22, 0, 0.22]) {
        P.set(a.x + R.x * k * (a.s || 1), y0 + (y1 - y0) * i / 6, a.z + R.z * k * (a.s || 1));
        N.copy(P).project(cam);
        if (N.z > 1 || Math.abs(N.x) > 1 || Math.abs(N.y) > 1) continue;
        n++;
        const dist = P.distanceTo(cam.position);
        rc.set(cam.position, D.copy(P).sub(cam.position).normalize());
        rc.near = 0; rc.far = dist - 0.45;
        const hit = rc.intersectObjects(meshes, false).find((h) => h.point.y > 0.12);
        if (hit) { occ++; const key = hit.object.name || hit.object.type; by[key] = by[key] || { n: 0, at: hit.point.toArray().map((v) => +v.toFixed(1)) }; by[key].n++; }
        D.set(a.x - cam.position.x, 0, a.z - cam.position.z).normalize();
      }
      out.push({ char: a.char || 'folk', scene: a.scene.which || a.scene.kind, n, frac: n ? +(occ / n).toFixed(3) : 0, by });
    }
    return out;
  }
  const prev = scene.onBeforeRender;
  window.__occl = { want: 0, res: null };
  scene.onBeforeRender = function (renderer, sc, camera, rt) {
    prev.call(this, renderer, sc, camera, rt);
    const o = window.__occl;
    if (o.want && camera === w.heroRig.camera) { o.want = 0; try { o.res = { t: performance.now(), cam: camera.position.toArray().map((v) => +v.toFixed(1)), actors: measure(camera) }; } catch (e) { o.res = { err: String(e) }; } }
  };
  return true;
})()`;

// Ask for one measurement on the next hero render and wait for it.
export async function occlSample(page) {
  await page.eval('window.__occl.res = null; window.__occl.want = 1; __iw2.host.markDirty?.("hero"); 1');
  for (let i = 0; i < 200; i++) {
    const r = await page.eval('window.__occl.res');
    if (r) return r;
    await new Promise((res) => setTimeout(res, 25));
  }
  return null;
}
