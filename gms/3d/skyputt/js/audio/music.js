// SKYPUTT audio — generative ambient music. One player per theme; `sky` is the launch theme.
// Nothing loops verbatim: chords walk a Markov graph, the key drifts between three centres,
// arpeggio phrases (up / down / wander / sparse / bells / rest) are picked by a slowly
// wandering density, and every note's timing and velocity is humanised.
//
// Voices: warm detuned-saw pads through one shared, slowly breathing lowpass; Karplus-Strong
// harp plucks (pre-rendered per few semitones, repitched by playbackRate); soft FM bells; a
// quiet airy noise bed. Arps feed a ping-pong delay; everything feeds the shared reverb.
import { clamp, rnd, pick, mtof, shared, noiseBuffer, holdParam } from './core.js';

const SKY = {
  id: 'sky', bpm: 66,
  keys: [0, 0, 0, -5, -2],                         // D major home, A major and C major excursions
  start: 'I',
  chords: {
    I:     { pad: [50, 57, 64, 66], root: 38, arp: [62, 64, 66, 69, 73, 74, 76, 78, 81], next: ['IV', 'vi', 'ii', 'Vsus', 'IVlyd', 'iii'] },
    IV:    { pad: [55, 59, 62, 66], root: 43, arp: [67, 69, 71, 74, 78, 79, 83], next: ['I', 'vi', 'Vsus', 'iii', 'ii'] },
    vi:    { pad: [57, 61, 62, 66], root: 47, arp: [66, 69, 71, 73, 74, 78, 81], next: ['IV', 'ii', 'I', 'IVlyd'] },
    ii:    { pad: [55, 59, 62, 66], root: 40, arp: [64, 66, 67, 71, 74, 76, 79], next: ['Vsus', 'I', 'IV', 'vi'] },
    Vsus:  { pad: [57, 59, 62, 64], root: 45, arp: [64, 69, 71, 74, 76, 81, 83], next: ['I', 'vi', 'IV'] },
    iii:   { pad: [57, 61, 64, 66], root: 42, arp: [66, 69, 73, 76, 78, 81], next: ['vi', 'IV', 'ii'] },
    IVlyd: { pad: [55, 59, 61, 66], root: 43, arp: [67, 71, 73, 74, 78, 79, 85], next: ['I', 'vi', 'iii'] },
  },
  level: { pad: 0.03, root: 0.036, harp: 0.1, bell: 0.032, air: 0.014 },
};
export const THEMES = { sky: SKY };

// Karplus-Strong pluck, rendered once per base note (multiples of 3 semitones) and repitched.
export function harpBuffer(ctx, base) {
  const s = shared(ctx), key = 'harp_' + base;
  if (s[key]) return s[key];
  const sr = ctx.sampleRate, f = mtof(base), dur = clamp(3.0 - (base - 55) * 0.05, 1.3, 3.0);
  const n = Math.floor(sr * dur), b = ctx.createBuffer(1, n, sr), d = b.getChannelData(0);
  const P = sr / f - 0.5, start = Math.ceil(P) + 2;
  let lp = 0;
  for (let i = 0; i < start; i++) { lp += 0.45 * ((Math.random() * 2 - 1) - lp); d[i] = lp; }
  const loss = Math.pow(10, -3 / (dur * 0.7 * f));
  const at = x => { const i = Math.floor(x), fr = x - i; return d[i] * (1 - fr) + d[i + 1] * fr; };
  for (let i = start; i < n; i++) d[i] = loss * 0.5 * (at(i - P) + at(i - P - 1));
  let dc = 0, pk = 0;
  for (let i = 0; i < n; i++) dc += d[i];
  dc /= n;
  const fin = Math.floor(sr * 0.002), fout = Math.floor(sr * 0.08);
  for (let i = 0; i < n; i++) {
    d[i] -= dc;
    if (i < fin) d[i] *= i / fin;
    if (i > n - fout) d[i] *= (n - i) / fout;
    pk = Math.max(pk, Math.abs(d[i]));
  }
  for (let i = 0; i < n; i++) d[i] *= 0.8 / (pk || 1);
  return (s[key] = b);
}

