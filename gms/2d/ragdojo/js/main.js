// Boot, loop, screens, progression.

import {
  SHEET_W, SHEET_H, GROUND_Y, TOTAL_LEVELS,
  playerRankAt, moveStats, derive, levelsFor, ranksFor, activeMoves, RANK_WORD,
  WORLDS, worldOf, BULLY_WIN_FLAG, MOVE_SETS,
} from './config.js';
import { drawDesk } from './paper.js';
import { buildArena } from './arena.js';
import { drawFighter, drawShadow } from './draw.js';
import { Match } from './match.js';
import { Input, isRotated, SPECIAL_KEYS } from './input.js?v=20261015-gf';
import { drawHUD, drawNameTags, handText, FONT, FONT_B } from './ui.js';
import { load, save as persist, wipe, DEFAULT, RUN, RUN_KEYS, KEY } from './save.js';
import * as audio from './audio.js';
import * as haptic from './haptic.js';
import { buildShop, stopShopTicker } from './shop.js?v=20261015-gf';
import { MUSIC, TRACK_NAME, poolFor, roleTrack, unlockedFightTracks, pickFightTrack, RECENT_KEEP } from './music.js';

import { DEV, DEMO, ACCOUNTS, SIGNIN, HOME } from './edition.js?v=20261013-lan';
import { Purchases, API, ownerPollNext } from './purchases.js?v=20261015-gf';
import { createFamilyAccess } from './family-access.js?v=20261008-names';
import { track, visitor, source, analyticsChoice, analyticsEnabled } from './analytics.js';
import { mountArena } from './net/panel.js?v=20261015-qff';
import { mountEvents, mergeEventsInto, drawEventBackdrop } from './events/ui.js?v=20261015-evf';
const qs = new URLSearchParams(location.search);
let purchases = null, account = null, pendingCloud = null;
/** A definitive "not entitled" arrived while a paid world was in play: park it at the next hub visit, never mid-fight. */
let parkOwed = false;
let familyStorage;
try { familyStorage = localStorage; } catch {}
const familyAccess = createFamilyAccess(location.hostname, familyStorage, !DEMO);
const hasPremium = () => DEV || familyAccess.active || (!DEMO && purchases?.owned === true);
/** LIGHT and DARK are free; the supporter upgrade opens these. */
const PAID_WORLDS = ['cyborg', 'god'];
const isPaid = (id) => PAID_WORLDS.includes(id);
const PAID_NAMES = 'CYBER and DEITIES';
// null until probed: the purchase API is not live yet, and asking it repeatedly is just noise.
let paymentsUp = null;
/** A definitive entitlement answer exists. Until then a paid run is never parked: a paying player is just unverified yet. */
let entKnown = DEV || DEMO || !ACCOUNTS;

const cvs = document.getElementById('game');
const ctx = cvs.getContext('2d', { alpha: false });
const $ = (id) => document.getElementById(id);
/** Every button press: the paper click, and a tick on the phone if it has one. */
const click = () => { audio.sfx.click(); haptic.tap(); };

let S = load();
/** The campaign, the ranks and the moves you are holding all follow the current theme. */
const LEVELS = () => levelsFor(S.theme);
const RANKS = () => ranksFor(S.theme);
const MOVES = () => activeMoves(S);
if (DEV && qs.get('unlock')) { for (const m of Object.values(MOVE_SETS).flat()) S.moves[m.id] = { owned: true, power: 2, cd: 2 }; }
let match = null;
let sheet = null;
let sheetLevel = -1;
let mode = 'boot';
let vw = 0, vh = 0, dpr = 1;
let lastT = 0;
let pendingResult = null;

audio.registerTracks(MUSIC);

// ── canvas ───────────────────────────────────────────────────────────────
const MAX_PIXELS = 3.5e6;
function resize() {
  dpr = Math.min(2, window.devicePixelRatio || 1);
  if (qs.get('dpr')) dpr = +qs.get('dpr');
  vw = cvs.clientWidth; vh = cvs.clientHeight;
  // Big tablets at dpr 2 are 5-6 MP of canvas for a pencil drawing; cap the backing store.
  dpr = Math.min(dpr, Math.sqrt(MAX_PIXELS / Math.max(1, vw * vh)));
  cvs.width = Math.round(vw * dpr);
  cvs.height = Math.round(vh * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  deskCache = null;
}
// render() too: resizing clears the canvas, and the hub behind a panel is not repainted every frame.
window.addEventListener('resize', () => { resize(); updateRotateHint(); render(); });
window.addEventListener('orientationchange', () => setTimeout(() => { resize(); updateRotateHint(); render(); }, 120));

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
  facing: () => match?.player?.facing ?? 1,
  onStrike: () => match && (match.net ? match.net.strike() : match.playerStrike()),
  onGesture: (first, alts = []) => {
    if (!match || match.demo) return;
    // A stroke on the edge of two moves becomes the one you own. Online, any world's move counts.
    const pool = match.net ? Object.values(MOVE_SETS).flat() : MOVES();
    const g = [first, ...alts].find((x) => pool.some((m) => m.gesture === x && S.moves[m.id]?.owned)) || first;
    if (match.net) { match.net.gesture(g); return; }
    const mv = MOVES().find((m) => m.gesture === g);
    if (!mv) return;
    if (!(S.moves[mv.id] || {}).owned) {
      match.fx.text(match.player.x, match.player.y - 150, 'NOT LEARNED', { col: '#9aa0ad', size: 22 });
      return;
    }
    if (match.playerSpecial(mv.id)) haptic.gesture();
  },
});

// ── screens ──────────────────────────────────────────────────────────────
const SCREENS = ['boot', 'hub', 'shop', 'results', 'victory', 'settings', 'help', 'thug', 'premium', 'worlds', 'arena', 'events'];
function show(name) {
  for (const s of SCREENS) $(s).classList.toggle('show', s === name);
  if (name !== 'shop') stopShopTicker();
  $('pauseBtn').classList.toggle('hidden', name !== null || !match || match.demo);
}
function overlay(name) {   // a panel on top of the hub
  for (const s of ['shop', 'settings', 'help', 'results', 'victory', 'thug', 'premium', 'worlds', 'arena', 'events']) $(s).classList.toggle('show', s === name);
  if (name !== 'shop') stopShopTicker();
  $('pauseBtn').classList.toggle('hidden', !!name || mode !== 'fight');
}

function setMode(m) {
  mode = m;
  input.enabled = (m === 'fight');
  input.reset();
  $('pauseBtn').classList.toggle('hidden', m !== 'fight');
  document.body.classList.toggle('fighting', m === 'fight');
  updateRotateHint();
  if (m === 'hub') { if (parkOwed) { parkOwed = false; parkPaid(); } else unparkPaid(); show('hub'); startDemo(); audio.play(roleTrack(S.theme, S.completed ? 'victory' : 'menu')); }
  else if (m === 'fight') { show(null); }
}

// ── themes ───────────────────────────────────────────────────────────────
/**
 * DARK is the same 45 fights on the same sheet of paper, after hours. The page inverts
 * (one CSS filter over the whole app — measurably free, and a true inversion rather than a
 * second palette to keep in step), the ranks become gang colours, and your pencil-case
 * specials are replaced by what people carry on those streets.
 *
 * The two campaigns are separate runs with separate records, swapped in and out of the top
 * level of the save. Ink and skills are NOT swapped: you take your money and your training
 * with you.
 */
