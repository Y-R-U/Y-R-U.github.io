// ===== CRPG: Lands of Ascii — Main Entry Point =====
import { ITEMS, DUNGEONS, TILES, TOWNS } from './config.js';
import { getState, loadGame, saveGame, setItemsRef, calcMaxHp } from './state.js';
import { initRenderer, updateCamera, draw, screenToWorld, setDestMarker } from './engine/renderer.js';
import { initInput, setScreenToWorld } from './engine/input.js';
import { update as updateParticles, getParticles } from './engine/particles.js';
import { resumeCtx } from './engine/audio.js';
import { findPath, smoothPath } from './engine/pathfinder.js';
import { WorldMap } from './world/map.js';
import { DungeonState } from './world/dungeon.js';
import { Spawner } from './world/spawner.js';
import { NpcManager } from './world/npc.js';
import { Player } from './entities/player.js';
import { Enemy } from './entities/enemy.js';
import { update as updateCombat, setTarget, clearTarget } from './entities/combat.js';
import { setLevelUpCallback } from './skills/skillEngine.js';
import { useItem } from './skills/tasks.js';
import { initHUD, updateHUD, flashBoss, fadeToBlack } from './ui/hud.js';
import { initMenuNav, switchTab, showDialogue, initDialogueModal } from './ui/menuNav.js';
import { initDungeonModal, showDungeonModal } from './ui/dungeonEntry.js';
import { renderSkillsPanel } from './ui/skillsPanel.js';

// Test harness
import { TestRunner } from './tests/testRunner.js';
import { registerSkillTests }     from './tests/test.skills.js';
import { registerCombatTests }    from './tests/test.combat.js';
import { registerDungeonTests }   from './tests/test.dungeon.js';
import { registerInventoryTests } from './tests/test.inventory.js';
import { registerStateTests }     from './tests/test.state.js';
import { registerMapTests }       from './tests/test.map.js';

// ===== Module-level game state =====
let worldMap    = null;
let spawner     = null;
let npcMgr      = null;
let player      = null;
let dungeon     = null;   // active DungeonState or null
let lastUpdate  = 0;

// ===== Boot =====
async function boot() {
  if ('serviceWorker' in navigator) {
    try { await navigator.serviceWorker.register('./sw.js'); } catch(e) {}
  }

  setItemsRef(ITEMS);
  const loaded = loadGame();
  const st = getState();
  if (loaded) st.player.maxHp = calcMaxHp();

  // Build world objects
  worldMap = new WorldMap(st.world.seed);
  spawner  = new Spawner();
  npcMgr   = new NpcManager();
  player   = new Player();
  player.syncFromState();

  // Engine init
  initRenderer();
  setScreenToWorld(screenToWorld);   // break the circular renderer↔input dep
  initInput(onTap);

  // UI init
  initHUD();
  initMenuNav();
  initDungeonModal();
  initDialogueModal();

  // Level-up → refresh HUD and skills panel if visible
  setLevelUpCallback((skillId, newLevel) => {
    updateHUD();
    const panel = document.getElementById('panel-skills');
    if (panel && !panel.classList.contains('hidden')) renderSkillsPanel();
  });

  // Inventory "use item" event
  window.addEventListener('crpg:useItem', (e) => {
    useItem(e.detail.itemId, player);
    updateHUD();
  });

  // Test runner
  const runner = new TestRunner();
  registerSkillTests(runner);
  registerCombatTests(runner);
  registerDungeonTests(runner);
  registerInventoryTests(runner);
  registerStateTests(runner);
  registerMapTests(runner);

  document.getElementById('btn-run-tests')?.addEventListener('click', async () => {
    const el = document.getElementById('test-results');
    if (el) el.innerHTML = '<div style="color:#888">Running…</div>';
    await runner.runAll();
    runner.renderToElement(el);
  });

  const params = new URLSearchParams(window.location.search);
  if (params.get('debug') === 'tests') {
    setTimeout(async () => {
      await runner.runAll();
      const el = document.getElementById('test-results');
      if (el) runner.renderToElement(el);
    }, 500);
  }

  switchTab('map');
  requestAnimationFrame(gameLoop);
}

