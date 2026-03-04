/* ===== GAME ENGINE ===== */
const Game = (() => {
  const SAVE_KEY = 'miniwar_save';

  let state = null;
  let running = false;
  let lastTime = 0;

  // Game entities
  let playerUnits = [];
  let enemyUnits = [];
  let projectiles = [];
  let particles = [];
  let damageNumbers = [];
  let specialEffects = [];

  // Bases
  let playerBase = {};
  let enemyBase = {};

  // AI
  let aiNextSpawnTime = 0;
  let aiSpawnInterval = 3000;
  let currentEnemy = null;

  // Gold income timer
  let lastGoldTick = 0;

  function getState() { return state; }

  function getSavedNationName() {
    const saved = loadSave();
    return saved ? saved.nationName : null;
  }

  function loadSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function save() {
    const data = {
      nationName: state.nationName,
      evolvePoints: state.evolvePoints,
      evolveLevels: state.evolveLevels,
      totalEvolves: state.totalEvolves,
      highestAge: state.highestAge,
      highestWave: state.highestWave,
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  }

  function startGame(nationName) {
    const saved = loadSave();

    state = {
      nationName: nationName,
      gold: CONFIG.STARTING_GOLD,
      xp: 0,
      xpToNext: 100,
      level: 1,
      ageIndex: 0,
      wave: 1,
      battleWave: 1,
      evolvePoints: saved ? saved.evolvePoints : 0,
      evolveLevels: saved ? { ...saved.evolveLevels } : {},
      totalEvolves: saved ? saved.totalEvolves : 0,
      highestAge: saved ? saved.highestAge : 0,
      highestWave: saved ? saved.highestWave : 0,
      playerBaseHp: 0,
      playerBaseMaxHp: 0,
      enemyBaseHp: 0,
      enemyBaseMaxHp: 0,
      specialCooldownLeft: 0,
      paused: false,
    };

    save();
    initBattle();
    UI.showHUD();
    UI.buildUnitBar(state.ageIndex);
    AudioManager.playThemeMusic(state.ageIndex);

    if (!running) {
      running = true;
      lastTime = performance.now();
      requestAnimationFrame(gameLoop);
    }
  }

  function initBattle() {
    // Pick a random enemy
    currentEnemy = CONFIG.ENEMY_NATIONS[Math.floor(Math.random() * CONFIG.ENEMY_NATIONS.length)];

    // Calculate base HP with evolve bonuses
    const hpBonus = 1 + (state.evolveLevels.ep_hp || 0) * 0.15;
    const baseHp = CONFIG.BASE_HP * hpBonus;
    const waveMultiplier = Math.pow(CONFIG.WAVE_HP_SCALE, state.wave - 1);
    const enemyHpTotal = CONFIG.BASE_HP * waveMultiplier * 1.2;

    state.playerBaseHp = Math.round(baseHp);
    state.playerBaseMaxHp = Math.round(baseHp);
    state.enemyBaseHp = Math.round(enemyHpTotal);
    state.enemyBaseMaxHp = Math.round(enemyHpTotal);

    // Set base positions
    playerBase = {
      x: Graphics.getWidth() * CONFIG.PLAYER_BASE_X,
      hp: state.playerBaseHp,
      maxHp: state.playerBaseMaxHp,
    };
    enemyBase = {
      x: Graphics.getWidth() * CONFIG.ENEMY_BASE_X,
      hp: state.enemyBaseHp,
      maxHp: state.enemyBaseMaxHp,
    };

    // Reset entities
    playerUnits = [];
    enemyUnits = [];
    projectiles = [];
    particles = [];
    damageNumbers = [];
    specialEffects = [];

    // AI settings scale with wave
    aiSpawnInterval = Math.max(1200, 3000 - state.wave * 100);
    aiNextSpawnTime = performance.now() + 2000;
    lastGoldTick = performance.now();

    state.battleWave = 1;
  }

  function gameLoop(time) {
    if (!running) return;
    requestAnimationFrame(gameLoop);

    const dt = Math.min(time - lastTime, 50); // cap delta
    lastTime = time;

    if (state.paused) {
      render(time);
      return;
    }

    update(time, dt);
    render(time);
  }

  function update(time, dt) {
    // Gold income
    if (time - lastGoldTick >= 1000) {
      const goldMult = 1 + (state.evolveLevels.ep_gold || 0) * 0.20;
      state.gold += CONFIG.GOLD_PER_SECOND * goldMult;
      lastGoldTick = time;
    }

    // Sync base HP to state
    state.playerBaseHp = playerBase.hp;
    state.enemyBaseHp = enemyBase.hp;

    // Special cooldown
    if (state.specialCooldownLeft > 0) {
      state.specialCooldownLeft = Math.max(0, state.specialCooldownLeft - dt);
    }

    // AI spawning
    if (time >= aiNextSpawnTime) {
      spawnEnemyUnit(time);
      // Vary spawn interval
      const variance = 0.5 + Math.random();
      aiNextSpawnTime = time + aiSpawnInterval * variance;
    }

    // Merge all units for targeting
    const allUnits = [...playerUnits, ...enemyUnits];

    // Update units (pass allUnits for cross-side targeting)
    Units.update(playerUnits, allUnits, playerBase, enemyBase, projectiles, particles, damageNumbers, time, dt);
    Units.update(enemyUnits, allUnits, playerBase, enemyBase, projectiles, particles, damageNumbers, time, dt);

    // Update projectiles
    Units.updateProjectiles(projectiles, allUnits, playerBase, enemyBase, particles, damageNumbers, time, dt);

    // Update particles
    Units.updateParticles(particles, dt);
    Units.updateDamageNumbers(damageNumbers, dt);

    // Update special effects
    for (let i = specialEffects.length - 1; i >= 0; i--) {
      specialEffects[i].progress += dt / 600;
      if (specialEffects[i].progress >= 1) specialEffects.splice(i, 1);
    }

    // Sync HP back
    state.playerBaseHp = playerBase.hp;
    state.enemyBaseHp = enemyBase.hp;

    // Give kill rewards (once per unit)
    for (let i = enemyUnits.length - 1; i >= 0; i--) {
      const u = enemyUnits[i];
      if (u.state === 'dying' && !u.rewardGiven) {
        u.rewardGiven = true;
        const xpMult = 1 + (state.evolveLevels.ep_xp || 0) * 0.25;
        state.xp += CONFIG.XP_PER_KILL * xpMult;
        state.gold += CONFIG.GOLD_PER_KILL_BASE + state.wave;

        // Level up check
        while (state.xp >= state.xpToNext) {
          state.xp -= state.xpToNext;
          state.level++;
          state.xpToNext = Math.round(100 * Math.pow(1.15, state.level - 1));
        }
      }
    }

    // Check win/loss
    if (enemyBase.hp <= 0) {
      onVictory();
    } else if (playerBase.hp <= 0) {
      onDefeat();
    }

    // Update HUD
    UI.updateHUD(state);
    UI.updateCooldowns(time);
  }

  function render(time) {
    Graphics.clear();

    // Background
    const age = CONFIG.AGES[state.ageIndex];
    Graphics.drawBackground(age.bgTheme, state.ageIndex);

    // Bases
    Graphics.drawBase(playerBase.x, Graphics.getGroundY(), playerBase.hp, playerBase.maxHp, true, state.ageIndex);
    Graphics.drawBase(enemyBase.x, Graphics.getGroundY(), enemyBase.hp, enemyBase.maxHp, false, state.ageIndex);

    // Units (sort by x for depth)
    const allUnits = [...playerUnits, ...enemyUnits].sort((a, b) => a.x - b.x);
    allUnits.forEach(u => {
      if (u.state !== 'dying' || (time - u.deathTime) < 400) {
        if (u.state === 'dying') {
          Graphics.getCtx().globalAlpha = 1 - (time - u.deathTime) / 400;
        }
        Graphics.drawUnit(u, time);
        Graphics.getCtx().globalAlpha = 1;
      }
    });

    // Projectiles
    projectiles.forEach(p => Graphics.drawProjectile(p));

    // Particles
    particles.forEach(p => Graphics.drawParticle(p));

    // Special effects
    specialEffects.forEach(e => Graphics.drawSpecialAttack(e.x, e.progress));

    // Damage numbers
    damageNumbers.forEach(d => Graphics.drawDamageNumber(d));

    // Enemy name tag
    if (currentEnemy) {
      const ctx = Graphics.getCtx();
      ctx.font = `bold ${10 * Graphics.getScale()}px system-ui`;
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillText(currentEnemy.short, enemyBase.x, Graphics.getGroundY() + 18);
      ctx.fillStyle = currentEnemy.color;
      ctx.fillText(currentEnemy.short, enemyBase.x, Graphics.getGroundY() + 17);
    }
  }

  // ===== PLAYER ACTIONS =====
  function spawnPlayerUnit(unitIndex) {
    const age = CONFIG.AGES[state.ageIndex];
    const unitDef = age.units[unitIndex];
    if (!unitDef) return;

    if (state.gold < unitDef.cost) return;
    if (UI.isUnitOnCooldown(unitDef.id, performance.now())) return;

    state.gold -= unitDef.cost;
    UI.setUnitCooldown(unitDef.id, performance.now());

    const evolveBonus = {
      atk: state.evolveLevels.ep_atk || 0,
      speed: state.evolveLevels.ep_speed || 0,
    };

    const unit = Units.createUnit(unitDef, true, state.ageIndex, evolveBonus, null);
    playerUnits.push(unit);
  }

  function spawnEnemyUnit(time) {
    // Pick random unit from current age (enemy scales with wave)
    const ageIdx = Math.min(state.ageIndex, CONFIG.AGES.length - 1);
    const age = CONFIG.AGES[ageIdx];
    const unitDef = age.units[Math.floor(Math.random() * age.units.length)];

    const waveScale = {
      hp: Math.pow(CONFIG.WAVE_HP_SCALE, state.wave - 1),
      atk: Math.pow(CONFIG.WAVE_ATK_SCALE, state.wave - 1),
    };

    const unit = Units.createUnit(unitDef, false, ageIdx, { atk: 0, speed: 0 }, waveScale);
    enemyUnits.push(unit);
  }

  function doSpecialAttack() {
    if (state.specialCooldownLeft > 0) return;
    state.specialCooldownLeft = CONFIG.SPECIAL_COOLDOWN;

    const specialMult = 1 + (state.evolveLevels.ep_special || 0) * 0.30;
    const damage = Math.round(CONFIG.SPECIAL_DAMAGE * specialMult * Math.pow(1.1, state.wave - 1));

    AudioManager.playSpecial();

    // Damage all enemy units and enemy base
    const midX = Graphics.getWidth() * 0.6;
    specialEffects.push({ x: midX, progress: 0 });

    // Damage enemies in range
    enemyUnits.forEach(u => {
      if (u.state !== 'dying' && Math.abs(u.x - midX) < 100) {
        u.hp -= damage;
        damageNumbers.push({
          x: u.x + (Math.random() - 0.5) * 10,
          y: Graphics.getGroundY() - 25,
          text: '-' + damage,
          color: '#ff6b6b',
          alpha: 1, vy: -1.5, life: 50,
        });
        if (u.hp <= 0 && u.state !== 'dying') {
          Units.killUnit(u, particles, performance.now());
        }
      }
    });

    // Also damage enemy base slightly
    const baseDmg = Math.round(damage * 0.3);
    enemyBase.hp = Math.max(0, enemyBase.hp - baseDmg);
  }

  function doAgeUp() {
    const age = CONFIG.AGES[state.ageIndex];
    if (!age.ageUpCost || state.gold < age.ageUpCost) return;
    if (state.ageIndex >= CONFIG.AGES.length - 1) return;

    state.gold -= age.ageUpCost;
    state.ageIndex++;
    if (state.ageIndex > state.highestAge) state.highestAge = state.ageIndex;

    UI.buildUnitBar(state.ageIndex);
    AudioManager.playThemeMusic(state.ageIndex);
    save();
  }

  function doEvolve() {
    const epGain = calcEvolvePointGain();
    if (epGain <= 0) return;

    state.evolvePoints += epGain;
    state.totalEvolves++;
    save();

    // Reset game progress but keep evolve
    state.gold = CONFIG.STARTING_GOLD;
    state.xp = 0;
    state.level = 1;
    state.ageIndex = 0;
    state.wave = 1;
    state.xpToNext = 100;
    state.specialCooldownLeft = 0;

    initBattle();
    UI.buildUnitBar(0);
    AudioManager.playThemeMusic(0);
  }

  function calcEvolvePointGain() {
    // Based on wave reached and age
    return Math.max(1, Math.floor(state.wave * 0.5) + state.ageIndex);
  }

  function buyEvolveUpgrade(id, cost) {
    if (state.evolvePoints < cost) return;
    const upg = CONFIG.EVOLVE_UPGRADES.find(u => u.id === id);
    if (!upg) return;
    const current = state.evolveLevels[id] || 0;
    if (current >= upg.maxLevel) return;

    state.evolvePoints -= cost;
    state.evolveLevels[id] = current + 1;
    save();
  }

  function onVictory() {
    state.paused = true;
    const goldReward = CONFIG.WAVE_GOLD_REWARD + state.wave * 15;
    const xpReward = 30 + state.wave * 10;
    const xpMult = 1 + (state.evolveLevels.ep_xp || 0) * 0.25;

    state.gold += goldReward;
    state.xp += Math.round(xpReward * xpMult);
    while (state.xp >= state.xpToNext) {
      state.xp -= state.xpToNext;
      state.level++;
      state.xpToNext = Math.round(100 * Math.pow(1.15, state.level - 1));
    }

    if (state.wave > state.highestWave) state.highestWave = state.wave;
    save();

    UI.showVictory({ gold: goldReward, xp: Math.round(xpReward * xpMult) });
  }

  function onDefeat() {
    state.paused = true;
    save();
    UI.showDefeat();
  }

  function nextWave() {
    state.wave++;
    state.paused = false;
    initBattle();
  }

  function retryBattle() {
    state.paused = false;
    state.gold = CONFIG.STARTING_GOLD + state.wave * 5;
    initBattle();
  }

  return {
    getState, getSavedNationName, startGame, spawnPlayerUnit,
    doSpecialAttack, doAgeUp, doEvolve, calcEvolvePointGain,
    buyEvolveUpgrade, nextWave, retryBattle,
  };
})();
