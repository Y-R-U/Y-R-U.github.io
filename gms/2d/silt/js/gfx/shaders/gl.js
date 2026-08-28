// Minimal WebGL2 helpers. Lifted from kitehawk/js/gfx/shaders/gl.js (battle-tested)
// and extended for SILT with: MRT targets, NEAREST integer-ish data textures, and
// a fullscreen-triangle program that needs no vertex buffer at all.

export function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s);
    const numbered = src.split('\n').map((l, i) => `${i + 1}: ${l}`).join('\n');
    gl.deleteShader(s);
    throw new Error('shader compile failed:\n' + log + '\n' + numbered);
  }
  return s;
}

export const TRI_VS = `#version 300 es
precision highp float;
out vec2 v_uv;
void main() {
  vec2 p = vec2(gl_VertexID == 1 ? 3.0 : -1.0, gl_VertexID == 2 ? 3.0 : -1.0);
  v_uv = p * 0.5 + 0.5;
  gl_Position = vec4(p, 0.0, 1.0);
}`;

export function makeProgram(gl, vsSrc, fsSrc, label = '') {
  const vs = compile(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc);
  const p = gl.createProgram();
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(p);
    gl.deleteProgram(p);
    throw new Error(`program link failed (${label}): ` + log);
  }
  const cache = new Map();
  return {
    prog: p,
    label,
    use() { gl.useProgram(p); return this; },
    loc(name) {
      let l = cache.get(name);
      if (l === undefined) { l = gl.getUniformLocation(p, name); cache.set(name, l); }
      return l;
    },
    u1f(n, v) { const l = this.loc(n); if (l !== null) gl.uniform1f(l, v); return this; },
    u1i(n, v) { const l = this.loc(n); if (l !== null) gl.uniform1i(l, v); return this; },
    u2f(n, a, b) { const l = this.loc(n); if (l !== null) gl.uniform2f(l, a, b); return this; },
    u3f(n, a, b, c) { const l = this.loc(n); if (l !== null) gl.uniform3f(l, a, b, c); return this; },
    u4f(n, a, b, c, d) { const l = this.loc(n); if (l !== null) gl.uniform4f(l, a, b, c, d); return this; },
    u1fv(n, arr) { const l = this.loc(n); if (l !== null) gl.uniform1fv(l, arr); return this; },
    u3fv(n, arr) { const l = this.loc(n); if (l !== null) gl.uniform3fv(l, arr); return this; },
    u4fv(n, arr) { const l = this.loc(n); if (l !== null) gl.uniform4fv(l, arr); return this; },
    tex(n, unit, texture) {
      const l = this.loc(n);
      if (l === null) return this;
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(l, unit);
      return this;
    },
    dispose() { gl.deleteProgram(p); },
  };
}

/** A fullscreen-triangle program: no attributes, no buffer, gl_VertexID only. */
export function makeFS(gl, fsSrc, label = '') { return makeProgram(gl, TRI_VS, fsSrc, label); }

/**
 * Colour render target. `attachments` > 1 gives MRT (t.tex is attachment 0,
 * t.texs is the full array). Half-float when the driver allows it.
 */
export function makeTarget(gl, w, h, opts = {}) {
  const {
    float = false, filter = gl.LINEAR, wrap = gl.CLAMP_TO_EDGE, attachments = 1,
  } = opts;
  const t = {
    fb: gl.createFramebuffer(), texs: [], w: 0, h: 0, float, filter, wrap, attachments,
  };
  for (let i = 0; i < attachments; i++) t.texs.push(gl.createTexture());
  Object.defineProperty(t, 'tex', { get() { return t.texs[0]; } });
  resizeTarget(gl, t, w, h);
  return t;
}

export function resizeTarget(gl, t, w, h) {
  w = Math.max(1, w | 0); h = Math.max(1, h | 0);
  if (t.w === w && t.h === h) return false;
  t.w = w; t.h = h;
  gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb);
  const bufs = [];
  for (let i = 0; i < t.attachments; i++) {
    gl.bindTexture(gl.TEXTURE_2D, t.texs[i]);
    if (t.float) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, t.filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, t.filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, t.wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, t.wrap);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, t.texs[i], 0);
    bufs.push(gl.COLOR_ATTACHMENT0 + i);
  }
  if (t.attachments > 1) gl.drawBuffers(bufs);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return true;
}

export function bindTarget(gl, t) {
  if (t) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb);
    if (t.attachments > 1) {
      const bufs = [];
      for (let i = 0; i < t.attachments; i++) bufs.push(gl.COLOR_ATTACHMENT0 + i);
      gl.drawBuffers(bufs);
    }
    gl.viewport(0, 0, t.w, t.h);
  } else {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
}

export function disposeTarget(gl, t) {
  for (const tx of t.texs) gl.deleteTexture(tx);
  gl.deleteFramebuffer(t.fb);
}

/**
 * NEAREST RGBA8 data texture — the state grid. LINEAR would silently interpolate
 * material *ids*, which is nonsense; every smoothing here is done by hand in the
 * resolve shader so density and colour can be filtered differently.
 */
export function makeDataTexture(gl, w, h) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return tex;
}

export function uploadData(gl, tex, w, h, bytes) {
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
}

/** Half-float colour attachments are optional on mobile GL. Probe, do not assume. */
export function floatTargetsOK(gl) {
  return !!(gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'));
}