class Player {
  constructor(E, theme) {
    this.E = E; this.th = theme; this.ctx = E.ctx;
    const ctx = this.ctx, G = (v = 1) => { const g = ctx.createGain(); g.gain.value = v; return g; };
    this.srcs = new Set();
    this.out = G(0);                              // fade in/out of this whole theme
    this.outWet = G(0);
    this.out.connect(E.music.dry); this.outWet.connect(E.music.wet);
    // pad bus: shared lowpass breathing on a slow LFO
    this.padF = ctx.createBiquadFilter(); this.padF.type = 'lowpass'; this.padF.frequency.value = 900; this.padF.Q.value = 0.5;
    const plfo = ctx.createOscillator(), plg = G(320); plfo.frequency.value = 0.045;
    plfo.connect(plg); plg.connect(this.padF.frequency);
    const padOut = G(1), padWet = G(0.55);
    this.padF.connect(padOut); this.padF.connect(padWet); padOut.connect(this.out); padWet.connect(this.outWet);
    // arp bus: gentle lowpass, reverb send, ping-pong delay
    this.arp = ctx.createBiquadFilter(); this.arp.type = 'lowpass'; this.arp.frequency.value = 4200; this.arp.Q.value = 0.5;
    const arpWet = G(0.4), dSend = G(0.28);
    this.arp.connect(this.out); this.arp.connect(arpWet); arpWet.connect(this.outWet); this.arp.connect(dSend);
    const beat = 60 / theme.bpm;
    const dl = ctx.createDelay(2), dr = ctx.createDelay(2), fl = G(0.38), fr = G(0.38), dlp = ctx.createBiquadFilter();
    dl.delayTime.value = beat * 0.75; dr.delayTime.value = beat * 1.5;
    dlp.type = 'lowpass'; dlp.frequency.value = 2600;
    dSend.connect(dlp); dlp.connect(dl); dl.connect(fl); fl.connect(dr); dr.connect(fr); fr.connect(dl);
    if (ctx.createStereoPanner) {
      const pl = ctx.createStereoPanner(), pr = ctx.createStereoPanner(); pl.pan.value = -0.6; pr.pan.value = 0.6;
      dl.connect(pl); dr.connect(pr); pl.connect(this.out); pr.connect(this.out); pl.connect(this.outWet); pr.connect(this.outWet);
    } else { dl.connect(this.out); dr.connect(this.out); }
    // air bed: pink noise, wandering bandpass, slow pan drift
    const air = ctx.createBufferSource(); air.buffer = noiseBuffer(ctx, 'pink'); air.loop = true;
    const af = ctx.createBiquadFilter(); af.type = 'bandpass'; af.frequency.value = 1500; af.Q.value = 0.5;
    const alfo = ctx.createOscillator(), alg = G(700); alfo.frequency.value = 0.031;
    alfo.connect(alg); alg.connect(af.frequency);
    const ag = G(theme.level.air);
    air.connect(af); af.connect(ag); ag.connect(this.out); ag.connect(this.outWet);
    this.bgSrcs = [plfo, alfo, air];
    for (const s of this.bgSrcs) s.start(ctx.currentTime);
    this.nodes = [this.out, this.outWet, this.padF, plg, padOut, padWet, this.arp, arpWet, dSend, dl, dr, fl, fr, dlp, af, alg, ag];
    // scheduler state
    this.beat = beat; this.step = beat / 2;
    this.chord = theme.start; this.prev = ''; this.key = 0; this.chordCount = 0;
    this.chordList = [];                         // [{t, name, key}]
    this.nextChordT = 0; this.nextStepT = 0; this.stepN = 0;
    this.density = 0.45; this.phrase = null; this.idx = 3;
  }

  begin(t, fade = 2.5) {
    this.nextChordT = t + 0.05; this.nextStepT = t + this.beat * 2;
    holdParam(this.out.gain, t); this.out.gain.linearRampToValueAtTime(1, t + fade);
    holdParam(this.outWet.gain, t); this.outWet.gain.linearRampToValueAtTime(1, t + fade);
  }

  end(t, fade = 1.5) {
    for (const g of [this.out.gain, this.outWet.gain]) { holdParam(g, t); g.setTargetAtTime(0, t, fade / 4); }
    const stopAt = t + fade + 0.2;
    for (const s of [...this.srcs, ...this.bgSrcs]) { try { s.stop(stopAt); } catch { /* */ } }
    this.dead = true;
    return stopAt;
  }

