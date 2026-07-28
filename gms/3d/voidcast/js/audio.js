// audio.js — everything is synthesised; no audio files ship with the game.

let ctx = null, master = null, musicGain = null, sfxGain = null;
let noiseBuf = null;
let enabled = true, musicOn = true;
let seq = null;

export function initAudio() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = 0.85; master.connect(ctx.destination);
  sfxGain = ctx.createGain(); sfxGain.gain.value = 1; sfxGain.connect(master);
  musicGain = ctx.createGain(); musicGain.gain.value = 0.34; musicGain.connect(master);
  const len = ctx.sampleRate * 2;
  noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return ctx;
}

export function resumeAudio() { if (ctx && ctx.state === 'suspended') ctx.resume(); }
export function setSfxEnabled(v) { enabled = v; if (sfxGain) sfxGain.gain.value = v ? 1 : 0; }
export function setMusicEnabled(v) {
  musicOn = v;
  if (musicGain) musicGain.gain.setTargetAtTime(v ? 0.34 : 0, ctx.currentTime, 0.2);
}
export function audioReady() { return !!ctx; }

function now() { return ctx.currentTime; }

function tone(freq, dur, type, vol, attack, target) {
  if (!ctx || !enabled) return null;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type || 'sine';
  o.frequency.setValueAtTime(freq, now());
  g.gain.setValueAtTime(0, now());
  g.gain.linearRampToValueAtTime(vol == null ? 0.2 : vol, now() + (attack == null ? 0.008 : attack));
  g.gain.exponentialRampToValueAtTime(0.0001, now() + dur);
  o.connect(g); g.connect(target || sfxGain);
  o.start(); o.stop(now() + dur + 0.02);
  return { o, g };
}

function noise(dur, vol, freq, q, type) {
  if (!ctx || !enabled) return;
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf; s.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = type || 'bandpass';
  f.frequency.value = freq || 900;
  f.Q.value = q || 1;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, now());
  g.gain.linearRampToValueAtTime(vol, now() + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, now() + dur);
  s.connect(f); f.connect(g); g.connect(sfxGain);
  s.start(); s.stop(now() + dur + 0.02);
  return { f, g };
}

// ── game sounds ─────────────────────────────────────────────────────────────

export function sfxSwallow(tier, combo) {
  if (!ctx || !enabled) return;
  const base = 420 / Math.pow(1.28, tier - 1);
  const t = tone(base * 1.6, 0.16 + tier * 0.03, 'sine', 0.16);
  if (t) t.o.frequency.exponentialRampToValueAtTime(base * 0.45, now() + 0.14 + tier * 0.03);
  noise(0.1 + tier * 0.02, 0.05 + tier * 0.012, 260 + tier * 90, 0.8);
  if (combo > 1) {
    const c = Math.min(combo, 24);
    tone(300 * Math.pow(1.0595, c * 2), 0.1, 'triangle', 0.075);
  }
}

export function sfxBigSwallow(tier) {
  if (!ctx || !enabled) return;
  const t = tone(90, 0.7, 'sawtooth', 0.16);
  if (t) t.o.frequency.exponentialRampToValueAtTime(34, now() + 0.65);
  noise(0.55, 0.14, 180, 0.5, 'lowpass');
  crowd(0.55, 0.5);
}

export function sfxTierUp() {
  if (!ctx || !enabled) return;
  [0, 4, 7, 12].forEach((s, i) => {
    setTimeout(() => tone(330 * Math.pow(2, s / 12), 0.4, 'triangle', 0.13), i * 62);
  });
  crowd(0.8, 0.7);
}

export function sfxHit() {
  if (!ctx || !enabled) return;
  noise(0.3, 0.2, 380, 0.7, 'lowpass');
  const t = tone(180, 0.28, 'square', 0.1);
  if (t) t.o.frequency.exponentialRampToValueAtTime(52, now() + 0.26);
}

export function sfxShot() {
  if (!ctx || !enabled) return;
  const t = tone(880, 0.14, 'sawtooth', 0.07);
  if (t) t.o.frequency.exponentialRampToValueAtTime(220, now() + 0.13);
}

export function sfxUi(up) {
  if (!ctx || !enabled) return;
  tone(up === false ? 340 : 640, 0.08, 'triangle', 0.09);
}

