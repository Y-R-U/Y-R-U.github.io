// Instanced sprite batcher. One draw call per (layer, blend) group, up to 8
// textures per group selected by a per-instance index.

export const SPRITE_VS = `#version 300 es
precision highp float;

layout(location=0) in vec2 a_corner;    // unit quad, -0.5..0.5
layout(location=1) in vec4 i_posSize;   // cx, cy, w, h   (world)
layout(location=2) in vec2 i_rotPar;    // rot (rad), parallax
layout(location=3) in vec4 i_uv;        // u0, v0, u1, v1
layout(location=4) in vec4 i_color;
layout(location=5) in vec2 i_misc;      // texIndex, softness

uniform vec2  u_cam;        // camera world position (shake already folded in)
uniform float u_scale;      // device pixels per world unit
uniform vec2  u_halfRes;    // framebuffer half size, device pixels

out vec2 v_uv;
out vec4 v_color;
flat out int v_tex;

void main() {
  vec2 local = a_corner * i_posSize.zw;
  float c = cos(i_rotPar.x), s = sin(i_rotPar.x);
  vec2 rp = vec2(local.x * c - local.y * s, local.x * s + local.y * c);
  vec2 world = i_posSize.xy + rp;

  vec2 px = (world - u_cam * i_rotPar.y) * u_scale;
  gl_Position = vec4(px.x / u_halfRes.x, -px.y / u_halfRes.y, 0.0, 1.0);

  v_uv = mix(i_uv.xy, i_uv.zw, a_corner + 0.5);
  v_color = i_color;
  v_tex = int(i_misc.x + 0.5);
}`;

export const SPRITE_FS = `#version 300 es
precision highp float;
precision highp sampler2D;

in vec2 v_uv;
in vec4 v_color;
flat in int v_tex;

uniform sampler2D u_tex0;
uniform sampler2D u_tex1;
uniform sampler2D u_tex2;
uniform sampler2D u_tex3;
uniform sampler2D u_tex4;
uniform sampler2D u_tex5;
uniform sampler2D u_tex6;
uniform sampler2D u_tex7;
uniform sampler2D u_light;

uniform vec2  u_invRes;     // 1 / framebuffer size
uniform vec3  u_ambient;    // linear
uniform float u_shade;      // 0 = self-lit, 1 = fully shaded by the light buffer
uniform float u_response;   // per-layer light gain
uniform vec3  u_haze;       // atmospheric colour (linear)
uniform float u_hazeAmt;
uniform vec3  u_mul;        // per-layer multiply, lets FG_OCCLUDE crush to near black

out vec4 frag;

void main() {
  vec4 c;
  switch (v_tex) {
    case 0: c = texture(u_tex0, v_uv); break;
    case 1: c = texture(u_tex1, v_uv); break;
    case 2: c = texture(u_tex2, v_uv); break;
    case 3: c = texture(u_tex3, v_uv); break;
    case 4: c = texture(u_tex4, v_uv); break;
    case 5: c = texture(u_tex5, v_uv); break;
    case 6: c = texture(u_tex6, v_uv); break;
    default: c = texture(u_tex7, v_uv); break;
  }
  c *= v_color;
  if (c.a <= 0.0035) discard;

  // cheap sRGB -> linear so additive light sums behave physically
  vec3 lin = c.rgb * c.rgb;
  lin *= u_mul;
  lin = mix(lin, u_haze, u_hazeAmt);

  vec3 L = texture(u_light, gl_FragCoord.xy * u_invRes).rgb;
  vec3 illum = u_ambient + L * u_response;
  lin *= mix(vec3(1.0), illum, u_shade);

  frag = vec4(lin * c.a, c.a);   // premultiplied
}`;

export const TRI_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 a_pos;
layout(location=1) in vec4 a_color;
layout(location=2) in float a_parallax;

uniform vec2 u_cam;
uniform float u_scale;
uniform vec2 u_halfRes;

out vec4 v_color;

void main() {
  vec2 px = (a_pos - u_cam * a_parallax) * u_scale;
  gl_Position = vec4(px.x / u_halfRes.x, -px.y / u_halfRes.y, 0.0, 1.0);
  v_color = a_color;
}`;

export const TRI_FS = `#version 300 es
precision highp float;
in vec4 v_color;

uniform sampler2D u_light;
uniform vec2  u_invRes;
uniform vec3  u_ambient;
uniform float u_shade;
uniform float u_response;
uniform vec3  u_haze;
uniform float u_hazeAmt;
uniform vec3  u_mul;

out vec4 frag;

void main() {
  vec4 c = v_color;
  if (c.a <= 0.0035) discard;
  vec3 lin = c.rgb * c.rgb * u_mul;
  lin = mix(lin, u_haze, u_hazeAmt);
  vec3 L = texture(u_light, gl_FragCoord.xy * u_invRes).rgb;
  lin *= mix(vec3(1.0), u_ambient + L * u_response, u_shade);
  frag = vec4(lin * c.a, c.a);
}`;