function applyTheme() {
  const app = document.getElementById('app');
  for (const w of WORLDS) if (w.id !== 'light') app.classList.toggle(w.id, S.theme === w.id);
  // GOD's replay run is the DEMON run, and the page goes to hell with it.
  const demon = S.theme === 'god' && !!S.bully;
  app.classList.toggle('demon', demon);
  app.classList.toggle('night', worldOf(S.theme).night || demon);
  document.body.classList.toggle('dark', S.theme === 'dark');
}

/** Each world past LIGHT is opened by winning the previous world's replay run. */
const worldEarned = (id) => id === 'light' || !!S[worldOf(id).flag];
const worldOpen = (id) => id === 'light' || (worldEarned(id) && (!isPaid(id) || hasPremium()));
/** True once you have won a bully run in the light — that is what opens the door. */
const darkOpen = () => worldOpen('dark');
/** Past DARK the single toggle becomes a list of worlds. */
const manyWorlds = () => !!S.thugWon;
/**
 * In the dark, the bully run is called being a THUG — and it stays called that in the
 * daylight if you walked back out still carrying the knives. The word follows the moves you
 * are holding, not the colour of the page.
 */
const bullyWord = () => (S.theme === 'light' && S.carryDark ? 'THUG' : worldOf(S.theme).bully);
/** Who the first fight of a replay run is against, for the line under the button. */
const FIRST_FOES = { light: 'white belts', dark: 'nobodies', cyborg: 'scrap', god: 'mortals' };
/** What winning a world's campaign makes you. */
const CHAMP_TITLE = { light: 'CHAMPION', dark: 'THE BOSS', cyborg: 'SINGULARITY', god: 'ALMIGHTY' };
/** A thug run has been started but never finished — the state that gates the prompt. */
const thugInPlay = () => !!(S.stash.dark ? S.stash.dark.bully : false) || (S.theme === 'dark' && S.bully);

function setTheme(to, { keepMoves = null, fresh = false } = {}) {
  if (to !== 'light' && !worldOpen(to)) { if (worldEarned(to)) openUpgrade(to); return; }
  if (to === S.theme && !fresh) return;
  S.stash[S.theme] = Object.fromEntries(RUN_KEYS.map((k) => [k, S[k]]));
  // `fresh` starts the world's campaign again from fight 1. Its records are all-time and stay.
  const next = fresh ? { ...RUN(), records: (S.stash[to] || RUN()).records } : (S.stash[to] || RUN());
  for (const k of RUN_KEYS) S[k] = next[k];
  S.theme = to;
  if (keepMoves !== null) S.carryDark = keepMoves;
  else if (to !== 'light') S.carryDark = false;
  applyTheme();
  sheetLevel = -1;                    // the sheet is baked per level; force a rebuild
  persist(S);
  setMode('hub');
  refreshHub();
  if (to === 'dark') maybeNudge();
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
  const level = LEVELS()[idx];
  ensureSheet(level);
  match = new Match({
    level, demo: true,
    save: { perks: { hp: 3, atk: 3, spd: 2, armor: 2 }, moves: {}, theme: S.theme, carryDark: S.carryDark },
    // Checked again when it fires: an online fight may have started in the meantime (a master
    // whose match the demo replaced froze the whole room).
    onEnd: () => { if (mode === 'hub') setTimeout(() => { if (mode === 'hub') startDemo(); }, 700); },
  });
}

function startFight(levelIdx, bully = false) {
  if (isPaid(S.theme) && !hasPremium()) { const was = S.theme; parkPaid(); refreshHub(); openUpgrade(was); return; }
  if (pendingCloud) { applyCloud(); toMenu(); return; }
  // Never trust the index: an out-of-range one throws inside the click handler, which looks
  // exactly like a button that does nothing.
  const level = LEVELS()[Math.max(0, Math.min(TOTAL_LEVELS - 1, levelIdx | 0))];
  ensureSheet(level);
  match = new Match({
    level, save: S, bully, autoplay: DEV && !!qs.get('autoplay'),
    onSeen: () => persist(S),
    onEnd: (result, m) => finishFight(result, m),
  });
  match.say(bully ? `${bullyWord()} TIME` : level.kind === 'final' ? 'FINAL PAGE' :
    level.kind === 'champion' ? 'CHAMPION' : 'FIGHT!', 1.8);
  setMode('fight');
  track('fight_start', S);
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
  if (level.kind === 'final') return roleTrack(S.theme, 'final');
  if (level.kind === 'champion') return roleTrack(S.theme, 'boss');
  const pick = pickFightTrack(fightPool(reachedLevel(level)), S.musicRecent || []);
  S.musicRecent = [...(S.musicRecent || []), pick].slice(-RECENT_KEEP);
  persist(S);
  return pick;
}

