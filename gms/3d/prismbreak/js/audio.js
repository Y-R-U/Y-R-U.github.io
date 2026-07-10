// Procedural WebAudio: sfx synth + ambient music loop. No audio files.
import { save } from './save.js';

let ctx = null, master = null, musicGain = null, sfxGain = null;
let noiseBuf = null, musicTimer = null, musicStep = 0;

export function initAudio() {
  const unlock = () => {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 0.8; master.connect(ctx.destination);
    sfxGain = ctx.createGain(); sfxGain.gain.value = 0.9; sfxGain.connect(master);
    musicGain = ctx.createGain(); musicGain.gain.value = 0.3; musicGain.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    if (save.data.settings.music) startMusic();
  };
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });
}

const on = () => ctx && save.data.settings.sfx;

function tone(freq, dur, type = 'sine', vol = 0.3, slideTo = null, delay = 0) {
  if (!on()) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(slideTo, 1), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(sfxGain);
  o.start(t); o.stop(t + dur + 0.02);
}

function noise(dur, vol = 0.3, filterFreq = 3000, type = 'highpass', delay = 0) {
  if (!on()) return;
  const t = ctx.currentTime + delay;
  const src = ctx.createBufferSource(); src.buffer = noiseBuf;
  src.playbackRate.value = 0.8 + Math.random() * 0.4;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = filterFreq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f); f.connect(g); g.connect(sfxGain);
  src.start(t); src.stop(t + dur + 0.02);
}

// the bejeweled rising ladder — pentatonic per cascade level
const LADDER = [261.6, 293.7, 329.6, 392.0, 440.0, 523.3, 587.3, 659.3, 784.0, 880.0, 1046.5, 1174.7];

export const sfx = {
  click() { tone(700, 0.05, 'square', 0.12); },
  swap() { tone(300, 0.09, 'sine', 0.2, 500); },
  badSwap() { tone(180, 0.16, 'sawtooth', 0.18, 120); },
  pop(cascade, i = 0) {
    const f = LADDER[Math.min(cascade - 1 + Math.floor(i / 3), LADDER.length - 1)];
    tone(f, 0.22, 'sine', 0.28, f * 1.5, i * 0.015);
    tone(f * 2, 0.14, 'triangle', 0.12, null, i * 0.015);
  },
  glass(delay = 0) {
    noise(0.25, 0.3, 5000, 'highpass', delay);
    tone(2400 + Math.random() * 800, 0.12, 'sine', 0.12, 3600, delay);
  },
  clang(delay = 0) {
    tone(220, 0.3, 'square', 0.22, 190, delay);
    tone(660, 0.18, 'triangle', 0.14, 620, delay);
    noise(0.08, 0.18, 1200, 'bandpass', delay);
  },
  crush() {
    noise(0.4, 0.45, 4200, 'highpass');
    tone(140, 0.3, 'sawtooth', 0.3, 60);
    tone(2800, 0.2, 'sine', 0.16, 4200, 0.02);
  },
  beam() { noise(0.3, 0.3, 2000, 'bandpass'); tone(900, 0.28, 'sawtooth', 0.16, 200); },
  boom() {
    tone(90, 0.5, 'sine', 0.5, 40);
    noise(0.45, 0.4, 800, 'lowpass');
  },
  nova() {
    tone(60, 0.9, 'sine', 0.6, 30);
    noise(0.8, 0.5, 600, 'lowpass');
    tone(1200, 0.7, 'sawtooth', 0.15, 100, 0.05);
  },
  prismCast() {
    for (let i = 0; i < 6; i++) tone(523 * Math.pow(1.2, i), 0.3, 'sine', 0.16, null, i * 0.045);
  },
  forge() { tone(120, 0.4, 'square', 0.3, 80); noise(0.3, 0.3, 1500, 'bandpass'); },
  hint() { tone(880, 0.1, 'sine', 0.1, 990); },
  shuffle() { for (let i = 0; i < 5; i++) noise(0.06, 0.12, 2500, 'bandpass', i * 0.05); },
  star(i = 0) { tone(660 * Math.pow(1.335, i), 0.5, 'sine', 0.3, null, 0); tone(1320 * Math.pow(1.335, i), 0.3, 'triangle', 0.15); },
  win() {
    const notes = [523, 659, 784, 1046, 1318];
    notes.forEach((f, i) => { tone(f, 0.4, 'triangle', 0.25, null, i * 0.1); tone(f / 2, 0.5, 'sine', 0.2, null, i * 0.1); });
  },
  lose() { [392, 349, 311, 262].forEach((f, i) => tone(f, 0.4, 'triangle', 0.22, null, i * 0.18)); },
  reward() { [659, 784, 1046].forEach((f, i) => tone(f, 0.3, 'sine', 0.25, null, i * 0.08)); },
  mega() { [523, 659, 784, 1046, 1318, 1568].forEach((f, i) => { tone(f, 0.5, 'triangle', 0.22, null, i * 0.09); }); noise(0.6, 0.2, 5000, 'highpass', 0.4); },
  tick() { tone(1000, 0.04, 'square', 0.07); },
  timeLow() { tone(1200, 0.09, 'square', 0.18); },
};

// ── ambient music: soft pads + gentle pentatonic arpeggio ─────────────
const CHORDS = [
  [220.0, 261.6, 329.6],   // Am
  [174.6, 220.0, 261.6],   // F
  [196.0, 246.9, 293.7],   // G
  [261.6, 329.6, 392.0],   // C
];
const ARP = [440, 523.3, 659.3, 783.9, 659.3, 523.3];

function startMusic() {
  if (!ctx || musicTimer) return;
  const stepDur = 0.32;
  let nextTime = ctx.currentTime + 0.1;
  musicTimer = setInterval(() => {
    if (!save.data.settings.music) return;
    while (nextTime < ctx.currentTime + 0.6) {
      const bar = Math.floor(musicStep / 16) % CHORDS.length;
      const step = musicStep % 16;
      if (step === 0) {
        // pad chord
        for (const f of CHORDS[bar]) {
          const o = ctx.createOscillator(), g = ctx.createGain();
          o.type = 'sine'; o.frequency.value = f;
          g.gain.setValueAtTime(0.0001, nextTime);
          g.gain.linearRampToValueAtTime(0.05, nextTime + 1.2);
          g.gain.linearRampToValueAtTime(0.0001, nextTime + stepDur * 16);
          o.connect(g); g.connect(musicGain);
          o.start(nextTime); o.stop(nextTime + stepDur * 16 + 0.1);
        }
      }
      if (step % 2 === 0 && Math.random() < 0.7) {
        const f = ARP[(musicStep / 2) % ARP.length] * (bar % 2 ? 0.75 : 1);
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'triangle'; o.frequency.value = f;
        g.gain.setValueAtTime(0.045, nextTime);
        g.gain.exponentialRampToValueAtTime(0.001, nextTime + 0.5);
        o.connect(g); g.connect(musicGain);
        o.start(nextTime); o.stop(nextTime + 0.55);
      }
      nextTime += stepDur;
      musicStep++;
    }
  }, 150);
}

export function setMusic(onOff) {
  save.data.settings.music = onOff;
  if (onOff && ctx) startMusic();
  if (!onOff && musicTimer) { clearInterval(musicTimer); musicTimer = null; }
}
