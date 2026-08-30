// Scene graph → rows. Duck-typed on the three object shape (isMesh, geometry, children) rather
// than importing three, so node can drive it with plain objects.

export function trisOf(o) {
  const g = o.geometry;
  if (!g) return 0;
  const idx = g.index ? g.index.count : g.attributes?.position?.count || 0;
  const n = idx / 3;
  return Math.round(n * (o.isInstancedMesh ? (o.count ?? 0) : 1));
}

// Whole-subtree triangle count. `budget` stops a runaway walk of a streamed world dead rather
// than letting the inspector be the thing that drops the frame.
export function subtreeTris(root, budget = 20000) {
  let tris = 0, seen = 0, capped = false;
  const walk = o => {
    if (seen++ > budget) { capped = true; return; }
    if (o.isMesh || o.isPoints || o.isLine) tris += trisOf(o);
    for (const c of o.children || []) walk(c);
  };
  walk(root);
  return { tris, nodes: seen, capped };
}

export function label(o) {
  const t = o.type || (o.isMesh ? 'Mesh' : 'Object3D');
  const name = o.name || '';
  const extra = o.isInstancedMesh ? ` ×${o.count}` : '';
  return `${name || t}${name ? ` · ${t}` : ''}${extra}`;
}

// One flattened row per visible node. `open` is the set of uuids the user has expanded; a closed
// node contributes one row and its children are never walked.
export function rows(root, open, depth = 0, out = [], limit = 800) {
  if (!root || out.length >= limit) return out;
  const kids = root.children || [];
  const id = root.uuid || root.name || String(out.length);
  out.push({
    id, depth, label: label(root), type: root.type || 'Object3D',
    kids: kids.length, visible: root.visible !== false,
    tris: root.isMesh || root.isPoints || root.isLine ? trisOf(root) : 0,
    open: open.has(id), node: root,
  });
  if (open.has(id)) for (const c of kids) rows(c, open, depth + 1, out, limit);
  return out;
}

// Which level-document object a world point sits in or nearest to. The world's buildings are
// merged into one mesh per block, so the mesh cannot say which entry it came from — the
// footprint can.
export function docEntryAt(doc, x, z, plan) {
  let inside = null, near = null, nd = Infinity;
  for (const o of doc?.objects || []) {
    const [hw, hd] = plan(o);
    const dx = x - o.x, dz = z - o.z;
    const c = Math.cos(-o.ry || 0), s = Math.sin(-o.ry || 0);
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    if (Math.abs(lx) <= hw && Math.abs(lz) <= hd) { inside = o; break; }
    const d = Math.hypot(Math.max(0, Math.abs(lx) - hw), Math.max(0, Math.abs(lz) - hd));
    if (d < nd) { nd = d; near = o; }
  }
  return inside ? { o: inside, dist: 0, inside: true } : near ? { o: near, dist: nd, inside: false } : null;
}

export function materialInfo(m) {
  if (!m) return [];
  const list = [].concat(m);
  return list.map(x => ({
    name: x.name || '(unnamed)',
    type: x.type,
    color: x.color?.getHexString ? `#${x.color.getHexString()}` : null,
    transparent: !!x.transparent,
    opacity: x.opacity ?? 1,
    side: ['front', 'back', 'double'][x.side ?? 0],
    maps: ['map', 'normalMap', 'roughnessMap', 'aoMap', 'emissiveMap', 'alphaMap']
      .filter(k => x[k]).join(', ') || 'none',
    visible: x.visible !== false,
  }));
}
