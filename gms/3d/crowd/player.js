'use strict';
/* ── player.js ── TrailSystem + Player entity ── */

// Stores a rolling history of positions; followers index into it.
class TrailSystem {
  constructor() {
    this.history = []; // [{x, z}, ...]  newest at index 0
    this._lastX  = null;
    this._lastZ  = null;
  }

  push(x, z) {
    if (this._lastX === null || Math.hypot(x - this._lastX, z - this._lastZ) >= 0.7) {
      this.history.unshift({ x, z });
      if (this.history.length > 500) this.history.pop();
      this._lastX = x;
      this._lastZ = z;
    }
  }

  // Get position for follower at index i (gap = trail slots between each ball)
  getAt(trailIndex) {
    const idx = Math.min(trailIndex, this.history.length - 1);
    return this.history[idx] || { x: 0, z: 0 };
  }
}

// ────────────────────────────────────────────────────────────────────────────
class Player {
  constructor(scene, saveData) {
    this.scene     = scene;
    this.trail     = new TrailSystem();
    this.followers = []; // [{mesh, phase, offX, offZ}]
    this.mesh      = null;

    // Stat multipliers from persistent upgrades
    const upg          = saveData.upgrades;
    this.baseSpeed     = 11 * (1 + (upg.speed    || 0) * 0.10);
    this.magnetBase    = 8  * (1 + (upg.magnet   || 0) * 0.20);
    this.coinMult      = 1  + (upg.coinBonus || 0) * 0.15;
    const startSquad   = (upg.squad || 0) * 2;

    // In-game temporary multipliers / timers
    this.speedMult        = 1;
    this.magnetMult       = 1;
    this.shieldCharges    = 0;
    this.doubleCrew       = 0;   // seconds remaining
    this.crowdBurstTimer  = 0;
    this.luckyStarTimer   = 0;
    this.invincible       = false;
    this.invincibleTimer  = 0;

    // Stats tracked for results screen
    this.coinsThisGame   = 0;
    this.peakCrowd       = 1;
    this.enemiesAbsorbed = 0;
    this.collectiblesGot = 0;
    this.lastIgAt        = 0; // collectibles count at last ig-upgrade offer

    this._build(startSquad);
  }

  // ── Build ────────────────────────────────────────────────────────────
  _build(startSquad) {
    this.mesh = this._makeBall(B_RAD.player, COLORS.player);
    this.mesh.position.set(0, B_RAD.player, 0);
    this.scene.add(this.mesh);
    this.trail.push(0, 0);
    for (let i = 0; i < startSquad; i++) this.addFollower();
  }

  _makeBall(radius, color) {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 12, 8),
      new THREE.MeshPhongMaterial({ color, shininess: 70 })
    );
    m.castShadow = true;
    return m;
  }

  // ── Getters ──────────────────────────────────────────────────────────
  get crowdSize()    { return this.followers.length + 1; }
  get speed()        { return this.baseSpeed * this.speedMult; }
  get magnetRadius() { return this.magnetBase * this.magnetMult; }

  // ── Movement ─────────────────────────────────────────────────────────
  move(dx, dz, dt) {
    if (dx === 0 && dz === 0) return;
    const len = Math.hypot(dx, dz) || 1;
    const nx  = dx / len, nz = dz / len;
    const s   = this.speed * dt;
    const newX = Math.max(-MAP_HALF, Math.min(MAP_HALF, this.mesh.position.x + nx * s));
    const newZ = Math.max(-MAP_HALF, Math.min(MAP_HALF, this.mesh.position.z + nz * s));
    this.mesh.position.x = newX;
    this.mesh.position.z = newZ;
    this.mesh.rotation.y = Math.atan2(nx, nz);
    this.trail.push(newX, newZ);
  }

  // ── Update followers + timers ─────────────────────────────────────────
  updateFollowers(dt, time) {
    const followSpeed = this.crowdBurstTimer > 0 ? 20 : 10;
    const GAP = 5; // trail slots between each follower

    this.followers.forEach((f, i) => {
      const tgt = this.trail.getAt((i + 1) * GAP);
      const tx  = tgt.x + f.offX;
      const tz  = tgt.z + f.offZ;
      const fdx = tx - f.mesh.position.x;
      const fdz = tz - f.mesh.position.z;
      const dist = Math.hypot(fdx, fdz);
      if (dist > 0.05) {
        const step = Math.min(followSpeed * dt, dist);
        f.mesh.position.x += (fdx / dist) * step;
        f.mesh.position.z += (fdz / dist) * step;
      }
      f.mesh.position.y = B_RAD.follower + Math.sin(time * 3.0 + f.phase) * 0.08;
    });

    // Player bob
    this.mesh.position.y = B_RAD.player + Math.sin(time * 2.5) * 0.1;

    // Invincibility flash
    if (this.invincible) {
      this.invincibleTimer -= dt;
      this.mesh.material.opacity     = 0.45 + 0.55 * Math.sin(time * 18);
      this.mesh.material.transparent = true;
      if (this.invincibleTimer <= 0) {
        this.invincible = false;
        this.mesh.material.opacity     = 1;
        this.mesh.material.transparent = false;
      }
    }

    // Timers
    if (this.doubleCrew      > 0) this.doubleCrew      -= dt;
    if (this.crowdBurstTimer > 0) this.crowdBurstTimer -= dt;
    if (this.luckyStarTimer  > 0) this.luckyStarTimer  -= dt;

    if (this.crowdSize > this.peakCrowd) this.peakCrowd = this.crowdSize;
  }

  // ── Crowd management ─────────────────────────────────────────────────
  addFollower() {
    const m = this._makeBall(B_RAD.follower, COLORS.follower);
    m.position.copy(this.mesh.position);
    m.position.y = B_RAD.follower;
    const f = { mesh: m, phase: Math.random() * Math.PI * 2, offX: (Math.random() - 0.5) * 0.5, offZ: (Math.random() - 0.5) * 0.5 };
    this.followers.push(f);
    this.scene.add(m);
  }

  removeFollowers(count) {
    const n = Math.min(count, this.followers.length);
    for (let i = 0; i < n; i++) {
      const f = this.followers.pop();
      this.scene.remove(f.mesh);
      f.mesh.geometry.dispose();
      f.mesh.material.dispose();
    }
  }

  // ── Shield ───────────────────────────────────────────────────────────
  activateShield(duration = 2.0) {
    this.invincible      = true;
    this.invincibleTimer = duration;
  }

  // ── In-game upgrade application ──────────────────────────────────────
  applyIgUpgrade(id) {
    switch (id) {
      case 'speedSurge': this.speedMult      *= 1.3;  break;
      case 'massMagnet': this.magnetMult     *= 1.6;  break;
      case 'shield':     this.shieldCharges++;         break;
      case 'doubleCrew': this.doubleCrew      = 20;   break;
      case 'crowdBurst': this.crowdBurstTimer = 10;   break;
      case 'luckyStar':  this.luckyStarTimer  = 30;   break;
    }
  }

  // ── Cleanup ──────────────────────────────────────────────────────────
  dispose() {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.removeFollowers(this.followers.length);
  }
}
