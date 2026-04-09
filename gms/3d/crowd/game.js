'use strict';
/* ── game.js ── Main Game class, loop, collision, wiring ── */

class Game {
  constructor() {
    this.renderer     = null;
    this.scene        = null;
    this.camera       = null;
    this.map          = null;
    this.player       = null;
    this.enemies      = [];
    this.collectibles = [];

    this.input = new InputController();
    this.audio = new AudioManager();
    this.ui    = new UIManager();

    this._raf      = null;
    this._lastT    = 0;
    this._gt       = 0;   // game time (seconds since level start)
    this._running  = false;
    this._paused   = false;
    this._levelIdx = 0;
    this._timeLeft = 0;
    this._survived = 0;

    this._camTarget = new THREE.Vector3();
    this._camLook   = new THREE.Vector3();
    this.MAX_COLL   = 120;

    // Mode & HUD extras
    this.gameMode     = GAME_MODES.LEVELS;
    this._minimap     = null;
    this._rankTimer   = 0; // throttle ranking DOM updates
    this._lastWasLMS  = false; // B5 fix: initialise

    // In-game upgrade interval (doubles after each offer: 10, 20, 40, 80…)
    this._igNextAt        = 10;
    this._collectsThisGame = 0;

    // Curse mechanic
    this._curseTarget = null; // enemy reference currently cursed

    // Pre-allocated vector for label projection (P1 perf)
    this._labelVec = new THREE.Vector3();

    // Camera zoom: 0 = closest, 1 = furthest out
    // Default 0.33 — zoomed out a bit from the old close view
    this._zoomLevel  = 0.33;
    this._pinchDist0 = 0;
  }

  // ── Initialise ───────────────────────────────────────────────────────
  init() {
    SaveSystem.load();
    this.audio.init(SaveSystem.get('settings'));
    this._initRenderer();
    this._minimap = new MiniMap('minimap-canvas');
    this._initUI();
    this._showMenu();
    document.getElementById('loading-screen').classList.add('hidden');
    this._loop(0);
  }

  _initRenderer() {
    const canvas    = document.getElementById('game-canvas');
    this.renderer   = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(0x87CEEB);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x87CEEB, 90, 170);

