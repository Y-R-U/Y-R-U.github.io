// MANAGER: five small requests, none of them blocking — every one has a
// working stand-in in this file today.
//
//   1. `updateMenus(dt)` and `updateHouse(dt)` are exported but nothing calls
//      them; main.js's loop only drives updateGame(). Meanwhile the event
//      countdowns and the home screen's accrual run off a 1s setInterval that
//      is started and stopped with the screen. A frame-loop call would let both
//      drop their timers.
//   2. There is no `pauseRun()` in game.js, so the HUD's pause button flips
//      `state.running` directly (hud.js, setPaused). That is the correct
//      semantic — updateGame() already treats it as "advance the world" — but
//      it breaks the "only game.js writes state" rule and should become an API.
//   3. `run:end` does not say whether the run was an autoplay backdrop. This
//      file reads `run.autoplay` off the game module instead, which works only
//      because endRun() leaves the flag set until the next startRun(). A
//      `{ autoplay }` field in the payload would make that safe by contract.
//   4. save.js advances `p.level` on a clear but never advances `p.chapter`.
//      advanceChapter() below does it. It belongs in save.js next to
//      clearLevel(), because chapter 2 completes on a debt payment rather than
//      on a level clear and that logic should not live in the UI.
//   5. `levels.js:missionSpec` stamps missions with `chapter: 5`, so a mission
//      win runs `save.js:clearLevel(5, rank)` and every later run of that same
//      rank is then paid at `ECON.replayFactor` (0.45). That contradicts
//      missions being the repeatable grind — either missions want `chapter: 0`
//      (which makes game.js skip clearLevel entirely) or payout() wants to
//      exempt `mode !== 'story'`. I have not touched either file; the UI runs
//      the defs levels.js hands it.
//
// ---------------------------------------------------------------------------
//
// Screen routing and the whole meta-game shell. Everything the player does
// outside a run enters through here.
//
// The main screen is not a menu over a still image: a real level is running
// behind it under the AI thumb, using the same systems the player will use in
// three seconds. That is why `.main-root` is pointer-events:none with only its
// buttons re-enabled — the 3D scene stays draggable through the gaps, and the
// backdrop reads as the game rather than as a video.
//
// store.js and house.js never import this file. They emit `ui:nav` and
// `ui:popup` and this module decides what those mean, which keeps the import
// graph one-way and stops a circular import between four files that all want
// each other's popups.

import { CHAPTERS, chapterOf, levelCount, lastChapter, reqPowerFor, gateMessage, chapterProgress, impliedUpgrades } from './chapters.js';
import {
  levelSpec, buildLevel,
  MISSIONS, buildMission, missionReqPower, missionReward, missionRankFor, MISSION_RANK_MAX,
  activeEvents, eventWindow, buildEvent,
} from './levels.js';
import { runBeats } from './story.js';
import { startRun, run } from './game.js';
import { P, save, playerPower, isUnlocked, unlock, levelKey, addCash, storySeen } from './save.js';
import { on, emit } from './bus.js';
import { $, el, fmt, fmtMoney, fmtTime, clamp } from './utils.js';

// fmt()'s "$1.2K" is right on a moving sign and wrong on a payslip: the outro is
// the one screen where the player is comparing this run against the last one.
const exact = (n) => '$' + Math.round(n || 0).toLocaleString('en-US');
import { showStore, hideStore, flashUpgrade } from './store.js';
import { showHouse, hideHouse, houseIncomeRate } from './house.js';
import { showHud } from './hud.js';

// A screenshot hook, and a genuinely useful one: `?screen=store` boots straight
// into a screen without eleven taps, and the harness needs it because a headless
// page cannot tap anything. Kept in the shipped build for the same reason
// `?level=` is.
const Q = new URLSearchParams(location.search);
const SCREEN_ARG = Q.get('screen') || '';
// `?give=50000` funds the wallet so a store or home screenshot shows the
// affordable state rather than six greyed-out cards. Dev only in practice, but
// harmless in the wild: it is one-shot per page load and buys nothing.
const GIVE_ARG = parseInt(Q.get('give') || '0', 10) || 0;
// `?debt=0` jumps past chapter 2 so the home screen's *build* half can be
// screenshotted without paying twelve thousand dollars first.
const DEBT_ARG = Q.get('debt');
// `?pow=420` gives the player the upgrade set chapters.js says a player at that
// power would own — the honest version of a cheat, and the only way to review a
// late-game screen without playing to it.
const POW_ARG = parseInt(Q.get('pow') || '0', 10) || 0;

