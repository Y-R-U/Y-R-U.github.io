// MAP: free everything a world build put on the GPU (D29 swaps one airport for another in the same page).
const freeTex = (t, seen) => {
  if (!t?.isTexture || seen.has(t)) return;
  seen.add(t);
  if (t.isRenderTargetTexture && t.renderTarget) t.renderTarget.dispose(); else t.dispose();
};

function freeMaterial(m, seen) {
  if (!m || seen.has(m)) return;
  seen.add(m);
  for (const v of Object.values(m)) freeTex(v, seen);
  if (m.uniforms) for (const u of Object.values(m.uniforms)) freeTex(u?.value, seen);
  m.dispose();
}

// root: the world group; uniformSets: onBeforeCompile uniform objects ({ name: { value } }) the materials don't own.
export function disposeWorld(scene, root, { lights = [], uniformSets = [], textures = [] } = {}) {
  const seen = new Set();
  scene.remove(root);
  root.traverse((o) => {
    o.geometry?.dispose();
    for (const m of [].concat(o.material || [])) freeMaterial(m, seen);
    if (o.isInstancedMesh) o.dispose();
    if (o.isSkinnedMesh) o.skeleton?.dispose();
  });
  for (const u of uniformSets) for (const k in u || {}) freeTex(u[k]?.value, seen);
  for (const t of textures) freeTex(t, seen);
  for (const l of lights) {
    if (!l) continue;
    scene.remove(l);
    if (l.target) scene.remove(l.target);
    l.shadow?.map?.dispose();
    l.dispose?.();
  }
  scene.fog = null;
}
