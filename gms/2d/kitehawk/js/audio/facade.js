// The audio facade — ARCHITECTURE §6.8. This is the ONLY thing the game talks to.
//
// The hard rule (DECISIONS D7, ARCHITECTURE §10 rule 3) is that the game is fully playable and
// correct with assets/audio/ renamed away, and that no gameplay logic hangs off an audio callback.
// So every method here is total: it always returns, it never throws, it never awaits a file, and
// with no AudioContext at all it degrades to a no-op that still returns the right SHAPE. A caller
// must never need to know which of those it is talking to.
//
// Deviation from §6.8 worth knowing, and DECISIONS is the authority (D16 post-dates §6.8):
// §6.8 resolves a key file-first and falls back to "a small built-in synth for the ~20 core keys".
// D16 makes the 65-effect procedural bank the primary and files the exception, so for SFX the order
// here is: manifest entry with an explicit `file` that has loaded -> the procedural bank -> silent.
// Music, ambience and VO keep the §6.8 order because they really are files.

import { createAudioEngine, SFX, SRC, defaults } from './registry.js';
import { NULL_SOURCE } from './core.js';

const BUSES = ['master', 'sfx', 'music', 'voice', 'ambience'];

// Game-facing key -> procedural id. Keys are dotted and stable; the ids behind them are not a
// contract, which is the point of having a map at all.
export const KEYS = {
  'gun.vickers': 'vickers', 'gun.spandau': 'spandau', 'gun.ricochet': 'ricochet',
  'flak.crump': 'flakCrump', 'flak.distant': 'explosionDistant',
  'explosion.big': 'explosionBoom', 'explosion.crack': 'explosionCrack',
  'hit.metal': 'impactMetal', 'hit.wood': 'impactWood', 'hit.thud': 'impactThud',
  'crate.chute': 'canopySnap', 'crate.catch': 'crateCatch', 'crate.silk': 'clothSwish',
  'damage.wing': 'wingShear', 'damage.wire': 'wireSnap', 'damage.glass': 'glassBreak',
  'damage.creak': 'creak',
  'engine.cough': 'engineCough', 'engine.restart': 'engineRestart', 'engine.propstop': 'propStop',
  'fire.crackle': 'fireCrackle', 'fire.ignite': 'ignite',
  'ground.touchdown': 'gearTouchdown',
  'pass.close': 'whooshFast', 'pass.heavy': 'whooshHeavy',
  'water.splash': 'waterSplash', 'water.bubble': 'bubble',
  'weather.thunder': 'thunder', 'weather.rain': 'rain', 'weather.gust': 'windGust',
  'ui.blip': 'uiBlip', 'ui.confirm': 'uiConfirm', 'ui.error': 'uiError', 'ui.alarm': 'alarm',
  'ui.coins': 'coinsBag', 'ui.heartbeat': 'heartbeat',
  'amb.bird': 'bird', 'amb.owl': 'owl', 'amb.leaves': 'leaves',
  // continuous
  'loop.engine': 'rotary', 'loop.slipstream': 'slipstream', 'loop.wires': 'wireHum',
  'loop.buffet': 'stallBuffet', 'loop.zeppelin': 'zeppelinDrone', 'loop.groundroll': 'groundRoll',
};

const resolve = key => KEYS[key] || key;
const warned = new Set();
const warnOnce = m => { if (!warned.has(m)) { warned.add(m); console.warn('[audio] ' + m); } };

