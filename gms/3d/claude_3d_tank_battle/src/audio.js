// Web-Audio synthesised SFX. Lazy-init on first user interaction.

let ctx = null;

export function ensureAudio() {
  if (!ctx) {
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch (e) { ctx = null; }
  }
  if (ctx && ctx.state === 'suspended') ctx.resume();
}

function gainTo(node, t, v0, v1, dur) {
  node.gain.setValueAtTime(v0, t);
  node.gain.exponentialRampToValueAtTime(Math.max(0.0001, v1), t + dur);
}

export function sfxShoot(volume = 1) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'square';
  osc.frequency.setValueAtTime(180, t);
  osc.frequency.exponentialRampToValueAtTime(40, t + 0.18);
  gainTo(gain, t, 0.2 * volume, 0.001, 0.22);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t); osc.stop(t + 0.24);

  const bufferSize = ctx.sampleRate * 0.15;
  const buf = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  }
  const noise = ctx.createBufferSource();
  noise.buffer = buf;
  const nGain = ctx.createGain();
  gainTo(nGain, t, 0.15 * volume, 0.001, 0.12);
  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 900;
  noise.connect(filter).connect(nGain).connect(ctx.destination);
  noise.start(t); noise.stop(t + 0.15);
}

export function sfxHit(volume = 1) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(700, t);
  osc.frequency.exponentialRampToValueAtTime(180, t + 0.25);
  gainTo(gain, t, 0.16 * volume, 0.001, 0.3);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t); osc.stop(t + 0.32);
}

export function sfxDamage(volume = 1) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'square';
  osc.frequency.setValueAtTime(140, t);
  osc.frequency.exponentialRampToValueAtTime(50, t + 0.3);
  gainTo(gain, t, 0.28 * volume, 0.001, 0.35);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t); osc.stop(t + 0.4);
}

export function sfxExplode(volume = 1) {
  if (!ctx) return;
  const t = ctx.currentTime;
  // boom
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(110, t);
  osc.frequency.exponentialRampToValueAtTime(28, t + 0.55);
  gainTo(gain, t, 0.4 * volume, 0.001, 0.6);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t); osc.stop(t + 0.65);
  // noise crash
  const bufferSize = ctx.sampleRate * 0.5;
  const buf = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  }
  const noise = ctx.createBufferSource();
  noise.buffer = buf;
  const nGain = ctx.createGain();
  gainTo(nGain, t, 0.32 * volume, 0.001, 0.5);
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 1400;
  noise.connect(filter).connect(nGain).connect(ctx.destination);
  noise.start(t); noise.stop(t + 0.55);
}

export function sfxVictory() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const notes = [392, 523, 659, 784]; // G, C, E, G
  for (let i = 0; i < notes.length; i++) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(notes[i], t + i * 0.13);
    gainTo(gain, t + i * 0.13, 0.22, 0.001, 0.3);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t + i * 0.13); osc.stop(t + i * 0.13 + 0.34);
  }
}

export function sfxDefeat() {
  if (!ctx) return;
  const t = ctx.currentTime;
  for (let i = 0; i < 3; i++) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220 - i * 40, t + i * 0.13);
    osc.frequency.exponentialRampToValueAtTime(40, t + i * 0.13 + 0.4);
    gainTo(gain, t + i * 0.13, 0.22, 0.001, 0.45);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t + i * 0.13); osc.stop(t + i * 0.13 + 0.5);
  }
}