  dispose() { for (const n of this.nodes) { try { n.disconnect(); } catch { /* */ } } }

  keep(src) { this.srcs.add(src); src.onended = () => { this.srcs.delete(src); try { src.disconnect(); } catch { /* */ } }; }

  chordAt(t) {
    let c = this.chordList[0];
    for (const x of this.chordList) if (x.t <= t) c = x;
    return c;
  }

  // schedule everything up to `horizon` seconds (context time)
  tick(horizon) {
    if (this.dead) return;
    while (this.nextChordT < horizon) this.scheduleChord();
    while (this.nextStepT < horizon) this.scheduleStep();
    const old = this.nextStepT - 30;
    while (this.chordList.length > 2 && this.chordList[1].t < old) this.chordList.shift();
  }

  scheduleChord() {
    const th = this.th, t = this.nextChordT, bar = this.beat * 4;
    if (this.chordCount > 0) {
      // key excursion: only from the home chord, after a while
      if (this.chord === 'I' && this.chordCount % 6 === 0 && Math.random() < 0.45) {
        const opts = th.keys.filter(k => k !== this.key);
        this.key = pick(opts);
      }
      const opts = th.chords[this.chord].next.filter(n => n !== this.prev);
      // earlier entries are more likely
      const w = opts.map((_, i) => 1 / (1 + i * 0.6)), sum = w.reduce((a, b) => a + b, 0);
      let r = Math.random() * sum, k = 0;
      while (r > w[k] && k < opts.length - 1) r -= w[k++];
      this.prev = this.chord; this.chord = opts[k];
    }
    this.chordCount++;
    const dur = pick([2, 3, 3, 4]) * bar;
    this.chordList.push({ t, name: this.chord, key: this.key });
    this.pad(t, dur, th.chords[this.chord], this.key);
    this.nextChordT = t + dur;
  }

  pad(t, dur, ch, key) {
    const ctx = this.ctx, L = this.th.level, att = 3.2, rel = 4.5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(1, t + att);
    g.gain.setValueAtTime(1, t + dur);
    g.gain.linearRampToValueAtTime(0, t + dur + rel);
    g.connect(this.padF);
    const end = t + dur + rel + 0.1;
    // occasionally lift one voice an octave for colour
    const lift = Math.random() < 0.3 ? (Math.random() * ch.pad.length) | 0 : -1;
    ch.pad.forEach((m, i) => {
      const f = mtof(m + key + (i === lift ? 12 : 0));
      for (const dt of [-8, 8]) {
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = dt + rnd(-3, 3);
        const og = ctx.createGain(); og.gain.value = L.pad;
        o.connect(og); og.connect(g); o.start(t); o.stop(end); this.keep(o);
      }
    });
    const r = ctx.createOscillator(); r.frequency.value = mtof(ch.root + key);
    const rg = ctx.createGain(); rg.gain.value = L.root;
    r.connect(rg); rg.connect(g); r.start(t); r.stop(end); this.keep(r);
    // let the pad gain node go when its sources end
    setTimeoutSafe(ctx, () => { try { g.disconnect(); } catch { /* */ } }, end);
  }

  newPhrase() {
    this.density = clamp(this.density + rnd(-0.18, 0.18), 0.15, 0.85);
    const d = this.density;
    const types = [['rest', 1.1 * (1 - d)], ['sparse', 1], ['up', 1.2 * d], ['down', 1.0 * d], ['wander', 1.1 * d], ['bells', 0.45]];
    const sum = types.reduce((a, [, w]) => a + w, 0);
    let r = Math.random() * sum, k = 0;
    while (r > types[k][1] && k < types.length - 1) r -= types[k++][1];
    this.phrase = { type: types[k][0], left: pick([8, 8, 16]), first: true };
  }

