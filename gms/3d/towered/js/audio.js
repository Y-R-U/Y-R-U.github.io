// All sound is synthesized — no audio files. A lazily-created AudioContext
// (unlocked on first gesture), a generative music loop whose scale/tempo
// changes per realm, and one-shot sfx for every game event.

let ctx = null, master = null, musicGain = null, sfxGain = null;
let muted = false;
try { muted = localStorage.getItem('towered-muted') === '1'; } catch { /* private mode */ }

export function unlock() {
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 1;
      master.connect(ctx.destination);
      musicGain = ctx.createGain(); musicGain.gain.value = 0.5; musicGain.connect(master);
      sfxGain = ctx.createGain(); sfxGain.gain.value = 0.9; sfxGain.connect(master);
    } catch { return; }
  }
  if (ctx.state === 'suspended') ctx.resume();
}
export function isMuted() { return muted; }
export function setMuted(m) {
  muted = m;
  try { localStorage.setItem('towered-muted', m ? '1' : '0'); } catch { /* ok */ }
  if (master) master.gain.linearRampToValueAtTime(m ? 0 : 1, ctx.currentTime + 0.1);
}

const ok = () => ctx && ctx.state === 'running';

// ── tiny synth helpers ──
function tone({ f = 440, f1 = null, type = 'sine', t0 = 0, a = 0.01, d = 0.25, g = 0.15, out = sfxGain }) {
  if (!ok()) return;
  const T = ctx.currentTime + t0;
  const o = ctx.createOscillator(), gn = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, T);
  if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), T + d);
  gn.gain.setValueAtTime(0.0001, T);
  gn.gain.exponentialRampToValueAtTime(g, T + a);
  gn.gain.exponentialRampToValueAtTime(0.0001, T + d);
  o.connect(gn).connect(out);
  o.start(T); o.stop(T + d + 0.05);
}

let noiseBuf = null;
function noise({ t0 = 0, d = 0.3, g = 0.2, fc = 800, q = 1, type = 'lowpass', fc1 = null }) {
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
  src.connect(flt).connect(gn).connect(sfxGain);
  src.start(T); src.stop(T + d + 0.05);
}

// ── sfx ──
export const sfx = {
  click: () => tone({ f: 880, type: 'triangle', d: 0.06, g: 0.06 }),
  build: () => { noise({ d: 0.12, g: 0.3, fc: 500 }); tone({ f: 180, f1: 90, d: 0.16, g: 0.2, type: 'sine' }); },
  upgrade: () => { tone({ f: 520, d: 0.12, g: 0.1 }); tone({ f: 660, t0: 0.09, d: 0.12, g: 0.1 }); tone({ f: 880, t0: 0.18, d: 0.2, g: 0.12 }); },
  sell: () => { tone({ f: 1320, type: 'square', d: 0.07, g: 0.045 }); tone({ f: 1760, type: 'square', t0: 0.07, d: 0.09, g: 0.045 }); },
  nogold: () => tone({ f: 160, f1: 120, type: 'square', d: 0.18, g: 0.06 }),
  ballista: () => { tone({ f: 300, f1: 90, type: 'sawtooth', d: 0.08, g: 0.07 }); noise({ d: 0.05, g: 0.1, fc: 3000, type: 'highpass' }); },
  cannon: () => { noise({ d: 0.34, g: 0.5, fc: 420, fc1: 60 }); tone({ f: 110, f1: 40, d: 0.32, g: 0.3 }); },
  catapult: () => { noise({ d: 0.4, g: 0.18, fc: 300, fc1: 1400, type: 'bandpass', q: 2 }); tone({ f: 70, f1: 55, type: 'triangle', d: 0.25, g: 0.12 }); },
  boom: () => { noise({ d: 0.5, g: 0.55, fc: 350, fc1: 50 }); tone({ f: 90, f1: 34, d: 0.45, g: 0.35 }); },
  frost: () => { for (let i = 0; i < 3; i++) tone({ f: 1600 + i * 420, t0: i * 0.03, d: 0.3, g: 0.03 }); },
  zap: () => { tone({ f: 1400, f1: 180, type: 'sawtooth', d: 0.12, g: 0.08 }); noise({ d: 0.08, g: 0.1, fc: 4000, type: 'highpass' }); },
  death: () => { noise({ d: 0.16, g: 0.2, fc: 300, fc1: 90 }); },
  bossDeath: () => { noise({ d: 0.7, g: 0.5, fc: 300, fc1: 40 }); tone({ f: 70, f1: 28, d: 0.7, g: 0.3 }); },
  leak: () => { tone({ f: 220, f1: 110, type: 'sawtooth', d: 0.4, g: 0.14 }); tone({ f: 165, f1: 82, type: 'sawtooth', t0: 0.05, d: 0.4, g: 0.12 }); },
  horn: () => { tone({ f: 196, type: 'sawtooth', d: 0.5, g: 0.09 }); tone({ f: 294, type: 'sawtooth', t0: 0.28, d: 0.75, g: 0.1 }); },
  bossHorn: () => { for (const [f, t] of [[131, 0], [131, 0.35], [98, 0.7]]) tone({ f, type: 'sawtooth', t0: t, d: 0.6, g: 0.12 }); },
  gold: () => tone({ f: 1560, type: 'triangle', d: 0.06, g: 0.035 }),
  win: () => { [523, 659, 784, 1047].forEach((f, i) => tone({ f, t0: i * 0.14, d: 0.4, g: 0.1 })); },
  lose: () => { [392, 330, 262, 196].forEach((f, i) => tone({ f, type: 'triangle', t0: i * 0.22, d: 0.5, g: 0.1 })); },
};

