import { LIB, HEAD } from './lib.js';

// Adapted from kitehawk/js/gfx/shaders/post.js — same bright/down/blur/up chain,
// with the god-ray and shockwave passes dropped and a board-aware vignette added.

export const BRIGHT_FS = HEAD + `
uniform sampler2D u_src;
uniform vec2 u_texel;
uniform float u_thresh, u_knee;
out vec4 frag;
vec3 tap(vec2 o) { return texture(u_src, v_uv + o * u_texel).rgb; }
void main() {
  // 4-tap box while downsampling keeps fireflies from popping between frames
  vec3 c = (tap(vec2(-1, -1)) + tap(vec2(1, -1)) + tap(vec2(-1, 1)) + tap(vec2(1, 1))) * 0.25;
  float l = max(max(c.r, c.g), c.b);
  float soft = clamp(l - u_thresh + u_knee, 0.0, 2.0 * u_knee);
  soft = soft * soft / (4.0 * u_knee + 1e-5);
  float w = max(soft, l - u_thresh) / max(l, 1e-4);
  frag = vec4(c * w, 1.0);
}`;

export const DOWN_FS = HEAD + `
uniform sampler2D u_src;
uniform vec2 u_texel;
out vec4 frag;
vec3 tap(vec2 o) { return texture(u_src, v_uv + o * u_texel).rgb; }
void main() {
  vec3 c = (tap(vec2(-1, -1)) + tap(vec2(1, -1)) + tap(vec2(-1, 1)) + tap(vec2(1, 1))) * 0.125;
  c += (tap(vec2(-2, 0)) + tap(vec2(2, 0)) + tap(vec2(0, -2)) + tap(vec2(0, 2))) * 0.0625;
  c += tap(vec2(0)) * 0.25;
  frag = vec4(c, 1.0);
}`;

// 9-tap gaussian via 5 linearly-interpolated samples
export const BLUR_FS = HEAD + `
uniform sampler2D u_src;
uniform vec2 u_dir;
out vec4 frag;
void main() {
  vec3 s = texture(u_src, v_uv).rgb * 0.2270270270;
  s += (texture(u_src, v_uv + u_dir * 1.3846153846).rgb
      + texture(u_src, v_uv - u_dir * 1.3846153846).rgb) * 0.3162162162;
  s += (texture(u_src, v_uv + u_dir * 3.2307692308).rgb
      + texture(u_src, v_uv - u_dir * 3.2307692308).rgb) * 0.0702702703;
  frag = vec4(s, 1.0);
}`;

export const UP_FS = HEAD + `
uniform sampler2D u_src;
uniform vec2 u_texel;
uniform float u_amount;
out vec4 frag;
void main() {
  vec3 c = texture(u_src, v_uv).rgb * 4.0;
  c += (texture(u_src, v_uv + vec2( u_texel.x, 0.0)).rgb
      + texture(u_src, v_uv + vec2(-u_texel.x, 0.0)).rgb
      + texture(u_src, v_uv + vec2(0.0,  u_texel.y)).rgb
      + texture(u_src, v_uv + vec2(0.0, -u_texel.y)).rgb) * 2.0;
  c += (texture(u_src, v_uv + u_texel).rgb + texture(u_src, v_uv - u_texel).rgb
      + texture(u_src, v_uv + vec2(u_texel.x, -u_texel.y)).rgb
      + texture(u_src, v_uv + vec2(-u_texel.x, u_texel.y)).rgb);
  frag = vec4(c / 16.0 * u_amount, 1.0);
}`;

export const COMPOSITE_FS = HEAD + LIB + `
uniform sampler2D u_scene, u_bloom;
uniform vec2  u_res;
uniform float u_aspect, u_time;
uniform float u_bloomAmt, u_vignette, u_grain, u_exposure, u_sat, u_contrast, u_chroma;
uniform vec2  u_shake;
uniform vec3  u_shadowTint, u_highTint;
uniform vec4  u_flash;
out vec4 frag;

void main() {
  vec2 uv = clamp(v_uv + u_shake, 0.0, 1.0);
  vec2 off = uv - 0.5;

  float ca = u_chroma * (0.30 + dot(off, off) * 2.4) * 0.02;
  vec3 col;
  if (ca > 0.00002) {
    col.r = texture(u_scene, clamp(uv + off * ca, 0.0, 1.0)).r;
    col.g = texture(u_scene, uv).g;
    col.b = texture(u_scene, clamp(uv - off * ca, 0.0, 1.0)).b;
  } else {
    col = texture(u_scene, uv).rgb;
  }

  col += texture(u_bloom, uv).rgb * u_bloomAmt;
  col *= u_exposure;

  // grade in linear: shadows one way, highlights the other
  float l = luma(col);
  col *= mix(u_shadowTint, u_highTint, ss(0.0, 0.62, l));

  col = aces(col);
  col = (col - 0.5) * u_contrast + 0.5;
  float g = luma(col);
  col = mix(vec3(g), col, u_sat);

  float v = length(off * vec2(u_aspect, 1.0)) * 1.28;
  col *= mix(1.0, ss(1.10, 0.18, v), u_vignette);

  col += u_flash.rgb * u_flash.a;

  float n = h12(v_uv * u_res + fract(u_time * 0.61) * 337.0) - 0.5;
  col += n * u_grain * (1.25 - g * 0.8);

  frag = vec4(sqrt(max(col, 0.0)), 1.0);   // approximate gamma encode
}`;

/* ------------------------------------------------------------ dissolve motes
   Additive point sprites thrown off a dissolving chain. Deliberately a garnish:
   the erosion in the resolve pass is the effect, these are the sparkle on it. */
export const PART_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec4 a_pos;    // x, y (screen uv), size px, life 0..1
layout(location = 1) in vec4 a_col;    // rgb, intensity
uniform vec2 u_shake;
out vec4 v_col;
void main() {
  v_col = a_col;
  gl_PointSize = max(1.0, a_pos.z);
  gl_Position = vec4((a_pos.xy + u_shake) * 2.0 - 1.0, 0.0, 1.0);
}`;

export const PART_FS = `#version 300 es
precision highp float;
in vec4 v_col;
out vec4 frag;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = dot(d, d) * 4.0;
  float a = exp(-r * 3.2);
  frag = vec4(v_col.rgb * v_col.a * a, 1.0);
}`;
