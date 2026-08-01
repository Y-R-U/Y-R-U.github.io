/**
 * Main game loop and state management
 */
class Game {
    constructor() {
        this.canvas = document.getElementById('game-canvas');
        this.renderer = new Renderer(this.canvas);
        this.camera = new Camera(this.canvas);
        this.input = new Input(this.canvas);
        this.world = new World();
        this.collision = new CollisionSystem();
        this.particles = new ParticleSystem();
        this.audio = new Audio();
        this.ai = new AI(this.collision);

        this.state = 'menu'; // menu, playing, dead, won
        this.paused = false;
        this.player = null;
        this.snakes = [];
        this.gameStartTime = 0;
        this.lastUpdate = 0;
        this.lastBoostSound = 0;
        this.lastEatSound = 0;
        this.gameStats = { mass: 0, kills: 0, time: 0 };
        this.resolved = false;   // this run has already ended in a death or a win
        this._eatenIndices = new Set();
        this._puIndices = new Set();

        this.rivalRoster = [];
        this.playerLevel = 1;
        this.boostReadyAt = 0;   // performance.now() at which the ability recharges
        this._lastRunSave = 0;
        this._boostBtnState = '';

        this.saveData = Storage.load();

        // Keep camera in sync with renderer resize
        this._origResize = this.renderer.resize.bind(this.renderer);
        this.renderer.resize = () => {
            this._origResize();
            this.camera.updateViewSize();
        };

        this._setupUI();
        this._loop = this._loop.bind(this);
        requestAnimationFrame(this._loop);
    }

