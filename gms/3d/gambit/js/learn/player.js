// Learn: the lesson player. A coach bubble above the shared 3D board, a status line and an action
// panel below. Steps: info (with demos), tap (coordinates / find squares), stars (lone-piece
// fields), move (guided tasks with fixed replies), quiz, play (practice vs the engine), cta.
import { h, esc, icon, promotionPicker, toast } from '../app/ui.js';
import { getSettings, setSettings, onSettings } from '../app/store.js';
import { play as sfx, playMove } from '../app/sound.js';
import { installedThemes } from '../app/themes-meta.js';
import { acquire } from '../app/boardhost.js';
import { syncViewButton, viewLabel } from '../app/views.js';
import { Chess } from '../chess/chess.js';
import { LESSONS, lessonById, unitById } from './data.js';
import { fieldFromFen, fieldMoves, fieldHint } from './field.js';
import { goalTest, hasKings, parseOk } from './rules.js';
import { kpkProbe } from './kpk.js';
import { createOverlay } from './overlay.js';
import { recordLesson, getProgress, setLast } from './progress.js';
import { starRow, COACH } from './art.js';

const wait = ms => new Promise(r => setTimeout(r, ms));
const PRAISE = ['Nice!', 'Well played!', 'Exactly!', 'Perfect!', 'Great job!', 'That’s it!'];
const praise = () => PRAISE[Math.floor(Math.random() * PRAISE.length)];
const TONE = { gold: '#e0b660', good: 'good', bad: 'bad', blue: 'hint' };
const FILES = 'abcdefgh';

let app = null, view = null, lease = null, board = null, boardP = null, ov = null;
let S = null;          // lesson run state

// ---------------------------------------------------------------- board
function battleSpeed(s) { return s.battleSpeed === 'off' ? 'off' : 2; }   // lessons: battles at 2× (or off)
function acquireBoard(container) {
  const s = getSettings();
  lease = acquire(container, {
    animSpeed: battleSpeed(s), labels: true,
    legalMoves: sq => legalFrom(sq),
    onMoveAttempt,
    onPromotion: ({ to, color }) => (S && S.kind === 'stars') ? Promise.resolve('q') : promotionPicker(view && view.querySelector('.ln-board'), { color, to, board }),
    onRevoke: () => { board = null; },
  });
  lease.track(onSettings(applySettings));
  // View button / V key cycle Top → Tilt → 3D → Free and are saved like in a game (D26, ui-4)
  lease.on('view', ({ view: v }) => {
    if (getSettings().view !== v) {
      setSettings({ view: v });
      toast(v === 'free' ? 'Free view: drag or pinch to look around' : `${viewLabel(v)} view`, { ms: 1200 });
    }
    syncViewBtn();
  });
  lease.on('theme', syncViewBtn);   // a theme may fix the camera (Plain = top)
  boardP = lease.ready.then(b => { if (b) { board = b; applySettings(getSettings(), null); } return b; });
  return boardP;
}
function syncViewBtn() { syncViewButton(view?.querySelector('.ln-view'), board, getSettings().view); }
function applySettings(s, patch) {
  if (!board) return;
  const all = !patch;
  if (all || 'battleSpeed' in patch) board.setAnimSpeed?.(battleSpeed(s));
  if ((all || 'theme' in patch) && installedThemes(app.deps).includes(s.theme)) Promise.resolve(board.setTheme?.(s.theme)).then(() => ov?.kick()).catch(e => console.warn('[learn] theme', e));
  if ((all || 'view' in patch) && board.camera?.preset && board.camera.view !== s.view) board.camera.preset(s.view);
  if (all || 'coords' in patch) board.setCoords?.(s.coords);
  if (all || 'view' in patch) syncViewBtn();
}
function kingSq(c, color) {
  const b = c.board();
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) { const p = b[r][f]; if (p && p.type === 'k' && p.color === color) return FILES[f] + (8 - r); }
  return null;
}
function syncCheck() {
  if (!board || !S?.chess) return;
  const c = S.chess;
  board.highlight({ check: c.inCheck() ? kingSq(c, c.turn()) : null });
}
function setInteractive(on) { board?.setInteractive(on ? 'w' : null); }
const step = () => S.L.steps[S.i];

