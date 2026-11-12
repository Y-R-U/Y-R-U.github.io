import { h, esc, hex, num, ord, countUp, UI_ICON } from './kit.js';
import { ICON } from './hud.js';
import { LEAGUES, badgeSvg } from '../meta/leagues.js';
import { xpToNext } from '../meta/economy.js';

export function createResults({ root, app, onAgain, onMenu }) {
  const el = h(`<section class="screen results hidden">
    <div class="res-card">
      <div class="res-head"><div class="res-emote"></div><div class="res-place"></div><div class="res-sub"></div></div>
      <div class="res-body">
        <ol class="res-list"></ol>
        <div class="res-side">
          <div class="res-rewards"></div>
          <div class="res-btns">
            <button type="button" class="btn btn-primary again">PLAY AGAIN</button>
            <button type="button" class="btn btn-ghost to-menu">MENU</button>
          </div>
        </div>
      </div>
    </div>
  </section>`);
  root.appendChild(el);
  const $ = (s) => el.querySelector(s);
  $('.again').addEventListener('click', () => { app.audio.ui(); cancel(); onAgain(); });
  $('.to-menu').addEventListener('click', () => { app.audio.ui(); cancel(); onMenu(); });
  let timers = [];
  const later = (ms, f) => timers.push(setTimeout(f, ms));
  const cancel = () => { timers.forEach(clearTimeout); timers = []; };

  function show({ state, players, me = 0, report = null, practice = false, left = false }) {
    cancel();
    const sorted = state.crowds.slice().sort((a, b) => a.rank - b.rank);
    const mc = state.crowds[me];
    const place = report ? report.place : mc.rank;
    const won = place === 1 && !left;
    el.classList.toggle('won', won);
    $('.res-place').textContent = left ? 'LEFT MATCH' : won ? 'VICTORY!' : `${ord(place)} PLACE`;
    $('.res-sub').textContent = left ? 'Counted as last place' : won ? 'Biggest crowd in the city' : place <= 3 ? 'So close. Go again!' : 'The city is waiting. Go again!';
    const emote = $('.res-emote');
    emote.textContent = won ? app.emoteGlyph() : '';
    emote.classList.toggle('hidden', !won);
    const plate = 'plate-' + app.save.equip.plate;
    $('.res-list').innerHTML = sorted.map((c) => {
      const p = players[c.index], isMe = c.index === me;
      const lg = isMe ? (practice ? null : LEAGUES[app.save.league]) : p.league != null ? LEAGUES[p.league] : null;
      return `<li class="${isMe ? 'me ' + plate : ''}" style="--c:${hex(c.color)}">
        <span class="rl-rank">${c.rank === 1 ? ICON.crown : c.rank}</span>
        <span class="rl-ico">${ICON.person}</span>
        <span class="rl-flag">${esc(p.flag || '')}</span>
        <span class="rl-name">${esc(p.name)}</span>
        <span class="rl-lg">${lg ? badgeSvg(lg, 16) : ''}</span>
        <span class="rl-n">${c.count}</span>
      </li>`;
    }).join('');

    const rw = $('.res-rewards');
    if (practice || !report) {
      rw.innerHTML = `<div class="rw-note">Practice match: no rating or coins.</div>
        <div class="rw-stats"><span>Best <b>${mc.best}</b></span><span>Absorbed <b>${mc.kills}</b></span><span>Recruited <b>${mc.recruited}</b></span></div>`;
    } else renderRewards(rw, report, mc);

    el.classList.remove('hidden');
    void el.offsetWidth;
    el.classList.add('in');
  }

  function renderRewards(rw, R, mc) {
    const lgB = LEAGUES[R.before.league], lgA = LEAGUES[R.after.league];
    const dCls = R.delta > 0 ? 'up' : R.delta < 0 ? 'down' : '';
    const rankGain = R.before.rank - R.after.rank;
    rw.innerHTML = `
      <div class="rw-rating">
        <span class="rw-lg">${badgeSvg(lgB, 34)}</span>
        <span class="rw-rv"><b class="rw-r">${num(R.before.rating)}</b> pts <i class="rw-d ${dCls}">${R.delta > 0 ? '+' : ''}${R.delta}</i></span>
        <span class="rw-rank"><span class="rw-rk">#${num(R.before.rank)}</span>${rankGain ? `<i class="${rankGain > 0 ? 'up' : 'down'}">${rankGain > 0 ? UI_ICON.up : UI_ICON.down}${num(Math.abs(rankGain))}</i>` : ''}</span>
      </div>
      <div class="rw-promo hidden"></div>
      <ul class="rw-coins">${R.coins.map((c) => `<li class="hidden"><span>${esc(c.label)}</span><b>+${num(c.n)}</b></li>`).join('')}</ul>
      <div class="rw-total">${UI_ICON.coin}<b>+0</b><span class="rw-bank">${UI_ICON.coin}<i>${num(R.before.coins)}</i></span></div>
      <div class="rw-xp"><span class="rw-lv">Lv <b>${R.before.level}</b></span><span class="bar"><i></i></span><span class="rw-xpn">+${num(R.xp)} XP</span></div>
      ${R.challenge ? `<div class="rw-daily ${R.challenge.done ? 'done' : ''}">${UI_ICON.star}<span>${esc(R.challenge.ch.text)}</span><b>${R.challenge.done ? 'DONE!' : `${num(R.challenge.progress)}/${num(R.challenge.ch.target)}`}</b></div>` : ''}
      <div class="rw-stats"><span>Best <b>${mc.best}</b></span><span>Absorbed <b>${mc.kills}</b></span><span>Recruited <b>${mc.recruited}</b></span></div>`;
    const rEl = rw.querySelector('.rw-r'), rkEl = rw.querySelector('.rw-rk');
    later(350, () => {
      countUp(rEl, R.before.rating, R.after.rating, 900);
      countUp(rkEl, R.before.rank, R.after.rank, 900, (v) => '#' + num(v));
    });
    const rows = [...rw.querySelectorAll('.rw-coins li')];
    let t = 700;
    rows.forEach((li) => { later(t, () => { li.classList.remove('hidden'); app.audio.ui(); }); t += 260; });
    const totalEl = rw.querySelector('.rw-total b'), bankEl = rw.querySelector('.rw-bank i');
    later(t, () => {
      countUp(totalEl, 0, R.total, 800, (v) => '+' + num(v));
      countUp(bankEl, R.before.coins, R.after.coins, 1100);
      if (R.total > 0) rw.querySelector('.rw-total').classList.add('pop');
    });
    t += 500;
    const bar = rw.querySelector('.rw-xp .bar i'), lvEl = rw.querySelector('.rw-lv b');
    bar.style.width = (100 * R.before.xp / xpToNext(R.before.level)).toFixed(1) + '%';
    let lv = R.before.level;
    const fillTo = () => {
      if (lv < R.after.level) {
        bar.style.width = '100%';
        later(520, () => {
          lv++;
          lvEl.textContent = lv;
          rw.querySelector('.rw-xp').classList.add('lvup');
          bar.style.transition = 'none'; bar.style.width = '0%'; void bar.offsetWidth; bar.style.transition = '';
          later(60, fillTo);
        });
      } else bar.style.width = (100 * R.after.xp / xpToNext(R.after.level)).toFixed(1) + '%';
    };
    later(t, fillTo);
    t += 700 + (R.after.level - R.before.level) * 600;
    if (R.promoted || R.demoted) {
      later(t, () => {
        const p = rw.querySelector('.rw-promo');
        p.innerHTML = `${badgeSvg(lgA, 44)}<span>${R.promoted ? 'PROMOTED TO' : 'DOWN TO'} <b style="color:${lgA.color}">${esc(lgA.name.toUpperCase())}</b></span>`;
        p.classList.toggle('demo', !!R.demoted);
        p.classList.remove('hidden');
        rw.querySelector('.rw-lg').innerHTML = badgeSvg(lgA, 34);
        if (R.promoted) app.audio.lead(true);
      });
    }
  }

  return { show, hide() { cancel(); el.classList.add('hidden'); el.classList.remove('in'); } };
}
