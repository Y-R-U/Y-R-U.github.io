// All sound is synthesized at runtime via Web Audio — no audio files. One
// AudioContext (created/resumed on the first user gesture via unlock()), a
// master gain, and a small kit of punchy SFX: per-weapon gunshots, melee
// whooshes, impacts, zombie groans, pickups, hurt and an objective jingle.
// Wired through main's event bus + player firing.

let ctx = null, master = null, muted = false;

function ensure() {
  if (!ctx) {
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); master = ctx.createGain(); master.gain.value = 0.7; master.connect(ctx.destination); } catch { return null; }
  }
  if (ctx && ctx.state === 'suspended') ctx.resume();
  return ctx;
}
export const unlock = () => ensure();
export const setMuted = (m) => { muted = m; if (master) master.gain.value = m ? 0 : 0.7; };

let noiseBuf = null;
function noise() {
  const c = ensure(); if (!c) return null;
  if (!noiseBuf || noiseBuf.sampleRate !== c.sampleRate) {
    noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}
function env(node, t, peak, dur, attack = 0.004) {
  const g = node.gain;
  g.setValueAtTime(0.0001, t);
  g.exponentialRampToValueAtTime(peak, t + attack);
  g.exponentialRampToValueAtTime(0.0001, t + dur);
}

// ── gunshots: noise crack (lowpass sweep) + a low body thump; heavier guns
//    are longer/deeper, the pistol/SMG snappier ──
export function gunshot(def) {
  const c = ensure(); if (!c || muted) return;
  const t = c.currentTime;
  const m = def?.model;
  const heavy = m === 'shotgun' || m === 'rifle' || m === 'machinegun';
  const dur = heavy ? (m === 'shotgun' ? 0.26 : 0.18) : 0.1;
  const src = c.createBufferSource(); src.buffer = noise(); src.loop = true;
  const lp = c.createBiquadFilter(); lp.type = 'lowpass';
  lp.frequency.setValueAtTime(heavy ? 2400 : 3400, t);
  lp.frequency.exponentialRampToValueAtTime(380, t + dur);
  const ng = c.createGain(); env(ng, t, heavy ? 0.55 : 0.34, dur);
  src.connect(lp).connect(ng).connect(master); src.start(t); src.stop(t + dur + 0.02);
  const o = c.createOscillator(), og = c.createGain(); o.type = 'sine';
  o.frequency.setValueAtTime(heavy ? 95 : 150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.1);
  env(og, t, heavy ? 0.5 : 0.3, heavy ? 0.16 : 0.11);
  o.connect(og).connect(master); o.start(t); o.stop(t + 0.18);
}

export function melee() {
  const c = ensure(); if (!c || muted) return;
  const t = c.currentTime;
  const src = c.createBufferSource(); src.buffer = noise(); src.loop = true;
  const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.setValueAtTime(700, t); bp.frequency.exponentialRampToValueAtTime(2200, t + 0.16); bp.Q.value = 1.2;
  const g = c.createGain(); env(g, t, 0.22, 0.18);
  src.connect(bp).connect(g).connect(master); src.start(t); src.stop(t + 0.2);
}

export function thud() {
  const c = ensure(); if (!c || muted) return;
  const t = c.currentTime;
  const o = c.createOscillator(), g = c.createGain(); o.type = 'sine';
  o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(50, t + 0.1);
  env(g, t, 0.28, 0.12); o.connect(g).connect(master); o.start(t); o.stop(t + 0.14);
}

export function zombieDie() {
  const c = ensure(); if (!c || muted) return;
  const t = c.currentTime;
  const o = c.createOscillator(), g = c.createGain(); o.type = 'sawtooth';
  o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(60, t + 0.35);
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
  env(g, t, 0.18, 0.4, 0.02); o.connect(lp).connect(g).connect(master); o.start(t); o.stop(t + 0.42);
}

export function groan() {
  const c = ensure(); if (!c || muted) return;
  const t = c.currentTime;
  for (const f of [70, 104]) {
    const o = c.createOscillator(), g = c.createGain(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(f, t); o.frequency.linearRampToValueAtTime(f * 0.85, t + 0.6);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500;
    env(g, t, 0.05, 0.7, 0.08); o.connect(lp).connect(g).connect(master); o.start(t); o.stop(t + 0.72);
  }
}

export function hurt() {
  const c = ensure(); if (!c || muted) return;
  const t = c.currentTime;
  const src = c.createBufferSource(); src.buffer = noise(); src.loop = true;
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
  const g = c.createGain(); env(g, t, 0.3, 0.18); src.connect(lp).connect(g).connect(master); src.start(t); src.stop(t + 0.2);
}

export function pickup() {
  const c = ensure(); if (!c || muted) return;
  const t = c.currentTime;
  [660, 990].forEach((f, i) => { const o = c.createOscillator(), g = c.createGain(); o.type = 'triangle'; o.frequency.value = f; env(g, t + i * 0.06, 0.14, 0.16); o.connect(g).connect(master); o.start(t + i * 0.06); o.stop(t + i * 0.06 + 0.18); });
}

export function objective() {
  const c = ensure(); if (!c || muted) return;
  const t = c.currentTime;
  [523, 659, 784, 1046].forEach((f, i) => { const o = c.createOscillator(), g = c.createGain(); o.type = 'triangle'; o.frequency.value = f; env(g, t + i * 0.08, 0.16, 0.2); o.connect(g).connect(master); o.start(t + i * 0.08); o.stop(t + i * 0.08 + 0.22); });
}