function legalFrom(sq) {
  if (!S || S.busy || S.stepDone || S.failed) return [];
  if (S.kind === 'stars') return sq === S.field.sq ? fieldMoves(S.field).map(m => m.to) : [];
  if ((S.kind === 'move' || S.kind === 'play') && S.chess && S.chess.turn() === 'w') return S.chess.moves({ square: sq, verbose: true }).map(m => m.to);
  return [];
}

// ---------------------------------------------------------------- coach + panel
function sayText(st) { return String(st.say || '').replace(/\{max\}/g, st.max); }
function setCoach(html) {
  const el = view?.querySelector('.ln-say'); if (!el) return;
  el.innerHTML = html;
  const b = view.querySelector('.ln-bubble'); b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
}
function renderDots() {
  const el = view?.querySelector('.ln-dots'); if (!el) return;
  el.innerHTML = S.L.steps.map((_, i) => `<i class="${i < S.i ? 'done' : i === S.i ? 'on' : ''}"></i>`).join('');
}
function setStatus(kind, html) {
  const el = view?.querySelector('.ln-status'); if (!el) return;
  el.className = `ln-status ${kind || ''}`; el.innerHTML = html ? `<span>${html}</span>` : '';
  if (html) { el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }
}
function isLast() { return S.i >= S.L.steps.length - 1; }
function renderPanel() {
  const el = view?.querySelector('.ln-panel'); if (!el || !S) return;
  const st = step(), kind = S.kind;
  const nextLabel = isLast() ? 'Finish lesson' : 'Next';
  const nextBtn = (glow = false) => `<button class="btn btn-primary ln-next ${glow ? 'glow' : ''}" data-act="next">${icon(isLast() ? 'check' : 'play')}<span>${nextLabel}</span></button>`;
  let body = '';
  if (kind === 'quiz') {
    body = `<div class="ln-q"><b>${st.q}</b></div><div class="ln-opts">${st.options.map((o, i) =>
      `<button class="ln-opt ${S.quizPicked?.has(i) ? (i === st.answer ? 'right' : 'wrong') : ''}" data-opt="${i}" ${S.stepDone ? 'disabled' : ''}>${esc(o)}</button>`).join('')}</div>
      ${S.stepDone ? `<div class="ln-acts">${nextBtn(true)}</div>` : ''}`;
  } else if (kind === 'cta') {
    body = `<div class="ln-links">${st.links.map(l => `<a class="ln-link card" href="${esc(l.href)}">${icon(l.icon || 'play')}<span><b>${esc(l.label)}</b><small>${esc(l.sub || '')}</small></span>${icon('chevron')}</a>`).join('')}</div>
      <div class="ln-acts">${nextBtn(true)}</div>`;
  } else {
    const task = kind !== 'info';
    const acts = [];
    if (task && !S.stepDone) {
      if (S.failed) acts.push(`<button class="btn btn-primary ln-next" data-act="retry">${icon('rematch')}<span>Try again</span></button>`);
      else {
        acts.push(`<button class="act" data-act="hint" ${S.busy ? 'disabled' : ''}>${icon('bulb')}<span>${S.hintStage === 1 ? 'More hint' : 'Hint'}</span></button>`);
        acts.push(`<button class="act" data-act="retry" ${S.busy ? 'disabled' : ''}>${icon('undo')}<span>Restart</span></button>`);
        if (kind === 'stars') acts.push(`<div class="ln-count"><small>Moves</small><b>${S.moves}<span>/${st.max}</span></b></div>`);
        if (kind === 'play') acts.push(`<div class="ln-count"><small>Move</small><b>${S.count}<span>/${st.max}</span></b></div>`);
        if (kind === 'tap') acts.push(`<div class="ln-count"><small>Found</small><b>${S.found}<span>/${S.need}</span></b></div>`);
      }
    }
    if (kind === 'info' && st.demo) acts.push(`<button class="act" data-act="demo" ${S.busy ? 'disabled' : ''}>${icon('rematch')}<span>Replay</span></button>`);
    if (!task || S.stepDone) acts.push(nextBtn(task));
    body = `<div class="ln-acts">${acts.join('')}</div>`;
  }
  const back = S.i > 0 ? `<button class="ln-prev" data-act="prev" aria-label="Previous step">${icon('back')}</button>` : '';
  el.innerHTML = `<div class="ln-panel-in">${back}<div class="ln-panel-main">${body}</div></div>`;
}

