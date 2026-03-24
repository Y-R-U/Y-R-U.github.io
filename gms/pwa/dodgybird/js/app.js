// ── Flappy Strike: Evasive Run & Gun ── Main App ──
const App = (() => {
    let canvas, ctx;
    let state = 'menu'; // menu, playing, paused, gameover
    let score = 0;
    let runCoins = 0;
    let totalCoins = 0;
    let speedMult = 1;
    let reviveCount = 0;
    let lastTime = 0;
    let animFrameId = null;

    function init() {
        canvas = document.getElementById('gameCanvas');
        Shop.load();

        const data = Shop.getData();
        Audio.init();
        Audio.setMusicEnabled(data.musicEnabled);
        Audio.setSfxEnabled(data.sfxEnabled);

        if (data.colorblindMode) document.body.classList.add('colorblind');

        Renderer.init(canvas);
        Input.init(canvas);
        UI.init();

        // Button handlers
        document.getElementById('btn-start').addEventListener('click', onStart);
        document.getElementById('start-screen').addEventListener('click', (e) => {
            if (e.target.id === 'btn-start' || e.target.id === 'btn-shop-start') return;
        });
        document.getElementById('btn-shop-start').addEventListener('click', () => {
            Audio.playSfx('click');
            UI.showShop();
        });
        document.getElementById('btn-restart').addEventListener('click', onRestart);
        document.getElementById('btn-menu').addEventListener('click', onMenu);
        document.getElementById('btn-revive').addEventListener('click', onRevive);
        document.getElementById('btn-shop-go').addEventListener('click', () => {
            Audio.playSfx('click');
            UI.showShop();
        });
        document.getElementById('btn-pause').addEventListener('click', () => {
            Audio.playSfx('click');
            if (state === 'playing') pause();
            else if (state === 'paused') resume();
        });
        document.getElementById('btn-resume').addEventListener('click', () => {
            Audio.playSfx('click');
            resume();
        });
        document.getElementById('btn-pause-menu').addEventListener('click', () => {
            Audio.playSfx('click');
            onMenu();
        });

        window.addEventListener('resize', () => {
            Renderer.resize();
            Input.updateRect();
        });

        UI.showStartScreen();
        // Start render loop for background even in menu
        lastTime = performance.now();
        loop(lastTime);
    }

    function onStart() {
        Audio.resume();
        Audio.playSfx('click');
        const data = Shop.getData();
        if (!data.tutorialSeen) {
            UI.showTutorial(() => {
                Shop.markTutorialSeen();
                startGame();
            });
        } else {
            startGame();
        }
    }

    function startGame() {
        UI.hideStartScreen();
        UI.hideGameOver();
        UI.hidePause();
        UI.showHUD();

        score = 0;
        runCoins = 0;
        speedMult = 1;
        reviveCount = 0;

        const upgrades = Shop.getUpgradeState();
        Player.reset(upgrades);
        Obstacles.reset();
        Enemies.reset();
        Powerups.reset();
        Particles.clear();

        state = 'playing';
        Audio.playMusic();
    }

    function pause() {
        if (state !== 'playing') return;
        state = 'paused';
        UI.showPause();
    }

    function resume() {
        if (state !== 'paused') return;
        state = 'playing';
        UI.hidePause();
        UI.closePopup();
        lastTime = performance.now();
    }

    function gameOver() {
        state = 'gameover';
        Audio.playSfx('die');

        const isNewBest = Shop.setHighScore(score);
        Shop.addCoins(runCoins);
        Shop.incrementGames();
        totalCoins = Shop.getData().coins;

        Particles.explosion(Player.x, Player.y, '#ff4444');
        Particles.explosion(Player.x, Player.y, '#ffaa00');

        // Slight delay before showing game over screen
        setTimeout(() => {
            UI.showGameOver(score, Shop.getData().highScore, isNewBest, totalCoins, runCoins, reviveCount);
        }, 800);
    }

    function onRestart() {
        Audio.playSfx('click');
        startGame();
    }

    function onMenu() {
        state = 'menu';
        UI.hidePause();
        UI.hideGameOver();
        UI.closePopup();
        UI.showStartScreen();
        Audio.stopMusic();
    }

    function onRevive() {
        if (!Shop.canRevive(reviveCount)) return;
        if (Shop.payRevive(reviveCount)) {
            Audio.playSfx('pickup');
            reviveCount++;
            const upgrades = Shop.getUpgradeState();
            Player.heal(Math.ceil(Player.maxHealth / 2));
            Player.setInvulnerable(1.5);
            state = 'playing';
            UI.hideGameOver();
            UI.showHUD();
        }
    }

    function update(dt) {
        if (state !== 'playing') return;

        // Cap dt to prevent physics issues
        dt = Math.min(dt, 0.05);

        // Difficulty scaling
        speedMult = 1 + score * CONFIG.SPEED_SCALE_RATE;
        speedMult = Math.min(speedMult, CONFIG.MAX_SPEED_MULT);

        Input.update();
        const moveInput = Input.getMoveInput();

        // Handle shooting
        if (Input.consumeShoot() || Input.shootHeld) {
            Player.tryShoot();
        }

        Player.update(dt, moveInput);

        // Update world
        Obstacles.update(dt, speedMult, score);
        Enemies.update(dt, speedMult, score, Player.y);
        Powerups.update(dt, speedMult, Shop.getMagnetRange());
        Particles.update(dt);
        Renderer.updateBackground(dt, speedMult);

        // Boss warning
        const bossThreshold = Math.floor(score / CONFIG.BOSS_SCORE_INTERVAL) * CONFIG.BOSS_SCORE_INTERVAL;
        const nextBoss = bossThreshold + CONFIG.BOSS_SCORE_INTERVAL;
        if (score >= nextBoss - 2 && score < nextBoss && !Enemies.hasBoss) {
            // Warning handled by boss spawn
        }

        // ── Collisions ──
        const playerBBox = Player.getBBox();
        const upgrades = Shop.getUpgradeState();

        // Player bullets vs walls
        for (let i = Player.bullets.length - 1; i >= 0; i--) {
            const bul = Player.bullets[i];
            const result = Obstacles.checkBulletHit(bul);
            if (result === 'destroyed') {
                Player.bullets.splice(i, 1);
                score += CONFIG.WALL_DESTROY_SCORE * Player.getScoreMultiplier();
                runCoins += CONFIG.WALL_DESTROY_COIN;
                Powerups.spawnFromWall(bul.x, bul.y);
            } else if (result === 'hit') {
                Player.bullets.splice(i, 1);
            }
        }

        // Player bullets vs enemies
        const killResults = Enemies.checkPlayerBulletHits(Player.bullets);
        for (const kr of killResults) {
            if (kr.type === 'drone_kill') {
                score += CONFIG.DRONE_KILL_SCORE * Player.getScoreMultiplier();
                runCoins += CONFIG.ENEMY_COIN_DROP;
                Powerups.spawnFromEnemy(kr.x, kr.y, CONFIG.ENEMY_COIN_DROP);
            } else if (kr.type === 'boss_kill') {
                score += CONFIG.BOSS_KILL_SCORE * Player.getScoreMultiplier();
                runCoins += CONFIG.BOSS_COIN_DROP;
                Powerups.spawnFromEnemy(kr.x, kr.y, CONFIG.BOSS_COIN_DROP);
                UI.showBossWarning(); // Reuse for "BOSS DEFEATED"
            }
        }

        // Player vs obstacles
        const hitWall = Obstacles.checkPlayerCollision(playerBBox);
        if (hitWall) {
            if (hitWall.destructible) {
                // Destroy the wall on contact but take damage
                hitWall.hp = 0;
                Particles.wallBreak(hitWall.x + hitWall.w / 2, hitWall.y + hitWall.h / 2);
                Audio.playSfx('wallbreak');
                const idx = Obstacles.walls.indexOf(hitWall);
                if (idx !== -1) Obstacles.walls.splice(idx, 1);
            }
            const dead = Player.takeDamage(1);
            if (dead) { gameOver(); return; }
        }

        // Enemy bullets vs player
        if (Enemies.checkEnemyBulletHit(playerBBox)) {
            const dead = Player.takeDamage(1);
            if (dead) { gameOver(); return; }
        }

        // Player passing obstacles (score)
        const passScore = Obstacles.checkPassed(Player.x);
        if (passScore > 0) {
            score += passScore * Player.getScoreMultiplier();
        }

        // Power-up & coin collection
        const collected = Powerups.checkPlayerCollision(playerBBox, upgrades);
        if (collected.powerup) {
            Player.activatePowerup(collected.powerup, upgrades);
        }
        if (collected.coins > 0) {
            runCoins += collected.coins;
        }

        // Update HUD
        UI.updateHUD(score, Shop.getData().coins + runCoins, Player.health, Player.maxHealth,
            Player.getFireCooldownRatio(), {
                shield: Player.shieldActive,
                rapidFire: Player.rapidFire,
                multiplier: Player.multiplierActive,
            });
    }

    function draw() {
        const ctx = Renderer.getCtx();
        Renderer.beginFrame();
        Renderer.drawBackground();

        if (state === 'playing' || state === 'paused' || state === 'gameover') {
            Obstacles.draw(ctx);
            Powerups.draw(ctx);
            Enemies.draw(ctx);
            Player.drawBullets(ctx);
            if (state !== 'gameover' || Player.health > 0) {
                Player.draw(ctx);
            }
            Particles.draw(ctx);
        }

        Renderer.endFrame();
    }

    function loop(timestamp) {
        const dt = (timestamp - lastTime) / 1000;
        lastTime = timestamp;

        if (state === 'playing') {
            update(dt);
        } else if (state === 'menu') {
            Renderer.updateBackground(dt, 0.5);
        }

        draw();
        animFrameId = requestAnimationFrame(loop);
    }

    function getState() { return state; }

    return { init, pause, resume, getState };
})();

// ── Boot ──
document.addEventListener('DOMContentLoaded', App.init);
