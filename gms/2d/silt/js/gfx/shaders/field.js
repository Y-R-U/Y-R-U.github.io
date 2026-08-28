import { LIB, HEAD } from './lib.js';

/* ------------------------------------------------------------------ backdrop
   Biome sky. Everything the material layer refracts and casts onto.        */
export const BG_FS = HEAD + LIB + `
uniform vec2  u_res;
uniform vec4  u_rect;      // board rect in screen uv: x, y, w, h
uniform float u_time;
uniform vec3  u_skyTop, u_skyBot, u_glowCol, u_moteCol;
uniform vec2  u_glowPos;
uniform float u_glowAmt, u_moteAmt, u_bandAmt;
uniform vec2  u_glowTight;   // anisotropic: a low x makes the key a wide wash, a high y a shaft
uniform vec4  u_well;      // interior: base, floor pool, side falloff, roof falloff
uniform vec4  u_well2;     // outside, pool exponent, pool tint, lip
out vec4 frag;

void main() {
  vec2 uv = v_uv;
  float asp = u_res.x / max(u_res.y, 1.0);

  vec3 c = mix(u_skyBot, u_skyTop, pow(uv.y, 0.85));

  // one tight key glow — gives the whole frame a direction before a grain is drawn
  vec2 d = (uv - u_glowPos) * vec2(asp, 1.0);
  c += u_glowCol * exp(-dot(d * d, u_glowTight)) * u_glowAmt;

  // slow drifting haze so a flat gradient never bands
  float n = fbm3(vec2(uv.x * 2.6 * asp, uv.y * 2.0) + vec2(u_time * 0.013, -u_time * 0.021));
  c *= 0.84 + 0.32 * n;
  c += u_glowCol * u_bandAmt * pow(max(0.0, n - 0.45), 2.0) * 1.4;

  // motes / bioluminescent specks / embers, three parallax layers
  float m = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float sc = 26.0 + fi * 34.0;
    vec2 p = vec2(uv.x * asp, uv.y) * sc + vec2(sin(u_time * 0.07 + fi) * 1.4, -u_time * (0.010 + fi * 0.016) * sc * 0.05);
    vec2 ip = floor(p), fp = fract(p);
    vec2 o = h22(ip + fi * 17.0);
    float bright = ss(0.86, 1.0, h12(ip + fi * 5.5));
    float tw = 0.55 + 0.45 * sin(u_time * (1.1 + 2.0 * o.x) + o.y * 44.0);
    m += bright * tw * ss(0.10, 0.0, length(fp - o)) / (1.0 + fi * 0.9);
  }
  c += u_moteCol * m * u_moteAmt;

  // The well. An empty board still has to be composed, so the vessel carries the
  // frame on its own: dark walls, light pooling on the floor, a lit lip.
  vec2 b = (uv - u_rect.xy) / u_rect.zw;
  vec2 e = min(b, 1.0 - b);
  float inside = step(0.0, min(e.x, e.y));

  vec3 outer = c * u_well2.x;
  float pool = exp(-max(b.y, 0.0) * u_well2.y);
  float side = ss(0.0, 0.085, e.x);
  float roof = ss(0.0, 0.26, 1.0 - b.y);
  vec3 inner = c * (u_well.x + u_well.y * pool)
                 * ((1.0 - u_well.z) + u_well.z * side)
                 * ((1.0 - u_well.w) + u_well.w * roof);
  inner += u_glowCol * pow(pool, 1.7) * u_well2.z;
  inner *= 0.90 + 0.20 * fbm3(vec2(b.x * 3.0, b.y * 7.0) + 19.0);   // faint wall grain
  c = mix(outer, inner, inside);

  float lip = inside * (1.0 - ss(0.0, 0.0045, min(e.x, e.y)));
  c += u_glowCol * lip * u_well2.w;

  frag = vec4(max(c, 0.0), 1.0);
}`;

/* ------------------------------------------------------- density + colour
   The whole trick lives here. ONE weighted kernel over the state grid, read
   TWO different ways:
     - density sums the raw gaussian weights   -> a smooth, cohesive silhouette
     - colour uses the SAME weights raised to a high power (a soft argmax)
       -> a dominant-tint vote, so boundaries stay a third of a cell wide
   Averaging colour with the density weights is what makes every other
   falling-sand renderer look like mud; skipping the density blur is what makes
   them look like squares. Doing both, separately, is the entire idea.

   Compiled twice: R=2/SIG=0.78 (high, 25 taps) and R=1/SIG=0.60 (low, 9).   */
