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
// Desktop hero pixel budget at level 0 (scaled by dprMul²): a 4K monitor or a huge window can't push a slow GPU into fill.
export const DESKTOP_HERO_PX = 3.2e6;

// One ladder for every device, cumulative, ordered by cost saved per visual loss (ENGINE.md "Adaptive quality").
// `shadow` is the world's tier name: high = 2048 map, mid = 1024, low = no shadow maps (the only renderer recreate).
// cost = rough relative GPU load per second, used to size multi-rung jumps (bench + governor), not for anything visual.
export const LADDER = [
  { label: 'high', cost: 1 },
  { label: 'high', cost: 0.78, dprMul: 0.85 },
  { label: 'high', cost: 0.6, dprMul: 0.7 },
  { label: 'medium', cost: 0.52, post: 4, rtSamples: 0, postCards: false, cardSamples: 0, heroSharpen: 0 },
  { label: 'medium', cost: 0.47, shadow: 'mid', shadowHzMul: 0.5, cardShadowSize: 512 },
  { label: 'medium', cost: 0.43, cardFps: 20, cardFpsOther: 10, K: 2, fx: 0.75 },
  { label: 'medium', cost: 0.27, heroFps: 30 },
  { label: 'low', cost: 0.23, post: 0 },
  { label: 'low', cost: 0.19, shadow: 'low', cardFps: 15, cardFpsOther: 8, K: 1, fx: 0.5, cardSharpen: 0 },
  { label: 'low', cost: 0.12, dprMul: 0.6, dprFloor: 0.75, crowd: 0.6 },
  { label: 'low', cost: 0.08, dprMul: 0.5, dprFloor: 0.6, crowd: 0.35 },
];
// Fixed presets (Settings "Graphics") and the auto ceilings for each detected class.
export const PRESET_LEVEL = { high: 0, medium: 4, mid: 4, low: 8, battery: 8 };
export const LADDER_START = { high: 0, mid: 4, low: 8 };

export const device = { mobile: false, gpu: '', guess: 'high', msaa: true, cls: '', reasons: [], startLevel: 0, px: 0, cores: 0, mem: 0 };

const QS = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
const RANK = { low: 0, mid: 1, high: 2 }, NAMES = ['low', 'mid', 'high'];

// GPU string → class. Desktop strings come through ANGLE ("ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 …)").
export function classifyGpu(g, mobile) {
  if (/no-webgl|SwiftShader|llvmpipe|softpipe|Software|Basic Render|Mesa OffScreen|GDI Generic/i.test(g)) return ['low', 'software'];
  const adreno = /Adreno\D*(\d{3})/i.exec(g), mali = /Mali-G(\d+)/i.exec(g);
  if (adreno) return [+adreno[1] >= 700 ? 'high' : +adreno[1] >= 618 ? 'mid' : 'low', 'adreno'];
  if (mali) return [+mali[1] >= 710 ? 'high' : +mali[1] >= 57 ? 'mid' : 'low', 'mali'];
  if (/Mali-T|Mali-[34]\d\d|PowerVR|VideoCore|Vivante|Tegra (3|4|K1)/i.test(g)) return ['low', 'old mobile'];
  if (/Apple M\d|Apple GPU|Xclipse|Immortalis/i.test(g)) return ['high', 'apple/xclipse'];
  if (/Apple A(\d+)/i.test(g)) return [+/Apple A(\d+)/i.exec(g)[1] >= 13 ? 'high' : 'mid', 'apple A'];
  if (/Intel/i.test(g)) {
    if (/Arc|Iris\(R\) Xe|Iris Xe/i.test(g)) return ['high', 'intel xe'];
    if (/HD Graphics( [2-5]\d{3}| 4\d\d)?(\b|$)|GMA|Bay ?Trail|Atom/i.test(g) && !/HD Graphics [56]\d\d/i.test(g)) return ['low', 'intel hd old'];
    return ['mid', 'intel integrated'];
  }
  if (/Radeon(\(TM\))? (Graphics|Vega|R[2-7] )|Vega \d|Radeon \d{3}M\b/i.test(g)) return ['mid', 'amd integrated'];
  if (/GeForce (GT|MX) ?\d|GeForce 9\d\d|GeForce [1-7]\d\dM?\b|Quadro (NVS|K\d)/i.test(g)) return ['mid', 'nvidia low-end'];
  if (/NVIDIA|GeForce|RTX|Radeon|AMD|Snapdragon|Qualcomm/i.test(g)) return ['high', 'discrete'];
  if (mobile) return [(navigator.hardwareConcurrency || 4) <= 4 ? 'low' : 'mid', 'unknown mobile'];
  return ['high', 'unknown'];
}

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
  if (QS.get('gpu')) device.gpu = QS.get('gpu');
  const reasons = device.reasons = [];
  let [t, cls] = classifyGpu(device.gpu, device.mobile);
  device.cls = cls;
  reasons.push(`gpu ${cls} → ${t}`);
  const cores = device.cores = navigator.hardwareConcurrency || 0, mem = device.mem = navigator.deviceMemory || 0;
  const cap = (to, why) => { if (RANK[t] > RANK[to]) { t = to; reasons.push(why + ' → ' + to); } };
  if (cores && cores <= 2) cap('low', `${cores} cores`);
  else if (cores && cores <= 4 && !device.mobile) cap('mid', `${cores} cores`);
  if (mem && mem <= 2) cap('low', `${mem} GB`);
  else if (mem && mem <= 4 && !device.mobile) cap('mid', `${mem} GB`);
  device.guess = t;
  device.msaa = !device.mobile && t !== 'low';
  // A big screen on a mid GPU starts one pixel rung down (the pixel budget covers high GPUs).
  device.px = Math.round((screen?.width || 0) * (screen?.height || 0) * (devicePixelRatio || 1) ** 2);
  device.startLevel = LADDER_START[t] + (t === 'mid' && device.px > 6e6 ? 1 : 0);
  if (device.startLevel !== LADDER_START[t]) reasons.push(`${(device.px / 1e6).toFixed(1)} Mpx screen → +1`);
  return device;
}

