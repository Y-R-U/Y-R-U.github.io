// Free the GPU side of a removed object tree: geometries, materials and their textures.
// Shared geometry/materials are safe to dispose (three re-uploads them on next draw). Uniform textures (e.g. the
// atlas) are left alone on purpose.
export function disposeObject(root) {
  if (!root) return;
  root.parent?.remove(root);
  const seen = new Set();
  const tex = (t) => { if (t?.isTexture && !seen.has(t)) { seen.add(t); t.dispose(); } };
  root.traverse((o) => {
    if (o.geometry && !seen.has(o.geometry)) { seen.add(o.geometry); o.geometry.dispose(); }
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) {
      if (seen.has(m)) continue;
      seen.add(m);
      for (const k of ['map', 'alphaMap', 'emissiveMap', 'normalMap']) tex(m[k]);
      m.dispose();
    }
  });
}
