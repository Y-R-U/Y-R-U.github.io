import { h, esc, num, UI_ICON, MODE_ICON, EV_ICON } from './kit.js';
import { LEAGUES, badgeSvg } from '../meta/leagues.js';
import { rankOf } from '../meta/ladder.js';
import { xpToNext } from '../meta/economy.js';
import { challengeState, loginState } from '../meta/daily.js';
import { GLOBE } from './online.js';
import { CONFIG } from '../config.js';
import { liveEvents, featuredMode, EVENTS, fmtCountdown } from '../meta/events.js';
import { seasonAt } from '../meta/season.js';


export function createMenu({ root, app, onPlay, onPractice, open }) {
  const el = h(`<section class="screen menu hidden">
    <div class="m-top">
      <button type="button" class="m-profile" data-open="profile" aria-label="Profile and stats">
        <span class="m-lg"></span>
        <span class="m-who"><b class="m-name"></b><span class="m-lvl"><i class="m-lvl-n"></i><span class="m-xp"><i></i></span></span></span>
      </button>
      <button type="button" class="m-coins pill-btn" data-open="locker" aria-label="Coins">${UI_ICON.coin}<b></b></button>
    </div>
    <button type="button" class="m-rank" data-open="ladder"><span class="m-rank-l"></span><span class="m-rank-r"></span><span class="m-rank-n"></span></button>
    <div class="m-mid">
      <h1 class="logo"><span>THRONG</span></h1>
      <p class="tagline">Gather the biggest crowd in the city</p>
      <div class="m-modes" role="radiogroup" aria-label="Game mode">${CONFIG.MODE_ORDER.map((m) => `<button type="button" role="radio" data-mode="${m}">${MODE_ICON[m]}<span>${esc(CONFIG.MODES[m].short)}</span><i class="m-feat hidden">×1.5</i></button>`).join('')}</div>
      <div class="m-play-row"><button type="button" class="btn btn-primary play">PLAY</button>
        <button type="button" class="btn btn-online m-online hidden" data-open="online">${GLOBE}<span>ONLINE</span></button></div>
      <button type="button" class="m-practice">Practice <small>· offline, no rating</small></button>
    </div>
    <button type="button" class="m-event hidden" data-open="events"><span class="me-ico"></span><span class="me-t"></span><span class="me-c"></span></button>
    <button type="button" class="m-season hidden" data-open="profile"></button>
    <button type="button" class="m-daily" data-open="daily"><span class="md-ico">${UI_ICON.star}</span><span class="md-t"></span><span class="md-p"></span></button>
    <nav class="m-nav">
      <button type="button" data-open="locker">${UI_ICON.locker}<span>Locker</span></button>
      <button type="button" data-open="ladder">${UI_ICON.ladder}<span>Ladder</span></button>
      <button type="button" data-open="daily">${UI_ICON.daily}<span>Daily</span><i class="dot hidden"></i></button>
      <button type="button" data-open="events">${EV_ICON}<span>Events</span><i class="dot ev-dot hidden"></i></button>
      <button type="button" data-open="settings">${UI_ICON.gear}<span>Settings</span></button>
    </nav>
  </section>`);
  root.appendChild(el);
  const $ = (s) => el.querySelector(s);
  el.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => { app.audio.ui(); open(b.dataset.open); }));
  $('.play').addEventListener('click', () => { app.audio.ui(); onPlay(); });
  $('.m-practice').addEventListener('click', () => { app.audio.ui(); onPractice(); });
  el.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => { app.audio.ui(); app.setMode(b.dataset.mode); }));
  $('.m-season').addEventListener('click', () => { if (app.seasonReport) { app.seasonReport.seen = true; } });
  let evTimer = 0;
  function tickEvent() {
    const live = liveEvents().filter((w) => w.id !== 'motd');
    const b = $('.m-event');
    if (!live.length) { b.classList.add('hidden'); return; }
    const w = live[0], d = EVENTS[w.id];
    b.classList.remove('hidden');
    b.style.setProperty('--c', d.color);
    $('.me-ico').textContent = d.icon;
    $('.me-t').textContent = (live.length > 1 ? `${d.short} +${live.length - 1}` : d.name) + ' · LIVE';
    $('.me-c').textContent = 'ends in ' + fmtCountdown(w.end - Date.now());
  }

  function refresh() {
    const s = app.save, lg = LEAGUES[s.league];
    $('.m-lg').innerHTML = badgeSvg(lg, 40);
    $('.m-name').textContent = app.playerName();
    $('.m-lvl-n').textContent = 'Lv ' + s.level;
    $('.m-xp i').style.width = (100 * s.xp / xpToNext(s.level)).toFixed(1) + '%';
    $('.m-coins b').textContent = num(s.coins);
    $('.m-rank-l').innerHTML = badgeSvg(lg, 20) + `<b style="color:${lg.color}">${esc(lg.name.toUpperCase())}</b>`;
    $('.m-rank-r').textContent = num(s.rating) + ' pts';
    $('.m-rank-n').textContent = '#' + num(rankOf(s.rating));
    const c = challengeState(s);
    $('.md-t').textContent = c.ch.text;
    $('.md-p').innerHTML = c.done ? `${UI_ICON.check}` : `${num(c.progress)}/${num(c.ch.target)} <span class="md-c">${UI_ICON.coin}${c.ch.coins}</span>`;
    $('.m-daily').classList.toggle('done', c.done);
    $('.m-nav .dot').classList.toggle('hidden', !loginState(s).canClaim);
    $('.m-online').classList.toggle('hidden', !(app.net && app.net.visible));
    const feat = featuredMode(Date.now());
    el.querySelectorAll('[data-mode]').forEach((b) => {
      const on = b.dataset.mode === app.mode;
      b.classList.toggle('on', on); b.setAttribute('aria-checked', on ? 'true' : 'false');
      b.querySelector('.m-feat').classList.toggle('hidden', b.dataset.mode !== feat);
    });
    $('.play').textContent = app.mode === 'classic' ? 'PLAY' : 'PLAY ' + CONFIG.MODES[app.mode].short.toUpperCase();
    const sa = seasonAt();
    $('.m-rank-n').textContent = '#' + num(rankOf(s.rating)) + ` · S${sa.n} · ${sa.daysLeft}d`;
    const rep = app.seasonReport;
    const sb = $('.m-season');
    sb.classList.toggle('hidden', !rep || !!rep.seen);
    if (rep && !rep.seen) sb.innerHTML = `${UI_ICON.star}<span><b>Season ${rep.to} has started.</b> ${rep.played ? `Season ${rep.from}: peak ${esc(LEAGUES[rep.peak].name)}, +${num(rep.coins)} coins and a trophy.` : ''} Rating eased ${num(rep.before)} → ${num(rep.after)}.</span>`;
    tickEvent();
  }

  return {
    el, refresh,
    show() { refresh(); el.classList.remove('hidden'); clearInterval(evTimer); evTimer = setInterval(tickEvent, 1000); },
    hide() { el.classList.add('hidden'); clearInterval(evTimer); },
  };
}
