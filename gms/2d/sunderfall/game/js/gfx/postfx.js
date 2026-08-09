import { makeProgram, makeTarget, resizeTarget, bindTarget } from './shaders/gl.js';
import { FULLSCREEN_VS, BRIGHT_FS, DOWN_FS, BLUR_FS, UP_FS, RAYS_FS, COMPOSITE_FS } from './shaders/post.js';
import { fbm1, clamp01 } from '../core/math.js';

const MIPS = 3;
const MAX_WAVES = 4;

/**
 * HDR scene target -> bloom -> composite. Also owns the screen-effect state
 * (trauma shake, hitstop, shockwaves, flash) because every one of them is
 * consumed either by this pass or by the camera it feeds.
 */
export function createPostFX(gl, quadBuf, opts = {}) {
  const float = !!opts.float;

  const scene = makeTarget(gl, 4, 4, { float });
  const raysT = makeTarget(gl, 4, 4, { float });
  const mip = [];
  for (let i = 0; i < MIPS; i++) {
    mip.push({ a: makeTarget(gl, 4, 4, { float }), b: makeTarget(gl, 4, 4, { float }) });
  }

  const pBright = makeProgram(gl, FULLSCREEN_VS, BRIGHT_FS, 'bright');
  const pDown = makeProgram(gl, FULLSCREEN_VS, DOWN_FS, 'down');
  const pBlur = makeProgram(gl, FULLSCREEN_VS, BLUR_FS, 'blur');
  const pUp = makeProgram(gl, FULLSCREEN_VS, UP_FS, 'up');
  const pRays = makeProgram(gl, FULLSCREEN_VS, RAYS_FS, 'rays');
  const pComp = makeProgram(gl, FULLSCREEN_VS, COMPOSITE_FS, 'composite');

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
  gl.bindVertexArray(null);

  let pw = 4, ph = 4;

  /* ---- effect state --------------------------------------------------- */

  const waves = [];
  for (let i = 0; i < MAX_WAVES; i++) waves.push({ x: 0, y: 0, t: 0, life: 0, strength: 0, speed: 1500 });
  const waveUV = new Float32Array(MAX_WAVES * 4);

  let trauma = 0, traumaDecay = 1.6, shakeSeed = 0, shakeTime = 0;
  let flashR = 0, flashG = 0, flashB = 0, flashA = 0, flashT = 0, flashLife = 0;
  let chromaAmt = 0, chromaT = 0, chromaLife = 0;
  let tsTarget = 1, tsCurrent = 1, tsTimer = 0;
  let time = 0;

  const rays = { on: false, x: 0, y: 0, strength: 0.5, decay: 0.94, density: 1.0 };

  const fx = {
    // tunables — scenes are expected to set these
    bloom: 0.85,
    threshold: 0.72,
    knee: 0.4,
    exposure: 1.0,
    saturation: 1.06,
    contrast: 1.04,
    grain: 0.030,
    vignetteAmt: 0.55,
    maxShake: 26,            // world units at full trauma
    shakeFreq: 22,
    shadowTint: [0.84, 1.00, 1.12],
    highTint: [1.10, 1.015, 0.88],

    shakeX: 0, shakeY: 0,

    shake(strength, seconds = 0.4) {
      trauma = clamp01(trauma + strength);
      const rate = 1 / Math.max(0.05, seconds);
      traumaDecay = Math.min(traumaDecay, rate);
      shakeSeed = (shakeSeed + 1) & 63;
    },

    shockwave(x, y, strength = 1, opt) {
      // -1, not 0: four waves all spawned this frame sit at t/life === 0, which is
      // never > 0, so slot stayed null and this threw on the busiest frames.
      let slot = null, oldest = -1;
      for (let i = 0; i < MAX_WAVES; i++) {
        const w = waves[i];
        if (w.strength <= 0) { slot = w; break; }
        if (w.t / Math.max(w.life, 1e-3) > oldest) { oldest = w.t / Math.max(w.life, 1e-3); slot = w; }
      }
      slot.x = x; slot.y = y; slot.t = 0;
      slot.life = (opt && opt.life) || 0.55;
      slot.strength = strength;
      slot.speed = (opt && opt.speed) || 1500;
    },

    flash(r, g, b, a, seconds = 0.15) {
      flashR = r; flashG = g; flashB = b;
      flashA = a; flashT = 0; flashLife = Math.max(0.016, seconds);
    },

    chroma(amount, seconds = 0.25) {
      chromaAmt = Math.max(chromaAmt, amount);
      chromaT = 0; chromaLife = Math.max(0.016, seconds);
    },

    /** Hitstop. Real-time timer, so it always recovers even at scale 0. */
    timeScale(scale, seconds = 0.06) {
      tsTarget = scale; tsTimer = seconds; tsCurrent = scale;
    },
    getTimeScale() { return tsCurrent; },

    vignette(amount) { fx.vignetteAmt = clamp01(amount); },

    /** God rays from a world point. Set strength 0 to switch off. */
    setRays(x, y, strength, decay = 0.94, density = 1.0) {
      rays.on = strength > 0;
      rays.x = x; rays.y = y; rays.strength = strength;
      rays.decay = decay; rays.density = density;
    },

    setGrade(shadow, high) {
      if (shadow) fx.shadowTint = shadow;
      if (high) fx.highTint = high;
    },

    get trauma() { return trauma; },
    reset() {
      trauma = 0; flashA = 0; chromaAmt = 0; tsCurrent = tsTarget = 1; tsTimer = 0;
      for (const w of waves) w.strength = 0;
    },
  };

  /** Advance every effect timer. dt is REAL seconds, never scaled. */
  function tick(dt) {
    time += dt;
    shakeTime += dt;

    if (trauma > 0) {
      trauma = Math.max(0, trauma - traumaDecay * dt);
      if (trauma === 0) traumaDecay = 1.6;
      const t2 = trauma * trauma;
      fx.shakeX = t2 * fx.maxShake * fbm1(shakeTime * fx.shakeFreq, shakeSeed);
      fx.shakeY = t2 * fx.maxShake * fbm1(shakeTime * fx.shakeFreq + 137.7, shakeSeed + 17);
    } else {
      fx.shakeX = fx.shakeY = 0;
    }

    for (let i = 0; i < MAX_WAVES; i++) {
      const w = waves[i];
      if (w.strength <= 0) continue;
      w.t += dt;
      if (w.t >= w.life) w.strength = 0;
    }

    if (flashA > 0) {
      flashT += dt;
      if (flashT >= flashLife) flashA = 0;
    }
    if (chromaAmt > 0) {
      chromaT += dt;
      if (chromaT >= chromaLife) chromaAmt = 0;
    }
    if (tsTimer > 0) {
      tsTimer -= dt;
      if (tsTimer <= 0) { tsTimer = 0; tsTarget = 1; }
      else tsCurrent = tsTarget;
    } else if (tsCurrent !== 1) {
      // ease back rather than snap — a hard step out of hitstop reads as a stutter
      tsCurrent = tsCurrent + (1 - tsCurrent) * Math.min(1, dt * 14);
      if (Math.abs(1 - tsCurrent) < 0.01) tsCurrent = 1;
    }
  }

  function resize(w, h) {
    pw = w; ph = h;
    resizeTarget(gl, scene, w, h);
    resizeTarget(gl, raysT, Math.ceil(w / 4), Math.ceil(h / 4));
    let mw = Math.ceil(w / 2), mh = Math.ceil(h / 2);
    for (let i = 0; i < MIPS; i++) {
      resizeTarget(gl, mip[i].a, mw, mh);
      resizeTarget(gl, mip[i].b, mw, mh);
      mw = Math.max(2, Math.ceil(mw / 2));
      mh = Math.max(2, Math.ceil(mh / 2));
    }
  }

  function blit() { gl.drawArrays(gl.TRIANGLES, 0, 6); }

  function blurTarget(t, tmp, radius) {
    pBlur.use();
    bindTarget(gl, tmp);
    pBlur.tex('u_src', 0, t.tex);
    pBlur.u2f('u_dir', radius / t.w, 0);
    blit();
    bindTarget(gl, t);
    pBlur.tex('u_src', 0, tmp.tex);
    pBlur.u2f('u_dir', 0, radius / t.h);
    blit();
  }

  /**
   * @param lightTex  light accumulation texture, used for the ray pass
   * @param toScreenX fn(worldX, worldY, out) -> screen uv, supplied by the renderer
   */
  function run(lightTex, screenOf) {
    gl.bindVertexArray(vao);
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);

    // --- bloom
    if (fx.bloom > 0) {
      pBright.use();
      bindTarget(gl, mip[0].a);
      pBright.tex('u_src', 0, scene.tex);
      pBright.u2f('u_texel', 1 / scene.w, 1 / scene.h);
      pBright.u1f('u_thresh', fx.threshold);
      pBright.u1f('u_knee', Math.max(0.0001, fx.knee));
      blit();

      pDown.use();
      for (let i = 1; i < MIPS; i++) {
        bindTarget(gl, mip[i].a);
        pDown.tex('u_src', 0, mip[i - 1].a.tex);
        pDown.u2f('u_texel', 1 / mip[i - 1].a.w, 1 / mip[i - 1].a.h);
        blit();
      }
      for (let i = 0; i < MIPS; i++) blurTarget(mip[i].a, mip[i].b, 1.35 + i * 0.4);

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      pUp.use();
      for (let i = MIPS - 1; i > 0; i--) {
        bindTarget(gl, mip[i - 1].a);
        pUp.tex('u_src', 0, mip[i].a.tex);
        pUp.u2f('u_texel', 1 / mip[i].a.w, 1 / mip[i].a.h);
        pUp.u1f('u_amount', 0.92);
        blit();
      }
      gl.disable(gl.BLEND);
    } else {
      bindTarget(gl, mip[0].a);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }

    // --- god rays
    let raysAmt = 0;
    if (rays.on && lightTex) {
      const uv = screenOf(rays.x, rays.y);
      pRays.use();
      bindTarget(gl, raysT);
      pRays.tex('u_src', 0, lightTex);
      pRays.u2f('u_origin', uv.x, 1 - uv.y);
      pRays.u1f('u_decay', rays.decay);
      pRays.u1f('u_density', rays.density);
      pRays.u1f('u_weight', 1.0);
      blit();
      raysAmt = rays.strength;
    }

    // --- composite to the default framebuffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, pw, ph);
    pComp.use();
    pComp.tex('u_scene', 0, scene.tex);
    pComp.tex('u_bloom', 1, mip[0].a.tex);
    pComp.tex('u_rays', 2, raysT.tex);
    pComp.u2f('u_res', pw, ph);
    pComp.u1f('u_aspect', pw / ph);
    pComp.u1f('u_time', time);
    pComp.u1f('u_bloomAmt', fx.bloom);
    pComp.u1f('u_raysAmt', raysAmt);
    pComp.u1f('u_vignette', fx.vignetteAmt);
    pComp.u1f('u_grain', fx.grain);
    pComp.u1f('u_exposure', fx.exposure);
    pComp.u1f('u_sat', fx.saturation);
    pComp.u1f('u_contrast', fx.contrast);
    pComp.u3f('u_shadowTint', fx.shadowTint[0], fx.shadowTint[1], fx.shadowTint[2]);
    pComp.u3f('u_highTint', fx.highTint[0], fx.highTint[1], fx.highTint[2]);

    const chromaNow = chromaAmt > 0 ? chromaAmt * (1 - chromaT / chromaLife) : 0;
    pComp.u1f('u_chroma', chromaNow);

    const fa = flashA > 0 ? flashA * (1 - flashT / flashLife) : 0;
    pComp.u4f('u_flash', flashR, flashG, flashB, fa);

    for (let i = 0; i < MAX_WAVES; i++) {
      const w = waves[i];
      const o = i * 4;
      if (w.strength <= 0) { waveUV[o + 3] = 0; continue; }
      const uv = screenOf(w.x, w.y);
      const k = w.t / w.life;
      waveUV[o] = uv.x;
      waveUV[o + 1] = 1 - uv.y;
      waveUV[o + 2] = (w.t * w.speed * screenOf.scale) / ph;
      waveUV[o + 3] = w.strength * Math.pow(1 - k, 1.6);
    }
    pComp.u4f('u_wave0', waveUV[0], waveUV[1], waveUV[2], waveUV[3]);
    pComp.u4f('u_wave1', waveUV[4], waveUV[5], waveUV[6], waveUV[7]);
    pComp.u4f('u_wave2', waveUV[8], waveUV[9], waveUV[10], waveUV[11]);
    pComp.u4f('u_wave3', waveUV[12], waveUV[13], waveUV[14], waveUV[15]);

    blit();
    gl.bindVertexArray(null);
  }

  return { fx, scene, tick, resize, run, get bloomTex() { return mip[0].a.tex; } };
}
