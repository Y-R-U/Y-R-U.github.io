const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28, 31, 33, 36];

export function createAudio({ music: musicOn = true, sfx: sfxOn = true } = {}) {
  let ctx = null, master = null, sfx = null, musicBus = null, comp = null;
  let muted = !sfxOn;
  let musicMuted = !musicOn;
  let noiseBuf = null;
  let murmur = null, music = null;
  let lastTick = 0, streak = 0, lastRecruit = 0, lastWhoosh = 0;
  let crowdLevel = 0;
  const listeners = new Set();

  function ensure() {
    if (!ctx) {
      const ua = navigator.userActivation;
      if (ua && !ua.isActive && !ua.hasBeenActive) return null;
      try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch {}
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { ctx = new AC({ latencyHint: 'interactive' }); } catch { return null; }
      comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.9;
      master.connect(comp); comp.connect(ctx.destination);
      sfx = ctx.createGain(); sfx.gain.value = 1; sfx.connect(master);
      musicBus = ctx.createGain(); musicBus.gain.value = musicMuted ? 0 : 0.5; musicBus.connect(comp);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      let b = 0;
      for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; b = 0.97 * b + 0.03 * w; d[i] = w * 0.6 + b * 2.2; }
      startMurmur();
    }
    if (ctx.state !== 'running') ctx.resume().catch(() => {});
    return ctx;
  }
  // Kept for the page lifetime: iOS re-suspends after app switches and only resumes inside a gesture,
  // and Android grants activation on touchend/click, not on touchstart/pointerdown.
  const unlock = () => ensure();
  for (const ev of ['pointerdown', 'touchend', 'mousedown', 'keydown', 'click']) window.addEventListener(ev, unlock, { capture: true, passive: true });
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend().catch(() => {}); else if (ctx.state !== 'running') ctx.resume().catch(() => {});
  });

  const now = () => ctx.currentTime;
  const ok = () => ctx && ctx.state === 'running' && !muted;

  function env(g, t, a, peak, dec) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
  }
  function tone(freq, { type = 'sine', t = now(), a = 0.004, peak = 0.1, dec = 0.15, dest = sfx, glide = 0, detune = 0 } = {}) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); o.detune.value = detune;
    if (glide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * glide), t + a + dec);
    env(g, t, a, peak, dec);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + a + dec + 0.05);
  }
  function noise({ t = now(), dur = 0.25, peak = 0.2, type = 'bandpass', f0 = 400, f1 = 2000, q = 1.2, dest = sfx, a = 0.02 } = {}) {
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf; s.loop = true;
    f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    env(g, t, a, peak, dur);
    s.connect(f); f.connect(g); g.connect(dest);
    s.start(t, Math.random()); s.stop(t + a + dur + 0.05);
  }
  const hz = (semi) => 523.25 * Math.pow(2, semi / 12);

  function startMurmur() {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf; src.loop = true;
    const out = ctx.createGain(); out.gain.value = 0;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200;
    const bands = [320, 640, 1100, 1700].map((fq) => {
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = fq; f.Q.value = 2.2;
      const g = ctx.createGain(); g.gain.value = 0.25;
      src.connect(f); f.connect(g); g.connect(lp);
      return { f, g, base: fq };
    });
    lp.connect(out); out.connect(master);
    src.start();
    murmur = { out, bands };
  }
  function babble() {
    if (!murmur || !ctx) return;
    const t = now();
    for (const b of murmur.bands) {
      b.f.frequency.setTargetAtTime(b.base * (0.8 + Math.random() * 0.45), t, 0.08);
      b.g.gain.setTargetAtTime(0.12 + Math.random() * 0.3, t, 0.06);
    }
    const lvl = muted ? 0 : Math.min(1, Math.log10(1 + crowdLevel) / 3.1) * 0.5;
    murmur.out.gain.setTargetAtTime(lvl, t, 0.4);
  }
  setInterval(() => { if (ctx && ctx.state === 'running') babble(); }, 140);

  // ---------- music: a soft I–V–vi–IV pluck loop, scheduled ahead ----------
  const PROG = [[0, 4, 7], [7, 11, 14], [9, 12, 16], [5, 9, 12]];
  function startMusic() {
    if (!ensure() || music) return;
    const bpm = 112, spb = 60 / bpm;
    const m = { step: 0, next: now() + 0.1, intense: false, timer: 0 };
    const sched = () => {
      while (m.next < now() + 0.25) {
        const t = m.next, s = m.step, bar = Math.floor(s / 8) % 4, beat = s % 8;
        const ch = PROG[bar];
        if (!musicMuted) {
          if (beat === 0 || beat === 4 || (m.intense && beat === 6)) tone(hz(ch[0] - 24), { type: 'triangle', t, peak: 0.16, dec: 0.32, dest: musicBus });
          if (beat % 2 === 1) for (const n of ch) tone(hz(n), { type: 'square', t, peak: 0.018, dec: 0.12, dest: musicBus, detune: (Math.random() - 0.5) * 8 });
          if (beat === 2 || beat === 6) tone(hz(ch[(s >> 1) % 3] + 12), { type: 'sine', t, peak: 0.035, dec: 0.25, dest: musicBus });
          if (m.intense || beat % 2 === 0) noise({ t, dur: 0.03, peak: beat % 2 ? 0.02 : 0.035, type: 'highpass', f0: 7000, f1: 9000, q: 0.7, dest: musicBus, a: 0.002 });
          if (beat === 4) noise({ t, dur: 0.09, peak: 0.05, type: 'bandpass', f0: 1800, f1: 1200, q: 0.8, dest: musicBus, a: 0.002 });
        }
        m.step++; m.next += spb / 2;
      }
    };
    m.timer = setInterval(sched, 60);
    sched();
    music = m;
  }
  function stopMusic() { if (music) { clearInterval(music.timer); music = null; } }

  const api = {
    get muted() { return muted && musicMuted; },
    get sfxOn() { return !muted; },
    get musicOn() { return !musicMuted; },
    get state() { return ctx ? ctx.state : 'none'; },
    ensure,
    setSfx(on) {
      muted = !on;
      if (master) master.gain.setTargetAtTime(muted ? 0 : 0.9, now(), 0.03);
      listeners.forEach((f) => f(api.muted));
    },
    setMusic(on) {
      musicMuted = !on;
      if (musicBus) musicBus.gain.setTargetAtTime(musicMuted ? 0 : 0.5, now(), 0.05);
      listeners.forEach((f) => f(api.muted));
    },
    setMuted(v) { api.setSfx(!v); api.setMusic(!v); },
    onMute(f) { listeners.add(f); },
    setCrowd(n) { crowdLevel = n; },
    startMusic, stopMusic,
    setIntense(v) { if (music) music.intense = v; },
    recruit(n = 1) {
      if (!ok()) return;
      const t = now();
      streak = t - lastRecruit < 0.7 ? streak + n : 0;
      lastRecruit = t;
      if (t - lastTick < 0.045) return;
      lastTick = t;
      const semi = SCALE[Math.min(SCALE.length - 1, Math.floor(Math.sqrt(streak) * 1.6))];
      tone(hz(semi), { type: 'sine', peak: 0.07, dec: 0.09 });
      tone(hz(semi + 12), { type: 'triangle', peak: 0.018, dec: 0.05 });
    },
    steal(n, gained) {
      if (!ok()) return;
      const t = now();
      if (t - lastWhoosh < 0.14) return;
      lastWhoosh = t;
      const p = Math.min(0.28, 0.06 + n * 0.01);
      if (gained) { noise({ dur: 0.22, peak: p, f0: 350, f1: 2400, q: 1.6 }); tone(hz(7 + Math.min(12, n)), { type: 'triangle', peak: 0.04, dec: 0.1 }); }
      else { noise({ dur: 0.28, peak: p, f0: 2200, f1: 260, q: 1.6 }); tone(220, { type: 'sawtooth', peak: 0.025, dec: 0.18, glide: 0.6 }); }
    },
    absorb() {
      if (!ok()) return;
      const t = now();
      noise({ dur: 0.5, peak: 0.3, f0: 200, f1: 3000, q: 1 });
      tone(70, { type: 'sine', peak: 0.4, dec: 0.35, glide: 0.5 });
      [0, 4, 7, 12].forEach((s, i) => tone(hz(s), { type: 'triangle', t: t + 0.06 + i * 0.05, peak: 0.08, dec: 0.4 }));
    },
    absorbed() {
      if (!ok()) return;
      const t = now();
      noise({ dur: 0.6, peak: 0.25, f0: 2500, f1: 150, q: 1 });
      [7, 3, 0, -5].forEach((s, i) => tone(hz(s - 12), { type: 'sawtooth', t: t + i * 0.12, peak: 0.05, dec: 0.25 }));
    },
    pickup(kind) {
      if (!ok()) return;
      const t = now();
      const base = kind === 'speed' ? 7 : kind === 'magnet' ? 4 : 0;
      [0, 4, 7, 12, 16].forEach((s, i) => tone(hz(base + s), { type: 'square', t: t + i * 0.045, peak: 0.035, dec: 0.12 }));
      tone(hz(base + 24), { type: 'sine', t: t + 0.22, peak: 0.06, dec: 0.4 });
    },
    beep(go) {
      if (!ok()) return;
      if (go) { tone(hz(12), { type: 'square', peak: 0.06, dec: 0.4 }); tone(hz(19), { type: 'triangle', peak: 0.08, dec: 0.5 }); }
      else tone(hz(7), { type: 'square', peak: 0.05, dec: 0.16 });
    },
    tick(last) {
      if (!ok()) return;
      tone(last ? 1760 : 1320, { type: 'sine', peak: 0.05, dec: 0.05 });
    },
    lead(gained) {
      if (!ok()) return;
      const t = now();
      if (gained) {
        [0, 4, 7, 12].forEach((s, i) => tone(hz(s), { type: 'triangle', t: t + i * 0.08, peak: 0.1, dec: 0.3 }));
        tone(hz(24), { type: 'sine', t: t + 0.32, peak: 0.07, dec: 0.6 });
      } else {
        tone(hz(4), { type: 'triangle', peak: 0.08, dec: 0.2 });
        tone(hz(-1), { type: 'triangle', t: t + 0.14, peak: 0.08, dec: 0.35 });
      }
    },
    end(won) {
      if (!ok()) return;
      const t = now();
      if (won) {
        [[0, 0.0], [4, 0.12], [7, 0.24], [12, 0.36], [7, 0.52], [12, 0.64]].forEach(([s, d]) => tone(hz(s), { type: 'square', t: t + d, peak: 0.05, dec: 0.25 }));
        [0, 4, 7, 12, 16].forEach((s) => tone(hz(s), { type: 'triangle', t: t + 0.8, peak: 0.07, dec: 1.4 }));
      } else {
        [[7, 0], [5, 0.18], [3, 0.36], [0, 0.6]].forEach(([s, d]) => tone(hz(s - 12), { type: 'triangle', t: t + d, peak: 0.09, dec: 0.5 }));
      }
    },
    ui() { if (ok()) tone(hz(12), { type: 'sine', peak: 0.05, dec: 0.06 }); },
  };
  return api;
}
