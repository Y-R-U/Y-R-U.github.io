// Audio graph, buses, reverb IR, envelopes, Karplus-Strong renderer, and the sustained-source
// layer. Everything takes an engine so the same code renders in an OfflineAudioContext.
//
// Two contracts live here:
//   one-shot    SFX[id].play(eng, o)             fire and forget, tracked by {s,e}
//   sustained   eng.source(id, o) -> handle      create, push params every frame, release

const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export function midiOf(name) {
  const m = /^([A-Ga-g])([#b]?)(-?\d)$/.exec(name);
  if (!m) return NaN;
  return PC[m[1].toUpperCase()] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (+m[3] + 1) * 12;
}
export const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
export const ftom = f => 69 + 12 * Math.log2(f / 440);
export const freqOf = n => typeof n === 'number' ? mtof(n) : mtof(midiOf(n));

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const nameOf = m => NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);

function satCurve(k) {
  const n = 2048, c = new Float32Array(n), d = Math.tanh(k);
  for (let i = 0; i < n; i++) c[i] = Math.tanh(k * (i / (n - 1) * 2 - 1)) / d;
  return c;
}

function makeIR(ctx, seconds, decay, damp) {
  const sr = ctx.sampleRate, len = Math.max(1, Math.floor(sr * seconds));
  const buf = ctx.createBuffer(2, len, sr);
  const pre = Math.floor(sr * 0.011);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0, peak = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      // one-pole coefficient falls with time, so the tail darkens like a real hall
      const a = Math.max(0.02, damp * Math.pow(1 - t, 1.4));
      const n = i < pre ? 0 : (Math.random() * 2 - 1) * Math.pow(1 - t, decay);
      lp += a * (n - lp);
      d[i] = lp;
      if (Math.abs(lp) > peak) peak = Math.abs(lp);
    }
    // sparse early reflections
    for (let k = 0; k < 7; k++) {
      const i = pre + Math.floor(sr * (0.013 + k * 0.0091 + Math.random() * 0.004));
      if (i < len) d[i] += (Math.random() * 2 - 1) * 0.5 * Math.pow(0.72, k);
    }
    if (peak > 0) for (let i = 0; i < len; i++) d[i] /= peak * 3.2;
  }
  return buf;
}

function makeNoise(ctx, seconds) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const b = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

