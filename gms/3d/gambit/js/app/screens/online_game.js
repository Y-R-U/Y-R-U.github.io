// Online (online agent): the online game screen, #/online/game/<id>.
//
// Same layout and classes as the bot game (screens/game.js: .g-stage, .pbar plates, clocks,
// .moves strip, .actions bar, results sheet), with server-authoritative play:
//  - your move: legal check in the local core, animate at once (optimistic), send to the
//    server; if it refuses, the game is resynced from the server snapshot (rollback).
//  - opponent's move: animated as it arrives; in timed games battles are capped at ~1.2 s
//    (D24) and default to 2x (D6), a tap skips. Clocks come from the server (net.clock()).
//  - resign / abort / draw offer+accept+decline / claim after the opponent left / rematch.
//  - no undo or hints online.
import { promotionPicker, h, esc, icon, toast, confirmDialog, openSheet } from '../ui.js';
import { getSettings, setSettings, onSettings } from '../store.js';
import { fmtClock } from '../clock.js';
import { play, playMove } from '../sound.js';
import { settingsPanel } from './settings.js';
import { installedThemes } from '../themes-meta.js';
import { acquire } from '../boardhost.js';
import { createReview, reviewNavHtml, movesHtml } from '../review.js';
import { CHEAT_WARNING } from '../net.js';
import { net, tcLabel, tcFull, ratingTxt, playerAvatar, handleError, nameOf, catName } from './online_common.js';

