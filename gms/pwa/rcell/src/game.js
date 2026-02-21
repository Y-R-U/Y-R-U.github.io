// game.js — Core game loop (requestAnimationFrame)
const Game = (() => {
  const FIXED_STEP = 1 / 60;
  let accumulator = 0;
  let lastTime = 0;
  let rafId = null;
  let running = false;
  let paused = false;
  let gameState = 'menu'; // menu, playing, paused, levelup, death, win, meta
  let canvas = null;
  let ctx = null;
  let canvasW = 0, canvasH = 0;
  let dpr = 1;

  // Game data
  let saveData = null;
  let enemyData = null;
  let ingameUpgradeData = null;
  let metaUpgradeData = null;

  // Run state
  let gameTime = 0;
  let score = 0;
  let waveIndex = 0;
  let waveTransitionTimer = 0;
  let waveTransitionAlpha = 0;
  let aoeEffects = [];
  let damageNumbers = [];
  let helperCells = [];
  let helperWobble = 0;
  let nextPickCount = 3;
  let rerolls = 0;

  // Touch state
  let touchActive = false;
  let touchX = 0, touchY = 0;
  let touchStartY = 0; // for meta-screen swipe scrolling

  function init(canvasEl) {
    canvas = canvasEl;
    ctx = canvas.getContext('2d');
    dpr = window.devicePixelRatio || 1;
    Renderer.init(ctx);

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    window.addEventListener('orientationchange', resizeCanvas);

    // Touch controls
    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd);
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('click', onCanvasClick);

    // Scroll support for meta screen
    canvas.addEventListener('wheel', onWheel, { passive: false });

    // Load save
    saveData = Storage.loadOrDefault();
    MetaUpgrades.setSaveState(saveData);

    // Load data - will be set by main.js after JSON fetch
    Screens.initParticles(canvasW, canvasH);

    startLoop();
  }

  function resizeCanvas() {
    dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    canvasW = w;
    canvasH = h;
    Screens.initParticles(canvasW, canvasH);
  }

  function normalizeTouch(touch) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (touch.clientX - rect.left),
      y: (touch.clientY - rect.top)
    };
  }

  function onTouchStart(e) {
    e.preventDefault();
    Audio.resume();
    const pos = normalizeTouch(e.touches[0]);
    touchActive = true;
    touchX = pos.x; touchY = pos.y;
    touchStartY = pos.y;
    handleInput(pos.x, pos.y, 'start');
  }
  function onTouchMove(e) {
    e.preventDefault();
    const pos = normalizeTouch(e.touches[0]);
    if (gameState === 'meta') {
      const dy = pos.y - touchY;
      MetaScreen.handleScroll(dy);
    }
    touchX = pos.x; touchY = pos.y;
    if (gameState === 'playing') Player.setTarget(pos.x, pos.y);
  }
  function onTouchEnd(e) {
    touchActive = false;
  }
  function onWheel(e) {
    e.preventDefault();
    if (gameState === 'meta') {
      MetaScreen.handleScroll(-e.deltaY * 0.5);
    }
  }
  function onMouseDown(e) {
    const pos = { x: e.offsetX, y: e.offsetY };
    touchActive = true;
    touchX = pos.x; touchY = pos.y;
    handleInput(pos.x, pos.y, 'start');
  }
  function onMouseMove(e) {
    if (touchActive && gameState === 'playing') {
      Player.setTarget(e.offsetX, e.offsetY);
    }
  }
  function onMouseUp() { touchActive = false; }

  function onCanvasClick(e) {
    const x = e.offsetX, y = e.offsetY;
    handleInput(x, y, 'click');
  }

  function handleInput(x, y, type) {
    if (gameState === 'menu') {
      const action = Screens.mainMenu.handleTap(x, y);
      if (action === 'play') startRun();
      else if (action === 'meta') { MetaScreen.resetScroll(); gameState = 'meta'; }
    } else if (gameState === 'levelup') {
      const handled = UpgradeUI.handleTap(x, y, canvasW, canvasH);
      if (!handled) return;
    } else if (gameState === 'death') {
      const action = Screens.deathScreen.handleTap(x, y);
      if (action === 'retry') startRun();
      else if (action === 'meta') { MetaScreen.resetScroll(); gameState = 'meta'; }
      else if (action === 'menu') gameState = 'menu';
    } else if (gameState === 'win') {
      const action = Screens.winScreen.handleTap(x, y);
      if (action === 'retry') startRun();
      else if (action === 'meta') { MetaScreen.resetScroll(); gameState = 'meta'; }
    } else if (gameState === 'meta') {
      const action = MetaScreen.handleTap(x, y, saveData);
      if (action === 'back') gameState = 'menu';
    } else if (gameState === 'playing') {
      Player.setTarget(x, y);
    }
  }

  function setData(enemies, ingameUpgrades, metaUpgrades) {
    enemyData = enemies;
    ingameUpgradeData = ingameUpgrades;
    metaUpgradeData = metaUpgrades;

    Enemies.loadDefs(enemies.enemies);
    InGameUpgrades.loadData(ingameUpgrades.upgrades);
    MetaUpgrades.loadData(metaUpgrades);
  }

  function startRun() {
    // Must pass BASE_STATS as seed — multiply-ops otherwise start from 1
    // (e.g. antibody_speed × 1.15 = 1.15 instead of 300 × 1.15 = 345),
    // producing near-zero projectile speeds (the "stationary mines" bug).
    const metaStats = MetaUpgrades.applyMetaToPlayerStats(Player.getBaseStats());
    const playerState = Player.init(metaStats);

    // Place player at center
    Player.place(canvasW / 2, canvasH / 2);
    Player.setTarget(canvasW / 2, canvasH / 2);

    // Init systems
    Projectiles.init();
    Pickups.init();
    InGameUpgrades.reset();
    Enemies.clear();

    XPSystem.init((level) => {
      onLevelUp(level);
    });

    Waves.init(canvasW, canvasH, (waveIdx) => {
      onWaveComplete(waveIdx);
    });

    // Apply meta start upgrades
    if (MetaUpgrades.isUnlocked('nuclear_pore')) {
      const picks = InGameUpgrades.getRandomPicks(1);
      if (picks[0]) InGameUpgrades.applyUpgrade(picks[0].id);
    }
    if (MetaUpgrades.isUnlocked('nk_lineage')) {
      InGameUpgrades.applyUpgrade('nk_strike');
    }
    if (MetaUpgrades.isUnlocked('immortalized_line')) {
      InGameUpgrades.applyUpgrade('cytokine_shield');
    }

    // Setup helper cells
    helperCells = [];
    const pState = Player.getState();
    if (pState && pState.helperCells > 0) {
      for (let i = 0; i < pState.helperCells; i++) {
        spawnHelperCell();
      }
    }

    // Run state
    gameTime = 0;
    score = 0;
    waveIndex = 0;
    aoeEffects = [];
    damageNumbers = [];
    nextPickCount = 3;
    rerolls = MetaUpgrades.getMetaStat('rerolls');
    Screens.resetFireworks();

    Waves.startWave(0);
    waveTransitionAlpha = 1;
    waveTransitionTimer = 2;

    gameState = 'playing';
    Audio.sfx.waveStart();
    saveData.totalRuns++;
    Storage.save(saveData);
  }

  function spawnHelperCell() {
    const angle = Math.random() * Math.PI * 2;
    const pState = Player.getState();
    if (!pState) return;
    helperCells.push({
      x: pState.x + Math.cos(angle) * 40,
      y: pState.y + Math.sin(angle) * 40,
      angle: angle,
      orbitAngle: angle,
      shootTimer: 800,
      wobble: 0,
      wobblePhase: Math.random() * Math.PI * 2
    });
  }

  function onLevelUp(level) {
    Audio.sfx.levelUp();

    // Exosome burst
    const pState = Player.getState();
    if (pState && pState.levelUpAoe) {
      aoeEffects.push({ x: pState.x, y: pState.y, radius: pState.levelUpAoeRadius, maxRadius: pState.levelUpAoeRadius, timer: 0.6, progress: 0 });
      const enemies = Enemies.getActive();
      enemies.forEach(e => {
        const dx = e.x - pState.x, dy = e.y - pState.y;
        if (Math.sqrt(dx * dx + dy * dy) < pState.levelUpAoeRadius) {
          e.hp -= pState.levelUpAoeDamage;
          if (e.hp <= 0) e.alive = false;
        }
      });
    }

    const pState2 = Player.getState();
    const count = (pState2 && pState2.nextPickCount > 0) ? 3 + pState2.nextPickCount : 3;
    if (pState2) pState2.nextPickCount = 0;

    const picks = InGameUpgrades.getRandomPicks(count);
    UpgradeUI.show(picks, rerolls, (selected) => {
      InGameUpgrades.applyUpgrade(selected.id);
      gameState = 'playing';

      // Helper cell spawn on upgrade
      const ps = Player.getState();
      if (ps && ps.helperCells > helperCells.length) {
        spawnHelperCell();
      }
    });
    gameState = 'levelup';
  }

  function onWaveComplete(waveIdx) {
    // Guard: ignore stale callbacks if game is no longer in play
    if (gameState !== 'playing' && gameState !== 'levelup') return;

    const pState = Player.getState();

    // Refresh shield
    Player.refreshShield();

    // Wave stat bonus
    if (pState && pState.waveStatBonus > 0) {
      const bonus = pState.waveStatBonus;
      pState.damage *= (1 + bonus);
      pState.speed *= (1 + bonus);
      pState.maxHp = Math.ceil(pState.maxHp * (1 + bonus));
    }

    waveIndex++;

    if (waveIndex >= Waves.getTotalWaves()) {
      // Win!
      endRun(true);
      return;
    }

    // Safety: if config is somehow missing, treat as win rather than hanging
    if (!Waves.getConfig(waveIndex)) {
      console.warn('[RCELL] No wave config for index', waveIndex, '— forcing win');
      endRun(true);
      return;
    }

    // Spawn health pickup
    Pickups.spawnHealth(canvasW / 2 + (Math.random() - 0.5) * 100, canvasH / 2 + (Math.random() - 0.5) * 100, 25);

    Waves.startWave(waveIndex);
    waveTransitionAlpha = 1;
    waveTransitionTimer = 2;

    if (Waves.isBossWave()) try { Audio.sfx.bossSpawn(); } catch (e) {}
    else try { Audio.sfx.waveStart(); } catch (e) {}
  }

  function endRun(won) {
    const pState = Player.getState();
    // DNA formula: score/200 + wave*2 + win bonus — scaled down to make upgrades matter
    const dnaEarned = Math.floor(score / 200) + waveIndex * 2 + (won ? 10 : 0);

    // Set game state FIRST — prevents the level-11 freeze if storage throws below
    if (won) {
      Screens.winScreen.score = score;
      Screens.winScreen.dnaEarned = dnaEarned;
      gameState = 'win';
      try { Audio.sfx.win(); } catch (e) { /* audio failure is non-fatal */ }
    } else {
      Screens.deathScreen.waveReached = waveIndex;
      Screens.deathScreen.score = score;
      Screens.deathScreen.dnaEarned = dnaEarned;
      gameState = 'death';
      try { Audio.sfx.playerDie(); } catch (e) { /* audio failure is non-fatal */ }
    }

    // Persist — wrapped so a storage failure can't leave the game in a broken state
    try {
      saveData.dnaPoints += dnaEarned;
      saveData.totalKills = (saveData.totalKills || 0) + (pState ? pState.kills : 0);
      if (waveIndex > saveData.bestWave) saveData.bestWave = waveIndex;
      if (won) saveData.hasWon = true;
      Storage.save(saveData);
    } catch (e) {
      console.error('[RCELL] Failed to save run data:', e);
    }
  }

  function processPlayerShooting(dt) {
    if (!Player.canShoot()) return;
    const pState = Player.getState();
    if (!pState) return;

    const enemies = Enemies.getActive();
    if (enemies.length === 0) return;

    // Find nearest enemy
    let nearest = null, nearDist = Infinity;
    enemies.forEach(e => {
      const dx = e.x - pState.x, dy = e.y - pState.y;
      const d = dx * dx + dy * dy;
      if (d < nearDist) { nearDist = d; nearest = e; }
    });

    if (!nearest) return;
    Player.resetShootTimer();

    const angle = Math.atan2(nearest.y - pState.y, nearest.x - pState.x);
    const count = pState.projectileCount;
    const spread = pState.spreadAngle;
    const angles = Projectiles.buildSpreadAngles(angle, count, spread);
    Projectiles.fire(pState.x, pState.y, angle, pState, angles);
    Audio.sfx.shoot();
  }

  function processAoe(dt) {
    const pState = Player.getState();
    if (!pState || !Player.canAoe()) return;
    Player.resetAoeTimer();

    const enemies = Enemies.getActive();
    enemies.forEach(e => {
      const dx = e.x - pState.x, dy = e.y - pState.y;
      if (Math.sqrt(dx * dx + dy * dy) < pState.aoeRadius) {
        e.hp -= pState.aoeDamage;
        if (e.hp <= 0) e.alive = false;
      }
    });

    aoeEffects.push({ x: pState.x, y: pState.y, radius: pState.aoeRadius, progress: 0, timer: 0.5 });
    Audio.sfx.aoe();
  }

  function processAura(dt) {
    const pState = Player.getState();
    if (!pState || pState.auraDamage <= 0) return;
    const enemies = Enemies.getActive();
    enemies.forEach(e => {
      const dx = e.x - pState.x, dy = e.y - pState.y;
      if (Math.sqrt(dx * dx + dy * dy) < pState.auraRadius) {
        e.hp -= pState.auraDamage * dt;
        if (e.hp <= 0) e.alive = false;
      }
    });
  }

  function processSlowAura(dt) {
    const pState = Player.getState();
    if (!pState || pState.slowAuraRadius <= 0) return;
    const enemies = Enemies.getActive();
    enemies.forEach(e => {
      const dx = e.x - pState.x, dy = e.y - pState.y;
      if (Math.sqrt(dx * dx + dy * dy) < pState.slowAuraRadius) {
        Enemies.slowEnemy(e, pState.slowAmount, 0.5);
      }
    });
  }

  function processHelperCells(dt) {
    const pState = Player.getState();
    if (!pState) return;
    const enemies = Enemies.getActive();

    helperCells.forEach(hc => {
      hc.wobblePhase += dt * 3;
      hc.wobble = hc.wobblePhase;
      hc.orbitAngle += dt * 1.2;
      hc.x = pState.x + Math.cos(hc.orbitAngle) * 55;
      hc.y = pState.y + Math.sin(hc.orbitAngle) * 55;

      hc.shootTimer -= dt * 1000;
      if (hc.shootTimer <= 0 && enemies.length > 0) {
        hc.shootTimer = 1200;
        let nearest = null, nearDist = Infinity;
        enemies.forEach(e => {
          const dx = e.x - hc.x, dy = e.y - hc.y;
          const d = dx * dx + dy * dy;
          if (d < nearDist) { nearDist = d; nearest = e; }
        });
        if (nearest) {
          const angle = Math.atan2(nearest.y - hc.y, nearest.x - hc.x);
          Projectiles.fire(hc.x, hc.y, angle, { ...pState, projectileCount: 1, spreadAngle: 0, damage: pState.damage * 0.5 }, [angle]);
        }
      }
    });
  }

  function processProjectileHits(hits) {
    const pState = Player.getState();

    hits.forEach(({ enemy: e, damage }) => {
      score += Math.ceil(damage);
      damageNumbers.push({ x: e.x, y: e.y - e.radius, value: damage, color: '#ffffff', alpha: 1, vy: -60 });

      if (!e.alive) {
        // Enemy death
        Player.onKill();
        score += e.scoreValue || 0;

        // XP drop
        const xpVal = e.xpValue || 5;
        for (let i = 0; i < Math.ceil(xpVal / 5); i++) {
          Pickups.spawnXP(e.x, e.y, Math.min(5, xpVal));
        }

        // Health drop chance
        if (Math.random() < 0.08) {
          Pickups.spawnHealth(e.x, e.y, 15);
        }

        // Split on death
        if (e.splitOnDeath && e.splitCount > 0) {
          for (let i = 0; i < e.splitCount; i++) {
            const a = (i / e.splitCount) * Math.PI * 2;
            const sx = e.x + Math.cos(a) * 20;
            const sy = e.y + Math.sin(a) * 20;
            Enemies.createEnemy(e.splitId, sx, sy, { hp: 20, maxHp: 20, radius: 8 });
          }
        }

        // Kill explosion
        if (pState && pState.killExplosionChance > 0 && Math.random() < pState.killExplosionChance) {
          const enemies2 = Enemies.getActive();
          enemies2.forEach(e2 => {
            const dx = e2.x - e.x, dy = e2.y - e.y;
            if (Math.sqrt(dx * dx + dy * dy) < pState.explosionRadius) {
              e2.hp -= pState.explosionDamage;
              if (e2.hp <= 0) e2.alive = false;
            }
          });
          aoeEffects.push({ x: e.x, y: e.y, radius: pState.explosionRadius, progress: 0, timer: 0.4 });
        }

        Audio.sfx.enemyDie();
      } else if (pState && pState.repelOnHit) {
        // Repel
        const dx = e.x - pState.x, dy = e.y - pState.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const enemies2 = Enemies.getActive();
        enemies2.forEach(e2 => {
          const dx2 = e2.x - e.x, dy2 = e2.y - e.y;
          const d2 = Math.sqrt(dx2 * dx2 + dy2 * dy2) || 1;
          if (d2 < pState.repelRadius) {
            e2.x += (dx2 / d2) * pState.repelForce * 0.1;
            e2.y += (dy2 / d2) * pState.repelForce * 0.1;
          }
        });
      }
    });
  }

  function processEnemyCollisions(dt) {
    const pState = Player.getState();
    if (!pState) return;
    const playerR = Player.getRadius();

    // Player vs enemy contacts
    const enemies = Enemies.getActive();
    enemies.forEach(e => {
      if (!e.alive) return;
      const dx = pState.x - e.x, dy = pState.y - e.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < playerR + e.radius) {
        const dmgDealt = Player.takeDamage(e.damage * dt, e.x, e.y);
        if (dmgDealt > 0) {
          Audio.sfx.playerHurt();
          damageNumbers.push({ x: pState.x, y: pState.y - 30, value: dmgDealt, color: '#ff4466', alpha: 1, vy: -80 });
        }

        if (Player.isPlayerDead()) {
          endRun(false);
        }
      }
    });

    // Enemy projectiles vs player
    const enemyProjs = Enemies.getProjectiles();
    for (let i = enemyProjs.length - 1; i >= 0; i--) {
      const p = enemyProjs[i];
      const dx = pState.x - p.x, dy = pState.y - p.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < playerR + p.radius) {
        p.alive = false;
        const dmgDealt = Player.takeDamage(p.damage, p.x, p.y);
        if (dmgDealt > 0) {
          Audio.sfx.playerHurt();
          damageNumbers.push({ x: pState.x, y: pState.y - 30, value: dmgDealt, color: '#ff4466', alpha: 1, vy: -80 });
          if (Player.isPlayerDead()) endRun(false);
        }
      }
    }
  }

  function update(dt) {
    if (gameState !== 'playing') return;
    gameTime += dt;

    const pState = Player.getState();
    if (!pState || Player.isPlayerDead()) return;

    const enemySpeedRed = MetaUpgrades.getMetaStat('enemySpeedReduction');

    Player.update(dt, canvasW, canvasH, Enemies.getActive());
    Enemies.update(dt, pState.x, pState.y, canvasW, canvasH, enemySpeedRed);
    Waves.update(dt, canvasW, canvasH);

    processPlayerShooting(dt);
    processAoe(dt);
    processAura(dt);
    processSlowAura(dt);
    processHelperCells(dt);

    const hits = Projectiles.update(dt, canvasW, canvasH, Enemies.getActive(), pState);
    processProjectileHits(hits);
    processEnemyCollisions(dt);

    // Pickup collection
    Pickups.update(dt, pState.x, pState.y, pState.pickupRadius, pState, XPSystem, MetaUpgrades.getMetaStat('pickupValueMultiplier') || 1);

    // Clot trail damage
    const clots = Player.getClotTrails();
    if (clots.length > 0) {
      Enemies.getActive().forEach(e => {
        clots.forEach(c => {
          const dx = e.x - c.x, dy = e.y - c.y;
          if (Math.sqrt(dx * dx + dy * dy) < 18) {
            e.hp -= c.damage * dt;
            if (e.hp <= 0) e.alive = false;
          }
        });
      });
    }

    // AoE effects
    for (let i = aoeEffects.length - 1; i >= 0; i--) {
      const fx = aoeEffects[i];
      fx.timer -= dt;
      fx.progress = 1 - fx.timer / 0.5;
      if (fx.timer <= 0) aoeEffects.splice(i, 1);
    }

    // Damage numbers
    for (let i = damageNumbers.length - 1; i >= 0; i--) {
      const dn = damageNumbers[i];
      dn.y += dn.vy * dt;
      dn.vy *= 0.92;
      dn.alpha -= dt * 1.5;
      if (dn.alpha <= 0) damageNumbers.splice(i, 1);
    }

    // Wave banner
    if (waveTransitionTimer > 0) {
      waveTransitionTimer -= dt;
      waveTransitionAlpha = Math.min(1, waveTransitionTimer);
    }
  }

  function render(t) {
    ctx.clearRect(0, 0, canvasW, canvasH);
    const gameSecs = t / 1000;

    if (gameState === 'menu') {
      Screens.mainMenu.draw(ctx, canvasW, canvasH, gameSecs, saveData);
      return;
    }
    if (gameState === 'meta') {
      MetaScreen.draw(ctx, canvasW, canvasH, saveData);
      return;
    }
    if (gameState === 'death') {
      Screens.deathScreen.draw(ctx, canvasW, canvasH, gameSecs);
      return;
    }
    if (gameState === 'win') {
      Screens.winScreen.draw(ctx, canvasW, canvasH, gameSecs);
      return;
    }

    // Playing / levelup
    Renderer.drawBackground(canvasW, canvasH, gameSecs);

    const pState = Player.getState();

    // Aura
    if (pState && pState.auraDamage > 0) {
      Renderer.drawAura(pState.x, pState.y, pState.auraRadius, 'rgba(74,240,176,0.3)', gameSecs);
    }
    if (pState && pState.slowAuraRadius > 0) {
      Renderer.drawAura(pState.x, pState.y, pState.slowAuraRadius, 'rgba(68,170,255,0.2)', gameSecs);
    }

    // Clot trails
    Player.getClotTrails().forEach(c => Renderer.drawClotTrail(c, gameSecs));

    // Pickups
    Pickups.getXPActive().forEach(o => Renderer.drawXPOrb(o, gameSecs));
    Pickups.getHealthActive().forEach(h => Renderer.drawHealthPickup(h, gameSecs));

    // Enemies
    Enemies.getActive().forEach(e => Renderer.drawEnemy(e, gameSecs));

    // Enemy projectiles
    Enemies.getProjectiles().forEach(p => Renderer.drawEnemyProjectile(p));

    // Player projectiles
    Projectiles.getActive().forEach(p => Renderer.drawProjectile(p, gameSecs));

    // Helper cells
    helperCells.forEach(hc => Renderer.drawHelperCell(hc, gameSecs));

    // Player
    if (pState) {
      Renderer.drawPlayer(
        pState,
        Player.getWobblePhase(),
        Player.isInvincible(),
        Player.getIsPhasing(),
        gameSecs
      );
    }

    // AoE effects
    aoeEffects.forEach(fx => Renderer.drawAoeEffect(fx.x, fx.y, fx.radius, fx.progress));

    // Damage numbers
    damageNumbers.forEach(dn => Renderer.drawDamageNumber(dn.x, dn.y, dn.value, dn.color, dn.alpha));

    // HUD
    HUD.draw(ctx, canvasW, canvasH, pState, XPSystem, waveIndex, Waves.getTotalWaves(), gameTime, score);

    // Wave banner
    if (waveTransitionAlpha > 0) {
      HUD.drawWaveBanner(ctx, canvasW, canvasH, waveIndex, waveTransitionAlpha);
    }

    // Upgrade cards overlay
    if (gameState === 'levelup') {
      UpgradeUI.draw(ctx, canvasW, canvasH, 1 / 60);
    }
  }

  // Error recovery state
  let errorState = null;
  let errorOverlayTimer = 0;
  let consecutiveErrors = 0;

  function startLoop() {
    running = true;
    lastTime = performance.now();
    rafId = requestAnimationFrame(loop);
  }

  function showErrorOverlay(err) {
    if (!ctx) return;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.fillRect(0, 0, canvasW, canvasH);
    ctx.fillStyle = '#ff4466';
    ctx.font = 'bold 18px "Exo 2", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Game Error — Auto-recovering...', canvasW / 2, canvasH / 2 - 30);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '12px monospace';
    const msg = String(err && err.message ? err.message : err).slice(0, 80);
    ctx.fillText(msg, canvasW / 2, canvasH / 2 + 4);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.font = '11px "Nunito", sans-serif';
    ctx.fillText('Tap to return to menu', canvasW / 2, canvasH / 2 + 30);
    ctx.restore();
  }

  function attemptErrorRecovery(err) {
    console.error('[RCELL] Game error:', err);
    consecutiveErrors++;
    errorState = err;
    errorOverlayTimer = 3; // show overlay for 3 seconds before auto-recovering

    if (consecutiveErrors >= 5) {
      // Too many errors in a row — force back to menu
      console.error('[RCELL] Too many consecutive errors, forcing menu state');
      gameState = 'menu';
      consecutiveErrors = 0;
      errorState = null;
    }
  }

  function loop(timestamp) {
    if (!running) return;

    const dt = Math.min((timestamp - lastTime) / 1000, 0.05);
    lastTime = timestamp;

    try {
      if (errorState) {
        // Show error overlay and count down recovery
        errorOverlayTimer -= dt;
        showErrorOverlay(errorState);
        if (errorOverlayTimer <= 0) {
          errorState = null;
          // Recover: if we were playing, go back to menu to avoid cascade
          if (gameState === 'playing' || gameState === 'levelup') {
            gameState = 'menu';
          }
        }
        rafId = requestAnimationFrame(loop);
        return;
      }

      if (gameState === 'playing' || gameState === 'levelup') {
        if (gameState === 'playing') {
          accumulator += dt;
          while (accumulator >= FIXED_STEP) {
            update(FIXED_STEP);
            accumulator -= FIXED_STEP;
          }
        }
      }

      render(timestamp);
      consecutiveErrors = 0; // reset on successful frame
    } catch (err) {
      attemptErrorRecovery(err);
    }

    rafId = requestAnimationFrame(loop);
  }

  function stop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
  }

  function getSaveData() { return saveData; }

  return { init, setData, startRun, stop, getSaveData };
})();
