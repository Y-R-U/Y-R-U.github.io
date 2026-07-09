// Procedural Web Audio: UI/battle sfx + a gentle generative medieval loop.
import { Settings } from './save.js';

let ctx = null, master = null, musicGain = null, musicTimer = 0;

function ac() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);
    musicGain = ctx.createGain(); musicGain.gain.value = 0.34; musicGain.connect(master);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
export function unlockAudio() { ac(); }

function env(g, t, a, d, peak = 1) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}

function tone(freq, type, a, d, peak = 0.3, when = 0, dest = null) {
  if (!Settings.data.sound && dest !== musicGain) return;
  const c = ac();
  const t = c.currentTime + when;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  env(g, t, a, d, peak);
  o.connect(g).connect(dest || master);
  o.start(t); o.stop(t + a + d + 0.05);
  return o;
}

function noise(dur, filterFreq, peak = 0.3, when = 0, type = 'lowpass') {
  if (!Settings.data.sound) return;
  const c = ac();
  const t = c.currentTime + when;
  const len = Math.max(1, c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource(); src.buffer = buf;
  const f = c.createBiquadFilter(); f.type = type; f.frequency.value = filterFreq;
  const g = c.createGain(); env(g, t, 0.005, dur, peak);
  src.connect(f).connect(g).connect(master);
  src.start(t);
}

export const Sfx = {
  tap()      { tone(660, 'triangle', 0.004, 0.07, 0.16); },
  select()   { tone(520, 'triangle', 0.004, 0.09, 0.2); tone(780, 'triangle', 0.004, 0.09, 0.12, 0.03); },
  error()    { tone(160, 'square', 0.004, 0.12, 0.18); },
  coin()     { tone(1180, 'sine', 0.003, 0.12, 0.2); tone(1560, 'sine', 0.003, 0.16, 0.16, 0.05); },
  build()    { noise(0.12, 900, 0.3); tone(240, 'triangle', 0.004, 0.1, 0.25, 0.04); tone(300, 'triangle', 0.004, 0.09, 0.2, 0.12); },
  upgrade()  { tone(392, 'triangle', 0.005, 0.14, 0.24); tone(523, 'triangle', 0.005, 0.16, 0.24, 0.09); tone(659, 'triangle', 0.005, 0.2, 0.24, 0.18); },
  sell()     { tone(500, 'sine', 0.004, 0.1, 0.2); tone(360, 'sine', 0.004, 0.14, 0.2, 0.07); },
  march()    { noise(0.06, 500, 0.14); },
  arrow()    { noise(0.16, 2600, 0.14, 0, 'bandpass'); },
  hit()      { noise(0.1, 700, 0.32); tone(120, 'square', 0.004, 0.1, 0.24); },
  repel()    { tone(220, 'square', 0.004, 0.08, 0.2); tone(180, 'square', 0.004, 0.1, 0.18, 0.05); },
  razed()    { noise(0.5, 400, 0.42); tone(90, 'square', 0.01, 0.4, 0.3, 0.05); },
  merge()    { tone(440, 'triangle', 0.005, 0.12, 0.22); tone(660, 'triangle', 0.005, 0.16, 0.2, 0.08); },
  horn()     { tone(196, 'sawtooth', 0.04, 0.5, 0.16); tone(294, 'sawtooth', 0.04, 0.45, 0.1, 0.02); },
  turn()     { tone(392, 'triangle', 0.01, 0.2, 0.2); tone(494, 'triangle', 0.01, 0.24, 0.18, 0.12); },
  victory()  { [523, 659, 784, 1047].forEach((f, i) => tone(f, 'triangle', 0.01, 0.5, 0.26, i * 0.14)); },
  defeat()   { [392, 330, 262, 196].forEach((f, i) => tone(f, 'sawtooth', 0.02, 0.5, 0.16, i * 0.2)); },
};

// ---- generative music: slow pentatonic plucks over a drone ----
const SCALE = [196, 220, 262, 294, 330, 392, 440, 523];
let musicOn = false, nextNote = 0, droneOsc = null;

export function startMusic() {
  if (!Settings.data.music || musicOn) return;
  const c = ac();
  musicOn = true;
  droneOsc = c.createOscillator();
  const dg = c.createGain(); dg.gain.value = 0.05;
  droneOsc.type = 'sawtooth'; droneOsc.frequency.value = 98;
  const df = c.createBiquadFilter(); df.type = 'lowpass'; df.frequency.value = 220;
  droneOsc.connect(df).connect(dg).connect(musicGain);
  droneOsc.start();
  nextNote = c.currentTime + 0.5;
  musicTimer = setInterval(scheduleMusic, 400);
}

export function stopMusic() {
  musicOn = false;
  clearInterval(musicTimer);
  if (droneOsc) { try { droneOsc.stop(); } catch {} droneOsc = null; }
}

function scheduleMusic() {
  if (!musicOn || !ctx) return;
  const t = ctx.currentTime;
  while (nextNote < t + 1.2) {
    if (Math.random() < 0.72) {
      const f = SCALE[Math.floor(Math.random() * SCALE.length)];
      pluck(f, nextNote);
      if (Math.random() < 0.3) pluck(f * 1.5, nextNote + 0.18, 0.05);
    }
    nextNote += [0.42, 0.42, 0.84, 0.63][Math.floor(Math.random() * 4)];
  }
}

function pluck(freq, when, peak = 0.09) {
  const c = ctx;
  const o = c.createOscillator(), g = c.createGain();
  o.type = 'triangle'; o.frequency.value = freq;
  env(g, when, 0.008, 1.4, peak);
  o.connect(g).connect(musicGain);
  o.start(when); o.stop(when + 1.6);
}

export function applyAudioSettings() {
  if (Settings.data.music) startMusic(); else stopMusic();
}
