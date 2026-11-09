// Events UI: the list (live / upcoming / ended), an event page with countdown, Play, the goals track,
// the ladder and final-rank rewards. Event rounds are played through ctx.playEvent.
// events3: the list is the rolling calendar (yearly runs + weekend events): live now, coming up with
// dates, recently ended, and any older run that still has a final-rank reward to claim.
import { status, timeText, startsAt, endsAt, freshProgress, applyRound, goalState, standings, rankReward, eventHoles, overview, featured, nextUp, eventById, bonusCurrency, rivalsBeaten } from './events.js';
import { tasterCourse } from './access.js';
import { battleField } from './rivals.js';
import { COURSES } from '../course/holes/index.js';
import { makeLedger } from '../app/store.js';
import { ICONS } from '../game/hud.js';
import { THEME_LIST } from '../app/menus.js';
import { helperName } from '../meta/helpers.js';
import { CHESTS } from '../meta/economy.js';

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const back = `<button class="round" data-a="back" aria-label="Back"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg></button>`;
const swatch = ev => (THEME_LIST.find(t => t.id === (ev.themeWanted || ev.theme)) || THEME_LIST[0]).swatch;

// events4: one line saying what is different about this event's rounds (or '' for none)
export function twistText(ev) {
  const t = ev.twist || {}, out = [];
  if (t.rivals) out.push(`⚔️ ${t.rivals} AI rivals share every hole and ball hits are always on. Knock them out of bounds (+1 to them) and beat them on the card.`);
  if (t.bonus?.bumper) out.push(`💥 Every bumper bounce pays ${t.bonus.bumper === 1 ? `a ${(ev.currency.one || ev.currency.name).toLowerCase()}` : `${t.bonus.bumper} ${ev.currency.name.toLowerCase()}`} (up to ${t.bumperCap ?? 3} a hole).`);
  if (t.helpers === 'off') out.push('🚫 No helpers this weekend.');
  if (ev.holes.some(id => id.startsWith('mir-'))) out.push(ev.holes.every(id => id.startsWith('mir-')) ? '🪞 Every hole is mirrored left to right.' : '🪞 Holes marked (Mirror) are old holes flipped left to right.');
  return out.join(' ');
}
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
  const peek = ev => store.data.events[ev.id] || freshProgress();   // the list never adds save entries
  const sw = ev => swatch(ev);

  function tile(ev, now) {
    const st = status(ev, now), p = peek(ev);
    const claim = st === 'ended' && !p.rankClaimed && p.rounds > 0;
    return `<button class="ev-tile ${st} ${ev.kind === 'weekend' ? 'wknd' : ''}" data-id="${ev.id}">
      <span class="sw big" style="background:${sw(ev)}"><i>${ev.currency.icon}</i></span>
      <span class="ev-main"><b>${esc(ev.name)}${ev.kind === 'weekend' ? ' <em class="ev-kind">Weekend</em>' : ''}</b><small>${esc(fmtRange(ev, now))} · ${esc(timeText(ev, now))}</small>
        <small>${p.rounds ? `${p.points} pts · ${p.currency} ${esc(ev.currency.name.toLowerCase())}` : esc(ev.blurb)}</small></span>
      <span class="badge ${st}">${claim ? 'Claim!' : st === 'upcoming' ? 'soon' : st}</span></button>`;
  }
  function list() {
    const now = ctx.now(), el = $('#events'), o = overview(now);
    // older runs you played whose final-rank reward is still waiting (any year)
    const shown = new Set([...o.live, ...o.upcoming, ...o.ended].map(e => e.id));
    const owed = Object.keys(store.data.events || {}).map(eventById)
      .filter(ev => ev && !shown.has(ev.id) && status(ev, now) === 'ended' && peek(ev).rounds > 0 && !peek(ev).rankClaimed);
    const next = nextUp(now);
    const sec = (title, evs, note = '') => evs.length || note ? `<div class="sec">${title}</div>${note}<div class="ev-list">${evs.map(ev => tile(ev, now)).join('')}</div>` : '';
    el.innerHTML = `<div class="career-card wide">
      <div class="map-head">${back}<div><div class="map-title">Events</div><div class="map-sub">${esc(new Date(now).toDateString())}</div></div></div>
      ${sec('Live now', o.live, o.live.length ? '' : `<div class="card-note">Nothing live today.${next ? ` Next up: <b>${esc(next.name)}</b>, ${esc(fmtRange(next, now))}.` : ''}</div>`)}
      ${sec('Coming up', o.upcoming)}
      ${sec('Rewards waiting', owed)}
      ${sec('Recently ended', o.ended)}</div>`;
    el.hidden = false;
    el.scrollTop = 0;
    el.onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      ctx.click?.();
      if (b.dataset.a === 'back') { el.hidden = true; ctx.onBack(); }
      else if (b.dataset.id) { const ev = eventById(b.dataset.id); if (ev) page(ev); }
    };
  }

  function page(ev, flash = '') {
    const now = ctx.now(), st = status(ev, now), p = prog(ev), el = $('#events');
    const board = standings(ev, Math.min(now, endsAt(ev)), { name: store.story().name || 'You', points: p.points });
    const me = board.find(r => r.you);
    const show = board.filter(r => r.rank <= 5 || Math.abs(r.rank - me.rank) <= 2);
    const tier = rankReward(ev, me.rank);
    const evHoles = eventHoles(ev), holes = evHoles.length, par = evHoles.reduce((a, h) => a + h.par, 0);
    // events4: holes on courses (or map tiles) the player hasn't opened are tasters (./access.js)
    const taster = id => tasterCourse(store, id), tasters = evHoles.filter(h => taster(h.id)).length, tw = twistText(ev);
    el.innerHTML = `<div class="career-card wide">
      <div class="map-head">${back}<span class="sw big" style="background:${sw(ev)}"><i>${ev.currency.icon}</i></span>
        <div><div class="map-title">${esc(ev.name)}</div><div class="map-sub">${esc(timeText(ev, now))} · ${esc(fmtRange(ev, now))}</div></div></div>
      ${flash ? `<div class="card-note good">${flash}</div>` : ''}
      <div class="ev-stats"><div><span>${esc(ev.currency.name)}</span><b>${ev.currency.icon} ${p.currency}</b></div><div><span>Points</span><b>${p.points}</b></div><div><span>Rank</span><b>${me.rank}/${board.length}</b></div><div><span>Rounds</span><b>${p.rounds}</b></div></div>
      ${st === 'live' ? `<button class="btn primary" data-a="play">Play event round <small>· ${holes} holes, par ${par}</small></button>` : ''}
      ${st === 'upcoming' ? `<div class="card-note">Opens ${esc(new Date(startsAt(ev)).toDateString())}. ${esc(ev.blurb)}</div>` : ''}
      ${tw ? `<div class="card-note ev-twist">${esc(tw)}</div>` : ''}
      <div class="ev-holes">${evHoles.map(h => `<span class="${taster(h.id) ? 'taster' : ''}" title="${esc(courseName(h.remixOf || h.id))}">${esc(h.name)}<i>par ${h.par}${taster(h.id) ? ' · taster' : ''}</i></span>`).join('')}</div>
      ${tasters && st !== 'ended' ? `<div class="card-note small">Taster holes are on courses you haven't opened yet: play them here for the event, but they keep no record and unlock nothing.</div>` : ''}
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
        const course = { id: ev.id, name: ev.name, holes: eventHoles(ev) };
        // events4: Battle Royale — the AI plays the round for the rivals first (seeded by run + round number)
        let field = null;
        if (ev.twist?.rivals) {
          el.innerHTML = `<div class="card career-card"><div class="card-title">The rivals are warming up…</div><div class="boot-spin"></div>
            <div class="card-note small">Planning their shots on the real course</div></div>`;
          field = await battleField(ev, course.holes, p.rounds);
        }
        el.hidden = true;
        const before = p.currency;
        const ledger = makeLedger(store, p.pickups);
        const res = await ctx.playEvent(ev, course, { ledger, currency: { icon: ev.currency.icon, name: ev.currency.name }, twist: ev.twist || null,
          ...(field ? { ghosts: field, opponents: field } : {}) });
        if (!res) { page(ev); return; }
        const beaten = field ? rivalsBeaten(res.total, field) : 0, knockouts = res.knockouts | 0;
        const bonus = bonusCurrency(ev.twist, { bumpers: res.bumpers | 0, knockouts, beaten });
        const newCurrency = ledger.count() - before + bonus;
        const pts = applyRound(p, { total: res.total, par: res.par, aces: res.aces || 0, newCurrency, knockouts, beaten, rivals: field?.length || 0 }, ev.scoring);
        store.save();
        const extra = [field ? `beat ${beaten}/${field.length} rivals` : '', knockouts ? `${knockouts} knock-out${knockouts > 1 ? 's' : ''}` : '',
          res.bumpers ? `${res.bumpers} bonk${res.bumpers > 1 ? 's' : ''}` : '', res.tasters ? `${res.tasters} taster hole${res.tasters > 1 ? 's' : ''}` : ''].filter(Boolean);
        page(ev, `Round done: ${res.total} (par ${res.par}) · +${pts} points · +${newCurrency} ${esc(ev.currency.name.toLowerCase())}${extra.length ? ` · ${esc(extra.join(' · '))}` : ''}`);
      }
    };
  }

  return { list, page };
}

