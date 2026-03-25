/**
 * main.js — Warlords entry point.
 * Bootstraps all modules, wires up events, runs the game loop.
 */

import { World }       from './game/world.js';
import { TurnManager } from './game/turn.js';
import { Renderer }    from './engine/renderer.js';
import { Camera }      from './engine/camera.js';
import { InputHandler }from './engine/input.js';
import { GameState }   from './engine/state.js';
import { AIPlayer }    from './ai/ai.js';
import { HUD }         from './ui/hud.js';
import { FACTIONS }    from './data/factions.js';

// =====================================================================
// DOM element references
// =====================================================================
const $ = id => document.getElementById(id);

const el = {
  loadingScreen:    $('loading-screen'),
  loaderFill:       $('loader-fill'),
  loaderText:       $('loader-text'),
  mainMenu:         $('main-menu'),
  setupScreen:      $('setup-screen'),
  howToPlay:        $('how-to-play'),
  gameContainer:    $('game-container'),
  gameOver:         $('game-over'),
  gameOverTitle:    $('gameover-title'),
  gameOverText:     $('gameover-text'),
  canvas:           $('gameCanvas'),
  turnLabel:        $('turn-label'),
  factionDot:       $('turn-faction-icon'),
  goldDisplay:      $('gold-display'),
  endTurnBtn:       $('btn-end-turn'),
  infoContent:      $('info-content'),
  cityPanel:        $('city-panel'),
  cityPanelContent: $('city-panel-content'),
  cityCloseBtn:     $('btn-city-close'),
  combatOverlay:    $('combat-overlay'),
  combatAttacker:   $('combat-attacker'),
  combatDefender:   $('combat-defender'),
  combatResult:     $('combat-result'),
  combatOkBtn:      $('btn-combat-ok'),
  messageLog:       $('message-log'),
  flashEl:          $('flash-message'),
  aiIndicator:      $('ai-indicator'),
  factionSelect:    $('faction-select'),
  aiCountSel:       $('ai-count'),
  mapSizeSel:       $('map-size'),
};

// =====================================================================
// Module globals
// =====================================================================
const TILE_SIZE = 32;

let world       = null;
let camera      = null;
let renderer    = null;
let input       = null;
let state       = null;
let turnManager = null;
let hud         = null;
let aiPlayers   = [];
let rafId       = null;
let selectedFaction = 0;

// =====================================================================
// Loading screen animation
// =====================================================================
function fakeLoad() {
  return new Promise(resolve => {
    let pct = 0;
    const step = () => {
      pct += Math.random() * 18 + 5;
      if (pct >= 100) { pct = 100; }
      el.loaderFill.style.width = pct + '%';
      const msgs = [
        'Summoning the realm…', 'Forging armies…', 'Drawing battle maps…',
        'Awakening heroes…', 'Placing cities…', 'Ready for war!',
      ];
      el.loaderText.textContent = msgs[Math.min(Math.floor(pct / 20), msgs.length - 1)];
      if (pct < 100) setTimeout(step, 120 + Math.random() * 100);
      else setTimeout(resolve, 300);
    };
    step();
  });
}

// =====================================================================
// Screen management
// =====================================================================
function showScreen(id) {
  ['loading-screen','main-menu','setup-screen','how-to-play','game-container','game-over']
    .forEach(s => $(s)?.classList.add('hidden'));
  $(id)?.classList.remove('hidden');
}

