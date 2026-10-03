export const TIERS = {
  low: { dprCap: 1, heroFps: 30, cardFps: 15, cardFpsOther: 8, K: 1, fx: 0.5, shadows: false, shadowHz: 0, cardShadowHz: 0, shadowCache: 0, post: 0 },
  mid: { dprCap: 1.5, heroFps: 30, cardFps: 20, cardFpsOther: 10, K: 2, fx: 0.75, shadows: true, shadowHz: 5, cardShadowHz: 0, cardShadowSize: 512, shadowCache: 12, post: 4 },
  high: { dprCap: 2, heroFps: 60, cardFps: 30, cardFpsOther: 15, K: 3, fx: 1, shadows: true, shadowHz: 12, cardShadowHz: 0, cardShadowSize: 1024, shadowCache: 12, post: 2 },
};
// Phones render at a lower DPR than desktops at the same tier (S22 Ultra class: high @ 1.5).
export const MOBILE_DPR = { low: 1, mid: 1.25, high: 1.5 };
// Cards are small and run at ≤ 30 fps, so on phones they get more pixels than the hero, plus 4× MSAA and a sharpen
// on high (through post.js's resolve pass): a 1.5 card on a DPR 2.6–3 screen was upscaled ~2× with no AA.
export const MOBILE_CARD_DPR = { low: 1, mid: 1.5, high: 2 };
// …but a card never gets more than this many device pixels: the tall portrait cards (~388×521 CSS) land at ≈1.57 on
// high instead of 2 (0.5 Mpx ×4 MSAA instead of 0.8), while small cards still reach the full cap.
export const MOBILE_CARD_PX = { low: 0, mid: 0.35e6, high: 0.5e6 };
// Phones (PERF P#3/P#5): the hero idles at 30 fps and only runs at heroFps while "hot" (look, spectacle, camera moving,
// scroll-in); the hero and a card never share a frame (solo); the hero shadow map refreshes at 4 Hz (shadowHzHot while
// the camera is moving, so the map's coverage keeps up). Movers never cast (host), blob shadows stand in for them.
export const MOBILE_HERO_IDLE_FPS = 30;
export const MOBILE_SHADOW_HZ = { low: 0, mid: 4, high: 4 };
export const MOBILE_SHADOW_HZ_HOT = { low: 0, mid: 8, high: 12 };

// Governor ladder: DPR first, then fps, then tier. Context MSAA is fixed per device (desktop on, phone off; the phone
// hero still gets 4× MSAA through the bloom target on high), so only shadows on/off (mid↔low) needs a renderer recreate.
export const LADDER = [
  { tier: 'high' },
  { tier: 'high', dprMul: 0.8 },
  { tier: 'high', dprMul: 0.8, heroFps: 30, cardFps: 20, cardFpsOther: 10 },
  { tier: 'mid' },
  { tier: 'mid', dprMul: 0.8 },
  { tier: 'low' },
];
export const LADDER_START = { high: 0, mid: 3, low: 5 };

export const device = { mobile: false, gpu: '', guess: 'high', msaa: true };

export function probeDevice() {
  const ua = navigator.userAgent || '';
  device.mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || matchMedia('(pointer:coarse)').matches;
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (gl) {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      device.gpu = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    } else device.gpu = 'no-webgl';
  } catch { device.gpu = '?'; }
  const g = device.gpu;
  let t = 'high';
  if (/no-webgl|SwiftShader|llvmpipe|Software/i.test(g)) t = 'low';
  else if (device.mobile) {
    const adreno = /Adreno\D*(\d{3})/i.exec(g), mali = /Mali-G(\d+)/i.exec(g);
    if (adreno) t = +adreno[1] >= 700 ? 'high' : +adreno[1] >= 618 ? 'mid' : 'low';
    else if (mali) t = +mali[1] >= 710 ? 'high' : +mali[1] >= 57 ? 'mid' : 'low';
    else if (/Apple|Xclipse|Immortalis/i.test(g)) t = 'high';
    else t = (navigator.hardwareConcurrency || 4) <= 4 ? 'low' : 'mid';
  }
  device.guess = t;
  device.msaa = !device.mobile && t !== 'low';
  return device;
}

