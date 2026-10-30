// Puzzle play: the real 3D board, opponent setup move, find-the-move loop, hints, reveal,
// stars, rating, celebration. One persistent board is reused across puzzles.
import { h, esc, icon, toast, promotionPicker, confirmDialog } from '../app/ui.js';
import { getSettings, onSettings } from '../app/store.js';
import { play as sfx, playMove } from '../app/sound.js';
import { installedThemes } from '../app/themes-meta.js';
import { acquire } from '../app/boardhost.js';
import { PuzzleRun, goalText, lanOf } from './logic.js';
import { getPuzzle } from './data.js';
import { regionById, REGIONS } from './regions.js';
import { getProgress, recordResult, recordFirstMiss, setLast } from './progress.js';
import { computeState, nextOpen } from './layout.js';
import { getGraph } from './map.js';
import { starRow } from './art.js';

const wait = ms => new Promise(r => setTimeout(r, ms));
const THEME_NAMES = {
  mateIn1: 'Mate in 1', mateIn2: 'Mate in 2', mateIn3: 'Mate in 3', mateIn4: 'Mate in 4', mateIn5: 'Mate in 5',
  backRankMate: 'Back-rank mate', smotheredMate: 'Smothered mate', arabianMate: 'Arabian mate', anastasiaMate: "Anastasia's mate",
  bodenMate: "Boden's mate", hookMate: 'Hook mate', doubleBishopMate: 'Two-bishop mate', dovetailMate: 'Dovetail mate',
  killBoxMate: 'Kill-box mate', vukovicMate: 'Vuković mate', cornerMate: 'Corner mate', epauletteMate: 'Epaulette mate',
  swallowstailMate: "Swallow's-tail mate", balestraMate: 'Balestra mate', pillsburysMate: "Pillsbury's mate", morphysMate: "Morphy's mate",
  operaMate: 'Opera mate', triangleMate: 'Triangle mate', blindSwineMate: 'Blind swine mate',
  fork: 'Fork', pin: 'Pin', skewer: 'Skewer', discoveredAttack: 'Discovered attack', discoveredCheck: 'Discovered check',
  doubleCheck: 'Double check', deflection: 'Deflection', attraction: 'Attraction', xRayAttack: 'X-ray', interference: 'Interference',
  intermezzo: 'In-between move', capturingDefender: 'Remove the defender', clearance: 'Clearance', sacrifice: 'Sacrifice',
  hangingPiece: 'Loose piece', trappedPiece: 'Trapped piece', promotion: 'Promotion', underPromotion: 'Under-promotion',
  advancedPawn: 'Advanced pawn', zugzwang: 'Zugzwang', quietMove: 'Quiet move', defensiveMove: 'Defensive move',
  kingsideAttack: 'Kingside attack', queensideAttack: 'Queenside attack', exposedKing: 'Exposed king', attackingF2F7: 'f2/f7 attack',
  rookEndgame: 'Rook endgame', pawnEndgame: 'Pawn endgame', queenEndgame: 'Queen endgame', bishopEndgame: 'Bishop endgame',
  knightEndgame: 'Knight endgame', queenRookEndgame: 'Queen & rook endgame', equality: 'Hold the draw', opening: 'Opening',
  trap: 'Opening trap', study: 'Composed study', kingHunt: 'King hunt', endgame: 'Endgame',
};

let app = null;
let lease = null, board = null, boardP = null;
let S = null;              // current puzzle state
let view = null;

// The shared board host (js/app/boardhost.js): the same WebGL board as the bot / online games.
// boardP resolves with the board for the current mount (null if another screen took it).
function acquireBoard(container) {
  lease = acquire(container, {
    animSpeed: getSettings().battleSpeed, labels: true,
    legalMoves: sq => (S && !S.busy && !S.finished && S.run.chess.turn() === S.run.player)
      ? S.run.chess.moves({ square: sq, verbose: true }).map(m => m.to) : [],
    onMoveAttempt,
    onPromotion: ({ to, color }) => pickPromotion(color, to),
    onRevoke: () => { board = null; },
  });
  lease.track(onSettings(applySettings));
  boardP = lease.ready.then(b => { if (b) { board = b; applySettings(getSettings(), null); } return b; });
  return boardP;
}
function ensureBoard() { return boardP ? boardP.then(b => { if (!b) throw new Error('board taken'); return b; }) : Promise.reject(new Error('no board')); }
function applySettings(s, patch) {
  if (!board) return;
  const all = !patch;
  if (all || 'battleSpeed' in patch) board.setAnimSpeed?.(s.battleSpeed);
  if ((all || 'theme' in patch) && installedThemes(app.deps).includes(s.theme)) Promise.resolve(board.setTheme?.(s.theme)).catch(e => console.warn('[puzzles] theme', e));
  if ((all || 'view' in patch) && board.camera?.preset && board.camera.view !== s.view) board.camera.preset(s.view);
  if (all || 'coords' in patch) board.setCoords?.(s.coords);
}

