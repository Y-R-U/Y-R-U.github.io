// ─── Audio: music manager + SFX generator ───

import { loadSave, writeSave } from './config.js';

let audioCtx = null;
let musicOn = true;
let sfxOn = true;
let currentTrack = null;
let musicTracks = [];
let musicGain = null;

function getCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    musicGain = audioCtx.createGain();
    musicGain.gain.value = 0.4;
    musicGain.connect(audioCtx.destination);
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

// ─── Music ───
export async function initMusic() {
  const save = loadSave();
  musicOn = save.musicOn;
  sfxOn = save.sfxOn;

  const found = [];
  for (let i = 1; i <= 9; i++) {
    const url = `music/theme${i}.mp3`;
    try {
      const res = await fetch(url, { method: 'HEAD' });
      if (res.ok) {
        const ct = res.headers.get('content-type') || '';
        if (ct.includes('audio') || ct.includes('octet-stream') || url.endsWith('.mp3')) {
          found.push(url);
        }
      }
    } catch (e) { /* skip */ }
  }
  musicTracks = found;
  if (musicOn && musicTracks.length > 0) playRandomTrack();
}

function playRandomTrack() {
  if (!musicOn || musicTracks.length === 0) return;
  const ctx = getCtx();
  const idx = Math.floor(Math.random() * musicTracks.length);
  const url = musicTracks[idx];

  if (currentTrack) {
    try { currentTrack.pause(); } catch (e) { /* */ }
  }

  const audio = new Audio(url);
  audio.volume = 0.4;
  audio.addEventListener('ended', () => playRandomTrack());
  audio.play().catch(() => {});
  currentTrack = audio;
}

export function setMusicOn(on) {
  musicOn = on;
  if (on) {
    if (musicTracks.length > 0 && (!currentTrack || currentTrack.paused)) playRandomTrack();
  } else {
    if (currentTrack) { currentTrack.pause(); }
  }
  const save = loadSave();
  save.musicOn = on;
  writeSave(save);
}

export function setSfxOn(on) {
  sfxOn = on;
  const save = loadSave();
  save.sfxOn = on;
  writeSave(save);
}

export function isMusicOn() { return musicOn; }
export function isSfxOn() { return sfxOn; }

// ─── SFX (oscillator-generated) ───
function playTone(freq, duration, type = 'sine', vol = 0.15, detune = 0) {
  if (!sfxOn) return;
  const ctx = getCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  osc.detune.value = detune;
  gain.gain.setValueAtTime(vol, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + duration);
}

function playNoise(duration, vol = 0.08) {
  if (!sfxOn) return;
  const ctx = getCtx();
  const bufferSize = ctx.sampleRate * duration;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(vol, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 800;
  src.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  src.start();
}

export function sfxDrop() {
  playTone(600, 0.12, 'sine', 0.12);
  playTone(400, 0.1, 'sine', 0.08);
}

export function sfxBounce() {
  const f = 800 + Math.random() * 400;
  playTone(f, 0.06, 'sine', 0.06);
}

export function sfxMerge() {
  playTone(523, 0.15, 'sine', 0.14);
  setTimeout(() => playTone(784, 0.2, 'sine', 0.14), 80);
}

export function sfxBlockHit() {
  playTone(150, 0.1, 'square', 0.08);
  playNoise(0.05, 0.04);
}

export function sfxBlockDestroy() {
  playNoise(0.25, 0.12);
  playTone(100, 0.15, 'sawtooth', 0.08);
  playTone(80, 0.2, 'square', 0.06);
}

export function sfxWaveComplete() {
  const notes = [523, 659, 784, 1047];
  notes.forEach((f, i) => setTimeout(() => playTone(f, 0.2, 'sine', 0.12), i * 80));
}

export function sfxGameOver() {
  const notes = [400, 350, 300, 200];
  notes.forEach((f, i) => setTimeout(() => playTone(f, 0.3, 'sine', 0.1), i * 120));
}

export function sfxClick() {
  playTone(1000, 0.04, 'sine', 0.06);
}

export function sfxUpgrade() {
  playTone(880, 0.1, 'sine', 0.12);
  setTimeout(() => playTone(1320, 0.15, 'sine', 0.12), 60);
}

export function sfxSuction() {
  playTone(300, 0.2, 'sine', 0.04, 200);
}
