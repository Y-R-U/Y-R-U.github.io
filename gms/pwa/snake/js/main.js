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
        this.ai = new AI();

        this.state = 'menu'; // menu, playing, dead
        this.player = null;
        this.snakes = [];
        this.gameStartTime = 0;
        this.lastUpdate = 0;
        this.lastBoostSound = 0;
        this.lastEatSound = 0;
        this.gameStats = { mass: 0, kills: 0, time: 0 };

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

        // Boost button
        const boostBtn = document.getElementById('boost-btn');
        if (boostBtn) {
            boostBtn.addEventListener('touchstart', e => {
                e.preventDefault();
                this.input.boosting = true;
                boostBtn.classList.add('active');
            }, { passive: false });
            boostBtn.addEventListener('touchend', e => {
                e.preventDefault();
                this.input.boosting = false;
                boostBtn.classList.remove('active');
            }, { passive: false });
        }

        // Update coins display
        this._updateCoinsDisplay();

        // Show menu
        this._showScreen('menu-screen');
    }

    _showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        const screen = document.getElementById(screenId);
        if (screen) screen.classList.add('active');

        const gameUI = document.getElementById('game-ui');
        if (gameUI) {
            gameUI.style.display = screenId === 'game-screen' ? 'block' : 'none';
        }
    }

    _updateCoinsDisplay() {
        document.querySelectorAll('.coins-display').forEach(el => {
            el.textContent = this.saveData.coins;
        });
    }

    _startGame() {
        // Save username
        const usernameInput = document.getElementById('username-input');
        if (usernameInput) {
            const name = usernameInput.value.trim() || 'Player';
            this.saveData.username = name;
            Storage.save(this.saveData);
        }

        // Get player stats from upgrades
        const stats = Upgrades.getPlayerStats(this.saveData);

        // Create player snake
        this.player = new Snake({
            name: this.saveData.username || 'Player',
            isPlayer: true,
            skinId: this.saveData.selectedSkin,
            startLength: stats.startLength,
            speedBonus: stats.speedBonus,
            magnetRange: stats.magnetRange,
            boostCostReduction: stats.boostCostReduction
        });

        // Reset world
        this.world.reset();
        this.particles.clear();
        this.camera.reset();
        // Snap camera to player position immediately
        this.camera.x = this.player.x;
        this.camera.y = this.player.y;
        this.ai = new AI();

        // Create snakes array and spawn bots
        this.snakes = [this.player];
        this._spawnBots(CONFIG.BOT_COUNT);

        // Game state
        this.state = 'playing';
        this.gameStartTime = performance.now();
        this.lastUpdate = performance.now();
        this.lastEatSound = 0;
        this.gameStats = { mass: 0, kills: 0, time: 0 };

        this._showScreen('game-screen');

        this.audio.resume();
    }

    _spawnBots(count) {
        for (let i = 0; i < count; i++) {
            const bot = AI.createBot(this.saveData);
            this.snakes.push(bot);
            this.ai.register(bot);
        }
    }

    _respawnBot() {
        const bot = AI.createBot(this.saveData);
        this.snakes.push(bot);
        this.ai.register(bot);
    }

    /** Main game loop */
    _loop(timestamp) {
        requestAnimationFrame(this._loop);

        if (this.state !== 'playing') {
            // Still render menu background
            if (this.state === 'menu' || this.state === 'dead') {
                this.renderer.clear();
            }
            return;
        }

        const now = performance.now();
        const dt = Math.min(now - this.lastUpdate, 50); // Cap at 50ms
        this.lastUpdate = now;

        this._update(dt, now);
        this._render();
    }

    /** Update game state */
    _update(dt, now) {
        // Update player input
        if (this.player && this.player.alive) {
            const angle = this.input.getAngle();
            this.player.setTarget(angle);
            this.player.setBoost(this.input.boosting);

            // Boost sound
            if (this.player.boosting && now - this.lastBoostSound > 300) {
                this.lastBoostSound = now;
                this.audio.playBoost();
            }
        }

        // Update AI
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
                    this.world.addBoostPellet(pellet.x, pellet.y, snake.getColorAt(snake.segments.length - 1));
                    if (snake.isPlayer) {
                        this.particles.emitBoost(pellet.x, pellet.y, snake.getColorAt(0));
                    }
                }
            }
        }

        // Build collision grid
        this.collision.buildFromSnakes(this.snakes);

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

        // Check food collisions
        const eaten = this.collision.checkFoodCollisions(this.snakes, this.world.food);
        // Sort by index descending to splice safely
        eaten.sort((a, b) => b.foodIndex - a.foodIndex);
        const removedIndices = new Set();
        for (const { snake, foodIndex, food } of eaten) {
            if (removedIndices.has(foodIndex)) continue;
            removedIndices.add(foodIndex);
            snake.grow(food.value);
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
        const removedPU = new Set();
        for (const { snake, powerupIndex, powerup } of collected) {
            if (removedPU.has(powerupIndex)) continue;
            removedPU.add(powerupIndex);
            snake.applyPowerup(powerup.type.id);
            this.world.removePowerup(powerupIndex);
            this.particles.emitPowerup(powerup.x, powerup.y, powerup.type.color);

            if (snake.isPlayer) {
                this.audio.playPowerup();
                this._showPowerupNotification(powerup.type);
            }
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

        // Update camera
        if (this.player && this.player.alive) {
            this.camera.follow(this.player.x, this.player.y, this.player.mass);
        }

        // Update particles
        this.particles.update(dt);
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

    /** Handle player death */
    _onPlayerDeath() {
        const gameTime = (performance.now() - this.gameStartTime) / 1000;
        const mass = this.player.mass;
        const kills = this.player.kills;

        // Capture previous high score BEFORE saving
        const previousHighScore = this.saveData.stats.highScore;

        // Calculate coins
        const coins = Storage.calculateCoins(mass, kills, this.saveData.upgrades.coinBonus);

        // Update save data
        this.saveData = Storage.update(data => {
            data.coins += coins;
            data.stats.gamesPlayed++;
            data.stats.totalKills += kills;
            data.stats.totalMassEaten += mass;
            data.stats.totalTimePlayed += gameTime;
            if (mass > data.stats.highScore) data.stats.highScore = mass;
            if (mass > data.stats.longestSnake) data.stats.longestSnake = mass;
            if (kills > data.stats.bestKillStreak) data.stats.bestKillStreak = kills;
        });

        // Show death screen after brief delay
        const isNewHighScore = mass > previousHighScore;
        setTimeout(() => {
            this.state = 'dead';
            this._showDeathScreen(mass, kills, coins, gameTime, isNewHighScore);
        }, 1500);
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
    }

    _showPowerupNotification(type) {
        const notif = document.getElementById('powerup-notification');
        if (!notif) return;
        notif.innerHTML = `<span style="color:${type.color}">${type.icon} ${type.name}</span><br><small>${type.desc}</small>`;
        notif.classList.add('show');
        setTimeout(() => notif.classList.remove('show'), 2000);
    }

    _formatTime(seconds) {
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
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
                </div>
                <button class="upgrade-buy-btn" data-key="${item.key}"
                    ${item.maxed || !item.canAfford ? 'disabled' : ''}>
                    ${item.maxed ? 'MAX' : `${item.cost} coins`}
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
});

// Register service worker
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
}
