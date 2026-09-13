// Post chain: bright-pass -> two blur passes -> composite. Three passes, not
// seven (DESIGN 9). Bloom runs at quarter resolution because on a phone the
// blur is the whole cost and nobody can see the difference through it.
//
// This is the renderer's own fallback chain. If js/gfx/postfx.js turns up with
// a makePost(), createRenderer().attachPost(post) hands the composite over to
// it and none of this runs.

export const FULLSCREEN_VS = `#version 300 es
out vec2 v_uv;
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  v_uv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

export const BRIGHT_FS = `#version 300 es
precision mediump float;
in vec2 v_uv;
uniform sampler2D u_tex;
uniform vec2 u_texel;
uniform float u_threshold;
out vec4 o;
void main() {
  // 4-tap box on the way down; a single tap at 1/4 res crawls with fireflies.
  vec3 c = texture(u_tex, v_uv + u_texel * vec2(-1.0, -1.0)).rgb;
  c += texture(u_tex, v_uv + u_texel * vec2( 1.0, -1.0)).rgb;
  c += texture(u_tex, v_uv + u_texel * vec2(-1.0,  1.0)).rgb;
  c += texture(u_tex, v_uv + u_texel * vec2( 1.0,  1.0)).rgb;
  c *= 0.25;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float k = max(l - u_threshold, 0.0) / max(l, 0.0001);
  o = vec4(c * k, 1.0);
}`;

export const BLUR_FS = `#version 300 es
precision mediump float;
in vec2 v_uv;
uniform sampler2D u_tex;
uniform vec2 u_dir;       // texel-sized step, horizontal or vertical
out vec4 o;
void main() {
  vec3 c = texture(u_tex, v_uv).rgb * 0.227027;
  c += (texture(u_tex, v_uv + u_dir * 1.3846).rgb +
        texture(u_tex, v_uv - u_dir * 1.3846).rgb) * 0.316216;
  c += (texture(u_tex, v_uv + u_dir * 3.2308).rgb +
        texture(u_tex, v_uv - u_dir * 3.2308).rgb) * 0.070270;
  o = vec4(c, 1.0);
}`;

export const COMPOSITE_FS = `#version 300 es
precision mediump float;
in vec2 v_uv;
uniform sampler2D u_scene;
uniform sampler2D u_bloom;
uniform float u_bloomAmt;
uniform float u_vignette;
uniform float u_chroma;
uniform float u_desat;
uniform vec4 u_flash;      // rgb + strength
uniform vec2 u_shake;
out vec4 o;

void main() {
  vec2 uv = clamp(v_uv + u_shake, vec2(0.001), vec2(0.999));
  vec2 d = uv - 0.5;
  float r2 = dot(d, d);

  vec3 c;
  if (u_chroma > 0.0005) {
    // split along the radius, so the fringe grows towards the edges where the
    // eye reads it as impact rather than as a broken screen
    vec2 off = d * u_chroma * (0.4 + r2);
    c.r = texture(u_scene, clamp(uv + off, vec2(0.001), vec2(0.999))).r;
    c.g = texture(u_scene, uv).g;
    c.b = texture(u_scene, clamp(uv - off, vec2(0.001), vec2(0.999))).b;
  } else {
    c = texture(u_scene, uv).rgb;
  }

  c += texture(u_bloom, uv).rgb * u_bloomAmt;

  if (u_desat > 0.0005) {
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c = mix(c, vec3(l), u_desat);
  }

  // heavy contrast + a filmic knee: near-black streets, blown-out threads
  c = max(c, 0.0);
  c = (c * (2.51 * c + 0.03)) / (c * (2.43 * c + 0.59) + 0.14);
  c *= 1.0 - u_vignette * smoothstep(0.12, 0.62, r2);
  c += u_flash.rgb * u_flash.a;

  o = vec4(c, 1.0);
}`;
