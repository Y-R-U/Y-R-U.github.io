// audio.js — fully procedural WebAudio SFX (no asset files) + ambient pad.

export class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.ready = false;
    this.lastGun = 0;
  }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    this.ready = true;
    this._noise = this._makeNoise();
  }

  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
  toggleMute() { this.muted = !this.muted; if (this.master) this.master.gain.value = this.muted ? 0 : 0.5; return this.muted; }

  _makeNoise() {
    const ctx = this.ctx;
    const len = ctx.sampleRate * 1.2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  _env(node, t, attack, dur, peak) {
    const g = node.gain;
    g.setValueAtTime(0.0001, t);
    g.exponentialRampToValueAtTime(peak, t + attack);
    g.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  tone(freq, dur, { type = 'sine', gain = 0.2, slideTo = null, attack = 0.005 } = {}) {
    if (!this.ready || this.muted) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    this._env(g, t, attack, dur, gain);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  noise(dur, { gain = 0.3, freq = 800, q = 1, type = 'lowpass', slideTo = null } = {}) {
    if (!this.ready || this.muted) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this._noise; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (slideTo) f.frequency.exponentialRampToValueAtTime(Math.max(60, slideTo), t + dur);
    const g = ctx.createGain();
    this._env(g, t, 0.004, dur, gain);
    src.connect(f).connect(g).connect(this.master);
    src.start(t); src.stop(t + dur + 0.02);
  }

  gun(level = 1) {
    if (!this.ready) return;
    const now = this.ctx.currentTime;
    if (now - this.lastGun < 0.03) return; // avoid stacking
    this.lastGun = now;
    this.tone(720 + level * 130, 0.12, { type: 'square', gain: 0.12, slideTo: 240 });
  }
  bomb() { this.tone(160, 0.22, { type: 'sawtooth', gain: 0.18, slideTo: 60 }); this.noise(0.2, { gain: 0.12, freq: 500, slideTo: 120 }); }
  mine() { this.tone(90, 0.3, { type: 'sine', gain: 0.15, slideTo: 40 }); }
  burst() { this.tone(900, 0.18, { type: 'sawtooth', gain: 0.16, slideTo: 300 }); this.noise(0.16, { gain: 0.1, freq: 2000, slideTo: 400 }); }
  repel() { this.tone(300, 0.25, { type: 'sine', gain: 0.18, slideTo: 1200 }); }
  hit() { this.tone(420, 0.06, { type: 'square', gain: 0.08, slideTo: 200 }); }
  explosion(power = 1) {
    this.noise(0.45 * power, { gain: 0.32, freq: 900, slideTo: 60, q: 0.7 });
    this.tone(120, 0.4 * power, { type: 'sine', gain: 0.22, slideTo: 35 });
  }
  pickup() { this.tone(660, 0.08, { type: 'triangle', gain: 0.16 }); this.tone(990, 0.1, { type: 'triangle', gain: 0.12, attack: 0.04 }); }
  flag() { this.tone(520, 0.12, { type: 'square', gain: 0.16 }); this.tone(780, 0.14, { type: 'square', gain: 0.14, attack: 0.06 }); }
  capture() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone(f, 0.22, { type: 'triangle', gain: 0.18 }), i * 90)); }
  respawn() { this.tone(200, 0.3, { type: 'sine', gain: 0.16, slideTo: 800 }); }
  click() { this.tone(440, 0.05, { type: 'square', gain: 0.1 }); }
  bigEvent() { this.tone(330, 0.2, { type: 'triangle', gain: 0.16, slideTo: 660 }); }
}
