// Tiny WebAudio sound set used unless a theme supplies its own sounds.
import { getSettings } from './store.js';
let ctx = null;
function ac() {
  if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; } }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}
function tone(freq, dur, { type = 'sine', gain = 0.18, at = 0, slide = 0 } = {}) {
  const c = ac(); if (!c) return;
  const t = c.currentTime + at;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + 0.02);
}
function knock(gain = 0.35) {
  const c = ac(); if (!c) return;
  const len = 0.06, buf = c.createBuffer(1, c.sampleRate * len, c.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 4);
  const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  s.buffer = buf; f.type = 'lowpass'; f.frequency.value = 1800; g.gain.value = gain;
  s.connect(f).connect(g).connect(c.destination); s.start();
}
const SOUNDS = {
  move: () => { knock(0.3); tone(220, 0.07, { gain: 0.06 }); },
  capture: () => { knock(0.5); tone(160, 0.12, { type: 'triangle', gain: 0.12, slide: -60 }); },
  check: () => { tone(880, 0.1, { gain: 0.1 }); tone(660, 0.14, { gain: 0.08, at: 0.08 }); },
  castle: () => { knock(0.3); setTimeout(() => knock(0.25), 90); },
  start: () => { tone(523, 0.12, { gain: 0.1 }); tone(784, 0.18, { gain: 0.1, at: 0.1 }); },
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, { gain: 0.1, at: i * 0.1 })),
  lose: () => [392, 330, 262].forEach((f, i) => tone(f, 0.28, { type: 'triangle', gain: 0.1, at: i * 0.14 })),
  draw: () => { tone(440, 0.2, { gain: 0.08 }); tone(440, 0.2, { gain: 0.08, at: 0.2 }); },
  tap: () => tone(1200, 0.03, { gain: 0.04 }),
  lowtime: () => tone(1000, 0.06, { type: 'square', gain: 0.05 }),
};
export function play(name) { if (!getSettings().sound) return; try { SOUNDS[name] && SOUNDS[name](); } catch { /* audio blocked */ } }
export function unlockAudio() { if (getSettings().sound) ac(); }
