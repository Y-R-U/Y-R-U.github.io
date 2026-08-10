/* SUNDERFALL — the opening cinematic.
 *
 *   import { runIntro } from './js/intro/index.js';
 *   await runIntro(mountEl, { skip });
 *
 * Self-contained per ARCHITECTURE §8: own canvases, own WebGL context, own audio, no imports from
 * gfx/ or sim/. Resolves when the cinematic finishes or the player skips, having removed every
 * listener, cancelled the rAF and freed its GL resources.
 */

import { Stage } from './stage.js';
import { Bubbles } from './bubbles.js';
import { IntroAudio } from './audio.js';
import SCRIPT, { shotAt } from '../story/script.js';
import { sat, clamp, ease } from './util.js';

const DT = 1 / 60;

export async function runIntro(mountEl, opts = {}) {
  const {
    skip = false, script = SCRIPT, autoStart = true, debug = false,
    dprCap = 2, maxPixels = 2_300_000, lowSpec: forceLow = null, armed = false,
  } = opts;
  const onSkip = typeof skip === 'function' ? skip : null;
  if (skip === true) return;

  const host = document.createElement('div');
  host.className = 'sf-intro';
  host.setAttribute('role', 'presentation');
  host.style.cssText = 'position:absolute;inset:0;overflow:hidden;background:#000;' +
    'touch-action:none;user-select:none;-webkit-user-select:none;contain:strict';

  const glCanvas = document.createElement('canvas');
  glCanvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
  const ui = document.createElement('canvas');
  ui.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none';

  const skipBtn = document.createElement('button');
  skipBtn.type = 'button';
  skipBtn.textContent = 'Skip';
  skipBtn.style.cssText =
    'position:absolute;right:max(14px,env(safe-area-inset-right));bottom:max(14px,env(safe-area-inset-bottom));' +
    'z-index:3;appearance:none;background:rgba(10,10,14,.34);color:rgba(236,232,226,.62);' +
    'border:1px solid rgba(236,232,226,.20);border-radius:999px;padding:9px 17px;' +
    "font:600 11px/1 'Avenir Next',system-ui,sans-serif;letter-spacing:.20em;text-transform:uppercase;" +
    'cursor:pointer;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);transition:opacity .25s,color .2s';

  const loader = document.createElement('div');
  loader.style.cssText = 'position:absolute;inset:0;z-index:4;display:flex;align-items:center;justify-content:center;' +
    'flex-direction:column;gap:18px;background:#000;transition:opacity .5s';
  const ember = document.createElement('div');
  ember.style.cssText = 'width:9px;height:9px;border-radius:50%;background:#ffb648;' +
    'box-shadow:0 0 22px 6px rgba(255,140,40,.55);animation:sfPulse 1.5s ease-in-out infinite';
  const bar = document.createElement('div');
  bar.style.cssText = 'width:min(230px,42vw);height:1px;background:rgba(255,255,255,.10);overflow:hidden';
  const fill = document.createElement('i');
  fill.style.cssText = 'display:block;height:100%;width:0;background:linear-gradient(90deg,#ff6a2b,#ffd08a);transition:width .3s';
  bar.appendChild(fill);
  const style = document.createElement('style');
  style.textContent = '@keyframes sfPulse{0%,100%{opacity:.35;transform:scale(.85)}50%{opacity:1;transform:scale(1.15)}}';
  loader.append(ember, bar, style);

  host.append(glCanvas, ui, skipBtn, loader);
  mountEl.appendChild(host);

  const uctx = ui.getContext('2d');
  const bubbles = new Bubbles();
  const audio = new IntroAudio();
  let stage = null;

  /* ── lifecycle ────────────────────────────────────────────────────────── */

  let raf = 0, running = false, done = false, resolveFn = null;
  let storyT = 0, wallStart = 0, acc = 0, last = 0;
  let skipping = 0;
  const cued = new Set();
  const live = [];
  let W = 1, H = 1, dpr = 1;

  const finish = () => {
    if (done) return;
    done = true;
    cleanup();
    resolveFn?.();
  };

  const requestSkip = () => {
    if (skipping || done) return;
    skipping = 0.0001;
    onSkip?.();
    audio.fadeOut(0.4);
  };

  const onKey = (e) => {
    if (e.key === 'Escape' || storyT > 1.0) { armAudio(); requestSkip(); }
    else armAudio();
  };
  const onPointer = () => { armAudio(); if (storyT > 1.0) requestSkip(); };
  const armAudio = () => { try { audio.arm(); } catch {} };
  // The caller already collected a gesture, so the context is allowed to start.
  // Without this the score waits for a tap that, once the intro is running,
  // also skips it — which is why nobody has ever heard the cinematic.
  if (armed) armAudio();

  skipBtn.addEventListener('click', (e) => { e.stopPropagation(); armAudio(); requestSkip(); });
  window.addEventListener('keydown', onKey, { passive: true });
  host.addEventListener('pointerdown', onPointer, { passive: true });

  const measure = () => {
    const r = host.getBoundingClientRect();
    W = Math.max(2, Math.round(r.width)) || window.innerWidth;
    H = Math.max(2, Math.round(r.height)) || window.innerHeight;
    // budget the framebuffer, not the device: a 3x phone and a 2x laptop both land near 2.2 Mpx
    const budget = Math.sqrt(maxPixels / Math.max(1, W * H));
    dpr = Math.max(0.75, Math.min(window.devicePixelRatio || 1, dprCap, budget));
    ui.width = Math.round(W * dpr); ui.height = Math.round(H * dpr);
    stage?.resize(W, H, dpr);
  };
  const ro = new ResizeObserver(measure);
  ro.observe(host);
  window.addEventListener('orientationchange', measure);

  function cleanup() {
    cancelAnimationFrame(raf);
    running = false;
    ro.disconnect();
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('orientationchange', measure);
    host.removeEventListener('pointerdown', onPointer);
    try { stage?.dispose(); } catch {}
    try { audio.dispose(); } catch {}
    host.remove();
  }

  /* ── build ────────────────────────────────────────────────────────────── */

  const lowSpec = forceLow == null ? detectLowSpec() : forceLow;
  try {
    stage = new Stage(glCanvas, { lowSpec });
  } catch (err) {
    console.warn('[intro] WebGL2 unavailable, skipping cinematic', err);
    cleanup();
    return;
  }
  measure();

  const steps = 12;
  let stepN = 0;
  await stage.build(() => { stepN++; fill.style.width = `${Math.min(100, (stepN / steps) * 100)}%`; });
  if (done) return;
  fill.style.width = '100%';
  loader.style.opacity = '0';
  setTimeout(() => loader.remove(), 520);

  /* ── the loop ─────────────────────────────────────────────────────────── */

  function step(dt) {
    const ts = stage.timeScale;
    storyT += dt * ts;

    for (const c of script.cues) {
      if (!cued.has(c) && storyT >= c.t) { cued.add(c); stage.cue(c.fx, audio); }
    }

    const shot = shotAt(script, storyT);
    stage.update(storyT, dt * ts, shot, audio);

    for (const b of script.beats) {
      if (storyT >= b.t && storyT < b.t + b.dur && !live.some((l) => l.beat === b)) {
        live.push({ beat: b, spk: script.speakers[b.who], seed: (b.t * 7.3) % 10, layout: null, age: 0 });
      }
    }
    for (let i = live.length - 1; i >= 0; i--) {
      const l = live[i];
      l.age = storyT - l.beat.t;
      if (l.age > l.beat.dur) live.splice(i, 1);
    }

    if (skipping > 0) {
      skipping += dt;
      stage.fade = Math.max(0, 1 - skipping / 0.42);
    }
  }

  function drawUi() {
    uctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    uctx.clearRect(0, 0, W, H);
    if (!live.length) return;
    const active = [];
    for (const l of live) {
      const anchor = l.beat.anchor === 'vayne' ? stage.anchorV : stage.anchorR;
      const ch = l.beat.anchor === 'vayne' ? stage.vayne : stage.rook;
      if (!anchor || Math.abs(ch.x) > 9000) continue;
      const [sx, sy] = stage.worldToCss(anchor.headX, anchor.headY - ch.h * 0.11);
      // mutate in place: Bubbles caches the wrapped layout on this object, and a fresh spread
      // every frame would re-measure every glyph
      l.sx = clamp(sx, -W, W * 2);
      l.sy = clamp(sy, -H, H * 2);
      active.push(l);
    }
    bubbles.render(uctx, W, H, storyT, active);
  }

  function frame(now) {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    const rdt = Math.min(0.12, (now - last) / 1000 || 0);
    last = now;
    acc = Math.min(acc + rdt, 0.25);
    while (acc >= DT) { step(DT); acc -= DT; }
    stage.render();
    drawUi();
    if (skipping > 0.42 || storyT >= script.duration) finish();
  }

  const controller = {
    get time() { return storyT; },
    get stage() { return stage; },
    skip: requestSkip,
    pause() { running = false; cancelAnimationFrame(raf); },
    resume() { if (!running && !done) { running = true; last = performance.now(); acc = 0; raf = requestAnimationFrame(frame); } },
    /* Deterministic scrub, for screenshot tooling. Steps the simulation from the start so the
     * particle state at t is the state it would really have had. */
    seek(t, coarse = 1 / 30) {
      this.pause();
      reset();
      let guard = 0;
      while (storyT < t && guard++ < 20000) step(Math.min(coarse, Math.max(0.0005, t - storyT)));
      stage.render();
      drawUi();
    },
  };
  host.__intro = controller;
  if (debug) window.__intro = controller;

  function reset() {
    storyT = 0; acc = 0; skipping = 0;
    cued.clear(); live.length = 0;
    stage.reset();
  }

  return new Promise((resolve) => {
    resolveFn = resolve;
    if (!autoStart) return;
    running = true;
    last = performance.now();
    wallStart = last;
    raf = requestAnimationFrame(frame);
  });
}

function detectLowSpec() {
  const mem = navigator.deviceMemory || 8;
  const cores = navigator.hardwareConcurrency || 8;
  const coarse = window.matchMedia?.('(pointer: coarse)').matches;
  const small = Math.min(window.screen?.width || 1920, window.screen?.height || 1080) < 500;
  return mem <= 4 || cores <= 4 || (coarse && small);
}

export default runIntro;
