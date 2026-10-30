// Game screen + bot-game controller.
//
// Flow: startNewGame() (or a stored resume) -> render() mounts the layout and
// the persistent board host -> moves go through doMove(), which banks the
// mover's clock, awaits the board animation (incl. battle), THEN starts the
// next player's clock (D6). Leaving the screen suspends the game into the
// local-only resume slot; coming back rebuilds it from there.
import { h, $, $$, esc, icon, avatar, toast, confirmDialog, openSheet, fmtInt } from '../ui.js';
import { getSettings, setSettings, onSettings, getResume, setResume, clearResume, getLadder } from '../store.js';
import { GameClock, fmtClock, parseTc } from '../clock.js';
import { recordGame, playerRank } from '../ladder.js';
import { play } from '../sound.js';
import { settingsPanel } from './settings.js';
import { installedThemes } from '../themes-meta.js';

export const ROUTE = 'game';
const GLYPH = { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚' };
const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const START_COUNT = { p: 8, n: 2, b: 2, r: 2, q: 1 };
const SPEEDS = ['off', 1, 2, 5];
const REASON = {
  checkmate: 'by checkmate', stalemate: 'by stalemate', repetition: 'by threefold repetition',
  fifty: 'by the 50-move rule', material: 'by insufficient material', timeout: 'on time',
  resign: 'by resignation', agreement: 'by agreement', 'timeout-material': 'timeout vs insufficient material',
  abort: 'game aborted',
};

let app = null;
let G = null;               // the live game (null when none is loaded)
let boardHost = null, board = null, boardPromise = null;
let view = null;            // the mounted screen element (null when off-screen)
let ticker = null;

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const lanHistory = g => g.chess.history({ verbose: true }).map(m => m.lan || (m.from + m.to + (m.promotion || '')));

export function isActive() { return !!G && !G.over; }

// ---------- game lifecycle ----------
export function startNewGame({ botId, tc, color }) {
  app = app || window.__gambit;
  suspend(false);
  G = makeGame({ botId, tc, color, moves: [], clocks: null, assisted: false, startedAt: Date.now() });
  G.fresh = true;
}

function makeGame(r) {
  const { Chess } = app.deps.chess;
  const bot = app.deps.bots.BOTS.find(b => b.id === r.botId);
  if (!bot) return null;
  const chess = new Chess();
  for (const m of r.moves || []) if (!chess.move(m)) { console.warn('[gambit] resume: bad move', m); break; }
  const tcInfo = parseTc(r.tc);
  const clock = new GameClock(tcInfo);
  if (r.clocks) clock.set(r.clocks.w, r.clocks.b);
  return {
    bot, tc: r.tc, tcInfo, color: r.color, botColor: r.color === 'w' ? 'b' : 'w',
    chess, clock, assisted: !!r.assisted, startedAt: r.startedAt || Date.now(),
    drawOfferPly: r.drawOfferPly ?? -99, hintUsed: !!r.hintUsed, undoWarned: !!r.undoWarned,
    gen: 0, thinking: false, animating: false, over: false, flipped: false, botImpl: null, lowWarned: false,
  };
}

function saveResume() {
  if (!G || G.over) return;
  setResume({
    botId: G.bot.id, tc: G.tc, color: G.color,
    moves: lanHistory(G),
    clocks: { w: G.clock.remaining('w'), b: G.clock.remaining('b') },
    assisted: G.assisted, startedAt: G.startedAt, drawOfferPly: G.drawOfferPly, hintUsed: G.hintUsed, undoWarned: G.undoWarned,
  });
}

// Leave the screen: stop clocks and any pending bot think, keep a resume.
function suspend(keep = true) {
  if (!G) return;
  G.gen++;
  G.clock.stop();
  try { G.botImpl && G.botImpl.dispose(); } catch { /* ignore */ }
  G.botImpl = null;
  if (keep && !G.over) saveResume();
  G = null;
}

// ---------- board ----------
function ensureBoard() {
  if (!boardHost) boardHost = h('<div class="board-host"></div>');
  if (!boardPromise) {
    const s = getSettings();
    boardPromise = app.deps.board.createBoard(boardHost, {
      fen: G ? G.chess.fen() : undefined,
      orientation: G ? G.color : 'w',
      theme: s.theme, coords: s.coords, animSpeed: s.battleSpeed, view: s.view,
      legalMoves: sq => (G && !G.over && G.chess.turn() === G.color && !G.animating)
        ? G.chess.moves({ square: sq, verbose: true }).map(m => m.to) : [],
    }).then(b => {
      board = b;
      board.onMoveAttempt = onMoveAttempt;
      // the board asks for the piece before calling onMoveAttempt (picker drawn over the board)
      board.onPromotion = ({ color }) => pickPromotion(color);
      applySettingsToBoard(getSettings(), null);
      onSettings(applySettingsToBoard);
      return b;
    });
  }
  return boardPromise;
}

function applySettingsToBoard(s, patch) {
  if (!board) return;
  const all = !patch;
  if (all || 'battleSpeed' in patch) board.setAnimSpeed && board.setAnimSpeed(s.battleSpeed);
  if (all || 'theme' in patch) {
    const ok = installedThemes(app.deps).includes(s.theme);
    if (ok && board.setTheme) Promise.resolve(board.setTheme(s.theme)).catch(e => console.warn('[gambit] theme', e));
  }
  if ((all || 'view' in patch) && board.camera && board.camera.preset) board.camera.preset(s.view);
  if (all || 'coords' in patch) {
    if (board.setCoords) board.setCoords(s.coords);
    else if (board.setOptions) board.setOptions({ coords: s.coords });
  }
  if (view) syncSpeedBtn();
}

function syncBoard() {
  if (!board || !G) return;
  board.setOrientation(G.flipped ? G.botColor : G.color);
  board.setPosition(G.chess.fen(), { animate: false });
  syncHighlights();
}

function syncHighlights(extra = {}) {
  if (!board || !G) return;
  const hist = G.chess.history({ verbose: true });
  const last = hist[hist.length - 1];
  let check = null;
  if (G.chess.inCheck()) {
    const turn = G.chess.turn();
    for (const row of G.chess.board()) for (const p of row || []) {
      if (p && p.type === 'k' && p.color === turn) check = p.square;
    }
    if (!check) check = findKing(turn);
  }
  board.highlight({ lastMove: last ? { from: last.from, to: last.to } : null, check, legalTargets: [], ...extra });
  if (!extra.hint && board.showArrows) board.showArrows([]);
}
function findKing(color) {
  const b = G.chess.board();
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
    const p = b[r][f];
    if (p && p.type === 'k' && p.color === color) return 'abcdefgh'[f] + (8 - r);
  }
  return null;
}

