import { makeProgram, makeTarget, resizeTarget, bindTarget } from './shaders/gl.js';
import { LIGHT_VS, LIGHT_FS, LIGHT_BLUR_FS } from './shaders/light.js';
import { FULLSCREEN_VS } from './shaders/post.js';
import { fbm1 } from '../core/math.js';

export const MAX_LIGHTS = 256;
const STRIDE = 10;   // x,y,radius,parallax | r,g,b,soft | squash,angle

/**
 * Additive light accumulation at half resolution, then blurred twice.
 * The blur is the whole trick: a raw falloff quad reads as a decal, a blurred
 * one reads as light in air. Layers sample this buffer with their own gain.
 */
export function createLights(gl, quadBuf, opts = {}) {
  const scaleDiv = opts.scale || 2;         // 2 = half res
  const data = new Float32Array(MAX_LIGHTS * STRIDE);
  let count = 0;
  let time = 0;

  const prog = makeProgram(gl, LIGHT_VS, LIGHT_FS, 'light');
  const blur = makeProgram(gl, FULLSCREEN_VS, LIGHT_BLUR_FS, 'lightblur');

  const accum = makeTarget(gl, 4, 4, { float: opts.float });
  const tmp = makeTarget(gl, 4, 4, { float: opts.float });

  const ibuf = gl.createBuffer();
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, ibuf);
  gl.bufferData(gl.ARRAY_BUFFER, data.byteLength, gl.DYNAMIC_DRAW);
  const S = STRIDE * 4;
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, S, 0); gl.vertexAttribDivisor(1, 1);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, S, 16); gl.vertexAttribDivisor(2, 1);
  gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 2, gl.FLOAT, false, S, 32); gl.vertexAttribDivisor(3, 1);
  gl.bindVertexArray(null);

  const fsVao = gl.createVertexArray();
  gl.bindVertexArray(fsVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
  gl.bindVertexArray(null);

  const L = {
    get count() { return count; },
    accum,
    enabled: true,
    blurPasses: 2,
    blurRadius: 1.6,

    resize(pw, ph) {
      const w = Math.max(2, Math.ceil(pw / scaleDiv));
      const h = Math.max(2, Math.ceil(ph / scaleDiv));
      resizeTarget(gl, accum, w, h);
      resizeTarget(gl, tmp, w, h);
    },

    begin(t) { count = 0; time = t; },

    /**
     * Colours are given in display space and squared here so additive sums
     * behave like real light (matches the sprite shader's linearisation).
     */
    add(x, y, radius, r, g, b, intensity, flicker, squash, angle, parallax, soft) {
      if (count >= MAX_LIGHTS || radius <= 0) return;
      let inten = intensity;
      if (flicker > 0) {
        const ph = count * 13.37;
        inten *= 1 - flicker * (0.5 + 0.5 * fbm1(time * 9.5 + ph, count & 31));
      }
      if (inten <= 0.0004) return;
      const o = count * STRIDE;
      data[o] = x; data[o + 1] = y; data[o + 2] = radius; data[o + 3] = parallax === undefined ? 1 : parallax;
      data[o + 4] = r * r * inten;
      data[o + 5] = g * g * inten;
      data[o + 6] = b * b * inten;
      data[o + 7] = soft === undefined ? 0 : soft;
      data[o + 8] = squash === undefined ? 1 : squash;
      data[o + 9] = angle === undefined ? 0 : angle;
      count++;
    },

    /** Renders the accumulation buffer and returns the texture to sample. */
    render(camX, camY, scale, halfW, halfH) {
      bindTarget(gl, accum);
      gl.disable(gl.DEPTH_TEST);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);

      if (count > 0 && L.enabled) {
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE);
        gl.blendEquation(gl.FUNC_ADD);
        prog.use();
        prog.u2f('u_cam', camX, camY);
        prog.u1f('u_scale', scale / scaleDiv);
        prog.u2f('u_halfRes', accum.w * 0.5, accum.h * 0.5);
        gl.bindVertexArray(vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, ibuf);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, data, 0, count * STRIDE);
        gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, count);
        gl.bindVertexArray(null);
        gl.disable(gl.BLEND);
      }

      if (L.blurPasses > 0) {
        blur.use();
        gl.bindVertexArray(fsVao);
        for (let i = 0; i < L.blurPasses; i++) {
          const rad = L.blurRadius * (i + 1);
          bindTarget(gl, tmp);
          blur.tex('u_src', 0, accum.tex);
          blur.u2f('u_dir', rad / accum.w, 0);
          gl.drawArrays(gl.TRIANGLES, 0, 6);
          bindTarget(gl, accum);
          blur.tex('u_src', 0, tmp.tex);
          blur.u2f('u_dir', 0, rad / accum.h);
          gl.drawArrays(gl.TRIANGLES, 0, 6);
        }
        gl.bindVertexArray(null);
      }
      return accum.tex;
    },

    texture() { return accum.tex; },
  };

  return L;
}
