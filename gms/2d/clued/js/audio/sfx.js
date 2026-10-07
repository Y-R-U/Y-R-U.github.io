// Procedural UI sounds. play(name, opts) — names: correct wrong tick timerLow reveal streak fanfare button join
import { getCtx, buses, reverbIR, setVolume, setSfxVolume, mute, applySettings, unlock, installUnlock } from './ctx.js?v=202610071336';

export { setVolume, setSfxVolume, mute, applySettings, unlock, installUnlock };

let out = null, wet = null, noiseBuf = null;

function bus() {
  const c = getCtx();
  if (!c) return null;
  if (!out) {
    out = c.createGain(); out.gain.value = 0.9;
    out.connect(buses().sfx);
    const rv = c.createConvolver(); rv.buffer = reverbIR();
    wet = c.createGain(); wet.gain.value = 0.18;
    wet.connect(rv); rv.connect(buses().sfx);
  }
  return c;
}

function noise(c) {
  if (noiseBuf) return noiseBuf;
  noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

// one enveloped oscillator; partials give it a bell/mallet body instead of a bare beep
function tone(c, { f, t, dur = 0.3, type = 'sine', gain = 0.3, attack = 0.004, partials = null, glide = 0, cutoff = 0, send = 0.5, pan = 0 }) {
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let node = g;
  if (cutoff) {
    const lp = c.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(cutoff, t);
    lp.frequency.exponentialRampToValueAtTime(Math.max(200, cutoff * 0.25), t + dur);
    g.connect(lp); node = lp;
  }
  if (pan && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = pan; node.connect(p); node = p; }
  node.connect(out);
  if (send) { const s = c.createGain(); s.gain.value = send; node.connect(s); s.connect(wet); }
  for (const [mul, amp] of partials || [[1, 1]]) {
    const o = c.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f * mul, t);
    if (glide) o.frequency.exponentialRampToValueAtTime(f * mul * glide, t + dur);
    const pg = c.createGain(); pg.gain.value = amp;
    o.connect(pg); pg.connect(g);
    o.start(t); o.stop(t + dur + 0.05);
  }
}

function hiss(c, { t, dur = 0.2, gain = 0.2, from = 800, to = 6000, q = 1, type = 'bandpass', send = 0.3 }) {
  const s = c.createBufferSource(); s.buffer = noise(c);
  const f = c.createBiquadFilter(); f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(from, t); f.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + dur * 0.6);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(out);
  if (send) { const w = c.createGain(); w.gain.value = send; g.connect(w); w.connect(wet); }
  s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
}

const BELL = [[1, 1], [2.01, 0.35], [3.98, 0.12]];
const MALLET = [[1, 1], [3.99, 0.25], [9.2, 0.05]];