function setInteractive() {
  if (!board || !G) return;
  const mine = !G.over && !G.animating && !G.thinking && G.chess.turn() === G.color && !G.pending;
  board.setInteractive(mine ? G.color : null);
}

// ---------- moves ----------
function onMoveAttempt({ from, to, promotion }) {
  if (!G || G.over || G.animating || G.chess.turn() !== G.color || G.pending) return false;
  const legal = G.chess.moves({ square: from, verbose: true }).filter(m => m.to === to);
  if (!legal.length) return false;
  if (legal.some(m => m.promotion) && !promotion) {
    // shim board (no onPromotion support): pick, then apply ourselves
    pickPromotion(G.color).then(pr => { if (pr && G) commitUserMove({ from, to, promotion: pr }); else syncBoard(); });
    return false;
  }
  if (getSettings().moveConfirm) {
    const san = (legal.find(m => !promotion || m.promotion === promotion) || legal[0]).san;
    const g = G;
    // async: the board keeps the piece where it was dropped until we answer
    return askConfirm({ from, to, san }).then(ok => (ok && G === g && !g.over) ? commitUserMove({ from, to, promotion }) : false);
  }
  return commitUserMove({ from, to, promotion });
}

function commitUserMove(m) {
  const v = G.chess.move(m);
  if (!v) return false;
  if (G.hintShown) { G.hintShown = false; }
  doMove(v, G.color, { user: true }).catch(e => console.error('[gambit] move', e));
  return true;
}

