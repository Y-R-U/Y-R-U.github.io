// Minimal WebGL2 kit for the intro. Deliberately not shared with gfx/ — the intro must be able to
// run before the engine exists (ARCHITECTURE §8).

export const VS_QUAD = `#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

export function createGL(canvas) {
  const gl = canvas.getContext('webgl2', {
    alpha: false, antialias: false, depth: false, stencil: false,
    premultipliedAlpha: false, preserveDrawingBuffer: false,
    powerPreference: 'high-performance', desynchronized: false,
  });
  if (!gl) throw new Error('WebGL2 unavailable');
  const floatOK = !!gl.getExtension('EXT_color_buffer_float');
  gl.getExtension('OES_texture_float_linear');
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.CULL_FACE);
  return { gl, floatOK };
}

function compile(gl, type, src, tag) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s);
    const numbered = src.split('\n').map((l, i) => `${String(i + 1).padStart(3)}| ${l}`).join('\n');
    throw new Error(`shader ${tag} failed:\n${log}\n${numbered}`);
  }
  return s;
}

export function makeProgram(gl, vsSrc, fsSrc, tag = 'prog') {
  const p = gl.createProgram();
  const vs = compile(gl, gl.VERTEX_SHADER, vsSrc, tag + '.vs');
  const fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc, tag + '.fs');
  gl.attachShader(p, vs); gl.attachShader(p, fs);
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`link ${tag}: ` + gl.getProgramInfoLog(p));
  gl.deleteShader(vs); gl.deleteShader(fs);

  const loc = new Map();
  const u = (name) => {
    if (!loc.has(name)) loc.set(name, gl.getUniformLocation(p, name));
    return loc.get(name);
  };
  const api = {
    prog: p,
    use() { gl.useProgram(p); return api; },
    f(n, v) { gl.uniform1f(u(n), v); return api; },
    i(n, v) { gl.uniform1i(u(n), v); return api; },
    v2(n, x, y) { gl.uniform2f(u(n), x, y); return api; },
    v3(n, x, y, z) { gl.uniform3f(u(n), x, y, z); return api; },
    v4(n, x, y, z, w) { gl.uniform4f(u(n), x, y, z, w); return api; },
    arr(n, a) { gl.uniform1fv(u(n), a); return api; },
    arr4(n, a) { gl.uniform4fv(u(n), a); return api; },
    tex(n, t, unit) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); gl.uniform1i(u(n), unit); return api; },
    free() { gl.deleteProgram(p); },
  };
  return api;
}

export function makeTarget(gl, w, h, { float = false, linear = true, wrap = null } = {}) {
  const t = {
    w: Math.max(1, w | 0), h: Math.max(1, h | 0), float,
    fbo: gl.createFramebuffer(), tex: gl.createTexture(),
  };
  gl.bindTexture(gl.TEXTURE_2D, t.tex);
  const ifmt = float ? gl.RGBA16F : gl.RGBA8;
  const type = float ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;
  gl.texImage2D(gl.TEXTURE_2D, 0, ifmt, t.w, t.h, 0, gl.RGBA, type, null);
  const f = linear ? gl.LINEAR : gl.NEAREST;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
  const wr = wrap || gl.CLAMP_TO_EDGE;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wr);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wr);
  gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t.tex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  t.free = () => { gl.deleteFramebuffer(t.fbo); gl.deleteTexture(t.tex); };
  return t;
}

export function bindTarget(gl, t) {
  if (t) { gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo); gl.viewport(0, 0, t.w, t.h); }
  else { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight); }
}

export function clear(gl, r = 0, g = 0, b = 0, a = 1) {
  gl.clearColor(r, g, b, a);
  gl.clear(gl.COLOR_BUFFER_BIT);
}

export function drawQuad(gl) { gl.drawArrays(gl.TRIANGLES, 0, 3); }

export function texFromCanvas(gl, cnv, { linear = true, wrap = false, mips = false } = {}) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, cnv);
  if (mips) gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mips ? gl.LINEAR_MIPMAP_LINEAR : (linear ? gl.LINEAR : gl.NEAREST));
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, linear ? gl.LINEAR : gl.NEAREST);
  const w = wrap ? gl.REPEAT : gl.CLAMP_TO_EDGE;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, w);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, w);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  return t;
}

// A canvas-backed texture that gets re-uploaded every frame (characters, veins).
export function makeDynamicTex(gl, cnv) {
  const t = texFromCanvas(gl, cnv);
  return {
    tex: t,
    update() {
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, cnv);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    },
    free() { gl.deleteTexture(t); },
  };
}

export const BLEND = {
  none(gl) { gl.disable(gl.BLEND); },
  alpha(gl) { gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD); gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA); },
  add(gl) { gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.ONE, gl.ONE); },
};

// GLSL snippets every pass wants.
export const GLSL_LIB = `
float hash11(float p){ p = fract(p*0.1031); p *= p+33.33; p *= p+p; return fract(p); }
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*0.1031); p3 += dot(p3, p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
vec2  hash22(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*vec3(0.1031,0.1030,0.0973)); p3 += dot(p3,p3.yzx+33.33); return fract((p3.xx+p3.yz)*p3.zy); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f*f*(3.0-2.0*f);
  float a = hash12(i), b = hash12(i+vec2(1,0)), c = hash12(i+vec2(0,1)), d = hash12(i+vec2(1,1));
  return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
}
float fbm(vec2 p){
  float s=0.0, a=0.5;
  for(int i=0;i<5;i++){ s += a*vnoise(p); p = mat2(1.6,1.2,-1.2,1.6)*p; a*=0.5; }
  return s;
}
float fbm3(vec2 p){
  float s=0.0, a=0.5;
  for(int i=0;i<3;i++){ s += a*vnoise(p); p = mat2(1.6,1.2,-1.2,1.6)*p; a*=0.5; }
  return s;
}
vec3 aces(vec3 x){
  const float a=2.51,b=0.03,c=2.43,d=0.59,e=0.14;
  return clamp((x*(a*x+b))/(x*(c*x+d)+e), 0.0, 1.0);
}
`;