const RAIL = [
  { id: 'store',  icon: '🎖', label: 'STORE',  side: 'l', nav: 'store',
    why: 'The armoury opens after your first level. Clear one and come back with something to spend.' },
  { id: 'story',  icon: '📖', label: 'STORY',  side: 'l', nav: 'story', always: true },
  { id: 'events', icon: '⏱', label: 'EVENTS', side: 'r', nav: 'events',
    why: 'Missions and timed events open in chapter 2, once you have reached the front gate.' },
  { id: 'home',   icon: '🏠', label: 'HOME',   side: 'r', nav: 'home',
    why: 'You have to get there first. HOME opens the moment chapter 1 ends.' },
];

// levels.js names its modifiers in code case. Nobody reads "doubleCash" on a
// card; these are the same things said out loud, with a camelCase fallback so a
// new modifier still renders as words rather than as an identifier.
const MOD_LABEL = {
  noGrow: 'NO GROWING', doubleCash: 'DOUBLE CASH', swarm: 'SWARM',
  brittle: 'BRITTLE GATES', hardened: 'HARDENED WALLS',
};
const modLabel = (m) => MOD_LABEL[m] || String(m).replace(/([a-z])([A-Z])/g, '$1 $2').toUpperCase();

const CHAPTER_BLURB = {
  road:     'Discharged into a country still at war, with four hundred kilometres of road between you and your own front gate.',
  debt:     'The house is still standing. It is also mortgaged to the roof. Nothing on that land is yours until the bank is paid.',
  contract: 'No uniform, no orders, no pension. Just work, and people who pay for it.',
  tide:     'You are not walking home any more. You are walking back.',
  endless:  'No orders left to follow. Missions and events, for as long as you want them.',
};


let screen = 'main';         // main | store | home | outro
let sheet = '';              // '' | levels | events | story
let M = null;                // main-screen refs
let outroEl = null, popupEl = null;
let backdropT = 0;           // setTimeout handle for the backdrop restart
let tickT = 0;               // 1s interval driving countdowns
let lastResult = null;
let selChapter = 1;          // which chapter the level sheet is showing
let nextMode = 'next';       // what the outro's big button does: next | shop
const defCache = new Map();

// --------------------------------------------------------------------------
// Boot
// --------------------------------------------------------------------------

export function initMenus() {
  if (GIVE_ARG) addCash(GIVE_ARG, 'dev');
  if (DEBT_ARG !== null) { P().home.debt = Math.max(0, parseInt(DEBT_ARG, 10) || 0); save(true); }
  if (POW_ARG) { P().upgrades = { ...impliedUpgrades(POW_ARG).up }; save(true); }
  buildMain();
  buildOutro();
  popupEl = $('#popup');
  popupEl.addEventListener('click', (e) => { if (e.target === popupEl) closePopup(); });

  on('ui:nav', ({ to }) => nav(to));
  on('ui:popup', (o) => showPopup(o));
  on('ui:pause', () => pausePopup());
  on('run:end', onRunEnd);
  on('level:cleared', () => { advanceChapter(); checkUnlocks(); });
  on('cash:change', () => paintChips());
  on('upgrade:bought', () => paintChips());
}

// --------------------------------------------------------------------------
// The main screen
// --------------------------------------------------------------------------

function buildMain() {
  const root = $('#main-screen');
  root.innerHTML = `
    <div class="main-root">
      <div class="top-chips">
        <div class="cash-chip big"><span>💰</span><b id="m-cash">0</b></div>
        <div class="power-chip"><span>⚡</span><b id="m-power">0</b></div>
      </div>

      <div class="wordmark"><span>HOME</span><i>BOUND</i></div>
      <div class="tagline" id="m-tag">THE LONG ROAD HOME</div>

      <div class="rail rail-l" id="rail-l"></div>
      <div class="rail rail-r" id="rail-r"></div>

      <div class="play-dock">
        <button class="play-btn" id="btn-play">
          <b>PLAY</b><i id="play-sub">CH.1 · LEVEL 1</i>
        </button>
        <button class="link-btn" id="btn-levels">CHOOSE LEVEL ▸</button>
      </div>
    </div>

    <div class="sheet" id="sheet-levels">
      <div class="sheet-card">
        <header class="sheet-top"><h2>CAMPAIGN</h2><button class="rnd-btn close" data-close>✕</button></header>
        <div class="chap-tabs" id="chap-tabs"></div>
        <div class="sheet-scroll" id="lv-grid"></div>
      </div>
    </div>

    <div class="sheet" id="sheet-events">
      <div class="sheet-card">
        <header class="sheet-top"><h2>CONTRACTS</h2><button class="rnd-btn close" data-close>✕</button></header>
        <div class="sheet-scroll" id="ev-body"></div>
      </div>
    </div>

    <div class="sheet" id="sheet-story">
      <div class="sheet-card">
        <header class="sheet-top"><h2>THE STORY</h2><button class="rnd-btn close" data-close>✕</button></header>
        <div class="sheet-scroll" id="st-body"></div>
      </div>
    </div>`;

  M = {
    root,
    cash: $('#m-cash', root), power: $('#m-power', root),
    tag: $('#m-tag', root), sub: $('#play-sub', root),
    railL: $('#rail-l', root), railR: $('#rail-r', root),
    tabs: $('#chap-tabs', root), grid: $('#lv-grid', root),
    ev: $('#ev-body', root), st: $('#st-body', root),
  };

  for (const r of RAIL) (r.side === 'l' ? M.railL : M.railR).appendChild(railBtn(r));

  $('#btn-play', root).addEventListener('click', () => playCurrent());
  $('#btn-levels', root).addEventListener('click', () => openSheet('levels'));
  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) closeSheet();
    // Tapping the dimmed area outside a sheet card closes it, which is the
    // gesture every phone user tries first.
    const s = e.target.closest('.sheet');
    if (s && !e.target.closest('.sheet-card')) closeSheet();
  });
}

