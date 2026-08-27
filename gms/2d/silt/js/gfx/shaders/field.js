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
out vec4 frag;

void main() {
  vec2 uv = v_uv;
  float asp = u_res.x / max(u_res.y, 1.0);

  vec3 c = mix(u_skyBot, u_skyTop, pow(uv.y, 0.85));

  // one big soft key glow — gives the whole frame a direction before a single grain is drawn
  vec2 d = (uv - u_glowPos) * vec2(asp, 1.0);
  float g = exp(-dot(d, d) * 2.1);
  c += u_glowCol * g * u_glowAmt;

  // slow drifting haze so flat gradients never band
  float n = fbm3(vec2(uv.x * 2.6 * asp, uv.y * 2.0) + vec2(u_time * 0.013, -u_time * 0.021));
  c *= 0.86 + 0.30 * n;
  c += u_glowCol * u_bandAmt * pow(max(0.0, n - 0.45), 2.0) * 1.4;

  // motes / bioluminescent specks / embers, three parallax layers
  float m = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float sc = 26.0 + fi * 34.0;
    float sp = 0.010 + fi * 0.016;
    vec2 p = vec2(uv.x * asp, uv.y) * sc + vec2(sin(u_time * 0.07 + fi) * 1.4, -u_time * sp * sc * 0.05);
    vec2 ip = floor(p), fp = fract(p);
    vec2 o = h22(ip + fi * 17.0);
    float dd = length(fp - o);
    float bright = ss(0.86, 1.0, h12(ip + fi * 5.5));
    float tw = 0.55 + 0.45 * sin(u_time * (1.1 + 2.0 * o.x) + o.y * 44.0);
    m += bright * tw * ss(0.10, 0.0, dd) / (1.0 + fi * 0.9);
  }
  c += u_moteCol * m * u_moteAmt;

  // the well: the playfield reads as a vessel sunk into the backdrop
  vec2 b = (uv - u_rect.xy) / u_rect.zw;
  vec2 e = min(b, 1.0 - b);
  float inside = step(0.0, min(e.x, e.y));
  float edge = min(ss(0.0, 0.030, e.x), ss(0.0, 0.016, e.y));
  c *= mix(1.0, 0.34 + 0.66 * edge, inside);
  float lip = inside * (1.0 - ss(0.0, 0.006, min(e.x, e.y)));
  c += u_glowCol * lip * 0.10;

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

