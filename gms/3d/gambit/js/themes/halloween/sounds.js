// Halloween theme sounds (audio agent): bone + pumpkin pieces on graveyard flagstones.
// Loaded lazily via `sounds: () => import('./sounds.js')` in index.js. Battle names bats, wail,
// creak, pop, hex, thunder come from js/audio/battle.js; override them here if needed.
import { placeHit, NOTE } from '../../audio/dsp.js';

export default {
  // hollow knock on flagstone
  move: { dur: 0.3, lvl: -2, punch: 2, variants: 4, build(s) {
    const r = s.verb(0.4, { mix: 0.14, tone: 3500 });
    placeHit(s, { kind: 'hollow', g: 0.6, to: r });
    placeHit(s, { kind: 'stone', g: 0.22, pitch: 1.2, to: r });
  } },
  // hollow crunch with a squelch
  capture: { dur: 0.45, lvl: 2, punch: 6, variants: 3, build(s) {
    const r = s.verb(0.45, { mix: 0.15, tone: 3200 });
    placeHit(s, { kind: 'hollow', g: 0.75, pitch: 0.78, to: r });
    s.noise({ t: 0.02, dur: 0.12, g: 0.18, color: 'brown', type: 'lowpass', f: 900, to: r });
    placeHit(s, { t: 0.05, kind: 'hollow', g: 0.3, pitch: 1.4, pan: 0.2, to: r });
  } },
  castle: { dur: 0.45, lvl: -1, punch: 2, variants: 2, build(s) {
    const r = s.verb(0.4, { mix: 0.14, tone: 3500 });
    placeHit(s, { kind: 'hollow', g: 0.6, to: r });
    placeHit(s, { t: 0.12, kind: 'hollow', g: 0.5, pitch: 0.85, pan: 0.2, to: r });
  } },
  // music-box minor third, a touch eerie
  check: { dur: 0.9, lvl: -1, build(s) {
    const r = s.verb(1.0, { mix: 0.3, tone: 5000 });
    s.bell({ f: NOTE(86), ratio: 3.01, index: 0.9, dur: 0.5, g: 0.22, to: r });
    s.bell({ t: 0.11, f: NOTE(83), ratio: 3.01, index: 0.9, dur: 0.7, g: 0.2, to: r });
  } },
  promote: { dur: 0.9, lvl: -1, build(s) {
    const r = s.verb(1.0, { mix: 0.3 });
    [69, 72, 76, 81].forEach((n, i) => s.bell({ t: i * 0.07, f: NOTE(n + 12), ratio: 3.01, index: 0.8, dur: 0.5, g: 0.18, pan: -0.3 + i * 0.2, to: r }));
  } },
  music: { file: 'halloween', loop: 45, xfade: 5 },   // 18 bars @ 96 bpm + 2-bar crossfade
};