export function startTier(flags = {}) {
  if (!device.gpu) probeDevice();
  return flags.tier && TIERS[flags.tier] ? flags.tier : device.guess;
}
export function startLevel() {
  if (!device.gpu) probeDevice();
  return device.startLevel;
}

export function qualityAt(level) {
  level = Math.max(0, Math.min(LADDER.length - 1, level | 0));
  const s = {};
  for (let i = 0; i <= level; i++) Object.assign(s, LADDER[i]);
  const shadow = s.shadow || 'high', base = TIERS.high, m = device.mobile, dprMul = s.dprMul || 1;
  const heroFps = s.heroFps || base.heroFps, hz = s.shadowHzMul || 1;
  const shadowHz = shadow === 'low' ? 0 : Math.round((m ? MOBILE_SHADOW_HZ.high : base.shadowHz) * hz);
  const shadowHzHot = shadow === 'low' ? 0 : Math.round((m ? MOBILE_SHADOW_HZ_HOT.high : base.shadowHz) * hz);
  const floor = s.dprFloor || 1;
  return {
    ...base, level, label: s.label, cost: s.cost, name: shadow, shadows: shadow !== 'low',
    heroFps, heroFpsIdle: m ? Math.min(heroFps, MOBILE_HERO_IDLE_FPS) : heroFps, solo: m,
    cardFps: s.cardFps || base.cardFps, cardFpsOther: s.cardFpsOther || base.cardFpsOther, K: s.K || base.K, fx: s.fx || base.fx,
    shadowHz, shadowHzHot, shadowCache: shadow === 'low' ? 0 : base.shadowCache,
    cardShadowSize: Math.min(s.cardShadowSize || base.cardShadowSize, m ? 512 : 1024),
    post: s.post ?? base.post, postCards: s.postCards ?? !m, rtSamples: s.rtSamples ?? 4,
    msaa: device.msaa,
    // host: hero DPR = min(device, dprBase) × dprMul, floored at dprFloor (0.8 on ≤ 1.25 DPR screens, which have no
    // retina headroom to cut); desktop cards follow the hero (cardDprCap 0), phone cards keep their own cap.
    dprBase: m ? MOBILE_DPR.high : base.dprCap, dprMul, dprFloor: floor,
    dprCap: Math.max(floor, (m ? MOBILE_DPR.high : base.dprCap) * dprMul),
    cardDprCap: m ? Math.max(floor, MOBILE_CARD_DPR.high * dprMul) : 0,
    cardSamples: s.cardSamples ?? (m ? 4 : 0), cardSharpen: s.cardSharpen ?? (m ? 0.45 : 0), heroSharpen: s.heroSharpen ?? 0.3,
    cardPx: m ? MOBILE_CARD_PX.high * dprMul ** 2 : 0, heroPx: m ? 0 : DESKTOP_HERO_PX * dprMul ** 2,
    crowd: s.crowd || 1,
  };
}

