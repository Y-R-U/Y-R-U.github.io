import { LIB, HEAD } from './lib.js';

/* ------------------------------------------------------------------ backdrop
   Biome sky. Everything the material layer refracts and casts onto.        */
export const BG_FS = HEAD + LIB + `
uniform vec2  u_res;
uniform vec4  u_rect;      // board rect in screen uv: x, y, w, h
uniform float u_time;
uniform vec3  u_skyTop, u_skyBot, u_glowCol, u_moteCol;
uniform vec2  u_glowPos;
uniform float u_glowAmt, u_moteAmt, u_bandAmt, u_glowTight;
uniform vec4  u_well;      // interior: base, floor pool, side falloff, roof falloff
uniform vec4  u_well2;     // outside, pool exponent, pool tint, lip
out vec4 frag;

void main() {
  vec2 uv = v_uv;
  float asp = u_res.x / max(u_res.y, 1.0);

  vec3 c = mix(u_skyBot, u_skyTop, pow(uv.y, 0.85));

  // one tight key glow — gives the whole frame a direction before a grain is drawn
  vec2 d = (uv - u_glowPos) * vec2(asp, 1.0);
  c += u_glowCol * exp(-dot(d, d) * u_glowTight) * u_glowAmt;

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
uniform float u_time;
uniform float u_dissolve;      // DISSOLVE_TICKS

layout(location = 0) out vec4 oField;   // rgb = voted colour, a = density
layout(location = 1) out vec4 oAux;     // fluid, emissive, translucent, dissolve flash
layout(location = 2) out vec4 oPiece;   // rgb = the piece's own tint, a = piece coverage

void main() {
  // board space, y measured UP from the floor; texture row 0 is the ceiling,
  // so the row index counts back down from rows-1.
  vec2 cell = v_uv * u_grid;
  cell += (vec2(vn(cell * 0.33 + 4.7), vn(cell * 0.33 + 21.9)) - 0.5) * 0.85;
  ivec2 ic = ivec2(floor(cell));
  ivec2 gi = ivec2(u_grid);

  float dens = 0.0, flash = 0.0, colW = 0.0, pieceW = 0.0;
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

export const OCC_DOWN_FS = HEAD + `
uniform sampler2D u_src;
uniform vec2 u_texel;
out vec4 frag;
void main() {
  float a = texture(u_src, v_uv + u_texel * vec2(-1, -1)).r;
  a += texture(u_src, v_uv + u_texel * vec2(1, -1)).r;
  a += texture(u_src, v_uv + u_texel * vec2(-1, 1)).r;
  a += texture(u_src, v_uv + u_texel * vec2(1, 1)).r;
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

uniform sampler2D u_field, u_aux, u_occ, u_bg, u_smooth, u_piece;
uniform vec2  u_res, u_grid;
uniform vec4  u_rect;
uniform vec2  u_ftex;        // 1 / resolve target size
uniform float u_time;

uniform vec2  u_keyDir, u_fillDir;
uniform vec3  u_keyCol, u_fillCol, u_ambCol, u_rimCol, u_emisCol;
uniform float u_rimAmt, u_specAmt, u_sssAmt, u_grainAmt;
uniform float u_refrAmt, u_aoAmt, u_shadowAmt, u_relief;
uniform vec3  u_pieceCtl;    // chroma push, luma pull, own-hue rim

out vec4 frag;

float dens(vec2 b) { return texture(u_smooth, b).r; }

void main() {
  vec2 b = (v_uv - u_rect.xy) / u_rect.zw;
  vec3 bg = texture(u_bg, v_uv).rgb;

  if (b.x < -0.02 || b.y < -0.02 || b.x > 1.02 || b.y > 1.02) { frag = vec4(bg, 1.0); return; }
  vec2 bc = clamp(b, 0.0, 1.0);

  vec4 f = texture(u_field, bc);
  vec4 ax = texture(u_aux, bc);
  vec4 pf = texture(u_piece, bc);
  float d = texture(u_smooth, bc).r;

  // How much of this pixel is the AIRBORNE piece. Settled material is 0.
  float piece = clamp(pf.a * 1.3, 0.0, 1.0);

  float occ = texture(u_occ, bc).r;
  // cast shadow: is the ground TOWARD the light denser than here?
  float occL = texture(u_occ, clamp(bc + u_keyDir * 0.055, 0.0, 1.0)).r;

  // the pile darkens the back wall it sits in front of
  float contact = texture(u_occ, clamp(bc - u_keyDir * 0.022, 0.0, 1.0)).r;
  bg *= 1.0 - u_aoAmt * 0.55 * ss(0.05, 0.95, contact);

  float cover = ss(0.42, 0.62, d);
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
  col += u_keyCol * spec * u_specAmt * (1.0 - 0.60 * piece);
  col += (u_keyCol + u_rimCol) * caustic * 0.16;

  // ---- fresnel rim, strongest on liquids and glass
  float fres = pow(1.0 - clamp(n.z, 0.0, 1.0), 3.0);
  float edge = ss(0.62, 0.44, d);
  // On a piece the soft shell is most of the blob, so a rim in the KEY's colour
  // paints the whole thing cream. Hand that budget to the tint instead.
  col += u_rimCol * (fres * (0.25 + 0.75 * (fluid + trans)) + edge * 0.22) * u_rimAmt * (1.0 - 0.88 * piece);
  if (piece > 0.002) {
    vec3 pn = pHue / max(luma(pHue), 0.02);
    col += pn * (edge * 0.40 + fres * 1.00) * piece * u_pieceCtl.z;
  }

  // ---- subsurface: thin material glows, thick material does not
  float thick = max(ss(0.0, 0.85, occ), depth);
  vec3 sss = albedo * u_keyCol * exp(-thick * 3.1) * (trans * 1.35 + grain * 0.12);
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

  frag = vec4(mix(bg, col, cover), 1.0);
}`;