// ===== Game Loop =====
function gameLoop(now) {
  const dt = Math.min(now - (lastUpdate || now), 100);
  lastUpdate = now;

  resumeCtx();

  const st = getState();

  // Push destination marker to renderer each frame
  setDestMarker(player.destMarker);

  if (st.player.inDungeon && dungeon) {
    // ── DUNGEON MODE ──
    player.update(dungeon.map);
    updateCamera(player.x, player.y);

    for (const e of dungeon.enemies) {
      if (!e.dead) e.update(player, dt * 0.06, dungeon.map);
    }

    updateCombat(player, dungeon.enemies, now);

    // Stop walking toward an enemy once combat is in range
    if (player.destMarker && _combatTarget && !_combatTarget.dead) {
      const d = _combatTarget.distTo(player);
      if (d <= player.getAggroRadius()) player.stopPath();
    }

    if (dungeon.checkBossSpawn(Enemy)) {
      flashBoss();
      import('./engine/audio.js').then(a => a.playBoss());
    }

    if (dungeon.checkCleared()) {
      showFloatMsg('DUNGEON CLEARED! Exit unlocked.', '#4ecca3');
    }

    // Player stepped on exit
    const ex = dungeon.map.exitTile.x, ey = dungeon.map.exitTile.y;
    if (!dungeon.map.exitLocked &&
        Math.floor(player.x) === ex && Math.floor(player.y) === ey) {
      exitDungeon();
    }

    if (player.isDead()) onPlayerDeath();

    draw(dungeon.map,
      [{ ...player, type:'player' }, ...dungeon.enemies.filter(e => !e.dead)],
      getParticles());

  } else {
    // ── WORLD MODE ──
    player.update(worldMap);
    updateCamera(player.x, player.y);

    spawner.update(now);

    for (const e of spawner.getEnemies()) {
      if (!e.dead) e.update(player, dt * 0.06, worldMap);
    }

    updateCombat(player, spawner.getEnemies(), now);

    // Stop walking toward an enemy once in combat range
    if (_combatTarget && !_combatTarget.dead) {
      if (_combatTarget.distTo(player) <= player.getAggroRadius()) player.stopPath();
    }

    if (player.isDead()) onPlayerDeath();

    // Walk onto dungeon entrance tile
    const ptx = Math.floor(player.x), pty = Math.floor(player.y);
    if (worldMap.get(ptx, pty) === TILES.DUNGEON) {
      const did = getDungeonAtTile(ptx, pty);
      if (did) onDungeonEntrance(did);
    }

    draw(worldMap,
      [{ ...player, type:'player' }, ...spawner.getEnemies().filter(e => !e.dead), ...npcMgr.getNpcs()],
      getParticles());
  }

  updateParticles(dt * 0.06);
  updateHUD();

  // Keep player object in sync with persistent state
  const st2 = getState();
  player.hp    = st2.player.hp;
  player.maxHp = st2.player.maxHp;

  requestAnimationFrame(gameLoop);
}

// ===== Tap / Click Handler =====
// Priority: NPC > enemy (walk + target) > dungeon entrance > walkable tile (walk)
let _combatTarget = null;

function onTap(wx, wy) {
  resumeCtx();
  const st  = getState();
  const tx  = Math.floor(wx);
  const ty  = Math.floor(wy);
  const map = st.player.inDungeon ? dungeon?.map : worldMap;
  if (!map) return;

  // ── Dungeon mode ──
  if (st.player.inDungeon && dungeon) {
    const enemy = dungeon.enemies.find(e =>
      !e.dead && Math.floor(e.x) === tx && Math.floor(e.y) === ty
    );
    if (enemy) {
      _setTargetAndWalk(enemy, map);
      return;
    }
    // Walk to tapped tile
    _walkTo(wx, wy, map);
    return;
  }

  // ── World mode ──

  // NPC — open dialogue (no pathfinding needed, works at any distance)
  const npc = npcMgr.getNpcNear(wx, wy, 1.5);
  if (npc) {
    showDialogue(npc);
    return;
  }

  // Enemy — walk toward and target
  const enemy = spawner.getEnemies().find(e =>
    !e.dead && Math.floor(e.x) === tx && Math.floor(e.y) === ty
  );
  if (enemy) {
    _setTargetAndWalk(enemy, map);
    return;
  }

  // Dungeon entrance glyph — walk to it
  if (worldMap.get(tx, ty) === TILES.DUNGEON) {
    _walkTo(wx, wy, map);
    return;
  }

  // Water tile adjacent to player — fish
  if (worldMap.get(tx, ty) === TILES.WATER) {
    const dx = tx + 0.5 - player.x, dy = ty + 0.5 - player.y;
    if (Math.sqrt(dx*dx + dy*dy) < 3) {
      import('./skills/tasks.js').then(m => m.tryFish('shrimp', player));
      return;
    }
  }

  // Tree tile adjacent to player — chop
  if (worldMap.get(tx, ty) === TILES.TREE) {
    const dx = tx + 0.5 - player.x, dy = ty + 0.5 - player.y;
    if (Math.sqrt(dx*dx + dy*dy) < 3) {
      import('./skills/tasks.js').then(m => m.tryChop('oak', player));
      return;
    }
  }

  // Default: walk to tapped location
  _walkTo(wx, wy, map);
}

