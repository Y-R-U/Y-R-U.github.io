/** Quiet synthesized water and glass. No sound files or autoplay. */
export class AquariumAudio {
  constructor() {
    this.enabled = false;
    this.context = null;
    this.master = null;
    this.nodes = [];
  }
  async toggle() {
    this.enabled = !this.enabled;
    if (this.enabled) {
      await this.start();
    } else if (this.master)
      this.master.gain.setTargetAtTime(0, this.context.currentTime, 0.3);
    return this.enabled;
  }
  async start() {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) {
      this.enabled = false;
      return;
    }
    if (!this.context) {
      const c = (this.context = new Audio());
      this.master = c.createGain();
      this.master.gain.value = 0;
      this.master.connect(c.destination);
      const length = c.sampleRate * 6,
        buffer = c.createBuffer(1, length, c.sampleRate),
        data = buffer.getChannelData(0);
      let last = 0;
      for (let i = 0; i < length; i++) {
        const v = Math.random() * 2 - 1;
        last = (last + 0.025 * v) / 1.025;
        data[i] = last * 3.2;
      }
      const noise = c.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;
      const filter = c.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 520;
      const gain = c.createGain();
      gain.gain.value = 0.17;
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.master);
      noise.start();
      this.nodes.push(noise);
      for (const [hz, vol] of [
        [130.81, 0.025],
        [196, 0.015],
        [261.63, 0.006],
      ]) {
        const osc = c.createOscillator(),
          g = c.createGain();
        osc.type = "sine";
        osc.frequency.value = hz;
        g.gain.value = vol;
        osc.connect(g);
        g.connect(this.master);
        osc.start();
        this.nodes.push(osc);
      }
    }
    await this.context.resume();
    this.master.gain.setTargetAtTime(
      this.enabled ? 0.55 : 0,
      this.context.currentTime,
      0.5,
    );
  }
  note(freq = 600, duration = 0.6, volume = 0.12) {
    if (!this.enabled || !this.context) return;
    const c = this.context,
      o = c.createOscillator(),
      g = c.createGain(),
      t = c.currentTime;
    o.type = "sine";
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * 0.62, t + duration);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(volume, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + duration + 0.01);
  }
  splash() {
    this.note(410, 0.22, 0.18);
    setTimeout(() => this.note(750, 0.3, 0.1), 80);
    setTimeout(() => this.note(540, 0.55, 0.07), 140);
  }
  feed() {
    this.note(880, 0.2, 0.045);
    setTimeout(() => this.note(1100, 0.25, 0.025), 130);
  }
  reward() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
      setTimeout(() => this.note(f, 1.1, 0.08), i * 140),
    );
  }
  visibility(hidden) {
    if (!this.context) return;
    if (hidden) this.context.suspend().catch(() => {});
    else if (this.enabled) this.context.resume().catch(() => {});
  }
}