function railBtn(r) {
  const b = el('button', 'rail-btn');
  b.dataset.id = r.id;
  b.innerHTML = `<span class="rb-icon">${r.icon}</span><i class="rb-lock">🔒</i><em>${r.label}</em>`;
  b.addEventListener('click', () => {
    if (!r.always && !isUnlocked(r.id)) {
      showPopup({ title: r.label + ' LOCKED', body: r.why, actions: [{ label: 'GOT IT', kind: 'primary' }] });
      return;
    }
    nav(r.nav);
  });
  return b;
}

export function showMain() {
  hideAll();
  screen = 'main';
  checkUnlocks();
  M.root.classList.remove('hidden');
  showHud(false);
  paintChips();
  paintRail();
  ensureBackdrop();
  startTicker();

  // Dev route: land on the requested screen but with the backdrop already
  // running, so a store screenshot still has a game behind it.
  if (SCREEN_ARG && !showMain._routed) {
    showMain._routed = true;
    if (SCREEN_ARG === 'outro') return showOutro(fakeResult());
    if (SCREEN_ARG === 'store') { unlock('store'); return nav('store'); }
    if (SCREEN_ARG === 'home') { unlock('home'); return nav('home'); }
    if (['levels', 'events', 'story'].includes(SCREEN_ARG)) {
      if (SCREEN_ARG === 'events') unlock('events');
      return openSheet(SCREEN_ARG);
    }
    // The power gate is a designed screen, so it gets a route of its own rather
    // than being something you can only see by failing to reach it.
    if (SCREEN_ARG === 'gate') { openSheet('levels'); return powerGate(240, playerPower()); }
  }
}

export function hideAll() {
  closeSheet();
  M?.root.classList.add('hidden');
  outroEl?.classList.add('hidden');
  hideStore();
  hideHouse();
  closePopup();
  stopTicker();
}

function nav(to) {
  if (to === 'main') return showMain();
  if (to === 'play') return playCurrent();
  if (to === 'store') { hideAll(); screen = 'store'; showStore(); return; }
  if (to === 'home')  { hideAll(); screen = 'home'; showHouse(); return; }
  if (to === 'levels' || to === 'events' || to === 'story') {
    if (screen !== 'main') showMain();
    return openSheet(to);
  }
}

function paintChips() {
  if (!M) return;
  M.cash.textContent = fmt(P().cash);
  M.power.textContent = fmt(playerPower());
  const p = P();
  const c = chapterOf(p.chapter);
  M.tag.textContent = c?.name || 'THE LONG ROAD HOME';
  M.sub.textContent = levelCount(p.chapter) > 0
    ? `CH.${p.chapter} · LEVEL ${p.level}`
    : (p.home.debt > 0 ? 'PAY THE MORTGAGE' : 'PICK A MISSION');
}

function paintRail() {
  if (!M) return;
  for (const r of RAIL) {
    const b = M.root.querySelector(`.rail-btn[data-id="${r.id}"]`);
    if (b) b.classList.toggle('locked', !r.always && !isUnlocked(r.id));
  }
}

// --------------------------------------------------------------------------
// Unlocks and chapter flow
// --------------------------------------------------------------------------

// See MANAGER note 4. Chapter 1 ends on a level count; chapter 2 ends when the
// mortgage does, which is why this cannot be a pure function of `p.level`.
function advanceChapter() {
  const p = P();
  let moved = false;
  for (let guard = 0; guard < 8; guard++) {
    const n = levelCount(p.chapter);
    const last = lastChapter();
    if (p.chapter >= last) break;
    if (n > 0 && p.level > n) { finishChapter(p.chapter); p.chapter++; p.level = 1; moved = true; continue; }
    if (n === 0 && p.home.debt <= 0 && p.home.owned) { finishChapter(p.chapter); p.chapter++; p.level = 1; moved = true; continue; }
    break;
  }
  if (moved) save(true);
  return moved;
}

