// The one boot decision, pure so it can be asserted in node. §0: nothing in the game layer may
// exist under ?shot= or in the editor — no session, no clock, no #game host, no injected
// stylesheet and no registered knobs.

export const MODES = ['shot', 'editor', 'play'];

// `local` is js/dev/gate.js's isLocal(). The scene editor is a dev tool, and DEV_CONTRACT §1 makes
// dev tools local-only: off a local origin ?editor is simply not a mode, so the game plays instead
// of handing a stranger the editor and the perf HUD. It is a required argument on purpose — a
// permissive default is how a gate like this quietly stops gating.
export function bootMode(params, local) {
  if (params.has('shot')) return 'shot';
  if (params.has('editor') && local) return 'editor';
  return 'play';
}

export const playing = mode => mode === 'play';

// Track A keeps the perf readout, the editor toggle and the audio lab in both non-play modes.
export const devRow = mode => mode !== 'play';
