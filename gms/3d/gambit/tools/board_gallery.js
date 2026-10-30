// GAMBIT board gallery: lineup (pieces on both square colours, any view, side by side),
// turntable, and a playground that plays random legal moves to watch move/battle anims.
// URL: ?theme=classic&view=top|default|angle|all&mode=lineup|turntable|play&auto=1&speed=1
//      &anim=<label|fn name>  force that move/battle anim whenever it fits the piece (labels listed under the board)
//      &ambient=0             turn the idle glow flicker / environment life off
import { createBoard } from '../js/board/board.js';
import { themeIds, loadTheme } from '../js/themes/index.js';

const Q = new URLSearchParams(location.search);
const state = {
  theme: Q.get('theme') || 'classic',
  view: Q.get('view') || 'all',
  mode: Q.get('mode') || 'lineup',
  speed: Q.get('speed') || '1',
};
// each black piece on a light AND a dark square (ranks 7 and 6), same for white (3 and 2)
const LINEUP = Q.get('fen') || '8/pnbrqk2/1pnbrqk1/8/8/1PNBRQK1/PNBRQK2/8 w - - 0 1';
// contrast check: black pawns/king/knight/rook on DARK squares, gold on LIGHT squares
export const CONTRAST_FEN = '1n1k3r/p1p1p1p1/1p1p4/8/8/8/P1P1P1P1/1N1Q1K2 w - - 0 1';
const boards = [];
window.G = { boards, state };

const $ = s => document.querySelector(s);
const themeSel = $('#theme');
for (const id of themeIds()) themeSel.add(new Option(id, id));
themeSel.value = state.theme;
themeSel.onchange = () => { state.theme = themeSel.value; loadTheme(state.theme).then(t => { G.theme = t; }); boards.forEach(b => b.setTheme(state.theme)); syncUrl(); };
document.querySelectorAll('#modes button').forEach(b => b.onclick = () => { state.mode = b.dataset.mode; syncUrl(); render(); });
document.querySelectorAll('#views button').forEach(b => b.onclick = () => {
  state.view = b.dataset.view; syncUrl();
  if (state.mode === 'lineup') render(); else boards.forEach(x => x.camera.preset(state.view === 'all' ? 'top' : state.view));
  marks();
});
function marks() {
  document.querySelectorAll('#modes button').forEach(b => b.classList.toggle('on', b.dataset.mode === state.mode));
  document.querySelectorAll('#views button').forEach(b => b.classList.toggle('on', b.dataset.view === state.view));
}
function syncUrl() {
  const u = new URL(location.href);
  for (const k of ['theme', 'view', 'mode']) u.searchParams.set(k, state[k]);
  history.replaceState(null, '', u);
}
function clear() { while (boards.length) boards.pop().dispose(); $('#main').innerHTML = ''; G.chess = null; stopAuto(); }

async function render() {
  clear(); marks();
  loadTheme(state.theme).then(t => { G.theme = t; });
  const main = $('#main');
  if (state.mode === 'lineup') {
    const views = state.view === 'all' ? ['top', 'tilt', 'angle'] : [state.view];
    const row = document.createElement('div'); row.className = 'row'; main.append(row);
    for (const v of views) {
      const cell = document.createElement('div'); cell.className = 'cell';
      cell.innerHTML = `<h2>${v}</h2><div class="host"></div>`; row.append(cell);
      boards.push(await createBoard(cell.querySelector('.host'), { theme: state.theme, fen: LINEUP, view: v, keyboard: views.length === 1 }));
    }
    main.insertAdjacentHTML('beforeend', '<div id="stats"></div>');
  } else if (state.mode === 'turntable') {
    main.innerHTML = '<div class="host tall"></div><div id="stats"></div>';
    const b = await createBoard(main.querySelector('.host'), { theme: state.theme, fen: LINEUP, view: state.view === 'all' ? 'angle' : state.view });
    b.camera.setAutoRotate(0.35); boards.push(b);
  } else {
    await playground(main);
  }
  showStats();
}

