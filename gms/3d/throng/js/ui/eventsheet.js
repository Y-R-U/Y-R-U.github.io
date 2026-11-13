import { esc, num, UI_ICON, MODE_ICON } from './kit.js';
import { CONFIG } from '../config.js';
import { EVENTS, liveEvents, nextEvents, featuredMode, cupView, fmtCountdown, modeName } from '../meta/events.js';
import { seasonAt, SEASON } from '../meta/season.js';
import { LEAGUES, badgeSvg } from '../meta/leagues.js';

const when = (t) => new Date(t).toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' });

export function renderEvents(body, { app, close }) {
  const draw = () => {
    if (!body.isConnected) { clearInterval(timer); return; }
    const now = Date.now(), live = liveEvents(now).filter((w) => w.id !== 'motd'), next = nextEvents(now, 6);
    const feat = featuredMode(now), cv = cupView(app.save, now), sa = seasonAt(now);
    const card = (w, on) => {
      const d = EVENTS[w.id];
      return `<li class="ev-card ${on ? 'live' : ''}" style="--c:${d.color}"><span class="ev-ico">${esc(d.icon)}</span>
        <div><b>${esc(d.name)}</b><small>${esc(d.blurb)}</small></div>
        <span class="ev-t">${on ? `<em>LIVE</em> <span data-to="${w.end}">${fmtCountdown(w.end - now)}</span>` : `in <span data-to="${w.start}">${fmtCountdown(w.start - now)}</span><i>${esc(when(w.start))}</i>`}</span></li>`;
    };
    body.innerHTML = `
      <h3 class="sh-h">Live now</h3>
      <ul class="ev-list">${live.map((w) => card(w, true)).join('') || '<li class="ev-none">No special event right now. Check what is next below.</li>'}</ul>
      <div class="ev-motd">${MODE_ICON[feat]}<div><b>Mode of the Day: ${esc(modeName(feat))}</b><small>Coins ×1.5 in ${esc(modeName(feat))} until 00:00 UTC (${fmtCountdown(86400000 - (now % 86400000))})</small></div>
        <button type="button" class="btn btn-ghost ev-pick">${app.mode === feat ? 'Selected' : 'Play it'}</button></div>
      <h3 class="sh-h">Coming up</h3>
      <ul class="ev-list">${next.map((w) => card(w, false)).join('')}</ul>
      <h3 class="sh-h">Monthly cup <small>· ${esc(modeName(cv.mode))} · ends in ${fmtCountdown(cv.endsIn)}</small></h3>
      <div class="cup-card"><div class="cup-pts"><b>${cv.pts}</b><span>points<br>best 5 results</span></div>
        <div class="cup-bar"><i style="width:${Math.min(100, 100 * cv.pts / 50).toFixed(1)}%"></i>${cv.tiers.map((t) => `<span class="cup-mark ${t.reached ? 'on' : ''}" style="left:${(100 * t.pts / 50).toFixed(1)}%;--c:${t.color}"></span>`).join('')}</div>
        <ul class="cup-tiers">${cv.tiers.map((t) => `<li class="${t.got ? 'got' : ''}" style="--c:${t.color}">${UI_ICON.star}<b>${esc(t.name)}</b><span>${t.pts} pts</span><i>${t.got ? 'WON' : `+${num(t.coins)}`}</i></li>`).join('')}</ul>
        <p class="ld-note">Play ${esc(modeName(cv.mode))} with PLAY: 1st 10 pts, 2nd 7, 3rd 5, 4th 4… Your best 5 count.</p>
        <button type="button" class="btn btn-ghost cup-pick">${app.mode === cv.mode ? 'Selected' : 'Play ' + esc(modeName(cv.mode))}</button></div>
      <h3 class="sh-h">Season ${sa.n} <small>· ${sa.daysLeft} day${sa.daysLeft === 1 ? '' : 's'} left</small></h3>
      <div class="ss-card"><div class="ss-peak">${badgeSvg(LEAGUES[app.save.season.peakLeague || 0], 40)}<div><b>Peak this season: ${esc(LEAGUES[app.save.season.peakLeague || 0].name)}</b>
        <small>Season reward: ${num(SEASON.rewards[app.save.season.peakLeague || 0])} coins and a trophy. At the end your rating eases back toward your league's floor.</small></div></div></div>
      <p class="ld-note">Everyone sees the same events at the same time. Times are UTC, shown in your local time.</p>`;
    body.querySelector('.ev-pick').addEventListener('click', () => { app.setMode(feat); app.audio.ui(); close(); });
    body.querySelector('.cup-pick').addEventListener('click', () => { app.setMode(cv.mode); app.audio.ui(); close(); });
  };
  let timer = 0, n = 0;
  draw();
  timer = setInterval(() => {
    if (!body.isConnected) { clearInterval(timer); return; }
    const now = Date.now();
    if (++n % 30 === 0 || [...body.querySelectorAll('[data-to]')].some((x) => +x.dataset.to <= now)) { draw(); return; }
    body.querySelectorAll('[data-to]').forEach((x) => { x.textContent = fmtCountdown(+x.dataset.to - now); });
  }, 1000);
}