// ── generative music ──
// Per-realm scale + tempo; layers: pad chord (bar), bass root, arp plucks.
const REALM_MUSIC = {
  meadow: { root: 220, scale: [0, 2, 4, 7, 9], bpm: 82, bright: true },
  autumn: { root: 196, scale: [0, 2, 3, 5, 7, 10], bpm: 74, bright: true },
  winter: { root: 165, scale: [0, 2, 3, 7, 8], bpm: 64, bright: false },
  ash:    { root: 147, scale: [0, 1, 3, 5, 7], bpm: 58, bright: false },
  menu:   { root: 196, scale: [0, 2, 4, 7, 9], bpm: 66, bright: true },
};
let music = null;

export function startMusic(realm = 'menu') {
  stopMusic();
  const def = REALM_MUSIC[realm] || REALM_MUSIC.menu;
  music = { def, step: 0, timer: null, boss: false };
  const stepDur = 60 / def.bpm / 2;   // 8th notes
  const deg = (i, oct = 0) => def.root * Math.pow(2, oct) * Math.pow(2, def.scale[i % def.scale.length] / 12);

  const CHORDS = [[0, 2, 4], [3, 0, 2], [4, 1, 3], [2, 4, 0]];
  const tick = () => {
    if (!ok()) { music.timer = setTimeout(tick, 300); return; }
    const s = music.step++;
    const bar = Math.floor(s / 16), inBar = s % 16;
    const chord = CHORDS[bar % CHORDS.length];
    if (inBar === 0) {
      for (const c of chord)
        tone({ f: deg(c, 0), type: 'triangle', d: stepDur * 15, a: stepDur * 3, g: 0.022, out: musicGain });
      tone({ f: deg(chord[0], -1), type: 'sine', d: stepDur * 14, a: 0.05, g: 0.05, out: musicGain });
    }
    // sparse arp: pluck on some 8ths
    if ([0, 3, 6, 10, 12].includes(inBar) && (def.bright || inBar !== 6)) {
      const n = chord[(s + bar) % 3] + (s % 5 === 0 ? 7 : 0);
      tone({ f: deg(n % def.scale.length, 1 + (s % 8 === 0 ? 1 : 0)), type: def.bright ? 'triangle' : 'sine', d: stepDur * 2.2, g: 0.03, out: musicGain });
    }
    if (music.boss && inBar % 4 === 0) noise({ d: 0.09, g: 0.12, fc: 120 });
    music.timer = setTimeout(tick, stepDur * 1000);
  };
  tick();
}
export function setBossMusic(on) { if (music) music.boss = on; }
export function stopMusic() {
  if (music?.timer) clearTimeout(music.timer);
  music = null;
}
