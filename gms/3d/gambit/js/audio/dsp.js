// GAMBIT audio — synth toolkit for sound recipes. Owner: audio agent.
//
// A recipe is a plain object:
//   { dur: seconds, lvl: dB (loudness relative to a normal move, default 0),
//     variants: n (default 1), build(s, v) }
// `build` wires a small WebAudio graph into an OfflineAudioContext through the helpers on `s`
// (below). The engine renders each variant ONCE into an AudioBuffer, normalises it (peak
// <= -3 dBFS, loudness to `lvl`) and from then on playback is a single BufferSource, so even
// the fancy battle sounds cost almost no CPU per play.
//
// Helpers (all times in seconds from the start of the sound; `to` = destination node, default s.out):
//   s.rand()                         seeded 0..1 (same variant = same sound every time)
//   s.jit(x, amt)                    x * (1 ± amt) random
//   s.tone({t,f,f2,dur,type,a,g,pan,to,glide,vib,vibDepth,decay})       oscillator with envelope
//   s.noise({t,dur,g,a,color,type,f,f2,Q,pan,to,decay})                  filtered noise burst
//   s.modal({t,modes:[[f,decay,gain],...],g,pan,to,strike})              struck resonator (wood, metal, glass)
//   s.bell({t,f,ratio,index,dur,g,pan,to})                               FM bell / chime
//   s.verb(seconds, {mix, tone})     -> a node to send into (convolution reverb into s.out)
//   s.bus({g, pan, lp, hp, to})      -> gain node with optional filters
// Every helper returns quickly; nothing here touches the live AudioContext.

