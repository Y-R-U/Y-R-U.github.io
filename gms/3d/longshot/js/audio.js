// LONGSHOT — procedural Web Audio: no samples, everything synthesized.

import { save } from './save.js';

let ctx = null, master, sfxBus, musBus, ambBus;
let noiseBuf = null;

function ensure() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return true; }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
    sfxBus = ctx.createGain(); sfxBus.connect(master);
    ambBus = ctx.createGain(); ambBus.connect(master);
    musBus = ctx.createGain(); musBus.connect(master);
    applySettings();
    const n = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = n.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    noiseBuf = n;
    return true;
  } catch { return false; }
}
export function applySettings() {
  if (!ctx) return;
  sfxBus.gain.value = save.settings.sfx ? 0.55 : 0;
  ambBus.gain.value = save.settings.sfx ? 0.4 : 0;
  musBus.gain.value = save.settings.music ? 0.22 : 0;
}
export function init() { ensure(); }

// ── primitives ───────────────────────────────────────────────────────────────
function noise(dur, { hp, lp, bp, q = 1, gain = 0.5, at = 0.002, decay, bus, when = 0, rate = 1 } = {}) {
  if (!ensure()) return null;
  bus = bus || sfxBus;              // resolve AFTER ensure() — buses exist now
  const t0 = ctx.currentTime + when;
  const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true; src.playbackRate.value = rate;
  let node = src;
  if (hp) { const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp; node.connect(f); node = f; }
  if (lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; node.connect(f); node = f; }
  if (bp) { const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = bp; f.Q.value = q; node.connect(f); node = f; }
  const g = ctx.createGain(); g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + at);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + (decay || dur));
  node.connect(g); g.connect(bus);
  src.start(t0); src.stop(t0 + dur + 0.05);
  return { src, g, node };
}
function tone(freq, dur, { type = 'sine', gain = 0.3, at = 0.004, slideTo, bus, when = 0 } = {}) {
  if (!ensure()) return;
  bus = bus || sfxBus;
  const t0 = ctx.currentTime + when;
  const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + at);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(bus); o.start(t0); o.stop(t0 + dur + 0.05);
}

// ── gun ──────────────────────────────────────────────────────────────────────
export function shot(suppressed) {
  if (!ensure()) return;
  if (suppressed) {
    noise(0.09, { lp: 900, gain: 0.5, decay: 0.09 });
    tone(140, 0.1, { type: 'sine', gain: 0.35, slideTo: 60 });
  } else {
    noise(0.05, { hp: 1500, gain: 0.9, decay: 0.05 });           // crack
    noise(0.16, { lp: 500, gain: 0.8, decay: 0.16 });            // muzzle blast
    tone(90, 0.22, { type: 'sine', gain: 0.55, slideTo: 38 });   // chest thump
    // city echo tail — three fading slaps off the towers
    for (let i = 1; i <= 3; i++)
      noise(0.22, { lp: 1400 - i * 300, gain: 0.16 / i, decay: 0.22, when: 0.14 * i + Math.random() * 0.03 });
  }
}
export function bolt() {
  noise(0.03, { hp: 2500, gain: 0.22, decay: 0.03 });
  noise(0.04, { hp: 1800, gain: 0.26, decay: 0.04, when: 0.13 });
  tone(320, 0.03, { type: 'square', gain: 0.05, when: 0.13 });
}
export function dry() { noise(0.03, { hp: 2000, gain: 0.18, decay: 0.03 }); }
export function scopeToggle(inward) {
  noise(0.08, { bp: inward ? 900 : 500, q: 2, gain: 0.14, decay: 0.08 });
  tone(inward ? 620 : 380, 0.06, { type: 'sine', gain: 0.06 });
}
export function markPing() { tone(1180, 0.1, { gain: 0.12 }); tone(1760, 0.16, { gain: 0.09, when: 0.07 }); }

// ── impacts ──────────────────────────────────────────────────────────────────
export function impactBody() { tone(160, 0.12, { gain: 0.3, slideTo: 70 }); noise(0.06, { lp: 800, gain: 0.3, decay: 0.06 }); }
export function impactConcrete() { noise(0.08, { hp: 800, gain: 0.35, decay: 0.08 }); noise(0.2, { lp: 600, gain: 0.2, decay: 0.2 }); }
export function ricochet() { tone(2400, 0.28, { type: 'sine', gain: 0.1, slideTo: 700, when: 0.02 }); noise(0.05, { hp: 1500, gain: 0.2, decay: 0.05 }); }
export function glassBreak() {
  noise(0.05, { hp: 3000, gain: 0.5, decay: 0.05 });
  for (let i = 0; i < 6; i++)
    tone(1800 + Math.random() * 3200, 0.2 + Math.random() * 0.3, { gain: 0.05, when: Math.random() * 0.12, slideTo: 900 + Math.random() * 800 });
}

// ── breath / heartbeat ───────────────────────────────────────────────────────
export function breathIn() { noise(0.5, { bp: 700, q: 1.4, gain: 0.07, at: 0.25, decay: 0.5 }); }
export function breathOut() { noise(0.6, { bp: 420, q: 1.2, gain: 0.09, at: 0.05, decay: 0.6 }); }
export function heartbeat(strong) {
  tone(58, 0.13, { gain: strong ? 0.4 : 0.22, slideTo: 40 });
  tone(52, 0.11, { gain: strong ? 0.3 : 0.15, slideTo: 36, when: 0.16 });
}

