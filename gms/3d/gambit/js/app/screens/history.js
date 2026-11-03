// Game history: #/history (online + bot games), #/history/online/<id> and #/history/bot/<at> (replay).
// Online games come from the server (/api/players/<pid>); the last fetch is cached locally so the
// list and the Home totals still show offline. Bot games come from gambit.stats.recent.
import { h, esc, icon, toast } from '../ui.js';
import { getStats, getSettings } from '../store.js';
import { parseTc } from '../clock.js';
import { acquire } from '../boardhost.js';
import { createReview, reviewNavHtml, movesHtml } from '../review.js';
import { net, ensureCss, tcFull } from './online_common.js';

export const ROUTE = 'history';
const CACHE = 'gambit.local.onlineHistory';
const REASON = {
  checkmate: 'checkmate', stalemate: 'stalemate', repetition: 'repetition', fifty: '50-move rule',
  material: 'insufficient material', timeout: 'on time', resign: 'resignation', agreement: 'agreement',
  abandoned: 'opponent left', aborted: 'aborted', abort: 'aborted',
};
const RES = { win: 'W', draw: 'D', loss: 'L' };

export function readOnlineCache() {
  try { const v = JSON.parse(localStorage.getItem(CACHE) || 'null'); return v && Array.isArray(v.recent) ? v : null; } catch { return null; }
}
function writeOnlineCache(v) { try { localStorage.setItem(CACHE, JSON.stringify(v)); } catch { /* full / blocked */ } }

/** Online W/D/L totals (all categories) from the cache, or null. */
export function onlineTotals() {
  const c = readOnlineCache();
  if (!c) return null;
  const t = { games: 0, w: 0, d: 0, l: 0 };
  const rs = Object.values(c.ratings || {});
  if (rs.some(r => r && 'wins' in r)) for (const r of rs) { t.w += r.wins || 0; t.d += r.draws || 0; t.l += r.losses || 0; }
  else for (const g of c.recent) t[outcome(g)[0]] += 1;   // older server: count what we have
  t.games = t.w + t.d + t.l;
  const [cat, best] = Object.entries(c.ratings || {}).sort((a, b) => (b[1]?.games || 0) - (a[1]?.games || 0) || (b[0] === c.recent[0]?.cat) - (a[0] === c.recent[0]?.cat))[0] || [];
  if (best && best.games) t.rating = { cat, r: best.r, prov: best.prov };   // most played; ties -> the latest game's
  return t;
}

