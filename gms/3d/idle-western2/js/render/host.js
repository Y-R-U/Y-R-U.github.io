import * as THREE from 'three';
import { createBlitPresenter } from './presenter-blit.js?v=20261004a';
import { createOverlayPresenter } from './presenter-overlay.js?v=20261004a';
import { TIERS, LADDER, LADDER_START, startTier, qualityAt, createGovernor, device } from './quality.js?v=20261004a';
import { createPost, POST_DEFAULTS } from './post.js?v=20261004a';

const LIVE_CAP = 10, LOSS_WAIT = 1000, MAX_RECREATE = 3, FRAME_BUDGET = 5;
const _v3 = new THREE.Vector3(), _ndc = new THREE.Vector2(), _ray = new THREE.Raycaster(), _c = new THREE.Vector3(),
  _hit = new THREE.Vector3(), _plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

export function createRenderHost({ lifecycle, flags, bus }) {
  const presenter = flags.presenter === 'overlay' ? createOverlayPresenter({ debug: flags.debug }) : createBlitPresenter();
  const views = new Map();
  const frameHooks = new Set(), pickers = new Set();
  const vis = [], due = [], pre = [], todo = [], nearOrVis = [], visibleLines = new Set(), lossLog = [];
  const size = { W: 0, H: 0 };
  const governor = createGovernor();
  const noRecover = flags.break === 'norecover';
  let mode = TIERS[flags.tier] ? flags.tier : 'auto';
  let ceil = LADDER_START[startTier(flags)], level = ceil, q = qualityAt(level);
  let heroPost = null, cardPost = null, envRT = null, cardTilt = null, cardTiltSrc = null;
  let world = null, renderer = null, lost = false, paused = false, lossTimer = null, focusLine = null;
  let srcW = 0, srcH = 0, lastNow = 0, lastWork = 0, forceAll = true, lastRenderCall = 0, focus = null;
  let cardCost = 1, pressure = 0, pressureAt = 0, anchorFn = null;

  const dbg = {
    frames: 0, presented: 0, lastPresentAt: 0, views: 0, renderedThisFrame: 0, calls: 0, tris: 0, heroCalls: 0,
    dpr: 1, tier: q.name, level, mode, lost: false, paused: false, losses: 0, restores: 0, recreations: 0,
    tierRecreations: 0, stalls: 0, shadowUpdates: 0, shadows: false, programs: 0, ctx2dLost: 0, prepaints: 0, live2d: 0, presenter: presenter.name,
    workMs: 0, governor: governor.stats, device, post: false, env: false,
    perf: null,
    get visibleViews() { return vis.map((v) => v.id); },
  };
  const resetPerf = () => { dbg.perf = { frames: 0, workMax: 0, workSum: 0, hookSum: 0, presentSum: 0, heroSum: 0, cardSum: 0, cardRenders: 0, heroRenders: 0, callsMax: 0, heroCallsMax: 0, cardCallsMax: 0, blankMaxMs: 0, rendersMax: 0 }; };
  resetPerf();

  const dpr = () => Math.min(flags.dpr || devicePixelRatio || 1, q.dprCap);
  const qs = new URLSearchParams(location.search), sharpOff = qs.get('cardsharp') === '0', cardPxOff = qs.get('cardpx') === '0';
  const cardDpr = () => sharpOff ? dpr() : Math.max(dpr(), Math.min(flags.dpr || devicePixelRatio || 1, q.cardDprCap || q.dprCap));

  function makeRenderer() {
    const canvas = document.createElement('canvas');
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      if (renderer && canvas === renderer.domElement) onLost();
    });
    canvas.addEventListener('webglcontextrestored', () => {
      if (renderer && canvas === renderer.domElement) onRestored();
      else kill(canvas);
    });
    const r = new THREE.WebGLRenderer({
      canvas, antialias: q.msaa, alpha: !!presenter.rendererOptions.alpha, powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    });
    r.setPixelRatio(1);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.info.autoReset = false;
    r.setScissorTest(true);
    r.shadowMap.enabled = !!q.shadows;
    r.shadowMap.autoUpdate = false;
    r.shadowMap.type = world?.renderConfig?.shadowType ?? THREE.PCFSoftShadowMap;
    dbg.shadows = r.shadowMap.enabled;
    applyConfig(r);
    return r;
  }

  function applyConfig(r = renderer) {
    const rc = world?.renderConfig;
    if (!rc || !r) return;
    if (rc.toneMapping !== undefined && r.toneMapping !== rc.toneMapping) r.toneMapping = rc.toneMapping;
    if (rc.exposure !== undefined) r.toneMappingExposure = rc.exposure;
  }

  // Shadow cache: the world places the sun per view (prepare), so each view key keeps its own shadow map + matrix and
  // only re-renders it at the tier rate (hero shadowHz, cards cardShadowHz) or after markShadow(). Key = world.shadowFocus
  // (view, cam) when defined, else the view id; 'world' = one town-wide map refreshed only on hero renders.
  const shadowCache = new Map();
  let shadowLight = null, worldMapSize = 0, ownSize = 0, pendingShadow = null;
  function findShadowLight() {
    if (shadowLight && shadowLight.parent && shadowLight.castShadow) return shadowLight;
    shadowLight = world.shadowLight || world.rig?.sun || null;
    if (!shadowLight) world.scene.traverse((o) => { if (!shadowLight && o.isDirectionalLight && o.castShadow) shadowLight = o; });
    return shadowLight && shadowLight.castShadow ? shadowLight : null;
  }
  function clearShadowCache(dispose = true) {
    if (dispose) for (const e of shadowCache.values()) { try { e.map.dispose(); } catch {} }
    shadowCache.clear();
    if (shadowLight) shadowLight.shadow.map = null;
  }
  function shadowFor(v, cam, now) {
    renderer.shadowMap.needsUpdate = false;
    pendingShadow = null;
    if (!renderer.shadowMap.enabled || !world) return;
    const L = findShadowLight();
    if (!L) return;
    const sh = L.shadow;
    if (sh.mapSize.x !== ownSize) { worldMapSize = sh.mapSize.x; ownSize = worldMapSize; clearShadowCache(); }
    const key = world.shadowFocus ? world.shadowFocus(v, cam) : v.id;
    if (key == null) return;
    const hero = v.kind === 'hero';
    const want = hero ? worldMapSize : Math.min(worldMapSize, q.cardShadowSize || 1024);
    const hz = hero ? q.shadowHz : q.cardShadowHz;
    const e = shadowCache.get(key);
    const usable = e && e.w === want;
    const fresh = usable && !e.stale && (!hz || now - e.at < 1000 / hz || (key === 'world' && !hero));
    sh.mapSize.set(want, want);
    ownSize = want;
    if (fresh) {
      sh.map = e.map;
      sh.matrix.copy(e.matrix);
      shadowCache.delete(key);
      shadowCache.set(key, e);
      return;
    }
    if (e && !usable) { e.map.dispose(); shadowCache.delete(key); }
    sh.map = usable ? e.map : null;
    renderer.shadowMap.needsUpdate = true;
    pendingShadow = { key, e: usable ? e : null, w: want, now };
    dbg.shadowUpdates++;
  }
  function shadowStore() {
    const p = pendingShadow;
    pendingShadow = null;
    if (!p || !shadowLight?.shadow.map) return;
    const sh = shadowLight.shadow;
    const e = p.e || { map: null, matrix: sh.matrix.clone(), at: 0, w: p.w, stale: false };
    e.map = sh.map; e.matrix.copy(sh.matrix); e.at = p.now; e.w = p.w; e.stale = false;
    shadowCache.delete(p.key);
    shadowCache.set(p.key, e);
    const cap = q.shadowCache || 4;
    for (const [k, old] of shadowCache) {
      if (shadowCache.size <= cap) break;
      if (old.map === sh.map) continue;
      old.map.dispose();
      shadowCache.delete(k);
    }
  }

  function buildEnv() {
    const rc = world?.renderConfig;
    if (!rc?.envScene) return;
    try {
      const pm = new THREE.PMREMGenerator(renderer);
      const rt = pm.fromScene(rc.envScene, rc.envBlur ?? 0.04);
      pm.dispose();
      envRT?.dispose();
      envRT = rt;
      world.scene.environment = rt.texture;
      dbg.env = true;
    } catch (e) { console.warn('[iw2] env map failed', e); }
  }

  // Compile every program (incl. shadow depth flavours) up front for the paths this tier uses, so a card or flavour
  // seen for the first time mid-scroll never stalls on a shader link.
  function warm() {
    const cam = world?.heroRig?.camera;
    if (!cam) return;
    const cardsRT = !sharpOff && (q.postCards || q.cardSamples || q.cardSharpen);
    const viaRT = !!q.post || cardsRT, direct = !q.post || !cardsRT;
    const rt = viaRT ? new THREE.WebGLRenderTarget(8, 8, { type: THREE.HalfFloatType }) : null;
    try {
      const wc = world.warmup?.(true);
      if (direct) renderer.compile(world.scene, cam);
      if (rt) { renderer.setRenderTarget(rt); renderer.compile(world.scene, cam); }
      if (wc && renderer.shadowMap.enabled) {
        renderer.setViewport(0, 0, 8, 8);
        renderer.setScissor(0, 0, 8, 8);
        renderer.shadowMap.needsUpdate = true;
        renderer.render(world.scene, wc);
        renderer.shadowMap.needsUpdate = false;
      }
    } catch (e) { console.warn('[iw2] warm failed', e); }
    renderer.setRenderTarget(null);
    rt?.dispose();
    world.warmup?.(false);
    const L = findShadowLight();
    if (L?.shadow.map) { L.shadow.map.dispose(); L.shadow.map = null; }
    clearShadowCache();
  }

  let lossAt = 0;
  function onLost() {
    if (lost) return;
    lossAt = performance.now();
    lost = dbg.lost = true;
    dbg.losses++;
    presenter.onLoss();
    bus?.emit('graphics:lost', {});
    if (noRecover) return;
    clearTimeout(lossTimer);
    lossTimer = setTimeout(() => { lossTimer = null; if (lost) recreate('loss'); }, LOSS_WAIT);
  }

  // An abandoned canvas must stay lost: objects made under it keep dispose listeners holding its handles, and on a live
  // context those deletes warn "object does not belong to this context".
  function kill(canvas) {
    try {
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      if (gl && !gl.isContextLost()) gl.getExtension('WEBGL_lose_context')?.loseContext();
    } catch {}
  }

  // three's in-place restore is unsafe for the same reason, so a restore also swaps in a fresh renderer.
  function onRestored() {
    if (noRecover) return;
    if (!recreate('restore')) { lost = dbg.lost = false; presenter.onRestore(); host.markDirty('*'); }
  }

  function recreate(reason) {
    const now = performance.now();
    dbg.lossAt = lossAt;
    if (reason !== 'tier' && reason !== 'manual' && reason !== 'restore') {
      while (lossLog.length && now - lossLog[0] > 60000) lossLog.shift();
      if (lossLog.length >= MAX_RECREATE) {
        if (!paused) { paused = dbg.paused = true; bus?.emit('graphics:paused', { reason }); }
        return false;
      }
      lossLog.push(now);
    }
    const old = renderer;
    try {
      renderer = makeRenderer();
    } catch (e) {
      renderer = old;
      lost = dbg.lost = true;
      return false;
    }
    kill(old.domElement);
    try { old.dispose(); } catch {}
    heroPost?.dispose();
    cardPost?.dispose();
    heroPost = cardPost = null;
    clearShadowCache();
    envRT?.dispose();
    envRT = null;
    presenter.onRecreate(renderer);
    clearTimeout(lossTimer);
    lossTimer = null;
    lost = dbg.lost = false;
    if (reason === 'tier') dbg.tierRecreations++; else if (reason === 'restore') dbg.restores++; else dbg.recreations++;
    srcW = srcH = 0;
    buildEnv();
    warm();
    host.markDirty('*');
    if (reason !== 'restore') { dbg.recreatedAt = performance.now(); dbg.recreateMs = dbg.recreatedAt - now; }
    return true;
  }

  function dirtyAll() { for (const v of views.values()) v.dirty = true; }

  function setLevel(l) {
    l = Math.max(mode === 'auto' ? ceil : 0, Math.min(LADDER.length - 1, l));
    if (l === level) return;
    const nq = qualityAt(l);
    const msaaChange = nq.msaa !== q.msaa || !!nq.shadows !== !!q.shadows;
    level = dbg.level = l;
    q = nq;
    dbg.tier = q.name;
    if (msaaChange) recreate('tier');
    else { srcW = srcH = 0; dirtyAll(); clearShadowCache(); }
    bus?.emit('graphics:tier', { tier: q.name, level, shadows: !!q.shadows });
  }

  function enforceCap() {
    let live = 0, visible = 0;
    for (const v of views.values()) { if (v.live) live++; if (v.visible) visible++; }
    const cap = Math.max(LIVE_CAP, visible + 2);
    if (live > cap) {
      const cands = [...views.values()].filter((v) => v.live && !v.visible && v.kind !== 'hero').sort((a, b) => a.last - b.last);
      for (const v of cands) { if (live <= cap) break; presenter.release(v); live--; }
    }
    dbg.live2d = live;
  }

  function resumePath() {
    const now = performance.now();
    srcW = srcH = 0;
    lastRenderCall = now;
    dbg.lastPresentAt = now;
    governor.reset(now);
    if (!noRecover && !paused && renderer.getContext().isContextLost()) {
      if (!lost) onLost();
      recreate('resume');
    }
    host.markDirty('*');
  }

  renderer = makeRenderer();
  presenter.onRecreate(renderer);

  const ioVis = new IntersectionObserver((entries) => {
    const now = performance.now();
    for (const e of entries) {
      const v = e.target.__iw2view;
      if (!v) continue;
      const was = v.visible;
      v.visible = e.isIntersecting;
      if (v.visible && !was) { v.dirty = true; v.visibleAt = now; }
    }
    enforceCap();
  });
  const ioNear = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const v = e.target.__iw2view;
      if (!v) continue;
      const was = v.near;
      v.near = e.isIntersecting;
      if (v.near && !was) v.dirty = true;
      if (!v.near && was && v.kind !== 'hero') presenter.release(v);
    }
    enforceCap();
  }, { rootMargin: '100% 0px' });
  const ro = new ResizeObserver((entries) => {
    for (const e of entries) {
      const v = e.target.__iw2view;
      if (!v) continue;
      const box = e.contentBoxSize?.[0];
      const w = Math.max(1, Math.round(box ? box.inlineSize : e.contentRect.width));
      const h = Math.max(1, Math.round(box ? box.blockSize : e.contentRect.height));
      if (w !== v.w || h !== v.h) { v.w = w; v.h = h; v.dirty = true; }
    }
  });
  let mq = null;
  const watchDpr = () => {
    mq?.removeEventListener('change', onDpr);
    mq = matchMedia(`(resolution: ${devicePixelRatio}dppx)`);
    mq.addEventListener('change', onDpr);
  };
  function onDpr() { srcW = srcH = 0; dirtyAll(); watchDpr(); }
  watchDpr();

  const byPriority = (a, b) => (b.dirty - a.dirty) || ((b.lineId === focus) - (a.lineId === focus)) || (a.last - b.last);

  function renderView(v, d, now) {
    const cam = world.prepare(v);
    v.camera = cam;
    if (!presenter.viewport(v, d, srcH)) return;
    shadowFor(v, cam, now);
    renderer.setViewport(v.vx, v.vy, v.pw, v.ph);
    renderer.setScissor(v.vx, v.vy, v.pw, v.ph);
    const c0 = renderer.info.render.calls, tr = performance.now();
    const rc = world.renderConfig;
    const bloom = rc?.bloom === false ? null : rc?.bloom || POST_DEFAULTS.bloom;
    let tilt = rc?.tilt === false ? null : rc?.tilt || POST_DEFAULTS.tilt;
    const hero = v.kind === 'hero';
    if (q.post && (hero || q.postCards) && (bloom || tilt)) {
      if (!hero && tilt) {
        if (cardTiltSrc !== tilt) { cardTiltSrc = tilt; cardTilt = { ...tilt, band: (tilt.band ?? 0.17) + 0.08, strength: (tilt.strength ?? 0.8) * 0.6 }; }
        tilt = cardTilt;
      }
      const post = hero ? (heroPost ||= createPost()) : (cardPost ||= createPost());
      post.render(renderer, world.scene, cam, v, { bloom, tilt, samples: hero ? q.rtSamples : 0, div: q.post, sharpen: hero ? q.heroSharpen : 0 });
      dbg.post = true;
    } else if (!hero && !sharpOff && (q.cardSamples || q.cardSharpen)) {
      (cardPost ||= createPost()).render(renderer, world.scene, cam, v, { samples: q.cardSamples, sharpen: q.cardSharpen });
    } else renderer.render(world.scene, cam);
    shadowStore();
    const calls = renderer.info.render.calls - c0;
    if (renderer.getContext().isContextLost()) return;
    const tp = performance.now();
    presenter.present(v, renderer, now);
    dbg.perf.presentSum += performance.now() - tp;
    const ms = performance.now() - tr;
    if (v.kind === 'hero') { dbg.perf.heroSum += ms; dbg.perf.heroRenders++; } else { dbg.perf.cardSum += ms; dbg.perf.cardRenders++; }
    if (v.kind === 'hero') { dbg.heroCalls = calls; if (calls > dbg.perf.heroCallsMax) dbg.perf.heroCallsMax = calls; }
    else if (calls > dbg.perf.cardCallsMax) dbg.perf.cardCallsMax = calls;
    if (!v.visible) dbg.prepaints++;
    v.last = now;
    v.dirty = false;
    v.blankSince = 0;
    v.presented++;
    dbg.presented++;
    dbg.lastPresentAt = now;
    dbg.renderedThisFrame++;
  }

  const host = {
    get lost() { return lost; },
    get paused() { return paused; },
    get renderer() { return renderer; },
    get world() { return world; },
    get quality() { return q; },
    setWorld(w) {
      world = w;
      const st = w?.renderConfig?.shadowType;
      if (st !== undefined && st !== renderer.shadowMap.type) recreate('tier');
      applyConfig();
      buildEnv();
      warm();
      host.markDirty('*');
    },
    markShadow(id) {
      for (const [k, e] of shadowCache) if (!id || k === id || k === 'line:' + id || k === 'hero' || k === 'world') e.stale = true;
    },
    refreshEnv() { buildEnv(); host.markDirty('*'); },
    addView(id, el, { kind = 'line', lineId = null, priority = 0, fps = 0 } = {}) {
      if (views.has(id)) host.removeView(id);
      const r = el.getBoundingClientRect();
      const v = {
        id, el, kind, lineId, priority, fps, w: Math.max(1, Math.round(r.width)), h: Math.max(1, Math.round(r.height)),
        visible: false, near: false, live: false, dirty: true, last: 0, presented: 0, camera: null, visibleAt: 0,
        blankSince: performance.now(), vx: 0, vy: 0, pw: 1, ph: 1,
      };
      el.__iw2view = v;
      if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
      presenter.attach(v, () => { dbg.ctx2dLost++; });
      views.set(id, v);
      ioVis.observe(el);
      ioNear.observe(el);
      ro.observe(el);
      dbg.views = views.size;
      return v;
    },
    removeView(id) {
      const v = views.get(id);
      if (!v) return;
      ioVis.unobserve(v.el);
      ioNear.unobserve(v.el);
      ro.unobserve(v.el);
      presenter.detach(v);
      delete v.el.__iw2view;
      views.delete(id);
      dbg.views = views.size;
    },
    setFocus(lineId) { focusLine = lineId; },
    setViewFps(id, fps) { const v = views.get(id); if (v) v.fps = fps || 0; },
    markDirty(id) {
      if (id === '*') { dirtyAll(); forceAll = true; host.markShadow(); }
      else if (views.has(id)) views.get(id).dirty = true;
      else for (const v of views.values()) if (v.lineId === id) v.dirty = true;
    },
    setTier(name) {
      if (name === 'battery') name = 'low';
      if (name !== 'auto' && !TIERS[name]) return;
      mode = dbg.mode = name;
      governor.reset(performance.now());
      if (name === 'auto') ceil = LADDER_START[startTier({})];
      setLevel(LADDER_START[name === 'auto' ? startTier({}) : name]);
    },
    restart() {
      lossLog.length = 0;
      paused = dbg.paused = false;
      const ok = recreate('manual');
      if (ok) bus?.emit('graphics:resumed', {});
      return ok;
    },
    onFrame(fn) { frameHooks.add(fn); return () => frameHooks.delete(fn); },
    addPicker(fn) { pickers.add(fn); return () => pickers.delete(fn); },
    eventsDiegetic: false,
    setAnchorProvider(fn) { anchorFn = fn; host.eventsDiegetic = !!fn; },
    // World anchor for an event ({lineId}) or a lineId → [x,y,z]; pair with project(viewId, anchor).
    anchor(what) { return anchorFn ? anchorFn(what) : null; },
    render(now) {
      const t0 = performance.now();
      const rafDt = lastNow ? now - lastNow : 16.7;
      lastNow = now;
      lastRenderCall = t0;
      if (lifecycle.hidden || !world || lost || paused) return;
      if (renderer.getContext().isContextLost()) { onLost(); return; }
      if (mode === 'auto') {
        const step = governor.sample(rafDt, lastWork, t0);
        if (step) setLevel(level - step);
        else if (pressure > 0.5 && t0 - pressureAt > 4000) { pressureAt = t0; pressure = 0; governor.reset(t0); setLevel(level + 1); }
      }
      const dt = Math.min(0.1, rafDt / 1000);
      dbg.frames++;
      const d = dpr(), dc = presenter.direct ? d : cardDpr();
      dbg.dpr = d;
      focus = focusLine ?? world.heroRig?.pinned ?? world.heroRig?.current ?? null;

      vis.length = due.length = pre.length = todo.length = nearOrVis.length = 0;
      let heroDue = false;
      let cardMax = 0;
      for (const v of views.values()) {
        v.d = v.kind === 'hero' ? d : q.cardPx && !cardPxOff && !presenter.direct ? Math.max(d, Math.min(dc, Math.floor(Math.sqrt(q.cardPx / (v.w * v.h)) * 20) / 20)) : dc;
        if (v.kind !== 'hero' && (v.visible || v.near) && v.d > cardMax) cardMax = v.d;
        if (v.visible || v.near) nearOrVis.push(v);
        if (!v.visible) { if (v.near && v.dirty) { if (v.kind === 'hero') pre.unshift(v); else pre.push(v); } continue; }
        vis.push(v);
        if (v.kind === 'hero') {
          if (forceAll || v.dirty || now - v.last >= 1000 / q.heroFps - 2) { heroDue = true; todo.unshift(v); }
          continue;
        }
        const fps = v.fps || (v.lineId === focus ? q.cardFps : q.cardFpsOther);
        if (forceAll || v.dirty || now - v.last >= 1000 / fps - 2) due.push(v);
      }
      if (presenter.direct) {
        if (!heroDue && !due.length && !forceAll) { lastWork = performance.now() - t0; return; }
        todo.length = 0;
        for (const v of vis) if (v.kind !== 'hero') todo.push(v);
        for (const v of vis) if (v.kind === 'hero') todo.push(v);
      } else {
        due.sort(byPriority);
        const K = forceAll ? due.length : q.K;
        let n = 0;
        for (; n < due.length && n < K; n++) todo.push(due[n]);
        for (let i = 0; i < pre.length && n < K; i++, n++) todo.push(pre[i]);
      }

      dbg.cardDpr = cardMax || dc;
      presenter.frameSize(nearOrVis, d, size);
      if (size.W !== srcW || size.H !== srcH) { srcW = size.W; srcH = size.H; renderer.setSize(srcW, srcH, false); }
      visibleLines.clear();
      visibleLines.hero = false;
      for (const v of nearOrVis) if (v.kind === 'hero') visibleLines.hero = true;
      for (const v of vis) if (v.lineId) visibleLines.add(v.lineId);
      for (const v of todo) if (v.lineId) visibleLines.add(v.lineId);
      const th = performance.now();
      for (const fn of frameHooks) fn(dt, now, visibleLines, q);
      dbg.perf.hookSum += performance.now() - th;
      renderer.info.reset();
      world.configureRenderer?.(renderer, q.name);
      applyConfig();
      dbg.renderedThisFrame = 0;
      if (todo.length) presenter.beginFrame(renderer);
      // Cards only start while the frame is under budget; a card starved past 3× its interval may overrun once.
      let blocked = false, overrun = false;
      for (const v of todo) {
        if (v.kind !== 'hero' && !forceAll && !presenter.direct && dbg.renderedThisFrame > 0) {
          const fps = v.fps || (v.lineId === focus ? q.cardFps : q.cardFpsOther);
          const starving = v.visible && now - v.last > 3000 / fps;
          if (performance.now() - t0 + cardCost > FRAME_BUDGET) {
            if (!starving || overrun) { if (starving) blocked = true; continue; }
            overrun = true;
          }
        }
        const tv = performance.now();
        renderView(v, d, now);
        if (v.kind !== 'hero') cardCost = cardCost * 0.8 + (performance.now() - tv) * 0.2;
      }
      pressure = pressure * 0.98 + (blocked ? 0.02 : 0);
      dbg.pressure = pressure;
      dbg.cardCost = cardCost;
      forceAll = false;

      const p = dbg.perf;
      for (const v of vis) {
        if (!v.blankSince) continue;
        const ms = now - Math.max(v.blankSince, v.visibleAt);
        if (ms > p.blankMaxMs) p.blankMaxMs = ms;
      }
      dbg.calls = renderer.info.render.calls;
      dbg.tris = renderer.info.render.triangles;
      dbg.programs = renderer.info.programs?.length || 0;
      lastWork = dbg.workMs = performance.now() - t0;
      p.frames++;
      p.workSum += lastWork;
      if (lastWork > p.workMax) p.workMax = lastWork;
      if (dbg.calls > p.callsMax) p.callsMax = dbg.calls;
      if (dbg.renderedThisFrame > p.rendersMax) p.rendersMax = dbg.renderedThisFrame;
    },
    // Returned object is reused; copy what you need.
    project(viewId, vec3, out = projOut) {
      const v = views.get(viewId);
      if (!v || !v.camera) { out.visible = false; return out; }
      if (Array.isArray(vec3)) _v3.set(vec3[0], vec3[1], vec3[2]); else _v3.copy(vec3);
      _v3.project(v.camera);
      out.x = (_v3.x + 1) / 2 * v.w;
      out.y = (1 - _v3.y) / 2 * v.h;
      out.visible = _v3.z < 1 && Math.abs(_v3.x) <= 1 && Math.abs(_v3.y) <= 1;
      return out;
    },
    pick(viewId, clientX, clientY) {
      const v = views.get(viewId);
      if (!v || !v.camera || !world) return null;
      const r = v.el.getBoundingClientRect();
      _ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
      _ray.setFromCamera(_ndc, v.camera);
      const only = v.kind === 'line' ? v.lineId : null;
      let best = null;
      for (const fn of pickers) {
        const h = fn(_ray.ray, only, v);
        if (h && (!best || h.dist < best.dist)) best = h;
      }
      if (best) return best;
      for (const [id, p] of world.plots) {
        if (only && id !== only) continue;
        for (const t of p.tapTargets || []) {
          _c.set(t.pos[0], t.pos[1], t.pos[2]).applyMatrix4(p.group.matrixWorld);
          if (_ray.ray.distanceSqToPoint(_c) <= t.r * t.r) {
            const dist = _c.distanceTo(_ray.ray.origin);
            if (!best || dist < best.dist) best = { kind: t.id === 'pile' ? 'pile' : 'target', id: t.id, lineId: id, point: _c.toArray(), dist };
          }
        }
      }
      if (best) return best;
      if (_ray.ray.intersectPlane(_plane, _hit)) {
        let lineId = null, bd = Infinity;
        for (const [id, p] of world.plots) {
          if (only && id !== only) continue;
          const dx = Math.abs(_hit.x - p.group.position.x), dz = Math.abs(_hit.z - p.group.position.z);
          if (dx < p.bounds.w / 2 && dz < p.bounds.d / 2 + 1 && dx < bd) { bd = dx; lineId = id; }
        }
        if (!lineId && v.kind === 'hero' && world.heroRig?.isTown) lineId = world.heroRig.nearestPlot([_hit.x, 0, _hit.z]);
        return { kind: 'ground', lineId, point: _hit.toArray() };
      }
      return null;
    },
    debug: dbg,
  };
  const projOut = { x: 0, y: 0, visible: false };

  const scratch = document.createElement('canvas');
  scratch.width = scratch.height = 8;
  const sctx = scratch.getContext('2d', { willReadFrequently: true });
  dbg.sample = (viewId) => {
    const v = views.get(viewId);
    return v ? presenter.sample(v, sctx) : { lum: 0, alpha: 0 };
  };
  dbg.listViews = () => [...views.values()].map((v) => ({
    id: v.id, kind: v.kind, lineId: v.lineId, w: v.w, h: v.h, visible: v.visible, near: v.near, live: v.live,
    presented: v.presented, last: v.last,
  }));
  dbg.resetPerf = resetPerf;
  if (flags.debug) {
    let ext = null;
    dbg.loseContext = () => { ext = renderer.getContext().getExtension('WEBGL_lose_context'); ext?.loseContext(); };
    dbg.restoreContext = () => ext?.restoreContext();
    dbg.recreate = () => recreate('debug');
    dbg.lose2d = (id) => { const v = views.get(id); v?.canvas?.dispatchEvent(new Event('contextlost')); };
    dbg.setLevel = setLevel;
  }

  lifecycle.on('resume', resumePath);

  setInterval(() => {
    const now = performance.now();
    if (lifecycle.hidden || !world || paused) return;
    if (lost) {
      if (!lossTimer && !noRecover) recreate('watchdog');
      return;
    }
    if (lastRenderCall && now - lastRenderCall > 1500) {
      dbg.stalls++;
      lastRenderCall = now;
      bus?.emit('host:stall', { kind: 'raf' });
      return;
    }
    let anyVisible = false;
    for (const v of views.values()) if (v.visible) { anyVisible = true; break; }
    if (anyVisible && dbg.lastPresentAt && now - dbg.lastPresentAt > 3000) {
      dbg.stalls++;
      resumePath();
      bus?.emit('host:stall', { kind: 'present' });
    }
  }, 1000);

  return host;
}
