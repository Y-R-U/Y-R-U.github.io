export const FULLSCREEN_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 a_corner;   // -0.5..0.5
out vec2 v_uv;
void main() {
  v_uv = a_corner + 0.5;
  gl_Position = vec4(a_corner * 2.0, 0.0, 1.0);
}`;

export const BRIGHT_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_src;
uniform vec2 u_texel;
uniform float u_thresh;
uniform float u_knee;
out vec4 frag;

vec3 tap(vec2 o) { return texture(u_src, v_uv + o * u_texel).rgb; }

void main() {
  // 4-tap box while downsampling keeps fireflies from popping between frames
  vec3 c = (tap(vec2(-1.0,-1.0)) + tap(vec2(1.0,-1.0)) + tap(vec2(-1.0,1.0)) + tap(vec2(1.0,1.0))) * 0.25;
  float l = max(max(c.r, c.g), c.b);
  float soft = clamp(l - u_thresh + u_knee, 0.0, 2.0 * u_knee);
  soft = soft * soft / (4.0 * u_knee + 1e-5);
  float w = max(soft, l - u_thresh) / max(l, 1e-4);
  frag = vec4(c * w, 1.0);
}`;

export const DOWN_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_src;
uniform vec2 u_texel;
out vec4 frag;
vec3 tap(vec2 o) { return texture(u_src, v_uv + o * u_texel).rgb; }
void main() {
  vec3 c = (tap(vec2(-1.0,-1.0)) + tap(vec2(1.0,-1.0)) + tap(vec2(-1.0,1.0)) + tap(vec2(1.0,1.0))) * 0.125;
  c += (tap(vec2(-2.0,0.0)) + tap(vec2(2.0,0.0)) + tap(vec2(0.0,-2.0)) + tap(vec2(0.0,2.0))) * 0.0625;
  c += tap(vec2(0.0)) * 0.25;
  frag = vec4(c, 1.0);
}`;

// 9-tap gaussian via 5 linearly-interpolated samples
export const BLUR_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
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

export const UP_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_src;
uniform vec2 u_texel;
uniform float u_amount;
out vec4 frag;
void main() {
  // tent filter — cheap and much smoother than a bilinear stretch
  vec3 c = texture(u_src, v_uv).rgb * 4.0;
  c += (texture(u_src, v_uv + vec2( u_texel.x, 0.0)).rgb
      + texture(u_src, v_uv + vec2(-u_texel.x, 0.0)).rgb
      + texture(u_src, v_uv + vec2(0.0,  u_texel.y)).rgb
      + texture(u_src, v_uv + vec2(0.0, -u_texel.y)).rgb) * 2.0;
  c += (texture(u_src, v_uv + u_texel).rgb
      + texture(u_src, v_uv - u_texel).rgb
      + texture(u_src, v_uv + vec2(u_texel.x, -u_texel.y)).rgb
      + texture(u_src, v_uv + vec2(-u_texel.x, u_texel.y)).rgb);
  frag = vec4(c / 16.0 * u_amount, 1.0);
}`;

// Radial blur of the light buffer toward a source point — the volumetric shafts.
export const RAYS_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_src;
uniform vec2 u_origin;     // uv of the light source
uniform float u_decay;
uniform float u_density;
uniform float u_weight;
out vec4 frag;

void main() {
  vec2 delta = (v_uv - u_origin) * (u_density / 20.0);
  vec2 uv = v_uv;
  vec3 acc = vec3(0.0);
  float illum = 1.0;
  for (int i = 0; i < 20; i++) {
    uv -= delta;
    acc += texture(u_src, uv).rgb * illum;
    illum *= u_decay;
  }
  frag = vec4(acc * u_weight / 20.0, 1.0);
}`;

export const COMPOSITE_FS = `#version 300 es
precision highp float;
in vec2 v_uv;

uniform sampler2D u_scene;
uniform sampler2D u_bloom;
uniform sampler2D u_rays;

uniform vec2  u_res;
uniform float u_aspect;
uniform float u_time;
uniform vec4  u_wave0;      // x, y (uv), radius, strength
uniform vec4  u_wave1;
uniform vec4  u_wave2;
uniform vec4  u_wave3;
uniform float u_chroma;
uniform float u_bloomAmt;
uniform float u_raysAmt;
uniform float u_vignette;
uniform float u_grain;
uniform float u_exposure;
uniform float u_sat;
uniform float u_contrast;
uniform vec4  u_flash;      // rgb, a
uniform vec3  u_shadowTint;
uniform vec3  u_highTint;

out vec4 frag;

float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

vec2 applyWave(vec2 uv, vec4 w, inout float ring) {
  if (w.w <= 0.0) return uv;
  vec2 d = (uv - w.xy) * vec2(u_aspect, 1.0);
  float r = length(d) + 1e-6;
  float band = (r - w.z) * 26.0;
  float a = exp(-band * band) * w.w;
  ring += a;
  return uv + (d / r) * vec2(1.0 / u_aspect, 1.0) * a * 0.06;
}

vec3 aces(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

float hash(vec2 p) {
  p = fract(p * vec2(443.8975, 397.2973));
  p += dot(p, p + 19.19);
  return fract(p.x * p.y);
}

void main() {
  vec2 uv = v_uv;
  float ring = 0.0;
  uv = applyWave(uv, u_wave0, ring);
  uv = applyWave(uv, u_wave1, ring);
  uv = applyWave(uv, u_wave2, ring);
  uv = applyWave(uv, u_wave3, ring);

  vec2 off = uv - 0.5;
  float ca = (u_chroma + ring * 2.2) * (0.30 + dot(off, off) * 2.2) * 0.02;
  vec3 col;
  if (ca > 0.00002) {
    col.r = texture(u_scene, uv + off * ca).r;
    col.g = texture(u_scene, uv).g;
    col.b = texture(u_scene, uv - off * ca).b;
  } else {
    col = texture(u_scene, uv).rgb;
  }

  col += texture(u_bloom, uv).rgb * u_bloomAmt;
  if (u_raysAmt > 0.0) col += texture(u_rays, uv).rgb * u_raysAmt;
  col += ring * 0.10;

  col *= u_exposure;

  // grade in linear: shadows toward teal, highlights toward warm
  float l = luma(col);
  col *= mix(u_shadowTint, u_highTint, smoothstep(0.0, 0.62, l));

  col = aces(col);

  col = (col - 0.5) * u_contrast + 0.5;
  float g = luma(col);
  col = mix(vec3(g), col, u_sat);

  float v = length(off * vec2(u_aspect, 1.0)) * 1.28;
  col *= mix(1.0, smoothstep(1.06, 0.20, v), u_vignette);

  col += u_flash.rgb * u_flash.a;

  float n = hash(v_uv * u_res + u_time * 61.7) - 0.5;
  col += n * u_grain * (1.25 - g * 0.8);

  col = max(col, 0.0);
  frag = vec4(sqrt(col), 1.0);   // approximate gamma encode
}`;
