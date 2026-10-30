// Sci-fi Bishop: "Psi Oracle". A slender android mystic: a panelled hard-surface robe flaring
// to a glowing hem, split down the front by a light-line, a slim chest under a faceted mantle
// collar with shoulder plates, sleeved arms meeting in front around a floating psi orb, and a
// tall ogive helmet SPLIT front-to-back: the two shells stand apart and a glowing blade fills
// the gap (the mitre slot), with a small floating orb above the tip. A dark glass faceplate
// with a glowing eye-line sits at the front (-z) of the helmet.
// Overhead read: a dome cut in half by a bright line + a bright dot, on a round pad ring.
import { hsLathe, prep, assemble, strut, chamferRect } from './common.js';

const { PI } = Math;

export function bishop(THREE, kit, { color }) {
  const parts = [];

  // ---- deck pad ----
  parts.push(hsLathe(THREE, color, [
    [0, 0, 'dark'], [0.272, 0, 'dark'], [0.295, 0.02, 'shade'], [0.295, 0.044, 'body'],
    [0.281, 0.058, 'trim'], [0.264, 0.058, 'body'],
    [0.264, 0.05, 'dark'], [0.26, 0.048, 'line'], [0.232, 0.048, 'line'], [0.228, 0.05, 'line'], [0.228, 0.062, 'dark'],
    [0.21, 0.066, 'deck'], [0, 0.066, 'deck'],
  ], { seg: 32 }));

  // ---- robe: flared hard-surface skirt, glowing hem band, panel grooves, chest + waist ----
  const robe = [
    [0, 0.066, 'dark'], [0.205, 0.066, 'dark'], [0.215, 0.074, 'trim'], [0.215, 0.086, 'trim'],
    [0.21, 0.09, 'dark'], [0.208, 0.092, 'line'], [0.205, 0.106, 'lineHi'], [0.203, 0.108, 'line'], [0.2, 0.112, 'dark'],   // hem light band
    [0.196, 0.118, 'shade'],
  ];
  // skirt curve (concave flare) up to the waist
  for (let i = 1; i <= 8; i++) {
    const t = i / 8, y = 0.118 + t * 0.31;
    const r = 0.196 - 0.106 * Math.pow(t, 0.75);
    if (i === 4) robe.push([r + 0.004, y - 0.008, 'body', true], [r - 0.004, y - 0.004, 'dark'], [r - 0.004, y + 0.004, 'dark'], [r + 0.002, y + 0.008, 'dark']);
    else robe.push([r, y, 'body', i > 0 && i < 8]);
  }
  // sash belt
  robe.push([0.094, 0.43, 'trim'], [0.098, 0.436, 'trim'], [0.098, 0.452, 'trim'], [0.09, 0.458, 'dark']);
  // chest: widening to the shoulders
  robe.push([0.088, 0.47, 'shade'], [0.1, 0.52, 'body', true], [0.112, 0.565, 'body', true], [0.114, 0.59, 'body'], [0.08, 0.6, 'dark'], [0, 0.6, 'dark']);
  parts.push(hsLathe(THREE, color, robe, { seg: 28 }));

  // robe front split: a glowing seam down the front (-z) of the skirt, plus two side seams (dark)
  {
    const pts = robe.filter(p => p[1] >= 0.12 && p[1] <= 0.43 && p[2] !== 'dark');
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      parts.push(strut(THREE, color, [0, a[1], -a[0] - 0.003], [0, b[1], -b[0] - 0.003],
        () => chamferRect(0.016, 0.008, 0.002, { side: 'line', top: 'lineHi', bot: 'line', ch: 'line' }), [0, 1], { capStart: 'line', capEnd: 'line' }));
    }
  }

  // ---- mantle collar: faceted, flared, light band on its edge ----
  parts.push(hsLathe(THREE, color, [
    [0.07, 0.575, 'dark'], [0.12, 0.575, 'shade'], [0.158, 0.61, 'shade'], [0.162, 0.618, 'trim'],
    [0.16, 0.626, 'line'], [0.152, 0.634, 'trim'], [0.11, 0.66, 'body'], [0.062, 0.672, 'trim'], [0, 0.672, 'dark'],
  ], { seg: 8, flat: true, phiStart: PI / 8 }));

  // ---- angular shoulder plates (faceted, swept down and out) ----
  for (const s of [-1, 1]) {
    const sp = hsLathe(THREE, color, [
      [0, -0.014, 'dark'], [0.05, -0.014, 'dark'], [0.056, -0.006, 'line'], [0.056, 0.0, 'trim'], [0.04, 0.02, 'body'], [0, 0.026, 'shade'],
    ], { seg: 6, flat: true });
    sp.scale(1, 1, 1.2); sp.rotateZ(-s * 0.42);
    parts.push(kit.place(sp, { x: s * 0.128, y: 0.632 }));
  }

  // ---- sleeves (polish-3): a round upper arm hanging at the side, then a bell sleeve flaring forward to
  // the hands — octagonal sections so they read as sleeves from every side, not a flat strap ----
  const oct = (rx, ry) => Array.from({ length: 8 }, (_, i) => {
    const a = -PI / 2 + PI / 8 + i * PI / 4, sy = Math.sin(a);
    return [rx * Math.cos(a), ry * sy, sy < -0.3 ? 'shade' : 'body'];
  });
  for (const s of [-1, 1]) {
    parts.push(strut(THREE, color, [s * 0.126, 0.632, 0.006], [s * 0.14, 0.528, -0.026], t => oct(0.029 + 0.005 * t, 0.031 + 0.004 * t),
      [0, 1], { capStart: false, capEnd: false }));
    parts.push(strut(THREE, color, [s * 0.141, 0.542, -0.02], [s * 0.068, 0.474, -0.112],
      t => oct(0.034 + 0.03 * t ** 1.6, 0.037 + 0.025 * t ** 1.6),
      [0, 0.45, 0.84, { t: 0.88, key: 'line' }, { t: 0.95, key: 'line' }, { t: 1, key: 'trim' }], { capStart: false, capEnd: 'dark' }));
    parts.push(prep(THREE, kit.place(new THREE.SphereGeometry(0.019, 8, 6), { x: s * 0.044, y: 0.48, z: -0.124 }), color, 'trim'));
  }
  // psi orb between the hands, with a thin trim ring around it
  parts.push(prep(THREE, kit.place(new THREE.SphereGeometry(0.03, 14, 10), { y: 0.505, z: -0.14 }), color, 'lineHi'));
  parts.push(prep(THREE, kit.place(new THREE.TorusGeometry(0.045, 0.004, 6, 24), { y: 0.505, z: -0.14, rx: 0.5 }), color, 'trim'));

  // ---- neck ----
  parts.push(hsLathe(THREE, color, [[0.04, 0.665, 'dark'], [0.034, 0.7, 'dark'], [0.03, 0.71, 'trim']], { seg: 12 }));

  // ---- head: jaw, face, brow groove ----
  parts.push(hsLathe(THREE, color, [
    [0, 0.685, 'dark'], [0.056, 0.685, 'dark'], [0.07, 0.7, 'trim'], [0.086, 0.725, 'body', true], [0.093, 0.75, 'body', true],
    [0.092, 0.772, 'body'], [0.084, 0.778, 'dark'], [0, 0.778, 'dark'],
  ], { seg: 24 }));

  // ---- split mitre (polish-3): a rim band, then two POINTED half-shells leaning apart from the brow so a
  // V-shaped cleft opens toward the top. The cut faces glow (caps finished 'line') and a light blade stands
  // low in the cleft, so from any side you look down into a lit gap between two horns, not at an egg. ----
  const base = 0.8, H = 0.205, LEAN = 0.42, GAP = 0.016, ZS = 1.08, XS = 0.72;
  const SPLAY = 0.3;   // the horns also splay front/back a little, so a pure side view shows two tips, not one dome
  parts.push(hsLathe(THREE, color, [
    [0, 0.774, 'dark'], [0.094, 0.774, 'dark'], [0.101, 0.781, 'trim'], [0.101, 0.79, 'line'], [0.098, 0.797, 'trim'],
    [0.09, 0.804, 'dark'], [0, 0.804, 'dark'],
  ], { seg: 24 }));
  const shell = [[0, base - 0.02, 'line'], [0.094, base - 0.02, 'dark']];
  for (let i = 0; i <= 9; i++) {
    const t = i / 9;
    shell.push([i === 9 ? 0 : 0.094 * (1 - t) ** 0.85 * (1 + 0.55 * t), base + t * H, i === 0 ? 'trim' : 'body', i > 0 && i < 9]);
  }
  for (const s of [-1, 1]) {
    const h = hsLathe(THREE, color, shell, { seg: 6, flat: true, phiStart: s > 0 ? 0 : PI, phiLength: PI, caps: true });
    h.scale(XS, 1, ZS); h.translate(0, -base, 0); h.rotateZ(-s * LEAN); h.rotateX(s * SPLAY); h.translate(s * GAP, base, 0);
    parts.push(h);
  }
  const tipY = base + H * Math.cos(LEAN);
  {
    // the blade: a plate in the y-z plane standing in the cleft, lower than the horns
    const prof = shell.slice(2).map(([r, y]) => [r * 0.9 * ZS, base - 0.01 + (y - base) * 0.84]);
    const shape = new THREE.Shape();
    shape.moveTo(-0.1, base - 0.02);
    for (const [r, y] of prof) shape.lineTo(-r, y);
    for (const [r, y] of prof.slice().reverse()) shape.lineTo(r, y);
    shape.lineTo(0.1, base - 0.02);
    const blade = new THREE.ExtrudeGeometry(shape, { depth: 0.02, bevelEnabled: false, curveSegments: 1 });
    blade.translate(0, 0, -0.01); blade.rotateY(PI / 2);      // plate in the y-z plane
    parts.push(prep(THREE, blade, color, 'lineHi'));
  }
  // faceplate: dark glass visor on the front of the helmet, with a glowing eye-line
  {
    const R = 0.1, v = new THREE.SphereGeometry(R, 16, 5, PI * 1.5 - 0.8, 1.6, PI / 2 - 0.18, 0.5);
    v.scale(1.0, 0.75, 1.0); v.translate(0, 0.735, 0);
    parts.push(prep(THREE, v, color, 'glass'));
    const e = new THREE.SphereGeometry(R + 0.003, 16, 1, PI * 1.5 - 0.6, 1.2, PI / 2 - 0.01, 0.05);
    e.scale(1.0, 0.75, 1.0); e.translate(0, 0.735, 0);
    parts.push(prep(THREE, e, color, 'lineHi'));
  }
  // floating orb above the tip
  parts.push(prep(THREE, kit.place(new THREE.SphereGeometry(0.023, 10, 8), { y: tipY + 0.012 }), color, 'lineHi'));   // floats in the V between the horns

  return assemble(kit, color, parts);
}
