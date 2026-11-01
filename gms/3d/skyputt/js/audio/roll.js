// SKYPUTT audio — continuous rolling-ball noise.
// One looping pink-noise source through a fixed chain (highpass -> lowpass -> 2 peaking
// resonances -> grit AM -> gain). Filter TYPES never change (that would click); each surface is
// just a set of frequencies/gains that the chain glides to. Built lazily, torn down after ~2 s of
// silence so an idle game costs nothing.
import { clamp, noiseBuffer, holdParam, voice, modal, noise, rnd } from './core.js';

// lp/lpS: lowpass base + extra at full speed. pk: [freq, gainDb, Q]. grit: AM depth (0..1).
// tick: seam/plank ticks every `tick` metres (0 = none).
const P = {
  grass: { hp: 70, lp: 450, lpS: 2400, pk1: [260, 4, 1], pk2: [3200, -6, 0.7], gain: 0.358, grit: 0.18, verb: 0.02, tick: 0 },
  sand:  { hp: 650, lp: 2400, lpS: 4500, pk1: [1800, 6, 0.8], pk2: [380, -8, 0.7], gain: 0.325, grit: 0.85, verb: 0.02, tick: 0 },
  ice:   { hp: 2200, lp: 6000, lpS: 6000, pk1: [5200, 5, 2], pk2: [9000, 3, 1], gain: 0.143, grit: 0.04, verb: 0.1, tick: 0 },
  wood:  { hp: 90, lp: 900, lpS: 2200, pk1: [210, 9, 3], pk2: [640, 5, 2], gain: 0.358, grit: 0.25, verb: 0.07, tick: 0.12 },
  metal: { hp: 300, lp: 3000, lpS: 5000, pk1: [1300, 10, 8], pk2: [2750, 8, 10], gain: 0.169, grit: 0.15, verb: 0.15, tick: 0.5 },
  glass: { hp: 400, lp: 2600, lpS: 5000, pk1: [820, 12, 12], pk2: [2100, 9, 9], gain: 0.143, grit: 0.06, verb: 0.3, tick: 0 },
  sticky: { hp: 60, lp: 350, lpS: 900, pk1: [180, 3, 1], pk2: [2000, -8, 0.7], gain: 0.293, grit: 0.4, verb: 0.01, tick: 0 },
};
const ALIAS = { tube: 'glass', 'glass tube': 'glass', glasstube: 'glass', bridge: 'wood', fringe: 'grass', rim: 'grass', boost: 'grass' };
// engine MAT ids (js/engine/constants.js) -> surface
const MAT_ID = { 0: 'grass', 1: 'grass', 3: 'grass', 7: 'sand', 8: 'ice', 9: 'sticky', 10: 'grass', 11: 'wood' };
export const ROLL_SURFACES = ['grass', 'sand', 'ice', 'wood', 'metal', 'glass'];

export function surfaceOf(s) {
  if (typeof s === 'number') return MAT_ID[s] || 'grass';
  s = String(s || 'grass').toLowerCase();
  return P[s] ? s : ALIAS[s] || 'grass';
}

export class Roll {
  constructor(E) { this.E = E; this.g = null; this.lastT = 0; this.dist = 0; this.silentAt = 0; this.timer = 0; this.surf = ''; }

  build() {
    const ctx = this.E.ctx, c = (fn, ...a) => ctx[fn](...a);
    const src = c('createBufferSource'); src.buffer = noiseBuffer(ctx, 'pink'); src.loop = true;
    const hp = c('createBiquadFilter'); hp.type = 'highpass'; hp.Q.value = 0.7;
    const lp = c('createBiquadFilter'); lp.type = 'lowpass'; lp.Q.value = 0.7;
    const p1 = c('createBiquadFilter'); p1.type = 'peaking';
    const p2 = c('createBiquadFilter'); p2.type = 'peaking';
    const am = c('createGain'), out = c('createGain'), wet = c('createGain');
    am.gain.value = 1; out.gain.value = 0; wet.gain.value = 0;
    // grit: two detuned LFOs summed into the AM gain (irregular crunch, never periodic-sounding)
    const l1 = c('createOscillator'), l2 = c('createOscillator'), depth = c('createGain');
    l1.type = 'triangle'; l2.type = 'sine'; l1.frequency.value = 17.3; l2.frequency.value = 29.1; depth.gain.value = 0;
    l1.connect(depth); l2.connect(depth); depth.connect(am.gain);
    src.connect(hp); hp.connect(lp); lp.connect(p1); p1.connect(p2); p2.connect(am); am.connect(out);
    out.connect(this.E.sfx.dry); out.connect(wet); wet.connect(this.E.sfx.wet);
    const t = ctx.currentTime;
    src.start(t, Math.random()); l1.start(t); l2.start(t);
    this.g = { src, hp, lp, p1, p2, am, out, wet, l1, l2, depth };
    this.surf = '';
  }

