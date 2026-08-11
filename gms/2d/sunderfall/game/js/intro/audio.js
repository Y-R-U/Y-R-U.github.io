/* Procedural score. No audio files — every sound here is synthesised.
 *
 * Autoplay policy: the context is created on construction but may start suspended. `arm()` is
 * called from the first real user gesture and resumes it. Nothing visual ever waits on this;
 * if audio never arms, the intro plays silent.
 */

export class IntroAudio {
  constructor() {
    this.ok = false;
    this.armed = false;
    this.beds = {};
    this.bed = null;
    this._crackleNext = 0;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC({ latencyHint: 'interactive' });
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.0;
      this.master.connect(this.ctx.destination);

      this.wet = this.ctx.createGain();
      this.wet.gain.value = 0.42;
      this.verb = this.ctx.createConvolver();
      this.verb.buffer = this._impulse(2.9, 2.6);
      this.wet.connect(this.verb); this.verb.connect(this.master);

      /* Voice sits outside master on purpose: duck() pulls master down so the score
         gets out of the way of a line, and a voice routed through master would duck
         itself. Both buses still fade together on skip. */
      this.voice = this.ctx.createGain();
      this.voice.gain.value = 0.0;
      this.voice.connect(this.ctx.destination);

      this.noiseBuf = this._noise(3.0);
      this.ok = true;
    } catch { this.ok = false; }
  }

  arm() {
    if (!this.ok || this.armed) return;
    this.armed = true;
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    this.master.gain.setTargetAtTime(0.85, this.ctx.currentTime, 0.25);
    this.voice.gain.setTargetAtTime(1.0, this.ctx.currentTime, 0.15);
  }

  get t() { return this.ctx.currentTime; }

  _noise(sec) {
    const n = (this.ctx.sampleRate * sec) | 0;
    const b = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = w * 0.7 + last * 3.5; }
    return b;
  }

  _impulse(sec, decay) {
    const n = (this.ctx.sampleRate * sec) | 0;
    const b = this.ctx.createBuffer(2, n, this.ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < n; i++) {
        const t = i / n;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay) * (1 - Math.exp(-i / 400));
      }
    }
    return b;
  }

  _src(buf, rate = 1, loop = false) {
    const s = this.ctx.createBufferSource();
    s.buffer = buf; s.loop = loop; s.playbackRate.value = rate;
    return s;
  }

  _env(node, t0, a, peak, d, sustain = 0, hold = 0) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + a);
    if (hold) g.gain.setValueAtTime(Math.max(0.0002, peak), t0 + a + hold);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, sustain || 0.0001), t0 + a + hold + d);
    node.connect(g);
    return g;
  }

  _out(g, send = 0.3) {
    g.connect(this.master);
    if (send > 0) { const s = this.ctx.createGain(); s.gain.value = send; g.connect(s); s.connect(this.wet); }
  }

  /* ── beds ───────────────────────────────────────────────────────────────── */

  _makeBed(kind) {
    const ctx = this.ctx;
    const out = ctx.createGain();
    out.gain.value = 0;
    this._out(out, kind === 'dusk' ? 0.2 : 0.45);
    const parts = [];

    if (kind === 'battle' || kind === 'wood' || kind === 'dark') {
      const base = kind === 'battle' ? 31 : kind === 'dark' ? 24 : 44;
      for (const [mul, det, gain] of [[1, 0, 0.55], [1.5, 0.6, 0.22], [2.005, -0.4, 0.16], [3.01, 1.1, 0.08]]) {
        const o = ctx.createOscillator();
        o.type = mul === 1 ? 'sine' : 'sawtooth';
        o.frequency.value = base * mul + det;
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass'; lp.frequency.value = kind === 'battle' ? 420 : 260; lp.Q.value = 0.7;
        const g = ctx.createGain(); g.gain.value = gain;
        o.connect(lp); lp.connect(g); g.connect(out);
        o.start(); parts.push(o);
      }
      // slow menace pulse
      const lfo = ctx.createOscillator(); lfo.frequency.value = kind === 'battle' ? 0.42 : 0.13;
      const lg = ctx.createGain(); lg.gain.value = 0.35;
      lfo.connect(lg); lg.connect(out.gain);
      lfo.start(); parts.push(lfo);
    }

    if (kind === 'dusk' || kind === 'wood') {
      // wind: pink-ish noise through a wandering bandpass
      const s = this._src(this.noiseBuf, 0.6, true);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = kind === 'dusk' ? 420 : 900; bp.Q.value = 0.8;
      const g = ctx.createGain(); g.gain.value = kind === 'dusk' ? 0.16 : 0.10;
      s.connect(bp); bp.connect(g); g.connect(out);
      s.start(); parts.push(s);
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07;
      const lg = ctx.createGain(); lg.gain.value = 220;
      lfo.connect(lg); lg.connect(bp.frequency); lfo.start(); parts.push(lfo);
    }

    if (kind === 'dusk') {
      // a warm, out-of-tune village drone — three fifths, quiet
      for (const [f, g0] of [[73.4, 0.10], [110, 0.07], [164.8, 0.035]]) {
        const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
        const g = ctx.createGain(); g.gain.value = g0;
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
        o.connect(lp); lp.connect(g); g.connect(out); o.start(); parts.push(o);
      }
    }

    return { out, parts, stop: () => { for (const p of parts) { try { p.stop(); } catch {} } } };
  }

  setBed(kind, fade = 1.2, level = 1) {
    if (!this.ok) return;
    const t = this.t;
    if (this.bed) {
      const old = this.bed;
      old.out.gain.cancelScheduledValues(t);
      old.out.gain.setTargetAtTime(0, t, fade * 0.35);
      setTimeout(() => old.stop(), (fade + 0.8) * 1000);
    }
    if (!kind) { this.bed = null; return; }
    const b = this._makeBed(kind);
    b.out.gain.setValueAtTime(0.0001, t);
    b.out.gain.setTargetAtTime(level, t, fade * 0.4);
    this.bed = b;
  }

  /* ── one-shots ──────────────────────────────────────────────────────────── */

  slam(power = 1) {
    if (!this.ok) return;
    const ctx = this.ctx, t = this.t;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(150 * power, t);
    o.frequency.exponentialRampToValueAtTime(22, t + 0.55);
    const g = this._env(o, t, 0.004, 0.9 * power, 0.75);
    this._out(g, 0.5); o.start(t); o.stop(t + 1.4);

    const n = this._src(this.noiseBuf, 0.35 + Math.random() * 0.2);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(2400, t); lp.frequency.exponentialRampToValueAtTime(160, t + 0.5);
    n.connect(lp);
    const g2 = this._env(lp, t, 0.006, 0.5 * power, 0.6);
    this._out(g2, 0.6); n.start(t); n.stop(t + 1.2);
  }

  crack(bright = 1) {
    if (!this.ok) return;
    const ctx = this.ctx, t = this.t;
    for (let i = 0; i < 5; i++) {
      const tt = t + i * 0.018 * Math.random();
      const o = ctx.createOscillator(); o.type = 'square';
      o.frequency.setValueAtTime((1400 + Math.random() * 2600) * bright, tt);
      o.frequency.exponentialRampToValueAtTime(240, tt + 0.16);
      const g = this._env(o, tt, 0.002, 0.10, 0.18);
      this._out(g, 0.7); o.start(tt); o.stop(tt + 0.35);
    }
  }

  surge(dur = 1.6) {
    if (!this.ok) return;
    const ctx = this.ctx, t = this.t;
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(60, t);
    o.frequency.exponentialRampToValueAtTime(420, t + dur);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(200, t); lp.frequency.exponentialRampToValueAtTime(5200, t + dur);
    lp.Q.value = 6;
    o.connect(lp);
    const g = this._env(lp, t, dur * 0.8, 0.32, 0.4);
    this._out(g, 0.5); o.start(t); o.stop(t + dur + 0.6);
  }

  detonate() {
    if (!this.ok) return;
    const ctx = this.ctx, t = this.t;
    this.slam(1.6);
    const n = this._src(this.noiseBuf, 1.0);
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 300;
    n.connect(hp);
    const g = this._env(hp, t, 0.01, 0.85, 2.4);
    this._out(g, 0.95); n.start(t); n.stop(t + 3.0);
    // a bell that rings out over the top
    for (const [f, a] of [[196, 0.22], [293.7, 0.14], [440, 0.09], [587.3, 0.05]]) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const gg = this._env(o, t + 0.03, 0.02, a, 4.0);
      this._out(gg, 0.9); o.start(t); o.stop(t + 5.0);
    }
  }

  meld() {
    if (!this.ok) return;
    const ctx = this.ctx, t = this.t;
    this.slam(1.9);
    // stone-on-bone: a short, hard, pitched knock
    const o = ctx.createOscillator(); o.type = 'triangle';
    o.frequency.setValueAtTime(320, t); o.frequency.exponentialRampToValueAtTime(48, t + 0.22);
    const g = this._env(o, t, 0.002, 0.7, 0.3);
    this._out(g, 0.4); o.start(t); o.stop(t + 0.7);
    // and then the world opens up under it
    for (const [f, a, d] of [[55, 0.30, 5.5], [82.4, 0.18, 5.0], [110, 0.14, 4.5], [165, 0.07, 4.0], [220, 0.05, 3.4]]) {
      const oo = ctx.createOscillator(); oo.type = 'sine'; oo.frequency.value = f;
      const gg = this._env(oo, t + 0.06, 0.35, a, d);
      this._out(gg, 0.85); oo.start(t); oo.stop(t + d + 1.0);
    }
  }

  chime(f = 880, a = 0.10, d = 2.2) {
    if (!this.ok) return;
    const t = this.t;
    const o = this.ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
    const g = this._env(o, t, 0.01, a, d);
    this._out(g, 0.8); o.start(t); o.stop(t + d + 0.5);
  }

  crackle(intensity = 1) {
    if (!this.ok || !this.armed) return;
    const t = this.t;
    if (t < this._crackleNext) return;
    this._crackleNext = t + 0.04 + Math.random() * 0.30 / Math.max(0.15, intensity);
    const n = this._src(this.noiseBuf, 1.6 + Math.random());
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 900 + Math.random() * 3200; bp.Q.value = 3 + Math.random() * 6;
    n.connect(bp);
    const g = this._env(bp, t, 0.002, 0.05 * intensity * (0.4 + Math.random()), 0.05 + Math.random() * 0.1);
    this._out(g, 0.5); n.start(t); n.stop(t + 0.3);
  }

  breath() {
    if (!this.ok) return;
    const t = this.t;
    const n = this._src(this.noiseBuf, 0.5);
    const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 520; bp.Q.value = 1.2;
    n.connect(bp);
    const g = this._env(bp, t, 0.35, 0.055, 0.7);
    this._out(g, 0.3); n.start(t); n.stop(t + 1.6);
  }

  duck(level = 0.12, sec = 0.6) {
    if (!this.ok) return;
    this.master.gain.cancelScheduledValues(this.t);
    this.master.gain.setTargetAtTime(level, this.t, sec * 0.3);
    this.master.gain.setTargetAtTime(0.85, this.t + sec, 0.5);
  }

  fadeOut(sec = 1.0) {
    if (!this.ok) return;
    this.master.gain.cancelScheduledValues(this.t);
    this.master.gain.setTargetAtTime(0, this.t, sec * 0.35);
    this.voice.gain.cancelScheduledValues(this.t);
    this.voice.gain.setTargetAtTime(0, this.t, sec * 0.25);
  }

  dispose() {
    if (!this.ok) return;
    try { this.bed?.stop(); } catch {}
    try { this.ctx.close(); } catch {}
    this.ok = false;
  }
}
