// All sound is synthesized — no audio files. Lazy AudioContext (unlocked on
// first gesture), one-shot sfx for every event, day-birds / night-crickets
// ambience, and a generative music loop that brightens with each Age.

let ctx = null, master = null, musicGain = null, sfxGain = null, ambGain = null;
let muted = false;
try { muted = localStorage.getItem('firstfolk-muted') === '1'; } catch { /* private mode */ }

export function unlock() {
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 1;
      master.connect(ctx.destination);
      musicGain = ctx.createGain(); musicGain.gain.value = 0.42; musicGain.connect(master);
      sfxGain = ctx.createGain(); sfxGain.gain.value = 0.9; sfxGain.connect(master);
      ambGain = ctx.createGain(); ambGain.gain.value = 0.5; ambGain.connect(master);
    } catch { return; }
  }
  if (ctx.state === 'suspended') ctx.resume();
}
export function isMuted() { return muted; }
export function setMuted(m) {
  muted = m;
  try { localStorage.setItem('firstfolk-muted', m ? '1' : '0'); } catch { /* ok */ }
  if (master) master.gain.linearRampToValueAtTime(m ? 0 : 1, ctx.currentTime + 0.1);
}

const ok = () => ctx && ctx.state === 'running';

function tone({ f = 440, f1 = null, type = 'sine', t0 = 0, a = 0.01, d = 0.25, g = 0.15, out = null }) {
  if (!ok()) return;
  const T = ctx.currentTime + t0;
  const o = ctx.createOscillator(), gn = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, T);
  if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), T + d);
  gn.gain.setValueAtTime(0.0001, T);
  gn.gain.exponentialRampToValueAtTime(g, T + a);
  gn.gain.exponentialRampToValueAtTime(0.0001, T + d);
  o.connect(gn).connect(out || sfxGain);
  o.start(T); o.stop(T + d + 0.05);
}

let noiseBuf = null;
function noise({ t0 = 0, d = 0.3, g = 0.2, fc = 800, q = 1, type = 'lowpass', fc1 = null, out = null }) {
  if (!ok()) return;
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  const T = ctx.currentTime + t0;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf; src.loop = true;
  const flt = ctx.createBiquadFilter();
  flt.type = type; flt.frequency.setValueAtTime(fc, T); flt.Q.value = q;
  if (fc1) flt.frequency.exponentialRampToValueAtTime(Math.max(fc1, 20), T + d);
  const gn = ctx.createGain();
  gn.gain.setValueAtTime(0.0001, T);
  gn.gain.exponentialRampToValueAtTime(g, T + 0.012);
  gn.gain.exponentialRampToValueAtTime(0.0001, T + d);
  src.connect(flt).connect(gn).connect(out || sfxGain);
  src.start(T); src.stop(T + d + 0.05);
}

// throttled sculpting rumble
let rumbleT = 0;
export function rumble() {
  const now = performance.now();
  if (now - rumbleT < 140) return;
  rumbleT = now;
  noise({ d: 0.18, g: 0.12, fc: 160, fc1: 70 });
}

