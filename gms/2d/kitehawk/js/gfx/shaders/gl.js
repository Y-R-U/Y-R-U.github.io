// Minimal WebGL2 helpers shared by renderer / lights / postfx.
// Lives under shaders/ only because those are the files this agent owns.

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
    u1f(n, v) { const l = this.loc(n); if (l) gl.uniform1f(l, v); return this; },
    u1i(n, v) { const l = this.loc(n); if (l !== null) gl.uniform1i(l, v); return this; },
    u2f(n, a, b) { const l = this.loc(n); if (l) gl.uniform2f(l, a, b); return this; },
    u3f(n, a, b, c) { const l = this.loc(n); if (l) gl.uniform3f(l, a, b, c); return this; },
    u4f(n, a, b, c, d) { const l = this.loc(n); if (l) gl.uniform4f(l, a, b, c, d); return this; },
    tex(n, unit, texture) {
      const l = this.loc(n);
      if (l === null) return this;
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(l, unit);
      return this;
    },
  };
}

/** Colour-only render target. Half-float when the driver allows it. */
export function makeTarget(gl, w, h, opts = {}) {
  const { float = false, filter = gl.LINEAR, wrap = gl.CLAMP_TO_EDGE } = opts;
  const t = { fb: gl.createFramebuffer(), tex: gl.createTexture(), w: 0, h: 0, float, filter, wrap };
  resizeTarget(gl, t, w, h);
  return t;
}

export function resizeTarget(gl, t, w, h) {
  w = Math.max(1, w | 0); h = Math.max(1, h | 0);
  if (t.w === w && t.h === h) return false;
  t.w = w; t.h = h;
  gl.bindTexture(gl.TEXTURE_2D, t.tex);
  if (t.float) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
  else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, t.filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, t.filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, t.wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, t.wrap);
  gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t.tex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return true;
}

export function bindTarget(gl, t) {
  if (t) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb);
    gl.viewport(0, 0, t.w, t.h);
  } else {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
}

/** Unit quad, corners -0.5..0.5, used as the base mesh everywhere. */
export function makeUnitQuad(gl) {
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -0.5, -0.5, 0.5, -0.5, -0.5, 0.5,
    -0.5, 0.5, 0.5, -0.5, 0.5, 0.5,
  ]), gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);
  return buf;
}
