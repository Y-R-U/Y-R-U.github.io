// player.js — Player cell logic, stats, shooting
const Player = (() => {
  const BASE_STATS = {
    maxHp: 100,
    hp: 100,
    speed: 160,
    damage: 8,
    fireRate: 600,      // ms between shots
    projectileCount: 1,
    projectileSpeed: 300,
    projectileSize: 6,
    spreadAngle: 0,
    radius: 22,
    pickupRadius: 50,
    hpRegen: 0,
    damageReduction: 0,
    speedMultiplier: 1,
    radiusMultiplier: 1,
    critChance: 0,
    critMultiplier: 3,
    poisonDamage: 0,
    poisonDuration: 3,
    chainCount: 0,
    auraDamage: 0,
    auraRadius: 0,
    shieldCharges: 0,
    dodgeChance: 0,
    dashDamage: 0,
    killExplosionChance: 0,
    explosionDamage: 0,
    explosionRadius: 0,
    slowAuraRadius: 0,
    slowAmount: 0,
    markDamageBonus: 0,
    weakPointDamage: 0,
    helperCells: 0,
    xpToHeal: 0,
    fireRateMultiplier: 1,
    clotTrail: false,
    clotDamage: 0,
    repelOnHit: false,
    repelForce: 0,
    repelRadius: 0,
    aoeInterval: 0,
    aoeDamage: 0,
    aoeRadius: 0,
    dashCooldown: 3000,
    phaseCooldown: 5000,
    phaseDuration: 1500,
    speedBurst: false,
    burstMultiplier: 2,
    burstInterval: 5000,
    burstDuration: 1000,
    macrophageMemory: false,
    waveStatBonus: 0,
    levelUpAoe: false,
    levelUpAoeDamage: 0,
    levelUpAoeRadius: 0,
    nextPickCount: 0,
    killsPerArmor: 5,
    maxArmor: 5,
    armor: 0,
    kills: 0,
    perforinUnlocked: false,
    chemotaxis: false,
    knockbackReduction: 0
  };

  let state = null;
  let targetX = 0, targetY = 0;
  let shootTimer = 0;
  let aoeTimer = 0;
  let burstTimer = 0;
  let phaseTimer = 0;
  let isPhasing = false;
  let lastX = 0, lastY = 0;
  let helperCellEntities = [];
  let clotTrails = [];
  let appliedUpgrades = {};
  let isDead = false;
  let invincibleTimer = 0;
  const INVINCIBLE_DURATION = 800;
  let wobblePhase = 0;

  function getBaseStats() { return { ...BASE_STATS }; }

  function init(metaStats = {}) {
    state = Object.assign({}, BASE_STATS, metaStats);
    state.hp = state.maxHp;
    targetX = 0;
    targetY = 0;
    shootTimer = 0;
    aoeTimer = 0;
    burstTimer = 0;
    phaseTimer = 0;
    isPhasing = false;
    helperCellEntities = [];
    clotTrails = [];
    appliedUpgrades = {};
    isDead = false;
    invincibleTimer = 0;
    wobblePhase = 0;
    return state;
  }

  function getState() { return state; }
  function getRadius() { return state.radius * state.radiusMultiplier; }
  function getEffectiveFireRate() { return state.fireRate * state.fireRateMultiplier; }

  function setTarget(x, y) {
    targetX = x;
    targetY = y;
  }

  function update(dt, canvasW, canvasH, enemies) {
    if (!state || isDead) return;
    wobblePhase += dt * 2.5;

    // Move toward target (smooth)
    const dx = targetX - state.x;
    const dy = targetY - state.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    const spd = state.speed * state.speedMultiplier * dt;

    if (d > 2) {
      const moveX = (dx / d) * Math.min(spd, d);
      const moveY = (dy / d) * Math.min(spd, d);

      // Clot trail
      if (state.clotTrail && (Math.abs(moveX) > 0.5 || Math.abs(moveY) > 0.5)) {
        clotTrails.push({ x: state.x, y: state.y, timer: state.clotDuration, damage: state.clotDamage });
      }

      lastX = state.x;
      lastY = state.y;
      state.x += moveX;
      state.y += moveY;
    }

    // Clamp to arena
    const r = getRadius();
    state.x = MathUtils.clamp(state.x, r, canvasW - r);
    state.y = MathUtils.clamp(state.y, r, canvasH - r);

    // Invincibility frames
    if (invincibleTimer > 0) invincibleTimer -= dt * 1000;

    // HP regen
    if (state.hpRegen > 0) {
      state.hp = Math.min(state.maxHp, state.hp + state.hpRegen * dt);
    }

    // Shoot timer
    shootTimer -= dt * 1000;

    // AoE timer
    if (state.aoeInterval > 0) {
      aoeTimer -= dt * 1000;
    }

    // Phase timer — auto-triggers when membrane_flux upgrade is active and cooldown has expired
    if (isPhasing) {
      phaseTimer -= dt * 1000;
      if (phaseTimer <= 0) {
        isPhasing = false;
        phaseTimer = state.phaseCooldown;  // start cooldown
      }
    } else if (phaseTimer > 0) {
      phaseTimer -= dt * 1000;
      if (phaseTimer <= 0 && hasUpgrade('membrane_flux')) {
        // Cooldown expired — immediately begin next phase
        isPhasing = true;
        phaseTimer = state.phaseDuration;
      }
    } else if (hasUpgrade('membrane_flux')) {
      // First trigger (phaseTimer starts at 0)
      isPhasing = true;
      phaseTimer = state.phaseDuration;
    }

    // Speed burst timer — cycles: active[0 → -burstDuration] then cooldown[-burstDuration → -(burstDuration+burstInterval)]
    if (state.speedBurst) {
      burstTimer -= dt * 1000;
      if (burstTimer < -(state.burstDuration + state.burstInterval)) {
        burstTimer = 0;
      }
    }

    // Update clot trails
    for (let i = clotTrails.length - 1; i >= 0; i--) {
      clotTrails[i].timer -= dt;
      if (clotTrails[i].timer <= 0) clotTrails.splice(i, 1);
    }

    // Kill-based armor
    if (state.killArmor) {
      state.armor = Math.min(state.maxArmor, Math.floor(state.kills / state.killsPerArmor));
    }
  }

  function canShoot() {
    return shootTimer <= 0;
  }

  function resetShootTimer() {
    shootTimer = getEffectiveFireRate();
  }

  function canAoe() {
    return state.aoeInterval > 0 && aoeTimer <= 0;
  }

  function resetAoeTimer() {
    aoeTimer = state.aoeInterval;
  }

  function isSpeedBurstActive() {
    return state.speedBurst && burstTimer > -state.burstDuration;
  }

  function getSpeedMultiplier() {
    let m = state.speedMultiplier;
    if (state.speedBurst && burstTimer > -state.burstDuration) m *= state.burstMultiplier;
    return m;
  }

  function takeDamage(amount, sourceX, sourceY) {
    if (!state || isDead || (invincibleTimer > 0)) return 0;
    if (isPhasing) return 0;

    // Dodge chance
    if (state.dodgeChance > 0 && Math.random() < state.dodgeChance) return 0;

    // Shield
    if (state.shieldCharges > 0) {
      state.shieldCharges--;
      return 0;
    }

    // Damage reduction + armor
    let dmg = amount * (1 - state.damageReduction);
    dmg = Math.max(0, dmg - state.armor);
    dmg = Math.ceil(dmg);

    state.hp -= dmg;
    if (dmg > 0) invincibleTimer = INVINCIBLE_DURATION;

    if (state.hp <= 0) {
      state.hp = 0;
      isDead = true;
    }

    return dmg;
  }

  function heal(amount) {
    if (!state) return;
    state.hp = Math.min(state.maxHp, state.hp + amount);
  }

  function onKill() {
    if (!state) return;
    state.kills++;
  }

  function isPlayerDead() { return isDead; }
  function isInvincible() { return invincibleTimer > 0; }
  function getIsPhasing() { return isPhasing; }
  function getWobblePhase() { return wobblePhase; }
  function getClotTrails() { return clotTrails; }

  function applyUpgrade(upgrade, isDoubled) {
    if (!state || !upgrade) return;
    const effect = upgrade.effect;
    const multiplier = isDoubled ? 1.5 : 1;

    const applyEffect = (stat, op, value) => {
      if (op === 'add') {
        state[stat] = (state[stat] || 0) + value * multiplier;
      } else if (op === 'multiply') {
        if (value < 1) {
          // Reduction: apply proportionally
          const reduction = 1 - value;
          state[stat] = (state[stat] || 1) * (1 - reduction * multiplier);
        } else {
          // Increase: apply proportionally
          const increase = value - 1;
          state[stat] = (state[stat] || 1) * (1 + increase * multiplier);
        }
      } else if (op === 'set') {
        state[stat] = value;
      }
    };

    applyEffect(effect.stat, effect.op, effect.value);

    // Handle multi-property effects
    if (effect.poisonDuration !== undefined) state.poisonDuration = effect.poisonDuration;
    if (effect.critMultiplier !== undefined) state.critMultiplier = effect.critMultiplier;
    if (effect.aoeDamage !== undefined) state.aoeDamage = effect.aoeDamage;
    if (effect.aoeRadius !== undefined) state.aoeRadius = effect.aoeRadius;
    if (effect.explosionDamage !== undefined) state.explosionDamage = effect.explosionDamage;
    if (effect.explosionRadius !== undefined) state.explosionRadius = effect.explosionRadius;
    if (effect.repelForce !== undefined) state.repelForce = effect.repelForce;
    if (effect.repelRadius !== undefined) state.repelRadius = effect.repelRadius;
    if (effect.slowAmount !== undefined) state.slowAmount = effect.slowAmount;
    // clotDamage: ADD rather than SET so meta bonuses already on state are preserved
    if (effect.clotDamage !== undefined) state.clotDamage = (state.clotDamage || 0) + effect.clotDamage;
    if (effect.clotDuration !== undefined) state.clotDuration = Math.max(state.clotDuration || 0, effect.clotDuration);
    if (effect.dashCooldown !== undefined) state.dashCooldown = effect.dashCooldown;
    if (effect.phaseCooldown !== undefined) state.phaseCooldown = effect.phaseCooldown;
    if (effect.phaseDuration !== undefined) state.phaseDuration = effect.phaseDuration;
    if (effect.burstMultiplier !== undefined) state.burstMultiplier = effect.burstMultiplier;
    if (effect.burstInterval !== undefined) state.burstInterval = effect.burstInterval;
    if (effect.burstDuration !== undefined) state.burstDuration = effect.burstDuration;
    if (effect.levelUpAoeDamage !== undefined) state.levelUpAoeDamage = effect.levelUpAoeDamage;
    if (effect.levelUpAoeRadius !== undefined) state.levelUpAoeRadius = effect.levelUpAoeRadius;
    if (effect.killsPerArmor !== undefined) state.killsPerArmor = effect.killsPerArmor;
    if (effect.maxArmor !== undefined) state.maxArmor = effect.maxArmor;

    // Damage multiplier on heavy_immunoglobulin
    if (effect.stat === 'projectileSize' && effect.damage !== undefined) {
      state.damage *= effect.damage;
    }

    // HP adjustment when maxHp changes
    if (effect.stat === 'maxHp') {
      state.hp = Math.min(state.hp + effect.value * multiplier, state.maxHp);
    }

    // Track applied
    if (appliedUpgrades[upgrade.id]) {
      appliedUpgrades[upgrade.id]++;
    } else {
      appliedUpgrades[upgrade.id] = 1;
    }
  }

  function hasUpgrade(id) {
    return (appliedUpgrades[id] || 0) > 0;
  }

  function getUpgradeCount(id) {
    return appliedUpgrades[id] || 0;
  }

  function place(x, y) {
    if (state) { state.x = x; state.y = y; }
    targetX = x;
    targetY = y;
  }

  function refreshShield() {
    if (state && hasUpgrade('cytokine_shield')) {
      state.shieldCharges = 3;
    }
  }

  return {
    init, getBaseStats, getState, getRadius, getEffectiveFireRate, setTarget, update,
    canShoot, resetShootTimer, canAoe, resetAoeTimer,
    takeDamage, heal, onKill, isPlayerDead, isInvincible, getIsPhasing,
    getWobblePhase, getClotTrails, applyUpgrade, hasUpgrade, getUpgradeCount,
    place, refreshShield, isSpeedBurstActive, getSpeedMultiplier
  };
})();
