// enemies.js — Enemy definitions, AI, spawner
const Enemies = (() => {
  let enemyDefs = {};
  let activeEnemies = [];
  let spawnCallbacks = {};
  let canvas = null;
  let enemyProjectiles = [];

  function loadDefs(defsArray) {
    enemyDefs = {};
    defsArray.forEach(def => { enemyDefs[def.id] = def; });
  }

  function getDef(id) { return enemyDefs[id] || null; }
  function getAllDefs() { return Object.values(enemyDefs); }

  function createEnemy(id, x, y, overrides = {}) {
    const def = enemyDefs[id];
    if (!def) return null;
    const e = {
      id: def.id,
      type: def.id,
      name: def.name,
      tier: def.tier,
      hp: def.hp,
      maxHp: def.hp,
      speed: def.speed,
      damage: def.damage,
      radius: def.radius,
      xpValue: def.xpValue,
      scoreValue: def.scoreValue,
      shape: def.shape,
      color: def.color,
      behaviour: def.behaviour,
      x, y,
      vx: 0, vy: 0,
      angle: 0,
      wobblePhase: Math.random() * Math.PI * 2,
      pulsePhase: Math.random() * Math.PI * 2,
      alive: true,
      poisoned: false,
      poisonDamage: 0,
      poisonTimer: 0,
      poisonDuration: 0,
      marked: false,
      slowed: false,
      slowTimer: 0,
      immuneType: def.immuneType || null,
      splitOnDeath: def.splitOnDeath || false,
      splitCount: def.splitCount || 0,
      splitId: def.splitId || null,
      isBoss: def.isBoss || false,
      shootTimer: def.shootInterval || 3000,
      shootInterval: def.shootInterval || 3000,
      projectileDamage: def.projectileDamage || 8,
      projectileSpeed: def.projectileSpeed || 140,
      teleportTimer: def.teleportInterval || 3000,
      teleportInterval: def.teleportInterval || 3000,
      teleportRange: def.teleportRange || 120,
      minionTimer: def.minionInterval || 4000,
      minionInterval: def.minionInterval || 4000,
      minionId: def.minionId || null,
      growTimer: 0,
      growthRate: def.growthRate || 0,
      maxRadius: def.maxRadius || def.radius,
      baseRadius: def.radius,
      orbitAngle: Math.random() * Math.PI * 2,
      orbitDist: 150 + Math.random() * 80,
      orbitDiving: false,
      sineT: 0,
      corkscrewT: Math.random() * Math.PI * 2,
      chargeState: 'approach', // charge_retreat: approach, charge, retreat
      chargeTimer: 0,
      chargeDir: { x: 0, y: 0 },
      ...overrides
    };
    activeEnemies.push(e);
    return e;
  }

  function removeEnemy(e) {
    const idx = activeEnemies.indexOf(e);
    if (idx !== -1) activeEnemies.splice(idx, 1);
  }

  function clear() {
    activeEnemies = [];
    enemyProjectiles = [];
  }

  function getActive() { return activeEnemies; }
  function getProjectiles() { return enemyProjectiles; }

  function updateAI(e, dt, playerX, playerY, canvasW, canvasH, enemySpeedReduction) {
    if (!e.alive) return;
    e.wobblePhase += dt * 2;
    e.pulsePhase += dt * 3;

    const spd = e.speed * (1 - (enemySpeedReduction || 0)) * (e.slowed ? 0.6 : 1);

    const dx = playerX - e.x;
    const dy = playerY - e.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;

    switch (e.behaviour) {
      case 'straight_rush': {
        e.vx = (dx / d) * spd;
        e.vy = (dy / d) * spd;
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        e.angle = Math.atan2(dy, dx);
        break;
      }
      case 'sine_wave': {
        e.sineT += dt * 2;
        const perpX = -dy / d;
        const perpY = dx / d;
        const sineOff = Math.sin(e.sineT * 3) * 60 * dt;
        e.vx = (dx / d) * spd;
        e.vy = (dy / d) * spd;
        e.x += e.vx * dt + perpX * sineOff;
        e.y += e.vy * dt + perpY * sineOff;
        e.angle = Math.atan2(e.vy, e.vx);
        break;
      }
      case 'orbit_dive': {
        e.orbitAngle += dt * 1.5;
        if (!e.orbitDiving) {
          const targetX = playerX + Math.cos(e.orbitAngle) * e.orbitDist;
          const targetY = playerY + Math.sin(e.orbitAngle) * e.orbitDist;
          const tx = targetX - e.x, ty = targetY - e.y;
          const td = Math.sqrt(tx * tx + ty * ty) || 1;
          e.x += (tx / td) * spd * dt;
          e.y += (ty / td) * spd * dt;
          // Dive every ~3 orbits
          if (Math.random() < 0.005) e.orbitDiving = true;
        } else {
          e.x += (dx / d) * spd * 2 * dt;
          e.y += (dy / d) * spd * 2 * dt;
          if (d < 80) { e.orbitDiving = false; e.orbitDist = 150 + Math.random() * 80; }
        }
        e.angle = Math.atan2(dy, dx);
        break;
      }
      case 'charge_retreat': {
        if (e.chargeState === 'approach') {
          e.x += (dx / d) * spd * 0.6 * dt;
          e.y += (dy / d) * spd * 0.6 * dt;
          if (d < 120) {
            e.chargeState = 'charge';
            e.chargeDir = { x: dx / d, y: dy / d };
            e.chargeTimer = 0.4;
          }
        } else if (e.chargeState === 'charge') {
          e.x += e.chargeDir.x * spd * 2 * dt;
          e.y += e.chargeDir.y * spd * 2 * dt;
          e.chargeTimer -= dt;
          if (e.chargeTimer <= 0) { e.chargeState = 'retreat'; e.chargeTimer = 0.8; }
        } else {
          e.x -= e.chargeDir.x * spd * dt;
          e.y -= e.chargeDir.y * spd * dt;
          e.chargeTimer -= dt;
          if (e.chargeTimer <= 0) e.chargeState = 'approach';
        }
        e.angle = Math.atan2(dy, dx);
        break;
      }
      case 'shooter': {
        e.x += (dx / d) * spd * 0.3 * dt;
        e.y += (dy / d) * spd * 0.3 * dt;
        e.shootTimer -= dt * 1000;
        if (e.shootTimer <= 0) {
          e.shootTimer = e.shootInterval;
          const ang = Math.atan2(dy, dx);
          enemyProjectiles.push({
            x: e.x, y: e.y,
            vx: Math.cos(ang) * e.projectileSpeed,
            vy: Math.sin(ang) * e.projectileSpeed,
            damage: e.projectileDamage,
            radius: 6,
            alive: true,
            color: '#ff4488',
            trail: []
          });
        }
        e.angle = Math.atan2(dy, dx);
        break;
      }
      case 'corkscrew': {
        e.corkscrewT += dt * 4;
        const perpX2 = -dy / d;
        const perpY2 = dx / d;
        const corkOff = Math.sin(e.corkscrewT) * 40 * dt;
        e.x += (dx / d) * spd * dt + perpX2 * corkOff;
        e.y += (dy / d) * spd * dt + perpY2 * corkOff;
        e.angle = e.corkscrewT;
        break;
      }
      case 'teleport': {
        e.teleportTimer -= dt * 1000;
        if (e.teleportTimer <= 0) {
          e.teleportTimer = e.teleportInterval;
          const ang2 = Math.random() * Math.PI * 2;
          e.x = playerX + Math.cos(ang2) * (e.teleportRange + 40);
          e.y = playerY + Math.sin(ang2) * (e.teleportRange + 40);
        }
        e.x += (dx / d) * spd * 0.5 * dt;
        e.y += (dy / d) * spd * 0.5 * dt;
        break;
      }
      case 'boss': {
        e.x += (dx / d) * spd * dt;
        e.y += (dy / d) * spd * dt;
        e.minionTimer -= dt * 1000;
        // Spawn minions when timer fires
        if (e.minionTimer <= 0 && e.minionId) {
          e.minionTimer = e.minionInterval;
          const minionCount = 3;
          for (let m = 0; m < minionCount; m++) {
            const a = (m / minionCount) * Math.PI * 2;
            const mx = e.x + Math.cos(a) * (e.radius + 20);
            const my = e.y + Math.sin(a) * (e.radius + 20);
            createEnemy(e.minionId, mx, my);
          }
        }
        // Growing over time
        if (e.growthRate > 0 && e.radius < e.maxRadius) {
          e.radius = Math.min(e.maxRadius, e.radius + e.growthRate * dt * 60);
        }
        break;
      }
    }

    // Poison tick
    if (e.poisoned) {
      e.poisonTimer -= dt;
      e.hp -= e.poisonDamage * dt;
      if (e.poisonTimer <= 0) { e.poisoned = false; }
      if (e.hp <= 0) { e.alive = false; }
    }

    // Slow timer
    if (e.slowed && e.slowTimer > 0) {
      e.slowTimer -= dt;
      if (e.slowTimer <= 0) e.slowed = false;
    }

    // Boundary wrap (keep on screen)
    const margin = e.radius;
    e.x = MathUtils.clamp(e.x, margin, canvasW - margin);
    e.y = MathUtils.clamp(e.y, margin, canvasH - margin);
  }

  function update(dt, playerX, playerY, canvasW, canvasH, enemySpeedReduction) {
    for (const e of activeEnemies) {
      if (e.alive) {
        updateAI(e, dt, playerX, playerY, canvasW, canvasH, enemySpeedReduction);
      }
    }
    // Update enemy projectiles
    for (let i = enemyProjectiles.length - 1; i >= 0; i--) {
      const p = enemyProjectiles[i];
      p.trail.push({ x: p.x, y: p.y });
      if (p.trail.length > 5) p.trail.shift();
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.x < -20 || p.x > canvasW + 20 || p.y < -20 || p.y > canvasH + 20 || !p.alive) {
        enemyProjectiles.splice(i, 1);
      }
    }
    // Remove dead enemies
    for (let i = activeEnemies.length - 1; i >= 0; i--) {
      if (!activeEnemies[i].alive) activeEnemies.splice(i, 1);
    }
  }

  function spawnEdge(id, canvasW, canvasH, overrides = {}) {
    const margin = 30;
    const side = Math.floor(Math.random() * 4);
    let x, y;
    if (side === 0) { x = MathUtils.randomRange(margin, canvasW - margin); y = -margin; }
    else if (side === 1) { x = canvasW + margin; y = MathUtils.randomRange(margin, canvasH - margin); }
    else if (side === 2) { x = MathUtils.randomRange(margin, canvasW - margin); y = canvasH + margin; }
    else { x = -margin; y = MathUtils.randomRange(margin, canvasH - margin); }
    return createEnemy(id, x, y, overrides);
  }

  function poisonEnemy(e, damage, duration) {
    if (!e.immuneType || e.immuneType !== 'poison') {
      e.poisoned = true;
      e.poisonDamage = Math.max(e.poisonDamage, damage);
      e.poisonTimer = Math.max(e.poisonTimer, duration);
    }
  }

  function slowEnemy(e, amount, duration) {
    e.slowed = true;
    e.slowAmount = amount;
    e.slowTimer = Math.max(e.slowTimer, duration);
  }

  function markEnemy(e) {
    e.marked = true;
  }

  return {
    loadDefs, getDef, getAllDefs, createEnemy, removeEnemy, clear,
    getActive, getProjectiles, update, spawnEdge,
    poisonEnemy, slowEnemy, markEnemy
  };
})();
