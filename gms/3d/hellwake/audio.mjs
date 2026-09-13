export class GameAudio {
  constructor() {
    this.enabled = true;
    this.context = null;
    this.last = {};
    this.drone = null;
  }
  unlock() {
    try {
      if (!this.context) {
        const C = window.AudioContext || window.webkitAudioContext;
        this.context = new C();
        this.master = this.context.createGain();
        this.master.gain.value = this.enabled ? 0.2 : 0;
        this.master.connect(this.context.destination);
      }
      if (this.context.state === "suspended")
        this.context.resume().catch(() => {});
    } catch {}
  }
  setEnabled(on) {
    this.enabled = on;
    if (this.master)
      this.master.gain.setTargetAtTime(
        on ? 0.2 : 0,
        this.context.currentTime,
        0.12,
      );
  }
  tick(active, time) {
    if (!active || !this.context || !this.enabled) return;
    const step = Math.floor(time / 0.36);
    if (step === this.musicStep) return;
    this.musicStep = step;
    const notes = [55, 55, 65.41, 55, 73.42, 65.41, 49, 49];
    if (step % 2 === 0)
      this.tone(notes[Math.floor(step / 2) % 8], 0.6, "triangle", 0.13);
    if (step % 8 === 0) {
      this.tone(220, 0.95, "sine", 0.035);
      this.tone(261.63, 1.1, "sine", 0.025);
    }
    if (step % 4 === 0) this.tone(85, 0.11, "sine", 0.17, 28);
  }
  tone(freq, duration = 0.1, type = "sine", gain = 0.3, end = freq) {
    if (!this.context || !this.enabled) return;
    const t = this.context.currentTime,
      o = this.context.createOscillator(),
      g = this.context.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, end), t + duration);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + duration);
  }
  event(type) {
    if (!this.context || !this.enabled) return;
    const now = this.context.currentTime;
    if (
      now - (this.last[type] ?? -10) <
      ({ shot: 0.09, kill: 0.06, hit: 0.2 }[type] || 0.1)
    )
      return;
    this.last[type] = now;
    if (type === "shot") this.tone(180, 0.055, "triangle", 0.2, 45);
    if (type === "kill") this.tone(380, 0.06, "sine", 0.08, 100);
    if (type === "hit") this.tone(90, 0.2, "sawtooth", 0.25, 25);
    if (type === "ui") this.tone(660, 0.08, "sine", 0.2, 880);
    if (["level", "objective", "evolve", "win"].includes(type)) {
      [0, 1, 2, 3].forEach((i) =>
        setTimeout(
          () => this.tone([330, 440, 554, 880][i], 0.3, "sine", 0.3),
          i * 85,
        ),
      );
    }
    if (type === "boss" || type === "lose")
      this.tone(110, 1.3, "sawtooth", 0.3, 30);
    if (type === "pulse") {
      this.tone(50, 0.8, "sine", 0.8, 450);
      this.tone(880, 0.7, "triangle", 0.2, 65);
    }
  }
}
