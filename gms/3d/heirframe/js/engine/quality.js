// Quality tiers. `?q=` overrides; otherwise guessed from the GPU string and device class.
export const TIERS = {
  high: { name: 'high', dprMax: 1.5, dprDesktop: 1.75, shadowMap: 2048, shadowSoft: true, msaa: 4, bloom: true,
          reflect: 0.5, reflectLayers: 'full', crowd: 16, traffic: 70, trees: 1, envSize: 256, mist: true },
  med:  { name: 'med', dprMax: 1.25, dprDesktop: 1.25, shadowMap: 1024, shadowSoft: true, msaa: 0, bloom: true,
          reflect: 0.33, reflectLayers: 'full', crowd: 9, traffic: 40, trees: 0.7, envSize: 128, mist: true },
  low:  { name: 'low', dprMax: 1.0, dprDesktop: 1.0, shadowMap: 0, shadowSoft: false, msaa: 0, bloom: false,
          reflect: 0, reflectLayers: 'none', crowd: 5, traffic: 18, trees: 0.5, envSize: 64, mist: false },
};

export function detectQuality(flag) {
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && !/Mac/.test(navigator.platform) && Math.min(screen.width, screen.height) < 900);
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
  let name = 'high';
  if (flag && TIERS[flag]) name = flag;
  else if (gpu === 'no-webgl2') name = 'low';
  else if (isMobile) {
    const m = /Adreno\D*(\d{3})/i.exec(gpu);
    const mali = /Mali-G(\d+)/i.exec(gpu);
    if (m) name = +m[1] >= 700 ? 'high' : +m[1] >= 618 ? 'med' : 'low';
    else if (mali) name = +mali[1] >= 710 ? 'high' : +mali[1] >= 57 ? 'med' : 'low';
    else if (/Apple|Xclipse|Immortalis/i.test(gpu)) name = 'high';
    else if ((navigator.deviceMemory || 4) <= 3 || (navigator.hardwareConcurrency || 4) <= 4) name = 'low';
    else name = 'med';
  } else if (/SwiftShader|llvmpipe|Software/i.test(gpu)) name = 'low';
  const tier = { ...TIERS[name], isMobile, gpu };
  const dpr = window.devicePixelRatio || 1;
  tier.dpr = Math.min(dpr, isMobile ? tier.dprMax : tier.dprDesktop);
  return tier;
}

// Steps drawing-buffer resolution down when frames stay slow, and back up (sparingly) when there is headroom.
export function createGovernor(tier, apply) {
  const g = { dpr: tier.dpr, floor: Math.max(0.6, tier.dpr * 0.55), ceil: tier.dpr, acc: 0, frames: 0,
    slow: 0, fast: 0, ups: 0, fps: 60, enabled: true, history: [] };
  g.tick = (dt) => {
    g.acc += dt; g.frames++;
    if (g.acc < 1.5) return;
    g.fps = g.frames / g.acc; g.acc = 0; g.frames = 0;
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
