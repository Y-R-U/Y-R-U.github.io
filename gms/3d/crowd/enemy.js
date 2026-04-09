'use strict';
/* ── enemy.js ── Enemy entity with AI state machine ── */

class Enemy {
  constructor(scene, type, spawnX, spawnZ) {
    this.scene      = scene;
    this.type       = type;
    this.followers  = []; // [{mesh, phase}]
    this.mesh       = null;

    const props       = ENEMY_PROPS[type];
    this.color        = props.color;
    this.speed        = props.speed;
    this.senseRange   = props.senseRange;
    this.huntRange    = props.huntRange;
    this.huntRangeBoost = 0; // E8: increases as enemies are eliminated in LMS

    // AI state
    this.state      = 'wander';
    this.stateTimer = 0;

    // Normalised wander direction (fix B4)
    const ang         = Math.random() * Math.PI * 2;
    this._wanderDx    = Math.cos(ang);
    this._wanderDz    = Math.sin(ang);
    this._targetX     = 0;
    this._targetZ     = 0;

    // Movement direction for cluster orientation
    this._moveDirX = this._wanderDx;
    this._moveDirZ = this._wanderDz;

    // Eating cooldown (LMS mode)
    this._lastEat = -1;

    // Curse timer (E8: when cursed by player's IG upgrade)
    this.curseTimer = 0;

    // Build
    const [minC, maxC] = props.startCrowd;
    const startCount   = minC + Math.floor(Math.random() * (maxC - minC + 1));
    this._build(spawnX, spawnZ, startCount);
  }

  get crowdSize() { return this.followers.length + 1; }
  get effectiveHuntRange() { return this.huntRange + this.huntRangeBoost; }

  // ── Build ────────────────────────────────────────────────────────────
  _build(x, z, startCount) {
    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(B_RAD.player, 12, 8),
      new THREE.MeshPhongMaterial({ color: this.color, shininess: 60 })
    );
    this.mesh.position.set(x, B_RAD.player, z);
    this.mesh.castShadow = true;
    this.scene.add(this.mesh);
    for (let i = 0; i < startCount; i++) this.addFollower();
  }

  // ── Update (called each frame) ────────────────────────────────────────
  update(dt, player, collectibles, time) {
    this.stateTimer -= dt;
    if (this.curseTimer > 0) this.curseTimer -= dt;
    this._decideState(player, collectibles);
    this._move(dt);
    this._updateFollowers(dt, time);
  }

  // ── AI decision ──────────────────────────────────────────────────────
  _decideState(player, collectibles) {
    const ex = this.mesh.position.x, ez = this.mesh.position.z;
    const px = player.mesh.position.x, pz = player.mesh.position.z;
    const distToPlayer = Math.hypot(ex - px, ez - pz);

    // Flee if player is clearly bigger and close (all types)
    if (player.crowdSize > this.crowdSize + 4 &&
        distToPlayer < this.senseRange) {
      this.state    = 'flee';
      // Clamp flee target to map boundary (fix B2)
      const fleeX   = ex + (ex - px);
      const fleeZ   = ez + (ez - pz);
      this._targetX = Math.max(-MAP_HALF + 5, Math.min(MAP_HALF - 5, fleeX));
      this._targetZ = Math.max(-MAP_HALF + 5, Math.min(MAP_HALF - 5, fleeZ));
      return;
    }

    // Hunt player if big enough and within effective range
    const hunt = this.effectiveHuntRange;
    if (hunt > 0 &&
        distToPlayer < hunt &&
        this.crowdSize >= player.crowdSize - 3) {
      this.state    = 'chase';
      this._targetX = px;
      this._targetZ = pz;
      return;
    }

    // Seek nearest collectible (fighter, champion, boss)
    if (this.type !== 'rookie') {
      let nearest = null, nearDist = this.senseRange;
      for (const c of collectibles) {
        if (c.collected) continue;
        const d = Math.hypot(c.mesh.position.x - ex, c.mesh.position.z - ez);
        if (d < nearDist) { nearDist = d; nearest = c; }
      }
      if (nearest) {
        this.state    = 'seek_collect';
        this._targetX = nearest.mesh.position.x;
        this._targetZ = nearest.mesh.position.z;
        return;
      }
    }

    // Default: wander with occasional direction change
    if (this.state !== 'wander' || this.stateTimer <= 0) {
      this.state      = 'wander';
      this.stateTimer = 2 + Math.random() * 3;
      const angle     = Math.random() * Math.PI * 2;
      this._wanderDx  = Math.cos(angle);
      this._wanderDz  = Math.sin(angle);
    }
  }

  // ── Movement ─────────────────────────────────────────────────────────
  _move(dt) {
    let dx = 0, dz = 0;
    const ex = this.mesh.position.x, ez = this.mesh.position.z;

    if (this.state === 'wander') {
      dx = this._wanderDx;
      dz = this._wanderDz;
    } else {
      const tdx = this._targetX - ex;
      const tdz = this._targetZ - ez;
      const len  = Math.hypot(tdx, tdz) || 1;
      dx = tdx / len;
      dz = tdz / len;
      if (this.state === 'flee') { dx = -dx; dz = -dz; }
    }

    const step = this.speed * dt;
    let nx = ex + dx * step;
    let nz = ez + dz * step;

    // Boundary bounce
    if (Math.abs(nx) > MAP_HALF) { this._wanderDx = -this._wanderDx; dx = -dx; nx = Math.sign(nx) * MAP_HALF; }
    if (Math.abs(nz) > MAP_HALF) { this._wanderDz = -this._wanderDz; dz = -dz; nz = Math.sign(nz) * MAP_HALF; }

    this.mesh.position.x = nx;
    this.mesh.position.z = nz;
    this.mesh.rotation.y = Math.atan2(dx, dz);

    if (Math.hypot(dx, dz) > 0.01) {
      this._moveDirX = dx;
      this._moveDirZ = dz;
    }
  }

  // ── Follower chain-following (same system as player) ────────────────
  _updateFollowers(dt, time) {
    const GAP = 1.0;

    this.followers.forEach((f, i) => {
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
      f.mesh.position.y = B_RAD.follower + Math.sin(time * 3 + f.phase) * 0.08;
    });

    this.mesh.position.y = B_RAD.player + Math.sin(time * 2.5 + this.followers.length * 0.3) * 0.1;
  }

  // ── Crowd management ─────────────────────────────────────────────────
  addFollower() {
    // Skip follower add if cursed (50% chance) — E8 curse mechanic
    if (this.curseTimer > 0 && Math.random() < 0.5) return;

    const m = new THREE.Mesh(
      new THREE.SphereGeometry(B_RAD.follower, 10, 7),
      new THREE.MeshPhongMaterial({ color: this.color, shininess: 45 })
    );
    m.position.copy(this.mesh.position);
    m.position.y = B_RAD.follower;
    m.castShadow  = true;
    this.followers.push({
      mesh: m,
      phase:       Math.random() * Math.PI * 2,
      followSpeed: 6 + Math.random() * 5,        // staggered reaction → bunching
      latOff:      (Math.random() - 0.5) * 1.6,  // lateral spread
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

  dispose() {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.removeFollowers(this.followers.length);
  }
}
