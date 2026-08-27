// HDR scene -> bloom -> tonemap -> grade -> vignette + grain.
// Adapted from kitehawk/js/gfx/postfx.js: same BRIGHT/DOWN/BLUR/UP/COMPOSITE
// ladder, minus the god-ray and shockwave passes SILT has no use for, and
// driven by a fullscreen triangle instead of a quad buffer.

import { makeFS, makeTarget, resizeTarget, bindTarget, disposeTarget } from './shaders/gl.js';
import { BRIGHT_FS, DOWN_FS, BLUR_FS, UP_FS, COMPOSITE_FS } from './shaders/post.js';

export function createPostFX(gl, drawTri, opts = {}) {
  const float = !!opts.float;
  const MIPS = opts.mips || 3;

  const scene = makeTarget(gl, 4, 4, { float });
  const mip = [];
  for (let i = 0; i < MIPS; i++) mip.push({ a: makeTarget(gl, 4, 4, { float }), b: makeTarget(gl, 4, 4, { float }) });

  const pBright = makeFS(gl, BRIGHT_FS, 'bright');
  const pDown = makeFS(gl, DOWN_FS, 'down');
  const pBlur = makeFS(gl, BLUR_FS, 'blur');
  const pUp = makeFS(gl, UP_FS, 'up');
  const pComp = makeFS(gl, COMPOSITE_FS, 'composite');

  let pw = 4, ph = 4;

  function resize(w, h) {
    pw = w; ph = h;
    resizeTarget(gl, scene, w, h);
    let mw = Math.ceil(w / 2), mh = Math.ceil(h / 2);
    for (let i = 0; i < MIPS; i++) {
      resizeTarget(gl, mip[i].a, mw, mh);
      resizeTarget(gl, mip[i].b, mw, mh);
      mw = Math.max(2, Math.ceil(mw / 2));
      mh = Math.max(2, Math.ceil(mh / 2));
    }
  }

  function blurTarget(t, tmp, radius) {
    pBlur.use();
    bindTarget(gl, tmp);
    pBlur.tex('u_src', 0, t.tex).u2f('u_dir', radius / t.w, 0);
    drawTri();
    bindTarget(gl, t);
    pBlur.tex('u_src', 0, tmp.tex).u2f('u_dir', 0, radius / t.h);
    drawTri();
  }

  /** @returns number of draw passes issued, for the perf readout. */
  function run(p) {
    let passes = 0;
    gl.disable(gl.BLEND);

    if (p.bloom > 0) {
      pBright.use();
      bindTarget(gl, mip[0].a);
      pBright.tex('u_src', 0, scene.tex)
        .u2f('u_texel', 1 / scene.w, 1 / scene.h)
        .u1f('u_thresh', p.threshold).u1f('u_knee', Math.max(1e-4, p.knee));
      drawTri(); passes++;

      pDown.use();
      for (let i = 1; i < MIPS; i++) {
        bindTarget(gl, mip[i].a);
        pDown.tex('u_src', 0, mip[i - 1].a.tex).u2f('u_texel', 1 / mip[i - 1].a.w, 1 / mip[i - 1].a.h);
        drawTri(); passes++;
      }
      for (let i = 0; i < MIPS; i++) { blurTarget(mip[i].a, mip[i].b, 1.35 + i * 0.45); passes += 2; }

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      pUp.use();
      for (let i = MIPS - 1; i > 0; i--) {
        bindTarget(gl, mip[i - 1].a);
        pUp.tex('u_src', 0, mip[i].a.tex).u2f('u_texel', 1 / mip[i].a.w, 1 / mip[i].a.h).u1f('u_amount', 0.92);
        drawTri(); passes++;
      }
      gl.disable(gl.BLEND);
    } else {
      bindTarget(gl, mip[0].a);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, pw, ph);
    pComp.use();
    pComp.tex('u_scene', 0, scene.tex).tex('u_bloom', 1, mip[0].a.tex)
      .u2f('u_res', pw, ph).u1f('u_aspect', pw / ph).u1f('u_time', p.time)
      .u1f('u_bloomAmt', p.bloom).u1f('u_vignette', p.vignette).u1f('u_grain', p.grain)
      .u1f('u_exposure', p.exposure).u1f('u_sat', p.sat).u1f('u_contrast', p.contrast)
      .u1f('u_chroma', p.chroma || 0)
      .u2f('u_shake', p.shakeX || 0, p.shakeY || 0)
      .u3f('u_shadowTint', p.shadowTint[0], p.shadowTint[1], p.shadowTint[2])
      .u3f('u_highTint', p.highTint[0], p.highTint[1], p.highTint[2])
      .u4f('u_flash', p.flash[0], p.flash[1], p.flash[2], p.flash[3]);
    drawTri(); passes++;
    return passes;
  }

  function dispose() {
    disposeTarget(gl, scene);
    for (const m of mip) { disposeTarget(gl, m.a); disposeTarget(gl, m.b); }
    for (const pr of [pBright, pDown, pBlur, pUp, pComp]) pr.dispose();
  }

  return { scene, resize, run, dispose };
}
