// Copy an airport def rotated (deg, clockwise seen from above, about the world origin), optionally mirrored east-west
// first, then moved. Runway ends are renamed from their new headings; `rename` renames taxiways and stands.
// `derived` records the mapping so test harnesses can translate scripted scenarios.
const norm = (h) => ((h % 360) + 360) % 360;
const endName = (h) => String(Math.round(norm(h) / 10) % 36 || 36).padStart(2, '0');
const flip = { L: 'R', R: 'L' };

export function transformAirport(src, { id, name = id, rotate = 0, mirror = false, offset = [0, 0], rename = {} }) {
  const r = rotate * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
  const P2 = ([x, z]) => { if (mirror) x = -x; return [x * c - z * s + offset[0], x * s + z * c + offset[1]]; };
  const P3 = ([x, y, z]) => { const [a, b] = P2([x, z]); return [a, y, b]; };
  const H = (h) => norm((mirror ? 360 - h : h) + rotate);
  const RH = (h = 0) => norm((mirror ? -h : h) + rotate);
  const names = {};
  const N = (k) => names[k] ?? rename[k] ?? k;
  const runways = src.runways.map((rw) => {
    const h = H(rw.heading), ends = [endName(h), endName(h + 180)];
    names[rw.ends[0]] = ends[0]; names[rw.ends[1]] = ends[1];
    const out = { ...rw, id: ends.join('/'), ends, center: P3(rw.center), heading: h };
    names[rw.id] = out.id;
    if (rw.oneWay) out.oneWay = { land: N(rw.oneWay.land), depart: N(rw.oneWay.depart) };
    return out;
  });
  const footprint = (f) => f && { ...f, center: P3(f.center), heading: RH(f.heading) };
  const bbox = (pts) => [[Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1]))], [Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))]];
  return {
    ...src, id, name, short: name, n: null,
    center: P2(src.center ?? [0, 0]),
    wind: src.wind && { ...src.wind, from: H(src.wind.from) },
    runways,
    taxiways: src.taxiways.map((t) => ({ ...t, id: N(t.id), points: t.points.map(P2) })),
    aprons: (src.aprons || []).map(footprint),
    terminal: footprint(src.terminal),
    tower: src.tower && { ...src.tower, position: P3(src.tower.position) },
    stands: src.stands.map((st) => ({ ...st, id: N(st.id), position: P3(st.position), heading: H(st.heading) })),
    circuits: Object.fromEntries(Object.entries(src.circuits || {}).map(([e, v]) => [N(e), mirror ? flip[v] : v])),
    flat: (src.flat || []).map((f) => ({ rect: bbox([f.rect[0], f.rect[1], [f.rect[0][0], f.rect[1][1]], [f.rect[1][0], f.rect[0][1]]].map(P2)) })),
    derived: { from: src.id, rotate, mirror, offset, names: { ...rename, ...names } },
  };
}
