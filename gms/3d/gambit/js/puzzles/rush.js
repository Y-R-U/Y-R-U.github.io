// Puzzle Rush: #/puzzles/rush. Solve as many puzzles as you can before the clock runs out;
// they start easy and climb with every puzzle; a wrong move is a strike, three strikes ends
// the run. The clock pauses while the app is hidden. Runs never touch map stars or the
// puzzle rating. Storage: gambit.rush {best:{3,5}, runs:[{m, s, at}] last 20}.
import { esc, icon, promotionPicker } from '../app/ui.js';
import { getSettings, onSettings } from '../app/store.js';
import { play as sfx, playMove } from '../app/sound.js';
import { installedThemes } from '../app/themes-meta.js';
import { acquire } from '../app/boardhost.js';
import { PuzzleRun, goalText, lanOf } from './logic.js';
import { loadIndex, getPuzzle } from './data.js';

const KEY = 'gambit.rush';
export const MODES = [{ id: '3', min: 3, name: '3 minutes' }, { id: '5', min: 5, name: '5 minutes' }];
const STRIKES = 3;
const wait = ms => new Promise(r => setTimeout(r, ms));

export function getRush() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (v && typeof v === 'object') return { best: { ...(v.best || {}) }, runs: Array.isArray(v.runs) ? v.runs : [] };
  } catch { /* blocked / bad */ }
  return { best: {}, runs: [] };
}
function saveRun(mode, score) {
  const r = getRush();
  const prev = r.best[mode] || 0;
  if (score > prev) r.best[mode] = score;
  r.runs = [{ m: mode, s: score, at: Date.now() }, ...r.runs].slice(0, 20);
  try { localStorage.setItem(KEY, JSON.stringify({ ...r, savedAt: Date.now() })); } catch { /* full */ }
  return { best: r.best[mode] || 0, isBest: score > prev && score > 0 };
}

/** Rating to aim for on the n-th puzzle of a run (0-based). */
export const targetRating = n => Math.min(2700, 450 + 65 * n);

/** Picks the unused non-classic puzzle closest to the target (random among the near ones). */
export function pickId(pool, used, target, rnd = Math.random) {
  for (const band of [40, 90, 160, 300, 9999]) {
    const near = pool.filter(([id, r]) => !used.has(id) && Math.abs(r - target) <= band);
    if (near.length) return near[(rnd() * near.length) | 0][0];
  }
  return null;
}

let R = null;      // the live run
let view = null, app = null, lease = null, board = null;

export function mountRush(el, appRef, ctx) {
  app = appRef; view = el;
  el.classList.add('pz-play', 'rush');
  intro();
  ctx.canPester?.(() => !(R && R.running));
  const onVis = () => {
    if (!R || !R.running) return;
    if (document.visibilityState === 'hidden') { R.left -= performance.now() - R.t0; R.t0 = null; }
    else if (R.t0 == null) R.t0 = performance.now();
  };
  document.addEventListener('visibilitychange', onVis);
  return {
    leave() {
      document.removeEventListener('visibilitychange', onVis);
      if (R && R.running && R.score > 0) saveRun(R.mode.id, R.score);   // a best is a best, even if you walk away
      stopRun();
      release();
      view = null;
    },
  };
}

function release() { if (lease) lease.release(); lease = null; board = null; }
function stopRun() { if (R) { R.running = false; clearInterval(R.tick); } R = null; }