    _setupUI() {
        // Menu screen
        const usernameInput = document.getElementById('username-input');
        if (usernameInput && this.saveData.username) {
            usernameInput.value = this.saveData.username;
        }

        document.getElementById('play-btn')?.addEventListener('click', () => {
            this.audio.init();
            this.audio.resume();
            this.audio.playClick();
            this._startGame();
        });

        document.getElementById('upgrades-btn')?.addEventListener('click', () => {
            this.audio.init();
            this.audio.playClick();
            this._showScreen('upgrades-screen');
            this._renderUpgrades();
        });

        document.getElementById('skins-btn')?.addEventListener('click', () => {
            this.audio.init();
            this.audio.playClick();
            this._showScreen('skins-screen');
            this._renderSkins();
        });

        document.getElementById('stats-btn')?.addEventListener('click', () => {
            this.audio.init();
            this.audio.playClick();
            this._showScreen('stats-screen');
            this._renderStats();
        });

        // Back buttons
        document.querySelectorAll('.back-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.audio.playClick();
                this._showScreen('menu-screen');
            });
        });

        // Death screen
        document.getElementById('play-again-btn')?.addEventListener('click', () => {
            this.audio.playClick();
            this._startGame();
        });

        document.getElementById('death-menu-btn')?.addEventListener('click', () => {
            this.audio.playClick();
            this._showScreen('menu-screen');
            this.state = 'menu';
        });

        document.getElementById('death-upgrades-btn')?.addEventListener('click', () => {
            this.audio.playClick();
            this._showScreen('upgrades-screen');
            this._renderUpgrades();
        });

        // Win screen
        document.getElementById('win-again-btn')?.addEventListener('click', () => {
            this.audio.playClick();
            this._startGame();
        });

        document.getElementById('win-upgrades-btn')?.addEventListener('click', () => {
            this.audio.playClick();
            this._showScreen('upgrades-screen');
            this._renderUpgrades();
        });

        document.getElementById('win-menu-btn')?.addEventListener('click', () => {
            this.audio.playClick();
            this._showScreen('menu-screen');
            this.state = 'menu';
        });

        document.getElementById('ladder-btn')?.addEventListener('click', () => {
            this.audio.init();
            this.audio.playClick();
            this._showScreen('ladder-screen');
            this._renderLadder();
        });

        document.getElementById('resume-btn')?.addEventListener('click', () => {
            this.audio.init();
            this.audio.resume();
            this.audio.playClick();
            const run = Storage.loadRun();
            if (run) this._startGame(run);
            else this._refreshResumeButton();
        });

        const boostBtn = document.getElementById('boost-btn');
        if (boostBtn) {
            const press = e => {
                e.preventDefault();
                this.input.boostPressed = true;
            };
            boostBtn.addEventListener('touchstart', press, { passive: false });
            boostBtn.addEventListener('mousedown', press);
        }

        document.getElementById('pause-btn')?.addEventListener('click', () => {
            this.audio.playClick();
            this._setPaused(!this.paused);
        });

        document.getElementById('pause-resume-btn')?.addEventListener('click', () => {
            this.audio.playClick();
            this._setPaused(false);
        });

        // The overlay covers the pause button, so tapping the backdrop has to
        // work as well — otherwise the obvious way back in is the one that fails.
        document.getElementById('pause-overlay')?.addEventListener('click', e => {
            if (e.target.id === 'pause-overlay') this._setPaused(false);
        });

        document.getElementById('pause-quit-btn')?.addEventListener('click', () => {
            this.audio.playClick();
            this._quitRun();
        });

        // Leaving the tab pauses the run rather than letting it die unattended.
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') return;
            if (this.state === 'playing') {
                this._saveRun(true);
                this._setPaused(true);
            }
        });
        window.addEventListener('pagehide', () => {
            if (this.state === 'playing') this._saveRun(true);
        });

        // Update coins display
        this._updateCoinsDisplay();

        // Show menu
        this._showScreen('menu-screen');
        this._refreshResumeButton();
        this._renderLadderPreview();
    }

    _showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        const screen = document.getElementById(screenId);
        if (screen) screen.classList.add('active');

        const gameUI = document.getElementById('game-ui');
        if (gameUI) {
            gameUI.style.display = screenId === 'game-screen' ? 'block' : 'none';
        }

        if (screenId === 'menu-screen') {
            this._refreshResumeButton();
            this._renderLadderPreview();
            if (this.cloud) this.cloud.checkpoint();
        }
    }

    _updateCoinsDisplay() {
        document.querySelectorAll('.coins-display').forEach(el => {
            el.textContent = this.saveData.coins;
        });
    }

    /**
     * Start a run, or pick a saved one back up. A resumed snake comes back at
     * its own mass, position and power-ups; the bots do not — they are
     * strangers, and restoring fifteen of them exactly is a lot of state for
     * nothing the player would notice.
     */
    _startGame(resume) {
        // Save username
        const usernameInput = document.getElementById('username-input');
        if (usernameInput) {
            const name = usernameInput.value.trim() || 'Player';
            this.saveData.username = name;
            Storage.save(this.saveData);
            usernameInput.blur();   // drop the keyboard before we measure anything
        }

        // Typing a name opens the on-screen keyboard, which changes the viewport
        // under us. Measure once more now that it's gone.
        this.renderer.resize();

        // Get player stats from upgrades
        const stats = Upgrades.getPlayerStats(this.saveData);
        const saved = resume && resume.player;

        // Create player snake
        this.player = new Snake({
            name: this.saveData.username || 'Player',
            isPlayer: true,
            skinId: this.saveData.selectedSkin,
            startLength: saved ? saved.mass : stats.startLength,
            speedLevels: stats.speedLevels,
            speedPerLevel: stats.speedPerLevel,
            levelSpeed: true,
            boostTimeBonus: stats.boostTimeBonus,
            magnetRange: stats.magnetRange,
            boostCostReduction: stats.boostCostReduction,
            position: saved ? { x: saved.x, y: saved.y } : undefined,
            angle: saved ? saved.angle : undefined
        });
        if (saved) {
            this.player.kills = saved.kills || 0;
            const now = performance.now();
            for (const [id, left] of Object.entries(saved.powerups || {})) {
                if (left > 0) this.player.powerups[id] = now + left;
            }
        }

        // Reset world
        this.world.reset();
        this.particles.clear();
        this.camera.reset();
        this.camera.zoom = this.camera.targetZoom = this.player.levelZoom;
        // Snap camera to player position immediately
        this.camera.x = this.player.x;
        this.camera.y = this.player.y;
        this.input.reset(this.player.angle);

        // A fresh AI, with difficulty set from the player's whole career rather
        // than this session — see Storage.aiPressure.
        const pressure = Storage.aiPressure(this.saveData);
        this.ai = new AI(this.collision);
        this.ai.setPressure(pressure);

        // The regulars: same names all session, and the only bots carrying any
        // of the speed edge this player has. Their share is worked out when
        // each one spawns — see _playerSpeedEdge.
        this.rivalRoster = Rivals.session(this.saveData, pressure).map(r => ({ ...r }));

        // Create snakes array and spawn bots
        this.snakes = [this.player];
        this._spawnBots(CONFIG.BOT_COUNT);

        // Game state
        this.state = 'playing';
        this.paused = false;
        this.resolved = false;
        this.gameStartTime = performance.now() - (resume ? resume.elapsed || 0 : 0);
        this.lastUpdate = performance.now();
        this.lastEatSound = 0;
        this.playerLevel = this.player.level;
        this.boostReadyAt = performance.now() +
            (resume ? resume.boostIn || 0 : (CONFIG.BOOST_STARTS_READY ? 0 : CONFIG.BOOST_RECHARGE_MS));
        this._lastRunSave = performance.now();
        this.gameStats = { mass: 0, kills: 0, time: 0 };

        this._showScreen('game-screen');
        this._setPaused(false);
        this._saveRun(true);

        this.audio.resume();
    }

    /** Mass of the biggest live snake — what new bots are sized against. */
    _leaderMass() {
        let m = 0;
        for (const s of this.snakes) {
            if (s.alive && s.mass > m) m = s.mass;
        }
        return m;
    }

    _spawnBots(count) {
        for (let i = 0; i < count; i++) this._respawnBot();
    }

    _respawnBot() {
        const rival = this._openRivalSlot();
        if (rival) rival.bonusSpeed = Rivals.speedBonus(rival, this._playerSpeedEdge());
        const bot = AI.createBot(this.saveData, this._leaderMass(), rival);
        this.snakes.push(bot);
        this.ai.register(bot, undefined, rival ? rival.tier : undefined);
    }

    /**
     * How much faster than a plain snake the player is right now. A regular
     * gets a share of *this*, never of what the player has bought, or one could
     * spawn into a level-1 arena faster than a player who hasn't unlocked it.
     */
    _playerSpeedEdge() {
        if (!this.player) return 0;
        return Math.max(0, this.player.baseSpeed - CONFIG.SNAKE_BASE_SPEED);
    }

    /** The first regular who isn't currently in the arena, if any. */
    _openRivalSlot() {
        for (const r of this.rivalRoster) {
            if (!this.snakes.some(s => s.alive && s.rivalName === r.name)) return r;
        }
        return null;
    }

    /** Main game loop */
    _loop(timestamp) {
        requestAnimationFrame(this._loop);

        if (this.state !== 'playing') {
            // Still render menu background
            if (this.state === 'menu' || this.state === 'dead' || this.state === 'won') {
                this.renderer.clear();
            }
            return;
        }

        if (this.input.consumePausePress()) this._setPaused(!this.paused);

        if (this.paused) {
            this._render();
            return;
        }

        const now = performance.now();
        const dt = Math.min(now - this.lastUpdate, 50); // Cap at 50ms
        this.lastUpdate = now;

        this._update(dt, now);
        this._render();
    }

    _setPaused(on) {
        if (this.state !== 'playing') on = false;
        this.paused = !!on;

        const overlay = document.getElementById('pause-overlay');
        if (overlay) overlay.classList.toggle('show', this.paused);
        const btn = document.getElementById('pause-btn');
        if (btn) btn.setAttribute('aria-pressed', this.paused ? 'true' : 'false');

        // Resuming after any length of pause must not hand the world one huge
        // frame — dt is capped, but the clock still has to be re-based.
        if (!this.paused) this.lastUpdate = performance.now();
        else this._saveRun(true);
    }

    /** Leave a run without dying: the run is abandoned, nothing is banked. */
    _quitRun() {
        Storage.clearRun();
        this.state = 'menu';
        this.paused = false;
        const overlay = document.getElementById('pause-overlay');
        if (overlay) overlay.classList.remove('show');
        this._showScreen('menu-screen');
    }

    /** The BOOST ability: a free power-up, at random, once a minute. */
    _fireBoost(now) {
        if (!this.player || !this.player.alive) return;
        if (now < this.boostReadyAt) return;

        const types = Object.values(CONFIG.POWERUP_TYPES);
        const type = Utils.randPick(types);
        const ms = this.player.applyPowerup(type.id, CONFIG.BOOST_ABILITY_MS);
        this.boostReadyAt = now + CONFIG.BOOST_RECHARGE_MS;

        this.audio.playPowerup();
        this.particles.emitPowerup(this.player.x, this.player.y, type.color);
        this._showPowerupNotification(type, Math.round(ms / 1000) + 's');
    }

    /** Keep the button's charge readable without writing to the DOM every frame. */
    _updateBoostButton(now) {
        const btn = document.getElementById('boost-btn');
        if (!btn) return;
        const left = Math.max(0, this.boostReadyAt - now);
        const ready = left <= 0;
        const pct = ready ? 100 : Math.round(100 - (left / CONFIG.BOOST_RECHARGE_MS) * 100);
        const key = ready ? 'ready' : String(Math.round(left / 1000));
        if (key === this._boostBtnState) return;
        this._boostBtnState = key;

        btn.classList.toggle('ready', ready);
        btn.style.setProperty('--charge', pct + '%');
        btn.textContent = ready ? 'BOOST' : Math.ceil(left / 1000) + 's';
    }

    /** Write the run to its local slot, at most every RESUME_SAVE_MS. */
    _saveRun(force) {
        if (this.state !== 'playing' || !this.player || !this.player.alive || this.resolved) return;
        const now = performance.now();
        if (!force && now - this._lastRunSave < CONFIG.RESUME_SAVE_MS) return;
        this._lastRunSave = now;

        const powerups = {};
        for (const id in this.player.powerups) {
            const left = Math.round(this.player.powerups[id] - now);
            if (left > 0) powerups[id] = left;
        }

        Storage.saveRun({
            elapsed: Math.round(now - this.gameStartTime),
            boostIn: Math.max(0, Math.round(this.boostReadyAt - now)),
            player: {
                x: this.player.x,
                y: this.player.y,
                angle: this.player.angle,
                mass: Math.round(this.player.mass),
                kills: this.player.kills,
                powerups
            }
        });
    }

    /** Offer to pick up an abandoned run, if there is one worth picking up. */
    _refreshResumeButton() {
        const btn = document.getElementById('resume-btn');
        if (!btn) return;
        const run = Storage.loadRun();
        if (!run) {
            btn.style.display = 'none';
            return;
        }
        btn.style.display = '';
        const mass = Utils.formatNumber(run.player.mass || 0);
        btn.innerHTML = `RESUME <small>${mass} mass · ${this._formatTime((run.elapsed || 0) / 1000)}</small>`;
    }

    /** Update game state */
    _update(dt, now) {
        // Update player input
        if (this.player && this.player.alive) {
            const angle = this.input.update(dt, this.player.angle);
            this.player.setTarget(angle);
            if (this.input.consumeBoostPress()) this._fireBoost(now);
        }

        // Update AI. The bots read the spatial hashes built at the end of the
        // last frame — one frame stale is a few pixels of error and saves
        // rebuilding the whole thing twice per frame.
        this.ai.update(dt, this.snakes, this.world.food, this.world.powerups);

        // Update all snakes
        let hasDeath = false;
        for (const snake of this.snakes) {
            if (!snake.alive) continue;
            snake.update(dt);

            // Handle boundary deaths (flagged by snake.update)
            if (snake.boundaryDeath && snake.alive) {
                const pellets = snake.die(null);
                // Only add death pellets if inside boundary (not at edge)
                if (Utils.dist(0, 0, snake.x, snake.y) < CONFIG.WORLD_RADIUS + 200) {
                    this.world.addDeathPellets(pellets);
                }
                this.particles.emitDeath(snake.x, snake.y, snake.skin.colors);
                hasDeath = true;

                if (snake.isPlayer) {
                    this.audio.playDeath();
                    this.camera.shake(15);
                    this._onPlayerDeath();
                }
                this.ai.unregister(snake.id);
                continue;
            }

            // Boost trail pellets
            if (snake.boosting && !snake.hasPowerup('speed')) {
                const pellet = snake.getBoostPellet();
                if (pellet) {
                    this.world.addBoostPellet(
                        pellet.x, pellet.y,
                        snake.getColorAt(snake.segCount - 1),
                        pellet.value, pellet.owner, now
                    );
                    if (snake.isPlayer) {
                        this.particles.emitBoost(pellet.x, pellet.y, snake.getColorAt(0));
                    }
                }
            }
        }

        // Build the spatial hashes for this frame's collision resolution
        this.collision.buildFromSnakes(this.snakes);
        this.collision.buildFoodHash(this.world.food);

        // Check snake-to-snake collisions
        const bodyCollisions = this.collision.checkSnakeCollisions(this.snakes);
        const headCollisions = this.collision.checkHeadCollisions(this.snakes);
        const allCollisions = [...bodyCollisions, ...headCollisions];

        for (const { victim, killer } of allCollisions) {
            if (!victim.alive) continue;
            const pellets = victim.die(killer);
            this.world.addDeathPellets(pellets);
            this.particles.emitDeath(victim.x, victim.y, victim.skin.colors);
            this.camera.shake(victim.isPlayer ? 15 : 5);
            hasDeath = true;

            if (victim.isPlayer) {
                this.audio.playDeath();
                this._onPlayerDeath();
            } else if (killer && killer.isPlayer) {
                this.audio.playKill();
            }

            this.ai.unregister(victim.id);
        }

        // Check food collisions. removeFood is swap-with-last, so indices MUST be
        // removed in descending order — the element swapped into a freed slot
        // always comes from a higher index that we have already dealt with.
        const eaten = this.collision.checkFoodCollisions(this.snakes, this.world.food);
        eaten.sort((a, b) => b.foodIndex - a.foodIndex);
        const removedIndices = this._eatenIndices;
        removedIndices.clear();
        for (const { snake, foodIndex, food } of eaten) {
            if (removedIndices.has(foodIndex)) continue;
            removedIndices.add(foodIndex);
            // Reclaiming your own boost trail never benefits from 2x Growth.
            snake.grow(food.value, food.owner === snake.id);
            this.world.removeFood(foodIndex);

            if (snake.isPlayer) {
                this.particles.emitEat(food.x, food.y, food.color);
                // Throttle eat sound to avoid noise spam
                if (now - this.lastEatSound > 60) {
                    this.lastEatSound = now;
                    this.audio.playEat();
                }
            }
        }

        // Check powerup collisions
        const collected = this.collision.checkPowerupCollisions(this.snakes, this.world.powerups);
        collected.sort((a, b) => b.powerupIndex - a.powerupIndex);
        const removedPU = this._puIndices;
        removedPU.clear();
        for (const { snake, powerupIndex, powerup } of collected) {
            if (removedPU.has(powerupIndex)) continue;
            removedPU.add(powerupIndex);
            const ms = snake.applyPowerup(powerup.type.id);
            this.world.removePowerup(powerupIndex);
            this.particles.emitPowerup(powerup.x, powerup.y, powerup.type.color);

            if (snake.isPlayer) {
                this.audio.playPowerup();
                this._showPowerupNotification(powerup.type, Math.round(ms / 1000) + 's');
            }
        }

        // Victory check — reaching WIN_MASS ends the run as a win.
        if (!this.resolved && this.player && this.player.alive &&
            this.player.mass >= CONFIG.WIN_MASS) {
            this._onPlayerWin();
        }

        // Replenish food and spawn powerups
        this.world.replenish();
        this.world.updatePowerups(now);

        // Respawn dead bots
        const aliveCount = this.snakes.filter(s => s.alive && !s.isPlayer).length;
        if (aliveCount < CONFIG.BOT_COUNT) {
            this._respawnBot();
        }

        // Clean up dead snakes only when deaths occurred (avoid GC pressure)
        if (hasDeath) {
            this.snakes = this.snakes.filter(s => s.alive || s.isPlayer);
        }

        // Levelling up: the camera step, the speed step and the flourish all
        // happen here, once, on the frame the level actually changes.
        if (this.player && this.player.alive && this.player.level > this.playerLevel) {
            this.playerLevel = this.player.level;
            this._onLevelUp(this.playerLevel);
        }

        // Update camera
        if (this.player && this.player.alive) {
            this.camera.follow(this.player.x, this.player.y, this.player.levelZoom);
        }

        this._updateBoostButton(now);
        this._saveRun(false);

        // Update particles
        this.particles.update(dt);
    }

    _onLevelUp(level) {
        this.audio.playPowerup();
        this.particles.emitPowerup(this.player.x, this.player.y, '#ffd700');

        const notif = document.getElementById('powerup-notification');
        if (!notif) return;
        notif.innerHTML =
            `<span style="color:#ffd700">LEVEL ${level}</span><br><small>Faster, and a wider view</small>`;
        notif.classList.add('show');
        clearTimeout(this._notifTimer);
        this._notifTimer = setTimeout(() => notif.classList.remove('show'), 2200);
    }

    /** Render everything */
    _render() {
        const r = this.renderer;
        r.clear();
        r.drawGrid(this.camera);
        r.drawBoundary(this.camera);
        r.drawFood(this.world.food, this.camera);
        r.drawPowerups(this.world.powerups, this.camera);

        // Draw snakes (player last so it's on top)
        for (const snake of this.snakes) {
            if (!snake.isPlayer) {
                r.drawSnake(snake, this.camera, false);
            }
        }
        if (this.player && this.player.alive) {
            r.drawSnake(this.player, this.camera, true);
        }

        r.drawParticles(this.particles, this.camera);
        r.drawBoundaryWarning(this.player);
        r.drawHUD(this.player, this.snakes, performance.now() - this.gameStartTime);
        r.drawMinimap(this.player, this.snakes, this.camera);
        r.drawJoystick(this.input.getJoystickData());
    }

    /**
     * Record a finished run and bank the coins. Shared by death and victory so
     * the two can never disagree about what a run was worth.
     */
    _settleRun(won) {
        const gameTime = (performance.now() - this.gameStartTime) / 1000;
        const mass = Math.floor(this.player.mass);
        const kills = this.player.kills;

        // Capture previous high score BEFORE saving
        const previousHighScore = this.saveData.stats.highScore;
        const coins = Storage.calculateCoins(mass, kills, this.saveData.upgrades.coinBonus, won);

        this.saveData = Storage.update(data => {
            data.coins += coins;
            data.stats.gamesPlayed++;
            data.stats.totalKills += kills;
            data.stats.totalMassEaten += mass;
            data.stats.totalTimePlayed += gameTime;
            if (mass > data.stats.highScore) data.stats.highScore = mass;
            if (mass > data.stats.longestSnake) data.stats.longestSnake = mass;
            if (kills > data.stats.bestKillStreak) data.stats.bestKillStreak = kills;
            if (won) {
                data.stats.victories = (data.stats.victories || 0) + 1;
                if (!data.stats.bestWinTime || gameTime < data.stats.bestWinTime) {
                    data.stats.bestWinTime = gameTime;
                }
            }
        });

        // The run is over, so the resume slot must go before anything can offer
        // to pick it back up.
        Storage.clearRun();

        const ladder = Ladder.apply({ won, mass, kills });

        // NB: the account layer is told about the finished run from
        // _runFinishedOnResults(), not here — see the note there.

        return { mass, kills, coins, gameTime, ladder, isNewHighScore: mass > previousHighScore };
    }

    /**
     * Tell the account layer a run is over. This is what eventually triggers its
     * "sign in and keep your progress" nudge, so WHEN it is called matters.
     *
     * Death and victory both settle the run at the instant it ends, then hold
     * the arena for ~1.5s of death animation before the results screen appears.
     * Announcing the run there put the sign-in modal on top of a still-moving
     * arena, so it read as a popup interrupting play rather than a question
     * asked at the end of it. Call it only once the results screen is actually
     * up — and only if it really is the screen in front of the player, so a
     * quick PLAY AGAIN can never leave the modal hanging over a live run.
     */
    _runFinishedOnResults(screenId) {
        if (!this.cloud) return;
        setTimeout(() => {
            const active = document.querySelector('.screen.active');
            if (!active || active.id !== screenId) return;   // player has moved on
            this.cloud.runFinished();
        }, 700);
    }

    /** Handle player death */
    _onPlayerDeath() {
        if (this.resolved) return;
        this.resolved = true;
        const r = this._settleRun(false);

        // Show death screen after brief delay
        setTimeout(() => {
            this.state = 'dead';
            this._showDeathScreen(r.mass, r.kills, r.coins, r.gameTime, r.isNewHighScore);
            this._showLadderMove('death-ladder', r.ladder);
        }, 1500);
    }

    /** Handle reaching WIN_MASS — the run ends here, as a win. */
    _onPlayerWin() {
        if (this.resolved) return;
        this.resolved = true;
        const r = this._settleRun(true);

        this.audio.playPowerup();
        this.camera.shake(10);
        this.particles.emitDeath(this.player.x, this.player.y, ['#ffd700', '#ffffff', '#ffcc00']);

        setTimeout(() => {
            this.state = 'won';
            this._showWinScreen(r.mass, r.kills, r.coins, r.gameTime);
            this._showLadderMove('win-ladder', r.ladder);
        }, 1400);
    }

    _showWinScreen(mass, kills, coins, time) {
        this._showScreen('win-screen');
        const set = (id, value) => {
            const el = document.getElementById(id);
            if (el) el.textContent = value;
        };
        set('win-score', Utils.formatNumber(mass));
        set('win-kills', kills);
        set('win-coins', '+' + coins);
        set('win-time', this._formatTime(time));

        const best = this.saveData.stats.bestWinTime;
        const total = this.saveData.stats.victories;
        set('win-note', total === 1
            ? 'First victory!'
            : `Victory ${total} · best time ${this._formatTime(best)}`);

        this._updateCoinsDisplay();
        this._runFinishedOnResults('win-screen');
    }

    _showDeathScreen(mass, kills, coins, time, isNewHighScore) {
        this._showScreen('death-screen');
        document.getElementById('death-score').textContent = Utils.formatNumber(mass);
        document.getElementById('death-kills').textContent = kills;
        document.getElementById('death-coins').textContent = '+' + coins;
        document.getElementById('death-time').textContent = this._formatTime(time);

        // Show new high score badge
        const highScoreEl = document.getElementById('death-highscore');
        if (highScoreEl) {
            if (isNewHighScore) {
                highScoreEl.textContent = 'NEW HIGH SCORE!';
                highScoreEl.style.display = 'block';
            } else {
                highScoreEl.style.display = 'none';
            }
        }

        this._updateCoinsDisplay();
        this._runFinishedOnResults('death-screen');
    }

    _showPowerupNotification(type, note) {
        const notif = document.getElementById('powerup-notification');
        if (!notif) return;
        notif.innerHTML = `<span style="color:${type.color}">${type.icon} ${type.name}</span><br>` +
            `<small>${type.desc}${note ? ' · ' + note : ''}</small>`;
        notif.classList.add('show');
        clearTimeout(this._notifTimer);
        this._notifTimer = setTimeout(() => notif.classList.remove('show'), 2000);
    }

    _formatTime(seconds) {
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    }

    /** What the run did to the player's ladder position, on a results screen. */
    _showLadderMove(elId, move) {
        const el = document.getElementById(elId);
        if (!el || !move) return;
        const up = move.delta >= 0;
        const moved = move.climbed;
        const climb = moved > 0 ? ` · up ${Utils.thousands(moved)}` : moved < 0 ? ` · down ${Utils.thousands(-moved)}` : '';
        el.className = 'ladder-move ' + (up ? 'up' : 'down');
        el.innerHTML =
            `<span class="ladder-move-pts">${up ? '+' : ''}${move.delta}</span>` +
            `<span class="ladder-move-rank">#${Utils.thousands(move.rank)} of ${Utils.thousands(Ladder.size())}${climb}</span>`;
    }

    _ladderRows(rows) {
        // The bottom of a quarter-million-deep table really is everyone on zero,
        // and a column of noughts reads as a bug rather than as the truth.
        return rows.map(r => `
            <div class="ladder-row ${r.isPlayer ? 'me' : ''} ${r.isRival ? 'rival' : ''}">
                <span class="ladder-pos">${Utils.thousands(r.rank)}</span>
                <span class="ladder-name">${Utils.escapeHtml(r.name)}</span>
                <span class="ladder-rating">${r.rating > 0 ? r.rating : '–'}</span>
            </div>`).join('');
    }

    /** The few rows either side of the player, for the menu. */
    _renderLadderPreview() {
        const box = document.getElementById('ladder-preview');
        if (!box) return;

        this.saveData = Storage.load();
        const rows = Ladder.around(3, this.saveData);
        const rank = Ladder.rank(this.saveData);

        box.innerHTML =
            `<div class="ladder-head">GLOBAL LADDER` +
            `<span>#${Utils.thousands(rank)} of ${Utils.thousands(Ladder.size())}</span></div>` +
            this._ladderRows(rows);
    }

    /** The neighbourhood, plus the top of the world for something to aim at. */
    _renderLadder() {
        const list = document.getElementById('ladder-list');
        if (!list) return;

        this.saveData = Storage.load();
        const state = Ladder.state(this.saveData);
        const rank = Ladder.rank(this.saveData);
        const par = Math.round(Ladder.par(state.rating));

        const note = document.getElementById('ladder-note');
        if (note) {
            const best = state.bestRank && state.bestRank < rank
                ? ` · best #${Utils.thousands(state.bestRank)}` : '';
            note.textContent =
                `Rating ${state.rating}${best}. ` +
                `Beat ${Utils.thousands(par)} mass in a run to climb — that bar rises with you.`;
        }

        const top = Ladder.top(5);
        const near = Ladder.around(41, this.saveData);

        list.innerHTML =
            this._ladderRows(top) +
            (near[0].rank > top.length + 1 ? '<div class="ladder-gap">···</div>' : '') +
            this._ladderRows(near);

        const mine = list.querySelector('.ladder-row.me');
        if (mine) mine.scrollIntoView({ block: 'center' });
    }

    /** Render upgrades screen */
    _renderUpgrades() {
        const container = document.getElementById('upgrades-list');
        if (!container) return;

        this.saveData = Storage.load();
        const items = Upgrades.getUpgradeDisplayData();

        container.innerHTML = items.map(item => `
            <div class="upgrade-item ${item.maxed ? 'maxed' : ''} ${item.canAfford ? 'affordable' : ''}">
                <div class="upgrade-info">
                    <div class="upgrade-name">${item.name}</div>
                    <div class="upgrade-level">Lv ${item.level}/${item.maxLevel}</div>
                    <div class="upgrade-bar">
                        <div class="upgrade-bar-fill" style="width:${(item.level / item.maxLevel) * 100}%"></div>
                    </div>
                    <div class="upgrade-effect">${item.effectNow}${
                        item.effectNext ? ` <span class="upgrade-next">→ ${item.effectNext}</span>` : ''
                    }</div>
                </div>
                <button class="upgrade-buy-btn" data-key="${item.key}"
                    ${item.maxed || !item.canAfford ? 'disabled' : ''}>
                    ${item.maxed ? 'MAX' : `${Utils.formatNumber(item.cost)}<small>coins</small>`}
                </button>
            </div>
        `).join('');

        container.querySelectorAll('.upgrade-buy-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const key = btn.dataset.key;
                if (Upgrades.purchaseUpgrade(key)) {
                    this.audio.playPowerup();
                    this.saveData = Storage.load();
                    this._updateCoinsDisplay();
                    this._renderUpgrades();
                }
            });
        });
    }

    /** Render skins screen */
    _renderSkins() {
        const container = document.getElementById('skins-list');
        if (!container) return;

        this.saveData = Storage.load();
        const skins = Upgrades.getSkinDisplayData();

        container.innerHTML = skins.map(skin => `
            <div class="skin-item ${skin.selected ? 'selected' : ''} ${skin.owned ? 'owned' : ''}">
                <div class="skin-preview">
                    ${skin.colors.map(c => `<span class="skin-dot" style="background:${c}"></span>`).join('')}
                </div>
                <div class="skin-name">${skin.name}</div>
                ${skin.selected ? '<div class="skin-badge">EQUIPPED</div>' :
                  skin.owned ? `<button class="skin-equip-btn" data-id="${skin.id}">Equip</button>` :
                  `<button class="skin-buy-btn" data-id="${skin.id}" ${skin.canAfford ? '' : 'disabled'}>
                    ${skin.cost} coins
                   </button>`}
            </div>
        `).join('');

        container.querySelectorAll('.skin-equip-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                Upgrades.selectSkin(btn.dataset.id);
                this.audio.playClick();
                this.saveData = Storage.load();
                this._renderSkins();
            });
        });

        container.querySelectorAll('.skin-buy-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                if (Upgrades.purchaseSkin(btn.dataset.id)) {
                    Upgrades.selectSkin(btn.dataset.id);
                    this.audio.playPowerup();
                    this.saveData = Storage.load();
                    this._updateCoinsDisplay();
                    this._renderSkins();
                }
            });
        });
    }

    /** Render stats screen */
    _renderStats() {
        const data = Storage.load();
        const s = data.stats;
        const container = document.getElementById('stats-list');
        if (!container) return;

        container.innerHTML = `
            <div class="stat-row"><span>Games Played</span><span>${s.gamesPlayed}</span></div>
            <div class="stat-row"><span>Victories</span><span>${s.victories || 0}</span></div>
            ${s.bestWinTime ? `<div class="stat-row"><span>Fastest Victory</span><span>${this._formatTime(s.bestWinTime)}</span></div>` : ''}
            <div class="stat-row"><span>High Score</span><span>${Utils.formatNumber(s.highScore)}</span></div>
            <div class="stat-row"><span>Total Kills</span><span>${s.totalKills}</span></div>
            <div class="stat-row"><span>Best Kill Streak</span><span>${s.bestKillStreak}</span></div>
            <div class="stat-row"><span>Longest Snake</span><span>${Utils.formatNumber(s.longestSnake)}</span></div>
            <div class="stat-row"><span>Total Mass Eaten</span><span>${Utils.formatNumber(s.totalMassEaten)}</span></div>
            <div class="stat-row"><span>Time Played</span><span>${this._formatTime(s.totalTimePlayed)}</span></div>
        `;
    }
}

// Start game when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.game = new Game();

    // Player accounts are strictly optional. Load the glue dynamically and
    // swallow any failure, so offline, blocked, or file:// still plays — just
    // without progress following the player between devices.
    const params = new URLSearchParams(location.search);
    if (!params.has('test') && !params.has('soak')) {
        import('./cloud.js')
            .then(mod => {
                window.game.cloud = mod;
                // The menu is already up by the time this lands, so it missed its
                // own checkpoint; let the first screen settle, then offer.
                setTimeout(() => mod.checkpoint(), 1500);
            })
            .catch(() => { /* no account layer available; carry on locally */ });
    }
});

// Register service worker
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
}
