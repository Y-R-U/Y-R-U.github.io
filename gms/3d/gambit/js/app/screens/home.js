import { botHue } from './game.js';
import { h, esc, icon, fmtInt, avatar } from '../ui.js';
import { getResume, getStats, getLadder, clearResume } from '../store.js';
import { playerRank } from '../ladder.js';
import { parseTc } from '../clock.js';
import { knightMark } from '../main.js';
import { net, readHint } from '../net.js';
import { playerAvatar, tcFull, ratingTxt } from './online_common.js';

export const ROUTE = 'home';

function puzzleLine() {
  try {
    const p = JSON.parse(localStorage.getItem('gambit.puzzles') || 'null');
    const n = p && p.s ? Object.keys(p.s).length : 0;
    if (n) return `${n} solved · puzzle rating <b class="hl">${p.r || 800}</b>`;
  } catch { /* ignore */ }
  return 'Mates and tactics, easy to fiendish';
}

export function render(app) {
  const resume = getResume();
  const st = getStats(), lad = getLadder();
  const { rank, of } = playerRank();
  const bot = resume && app.deps.bots.BOTS.find(b => b.id === resume.botId);
  // online games in progress, from net.js's local hint (no server connection at boot)
  const online = net.configured ? readHint().slice(0, 2) : [];
  const el = h(`<section class="screen home">
    <div class="hero">
      <div class="hero-mark">${knightMark()}</div>
      <h1 class="wordmark">GAMBIT</h1>
      <p class="tagline">Chess with a little theatre.</p>
    </div>
    ${bot ? `<div class="continue card card-accent">
      ${avatar(bot.avatar, { size: 'lg', label: bot.name, hue: botHue(bot) })}
      <div class="continue-txt"><small>Game in progress</small><b>vs ${esc(bot.name)}</b>
        <span>${parseTc(resume.tc).label} · move ${Math.floor((resume.moves || []).length / 2) + 1}</span></div>
      <div class="continue-btns">
        <button class="btn btn-primary" data-act="resume">${icon('play')} Continue</button>
        <button class="btn btn-ghost btn-sm" data-act="discard">Discard</button>
      </div>
    </div>` : ''}
    ${online.map(g => `<div class="continue card card-accent ol-home-card">
      ${playerAvatar(g.opp, { size: 'lg' })}
      <div class="continue-txt"><small>Online game in progress</small><b>vs ${esc(g.opp.name)} <span class="elo">${ratingTxt(g.opp.rating, g.opp.prov)}</span></b>
        <span>${esc(tcFull(g.tc))} · ${g.rated ? 'Rated' : 'Casual'} · move ${Math.floor((g.plies || 0) / 2) + 1}</span></div>
      <div class="continue-btns"><a class="btn btn-primary" href="#/online/game/${esc(g.id)}">${icon('globe')} Return to game</a></div>
    </div>`).join('')}
    <nav class="home-menu">
      <a class="menu-item primary" href="#/play/bot">
        <span class="mi-ic">${icon('robot')}</span>
        <span class="mi-txt"><b>Play Bots</b><small>${app.deps.bots.BOTS.length} opponents · climb the ladder</small></span>
        <span class="mi-go">${icon('chevron')}</span></a>
      <a class="menu-item" href="#/online">
        <span class="mi-ic">${icon('globe')}</span>
        <span class="mi-txt"><b>Play Online</b><small>Quick match, lobby, play a friend</small></span>
        <span class="mi-go">${icon('chevron')}</span></a>
      <a class="menu-item" href="#/puzzles">
        <span class="mi-ic">${icon('puzzle')}</span>
        <span class="mi-txt"><b>Puzzles</b><small>${puzzleLine()}</small></span>
        <span class="mi-go">${icon('chevron')}</span></a>
      <a class="menu-item" href="#/ladder">
        <span class="mi-ic">${icon('trophy')}</span>
        <span class="mi-txt"><b>Ladder</b><small>Rank <b class="hl">#${rank}</b> of ${of} · ${fmtInt(lad.points)} pts</small></span>
        <span class="mi-go">${icon('chevron')}</span></a>
      <a class="menu-item" href="#/learn">
        <span class="mi-ic">${icon('book')}</span>
        <span class="mi-txt"><b>Learn</b><small>${learnLine()}</small></span>
        <span class="mi-go">${icon('chevron')}</span></a>
    </nav>
    <div class="home-stats">
      <div><b>${fmtInt(st.games)}</b><small>Games</small></div>
      <div><b class="good">${fmtInt(st.w)}</b><small>Wins</small></div>
      <div><b>${fmtInt(st.d)}</b><small>Draws</small></div>
      <div><b class="bad">${fmtInt(st.l)}</b><small>Losses</small></div>
      <div><b>${lad.elo}</b><small>Ladder Elo</small></div>
    </div>
  </section>`);
  el.addEventListener('click', e => {
    const a = e.target.closest('[data-act]'); if (!a) return;
    if (a.dataset.act === 'resume') app.go('#/game');
    if (a.dataset.act === 'discard') { clearResume(); app.go('#/home'); }
  });
  return { el, top: { logo: true } };
}

// Learn progress from gambit.learn without loading the course (27 lessons in js/learn/data.js).
const LEARN_TOTAL = 27;
function learnLine() {
  let done = 0;
  try { done = Object.keys(JSON.parse(localStorage.getItem('gambit.learn') || '{}').l || {}).length; } catch { /* blocked */ }
  return done ? `${done} of ${LEARN_TOTAL} lessons done` : 'Lessons from the basics up';
}
