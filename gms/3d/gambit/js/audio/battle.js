// GAMBIT audio — battle sound vocabulary. Owner: audio agent.
// Every name here works in every theme (themes can override any of them in their sounds.js).
// Call from a battle anim: sfx('clash', { ctx, at: ctx.victimPos })  — see docs/notes/audio.md.
import { placeHit, whoosh, crackle, NOTE } from './dsp.js';

// metal: inharmonic partials (sword / armour)
const SWORD = [[1980, 0.35, 1], [3160, 0.28, 0.8], [4410, 0.2, 0.6], [5870, 0.15, 0.45], [7350, 0.1, 0.3], [9200, 0.06, 0.2]];

export const BATTLE = {
  // --- physical -------------------------------------------------------------
  swing: { dur: 0.35, lvl: -5, variants: 2, build(s) { whoosh(s, { dur: 0.22, g: 0.6, f: 700, f2: 3200, Q: 2, pan: -0.4, pan2: 0.4 }); } },
  // two blades meet: bright inharmonic ring + transient + scrape
  clash: { dur: 0.9, lvl: 0, punch: 3, variants: 3, build(s) {
    const v = s.verb(0.8, { mix: 0.22, tone: 7000 });
    s.modal({ modes: SWORD.map(([f, d, m]) => [s.jit(f, 0.04), d, m]), g: 0.5, to: v, click: 0.5 });
    s.noise({ dur: 0.03, g: 0.4, type: 'highpass', f: 3000, to: v });
    s.noise({ t: 0.03, dur: 0.18, g: 0.08, type: 'bandpass', f: 5200, f2: 3000, Q: 4, to: v, decay: 'lin' });
    s.tone({ dur: 0.06, f: 160, f2: 90, g: 0.25, to: v });
  } },
  // blade/fist into a body: dull impact
  hit: { dur: 0.3, lvl: 0, punch: 5, variants: 3, build(s) {
    s.tone({ f: 140, f2: 55, dur: 0.12, glideT: 0.1, g: 0.3, a: 0.001 });
    s.noise({ dur: 0.08, g: 0.6, color: 'pink', type: 'lowpass', f: 2600, f2: 600 });
    placeHit(s, { kind: 'wood', g: 0.35, pitch: 0.55 });
    s.noise({ dur: 0.012, g: 0.25, type: 'highpass', f: 2500 });
  } },
  // heavy wood: piece hits the board hard
  thud: { dur: 0.35, lvl: 0, punch: 5, variants: 3, build(s) {
    const v = s.verb(0.3, { mix: 0.12 });
    placeHit(s, { kind: 'wood', g: 0.8, pitch: 0.65, to: v });
    s.tone({ f: 110, f2: 50, dur: 0.16, g: 0.2, to: v });
  } },
  // two pieces knock together
  knock: { dur: 0.25, lvl: -2, variants: 3, build(s) { placeHit(s, { kind: 'wood', g: 0.7, pitch: 1.3 }); } },
  // stone grind + crunch (a rook block lands, masonry cracks)
  stone: { dur: 0.6, lvl: 0, punch: 4, variants: 2, build(s) {
    const v = s.verb(0.4, { mix: 0.12, tone: 2500 });
    placeHit(s, { kind: 'stone', g: 0.8, pitch: 0.7, to: v });
    s.noise({ dur: 0.35, g: 0.3, color: 'brown', type: 'lowpass', f: 900, to: v });
    crackle(s, { t: 0.02, dur: 0.3, n: 18, g: 0.25, f: 2200, to: v });
    s.tone({ f: 90, f2: 45, dur: 0.2, g: 0.15, to: v });
  } },
  // a piece tips over and rattles to rest: diminishing clacks
  topple: { dur: 0.7, lvl: -2, variants: 2, build(s) {
    let t = 0, g = 0.6, gap = 0.16;
    for (let i = 0; i < 5; i++) { placeHit(s, { t, kind: 'wood', g, pitch: 1.1 + i * 0.05, pan: 0.1 * i }); t += gap; gap *= 0.62; g *= 0.6; }
  } },
  // shoved along the board: friction scrape
  slide: { dur: 0.6, lvl: -4, build(s) {
    s.noise({ dur: 0.45, a: 0.05, g: 0.35, color: 'pink', type: 'bandpass', f: 1400, f2: 900, Q: 1.5, decay: 'hold' });
    s.noise({ dur: 0.45, a: 0.05, g: 0.1, type: 'bandpass', f: 4200, Q: 3, decay: 'hold' });
  } },
  // a big stomp: low boom and the board rattles
  stomp: { dur: 0.8, lvl: 1, punch: 5, build(s) {
    const v = s.verb(0.5, { mix: 0.14 });
    s.tone({ f: 120, f2: 38, dur: 0.35, glideT: 0.25, g: 0.35, a: 0.001, to: v });
    s.noise({ dur: 0.2, g: 0.5, color: 'pink', type: 'lowpass', f: 1500, to: v });
    placeHit(s, { kind: 'wood', g: 0.7, pitch: 0.5, to: v });
    for (let i = 0; i < 6; i++) placeHit(s, { t: 0.05 + i * 0.035 + s.rand() * 0.02, kind: 'wood', g: 0.18, pitch: 1.1 + s.rand() * 0.6, pan: s.rand() - 0.5, to: v });
  } },
  // removed in a puff
  poof: { dur: 0.5, lvl: -5, build(s) {
    s.noise({ dur: 0.3, a: 0.01, g: 0.5, color: 'pink', type: 'lowpass', f: 2500, f2: 400 });
    s.tone({ f: 600, f2: 200, dur: 0.15, g: 0.15 });
  } },

  // --- magic ----------------------------------------------------------------
  // a bolt: descending FM zap + crackle + sparkle tail
  zap: { dur: 0.9, lvl: 0, variants: 3, build(s) {
    const v = s.verb(0.9, { mix: 0.25, tone: 6000 });
    const f = s.jit(1800, 0.15);
    s.tone({ f, f2: 180, dur: 0.32, type: 'sawtooth', g: 0.18, a: 0.002, lp: 5000, to: v, vib: 38, vibDepth: 300 });
    s.tone({ f: f * 1.5, f2: 260, dur: 0.28, type: 'square', g: 0.06, a: 0.002, lp: 4000, to: v });
    s.noise({ dur: 0.25, g: 0.2, type: 'bandpass', f: 4000, f2: 1200, Q: 2, to: v });
    crackle(s, { dur: 0.35, n: 26, g: 0.25, f: 5000, to: v });
    for (let i = 0; i < 8; i++) s.tone({ t: 0.15 + i * 0.05, f: s.jit(3800, 0.3), dur: 0.1, g: 0.03, pan: s.rand() * 1.2 - 0.6, to: v });
  } },
  // magic chime / glitter
  sparkle: { dur: 1.0, lvl: -4, build(s) {
    const v = s.verb(1.0, { mix: 0.3, tone: 9000 });
    for (let i = 0; i < 16; i++) s.bell({ t: i * 0.035 + s.rand() * 0.02, f: NOTE(84 + s.pick([0, 4, 7, 12, 16, 19])), ratio: 2.01, index: 0.5, dur: 0.35, g: 0.05, pan: s.rand() * 1.6 - 0.8, to: v });
  } },
  // lightning crack + rolling thunder
  thunder: { dur: 2.2, lvl: 1, punch: 4, build(s) {
    const v = s.verb(1.6, { mix: 0.35, tone: 2500 });
    s.noise({ dur: 0.06, g: 0.7, type: 'highpass', f: 1500, to: v });
    crackle(s, { dur: 0.15, n: 30, g: 0.4, f: 3500, to: v });
    s.noise({ t: 0.05, dur: 1.8, a: 0.15, g: 0.6, color: 'pink', type: 'lowpass', f: 700, f2: 200, to: v });
    s.tone({ t: 0.05, f: 70, f2: 35, dur: 1.2, g: 0.12, a: 0.05, to: v });
  } },
  // whoosh of flame: rising roar of filtered noise + crackle
  fire: { dur: 1.3, lvl: 0, variants: 2, build(s) {
    const v = s.verb(0.6, { mix: 0.15, tone: 4000 });
    s.noise({ dur: 0.9, a: 0.18, g: 0.55, color: 'pink', type: 'bandpass', f: 300, f2: 1600, fT: 0.35, Q: 0.9, to: v });
    s.noise({ t: 0.05, dur: 1.0, a: 0.2, g: 0.35, color: 'brown', type: 'lowpass', f: 500, to: v });
    crackle(s, { t: 0.1, dur: 1.0, n: 40, g: 0.18, f: 2600, to: v });
  } },
  // big boom: sub drop + noise burst + debris
  explosion: { dur: 2.0, lvl: 2, punch: 5, variants: 2, build(s) {
    const v = s.verb(1.4, { mix: 0.3, tone: 2200 });
    s.tone({ f: 95, f2: 28, dur: 0.9, glideT: 0.7, g: 0.5, a: 0.001, to: v });
    s.noise({ dur: 0.08, g: 0.8, type: 'lowpass', f: 6000, f2: 1200, to: v });
    s.noise({ dur: 1.0, a: 0.005, g: 1.0, color: 'pink', type: 'bandpass', f: 1100, f2: 300, Q: 0.6, to: v });
    s.noise({ dur: 1.2, a: 0.01, g: 0.7, color: 'brown', type: 'lowpass', f: 1800, f2: 150, to: v });
    crackle(s, { t: 0.08, dur: 1.2, n: 45, g: 0.18, f: 2000, to: v });
  } },
  // a short beam (sci-fi / generic)
  laser: { dur: 0.45, lvl: -2, variants: 2, build(s) {
    const f = s.jit(2400, 0.1);
    s.tone({ f, f2: 300, dur: 0.22, type: 'square', g: 0.14, a: 0.001, lp: 6000 });
    s.tone({ f: f * 1.01, f2: 310, dur: 0.22, type: 'sawtooth', g: 0.08, a: 0.001, lp: 5000, pan: 0.2 });
  } },
  // EMP discharge (sci-fi stomp, polish-3): a hard electrical thump — sub drop + a mains-buzz burst
  // (square at 50 Hz through a sweeping band-pass) + wide crackle — then the "power-down" whine of
  // everything nearby dying (2.4 kHz -> 70 Hz) and a fading 100 Hz hum
  emp: { dur: 1.5, lvl: 1, punch: 4, variants: 2, build(s) {
    const v = s.verb(1.1, { mix: 0.3, tone: 4500 });
    s.tone({ f: 110, f2: 30, dur: 0.6, glideT: 0.45, g: 0.5, a: 0.001, to: v });
    s.noise({ dur: 0.05, g: 0.6, type: 'highpass', f: 2000, to: v });
    const buzz = s.bus({ g: 1, bp: 900, Q: 1.4, to: v });
    s.tone({ f: s.jit(50, 0.04), dur: 0.42, type: 'square', g: 0.55, a: 0.002, to: buzz });
    s.tone({ f: s.jit(75, 0.04), dur: 0.36, type: 'sawtooth', g: 0.3, a: 0.002, to: buzz, pan: 0.3 });
    s.noise({ dur: 0.45, g: 0.35, type: 'bandpass', f: 6000, f2: 700, Q: 1.2, to: v });
    crackle(s, { dur: 0.6, n: 40, g: 0.3, f: 4500, to: v });
    const w = s.jit(2400, 0.08);
    s.tone({ t: 0.06, f: w, f2: 70, dur: 0.95, glideT: 0.9, type: 'triangle', g: 0.12, a: 0.01, to: v, decay: 'hold' });
    s.tone({ t: 0.06, f: w * 1.5, f2: 105, dur: 0.85, glideT: 0.8, type: 'sine', g: 0.05, a: 0.01, pan: -0.25, to: v, decay: 'hold' });
    s.tone({ t: 0.1, f: 100, dur: 1.1, type: 'sawtooth', g: 0.06, a: 0.05, lp: 600, to: v });
  } },
  // tractor beam hum (sci-fi tractor, polish-3): an emitter "thoom" into a sustained, throbbing
  // two-oscillator drone (fifth apart, 7 Hz tremolo, slow filter sweep) with a rising sine "lift"
  // glide and airy beam hiss; ~1.3 s, held then released
  tractor: { dur: 1.6, lvl: -2, variants: 2, build(s) {
    const oc = s.oc, v = s.verb(0.9, { mix: 0.22, tone: 5000 });
    const H = 1.3, f0 = s.jit(98, 0.03);
    s.tone({ f: 220, f2: 60, dur: 0.18, glideT: 0.15, g: 0.35, a: 0.002, to: v });
    // tremolo bus: gain = 0.6 + 0.4 * sin(7 Hz)
    const trem = oc.createGain(); trem.gain.value = 0.6;
    const lfo = oc.createOscillator(), depth = oc.createGain();
    lfo.frequency.value = s.jit(7, 0.08); depth.gain.value = 0.4; lfo.connect(depth).connect(trem.gain); lfo.start(0); lfo.stop(H + 0.2);
    const lp = oc.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 3;
    lp.frequency.setValueAtTime(400, 0); lp.frequency.exponentialRampToValueAtTime(1800, H * 0.8); lp.frequency.exponentialRampToValueAtTime(600, H);
    trem.connect(lp).connect(v);
    s.tone({ f: f0, f2: f0 * 1.12, glide: 'lin', dur: H, type: 'sawtooth', g: 0.35, a: 0.12, to: trem, decay: 'hold' });
    s.tone({ f: f0 * 1.5, f2: f0 * 1.68, glide: 'lin', dur: H, type: 'sawtooth', g: 0.22, a: 0.15, to: trem, detune: 7, decay: 'hold' });
    s.tone({ f: f0 / 2, dur: H, type: 'sine', g: 0.3, a: 0.1, to: trem, decay: 'hold' });
    s.tone({ t: 0.08, f: 320, f2: 760, glide: 'lin', dur: H - 0.1, type: 'sine', g: 0.07, a: 0.2, to: v, vib: 5, vibDepth: 9, decay: 'hold' });
    s.noise({ t: 0.04, dur: H - 0.05, a: 0.2, g: 0.08, color: 'pink', type: 'bandpass', f: 2400, f2: 4200, Q: 1.6, to: v, decay: 'hold' });
  } },
  // a beast's roar (dragon): formant-filtered saw with slow vibrato
  roar: { dur: 1.6, lvl: 0, punch: 3, build(s) {
    const v = s.verb(1.2, { mix: 0.25, tone: 2500 });
    const b = s.bus({ g: 1, bp: 700, Q: 1.2, to: v });
    s.tone({ f: 85, f2: 62, dur: 1.2, type: 'sawtooth', a: 0.12, g: 0.5, to: b, vib: 9, vibDepth: 8, decay: 'hold' });
    s.tone({ f: 128, f2: 90, dur: 1.2, type: 'sawtooth', a: 0.15, g: 0.3, to: b, vib: 7, vibDepth: 10, decay: 'hold' });
    s.noise({ dur: 1.2, a: 0.12, g: 0.25, color: 'pink', type: 'bandpass', f: 1200, Q: 1, to: v, decay: 'hold' });
  } },

  // --- spooky ---------------------------------------------------------------
  // bats: rapid wing flaps (AM noise) sweeping across + tiny squeaks
  bats: { dur: 1.3, lvl: -2, variants: 2, build(s) {
    const v = s.verb(0.6, { mix: 0.15 });
    for (let b = 0; b < 3; b++) {
      const rate = 16 + s.rand() * 8, t0 = b * 0.12, n = 14, pan0 = -0.8 + s.rand() * 0.4;
      for (let i = 0; i < n; i++) {
        const k = i / n;
        s.noise({ t: t0 + i / rate, dur: 0.028, a: 0.006, g: 0.4 * Math.sin(Math.PI * k), color: 'pink', type: 'bandpass', f: s.jit(1600, 0.2), Q: 1.4, pan: pan0 + k * 1.5, to: v });
      }
      for (let i = 0; i < 3; i++) s.tone({ t: t0 + 0.1 + s.rand() * 0.6, f: s.jit(7800, 0.1), f2: s.jit(6200, 0.1), dur: 0.035, g: 0.05, pan: s.rand() * 1.2 - 0.6, to: v });
    }
  } },
  // ghost wail: breathy, wavering, gliding sine through a formant
  wail: { dur: 2.0, lvl: -2, build(s) {
    const v = s.verb(1.8, { mix: 0.45, tone: 3500 });
    const o = s.tone({ f: NOTE(64), dur: 1.4, a: 0.25, g: 0.3, type: 'sine', to: v, vib: 5.5, vibDepth: 14, decay: 'hold' });
    o.o.frequency.setValueAtTime(NOTE(64), 0);
    o.o.frequency.linearRampToValueAtTime(NOTE(76), 0.45);
    o.o.frequency.linearRampToValueAtTime(NOTE(69), 1.4);
    const o2 = s.tone({ f: NOTE(64) * 1.5, dur: 1.4, a: 0.3, g: 0.08, type: 'triangle', to: v, vib: 5, vibDepth: 18, decay: 'hold' });
    o2.o.frequency.linearRampToValueAtTime(NOTE(76) * 1.5, 0.5);
    o2.o.frequency.linearRampToValueAtTime(NOTE(69) * 1.5, 1.4);
    s.noise({ dur: 1.4, a: 0.3, g: 0.08, color: 'pink', type: 'bandpass', f: 900, f2: 1400, Q: 2, to: v, decay: 'hold' });
  } },
  // creaky grave / coffin lid: a slow stick-slip pulse train through wood resonances
  creak: { dur: 1.2, lvl: -2, variants: 2, build(s) {
    const v = s.verb(0.6, { mix: 0.18, tone: 3000 });
    const bus = s.bus({ g: 1, to: v });
    const fls = [[520, 6], [1150, 8], [2050, 9]].map(([f, Q]) => { const b = s.oc.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = s.jit(f, 0.06); b.Q.value = Q; b.connect(bus); return b; });
    const o = s.oc.createOscillator(); o.type = 'sawtooth';
    const g = s.oc.createGain();
    o.frequency.setValueAtTime(28, 0); o.frequency.linearRampToValueAtTime(s.jit(70, 0.15), 0.35);
    o.frequency.linearRampToValueAtTime(s.jit(45, 0.15), 0.7); o.frequency.linearRampToValueAtTime(s.jit(85, 0.1), 0.95);
    g.gain.setValueAtTime(0.0001, 0); g.gain.linearRampToValueAtTime(0.5, 0.08); g.gain.setValueAtTime(0.5, 0.85); g.gain.linearRampToValueAtTime(0.0001, 1.05);
    o.connect(g); fls.forEach(f => g.connect(f)); o.start(0); o.stop(1.1);
  } },
  // pumpkin pop: hollow "pok" + squelch + a scatter of seeds
  pop: { dur: 0.7, lvl: 0, punch: 3, variants: 2, build(s) {
    const v = s.verb(0.4, { mix: 0.12 });
    s.tone({ f: 900, f2: 180, dur: 0.06, glideT: 0.04, g: 0.6, a: 0.001, to: v });
    s.noise({ dur: 0.06, g: 0.45, type: 'bandpass', f: 1400, Q: 1.2, to: v });
    placeHit(s, { kind: 'hollow', g: 0.5, pitch: 0.8, to: v });
    s.noise({ t: 0.03, dur: 0.18, g: 0.18, color: 'brown', type: 'lowpass', f: 700, to: v });
    for (let i = 0; i < 9; i++) placeHit(s, { t: 0.12 + s.rand() * 0.4, kind: 'hollow', g: 0.06 + s.rand() * 0.06, pitch: 2 + s.rand(), pan: s.rand() * 1.4 - 0.7, to: v });
  } },
  // witchy cackle-ish trill (short, playful)
  hex: { dur: 0.9, lvl: -3, build(s) {
    const v = s.verb(0.8, { mix: 0.3 });
    for (let i = 0; i < 6; i++) s.tone({ t: i * 0.085, f: NOTE(79 - (i % 2) * 3 - i), dur: 0.08, type: 'triangle', g: 0.2, a: 0.005, to: v, vib: 22, vibDepth: 40 });
    crackle(s, { t: 0.1, dur: 0.6, n: 14, g: 0.12, f: 6000, to: v });
  } },
};

export const BATTLE_ALIASES = {
  sword: 'clash', blade: 'clash', slash: 'swing', pulse: 'emp', hum: 'tractor', magic: 'zap', spell: 'zap', bolt: 'zap', lightning: 'thunder',
  flame: 'fire', burn: 'fire', boom: 'explosion', blast: 'explosion', bat: 'bats', ghost: 'wail', grave: 'creak',
  pumpkin: 'pop', fall: 'topple', shove: 'slide', impact: 'hit', crunch: 'stone', vanish: 'poof', wood: 'thud', beam: 'laser',
};