async function doMove(v, mover, { user = false } = {}) {
  const g = G, gen = g.gen;
  g.clock.press(mover);
  g.animating = true;
  setInteractive();
  play(v.san && v.san.includes('#') ? 'check' : v.captured ? 'capture' : v.san && v.san.includes('+') ? 'check' : v.flags && /[kq]/.test(v.flags) ? 'castle' : 'move');
  renderAll();
  saveResume();
  try {
    if (board) await board.applyMove(v, { battle: !!v.captured, user });
  } catch (e) { console.warn('[gambit] applyMove', e); syncBoard(); }
  if (G !== g || gen !== g.gen) return;
  g.animating = false;
  syncHighlights();
  if (g.chess.isGameOver()) { const o = g.chess.outcome(); finish(o.result, o.reason); return; }
  nextTurn();
}

function nextTurn() {
  if (!G || G.over) return;
  const turn = G.chess.turn();
  // D6: the side to move's clock only starts once the previous animation is done.
  // White's very first move is untimed (as on most sites).
  if (G.chess.history().length >= 1) G.clock.start(turn);
  renderBars();
  if (turn === G.botColor) botTurn(); else setInteractive();
}

async function botTurn() {
  const g = G, gen = g.gen;
  if (!g.botImpl) g.botImpl = app.deps.bots.createBot(g.bot.id);
  g.thinking = true; renderBars(); setInteractive();
  let res = null;
  try {
    res = await g.botImpl.think(g.chess.fen(), {
      startFen: START_FEN, moves: lanHistory(g),
      timeLeftMs: g.tcInfo.baseMs ? g.clock.remaining(g.botColor) : undefined,
      incMs: g.tcInfo.incMs, unlimited: !g.tcInfo.baseMs,
    });
  } catch (e) { console.warn('[gambit] bot think failed', e); }
  if (G !== g || gen !== g.gen || g.over) return;
  g.thinking = false;
  let mv = res && (res.move || res.lan || res.bestmove);
  let v = mv ? g.chess.move(typeof mv === 'string' ? mv : mv) : null;
  if (!v) {
    const all = g.chess.moves({ verbose: true });
    if (!all.length) return;
    console.warn('[gambit] bot returned an unusable move', res);
    v = g.chess.move(all[(Math.random() * all.length) | 0]);
  }
  await doMove(v, g.botColor);
}

// ---------- clocks ----------
function tick() {
  if (!G || !view) return;
  for (const c of ['w', 'b']) {
    const el = view.querySelector(`.clock[data-c="${c}"]`);
    if (!el || G.tcInfo.unlimited) continue;
    const ms = G.clock.remaining(c);
    el.textContent = fmtClock(ms);
    el.classList.toggle('low', ms < Math.min(20000, G.tcInfo.baseMs * 0.1 + 1));
  }
  if (G.over || G.tcInfo.unlimited) return;
  const run = G.clock.running;
  if (run && G.clock.remaining(run) <= 0) {
    G.clock.stop();
    G.clock.ms[run] = 0;
    // flag vs a side that can't mate = draw
    const other = run === 'w' ? 'b' : 'w';
    const canMate = sideCanMate(other);
    finish(canMate ? (other === 'w' ? '1-0' : '0-1') : '1/2-1/2', canMate ? 'timeout' : 'timeout-material');
    return;
  }
  if (run === G.color && !G.lowWarned && G.tcInfo.baseMs >= 60000 && G.clock.remaining(run) < 10000) { G.lowWarned = true; play('lowtime'); }
}
function sideCanMate(color) {
  const ps = [];
  for (const row of G.chess.board()) for (const p of row || []) if (p && p.color === color && p.type !== 'k') ps.push(p.type);
  if (!ps.length) return false;
  if (ps.length === 1 && (ps[0] === 'n' || ps[0] === 'b')) return false;
  return true;
}

// ---------- finishing ----------
function finish(result, reason) {
  const g = G;
  if (!g || g.over) return;
  g.over = true; g.gen++;
  g.clock.stop();
  g.thinking = false;
  try { g.botImpl && g.botImpl.stop(); } catch { /* ignore */ }
  clearResume();
  setInteractive();
  const plies = g.chess.history().length;
  let outcome = 'draw';
  if (result === '1-0') outcome = g.color === 'w' ? 'win' : 'loss';
  else if (result === '0-1') outcome = g.color === 'b' ? 'win' : 'loss';
  g.result = { result, reason, outcome };
  if (reason === 'abort') { g.record = null; }
  else g.record = recordGame({ bot: g.bot, result: outcome, assisted: g.assisted, reason, tc: g.tc, color: g.color, moves: plies });
  play(outcome === 'win' ? 'win' : outcome === 'loss' ? 'lose' : 'draw');
  if (app.cloud && reason !== 'abort') app.cloud.matchFinished();
  renderAll();
  setTimeout(() => { if (G === g && view) showResults(); }, reason === 'abort' ? 0 : 650);
}

