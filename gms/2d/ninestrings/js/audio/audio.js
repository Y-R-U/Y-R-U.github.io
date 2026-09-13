// NINE STRINGS - procedural audio. CONTRACTS section 11, DECISIONS D6.
//
// Zero files. Every sound is oscillators + one shared noise buffer + a reverb
// impulse synthesised into an AudioBuffer at unlock.
//
// The whole file is built around one constraint: a survivors-like fires dozens
// of sounds a second and a naive node-per-hit implementation is both a frame
// -rate bug and a wall of static. So:
//   - voices are POOLED, and the three nodes that touch the bus (gain, panner,
//     reverb send) are created once per pooled voice and rewired never;
//   - only the one-shot sources and their filters are transient, and they are
//     stopped AND disconnected when the voice is released;
//   - every sound name has a minimum interval and a concurrency cap, and calls
//     suppressed inside that interval are folded into the next one as extra
//     loudness rather than queued.
//
// Nothing here may throw. No WebAudio, a blocked context, a missing
// StereoPanner: all of it degrades to a silent object that the game drives
// exactly the same way.

import { makeMusic } from './music.js';

const VOICES = 28;          // hard ceiling on concurrent sfx voices
// Slots per voice for its transient nodes. MUST fit the fattest sound in the
// bank (`levelup` builds 16): anything that does not fit is never disconnected,
// which is a leak of a few nodes a second and a dead page twenty minutes in.
const NODES = 24;
const HAS = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function makeAudio(opts = {}) {
  let ctx = null;
  let master, sfxBus, musicBus, musicDuck, revIn, revReturn, limiter, outGain;
  let noiseBuf = null;
  let mus = null;
  let dead = false;                       // WebAudio unusable; stay silent forever

  const vol = { sfx: 0.9, music: 0.6 };
  const free = [];
  const live = [];
  const rate = Object.create(null);       // name -> { t, pend, n }

  let streakN = 0, streakT = -9;

  const api = {
    unlock, sfx, music, duck, setVolumes,
    setIntensity,
    get ready() { return !!ctx && ctx.state === 'running'; },
    get context() { return ctx; },
    get stats() { return { voices: live.length, free: free.length }; },
  };

  // ---- lifecycle ------------------------------------------------------

  function unlock() {
    if (dead) return;
    try {
      if (!ctx) {
        const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
        if (!AC) { dead = true; return; }
        ctx = new AC({ latencyHint: 'interactive' });
        build();
      }
      if (ctx.state === 'suspended') { const p = ctx.resume(); if (p && p.catch) p.catch(() => {}); }
    } catch (e) { dead = true; ctx = null; }
  }

  function build() {
    outGain  = ctx.createGain();  outGain.gain.value = 0.85;
    limiter  = ctx.createDynamicsCompressor();
    limiter.threshold.value = -10; limiter.knee.value = 6; limiter.ratio.value = 14;
    limiter.attack.value = 0.003;  limiter.release.value = 0.22;

    // A gentle tanh after the limiter. The compressor catches sustained level;
    // this catches the single transient that slips past its attack time, which
    // is exactly what a wall of hit-clicks is made of.
    const shaper = ctx.createWaveShaper();
    const cv = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = (i / 1023) * 2 - 1; cv[i] = Math.tanh(x * 1.7) / Math.tanh(1.7); }
    shaper.curve = cv; shaper.oversample = '2x';

    master   = ctx.createGain();  master.gain.value = 1;
    sfxBus   = ctx.createGain();  sfxBus.gain.value = vol.sfx;
    musicBus = ctx.createGain();  musicBus.gain.value = vol.music;
    musicDuck= ctx.createGain();  musicDuck.gain.value = 1;

    const conv = ctx.createConvolver();
    conv.buffer = makeIR(1.9, 2.6, 0.22);
    revIn     = ctx.createGain(); revIn.gain.value = 1;
    revReturn = ctx.createGain(); revReturn.gain.value = 0.55;
    const revLo = ctx.createBiquadFilter(); revLo.type = 'lowpass'; revLo.frequency.value = 4200;
    revIn.connect(conv); conv.connect(revLo); revLo.connect(revReturn); revReturn.connect(master);

    sfxBus.connect(master);
    musicBus.connect(musicDuck); musicDuck.connect(master);
    master.connect(limiter); limiter.connect(shaper); shaper.connect(outGain);
    outGain.connect(ctx.destination);

    noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 2), ctx.sampleRate);
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

    const hasPan = typeof ctx.createStereoPanner === 'function';
    for (let i = 0; i < VOICES; i++) {
      const g = ctx.createGain(); g.gain.value = 0;
      const p = hasPan ? ctx.createStereoPanner() : null;
      const s = ctx.createGain(); s.gain.value = 0;
      if (p) { g.connect(p); p.connect(sfxBus); } else { g.connect(sfxBus); }
      g.connect(s); s.connect(revIn);
      free.push({ g, p, s, nodes: new Array(NODES), n: 0, name: '', prio: 0, end: 0 });
    }

    mus = makeMusic({
      ctx,
      out: musicBus,
      send: revIn,
      noise: noiseBuf,
      sweep: () => sweep(ctx.currentTime),
    });

    if (typeof document !== 'undefined' && document.addEventListener) {
      document.addEventListener('visibilitychange', () => {
        if (!ctx) return;
        try {
          if (document.hidden) { if (ctx.state === 'running') ctx.suspend(); }
          else if (ctx.state === 'suspended') { const p = ctx.resume(); if (p && p.catch) p.catch(() => {}); }
        } catch (e) {}
      });
    }
  }

  // Exponential-decay noise with a short pre-delay and a handful of discrete
  // early taps. A pure noise burst reverb sounds like a hiss; the taps are what
  // make it read as a stone room.
  function makeIR(secs, decay, dark) {
    const sr = ctx.sampleRate;
    const n = Math.max(1, Math.floor(sr * secs));
    const buf = ctx.createBuffer(2, n, sr);
    const pre = Math.floor(sr * 0.013);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0;
      for (let i = pre; i < n; i++) {
        const t = (i - pre) / (n - pre);
        const e = Math.pow(1 - t, decay);
        lp += ((Math.random() * 2 - 1) * e - lp) * dark;
        d[i] = lp * 2.6;
      }
      const taps = [0.017, 0.024, 0.031, 0.043, 0.058, 0.071];
      for (let k = 0; k < taps.length; k++) {
        const i = Math.floor(sr * (taps[k] + ch * 0.0017));
        if (i < n) d[i] += (k % 2 ? -1 : 1) * 0.42 / (1 + k);
      }
    }
    return buf;
  }

  // ---- voice pool -----------------------------------------------------

  function sweep(t) {
    for (let i = live.length - 1; i >= 0; i--) if (live[i].end <= t) release(live[i], t, i);
  }

  function release(v, t, idx) {
    for (let i = 0; i < v.n; i++) {
      const nd = v.nodes[i];
      if (!nd) continue;
      if (nd.stop) { try { nd.stop(t); } catch (e) {} }
      try { nd.disconnect(); } catch (e) {}
      v.nodes[i] = null;
    }
    v.n = 0;
    try {
      v.g.gain.cancelScheduledValues(t); v.g.gain.setValueAtTime(0, t);
      v.s.gain.cancelScheduledValues(t); v.s.gain.setValueAtTime(0, t);
    } catch (e) {}
    const st = rate[v.name];
    if (st && st.n > 0) st.n--;
    v.name = ''; v.end = 0;
    if (idx === undefined) idx = live.indexOf(v);
    if (idx >= 0) live.splice(idx, 1);
    free.push(v);
  }

  // Stealing is by priority first, then by age. A wall of `hit` must never be
  // able to starve a `conductorDown`, which is the one sound the whole screen
  // is built around.
  function take(prio, t) {
    if (free.length) return free.pop();
    let worst = -1, wp = 1e9, we = 1e9;
    for (let i = 0; i < live.length; i++) {
      const v = live[i];
      if (v.prio < wp || (v.prio === wp && v.end < we)) { worst = i; wp = v.prio; we = v.end; }
    }
    if (worst < 0 || wp >= prio) return null;
    const v = live[worst];
    try { v.g.gain.cancelScheduledValues(t); v.g.gain.setTargetAtTime(0, t, 0.006); } catch (e) {}
    release(v, t + 0.03, worst);
    return free.pop() || null;
  }

  // ---- public --------------------------------------------------------

  function sfx(name, o) {
    if (dead || !ctx || ctx.state !== 'running') return;
    const key = (typeof name === 'string' && HAS(ALIAS, name)) ? ALIAS[name] : name;
    const d = HAS(BANK, key) ? BANK[key] : null;
    if (!d || typeof d.play !== 'function') return;
    const t = ctx.currentTime;
    sweep(t);

    let st = rate[key];
    if (!st) st = rate[key] = { t: -9, pend: 0, n: 0 };

    // Coalescing: a call inside the name's minimum interval does not queue and
    // does not spawn a voice. It is remembered, and the next call that does get
    // through plays slightly louder and slightly lower for it. Twenty enemies
    // dying on one frame become one, fatter, `kill`.
    if (t - st.t < d.gap) { if (st.pend < 24) st.pend++; return; }
    if (st.n >= d.cap) { if (st.pend < 24) st.pend++; return; }

    const v = take(d.prio, t);
    if (!v) return;

    const fold = st.pend;
    st.pend = 0; st.t = t; st.n++;
    v.name = key; v.prio = d.prio; v.n = 0;

    const gain = clamp((o && o.gain != null ? o.gain : 1) * d.gain * (1 + Math.min(fold, 8) * 0.055), 0, 4);
    let pitch = (o && o.pitch) || 1;
    if (d.vary) pitch *= 1 + (Math.random() * 2 - 1) * d.vary;
    if (fold) pitch *= 1 - Math.min(fold, 8) * 0.008;

    let pan = 0;
    if (o) {
      if (o.pan != null) pan = o.pan;
      else if (o.sx != null) pan = (o.sx - 0.5) * 1.7;   // screen x 0..1, for scenefx
    }
    try {
      if (v.p) v.p.pan.setValueAtTime(clamp(pan, -1, 1), t);
      v.s.gain.setValueAtTime(d.send || 0, t);
      const dur = d.play(v, t, gain, pitch, o);
      v.end = t + dur + 0.06;
      live.push(v);
      if (d.duck) duck(d.duck);
    } catch (e) {
      release(v, t);
    }
  }

  function music(trackId, o) {
    if (dead || !ctx || !mus) return;
    try { mus.play(trackId, o); } catch (e) {}
  }

  function setIntensity(v) {
    if (!mus) return;
    try { mus.setIntensity(v); } catch (e) {}
  }

  function duck(ms) {
    if (!ctx || !musicDuck) return;
    const t = ctx.currentTime;
    const back = Math.max(0.08, (ms || 600) / 1000);
    try {
      const g = musicDuck.gain;
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(0.22, t + 0.05);
      g.setValueAtTime(0.22, t + back * 0.45);
      g.linearRampToValueAtTime(1, t + back);
    } catch (e) {}
  }

  function setVolumes(v) {
    if (!v) return;
    if (v.sfx != null) vol.sfx = clamp(+v.sfx || 0, 0, 1);
    if (v.music != null) vol.music = clamp(+v.music || 0, 0, 1);
    if (!ctx) return;
    const t = ctx.currentTime;
    try {
      sfxBus.gain.cancelScheduledValues(t);
      sfxBus.gain.setTargetAtTime(vol.sfx, t, 0.03);
      musicBus.gain.cancelScheduledValues(t);
      musicBus.gain.setTargetAtTime(vol.music, t, 0.05);
    } catch (e) {}
  }

  // ---- primitives -----------------------------------------------------

  function add(v, nd) {
    if (v.n >= v.nodes.length) v.nodes.length = v.n + 8;   // never silently drop one
    v.nodes[v.n++] = nd; return nd;
  }
  function O(v, type, f, det) {
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = f;
    if (det) o.detune.value = det; return add(v, o);
  }
  function N(v, t, rateHz) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    if (rateHz) s.playbackRate.value = rateHz;
    add(v, s); s.start(t, Math.random() * 1.6); return s;
  }
  function F(v, type, f, q) {
    const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f;
    if (q != null) b.Q.value = q; return add(v, b);
  }
  function G(v, val) { const g = ctx.createGain(); g.gain.value = val; return add(v, g); }

  const E = 0.0001;
  function ad(p, t, peak, a, d) {           // percussive attack/decay
    const pk = Math.max(E * 2, peak);
    p.cancelScheduledValues(t); p.setValueAtTime(E, t);
    p.exponentialRampToValueAtTime(pk, t + Math.max(0.0008, a));
    p.exponentialRampToValueAtTime(E, t + a + d);
    return a + d;
  }
  function swell(p, t, peak, a, hold, r) {  // slow in, hold, slow out
    const pk = Math.max(E * 2, peak);
    p.cancelScheduledValues(t); p.setValueAtTime(E, t);
    p.linearRampToValueAtTime(pk, t + a);
    p.setValueAtTime(pk, t + a + hold);
    p.exponentialRampToValueAtTime(E, t + a + hold + r);
    return a + hold + r;
  }
  function glide(p, t, f0, f1, d) {
    p.cancelScheduledValues(t); p.setValueAtTime(Math.max(E, f0), t);
    p.exponentialRampToValueAtTime(Math.max(E, f1), t + d);
  }

  // ---- the bank -------------------------------------------------------
  //
  // Every sound is designed to sit in its own frequency band so that eight of
  // them stacked are still countable: impacts low-mid, the cut high and
  // narrow, pickups above the combat, UI dry and tiny, music underneath.

  const BANK = {

    hit: { gap: 0.030, cap: 5, prio: 1, gain: 0.26, vary: 0.09, send: 0.02, play(v, t, g, p) {
      const n = N(v, t), f = F(v, 'bandpass', 1750 * p, 1.1);
      n.connect(f); f.connect(v.g);
      glide(f.frequency, t, 2100 * p, 900 * p, 0.07);
      const o = O(v, 'triangle', 190 * p); o.connect(v.g); o.start(t); o.stop(t + 0.07);
      return ad(v.g.gain, t, g, 0.002, 0.075);
    } },

    crit: { gap: 0.055, cap: 3, prio: 2, gain: 0.34, vary: 0.05, send: 0.10, play(v, t, g, p) {
      const n = N(v, t), f = F(v, 'bandpass', 3000 * p, 2.2);
      n.connect(f); f.connect(v.g);
      glide(f.frequency, t, 4200 * p, 1400 * p, 0.09);
      const o = O(v, 'square', 1280 * p), og = G(v, 0.35);
      o.connect(og); og.connect(v.g); glide(o.frequency, t, 1280 * p, 620 * p, 0.11);
      o.start(t); o.stop(t + 0.16);
      return ad(v.g.gain, t, g, 0.002, 0.15);
    } },

    kill: { gap: 0.045, cap: 4, prio: 1, gain: 0.24, vary: 0.11, send: 0.05, play(v, t, g, p) {
      const o = O(v, 'square', 340 * p), lp = F(v, 'lowpass', 1400, 4);
      o.connect(lp); lp.connect(v.g);
      glide(o.frequency, t, 340 * p, 105 * p, 0.10);
      o.start(t); o.stop(t + 0.14);
      const n = N(v, t), bp = F(v, 'bandpass', 900, 0.8);
      const ng = G(v, 0.5); n.connect(bp); bp.connect(ng); ng.connect(v.g);
      ad(ng.gain, t, 0.5, 0.002, 0.06);
      return ad(v.g.gain, t, g, 0.003, 0.13);
    } },

    killBig: { gap: 0.10, cap: 2, prio: 3, gain: 0.46, vary: 0.06, send: 0.16, play(v, t, g, p) {
      const o = O(v, 'sawtooth', 150 * p), lp = F(v, 'lowpass', 900, 6);
      o.connect(lp); lp.connect(v.g);
      glide(o.frequency, t, 150 * p, 42 * p, 0.30); glide(lp.frequency, t, 1600, 260, 0.30);
      o.start(t); o.stop(t + 0.36);
      const n = N(v, t), bp = F(v, 'bandpass', 1200, 0.7), ng = G(v, 0.6);
      n.connect(bp); bp.connect(ng); ng.connect(v.g);
      glide(bp.frequency, t, 2200, 400, 0.2); ad(ng.gain, t, 0.6, 0.003, 0.18);
      return ad(v.g.gain, t, g, 0.004, 0.36);
    } },

    explode: { gap: 0.08, cap: 3, prio: 3, gain: 0.52, vary: 0.08, send: 0.22, duck: 0, play(v, t, g, p) {
      const n = N(v, t), lp = F(v, 'lowpass', 3200, 1.2);
      n.connect(lp); lp.connect(v.g);
      glide(lp.frequency, t, 3400 * p, 130, 0.5);
      const s = O(v, 'sine', 90 * p), sg = G(v, 0.9);
      s.connect(sg); sg.connect(v.g); glide(s.frequency, t, 90 * p, 28, 0.42);
      ad(sg.gain, t, 0.9, 0.004, 0.4); s.start(t); s.stop(t + 0.5);
      return ad(v.g.gain, t, g, 0.003, 0.55);
    } },

    // THE sound. A thread under tension letting go: a 4ms bright zip, a
    // high-Q resonance that snaps down an octave and a half in 90ms, and a
    // body thunk underneath so it is felt as well as heard. Narrow and high on
    // purpose - it is the one thing that must be audible through a full screen
    // of combat, because cutting is the skill the whole game is about.
    cut: { gap: 0.035, cap: 4, prio: 4, gain: 0.42, vary: 0.10, send: 0.18, play(v, t, g, p) {
      const zip = N(v, t), hp = F(v, 'highpass', 5200 * p, 0.7), zg = G(v, 0.55);
      zip.connect(hp); hp.connect(zg); zg.connect(v.g);
      ad(zg.gain, t, 0.55, 0.0006, 0.028);

      const bp = F(v, 'bandpass', 2600 * p, 9);
      const a = O(v, 'sawtooth', 2400 * p, -7);
      const b = O(v, 'sawtooth', 2400 * p, 9);
      const bg = G(v, 0.5);
      a.connect(bp); b.connect(bp); bp.connect(bg); bg.connect(v.g);
      glide(a.frequency, t, 2400 * p, 620 * p, 0.11);
      glide(b.frequency, t, 2400 * p, 608 * p, 0.12);
      glide(bp.frequency, t, 3400 * p, 900 * p, 0.11);
      ad(bg.gain, t, 0.5, 0.0015, 0.15);
      a.start(t); a.stop(t + 0.2); b.start(t); b.stop(t + 0.2);

      const th = O(v, 'sine', 260 * p), tg = G(v, 0.30);
      th.connect(tg); tg.connect(v.g); glide(th.frequency, t, 260 * p, 90, 0.10);
      ad(tg.gain, t, 0.3, 0.001, 0.1); th.start(t); th.stop(t + 0.12);

      return ad(v.g.gain, t, g, 0.0008, 0.22);
    } },

    // A whole Choir going out at once: a reverse swell pulls the ear up, the
    // detuned chord collapses a fifth downward, the sub drops out from under
    // it, and the music is ducked so the moment lands in a hole.
    conductorDown: { gap: 0.5, cap: 1, prio: 9, gain: 0.85, vary: 0.02, send: 0.55, duck: 1800, play(v, t, g) {
      const rev = N(v, t), rbp = F(v, 'bandpass', 800, 0.6), rg = G(v, 0);
      rev.connect(rbp); rbp.connect(rg); rg.connect(v.g);
      glide(rbp.frequency, t, 500, 4200, 0.85);
      rg.gain.setValueAtTime(E, t); rg.gain.exponentialRampToValueAtTime(0.55, t + 0.85);
      rg.gain.exponentialRampToValueAtTime(E, t + 0.98);

      const t2 = t + 0.85;
      const ch = G(v, 0), lp = F(v, 'lowpass', 2600, 1);
      ch.connect(lp); lp.connect(v.g);
      const semis = [0, 3, 7, 10, 12, 15];
      for (let i = 0; i < semis.length; i++) {
        const f0 = 165 * Math.pow(2, semis[i] / 12);
        const o = O(v, i > 3 ? 'triangle' : 'sawtooth', f0, (i % 2 ? 7 : -6));
        o.connect(ch); glide(o.frequency, t2, f0, f0 * 0.62, 1.25);
        o.start(t2); o.stop(t2 + 1.5);
      }
      swell(ch.gain, t2, 0.28, 0.02, 0.35, 1.05);
      glide(lp.frequency, t2, 3000, 420, 1.3);

      const sub = O(v, 'sine', 120), sg = G(v, 0);
      sub.connect(sg); sg.connect(v.g);
      glide(sub.frequency, t2, 120, 27, 1.1);
      swell(sg.gain, t2, 0.75, 0.03, 0.3, 1.0);
      sub.start(t2); sub.stop(t2 + 1.5);

      return 2.5;
    } },

    chorus: { gap: 0.8, cap: 1, prio: 8, gain: 0.62, send: 0.5, duck: 2600, play(v, t, g) {
      const lp = F(v, 'lowpass', 600, 3);
      lp.connect(v.g); glide(lp.frequency, t, 420, 3800, 2.4);
      const semis = [0, 1, 7, 8, 13];
      for (let i = 0; i < semis.length; i++) {
        const f0 = 98 * Math.pow(2, semis[i] / 12);
        const o = O(v, 'sawtooth', f0, i * 5 - 10);
        o.connect(lp); glide(o.frequency, t, f0, f0 * 1.5, 2.5);
        o.start(t); o.stop(t + 2.8);
      }
      const n = N(v, t), nb = F(v, 'bandpass', 1200, 0.9), ng = G(v, 0);
      n.connect(nb); nb.connect(ng); ng.connect(v.g);
      glide(nb.frequency, t, 700, 5200, 2.5); swell(ng.gain, t, 0.3, 2.3, 0.05, 0.3);
      return swell(v.g.gain, t, g, 2.2, 0.15, 0.45);
    } },

    levelup: { gap: 0.25, cap: 1, prio: 7, gain: 0.5, send: 0.35, duck: 700, play(v, t, g) {
      const semis = [0, 3, 7, 12];
      for (let i = 0; i < semis.length; i++) {
        const f = 330 * Math.pow(2, semis[i] / 12);
        const o = O(v, 'triangle', f), h = O(v, 'sine', f * 2), hg = G(v, 0.3), og = G(v, 0);
        o.connect(og); h.connect(hg); hg.connect(og); og.connect(v.g);
        const st = t + i * 0.075;
        ad(og.gain, st, 0.3, 0.004, 0.42 + i * 0.12);
        o.start(st); o.stop(st + 0.7); h.start(st); h.stop(st + 0.7);
      }
      v.g.gain.setValueAtTime(g, t);
      return 1.0;
    } },

    pickup: { gap: 0.022, cap: 4, prio: 2, gain: 0.17, send: 0.05, play(v, t, g, p, o) {
      // The streak ladder: shards collected in a stream walk up a pentatonic
      // scale. It costs nothing and it is the single cheapest dopamine in the
      // genre. The streak decays after half a second of not collecting.
      if (t - streakT < 0.55) streakN = Math.min(streakN + 1, 13); else streakN = 0;
      streakT = t;
      const step = (o && o.streak != null) ? clamp(o.streak | 0, 0, 13) : streakN;
      const f = 660 * Math.pow(2, PENTA[step] / 12) * p;
      const a = O(v, 'sine', f), b = O(v, 'triangle', f * 2), bg = G(v, 0.18);
      a.connect(v.g); b.connect(bg); bg.connect(v.g);
      a.start(t); a.stop(t + 0.13); b.start(t); b.stop(t + 0.13);
      return ad(v.g.gain, t, g, 0.003, 0.1);
    } },

    heart: { gap: 0.2, cap: 2, prio: 4, gain: 0.34, send: 0.2, play(v, t, g) {
      const o = O(v, 'sine', 392), h = O(v, 'sine', 587), hg = G(v, 0);
      o.connect(v.g); h.connect(hg); hg.connect(v.g);
      o.start(t); o.stop(t + 0.5); h.start(t + 0.09); h.stop(t + 0.6);
      ad(hg.gain, t + 0.09, 0.5, 0.01, 0.4);
      return ad(v.g.gain, t, g, 0.012, 0.42);
    } },

    chest: { gap: 0.2, cap: 2, prio: 6, gain: 0.5, send: 0.3, duck: 600, play(v, t, g) {
      const n = N(v, t), lp = F(v, 'lowpass', 900, 3), ng = G(v, 0.8);
      n.connect(lp); lp.connect(ng); ng.connect(v.g);
      glide(lp.frequency, t, 1400, 320, 0.14); ad(ng.gain, t, 0.8, 0.002, 0.16);
      for (let i = 0; i < 3; i++) {
        const f = 880 * Math.pow(2, [0, 5, 9][i] / 12);
        const o = O(v, 'sine', f), og = G(v, 0);
        o.connect(og); og.connect(v.g);
        const st = t + 0.09 + i * 0.055;
        ad(og.gain, st, 0.16, 0.004, 0.45); o.start(st); o.stop(st + 0.55);
      }
      v.g.gain.setValueAtTime(g, t);
      return 0.8;
    } },

    evolve: { gap: 0.4, cap: 1, prio: 8, gain: 0.66, send: 0.45, duck: 1400, play(v, t, g) {
      const lp = F(v, 'lowpass', 700, 4); lp.connect(v.g);
      glide(lp.frequency, t, 500, 6000, 0.8);
      const r = O(v, 'sawtooth', 110), rg = G(v, 0);
      r.connect(lp); glide(r.frequency, t, 110, 880, 0.8);
      swell(rg.gain, t, 0.2, 0.7, 0.02, 0.2); r.connect(rg); rg.connect(v.g);
      r.start(t); r.stop(t + 0.95);
      const t2 = t + 0.78;
      const semis = [0, 4, 7, 11, 14];
      for (let i = 0; i < semis.length; i++) {
        const f = 262 * Math.pow(2, semis[i] / 12);
        const o = O(v, 'triangle', f), og = G(v, 0);
        o.connect(og); og.connect(v.g);
        ad(og.gain, t2, 0.22, 0.006, 1.1); o.start(t2); o.stop(t2 + 1.3);
      }
      v.g.gain.setValueAtTime(g, t);
      return 2.1;
    } },

    hurt: { gap: 0.12, cap: 2, prio: 6, gain: 0.5, vary: 0.07, send: 0.08, play(v, t, g, p) {
      const n = N(v, t), lp = F(v, 'lowpass', 700, 2), ng = G(v, 0.7);
      n.connect(lp); lp.connect(ng); ng.connect(v.g);
      glide(lp.frequency, t, 1100, 220, 0.16); ad(ng.gain, t, 0.7, 0.002, 0.2);
      const o = O(v, 'sawtooth', 150 * p), og = G(v, 0.5), of_ = F(v, 'lowpass', 400, 3);
      o.connect(of_); of_.connect(og); og.connect(v.g);
      glide(o.frequency, t, 150 * p, 62, 0.2); ad(og.gain, t, 0.5, 0.003, 0.22);
      o.start(t); o.stop(t + 0.28);
      return ad(v.g.gain, t, g, 0.002, 0.3);
    } },

    death: { gap: 1.0, cap: 1, prio: 9, gain: 0.78, send: 0.5, duck: 2600, play(v, t, g) {
      const lp = F(v, 'lowpass', 1800, 2); lp.connect(v.g);
      glide(lp.frequency, t, 1800, 180, 1.8);
      const semis = [0, 3, 6, 10];
      for (let i = 0; i < semis.length; i++) {
        const f0 = 196 * Math.pow(2, semis[i] / 12);
        const o = O(v, 'sawtooth', f0, i * 6 - 9);
        o.connect(lp); glide(o.frequency, t, f0, f0 * 0.47, 2.0);
        o.start(t); o.stop(t + 2.2);
      }
      const s = O(v, 'sine', 80), sg = G(v, 0);
      s.connect(sg); sg.connect(v.g); glide(s.frequency, t, 80, 30, 1.9);
      swell(sg.gain, t, 0.5, 0.05, 0.5, 1.3); s.start(t); s.stop(t + 2.2);
      return swell(v.g.gain, t, g, 0.02, 0.9, 1.2);
    } },

    revive: { gap: 0.5, cap: 1, prio: 9, gain: 0.7, send: 0.5, duck: 1600, play(v, t, g) {
      const lp = F(v, 'lowpass', 500, 2); lp.connect(v.g);
      glide(lp.frequency, t, 400, 5000, 1.3);
      const semis = [0, 7, 12, 16, 19];
      for (let i = 0; i < semis.length; i++) {
        const f0 = 147 * Math.pow(2, semis[i] / 12);
        const o = O(v, 'triangle', f0, i * 4 - 8);
        o.connect(lp); glide(o.frequency, t, f0 * 0.75, f0, 1.1);
        o.start(t); o.stop(t + 1.8);
      }
      return swell(v.g.gain, t, g, 0.55, 0.35, 0.8);
    } },

    uiTap:    { gap: 0.03, cap: 3, prio: 5, gain: 0.22, vary: 0.03, play(v, t, g, p) {
      const n = N(v, t), hp = F(v, 'highpass', 2600, 0.7), ng = G(v, 0.6);
      n.connect(hp); hp.connect(ng); ng.connect(v.g); ad(ng.gain, t, 0.6, 0.0006, 0.016);
      const o = O(v, 'sine', 900 * p); o.connect(v.g); o.start(t); o.stop(t + 0.05);
      return ad(v.g.gain, t, g, 0.001, 0.04);
    } },
    uiSelect: { gap: 0.05, cap: 2, prio: 5, gain: 0.26, send: 0.08, play(v, t, g) {
      return twoTone(v, t, g, 560, 840, 0.05);
    } },
    uiBack:   { gap: 0.05, cap: 2, prio: 5, gain: 0.24, send: 0.08, play(v, t, g) {
      return twoTone(v, t, g, 720, 460, 0.05);
    } },
    uiDeny:   { gap: 0.08, cap: 2, prio: 5, gain: 0.30, play(v, t, g) {
      const o = O(v, 'square', 150), lp = F(v, 'lowpass', 1100, 2);
      o.connect(lp); lp.connect(v.g); o.start(t); o.stop(t + 0.19);
      const gp = v.g.gain;
      gp.setValueAtTime(E, t);
      for (let i = 0; i < 3; i++) {
        gp.setValueAtTime(g, t + i * 0.06);
        gp.setValueAtTime(E, t + i * 0.06 + 0.038);
      }
      return 0.2;
    } },

    // Weapon fire. Eight sounds that can all be on screen at once, so each one
    // owns a band and a length and none of them are allowed to be interesting.
    fireArc:   { gap: 0.075, cap: 3, prio: 1, gain: 0.20, vary: 0.12, send: 0.05, play(v, t, g, p) {
      const n = N(v, t), bp = F(v, 'bandpass', 700 * p, 1.4);
      n.connect(bp); bp.connect(v.g); glide(bp.frequency, t, 420 * p, 2600 * p, 0.15);
      return ad(v.g.gain, t, g, 0.02, 0.15);
    } },
    fireShot:  { gap: 0.055, cap: 4, prio: 1, gain: 0.17, vary: 0.14, play(v, t, g, p) {
      const o = O(v, 'triangle', 880 * p), lp = F(v, 'lowpass', 3000, 2);
      o.connect(lp); lp.connect(v.g); glide(o.frequency, t, 880 * p, 300 * p, 0.055);
      o.start(t); o.stop(t + 0.08);
      const n = N(v, t), hp = F(v, 'highpass', 3000, 0.7), ng = G(v, 0.3);
      n.connect(hp); hp.connect(ng); ng.connect(v.g); ad(ng.gain, t, 0.3, 0.0006, 0.012);
      return ad(v.g.gain, t, g, 0.001, 0.07);
    } },
    fireOrbit: { gap: 0.22, cap: 2, prio: 0, gain: 0.12, vary: 0.05, send: 0.12, play(v, t, g, p) {
      const a = O(v, 'sine', 420 * p), b = O(v, 'sine', 424 * p);
      a.connect(v.g); b.connect(v.g);
      a.start(t); a.stop(t + 0.34); b.start(t); b.stop(t + 0.34);
      return swell(v.g.gain, t, g, 0.09, 0.04, 0.19);
    } },
    fireAura:  { gap: 0.35, cap: 1, prio: 0, gain: 0.14, vary: 0.05, send: 0.15, play(v, t, g) {
      const n = N(v, t), lp = F(v, 'lowpass', 420, 3);
      n.connect(lp); lp.connect(v.g); glide(lp.frequency, t, 260, 620, 0.28);
      return swell(v.g.gain, t, g, 0.14, 0.05, 0.26);
    } },
    fireZone:  { gap: 0.20, cap: 2, prio: 1, gain: 0.24, vary: 0.08, send: 0.14, play(v, t, g, p) {
      const n = N(v, t), bp = F(v, 'bandpass', 900 * p, 1.1);
      n.connect(bp); bp.connect(v.g); glide(bp.frequency, t, 1500 * p, 300, 0.3);
      const s = O(v, 'sine', 110 * p), sg = G(v, 0.6);
      s.connect(sg); sg.connect(v.g); glide(s.frequency, t, 110 * p, 45, 0.3);
      ad(sg.gain, t, 0.6, 0.01, 0.3); s.start(t); s.stop(t + 0.36);
      return ad(v.g.gain, t, g, 0.008, 0.32);
    } },
    fireChain: { gap: 0.05, cap: 3, prio: 2, gain: 0.22, vary: 0.16, play(v, t, g, p) {
      const o = O(v, 'square', 2400 * p), bp = F(v, 'bandpass', 3000 * p, 7);
      o.connect(bp); bp.connect(v.g);
      // sample-and-hold jitter: the zap has no pitch, only a scatter
      for (let i = 0; i < 6; i++) o.frequency.setValueAtTime((1400 + Math.random() * 2600) * p, t + i * 0.012);
      o.start(t); o.stop(t + 0.09);
      return ad(v.g.gain, t, g, 0.001, 0.085);
    } },
    fireStrike:{ gap: 0.09, cap: 3, prio: 2, gain: 0.30, vary: 0.09, send: 0.10, play(v, t, g, p) {
      const n = N(v, t), lp = F(v, 'lowpass', 2200, 1.5), ng = G(v, 0.7);
      n.connect(lp); lp.connect(ng); ng.connect(v.g);
      glide(lp.frequency, t, 3000, 400, 0.18); ad(ng.gain, t, 0.7, 0.001, 0.17);
      const o = O(v, 'square', 320 * p), og = G(v, 0.35), of_ = F(v, 'lowpass', 800, 4);
      o.connect(of_); of_.connect(og); og.connect(v.g);
      glide(o.frequency, t, 320 * p, 90, 0.15); ad(og.gain, t, 0.35, 0.002, 0.16);
      o.start(t); o.stop(t + 0.2);
      return ad(v.g.gain, t, g, 0.001, 0.2);
    } },
    fireBell:  { gap: 0.20, cap: 2, prio: 3, gain: 0.26, vary: 0.04, send: 0.35, play(v, t, g, p) {
      const parts = [1, 2.76, 5.4, 8.9], amps = [1, 0.5, 0.26, 0.14];
      const f0 = 523 * p;
      for (let i = 0; i < parts.length; i++) {
        const o = O(v, 'sine', f0 * parts[i]), og = G(v, 0);
        o.connect(og); og.connect(v.g);
        ad(og.gain, t, amps[i] * 0.5, 0.002, 0.9 / (1 + i * 0.7));
        o.start(t); o.stop(t + 1.0);
      }
      v.g.gain.setValueAtTime(g, t);
      return 1.0;
    } },
  };

  function twoTone(v, t, g, f0, f1, step) {
    const o = O(v, 'triangle', f0), lp = F(v, 'lowpass', 4000, 1);
    o.connect(lp); lp.connect(v.g);
    o.frequency.setValueAtTime(f0, t);
    o.frequency.setValueAtTime(f1, t + step);
    o.start(t); o.stop(t + step + 0.09);
    const gp = v.g.gain;
    gp.setValueAtTime(E, t);
    gp.exponentialRampToValueAtTime(g, t + 0.004);
    gp.setValueAtTime(g * 0.95, t + step);
    gp.exponentialRampToValueAtTime(E, t + step + 0.08);
    return step + 0.09;
  }

  // Last statement on purpose: BANK is a const, and a `return` above it would
  // leave it in the temporal dead zone forever - every sfx() throwing on a
  // name it can plainly see. Function declarations hoist; this does not.
  return api;
}

const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28, 31];

// Event names from CONTRACTS 7.3 that do not match a bank name, so scenefx can
// forward an event type straight through without a lookup table of its own.
const ALIAS = {
  playerHurt: 'hurt',
  conductor: 'conductorDown',
  sever: 'cut',
  shard: 'pickup',
  coin: 'pickup',
  bigkill: 'killBig',
};
