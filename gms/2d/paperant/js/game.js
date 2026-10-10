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

    // Undo / hints
    let lastTap = null;          // { t, pos } of the previous tap, for double-tap undo
    let gestureConsumed = false; // current contact was used up by an undo
    let drawHintActive = false;
    let drawHintT = 0;
    let drawHintAnchor = null;
    let rotateHintT = 0;
    let landscapeHinted = false;

    Renderer.onAreaChange((oldA, newA) => {
        const map = (x, y) => ({
            x: newA.x + (x - oldA.x) / oldA.w * newA.w,
            y: newA.y + (y - oldA.y) / oldA.h * newA.h,
        });
        for (const ant of ants) {
            const p = map(ant.cx, ant.cy);
            ant.cx = p.x; ant.cy = p.y;
            const q = map(ant.stuckCheckX, ant.stuckCheckY);
            ant.stuckCheckX = q.x; ant.stuckCheckY = q.y;
        }
        if (magnet) {
            const p = map(magnet.x, magnet.y);
            magnet.x = p.x; magnet.y = p.y;
        }
        drawHintAnchor = null;
        Drawing.remap(oldA, newA);
        checkRotateHint();
        if (state !== 'idle') render(performance.now() / 1000);
    });

    function checkRotateHint() {
        if (!Renderer.isLandscape()) { landscapeHinted = false; rotateHintT = 0; return; }
        if (state === 'playing' && !landscapeHinted) {
            landscapeHinted = true;
            rotateHintT = 4;
        }
    }

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
        lastTap = null;
        gestureConsumed = false;
        drawHintActive = !challengeMode && currentLevel < 3;
        drawHintT = 0;
        drawHintAnchor = null;

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
            () => Drawing.endStroke(),
            () => Drawing.cancelStroke(),
            (pos) => handleTap(pos)
        );

        // Show HUD + power-up bar
        UI.hideAllScreens();
        UI.showHUD(true);
        UI.resetPowerupActive();
        UI.updatePowerupBar();
        checkRotateHint();

        lastTime = performance.now() / 1000;
    }

    function stopLevel() {
        state = 'idle';
        challengeMode = false;
        Input.disable();
        UI.showHUD(false);
    }

    function handleInputStart(pos) {
        gestureConsumed = false;
        if (placingMagnet) {
            placeMagnet(pos);
            gestureConsumed = true;
            return;
        }
        const dpr = Renderer.getDpr();
        if (lastTap && performance.now() - lastTap.t < 350 &&
            Math.hypot(pos.x - lastTap.pos.x, pos.y - lastTap.pos.y) < 30 * dpr) {
            const line = Drawing.lineAt(pos, 24 * dpr) || Drawing.lineAt(lastTap.pos, 24 * dpr);
            lastTap = null;
            if (line) {
                gestureConsumed = true;
                undoLine(line);
                return;
            }
        }
        Drawing.startStroke(pos);
    }

    function handleTap(pos) {
        if (gestureConsumed) { gestureConsumed = false; return; }
        lastTap = { t: performance.now(), pos };
    }

    function undoLine(line) {
        if (!(line ? Drawing.removeLine(line) : Drawing.undoLast())) return;
        GameAudio.SFX.undo();
        GameAudio.vibrate(15);
    }

    // === Power-ups ===

    function activatePowerUp(type) {
        if (state !== 'playing') return;

        if (type === 'undo') {
            undoLine(null);
            return;
        }

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

        UI.setUndoEnabled(Drawing.getLines().length > 0);
        if (drawHintActive) {
            drawHintT += dt;
            if (Drawing.pointCount > 2 || Drawing.getStrokeCount() > 0) drawHintActive = false;
        }
        if (rotateHintT > 0) rotateHintT -= dt;

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
        Drawing.update(dt);
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
            // One count per finished level, on the results screen only.
            window.PaperAntCloud?.levelFinished();
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

        if (state === 'playing') {
            if (UI.ghostEnabled() && (levelStartDelay > 0 || Input.isDrawing)) drawGhosts(ctx, dpr);
            if (drawHintActive) drawDrawHint(ctx, dpr);
        }

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

        if (rotateHintT > 0 && state === 'playing' && !placingMagnet) {
            const area = Renderer.getPlayArea();
            drawPill(ctx, dpr, '\u21BB Turn upright for the best fit',
                area.x + area.w / 2, area.y + 26 * dpr, Math.min(1, rotateHintT));
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

    function drawPill(ctx, dpr, msg, mx, my, alpha) {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.font = `bold ${18 * dpr}px 'Patrick Hand', cursive`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const tw = ctx.measureText(msg).width;
        ctx.fillStyle = 'rgba(245, 240, 225, 0.92)';
        ctx.strokeStyle = 'rgba(139, 115, 85, 0.7)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(mx - tw / 2 - 10 * dpr, my - 15 * dpr, tw + 20 * dpr, 30 * dpr, 10 * dpr);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#2c1810';
        ctx.fillText(msg, mx, my);
        ctx.restore();
    }

    // Faint dotted preview of each ant's next ~1 s. Walls and obstacles mirror
    // the path; pencil lines send it along the line's normal, which is the
    // average of the real (randomised +-70 deg) line bounce.
    function drawGhosts(ctx, dpr) {
        const area = Renderer.getPlayArea();
        const margin = CONFIG.ANT_SIZE * dpr * 0.8;
        const lines = Drawing.getLines().filter(l => !(l.fading && l.opacity < 0.3));
        const cur = Drawing.getCurrentStroke();
        if (cur && cur.points.length >= 2) lines.push(cur);
        const frozen = freezeTimer > 0 ? CONFIG.FREEZE_FACTOR : 1;
        ctx.save();
        ctx.fillStyle = '#2c1810';
        for (const ant of ants) {
            let x = ant.cx, y = ant.cy, a = ant.angle;
            const step = ant.baseSpeed * frozen * 2; // two 60 fps frames per step
            for (let i = 1; i <= 30; i++) {
                let nx = x + Math.cos(a) * step;
                let ny = y + Math.sin(a) * step;
                let vx = Math.cos(a), vy = Math.sin(a);
                if (nx - margin < area.x || nx + margin > area.x + area.w) { vx = -vx; nx = x; }
                if (ny - margin < area.y || ny + margin > area.y + area.h) { vy = -vy; ny = y; }
                for (const o of obstacles) {
                    const op = Renderer.toCanvas(o.x, o.y);
                    const ow = o.w * area.w, oh = o.h * area.h;
                    if (nx + margin > op.x && nx - margin < op.x + ow &&
                        ny + margin > op.y && ny - margin < op.y + oh) {
                        const inX = x + margin > op.x && x - margin < op.x + ow;
                        if (inX) vy = -vy; else vx = -vx;
                        nx = x; ny = y;
                        break;
                    }
                }
                a = Math.atan2(vy, vx);
                let hit = false;
                for (const l of lines) {
                    const th = margin + (l.width || CONFIG.PENCIL_WIDTH) * dpr;
                    const p = l.points;
                    for (let j = 1; j < p.length && !hit; j++) {
                        const dx = p[j].x - p[j - 1].x, dy = p[j].y - p[j - 1].y;
                        const l2 = dx * dx + dy * dy || 1;
                        const t = Math.max(0, Math.min(1, ((nx - p[j - 1].x) * dx + (ny - p[j - 1].y) * dy) / l2));
                        const cx = p[j - 1].x + t * dx, cy = p[j - 1].y + t * dy;
                        if (Math.hypot(nx - cx, ny - cy) < th) {
                            let n = Math.atan2(dx, -dy);
                            if (Math.cos(a - n) > 0) n += Math.PI;
                            a = n;
                            nx = x; ny = y;
                            hit = true;
                        }
                    }
                    if (hit) break;
                }
                x = nx; y = ny;
                if (i % 2 === 0) {
                    ctx.globalAlpha = 0.32 * (1 - i / 34);
                    ctx.beginPath();
                    ctx.arc(x, y, 1.8 * dpr, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }
        ctx.restore();
    }

    // Levels 1-3: a ghost pencil traces a funnel in front of the first ant
    // until the player draws their first stroke.
    function drawDrawHint(ctx, dpr) {
        const ant = ants[0];
        if (!ant) return;
        const area = Renderer.getPlayArea();
        const cycle = 2.4;
        const t = drawHintT % cycle;
        const R = 0.13 * Math.min(area.w, area.h);
        const n = Math.floor(drawHintT / cycle);
        if (!drawHintAnchor || drawHintAnchor.n !== n) {
            const d = R * 2.4;
            const cx = Math.max(area.x + R, Math.min(area.x + area.w - R, ant.cx + Math.cos(ant.angle) * d));
            const cy = Math.max(area.y + R, Math.min(area.y + area.h - R, ant.cy + Math.sin(ant.angle) * d));
            drawHintAnchor = { n, cx, cy, a: Math.atan2(cy - ant.cy, cx - ant.cx) };
        }
        const { cx, cy, a } = drawHintAnchor;
        const k = Math.min(1, t / 1.4);
        const fade = t > 1.8 ? Math.max(0, 1 - (t - 1.8) / 0.6) : 1;
        const a0 = a - Math.PI / 2;
        const a1 = a0 + Math.PI * k;
        ctx.save();
        ctx.globalAlpha = 0.45 * fade;
        ctx.strokeStyle = CONFIG.PENCIL_COLOR;
        ctx.lineWidth = CONFIG.PENCIL_WIDTH * dpr;
        ctx.lineCap = 'round';
        ctx.setLineDash([2 * dpr, 9 * dpr]);
        ctx.beginPath();
        ctx.arc(cx, cy, R, a0, a1);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 0.9 * fade;
        ctx.font = `${26 * dpr}px serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillText('\u270F\uFE0F', cx + Math.cos(a1) * R - 4 * dpr, cy + Math.sin(a1) * R + 4 * dpr);
        ctx.restore();
        drawPill(ctx, dpr, 'Draw a curve to steer the ant', area.x + area.w / 2,
            area.y + area.h - 22 * dpr, 0.9);
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
