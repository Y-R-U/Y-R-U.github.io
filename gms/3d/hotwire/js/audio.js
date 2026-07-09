// All sound synthesized via Web Audio — no audio files. Continuous loops
// (engine / siren / skid / rotor / radio) are node graphs we retune per frame;
// one-shots follow the deadtown envelope recipe.

import { P } from './save.js';

let ctx = null, master = null, sfxG = null, musG = null;

function ensure() {
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain(); master.gain.value = 0.8; master.connect(ctx.destination);
      sfxG = ctx.createGain(); sfxG.connect(master);
      musG = ctx.createGain(); musG.gain.value = 0.32; musG.connect(master);
      applySettings();
    } catch { return null; }
  }
  if (ctx && ctx.state === 'suspended') ctx.resume();
  return ctx;
}
export const unlock = () => { ensure(); startRadio(); };
export function applySettings() {
  if (!ctx) return;
  sfxG.gain.value = P().settings.sfx ? 1 : 0;
  musG.gain.value = P().settings.music ? 0.32 : 0;
}

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

// ── continuous: engine ──
let eng = null;
export function engine(on, speedFrac = 0, damaged = false) {
  const c = ensure(); if (!c) return;
  if (on && !eng) {
    const o1 = c.createOscillator(); o1.type = 'sawtooth';
    const o2 = c.createOscillator(); o2.type = 'square';
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 400;
    const g = c.createGain(); g.gain.value = 0;
    o1.connect(lp); o2.connect(lp); lp.connect(g).connect(sfxG);
    o1.start(); o2.start();
    eng = { o1, o2, lp, g };
  }
  if (!on && eng) {
    const { o1, o2, g } = eng;
    g.gain.linearRampToValueAtTime(0, c.currentTime + 0.15);
    setTimeout(() => { try { o1.stop(); o2.stop(); } catch { } }, 220);
    eng = null; return;
  }
  if (eng) {
    const f = 42 + speedFrac * 118 + (damaged ? Math.random() * 14 : 0);
    eng.o1.frequency.value = f;
    eng.o2.frequency.value = f * 0.5 + 2;
    eng.lp.frequency.value = 300 + speedFrac * 1400;
    eng.g.gain.value = 0.05 + speedFrac * 0.075;
  }
}

// ── continuous: siren (two-tone wail, intensity by star count) ──
let sir = null;
export function siren(on, stars = 1) {
  const c = ensure(); if (!c) return;
  if (on && !sir) {
    const o = c.createOscillator(); o.type = 'triangle';
    const lfo = c.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 1.6;
    const lfoG = c.createGain(); lfoG.gain.value = 140;
    lfo.connect(lfoG).connect(o.frequency);
    o.frequency.value = 700;
    const g = c.createGain(); g.gain.value = 0.0;
    o.connect(g).connect(sfxG);
    o.start(); lfo.start();
    sir = { o, lfo, g };
  }
  if (!on && sir) {
    const s = sir;
    s.g.gain.linearRampToValueAtTime(0, c.currentTime + 0.4);
    setTimeout(() => { try { s.o.stop(); s.lfo.stop(); } catch { } }, 500);
    sir = null; return;
  }
  if (sir) {
    sir.g.gain.value = Math.min(0.05, 0.016 + stars * 0.007);
    sir.lfo.frequency.value = 1.2 + stars * 0.35;
  }
}

// ── continuous: skid ──
let skd = null;
export function skid(on, amt = 1) {
  const c = ensure(); if (!c) return;
  if (on && !skd) {
    const src = c.createBufferSource(); src.buffer = noise(); src.loop = true;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 2.2;
    const g = c.createGain(); g.gain.value = 0;
    src.connect(bp).connect(g).connect(sfxG); src.start();
    skd = { src, bp, g };
  }
  if (!on && skd) {
    const s = skd;
    s.g.gain.linearRampToValueAtTime(0, c.currentTime + 0.1);
    setTimeout(() => { try { s.src.stop(); } catch { } }, 160);
    skd = null; return;
  }
  if (skd) { skd.g.gain.value = 0.05 * amt; skd.bp.frequency.value = 700 + amt * 500; }
}