void main() {
  // board space, y measured UP from the floor; texture row 0 is the ceiling
  vec2 cell = vec2(v_uv.x, 1.0 - v_uv.y) * u_grid;
  ivec2 ic = ivec2(floor(cell));
  ivec2 gi = ivec2(u_grid);

  float dens = 0.0, flash = 0.0, colW = 0.0;
  vec3 colAcc = vec3(0.0), props = vec3(0.0);

  for (int j = -R; j <= R; j++) {
    for (int i = -R; i <= R; i++) {
      ivec2 c = ic + ivec2(i, j);
      if (c.x < 0 || c.y < 0 || c.x >= gi.x || c.y >= gi.y) continue;
      vec4 s = texelFetch(u_state, ivec2(c.x, gi.y - 1 - c.y), 0);
      int m = int(s.r * 255.0 + 0.5);
      if (m == 0) continue;
      int fl = int(s.a * 255.0 + 0.5);

      float fill = s.b;
      vec2 cc = vec2(c) + 0.5;

      if ((fl & 1) != 0) {
        // dissolving: B is the countdown, not a fill. p goes 0 -> 1.
        float p = clamp(1.0 - (s.b * 255.0) / u_dissolve, 0.0, 1.0);
        float n = h12(vec2(c) * 0.37 + 11.3);
        // crumble, don't fade: low-hash cells go first so the chain erodes
        fill = 1.0 - ss(n * 0.55, n * 0.55 + 0.50, p);
        cc.y += p * p * 1.15;                                   // lift
        cc.x += sin(p * 7.0 + n * 6.2831) * p * 0.45;           // wobble
        // the money shot: an emissive band sweeping the chain wall to wall
        float sweep = exp(-pow((p * 1.5 - 0.22 - cc.x / u_grid.x) * 6.5, 2.0));
        flash += (0.30 + 2.30 * sweep) * (1.0 - p * 0.45) * fill;
      }
      if (fill <= 0.002) continue;

      vec2 d = cell - cc;
      float w = exp(-dot(d, d) / SIG2) * fill;
      dens += w;

      vec4 pr = u_matProp[m];
      props += pr.xyz * w;
      if ((fl & 16) != 0) props.y += 0.085 * w;   // the live piece breathes

      int ti = int(s.g * 255.0 + 0.5);
      vec3 col = u_matCol[m];
      if (ti > 0) col = mix(col, u_tint[ti > 7 ? 7 : ti], pr.w);
      float cw = pow(w, VOTE);
      colAcc += col * cw;
      colW += cw;
    }
  }

  float dn = dens * KNORM;
  if (dens > 1e-5) { colAcc /= colW; props /= dens; flash = flash * KNORM; }
  oField = vec4(colAcc, min(dn, 1.35));
  oAux = vec4(props, flash);
}`;

/* ---------------------------------------------------------- occlusion field
   A quarter-res blur of the density. Sampled straight for cavity darkening and
   sampled toward the key light for a soft cast shadow — which is most of what
   makes a heap read as a DUNE and not a coloured blob.                       */
export const OCC_DOWN_FS = HEAD + `
uniform sampler2D u_src;
uniform vec2 u_texel;
out vec4 frag;
void main() {
  float a = texture(u_src, v_uv + u_texel * vec2(-1, -1)).a;
  a += texture(u_src, v_uv + u_texel * vec2(1, -1)).a;
  a += texture(u_src, v_uv + u_texel * vec2(-1, 1)).a;
  a += texture(u_src, v_uv + u_texel * vec2(1, 1)).a;
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

uniform sampler2D u_field, u_aux, u_occ, u_bg;
uniform vec2  u_res, u_grid;
uniform vec4  u_rect;
uniform vec2  u_ftex;        // 1 / resolve target size
uniform float u_time;

uniform vec2  u_keyDir, u_fillDir;
uniform vec3  u_keyCol, u_fillCol, u_ambCol, u_rimCol, u_emisCol;
uniform float u_rimAmt, u_specAmt, u_sssAmt, u_grainAmt;
uniform float u_refrAmt, u_aoAmt, u_shadowAmt, u_relief;

out vec4 frag;

float dens(vec2 b) { return texture(u_field, b).a; }

void main() {
  vec2 b = (v_uv - u_rect.xy) / u_rect.zw;
  vec3 bg = texture(u_bg, v_uv).rgb;

  if (b.x < -0.02 || b.y < -0.02 || b.x > 1.02 || b.y > 1.02) { frag = vec4(bg, 1.0); return; }
  vec2 bc = clamp(b, 0.0, 1.0);

  vec4 f = texture(u_field, bc);
  vec4 ax = texture(u_aux, bc);
  float d = f.a;

  float occ = texture(u_occ, bc).r;
  // cast shadow: is the ground TOWARD the light denser than here?
  float occL = texture(u_occ, clamp(bc + u_keyDir * 0.055, 0.0, 1.0)).r;

  // the pile darkens the back wall it sits in front of
  float contact = texture(u_occ, clamp(bc - u_keyDir * 0.022, 0.0, 1.0)).r;
  bg *= 1.0 - u_aoAmt * 0.55 * ss(0.05, 0.95, contact);

  float cover = ss(0.42, 0.62, d);
  if (cover <= 0.001) { frag = vec4(bg, 1.0); return; }

  // ---- normal from the density gradient
  vec2 e = u_ftex * 1.35;
  float gx = dens(bc + vec2(e.x, 0.0)) - dens(bc - vec2(e.x, 0.0));
  float gy = dens(bc + vec2(0.0, e.y)) - dens(bc - vec2(0.0, e.y));
  vec3 n = normalize(vec3(-gx, -gy, u_relief * (0.20 + 0.80 * (1.0 - abs(d - 0.5) * 1.2))));

  float fluid = clamp(ax.x, 0.0, 1.0);
  float emis  = clamp(ax.y, 0.0, 1.0);
  float trans = clamp(ax.z, 0.0, 1.0);
  float grain = clamp(1.0 - fluid - trans, 0.0, 1.0);

  // ---- grain, in CELL space so it belongs to the board, not to the screen
  vec2 cs = vec2(bc.x, 1.0 - bc.y) * u_grid;
  float gn = fbm3(cs * 0.62) * 0.62 + vn(cs * 2.35) * 0.38;
  float gn2 = vn(cs * 5.5 + 31.7);
  vec2 gd = vec2(vn(cs * 2.35 + 7.1) - gn2, vn(cs * 2.35 + 19.3) - gn2);
  n = normalize(n + vec3(gd * u_grainAmt * grain * 2.4, 0.0));

  vec3 albedo = f.rgb;
  albedo *= 1.0 - grain * u_grainAmt * (0.55 - gn) * 1.15;

  // ---- rig
  vec3 L = normalize(vec3(u_keyDir, 0.72));
  vec3 F = normalize(vec3(u_fillDir, 0.55));
  vec3 V = vec3(0.0, 0.0, 1.0);

  float shadow = 1.0 - u_shadowAmt * ss(0.10, 0.85, occL) * (0.35 + 0.65 * grain);
  float ndl = max(dot(n, L), 0.0);
  float ndf = max(dot(n, F), 0.0);
  float ao  = mix(1.0, 0.30 + 0.70 * (1.0 - ss(0.06, 0.92, occ)), u_aoAmt);

  // wrapped diffuse: a dune's terminator is soft, a plastic ball's is not
  float wrap = (ndl + 0.34) / 1.34;
  vec3 lit = u_keyCol * wrap * shadow;
  lit += u_fillCol * ((ndf + 0.5) / 1.5) * 0.55;
  lit += u_ambCol * ao;

  vec3 col = albedo * lit;

  // ---- specular. Rough for powder, sharp and bright for liquid and glass.
  float rough = mix(0.20, 0.92, grain);
  float shin = mix(220.0, 9.0, rough);
  vec3 H = normalize(L + V);
  float spec = pow(max(dot(n, H), 0.0), shin) * mix(1.0, 0.16, rough);
  // powder sparkle: a few grains catch the key light outright
  spec += grain * pow(max(gn2 - 0.72, 0.0) * 3.4, 2.0) * ndl * 0.55;
  col += u_keyCol * spec * u_specAmt;

  // ---- fresnel rim, strongest on liquids and glass
  float fres = pow(1.0 - clamp(n.z, 0.0, 1.0), 3.0);
  float edge = ss(0.62, 0.44, d);
  col += u_rimCol * (fres * (0.35 + 0.65 * (fluid + trans)) + edge * 0.55) * u_rimAmt;

  // ---- subsurface: thin material glows, thick material does not
  float thick = ss(0.0, 0.85, occ);
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

  // ---- emissive
  col += albedo * emis * (2.2 + 0.9 * sin(u_time * 3.1 + cs.x * 0.4 + cs.y * 0.7));

  // ---- dissolve flash. Hot core, colour-preserving halo, travelling band.
  float fl = ax.w;
  if (fl > 0.002) {
    float crack = ss(0.30, 0.70, gn + fl * 0.35);
    col += (u_emisCol * (1.4 + crack * 1.6) + albedo * 2.2) * fl;
    col += u_emisCol * fl * fl * 1.6;
  }

  frag = vec4(mix(bg, col, cover), 1.0);
}`;