// ---------- intro ----------
function intro() {
  release();
  const st = getRush();
  view.innerHTML = `<div class="rush-intro">
    <div class="rush-hero">${icon('clock')}<h2>Puzzle Rush</h2>
      <p>Solve as many as you can before time runs out. They start easy and get harder with every puzzle. A wrong move is a strike — <b>three strikes and you're out</b>.</p></div>
    <div class="rush-modes">${MODES.map(m => `<button class="rush-mode card" data-mode="${m.id}">
      <b>${m.min}<small>min</small></b><span>Best <em>${st.best[m.id] || 0}</em></span></button>`).join('')}</div>
    ${st.runs.length ? `<h3 class="sect">Recent runs</h3><ul class="recent rush-runs">${st.runs.slice(0, 6).map(r => `<li>
      <span class="r ${r.s >= (st.best[r.m] || 0) && r.s ? 'win' : ''}">${r.s}</span><span class="nm">${r.m} minutes<small>${new Date(r.at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</small></span></li>`).join('')}</ul>` : ''}
    <p class="fine">Rush runs don't change your map stars or puzzle rating.</p>
  </div>`;
  view.onclick = e => {
    const b = e.target.closest('[data-mode]'); if (!b) return;
    sfx('tap');
    start(MODES.find(m => m.id === b.dataset.mode));
  };
}

// ---------- run ----------
async function start(mode) {
  stopRun();
  view.onclick = null;
  view.innerHTML = `
    <div class="pz-stage"><div class="pz-col">
      <div class="pz-head rush-head"></div>
      <div class="pz-board board-square"><div class="board-loading">Shuffling puzzles…</div></div>
      <div class="pz-status" role="status" aria-live="polite"></div>
    </div></div>
    <aside class="pz-panel"><div class="rush-strip card"></div>
      <div class="pz-acts"><button class="act" data-act="end">${icon('flag')}<span>End run</span></button></div></aside>`;
  view.onclick = e => {
    const a = e.target.closest('[data-act]'); if (!a) return;
    if (a.dataset.act === 'end' && R) { sfx('tap'); end('ended'); }
  };
  const run = R = { mode, score: 0, strikes: 0, n: 0, left: mode.min * 60000, t0: null, running: false, used: new Set(), log: [], cur: null, busy: true, gen: 0 };

  lease = acquire(view.querySelector('.pz-board'), {
    labels: true, animSpeed: getSettings().battleSpeed,
    legalMoves: sq => (R && R.cur && !R.busy && R.cur.run.chess.turn() === R.cur.run.player) ? R.cur.run.chess.moves({ square: sq, verbose: true }).map(m => m.to) : [],
    onMoveAttempt, onPromotion: ({ to, color }) => promotionPicker(view && view.querySelector('.pz-board'), { color, to, board }),
    onRevoke: () => { board = null; },
  });
  lease.track(onSettings((s, patch) => {
    if (board && patch && 'theme' in patch && installedThemes(app.deps).includes(s.theme)) Promise.resolve(board.setTheme?.(s.theme)).catch(() => {});
  }));
  let idx;
  try { [board, idx] = await Promise.all([lease.ready, loadIndex()]); } catch (e) {
    console.error('[rush]', e);
    const l = view && view.querySelector('.board-loading'); if (l) l.textContent = 'Couldn’t load the puzzles. Check your connection.';
    return;
  }
  if (R !== run || !board) return;
  run.pool = idx.regions.flatMap(r => r.nodes.filter(n => !n[2]).map(n => [n[0], n[1]]));
  view.querySelector('.board-loading')?.remove();
  renderHead(); renderStrip();
  // 3-2-1 so the first puzzle doesn't start under your thumb
  for (const c of ['3', '2', '1']) { setStatus('', `<b class="rush-count">${c}</b>`); sfx('tap'); await wait(600); if (R !== run) return; }
  run.running = true; run.t0 = performance.now();
  run.tick = setInterval(() => {
    if (R !== run || !run.running) return;
    if (timeLeft() <= 0) end('time'); else renderClock();
  }, 100);
  next();
}

function timeLeft() { return !R ? 0 : R.t0 == null ? R.left : R.left - (performance.now() - R.t0); }

