import { h, esc, hex } from './kit.js';
import { LEAGUES, badgeSvg } from '../meta/leagues.js';

export function createLobby({ root, app }) {
  const el = h(`<section class="screen lobby hidden">
    <div class="lb-card">
      <div class="lby-head"><span class="lby-lg"></span><div><div class="lby-t">FINDING PLAYERS…</div><div class="lby-n"><b>1</b>/8</div></div></div>
      <ol class="lby-list"></ol>
      <button type="button" class="btn btn-ghost lby-cancel">CANCEL</button>
    </div>
  </section>`);
  root.appendChild(el);
  const list = el.querySelector('.lby-list'), nEl = el.querySelector('.lby-n b'), tEl = el.querySelector('.lby-t');
  let timers = [], cancelCb = null;
  const clear = () => { timers.forEach(clearTimeout); timers = []; };
  el.querySelector('.lby-cancel').addEventListener('click', () => { app.audio.ui(); clear(); hide(); if (cancelCb) cancelCb(); });

  function hide() { el.classList.add('hidden'); el.classList.remove('in'); }

  // players: the match's players (index 0 = you). Resolves through onDone once all 8 have "joined".
  function show({ players, league, onDone, onCancel, total = 2000 + Math.random() * 2000 }) {
    clear();
    cancelCb = onCancel;
    const lg = LEAGUES[league];
    el.querySelector('.lby-lg').innerHTML = badgeSvg(lg, 44);
    tEl.textContent = 'FINDING PLAYERS…';
    list.innerHTML = players.map((p, i) => `<li class="slot${i === 0 ? ' me in' : ''}" style="--c:${hex(p.color)}">
      <span class="sl-flag">${i === 0 ? '' : esc(p.flag || '')}</span>
      <span class="sl-name">${i === 0 ? esc(p.name) : '<i class="sl-wait"></i>'}</span>
      <span class="sl-lg">${i === 0 ? badgeSvg(lg, 18) : ''}</span></li>`).join('');
    nEl.textContent = '1';
    el.classList.remove('hidden');
    void el.offsetWidth;
    el.classList.add('in');
    // Uneven arrival times: a couple quickly, a pause, then the rest.
    const gaps = players.slice(1).map(() => 0.4 + Math.random() * 1.2);
    const sum = gaps.reduce((a, b) => a + b, 0);
    let t = 250;
    players.slice(1).forEach((p, k) => {
      t += gaps[k] / sum * (total - 600);
      timers.push(setTimeout(() => {
        const li = list.children[k + 1];
        li.querySelector('.sl-name').textContent = p.name;
        li.querySelector('.sl-lg').innerHTML = p.league != null ? badgeSvg(LEAGUES[p.league], 18) : '';
        li.classList.add('in');
        nEl.textContent = String(k + 2);
        app.audio.ui();
      }, t));
    });
    timers.push(setTimeout(() => { tEl.textContent = 'MATCH FOUND!'; el.classList.add('found'); }, t + 120));
    timers.push(setTimeout(() => { el.classList.remove('found'); hide(); onDone(); }, t + 650));
  }

  return { show, hide, get open() { return !el.classList.contains('hidden'); } };
}
