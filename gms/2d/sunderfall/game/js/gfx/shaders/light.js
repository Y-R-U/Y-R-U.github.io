// 2D light accumulation. Every light is one instanced quad drawn additively
// into a half-resolution buffer, which is then blurred so edges read as soft
// falloff rather than as a circle.

export const LIGHT_VS = `#version 300 es
precision highp float;

layout(location=0) in vec2 a_corner;
layout(location=1) in vec4 i_posRad;   // x, y, radius, parallax
layout(location=2) in vec4 i_color;    // rgb * intensity, softness
layout(location=3) in vec2 i_shape;    // squash (y scale), angle

uniform vec2  u_cam;
uniform float u_scale;
uniform vec2  u_halfRes;

out vec2 v_local;
out vec4 v_color;
out float v_soft;

void main() {
  float r = i_posRad.z;
  vec2 local = a_corner * 2.0 * vec2(r, r * i_shape.x);
  float c = cos(i_shape.y), s = sin(i_shape.y);
  vec2 rp = vec2(local.x * c - local.y * s, local.x * s + local.y * c);
  vec2 world = i_posRad.xy + rp;
  vec2 px = (world - u_cam * i_posRad.w) * u_scale;
  gl_Position = vec4(px.x / u_halfRes.x, -px.y / u_halfRes.y, 0.0, 1.0);
  v_local = a_corner * 2.0;
  v_color = i_color;
  v_soft = i_color.a;
}`;

export const LIGHT_FS = `#version 300 es
precision highp float;
in vec2 v_local;
in vec4 v_color;
in float v_soft;
out vec4 frag;

void main() {
  float d = length(v_local);
  if (d >= 1.0) discard;
  float o = 1.0 - d;
  // wide painterly body plus a tight hot core — a single pow reads as a decal
  float f = o * o * (0.55 + 0.45 * o);
  f += 0.55 * pow(o, 7.0);
  f *= mix(1.0, smoothstep(0.0, 0.35, o), v_soft);
  frag = vec4(v_color.rgb * f, 1.0);
}`;

// Separable blur used on the light buffer. Wide, few taps — softness matters
// more than accuracy here.
export const LIGHT_BLUR_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_src;
uniform vec2 u_dir;      // texel-sized step
out vec4 frag;

void main() {
  vec3 s = texture(u_src, v_uv).rgb * 0.2270270270;
  s += (texture(u_src, v_uv + u_dir * 1.3846153846).rgb
      + texture(u_src, v_uv - u_dir * 1.3846153846).rgb) * 0.3162162162;
  s += (texture(u_src, v_uv + u_dir * 3.2307692308).rgb
      + texture(u_src, v_uv - u_dir * 3.2307692308).rgb) * 0.0702702703;
  frag = vec4(s, 1.0);
}`;