// =====================================================================
// Faction picker
// =====================================================================
function buildFactionPicker() {
  el.factionSelect.innerHTML = '';
  FACTIONS.forEach((f, i) => {
    const card = document.createElement('div');
    card.className = 'faction-card' + (i === 0 ? ' selected' : '');
    card.innerHTML = `
      <div><span class="faction-dot" style="background:${f.color}"></span>
      <span class="faction-name" style="color:${f.color}">${f.name}</span></div>
      <div class="faction-hero">${f.hero}</div>`;
    card.addEventListener('click', () => {
      document.querySelectorAll('.faction-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      selectedFaction = i;
    });
    el.factionSelect.appendChild(card);
  });
}

// =====================================================================
// Game initialisation
// =====================================================================
function startGame() {
  const numAI    = parseInt(el.aiCountSel.value, 10);
  const mapSize  = parseInt(el.mapSizeSel.value, 10);
  const numPlayers = 1 + numAI;

  // Clamp faction selection
  if (selectedFaction >= numPlayers) selectedFaction = 0;

  showScreen('game-container');

  // Build world
  world = new World(mapSize, numPlayers);

  world.generate();

  // Apply chosen faction to player 0
  const pFaction = FACTIONS[selectedFaction];
  world.players[0].faction = pFaction;

  camera = new Camera(TILE_SIZE, mapSize);
  // Center camera on player capital
  const cap = world.players[0].cities[0];
  if (cap) camera.centerOn(cap.x, cap.y);

  renderer = new Renderer(el.canvas);
  renderer.resize();

  state = new GameState();
  state.setPhase('PLAYING');

  hud = new HUD(el, {
    onEndTurn:  () => onEndTurn(),
    onCityClose:() => { hud.hideCityPanel(); state.openCity = null; },
    onCombatOk: () => onCombatOk(),
  });

  turnManager = new TurnManager(world, {
    onCombat:      (result, atk, def) => onCombat(result, atk, def),
    onMessage:     msg => state.flash(msg),
    onGameOver:    winner => onGameOver(winner),
    onTurnEnd:     player => onTurnChanged(player),
    onCityCapture: (city, player) => {
      world.log(`${player.name} captured ${city.name}!`);
      hud.updateLog(world.messageLog);
    },
  });

  // Build AI players
  aiPlayers = world.players
    .filter(p => !p.isHuman)
    .map(p => new AIPlayer(p, world, turnManager));

  // Input
  input = new InputHandler(el.canvas, camera, {
    onClick:   (tx, ty, btn) => onTileClick(tx, ty, btn),
    onKeyDown: key => onKeyDown(key),
    onWheel:   delta => camera.pan(0, delta * 0.4),
  });

  // Start first turn
  turnManager.startTurn(world.currentPlayer());
  onTurnChanged(world.currentPlayer());

  // Game loop
  if (rafId) cancelAnimationFrame(rafId);
  gameLoop();
}

// =====================================================================
// Game loop
// =====================================================================
function gameLoop() {
  state.tick();
  renderer.render(world, camera, state.uiState());
  renderHUD();
  rafId = requestAnimationFrame(gameLoop);
}

function renderHUD() {
  const player = world.currentPlayer();
  hud.updateTurnInfo(player, world.turn);
  hud.updateLog(world.messageLog);
  hud.updateFlash(state.flashMessage);
}

// =====================================================================
// City panel helper (avoids arguments.callee in strict ES module mode)
// =====================================================================
function openCityPanel(city, player) {
  const armyHere = world.getFriendlyArmiesAt(city.x, city.y, player)[0] ?? null;
  const cbs = {
    onHire: c => {
      const res = turnManager.hireHero(player, c);
      if (!res.ok) state.flash(res.reason);
      hud.updateGold(player);
      openCityPanel(c, player);
    },
    onTrain: (c, unitId) => {
      const target = world.getFriendlyArmiesAt(c.x, c.y, player)[0] ?? null;
      const res = turnManager.trainUnit(player, c, unitId, target);
      if (!res.ok) state.flash(res.reason);
      hud.updateGold(player);
      openCityPanel(c, player);
    },
  };
  hud.showCityPanel(city, player, armyHere, cbs);
  state.openCity = city;
}

// =====================================================================
// Input handling
// =====================================================================
function onTileClick(tx, ty, button) {
  if (!state.isPlaying()) return;
  const player = world.currentPlayer();
  if (!player.isHuman) return;

  const tile      = world.getTile(tx, ty);
  if (!tile) return;

  const city      = tile.city;
  const armies    = tile.armies;
  const myArmies  = armies.filter(a => a.player === player);
  const enemies   = armies.filter(a => a.player !== player);
  const selected  = state.selectedArmy;

  // --- Right-click: deselect ---
  if (button === 2) {
    state.deselect();
    hud.clearInfo();
    hud.hideCityPanel();
    return;
  }

  // --- City management (own city, no army selected) ---
  if (city && city.owner === player && !selected) {
    openCityPanel(city, player);
    return;
  }

  // --- Selected army: try to move ---
  if (selected) {
    if (tx === selected.x && ty === selected.y) {
      // Click same tile: deselect
      state.deselect();
      hud.clearInfo();
      return;
    }

    // Check if destination is reachable
    const key = `${tx},${ty}`;
    if (state.reachable?.has(key) || enemies.length > 0) {
      // Move
      const result = turnManager.moveArmy(selected, tx, ty);
      if (result.moved) {
        // After move, recompute reachable if still has move points
        if (selected.movePoints > 0 && !selected.acted) {
          state.reachable = selected.getReachableTiles(world);
        } else {
          state.deselect();
        }
        hud.updateGold(player);
        hud.updateLog(world.messageLog);
      } else {
        state.flash('Cannot reach that tile');
      }
    } else if (myArmies.length > 0) {
      // Click different army in same faction — switch selection
      state.selectArmy(myArmies[0]);
      state.reachable = myArmies[0].getReachableTiles(world);
      hud.showArmyInfo(myArmies[0]);
    } else {
      state.deselect();
    }
    return;
  }

  // --- No selection: select army ---
  if (myArmies.length > 0) {
    const army = myArmies[0];
    state.selectArmy(army);
    state.reachable = army.getReachableTiles(world);
    hud.showArmyInfo(army);
    hud.hideCityPanel();
    return;
  }

  // --- Click enemy or city for info ---
  if (city) {
    hud.showCityInfo(city);
  } else if (enemies.length > 0) {
    hud.showArmyInfo(enemies[0]);
  } else {
    hud.clearInfo();
    state.deselect();
  }
}

function onKeyDown(key) {
  if (key === 'Escape') {
    state.deselect();
    hud.clearInfo();
    hud.hideCityPanel();
  }
  if (key === 'Enter' || key === ' ') {
    if (world.currentPlayer().isHuman) onEndTurn();
  }
}

// =====================================================================
// Turn management
// =====================================================================
function onEndTurn() {
  if (!world.currentPlayer().isHuman) return;
  state.deselect();
  hud.clearInfo();
  hud.hideCityPanel();
  turnManager.endTurn();
}

function onTurnChanged(player) {
  state.deselect();
  hud.clearInfo();
  hud.hideCityPanel();
  hud.updateTurnInfo(player, world.turn);
  hud.updateGold(player);
  hud.updateLog(world.messageLog);

  if (!player.isHuman) {
    el.aiIndicator.textContent = `${player.name} is thinking…`;
    el.aiIndicator.classList.remove('hidden');
    el.endTurnBtn.disabled = true;
    // Run AI on next frame to allow render update
    requestAnimationFrame(() => {
      setTimeout(() => runAI(player), 80);
    });
  } else {
    el.aiIndicator.classList.add('hidden');
    el.endTurnBtn.disabled = false;
    // Center on player capital if it exists
    const cap = player.cities[0];
    if (cap) camera.centerOn(cap.x, cap.y);
  }
}

function runAI(player) {
  if (world.gameOver) return;
  const ai = aiPlayers.find(a => a.player === player);
  if (ai) {
    ai.takeTurn(); // This calls turnManager.endTurn() internally
  } else {
    turnManager.endTurn();
  }
  el.aiIndicator.classList.add('hidden');
}

// =====================================================================
// Combat callback
// =====================================================================
function onCombat(result, atkName, defName) {
  hud.showCombat(result, atkName, defName);
  state.setPhase('COMBAT_ANIM');
}

function onCombatOk() {
  hud.hideCombat();
  state.setPhase('PLAYING');
  if (world.gameOver && world.winner) {
    onGameOver(world.winner);
  }
  // Resume AI if it was AI's turn
  const cur = world.currentPlayer();
  if (!cur.isHuman && !world.gameOver) {
    // AI continues
  }
}

// =====================================================================
// Game over
// =====================================================================
function onGameOver(winner) {
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  hud.showGameOver(winner);
  showScreen('game-over');
}

// =====================================================================
// Init
// =====================================================================
async function init() {
  // Menu buttons
  $('btn-new-game').addEventListener('click', () => {
    buildFactionPicker();
    showScreen('setup-screen');
  });
  $('btn-how-to').addEventListener('click', () => showScreen('how-to-play'));
  $('btn-help-back').addEventListener('click', () => showScreen('main-menu'));
  $('btn-setup-back').addEventListener('click', () => showScreen('main-menu'));
  $('btn-start-game').addEventListener('click', startGame);
  $('btn-play-again').addEventListener('click', () => showScreen('main-menu'));

  // Window resize
  window.addEventListener('resize', () => {
    if (renderer) { renderer.resize(); camera?.resize(el.canvas.width, el.canvas.height); }
  });

  // Service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  // Fake load then show menu
  await fakeLoad();
  showScreen('main-menu');
}

init();