function showResults() {
  const g = G; if (!g || !g.result) return;
  const { outcome, reason } = g.result;
  const r = g.record;
  const title = reason === 'abort' ? 'Game aborted' : outcome === 'win' ? 'You won!' : outcome === 'loss' ? `${esc(g.bot.name)} won` : 'Draw';
  const sheet = openSheet(`<div class="results ${outcome}">
    <div class="res-head">
      <div class="res-badge">${outcome === 'win' ? icon('trophy') : outcome === 'loss' ? icon('flag') : icon('handshake')}</div>
      <h2>${title}</h2><p>${REASON[reason] || ''}</p>
    </div>
    <div class="res-vs">
      <div>${avatar('lion', { label: 'You', size: 'md' })}<b>You</b></div>
      <span class="score">${g.result.result.replace('1/2-1/2', '½–½').replace('-', '–')}</span>
      <div>${avatar(g.bot.avatar, { label: g.bot.name, size: 'md', hue: botHue(g.bot) })}<b>${esc(g.bot.name)}</b></div>
    </div>
    ${r ? `<div class="res-pts">
      <div class="big"><small>Ladder points</small><b>+${fmtInt(r.pts)}</b>${g.assisted ? '<em>halved: takeback/hint used</em>' : ''}</div>
      <div><small>Rank</small><b>#${r.rankAfter}</b>${r.rankAfter < r.rankBefore ? `<em class="good">▲ ${r.rankBefore - r.rankAfter}</em>` : '<em>&nbsp;</em>'}</div>
      <div><small>Ladder Elo</small><b>${r.eloAfter}</b><em class="${r.eloAfter >= r.eloBefore ? 'good' : 'bad'}">${r.eloAfter >= r.eloBefore ? '+' : ''}${r.eloAfter - r.eloBefore}</em></div>
    </div>
    ${r.newBest ? `<p class="res-note">${icon('trophy')} New best win!</p>` : ''}
    ${r.next ? `<p class="res-next">Next up: <b>${esc(r.next.name)}</b> — ${fmtInt(r.next.score - r.total + 1)} pts to pass</p>` : '<p class="res-next">You are top of the ladder. Legendary.</p>'}` : ''}
    <div class="res-btns">
      <button class="btn btn-primary" data-act="rematch">${icon('rematch')} Rematch</button>
      <button class="btn btn-ghost" data-act="newbot">${icon('robot')} New bot</button>
    </div>
    <div class="res-links"><button class="link" data-close>View board</button><a class="link" href="#/ladder">Ladder</a><a class="link" href="#/home">Home</a></div>
  </div>`, {});
  sheet.el.addEventListener('click', e => {
    const a = e.target.closest('[data-act]'); if (!a) return;
    sheet.close();
    if (a.dataset.act === 'rematch') rematch();
    if (a.dataset.act === 'newbot') app.go('#/play/bot');
  });
}

function rematch() {
  if (!G) return;
  const { bot, tc, color } = G;
  startNewGame({ botId: bot.id, tc, color: color === 'w' ? 'b' : 'w' });
  app.go('#/game');
}

// ---------- actions ----------
async function resign() {
  if (!G || G.over) return;
  const abort = G.chess.history().length < 2;
  const ok = await confirmDialog(abort
    ? { title: 'Abort this game?', body: 'No moves have been played by both sides yet, so it won’t count.', ok: 'Abort' }
    : { title: 'Resign?', body: `${esc(G.bot.name)} will be awarded the win.`, ok: 'Resign', danger: true });
  if (!ok || !G || G.over) return;
  if (abort) finish('*', 'abort');
  else finish(G.color === 'w' ? '0-1' : '1-0', 'resign');
}