export const sfx = {
  click: () => tone({ f: 880, type: 'triangle', d: 0.05, g: 0.05 }),
  place: () => { tone({ f: 300, f1: 200, d: 0.14, g: 0.12 }); noise({ d: 0.1, g: 0.15, fc: 600 }); },
  hammer: () => { noise({ d: 0.06, g: 0.2, fc: 1800, type: 'bandpass', q: 2 }); tone({ f: 240, f1: 140, d: 0.07, g: 0.1 }); },
  chop: () => { noise({ d: 0.07, g: 0.22, fc: 900, type: 'bandpass', q: 1.6 }); tone({ f: 180, f1: 90, d: 0.08, g: 0.12 }); },
  chip: () => { noise({ d: 0.05, g: 0.18, fc: 2600, type: 'bandpass', q: 3 }); tone({ f: 700, f1: 500, d: 0.05, g: 0.05 }); },
  treeFall: () => { noise({ d: 0.5, g: 0.3, fc: 300, fc1: 80 }); tone({ f: 90, f1: 45, d: 0.5, g: 0.18 }); },
  complete: () => { [392, 523, 659].forEach((f, i) => tone({ f, t0: i * 0.09, d: 0.28, g: 0.09 })); },
  birth: () => { tone({ f: 740, d: 0.12, g: 0.07 }); tone({ f: 988, t0: 0.1, d: 0.2, g: 0.08 }); },
  eat: () => tone({ f: 520, f1: 620, type: 'triangle', d: 0.08, g: 0.04 }),
  death: () => { tone({ f: 220, f1: 90, type: 'triangle', d: 0.6, g: 0.1 }); },
  denied: () => tone({ f: 160, f1: 120, type: 'square', d: 0.16, g: 0.05 }),
  ley: () => tone({ f: 1180, f1: 1500, type: 'sine', d: 0.14, g: 0.045 }),
  bless: () => { [523, 659, 784, 988, 1175].forEach((f, i) => tone({ f, t0: i * 0.1, d: 0.5, g: 0.06 })); },
  ageUp: () => { [262, 330, 392, 523].forEach((f, i) => tone({ f, type: 'triangle', t0: i * 0.16, d: 0.55, g: 0.1 })); noise({ d: 0.8, g: 0.08, fc: 3000, fc1: 500, type: 'highpass' }); },
  rain: () => noise({ d: 1.6, g: 0.14, fc: 2200, type: 'highpass' }),
  sprout: () => { [660, 880, 1100].forEach((f, i) => tone({ f, t0: i * 0.07, d: 0.2, g: 0.05 })); },
  thunder: () => { noise({ d: 0.9, g: 0.55, fc: 400, fc1: 50 }); tone({ f: 70, f1: 30, d: 0.8, g: 0.3 }); },
  sunburst: () => { [523, 659, 784, 1047, 1319].forEach((f, i) => tone({ f, t0: i * 0.08, d: 0.7, g: 0.07 })); },
  raidHorn: () => { tone({ f: 147, type: 'sawtooth', d: 0.7, g: 0.13 }); tone({ f: 147, type: 'sawtooth', t0: 0.5, d: 0.9, g: 0.14 }); tone({ f: 110, type: 'sawtooth', t0: 1.1, d: 1.1, g: 0.15 }); },
  wolf: () => { tone({ f: 380, f1: 640, type: 'sawtooth', d: 0.7, g: 0.045 }); tone({ f: 420, f1: 300, type: 'sawtooth', t0: 0.7, d: 0.5, g: 0.035 }); },
  bite: () => { noise({ d: 0.08, g: 0.2, fc: 1200, type: 'bandpass', q: 2 }); },
  clash: () => { noise({ d: 0.1, g: 0.22, fc: 3400, type: 'bandpass', q: 4 }); tone({ f: 1800, f1: 900, d: 0.09, g: 0.05 }); },
  arrow: () => noise({ d: 0.1, g: 0.12, fc: 3200, fc1: 1400, type: 'bandpass', q: 2 }),
  threatDie: () => { noise({ d: 0.2, g: 0.2, fc: 400, fc1: 100 }); },
  collapse: () => { noise({ d: 0.7, g: 0.4, fc: 300, fc1: 60 }); tone({ f: 100, f1: 40, d: 0.6, g: 0.2 }); },
  fireWhoosh: () => noise({ d: 0.6, g: 0.3, fc: 900, fc1: 2400, type: 'bandpass', q: 1 }),
  victory: () => { [523, 659, 784, 1047].forEach((f, i) => tone({ f, t0: i * 0.12, d: 0.4, g: 0.1 })); },
  win: () => { [392, 523, 659, 784, 1047, 1319].forEach((f, i) => tone({ f, t0: i * 0.16, d: 0.8, g: 0.1 })); },
  lose: () => { [392, 330, 262, 196].forEach((f, i) => tone({ f, type: 'triangle', t0: i * 0.24, d: 0.6, g: 0.1 })); },
};

