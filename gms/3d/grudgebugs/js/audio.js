// GRUDGE BUGS — procedural Web Audio. No samples: booms, boings, splashes,
// squeaky insect gibberish (per-faction timbre) and two tiny music beds.

let ctx = null, master = null, sfxG = null, musG = null;
let sfxOn = true, musicOn = true;
let musicTimer = null, musicBed = null, musicStep = 0;

export function init() {
  if (ctx) return;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
    sfxG = ctx.createGain(); sfxG.connect(master);
    musG = ctx.createGain(); musG.gain.value = 0.32; musG.connect(master);
  } catch { /* no audio */ }
}
export function resume() { ctx?.resume?.(); }
export function setSfx(on) { sfxOn = on; if (sfxG) sfxG.gain.value = on ? 1 : 0; }
export function setMusic(on) { musicOn = on; if (musG) musG.gain.value = on ? 0.32 : 0; }

const now = () => ctx.currentTime;
function env(g, t0, a, peak, d, sustainTo = 0.0001) {
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + a);
  g.gain.exponentialRampToValueAtTime(sustainTo, t0 + a + d);
}
function osc(type, freq, t0, dur, peak = 0.2, dest = null) {
  if (!ctx) return null;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t0);
  env(g, t0, 0.005, peak, dur);
  o.connect(g); g.connect(dest || sfxG);
  o.start(t0); o.stop(t0 + dur + 0.1);
  return o;
}
function noise(t0, dur, peak, filterType = 'lowpass', freq = 800, q = 0.7) {
  if (!ctx) return;
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource(); src.buffer = buf;
  const f = ctx.createBiquadFilter(); f.type = filterType; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain();
  env(g, t0, 0.005, peak, dur * 0.9);
  src.connect(f); f.connect(g); g.connect(sfxG);
  src.start(t0);
}

// ---------------- sfx ----------------
export function ui() { if (!ctx || !sfxOn) return; osc('triangle', 620, now(), 0.07, 0.12); }
export function boom(size = 1) {
  if (!ctx || !sfxOn) return;
  const t = now();
  noise(t, 0.5 * size, 0.5, 'lowpass', 320 * size);
  const o = osc('sine', 90 * size, t, 0.5, 0.5);
  o?.frequency.exponentialRampToValueAtTime(32, t + 0.45);
  noise(t + 0.02, 0.18, 0.25, 'highpass', 1800);
}
export function splash() {
  if (!ctx || !sfxOn) return;
  const t = now();
  const o = osc('sine', 300, t, 0.16, 0.3);
  o?.frequency.exponentialRampToValueAtTime(70, t + 0.15);
  noise(t + 0.05, 0.55, 0.3, 'bandpass', 1300, 1.2);
}
export function boing() {
  if (!ctx || !sfxOn) return;
  const t = now();
  const o = osc('sine', 240, t, 0.28, 0.28);
  o?.frequency.setValueAtTime(240, t);
  o?.frequency.exponentialRampToValueAtTime(430, t + 0.06);
  o?.frequency.exponentialRampToValueAtTime(180, t + 0.26);
}
export function slap() {
  if (!ctx || !sfxOn) return;
  noise(now(), 0.09, 0.5, 'bandpass', 2400, 1.5);
}
export function fuseTick() { if (!ctx || !sfxOn) return; osc('square', 1500, now(), 0.03, 0.06); }
export function pop() {
  if (!ctx || !sfxOn) return;
  const t = now();
  const o = osc('sine', 500, t, 0.09, 0.3);
  o?.frequency.exponentialRampToValueAtTime(900, t + 0.08);
}
export function squashThud() {
  if (!ctx || !sfxOn) return;
  const t = now();
  noise(t, 0.3, 0.6, 'lowpass', 200);
  osc('sine', 55, t, 0.35, 0.55);
}
export function fallWhistle(dur = 1.2) {
  if (!ctx || !sfxOn) return;
  const t = now();
  const o = osc('sine', 1900, t, dur, 0.14);
  o?.frequency.exponentialRampToValueAtTime(500, t + dur);
}

// charge-up: persistent rising tone while held
let chargeOsc = null, chargeGain = null;
export function chargeStart() {
  if (!ctx || !sfxOn) return;
  chargeStop();
  chargeOsc = ctx.createOscillator(); chargeGain = ctx.createGain();
  chargeOsc.type = 'sawtooth'; chargeOsc.frequency.value = 90;
  chargeGain.gain.value = 0.07;
  chargeOsc.connect(chargeGain); chargeGain.connect(sfxG);
  chargeOsc.start();
}
export function chargeSet(p) { if (chargeOsc) chargeOsc.frequency.value = 90 + p * 500; }
export function chargeStop() {
  if (chargeOsc) { try { chargeOsc.stop(); } catch {} chargeOsc = null; chargeGain = null; }
}