const SOUNDS = {
  correct(c, t) {
    tone(c, { f: mtof(76), t, dur: 0.35, partials: BELL, gain: 0.32 });
    tone(c, { f: mtof(83), t: t + 0.085, dur: 0.6, partials: BELL, gain: 0.34 });
    tone(c, { f: mtof(88), t: t + 0.085, dur: 0.5, partials: BELL, gain: 0.12, pan: 0.3 });
  },
  wrong(c, t) {
    tone(c, { f: mtof(50), t, dur: 0.32, type: 'sawtooth', gain: 0.2, cutoff: 1100, glide: 0.94, send: 0.1 });
    tone(c, { f: mtof(49.6), t, dur: 0.32, type: 'sawtooth', gain: 0.16, cutoff: 1000, glide: 0.94, send: 0.1 });
    tone(c, { f: mtof(46), t: t + 0.14, dur: 0.38, type: 'triangle', gain: 0.28, glide: 0.9, send: 0.1 });
  },
  tick(c, t) {
    tone(c, { f: 1650, t, dur: 0.05, partials: MALLET, gain: 0.16, glide: 0.8, send: 0 });
    hiss(c, { t, dur: 0.025, gain: 0.05, from: 5000, to: 3000, q: 2, send: 0 });
  },
  timerLow(c, t) {
    tone(c, { f: mtof(81), t, dur: 0.09, partials: MALLET, gain: 0.22, send: 0.1 });
    tone(c, { f: mtof(81), t: t + 0.12, dur: 0.12, partials: MALLET, gain: 0.18, send: 0.1 });
  },
  reveal(c, t) {
    hiss(c, { t, dur: 0.32, gain: 0.12, from: 500, to: 7000, q: 0.8 });
    tone(c, { f: mtof(84), t: t + 0.22, dur: 0.7, partials: BELL, gain: 0.1, pan: -0.3 });
    tone(c, { f: mtof(91), t: t + 0.26, dur: 0.7, partials: BELL, gain: 0.08, pan: 0.3 });
  },
  streak(c, t, o) {
    const up = Math.min(7, o.level || 0);
    [72, 76, 79, 84].forEach((m, i) => tone(c, { f: mtof(m + up), t: t + i * 0.055, dur: 0.35, partials: BELL, gain: 0.18 + i * 0.02, pan: (i - 1.5) * 0.2 }));
    hiss(c, { t: t + 0.15, dur: 0.3, gain: 0.04, from: 6000, to: 12000, type: 'highpass', send: 0.6 });
  },
  fanfare(c, t) {
    const brass = (m, at, d, g = 0.13) => {
      tone(c, { f: mtof(m), t: at, dur: d, type: 'sawtooth', gain: g, attack: 0.03, cutoff: 3200, send: 0.6 });
      tone(c, { f: mtof(m) * 1.004, t: at, dur: d, type: 'sawtooth', gain: g * 0.7, attack: 0.03, cutoff: 2800, send: 0.6 });
    };
    brass(67, t, 0.16); brass(67, t + 0.15, 0.16); brass(67, t + 0.3, 0.16);
    brass(72, t + 0.45, 1.3, 0.15); brass(76, t + 0.45, 1.3, 0.11); brass(79, t + 0.45, 1.3, 0.1);
    brass(48, t + 0.45, 1.3, 0.12);
    tone(c, { f: mtof(96), t: t + 0.5, dur: 1.1, partials: BELL, gain: 0.06 });
  },
  button(c, t) {
    tone(c, { f: 720, t, dur: 0.06, gain: 0.16, glide: 0.55, send: 0 });
    hiss(c, { t, dur: 0.02, gain: 0.03, from: 3000, to: 2000, q: 3, send: 0 });
  },
  join(c, t) {
    tone(c, { f: mtof(79), t, dur: 0.18, partials: MALLET, gain: 0.2 });
    tone(c, { f: mtof(86), t: t + 0.09, dur: 0.35, partials: BELL, gain: 0.22 });
  },
};
// kids skin: brighter, toy-like, never a "fail" sound
const GLOCK = [[1, 1], [2.76, 0.4], [5.4, 0.12]];
Object.assign(SOUNDS, {
  sparkle(c, t) {
    [84, 88, 91, 96, 100].forEach((m, i) => tone(c, { f: mtof(m), t: t + i * 0.045, dur: 0.4, partials: GLOCK, gain: 0.12, pan: (i - 2) * 0.25, send: 0.8 }));
    hiss(c, { t, dur: 0.35, gain: 0.03, from: 7000, to: 12000, type: 'highpass', send: 0.8 });
  },
  star(c, t, o) {
    const up = Math.min(12, (o.level || 0) * 2);
    tone(c, { f: mtof(79 + up), t, dur: 0.18, type: 'triangle', gain: 0.18, glide: 1.5, send: 0.3 });
    tone(c, { f: mtof(91 + up), t: t + 0.09, dur: 0.7, partials: GLOCK, gain: 0.2, send: 0.8 });
    tone(c, { f: mtof(98 + up), t: t + 0.14, dur: 0.6, partials: GLOCK, gain: 0.1, pan: 0.4, send: 0.8 });
  },
  kidsCorrect(c, t) {
    [72, 76, 79, 84].forEach((m, i) => tone(c, { f: mtof(m), t: t + i * 0.07, dur: 0.45, partials: GLOCK, gain: 0.2, send: 0.6 }));
    SOUNDS.sparkle(c, t + 0.22);
  },
  kidsWrong(c, t) {
    tone(c, { f: mtof(67), t, dur: 0.22, type: 'triangle', gain: 0.18, glide: 0.85, send: 0.2 });
    tone(c, { f: mtof(64), t: t + 0.16, dur: 0.3, type: 'triangle', gain: 0.16, glide: 0.95, send: 0.2 });
  },
  pop(c, t) {
    tone(c, { f: 420, t, dur: 0.08, gain: 0.22, glide: 2.6, send: 0.1 });
  },
});
SOUNDS.timer_low = SOUNDS.timerLow;
SOUNDS.click = SOUNDS.button;
SOUNDS.win = SOUNDS.fanfare;

export const names = Object.keys(SOUNDS);

let skin = 'default';
const KIDS = { correct: 'kidsCorrect', wrong: 'kidsWrong', streak: 'star', button: 'pop', reveal: 'sparkle' };
export function setSkin(s) { skin = s === 'kids' ? 'kids' : 'default'; }

const last = {};
export function play(name, opts = {}) {
  const kids = opts.kids ?? (skin === 'kids' || !!globalThis.document?.body?.classList.contains('kids-on'));
  if (kids && KIDS[name]) name = KIDS[name];
  const fn = SOUNDS[name];
  const c = bus();
  if (!fn || !c) return;
  if (c.state !== 'running') { if (opts.force) c.resume(); else return; }
  const now = c.currentTime;
  if (last[name] && now - last[name] < 0.03) return;
  last[name] = now;
  fn(c, now + 0.005, opts);
}

// for tests: render a sound into an AudioBuffer
export async function render(name, opts = {}, seconds = 2) {
  const OC = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
  const c = new OC(2, Math.ceil(44100 * seconds), 44100);
  const saved = [out, wet, noiseBuf];
  out = c.createGain(); out.connect(c.destination);
  wet = c.createGain(); wet.gain.value = 0;
  noiseBuf = null;
  SOUNDS[name](c, 0.01, opts);
  const buf = await c.startRendering();
  [out, wet, noiseBuf] = saved;
  return buf;
}

export default { play, names, setSkin, setVolume, setSfxVolume, mute, applySettings, unlock, render };