function _walkTo(wx, wy, map) {
  _combatTarget = null;
  const path = findPath(map, player.x, player.y, wx, wy);
  if (path !== null) {
    const smoothed = smoothPath(path);
    const dest = { x: Math.floor(wx) + 0.5, y: Math.floor(wy) + 0.5 };
    player.setPath(smoothed, dest);
  } else {
    showFloatMsg('Can\'t reach that spot.', '#888');
  }
}

function _setTargetAndWalk(enemy, map) {
  _combatTarget = enemy;
  setTarget(enemy);
  // Walk to a tile adjacent to the enemy
  const path = findPath(map, player.x, player.y, enemy.x, enemy.y);
  if (path !== null) {
    // Drop last step so we stop next to the enemy, not on top
    const smoothed = smoothPath(path);
    if (smoothed.length > 1) smoothed.pop();
    player.setPath(smoothed, { x: enemy.x, y: enemy.y });
  }
}

// ===== Dungeon Entry / Exit =====
let _pendingDungeon = null;

function onDungeonEntrance(dungeonId) {
  if (_pendingDungeon === dungeonId) return;
  _pendingDungeon = dungeonId;
  player.stopPath();
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
    player.stopPath();
    st.player.x = player.x;
    st.player.y = player.y;
    st.player.inDungeon = true;
    st.player.dungeonId = dungeonId;
    clearTarget();
    _combatTarget = null;
    import('./engine/audio.js').then(a => a.playDungeon());
  });
}

function exitDungeon() {
  if (!dungeon) return;
  const st = getState();
  st.world.dungeonCooldowns[dungeon.dungeonId] = Date.now() + 600000;
  fadeToBlack(() => {
    const entrance = DUNGEONS[dungeon.dungeonId]?.entrance;
    player.x = (entrance?.wx ?? 20) + 0.5;
    player.y = (entrance?.wy ?? 40) + 1.5;
    player.stopPath();
    st.player.x = player.x;
    st.player.y = player.y;
    st.player.inDungeon = false;
    st.player.dungeonId = null;
    dungeon = null;
    clearTarget();
    _combatTarget = null;
    saveGame();
  });
}

// ===== Player Death =====
function onPlayerDeath() {
  const st   = getState();
  const town = TOWNS.ashvale;
  player.x   = town.cx + 0.5;
  player.y   = town.cy + 0.5;
  player.stopPath();
  st.player.x  = player.x;
  st.player.y  = player.y;
  st.player.hp = Math.floor(st.player.maxHp * 0.5);
  player.hp    = st.player.hp;
  st.player.inDungeon = false;
  st.player.dungeonId = null;
  dungeon = null;
  clearTarget();
  _combatTarget = null;
  showFloatMsg('You died! Respawned at Ashvale.', '#e94560');
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
  const layer = document.getElementById('float-layer');
  if (!layer) return;
  const el = document.createElement('div');
  el.style.cssText = `
    position:absolute;top:38%;left:50%;transform:translateX(-50%);
    background:rgba(0,0,0,0.85);border:1px solid ${color};
    color:${color};padding:10px 18px;border-radius:6px;
    font-family:monospace;font-size:13px;text-align:center;
    white-space:nowrap;pointer-events:none;
    animation:floatUp 3s ease-out forwards;
  `;
  el.textContent = msg;
  layer.appendChild(el);
  setTimeout(() => el.remove(), 3100);
}

// ===== Start =====
boot().catch(console.error);