async function next() {
  const run = R; if (!run || !run.running) return;
  const id = pickId(run.pool, run.used, targetRating(run.n));
  if (!id) { end('done'); return; }
  run.used.add(id);
  let p = null;
  try { p = await getPuzzle(id); } catch (e) { console.warn('[rush]', e); }
  if (R !== run || !run.running) return;
  if (!p) { next(); return; }
  const pr = new PuzzleRun(p);
  const setup = pr.start();
  const gen = ++run.gen;
  run.cur = { p, run: pr };
  run.n++;
  run.busy = true; board.setInteractive(null);
  board.skip?.();
  board.setOrientation(pr.player);
  board.setPosition(p.fen, { animate: false });
  board.highlight({ lastMove: null, check: null, hint: null, legalTargets: [] });
  renderHead();
  setStatus('', `${side(pr.player)} to move`);
  if (setup) {
    await wait(220);
    if (R !== run || run.gen !== gen) return;
    playMove(setup);
    try { await board.applyMove(setup, { battle: false }); } catch { /* ignore */ }
    if (R !== run || run.gen !== gen) return;
  }
  run.busy = false; board.setInteractive(pr.player);
  setStatus('', `${side(pr.player)} to move — ${esc(goalText(p)).toLowerCase()}`);
}

function onMoveAttempt({ from, to, promotion }) {
  const run = R; if (!run || !run.running || run.busy || !run.cur) return false;
  const res = run.cur.run.tryMove({ from, to, promotion });
  if (res.illegal) return false;
  if (!res.ok) { strike(res.move); return false; }
  run.busy = true; board.setInteractive(null);
  step(res).catch(e => console.warn('[rush]', e));
  return true;
}

async function step(res) {
  const run = R, gen = run.gen;
  playMove(res.move);
  try { await board.applyMove(res.move, { battle: false }); } catch { /* ignore */ }
  if (R !== run || run.gen !== gen) return;
  if (res.done) {
    run.score++;
    run.log.push({ id: run.cur.p.id, r: run.cur.p.r, ok: true });
    sfx('correct');
    setStatus('good', 'Solved!');
    renderHead(); renderStrip();
    await wait(260);
    if (R === run && run.gen === gen) next();
    return;
  }
  sfx('correct', { delay: 0.2 });
  await wait(220);
  if (R !== run || run.gen !== gen) return;
  playMove(res.reply);
  try { await board.applyMove(res.reply, { battle: false }); } catch { /* ignore */ }
  if (R !== run || run.gen !== gen) return;
  run.busy = false; board.setInteractive(run.cur.run.player);
  setStatus('good', `<b>${esc(res.move.san)}</b> — keep going`);
}

async function strike(mv) {
  const run = R, gen = run.gen;
  run.strikes++;
  run.log.push({ id: run.cur.p.id, r: run.cur.p.r, ok: false });
  run.busy = true; board.setInteractive(null);
  sfx('wrong');
  if (board.shake) board.shake(0.09, 380);
  const exp = run.cur.run.expected();
  if (exp) board.highlight({ hint: { from: exp.slice(0, 2), to: exp.slice(2, 4) } });   // show what it was
  setStatus('bad', `${mv && mv.san ? `<b>${esc(mv.san)}</b> — ` : ''}strike ${run.strikes} of ${STRIKES}`);
  renderHead(); renderStrip();
  if (run.strikes >= STRIKES) { await wait(900); if (R === run) end('strikes'); return; }
  await wait(800);
  if (R === run && run.gen === gen) next();
}

function end(why) {
  const run = R; if (!run) return;
  const wasRunning = run.running;
  run.running = false; clearInterval(run.tick);
  board?.setInteractive(null);
  const saved = wasRunning || run.score ? saveRun(run.mode.id, run.score) : { best: getRush().best[run.mode.id] || 0, isBest: false };
  sfx(saved.isBest ? 'solved' : 'draw');
  R = null;
  release();
  results(run, why, saved);
}

