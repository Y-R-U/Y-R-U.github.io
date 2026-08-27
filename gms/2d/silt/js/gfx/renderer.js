// SILT renderer — a density-field renderer, not a cell renderer.
//
// The grid goes up as ONE RGBA8 texture. A resolve pass turns 25 088 discrete
// cells into a continuous scalar field plus a voted colour; a lighting pass
// shades that field from its own gradient. Nothing anywhere draws a cell, which
// is the entire reason this does not look like every other sandtris.
//
// Pass chain (high tier):
//   bg -> resolve(MRT) -> occ down -> occ blur x2 -> light -> motes -> bloom(x8) -> composite

import {
  makeFS, makeTarget, resizeTarget, bindTarget, disposeTarget,
  makeDataTexture, uploadData, floatTargetsOK, makeProgram,
} from './shaders/gl.js';
import { BG_FS, RESOLVE_FS, DENS_X_FS, OCC_DOWN_FS, OCC_BLUR_FS, LIGHT_FS } from './shaders/field.js';
import { PART_VS, PART_FS } from './shaders/post.js';
import { createPostFX } from './postfx.js';
import { BIOMES, BIOME_NAMES, bakeBiome } from './biomes.js';
import { StateBuffer } from './state.js';
import { Motes } from './particles.js';
import { Stats, BUDGETS } from './stats.js';
import { DISSOLVE_TICKS } from '../sim/clears.js';

export { BUDGETS, BIOME_NAMES };

const TIERS = {
  high: { R: 2, SIG: 0.80, refract: true, mips: 3, motes: 900, texel: 2.2, maxSS: 4 },
  low:  { R: 1, SIG: 0.60, refract: false, mips: 2, motes: 220, texel: 3.2, maxSS: 2 },
};

const qs = (k) => {
  try { return new URLSearchParams(location.search).get(k); } catch { return null; }
};

/** Gaussian lattice sum, so a solid interior resolves to density 1.0 exactly. */
function kernelNorm(R, sig) {
  let s = 0;
  const k = 1 / (2 * sig * sig);
  for (let j = -R; j <= R; j++) for (let i = -R; i <= R; i++) s += Math.exp(-(i * i + j * j) * k);
  return 1 / s;
}

