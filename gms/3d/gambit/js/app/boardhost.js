// One shared 3D board for every screen (ui-2).
//
// Phones can't afford two WebGL contexts, so the bot game, the online game and puzzles all
// borrow the SAME createBoard() instance. The board lives in one persistent `.board-host` div;
// acquire() moves that div into the caller's container and resets everything a previous
// screen may have left behind (interactivity, handlers, highlights, arrows, tags, orientation,
// position, labels/keyboard options, pending animations). release() detaches it (the board is
// never disposed: theme + GPU resources stay warm for the next screen).
//
//   import { acquire } from '../app/boardhost.js';
//   const lease = acquire(container, {
//     fen, orientation: 'w', labels: true, animSpeed, legalMoves(sq), onMoveAttempt, onPromotion,
//     onRevoke() { board = null; },        // another screen took the board (optional)
//   });
//   lease.ready.then(b => { board = b; ... });   // resolves with the board, or null if revoked first
//   lease.on('view', fn);                        // board events, auto-unsubscribed on release
//   lease.track(onSettings(fn));                 // any other cleanup fn, run on release
//   lease.release();                             // in the screen's leave()
//
// Only one lease is live: acquiring revokes the previous one (its onRevoke runs).
// The board is created with the current settings (theme, coords, view) on first use.
import { deps } from './deps.js';
import { getSettings, onSettings } from './store.js';
import { attachBoard } from './sound.js';   // audio: lets move sounds land with the animation
import { attachCheckAlert } from './checkalert.js';   // checkalert: CHECK card + edge badge for every screen

let host = null, boardP = null, board = null, current = null;
const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function ensure() {
  if (!host) { host = document.createElement('div'); host.className = 'board-host'; }
  if (!boardP) {
    const s = getSettings();
    boardP = deps.board.createBoard(host, { theme: s.theme, coords: s.coords, view: s.view, animSpeed: s.battleSpeed, interactive: null, ambientAnim: s.ambientAnim !== false })
      .then(b => { board = b; attachBoard(b); try { attachCheckAlert(b, host); } catch (e) { console.warn('[gambit] check alert', e); } return b; })
      .catch(e => { boardP = null; throw e; });
  }
  return boardP;
}

function reset(b, o) {
  try { b.skip?.(); } catch { /* ignore */ }
  b.setInteractive(null);
  b.onMoveAttempt = o.onMoveAttempt || null;
  b.onPromotion = o.onPromotion || null;
  b.setOptions?.({ legalMoves: o.legalMoves || null, labels: o.labels !== false, keyboard: o.keyboard !== false, autoHighlight: o.autoHighlight !== false });
  b.hideLabel?.();
  b.setOrientation(o.orientation === 'b' ? 'b' : 'w');
  b.setPosition(o.fen || START, { animate: false });
  b.highlight({ lastMove: null, check: null, hint: null, legalTargets: [] });
  b.showArrows?.([]);
  if (o.animSpeed !== undefined) b.setAnimSpeed?.(o.animSpeed);
  b.resize?.();
}

export function acquire(container, opts = {}) {
  if (current) current._revoke();
  ensure();
  container.appendChild(host);
  const offs = [];
  let live = true;
  const lease = {
    get live() { return live; },
    get board() { return live ? board : null; },
    host,
    ready: null,
    on(ev, fn) { const p = boardP.then(b => { if (live && b.on) offs.push(b.on(ev, fn)); }).catch(() => {}); void p; return lease; },
    track(fn) { if (typeof fn === 'function') offs.push(fn); return lease; },
    release() {
      if (!live) return;
      live = false;
      if (current === lease) current = null;
      offs.splice(0).forEach(f => { try { f(); } catch { /* ignore */ } });
      if (board) {
        board.setInteractive(null);
        board.onMoveAttempt = null; board.onPromotion = null;
        board.setOptions?.({ legalMoves: null, keyboard: false });
        board.hideLabel?.();
        try { board.skip?.(); } catch { /* ignore */ }
      }
      if (host.parentNode === container) host.remove();
    },
    _revoke() { lease.release(); try { opts.onRevoke && opts.onRevoke(); } catch (e) { console.warn(e); } },
  };
  current = lease;
  lease.ready = boardP.then(b => { if (!live) return null; reset(b, opts); return b; });
  return lease;
}

// Board-wide settings that no single screen owns: follow them for every screen (qa / ui-3).
onSettings((s, patch) => {
  if (board && patch && 'ambientAnim' in patch) board.setOptions?.({ ambientAnim: s.ambientAnim !== false });
});

/** The shared board if it exists (tests / devtools). */
export function sharedBoard() { return board; }
