/* game.js - Game loop (RAF-based), state machine, level lifecycle,
   power-up activation, moving obstacles, daily-challenge mode */
'use strict';

const Game = (() => {
    // States: 'idle', 'playing', 'celebrating', 'levelComplete', 'levelFailed'
    let state = 'idle';
    let currentLevel = 0;
    let currentData = null;
    let challengeMode = false;
    let ants = [];
    let goals = [];
    let obstacles = [];
    let timeRemaining = 0;
    let timeUsed = 0;
    let lastTime = 0;
    let rafId = null;
    let levelStartDelay = 0;
    let celebrationTimer = 0;
    let celebrationStars = 0;

    // Power-up runtime state (reset each level)
    let magnet = null;       // { x, y, timeLeft }
    let freezeTimer = 0;
    let pencilBoosted = false;
    let placingMagnet = false;

    function startLevel(index) {
        const data = LevelManager.getLevelData(index);
        if (!data) return;
        currentLevel = index;
        challengeMode = false;
        beginLevel(data);
    }

    // Daily challenge: plays supplied level data instead of a LEVELS index
    function startChallenge(data) {
        challengeMode = true;
        beginLevel(data);
    }

    function beginLevel(data) {
        currentData = data;
        state = 'playing';
        timeRemaining = data.timeLimit;
        timeUsed = 0;
        levelStartDelay = 1.0;

        // Reset power-up state
        magnet = null;
        freezeTimer = 0;
        pencilBoosted = false;
        placingMagnet = false;

        const dpr = Renderer.getDpr();

        // Create ants
        ants = data.ants.map(def => {
            const ant = AntSystem.createAnt(def, dpr);
            ant.targetSpeed = data.antSpeed * dpr;
            ant.baseSpeed = data.antSpeed * dpr;
            return ant;
        });

        // Create goals (deep copy)
        goals = data.goals.map(g => ({ ...g, collected: false }));

        // Copy obstacles; remember base position for moving ones
        obstacles = data.obstacles.map(o => ({ ...o, baseX: o.x, baseY: o.y }));

        // Ensure no ant starts pointing directly at a goal.
        // If the angle to any goal is within 30°, rotate the ant away.
        for (const ant of ants) {
            for (const goal of goals) {
                const gp = Renderer.toCanvas(goal.x, goal.y);
                const angleToGoal = Math.atan2(gp.y - ant.cy, gp.x - ant.cx);
                let diff = angleToGoal - ant.angle;
                // Normalize to -PI..PI
                diff = Math.atan2(Math.sin(diff), Math.cos(diff));
                if (Math.abs(diff) < Math.PI / 6) { // within ±30°
                    // Rotate ant 90° away from the goal
                    ant.angle += (Math.PI / 2) + (Math.random() - 0.5) * 0.5;
                }
            }
        }

        // Init systems
        Drawing.init();
        Drawing.setDpr(dpr);
        Particles.init();

        // Setup input — routed through handleInputStart so a pending magnet
        // placement can claim the tap instead of starting a pencil stroke
        Input.enable();
        Input.setCallbacks(
            (pos) => handleInputStart(pos),
            (pos) => Drawing.addPoint(pos),
            () => Drawing.endStroke()
        );

        // Show HUD + power-up bar
        UI.hideAllScreens();
        UI.showHUD(true);
        UI.resetPowerupActive();
        UI.updatePowerupBar();

        // Start music
        GameAudio.playMusic();

        lastTime = performance.now() / 1000;
    }

    function stopLevel() {
        state = 'idle';
        challengeMode = false;
        Input.disable();
        UI.showHUD(false);
    }

    function handleInputStart(pos) {
        if (placingMagnet) {
            placeMagnet(pos);
            return;
        }
        Drawing.startStroke(pos);
    }

    // === Power-ups ===

    function activatePowerUp(type) {
        if (state !== 'playing') return;

        if (type === 'magnet') {
            // Toggle placement mode (second tap on the button cancels)
            if (placingMagnet) {
                placingMagnet = false;
                UI.setPowerupActive('magnet', !!magnet);
                return;
            }
            if (PowerUps.getCount('magnet') <= 0) return;
            placingMagnet = true;
            UI.setPowerupActive('magnet', true);
            GameAudio.SFX.buttonClick();
            return;
        }

        if (type === 'pencil') {
            if (pencilBoosted || !PowerUps.use('pencil')) return;
            pencilBoosted = true;
            Drawing.setBoost(CONFIG.PENCIL_BOOST_WIDTH, CONFIG.PENCIL_BOOST_FADE);
            UI.setPowerupActive('pencil', true);
        } else if (type === 'freeze') {
            if (freezeTimer > 0 || !PowerUps.use('freeze')) return;
            freezeTimer = CONFIG.FREEZE_DURATION;
            UI.setPowerupActive('freeze', true);
        } else if (type === 'ink') {
            if (!PowerUps.use('ink')) return;
            Drawing.refillInk();
        } else if (type === 'time') {
            if (!PowerUps.use('time')) return;
            timeRemaining += CONFIG.EXTRA_TIME_BONUS;
        } else {
            return;
        }

        GameAudio.SFX.powerUp();
        GameAudio.vibrate(20);
        UI.updatePowerupBar();
    }

    function placeMagnet(pos) {
        if (!PowerUps.use('magnet')) {
            placingMagnet = false;
            UI.setPowerupActive('magnet', false);
            return;
        }
        const area = Renderer.getPlayArea();
        magnet = {
            x: Math.max(area.x, Math.min(area.x + area.w, pos.x)),
            y: Math.max(area.y, Math.min(area.y + area.h, pos.y)),
            timeLeft: CONFIG.MAGNET_DURATION,
        };
        placingMagnet = false;
        GameAudio.SFX.powerUp();
        GameAudio.vibrate(20);
        UI.setPowerupActive('magnet', true);
        UI.updatePowerupBar();
    }

    // === RAF-based game loop ===
    function tick(timestamp) {
        rafId = requestAnimationFrame(tick);

        const now = timestamp / 1000;
        let dt = now - lastTime;
        lastTime = now;
        if (dt > 0.1) dt = 0.016; // cap delta for tab-away

        // Pause while settings or quit confirm is open
        if (UI.isSettingsOpen() || UI.isQuitOpen()) {
            // Still render the current frame so canvas isn't blank behind popup
            render(now);
            return;
        }

        if (state === 'playing') {
            tickPlaying(dt, now);
        } else if (state === 'celebrating') {
            tickCelebration(dt, now);
        }
        // idle / levelComplete / levelFailed: no update needed, canvas stays as-is
    }

    function tickPlaying(dt, now) {
        // Update HUD
        const collectedCount = goals.filter(g => g.collected).length;
        const goalText = `${collectedCount} / ${goals.length}`;
        const label = challengeMode ? 'Daily ⚡' : 'Level ' + (currentLevel + 1);
        UI.updateHUD(label, goalText, timeRemaining, Drawing.getInkFraction());

        // Start delay countdown
        if (levelStartDelay > 0) {
            levelStartDelay -= dt;
            render(now);
            return;
        }

        // Timer
        timeRemaining -= dt;
        timeUsed += dt;

        if (timeRemaining <= 0) {
            timeRemaining = 0;
            onLevelFailed();
            render(now);
            return;
        }

        // Animate moving obstacles (driven by timeUsed so they freeze on pause)
        for (const obs of obstacles) {
            if (obs.moveX || obs.moveY) {
                const t = timeUsed * Math.PI * 2 / (obs.period || 4) + (obs.phase || 0);
                if (obs.moveX) obs.x = obs.baseX + Math.sin(t) * obs.moveX;
                if (obs.moveY) obs.y = obs.baseY + Math.sin(t) * obs.moveY;
            }
        }

        // Power-up timers
        if (magnet) {
            magnet.timeLeft -= dt;
            if (magnet.timeLeft <= 0) {
                magnet = null;
                UI.setPowerupActive('magnet', placingMagnet);
            }
        }
        if (freezeTimer > 0) {
            freezeTimer -= dt;
            if (freezeTimer <= 0) {
                freezeTimer = 0;
                UI.setPowerupActive('freeze', false);
            }
        }

        // Update systems
        Drawing.update(dt, now);
        Particles.update(dt);

        // Update ants
        const dpr = Renderer.getDpr();
        const area = Renderer.getPlayArea();
        const lines = Drawing.getLines();

        for (const ant of ants) {
            // Freeze slows every ant; restore full speed when it wears off
            ant.targetSpeed = ant.baseSpeed * (freezeTimer > 0 ? CONFIG.FREEZE_FACTOR : 1);

            // Magnet steering: turn the ant toward the magnet, capped per second
            if (magnet) {
                const toMagnet = Math.atan2(magnet.y - ant.cy, magnet.x - ant.cx);
                let diff = Math.atan2(Math.sin(toMagnet - ant.angle), Math.cos(toMagnet - ant.angle));
                const maxTurn = CONFIG.MAGNET_TURN_RATE * dt;
                ant.angle += Math.max(-maxTurn, Math.min(maxTurn, diff));
                ant.wanderAngle = 0;
            }

            const result = AntSystem.updateAnt(ant, dt, area, lines, obstacles, goals, dpr);
            if (result.collected) {
                const gp = Renderer.toCanvas(result.collected.x, result.collected.y);
                Particles.spawnGoalCollect(gp.x, gp.y, result.collected.type);
                GameAudio.SFX.goalCollect();
                GameAudio.vibrate(30);
            }
        }

        // Check if all goals collected
        if (goals.every(g => g.collected)) {
            onLevelComplete();
        }

        render(now);
    }

    function tickCelebration(dt, now) {
        // Animate particles for ~1 second then show UI
        celebrationTimer -= dt;
        Particles.update(dt);
        render(now);

        if (celebrationTimer <= 0) {
            state = 'levelComplete';
            if (challengeMode) {
                const rewardItems = Rewards.completeChallenge();
                UI.showChallengeComplete(celebrationStars, timeUsed, rewardItems);
            } else if (LevelManager.isAllComplete() && currentLevel === LEVELS.length - 1) {
                UI.showGameComplete(LevelManager.getTotalStars(), LevelManager.getMaxStars());
            } else {
                UI.showLevelComplete(celebrationStars, timeUsed, currentLevel + 1);
            }
        }
    }

    function render(now) {
        const ctx = Renderer.getCtx();
        const dpr = Renderer.getDpr();

        Renderer.clear();
        Renderer.drawPaper();
        Renderer.drawObstacles(obstacles);

        // Draw goals
        for (const goal of goals) {
            if (goal.collected) {
                Renderer.drawGoalCollected(goal);
            } else {
                Renderer.drawGoal(goal, now);
            }
        }

        // Draw pencil lines
        Drawing.drawLines(ctx);

        // Draw active magnet
        if (magnet) drawMagnet(ctx, dpr, now);

        // Draw ants
        for (const ant of ants) {
            AntSystem.drawAnt(ctx, ant, dpr);
        }

        // Draw particles
        Particles.draw(ctx);

        // Freeze tint over the play area
        if (freezeTimer > 0 && state === 'playing') {
            const area = Renderer.getPlayArea();
            ctx.save();
            ctx.fillStyle = 'rgba(140, 195, 255, 0.12)';
            ctx.fillRect(area.x, area.y, area.w, area.h);
            ctx.restore();
        }

        // Magnet placement hint
        if (placingMagnet && state === 'playing') {
            const area = Renderer.getPlayArea();
            ctx.save();
            ctx.font = `bold ${22 * dpr}px 'Patrick Hand', cursive`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const msg = '\u{1F9F2} Tap the paper to place the magnet';
            const mx = area.x + area.w / 2;
            const my = area.y + 28 * dpr;
            const tw = ctx.measureText(msg).width;
            ctx.fillStyle = 'rgba(245, 240, 225, 0.92)';
            ctx.strokeStyle = 'rgba(139, 115, 85, 0.7)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.roundRect(mx - tw / 2 - 12 * dpr, my - 18 * dpr, tw + 24 * dpr, 36 * dpr, 10 * dpr);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = '#2c1810';
            ctx.fillText(msg, mx, my);
            ctx.restore();
        }

        // Start delay overlay
        if (state === 'playing' && levelStartDelay > 0) {
            const area = Renderer.getPlayArea();
            ctx.save();
            ctx.fillStyle = 'rgba(245, 240, 225, 0.5)';
            ctx.fillRect(area.x, area.y, area.w, area.h);
            ctx.font = `bold ${48 * dpr}px 'Caveat', cursive`;
            ctx.fillStyle = '#2c1810';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('Ready...', area.x + area.w / 2, area.y + area.h / 2);
            ctx.restore();
        }
    }

    function drawMagnet(ctx, dpr, now) {
        const r = 16 * dpr;
        const frac = magnet.timeLeft / CONFIG.MAGNET_DURATION;

        ctx.save();
        ctx.translate(magnet.x, magnet.y);

        // Pulsing attraction rings
        const pulse = (now * 1.2) % 1;
        for (let i = 0; i < 2; i++) {
            const p = (pulse + i * 0.5) % 1;
            const ringR = r + (1 - p) * r * 2.2;
            ctx.beginPath();
            ctx.arc(0, 0, ringR, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(200, 60, 60, ${0.35 * p})`;
            ctx.lineWidth = 2 * dpr;
            ctx.stroke();
        }

        // Backing disc
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fill();
        ctx.strokeStyle = '#c04040';
        ctx.lineWidth = 2 * dpr;
        ctx.stroke();

        // Remaining-time arc
        ctx.beginPath();
        ctx.arc(0, 0, r + 4 * dpr, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
        ctx.strokeStyle = 'rgba(192, 64, 64, 0.8)';
        ctx.lineWidth = 3 * dpr;
        ctx.stroke();

        // Magnet emoji
        ctx.font = `${r * 1.3}px serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('\u{1F9F2}', 0, 1);

        ctx.restore();
    }

    function onLevelComplete() {
        state = 'celebrating';
        Input.disable();
        if (challengeMode) {
            // Same star formula as normal levels, computed inline (no index)
            const timeFrac = (currentData.timeLimit - timeUsed) / currentData.timeLimit;
            celebrationStars = 1;
            if (timeFrac >= CONFIG.LEVEL_TIME_BONUS_2STAR) celebrationStars = 2;
            if (timeFrac >= CONFIG.LEVEL_TIME_BONUS_3STAR) celebrationStars = 3;
        } else {
            celebrationStars = LevelManager.completeLevel(currentLevel, timeUsed);
        }
        celebrationTimer = 1.0; // 1 second of particle celebration

        const size = Renderer.getSize();
        Particles.spawnLevelComplete(size.w / 2, size.h / 2);
        GameAudio.SFX.levelComplete();
        GameAudio.vibrate([30, 50, 30]);
    }

    function onLevelFailed() {
        state = 'levelFailed';
        Input.disable();
        GameAudio.SFX.levelFail();
        GameAudio.vibrate([50, 30, 50]);
        UI.showLevelFailed();
    }

    function startLoop() {
        // Cancel any existing loop to prevent duplicates
        if (rafId) cancelAnimationFrame(rafId);
        lastTime = performance.now() / 1000;
        rafId = requestAnimationFrame(tick);
    }

    function getCurrentLevel() { return currentLevel; }
    function getState() { return state; }
    function isChallenge() { return challengeMode; }

    return {
        startLevel, startChallenge, stopLevel, startLoop,
        getCurrentLevel, getState, isChallenge, render, activatePowerUp,
    };
})();