export function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const noiseCache = new WeakMap();
function noiseBuffer(oc, color, rand) {
  let m = noiseCache.get(oc); if (!m) noiseCache.set(oc, m = {});
  if (m[color]) return m[color];
  const len = Math.min(oc.length, Math.ceil(oc.sampleRate * 4)) || 1;
  const b = oc.createBuffer(1, len, oc.sampleRate), d = b.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, last = 0;
  for (let i = 0; i < len; i++) {
    const w = rand() * 2 - 1;
    if (color === 'pink') { b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2; }
    else if (color === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
    else d[i] = w;
  }
  return (m[color] = b);
}

export function makeSynth(oc, seed = 1) {
  const rand = mulberry(seed * 9973 + 17);
  const out = oc.createGain(); out.connect(oc.destination);
  const T = t => Math.max(0, t || 0);
  const panner = (p, to) => {
    if (!p || !oc.createStereoPanner) return to;
    const n = oc.createStereoPanner(); n.pan.value = Math.max(-1, Math.min(1, p)); n.connect(to); return n;
  };
  // attack-then-exponential-decay envelope on a gain param
  function env(param, t, a, g, dur, decay = 'exp') {
    param.setValueAtTime(0.0001, t);
    if (a > 0) param.linearRampToValueAtTime(g, t + a); else param.setValueAtTime(g, t);
    if (decay === 'lin') param.linearRampToValueAtTime(0.0001, t + a + dur);
    else if (decay === 'hold') { param.setValueAtTime(g, t + a + dur * 0.7); param.linearRampToValueAtTime(0.0001, t + a + dur); }
    else param.setTargetAtTime(0.0001, t + a, Math.max(0.002, dur / 5));
  }
  const s = {
    oc, out, rand, sr: oc.sampleRate,
    jit: (x, amt = 0.05) => x * (1 + (rand() * 2 - 1) * amt),
    pick: arr => arr[Math.floor(rand() * arr.length) % arr.length],

    bus({ g = 1, pan = 0, lp, hp, bp, Q = 0.7, to } = {}) {
      let dest = panner(pan, to || out);
      const chain = [];
      if (lp) chain.push(['lowpass', lp]); if (hp) chain.push(['highpass', hp]); if (bp) chain.push(['bandpass', bp]);
      for (const [type, f] of chain) { const fl = oc.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = Q; fl.connect(dest); dest = fl; }
      const n = oc.createGain(); n.gain.value = g; n.connect(dest); return n;
    },

    tone({ t = 0, f = 440, f2, dur = 0.2, type = 'sine', a = 0.004, g = 0.3, pan = 0, to, glide = 'exp', glideT, vib = 0, vibDepth = 0, decay = 'exp', detune = 0, lp } = {}) {
      t = T(t);
      const o = oc.createOscillator(), gn = oc.createGain();
      o.type = type; o.frequency.setValueAtTime(f, t); if (detune) o.detune.value = detune;
      if (f2) {
        const gt = glideT ?? dur;
        if (glide === 'lin') o.frequency.linearRampToValueAtTime(f2, t + gt);
        else o.frequency.exponentialRampToValueAtTime(Math.max(1, f2), t + gt);
      }
      if (vib) { const l = oc.createOscillator(), lg = oc.createGain(); l.frequency.value = vib; lg.gain.value = vibDepth || f * 0.02; l.connect(lg).connect(o.frequency); l.start(t); l.stop(t + a + dur + 0.05); }
      env(gn.gain, t, a, g, dur, decay);
      let dest = panner(pan, to || out);
      if (lp) { const fl = oc.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = lp; fl.connect(dest); dest = fl; }
      o.connect(gn).connect(dest);
      o.start(t); o.stop(t + a + dur + 0.05);
      return { o, g: gn };
    },

    noise({ t = 0, dur = 0.1, g = 0.3, a = 0.001, color = 'white', type, f = 1000, f2, Q = 1, pan = 0, to, decay = 'exp', fT } = {}) {
      t = T(t);
      const src = oc.createBufferSource(); src.buffer = noiseBuffer(oc, color, rand); src.loop = true;
      const off = rand() * (src.buffer.duration - 0.01);
      const gn = oc.createGain(); env(gn.gain, t, a, g, dur, decay);
      let node = src;
      if (type) {
        const fl = oc.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = Q;
        if (f2) fl.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + (fT ?? dur));
        node.connect(fl); node = fl;
      }
      node.connect(gn).connect(panner(pan, to || out));
      src.start(t, off); src.stop(t + a + dur + 0.1);
      return { src, g: gn };
    },

    // a struck object: a bank of exponentially decaying sine "modes" plus a short filtered
    // noise click for the strike texture. modes: [[freq, decaySeconds, relGain], ...]
    modal({ t = 0, modes, g = 0.5, pan = 0, to, strike = 0.003, click = 0.15, clickF = 3000 } = {}) {
      t = T(t);
      const dest = panner(pan, to || out);
      for (const [f, decay, mg = 1] of modes) {
        const o = oc.createOscillator(), gn = oc.createGain();
        o.frequency.value = f; o.type = 'sine';
        gn.gain.setValueAtTime(0.0001, t);
        gn.gain.linearRampToValueAtTime(mg * g * 0.5, t + 0.0007);
        gn.gain.setTargetAtTime(0.00001, t + 0.0007, Math.max(0.001, decay / 3));
        o.connect(gn).connect(dest); o.start(t); o.stop(t + decay * 2 + 0.02);
      }
      if (click) s.noise({ t, dur: strike, a: 0.0003, g: click * g, type: 'bandpass', f: clickF, Q: 0.6, to: dest });
    },

    bell({ t = 0, f = 880, ratio = 3.5, index = 2, dur = 0.8, g = 0.25, pan = 0, to, a = 0.002 } = {}) {
      t = T(t);
      const car = oc.createOscillator(), mod = oc.createOscillator(), mg = oc.createGain(), gn = oc.createGain();
      car.frequency.value = f; mod.frequency.value = f * ratio;
      mg.gain.setValueAtTime(f * index, t); mg.gain.setTargetAtTime(0, t, dur / 6);
      mod.connect(mg).connect(car.frequency);
      env(gn.gain, t, a, g, dur);
      car.connect(gn).connect(panner(pan, to || out));
      car.start(t); mod.start(t); car.stop(t + dur + 0.05); mod.stop(t + dur + 0.05);
    },

    verb(seconds = 1, { mix = 0.25, tone = 4000, pre = 0.01 } = {}) {
      const len = Math.ceil(oc.sampleRate * seconds), ir = oc.createBuffer(2, len, oc.sampleRate);
      for (let c = 0; c < 2; c++) {
        const d = ir.getChannelData(c);
        for (let i = 0; i < len; i++) { const k = i / len; d[i] = (rand() * 2 - 1) * Math.pow(1 - k, 3) * (i < pre * oc.sampleRate ? 0 : 1); }
      }
      const cv = oc.createConvolver(); cv.buffer = ir;
      const lp = oc.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = tone;
      const wet = oc.createGain(); wet.gain.value = mix;
      const inp = oc.createGain();
      inp.connect(cv).connect(lp).connect(wet).connect(out);
      inp.connect(out);              // the send carries the dry signal too
      return inp;
    },
  };
  return s;
}

