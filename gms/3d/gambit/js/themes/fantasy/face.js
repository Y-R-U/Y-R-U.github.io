// Fantasy theme: sculpted figurine heads (polish pass). The body fields run at a 0.022–0.025 cell,
// which turns a 0.05-radius head into an egg; a head is therefore its own small SDF meshed at a
// fine cell (~0.008) with a brow ridge, nose, cheekbones, eye sockets, ears, a hairline that leaves
// the face clear, and an optional beard + moustache. Value contrast does most of the work at board
// scale, so colour is painted by feature: warm skin vs darker sockets/eyes, brows, lips, and a beard
// or hair that is clearly lighter or darker than the skin.
//
//   head(THREE, {
//     key,                    cache key for the mesh (one mesh per style, recoloured per side)
//     R,                      head radius
//     at: [x, y, z],          head centre in figure coords (face looks toward -z)
//     hair: 'cap' | 'long' | 'queen',   beard: null | 'full' | 'long',  clipY: y (cut above, hidden by a hat/crown)
//     cell,
//   }, K) -> BufferGeometry (indexed, color + uv = glow/metal like every fantasy part)
//   K = { skin, skinShade, hair, hairShade, beard, beardShade, brow, lip, eye, eyeGlow }
import { sdf, P, mirrorX, colorize, smax } from './sdf.js';
import { mixRGB, scaleRGB, sstep } from './common.js';

const { hypot, sin, abs, max } = Math;
const L = { skin: 1, eye: 2, hair: 3, beard: 4 };
const cache = new Map();

function field(THREE, o) {
  const k = o.key;
  if (cache.has(k)) return cache.get(k);
  const R = o.R, S = sdf();
  const v = (x, y, z) => [x * R, y * R, z * R];
  // ---- skull + jaw, brow ridge, nose, cheekbones, ears
  S.add(P.ellipsoid(...v(0, 0.06, 0.06), 0.86 * R, 0.98 * R, 0.95 * R), L.skin);
  S.add(P.ellipsoid(...v(0, -0.36, -0.3), 0.6 * R, 0.6 * R, 0.6 * R), L.skin, 0.3 * R);
  S.add(P.capsule(v(-0.4, 0.24, -0.76), v(0.4, 0.24, -0.76), 0.16 * R), L.skin, 0.16 * R);
  S.add(P.capsule(v(0, 0.14, -0.9), v(0, -0.24, -1.1), 0.1 * R, 0.16 * R), L.skin, 0.1 * R);
  S.add(mirrorX(P.sphere(...v(0.46, -0.2, -0.6), 0.26 * R)), L.skin, 0.2 * R);
  S.add(mirrorX(P.ellipsoid(...v(0.87, -0.02, 0.06), 0.13 * R, 0.27 * R, 0.18 * R)), L.skin, 0.06 * R);
  // eye sockets under the brow, then a small eyeball in each
  S.cut(mirrorX(P.sphere(...v(0.35, 0.04, -0.98), 0.21 * R)), 0.1 * R);
  S.add(mirrorX(P.sphere(...v(0.34, 0.03, -0.8), 0.15 * R)), L.eye, 0.02 * R);
  // neck stub (overlaps the body's neck)
  if (!o.beard) S.add(P.capsule(v(0, -0.6, 0.1), v(0, -1.45, 0.16), 0.42 * R), L.skin, 0.2 * R);
  // ---- hair: a cap behind the hairline (forehead + face stay clear)
  const cap = P.ellipsoid(...v(0, 0.14, 0.12), 0.97 * R, 1.03 * R, 1.0 * R);
  const hairline = (x, y, z) => -(z / R + 0.38 - max(0, y / R - 0.42) * 1.4);   // < 0 behind the line
  S.add((x, y, z) => smax(cap(x, y, z), hairline(x, y, z) * R, 0.08 * R), L.hair, 0.05 * R);
  if (o.hair === 'long') {
    S.add(P.capsule(v(0, -0.1, 0.42), v(0, -1.35, 0.5), 0.8 * R, 0.62 * R, 0.92), L.hair, 0.2 * R);
  }
  if (o.hair === 'queen') {
    // locks falling in front of the shoulders, framing the face, and a low bun
    S.add(mirrorX(P.capsule(v(0.74, -0.05, -0.05), v(0.92, -1.5, -0.02), 0.3 * R, 0.24 * R)), L.hair, 0.14 * R);
    S.add(P.sphere(...v(0, -0.35, 0.95), 0.52 * R), L.hair, 0.18 * R);
    // centre parting: the hairline dips to a widow's peak and the cap is a touch fuller at the temples
    S.add(mirrorX(P.ellipsoid(...v(0.55, 0.45, -0.35), 0.35 * R, 0.38 * R, 0.4 * R)), L.hair, 0.15 * R);
  }
  // ---- beard + moustache
  if (o.beard) {
    const len = o.beard === 'long' ? 2.9 : 1.75, w = o.beard === 'long' ? 0.62 : 0.66;
    S.add(P.ellipsoid(...v(0, -0.6, -0.42), 0.78 * R, 0.55 * R, 0.6 * R), L.beard, 0.12 * R);
    S.add(P.capsule(v(0, -0.62, -0.62), v(0, -len, o.beard === 'long' ? -0.82 : -0.72), w * R, (o.beard === 'long' ? 0.1 : 0.26) * R, 0.86), L.beard, 0.18 * R);
    S.add(mirrorX(P.capsule(v(0.05, -0.4, -1.02), v(0.5, -0.62, -0.86), 0.13 * R, 0.07 * R)), L.beard, 0.06 * R);
  }
  const top = o.clipY != null ? o.clipY - o.at[1] : 2 * R;
  const box = { min: [-1.15 * R, o.beard === 'long' ? -3.05 * R : -1.95 * R, -1.35 * R], max: [1.15 * R, Math.min(1.2 * R, top + o.cell), 1.6 * R], cell: o.cell };
  const clip = o.clipY != null ? { f: (x, y) => y - top } : null;
  if (clip) S.cut((x, y, z) => -clip.f(x, y, z), 0);                // flat cut under the hat / crown band
  const m = S.mesh(THREE, box);
  cache.set(k, m);
  return m;
}

