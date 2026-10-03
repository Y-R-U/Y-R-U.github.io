// Audio playback (W5, W10, W11). Three buses (sfx, voice, music). Music streams through ONE <audio> element with a
// fade-out/fade-in crossfade per cue; barks, stingers and piano samples are small decoded buffers in an LRU.
// audio/manifest.json (lane AU) may be missing: everything degrades to the synth SFX and silent bubbles.
const PENTA = [0, 2, 4, 7, 9];
const LRU_BYTES = 20e6;
const FADE_OUT = 650, FADE_IN = 900, CUE_HOLD = 6000;

export function createAudio({ settings = () => ({}), base = '' } = {}) {
  let ctx = null, master = null, sfxBus = null, voiceBus = null, pianoBus = null, noiseBuf = null, gestured = false;
  const lastAt = {};
  const cache = new Map();
  let cacheBytes = 0;
  const unlockFns = [];
  let manifest = null, manifestState = 'idle', scriptFallback = null;

  const S = () => settings() || {};
  const vol = (k) => {
    const s = S();
    if (s.sound === false || s['mute.' + k]) return 0;
    const v = s['vol.' + k];
    return v == null ? (k === 'music' ? 0.55 : k === 'voice' ? 0.9 : 0.8) : Math.max(0, Math.min(1, +v));
  };

  function ensure() {
    if (!gestured) return null;
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { ctx = new AC({ latencyHint: 'interactive' }); } catch { return null; }
      master = ctx.createGain();
      master.gain.value = 1;
      master.connect(ctx.destination);
      sfxBus = ctx.createGain();
      voiceBus = ctx.createGain();
      pianoBus = ctx.createGain();
      sfxBus.connect(master); voiceBus.connect(master); pianoBus.connect(master);
      applyVolumes();
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }

  function applyVolumes() {
    if (!ctx) return;
    const t = ctx.currentTime;
    sfxBus.gain.setTargetAtTime(0.42 * vol('sfx'), t, 0.03);
    pianoBus.gain.setTargetAtTime(0.75 * vol('sfx'), t, 0.03);
    voiceBus.gain.setTargetAtTime(1.0 * vol('voice'), t, 0.03);
    music.volumeChanged();
  }

  const GESTURES = ['pointerdown', 'touchend', 'keydown', 'click'];
  const unlock = () => {
    if (gestured) return;
    gestured = true;
    ensure();
    for (const g of GESTURES) removeEventListener(g, unlock, true);
    loadManifest();
    piano.load();
    for (const fn of unlockFns.splice(0)) try { fn(); } catch (e) { console.error(e); }
    music.kick();
  };
  for (const g of GESTURES) addEventListener(g, unlock, true);

  async function loadManifest() {
    if (manifestState !== 'idle') return;
    manifestState = 'loading';
    try {
      const r = await fetch(base + 'audio/manifest.json', { cache: 'no-cache' });
      if (r.ok) manifest = await r.json();
    } catch {}
    if (!manifest) {
      try {
        const r = await fetch(base + 'tools/audio/script.json');
        if (r.ok) scriptFallback = await r.json();
      } catch {}
    }
    manifestState = 'done';
    for (const fn of api.onManifest.splice(0)) try { fn(manifest, scriptFallback); } catch (e) { console.error(e); }
    music.kick();
  }

  // ---- decoded buffers (LRU) ----
  async function buffer(file) {
    const c = ensure();
    if (!c || !file) return null;
    const hit = cache.get(file);
    if (hit) { cache.delete(file); cache.set(file, hit); return hit.p; }
    const entry = { bytes: 0, p: null };
    entry.p = fetch(base + file).then((r) => (r.ok ? r.arrayBuffer() : null)).then((ab) => (ab ? c.decodeAudioData(ab) : null)).then((b) => {
      if (b) { entry.bytes = b.length * b.numberOfChannels * 4; cacheBytes += entry.bytes; trim(); }
      else cache.delete(file);
      return b;
    }).catch(() => { cache.delete(file); return null; });
    cache.set(file, entry);
    return entry.p;
  }
  function trim() {
    for (const [k, v] of cache) {
      if (cacheBytes <= LRU_BYTES) break;
      if (v.pin) continue;
      cache.delete(k);
      cacheBytes -= v.bytes;
    }
  }
  function playBuffer(buf, bus, { gain = 1, rate = 1, at = 0 } = {}) {
    if (!ctx || !buf) return null;
    const s = ctx.createBufferSource(), g = ctx.createGain();
    s.buffer = buf;
    s.playbackRate.value = rate;
    g.gain.value = gain;
    s.connect(g).connect(bus);
    s.start(ctx.currentTime + at);
    return { src: s, gain: g };
  }

  // ---- synth SFX ----
  function tone(freq, { type = 'sine', at = 0, dur = 0.12, vol: v = 0.5, slide = 0, bus } = {}) {
    const c = ensure();
    if (!c) return;
    const t = c.currentTime + at;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(bus || sfxBus);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
  function noise({ at = 0, dur = 0.25, vol: v = 0.3, from = 400, to = 3000, q = 1.2, type = 'bandpass' } = {}) {
    const c = ensure();
    if (!c) return;
    const t = c.currentTime + at;
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = noiseBuf;
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(from, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + Math.min(0.02, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(sfxBus);
    s.start(t);
    s.stop(t + dur + 0.02);
  }
  const note = (step, b = 660) => b * Math.pow(2, Math.floor(step / 5) + PENTA[((step % 5) + 5) % 5] / 12);
  function throttle(key, ms) {
    const now = performance.now();
    if (now - (lastAt[key] || 0) < ms) return true;
    lastAt[key] = now;
    return false;
  }

  const sfx = {
    tink(step = 0) { if (throttle('tink', 35)) return; tone(note(Math.min(step, 14), 1320), { type: 'triangle', dur: 0.09, vol: 0.25 }); },
    coin(step = 0) { if (throttle('coin', 40)) return; tone(note(Math.min(step, 12), 1560), { type: 'square', dur: 0.05, vol: 0.08 }); tone(note(Math.min(step, 12) + 2, 1560), { type: 'square', at: 0.05, dur: 0.12, vol: 0.08 }); },
    plink(step = 0) { if (throttle('plink', 25)) return; tone(note(Math.min(step, 14), 660), { type: 'triangle', dur: 0.14, vol: 0.28 }); },
    kaching() {
      if (throttle('kaching', 120)) return;
      tone(note(7, 660), { type: 'square', dur: 0.08, vol: 0.12 });
      tone(note(9, 660), { type: 'square', at: 0.07, dur: 0.2, vol: 0.12 });
      noise({ at: 0.05, dur: 0.18, vol: 0.12, from: 5000, to: 9000, q: 3 });
    },
    pop() { if (throttle('pop', 40)) return; tone(520, { type: 'sine', dur: 0.08, vol: 0.35, slide: 1.8 }); },
    stamp() { tone(120, { type: 'triangle', dur: 0.25, vol: 0.6, slide: 0.5 }); noise({ dur: 0.14, vol: 0.3, from: 300, to: 120, q: 0.8 }); },
    whoosh() { if (throttle('whoosh', 200)) return; noise({ dur: 0.38, vol: 0.18, from: 300, to: 2400, q: 0.9 }); },
    clunk() { tone(220, { type: 'square', dur: 0.1, vol: 0.18, slide: 0.6 }); },
    nope() { if (throttle('nope', 150)) return; tone(200, { type: 'sine', dur: 0.12, vol: 0.2, slide: 0.8 }); },
    chime() { [0, 2, 4, 7].forEach((s, i) => tone(note(s + 5, 523), { type: 'sine', at: i * 0.09, dur: 0.4, vol: 0.2 })); },
    bell() {
      if (throttle('bell', 400)) return;
      for (const [f, v] of [[392, 0.32], [784, 0.14], [1176, 0.08], [523, 0.1]]) tone(f, { type: 'sine', dur: 2.2, vol: v });
    },
    tick() { if (throttle('tick', 60)) return; tone(1800, { type: 'square', dur: 0.03, vol: 0.06 }); },
    gun() { noise({ dur: 0.32, vol: 0.55, from: 2400, to: 140, q: 0.6, type: 'lowpass' }); tone(90, { type: 'triangle', dur: 0.2, vol: 0.5, slide: 0.4 }); },
    ricochet() { tone(2400, { type: 'sine', dur: 0.5, vol: 0.12, slide: 0.35 }); },
    splash() { noise({ dur: 0.5, vol: 0.32, from: 900, to: 2600, q: 0.5 }); noise({ at: 0.08, dur: 0.4, vol: 0.18, from: 3000, to: 600, q: 0.7 }); },
    glass() { for (let i = 0; i < 5; i++) tone(2600 + Math.random() * 2400, { type: 'triangle', at: i * 0.035, dur: 0.18, vol: 0.09 }); noise({ dur: 0.3, vol: 0.2, from: 6000, to: 9000, q: 2 }); },
    thud() { tone(70, { type: 'sine', dur: 0.25, vol: 0.6, slide: 0.6 }); noise({ dur: 0.15, vol: 0.25, from: 400, to: 100, q: 0.7 }); },
    hammer() { if (throttle('hammer', 70)) return; tone(320 + Math.random() * 80, { type: 'square', dur: 0.05, vol: 0.12, slide: 0.5 }); noise({ dur: 0.07, vol: 0.18, from: 2500, to: 900, q: 1.5 }); },
    punch() { if (throttle('punch', 50)) return; noise({ dur: 0.12, vol: 0.4, from: 600, to: 120, q: 0.7, type: 'lowpass' }); tone(110, { type: 'sine', dur: 0.12, vol: 0.4, slide: 0.5 }); },
    groan() { tone(220, { type: 'sawtooth', dur: 0.9, vol: 0.05, slide: 0.7 }); tone(185, { type: 'sawtooth', dur: 0.9, vol: 0.05, slide: 0.72 }); },
    slide() { tone(400, { type: 'sine', dur: 0.4, vol: 0.18, slide: 2.4 }); },
    tuba() { tone(98, { type: 'sawtooth', dur: 0.35, vol: 0.14, slide: 0.94 }); tone(73, { type: 'sawtooth', at: 0.35, dur: 0.7, vol: 0.14, slide: 0.9 }); },
    sting() { [0, 3, 6].forEach((s, i) => tone(note(s, 330) * 0.94, { type: 'sawtooth', at: i * 0.12, dur: 0.35, vol: 0.06 })); },
  };

  // Stingers come from the manifest (st_sign, st_hat, st_box, st_coach); synth fallback otherwise.
  const FALLBACK = { st_sign: () => sfx.chime(), st_hat: () => { sfx.slide(); sfx.chime(); }, st_box: () => sfx.chime(), st_coach: () => sfx.whoosh() };
  function stinger(id) {
    if (!ensure()) return;
    const f = manifest?.music?.[id]?.file;
    if (!f) { FALLBACK[id]?.(); return; }
    buffer(f).then((b) => { if (b) { playBuffer(b, sfxBus, { gain: 1.6 }); music.duck(0.35, b.duration); } else FALLBACK[id]?.(); });
  }

  // ---- voice (barks) ----
  async function voice(file, { delayMax = 700 } = {}) {
    if (!ensure() || !file || vol('voice') <= 0) return 0;
    const t0 = performance.now();
    const b = await buffer(file);
    if (!b || performance.now() - t0 > delayMax) return b ? b.duration : 0;
    playBuffer(b, voiceBus, { gain: 1 });
    music.duck(0.5, b.duration + 0.2);
    return b.duration;
  }

  // ---- music: ONE streamed element, crossfade = fade out, swap src, fade in ----
  const music = (() => {
    let el = null, cur = null, want = 'main', since = 0, fade = 1, fadeTo = 1, fadeT = 0, duckUntil = 0, duckLevel = 1, timer = 0, pending = null, paused = false;
    function file(id) { return manifest?.music?.[id]?.file || null; }
    function apply() {
      if (!el) return;
      const now = performance.now();
      const dk = now < duckUntil ? duckLevel : 1;
      el.volume = Math.max(0, Math.min(1, vol('music') * fade * dk));
    }
    function step() {
      const now = performance.now();
      const dt = now - fadeT;
      fadeT = now;
      const rate = fadeTo < fade ? dt / FADE_OUT : dt / FADE_IN;
      fade = fadeTo < fade ? Math.max(fadeTo, fade - rate) : Math.min(fadeTo, fade + rate);
      if (fade === 0 && pending !== null) swap();
      apply();
      if (fade === fadeTo && performance.now() > duckUntil) { clearInterval(timer); timer = 0; }
    }
    function run() { if (!timer) { fadeT = performance.now(); timer = setInterval(step, 33); } }
    function swap() {
      const id = pending;
      pending = null;
      cur = id;
      const f = file(id);
      if (!f) { el?.pause(); return; }
      if (!el) {
        el = new Audio();
        el.preload = 'auto';
        el.addEventListener('ended', () => { if (!manifest?.music?.[cur]?.loop) { const back = cur; cur = null; if (want === back) want = 'main'; kick(); } });
        el.addEventListener('error', () => {});
      }
      el.loop = !!manifest.music[id].loop;
      el.src = base + f;
      el.currentTime = 0;
      fadeTo = 1;
      if (!paused) el.play().catch(() => {});
      run();
    }
    function kick() {
      if (!gestured || !manifest?.music) return;
      if (want === cur && !pending) return;
      if (!file(want)) return;
      pending = want;
      if (!el || el.paused || fade === 0) { fade = 0; swap(); return; }
      fadeTo = 0;
      run();
    }
    document.addEventListener('visibilitychange', () => {
      paused = document.hidden;
      if (!el) return;
      if (paused) el.pause(); else if (cur) el.play().catch(() => {});
    });
    return {
      kick,
      // Cue switching with a hold so a flicker in focus never thrashes the stream. Beds (duel, robbery, fakedeath) cut in at once.
      want(id, { now = false } = {}) {
        if (id === want) return;
        const t = performance.now();
        if (!now && t - since < CUE_HOLD) return;
        want = id;
        since = t;
        kick();
      },
      duck(level, sec) { duckLevel = Math.min(level, performance.now() < duckUntil ? duckLevel : 1); duckUntil = Math.max(duckUntil, performance.now() + sec * 1000); apply(); run(); },
      volumeChanged() { apply(); },
      get current() { return cur; },
      get wanted() { return want; },
      get el() { return el; },
    };
  })();

  // ---- piano (W11): sampled sequencer over phrases.json, pre-decoded so a tap plays on the same frame ----
  const piano = (() => {
    let P = null, samples = [], loaded = false, loading = false, live = [], recent = [];
    async function load() {
      if (loading) return;
      loading = true;
      try {
        const r = await fetch(base + 'audio/piano/phrases.json');
        if (!r.ok) return;
        P = await r.json();
        const bufs = await Promise.all(P.samples.map((s) => buffer(s.file)));
        samples = P.samples.map((s, i) => ({ midi: s.midi, buf: bufs[i] })).filter((s) => s.buf);
        for (const s of P.samples) { const e = cache.get(s.file); if (e) e.pin = true; }
        loaded = samples.length > 0;
      } catch {}
    }
    function stopLive() {
      if (!ctx) return;
      const t = ctx.currentTime;
      for (const v of live) { try { v.gain.gain.cancelScheduledValues(t); v.gain.gain.setTargetAtTime(0, t, 0.02); v.src.stop(t + 0.12); } catch {} }
      live = [];
    }
    function voiceNote(midi, at, dur, vel) {
      if (!samples.length) {
        const f = 440 * Math.pow(2, (midi - 69) / 12);
        tone(f, { type: 'triangle', at, dur: Math.max(0.12, dur), vol: 0.22 * vel, bus: pianoBus });
        tone(f * 1.004, { type: 'sine', at, dur: Math.max(0.12, dur), vol: 0.12 * vel, bus: pianoBus });
        return;
      }
      let s = samples[0];
      for (const x of samples) if (Math.abs(x.midi - midi) < Math.abs(s.midi - midi)) s = x;
      const t = ctx.currentTime + at;
      const src = ctx.createBufferSource(), g = ctx.createGain();
      src.buffer = s.buf;
      src.playbackRate.value = Math.pow(2, (midi - s.midi) / 12);
      g.gain.setValueAtTime(0.9 * vel, t);
      g.gain.setTargetAtTime(0, t + Math.max(0.05, dur), 0.05);
      src.connect(g).connect(pianoBus);
      src.start(t);
      src.stop(t + dur + 0.4);
      const v = { src, gain: g };
      live.push(v);
      src.onended = () => { const i = live.indexOf(v); if (i >= 0) live.splice(i, 1); };
    }
    function pick({ wrong, frenzy }) {
      const all = P?.phrases || [];
      let pool = all.filter((p) => !!p.wrong === !!wrong);
      if (frenzy) { const long = pool.filter((p) => p.kind === 'long'); if (long.length) pool = long; }
      if (!pool.length) pool = all;
      const fresh = pool.filter((p) => !recent.includes(p.id));
      const arr = fresh.length ? fresh : pool;
      const ph = arr[Math.floor(Math.random() * arr.length)];
      if (ph) { recent.push(ph.id); if (recent.length > 6) recent.shift(); }
      return ph;
    }
    const FALLBACK_PHRASE = { bpm: 120, notes: [[0, 0.5, 60, 0.8], [0.5, 0.5, 64, 0.8], [1, 0.5, 67, 0.8], [1.5, 1, 72, 0.9], [0, 2, 48, 0.6]] };
    return {
      load,
      get ready() { return loaded; },
      // Returns the phrase length in seconds (for Fingers's animation and the saloon-loop duck).
      play({ tempo = 1, wrong = false, frenzy = false } = {}) {
        if (!ensure()) return 0;
        stopLive();
        const ph = (P && pick({ wrong, frenzy })) || FALLBACK_PHRASE;
        const spb = 60 / (ph.bpm * Math.max(0.5, tempo) * (frenzy ? 1.4 : 1));
        let end = 0;
        for (const [beat, durB, midi, vel] of ph.notes) {
          const at = beat * spb + 0.004;
          voiceNote(midi, at, durB * spb, vel);
          end = Math.max(end, at + durB * spb);
        }
        if (wrong) setTimeout(() => sfx.groan(), Math.min(1500, end * 900));
        music.duck(0.4, end + 0.3);
        return end;
      },
      stop: stopLive,
      get phrases() { return P?.phrases || []; },
    };
  })();

  const api = {
    sfx, music, piano, stinger, voice, buffer,
    onManifest: [],
    get manifest() { return manifest; },
    get script() { return scriptFallback; },
    get manifestDone() { return manifestState === 'done'; },
    get unlocked() { return gestured && !!ctx; },
    get ctx() { return ctx; },
    onUnlock(fn) { if (gestured) fn(); else unlockFns.push(fn); },
    applyVolumes,
    get on() { return S().sound !== false; },
    set(v) { applyVolumes(); if (v) ensure(); },
  };
  return api;
}

export function haptic(ms = 10) {
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
  try { navigator.vibrate?.(ms); } catch {}
}
