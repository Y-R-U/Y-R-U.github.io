// Single-country outline as SVG paths (official API for other lanes; used by F's silhouette format).
//   await countryShape('FRA', { neighbours: ['ESP', …], zoomOut: 1 })  → { main, context, frac, aspect } | null
//   shapeFromTopo(topo, 'FRA', opts)                                     → same, synchronous, given world.json
import { features } from './topo.js?v=202610081134';
import { laea } from './proj.js?v=202610081134';
import { loadWorld } from './data.js?v=202610081134';

let feats = null;
const featMap = topo => (feats ||= new Map(features(topo, 'countries').map(f => [f.id, f])));

const ringArea = r => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]); return Math.abs(a / 2); };
const bbox = pts => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const [x, y] of pts) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } return [x0, y0, x1, y1]; };

function lonLatCenter(ring) {
  // unwrap longitudes so rings crossing the antimeridian get a sensible centre
  const ref = ring[0][0];
  const lons = ring.map(([lon]) => (lon - ref > 180 ? lon - 360 : lon - ref < -180 ? lon + 360 : lon));
  const [x0, , x1] = bbox(lons.map(l => [l, 0]));
  const lats = ring.map(p => p[1]);
  let c = (x0 + x1) / 2; if (c > 180) c -= 360; if (c < -180) c += 360;
  return [c, (Math.min(...lats) + Math.max(...lats)) / 2];
}

// { main: 'M…', context: 'M…' (neighbours), frac, aspect } as SVG paths in a 100×100 box; frac = share of the land the main frame holds.
// Lambert azimuthal equal-area centred on the largest part; far islands outside the main frame are dropped.
export function shapeFromTopo(topo, iso, { neighbours = [], zoomOut = 1 } = {}) {
  const fm = featMap(topo);
  const f = fm.get(iso);
  if (!f || !f.polys.length) return null;
  const outer = f.polys.map(p => p[0]);
  let big = 0;
  outer.forEach((r, i) => { if (ringArea(r) > ringArea(outer[big])) big = i; });
  const proj = laea(lonLatCenter(outer[big]));
  const P = ring => ring.map(([lon, lat]) => proj(lon, lat));
  const polys = f.polys.map(p => p.map(P));
  const areas = polys.map(p => ringArea(p[0]));
  const total = areas.reduce((a, b) => a + b, 0);
  const L = bbox(polys[big][0]);
  const size = Math.max(L[2] - L[0], L[3] - L[1]);
  const pad = size * 0.5;
  const keep = polys.filter(p => { const b = bbox(p[0]); const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2; return cx > L[0] - pad && cx < L[2] + pad && cy > L[1] - pad && cy < L[3] + pad; });
  const kept = keep.reduce((a, p) => a + ringArea(p[0]), 0);
  const B = bbox(keep.flatMap(p => p[0]));
  const cx = (B[0] + B[2]) / 2, cy = (B[1] + B[3]) / 2;
  const span = Math.max(B[2] - B[0], B[3] - B[1]) * 1.12 * zoomOut || 1;
  const s = 100 / span;
  const T = ([x, y]) => `${(50 + (x - cx) * s).toFixed(2)},${(50 + (y - cy) * s).toFixed(2)}`;
  const path = ps => ps.map(p => p.map(r => (r.length > 2 ? 'M' + r.map(T).join('L') + 'Z' : '')).join('')).join('');
  const ctx = neighbours.map(id => fm.get(id)).filter(Boolean).map(n => n.polys.map(p => p.map(P)))
    .map(ps => ps.filter(p => { const b = bbox(p[0]); return b[2] > cx - span && b[0] < cx + span && b[3] > cy - span && b[1] < cy + span; }));
  return { main: path(keep), context: ctx.map(path).join(''), frac: total ? kept / total : 0, aspect: (B[2] - B[0]) / Math.max(1e-9, B[3] - B[1]) };
}

export async function countryShape(iso3, opts) {
  return shapeFromTopo(await loadWorld(), iso3, opts);
}