export const RESOLVE_FS = (R, SIG, KNORM) => HEAD + LIB + `
#define R ${R}
const float SIG2 = ${(2 * SIG * SIG).toFixed(6)};
const float KNORM = ${KNORM.toFixed(6)};
const float VOTE = 5.0;      // colour weight exponent: soft argmax

uniform sampler2D u_state;
uniform vec2  u_grid;
uniform vec3  u_tint[8];
uniform vec3  u_matCol[12];
uniform vec4  u_matProp[12];   // fluid, emissive, translucent, tintMix
uniform float u_matStatic[12]; // 1 for the built world: WALL, ICE, CRYSTAL
uniform float u_time;
uniform float u_dissolve;      // DISSOLVE_TICKS

layout(location = 0) out vec4 oField;   // rgb = voted colour, a = density
layout(location = 1) out vec4 oAux;     // fluid, emissive, translucent, dissolve flash
layout(location = 2) out vec4 oPiece;   // rgb = the piece's own tint, a = piece coverage
layout(location = 3) out vec4 oSolid;   // r = crisp STATIC coverage. See below.

void main() {
  // board space, y measured UP from the floor; texture row 0 is the ceiling,
  // so the row index counts back down from rows-1.
  vec2 cell = v_uv * u_grid;
  vec2 jit = (vec2(vn(cell * 0.33 + 4.7), vn(cell * 0.33 + 21.9)) - 0.5) * 0.85;
  cell += jit;
  // The built world takes 40% of the same wander. Enough that a rib is chiselled
  // rather than ruled; little enough that a 2-cell divider stays where the sim
  // put it — at 4.9 device px per cell the full jitter moved the drawn edge by
  // two px, and a wall a player plans around should not lie about where it is.
  vec2 cellS = cell - jit * 0.60;
  ivec2 ic = ivec2(floor(cell));
  ivec2 gi = ivec2(u_grid);

  float dens = 0.0, flash = 0.0, colW = 0.0, pieceW = 0.0, solid = 0.0;
  vec3 colAcc = vec3(0.0), props = vec3(0.0), pieceCol = vec3(0.0);

  for (int j = -R; j <= R; j++) {
    for (int i = -R; i <= R; i++) {
      ivec2 c = ic + ivec2(i, j);
      if (c.y >= gi.y) continue;                 // above the ceiling really is empty
      ivec2 cs = ivec2(clamp(c.x, 0, gi.x - 1), max(c.y, 0));   // floor and walls extend
      vec4 s = texelFetch(u_state, ivec2(cs.x, gi.y - 1 - cs.y), 0);
      int m = int(s.r * 255.0 + 0.5);
      if (m == 0) continue;
      int fl = int(s.a * 255.0 + 0.5);

      float fill = s.b;
      float fv = 0.0;
      vec2 cc = vec2(c) + 0.5;   // weight from the UNCLAMPED position

      if ((fl & 1) != 0) {
        // dissolving: B is the countdown, not a fill. p goes 0 -> 1.
        float p = clamp(1.0 - (s.b * 255.0) / u_dissolve, 0.0, 1.0);
        float n = h12(vec2(cs) * 0.37 + 11.3);
        // crumble, don't fade: low-hash cells go first so the chain erodes
        fill = 1.0 - ss(n * 0.55, n * 0.55 + 0.50, p);
        cc.y += p * p * 1.15;                                   // lift
        cc.x += sin(p * 7.0 + n * 6.2831) * p * 0.45;           // wobble
        // the money shot: an emissive band sweeping the chain wall to wall
        float sweep = exp(-pow((p * 1.55 - 0.24 - cc.x / u_grid.x) * 9.5, 2.0));
        fv = (0.05 + 0.95 * sweep) * (1.0 - p * 0.45);
      }
      if (fill <= 0.002) continue;

      vec2 d = cell - cc;
      float w = exp(-dot(d, d) / SIG2) * fill;
      dens += w;
      flash += fv * w;          // WEIGHTED. An unweighted sum over 25 taps is 6x hot.

      vec4 pr = u_matProp[m];
      props += pr.xyz * w;

      int ti = int(s.g * 255.0 + 0.5);
      vec3 col = u_matCol[m];
      if (ti > 0) col = mix(col, u_tint[ti > 7 ? 7 : ti], pr.w);
      float cw = pow(w, VOTE);
      colAcc += col * cw;
      colW += cw;

      // THE BUILT WORLD GETS ITS OWN, UNBLURRED COVERAGE.
      // The gaussian above plus the separable blur that follows it is what
      // rounds a heap into a dune, and it is fatal to anything thin: a 2-cell
      // column resolves to a smoothed density of 0.338 against a cover
      // threshold of 0.42, so it is not dimly drawn, it is NOT DRAWN — which is
      // exactly what a player reported about the tutorial's 2-cell dividers.
      //
      // Sand is poured and should be rounded. WALL, ICE and CRYSTAL are BUILT:
      // permanent, never flowing, and the thing a player plans around. They get
      // a bilinear TENT instead of a gaussian — a partition of unity, so the
      // interior of a static body is exactly 1.0 at any thickness down to one
      // cell, and the silhouette falls off over a single cell at its true
      // extent rather than being averaged away. It is evaluated at cellS —
      // 40% of the sampling jitter — so the edge is chiselled rather than
      // ruled without wandering far from where the sim put the wall.
      if (u_matStatic[m] > 0.5) {
        vec2 sd = cellS - cc;
        solid += max(0.0, 1.0 - abs(sd.x)) * max(0.0, 1.0 - abs(sd.y)) * fill;
      }

      // The airborne piece gets its own channel. It is the one object the
      // player has to IDENTIFY rather than admire, and an isolated blob with no
      // occlusion under it takes the whole light rig at once, which is exactly
      // where every hue turns to cream. The lighting pass needs to know.
      if ((fl & 16) != 0) { pieceW += w; pieceCol += col * w; }
    }
  }

  float dn = dens * KNORM;
  if (dens > 1e-5) { colAcc /= colW; props /= dens; flash /= dens; }
  oField = vec4(colAcc, min(dn, 1.35));
  oAux = vec4(props, flash);
  oPiece = vec4(pieceW > 1e-5 ? pieceCol / pieceW : vec3(0.0), min(pieceW * KNORM, 1.0));
  oSolid = vec4(clamp(solid, 0.0, 1.0), 0.0, 0.0, 1.0);
}`;

