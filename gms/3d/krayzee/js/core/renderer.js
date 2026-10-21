import * as THREE from 'three';

export const params = new URLSearchParams(location.search);

const TIERS = {
  low: { dpr: 1.25, shadows: true, shadowSize: 1024, shadowBox: 45, aa: false },
  medium: { dpr: 1.5, shadows: true, shadowSize: 2048, shadowBox: 70, aa: true },
  high: { dpr: 2, shadows: true, shadowSize: 2048, shadowBox: 90, aa: true },
};

export const isMobile = () => matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad/i.test(navigator.userAgent);

// Returns { tier, auto }. D6: auto boots LOW and steps up once the device proves it holds frame rate.
export function pickQuality(setting) {
  if (params.get('lite') === '1') return { tier: 'low', auto: false };
  const q = params.get('quality');
  if (q && TIERS[q]) return { tier: q, auto: false };
  if (setting === 'low' || setting === 'medium' || setting === 'high') return { tier: setting, auto: false };
  return { tier: 'low', auto: true };
}

export function createRenderer(canvas, quality, { antialias = true } = {}) {
  const tier = TIERS[quality] || TIERS.medium;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias, powerPreference: 'high-performance', stencil: false });
  renderer.debug.checkShaderErrors = params.get('debug') === '1'; // PERF #5: getProgramInfoLog stalls every compile
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = tier.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const R = { renderer, quality, tier, onResize: [] };

  R.setQuality = (q) => {
    R.quality = q; R.tier = TIERS[q] || TIERS.medium;
    renderer.shadowMap.enabled = R.tier.shadows;
    R.resize();
  };
  R.resize = () => {
    const vv = window.visualViewport;
    const w = Math.round(window.innerWidth), h = Math.round(window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, R.tier.dpr));
    renderer.setSize(w, h, false);
    canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    for (const f of R.onResize) f(w, h);
    void vv;
  };
  addEventListener('resize', R.resize);
  addEventListener('orientationchange', () => setTimeout(R.resize, 250));
  window.visualViewport?.addEventListener('resize', R.resize);

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    showFatal('The graphics chip took a nap', 'Your device dropped the 3D context (low memory or the tab was in the background too long).');
  });
  return R;
}

export function showFatal(title, text) {
  let el = document.getElementById('krz-fatal');
  if (!el) {
    el = document.createElement('div');
    el.id = 'krz-fatal';
    el.innerHTML = '<div class="krz-fatal-card"><h2></h2><p></p><button type="button">Reload</button></div>';
    el.querySelector('button').addEventListener('click', () => {
      const p = new URLSearchParams(location.search); p.set('v', Date.now());
      location.replace(location.pathname + '?' + p);
    });
    document.body.append(el);
  }
  el.querySelector('h2').textContent = title;
  el.querySelector('p').textContent = text;
  el.hidden = false;
}

// Adaptive tiers (D6): after warm-up, measure frame times in 2.5 s windows; step up while the device holds ~60 fps,
// step down on sustained trouble. A tier we had to leave is never retried (no thrash); 4 s minimum between changes.
const ORDER = ['low', 'medium', 'high'];
export function createFpsGovernor(R, { enabled }) {
  let acc = 0, frames = 0, worst = 0, warm = 3, since = 0, bad = 0, ceiling = 2, slow = 0, cpu = 0, meh = 0;
  const G = { fps: 60, auto: enabled, history: [] };
  G.setAuto = (on) => { G.auto = on; warm = 2; acc = frames = 0; };
  G.tick = (dt, cpuMs = 0) => {
    if (document.hidden) return;
    if (warm > 0) { warm -= dt; return; }
    acc += dt; frames++; since += dt; cpu += cpuMs;
    if (dt > 1 / 40) slow++;
    if (acc < 2.5) return;
    G.fps = frames / acc;
    const slowFrac = slow / frames, cpuFrac = cpu / frames / (1000 / G.fps);
    G.cpuFrac = cpuFrac;
    acc = 0; frames = 0; slow = 0; cpu = 0;
    if (!G.auto || since < 4) return;
    const i = ORDER.indexOf(R.quality);
    // PERF: a phone held near 50 fps by the main thread never reaches 56; if our frame CPU leaves room, the GPU has headroom.
    const cpuRoom = G.fps >= 50 && cpuMs >= 0 && cpuFrac > 0 && cpuFrac < 0.6 && slowFrac < 0.1;
    meh = G.fps < 52 ? meh + 1 : 0;
    if ((G.fps >= 56 && slowFrac < 0.03 || cpuRoom) && i < ceiling) {
      bad = 0; meh = 0;
      R.setQuality(ORDER[i + 1]); since = 0; G.history.push(`up:${R.quality}@${G.fps.toFixed(0)}`);
    } else if (G.fps < 47 || slowFrac > 0.15 || meh >= 4) {
      if ((++bad >= 2 || meh >= 4) && i > 0) {
        meh = 0;
        ceiling = i - 1; R.setQuality(ORDER[i - 1]); since = 0; bad = 0; G.history.push(`down:${R.quality}@${G.fps.toFixed(0)}`);
      }
    } else bad = 0;
  };
  return G;
}

// Shadow camera follows whatever the camera is looking at, keeping the sun's direction.
export function followSun(sun, R) {
  if (!sun) return () => {};
  const off = sun.position.clone().sub(sun.target?.position || new THREE.Vector3()).normalize().multiplyScalar(400);
  sun.castShadow = R.tier.shadows;
  if (sun.target && !sun.target.parent) sun.parent?.add(sun.target);
  let applied = -1;
  return (focus) => {
    if (applied !== R.tier.shadowSize) {
      applied = R.tier.shadowSize;
      sun.castShadow = R.tier.shadows;
      sun.shadow.mapSize.set(applied, applied);
      sun.shadow.map?.dispose(); sun.shadow.map = null;
      const c = sun.shadow.camera, b = R.tier.shadowBox;
      c.left = -b; c.right = b; c.top = b; c.bottom = -b; c.near = 10; c.far = 900;
      c.updateProjectionMatrix();
      sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
    }
    const s = (R.tier.shadowBox * 2) / R.tier.shadowSize;
    const fx = Math.round(focus.x / s) * s, fz = Math.round(focus.z / s) * s;
    sun.target.position.set(fx, focus.y, fz);
    sun.position.set(fx + off.x, focus.y + off.y, fz + off.z);
    sun.target.updateMatrixWorld();
  };
}
