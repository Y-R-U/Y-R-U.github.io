import * as THREE from 'three';
import { detectQuality, createGovernor } from './quality.js';
import { createPost } from './post.js';
import { buildNeonEnv } from './env.js';

export { detectQuality } from './quality.js';

// One renderer / canvas for the whole game (D16). A scene object is
// { scene, camera, update(dt, t), resize(w, h), dispose(), pick?(x, y), preRender?(renderer), look? }
// `backdropCamera` (optional) draws first, then depth is cleared and `camera` draws on top.
// `preRender` runs right before the main render (planar mirrors etc.); `look` = post.set() overrides for that scene.
export function createEngine(canvas, { quality, toneMapping = 'aces', autoStart = true, governor = true } = {}) {
  const tier = quality && typeof quality === 'object' ? quality : detectQuality(quality);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
  renderer.setPixelRatio(tier.dpr);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = toneMapping === 'agx' ? THREE.AgXToneMapping : THREE.ACESFilmicToneMapping;
  const expQ = new URLSearchParams(location.search).get('exp');
  renderer.toneMappingExposure = expQ ? +expQ : 1.0;
  renderer.shadowMap.enabled = tier.shadowMap > 0;
  renderer.shadowMap.type = tier.shadowSoft ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
  renderer.info.autoReset = false;
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); console.warn('[engine] WebGL context lost'); });

  const size = { w: 1, h: 1 };
  const post = createPost(renderer, tier);
  const env = buildNeonEnv(renderer, tier.envSize);
  let active = null, raf = 0, running = false, last = 0, time = 0;
  const frameFns = new Set();
  const st = { fps: 0, ms: 0, cpu: 0, calls: 0, tris: 0, frames: 0, acc: 0, accN: 0, cpuAcc: 0 };

  const engine = {
    THREE, renderer, quality: tier, tier, env, post, canvas, size,
    get scene() { return active; },
    setScene(obj) {
      active = obj || null;
      post.set(obj?.look || {});
      if (active) active.resize?.(size.w, size.h);
      return active;
    },
    resize() {
      const w = Math.max(1, canvas.clientWidth || canvas.parentElement?.clientWidth || innerWidth);
      const h = Math.max(1, canvas.clientHeight || canvas.parentElement?.clientHeight || innerHeight);
      size.w = w; size.h = h;
      renderer.setPixelRatio(gov ? gov.dpr : tier.dpr);
      renderer.setSize(w, h, false);
      post.setSize(w, h, renderer.getPixelRatio());
      active?.resize?.(w, h);
    },
    onFrame(fn) { frameFns.add(fn); return () => frameFns.delete(fn); },
    // render one frame now (tests, screenshots, paused screens)
    renderOnce(dt = 1 / 60) { frame(dt); },
    start() { if (running) return; running = true; last = performance.now(); raf = requestAnimationFrame(loop); },
    stop() { running = false; cancelAnimationFrame(raf); },
    get running() { return running; },
    stats() {
      return { fps: +st.fps.toFixed(1), ms: +st.ms.toFixed(2), cpu: +st.cpu.toFixed(2), calls: st.calls, tris: st.tris,
        dpr: renderer.getPixelRatio(), tier: tier.name, w: size.w, h: size.h, gpu: tier.gpu, gov: gov?.history };
    },
    dispose() { engine.stop(); ro?.disconnect(); renderer.dispose(); },
  };

  const gov = governor ? createGovernor(tier, () => engine.resize()) : null;

  function frame(dt) {
    const c0 = performance.now();
    time += dt;
    renderer.info.reset();
    for (const f of frameFns) f(dt, time);
    if (active) {
      active.update?.(dt, time);
      active.preRender?.(renderer);
      post.render(active.scene, active.camera, dt, active.backdropCamera || null);
    }
    st.calls = renderer.info.render.calls; st.tris = renderer.info.render.triangles;
    st.cpuAcc += performance.now() - c0;
  }
  function loop(now) {
    if (!running) return;
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000)); last = now;
    if (document.hidden) return;
    frame(dt);
    gov?.tick(dt);
    st.acc += dt; st.accN++;
    if (st.acc >= 0.5) { st.fps = st.accN / st.acc; st.ms = (st.acc / st.accN) * 1000; st.cpu = st.cpuAcc / st.accN; st.acc = 0; st.accN = 0; st.cpuAcc = 0; }
  }

  let ro = null;
  if (typeof ResizeObserver !== 'undefined') { ro = new ResizeObserver(() => engine.resize()); ro.observe(canvas); }
  addEventListener('resize', () => engine.resize());
  engine.resize();
  if (autoStart) engine.start();
  return engine;
}
