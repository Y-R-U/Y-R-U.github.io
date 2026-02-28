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

// Passive regen: 1 hp / 5 s base, +1 per 20 hitpoints levels
const REGEN_MS = 5000;
let _lastRegen  = 0;

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
  initInput(onTap, onHold);

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

  // Monster info close button
  document.getElementById('btn-monster-close')?.addEventListener('click', closeMonsterInfo);

  // Home button — teleport to Ashvale
  document.getElementById('btn-home')?.addEventListener('click', () => {
    if (!confirm('Teleport back to Ashvale?')) return;
    const stHome = getState();
    if (stHome.player.inDungeon) {
      stHome.player.inDungeon = false;
      stHome.player.dungeonId = null;
      dungeon = null;
      clearTarget();
      _combatTarget = null;
    }
    const town = TOWNS.ashvale;
    player.x = town.cx + 0.5;
    player.y = town.cy + 0.5;
    player.stopPath();
    stHome.player.x = player.x;
    stHome.player.y = player.y;
    switchTab('map');
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

  // Passive HP regen
  if (now - _lastRegen >= REGEN_MS) {
    _lastRegen = now;
    const st = getState();
    if (st.player.hp > 0 && st.player.hp < st.player.maxHp) {
      const hpLvl   = st.player.skills?.hitpoints?.level || 1;
      const regenAmt = 1 + Math.floor(hpLvl / 20);   // 1 base + 1 extra per 20 hp levels
      player.heal(regenAmt);
    }
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
    // Use world-coordinate range check so the full sprite tile is clickable
    const enemy = dungeon.enemies.find(e =>
      !e.dead && wx >= e.x && wx < e.x + 1 && wy >= e.y && wy < e.y + 1
    );
    if (enemy) {
      if (enemy === _combatTarget) { showMonsterInfo(enemy); return; }
      _setTargetAndWalk(enemy, map);
      return;
    }
    _walkTo(wx, wy, map);
    return;
  }

  // ── World mode ──

  // NPC — open dialogue
  const npc = npcMgr.getNpcNear(wx, wy, 1.5);
  if (npc) { showDialogue(npc); return; }

  // Enemy — tap once to target+walk, tap again while targeted to see stats
  const enemy = spawner.getEnemies().find(e =>
    !e.dead && wx >= e.x && wx < e.x + 1 && wy >= e.y && wy < e.y + 1
  );
  if (enemy) {
    if (enemy === _combatTarget) { showMonsterInfo(enemy); return; }
    _setTargetAndWalk(enemy, map);
    return;
  }

  // Dungeon entrance — walk to it
  if (worldMap.get(tx, ty) === TILES.DUNGEON) {
    _walkTo(wx, wy, map);
    return;
  }

  // Water tile adjacent to player — fish (picks best tier for fishing level)
  if (worldMap.get(tx, ty) === TILES.WATER) {
    const dx = tx + 0.5 - player.x, dy = ty + 0.5 - player.y;
    if (Math.sqrt(dx*dx + dy*dy) < 3) {
      const fishLvl = st.player.skills.fishing?.level || 1;
      const fishTask = fishLvl >= 70 ? 'shark' : fishLvl >= 40 ? 'lobster' : fishLvl >= 20 ? 'trout' : 'shrimp';
      import('./skills/tasks.js').then(m => m.tryFish(fishTask, player));
      return;
    }
  }

  // Tree tile adjacent to player — chop (picks best tier for WC level)
  if (worldMap.get(tx, ty) === TILES.TREE) {
    const dx = tx + 0.5 - player.x, dy = ty + 0.5 - player.y;
    if (Math.sqrt(dx*dx + dy*dy) < 3) {
      const wcLvl = st.player.skills.woodcutting?.level || 1;
      const wcTask = wcLvl >= 85 ? 'magic' : wcLvl >= 70 ? 'yew' : wcLvl >= 40 ? 'maple' : wcLvl >= 20 ? 'willow' : 'oak';
      import('./skills/tasks.js').then(m => m.tryChop(wcTask, player));
      return;
    }
  }

  // Stone tile adjacent to player — mine (picks best tier for mining level)
  if (worldMap.get(tx, ty) === TILES.STONE) {
    const dx = tx + 0.5 - player.x, dy = ty + 0.5 - player.y;
    if (Math.sqrt(dx*dx + dy*dy) < 3) {
      const mineLvl = st.player.skills.mining?.level || 1;
      const mineTask = mineLvl >= 85 ? 'runite_ore' : mineLvl >= 50 ? 'mithril_ore' : mineLvl >= 30 ? 'gold_ore' : mineLvl >= 15 ? 'iron_ore' : 'copper_ore';
      import('./skills/tasks.js').then(m => m.tryMine(mineTask, player));
      return;
    }
  }

  // Building/door adjacent to player — cook (train cooking at town buildings)
  if (worldMap.get(tx, ty) === TILES.BUILDING || worldMap.get(tx, ty) === TILES.DOOR) {
    const dx = tx + 0.5 - player.x, dy = ty + 0.5 - player.y;
    if (Math.sqrt(dx*dx + dy*dy) < 3) {
      const cookLvl = st.player.skills.cooking?.level || 1;
      const cookTask = cookLvl >= 70 ? 'cook_shark' : cookLvl >= 30 ? 'cook_lobster' : cookLvl >= 15 ? 'cook_trout' : 'cook_shrimp';
      import('./skills/tasks.js').then(m => m.tryCook(cookTask, player));
      return;
    }
  }

  // Default: walk to tapped location
  _walkTo(wx, wy, map);
}

function _walkTo(wx, wy, map) {
  _combatTarget = null;
  const path = findPath(map, player.x, player.y, wx, wy);
  if (path === null) {
    showFloatMsg('Can\'t reach that spot.', '#888');
  } else if (path.length === 0) {
    // Already standing on the tapped tile — nothing to do
  } else {
    const smoothed = smoothPath(path);
    const dest = { x: Math.floor(wx) + 0.5, y: Math.floor(wy) + 0.5 };
    player.setPath(smoothed, dest);
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

// ===== Long-press: show monster stat popup =====
function onHold(wx, wy) {
  const st      = getState();
  const enemies = st.player.inDungeon ? dungeon?.enemies : spawner.getEnemies();
  if (!enemies) return;
  const enemy = enemies.find(e =>
    !e.dead && wx >= e.x && wx < e.x + 1 && wy >= e.y && wy < e.y + 1
  );
  if (enemy) showMonsterInfo(enemy);
}

// Find nearest walkable tile to (cx,cy) — used for safe dungeon exit/flee placement
function _findSafeSpawn(cx, cy, map) {
  const tx = Math.floor(cx), ty = Math.floor(cy);
  for (let r = 0; r <= 6; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (r > 0 && Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        if (map.isWalkable(tx + dx, ty + dy)) return { x: tx + dx + 0.5, y: ty + dy + 0.5 };
      }
    }
  }
  return { x: cx, y: cy };
}

function showMonsterInfo(enemy) {
  const popup = document.getElementById('monster-info');
  if (!popup) return;
  const hpPct    = Math.max(0, Math.min(100, (enemy.hp / enemy.maxHp) * 100));
  const hpColor  = hpPct > 50 ? '#4ecca3' : hpPct > 25 ? '#f5a623' : '#e94560';
  const goldMin  = enemy.gold?.[0] ?? 0;
  const goldMax  = enemy.gold?.[1] ?? 0;
  const nameEl   = popup.querySelector('#mi-name');
  const hpBar    = popup.querySelector('#mi-hp-bar');
  const hpTxt    = popup.querySelector('#mi-hp-text');
  const statsEl  = popup.querySelector('#mi-stats');
  if (nameEl)  nameEl.textContent  = `${enemy.emoji || enemy.glyph} ${enemy.name}`;
  if (hpBar)   { hpBar.style.width = hpPct + '%'; hpBar.style.background = hpColor; }
  if (hpTxt)   hpTxt.textContent   = `${Math.max(0, Math.floor(enemy.hp))} / ${enemy.maxHp}`;
  if (statsEl) statsEl.innerHTML   =
    `<div>⚔️ ATK <b>${enemy.atk}</b></div>` +
    `<div>🛡️ DEF <b>${enemy.def}</b></div>` +
    `<div>⭐ XP  <b>${enemy.xp}</b></div>` +
    `<div>💰 Gold <b>${goldMin}–${goldMax}</b></div>`;
  popup.classList.remove('hidden');
}

function closeMonsterInfo() {
  document.getElementById('monster-info')?.classList.add('hidden');
}

// ===== Dungeon Entry / Exit =====
let _pendingDungeon = null;
let _fleeCooldown   = 0;   // unix ms — don't re-trigger dungeon prompt during this window

function onDungeonEntrance(dungeonId) {
  if (_pendingDungeon === dungeonId) return;
  if (Date.now() < _fleeCooldown) return;      // still within flee cooldown
  _pendingDungeon = dungeonId;
  player.stopPath();
  showDungeonModal(dungeonId,
    () => enterDungeon(dungeonId),
    () => {
      _pendingDungeon = null;
      _fleeCooldown   = Date.now() + 3000;
      // Place player at the nearest safe tile south of entrance
      const cfg = DUNGEONS[dungeonId];
      if (cfg) {
        const safe = _findSafeSpawn(cfg.entrance.wx + 0.5, cfg.entrance.wy + 1.5, worldMap);
        player.x = safe.x;
        player.y = safe.y;
      }
    }
  );
}

function enterDungeon(dungeonId) {
  // _pendingDungeon stays set until we're fully inside — prevents double modal during fade
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
    _pendingDungeon = null;   // safe to clear now — game loop won't call onDungeonEntrance
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
    const rawX = (entrance?.wx ?? 20) + 0.5;
    const rawY = (entrance?.wy ?? 40) + 1.5;
    const safe = _findSafeSpawn(rawX, rawY, worldMap);
    player.x = safe.x;
    player.y = safe.y;
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