// chapters.js declares what finishing each act opens. Honouring that table
// rather than a second list here means a pacing change in chapters.js does not
// need a matching edit in the UI.
function finishChapter(n) {
  for (const what of chapterOf(n).unlocks || []) unlock(what);
}

function checkUnlocks() {
  const p = P();
  advanceChapter();
  const chapter1Levels = levelCount(1) || 24;

  // The store has to arrive early — a power gate the player cannot answer is
  // just a wall — so one cleared level is enough.
  if (!isUnlocked('store') && (p.level > 1 || p.chapter > 1 || p.cleared[levelKey(1, 1)])) {
    unlock('store');
    toastUnlock('🎖', 'ARMOURY OPEN');
  }
  if (!isUnlocked('home') && (p.chapter > 1 || p.level > chapter1Levels)) {
    unlock('home');
    toastUnlock('🏠', 'YOU MADE IT HOME');
  }
  if (!isUnlocked('events') && p.chapter >= 2) {
    unlock('events');
    toastUnlock('⏱', 'MISSIONS OPEN');
  }
  paintRail();
}

function toastUnlock(icon, text) {
  emit('hud:toast', { icon, text });
  // The rail button has to be seen changing, or the unlock happened offscreen.
  setTimeout(() => {
    const b = M?.root.querySelector('.rail-btn.locked');
    if (b) { b.classList.remove('just'); void b.offsetWidth; b.classList.add('just'); }
  }, 60);
}

// --------------------------------------------------------------------------
// Playing
// --------------------------------------------------------------------------

// levelSpec() returns null for a chapter that has no levels of its own, so this
// has to be able to answer "there is nothing to play here" rather than throwing
// inside buildLevel. Cached because the level select asks for the same defs
// every time it opens and generation is not free.
function levelDef(ch, lv) {
  const k = `${ch}:${lv}`;
  if (!defCache.has(k)) {
    const spec = levelSpec(ch, lv);
    defCache.set(k, spec ? buildLevel(spec) : null);
  }
  return defCache.get(k);
}

function playCurrent() {
  const p = P();
  if (levelCount(p.chapter) <= 0) {
    // Chapter 2 has no levels — its content is the house. Send the player at
    // the thing that actually ends the chapter.
    return nav(p.home.debt > 0 ? 'home' : 'events');
  }
  playLevel(p.chapter, p.level);
}

function playLevel(ch, lv) {
  // The gate is checked against chapters.js rather than against a built level:
  // reqPowerFor() is a two-line curve, buildLevel() is a whole level, and the
  // level select asks this question for every chip it draws.
  const g = gateMessage(ch, lv, playerPower());
  if (g) return powerGate(g.need, g.have, g.short);
  const def = levelDef(ch, lv);
  if (!def) return;

  closeSheet();
  hideAll();
  showHud(true);
  startRun(def);
}

// Not an error state — a designed one. It says the number, the gap, and gives
// the player the one button that closes the gap.
function powerGate(need, have, short = Math.max(0, need - have)) {
  showPopup({
    title: 'NOT STRONG ENOUGH',
    html: `<p class="pg-line">This road needs <b class="pg-need">⚡${fmt(need)}</b>.</p>
           <p class="pg-line">You are at <b class="pg-have">⚡${fmt(have)}</b> — ${fmt(short)} short.</p>
           <p class="pg-note">Upgrade in the armoury. Every purchase raises your power —
           the levels open themselves.</p>`,
    actions: [
      { label: 'TO THE ARMOURY', kind: 'primary', nav: isUnlocked('store') ? 'store' : null },
      { label: 'NOT YET', kind: 'ghost' },
    ],
  });
}

// Missions and events come out of levels.js fully formed — reqPower, reward and
// difficulty already scaled by rank or by the current window. This just runs the
// def it is handed.
function playSide(def) {
  if (!def) return;
  const need = def.reqPower || 0;
  if (need > playerPower()) return powerGate(need, playerPower());
  closeSheet();
  hideAll();
  showHud(true);
  startRun(def);
}

// --------------------------------------------------------------------------
// The autoplay backdrop
// --------------------------------------------------------------------------

function ensureBackdrop() {
  clearTimeout(backdropT);
  if (run.active && !run.autoplay) return;      // a real run owns the scene
  const p = P();
  // Chapter 2 has no levels to show, and a chapter the player has not reached
  // would spoil it, so the backdrop runs the road they are on (or have run).
  let ch = levelCount(p.chapter) > 0 ? p.chapter : 1;
  const n = Math.max(1, levelCount(ch));
  const lv = clamp(p.chapter === ch ? p.level : Math.ceil(n / 2), 1, n);
  startRun(levelDef(ch, lv), { autoplay: true });
}

