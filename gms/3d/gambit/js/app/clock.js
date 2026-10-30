// Game clock owned by the UI so it can honour D6: the side to move's clock is
// started only after the previous move's animation (incl. battle) finishes.
// (Core also exports a Clock; this one is a deliberate UI-side copy because the
// start/stop timing is a presentation concern. Same maths: Fischer increment.)
export class GameClock {
  constructor({ baseMs, incMs = 0 }) {
    this.unlimited = !baseMs;
    this.incMs = incMs;
    this.ms = { w: baseMs || 0, b: baseMs || 0 };
    this.running = null; this.t0 = 0;
  }
  start(color) { if (this.unlimited) return; this.stop(); this.running = color; this.t0 = performance.now(); }
  stop() {
    if (!this.running) return;
    this.ms[this.running] = Math.max(0, this.ms[this.running] - (performance.now() - this.t0));
    this.running = null;
  }
  // a move was made by `color`: bank its time and add the increment
  press(color) { if (this.unlimited) return; if (this.running === color) this.stop(); this.ms[color] += this.incMs; }
  remaining(color) {
    if (this.running === color) return Math.max(0, this.ms[color] - (performance.now() - this.t0));
    return this.ms[color];
  }
  set(w, b) { this.ms = { w, b }; }
}

export function fmtClock(ms) {
  if (ms == null) return '';
  if (ms < 20000) {
    const s = Math.max(0, ms) / 1000;
    return `0:${s < 10 ? '0' : ''}${s.toFixed(1)}`;
  }
  const t = Math.ceil(ms / 1000), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

// DECISIONS D8
export const TIME_CONTROLS = [
  { group: 'Bullet', items: ['1+0', '2+1'] },
  { group: 'Blitz', items: ['3+0', '3+2', '5+0', '5+3'] },
  { group: 'Rapid', items: ['10+0', '10+5', '15+10'] },
  { group: 'Classical', items: ['30+0'] },
  { group: 'Unlimited', items: ['unlimited'] },
];
export function parseTc(tc) {
  if (!tc || tc === 'unlimited') return { baseMs: 0, incMs: 0, label: 'Unlimited', group: 'Unlimited', unlimited: true };
  const [m, i] = tc.split('+').map(Number);
  const group = TIME_CONTROLS.find(g => g.items.includes(tc))?.group || 'Custom';
  return { baseMs: m * 60000, incMs: i * 1000, label: `${m} | ${i}`, group, unlimited: false };
}
