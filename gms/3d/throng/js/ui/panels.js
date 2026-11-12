import { esc, num, UI_ICON } from './kit.js';
import { LEAGUES, badgeSvg, leagueOf } from '../meta/leagues.js';
import { LADDER, rankOf, around, top } from '../meta/ladder.js';
import { xpToNext } from '../meta/economy.js';
import { challengeState, loginState, claimLogin, msToRollover, LOGIN_REWARDS, dayKey } from '../meta/daily.js';

const row = (r, plate) => {
  const lg = leagueOf(r.rating);
  return `<li class="${r.me ? 'me ' + plate : ''}"><span class="ld-rk">${num(r.rank)}</span><span class="ld-flag">${esc(r.flag || '')}</span><span class="ld-n">${esc(r.name)}</span>${badgeSvg(r.me ? LEAGUES[r.lg] : lg, 18)}<span class="ld-r">${num(r.rating)}</span></li>`;
};

export function renderLadder(body, { app }) {
  const s = app.save, lg = LEAGUES[s.league], rank = rankOf(s.rating);
  const next = LEAGUES[s.league + 1];
  const rows = around(s.rating, { name: app.playerName(), flag: '' });
  rows.forEach((r) => { if (r.me) r.lg = s.league; });
  const tops = top(3).filter((t) => t.rank < rows[0].rank);
  body.innerHTML = `
    <div class="ld-me">${badgeSvg(lg, 52)}<div><div class="ld-lg" style="color:${lg.color}">${esc(lg.name.toUpperCase())} LEAGUE</div>
      <div class="ld-big">#${num(rank)} <small>of ${num(LADDER.population)}</small></div>
      <div class="ld-sub">${num(s.rating)} pts${next ? ` · ${num(Math.max(0, next.min - s.rating))} to ${esc(next.name)}` : ' · top league'}</div></div></div>
    <div class="ld-tiers">${LEAGUES.map((l) => `<span class="${l.index === s.league ? 'on' : l.index < s.league ? 'past' : ''}" title="${esc(l.name)}">${badgeSvg(l, 26)}<i>${l.index === 0 ? '0' : num(l.min)}</i></span>`).join('')}</div>
    <ol class="ld-list">${tops.map((r) => row(r)).join('')}${tops.length ? '<li class="gap">⋯</li>' : ''}${rows.map((r) => row(r, 'plate-' + s.equip.plate)).join('')}</ol>
    <p class="ld-note">Rating moves with where you finish against where your rank expects you to. The higher you climb, the tougher the crowds you meet.</p>`;
  requestAnimationFrame(() => body.querySelector('.ld-list .me')?.scrollIntoView({ block: 'nearest' }));
}

const fmtLeft = (ms) => { const m = Math.floor(ms / 60000); return `${Math.floor(m / 60)}h ${m % 60}m`; };

export function renderDaily(body, { app, rerender }) {
  const s = app.save, L = loginState(s), C = challengeState(s);
  const firstWin = s.daily.firstWinKey === dayKey();
  body.innerHTML = `
    <h3 class="sh-h">Login reward <small>· day ${L.day + 1} of 7</small></h3>
    <div class="dl-cal">${LOGIN_REWARDS.map((c, i) => {
      const st = i < L.day ? 'got' : i === L.day ? (L.canClaim ? 'today' : 'next') : '';
      return `<div class="dl-day ${st} ${i === 6 ? 'big' : ''}"><i>Day ${i + 1}</i>${UI_ICON.coin}<b>${c}</b>${i < L.day ? `<span class="dl-ok">${UI_ICON.check}</span>` : ''}</div>`;
    }).join('')}</div>
    <button type="button" class="btn ${L.canClaim ? 'btn-primary' : 'btn-ghost'} dl-claim" ${L.canClaim ? '' : 'disabled'}>${L.canClaim ? `CLAIM ${LOGIN_REWARDS[L.day]}` : `Come back in ${fmtLeft(msToRollover())}`}</button>
    <h3 class="sh-h">Today's challenge</h3>
    <div class="dc-card ${C.done ? 'done' : ''}">
      <div class="dc-t">${esc(C.ch.text)}</div>
      <div class="dc-bar"><i style="width:${(100 * C.progress / C.ch.target).toFixed(1)}%"></i><span>${C.done ? 'COMPLETE' : `${num(C.progress)} / ${num(C.ch.target)}`}</span></div>
      <div class="dc-r">${UI_ICON.coin}<b>${C.ch.coins}</b> <span>+${C.ch.xp} XP</span><small>New challenge in ${fmtLeft(msToRollover())}</small></div>
    </div>
    <div class="dc-fw ${firstWin ? 'done' : ''}">${UI_ICON.star}<span>First win of the day</span><b>${firstWin ? 'Claimed' : `+${120} ${UI_ICON.coin}`}</b></div>
    <p class="ld-note">Same challenge for everyone today. Days start at 00:00 UTC.</p>`;
  const btn = body.querySelector('.dl-claim');
  if (L.canClaim) btn.addEventListener('click', () => {
    const n = claimLogin(s);
    if (n > 0) {
      s.coins += n; s.stats.coinsEarned += n;
      app.persist(); app.audio.pickup('double'); app.changed();
      rerender();
      body.querySelectorAll('.dl-day')[L.day]?.classList.add('bought');
    }
  });
}