    this.camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 300);
    this.camera.position.set(0, 40, 40);
    this.camera.lookAt(0, 0, 0);

    // Ambient
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.65));

    // Sun (directional + shadows)
    const sun = new THREE.DirectionalLight(0xfff8e0, 1.1);
    sun.position.set(40, 70, 30);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { near: 0.5, far: 300, left: -110, right: 110, top: 110, bottom: -110 });
    sun.shadow.bias = -0.001;
    this.scene.add(sun);

    // Hemisphere sky fill
    this.scene.add(new THREE.HemisphereLight(0x87CEEB, 0xf0f0f0, 0.4));

    window.addEventListener('resize', () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
    });

    // ── Pinch-to-zoom (mobile) ────────────────────────────────────────
    canvas.addEventListener('touchstart', e => {
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        this._pinchDist0 = Math.hypot(dx, dy);
      }
    }, { passive: true });

    canvas.addEventListener('touchmove', e => {
      if (e.touches.length === 2 && this._pinchDist0 > 10) {
        const dx   = e.touches[0].clientX - e.touches[1].clientX;
        const dy   = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.hypot(dx, dy);
        const scale = dist / this._pinchDist0;
        // spread fingers = zoom in (decrease zoomLevel); pinch = zoom out
        this._zoomLevel = Math.max(0, Math.min(1, this._zoomLevel - (scale - 1) * 0.6));
        this._pinchDist0 = dist;
      }
    }, { passive: true });

    canvas.addEventListener('touchend', () => { this._pinchDist0 = 0; }, { passive: true });

    // ── Scroll-wheel zoom (desktop) ────────────────────────────────────
    canvas.addEventListener('wheel', e => {
      this._zoomLevel = Math.max(0, Math.min(1, this._zoomLevel + e.deltaY * 0.001));
    }, { passive: true });
  }

  // ── Main loop ────────────────────────────────────────────────────────
  _loop(ts) {
    this._raf = requestAnimationFrame(t => this._loop(t));
    const dt  = Math.min((ts - this._lastT) / 1000, 0.05);
    this._lastT = ts;

    if (this._running && !this._paused) this._update(dt);
    if (this.map) this.map.update(dt);
    this.renderer.render(this.scene, this.camera);
  }

  // ── Per-frame game update ─────────────────────────────────────────────
  _update(dt) {
    this._gt       += dt;
    this._survived += dt;
    // _timeLeft decremented below after input (skip for Infinity)

    // Decrement time only in timed modes
    if (isFinite(this._timeLeft)) this._timeLeft -= dt;

    this.input.update();
    this.player.move(this.input.dx, this.input.dz, dt);
    this.player.updateFollowers(dt, this._gt);

    for (const e of this.enemies) {
      e.update(dt, this.player, this.collectibles, this._gt);
    }

    this._updateCollectibles(dt);

    // Collision — real eating in LMS, soft in Levels
    if (this.gameMode === GAME_MODES.LMS) {
      this._collideLMS();
    } else {
      this._collidePlayerEnemy();
      this._collideEnemyEnemy();
    }

    updateParticles(this.scene, dt);

    // Camera smooth follow — zoom level: 0 = closest (h22/z18), 1 = furthest (h44/z36)
    const zl   = this._zoomLevel;
    const camH = 22 + zl * 22;
    const camZ = 18 + zl * 18;
    this._camTarget.set(
      this.player.mesh.position.x,
      this.player.mesh.position.y + camH,
      this.player.mesh.position.z + camZ
    );
    this.camera.position.lerp(this._camTarget, 0.07);
    this._camLook.set(
      this.player.mesh.position.x,
      this.player.mesh.position.y,
      this.player.mesh.position.z - 3
    );
    this.camera.lookAt(this._camLook);

    // HUD
    const isLMS = this.gameMode === GAME_MODES.LMS;
    this.ui.updateHUD(
      this.player.crowdSize,
      this.enemies.length,
      isLMS ? Infinity : this._timeLeft,
      isLMS ? 0 : LEVELS[this._levelIdx].targetCrowd,
      this.player.coinsThisGame
    );

    // Labels, minimap, ranking (throttled)
    this._updateLabels();
    this._minimap.draw(this.player, this.enemies, this.collectibles);
    this._rankTimer -= dt;
    if (this._rankTimer <= 0) { this._updateRanking(); this._rankTimer = 0.25; }

    this._checkEnd();
  }

  // ── Size labels (project 3D → 2D screen) — P1: reuse vector ────────
  _updateLabels() {
    const w = innerWidth, h = innerHeight;
    const v = this._labelVec;
    const project = (mesh, labelY) => {
      v.copy(mesh.position);
      v.y += labelY;
      v.project(this.camera);
      return { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h, vis: v.z < 1 };
    };

    const p = project(this.player.mesh, 2.5);
    this.ui.updateLabel('player', p.x, p.y, this.player.crowdSize, COLORS.player, p.vis);

    this.enemies.forEach((e, i) => {
      const ep = project(e.mesh, 2.5);
      this.ui.updateLabel('enemy' + i, ep.x, ep.y, e.crowdSize, e.color, ep.vis);
    });
  }

  // ── Building collision push ───────────────────────────────────────────
  // Returns pushed-out (x, z) for a sphere of radius r at (ex, ez)
  _resolveBuildings(ex, ez, r = 1.4) {
    if (!this.map || !this.map.buildings) return { x: ex, z: ez };
    let nx = ex, nz = ez;
    for (const b of this.map.buildings) {
      const clampX = Math.max(b.x - b.hw, Math.min(b.x + b.hw, nx));
      const clampZ = Math.max(b.z - b.hd, Math.min(b.z + b.hd, nz));
      const dx = nx - clampX, dz = nz - clampZ;
      const dist = Math.hypot(dx, dz);
      if (dist < r && dist > 0.001) {
        const push = (r - dist) / dist;
        nx += dx * push;
        nz += dz * push;
      }
    }
    return { x: nx, z: nz };
  }

  // ── Ranking panel ─────────────────────────────────────────────────────
  _updateRanking() {
    const entities = [
      { name: 'You', size: this.player.crowdSize, color: COLORS.player, isPlayer: true },
      ...this.enemies.map((e, i) => ({
        name:     e.type.charAt(0).toUpperCase() + e.type.slice(1) + ' ' + (i + 1),
        size:     e.crowdSize,
        color:    e.color,
        isPlayer: false,
      })),
    ];
    this.ui.updateRanking(entities);
  }

  // ── Collectible logic ────────────────────────────────────────────────
  _updateCollectibles(dt) {
    const px = this.player.mesh.position.x;
    const pz = this.player.mesh.position.z;
    const mr = this.player.magnetRadius;

    for (let i = this.collectibles.length - 1; i >= 0; i--) {
      const c = this.collectibles[i];
      if (c.collected) continue;
      c.update(dt);

      const cdx  = c.mesh.position.x - px;
      const cdz  = c.mesh.position.z - pz;
      const dist = Math.hypot(cdx, cdz);

      // Magnet pull
      if (dist < mr && dist > 0.1) {
        const pull = Math.min(12 * dt, dist - 0.1);
        c.mesh.position.x -= (cdx / dist) * pull;
        c.mesh.position.z -= (cdz / dist) * pull;
      }

      // Collect by player
      if (dist < 1.6) {
        this._collectBall(c, i);
        continue;
      }
    }

    // Enemy collect
    for (const e of this.enemies) {
      const ex = e.mesh.position.x, ez = e.mesh.position.z;
      for (let i = this.collectibles.length - 1; i >= 0; i--) {
        const c = this.collectibles[i];
        if (c.collected) continue;
        if (Math.hypot(c.mesh.position.x - ex, c.mesh.position.z - ez) < 1.5) {
          c.collected = true;
          c.dispose();
          this.collectibles.splice(i, 1);
          e.addFollower();
          this._respawn();
        }
      }
    }
  }

  _collectBall(c, idx) {
    c.collected = true;
    const cx = c.mesh.position.x, cy = c.mesh.position.y, cz = c.mesh.position.z;
    const col = c.special ? COLORS.special : COLORS.collectible;
    spawnParticles(this.scene, cx, cy, cz, col, c.special ? 12 : 7);
    c.dispose();
    this.collectibles.splice(idx, 1);

    this.audio.playCollect();
    this.audio.vibrate(15);

    const count = (c.special ? 3 : 1) * (this.player.doubleCrew > 0 ? 2 : 1);
    for (let j = 0; j < count; j++) this.player.addFollower();

    this.player.collectiblesGot++;
    this._collectsThisGame++;
    const coinGain = Math.ceil(
      (c.special ? 3 : 1) * this.player.coinMult * (this.player.luckyStarTimer > 0 ? 2 : 1)
    );
    this.player.coinsThisGame += coinGain;

    // Offer in-game upgrade on doubling interval (10, 20, 40, 80…)
    if (this._collectsThisGame >= this._igNextAt) {
      this._igNextAt = this._igNextAt * 2; // double threshold each time
      this._offerIgUpgrade();
    }
    this._respawn();
  }

  _respawn() {
    if (this.collectibles.length < this.MAX_COLL) this._spawnCollectible();
  }

  _spawnCollectible() {
    let x, z, tries = 0;
    do {
      x = (Math.random() * 2 - 1) * (MAP_HALF - 5);
      z = (Math.random() * 2 - 1) * (MAP_HALF - 5);
      tries++;
    } while (tries < 20 &&
      Math.hypot(x - this.player.mesh.position.x, z - this.player.mesh.position.z) < 6);
    this.collectibles.push(new Collectible(this.scene, x, z, Math.random() < 0.15));
  }

  // ── Collision: player ↔ enemy ─────────────────────────────────────────
  _collidePlayerEnemy() {
    const px  = this.player.mesh.position.x, pz = this.player.mesh.position.z;
    const now = this._gt;

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e  = this.enemies[i];
      const d  = Math.hypot(px - e.mesh.position.x, pz - e.mesh.position.z);
      if (d > 3.5) continue;

      if (this.player.crowdSize > e.crowdSize + 1) {
        // Player absorbs enemy
        spawnParticles(this.scene, e.mesh.position.x, 1, e.mesh.position.z, e.color, 14);
        this.audio.playAbsorb();
        this.audio.vibrate([20, 30, 20]);
        this.ui.showToast(`+${e.crowdSize} absorbed!`, 'good');
        const gained = Math.max(1, Math.floor(e.crowdSize * 0.4));
        for (let j = 0; j < gained; j++) this.player.addFollower();
        this.player.coinsThisGame += e.crowdSize * 2;
        this.player.enemiesAbsorbed++;
        this.ui.removeLabel('enemy' + i); // B1: remove stale label
        e.dispose();
        this.enemies.splice(i, 1);

      } else if (this.player.stealCount > 0 && now - this.player._lastEat > 0.4) {
        // Steal followers from enemy on contact (persistent upgrade)
        const stealN = Math.min(this.player.stealCount, e.followers.length);
        if (stealN > 0) {
          e.removeFollowers(stealN);
          for (let j = 0; j < stealN; j++) this.player.addFollower();
          this.audio.playCollect();
          this.player._lastEat = now;
        }

      } else if (e.crowdSize > this.player.crowdSize + 1 && !this.player.invincible) {
        if (this.player.shieldCharges > 0) {
          this.player.shieldCharges--;
          this.player.activateShield(3);
          this.ui.showToast('🛡 Shield!', 'info');
          this.audio.playHit();
        } else {
          const lose = Math.min(3, this.player.followers.length);
          this.player.removeFollowers(lose);
          spawnParticles(this.scene, px, 1, pz, COLORS.follower, 8);
          this.audio.playHit();
          this.audio.vibrate([40, 20, 40]);
          this.ui.showToast(`Lost ${lose}!`, 'bad');
          this.ui.showHitFlash(); // E6
          this.player.activateShield(1.2); // brief immunity after hit

          if (this.player.followers.length === 0) { this._endGame(false); return; }
        }
      }
    }
  }

  // ── Collision: enemy ↔ enemy ──────────────────────────────────────────
  _collideEnemyEnemy() {
    for (let i = 0; i < this.enemies.length; i++) {
      for (let j = i + 1; j < this.enemies.length; j++) {
        const a = this.enemies[i], b = this.enemies[j];
        const d = Math.hypot(
          a.mesh.position.x - b.mesh.position.x,
          a.mesh.position.z - b.mesh.position.z
        );
        if (d > 3.5) continue;
        if (a.crowdSize > b.crowdSize + 3) {
          spawnParticles(this.scene, b.mesh.position.x, 1, b.mesh.position.z, b.color, 8);
          b.dispose(); this.enemies.splice(j, 1); break;
        } else if (b.crowdSize > a.crowdSize + 3) {
          spawnParticles(this.scene, a.mesh.position.x, 1, a.mesh.position.z, a.color, 8);
          a.dispose(); this.enemies.splice(i, 1); break;
        }
      }
    }
  }

  // ── LMS: real contact-eating collision ───────────────────────────────
  // Both player↔enemy and enemy↔enemy checked here.
  // Bigger crowd eats one ball per entity per EAT_CD seconds on contact.
  _collideLMS() {
    const now    = this._gt;
    const EAT_CD = 0.10; // seconds between each eat per entity
    const EAT_R  = 1.9;  // contact range (leader or follower)

    // Helper: find closest ball of entity B to point (qx, qz)
    // Returns { idx: followerIndex or -1 for leader, dist }
    const closestBall = (entity, qx, qz) => {
      let best = Math.hypot(entity.mesh.position.x - qx, entity.mesh.position.z - qz);
      let idx  = -1; // -1 = leader
      entity.followers.forEach((f, fi) => {
        const d = Math.hypot(f.mesh.position.x - qx, f.mesh.position.z - qz);
        if (d < best) { best = d; idx = fi; }
      });
      return { idx, dist: best };
    };

    // Helper: remove one ball from entity (leader handled as game-over/eliminate)
    const eatFrom = (entity, idx, isEnemy, enemyArrIdx) => {
      if (idx === -1) {
        // Leader hit — eliminate (already has no followers if we get here)
        spawnParticles(this.scene, entity.mesh.position.x, 1, entity.mesh.position.z, entity.color || COLORS.follower, 12);
        if (isEnemy) {
          const eName = entity.type.charAt(0).toUpperCase() + entity.type.slice(1);
          this.audio.playAbsorb();
          this.ui.removeLabel('enemy' + enemyArrIdx); // B1: stale label cleanup
          entity.dispose();
          this.enemies.splice(enemyArrIdx, 1);
          this.player.enemiesAbsorbed++;
          this.player.coinsThisGame += 15;
          this.ui.showToast(`${eName} eliminated!`, 'good');
          this.ui.showKillFeed(`You eliminated ${eName}!`);
          // E8: boost remaining enemies' aggression
          const boost = 10;
          for (const e of this.enemies) e.huntRangeBoost += boost;
        } else {
          this.ui.showHitFlash(); // E6
          this._endGame(false);
        }
      } else {
        const f = isEnemy ? entity.followers[idx] : this.player.followers[idx];
        spawnParticles(this.scene, f.mesh.position.x, 1, f.mesh.position.z, entity.color || COLORS.follower, 4);
        if (isEnemy) entity.removeFollowerAt(idx);
        else         this.player.removeFollowerAt(idx);
        this.audio.playHit();
        if (!isEnemy) {
          this.audio.vibrate(20);
          this.ui.showHitFlash(); // E6
        }
      }
    };

    // ── Player vs each enemy ─────────────────────────────────────────
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      if (!this._running) return;
      const e = this.enemies[i];

      // Quick reject
      const roughDist = Math.hypot(
        this.player.mesh.position.x - e.mesh.position.x,
        this.player.mesh.position.z - e.mesh.position.z
      );
      if (roughDist > 25) continue;

      // Player eats enemy ball
      if (this.player.crowdSize > e.crowdSize && now - this.player._lastEat > EAT_CD) {
        const { idx, dist } = closestBall(e, this.player.mesh.position.x, this.player.mesh.position.z);
        if (dist < EAT_R) {
          if (idx === -1 && e.followers.length > 0) {
            // Leader touched but still has followers — eat last follower instead
            const last = e.followers.length - 1;
            spawnParticles(this.scene, e.followers[last].mesh.position.x, 1, e.followers[last].mesh.position.z, e.color, 4);
            e.removeFollowerAt(last);
            this.audio.playHit();
          } else {
            eatFrom(e, idx, true, i);
          }
          this.player._lastEat = now;
          if (i >= this.enemies.length) break; // array shrank
        }
      }

      if (i >= this.enemies.length) break;
      if (!this._running) return;
      const e2 = this.enemies[i]; // re-fetch in case it changed

      // Enemy eats player ball
      if (e2.crowdSize > this.player.crowdSize && now - e2._lastEat > EAT_CD && !this.player.invincible) {
        if (this.player.shieldCharges > 0) {
          this.player.shieldCharges--;
          this.player.activateShield(2.5);
          this.ui.showToast('🛡 Shield!', 'info');
          this.audio.playHit();
          e2._lastEat = now;
        } else {
          const { idx, dist } = closestBall(this.player, e2.mesh.position.x, e2.mesh.position.z);
          if (dist < EAT_R) {
            if (idx === -1 && this.player.followers.length > 0) {
              const last = this.player.followers.length - 1;
              spawnParticles(this.scene, this.player.followers[last].mesh.position.x, 1, this.player.followers[last].mesh.position.z, COLORS.follower, 4);
              this.player.removeFollowerAt(last);
              this.audio.playHit();
              this.audio.vibrate(25);
              this.player.activateShield(0.5); // tiny grace after hit
            } else {
              eatFrom(this.player, idx, false, -1);
            }
            e2._lastEat = now;
            if (!this._running) return;
          }
        }
      }
    }

    // ── Enemy vs enemy ────────────────────────────────────────────────
    for (let i = 0; i < this.enemies.length; i++) {
      for (let j = i + 1; j < this.enemies.length; j++) {
        const a = this.enemies[i], b = this.enemies[j];
        const d = Math.hypot(a.mesh.position.x - b.mesh.position.x, a.mesh.position.z - b.mesh.position.z);
        if (d > 20) continue;

        if (a.crowdSize > b.crowdSize && now - a._lastEat > EAT_CD) {
          const { idx, dist } = closestBall(b, a.mesh.position.x, a.mesh.position.z);
          if (dist < EAT_R) {
            if (idx === -1 && b.followers.length > 0) {
              b.removeFollowerAt(b.followers.length - 1);
            } else if (idx === -1) {
              const aName = a.type.charAt(0).toUpperCase() + a.type.slice(1);
              const bName = b.type.charAt(0).toUpperCase() + b.type.slice(1);
              spawnParticles(this.scene, b.mesh.position.x, 1, b.mesh.position.z, b.color, 10);
              this.ui.removeLabel('enemy' + j); // B1
              b.dispose(); this.enemies.splice(j, 1); j--;
              this.ui.showKillFeed(`${aName} ate ${bName}!`);
              for (const e of this.enemies) e.huntRangeBoost += 8; // E8
            } else {
              b.removeFollowerAt(idx);
            }
            a._lastEat = now;
          }
        } else if (j < this.enemies.length && b.crowdSize > a.crowdSize && now - b._lastEat > EAT_CD) {
          const { idx, dist } = closestBall(a, b.mesh.position.x, b.mesh.position.z);
          if (dist < EAT_R) {
            if (idx === -1 && a.followers.length > 0) {
              a.removeFollowerAt(a.followers.length - 1);
            } else if (idx === -1) {
              const aName = a.type.charAt(0).toUpperCase() + a.type.slice(1);
              const bName = b.type.charAt(0).toUpperCase() + b.type.slice(1);
              spawnParticles(this.scene, a.mesh.position.x, 1, a.mesh.position.z, a.color, 10);
              this.ui.removeLabel('enemy' + i); // B1
              a.dispose(); this.enemies.splice(i, 1); i--; j = this.enemies.length; // break inner
              this.ui.showKillFeed(`${bName} ate ${aName}!`);
              for (const e of this.enemies) e.huntRangeBoost += 8; // E8
            } else {
              a.removeFollowerAt(idx);
            }
            b._lastEat = now;
          }
        }
      }
    }
  }

  // ── Win / lose ────────────────────────────────────────────────────────
  _checkEnd() {
    if (!this._running) return;

    if (this.gameMode === GAME_MODES.LMS) {
      // LMS: win if all enemies gone
      if (this.enemies.length === 0) this._endGame(true);
      // Lose condition handled inside _collideLMS when player is eliminated
    } else {
      const lv = LEVELS[this._levelIdx];
      if (this.enemies.length === 0 || this.player.crowdSize >= lv.targetCrowd) {
        this._endGame(true);
      } else if (this._timeLeft <= 0) {
        this._endGame(false);
      }
    }
  }

  // ── In-game upgrade prompt ────────────────────────────────────────────
  _offerIgUpgrade() {
    this._paused = true;
    this.audio.playLevelUp();
    this.ui.showIgUpgrade(id => {
      if (id === 'curse') {
        // Curse the top-ranked enemy (most followers), not the player
        const top = [...this.enemies].sort((a, b) => b.crowdSize - a.crowdSize)[0];
        if (top) {
          top.curseTimer = 30;
          this._curseTarget = top;
          this.ui.showToast('🧿 Cursed the leader!', 'good');
        }
      } else {
        this.player.applyIgUpgrade(id);
      }
      this.ui.hide('ig-upgrade-overlay');
      this._paused = false;
    });
  }

  // ── Shared spawn helper ───────────────────────────────────────────────
  _spawnEnemyList(enemyDefs) {
    this.enemies = [];
    enemyDefs.forEach(def => {
      for (let i = 0; i < def.count; i++) {
        let ex, ez, tries = 0;
        do {
          const ang = Math.random() * Math.PI * 2;
          const r   = 55 + Math.random() * 30;
          ex = Math.cos(ang) * r;
          ez = Math.sin(ang) * r;
          tries++;
        } while (tries < 30 && (Math.abs(ex) > MAP_HALF - 4 || Math.abs(ez) > MAP_HALF - 4));
        ex = Math.max(-(MAP_HALF - 4), Math.min(MAP_HALF - 4, ex));
        ez = Math.max(-(MAP_HALF - 4), Math.min(MAP_HALF - 4, ez));
        this.enemies.push(new Enemy(this.scene, def.type, ex, ez));
      }
    });
  }

  _startCommon() {
    this.collectibles = [];
    for (let i = 0; i < this.MAX_COLL; i++) this._spawnCollectible();
    this.camera.position.set(0, 22, 18);
    this.ui.clearRanking(); // reset in-place ranking rows
    this.ui.show('hud');
    this.ui.show('joystick-zone');
    this.ui.show('ranking-panel');
    this._minimap.show();
    // Show kill feed only in LMS
    if (this.gameMode === GAME_MODES.LMS) {
      this.ui.clearKillFeed();
      this.ui.show('kill-feed');
    } else {
      this.ui.hide('kill-feed');
    }
    this.input.attach();
    this._running  = true;
    this._rankTimer = 0;
    // Reset IG upgrade interval
    this._igNextAt        = 10;
    this._collectsThisGame = 0;
    this._curseTarget     = null;
    this.audio.playRandomTheme();
  }

  // ── Start a Story-mode level ──────────────────────────────────────────
  startLevel(idx) {
    this.gameMode  = GAME_MODES.LEVELS;
    this._levelIdx = idx;
    this._cleanup();

    const lv       = LEVELS[idx];
    this._timeLeft = lv.time;
    this._survived = 0;
    this._gt       = 0;
    this._running  = false;
    this._paused   = false;

    this.ui.hide('ig-upgrade-overlay');
    this.map = new MapBuilder(this.scene);
    this.map.build();
    this.player = new Player(this.scene, SaveSystem.getData());
    this._spawnEnemyList(lv.enemies);
    this._startCommon();
  }

  // ── Start Last Man Standing ───────────────────────────────────────────
  startLMS() {
    this.gameMode  = GAME_MODES.LMS;
    this._levelIdx = -1;
    this._cleanup();

    this._timeLeft = Infinity; // no timer
    this._survived = 0;
    this._gt       = 0;
    this._running  = false;
    this._paused   = false;

    this.ui.hide('ig-upgrade-overlay');
    this.map = new MapBuilder(this.scene);
    this.map.build();
    // Give player a head-start squad
    this.player = new Player(this.scene, SaveSystem.getData(), LMS_PLAYER_START_CROWD);
    this._spawnEnemyList(LMS_ENEMIES);
    this._startCommon();
  }

  // ── End game ──────────────────────────────────────────────────────────
  _endGame(won) {
    if (!this._running) return;
    this._running = false;
    this.input.detach();
    this.audio.stopMusic();
    clearParticles(this.scene);
    this.ui.hide('hud');
    this.ui.hide('joystick-zone');
    this.ui.hide('ranking-panel');
    this._minimap.hide();
    this.ui.clearLabels();

    const coinsEarned = this.player.coinsThisGame;
    SaveSystem.addCoins(coinsEarned);

    if (this.gameMode === GAME_MODES.LMS) {
      // LMS result
      if (won) {
        this.audio.playVictory();
        this.audio.vibrate([50, 30, 50, 30, 100]);
        // E5: save LMS personal best
        const prev = SaveSystem.get('lmsBest') || { crowd: 0, enemies: 0, time: 0 };
        if (this.player.crowdSize > prev.crowd || this.player.enemiesAbsorbed > prev.enemies) {
          const best = { crowd: this.player.crowdSize, enemies: this.player.enemiesAbsorbed, time: Math.floor(this._survived) };
          SaveSystem.set('lmsBest', best);
        }
        this.ui.showVictory({
          finalCrowd:      this.player.crowdSize,
          survived:        this._survived,
          totalTime:       Infinity, // signals LMS mode to ui.js
          targetCrowd:     0,
          enemiesAbsorbed: this.player.enemiesAbsorbed,
          coinsEarned,
        }, -1); // -1 = no next level
      } else {
        this.audio.playGameOver();
        this.audio.vibrate([100, 50, 100]);
        this.ui.showGameOver({
          peakCrowd:       this.player.peakCrowd,
          survived:        this._survived,
          enemiesAbsorbed: this.player.enemiesAbsorbed,
          coinsEarned,
        });
      }
      this._lastWasLMS = true;
      return;
    }

    this._lastWasLMS = false;
    const lv = LEVELS[this._levelIdx];

    if (won) {
      this.audio.playVictory();
      this.audio.vibrate([50, 30, 50, 30, 100]);
      const current = SaveSystem.get('unlockedLevel') || 1;
      if (this._levelIdx + 1 >= current) {
        SaveSystem.set('unlockedLevel', Math.min(LEVELS.length, this._levelIdx + 2));
      }
      this.ui.showVictory({
        finalCrowd:      this.player.crowdSize,
        timeLeft:        this._timeLeft,
        totalTime:       lv.time,
        targetCrowd:     lv.targetCrowd,
        enemiesAbsorbed: this.player.enemiesAbsorbed,
        coinsEarned,
      }, this._levelIdx);
    } else {
      this.audio.playGameOver();
      this.audio.vibrate([100, 50, 100]);
      this.ui.showGameOver({
        peakCrowd:       this.player.peakCrowd,
        survived:        this._survived,
        enemiesAbsorbed: this.player.enemiesAbsorbed,
        coinsEarned,
      });
    }
  }

  // ── Cleanup level objects ─────────────────────────────────────────────
  _cleanup() {
    if (this.player) { this.player.dispose(); this.player = null; }
    for (const e of this.enemies) e.dispose();
    this.enemies = [];
    for (const c of this.collectibles) { if (!c.collected) c.dispose(); }
    this.collectibles = [];
    clearParticles(this.scene);
    if (this.map) { this.map.dispose(); this.map = null; }
    this.ui.clearLabels();
    this.ui.clearRanking();
    this.ui.clearKillFeed();
    this.ui.hide('ranking-panel');
    this.ui.hide('kill-feed');
    if (this._minimap) this._minimap.hide();
    this._curseTarget = null;
  }

  // ── Menu ─────────────────────────────────────────────────────────────
  _showMenu() {
    this.ui.refreshMenuCoins(SaveSystem.get('coins') || 0);
    ['mode-screen','level-screen','upgrade-screen','gameover-screen',
     'victory-screen','hud','joystick-zone','ranking-panel','ig-upgrade-overlay','kill-feed']
      .forEach(id => this.ui.hide(id));
    if (this._minimap) this._minimap.hide();
    this.ui.show('menu-screen');
  }

  // ── Mode select screen ────────────────────────────────────────────────
  _showModeSelect() {
    ['menu-screen','level-screen'].forEach(id => this.ui.hide(id));
    // E5: show LMS personal best on mode card
    this.ui.updateLmsBest(SaveSystem.get('lmsBest'));
    this.ui.show('mode-screen');
  }

  // ── UI wiring ────────────────────────────────────────────────────────
  _initUI() {
    // Settings cog
    const cogBtn    = document.getElementById('cog-btn');
    const panel     = document.getElementById('settings-panel');
    const backdrop  = document.getElementById('settings-backdrop');
    const closeBtn  = document.getElementById('settings-close-btn');

    const openSettings  = () => { panel.classList.add('open'); backdrop.style.display = 'block'; cogBtn.classList.add('spinning'); };
    const closeSettings = () => { panel.classList.remove('open'); backdrop.style.display = 'none'; cogBtn.classList.remove('spinning'); };

    cogBtn.addEventListener('click', openSettings);
    closeBtn.addEventListener('click', closeSettings);
    backdrop.addEventListener('click', closeSettings);

    // Setting toggles
    const sfxEl = document.getElementById('toggle-sfx');
    const musEl = document.getElementById('toggle-music');
    const vibEl = document.getElementById('toggle-vibrate');
    const sets  = SaveSystem.get('settings');
    sfxEl.checked = sets.sfx;
    musEl.checked = sets.music;
    vibEl.checked = sets.vibrate;

    sfxEl.addEventListener('change', () => { this.audio.toggleSfx(sfxEl.checked);     SaveSystem.set('settings.sfx',     sfxEl.checked); });
    musEl.addEventListener('change', () => { this.audio.toggleMusic(musEl.checked);    SaveSystem.set('settings.music',   musEl.checked); });
    vibEl.addEventListener('change', () => { this.audio.toggleVibrate(vibEl.checked);  SaveSystem.set('settings.vibrate', vibEl.checked); });

    document.getElementById('btn-reset-data').addEventListener('click', () => {
      if (confirm('Reset ALL data? This cannot be undone.')) {
        SaveSystem.reset();
        this.ui.showToast('Data reset!', 'info');
        closeSettings();
        this._showMenu();
      }
    });

    // Menu settings button (accessible from main menu)
    document.getElementById('btn-menu-settings')?.addEventListener('click', openSettings);

    // Main menu → mode select
    document.getElementById('btn-play').addEventListener('click', () => {
      this.ui.hide('menu-screen');
      this._showModeSelect();
    });

    // Mode select back
    document.getElementById('btn-mode-back').addEventListener('click', () => {
      this.ui.hide('mode-screen');
      this._showMenu();
    });

    // Mode: Story → level select
    document.getElementById('mode-card-levels').addEventListener('click', () => {
      this.ui.hide('mode-screen');
      this.ui.buildLevelScreen(
        SaveSystem.get('levelStars') || [0,0,0,0,0],
        SaveSystem.get('unlockedLevel') || 1,
        idx => { this.ui.hide('level-screen'); this.startLevel(idx); }
      );
      this.ui.show('level-screen');
    });

    // Mode: LMS → start immediately
    document.getElementById('mode-card-lms').addEventListener('click', () => {
      this.ui.hide('mode-screen');
      this.startLMS();
    });

    document.getElementById('btn-level-back').addEventListener('click', () => {
      this.ui.hide('level-screen');
      this._showModeSelect();
    });

    document.getElementById('btn-upgrades').addEventListener('click', () => {
      this.ui.hide('menu-screen');
      this._refreshUpgrades();
      this.ui.show('upgrade-screen');
    });

    document.getElementById('btn-upgrade-back').addEventListener('click', () => {
      this.ui.hide('upgrade-screen');
      this._showMenu();
    });

    // Game over
    document.getElementById('btn-retry').addEventListener('click', () => {
      this.ui.hide('gameover-screen');
      if (this._lastWasLMS) this.startLMS(); else this.startLevel(this._levelIdx);
    });
    document.getElementById('btn-go-menu').addEventListener('click', () => {
      this.ui.hide('gameover-screen');
      this._showMenu();
    });

    // Victory
    document.getElementById('btn-next-level').addEventListener('click', () => {
      this.ui.hide('victory-screen');
      if (this._lastWasLMS || this._levelIdx < 0) { this._showMenu(); return; }
      const next = this._levelIdx + 1;
      if (next < LEVELS.length) this.startLevel(next); else this._showMenu();
    });
    document.getElementById('btn-vic-menu').addEventListener('click', () => {
      this.ui.hide('victory-screen');
      this._showMenu();
    });
  }

  // Rebuild upgrade screen and refresh coin count
  _refreshUpgrades() {
    this.ui.buildUpgradeScreen(SaveSystem.getData(), id => {
      const data  = SaveSystem.getData();
      const level = (data.upgrades && data.upgrades[id]) || 0;
      const def   = UPGRADE_DEFS.find(d => d.id === id);
      const cost  = def.costs[level];
      if ((data.coins || 0) >= cost) {
        SaveSystem.addCoins(-cost);
        SaveSystem.set(`upgrades.${id}`, level + 1);
        this.audio.playCollect();
        this.ui.showToast(`${def.name} upgraded!`, 'good');
        this._refreshUpgrades(); // re-render
      } else {
        this.ui.showToast('Not enough coins!', 'bad');
      }
    });
  }
}

// ── Entry point ──────────────────────────────────────────────────────────────
window.addEventListener('load', () => {
  const game = new Game();
  game.init();
});