// ── ambience: birds by day, crickets by night ────────────────────────────────
let ambTimer = null, nightK = 0;
export function setNight(k) { nightK = k; }
export function startAmbience() {
  stopAmbience();
  const tick = () => {
    if (ok()) {
      if (nightK < 0.4 && Math.random() < 0.55) {
        // bird chirp: 2-4 quick descending whistles
        const base = 1800 + Math.random() * 1600;
        const n = 2 + (Math.random() * 3 | 0);
        for (let i = 0; i < n; i++)
          tone({ f: base + Math.random() * 300, f1: base * 0.8, t0: i * 0.09, d: 0.07, g: 0.022, out: ambGain });
      } else if (nightK >= 0.6) {
        // cricket pulse train
        for (let i = 0; i < 6; i++)
          tone({ f: 4200, type: 'triangle', t0: i * 0.055, d: 0.03, g: 0.012, out: ambGain });
      }
    }
    ambTimer = setTimeout(tick, 900 + Math.random() * 1800);
  };
  tick();
}
export function stopAmbience() { if (ambTimer) clearTimeout(ambTimer); ambTimer = null; }

// ── generative music per Age ─────────────────────────────────────────────────
const AGE_MUSIC = {
  1: { root: 196, scale: [0, 3, 5, 7, 10], bpm: 62, bright: false },     // sparse, ancient
  2: { root: 220, scale: [0, 2, 4, 7, 9], bpm: 72, bright: true },       // pentatonic warmth
  3: { root: 220, scale: [0, 2, 3, 7, 9], bpm: 76, bright: true },
  4: { root: 247, scale: [0, 2, 4, 5, 7, 11], bpm: 80, bright: true },   // hymnal
  5: { root: 262, scale: [0, 2, 4, 6, 7, 9, 11], bpm: 86, bright: true },// lydian wonder
  menu: { root: 196, scale: [0, 2, 4, 7, 9], bpm: 58, bright: true },
};
let music = null;

export function startMusic(age = 'menu') {
  stopMusic();
  const def = AGE_MUSIC[age] || AGE_MUSIC.menu;
  music = { def, step: 0, timer: null };
  const stepDur = 60 / def.bpm / 2;
  const deg = (i, oct = 0) => def.root * Math.pow(2, oct) * Math.pow(2, def.scale[((i % def.scale.length) + def.scale.length) % def.scale.length] / 12);
  const CHORDS = [[0, 2, 4], [3, 0, 2], [4, 1, 3], [2, 4, 0]];
  const tick = () => {
    if (!ok()) { music.timer = setTimeout(tick, 300); return; }
    const s = music.step++;
    const bar = Math.floor(s / 16), inBar = s % 16;
    const chord = CHORDS[bar % CHORDS.length];
    if (inBar === 0) {
      for (const c of chord)
        tone({ f: deg(c, 0), type: 'triangle', d: stepDur * 15, a: stepDur * 3, g: 0.02, out: musicGain });
      tone({ f: deg(chord[0], -1), type: 'sine', d: stepDur * 14, a: 0.05, g: 0.045, out: musicGain });
    }
    if ([0, 3, 6, 10, 12].includes(inBar) && (def.bright || inBar % 6 === 0)) {
      const n = chord[(s + bar) % 3] + (s % 5 === 0 ? 7 : 0);
      tone({ f: deg(n, 1 + (s % 8 === 0 ? 1 : 0)), type: def.bright ? 'triangle' : 'sine', d: stepDur * 2.2, g: 0.026, out: musicGain });
    }
    music.timer = setTimeout(tick, stepDur * 1000);
  };
  tick();
}
export function stopMusic() {
  if (music?.timer) clearTimeout(music.timer);
  music = null;
}
