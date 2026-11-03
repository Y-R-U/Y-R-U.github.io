// Spectating: #/online/watch/<id>. Live board, clocks, move list (tap to review), watcher count.
// Watched games live in net.watched, never in net.games, so they never show as "your game".
import { h, esc, icon, toast } from '../ui.js';
import { getSettings } from '../store.js';
import { fmtClock } from '../clock.js';
import { playMove, play } from '../sound.js';
import { acquire } from '../boardhost.js';
import { createReview, reviewNavHtml, movesHtml } from '../review.js';
import { net, tcFull, ratingTxt, playerAvatar, nameOf } from './online_common.js';

const REASON = {
  checkmate: 'checkmate', stalemate: 'stalemate', repetition: 'threefold repetition', fifty: 'the 50-move rule',
  material: 'insufficient material', timeout: 'on time', resign: 'resignation', agreement: 'agreement',
  abandoned: 'a player left', aborted: 'aborted',
};

export function mountWatch(root, ctx, id) {
  const { Chess } = ctx.app.deps.chess;
  let left = false, g = null, chess = null, board = null, flipped = false, lease = null;
  const review = createReview({
    chess: () => chess, board: () => board,
    onExit: () => { if (board && chess) { board.setPosition(chess.fen(), { animate: false }); lastHi(); } },
  });
  const el = h(`<section class="screen game ol-game ol-watch">
    <div class="g-stage"><div class="g-col">
      <div class="bar-top"></div>
      <div class="board-square"><div class="board-loading">Joining the game…</div><div class="ol-watchbadge" hidden></div></div>
      <div class="bar-bottom"></div>
    </div></div>
    <aside class="g-panel"><div class="moves-box"><div class="moves-wrap"><ol class="moves"></ol></div>${reviewNavHtml()}</div>
      <div class="actions">
        <button class="act" data-act="flip">${icon('flip')}<span>Flip</span></button>
        <button class="act" data-act="link">${icon('user')}<span>Share link</span></button>
        <a class="act" href="#/online/watch">${icon('eye')}<span>More games</span></a>
      </div></aside>
  </section>`);
  root.replaceChildren(el);
  const unbind = review.bind(el);
  ctx.setTop({ title: 'Watching', back: '#/online' });

  const lastHi = () => {
    if (!board || review.on) return;
    const hist = chess.history({ verbose: true }), m = hist[hist.length - 1];
    let check = null;
    if (chess.inCheck()) check = chess.turn();
    board.highlight({ lastMove: m ? { from: m.from, to: m.to } : null, check, hint: null, legalTargets: [] });
  };
  const bottom = () => (flipped ? 'b' : 'w');
  function bar(c) {
    const p = (c === 'w' ? g.white : g.black) || {};
    const clk = net.clock(id) || {};
    const active = g.status === 'playing' && clk.turn === c;
    return `<div class="pbar opp${active ? ' active' : ''}"><div class="pbar-plate">
      ${playerAvatar(p, { size: 'sm' })}
      <div class="pb-id"><div class="pb-name"><b>${nameOf(p)}</b><span class="elo">${ratingTxt(p.rating, p.prov)}</span></div>
        <div class="pb-res">${c === 'w' ? 'White' : 'Black'}${g.status === 'ended' ? ` · ${resultFor(c)}` : ''}</div></div>
      <div class="clock${active ? ' on' : ''}${g.tc && g.tc.base ? '' : ' ol-corr'}" data-c="${c}">${clockText(c, clk)}</div>
    </div></div>`;
  }
  const resultFor = c => (g.result === '1/2-1/2' ? 'Draw' : (g.result === '1-0') === (c === 'w') ? 'Won' : 'Lost');
  function clockText(c, clk) {
    if (g.tc && g.tc.base) return fmtClock(clk[c] ?? g.tc.base);
    return g.status === 'playing' && clk.turn === c ? 'to move' : '∞';
  }
  function renderBars() {
    el.querySelector('.bar-top').innerHTML = bar(bottom() === 'w' ? 'b' : 'w');
    el.querySelector('.bar-bottom').innerHTML = bar(bottom());
  }
  function renderMoves() {
    let html = movesHtml(chess.history());
    if (g.status === 'ended') html += `<li class="res"><span>${String(g.result).replace('1/2-1/2', '½–½')}</span></li>`;
    el.querySelector('.moves').innerHTML = html || '<li class="empty">Waiting for the first move…</li>';
    const wrap = el.querySelector('.moves-wrap');
    if (review.on) review.sync(); else requestAnimationFrame(() => { wrap.scrollLeft = wrap.scrollWidth; wrap.scrollTop = wrap.scrollHeight; review.sync(); });
  }
  function renderBadge() {
    const b = el.querySelector('.ol-watchbadge');
    const n = g.watchers || 0;
    b.hidden = !n;
    b.innerHTML = `${icon('eye')} ${n} watching`;
  }
  function renderTop() {
    const end = g.status === 'ended' ? ` · ${String(g.result).replace('1/2-1/2', '½–½')} ${REASON[g.reason] || g.reason || ''}` : '';
    ctx.setTop({ title: `${esc(g.white?.name || 'White')} vs ${esc(g.black?.name || 'Black')}`, sub: `Watching · ${esc(tcFull(g.tc))}${end}`, back: '#/online' });
  }
  function rebuild() {
    chess = new Chess();
    for (const u of g.moves || []) if (!chess.move(u)) break;
    if (board && !review.on) { board.setPosition(chess.fen(), { animate: false }); lastHi(); }
    renderAll();
  }
  function renderAll() { renderBars(); renderMoves(); renderBadge(); renderTop(); }

  lease = acquire(el.querySelector('.board-square'), { orientation: 'w', labels: true, animSpeed: getSettings().onlineBattleSpeed ?? 2, onRevoke() { board = null; } });
  Promise.all([lease.ready, net.watch(id)]).then(([b, snap]) => {
    if (left) return;
    g = snap; board = b;
    el.querySelector('.board-loading')?.remove();
    rebuild();
    board?.resize?.();
  }).catch(e => {
    if (left) return;
    const l = el.querySelector('.board-loading');
    if (l) l.innerHTML = e && e.code === 'own_game' ? `This is your game. <a href="#/online/game/${esc(id)}">Play it</a>`
      : e && e.code === 'no_game' ? 'That game has finished or doesn’t exist.' : 'Couldn’t join the game. Check your connection.';
  });

  const offs = [
    net.on('wmove', ev => {
      if (ev.gameId !== id || !chess) return;
      g = ev.game;
      const v = chess.move(ev.uci);
      if (!v) { rebuild(); return; }
      playMove(v);
      if (board && !review.on) board.applyMove(v, { battle: !!v.captured, capMs: g.tc && g.tc.base ? 1200 : 0 }).then(lastHi).catch(() => {});
      renderBars(); renderMoves();
    }),
    net.on('wend', ev => {
      if (ev.gameId !== id || !g) return;
      g = ev.game; play('draw');
      renderAll();
      toast(g.result === '1/2-1/2' ? 'Draw' : `${g.result === '1-0' ? nameOf(g.white) : nameOf(g.black)} wins · ${REASON[g.reason] || g.reason}`, { ms: 3000 });
    }),
    net.on('wsync', ev => { if (ev.game && ev.game.id === id) { g = ev.game; rebuild(); } }),
    net.on('watchers', ev => { if (ev.gameId === id && g) { g.watchers = ev.n; renderBadge(); } }),
  ];
  const tick = setInterval(() => {
    if (!g || g.status !== 'playing' || !(g.tc && g.tc.base)) return;
    const clk = net.clock(id) || {};
    el.querySelectorAll('.clock[data-c]').forEach(c => { c.textContent = clockText(c.dataset.c, clk); c.classList.toggle('low', (clk[c.dataset.c] ?? 1e9) < 20000); });
  }, 200);
  el.addEventListener('click', e => {
    const a = e.target.closest('[data-act]'); if (!a || !g) return;
    play('tap');
    if (a.dataset.act === 'flip') { flipped = !flipped; board?.setOrientation(bottom()); renderBars(); }
    else if (a.dataset.act === 'link') {
      const url = location.href.split('#')[0] + `#/online/watch/${id}`;
      (navigator.share ? navigator.share({ title: 'Watch this GAMBIT game', url }) : navigator.clipboard.writeText(url).then(() => toast('Link copied', { ms: 1400 }))).catch(() => {});
    }
  });
  const ro = new ResizeObserver(() => board && board.resize && board.resize());
  ro.observe(el.querySelector('.board-square'));

  return { leave() { left = true; clearInterval(tick); ro.disconnect(); offs.forEach(f => f()); unbind(); lease && lease.release(); net.unwatch(id); } };
}

