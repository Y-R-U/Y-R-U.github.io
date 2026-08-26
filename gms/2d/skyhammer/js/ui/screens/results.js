// Debrief: stars, time vs par, kills, money, and a nudge at whatever is now affordable.

import { el, btn, secs, coinChip } from '../widgets.js';
import { cash } from '../units.js';
import { drawStar, iconCanvas, GOLD } from '../icons.js';
import * as M from '../model.js';

let timers = [];

export function mount(root, ctx) {
  const { data, save } = ctx;
  const a = ctx.args || {};
  const res = a.result || {};
  const lv = (data.LEVELS || []).find((l) => l.id === a.levelId) || null;
  const par = (lv && lv.par) || 0;
  const win = res.win !== false;
  const time = res.time || 0;
  const stars = win ? (res.stars != null ? res.stars : M.starsFor(time, par, data.ECON)) : 0;
  const earned = res.money != null ? res.money : (win && lv ? (lv.reward || {}).money || 0 : 0);

  if (win && lv && a.record !== false) {
    M.recordLevel(save, lv.id, { stars, time });
    if (!a.moneyAlreadyBanked) M.setMoney(save, M.getMoney(save) + earned);
  }

  const idx = lv ? data.LEVELS.indexOf(lv) : -1;
  const next = idx >= 0 && idx + 1 < data.LEVELS.length ? data.LEVELS[idx + 1] : null;

  root.appendChild(el('div.res-scrim'));

  const left = el('section.res-left', {},
    el('div.res-eyebrow', {}, lv ? `${lv.id.toUpperCase()} · ${lv.name}` : 'DEBRIEF'),
    el('h2.res-verdict' + (win ? '.win' : '.lose'), {}, win ? 'MISSION COMPLETE' : 'SHOT DOWN'),
    starBanner(stars),
    el('div.res-parline', {}, par
      ? (time <= par ? `${secs(time)} — ${secs(par - time)} under par` : `${secs(time)} — ${secs(time - par)} over par`)
      : secs(time))
  );

  const rows = [
    ['Time', secs(time)],
    ['Par', par ? secs(par) : '—'],
    ['Kills', String(res.kills || 0)],
    ['Ground targets', String(res.ground != null ? res.ground : res.groundKills || 0)],
    ['Accuracy', res.accuracy != null ? Math.round(res.accuracy * 100) + '%' : '—'],
  ];
  const table = el('div.res-table', {}, rows.map(([k, v]) =>
    el('div.res-row', {}, el('span', {}, k), el('b', {}, v))));

  const right = el('section.res-right', {},
    el('div.res-head', {}, el('h3.sec-h', {}, 'DEBRIEF'), coinChip(ctx)),
    table,
    el('div.res-money', {}, el('span', {}, 'EARNED'), el('b.gold', {}, cash(earned, { plus: true })))
  );

  root.appendChild(el('div.res-body', {}, left, right));

  // The act's closing line takes precedence over a milestone: an act outro is a bigger moment,
  // and stacking two radio cards on one debrief reads as noise. STORY.ACT_OUTRO was written and
  // nothing had ever read it.
  const beat = (win ? actOutro(data, lv, data.LEVELS) : null) || milestone(data, a.levelId);
  if (beat) {
    left.appendChild(el('div.res-beat', {},
      el('div.radio-head', {}, el('span.radio-dot'), beatSpeaker(data, beat)),
      el('p.radio-line', {}, beat.text)
    ));
  }

  const nudge = M.affordableNudge(save, data.PLANES, data.WEAPONS, data.UPGRADES, data.ECON);
  const foot = el('footer.res-foot');
  if (nudge) {
    foot.appendChild(el('div.nudge', { onclick: () => ctx.go('hangar') },
      iconCanvas(nudge.icon || 'bomb', 20, GOLD),
      el('span.nudge-t', {}, nudge.kind === 'save'
        ? `${nudge.label} — ${cash(nudge.short)} to go`
        : `${nudge.label} — ${cash(nudge.price)}`),
      el('span.nudge-go', {}, 'HANGAR ›')
    ));
  }
  foot.appendChild(el('div.spacer'));
  foot.appendChild(btn('mini ghost', 'HANGAR', () => ctx.go('hangar')));
  foot.appendChild(btn('mini', 'REPLAY', () => ctx.start(a.levelId, a.mode || 'story')));
  if (win && next) foot.appendChild(btn('go', 'NEXT ›', () => ctx.go('brief', { levelId: next.id, mode: a.mode || 'story' })));
  else if (win) foot.appendChild(btn('go', 'CAMPAIGN', () => ctx.go('levelselect')));
  else foot.appendChild(btn('go', 'TRY AGAIN', () => ctx.start(a.levelId, a.mode || 'story')));
  root.appendChild(foot);
}

export function unmount() {
  timers.forEach(clearTimeout);
  timers = [];
}

function milestone(data, levelId) {
  const S = data && data.STORY;
  if (!S || !S.MILESTONE_BEATS || !levelId) return null;
  return S.MILESTONE_BEATS.find((b) => b.after === levelId) || null;
}

/**
 * The act-closing beat, on the debrief of the level that ends an act — i.e. the last level whose
 * `act` matches before the number changes. Keyed off position in LEVELS rather than a flag, so
 * appending generated levels to an act moves the outro along with it automatically.
 */
function actOutro(data, lv, LEVELS) {
  const O = data && data.STORY && data.STORY.ACT_OUTRO;
  if (!O || !lv || !Array.isArray(LEVELS)) return null;
  const i = LEVELS.indexOf(lv);
  if (i < 0) return null;
  const next = LEVELS[i + 1];
  if (next && next.act === lv.act) return null;      // not the last level of the act
  return O[lv.act] || null;
}

function beatSpeaker(data, beat) {
  const cast = data && data.STORY && data.STORY.CAST;
  const who = cast && cast[beat.speaker];
  return (who && (who.name || who.callsign)) || String(beat.speaker || '').toUpperCase();
}

function starBanner(n) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const c = document.createElement('canvas');
  c.className = 'res-stars';
  c.width = 190 * dpr; c.height = 58 * dpr;
  c.style.width = '190px'; c.style.height = '58px';
  const g = c.getContext('2d');
  g.scale(dpr, dpr);
  let shown = 0;
  const paint = () => {
    g.clearRect(0, 0, 190, 58);
    for (let i = 0; i < 3; i++) {
      const big = i === 1;
      drawStar(g, 34 + i * 61, big ? 26 : 32, big ? 26 : 22, i < shown);
    }
  };
  paint();
  for (let i = 1; i <= n; i++) timers.push(setTimeout(() => { shown = i; paint(); }, 220 + i * 260));
  return c;
}