  scheduleStep() {
    const t0 = this.nextStepT, n = this.stepN++;
    this.nextStepT += this.step;
    if (!this.phrase || this.phrase.left <= 0) this.newPhrase();
    const ph = this.phrase; ph.left--;
    const c = this.chordAt(t0);
    if (!c) return;
    const pool = this.th.chords[c.name].arp, L = this.th.level;
    const t = t0 + (n % 2 ? this.step * 0.08 : 0) + rnd(-0.008, 0.012);
    let play = false, inst = 'harp', oct = 0;
    switch (ph.type) {
      case 'rest': break;
      case 'sparse': play = Math.random() < 0.22; this.idx = (Math.random() * pool.length) | 0; break;
      case 'up': play = Math.random() < 0.85; if (ph.first) this.idx = (Math.random() * 3) | 0; else this.idx += Math.random() < 0.8 ? 1 : 2; break;
      case 'down': play = Math.random() < 0.85; if (ph.first) this.idx = pool.length - 1 - ((Math.random() * 2) | 0); else this.idx -= Math.random() < 0.8 ? 1 : 2; break;
      case 'wander': play = Math.random() < 0.6; this.idx += pick([-2, -1, -1, 1, 1, 2]); break;
      case 'bells': play = Math.random() < 0.28; inst = 'bell'; oct = 12; this.idx = (Math.random() * pool.length) | 0; break;
    }
    ph.first = false;
    // wrap the walk inside the pool, shifting octave instead of clamping
    if (this.idx >= pool.length) this.idx %= pool.length;
    if (this.idx < 0) this.idx = pool.length + (this.idx % pool.length);
    this.idx = clamp(this.idx, 0, pool.length - 1) | 0;
    if (!play) return;
    const m = pool[this.idx] + c.key + oct, vel = rnd(0.55, 1) * (n % 8 === 0 ? 1.1 : 1);
    if (inst === 'harp') this.harp(t, m, L.harp * vel);
    else this.bell(t, m, L.bell * vel);
  }

  harp(t, m, gain) {
    const ctx = this.ctx, base = Math.round(m / 3) * 3, src = ctx.createBufferSource(), g = ctx.createGain();
    src.buffer = harpBuffer(ctx, base); src.playbackRate.value = Math.pow(2, (m - base) / 12);
    g.gain.value = gain;
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner(); p.pan.value = clamp((m - 74) / 18, -0.7, 0.7);
      src.connect(g); g.connect(p); p.connect(this.arp);
    } else { src.connect(g); g.connect(this.arp); }
    src.start(t); this.keep(src);
  }

  bell(t, m, gain) {
    const ctx = this.ctx, f = mtof(m), c = ctx.createOscillator(), md = ctx.createOscillator(), mg = ctx.createGain(), g = ctx.createGain();
    const dur = 2.6;
    c.frequency.value = f; md.frequency.value = f * 3;
    mg.gain.setValueAtTime(f * 0.9, t); mg.gain.exponentialRampToValueAtTime(f * 0.05, t + 1.5);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    md.connect(mg); mg.connect(c.frequency); c.connect(g); g.connect(this.arp);
    c.start(t); md.start(t); c.stop(t + dur + 0.05); md.stop(t + dur + 0.05);
    this.keep(c); this.keep(md);
  }
}

// setTimeout keyed to context time; a no-op for offline contexts (which are thrown away).
function setTimeoutSafe(ctx, fn, atCtxTime) {
  if (typeof ctx.startRendering === 'function') return;
  setTimeout(fn, Math.max(0, (atCtxTime - ctx.currentTime) * 1000 + 200));
}

// Live music controller. tick() is driven by a 250 ms interval with 1.5 s lookahead.
export function createMusic(E, { live = true } = {}) {
  let player = null, timer = 0;
  const LOOK = 1.5;
  const tick = () => { if (player) player.tick(E.ctx.currentTime + LOOK); };
  const api = {
    get playing() { return !!player; },
    get theme() { return player ? player.th.id : null; },
    start(id = 'sky', at = E.ctx.currentTime) {
      const th = THEMES[id] || SKY;
      if (player && player.th === th) return;
      if (player) api.stop(at, 1.5);
      player = new Player(E, th);
      player.begin(at);
      player.tick(at + LOOK);
      if (live && !timer) timer = setInterval(tick, 250);
    },
    stop(at = E.ctx.currentTime, fade = 1.5) {
      if (!player) return;
      const p = player; player = null;
      const stopAt = p.end(at, fade);
      setTimeoutSafe(E.ctx, () => p.dispose(), stopAt);
      if (timer) { clearInterval(timer); timer = 0; }
    },
    tick(horizon) { if (player) player.tick(horizon); },
    _player: () => player,
  };
  return api;
}
