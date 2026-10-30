// GAMBIT audio — the core sound set (any theme without its own version uses these).
// Recipe shape: see dsp.js. `lvl` is loudness in dB relative to a normal move.
import { placeHit, mallet, whoosh, NOTE } from './dsp.js';

export const CORE = {
  // A felt-bottomed piece set down on a wooden board: woody modal click + a low board thump.
  move: { dur: 0.22, lvl: -2, punch: 2, variants: 4, build(s) { const v = s.verb(0.25, { mix: 0.08, tone: 3500 }); placeHit(s, { kind: 'wood', g: 0.6, to: v }); } },
  // Heavier: the capturing piece lands harder (lower, longer) and the captured piece clacks away.
  capture: { dur: 0.32, lvl: 2, punch: 6, variants: 3, build(s) {
    const v = s.verb(0.3, { mix: 0.1, tone: 3000 });
    placeHit(s, { kind: 'wood', g: 0.75, pitch: 0.82, to: v });
    placeHit(s, { t: 0.042, kind: 'wood', g: 0.32, pitch: 1.25, pan: 0.15, to: v });
    s.noise({ t: 0.0, dur: 0.05, g: 0.06, type: 'bandpass', f: 1800, Q: 0.8, to: v });
  } },
  // King then rook, a quick double clack.
  castle: { dur: 0.36, lvl: -1, punch: 2, variants: 2, build(s) {
    const v = s.verb(0.25, { mix: 0.08 });
    placeHit(s, { kind: 'wood', g: 0.6, to: v });
    placeHit(s, { t: 0.115, kind: 'wood', g: 0.5, pitch: 0.9, pan: 0.2, to: v });
  } },
  // Overlay played with the move that gives check: a bright, short two-note bell.
  check: { dur: 0.55, lvl: -1, build(s) {
    const v = s.verb(0.6, { mix: 0.18 });
    s.bell({ f: NOTE(88), ratio: 2.76, index: 1.2, dur: 0.35, g: 0.25, to: v });
    s.bell({ t: 0.075, f: NOTE(84), ratio: 2.76, index: 1.0, dur: 0.42, g: 0.22, to: v });
  } },
  // Rising sparkle arpeggio.
  promote: { dur: 0.75, lvl: -1, build(s) {
    const v = s.verb(0.8, { mix: 0.22 });
    [72, 76, 79, 84].forEach((n, i) => mallet(s, { t: i * 0.055, f: NOTE(n), dur: 0.45, g: 0.22, pan: -0.3 + i * 0.2, to: v }));
    for (let i = 0; i < 10; i++) s.tone({ t: 0.12 + i * 0.03, f: s.jit(5200, 0.25), dur: 0.08, g: 0.03, pan: s.rand() * 1.4 - 0.7, to: v });
  } },
  // Soft, low "bonk" — not a buzzer.
  illegal: { dur: 0.22, lvl: -5, build(s) {
    s.tone({ f: 466, f2: 392, dur: 0.1, type: 'triangle', g: 0.35, a: 0.003, lp: 2200 });
    s.tone({ t: 0.06, f: 349, dur: 0.12, type: 'triangle', g: 0.3, a: 0.003, lp: 1800 });
  } },
  // Game start: a wooden knock plus a two-note marimba chime.
  start: { dur: 0.8, lvl: -2, build(s) {
    const v = s.verb(0.7, { mix: 0.2 });
    placeHit(s, { kind: 'wood', g: 0.35, to: v });
    mallet(s, { t: 0.05, f: NOTE(67), dur: 0.5, g: 0.3, to: v });
    mallet(s, { t: 0.17, f: NOTE(72), dur: 0.6, g: 0.3, to: v });
  } },
  // Win: bright mallet arpeggio up to a held major chord with shimmer.
  win: { dur: 1.6, lvl: 0, build(s) {
    const v = s.verb(1.4, { mix: 0.25 });
    [60, 64, 67, 72].forEach((n, i) => mallet(s, { t: i * 0.09, f: NOTE(n), dur: 0.5, g: 0.26, pan: -0.25 + i * 0.16, to: v }));
    [72, 76, 79].forEach(n => s.tone({ t: 0.36, f: NOTE(n), dur: 1.0, type: 'triangle', a: 0.02, g: 0.09, to: v, vib: 5, vibDepth: 2 }));
    for (let i = 0; i < 14; i++) s.tone({ t: 0.38 + i * 0.045, f: s.jit(4800, 0.3), dur: 0.1, g: 0.025, pan: s.rand() * 1.4 - 0.7, to: v });
  } },
  // Lose: gentle descending minor phrase (not a sad trombone).
  lose: { dur: 1.5, lvl: -2, build(s) {
    const v = s.verb(1.3, { mix: 0.25, tone: 2500 });
    [67, 63, 60].forEach((n, i) => s.tone({ t: i * 0.17, f: NOTE(n), dur: i === 2 ? 0.9 : 0.35, type: 'triangle', a: 0.01, g: 0.28, lp: 2200, to: v }));
    s.tone({ t: 0.34, f: NOTE(48), dur: 0.9, a: 0.02, g: 0.18, to: v });
  } },
  // Draw: neutral open fifth, twice.
  draw: { dur: 1.3, lvl: -2, build(s) {
    const v = s.verb(1.1, { mix: 0.22 });
    mallet(s, { f: NOTE(67), dur: 0.5, g: 0.26, to: v }); mallet(s, { t: 0.13, f: NOTE(74), dur: 0.6, g: 0.24, to: v });
    s.tone({ t: 0.3, f: NOTE(62), dur: 0.8, type: 'triangle', a: 0.03, g: 0.08, to: v });
    s.tone({ t: 0.3, f: NOTE(69), dur: 0.8, type: 'triangle', a: 0.03, g: 0.07, to: v });
  } },
  // Low time: a clock "tic-toc".
  lowtime: { dur: 0.42, lvl: -4, build(s) {
    s.modal({ modes: [[3300, 0.012, 1], [5100, 0.008, 0.5], [1800, 0.01, 0.4]], g: 0.6, click: 0.3 });
    s.modal({ t: 0.27, modes: [[2700, 0.012, 1], [4300, 0.008, 0.5], [1500, 0.01, 0.4]], g: 0.5, click: 0.3 });
  } },
  tick: { dur: 0.08, lvl: -8, build(s) { s.modal({ modes: [[3300, 0.012, 1], [5100, 0.008, 0.5], [1800, 0.01, 0.4]], g: 0.6, click: 0.3 }); } },
  // Puzzle: correct move — quick upward two-note ding.
  correct: { dur: 0.5, lvl: -4, build(s) {
    const v = s.verb(0.5, { mix: 0.18 });
    s.bell({ f: NOTE(76), ratio: 2, index: 0.6, dur: 0.25, g: 0.22, to: v });
    s.bell({ t: 0.08, f: NOTE(83), ratio: 2, index: 0.6, dur: 0.35, g: 0.22, to: v });
  } },
  // Puzzle: wrong — soft muted down-step.
  wrong: { dur: 0.4, lvl: -5, build(s) {
    s.tone({ f: NOTE(70), dur: 0.12, type: 'square', g: 0.12, a: 0.004, lp: 1600 });
    s.tone({ t: 0.11, f: NOTE(67), dur: 0.22, type: 'square', g: 0.12, a: 0.004, lp: 1300 });
  } },
  // Puzzle solved: lighter, quicker cousin of win.
  solved: { dur: 1.2, lvl: -1, build(s) {
    const v = s.verb(1.1, { mix: 0.25 });
    [72, 76, 79, 84, 88].forEach((n, i) => mallet(s, { t: i * 0.06, f: NOTE(n), dur: 0.45, g: 0.2, pan: -0.4 + i * 0.2, to: v }));
    s.bell({ t: 0.3, f: NOTE(96), ratio: 3, index: 0.8, dur: 0.7, g: 0.08, to: v });
  } },
  // UI button click: tiny, dry.
  tap: { dur: 0.05, lvl: -12, build(s) { s.modal({ modes: [[2300, 0.006, 1], [4700, 0.004, 0.5]], g: 0.6, click: 0.4 }); } },
  // Offer / notification (draw offers, opponent found).
  notify: { dur: 0.6, lvl: -4, build(s) {
    const v = s.verb(0.6, { mix: 0.2 });
    mallet(s, { f: NOTE(79), dur: 0.35, g: 0.25, to: v }); mallet(s, { t: 0.1, f: NOTE(76), dur: 0.45, g: 0.25, to: v });
  } },
  // a short swish (battle default, also generic)
  whoosh: { dur: 0.4, lvl: -4, build(s) { whoosh(s, { dur: 0.32, g: 0.5, pan: -0.3, pan2: 0.3 }); } },
};
export const ALIASES = { click: 'tap', button: 'tap', ok: 'correct', bad: 'wrong', fail: 'wrong', mate: 'check', end: 'draw', loss: 'lose' };
