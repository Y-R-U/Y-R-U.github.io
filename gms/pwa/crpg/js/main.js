// ===== CRPG: Lands of Ascii — Main Entry Point =====
import { ITEMS, DUNGEONS, TILES, TOWNS, NPCS } from './config.js';
import { getState, loadGame, saveGame, setItemsRef, calcMaxHp } from './state.js';
import { initRenderer, resizeCanvas, updateCamera, draw, worldToScreen, screenToWorld } from './engine/renderer.js';
import { initInput, update as updateInput, getVelocity } from './engine/input.js';
import { update as updateParticles, getParticles } from './engine/particles.js';
import { resumeCtx } from './engine/audio.js';
import { WorldMap } from './world/map.js';
import { DungeonState } from './world/dungeon.js';
import { Spawner } from './world/spawner.js';
import { NpcManager } from './world/npc.js';
import { Player } from './entities/player.js';
import { Enemy } from './entities/enemy.js';
import { update as updateCombat, setTarget, getTarget, clearTarget } from './entities/combat.js';
import { setLevelUpCallback } from './skills/skillEngine.js';
import { useItem } from './skills/tasks.js';
import { initHUD, updateHUD, flashBoss, fadeToBlack } from './ui/hud.js';
import { initMenuNav, switchTab, showDialogue, initDialogueModal } from './ui/menuNav.js';
import { initDungeonModal, showDungeonModal } from './ui/dungeonEntry.js';
import { renderSkillsPanel } from './ui/skillsPanel.js';
import { renderInventory } from './ui/inventory.js';

// ===== Test harness wiring =====
import { TestRunner } from './tests/testRunner.js';
import { registerSkillTests }     from './tests/test.skills.js';
import { registerCombatTests }    from './tests/test.combat.js';
import { registerDungeonTests }   from './tests/test.dungeon.js';
import { registerInventoryTests } from './tests/test.inventory.js';
import { registerStateTests }     from './tests/test.state.js';
import { registerMapTests }       from './tests/test.map.js';

// ===== Game state =====
let worldMap   = null;
let spawner    = null;
let npcMgr     = null;
let player     = null;
let dungeon    = null;   // active DungeonState or null
let lastUpdate = 0;
let gameRunning = true;

// ===== Boot =====
async function boot() {
  // Register service worker
  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('./sw.js');
    } catch(e) { /* non-fatal */ }
  }

  // Load or fresh start
  setItemsRef(ITEMS);
  const loaded = loadGame();
  const st = getState();

  if (loaded) {
    // Restore maxHp
    st.player.maxHp = calcMaxHp();
  }

  // Build world
  worldMap = new WorldMap(st.world.seed);
  spawner  = new Spawner();
  npcMgr   = new NpcManager();
  player   = new Player();
  player.syncFromState();

  // Init engine
  initRenderer();
  initInput(onTap);
  initHUD();
  initMenuNav();
  initDungeonModal();
  initDialogueModal();

  // Level-up callback → refresh UI
  setLevelUpCallback((skillId, newLevel) => {
    updateHUD();
    // If skills panel is open, re-render it
    const skillsPanel = document.getElementById('panel-skills');
    if (skillsPanel && !skillsPanel.classList.contains('hidden')) {
      renderSkillsPanel();
    }
  });

  // Item use event (from inventory popup)
  window.addEventListener('crpg:useItem', (e) => {
    useItem(e.detail.itemId, player);
    updateHUD();
  });

  // Test runner wiring
  const runner = new TestRunner();
  registerSkillTests(runner);
  registerCombatTests(runner);
  registerDungeonTests(runner);
  registerInventoryTests(runner);
  registerStateTests(runner);
  registerMapTests(runner);

  document.getElementById('btn-run-tests')?.addEventListener('click', async () => {
    const results = document.getElementById('test-results');
    if (results) results.innerHTML = '<div style="color:#888">Running…</div>';
    await runner.runAll();
    runner.renderToElement(results);
  });

  // Auto-run tests if ?debug=tests
  const params = new URLSearchParams(window.location.search);
  if (params.get('debug') === 'tests') {
    setTimeout(async () => {
      await runner.runAll();
      const results = document.getElementById('test-results');
      if (results) runner.renderToElement(results);
    }, 500);
  }

  // First-time show map tab
  switchTab('map');

  // Start loop
  requestAnimationFrame(gameLoop);
}

