import { settings } from '../core/settings';

/**
 * Procedural WebAudio sound (build plan §8 deviation, justified): the game ships no
 * audio assets, so SFX are synthesized — reactive, tiny, mobile-unlock-friendly, and
 * a good match for the abstract bioluminescent aesthetic. An evolving synth drone
 * provides ambience. Everything is gated behind a first-gesture unlock.
 */
export class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private ambientGain: GainNode | null = null;
  private unlocked = false;

  unlock(): void {
    if (this.unlocked) return;
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = settings.volume;
    this.master.connect(this.ctx.destination);
    this.unlocked = true;
    this.startAmbient();
  }

  setVolume(v: number): void {
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  private now(): number {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  private tone(freq: number, dur: number, opts: { type?: OscillatorType; gain?: number; sweep?: number; detune?: number } = {}): void {
    if (!this.ctx || !this.master) return;
    const t = this.now();
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = opts.type ?? 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (opts.sweep) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * opts.sweep), t + dur);
    if (opts.detune) o.detune.value = opts.detune;
    const peak = (opts.gain ?? 0.3) * 0.5;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noise(dur: number, opts: { gain?: number; cutoff?: number; q?: number; sweep?: number } = {}): void {
    if (!this.ctx || !this.master) return;
    const t = this.now();
    const n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < n; i++) ch[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(opts.cutoff ?? 1200, t);
    if (opts.sweep) f.frequency.exponentialRampToValueAtTime(Math.max(80, (opts.cutoff ?? 1200) * opts.sweep), t + dur);
    f.Q.value = opts.q ?? 1;
    const g = this.ctx.createGain();
    const peak = (opts.gain ?? 0.3) * 0.5;
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  private startAmbient(): void {
    if (!this.ctx || !this.master) return;
    this.ambientGain = this.ctx.createGain();
    this.ambientGain.gain.value = 0.12;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    filter.Q.value = 2;
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.frequency.value = 0.06;
    lfoGain.gain.value = 160;
    lfo.connect(lfoGain).connect(filter.frequency);
    lfo.start();
    for (const f of [55, 82.5, 110]) {
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = (Math.random() - 0.5) * 12;
      const g = this.ctx.createGain();
      g.gain.value = 0.25;
      o.connect(g).connect(filter);
      o.start();
    }
    filter.connect(this.ambientGain).connect(this.master);
  }

  // ── game events ──
  fire(): void { this.tone(620, 0.07, { type: 'square', gain: 0.12, sweep: 0.6 }); }
  hit(): void { this.noise(0.05, { gain: 0.12, cutoff: 2200, sweep: 0.5 }); }
  kill(): void { this.noise(0.22, { gain: 0.3, cutoff: 1400, sweep: 0.3, q: 0.8 }); this.tone(180, 0.18, { type: 'sine', gain: 0.18, sweep: 0.5 }); }
  enemyFire(): void { this.tone(300, 0.08, { type: 'sawtooth', gain: 0.06, sweep: 0.7 }); }
  playerHit(): void { this.noise(0.18, { gain: 0.34, cutoff: 700, sweep: 0.4 }); this.tone(120, 0.16, { type: 'square', gain: 0.2, sweep: 0.5 }); }
  absorb(): void { this.tone(880, 0.1, { type: 'sine', gain: 0.12, sweep: 1.5 }); }
  organelle(): void { this.tone(660, 0.16, { type: 'triangle', gain: 0.2, sweep: 1.6 }); this.tone(990, 0.16, { type: 'sine', gain: 0.14, sweep: 1.4 }); }
  lysis(): void { this.noise(0.4, { gain: 0.4, cutoff: 900, sweep: 0.2, q: 0.6 }); this.tone(90, 0.35, { type: 'sine', gain: 0.3, sweep: 0.4 }); }
  engulf(): void { this.tone(420, 0.18, { type: 'sine', gain: 0.18, sweep: 0.4 }); this.absorb(); }
  explosion(): void { this.noise(0.3, { gain: 0.36, cutoff: 800, sweep: 0.25 }); this.tone(70, 0.28, { type: 'sine', gain: 0.3, sweep: 0.5 }); }
  wave(): void { this.tone(330, 0.22, { type: 'triangle', gain: 0.18, sweep: 1.3 }); }
  death(): void { this.tone(220, 0.9, { type: 'sawtooth', gain: 0.3, sweep: 0.25 }); this.noise(0.7, { gain: 0.2, cutoff: 500, sweep: 0.2 }); }
  ui(): void { this.tone(520, 0.05, { type: 'sine', gain: 0.1, sweep: 1.2 }); }
}