function finishFight(result, m) {
  track('fight_end', S, result);
  account?.matchCompleted();
  const L = m.level;
  const won = result === 'win';
  const rankGap = L.tier - playerRankAt(L.idx);
  const bonus = won ? Math.round(m.level.reward * Math.max(0, rankGap) * 0.5) : 0;
  const inkMul = derive(S).inkMul;
  const base = won ? m.level.reward + m.score * 0.12 + bonus : m.score * 0.05;
  const earned = Math.round(base * inkMul);
  const inkWell = earned - Math.round(base);

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
  const tracksBefore = unlockedFightTracks(reachedLevel(null), S.theme).length;
  if (won) {
    if (m.bully) S.bullyLevel = Math.min(TOTAL_LEVELS - 1, L.idx + 1);
    else S.level = Math.min(TOTAL_LEVELS - 1, L.idx + 1);
    if (wasFinal) {
      if (m.bully) {
        S.records.bullyRuns++;
        // Winning a bully run is the key to the next world: BULLY opens DARK, THUG opens
        // CYBER (and lets you carry a knife back into the light), SIMULANT opens DEITIES.
        S[BULLY_WIN_FLAG[S.theme] || 'darkUnlocked'] = true;
      } else {
        S.completed = true;
        S.records.championships++;
        if (S.theme === 'light') S.everWon = true;
      }
    }
  }
  persist(S);
  const gained = unlockedFightTracks(reachedLevel(null), S.theme).slice(tracksBefore).map((t) => TRACK_NAME[t.id] || t.id);
  // Special events (js/events/ui.js) bank finished fights; the listener writes back `award`.
  const battle = { at: Date.now(), src: 'campaign', kind: 'campaign', ranked: false, won,
    oppDmg: Math.max(0, ...m.enemies.map((e) => Math.min(1, 1 - e.hp / e.maxHp))) };
  try { window.dispatchEvent(new CustomEvent('ragdojo:battle', { detail: battle })); } catch {}
  const eventPts = battle.award?.pts || 0;
  pendingResult = { result, m, earned, bonus, rankGap, wasFinal, bully: m.bully, gained, inkWell, inkMul, eventPts };

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
    R.inkWell > 0 ? row(`Ink Well (×${R.inkMul.toFixed(2)})`, `+${R.inkWell}`) : '',
    `<div class="r big"><span>INK EARNED</span><b>+${R.earned}</b></div>`,
    R.gained && R.gained.length
      ? `<div class="r unlock"><span>♪ NEW MUSIC</span><b>${R.gained.join(' · ')}</b></div>` : '',
    eventRow(R.eventPts),
  ].join('');
  $('btnResult').textContent = won ? 'CONTINUE' : 'TRY AGAIN';
  // A win already continues to the hub; a loss needs its own way out of the retry loop.
  $('btnResMenu').classList.toggle('hidden', won);
  overlay('results');
  audio.play(roleTrack(S.theme, won ? 'victory' : 'menu'));
  if (won) audio.sfx.bell();
}
const row = (k, v) => `<div class="r"><span>${k}</span><b>${v}</b></div>`;
const eventRow = (n) => (n ? `<div class="r evaward"><span>EVENTS</span><b>+${n} event point${n === 1 ? '' : 's'}</b></div>` : '');

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
    !justWon ? (S.theme === 'dark' ? 'THE BOOK' : 'RECORD BOOK')
      : wasBully ? `${bullyWord()} CHAMPION`
      : CHAMP_TITLE[S.theme] || 'CHAMPION';
  $('vicBody').innerHTML = [
    justWon ? eventRow(pendingResult?.eventPts) : '',
    `<div class="vichead">THIS RUN</div>`,
    row('Fights won', S.wins),
    row('Knockouts', S.kos),
    row('Longest launch', m(S.biggestLaunch)),
    row('Ink collected', S.totalInk),
    `<div class="r big"><span>${justWon ? 'FINAL SCORE' : 'SCORE'}</span><b>${Math.round(S.score)}</b></div>`,
    `<div class="vichead">ALL TIME</div>`,
    row('Championships', R.championships + (R.bullyRuns ? ` · ${R.bullyRuns} ${bullyWord().toLowerCase()}` : '')),
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
  const BW = bullyWord();
  $('btnBully').textContent = wasBully ? `${BW} AGAIN` : `${BW} MODE`;
  resetAgainBtn();
  resetBeltBtn();
  // Won this world's replay run: you may walk back into the dojo as a white belt with every
  // skill you have bought. Kept on the record book, not just the victory, so it stays reachable.
  const canBelt = S.theme !== 'light' && !!S[BULLY_WIN_FLAG[S.theme]];
  $('btnWhiteBelt').classList.toggle('hidden', !canBelt);
  // Every button gets a line. "Bully Mode" and "Keep Playing" sat side by side with only one
  // of them explained, and the difference between "start the campaign again as a black belt"
  // and "close this and carry on" is not something a label can carry on its own.
  const at = `fight ${hubLevel() + 1} of ${TOTAL_LEVELS}`;
  $('vicFine').innerHTML = [
    canBully ? `<b>${BW[0] + BW.slice(1).toLowerCase()} ${wasBully ? 'Again' : 'Mode'}</b>` +
      ` — back to fight 1 against ${FIRST_FOES[S.theme] || 'white belts'},` +
      ' keeping every upgrade and all your ink.' : '',
    canBelt ? '<b>White Belt</b> — back to the dojo in daylight, fight 1, as a white belt.' +
      ' Every skill, move and drop of ink comes with you.' : '',
    `<b>Keep Playing</b> — close this and carry on where you are (${at}).`,
    '<b>New Game</b> — back to LIGHT fight 1 with no ink, skills, moves or worlds. Kept: the all-time records above, your soundtrack, events and settings.',
  ].filter(Boolean).map((t) => `<span>${t}</span>`).join('');
  overlay('victory');
  if (justWon) { audio.play(roleTrack(S.theme, 'victory')); audio.sfx.bell(); }
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
  if (pendingCloud && mode !== 'fight') applyCloud();
  const bullyMode = S.bully;
  const idx = hubLevel();
  const L = LEVELS()[idx];
  const R = RANKS();
  const pr = R[bullyMode ? R.length - 1 : playerRankAt(idx)];
  const er = R[L.tier];
  $('hubTitle').textContent = L.kind === 'final' ? L.enemies[0].name
    : L.kind === 'champion' ? `${er.name.toUpperCase()} CHAMPION` : L.dojo;
  $('hubSub').textContent = `${L.title}  ·  fight ${idx + 1} of ${TOTAL_LEVELS}`;
  const gap = L.tier - (bullyMode ? R.length - 1 : playerRankAt(idx));
  const word = RANK_WORD[S.theme] || 'bandana';
  $('hubRank').title = `Your ${word} against theirs`;
  $('hubRank').innerHTML =
    `<span class="swatch" style="background:${pr.col}"></span>YOU ${pr.name.toUpperCase()}` +
    `<span style="opacity:.5;margin:0 4px">vs</span>` +
    `<span class="swatch" style="background:${er.col}"></span>${er.name.toUpperCase()}` +
    (gap > 0 ? ` <b style="color:#e8b93a">· UNDERDOG</b>` : gap < 0 ? ` <b style="opacity:.6">· FAVOURITE</b>` : '');
  $('inkPill').textContent = S.ink;
  $('hubStats').innerHTML =
    `won ${S.wins} · lost ${S.losses}<br>score ${Math.round(S.score)}` +
    (bullyMode ? `<br><b style="color:#e8b93a">${bullyWord()} MODE</b>`
      // The later worlds hold two modes each, so say which one this is.
      : S.theme === 'cyborg' || S.theme === 'god' ? `<br><b>${worldOf(S.theme).mode} MODE</b>` : '');
  $('btnFight').textContent = bullyMode ? bullyWord() : L.kind === 'final' ? 'FINAL FIGHT' : 'FIGHT';
  $('btnMusic').classList.toggle('off', !S.settings.music);
  // Once you have finished a run, the options that only appeared on the victory screen have
  // to stay reachable — otherwise the hub hands you the final fight and nothing else.
  $('btnTrophy').classList.toggle('hidden', !S.everWon);
  // The DARK button appears the moment you win the dojo, but stays locked until you have
  // won a bully run — you can see what you are working towards.
  const dk = $('btnDark');
  dk.classList.toggle('hidden', !S.everWon);
  if (manyWorlds()) {
    // Four worlds do not fit a toggle: the button names where you are and opens the list.
    const w = worldOf(S.theme);
    dk.classList.remove('locked');
    dk.classList.toggle('on', S.theme !== 'light');
    dk.textContent = `${w.icon} ${w.name}`;
    dk.title = 'Choose a world';
    return;
  }
  dk.classList.toggle('locked', !darkOpen());
  dk.classList.toggle('on', S.theme === 'dark');
  dk.textContent = darkOpen() ? (S.theme === 'dark' ? '☀ LIGHT' : '☾ DARK') : '🔒 DARK';
  dk.title = darkOpen()
    ? (S.theme === 'dark' ? 'Back to the dojo' : 'The streets after dark')
    : 'Win a BULLY run to unlock';
}

// ── render ───────────────────────────────────────────────────────────────
/** The desk never changes and the sheet's blurred shadow only moves with the camera: bake both once per resize. */
let deskCache = null;
const SHADOW_PAD = 80, SHADOW_RES = 0.25;
function bakeDesk() {
  const desk = document.createElement('canvas');
  desk.width = Math.max(1, Math.round(vw * dpr)); desk.height = Math.max(1, Math.round(vh * dpr));
  const d = desk.getContext('2d');
  d.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawDesk(d, vw, vh, sheet);
  const shadow = document.createElement('canvas');
  shadow.width = Math.ceil((SHEET_W + SHADOW_PAD * 2) * SHADOW_RES); shadow.height = Math.ceil((SHEET_H + SHADOW_PAD * 2) * SHADOW_RES);
  // paper.js sheetShadow, in sheet units: shadowBlur/offset ignore the transform, so scale them by hand.
  const g = shadow.getContext('2d'), k = SHADOW_RES;
  g.shadowColor = 'rgba(0,0,0,0.55)'; g.shadowBlur = 30 * k; g.shadowOffsetY = 13 * k;
  g.fillStyle = '#000';
  g.fillRect((SHADOW_PAD + 6) * k, (SHADOW_PAD + 6) * k, (SHEET_W - 12) * k, (SHEET_H - 12) * k);
  deskCache = { desk, shadow };
}
function render() {
  ctx.save();
  if (!deskCache) bakeDesk();
  ctx.drawImage(deskCache.desk, 0, 0, vw, vh);
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

  ctx.drawImage(deskCache.shadow, -SHADOW_PAD, -SHADOW_PAD, SHEET_W + SHADOW_PAD * 2, SHEET_H + SHADOW_PAD * 2);
  if (sheet) ctx.drawImage(sheet, 0, 0);
  drawEventBackdrop(ctx, m);
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
  m.flair.draw(ctx);
  if (mode === 'fight') drawNameTags(ctx, m);

  ctx.restore();
  m.flair.drawScreen(ctx, vw, vh);

  if (mode === 'fight') drawHUD(ctx, vw, vh, m, m.hudSave || S, input);
  if (mode === 'fight' && m.net) m.net.drawHUD(ctx, vw, vh);
  ctx.restore();
}

