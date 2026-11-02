// Events UI: the list (live / upcoming / ended), an event page with countdown, Play, the goals track,
// the ladder and final-rank rewards. Event rounds are played through ctx.playEvent.
import { EVENTS, status, timeText, startsAt, endsAt, freshProgress, applyRound, goalState, standings, rankReward } from './events.js';
import { makeLedger } from '../app/store.js';
import { COURSES } from '../course/holes/index.js';
import { ICONS } from '../game/hud.js';
import { THEME_LIST } from '../app/menus.js';
import { helperName } from '../meta/helpers.js';
import { CHESTS } from '../meta/economy.js';

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const back = `<button class="round" data-a="back" aria-label="Back"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg></button>`;
const swatch = ev => (THEME_LIST.find(t => t.id === (ev.themeWanted || ev.theme)) || THEME_LIST[0]).swatch;

export function rewardHTML(r) {
  if (!r) return '';
  const out = [];
  if (r.coins) out.push(`${ICONS.coin}${r.coins}`);
  for (const [k, n] of Object.entries(r.helpers || {})) out.push(`+${n} ${helperName(k)}`);
  for (const k of [].concat(r.chest || [])) out.push(esc(CHESTS[k]?.name || 'Chest'));
  return out.join(' · ');
}
function grant(store, r) {
  if (!r) return;
  if (r.coins) store.addCoins(r.coins);
  for (const [k, n] of Object.entries(r.helpers || {})) store.giveHelper(k, n);
  for (const k of [].concat(r.chest || [])) store.data.chests?.queue.push(k);   // M5 chests (opened in the Shop)
  store.save();
}

