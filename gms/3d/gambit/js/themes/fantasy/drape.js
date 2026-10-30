// Fantasy theme: draped cloth shells (gowns, mantles, cloaks) for the figurines.
// A closed (r, y) cross-section swept around the BACK of the figure (y axis), open at the front.
// Unlike kit.latheSegment this stays indexed (smooth normals), takes per-height opening angles
// (inverted-V splits), radial folds, and gives the painter exact (row, column) indices, so gold
// borders can be one crisp, narrow column/row wide instead of a blotchy vertex-colour blur.
//
//   drape(THREE, {
//     sec: [[r, y], ...]       closed section (outer face up, inner face back down). Repeat a point
//                               to get a hard edge there (its two copies get separate normals).
//     open: y => halfAngle     front opening half-angle (0 = closed at the front; π = nothing)
//     cols: 20                 columns across the covered angle
//     band: 0.03               extra narrow columns at both edges (fraction of the width; 0 = none)
//     folds: (phi, y) => dr    radial push (phi: 0 = back, ±π = front)
//     z: 0                     shift the shell back (+z)
//     paint: ({row, t, edge, cap, x, y, z, phi}) => [r,g,b] | {c, glow, metal}
//   }) -> BufferGeometry (indexed, position/normal/color/uv as the fantasy material expects)
//   edge = 0 on the opening edge … grows toward the back (in t units); cap = true on the end faces.
const { sin, cos, PI } = Math;

export function drape(THREE, o) {
  const sec = o.sec, n = sec.length, cols = o.cols ?? 20, band = o.band ?? 0, z0 = o.z ?? 0;
  const open = o.open || (() => 0), folds = o.folds || (() => 0);
  // column parameters t in [0, 1]: two narrow bands at each edge, uniform in between
  const ts = [];
  if (band > 0) {
    const e = band * 0.18;
    ts.push(0, band, band + e);
    for (let i = 1; i < cols; i++) ts.push(band + e + (1 - 2 * (band + e)) * i / cols);
    ts.push(1 - band - e, 1 - band, 1);
  } else for (let i = 0; i <= cols; i++) ts.push(i / cols);
  const pos = [], col = [], uv = [], idx = [];
  const put = (r, y, t, info) => {
    const half = PI - open(y), phi = -half + 2 * half * t;
    const rr = r + folds(phi, y);
    const x = rr * sin(phi), z = rr * cos(phi) + z0;
    pos.push(x, y, z);
    const v = o.paint ? o.paint({ ...info, t, edge: Math.min(t, 1 - t), x, y, z, phi }) : null;
    const c = !v ? [1, 1, 1] : Array.isArray(v) ? v : v.c;
    col.push(c[0], c[1], c[2]);
    uv.push(v && !Array.isArray(v) ? v.glow || 0 : 0, v && !Array.isArray(v) ? v.metal || 0 : 0);
  };
  for (const t of ts) for (let j = 0; j < n; j++) put(sec[j][0], sec[j][1], t, { row: j, cap: false });
  for (let c = 0; c < ts.length - 1; c++) for (let j = 0; j < n; j++) {
    const j2 = (j + 1) % n, a = c * n + j, b = c * n + j2, d = (c + 1) * n + j, e = (c + 1) * n + j2;
    idx.push(a, d, b, b, d, e);
  }
  const body = new THREE.BufferGeometry();
  body.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  body.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  body.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  body.setIndex(idx);
  body.computeVertexNormals();
  orient(THREE, body, 'out', z0);
  // end caps: triangulate the section, map onto each edge
  const tri = THREE.ShapeUtils.triangulateShape(sec.map(([r, y]) => new THREE.Vector2(r, y)), []);
  const caps = [0, 1].map(t => {
    pos.length = 0; col.length = 0; uv.length = 0;
    for (let j = 0; j < n; j++) put(sec[j][0], sec[j][1], t, { row: j, cap: true });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(tri.flat());
    g.computeVertexNormals();
    // the cap must face away from the shell: toward the front opening (-z side of its edge)
    const half = PI - open(sec[0][1]), phi = -half + 2 * half * t;
    const want = new THREE.Vector3(cos(phi), 0, -sin(phi)).multiplyScalar(t === 0 ? -1 : 1);
    flipIf(g, want);
    return g;
  });
  return { body, caps };
}

/** Flip a geometry's winding (+ normals) if its average normal points against `want`. */
function flipIf(g, want) {
  const nr = g.attributes.normal; let s = 0;
  for (let i = 0; i < nr.count; i++) s += nr.getX(i) * want.x + nr.getY(i) * want.y + nr.getZ(i) * want.z;
  if (s >= 0) return;
  const ix = g.index;
  for (let i = 0; i < ix.count; i += 3) { const a = ix.getX(i + 1); ix.setX(i + 1, ix.getX(i + 2)); ix.setX(i + 2, a); }
  for (let i = 0; i < nr.count; i++) nr.setXYZ(i, -nr.getX(i), -nr.getY(i), -nr.getZ(i));
}
/** The outer face must point away from the axis (checked on vertex 0's column, a body vertex). */
function orient(THREE, g, _mode, z0) {
  const p = g.attributes.position, nr = g.attributes.normal; let s = 0;
  for (let i = 0; i < p.count; i++) s += nr.getX(i) * p.getX(i) + nr.getZ(i) * (p.getZ(i) - z0);
  // a closed section has as much inner as outer face; the outer is longer, so the sum is > 0 when right
  if (s >= 0) return;
  const ix = g.index;
  for (let i = 0; i < ix.count; i += 3) { const a = ix.getX(i + 1); ix.setX(i + 1, ix.getX(i + 2)); ix.setX(i + 2, a); }
  for (let i = 0; i < nr.count; i++) nr.setXYZ(i, -nr.getX(i), -nr.getY(i), -nr.getZ(i));
}

/** y rows from y0 to y1 (n steps) plus crisp gold bands: each band adds rows at its edges + a hair outside. */
export function rows(y0, y1, n, bands = []) {
  const ys = new Set();
  for (let i = 0; i <= n; i++) ys.add(+(y0 + (y1 - y0) * i / n).toFixed(5));
  for (const [a, b] of bands) for (const y of [a - 0.003, a, b, b + 0.003]) if (y >= y0 && y <= y1) ys.add(+y.toFixed(5));
  return [...ys].sort((a, b) => a - b);
}
export const inBands = (y, bands) => bands.some(([a, b]) => y >= a - 1e-4 && y <= b + 1e-4);
