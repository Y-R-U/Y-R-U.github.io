// Every screen outside a race. Menus never touch game systems directly: they
// render from the profile and emit intentions on the bus, and flow.js decides
// what that means.

import { $, esc, fmtMoney, fmtRank, fmtTime, ordinal, clamp, clamp01, pick } from './utils.js';
import {
  profile, saveProfile, rankTier, equipPart, toggleLoadout, addMoney, playerPower, playerStats,
  owns, itemById, buyItem, levelOf, nextUpgradeCost, upgradeItem,
  ownedCars, ownsCar, activeCar, buyCar, selectCar, playerLivery,
} from './save.js';
import {
  SLOTS, PARTS, SKILLS, RARITY, SOURCES, partById, skillById, partsForSlot,
  CHEST_TIERS, statsFor, powerRating, MAX_LEVEL, MARKS,
} from './arsenal.js';
import { CARS, carById } from './cars.js';
import {
  TEAM_LEVELS, teamLevel, team, nextTeam, buyTeamLevel,
  trackUnlocked, trackGates, conditionMet, conditionText, nearestGate, buyTrack, storyCleared,
  TROPHIES, TROPHY_BY_ID, earnedTrophies, winsAt, firstWonAt,
} from './progress.js';
import { mountRoom, rebuildRoom } from './rooms.js';
import { TRACK_DEFS, TRACK_BY_ID, buildTrack } from './trackgen.js';
import { CHAPTERS, LEVELS_PER_CHAPTER, storyLength, levelEvent, chapterOf } from './story.js';
import { SPECIAL_EVENTS, eventById, eventUnlocked, eventEarned, eventGates, eventCountdown, quickEvent, dailyEvent } from './events.js';
import {
  TITLES, titleById, titleState, titleUnlocked, titleLockText, roundName, roundCount,
  bracketFor, currentPairing, enterTitle,
} from './titles.js';
import { LIVERY, LADDER, NAME_POOL, DEV_MODE } from './config.js';
import { state } from './state.js';
import { emit, on } from './bus.js';
import { sfx } from './audio.js';

const menu = () => $('menu');
let actions = {};
let currentTab = { garage: 'engine', story: null, quick: 'track', shop: 'engine', career: 'trophies' };

export function showScreen() { menu().classList.add('show'); }
export function hideScreen() {
  menu().classList.remove('show', 'backdrop');
  menu().innerHTML = '';
  currentKey = '';
}

// ---------------------------------------------------------------------------
// Painting a screen
// ---------------------------------------------------------------------------
// Two rules earned from watching somebody use this on a phone:
//
//   1. The header does not scroll. The title and the way out stay where your
//      thumb left them, however long the list underneath is.
//   2. Re-rendering the same screen keeps its scroll position. Equipping a part
//      halfway down a list and being thrown back to the top of it is the single
//      most annoying thing a menu can do.
//
// `key` is what "the same screen" means: it includes the open tab, so switching
// tabs sensibly starts at the top while toggling an item does not.
const scrollMemory = {};
let currentKey = '';

function wire(root) {
  root.querySelectorAll('[data-act]').forEach((node) => {
    node.addEventListener('click', (e) => {
      e.preventDefault();
      const fn = actions[node.dataset.act];
      sfx('ui');
      if (fn) fn(node.dataset, node);
    });
  });
}

function paint(html, acts = {}, opts = {}) {
  const m = menu();
  const key = opts.key || 'screen';
  const oldBody = m.querySelector('.screen-body');
  if (oldBody && currentKey === key) scrollMemory[key] = oldBody.scrollTop;
  else if (currentKey !== key) scrollMemory[key] = 0;
  currentKey = key;

  actions = acts;
  m.classList.toggle('backdrop', !!opts.backdrop);
  m.innerHTML = `
    ${opts.head == null ? '' : `<div class="screen-head"><div class="wrap">${opts.head}</div></div>`}
    <div class="screen-body"><div class="wrap">${html}</div></div>`;
  const body = m.querySelector('.screen-body');
  body.scrollTop = scrollMemory[key] || 0;
  wire(m);
  showScreen();
}

// For screens that own the whole viewport and must not scroll — the title.
function paintFull(html, acts = {}, opts = {}) {
  const m = menu();
  currentKey = opts.key || 'full';
  actions = acts;
  m.classList.toggle('backdrop', !!opts.backdrop);
  m.innerHTML = html;
  wire(m);
  showScreen();
}

// The sticky header. `back` is a big obvious pill, not a hyperlink.
function head(title, back = true, sub) {
  const t = rankTier();
  return `
    <div class="head-row">
      ${back ? `<button class="btn-back" data-act="back"><span class="chev">‹</span> BACK</button>` : ''}
      <h1>${esc(title)}</h1>
      <div class="head-purse">
        <span class="money">${fmtMoney(profile.money)}</span>
        <span class="rank" style="color:${t.css}">${fmtRank(profile.rank)} · ${t.name}</span>
      </div>
    </div>
    ${sub ? `<div style="color:var(--dim);font-size:clamp(10px,1.4vmin,13px);letter-spacing:.16em;margin-top:4px">${sub}</div>` : ''}`;
}

// Kept for the pause screen, which has no header of its own.
function topbar(title, back) { return head(title, back); }

// ═══════════════════════════════ TITLE ═══════════════════════════════
// The middle of the screen belongs to the race running behind it. Everything
// you can press lives on the two rails at the edges, where a thumb already is.
export function renderTitle() {
  const t = rankTier();
  const story = profile.story.level || 1;
  const ch = chapterOf(story);
  const chests = profile.chests.length;
  const openTitles = TITLES.filter((x) => titleUnlocked(x)).length;

  const tile = (act, ic, name, sub, cls = '', badge = '') => `
    <button class="tile ${cls} ${badge ? 'badge' : ''}" data-act="${act}" ${badge ? `data-badge="${esc(badge)}"` : ''}>
      <span class="tl-ic">${ic}</span>
      <span class="tl-name">${esc(name)}</span>
      <span class="tl-sub">${esc(sub)}</span>
    </button>`;

  paintFull(`
    <div class="title-stage">
      <div class="title-logo">
        <div class="logo">FOUL<span>PLAY</span></div>
        <p class="tagline">CONTACT IS RACING · GETTING CAUGHT IS NOT</p>
      </div>
      <div class="title-rails">
        <div class="title-rail">
          ${tile('story', '🏁', 'THE SEASON', `LVL ${story}/${storyLength()} · ${ch.name}`, 'hero')}
          ${tile('quick', '⚡', 'QUICK RACE', `RANKED · ${fmtRank(profile.rank)}`)}
          ${tile('events', '🎪', 'EVENTS', 'DERBIES AND THE DAILY')}
          ${tile('titles', '🏆', 'TITLES', openTitles ? `${openTitles} BRACKET${openTitles > 1 ? 'S' : ''} OPEN` : 'LOCKED FOR NOW')}
        </div>
        <div class="title-rail">
          ${tile('garage', '🔧', 'GARAGE', `POWER ${playerPower()}`, '', chests ? `${chests}` : '')}
          ${tile('shop', '🛒', 'PARTS SHOP', fmtMoney(profile.money))}
          ${tile('showroom', '🚗', 'SHOWROOM', activeCar().name)}
          ${tile('career', '📜', 'CAREER', `${team().name}`)}
        </div>
      </div>
      <div class="title-foot">
        <button class="btn-mini" data-act="ladder">WORLD LADDER</button>
        <button class="btn-mini" data-act="settings">SETTINGS</button>
        <button class="btn-mini" data-act="rename">${esc(profile.name)}</button>
      </div>
    </div>
  `, {
    story: () => emit('nav', { to: 'story' }),
    quick: () => emit('nav', { to: 'quick' }),
    events: () => emit('nav', { to: 'events' }),
    titles: () => emit('nav', { to: 'titles' }),
    garage: () => emit('nav', { to: 'garage' }),
    shop: () => emit('nav', { to: 'shop' }),
    showroom: () => emit('nav', { to: 'showroom' }),
    career: () => emit('nav', { to: 'career' }),
    ladder: () => emit('nav', { to: 'ladder' }),
    settings: () => emit('nav', { to: 'settings' }),
    rename: () => renameDriver(),
  }, { key: 'title', backdrop: true });
}

