// The turn hand-off: C7 → C6 — C7 owns this file, C6 owns everything it calls.
//
// C6's `js/cine/sequences.js` publishes the real presenter onto `hook.cine` (present / resolve /
// fastForward / skip / toBridge / opening). This file is the adapter that hands it a redacted event
// list and the pace, plus a table-only fallback for when it is not there — a half-landed cinematic
// must cost a camera move, never a turn.
//
// The caption is C6's too (D2, `caption.forShot`). C7 must not reimplement it and does not: the
// caption object goes through this call and nothing here writes the element.

import { PACE } from '../config.js';

export function createPresenter({ hook, getTable, settings }) {
  const cine = () => hook.cine || {};

  function paceFor(turns) {
    const s = settings().cine;
    if (s === 'off') return 'instant';
    if (s === 'full') return 'full';
    let mode = 'full';
    for (const [name, cfg] of Object.entries(PACE)) if (cfg.fromTurn && turns >= cfg.fromTurn) mode = name;
    return mode;
  }

  const wait = ms => new Promise(r => setTimeout(r, ms));

  // Used only when C6's presenter is absent. Enough to read the result off the table and know the
  // enemy fired at you; no camera work at all.
  async function fallback(events, by, pace) {
    const t = getTable();
    const fleet = hook.world?.fleet;
    let hit = false;
    for (const e of events) {
      if (e.t !== 'result' || e.repeat) continue;
      hit = hit || e.hit;
      try { t?.pulse?.(e.r, e.c, e.hit ? 'hit' : 'miss'); } catch {}
      if (by === 1 && e.hit) { try { fleet?.mark?.(0, e.r, e.c, 'hit'); } catch {} }
    }
    await wait(pace === 'instant' ? 300 : hit ? 700 : 500);
  }

  return {
    pace: paceFor,

    async play(events, by, game) {
      const c = cine();
      const pace = paceFor(game.turns);
      if (typeof c.present === 'function') {
        await c.present(events, { mySide: 0, turn: game.turns, caption: hook.ui?.caption, pace });
        return;
      }
      await fallback(events, by, pace);
    },

    // Hold anywhere to fast-forward (BUILD_PLAN §7.4). Not a skip: the result still lands.
    rate(x) {
      const c = cine();
      try { if (typeof c.fastForward === 'function') c.fastForward(x > 1); else c.director?.setRate(x); } catch {}
    },

    skip() { try { cine().skip?.(); } catch {} },

    // The opening flyover, then the settle the loop rests at. Both are C6's; a missing sequence
    // resolves immediately rather than stalling the match. A resumed match asks for the settle
    // alone — the flyover is six seconds of arriving somewhere you have already been.
    async open(flyover = true) {
      const c = cine();
      try {
        if (flyover && settings().cine !== 'off' && typeof c.opening === 'function') await c.opening();
        if (typeof c.toBridge === 'function') await c.toBridge();
        return true;
      } catch { return false; }
    },

    reset() { try { hook.ui?.caption?.reset(); } catch {} },
  };
}
