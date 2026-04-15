/* drawing.js - Pencil line drawing, fading, and ink management */
'use strict';

const Drawing = (() => {
    let lines = []; // { points: [{x,y}], createdAt, fading, opacity, fadeStart }
    let currentStroke = null;
    let ink = CONFIG.INK_MAX;
    let dpr = 1;

    function init() {
        lines = [];
        currentStroke = null;
        ink = CONFIG.INK_MAX;
    }

    function setDpr(d) { dpr = d; }

    function startStroke(pos) {
        // Need a meaningful minimum ink to begin a stroke. Once started,
        // the stroke runs until the user lifts or hits MAX_LINE_LENGTH —
        // ink is no longer allowed to abort it mid-drag.
        if (ink < CONFIG.INK_START_MIN) {
            // Visible feedback so the player understands why nothing drew
            if (typeof UI !== 'undefined' && UI.flashInkEmpty) UI.flashInkEmpty();
            return;
        }
        const clamped = clampToPlayArea(pos);
        currentStroke = {
            points: [clamped],
            createdAt: performance.now() / 1000,
            lengthPx: 0,
        };
        GameAudio.SFX.draw();
    }

    function addPoint(pos) {
        if (!currentStroke) return;
        // Hard cap on stroke length so users can't draw forever
        if (currentStroke.lengthPx >= CONFIG.MAX_LINE_LENGTH * dpr) return;

        // Clamp the point to the play area instead of dropping it. Users
        // commonly draw barriers right next to walls; rejecting any drift
        // outside the area felt like the pen randomly stopped working.
        const clamped = clampToPlayArea(pos);

        const last = currentStroke.points[currentStroke.points.length - 1];
        const dist = Math.hypot(clamped.x - last.x, clamped.y - last.y);
        if (dist < CONFIG.MIN_DRAW_DIST * dpr) return;

        currentStroke.points.push(clamped);
        currentStroke.lengthPx += dist;

        // Deduct ink for visual feedback in the HUD; cap at 0 but DON'T
        // abort the stroke when it hits zero. The MAX_LINE_LENGTH cap
        // above is what prevents abuse.
        ink = Math.max(0, ink - dist * CONFIG.INK_COST_PER_PIXEL);
        GameAudio.SFX.draw();
    }

    function clampToPlayArea(pos) {
        const area = Renderer.getPlayArea();
        return {
            x: Math.max(area.x, Math.min(area.x + area.w, pos.x)),
            y: Math.max(area.y, Math.min(area.y + area.h, pos.y)),
        };
    }

    function endStroke() {
        if (currentStroke && currentStroke.points.length >= 2) {
            currentStroke.fading = false;
            currentStroke.opacity = 1;
            currentStroke.fadeStart = null;
            lines.push(currentStroke);
        }
        currentStroke = null;
    }

    function update(dt, now) {
        // Regen ink
        if (!Input.isDrawing) {
            ink = Math.min(CONFIG.INK_MAX, ink + CONFIG.INK_REGEN_RATE * dt);
        }

        // Update line fading
        for (let i = lines.length - 1; i >= 0; i--) {
            const line = lines[i];
            const age = now - line.createdAt;

            if (!line.fading && age > CONFIG.LINE_FADE_TIME) {
                line.fading = true;
                line.fadeStart = now;
            }

            if (line.fading) {
                const fadeAge = now - line.fadeStart;
                line.opacity = 1 - (fadeAge / CONFIG.LINE_FADE_DURATION);
                if (line.opacity <= 0) {
                    lines.splice(i, 1);
                }
            }
        }
    }

    function drawLines(ctx) {
        // Draw completed lines
        for (const line of lines) {
            drawStroke(ctx, line.points, line.opacity);
        }
        // Draw current stroke
        if (currentStroke && currentStroke.points.length >= 2) {
            drawStroke(ctx, currentStroke.points, 1);
        }
    }

    /**
     * Simple hash for deterministic per-point noise (no frame-to-frame shimmer)
     */
    function pointNoise(index, seed) {
        const h = ((index * 2654435761) ^ (seed * 1103515245)) & 0x7fffffff;
        return (h % 1000) / 1000 - 0.5; // -0.5 to 0.5
    }

    function drawStroke(ctx, points, opacity) {
        if (points.length < 2) return;

        ctx.save();
        ctx.globalAlpha = opacity;
        ctx.strokeStyle = CONFIG.PENCIL_COLOR;
        ctx.lineWidth = CONFIG.PENCIL_WIDTH * dpr;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // Main line
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
            ctx.lineTo(points[i].x, points[i].y);
        }
        ctx.stroke();

        // Pencil texture - slight rough edge, deterministic per point
        ctx.globalAlpha = opacity * 0.2;
        ctx.lineWidth = CONFIG.PENCIL_WIDTH * dpr * 1.5;
        ctx.strokeStyle = '#6a6a6a';
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
            ctx.lineTo(
                points[i].x + pointNoise(i, 1) * 1.5 * dpr,
                points[i].y + pointNoise(i, 2) * 1.5 * dpr
            );
        }
        ctx.stroke();

        ctx.restore();
    }

    function getLines() { return lines; }
    function getInk() { return ink; }
    function getInkFraction() { return ink / CONFIG.INK_MAX; }

    return {
        init, setDpr, startStroke, addPoint, endStroke,
        update, drawLines, getLines, getInk, getInkFraction,
    };
})();
