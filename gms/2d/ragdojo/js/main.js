// Boot, loop, screens, progression.

import {
  SHEET_W, SHEET_H, GROUND_Y, LEVELS, RANKS, TOTAL_LEVELS,
  playerRankAt, MOVES, moveStats, derive,
} from './config.js';
import { drawDesk, sheetShadow } from './paper.js';
import { buildArena } from './arena.js';
import { drawFighter, drawShadow } from './draw.js';
import { Match } from './match.js';
import { Input, isRotated, SPECIAL_KEYS } from './input.js';
import { drawHUD, drawNameTags, handText, FONT, FONT_B } from './ui.js';
import { load, save as persist, wipe, DEFAULT } from './save.js';
import * as audio from './audio.js';
import * as haptic from './haptic.js';
import { buildShop } from './shop.js';
import { MUSIC, TRACK_NAME, FIGHT_POOL, unlockedFightTracks, pickFightTrack, RECENT_KEEP } from './music.js';

const qs = new URLSearchParams(location.search);
const cvs = document.getElementById('game');
const ctx = cvs.getContext('2d', { alpha: false });
const $ = (id) => document.getElementById(id);
/** Every button press: the paper click, and a tick on the phone if it has one. */
const click = () => { audio.sfx.click(); haptic.tap(); };

let S = load();
if (qs.get('unlock')) { for (const m of MOVES) S.moves[m.id] = { owned: true, power: 2, cd: 2 }; }
let match = null;
let sheet = null;
let sheetLevel = -1;
let mode = 'boot';
let vw = 0, vh = 0, dpr = 1;
let lastT = 0;
let pendingResult = null;

audio.registerTracks(MUSIC);