function kingSq(chess, color) {
  const b = chess.board();
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
    const p = b[r][f];
    if (p && p.type === 'k' && p.color === color) return 'abcdefgh'[f] + (8 - r);
  }
  return null;
}
function syncCheck(extra = {}) {
  if (!board || !S) return;
  const c = S.run.chess;
  board.highlight({ check: c.inCheck() ? kingSq(c, c.turn()) : null, legalTargets: [], hint: null, ...extra });
}
function setInteractive() {
  if (!board || !S) return;
  const mine = !S.busy && !S.finished && S.run.chess.turn() === S.run.player;
  board.setInteractive(mine ? S.run.player : null);
}

// ---------- move loop ----------
function onMoveAttempt({ from, to, promotion }) {
  if (!S || S.busy || S.finished) return false;
  const res = S.run.tryMove({ from, to, promotion });
  if (!res.ok) {
    if (res.illegal) return false;
    miss(res.move);
    return false;
  }
  S.busy = true; setInteractive();
  S.hintStage = 0;
  stepMove(res).catch(e => console.error('[puzzles] move', e));
  return true;
}

function miss(mv) {
  S.mistakes++;
  if (S.mistakes === 1 && !S.hints && !S.revealed && !S.replay) S.ratingDelta += recordFirstMiss(S.p);
  sfx('wrong');
  const sq = view && view.querySelector('.pz-board');
  if (board && board.shake) board.shake(0.09, 420);
  else if (sq) { sq.classList.remove('pz-shake'); void sq.offsetWidth; sq.classList.add('pz-shake'); }
  setStatus('bad', `${mv && mv.san ? `<b>${esc(mv.san)}</b> isn't it.` : 'Not that one.'} Try again`);
  renderPanel();
}

function moveSound(v) {
  playMove(v);   // audio agent
}

async function stepMove(res, { auto = false } = {}) {
  const s = S;
  moveSound(res.move);
  if (board) {
    try { await board.applyMove(res.move, { battle: res.done && !!res.move.captured }); } catch (e) { console.warn(e); }
  }
  if (S !== s) return;
  if (res.done) { syncCheck(); finish(); return; }
  if (!auto) sfx('correct', { delay: 0.38 });   // after the move lands
  if (!auto) setStatus('good', `<b>${esc(res.move.san)}</b> — correct! Keep going`);
  syncCheck();
  await wait(auto ? 380 : 320);
  if (S !== s) return;
  moveSound(res.reply);
  if (board) { try { await board.applyMove(res.reply, { battle: false }); } catch (e) { console.warn(e); } }
  if (S !== s) return;
  syncCheck();
  S.busy = false; setInteractive();
  if (!auto) setStatus('', `${sideName(S.run.player)} to move — find the follow-up`);
  renderPanel();
}

export const isActive = () => !!(S && !S.finished && (S.mistakes || S.hints || S.run.i > 1));
const sideName = c => (c === 'w' ? 'White' : 'Black');

// ---------- hint / reveal ----------
function hint() {
  if (!S || S.busy || S.finished) return;
  const exp = S.run.expected(); if (!exp) return;
  if (!S.hintedThisMove) {
    S.hints++; S.hintedThisMove = true;
    if (S.hints === 1 && !S.mistakes && !S.revealed && !S.replay) S.ratingDelta += recordFirstMiss(S.p);
  }
  S.hintStage = Math.min(2, (S.hintStage || 0) + 1);
  const from = exp.slice(0, 2), to = exp.slice(2, 4);
  if (S.hintStage === 1) { board?.highlight({ hint: { from, arrow: false } }); setStatus('', 'Hint: this piece moves'); }
  else { board?.highlight({ hint: { from, to } }); setStatus('', 'Hint: this move'); }
  renderPanel();
}

async function reveal({ ask = true } = {}) {
  if (!S || S.busy || S.finished) return;
  // a clean first attempt is charged as a miss: ask first so a stray tap doesn't cost rating (qa)
  const pr = getProgress();
  if (ask && !S.mistakes && !S.hints && !S.replay && pr.s[S.p.id] === undefined && !pr.a[S.p.id]) {
    const s0 = S;
    const ok = await confirmDialog({ title: 'Show the solution?', body: 'You won’t get stars for this puzzle, and your puzzle rating counts it as a miss.', ok: 'Show solution' });
    if (!ok || S !== s0 || S.busy || S.finished) return;
  }
  S.revealed = true;
  if (!S.mistakes && !S.hints && !S.replay) S.ratingDelta += recordFirstMiss(S.p);
  S.busy = true; setInteractive(); renderPanel();
  setStatus('', 'Solution');
  const s = S;
  while (S === s && !s.run.done) {
    const res = s.run.playExpected();
    if (!res.ok) break;
    await stepMove(res, { auto: true });
    if (S !== s) return;
    s.busy = true; setInteractive();
    await wait(260);
  }
}

// ---------- finish ----------
function finish() {
  const s = S;
  s.finished = true; s.busy = false; setInteractive();
  const stars = s.revealed ? 0 : Math.max(1, 3 - s.mistakes - s.hints);
  const clean = !s.mistakes && !s.hints && !s.revealed;
  const r = recordResult(s.p, { stars, clean });
  if (r.first) s.ratingDelta += r.delta;
  s.result = { stars, rated: r.first || s.ratingDelta !== 0, delta: s.ratingDelta, rating: r.rating, best: r.best };
  if (!s.revealed) sfx('solved');
  setStatus(s.revealed ? '' : 'good', s.revealed ? 'That was the solution — try it again for stars' : (clean ? 'Perfect — solved first try!' : 'Solved!'));
  renderPanel();
  if (!s.revealed) celebrate(stars);
  computeNext();
}

async function computeNext() {
  const s = S;
  try {
    const { g } = await getGraph();
    const st = computeState(g, REGIONS, getProgress());
    s.next = nextOpen(g, st, s.p.id);
  } catch { s.next = null; }
  if (S === s) renderPanel();
}

function celebrate(stars) {
  const stage = view && view.querySelector('.pz-board');
  if (!stage) return;
  const o = h(`<div class="pz-celebrate" aria-hidden="true"><div class="pz-burst"></div>
    <div class="pz-cel-card"><b>${stars === 3 ? 'Brilliant!' : 'Solved!'}</b><div class="pz-cel-stars">${starRow(stars)}</div></div></div>`);
  const burst = o.querySelector('.pz-burst');
  const colors = ['#f6dfa6', '#e0b660', '#fff3c0', '#ffd27a', '#ffffff', '#b98431'];
  for (let i = 0; i < 46; i++) {
    const a = Math.random() * Math.PI * 2, d = 90 + Math.random() * 190;
    const sp = document.createElement('i');
    sp.style.cssText = `--dx:${(Math.cos(a) * d).toFixed(0)}px;--dy:${(Math.sin(a) * d).toFixed(0)}px;--c:${colors[i % colors.length]};--d:${(Math.random() * 0.25).toFixed(2)}s;--s:${(4 + Math.random() * 6).toFixed(0)}px`;
    burst.appendChild(sp);
  }
  stage.appendChild(o);
  if (window.__pzKeepCelebrate) return;   // tests: keep it on screen for a screenshot
  setTimeout(() => o.classList.add('out'), 1700);
  setTimeout(() => o.remove(), 2200);
}

// ---------- promotion picker ----------
function pickPromotion(color, to = null) {
  return promotionPicker(view && view.querySelector('.pz-board'), { color, to, board });
}

// ---------- panel ----------
function setStatus(kind, html) {
  if (!S) return;
  S.status = { kind, html };
  const el = view && view.querySelector('.pz-status');
  if (el) { el.className = `pz-status ${kind}`; el.innerHTML = `<span>${html}</span>`; el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }
}

function themeChips(p) {
  const skip = new Set(['short', 'long', 'veryLong', 'oneMove', 'crushing', 'advantage', 'middlegame', 'mate', 'master', 'masterVsMaster', 'superGM', 'player', 'attack']);
  return (p.th || '').split(' ').filter(t => t && !skip.has(t) && !/^mateIn/.test(t) && THEME_NAMES[t]).slice(0, 3)
    .map(t => `<span class="pz-chip">${esc(THEME_NAMES[t])}</span>`).join('');
}

function renderHead() {
  const el = view && view.querySelector('.pz-head'); if (!el || !S) return;
  const p = S.p, reg = regionById(p.region);
  el.innerHTML = `
    <div class="pz-goal"><span class="pz-side ${S.run.player}"></span><div><b>${sideName(S.run.player)} to move</b><small>${esc(p.goal || goalText(p))}</small></div></div>
    <div class="pz-meta"><small>${esc(reg ? reg.name : '')}${S.num ? ` · #${S.num}` : ''}</small><b>${p.r}</b></div>`;
}

function renderPanel() {
  const el = view && view.querySelector('.pz-panel'); if (!el || !S) return;
  const p = S.p, prog = getProgress();
  const liveStars = S.revealed ? 0 : Math.max(1, 3 - S.mistakes - S.hints);
  const best = prog.s[p.id];
  const fin = S.finished;
  const res = S.result;
  el.innerHTML = `
    ${p.n ? `<div class="pz-story card"><small>Classic</small><b>${esc(p.n)}</b><p>${esc(p.st || '')}</p></div>` : ''}
    <div class="pz-score card">
      <div class="pz-starsbig ${fin ? 'final' : ''}">${starRow(fin && res ? res.stars : liveStars)}</div>
      <div class="pz-score-txt">
        ${fin && res
          ? `<b>${res.stars ? `${res.stars} star${res.stars > 1 ? 's' : ''}` : 'No stars'}</b><small>${res.rated ? `Rating ${res.rating} <span class="${res.delta >= 0 ? 'good' : 'bad'}">${res.delta >= 0 ? '+' : ''}${res.delta}</span>` : 'Replay — rating unchanged'}${best != null && best > res.stars ? ` · best ${best}★` : ''}</small>`
          : `<b>${S.replay ? 'Replay' : 'First try'}</b><small>${S.mistakes ? `${S.mistakes} miss${S.mistakes > 1 ? 'es' : ''}` : 'No misses'}${S.hints ? ` · ${S.hints} hint${S.hints > 1 ? 's' : ''}` : ''}${best != null ? ` · best ${best}★` : ''}</small>`}
      </div>
    </div>
    ${themeChips(p) ? `<div class="pz-chips">${themeChips(p)}</div>` : ''}
    <div class="pz-acts">
      ${fin ? `
        <button class="act" data-act="retry">${icon('rematch')}<span>Retry</span></button>
        <button class="act" data-act="map">${icon('home')}<span>Map</span></button>
        ${S.next ? `<button class="btn btn-primary pz-nextbtn" data-act="next">${icon('play')}<span>Next puzzle</span></button>`
          : `<button class="btn btn-primary pz-nextbtn" data-act="map">${icon('check')}<span>Back to the map</span></button>`}`
      : `
        <button class="act" data-act="hint" ${S.busy ? 'disabled' : ''}>${icon('bulb')}<span>${S.hintStage === 1 ? 'More hint' : 'Hint'}</span></button>
        <button class="act" data-act="reveal" ${S.busy ? 'disabled' : ''}>${icon('book')}<span>Solution</span></button>
        <button class="act" data-act="restart">${icon('undo')}<span>Restart</span></button>
        <button class="act" data-act="camera">${icon('camera')}<span>View</span></button>`}
    </div>
    ${fin && p.g ? `<a class="pz-src" href="https://lichess.org/${esc(p.g)}" target="_blank" rel="noopener">Original game on Lichess ↗</a>` : ''}`;
}

// ---------- lifecycle ----------
async function startPuzzle(id, { replay } = {}) {
  const gen = (S?.gen || 0) + 1;
  let p = null;
  try { p = await getPuzzle(id); } catch (e) { console.error(e); }
  if (!view) return;
  if (!p) { view.querySelector('.pz-status').textContent = 'That puzzle could not be found.'; return; }
  const prog = getProgress();
  const run = new PuzzleRun(p);
  const setup = run.start();
  S = { p, run, gen, mistakes: 0, hints: 0, hintStage: 0, revealed: false, busy: true, finished: false,
    ratingDelta: 0, replay: replay ?? (prog.s[p.id] !== undefined || !!prog.a[p.id]), status: null, next: null, num: 0 };
  setLast(p.id);
  getGraph().then(({ idx }) => {
    const r = idx.regions.find(x => x.id === p.region);
    if (r && S && S.p === p) { S.num = r.nodes.findIndex(n => n[0] === p.id) + 1; renderHead(); }
  }).catch(() => {});
  view.style.setProperty('--ra', regionById(p.region)?.a || '#e0b660');
  renderHead(); renderPanel();
  setStatus('', setup ? 'Watch the opponent’s move…' : `${sideName(run.player)} to move`);
  const s = S;
  try { await ensureBoard(); } catch (e) {
    if (S !== s || !view) return;   // left the screen before the board was ready
    console.error('[puzzles] board', e);
    const l = view.querySelector('.board-loading'); if (l) l.textContent = 'The board could not load. Try reloading.';
    return;
  }
  if (S !== s || !view) return;
  view.querySelector('.board-loading')?.remove();
  board.setOrientation(run.player);
  board.setPosition(p.fen, { animate: false });
  board.highlight({ lastMove: null, check: null, hint: null, legalTargets: [] });
  board.resize?.();
  if (setup) {
    await wait(550);
    if (S !== s) return;
    moveSound(setup);
    try { await board.applyMove(setup, { battle: false }); } catch (e) { console.warn(e); }
    if (S !== s) return;
  }
  syncCheck();
  S.busy = false; setInteractive();
  setStatus('', `${sideName(run.player)} to move — ${esc(p.goal || goalText(p)).toLowerCase()}`);
  renderPanel();
}

export function mountPlay(el, appRef, id) {
  app = appRef;
  view = el;
  el.classList.add('pz-play');
  el.innerHTML = `
    <div class="pz-stage">
      <div class="pz-col">
        <div class="pz-head"></div>
        <div class="pz-board board-square"><div class="board-loading">Setting up the board…</div></div>
        <div class="pz-status" role="status" aria-live="polite"></div>
      </div>
    </div>
    <aside class="pz-panel"></aside>`;
  acquireBoard(el.querySelector('.pz-board')).catch(() => {});
  const ro = new ResizeObserver(() => board?.resize?.());
  ro.observe(el.querySelector('.pz-board'));

  el.addEventListener('click', e => {
    const a = e.target.closest('[data-act]'); if (!a || a.disabled) return;
    sfx('tap');
    const act = a.dataset.act;
    if (act === 'hint') hint();
    else if (act === 'reveal') reveal();
    else if (act === 'restart' || act === 'retry') { board?.skip?.(); startPuzzle(S.p.id, { replay: true }); }
    else if (act === 'camera') board?.camera?.reset?.();
    else if (act === 'map') app.go('#/puzzles');
    else if (act === 'next' && S?.next) app.go(`#/puzzles/p/${encodeURIComponent(S.next)}`);
  });

  startPuzzle(id);
  return {
    leave() {
      ro.disconnect();
      if (lease) lease.release();
      lease = null; board = null; boardP = null;
      view = null; S = null;
    },
  };
}

// ---------- test hook (tools/puzzles_cdp.mjs; harmless in production) ----------
window.__puzzleBoard = () => board;
window.__puzzleTest = () => S && {
  id: S.p.id, ready: !!board && !S.busy, finished: S.finished, mistakes: S.mistakes, hints: S.hints,
  expected: S.run.expected(), player: S.run.player, result: S.result || null, next: S.next,
  playExpected() { const e = S.run.expected(); return e && onMoveAttempt({ from: e.slice(0, 2), to: e.slice(2, 4), promotion: e[4] }); },
  playWrong() {
    const e = S.run.expected();
    const ms = S.run.chess.moves({ verbose: true }).filter(m => lanOf(m) !== e && !m.san.includes('#'));
    const m = ms[0]; return m && onMoveAttempt({ from: m.from, to: m.to, promotion: m.promotion });
  },
  hint, reveal: () => reveal({ ask: false }), celebrate: () => celebrate(3),
};