/** A sculpted head geometry in figure coords (see top of file). */
export function head(THREE, o, K) {
  const f = field(THREE, o), R = o.R;
  const g = colorize(THREE, { geom: f.geom.clone(), labels: f.labels }, (l, x, y, z) => {
    const X = x / R, Y = y / R, Z = z / R;
    switch (l) {
      case L.eye: return [...K.eye, K.eyeGlow || 0, 0];
      case L.hair: return [...mixRGB(K.hairShade, K.hair, sstep(-0.8, 0.6, Y)), 0, 0];
      case L.beard: {
        // roots darker, strands catching light toward the tips; a faint strand texture
        const strand = 0.92 + 0.08 * sin(X * 23 + Y * 3);
        const c = mixRGB(K.beardShade, K.beard, sstep(-0.35, -1.4, Y) * 0.8 + 0.2);
        return [...scaleRGB(c, strand), 0, 0];
      }
      default: {
        let c = K.skin;
        // eye sockets + under the brow: darker (reads as eyes at board scale)
        const ex = abs(X) - 0.35, eye = hypot(ex, (Y - 0.02) * 1.25);
        if (Z < -0.55) c = mixRGB(K.skinShade, c, sstep(0.18, 0.36, eye));
        // brows: a band along the top of the brow ridge
        if (Z < -0.5 && Y > 0.2 && Y < 0.42 && abs(X) > 0.1 && abs(X) < 0.62) c = mixRGB(K.brow, c, sstep(0.06, 0.1, abs(Y - 0.31 - 0.12 * (abs(X) - 0.35))));
        // lips
        if (Z < -0.7 && abs(X) < 0.28 && abs(Y + 0.55) < 0.07) c = mixRGB(c, K.lip, 0.75);
        // cheeks a touch warmer, the neck in shade
        if (Y < -0.75) c = mixRGB(c, K.skinShade, sstep(-0.75, -1.2, Y));
        return [...c, 0, 0];
      }
    }
  });
  g.translate(o.at[0], o.at[1], o.at[2]);
  return g;
}