// ===== Game Loop =====
function gameLoop(now) {
  if (!gameRunning) return;
  const dt = Math.min(now - (lastUpdate || now), 100); // cap at 100ms
  lastUpdate = now;

  updateInput();
  resumeCtx();

  const st = getState();

  if (st.player.inDungeon && dungeon) {
    // ===== DUNGEON MODE =====
    player.update(dungeon.map);
    updateCamera(player.x, player.y);

    // Update enemies
    for (const e of dungeon.enemies) {
      if (!e.dead) e.update(player, dt * 0.06, dungeon.map);
    }

    // Combat
    updateCombat(player, dungeon.enemies, now);

    // Check boss spawn
    if (dungeon.checkBossSpawn(Enemy)) {
      flashBoss();
      import('./engine/audio.js').then(a => a.playBoss());
    }

    // Check dungeon cleared
    if (dungeon.checkCleared()) {
      // Unlock exit
      setTimeout(() => {
        showFloatMsg('DUNGEON CLEARED! Exit unlocked.', '#4ecca3');
      }, 200);
    }

    // Check player on exit tile
    const etx = dungeon.map.exitTile.x;
    const ety = dungeon.map.exitTile.y;
    if (!dungeon.map.exitLocked &&
        Math.floor(player.x) === etx && Math.floor(player.y) === ety) {
      exitDungeon();
    }

    // Check player death
    if (player.isDead()) onPlayerDeath();

    // Draw dungeon
    const allEntities = [
      { ...player, type: 'player' },
      ...dungeon.enemies.filter(e => !e.dead),
    ];
    draw(dungeon.map, allEntities, getParticles(), true);

  } else {
    // ===== WORLD MODE =====
    player.update(worldMap);
    updateCamera(player.x, player.y);

    // Spawner
    spawner.update(now);

    // Update enemy AI
    for (const e of spawner.getEnemies()) {
      if (!e.dead) e.update(player, dt * 0.06, worldMap);
    }

    // Combat
    updateCombat(player, spawner.getEnemies(), now);

    // Check player death
    if (player.isDead()) onPlayerDeath();

    // Check dungeon entrance
    const px = Math.floor(player.x);
    const py = Math.floor(player.y);
    const tile = worldMap.get(px, py);
    if (tile === TILES.DUNGEON) {
      const dungeonId = getDungeonAtTile(px, py);
      if (dungeonId) onDungeonEntrance(dungeonId);
    }

    // Draw world
    const allEntities = [
      { ...player, type: 'player' },
      ...spawner.getEnemies().filter(e => !e.dead),
      ...npcMgr.getNpcs(),
    ];
    draw(worldMap, allEntities, getParticles(), false);
  }

  updateParticles(dt * 0.06);
  updateHUD();
  syncPlayerState();

  requestAnimationFrame(gameLoop);
}

// ===== Tap Handler =====
function onTap(wx, wy, sx, sy) {
  resumeCtx();
  const st = getState();

  if (st.player.inDungeon && dungeon) {
    // Tap enemy in dungeon
    const tx = Math.floor(wx);
    const ty = Math.floor(wy);
    const enemy = dungeon.enemies.find(e =>
      !e.dead && Math.floor(e.x) === tx && Math.floor(e.y) === ty
    );
    if (enemy) { setTarget(enemy); return; }

  } else {
    // Tap NPC
    const npc = npcMgr.getNpcNear(wx, wy, 1.2);
    if (npc) { showDialogue(npc); return; }

    // Tap enemy
    const tx = Math.floor(wx);
    const ty = Math.floor(wy);
    const enemy = spawner.getEnemies().find(e =>
      !e.dead && Math.floor(e.x) === tx && Math.floor(e.y) === ty
    );
    if (enemy) { setTarget(enemy); return; }

    // Tap water tile near player (fishing prompt)
    const tile = worldMap.get(tx, ty);
    if (tile === TILES.WATER) {
      const dx = tx - player.x, dy = ty - player.y;
      if (Math.sqrt(dx*dx + dy*dy) < 2.5) {
        import('./skills/tasks.js').then(m => m.tryFish('shrimp', player));
        return;
      }
    }

    // Tap tree tile (woodcutting prompt)
    if (tile === TILES.TREE) {
      const dx = tx - player.x, dy = ty - player.y;
      if (Math.sqrt(dx*dx + dy*dy) < 2.5) {
        import('./skills/tasks.js').then(m => m.tryChop('oak', player));
        return;
      }
    }
  }
}

