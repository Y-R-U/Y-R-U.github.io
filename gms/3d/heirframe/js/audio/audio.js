// HEIRFRAME audio engine: Web Audio buses, streamed music with crossfades, procedural SFX and
// ambience, positional panning/attenuation around a listener, and voice-over with ducking.
import { TRACKS, STINGS, STATES } from './tracks.js';
import { playSfx, createBed, createLoop, SFX_NAMES, BEDS, EMITTERS } from './sfx.js';

const BASE = new URL('../../audio/', import.meta.url).href;
const STORE = 'heirframe.audio.v1';
const DEFAULTS = { master: 0.9, music: 0.55, sfx: 0.8, vo: 1, ambient: 0.5 };
const XFADE = 3;
const REF_DIST = 5, MAX_DIST = 50, PAN_WIDTH = 14;
const DUCK = { vo: 0.3, bark: 0.7, sting: 0.25 };

function silentWav() {
  const n = 800, b = new Uint8Array(44 + n), v = new DataView(b.buffer);
  const s = (o, str) => [...str].forEach((c, i) => (b[o + i] = c.charCodeAt(0)));
  s(0, 'RIFF'); v.setUint32(4, 36 + n, true); s(8, 'WAVEfmt '); v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, 8000, true); v.setUint32(28, 8000, true);
  v.setUint16(32, 1, true); v.setUint16(34, 8, true); s(36, 'data'); v.setUint32(40, n, true);
  b.fill(128, 44);
  let bin = ''; b.forEach((x) => (bin += String.fromCharCode(x)));
  return 'data:audio/wav;base64,' + btoa(bin);
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export function createAudio() {
  const hasDOM = typeof window !== 'undefined';
  let ctx = null, B = null, analyser = null, levelBuf = null;
  let decks = [], active = null, primed = false, loopTimer = null;
  let curState = null, curAmbient = null, bed = null, vis = true;
  const rotation = {}, resume = {}, bufCache = new Map(), inflight = new Map();
  const ducks = new Map(), sfxLive = {}, sfxLast = {}, barkLast = {}, emitters = new Set();
  const listener = { x: 0, z: 0, rx: 1, rz: 0 };
  const vo = { main: null, bark: null };
  let manifestP = null, manifest = null, vols = { ...DEFAULTS }, muted = false, readyResolve;
  const ready = new Promise((r) => (readyResolve = r));
  const errors = [];

  try { Object.assign(vols, JSON.parse(localStorage.getItem(STORE) || '{}')); } catch (e) { /* storage blocked */ }

  function ensureCtx() {
    if (ctx) return ctx;
    const AC = hasDOM && (window.AudioContext || window.webkitAudioContext);
    if (!AC) return null;
    try { ctx = new AC({ latencyHint: 'interactive' }); } catch (e) { ctx = new AC(); }
    const G = (v = 1) => { const g = ctx.createGain(); g.gain.value = v; return g; };
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10; comp.knee.value = 10; comp.ratio.value = 6;
    comp.attack.value = 0.003; comp.release.value = 0.25;
    B = { master: G(), music: G(), musicDuck: G(), sting: G(), sfx: G(), vo: G(), ambient: G(), ambientDuck: G() };
    B.master.connect(comp).connect(ctx.destination);
    B.music.connect(B.musicDuck).connect(B.master);
    B.sting.connect(B.master);
    B.sfx.connect(B.master);
    B.vo.connect(B.master);
    B.ambient.connect(B.ambientDuck).connect(B.master);
    analyser = ctx.createAnalyser(); analyser.fftSize = 2048;
    levelBuf = new Float32Array(analyser.fftSize);
    B.master.connect(analyser);
    applyVolumes(0);
    ctx.onstatechange = () => { if (ctx.state === 'running') onRunning(); };
    for (let i = 0; i < 2; i++) {
      const el = new Audio();
      el.preload = 'auto'; el.playsInline = true; el.setAttribute('playsinline', '');
      const g = G(0);
      try { ctx.createMediaElementSource(el).connect(g); } catch (e) { errors.push('mediaSource: ' + e.message); }
      g.connect(B.music);
      el.addEventListener('ended', () => { if (active && active.el === el) loopNext(true); });
      el.addEventListener('error', () => errors.push('music load failed: ' + el.src));
      decks.push({ el, g, track: null, token: 0, looping: false });
    }
    return ctx;
  }

  function applyVolumes(t = 0.05) {
    if (!B) return;
    const set = (g, v) => g.gain.setTargetAtTime(v, ctx.currentTime, t || 0.001);
    set(B.master, muted ? 0 : vols.master);
    set(B.music, vols.music);
    set(B.sting, vols.music);
    set(B.sfx, vols.sfx);
    set(B.vo, vols.vo);
    set(B.ambient, vols.ambient);
  }

  function onRunning() {
    readyResolve(true);
    if (!loopTimer) loopTimer = setInterval(tick, 250);
    if (curState && !active) startState(curState, 1.5);
    if (curAmbient && !bed) startBed(curAmbient, 2);
    emitters.forEach(updateEmitter);
  }

  function unlock() {
    if (!ensureCtx()) return Promise.resolve(false);
    if (!primed) {
      primed = true;
      const src = silentWav();
      decks.forEach((d) => {
        if (!d.track) { d.el.src = src; const p = d.el.play(); if (p) p.then(() => { if (!d.track) d.el.pause(); }).catch(() => { primed = false; }); }
      });
      const b = ctx.createBuffer(1, 1, 22050), s = ctx.createBufferSource();
      s.buffer = b; s.connect(ctx.destination); s.start(0);
    }
    const p = ctx.state === 'running' ? Promise.resolve() : ctx.resume();
    return p.then(() => { if (ctx.state === 'running') onRunning(); return ctx.state === 'running'; }).catch(() => false);
  }

  const running = () => ctx && ctx.state === 'running' && vis;

  // ---- ducking ------------------------------------------------------------------------------
  function duck(id, level) {
    if (level == null) ducks.delete(id); else ducks.set(id, level);
    if (!B) return;
    let m = 1;
    ducks.forEach((v) => (m = Math.min(m, v)));
    const up = m >= 1;
    B.musicDuck.gain.setTargetAtTime(m, ctx.currentTime, up ? 0.35 : 0.08);
    B.ambientDuck.gain.setTargetAtTime(Math.min(1, 0.4 + m * 0.6), ctx.currentTime, up ? 0.35 : 0.08);
  }

  // ---- music --------------------------------------------------------------------------------
  function fadeDeck(d, to, dur) {
    const g = d.g.gain, t = ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(to, t + Math.max(0.05, dur));
  }

  function playTrack(id, { fade = 2.5, at } = {}) {
    const tr = TRACKS[id];
    if (!tr || !ctx) return;
    const old = active;
    const d = decks.find((x) => x !== old) || decks[0];
    const token = ++d.token;
    const url = BASE + 'music/' + tr.file;
    if (d.el.src !== url) { d.el.src = url; d.el.load(); }
    const start = at ?? tr.start;
    const seek = () => { try { d.el.currentTime = start; } catch (e) { /* not seekable yet */ } };
    if (d.el.readyState >= 1) seek(); else d.el.addEventListener('loadedmetadata', seek, { once: true });
    d.track = id; d.looping = false;
    d.g.gain.cancelScheduledValues(ctx.currentTime);
    d.g.gain.setValueAtTime(0, ctx.currentTime);
    const p = d.el.play();
    if (p) p.catch((e) => { if (token === d.token) errors.push('music play: ' + e.message); });
    fadeDeck(d, tr.gain ?? 1, fade);
    active = d;
    if (old && old !== d) stopDeck(old, fade);
  }

  function stopDeck(d, fade) {
    if (d.track && d.el.currentTime > 5) resume[d.track] = { pos: d.el.currentTime, at: now() };
    const token = ++d.token;
    fadeDeck(d, 0, fade);
    setTimeout(() => { if (token === d.token) { d.el.pause(); d.track = null; } }, fade * 1000 + 100);
  }

  function pickTrack(state) {
    const list = STATES[state] || (TRACKS[state] ? [state] : null);
    if (!list) return null;
    const i = rotation[state] ?? 0;
    return list[i % list.length];
  }

  function startState(state, fade) {
    const id = pickTrack(state);
    if (!id) return;
    const r = resume[id], tr = TRACKS[id];
    const at = r && now() - r.at < 120000 && r.pos < tr.end - 15 ? r.pos : undefined;
    playTrack(id, { fade, at });
  }

  function loopNext(ended) {
    if (!active || !curState) return;
    const list = STATES[curState] || [curState];
    rotation[curState] = ((rotation[curState] ?? 0) + 1) % list.length;
    const id = pickTrack(curState);
    delete resume[id];
    playTrack(id, { fade: ended ? 0.5 : XFADE, at: TRACKS[id].start });
  }

  function tick() {
    if (!active || !active.track || active.looping || !vis) return;
    const tr = TRACKS[active.track];
    if (tr && active.el.currentTime >= tr.end - XFADE) { active.looping = true; loopNext(false); }
  }

  function music(name, opts = {}) {
    if (!name || name === 'none' || name === 'off') {
      curState = null;
      if (ctx && active) { stopDeck(active, opts.fade ?? 2); active = null; }
      return;
    }
    if (!STATES[name] && !TRACKS[name]) { console.warn('[audio] unknown music', name); return; }
    if (name === curState && !opts.restart) return;
    curState = name;
    if (!running()) return; // starts on unlock
    startState(name, opts.fade ?? (name === 'combat' || name.startsWith('boss') ? 1.2 : 2.5));
  }

  function sting(name, opts = {}) {
    const file = STINGS[name];
    if (!file || !running()) return Promise.resolve(false);
    return loadBuffer(BASE + 'music/' + file).then((buf) => {
      if (!buf) return false;
      const s = ctx.createBufferSource(), g = ctx.createGain();
      g.gain.value = opts.vol ?? 1;
      s.buffer = buf; s.connect(g).connect(B.sting);
      const id = 'sting' + now();
      duck(id, DUCK.sting);
      s.onended = () => duck(id, null);
      s.start();
      return true;
    });
  }

  // ---- buffers / VO -------------------------------------------------------------------------
  function loadBuffer(url) {
    if (bufCache.has(url)) {
      const b = bufCache.get(url); bufCache.delete(url); bufCache.set(url, b);
      return Promise.resolve(b);
    }
    if (inflight.has(url)) return inflight.get(url);
    const p = fetch(url)
      .then((r) => { if (!r.ok) throw new Error(r.status + ' ' + url); return r.arrayBuffer(); })
      .then((ab) => new Promise((res, rej) => { const q = ctx.decodeAudioData(ab, res, rej); if (q && q.then) q.then(res, rej); }))
      .then((b) => {
        bufCache.set(url, b);
        while (bufCache.size > 48) bufCache.delete(bufCache.keys().next().value);
        return b;
      })
      .catch((e) => { errors.push('load: ' + (e && e.message)); return null; })
      .finally(() => inflight.delete(url));
    inflight.set(url, p);
    return p;
  }

  function loadManifest() {
    if (!manifestP) {
      manifestP = fetch(BASE + 'vo/manifest.json')
        .then((r) => (r.ok ? r.json() : {}))
        .catch(() => ({}))
        .then((m) => (manifest = m));
    }
    return manifestP;
  }

  const voUrl = (key) => BASE + 'vo/' + ((manifest && manifest[key] && manifest[key].file) || key + '.mp3');

  function stopVo(channel = 'main') {
    const v = vo[channel];
    if (!v) return;
    vo[channel] = null;
    try { v.src.onended = null; v.src.stop(); } catch (e) { /* not started */ }
    duck('vo_' + channel, null);
    v.done({ key: v.key, ok: true, interrupted: true });
  }

  function playVo(key, opts = {}) {
    const channel = opts.channel || 'main';
    const missing = () => manifest && !manifest[key];
    if (missing()) return Promise.resolve({ key, ok: false, reason: 'missing' });
    if (!ensureCtx() || ctx.state !== 'running') return Promise.resolve({ key, ok: false, reason: 'locked' });
    return loadManifest().then(() => {
      if (missing()) return { key, ok: false, reason: 'missing' };
      return loadBuffer(voUrl(key)).then((buf) => {
        if (!buf) return { key, ok: false, reason: 'load' };
        if (vo[channel] && opts.interrupt === false) return { key, ok: false, reason: 'busy' };
        stopVo(channel);
        return new Promise((done) => {
          const s = ctx.createBufferSource(), g = ctx.createGain();
          s.buffer = buf;
          const out = spatialChain(opts, g, B.vo);
          if (!out) return done({ key, ok: false, reason: 'far' });
          s.connect(g);
          g.gain.value = (opts.vol ?? 1) * out.att;
          const rec = { key, src: s, done };
          vo[channel] = rec;
          duck('vo_' + channel, channel === 'main' ? DUCK.vo : DUCK.bark);
          s.onended = () => {
            if (vo[channel] !== rec) return;
            vo[channel] = null;
            duck('vo_' + channel, null);
            done({ key, ok: true, duration: buf.duration });
          };
          s.start();
        });
      });
    });
  }

  function bark(sel, opts = {}) {
    if (!running()) return Promise.resolve({ ok: false, reason: 'locked' });
    return loadManifest().then(() => {
      const keys = Array.isArray(sel) ? sel : Object.keys(manifest || {}).filter((k) => k.startsWith(sel));
      if (!keys.length) return { ok: false, reason: 'missing' };
      const tag = Array.isArray(sel) ? sel.join('|') : sel;
      const cd = (opts.cooldown ?? 4) * 1000, t = now();
      if (!opts.force && (vo.bark || vo.main || t - (barkLast[tag]?.t ?? -1e9) < cd)) return { ok: false, reason: 'busy' };
      const pool = keys.length > 1 ? keys.filter((k) => k !== barkLast[tag]?.key) : keys;
      const key = pool[Math.floor(Math.random() * pool.length)];
      barkLast[tag] = { t, key };
      return playVo(key, { ...opts, channel: 'bark', interrupt: !!opts.force });
    });
  }

  function preloadVo(keys) {
    if (!ensureCtx()) return Promise.resolve();
    return loadManifest().then(() => Promise.all(keys.map((k) => loadBuffer(voUrl(k)))));
  }

  // ---- positional -----------------------------------------------------------------------------
  function spatial(x, z) {
    const dx = x - listener.x, dz = z - listener.z, d = Math.hypot(dx, dz);
    if (d >= MAX_DIST) return { att: 0, pan: 0, d };
    let att = d <= REF_DIST ? 1 : REF_DIST / (REF_DIST + (d - REF_DIST));
    att *= clamp((MAX_DIST - d) / 10, 0, 1);
    const pan = clamp((dx * listener.rx + dz * listener.rz) / PAN_WIDTH, -0.85, 0.85);
    return { att, pan, d };
  }

  // Wires `from` -> [pan] -> [lowpass] -> bus. Returns {att} or null if out of range.
  function spatialChain(opts, from, bus) {
    if (opts.x == null || opts.z == null) { from.connect(bus); return { att: 1 }; }
    const s = spatial(opts.x, opts.z);
    if (s.att <= 0.001) return null;
    let node = from;
    if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = s.pan; node.connect(p); node = p; }
    if (s.d > 18) {
      const f = ctx.createBiquadFilter(); f.type = 'lowpass';
      f.frequency.value = clamp(14000 - (s.d - 18) * 350, 2500, 14000);
      node.connect(f); node = f;
    }
    node.connect(bus);
    return s;
  }

  function setListener(x, z, yaw) {
    if (typeof x === 'object' && x) ({ x, z, yaw } = x);
    listener.x = x; listener.z = z;
    if (yaw != null) { listener.rx = Math.cos(yaw); listener.rz = -Math.sin(yaw); }
    emitters.forEach(updateEmitter);
  }

  // Uses the camera's right vector for panning; x,z is where the ears are (usually the player).
  function setListenerCamera(camera, x, z) {
    const e = camera.matrixWorld.elements, l = Math.hypot(e[0], e[2]) || 1;
    listener.rx = e[0] / l; listener.rz = e[2] / l;
    setListener(x, z);
  }

  // ---- SFX ------------------------------------------------------------------------------------
  function sfx(name, opts = {}) {
    if (!running()) return 0;
    const t = now();
    if (t - (sfxLast[name] || 0) < (opts.minGap ?? 25) || (sfxLive[name] || 0) >= (opts.maxVoices ?? 8)) return 0;
    const g = ctx.createGain();
    const s = spatialChain(opts, g, B.sfx);
    if (!s) return 0;
    g.gain.value = (opts.vol ?? 1) * s.att;
    let len = 0;
    try { len = playSfx(ctx, g, name, ctx.currentTime + 0.005, opts); } catch (e) { errors.push('sfx ' + name + ': ' + e.message); }
    if (!len) { g.disconnect(); if (!SFX_NAMES.includes(name)) console.warn('[audio] unknown sfx', name); return 0; }
    sfxLast[name] = t;
    sfxLive[name] = (sfxLive[name] || 0) + 1;
    setTimeout(() => { sfxLive[name]--; try { g.disconnect(); } catch (e) { /* gone */ } }, len * 1000 + 800);
    return len;
  }

  // ---- ambience -------------------------------------------------------------------------------
  let bedGain = null;
  function startBed(name, fade) {
    if (bed) { const ob = bed, og = bedGain; og.gain.setTargetAtTime(0, ctx.currentTime, fade / 3); setTimeout(() => { ob.stop(); og.disconnect(); }, fade * 1000 + 200); }
    bed = null; bedGain = null;
    if (!name || !BEDS[name]) return;
    bedGain = ctx.createGain(); bedGain.gain.value = 0; bedGain.connect(B.ambient);
    bed = createBed(ctx, bedGain, name);
    bedGain.gain.setTargetAtTime(1, ctx.currentTime, fade / 3);
  }

  function ambient(name, opts = {}) {
    if (name === curAmbient) return;
    curAmbient = name || null;
    if (running()) startBed(curAmbient, opts.fade ?? 2);
  }

  function updateEmitter(em) {
    if (!running() || em.dead) return;
    const s = spatial(em.x, em.z);
    const inRange = s.d < MAX_DIST + (em.live ? 5 : 0);
    if (inRange && !em.live) {
      em.g = ctx.createGain(); em.g.gain.value = 0;
      em.p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      if (em.p) em.g.connect(em.p).connect(B.ambient); else em.g.connect(B.ambient);
      em.loop = createLoop(ctx, em.g, em.kind, em.level);
      em.live = true;
    } else if (!inRange && em.live) {
      const { loop, g } = em;
      g.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
      setTimeout(() => { loop && loop.stop(); g.disconnect(); }, 800);
      em.live = false;
      return;
    }
    if (em.live) {
      em.g.gain.setTargetAtTime(s.att * em.vol, ctx.currentTime, 0.12);
      if (em.p) em.p.pan.setTargetAtTime(s.pan, ctx.currentTime, 0.12);
    }
  }

  function emitter(kind, { x = 0, z = 0, level = 1, vol = 1 } = {}) {
    if (!EMITTERS.includes(kind)) console.warn('[audio] unknown emitter', kind);
    const em = { kind, x, z, level, vol, live: false, dead: false };
    emitters.add(em);
    updateEmitter(em);
    return {
      setPos(nx, nz) { em.x = nx; em.z = nz; updateEmitter(em); },
      setVolume(v) { em.vol = v; updateEmitter(em); },
      stop() {
        em.dead = true; emitters.delete(em);
        if (em.live) { em.g.gain.setTargetAtTime(0, ctx.currentTime, 0.2); const { loop, g } = em; setTimeout(() => { loop && loop.stop(); g.disconnect(); }, 800); }
      },
    };
  }

  // ---- lifecycle -------------------------------------------------------------------------------
  if (hasDOM) {
    loadManifest();
    const gesture = () => { if (!ctx || ctx.state !== 'running' || !primed) unlock(); };
    ['pointerdown', 'touchend', 'keydown', 'click'].forEach((e) => window.addEventListener(e, gesture, { capture: true, passive: true }));
    document.addEventListener('visibilitychange', () => {
      vis = document.visibilityState !== 'hidden';
      if (!ctx) return;
      if (!vis) { ctx.suspend().catch(() => {}); decks.forEach((d) => d.track && d.el.pause()); }
      else ctx.resume().then(() => { decks.forEach((d) => d.track && d.el.play().catch(() => {})); onRunning(); }).catch(() => {});
    });
  }

  const api = {
    unlock,
    ready,
    music,
    sting,
    sfx,
    vo: (key, opts) => playVo(key, opts),
    hasVo: (key) => !!(manifest && manifest[key]),
    voInfo: (key) => (manifest && manifest[key] ? { text: manifest[key].text, duration: manifest[key].duration, voice: manifest[key].voice } : null),
    manifestReady: () => loadManifest(),
    bark,
    stopVo,
    voUrl,
    preloadVo,
    ambient,
    emitter,
    setListener,
    setListenerCamera,
    update() { emitters.forEach(updateEmitter); },
    setVolumes(v) {
      for (const k of Object.keys(DEFAULTS)) if (v && typeof v[k] === 'number') vols[k] = clamp(v[k], 0, 1);
      try { localStorage.setItem(STORE, JSON.stringify(vols)); } catch (e) { /* storage blocked */ }
      applyVolumes();
    },
    getVolumes: () => ({ ...vols }),
    mute(on = true) { muted = !!on; applyVolumes(); },
    get state() { return curState; },
    get context() { return ctx; },
    debug: {
      errors,
      level() {
        if (!analyser) return -Infinity;
        analyser.getFloatTimeDomainData(levelBuf);
        let s = 0; for (const v of levelBuf) s += v * v;
        return 10 * Math.log10(s / levelBuf.length + 1e-12);
      },
      info() {
        return {
          ctx: ctx && ctx.state, state: curState, ambient: curAmbient, primed,
          deck: active && { track: active.track, t: +active.el.currentTime.toFixed(2), paused: active.el.paused },
          vo: vo.main && vo.main.key, bark: vo.bark && vo.bark.key,
          emitters: [...emitters].filter((e) => e.live).length, ducks: [...ducks.keys()],
          cache: bufCache.size, vols: { ...vols }, errors: errors.slice(-5),
        };
      },
      seek(t) { if (active) active.el.currentTime = t; },
      loopNow() { if (active) { active.looping = true; loopNext(false); } },
      listener,
      tracks: TRACKS, states: STATES, sfxNames: SFX_NAMES, beds: Object.keys(BEDS),
    },
  };
  return api;
}

export const audio = createAudio();
if (typeof window !== 'undefined') window.__audio = audio;
export default audio;
