// projectiles.js — Bullet/antibody logic with pooling and chaining
const Projectiles = (() => {
  let pool = null;
  let activeList = [];

  function init() {
    pool = Pool.createPool(
      () => ({
        x: 0, y: 0, vx: 0, vy: 0,
        damage: 0, radius: 6,
        alive: false, color: '#4af0b0',
        poisonDamage: 0, poisonDuration: 0,
        chainCount: 0, chainsLeft: 0,
        hitEnemies: [],
        trail: [],
        isPiercing: false,
        isPhysical: true
      }),
      (p, x, y, vx, vy, stats) => {
        p.x = x; p.y = y;
        p.vx = vx; p.vy = vy;
        p.damage = stats.damage || 8;
        p.radius = (stats.projectileSize || 6);
        p.alive = true;
        p.color = stats.perforinUnlocked ? '#ffffff' : '#4af0b0';
        p.poisonDamage = stats.poisonDamage || 0;
        p.poisonDuration = stats.poisonDuration || 0;
        p.chainCount = stats.chainCount || 0;
        p.chainsLeft = stats.chainCount || 0;
        p.hitEnemies = [];
        p.trail = [];
        p.isPiercing = stats.perforinUnlocked || false;
        p.critChance = stats.critChance || 0;
        p.critMultiplier = stats.critMultiplier || 3;
        p.markOnHit = stats.markDamageBonus > 0;
        p.markDamageBonus = stats.markDamageBonus || 0;
        p.weakPointDamage = stats.weakPointDamage || 0;
      },
      30
    );
    activeList = pool.getActive();
  }

  function fire(x, y, angle, stats, spreadAngles) {
    const angles = spreadAngles || [angle];
    const projs = [];
    for (const a of angles) {
      const spd = stats.projectileSpeed || 300;
      const p = pool.acquire(x, y, Math.cos(a) * spd, Math.sin(a) * spd, stats);
      projs.push(p);
    }
    return projs;
  }

  function buildSpreadAngles(baseAngle, count, spreadDeg) {
    const angles = [];
    const spread = (spreadDeg * Math.PI / 180);
    for (let i = 0; i < count; i++) {
      if (count === 1) {
        angles.push(baseAngle);
      } else {
        const offset = spread === 0
          ? (i - (count - 1) / 2) * (Math.PI / 12)
          : -spread / 2 + (spread / (count - 1)) * i;
        angles.push(baseAngle + offset);
      }
    }
    return angles;
  }

  function update(dt, canvasW, canvasH, enemies, player) {
    const hits = [];
    const active = pool.getActive();
    for (let i = active.length - 1; i >= 0; i--) {
      const p = active[i];
      if (!p.alive) { pool.release(p); continue; }

      p.trail.push({ x: p.x, y: p.y });
      if (p.trail.length > 6) p.trail.shift();

      p.x += p.vx * dt;
      p.y += p.vy * dt;

      // Off screen
      if (p.x < -30 || p.x > canvasW + 30 || p.y < -30 || p.y > canvasH + 30) {
        p.alive = false;
        pool.release(p);
        continue;
      }

      // Check enemy collisions
      for (const e of enemies) {
        if (!e.alive) continue;
        if (p.hitEnemies.includes(e)) continue;
        const dx = p.x - e.x, dy = p.y - e.y;
        const distSq = dx * dx + dy * dy;
        const minDist = p.radius + e.radius;
        if (distSq < minDist * minDist) {
          let dmg = p.damage;
          // Crit
          if (p.critChance > 0 && Math.random() < p.critChance) dmg *= p.critMultiplier;
          // Mark bonus
          if (e.marked && p.markDamageBonus > 0) dmg *= (1 + p.markDamageBonus);
          // Weak point
          if (e.weakPoint && p.weakPointDamage > 0) dmg *= (1 + p.weakPointDamage);

          e.hp -= Math.ceil(dmg);
          if (e.hp <= 0) e.alive = false;

          // Apply poison
          if (p.poisonDamage > 0 && (!e.immuneType || e.immuneType !== 'poison')) {
            Enemies.poisonEnemy(e, p.poisonDamage, p.poisonDuration);
          }

          // Mark enemy
          if (p.markOnHit) Enemies.markEnemy(e);

          hits.push({ projectile: p, enemy: e, damage: dmg });

          if (p.isPiercing) {
            p.hitEnemies.push(e);
          } else if (p.chainsLeft > 0) {
            p.hitEnemies.push(e);
            p.chainsLeft--;
            // Chain to nearest unhit enemy
            const chainTarget = findNearestUnhit(p, enemies);
            if (chainTarget) {
              const cdx = chainTarget.x - p.x, cdy = chainTarget.y - p.y;
              const cd = Math.sqrt(cdx * cdx + cdy * cdy) || 1;
              const spd = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
              p.vx = (cdx / cd) * spd;
              p.vy = (cdy / cd) * spd;
            } else {
              p.alive = false;
              pool.release(p);
            }
          } else {
            p.alive = false;
            pool.release(p);
            break;
          }
        }
      }
    }
    return hits;
  }

  function findNearestUnhit(p, enemies, range = 200) {
    let best = null, bestDist = range * range;
    for (const e of enemies) {
      if (!e.alive) continue;
      if (p.hitEnemies.includes(e)) continue;
      const dx = p.x - e.x, dy = p.y - e.y;
      const d = dx * dx + dy * dy;
      if (d < bestDist) { bestDist = d; best = e; }
    }
    return best;
  }

  function getActive() { return pool ? pool.getActive() : []; }

  function releaseAll() { if (pool) pool.releaseAll(); }

  return { init, fire, buildSpreadAngles, update, getActive, releaseAll };
})();