export function sfxBoon() {
  if (!ctx || !enabled) return;
  [0, 7, 12, 16, 19].forEach((s, i) => setTimeout(() => tone(392 * Math.pow(2, s / 12), 0.45, 'sine', 0.11), i * 55));
}

export function sfxFail() {
  if (!ctx || !enabled) return;
  [0, -3, -7, -12].forEach((s, i) => setTimeout(() => tone(300 * Math.pow(2, s / 12), 0.5, 'sawtooth', 0.09), i * 130));
}

export function sfxWin() {
  if (!ctx || !enabled) return;
  [0, 4, 7, 12, 16, 19, 24].forEach((s, i) => setTimeout(() => tone(262 * Math.pow(2, s / 12), 0.6, 'triangle', 0.12), i * 90));
  crowd(1.6, 1);
}

/** the alien audience — a filtered noise swell */
export function crowd(dur, intensity) {
  if (!ctx || !enabled) return;
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf; s.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass'; f.frequency.value = 1100; f.Q.value = 0.55;
  const g = ctx.createGain();
  const v = 0.05 + 0.13 * intensity;
  g.gain.setValueAtTime(0.0001, now());
  g.gain.exponentialRampToValueAtTime(v, now() + dur * 0.22);
  g.gain.exponentialRampToValueAtTime(0.0001, now() + dur);
  f.frequency.setValueAtTime(700, now());
  f.frequency.linearRampToValueAtTime(1700, now() + dur * 0.3);
  s.connect(f); f.connect(g); g.connect(sfxGain);
  s.start(); s.stop(now() + dur + 0.05);
}

// ── music ───────────────────────────────────────────────────────────────────

const SCALES = {
  scrap: [0, 3, 5, 7, 10],
  colony: [0, 2, 4, 7, 9],
  hive: [0, 2, 3, 7, 8],
  sanctum: [0, 2, 4, 6, 9],
  verge: [0, 1, 5, 6, 10],
  menu: [0, 3, 5, 7, 10],
};

export function startMusic(themeKey, bpm) {
  if (!ctx) return;
  stopMusic();
  const scale = SCALES[themeKey] || SCALES.scrap;
  const root = 110;
  const step = 60 / (bpm || 92) / 2;
  let i = 0;
  // slow pad
  const pad = ctx.createOscillator();
  const padG = ctx.createGain();
  const padF = ctx.createBiquadFilter();
  padF.type = 'lowpass'; padF.frequency.value = 420;
  pad.type = 'sawtooth'; pad.frequency.value = root / 2;
  padG.gain.value = 0.05;
  pad.connect(padF); padF.connect(padG); padG.connect(musicGain);
  pad.start();
  const tick = () => {
    if (!seq) return;
    const n = scale[(i * 3 + (i >> 2)) % scale.length] + (i % 8 < 4 ? 0 : 12);
    const f = root * Math.pow(2, n / 12) * 2;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = i % 4 === 0 ? 'square' : 'triangle';
    o.frequency.value = f;
    g.gain.setValueAtTime(0, now());
    g.gain.linearRampToValueAtTime(i % 4 === 0 ? 0.09 : 0.05, now() + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now() + step * 1.6);
    o.connect(g); g.connect(musicGain);
    o.start(); o.stop(now() + step * 1.7);
    if (i % 8 === 0) {
      const b = ctx.createOscillator(); const bg = ctx.createGain();
      b.type = 'sine'; b.frequency.setValueAtTime(root, now());
      b.frequency.exponentialRampToValueAtTime(root * 0.5, now() + 0.25);
      bg.gain.setValueAtTime(0.16, now());
      bg.gain.exponentialRampToValueAtTime(0.0001, now() + 0.3);
      b.connect(bg); bg.connect(musicGain); b.start(); b.stop(now() + 0.32);
    }
    i++;
    pad.frequency.setTargetAtTime(root / 2 * Math.pow(2, scale[(i >> 3) % scale.length] / 12), now(), 0.6);
  };
  seq = { id: setInterval(tick, step * 1000), pad, padG };
  tick();
}

export function stopMusic() {
  if (!seq) return;
  clearInterval(seq.id);
  try { seq.pad.stop(); } catch (e) { /* already stopped */ }
  seq = null;
}
