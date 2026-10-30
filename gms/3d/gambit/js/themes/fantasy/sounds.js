// Fantasy theme sounds (audio agent): carved figurines on an island board; swords and spells.
// Loaded lazily via `sounds: () => import('./sounds.js')` in index.js. Unlisted names fall back
// to js/audio/core.js and js/audio/battle.js (clash, swing, zap, fire, explosion, roar, sparkle...).
import { placeHit, NOTE } from '../../audio/dsp.js';

export default {
  // a solid figurine on stone; one variant in four carries a barely-there arcane chime
  move: { dur: 0.45, lvl: -2, punch: 2, variants: 4, build(s, v) {
    const r = s.verb(0.45, { mix: 0.12, tone: 4500 });
    placeHit(s, { kind: 'stone', g: 0.55, pitch: 1.05, to: r });
    placeHit(s, { kind: 'wood', g: 0.3, pitch: 0.9, to: r });
    if (v === 3) s.bell({ t: 0.02, f: NOTE(s.pick([86, 88, 91])), ratio: 2.01, index: 0.4, dur: 0.3, g: 0.025, to: r });
  } },
  // steel ting over a heavy landing
  capture: { dur: 0.6, lvl: 2, punch: 6, variants: 3, build(s) {
    const r = s.verb(0.6, { mix: 0.16, tone: 6000 });
    placeHit(s, { kind: 'stone', g: 0.75, pitch: 0.8, to: r });
    s.modal({ t: 0.01, modes: [[s.jit(2100, 0.05), 0.25, 1], [s.jit(3350, 0.05), 0.18, 0.6], [s.jit(4700, 0.05), 0.12, 0.4]], g: 0.18, click: 0.2, to: r });
  } },
  check: { dur: 0.8, lvl: -1, build(s) {
    const r = s.verb(0.9, { mix: 0.25 });
    s.bell({ f: NOTE(81), ratio: 2.76, index: 1.1, dur: 0.45, g: 0.22, to: r });
    s.bell({ t: 0.09, f: NOTE(86), ratio: 2.76, index: 1.0, dur: 0.6, g: 0.2, to: r });
  } },
  // a spell with an arcane bell tail (overrides the generic zap)
  zap: { dur: 1.1, lvl: 0, variants: 3, build(s) {
    const r = s.verb(1.0, { mix: 0.3, tone: 7000 });
    const f = s.jit(1500, 0.15);
    s.tone({ f, f2: 220, dur: 0.3, type: 'sawtooth', g: 0.15, a: 0.002, lp: 4500, to: r, vib: 34, vibDepth: 260 });
    s.noise({ dur: 0.22, g: 0.18, type: 'bandpass', f: 3800, f2: 1300, Q: 2, to: r });
    [0, 7, 12].forEach((n, i) => s.bell({ t: 0.12 + i * 0.05, f: NOTE(81 + n), ratio: 2.01, index: 0.6, dur: 0.6, g: 0.06, pan: -0.3 + i * 0.3, to: r }));
  } },
  music: { file: 'fantasy', loop: 60, xfade: 5 },   // 18 bars @ 72 bpm + 1.5-bar crossfade
};
