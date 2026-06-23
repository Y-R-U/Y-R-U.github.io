// main.js — bootstrap: canvas/DPI/resize, app state machine, game loop.

import { Input } from './input.js';
import { Audio } from './audio.js';
import { Hud } from './hud.js';
import { Menu } from './menu.js';
import { Game } from './game.js';
import { Starfield } from './starfield.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha: false });
const uiRoot = document.getElementById('ui');

const input = new Input(canvas);
const audio = new Audio();
const hud = new Hud();
const menuBg = new Starfield();
const menuCam = { x: 1000, y: 1000, zoom: 1, sx: 0, sy: 0 };

let W = 0, H = 0, dpr = 1;
let insets = { top: 0, right: 0, bottom: 0, left: 0 };
let game = null;
let app = { scene: 'menu', paused: false, resultsShown: false };
let lastParams = { mode: 'deathmatch', ship: 'warbird', diff: 0.62 };

input.enabled = false;

// ---- safe-area probe ----
const probe = document.createElement('div');
probe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;' +
  'padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);';
document.body.append(probe);

function readInsets() {
  const cs = getComputedStyle(probe);
  insets = {
    top: parseFloat(cs.paddingTop) || 0,
    right: parseFloat(cs.paddingRight) || 0,
    bottom: parseFloat(cs.paddingBottom) || 0,
    left: parseFloat(cs.paddingLeft) || 0,
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
const menu = new Menu(uiRoot, { onStart: startGame });
menu.bindInGame((a) => {
  if (a === 'pause') { if (game && game.state === 'playing') togglePause(); }
  else if (a === 'scoresOn') input.showScores = true;
  else if (a === 'scoresOff') input.showScores = false;
});

function startGame(mode, ship, diff) {
  lastParams = { mode, ship, diff };
  game = new Game({ input, audio, modeKey: mode, shipKey: ship, difficulty: diff });
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
function doMute() { const m = audio.toggleMute(); menu.setMuteLabel(m); }

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