// ------------------------------------------------------------------ playground
let auto = 0;
function stopAuto() { auto = 0; }
async function playground(main) {
  const { Chess } = await import('../js/chess/chess.js');
  const chess = new Chess();
  G.chess = chess;
  main.innerHTML = `
    <div id="controls">
      <button id="rnd">Random move</button><button id="cap">Capture!</button><button id="auto">Autoplay</button>
      <span class="grp" id="spd"><button data-s="off">Off</button><button data-s="1">1×</button><button data-s="2">2×</button><button data-s="5">5×</button></span>
      <button id="flip">Flip</button><button id="reset">Reset view</button><button id="new">New game</button>
      <button id="castle">Castle demo</button><button id="ep">En passant demo</button><button id="promoD">Promotion demo</button>
      <button id="arrows">Arrows/hint</button>
    </div>
    <div class="host tall"></div><div id="stats"></div>`;
  const host = main.querySelector('.host');
  const b = await createBoard(host, {
    theme: state.theme, view: state.view === 'all' ? 'top' : state.view, interactive: 'both', animSpeed: state.speed,
    forceAnim: Q.get('anim') || null, ambientAnim: Q.get('ambient') !== '0',
    legalMoves: sq => chess.moves({ square: sq, verbose: true }).map(m => m.to),
  });
  boards.push(b);
  const sync = () => b.highlight({ check: chess.inCheck() ? chess.turn() : null });
  b.onMoveAttempt = ({ from, to, promotion }) => {
    const v = chess.move(promotion ? { from, to, promotion } : { from, to });
    if (!v) return false;
    b.applyMove(v, { battle: !!v.captured }).then(sync);
    return true;
  };
  b.onPromotion = ({ to, color }) => new Promise(res => {
    const el = $('#promo'), r = host.getBoundingClientRect(), p = b.squareToScreen(to, 0.5);
    el.innerHTML = ''; el.style.display = 'flex';
    el.style.left = `${r.left + scrollX + p.x}px`; el.style.top = `${r.top + scrollY + p.y}px`;
    for (const t of 'qrbn') {
      const btn = document.createElement('button'); btn.textContent = { q: '♕', r: '♖', b: '♗', n: '♘' }[t];
      btn.onclick = () => { el.style.display = 'none'; res(t); }; el.append(btn);
    }
    const x = document.createElement('button'); x.textContent = '✕'; x.onclick = () => { el.style.display = 'none'; res(null); }; el.append(x);
  });
  const play = async (preferCapture) => {
    if (chess.isGameOver()) { chess.reset(); await b.setPosition(chess.fen()); }
    const ms = chess.moves({ verbose: true });
    const caps = ms.filter(m => m.captured);
    const pool = preferCapture && caps.length ? caps : ms;
    const m = pool[(Math.random() * pool.length) | 0];
    const v = chess.move(m.lan || { from: m.from, to: m.to, promotion: m.promotion });
    await b.applyMove(v, { battle: !!v.captured });
    sync();
  };
  const scripted = async (fen, lan) => { chess.load(fen); await b.setPosition(fen); b.highlight({ lastMove: null }); await wait(350); const v = chess.move(lan); await b.applyMove(v, { battle: !!v.captured }); sync(); };
  $('#rnd').onclick = () => play(false);
  $('#cap').onclick = () => play(true);
  $('#auto').onclick = async () => {
    if (auto) { stopAuto(); $('#auto').classList.remove('on'); return; }
    const me = ++auto; $('#auto').classList.add('on');
    while (auto === me) { await play(Math.random() < 0.5); await wait(250); }
  };
  document.querySelectorAll('#spd button').forEach(x => x.onclick = () => { state.speed = x.dataset.s; b.setAnimSpeed(state.speed); spdMarks(); });
  const spdMarks = () => document.querySelectorAll('#spd button').forEach(x => x.classList.toggle('on', x.dataset.s === String(state.speed)));
  spdMarks();
  $('#flip').onclick = () => b.setOrientation(b.orientation === 'w' ? 'b' : 'w');
  $('#reset').onclick = () => b.camera.reset();
  $('#new').onclick = () => { chess.reset(); b.setPosition(chess.fen(), { animate: true }); };
  $('#castle').onclick = () => scripted('r3k2r/pppq1ppp/2npbn2/4p3/2B1P3/2NP1N2/PPPQ1PPP/R3K2R w KQkq - 0 1', 'e1g1');
  $('#ep').onclick = () => scripted('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1', 'e5d6');
  $('#promoD').onclick = () => scripted('3r2k1/2P5/8/8/8/8/8/4K3 w - - 0 1', 'c7d8q');
  $('#arrows').onclick = () => { b.showArrows([{ from: 'g1', to: 'f3' }, { from: 'e2', to: 'e4', color: 'good' }]); b.highlight({ hint: { from: 'd2', to: 'd4' } }); };
  if (Q.get('auto') === '1') $('#auto').click();
}
const wait = ms => new Promise(r => setTimeout(r, ms));

function showStats() {
  clearInterval(showStats.t);
  showStats.t = setInterval(() => {
    const el = $('#stats'); if (!el || !boards.length) return;
    const s = boards[0].stats();
    const pieces = Object.entries(s.pieces || {}).filter(([k]) => k[0] === 'w').map(([k, v]) => `${k[1]}:${v.tris}`).join(' ');
    const th = G.theme;
    const labels = th ? ['moveAnims', 'battleAnims'].map(k => (th[k] || []).map(a => a.label || a.name).filter(Boolean).join(', ')).join(' | ') : '';
    el.textContent = `anims (?anim=): ${labels}${Q.get('anim') ? `  [forced: ${Q.get('anim')}]` : ''}\ndraw calls ${s.drawCalls} · tris ${s.triangles} · frame CPU ${s.frameMs} ms · fps ${s.fps} · dpr ${s.pixelRatio}\ntris/piece ${pieces}`;
  }, 500);
}

render();