// ── canvas ───────────────────────────────────────────────────────────────
function resize() {
  dpr = Math.min(2, window.devicePixelRatio || 1);
  if (qs.get('dpr')) dpr = +qs.get('dpr');
  vw = cvs.clientWidth; vh = cvs.clientHeight;
  cvs.width = Math.round(vw * dpr);
  cvs.height = Math.round(vh * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', () => { resize(); updateRotateHint(); });
window.addEventListener('orientationchange', () => setTimeout(() => { resize(); updateRotateHint(); }, 120));

let rotateHintT = null;
/** Nudge, not a wall: shows briefly in portrait and gets out of the way. */
function updateRotateHint() {
  const el = $('rotate');
  if (!el) return;
  const on = isRotated() && mode !== 'boot';
  el.classList.toggle('show', on);
  if (on) {
    el.classList.remove('fade');
    clearTimeout(rotateHintT);
    rotateHintT = setTimeout(() => el.classList.add('fade'), 4000);
  }
}

// ── input ────────────────────────────────────────────────────────────────
const input = new Input(cvs, {
  hand: S.settings.hand,
  onStrike: () => match && match.playerStrike(),
  onGesture: (g) => {
    if (!match || match.demo) return;
    const mv = MOVES.find((m) => m.gesture === g);
    if (!mv) return;
    if (!(S.moves[mv.id] || {}).owned) {
      match.fx.text(match.player.x, match.player.y - 150, 'NOT LEARNED', { col: '#9aa0ad', size: 22 });
      return;
    }
    if (match.playerSpecial(mv.id)) haptic.gesture();
  },
});

// ── screens ──────────────────────────────────────────────────────────────
const SCREENS = ['boot', 'hub', 'shop', 'results', 'victory', 'settings', 'help'];
function show(name) {
  for (const s of SCREENS) $(s).classList.toggle('show', s === name);
  $('pauseBtn').classList.toggle('hidden', name !== null || !match || match.demo);
}
function overlay(name) {   // a panel on top of the hub
  for (const s of ['shop', 'settings', 'help', 'results', 'victory']) $(s).classList.toggle('show', s === name);
  $('pauseBtn').classList.toggle('hidden', !!name || mode !== 'fight');
}

function setMode(m) {
  mode = m;
  input.enabled = (m === 'fight');
  input.reset();
  $('pauseBtn').classList.toggle('hidden', m !== 'fight');
  updateRotateHint();
  if (m === 'hub') { show('hub'); startDemo(); audio.play(S.completed ? 'victory' : 'menu'); }
  else if (m === 'fight') { show(null); }
}

// ── matches ──────────────────────────────────────────────────────────────
function ensureSheet(level) {
  if (sheetLevel !== level.idx || !sheet) {
    sheet = buildArena(level, 3);
    sheetLevel = level.idx;
  }
}

function startDemo() {
  const idx = Math.min(TOTAL_LEVELS - 1, Math.max(0, S.level + (Math.random() * 5 - 2) | 0));
  const level = LEVELS[idx];
  ensureSheet(level);
  match = new Match({
    level, demo: true,
    save: { perks: { hp: 3, atk: 3, spd: 2, armor: 2 }, moves: {} },
    onEnd: () => { if (mode === 'hub') setTimeout(startDemo, 700); },
  });
}

function startFight(levelIdx, bully = false) {
  // Never trust the index: an out-of-range one throws inside the click handler, which looks
  // exactly like a button that does nothing.
  const level = LEVELS[Math.max(0, Math.min(TOTAL_LEVELS - 1, levelIdx | 0))];
  ensureSheet(level);
  match = new Match({
    level, save: S, bully, autoplay: !!qs.get('autoplay'),
    onSeen: () => persist(S),
    onEnd: (result, m) => finishFight(result, m),
  });
  match.say(bully ? 'BULLY TIME' : level.kind === 'final' ? 'FINAL PAGE' :
    level.kind === 'champion' ? 'CHAMPION' : 'FIGHT!', 1.8);
  setMode('fight');
  audio.play(fightTrack(level));
}

/** How far the player has ever got — unlocks are permanent, including in bully mode. */
function reachedLevel(level) {
  return Math.max(S.level || 0, level ? level.idx : 0, S.everWon ? TOTAL_LEVELS : 0);
}

/**
 * Rotates through the unlocked fight roster. Picking on tier alone meant 12 of the first 15
 * fights played fight1 and fight2 never appeared before level 15 — which reads as "there is
 * only one song" no matter how many files ship.
 */
function fightTrack(level) {
  if (level.kind === 'final') return 'final';
  if (level.kind === 'champion') return 'boss';
  const pick = pickFightTrack(fightPool(reachedLevel(level)), S.musicRecent || []);
  S.musicRecent = [...(S.musicRecent || []), pick].slice(-RECENT_KEEP);
  persist(S);
  return pick;
}

function finishFight(result, m) {
  const L = m.level;
  const won = result === 'win';
  const rankGap = L.tier - playerRankAt(L.idx);
  const bonus = won ? Math.round(m.level.reward * Math.max(0, rankGap) * 0.5) : 0;
  const earned = won ? Math.round(m.level.reward + m.score * 0.12 + bonus) : Math.round(m.score * 0.05);

  S.ink += earned;
  S.totalInk += earned;
  S.score += m.score;
  S.best = Math.max(S.best, m.score);
  S.biggestLaunch = Math.max(S.biggestLaunch, Math.round(m.biggestLaunch));
  if (won) { S.wins++; S.kos += m.kos; } else S.losses++;
  // All-time, and never wiped by a new game — the record book is the reason to play again.
  const R = S.records;
  R.bestScore = Math.max(R.bestScore, Math.round(S.score));
  R.bestFight = Math.max(R.bestFight, Math.round(m.score));
  R.longestLaunch = Math.max(R.longestLaunch, Math.round(m.biggestLaunch));
  R.mostKos = Math.max(R.mostKos, m.kos);
  if (won) R.wins++;

  const wasFinal = L.kind === 'final';
  const tracksBefore = unlockedFightTracks(reachedLevel(null)).length;
  if (won) {
    if (m.bully) S.bullyLevel = Math.min(TOTAL_LEVELS - 1, L.idx + 1);
    else S.level = Math.min(TOTAL_LEVELS - 1, L.idx + 1);
    if (wasFinal) {
      S.everWon = true;
      if (m.bully) S.records.bullyRuns++; else { S.completed = true; S.records.championships++; }
    }
  }
  persist(S);
  const gained = unlockedFightTracks(reachedLevel(null)).slice(tracksBefore).map((t) => TRACK_NAME[t.id] || t.id);
  pendingResult = { result, m, earned, bonus, rankGap, wasFinal, bully: m.bully, gained };

  // A bully run has a finish line too. Without this you beat the Ink Master a second time
  // and got a plain results card, then the hub handed you the same final fight for ever.
  if (won && wasFinal) { showVictory(m.bully); return; }
  showResults(pendingResult);
}

function showResults(R) {
  const m = R.m;
  const won = R.result === 'win';
  $('resTitle').textContent = won ? (R.m.level.kind === 'champion' ? 'CHAMPION DOWN' : 'WIN') : 'KNOCKED OUT';
  $('resTitle').style.color = won ? '#2f5c39' : '#c0392b';
  const acc = m.damageTaken === 0 && won;
  $('resBody').innerHTML = [
    row('Damage dealt', Math.round(m.damageDealt)),
    row('Damage taken', Math.round(m.damageTaken)),
    row('Best combo', `${m.bestCombo} hit`),
    m.biggestLaunch > 40 ? row('Longest launch', `${Math.round(m.biggestLaunch / 10)} m`) : '',
    acc ? row('FLAWLESS', '+500') : '',
    R.bonus > 0 ? row(`Punching up (+${R.rankGap} rank)`, `+${R.bonus}`) : '',
    row('Score', Math.round(m.score)),
    `<div class="r big"><span>INK EARNED</span><b>+${R.earned}</b></div>`,
    R.gained && R.gained.length
      ? `<div class="r unlock"><span>♪ NEW MUSIC</span><b>${R.gained.join(' · ')}</b></div>` : '',
  ].join('');
  $('btnResult').textContent = won ? 'CONTINUE' : 'TRY AGAIN';
  // A win already continues to the hub; a loss needs its own way out of the retry loop.
  $('btnResMenu').classList.toggle('hidden', won);
  overlay('results');
  audio.play(won ? 'victory' : 'menu');
  if (won) audio.sfx.bell();
}
const row = (k, v) => `<div class="r"><span>${k}</span><b>${v}</b></div>`;

/**
 * The record book. Shown on a win, and reachable from the hub's trophy any time after your
 * first one. Two sections, because they answer different questions: what THIS run has done,
 * and what you have ever done. Only the second survives a new game — which is the whole
 * reason a new game is worth starting.
 *
 * @param bully   the run being celebrated is a bully run
 * @param justWon called from a victory rather than from the trophy button
 */
function showVictory(bully, justWon = true) {
  const wasBully = !!bully;
  const R = S.records;
  const m = (v) => `${(Math.round(v) / 10).toFixed(1)} m`;
  $('victory').querySelector('h2').textContent =
    !justWon ? 'RECORD BOOK' : wasBully ? 'BULLY CHAMPION' : 'CHAMPION';
  $('vicBody').innerHTML = [
    `<div class="vichead">THIS RUN</div>`,
    row('Fights won', S.wins),
    row('Knockouts', S.kos),
    row('Longest launch', m(S.biggestLaunch)),
    row('Ink collected', S.totalInk),
    `<div class="r big"><span>${justWon ? 'FINAL SCORE' : 'SCORE'}</span><b>${Math.round(S.score)}</b></div>`,
    `<div class="vichead">ALL TIME</div>`,
    row('Championships', R.championships + (R.bullyRuns ? ` · ${R.bullyRuns} bully` : '')),
    row('Highest score', R.bestScore),
    row('Best single fight', R.bestFight),
    row('Longest launch', m(R.longestLaunch)),
    row('Most knockouts in a fight', R.mostKos),
    row('Fights won, all time', R.wins),
  ].join('');

  // Bullying is a reward for finishing THIS run. Offering it from the record book after a
  // new game handed a white belt a black belt's standing.
  const canBully = !!S.completed;
  $('btnBully').classList.toggle('hidden', !canBully);
  $('btnBully').textContent = wasBully ? 'BULLY AGAIN' : 'BULLY MODE';
  resetAgainBtn();
  $('vicFine').textContent = canBully
    ? 'Bully Mode: keep your ink and everything you have bought, and start again at white belt. New Game wipes this run — only the all-time records above are kept.'
    : 'New Game wipes this run — your ink, upgrades and progress. Only the all-time records above are kept.';
  overlay('victory');
  if (justWon) { audio.play('victory'); audio.sfx.bell(); }
  // Confetti of paper scraps over the celebrating figure.
  if (match && justWon) {
    for (let i = 0; i < 90; i++) {
      setTimeout(() => match && match.fx.spawn(
        200 + Math.random() * (SHEET_W - 400), -40, 0, 120, 'scrap', 1,
        { spread: 130, size: 7, life: 4 }), i * 45);
    }
  }
}

// ── hub ──────────────────────────────────────────────────────────────────
/** The fight the hub is offering. FIGHT must use exactly this, not the raw save value. */
function hubLevel() {
  return Math.max(0, Math.min(TOTAL_LEVELS - 1, (S.bully ? S.bullyLevel : S.level) | 0));
}

function refreshHub() {
  const bullyMode = S.bully;
  const idx = hubLevel();
  const L = LEVELS[idx];
  const pr = RANKS[bullyMode ? RANKS.length - 1 : playerRankAt(idx)];
  const er = RANKS[L.tier];
  $('hubTitle').textContent = L.kind === 'final' ? 'THE INK MASTER'
    : L.kind === 'champion' ? `${er.name.toUpperCase()} CHAMPION` : L.dojo;
  $('hubSub').textContent = `${L.title}  ·  fight ${idx + 1} of ${TOTAL_LEVELS}`;
  const gap = L.tier - (bullyMode ? RANKS.length - 1 : playerRankAt(idx));
  $('hubRank').innerHTML =
    `<span class="swatch" style="background:${pr.col}"></span>YOU ${pr.name.toUpperCase()}` +
    `<span style="opacity:.5;margin:0 4px">vs</span>` +
    `<span class="swatch" style="background:${er.col}"></span>${er.name.toUpperCase()}` +
    (gap > 0 ? ` <b style="color:#e8b93a">· UNDERDOG</b>` : gap < 0 ? ` <b style="opacity:.6">· FAVOURITE</b>` : '');
  $('inkPill').textContent = S.ink;
  $('hubStats').innerHTML =
    `won ${S.wins} · lost ${S.losses}<br>score ${Math.round(S.score)}` +
    (bullyMode ? '<br><b style="color:#e8b93a">BULLY MODE</b>' : '');
  $('btnFight').textContent = bullyMode ? 'BULLY' : L.kind === 'final' ? 'FINAL FIGHT' : 'FIGHT';
  $('btnMusic').classList.toggle('off', !S.settings.music);
  // Once you have finished a run, the options that only appeared on the victory screen have
  // to stay reachable — otherwise the hub hands you the final fight and nothing else.
  $('btnTrophy').classList.toggle('hidden', !S.everWon);
}

// ── render ───────────────────────────────────────────────────────────────
function render() {
  ctx.save();
  drawDesk(ctx, vw, vh, sheet);
  if (!match) { ctx.restore(); return; }

  const m = match;
  const camH = m.camH || 700;
  const scale = vh / camH;
  const camW = vw / scale;
  let cx = m.camX;
  cx = Math.max(camW / 2 - 90, Math.min(SHEET_W - camW / 2 + 90, cx));
  let cy = m.camY;
  cy = Math.max(-120, Math.min(SHEET_H - camH + 90, cy));

  ctx.save();
  ctx.translate(m.fx.shakeX, m.fx.shakeY);
  ctx.scale(scale, scale);
  ctx.translate(-(cx - camW / 2), -cy);

  sheetShadow(ctx, 0, 0, SHEET_W, SHEET_H);
  if (sheet) ctx.drawImage(sheet, 0, 0);
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.drawImage(m.fx.marks, 0, 0);
  ctx.restore();

  for (const h of m.hazards) h.drawBack && h.drawBack(ctx);
  for (const f of m.all) drawShadow(ctx, f, GROUND_Y);

  const order = [...m.all].sort((a, b) => (a.dead ? 0 : 1) - (b.dead ? 0 : 1) || a.id - b.id);
  for (const f of order) drawFighter(ctx, f, m.time);
  for (const p of m.projectiles) p.draw(ctx);
  for (const h of m.hazards) h.drawFront && h.drawFront(ctx);
  m.fx.draw(ctx);
  if (mode === 'fight') drawNameTags(ctx, m);

  ctx.restore();

  if (mode === 'fight') drawHUD(ctx, vw, vh, m, S, input);
  ctx.restore();
}

// ── loop ─────────────────────────────────────────────────────────────────
let acc = 0;
function frame(t) {
  requestAnimationFrame(frame);
  const now = t / 1000;
  let dt = Math.min(0.05, now - lastT || 0.016);
  lastT = now;
  if (mode === 'boot') { render(); return; }

  input.update(dt);
  if (match) {
    const paused = document.querySelector('.panel-screen.show') && !match.demo;
    if (!paused) {
      acc += dt;
      let steps = 0;
      while (acc >= 1 / 120 && steps < 8) {
        match.update(1 / 120, mode === 'fight' ? input : null);
        acc -= 1 / 120;
        steps++;
      }
      if (mode === 'fight' && input.jump) match.player.jump();
    }
  }
  render();
  window.__state = match ? {
    mode, hp: match.player.hp, enemies: match.aliveEnemies.length,
    over: match.over, result: match.result, time: match.time, score: match.score,
  } : { mode };
}

// ── wiring ───────────────────────────────────────────────────────────────
$('btnFight').onclick = () => {
  click();
  startFight(hubLevel(), S.bully);
};
$('btnTrophy').onclick = () => { click(); showVictory(S.bully, false); };
$('btnShop').onclick = () => { click(); openShop(); };
$('btnShopClose').onclick = () => { click(); overlay(null); refreshHub(); };
$('btnSettings').onclick = () => { click(); openSettings(); };
$('btnSetClose').onclick = () => { click(); overlay(null); };
$('btnHelp').onclick = () => { click(); openHelp(); };
$('btnHelpClose').onclick = () => { click(); overlay(null); };
$('btnPause').onclick = () => { click(); openSettings(); };
$('btnResult').onclick = () => {
  click();
  overlay(null);
  const R = pendingResult;
  if (R && R.result === 'lose') startFight(R.m.level.idx, R.bully);
  else { setMode('hub'); refreshHub(); }
};
$('btnResMenu').onclick = () => { click(); overlay(null); toMenu(); };
$('btnQuit').onclick = () => { click(); overlay(null); toMenu(); };

/** Abandon whatever is on screen and go back to the hub. Nothing is scored either way. */
function toMenu() {
  match = null;          // drop the fight without firing its onEnd
  pendingResult = null;
  setMode('hub');
  refreshHub();
}
let armAgain = 0;
$('btnAgain').onclick = () => {
  click();
  // Two-step instead of a modal: the first press asks, the second one does it.
  if (Date.now() > armAgain) {
    armAgain = Date.now() + 6000;
    $('btnAgain').textContent = 'SURE? WIPES THIS RUN';
    $('btnAgain').classList.add('danger');
    setTimeout(() => { if (Date.now() > armAgain - 200) resetAgainBtn(); }, 6000);
    return;
  }
  resetAgainBtn();
  // Records, the music roster and the fact that you have won survive. Everything you bought
  // does not — that is the point of starting again.
  const keep = { best: S.best, everWon: S.everWon, records: S.records };
  S = { ...DEFAULT(), ...keep, newGamePlus: (S.newGamePlus || 0) + 1 };
  persist(S); overlay(null); setMode('hub'); refreshHub();
};
function resetAgainBtn() {
  armAgain = 0;
  $('btnAgain').textContent = 'NEW GAME';
  $('btnAgain').classList.remove('danger');
}
$('btnBully').onclick = () => {
  click();
  // Bully mode KEEPS your progress, it does not hand you a maxed save. Maxing everything
  // ended the game twice over: nothing left to buy, and nothing left to earn ink for.
  S.bully = true; S.bullyLevel = 0;
  persist(S); overlay(null); setMode('hub'); refreshHub();
};
$('btnVicMenu').onclick = () => { click(); overlay(null); setMode('hub'); refreshHub(); };
$('btnFull').onclick = () => {
  click();
  const d = document.documentElement;
  if (!document.fullscreenElement) (d.requestFullscreen || d.webkitRequestFullscreen || (() => {})).call(d);
  else (document.exitFullscreen || document.webkitExitFullscreen || (() => {})).call(document);
};
$('btnMusic').onclick = () => {
  S.settings.music = !S.settings.music;
  audio.setMusic(S.settings.music);
  persist(S); refreshHub();
  click();
};
$('btnWipe').onclick = () => {
  wipe();
  S = DEFAULT();
  persist(S);
  overlay(null); setMode('hub'); refreshHub();
};

function openShop() {
  buildShop($('shopList'), $('shopInk'), S, () => { persist(S); refreshHub(); });
  overlay('shop');
}
function openSettings() {
  const rows = $('setRows');
  const T = (label, on, fn) =>
    `<div class="toggle"><span>${label}</span><button class="buy" data-fn="${fn}">${on ? 'ON' : 'OFF'}</button></div>`;
  rows.innerHTML =
    T('Music', S.settings.music, 'music') +
    T('Sound effects', S.settings.sfx, 'sfx') +
    T('Screen shake', S.settings.shake, 'shake') +
    // A dead toggle is worse than no toggle: desktop and iOS Safari cannot vibrate at all.
    (haptic.supported ? T('Vibration', S.settings.haptics, 'haptics') : '') +
    `<div class="toggle"><span>Stick side</span><button class="buy" data-fn="hand">${S.settings.hand === 'right' ? 'LEFT STICK' : 'RIGHT STICK'}</button></div>` +
    musicList();
  // Pausing is the only place you can bail out of a fight, so the way out lives here.
  $('btnQuit').classList.toggle('hidden', mode !== 'fight');
  rows.querySelectorAll('button[data-fn]').forEach((b) => {
    b.onclick = () => {
      const f = b.dataset.fn;
      if (f === 'hand') S.settings.hand = S.settings.hand === 'right' ? 'left' : 'right';
      else S.settings[f] = !S.settings[f];
      applySettings();
      persist(S);
      openSettings();
      click();
    };
  });
  // Tap a track to hear it; the ON/OFF beside it keeps it out of the fight rotation.
  rows.querySelectorAll('[data-play]').forEach((el) => {
    el.onclick = () => {
      click();
      if (!S.settings.music) { S.settings.music = true; applySettings(); }
      audio.play(el.dataset.play, true);
      persist(S);
      openSettings();
    };
  });
  rows.querySelectorAll('[data-mute]').forEach((b) => {
    b.onclick = (e) => {
      e.stopPropagation();
      click();
      const id = b.dataset.mute;
      S.musicOff = { ...(S.musicOff || {}) };
      if (S.musicOff[id]) delete S.musicOff[id]; else S.musicOff[id] = true;
      persist(S);
      openSettings();
    };
  });
  overlay('settings');
}

/** Unlocked, not switched off, and never an empty list — silence is not a preference. */
function fightPool(reached) {
  const unlocked = unlockedFightTracks(reached).map((t) => t.id);
  const kept = unlocked.filter((id) => !(S.musicOff || {})[id]);
  return kept.length ? kept : unlocked;
}

/**
 * The soundtrack as a collection: what is playing now, what is unlocked, and which ones
 * you have switched off. Tapping a row auditions it.
 */
function musicList() {
  const reached = reachedLevel(null);
  const now = audio.current();
  const off = S.musicOff || {};
  const live = fightPool(reached);
  const rows = FIGHT_POOL.map((t) => {
    if (t.unlockAt > reached) {
      return `<div class="r lockedrow"><span>🔒 ${TRACK_NAME[t.id] || t.id}</span>` +
        `<b>level ${t.unlockAt + 1}</b></div>`;
    }
    const on = !off[t.id];
    const playing = now === t.id;
    // Switching off the last one standing would just mean silence, so it stays locked on.
    const last = on && live.length === 1 && live[0] === t.id;
    return `<div class="r trackrow${playing ? ' playing' : ''}${on ? '' : ' mutedrow'}" data-play="${t.id}">` +
      `<span>${playing ? '▶' : '♪'} ${TRACK_NAME[t.id] || t.id}</span>` +
      `<button class="buy tiny" data-mute="${t.id}"${last ? ' disabled' : ''}>${on ? 'ON' : 'OFF'}</button></div>`;
  }).join('');
  const n = unlockedFightTracks(reached).length;
  const nowName = TRACK_NAME[now];
  return `<div class="musichead">SOUNDTRACK — ${n} of ${FIGHT_POOL.length} fight tracks</div>` +
    (nowName && S.settings.music
      ? `<div class="nowplaying">NOW PLAYING <b>${nowName}</b></div>`
      : `<div class="nowplaying off">music is off</div>`) +
    rows;
}

function openHelp() {
  const owned = MOVES.filter((m) => (S.moves[m.id] || {}).owned);
  // The gesture number is the move's place in the shop list, so it matches the badges on
  // the strip along the bottom of the screen.
  const keyOf = (m) => Object.keys(SPECIAL_KEYS).find((k) => SPECIAL_KEYS[k] === m.gesture);
  $('helpRows').innerHTML =
    `<div class="r"><span>Left thumb</span><b>move · jump · duck</b></div>` +
    `<div class="r"><span>Right thumb — tap</span><b>punch (tap again to combo)</b></div>` +
    `<div class="r"><span>Right thumb — draw</span><b>special move</b></div>` +
    `<div class="vichead">KEYBOARD</div>` +
    `<div class="r"><span>Move</span><b>A / D &nbsp;or&nbsp; ← / →</b></div>` +
    `<div class="r"><span>Jump · duck</span><b>W / S &nbsp;or&nbsp; ↑ / ↓</b></div>` +
    `<div class="r"><span>Punch</span><b>space · J · R · 0 &nbsp;(tap again to combo)</b></div>` +
    `<div class="r"><span>Specials</span><b>1 – 8, numbered on the strip below</b></div>` +
    `<p class="fine" style="text-align:left;margin:4px 0 0">Arrows plus R and the top number row, or WASD plus the num pad — either hand works.</p>` +
    `<div class="vichead">YOUR MOVES</div>` +
    owned.map((m) => {
      const k = keyOf(m);
      return `<div class="r"><span><b style="font-size:24px">${m.glyph}</b> ${m.name}</span>` +
        `<b>${m.hint}${k ? ` &nbsp;·&nbsp; key ${k}` : ''}</b></div>`;
    }).join('');
  overlay('help');
}
function applySettings() {
  audio.setMusic(S.settings.music);
  audio.setSfx(S.settings.sfx);
  haptic.setEnabled(S.settings.haptics);
  input.hand = S.settings.hand;
}

// ── boot ─────────────────────────────────────────────────────────────────
const BOOT_MSGS = ['sharpening pencils…', 'ruling lines…', 'tying bandanas…', 'warming up the ragdolls…', 'ready'];
async function boot() {
  resize();
  show('boot');
  let step = 0;
  const bump = (pct, msg) => { $('bootbar').firstElementChild.style.width = pct + '%'; $('bootmsg').textContent = msg; };

  bump(10, BOOT_MSGS[0]);
  await document.fonts.ready.catch(() => {});
  bump(35, BOOT_MSGS[1]);
  await new Promise((r) => setTimeout(r, 40));
  ensureSheet(LEVELS[Math.min(TOTAL_LEVELS - 1, S.level)]);
  bump(70, BOOT_MSGS[2]);
  await new Promise((r) => setTimeout(r, 40));
  startDemo();
  for (let i = 0; i < 60; i++) match.update(1 / 60, null);
  bump(100, BOOT_MSGS[4]);
  $('startBtn').classList.remove('hidden');
  requestAnimationFrame(frame);

  $('startBtn').onclick = () => {
    audio.init();
    audio.resume();
    applySettings();
    audio.sfx.ping();
    setMode('hub');
    refreshHub();
    if (qs.get('level')) startFight(Math.min(TOTAL_LEVELS - 1, +qs.get('level')));
  };
  if (qs.get('auto') || qs.get('shot')) setTimeout(() => $('startBtn').click(), 120);
}
boot().catch((err) => {
  // Surfaced by the inline handler in index.html; rethrow so it is reported, not swallowed.
  setTimeout(() => { throw err; });
});

window.__ragdojo = { get save() { return S; }, get match() { return match; }, startFight, fightTrack, fightPool, LEVELS, S };
window.__input = input;
