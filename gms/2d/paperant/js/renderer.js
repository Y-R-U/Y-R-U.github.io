/* renderer.js - Canvas rendering: paper background, grid, margins, obstacles */
'use strict';

const Renderer = (() => {
    let canvas, ctx;
    let w, h;
    let playArea = { x: 0, y: 0, w: 0, h: 0 }; // area inside margins
    let dpr = 1;

    function init(canvasEl) {
        canvas = canvasEl;
        ctx = canvas.getContext('2d');
        resize();
        window.addEventListener('resize', resize);
    }

    function resize() {
        dpr = window.devicePixelRatio || 1;
        const rect = canvas.parentElement.getBoundingClientRect();
        w = Math.round(rect.width * dpr);
        h = Math.round(rect.height * dpr);
        canvas.width = w;
        canvas.height = h;
        canvas.style.width = rect.width + 'px';
        canvas.style.height = rect.height + 'px';
        // Play area inside margins
        const mx = Math.round(w * CONFIG.PAPER_MARGIN_X);
        const topPad = Math.round(52 * dpr); // HUD space
        playArea = { x: mx, y: topPad, w: w - mx * 2, h: h - topPad - Math.round(16 * dpr) };
    }

    function getPlayArea() { return { ...playArea }; }
    function getSize() { return { w, h }; }
    function getDpr() { return dpr; }
    function getCtx() { return ctx; }

    // Convert fractional position (0-1) to canvas coords within play area
    function toCanvas(fx, fy) {
        return {
            x: playArea.x + fx * playArea.w,
            y: playArea.y + fy * playArea.h,
        };
    }

    // Convert canvas coords to fractional position
    function toFraction(cx, cy) {
        return {
            x: (cx - playArea.x) / playArea.w,
            y: (cy - playArea.y) / playArea.h,
        };
    }

    function drawPaper() {
        // Paper background
        ctx.fillStyle = CONFIG.PAPER_COLOR;
        ctx.fillRect(0, 0, w, h);

        // Subtle paper texture (noise dots)
        ctx.fillStyle = 'rgba(180, 170, 150, 0.06)';
        const step = 6;
        for (let px = 0; px < w; px += step) {
            for (let py = 0; py < h; py += step) {
                if (Math.random() < 0.3) {
                    ctx.fillRect(px, py, 2, 2);
                }
            }
        }

        // Horizontal ruled lines
        const spacing = CONFIG.PAPER_LINE_SPACING * dpr;
        ctx.strokeStyle = CONFIG.PAPER_LINE_COLOR;
        ctx.lineWidth = 1;
        const startY = playArea.y;
        for (let y = startY; y < h; y += spacing) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
            ctx.stroke();
        }

        // Left margin line (red)
        const marginX = playArea.x;
        ctx.strokeStyle = CONFIG.PAPER_MARGIN_COLOR;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(marginX, 0);
        ctx.lineTo(marginX, h);
        ctx.stroke();

        // Paper edge shadow (left)
        const edgeGrad = ctx.createLinearGradient(0, 0, 20 * dpr, 0);
        edgeGrad.addColorStop(0, 'rgba(0,0,0,0.08)');
        edgeGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = edgeGrad;
        ctx.fillRect(0, 0, 20 * dpr, h);

        // Hole punches on left margin
        const holeY = [h * 0.25, h * 0.5, h * 0.75];
        ctx.fillStyle = '#d4c9a8';
        ctx.strokeStyle = 'rgba(0,0,0,0.1)';
        ctx.lineWidth = 1;
        for (const hy of holeY) {
            ctx.beginPath();
            ctx.arc(marginX * 0.4, hy, 8 * dpr, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        }
    }

    function drawObstacles(obstacles) {
        for (const obs of obstacles) {
            const pos = toCanvas(obs.x, obs.y);
            const ow = obs.w * playArea.w;
            const oh = obs.h * playArea.h;

            // Water puddle look
            ctx.save();
            ctx.beginPath();
            ctx.roundRect(pos.x, pos.y, ow, oh, 8 * dpr);

            // Gradient fill
            const grad = ctx.createRadialGradient(
                pos.x + ow / 2, pos.y + oh / 2, 0,
                pos.x + ow / 2, pos.y + oh / 2, Math.max(ow, oh) / 2
            );
            grad.addColorStop(0, 'rgba(100, 170, 230, 0.35)');
            grad.addColorStop(0.7, 'rgba(80, 140, 200, 0.25)');
            grad.addColorStop(1, 'rgba(60, 120, 180, 0.15)');
            ctx.fillStyle = grad;
            ctx.fill();

            // Border
            ctx.strokeStyle = 'rgba(80, 140, 200, 0.3)';
            ctx.lineWidth = 1.5;
            ctx.stroke();

            // Highlight
            ctx.beginPath();
            ctx.ellipse(pos.x + ow * 0.35, pos.y + oh * 0.3, ow * 0.15, oh * 0.1, -0.3, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
            ctx.fill();

            ctx.restore();
        }
    }

    function drawGoal(goal, time) {
        const pos = toCanvas(goal.x, goal.y);
        const size = CONFIG.GOAL_SIZE * dpr;
        const pulse = 1 + Math.sin(time * CONFIG.GOAL_PULSE_SPEED) * 0.1;

        ctx.save();
        ctx.translate(pos.x, pos.y);
        ctx.scale(pulse, pulse);

        // Glow
        ctx.shadowColor = GOAL_TYPES[goal.type].color;
        ctx.shadowBlur = 12 * dpr;

        // Circle background
        ctx.beginPath();
        ctx.arc(0, 0, size, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.fill();
        ctx.strokeStyle = GOAL_TYPES[goal.type].color;
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.shadowBlur = 0;

        // Icon text
        ctx.font = `${size * 1.2}px serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const icons = { food: '🍞', nest: '🏠', friend: '🐜', leaf: '🍃', sugar: '🍬' };
        ctx.fillText(icons[goal.type] || '⭐', 0, 1);

        // Order number if sequential
        if (goal.order && !goal.collected) {
            ctx.font = `bold ${size * 0.6}px 'Patrick Hand', sans-serif`;
            ctx.fillStyle = '#fff';
            ctx.strokeStyle = GOAL_TYPES[goal.type].color;
            ctx.lineWidth = 3;
            ctx.strokeText(goal.order, size * 0.7, -size * 0.6);
            ctx.fillText(goal.order, size * 0.7, -size * 0.6);
        }

        ctx.restore();
    }

    function drawGoalCollected(goal) {
        const pos = toCanvas(goal.x, goal.y);
        const size = CONFIG.GOAL_SIZE * dpr;
        ctx.save();
        ctx.globalAlpha = 0.3;
        ctx.translate(pos.x, pos.y);
        ctx.beginPath();
        ctx.arc(0, 0, size, 0, Math.PI * 2);
        ctx.fillStyle = '#ccc';
        ctx.fill();

        // Checkmark
        ctx.strokeStyle = '#5c8a4d';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(-size * 0.4, 0);
        ctx.lineTo(-size * 0.1, size * 0.3);
        ctx.lineTo(size * 0.4, -size * 0.3);
        ctx.stroke();

        ctx.restore();
    }

    function clear() {
        ctx.clearRect(0, 0, w, h);
    }

    return {
        init, resize, clear, drawPaper, drawObstacles, drawGoal, drawGoalCollected,
        getPlayArea, getSize, getDpr, getCtx, toCanvas, toFraction,
    };
})();
