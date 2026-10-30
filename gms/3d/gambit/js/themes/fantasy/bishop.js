// Fantasy Bishop — a robed wizard with a tall crooked pointed hat and a staff topped with a
// glowing orb in a gold claw.
// Body (robe with folds, cape, stole, sleeves, beard) is a signed-distance sculpt meshed with
// surface nets; hat (lathe), staff and orb are plain geometry for crisp edges.
// Overhead read: the wide hat brim (a disc) with the bishop's dark SLOT carved across the
// crown + a gold tip bead, and the glowing orb beside it.
import { sdf, P, mirrorX, colorize, smax } from './sdf.js';
import { PAL, rgb, mixRGB, scaleRGB, sstep, prep, paintAbs, plinth, assemble } from './common.js';

const L = { robe: 1, cape: 2, stole: 3, trim: 4, skin: 5, hair: 6, hand: 7 };
const U = (u, v, x = 0) => [x, v, -u];
const { sin, cos, atan2, hypot, max, min, abs, PI } = Math;
const STAFF = { x: 0.185, u: 0.07 };     // staff in the wizard's right hand (+x), slightly forward

let cache = null, capeF = null;
function field(THREE) {
  if (cache) return cache;
  const S = sdf();
  // robe: a tall round cone with folds that deepen toward the hem
  const cone = P.capsule(U(0, 0.1), U(0, 0.56), 0.2, 0.095);
  const folds = (x, y, z) => 0.009 * sin(atan2(x, -z) * 9 + y * 6) * sstep(0.5, 0.14, y);
  const robe = (x, y, z) => cone(x, y, z) - folds(x, y, z) - max(0, 0.2 - y) * 0.2;
  S.add(robe, L.robe);
  // shoulders + chest
  S.add(P.ellipsoid(...U(0, 0.555), 0.13, 0.065, 0.095), L.robe, 0.05);
  // cape: painted (not a shell) so its edge is a soft line, not surface-net stair steps
  const backHalf = (x, y, z) => (-z) - 0.02 + 0.06 * sstep(0.45, 0.6, y) + 0.015 * sin(y * 40);
  capeF = backHalf;
  // gold collar edge on the cape
  S.add(P.torusY(0, 0.585, 0.005, 0.085, 0.016), L.trim, 0.012);
  // belt
  S.add(P.torusY(0, 0.4, 0, 0.122, 0.013), L.trim, 0.01);
  // head (mostly under the hat) + nose
  S.add(P.sphere(...U(0.012, 0.655), 0.058), L.skin, 0.03);
  S.add(P.sphere(...U(0.07, 0.655), 0.017), L.skin, 0.012);
  // beard: a long tapered wedge flowing down the chest
  S.add(P.capsule(U(0.048, 0.63), U(0.07, 0.43), 0.05, 0.012, 0.85), L.hair, 0.025);
  S.add(mirrorX(P.capsule(U(0.035, 0.66, 0.045), U(0.05, 0.6, 0.04), 0.022, 0.018)), L.hair, 0.02);
  // right arm: shoulder -> elbow -> hand on the staff, with a flared sleeve
  const hand = U(STAFF.u, 0.47, STAFF.x - 0.012);
  S.add(P.chain([[...U(0, 0.55, 0.11), 0.045], [...U(0.0, 0.44, 0.155), 0.04], [...U(STAFF.u - 0.03, 0.465, STAFF.x - 0.035), 0.05]]), L.robe, 0.03);
  S.add(P.sphere(...hand, 0.028), L.hand, 0.01);
  // left arm: bent across the belly, hand resting on the belt
  S.add(P.chain([[...U(0, 0.55, -0.11), 0.045], [...U(0.02, 0.44, -0.15), 0.04], [...U(0.105, 0.43, -0.07), 0.05]]), L.robe, 0.03);
  S.add(P.sphere(...U(0.13, 0.42, -0.03), 0.027), L.hand, 0.01);
  cache = S.mesh(THREE, { min: [-0.26, 0.09, -0.26], max: [0.26, 0.74, 0.26], cell: 0.025 });
  return cache;
}

