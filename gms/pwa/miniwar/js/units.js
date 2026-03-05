/* ===== UNIT SYSTEM ===== */
const Units = (() => {
  let nextId = 0;

  function createUnit(unitDef, isPlayer, ageIndex, evolveBonus, waveScale) {
    const id = nextId++;
    const x = isPlayer
      ? Graphics.getWidth() * CONFIG.PLAYER_BASE_X + CONFIG.BASE_WIDTH * Graphics.getScale() * 0.5
      : Graphics.getWidth() * CONFIG.ENEMY_BASE_X - CONFIG.BASE_WIDTH * Graphics.getScale() * 0.5;

    const atkMult = 1 + (evolveBonus.atk || 0) * 0.10;
    const speedMult = 1 + (evolveBonus.speed || 0) * 0.08;
    const hpScale = waveScale ? waveScale.hp : 1;
    const atkScale = waveScale ? waveScale.atk : 1;

    return {
      id,
      unitDef,
      isPlayer,
      ageIndex,
      x,
      hp: Math.round(unitDef.hp * hpScale),
      maxHp: Math.round(unitDef.hp * hpScale),
      atk: Math.round(unitDef.atk * atkMult * atkScale),
      speed: unitDef.speed * speedMult * Graphics.getScale() * 0.7,
      range: unitDef.range * Graphics.getScale() * 0.5,
      type: unitDef.type,
      state: 'moving',       // moving | attacking | dying
      target: null,
      lastAttackTime: 0,
      attackCooldown: unitDef.type === 'siege' ? 2000 : unitDef.type === 'tank' ? 1200 : 800,
      deathTime: 0,
    };
  }

  function update(units, enemyList, playerBase, enemyBase, projectiles, particles, damageNumbers, time, dt) {
    for (let i = units.length - 1; i >= 0; i--) {
      const u = units[i];

      if (u.state === 'dying') {
        if (time - u.deathTime > 400) {
          units.splice(i, 1);
        }
        continue;
      }

      // Find target (search enemy list for cross-side targeting)
      u.target = findTarget(u, enemyList, playerBase, enemyBase);

      if (u.target) {
        const targetX = u.target.isBase ? u.target.x : u.target.x;
        const dist = Math.abs(u.x - targetX);

        if (dist <= u.range) {
          // Attack
          u.state = 'attacking';
          if (time - u.lastAttackTime >= u.attackCooldown) {
            u.lastAttackTime = time;
            performAttack(u, u.target, projectiles, particles, damageNumbers, time);
          }
        } else {
          // Move toward target (not hardcoded direction!)
          u.state = 'moving';
          const dir = targetX > u.x ? 1 : -1;
          u.x += u.speed * dir * (dt / 16);
        }
      } else {
        // No target - move toward enemy base
        u.state = 'moving';
        const defaultDir = u.isPlayer ? 1 : -1;
        u.x += u.speed * defaultDir * (dt / 16);
      }

      // Clamp to screen
      u.x = Math.max(10, Math.min(Graphics.getWidth() - 10, u.x));
    }
  }

  function findTarget(unit, enemyList, playerBase, enemyBase) {
    let closest = null;
    let closestDist = Infinity;

    // Find closest enemy unit from the opposite side's list
    for (const other of enemyList) {
      if (other.state === 'dying') continue;

      const dist = Math.abs(unit.x - other.x);
      if (dist < closestDist) {
        closestDist = dist;
        closest = other;
      }
    }

    // Check enemy base
    const enemyBaseTarget = unit.isPlayer ? enemyBase : playerBase;
    const baseDist = Math.abs(unit.x - enemyBaseTarget.x);
    if (baseDist < closestDist) {
      return { isBase: true, x: enemyBaseTarget.x, ref: enemyBaseTarget };
    }

    return closest;
  }

  function performAttack(attacker, target, projectiles, particles, damageNumbers, time) {
    const isRanged = attacker.unitDef.type === 'ranged' || attacker.unitDef.type === 'siege';

    if (isRanged) {
      // Create projectile
      let projType = 'bullet';
      if (attacker.unitDef.type === 'siege') projType = 'cannonball';
      if (attacker.ageIndex >= 3) projType = 'plasma';

      projectiles.push({
        x: attacker.x,
        y: Graphics.getGroundY() - 12 * Graphics.getScale(),
        targetX: target.isBase ? target.x : target.x,
        targetY: Graphics.getGroundY() - 8 * Graphics.getScale(),
        speed: 4 * Graphics.getScale(),
        damage: attacker.atk,
        isPlayer: attacker.isPlayer,
        type: projType,
        target: target,
      });

      if (attacker.unitDef.type === 'siege') {
        AudioManager.playExplosion();
      } else {
        AudioManager.playShoot();
      }
    } else {
      // Melee - instant damage
      applyDamage(target, attacker.atk, particles, damageNumbers, time);
      AudioManager.playHit();
    }
  }

  function applyDamage(target, damage, particles, damageNumbers, time) {
    if (!target) return;
    if (target.isBase) {
      target.ref.hp = Math.max(0, target.ref.hp - damage);
      // Damage number at base
      damageNumbers.push({
        x: target.x + (Math.random() - 0.5) * 20,
        y: Graphics.getGroundY() - 40 - Math.random() * 20,
        text: '-' + damage,
        color: '#e74c3c',
        alpha: 1,
        vy: -1,
        life: 60,
      });
    } else {
      target.hp -= damage;
      // Damage number
      damageNumbers.push({
        x: target.x + (Math.random() - 0.5) * 10,
        y: Graphics.getGroundY() - 20 * Graphics.getScale() - Math.random() * 10,
        text: '-' + damage,
        color: target.isPlayer ? '#e74c3c' : '#f7c948',
        alpha: 1,
        vy: -1.2,
        life: 50,
      });

      if (target.hp <= 0 && target.state !== 'dying') {
        killUnit(target, particles, time);
      }
    }

    // Hit particles
    spawnHitParticles(particles, target.isBase ? target.x : target.x, Graphics.getGroundY() - 10);
  }

  function killUnit(unit, particles, time) {
    unit.state = 'dying';
    unit.deathTime = time;
    AudioManager.playDeath();

    // Death particles
    const x = unit.x;
    const y = Graphics.getGroundY() - 10;
    for (let i = 0; i < 8; i++) {
      particles.push({
        x, y: y - Math.random() * 15,
        vx: (Math.random() - 0.5) * 3,
        vy: -Math.random() * 3 - 1,
        size: 2 + Math.random() * 3,
        color: unit.isPlayer ? '#4ecdc4' : '#e74c3c',
        alpha: 1,
        life: 30 + Math.random() * 20,
        shape: Math.random() > 0.5 ? 'circle' : 'rect',
        gravity: 0.1,
      });
    }
  }

  function spawnHitParticles(particles, x, y) {
    for (let i = 0; i < 4; i++) {
      particles.push({
        x: x + (Math.random() - 0.5) * 8,
        y: y - Math.random() * 12,
        vx: (Math.random() - 0.5) * 2,
        vy: -Math.random() * 2,
        size: 1 + Math.random() * 2,
        color: '#f7c948',
        alpha: 0.8,
        life: 15 + Math.random() * 10,
        shape: 'circle',
        gravity: 0.08,
      });
    }
  }

  function updateProjectiles(projectiles, units, playerBase, enemyBase, particles, damageNumbers, time, dt) {
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      const dx = p.targetX - p.x;
      const dy = p.targetY - p.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 5) {
        // Hit - only apply damage if target is still alive
        if (p.target.isBase || (p.target.state && p.target.state !== 'dying')) {
          applyDamage(p.target, p.damage, particles, damageNumbers, time);
        }
        spawnHitParticles(particles, p.x, p.y);
        projectiles.splice(i, 1);
        continue;
      }

      const moveSpeed = p.speed * (dt / 16);
      p.x += (dx / dist) * moveSpeed;
      p.y += (dy / dist) * moveSpeed;

      // Off screen check
      if (p.x < -20 || p.x > Graphics.getWidth() + 20) {
        projectiles.splice(i, 1);
      }
    }
  }

  function updateParticles(particles, dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * (dt / 16);
      p.y += p.vy * (dt / 16);
      if (p.gravity) p.vy += p.gravity;
      p.life--;
      p.alpha = Math.max(0, p.life / 50);
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  function updateDamageNumbers(damageNumbers, dt) {
    for (let i = damageNumbers.length - 1; i >= 0; i--) {
      const d = damageNumbers[i];
      d.y += d.vy * (dt / 16);
      d.life--;
      d.alpha = Math.max(0, d.life / 50);
      if (d.life <= 0) damageNumbers.splice(i, 1);
    }
  }

  return {
    createUnit, update, updateProjectiles, updateParticles, updateDamageNumbers,
    applyDamage, killUnit,
  };
})();
