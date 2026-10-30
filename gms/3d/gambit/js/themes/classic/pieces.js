// Classic (Staunton) pieces — the exemplar sculptors copy. Each builder returns a Group
// with ONE mesh (all parts merged, one side material), base at y=0, fits in 1 square.
// Overhead read: pawn = small ball; rook = notched battlement ring; knight = long head
// pointing sideways; bishop = egg with a dark slot line + small ball; queen = ring of
// coronet beads; king = a "+" cross.

/** Staunton foot: rounded disc, step, cove and bead. Ends at about (R-0.10, 0.128). */
function foot(kit, R) {
  return kit.profile()
    .pt(0, 0).pt(R - 0.022, 0)
    .arc(R - 0.022, 0.022, 0.022, -90, 0, 3)
    .pt(R, 0.046)
    .arc(R - 0.02, 0.046, 0.02, 0, 90, 3)
    .pt(R - 0.05, 0.072)
    .bez(R - 0.078, 0.076, R - 0.068, 0.096, 3)
    .arc(R - 0.08, 0.108, 0.013, -60, 100, 4)
    .pt(R - 0.10, 0.128);
}
/** Collar ring used under heads. */
function collar(p, y, r, inner) {
  return p.pt(inner, y).pt(r, y + 0.015).arc(r, y + 0.03, 0.015, -90, 90, 4).pt(inner, y + 0.055);
}
const SEG = 32;
/** Polished gold (white) vs glossy black chrome (black) — see kit.metalLooks. */
const mat = (kit, color) => kit.material({ ...kit.metalLooks[color] });

export function pawn(THREE, kit, { color }) {
  const p = foot(kit, 0.31);
  p.bez(0.125, 0.16, 0.095, 0.33, 7);
  collar(p, 0.335, 0.165, 0.1);
  p.pt(0.075, 0.405).arc(0, 0.50, 0.125, -47, 90, 14);
  return kit.piece([kit.lathe(p.points(), { segments: SEG })], mat(kit, color));
}

