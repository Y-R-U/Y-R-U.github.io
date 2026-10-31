// Plain 2D sounds (theme2d): muted, simple wooden clicks like a chess site. Anything not
// listed falls back to the core set (js/audio/core.js). Music: reuses Classic's calm track.
import { placeHit } from '../../audio/dsp.js';

export default {
  move: { dur: 0.22, lvl: -4, variants: 4, build(s) { placeHit(s, { kind: 'wood', g: 0.55, pitch: 1.1 }); } },
  capture: { dur: 0.3, lvl: -1, punch: 3, variants: 3, build(s) {
    placeHit(s, { kind: 'wood', g: 0.7, pitch: 0.92 });
    placeHit(s, { t: 0.035, kind: 'wood', g: 0.32, pitch: 1.25, pan: 0.12 });
  } },
  castle: { dur: 0.34, lvl: -3, variants: 2, build(s) {
    placeHit(s, { kind: 'wood', g: 0.55, pitch: 1.1 });
    placeHit(s, { t: 0.1, kind: 'wood', g: 0.45, pitch: 0.95, pan: 0.15 });
  } },
  music: { file: 'classic', loop: 51.2, xfade: 4.8 },
};
