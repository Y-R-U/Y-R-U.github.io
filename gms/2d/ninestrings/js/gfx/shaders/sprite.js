// The one batch shader. Every drawable in the game is a textured quad out of a
// single atlas, so there is exactly one program and exactly one texture bind
// for the whole frame; layers differ only by blend func and projection.
//
// Output is PREMULTIPLIED. That is what lets the normal buckets use
// (ONE, ONE_MINUS_SRC_ALPHA) and the additive bucket (ONE, ONE) with the same
// shader and no branch: a fading additive particle still fades, because its rgb
// is already scaled by its alpha.

export const SPRITE_VS = `#version 300 es
in vec2 a_pos;
in vec2 a_uv;
in vec4 a_col;
uniform vec4 u_proj;      // (2*zoom/w, -2*zoom/h, -camX, -camY)
out vec2 v_uv;
out vec4 v_col;
void main() {
  v_uv = a_uv;
  v_col = a_col;
  gl_Position = vec4((a_pos.x + u_proj.z) * u_proj.x,
                     (a_pos.y + u_proj.w) * u_proj.y, 0.0, 1.0);
}`;

export const SPRITE_FS = `#version 300 es
precision mediump float;
in vec2 v_uv;
in vec4 v_col;
uniform sampler2D u_tex;
out vec4 o;
void main() {
  vec4 t = texture(u_tex, v_uv);
  float a = t.a * v_col.a;
  o = vec4(t.rgb * v_col.rgb * a, a);
}`;