function onRunEnd(stats) {
  if (run.autoplay) {
    // Restart on a timer rather than inline: endRun() is emitted from inside
    // updateGame(), and rebuilding every system mid-frame is how a level ends
    // up half-torn-down for the rest of the tick.
    clearTimeout(backdropT);
    backdropT = setTimeout(() => { if (screen === 'main') ensureBackdrop(); }, 900);
    return;
  }
  lastResult = stats;
  advanceChapter();
  checkUnlocks();
  setTimeout(() => showOutro(stats), 700);
}

// --------------------------------------------------------------------------
// Outro
// --------------------------------------------------------------------------

function buildOutro() {
  outroEl = $('#outro');
  outroEl.innerHTML = `
    <div class="scr scr-outro">
      <div class="outro-card">
        <div class="ribbon" id="o-ribbon">LEVEL CLEAR</div>
        <div class="stars" id="o-stars"></div>
        <h2 id="o-name">LEVEL 1</h2>
        <div class="o-reward"><i>EARNED</i><b id="o-cash">$0</b></div>
        <ul class="o-breakdown" id="o-breakdown"></ul>
        <div class="stat-rows" id="o-stats"></div>
        <p class="o-note" id="o-note"></p>
        <div class="outro-actions">
          <button class="fat-btn small" data-o="retry">RETRY</button>
          <button class="fat-btn gold wide" id="o-next" data-o="next">NEXT</button>
          <button class="fat-btn small" data-o="home">HOME</button>
        </div>
      </div>
    </div>`;
  outroEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-o]');
    if (!b) return;
    const lv = lastResult?.level;
    if (b.dataset.o === 'home') return showMain();
    if (b.dataset.o === 'retry') {
      if (!lv) return showMain();
      // A mission has no chapter, so there is no level to look up — replay the
      // exact def that was just run.
      if (lv.chapter) return playLevel(lv.chapter, lv.level);
      hideAll(); showHud(true); startRun(lv); return;
    }
    // The big button is either "next level" or "go fix your power", and which
    // one it is was decided in showOutro(). Keeping that in a variable rather
    // than in the dataset means the selector that finds this button never moves.
    if (nextMode === 'shop') return isUnlocked('store') ? nav('store') : showMain();
    if (!lv?.chapter) return nav('events');
    const p = P();
    if (levelCount(p.chapter) <= 0) return nav(p.home.debt > 0 ? 'home' : 'events');
    playLevel(p.chapter, p.level);
  });
}

export function showOutro(result) {
  lastResult = result || lastResult || fakeResult();
  const r = lastResult;
  hideAll();
  showHud(false);
  screen = 'outro';
  outroEl.classList.remove('hidden');

  const win = !!r.win;
  const stars = clamp(r.stars ?? (win ? 1 : 0), 0, 3);
  $('#o-ribbon', outroEl).textContent = win ? 'LEVEL CLEAR' : 'SQUAD LOST';
  $('#o-ribbon', outroEl).className = 'ribbon ' + (win ? 'win' : 'lose');
  $('#o-name', outroEl).textContent = r.level?.name || 'THE ROAD';
  $('#o-cash', outroEl).textContent = exact(r.reward ?? 0);

  // Itemised, because a single total makes money you watched yourself pick up
  // look like it never arrived. `COLLECTED` is the line the player is checking.
  const bd = $('#o-breakdown', outroEl);
  if (bd) {
    bd.innerHTML = (r.breakdown || []).map((row) => `
      <li><span>${row.label}${row.note ? ` <em>${row.note}</em>` : ''}</span><b>${exact(row.value)}</b></li>
    `).join('');
    bd.classList.toggle('hidden', !(r.breakdown || []).length);
  }

  const st = $('#o-stars', outroEl);
  st.innerHTML = '';
  for (let i = 0; i < 3; i++) {
    const s = el('i', 'star' + (i < stars ? ' on' : ''), '★');
    s.style.animationDelay = (i * 0.14) + 's';
    st.appendChild(s);
  }

  $('#o-stats', outroEl).innerHTML = [
    ['PEAK SQUAD', fmt(r.peakTroops ?? 0)],
    ['KILLS', fmt(r.kills ?? 0)],
    ['GATES TAKEN', fmt(r.gatesTaken ?? 0)],
    ['BEST GATE', r.bestGate ? '+' + fmt(r.bestGate) : '—'],
    ['DISTANCE', Math.round(r.dist ?? 0) + ' m'],
  ].map(([k, v]) => `<div class="stat-row"><i>${k}</i><b>${v}</b></div>`).join('');

  // The note is where the outro earns its keep: it tells the player what to do
  // next rather than leaving them to guess at three identical buttons.
  const p = P();
  const hasNext = levelCount(p.chapter) > 0;
  const nextNeed = hasNext ? reqPowerFor(p.chapter, p.level) : 0;
  const gated = hasNext && nextNeed > playerPower();
  const note = $('#o-note', outroEl);
  const nextBtn = $('#o-next', outroEl);
  if (!win) {
    note.textContent = 'A lost run still pays a quarter. Spend it and come back heavier.';
    nextMode = 'shop';
  } else if (gated) {
    note.textContent = `The next road needs ⚡${fmt(nextNeed)}. You are at ⚡${fmt(playerPower())}.`;
    nextMode = 'shop';
  } else {
    note.textContent = '';
    nextMode = 'next';
  }
  nextBtn.textContent = nextMode === 'shop' ? 'ARMOURY' : 'NEXT';
}