// ── continuous: helicopter rotor ──
let rot = null;
export function rotor(on, near = 0.5) {
  const c = ensure(); if (!c) return;
  if (on && !rot) {
    const src = c.createBufferSource(); src.buffer = noise(); src.loop = true;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 280;
    const am = c.createOscillator(); am.type = 'sine'; am.frequency.value = 13;
    const amG = c.createGain(); amG.gain.value = 0.5;
    const g = c.createGain(); g.gain.value = 0;
    am.connect(amG).connect(g.gain);
    src.connect(lp).connect(g).connect(sfxG); src.start(); am.start();
    rot = { src, am, g };
  }
  if (!on && rot) {
    const r = rot;
    r.g.gain.linearRampToValueAtTime(0, c.currentTime + 0.5);
    setTimeout(() => { try { r.src.stop(); r.am.stop(); } catch { } }, 600);
    rot = null; return;
  }
  if (rot) rot.g.gain.value = 0.04 * near;
}

// ── one-shots ──
export function gunshot(kind = 'pistol') {
  const c = ensure(); if (!c) return;
  const t = c.currentTime;
  const heavy = kind === 'shotgun' || kind === 'rifle' || kind === 'rocket';
  const dur = kind === 'rocket' ? 0.3 : heavy ? 0.22 : 0.09;
  const src = c.createBufferSource(); src.buffer = noise(); src.loop = true;
  const lp = c.createBiquadFilter(); lp.type = 'lowpass';
  lp.frequency.setValueAtTime(heavy ? 2200 : 3200, t);
  lp.frequency.exponentialRampToValueAtTime(360, t + dur);
  const ng = c.createGain(); env(ng, t, heavy ? 0.4 : 0.2, dur);
  src.connect(lp).connect(ng).connect(sfxG); src.start(t); src.stop(t + dur + 0.02);
  const o = c.createOscillator(), og = c.createGain(); o.type = 'sine';
  o.frequency.setValueAtTime(heavy ? 90 : 140, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.1);
  env(og, t, heavy ? 0.36 : 0.2, heavy ? 0.15 : 0.1);
  o.connect(og).connect(sfxG); o.start(t); o.stop(t + 0.18);
}
export function flame() {
  const c = ensure(); if (!c) return;
  const t = c.currentTime;
  const src = c.createBufferSource(); src.buffer = noise(); src.loop = true;
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
  const g = c.createGain(); env(g, t, 0.06, 0.12, 0.02);
  src.connect(lp).connect(g).connect(sfxG); src.start(t); src.stop(t + 0.14);
}
export function explosion(big = false) {
  const c = ensure(); if (!c) return;
  const t = c.currentTime;
  const src = c.createBufferSource(); src.buffer = noise(); src.loop = true;
  const lp = c.createBiquadFilter(); lp.type = 'lowpass';
  lp.frequency.setValueAtTime(big ? 1600 : 1100, t);
  lp.frequency.exponentialRampToValueAtTime(60, t + (big ? 1.1 : 0.7));
  const g = c.createGain(); env(g, t, big ? 0.7 : 0.45, big ? 1.1 : 0.7, 0.008);
  src.connect(lp).connect(g).connect(sfxG); src.start(t); src.stop(t + 1.2);
  const o = c.createOscillator(), og = c.createGain(); o.type = 'sine';
  o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(28, t + 0.5);
  env(og, t, 0.55, 0.6, 0.01); o.connect(og).connect(sfxG); o.start(t); o.stop(t + 0.65);
}
export function crash(hard = 0.5) {
  const c = ensure(); if (!c) return;
  const t = c.currentTime;
  const src = c.createBufferSource(); src.buffer = noise(); src.loop = true;
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500 + hard * 900;
  const g = c.createGain(); env(g, t, 0.1 + hard * 0.3, 0.16 + hard * 0.12);
  src.connect(lp).connect(g).connect(sfxG); src.start(t); src.stop(t + 0.32);
  const o = c.createOscillator(), og = c.createGain(); o.type = 'sine';
  o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.09);
  env(og, t, 0.16 + hard * 0.22, 0.13); o.connect(og).connect(sfxG); o.start(t); o.stop(t + 0.16);
}
export function smashSound() {
  const c = ensure(); if (!c) return;
  const t = c.currentTime;
  const src = c.createBufferSource(); src.buffer = noise();
  const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 1.4;
  const g = c.createGain(); env(g, t, 0.22, 0.14);
  src.connect(bp).connect(g).connect(sfxG); src.start(t); src.stop(t + 0.16);
}
export function pickup() {
  const c = ensure(); if (!c) return;
  const t = c.currentTime;
  [660, 990].forEach((f, i) => {
    const o = c.createOscillator(), g = c.createGain(); o.type = 'triangle'; o.frequency.value = f;
    env(g, t + i * 0.06, 0.12, 0.16); o.connect(g).connect(sfxG);
    o.start(t + i * 0.06); o.stop(t + i * 0.06 + 0.18);
  });
}
export function cashSound() {
  const c = ensure(); if (!c) return;
  const t = c.currentTime;
  [1320, 1760].forEach((f, i) => {
    const o = c.createOscillator(), g = c.createGain(); o.type = 'square'; o.frequency.value = f;
    env(g, t + i * 0.05, 0.05, 0.09); o.connect(g).connect(sfxG);
    o.start(t + i * 0.05); o.stop(t + i * 0.05 + 0.1);
  });
}
export function hurt() {
  const c = ensure(); if (!c) return;
  const t = c.currentTime;
  const src = c.createBufferSource(); src.buffer = noise(); src.loop = true;
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 650;
  const g = c.createGain(); env(g, t, 0.24, 0.16);
  src.connect(lp).connect(g).connect(sfxG); src.start(t); src.stop(t + 0.18);
}
export function stinger(good = true) {
  const c = ensure(); if (!c) return;
  const t = c.currentTime;
  const seq = good ? [523, 659, 784, 1046] : [420, 330, 262, 208];
  seq.forEach((f, i) => {
    const o = c.createOscillator(), g = c.createGain(); o.type = 'triangle'; o.frequency.value = f;
    env(g, t + i * 0.09, 0.15, 0.24); o.connect(g).connect(sfxG);
    o.start(t + i * 0.09); o.stop(t + i * 0.09 + 0.26);
  });
}
export function blip() {
  const c = ensure(); if (!c) return;
  const t = c.currentTime;
  const o = c.createOscillator(), g = c.createGain(); o.type = 'square'; o.frequency.value = 880;
  env(g, t, 0.045, 0.05); o.connect(g).connect(sfxG); o.start(t); o.stop(t + 0.06);
}

