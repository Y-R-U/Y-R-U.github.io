/**
 * SILT — audio. Contract E in docs/CONTRACTS.md.
 *
 *   const A = createAudio();
 *   await A.unlock();               // first gesture
 *   A.music('dune', { fade: 1.5 }); // loops, crossfades
 *   A.sfx('chain', 1800);           // optional magnitude
 *   A.duck(0.5, 700);
 *   A.setVolume(0.6, 0.9);
 *
 * Nothing here may ever throw. Before unlock() every call is a no-op; after it,
 * a missing or undecodable music file degrades to silence and the game runs on.
 */

import { VOICES, MAG, THROTTLE, PRIORITY, makeIR } from './synth.js';

const ASSETS = new URL('../../assets/audio/', import.meta.url);

/** Biome beds. A track id with no file on disk is simply silent. */
export const TRACKS = {
  dune:  'dune.mp3',
  abyss: 'abyss.mp3',
  kiln:  'kiln.mp3',
  zen:   'zen.mp3',
};

const MAX_VOICES = 28;

export function createAudio(opts = {}) {
  let ctx = null;
  let ready = false;      // unlocked and running
  let dead = false;       // no Web Audio at all — permanent no-op
  let master, sfxBus, musicBus, duckGain, verbIn, verbOut;

  let volMusic = opts.music != null ? opts.music : 0.55;
  let volSfx   = opts.sfx   != null ? opts.sfx   : 0.9;

  const decks = [];       // two crossfade decks
  let active = 0;         // index of the deck currently up
  let curId = null;       // track playing (or fading in)
  let pending = null;     // requested before unlock
  let token = 0;          // guards async decode races
  const cache = new Map();// trackId -> Promise<AudioBuffer|null>

  const lastAt = Object.create(null);
  let voices = 0;
  let duckUntil = 0;

  function build() {
    master = ctx.createGain();
    master.gain.value = 1;
    master.connect(ctx.destination);

    sfxBus = ctx.createGain();
    sfxBus.gain.value = volSfx;
    sfxBus.connect(master);

    musicBus = ctx.createGain();
    musicBus.gain.value = volMusic;
    musicBus.connect(master);

    duckGain = ctx.createGain();
    duckGain.gain.value = 1;
    duckGain.connect(musicBus);

    // shared reverb send — small space, keeps the granular cues from sounding
    // like they were recorded inside a phone
    try {
      const conv = ctx.createConvolver();
      conv.buffer = makeIR(ctx, 1.4, 3.4);
      verbOut = ctx.createGain();
      verbOut.gain.value = 0.5;
      verbIn = ctx.createGain();
      verbIn.gain.value = 0.32;
      verbIn.connect(conv); conv.connect(verbOut); verbOut.connect(master);
    } catch (e) {
      verbIn = null;
    }

    for (let i = 0; i < 2; i++) {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(duckGain);
      decks.push({ gain: g, src: null, id: null });
    }
  }

  /* ------------------------------------------------------------------ */

  async function unlock() {
    if (dead) return false;
    if (ready && ctx && ctx.state === 'running') return true;
    try {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) { dead = true; return false; }
        ctx = new AC({ latencyHint: 'interactive' });
        build();
        try {
          document.addEventListener('visibilitychange', onVisibility, { passive: true });
        } catch (e) { /* no document — fine */ }
      }
      if (ctx.state !== 'running') { try { await ctx.resume(); } catch (e) {} }
      // iOS wants an actual buffer played from inside the gesture
      const b = ctx.createBuffer(1, 1, ctx.sampleRate);
      const s = ctx.createBufferSource();
      s.buffer = b; s.connect(ctx.destination); s.start(0);
      ready = ctx.state === 'running';
      if (ready && pending !== null) {
        const id = pending; pending = null;
        music(id, { fade: 1.2 });
      }
      return ready;
    } catch (e) {
      dead = true;
      return false;
    }
  }

  function onVisibility() {
    if (!ctx || dead) return;
    try {
      if (document.hidden) { master.gain.setTargetAtTime(0, ctx.currentTime, 0.08); }
      else { master.gain.setTargetAtTime(1, ctx.currentTime, 0.12); }
    } catch (e) {}
  }

  /* ---------------------------------- sfx --------------------------- */

  function sfx(name, arg) {
    if (!ready || dead) return;
    const voice = VOICES[name];
    if (!voice) return;
    try {
      const now = ctx.currentTime;
      const gap = THROTTLE[name] || 0.03;
      if (lastAt[name] != null && now - lastAt[name] < gap) return;

      // load shedding: when a lot is on fire, drop the cheap cues first
      const pri = PRIORITY[name] || 1;
      if (voices > MAX_VOICES && pri < 3) return;

      let mag, pan = 0, boost = 1;
      if (arg != null && typeof arg === 'object') {
        mag = arg.mag; pan = arg.pan || 0; boost = arg.gain != null ? arg.gain : 1;
      } else {
        mag = arg;
      }
      const m = (MAG[name] || (() => 0.5))(mag);

      let out = sfxBus;
      if (boost !== 1 || pan) {
        const g = ctx.createGain();
        g.gain.value = boost;
        if (pan && ctx.createStereoPanner) {
          const p = ctx.createStereoPanner();
          p.pan.value = Math.max(-1, Math.min(1, pan));
          g.connect(p); p.connect(sfxBus);
        } else {
          g.connect(sfxBus);
        }
        out = g;
      }

      lastAt[name] = now;
      voices += pri;
      setTimeout(() => { voices = Math.max(0, voices - pri); }, 900);
      voice(ctx, out, verbIn, now + 0.002, m);
    } catch (e) { /* audio must never take the game down */ }
  }

  /* --------------------------------- music -------------------------- */

  function load(id) {
    if (cache.has(id)) return cache.get(id);
    const file = TRACKS[id] || (String(id).includes('.') ? String(id) : null);
    const p = (async () => {
      if (!file || !ctx) return null;
      try {
        const res = await fetch(new URL(file, ASSETS).href, { cache: 'force-cache' });
        if (!res.ok) return null;
        const bytes = await res.arrayBuffer();
        return await new Promise((resolve) => {
          // callback form: Safari still needs it
          const ok = (buf) => resolve(buf || null);
          const bad = () => resolve(null);
          try {
            const r = ctx.decodeAudioData(bytes, ok, bad);
            if (r && typeof r.then === 'function') r.then(ok, bad);
          } catch (e) { resolve(null); }
        });
      } catch (e) { return null; }
    })();
    cache.set(id, p);
    return p;
  }

  function fadeOut(deck, fade, t) {
    if (!deck.src) return;
    const src = deck.src, g = deck.gain;
    try {
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(g.gain.value, t);
      g.gain.linearRampToValueAtTime(0, t + fade);
      src.stop(t + fade + 0.05);
    } catch (e) {}
    deck.src = null;
    deck.id = null;
  }

  async function music(trackId, o = {}) {
    if (dead) return;
    const fade = o.fade != null ? Math.max(0, o.fade) : 1.2;
    if (!ready) { pending = trackId || null; return; }
    try {
      if (!trackId) {                       // stop everything
        curId = null;
        const t = ctx.currentTime;
        token++;
        for (const d of decks) fadeOut(d, fade || 0.4, t);
        return;
      }
      if (trackId === curId) return;
      curId = trackId;
      const mine = ++token;

      const buf = await load(trackId);
      if (mine !== token) return;           // superseded while decoding
      const t = ctx.currentTime;

      const old = decks[active];
      if (!buf) {                           // missing file: silence, no error
        fadeOut(old, fade || 0.4, t);
        return;
      }

      active = 1 - active;
      const deck = decks[active];
      fadeOut(deck, 0.02, t);               // reclaim if it was still busy

      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.loopStart = 0;
      src.loopEnd = buf.duration;
      src.connect(deck.gain);
      deck.src = src;
      deck.id = trackId;

      deck.gain.gain.cancelScheduledValues(t);
      deck.gain.gain.setValueAtTime(0, t);
      deck.gain.gain.linearRampToValueAtTime(1, t + (fade || 0.01));
      src.start(t);

      fadeOut(old, fade || 0.01, t);
    } catch (e) { /* silence beats a crash */ }
  }

  /* --------------------------------- misc --------------------------- */

  function duck(amount = 0.5, ms = 600) {
    if (!ready || dead) return;
    try {
      const a = Math.max(0, Math.min(1, amount));
      const t = ctx.currentTime;
      const end = t + Math.max(0.05, ms / 1000);
      if (end < duckUntil) return;          // a deeper duck is already running
      duckUntil = end;
      const g = duckGain.gain;
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(1 - a, t + 0.05);
      g.setValueAtTime(1 - a, Math.max(t + 0.05, end - 0.35));
      g.linearRampToValueAtTime(1, end);
    } catch (e) {}
  }

  function setVolume(music_, sfx_) {
    if (music_ != null) volMusic = Math.max(0, Math.min(1, music_));
    if (sfx_ != null) volSfx = Math.max(0, Math.min(1, sfx_));
    if (!ctx || dead) return;
    try {
      const t = ctx.currentTime;
      musicBus.gain.setTargetAtTime(volMusic, t, 0.05);
      sfxBus.gain.setTargetAtTime(volSfx, t, 0.05);
    } catch (e) {}
  }

  return {
    unlock,
    music,
    sfx,
    duck,
    setVolume,
    /** Debug only — never load-bearing for the game. */
    state() {
      return {
        ready, dead, curId, volMusic, volSfx, voices,
        ctx: ctx ? ctx.state : null,
        tracks: Object.keys(TRACKS),
      };
    },
    /** Preload beds after unlock so the first crossfade is not silent. */
    preload(ids) {
      if (!ctx || dead) return;
      (ids || Object.keys(TRACKS)).forEach((id) => { try { load(id); } catch (e) {} });
    },
  };
}

export default createAudio;