function fakeResult() {
  return {
    win: true, stars: 3, peakTroops: 428, kills: 613, reward: 1240,
    breakdown: [
      { label: 'COLLECTED', note: 'gates', value: 340 },
      { label: 'SQUAD', note: '428 strong', value: 599 },
      { label: 'LEVEL CLEAR', note: '', value: 301 },
    ],
    gatesTaken: 22, bestGate: 96, dist: 640,
    level: { chapter: 1, level: 3, name: 'RIVER CROSSING' },
  };
}

// --------------------------------------------------------------------------
// Sheets: level select, missions/events, story
// --------------------------------------------------------------------------

function openSheet(which) {
  closeSheet();
  sheet = which;
  if (which === 'levels') paintLevels();
  if (which === 'events') paintEvents();
  if (which === 'story') paintStory();
  const n = $('#sheet-' + which, M.root);
  n.classList.add('open');
  startTicker();
}

function closeSheet() {
  if (!M) return;
  for (const s of M.root.querySelectorAll('.sheet.open')) s.classList.remove('open');
  sheet = '';
}

// --- level select ---------------------------------------------------------

function paintLevels() {
  const p = P();
  selChapter = clamp(selChapter || p.chapter, 1, CHAPTERS.length);
  if (selChapter > p.chapter) selChapter = p.chapter;

  M.tabs.innerHTML = '';
  for (const c of CHAPTERS) {
    const locked = c.n > p.chapter;
    const t = el('button', 'chap-tab' + (c.n === selChapter ? ' on' : '') + (locked ? ' locked' : ''));
    t.innerHTML = `<b>${c.n}</b><i>${c.name}</i>`;
    t.addEventListener('click', () => {
      if (locked) return showPopup({
        title: 'NOT YET', body: `Chapter ${c.n} — ${c.name} — opens when chapter ${c.n - 1} ends.`,
        actions: [{ label: 'OK', kind: 'primary' }],
      });
      selChapter = c.n; paintLevels();
    });
    M.tabs.appendChild(t);
  }

  const ch = selChapter;
  const n = levelCount(ch);
  M.grid.innerHTML = '';

  if (n <= 0) {
    M.grid.appendChild(el('div', 'sheet-empty',
      `<b>${chapterOf(ch).name}</b><p>This chapter is not a road. Clear the mortgage on the home screen to move on.</p>`));
    const b = el('button', 'fat-btn gold wide', 'GO HOME');
    b.addEventListener('click', () => nav('home'));
    M.grid.appendChild(b);
    return;
  }

  const grid = el('div', 'lv-grid');
  const power = playerPower();
  for (let lv = 1; lv <= n; lv++) {
    const rec = p.cleared[levelKey(ch, lv)];
    const reached = ch < p.chapter || lv <= p.level;
    const need = reqPowerFor(ch, lv);
    const weak = reached && need > power;

    const c = el('button', 'lv-chip');
    if (!reached) c.classList.add('locked');
    else if (rec) c.classList.add('done');
    else c.classList.add('next');
    if (weak && reached && !rec) c.classList.add('weak');

    const starsHtml = rec ? `<i class="lv-stars">${'★'.repeat(rec.stars)}${'☆'.repeat(3 - rec.stars)}</i>` : '';
    c.innerHTML = reached
      ? `<b>${lv}</b>${starsHtml}${weak ? `<em class="lv-req">⚡${fmt(need)}</em>` : ''}`
      : `<span class="lv-lock">🔒</span>`;

    c.addEventListener('click', () => {
      if (!reached) return showPopup({
        title: 'LOCKED', body: `Clear level ${Math.max(1, lv - 1)} first.`,
        actions: [{ label: 'OK', kind: 'primary' }],
      });
      playLevel(ch, lv);
    });
    grid.appendChild(c);
  }
  M.grid.appendChild(grid);

  const foot = el('div', 'lv-foot');
  foot.innerHTML = `<span>YOUR POWER</span><b>⚡${fmt(power)}</b>`;
  const sb = el('button', 'link-btn', 'UPGRADE ▸');
  sb.addEventListener('click', () => (isUnlocked('store') ? nav('store') : showPopup({
    title: 'STORE LOCKED', body: RAIL[0].why, actions: [{ label: 'OK', kind: 'primary' }],
  })));
  foot.appendChild(sb);
  M.grid.appendChild(foot);
}

