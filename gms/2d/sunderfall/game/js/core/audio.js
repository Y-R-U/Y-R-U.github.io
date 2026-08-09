/**
 * SUNDERFALL audio. Everything is synthesised — there is not one sample in the build.
 *
 *   const audio = await createAudio(ctx);   // main.js does this and assigns ctx.audio
 *
 * Design in one paragraph: one-shots are baked to mono Float32 buffers by hand-written
 * DSP (`audio/dsp.js`) and played through a fixed pool of voices with priority stealing
 * and per-key rate limiting, so a collapsing building costs one buffer source per audible
 * impact instead of a graph per brick. Music and ambience are live generative graphs on
 * their own buses, ducked under big hits and never pitch-bent by hitstop. Nothing blocks
 * and nothing throws: if the AudioContext never starts, every call here is a cheap no-op
 * and the game is exactly as playable, only silent.
 *
 * Full API, key convention and fallback rules are documented in HANDOFF.md (C1-audio).
 */

import { createBank } from './audio/bank.js';
import { createResolver, MAT_SFX } from './audio/keys.js';
import { createMix, DEFAULT_VOLUMES } from './audio/mix.js';
import { createVoices } from './audio/voices.js';
import { createAmbience, AMBIENT_SFX } from './audio/ambience.js';
import { createMusic } from './audio/music.js';
import { MATERIAL_SFX, WORLD_SFX } from './audio/sfx-materials.js';
import { CREATURE_SFX, PLAYER_SFX } from './audio/sfx-creatures.js';
import { SPELL_SFX } from './audio/sfx-spells.js';
import { UI_SFX } from './audio/sfx-ui.js';
import { makeRng, analyse } from './audio/dsp.js';

/** Baked first, in this order, during idle time after the context starts. */
const WARM = [
  'player.step.dirt', 'player.step.stone', 'player.step.wood', 'player.step.leaf',
  'player.jump', 'player.land', 'player.dash', 'player.hurt', 'player.cast',
  'spell.emberbolt.cast', 'spell.emberbolt.impact',
  'stone_crack', 'stone_break', 'stone_debris', 'wood_crack', 'wood_break', 'wood_debris',
  'leaf_rustle', 'leaf_burst', 'leaf_fall', 'dirt_crack', 'dirt_break', 'dirt_fall',
  'flesh_hit', 'flesh_burst', 'impact.soft', 'impact.hard', 'impact.heavy',
  'ui.click', 'ui.hover', 'ui.pickup', 'ui.xp', 'ui.circle_ready',
  'enemy.husk.attack', 'enemy.husk.hit', 'enemy.husk.death', 'enemy.husk.tell',
  'glass_crack', 'glass_break', 'glass_tinkle', 'rock_crack', 'rock_break', 'rock_debris',
  'metal_dent', 'metal_clang', 'bone_crack', 'bone_clatter',
  'explosion.small', 'collapse.start', 'collapse.land', 'whoosh.small',
];

