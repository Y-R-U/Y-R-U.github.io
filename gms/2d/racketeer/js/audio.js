// Web Audio synth sfx — no assets. Everything generated.
let ac = null, master = null, crowdNode = null, crowdGain = null;
let muted = false;

export function initAudio() {
  if (ac) { if (ac.state === "suspended") ac.resume(); return; }
  try {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    master = ac.createGain(); master.gain.value = 0.5; master.connect(ac.destination);
    // Continuous crowd murmur: looped filtered noise
    const len = ac.sampleRate * 2;
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    crowdNode = ac.createBufferSource(); crowdNode.buffer = buf; crowdNode.loop = true;
    const filt = ac.createBiquadFilter(); filt.type = "bandpass"; filt.frequency.value = 500; filt.Q.value = 0.6;
    crowdGain = ac.createGain(); crowdGain.gain.value = 0.0;
    crowdNode.connect(filt); filt.connect(crowdGain); crowdGain.connect(master);
    crowdNode.start();
  } catch (e) { ac = null; }
}

export function setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.5; }
export function isMuted() { return muted; }

export function setCrowdLevel(v) {  // 0..1 ambience with hype
  if (crowdGain && ac) crowdGain.gain.setTargetAtTime(0.015 + v * 0.05, ac.currentTime, 0.4);
}

function env(type, freq, dur, vol = 0.3, slide = 0, delay = 0) {
  if (!ac) return;
  const t0 = ac.currentTime + delay;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  o.connect(g); g.connect(master);
  o.start(t0); o.stop(t0 + dur + 0.02);
}

function noise(dur, vol = 0.3, freq = 1200, q = 1, delay = 0) {
  if (!ac) return;
  const t0 = ac.currentTime + delay;
  const len = Math.ceil(ac.sampleRate * dur);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ac.createBufferSource(); src.buffer = buf;
  const f = ac.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = freq; f.Q.value = q;
  const g = ac.createGain(); g.gain.value = vol;
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t0);
}

export const sfx = {
  pock(power = 1) { env("sine", 240 + power * 120, 0.08, 0.5, -80); noise(0.05, 0.35, 2200, 0.8); },
  bounce() { env("sine", 160, 0.09, 0.3, -60); },
  netHit() { noise(0.18, 0.3, 500, 2); env("sine", 90, 0.2, 0.25, -40); },
  swishMiss() { noise(0.22, 0.2, 900, 0.5); },
  serveToss() { env("sine", 500, 0.1, 0.12, 250); },
  cheer(big = 1) { noise(0.7 * big, 0.32 * big, 900, 0.4); noise(0.9 * big, 0.22 * big, 1600, 0.5, 0.1);
    for (let i = 0; i < 4 * big; i++) env("sine", 700 + Math.random() * 700, 0.25, 0.05, 200, Math.random() * 0.4); },
  boo() { for (let i = 0; i < 6; i++) env("sawtooth", 130 + Math.random() * 40, 0.7, 0.06, -30, Math.random() * 0.25); },
  gasp() { noise(0.35, 0.25, 700, 0.7); },
  grunt(lvl = 1) { env("sawtooth", 200 + lvl * 30, 0.45, 0.4, -140); env("square", 110, 0.4, 0.22, -50, 0.03); },
  heckleLaugh() { for (let i = 0; i < 5; i++) env("square", 400 - i * 40, 0.09, 0.12, 0, i * 0.09); },
  whistle() { env("sine", 2200, 0.15, 0.2, 300); env("sine", 2500, 0.25, 0.2, -400, 0.18); },
  umpBeep() { env("square", 880, 0.12, 0.15); env("square", 880, 0.12, 0.15, 0, 0.18); },
  cash(n = 3) { for (let i = 0; i < n; i++) env("sine", 1300 + i * 150, 0.12, 0.2, 80, i * 0.07); },
  fanfare() { const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => { env("square", f, 0.25, 0.15, 0, i * 0.13); env("triangle", f / 2, 0.3, 0.18, 0, i * 0.13); }); },
  sadTrombone() { const notes = [392, 370, 349, 311];
    notes.forEach((f, i) => env("sawtooth", f, i === 3 ? 0.7 : 0.22, 0.14, i === 3 ? -30 : 0, i * 0.24)); },
  pigeonCoo() { env("sine", 480, 0.12, 0.2, -120); env("sine", 460, 0.14, 0.2, -100, 0.16); noise(0.3, 0.12, 3000, 0.4, 0.05); },
  smash() { noise(0.4, 0.5, 1800, 0.4); noise(0.5, 0.3, 700, 0.6, 0.05); env("sawtooth", 180, 0.3, 0.3, -120); },
  zoneIn() { env("sine", 300, 0.6, 0.25, 500); },
  bossBeep() { env("square", 220, 0.15, 0.2); env("square", 165, 0.2, 0.2, 0, 0.18); env("square", 110, 0.3, 0.25, 0, 0.36); },
  click() { env("sine", 700, 0.05, 0.15, -100); },
  slowmo() { env("sine", 800, 0.5, 0.18, -600); },
};
