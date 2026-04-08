'use strict';
/* ── player.js ── TrailSystem + Player entity ── */

// Lightweight trail — kept for reference but cluster formation is primary
class TrailSystem {
  constructor() {
    this.history = [];
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

  getAt(trailIndex) {
    const idx = Math.min(trailIndex, this.history.length - 1);
    return this.history[idx] || { x: 0, z: 0 };
  }
}

// Golden angle for Fibonacci spiral crowd packing
const GOLDEN_ANGLE = 2.399963; // ~137.5° in radians

// ────────────────────────────────────────────────────────────────────────────
class Player {
  constructor(scene, saveData, startExtra = 0) {
    this.scene     = scene;
    this.followers = []; // [{mesh, phase}]
    this.mesh      = null;

    // Stat multipliers from persistent upgrades
    const upg          = saveData.upgrades;
    this.baseSpeed     = 11 * (1 + (upg.speed    || 0) * 0.10);
    this.magnetBase    = 8  * (1 + (upg.magnet   || 0) * 0.20);
    this.coinMult      = 1  + (upg.coinBonus || 0) * 0.15;
    const startSquad   = (upg.squad || 0) * 2 + startExtra;

    // In-game temporary multipliers / timers
    this.speedMult        = 1;
    this.magnetMult       = 1;
    this.shieldCharges    = 0;
    this.doubleCrew       = 0;
    this.crowdBurstTimer  = 0;
    this.luckyStarTimer   = 0;
    this.invincible       = false;
    this.invincibleTimer  = 0;

    // Eating cooldown (for LMS mode)
    this._lastEat = -1;

    // Movement direction (for cluster orientation)
    this._moveDirX = 0;
    this._moveDirZ = 1;

    // Stats tracked for results screen
    this.coinsThisGame   = 0;
    this.peakCrowd       = 1;
    this.enemiesAbsorbed = 0;
    this.collectiblesGot = 0;
    this.lastIgAt        = 0;

    this._build(startSquad);
  }

  // ── Build ────────────────────────────────────────────────────────────
  _build(startSquad) {
    this.mesh = this._makeBall(B_RAD.player, COLORS.player);
    this.mesh.position.set(0, B_RAD.player, 0);
    this.scene.add(this.mesh);
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
    this._moveDirX = nx;
    this._moveDirZ = nz;
  }

  // ── Update followers + timers ─────────────────────────────────────────
  updateFollowers(dt, time) {
    const followSpeed = this.crowdBurstTimer > 0 ? 20 : 12;

    // Cluster center: slightly behind the player in movement direction
    const TRAIL_BACK = 1.5;
    const PACK_R     = B_RAD.follower * 2.2; // spacing unit

    const cx = this.mesh.position.x - this._moveDirX * TRAIL_BACK;
    const cz = this.mesh.position.z - this._moveDirZ * TRAIL_BACK;

    this.followers.forEach((f, i) => {
      // Fibonacci spiral slot — each ball i gets a unique angle + radius
      const r  = PACK_R * Math.sqrt(i + 1);
      const a  = i * GOLDEN_ANGLE;
      const tx = cx + Math.cos(a) * r;
      const tz = cz + Math.sin(a) * r;

      const fdx  = tx - f.mesh.position.x;
      const fdz  = tz - f.mesh.position.z;
      const dist = Math.hypot(fdx, fdz);
      if (dist > 0.05) {
        const step = Math.min(followSpeed * dt, dist);
        f.mesh.position.x += (fdx / dist) * step;
        f.mesh.position.z += (fdz / dist) * step;
      }

      f.mesh.position.y = B_RAD.follower + Math.sin(time * 3.0 + f.phase) * 0.08;
    });

    // Leader bob
    this.mesh.position.y = B_RAD.player + Math.sin(time * 2.5) * 0.1;

    // Invincibility flash
    if (this.invincible) {
      this.invincibleTimer -= dt;
      this.mesh.material.opacity     = 0.45 + 0.55 * Math.sin(time * 18);
      this.mesh.material.transparent = true;
      if (this.invincibleTimer <= 0) {
        this.invincible                = false;
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
    this.followers.push({ mesh: m, phase: Math.random() * Math.PI * 2 });
    this.scene.add(m);
  }

  // Remove from the tail (outermost spiral positions first)
  removeFollowers(count) {
    const n = Math.min(count, this.followers.length);
    for (let i = 0; i < n; i++) {
      const f = this.followers.pop();
      this.scene.remove(f.mesh);
      f.mesh.geometry.dispose();
      f.mesh.material.dispose();
    }
  }

  // Remove a specific follower by index (for LMS eating)
  removeFollowerAt(idx) {
    if (idx < 0 || idx >= this.followers.length) return;
    const f = this.followers.splice(idx, 1)[0];
    this.scene.remove(f.mesh);
    f.mesh.geometry.dispose();
    f.mesh.material.dispose();
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