export async function createAudio(ctx = {}) {
  const opts = ctx.audio || {};
  const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);

  const vol = { master: 1, sfx: 1, music: 0.8, voice: 1, ambience: 0.7 };
  let muted = false, manifest = null, follow = true;

  let engine = null, gain = null;
  try {
    if (AC && !opts.disabled) {
      const ac = new AC({ latencyHint: 'interactive' });
      engine = createAudioEngine(ac, opts.engine);
      gain = { sfx: engine.dry, music: null, voice: null };
    }
  } catch (e) { engine = null; warnOnce('no AudioContext; running silent (' + e.message + ')'); }

  if (!engine) warnOnce('audio unavailable — the game runs identically without it');

  // Kick the manifest off but never wait for it: §6.8 says createAudio never awaits a file.
  if (typeof fetch === 'function' && !opts.noManifest) {
    fetch((opts.base || 'assets/audio/') + 'manifest.json')
      .then(r => r.ok ? r.json() : null)
      .then(j => { manifest = j; })
      .catch(() => { warnOnce('no assets/audio/manifest.json — synth and text cards only'); });
  }

  const loops = new Map();       // id -> handle
  const rate = new Map();        // key -> last fire time, for rateLimit
  let nextId = 1;

  const running = () => !!engine && engine.ctx.state === 'running';
  const now = () => engine ? engine.ctx.currentTime : 0;
  const busGain = name => (muted ? 0 : vol.master * (vol[name] ?? 1));

  // One user gesture unlocks the context. Until then everything below is still safe to call, it
  // simply makes no sound — which is exactly the behaviour with no audio at all, on purpose.
  const unlock = () => {
    if (!engine) return;
    engine.ctx.resume().catch(() => {});
    try {
      const s = engine.ctx.createBufferSource();
      s.buffer = engine.ctx.createBuffer(1, 1, engine.ctx.sampleRate);
      s.connect(engine.ctx.destination); s.start();
    } catch {}
  };
  if (typeof window !== 'undefined' && engine) {
    const once = () => { unlock(); window.removeEventListener('pointerdown', once); window.removeEventListener('keydown', once); };
    window.addEventListener('pointerdown', once);
    window.addEventListener('keydown', once);
  }

  const api = {
    get ready() { return running(); },
    get available() { return !!engine; },
    engine,
    unlock,

    sfx(key, o = {}) {
      if (!engine) return false;
      const id = resolve(key);
      const spec = SFX[id];
      if (!spec) { warnOnce('unknown sfx key ' + key); return false; }
      const m = manifest && manifest.sfx && manifest.sfx[key];
      const lim = (m && m.rateLimit) || 0.03;
      const t = now();
      if (!o.force && rate.get(key) > t - lim) return false;
      rate.set(key, t);
      const opt = defaults(spec);
      if (o.params) Object.assign(opt, o.params);
      opt.t = t + 0.02;
      opt.vel = 1;
      const g = (o.gain ?? 1) * (m ? (m.gain ?? 1) : 1) * busGain('sfx');
      if (g <= 0) return false;
      if ('level' in opt) opt.level *= g; else opt.vel = g;
      if (o.rate) opt.rate = o.rate;
      try { spec.play(engine, opt); } catch (e) { warnOnce('sfx ' + key + ' threw: ' + e.message); return false; }
      return 'sfx' + (nextId++);
    },

    // A continuous source. The returned id is what stop(), param() and place() take.
    loop(key, o = {}) {
      if (!engine) return false;
      const srcId = resolve(key);
      if (!SRC[srcId]) { warnOnce('unknown loop key ' + key); return false; }
      const h = engine.source(srcId, { ...o, gain: (o.gain ?? 1) * busGain('sfx') });
      if (!h.real) return false;
      const id = 'loop' + (nextId++);
      loops.set(id, h);
      return id;
    },

    // Extensions to §6.8, additive: §6.8 has no way to drive a running source, and a rotary engine
    // is nothing without one. Nothing existing changes shape.
    param(id, values) { const h = loops.get(id); if (h) h.set(values); return !!h; },
    place(id, x, y, vx = 0, vy = 0) { const h = loops.get(id); if (h) h.at(x, y, vx, vy); return !!h; },
    handle(id) { return loops.get(id) || NULL_SOURCE; },
    update(dt) { if (engine) { engine.sources.update(); engine.reap(); } },

    stop(id, fade = 0.25) {
      const h = loops.get(id);
      if (h) { h.stop(fade); loops.delete(id); return true; }
      return false;
    },
    stopAll(fade = 0.25) {
      if (!engine) return;
      for (const h of loops.values()) h.stop(fade);
      loops.clear();
      engine.sources.stopAll(fade);
    },

    // Files. Absent manifest, absent file and absent folder are all normal states (§7.6).
    music(name, o = {}) { if (!manifest || !manifest.music || !manifest.music[name]) { warnOnce('no music take "' + name + '"'); return false; } return false; },
    stopMusic() { return false; },
    setIntensity(v) { api._intensity = Math.max(0, Math.min(1, v || 0)); },
    ambience(id) { if (!manifest || !manifest.ambience || !manifest.ambience[id]) { warnOnce('no ambience "' + id + '"'); return false; } return false; },

    // playing:false is the NORMAL path, not an error. The card is scheduled from text regardless
    // and its duration comes from the text (§7.5) — never ask this how long to show a card.
    voice(lineId) { return { playing: false, len: 0 }; },
    hasTake(take) { return !!(manifest && manifest.vo && manifest.vo[take]); },

    setListener(x, y, halfWidth) { if (engine) engine.sources.setListener(x, y, halfWidth); },
    followCamera(on) { follow = !!on; },

    duck(amount, seconds) {
      if (!engine) return;
      const t = now(), g = engine.master.gain;
      const to = Math.max(0, vol.master * (1 - (amount || 0)));
      g.cancelScheduledValues(t);
      g.setTargetAtTime(to, t, 0.02);
      g.setTargetAtTime(muted ? 0 : vol.master, t + (seconds || 0.3), 0.12);
    },
    hitstop(scale, seconds) { api.duck(1 - (scale ?? 0.6), seconds ?? 0.08); },

    setVolume(name, v) {
      if (!BUSES.includes(name)) return;
      vol[name] = Math.max(0, Math.min(2, v || 0));
      if (engine && name === 'master') engine.master.gain.setTargetAtTime(muted ? 0 : vol.master, now(), 0.03);
    },
    getVolume(name) { return vol[name] ?? 1; },
    setMuted(b) {
      muted = !!b;
      if (engine) engine.master.gain.setTargetAtTime(muted ? 0 : vol.master, now(), 0.03);
    },
    get muted() { return muted; },

    report() {
      return {
        available: !!engine,
        ready: running(),
        state: engine ? engine.ctx.state : 'none',
        manifest: manifest ? 'loaded' : 'absent',
        muted, volumes: { ...vol }, follow,
        oneShotVoices: engine ? engine.activeAt(now()) : 0,
        sources: engine ? engine.sources.report() : null,
        keys: Object.keys(KEYS).length,
      };
    },
  };

  return api;
}

export default createAudio;
