import * as THREE from '../../vendor/three/three.module.js';
import { QUALITY } from './quality.js';

export function createRenderer(canvas, quality) {
  const q = QUALITY[quality];
  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: quality !== 'low' && !q.bloom, powerPreference: 'high-performance', stencil: false,
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = q.shadows;
  renderer.shadowMap.type = quality === 'high' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
  renderer.info.autoReset = false;

  const listeners = new Set();
  const api = {
    renderer, quality,
    width: 1, height: 1, scale: 1,
    // Adaptive resolution: drop the pixel ratio when fps sags, recover slowly when there is headroom.
    adapt(fps, dt) {
      api._low = fps < 42 ? (api._low || 0) + dt : 0;
      api._high = fps > 57 ? (api._high || 0) + dt : 0;
      const cap = Math.min(window.devicePixelRatio || 1, QUALITY[api.quality].dprCap);
      if (api._low > 2.5 && cap * api.scale > 1.0) { api.scale = Math.max(1 / cap, api.scale - 0.15); api._low = 0; resize(true); }
      else if (api._high > 8 && api.scale < 1) { api.scale = Math.min(1, api.scale + 0.1); api._high = 0; resize(true); }
    },
    onResize(fn) { listeners.add(fn); fn(api.width, api.height); return () => listeners.delete(fn); },
    setQuality(qn) {
      api.quality = qn;
      const qq = QUALITY[qn];
      renderer.shadowMap.enabled = qq.shadows;
      renderer.shadowMap.type = qn === 'high' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
      resize(true);
    },
  };

  function resize(force) {
    const w = Math.max(1, window.innerWidth), h = Math.max(1, window.innerHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, QUALITY[api.quality].dprCap) * api.scale;
    if (!force && w === api.width && h === api.height && renderer.getPixelRatio() === dpr) return;
    api.width = w; api.height = h;
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    for (const fn of listeners) fn(w, h);
  }
  window.addEventListener('resize', () => resize());
  window.visualViewport?.addEventListener('resize', () => resize());
  resize(true);

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    showLostCard();
  });
  return api;
}

function showLostCard() {
  if (document.getElementById('ctx-lost')) return;
  const d = document.createElement('div');
  d.id = 'ctx-lost';
  d.style.cssText = 'position:fixed;inset:0;z-index:300;display:flex;align-items:center;justify-content:center;background:rgba(43,22,8,.75);font-family:Fredoka,system-ui,sans-serif';
  d.innerHTML = `<div style="background:#fff4dc;color:#4a2a12;border-radius:22px;padding:22px 28px;text-align:center;box-shadow:0 10px 0 #b5641c;max-width:420px">
    <h2 style="margin:0 0 8px">The picture fell asleep</h2>
    <p style="margin:0 0 16px">Your device needed a break from the graphics. Tap Reload to carry on — your progress is saved.</p>
    <button style="font:inherit;font-size:20px;font-weight:600;color:#fff4dc;background:#e8891c;border:0;border-radius:16px;padding:10px 28px;box-shadow:0 5px 0 #9a4f0f;cursor:pointer">Reload</button></div>`;
  d.querySelector('button').onclick = () => location.reload();
  document.body.appendChild(d);
}
