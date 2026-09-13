// NINE STRINGS - generative score. No clips, no crossfades between recordings:
// a bed of long oscillators plus notes scheduled ahead of the clock, so the
// music can answer the screen instead of looping at it.
//
// Three layers per act (DESIGN section 7): a drone/pad that is always there, a
// heartbeat pulse that enters once anything is chasing you, and a choir/lead
// that only arrives when the screen is actually dangerous. `setIntensity`
// opens a filter and lets the layers in. Modal, minor, spare - a grim etching
// (DESIGN section 8), and quiet enough to sit under twenty minutes of play.
//
// Scheduling is lookahead against `ctx.currentTime`: a 25ms timer only decides
// WHAT to play, and every note is booked at a sample-accurate time up to 150ms
// in the future. A timer that plays notes directly drifts, and drift in a
// heartbeat is audible within about ten seconds.

const LOOKAHEAD = 0.18;      // seconds of notes booked ahead of the clock
const TIMER_MS = 25;
const E = 0.0001;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

const SCALES = {
  aeolian:  [0, 2, 3, 5, 7, 8, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  dorian:   [0, 2, 3, 5, 7, 9, 10],
  locrian:  [0, 1, 3, 5, 6, 8, 10],
};

// root is a MIDI note. `hush` scales the whole bed: the menus and the Sanctum
// are meant to be nearly inaudible.
const TRACKS = {
  title:   { root: 45, scale: 'aeolian',  bpm: 50, hush: 0.85, prog: [0, 5, 3, 4], lead: 0.3 },
  act1:    { root: 45, scale: 'aeolian',  bpm: 62, hush: 1.00, prog: [0, 5, 3, 6], lead: 1 },
  act2:    { root: 43, scale: 'phrygian', bpm: 56, hush: 1.00, prog: [0, 1, 4, 0], lead: 1 },
  act3:    { root: 46, scale: 'dorian',   bpm: 72, hush: 1.00, prog: [0, 6, 3, 5], lead: 1 },
  act4:    { root: 40, scale: 'locrian',  bpm: 66, hush: 1.05, prog: [0, 4, 1, 6], lead: 1 },
  sanctum: { root: 48, scale: 'dorian',   bpm: 44, hush: 0.7,  prog: [0, 3, 5, 3], lead: 0.5 },
  boss:    { root: 41, scale: 'phrygian', bpm: 84, hush: 1.15, prog: [0, 1, 0, 6], lead: 1.2 },
  victory: { root: 50, scale: 'dorian',   bpm: 58, hush: 0.9,  prog: [0, 4, 5, 0], lead: 0.8 },
};
const ALIAS = { 1: 'act1', 2: 'act2', 3: 'act3', 4: 'act4', menu: 'title', results: 'victory', none: null, off: null, stop: null };

export function makeMusic(engine) {
  const ctx = engine.ctx;
  const out = engine.out;
  const send = engine.send;

  const bus = ctx.createGain(); bus.gain.value = 1; bus.connect(out);
  const rev = ctx.createGain(); rev.gain.value = 0.28; rev.connect(send);
  bus.connect(rev);

  let bed = null;
  const retiring = [];        // beds fading out
  const tv = [];              // transient note gains awaiting disconnect
  let timer = 0;
  let target = 0.2, level = 0.2;
  let seed = 0x9e3779b9;
  const rnd = () => (((seed = (seed * 1664525 + 1013904223) >>> 0)) / 4294967296);

  const api = {
    play, stop, setIntensity, stinger,
    get id() { return bed ? bed.id : null; },
    get intensity() { return level; },
  };
  return api;

  // ---- public ---------------------------------------------------------

  function play(trackId, o) {
    let id = trackId;
    if (Object.prototype.hasOwnProperty.call(ALIAS, id)) id = ALIAS[id];
    if (!id) { stop(o && o.fade); return; }
    if (!Object.prototype.hasOwnProperty.call(TRACKS, id)) id = 'act1';
    if (o && o.intensity != null) setIntensity(o.intensity);
    if (bed && bed.id === id) { ensureTimer(); return; }

    const t = ctx.currentTime;
    if (bed) retire(bed, t, (o && o.fade) || 1.4);
    bed = build(id, t);
    ensureTimer();
    if (!o || o.stinger !== false) {
      if (id === 'boss') stinger('boss');
      else if (id === 'victory') stinger('victory');
    }
  }

  function stop(fade) {
    const t = ctx.currentTime;
    if (bed) { retire(bed, t, fade == null ? 1.6 : fade / 1000); bed = null; }
  }

  function setIntensity(v) {
    v = +v;
    target = clamp(isFinite(v) ? v : 0, 0, 1);
  }

  // A stinger is a musical event, not a sound effect: it lands on the bus so it
  // shares the reverb and gets ducked with everything else.
  function stinger(kind) {
    const t = ctx.currentTime + 0.02;
    const d = bed ? TRACKS[bed.id] : TRACKS.act1;
    const root = d.root;
    if (kind === 'chorus') {
      const g = mv(t, 3.0, bus);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 400; lp.Q.value = 2;
      lp.connect(g); reg(lp, t + 3.0);
      ramp(lp.frequency, t, 400, 4200, 2.4);
      const semis = [0, 6, 12, 18, 25];
      for (let i = 0; i < semis.length; i++) {
        const f = mtof(root + semis[i]);
        const osc = ctx.createOscillator(); osc.type = 'sawtooth'; osc.detune.value = i * 6 - 12;
        osc.frequency.value = f; ramp(osc.frequency, t, f, f * 1.06, 2.4);
        osc.connect(lp); osc.start(t); osc.stop(t + 2.9); reg(osc, t + 3.0);
      }
      env(g.gain, t, 0.42, 2.2, 0.1, 0.5);
    } else if (kind === 'victory') {
      const g = mv(t, 3.2, bus);
      const semis = [0, 7, 12, 16, 19];
      for (let i = 0; i < semis.length; i++) {
        const osc = ctx.createOscillator(); osc.type = 'triangle';
        osc.frequency.value = mtof(root + 12 + semis[i]); osc.detune.value = i * 3 - 6;
        osc.connect(g); osc.start(t + i * 0.05); osc.stop(t + 3.1); reg(osc, t + 3.2);
      }
      env(g.gain, t, 0.34, 0.08, 1.1, 1.6);
    } else {
      // boss: a low cluster shoving upward, with one bell over the top
      const g = mv(t, 3.4, bus);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 300; lp.Q.value = 3;
      lp.connect(g); reg(lp, t + 3.4);
      ramp(lp.frequency, t, 300, 2200, 1.1);
      const semis = [-12, -11, -5, 0, 1];
      for (let i = 0; i < semis.length; i++) {
        const osc = ctx.createOscillator(); osc.type = 'sawtooth'; osc.detune.value = i * 7 - 14;
        osc.frequency.value = mtof(root + semis[i]);
        osc.connect(lp); osc.start(t); osc.stop(t + 3.3); reg(osc, t + 3.4);
      }
      env(g.gain, t, 0.5, 0.5, 0.9, 1.6);
      const bg = mv(t + 0.45, 2.6, bus);
      const parts = [1, 2.74, 5.2];
      for (let i = 0; i < parts.length; i++) {
        const o2 = ctx.createOscillator(); o2.type = 'sine';
        o2.frequency.value = mtof(root + 31) * parts[i];
        const pg = ctx.createGain(); pg.gain.value = 0.5 / (1 + i * 1.4);
        o2.connect(pg); pg.connect(bg); o2.start(t + 0.45); o2.stop(t + 3.0);
        reg(o2, t + 3.05); reg(pg, t + 3.05);
      }
      env(bg.gain, t + 0.45, 0.3, 0.004, 0.2, 2.2);
    }
  }

  // ---- bed ------------------------------------------------------------

  function build(id, t) {
    const def = TRACKS[id];
    const scale = SCALES[def.scale];

    const g = ctx.createGain(); g.gain.value = E; g.connect(bus);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 320; lp.Q.value = 1.1;
    lp.connect(g);

    const droneG = ctx.createGain(); droneG.gain.value = 0.22; droneG.connect(lp);
    const padG   = ctx.createGain(); padG.gain.value = 0.10;   padG.connect(lp);
    const choirG = ctx.createGain(); choirG.gain.value = 0;    choirG.connect(lp);
    const percG  = ctx.createGain(); percG.gain.value = 0;     percG.connect(g);
    const leadG  = ctx.createGain(); leadG.gain.value = 0;     leadG.connect(g);

    const oscs = [];
    const mk = (type, midi, det, amt) => {
      const o = ctx.createOscillator(); o.type = type;
      o.frequency.value = mtof(midi); o.detune.value = det || 0;
      const og = ctx.createGain(); og.gain.value = amt;
      o.connect(og); og.connect(droneG); o.start(t);
      oscs.push(o, og);
    };
    mk('sawtooth', def.root - 12, -7, 0.30);
    mk('sawtooth', def.root - 12, 8, 0.30);
    mk('sawtooth', def.root - 5, 4, 0.16);     // the fifth, thin
    mk('sine', def.root - 24, 0, 0.45);
    mk('triangle', def.root, -3, 0.09);

    // A very slow breath on the cutoff. Without it a static drone stops being
    // heard after a minute, which is worse than no drone at all.
    const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.06;
    const lfoG = ctx.createGain(); lfoG.gain.value = 90;
    lfo.connect(lfoG); lfoG.connect(lp.frequency); lfo.start(t);
    oscs.push(lfo, lfoG);

    const b = {
      id, def, scale, g, lp, droneG, padG, choirG, percG, leadG, oscs,
      step: 0, nextT: t + 0.1, chord: 0, leadIdx: 0,
    };
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(E, t);
    g.gain.linearRampToValueAtTime(def.hush, t + 2.2);
    return b;
  }

  function retire(b, t, fade) {
    fade = clamp(fade || 1.4, 0.15, 6);
    try {
      b.g.gain.cancelScheduledValues(t);
      b.g.gain.setValueAtTime(Math.max(E, b.g.gain.value), t);
      b.g.gain.exponentialRampToValueAtTime(E, t + fade);
    } catch (e) {}
    b.dead = t + fade + 0.05;
    b.nextT = 1e12;             // stop scheduling into it
    retiring.push(b);
  }

  function kill(b, t) {
    for (let i = 0; i < b.oscs.length; i++) {
      const n = b.oscs[i];
      if (n.stop) { try { n.stop(t); } catch (e) {} }
      try { n.disconnect(); } catch (e) {}
    }
    b.oscs.length = 0;
    try { b.g.disconnect(); b.lp.disconnect(); b.droneG.disconnect(); b.padG.disconnect(); b.choirG.disconnect(); b.percG.disconnect(); b.leadG.disconnect(); } catch (e) {}
  }

  // ---- scheduler ------------------------------------------------------

  function ensureTimer() {
    if (timer || typeof setInterval !== 'function') return;
    timer = setInterval(tick, TIMER_MS);
  }

  function tick() {
    let t;
    try { t = ctx.currentTime; } catch (e) { return; }
    if (engine.sweep) engine.sweep();

    for (let i = tv.length - 1; i >= 0; i--) {
      if (tv[i].end <= t) { try { tv[i].node.disconnect(); } catch (e) {} tv.splice(i, 1); }
    }
    for (let i = retiring.length - 1; i >= 0; i--) {
      if (retiring[i].dead <= t) { kill(retiring[i], t); retiring.splice(i, 1); }
    }
    if (!bed) {
      if (!retiring.length && !tv.length) { clearInterval(timer); timer = 0; }
      return;
    }

    // Intensity is smoothed here, not at the call site: threat on screen is
    // spiky and a filter that jumps with it sounds like a mistake.
    level += (target - level) * 0.06;
    const i = level, d = bed.def;
    set(bed.lp.frequency, t, 300 + 3300 * Math.pow(i, 1.35));
    set(bed.droneG.gain, t, 0.20 + 0.10 * i);
    set(bed.padG.gain, t, 0.08 + 0.13 * i);
    set(bed.choirG.gain, t, clamp((i - 0.52) / 0.3, 0, 1) * 0.16);
    set(bed.percG.gain, t, clamp((i - 0.10) / 0.25, 0, 1) * 0.55);
    set(bed.leadG.gain, t, clamp((i - 0.58) / 0.25, 0, 1) * 0.20 * d.lead);

    const stepDur = 30 / (d.bpm * (0.92 + 0.18 * i));
    let guard = 0;
    while (bed.nextT < t + LOOKAHEAD && guard++ < 32) {
      schedule(bed, bed.step, bed.nextT, i);
      bed.step++;
      bed.nextT += stepDur;
    }
    if (bed.nextT < t) bed.nextT = t + 0.05;      // context was suspended
  }

  function schedule(b, s, t, i) {
    const pos = s & 7, bar = s >> 3;
    const d = b.def;

    if (pos === 0) {
      heart(b, t, 1);
      if (bar % 2 === 0) chord(b, t, bar, i);
    } else if (pos === 4 && i > 0.42) {
      heart(b, t, 0.72);
    }
    if (i > 0.28 && (pos === 3 || pos === 6 || (pos === 7 && i > 0.7)) && rnd() < 0.2 + i * 0.5) tick_(b, t, i);
    if (i > 0.58 && pos !== 0 && rnd() < (i - 0.55) * 1.1) lead(b, t, i);
    if (i > 0.86 && pos === 0 && bar % 4 === 2) shimmer(b, t);
    void d;
  }

  // ---- layers ---------------------------------------------------------

  // Two hits, close together, under everything. A heartbeat and not a kick
  // drum: this is a horror game, the pulse is a body.
  function heart(b, t, amt) {
    thump(b, t, 92, amt);
    thump(b, t + 0.17, 74, amt * 0.55);
  }
  function thump(b, t, f, amt) {
    const g = mv(t, 0.45, b.percG);
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
    ramp(o.frequency, t, f, f * 0.42, 0.22);
    o.connect(g); o.start(t); o.stop(t + 0.42); reg(o, t + 0.45);
    env(g.gain, t, 0.55 * amt, 0.006, 0.02, 0.3);
  }

  function tick_(b, t, i) {
    if (!engine.noise) return;
    const g = mv(t, 0.2, b.percG);
    const n = ctx.createBufferSource(); n.buffer = engine.noise; n.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass';
    f.frequency.value = 2400 + rnd() * 2600; f.Q.value = 6 + rnd() * 6;
    n.connect(f); f.connect(g);
    n.start(t, rnd() * 1.5); n.stop(t + 0.14);
    reg(n, t + 0.2); reg(f, t + 0.2);
    env(g.gain, t, 0.10 + 0.10 * i, 0.001, 0.004, 0.09);
  }

  // The pad is the harmony; the choir layer is the same chord an octave up
  // through a formant peak, and it only exists when the screen is bad.
  function chord(b, t, bar, i) {
    const d = b.def, prog = d.prog;
    const root = prog[(bar >> 1) % prog.length];
    const dur = 30 / d.bpm * 8 * 2;        // two bars
    for (let k = 0; k < 3; k++) {
      const m = d.root + degree(b.scale, root + k * 2);
      voicePad(b, b.padG, t, m, dur, 0.30, 660, 1.1);
      if (i > 0.5) voicePad(b, b.choirG, t + 0.05, m + 12, dur * 0.8, 0.22, 1250, 2.4);
    }
  }

  function voicePad(b, dest, t, midi, dur, amt, formant, q) {
    const g = mv(t, dur + 1.8, dest);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass';
    bp.frequency.value = formant; bp.Q.value = q;
    bp.connect(g); reg(bp, t + dur + 1.8);
    const f = mtof(midi);
    for (let k = 0; k < 2; k++) {
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.value = f; o.detune.value = k ? 7 : -6;
      o.connect(bp); o.start(t); o.stop(t + dur + 1.7); reg(o, t + dur + 1.8);
    }
    env(g.gain, t, amt, 0.9, dur - 0.9, 1.6);
  }

  function lead(b, t, i) {
    // A random walk inside the mode, weighted to stay put. A melody that leaps
    // sounds composed; this has to sound like something overheard.
    const r = rnd();
    b.leadIdx += r < 0.35 ? 0 : r < 0.6 ? 1 : r < 0.8 ? -1 : r < 0.92 ? 2 : -3;
    b.leadIdx = clamp(b.leadIdx, -3, 9);
    const m = b.def.root + 12 + degree(b.scale, b.leadIdx);
    const dur = 0.5 + rnd() * 0.9;
    const g = mv(t, dur + 0.9, b.leadG);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800 + 1800 * i;
    lp.connect(g); reg(lp, t + dur + 0.9);
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = mtof(m);
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = mtof(m + 12);
    const og = ctx.createGain(); og.gain.value = 0.25;
    o.connect(lp); o2.connect(og); og.connect(lp);
    o.start(t); o.stop(t + dur + 0.8); o2.start(t); o2.stop(t + dur + 0.8);
    reg(o, t + dur + 0.9); reg(o2, t + dur + 0.9); reg(og, t + dur + 0.9);
    env(g.gain, t, 0.5, 0.05, dur * 0.4, dur * 0.6 + 0.4);
  }

  function shimmer(b, t) {
    const m = b.def.root + 24 + degree(b.scale, 4);
    const g = mv(t, 4.2, b.leadG);
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = mtof(m);
    o.detune.value = -5;
    o.connect(g); o.start(t); o.stop(t + 4.1); reg(o, t + 4.2);
    env(g.gain, t, 0.3, 1.4, 0.4, 2.3);
  }

  // ---- helpers --------------------------------------------------------

  function degree(scale, i) {
    const oct = Math.floor(i / 7);
    return scale[((i % 7) + 7) % 7] + 12 * oct;
  }
  function mv(t, dur, dest) {
    const g = ctx.createGain(); g.gain.value = E; g.connect(dest);
    tv.push({ node: g, end: t + dur + 0.1 });
    return g;
  }
  function reg(node, end) { tv.push({ node, end }); }
  function env(p, t, peak, a, hold, r) {
    const pk = Math.max(E * 2, peak);
    p.cancelScheduledValues(t); p.setValueAtTime(E, t);
    p.linearRampToValueAtTime(pk, t + Math.max(0.002, a));
    p.setValueAtTime(pk, t + a + Math.max(0, hold));
    p.exponentialRampToValueAtTime(E, t + a + Math.max(0, hold) + Math.max(0.02, r));
  }
  function ramp(p, t, f0, f1, d) {
    p.cancelScheduledValues(t); p.setValueAtTime(Math.max(E, f0), t);
    p.exponentialRampToValueAtTime(Math.max(E, f1), t + d);
  }
  function set(p, t, v) { try { p.setTargetAtTime(v, t, 0.12); } catch (e) {} }
}
