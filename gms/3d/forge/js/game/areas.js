// Area containment. Pure — the world hands in a position, this says which areas hold it.

export function contains(area, x, z) {
  const s = area?.shape;
  if (!s) return false;
  if (s.k === 'circle') return (x - s.x) ** 2 + (z - s.z) ** 2 <= s.r * s.r;
  return x >= Math.min(s.x0, s.x1) && x <= Math.max(s.x0, s.x1)
    && z >= Math.min(s.z0, s.z1) && z <= Math.max(s.z0, s.z1);
}

// Innermost first, then each declared parent, so `in: "wwa"` still matches inside the granary.
export function areasAt(areas, x, z) {
  const hits = Object.values(areas).filter(a => contains(a, x, z));
  const out = new Set();
  for (const a of hits) {
    let cur = a;
    while (cur && !out.has(cur.id)) { out.add(cur.id); cur = areas[cur.parent]; }
  }
  return [...out];
}

// An area and every declared parent above it, innermost first. `[]` for an area nobody declared.
export function lineage(areas, id) {
  const out = [];
  let cur = areas?.[id];
  while (cur && !out.includes(cur.id)) { out.push(cur.id); cur = areas[cur.parent]; }
  return out;
}

export function centreOf(area) {
  const s = area?.shape;
  if (!s) return null;
  return s.k === 'circle' ? { x: s.x, z: s.z } : { x: (s.x0 + s.x1) / 2, z: (s.z0 + s.z1) / 2 };
}

export function nearestAnchor(areas, x, z) {
  let best = null, bd = Infinity;
  for (const a of Object.values(areas)) {
    const c = centreOf(a);
    if (!c) continue;
    const { x: cx, z: cz } = c;
    const d = (x - cx) ** 2 + (z - cz) ** 2;
    if (d < bd) { bd = d; best = { id: a.id, x: cx, z: cz }; }
  }
  return best;
}
