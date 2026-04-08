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
  }

  // ── Initialise ───────────────────────────────────────────────────────
  init() {
    SaveSystem.load();
    this.audio.init(SaveSystem.get('settings'));
    this._initRenderer();
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
    this._timeLeft -= dt;
    this._survived += dt;

    this.input.update();
    this.player.move(this.input.dx, this.input.dz, dt);
    this.player.updateFollowers(dt, this._gt);

    for (const e of this.enemies) e.update(dt, this.player, this.collectibles, this._gt);

    this._updateCollectibles(dt);
    this._collidePlayerEnemy();
    this._collideEnemyEnemy();
    updateParticles(this.scene, dt);

    // Camera smooth follow
    this._camTarget.set(
      this.player.mesh.position.x,
      this.player.mesh.position.y + 22,
      this.player.mesh.position.z + 18
    );
    this.camera.position.lerp(this._camTarget, 0.07);
    this._camLook.set(
      this.player.mesh.position.x,
      this.player.mesh.position.y,
      this.player.mesh.position.z - 3
    );
    this.camera.lookAt(this._camLook);

    this.ui.updateHUD(
      this.player.crowdSize,
      this.enemies.length,
      this._timeLeft,
      LEVELS[this._levelIdx].targetCrowd,
      this.player.coinsThisGame
    );

    this._checkEnd();
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
    const coinGain = Math.ceil(
      (c.special ? 3 : 1) * this.player.coinMult * (this.player.luckyStarTimer > 0 ? 2 : 1)
    );
    this.player.coinsThisGame += coinGain;

    // Offer in-game upgrade every 10 collects
    if (this.player.collectiblesGot - this.player.lastIgAt >= 10) {
      this.player.lastIgAt = this.player.collectiblesGot;
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
    const px = this.player.mesh.position.x, pz = this.player.mesh.position.z;

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
        e.dispose();
        this.enemies.splice(i, 1);

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

  // ── Win / lose ────────────────────────────────────────────────────────
  _checkEnd() {
    if (!this._running) return;
    const lv = LEVELS[this._levelIdx];
    if (this.enemies.length === 0 || this.player.crowdSize >= lv.targetCrowd) {
      this._endGame(true);
    } else if (this._timeLeft <= 0) {
      this._endGame(false);
    }
  }

  // ── In-game upgrade prompt ────────────────────────────────────────────
  _offerIgUpgrade() {
    this._paused = true;
    this.audio.playLevelUp();
    this.ui.showIgUpgrade(id => {
      this.player.applyIgUpgrade(id);
      this.ui.hide('ig-upgrade-overlay');
      this._paused = false;
    });
  }

  // ── Start a level ─────────────────────────────────────────────────────
  startLevel(idx) {
    this._levelIdx = idx;
    this._cleanup();

    const lv       = LEVELS[idx];
    this._timeLeft = lv.time;
    this._survived = 0;
    this._gt       = 0;
    this._running  = false;
    this._paused   = false;

    this.ui.hide('ig-upgrade-overlay');

    // Build world
    this.map = new MapBuilder(this.scene);
    this.map.build();

    // Spawn player
    this.player = new Player(this.scene, SaveSystem.getData());

    // Spawn enemies at map edges
    this.enemies = [];
    lv.enemies.forEach(def => {
      for (let i = 0; i < def.count; i++) {
        let ex, ez, tries = 0;
        do {
          const ang = Math.random() * Math.PI * 2;
          const r   = 60 + Math.random() * 25;
          ex = Math.cos(ang) * r;
          ez = Math.sin(ang) * r;
          tries++;
        } while (tries < 30 && (Math.abs(ex) > MAP_HALF - 4 || Math.abs(ez) > MAP_HALF - 4));
        ex = Math.max(-(MAP_HALF - 4), Math.min(MAP_HALF - 4, ex));
        ez = Math.max(-(MAP_HALF - 4), Math.min(MAP_HALF - 4, ez));
        this.enemies.push(new Enemy(this.scene, def.type, ex, ez));
      }
    });

    // Seed collectibles
    this.collectibles = [];
    for (let i = 0; i < this.MAX_COLL; i++) this._spawnCollectible();

    // Snap camera
    this.camera.position.set(0, 22, 18);

    // Show HUD + joystick, attach input
    this.ui.show('hud');
    this.ui.show('joystick-zone');
    this.input.attach();

    this._running = true;
    this.audio.playRandomTheme();
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

    const lv          = LEVELS[this._levelIdx];
    const coinsEarned = this.player.coinsThisGame;
    SaveSystem.addCoins(coinsEarned);

    if (won) {
      this.audio.playVictory();
      this.audio.vibrate([50, 30, 50, 30, 100]);

      // Unlock next level
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
  }

  // ── Menu ─────────────────────────────────────────────────────────────
  _showMenu() {
    this.ui.refreshMenuCoins(SaveSystem.get('coins') || 0);
    ['level-screen','upgrade-screen','gameover-screen','victory-screen','hud','joystick-zone']
      .forEach(id => this.ui.hide(id));
    this.ui.show('menu-screen');
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

    // Main menu
    document.getElementById('btn-play').addEventListener('click', () => {
      this.ui.hide('menu-screen');
      this.ui.buildLevelScreen(
        SaveSystem.get('levelStars') || [0,0,0,0,0],
        SaveSystem.get('unlockedLevel') || 1,
        idx => { this.ui.hide('level-screen'); this.startLevel(idx); }
      );
      this.ui.show('level-screen');
    });

    document.getElementById('btn-level-back').addEventListener('click', () => {
      this.ui.hide('level-screen');
      this._showMenu();
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
      this.startLevel(this._levelIdx);
    });
    document.getElementById('btn-go-menu').addEventListener('click', () => {
      this.ui.hide('gameover-screen');
      this._showMenu();
    });

    // Victory
    document.getElementById('btn-next-level').addEventListener('click', () => {
      this.ui.hide('victory-screen');
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