// "Nov 13 – Nov 15", "Dec 1 – Jan 6, 2027"; the year shows when the run isn't all in the current year.
export function fmtRange(ev, now = Date.now()) {
  const d = ymd => new Date(...(([y, m, dd]) => [y, m - 1, dd])(ymd.split('-').map(Number)));
  const f = ymd => d(ymd).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const yr = ev.end.slice(0, 4) !== String(new Date(now).getFullYear()) || ev.start.slice(0, 4) !== ev.end.slice(0, 4) ? `, ${ev.end.slice(0, 4)}` : '';
  return `${f(ev.start)} – ${f(ev.end)}${yr}`;
}
const courseName = id => Object.values(COURSES).find(c => c.holes.some(h => h.id === id))?.name || '';

// events3: the title tile: the live (or next) event, and what comes after it.
export function eventTileHTML(now) {
  const ev = featured(now), st = status(ev, now);
  const after = nextUp(st === 'upcoming' ? endsAt(ev) - 1 : now);
  const nextLine = after && after !== ev ? `<small class="et-next">Next: ${esc(after.name)} · ${esc(fmtRange(after, now))}</small>` : '';
  return `<span class="et-ic">${ev.currency.icon}</span><span class="et-main"><b>${esc(ev.name)}</b><small>${esc(timeText(ev, now))}</small>${nextLine}</span><span class="badge ${st}">${st === 'live' ? 'Live' : st === 'upcoming' ? 'soon' : st}</span>`;
}
