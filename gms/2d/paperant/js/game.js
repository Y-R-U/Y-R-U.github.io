/* game.js - Game loop, state machine, level lifecycle */
'use strict';

const Game = (() => {
    // States: 'idle', 'playing', 'paused', 'levelComplete', 'levelFailed'
    let state = 'idle';
    let currentLevel = 0;
    let ants = [];
    let goals = [];
    let obstacles = [];
    let timeRemaining = 0;
    let timeUsed = 0;
    let lastTime = 0;
    let animFrameId = null;
    let levelStartDelay = 0; // brief countdown before ant moves

    function startLevel(index) {
        const data = LevelManager.getLevelData(index);
        if (!data) return;

        currentLevel = index;
        state = 'playing';
        timeRemaining = data.timeLimit;
        timeUsed = 0;
        levelStartDelay = 1.0; // 1 second delay before ants move

        const dpr = Renderer.getDpr();
        const area = Renderer.getPlayArea();

        // Create ants
        ants = data.ants.map(def => {
            const ant = AntSystem.createAnt(def, area, dpr);
            ant.targetSpeed = data.antSpeed * dpr;
            ant.baseSpeed = data.antSpeed * dpr;
            return ant;
        });

        // Create goals (deep copy)
        goals = data.goals.map(g => ({ ...g, collected: false }));

        // Copy obstacles
        obstacles = data.obstacles.map(o => ({ ...o }));

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
        Audio.playMusic();

        lastTime = performance.now() / 1000;
    }

    function stopLevel() {
        state = 'idle';
        Input.disable();
        UI.showHUD(false);
    }

    function tick() {

        const now = performance.now() / 1000;
        let dt = now - lastTime;
        lastTime = now;
        if (dt > 0.1) dt = 0.016; // cap delta

        if (state !== 'playing') return;
        if (UI.isSettingsOpen()) return; // pause while settings open

        // Update HUD always (even during delay)
        const data = LevelManager.getLevelData(currentLevel);
        const collectedCount = goals.filter(g => g.collected).length;
        const goalText = `${collectedCount} / ${goals.length}`;
        UI.updateHUD(currentLevel + 1, goalText, timeRemaining, Drawing.getInkFraction());

        // Start delay
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
            return;
        }

        // Update drawing
        Drawing.update(dt, now);

        // Update particles
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
                Audio.SFX.goalCollect();
                Audio.vibrate(30);
            }
        }

        // Check if all goals collected
        if (goals.every(g => g.collected)) {
            onLevelComplete();
            return;
        }

        render(now);
    }

    function render(now) {
        const ctx = Renderer.getCtx();
        const dpr = Renderer.getDpr();

        // Draw paper background
        Renderer.clear();
        Renderer.drawPaper();

        // Draw obstacles
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
        if (levelStartDelay > 0) {
            const area = Renderer.getPlayArea();
            ctx.save();
            ctx.fillStyle = 'rgba(245, 240, 225, 0.5)';
            ctx.fillRect(area.x, area.y, area.w, area.h);
            ctx.font = `bold ${48 * dpr}px 'Caveat', cursive`;
            ctx.fillStyle = '#2c1810';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const num = Math.ceil(levelStartDelay);
            ctx.fillText(num > 0 ? 'Ready...' : 'Go!', area.x + area.w / 2, area.y + area.h / 2);
            ctx.restore();
        }
    }

    function onLevelComplete() {
        state = 'levelComplete';
        Input.disable();

        const stars = LevelManager.completeLevel(currentLevel, timeUsed);

        // Effects
        const size = Renderer.getSize();
        Particles.spawnLevelComplete(size.w / 2, size.h / 2);
        Audio.SFX.levelComplete();
        Audio.vibrate([30, 50, 30]);

        // Keep rendering particles briefly, then show UI
        let frames = 0;
        const celebrationId = setInterval(() => {
            if (frames > 60) {
                clearInterval(celebrationId);
                if (LevelManager.isAllComplete() && currentLevel === LEVELS.length - 1) {
                    UI.showGameComplete(LevelManager.getTotalStars(), LevelManager.getMaxStars());
                } else {
                    UI.showLevelComplete(stars, timeUsed, currentLevel + 1);
                }
                return;
            }
            frames++;
            const now = performance.now() / 1000;
            Particles.update(0.016);
            render(now);
        }, 1000 / CONFIG.TARGET_FPS);
    }

    function onLevelFailed() {
        state = 'levelFailed';
        Input.disable();
        Audio.SFX.levelFail();
        Audio.vibrate([50, 30, 50]);
        UI.showLevelFailed();
    }

    function startLoop() {
        lastTime = performance.now() / 1000;
        // Use setInterval for reliable ticking (RAF throttles in background tabs)
        setInterval(tick, 1000 / CONFIG.TARGET_FPS);
    }

    function getCurrentLevel() { return currentLevel; }
    function getState() { return state; }

    return { startLevel, stopLevel, startLoop, getCurrentLevel, getState, render };
})();
