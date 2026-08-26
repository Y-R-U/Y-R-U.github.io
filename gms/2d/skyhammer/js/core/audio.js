// Procedural Web Audio. A working stub: no files, no fetches, everything synthesised.
// CONTRACTS §11 signature. Safe to call before unlock() — it just does nothing.

let ctx = null, master = null, sfxBus = null, musicBus = null;
let sfxOn = true, musicOn = true, unlocked = false;
let musicTimer = 0, musicTrack = null;

const rand = (a, b) => a + Math.random() * (b - a);

function env(node, t0, a, d, peak) {
  node.gain.setValueAtTime(0.0001, t0);
  node.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + a);
  node.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
}

function noiseBuffer(secs) {
  const n = Math.floor(ctx.sampleRate * secs);
  const b = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

function blip({ f0, f1, dur, type = 'square', gain = 0.18, t0 }) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t0);
  if (f1 !== undefined) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
  env(g, t0, 0.006, dur, gain);
  o.connect(g).connect(sfxBus);
  o.start(t0); o.stop(t0 + dur + 0.05);
}

function boom({ dur = 0.7, gain = 0.5, t0, lo = 180 }) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(dur);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(lo * 6, t0);
  lp.frequency.exponentialRampToValueAtTime(lo, t0 + dur);
  const g = ctx.createGain();
  env(g, t0, 0.01, dur, gain);
  src.connect(lp).connect(g).connect(sfxBus);
  src.start(t0); src.stop(t0 + dur);
}

const VOICES = {
  gun:    (t) => blip({ f0: rand(700, 900), f1: 180, dur: 0.05, type: 'square', gain: 0.06, t0: t }),
  cannon: (t) => { blip({ f0: 300, f1: 90, dur: 0.09, type: 'sawtooth', gain: 0.12, t0: t }); boom({ dur: 0.14, gain: 0.16, lo: 260, t0: t }); },
  drop:   (t) => blip({ f0: 900, f1: 220, dur: 0.28, type: 'sine', gain: 0.1, t0: t }),
  rocket: (t) => { blip({ f0: 240, f1: 1400, dur: 0.3, type: 'sawtooth', gain: 0.1, t0: t }); },
  boom:   (t) => boom({ dur: 0.75, gain: 0.5, lo: 130, t0: t }),
  bigboom:(t) => { boom({ dur: 1.5, gain: 0.7, lo: 70, t0: t }); blip({ f0: 120, f1: 34, dur: 0.9, type: 'sine', gain: 0.3, t0: t }); },
  hit:    (t) => blip({ f0: 420, f1: 150, dur: 0.06, type: 'triangle', gain: 0.09, t0: t }),
  hurt:   (t) => { blip({ f0: 200, f1: 70, dur: 0.2, type: 'sawtooth', gain: 0.16, t0: t }); },
  pickup: (t) => { blip({ f0: 660, f1: 990, dur: 0.1, type: 'sine', gain: 0.16, t0: t }); blip({ f0: 990, f1: 1320, dur: 0.12, type: 'sine', gain: 0.12, t0: t + 0.07 }); },
  ui:     (t) => blip({ f0: 520, f1: 700, dur: 0.06, type: 'sine', gain: 0.1, t0: t }),
  win:    (t) => [0, 0.12, 0.24, 0.42].forEach((d, i) => blip({ f0: 440 * Math.pow(1.26, i), dur: 0.3, type: 'triangle', gain: 0.16, t0: t + d })),
  lose:   (t) => [0, 0.16, 0.34].forEach((d, i) => blip({ f0: 380 / Math.pow(1.22, i), f1: 90, dur: 0.4, type: 'sawtooth', gain: 0.18, t0: t + d })),
  land:   (t) => { boom({ dur: 0.4, gain: 0.25, lo: 200, t0: t }); },
};

// One drone + a slow minor arpeggio. Deliberately thin — the real music is not my job.
const SCALE = [0, 3, 5, 7, 10];
function scheduleMusic() {
  if (!ctx || !musicOn || !musicTrack) return;
  const t = ctx.currentTime + 0.05;
  const root = 110;
  const n = SCALE[Math.floor(Math.random() * SCALE.length)] + (Math.random() < 0.3 ? 12 : 0);
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = 'triangle';
  o.frequency.value = root * Math.pow(2, n / 12);
  env(g, t, 0.5, 2.4, 0.05);
  o.connect(g).connect(musicBus);
  o.start(t); o.stop(t + 3.2);
}

export const audio = {
  get ready() { return unlocked; },

  unlock() {
    if (unlocked) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try {
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = 0.85; master.connect(ctx.destination);
      sfxBus = ctx.createGain(); sfxBus.gain.value = 1; sfxBus.connect(master);
      musicBus = ctx.createGain(); musicBus.gain.value = 0.5; musicBus.connect(master);
      if (ctx.state === 'suspended') ctx.resume();
      unlocked = true;
    } catch { return false; }
    return true;
  },

  sfx(id, opts = {}) {
    if (!unlocked || !sfxOn || !ctx) return;
    const v = VOICES[id];
    if (!v) return;
    const t = ctx.currentTime + (opts.delay || 0);
    try { v(t); } catch { /* a starved audio graph must never break the frame */ }
  },

  music(trackId) { musicTrack = trackId || null; },
  setMusic(on) { musicOn = !!on; if (musicBus) musicBus.gain.value = musicOn ? 0.5 : 0; },
  setSfx(on) { sfxOn = !!on; if (sfxBus) sfxBus.gain.value = sfxOn ? 1 : 0; },
  duck(x) { if (master) master.gain.value = 0.85 * (1 - Math.max(0, Math.min(1, x))); },

  /** main.js calls this once per frame; music is scheduled lazily so there is no timer. */
  tick(dt) {
    if (!unlocked || !musicOn || !musicTrack) return;
    musicTimer -= dt;
    if (musicTimer <= 0) { musicTimer = 1.6 + Math.random() * 1.4; scheduleMusic(); }
  },
};
