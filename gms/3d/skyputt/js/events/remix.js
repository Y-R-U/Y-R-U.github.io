// events4: event-only hole remixes, built from the existing hole data (no engine change).
// A remixed hole has its own id (`mir-<id>`), so it has its own pickups ledger, best and ghost records,
// and it is NOT in COURSES: the course map, the daily pool (and the server's port of it), online rooms
// and the AI calibration table never see it. Events name it like any hole id; events.js holeDef()
// resolves the prefix.
//
// Mirror (`mir-<id>`): the hole reflected left ↔ right (x → −x). Hole data is theme-free path data
// (D6) and every lateral quantity is relative to the track frame, so the reflection is a pure data
// transform: point x, feature `at` x, lateral `u` (and patch `u0`/`u1`), wall sides, banks, loop side
// shift, void and branch polygons. Two things are not exact mirror images, by design:
//   * windmills turn the other way (omega negated) but the sail still sits on the same side of its spar;
//   * movers keep their travel and start half a period later (phase + π), which is the mirror of the
//     original motion without a negative amplitude reaching the skins.
// tools/events_test.mjs checks a straight shot on every remix lands on the mirror of the original shot.
const flipX = p => (Array.isArray(p) ? [-p[0], ...p.slice(1)] : p);
const swapWalls = w => (typeof w === 'string' ? w.replace(/[LR]/g, c => (c === 'L' ? 'R' : 'L')) : w);

function mirrorPoint(q) {
  const o = { ...q, x: -q.x };
  if ('walls' in q) o.walls = swapWalls(q.walls);
  if (q.bank) o.bank = -q.bank;
  return o;
}
function mirrorPiece(pc) {
  const o = { ...pc };
  if (pc.points) o.points = pc.points.map(mirrorPoint);
  if (pc.type === 'loop') o.shift = -(pc.shift ?? 0.8);
  return o;
}
function mirrorFeature(ft) {
  const o = { ...ft };
  if (ft.at) o.at = flipX(ft.at);
  if (ft.at0) o.at0 = flipX(ft.at0);
  if (ft.at1) o.at1 = flipX(ft.at1);
  if (ft.u != null) o.u = -ft.u;
  if (ft.u0 != null || ft.u1 != null) {   // patch band across the track: [u0, u1] → [−u1, −u0] (defaults ±99)
    const a = ft.u0 ?? -99, b = ft.u1 ?? 99;
    delete o.u0; delete o.u1;
    if (b !== 99) o.u0 = -b;
    if (a !== -99) o.u1 = -a;
  }
  if (ft.type === 'windmill') o.omega = -(ft.omega ?? 1.1);
  if (ft.type === 'mover') o.phase = (ft.phase ?? 0) + Math.PI;
  return o;
}

export function mirrorHole(def) {
  return {
    ...def,
    id: `mir-${def.id}`, name: `${def.name} (Mirror)`, remixOf: def.id, remix: 'mirror',
    pieces: def.pieces.map(mirrorPiece),
    features: (def.features || []).map(mirrorFeature),
    ...(def.voids ? { voids: def.voids.map(poly => poly.map(flipX).reverse()) } : {}),
    ...(def.branches ? { branches: def.branches.map(b => ({ ...b, points: b.points.map(mirrorPoint) })) } : {}),
  };
}

export const REMIXES = { mir: mirrorHole };
// 'mir-sky14' → { kind: 'mir', base: 'sky14' }; anything else → null
export function remixOf(id) {
  const m = /^([a-z]+)-(.+)$/.exec(id || '');
  return m && REMIXES[m[1]] ? { kind: m[1], base: m[2] } : null;
}