// ── loop ─────────────────────────────────────────────────────────────────
let acc = 0, heldStop = 0;
function frame(t) {
  requestAnimationFrame(frame);
  const now = t / 1000;
  let dt = Math.min(0.05, now - lastT || 0.016);
  lastT = now;
  if (mode === 'boot') { render(); return; }

  input.update(dt);
  const paused = match && document.querySelector('.panel-screen.show') && !match.demo;
  // An online round never pauses: the other players are still there. Practice vs bots does.
  if (match && match.net) { if (match.net.client || !paused) match.net.step(dt, mode === 'fight' ? input : null); }
  else if (match) {
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
  // Online hit-stop is a held picture (the sim runs on, see PvpMatch.update): draw the impact
  // frame, then hold it until the stop runs out. A longer stop landing mid-hold redraws.
  const hs = match && match.net ? match.fx.hitstop : 0;
  // The hub's demo fight behind a blurred panel is not worth repainting every frame.
  const still = mode === 'hub' && match?.demo && document.querySelector('.panel-screen.show');
  if (!still && !(hs > 0 && heldStop > 0 && hs <= heldStop)) render();
  heldStop = hs;
  if (DEV) window.__state = match ? {
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
$('btnDark').onclick = () => {
  click();
  if (manyWorlds()) { openWorlds(); return; }
  if (!darkOpen()) {
    // Locked, and it says why rather than doing nothing.
    match && match.fx && match.fx.text(SHEET_W / 2, GROUND_Y - 260,
      'WIN A BULLY RUN FIRST', { col: '#c0392b', size: 30, life: 2.2 });
    return;
  }
  if (S.theme === 'light') { setTheme('dark'); return; }
  // Leaving the dark. A thug run that has been started but never finished gets asked the
  // question; anyone else just walks back into the daylight with their pencil case.
  if (thugInPlay()) { openThug(); return; }
  setTheme('light', { keepMoves: false });
};

/**
 * "Stay a THUG?" — carry the dark moves into the light world. YES is the reward for winning
 * a THUG run; until then it is visibly there and visibly out of reach.
 */
function openThug() {
  const won = !!S.thugWon;
  $('thugRows').innerHTML =
    `<div class="r"><span>You are walking back into the daylight.</span></div>` +
    `<div class="r"><span>Keep what you are carrying?</span><b>${won ? 'your call' : 'not yet'}</b></div>`;
  const yes = $('btnThugYes');
  yes.disabled = !won;
  yes.classList.toggle('locked', !won);
  $('thugFine').textContent = won
    ? 'Yes: the dojo, with a knife. No: the pencil case, as it was. Come back through DARK to change your mind.'
    : 'win as THUG to enable';
  overlay('thug');
}
/** Where each world sits on the ladder, and what it still wants from you if it is shut. */
function openWorlds() {
  const prev = (id) => WORLDS[WORLDS.findIndex((w) => w.id === id) - 1];
  $('worldRows').innerHTML = WORLDS.map((w) => {
    const here = S.theme === w.id;
    const open = worldOpen(w.id);
    const why = here ? 'you are here'
      : open ? (S.stash[w.id] ? `fight ${Math.min(TOTAL_LEVELS, (S.stash[w.id].level | 0) + 1)}` : 'fight 1')
      : !worldEarned(w.id) ? `win a ${prev(w.id).bully} run`
      : paymentsUp ? 'support the dev' : 'support the dev · soon';
    // Earned but unpaid stays tappable: it opens the upgrade rather than doing nothing.
    const tappable = !here && (open || worldEarned(w.id));
    return `<button class="btn world${here ? ' on' : ''}${open ? '' : ' locked'}" data-world="${w.id}"` +
      `${tappable ? '' : ' disabled'}><span>${open ? w.icon : '🔒'} ${w.name}` +
      `<small class="modes">${w.mode.toLowerCase()} · ${w.bully.toLowerCase()}</small></span><small>${why}</small></button>`;
  }).join('');
  $('worldRows').querySelectorAll('[data-world]').forEach((b) => {
    b.onclick = () => {
      click();
      const to = b.dataset.world;
      // Leaving the dark mid-THUG still gets asked whether to keep the knife.
      if (to === 'light' && S.theme === 'dark' && thugInPlay()) { openThug(); return; }
      if (!worldOpen(to)) { openUpgrade(to); return; }
      overlay(null);
      setTheme(to, { keepMoves: to === 'light' ? false : null });
    };
  });
  overlay('worlds');
}
$('btnWorldsClose').onclick = () => { click(); overlay(null); };

$('btnThugYes').onclick = () => { if (S.thugWon) { click(); overlay(null); setTheme('light', { keepMoves: true }); } };
$('btnThugNo').onclick = () => { click(); overlay(null); setTheme('light', { keepMoves: false }); };
$('btnThugClose').onclick = () => { click(); overlay(null); };
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
  else { setMode('hub'); refreshHub(); if (S.theme === 'dark') maybeNudge(); }
};
$('btnResMenu').onclick = () => { click(); overlay(null); toMenu(); };
$('btnQuit').onclick = () => { click(); overlay(null); toMenu(); };

/** Abandon whatever is on screen and go back to the hub. Nothing is scored either way. */
function toMenu() {
  if (match && match.net) arena.quit();
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
    $('btnAgain').textContent = 'SURE? WIPES INK + WORLDS';
    $('btnAgain').classList.add('danger');
    setTimeout(() => { if (Date.now() > armAgain - 200) resetAgainBtn(); }, 6000);
    return;
  }
  resetAgainBtn();
  // Records, the music roster and the fact that you have won survive. Everything you bought
  // does not — that is the point of starting again.
  resetSave({ best: S.best, everWon: S.everWon, records: S.records, events: S.events, eventPrizes: S.eventPrizes, newGamePlus: (S.newGamePlus || 0) + 1 });
};
/**
 * NEW GAME and ERASE both land here. Settings and the muted tracks are preferences, not
 * progress, and the page has to follow the new save: a DARK page with a LIGHT save stayed dark.
 */
function resetSave(keep = {}) {
  S = { ...DEFAULT(), ...keep, settings: { ...DEFAULT().settings, ...S.settings }, musicOff: { ...(S.musicOff || {}) } };
  persist(S);
  sheetLevel = -1;
  applySettings();
  overlay(null); setMode('hub'); refreshHub();
}
let armBelt = 0;
$('btnWhiteBelt').onclick = () => {
  click();
  if (Date.now() > armBelt) {
    armBelt = Date.now() + 6000;
    $('btnWhiteBelt').textContent = 'SURE? RESTARTS THE DOJO';
    $('btnWhiteBelt').classList.add('danger');
    setTimeout(() => { if (Date.now() > armBelt - 200) resetBeltBtn(); }, 6000);
    return;
  }
  resetBeltBtn();
  overlay(null);
  // The light run starts over; perks, moves, ink and every world you have opened stay.
  setTheme('light', { keepMoves: false, fresh: true });
};
function resetBeltBtn() {
  armBelt = 0;
  $('btnWhiteBelt').textContent = 'WHITE BELT';
  $('btnWhiteBelt').classList.remove('danger');
}
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
  applyTheme();
  persist(S); overlay(null); setMode('hub'); refreshHub();
};
const leaveVictory = () => { click(); overlay(null); setMode('hub'); refreshHub(); };
$('btnVicMenu').onclick = leaveVictory;
$('btnVicClose').onclick = leaveVictory;
$('btnResClose').onclick = () => { click(); overlay(null); toMenu(); };

