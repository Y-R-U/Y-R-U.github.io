/* ===== BOUNCE MERGE ROGUELITE — GAME (State Machine + Main Loop) ===== */
(function(BM) {
    'use strict';
    var CFG = BM.CFG;
    var Engine = BM.Engine;
    var Renderer = BM.Renderer;
    var UI = BM.UI;
    var Audio = BM.Audio;

    // ===== GAME STATE =====
    var STATE = {
        MENU: 0, PLAYING_AIM: 1, PLAYING_FLIGHT: 2,
        WAVE_ADVANCE: 3, GAME_OVER: 4, SHOP: 5, PAUSED: 6
    };
    var state = STATE.MENU;
    var save = null;

    // Run state
    var score = 0;
    var wave = 0;
    var bestMerge = 2;
    var balls = [];       // all balls on field (settled + active)
    var blocks = [];      // all blocks
    var blockRows = [];   // row tracking for advancement
    var currentBallValue = 2;
    var nextBallValue = 2;
    var shotsRemaining = 1;
    var activeBalls = 0;  // count of balls still in flight

    // Layout
    var fieldTop = 0;
    var fieldH = 0;
    var fieldW = 0;
    var dangerY = 0;
    var launcherX = 0;
    var launcherY = 0;
    var blockW = 0;
    var blockH = 0;
    var rowHeight = 0;
    var topRowY = 0;

    // Aiming
    var isAiming = false;
    var aimStartX = 0, aimStartY = 0;
    var aimAngle = -Math.PI / 2; // straight up
    var aimPoints = [];

    // Timing
    var lastTime = 0;
    var advanceTimer = 0;
    var gameOverTriggered = false;
    var pendingBalls = 0; // balls queued via setTimeout but not yet spawned

    // ===== LAYOUT =====
    function calcLayout() {
        var size = Renderer.getSize();
        fieldW = size.w;
        fieldTop = 60; // below HUD
        launcherY = size.h * CFG.LAUNCHER_Y_RATIO;
        dangerY = size.h * CFG.DANGER_LINE_Y_RATIO;
        fieldH = launcherY - fieldTop;
        launcherX = fieldW / 2;

        // Block grid sizing
        blockW = (fieldW - (CFG.BLOCK_COLS + 1) * CFG.BLOCK_PADDING) / CFG.BLOCK_COLS;
        blockH = blockW * 0.6;
        rowHeight = blockH + CFG.BLOCK_PADDING;
        topRowY = fieldTop + CFG.BLOCK_PADDING;
    }

    function layoutBlocks() {
        for (var i = 0; i < blocks.length; i++) {
            var b = blocks[i];
            var span = b.colSpan || 1;
            b.w = blockW * span + CFG.BLOCK_PADDING * (span - 1);
            b.h = blockH;
            b.x = CFG.BLOCK_PADDING + b.col * (blockW + CFG.BLOCK_PADDING);
            b.y = topRowY + b.row * rowHeight;
        }
    }

    // ===== GENERATE BALL VALUE =====
    function getStartBallValue() {
        return BM.getUpgradeValue(save, 'startValue') || 2;
    }

    function rollNextBallValue() {
        var base = getStartBallValue();
        // Small chance of getting a higher value
        if (Math.random() < 0.15 && wave > 3) return base * 2;
        return base;
    }

    // ===== NEW RUN =====
    function startRun() {
        state = STATE.PLAYING_AIM;
        score = 0;
        wave = 0;
        bestMerge = 2;
        balls = [];
        blocks = [];
        blockRows = [];
        gameOverTriggered = false;
        pendingBalls = 0;
        Engine.clearParticles();

        calcLayout();

        currentBallValue = getStartBallValue();
        nextBallValue = rollNextBallValue();
        shotsRemaining = BM.getUpgradeValue(save, 'multishot') || 1;

        UI.showScreen(''); // hide all screens
        UI.showHud(true);
        UI.updateScore(0);
        UI.updateNextBall(nextBallValue);

        // Start first wave
        advanceWave();
    }

    // ===== WAVE ADVANCE =====
    function advanceWave() {
        wave++;
        UI.updateWave(wave);

        // Push existing blocks down one row
        for (var i = 0; i < blocks.length; i++) {
            blocks[i].row++;
        }

        // Check boss wave
        var isBoss = (wave % CFG.BOSS_EVERY === 0);
        if (isBoss) {
            UI.showBossWarning();
            var bossRow = Engine.generateBossRow(wave, CFG.BLOCK_COLS);
            for (var b = 0; b < bossRow.length; b++) blocks.push(bossRow[b]);
        } else {
            var newRow = Engine.generateWaveRow(wave, CFG.BLOCK_COLS);
            for (var n = 0; n < newRow.length; n++) blocks.push(newRow[n]);
        }

        layoutBlocks();

        // Show wave banner
        if (wave > 1) {
            UI.showWaveBanner(isBoss ? '⚠ BOSS WAVE ' + wave : 'WAVE ' + wave);
            if (!isBoss) Audio.play('waveComplete');
        }

        // Check game over condition
        checkGameOver();
    }

    function checkGameOver() {
        if (gameOverTriggered) return;
        for (var i = 0; i < blocks.length; i++) {
            if (!blocks[i].dead && blocks[i].y + blocks[i].h > dangerY) {
                triggerGameOver();
                return;
            }
        }
    }

    function triggerGameOver() {
        if (gameOverTriggered) return;
        gameOverTriggered = true;
        state = STATE.GAME_OVER;
        Audio.play('gameOver');
        Renderer.triggerShake(8, 0.5);

        // Calculate crystals earned
        var mult = BM.getUpgradeValue(save, 'scoreMult') || 1;
        var crystals = Math.floor((wave * CFG.CRYSTAL_BASE + score / 100) * mult);
        crystals = Math.max(1, crystals);

        save.crystals += crystals;
        save.totalRuns = (save.totalRuns || 0) + 1;
        if (wave > (save.bestWave || 0)) save.bestWave = wave;
        if (score > (save.bestScore || 0)) save.bestScore = score;
        BM.saveSave(save);

        setTimeout(function() {
            UI.showGameOver(score, wave, bestMerge, crystals);
            UI.updateCrystals(save);
        }, 800);
    }

    // ===== SHOOTING =====
    function shootBall(angle) {
        var speed = CFG.BALL_BASE_SPEED * (BM.getUpgradeValue(save, 'ballSpeed') || 1);
        var vx = Math.cos(angle) * speed;
        var vy = Math.sin(angle) * speed;
        var ball = new Engine.Ball(launcherX, launcherY, currentBallValue, vx, vy);
        ball.maxBounces = CFG.BALL_MAX_BOUNCES + (BM.getUpgradeValue(save, 'durability') || 0);
        balls.push(ball);
        activeBalls++;
        Audio.play('shoot');
    }

    function fireShot() {
        var multishot = BM.getUpgradeValue(save, 'multishot') || 1;
        var baseAngle = aimAngle;
        pendingBalls = 0;

        for (var i = 0; i < multishot; i++) {
            var spread = multishot > 1 ? (i - (multishot - 1) / 2) * 0.12 : 0;
            var angle = baseAngle + spread;
            if (i === 0) {
                // Fire first ball synchronously
                shootBall(angle);
            } else {
                // Stagger remaining balls
                pendingBalls++;
                (function(a, delay) {
                    setTimeout(function() { pendingBalls--; shootBall(a); }, delay);
                })(angle, i * 150);
            }
        }

        state = STATE.PLAYING_FLIGHT;

        // Prep next ball
        currentBallValue = nextBallValue;
        nextBallValue = rollNextBallValue();
        UI.updateNextBall(nextBallValue);
    }

    // ===== INPUT =====
    var touchId = null;

    function onPointerDown(px, py, id) {
        if (state !== STATE.PLAYING_AIM) return;
        // Only start aiming if touch is in bottom 45% of screen
        var size = Renderer.getSize();
        if (py < size.h * 0.55) return;
        isAiming = true;
        touchId = id;
        aimStartX = px;
        aimStartY = py;
        updateAim(px, py);
    }

    function onPointerMove(px, py, id) {
        if (!isAiming || id !== touchId) return;
        updateAim(px, py);
    }

    function onPointerUp(px, py, id) {
        if (!isAiming || id !== touchId) return;
        isAiming = false;
        touchId = null;
        aimPoints = [];
        // Only fire if aim is upward
        if (aimAngle < -0.15 && aimAngle > -Math.PI + 0.15) {
            fireShot();
        }
    }

    function updateAim(px, py) {
        var dx = px - launcherX;
        var dy = py - launcherY;
        // Invert - we aim in the opposite direction of drag
        aimAngle = Math.atan2(-dy, -dx);
        // Clamp to upward range
        if (aimAngle > -0.15) aimAngle = -0.15;
        if (aimAngle < -Math.PI + 0.15) aimAngle = -Math.PI + 0.15;

        // Generate trajectory preview
        var speed = CFG.BALL_BASE_SPEED * (BM.getUpgradeValue(save, 'ballSpeed') || 1);
        var vx = Math.cos(aimAngle) * speed;
        var vy = Math.sin(aimAngle) * speed;
        aimPoints = Engine.simulateTrajectory(launcherX, launcherY, vx, vy, fieldW, fieldTop, fieldTop + fieldH, blocks, 400);
    }

    function setupInput() {
        var c = document.getElementById('gameCanvas');
        // Touch
        c.addEventListener('touchstart', function(e) {
            e.preventDefault();
            Audio.tryResumeContext();
            var t = e.changedTouches[0];
            onPointerDown(t.clientX, t.clientY, t.identifier);
        }, { passive: false });
        c.addEventListener('touchmove', function(e) {
            e.preventDefault();
            var t = e.changedTouches[0];
            onPointerMove(t.clientX, t.clientY, t.identifier);
        }, { passive: false });
        c.addEventListener('touchend', function(e) {
            e.preventDefault();
            var t = e.changedTouches[0];
            onPointerUp(t.clientX, t.clientY, t.identifier);
        }, { passive: false });
        // Mouse fallback
        var mouseDown = false;
        c.addEventListener('mousedown', function(e) {
            mouseDown = true;
            Audio.tryResumeContext();
            onPointerDown(e.clientX, e.clientY, 'mouse');
        });
        c.addEventListener('mousemove', function(e) {
            if (mouseDown) onPointerMove(e.clientX, e.clientY, 'mouse');
        });
        c.addEventListener('mouseup', function(e) {
            mouseDown = false;
            onPointerUp(e.clientX, e.clientY, 'mouse');
        });
    }

    // ===== UPDATE =====
    function update(dt) {
        if (state !== STATE.PLAYING_AIM && state !== STATE.PLAYING_FLIGHT) {
            Engine.updateParticles(dt);
            return;
        }

        var critChance = BM.getUpgradeValue(save, 'critChance') || 0;
        var mergeBonus = BM.getUpgradeValue(save, 'mergeBonus') || 0;
        var scoreMult = BM.getUpgradeValue(save, 'scoreMult') || 1;

        // Update balls
        activeBalls = 0;
        for (var i = 0; i < balls.length; i++) {
            var ball = balls[i];
            if (ball.dead) continue;

            // Flash timer
            if (ball.flashTimer > 0) ball.flashTimer -= dt;

            if (!ball.active) continue;
            activeBalls++;

            // Move
            ball.x += ball.vx * dt;
            ball.y += ball.vy * dt;

            // Damping
            ball.vx *= CFG.BALL_DAMPING;
            ball.vy *= CFG.BALL_DAMPING;

            // Wall collision
            if (Engine.resolveWalls(ball, fieldW, fieldTop, fieldTop + fieldH)) {
                ball.bounces++;
                if (ball.active) Audio.play('bounce');
            }

            // Block collision
            for (var b = blocks.length - 1; b >= 0; b--) {
                var block = blocks[b];
                if (block.dead) continue;
                var result = Engine.resolveBallBlock(ball, block, critChance);
                if (result) {
                    ball.bounces++;
                    if (block.dead) {
                        // Score for destroying block
                        var pts = block.maxHp * 10 * scoreMult;
                        if (block.isBoss) pts *= 3;
                        score += pts;
                        UI.updateScore(score);
                    }
                }
            }

            // Merge with settled balls
            for (var s = 0; s < balls.length; s++) {
                if (s === i || balls[s].dead) continue;
                if (!balls[s].settled) continue;
                var mergeResult = Engine.resolveBallBall(ball, balls[s], mergeBonus);
                if (mergeResult) {
                    ball.bounces++;
                    // mergeResult is the new value
                    if (mergeResult > bestMerge) bestMerge = mergeResult;
                    score += mergeResult * scoreMult;
                    UI.updateScore(score);

                    // Chain merge check: the settled ball now has a new value
                    // Check if it can merge with any adjacent settled ball
                    checkChainMerge(balls[s], mergeBonus, scoreMult);
                }
            }

            // Check if ball should settle (too many bounces or too slow)
            if (ball.bounces >= ball.maxBounces || ball.speed() < CFG.BALL_MIN_SPEED) {
                ball.settle();
            }
        }

        // Clean up dead balls
        for (var d = balls.length - 1; d >= 0; d--) {
            if (balls[d].dead) balls.splice(d, 1);
        }
        // Clean up dead blocks
        for (var dd = blocks.length - 1; dd >= 0; dd--) {
            if (blocks[dd].dead) blocks.splice(dd, 1);
        }

        // Update block flash timers
        for (var bf = 0; bf < blocks.length; bf++) {
            if (blocks[bf].flashTimer > 0) blocks[bf].flashTimer -= dt;
        }

        // Update particles
        Engine.updateParticles(dt);

        // Check if all balls settled and none pending (flight done)
        if (state === STATE.PLAYING_FLIGHT && activeBalls === 0 && pendingBalls === 0) {
            onFlightComplete();
        }
    }

    function checkChainMerge(ball, mergeBonus, scoreMult) {
        if (!ball.settled || ball.dead) return;
        for (var i = 0; i < balls.length; i++) {
            var other = balls[i];
            if (other === ball || other.dead || !other.settled) continue;
            if (other.value !== ball.value) continue;
            var dx = other.x - ball.x;
            var dy = other.y - ball.y;
            var dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < (ball.radius + other.radius) * 1.5) {
                // Chain merge
                var superMerge = Math.random() < mergeBonus;
                var newVal = ball.value * 2;
                if (superMerge) newVal *= 2;
                ball.value = newVal;
                ball.flashTimer = 0.2;
                other.dead = true;

                var color = BM.getBallColor(newVal).bg;
                Engine.spawnParticles(ball.x, ball.y, color, CFG.PARTICLES_PER_MERGE);
                Engine.spawnFloatingText(ball.x, ball.y - ball.radius - 5,
                    'CHAIN ' + newVal + '!', '#ffd700');
                Audio.play('merge');

                if (newVal > bestMerge) bestMerge = newVal;
                score += newVal * scoreMult;
                UI.updateScore(score);

                // Recurse for more chains
                checkChainMerge(ball, mergeBonus, scoreMult);
                return;
            }
        }
    }

    function onFlightComplete() {
        // Check if all blocks destroyed this wave
        var blocksLeft = false;
        for (var i = 0; i < blocks.length; i++) {
            if (!blocks[i].dead) { blocksLeft = true; break; }
        }

        // Advance to next wave
        state = STATE.WAVE_ADVANCE;
        setTimeout(function() {
            advanceWave();
            state = STATE.PLAYING_AIM;
        }, 400);
    }

    // ===== RENDER =====
    function render(time) {
        var dt = Math.min((time - lastTime) / 1000, 0.05);
        lastTime = time;

        update(dt);

        Renderer.clear();
        Renderer.resetTransform();
        Renderer.applyShake(dt);

        if (state >= STATE.PLAYING_AIM && state <= STATE.WAVE_ADVANCE) {
            // Draw danger line
            Renderer.drawDangerLine(dangerY);

            // Draw blocks
            for (var b = 0; b < blocks.length; b++) {
                Renderer.drawBlock(blocks[b]);
            }

            // Draw settled balls
            for (var s = 0; s < balls.length; s++) {
                if (balls[s].settled && !balls[s].dead) Renderer.drawBall(balls[s], time);
            }

            // Draw active balls
            for (var a = 0; a < balls.length; a++) {
                if (balls[a].active && !balls[a].dead) Renderer.drawBall(balls[a], time);
            }

            // Draw particles & floating text
            Renderer.drawParticles();
            Renderer.drawFloatingTexts();

            // Draw aim line
            if (state === STATE.PLAYING_AIM && isAiming) {
                Renderer.drawAimLine(aimPoints);
            }

            // Draw launcher
            if (state === STATE.PLAYING_AIM) {
                Renderer.drawLauncher(launcherX, launcherY, currentBallValue);
            }
        }

        Renderer.resetTransform();
        requestAnimationFrame(render);
    }

    // ===== BUTTON HANDLERS =====
    function setupButtons() {
        // Play
        document.getElementById('playBtn').addEventListener('click', function() {
            Audio.tryResumeContext();
            Audio.play('click');
            startRun();
        });

        // Shop from title
        document.getElementById('shopBtnTitle').addEventListener('click', function() {
            Audio.play('click');
            openShop('titleScreen');
        });

        // Shop from game over
        document.getElementById('shopBtnGO').addEventListener('click', function() {
            Audio.play('click');
            openShop('gameOverScreen');
        });

        // Retry
        document.getElementById('retryBtn').addEventListener('click', function() {
            Audio.play('click');
            startRun();
        });

        // Menu
        document.getElementById('menuBtn').addEventListener('click', function() {
            Audio.play('click');
            state = STATE.MENU;
            UI.showScreen('titleScreen');
            UI.showHud(false);
        });

        // Shop back
        var shopBackTarget = 'titleScreen';
        document.getElementById('shopBackBtn').addEventListener('click', function() {
            Audio.play('click');
            UI.showScreen(shopBackTarget);
        });

        // Start run from shop
        document.getElementById('startRunBtn').addEventListener('click', function() {
            Audio.play('click');
            startRun();
        });

        function openShop(returnTo) {
            shopBackTarget = returnTo;
            UI.renderShop(save, function() { /* onBuy callback */ });
            UI.updateCrystals(save);
            UI.showScreen('shopScreen');
        }
    }

    // ===== INIT =====
    function init() {
        save = BM.loadSave();
        Renderer.init(document.getElementById('gameCanvas'));
        Audio.init(save.settings || {});
        UI.setupSettings(save);
        UI.setupConfirmButtons();
        UI.updateCrystals(save);
        setupInput();
        setupButtons();
        calcLayout();

        // Handle resize
        window.addEventListener('resize', function() {
            calcLayout();
            if (state >= STATE.PLAYING_AIM && state <= STATE.WAVE_ADVANCE) {
                layoutBlocks();
            }
        });

        // Start render loop
        lastTime = performance.now();
        requestAnimationFrame(render);
    }

    // ===== REGISTER SERVICE WORKER =====
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(function() {});
    }

    // Boot
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})(window.BM);
