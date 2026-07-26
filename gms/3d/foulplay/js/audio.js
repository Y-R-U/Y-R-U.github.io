// Procedural audio. No files: an engine built from two detuned saws through a
// filter, a crowd built from noise, impacts built from noise bursts, and a
// two-line sequencer for the music.

import { profile } from './save.js';
import { state } from './state.js';
import { on } from './bus.js';
import { clamp, clamp01, lerp, rand } from './utils.js';

let ctx = null;
let master = null;
let sfxBus = null;
let musicBus = null;
let noiseBuf = null;

let engine = null;
let crowd = null;
let wind = null;
let music = null;
let started = false;

// ---------------------------------------------------------------------------
export function initAudio() {
  const arm = () => {
    if (started) return;
    started = true;
    try { build(); } catch (e) { console.warn('[audio] unavailable', e); }
  };
  window.addEventListener('pointerdown', arm, { once: true });
  window.addEventListener('keydown', arm, { once: true });
  window.addEventListener('touchstart', arm, { once: true, passive: true });
  wireEvents();
}

function build() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(ctx.destination);

  sfxBus = ctx.createGain();
  sfxBus.gain.value = profile.settings.sfx ? 0.85 : 0;
  sfxBus.connect(master);

  musicBus = ctx.createGain();
  musicBus.gain.value = profile.settings.music ? 0.32 : 0;
  musicBus.connect(master);

  // shared noise buffer
  const len = ctx.sampleRate * 2;
  noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

  buildEngine();
  buildCrowd();
  buildWind();
  if (pendingMusic) playMusic(pendingMusic);
}

function buildEngine() {
  const g = ctx.createGain();
  g.gain.value = 0;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 900;
  filter.Q.value = 3.5;

  const o1 = ctx.createOscillator();
  o1.type = 'sawtooth';
  o1.frequency.value = 70;
  const o2 = ctx.createOscillator();
  o2.type = 'square';
  o2.frequency.value = 35;
  const o2g = ctx.createGain();
  o2g.gain.value = 0.35;

  // a little grit
  const rasp = ctx.createBufferSource();
  rasp.buffer = noiseBuf;
  rasp.loop = true;
  const raspG = ctx.createGain();
  raspG.gain.value = 0.05;

  o1.connect(filter);
  o2.connect(o2g).connect(filter);
  rasp.connect(raspG).connect(filter);
  filter.connect(g).connect(sfxBus);
  o1.start(); o2.start(); rasp.start();

  engine = { g, filter, o1, o2, level: 0 };
}

function buildCrowd() {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 900;
  bp.Q.value = 0.7;
  const g = ctx.createGain();
  g.gain.value = 0;
  src.connect(bp).connect(g).connect(sfxBus);
  src.start();
  crowd = { g, bp };
}

function buildWind() {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 500;
  const g = ctx.createGain();
  g.gain.value = 0;
  src.connect(lp).connect(g).connect(sfxBus);
  src.start();
  wind = { g, lp };
}

// ---------------------------------------------------------------------------
// One-shots
// ---------------------------------------------------------------------------
function noiseBurst(dur, freq, q, gain, sweepTo) {
  if (!ctx) return;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = q;
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(Math.max(40, sweepTo), ctx.currentTime + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0008, ctx.currentTime + dur);
  src.connect(f).connect(g).connect(sfxBus);
  src.start();
  src.stop(ctx.currentTime + dur + 0.02);
}