/**
 * Tapping the darkened area outside a panel closes it, using that panel's own close action.
 * Both the press and the release have to land on the backdrop — otherwise dragging a list
 * and letting go past the edge of the sheet counts as a click on the backdrop and shuts the
 * panel you were reading. The results card is deliberately absent: after a fight your thumb
 * is already moving, and a stray tap there should not skip past the report.
 */
const DISMISS = { shop: 'btnShopClose', settings: 'btnSetClose', help: 'btnHelpClose', victory: 'btnVicClose', worlds: 'btnWorldsClose', arena: 'btnArenaClose', events: 'btnEventsClose' };
for (const id in DISMISS) {
  const el = $(id);
  let downOnBackdrop = false;
  el.addEventListener('pointerdown', (e) => { downOnBackdrop = e.target === el; });
  el.addEventListener('click', (e) => { if (downOnBackdrop && e.target === el) $(DISMISS[id]).click(); });
}
// iPhone Safari and iframes without allow=fullscreen cannot; a rejected request used to reach the boot-failure box.
const canFull = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
for (const id of ['btnFull', 'btnFullBoot']) $(id).classList.toggle('hidden', !canFull);
$('btnFull').onclick = $('btnFullBoot').onclick = () => {
  click();
  const d = document.documentElement;
  try {
    const p = !(document.fullscreenElement || document.webkitFullscreenElement)
      ? (d.requestFullscreen || d.webkitRequestFullscreen || (() => {})).call(d)
      : (document.exitFullscreen || document.webkitExitFullscreen || (() => {})).call(document);
    p?.catch?.(() => {});
  } catch {}
};
$('btnMusic').onclick = () => {
  S.settings.music = !S.settings.music;
  audio.setMusic(S.settings.music);
  persist(S); refreshHub();
  click();
};
// Two-step like NEW GAME, and never offered in the fight's pause panel next to QUIT.
let armWipe = 0;
$('btnWipe').onclick = () => {
  click();
  if (mode === 'fight') return;
  if (Date.now() > armWipe) {
    armWipe = Date.now() + 6000;
    $('btnWipe').textContent = account?.auth.signedIn ? 'SURE? ALSO ERASES THE CLOUD SAVE' : 'SURE? ERASES EVERYTHING';
    $('btnWipe').classList.add('armed');
    setTimeout(() => { if (Date.now() > armWipe - 200) resetWipeBtn(); }, 6000);
    return;
  }
  resetWipeBtn();
  wipe();
  resetSave();
};
function resetWipeBtn() {
  armWipe = 0;
  $('btnWipe').textContent = 'ERASE ALL PROGRESS';
  $('btnWipe').classList.remove('armed');
}

function openShop() {
  buildShop($('shopList'), $('shopInk'), S, () => { persist(S); refreshHub(); }, hasPremium());
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
    // Only once GOD is open, where winning tears the losers apart. No spoilers before then.
    (S.simulantWon ? T('Blood & gore (DEITIES)', S.settings.gore !== false, 'gore') : '') +
    `<div class="toggle"><span>Stick side</span><button class="buy" data-fn="hand">${S.settings.hand === 'right' ? 'LEFT STICK' : 'RIGHT STICK'}</button></div>` +
    (ACCOUNTS && !DEMO ? `<div class="toggle code"><span>Pass code</span><input id="giftCode" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="BR8T-XXXX-XXXX-XXXX" maxlength="24"><button class="buy" id="btnRedeem">USE</button></div><p class="fine" id="giftStatus">Got a br8t Pass code from a friend? Sign in, then enter it here.</p>` : '') +
    (ACCOUNTS && !DEMO ? `<div class="toggle" id="fbRow"><span>Bug or idea?</span></div><p class="fine" id="fbNote"></p>` : '') +
    `<div class="toggle"><span>Share anonymous play statistics</span><button class="buy" id="analyticsToggle">${analyticsEnabled() ? 'ON' : 'OFF'}</button></div>` +
    `<p class="fine">Optional: starts, fight progress and upgrade conversion. No email or save contents. <a href="privacy.html" target="_blank" rel="noopener">Privacy</a></p>` +
    musicList();
  $('analyticsToggle').closest('.toggle').classList.toggle('hidden', DEMO || !ACCOUNTS);
  $('btnCloudRetry').classList.toggle('hidden', !SIGNIN);
  $('analyticsToggle').onclick = () => { analyticsChoice(!analyticsEnabled()); openSettings(); };
  if ($('btnRedeem')) $('btnRedeem').onclick = redeemCode;
  // The shared br8t feedback panel; signed-out players see SIGN IN instead.
  if ($('fbRow')) import('/lib/feedback/feedback.js').then((m) => {
    const row = $('fbRow');
    if (row && !row.querySelector('button')) row.append(m.feedbackButton({ game: 'ragdojo', className: 'buy', label: 'SEND', signedOutLabel: 'SIGN IN', note: $('fbNote'), accent: '#3d7fd6' }));
  }).catch(() => {});
  // Pausing is the only place you can bail out of a fight, so the way out lives here.
  $('btnQuit').classList.toggle('hidden', mode !== 'fight');
  $('btnWipe').classList.toggle('hidden', mode === 'fight');
  resetWipeBtn();
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
  const unlocked = unlockedFightTracks(reached, S.theme).map((t) => t.id);
  const kept = unlocked.filter((id) => !(S.musicOff || {})[id]);
  return kept.length ? kept : unlocked;
}

/** The four tracks that play for a reason rather than by rotation. */
const SET_PIECES = [['menu', 'menu'], ['boss', 'champion'], ['final', 'final fight'], ['victory', 'victory']];

/**
 * The soundtrack as a collection: what is playing now, what is unlocked, and which ones
 * you have switched off. Tapping a row auditions it.
 */