/* ---------------------------------------------------------- occlusion field
   A quarter-res blur of the density. Sampled straight for cavity darkening and
   sampled toward the key light for a soft cast shadow — which is most of what
   makes a heap read as a DUNE and not a coloured blob.                       */
export const DENS_X_FS = HEAD + `
uniform sampler2D u_src;
uniform vec2 u_dir;
out vec4 frag;
void main() {
  float s = texture(u_src, v_uv).a * 0.227027;
  s += (texture(u_src, v_uv + u_dir * 1.3846154).a + texture(u_src, v_uv - u_dir * 1.3846154).a) * 0.3162162;
  s += (texture(u_src, v_uv + u_dir * 3.2307692).a + texture(u_src, v_uv - u_dir * 3.2307692).a) * 0.0702703;
  frag = vec4(s, 0.0, 0.0, 1.0);
}`;

/* Occlusion takes the UNION of the smoothed density and the crisp static
   coverage. A wall is stuff: it should darken the backdrop it stands in front
   of, cast a shadow across the sand beside it and cut its own ambient. It
   already did when it was wide, because a wide body survives the blur; a thin
   one did not, so a 2-cell divider cast no shadow at all. Same semantics at
   every thickness. */
export const OCC_DOWN_FS = HEAD + `
uniform sampler2D u_src, u_solid;
uniform vec2 u_texel;
out vec4 frag;
float d(vec2 p) { return max(texture(u_src, p).r, texture(u_solid, p).r); }
void main() {
  float a = d(v_uv + u_texel * vec2(-1, -1));
  a += d(v_uv + u_texel * vec2(1, -1));
  a += d(v_uv + u_texel * vec2(-1, 1));
  a += d(v_uv + u_texel * vec2(1, 1));
  frag = vec4(a * 0.25, 0.0, 0.0, 1.0);
}`;