export function renderProfile(body, { app }) {
  const s = app.save, st = s.stats, lg = LEAGUES[s.league];
  const stat = (label, v) => `<div class="stat"><b>${v}</b><span>${label}</span></div>`;
  body.innerHTML = `
    <label class="name-field"><span>Your name</span>
      <input type="text" maxlength="14" autocomplete="off" autocorrect="off" spellcheck="false" placeholder="You" value="${esc(s.name)}"></label>
    <div class="pf-lv">${badgeSvg(lg, 40)}<div><b>Level ${s.level}</b><span class="bar"><i style="width:${(100 * s.xp / xpToNext(s.level)).toFixed(1)}%"></i></span><small>${num(s.xp)} / ${num(xpToNext(s.level))} XP · ${esc(lg.name)} · ${num(s.rating)} pts (best ${num(s.peakRating)})</small></div></div>
    <div class="pf-stats">
      ${stat('Matches', num(st.matches))}${stat('Wins', num(st.wins))}${stat('Top 3s', num(st.top3))}
      ${stat('Best crowd', num(st.bestCrowd))}${stat('Recruited', num(st.recruited))}${stat('Absorbed', num(st.absorbed))}
      ${stat('Win streak', num(st.streak))}${stat('Best streak', num(st.bestStreak))}${stat('Crown time', fmtSecs(st.crownSecs))}
    </div>`;
  const input = body.querySelector('input');
  const commit = () => { const v = input.value.trim().slice(0, 14); if (v !== s.name) { s.name = v; app.persist(); app.changed(); } };
  input.addEventListener('change', commit);
  input.addEventListener('blur', commit);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
}
const fmtSecs = (t) => t >= 3600 ? `${Math.floor(t / 3600)}h ${Math.floor(t / 60) % 60}m` : `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;

export function renderSettings(body, { app, close }) {
  const s = app.save.settings;
  const tog = (key, label, sub = '') => `<label class="tg"><span>${label}${sub ? `<small>${sub}</small>` : ''}</span><input type="checkbox" data-k="${key}" ${s[key] ? 'checked' : ''}><i></i></label>`;
  body.innerHTML = `
    ${tog('music', 'Music')}${tog('sfx', 'Sound effects')}
    <div class="seg-row"><span>Graphics</span><div class="seg">${['auto', 'high', 'medium', 'lite'].map((q) => `<button type="button" data-q="${q}" class="${s.quality === q ? 'on' : ''}">${q[0].toUpperCase() + q.slice(1)}</button>`).join('')}</div></div>
    <p class="st-note q-note hidden">Lite fully applies after a reload.</p>
    ${tog('lefty', 'Left-handed HUD', 'Mirror the HUD sides')}
    ${tog('keepMoving', 'Keep moving on release', 'Your crowd keeps its heading when you let go')}
    <div class="st-danger"><button type="button" class="btn btn-ghost st-reset">Reset progress</button>
      <div class="st-confirm hidden"><p>This wipes your coins, items, rating and stats on this device.</p>
        <div class="st-row"><button type="button" class="btn btn-ghost st-no">Cancel</button><button type="button" class="btn btn-danger st-yes">Reset everything</button></div></div></div>
    <p class="st-ver">THRONG · progress is saved on this device</p>`;
  body.querySelectorAll('input[type=checkbox]').forEach((c) => c.addEventListener('change', () => {
    s[c.dataset.k] = c.checked; app.persist(); app.applySettings(); app.audio.ui();
  }));
  body.querySelectorAll('[data-q]').forEach((b) => b.addEventListener('click', () => {
    s.quality = b.dataset.q; app.persist(); app.applySettings(); app.audio.ui();
    body.querySelectorAll('[data-q]').forEach((x) => x.classList.toggle('on', x === b));
    body.querySelector('.q-note').classList.toggle('hidden', s.quality !== 'lite');
  }));
  const conf = body.querySelector('.st-confirm'), resetBtn = body.querySelector('.st-reset');
  resetBtn.addEventListener('click', () => { conf.classList.remove('hidden'); resetBtn.classList.add('hidden'); });
  body.querySelector('.st-no').addEventListener('click', () => { conf.classList.add('hidden'); resetBtn.classList.remove('hidden'); });
  body.querySelector('.st-yes').addEventListener('click', () => { app.resetProgress(); close(); });
}