// ---------- results ----------
function results(run, why, saved) {
  if (!view) return;
  const top = run.log.filter(x => x.ok).reduce((m, x) => Math.max(m, x.r), 0);
  view.innerHTML = `<div class="rush-intro rush-done">
    <div class="rush-hero"><small>${why === 'time' ? 'Time!' : why === 'strikes' ? 'Three strikes' : why === 'done' ? 'You ran out of puzzles!' : 'Run ended'}</small>
      <div class="rush-score">${run.score}</div>
      <p>${saved.isBest ? '<b class="gold">New best!</b>' : `Best: <b>${saved.best}</b>`} · ${run.mode.name}${top ? ` · hardest solved <b>${top}</b>` : ''}</p></div>
    <div class="rush-actions"><button class="btn btn-primary" data-again="${run.mode.id}">${icon('rematch')} Play again</button>
      <button class="btn btn-ghost" data-intro>${icon('clock')} Modes</button></div>
    ${run.log.length ? `<h3 class="sect">This run · tap one to try it again</h3><ul class="recent rush-log">${run.log.map((x, i) => `<li><a class="hist-row" href="#/puzzles/p/${encodeURIComponent(x.id)}">
      <span class="r ${x.ok ? 'win' : 'loss'}">${x.ok ? '✓' : '✗'}</span><span class="nm">Puzzle ${i + 1}<small>rating ${x.r}</small></span>${icon('chevron')}</a></li>`).join('')}</ul>` : ''}
  </div>`;
  view.onclick = e => {
    if (e.target.closest('[data-intro]')) { sfx('tap'); intro(); return; }
    const b = e.target.closest('[data-again]'); if (!b) return;
    sfx('tap'); start(MODES.find(m => m.id === b.dataset.again));
  };
}

// ---------- hud ----------
const side = c => (c === 'w' ? 'White' : 'Black');
function fmt(ms) { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
function renderClock() {
  const c = view && view.querySelector('.rush-clock'); if (!c) return;
  const ms = timeLeft();
  c.textContent = fmt(ms);
  c.classList.toggle('low', ms < 15000);
}
function renderHead() {
  const el = view && view.querySelector('.rush-head'); if (!el || !R) return;
  el.innerHTML = `<div class="rush-clock">${fmt(timeLeft())}</div>
    <div class="rush-sc"><small>Score</small><b>${R.score}</b></div>
    <div class="rush-x" aria-label="${R.strikes} of ${STRIKES} strikes">${Array.from({ length: STRIKES }, (_, i) => `<i class="${i < R.strikes ? 'on' : ''}">✗</i>`).join('')}</div>`;
}
function renderStrip() {
  const el = view && view.querySelector('.rush-strip'); if (!el || !R) return;
  el.innerHTML = R.log.length ? R.log.map(x => `<i class="${x.ok ? 'ok' : 'bad'}" title="${x.r}">${x.ok ? '✓' : '✗'}</i>`).join('')
    : `<span class="fine">Best ${getRush().best[R.mode.id] || 0} · ${R.mode.name}</span>`;
  el.scrollLeft = el.scrollWidth;
}
function setStatus(kind, html) {
  const el = view && view.querySelector('.pz-status'); if (!el) return;
  el.className = `pz-status ${kind}`; el.innerHTML = `<span>${html}</span>`;
  el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
}

// ---------- test hook ----------
window.__rushTest = () => R && {
  running: R.running, ready: !R.busy && !!R.cur, score: R.score, strikes: R.strikes, n: R.n, left: timeLeft(), id: R.cur?.p.id, rating: R.cur?.p.r,
  playExpected() { const e = R.cur.run.expected(); return e && onMoveAttempt({ from: e.slice(0, 2), to: e.slice(2, 4), promotion: e[4] }); },
  playWrong() {
    const e = R.cur.run.expected();
    const m = R.cur.run.chess.moves({ verbose: true }).find(x => lanOf(x) !== e && !x.san.includes('#'));
    return m && onMoveAttempt({ from: m.from, to: m.to, promotion: m.promotion });
  },
  burn(ms) { R.left -= ms; },
};
