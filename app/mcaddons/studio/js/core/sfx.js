// Tiny WebAudio blips. Never loads a file; everything is synthesised.
import { settings } from './store.js';

let ctx = null;
function ac() {
  if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

const NOTES = {
  click: [{ f: 620, t: 0.03, g: 0.05, w: 'square' }],
  pop:   [{ f: 380, t: 0.05, g: 0.08, w: 'sine', s: 760 }],
  good:  [{ f: 660, t: 0.08, g: 0.07, w: 'triangle' }, { f: 990, t: 0.12, g: 0.06, w: 'triangle', d: 0.07 }],
  ding:  [{ f: 880, t: 0.18, g: 0.05, w: 'sine' }, { f: 1320, t: 0.22, g: 0.03, w: 'sine', d: 0.05 }],
  bad:   [{ f: 200, t: 0.16, g: 0.08, w: 'sawtooth', s: 90 }],
  place: [{ f: 180, t: 0.06, g: 0.10, w: 'square', s: 120 }],
  hit:   [{ f: 300, t: 0.07, g: 0.09, w: 'square', s: 140 }],
  win:   [{ f: 523, t: 0.1, g: 0.06, w: 'triangle' }, { f: 659, t: 0.1, g: 0.06, w: 'triangle', d: 0.09 },
          { f: 784, t: 0.1, g: 0.06, w: 'triangle', d: 0.18 }, { f: 1047, t: 0.26, g: 0.06, w: 'triangle', d: 0.27 }]
};

export const sfx = {
  play(name) {
    if (!settings.get('sound')) return;
    const spec = NOTES[name]; if (!spec) return;
    const a = ac(); if (!a) return;
    const now = a.currentTime;
    for (const n of spec) {
      const o = a.createOscillator(), g = a.createGain();
      o.type = n.w || 'sine';
      const t0 = now + (n.d || 0);
      o.frequency.setValueAtTime(n.f, t0);
      if (n.s) o.frequency.exponentialRampToValueAtTime(Math.max(20, n.s), t0 + n.t);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(n.g, t0 + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + n.t);
      o.connect(g).connect(a.destination);
      o.start(t0); o.stop(t0 + n.t + 0.02);
    }
  }
};