async function offerDraw() {
  if (!G || G.over) return;
  const g = G, ply = g.chess.history().length;
  if (ply - g.drawOfferPly < 10) { toast(`${g.bot.name} just turned down a draw. Try again later`); return; }
  g.drawOfferPly = ply;
  saveResume();
  toast(`You offered ${g.bot.name} a draw…`, { ms: 1200 });
  // Bot's view of the position in pawns: engine eval when available, else material.
  let mat = 0;
  for (const row of g.chess.board()) for (const p of row || []) if (p) mat += (p.color === g.botColor ? 1 : -1) * VAL[p.type];
  let ev = mat;
  try {
    const r = await Promise.race([app.deps.bots.hint(g.chess.fen(), 400, { startFen: START_FEN, moves: lanHistory(g) }), new Promise(res => setTimeout(() => res(null), 2500))]);
    if (r && typeof r.score === 'number') {
      const stm = r.mate ? Math.sign(r.mate) * 99 : r.score / 100;
      ev = g.chess.turn() === g.botColor ? stm : -stm;
    }
  } catch { /* material fallback */ }
  if (G !== g || g.over) return;
  const lad = getLadder();
  // Weaker bots are happy to split the point; strong bots play on unless they are worse.
  let accept;
  if (ply < 30) accept = false;
  else if (ev >= 1.5) accept = false;
  else if (ev <= -2) accept = true;
  else accept = (ev <= 0.3 && g.bot.elo < lad.elo - 100) || (ply > 80 && Math.abs(ev) <= 0.5);
  if (accept) { toast(`${g.bot.name} accepts the draw`); finish('1/2-1/2', 'agreement'); }
  else toast(ply < 30 ? `${g.bot.name}: “Too early for that. Let’s play on!”` : ev >= 1.5 ? `${g.bot.name} declines. They like their position` : `${g.bot.name} declines the draw`, { ms: 2600 });
}

async function undo() {
  if (!G || G.over) return;
  const hist = G.chess.history().length;
  if (hist === 0 || (hist === 1 && G.chess.turn() === G.color)) { toast('Nothing to take back'); return; }
  if (!G.undoWarned && !G.assisted) {
    const ok = await confirmDialog({ title: 'Take back your move?', body: 'Using takebacks or hints <b>halves the ladder points</b> for this game and it won’t count as a best win.', ok: 'Take back' });
    if (!ok || !G || G.over) return;
  }
  G.undoWarned = true;
  G.assisted = true;
  G.gen++; G.thinking = false;
  try { G.botImpl && G.botImpl.stop(); } catch { /* ignore */ }
  G.clock.stop();
  // undo back to the player's turn
  G.chess.undo();
  if (G.chess.turn() !== G.color && G.chess.history().length) G.chess.undo();
  if (G.chess.turn() !== G.color) { /* player is black and only bot's first move remained */ }
  G.animating = false;
  syncBoard();
  renderAll();
  saveResume();
  nextTurn();
}

async function showHint() {
  if (!G || G.over || G.chess.turn() !== G.color || G.animating) { toast('Hints are for your turn'); return; }
  if (!G.hintUsed && !G.assisted) {
    const ok = await confirmDialog({ title: 'Show a hint?', body: 'Using hints or takebacks <b>halves the ladder points</b> for this game.', ok: 'Show hint' });
    if (!ok || !G) return;
  }
  G.hintUsed = true; G.assisted = true; saveResume(); renderBars();
  const g = G;
  const btn = view && view.querySelector('[data-act="hint"]');
  btn && btn.classList.add('busy');
  let res = null;
  try { res = await app.deps.bots.hint(g.chess.fen(), 900, { startFen: START_FEN, moves: lanHistory(g) }); } catch (e) { console.warn(e); }
  btn && btn.classList.remove('busy');
  if (G !== g) return;
  const mv = res && (typeof res === 'string' ? res : res.move);
  if (!mv) { toast('No hint available'); return; }
  const from = mv.slice(0, 2), to = mv.slice(2, 4);
  syncHighlights({ hint: { from, to } });
  toast('Hint: the highlighted move');
}

function flip() {
  if (!G) return;
  G.flipped = !G.flipped;
  board && board.setOrientation(G.flipped ? G.botColor : G.color);
  renderBars();
}

function cycleSpeed() {
  const s = getSettings().battleSpeed;
  const next = SPEEDS[(SPEEDS.findIndex(x => String(x) === String(s)) + 1) % SPEEDS.length];
  setSettings({ battleSpeed: next });
  toast(next === 'off' ? 'Battle animations off' : `Battle speed ${next}×`, { ms: 1200 });
}
function speedLabel(s) { return s === 'off' ? 'Off' : `${s}×`; }
function syncSpeedBtn() {
  const b = view && view.querySelector('[data-act="speed"] .lbl');
  if (b) b.textContent = speedLabel(getSettings().battleSpeed);
}