// ctx: { store, now(), playEvent(ev, course, opts) → Promise<result|null>, onBack, click }
export function createEvents(ctx) {
  const { store } = ctx;
  const prog = ev => store.eventProgress(ev.id, freshProgress);
  const sw = ev => swatch(ev);

  function list() {
    const now = ctx.now(), el = $('#events');
    const order = [...EVENTS].sort((a, b) => ({ live: 0, upcoming: 1, ended: 2 }[status(a, now)] - { live: 0, upcoming: 1, ended: 2 }[status(b, now)]) || startsAt(a) - startsAt(b));
    el.innerHTML = `<div class="career-card wide">
      <div class="map-head">${back}<div><div class="map-title">Events</div><div class="map-sub">${esc(new Date(now).toDateString())}</div></div></div>
      <div class="ev-list">${order.map(ev => {
        const st = status(ev, now), p = prog(ev);
        const claim = st === 'ended' && !p.rankClaimed && p.rounds > 0;
        return `<button class="ev-tile ${st}" data-id="${ev.id}">
          <span class="sw big" style="background:${sw(ev)}"><i>${ev.currency.icon}</i></span>
          <span class="ev-main"><b>${esc(ev.name)}</b><small>${esc(timeText(ev, now))} · ${esc(fmtRange(ev))}</small>
            <small>${p.rounds ? `${p.points} pts · ${p.currency} ${esc(ev.currency.name.toLowerCase())}` : esc(ev.blurb)}</small></span>
          <span class="badge ${st}">${claim ? 'Claim!' : st}</span></button>`;
      }).join('')}</div></div>`;
    el.hidden = false;
    el.onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      ctx.click?.();
      if (b.dataset.a === 'back') { el.hidden = true; ctx.onBack(); }
      else if (b.dataset.id) page(EVENTS.find(x => x.id === b.dataset.id));
    };
  }

  function page(ev, flash = '') {
    const now = ctx.now(), st = status(ev, now), p = prog(ev), el = $('#events');
    const board = standings(ev, Math.min(now, endsAt(ev)), { name: store.story().name || 'You', points: p.points });
    const me = board.find(r => r.you);
    const show = board.filter(r => r.rank <= 5 || Math.abs(r.rank - me.rank) <= 2);
    const tier = rankReward(ev, me.rank);
    const holes = ev.holes.length, par = ev.holes.reduce((a, id) => a + COURSES[ev.course].holes.find(h => h.id === id).par, 0);
    el.innerHTML = `<div class="career-card wide">
      <div class="map-head">${back}<span class="sw big" style="background:${sw(ev)}"><i>${ev.currency.icon}</i></span>
        <div><div class="map-title">${esc(ev.name)}</div><div class="map-sub">${esc(timeText(ev, now))} · ${esc(fmtRange(ev))}</div></div></div>
      ${flash ? `<div class="card-note good">${flash}</div>` : ''}
      <div class="ev-stats"><div><span>${esc(ev.currency.name)}</span><b>${ev.currency.icon} ${p.currency}</b></div><div><span>Points</span><b>${p.points}</b></div><div><span>Rank</span><b>${me.rank}/${board.length}</b></div><div><span>Rounds</span><b>${p.rounds}</b></div></div>
      ${st === 'live' ? `<button class="btn primary" data-a="play">Play event round <small>· ${holes} holes, par ${par}</small></button>` : ''}
      ${st === 'upcoming' ? `<div class="card-note">Opens ${esc(new Date(startsAt(ev)).toDateString())}. ${esc(ev.blurb)}</div>` : ''}
      ${st === 'ended' ? (p.rankClaimed ? `<div class="card-note">Final rank ${me.rank}. Rewards claimed.</div>`
        : tier && p.rounds > 0 ? `<button class="btn primary" data-a="rank">Claim final rank ${me.rank} reward: ${rewardHTML(tier.reward)}</button>`
        : '<div class="card-note">This event has ended.</div>') : ''}
      <div class="sec">Goals</div>
      <div class="goals">${ev.goals.map(g => {
        const gs = goalState(p, g);
        return `<div class="goal ${gs.claimed ? 'claimed' : gs.done ? 'done' : ''}">
          <div class="g-top"><b>${esc(g.text)}</b><span>${rewardHTML(g.reward)}</span></div>
          <div class="g-bar"><i style="width:${(100 * gs.value / g.target).toFixed(1)}%"></i><em>${gs.value}/${g.target}</em></div>
          ${gs.done && !gs.claimed ? `<button class="btn small" data-claim="${g.id}">Claim</button>` : gs.claimed ? '<div class="g-ok">✓ Claimed</div>' : ''}</div>`;
      }).join('')}</div>
      <div class="sec">Event ladder <small>${st === 'ended' ? 'final' : 'live'} · the more you play, the higher you go</small></div>
      <table class="scores board ladder">${show.map((r, i) => `${i && r.rank - show[i - 1].rank > 1 ? '<tr class="gap"><td colspan="3">⋯</td></tr>' : ''}
        <tr class="${r.you ? 'you' : ''}"><td>${r.rank}</td><td>${esc(r.name)}</td><td>${r.points}</td></tr>`).join('')}</table>
      <div class="sec">Final rank rewards</div>
      <div class="tiers">${ev.rankRewards.map(t => `<div class="${tier === t ? 'on' : ''}"><b>Top ${t.top}</b><span>${rewardHTML(t.reward)}${t.title ? ` · “${esc(t.title)}”` : ''}</span></div>`).join('')}</div>
    </div>`;
    el.hidden = false;
    el.scrollTop = 0;
    el.onclick = async e => {
      const b = e.target.closest('button'); if (!b) return;
      ctx.click?.();
      if (b.dataset.a === 'back') { list(); return; }
      if (b.dataset.claim) {
        const g = ev.goals.find(x => x.id === b.dataset.claim);
        if (goalState(p, g).done && !p.claimed.includes(g.id)) { p.claimed.push(g.id); grant(store, g.reward); store.save(); }
        page(ev, `Claimed: ${rewardHTML(g.reward)}`);
        return;
      }
      if (b.dataset.a === 'rank') {
        if (!p.rankClaimed && tier) { p.rankClaimed = true; grant(store, tier.reward); store.save(); }
        page(ev, `Final rank reward claimed: ${rewardHTML(tier.reward)}`);
        return;
      }
      if (b.dataset.a === 'play' && status(ev, ctx.now()) === 'live') {
        el.hidden = true;
        const course = { id: ev.id, name: ev.name, holes: ev.holes.map(id => COURSES[ev.course].holes.find(h => h.id === id)) };
        const before = p.currency;
        const ledger = makeLedger(store, p.pickups);
        const res = await ctx.playEvent(ev, course, { ledger, currency: { icon: ev.currency.icon, name: ev.currency.name } });
        if (!res) { page(ev); return; }
        const newCurrency = ledger.count() - before;
        const pts = applyRound(p, { total: res.total, par: res.par, aces: res.aces || 0, newCurrency });
        store.save();
        page(ev, `Round done: ${res.total} (par ${res.par}) · +${pts} points · +${newCurrency} ${esc(ev.currency.name.toLowerCase())}`);
      }
    };
  }

  return { list, page };
}

function fmtRange(ev) {
  const f = ymd => new Date(...(([y, m, d]) => [y, m - 1, d])(ymd.split('-').map(Number))).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `${f(ev.start)} – ${f(ev.end)}`;
}
