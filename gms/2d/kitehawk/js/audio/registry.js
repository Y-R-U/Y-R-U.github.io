// The one place that knows about every sound. Import this, not sfx.js or aviation.js.
//
//   SFX   one-shots  — 53 ported from the forge_test lab + 12 aviation
//   SRC   sustained  — created, driven and released (core.js)

import { createEngine } from './core.js';
import { SFX as LAB } from './sfx.js';
import { AVIATION, AVIATION_IDS } from './aviation.js';
import { SRC, SRC_IDS } from './sources.js';

export const SFX = { ...LAB, ...AVIATION };
export const SFX_IDS = Object.keys(SFX);
export const LAB_IDS = Object.keys(LAB);
export { AVIATION_IDS, SRC, SRC_IDS, createEngine };

export function defaults(spec) {
  const o = {};
  for (const k in spec.params) o[k] = spec.params[k].def;
  return o;
}

// Fire a one-shot. Unknown id is a no-op, on purpose.
export function fire(eng, id, o = {}) {
  const s = SFX[id];
  if (!s) return false;
  const opts = defaults(s);
  Object.assign(opts, o);
  if (opts.t == null) opts.t = eng.ctx.currentTime + 0.02;
  s.play(eng, opts);
  return true;
}

// Open a sustained source. Returns NULL_SOURCE (a working no-op handle) if capped or unknown.
export function start(eng, id, o = {}) {
  return eng.source(id, o);
}

// Every engine gets the continuous defs registered on it the moment it is built.
export function createAudioEngine(ctx, opts = {}) {
  const eng = createEngine(ctx, opts);
  eng.sources.register(SRC);
  return eng;
}
