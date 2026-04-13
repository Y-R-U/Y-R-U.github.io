/* game.js - Game loop (RAF-based), state machine, level lifecycle */
'use strict';

const Game = (() => {
    // States: 'idle', 'playing', 'celebrating', 'levelComplete', 'levelFailed'
    let state = 'idle';
    let currentLevel = 0;
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

    function startLevel(index) {
        const data = LevelManager.getLevelData(index);
        if (!data) return;

        currentLevel = index;
        state = 'playing';
        timeRemaining = data.timeLimit;
        timeUsed = 0;
        levelStartDelay = 1.0;

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

        // Copy obstacles
        obstacles = data.obstacles.map(o => ({ ...o }));

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

        // Setup input
        Input.enable();
        Input.setCallbacks(
            (pos) => Drawing.startStroke(pos),
            (pos) => Drawing.addPoint(pos),
            () => Drawing.endStroke()
        );

        // Show HUD
        UI.hideAllScreens();
        UI.showHUD(true);

        // Start music
        GameAudio.playMusic();

        lastTime = performance.now() / 1000;
    }

    function stopLevel() {
        state = 'idle';
        Input.disable();
        UI.showHUD(false);
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
        UI.updateHUD(currentLevel + 1, goalText, timeRemaining, Drawing.getInkFraction());

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

        // Update systems
        Drawing.update(dt, now);
        Particles.update(dt);

        // Update ants
        const dpr = Renderer.getDpr();
        const area = Renderer.getPlayArea();
        const lines = Drawing.getLines();

        for (const ant of ants) {
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
            if (LevelManager.isAllComplete() && currentLevel === LEVELS.length - 1) {
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

        // Draw ants
        for (const ant of ants) {
            AntSystem.drawAnt(ctx, ant, dpr);
        }

        // Draw particles
        Particles.draw(ctx);

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

    function onLevelComplete() {
        state = 'celebrating';
        Input.disable();
        celebrationStars = LevelManager.completeLevel(currentLevel, timeUsed);
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

    return { startLevel, stopLevel, startLoop, getCurrentLevel, getState, render };
})();
