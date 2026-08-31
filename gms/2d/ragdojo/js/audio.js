// Procedural SFX (Web Audio) + a small music manager. Music files are optional:
// if the mp3s are absent the game runs silent rather than erroring.

let ctx = null, master = null, sfxGain = null, musGain = null, noiseBuf = null;
let enabledSfx = true, enabledMusic = true;
let curTrack = null, curEl = null, curGain = null;
const cache = new Map();

export function init() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
  sfxGain = ctx.createGain(); sfxGain.gain.value = 0.85; sfxGain.connect(master);
  musGain = ctx.createGain(); musGain.gain.value = 0.55; musGain.connect(master);
  const n = ctx.sampleRate * 2;
  noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  return ctx;
}

export function resume() { if (ctx && ctx.state === 'suspended') ctx.resume(); }
export function setSfx(on) { enabledSfx = on; }
export function setMusic(on) {
  enabledMusic = on;
  if (!on) stopMusic();
  else if (curTrack) play(curTrack, true);
}

function noise(dur, { type = 'bandpass', freq = 1200, q = 1, gain = 0.5, decay = 0.12, sweep = 0 } = {}) {
  if (!ctx || !enabledSfx) return;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.playbackRate.value = 0.8 + Math.random() * 0.4;
  const f = ctx.createBiquadFilter();
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  if (sweep) {
    f.frequency.setValueAtTime(freq, ctx.currentTime);
    f.frequency.exponentialRampToValueAtTime(Math.max(80, freq + sweep), ctx.currentTime + dur);
  }
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + decay);
  src.connect(f); f.connect(g); g.connect(sfxGain);
  src.start(); src.stop(ctx.currentTime + dur);
}

function tone(freq, dur, { type = 'sine', gain = 0.3, to = null, delay = 0 } = {}) {
  if (!ctx || !enabledSfx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  const t0 = ctx.currentTime + delay;
  o.frequency.setValueAtTime(freq, t0);
  if (to) o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(sfxGain);
  o.start(t0); o.stop(t0 + dur + 0.02);
}

export const sfx = {
  hit(power = 1) {
    noise(0.16, { freq: 900 + power * 500, q: 0.9, gain: 0.34 + power * 0.16, decay: 0.10, sweep: -600 });
    tone(150 - power * 30, 0.14, { type: 'sine', gain: 0.24 + power * 0.1, to: 60 });
  },
  heavy(power = 1) {
    noise(0.3, { freq: 500, q: 0.7, gain: 0.5, decay: 0.22, sweep: -380 });
    tone(105, 0.26, { type: 'sine', gain: 0.42, to: 42 });
    tone(220, 0.10, { type: 'square', gain: 0.10, to: 90 });
  },
  whoosh() { noise(0.22, { freq: 420, q: 1.6, gain: 0.17, decay: 0.18, sweep: 1500 }); },
  paper() { noise(0.13, { type: 'highpass', freq: 2600, gain: 0.16, decay: 0.10 }); },
  crumple() {
    for (let i = 0; i < 4; i++) {
      setTimeout(() => noise(0.09, { type: 'highpass', freq: 2000 + Math.random() * 2200, gain: 0.13, decay: 0.07 }), i * 45);
    }
  },
  thud() {
    noise(0.18, { freq: 260, q: 0.8, gain: 0.3, decay: 0.14, sweep: -160 });
    tone(78, 0.2, { type: 'sine', gain: 0.3, to: 38 });
  },
  twang() { tone(680, 0.28, { type: 'triangle', gain: 0.24, to: 190 }); },
  boom() {
    noise(0.6, { freq: 380, q: 0.5, gain: 0.6, decay: 0.5, sweep: -300 });
    tone(70, 0.5, { type: 'sine', gain: 0.5, to: 28 });
  },
  scratch() { noise(0.07, { type: 'highpass', freq: 3400, gain: 0.07, decay: 0.05 }); },
  ping() { tone(1180, 0.3, { type: 'sine', gain: 0.2, to: 1180 }); tone(1770, 0.22, { type: 'sine', gain: 0.09, delay: 0.03 }); },
  coin() { tone(880, 0.09, { type: 'square', gain: 0.13 }); tone(1320, 0.16, { type: 'square', gain: 0.11, delay: 0.07 }); },
  ko() {
    tone(420, 0.7, { type: 'sawtooth', gain: 0.24, to: 60 });
    setTimeout(() => sfx.boom(), 90);
  },
  bell() {
    [660, 990, 1320].forEach((f, i) => tone(f, 1.1 - i * 0.2, { type: 'sine', gain: 0.16 - i * 0.04, delay: i * 0.015 }));
  },
  fail() { tone(300, 0.5, { type: 'sawtooth', gain: 0.18, to: 90 }); },
  click() { noise(0.04, { type: 'highpass', freq: 3000, gain: 0.1, decay: 0.03 }); },
};

// ── music ──────────────────────────────────────────────────────────────────
let TRACKS = {};
export function registerTracks(map) { TRACKS = map || {}; }

function el(src) {
  if (cache.has(src)) return cache.get(src);
  const a = new Audio();
  a.src = src;
  a.loop = true;
  a.preload = 'auto';
  a.volume = 0;
  a.addEventListener('error', () => { /* missing track: stay silent */ });
  cache.set(src, a);
  return a;
}

export function play(id, force = false) {
  if (!enabledMusic) { curTrack = id; return; }
  if (curTrack === id && !force && curEl && !curEl.paused) return;
  const src = TRACKS[id];
  curTrack = id;
  if (!src) { stopMusic(); return; }
  const next = el(src);
  const prev = curEl;
  curEl = next;
  next.currentTime = next.currentTime || 0;
  const p = next.play();
  if (p && p.catch) p.catch(() => { /* autoplay blocked until first tap */ });
  fade(next, 0.62, 0.7);
  if (prev && prev !== next) fade(prev, 0, 0.5, true);
}

function fade(a, to, secs, stopAfter = false) {
  const from = a.volume;
  const t0 = performance.now();
  const step = () => {
    const u = Math.min(1, (performance.now() - t0) / (secs * 1000));
    try { a.volume = Math.max(0, Math.min(1, from + (to - from) * u)); } catch { /* detached */ }
    if (u < 1) requestAnimationFrame(step);
    else if (stopAfter) { try { a.pause(); } catch { /* ignore */ } }
  };
  step();
}

export function stopMusic() {
  if (curEl) { fade(curEl, 0, 0.35, true); curEl = null; }
}
export function duck(on) { if (musGain) musGain.gain.value = on ? 0.18 : 0.55; }