// ── bullet cam whoosh ────────────────────────────────────────────────────────
let whoosh = null;
export function whooshStart() {
  if (!ensure()) return;
  whooshStop();
  const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 500; f.Q.value = 0.8;
  const g = ctx.createGain(); g.gain.value = 0;
  src.connect(f); f.connect(g); g.connect(sfxBus); src.start();
  g.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.15);
  whoosh = { src, f, g };
}
export function whooshSet(k) { if (whoosh) whoosh.f.frequency.value = 260 + k * 900; }
export function whooshStop() {
  if (!whoosh) return;
  const { src, g } = whoosh;
  g.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.1);
  setTimeout(() => { try { src.stop(); } catch {} }, 200);
  whoosh = null;
}

// ── crowd panic (distant) ────────────────────────────────────────────────────
export function panicCrowd() {
  for (let i = 0; i < 5; i++)
    tone(600 + Math.random() * 500, 0.3, { type: 'triangle', gain: 0.03, when: Math.random() * 0.9, slideTo: 900 + Math.random() * 400 });
  noise(1.4, { bp: 900, q: 0.8, gain: 0.06, at: 0.3, decay: 1.4 });
}

// ── UI / stingers ────────────────────────────────────────────────────────────
export function ui() { tone(700, 0.05, { type: 'triangle', gain: 0.08 }); }
export function cash() { tone(880, 0.08, { gain: 0.1 }); tone(1320, 0.14, { gain: 0.1, when: 0.07 }); }
export function medalSting() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.34, { type: 'triangle', gain: 0.12, when: i * 0.12 })); }
export function failSting() { [330, 311, 233].forEach((f, i) => tone(f, 0.5, { type: 'triangle', gain: 0.12, when: i * 0.18 })); }
export function killConfirm() { tone(392, 0.16, { type: 'triangle', gain: 0.12 }); tone(587, 0.3, { type: 'triangle', gain: 0.12, when: 0.1 }); }

// ── ambience (wind + city) ───────────────────────────────────────────────────
let amb = null;
export function ambStart(windLevel) {
  if (!ensure()) return;
  ambStop();
  const nodes = [];
  // wind: lowpassed noise with a slow gust LFO
  const w = ctx.createBufferSource(); w.buffer = noiseBuf; w.loop = true;
  const wf = ctx.createBiquadFilter(); wf.type = 'lowpass'; wf.frequency.value = 380 + windLevel * 60;
  const wg = ctx.createGain(); wg.gain.value = 0.10 + windLevel * 0.035;
  const lfo = ctx.createOscillator(); lfo.frequency.value = 0.13;
  const lg = ctx.createGain(); lg.gain.value = 0.05 + windLevel * 0.02;
  lfo.connect(lg); lg.connect(wg.gain);
  w.connect(wf); wf.connect(wg); wg.connect(ambBus); w.start(); lfo.start();
  nodes.push(w, lfo);
  // city rumble
  const c = ctx.createBufferSource(); c.buffer = noiseBuf; c.loop = true; c.playbackRate.value = 0.3;
  const cf = ctx.createBiquadFilter(); cf.type = 'lowpass'; cf.frequency.value = 90;
  const cg = ctx.createGain(); cg.gain.value = 0.16;
  c.connect(cf); cf.connect(cg); cg.connect(ambBus); c.start();
  nodes.push(c);
  // rare distant siren
  const siren = setInterval(() => {
    if (Math.random() < 0.3) {
      for (let i = 0; i < 6; i++)
        tone(660 + (i % 2) * 160, 0.5, { type: 'sine', gain: 0.006, when: i * 0.5, bus: ambBus });
    }
  }, 24000);
  amb = { nodes, siren };
}
export function ambStop() {
  if (!amb) return;
  amb.nodes.forEach(n => { try { n.stop(); } catch {} });
  clearInterval(amb.siren);
  amb = null;
}

// ── music: dark pad loop (menus) / sparse drone (mission) ────────────────────
let music = null;
const CHORDS = [[146.8, 220, 293.7], [116.5, 174.6, 233.1], [130.8, 196, 261.6], [98, 146.8, 196]]; // Dm Bb C(sus) G(low)
export function musicStart(mode) {
  if (!ensure()) return;
  musicStop();
  let bar = 0;
  const playBar = () => {
    if (!music) return;
    if (mode === 'menu') {
      const ch = CHORDS[bar % CHORDS.length];
      ch.forEach(f => {
        [f, f * 1.005].forEach(ff =>
          tone(ff, 4.4, { type: 'sawtooth', gain: 0.018, at: 1.6, bus: musBus }));
      });
      tone(ch[0] / 2, 4.4, { type: 'sine', gain: 0.05, at: 0.8, bus: musBus });
    } else {
      // mission: low drone + heartbeat-slow tick
      tone(73.4, 4.6, { type: 'sine', gain: 0.045, at: 1.2, bus: musBus });
      tone(110.2, 4.6, { type: 'sine', gain: 0.02, at: 1.5, bus: musBus });
      if (bar % 2 === 0) noise(0.04, { hp: 3000, gain: 0.02, decay: 0.04, bus: musBus, when: 2 });
    }
    bar++;
  };
  playBar();
  music = { iv: setInterval(playBar, 4200), mode };
}
export function musicStop() { if (music) { clearInterval(music.iv); music = null; } }
export function tensionTick() { tone(1240, 0.06, { gain: 0.05, bus: musBus }); tone(90, 0.1, { gain: 0.1, bus: musBus }); }