const GLYPH = { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚' };
const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const START_COUNT = { p: 8, n: 2, b: 2, r: 2, q: 1 };
const SPEEDS = ['off', 1, 2, 5];
const BATTLE_CAP_MS = 1200;   // D24: passed to applyMove as capMs (battles compress to fit)
const BATTLE_SKIP_MS = 1600;  // safety net: wall-clock skip if a battle overruns the cap
const REASON = {
  checkmate: 'by checkmate', stalemate: 'by stalemate', repetition: 'by threefold repetition',
  fifty: 'by the 50-move rule', material: 'by insufficient material', timeout: 'on time',
  resign: 'by resignation', agreement: 'by agreement', abandoned: 'opponent left the game', aborted: 'game aborted',
};

let app = null;
let O = null;                 // the shown game {id, g, chess, you, over, ...}
let lease = null, board = null;
let view = null;
const review = createReview({
  chess: () => O && O.chess, board: () => board,
  onExit: () => { syncBoard(); setInteractive(); },
  onChange: () => setInteractive(),
});

const otherC = c => (c === 'w' ? 'b' : 'w');
const battleOpts = v => ({ battle: !!v.captured, capMs: isTimed() ? BATTLE_CAP_MS : 0 });
const onlineSpeed = () => { const s = getSettings().onlineBattleSpeed; return s === undefined ? 2 : s; };
const isTimed = () => O && O.g && O.g.tc && O.g.tc.base > 0;
const uciOf = v => v.lan || (v.from + v.to + (v.promotion || ''));
const histUci = () => O.chess.history({ verbose: true }).map(uciOf);

// ---------- board (the shared board host: same WebGL board as the bot game / puzzles) ----------
function acquireBoard(container) {
  lease = acquire(container, {
    fen: O ? O.chess.fen() : undefined, orientation: O ? (O.flipped ? otherC(O.you) : O.you) : 'w',
    animSpeed: onlineSpeed(),
    legalMoves: sq => (myTurn() ? O.chess.moves({ square: sq, verbose: true }).map(m => m.to) : []),
    onMoveAttempt,
    onPromotion: ({ to, color }) => pickPromotion(color, to),
    onRevoke: () => { board = null; },
  });
  lease.on('view', ({ view: v }) => {
    if (getSettings().view !== v) { setSettings({ view: v }); toast(v === 'free' ? 'Free view: drag or pinch to look around' : `${viewLabel(v)} view`, { ms: 1200 }); }
    syncViewBtn();
  });
  // D24: timed online battles are compressed to 1.2 s via capMs; skip() is only a safety net
  lease.on('battlestart', () => {
    if (!isTimed()) return;
    clearTimeout(O && O.capT);
    const t = setTimeout(() => board && board.skip && board.skip(), BATTLE_SKIP_MS);
    if (O) O.capT = t;
  });
  lease.track(onSettings(applySettings));
  return lease.ready.then(b => { if (!b) return null; board = b; applySettings(getSettings(), null); return b; });
}
function applySettings(s, patch) {
  if (!board) return;
  const all = !patch;
  if (all || 'onlineBattleSpeed' in patch) board.setAnimSpeed && board.setAnimSpeed(onlineSpeed());
  if ((all || 'theme' in patch) && installedThemes(app.deps).includes(s.theme) && board.setTheme) {
    Promise.resolve(board.setTheme(s.theme)).catch(e => console.warn('[gambit] theme', e));
  }
  if ((all || 'view' in patch) && board.camera && board.camera.preset && board.camera.view !== s.view) board.camera.preset(s.view);
  if (all || 'coords' in patch) board.setCoords && board.setCoords(s.coords);
  syncSpeedBtn();
}
// ---------- state ----------
function makeState(g) {
  const { Chess } = app.deps.chess;
  const chess = new Chess();
  for (const u of g.moves || []) if (!chess.move(u)) { console.warn('[gambit] online: bad move from server', u); break; }
  return { id: g.id, g, chess, you: g.you, flipped: false, over: g.status !== 'playing', inflight: null,
    pending: false, lowWarned: false, capT: 0, result: null, shownResults: false, drawSent: -1 };
}
function myTurn() {
  return !!O && !O.over && !O.pending && !O.inflight && !review.on && O.chess.turn() === O.you && net.state === 'open';
}
function setInteractive() { if (board && O) board.setInteractive(!O.over && O.chess.turn() === O.you && !O.pending && !review.on ? O.you : null); }

// rebuild from the server snapshot when our view disagrees with it (rollback / missed moves)
function syncFrom(g, { animate = true } = {}) {
  if (!O || !g || g.id !== O.id) return;
  O.g = g;
  const local = histUci(), srv = g.moves || [];
  const prefix = local.length <= srv.length && local.every((u, i) => u === srv[i]);
  if (review.on) review.exit();
  if (prefix && local.length < srv.length) {
    for (const u of srv.slice(local.length)) { const v = O.chess.move(u); if (!v) { hardReset(g); break; } if (board) board.applyMove(v, battleOpts(v)); }
  } else if (!prefix || local.length !== srv.length) {
    const rolledBack = local.length > srv.length;
    hardReset(g, animate);
    if (rolledBack) toast('That move was not accepted', { kind: 'bad' });
  }
  if (g.status === 'ended' && !O.over) finish(g);
  renderAll(); setInteractive();
}
function hardReset(g, animate = true) {
  const { Chess } = app.deps.chess;
  O.chess = new Chess();
  for (const u of g.moves || []) if (!O.chess.move(u)) break;
  O.inflight = null;
  if (board) { board.setPosition(O.chess.fen(), { animate }); highlightLast(); }
}
function highlightLast() {
  if (!board || !O || review.on) return;
  const hist = O.chess.history({ verbose: true });
  const last = hist[hist.length - 1];
  let check = null;
  if (O.chess.inCheck()) check = O.chess.turn();
  board.highlight({ lastMove: last ? { from: last.from, to: last.to } : null, check, legalTargets: [] });
}

// ---------- moves ----------
function onMoveAttempt({ from, to, promotion }) {
  if (!myTurn()) return false;
  const legal = O.chess.moves({ square: from, verbose: true }).filter(m => m.to === to);
  if (!legal.length) return false;
  if (legal.some(m => m.promotion) && !promotion) {
    pickPromotion(O.you).then(pr => { if (pr && O) commitUserMove({ from, to, promotion: pr }); else syncBoard(); });
    return false;
  }
  if (getSettings().moveConfirm) {
    const san = (legal.find(m => !promotion || m.promotion === promotion) || legal[0]).san;
    const o = O;
    return askConfirm({ from, to, san }).then(ok => (ok && O === o && myTurn()) ? commitUserMove({ from, to, promotion }) : false);
  }
  return commitUserMove({ from, to, promotion });
}
function commitUserMove(m, sendAs = null) {
  const v = O.chess.move(m);
  if (!v) return false;
  const o = O, uci = sendAs || uciOf(v);
  O.inflight = uci;
  sfx(v);
  if (board) board.applyMove(v, battleOpts(v)).catch(() => {});
  renderAll(); setInteractive();
  net.move(o.id, uci).then(() => {
    if (O !== o) return;
    if (O.inflight === uci) O.inflight = null;
    setInteractive();
  }).catch(e => {
    if (O !== o) return;
    O.inflight = null;
    // net.js has resynced for illegal_move / stale_ply / game_over (a 'sync' follows); otherwise ask
    if (!['illegal_move', 'stale_ply', 'game_over'].includes(e.code)) {
      net.resync(o.id).then(g => syncFrom(g)).catch(() => { o.needSync = true; });
    }
    if (e.code === 'offline' || e.code === 'timeout') toast('Connection trouble: your move will be checked when you are back', { ms: 2600 });
  });
  return true;
}
function sfx(v) {
  playMove(v);   // audio agent
}
function onNetMove(ev) {
  if (!O || ev.gameId !== O.id) return;
  O.g = net.game(O.id) || O.g;
  const local = histUci();
  if (ev.mine) {
    // echo of our own move: the board already shows it
    if (local[ev.ply] !== ev.uci) syncFrom(O.g);
    if (O.inflight === ev.uci) O.inflight = null;
    renderAll(); setInteractive();
    return;
  }
  if (local.length !== ev.ply) { syncFrom(O.g); return; }
  const v = O.chess.move(ev.uci);
  if (!v) { syncFrom(O.g); return; }
  if (review.on) review.exit({ beforeLast: true });   // opponent moved: back to live, then animate it
  sfx(v);
  if (board) board.applyMove(v, battleOpts(v)).catch(() => {});
  if (O.drawOfferBanner) O.drawOfferBanner = false;
  renderAll(); setInteractive();
  if (navigator.vibrate && navigator.userActivation?.hasBeenActive && document.visibilityState === 'visible') { try { navigator.vibrate(15); } catch { /* ignore */ } }
}

// ---------- end ----------
function outcomeOf(g) {
  if (g.result === '1-0') return O.you === 'w' ? 'win' : 'loss';
  if (g.result === '0-1') return O.you === 'b' ? 'win' : 'loss';
  if (g.result === '1/2-1/2') return 'draw';
  return 'aborted';
}
function finish(g) {
  if (!O || O.over && O.result) return;
  O.over = true;
  O.g = g;
  O.result = { result: g.result, reason: g.reason, outcome: outcomeOf(g), ratings: g.ratings || null };
  clearTimeout(O.capT);
  setInteractive();
  play(O.result.outcome === 'win' ? 'win' : O.result.outcome === 'loss' ? 'lose' : 'draw');
  if (app.cloud && O.result.outcome !== 'aborted') app.cloud.matchFinished?.();
  net.myRatings().catch(() => {});
  renderAll();
  const o = O;
  setTimeout(() => { if (O === o && view) showResults(); }, g.reason === 'aborted' ? 0 : 700);
}
function showResults() {
  if (!O || !O.result) return;
  O.shownResults = true;
  const { outcome, reason, ratings } = O.result;
  const g = O.g, me = side(O.you), them = side(otherC(O.you));
  const title = outcome === 'aborted' ? 'Game aborted' : outcome === 'win' ? 'You won!' : outcome === 'loss' ? `${nameOf(them)} won` : 'Draw';
  const why = reason === 'abandoned' ? (outcome === 'win' ? 'opponent left the game' : 'you left the game') : REASON[reason] || '';
  const rc = ratings && ratings[O.you];
  const prov = net.ratings && net.ratings[g.cat] && net.ratings[g.cat].prov;
  const sh = openSheet(`<div class="results ${outcome === 'aborted' ? 'draw' : outcome}">
    <div class="res-head"><div class="res-badge">${outcome === 'win' ? icon('trophy') : outcome === 'loss' ? icon('flag') : outcome === 'aborted' ? icon('x') : icon('handshake')}</div>
      <h2>${title}</h2><p>${esc(why)}</p></div>
    <div class="res-vs">
      <div>${playerAvatar(me, { size: 'md', me: true })}<b>You</b></div>
      <span class="score">${outcome === 'aborted' ? '–' : outcome === 'win' ? '1–0' : outcome === 'loss' ? '0–1' : '½–½'}</span>
      <div>${playerAvatar(them, { size: 'md' })}<b>${nameOf(them)}</b></div>
    </div>
    ${rc ? `<div class="res-pts ol-res-pts">
      <div class="big"><small>${esc(catName(g.cat))} rating</small><b>${rc.after}${prov ? '?' : ''}</b><em class="${rc.delta >= 0 ? 'good' : 'bad'}">${rc.delta >= 0 ? '+' : ''}${rc.delta}</em></div>
      <div><small>Before</small><b>${rc.before}</b><em>&nbsp;</em></div>
      <div><small>Moves</small><b>${Math.ceil((g.moves || []).length / 2)}</b><em>&nbsp;</em></div>
    </div>${prov ? '<p class="res-next">? = provisional: your rating moves fast for the first few games.</p>' : ''}`
      : `<p class="res-next">${outcome === 'aborted' ? 'Aborted games don’t count against your daily games.' : g.rated ? '' : 'Casual game: ratings unchanged.'}</p>`}
    <div class="res-btns">${outcome === 'aborted' ? '' : rematchBtn()}
      <button class="btn btn-ghost" data-act="newopp">${icon('globe')} New game</button></div>
    <div class="res-links"><button class="link" data-close>View board</button><a class="link" href="#/online">Online</a><a class="link" href="#/home">Home</a></div>
    <p class="ol-res-warn">${esc(CHEAT_WARNING)}</p>
  </div>`);
  O.sheet = sh;
  sh.el.addEventListener('click', e => {
    const a = e.target.closest('[data-act]'); if (!a) return;
    if (a.dataset.act === 'rematch') doRematch(a);
    if (a.dataset.act === 'newopp') { sh.close(); newOpponent(); }
  });
}
function rematchBtn() {
  const r = (O.g && O.g.rematch) || {};
  if (O.rematchGone) return '<button class="btn btn-ghost" disabled>Rematch declined</button>';
  if (r.them && !r.you) return `<button class="btn btn-primary" data-act="rematch">${icon('rematch')} Accept rematch</button>`;
  if (r.you) return `<button class="btn btn-ghost" disabled>${icon('rematch')} Rematch sent…</button>`;
  return `<button class="btn btn-primary" data-act="rematch">${icon('rematch')} Rematch</button>`;
}
async function doRematch(btn) {
  if (!O) return;
  const r = (O.g && O.g.rematch) || {};
  if (btn) btn.disabled = true;
  try { if (r.them) await net.acceptRematch(O.id); else await net.offerRematch(O.id); refreshRematch(); }
  catch (e) { if (btn) btn.disabled = false; handleError(e); }
}
function refreshRematch() {
  if (!O) return;
  O.sheet?.el.querySelectorAll('[data-act="rematch"], .res-btns > button:disabled').forEach(b => { b.outerHTML = rematchBtn(); });
  renderActions();
}
function newOpponent() { app.go(`#/online/seek/${O.g.tc.id}`); }

// ---------- actions ----------
async function resign() {
  if (!O || O.over) return;
  const abort = (O.g.moves || []).length < 2;
  const ok = await confirmDialog(abort
    ? { title: 'Abort this game?', body: 'Not both sides have moved yet, so it won’t count and costs no daily game.', ok: 'Abort' }
    : { title: 'Resign?', body: `${nameOf(side(otherC(O.you)))} will be awarded the win.`, ok: 'Resign', danger: true });
  if (!ok || !O || O.over) return;
  try { if (abort) await net.abort(O.id); else await net.resign(O.id); } catch (e) { handleError(e); }
}
async function drawBtn() {
  if (!O || O.over) return;
  const g = O.g;
  if (g.drawOffer && g.drawOffer !== O.you) return acceptDraw();
  if ((g.moves || []).length < 2) { toast('Draws can be offered once both sides have moved'); return; }
  try { await net.offerDraw(O.id); O.drawSent = (g.moves || []).length; toast('Draw offered', { ms: 1400 }); renderActions(); }
  catch (e) { if (e.code === 'not_now') toast('You already offered a draw this move'); else handleError(e); }
}
async function acceptDraw() { try { await net.acceptDraw(O.id); } catch (e) { handleError(e); } }
async function declineDraw() { try { await net.declineDraw(O.id); O.g.drawOffer = ''; renderBanner(); renderActions(); } catch (e) { handleError(e); } }
async function claim(kind) { try { await net.claim(O.id, kind); } catch (e) { handleError(e); } }
function flip() { if (!O) return; O.flipped = !O.flipped; board && board.setOrientation(O.flipped ? otherC(O.you) : O.you); renderBars(); }
function cycleSpeed() {
  const s = onlineSpeed();
  const next = SPEEDS[(SPEEDS.findIndex(x => String(x) === String(s)) + 1) % SPEEDS.length];
  setSettings({ onlineBattleSpeed: next });
  toast(next === 'off' ? 'Battle animations off' : `Battle speed ${next}×${isTimed() ? ' (online battles stay short)' : ''}`, { ms: 1400 });
}
const VIEW_NAMES = { top: 'Top', tilt: 'Tilt', angle: '3D', free: 'Free' };
const viewLabel = v => VIEW_NAMES[v === 'default' ? 'tilt' : v] || 'Top';
function syncViewBtn() { const b = view && view.querySelector('[data-act="camera"] .lbl'); if (b) b.textContent = viewLabel(board?.camera?.view || getSettings().view); }
function cycleView() { if (board && board.camera) (board.camera.cycle || board.camera.reset).call(board.camera); }
const speedLabel = s => (s === 'off' ? 'Off' : `${s}×`);
function syncSpeedBtn() { const b = view && view.querySelector('[data-act="speed"] .lbl'); if (b) b.textContent = speedLabel(onlineSpeed()); }
function syncBoard() { if (board && O) { board.setPosition(O.chess.fen(), { animate: false }); highlightLast(); } }

// ---------- promotion / confirm (same look as the bot game) ----------
function pickPromotion(color, to = null) {
  const stage = view && view.querySelector('.board-square');
  if (!stage || !O) return Promise.resolve('q');
  O.pending = true; setInteractive();
  return promotionPicker(stage, { color, to, board }).then(p => { if (O) { O.pending = false; setInteractive(); } return p; });
}

function askConfirm(m) {
  return new Promise(resolve => {
    const stage = view && view.querySelector('.board-square');
    if (!stage || !O) { resolve(true); return; }
    O.pending = true; setInteractive();
    board && board.highlight({ hint: { from: m.from, to: m.to, arrow: false } });
    const o = h(`<div class="confirm-bar"><span>Play <b>${esc(m.san)}</b>?</span>
      <button class="btn btn-ghost btn-sm" data-c="0" aria-label="Cancel">${icon('x')}</button>
      <button class="btn btn-primary btn-sm" data-c="1" aria-label="Confirm">${icon('check')} Play</button></div>`);
    // ignore the click synthesized from the tap that opened the bar (touch: it lands on ✕ / Play) (qa)
    let downIn = false;
    o.addEventListener('pointerdown', () => { downIn = true; });
    o.addEventListener('click', e => {
      const b = downIn && e.target.closest('[data-c]'); if (!b) return;
      o.remove();
      if (O) { O.pending = false; board && board.highlight({ hint: null }); setInteractive(); }
      resolve(b.dataset.c === '1');
    });
    stage.appendChild(o);
  });
}

// ---------- rendering ----------
function side(c) { return (c === 'w' ? O.g.white : O.g.black) || {}; }
function captured(color) {
  const opp = otherC(color);
  const cnt = { p: 0, n: 0, b: 0, r: 0, q: 0 };
  let matW = 0, matB = 0;
  for (const row of O.chess.board()) for (const p of row || []) {
    if (!p) continue;
    if (p.color === opp && p.type in cnt) cnt[p.type]++;
    if (p.color === 'w') matW += VAL[p.type]; else matB += VAL[p.type];
  }
  const counts = {};
  for (const t of ['q', 'r', 'b', 'n', 'p']) { const n = Math.max(0, START_COUNT[t] - cnt[t]); if (n) counts[t] = n; }
  return { counts, adv: color === 'w' ? matW - matB : matB - matW, opp };
}
function fmtDeadline(ms) {
  if (ms <= 0) return '0:00';
  const m = Math.floor(ms / 60000);
  if (m >= 1440) return `${Math.floor(m / 1440)}d ${Math.floor((m % 1440) / 60)}h`;
  if (m >= 60) return `${Math.floor(m / 60)}h ${m % 60}m`;
  return fmtClock(ms);
}
function barHtml(c) {
  const p = side(c), mine = c === O.you;
  const cap = captured(c);
  const clk = net.clock(O.id) || {};
  const active = !O.over && clk.turn === c && (clk.running || (O.g.tc.base === 0 && (O.g.moves || []).length >= 2));
  const capHtml = Object.entries(cap.counts).map(([t, n]) => `<span>${GLYPH[t]}${n > 1 ? `<sub>${n}</sub>` : ''}</span>`).join('');
  const gone = !mine && O.g.opponentGone && !O.over;
  return `<div class="pbar ${mine ? 'me' : 'opp'}${active ? ' active' : ''}"><div class="pbar-plate">
    ${playerAvatar(p, { size: 'sm', me: mine })}
    <div class="pb-id">
      <div class="pb-name"><b>${mine ? 'You' : nameOf(p)}</b><span class="elo">${ratingTxt(p.rating, p.prov)}</span>${gone ? '<span class="tag ol-away">away</span>' : ''}</div>
      <div class="pb-cap"><span class="caps pc-${cap.opp}">${capHtml}</span>${cap.adv > 0 ? `<span class="adv">+${cap.adv}</span>` : ''}</div>
    </div>
    <div class="clock${active ? ' on' : ''}${O.g.tc.base ? '' : ' ol-corr'}" data-c="${c}">${clockText(c, clk)}</div>
  </div></div>`;
}
function clockText(c, clk) {
  if (O.g.tc.base) return fmtClock(clk[c] ?? O.g.tc.base);
  // Unlimited: time left to move for the side to move
  if (!O.over && clk.turn === c && clk.deadline) return fmtDeadline(clk.deadline - net.serverNow());
  return '∞';
}
function renderBars() {
  if (!view || !O) return;
  const bottom = O.flipped ? otherC(O.you) : O.you;
  view.querySelector('.bar-top').innerHTML = barHtml(otherC(bottom));
  view.querySelector('.bar-bottom').innerHTML = barHtml(bottom);
}
function renderMoves() {
  if (!view || !O) return;
  const hist = O.chess.history();
  let html = movesHtml(hist);
  if (O.over && O.result && O.result.outcome !== 'aborted') html += `<li class="res"><span>${String(O.result.result).replace('1/2-1/2', '½–½')}</span></li>`;
  const ol = view.querySelector('.moves');
  ol.innerHTML = html || `<li class="empty">${O.you === 'w' ? 'You play white — your move!' : `${nameOf(side('w'))} plays white…`}</li>`;
  const wrap = view.querySelector('.moves-wrap');
  if (review.on) review.sync();
  else requestAnimationFrame(() => { wrap.scrollLeft = wrap.scrollWidth; wrap.scrollTop = wrap.scrollHeight; review.sync(); });
}
function renderActions() {
  if (!view || !O) return;
  const bar = view.querySelector('.actions');
  const s = getSettings();
  if (O.over) {
    const r = (O.g.rematch) || {};
    bar.innerHTML = `
      <button class="act wide primary" data-act="results">${icon('trophy')}<span>Results</span></button>
      ${O.result && O.result.outcome !== 'aborted' ? `<button class="act wide${r.them && !r.you ? ' primary ol-pulse' : ''}" data-act="rematch"${r.you || O.rematchGone ? ' disabled' : ''}>${icon('rematch')}<span>${r.them && !r.you ? 'Accept rematch' : r.you ? 'Rematch sent' : 'Rematch'}</span></button>` : ''}
      <button class="act wide" data-act="newopp">${icon('globe')}<span>New game</span></button>
      <button class="act" data-act="flip">${icon('flip')}<span>Flip</span></button>`;
    return;
  }
  const n = (O.g.moves || []).length, abort = n < 2;
  const theyOffer = O.g.drawOffer && O.g.drawOffer !== O.you;
  const sent = O.g.drawOffer === O.you || O.drawSent === n;
  bar.innerHTML = `
    <button class="act" data-act="resign">${icon(abort ? 'x' : 'flag')}<span>${abort ? 'Abort' : 'Resign'}</span></button>
    <button class="act${theyOffer ? ' primary ol-pulse' : ''}" data-act="draw"${abort || (sent && !theyOffer) ? ' disabled' : ''}>${icon('handshake')}<span>${theyOffer ? 'Accept draw' : sent ? 'Offered' : 'Draw'}</span></button>
    <button class="act" data-act="flip">${icon('flip')}<span>Flip</span></button>
    <button class="act" data-act="camera" title="Cycle view (V)">${icon('camera')}<span class="lbl">${viewLabel(s.view)}</span></button>
    <button class="act" data-act="speed" title="Battle speed (online)">${icon('swords')}<span class="lbl">${speedLabel(onlineSpeed())}</span></button>`;
}
// banners over the board: draw offer, opponent away / claim, first-move timer, connection
function renderBanner() {
  if (!view || !O) return;
  const host = view.querySelector('.ol-banners');
  const g = O.g, clk = net.clock(O.id) || {};
  let html = '';
  if (net.state !== 'open') html += `<div class="ol-ban warn-b">${icon('globe')}<span>Reconnecting… your clock keeps running</span></div>`;
  if (!O.over) {
    if (g.drawOffer && g.drawOffer !== O.you) {
      html += `<div class="ol-ban offer">${icon('handshake')}<span><b>${nameOf(side(otherC(O.you)))}</b> offers a draw</span>
        <button class="btn btn-ghost btn-sm" data-act="decline">Decline</button><button class="btn btn-primary btn-sm" data-act="accept">Accept</button></div>`;
    }
    if (g.opponentGone) {
      const left = g.opponentGone.claimAt ? Math.ceil((g.opponentGone.claimAt - net.serverNow()) / 1000) : null;
      if (left == null) html += `<div class="ol-ban gone">${icon('user')}<span>Your opponent is away. They have until their move deadline.</span></div>`;
      else if (left > 0) html += `<div class="ol-ban gone">${icon('user')}<span>Opponent disconnected. You can claim the game in <b>${left}s</b> if they don’t return.</span></div>`;
      else html += `<div class="ol-ban gone">${icon('user')}<span>Opponent left.</span>
        <button class="btn btn-ghost btn-sm" data-act="claimdraw">Draw</button><button class="btn btn-primary btn-sm" data-act="claimwin">Claim win</button></div>`;
    }
    if (!clk.running && clk.deadlineAborts && clk.deadline && g.tc.base) {
      const s = Math.max(0, Math.ceil((clk.deadline - net.serverNow()) / 1000));
      html += clk.turn === O.you
        ? `<div class="ol-ban first">${icon('clock')}<span>Make your first move or the game is aborted · <b>${s}s</b></span></div>`
        : `<div class="ol-ban first quiet">${icon('clock')}<span>Waiting for ${nameOf(side(clk.turn))}’s first move · ${s}s</span></div>`;
    }
  }
  if (host.dataset.html !== html) { host.dataset.html = html; host.innerHTML = html; }
}
function renderAll() { renderBars(); renderMoves(); renderActions(); renderBanner(); }

function tick() {
  if (!O || !view) return;
  const clk = net.clock(O.id);
  if (!clk) return;
  for (const c of ['w', 'b']) {
    const el = view.querySelector(`.clock[data-c="${c}"]`);
    if (!el) continue;
    el.textContent = clockText(c, clk);
    if (O.g.tc.base) el.classList.toggle('low', (clk[c] ?? 1e9) < Math.min(20000, O.g.tc.base * 0.1 + 1));
  }
  const active = !O.over && clk.running ? clk.turn : null;
  for (const c of ['w', 'b']) {
    const el = view.querySelector(`.clock[data-c="${c}"]`);
    if (el && O.g.tc.base) { el.classList.toggle('on', active === c); el.closest('.pbar')?.classList.toggle('active', active === c); }
  }
  if (active === O.you && !O.lowWarned && O.g.tc.base >= 60000 && clk[O.you] < 10000) { O.lowWarned = true; play('lowtime'); }
  renderBanner();
}

// ---------- wake lock (main.js only holds one for the bot game route) ----------
let lock = null;
async function wake(on) {
  if (!('wakeLock' in navigator)) return;
  try {
    if (on && !lock && document.visibilityState === 'visible') { lock = await navigator.wakeLock.request('screen'); lock.addEventListener('release', () => { lock = null; }); }
    else if (!on && lock) { await lock.release(); lock = null; }
  } catch { lock = null; }
}

// ---------- mount ----------
export function mountGame(root, ctx, id) {
  app = ctx.app;
  const g = net.game(id);
  if (!g || g.status === 'unknown') {
    root.innerHTML = `<div class="ol-wait"><div class="ol-wait-card card"><div class="ol-offline">${icon('x')}<h3>This game is no longer available</h3>
      <p>It finished a while ago or it isn’t yours.</p><div class="ol-row"><a class="btn btn-primary" href="#/online">${icon('globe')} Online home</a></div></div></div></div>`;
    ctx.setTop({ title: 'Online game', back: '#/online' });
    return null;
  }
  if (!O || O.id !== id) { clearTimeout(O && O.capT); O = makeState(g); } else O.g = g;
  if (g.status === 'ended') { O.over = true; O.result = { result: g.result, reason: g.reason, outcome: outcomeOf(g), ratings: g.ratings || null }; O.shownResults = true; }

  const el = h(`<section class="screen game ol-game">
    <div class="g-stage"><div class="g-col">
      <div class="bar-top"></div>
      <div class="board-square"><div class="board-loading">Setting up the board…</div><div class="ol-banners"></div></div>
      <div class="bar-bottom"></div>
    </div></div>
    <aside class="g-panel"><div class="moves-box"><div class="moves-wrap"><ol class="moves"></ol></div>${reviewNavHtml()}</div><div class="actions"></div></aside>
  </section>`);
  root.replaceChildren(el);
  view = el;
  const o = O;
  const boardReady = acquireBoard(el.querySelector('.board-square'));
  const unbindReview = review.bind(el);
  renderAll();

  const opp = side(otherC(O.you));
  ctx.setTop({ title: `vs ${nameOf(opp)}`, sub: `Online · ${esc(tcFull(g.tc))} · ${g.rated ? 'Rated' : 'Casual'}`, back: '#/online' });
  ctx.canPester(() => !O || O.over);
  if (!getSettings().onlineWarnSeen) setSettings({ onlineWarnSeen: true });   // the Online home's cheat warning can collapse now
  app.openSettingsHere = () => {
    const sh = openSheet(`<div class="sheet-head"><h3>Settings</h3><button class="tb-btn" data-close aria-label="Close">${icon('x')}</button></div><div class="sheet-body"></div>`, { cls: 'sheet-tall' });
    sh.el.querySelector('.sheet-body').appendChild(settingsPanel(app, { compact: true }));
  };

  el.addEventListener('click', e => {
    const a = e.target.closest('[data-act]'); if (!a || a.disabled) return;
    play('tap');
    ({
      resign, draw: drawBtn, accept: acceptDraw, decline: declineDraw, claimwin: () => claim('win'), claimdraw: () => claim('draw'),
      flip, speed: cycleSpeed, camera: cycleView, results: showResults, rematch: () => doRematch(a), newopp: newOpponent,
    })[a.dataset.act]?.();
  });

  boardReady.then(b => {
    if (!b || O !== o || view !== el) return;
    el.querySelector('.board-loading')?.remove();
    board.setOrientation(O.flipped ? otherC(O.you) : O.you);
    board.setPosition(O.chess.fen(), { animate: false });
    highlightLast();
    board.resize && board.resize();
    setInteractive();
    if (O.over && !O.shownResults) showResults();
  }).catch(e => {
    console.error('[gambit] board failed', e);
    const l = el.querySelector('.board-loading'); if (l) l.textContent = 'The board could not load. Try reloading.';
  });

  const offs = [
    net.on('move', onNetMove),
    net.on('sync', ({ game }) => { if (O && game && game.id === O.id) syncFrom(game); }),
    net.on('welcome', () => { if (!O) return; const s = net.game(O.id); if (s) syncFrom(s); o.needSync = false; }),
    net.on('end', ev => { if (O && ev.gameId === O.id && ev.game) finish(ev.game); }),
    net.on('draw', ev => {
      if (!O || ev.gameId !== O.id) return;
      if (ev.action === 'offer' && !ev.mine) play('tap');   // the banner over the board says it
      if (ev.action === 'decline' && !ev.mine) toast('Draw declined', { ms: 1600 });
      renderActions(); renderBanner();
    }),
    net.on('opponent', ev => {
      if (!O || ev.gameId !== O.id) return;
      if (ev.status === 'back') toast(`${nameOf(side(otherC(O.you)))} is back`, { ms: 1600 });
      renderBars(); renderBanner();
    }),
    net.on('rematch', ev => {
      if (!O || ev.gameId !== O.id) return;
      if (ev.action === 'decline' && !ev.mine) { O.rematchGone = true; toast('Rematch declined', { ms: 1800 }); }
      if (ev.action === 'offer' && !ev.mine) { toast(`${nameOf(side(otherC(O.you)))} wants a rematch!`, { ms: 2200 }); if (!O.sheet || !document.body.contains(O.sheet.el)) showResults(); }
      refreshRematch();
    }),
    net.on('state', () => { renderBanner(); setInteractive(); }),
  ];
  const ticker = setInterval(tick, 100);
  const ro = new ResizeObserver(() => board && board.resize && board.resize());
  ro.observe(el.querySelector('.board-square'));
  const onVis = () => { if (document.visibilityState === 'visible') { wake(true); if (O && net.state === 'open') net.resync(O.id).then(s => syncFrom(s, { animate: false })).catch(() => {}); } };
  document.addEventListener('visibilitychange', onVis);
  wake(true);

  return {
    leave() {
      clearInterval(ticker); ro.disconnect(); offs.forEach(f => f());
      document.removeEventListener('visibilitychange', onVis);
      wake(false);
      app.openSettingsHere = null;
      unbindReview();
      clearTimeout(O && O.capT);
      if (lease) lease.release();
      lease = null; board = null;
      view = null;
      O && O.sheet && O.sheet.close();
      // the shared board stays alive (boardhost.js); only forget this game's view state
      setTimeout(() => { if (!location.hash.startsWith('#/online/game/')) O = null; }, 0);
    },
  };
}

// ---------- test hook (tools/online_cdp.mjs) ----------
window.__gambitOnlineTest = () => O && {
  ready: !!board && !!view, id: O.id, you: O.you, myTurn: myTurn(), over: O.over, plies: O.chess.history().length,
  srvPlies: (O.g.moves || []).length, result: O.result, fen: O.chess.fen(), drawOffer: O.g.drawOffer, opponentGone: O.g.opponentGone || null,
  clock: net.clock(O.id), boardAnimating: board && board.isAnimating && board.isAnimating(),
  play(uci) { const m = { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }; return onMoveAttempt(m); },
  playAny() { const ms = O.chess.moves({ verbose: true }); const m = ms[(Math.random() * ms.length) | 0]; return onMoveAttempt({ from: m.from, to: m.to, promotion: m.promotion }); },
  // a locally legal move shown optimistically but sent corrupted: proves the refusal + rollback path
  playRefused() { const m = O.chess.moves({ verbose: true })[0]; return myTurn() && commitUserMove({ from: m.from, to: m.to, promotion: m.promotion }, 'a1a1'); },
};