function tone(freq, dur, type = 'sine', gain = 0.2, sweepTo = null, delay = 0) {
  if (!ctx) return;
  const t0 = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (sweepTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, sweepTo), t0 + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(sfxBus);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

export function sfx(kind, intensity = 1) {
  if (!ctx || !profile.settings.sfx) return;
  const i = clamp(intensity, 0.1, 2);
  switch (kind) {
    case 'hit': noiseBurst(0.16 * i, 320, 1.1, 0.34 * i, 90); tone(74, 0.13, 'square', 0.16 * i, 40); break;
    case 'scrape': noiseBurst(0.2, 2600, 6, 0.13 * i, 1400); break;
    case 'crash': noiseBurst(0.5 * i, 240, 0.7, 0.5, 60); tone(58, 0.35, 'sawtooth', 0.22, 26); break;
    case 'partoff': noiseBurst(0.18, 1400, 3, 0.2, 500); break;
    case 'boost': tone(180, 0.5, 'sawtooth', 0.16, 900); noiseBurst(0.42, 700, 1, 0.12, 3200); break;
    case 'pad': tone(520, 0.22, 'triangle', 0.16, 1200); break;
    case 'pickup': tone(700, 0.1, 'square', 0.13); tone(1050, 0.12, 'square', 0.1, null, 0.08); break;
    case 'chest': [523, 659, 784, 1046].forEach((f, k) => tone(f, 0.3, 'triangle', 0.16, null, k * 0.09)); break;
    case 'attack': noiseBurst(0.24, 900, 2, 0.24, 220); tone(140, 0.2, 'sawtooth', 0.14, 50); break;
    case 'alarm': tone(880, 0.14, 'square', 0.14); tone(660, 0.16, 'square', 0.14, null, 0.16); break;
    case 'fine': tone(300, 0.5, 'sawtooth', 0.2, 90); noiseBurst(0.4, 400, 1, 0.14, 120); break;
    case 'cleared': [660, 880, 1100].forEach((f, k) => tone(f, 0.26, 'triangle', 0.15, null, k * 0.08)); break;
    case 'light': tone(440, 0.13, 'square', 0.18); break;
    case 'go': tone(880, 0.42, 'square', 0.22); break;
    case 'ui': tone(620, 0.05, 'square', 0.07); break;
    case 'cine': tone(120, 0.9, 'sine', 0.11, 70); break;
    case 'lap': tone(760, 0.12, 'triangle', 0.13); tone(1010, 0.16, 'triangle', 0.11, null, 0.1); break;
    default: break;
  }
}

function wireEvents() {
  on('car:railHit', ({ impact }) => sfx(impact > 12 ? 'hit' : 'scrape', clamp(impact / 14, 0.3, 1.6)));
  on('race:contact', ({ closing, a, b }) => {
    if (a.isPlayer || b.isPlayer) sfx('hit', clamp(closing / 16, 0.3, 1.5));
  });
  on('car:wreck', ({ car }) => { if (car.isPlayer || Math.random() < 0.6) sfx('crash', car.isPlayer ? 1.4 : 0.8); });
  on('car:partOff', ({ car }) => sfx('partoff', car.isPlayer ? 1.2 : 0.7));
  on('car:boost', ({ car }) => { if (car.isPlayer) sfx('boost'); });
  on('car:padBoost', ({ car }) => { if (car.isPlayer) sfx('pad'); });
  on('pickup:boost', () => sfx('pickup'));
  on('pickup:chest', () => sfx('pickup', 1.3));
  on('attack:fired', ({ car }) => { if (car.isPlayer) sfx('attack'); });
  on('steward:investigating', () => sfx('alarm'));
  on('steward:verdict', ({ cleared }) => sfx(cleared ? 'cleared' : 'fine'));
  on('car:lap', ({ car }) => { if (car.isPlayer) sfx('lap'); });
  on('race:go', () => sfx('go'));
}

// ---------------------------------------------------------------------------
// Continuous layers
// ---------------------------------------------------------------------------
export function updateAudio(dt) {
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume();

  if (sfxBus) sfxBus.gain.value = profile.settings.sfx ? 0.85 : 0;
  if (musicBus) musicBus.gain.value = profile.settings.music ? 0.3 : 0;

  const p = state.player;
  const racing = state.screen === 'race' && p && !state.paused;

  if (engine) {
    if (racing) {
      const v = Math.max(0, p.forwardSpeed);
      const rev = 62 + (v % 22) * 6 + Math.min(v, 74) * 1.4;
      engine.o1.frequency.setTargetAtTime(rev, ctx.currentTime, 0.05);
      engine.o2.frequency.setTargetAtTime(rev * 0.5, ctx.currentTime, 0.05);
      engine.filter.frequency.setTargetAtTime(500 + v * 26 + (p.boosting ? 1400 : 0), ctx.currentTime, 0.08);
      const want = (p.mode === 'grid' ? 0.03 : 0.1 + clamp01(v / 74) * 0.14) * (p.stun > 0 ? 0.2 : 1);
      engine.g.gain.setTargetAtTime(want, ctx.currentTime, 0.09);
    } else {
      engine.g.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
    }
  }

  if (crowd) {
    const want = racing ? 0.02 + clamp01(state.hype / 100) * 0.13 : (state.screen === 'race' ? 0.02 : 0);
    crowd.g.gain.setTargetAtTime(want, ctx.currentTime, 0.4);
    crowd.bp.frequency.setTargetAtTime(700 + clamp01(state.hype / 100) * 900, ctx.currentTime, 0.5);
  }

  if (wind) {
    const v = racing ? Math.max(0, p.forwardSpeed) : 0;
    wind.g.gain.setTargetAtTime(clamp01(v / 74) * 0.07, ctx.currentTime, 0.15);
    wind.lp.frequency.setTargetAtTime(300 + v * 14, ctx.currentTime, 0.2);
  }

  if (music) stepMusic();
}

// ---------------------------------------------------------------------------
// Music: a two-bar loop scheduled a beat at a time.
// ---------------------------------------------------------------------------
const TUNES = {
  menu: { bpm: 96, bass: [0, 0, 7, 5, 3, 3, 7, 5], lead: [12, 15, 19, 15, 14, 12, 10, 12], root: 55, drums: 0.4 },
  race: { bpm: 148, bass: [0, 0, 3, 0, 5, 5, 3, 7], lead: [12, 12, 15, 17, 19, 17, 15, 12], root: 49, drums: 1 },
};

let pendingMusic = null;

export function playMusic(name) {
  if (!ctx) { pendingMusic = name; return; }
  const tune = TUNES[name];
  if (!tune) return;
  if (music && music.name === name) return;
  music = { name, tune, step: 0, next: ctx.currentTime + 0.08 };
}

export function stopMusic() { music = null; }

function stepMusic() {
  const { tune } = music;
  const beat = 60 / tune.bpm / 2;
  let guard = 0;
  while (music.next < ctx.currentTime + 0.25 && guard++ < 8) {
    const t = music.next;
    const i = music.step % 8;
    const semi = (n) => tune.root * Math.pow(2, n / 12);

    mNote(semi(tune.bass[i]), beat * 0.9, 'sawtooth', 0.15, t, 260);
    if (music.step % 2 === 0) mNote(semi(tune.lead[i]) * 2, beat * 0.55, 'square', 0.045, t, 2400);
    if (tune.drums) {
      if (i % 4 === 0) mNoise(0.1, 140, 0.7, 0.22 * tune.drums, t);
      if (i % 4 === 2) mNoise(0.07, 2200, 1.4, 0.1 * tune.drums, t);
    }
    music.next += beat;
    music.step++;
  }
}

function mNote(freq, dur, type, gain, t, cutoff) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = cutoff;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(f).connect(g).connect(musicBus);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function mNoise(dur, freq, q, gain, t) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
  src.connect(f).connect(g).connect(musicBus);
  src.start(t);
  src.stop(t + dur + 0.02);
}