function hat(THREE, kit, p) {
  // brim (slightly drooping edge) + a tall cone; the tip is bent back afterwards
  const prof = kit.profile()
    .pt(0.0, 0.688).pt(0.17, 0.698).bez(0.205, 0.7, 0.222, 0.684, 2)
    .arc(0.22, 0.692, 0.009, -60, 110, 2)
    .bez(0.19, 0.716, 0.105, 0.718, 2)
    .pt(0.1, 0.75).bez(0.085, 0.86, 0.05, 0.96, 6).bez(0.025, 1.04, 0.0, 1.1, 4);
  const g = prep(THREE, kit.lathe(prof.points(), { segments: 30 }), rgb(THREE, p.body));
  const body = rgb(THREE, p.body), band = rgb(THREE, p.cloth);
  // hat band in the side colour with a gold rim line; brim underside darker
  paintAbs(g, (x, y, z) => {
    const r = hypot(x, z);
    if (y > 0.722 && y < 0.775 && r < 0.11) return y > 0.765 ? { c: rgb(THREE, p.trim), metal: 1 } : band;
    if (r > 0.188 && y > 0.68) return { c: rgb(THREE, p === PAL.w ? p.trim : p.cloth), metal: p === PAL.w ? 1 : 0 };  // brim edge
    if (y < 0.7 && r < 0.2) return scaleRGB(body, 0.6);
    return null;
  });
  // the bishop's slot: a narrow dark strip running up the front of the crown — from above it is
  // a dark line from the tip to the brim, the mitre slot of a Staunton bishop.
  const cone = [[0.195, 0.7195], [0.15, 0.7215], [0.106, 0.7235]].map(([r, y]) => new THREE.Vector2(r, y))
    .concat(prof.points().filter(v => v.y >= 0.75 && v.y <= 1.0).map(v => new THREE.Vector2(v.x + 0.0045, v.y)));
  const slot = prep(THREE, kit.lathe(cone, { segments: 2, phiStart: PI - 0.22, phiLength: 0.44 }),
    rgb(THREE, p === PAL.w ? '#1c2440' : '#ff2a1a'), { glow: p === PAL.w ? 0 : 0.35 });
  if (p !== PAL.w) paintAbs(slot, () => ({ c: scaleRGB(rgb(THREE, '#ff2a1a'), 0.35) }));
  // crook the tip backward (+z = behind) so the silhouette is a wizard's, not a dunce cap
  for (const m of [g, slot]) {
    const pos = m.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i); if (y < 0.86) continue;
      const t = (y - 0.86) / 0.24;
      pos.setZ(i, pos.getZ(i) + 0.09 * t * t);
      pos.setY(i, y - 0.03 * t * t);
    }
    m.computeVertexNormals();
  }
  const bead = prep(THREE, kit.place(kit.sphere(0.024, 12, 8), { y: 1.065, z: 0.09 }), rgb(THREE, p.trim), { metal: 1 });
  return [g, slot, bead];
}

function staff(THREE, kit, p) {
  const x = STAFF.x, z = -STAFF.u;
  const shaft = prep(THREE, kit.place(kit.cylinder(0.012, 0.015, 0.84, 8), { x, y: 0.55, z }), rgb(THREE, p.trim), { metal: 1 });
  // wood tone for the shaft middle (white: pale ash, black: dark iron)
  paintAbs(shaft, (px, y) => (y > 0.2 && y < 0.88 ? { c: rgb(THREE, p === PAL.w ? '#c9a46a' : '#3a3540'), metal: p === PAL.w ? 0 : 1 } : null));
  const parts = [shaft];
  // claw: four gold prongs around the orb
  for (let i = 0; i < 4; i++) {
    const a = i * PI / 2 + PI / 4;
    const prong = kit.place(kit.cylinder(0.004, 0.009, 0.075, 5), { x: x + cos(a) * 0.022, y: 0.99, z: z + sin(a) * 0.022, rx: sin(a) * 0.45, rz: -cos(a) * 0.45 });
    parts.push(prep(THREE, prong, rgb(THREE, p.trim), { metal: 1 }));
  }
  parts.push(prep(THREE, kit.place(kit.cylinder(0.026, 0.014, 0.03, 10), { x, y: 0.955, z }), rgb(THREE, p.trim), { metal: 1 }));
  parts.push(prep(THREE, kit.place(kit.sphere(0.034, 12, 8), { x, y: 1.0, z }), rgb(THREE, p.gem), { glow: 0.45 }));
  return parts;
}

export function bishop(THREE, kit, { color }) {
  const p = PAL[color];
  const f = field(THREE);
  const C = h => rgb(THREE, h);
  const body = C(p.body), shade = C(p.bodyShade);
  const g = colorize(THREE, { geom: f.geom.clone(), labels: f.labels }, (l, x, y, z) => {
    switch (l) {
      case L.cape: return [...mixRGB(C(p.clothDeep), C(p.cloth), sstep(0.15, 0.5, y)), 0, 0];
      case L.stole: return [...C(p.cloth), 0, 0];
      case L.trim: return [...C(p.trim), 0, 1];
      case L.hair: return [...mixRGB(C(p.hairShade), C(p.hair), sstep(0.45, 0.6, y)), 0, 0];
      case L.skin: return [...mixRGB(body, C(color === 'w' ? '#e8c9a8' : '#3a3036'), 0.6), 0, 0];
      case L.hand: return [...mixRGB(body, C(color === 'w' ? '#e8c9a8' : '#3a3036'), 0.6), 0, 0];
      default: {
        const robe = mixRGB(shade, body, sstep(0.12, 0.35, y));
        const cape = mixRGB(C(p.clothDeep), C(p.cloth), sstep(0.15, 0.5, y));
        const k = y < 0.6 ? sstep(0.012, -0.012, capeF(x, y, z)) : 0;
        const stole = -z > 0 && y < 0.54 ? sstep(0.05, 0.035, Math.abs(x)) : 0;   // band down the front
        return [...mixRGB(mixRGB(robe, C(p.cloth), stole), cape, k), 0, 0];
      }
    }
  });
  return assemble(kit, color, [...plinth(THREE, kit, color, { R: 0.34, H: 0.13, seg: 28 }), g, ...hat(THREE, kit, p), ...staff(THREE, kit, p)]);
}