// Governor (ENGINE.md "Adaptive quality"). Fed every rendered rAF with the interval, the host's own CPU work and, where
// EXT_disjoint_timer_query works, the GPU time of the previous frames. Decides every 250 ms over a 3 s window:
//  down  when the mean interval (each frame clipped at 3× target) is > 1.25× the target (16.7 ms, or 33.3 once a 30 Hz cap is proven) or > 5% of frames
//        are hitches (> 2.5× the target, i.e. two or more missed vsyncs; single misses only count through the mean). Severe overload jumps up to 3 rungs (4 past 2× target), sized by LADDER cost. A steady 2× interval with light
//        CPU work and no GPU timer could be a refresh cap (iOS Low Power Mode): that step is a trial, reverted (and the
//        cap adopted) if the next window isn't ≥ 12% faster. With a GPU timer, light GPU + light CPU = not ours, no step.
//  up    after sustained headroom: interval at target, < 1% hitches, CPU under half the target and, if the GPU time is
//        known, the GPU time scaled by the next rung's cost still under 80% of the target.
//        The hold is 12 s, doubled for every time that rung already failed (max 16×), so a rung that can't hold is
//        retried at 24 s, 48 s, … and the ladder never oscillates.
// Down needs a full window that stays over for 1.5 s (severe: 1.5 s of samples), up a full window. Nothing is sampled for 3.5 s after boot, 2.5 s after
// the boot bench, 2.5 s after a visibility return (host resets), 1 s after a step down.
export function createGovernor({ windowMs = 3000, graceMs = 2500, bootGraceMs = 3500, upHoldMs = 12000, evalMs = 250 } = {}) {
  const N = 512, dts = new Float32Array(N), works = new Float32Array(N), gpus = new Float32Array(N), ts = new Float64Array(N);
  let n = 0, head = 0, overSince = null, graceUntil = -1, evalAt = 0, goodSince = null, lastDown = -Infinity, trial = null, target = 1000 / 60;
  const fails = new Map(), tmp = new Float32Array(N);
  const out = { meanDt: 0, p95: 0, slow: 0, meanWork: 0, gpu: -1, jitter: 0, downs: 0, ups: 0, trials: 0, capped: false, target, reason: '', hold: 0 };
  const quantile = (src, k, p) => { for (let i = 0; i < k; i++) tmp[i] = src[(head + i) % N]; const a = tmp.subarray(0, k).sort(); return a[Math.min(k - 1, Math.floor(k * p))]; };
  const pickDown = (level, max, ratio) => {
    const want = LADDER[level].cost / Math.max(1.05, ratio);
    let to = level + 1;
    while (to < max && to < level + (ratio > 2 ? 4 : 3) && LADDER[to].cost > want) to++;
    return Math.min(max, to) - level;
  };
  const g = {
    stats: out,
    fails,
    reset(now, grace = graceMs) { n = head = 0; goodSince = overSince = null; graceUntil = now + grace; },
    sample(dt, work, gpu, now, level, min, max) {
      if (graceUntil < 0) graceUntil = now + bootGraceMs;
      if (now < graceUntil || dt <= 0) return 0;
      if (n === N) { head = (head + 1) % N; n--; }
      const i = (head + n) % N;
      dts[i] = Math.min(dt, 500); works[i] = work; gpus[i] = gpu; ts[i] = now; n++;
      while (n > 4 && now - ts[head] > windowMs) { head = (head + 1) % N; n--; }
      if (now - evalAt < evalMs) return 0;
      evalAt = now;
      const span = now - ts[head];
      // sumC clips each frame at 3× target: one long stall (GC, a tab switch the lifecycle missed, a devtools round trip)
      // must not read as sustained slowness; frequent ones still count as hitches.
      let sum = 0, sumC = 0, sumW = 0, sumG = 0, nG = 0, slow = 0;
      for (let k = 0; k < n; k++) {
        const j = (head + k) % N;
        sum += dts[j]; sumC += Math.min(dts[j], target * 3); sumW += works[j];
        if (gpus[j] >= 0) { sumG += gpus[j]; nG++; }
        if (dts[j] > target * 2.5) slow++;
      }
      const mean = sum / n, meanC = sumC / n, meanW = sumW / n, meanG = nG > n / 4 ? sumG / nG : -1;
      let v = 0;
      for (let k = 0; k < n; k++) { const d = dts[(head + k) % N] - mean; v += d * d; }
      Object.assign(out, { meanDt: mean, meanWork: meanW, gpu: meanG, jitter: Math.sqrt(v / n), slow: slow / n, p95: quantile(dts, n, 0.95), target });
      const severe = meanC > target * 2.5 && span > 1500 && n >= 4;
      if (span < (severe ? 1500 : windowMs * 0.9)) return 0;
      if (trial) {
        const t = trial;
        trial = null;
        if (mean > t.mean * 0.88) {
          out.capped = true; target = out.target = Math.min(1000 / 30, Math.round(t.mean / (1000 / 60)) * (1000 / 60));
          out.reason = `refresh cap ${target.toFixed(1)} ms (trial didn't help)`;
          g.reset(now);
          return -1;
        }
      }
      const over = meanC > target * 1.25 || slow / n > 0.05;
      // A non-severe overload must persist for 1.5 s of evaluations (a full window after one bad burst), so one burst
      // of hitches (boot work, a card first shown, a big spectacle cut) never costs a rung on a capable device.
      if (over) overSince ??= now; else overSince = null;
      if (over && level < max && (severe || now - overSince >= 1500)) {
        const light = meanW < target * 0.4;
        if (meanG >= 0 && light && meanG < target * 0.45) { out.reason = 'slow but not GPU/CPU-bound: hold'; goodSince = null; return 0; }
        let step;
        if (meanG < 0 && light && out.jitter < 3 && Math.abs(mean / target - 2) < 0.15) {
          trial = { mean, level }; out.trials++; step = 1; out.reason = 'steady 2× interval: trial step';
        } else {
          step = pickDown(level, max, mean / target);
          out.reason = `mean ${meanC.toFixed(1)} ms, ${Math.round(100 * slow / n)}% hitches → +${step}`;
        }
        fails.set(level, (fails.get(level) || 0) + 1);
        out.downs++; lastDown = now;
        g.reset(now, 1000);
        return step;
      }
      if (!over) trial = null;
      const grow = level > 0 ? LADDER[level - 1].cost / LADDER[level].cost : 1;
      const room = span >= windowMs * 0.9 && mean < target * 1.08 && slow / n < 0.01 && meanW < target * 0.5 && (meanG < 0 || meanG * grow < target * 0.8);
      if (room && level > min) {
        if (goodSince === null) goodSince = now;
        const f = fails.get(level - 1) || 0, hold = out.hold = upHoldMs * 2 ** Math.min(4, f);
        if (now - goodSince > hold && now - lastDown > hold) { out.ups++; out.reason = `headroom ${hold / 1000}s → up`; g.reset(now); return -1; }
      } else goodSince = null;
      return 0;
    },
    // Card-budget pressure (host): counts as a down without a window.
    pressure(now, level) { fails.set(level, (fails.get(level) || 0) + 1); out.downs++; lastDown = now; out.reason = 'card pressure'; g.reset(now, 1500); },
  };
  return g;
}

// Boot micro-benchmark → start level. Only a clearly slow device moves: the fastest fenced hero render (CPU submit + GPU,
// warm-up discarded) must exceed 28 ms (desktop; phone 30), i.e. the hero alone can't hold ~30 fps. Then it is projected
// down the ladder by cost until it fits 16 ms; anything milder is left to the governor, which measures real frames.
// Measured (fastest render): M5 headless @1 ≈ 6–9 ms, @2 ≈ 20 ms, the slow-laptop stand-in 37–60 ms.
export function levelForBench(ms, level, max) {
  if (ms <= (device.mobile ? 30 : 28)) return level;
  const budget = 16;
  let to = level;
  while (to < max && ms * LADDER[to].cost / LADDER[level].cost > budget) to++;
  return to;
}