export async function createAudio(ctx) {
  const storage = (() => { try { return window.localStorage; } catch { return null; } })();

  let saved = {};
  try { saved = JSON.parse(storage?.getItem('sunderfall.audio') || '{}') || {}; } catch { /* ignore */ }

  // Raw float buffers are only an intermediate on the way to an AudioBuffer, so their
  // cache is small; the AudioBuffer cache is the one that has to be lived with.
  const bank = createBank({ budgetBytes: 3 * 1024 * 1024, abBudgetBytes: 20 * 1024 * 1024 });
  bank.defineAll(MATERIAL_SFX);
  bank.defineAll(WORLD_SFX);
  bank.defineAll(CREATURE_SFX);
  bank.defineAll(PLAYER_SFX);
  bank.defineAll(SPELL_SFX);
  bank.defineAll(UI_SFX);
  bank.defineAll(AMBIENT_SFX);

  const keys = createResolver((k) => bank.has(k));
  const rng = makeRng(0x5EED);

  let actx = null, mix = null, voices = null, amb = null, music = null;
  let timer = 0, started = false, failed = false;
  let cpuMs = 0;
  let lastTs = 1, tsCool = 0;

  // Desired state set before the first gesture, replayed when audio starts.
  const want = { ambience: null, music: null, intensity: 0, intensitySet: false, boss: 0, wind: 1 };

  const listener = { x: 0, y: 0, halfW: 960, auto: true };

  const volumes = {};
  for (const k in DEFAULT_VOLUMES) volumes[k] = typeof saved[k] === 'number' ? saved[k] : DEFAULT_VOLUMES[k];
  let muted = !!saved.muted;

  /* ---------------------------------------------------------------- *
   * Lifecycle
   * ---------------------------------------------------------------- */

  function makeContext() {
    if (actx || failed) return actx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { failed = true; return null; }
    try {
      actx = new AC({ latencyHint: 'interactive' });
    } catch (e) {
      console.warn('[audio] no AudioContext:', e);
      failed = true;
      return null;
    }
    mix = createMix(actx, { storage, volumes, muted });
    voices = createVoices(actx, mix, bank, { sfxCap: 40, uiCap: 8, ambCap: 10 });
    amb = createAmbience(actx, mix, voices, rng);
    music = createMusic(actx, mix, 0xB0A7);
    voices.setListener(listener.x, listener.y, listener.halfW);
    // Only the hot set is pre-baked. Baking all 231 keys costs 2.5 s of CPU and
    // produces ~75 MB of float, most of which the LRU would immediately throw away;
    // a cold key bakes in 1-4 ms on first use and then stays resident. Scenes that
    // know what they need should call audio.preload() at load time.
    bank.warmup(WARM);
    return actx;
  }

  function startScheduler() {
    if (timer) return;
    timer = setInterval(schedTick, 25);
  }

  function schedTick() {
    if (!actx) return;
    const t0 = performance.now();
    const now = actx.currentTime;

    if (listener.auto) pollCamera();
    pollHitstop();

    try { music && music.tick(now); } catch (e) { console.warn('[audio] music tick', e); }
    try { amb && amb.tick(now); } catch (e) { console.warn('[audio] amb tick', e); }
    voices && voices.update();
    // A small slice here so warming still progresses on browsers without idle
    // callbacks; the bulk happens in warmIdle() where it costs the game nothing.
    if (!api.warmDone && bank.warmStep(actx, 1.2) === 0) api.warmDone = true;

    cpuMs += (performance.now() - t0 - cpuMs) * 0.05;
  }

  /** Bake the rest of the bank in genuine idle time. Never inside a frame. */
  function warmIdle() {
    if (api.warmDone || !actx) return;
    const ric = window.requestIdleCallback;
    if (!ric) return;
    ric((deadline) => {
      const budget = Math.min(9, Math.max(2, deadline.timeRemaining() - 2));
      if (bank.warmStep(actx, budget) === 0) api.warmDone = true;
      warmIdle();
    }, { timeout: 900 });
  }

  function pollCamera() {
    const R = ctx && ctx.R;
    if (!R || !R.cam) return;
    const view = ctx.view;
    const halfW = (view && view.worldW ? view.worldW : (R.worldW || 1920)) * 0.5 / (R.cam.zoom || 1);
    listener.x = R.cam.x || 0;
    listener.y = R.cam.y || 0;
    listener.halfW = halfW;
    voices.setListener(listener.x, listener.y, halfW);
  }

  /** Catch every hitstop, whoever caused it, without patching another module. */
  function pollHitstop() {
    const fx = ctx && ctx.R && ctx.R.fx;
    if (!fx || typeof fx.getTimeScale !== 'function') return;
    const ts = fx.getTimeScale();
    if (ts < 0.85 && lastTs >= 0.85 && performance.now() > tsCool) {
      tsCool = performance.now() + 40;
      voices.setTimeScale(ts, 0.09);
    }
    lastTs = ts;
  }

  function applyWanted() {
    if (want.ambience) amb.set(want.ambience, 1.2);
    amb.setWind(want.wind, 0.5);
    if (want.music) music.set(want.music, { immediate: false });
    // only hand control to the intensity curve if the game actually drives it
    if (want.intensitySet) music.setIntensity(want.intensity, true);
    music.setBossPhase(want.boss);
  }

  async function resume() {
    if (failed) return false;
    if (!makeContext()) return false;
    try {
      if (actx.state !== 'running') await actx.resume();
    } catch { /* gesture required, try again next time */ }
    if (actx.state !== 'running') return false;
    if (!started) {
      started = true;
      api.ready = true;
      applyWanted();
      startScheduler();
      warmIdle();
      detachGestures();
    }
    return true;
  }

  const GESTURES = ['pointerdown', 'touchstart', 'keydown', 'mousedown'];
  const onGesture = () => { resume(); };
  function detachGestures() {
    for (const g of GESTURES) window.removeEventListener(g, onGesture, true);
  }
  for (const g of GESTURES) window.addEventListener(g, onGesture, { capture: true, passive: true });

  document.addEventListener('visibilitychange', () => {
    if (!actx || !started) return;
    if (document.hidden) { try { actx.suspend(); } catch { /* ignore */ } }
    else { try { actx.resume(); } catch { /* ignore */ } }
  });

  /* ---------------------------------------------------------------- *
   * Public API
   * ---------------------------------------------------------------- */

  const api = {
    stub: false,
    ready: false,
    warmDone: false,
    get available() { return !failed; },
    get context() { return actx; },
    get state() { return actx ? actx.state : 'none'; },

    /* -- one-shots -- */

    /**
     * @param key  see HANDOFF for the convention; unknown keys fall back, never silence
     * @param o    { x, y, volume, pitch, variation, pan, prio, delay, send, force, mat }
     * @returns    voice id (>0) or 0 if not played
     */
    sfx(key, o) {
      if (!started) return 0;
      let k = key;
      if (o && o.mat !== undefined && (key === 'player.step' || key === 'step')) {
        k = 'player.step.' + (MAT_SFX[o.mat] ? MAT_SFX[o.mat].step : 'dirt');
      }
      const r = keys.resolve(k);
      return r ? voices.play(r, o) : 0;
    },

    play(key, o) { return api.sfx(key, o); },

    /** Material shorthand: audio.mat(MATERIAL.GLASS, 'break', {x, y}) */
    mat(material, event, o) {
      if (!started) return 0;
      const k = keys.matKey(material, event || 'break');
      return k ? voices.play(k, o) : 0;
    },

    /** Footstep for an entity: audio.step(e) reads e.groundMat and e.x/e.y. */
    step(e, o) {
      if (!started) return 0;
      const m = typeof e === 'number' ? e : (e && e.groundMat);
      const k = 'player.step.' + (MAT_SFX[m] ? MAT_SFX[m].step : 'dirt');
      const opts = o || (typeof e === 'object' && e ? { x: e.x, y: e.y } : undefined);
      return voices.play(bank.has(k) ? k : 'player.step', opts);
    },

    /** Sustained sound (fire, acid, a channelled spell). Returns a handle. */
    loop(key, o) {
      if (!started) return DEAD_LOOP;
      const r = keys.resolve(key);
      return r ? voices.loop(r, o) : DEAD_LOOP;
    },

    stop(id, fade) { if (started) voices.stop(id, fade); },
    stopKey(key, fade) { if (started) voices.stopKey(keys.resolve(key), fade); },
    stopAll(fade) { if (started) voices.stopAll(fade); },

    /* -- music -- */

    /** @param name 'explore'|'tension'|'combat'|'boss'|'victory'|'menu'|null */
    music(name, o) {
      want.music = name || null;
      if (started) music.set(name, o || {});
    },
    stopMusic(fade = 2) { want.music = null; if (started) music.stop(fade); },
    setIntensity(v, immediate) {
      want.intensity = v; want.intensitySet = true;
      if (started) music.setIntensity(v, immediate);
    },
    combat(on) { api.setIntensity(on ? 1 : 0); },
    setBossPhase(v) { want.boss = v; if (started) music.setBossPhase(v); },
    get musicState() { return started ? music.state : (want.music || 'silent'); },
    musicStates() { return started ? music.states() : ['explore', 'tension', 'combat', 'boss', 'victory', 'menu']; },

    /* -- ambience -- */

    /** @param id 'thornmere'|'sunderwood'|'ruinreach'|'glyphglade'|null */
    ambience(id, fade = 2.5) {
      want.ambience = id || null;
      if (started) amb.set(id, fade);
    },
    setWind(mul, fade) { want.wind = mul; if (started) amb.setWind(mul, fade); },
    get ambienceId() { return started ? amb.current : (want.ambience || ''); },
    ambiences() { return ['thornmere', 'sunderwood', 'ruinreach', 'glyphglade']; },
    /** 'village'|'forest'|'glade'|'ruins'|'none' — normally set by ambience() */
    setRoom(name, fade) { if (started) mix.setRoom(name, fade); },

    /* -- mix -- */

    /** setVolume('music', 0.4) or setVolume(0.4) for master. */
    setVolume(name, v) {
      if (typeof name === 'number') { v = name; name = 'master'; }
      if (!(name in volumes)) return false;
      volumes[name] = Math.max(0, Math.min(1, +v || 0));
      if (started) mix.setVolume(name, volumes[name]);
      else persist();
      return true;
    },
    getVolume(name) { return volumes[name] ?? 0; },
    get volumes() { return { ...volumes }; },
    volumeNames() { return Object.keys(DEFAULT_VOLUMES); },

    setMuted(b) {
      muted = !!b;
      if (started) mix.setMuted(muted); else persist();
      return muted;
    },
    toggleMute() { return api.setMuted(!muted); },
    get muted() { return muted; },

    /** Pull music + ambience down under a big hit. amount 0..1. */
    duck(amount = 0.5, seconds = 0.45) { if (started) mix.duck(amount, seconds); },

    /** Call alongside R.fx.timeScale if you want to be explicit; polled automatically. */
    hitstop(scale = 0.1, seconds = 0.08) { if (started) voices.setTimeScale(scale, seconds); },

    setListener(x, y, halfWidth) {
      listener.auto = false;
      listener.x = x; listener.y = y;
      if (halfWidth) listener.halfW = halfWidth;
      if (started) voices.setListener(x, y, listener.halfW);
    },
    followCamera(on = true) { listener.auto = !!on; },

    /* -- lifecycle -- */

    resume,
    unlock: resume,
    suspend() { if (actx) { try { actx.suspend(); } catch { /* ignore */ } } },

    /** Optional. The internal 40 Hz scheduler runs without it; this only refines the listener. */
    update() { if (started && listener.auto) pollCamera(); },

    dispose() {
      if (timer) { clearInterval(timer); timer = 0; }
      detachGestures();
      try { voices && voices.stopAll(0.05); } catch { /* ignore */ }
      try { music && music.dispose(); } catch { /* ignore */ }
      try { amb && amb.stop(0.2); } catch { /* ignore */ }
      setTimeout(() => { try { actx && actx.close(); } catch { /* ignore */ } }, 400);
      started = false;
      api.ready = false;
    },

    /* -- introspection / test hooks -- */

    /**
     * Bake these keys during idle time so their first play has no bake cost.
     * Accepts raw or resolvable keys; unknown ones are skipped. Cheap to over-ask.
     */
    preload(keyList) {
      const resolved = [];
      for (const k of keyList || []) {
        const r = keys.resolve(k);
        if (r && bank.has(r)) resolved.push(r);
      }
      bank.warmup(resolved);
      api.warmDone = false;
      warmIdle();
      return resolved.length;
    },

    keys() { return bank.keys(); },
    has(key) { return bank.has(key); },
    resolve(key) { return keys.resolve(key); },
    missingKeys() { return [...keys.missing]; },
    recipe(key) { return bank.get(key); },

    /** Bake a key to a raw Float32Array. Works with no AudioContext at all. */
    render(key, variant = 0) { return bank.render(keys.resolve(key) || key, variant); },
    /** Peak / RMS / centroid / clipping for a key. The harness lives on this. */
    analyse(key, variant = 0) { return bank.inspect(keys.resolve(key) || key, variant); },
    analyseBuffer(data, sr) { return analyse(data, sr); },

    get stats() {
      return {
        state: actx ? actx.state : 'none',
        started,
        voices: started ? voices.count : 0,
        cap: started ? voices.cap : 0,
        keys: bank.size,
        cached: bank.cached,
        bytes: bank.bytes,
        genMs: Math.round(bank.genMs * 10) / 10,
        genCount: bank.genCount,
        cpuMs: Math.round(cpuMs * 100) / 100,
        peak: started ? mix.peak() : 0,
        music: started ? music.state : 'silent',
        bpm: started ? music.bpm : 0,
        ambience: started ? amb.current : '',
        room: started ? mix.room : '',
        missing: keys.missing.size,
      };
    },

    // escape hatches for the test harness; not part of the contract other modules use
    get _internals() { return { actx, mix, voices, amb, music, bank, keys }; },
  };

  function persist() {
    try { storage?.setItem('sunderfall.audio', JSON.stringify({ ...volumes, muted })); } catch { /* ignore */ }
  }

  /* ---------------------------------------------------------------- *
   * Opportunistic bus hooks.
   * Only events nothing else is documented to sound. Every one is rate-limited,
   * so a duplicate call from another module is swallowed rather than doubled.
   * Set audio.autoBus = false before the first event to disable.
   * ---------------------------------------------------------------- */

  api.autoBus = true;
  const bus = ctx && ctx.bus;
  if (bus && bus.on) {
    const on = (name, fn) => bus.on(name, (p) => { if (api.autoBus && started) { try { fn(p || {}); } catch (e) { console.warn('[audio] bus', name, e); } } });

    on('sim:hitstop', (p) => {
      voices.setTimeScale(0.08, Math.max(0.04, p.seconds || 0.06));
      mix.duck(0.35, 0.3);
    });
    on('player:damage', (p) => { api.sfx('player.hurt', { x: p.x, y: p.y }); mix.duck(0.25, 0.25); });
    on('player:died', (p) => { api.sfx('player.death', { x: p.x, y: p.y, force: true }); music.stop(1.5); amb.setLevel(0.4, 2); });
    on('player:level', () => api.sfx('ui.levelup'));
    on('spell:learn', () => api.sfx('ui.spell_learn'));
    on('spell:levelup', () => api.sfx('ui.spell_levelup'));
    on('pickup', (p) => api.sfx(p.tag === 'shard' ? 'ui.pickup_shard' : 'ui.pickup'));
    on('enemy:died', (p) => api.sfx('enemy.' + (p.tag || 'husk') + '.death', { x: p.x, y: p.y }));
  }

  const DEAD_LOOP = {
    id: 0, alive: false,
    volume() { return this; }, pitch() { return this; }, move() { return this; }, stop() { return this; },
  };

  // If the page already has a gesture behind it (a reload mid-session), this succeeds
  // immediately; otherwise it fails silently and the listeners above take over.
  resume();

  return api;
}

export default createAudio;