function musicList() {
  const reached = reachedLevel(null);
  const now = audio.current();
  const off = S.musicOff || {};
  const live = fightPool(reached);
  const rows = poolFor(S.theme).map((t) => {
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
  // The set pieces are not part of the rotation and cannot be switched off — a fight has to
  // sound like something — but they are half of what you hear, so they belong in the list.
  const setRows = SET_PIECES.map(([role, label]) => {
    const id = roleTrack(S.theme, role);
    const playing = now === id;
    return `<div class="r trackrow${playing ? ' playing' : ''}" data-play="${id}">` +
      `<span>${playing ? '▶' : '♪'} ${TRACK_NAME[id] || id}</span><b>${label}</b></div>`;
  }).join('');
  const n = unlockedFightTracks(reached, S.theme).length;
  const nowName = TRACK_NAME[now];
  const pool = poolFor(S.theme);
  const total = pool.length + SET_PIECES.length;
  return `<div class="musichead">${S.theme === 'dark' ? 'AFTER DARK' : 'SOUNDTRACK'} — ${n + SET_PIECES.length} of ${total} tracks</div>` +
    (nowName && S.settings.music
      ? `<div class="nowplaying">NOW PLAYING <b>${nowName}</b></div>`
      : `<div class="nowplaying off">music is off</div>`) +
    `<div class="musichead">FIGHTS — ${n} of ${pool.length}</div>` +
    rows +
    `<div class="musichead">SET PIECES</div>` +
    setRows;
}

function openHelp() {
  const owned = MOVES().filter((m) => (S.moves[m.id] || {}).owned);
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
  applyTheme();
  audio.setMusic(S.settings.music);
  audio.setSfx(S.settings.sfx);
  haptic.setEnabled(S.settings.haptics);
  input.hand = S.settings.hand;
}

// ── boot ─────────────────────────────────────────────────────────────────
const BOOT_MSGS = ['sharpening pencils…', 'ruling lines…', 'tying bandanas…', 'warming up the ragdolls…', 'ready'];
async function boot() {
  if (!DEV) parkPaid();
  resize();
  show('boot');
  let step = 0;
  const bump = (pct, msg) => { $('bootbar').firstElementChild.style.width = pct + '%'; $('bootmsg').textContent = msg; };

  bump(10, BOOT_MSGS[0]);
  await document.fonts.ready.catch(() => {});
  bump(35, BOOT_MSGS[1]);
  await new Promise((r) => setTimeout(r, 40));
  ensureSheet(LEVELS()[Math.min(TOTAL_LEVELS - 1, S.level)]);
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
    track('start', S);
    void arena.probe();
    if (DEV && qs.get('level')) startFight(Math.min(TOTAL_LEVELS - 1, +qs.get('level')));
  };
  if (DEV && (qs.get('auto') || qs.get('shot'))) setTimeout(() => $('startBtn').click(), 120);
}
boot().catch((err) => {
  // Surfaced by the inline handler in index.html; rethrow so it is reported, not swallowed.
  setTimeout(() => { throw err; });
});

// The online arena. Its button stays hidden unless the arena server answers (net/panel.js).
const arena = mountArena({
  dev: DEV, lan: familyAccess.available && !DEMO, click, overlay,
  getSave: () => S, account: () => account,
  openUpgrade: () => openUpgrade(null, 'pass'),
  startNetFight: (f) => {
    match = f.match;
    ensureSheet(f.sheetLevel);
    if (mode !== 'fight') { setMode('fight'); audio.play(roleTrack('light', 'boss')); }
  },
  endNetFight: () => { if (match && (match.net || match.ghost)) { match = null; setMode('hub'); refreshHub(); } },
  currentMatch: () => match,
});

// Special events: the EVENTS button and panel. Offline it plays locally; with the arena server
// it syncs and shows rivals (js/events/ui.js, server/events.go).
const eventsUI = mountEvents({
  dev: DEV, lan: familyAccess.available && !DEMO, click, overlay, account: () => account,
  getSave: () => S, persist: () => persist(S), openUpgrade: () => openUpgrade(null, 'pass'),
  hasPass: () => (DEV && qs.get('evpass') === '0' ? false : DEV || familyAccess.active || !!purchases?.passActive),
  paid: () => (DEV && qs.has('evpaid') ? qs.get('evpaid') === '1' : DEV && qs.get('evpass') === '0' ? false : hasPremium()),
  paidKnown: () => entKnown || paymentsUp === false,
  addInk: (n) => { S.ink += n; persist(S); refreshHub(); },
  // THE TOWER's fights (js/events/towerfight.js): a local Match, ended by the events panel.
  startFight: (m) => { match = m; ensureSheet(m.level); setMode('fight'); audio.play(m.level.kind === 'champion' ? roleTrack(S.theme, 'boss') : fightTrack({ kind: 'fight', idx: 0 })); },
  endFight: () => { if (match && match.tower) { match = null; setMode('hub'); refreshHub(); } },
  currentMatch: () => match,
});

if (DEV) window.__ragdojo = { arena, eventsUI, openUpgrade, get save() { return S; }, get match() { return match; }, startFight, fightTrack, fightPool, setTheme, get LEVELS() { return LEVELS(); }, S };
if (DEV) window.__input = input;

// Paid access never deletes earned progress. Park a CYBER/DEITIES run intact once the answer
// is a definitive "not entitled" (signed out, refunded, lapsed) — never while it is merely
// unknown (still loading, offline, payments down). A later yes walks it back in. DARK is free.
function swapRun(to) {
  S.stash[S.theme] = Object.fromEntries(RUN_KEYS.map(k => [k, S[k]]));
  const run = S.stash[to] || RUN();
  for (const k of RUN_KEYS) S[k] = run[k];
  S.theme = to;
  sheetLevel = -1;
  applyTheme();
}
function parkPaid() {
  if (!isPaid(S.theme) || hasPremium() || !entKnown) return;
  const from = S.theme, back = S.darkUnlocked && S.stash.dark ? 'dark' : 'light';
  swapRun(back);
  S.parkedFrom = from; S.parkedTo = back;
  persist(S);
}
/** True when it moved you. Only from where parking left you; never mid-fight. */
function unparkPaid() {
  const from = S.parkedFrom;
  if (!from || mode === 'fight' || !hasPremium() || !worldOpen(from)) return false;
  const here = S.theme === S.parkedTo;
  S.parkedFrom = S.parkedTo = null;
  if (here) swapRun(from);
  persist(S);
  return here;
}
function applyCloud() {
  if (!pendingCloud) return;
  // Heal using the game's established loader; remote saves contain progress only.
  const was = S;
  S = load(); pendingCloud = null;
  mergeEventsInto(S, was);
  parkPaid();
  match = null; sheetLevel = -1;
  applySettings();
  if (mode === 'hub') setMode('hub');
}
function purchaseStatus(text) { $('purchaseStatus').textContent = text; }
const SOON = `Supporting the developer is coming soon — thank you for looking! Until then ${PAID_NAMES} stay locked, and LIGHT and DARK are free.`;
const DOWN = `Supporting the developer is temporarily unavailable — try again in a little while. Earned progress is kept, and LIGHT and DARK are free.`;
/** Once this device has seen the purchase API answer, an outage is an outage, not "coming soon". */
const PAY_SEEN = 'ragdojo.payseen.v1';
const soon = () => { try { return localStorage.getItem(PAY_SEEN) ? DOWN : SOON; } catch { return SOON; } };
/** A cheap probe of the purchase API; nothing else asks it anything until this says yes. A failure is retried, at most every 20 s unless asked. */
let offerItems = {}, paymentsTest = false, probedAt = 0;
async function probePayments(force = true) {
  if (DEMO || !ACCOUNTS) return false;
  if (!force && paymentsUp === false && Date.now() - probedAt < 20000) return false;
  probedAt = Date.now();
  try {
    const res = await fetch(API + 'offer', { cache: 'no-store' });
    const offer = res.ok ? await res.json() : null;
    offerItems = {};
    paymentsTest = offer?.testMode === true;
    for (const it of (Array.isArray(offer?.items) ? offer.items : []))
      if (it && typeof it.key === 'string' && typeof it.currency === 'string' && it.amount > 0) offerItems[it.key] = it;
    paymentsUp = Object.keys(offerItems).length > 0;
    if (paymentsUp) try { localStorage.setItem(PAY_SEEN, '1'); } catch {}
    return paymentsUp ? offer : false;
  } catch { paymentsUp = false; return false; }
}
function money(it) {
  const f = new Intl.NumberFormat('en', { style: 'currency', currency: it.currency.toUpperCase() });
  return f.format(it.amount / 10 ** f.resolvedOptions().maximumFractionDigits);
}
/** Buttons follow what the server sells and what this account already has. */
function paintOffers() {
  upgradeContext();
  const sup = offerItems.ragdojo_supporter, mon = offerItems.br8t_pass_monthly, yr = offerItems.br8t_pass_yearly;
  const signedIn = !!account?.auth.signedIn, p = purchases;
  const passLive = !!p?.pass && !['canceled', 'incomplete_expired'].includes(p.pass.status);
  const manageable = passLive && p.pass.manage !== false;
  $('btnCheckout').classList.toggle('hidden', !sup);
  if (sup) {
    $('btnCheckout').textContent = p?.supporter ? 'SUPPORTER ✓ THANK YOU' : `SUPPORT${paymentsTest ? ' (TEST)' : ''} · ${money(sup)}`;
    $('btnCheckout').disabled = !signedIn || !!p?.supporter;
    $('priceSupporter').textContent = `— ${money(sup)} once.`;
  }
  $('btnPass').classList.toggle('hidden', !mon && !yr);
  $('btnPassYear').classList.toggle('hidden', !mon || !yr || !!p?.passActive);
  const first = mon || yr;
  if (first) {
    $('btnPass').textContent = p?.passActive ? 'BR8T PASS ✓ ACTIVE' : `BR8T PASS${paymentsTest ? ' (TEST)' : ''} · ${money(first)}/${mon ? 'MONTH' : 'YEAR'}`;
    $('btnPass').disabled = !signedIn || !!p?.passActive || passLive;
    $('pricePass').textContent = mon && yr ? `— from ${money(mon)}/month, or ${money(yr)}/year.` : `— ${money(first)}/${mon ? 'month' : 'year'}.`;
  }
  if (yr) { $('btnPassYear').textContent = `OR ${money(yr)}/YEAR`; $('btnPassYear').disabled = !signedIn || passLive; }
  $('btnManage').classList.toggle('hidden', !signedIn || !manageable);
  $('btnRestore').classList.remove('hidden');
}
function ownedMessage() {
  const p = purchases, endTs = p?.pass?.cancelAt || p?.pass?.periodEnd, end = endTs ? new Date(endTs * 1000).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  if (p?.passActive && p.pass?.status === 'gift') return `Your gift br8t Pass is active until ${end} — enjoy! ${PAID_NAMES} open as you earn them; earned progress is kept.`;
  if (p?.passActive) return `Your br8t Pass is active${(p.pass?.cancelAtPeriodEnd || p.pass?.cancelAt) && end ? ` until ${end} (cancelled, no more charges)` : ''} — thank you! ${PAID_NAMES} open as you earn them; earned progress is kept.`;
  if (p?.supporter) return `Thank you — your support is restored. ${PAID_NAMES} open as you earn them; earned progress is kept.`;
  if (p?.pass?.status === 'past_due' || p?.pass?.status === 'unpaid') return 'Your br8t Pass renewal did not go through. Use Manage subscription to update your card; earned progress is kept.';
  return 'No purchase found on this account. Sign in with the same Google or email account used at checkout.';
}
async function redeemCode() {
  const code = $('giftCode').value.trim(), say = (t) => { $('giftStatus').textContent = t; };
  if (!code) { say('Type the code first.'); return; }
  if (!purchases || !account?.auth.signedIn) { say('Sign in with the account button first, so the Pass goes on your account.'); return; }
  $('btnRedeem').disabled = true;
  try {
    const until = await purchases.redeem(code);
    $('giftCode').value = '';
    say(`Done! Your br8t Pass is active until ${new Date(until * 1000).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}.`);
    paintOffers();
    refreshHub();
  } catch (e) { say(e.message); }
  $('btnRedeem').disabled = false;
}
/** True when the server gave a definitive answer. */
async function restorePurchase() {
  if (!purchases) { purchaseStatus('Use the account button to sign in on games.br8t.com.'); return false; }
  if (paymentsUp === false) await probePayments(false);
  if (!paymentsUp) { if (paymentsUp === false && !familyAccess.available) purchaseStatus(soon()); return false; }
  try {
    await purchases.refresh();
    purchaseStatus(ownedMessage());
    paintOffers();
    refreshHub();
    return true;
  } catch (e) { purchaseStatus(e.message); return false; }
}
/** The world the player was reaching for when the upgrade opened, so family/restore can follow through. */
let upgradeFor = null, upgradeWhy = null;
/**
 * `why === 'pass'`: opened from something only the br8t Pass unlocks (a Pass event, the online
 * allowance), so the Pass leads and the copy says what each product actually opens.
 */
function upgradeContext() {
  const pass = upgradeWhy === 'pass';
  const sup = offerItems.ragdojo_supporter;
  $('premiumTitle').textContent = pass ? 'BR8T PASS' : 'SUPPORT THE DEV';
  $('premiumWhy').classList.toggle('hidden', !pass);
  $('premiumWhy').textContent = pass ? `Pass events and unlimited online battles need the br8t Pass. Support${sup ? ` (${money(sup)})` : ''} opens CYBER + DEITIES and 10 online battles a day.` : '';
  const [supOffer, passOffer] = ['priceSupporter', 'pricePass'].map((id) => $(id).closest('.offer'));
  if (pass) supOffer.before(passOffer); else passOffer.before(supOffer);
  if (pass) $('btnCheckout').before($('btnPass'), $('btnPassYear')); else $('btnPass').before($('btnCheckout'));
}
function openUpgrade(forWorld = null, why = null) {
  upgradeFor = forWorld;
  upgradeWhy = why;
  upgradeContext();
  hideNudge();
  track('upgrade_view', S);
  overlay('premium');
  $('premiumHome').classList.toggle('hidden', familyAccess.available || (!DEMO && ACCOUNTS));
  $('btnFamilySkip').classList.toggle('hidden', !familyAccess.available);
  $('btnFamilySkip').disabled = familyAccess.active;
  $('btnFamilySkip').textContent = familyAccess.active ? 'FAMILY ACCESS ENABLED' : 'Skip payment — I’m a family member';
  for (const id of ['btnRestore', 'btnManage', 'btnPass', 'btnPassYear']) $(id).classList.add('hidden');
  $('btnCheckout').classList.toggle('hidden', DEMO || !ACCOUNTS);
  $('btnCheckout').textContent = 'SUPPORT · COMING SOON';
  $('btnCheckout').disabled = true;
  purchaseStatus(DEMO ? `LIGHT and DARK are free here. Supporting the developer (and the ${PAID_NAMES} thank-you) lives on games.br8t.com.`
    : ACCOUNTS ? 'Checking the upgrade…' : SOON);
  if (familyAccess.available) purchaseStatus(familyAccess.active
    ? `Family access enabled on this network. Win a THUG run to open CYBER, then a SIMULANT run for DEITIES.`
    : `Playing on a 192.* address? Family members can skip payment here. ${PAID_NAMES} still open by winning THUG, then SIMULANT.`);
  if (DEMO || !ACCOUNTS) return;
  void probePayments().then(async offer => {
    if (!$('premium').classList.contains('show')) return;
    if (!offer) { if (!familyAccess.available) purchaseStatus(soon()); return; }
    paintOffers();
    if (!familyAccess.available) purchaseStatus(`${paymentsTest ? 'Test mode: no real money moves. ' : ''}Sign in using the account button (Google or email) before supporting, subscribing or restoring.`);
    if (account?.auth.signedIn) await restorePurchase();
  });
}
$('btnUpgrade').onclick = () => { click(); openUpgrade(); };
$('btnPremiumClose').onclick = () => { click(); overlay(null); };
$('btnFamilySkip').onclick = () => {
  if (!familyAccess.grant()) return;
  click(); unparkPaid(); refreshHub();
  if (upgradeFor && worldOpen(upgradeFor)) { overlay(null); setTheme(upgradeFor); }
  else {
    $('btnFamilySkip').disabled = true;
    $('btnFamilySkip').textContent = 'FAMILY ACCESS ENABLED';
    purchaseStatus('Family access enabled on this network. Win a THUG run to open CYBER, then a SIMULANT run for DEITIES.');
  }
};
$('premiumHome').href = HOME + '?from=itch';
$('btnRestore').onclick = () => { click(); void restorePurchase(); };
const buy = (btn, product) => async () => {
  click();
  btn.disabled = true;
  try { location.assign(await purchases.checkout(typeof product === 'function' ? product() : product, { visitor: visitor(), source })); }
  catch (e) { purchaseStatus(e.message); paintOffers(); }
};
$('btnCheckout').onclick = buy($('btnCheckout'), 'ragdojo_supporter');
$('btnPass').onclick = buy($('btnPass'), () => offerItems.br8t_pass_monthly ? 'br8t_pass_monthly' : 'br8t_pass_yearly');
$('btnPassYear').onclick = buy($('btnPassYear'), 'br8t_pass_yearly');
$('btnManage').onclick = async () => {
  click();
  $('btnManage').disabled = true;
  try { location.assign(await purchases.portal()); }
  catch (e) { purchaseStatus(e.message); $('btnManage').disabled = false; }
};

/**
 * DARK is free; this is the gentle ask. Never a modal, never mid-fight, never for supporters,
 * and at most once every two days on this device.
 */
const NUDGE_KEY = 'ragdojo.nudge.v1';
const NUDGE_GAP = 2 * 24 * 3600 * 1000;
let nudgeT = null;
function maybeNudge() {
  if (hasPremium() || mode !== 'hub' || S.theme !== 'dark') return;
  let last = 0;
  try { last = +localStorage.getItem(NUDGE_KEY) || 0; } catch {}
  if (Date.now() - last < NUDGE_GAP) return;
  try { localStorage.setItem(NUDGE_KEY, String(Date.now())); } catch {}
  $('nudge').classList.remove('hidden');
  clearTimeout(nudgeT);
  nudgeT = setTimeout(hideNudge, 14000);
}
function hideNudge() { clearTimeout(nudgeT); $('nudge').classList.add('hidden'); }
$('btnNudge').onclick = () => { click(); openUpgrade(); };
$('btnNudgeClose').onclick = () => { click(); hideNudge(); };
// Backgrounded: the music stops (an HTMLAudio track otherwise plays on in a pocket) and a
// campaign fight pauses itself. Online rounds cannot pause; the other players are still there.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    audio.suspend?.();
    if (mode === 'fight' && match && !match.net && !match.demo && !document.querySelector('.panel-screen.show')) openSettings();
  } else audio.wake?.();
});
// Every user gesture gives a held-back AudioContext (iOS 'interrupted') or a blocked track another go.
for (const ev of ['pointerup', 'touchend', 'keydown']) addEventListener(ev, () => audio.kick?.(), { capture: true, passive: true });
// Another tab saved newer progress: adopt it at the next safe moment rather than overwrite it.
addEventListener('storage', (e) => {
  if (e.key !== KEY || e.newValue == null) return;
  pendingCloud = true;
  if (mode !== 'fight') { applyCloud(); refreshHub(); }
});
$('btnCloudLocal').onclick = () => void account?.sync.choose('local');
$('btnCloudRemote').onclick = () => void account?.sync.choose('remote');
$('btnCloudRetry').onclick = () => { if (!account) return; if (account.sync.conflict) { openSettings(); return; } void account.sync.connect(account.auth.signedIn ? account.auth.user.uid : null); };