// ---------------------------------------------------------------- steps
async function enter(i) {
  const s = S; if (!s) return;
  s.i = i; s.gen++; const gen = s.gen;
  const st = step();
  s.kind = st.type || 'info';
  s.stepDone = false; s.failed = false; s.busy = false; s.hintStage = 0; s.stepMiss = 0;
  s.chess = null; s.field = null; s.quizPicked = null;
  if (st.fen) s.fen = st.fen;
  if (board) board.skip?.();
  ov?.clear();
  setCoach(sayText(st)); renderDots(); setStatus('', ''); renderPanel();
  try { await boardP; } catch { return; }
  if (S !== s || s.gen !== gen || !board) return;
  view.querySelector('.board-loading')?.remove();
  board.showArrows([]);
  board.highlight({ lastMove: null, check: null, hint: null, legalTargets: [], selected: null });
  setInteractive(false);
  const fen = s.fen;
  if (st.fen || s.kind !== 'info' || !s.shown) board.setPosition(fen, { animate: false });
  s.shown = true;
  board.setOrientation('w');
  ov.set({ zones: st.zones || [], tags: st.tags || {} });
  if (st.arrows) board.showArrows(st.arrows.map(([from, to, tone]) => ({ from, to, color: TONE[tone] || tone || 'default' })));
  if (hasKings(fen) && (st.fen || s.kind !== 'info')) { s.chess = new Chess(fen); syncCheck(); }
  if (st.dots) {
    const t = hasKings(fen) ? new Chess(fen).moves({ square: st.dots, verbose: true }).map(m => m.to) : fieldMoves(fieldFromFen(fen, st.dots)).map(m => m.to);
    board.highlight({ selected: st.dots, legalTargets: t });
  }
  if (st.label) setTimeout(() => { if (S === s && s.gen === gen) board?.showLabel(st.label); }, 250);
  const fn = { info: enterInfo, tap: enterTap, stars: enterStars, move: enterMove, quiz: enterQuiz, play: enterPlay, cta: enterCta }[s.kind];
  fn && fn(st, s, gen);
  renderPanel();
}

function enterInfo(st, s, gen) { if (st.demo) runDemo(st, s, gen); }
async function runDemo(st, s, gen) {
  s.busy = true; renderPanel();
  board.setPosition(st.fen || s.fen, { animate: false });
  ov.set({ zones: st.zones || [], tags: st.tags || {} });
  if (st.dots) board.highlight({ selected: null, legalTargets: [] });
  await wait(900);
  const c = hasKings(s.fen) ? new Chess(s.fen) : null;
  for (const lan of st.demo) {
    if (S !== s || s.gen !== gen) return;
    const v = c ? c.move(lan) : { from: lan.slice(0, 2), to: lan.slice(2, 4), promotion: lan[4], piece: board.pieceAt(lan.slice(0, 2))?.type, flags: board.pieceAt(lan.slice(2, 4)) ? 'c' : 'n', captured: board.pieceAt(lan.slice(2, 4))?.type, san: '' };
    if (v && !c && v.promotion) v.flags += 'p';
    if (!v) break;
    playMove(v);
    try { await board.applyMove(v, { battle: false }); } catch (e) { console.warn(e); }
    if (S !== s || s.gen !== gen) return;
    if (c) syncCheck();
    await wait(650);
  }
  if (S !== s || s.gen !== gen) return;
  s.busy = false; renderPanel();
}