// ── radio: a lazy synthwave-ish loop (bass 8ths + arp + hat) ──
let radioOn = false, radioTimer = null;
const BASS = [0, 0, 7, 7, 5, 5, 3, 3];        // semitones from A1
const ARP = [12, 16, 19, 24, 19, 16];
export function startRadio() {
  const c = ensure(); if (!c || radioOn) return;
  radioOn = true;
  let step = 0, nextT = c.currentTime + 0.1;
  const semi = (base, s) => base * Math.pow(2, s / 12);
  const tick = () => {
    if (!radioOn) return;
    const now = c.currentTime;
    while (nextT < now + 0.35) {
      const s = step % 8;
      // bass
      const o = c.createOscillator(), g = c.createGain(); o.type = 'sawtooth';
      o.frequency.value = semi(55, BASS[s]);
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 320;
      env(g, nextT, 0.12, 0.21, 0.01);
      o.connect(lp).connect(g).connect(musG); o.start(nextT); o.stop(nextT + 0.24);
      // arp (16ths, twice per step)
      for (let k = 0; k < 2; k++) {
        const a = c.createOscillator(), ag = c.createGain(); a.type = 'triangle';
        a.frequency.value = semi(110, ARP[(step * 2 + k) % ARP.length] + BASS[s]);
        env(ag, nextT + k * 0.115, 0.05, 0.1);
        a.connect(ag).connect(musG); a.start(nextT + k * 0.115); a.stop(nextT + k * 0.115 + 0.12);
      }
      // hat
      const h = c.createBufferSource(); h.buffer = noise();
      const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7000;
      const hg = c.createGain(); env(hg, nextT + 0.115, 0.03, 0.03);
      h.connect(hp).connect(hg).connect(musG); h.start(nextT + 0.115); h.stop(nextT + 0.18);
      nextT += 0.23; step++;
    }
    radioTimer = setTimeout(tick, 120);
  };
  tick();
}
export function stopRadio() { radioOn = false; clearTimeout(radioTimer); }
export function stopAll() {
  engine(false); siren(false); skid(false); rotor(false); stopRadio();
}