export function rook(THREE, kit, { color }) {
  const p = foot(kit, 0.34);
  p.bez(0.20, 0.18, 0.20, 0.40, 5)
    .bez(0.20, 0.47, 0.245, 0.50, 4)
    .pt(0.252, 0.507).pt(0.252, 0.525).pt(0.232, 0.532)
    .pt(0.24, 0.545).pt(0.258, 0.56).pt(0.258, 0.645)
    .pt(0.172, 0.645).pt(0.172, 0.60).pt(0, 0.60);
  // darken the hollow so from above the rook reads as a dark well inside a ring of merlons
  const parts = [kit.paint(kit.lathe(p.points(), { segments: SEG }), (x, y, z) => (y > 0.59 && Math.hypot(x, z) < 0.175 ? 0.18 : null))];
  // six merlons (battlements): capped lathe wedges
  const sec = [[0.172, 0.64], [0.258, 0.64], [0.258, 0.716], [0.248, 0.728], [0.182, 0.728], [0.172, 0.716]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  const n = 6, span = (Math.PI * 2) / n;
  for (let i = 0; i < n; i++) parts.push(kit.latheSegment(sec, i * span + span * 0.2, span * 0.62, 6));
  return kit.piece(parts, mat(kit, color));
}

export function bishop(THREE, kit, { color }) {
  const p = foot(kit, 0.33);
  p.bez(0.15, 0.17, 0.122, 0.40, 7).pt(0.122, 0.425);
  collar(p, 0.43, 0.19, 0.125);
  p.pt(0.165, 0.495).pt(0.17, 0.51).pt(0.112, 0.522)
    .bez(0.195, 0.585, 0.172, 0.70, 14)
    .bez(0.15, 0.80, 0.045, 0.858, 14)
    .pt(0.03, 0.866).arc(0, 0.905, 0.043, -45, 90, 8);
  const g = kit.lathe(p.points(), { segments: 44 });
  // the mitre slot: a slanted groove on one side, darkened so it reads from above
  // near-vertical slanted plane through the crown: from above it is a dark line across the mitre
  const n = new THREE.Vector3(1, 0.32, 0).normalize();
  kit.carve(g, { normal: n, offset: n.dot(new THREE.Vector3(0.0, 0.74, 0)), width: 0.06, depth: 0.05, darken: 0.12,
    where: (x, y) => y > 0.6 && y < 0.88 });
  return kit.piece([g], mat(kit, color));
}

export function queen(THREE, kit, { color }) {
  const p = foot(kit, 0.36);
  p.bez(0.16, 0.20, 0.128, 0.50, 7).pt(0.128, 0.525);
  collar(p, 0.53, 0.205, 0.13);
  p.pt(0.18, 0.60).pt(0.18, 0.615).pt(0.12, 0.628)
    .bez(0.14, 0.74, 0.215, 0.835, 7)
    .pt(0.226, 0.852).pt(0.216, 0.868).pt(0.15, 0.872)
    .bez(0.15, 0.93, 0.06, 0.945, 5)
    .pt(0.036, 0.952).arc(0, 0.99, 0.046, -50, 90, 9);
  const parts = [kit.lathe(p.points(), { segments: SEG })];
  const beads = 9;
  for (let i = 0; i < beads; i++) {
    const a = (i / beads) * Math.PI * 2;
    parts.push(kit.place(kit.sphere(0.04, 10, 8), { x: Math.sin(a) * 0.196, y: 0.89, z: Math.cos(a) * 0.196 }));
  }
  return kit.piece(parts, mat(kit, color));
}

export function king(THREE, kit, { color }) {
  const p = foot(kit, 0.37);
  p.bez(0.17, 0.22, 0.138, 0.56, 7).pt(0.138, 0.585);
  collar(p, 0.59, 0.215, 0.14);
  p.pt(0.19, 0.66).pt(0.19, 0.675).pt(0.13, 0.688)
    .bez(0.15, 0.80, 0.21, 0.875, 7)
    .pt(0.218, 0.89).pt(0.205, 0.903)
    .bez(0.17, 0.97, 0.06, 0.983, 5).pt(0.05, 0.99).pt(0.05, 1.0).pt(0, 1.0);
  const parts = [kit.lathe(p.points(), { segments: SEG })];
  // 3D cross: a post plus two crossing arms, so from straight above it reads as "+"
  parts.push(kit.place(kit.bevelBox(0.07, 0.25, 0.07, 0.018), { y: 1.11 }));
  parts.push(kit.place(kit.bevelBox(0.22, 0.065, 0.07, 0.018), { y: 1.15 }));
  parts.push(kit.place(kit.bevelBox(0.07, 0.065, 0.22, 0.018), { y: 1.15 }));
  return kit.piece(parts, mat(kit, color));
}

/**
 * Knight: lathe base + extruded horse-head silhouette, then sculpted — tapered toward the
 * muzzle and ears, cheeks bulged, a carved mane of bumps, dark eyes and nostrils.
 * Authored with the muzzle pointing -z (forward); the board turns it to face sideways.
 */
export function knight(THREE, kit, { color }) {
  const p = foot(kit, 0.35);
  p.bez(0.22, 0.16, 0.235, 0.24, 3).pt(0.24, 0.27).arc(0.215, 0.27, 0.025, 0, 90, 3).pt(0, 0.295);
  const base = kit.lathe(p.points(), { segments: SEG });

  // silhouette in (u forward, v up)
  const U = -0.045; // shift so the head balances over the base
  const S = (u, v) => new THREE.Vector2(u + U, v);
  const shape = new THREE.Shape();
  shape.moveTo(-0.19 + U, 0.27); shape.lineTo(0.15 + U, 0.27);
  shape.splineThru([
    S(0.19, 0.36), S(0.168, 0.46), S(0.115, 0.53), S(0.16, 0.585), S(0.27, 0.602), S(0.322, 0.635),
    S(0.332, 0.68), S(0.302, 0.716), S(0.19, 0.79), S(0.11, 0.852), S(0.082, 0.93), S(0.05, 0.988),
    S(0.0, 0.925), S(-0.06, 0.885), S(-0.15, 0.80), S(-0.205, 0.665), S(-0.228, 0.50), S(-0.215, 0.35), S(-0.19, 0.27),
  ]);
  let head = new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.03, bevelSegments: 4, curveSegments: 6 });
  head.translate(0, 0, -0.06);
  head.rotateY(Math.PI / 2);           // shape x (forward) -> -z, extrude -> x
  head.deleteAttribute('normal'); head.deleteAttribute('uv');
  head = mergeVerts(THREE, head);
  // sculpt: taper thickness (x) by position
  const pos = head.attributes.position;
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), u = -pos.getZ(i) - U;
    let t = 1 - 0.4 * smooth(-0.02, 0.33, u);                       // narrow muzzle
    if (y > 0.86) t *= 1 - 0.45 * smooth(0.86, 0.99, y);           // thin ears
    if (y < 0.42) t *= 1 + 0.25 * smooth(0.42, 0.28, y);           // thick neck into the base
    t *= 1 + 0.16 * Math.exp(-((u - 0.07) ** 2 + (y - 0.67) ** 2) / 0.005); // cheeks
    pos.setX(i, x * t);
  }
  head.computeVertexNormals();
  kit.ensureColor(head);
  const parts = [base, head];
  const surfX = (u, v) => { // half-thickness of the sculpted head near (u,v)
    let m = 0.05;
    for (let i = 0; i < pos.count; i++) {
      const du = -pos.getZ(i) - U - u, dv = pos.getY(i) - v;
      if (du * du + dv * dv < 0.0012) m = Math.max(m, Math.abs(pos.getX(i)));
    }
    return m;
  };
  // mane: a ridge of bumps down the back of the neck
  const mane = [[-0.10, 0.865], [-0.155, 0.80], [-0.19, 0.725], [-0.212, 0.645], [-0.224, 0.56], [-0.226, 0.47], [-0.22, 0.385]];
  for (const [u, v] of mane) parts.push(kit.place(kit.sphere(0.05, 10, 8), { x: 0, y: v, z: -(u + U) + 0.012, sx: 0.85, sy: 1.25, sz: 0.8 }));
  // eyes + nostrils (dark), on both sides
  const eyeX = surfX(0.13, 0.765), nosX = surfX(0.31, 0.668);
  for (const s of [-1, 1]) {
    parts.push(kit.tint(kit.place(kit.sphere(0.027, 10, 8), { x: s * (eyeX - 0.006), y: 0.765, z: -(0.13 + U), sz: 1.25 }), [0.12, 0.1, 0.09]));
    parts.push(kit.tint(kit.place(kit.sphere(0.017, 8, 6), { x: s * (nosX - 0.008), y: 0.668, z: -(0.31 + U) }), [0.2, 0.17, 0.15]));
  }
  return kit.piece(parts, mat(kit, color));
}

function mergeVerts(THREE, g) {
  // tiny local weld (BufferGeometryUtils.mergeVertices without the import)
  const p = g.attributes.position, map = new Map(), idx = [], verts = [];
  for (let i = 0; i < p.count; i++) {
    const k = `${Math.round(p.getX(i) * 1e4)},${Math.round(p.getY(i) * 1e4)},${Math.round(p.getZ(i) * 1e4)}`;
    let j = map.get(k);
    if (j === undefined) { j = verts.length / 3; map.set(k, j); verts.push(p.getX(i), p.getY(i), p.getZ(i)); }
    idx.push(j);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  out.setIndex(idx);
  g.dispose();
  return out;
}

export default { p: pawn, n: knight, b: bishop, r: rook, q: queen, k: king };