export async function createRenderer(canvas, opts = {}) {
  const preserve = opts.preserveDrawingBuffer !== undefined
    ? !!opts.preserveDrawingBuffer : qs('preserve') === '1';

  const gl = canvas.getContext('webgl2', {
    alpha: false, depth: false, stencil: false, antialias: false,
    premultipliedAlpha: false, powerPreference: 'high-performance',
    preserveDrawingBuffer: preserve, desynchronized: !preserve,
  });
  if (!gl) throw new Error('SILT needs WebGL2');

  const float = floatTargetsOK(gl);
  if (float) gl.getExtension('OES_texture_float_linear');   // ignored if absent; half-float filters anyway

  const forcedQ = opts.quality || qs('q');
  let tierName = (forcedQ === 'high' || forcedQ === 'low') ? forcedQ : 'high';
  const tierForced = tierName === forcedQ;

  const stats = new Stats(gl);
  stats.tier = tierName;

  /* ------------------------------------------------------------ geometry */
  const triVao = gl.createVertexArray();
  const drawTri = () => { gl.bindVertexArray(triVao); gl.drawArrays(gl.TRIANGLES, 0, 3); };

  /* ------------------------------------------------------------ programs */
  const pBg = makeFS(gl, BG_FS, 'bg');
  const pDensX = makeFS(gl, DENS_X_FS, 'dens-x');
  const pOccDown = makeFS(gl, OCC_DOWN_FS, 'occ-down');
  const pOccBlur = makeFS(gl, OCC_BLUR_FS, 'occ-blur');
  const pMotes = makeProgram(gl, PART_VS, PART_FS, 'motes');
  let pResolve = null, pLight = null, post = null;

  function buildTier(name) {
    const T = TIERS[name];
    if (pResolve) pResolve.dispose();
    if (pLight) pLight.dispose();
    if (post) post.dispose();
    pResolve = makeFS(gl, RESOLVE_FS(T.R, T.SIG, kernelNorm(T.R, T.SIG)), 'resolve');
    pLight = makeFS(gl, LIGHT_FS(T.refract), 'light');
    post = createPostFX(gl, drawTri, { float, mips: T.mips });
    post.resize(vw, vh);
    tierName = name;
    stats.tier = name;
    layout();
  }

  /* ------------------------------------------------------------- targets */
  let vw = 4, vh = 4, dpr = 1;
  let cols = 112, rows = 224;
  const bgT = makeTarget(gl, 4, 4, { float });
  const fieldT = makeTarget(gl, 4, 4, { float, attachments: 3 });   // colour+density, aux, piece
  const occA = makeTarget(gl, 4, 4, { float });
  const occB = makeTarget(gl, 4, 4, { float });
  const smA = makeTarget(gl, 4, 4, { float });
  const smB = makeTarget(gl, 4, 4, { float });
  let stateTex = makeDataTexture(gl, cols, rows);
  let sb = new StateBuffer(cols, rows);
  let motes = new Motes(gl, TIERS[tierName].motes);

  let rect = [0, 0, 1, 1];   // board in screen uv (y up)
  let superSample = 2;

  function layout() {
    const T = TIERS[tierName];
    const scale = Math.min(vw / cols, vh / rows) * 0.985;
    const bw = Math.max(1, cols * scale), bh = Math.max(1, rows * scale);
    rect = [(vw - bw) / 2 / vw, (vh - bh) / 2 / vh, bw / vw, bh / vh];

    // Resolve at roughly one texel per T.texel screen pixels: fine enough that
    // the bilinear upsample never facets, coarse enough that the 25-tap kernel
    // runs over a quarter of a megapixel instead of two.
    const pxPerCell = bw / cols;
    const ss = Math.max(2, Math.min(T.maxSS, Math.round(pxPerCell / T.texel)));
    resizeTarget(gl, fieldT, cols * ss, rows * ss);
    resizeTarget(gl, smA, cols * ss, rows * ss);
    resizeTarget(gl, smB, cols * ss, rows * ss);
    superSample = ss;
    resizeTarget(gl, occA, cols, rows);
    resizeTarget(gl, occB, cols, rows);
    resizeTarget(gl, bgT, Math.ceil(vw / 2), Math.ceil(vh / 2));
  }

  /* -------------------------------------------------------------- biomes */
  let biomeName = 'dune';
  let B = BIOMES.dune;
  let baked = bakeBiome(B);

  function setBiome(name) {
    const b = BIOMES[name];
    if (!b || name === biomeName) return;
    biomeName = name; B = b; baked = bakeBiome(b);
  }

  /* --------------------------------------------------------------- state */
  let time = 0, lastNow = performance.now(), frames = 0, probed = tierForced;
  let flash = [1, 1, 1, 0];
  let lastChainMax = 0;
  let shakeSeed = 0;
  let lost = false;
  const rng = () => Math.random();

  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); lost = true; });

  buildTier(tierName);

  /* ---------------------------------------------------------------- API  */
  function resize(cssW, cssH, devicePR) {
    const capped = Math.min(2, devicePR || window.devicePixelRatio || 1);
    dpr = qs('dpr') === '1' ? 1 : capped;
    vw = Math.max(1, Math.round(cssW * dpr));
    vh = Math.max(1, Math.round(cssH * dpr));
    canvas.width = vw; canvas.height = vh;
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    post.resize(vw, vh);
    layout();
  }

  function draw(world, o = {}, alpha = 1) {
    if (lost) return;
    const now = performance.now();
    let dt = (now - lastNow) / 1000;
    lastNow = now;
    if (!(dt > 0) || dt > 0.25) dt = 1 / 60;
    time = o.t !== undefined ? o.t : time + dt;
    stats.beginFrame();

    if (o.biome && o.biome !== biomeName) setBiome(o.biome);

    // grid geometry can change between modes
    if (world.g.cols !== cols || world.g.rows !== rows) {
      cols = world.g.cols; rows = world.g.rows;
      gl.deleteTexture(stateTex);
      stateTex = makeDataTexture(gl, cols, rows);
      sb = new StateBuffer(cols, rows);
      layout();
    }

    const t0 = performance.now();
    uploadData(gl, stateTex, cols, rows, sb.pack(world));
    stats.markUpload(performance.now() - t0);

    // a fresh chain fires a one-frame bloom-fed flash
    if (sb.clearMaxT >= DISSOLVE_TICKS && lastChainMax < DISSOLVE_TICKS) {
      flash = [B.emis[0] * 0.08, B.emis[1] * 0.08, B.emis[2] * 0.08, 0.11];
    }
    lastChainMax = sb.clearMaxT;
    flash[3] = Math.max(0, flash[3] - dt * 2.4);

    motes.emit(sb, dt, cols, rows, B.emis, TIERS[tierName].refract ? 260 : 90, rng);
    motes.step(dt * (0.6 + 0.4 * alpha));

    let passes = 0;
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
    gl.bindVertexArray(triVao);

    /* 1 — backdrop */
    bindTarget(gl, bgT);
    pBg.use()
      .u2f('u_res', bgT.w, bgT.h)
      .u4f('u_rect', rect[0], rect[1], rect[2], rect[3])
      .u1f('u_time', time)
      .u3f('u_skyTop', B.sky.top[0], B.sky.top[1], B.sky.top[2])
      .u3f('u_skyBot', B.sky.bot[0], B.sky.bot[1], B.sky.bot[2])
      .u3f('u_glowCol', B.glow.col[0], B.glow.col[1], B.glow.col[2])
      .u2f('u_glowPos', B.glow.pos[0], B.glow.pos[1])
      .u1f('u_glowAmt', B.glow.amt).u1f('u_bandAmt', B.glow.band)
      .u1f('u_glowTight', B.glow.tight)
      .u4f('u_well', B.well[0], B.well[1], B.well[2], B.well[3])
      .u4f('u_well2', B.well2[0], B.well2[1], B.well2[2], B.well2[3])
      .u3f('u_moteCol', B.mote.col[0], B.mote.col[1], B.mote.col[2])
      .u1f('u_moteAmt', B.mote.amt);
    drawTri(); passes++;

    /* 2 — density + colour resolve (MRT) */
    bindTarget(gl, fieldT);
    pResolve.use()
      .tex('u_state', 0, stateTex)
      .u2f('u_grid', cols, rows)
      .u1f('u_time', time)
      .u1f('u_dissolve', DISSOLVE_TICKS)
      .u3fv('u_tint[0]', baked.tints)
      .u3fv('u_matCol[0]', baked.matCol)
      .u4fv('u_matProp[0]', baked.matProp);
    drawTri(); passes++;

    /* 3 — silhouette blur. Separable, so the radius can be as wide as the look
           needs without a 49-tap kernel in the resolve pass. */
    const sr = 1.15 * superSample;
    bindTarget(gl, smB);
    pDensX.use().tex('u_src', 0, fieldT.texs[0]).u2f('u_dir', sr / fieldT.w, 0);
    drawTri(); passes++;
    bindTarget(gl, smA);
    pOccBlur.use().tex('u_src', 0, smB.tex).u2f('u_dir', 0, sr / fieldT.h);
    drawTri(); passes++;

    /* 4 — occlusion field */
    bindTarget(gl, occA);
    pOccDown.use().tex('u_src', 0, smA.tex).u2f('u_texel', 1 / fieldT.w, 1 / fieldT.h);
    drawTri(); passes++;
    pOccBlur.use();
    bindTarget(gl, occB);
    pOccBlur.tex('u_src', 0, occA.tex).u2f('u_dir', 1.7 / occA.w, 0);
    drawTri(); passes++;
    bindTarget(gl, occA);
    pOccBlur.tex('u_src', 0, occB.tex).u2f('u_dir', 0, 1.7 / occA.h);
    drawTri(); passes++;

    /* 5 — lighting */
    const S = B.surf;
    bindTarget(gl, post.scene);
    pLight.use()
      .tex('u_field', 0, fieldT.texs[0])
      .tex('u_aux', 1, fieldT.texs[1])
      .tex('u_occ', 2, occA.tex)
      .tex('u_bg', 3, bgT.tex)
      .tex('u_smooth', 4, smA.tex)
      .tex('u_piece', 5, fieldT.texs[2])
      .u2f('u_res', vw, vh).u2f('u_grid', cols, rows)
      .u4f('u_rect', rect[0], rect[1], rect[2], rect[3])
      .u2f('u_ftex', 1 / fieldT.w, 1 / fieldT.h)
      .u1f('u_time', time)
      .u2f('u_keyDir', B.key.dir[0], B.key.dir[1])
      .u2f('u_fillDir', B.fill.dir[0], B.fill.dir[1])
      .u3f('u_keyCol', B.key.col[0], B.key.col[1], B.key.col[2])
      .u3f('u_fillCol', B.fill.col[0], B.fill.col[1], B.fill.col[2])
      .u3f('u_ambCol', B.amb[0], B.amb[1], B.amb[2])
      .u3f('u_rimCol', B.rim[0], B.rim[1], B.rim[2])
      .u3f('u_emisCol', B.emis[0], B.emis[1], B.emis[2])
      .u1f('u_rimAmt', S.rim).u1f('u_specAmt', S.spec).u1f('u_sssAmt', S.sss)
      .u1f('u_grainAmt', S.grain).u1f('u_refrAmt', S.refr)
      .u1f('u_aoAmt', S.ao).u1f('u_shadowAmt', S.shadow).u1f('u_relief', S.relief)
      .u3f('u_pieceCtl', B.piece[0], B.piece[1], B.piece[2]);
    drawTri(); passes++;

    /* 6 — dissolve motes, additive on top of the lit scene */
    if (motes.alive) {
      motes.upload(rect, dpr);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.bindVertexArray(motes.vao);
      pMotes.use().u2f('u_shake', 0, 0);
      gl.drawArrays(gl.POINTS, 0, motes.alive);
      gl.disable(gl.BLEND);
      gl.bindVertexArray(triVao);
      passes++;
    }

    /* 7 — post */
    const G = B.grade;
    const sh = o.shake || 0;
    shakeSeed += dt * 47;
    const amp = sh * sh * 0.016;
    passes += post.run({
      time,
      bloom: G.bloom, threshold: G.threshold, knee: G.knee,
      exposure: G.exposure, sat: G.sat, contrast: G.contrast,
      vignette: G.vignette, grain: G.grain,
      chroma: Math.min(0.9, sh * 0.8 + flash[3] * 1.2),
      shakeX: Math.sin(shakeSeed * 1.7) * amp,
      shakeY: Math.cos(shakeSeed * 2.3) * amp,
      shadowTint: G.shadowTint, highTint: G.highTint,
      flash,
    });

    gl.bindVertexArray(null);
    stats.passes = passes;
    stats.motes = motes.alive;
    stats.endFrame();

    /* one-shot quality probe — measure, do not guess at the device */
    frames++;
    if (!probed && frames === 12) stats.reset();
    if (!probed && frames > 60) {
      probed = true;
      if (stats.frame.med > 20.5) { buildTier('low'); motes.dispose(); motes = new Motes(gl, TIERS.low.motes); stats.reset(); }
    }
  }

  function setQuality(name) {
    if (!TIERS[name] || name === tierName) return;
    probed = true;
    buildTier(name);
    motes.dispose();
    motes = new Motes(gl, TIERS[name].motes);
    stats.reset();
  }

  function dispose() {
    for (const t of [bgT, fieldT, occA, occB, smA, smB]) disposeTarget(gl, t);
    for (const p of [pBg, pDensX, pOccDown, pOccBlur, pMotes, pResolve, pLight]) p && p.dispose();
    post.dispose();
    motes.dispose();
    gl.deleteTexture(stateTex);
    gl.deleteVertexArray(triVao);
  }

  return {
    gl,
    resize,
    draw,
    setBiome,
    setQuality,
    stats: () => stats.read(),
    statsHtml: () => stats.html(),
    get tier() { return tierName; },
    get biome() { return biomeName; },
    get rect() { return rect.slice(); },
    dispose,
  };
}