// ===== Dungeon Entry / Exit =====
let _pendingDungeon = null;
function onDungeonEntrance(dungeonId) {
  if (_pendingDungeon === dungeonId) return;
  _pendingDungeon = dungeonId;

  showDungeonModal(dungeonId,
    () => enterDungeon(dungeonId),
    () => { _pendingDungeon = null; }
  );
}

function enterDungeon(dungeonId) {
  _pendingDungeon = null;
  const st = getState();

  fadeToBlack(() => {
    dungeon = new DungeonState(dungeonId);
    dungeon.spawnEnemies(Enemy);

    player.x = dungeon.playerX;
    player.y = dungeon.playerY;
    st.player.x = player.x;
    st.player.y = player.y;
    st.player.inDungeon = true;
    st.player.dungeonId = dungeonId;

    clearTarget();
    import('./engine/audio.js').then(a => a.playDungeon());
  });
}

function exitDungeon() {
  const st = getState();
  if (!dungeon) return;

  // Set dungeon cooldown
  const now = Date.now();
  st.world.dungeonCooldowns[dungeon.dungeonId] = now + 600000; // 10 min

  fadeToBlack(() => {
    const exitX = DUNGEONS[dungeon.dungeonId]?.entrance.wx ?? 20;
    const exitY = DUNGEONS[dungeon.dungeonId]?.entrance.wy ?? 40;

    player.x = exitX + 0.5;
    player.y = exitY + 1.5;
    st.player.x = player.x;
    st.player.y = player.y;
    st.player.inDungeon = false;
    st.player.dungeonId = null;

    dungeon = null;
    clearTarget();
    saveGame();
  });
}

// ===== Player Death =====
function onPlayerDeath() {
  const st = getState();
  // Respawn at Ashvale with 50% HP
  const town = TOWNS.ashvale;
  player.x = town.cx + 0.5;
  player.y = town.cy + 0.5;
  st.player.x = player.x;
  st.player.y = player.y;
  st.player.hp = Math.floor(st.player.maxHp * 0.5);
  player.hp = st.player.hp;
  st.player.inDungeon = false;
  st.player.dungeonId = null;
  dungeon = null;
  clearTarget();

  showFloatMsg('You have died! Respawned at Ashvale.', '#e94560');
  saveGame();
}

// ===== Helpers =====
function getDungeonAtTile(tx, ty) {
  for (const [id, cfg] of Object.entries(DUNGEONS)) {
    if (cfg.entrance.wx === tx && cfg.entrance.wy === ty) return id;
  }
  return null;
}

function showFloatMsg(msg, color) {
  // Simple overlay message
  const layer = document.getElementById('float-layer');
  if (!layer) return;
  const el = document.createElement('div');
  el.style.cssText = `
    position:absolute;top:40%;left:50%;transform:translateX(-50%);
    background:rgba(0,0,0,0.8);border:1px solid ${color};
    color:${color};padding:10px 16px;border-radius:6px;
    font-family:monospace;font-size:13px;text-align:center;
    animation:floatUp 3s ease-out forwards;white-space:nowrap;
  `;
  el.textContent = msg;
  layer.appendChild(el);
  setTimeout(() => el.remove(), 3100);
}

function syncPlayerState() {
  const st = getState();
  player.hp    = st.player.hp;
  player.maxHp = st.player.maxHp;
}

// ===== Start =====
boot().catch(console.error);
