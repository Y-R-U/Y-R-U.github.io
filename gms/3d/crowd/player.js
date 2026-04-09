'use strict';
/* ── player.js ── Player entity ── */

// Golden angle for Fibonacci spiral crowd packing
const GOLDEN_ANGLE = 2.399963; // ~137.5° in radians
// Max crowd radius — followers beyond this cap overlap (crowd density)
const MAX_CROWD_R = B_RAD.follower * 2.2 * 6.5;

// ────────────────────────────────────────────────────────────────────────────
class Player {
  constructor(scene, saveData, startExtra = 0) {
    this.scene     = scene;
    this.followers = []; // [{mesh, phase}]
    this.mesh      = null;

    // Stat multipliers from persistent upgrades
    const upg          = saveData.upgrades || {};
    this.baseSpeed     = 11 * (1 + (upg.speed    || 0) * 0.08);
    this.magnetBase    = 8  * (1 + (upg.magnet   || 0) * 0.15);
    this.coinMult      = 1  + (upg.coinBonus || 0) * 0.15;
    this.stealCount    = upg.steal || 0; // followers stolen per contact
    const startSquad   = (upg.squad || 0) * 2 + startExtra;

    // In-game temporary multipliers / timers
    this.speedMult        = 1;
    this.magnetMult       = 1;
    this.shieldCharges    = 0;
    this.doubleCrew       = 0;
    this.luckyStarTimer   = 0;
    this.invincible       = false;
    this.invincibleTimer  = 0;

    // Curse timer (when player is cursed by enemy/LMS opponent)
    this.curseTimer = 0;

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

  // ── Getters (with caps) ───────────────────────────────────────────────
  get crowdSize()    { return this.followers.length + 1; }
  get speed()        { return Math.min(this.baseSpeed * this.speedMult, SPEED_CAP); }
  get magnetRadius() { return Math.min(this.magnetBase * this.magnetMult, MAGNET_CAP); }

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
    // Chain-following: each follower chases the one ahead of it.
    // Staggered followSpeed per follower creates natural bunching:
    // fast followers catch up to slow ones ahead → crowd clumps.
    const GAP = 1.0; // desired trailing distance behind target

    this.followers.forEach((f, i) => {
      // Target = entity ahead (follower 0 → player, follower i → follower i-1)
      let aheadX, aheadZ, fwdX, fwdZ;
      if (i === 0) {
        aheadX = this.mesh.position.x;
        aheadZ = this.mesh.position.z;
        fwdX   = this._moveDirX;
        fwdZ   = this._moveDirZ;
      } else {
        const prev = this.followers[i - 1];
        aheadX = prev.mesh.position.x;
        aheadZ = prev.mesh.position.z;
        const ddx = aheadX - f.mesh.position.x;
        const ddz = aheadZ - f.mesh.position.z;
        const dl  = Math.hypot(ddx, ddz) || 1;
        fwdX = ddx / dl;
        fwdZ = ddz / dl;
      }

      // Target slightly behind ahead entity, with lateral spread
      const tx = aheadX - fwdX * GAP + (-fwdZ) * f.latOff;
      const tz = aheadZ - fwdZ * GAP + fwdX * f.latOff;

      const fdx  = tx - f.mesh.position.x;
      const fdz  = tz - f.mesh.position.z;
      const dist = Math.hypot(fdx, fdz);
      if (dist > 0.05) {
        const step = Math.min(f.followSpeed * dt, dist);
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
    if (this.doubleCrew     > 0) this.doubleCrew     -= dt;
    if (this.luckyStarTimer > 0) this.luckyStarTimer -= dt;
    if (this.curseTimer     > 0) this.curseTimer     -= dt;

    if (this.crowdSize > this.peakCrowd) this.peakCrowd = this.crowdSize;
  }

  // ── Crowd management ─────────────────────────────────────────────────
  addFollower() {
    const m = this._makeBall(B_RAD.follower, COLORS.follower);
    m.position.copy(this.mesh.position);
    m.position.y = B_RAD.follower;
    this.followers.push({
      mesh: m,
      phase:       Math.random() * Math.PI * 2,
      followSpeed: 5 + Math.random() * 5,            // staggered reaction → bunching
      latOff:      (Math.random() - 0.5) * 1.8,      // lateral spread so they don't single-file
    });
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
      case 'speedSurge': this.speedMult  *= 1.25; break;
      case 'massMagnet': this.magnetMult *= 1.40; break;
      case 'shield':     this.shieldCharges++;     break;
      case 'doubleCrew': this.doubleCrew  = 20;   break;
      case 'luckyStar':  this.luckyStarTimer = 30; break;
      // 'curse' is handled by game.js (targets an enemy, not the player)
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