export function createEngine(ctx, opts = {}) {
  const dry = ctx.createGain();
  const verbIn = ctx.createGain();
  const verb = ctx.createConvolver();
  const verbOut = ctx.createGain();
  const bus = ctx.createGain();
  const dcCut = ctx.createBiquadFilter();
  const sat = ctx.createWaveShaper();
  const comp = ctx.createDynamicsCompressor();
  const master = ctx.createGain();
  const analyser = ctx.createAnalyser();

  verb.buffer = makeIR(ctx, opts.irSeconds ?? 2.6, opts.irDecay ?? 2.4, opts.irDamp ?? 0.6);
  verbOut.gain.value = opts.wet ?? 0.9;
  dcCut.type = 'highpass'; dcCut.frequency.value = 22; dcCut.Q.value = 0.5;
  sat.curve = satCurve(1.6); sat.oversample = '2x';
  comp.threshold.value = -13; comp.knee.value = 22; comp.ratio.value = 3;
  comp.attack.value = 0.005; comp.release.value = 0.2;
  master.gain.value = opts.master ?? 0.72;
  analyser.fftSize = 2048; analyser.smoothingTimeConstant = 0.4;

  dry.connect(bus);
  verbIn.connect(verb); verb.connect(verbOut); verbOut.connect(bus);
  bus.connect(dcCut); dcCut.connect(sat); sat.connect(comp);
  comp.connect(master); master.connect(analyser); analyser.connect(ctx.destination);

  const eng = {
    ctx, dry, verbIn, verbOut, master, analyser, comp,
    noise: makeNoise(ctx, 3),
    live: [],          // {s,e} per voice — a voice that never releases has a non-finite e
    garbage: [],
    ksCache: new Map(),
    stepCache: new Map(),
    now: () => ctx.currentTime,
  };

  eng.track = (startAt, stopAt) => { eng.live.push({ s: startAt, e: stopAt }); };
  eng.activeAt = t => eng.live.reduce((n, v) => n + (v.s <= t && v.e > t ? 1 : 0), 0);

  eng.voice = (t, dur, send = 0) => {
    const g = ctx.createGain();
    g.connect(dry);
    if (send > 0) {
      const s = ctx.createGain(); s.gain.value = send;
      g.connect(s); s.connect(verbIn);
      eng.garbage.push({ n: s, t: t + dur + 4 });
    }
    eng.track(t, t + dur);
    eng.garbage.push({ n: g, t: t + dur + 4 });
    return g;
  };

  eng.reap = (at) => {
    const t = at ?? ctx.currentTime;
    for (let i = eng.garbage.length - 1; i >= 0; i--) {
      if (eng.garbage[i].t < t) { try { eng.garbage[i].n.disconnect(); } catch {} eng.garbage.splice(i, 1); }
    }
    if (eng.live.length > 512) eng.live = eng.live.filter(v => v.e > t - 1);
    if (eng.sources) eng.sources.reap(t);
  };

  eng.noiseSrc = (t, dur, rate = 1) => {
    const s = ctx.createBufferSource();
    s.buffer = eng.noise; s.loop = true;
    s.playbackRate.value = rate;
    s.start(t, Math.random() * 2, dur + 0.05);
    s.stop(t + dur + 0.05);
    return s;
  };

  // A noise source that runs until it is stopped. The one-shot noiseSrc() always ends.
  eng.noiseLoop = (t, rate = 1) => {
    const s = ctx.createBufferSource();
    s.buffer = eng.noise; s.loop = true;
    s.playbackRate.value = rate;
    s.start(t, Math.random() * 2);
    return s;
  };

  // Sample-and-hold random at a chosen rate, as a loopable buffer. Driving a gain AudioParam
  // from one of these is how a misfire happens without scheduling anything per event.
  eng.stepNoise = (hz, seconds = 4) => {
    const key = `${hz}|${seconds}`;
    let b = eng.stepCache.get(key);
    if (b) return b;
    const sr = ctx.sampleRate, len = Math.max(2, Math.floor(sr * seconds));
    const hold = Math.max(1, Math.round(sr / hz));
    b = ctx.createBuffer(1, len, sr);
    const d = b.getChannelData(0);
    let v = 0;
    for (let i = 0; i < len; i++) {
      if (i % hold === 0) v = Math.random() * 2 - 1;
      d[i] = v;
    }
    for (let i = len - hold; i < len; i++) d[i] = d[0];   // seamless wrap
    eng.stepCache.set(key, b);
    return b;
  };

  eng.stepSrc = (t, hz, seconds = 4) => {
    const s = ctx.createBufferSource();
    s.buffer = eng.stepNoise(hz, seconds); s.loop = true;
    s.start(t, Math.random() * seconds);
    return s;
  };

  eng.setWet = v => { verbOut.gain.value = v; };
  eng.setRoom = (seconds, decay, damp) => { verb.buffer = makeIR(ctx, seconds, decay, damp); };

  eng.ks = (freq, dur, p) => {
    const key = `${freq.toFixed(2)}|${dur.toFixed(2)}|${p.t60}|${p.damp}|${p.tone}|${p.body || 0}`;
    let b = eng.ksCache.get(key);
    if (b) return b;
    b = ksBuffer(ctx, freq, dur, p);
    if (eng.ksCache.size > 220) eng.ksCache.clear();
    eng.ksCache.set(key, b);
    return b;
  };

  attachSustain(eng, opts.sustain || {});
  return eng;
}

// Karplus-Strong: delay line the length of one period, lowpassed feedback.
// Rendered into a buffer in JS because Web Audio has no sample-rate feedback path.
export function ksBuffer(ctx, freq, dur, p) {
  const sr = ctx.sampleRate;
  const n = Math.max(64, Math.round(dur * sr));
  const damp = Math.min(0.95, Math.max(0.05, p.damp));
  // the feedback lowpass adds (1-damp)/damp samples of delay; subtract it or the note plays flat
  const L = Math.max(3, sr / freq - (1 - damp) / damp);
  const D = Math.floor(L), frac = L - D;
  const line = new Float32Array(D);
  const decay = Math.pow(0.001, 1 / (Math.max(0.05, p.t60) * sr));

  let s = 0;
  const tone = Math.min(1, Math.max(0.02, p.tone));
  for (let i = 0; i < D; i++) { s += tone * ((Math.random() * 2 - 1) - s); line[i] = s; }
  let mean = 0; for (let i = 0; i < D; i++) mean += line[i];
  mean /= D;
  let pk = 0;
  for (let i = 0; i < D; i++) { line[i] -= mean; pk = Math.max(pk, Math.abs(line[i])); }
  if (pk > 0) for (let i = 0; i < D; i++) line[i] /= pk;

  const out = ctx.createBuffer(1, n, sr);
  const o = out.getChannelData(0);
  let idx = 0, lp = 0;
  for (let i = 0; i < n; i++) {
    const j = idx + 1 === D ? 0 : idx + 1;
    const v = line[idx] * (1 - frac) + line[j] * frac;
    o[i] = v;
    lp += damp * (v - lp);
    line[idx] = lp * decay;
    idx = j;
  }
  const fade = Math.min(Math.floor(sr * 0.02), n);
  for (let i = 0; i < fade; i++) o[n - 1 - i] *= i / fade;
  return out;
}