// --- tap: coordinates game or "tap every square that..."
function enterTap(st, s, gen) {
  if (st.coords) {
    const pool = [];
    for (const f of FILES) for (let r = 1; r <= 8; r++) pool.push(f + r);
    for (let k = pool.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); [pool[k], pool[j]] = [pool[j], pool[k]]; }
    s.targets = pool.slice(0, st.coords); s.need = st.coords; s.found = 0;
    s.ask = s.targets[0];
    setStatus('ask', `Tap <b class="ln-sqname">${s.ask}</b>`);
  } else {
    const find = typeof st.find === 'string' ? (() => { const sq = st.find.split(':')[1]; return fieldMoves(fieldFromFen(s.fen, sq)).map(m => m.to); })() : st.find;
    s.targets = find; s.need = find.length; s.found = 0; s.got = new Set();
    setStatus('', `Found 0 of ${s.need}`);
  }
  ov.tapMode(sq => onTap(sq, s, gen));
}
function onTap(sq, s, gen) {
  if (S !== s || s.gen !== gen || s.stepDone) return;
  const st = step();
  if (st.coords) {
    if (sq === s.ask) {
      ov.flash(sq, 'good'); sfx('correct');
      s.found++;
      if (s.found >= s.need) return stepSolved(`${praise()} You know your squares.`);
      s.ask = s.targets[s.found];
      setStatus('ask', `Tap <b class="ln-sqname">${s.ask}</b>`);
    } else {
      ov.flash(sq, 'bad'); sfx('wrong'); miss();
      setStatus('bad', `That’s <b>${sq}</b>. Find <b class="ln-sqname">${s.ask}</b>: file ${s.ask[0]}, rank ${s.ask[1]}`);
    }
  } else {
    if (s.targets.includes(sq)) {
      if (s.got.has(sq)) return;
      s.got.add(sq); s.found++; sfx('correct');
      ov.set({ zones: [...(st.zones || []), { sq: [...s.got], tone: 'good' }] });
      if (s.found >= s.need) return stepSolved(`${praise()} All ${s.need} found.`);
      setStatus('good', `Found ${s.found} of ${s.need}`);
    } else {
      ov.flash(sq, 'bad'); sfx('wrong'); miss();
      setStatus('bad', `Not <b>${sq}</b>. Found ${s.found} of ${s.need}`);
    }
  }
  renderPanel();
}