// ---------- shared building blocks used by core + theme recipes ----------

/** A piece set down on a surface. kind: 'wood' | 'marble' | 'hollow' | 'stone' | 'felt' */
export function placeHit(s, { t = 0, kind = 'wood', g = 0.5, pitch = 1, pan = 0, to, ring = 0 } = {}) {
  const p = pitch * s.jit(1, 0.04);
  const M = {
    wood:   [[640, 0.045, 1], [1180, 0.032, 0.8], [1890, 0.022, 0.6], [2950, 0.014, 0.35]],
    marble: [[980, 0.03, 0.9], [2150, 0.022, 0.8], [3480, 0.018, 0.55], [5200, 0.012, 0.3]],
    hollow: [[360, 0.07, 1], [720, 0.05, 0.6], [1240, 0.03, 0.45], [2100, 0.016, 0.25]],
    stone:  [[520, 0.03, 1], [1300, 0.02, 0.7], [2600, 0.012, 0.5], [4100, 0.008, 0.3]],
  }[kind] || [];
  s.modal({ t, modes: M.map(([f, d, m]) => [s.jit(f * p, 0.05), d, m]), g, pan, to, click: kind === 'marble' ? 0.7 : 0.5, clickF: kind === 'marble' ? 4200 : 2800 });
  // body thump: the board itself (kept modest: phone speakers can't play it anyway)
  s.tone({ t, f: 210 * p, f2: 120 * p, dur: 0.035, glideT: 0.03, g: g * 0.3, a: 0.001, pan, to });
  if (ring) s.tone({ t, f: s.jit(3150 * p, 0.03), dur: 0.22, g: g * 0.05 * ring, a: 0.001, pan, to });
}

/** A swish of air (sword swing, piece flying past). up=true rises. */
export function whoosh(s, { t = 0, dur = 0.35, g = 0.4, f = 500, f2 = 2400, Q = 1.4, pan = 0, pan2, to, color = 'pink' } = {}) {
  const bus = pan2 != null && s.oc.createStereoPanner ? (() => { const p = s.oc.createStereoPanner(); p.pan.setValueAtTime(pan, t); p.pan.linearRampToValueAtTime(pan2, t + dur); p.connect(to || s.out); return p; })() : (to || s.out);
  s.noise({ t, dur, a: dur * 0.45, g, color, type: 'bandpass', f, f2, Q, to: bus, decay: 'lin', pan: pan2 != null ? 0 : pan });
}

/** Marimba / mallet note (soft, warm) */
export function mallet(s, { t = 0, f = 523, dur = 0.5, g = 0.25, pan = 0, to } = {}) {
  s.tone({ t, f, dur, g, a: 0.002, pan, to });
  s.tone({ t, f: f * 4, dur: dur * 0.18, g: g * 0.22, a: 0.001, pan, to });
  s.tone({ t, f: f * 10, dur: dur * 0.05, g: g * 0.08, a: 0.0005, pan, to });
}

/** Crackle: a scatter of tiny clicks (fire, debris, sparks). */
export function crackle(s, { t = 0, dur = 0.8, n = 30, g = 0.15, f = 3000, spread = 1, to } = {}) {
  for (let i = 0; i < n; i++) {
    const tt = t + Math.pow(s.rand(), 1.3) * dur;
    s.noise({ t: tt, dur: 0.004 + s.rand() * 0.01, g: g * (0.3 + s.rand()), type: 'bandpass', f: s.jit(f, 0.5), Q: 2, pan: (s.rand() * 2 - 1) * 0.5 * spread, to });
  }
}

export const NOTE = n => 440 * Math.pow(2, (n - 69) / 12);   // midi -> Hz