// --- missions and events --------------------------------------------------

// Rank is the difficulty dial levels.js hands the player. It opens on the
// hardest rank they clear comfortably (missionRankFor applies its own 0.85
// margin) and they can push it up for more pay.
let missionRank = 0;

function paintEvents() {
  const power = playerPower();
  if (!missionRank) missionRank = missionRankFor(power);
  M.ev.innerHTML = '';

  const lead = el('div', 'sheet-lead');
  lead.innerHTML = `<p>Repeatable contracts and the two events currently running.
    Neither touches the campaign — no stars, no chapters, just cash.${
      houseIncomeRate() > 0 ? ` Your land adds <b>${fmtMoney(houseIncomeRate())}/hr</b> on top.` : ''}</p>`;
  M.ev.appendChild(lead);

  // ---- missions -----------------------------------------------------------
  M.ev.appendChild(el('h3', 'sheet-h3', 'MISSIONS'));

  const need = missionReqPower(missionRank);
  const rank = el('div', 'rank-row' + (need > power ? ' over' : ''));
  rank.innerHTML = `
    <button class="rnd-btn" data-rank="-1" aria-label="Lower rank">−</button>
    <div class="rank-mid">
      <i>RANK</i><b>${missionRank}</b>
      <em>needs ⚡${fmt(need)} · you have ⚡${fmt(power)}</em>
    </div>
    <button class="rnd-btn" data-rank="1" aria-label="Raise rank">+</button>`;
  for (const b of rank.querySelectorAll('[data-rank]')) {
    b.addEventListener('click', () => {
      missionRank = clamp(missionRank + Number(b.dataset.rank), 1, MISSION_RANK_MAX);
      paintEvents();
    });
  }
  M.ev.appendChild(rank);

  for (const m of MISSIONS) {
    const pay = missionReward(m.id, missionRank);
    const locked = need > power;
    const c = el('div', 'ev-card' + (locked ? ' shut' : ''));
    c.innerHTML = `
      <div class="ev-icon">${m.icon}</div>
      <div class="ev-mid">
        <b>${m.name}</b>
        <i>${m.desc}</i>
        <em class="ev-pay">${fmtMoney(pay)}${m.boss ? ' · BOSS' : ''}</em>
      </div>
      <button class="fat-btn small ${locked ? '' : 'gold'}">${locked ? '🔒' : 'RUN'}</button>`;
    c.querySelector('button').addEventListener('click', () =>
      (locked ? powerGate(need, power) : playSide(buildMission(m.id, missionRank))));
    M.ev.appendChild(c);
  }

  // ---- events -------------------------------------------------------------
  // One window covers both events, so the countdown is drawn once above them
  // rather than repeated on every card.
  const w = eventWindow();
  const head = el('h3', 'sheet-h3', 'EVENTS');
  M.ev.appendChild(head);
  const clock = el('div', 'ev-window');
  clock.innerHTML = `<span>THIS ROTATION ENDS IN</span><b class="ev-clock">${fmtTime((w.endsAt - Date.now()) / 1000)}</b>`;
  M.ev.appendChild(clock);

  for (const ev of activeEvents(Date.now(), power)) {
    const locked = ev.reqPower > power;
    const c = el('div', 'ev-card ev-timed' + (locked ? ' shut' : ' live'));
    const mods = (ev.mods || []).map((x) => `<span class="mod">${modLabel(x)}</span>`).join('');
    c.innerHTML = `
      <div class="ev-icon">${ev.icon}</div>
      <div class="ev-mid">
        <b>${ev.name}</b>
        <i>${mods}</i>
        <em class="ev-pay">${fmtMoney(ev.reward)} · needs ⚡${fmt(ev.reqPower)}</em>
      </div>
      <button class="fat-btn small ${locked ? '' : 'gold'}">${locked ? '🔒' : 'RUN'}</button>`;
    c.querySelector('button').addEventListener('click', () =>
      (locked ? powerGate(ev.reqPower, power) : playSide(buildEvent(ev.id, 0, power))));
    M.ev.appendChild(c);
  }
}

