export class Sound {
  constructor() { this.enabled = false; this.ctx = null; this.lastTick = -1; }
  enable(value) {
    this.enabled = value;
    if (value) {
      this.ctx ||= new (window.AudioContext || window.webkitAudioContext)();
      this.ctx.resume();
    }
  }
  tone(freq, duration, volume = 0.08, type = 'sine', delay = 0) {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type; osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(volume, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain); gain.connect(this.ctx.destination);
    osc.start(t); osc.stop(t + duration + 0.02);
  }
  click() { this.tone(1300, .045, .035, 'triangle'); this.tone(2700, .025, .014); }
  glass() {
    for (let i = 0; i < 14; i++) this.tone(1200 + i * 317, .35 + i * .023, .015, 'sine', i * .013);
    this.tone(74, .6, .1, 'triangle');
  }
  wind() { for (let i = 0; i < 8; i++) this.tone(220 + i * 33, .14, .022, 'triangle', i * .08); }
  rewind() { for (let i = 0; i < 8; i++) this.tone(850 - i * 70, .25, .014, 'sine', i * .04); }
  win() { [440, 554.37, 659.25, 880].forEach((n, i) => this.tone(n, 1.5, .04, 'sine', i * .15)); }
  tick(time, active) {
    const step = Math.floor(time * 2);
    if (step !== this.lastTick && active) this.tone(step % 2 ? 1700 : 2200, .024, .012, 'triangle');
    this.lastTick = step;
  }
}