// ---------- promotion / confirm ----------
function pickPromotion(color) {
  return new Promise(resolve => {
    const stage = view && view.querySelector('.board-square');
    if (!stage) { resolve('q'); return; }
    G.pending = true; setInteractive();
    const o = h(`<div class="promo" role="dialog" aria-label="Promote to">
      <div class="promo-card"><small>Promote to</small><div class="promo-row">
      ${['q', 'r', 'b', 'n'].map(p => `<button data-p="${p}" class="pc-${color}" aria-label="${{ q: 'Queen', r: 'Rook', b: 'Bishop', n: 'Knight' }[p]}">${GLYPH[p]}</button>`).join('')}
      </div><button class="link" data-p="">Cancel</button></div></div>`);
    o.addEventListener('click', e => {
      const b = e.target.closest('[data-p]'); if (!b) return;
      o.remove(); if (G) G.pending = false; resolve(b.dataset.p || null);
    });
    stage.appendChild(o);
  });
}

function askConfirm(m) {
  return new Promise(resolve => {
    const stage = view && view.querySelector('.board-square');
    if (!stage) { resolve(true); return; }
    G.pending = true; setInteractive();
    syncHighlights({ hint: { from: m.from, to: m.to, arrow: false } });
    const o = h(`<div class="confirm-bar"><span>Play <b>${esc(m.san)}</b>?</span>
      <button class="btn btn-ghost btn-sm" data-c="0" aria-label="Cancel">${icon('x')}</button>
      <button class="btn btn-primary btn-sm" data-c="1" aria-label="Confirm">${icon('check')} Play</button></div>`);
    o.addEventListener('click', e => {
      const b = e.target.closest('[data-c]'); if (!b) return;
      o.remove();
      if (G) { G.pending = false; syncHighlights(); setInteractive(); }
      resolve(b.dataset.c === '1');
    });
    stage.appendChild(o);
  });
}

// ---------- rendering ----------
function captured(color) {
  // pieces of `color`'s opponent that are missing = what `color` has captured
  const opp = color === 'w' ? 'b' : 'w';
  const cnt = { p: 0, n: 0, b: 0, r: 0, q: 0 };
  let matW = 0, matB = 0;
  for (const row of G.chess.board()) for (const p of row || []) {
    if (!p) continue;
    if (p.color === opp && p.type in cnt) cnt[p.type]++;
    if (p.color === 'w') matW += VAL[p.type]; else matB += VAL[p.type];
  }
  const list = [];
  for (const t of ['q', 'r', 'b', 'n', 'p']) for (let i = 0; i < Math.max(0, START_COUNT[t] - cnt[t]); i++) list.push(t);
  const adv = color === 'w' ? matW - matB : matB - matW;
  return { list, adv, opp };
}

function barHtml(side) {
  const isBot = side === G.botColor;
  const cap = captured(side);
  const lad = getLadder();
  const name = isBot ? G.bot.name : 'You';
  const rating = isBot ? G.bot.elo : lad.elo;
  const active = !G.over && G.chess.turn() === side && G.chess.history().length >= 1;
  const counts = {};
  for (const t of cap.list) counts[t] = (counts[t] || 0) + 1;
  const capHtml = Object.entries(counts).map(([t, n]) => `<span>${GLYPH[t]}${n > 1 ? `<sub>${n}</sub>` : ''}</span>`).join('');
  return `<div class="pbar ${isBot ? 'bot' : 'me'}${active ? ' active' : ''}"><div class="pbar-plate">
    ${isBot ? avatar(G.bot.avatar, { label: G.bot.name, size: 'sm', hue: botHue(G.bot) }) : avatar('lion', { label: 'You', size: 'sm' })}
    <div class="pb-id">
      <div class="pb-name"><b>${esc(name)}</b><span class="elo">${rating}</span>${isBot && G.thinking ? '<span class="thinking"><i></i><i></i><i></i></span>' : ''}${!isBot && G.assisted ? '<span class="tag" title="Takeback or hint used">assisted</span>' : ''}</div>
      <div class="pb-cap"><span class="caps pc-${cap.opp}">${capHtml}</span>${cap.adv > 0 ? `<span class="adv">+${cap.adv}</span>` : ''}</div>
    </div>
    ${G.tcInfo.unlimited ? '' : `<div class="clock${active ? ' on' : ''}" data-c="${side}">${fmtClock(G.clock.remaining(side))}</div>`}
  </div></div>`;
}
// bot medallions: warm reds for strong bots (the "dragon" side), cooler for beginners
export function botHue(bot) { return Math.round(220 - Math.min(1, bot.elo / 2400) * 220 + 360) % 360; }

