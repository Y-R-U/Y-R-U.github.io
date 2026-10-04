// Minimal TopoJSON decoder: objects -> [{ id, props, polys: [[ring[[lon,lat]...]]...] }]

function decodeArcs(topo) {
  if (topo._arcs) return topo._arcs;
  const t = topo.transform;
  const out = topo.arcs.map(arc => {
    if (!t) return arc;
    let x = 0, y = 0;
    const [sx, sy] = t.scale, [tx, ty] = t.translate;
    return arc.map(([dx, dy]) => { x += dx; y += dy; return [x * sx + tx, y * sy + ty]; });
  });
  Object.defineProperty(topo, '_arcs', { value: out });
  return out;
}

function ringOf(arcs, idxs) {
  const ring = [];
  for (const i of idxs) {
    const a = i >= 0 ? arcs[i] : arcs[~i].slice().reverse();
    for (let k = ring.length ? 1 : 0; k < a.length; k++) ring.push(a[k]);
  }
  return ring;
}

export function features(topo, name) {
  const obj = topo.objects[name];
  if (!obj) return [];
  const arcs = decodeArcs(topo);
  return obj.geometries.map(g => {
    const polys = g.type === 'Polygon' ? [g.arcs.map(r => ringOf(arcs, r))]
      : g.type === 'MultiPolygon' ? g.arcs.map(p => p.map(r => ringOf(arcs, r))) : [];
    const props = g.properties || {};
    return { id: props.id ?? g.id, props, polys };
  });
}