// projectile whoosh
let whoosh = null, whooshG = null, whooshF = null;
export function whooshStart() {
  if (!ctx || !sfxOn) return;
  whooshStop();
  const len = ctx.sampleRate * 2;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  whoosh = ctx.createBufferSource(); whoosh.buffer = buf; whoosh.loop = true;
  whooshF = ctx.createBiquadFilter(); whooshF.type = 'bandpass'; whooshF.frequency.value = 700; whooshF.Q.value = 1.4;
  whooshG = ctx.createGain(); whooshG.gain.value = 0.12;
  whoosh.connect(whooshF); whooshF.connect(whooshG); whooshG.connect(sfxG);
  whoosh.start();
}
export function whooshSet(v) { if (whooshG) { whooshG.gain.value = 0.05 + v * 0.14; whooshF.frequency.value = 400 + v * 900; } }
export function whooshStop() { if (whoosh) { try { whoosh.stop(); } catch {} whoosh = null; } }

export function fanfare(win = true) {
  if (!ctx || !sfxOn) return;
  const t = now();
  if (win) {
    [[523, 0], [659, 0.12], [784, 0.24], [1047, 0.38]].forEach(([f, dt]) =>
      osc('triangle', f, t + dt, 0.35, 0.2));
  } else {
    // sad trombone
    [[233, 0], [220, 0.3], [208, 0.6], [185, 0.9]].forEach(([f, dt], i) => {
      const o = osc('sawtooth', f, t + dt, i === 3 ? 0.8 : 0.28, 0.14);
      if (i === 3) o?.frequency.linearRampToValueAtTime(160, t + dt + 0.7);
    });
  }
}

// ---------------- insect gibberish ----------------
// voice: {base, spread, rate, wave} from FACTIONS; n ≈ syllables
export function speak(voice, n = 5) {
  if (!ctx || !sfxOn) return;
  const t0 = now();
  const step = 1 / voice.rate;
  for (let i = 0; i < Math.min(n, 14); i++) {
    const f = voice.base + (Math.random() - 0.3) * voice.spread;
    const o = osc(voice.wave, f, t0 + i * step, step * 0.55, 0.085);
    o?.frequency.exponentialRampToValueAtTime(Math.max(40, f * (0.8 + Math.random() * 0.5)), t0 + i * step + step * 0.5);
  }
}

// ---------------- music beds ----------------
const MENU_BASS = [130.8, 130.8, 98, 98, 110, 110, 87.3, 98];
const MENU_MEL = [523, 0, 659, 587, 523, 0, 440, 494, 523, 659, 0, 587, 494, 0, 440, 0];
const BATTLE_BASS = [82.4, 82.4, 82.4, 92.5, 82.4, 82.4, 73.4, 77.8];
const BATTLE_MEL = [330, 0, 392, 0, 330, 415, 0, 392, 330, 0, 294, 330, 0, 247, 0, 0];

export function music(bed) {
  if (musicBed === bed) return;
  musicBed = bed;
  if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
  if (!bed || !ctx) return;
  musicStep = 0;
  const bpm = bed === 'menu' ? 96 : 122;
  const stepDur = 60 / bpm / 2;
  musicTimer = setInterval(() => {
    if (!musicOn || !ctx) return;
    const t = now() + 0.05;
    const i = musicStep++;
    const bass = bed === 'menu' ? MENU_BASS : BATTLE_BASS;
    const mel = bed === 'menu' ? MENU_MEL : BATTLE_MEL;
    if (i % 2 === 0) {
      const b = bass[(i / 2) % bass.length];
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'triangle'; o.frequency.value = b;
      env(g, t, 0.01, 0.16, stepDur * 1.6);
      o.connect(g); g.connect(musG); o.start(t); o.stop(t + stepDur * 2);
    }
    const m = mel[i % mel.length];
    if (m) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = bed === 'menu' ? 'square' : 'sawtooth'; o.frequency.value = m;
      env(g, t, 0.01, bed === 'menu' ? 0.05 : 0.04, stepDur * 0.9);
      o.connect(g); g.connect(musG); o.start(t); o.stop(t + stepDur);
    }
    if (bed === 'battle' && i % 4 === 2) {   // hat
      const len = Math.floor(ctx.sampleRate * 0.04);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let k = 0; k < len; k++) d[k] = (Math.random() * 2 - 1) * (1 - k / len);
      const src = ctx.createBufferSource(); src.buffer = buf;
      const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 6000;
      const g = ctx.createGain(); g.gain.value = 0.05;
      src.connect(f); f.connect(g); g.connect(musG); src.start(t);
    }
  }, stepDur * 1000);
}
