// Quality tiers (D17). `?q=low|med|high` overrides; otherwise guessed from the GPU string and device class.
// Adapted from HEIRFRAME's engine/quality.js.
export const TIERS = {
  high: { name: 'high', dprMax: 1.5, dprDesktop: 1.75, shadowMap: 1024, shadowSoft: true, msaa: 4, bloom: true, bloomDiv: 4,
          reflect: 0.5, envSize: 256, crowd: 1, particles: 1400, skyline: 1, craft: 12, holoDetail: 1 },
  med:  { name: 'med', dprMax: 1.25, dprDesktop: 1.25, shadowMap: 1024, shadowSoft: false, msaa: 0, bloom: true, bloomDiv: 4,
          reflect: 0.33, envSize: 128, crowd: 0.6, particles: 900, skyline: 0.7, craft: 7, holoDetail: 0.6 },
  low:  { name: 'low', dprMax: 1.0, dprDesktop: 1.0, shadowMap: 0, shadowSoft: false, msaa: 0, bloom: false, bloomDiv: 2,
          reflect: 0, envSize: 64, crowd: 0.35, particles: 500, skyline: 0.45, craft: 2, holoDetail: 0.3 },
};

let gpuCache = null;
export function gpuString() {
  if (gpuCache !== null) return gpuCache;
  let gpu = '';
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2');
    if (gl) {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      gpu = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    } else gpu = 'no-webgl2';
  } catch (e) { gpu = '?'; }
  return (gpuCache = gpu);
}

export function isMobileDevice() {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
    || (navigator.maxTouchPoints > 1 && !/Mac/.test(navigator.platform) && Math.min(screen.width, screen.height) < 900);
}

// flag: 'low'|'med'|'high'|'auto'|undefined. Reads ?q= when flag is absent.
export function detectQuality(flag) {
  const qs = new URLSearchParams(location.search);
  if (!flag || flag === 'auto') flag = qs.get('q') || undefined;
  const isMobile = isMobileDevice();
  const gpu = gpuString();
  let name = 'high';
  if (flag && TIERS[flag]) name = flag;
  else if (gpu === 'no-webgl2') name = 'low';
  else if (isMobile) {
    const m = /Adreno\D*(\d{3})/i.exec(gpu);
    const mali = /Mali-G(\d+)/i.exec(gpu);
    const xc = /Xclipse\D*(\d{3})?/i.exec(gpu);
    if (m) name = +m[1] >= 730 ? 'high' : +m[1] >= 618 ? 'med' : 'low';
    else if (mali) name = +mali[1] >= 710 ? 'high' : +mali[1] >= 57 ? 'med' : 'low';
    else if (xc) name = 'high'; // Xclipse 920+ (S22 Exynos) is S22-class
    else if (/Apple|Immortalis/i.test(gpu)) name = 'high';
    else if ((navigator.deviceMemory || 4) <= 3 || (navigator.hardwareConcurrency || 4) <= 4) name = 'low';
    else name = 'med';
  } else if (/SwiftShader|llvmpipe|Software/i.test(gpu)) name = 'low';
  const tier = { ...TIERS[name], isMobile, gpu };
  // on-device A/B overrides: ?msaa=2 &bloomdiv=2 &shadow=0 &dpr=1.25 &reflect=0.33
  const num = (k) => (qs.has(k) && isFinite(+qs.get(k)) ? +qs.get(k) : null);
  if (num('msaa') !== null) tier.msaa = num('msaa');
  if (num('bloomdiv') !== null) tier.bloomDiv = Math.max(2, num('bloomdiv'));
  if (num('shadow') !== null) tier.shadowMap = num('shadow');
  if (num('reflect') !== null) tier.reflect = num('reflect');
  const dpr = window.devicePixelRatio || 1;
  tier.dpr = Math.min(dpr, isMobile ? tier.dprMax : tier.dprDesktop);
  if (num('dpr') !== null) tier.dpr = Math.min(dpr, num('dpr'));
  return tier;
}

// Steps drawing-buffer resolution down when frames stay slow, and back up (sparingly) when there is headroom.
// Judged on a trimmed mean frame time (slowest 10% dropped) so one-off hitches never cost resolution.
export function createGovernor(tier, apply) {
  const g = { dpr: tier.dpr, floor: Math.max(0.6, tier.dpr * 0.6), ceil: tier.dpr, acc: 0, slow: 0, fast: 0, ups: 0,
    fps: 60, enabled: true, history: [] };
  const dts = [];
  g.tick = (dt) => {
    g.acc += dt; dts.push(dt);
    if (g.acc < 1.5) return;
    dts.sort((a, b) => a - b);
    const keep = Math.max(1, Math.floor(dts.length * 0.9));
    let sum = 0; for (let i = 0; i < keep; i++) sum += dts[i];
    g.fps = keep / sum; g.acc = 0; dts.length = 0;
    if (!g.enabled || document.hidden) return;
    if (g.fps < 45) { g.slow++; g.fast = 0; } else if (g.fps > 57) { g.fast++; g.slow = 0; } else { g.slow = 0; g.fast = 0; }
    if (g.slow >= 2 && g.dpr > g.floor + 0.01) {
      g.dpr = Math.max(g.floor, g.dpr - (g.fps < 30 ? 0.25 : 0.12)); g.slow = 0; apply(g.dpr);
      g.history.push(['down', +g.dpr.toFixed(2), +g.fps.toFixed(1)]);
    } else if (g.fast >= 6 && g.dpr < g.ceil - 0.01 && g.ups < 3) {
      g.dpr = Math.min(g.ceil, g.dpr + 0.1); g.fast = 0; g.ups++; apply(g.dpr);
      g.history.push(['up', +g.dpr.toFixed(2), +g.fps.toFixed(1)]);
    }
  };
  return g;
}
