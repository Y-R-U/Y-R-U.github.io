// main.js — bootstrap: canvas/DPI/resize, app state machine, game loop.

import { Input } from './input.js';
import { Audio } from './audio.js';
import { Hud } from './hud.js';
import { Menu } from './menu.js';
import { Game } from './game.js';
import { Starfield } from './starfield.js';
import { loadCareer, loadSettings, saveSettings, recordMatch, resetCareer } from './save.js';

const QS = new URLSearchParams(location.search);
// `?test` keeps automated / soak runs hermetic: no account layer, no avatar.
const TEST = QS.has('test') || QS.has('soak');

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha: false });
const uiRoot = document.getElementById('ui');

const input = new Input(canvas);
const audio = new Audio();
const hud = new Hud();
const menuBg = new Starfield();
const menuCam = { x: 1000, y: 1000, zoom: 1, sx: 0, sy: 0 };

// ---- durable save (local first; the account layer only mirrors these) ----
const settings = loadSettings();
audio.setVolume(settings.volume);
audio.setMuted(settings.muted);
input.setHanded(settings.handed);

let W = 0, H = 0, dpr = 1;
let insets = { top: 0, right: 0, bottom: 0, left: 0, account: 0 };
let game = null;
let app = { scene: 'menu', paused: false, resultsShown: false };
let lastParams = { mode: settings.lastMode, ship: settings.lastShip, diff: 0.62 };

input.enabled = false;

// ---- optional br8t account layer -------------------------------------------
// Fire-and-forget: if it can't load (offline, blocked, file://) the game plays
// on with its purely local save and the only thing missing is the avatar.
let cloudMod = null;
if (!TEST) {
  import('./cloud.js')
    .then(m => { cloudMod = m; window.CrazySpaceCloud = m; resize(); })
    .catch(() => { /* play on locally */ });
}

// ---- safe-area probe ----
const probe = document.createElement('div');
probe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;' +
  'padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);';
document.body.append(probe);

// How much top-right room the br8t account avatar takes. 0 when the account
// layer isn't loaded, thanks to the fallback — the canvas HUD reads this the
// same way CSS furniture would use calc(… + var(--br8t-account-space, 0px)).
function accountSpace() {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--br8t-account-space');
    return parseFloat(v) || 0;
  } catch (e) { return 0; }
}

function readInsets() {
  const cs = getComputedStyle(probe);
  insets = {
    top: parseFloat(cs.paddingTop) || 0,
    right: parseFloat(cs.paddingRight) || 0,
    bottom: parseFloat(cs.paddingBottom) || 0,
    left: parseFloat(cs.paddingLeft) || 0,
    account: accountSpace(),
  };
}

function resize() {
  W = window.innerWidth; H = window.innerHeight;
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  readInsets();
  input.setInsets(insets);
  input.layout(W, H);
  if (game) game.setViewport(W, H);
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 120));

// ---- audio unlock on first gesture ----
function unlock() { audio.init(); audio.resume(); }
window.addEventListener('pointerdown', () => audio.resume(), { passive: true });
window.addEventListener('pointerdown', unlock, { once: true });
window.addEventListener('keydown', unlock, { once: true });

// ---- menu wiring ----
const menu = new Menu(uiRoot, {
  onStart: startGame,
  settings,
  getCareer: () => loadCareer(),
  onResetCareer: () => resetCareer(),
  onSettings: (patch) => {
    saveSettings(patch);
    if ('volume' in patch) { audio.setVolume(settings.volume); audio.init(); audio.resume(); audio.click(); }
    if ('muted' in patch) audio.setMuted(settings.muted);
    if ('handed' in patch) { input.setHanded(settings.handed); input.layout(W, H); }
  },
});
menu.bindInGame((a) => {
  if (a === 'pause') { if (game && game.state === 'playing') togglePause(); }
  else if (a === 'scoresOn') input.showScores = true;
  else if (a === 'scoresOff') input.showScores = false;
});

function startGame(mode, ship, diff) {
  lastParams = { mode, ship, diff };
  game = new Game({ input, audio, modeKey: mode, shipKey: ship, difficulty: diff, playerName: settings.name });
  game.setViewport(W, H);
  game.onEnd = () => { if (!app.resultsShown) setTimeout(showResults, 1400); };
  app.scene = 'game'; app.paused = false; app.resultsShown = false;
  input.reset(); input.enabled = true; input.showScores = false; input.layout(W, H);
  menu.hideAll(); menu.hidePause(); menu.hideResults(); menu.showInGameButtons(true);
  unlock();
}

function showResults() {
  if (app.resultsShown || !game) return;
  app.resultsShown = true;

  // The one place the career is written, and the one place matchCompleted()
  // fires: a FINISHED match, on the results screen. Never mid-match.
  try { recordMatch(game.matchSummary()); } catch (e) { console.warn('career save failed', e); }
  if (cloudMod) cloudMod.matchFinished();

  menu.showInGameButtons(false);
  menu.showResults(
    { winner: game.winnerText || 'Match Over', modeName: game.mode.name, rows: game.scoreboard() },
    (a) => {
      menu.hideResults();
      if (a === 'rematch') startGame(lastParams.mode, lastParams.ship, lastParams.diff);
      else quitToMenu();
    });
}

function quitToMenu() {
  game = null; app.scene = 'menu'; app.paused = false; app.resultsShown = false;
  input.enabled = false; input.showScores = false;
  menu.showInGameButtons(false); menu.hidePause(); menu.show('title');
}

function togglePause() {
  app.paused = !app.paused;
  if (app.paused) { menu.showInGameButtons(false); input.reset(); menu.setMuteLabel(audio.muted); menu.showPause(handlePause); }
  else { menu.hidePause(); menu.showInGameButtons(true); }
}
function handlePause(a) {
  if (a === 'resume') togglePause();
  else if (a === 'mute') doMute();
  else if (a === 'restart') { app.paused = false; menu.hidePause(); startGame(lastParams.mode, lastParams.ship, lastParams.diff); }
  else if (a === 'quit') { app.paused = false; menu.hidePause(); quitToMenu(); }
}
function doMute() {
  const m = audio.toggleMute();
  menu.setMuteLabel(m);
  saveSettings({ muted: m });
}

// ---- test / soak hooks ------------------------------------------------------
// Used by the headless CDP suite; harmless in normal play.
window.__crazyspace = {
  get game() { return game; },
  get app() { return app; },
  get insets() { return insets; },
  get cloudLoaded() { return !!cloudMod; },
  settings,
  career: loadCareer,
  startGame,
  showResults,
  endMatch: (text = 'Test Over') => { if (game) game.endMatch(text); },
  quitToMenu,
  menu,
  input,
  step: (dt = 1 / 60, n = 1) => { for (let i = 0; i < n; i++) if (game) game.update(dt); },
};

// ---- main loop ----
let last = performance.now();
function frame(ts) {
  let dt = (ts - last) / 1000;
  last = ts;
  if (!(dt > 0)) dt = 0; if (dt > 0.05) dt = 0.05;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  if (app.scene === 'game' && game) {
    if (input.consumePressed('pause') && game.state === 'playing') togglePause();
    if (input.consumePressed('mute')) doMute();
    if (!app.paused) game.update(dt);
    game.render(ctx, W, H);
    hud.render(ctx, game, W, H, insets, input);
    if (!app.paused && game.state === 'playing') input.renderControls(ctx);
  } else {
    menuCam.x += 16 * dt; menuCam.y += 6 * dt;
    menuBg.render(ctx, menuCam, W, H);
  }
  requestAnimationFrame(frame);
}

resize();
menu.show('title');
requestAnimationFrame(frame);
