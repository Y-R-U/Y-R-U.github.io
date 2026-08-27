// Shared GLSL prelude. hash/value-noise/fbm carried verbatim from br8t/js/shaders.js
// so every pass agrees on what "noise" means — a grain that changes definition
// between the resolve and the lighting pass shimmers.

export const LIB = `
float ss(float a, float b, float x) { return smoothstep(a, b, x); }
float h12(vec2 p) { vec3 q = fract(vec3(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
vec2  h22(vec2 p) { vec3 q = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); q += dot(q, q.yzx + 33.33); return fract((q.xx + q.yz) * q.zy); }
float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3. - 2. * f);
  return mix(mix(h12(i), h12(i + vec2(1, 0)), u.x), mix(h12(i + vec2(0, 1)), h12(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0., a = .5; mat2 R = mat2(.8, .6, -.6, .8);
  for (int i = 0; i < 5; i++) { v += a * vn(p); p = R * p * 2.03; a *= .5; }
  return v;
}
float fbm3(vec2 p) {
  float v = 0., a = .5; mat2 R = mat2(.8, .6, -.6, .8);
  for (int i = 0; i < 3; i++) { v += a * vn(p); p = R * p * 2.03; a *= .5; }
  return v;
}
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec3 aces(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}
`;

export const HEAD = `#version 300 es
precision highp float;
in vec2 v_uv;
`;