// --- stars: one piece collects stars and captures sleeping black pieces
function enterStars(st, s) {
  s.field = fieldFromFen(s.fen, st.piece, st.stars);
  s.moves = 0;
  ov.set({ stars: st.stars });
  setInteractive(true);
  setStatus('', `Tap the ${pieceName(s.field.type)}, then a square`);
}
const pieceName = t => ({ p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' }[t]);
function starMove(from, to) {
  const s = S, st = step(), gen = s.gen;
  const mv = from === s.field.sq && fieldMoves(s.field).find(m => m.to === to);
  if (!mv) return false;
  s.busy = true; setInteractive(false); renderPanel();
  const v = { from, to, piece: s.field.type, flags: mv.capture ? 'c' : 'n', captured: mv.capture ? (board.pieceAt(to)?.type || 'p') : undefined, promotion: mv.promo ? 'q' : undefined, san: '' };
  if (mv.promo) v.flags += 'p';
  playMove(v);
  s.field.sq = to; if (mv.promo) s.field.type = 'q';
  s.field.prey.delete(to);
  const wasStar = s.field.stars.delete(to);
  s.moves++;
  (async () => {
    try { await board.applyMove(v, { battle: false }); } catch (e) { console.warn(e); }
    if (S !== s || s.gen !== gen) return;
    board.highlight({ lastMove: null });
    const gotStar = ov.collect(to) || wasStar;
    if (gotStar) sfx('sparkle', { speed: 2 });
    if (mv.promo) setStatus('good', 'Promoted to a queen!');
    const left = s.field.stars.size + s.field.prey.size;
    if (!left) { stepSolved(`${praise()} Collected in ${s.moves} move${s.moves > 1 ? 's' : ''}.`); return; }
    if (s.moves >= st.max) { stepFailed(`Out of moves — ${left} left. Try a different route!`); return; }
    if (!mv.promo) setStatus(gotStar || mv.capture ? 'good' : '', `${left} to go · ${st.max - s.moves} move${st.max - s.moves > 1 ? 's' : ''} left`);
    s.busy = false; setInteractive(true); renderPanel();
  })();
  return true;
}

// --- move: guided tasks
function enterMove(st, s, gen) {
  s.mi = 0;
  s.chess = new Chess(s.fen);
  if (st.pre) {
    s.busy = true;
    setStatus('', 'Watch Black’s move…');
    (async () => {
      await wait(800);
      if (S !== s || s.gen !== gen) return;
      const v = s.chess.move(st.pre);
      playMove(v);
      try { await board.applyMove(v, { battle: false }); } catch (e) { console.warn(e); }
      if (S !== s || s.gen !== gen) return;
      syncCheck();
      s.busy = false; setInteractive(true); setStatus('', 'Your move'); renderPanel();
    })();
  } else { setInteractive(true); setStatus('', 'Your move'); }
  const e0 = st.moves[0]; if (e0.say) setCoach(e0.say);
}
function moveTry({ from, to, promotion }) {
  const s = S, st = step();
  const c = s.chess;
  const m = c.moves({ verbose: true }).find(x => x.from === from && x.to === to && (!x.promotion || x.promotion === (promotion || 'q')));
  if (!m) return false;
  const entry = st.moves[s.mi];
  if (!goalTest(entry.ok, c, m)) {
    c.move(m.lan); const stale = c.isStalemate(); c.undo();
    miss();
    board.shake?.(0.08, 380); sfx('wrong');
    if (stale) setStatus('bad', `<b>${esc(m.san)}</b> is <b>stalemate</b> — a draw! Give check instead.`);
    else setStatus('bad', `<b>${esc(m.san)}</b> isn’t it. ${esc(st.miss || 'Try again!')}`);
    if (s.stepMiss >= 2 && !s.hintStage) hint();
    renderPanel();
    return false;
  }
  s.busy = true; setInteractive(false); s.hintStage = 0;
  const gen = s.gen;
  const v = c.move(m.lan);
  playMove(v);
  (async () => {
    try { await board.applyMove(v, { battle: !!v.captured }); } catch (e) { console.warn(e); }
    if (S !== s || s.gen !== gen) return;
    board.highlight({ hint: null }); syncCheck();
    if (s.mi >= st.moves.length - 1 || c.isGameOver()) {
      const end = c.isCheckmate() ? 'Checkmate! ' : '';
      stepSolved(`${end}${praise()}`);
      return;
    }
    sfx('correct', { delay: 0.05 });
    setStatus('good', `<b>${esc(v.san)}</b> — ${praise()}`);
    if (entry.reply) {
      await wait(420);
      if (S !== s || s.gen !== gen) return;
      const r = c.move(entry.reply);
      playMove(r);
      try { await board.applyMove(r, { battle: !!r.captured }); } catch (e) { console.warn(e); }
      if (S !== s || s.gen !== gen) return;
      syncCheck();
    }
    s.mi++;
    const nx = st.moves[s.mi];
    if (nx.say) setCoach(nx.say);
    s.busy = false; setInteractive(true); renderPanel();
  })();
  return true;
}

// --- quiz
function enterQuiz() { S.quizPicked = new Set(); }
function pickQuiz(i) {
  const s = S, st = step();
  if (s.stepDone || s.quizPicked.has(i)) return;
  s.quizPicked.add(i);
  if (i === st.answer) { stepSolved(st.explain); return; }
  miss(); sfx('wrong');
  setStatus('bad', 'Not quite — try another answer.');
  renderPanel();
}

// --- play: practice vs the engine
function enterPlay(st, s) {
  s.chess = new Chess(s.fen); s.count = 0;
  setInteractive(true);
  setStatus('', st.goal === 'mate' ? 'Your move — go for checkmate' : 'Your move — get that pawn home');
}
function playTry({ from, to, promotion }) {
  const s = S, st = step(), c = s.chess, gen = s.gen;
  const m = c.moves({ verbose: true }).find(x => x.from === from && x.to === to && (!x.promotion || x.promotion === (promotion || 'q')));
  if (!m) return false;
  s.busy = true; setInteractive(false); s.hintStage = 0;
  const v = c.move(m.lan);
  s.count++;
  playMove(v);
  renderPanel();
  (async () => {
    try { await board.applyMove(v, { battle: !!v.captured }); } catch (e) { console.warn(e); }
    if (S !== s || s.gen !== gen) return;
    board.highlight({ hint: null }); syncCheck();
    if (st.goal === 'mate' && c.isCheckmate()) { stepSolved(`Checkmate in ${s.count}! ${praise()}`); return; }
    if (st.goal === 'promote' && v.promotion) {
      const taken = c.moves({ verbose: true }).some(r => r.to === v.to);
      if (!taken) { stepSolved(`The pawn is a queen! ${praise()}`); return; }
      stepFailed('The new queen can be captured. Bring your king closer first!'); return;
    }
    if (c.isStalemate()) { stepFailed('Stalemate — a draw! Always leave the king a square unless it’s mate.'); return; }
    if (c.isGameOver()) { stepFailed('That’s a draw. Try again!'); return; }
    if (st.kpk && kpkProbe(c.fen()) !== 'win') { stepFailed(`<b>${esc(v.san)}</b> lets Black draw. Kings first: take the opposition!`); return; }
    if (s.count >= st.max) { stepFailed(`Out of moves (${st.max}). Try again — push the king to the edge faster!`); return; }
    setStatus('', 'Black is thinking…');
    let lan = null;
    try { const r = await app.deps.bots.hint(c.fen(), 450); lan = r && r.move; } catch (e) { console.warn('[learn] hint', e); }
    if (S !== s || s.gen !== gen) return;
    const legal = c.moves({ verbose: true });
    let r = lan && legal.find(x => x.lan === lan);
    if (!r) r = legal[0];
    const rv = c.move(r.lan);
    playMove(rv);
    try { await board.applyMove(rv, { battle: !!rv.captured }); } catch (e) { console.warn(e); }
    if (S !== s || s.gen !== gen) return;
    syncCheck();
    if (c.isGameOver()) { stepFailed(c.isInsufficientMaterial() ? 'Black captured your last piece — a draw.' : 'That’s a draw. Try again!'); return; }
    s.busy = false; setInteractive(true);
    setStatus('', `Your move · ${st.max - s.count} left`);
    renderPanel();
  })();
  return true;
}

// --- cta
function enterCta() { S.stepDone = true; }

// ---------------------------------------------------------------- outcomes, hints
function miss() { S.misses++; S.stepMiss++; }
function stepSolved(msg) {
  const s = S;
  s.stepDone = true; s.busy = false; s.failed = false;
  setInteractive(false); ov?.tapMode(null);
  board?.highlight({ hint: null, legalTargets: [] });
  sfx(isLast() ? 'solved' : 'correct');
  setStatus('good', msg || praise());
  renderPanel();
}
function stepFailed(msg) {
  const s = S;
  s.failed = true; s.busy = false;
  miss();
  setInteractive(false);
  sfx('wrong');
  setStatus('bad', msg);
  renderPanel();
}

async function hint() {
  const s = S; if (!s || s.busy || s.stepDone || s.failed) return;
  const st = step();
  s.misses += s.hintStage ? 0 : 1;   // the first hint on a step costs like a miss
  s.hintStage = Math.min(2, s.hintStage + 1);
  let mv = null;
  if (s.kind === 'stars') mv = fieldHint(s.field);
  else if (s.kind === 'move') {
    const e = st.moves[s.mi], legal = s.chess.moves({ verbose: true });
    const lans = parseOk(e.ok);
    const m = lans ? legal.find(x => lans.includes(x.lan) || lans.includes(x.lan.slice(0, 4))) : legal.find(x => goalTest(e.ok, s.chess, x));
    mv = m && { from: m.from, to: m.to };
  } else if (s.kind === 'play') {
    const gen = s.gen;
    setStatus('', 'Thinking of a hint…');
    try {
      const c = s.chess;
      let lan = (await app.deps.bots.hint(c.fen(), 600))?.move;
      if (st.kpk && lan) {   // make sure the hint keeps the win
        const ok = x => { c.move(x); const r = kpkProbe(c.fen()); const promo = x.length > 4; c.undo(); return r === 'win' || promo; };
        if (!ok(lan)) lan = c.moves({ verbose: true }).map(x => x.lan).find(ok) || lan;
      }
      if (S !== s || s.gen !== gen) return;
      mv = lan && { from: lan.slice(0, 2), to: lan.slice(2, 4) };
    } catch { mv = null; }
  } else if (s.kind === 'tap') {
    const target = st.coords ? s.ask : s.targets.find(t => !s.got.has(t));
    if (target) { ov.flash(target, 'hint', 1400); setStatus('', st.coords ? `Here is <b>${target}</b>` : 'Try this one'); }
    renderPanel(); return;
  }
  if (!mv) { renderPanel(); return; }
  if (s.hintStage === 1) { board.highlight({ hint: { from: mv.from, arrow: false } }); setStatus('', 'Hint: move this piece'); }
  else { board.highlight({ hint: { from: mv.from, to: mv.to } }); setStatus('', 'Hint: this move'); }
  renderPanel();
}

function onMoveAttempt(m) {
  if (!S || S.busy || S.stepDone || S.failed) return false;
  if (S.kind === 'stars') return starMove(m.from, m.to);
  if (S.kind === 'move') return moveTry(m);
  if (S.kind === 'play') return playTry(m);
  return false;
}

// ---------------------------------------------------------------- lesson end
function finishLesson() {
  const s = S;
  if (s.finished) return;
  const stars = s.misses === 0 ? 3 : s.misses <= 2 ? 2 : 1;
  const r = recordLesson(s.L.id, stars);
  s.finished = { stars, best: r.best };
  const idx = LESSONS.indexOf(s.L);
  const next = LESSONS[idx + 1] || null;
  setInteractive(false); ov?.tapMode(null);
  const stage = view.querySelector('.ln-board');
  const o = h(`<div class="ln-done" role="dialog" aria-label="Lesson complete">
    <div class="ln-burst"></div>
    <div class="ln-done-card">
      <small>Lesson complete</small><b>${esc(s.L.title)}</b>
      <div class="ln-done-stars">${starRow(stars)}</div>
      <p>${s.misses === 0 ? 'Flawless — not a single slip!' : stars === 2 ? 'Nicely done.' : 'Done! Replay it any time for more stars.'}</p>
      <div class="ln-done-btns">
        <button class="btn btn-ghost" data-act="map">${icon('book')}<span>Course</span></button>
        ${next ? `<button class="btn btn-primary" data-act="nextlesson">${icon('play')}<span>Next lesson</span></button>` : `<button class="btn btn-primary" data-act="map">${icon('check')}<span>All done</span></button>`}
      </div>
      ${next ? `<small class="ln-done-next">Up next: ${esc(next.title)}</small>` : ''}
    </div></div>`);
  const burst = o.querySelector('.ln-burst');
  const colors = ['#f6dfa6', '#e0b660', '#fff3c0', '#ffd27a', '#ffffff', '#b98431'];
  for (let i = 0; i < 40; i++) {
    const a = Math.random() * Math.PI * 2, d = 80 + Math.random() * 170;
    const sp = document.createElement('i');
    sp.style.cssText = `--dx:${(Math.cos(a) * d).toFixed(0)}px;--dy:${(Math.sin(a) * d).toFixed(0)}px;--c:${colors[i % colors.length]};--d:${(Math.random() * 0.25).toFixed(2)}s;--s:${(4 + Math.random() * 6).toFixed(0)}px`;
    burst.appendChild(sp);
  }
  stage.appendChild(o);
  sfx('solved');
  s.next = next;
  const panel = view.querySelector('.ln-panel'); if (panel) panel.innerHTML = `<div class="ln-panel-in"><div class="ln-panel-main"><div class="ln-acts"><button class="btn btn-ghost ln-next" data-act="replay">${icon('rematch')}<span>Replay lesson</span></button></div></div></div>`;
}

// ---------------------------------------------------------------- mount
export function mountPlayer(el, appRef, id, ctx) {
  app = appRef; view = el;
  const L = lessonById(id);
  if (!L) { el.innerHTML = `<div class="ln-missing card"><b>That lesson doesn’t exist.</b><a class="btn btn-primary" href="#/learn">Back to the course</a></div>`; return { leave() { view = null; } }; }
  const unit = unitById(L.unit);
  const num = LESSONS.filter(x => x.unit === L.unit).indexOf(L) + 1;
  ctx?.setTop?.({ title: L.short || L.title, sub: `${unit.name} · Lesson ${num}`, back: '#/learn' });
  setLast(L.id);
  el.classList.add('ln-play');
  el.innerHTML = `
    <div class="ln-coach"><div class="ln-crest" aria-hidden="true">${COACH}</div>
      <div class="ln-bubble"><div class="ln-say"></div><div class="ln-dots"></div></div></div>
    <div class="ln-stage"><div class="ln-board board-square"><div class="board-loading">Setting up the board…</div></div></div>
    <div class="ln-statusrow"><div class="ln-status" role="status" aria-live="polite"></div>
      <button class="ln-view" type="button" data-act="camera" aria-label="Change view">${icon('camera')}<span class="lbl">Top</span></button></div>
    <aside class="ln-panel"></aside>`;
  const boardEl = el.querySelector('.ln-board');
  acquireBoard(boardEl).catch(() => {});
  ov = createOverlay(boardEl, () => board);
  S = { L, i: 0, gen: 0, misses: 0, kind: 'info', fen: L.steps[0].fen, shown: false };
  boardP.then(b => { if (!b && view) { const l = view.querySelector('.board-loading'); if (l) l.textContent = 'The board could not load. Try reloading.'; } });

  el.addEventListener('click', e => {
    const a = e.target.closest('[data-act],[data-opt]'); if (!a || a.disabled || !S) return;
    sfx('tap');
    if (a.dataset.opt !== undefined) { pickQuiz(+a.dataset.opt); return; }
    const act = a.dataset.act;
    if (act === 'next') { if (!S.stepDone && S.kind !== 'info' && S.kind !== 'cta') return; if (isLast()) finishLesson(); else enter(S.i + 1); }
    else if (act === 'prev') { if (S.i > 0) enter(S.i - 1); }
    else if (act === 'retry') enter(S.i);
    else if (act === 'hint') hint();
    else if (act === 'camera') { if (board?.camera?.cycle) board.camera.cycle(); }
    else if (act === 'demo') { const st = step(); runDemo(st, S, S.gen); }
    else if (act === 'map') app.go('#/learn');
    else if (act === 'replay') { view.querySelector('.ln-done')?.remove(); S.finished = null; S.misses = 0; enter(0); }
    else if (act === 'nextlesson' && S.next) app.go(`#/learn/${S.next.id}`);
  });
  const onKey = e => {
    if (e.key !== 'Enter' || !S || e.target.closest?.('input,textarea')) return;
    const n = view?.querySelector('[data-act="next"],[data-act="nextlesson"]'); if (n) { e.preventDefault(); n.click(); }
  };
  window.addEventListener('keydown', onKey);
  enter(0);
  return {
    leave() {
      window.removeEventListener('keydown', onKey);
      ov?.dispose(); ov = null;
      if (lease) lease.release();
      lease = null; board = null; boardP = null; view = null; S = null;
    },
  };
}
export const isActive = () => !!(S && !S.finished && S.i > 0);

// ---------------------------------------------------------------- test hook (tools/learn_cdp.mjs)
window.__learnTest = () => S && {
  lesson: S.L.id, step: S.i, steps: S.L.steps.length, kind: S.kind, busy: !!S.busy, done: !!S.stepDone, failed: !!S.failed,
  misses: S.misses, finished: S.finished || null, ready: !!board && !S.busy,
  ask: S.ask || null, targets: S.targets || null, got: S.got ? [...S.got] : null,
  /** the next correct action: {kind:'next'|'tap'|'quiz'|'move', ...} (play steps: async via suggest()) */
  expected() {
    const st = step();
    if (S.stepDone || S.kind === 'info' || S.kind === 'cta') return { kind: 'next' };
    if (S.kind === 'tap') return { kind: 'tap', sq: st.coords ? S.ask : S.targets.find(t => !S.got.has(t)) };
    if (S.kind === 'quiz') return { kind: 'quiz', index: st.answer };
    if (S.kind === 'stars') { const m = fieldHint(S.field); return m && { kind: 'move', from: m.from, to: m.to }; }
    if (S.kind === 'move') {
      const e = st.moves[S.mi], legal = S.chess.moves({ verbose: true }), lans = parseOk(e.ok);
      const m = lans ? legal.find(x => lans.includes(x.lan) || lans.includes(x.lan.slice(0, 4))) : legal.find(x => goalTest(e.ok, S.chess, x));
      return m && { kind: 'move', from: m.from, to: m.to, promotion: m.promotion };
    }
    return { kind: 'play' };
  },
  async suggest() {
    const c = S.chess; let lan = (await app.deps.bots.hint(c.fen(), 700))?.move;
    if (step().kpk) { const ok = x => { c.move(x); const r = kpkProbe(c.fen()); c.undo(); return r === 'win' || x.length > 4; }; if (!ok(lan)) lan = c.moves({ verbose: true }).map(x => x.lan).find(ok); }
    return lan && { kind: 'move', from: lan.slice(0, 2), to: lan.slice(2, 4), promotion: lan[4] };
  },
  wrongMove() {
    const st = step(); const e = st.moves?.[S.mi]; if (!e || !S.chess) return null;
    const m = S.chess.moves({ verbose: true }).find(x => !goalTest(e.ok, S.chess, x));
    return m && { from: m.from, to: m.to };
  },
};
window.__learnBoard = () => board;