// Only the clock text is rewritten each second. Repainting the cards would blow
// away their listeners and fight the scroll position.
function tickEvents() {
  if (sheet !== 'events' || !M) return;
  const c = M.ev.querySelector('.ev-window .ev-clock');
  if (!c) return;
  const left = (eventWindow().endsAt - Date.now()) / 1000;
  if (left <= 0) { paintEvents(); return; }   // the rotation just turned over
  c.textContent = fmtTime(left);
}

// --- story ----------------------------------------------------------------

function paintStory() {
  const p = P();
  M.st.innerHTML = '';
  for (const c of CHAPTERS) {
    const reached = c.n <= p.chapter;
    const n = levelCount(c.n);
    const done = n > 0
      ? Object.keys(p.cleared).filter((k) => k.startsWith(`c${c.n}l`)).length
      : (p.home.debt <= 0 ? 1 : 0);
    const frac = n > 0 ? chapterProgress(c.n, done) : done;

    const card = el('div', 'st-card' + (reached ? '' : ' locked'));
    card.innerHTML = `
      <div class="st-num">${c.n}</div>
      <div class="st-mid">
        <b>${reached ? c.name : '???'}</b>
        <span class="st-sub">${reached ? (c.sub || '') : ''}</span>
        <p>${reached ? (CHAPTER_BLURB[c.id] || '') : 'Not yet.'}</p>
        <div class="st-bar"><i style="transform:scaleX(${frac.toFixed(3)})"></i></div>
        <em>${reached ? (n > 0 ? `${Math.min(done, n)} / ${n} LEVELS` : 'NO LEVELS — A STATE, NOT A ROAD') : '🔒 LOCKED'}</em>
      </div>`;

    // The log: lines the player has actually read, newest last. storySeen() is
    // the record, so this cannot show a beat that never fired.
    if (reached && n > 0) {
      const lines = [];
      for (let lv = 1; lv <= n && lines.length < 40; lv++) {
        for (const b of runBeats(c.n, lv)) if (storySeen(b.id)) lines.push(b);
      }
      if (lines.length) {
        const log = el('div', 'st-log');
        for (const b of lines.slice(-4)) {
          const row = el('div', 'st-line');
          row.innerHTML = `<i>${b.who || 'ME'}</i><p></p>`;
          row.querySelector('p').textContent = b.text;
          log.appendChild(row);
        }
        if (lines.length > 4) log.appendChild(el('span', 'st-more', `+${lines.length - 4} earlier`));
        $('.st-mid', card).appendChild(log);
      }
    }
    M.st.appendChild(card);
  }
}

// --------------------------------------------------------------------------
// Popups. Never alert() — it freezes the run behind the screen.
// --------------------------------------------------------------------------

export function showPopup({ title = '', body = '', html = '', actions = [] }) {
  const card = $('.popup-card', popupEl);
  $('#popup-title', popupEl).textContent = title;
  const b = $('#popup-body', popupEl);
  if (html) b.innerHTML = html;
  else { b.innerHTML = ''; for (const line of String(body).split('\n')) b.appendChild(el('p', null, '')).textContent = line; }

  const row = $('#popup-actions', popupEl);
  row.innerHTML = '';
  const list = actions.length ? actions : [{ label: 'OK', kind: 'primary' }];
  for (const a of list) {
    const btn = el('button', 'fat-btn ' + (a.kind === 'primary' ? 'gold' : a.kind === 'danger' ? 'red' : 'ghost'), a.label);
    btn.addEventListener('click', () => {
      closePopup();
      a.onClick?.();
      if (a.nav) nav(a.nav);
      if (a.upgrade) flashUpgrade(a.upgrade);
    });
    row.appendChild(btn);
  }
  popupEl.classList.remove('hidden');
  card.classList.remove('in'); void card.offsetWidth; card.classList.add('in');
}

export function closePopup() { popupEl?.classList.add('hidden'); }

function pausePopup() {
  showPopup({
    title: 'PAUSED',
    body: 'The road is still there when you get back.',
    actions: [
      { label: 'RESUME', kind: 'primary', onClick: () => emit('ui:resume', {}) },
      { label: 'GIVE UP', kind: 'danger', onClick: () => { emit('ui:resume', {}); showMain(); } },
    ],
  });
}

// --------------------------------------------------------------------------
// Ticking. See MANAGER note 1 — updateMenus() is the frame-loop version of the
// same work and both are safe to run.
// --------------------------------------------------------------------------

function startTicker() { if (!tickT) tickT = setInterval(tick, 1000); }
function stopTicker() { clearInterval(tickT); tickT = 0; }
function tick() { tickEvents(); if (screen === 'main') paintChips(); }

let acc = 0;
export function updateMenus(dt) {
  acc += dt || 0;
  if (acc < 1) return;
  acc = 0;
  tick();
}