function renameDriver() {
  popup('DRIVER NAME', `
    <p>What do they announce when you come through the tunnel?</p>
    <input id="name-input" type="text" maxlength="14" autocomplete="off" spellcheck="false"
           value="${esc(profile.name)}" placeholder="YOUR NAME" />
  `, [
    { label: 'RANDOM', act: () => { $('name-input').value = pick(NAME_POOL); }, keep: true },
    { label: 'CANCEL', act: () => closePopup() },
    {
      label: 'SAVE', primary: true, act: () => {
        const v = ($('name-input').value || '').toUpperCase().replace(/[^A-Z0-9 '_-]/g, '').trim().slice(0, 14);
        if (v.length >= 2) { profile.name = v; saveProfile(true); }
        closePopup();
        renderTitle();
      },
    },
  ]);
}

// ═══════════════════════════════ STORY ═══════════════════════════════
export function renderStory() {
  const unlocked = profile.story.level || 1;
  const curCh = chapterOf(unlocked).n;
  const showCh = currentTab.story || curCh;

  const chapterTabs = CHAPTERS.map((c) => {
    const open = (c.n - 1) * LEVELS_PER_CHAPTER + 1 <= unlocked;
    return `<button class="tab ${c.n === showCh ? 'on' : ''} ${open ? '' : 'locked'}"
              data-act="chapter" data-n="${c.n}" ${open ? '' : 'disabled'}>${open ? c.n : '🔒'}</button>`;
  }).join('');

  const ch = CHAPTERS[showCh - 1];
  const levels = [];
  for (let i = 0; i < LEVELS_PER_CHAPTER; i++) {
    const n = (showCh - 1) * LEVELS_PER_CHAPTER + i + 1;
    const open = n <= unlocked;
    const stars = profile.story.cleared[n] || 0;
    const ev = open ? levelEvent(n) : null;
    levels.push(`
      <button class="pick ${open ? '' : 'locked'} ${stars ? 'done' : ''}" data-act="level" data-n="${n}" ${open ? '' : 'disabled'}>
        <div class="pick-grade">${open ? '★'.repeat(stars) + '☆'.repeat(3 - stars) : '🔒'}</div>
        <div class="pick-name">${n}. ${open ? esc(TRACK_BY_ID[ev.track].name) : 'LOCKED'}</div>
        <div class="pick-sub">${open ? esc(ev.objective.label) : 'WIN THE PREVIOUS RACE'}</div>
        ${open && ev.rivals && ev.rivals[0] && ev.rivals[0].boss
          ? `<div class="pick-desc">⚔ ${esc(ev.rivals[0].name)} — ${esc(ev.rivals[0].team)}</div>` : ''}
        ${open && ev.knockout ? `<div class="pick-desc">☠️ KNOCKOUT — last car every 22 seconds</div>` : ''}
      </button>`);
  }

  paint(`
    <div class="tabs">${chapterTabs}</div>
    <div class="card">
      <h2>${ch.n}. ${esc(ch.name)}</h2>
      <h3 style="margin-top:2px">${esc(ch.sub)}</h3>
      <p style="color:#b6c0ca;font-weight:500;font-size:14px;margin:8px 0 0">${esc(ch.blurb)}</p>
    </div>
    <div class="grid two">${levels.join('')}</div>
  `, {
    back: () => emit('nav', { to: 'title' }),
    chapter: (d) => { currentTab.story = +d.n; renderStory(); },
    level: (d) => emit('story:play', { level: +d.n }),
  }, { key: 'story:' + showCh, head: head('THE SEASON'), backdrop: true });
}

// ═══════════════════════════════ QUICK RACE ═══════════════════════════════
// You start with one circuit. Everything else is earned in the season, bought
// as a licence, or comes with a bigger team — so the map of the series opening
// up is itself a progression.
export function renderQuick() {
  const t = rankTier();
  const open = [], locked = [];
  // Locked circuits sort by how close you are to opening them, so the next one
  // to chase is always the one at the top of the list.
  const sorted = TRACK_DEFS.slice().sort((a, b) => gateDistance(a.id) - gateDistance(b.id));
  for (const d of sorted) {
    const unlocked = trackUnlocked(d.id);
    const gates = trackGates(d.id);
    const buy = gates.find((g) => g.kind === 'buy');
    const near = nearestGate(gates);
    const card = `
      <button class="pick ${unlocked ? '' : 'locked'}" data-act="${unlocked ? 'go' : 'why'}" data-id="${d.id}">
        <div class="pick-grade">${unlocked ? '◆'.repeat(d.grade) : '🔒'}</div>
        <div class="pick-name">${esc(d.name)}</div>
        <div class="pick-sub">${d.laps} LAPS · ${['', 'EASY', 'STEADY', 'TRICKY', 'HARD', 'BRUTAL'][d.grade]}${
          profile.wins && profile.wins[d.id] ? ` · WON ${profile.wins[d.id]}×` : ''}</div>
        <div class="pick-desc">${esc(d.flavour)}</div>
        ${unlocked ? '' : `<div class="lock-note">🔒 ${esc(conditionText(near))}${
          buy ? ` &nbsp;·&nbsp; or a licence for <span class="price ${profile.money < buy.cost ? 'cant' : ''}">${fmtMoney(buy.cost)}</span>` : ''}</div>`}
      </button>`;
    (unlocked ? open : locked).push(card);
  }

  paint(`
    <div class="card">
      <div class="stat"><span>WORLD RANKING</span><b style="color:${t.css}">${fmtRank(profile.rank)}</b></div>
      <div class="stat"><span>BEST EVER</span><b>${fmtRank(profile.bestRank)}</b></div>
      <div class="stat"><span>RACES · WINS · PODIUMS</span><b>${profile.quick.races} · ${profile.quick.wins} · ${profile.quick.podiums}</b></div>
      <div class="stat"><span>CIRCUITS OPEN</span><b>${open.length} / ${TRACK_DEFS.length}</b></div>
    </div>
    ${bookmakerCard()}
    <button class="btn primary" data-act="random">RACE ANYWHERE<small>RANDOM OPEN CIRCUIT · RANKED</small></button>
    <div class="sec-head"><h3>OPEN TO YOU</h3><span>${open.length} CIRCUITS</span></div>
    <div class="grid two">${open.join('')}</div>
    ${locked.length ? `
      <div class="sec-head"><h3>NOT YET</h3><span>TAP FOR THE REQUIREMENT</span></div>
      <div class="grid two">${locked.join('')}</div>` : ''}
  `, {
    back: () => emit('nav', { to: 'title' }),
    random: () => emit('race:begin', quickEvent({})),
    go: (d) => emit('race:begin', quickEvent({ track: d.id })),
    why: (d) => showTrackLock(d.id),
    bet: () => showBookmaker(),
    cancelbet: () => { profile.bet = null; saveProfile(true); renderQuick(); },
  }, { key: 'quick', head: head('QUICK RACE'), backdrop: true });
}

// ── the bookmaker ──────────────────────────────────────────────────────────
// A series where hitting people is legal has a betting market, obviously. It is
// also the one place a large pile of cash can turn into a larger one, which
// gives the money somewhere to go once the garage is full.
export const BETS = [
  { id: 'win',    label: 'WIN IT',        odds: 4.0, blurb: 'First place. Nothing else pays.' },
  { id: 'podium', label: 'TOP THREE',     odds: 1.8, blurb: 'A podium. The safe money.' },
  { id: 'wreck',  label: 'WRECK THREE',   odds: 3.2, blurb: 'Put three rivals out and finish the race.' },
  { id: 'clean',  label: 'PODIUM, CLEAN', odds: 5.5, blurb: 'Top three with no investigation at all.' },
];
export const betById = (id) => BETS.find((b) => b.id === id) || null;

function bookmakerCard() {
  const b = profile.bet;
  if (b) {
    const kind = betById(b.id);
    return `
      <div class="card" style="border-color:rgba(183,101,240,.55)">
        <div class="stat"><span>🎲 BET PLACED · ${esc(kind ? kind.label : b.id)}</span>
          <b class="good">${fmtMoney(b.stake)} → ${fmtMoney(Math.round(b.stake * (kind ? kind.odds : 1)))}</b></div>
        <p style="color:var(--dim);font-size:12px;font-weight:500;margin:6px 0 8px">
          Settles on your next ranked race, win or lose. The stake is already gone.</p>
        <button class="btn-mini" data-act="cancelbet">TEAR IT UP (NO REFUND)</button>
      </div>`;
  }
  return `<button class="pick" data-act="bet" style="border-color:rgba(183,101,240,.45)">
      <div class="pick-grade">UP TO 5.5×</div>
      <div class="pick-name">🎲 THE BOOKMAKER</div>
      <div class="pick-sub">STAKE ON YOUR OWN RESULT · SETTLES NEXT RANKED RACE</div>
      <div class="pick-desc">A man with a folding table takes bets on the drivers. He will happily take yours.</div>
    </button>`;
}

function showBookmaker() {
  const max = Math.min(profile.money, 50000);
  if (max < 500) { toast3('COME BACK WHEN YOU HAVE SOMETHING TO STAKE'); return; }
  const stakes = [500, 2500, 10000, 50000].filter((s) => s <= max);
  if (!stakes.length) stakes.push(Math.floor(max));
  let stake = stakes[0];
  let kindId = 'podium';

  const draw = () => {
    const kind = betById(kindId);
    popup('🎲 THE BOOKMAKER', `
      <p>He does not care whether you deserve to win. He cares what you are willing to lose.</p>
      <p style="color:var(--dim);letter-spacing:.14em;font-size:12px;margin-bottom:2px">WHAT ARE YOU BACKING?</p>
      ${BETS.map((b) => `<div class="stat" style="${b.id === kindId ? '' : 'opacity:.5'}">
        <span>${esc(b.label)} — ${esc(b.blurb)}</span><b>${b.odds.toFixed(1)}×</b></div>`).join('')}
      <div class="btn-row" style="margin:8px 0 12px;flex-wrap:wrap">
        ${BETS.map((b) => `<button class="btn-mini ${b.id === kindId ? 'on' : ''}" data-bk="${b.id}">${esc(b.label)}</button>`).join('')}
      </div>
      <p style="color:var(--dim);letter-spacing:.14em;font-size:12px;margin-bottom:2px">STAKE</p>
      <div class="btn-row" style="flex-wrap:wrap">
        ${stakes.map((s) => `<button class="btn-mini ${s === stake ? 'on' : ''}" data-st="${s}">${fmtMoney(s)}</button>`).join('')}
      </div>
      <p style="margin-top:10px">Returns <span class="price">${fmtMoney(Math.round(stake * kind.odds))}</span> if it comes in.</p>
    `, [
      { label: 'WALK AWAY', act: () => closePopup() },
      {
        label: `PUT ${fmtMoney(stake)} ON IT`, primary: true, act: () => {
          if (profile.money < stake) { closePopup(); toast3('NOT ENOUGH IN THE ACCOUNT'); return; }
          profile.money -= stake;
          profile.bet = { id: kindId, stake, odds: kind.odds };
          saveProfile(true);
          closePopup();
          renderQuick();
        },
      },
    ]);
    // The popup body is rebuilt each time, so rewire its own little buttons.
    $('popup-body').querySelectorAll('[data-bk]').forEach((n) =>
      n.addEventListener('click', () => { sfx('ui'); kindId = n.dataset.bk; draw(); }));
    $('popup-body').querySelectorAll('[data-st]').forEach((n) =>
      n.addEventListener('click', () => { sfx('ui'); stake = +n.dataset.st; draw(); }));
  };
  draw();
}

// Roughly "how much work is left", normalised across the gate kinds so they can
// be compared. Only ever used for ordering a list, so approximate is fine.
function gateDistance(trackId) {
  const gates = trackGates(trackId);
  if (!gates.length || trackUnlocked(trackId)) return -1;
  let best = Infinity;
  for (const g of gates) {
    let d;
    if (g.kind === 'story') d = Math.max(0, g.level - storyCleared());
    else if (g.kind === 'team') d = Math.max(0, g.level - teamLevel()) * 25;
    else if (g.kind === 'buy') d = profile.money >= g.cost ? 1 : 40;
    else if (g.kind === 'win') d = 30;
    else d = 50;
    best = Math.min(best, d);
  }
  return best;
}

// A padlock nobody can read is just a wall. Every locked thing in this game
// says what would open it, and offers the cash route if there is one.
function showTrackLock(id) {
  const def = TRACK_BY_ID[id];
  const gates = trackGates(id);
  const buy = gates.find((g) => g.kind === 'buy');
  const rows = gates.filter((g) => g.kind !== 'buy')
    .map((g) => `<div class="stat"><span>${esc(conditionText(g))}</span><b class="${conditionMet(g) ? 'good' : ''}">${conditionMet(g) ? '✓' : '—'}</b></div>`)
    .join('');

  const buttons = [{ label: 'CLOSE', act: () => closePopup() }];
  if (buy) {
    const can = profile.money >= buy.cost;
    buttons.push({
      label: can ? `BUY LICENCE ${fmtMoney(buy.cost)}` : `NEED ${fmtMoney(buy.cost - profile.money)} MORE`,
      primary: can,
      act: () => {
        if (!buyTrack(id)) { sfx('deny'); return; }
        saveProfile(true);
        closePopup();
        renderQuick();
      },
    });
  }
  popup(`🔒 ${def.name}`, `
    <p>${esc(def.flavour)}</p>
    <p style="color:var(--dim);letter-spacing:.14em;font-size:12px;margin-bottom:2px">ANY ONE OF THESE OPENS IT</p>
    ${rows}
    ${buy ? `<p style="margin-top:8px">Or buy the licence outright. The series does not care how you got in.</p>` : ''}
  `, buttons);
}

// ═══════════════════════════════ EVENTS ═══════════════════════════════
// Sorted so everything you can actually enter is at the top of the list, then
// the ones waiting on a date, then the ones waiting on you. Nothing is ever a
// bare padlock: tap it and it tells you exactly what would open it.
export function renderEvents() {
  const daily = dailyEvent();
  const doneDaily = profile.events.cleared[daily.id];

  const card = (e, kind) => {
    const done = profile.events.cleared[e.id];
    const wait = kind === 'soon' ? eventCountdown(e) : 0;
    const near = nearestGate(eventGates(e));
    return `
      <button class="pick ${kind === 'open' ? '' : 'locked'} ${done ? 'done' : ''}"
              data-act="${kind === 'open' ? 'ev' : 'why'}" data-id="${e.id}">
        <div class="pick-grade">${done ? '✓ CLEARED' : (CHEST_TIERS[e.chest] || {}).name || ''}</div>
        <div class="pick-name">${e.icon} ${esc(e.name)}</div>
        <div class="pick-sub">${esc(TRACK_BY_ID[e.track].name)} · ${e.laps} LAPS · ${e.cars} CARS · ${fmtMoney(e.purse)}</div>
        <div class="pick-desc">${esc(e.blurb)}</div>
        ${kind === 'open'
          ? `<div class="pick-desc" style="color:var(--warn)">🎯 ${esc(e.objective.label)}</div>`
          : kind === 'soon'
            ? `<div class="lock-note">⏳ ${esc(e.when || 'NOT TODAY')} — OPENS IN <span class="countdown">${fmtCountdown(wait)}</span></div>`
            : `<div class="lock-note">🔒 ${esc(conditionText(near))} <span style="color:var(--dim)">· tap for details</span></div>`}
      </button>`;
  };

  const open = [], soon = [], shut = [];
  for (const e of SPECIAL_EVENTS) {
    if (eventUnlocked(e)) open.push(card(e, 'open'));
    else if (eventEarned(e)) soon.push(card(e, 'soon'));
    else shut.push(card(e, 'locked'));
  }

  paint(`
    <button class="pick" data-act="daily" style="border-color:var(--warn)">
      <div class="pick-grade">${doneDaily ? '✓ DONE TODAY' : 'CONTRABAND CRATE'}</div>
      <div class="pick-name">${daily.icon} ${esc(daily.title)}</div>
      <div class="pick-sub">${esc(daily.subtitle)} · ${daily.laps} LAPS · ${fmtMoney(daily.purse)}</div>
      <div class="pick-desc">${esc(daily.blurb)}</div>
      <div class="lock-note">🔄 A NEW ONE IN <span class="countdown">${fmtCountdown(untilMidnight())}</span></div>
    </button>

    ${open.length ? `<div class="sec-head"><h3>RUNNING NOW</h3><span>${open.length} OPEN</span></div>
      <div class="grid two">${open.join('')}</div>` : ''}
    ${soon.length ? `<div class="sec-head"><h3>COMING UP</h3><span>YOURS — JUST NOT TODAY</span></div>
      <div class="grid two">${soon.join('')}</div>` : ''}
    ${shut.length ? `<div class="sec-head"><h3>NOT YET INVITED</h3><span>TAP FOR THE REQUIREMENT</span></div>
      <div class="grid two">${shut.join('')}</div>` : ''}
  `, {
    back: () => emit('nav', { to: 'title' }),
    daily: () => emit('race:begin', daily),
    ev: (d) => emit('race:begin', eventById(d.id)),
    why: (d) => showEventLock(d.id),
  }, { key: 'events', head: head('SPECIAL EVENTS'), backdrop: true });
}

function showEventLock(id) {
  const e = SPECIAL_EVENTS.find((x) => x.id === id);
  if (!e) return;
  const rows = eventGates(e).map((g) =>
    `<div class="stat"><span>${esc(conditionText(g))}</span><b class="${conditionMet(g) ? 'good' : ''}">${conditionMet(g) ? '✓ DONE' : '—'}</b></div>`).join('');
  const wait = eventCountdown(e);
  popup(`${e.icon} ${e.name}`, `
    <p>${esc(e.blurb)}</p>
    ${e.reward ? `<p style="color:var(--good)">🎁 Winning it pays out: ${esc(e.reward)}</p>` : ''}
    <p style="color:var(--dim);letter-spacing:.14em;font-size:12px;margin-bottom:2px">ANY ONE OF THESE GETS YOU AN INVITATION</p>
    ${rows || '<div class="stat"><span>No requirements</span><b class="good">✓</b></div>'}
    ${e.days ? `<p style="margin-top:8px">It only runs ${esc((e.when || '').toLowerCase() || 'on certain days')}${
      wait ? ` — next one in <span class="countdown">${fmtCountdown(wait)}</span>` : ''}.</p>` : ''}
  `, [{ label: 'CLOSE', primary: true, act: () => closePopup() }]);
}

function fmtCountdown(sec) {
  if (sec <= 0) return 'NOW';
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function untilMidnight() {
  const now = new Date();
  const mid = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return (mid - now) / 1000;
}

// ═══════════════════════════════ GARAGE ═══════════════════════════════
// Only what you own. Buying happens in the shop next door, so this screen is
// about fitting and upgrading rather than window shopping.
export function renderGarage(tab) {
  const slotId = tab || currentTab.garage;
  currentTab.garage = slotId;
  const isTricks = slotId === 'tricks';
  const st = playerStats();
  const car = activeCar();

  const tabs = SLOTS.map((s) => `
    <button class="tab ${s.id === slotId ? 'on' : ''}" data-act="tab" data-id="${s.id}">${s.icon} ${s.name}</button>`).join('')
    + `<button class="tab ${isTricks ? 'on' : ''}" data-act="tab" data-id="tricks">🔧 TRICKS</button>`;

  let body;
  if (isTricks) {
    body = renderTricks();
  } else {
    const slot = SLOTS.find((s) => s.id === slotId);
    const mine = partsForSlot(slotId).filter((p) => profile.garage.parts.includes(p.id));
    const missing = partsForSlot(slotId).length - mine.length;
    body = `<h3 style="margin-bottom:6px">${slot.icon} ${slot.name} — ${esc(slot.blurb)}</h3>
      ${mine.map((p) => itemRow(p, slot.icon, profile.garage.equipped[slotId] === p.id, 'equip')).join('')}
      ${missing ? `<p style="color:var(--dim);font-size:12px;font-weight:500;margin-top:10px">
        ${missing} more ${slot.name.toLowerCase()} exist. <button class="btn-mini" data-act="shop">GO TO THE SHOP ▸</button></p>` : ''}`;
  }

  const chests = profile.chests.length;
  paint(`
    ${chests ? `<button class="btn primary" data-act="openchests">OPEN ${chests} CRATE${chests > 1 ? 'S' : ''}<small>MOSTLY CASH — BUT NOT ALWAYS</small></button>` : ''}
    <div class="room" id="garage-room">
      <div class="room-cap">${esc(car.name)} · ${esc(car.maker)} · ${esc(playerLivery().name.toUpperCase())}</div>
    </div>
    <div class="card">
      <div class="grid three">
        <div><h3>POWER</h3><div style="font-size:26px">${playerPower()}</div></div>
        <div><h3>TOP SPEED</h3><div style="font-size:26px">${Math.round((74 + st.top) * 3.6)}<small style="font-size:11px"> KM/H</small></div></div>
        <div><h3>GRIP</h3><div style="font-size:26px">${(st.grip * 100).toFixed(0)}%</div></div>
        <div><h3>ARMOUR</h3><div style="font-size:26px">${Math.round((1 - st.armour) * 100)}%</div></div>
        <div><h3>RAM</h3><div style="font-size:26px">${(st.ram * 100).toFixed(0)}%</div></div>
        <div><h3>STEALTH</h3><div style="font-size:26px;color:${st.stealth < 0.8 ? 'var(--good)' : 'inherit'}">${Math.round((1 - st.stealth) * 100)}%</div></div>
      </div>
      <p style="color:var(--dim);font-size:12px;font-weight:500;margin:8px 0 0">
        STEALTH is the only stat the stewards can see. Every point of it is suspicion they never write down.</p>
    </div>
    <div class="tabs">${tabs}</div>
    <div class="card">${body}</div>
    <div class="card">
      <h3>PAINT</h3>
      <div class="grid four" style="margin-top:8px">
        <button class="item ${profile.livery < 0 ? 'on' : ''}" data-act="livery" data-i="-1">
          <span class="ic" style="width:18px;height:18px;border-radius:4px;background:#${car.body.toString(16).padStart(6, '0')};border:1px solid rgba(255,255,255,.3)"></span>
          <span class="nm">Factory</span>
        </button>
        ${LIVERY.map((l, i) => `
          <button class="item ${profile.livery === i ? 'on' : ''}" data-act="livery" data-i="${i}">
            <span class="ic" style="width:18px;height:18px;border-radius:4px;background:#${l.body.toString(16).padStart(6, '0')}"></span>
            <span class="nm">${esc(l.name)}</span>
          </button>`).join('')}
      </div>
    </div>
  `, {
    back: () => emit('nav', { to: 'title' }),
    tab: (d) => renderGarage(d.id),
    shop: () => emit('nav', { to: 'shop' }),
    equip: (d) => { equipPart(partById(d.id).slot, d.id); renderGarage(slotId); },
    up: (d) => doUpgrade(d.id, () => renderGarage(slotId)),
    trick: (d) => {
      if (!toggleLoadout(d.id)) toast3('LOADOUT IS FULL — TAKE ONE OFF FIRST');
      renderGarage('tricks');
    },
    livery: (d) => { profile.livery = +d.i; saveProfile(); rebuildRoom(); renderGarage(slotId); },
    openchests: () => emit('nav', { to: 'chests' }),
  }, { key: 'garage:' + slotId, head: head('GARAGE') });
  mountRoom('garage-room', 'garage');
}

// One row shape for a part or a trick you own: what it is, what mark it is at,
// and what the next mark costs. The upgrade button is the point of the screen.
function itemRow(item, icon, equipped, act) {
  const lvl = levelOf(item.id);
  const cost = nextUpgradeCost(item.id);
  const can = cost && profile.money >= cost;
  const maxed = lvl >= MAX_LEVEL;
  const tierPips = item.tier
    ? `<span class="pipbar">${Array.from({ length: 6 }, (_, i) => `<i class="${i < item.tier ? 'on' : ''}"></i>`).join('')}</span>`
    : '';
  return `
    <div class="item rar-${item.rarity} ${equipped ? 'on' : ''}">
      <span class="ic">${icon}</span>
      <span class="nm">${esc(item.name)}${lvl > 1 ? `<span class="mark">MK ${MARKS[lvl]}</span>` : ''}
        <small>${RARITY[item.rarity].name}${item.tier ? ` · TIER ${item.tier}` : ''} · ${equipped ? 'FITTED' : 'IN THE RACK'}</small>
      </span>
      ${tierPips}
      <div class="buyrow" style="flex:0 0 auto;margin:0">
        ${equipped ? '' : `<button class="btn-mini" data-act="${act}" data-id="${item.id}">FIT</button>`}
        ${maxed
          ? `<span class="tagline-src" style="color:var(--good)">MK V — MAXED</span>`
          : `<button class="btn-mini ${can ? 'on' : ''}" data-act="up" data-id="${item.id}">MK ${MARKS[lvl + 1]} · ${fmtMoney(cost)}</button>`}
      </div>
    </div>`;
}

function doUpgrade(id, after) {
  const item = itemById(id);
  const cost = nextUpgradeCost(id);
  if (!cost) return;
  if (profile.money < cost) {
    toast3(`THAT IS ${fmtMoney(cost - profile.money)} MORE THAN YOU HAVE`);
    return;
  }
  const lvl = levelOf(id);
  popup(`UPGRADE ${item.name}?`, `
    <p>Take it from <b>MK ${MARKS[lvl]}</b> to <b>MK ${MARKS[lvl + 1]}</b> for <span class="price">${fmtMoney(cost)}</span>.</p>
    <p style="color:var(--dim)">Every mark pushes the part further from stock. The marks after this one cost a great deal more.</p>
  `, [
    { label: 'NOT NOW', act: () => closePopup() },
    {
      label: 'DO IT', primary: true, act: () => {
        upgradeItem(id);
        closePopup();
        after && after();
      },
    },
  ]);
}

function renderTricks() {
  const lo = profile.garage.loadout;
  const mine = SKILLS.filter((s) => profile.garage.skills.includes(s.id));
  const rows = mine.map((s) => {
    const on = lo.includes(s.id);
    const band = { contact: 'CONTACT', close: 'CLOSE', mid: 'MID-RANGE', long: 'LONG RANGE', drop: 'DROPPED' }[s.band];
    const heat = s.susp < 30 ? 'LOW HEAT' : s.susp < 60 ? 'HOT' : 'RADIOACTIVE';
    const lvl = levelOf(s.id);
    const cost = nextUpgradeCost(s.id);
    return `
      <div class="item rar-${s.rarity} ${on ? 'on' : ''}">
        <span class="ic">${s.icon}</span>
        <span class="nm">${esc(s.name)}${lvl > 1 ? `<span class="mark">MK ${MARKS[lvl]}</span>` : ''}
          <small>${band} · ${s.range ? Math.round(s.range) + 'm' : 'BEHIND YOU'} · ${s.cd}s · ${heat}</small>
          <small style="color:#b6c0ca;letter-spacing:0">${esc(s.blurb)}</small>
        </span>
        <div class="buyrow" style="flex:0 0 auto;margin:0">
          <button class="btn-mini ${on ? 'on' : ''}" data-act="trick" data-id="${s.id}">${on ? 'EQUIPPED' : 'EQUIP'}</button>
          ${lvl >= MAX_LEVEL
            ? '<span class="tagline-src" style="color:var(--good)">MK V</span>'
            : `<button class="btn-mini" data-act="up" data-id="${s.id}">MK ${MARKS[lvl + 1]} · ${fmtMoney(cost)}</button>`}
        </div>
      </div>`;
  }).join('');
  const missing = SKILLS.length - mine.length;
  return `
    <h3 style="margin-bottom:4px">EQUIPPED ${lo.length}/3</h3>
    <p style="color:var(--dim);font-size:12px;font-weight:500;margin:0 0 10px">
      One button fires whichever equipped trick is ready and has a target. Close range reads as a racing
      incident; long range reads as exactly what it is.</p>
    ${rows}
    ${missing ? `<p style="color:var(--dim);font-size:12px;font-weight:500;margin-top:10px">
      ${missing} more tricks exist. <button class="btn-mini" data-act="shop">GO TO THE SHOP ▸</button></p>` : ''}`;
}

// ═══════════════════════════════ SHOP ═══════════════════════════════
// Cash is the main road through this game now, so almost everything has a
// price on it. The exceptions are the point: a handful of parts only ever fall
// out of a crate, and the very best of each slot has to be won.
export function renderShop(tab) {
  const slotId = tab || currentTab.shop;
  currentTab.shop = slotId;
  const isTricks = slotId === 'tricks';

  const tabs = SLOTS.map((s) => `
    <button class="tab ${s.id === slotId ? 'on' : ''}" data-act="tab" data-id="${s.id}">${s.icon} ${s.name}</button>`).join('')
    + `<button class="tab ${isTricks ? 'on' : ''}" data-act="tab" data-id="tricks">🔧 TRICKS</button>`;

  const list = isTricks ? SKILLS : partsForSlot(slotId);
  const icon = isTricks ? null : (SLOTS.find((s) => s.id === slotId) || {}).icon;
  const rows = list.map((it) => {
    const have = owns(it.id);
    const src = SOURCES[it.src] || SOURCES.shop;
    const can = profile.money >= it.price;
    let action;
    if (have) action = '<span class="tagline-src" style="color:var(--good)">✓ OWNED</span>';
    else if (it.src === 'shop') {
      action = `<button class="btn-mini ${can ? 'on' : ''}" data-act="buy" data-id="${it.id}">
        <span class="price ${can ? '' : 'cant'}">${fmtMoney(it.price)}</span></button>`;
    } else if (it.src === 'crate') action = '<span class="tagline-src" style="color:#b765f0">CRATE ONLY</span>';
    else action = '<span class="tagline-src" style="color:var(--good)">PRIZE ONLY</span>';

    return `
      <div class="item rar-${it.rarity} ${have ? 'on' : ''}">
        <span class="ic">${isTricks ? it.icon : icon}</span>
        <span class="nm">${esc(it.name)}
          <small>${RARITY[it.rarity].name}${it.tier ? ` · TIER ${it.tier}` : ''} · <span style="color:${src.css}">${src.name}</span></small>
          <small style="color:#b6c0ca;letter-spacing:0">${esc(it.blurb || statLine(it))}</small>
          ${it.prize && !have ? `<small style="color:var(--good)">🏆 ${esc(conditionText(it.prize))}</small>` : ''}
        </span>
        ${action}
      </div>`;
  }).join('');

  paint(`
    <div class="card">
      <div class="stat"><span>IN THE ACCOUNT</span><b class="good" style="font-size:1.3em">${fmtMoney(profile.money)}</b></div>
      <p style="color:var(--dim);font-size:12px;font-weight:500;margin:6px 0 0">
        Prize money buys nearly everything here, and everything here is expensive. Two parts per slot are not
        for sale at any price — one only comes out of a crate, and the best one has to be won.</p>
    </div>
    <div class="tabs">${tabs}</div>
    <div class="card">${rows}</div>
  `, {
    back: () => emit('nav', { to: 'title' }),
    tab: (d) => renderShop(d.id),
    buy: (d) => {
      const it = itemById(d.id);
      if (profile.money < it.price) { toast3(`THAT IS ${fmtMoney(it.price - profile.money)} MORE THAN YOU HAVE`); return; }
      popup(`BUY ${it.name}?`, `
        <p>${esc(it.blurb || statLine(it))}</p>
        <p><span class="price">${fmtMoney(it.price)}</span> — leaving you ${fmtMoney(profile.money - it.price)}.</p>
      `, [
        { label: 'CANCEL', act: () => closePopup() },
        { label: 'BUY IT', primary: true, act: () => { buyItem(d.id); closePopup(); renderShop(slotId); } },
      ]);
    },
  }, { key: 'shop:' + slotId, head: head('PARTS SHOP') });
}

function statLine(p) {
  const bits = [];
  const nice = { top: 'top speed', accel: 'acceleration', grip: 'grip', armour: 'damage taken', ram: 'damage dealt', mass: 'weight', partHp: 'panel strength', stealth: 'suspicion', boostPow: 'boost', boostTime: 'boost time', boostMax: 'boost capacity', offroad: 'off-road', hypeGain: 'crowd' };
  for (const [k, v] of Object.entries(p.stats || {})) {
    if (k === 'top') bits.push(`${v >= 0 ? '+' : ''}${Math.round(v * 3.6)} km/h`);
    else if (k === 'boostMax' || k === 'boostTime') bits.push(`+${v} ${nice[k]}`);
    else bits.push(`${nice[k] || k} ${v > 1 ? '+' : ''}${Math.round((v - 1) * 100)}%`);
  }
  return bits.join(' · ');
}

// ═══════════════════════════════ SHOWROOM ═══════════════════════════════
export function renderShowroom() {
  const active = activeCar();
  const rows = CARS.map((c) => {
    const have = ownsCar(c.id);
    const on = active.id === c.id;
    const can = profile.money >= c.price;
    let action;
    if (on) action = '<span class="tagline-src" style="color:var(--brand)">IN THE BAY</span>';
    else if (have) action = `<button class="btn-mini on" data-act="use" data-id="${c.id}">DRIVE IT</button>`;
    else if (c.src === 'shop') action = `<button class="btn-mini ${can ? 'on' : ''}" data-act="buy" data-id="${c.id}"><span class="price ${can ? '' : 'cant'}">${fmtMoney(c.price)}</span></button>`;
    else action = `<span class="tagline-src" style="color:var(--good)">${esc(c.tag)}</span>`;

    return `
      <div class="item ${on ? 'on' : ''} ${have ? '' : 'rar-common'}">
        <span class="ic" style="width:20px;height:20px;border-radius:5px;background:#${c.body.toString(16).padStart(6, '0')};border:1px solid rgba(255,255,255,.25)"></span>
        <span class="nm">${esc(c.name)}
          <small>${esc(c.maker)} · ${esc((c.style || '').toUpperCase())} · ${esc(c.tag)}</small>
          <small style="color:#b6c0ca;letter-spacing:0">${esc(c.blurb)}</small>
          <small style="color:var(--warn);letter-spacing:0">${esc(statLine(c) || 'No bias — it is exactly as good as the parts in it.')}</small>
          ${!have && c.unlock ? `<small style="color:var(--good)">🏆 ${esc(conditionText(c.unlock))}</small>` : ''}
        </span>
        ${action}
      </div>`;
  }).join('');

  paint(`
    <div class="room" id="show-room">
      <div class="room-cap">${esc(active.name)} · ${esc(active.maker)}</div>
    </div>
    <div class="card">
      <div class="stat"><span>IN THE ACCOUNT</span><b class="good">${fmtMoney(profile.money)}</b></div>
      <p style="color:var(--dim);font-size:12px;font-weight:500;margin:6px 0 0">
        A chassis decides what the car <i>is</i> — its shape, its weight and what it is naturally good at. The
        parts you bolt on decide how good it is at that.</p>
    </div>
    <div class="card">${rows}</div>
  `, {
    back: () => emit('nav', { to: 'title' }),
    use: (d) => { selectCar(d.id); rebuildRoom(); renderShowroom(); },
    buy: (d) => {
      const c = carById(d.id);
      if (profile.money < c.price) { toast3(`THAT IS ${fmtMoney(c.price - profile.money)} MORE THAN YOU HAVE`); return; }
      popup(`BUY THE ${c.name}?`, `
        <p>${esc(c.blurb)}</p>
        <p><span class="price">${fmtMoney(c.price)}</span> — leaving you ${fmtMoney(profile.money - c.price)}. It goes straight into the bay.</p>
      `, [
        { label: 'CANCEL', act: () => closePopup() },
        { label: 'BUY IT', primary: true, act: () => { buyCar(d.id); closePopup(); rebuildRoom(); renderShowroom(); } },
      ]);
    },
  }, { key: 'showroom', head: head('SHOWROOM') });
  mountRoom('show-room', 'showroom');
}

// ═══════════════════════════════ CHESTS ═══════════════════════════════
export function renderChestQueue(queue) {
  const list = queue && queue.length ? queue : profile.chests;
  if (!list.length) { emit('nav', { to: 'garage' }); return; }
  const tier = CHEST_TIERS[list[0]] || CHEST_TIERS.scrap;
  paint(`
    <div class="chest-stage">
      <div class="chest-icon">📦</div>
      <h1 style="color:${tier.css};margin-top:10px">${esc(tier.name)}</h1>
      <p style="color:var(--dim);letter-spacing:.2em;font-size:13px">${list.length} WAITING</p>
    </div>
    <button class="btn primary" data-act="open">CRACK IT OPEN</button>
    <button class="btn ghost" data-act="later">LATER</button>
  `, {
    // flow.openChest takes it off the profile queue — do not shift here too.
    open: () => emit('chest:open', { tier: list[0] }),
    later: () => emit('nav', { to: 'garage' }),
  }, { key: 'chests', head: head('CRATE', false) });
}

export function renderChestResult(tierId, loot, onDone) {
  const tier = CHEST_TIERS[tierId] || CHEST_TIERS.scrap;
  const rows = loot.items.map((it, i) => {
    if (it.kind === 'cash') {
      return `<div class="item rar-common" style="animation-delay:${i * 0.12}s">
        <span class="ic">💵</span><span class="nm">${fmtMoney(it.amount)}<small>${it.why ? esc('DUPLICATE — ' + it.why) : 'PRIZE MONEY'}</small></span></div>`;
    }
    if (it.kind === 'part') {
      const p = partById(it.id);
      const slot = SLOTS.find((s) => s.id === p.slot);
      return `<div class="item rar-${p.rarity}" style="animation-delay:${i * 0.12}s">
        <span class="ic">${slot.icon}</span>
        <span class="nm">${esc(p.name)}<small>${RARITY[p.rarity].name} ${slot.name} · TIER ${p.tier}</small></span></div>`;
    }
    const s = skillById(it.id);
    return `<div class="item rar-${s.rarity}" style="animation-delay:${i * 0.12}s">
      <span class="ic">${s.icon}</span>
      <span class="nm">${esc(s.name)}<small>${RARITY[s.rarity].name} TRICK · ${esc(s.tip)}</small></span></div>`;
  }).join('');

  paint(`
    <div class="chest-stage" style="padding:2vh 0">
      <h1 style="color:${tier.css}">${esc(tier.name)}</h1>
    </div>
    <div class="loot">${rows}</div>
    <button class="btn primary" data-act="ok" style="margin-top:16px">TAKE IT</button>
  `, { ok: () => onDone && onDone() }, { key: 'chestresult' });
}

// ═══════════════════════════════ RESULTS ═══════════════════════════════
export function renderResults(r) {
  if (!r) { emit('nav', { to: 'title' }); return; }
  const ev = r.event || {};
  const win = r.position === 1;
  const podium = r.position <= 3;

  const standings = r.classified.map((c) => `
    <tr class="${c.isPlayer ? 'me' : ''}">
      <td class="p">${c.pos}</td>
      <td><span class="sw" style="background:#${c.livery.body.toString(16).padStart(6, '0')}"></span>${esc(c.name)}</td>
      <td class="t">${c.retired ? 'OUT' : c.time ? fmtTime(c.time) : 'DNF'}</td>
    </tr>`).join('');

  const objectiveRow = r.objective ? `
    <div class="card" style="border-color:${r.objectivePassed ? 'rgba(55,194,106,.6)' : 'rgba(255,66,66,.5)'}">
      <div class="stat">
        <span>${r.objectivePassed ? '✓ OBJECTIVE COMPLETE' : '✗ OBJECTIVE FAILED'}</span>
        <b class="${r.objectivePassed ? 'good' : 'bad'}">${esc(r.objective.label)}</b>
      </div>
    </div>` : '';

  const ladderRow = r.rankAfter != null ? `
    <div class="card">
      <div class="stat"><span>WORLD RANKING</span>
        <b class="${r.rankAfter < r.rankBefore ? 'good' : r.rankAfter > r.rankBefore ? 'bad' : ''}">
          ${fmtRank(r.rankBefore)} → ${fmtRank(r.rankAfter)}
        </b></div>
    </div>` : '';

  paint(`
    <div class="result-hero">
      <div class="result-pos" style="color:${win ? 'var(--warn)' : podium ? 'var(--ink)' : 'var(--dim)'}">
        ${r.retired ? 'OUT' : ordinal(r.position).replace(/^(\d+)/, '$1<small>').replace(/(st|nd|rd|th)$/, '$1</small>')}
      </div>
      <div class="result-tag">${esc(ev.title || 'RACE')} · ${esc(ev.subtitle || '')}</div>
    </div>

    ${objectiveRow}

    ${r.titleOutcome ? `
      <div class="card" style="border-color:${r.titleOutcome.out ? 'rgba(255,66,66,.5)' : 'rgba(55,194,106,.6)'}">
        <div class="stat">
          <span>${esc(r.titleName || 'TITLE')}</span>
          <b class="${r.titleOutcome.out ? 'bad' : 'good'}">${
            r.titleOutcome.champion ? '🏆 CHAMPION' : r.titleOutcome.out ? '✗ KNOCKED OUT' : '▸ THROUGH TO THE NEXT ROUND'}</b>
        </div>
      </div>` : ''}

    ${r.prizesWon && r.prizesWon.length ? `
      <div class="card" style="border-color:rgba(55,194,106,.6)">
        <h3 style="color:var(--good)">🏆 EARNED</h3>
        ${r.prizesWon.map((p) => `<div class="stat"><span>${p.kind === 'car' ? 'NEW CAR' : p.kind === 'skill' ? 'NEW TRICK' : 'NEW PART'}</span><b class="good">${esc(p.name)}</b></div>`).join('')}
      </div>` : ''}

    <div class="card">
      <div class="money-row plus"><span>PRIZE MONEY</span><b>${fmtMoney(r.prize)}</b></div>
      ${r.teamBonus ? `<div class="money-row plus"><span>${esc(team().name)} SHARE</span><b>${fmtMoney(r.teamBonus)}</b></div>` : ''}
      <div class="money-row ${r.hypeBonus ? 'plus' : ''}"><span>CROWD BONUS (${Math.round(r.hype)} HYPE)</span><b>${fmtMoney(r.hypeBonus)}</b></div>
      ${r.pickupCash ? `<div class="money-row plus"><span>PICKED UP ON TRACK</span><b>${fmtMoney(r.pickupCash)}</b></div>` : ''}
      <div class="money-row ${r.damageBill ? 'minus' : ''}"><span>REPAIRS</span><b>${r.damageBill ? '-' + fmtMoney(r.damageBill) : '$0'}</b></div>
      <div class="money-row ${r.fines ? 'minus' : ''}">
        <span>STEWARDS' FINES (${r.investigations} INVESTIGATION${r.investigations === 1 ? '' : 'S'})</span>
        <b>${r.fines ? '-' + fmtMoney(r.fines) : '$0'}</b></div>
      <div class="money-row total"><span>NET</span><b class="${r.net >= 0 ? 'good' : 'bad'}">${fmtMoney(r.net)}</b></div>
      ${r.bet ? `<div class="money-row ${r.bet.won ? 'plus' : 'minus'}">
        <span>🎲 ${esc((betById(r.bet.id) || {}).label || 'BET')} AT ${r.bet.odds.toFixed(1)}× — ${r.bet.won ? 'CAME IN' : 'NOTHING DOING'}</span>
        <b>${r.bet.won ? fmtMoney(r.bet.payout) : '-' + fmtMoney(r.bet.stake)}</b></div>` : ''}
      ${r.crates ? `<div class="money-row plus"><span>CRATES FOR ${ordinal(r.position)}</span><b>📦 × ${r.crates}</b></div>` : ''}
    </div>

    ${ladderRow}

    <div class="grid two">
      <div class="card">
        <h3>THE RACE</h3>
        <div class="stat"><span>BEST LAP</span><b>${isFinite(r.bestLap) ? fmtTime(r.bestLap) : '--'}</b></div>
        <div class="stat"><span>OVERTAKES</span><b>${r.overtakes}</b></div>
        <div class="stat"><span>BIGGEST AIR</span><b>${(r.bestAir || 0).toFixed(1)}m</b></div>
        <div class="stat"><span>TIME SIDEWAYS</span><b>${(r.driftTime || 0).toFixed(1)}s</b></div>
      </div>
      <div class="card">
        <h3>THE PAPERWORK</h3>
        <div class="stat"><span>RIVALS WRECKED</span><b>${r.wrecksCaused}</b></div>
        <div class="stat"><span>PARTS KNOCKED OFF</span><b>${r.partsKnockedOff}</b></div>
        <div class="stat"><span>FOULS</span><b>${r.fouls} <small style="color:var(--good)">(${r.cleanFouls} passed as racing)</small></b></div>
        <div class="stat"><span>PEAK SUSPICION</span><b class="${r.suspicionPeak > 80 ? 'bad' : ''}">${Math.round(r.suspicionPeak)}</b></div>
      </div>
    </div>

    <div class="card">
      <h3>CLASSIFICATION</h3>
      <table class="standings">${standings}</table>
    </div>

    ${r.highlights && r.highlights.length ? `<button class="btn ghost" data-act="replay">▶ WATCH THE HIGHLIGHTS AGAIN<small>${r.highlights.length} MOMENTS</small></button>` : ''}
    <div class="btn-row">
      <button class="btn" data-act="again">RACE AGAIN</button>
      <button class="btn primary" data-act="next">${nextLabel(ev, r)}</button>
    </div>
  `, {
    again: () => emit('race:begin', ev),
    next: () => {
      if (ev.mode === 'story' && r.objectivePassed && ev.level < storyLength()) {
        emit('story:play', { level: ev.level + 1 });
      } else if (profile.chests.length) emit('nav', { to: 'chests' });
      else emit('nav', { to: ev.mode === 'story' ? 'story' : ev.mode === 'event' ? 'events' : 'quick' });
    },
    replay: () => emit('replay:again', r),
  }, { key: 'results' });
}

function nextLabel(ev, r) {
  if (ev.mode === 'story' && r.objectivePassed && ev.level < storyLength()) return 'NEXT LEVEL ▸';
  if (profile.chests.length) return 'OPEN CRATES ▸';
  return 'CONTINUE ▸';
}

// ═══════════════════════════════ LADDER ═══════════════════════════════
export function renderLadder() {
  const t = rankTier();
  const pct = (1 - profile.rank / LADDER.population) * 100;
  const tiers = [
    ['WORLD CHAMPION', 1], ['TOP TEN', 10], ['HEADLINER', 100], ['CONTENDER', 1000],
    ['PRO CIRCUIT', 10000], ['SEMI-PRO', 60000], ['CLUB RACER', 150000], ['NOBODY', LADDER.population],
  ];
  const rows = tiers.map(([name, r]) => `
    <div class="stat" style="${profile.rank <= r ? '' : 'opacity:.42'}">
      <span>${name}</span><b>${profile.rank <= r ? '✓ ' : ''}TOP ${r.toLocaleString('en-US')}</b>
    </div>`).join('');

  paint(`
    <div class="card" style="text-align:center">
      <div style="font-size:clamp(34px,9vmin,80px);color:${t.css};font-weight:800">${fmtRank(profile.rank)}</div>
      <div class="result-tag">${t.name} · TOP ${pct.toFixed(pct > 99 ? 3 : 1)}%</div>
      <div class="bar" style="width:100%;height:10px;margin-top:12px">
        <i style="width:${clamp01(pct / 100) * 100}%;background:linear-gradient(90deg,#4aa3ef,${t.css})"></i>
      </div>
      <p style="color:var(--dim);font-size:13px;font-weight:500;margin:12px 0 0">
        ${LADDER.population.toLocaleString('en-US')} licensed drivers. You started at ${fmtRank(LADDER.startRank)}.
        Best you have ever been: ${fmtRank(profile.bestRank)}.</p>
    </div>
    <div class="card">${rows}</div>
    <div class="card">
      <h3>FAME</h3>
      <div class="stat"><span>LIFETIME CROWD HYPE</span><b>${Math.round(profile.fame).toLocaleString('en-US')}</b></div>
      <div class="stat"><span>FINES PAID</span><b class="bad">${fmtMoney(profile.stats.finesPaid)}</b></div>
      <div class="stat"><span>FOULS THAT PASSED AS RACING</span><b class="good">${profile.stats.cleanFouls}</b></div>
    </div>
    <button class="btn primary" data-act="race">RACE FOR POSITIONS</button>
  `, {
    back: () => emit('nav', { to: 'title' }),
    race: () => emit('nav', { to: 'quick' }),
  }, { key: 'ladder', head: head('WORLD LADDER'), backdrop: true });
}

// ═══════════════════════════════ TITLES ═══════════════════════════════
export function renderTitles() {
  const cards = TITLES.map((t) => {
    const open = titleUnlocked(t);
    const st = titleState(t.id);
    const live = st && st.live;
    const won = st && st.won;
    let line;
    if (!open) line = `<div class="lock-note">🔒 ${esc(titleLockText(t))}</div>`;
    else if (live) line = `<div class="pick-desc" style="color:var(--warn)">▶ ${esc(roundName(t, st.round))} — CONTINUE</div>`;
    else if (won) line = `<div class="pick-desc" style="color:var(--good)">🏆 HELD · ${st.titles} TITLE${st.titles > 1 ? 'S' : ''} — ENTER AGAIN</div>`;
    else if (st) line = `<div class="pick-desc" style="color:var(--hot)">✗ KNOCKED OUT — ENTER AGAIN FOR A NEW DRAW</div>`;
    else line = `<div class="pick-desc" style="color:var(--warn)">ENTER · ${t.size} SEEDS · ${roundCount(t)} ROUNDS</div>`;

    return `
      <button class="pick ${open ? '' : 'locked'} ${won ? 'done' : ''}" data-act="${open ? 'open' : 'why'}" data-id="${t.id}">
        <div class="pick-grade">${fmtMoney(t.purse)}</div>
        <div class="pick-name">${t.icon} ${esc(t.name)}</div>
        <div class="pick-sub">${t.size} SEEDS · ${roundCount(t)} ROUNDS · FIELD OF ${t.field}</div>
        <div class="pick-desc">${esc(t.blurb)}</div>
        ${line}
      </button>`;
  }).join('');

  paint(`
    <div class="card">
      <p style="color:#b6c0ca;font-weight:500;font-size:14px;margin:0">
        A title is a knockout tree. Each round puts one named rival in the field with you, and the only thing
        that counts is finishing ahead of <i>them</i>. Lose once and you are out until you enter again — which
        redraws the whole bracket.</p>
    </div>
    <div class="grid two">${cards}</div>
  `, {
    back: () => emit('nav', { to: 'title' }),
    open: (d) => renderBracket(d.id),
    why: (d) => {
      const t = titleById(d.id);
      popup(`${t.icon} ${t.name}`, `<p>${esc(t.blurb)}</p><p style="color:var(--warn)">🔒 ${esc(titleLockText(t))}</p>`,
        [{ label: 'CLOSE', primary: true, act: () => closePopup() }]);
    },
  }, { key: 'titles', head: head('TITLES'), backdrop: true });
}

export function renderBracket(id) {
  const t = titleById(id);
  const st = titleState(id);
  const cols = st ? bracketFor(id) : [];
  const pair = st && st.live ? currentPairing(id) : null;

  const tree = cols.map((c) => `
    <div class="bracket-round">
      <h4>${esc(c.name)}</h4>
      ${c.pairs.map(([a, b]) => [a, b].filter(Boolean).map((s) => `
        <div class="seed ${s.me ? 'me' : ''} ${s.out && s.outRound < c.round ? 'out' : ''} ${s.out && s.outRound === c.round ? 'out' : ''}">
          <span>${esc(s.name)}</span><b>${s.me ? 'YOU' : Math.round(s.strength * 99)}</b>
        </div>`).join('')).join('<div style="height:6px"></div>')}
    </div>`).join('');

  const logRows = st && st.log.length
    ? `<div class="card"><h3>THE RUN</h3>${st.log.map((l) => `<div class="stat"><span>${esc(l)}</span><b></b></div>`).join('')}</div>`
    : '';

  paint(`
    <div class="card">
      <h2>${t.icon} ${esc(t.name)}</h2>
      <p style="color:#b6c0ca;font-weight:500;font-size:14px;margin:6px 0 0">${esc(t.blurb)}</p>
      <div class="stat" style="margin-top:8px"><span>PRIZE</span><b>${esc(t.prize)}</b></div>
      ${st ? `<div class="stat"><span>ENTRIES</span><b>${st.attempts}</b></div>` : ''}
      ${st && st.titles ? `<div class="stat"><span>TITLES HELD</span><b class="good">${st.titles}</b></div>` : ''}
    </div>
    ${st ? `<div class="card" style="padding-bottom:4px"><div class="bracket">${tree}</div></div>` : ''}
    ${pair && pair.them ? `
      <button class="btn primary" data-act="race">
        RACE ${esc(roundName(t, st.round))}
        <small>VS ${esc(pair.them.name)} · ${esc(pair.them.team)}</small>
      </button>` : `
      <button class="btn primary" data-act="enter">
        ${st && st.attempts ? 'ENTER AGAIN' : 'ENTER THE BRACKET'}
        <small>${st && st.attempts ? 'A COMPLETELY NEW DRAW' : `${t.size} SEEDS · ${roundCount(t)} ROUNDS`}</small>
      </button>`}
    ${logRows}
  `, {
    back: () => renderTitles(),
    enter: () => { enterTitle(id); renderBracket(id); },
    race: () => emit('title:race', { id }),
  }, { key: 'bracket:' + id, head: head(t.name), backdrop: true });
}

// ═══════════════════════════════ CAREER ═══════════════════════════════
export function renderCareer(tab) {
  const t = tab || currentTab.career;
  currentTab.career = t;
  const tabs = [['trophies', '🏆 CABINET'], ['team', '🏭 THE TEAM'], ['memories', '🎬 MEMORIES'], ['numbers', '📊 NUMBERS']]
    .map(([id, label]) => `<button class="tab ${id === t ? 'on' : ''}" data-act="tab" data-id="${id}">${label}</button>`).join('');

  let body = '', acts = {};
  if (t === 'team') { body = teamPanel(); acts = teamActions(); }
  else if (t === 'memories') { body = memoriesPanel(); acts = memoryActions(); }
  else if (t === 'numbers') { body = numbersPanel(); acts = numbersActions(); }
  else { body = trophyPanel(); acts = { trophy: (d) => showTrophy(d.id) }; }

  paint(`
    ${t === 'trophies' ? `<div class="room" id="trophy-room"><div class="room-cap">TAP A TROPHY FOR ITS HISTORY</div><div class="room-tap" data-act="tapTrophy"></div></div>` : ''}
    <div class="tabs">${tabs}</div>
    ${body}
  `, Object.assign({
    back: () => emit('nav', { to: 'title' }),
    tab: (d) => renderCareer(d.id),
  }, acts), { key: 'career:' + t, head: head('CAREER') });

  if (t === 'trophies') {
    mountRoom('trophy-room', 'trophy');
    const tap = menu().querySelector('.room-tap');
    if (tap) {
      tap.addEventListener('click', (e) => {
        import('./rooms.js').then((m) => {
          const id = m.trophyAt(e.clientX, e.clientY);
          if (id) showTrophy(id);
        });
      });
    }
  }
}

function trophyPanel() {
  const won = earnedTrophies();
  const rows = TROPHIES.map((tr) => {
    const has = won.includes(tr.id);
    const times = tr.key ? winsAt(tr.key) : 0;
    return `
      <button class="item ${has ? 'on' : 'locked'}" data-act="trophy" data-id="${tr.id}">
        <span class="ic">${has ? '🏆' : '▫️'}</span>
        <span class="nm">${esc(tr.name)}
          <small>${has ? esc(tr.blurb) : 'NOT YET'}${times > 1 ? ` · WON ${times}×` : ''}</small></span>
      </button>`;
  }).join('');
  return `
    <div class="card">
      <div class="stat"><span>ON THE SHELF</span><b class="good">${won.length} / ${TROPHIES.length}</b></div>
    </div>
    <div class="card">${rows}</div>`;
}

function showTrophy(id) {
  const tr = TROPHY_BY_ID[id];
  if (!tr) return;
  const has = earnedTrophies().includes(id);
  const times = tr.key ? winsAt(tr.key) : 0;
  const first = tr.key ? firstWonAt(tr.key) : 0;
  popup(`${has ? '🏆' : '🔒'} ${tr.name}`, `
    <p>${esc(tr.blurb)}</p>
    ${has ? `
      ${times ? `<div class="stat"><span>TIMES WON</span><b class="good">${times}</b></div>` : ''}
      ${first ? `<div class="stat"><span>FIRST WON</span><b>${new Date(first).toLocaleDateString()}</b></div>` : ''}`
      : '<p style="color:var(--warn)">Still an empty space on the shelf.</p>'}
  `, [{ label: 'CLOSE', primary: true, act: () => closePopup() }]);
}

function teamPanel() {
  const cur = team();
  const next = nextTeam();
  const rows = TEAM_LEVELS.map((lv) => `
    <div class="item ${lv.n === cur.n ? 'on' : lv.n < cur.n ? '' : 'locked'}">
      <span class="ic">${lv.icon}</span>
      <span class="nm">${esc(lv.name)}
        <small>${lv.n <= cur.n ? 'BUILT' : fmtMoney(lv.cost)} · PRIZES ${Math.round((lv.prize - 1) * 100)}% · REPAIRS ${Math.round((1 - lv.repair) * 100)}% CHEAPER</small>
        <small style="color:#b6c0ca;letter-spacing:0">${esc(lv.blurb)}</small></span>
      ${lv.n === cur.n ? '<span class="tagline-src" style="color:var(--brand)">CURRENT</span>' : ''}
    </div>`).join('');

  return `
    <div class="card">
      <h3>${cur.icon} ${esc(cur.name)}</h3>
      <p style="color:#b6c0ca;font-weight:500;font-size:14px;margin:6px 0 10px">${esc(cur.blurb)}</p>
      <div class="stat"><span>PRIZE MONEY</span><b class="good">+${Math.round((cur.prize - 1) * 100)}%</b></div>
      <div class="stat"><span>REPAIR BILLS</span><b class="good">-${Math.round((1 - cur.repair) * 100)}%</b></div>
      <div class="stat"><span>CRATE LUCK</span><b>+${Math.round(cur.crateLuck * 100)}%</b></div>
      <p style="color:var(--dim);font-size:12px;font-weight:500;margin:8px 0 0">
        A bigger outfit also gets your licence into circuits the small teams never see.</p>
    </div>
    ${next ? `<button class="btn ${profile.money >= next.cost ? 'primary' : ''}" data-act="upgrade">
        BUILD THE ${esc(next.name)}
        <small>${fmtMoney(next.cost)}${profile.money < next.cost ? ` — ${fmtMoney(next.cost - profile.money)} SHORT` : ''}</small>
      </button>` : '<div class="card"><h3 style="color:var(--good)">A WORKS TEAM. THERE IS NOTHING BIGGER.</h3></div>'}
    <div class="card">${rows}</div>`;
}

function teamActions() {
  return {
    upgrade: () => {
      const next = nextTeam();
      if (!next) return;
      if (profile.money < next.cost) { toast3(`THAT IS ${fmtMoney(next.cost - profile.money)} MORE THAN YOU HAVE`); return; }
      popup(`BUILD THE ${next.name}?`, `
        <p>${esc(next.blurb)}</p>
        <p><span class="price">${fmtMoney(next.cost)}</span> — leaving you ${fmtMoney(profile.money - next.cost)}.</p>
        <p style="color:var(--dim)">Bigger prizes, cheaper repairs, better crates, and circuits your licence does not currently cover.</p>
      `, [
        { label: 'NOT YET', act: () => closePopup() },
        { label: 'BUILD IT', primary: true, act: () => { buyTeamLevel(); saveProfile(true); closePopup(); renderCareer('team'); } },
      ]);
    },
  };
}

function memoriesPanel() {
  const list = profile.memories || [];
  if (!list.length) {
    return `<div class="card">
      <h3>NOTHING SAVED YET</h3>
      <p style="color:#b6c0ca;font-weight:500;font-size:14px;margin-top:6px">
        When the highlights play after a race, hit <b>★ KEEP</b> on anything worth watching again. It lives here.</p>
    </div>`;
  }
  return `<div class="card">${list.map((m, i) => `
    <div class="item">
      <span class="ic">🎬</span>
      <span class="nm">${esc(m.label || m.kind)}
        <small>${esc(m.kind)} · ${esc(m.where || '')} · ${new Date(m.at).toLocaleDateString()}</small></span>
      <div class="buyrow" style="flex:0 0 auto;margin:0">
        <button class="btn-mini on" data-act="play" data-i="${i}">▶ WATCH</button>
        <button class="btn-mini" data-act="del" data-i="${i}">✕</button>
      </div>
    </div>`).join('')}</div>`;
}

function memoryActions() {
  return {
    play: (d) => emit('memory:play', { index: +d.i }),
    del: (d) => {
      profile.memories.splice(+d.i, 1);
      saveProfile(true);
      renderCareer('memories');
    },
  };
}

function numbersPanel() {
  const s = profile.stats;
  const row = (k, v, cls) => `<div class="stat"><span>${k}</span><b class="${cls || ''}">${v}</b></div>`;
  return `
    <div class="grid two">
      <div class="card">
        <h3>RACING</h3>
        ${row('RACES', s.races)}
        ${row('WINS', s.wins, 'good')}
        ${row('PODIUMS', s.podiums)}
        ${row('DID NOT FINISH', s.dnf, 'bad')}
        ${row('LAPS COMPLETED', s.laps)}
        ${row('BIGGEST AIR', (s.bestAir || 0).toFixed(1) + 'm')}
        ${row('TIME SIDEWAYS', Math.round(s.driftTime || 0) + 's')}
      </div>
      <div class="card">
        <h3>THE OTHER BUSINESS</h3>
        ${row('RIVALS WRECKED', s.wrecksCaused, 'good')}
        ${row('PARTS KNOCKED OFF', s.partsOff)}
        ${row('FOULS COMMITTED', s.fouls)}
        ${row('PASSED AS RACING INCIDENTS', s.cleanFouls, 'good')}
        ${row('INVESTIGATIONS', s.investigations, 'bad')}
        ${row('FINES PAID', fmtMoney(s.finesPaid), 'bad')}
        ${row('EARNED', fmtMoney(s.moneyEarned), 'good')}
      </div>
    </div>
    <div class="card">
      <h3>COLLECTION</h3>
      ${row('CRATES OPENED', s.chestsOpened)}
      ${row('PARTS OWNED', `${profile.garage.parts.length} / ${PARTS.length}`)}
      ${row('TRICKS UNLOCKED', `${profile.garage.skills.length} / ${SKILLS.length}`)}
      ${row('CARS OWNED', `${ownedCars().length} / ${CARS.length}`)}
      ${row('CIRCUITS OPEN', `${TRACK_DEFS.filter((d) => trackUnlocked(d.id)).length} / ${TRACK_DEFS.length}`)}
      ${row('SEASON PROGRESS', `${storyCleared()} / ${storyLength()}`)}
    </div>
    <button class="btn danger" data-act="wipe">DELETE CAREER</button>`;
}

function numbersActions() {
  return {
    wipe: () => popup('DELETE CAREER?', '<p>Every part, every trick, every car, a hundred levels of progress and your world ranking. There is no undo.</p>', [
      { label: 'KEEP IT', act: () => closePopup() },
      {
        label: 'DELETE', danger: true, act: () => {
          try { localStorage.removeItem('foulplay_save_v1'); } catch (e) { /* private mode */ }
          location.reload();
        },
      },
    ]),
  };
}

// Kept as a name so anything still routing to 'stats' lands somewhere sane.
export const renderStats = () => renderCareer('numbers');

// ═══════════════════════════════ SETTINGS ═══════════════════════════════
export function renderSettings() {
  const s = profile.settings;
  const seg = (act, val, cur, label) => `<button class="btn-mini ${val === cur ? 'on' : ''}" data-act="${act}" data-v="${val}">${label}</button>`;
  paint(`
    <div class="card">
      <h3>STEERING</h3>
      <div class="btn-row" style="margin:8px 0">
        ${seg('steer', 'drag', s.steer, 'DRAG')}
        ${seg('steer', 'tilt', s.steer, 'TILT')}
        ${seg('steer', 'buttons', s.steer, 'BUTTONS')}
      </div>
      <p style="color:var(--dim);font-size:12px;font-weight:500">
        DRAG: hold anywhere on the left of the screen and slide. Pull down to brake and drift.<br>
        TILT: lean the phone. BUTTONS: on-screen arrows. Keyboard always works too.</p>
      ${s.steer === 'tilt' ? `
        <div class="stat" style="margin-top:8px"><span>TILT SENSITIVITY</span><b>${s.tiltSens.toFixed(1)}×</b></div>
        <input type="range" min="0.4" max="2.2" step="0.1" value="${s.tiltSens}" data-act="tiltsens" id="tiltsens" />
        <button class="btn-mini" data-act="recentre">RECENTRE TILT</button>` : ''}
    </div>
    <div class="card">
      <h3>ASSISTS</h3>
      <button class="item ${s.assist ? 'on' : ''}" data-act="toggle" data-k="assist">
        <span class="ic">🧭</span><span class="nm">STRAIGHTENING ASSIST<small>Stronger help getting the car pointed forward after a knock</small></span></button>
      <button class="item ${s.highlights ? 'on' : ''}" data-act="toggle" data-k="highlights">
        <span class="ic">🎬</span><span class="nm">HIGHLIGHTS REEL<small>Replay the best moments after every race</small></span></button>
      <button class="item ${s.camShake ? 'on' : ''}" data-act="toggle" data-k="camShake">
        <span class="ic">📳</span><span class="nm">CAMERA SHAKE</span></button>
      <button class="item ${s.haptics ? 'on' : ''}" data-act="toggle" data-k="haptics">
        <span class="ic">📱</span><span class="nm">VIBRATION<small>Small buzz off the barriers, a proper one when somebody hits you</small></span></button>
      <button class="item ${s.attract !== false ? 'on' : ''}" data-act="toggle" data-k="attract">
        <span class="ic">📺</span><span class="nm">LIVE MENU BACKDROP<small>Run a race behind the menus. Turn it off if the phone struggles</small></span></button>
    </div>
    <div class="card">
      <h3>SOUND</h3>
      <button class="item ${s.sfx ? 'on' : ''}" data-act="toggle" data-k="sfx"><span class="ic">🔊</span><span class="nm">EFFECTS</span></button>
      <button class="item ${s.music ? 'on' : ''}" data-act="toggle" data-k="music"><span class="ic">🎵</span><span class="nm">MUSIC</span></button>
    </div>
    <div class="card">
      <h3>DISPLAY</h3>
      <div class="btn-row" style="margin:8px 0">
        ${seg('quality', 'auto', s.quality, 'AUTO')}
        ${seg('quality', 'high', s.quality, 'HIGH')}
        ${seg('quality', 'low', s.quality, 'LOW')}
      </div>
      <div class="btn-row">
        ${seg('unit', 'kmh', s.speedUnit, 'KM/H')}
        ${seg('unit', 'mph', s.speedUnit, 'MPH')}
      </div>
      <p style="color:var(--dim);font-size:12px;font-weight:500;margin-top:8px">Quality changes apply on the next race.</p>
    </div>
  `, {
    back: () => emit('nav', { to: 'title' }),
    steer: (d) => {
      profile.settings.steer = d.v;
      saveProfile();
      if (d.v === 'tilt') import('./input.js').then((m) => m.enableTilt());
      const showArrows = d.v === 'buttons';
      ['pad-left', 'pad-right', 'pad-brake'].forEach((id) => $(id) && $(id).classList.toggle('hidden', !showArrows));
      renderSettings();
    },
    quality: (d) => { profile.settings.quality = d.v; saveProfile(); renderSettings(); },
    unit: (d) => { profile.settings.speedUnit = d.v; saveProfile(); renderSettings(); },
    toggle: (d) => { profile.settings[d.k] = !profile.settings[d.k]; saveProfile(); renderSettings(); },
    recentre: () => import('./input.js').then((m) => m.recentreTilt()),
    tiltsens: () => { },
  }, { key: 'settings', head: head('SETTINGS') });
  const slider = $('tiltsens');
  if (slider) {
    slider.addEventListener('input', () => {
      profile.settings.tiltSens = parseFloat(slider.value);
      saveProfile();
    });
  }
}

// ═══════════════════════════════ PAUSE ═══════════════════════════════
export function renderPause() {
  const ev = state.event || {};
  paint(`
    <div style="height:6vh"></div>
    <h1 style="text-align:center">PAUSED</h1>
    <p style="text-align:center;color:var(--dim);letter-spacing:.16em;margin-bottom:3vh">
      ${esc(ev.title || '')} · ${esc(ev.subtitle || '')}</p>
    <div class="card">
      <div class="stat"><span>POSITION</span><b>${state.player ? state.player.position : '-'} / ${state.cars.length}</b></div>
      <div class="stat"><span>LAP</span><b>${state.player ? Math.min(state.player.lap + 1, state.laps) : 1} / ${state.laps}</b></div>
      <div class="stat"><span>SUSPICION</span><b class="${state.suspicion > 70 ? 'bad' : ''}">${Math.round(state.suspicion)}</b></div>
      <div class="stat"><span>CROWD</span><b>${Math.round(state.hype)}</b></div>
      ${ev.objective ? `<div class="stat"><span>OBJECTIVE</span><b>${esc(ev.objective.label)}</b></div>` : ''}
    </div>
    <button class="btn primary" data-act="resume">RESUME</button>
    <button class="btn" data-act="restart">RESTART RACE</button>
    <button class="btn ghost" data-act="settings">SETTINGS</button>
    <button class="btn danger" data-act="quit">RETIRE FROM THE RACE</button>
  `, {
    resume: () => import('./flow.js').then((m) => m.togglePause()),
    restart: () => import('./flow.js').then((m) => m.restartRace()),
    settings: () => renderSettings(),
    quit: () => import('./flow.js').then((m) => m.quitRace()),
  }, { key: 'pause' });
}

// ═══════════════════════════════ REPLAY OVERLAY ═══════════════════════════════
let replayBox = null;
export function showReplayOverlay(show) {
  if (!replayBox) {
    const btn = 'pointer-events:auto;padding:8px 14px;border:1px solid var(--line);border-radius:20px;'
      + 'background:rgba(10,14,20,.78);font-size:12px;letter-spacing:.14em;min-height:40px';
    replayBox = document.createElement('div');
    replayBox.id = 'replay-overlay';
    replayBox.style.cssText = `position:fixed;inset:0;z-index:7;pointer-events:none;display:none;`;
    replayBox.innerHTML = `
      <div style="position:absolute;left:0;right:0;top:0;height:11vh;background:#05070a"></div>
      <div style="position:absolute;left:0;right:0;bottom:0;height:11vh;background:#05070a"></div>
      <div id="replay-tag" style="position:absolute;left:4vw;bottom:13vh;font-size:clamp(15px,3vmin,32px);font-weight:800;letter-spacing:.06em;text-shadow:0 3px 12px #000"></div>
      <div id="replay-sub" style="position:absolute;left:4vw;bottom:calc(13vh + clamp(20px,4vmin,42px));font-size:clamp(9px,1.4vmin,13px);letter-spacing:.28em;color:var(--brand)"></div>
      <div style="position:absolute;right:4vw;top:13vh;font-size:clamp(10px,1.5vmin,14px);letter-spacing:.24em;color:#ff5a5a">● REPLAY</div>
      <div style="position:absolute;right:4vw;bottom:13vh;display:flex;gap:7px;align-items:center">
        <button id="replay-prev" style="${btn}">◀</button>
        <button id="replay-keep" style="${btn}">★ KEEP</button>
        <button id="replay-next" style="${btn}">▶</button>
        <button id="replay-skip" style="${btn}">SKIP ▸</button>
      </div>`;
    document.body.appendChild(replayBox);
    const hit = (id, fn) => replayBox.querySelector(id).addEventListener('click', (e) => { e.stopPropagation(); sfx('ui'); fn(); });
    hit('#replay-skip', () => emit('replay:skip'));
    hit('#replay-prev', () => emit('replay:step', { dir: -1 }));
    hit('#replay-next', () => emit('replay:step', { dir: 1 }));
    hit('#replay-keep', () => emit('replay:keep'));

    on('replay:clip', ({ clip, index, total, canSave, saved }) => {
      const tag = $('replay-tag'), sub = $('replay-sub');
      if (tag) tag.textContent = clip.label || clip.kind;
      if (sub) sub.textContent = `${clip.kind} · ${index + 1}/${total}`;
      const keep = $('replay-keep');
      if (keep) {
        keep.textContent = saved ? '★ KEPT' : '★ KEEP';
        keep.style.opacity = saved ? '0.5' : '1';
        keep.style.borderColor = saved ? 'var(--good)' : 'var(--line)';
        keep.style.display = (canSave || saved) ? '' : 'none';
      }
      const prev = $('replay-prev'), next = $('replay-next');
      if (prev) prev.style.opacity = index > 0 ? '1' : '0.35';
      if (next) next.style.opacity = index < total - 1 ? '1' : '0.35';
    });
  }
  replayBox.style.display = show ? 'block' : 'none';
}

// ═══════════════════════════════ POPUP ═══════════════════════════════
export function popup(title, bodyHtml, buttons) {
  const p = $('popup');
  $('popup-title').textContent = title;
  $('popup-body').innerHTML = bodyHtml;
  const row = $('popup-actions');
  row.innerHTML = '';
  for (const b of buttons) {
    const btn = document.createElement('button');
    btn.className = 'btn' + (b.primary ? ' primary' : b.danger ? ' danger' : ' ghost');
    btn.textContent = b.label;
    btn.addEventListener('click', () => { sfx('ui'); b.act(); });
    row.appendChild(btn);
  }
  p.classList.remove('hidden');
}

export function closePopup() { $('popup').classList.add('hidden'); }

function toast3(msg) {
  popup('NOT SO FAST', `<p>${esc(msg)}</p>`, [{ label: 'OK', primary: true, act: () => closePopup() }]);
}

export { toast3 as notify };
