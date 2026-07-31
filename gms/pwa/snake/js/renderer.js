/**
 * Canvas renderer - draws everything
 */
class Renderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.resize();
        this._resizeHandler = () => this.resize();
        window.addEventListener('resize', this._resizeHandler);
    }

    resize() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        this.canvas.width = window.innerWidth * dpr;
        this.canvas.height = window.innerHeight * dpr;
        this.canvas.style.width = window.innerWidth + 'px';
        this.canvas.style.height = window.innerHeight + 'px';
        this.ctx.scale(dpr, dpr);
        this.width = window.innerWidth;
        this.height = window.innerHeight;
    }

    /**
     * How much room the br8t account avatar is taking in the top-right corner,
     * in CSS pixels. Zero when the account layer is not loaded. Polled rather
     * than read every frame — getComputedStyle is far too expensive for that,
     * and the value only changes when the avatar mounts.
     */
    _accountSpace() {
        const now = performance.now();
        if (this._accountSpaceAt === undefined || now - this._accountSpaceAt > 500) {
            this._accountSpaceAt = now;
            const v = getComputedStyle(document.documentElement)
                .getPropertyValue('--br8t-account-space');
            this._accountSpaceVal = parseFloat(v) || 0;
        }
        return this._accountSpaceVal;
    }

    /** Draw a rounded rect (polyfill for older browsers) */
    _roundRect(x, y, w, h, r) {
        const ctx = this.ctx;
        if (ctx.roundRect) {
            ctx.beginPath();
            ctx.roundRect(x, y, w, h, r);
        } else {
            ctx.beginPath();
            ctx.moveTo(x + r, y);
            ctx.lineTo(x + w - r, y);
            ctx.arcTo(x + w, y, x + w, y + r, r);
            ctx.lineTo(x + w, y + h - r);
            ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
            ctx.lineTo(x + r, y + h);
            ctx.arcTo(x, y + h, x, y + h - r, r);
            ctx.lineTo(x, y + r);
            ctx.arcTo(x, y, x + r, y, r);
            ctx.closePath();
        }
    }

    /** Clear the entire canvas */
    clear() {
        this.ctx.fillStyle = CONFIG.BG_COLOR;
        this.ctx.fillRect(0, 0, this.width, this.height);
    }

    /** Draw the background grid */
    drawGrid(camera) {
        const ctx = this.ctx;
        const bounds = camera.getViewBounds();
        const gridSize = CONFIG.GRID_SIZE;

        ctx.strokeStyle = CONFIG.GRID_COLOR;
        ctx.lineWidth = 1;
        ctx.beginPath();

        const startX = Math.floor(bounds.left / gridSize) * gridSize;
        const startY = Math.floor(bounds.top / gridSize) * gridSize;

        for (let x = startX; x <= bounds.right; x += gridSize) {
            const s = camera.worldToScreen(x, bounds.top);
            const e = camera.worldToScreen(x, bounds.bottom);
            ctx.moveTo(s.x, s.y);
            ctx.lineTo(e.x, e.y);
        }
        for (let y = startY; y <= bounds.bottom; y += gridSize) {
            const s = camera.worldToScreen(bounds.left, y);
            const e = camera.worldToScreen(bounds.right, y);
            ctx.moveTo(s.x, s.y);
            ctx.lineTo(e.x, e.y);
        }
        ctx.stroke();
    }

    /** Draw the world boundary */
    drawBoundary(camera) {
        const ctx = this.ctx;
        const center = camera.worldToScreen(0, 0);
        const edge = camera.worldToScreen(CONFIG.WORLD_RADIUS, 0);
        const radius = edge.x - center.x;

        // Outer boundary ring
        ctx.beginPath();
        ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
        ctx.strokeStyle = CONFIG.BOUNDARY_COLOR;
        ctx.lineWidth = 4 * camera.zoom;
        ctx.stroke();

        // Warning zone glow
        const warnRadius = radius - CONFIG.BOUNDARY_WARNING * camera.zoom;
        if (warnRadius > 0) {
            const gradient = ctx.createRadialGradient(
                center.x, center.y, warnRadius,
                center.x, center.y, radius
            );
            gradient.addColorStop(0, 'rgba(255,50,50,0)');
            gradient.addColorStop(1, 'rgba(255,50,50,0.15)');
            ctx.beginPath();
            ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
            ctx.fillStyle = gradient;
            ctx.fill();
        }
    }

    /**
     * Draw all food pellets.
     * The world-to-screen transform is inlined here and in drawSnake: the object
     * that camera.worldToScreen returns is harmless once, but this runs thousands
     * of times a frame and the garbage was showing up in profiles.
     */
    drawFood(food, camera) {
        const ctx = this.ctx;
        const bounds = camera.getViewBounds();
        const zoom = camera.zoom;
        const ox = this.width / 2 - camera.x * zoom + camera.shakeX;
        const oy = this.height / 2 - camera.y * zoom + camera.shakeY;

        for (let i = 0; i < food.length; i++) {
            const f = food[i];
            if (f.x < bounds.left || f.x > bounds.right ||
                f.y < bounds.top || f.y > bounds.bottom) continue;

            const sx = f.x * zoom + ox;
            const sy = f.y * zoom + oy;
            const r = f.radius * zoom;

            // Glow (skip tiny food glow for performance)
            if (r > 2) {
                ctx.beginPath();
                ctx.arc(sx, sy, r * 2, 0, Math.PI * 2);
                ctx.fillStyle = Utils.hexToRgba(f.color, 0.15);
                ctx.fill();
            }

            // Core
            ctx.beginPath();
            ctx.arc(sx, sy, Math.max(r, 1.5), 0, Math.PI * 2);
            ctx.fillStyle = f.color;
            ctx.fill();
        }
    }

    /** Draw power-ups */
    drawPowerups(powerups, camera) {
        const ctx = this.ctx;
        const now = performance.now();

        for (const pu of powerups) {
            if (!camera.isVisible(pu.x, pu.y, 30)) continue;

            const s = camera.worldToScreen(pu.x, pu.y);
            const r = pu.radius * camera.zoom;
            const pulse = 1 + Math.sin(now / 300 + pu.pulsePhase) * 0.2;
            const pr = r * pulse;

            // Outer glow
            const gradient = ctx.createRadialGradient(s.x, s.y, pr * 0.5, s.x, s.y, pr * 2.5);
            gradient.addColorStop(0, Utils.hexToRgba(pu.type.color, 0.4));
            gradient.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.beginPath();
            ctx.arc(s.x, s.y, pr * 2.5, 0, Math.PI * 2);
            ctx.fillStyle = gradient;
            ctx.fill();

            // Core circle
            ctx.beginPath();
            ctx.arc(s.x, s.y, pr, 0, Math.PI * 2);
            ctx.fillStyle = pu.type.color;
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2 * camera.zoom;
            ctx.stroke();

            // Icon text
            ctx.fillStyle = '#fff';
            ctx.font = `bold ${Math.round(12 * camera.zoom)}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(pu.type.icon, s.x, s.y);
        }
    }

    /**
     * Draw a snake.
     *
     * The dark border is one continuous stroked polyline rather than a second
     * full pass of circles. That is both cheaper and better looking — the old
     * two-pass version needed every outline drawn before every fill to avoid
     * dark rings between segments, which meant touching each segment twice.
     * Sub-paths are broken whenever a run of segments goes off screen, otherwise
     * the stroke would draw a line straight across the view.
     */
    drawSnake(snake, camera, isPlayer) {
        if (!snake.alive) return;
        const ctx = this.ctx;
        const bounds = camera.getViewBounds();
        const zoom = camera.zoom;
        const ox = this.width / 2 - camera.x * zoom + camera.shakeX;
        const oy = this.height / 2 - camera.y * zoom + camera.shakeY;
        const n = snake.segCount;
        const segX = snake.segX, segY = snake.segY;

        const pad = snake.bodyRadius + 20;
        const left = bounds.left - pad, right = bounds.right + pad;
        const top = bounds.top - pad, bottom = bounds.bottom + pad;
        const screenR = snake.bodyRadius * zoom;

        // Border pass: one path, drawn tail to head.
        if (screenR >= CONFIG.RENDER_OUTLINE_MIN_RADIUS) {
            ctx.beginPath();
            let pen = false;
            for (let i = n - 1; i >= 0; i--) {
                const wx = segX[i], wy = segY[i];
                if (wx < left || wx > right || wy < top || wy > bottom) { pen = false; continue; }
                const sx = wx * zoom + ox, sy = wy * zoom + oy;
                if (pen) ctx.lineTo(sx, sy);
                else { ctx.moveTo(sx, sy); pen = true; }
            }
            ctx.strokeStyle = 'rgba(0,0,0,0.35)';
            ctx.lineWidth = (snake.bodyRadius + 1.5) * 2 * zoom;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.stroke();
        }

        // Body fill: tail to head so the head sits on top.
        for (let i = n - 1; i >= 1; i--) {
            const wx = segX[i], wy = segY[i];
            if (wx < left || wx > right || wy < top || wy > bottom) continue;

            const sx = wx * zoom + ox, sy = wy * zoom + oy;
            const r = snake.getRadiusAt(i) * zoom;

            ctx.beginPath();
            ctx.arc(sx, sy, r, 0, Math.PI * 2);
            ctx.fillStyle = snake.getColorAt(i);
            ctx.fill();
        }

        // Draw head
        const hs = { x: snake.x * zoom + ox, y: snake.y * zoom + oy };
        const hr = snake.getRadiusAt(0) * zoom;
        const headColor = snake.getColorAt(0);

        // Head glow for player
        if (isPlayer) {
            ctx.beginPath();
            ctx.arc(hs.x, hs.y, hr * 1.8, 0, Math.PI * 2);
            ctx.fillStyle = Utils.hexToRgba(headColor, 0.15);
            ctx.fill();
        }

        // Head outline
        ctx.beginPath();
        ctx.arc(hs.x, hs.y, hr + 1, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fill();

        // Head circle
        ctx.beginPath();
        ctx.arc(hs.x, hs.y, hr, 0, Math.PI * 2);
        ctx.fillStyle = headColor;
        ctx.fill();

        // Eyes
        const eyeAngle = snake.eyeAngle;
        const eyeOffset = hr * 0.45;
        const eyeR = hr * 0.35;
        const pupilR = hr * 0.18;

        for (let side = -1; side <= 1; side += 2) {
            const ex = hs.x + Math.cos(eyeAngle + side * 0.5) * eyeOffset;
            const ey = hs.y + Math.sin(eyeAngle + side * 0.5) * eyeOffset;

            // White of eye
            ctx.beginPath();
            ctx.arc(ex, ey, eyeR, 0, Math.PI * 2);
            ctx.fillStyle = '#fff';
            ctx.fill();

            // Pupil (positioned toward look direction)
            const px = ex + Math.cos(eyeAngle) * pupilR * 0.4;
            const py = ey + Math.sin(eyeAngle) * pupilR * 0.4;
            ctx.beginPath();
            ctx.arc(px, py, pupilR, 0, Math.PI * 2);
            ctx.fillStyle = '#111';
            ctx.fill();
        }

        // Name tag (only if reasonably zoomed)
        if (camera.zoom > CONFIG.NAME_TAG_MIN_ZOOM) {
            ctx.fillStyle = isPlayer ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.7)';
            ctx.font = `bold ${Math.round(11 * camera.zoom)}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText(snake.name, hs.x, hs.y - hr - 6 * camera.zoom);

            // Mass display
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.font = `${Math.round(9 * camera.zoom)}px sans-serif`;
            ctx.fillText(Utils.formatNumber(snake.mass), hs.x, hs.y - hr - 18 * camera.zoom);
        }

        // Active powerup indicators
        const activePowerups = Object.keys(snake.powerups).filter(k => snake.hasPowerup(k));
        if (activePowerups.length > 0) {
            const now = performance.now();
            activePowerups.forEach((pu, idx) => {
                const config = Object.values(CONFIG.POWERUP_TYPES).find(p => p.id === pu);
                if (config) {
                    const remaining = (snake.powerups[pu] - now) / 1000;
                    ctx.fillStyle = config.color;
                    ctx.font = `bold ${Math.round(10 * camera.zoom)}px sans-serif`;
                    ctx.textAlign = 'center';
                    ctx.fillText(
                        `${config.icon} ${remaining.toFixed(0)}s`,
                        hs.x, hs.y + hr + (14 + idx * 14) * camera.zoom
                    );
                }
            });
        }
    }

    /** Draw particles */
    drawParticles(particles, camera) {
        const ctx = this.ctx;
        for (const p of particles.particles) {
            if (!camera.isVisible(p.x, p.y, 10)) continue;
            const s = camera.worldToScreen(p.x, p.y);
            const r = p.radius * camera.zoom;

            ctx.globalAlpha = p.alpha;
            ctx.beginPath();
            ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
            ctx.fillStyle = p.color;
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    /** Draw HUD overlay */
    drawHUD(playerSnake, allSnakes, gameTime) {
        const ctx = this.ctx;

        // Score - top center
        if (playerSnake && playerSnake.alive) {
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 24px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText(Utils.formatNumber(playerSnake.mass), this.width / 2, 16);

            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.font = '12px sans-serif';
            ctx.fillText('MASS', this.width / 2, 44);

            // Below the pause button, which owns the top-left corner.
            ctx.fillStyle = 'rgba(255,215,0,0.75)';
            ctx.font = 'bold 12px sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText('LV ' + playerSnake.level, 16, 66);
            ctx.textAlign = 'center';

            this._drawGoal(playerSnake.mass);
        }

        // Leaderboard - top right
        const sorted = [...allSnakes]
            .filter(s => s.alive)
            .sort((a, b) => b.mass - a.mass);
        const top10 = sorted.slice(0, 10);

        // The account avatar publishes its top-right footprint as a CSS var; drop
        // the leaderboard below it rather than squeezing it into the mass counter.
        const lbX = this.width - 12;
        const lbY = 16 + this._accountSpace();
        const lbW = 140;

        // Find player rank
        let playerRank = -1;
        if (playerSnake && playerSnake.alive) {
            playerRank = sorted.findIndex(s => s.isPlayer) + 1;
        }
        const showPlayerRank = playerRank > 10;
        const lbRows = top10.length + (showPlayerRank ? 1 : 0);

        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        this._roundRect(lbX - lbW, lbY, lbW, 22 + lbRows * 18, 6);
        ctx.fill();

        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';
        ctx.fillText('LEADERBOARD', lbX - 8, lbY + 4);

        top10.forEach((s, i) => {
            const y = lbY + 22 + i * 18;
            const isP = s.isPlayer;
            ctx.fillStyle = isP ? '#ffcc00' : 'rgba(255,255,255,0.6)';
            ctx.font = isP ? 'bold 10px sans-serif' : '10px sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText(`${i + 1}. ${s.name}`, lbX - lbW + 8, y);
            ctx.textAlign = 'right';
            ctx.fillText(Utils.formatNumber(s.mass), lbX - 8, y);
        });

        // Show player rank if not in top 10
        if (showPlayerRank && playerSnake) {
            const y = lbY + 22 + top10.length * 18;
            ctx.fillStyle = '#ffcc00';
            ctx.font = 'bold 10px sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText(`${playerRank}. ${playerSnake.name}`, lbX - lbW + 8, y);
            ctx.textAlign = 'right';
            ctx.fillText(Utils.formatNumber(playerSnake.mass), lbX - 8, y);
        }

        // Kill count - below the score and goal bar
        if (playerSnake && playerSnake.alive && playerSnake.kills > 0) {
            const y = playerSnake.mass / CONFIG.WIN_MASS >= 0.1 ? 82 : 60;
            ctx.fillStyle = '#ff4444';
            ctx.font = 'bold 14px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText(`${playerSnake.kills} kill${playerSnake.kills > 1 ? 's' : ''}`, this.width / 2, y);
        }
    }

    /**
     * Progress toward the 10,000 win. Hidden early on — nobody needs a progress
     * bar at 40 mass — and it turns gold as it fills.
     */
    _drawGoal(mass) {
        const goal = CONFIG.WIN_MASS;
        const frac = Utils.clamp(mass / goal, 0, 1);
        if (frac < 0.1) return;

        const ctx = this.ctx;
        const w = Math.min(180, this.width * 0.45);
        const h = 5;
        const x = (this.width - w) / 2;
        const y = 62;

        ctx.fillStyle = 'rgba(255,255,255,0.14)';
        this._roundRect(x, y, w, h, h / 2);
        ctx.fill();

        ctx.fillStyle = frac >= 1 ? '#ffd700' : (frac > 0.75 ? '#ffcc00' : '#4CAF50');
        this._roundRect(x, y, Math.max(h, w * frac), h, h / 2);
        ctx.fill();

        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.font = '9px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(`${Utils.formatNumber(goal)} TO WIN`, this.width / 2, y + h + 3);
    }

    /** Draw minimap */
    drawMinimap(playerSnake, allSnakes, camera) {
        const ctx = this.ctx;
        const size = CONFIG.MINIMAP_SIZE;
        const margin = CONFIG.MINIMAP_MARGIN;
        const x = margin;
        const y = this.height - size - margin;
        const scale = size / (CONFIG.WORLD_RADIUS * 2);

        // Background
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.beginPath();
        ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
        ctx.fill();

        // Boundary circle
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(x + size / 2, y + size / 2, size / 2 - 1, 0, Math.PI * 2);
        ctx.stroke();

        // Other snakes as dots
        for (const snake of allSnakes) {
            if (!snake.alive) continue;
            const sx = x + size / 2 + snake.x * scale;
            const sy = y + size / 2 + snake.y * scale;
            const r = Utils.clamp(1 + Math.sqrt(snake.mass) / 12, 1.5, 5);

            if (snake.isPlayer) {
                ctx.fillStyle = '#ffcc00';
                ctx.beginPath();
                ctx.arc(sx, sy, r + 1, 0, Math.PI * 2);
                ctx.fill();
            } else {
                ctx.fillStyle = snake.skin.colors[0];
                ctx.beginPath();
                ctx.arc(sx, sy, r, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // Viewport rectangle
        const bounds = camera.getViewBounds();
        const vx = x + size / 2 + bounds.left * scale;
        const vy = y + size / 2 + bounds.top * scale;
        const vw = (bounds.right - bounds.left) * scale;
        const vh = (bounds.bottom - bounds.top) * scale;
        ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        ctx.lineWidth = 1;
        ctx.strokeRect(vx, vy, vw, vh);
    }

    /** Draw joystick overlay */
    drawJoystick(inputData) {
        if (!inputData) return;
        const ctx = this.ctx;

        // Base circle
        ctx.beginPath();
        ctx.arc(inputData.baseX, inputData.baseY, inputData.radius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Stick
        ctx.beginPath();
        ctx.arc(inputData.stickX, inputData.stickY, 18, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.fill();
    }

    /** Draw boundary warning overlay */
    drawBoundaryWarning(playerSnake) {
        if (!playerSnake || !playerSnake.alive) return;
        const distToEdge = CONFIG.WORLD_RADIUS - Utils.dist(0, 0, playerSnake.x, playerSnake.y);
        if (distToEdge > CONFIG.BOUNDARY_WARNING) return;

        const ctx = this.ctx;
        const alpha = Utils.clamp((CONFIG.BOUNDARY_WARNING - distToEdge) / CONFIG.BOUNDARY_WARNING, 0, 0.4);

        ctx.fillStyle = `rgba(255,0,0,${alpha * 0.3})`;
        ctx.fillRect(0, 0, this.width, this.height);

        ctx.fillStyle = `rgba(255,100,100,${alpha})`;
        ctx.font = 'bold 16px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('BOUNDARY WARNING', this.width / 2, this.height - 60);
    }
}
