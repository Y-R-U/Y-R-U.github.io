// SKYPUTT audio — master graph, shared by the live context and offline renders.
//
//   sfx.dry  ─┐                                   ┌─ (offline tap: pre)
//   music.dry ┼──────────────────────────▶ master ┴▶ limiter ▶ soft clip ▶ dest
//   sfx.wet  ─┼▶ verbIn ▶ convolver ▶ verbOut ─▶ ┘
//   music.wet ┘
//
// sfx.dry / sfx.wet are the sfx volume (both set together); music.* carry volume x duck.
import { impulseBuffer, holdParam } from './core.js';

function softClipCurve() {
  // Input is pre-scaled by 0.5, so the curve spans -2..2. Linear to 0.85, then a tanh knee to 0.99.
  const n = 4096, c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 4 - 2, a = Math.abs(x);
    c[i] = Math.sign(x) * (a < 0.85 ? a : 0.85 + 0.14 * Math.tanh((a - 0.85) / 0.14));
  }
  return c;
}

export function buildGraph(ctx, dest = ctx.destination) {
  const G = (v = 1) => { const g = ctx.createGain(); g.gain.value = v; return g; };
  const master = G(0.9);
  const lim = ctx.createDynamicsCompressor();
  lim.threshold.value = -9; lim.knee.value = 4; lim.ratio.value = 12;
  lim.attack.value = 0.002; lim.release.value = 0.18;
  const pre = G(0.5), clip = ctx.createWaveShaper();
  clip.curve = softClipCurve();
  master.connect(lim); lim.connect(pre); pre.connect(clip);
  if (dest) clip.connect(dest);

  const verbIn = G(1), conv = ctx.createConvolver(), verbOut = G(0.8);
  conv.buffer = impulseBuffer(ctx);
  verbIn.connect(conv); conv.connect(verbOut); verbOut.connect(master);

  const sfx = { dry: G(1), wet: G(1) }, music = { dry: G(0.6), wet: G(0.6) };
  sfx.dry.connect(master); sfx.wet.connect(verbIn);
  music.dry.connect(master); music.wet.connect(verbIn);

  return { ctx, master, limiter: lim, out: clip, sfx, music, verbIn, state: {} };
}

// Smoothly set a pair of bus gains (dry + wet) to the same value.
export function setPair(pair, value, tau = 0.05) {
  const t = pair.dry.context.currentTime;
  for (const g of [pair.dry, pair.wet]) {
    holdParam(g.gain, t);
    g.gain.setTargetAtTime(value, t, tau);
  }
}
