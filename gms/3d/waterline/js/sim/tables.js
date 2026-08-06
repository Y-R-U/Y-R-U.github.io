// The sim's copy of the tables it reads out of js/config.js, taken once at import and frozen.
//
// config.js's exports are plain mutable objects shared with the whole renderer, and the sim used
// to read them live: `BOARD.placeTries = 0` from any component changed placement, and
// `ORDNANCE.salvo.offsets` changed the rules mid-match. Nothing under js/sim/ imports config.js
// any more — this file is the only door, and what comes through it cannot be written to.
//
// Deliberately NOT `Object.freeze` on config.js's own exports: an ES module is strict, so a
// component's assignment would throw rather than be ignored, and config.js is not mine to change
// the failure mode of. Snapshotting makes the sim immune either way, which is the property that
// matters.

import { BOARD as SRC_BOARD, ORDNANCE as SRC_ORDNANCE, AI as SRC_AI } from '../config.js';

export const BOARD = Object.freeze({ ...SRC_BOARD });

export const ORDNANCE = Object.freeze(Object.fromEntries(
  Object.entries(SRC_ORDNANCE).map(([kind, o]) => [kind, Object.freeze({
    size: o.size,
    anchorInset: Object.freeze([...o.anchorInset]),
    offsets: Object.freeze(o.offsets.map(pair => Object.freeze([...pair]))),
    charges: o.charges,
    recharge: o.recharge,
  })]),
));

export const AI = Object.freeze([...SRC_AI]);