// ── envelopes ────────────────────────────────────────────────
const EPS = 0.0005;

export function perc(param, t, peak, attack, decay) {
  peak = Math.max(EPS * 2, peak);
  param.setValueAtTime(0, t);
  param.linearRampToValueAtTime(peak, t + attack);
  param.exponentialRampToValueAtTime(EPS, t + attack + decay);
  param.linearRampToValueAtTime(0, t + attack + decay + 0.01);
}

export function adsr(param, t, peak, a, d, sus, hold, r) {
  param.setValueAtTime(0, t);
  param.linearRampToValueAtTime(peak, t + a);
  param.exponentialRampToValueAtTime(Math.max(EPS, peak * sus), t + a + d);
  const off = t + Math.max(a + d, hold);
  param.setValueAtTime(Math.max(EPS, peak * sus), off);
  param.exponentialRampToValueAtTime(EPS, off + r);
  param.linearRampToValueAtTime(0, off + r + 0.012);
  return off + r + 0.012;
}

export function biquad(ctx, type, freq, Q, gain) {
  const f = ctx.createBiquadFilter();
  f.type = type; f.frequency.value = freq;
  if (Q != null) f.Q.value = Q;
  if (gain != null) f.gain.value = gain;
  return f;
}

export function chain(nodes) {
  for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
  return nodes[0];
}

export function shaper(ctx, k) {
  const w = ctx.createWaveShaper();
  w.curve = satCurve(k); w.oversample = '2x';
  return w;
}

export const rnd = (a, b) => a + Math.random() * (b - a);

// ── sustained sources ────────────────────────────────────────
// The lab this came from is entirely one-shot. A rotary engine is not: it is created once, driven
// every frame by RPM / load / mixture / position, and released. That is this layer.
//
//   const h = eng.source('rotary', { x, y, rpm: 0.6 });
//   h.set({ rpm, load, mixture });   h.at(x, y, vx, vy);   ...every frame...
//   h.stop(0.4);
//
// Every write goes through an explicit time so the whole thing renders in an OfflineAudioContext:
// the harness sweeps a parameter by calling set() at t = 0, 0.25, 0.5 … and the automation is in
// the timeline before rendering starts. Live, `at` defaults to ctx.currentTime.

// A handle that does nothing, returned when the pool is full or the id is unknown. Callers never
// branch on it — that is the whole point (D7: the game runs correctly with audio unavailable).
export const NULL_SOURCE = {
  id: null, def: null, alive: false, real: false,
  set() { return this; }, at() { return this; }, gain() { return this; },
  stop() {}, report() { return null; },
};
Object.freeze(NULL_SOURCE);

// Skips a write whose target has not meaningfully moved, so driving a param at 60 Hz does not
// pile up thousands of automation events.
//
// The FIRST write to a param snaps rather than glides. Nodes are constructed with Web Audio's
// defaults — an OscillatorNode is 440 Hz — so a smoothed first write means every source audibly
// slides in from 440 Hz. On the zeppelin, whose smoothing is 0.3 s, that startup glide was still
// audible half a second in and it showed up in the harness as a fake doppler shift.
export function smoother(rel = 2e-3) {
  const last = new Map();
  return (param, value, at, tau = 0.08) => {
    if (!param || !Number.isFinite(value)) return;
    const p = last.get(param);
    if (p !== undefined && Math.abs(p - value) <= rel * Math.max(1, Math.abs(value))) return;
    const first = p === undefined;
    last.set(param, value);
    if (tau <= 0 || first) param.setValueAtTime(value, at);
    else param.setTargetAtTime(value, at, tau);
  };
}

export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