if (SIGNIN && !DEV) {
  import('./cloud.js?v=20261015-gf').then(({ connectCloud }) => {
    account = connectCloud({
      canPester: () => mode === 'hub' || !!document.querySelector('#results.show, #victory.show'),
      adopt: save => { pendingCloud = save; if (mode !== 'fight') { applyCloud(); refreshHub(); } },
      status: text => { $('cloudStatus').textContent = text; },
      conflict: value => {
        $('cloudChoice').classList.toggle('hidden', !value);
        if (value) {
          const describe = data => `${worldOf(data?.save?.theme).name}, fight ${(data?.save?.level || 0) + 1}, ${data?.save?.wins || 0} wins`;
          $('cloudSummary').textContent = `This device: ${describe(value.local)}. Cloud: ${describe(value.remote)}.`;
          $('btnCloudRetry').textContent = 'CHOOSE CLOUD SAVE';
          if (mode !== 'fight') openSettings();
        } else $('btnCloudRetry').textContent = 'RETRY CLOUD SYNC';
      },
    });
    if (!ACCOUNTS) return;
    purchases = new Purchases(account.auth, fetch, () => {
      // Only a definitive answer gets here. Never pull a fight out from under the player.
      entKnown = true;
      parkOwed = !hasPremium() && isPaid(S.theme);
      if (parkOwed && mode === 'hub') { parkOwed = false; parkPaid(); startDemo(); }
      else if (unparkPaid() && mode === 'hub') startDemo();
      refreshHub();
    });
    // Probe once; ownership checks only start if the purchase API actually answers.
    void probePayments().then(() => restorePurchase());
    account.auth.onChange(() => { void restorePurchase(); });
    // Returning from Checkout is only a prompt to check the server, never proof of payment.
    if (qs.get('checkout') === 'success') {
      openUpgrade();
      let attempts = 0;
      const poll = setInterval(() => {
        if (purchases.owned || ++attempts > 12) { clearInterval(poll); return; }
        void restorePurchase();
      }, 2500);
    } else if (qs.get('checkout') === 'cancel') { openUpgrade(); purchaseStatus('Checkout cancelled. Your progress is unchanged.'); }
    // Handled once: a reload or a shared link must not reopen the upgrade.
    if (qs.has('checkout')) {
      const u = new URL(location.href);
      u.searchParams.delete('checkout');
      try { history.replaceState(history.state, '', u.pathname + u.search + u.hash); } catch {}
    }
    addEventListener('focus', () => { void restorePurchase(); });
    // Owners are re-checked every 2 minutes; a failed check retries sooner (ownerPollNext).
    let pollMs = 120000, failing = false;
    const poll = () => setTimeout(async () => {
      // A purchase API that failed its probe is probed again here, not written off for the session.
      const ok = (purchases.owned || purchases.unknown || paymentsUp === false) ? await restorePurchase() : true;
      pollMs = ownerPollNext(pollMs, ok, failing);
      failing = !ok;
      poll();
    }, pollMs);
    poll();
  }).catch(() => { $('cloudStatus').textContent = 'Accounts unavailable. Play is saved on this device.'; });
}
