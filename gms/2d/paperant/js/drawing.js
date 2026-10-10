/* drawing.js - Pencil lines, fading (on game time), length-based ink, undo */
'use strict';

const Drawing = (() => {
    let lines = []; // { points: [{x,y}], createdAt, fading, opacity, fadeStart, width, fadeTime, cost }
    let currentStroke = null;
    let ink = CONFIG.INK_MAX;
    let dpr = 1;
    let clock = 0; // game time: only advances in update(), so pause/popups freeze line age
    // Thick Pencil power-up: multiplies stroke width & fade time for the
    // rest of the level. Reset on init().
    let widthMult = 1;
    let fadeMult = 1;
    let strokeCount = 0;

    function init() {
        lines = [];
        currentStroke = null;
        ink = CONFIG.INK_MAX;
        clock = 0;
        widthMult = 1;
        fadeMult = 1;
        strokeCount = 0;
    }

    function setBoost(wm, fm) {
        widthMult = wm;
        fadeMult = fm;
    }

    function getWidthMultiplier() { return widthMult; }

    function refillInk() { ink = CONFIG.INK_MAX; }

    function setDpr(d) { dpr = d; }

    function inkUnit() { return CONFIG.INK_UNIT_PX * dpr; }

    function startStroke(pos) {
        if (ink < CONFIG.INK_START_MIN) {
            if (typeof UI !== 'undefined' && UI.flashInkEmpty) UI.flashInkEmpty();
            return false;
        }
        currentStroke = {
            points: [clampToPlayArea(pos)],
            createdAt: clock,
            width: CONFIG.PENCIL_WIDTH * widthMult,
            fadeTime: CONFIG.LINE_FADE_TIME * fadeMult,
            cost: 0,
            len: 0,
        };
        GameAudio.SFX.draw();
        return true;
    }

    function addPoint(pos) {
        if (!currentStroke) return;
        // Clamp instead of dropping: users draw right up against the walls.
        let p = clampToPlayArea(pos);
        const last = currentStroke.points[currentStroke.points.length - 1];
        const dist = Math.hypot(p.x - last.x, p.y - last.y);
        if (dist < CONFIG.MIN_DRAW_DIST * dpr) return;

        let cost = dist / inkUnit();
        let dry = false;
        if (cost >= ink) {
            // Pen runs dry partway along this segment: stop exactly there
            const t = ink / cost;
            p = { x: last.x + (p.x - last.x) * t, y: last.y + (p.y - last.y) * t };
            cost = ink;
            dry = true;
        }
        ink -= cost;
        currentStroke.cost += cost;
        currentStroke.len += Math.hypot(p.x - last.x, p.y - last.y);
        currentStroke.points.push(p);
        GameAudio.SFX.draw();
        if (dry) {
            ink = 0;
            endStroke();
        }
    }

    function clampToPlayArea(pos) {
        const area = Renderer.getPlayArea();
        return {
            x: Math.max(area.x, Math.min(area.x + area.w, pos.x)),
            y: Math.max(area.y, Math.min(area.y + area.h, pos.y)),
        };
    }

    // Returns the start point when the stroke was really a tap (discarded,
    // ink refunded) so the caller can treat it as one; otherwise null.
    function endStroke() {
        const s = currentStroke;
        currentStroke = null;
        if (!s) return null;
        if (s.len < 8 * dpr) {
            ink = Math.min(CONFIG.INK_MAX, ink + s.cost);
            return s.points[0];
        }
        s.fading = false;
        s.opacity = 1;
        s.fadeStart = null;
        lines.push(s);
        strokeCount++;
        return null;
    }

    function cancelStroke() {
        if (!currentStroke) return;
        ink = Math.min(CONFIG.INK_MAX, ink + currentStroke.cost);
        currentStroke = null;
    }

    function removeLine(line) {
        const i = lines.indexOf(line);
        if (i < 0) return false;
        lines.splice(i, 1);
        ink = Math.min(CONFIG.INK_MAX, ink + (line.cost || 0) * CONFIG.UNDO_REFUND);
        return true;
    }

    function undoLast() {
        return lines.length ? removeLine(lines[lines.length - 1]) : false;
    }

    // Newest line passing within r of pos (canvas px)
    function lineAt(pos, r) {
        for (let i = lines.length - 1; i >= 0; i--) {
            const pts = lines[i].points;
            for (let j = 1; j < pts.length; j++) {
                if (segDist(pos.x, pos.y, pts[j - 1], pts[j]) < r) return lines[i];
            }
        }
        return null;
    }

    function segDist(px, py, a, b) {
        const dx = b.x - a.x, dy = b.y - a.y;
        const l2 = dx * dx + dy * dy;
        let t = l2 ? ((px - a.x) * dx + (py - a.y) * dy) / l2 : 0;
        t = Math.max(0, Math.min(1, t));
        return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy));
    }

    // Keep lines glued to the paper when the play area changes (rotation)
    function remap(oldA, newA) {
        const map = (p) => {
            p.x = newA.x + (p.x - oldA.x) / oldA.w * newA.w;
            p.y = newA.y + (p.y - oldA.y) / oldA.h * newA.h;
        };
        for (const l of lines) l.points.forEach(map);
        if (currentStroke) currentStroke.points.forEach(map);
    }

    function update(dt) {
        clock += dt;
        // Regen only once the finger has lifted
        if (!currentStroke && !Input.isDrawing) {
            ink = Math.min(CONFIG.INK_MAX, ink + CONFIG.INK_REGEN_RATE * dt);
        }

        for (let i = lines.length - 1; i >= 0; i--) {
            const line = lines[i];
            const age = clock - line.createdAt;
            if (!line.fading && age > (line.fadeTime || CONFIG.LINE_FADE_TIME)) {
                line.fading = true;
                line.fadeStart = clock;
            }
            if (line.fading) {
                line.opacity = 1 - ((clock - line.fadeStart) / CONFIG.LINE_FADE_DURATION);
                if (line.opacity <= 0) lines.splice(i, 1);
            }
        }
    }

    function drawLines(ctx) {
        for (const line of lines) {
            drawStroke(ctx, line.points, line.opacity, line.width);
        }
        if (currentStroke) {
            if (currentStroke.points.length >= 2) {
                drawStroke(ctx, currentStroke.points, 1, currentStroke.width);
            }
            drawTip(ctx, currentStroke);
        }
    }

    // Pencil tip shrinks and turns red as the ink runs out
    function drawTip(ctx, s) {
        const p = s.points[s.points.length - 1];
        const f = Math.max(0, Math.min(1, ink / CONFIG.INK_MAX));
        const lw = (s.width || CONFIG.PENCIL_WIDTH) * dpr;
        const r = lw * (0.45 + 0.9 * f);
        const low = f < 0.35;
        ctx.save();
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fillStyle = low ? '#c33' : (f < 0.6 ? '#c98a2e' : CONFIG.PENCIL_COLOR);
        ctx.fill();
        if (low) {
            ctx.globalAlpha = 0.35 + 0.35 * Math.sin(performance.now() / 70);
            ctx.strokeStyle = '#c33';
            ctx.lineWidth = 1.5 * dpr;
            ctx.beginPath();
            ctx.arc(p.x, p.y, r + 4 * dpr, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.restore();
    }

    // Deterministic per-point noise (no frame-to-frame shimmer)
    function pointNoise(index, seed) {
        const h = ((index * 2654435761) ^ (seed * 1103515245)) & 0x7fffffff;
        return (h % 1000) / 1000 - 0.5;
    }

    function drawStroke(ctx, points, opacity, width) {
        if (points.length < 2) return;
        const lw = (width || CONFIG.PENCIL_WIDTH) * dpr;

        ctx.save();
        ctx.globalAlpha = opacity;
        ctx.strokeStyle = CONFIG.PENCIL_COLOR;
        ctx.lineWidth = lw;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
            ctx.lineTo(points[i].x, points[i].y);
        }
        ctx.stroke();

        // Pencil texture - slight rough edge
        ctx.globalAlpha = opacity * 0.2;
        ctx.lineWidth = lw * 1.5;
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
    function getCurrentStroke() { return currentStroke; }
    function getInk() { return ink; }
    function getInkFraction() { return ink / CONFIG.INK_MAX; }
    function getStrokeCount() { return strokeCount; }

    return {
        init, setDpr, startStroke, addPoint, endStroke, cancelStroke,
        update, drawLines, getLines, getCurrentStroke, getInk, getInkFraction,
        setBoost, getWidthMultiplier, refillInk, remap,
        removeLine, undoLast, lineAt, getStrokeCount,
        get pointCount() { return currentStroke ? currentStroke.points.length : 0; },
    };
})();