export function attachSustain(eng, opts = {}) {
  const { ctx } = eng;
  const mPerWu = opts.mPerWu ?? 0.15;                       // DECISIONS D26

  const S = {
    defs: {},
    cap: opts.cap ?? 12,
    idleTtl: opts.idleTtl ?? 4,
    mPerWu,
    sound: (opts.soundMs ?? 340) / mPerWu,                  // speed of sound in world units/s
    refDist: opts.refDist ?? 260,                           // wu at which distance gain is 1/2
    maxDist: opts.maxDist ?? 9000,                          // past this a source is not worth a slot
    airDist: opts.airDist ?? 2500,                          // e-fold of the air-absorption lowpass
    dopplerMin: 0.55, dopplerMax: 1.9,
    listener: { x: 0, y: 0, vx: 0, vy: 0, halfWidth: 300 },
    live: [],
    dying: [],
    idle: [],
    stolen: 0, refused: 0, made: 0,
  };
  eng.sources = S;

  S.register = defs => { for (const id in defs) S.defs[id] = defs[id]; };
  S.setListener = (x, y, halfWidth, vx = 0, vy = 0) => {
    S.listener.x = x; S.listener.y = y; S.listener.vx = vx; S.listener.vy = vy;
    if (halfWidth > 0) S.listener.halfWidth = halfWidth;
  };

  const hasPanner = typeof ctx.createStereoPanner === 'function';

  function makeSlot(def, at) {
    const out = ctx.createGain();          // the instrument writes here
    out.gain.value = 0;
    const air = biquad(ctx, 'lowpass', 20000, 0.5);
    const dist = ctx.createGain();         // distance attenuation
    dist.gain.value = 1;
    const pan = hasPanner ? ctx.createStereoPanner() : null;
    const send = ctx.createGain();
    send.gain.value = def.send ?? 0.12;

    chain(pan ? [out, air, dist, pan] : [out, air, dist]);
    const tail = pan || dist;
    tail.connect(eng.dry);
    tail.connect(send); send.connect(eng.verbIn);

    const init = {};
    for (const k in def.params) init[k] = def.params[k].def;
    init._pitch = 1;
    const inst = def.build(eng, out, init, at);
    return { def, out, air, dist, pan, send, inst, nodes: [out, air, dist, pan, send] };
  }

  function acquire(def, at) {
    for (let i = S.idle.length - 1; i >= 0; i--) {
      if (S.idle[i].slot.def !== def) continue;
      const s = S.idle[i].slot;
      S.idle.splice(i, 1);
      s.out.gain.cancelScheduledValues(at);
      s.out.gain.setValueAtTime(0, at);
      if (s.inst.reset) s.inst.reset(at);
      return s;
    }
    return makeSlot(def, at);
  }

  function release(slot, at) {
    S.idle.push({ slot, freeAt: at + S.idleTtl });
  }

  function destroy(slot) {
    try { slot.inst.dispose && slot.inst.dispose(); } catch {}
    for (const n of slot.nodes) { try { n && n.disconnect(); } catch {} }
  }

  // Priority falls off with distance, so the far zeppelin loses its slot to the enemy on your tail.
  function weight(h) {
    const d = Math.hypot(h.pos.x - S.listener.x, h.pos.y - S.listener.y);
    return (h.priority) / (1 + d / S.refDist);
  }

  eng.source = (id, o = {}) => {
    const def = S.defs[id];
    if (!def) { S.refused++; return NULL_SOURCE; }
    const at = o.t ?? eng.now();
    const priority = o.priority ?? def.priority ?? 1;

    if (S.live.length >= S.cap) {
      let victim = null, vw = Infinity;
      for (const h of S.live) { const w = weight(h); if (w < vw) { vw = w; victim = h; } }
      const mine = priority / (1 + Math.hypot((o.x ?? 0) - S.listener.x, (o.y ?? 0) - S.listener.y) / S.refDist);
      if (!victim || vw >= mine) { S.refused++; return NULL_SOURCE; }
      victim.stop(0.06, at);
      S.stolen++;
    }

    const slot = acquire(def, at);
    S.made++;
    const h = makeHandle(id, def, slot, o, at, priority);
    S.live.push(h);
    h.apply(at);
    return h;
  };

  function makeHandle(id, def, slot, o, at, priority) {
    const values = {};
    for (const k in def.params) values[k] = o[k] ?? def.params[k].def;
    const h = {
      id, def, slot, priority, real: true, alive: true,
      values,
      level: o.gain ?? o.level ?? 1,
      pos: { x: o.x ?? 0, y: o.y ?? 0, vx: o.vx ?? 0, vy: o.vy ?? 0 },
      spatial: { gain: 1, pan: 0, air: 20000, doppler: 1, dist: 0 },
      born: at, fade: o.attack ?? 0.09,
      set(v, when) {
        if (!h.alive) return h;
        for (const k in v) if (k in values) values[k] = v[k];
        h.apply(when ?? eng.now());
        return h;
      },
      at(x, y, vx = 0, vy = 0, when) {
        if (!h.alive) return h;
        h.pos.x = x; h.pos.y = y; h.pos.vx = vx; h.pos.vy = vy;
        h.apply(when ?? eng.now());
        return h;
      },
      gain(v, when) {
        if (!h.alive) return h;
        h.level = v;
        h.apply(when ?? eng.now());
        return h;
      },
      apply(when) {
        const t = when ?? eng.now();
        const sp = spatialise(h, t);
        const merged = h._merged || (h._merged = {});
        for (const k in values) merged[k] = values[k];
        merged._pitch = sp.doppler;
        merged._dist = sp.dist;
        slot.inst.set(merged, t);
        // fade in from silence on the first apply so a new source never clicks
        const target = h.level * sp.gain * (values.level ?? 1);
        if (t <= h.born + 1e-6) {
          slot.out.gain.cancelScheduledValues(t);
          slot.out.gain.setValueAtTime(0, t);
          slot.out.gain.linearRampToValueAtTime(Math.max(1e-4, target), t + h.fade);
          h._lastGain = target;
        } else if (h._lastGain === undefined || Math.abs(h._lastGain - target) > 2e-3 * Math.max(1, target)) {
          h._lastGain = target;
          slot.out.gain.setTargetAtTime(target, t, 0.05);
        }
      },
      stop(fade = 0.25, when) {
        if (!h.alive) return;
        h.alive = false;
        const t = when ?? eng.now();
        const g = slot.out.gain;
        g.cancelScheduledValues(t);
        g.setValueAtTime(Math.max(1e-4, h._lastGain ?? h.level), t);
        g.setTargetAtTime(0, t, Math.max(0.01, fade) / 3);
        g.setValueAtTime(0, t + Math.max(0.02, fade));
        const i = S.live.indexOf(h);
        if (i >= 0) S.live.splice(i, 1);
        S.dying.push({ h, slot, freeAt: t + Math.max(0.02, fade) + 0.05 });
      },
      report() {
        return { id, alive: h.alive, gain: +(h._lastGain ?? 0).toFixed(3), dist: Math.round(h.spatial.dist), doppler: +h.spatial.doppler.toFixed(3) };
      },
    };
    return h;
  }

  function spatialise(h, t) {
    const L = S.listener, sp = h.spatial;
    const dx = h.pos.x - L.x, dy = h.pos.y - L.y;
    const d = Math.hypot(dx, dy);
    sp.dist = d;
    sp.gain = 1 / (1 + d / S.refDist);
    if (d > S.maxDist) sp.gain = 0;

    // air absorption: distant engines lose their top end long before they lose their level
    const air = Math.max(300, 20000 * Math.exp(-d / S.airDist));

    // doppler from radial velocity; positive vs = receding
    let f = 1;
    if (d > 1e-3) {
      const ux = dx / d, uy = dy / d;
      const vs = h.pos.vx * ux + h.pos.vy * uy;
      const vl = L.vx * ux + L.vy * uy;
      f = clamp((S.sound + vl) / Math.max(1, S.sound + vs), S.dopplerMin, S.dopplerMax);
    }
    sp.doppler = f;
    sp.air = air;

    const smooth = h._sm || (h._sm = smoother());
    smooth(h.slot.air.frequency, air, t, 0.12);
    if (h.slot.pan) smooth(h.slot.pan.pan, clamp(dx / Math.max(1, L.halfWidth), -1, 1) * 0.85, t, 0.06);
    return sp;
  }

  // Pushes every live source's spatial state at one time. Call it once a frame after the sim has
  // moved everything; the harness calls it at each step of an offline sweep.
  S.update = (at, listener) => {
    const t = at ?? eng.now();
    if (listener) S.setListener(listener.x, listener.y, listener.halfWidth, listener.vx, listener.vy);
    for (const h of S.live) h.apply(t);
  };

  S.reap = (at) => {
    const t = at ?? eng.now();
    for (let i = S.dying.length - 1; i >= 0; i--) {
      if (S.dying[i].freeAt < t) { release(S.dying[i].slot, t); S.dying.splice(i, 1); }
    }
    for (let i = S.idle.length - 1; i >= 0; i--) {
      if (S.idle[i].freeAt < t) { destroy(S.idle[i].slot); S.idle.splice(i, 1); }
    }
  };

  S.stopAll = (fade = 0.2, at) => {
    const t = at ?? eng.now();
    for (const h of S.live.slice()) h.stop(fade, t);
  };

  S.report = () => ({
    live: S.live.length, dying: S.dying.length, idle: S.idle.length,
    cap: S.cap, made: S.made, stolen: S.stolen, refused: S.refused,
    handles: S.live.map(h => h.report()),
  });

  return S;
}