function renderBars() {
  if (!view || !G) return;
  const bottom = G.flipped ? G.botColor : G.color, top = bottom === 'w' ? 'b' : 'w';
  view.querySelector('.bar-top').innerHTML = barHtml(top);
  view.querySelector('.bar-bottom').innerHTML = barHtml(bottom);
}

function renderMoves() {
  if (!view || !G) return;
  const hist = G.chess.history();
  const ol = view.querySelector('.moves');
  let html = '';
  for (let i = 0; i < hist.length; i += 2) {
    html += `<li><span class="n">${i / 2 + 1}.</span><span class="m${i === hist.length - 1 ? ' cur' : ''}">${esc(hist[i])}</span>${hist[i + 1] ? `<span class="m${i + 1 === hist.length - 1 ? ' cur' : ''}">${esc(hist[i + 1])}</span>` : ''}</li>`;
  }
  if (G.over && G.result) html += `<li class="res"><span>${G.result.result.replace('1/2-1/2', '½–½')}</span></li>`;
  ol.innerHTML = html || '<li class="empty">Your move — good luck!</li>';
  if (G.color === 'b' && !hist.length) ol.innerHTML = `<li class="empty">${esc(G.bot.name)} plays white…</li>`;
  const wrap = view.querySelector('.moves-wrap');
  requestAnimationFrame(() => { wrap.scrollLeft = wrap.scrollWidth; wrap.scrollTop = wrap.scrollHeight; });
}

function renderActions() {
  if (!view || !G) return;
  const bar = view.querySelector('.actions');
  const s = getSettings();
  if (G.over) {
    bar.innerHTML = `
      <button class="act wide primary" data-act="results">${icon('trophy')}<span>Results</span></button>
      <button class="act wide" data-act="rematch">${icon('rematch')}<span>Rematch</span></button>
      <button class="act wide" data-act="newbot">${icon('robot')}<span>New bot</span></button>
      <button class="act" data-act="flip">${icon('flip')}<span>Flip</span></button>`;
    return;
  }
  const abort = G.chess.history().length < 2;
  bar.innerHTML = `
    <button class="act" data-act="resign">${icon(abort ? 'x' : 'flag')}<span>${abort ? 'Abort' : 'Resign'}</span></button>
    <button class="act" data-act="draw"${abort ? ' disabled' : ''}>${icon('handshake')}<span>Draw</span></button>
    <button class="act" data-act="undo">${icon('undo')}<span>Undo</span></button>
    <button class="act" data-act="hint">${icon('bulb')}<span>Hint</span></button>
    <button class="act" data-act="flip">${icon('flip')}<span>Flip</span></button>
    <button class="act" data-act="camera">${icon('camera')}<span>View</span></button>
    <button class="act" data-act="speed">${icon('swords')}<span class="lbl">${speedLabel(s.battleSpeed)}</span></button>`;
}

function renderAll() { renderBars(); renderMoves(); renderActions(); }

export function openSettingsSheet() {
  const sh = openSheet(`<div class="sheet-head"><h3>Settings</h3><button class="tb-btn" data-close aria-label="Close">${icon('x')}</button></div><div class="sheet-body"></div>`, { cls: 'sheet-tall' });
  sh.el.querySelector('.sheet-body').appendChild(settingsPanel(app, { compact: true }));
}

