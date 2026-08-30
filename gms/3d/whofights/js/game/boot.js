// The one boot decision, pure so it can be asserted in node. §0: nothing in the game layer may
// exist under ?shot= or in the editor — no session, no clock, no #game host, no injected
// stylesheet and no registered knobs.

export const MODES = ['shot', 'editor', 'play'];

export function bootMode(params) {
  if (params.has('shot')) return 'shot';
  if (params.has('editor')) return 'editor';
  return 'play';
}

export const playing = mode => mode === 'play';

// Track A keeps the perf readout, the editor toggle and the audio lab in both non-play modes.
export const devRow = mode => mode !== 'play';
