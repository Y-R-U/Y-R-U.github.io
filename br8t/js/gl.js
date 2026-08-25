// gl.js — a deliberately tiny WebGL2 harness.
// One fullscreen triangle, N fragment programs, one point-stream pipeline.
// No libraries. The whole site renders through this file.

export function createGL(canvas) {
  const gl = canvas.getContext('webgl2', {
    antialias: false, alpha: false, depth: false, stencil: false,
    powerPreference: 'high-performance', preserveDrawingBuffer: false,
  });
  if (!gl) return null;

  const TRI_VS = `#version 300 es
void main(){
  vec2 p = vec2(gl_VertexID==1 ? 3.0 : -1.0, gl_VertexID==2 ? 3.0 : -1.0);
  gl_Position = vec4(p, 0.0, 1.0);
}`;

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(s);
      const numbered = src.split('\n').map((l, i) => `${i + 1}: ${l}`).join('\n');
      throw new Error(`shader compile:\n${log}\n${numbered}`);
    }
    return s;
  }

  function program(fsSrc, vsSrc = TRI_VS) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, vsSrc));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fsSrc));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error('link: ' + gl.getProgramInfoLog(p));
    }
    const locs = new Map();
    const loc = (n) => {
      if (!locs.has(n)) locs.set(n, gl.getUniformLocation(p, n));
      return locs.get(n);
    };
    return {
      raw: p,
      use() { gl.useProgram(p); },
      // set uniforms from {name:[..floats]} — arity picked from length
      set(obj) {
        for (const k in obj) {
          const v = obj[k], l = loc(k);
          if (l === null) continue;
          if (typeof v === 'number') gl.uniform1f(l, v);
          else if (v.length === 2) gl.uniform2f(l, v[0], v[1]);
          else if (v.length === 3) gl.uniform3f(l, v[0], v[1], v[2]);
          else if (v.length === 4) gl.uniform4f(l, v[0], v[1], v[2], v[3]);
          else gl.uniform1f(l, v[0]);
        }
      },
    };
  }

  return { gl, program };
}
