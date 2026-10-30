// Classic theme sounds (audio agent): polished gold / black-chrome pieces on a marble board.
// Loaded lazily by js/audio/ through `sounds: () => import('./sounds.js')` in index.js.
// Anything not listed here falls back to the core set (js/audio/core.js) and the battle
// vocabulary (js/audio/battle.js).
import { placeHit } from '../../audio/dsp.js';

export default {
  // weighted piece on marble: crisp stone click, low body, the faintest metal ring
  move: { dur: 0.3, lvl: -2, punch: 2, variants: 4, build(s) { const v = s.verb(0.35, { mix: 0.1, tone: 5000 }); placeHit(s, { kind: 'marble', g: 0.6, ring: 1, to: v }); } },
  capture: { dur: 0.4, lvl: 2, punch: 6, variants: 3, build(s) {
    const v = s.verb(0.4, { mix: 0.12, tone: 4500 });
    placeHit(s, { kind: 'marble', g: 0.75, pitch: 0.8, ring: 1.4, to: v });
    placeHit(s, { t: 0.045, kind: 'marble', g: 0.3, pitch: 1.3, ring: 2, pan: 0.15, to: v });
  } },
  castle: { dur: 0.42, lvl: -1, punch: 2, variants: 2, build(s) {
    const v = s.verb(0.35, { mix: 0.1, tone: 5000 });
    placeHit(s, { kind: 'marble', g: 0.6, ring: 1, to: v });
    placeHit(s, { t: 0.115, kind: 'marble', g: 0.5, pitch: 0.88, ring: 1, pan: 0.2, to: v });
  } },
  // battle flavour: heavy thud on stone, and pieces clinking together
  thud: { dur: 0.45, lvl: 0, punch: 5, variants: 3, build(s) {
    const v = s.verb(0.4, { mix: 0.12 });
    placeHit(s, { kind: 'stone', g: 0.8, pitch: 0.6, to: v });
    s.tone({ f: 105, f2: 48, dur: 0.18, g: 0.22, to: v });
  } },
  knock: { dur: 0.35, lvl: -2, variants: 3, build(s) { placeHit(s, { kind: 'marble', g: 0.7, pitch: 1.35, ring: 3 }); } },
  topple: { dur: 0.8, lvl: -2, variants: 2, build(s) {
    let t = 0, g = 0.6, gap = 0.16;
    for (let i = 0; i < 5; i++) { placeHit(s, { t, kind: 'marble', g, pitch: 1.05 + i * 0.05, ring: 1.5, pan: 0.1 * i }); t += gap; gap *= 0.62; g *= 0.6; }
  } },
  music: { file: 'classic', loop: 64, xfade: 3.2 },
};