// ---------- screen ----------
export function render(appRef) {
  app = appRef;
  if (!G) {
    const r = getResume();
    if (r) G = makeGame(r);
    if (!G) { setTimeout(() => app.go('#/home')); return { el: h('<section></section>'), route: 'game' }; }
  }
  const el = h(`<section class="screen game">
    <div class="g-stage">
      <div class="g-col">
        <div class="bar-top"></div>
        <div class="board-square"><div class="board-loading">Setting up the board…</div></div>
        <div class="bar-bottom"></div>
      </div>
    </div>
    <aside class="g-panel">
      <div class="moves-wrap"><ol class="moves"></ol></div>
      <div class="actions"></div>
    </aside>
  </section>`);
  view = el;
  ensureBoard();
  el.querySelector('.board-square').appendChild(boardHost);
  renderAll();

  el.addEventListener('click', e => {
    const a = e.target.closest('[data-act]'); if (!a || a.disabled) return;
    play('tap');
    ({
      resign, draw: offerDraw, undo, hint: showHint, flip, speed: cycleSpeed,
      camera: () => board && board.camera && board.camera.reset && board.camera.reset(),
      results: showResults, rematch, newbot: () => app.go('#/play/bot'),
    })[a.dataset.act]?.();
  });

  const g = G;
  boardPromise.then(() => {
    if (G !== g || view !== el) return;
    el.querySelector('.board-loading')?.remove();
    syncBoard();
    board.resize && board.resize();
    if (g.fresh) { g.fresh = false; play('start'); }
    if (!g.over) nextTurn();
  }).catch(e => {
    console.error('[gambit] board failed', e);
    const l = el.querySelector('.board-loading'); if (l) l.textContent = 'The board could not load. Try reloading.';
  });

  ticker = setInterval(tick, 100);
  const ro = new ResizeObserver(() => board && board.resize && board.resize());
  ro.observe(el.querySelector('.board-square'));

  const onVis = () => {
    if (!G || G.over) return;
    if (document.visibilityState === 'hidden') {
      G.pausedColor = G.clock.running; G.clock.stop(); saveResume();
    } else if (G.pausedColor && !G.animating) { G.clock.start(G.pausedColor); G.pausedColor = null; }
  };
  const onHide = () => saveResume();
  document.addEventListener('visibilitychange', onVis);
  window.addEventListener('pagehide', onHide);

  const tcLabel = G.tcInfo.unlimited ? 'Unlimited' : G.tcInfo.label;
  return {
    el, route: 'game',
    top: { title: `vs ${esc(G.bot.name)}`, sub: `${tcLabel} · Bot game`, back: '#/home' },
    leave() {
      clearInterval(ticker); ro.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', onHide);
      if (board) board.setInteractive(null);
      boardHost.remove();
      view = null;
      suspend(true);
    },
  };
}

// ---------- test hook (used by tools/ui_cdp.mjs; harmless in production) ----------
window.__gambitTest = () => G && {
  ready: !!board && !!view,
  myTurn: !G.over && !G.animating && !G.thinking && !G.pending && G.chess.turn() === G.color,
  over: G.over, plies: G.chess.history().length, result: G.result || null,
  state: { animating: G.animating, thinking: G.thinking, pending: !!G.pending, boardAnimating: board && board.isAnimating && board.isAnimating(), turn: G.chess.turn(), color: G.color },
  // goes through the same entry point the board uses
  playAny() {
    const ms = G.chess.moves({ verbose: true });
    const m = ms[(Math.random() * ms.length) | 0];
    return onMoveAttempt({ from: m.from, to: m.to, promotion: m.promotion });
  },
  async playBest() {
    let h = null;
    try { h = await app.deps.bots.hint(G.chess.fen(), 300); } catch { /* fall back */ }
    const hm = h && (typeof h === 'string' ? h : h.move);
    if (hm && Math.random() < 0.85) return onMoveAttempt({ from: hm.slice(0, 2), to: hm.slice(2, 4), promotion: hm[4] });
    const ms = G.chess.moves({ verbose: true });
    const val = { p: 1, n: 3, b: 3, r: 5, q: 9 };
    const mate = ms.find(m => m.san.includes('#'));
    const caps = ms.filter(m => m.captured).sort((a, b) => val[b.captured] - val[a.captured]);
    const m = mate || caps[0] || ms.find(x => x.promotion === 'q') || ms.find(x => x.san.includes('+')) || ms[(Math.random() * ms.length) | 0];
    return onMoveAttempt({ from: m.from, to: m.to, promotion: m.promotion || (m.flags.includes('p') ? 'q' : undefined) });
  },
};
