import { botHue } from './game.js';
import { h, esc, icon, fmtInt, avatar } from '../ui.js';
import { standings } from '../ladder.js';
import { getLadder, getStats } from '../store.js';
import { parseTc } from '../clock.js';

export const ROUTE = 'ladder';
const RES = { win: 'W', draw: 'D', loss: 'L' };

function ago(t) {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function render(app, { tab }) {
  const rows = standings();
  const me = rows.find(r => r.you);
  const next = rows[me.rank - 2];
  const lad = getLadder(), st = getStats();
  const el = h(`<section class="screen ladder">
    <div class="lad-me card card-accent">
      <div class="lm-rank"><small>Your rank</small><b>#${me.rank}</b><span>of ${rows.length}</span></div>
      <div class="lm-stats">
        <div><small>Points</small><b>${fmtInt(lad.points)}</b></div>
        <div><small>Ladder Elo</small><b>${lad.elo}</b></div>
        <div><small>Games</small><b>${fmtInt(lad.games)}</b></div>
      </div>
      ${next ? `<div class="lm-next">${icon('trophy')} <span>Next: <b>${esc(next.name)}</b> · ${fmtInt(next.score - me.score + 1)} pts to pass</span></div>` : ''}
    </div>
    <div class="tabs" role="tablist">
      <a role="tab" href="#/ladder" class="${tab === 'board' ? 'on' : ''}">Leaderboard</a>
      <a role="tab" href="#/ladder/stats" class="${tab === 'stats' ? 'on' : ''}">My stats</a>
    </div>
    <div class="tab-body"></div>
  </section>`);
  const body = el.querySelector('.tab-body');
  if (tab === 'board') {
    const podium = rows.slice(0, 3);
    body.innerHTML = `<div class="podium">${[1, 0, 2].map(i => { const r = podium[i]; return `<div class="pod p${i + 1}${r.you ? ' you' : ''}">
        ${avatar(r.you ? 'lion' : r.flag, { label: r.name, size: 'lg', hue: r.hue })}<b>${esc(r.name)}</b><span>${fmtInt(r.score)}</span><i>${i + 1}</i></div>`; }).join('')}</div>
      <ol class="lb">${rows.slice(3).map(r => `<li class="${r.you ? 'you' : ''}" ${r.you ? 'id="lb-you"' : ''}>
        <span class="lb-rank">${r.rank}</span>${avatar(r.you ? 'lion' : r.flag, { label: r.name, size: 'sm', hue: r.hue })}
        <span class="lb-name">${esc(r.name)}${r.you ? ' <em>you</em>' : ''}</span><span class="lb-score">${fmtInt(r.score)}</span></li>`).join('')}</ol>
      <p class="fine">Points come from bot games: wins and draws against stronger bots pay out far more. Rivals keep playing too.</p>`;
    requestAnimationFrame(() => {
      const you = el.querySelector('#lb-you');
      const sc = document.querySelector('#view');
      if (you && sc) sc.scrollTop = Math.max(0, you.offsetTop - sc.clientHeight / 2);
    });
  } else {
    const total = Math.max(1, st.w + st.d + st.l);
    const bots = app.deps.bots.BOTS.slice().sort((a, b) => a.elo - b.elo).filter(b => st.perBot[b.id]);
    body.innerHTML = `
      <div class="wdl"><div class="wdl-bar"><i class="w" style="flex:${st.w}"></i><i class="d" style="flex:${st.d}"></i><i class="l" style="flex:${st.l}"></i>${st.games ? '' : '<i class="none" style="flex:1"></i>'}</div>
        <div class="wdl-legend"><span><b class="good">${st.w}</b> wins</span><span><b>${st.d}</b> draws</span><span><b class="bad">${st.l}</b> losses</span><span>${Math.round(100 * st.w / total)}% won</span></div></div>
      <div class="best card">${icon('trophy')}<div><small>Best win</small><b>${st.bestWin ? `${esc(st.bestWin.name)} <span class="elo">${st.bestWin.elo}</span>` : 'None yet: go beat someone!'}</b></div></div>
      ${bots.length ? `<h3 class="sect">Record by bot</h3><div class="perbot">${bots.map(b => { const r = st.perBot[b.id]; return `<a class="pb-row" href="#/play/bot/${esc(b.id)}">
        ${avatar(b.avatar, { label: b.name, size: 'sm', hue: botHue(b) })}<span class="nm">${esc(b.name)} <span class="elo">${b.elo}</span></span>
        <span class="rec"><i class="good">${r.w}</i>/<i>${r.d}</i>/<i class="bad">${r.l}</i></span></a>`; }).join('')}</div>` : ''}
      ${st.recent && st.recent.length ? `<h3 class="sect">Recent games</h3><ul class="recent">${st.recent.slice(0, 12).map(g => `<li>
        <span class="r ${g.result}">${RES[g.result]}</span><span class="nm">${esc(g.name)} <span class="elo">${g.elo}</span><small>${parseTc(g.tc).label} · ${ago(g.at)}${g.assisted ? ' · assisted' : ''}</small></span><span class="pts">+${fmtInt(g.pts)}</span></li>`).join('')}</ul>` : ''}
      ${st.games ? '' : `<div class="ph-cta"><a class="btn btn-primary" href="#/play/bot">${icon('robot')} Play your first bot</a></div>`}`;
  }
  return { el, top: { title: 'Bot Ladder', back: '#/home' } };
}