function outcome(g) {
  if (g.result === '1/2-1/2') return 'draw';
  if (g.result === '1-0') return g.color === 'w' ? 'win' : 'loss';
  if (g.result === '0-1') return g.color === 'b' ? 'win' : 'loss';
  return 'draw';
}
function ago(t) {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d ago`;
  return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
const tcText = tc => { try { return tc === 'unlimited' ? 'Unlimited' : tcFull(tc); } catch { return String(tc); } };

async function pull() {
  const p = await net._get(`/api/players/${encodeURIComponent(net.me.pid)}?limit=100`);
  const v = { pid: net.me.pid, name: p.name, ratings: p.ratings || {}, recent: p.recent || [], at: Date.now() };
  writeOnlineCache(v);
  return v;
}

/** Connect (if a server exists) and refresh the cached online history. Resolves to the cache or null. */
async function fetchOnline() {
  if (!net.configured || !(await net.available())) return readOnlineCache();
  const name = getSettings().onlineName || '';
  await Promise.race([net.connect(name ? { name } : {}), new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 8000))]);
  return net.me && net.me.pid ? pull() : readOnlineCache();
}

// Keep the cache (and so the Home totals) current whenever the app is online anyway.
const quietPull = () => { if (net.me && net.me.pid) pull().catch(() => {}); };
net.on('welcome', () => setTimeout(quietPull, 300));
net.on('end', () => setTimeout(quietPull, 800));

export function mount(el, ctx) {
  const [kind, id] = (ctx.params.rest || '').split('/');
  if ((kind === 'online' || kind === 'bot') && id) return replay(el, ctx, kind, decodeURIComponent(id));
  return list(el, ctx, kind === 'online' || kind === 'bots' ? kind : 'all');
}

// ---------- list ----------
function list(el, ctx, tab) {
  ctx.setTop({ title: 'History', back: '#/home' });
  ensureCss().catch(() => {});
  let left = false;
  let online = readOnlineCache(), status = online ? 'cached' : 'loading';
  const st = getStats();
  const bots = st.recent.map(g => ({ src: 'bot', at: g.at, outcome: g.result, g }));

  const draw = () => {
    if (left) return;
    const og = (online ? online.recent : []).map(g => ({ src: 'online', at: g.ended, outcome: outcome(g), g }));
    const rows = (tab === 'online' ? og : tab === 'bots' ? bots : [...og, ...bots]).sort((a, b) => b.at - a.at);
    const ot = onlineTotals();
    const sum = tab === 'bots' ? { w: st.w, d: st.d, l: st.l } : tab === 'online' ? (ot || { w: 0, d: 0, l: 0 })
      : { w: st.w + (ot ? ot.w : 0), d: st.d + (ot ? ot.d : 0), l: st.l + (ot ? ot.l : 0) };
    const total = Math.max(1, sum.w + sum.d + sum.l);
    el.innerHTML = `<div class="tabs" role="tablist">
        ${[['all', 'All'], ['online', 'Online'], ['bots', 'Bots']].map(([k, n]) => `<a role="tab" href="#/history${k === 'all' ? '' : '/' + k}" class="${tab === k ? 'on' : ''}">${n}</a>`).join('')}
      </div>
      <div class="wdl"><div class="wdl-bar"><i class="w" style="flex:${sum.w}"></i><i class="d" style="flex:${sum.d}"></i><i class="l" style="flex:${sum.l}"></i>${sum.w + sum.d + sum.l ? '' : '<i class="none" style="flex:1"></i>'}</div>
        <div class="wdl-legend"><span><b class="good">${sum.w}</b> wins</span><span><b>${sum.d}</b> draws</span><span><b class="bad">${sum.l}</b> losses</span><span>${Math.round(100 * sum.w / total)}% won</span></div></div>
      ${tab !== 'bots' && status !== 'ok' ? `<p class="fine hist-status">${status === 'loading' ? 'Loading online games…' : status === 'cached' ? 'Updating online games…' : status === 'none' ? 'No online server here: showing bot games.' : 'Couldn’t reach the online server: showing the last saved list.'}</p>` : ''}
      ${rows.length ? `<ul class="recent hist-list">${rows.slice(0, 150).map(rowHtml).join('')}</ul>`
        : `<p class="fine" style="text-align:center;margin-top:24px">No games yet.</p>`}
      ${tab !== 'online' && st.recent.length ? '<p class="fine">Bot games played before this update can’t be replayed (their moves weren’t saved).</p>' : ''}`;
  };
  draw();
  fetchOnline().then(v => { online = v; status = v ? 'ok' : 'none'; draw(); })
    .catch(e => { console.warn('[gambit] history', e); status = online ? 'offline' : 'none'; draw(); });
  return { leave() { left = true; } };
}

function rowHtml(r) {
  const g = r.g;
  if (r.src === 'online') {
    const opp = g.color === 'w' ? g.black : g.white;
    const d = g.rated && g.delta ? `<span class="pts ${g.delta < 0 ? 'neg' : ''}">${g.delta > 0 ? '+' : ''}${g.delta}</span>` : '';
    return `<li><a class="hist-row" href="#/history/online/${esc(g.id)}">
      <span class="r ${r.outcome}">${RES[r.outcome]}</span>
      <span class="nm">${icon('globe')} ${esc(opp)}${g.oppRating ? ` <span class="elo">${g.oppRating}</span>` : ''}
        <small>${esc(tcText(g.tc))} · ${REASON[g.reason] || esc(g.reason)}${g.plies ? ` · ${Math.ceil(g.plies / 2)} moves` : ''} · ${ago(g.ended)}${g.rated ? '' : ' · casual'}</small></span>${d}</a></li>`;
  }
  const can = Array.isArray(g.uci) && g.uci.length;
  const inner = `<span class="r ${r.outcome}">${RES[r.outcome]}</span>
      <span class="nm">${icon('robot')} ${esc(g.name)} <span class="elo">${g.elo}</span>
        <small>${parseTc(g.tc).label} · ${REASON[g.reason] || esc(g.reason || '')}${g.moves ? ` · ${Math.ceil(g.moves / 2)} moves` : ''} · ${ago(g.at)}${g.assisted ? ' · assisted' : ''}</small></span>
      <span class="pts">+${Math.round(g.pts)}</span>`;
  return `<li>${can ? `<a class="hist-row" href="#/history/bot/${g.at}">${inner}</a>` : `<div class="hist-row">${inner}</div>`}</li>`;
}

// ---------- replay ----------
function replay(root, ctx, kind, id) {
  root.classList.add('hist-gamewrap');
  ctx.setTop({ title: 'Replay', back: '#/history' });
  let left = false, lease = null, board = null, chess = null, info = null, flipped = false;
  const review = createReview({
    chess: () => chess, board: () => board,
    onExit: () => { if (board && chess) { board.setPosition(chess.fen(), { animate: false }); lastHi(); } },
  });
  const lastHi = () => {
    const h2 = chess.history({ verbose: true }), m = h2[h2.length - 1];
    board.highlight({ lastMove: m ? { from: m.from, to: m.to } : null, check: null, hint: null, legalTargets: [] });
  };

  const el = h(`<section class="screen game hist-game">
    <div class="g-stage"><div class="g-col">
      <div class="bar-top"></div>
      <div class="board-square"><div class="board-loading">Loading game…</div></div>
      <div class="bar-bottom"></div>
    </div></div>
    <aside class="g-panel"><div class="moves-box"><div class="moves-wrap"><ol class="moves"></ol></div>${reviewNavHtml()}</div>
      <div class="actions">
        <button class="act" data-act="start">${icon('back')}<span>Start</span></button>
        <button class="act" data-act="flip">${icon('flip')}<span>Flip</span></button>
        <button class="act" data-act="pgn">${icon('book')}<span>Copy PGN</span></button>
        <a class="act" href="#/history">${icon('clock')}<span>History</span></a>
      </div></aside>
  </section>`);
  root.replaceChildren(el);
  const unbind = review.bind(el);
  const live = el.querySelector('.rl-go'); if (live) live.textContent = 'End ▸';

  const bar = (name, rating, me, res) => `<div class="pbar ${me ? 'me' : 'opp'}"><div class="pbar-plate">
    <div class="pb-id" style="padding-left:10px"><div class="pb-name"><b>${esc(name)}</b>${rating ? `<span class="elo">${rating}</span>` : ''}</div>
    <div class="pb-res ${res === 'Won' ? 'good' : res === 'Lost' ? 'bad' : ''}">${res}</div></div></div></div>`;
  const renderBars = () => {
    const bottom = flipped ? (info.you === 'w' ? 'b' : 'w') : info.you;
    const side = c => bar(info[c].name, info[c].rating, c === info.you, info[c].res);
    el.querySelector('.bar-top').innerHTML = side(bottom === 'w' ? 'b' : 'w');
    el.querySelector('.bar-bottom').innerHTML = side(bottom);
    if (board) board.setOrientation(bottom);
  };

  const load = async () => {
    const { Chess } = ctx.app.deps.chess;
    let uci, sub;
    if (kind === 'online') {
      const g = await net.gameRecord(id);
      const cache = readOnlineCache(), myName = cache?.name;
      const row = cache?.recent.find(x => x.id === id);
      const you = row ? row.color : (myName && g.black === myName ? 'b' : 'w');
      const res = c => (g.result === '1/2-1/2' ? 'Draw' : (g.result === '1-0') === (c === 'w') ? 'Won' : 'Lost');
      info = { you, pgn: g.pgn, w: { name: g.white, rating: g.whiteRating, res: res('w') }, b: { name: g.black, rating: g.blackRating, res: res('b') } };
      uci = (g.moves || '').split(/\s+/).filter(Boolean);
      sub = `${tcText(g.tc)} · ${g.result.replace('1/2-1/2', '½–½')} · ${REASON[g.reason] || g.reason} · ${new Date(g.ended).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}`;
      ctx.setTop({ title: `${g.white} vs ${g.black}`, sub: esc(sub), back: '#/history' });
    } else {
      const g = getStats().recent.find(x => String(x.at) === id);
      if (!g || !Array.isArray(g.uci)) throw Object.assign(new Error('gone'), { code: 'not_found' });
      const you = g.color === 'b' ? 'b' : 'w', bot = you === 'w' ? 'b' : 'w';
      const yr = g.result === 'win' ? 'Won' : g.result === 'loss' ? 'Lost' : 'Draw';
      const br = g.result === 'win' ? 'Lost' : g.result === 'loss' ? 'Won' : 'Draw';
      info = { you, [you]: { name: 'You', rating: 0, res: yr }, [bot]: { name: g.name, rating: g.elo, res: br } };
      uci = g.uci;
      sub = `${parseTc(g.tc).label} · ${REASON[g.reason] || g.reason || ''} · ${new Date(g.at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}`;
      ctx.setTop({ title: `You vs ${g.name}`, sub: esc(sub), back: '#/history/bots' });
    }
    chess = new Chess();
    for (const u of uci) if (!chess.move(u)) { console.warn('[gambit] history: bad move', u); break; }
    if (!info.pgn) info.pgn = typeof chess.pgn === 'function' ? chess.pgn() : chess.history().join(' ');
    el.querySelector('.moves').innerHTML = movesHtml(chess.history(), { cur: false }) || '<li class="empty">No moves were played.</li>';
    renderBars();
  };

  lease = acquire(el.querySelector('.board-square'), { orientation: 'w', labels: true, onRevoke() { board = null; } });
  Promise.all([lease.ready, load()]).then(([b]) => {
    if (left || !b) return;
    board = b;
    el.querySelector('.board-loading')?.remove();
    board.setOrientation(flipped ? (info.you === 'w' ? 'b' : 'w') : info.you);
    board.setPosition(chess.fen(), { animate: false });
    lastHi();
    board.resize?.();
    review.sync();
  }).catch(e => {
    if (left) return;
    console.warn('[gambit] replay', e);
    const l = el.querySelector('.board-loading');
    if (l) l.textContent = e && e.code === 'not_found' ? 'That game isn’t available any more.' : 'Couldn’t load this game. Check your connection.';
  });

  el.addEventListener('click', e => {
    const a = e.target.closest('[data-act]'); if (!a || !chess) return;
    if (a.dataset.act === 'flip') { flipped = !flipped; renderBars(); }
    else if (a.dataset.act === 'start') review.show(0);
    else if (a.dataset.act === 'pgn') {
      navigator.clipboard?.writeText(info.pgn).then(() => toast('PGN copied', { ms: 1400 }), () => toast('Couldn’t copy'));
    }
  });
  const ro = new ResizeObserver(() => board && board.resize && board.resize());
  ro.observe(el.querySelector('.board-square'));

  return { leave() { left = true; ro.disconnect(); unbind(); lease && lease.release(); } };
}

