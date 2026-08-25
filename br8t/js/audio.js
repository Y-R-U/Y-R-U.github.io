// audio.js — the soundtrack is synthesized, not sampled.
// Five beds crossfaded by scene weight: furnace rumble, star shimmer,
// stratospheric wind, a warm arrival pad — plus collision ticks and the
// breakout whoosh. Everything from noise buffers and oscillators.

export class AudioBed {
  constructor() {
    this.ctx = null;
    this.on = false;
    this.g = {};
  }

  toggle() {
    if (!this.ctx) this._build();
    this.on = !this.on;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(this.on ? 0.65 : 0.0, t, 0.5);
    if (this.on && this.ctx.state === 'suspended') this.ctx.resume();
    return this.on;
  }

  _build() {
    const C = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    const master = this.master = C.createGain();
    master.gain.value = 0;
    const comp = C.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 6;
    master.connect(comp).connect(C.destination);

    // noise sources ------------------------------------------------------
    const mkNoise = (brown) => {
      const b = C.createBuffer(1, C.sampleRate * 2, C.sampleRate);
      const d = b.getChannelData(0);
      let last = 0;
      for (let i = 0; i < d.length; i++) {
        const w = Math.random() * 2 - 1;
        if (brown) { last = last * 0.985 + w * 0.015; d[i] = last * 3.2; }
        else d[i] = w;
      }
      const s = C.createBufferSource();
      s.buffer = b; s.loop = true; s.start();
      return s;
    };
    this._white = mkNoise(false);
    const gain = (v = 0) => { const g = C.createGain(); g.gain.value = v; g.connect(master); return g; };

    // furnace: brown noise through a heavy lowpass + sub sine ------------
    const furnG = this.g.furnace = gain();
    const lp = C.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 110;
    mkNoise(true).connect(lp).connect(furnG);
    const sub = C.createOscillator(); sub.frequency.value = 41; sub.type = 'sine';
    const subG = C.createGain(); subG.gain.value = 0.5;
    const subLFO = C.createOscillator(); subLFO.frequency.value = 0.09;
    const subLFOd = C.createGain(); subLFOd.gain.value = 0.22;
    subLFO.connect(subLFOd).connect(subG.gain);
    sub.connect(subG).connect(furnG);
    sub.start(); subLFO.start();

    // shimmer: sparse high partials, vacuum-quiet ------------------------
    const shimG = this.g.shimmer = gain();
    [1318.5, 1975.5, 2637].forEach((f, i) => {
      const o = C.createOscillator(); o.frequency.value = f; o.type = 'sine';
      const og = C.createGain(); og.gain.value = 0.012;
      const lfo = C.createOscillator(); lfo.frequency.value = 0.05 + i * 0.023;
      const lfod = C.createGain(); lfod.gain.value = 0.011;
      lfo.connect(lfod).connect(og.gain);
      o.connect(og).connect(shimG);
      o.start(); lfo.start();
    });

    // wind: white noise through a wandering bandpass ---------------------
    const windG = this.g.wind = gain();
    const bp = C.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 520; bp.Q.value = 0.7;
    const wlfo = C.createOscillator(); wlfo.frequency.value = 0.06;
    const wlfod = C.createGain(); wlfod.gain.value = 260;
    wlfo.connect(wlfod).connect(bp.frequency);
    this._white.connect(bp).connect(windG);
    wlfo.start();

    // pad: warm detuned triads for the arrival ---------------------------
    const padG = this.g.pad = gain();
    const plp = C.createBiquadFilter(); plp.type = 'lowpass'; plp.frequency.value = 540;
    plp.connect(padG);
    [73.42, 110, 146.83, 185].forEach((f, i) => {
      const o = C.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
      o.detune.value = (i % 2 ? 4 : -4);
      const dlfo = C.createOscillator(); dlfo.frequency.value = 0.11 + i * 0.03;
      const dlfod = C.createGain(); dlfod.gain.value = 5;
      dlfo.connect(dlfod).connect(o.detune);
      const og = C.createGain(); og.gain.value = 0.05;
      o.connect(og).connect(plp);
      o.start(); dlfo.start();
    });
  }

  // scene weights → bed gains, every frame
  mix(w) {
    if (!this.ctx || !this.on) return;
    const t = this.ctx.currentTime;
    const set = (g, v) => g.gain.setTargetAtTime(Math.max(0, Math.min(1, v)), t, 0.4);
    set(this.g.furnace, 0.55 * w.sun + 0.8 * w.core + 0.5 * w.walk + 0.3 * w.escape);
    set(this.g.shimmer, 0.25 * w.escape + 0.6 * w.space + 0.3 * w.outro);
    set(this.g.wind, 0.65 * w.sky);
    set(this.g.pad, 0.5 * w.iris + 0.55 * w.outro);
  }

  // a photon absorbed + re-emitted (random-walk collision)
  tick() {
    if (!this.ctx || !this.on) return;
    const C = this.ctx, t = C.currentTime;
    const bp = C.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 1600 + Math.random() * 2600; bp.Q.value = 14;
    const g = C.createGain();
    g.gain.setValueAtTime(0.05, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    this._white.connect(bp).connect(g).connect(this.master);
    setTimeout(() => { bp.disconnect(); g.disconnect(); }, 220);
  }

  // photosphere breakout
  whoosh() {
    if (!this.ctx || !this.on) return;
    const C = this.ctx, t = C.currentTime;
    const bp = C.createBiquadFilter();
    bp.type = 'bandpass'; bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(140, t);
    bp.frequency.exponentialRampToValueAtTime(3800, t + 1.5);
    const g = C.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35, t + 0.5);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.9);
    this._white.connect(bp).connect(g).connect(this.master);
    setTimeout(() => { bp.disconnect(); g.disconnect(); }, 2100);
  }
}
