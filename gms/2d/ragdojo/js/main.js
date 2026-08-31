// Boot, loop, screens, progression.

import {
  SHEET_W, SHEET_H, GROUND_Y, LEVELS, RANKS, TOTAL_LEVELS,
  playerRankAt, MOVES, PERKS, moveStats, derive,
} from './config.js';
import { drawDesk, sheetShadow } from './paper.js';
import { buildArena } from './arena.js';
import { drawFighter, drawShadow } from './draw.js';
import { Match } from './match.js';
import { Input } from './input.js';
import { drawHUD, handText, FONT, FONT_B } from './ui.js';
import { load, save as persist, wipe, DEFAULT } from './save.js';
import * as audio from './audio.js';
import { buildShop } from './shop.js';
import { MUSIC } from './music.js';

const qs = new URLSearchParams(location.search);
const cvs = document.getElementById('game');
const ctx = cvs.getContext('2d', { alpha: false });
const $ = (id) => document.getElementById(id);

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
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 120));

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
    match.playerSpecial(mv.id);
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
  const level = LEVELS[levelIdx];
  ensureSheet(level);
  match = new Match({
    level, save: S, bully, autoplay: !!qs.get('autoplay'),
    onEnd: (result, m) => finishFight(result, m),
  });
  match.say(bully ? 'BULLY TIME' : level.kind === 'final' ? 'FINAL PAGE' :
    level.kind === 'champion' ? 'CHAMPION' : 'FIGHT!', 1.8);
  setMode('fight');
  audio.play(level.kind === 'final' ? 'final' : level.kind === 'champion' ? 'boss' :
    level.tier >= 6 ? 'fight3' : level.tier >= 3 ? 'fight2' : 'fight1');
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

  const wasFinal = L.kind === 'final';
  if (won) {
    if (m.bully) S.bullyLevel = Math.min(TOTAL_LEVELS, L.idx + 1);
    else S.level = Math.min(TOTAL_LEVELS - 1, L.idx + 1);
    if (wasFinal && !m.bully) S.completed = true;
  }
  persist(S);
  pendingResult = { result, m, earned, bonus, rankGap, wasFinal, bully: m.bully };

  if (won && wasFinal && !m.bully) { showVictory(m); return; }
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
  ].join('');
  $('btnResult').textContent = won ? 'CONTINUE' : 'TRY AGAIN';
  overlay('results');
  audio.play('menu');
  if (won) audio.sfx.bell();
}
const row = (k, v) => `<div class="r"><span>${k}</span><b>${v}</b></div>`;

function showVictory(m) {
  const totalScore = S.score;
  $('vicBody').innerHTML = [
    row('Fights won', S.wins),
    row('Knockouts', S.kos),
    row('Longest launch', `${Math.round(S.biggestLaunch / 10)} m`),
    row('Ink collected', S.totalInk),
    row('Best single fight', Math.round(S.best)),
    `<div class="r big"><span>FINAL SCORE</span><b>${Math.round(totalScore)}</b></div>`,
  ].join('');
  overlay('victory');
  audio.play('victory');
  audio.sfx.bell();
  // Confetti of paper scraps over the celebrating figure.
  if (match) {
    for (let i = 0; i < 90; i++) {
      setTimeout(() => match && match.fx.spawn(
        200 + Math.random() * (SHEET_W - 400), -40, 0, 120, 'scrap', 1,
        { spread: 130, size: 7, life: 4 }), i * 45);
    }
  }
}

// ── hub ──────────────────────────────────────────────────────────────────
function refreshHub() {
  const bullyMode = S.bully;
  const idx = Math.min(TOTAL_LEVELS - 1, bullyMode ? S.bullyLevel : S.level);
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
  audio.sfx.click();
  startFight(S.bully ? S.bullyLevel : S.level, S.bully);
};
$('btnShop').onclick = () => { audio.sfx.click(); openShop(); };
$('btnShopClose').onclick = () => { audio.sfx.click(); overlay(null); refreshHub(); };
$('btnSettings').onclick = () => { audio.sfx.click(); openSettings(); };
$('btnSetClose').onclick = () => { audio.sfx.click(); overlay(null); };
$('btnHelp').onclick = () => { audio.sfx.click(); openHelp(); };
$('btnHelpClose').onclick = () => { audio.sfx.click(); overlay(null); };
$('btnPause').onclick = () => { audio.sfx.click(); openSettings(); };
$('btnResult').onclick = () => {
  audio.sfx.click();
  overlay(null);
  const R = pendingResult;
  if (R && R.result === 'lose') startFight(R.m.level.idx, R.bully);
  else { setMode('hub'); refreshHub(); }
};
$('btnAgain').onclick = () => {
  audio.sfx.click();
  const keep = { best: S.best, completed: true };
  S = { ...DEFAULT(), ...keep, newGamePlus: (S.newGamePlus || 0) + 1 };
  persist(S); overlay(null); setMode('hub'); refreshHub();
};
$('btnBully').onclick = () => {
  audio.sfx.click();
  S.bully = true; S.bullyLevel = 0;
  for (const m of MOVES) S.moves[m.id] = { owned: true, power: 5, cd: 5 };
  for (const p of PERKS) S.perks[p.id] = p.max;
  persist(S); overlay(null); setMode('hub'); refreshHub();
};
$('btnFull').onclick = () => {
  audio.sfx.click();
  const d = document.documentElement;
  if (!document.fullscreenElement) (d.requestFullscreen || d.webkitRequestFullscreen || (() => {})).call(d);
  else (document.exitFullscreen || document.webkitExitFullscreen || (() => {})).call(document);
};
$('btnMusic').onclick = () => {
  S.settings.music = !S.settings.music;
  audio.setMusic(S.settings.music);
  persist(S); refreshHub();
  audio.sfx.click();
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
    `<div class="toggle"><span>Stick side</span><button class="buy" data-fn="hand">${S.settings.hand === 'right' ? 'LEFT STICK' : 'RIGHT STICK'}</button></div>`;
  rows.querySelectorAll('button').forEach((b) => {
    b.onclick = () => {
      const f = b.dataset.fn;
      if (f === 'hand') S.settings.hand = S.settings.hand === 'right' ? 'left' : 'right';
      else S.settings[f] = !S.settings[f];
      applySettings();
      persist(S);
      openSettings();
      audio.sfx.click();
    };
  });
  overlay('settings');
}
function openHelp() {
  const owned = MOVES.filter((m) => (S.moves[m.id] || {}).owned);
  $('helpRows').innerHTML =
    `<div class="r"><span>Left thumb</span><b>move · jump · duck</b></div>` +
    `<div class="r"><span>Right thumb — tap</span><b>punch (tap again to combo)</b></div>` +
    `<div class="r"><span>Right thumb — draw</span><b>special move</b></div>` +
    `<div class="r"><span>Keyboard</span><b>A/D move · W jump · S duck · J hit · 1-8 specials</b></div>` +
    `<hr style="border:none;border-top:1px dashed rgba(32,36,44,.3);margin:8px 0">` +
    owned.map((m) => `<div class="r"><span><b style="font-size:24px">${m.glyph}</b> ${m.name}</span><b>${m.hint}</b></div>`).join('');
  overlay('help');
}
function applySettings() {
  audio.setMusic(S.settings.music);
  audio.setSfx(S.settings.sfx);
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
boot();

window.__ragdojo = { get save() { return S; }, get match() { return match; }, startFight, LEVELS, S };
