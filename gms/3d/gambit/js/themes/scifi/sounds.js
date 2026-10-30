// Sci-fi theme sounds (sculptor-scifi-3, in the audio agent's recipe format — docs/notes/audio.md):
// hard-surface droids on a station deck. Moves are a mag-clamp "thunk" on a metal deck with a
// short servo blip; captures add a downward laser zap and a sub thump; check is a two-tone
// console alert; promote is a power-up sweep into a rising FM arpeggio. Battle anims can use the
// shared `laser` (overridden here with a punchier blaster), plus `zap`, `explosion` etc.
// Loaded lazily via `sounds: () => import('./sounds.js')` in index.js; unlisted names fall back
// to js/audio/core.js and js/audio/battle.js (incl. the sci-fi battle sounds `emp` and `tractor`).
// Music (polish-3): calm synth-pad loop, ACE-Step track 479d6f3546 (Music Studio project GAMBIT).
import { placeHit, NOTE } from '../../audio/dsp.js';

// mag-clamp on a metal deck: a bright stone/metal tap, a low clamp thump, a servo blip
function clamp(s, { t = 0, g = 0.6, pitch = 1, pan = 0, to, blip = 1 } = {}) {
  placeHit(s, { t, kind: 'stone', g: g * 0.55, pitch: 1.25 * pitch, ring: 1.6, pan, to });
  s.modal({ t, modes: [[s.jit(1650 * pitch, 0.04), 0.05, 1], [s.jit(2730 * pitch, 0.04), 0.035, 0.6], [s.jit(4420 * pitch, 0.04), 0.02, 0.35]], g: g * 0.28, click: 0.3, clickF: 5200, pan, to });
  s.tone({ t, f: 150 * pitch, f2: 70 * pitch, dur: 0.05, glideT: 0.045, g: g * 0.32, a: 0.001, pan, to });
  if (blip) s.tone({ t: t + 0.008, f: s.jit(1900 * pitch, 0.06), f2: 900 * pitch, dur: 0.045, glideT: 0.04, type: 'triangle', g: g * 0.06 * blip, a: 0.002, pan, to });
}

export default {
  music: { file: 'scifi', loop: 48, xfade: 4.5 },   // 16 bars @ 80 bpm + 1.5-bar crossfade
  // a droid setting down: hover hiss tail-off into a clamp; variants pitch the blip up/down
  move: { dur: 0.32, lvl: -2, punch: 2, variants: 4, build(s, v) {
    const r = s.verb(0.35, { mix: 0.12, tone: 6000 });
    s.noise({ t: 0, dur: 0.05, a: 0.02, g: 0.05, color: 'pink', type: 'bandpass', f: 3200, f2: 1400, Q: 1.2, to: r });
    clamp(s, { t: 0.02, g: 0.62, pitch: [1, 1.06, 0.95, 1.1][v % 4], to: r, blip: v === 3 ? 1.6 : 1 });
  } },
  // the victim is derezzed: a falling zap, a heavier clamp, a sub thump
  capture: { dur: 0.5, lvl: 2, punch: 9, variants: 3, build(s) {
    const r = s.verb(0.5, { mix: 0.16, tone: 6500 });
    const f = s.jit(2600, 0.08);
    s.tone({ f, f2: 260, dur: 0.16, type: 'square', g: 0.09, a: 0.001, lp: 5500, to: r });
    s.tone({ f: f * 1.012, f2: 250, dur: 0.16, type: 'sawtooth', g: 0.06, a: 0.001, lp: 5000, pan: 0.15, to: r });
    s.noise({ dur: 0.08, g: 0.12, type: 'bandpass', f: 5000, f2: 1600, Q: 1.5, to: r });
    clamp(s, { t: 0.035, g: 0.8, pitch: 0.82, to: r, blip: 0 });
    s.tone({ t: 0.035, f: 95, f2: 42, dur: 0.16, g: 0.24, a: 0.002, to: r });
  } },
  castle: { dur: 0.45, lvl: -1, punch: 5, variants: 2, build(s) {
    const r = s.verb(0.35, { mix: 0.12, tone: 6000 });
    clamp(s, { g: 0.6, to: r });
    clamp(s, { t: 0.12, g: 0.5, pitch: 0.9, pan: 0.2, to: r });
  } },
  // console alert: two quick square-ish pulses, high-low, softened by a low-pass
  check: { dur: 0.6, lvl: -1, build(s) {
    const r = s.verb(0.6, { mix: 0.2, tone: 7000 });
    s.tone({ f: NOTE(88), dur: 0.07, type: 'square', g: 0.09, a: 0.003, lp: 3800, decay: 'hold', to: r });
    s.bell({ f: NOTE(88), ratio: 2.0, index: 0.6, dur: 0.18, g: 0.12, to: r });
    s.tone({ t: 0.1, f: NOTE(83), dur: 0.09, type: 'square', g: 0.09, a: 0.003, lp: 3800, decay: 'hold', to: r });
    s.bell({ t: 0.1, f: NOTE(83), ratio: 2.0, index: 0.6, dur: 0.3, g: 0.12, to: r });
  } },
  // power-up: a rising filtered sweep under a four-note FM arpeggio
  promote: { dur: 0.9, lvl: -1, build(s) {
    const r = s.verb(0.9, { mix: 0.25, tone: 8000 });
    s.tone({ f: 220, f2: 1760, dur: 0.32, type: 'sawtooth', g: 0.06, a: 0.02, lp: 3000, to: r });
    s.noise({ dur: 0.32, a: 0.25, g: 0.05, type: 'bandpass', f: 800, f2: 6000, Q: 2, to: r, decay: 'lin' });
    [72, 76, 79, 84].forEach((n, i) => s.bell({ t: 0.06 + i * 0.065, f: NOTE(n + 12), ratio: 2.0, index: 0.7, dur: 0.45, g: 0.16, pan: -0.3 + i * 0.2, to: r }));
  } },
  // blaster bolt (overrides the generic laser for sci-fi battles): detuned saws diving fast,
  // a noise crack at the muzzle and a short metallic room
  laser: { dur: 0.5, lvl: -1, variants: 3, build(s) {
    const r = s.verb(0.45, { mix: 0.18, tone: 7000 });
    const f = s.jit(3200, 0.12);
    s.tone({ f, f2: 180, dur: 0.2, glideT: 0.17, type: 'sawtooth', g: 0.12, a: 0.001, lp: 7000, to: r });
    s.tone({ f: f * 0.5, f2: 120, dur: 0.22, glideT: 0.18, type: 'square', g: 0.07, a: 0.001, lp: 4000, pan: -0.15, to: r });
    s.noise({ dur: 0.03, g: 0.2, type: 'highpass', f: 3000, to: r });
  } },
  // battle flavour: a heavy mech step on a deck plate, and armour knocking together
  thud: { dur: 0.45, lvl: 0, punch: 8, variants: 3, build(s) {
    const r = s.verb(0.4, { mix: 0.14, tone: 5000 });
    clamp(s, { g: 0.8, pitch: 0.7, to: r, blip: 0 });
    s.tone({ f: 85, f2: 40, dur: 0.2, g: 0.3, a: 0.002, to: r });
  } },
  knock: { dur: 0.35, lvl: -2, punch: 5, variants: 3, build(s) { clamp(s, { g: 0.7, pitch: 1.3, blip: 0 }); } },
};