export function startTier(flags = {}) {
  if (!device.gpu) probeDevice();
  return flags.tier && TIERS[flags.tier] ? flags.tier : device.guess;
}

export function qualityAt(level) {
  const step = LADDER[Math.max(0, Math.min(LADDER.length - 1, level))];
  const base = TIERS[step.tier];
  const cap = device.mobile ? MOBILE_DPR[step.tier] : base.dprCap;
  const ccap = device.mobile ? MOBILE_CARD_DPR[step.tier] : base.dprCap;
  const cardSamples = device.mobile && step.tier === 'high' ? 4 : 0;
  const heroFps = step.heroFps || base.heroFps, m = device.mobile;
  return { ...base, ...step, heroFpsIdle: m ? Math.min(heroFps, MOBILE_HERO_IDLE_FPS) : heroFps, solo: m,
    shadowHz: m ? Math.min(base.shadowHz, MOBILE_SHADOW_HZ[step.tier]) : base.shadowHz, shadowHzHot: m ? Math.min(base.shadowHz, MOBILE_SHADOW_HZ_HOT[step.tier]) : base.shadowHz, name: step.tier, msaa: device.msaa, cardDprCap: Math.max(1, ccap * (step.dprMul || 1)), cardSamples, cardSharpen: device.mobile ? (step.tier === 'low' ? 0 : 0.45) : 0, heroSharpen: step.tier === 'low' ? 0 : 0.3, cardShadowSize: Math.min(base.cardShadowSize || 512, device.mobile ? 512 : 1024), cardPx: device.mobile ? MOBILE_CARD_PX[step.tier] * (step.dprMul || 1) ** 2 : 0, postCards: step.tier === 'high' && !device.mobile, rtSamples: step.tier === 'high' ? 4 : 0, dprCap: Math.max(1, cap * (step.dprMul || 1)) };
}

// Rolling 2 s window of rAF interval and our own frame work. A steady ~33 ms interval with light work is a
// refresh-rate cap (iOS Low Power Mode, throttled displays), not overload, so it never steps down.
export function createGovernor({ windowMs = 2000, downMs = 20, upMs = 14, upHoldMs = 10000, upGapMs = 30000 } = {}) {
  const dts = new Float32Array(256), works = new Float32Array(256);
  let n = 0, head = 0, sum = 0, sumW = 0, lastChange = -Infinity, goodSince = null;
  const out = { meanDt: 0, meanWork: 0, jitter: 0, downs: 0, ups: 0 };
  const drop = () => { sum -= dts[head]; sumW -= works[head]; head = (head + 1) % 256; n--; };
  return {
    stats: out,
    reset(now) { n = head = 0; sum = sumW = 0; goodSince = null; lastChange = now; },
    sample(dt, work, now) {
      if (dt <= 0 || dt > 250) return 0;
      if (n === 256) drop();
      const i = (head + n) % 256;
      dts[i] = dt; works[i] = work; sum += dt; sumW += work; n++;
      while (sum > windowMs && n > 8) drop();
      if (sum < windowMs * 0.9) return 0;
      const mean = sum / n, meanW = sumW / n;
      let v = 0;
      for (let k = 0; k < n; k++) { const d = dts[(head + k) % 256] - mean; v += d * d; }
      out.meanDt = mean; out.meanWork = meanW; out.jitter = Math.sqrt(v / n);
      const refreshCapped = out.jitter < 2.5 && meanW < 6;
      if (mean > downMs && !refreshCapped && now - lastChange > 4000) { out.downs++; this.reset(now); return -1; }
      if (mean < upMs) {
        if (goodSince === null) goodSince = now;
        if (now - goodSince > upHoldMs && now - lastChange > upGapMs) { out.ups++; this.reset(now); return 1; }
      } else goodSince = null;
      return 0;
    },
  };
}