  teardown() {
    if (!this.g) return;
    const g = this.g; this.g = null;
    for (const s of [g.src, g.l1, g.l2]) { try { s.stop(); } catch { /* */ } }
    for (const n of Object.values(g)) { try { n.disconnect(); } catch { /* */ } }
  }

  // speed in m/s (engine: 0..~6.4), surface name or engine MAT id. now defaults to ctx time.
  update(speed, surface, now = this.E.ctx.currentTime) {
    const s = clamp((speed || 0) / 5);
    const name = surfaceOf(surface), pr = P[name];
    if (s <= 0.004) { this.fadeOut(now); return; }
    if (!this.g) this.build();
    clearTimeout(this.timer); this.timer = 0; this.silentAt = 0;
    const g = this.g, tau = this.surf === name ? 0.05 : 0.035;
    const set = (prm, v, tc = tau) => { holdParam(prm, now); prm.setTargetAtTime(v, now, tc); };
    const bright = 1 + 0.35 * s;
    set(g.hp.frequency, pr.hp);
    set(g.lp.frequency, pr.lp + pr.lpS * s);
    set(g.p1.frequency, pr.pk1[0] * bright); set(g.p1.gain, pr.pk1[1]); set(g.p1.Q, pr.pk1[2]);
    set(g.p2.frequency, pr.pk2[0] * bright); set(g.p2.gain, pr.pk2[1]); set(g.p2.Q, pr.pk2[2]);
    set(g.depth.gain, pr.grit * 0.5);
    set(g.am.gain, 1 - pr.grit * 0.5);
    set(g.l1.frequency, 12 + 30 * s); set(g.l2.frequency, 21 + 45 * s);
    set(g.out.gain, pr.gain * Math.pow(s, 1.2), 0.06);
    set(g.wet.gain, pr.verb);
    this.surf = name;
    // plank / seam ticks, spaced by distance travelled
    const dt = this.lastT ? Math.min(0.1, Math.max(0, now - this.lastT)) : 0;
    this.lastT = now;
    if (pr.tick) {
      this.dist += speed * dt;
      if (this.dist >= pr.tick) {
        this.dist %= pr.tick;
        const v = voice(this.E, { gain: 0.25 + 0.75 * s, verb: pr.verb });
        if (name === 'wood') {
          const d = rnd(0.94, 1.06);
          modal(v, now, [[520 * d, 0.08, 0.05], [1320 * d, 0.04, 0.03]]);
          noise(v, now, { type: 'bandpass', f: 1800, q: 1, gain: 0.06, att: 0.0005, dur: 0.008 });
        } else {
          const d = rnd(0.97, 1.03);
          modal(v, now, [[2900 * d, 0.045, 0.12], [4300 * d, 0.025, 0.08]]);
        }
      }
    }
  }

  fadeOut(now = this.E.ctx.currentTime, tc = 0.06) {
    this.lastT = 0;
    if (!this.g) return;
    holdParam(this.g.out.gain, now); this.g.out.gain.setTargetAtTime(0, now, tc);
    if (!this.silentAt) this.silentAt = now;
    // live only: drop the graph after 2 s of silence (offline renders just let it run)
    if (!this.timer && typeof this.E.ctx.startRendering !== 'function') {
      this.timer = setTimeout(() => { this.timer = 0; if (this.silentAt) this.teardown(); }, 2000);
    }
  }
}
