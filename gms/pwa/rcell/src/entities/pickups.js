// pickups.js — XP orbs, health pickups (pooled)
const Pickups = (() => {
  let xpPool = null;
  let healthPool = null;

  function init() {
    xpPool = Pool.createPool(
      () => ({ x: 0, y: 0, value: 0, radius: 8, alive: false, color: '#4af0b0', wobble: 0, wobblePhase: 0, type: 'xp' }),
      (p, x, y, value) => {
        p.x = x; p.y = y; p.value = value;
        p.alive = true;
        p.wobblePhase = Math.random() * Math.PI * 2;
        p.wobble = 0;
      },
      40
    );
    healthPool = Pool.createPool(
      () => ({ x: 0, y: 0, value: 0, radius: 10, alive: false, color: '#ff6688', wobble: 0, wobblePhase: 0, type: 'health' }),
      (p, x, y, value) => {
        p.x = x; p.y = y; p.value = value || 20;
        p.alive = true;
        p.wobblePhase = Math.random() * Math.PI * 2;
        p.wobble = 0;
      },
      10
    );
  }

  function spawnXP(x, y, value) {
    if (!xpPool) return null;
    // Scatter slightly
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.random() * 20;
    return xpPool.acquire(x + Math.cos(angle) * dist, y + Math.sin(angle) * dist, value);
  }

  function spawnHealth(x, y, value) {
    if (!healthPool) return null;
    return healthPool.acquire(x, y, value);
  }

  function update(dt, playerX, playerY, playerPickupRadius, playerState, xpSystem, valueMultiplier) {
    const basePickup = playerPickupRadius || 50;

    // XP orbs
    const xpActive = xpPool ? xpPool.getActive() : [];
    for (let i = xpActive.length - 1; i >= 0; i--) {
      const orb = xpActive[i];
      if (!orb.alive) { xpPool.release(orb); continue; }
      orb.wobblePhase += dt * 4;
      orb.wobble = Math.sin(orb.wobblePhase) * 2;

      // Magnetic pull toward player when in range
      const dx = playerX - orb.x;
      const dy = playerY - orb.y;
      const d = Math.sqrt(dx * dx + dy * dy);

      if (d < basePickup * 2) {
        // Move toward player
        const spd = Math.min(300, 100 + (basePickup * 2 - d) * 4);
        orb.x += (dx / d) * spd * dt;
        orb.y += (dy / d) * spd * dt;
      }

      if (d < basePickup) {
        // Collect
        let xpVal = orb.value * (valueMultiplier || 1);
        // XP to heal conversion
        if (playerState && playerState.xpToHeal > 0 && xpSystem) {
          const healAmt = xpVal * playerState.xpToHeal;
          Player.heal(healAmt);
          xpVal *= (1 - playerState.xpToHeal);
        }
        if (xpSystem) xpSystem.addXP(xpVal);
        orb.alive = false;
        xpPool.release(orb);
      }
    }

    // Health pickups
    const healthActive = healthPool ? healthPool.getActive() : [];
    for (let i = healthActive.length - 1; i >= 0; i--) {
      const h = healthActive[i];
      if (!h.alive) { healthPool.release(h); continue; }
      h.wobblePhase += dt * 3;
      h.wobble = Math.sin(h.wobblePhase) * 2;

      const dx = playerX - h.x;
      const dy = playerY - h.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < h.radius + 18) {
        Player.heal(h.value * (valueMultiplier || 1));
        h.alive = false;
        healthPool.release(h);
      }
    }
  }

  function getXPActive() { return xpPool ? xpPool.getActive() : []; }
  function getHealthActive() { return healthPool ? healthPool.getActive() : []; }

  function releaseAll() {
    if (xpPool) xpPool.releaseAll();
    if (healthPool) healthPool.releaseAll();
  }

  return { init, spawnXP, spawnHealth, update, getXPActive, getHealthActive, releaseAll };
})();