export const OCC_BLUR_FS = HEAD + `
uniform sampler2D u_src;
uniform vec2 u_dir;
out vec4 frag;
void main() {
  float s = texture(u_src, v_uv).r * 0.227027;
  s += (texture(u_src, v_uv + u_dir * 1.3846154).r + texture(u_src, v_uv - u_dir * 1.3846154).r) * 0.3162162;
  s += (texture(u_src, v_uv + u_dir * 3.2307692).r + texture(u_src, v_uv - u_dir * 3.2307692).r) * 0.0702703;
  frag = vec4(s, 0.0, 0.0, 1.0);
}`;

/* ----------------------------------------------------------------- lighting
   Full-res. Normals from the density gradient, then a warm key / cool fill /
   rim rig with per-material roughness, subsurface and refraction.           */
export const LIGHT_FS = (REFRACT) => HEAD + LIB + `
#define REFRACT ${REFRACT ? 1 : 0}

uniform sampler2D u_field, u_aux, u_occ, u_bg, u_smooth, u_piece, u_solid;
uniform vec2  u_res, u_grid;
uniform vec4  u_rect;
uniform vec2  u_ftex;        // 1 / resolve target size
uniform float u_time;

uniform vec2  u_keyDir, u_fillDir;
uniform vec3  u_keyCol, u_fillCol, u_ambCol, u_rimCol, u_emisCol;
uniform float u_rimAmt, u_specAmt, u_sssAmt, u_grainAmt;
uniform float u_refrAmt, u_aoAmt, u_shadowAmt, u_relief;
uniform vec3  u_pieceCtl;    // chroma push, luma pull, own-hue rim
uniform vec3  u_staticCtl;   // bevel strength, thin-rib rim share, thin-rib sss share

out vec4 frag;

float dens(vec2 b) { return texture(u_smooth, b).r; }

void main() {
  vec2 b = (v_uv - u_rect.xy) / u_rect.zw;
  vec3 bg = texture(u_bg, v_uv).rgb;

  // CLIP TO THE VESSEL. The resolve kernel deliberately extends the floor and
  // the walls (cs = clamp(...) in RESOLVE_FS) so a pile sits FLUSH against
  // them instead of thinning out — but this pass used to run over a 2% margin
  // outside u_rect on a clamped lookup, which smeared that same edge material
  // out past the lip. At 390x844 that is ~16 px under the floor and ~8 px
  // through each wall, which is exactly what it looked like on a phone.
  // The clamp stays (no thinning); the smear does not.
  if (b.x < 0.0 || b.y < 0.0 || b.x > 1.0 || b.y > 1.0) { frag = vec4(bg, 1.0); return; }
  vec2 bc = clamp(b, 0.0, 1.0);
  // half-pixel feather on the lip itself, so the cut is a straight edge and not
  // a staircase
  vec2 bpx = u_rect.zw * u_res;                     // board size in screen px
  vec2 ed = min(b, 1.0 - b) * bpx;                  // distance to the lip, px
  float clip = clamp(min(ed.x, ed.y) + 0.5, 0.0, 1.0);

  vec4 f = texture(u_field, bc);
  vec4 ax = texture(u_aux, bc);
  vec4 pf = texture(u_piece, bc);
  float d = texture(u_smooth, bc).r;

  // ---- the BUILT WORLD, on its own crisp coverage.
  // d (u_smooth) is the poured-material field: a gaussian resolve followed by a
  // wide separable blur, which is what turns a heap into a dune and is fatal to
  // anything thin. Peak smoothed density at the centre of a static column,
  // computed from the shipped kernel (R=2, SIG=0.80, blur radius 1.15 cells)
  // and matching the measured ladder exactly:
  //     1 cell 0.178   2 cells 0.338   3 cells 0.502   4 cells 0.675
  // against a cover threshold of ss(0.42, 0.62). So one- and two-cell scenery
  // was not dim, it was ABSENT: cover resolved to exactly zero and the lighting
  // pass returned the backdrop.
  //
  // Established by isolation rather than argued — driving the wall albedo to
  // 4.0, twenty-four times what ships, moved a 3-cell wall by 124 brightness
  // units and a 2-cell wall by 0.2, which is the noise floor. No albedo can
  // light a pixel that is never covered.
  //
  // solid is a partition-of-unity tent over STATIC materials only, so it is
  // 1.0 inside a body of any thickness and falls off over one cell at the true
  // silhouette. Sand and every liquid are untouched by all of this.
  float solid = texture(u_solid, bc).r;
  float sCov  = ss(0.34, 0.66, solid);
  // 1 on the outer half-cell of a static body, 0 in its interior: the cut face.
  float sEdge = sCov * (1.0 - ss(0.55, 0.99, solid));
  // 1 where the built world is carrying this pixel on its own (a thin rib), 0
  // where there is enough poured material for the density field to shade it.
  float sThin = sCov * (1.0 - ss(0.28, 0.60, d));

  // How much of this pixel is the AIRBORNE piece. Settled material is 0.
  float piece = clamp(pf.a * 1.3, 0.0, 1.0);

  float occ = texture(u_occ, bc).r;
  // cast shadow: is the ground TOWARD the light denser than here?
  float occL = texture(u_occ, clamp(bc + u_keyDir * 0.055, 0.0, 1.0)).r;

  // the pile darkens the back wall it sits in front of
  float contact = texture(u_occ, clamp(bc - u_keyDir * 0.022, 0.0, 1.0)).r;
  bg *= 1.0 - u_aoAmt * 0.55 * ss(0.05, 0.95, contact);

  float cover = max(ss(0.42, 0.62, d), sCov) * clip;
  if (cover <= 0.001) { frag = vec4(bg, 1.0); return; }

  // ---- normal from the density gradient
  vec2 e = u_ftex * 1.6;
  float gx = dens(bc + vec2(e.x, 0.0)) - dens(bc - vec2(e.x, 0.0));
  float gy = dens(bc + vec2(0.0, e.y)) - dens(bc - vec2(0.0, e.y));
  vec3 nS = normalize(vec3(-gx, -gy, u_relief * 0.85));

  vec2 oe = vec2(6.0) / vec2(u_grid);
  float ox = texture(u_occ, clamp(bc + vec2(oe.x, 0.0), 0.0, 1.0)).r - texture(u_occ, clamp(bc - vec2(oe.x, 0.0), 0.0, 1.0)).r;
  float oy = texture(u_occ, clamp(bc + vec2(0.0, oe.y), 0.0, 1.0)).r - texture(u_occ, clamp(bc - vec2(0.0, oe.y), 0.0, 1.0)).r;
  vec3 nB = normalize(vec3(-ox * 3.4, -oy * 3.4, 0.42));

  vec3 n = normalize(nS * (0.30 + 0.70 * ss(0.85, 0.35, d)) + nB * 1.25);

  // A thin rib has almost no density gradient to be shaded from, so it would
  // come out as a flat sticker. Take its normal from the coverage it actually
  // has: zero slope across the interior (a hewn face IS flat) and a hard bevel
  // over the outer cell, which is what gives a 2-cell divider a lit side and a
  // shadowed side instead of one average colour.
  if (sThin > 0.002) {
    vec2 sg = u_ftex * 2.0;
    float sx = texture(u_solid, clamp(bc + vec2(sg.x, 0.0), 0.0, 1.0)).r
             - texture(u_solid, clamp(bc - vec2(sg.x, 0.0), 0.0, 1.0)).r;
    float sy = texture(u_solid, clamp(bc + vec2(0.0, sg.y), 0.0, 1.0)).r
             - texture(u_solid, clamp(bc - vec2(0.0, sg.y), 0.0, 1.0)).r;
    vec3 nSol = normalize(vec3(-sx * u_staticCtl.x, -sy * u_staticCtl.x, u_relief * 0.62));
    n = normalize(mix(n, nSol, sThin));
  }

  float fluid = clamp(ax.x, 0.0, 1.0);
  float emis  = clamp(ax.y, 0.0, 1.0);
  float trans = clamp(ax.z, 0.0, 1.0);
  float grain = clamp(1.0 - fluid - trans, 0.0, 1.0);

  // ---- grain, in CELL space so it belongs to the board, not to the screen
  vec2 cs = bc * u_grid;
  vec2 sc = cs * vec2(0.042, 0.155);
  float st = vn(sc) * 0.46 + vn(sc * 2.15 + 5.1) * 0.29 + vn(sc * 4.7 + 12.2) * 0.16 + vn(sc * 9.3 + 2.4) * 0.09;
  float gn = st * 0.80 + vn(cs * 0.42 + 31.7) * 0.20;
  float gc = vn(sc * 1.05 + 3.3);
  vec2 gd = vec2(vn(sc * 1.05 + 7.1) - gc, vn(sc * 1.05 + 19.3) - gc);
  n = normalize(n + vec3(gd * u_grainAmt * grain * 0.50, 0.0));

  // Layer seams. In a sand bottle a tint boundary is a physical interface: a
  // lip, a shadow, a slight lift. Painting it as a clean colour edge is what
  // makes a coloured heap look like a decal, so the gradient of the VOTED
  // COLOUR drives its own micro-relief.
  vec2 se = u_ftex * 2.2;
  vec3 cL = texture(u_field, clamp(bc - vec2(se.x, 0.0), 0.0, 1.0)).rgb;
  vec3 cR = texture(u_field, clamp(bc + vec2(se.x, 0.0), 0.0, 1.0)).rgb;
  vec3 cD = texture(u_field, clamp(bc - vec2(0.0, se.y), 0.0, 1.0)).rgb;
  vec3 cU = texture(u_field, clamp(bc + vec2(0.0, se.y), 0.0, 1.0)).rgb;
  float seam = clamp((distance(cR, cL) + distance(cU, cD)) * 2.6, 0.0, 1.0);
  n = normalize(n + vec3(-(luma(cR) - luma(cL)), -(luma(cU) - luma(cD)), 0.0) * 1.45 * grain);

  vec3 albedo = f.rgb;

  // ---- the piece in flight is a READ, not a picture.
  // It is the only thing on screen the player has to identify rather than
  // admire, and it is also the worst-lit object in the scene: a small blob with
  // nothing under it takes the whole rig unoccluded, lands at the top of the
  // ACES curve, and every hue there flattens toward cream. Two moves, both
  // needed: push the albedo's distance from grey, and pull its luma DOWN off
  // the shoulder so the curve stops eating the chroma. Third move below: rim it
  // in its own hue instead of the key's.
  vec3 pHue = vec3(0.0);
  if (piece > 0.002) {
    float pl = luma(pf.rgb);
    pHue = max(mix(vec3(pl), pf.rgb, 1.0 + u_pieceCtl.x), 0.0);
    albedo = mix(albedo, pHue * (1.0 - u_pieceCtl.y), piece);
  }

  albedo *= 1.0 + grain * u_grainAmt * (gn - 0.5) * 0.26;
  albedo *= 1.0 + grain * (h12(floor(cs) + 0.5) - 0.5) * 0.13;

  // ---- how much water is standing ABOVE this pixel.
  // Water only reads as water if you can see through it, and the amount you
  // can see through is the column, not the material. TIDE's first flood used to
  // read as a flat opaque slab and only started looking like water once it got
  // deep — that was two things, both here: cover went to 1.0 the moment a cell
  // was full, and the subsurface term is INVERSELY proportional to thickness,
  // so the thinnest layer in the frame took the brightest glow in the frame.
  // Six taps up the board, only ever for a clear fluid, so it costs nothing on
  // sand, lava or an empty column.
  //
  // clear is a GATE, not a strength: water and steam are 1, oil and lava 0.
  // Weighting by fluid*trans directly instead diluted the whole effect to 0.55
  // and the first flood still came out a slab.
  float clear = ss(0.25, 0.52, fluid * trans) * (1.0 - ss(0.02, 0.20, emis));
  float body = 1.0;                              // 0 = film, 1 = closed up
  if (clear > 0.01) {
    // Geometrically spaced taps with trapezoid weights: six samples that
    // resolve the first two cells AND still reach 34, because the difference
    // between one cell of water and four is the whole read.
    const float DS[6] = float[6](1.5, 3.5, 7.0, 13.0, 22.0, 34.0);
    const float DW[6] = float[6](2.5, 2.75, 4.75, 7.5, 10.5, 12.0);
    float column = 0.0;
    for (int i = 0; i < 6; i++) {
      vec2 sp = bc + vec2(0.0, DS[i] / u_grid.y);
      if (sp.y > 1.0) break;                     // above the lip there is only air
      column += DW[i] * clamp(texture(u_aux, sp).x, 0.0, 1.0) * ss(0.35, 0.60, texture(u_smooth, sp).r);
    }
    // Not Beer-Lambert: this is a cross-section, not a look-down, and physical
    // absorption over nine cells of water is nothing. What has to be true is
    // the READ — a first flood is a film you see the vessel floor through, a
    // late one is a body with weight. Measured against captures at 390x844:
    // a 9-cell pool lands near 0.2 alpha, a 30-cell one near 0.9.
    body = pow(clamp(column / 34.0, 0.0, 1.0), 1.6);
  }
  float film = clear * (1.0 - body);             // 1 where the water is only a skin

  // Liquids. In a single-layer field there is no scene behind the water to
  // refract — the backdrop IS the empty vessel — so what sells it is motion and
  // specular, not displacement. Refraction stays on for the rim only.
  float caustic = 0.0;
  if (fluid > 0.02) {
    vec2 wv = cs * vec2(0.115, 0.30) + vec2(u_time * 0.22, u_time * 0.055);
    float wa = vn(wv);
    vec2 wn = vec2(vn(wv + vec2(0.7, 0.0)) - wa, vn(wv + vec2(0.0, 0.7)) - wa);
    n = normalize(n + vec3(wn * fluid * 2.6, 0.0));
    albedo *= 1.0 + fluid * (vn(wv * 0.55 + 3.7) - 0.5) * 0.40;
    caustic = fluid * pow(max(wa - 0.58, 0.0) * 2.9, 2.0);
  }
  albedo *= 1.0 - seam * 0.22 * grain;

  // ---- rig
  vec3 L = normalize(vec3(u_keyDir, 0.72));
  vec3 F = normalize(vec3(u_fillDir, 0.55));
  vec3 V = vec3(0.0, 0.0, 1.0);

  float depth = 0.0, dw = 0.0, wk = 1.0;
  vec2 mstep = u_keyDir / u_grid * 1.15;
  for (int i = 1; i <= 6; i++) {
    float fi = float(i);
    depth += texture(u_occ, clamp(bc + mstep * fi * fi * 0.55, 0.0, 1.0)).r * wk;
    dw += wk; wk *= 0.78;
  }
  depth = clamp(depth / dw, 0.0, 1.0);

  float shadow = 1.0 - u_shadowAmt * ss(0.06, 0.90, occL) * (0.30 + 0.70 * grain);
  shadow *= 0.46 + 0.54 * pow(1.0 - depth, 1.7);
  float ndl = max(dot(n, L), 0.0);
  float ndf = max(dot(n, F), 0.0);
  float ao  = mix(1.0, (0.22 + 0.78 * (1.0 - ss(0.03, 0.98, occ))) * (0.58 + 0.42 * (1.0 - depth)), u_aoAmt);

  // wrapped diffuse: a dune's terminator is soft, a plastic ball's is not
  float wrap = (ndl + 0.20) / 1.20;
  vec3 lit = u_keyCol * wrap * shadow;
  lit += u_fillCol * ((ndf + 0.35) / 1.35) * 0.45;
  vec3 hemi = mix(u_ambCol * vec3(1.30, 0.94, 0.70), u_ambCol * vec3(0.72, 0.94, 1.34), n.y * 0.5 + 0.5);
  lit += hemi * ao * 1.9;

  albedo *= mix(vec3(1.0), vec3(0.86, 0.93, 1.08), depth * 0.40);
  vec3 col = albedo * lit;

  // ---- specular. Rough for powder, sharp and bright for liquid and glass.
  float rough = mix(0.20, 0.92, grain);
  float shin = mix(220.0, 9.0, rough);
  vec3 H = normalize(L + V);
  float spec = pow(max(dot(n, H), 0.0), shin) * mix(1.0, 0.05, rough);
  // a film is nearly all surface: what little it shows is the glint off it
  col += u_keyCol * spec * u_specAmt * (1.0 - 0.60 * piece) * (1.0 + film * 0.6);
  col += (u_keyCol + u_rimCol) * caustic * 0.16 * (1.0 + film * 0.8);

  // ---- fresnel rim, strongest on liquids and glass
  float fres = pow(1.0 - clamp(n.z, 0.0, 1.0), 3.0);
  // On poured material the edge is where the density falls off. On the built
  // world that measure is meaningless — a thin rib is ALL falloff and would
  // take a full-body rim, glowing like a neon strip — so where static coverage
  // owns the pixel the edge is its own cut face instead.
  float edge = mix(ss(0.62, 0.44, d), sEdge, sCov);
  // On a piece the soft shell is most of the blob, so a rim in the KEY's colour
  // paints the whole thing cream. Hand that budget to the tint instead.
  // The rim budget was set on poured, blobby, backlit material. Handed whole to
  // a 2-cell rib — which is nearly all edge — it turns masonry into a light
  // fitting: measured, a 2-cell CRYSTAL rib came out at 155 against a 20-unit
  // abyss sky, brighter than any sand in the frame. u_staticCtl.y is the share
  // a THIN one gets. Keyed on sThin and not on sCov on purpose: a wide slab
  // already had a rim it had earned, and cutting that was a measured 29 -> 20
  // regression on a 6-cell quartz wall for no reason at all.
  float rimScale = mix(1.0, u_staticCtl.y, sThin);
  col += u_rimCol * (fres * (0.25 + 0.75 * (fluid + trans)) + edge * 0.22) * u_rimAmt * rimScale * (1.0 - 0.88 * piece);
  if (piece > 0.002) {
    vec3 pn = pHue / max(luma(pHue), 0.02);
    col += pn * (edge * 0.40 + fres * 1.00) * piece * u_pieceCtl.z;
  }

  // ---- subsurface: thin material glows, thick material does not
  float thick = max(ss(0.0, 0.85, occ), depth);
  // ...but a THIN LAYER OF LIQUID is not thin material catching the light, it is
  // a window. exp(-thick) alone made the shallowest flood the palest thing on
  // screen, which is the opposite of what water does.
  vec3 sss = albedo * u_keyCol * exp(-thick * 3.1) * (trans * 1.35 * mix(1.0, body, clear) + grain * 0.12);
  // Same story one term along: exp(-thick) says a thin rib is lit through, and
  // for a translucent one it says so loudly. u_staticCtl.z is how much of that
  // a THIN piece of the built world keeps — a wide slab is unaffected, because
  // sThin is 0 wherever the density field can shade the body on its own.
  sss *= 1.0 - sThin * (1.0 - u_staticCtl.z);
  col += sss * u_sssAmt;

  // ---- refraction: displace the backdrop along the surface normal
#if REFRACT
  float refr = (fluid * 0.75 + trans * 0.45);
  if (refr > 0.02) {
    vec2 ruv = clamp(v_uv + n.xy * u_refrAmt * refr * (0.4 + 0.6 * edge), 0.0, 1.0);
    vec3 back = texture(u_bg, ruv).rgb;
    col = mix(col, col * 0.42 + back * albedo * 2.0, refr * 0.62);
    col += u_rimCol * fres * refr * 0.55;
  }
#endif

  // ---- emissive. A uniformly glowing blob is a light bulb, not lava: molten
  //      rock is dark chilled skin torn open by hot veins, drifting slowly.
  if (emis > 0.02) {
    vec2 lv = cs * 0.16 + vec2(u_time * 0.030, -u_time * 0.055);
    float crust = fbm3(lv);
    float veins = 1.0 - abs(2.0 * vn(lv * 2.3 + 7.0) - 1.0);
    float hot = ss(0.36, 0.80, crust) * 0.55 + pow(veins, 6.0) * 1.30;
    col = mix(col, col * 0.26, emis * (1.0 - ss(0.08, 0.62, hot)));
    col += albedo * emis * (0.10 + 1.25 * hot) * (0.90 + 0.16 * sin(u_time * 2.3 + cs.y * 0.3));
  }

  // ---- dissolve flash. Hot core, colour-preserving halo, travelling band.
  float fl = ax.w;
  if (fl > 0.002) {
    float crack = ss(0.30, 0.72, gn + fl * 0.35);
    // Keep the chain's own colour hot rather than clipping it to white — a
    // dissolving ochre band should read as ochre on fire, not as a light leak.
    col += albedo * (1.00 + 1.70 * crack) * fl;
    col += u_emisCol * (0.14 + 0.30 * crack) * fl;
    col += u_emisCol * fl * fl * fl * 0.34;
  }

  // ---- transmittance. Everything above is how the material LOOKS; this is how
  // much of it there is to look through. Only clear fluids ever leave 1.0.
  float alpha = mix(1.0, 0.10 + 0.85 * body, clear);
  frag = vec4(mix(bg, col, cover * alpha), 1.0);
}`;
