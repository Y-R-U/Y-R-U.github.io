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

    /** Draw all food pellets */
    drawFood(food, camera) {
        const ctx = this.ctx;
        const bounds = camera.getViewBounds();

        for (const f of food) {
            if (f.x < bounds.left || f.x > bounds.right ||
                f.y < bounds.top || f.y > bounds.bottom) continue;

            const s = camera.worldToScreen(f.x, f.y);
            const r = f.radius * camera.zoom;

            // Glow (skip tiny food glow for performance)
            if (r > 2) {
                ctx.beginPath();
                ctx.arc(s.x, s.y, r * 2, 0, Math.PI * 2);
                ctx.fillStyle = Utils.hexToRgba(f.color, 0.15);
                ctx.fill();
            }

            // Core
            ctx.beginPath();
            ctx.arc(s.x, s.y, Math.max(r, 1.5), 0, Math.PI * 2);
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

    /** Draw a snake with body outline for depth */
    drawSnake(snake, camera, isPlayer) {
        if (!snake.alive) return;
        const ctx = this.ctx;

        // Draw body outline first (darker border for depth)
        for (let i = snake.segments.length - 1; i >= 1; i--) {
            const seg = snake.segments[i];
            if (!camera.isVisible(seg.x, seg.y, 20)) continue;
            const s = camera.worldToScreen(seg.x, seg.y);
            const r = snake.getRadiusAt(i) * camera.zoom;

            ctx.beginPath();
            ctx.arc(s.x, s.y, r + 1, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.fill();
        }

        // Draw body segments from tail to head
        for (let i = snake.segments.length - 1; i >= 1; i--) {
            const seg = snake.segments[i];
            if (!camera.isVisible(seg.x, seg.y, 20)) continue;

            const s = camera.worldToScreen(seg.x, seg.y);
            const r = snake.getRadiusAt(i) * camera.zoom;
            const color = snake.getColorAt(i);

            ctx.beginPath();
            ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.fill();
        }

        // Draw head
        const head = snake.segments[0];
        const hs = camera.worldToScreen(head.x, head.y);
        const hr = snake.getRadiusAt(0) * camera.zoom;
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
        if (camera.zoom > 0.4) {
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
        }

        // Leaderboard - top right
        const sorted = [...allSnakes]
            .filter(s => s.alive)
            .sort((a, b) => b.mass - a.mass);
        const top10 = sorted.slice(0, 10);

        const lbX = this.width - 12;
        const lbY = 16;
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

        // Kill count - below score
        if (playerSnake && playerSnake.alive && playerSnake.kills > 0) {
            ctx.fillStyle = '#ff4444';
            ctx.font = 'bold 14px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(`${playerSnake.kills} kill${playerSnake.kills > 1 ? 's' : ''}`, this.width / 2, 60);
        }
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
            const r = Utils.clamp(snake.mass / 30, 1.5, 4);

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
